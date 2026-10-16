import { reorderBlock, removeLayoutBlock, renameLayout } from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";
import { BLOCK_KIND_KEYS } from "../../../core/i18n/translations";
import { useTranslation } from "../../../core/i18n/useTranslation";
import type { Layout } from "../../../core/types";
import { BlockKindIcon } from "../BlockKindIcon";
import { listHoverProps, useClearListHoverOnUnmount } from "../listHover";
import { Collapsible } from "../Collapsible";
import { useDragReorder } from "../useDragReorder";
import { orderedValues } from "../../../core/document/ordering";
import { tr } from "../../../core/i18n/tr";

export function LayoutPanel({ layout }: { layout: Layout }) {
  const { t } = useTranslation();
  const selection = useDocumentStore((s) => s.selection);
  const select = useDocumentStore((s) => s.select);
  useClearListHoverOnUnmount();
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
        {Object.keys(layout.blocks).length > 1 && <p className="weft-hint">{tr("ui.drag_to_sort_further_down_is")}</p>}
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
                  {...listHoverProps([block.id])}
                  {...dragAttrs}
                >
                  <BlockKindIcon kind={block.kind} size={16} />
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
      </Collapsible>
    </>
  );
}
