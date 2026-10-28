import { canTriggerFrom, computeAdvanceChainTail, isConditionNodeId } from "../../../core/document/pageTimeline";
import { useDocumentStore } from "../../../core/document/store";
import { formulaProblem } from "../../../core/document/variables";
import { virtualVariableNamesFor } from "../../../core/document/virtualVariables";
import type { ResolvedTrigger } from "../../../core/document/pageTimeline";
import type { Page, TimelineEdgeKind } from "../../../core/types";
import { tr } from "../../../core/i18n/tr";
import { SecondsControl } from "./SecondsControl";
import { FormulaInput } from "./VariablesTab";

// A UI-only sentinel for the main select's "Weiter" option - never itself written into the
// document (see handleMainChange below, which always resolves it to a real node id + kind
// "advance" before calling onChange). Distinct from any real node id (those are all either
// "start"/"end" or one of pageTimeline.ts's own `*NodeId` shapes, none of which look like this).
const ADVANCE_SENTINEL = "__advance__";
// The same for "Variable" (a condition: see PageTimeline.conditions) - written as the condition's own event, with the formula.
const CONDITION_SENTINEL = "__condition__";

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
  canUse,
  advanceFrom,
  condition,
}: {
  page: Page;
  targetNodeId: string;
  trigger: ResolvedTrigger | null;
  options: { id: string; label: string }[];
  allowNoTrigger: boolean;
  noTriggerLabel: string;
  onChange: (from: string | null, delayMs: number, kind: TimelineEdgeKind) => void;
  /** Further limits what may be offered as the source (an Aktionseffekt takes nothing from before its block's Aufbau or after its Abbau). */
  canUse?: (candidateId: string) => boolean;
  /** What "Weiter" waits after: by default the end of the page's chain. */
  advanceFrom?: string;
  /** Offers "Variable" as a trigger: the event happens when the formula turns from false to true (and once when the slide is entered, if it is
   * true then). `formula` is the one stored for this target (null: none); `onChange` stores one - and makes it the trigger. */
  condition?: { formula: string | null; onChange: (formula: string) => void };
}) {
  const variables = useDocumentStore((s) => s.doc.content.variables);
  const languages = useDocumentStore((s) => s.doc.content.languages);
  const isCondition = !!condition && !!trigger && isConditionNodeId(trigger.from);
  const mainValue = isCondition ? CONDITION_SENTINEL : trigger?.kind === "advance" ? ADVANCE_SENTINEL : (trigger?.from ?? "");
  // Nothing that already waits for this event (directly or further up its own chain) can be what
  // triggers it - that would be a loop of events each waiting for the next, none of which would ever
  // happen. The current source stays listed regardless, so the select always shows what's stored.
  // (The condition of another event is not a source to pick: it is part of that event's own trigger.)
  const sources = options.filter((event) => !isConditionNodeId(event.id) && (event.id === trigger?.from || (canTriggerFrom(page, event.id, targetNodeId) && (!canUse || canUse(event.id)))));

  function handleMainChange(value: string) {
    if (value === CONDITION_SENTINEL) condition?.onChange(condition.formula ?? "");
    else if (value === ADVANCE_SENTINEL) onChange(advanceFrom ?? computeAdvanceChainTail(page, targetNodeId), 0, "advance");
    else if (value === "") onChange(null, 0, "timed");
    else onChange(value, trigger?.kind === "timed" ? trigger.delayMs : 0, "timed");
  }

  return (
    <>
      <label className="weft-field">
        <span>{tr("ui.triggered_by")}</span>
        <select value={mainValue} onChange={(e) => handleMainChange(e.target.value)}>
          {allowNoTrigger && <option value="">{noTriggerLabel}</option>}
          <option value={ADVANCE_SENTINEL}>{tr("ui.next")}</option>
          {condition && <option value={CONDITION_SENTINEL}>{tr("ui.condition_option")}</option>}
          {sources.map((event) => (
            <option key={event.id} value={event.id}>
              {event.label}
            </option>
          ))}
        </select>
      </label>
      {isCondition && condition ? (
        <div className="weft-field">
          <span>{tr("ui.condition_formula")}</span>
          <FormulaInput
            value={condition.formula ?? ""}
            placeholder={tr("ui.condition_placeholder")}
            invalid={(condition.formula ?? "").trim() !== "" && formulaProblem(condition.formula ?? "", variables, virtualVariableNamesFor(languages)) !== null}
            onCommit={condition.onChange}
          />
          {(condition.formula ?? "").trim() !== "" && formulaProblem(condition.formula ?? "", variables, virtualVariableNamesFor(languages)) && (
            <p className="weft-variable-problem">⚠ {formulaProblem(condition.formula ?? "", variables, virtualVariableNamesFor(languages))}</p>
          )}
          <p className="weft-hint">{tr("ui.condition_hint")}</p>
        </div>
      ) : trigger?.kind === "advance" ? (
        <label className="weft-field">
          <span>{tr("ui.after_which_event")}</span>
          <select value={trigger.from} onChange={(e) => onChange(e.target.value, 0, "advance")}>
            {sources.map((event) => (
              <option key={event.id} value={event.id}>
                {event.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="weft-field">
          <span>{tr("ui.delay_in_seconds")}</span>
          <SecondsControl
            label={tr("ui.delay_seconds")}
            disabled={trigger === null}
            valueMs={trigger?.kind === "timed" ? trigger.delayMs : 0}
            onChange={(delayMs) => {
              if (trigger?.kind === "timed") onChange(trigger.from, delayMs, "timed");
            }}
          />
        </div>
      )}
    </>
  );
}
