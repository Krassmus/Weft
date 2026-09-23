import { addBlockToLayout, removeLayoutBlock, renameLayout } from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";
import { BLOCK_KIND_KEYS } from "../../../core/i18n/translations";
import { useTranslation } from "../../../core/i18n/useTranslation";
import type { Layout, StaticBlock } from "../../../core/types";
import { Collapsible } from "../Collapsible";

const STATIC_BLOCK_KINDS = Object.keys(BLOCK_KIND_KEYS).filter((kind) => kind !== "quiz") as StaticBlock["kind"][];

export function LayoutPanel({ layout }: { layout: Layout }) {
  const { t } = useTranslation();
  const selection = useDocumentStore((s) => s.selection);
  const select = useDocumentStore((s) => s.select);

  return (
    <>
      <Collapsible title={t("panel.layout")}>
        <p className="weft-hint">{t("panel.layout.hint")}</p>
        <label className="weft-field">
          <span>{t("panel.layout.name")}</span>
          <input value={layout.name} onChange={(e) => renameLayout(layout.id, e.target.value)} />
        </label>
      </Collapsible>

      <Collapsible title={`${t("panel.elements")} (${layout.blocks.length})`}>
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
                {t(BLOCK_KIND_KEYS[block.kind])}
              </button>
              <button
                type="button"
                className="weft-icon-button"
                onClick={() => removeLayoutBlock(layout.id, block.id)}
                title={t("panel.remove")}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="weft-add-block-row">
          {STATIC_BLOCK_KINDS.map((kind) => (
            <button key={kind} type="button" onClick={() => addBlockToLayout(layout.id, kind)}>
              + {t(BLOCK_KIND_KEYS[kind])}
            </button>
          ))}
        </div>
      </Collapsible>
    </>
  );
}
