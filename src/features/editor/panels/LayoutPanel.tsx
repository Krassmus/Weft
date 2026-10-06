import { addBlockToLayout, reorderBlock, removeLayoutBlock, renameLayout } from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";
import { BLOCK_KIND_KEYS } from "../../../core/i18n/translations";
import { useTranslation } from "../../../core/i18n/useTranslation";
import type { Layout, StaticBlock } from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { useDragReorder } from "../useDragReorder";
import { orderedValues } from "../../../core/document/ordering";

const STATIC_BLOCK_KINDS = Object.keys(BLOCK_KIND_KEYS).filter((kind) => kind !== "quiz") as StaticBlock["kind"][];

export function LayoutPanel({ layout }: { layout: Layout }) {
  const { t } = useTranslation();
  const selection = useDocumentStore((s) => s.selection);
  const select = useDocumentStore((s) => s.select);
  const languageCount = useDocumentStore((s) => s.doc.content.languages.length);
  const { bind } = useDragReorder();

  return (
    <>
      <Collapsible title={t("panel.layout")}>
        <p className="weft-hint">{t("panel.layout.hint")}</p>
        <label className="weft-field">
          <span>{t("panel.layout.name")}</span>
          <input value={layout.name} onChange={(e) => renameLayout(layout.id, e.target.value)} />
        </label>
      </Collapsible>

      <Collapsible title={`${t("panel.elements")} (${Object.keys(layout.blocks).length})`}>
        {Object.keys(layout.blocks).length > 1 && <p className="weft-hint">Ziehen zum Sortieren - weiter unten liegt weiter vorne.</p>}
        <ul className="weft-block-list">
          {orderedValues(layout.blocks).map((block, index) => {
            const { dragClassName, ...dragAttrs } = bind("block", layout.id, index, (_containerId, toIndex) =>
              reorderBlock({ kind: "layout", layoutId: layout.id }, block.id, toIndex),
            );
            return (
              <li key={block.id}>
                <button
                  type="button"
                  className={
                    (selection?.type === "block" &&
                    selection.container.kind === "layout" &&
                    selection.container.layoutId === layout.id &&
                    selection.blockId === block.id
                      ? "is-active"
                      : "") + dragClassName
                  }
                  onClick={() => select({ type: "block", container: { kind: "layout", layoutId: layout.id }, blockId: block.id })}
                  {...dragAttrs}
                >
                  {t(BLOCK_KIND_KEYS[block.kind])}
                </button>
                <button
                  type="button"
                  className="weft-icon-button"
                  onClick={() => {
                    removeLayoutBlock(layout.id, block.id);
                    if (
                      selection?.type === "block" &&
                      selection.container.kind === "layout" &&
                      selection.blockId === block.id
                    ) {
                      select({ type: "layout", layoutId: layout.id });
                    }
                  }}
                  title={t("panel.remove")}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
        <div className="weft-add-block-row">
          {STATIC_BLOCK_KINDS.filter((kind) => kind !== "language" || languageCount > 1).map((kind) => (
            <button key={kind} type="button" onClick={() => addBlockToLayout(layout.id, kind)}>
              + {t(BLOCK_KIND_KEYS[kind])}
            </button>
          ))}
        </div>
      </Collapsible>
    </>
  );
}
