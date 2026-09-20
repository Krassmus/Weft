import { useEffect } from "react";
import { getClipboard, setClipboard } from "../../core/document/clipboard";
import { pasteBlockInto, pastePageAfter } from "../../core/document/actions";
import { useDocumentStore } from "../../core/document/store";
import type { SelectionRef } from "../../core/document/store";
import type { Block, WeftModule } from "../../core/types";

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return (el as HTMLElement).isContentEditable;
}

function resolveSelectedBlock(content: WeftModule, selection: Extract<SelectionRef, { type: "block" }>): Block | null {
  if (selection.container.kind === "page") {
    return content.pages[selection.container.pageId]?.blocks.find((b) => b.id === selection.blockId) ?? null;
  }
  return content.layouts[selection.container.layoutId]?.blocks.find((b) => b.id === selection.blockId) ?? null;
}

/** Which page a "paste page" should land next to, given what's currently selected. */
function resolveCurrentPageId(selection: SelectionRef | null): string | null {
  if (selection?.type === "page") return selection.pageId;
  if (selection?.type === "block" && selection.container.kind === "page") return selection.container.pageId;
  return null;
}

/** Which page/layout a "paste block" should land in, given what's currently selected. */
function resolveBlockTarget(selection: SelectionRef | null): { kind: "page"; pageId: string } | { kind: "layout"; layoutId: string } | null {
  if (selection?.type === "page") return { kind: "page", pageId: selection.pageId };
  if (selection?.type === "layout") return { kind: "layout", layoutId: selection.layoutId };
  if (selection?.type === "block") return selection.container;
  return null;
}

/**
 * Cmd/Ctrl+C copies the selected page or block into an in-app clipboard (see core/document/
 * clipboard.ts); Cmd/Ctrl+V pastes it right next to whatever is currently selected. A plain
 * window keydown listener rather than React's synthetic events, since the shortcut has to fire
 * no matter which part of the editor last had focus - but it backs off whenever focus is in a
 * text input/textarea/contenteditable, so normal text copy/paste there keeps working untouched.
 */
export function useCopyPaste(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.shiftKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== "c" && key !== "v") return;
      if (isEditableTarget(document.activeElement)) return;

      const { doc, selection, select } = useDocumentStore.getState();
      const content = doc.content;

      if (key === "c") {
        if (selection?.type === "page") {
          const page = content.pages[selection.pageId];
          if (!page) return;
          setClipboard({ kind: "page", page });
          e.preventDefault();
        } else if (selection?.type === "block") {
          const block = resolveSelectedBlock(content, selection);
          if (!block) return;
          setClipboard({ kind: "block", block });
          e.preventDefault();
        }
        return;
      }

      const clip = getClipboard();
      if (!clip) return;

      if (clip.kind === "page") {
        const afterPageId = resolveCurrentPageId(selection);
        if (!afterPageId) return;
        const newPageId = pastePageAfter(afterPageId, clip.page);
        if (!newPageId) return;
        select({ type: "page", pageId: newPageId });
        e.preventDefault();
      } else {
        const target = resolveBlockTarget(selection);
        if (!target) return;
        const newBlockId = pasteBlockInto(target, clip.block);
        if (!newBlockId) return;
        select({ type: "block", container: target, blockId: newBlockId });
        e.preventDefault();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
