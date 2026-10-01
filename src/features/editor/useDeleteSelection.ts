import { useEffect } from "react";
import { removeBlock, removeBlocks, removeGroup, removeLayoutBlock, removeLogicBlock, removePage } from "../../core/document/actions";
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
        // Re-select the block's own page/layout, not null - Canvas.tsx's resolveEditTarget falls
        // back to the module's very first slide once selection is null (there's no other way for
        // it to know which slide you were even on), which used to make deleting an object jump
        // you clear back to slide 1 instead of just leaving you on the same, now object-less,
        // slide.
        if (selection.container.kind === "page") {
          removeBlock(selection.container.pageId, selection.blockId);
          select({ type: "page", pageId: selection.container.pageId });
        } else {
          removeLayoutBlock(selection.container.layoutId, selection.blockId);
          select({ type: "layout", layoutId: selection.container.layoutId });
        }
      } else if (selection.type === "page") {
        removePage(selection.pageId);
        select(null);
      } else if (selection.type === "logic") {
        removeLogicBlock(selection.logicBlockId);
        select(null);
      } else if (selection.type === "blocks") {
        removeBlocks(selection.container, selection.blockIds);
        if (selection.container.kind === "page") select({ type: "page", pageId: selection.container.pageId });
        else select({ type: "layout", layoutId: selection.container.layoutId });
      } else if (selection.type === "group") {
        removeGroup(selection.pageId, selection.groupId);
        select({ type: "page", pageId: selection.pageId });
      } else {
        return; // "layout" selection: layouts aren't individually deletable anywhere in the UI
      }

      e.preventDefault();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
