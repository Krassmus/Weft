import { useEffect, useState } from "react";
import { moveBlockOneStep, reorderBlock, removeBlock, removeGroup, setPageNotes } from "../../../core/document/actions";
import { announceStatus } from "../../../core/accessibility/statusAnnouncer";
import { confirmDestructive } from "../../../core/io/fileIO";
import { useDocumentStore } from "../../../core/document/store";
import { BLOCK_KIND_KEYS } from "../../../core/i18n/translations";
import { useTranslation } from "../../../core/i18n/useTranslation";
import type { Page } from "../../../core/types";
import { BlockKindIcon } from "../BlockKindIcon";
import { listHoverProps, useClearListHoverOnUnmount } from "../listHover";
import { Collapsible } from "../Collapsible";
import { useDragReorder } from "../useDragReorder";
import { LayoutPicker } from "./LayoutPicker";
import { orderedValues } from "../../../core/document/ordering";
import { tr } from "../../../core/i18n/tr";
import { pageNotes } from "../../../core/document/translations";
import { useEditingLanguage } from "../useEditingLanguage";

/** The notes for whoever presents (Page.notes) - a text field that is stored when it loses the focus (one undo step, not one per letter). */
function PresenterNotes({ page }: { page: Page }) {
  const { lang, defaultLang } = useEditingLanguage();
  const stored = pageNotes(page, lang, defaultLang);
  const [text, setText] = useState(stored);
  // Another slide, another language, or a change from somebody else: the field shows what is stored.
  useEffect(() => setText(stored), [page.id, lang, stored]);
  return (
    <textarea
      className="weft-presenter-notes"
      rows={7}
      value={text}
      placeholder={tr("ui.presenter_notes_placeholder")}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== stored) setPageNotes(page.id, text, lang, defaultLang);
      }}
    />
  );
}

/** Alt+↑/↓ on a row of the element list: the element one level toward the front / the back (the list is the stacking order turned around: the
 * top row is the front). The focus stays on the row, which may have been made anew. */
function onElementRowKeyDown(event: React.KeyboardEvent<HTMLElement>, pageId: string, blockId: string) {
  if (!event.altKey || event.metaKey || event.ctrlKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
  event.preventDefault();
  event.nativeEvent.stopPropagation();
  const forward = event.key === "ArrowUp";
  if (!moveBlockOneStep({ kind: "page", pageId }, blockId, forward ? "forward" : "back")) return;
  announceStatus(tr(forward ? "ui.status_forward" : "ui.status_backward"));
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-block-row="${CSS.escape(blockId)}"]`)?.focus({ preventScroll: true }));
}

export function PagePanel({ page }: { page: Page }) {
  const { t } = useTranslation();
  const selection = useDocumentStore((s) => s.selection);
  const select = useDocumentStore((s) => s.select);
  useClearListHoverOnUnmount();
  const { bind } = useDragReorder();

  // A group's members are always contiguous in page.blocks (see BlockGroup's own doc comment in
  // core/types.ts) - the first member hit below renders the whole group (header + indented
  // members) in one go, and every later member of that same group is just skipped, rather than
  // re-checking page.groups on every single row.
  const renderedGroupIds = new Set<string>();
  // The topmost element (the one in front) is the first row, as in other programs: the list is the stacking order turned around.
  const stacked = orderedValues(page.blocks);
  const shownBlocks = [...stacked].reverse();

  return (
    <>
      <Collapsible title={t("panel.layout")}>
        <LayoutPicker page={page} />
      </Collapsible>

      <Collapsible title={tr("ui.presenter_notes")} defaultOpen={!!page.notes}>
        <p className="weft-hint">{tr("ui.presenter_notes_hint")}</p>
        <PresenterNotes page={page} />
      </Collapsible>

      <Collapsible title={`${t("panel.elements")} (${Object.keys(page.blocks).length})`}>
        {Object.keys(page.blocks).length > 1 && <p className="weft-hint">{tr("ui.drag_to_sort_further_up_is")}</p>}
        <ul className="weft-block-list">
          {shownBlocks.map((block, index) => {
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
                      {...listHoverProps(group.blockIds)}
                    >
                      Gruppe ({group.blockIds.length})
                    </button>
                    <button
                      type="button"
                      className="weft-icon-button"
                      onClick={() => {
                        void confirmDestructive(tr("ui.really_delete_group", { n: group.blockIds.length }), tr("ui.delete_group")).then((ok) => {
                          if (!ok) return;
                          removeGroup(page.id, group.id);
                          if (isGroupActive) select({ type: "page", pageId: page.id });
                        });
                      }}
                      title={t("panel.remove")}
                    >
                      ×
                    </button>
                  </div>
                  <ul className="weft-block-group-members">
                    {shownBlocks.filter((b) => group.blockIds.includes(b.id)).map(({ id: memberId }) => {
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
                            onKeyDown={(e) => onElementRowKeyDown(e, page.id, memberId)}
                            data-block-row={memberId}
                            {...listHoverProps([memberId])}
                          >
                            <BlockKindIcon kind={memberBlock.kind} size={16} />
                            {t(BLOCK_KIND_KEYS[memberBlock.kind])}
                          </button>
                          <button
                            type="button"
                            className="weft-icon-button"
                            onClick={() => {
                              void confirmDestructive(tr("ui.really_delete_element"), tr("ui.delete_element")).then((ok) => {
                                if (!ok) return;
                                removeBlock(page.id, memberId);
                                if (isMemberActive) select({ type: "page", pageId: page.id });
                              });
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
              reorderBlock({ kind: "page", pageId: page.id }, block.id, stacked.length - 1 - toIndex),
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
                  onKeyDown={(e) => onElementRowKeyDown(e, page.id, block.id)}
                  data-block-row={block.id}
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
                    void confirmDestructive(tr("ui.really_delete_element"), tr("ui.delete_element")).then((ok) => {
                      if (!ok) return;
                      removeBlock(page.id, block.id);
                      // Otherwise selection keeps pointing at this now-gone block - harmless here
                      // (Canvas.tsx still resolves the same page from selection.container.pageId
                      // alone), but the Inspector would show its empty state until something else
                      // gets clicked, instead of immediately falling back to the page itself.
                      if (selection?.type === "block" && selection.blockId === block.id) {
                        select({ type: "page", pageId: page.id });
                      }
                    });
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
