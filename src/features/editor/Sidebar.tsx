import { useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  addBranch,
  addLayout,
  addLogicBlockToSequence,
  addPageToBranch,
  addPageToSequence,
  movePageTo,
  moveSequenceNode,
  removeBranch,
  removePageFromBranch,
  removeSequenceNodeAt,
} from "../../core/document/actions";
import type { PageContainerRef } from "../../core/document/actions";
import { editedLayoutId, useDocumentStore } from "../../core/document/store";
import { useTranslation } from "../../core/i18n/useTranslation";
import type { LogicBlock } from "../../core/types";
import { ContextMenu, useContextMenu } from "./ContextMenu";
import type { ContextMenuItem } from "./ContextMenu";
import { SettingsTab } from "./panels/SettingsTab";
import { VariablesTab } from "./panels/VariablesTab";
import { SlideThumbnail } from "./SlideThumbnail";
import { useDragReorder } from "./useDragReorder";
import { orderedValues } from "../../core/document/ordering";
import { branchPageIds, sequenceOf } from "../../core/document/sequence";

type DragBind = ReturnType<typeof useDragReorder>["bind"];

function firstLayoutId(): string | null {
  const layouts = useDocumentStore.getState().doc.content.layouts;
  const first = Object.keys(layouts)[0];
  return first ?? null;
}

/** The inverse of the containerId strings bind() below hands to useDragReorder - "top", or
 * "branch:<logicBlockId>:<branchId>" - back into the shape movePageTo expects. */
function parsePageContainerId(containerId: string): PageContainerRef {
  if (containerId === "top") return { kind: "top" };
  const [, logicBlockId, branchId] = containerId.split(":");
  return { kind: "branch", logicBlockId, branchId };
}

const TABS = [
  { id: "folien", labelKey: "sidebar.tab.slides" },
  { id: "variablen", labelKey: "sidebar.tab.variables" },
  { id: "einstellungen", labelKey: "sidebar.tab.settings" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function Sidebar() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabId>("folien");
  const contextMenu = useContextMenu();
  const { bind } = useDragReorder();
  // While a layout is being edited, the first tab shows the layouts (to jump between them)
  // instead of the slides - the slides aren't what's on the canvas then.
  const layoutMode = useDocumentStore((s) => editedLayoutId(s.selection) !== null);

  return (
    <aside className="weft-sidebar">
      <div className="weft-sidebar-tabs">
        {TABS.map((tabDef) => (
          <button
            key={tabDef.id}
            type="button"
            className={"weft-sidebar-tab" + (tab === tabDef.id ? " is-active" : "")}
            onClick={() => setTab(tabDef.id)}
          >
            {tabDef.id === "folien" && layoutMode ? t("sidebar.tab.layouts") : t(tabDef.labelKey)}
          </button>
        ))}
      </div>

      <div className="weft-sidebar-content">
        {tab === "folien" && (layoutMode ? <LayoutList /> : <SequenceTree openMenu={contextMenu.open} bind={bind} />)}
        {tab === "variablen" && <VariablesTab />}
        {tab === "einstellungen" && <SettingsTab />}
      </div>

      <ContextMenu menu={contextMenu.menu} onClose={contextMenu.close} />
    </aside>
  );
}

/** The overview shown instead of the slide list while a layout is being edited: every layout as a
 * thumbnail with its name, the one on the canvas highlighted; clicking one switches to editing it. */
function LayoutList() {
  const layouts = useDocumentStore((s) => s.doc.content.layouts);
  const activeId = useDocumentStore((s) => editedLayoutId(s.selection));
  const select = useDocumentStore((s) => s.select);

  return (
    <ol className="weft-sequence">
      {Object.values(layouts).map((layout) => (
        <li key={layout.id}>
          <button
            type="button"
            className={"weft-node weft-node-layout" + (layout.id === activeId ? " is-active" : "")}
            onClick={() => select({ type: "layout", layoutId: layout.id })}
          >
            <div className="weft-node-layout-body">
              <SlideThumbnail blocks={orderedValues(layout.blocks)} />
              <span className="weft-node-title">{layout.name}</span>
            </div>
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          className="weft-ghost-button weft-full-width"
          onClick={() => select({ type: "layout", layoutId: addLayout("Neues Layout") })}
        >
          + Neues Layout
        </button>
      </li>
    </ol>
  );
}

function SequenceTree({ openMenu, bind }: { openMenu: ReturnType<typeof useContextMenu>["open"]; bind: DragBind }) {
  const doc = useDocumentStore((s) => s.doc);
  const selection = useDocumentStore((s) => s.selection);
  const select = useDocumentStore((s) => s.select);
  const { logicBlocks } = doc.content;
  const sequence = sequenceOf(doc.content);
  // The page a selected block (or an event on its own timeline - see Timeline.tsx) lives on -
  // either kind of selection means the page itself isn't the active sidebar entry anymore, but
  // it's still useful to see at a glance which page's canvas you're looking at, so its row gets a
  // weaker version of the same highlight (see PageRow).
  const currentPageId =
    selection?.type === "block" && selection.container.kind === "page"
      ? selection.container.pageId
      : selection?.type === "event"
        ? selection.pageId
        : null;

  if (sequence.length === 0) {
    return (
      <div className="weft-sequence-empty">
        <p className="weft-hint">Noch keine Folien.</p>
        <button type="button" className="weft-ghost-button weft-full-width" onClick={() => addPageToSequence(-1, firstLayoutId())}>
          + Folie
        </button>
        <button
          type="button"
          className="weft-ghost-button weft-full-width"
          onClick={() => addLogicBlockToSequence(-1, firstLayoutId())}
        >
          + Logikblock
        </button>
      </div>
    );
  }

  return (
    <ol className="weft-sequence">
      {sequence.map((node, index) => (
        <li key={node.kind === "page" ? node.pageId : node.logicBlockId}>
          {node.kind === "page" ? (
            <PageRow
              pageId={node.pageId}
              index={index + 1}
              active={selection?.type === "page" && selection.pageId === node.pageId}
              isCurrent={currentPageId === node.pageId}
              onSelect={() => select({ type: "page", pageId: node.pageId })}
              dragProps={bind("page", "top", index, (targetContainerId, targetIndex) =>
                movePageTo(node.pageId, parsePageContainerId(targetContainerId), targetIndex),
              )}
              onContextMenu={(e) =>
                openMenu(e, [
                  { label: "Folie darunter einfügen", onClick: () => addPageToSequence(index, firstLayoutId()) },
                  { label: "Logikblock darunter einfügen", onClick: () => addLogicBlockToSequence(index, firstLayoutId()) },
                  { separator: true },
                  { label: "Löschen", danger: true, onClick: () => removeSequenceNodeAt(index) },
                ])
              }
            />
          ) : (
            <LogicBlockRow
              logicBlock={logicBlocks[node.logicBlockId]}
              index={index + 1}
              active={selection?.type === "logic" && selection.logicBlockId === node.logicBlockId}
              onSelect={() => select({ type: "logic", logicBlockId: node.logicBlockId })}
              openMenu={openMenu}
              bind={bind}
              dragProps={bind("logic", "top", index, (_targetContainerId, targetIndex) => moveSequenceNode(index, targetIndex))}
              onContextMenu={(e) =>
                openMenu(e, [
                  { label: "Folie darunter einfügen", onClick: () => addPageToSequence(index, firstLayoutId()) },
                  { label: "Logikblock darunter einfügen", onClick: () => addLogicBlockToSequence(index, firstLayoutId()) },
                  { label: "Zweig hinzufügen", onClick: () => addBranch(node.logicBlockId, firstLayoutId()) },
                  { separator: true },
                  { label: "Löschen", danger: true, onClick: () => removeSequenceNodeAt(index) },
                ])
              }
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function PageRow({
  pageId,
  index,
  active,
  isCurrent,
  onSelect,
  onContextMenu,
  dragProps,
}: {
  pageId: string;
  index: number | string;
  active: boolean;
  isCurrent?: boolean;
  onSelect: () => void;
  onContextMenu: (e: ReactMouseEvent) => void;
  dragProps: ReturnType<DragBind>;
}) {
  const page = useDocumentStore((s) => s.doc.content.pages[pageId]);
  const layout = useDocumentStore((s) => (page?.layoutId ? s.doc.content.layouts[page.layoutId] : undefined));
  const { dragClassName, ...dragAttrs } = dragProps;
  if (!page) return null;

  return (
    <button
      type="button"
      className={
        "weft-node weft-node-page" +
        (active ? " is-active" : isCurrent ? " is-current" : "") +
        dragClassName
      }
      onClick={onSelect}
      onContextMenu={onContextMenu}
      {...dragAttrs}
    >
      <span className="weft-node-index">{index}</span>
      <SlideThumbnail blocks={[...orderedValues(layout?.blocks ?? {}), ...orderedValues(page.blocks)]} />
    </button>
  );
}

function LogicBlockRow({
  logicBlock,
  index,
  active,
  onSelect,
  onContextMenu,
  openMenu,
  bind,
  dragProps,
}: {
  logicBlock: LogicBlock | undefined;
  index: number;
  active: boolean;
  onSelect: () => void;
  onContextMenu: (e: ReactMouseEvent) => void;
  openMenu: ReturnType<typeof useContextMenu>["open"];
  bind: DragBind;
  dragProps: ReturnType<DragBind>;
}) {
  const selection = useDocumentStore((s) => s.selection);
  const select = useDocumentStore((s) => s.select);
  const currentPageId =
    selection?.type === "block" && selection.container.kind === "page"
      ? selection.container.pageId
      : selection?.type === "event"
        ? selection.pageId
        : null;
  const { dragClassName, ...dragAttrs } = dragProps;
  if (!logicBlock) return null;

  return (
    <div className="weft-node-logic-wrap">
      <button
        type="button"
        className={"weft-node weft-node-logic" + (active ? " is-active" : "") + dragClassName}
        onClick={onSelect}
        onContextMenu={onContextMenu}
        {...dragAttrs}
      >
        <span className="weft-node-index weft-node-index-logic">⥂</span>
        <span className="weft-node-title">
          {index} · {logicBlock.name}
        </span>
      </button>

      <div className="weft-branches">
        {logicBlock.branches.map((branch) => (
          <div key={branch.id} className="weft-branch">
            <div
              className="weft-branch-header"
              onContextMenu={(e) =>
                openMenu(e, [
                  { label: "Folie hinzufügen", onClick: () => addPageToBranch(logicBlock.id, branch.id, firstLayoutId()) },
                  { separator: true },
                  { label: "Zweig löschen", danger: true, onClick: () => removeBranch(logicBlock.id, branch.id) },
                ])
              }
            >
              <span>{branch.label}</span>
            </div>
            <div className="weft-branch-pages">
              {Object.keys(branch.pages).length === 0 && <EmptyBranchDropZone bind={bind} logicBlockId={logicBlock.id} branchId={branch.id} />}
              {branchPageIds(branch).map((pageId, pageIndex) => (
                <PageRow
                  key={pageId}
                  pageId={pageId}
                  index={`.${pageIndex + 1}`}
                  active={selection?.type === "page" && selection.pageId === pageId}
                  isCurrent={currentPageId === pageId}
                  onSelect={() => select({ type: "page", pageId })}
                  dragProps={bind("page", `branch:${logicBlock.id}:${branch.id}`, pageIndex, (targetContainerId, targetIndex) =>
                    movePageTo(pageId, parsePageContainerId(targetContainerId), targetIndex),
                  )}
                  onContextMenu={(e) =>
                    openMenu(e, [
                      {
                        label: "Folie zum Zweig hinzufügen",
                        onClick: () => addPageToBranch(logicBlock.id, branch.id, firstLayoutId()),
                      },
                      { separator: true },
                      {
                        label: "Löschen",
                        danger: true,
                        onClick: () => removePageFromBranch(logicBlock.id, branch.id, pageId),
                      },
                    ] satisfies ContextMenuItem[])
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * An empty branch has no PageRow to drag a page onto (moving its last page out, e.g. to the main
 * sequence or another branch, is exactly what would empty it - see movePageTo), so without this
 * it would have no drop target at all, making it a dead end you could empty but never refill by
 * dragging. Not itself draggable (there's no page here to drag), just a drop target: bound at
 * index 0 the same way a real PageRow would be, but only the data-drag-container/index/
 * dragClassName bind() hands back, not onPointerDown.
 */
function EmptyBranchDropZone({ bind, logicBlockId, branchId }: { bind: DragBind; logicBlockId: string; branchId: string }) {
  // onMove is unreachable here - reading the destructured result below never includes
  // onPointerDown, so a drag can never actually START from this placeholder to finish() into it.
  const { dragClassName, "data-drag-container": dragContainer, "data-drag-index": dragIndex } = bind(
    "page",
    `branch:${logicBlockId}:${branchId}`,
    0,
    () => {},
  );
  return (
    <div className={"weft-branch-empty-drop" + dragClassName} data-drag-container={dragContainer} data-drag-index={dragIndex}>
      Folie hierher ziehen
    </div>
  );
}
