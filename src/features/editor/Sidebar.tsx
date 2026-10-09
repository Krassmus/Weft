import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  addBranch,
  addJumpToBranch,
  addJumpToSequence,
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
import type { LogicBlock, Page } from "../../core/types";
import { ContextMenu, useContextMenu } from "./ContextMenu";
import type { ContextMenuItem } from "./ContextMenu";
import { SettingsTab } from "./panels/SettingsTab";
import { VariablesTab } from "./panels/VariablesTab";
import { SlideThumbnail } from "./SlideThumbnail";
import { pageLabels } from "../../core/document/pageLabels";
import jumpIconSvg from "../../../mockups/icons/forward.svg?raw";
import { useDragReorder } from "./useDragReorder";
import { presenceColor, usePresence } from "../../core/collab/presence";
import type { PeerPresence } from "../../core/collab/presence";
import { PersonAvatar } from "./PersonAvatar";
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
        {tab === "folien" && !layoutMode && <ViewerLayer />}
        {tab === "variablen" && <VariablesTab />}
        {tab === "einstellungen" && <SettingsTab />}
      </div>
      {tab === "folien" && !layoutMode && <AddSlideBar />}

      <ContextMenu menu={contextMenu.menu} onClose={contextMenu.close} />
    </aside>
  );
}

type AddKind = "page" | "logic" | "jump";

/**
 * A row at the foot of the slide list that does not scroll with it: a + that opens a choice of what to add - a slide, a branching
 * (logic block) or a jump slide. It goes right below the slide that is selected: in the main sequence after it, in a branch after
 * it in that branch (a logic block can't be nested, so that one goes behind the whole branching instead). A selected logic block
 * gets the new entry behind it; with nothing selected it goes to the end.
 */
function AddSlideBar() {
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rowRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function add(kind: AddKind) {
    setOpen(false);
    const { doc, selection, select } = useDocumentStore.getState();
    const content = doc.content;
    const sequence = sequenceOf(content);
    // The page or logic block the selection is on (a block, a group, an event of a page count as that page).
    const selectedPageId =
      selection?.type === "page" ? selection.pageId
      : selection?.type === "group" || selection?.type === "event" ? selection.pageId
      : (selection?.type === "block" || selection?.type === "blocks") && selection.container.kind === "page" ? selection.container.pageId
      : null;
    const selectedLogicId = selection?.type === "logic" ? selection.logicBlockId : null;

    let topIndex = sequence.length - 1; // after the last entry, unless the selection says otherwise
    let branchPlace: { logicBlockId: string; branchId: string } | null = null;
    if (selectedPageId !== null) {
      const index = sequence.findIndex((node) => node.kind === "page" && node.pageId === selectedPageId);
      if (index !== -1) topIndex = index;
      else {
        outer: for (const [logicIndex, node] of sequence.entries()) {
          if (node.kind !== "logic") continue;
          for (const branch of content.logicBlocks[node.logicBlockId]?.branches ?? []) {
            if (branchPageIds(branch).includes(selectedPageId)) {
              topIndex = logicIndex;
              branchPlace = { logicBlockId: node.logicBlockId, branchId: branch.id };
              break outer;
            }
          }
        }
      }
    } else if (selectedLogicId !== null) {
      const index = sequence.findIndex((node) => node.kind === "logic" && node.logicBlockId === selectedLogicId);
      if (index !== -1) topIndex = index;
    }

    const layoutId = (selectedPageId && content.pages[selectedPageId]?.layoutId) || firstLayoutId();
    if (kind === "logic") {
      select({ type: "logic", logicBlockId: addLogicBlockToSequence(topIndex, layoutId) });
      return;
    }
    let pageId: string;
    if (branchPlace) {
      pageId =
        kind === "jump"
          ? addJumpToBranch(branchPlace.logicBlockId, branchPlace.branchId, selectedPageId ?? undefined)
          : addPageToBranch(branchPlace.logicBlockId, branchPlace.branchId, layoutId, selectedPageId ?? undefined);
    } else {
      pageId = kind === "jump" ? addJumpToSequence(topIndex) : addPageToSequence(topIndex, layoutId);
    }
    select({ type: "page", pageId });
  }

  return (
    <div className="weft-sidebar-footer" ref={rowRef}>
      {open && (
        <div className="weft-add-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => add("page")}>
            Folie
          </button>
          <button type="button" role="menuitem" onClick={() => add("logic")}>
            Verzweigung
          </button>
          <button type="button" role="menuitem" onClick={() => add("jump")}>
            Sprungfolie
          </button>
        </div>
      )}
      <button type="button" className="weft-add-slide" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="weft-add-slide-plus">+</span>
        <span>Hinzufügen</span>
      </button>
    </div>
  );
}

const VIEWER_SIZE = 22;

/**
 * The other people, as avatars on the slide each of them is on (top right of its thumbnail). All of them live in one layer over the
 * list, positioned by measuring the thumbnails - so that when somebody goes to another slide the avatar glides there
 * (400 ms) instead of disappearing from one place and appearing at the other. Several on one slide overlap a little.
 */
function ViewerLayer() {
  const peers = usePresence((s) => s.peers);
  // The slides can move (a slide added, moved or removed, the panel resized): measured again then.
  useDocumentStore((s) => s.doc.content.sequence);
  useDocumentStore((s) => s.doc.content.pages);
  useDocumentStore((s) => s.doc.content.logicBlocks);
  const layerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [, setResizes] = useState(0);

  useLayoutEffect(() => {
    const container = layerRef.current?.parentElement;
    const people = Object.values(peers).filter((person) => person.pageId);
    if (!container || people.length === 0) {
      setPositions((previous) => (Object.keys(previous).length === 0 ? previous : {}));
      return;
    }
    const origin = container.getBoundingClientRect();
    const byPage = new Map<string, PeerPresence[]>();
    for (const person of people.sort((a, b) => (a.peerId < b.peerId ? -1 : 1))) {
      byPage.set(person.pageId as string, [...(byPage.get(person.pageId as string) ?? []), person]);
    }
    const next: Record<string, { x: number; y: number }> = {};
    byPage.forEach((list, pageId) => {
      const node = container.querySelector(`[data-page-id="${CSS.escape(pageId)}"]`);
      if (!node) return;
      const rect = node.getBoundingClientRect();
      list.forEach((person, i) => {
        next[person.peerId] = {
          x: Math.round(rect.right - origin.left + container.scrollLeft - 4 - VIEWER_SIZE - i * (VIEWER_SIZE - 7)),
          y: Math.round(rect.top - origin.top + container.scrollTop + 4),
        };
      });
    });
    setPositions((previous) => {
      const keys = Object.keys(next);
      const same = keys.length === Object.keys(previous).length && keys.every((k) => previous[k]?.x === next[k].x && previous[k]?.y === next[k].y);
      return same ? previous : next;
    });
  });

  useEffect(() => {
    const container = layerRef.current?.parentElement;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setResizes((n) => n + 1));
    observer.observe(container);
    if (container.firstElementChild) observer.observe(container.firstElementChild);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={layerRef} className="weft-viewer-layer" aria-hidden>
      {Object.values(peers).map((person) => {
        const position = positions[person.peerId];
        return (
          position && (
            <span key={person.peerId} className="weft-viewer" style={{ transform: `translate(${position.x}px, ${position.y}px)` }}>
              <PersonAvatar name={person.name} color={presenceColor(person.peerId)} avatar={person.avatar} size={VIEWER_SIZE} className="weft-node-viewer" />
            </span>
          )
        );
      })}
    </div>
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
        <button type="button" className="weft-ghost-button weft-full-width" onClick={() => addJumpToSequence(-1)}>
          + Sprungfolie
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
                  { label: "Sprungfolie darunter einfügen", onClick: () => addJumpToSequence(index) },
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
                  { label: "Sprungfolie darunter einfügen", onClick: () => addJumpToSequence(index) },
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

  if (page.jump) {
    return <JumpRow page={page} index={index} active={active} isCurrent={isCurrent} onSelect={onSelect} onContextMenu={onContextMenu} dragClassName={dragClassName} dragAttrs={dragAttrs} />;
  }

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
      data-page-id={pageId}
      {...dragAttrs}
    >
      <span className="weft-node-index">{index}</span>
      <SlideThumbnail blocks={[...orderedValues(layout?.blocks ?? {}), ...orderedValues(page.blocks)]} />
    </button>
  );
}

/** A jump page in the list: no picture, just its icon (the tooltip says where it leads to: its first way out and how many there are). */
function JumpRow({
  page,
  index,
  active,
  isCurrent,
  onSelect,
  onContextMenu,
  dragClassName,
  dragAttrs,
}: {
  page: Page;
  index: number | string;
  active: boolean;
  isCurrent?: boolean;
  onSelect: () => void;
  onContextMenu: (e: ReactMouseEvent) => void;
  dragClassName: string;
  dragAttrs: Omit<ReturnType<DragBind>, "dragClassName">;
}) {
  const content = useDocumentStore((s) => s.doc.content);
  const labels = pageLabels(content);
  const jump = page.jump;
  if (!jump) return null;
  const first = jump.targets[0]?.pageId ?? jump.defaultPageId;
  const count = jump.targets.length + (jump.defaultPageId ? 1 : 0);
  return (
    <button
      type="button"
      className={"weft-node weft-node-page weft-node-jump" + (active ? " is-active" : isCurrent ? " is-current" : "") + dragClassName}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      data-page-id={page.id}
      {...dragAttrs}
    >
      <span className="weft-node-index">{index}</span>
      <span className="weft-node-jump-body" title={first && labels[first] ? `Sprungfolie → ${labels[first]}${count > 1 ? ` (+${count - 1})` : ""}` : "Sprungfolie"}>
        <span className="weft-node-jump-icon" dangerouslySetInnerHTML={{ __html: jumpIconSvg }} />
      </span>
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
                  { label: "Sprungfolie hinzufügen", onClick: () => addJumpToBranch(logicBlock.id, branch.id) },
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
                      { label: "Sprungfolie zum Zweig hinzufügen", onClick: () => addJumpToBranch(logicBlock.id, branch.id) },
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
