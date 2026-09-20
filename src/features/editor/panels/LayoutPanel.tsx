import { addBlockToLayout, removeLayoutBlock, renameLayout } from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";
import type { Layout, StaticBlock } from "../../../core/types";
import { Collapsible } from "../Collapsible";

const STATIC_BLOCK_LABELS: Record<StaticBlock["kind"], string> = {
  text: "Text",
  image: "Bild",
  iframe: "Iframe",
  button: "Button",
};

export function LayoutPanel({ layout }: { layout: Layout }) {
  const selection = useDocumentStore((s) => s.selection);
  const select = useDocumentStore((s) => s.select);

  return (
    <>
      <Collapsible title="Layout">
        <p className="weft-hint">
          Ein Layout ist wie eine Folie, aber ohne interaktive Elemente – es dient als Vorlage für Folien.
        </p>
        <label className="weft-field">
          <span>Name</span>
          <input value={layout.name} onChange={(e) => renameLayout(layout.id, e.target.value)} />
        </label>
      </Collapsible>

      <Collapsible title={`Elemente (${layout.blocks.length})`}>
        <ul className="weft-block-list">
          {layout.blocks.map((block) => (
            <li key={block.id}>
              <button
                type="button"
                className={
                  selection?.type === "block" &&
                  selection.container.kind === "layout" &&
                  selection.container.layoutId === layout.id &&
                  selection.blockId === block.id
                    ? "is-active"
                    : ""
                }
                onClick={() => select({ type: "block", container: { kind: "layout", layoutId: layout.id }, blockId: block.id })}
              >
                {STATIC_BLOCK_LABELS[block.kind]}
              </button>
              <button
                type="button"
                className="weft-icon-button"
                onClick={() => removeLayoutBlock(layout.id, block.id)}
                title="Entfernen"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="weft-add-block-row">
          {(Object.keys(STATIC_BLOCK_LABELS) as StaticBlock["kind"][]).map((kind) => (
            <button key={kind} type="button" onClick={() => addBlockToLayout(layout.id, kind)}>
              + {STATIC_BLOCK_LABELS[kind]}
            </button>
          ))}
        </div>
      </Collapsible>
    </>
  );
}
