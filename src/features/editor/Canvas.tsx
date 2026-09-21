import { useEffect, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import { ASPECT_RATIO_CSS } from "../../core/aspectRatio";
import { addImageBlockToLayout, addImageBlockToPage, updateBlock, updateLayoutBlock } from "../../core/document/actions";
import { useDocumentStore } from "../../core/document/store";
import type { BlockContainerRef } from "../../core/document/store";
import type { BlockPosition, Layout, Page, WeftDocument } from "../../core/types";
import { BlockView } from "./blocks/BlockView";
import { clampMove } from "./blocks/resizeMath";

const ARROW_STEP_PERCENT = 1;
const ARROW_STEP_PERCENT_FAST = 5;

// Dropped images land at this size, centered on the cursor - object-fit: contain (both here and
// in the exported player) means the block's own aspect ratio doesn't need to match the image's
// for it to display correctly, so a fixed default is simplest.
const DROP_IMAGE_WIDTH = 40;
const DROP_IMAGE_HEIGHT = 30;
// Dropping several images at once cascades each further one a bit, so they don't land in one
// exact pile - same idea as the paste offset in core/document/actions.ts.
const DROP_CASCADE_PERCENT = 4;

function clampAxis(value: number, size: number): number {
  return Math.min(Math.max(value, 0), Math.max(0, 100 - size));
}

function dropPosition(clientX: number, clientY: number, stageRect: DOMRect, cascadeIndex: number): BlockPosition {
  const centerX = ((clientX - stageRect.left) / stageRect.width) * 100;
  const centerY = ((clientY - stageRect.top) / stageRect.height) * 100;
  const offset = cascadeIndex * DROP_CASCADE_PERCENT;
  return {
    x: clampAxis(centerX - DROP_IMAGE_WIDTH / 2 + offset, DROP_IMAGE_WIDTH),
    y: clampAxis(centerY - DROP_IMAGE_HEIGHT / 2 + offset, DROP_IMAGE_HEIGHT),
    width: DROP_IMAGE_WIDTH,
    height: DROP_IMAGE_HEIGHT,
  };
}

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
  const [dragOver, setDragOver] = useState(false);

  const target = resolveEditTarget(doc, selection);
  const aspect = ASPECT_RATIO_CSS[doc.content.aspectRatio];

  useArrowMove(doc, selection);

  function handleDragOver(e: ReactDragEvent<HTMLDivElement>) {
    // Only react to an actual file drag (e.g. from the Finder) - not our own internal block
    // dragging, which uses Pointer Events and never sets a "Files" payload.
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  async function handleImageDrop(
    e: ReactDragEvent<HTMLDivElement>,
    container: BlockContainerRef,
    addImage: (file: File, position: BlockPosition) => Promise<string>,
  ) {
    e.preventDefault();
    setDragOver(false);
    const rect = e.currentTarget.getBoundingClientRect();
    const imageFiles = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    // Sequential, not Promise.all - addImage reads the image's own dimensions before editing the
    // document, and each edit() call is its own undo step, so keeping them in drop order keeps
    // undo order sane too.
    let lastBlockId: string | null = null;
    for (const [index, file] of imageFiles.entries()) {
      lastBlockId = await addImage(file, dropPosition(e.clientX, e.clientY, rect, index));
    }
    // Select whichever landed last, mirroring how pasting a block selects the new copy.
    if (lastBlockId) select({ type: "block", container, blockId: lastBlockId });
  }

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
            className={"weft-stage weft-stage-edit" + (dragOver ? " is-drag-over" : "")}
            style={{ aspectRatio: aspect }}
            onClick={() => select({ type: "layout", layoutId: target.layout.id })}
            onDragOver={handleDragOver}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) =>
              handleImageDrop(e, { kind: "layout", layoutId: target.layout.id }, (file, position) =>
                addImageBlockToLayout(target.layout.id, file, position),
              )
            }
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
            className={"weft-stage weft-stage-edit" + (dragOver ? " is-drag-over" : "")}
            style={{ aspectRatio: aspect }}
            onClick={() => select({ type: "page", pageId: target.page.id })}
            onDragOver={handleDragOver}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) =>
              handleImageDrop(e, { kind: "page", pageId: target.page.id }, (file, position) =>
                addImageBlockToPage(target.page.id, file, position),
              )
            }
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
