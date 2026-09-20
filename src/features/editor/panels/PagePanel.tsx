import { addBlockToPage, removeBlock } from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";
import type { Block, Page } from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { LayoutPicker } from "./LayoutPicker";

const BLOCK_LABELS: Record<Block["kind"], string> = {
  text: "Text",
  image: "Bild",
  iframe: "Iframe",
  button: "Button",
  quiz: "Quiz",
};

export function PagePanel({ page }: { page: Page }) {
  const selection = useDocumentStore((s) => s.selection);
  const select = useDocumentStore((s) => s.select);

  return (
    <>
      <Collapsible title="Layout">
        <LayoutPicker page={page} />
      </Collapsible>

      <Collapsible title={`Elemente (${page.blocks.length})`}>
        <ul className="weft-block-list">
          {page.blocks.map((block) => (
            <li key={block.id}>
              <button
                type="button"
                className={
                  selection?.type === "block" && selection.container.kind === "page" && selection.blockId === block.id
                    ? "is-active"
                    : ""
                }
                onClick={() => select({ type: "block", container: { kind: "page", pageId: page.id }, blockId: block.id })}
              >
                {BLOCK_LABELS[block.kind]}
              </button>
              <button type="button" className="weft-icon-button" onClick={() => removeBlock(page.id, block.id)} title="Entfernen">
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="weft-add-block-row">
          {(Object.keys(BLOCK_LABELS) as Block["kind"][]).map((kind) => (
            <button key={kind} type="button" onClick={() => addBlockToPage(page.id, kind)}>
              + {BLOCK_LABELS[kind]}
            </button>
          ))}
        </div>
      </Collapsible>
    </>
  );
}
