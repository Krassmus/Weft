import { useEffect } from "react";
import { ASPECT_RATIO_CSS } from "../../core/aspectRatio";
import { updateBlock, updateLayoutBlock } from "../../core/document/actions";
import { useDocumentStore } from "../../core/document/store";
import type { Layout, Page, WeftDocument } from "../../core/types";
import { BlockView } from "./blocks/BlockView";
import { clampMove } from "./blocks/resizeMath";

const ARROW_STEP_PERCENT = 1;
const ARROW_STEP_PERCENT_FAST = 5;

function isEditableTarget(el: Element | null): boolean {
  if (!el) return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  return (el as HTMLElement).isContentEditable;
}

/**
 * Arrow keys nudge the selected block (Shift for a bigger step); Delete/Backspace isn't handled
 * here, only movement. Only ever fires for a block the user could otherwise drag, since selection
 * can only reach a block via BlockView's own onSelect, which Canvas never wires up for the
 * read-only layout blocks shown underneath a page - so no separate "locked" check is needed here.
 */
function useArrowMove(doc: WeftDocument, selection: ReturnType<typeof useDocumentStore.getState>["selection"]) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!selection || selection.type !== "block") return;
      if (isEditableTarget(document.activeElement)) return;

      const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
      const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
      if (dx === 0 && dy === 0) return;

      const { container, blockId } = selection;
      const block =
        container.kind === "page"
          ? doc.content.pages[container.pageId]?.blocks.find((b) => b.id === blockId)
          : doc.content.layouts[container.layoutId]?.blocks.find((b) => b.id === blockId);
      if (!block) return;

      e.preventDefault();
      const step = e.shiftKey ? ARROW_STEP_PERCENT_FAST : ARROW_STEP_PERCENT;
      const position = clampMove(block.position, dx * step, dy * step);
      if (container.kind === "page") updateBlock(container.pageId, blockId, { position });
      else updateLayoutBlock(container.layoutId, blockId, { position });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [doc, selection]);
}

type EditTarget = { kind: "page"; page: Page; layout: Layout | null } | { kind: "layout"; layout: Layout };

function pageTarget(content: WeftDocument["content"], page: Page): EditTarget {
  return { kind: "page", page, layout: page.layoutId ? (content.layouts[page.layoutId] ?? null) : null };
}

function resolveEditTarget(doc: WeftDocument, selection: ReturnType<typeof useDocumentStore.getState>["selection"]): EditTarget | null {
  const { content } = doc;

  if (selection?.type === "layout") {
    const layout = content.layouts[selection.layoutId];
    return layout ? { kind: "layout", layout } : null;
  }
  if (selection?.type === "page") {
    const page = content.pages[selection.pageId];
    return page ? pageTarget(content, page) : null;
  }
  if (selection?.type === "block") {
    if (selection.container.kind === "page") {
      const page = content.pages[selection.container.pageId];
      return page ? pageTarget(content, page) : null;
    }
    const layout = content.layouts[selection.container.layoutId];
    return layout ? { kind: "layout", layout } : null;
  }
  if (selection?.type === "logic") return null;

  const first = content.sequence[0];
  if (!first) return null;
  if (first.kind === "page") {
    const page = content.pages[first.pageId];
    return page ? pageTarget(content, page) : null;
  }
  const logicBlock = content.logicBlocks[first.logicBlockId];
  const firstPageId = logicBlock?.branches[0]?.pageIds[0];
  const page = firstPageId ? content.pages[firstPageId] : null;
  return page ? pageTarget(content, page) : null;
}

export function Canvas({ onPresent }: { onPresent: () => void }) {
  const doc = useDocumentStore((s) => s.doc);
  const selection = useDocumentStore((s) => s.selection);
  const select = useDocumentStore((s) => s.select);

  const target = resolveEditTarget(doc, selection);
  const aspect = ASPECT_RATIO_CSS[doc.content.aspectRatio];

  useArrowMove(doc, selection);

  return (
    <div className="weft-canvas">
      <div className="weft-canvas-toolbar">
        <button type="button" onClick={onPresent}>
          ▶ Vorschau
        </button>
        {target?.kind === "layout" && <span className="weft-canvas-context">Layout: {target.layout.name}</span>}
      </div>

      <div className="weft-canvas-stage-wrap">
        {selection?.type === "logic" ? (
          <div className="weft-canvas-empty">Wähle eine Folie in einem Zweig, um sie zu bearbeiten.</div>
        ) : target?.kind === "layout" ? (
          <div
            className="weft-stage weft-stage-edit"
            style={{ aspectRatio: aspect }}
            onClick={() => select({ type: "layout", layoutId: target.layout.id })}
          >
            {target.layout.blocks.map((block) => (
              <BlockView
                key={block.id}
                block={block}
                locked={false}
                selected={
                  selection?.type === "block" &&
                  selection.container.kind === "layout" &&
                  selection.container.layoutId === target.layout.id &&
                  selection.blockId === block.id
                }
                onSelect={() =>
                  select({ type: "block", container: { kind: "layout", layoutId: target.layout.id }, blockId: block.id })
                }
                onUpdate={(patch) => updateLayoutBlock(target.layout.id, block.id, patch)}
              />
            ))}
          </div>
        ) : target?.kind === "page" ? (
          <div
            className="weft-stage weft-stage-edit"
            style={{ aspectRatio: aspect }}
            onClick={() => select({ type: "page", pageId: target.page.id })}
          >
            {target.layout?.blocks.map((block) => <BlockView key={block.id} block={block} selected={false} locked />)}
            {target.page.blocks.map((block) => (
              <BlockView
                key={block.id}
                block={block}
                locked={false}
                selected={
                  selection?.type === "block" &&
                  selection.container.kind === "page" &&
                  selection.container.pageId === target.page.id &&
                  selection.blockId === block.id
                }
                onSelect={() =>
                  select({ type: "block", container: { kind: "page", pageId: target.page.id }, blockId: block.id })
                }
                onUpdate={(patch) => updateBlock(target.page.id, block.id, patch)}
              />
            ))}
          </div>
        ) : (
          <div className="weft-canvas-empty">Noch keine Folie – lege links eine an.</div>
        )}
      </div>
    </div>
  );
}
