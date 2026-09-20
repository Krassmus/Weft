import { useEffect } from "react";
import { removeBlock, removeLayoutBlock, removeLogicBlock, removePage } from "../../core/document/actions";
import { useDocumentStore } from "../../core/document/store";

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return (el as HTMLElement).isContentEditable;
}

/**
 * Delete/Backspace removes whatever is currently selected - a block, a page, or a logic block -
 * mirroring the Sidebar's own right-click "Löschen" entries so deleting doesn't require the menu.
 * Backs off in a text input/textarea/contenteditable, same as useCopyPaste, so normal text
 * editing (deleting characters) keeps working untouched.
 */
export function useDeleteSelection(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (isEditableTarget(document.activeElement)) return;

      const { selection, select } = useDocumentStore.getState();
      if (!selection) return;

      if (selection.type === "block") {
        if (selection.container.kind === "page") removeBlock(selection.container.pageId, selection.blockId);
        else removeLayoutBlock(selection.container.layoutId, selection.blockId);
      } else if (selection.type === "page") {
        removePage(selection.pageId);
      } else if (selection.type === "logic") {
        removeLogicBlock(selection.logicBlockId);
      } else {
        return; // "layout" selection: layouts aren't individually deletable anywhere in the UI
      }

      e.preventDefault();
      select(null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
