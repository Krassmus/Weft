import { createPlaceholderText } from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";
import type { PlaceholderBlock } from "../../../core/types";
import { usePendingEdit } from "./pendingEditStore";

/**
 * A placeholder of the layout as it shows on a page that has no text for it yet: a dashed slot where the text will be (never part of
 * the module played). Clicking it makes the page's text - formatted like the placeholder - and puts the caret in it.
 */
export function PlaceholderSlot({ block, pageId }: { block: PlaceholderBlock; pageId: string }) {
  const select = useDocumentStore((s) => s.select);
  const style = {
    left: `${block.position.x}%`,
    top: `${block.position.y}%`,
    width: `${block.position.width}%`,
    height: `${block.position.height}%`,
    transform: block.position.rotation ? `rotate(${block.position.rotation}deg)` : undefined,
  };
  return (
    <div
      className="weft-edit-block weft-placeholder-slot"
      style={style}
      role="button"
      title="Klicken, um Text einzugeben"
      onClick={(event) => {
        event.stopPropagation();
        const blockId = createPlaceholderText(pageId, block.id);
        if (!blockId) return;
        select({ type: "block", container: { kind: "page", pageId }, blockId });
        usePendingEdit.getState().request(blockId);
      }}
    >
      <span className="weft-placeholder-slot-label">{block.label || "Platzhalter"} - Text eingeben</span>
    </div>
  );
}
