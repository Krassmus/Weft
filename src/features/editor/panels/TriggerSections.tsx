import { addTrigger, removeTrigger, setDisappearsOnResumeOf, updateTrigger } from "../../../core/document/actions";
import { canTriggerFrom, disappearsOnResume, endNodeIds, findNode, outgoingTriggers } from "../../../core/document/pageTimeline";
import { useDocumentStore } from "../../../core/document/store";
import { BLOCK_KIND_KEYS } from "../../../core/i18n/translations";
import { useTranslation } from "../../../core/i18n/useTranslation";
import type { Page, TimelineNode } from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { listTriggerableNodes, nodeLabel } from "../Timeline";
import { SecondsControl } from "./SecondsControl";
import { tr } from "../../../core/i18n/tr";

// The cards of a trigger and the section "Löst aus" - shared by the panel of an event (EventPanel.tsx) and by the panel of a button
// (BlockPanel.tsx), which shows what its click triggers the same way.

/** The block whose Aufbau a trigger from `from` to `to` is, when `from` is a time mark that stops the video: that block can be made to
 * disappear again when the video goes on (see setDisappearsOnResume). Else null. */
export function resumableBlock(page: Page, from: string, to: string): { blockId: string; resumeId: string } | null {
  const mark = /^video-stop:([^:]+):([^:]+)$/.exec(from);
  const entrance = /^block-entrance:(.+)$/.exec(to);
  if (!mark || !entrance || !(entrance[1] in page.blocks)) return null;
  const video = page.blocks[mark[1]];
  if (video?.kind !== "video" || !video.stopPoints.some((s) => s.id === mark[2] && s.stopsVideo)) return null;
  return { blockId: entrance[1], resumeId: `video-resume:${mark[1]}:${mark[2]}` };
}

/** One trigger as a small card, top to bottom: how it is triggered (by itself or by the learner's Weiter), the delay, and the event at
 * its other end - "Nach Event" for an incoming trigger (what has to have happened), "Event" for an outgoing one (what it causes). */
export function TriggerCard({
  page,
  triggerId,
  direction,
  endpoint,
  endpointLabel,
  options,
  delayMs,
  weiter,
  loop,
  resumable,
  onEndpoint,
}: {
  page: Page;
  triggerId: string;
  direction: "incoming" | "outgoing";
  /** The event at the other end of the trigger (its source for an incoming one, its target for an outgoing one). */
  endpoint: string;
  endpointLabel: string;
  options: { id: string; label: string }[];
  delayMs: number;
  weiter: boolean;
  /** Whether this trigger would close a loop (see canTriggerFrom). */
  loop: boolean;
  /** Present when the result can go away again when the video goes on (see resumableBlock). */
  resumable?: { blockId: string; resumeId: string };
  onEndpoint: (id: string) => void;
}) {
  // The current end stays listed even if it isn't among the offered ones (e.g. an event that is not a choice any more).
  const listed = options.some((o) => o.id === endpoint);
  return (
    <li className="weft-trigger-card">
      <div className="weft-trigger-card-row weft-trigger-card-head">
        <label className="weft-field">
          <span>{tr("ui.trigger_type")}</span>
          <select value={weiter ? "weiter" : "auto"} onChange={(e) => updateTrigger(page.id, triggerId, { weiter: e.target.value === "weiter" })}>
            <option value="auto">{tr("ui.automatic")}</option>
            <option value="weiter">{tr("ui.with_next_user_interaction")}</option>
          </select>
        </label>
        <button type="button" className="weft-event-trigger-remove" aria-label={tr("ui.remove_trigger")} onClick={() => removeTrigger(page.id, triggerId)}>
          ×
        </button>
      </div>
      <div className="weft-field">
        <span>{tr("ui.delay_in_seconds")}</span>
        <SecondsControl label={tr("ui.delay_seconds")} valueMs={delayMs} onChange={(ms) => updateTrigger(page.id, triggerId, { delayMs: ms })} />
      </div>
      <label className="weft-field">
        <span>{direction === "incoming" ? tr("ui.after_event") : tr("ui.event_2")}</span>
        <select value={endpoint} onChange={(e) => onEndpoint(e.target.value)} title={endpointLabel}>
          {!listed && <option value={endpoint}>{endpointLabel}</option>}
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {resumable && (
        <label className="weft-field weft-field-inline">
          <input
            type="checkbox"
            checked={disappearsOnResume(page, resumable.blockId, resumable.resumeId)}
            onChange={(e) => setDisappearsOnResumeOf(page.id, resumable.blockId, resumable.resumeId, e.target.checked)}
          />
          <span>{tr("ui.disappears_again_when_the_video_goes")}</span>
        </label>
      )}
      {loop && <p className="weft-hint">{tr("ui.this_closes_a_circle_the_events")}</p>}
    </li>
  );
}

/** "Löst aus": every trigger that starts at this event. Not for "Nächste Folie" - the slide is already gone by the time it fires. */
export function OutgoingTriggersSection({ page, node }: { page: Page; node: TimelineNode }) {
  const select = useDocumentStore((s) => s.select);
  const { t } = useTranslation();
  if (node.kind === "end") return null;

  const outgoing = outgoingTriggers(page.timeline, node.id);
  // What can be caused: Aufbau, Abbau, a video's start, and every "Nächste Folie".
  const options = [
    ...listTriggerableNodes(page),
    ...endNodeIds(page).map((id) => ({ id, label: page.timeline.titles?.[id]?.trim() || nodeLabel({ id, kind: "end" }) })),
  ].filter((target) => target.id !== node.id);
  const labelOf = (id: string) => options.find((o) => o.id === id)?.label ?? id;
  const addable = options.filter((target) => !outgoing.some((o) => o.to === target.id));

  return (
    <Collapsible title={tr("ui.triggers")} defaultOpen={outgoing.length > 0}>
      {outgoing.length === 0 ? (
        <p className="weft-hint">{tr("ui.does_not_trigger_anything_yet")}</p>
      ) : (
        <ul className="weft-trigger-list">
          {outgoing.map((trigger) => {
            return (
              <TriggerCard
                key={trigger.id}
                page={page}
                triggerId={trigger.id}
                direction="outgoing"
                endpoint={trigger.to}
                endpointLabel={labelOf(trigger.to)}
                options={options}
                delayMs={trigger.delayMs}
                weiter={trigger.weiter}
                loop={!canTriggerFrom(page, node.id, trigger.to) && node.id !== "start"}
                resumable={resumableBlock(page, trigger.from, trigger.to) ?? undefined}
                onEndpoint={(to) => updateTrigger(page.id, trigger.id, { to })}
              />
            );
          })}
        </ul>
      )}
      {outgoing.some((o) => page.blocks[findNode(page, o.to)?.sourceBlockId ?? ""]) && (
        <div className="weft-event-source">
          <span className="weft-hint">{tr("ui.open_targets")}</span>
          {outgoing.map((trigger) => {
            const targetBlock = page.blocks[findNode(page, trigger.to)?.sourceBlockId ?? ""];
            return (
              targetBlock && (
                <button
                  key={trigger.id}
                  type="button"
                  className="weft-event-trigger-row"
                  onClick={() => select({ type: "block", container: { kind: "page", pageId: page.id }, blockId: targetBlock.id })}
                >
                  <span>{labelOf(trigger.to)}</span>
                  <span className="weft-event-trigger-via">{t(BLOCK_KIND_KEYS[targetBlock.kind])}</span>
                </button>
              )
            );
          })}
        </div>
      )}
      {addable.length > 0 && (
        <label className="weft-field">
          <span>{tr("ui.add_another_target")}</span>
          <select value="" onChange={(e) => e.target.value && addTrigger(page.id, node.id, e.target.value, 0, false)}>
            <option value="" disabled>
              {tr("ui.choose_event")}
            </option>
            {addable.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </Collapsible>
  );
}
