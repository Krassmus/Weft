import { setGroupEffect, setGroupEventTrigger, ungroupBlocks } from "../../../core/document/actions";
import { blockEffectNodeId, getBlockEntranceTrigger, getBlockExitTrigger } from "../../../core/document/pageTimeline";
import { useDocumentStore } from "../../../core/document/store";
import type { BlockGroup, Page } from "../../../core/types";
import { listPageTriggerEvents } from "../Timeline";
import { BlockEffectEditor } from "./BlockPanel";
import { orderedValues } from "../../../core/document/ordering";

/**
 * A formed BlockGroup, selected as a whole (SelectionRef's "group" variant). Its own Aufbau/Abbau
 * is UI sugar, not a real shared value stored anywhere on BlockGroup itself (see its own doc
 * comment in core/types.ts) - reading the FIRST member's current effect/trigger to display, and
 * writing any change out to every member at once via setGroupEffect/setGroupEventTrigger, reusing
 * BlockPanel.tsx's own BlockEffectEditor exactly as a single block's own panel does.
 */
export function GroupPanel({ page, group }: { page: Page; group: BlockGroup }) {
  const select = useDocumentStore((s) => s.select);
  const firstMember = orderedValues(page.blocks).find((b) => group.blockIds.includes(b.id));
  if (!firstMember) return null;

  const ownEffectNodeIds = new Set(group.blockIds.flatMap((id) => [blockEffectNodeId(id, "entrance"), blockEffectNodeId(id, "exit")]));
  const triggerEvents = listPageTriggerEvents(page).filter((e) => !ownEffectNodeIds.has(e.id));

  function ungroup() {
    ungroupBlocks(page.id, group.id);
    select({ type: "blocks", container: { kind: "page", pageId: page.id }, blockIds: group.blockIds });
  }

  return (
    <div className="weft-group-panel">
      <p className="weft-hint">Gruppe ({group.blockIds.length} Objekte)</p>
      <button type="button" className="weft-ghost-button weft-full-width" onClick={ungroup}>
        Gruppe auflösen
      </button>
      <BlockEffectEditor
        key={group.id + "-entrance"}
        title="Aufbau"
        page={page}
        targetNodeId={blockEffectNodeId(firstMember.id, "entrance")}
        effect={firstMember.entranceEffect}
        trigger={getBlockEntranceTrigger(page, firstMember)}
        events={triggerEvents}
        onEffectChange={(effect) => setGroupEffect(page.id, group.blockIds, "entrance", effect)}
        onTriggerChange={(from, delayMs, kind) => setGroupEventTrigger(page.id, group.blockIds, "entrance", from, delayMs, kind)}
      />
      <BlockEffectEditor
        key={group.id + "-exit"}
        title="Abbau"
        page={page}
        targetNodeId={blockEffectNodeId(firstMember.id, "exit")}
        effect={firstMember.exitEffect}
        trigger={getBlockExitTrigger(page, firstMember)}
        events={triggerEvents}
        onEffectChange={(effect) => setGroupEffect(page.id, group.blockIds, "exit", effect)}
        onTriggerChange={(from, delayMs, kind) => setGroupEventTrigger(page.id, group.blockIds, "exit", from, delayMs, kind)}
      />
    </div>
  );
}
