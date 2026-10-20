import { addActionEffect, removeActionEffect, setEventTrigger, updateActionEffect } from "../../../core/document/actions";
import {
  actionEffectAdvanceSource,
  actionEffectProblem,
  blockActionNodeId,
  canTriggerActionEffectFrom,
  getActionEffectTrigger,
} from "../../../core/document/pageTimeline";
import { defaultActionEffect } from "../../../core/document/blockEffects";
import { tr } from "../../../core/i18n/tr";
import type { ActionEffect, ActionEffectType, Block, Page } from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { useActionEdit } from "../actionEdit";
import { listPageTriggerEvents } from "../Timeline";
import { SecondsControl } from "./SecondsControl";
import { TriggerPicker } from "./TriggerPicker";
import trashIconSvg from "../../../../mockups/icons/trash.svg?raw";

const TYPES: ActionEffectType[] = ["move", "shake", "blink"];
const TYPE_LABELS: Record<ActionEffectType, () => string> = {
  move: () => tr("ui.action_type_move"),
  shake: () => tr("ui.action_type_shake"),
  blink: () => tr("ui.action_type_blink"),
};

/** The timing functions to choose from (CSS `transition-timing-function` values), and "custom": a cubic-bezier of one's own. */
const EASINGS: { value: string; label: () => string }[] = [
  { value: "linear", label: () => tr("ui.action_easing_linear") },
  { value: "ease", label: () => tr("ui.action_easing_ease") },
  { value: "ease-in", label: () => tr("ui.action_easing_ease_in") },
  { value: "ease-out", label: () => tr("ui.action_easing_ease_out") },
  { value: "ease-in-out", label: () => tr("ui.action_easing_ease_in_out") },
  { value: "cubic-bezier(0.34, 1.56, 0.64, 1)", label: () => tr("ui.action_easing_overshoot") },
];
const CUSTOM_EASING = "custom";
const DEFAULT_CUSTOM_EASING = "cubic-bezier(0.25, 0.1, 0.25, 1)";

/** The four numbers of a `cubic-bezier(a, b, c, d)`, or null when it is not one. */
function parseCubicBezier(easing: string): [number, number, number, number] | null {
  const match = /^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/.exec(easing.trim());
  if (!match) return null;
  const numbers = match.slice(1).map(Number) as [number, number, number, number];
  return numbers.every(Number.isFinite) ? numbers : null;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The "Aktionseffekte" of a block, between its Aufbau and its Abbau: what it does while it is there - move to another place (and turn on
 * the way), shake once, blink once. Each is an event of the page's graph with a trigger of its own (Weiter by default; see
 * placeActionEffect in document/pageTimeline.ts), and a red warning here and in the graph when it can happen before the Aufbau or after
 * the Abbau of the block.
 */
export function ActionEffectsEditor({ block, page }: { block: Block; page: Page }) {
  const effects = block.actionEffects ?? [];
  const events = listPageTriggerEvents(page);
  return (
    <Collapsible title={tr("ui.action_effects")}>
      <p className="weft-hint">{tr("ui.action_hint")}</p>
      {effects.map((effect, index) => (
        <ActionEffectCard key={effect.id} block={block} page={page} effect={effect} index={index} events={events} />
      ))}
      <div className="weft-field">
        <span>{tr("ui.action_add")}</span>
        <div className="weft-action-add">
          {TYPES.map((type) => (
            <button key={type} type="button" className="weft-ghost-button" onClick={() => useActionEdit.getState().edit(block.id, addActionEffect(page.id, block.id, type))}>
              {TYPE_LABELS[type]()}
            </button>
          ))}
        </div>
      </div>
    </Collapsible>
  );
}

export function ActionEffectCard({
  block,
  page,
  effect,
  index,
  events,
  hideTrigger,
}: {
  block: Block;
  page: Page;
  effect: ActionEffect;
  index: number;
  events: { id: string; label: string }[];
  /** Leave out the trigger (the event's own panel lists all its triggers itself). */
  hideTrigger?: boolean;
}) {
  const update = (patch: Partial<Omit<ActionEffect, "id">>) => updateActionEffect(page.id, block.id, effect.id, patch);
  const nodeId = blockActionNodeId(block.id, effect.id);
  const problem = actionEffectProblem(page, block, effect.id);
  const trigger = getActionEffectTrigger(page, block.id, effect.id);
  const target = effect.path && effect.path.length > 0 ? effect.path[effect.path.length - 1] : { x: 0, y: 0 };
  const easing = effect.easing ?? "ease-in-out";
  const known = EASINGS.some((e) => e.value === easing);
  const bezier = parseCubicBezier(easing) ?? parseCubicBezier(DEFAULT_CUSTOM_EASING)!;
  const rotation = effect.rotation ?? 0;

  function setTarget(next: { x: number; y: number }) {
    // The end point of the way; the points before it (a curve with stations) stay.
    const before = (effect.path ?? []).slice(0, -1);
    update({ path: [...before, next] });
  }

  return (
    <div
      className="weft-action-card"
      // The way of a move is drawn on the slide while the author works on its card.
      onFocusCapture={() => useActionEdit.getState().edit(block.id, effect.id)}
      onPointerDownCapture={() => useActionEdit.getState().edit(block.id, effect.id)}
    >
      <div className="weft-action-card-head">
        <select
          value={effect.type}
          aria-label={tr("ui.action_effect_n", { n0: index + 1 })}
          onChange={(e) => {
            const type = e.target.value as ActionEffectType;
            // The fields of a move are there when the effect becomes one (and go when it stops being one).
            const fresh = defaultActionEffect(effect.id, type);
            update(type === "move" ? { type, path: fresh.path, easing: fresh.easing, rotation: fresh.rotation } : { type, path: undefined, easing: undefined, rotation: undefined });
          }}
        >
          {TYPES.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]()}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="weft-icon-button weft-trash-button"
          title={tr("ui.action_remove")}
          aria-label={tr("ui.action_remove")}
          onClick={() => removeActionEffect(page.id, block.id, effect.id)}
          dangerouslySetInnerHTML={{ __html: trashIconSvg }}
        />
      </div>

      {problem && (
        <div className="weft-placeholder-warning">
          <p>{problem === "before-entrance" ? tr("ui.action_problem_before") : tr("ui.action_problem_after")}</p>
        </div>
      )}

      <div className="weft-field">
        <span>{tr("ui.duration_in_seconds")}</span>
        <SecondsControl label={tr("ui.duration_seconds")} minMs={100} valueMs={effect.durationMs} onChange={(durationMs) => update({ durationMs })} />
      </div>

      {effect.type === "move" && (
        <>
          <div className="weft-field-row">
            <label className="weft-field">
              <span>{tr("ui.action_move_x")}</span>
              <input type="number" step={1} value={round(target.x)} onChange={(e) => Number.isFinite(e.target.valueAsNumber) && setTarget({ ...target, x: e.target.valueAsNumber })} />
            </label>
            <label className="weft-field">
              <span>{tr("ui.action_move_y")}</span>
              <input type="number" step={1} value={round(target.y)} onChange={(e) => Number.isFinite(e.target.valueAsNumber) && setTarget({ ...target, y: e.target.valueAsNumber })} />
            </label>
          </div>
          <label className="weft-field">
            <span>{tr("ui.action_easing")}</span>
            <select value={known ? easing : CUSTOM_EASING} onChange={(e) => update({ easing: e.target.value === CUSTOM_EASING ? DEFAULT_CUSTOM_EASING : e.target.value })}>
              {EASINGS.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label()}
                </option>
              ))}
              <option value={CUSTOM_EASING}>{tr("ui.action_easing_custom")}</option>
            </select>
          </label>
          {!known && (
            <div className="weft-action-bezier">
              {bezier.map((value, i) => (
                <input
                  key={i}
                  type="number"
                  step={0.05}
                  min={i % 2 === 0 ? 0 : undefined}
                  max={i % 2 === 0 ? 1 : undefined}
                  value={value}
                  aria-label={`cubic-bezier ${["x1", "y1", "x2", "y2"][i]}`}
                  onChange={(e) => {
                    const typed = e.target.valueAsNumber;
                    if (!Number.isFinite(typed)) return;
                    const next = [...bezier] as [number, number, number, number];
                    next[i] = i % 2 === 0 ? Math.min(1, Math.max(0, typed)) : typed;
                    update({ easing: `cubic-bezier(${next.join(", ")})` });
                  }}
                />
              ))}
            </div>
          )}
          <div className="weft-field">
            <span>{tr("ui.action_rotation")}</span>
            <RotationControl value={rotation} label={tr("ui.action_rotation")} onChange={(value) => update({ rotation: value })} />
          </div>
        </>
      )}

      {!hideTrigger && (
      <TriggerPicker
        page={page}
        targetNodeId={nodeId}
        trigger={trigger}
        options={events}
        allowNoTrigger={false}
        noTriggerLabel=""
        canUse={(candidateId) => canTriggerActionEffectFrom(page, block, effect.id, candidateId)}
        advanceFrom={actionEffectAdvanceSource(page, block, effect.id)}
        onChange={(from, delayMs, kind) => setEventTrigger(page.id, nodeId, from, delayMs, kind)}
      />
      )}
    </div>
  );
}

/** Degrees: any number (typed, or with "−"/"+" in steps of 15), and a slider for -360 to 360. */
function RotationControl({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <span className="weft-delay-control">
      <button type="button" className="weft-delay-step" aria-label={tr("ui.decrease", { label })} onClick={() => onChange(value - 15)}>
        −
      </button>
      <input
        type="number"
        step={1}
        value={value}
        aria-label={label}
        onChange={(e) => Number.isFinite(e.target.valueAsNumber) && onChange(e.target.valueAsNumber)}
      />
      <button type="button" className="weft-delay-step" aria-label={tr("ui.increase", { label })} onClick={() => onChange(value + 15)}>
        +
      </button>
      <input
        type="range"
        className="weft-delay-slider"
        min={-360}
        max={360}
        step={1}
        value={Math.min(360, Math.max(-360, value))}
        aria-label={tr("ui.action_rotation_slider")}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </span>
  );
}
