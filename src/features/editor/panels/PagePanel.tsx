import { addBlockToPage, removeBlock } from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";
import { BLOCK_KIND_KEYS } from "../../../core/i18n/translations";
import { useTranslation } from "../../../core/i18n/useTranslation";
import type { Block, Page } from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { LayoutPicker } from "./LayoutPicker";

const BLOCK_KINDS = Object.keys(BLOCK_KIND_KEYS) as Block["kind"][];

export function PagePanel({ page }: { page: Page }) {
  const { t } = useTranslation();
  const selection = useDocumentStore((s) => s.selection);
  const select = useDocumentStore((s) => s.select);

  return (
    <>
      <Collapsible title={t("panel.layout")}>
        <LayoutPicker page={page} />
      </Collapsible>

      <Collapsible title={`${t("panel.elements")} (${page.blocks.length})`}>
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
                {t(BLOCK_KIND_KEYS[block.kind])}
              </button>
              <button
                type="button"
                className="weft-icon-button"
                onClick={() => removeBlock(page.id, block.id)}
                title={t("panel.remove")}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="weft-add-block-row">
          {BLOCK_KINDS.map((kind) => (
            <button key={kind} type="button" onClick={() => addBlockToPage(page.id, kind)}>
              + {t(BLOCK_KIND_KEYS[kind])}
            </button>
          ))}
        </div>
      </Collapsible>
    </>
  );
}
