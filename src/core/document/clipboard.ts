import type { Block, Page } from "../types";
import { shownWordings } from "../blocks/registry";
import { orderedValues } from "./ordering";

export type ClipboardEntry = { kind: "page"; page: Page } | { kind: "block"; block: Block };

/**
 * An in-app clipboard, not the OS one - a same-session fallback for when the real OS clipboard
 * (see WEFT_CLIPBOARD_MARKER below) isn't reachable at all, e.g. navigator.clipboard.read() being
 * unsupported/denied in a particular webview. Cmd/Ctrl+C stores the copied page or block here as
 * well as writing the OS clipboard; Cmd/Ctrl+V (see useCopyPaste.ts) only ever reads this when
 * the OS clipboard read itself failed, never merely because the OS clipboard held something else -
 * see useCopyPaste.ts's own header comment for why that distinction matters.
 */
let clipboard: ClipboardEntry | null = null;

export function setClipboard(entry: ClipboardEntry) {
  clipboard = entry;
}

export function getClipboard(): ClipboardEntry | null {
  return clipboard;
}

/** Tagged prefix a page/block copy is also written to the real OS clipboard under (as plain
 * text - see useCopyPaste.ts), so a paste can tell "this is Weft's own structured data" apart
 * from ordinary text/HTML/images copied from any other application, and so it keeps working
 * across windows/launches, not just within one in-memory session. Versioned so a future format
 * change can add a "v2:" variant without either version misreading the other's payload - an
 * unrecognized version (or anything not starting with this prefix at all) is just ordinary
 * clipboard text as far as parseClipboardText is concerned. */
const WEFT_CLIPBOARD_MARKER = "weft-clipboard-v1:";

export function serializeClipboardEntry(entry: ClipboardEntry): string {
  return WEFT_CLIPBOARD_MARKER + JSON.stringify(entry);
}

/** The inverse of serializeClipboardEntry - null for anything that isn't recognizably Weft's own
 * tagged payload (plain text/HTML from another app, a differently-versioned/corrupted marker,
 * ...), which the caller treats exactly like any other non-Weft clipboard content. Only checks
 * the shape shallowly (a valid `kind` plus a present, object-typed payload) rather than fully
 * validating every field - pasteBlockInto/pastePageAfter already tolerate whatever they're
 * handed the same way they always have for the in-app clipboard above, which was never any more
 * strictly validated than this either. */
export function parseClipboardText(text: string): ClipboardEntry | null {
  if (!text.startsWith(WEFT_CLIPBOARD_MARKER)) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(WEFT_CLIPBOARD_MARKER.length));
    if (typeof parsed !== "object" || parsed === null) return null;
    const entry = parsed as Record<string, unknown>;
    if (entry.kind === "page" && typeof entry.page === "object" && entry.page !== null) return entry as ClipboardEntry;
    if (entry.kind === "block" && typeof entry.block === "object" && entry.block !== null) return entry as ClipboardEntry;
    return null;
  } catch {
    return null;
  }
}

// ---- What other programs get from a copy ------------------------------------------------------------------------------------------
//
// A copy used to put the whole structure (as JSON behind WEFT_CLIPBOARD_MARKER) into the clipboard as its text - which is what a paste into
// any other program showed. Now the clipboard holds two things: the text of what was copied, as plain text and as a few paragraphs of HTML
// (what a text editor or a word processor takes), and - hidden in an attribute of that HTML, where nobody sees it - the structure, which
// is how a paste into Weft finds its own data again (see parseClipboardHtml). The old marker text is still understood.

/** The words of an HTML text as lines of plain text: one line for each paragraph, line break and list item. */
function plainLinesOfHtml(html: string): string[] {
  const body = new DOMParser().parseFromString(html, "text/html").body;
  body.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  body.querySelectorAll("p, div, li, h1, h2, h3, h4, h5, h6").forEach((el) => el.append("\n"));
  return (body.textContent ?? "")
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.trim());
}

/** The text of one block - what a reader of the slide would read in it - as lines. */
function blockLines(block: Block): string[] {
  switch (block.kind) {
    default:
      // (A block that describes itself says which of its texts are seen.)
      return shownWordings(block)
        .flatMap(({ own, html }) => (html ? plainLinesOfHtml(own) : [own]))
        .filter((text) => text.trim() !== "");
  }
}

/** The text of a copy as plain text: the words of the block or of every block of the page (paragraphs apart, no empty ones at the ends). */
export function clipboardEntryPlainText(entry: ClipboardEntry): string {
  const groups = entry.kind === "block" ? [blockLines(entry.block)] : orderedValues(entry.page.blocks).map(blockLines);
  const text = groups
    .map((lines) => lines.join("\n").replace(/\n{3,}/g, "\n\n").trim())
    .filter((group) => group !== "")
    .join("\n\n");
  return text;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

function fromBase64(base64: string): string {
  const binary = atob(base64);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

const WEFT_CLIPBOARD_ATTRIBUTE = "data-weft-clipboard";

/** The copy as HTML: its paragraphs, and the structure (see serializeClipboardEntry) in an attribute of the container. */
export function clipboardEntryHtml(entry: ClipboardEntry): string {
  const paragraphs = clipboardEntryPlainText(entry)
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph !== "")
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div ${WEFT_CLIPBOARD_ATTRIBUTE}="${toBase64(serializeClipboardEntry(entry))}">${paragraphs}</div>`;
}

/** The inverse of clipboardEntryHtml - null for HTML from anywhere else. */
export function parseClipboardHtml(html: string): ClipboardEntry | null {
  const holder = new DOMParser().parseFromString(html, "text/html").querySelector(`[${WEFT_CLIPBOARD_ATTRIBUTE}]`);
  const encoded = holder?.getAttribute(WEFT_CLIPBOARD_ATTRIBUTE);
  if (!encoded) return null;
  try {
    return parseClipboardText(fromBase64(encoded));
  } catch {
    return null;
  }
}
