import { addBlockToPage, reorderBlock, removeBlock, removeGroup } from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";
import { BLOCK_KIND_KEYS } from "../../../core/i18n/translations";
import { useTranslation } from "../../../core/i18n/useTranslation";
import type { Block, Page } from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { useDragReorder } from "../useDragReorder";
import { LayoutPicker } from "./LayoutPicker";
import { orderedValues } from "../../../core/document/ordering";

const BLOCK_KINDS = Object.keys(BLOCK_KIND_KEYS) as Block["kind"][];

export function PagePanel({ page }: { page: Page }) {
  const { t } = useTranslation();
  const selection = useDocumentStore((s) => s.selection);
  // A language switch only makes sense in a module that offers more than one language.
  const languageCount = useDocumentStore((s) => s.doc.content.languages.length);
  const select = useDocumentStore((s) => s.select);
  const { bind } = useDragReorder();

  // A group's members are always contiguous in page.blocks (see BlockGroup's own doc comment in
  // core/types.ts) - the first member hit below renders the whole group (header + indented
  // members) in one go, and every later member of that same group is just skipped, rather than
  // re-checking page.groups on every single row.
  const renderedGroupIds = new Set<string>();

  return (
    <>
      <Collapsible title={t("panel.layout")}>
        <LayoutPicker page={page} />
      </Collapsible>

      <Collapsible title={`${t("panel.elements")} (${Object.keys(page.blocks).length})`}>
        {Object.keys(page.blocks).length > 1 && <p className="weft-hint">Ziehen zum Sortieren - weiter unten liegt weiter vorne.</p>}
        <ul className="weft-block-list">
          {orderedValues(page.blocks).map((block, index) => {
            const group = page.groups.find((g) => g.blockIds.includes(block.id));
            if (group) {
              if (renderedGroupIds.has(group.id)) return null;
              renderedGroupIds.add(group.id);
              const isGroupActive = selection?.type === "group" && selection.groupId === group.id;
              return (
                <li key={group.id} className="weft-block-group">
                  <div className="weft-block-group-header">
                    <button
                      type="button"
                      className={isGroupActive ? "is-active" : ""}
                      onClick={() => select({ type: "group", pageId: page.id, groupId: group.id })}
                    >
                      Gruppe ({group.blockIds.length})
                    </button>
                    <button
                      type="button"
                      className="weft-icon-button"
                      onClick={() => {
                        removeGroup(page.id, group.id);
                        if (isGroupActive) select({ type: "page", pageId: page.id });
                      }}
                      title={t("panel.remove")}
                    >
                      ×
                    </button>
                  </div>
                  <ul className="weft-block-group-members">
                    {group.blockIds.map((memberId) => {
                      const memberBlock = page.blocks[memberId];
                      if (!memberBlock) return null;
                      const isMemberActive =
                        selection?.type === "block" && selection.container.kind === "page" && selection.blockId === memberId;
                      return (
                        <li key={memberId}>
                          <button
                            type="button"
                            className={isMemberActive ? "is-active" : ""}
                            onClick={() => select({ type: "block", container: { kind: "page", pageId: page.id }, blockId: memberId })}
                          >
                            {t(BLOCK_KIND_KEYS[memberBlock.kind])}
                          </button>
                          <button
                            type="button"
                            className="weft-icon-button"
                            onClick={() => {
                              removeBlock(page.id, memberId);
                              if (isMemberActive) select({ type: "page", pageId: page.id });
                            }}
                            title={t("panel.remove")}
                          >
                            ×
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            }

            const { dragClassName, ...dragAttrs } = bind("block", page.id, index, (_containerId, toIndex) =>
              reorderBlock({ kind: "page", pageId: page.id }, block.id, toIndex),
            );
            return (
              <li key={block.id}>
                <button
                  type="button"
                  className={
                    (selection?.type === "block" && selection.container.kind === "page" && selection.blockId === block.id
                      ? "is-active"
                      : "") + dragClassName
                  }
                  onClick={() => select({ type: "block", container: { kind: "page", pageId: page.id }, blockId: block.id })}
                  {...dragAttrs}
                >
                  {t(BLOCK_KIND_KEYS[block.kind])}
                </button>
                <button
                  type="button"
                  className="weft-icon-button"
                  onClick={() => {
                    removeBlock(page.id, block.id);
                    // Otherwise selection keeps pointing at this now-gone block - harmless here
                    // (Canvas.tsx still resolves the same page from selection.container.pageId
                    // alone), but the Inspector would show its empty state until something else
                    // gets clicked, instead of immediately falling back to the page itself.
                    if (selection?.type === "block" && selection.blockId === block.id) {
                      select({ type: "page", pageId: page.id });
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
          {BLOCK_KINDS.filter((kind) => kind !== "language" || languageCount > 1).map((kind) => (
            <button key={kind} type="button" onClick={() => addBlockToPage(page.id, kind)}>
              + {t(BLOCK_KIND_KEYS[kind])}
            </button>
          ))}
        </div>
      </Collapsible>
    </>
  );
}
