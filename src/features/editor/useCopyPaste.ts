import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Image as TauriImage } from "@tauri-apps/api/image";
import { readImage as readOsImage } from "@tauri-apps/plugin-clipboard-manager";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  addImageBlockToLayout,
  addImageBlockToPage,
  pasteBlockInto,
  pastePageAfter,
  pasteTextBlockInto,
  removeBlock,
  removeLayoutBlock,
  removePage,
} from "../../core/document/actions";
import type { ClipboardEntry } from "../../core/document/clipboard";
import { getClipboard, parseClipboardText, serializeClipboardEntry, setClipboard } from "../../core/document/clipboard";
import { useDocumentStore } from "../../core/document/store";
import type { BlockContainerRef, SelectionRef } from "../../core/document/store";
import { isTauri } from "../../core/io/fileIO";
import type { Block, WeftModule } from "../../core/types";

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return (el as HTMLElement).isContentEditable;
}

function resolveSelectedBlock(content: WeftModule, selection: Extract<SelectionRef, { type: "block" }>): Block | null {
  if (selection.container.kind === "page") {
    return content.pages[selection.container.pageId]?.blocks[selection.blockId] ?? null;
  }
  return content.layouts[selection.container.layoutId]?.blocks[selection.blockId] ?? null;
}

/** Which page a "paste page" should land next to, given what's currently selected. */
function resolveCurrentPageId(selection: SelectionRef | null): string | null {
  if (selection?.type === "page") return selection.pageId;
  if (selection?.type === "block" && selection.container.kind === "page") return selection.container.pageId;
  return null;
}

/** Which page/layout a "paste block/image/text" should land in, given what's currently selected. */
function resolveBlockTarget(selection: SelectionRef | null): BlockContainerRef | null {
  if (selection?.type === "page") return { kind: "page", pageId: selection.pageId };
  if (selection?.type === "layout") return { kind: "layout", layoutId: selection.layoutId };
  if (selection?.type === "block") return selection.container;
  return null;
}

// Starting footprint for a pasted image, centered on the slide - there's no cursor position to
// center on the way a drag-drop has (see Canvas.tsx's own dropPosition). addImageBlockToPage/
// addImageBlockToLayout immediately reshape it to the image's own aspect ratio (see fitToAspect
// in document/actions.ts), so only the starting area matters. Same numbers as Canvas.tsx's
// DROP_MEDIA_WIDTH/HEIGHT so a pasted image starts at the same size a dropped one does.
const PASTE_MEDIA_WIDTH = 40;
const PASTE_MEDIA_HEIGHT = 30;
// Several files copied from Finder at once (see pasteClipboardFiles) cascade each further one a
// bit, same idea as offsetPosition's own paste-a-block nudge in document/actions.ts, so they
// don't land in one exact pile.
const PASTE_CASCADE_PERCENT = 4;

function centeredPastePosition(cascadeIndex = 0) {
  const offset = cascadeIndex * PASTE_CASCADE_PERCENT;
  return {
    x: 50 - PASTE_MEDIA_WIDTH / 2 + offset,
    y: 50 - PASTE_MEDIA_HEIGHT / 2 + offset,
    width: PASTE_MEDIA_WIDTH,
    height: PASTE_MEDIA_HEIGHT,
  };
}

// Extensions read_clipboard_file_paths' results are checked against - anything else on the
// clipboard's file list (a .pdf, a folder, ...) is left for the next paste strategy to handle
// instead of being force-fit into an image block.
const IMAGE_FILE_EXTENSIONS: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
};

function imageMimeTypeForPath(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase();
  return (ext && IMAGE_FILE_EXTENSIONS[ext]) || null;
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() || "bild";
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/** Wraps plain clipboard text as one <p> per line, HTML-escaped - deliberately never the
 * clipboard's own text/html representation (a webpage's or email's markup, its own inline styles
 * and all), which pasteFromClipboard doesn't even look at. Unlike pasting into an existing text
 * block's own content on-canvas - a real contentEditable paste, sanitized by the browser's own
 * paste pipeline before it ever reaches this app's code - this path would otherwise assign
 * arbitrary external markup straight into a new block's `html` and render it completely
 * unsanitized (every block's `html` is trusted, unescaped content everywhere else in this
 * codebase - see BlockView.tsx/player.runtime.js's own `innerHTML = block.html`), so only the
 * safe plain-text form is ever used to build one here. */
function textToParagraphs(text: string): string {
  const lines = text.split(/\r\n|\r|\n/).filter((line) => line.length > 0);
  return (lines.length > 0 ? lines : [text]).map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

function pasteEntry(entry: ClipboardEntry, selection: SelectionRef | null): void {
  const { select } = useDocumentStore.getState();
  if (entry.kind === "page") {
    const afterPageId = resolveCurrentPageId(selection);
    if (!afterPageId) return;
    const newPageId = pastePageAfter(afterPageId, entry.page);
    if (newPageId) select({ type: "page", pageId: newPageId });
  } else {
    const target = resolveBlockTarget(selection);
    if (!target) return;
    const newBlockId = pasteBlockInto(target, entry.block);
    if (newBlockId) select({ type: "block", container: target, blockId: newBlockId });
  }
}

async function pasteImageBlob(
  blob: Blob,
  selection: SelectionRef | null,
  fileName = "eingefügtes-bild.png",
  cascadeIndex = 0,
): Promise<void> {
  const target = resolveBlockTarget(selection);
  if (!target) return;
  const { select } = useDocumentStore.getState();
  const file = new File([blob], fileName, { type: blob.type || "image/png" });
  const position = centeredPastePosition(cascadeIndex);
  const blockId =
    target.kind === "page"
      ? await addImageBlockToPage(target.pageId, file, position)
      : await addImageBlockToLayout(target.layoutId, file, position);
  select({ type: "block", container: target, blockId });
}

/**
 * Cmd+C on one or more files in Finder puts a *file reference* on the OS pasteboard, not pixel
 * data - tauri-plugin-clipboard-manager's readImage() (see pasteFromClipboard) still "succeeds"
 * against that, but with the generic per-extension icon macOS synthesizes as a fallback "image"
 * representation, never the actual photo (confirmed against the real app - that's what showed up
 * as a plain "jpg" placeholder box instead of the picture that was copied). read_clipboard_file_
 * paths (src-tauri/src/lib.rs) reads the real path list off the pasteboard instead, via arboard's
 * own file_list() support - which the clipboard-manager plugin's own JS API doesn't expose at
 * all - so the actual file can be loaded from disk with its original bytes/format intact, exactly
 * like picking it via the file input already does. Silently does nothing (false) when the
 * clipboard holds no file reference, or none of the files it does hold look like an image by
 * extension - the caller falls through to the next paste strategy exactly the same either way.
 */
async function pasteClipboardFiles(selection: SelectionRef | null): Promise<boolean> {
  const paths = await invoke<string[]>("read_clipboard_file_paths");
  const imagePaths = paths.filter((path) => imageMimeTypeForPath(path));
  if (imagePaths.length === 0) return false;
  for (let i = 0; i < imagePaths.length; i++) {
    const path = imagePaths[i];
    const mimeType = imageMimeTypeForPath(path);
    if (!mimeType) continue;
    const bytes = await readFile(path);
    const blob = new Blob([bytes as BlobPart], { type: mimeType });
    await pasteImageBlob(blob, selection, fileNameFromPath(path), i);
  }
  return true;
}

function pasteOsText(text: string, selection: SelectionRef | null): void {
  const target = resolveBlockTarget(selection);
  if (!target) return;
  const { select } = useDocumentStore.getState();
  const blockId = pasteTextBlockInto(target, textToParagraphs(text));
  select({ type: "block", container: target, blockId });
}

/** Re-encodes a clipboard-manager Image (raw RGBA pixels, see readImage below) as a PNG Blob via
 * an offscreen canvas - addImageBlockToPage/addImageBlockToLayout (see pasteImageBlob) expect a
 * regular image File, the same thing a picked or dropped file already is, not the plugin's own
 * Rust-backed Image handle. */
async function tauriImageToPngBlob(image: TauriImage): Promise<Blob> {
  const { width, height } = await image.size();
  const rgba = await image.rgba();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D-Canvas-Kontext nicht verfügbar");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("canvas.toBlob lieferte null"))), "image/png");
  });
}

/**
 * Reads the real OS clipboard first - a Weft page/block this window or a *different* Weft
 * window/launch copied (see WEFT_CLIPBOARD_MARKER in clipboard.ts), an image copied from any
 * other app (Keynote, Preview, a browser, Finder, ...), or plain text - and only falls back to
 * the in-app clipboard (see clipboard.ts) when the OS read itself fails outright (unsupported or
 * denied), never merely because the OS clipboard happens to hold something that isn't Weft's own
 * data. That distinction matters: whatever's actually on the OS clipboard is, by construction,
 * the single most recently copied thing from *any* source (an external copy always overwrites
 * what a prior Weft copy wrote there, exactly like copying in any two ordinary applications
 * does), so treating the in-app clipboard as equally authoritative whenever it's merely
 * non-empty would let a stale Weft copy silently win over something genuinely copied more
 * recently outside the app.
 *
 * An image is checked first, via Tauri's own clipboard-manager plugin and read_clipboard_file_
 * paths command rather than the web Clipboard API below - confirmed against the real desktop app
 * (not just a platform-support guess): navigator.clipboard.read() reliably returns plain text
 * inside this app's WKWebView, but never exposes an image/* item at all for an image copied in
 * Keynote or a file copied in Finder, even though both plainly put image data on the real
 * pasteboard. Within that Tauri-only step, a file reference (pasteClipboardFiles - a Finder file
 * copy) is tried before raw pixel data (readImage - an in-app "Copy" of an image object, e.g. in
 * Keynote, or a screenshot): readImage() "succeeds" against a Finder file copy too, but only with
 * the generic per-extension icon macOS synthesizes as a fallback "image" representation for it,
 * never the actual photo - see pasteClipboardFiles' own doc comment. Neither finding anything
 * falls through to the marker/OS-text handling below exactly like it would if this whole step
 * weren't here first.
 */
async function pasteFromClipboard(): Promise<void> {
  const { selection } = useDocumentStore.getState();

  if (isTauri()) {
    if (await pasteClipboardFiles(selection)) return;
    try {
      await pasteImageBlob(await tauriImageToPngBlob(await readOsImage()), selection);
      return;
    } catch {
      // No image on the clipboard right now - fall through to the marker/OS-image/text handling
      // below, same as any other path that found nothing to paste.
    }
  }

  try {
    const items = await navigator.clipboard.read();
    let fallbackText: string | null = null;
    for (const item of items) {
      if (item.types.includes("text/plain")) {
        const text = await (await item.getType("text/plain")).text();
        const entry = parseClipboardText(text);
        if (entry) {
          pasteEntry(entry, selection);
          return;
        }
        if (fallbackText === null) fallbackText = text;
      }
      const imageType = item.types.find((t) => t.startsWith("image/"));
      if (imageType) {
        await pasteImageBlob(await item.getType(imageType), selection);
        return;
      }
    }
    if (fallbackText !== null && fallbackText.trim()) pasteOsText(fallbackText, selection);
  } catch {
    // navigator.clipboard.read() unsupported or denied here (some webviews only implement
    // readText, or the page/window isn't focused) - the best available fallback without real OS
    // access is the in-app clipboard, exactly how this worked before OS integration existed.
    const clip = getClipboard();
    if (clip) pasteEntry(clip, selection);
  }
}

/**
 * Cmd/Ctrl+C copies the selected page or block into both the in-app clipboard (see
 * core/document/clipboard.ts) and, best-effort, the real OS clipboard as tagged text (see
 * WEFT_CLIPBOARD_MARKER) - so Cmd/Ctrl+V can paste it back not just in this same session, but
 * from a different Weft window, or after relaunching the app. Cmd/Ctrl+X does the same but also
 * removes the original (like Delete, see useDeleteSelection.ts, plus clearing the now-stale
 * selection). Cmd/Ctrl+V pastes right next to whatever is currently selected - see
 * pasteFromClipboard for the full priority order between a Weft page/block, an image, and plain
 * text, all copied from anywhere on the system, not just from within Weft.
 *
 * A plain window keydown listener rather than React's synthetic events, since the shortcut has
 * to fire no matter which part of the editor last had focus - but it backs off whenever focus is
 * in a text input/textarea/contenteditable, so normal text copy/cut/paste there keeps working
 * untouched (including pasting rich text into an existing text/quiz block, which goes through the
 * browser's own native, already-sanitizing contentEditable paste, never through this hook at
 * all).
 */
export function useCopyPaste(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.shiftKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== "c" && key !== "v" && key !== "x") return;
      if (isEditableTarget(document.activeElement)) return;

      const { doc, selection, select } = useDocumentStore.getState();
      const content = doc.content;

      if (key === "c" || key === "x") {
        let entry: ClipboardEntry | null = null;
        if (selection?.type === "page") {
          const page = content.pages[selection.pageId];
          if (page) entry = { kind: "page", page };
        } else if (selection?.type === "block") {
          const block = resolveSelectedBlock(content, selection);
          if (block) entry = { kind: "block", block };
        }
        if (!entry) return;

        setClipboard(entry);
        // Best-effort: a failed/denied OS write still leaves the in-app clipboard above working
        // for the rest of this session, exactly like before OS integration existed.
        navigator.clipboard?.writeText(serializeClipboardEntry(entry))?.catch(() => {});

        if (key === "x") {
          if (selection?.type === "page") removePage(selection.pageId);
          else if (selection?.type === "block") {
            if (selection.container.kind === "page") removeBlock(selection.container.pageId, selection.blockId);
            else removeLayoutBlock(selection.container.layoutId, selection.blockId);
          }
          select(null);
        }
        e.preventDefault();
        return;
      }

      // "v" - isEditableTarget already ruled out a native paste being interrupted here.
      e.preventDefault();
      void pasteFromClipboard();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
