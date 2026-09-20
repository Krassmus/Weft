import { useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  addBranch,
  addLogicBlockToSequence,
  addPageToBranch,
  addPageToSequence,
  moveBranchPage,
  moveSequenceNode,
  removeBranch,
  removePageFromBranch,
  removeSequenceNodeAt,
} from "../../core/document/actions";
import { useDocumentStore } from "../../core/document/store";
import type { LogicBlock } from "../../core/types";
import { ContextMenu, useContextMenu } from "./ContextMenu";
import type { ContextMenuItem } from "./ContextMenu";
import { SettingsTab } from "./panels/SettingsTab";
import { VariablesTab } from "./panels/VariablesTab";
import { SlideThumbnail } from "./SlideThumbnail";
import { useDragReorder } from "./useDragReorder";

type DragBind = ReturnType<typeof useDragReorder>["bind"];

function firstLayoutId(): string | null {
  const layouts = useDocumentStore.getState().doc.content.layouts;
  const first = Object.keys(layouts)[0];
  return first ?? null;
}

const TABS = [
  { id: "folien", label: "Folien" },
  { id: "variablen", label: "Variablen" },
  { id: "einstellungen", label: "Einstellungen" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function Sidebar() {
  const [tab, setTab] = useState<TabId>("folien");
  const contextMenu = useContextMenu();
  const { bind } = useDragReorder();

  return (
    <aside className="weft-sidebar">
      <div className="weft-sidebar-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={"weft-sidebar-tab" + (tab === t.id ? " is-active" : "")}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="weft-sidebar-content">
        {tab === "folien" && <SequenceTree openMenu={contextMenu.open} bind={bind} />}
        {tab === "variablen" && <VariablesTab />}
        {tab === "einstellungen" && <SettingsTab />}
      </div>

      <ContextMenu menu={contextMenu.menu} onClose={contextMenu.close} />
    </aside>
  );
}

function SequenceTree({ openMenu, bind }: { openMenu: ReturnType<typeof useContextMenu>["open"]; bind: DragBind }) {
  const doc = useDocumentStore((s) => s.doc);
  const selection = useDocumentStore((s) => s.selection);
  const select = useDocumentStore((s) => s.select);
  const { sequence, logicBlocks } = doc.content;

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
              onSelect={() => select({ type: "page", pageId: node.pageId })}
              dragProps={bind("top", index, (from, to) => moveSequenceNode(from, to))}
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
              dragProps={bind("top", index, (from, to) => moveSequenceNode(from, to))}
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
  onSelect,
  onContextMenu,
  dragProps,
}: {
  pageId: string;
  index: number | string;
  active: boolean;
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
      className={"weft-node weft-node-page" + (active ? " is-active" : "") + dragClassName}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      {...dragAttrs}
    >
      <span className="weft-node-index">{index}</span>
      <SlideThumbnail blocks={[...(layout?.blocks ?? []), ...page.blocks]} />
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
              {branch.pageIds.map((pageId, pageIndex) => (
                <PageRow
                  key={pageId}
                  pageId={pageId}
                  index={`.${pageIndex + 1}`}
                  active={selection?.type === "page" && selection.pageId === pageId}
                  onSelect={() => select({ type: "page", pageId })}
                  dragProps={bind(`branch:${logicBlock.id}:${branch.id}`, pageIndex, (from, to) =>
                    moveBranchPage(logicBlock.id, branch.id, from, to),
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
