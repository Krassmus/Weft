import { canTriggerFrom, computeAdvanceChainTail } from "../../../core/document/pageTimeline";
import type { ResolvedTrigger } from "../../../core/document/pageTimeline";
import type { Page, TimelineEdgeKind } from "../../../core/types";

// A UI-only sentinel for the main select's "Weiter" option - never itself written into the
// document (see handleMainChange below, which always resolves it to a real node id + kind
// "advance" before calling onChange). Distinct from any real node id (those are all either
// "start"/"end" or one of pageTimeline.ts's own `*NodeId` shapes, none of which look like this).
const ADVANCE_SENTINEL = "__advance__";

/**
 * The shared "Ausgelöst durch" editor for any node whose trigger can be a plain timed one OR
 * "Weiter" - a block's own Aufbau/Abbau (BlockPanel.tsx's BlockEffectEditor), a video's own start,
 * or a free-standing event-to-event link (EventPanel.tsx's TriggerSection). NOT used for "Nächste
 * Folie" itself (see EventPanel.tsx's own, deliberately narrower EndTriggerSection) - "end" should
 * only ever offer "Weiter" or "Gar nicht", never an arbitrary timed source.
 *
 * Picking "Weiter" from the main select writes `kind:"advance"` with `from` defaulted to
 * computeAdvanceChainTail(page, targetNodeId) - appended after whatever's already queued, so the
 * common case ("add this block, set it to Weiter") just works without the author having to think
 * about ordering. A second select, "Nach welchem Ereignis", then appears so that default can be
 * overridden - reorders this item within the chain (or combines it with an ordinary timed event:
 * "fires on the next Weiter press after X", where X doesn't have to be Weiter-triggered itself).
 * The delay field only makes sense for a plain timed trigger, so it's hidden whenever the second
 * select is shown instead.
 */
export function TriggerPicker({
  page,
  targetNodeId,
  trigger,
  options,
  allowNoTrigger,
  noTriggerLabel,
  onChange,
}: {
  page: Page;
  targetNodeId: string;
  trigger: ResolvedTrigger | null;
  options: { id: string; label: string }[];
  allowNoTrigger: boolean;
  noTriggerLabel: string;
  onChange: (from: string | null, delayMs: number, kind: TimelineEdgeKind) => void;
}) {
  const mainValue = trigger?.kind === "advance" ? ADVANCE_SENTINEL : (trigger?.from ?? "");
  // Nothing that already waits for this event (directly or further up its own chain) can be what
  // triggers it - that would be a loop of events each waiting for the next, none of which would ever
  // happen. The current source stays listed regardless, so the select always shows what's stored.
  const sources = options.filter((event) => event.id === trigger?.from || canTriggerFrom(page, event.id, targetNodeId));

  function handleMainChange(value: string) {
    if (value === ADVANCE_SENTINEL) onChange(computeAdvanceChainTail(page, targetNodeId), 0, "advance");
    else if (value === "") onChange(null, 0, "timed");
    else onChange(value, trigger?.kind === "timed" ? trigger.delayMs : 0, "timed");
  }

  return (
    <>
      <label className="weft-field">
        <span>Ausgelöst durch</span>
        <select value={mainValue} onChange={(e) => handleMainChange(e.target.value)}>
          {allowNoTrigger && <option value="">{noTriggerLabel}</option>}
          <option value={ADVANCE_SENTINEL}>Weiter</option>
          {sources.map((event) => (
            <option key={event.id} value={event.id}>
              {event.label}
            </option>
          ))}
        </select>
      </label>
      {trigger?.kind === "advance" ? (
        <label className="weft-field">
          <span>Nach welchem Ereignis</span>
          <select value={trigger.from} onChange={(e) => onChange(e.target.value, 0, "advance")}>
            {sources.map((event) => (
              <option key={event.id} value={event.id}>
                {event.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="weft-field">
          <span>Verzögerung (Sekunden)</span>
          <input
            type="number"
            min={0}
            step={0.1}
            disabled={trigger === null}
            value={(trigger?.kind === "timed" ? trigger.delayMs : 0) / 1000}
            onChange={(e) => {
              const seconds = Number(e.target.value);
              if (!Number.isFinite(seconds) || seconds < 0 || !trigger || trigger.kind !== "timed") return;
              onChange(trigger.from, Math.round(seconds * 1000), "timed");
            }}
          />
        </label>
      )}
    </>
  );
}
