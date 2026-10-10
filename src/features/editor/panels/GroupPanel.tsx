import { setGroupEffect, setGroupEventTrigger, ungroupBlocks } from "../../../core/document/actions";
import {
  getBlockEntranceTrigger,
  getBlockExitTrigger,
  getGroupEffectTrigger,
  groupEffectNodeId,
} from "../../../core/document/pageTimeline";
import { useDocumentStore } from "../../../core/document/store";
import type { BlockEffect, BlockGroup, Page } from "../../../core/types";
import { listPageTriggerEvents } from "../Timeline";
import { BlockEffectEditor } from "./BlockPanel";
import { orderedValues } from "../../../core/document/ordering";

/**
 * A formed BlockGroup, selected as a whole (SelectionRef's "group" variant). Its Aufbau/Abbau is an event of its own in the page's graph
 * (see BlockGroup.entranceEffect): the group's panel edits that effect - which the members carry as well - and when it happens. A
 * group made before that existed has no effect of its own: the panel shows what its first member does, and the first change
 * makes it the group's own (see setGroupEffect). Reuses BlockPanel.tsx's BlockEffectEditor exactly as a single block's own panel does.
 */
export function GroupPanel({ page, group }: { page: Page; group: BlockGroup }) {
  const select = useDocumentStore((s) => s.select);
  const firstMember = orderedValues(page.blocks).find((b) => group.blockIds.includes(b.id));
  if (!firstMember) return null;

  const ownEffectNodeIds = new Set([
    ...group.blockIds.flatMap((id) => [`block-entrance:${id}`, `block-exit:${id}`]),
    groupEffectNodeId(group.id, "entrance"),
    groupEffectNodeId(group.id, "exit"),
  ]);
  const triggerEvents = listPageTriggerEvents(page).filter((e) => !ownEffectNodeIds.has(e.id));

  function ungroup() {
    ungroupBlocks(page.id, group.id);
    select({ type: "blocks", container: { kind: "page", pageId: page.id }, blockIds: group.blockIds });
  }

  function section(phase: "entrance" | "exit") {
    const own = phase === "entrance" ? group.entranceEffect : group.exitEffect;
    const hasOwn = !!own && own.type !== "off";
    const memberEffect: BlockEffect = phase === "entrance" ? firstMember!.entranceEffect : firstMember!.exitEffect;
    const effect = hasOwn ? own : memberEffect;
    const trigger = hasOwn
      ? getGroupEffectTrigger(page, group.id, phase)
      : phase === "entrance"
        ? getBlockEntranceTrigger(page, firstMember!)
        : getBlockExitTrigger(page, firstMember!);
    return (
      <BlockEffectEditor
        key={group.id + "-" + phase}
        title={phase === "entrance" ? "Aufbau" : "Abbau"}
        page={page}
        targetNodeId={groupEffectNodeId(group.id, phase)}
        effect={effect}
        trigger={trigger}
        events={triggerEvents}
        onEffectChange={(next) => setGroupEffect(page.id, group.id, phase, next)}
        onTriggerChange={(from, delayMs, kind) => {
          // A group from before the group had effects of its own becomes a group with one first.
          if (!hasOwn && effect.type !== "off") setGroupEffect(page.id, group.id, phase, effect);
          setGroupEventTrigger(page.id, group.id, phase, from, delayMs, kind);
        }}
      />
    );
  }

  return (
    <div className="weft-group-panel">
      <p className="weft-hint">Gruppe ({group.blockIds.length} Objekte)</p>
      <button type="button" className="weft-ghost-button weft-full-width" onClick={ungroup}>
        Gruppe auflösen
      </button>
      {section("entrance")}
      {section("exit")}
    </div>
  );
}
