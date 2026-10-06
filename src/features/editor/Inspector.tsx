import {
  setBlockImage,
  setBlockVideo,
  setLayoutBlockImage,
  setLayoutBlockVideo,
  updateBlock,
  updateLayoutBlock,
} from "../../core/document/actions";
import { useDocumentStore } from "../../core/document/store";
import { BlockPanel } from "./panels/BlockPanel";
import { EventPanel } from "./panels/EventPanel";
import { GroupPanel } from "./panels/GroupPanel";
import { LayoutPanel } from "./panels/LayoutPanel";
import { LogicBlockPanel } from "./panels/LogicBlockPanel";
import { MultiBlockPanel } from "./panels/MultiBlockPanel";
import { PagePanel } from "./panels/PagePanel";

function EmptyState() {
  return (
    <div className="weft-inspector-empty">
      <p>Wähle links eine Folie, einen Logikblock oder ein Element aus, um seine Eigenschaften zu bearbeiten.</p>
    </div>
  );
}

export function Inspector() {
  const doc = useDocumentStore((s) => s.doc);
  const selection = useDocumentStore((s) => s.selection);

  return (
    <aside className="weft-inspector">
      <div className="weft-inspector-header">Eigenschaften</div>
      <div className="weft-inspector-body">
        <InspectorBody doc={doc} selection={selection} />
      </div>
    </aside>
  );
}

function InspectorBody({
  doc,
  selection,
}: {
  doc: ReturnType<typeof useDocumentStore.getState>["doc"];
  selection: ReturnType<typeof useDocumentStore.getState>["selection"];
}) {
  if (!selection) return <EmptyState />;

  if (selection.type === "page") {
    const page = doc.content.pages[selection.pageId];
    return page ? <PagePanel page={page} /> : <EmptyState />;
  }

  if (selection.type === "logic") {
    const logicBlock = doc.content.logicBlocks[selection.logicBlockId];
    return logicBlock ? <LogicBlockPanel logicBlock={logicBlock} /> : <EmptyState />;
  }

  if (selection.type === "layout") {
    const layout = doc.content.layouts[selection.layoutId];
    return layout ? <LayoutPanel layout={layout} /> : <EmptyState />;
  }

  if (selection.type === "event") {
    const page = doc.content.pages[selection.pageId];
    return page ? <EventPanel page={page} nodeId={selection.nodeId} /> : <EmptyState />;
  }

  if (selection.type === "blocks") {
    return <MultiBlockPanel container={selection.container} blockIds={selection.blockIds} />;
  }

  if (selection.type === "group") {
    const page = doc.content.pages[selection.pageId];
    const group = page?.groups.find((g) => g.id === selection.groupId);
    return page && group ? <GroupPanel page={page} group={group} /> : <EmptyState />;
  }

  if (selection.container.kind === "page") {
    const page = doc.content.pages[selection.container.pageId];
    const block = page?.blocks[selection.blockId];
    if (!page || !block) return <EmptyState />;
    return (
      <BlockPanel
        block={block}
        page={page}
        onUpdate={(patch) => updateBlock(page.id, block.id, patch)}
        onSetImage={(file) => setBlockImage(page.id, block.id, file)}
        onSetVideo={(file) => setBlockVideo(page.id, block.id, file)}
      />
    );
  }

  const layout = doc.content.layouts[selection.container.layoutId];
  const block = layout?.blocks[selection.blockId];
  if (!layout || !block) return <EmptyState />;
  return (
    <BlockPanel
      block={block}
      onUpdate={(patch) => updateLayoutBlock(layout.id, block.id, patch)}
      onSetImage={(file) => setLayoutBlockImage(layout.id, block.id, file)}
      onSetVideo={(file) => setLayoutBlockVideo(layout.id, block.id, file)}
    />
  );
}
