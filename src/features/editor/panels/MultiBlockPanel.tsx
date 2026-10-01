import { groupBlocks } from "../../../core/document/actions";
import type { BlockContainerRef } from "../../../core/document/store";
import { useDocumentStore } from "../../../core/document/store";

/**
 * Shown while several blocks are selected but not yet grouped (SelectionRef's "blocks" variant -
 * Shift+Click or a marquee drag on the canvas, see Canvas.tsx). Its one real job is the
 * "Gruppieren" button, mirroring the same action the canvas's own right-click context menu offers
 * - grouping is page-only (see BlockGroup in core/types.ts), so the button is simply absent for a
 * layout's multi-selection rather than shown disabled.
 */
export function MultiBlockPanel({ container, blockIds }: { container: BlockContainerRef; blockIds: string[] }) {
  const select = useDocumentStore((s) => s.select);

  function group() {
    if (container.kind !== "page") return;
    const groupId = groupBlocks(container.pageId, blockIds);
    if (groupId) select({ type: "group", pageId: container.pageId, groupId });
  }

  return (
    <div className="weft-multi-block-panel">
      <p className="weft-hint">{blockIds.length} Objekte ausgewählt</p>
      {container.kind === "page" && (
        <button type="button" className="weft-primary-button weft-full-width" onClick={group}>
          Objekte gruppieren
        </button>
      )}
    </div>
  );
}
