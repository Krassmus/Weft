import { useState } from "react";
import { isBooleanVariable, isSettableVariable } from "../../../core/document/variables";
import { tr } from "../../../core/i18n/tr";
import type { VariableDef, VariableEffect } from "../../../core/types";

/** What a fresh effect on `variable` starts as - an addition for a number, set-to-yes for a Ja/Nein,
 * set-to-empty for text. */
function defaultEffectFor(variable: VariableDef): VariableEffect {
  if (isBooleanVariable(variable)) return { variableId: variable.id, op: "set", value: true };
  if (variable.type === "string") return { variableId: variable.id, op: "set", value: "" };
  return { variableId: variable.id, op: "add", value: 1 };
}

/** The value of an effect. A number is typed as text and only taken over once it is one: while "-" or "1." is on its way to
 * being "-1" or "1.5" it stays as typed (minus points have to be typeable). */
function EffectValueInput({ effect, numeric, onChange }: { effect: VariableEffect; numeric: boolean; onChange: (value: string | number) => void }) {
  const [typed, setTyped] = useState<string | null>(null);
  return (
    <input
      value={typed ?? String(effect.value)}
      inputMode={numeric ? "decimal" : undefined}
      onChange={(e) => {
        const raw = e.target.value;
        if (!numeric) return onChange(raw);
        setTyped(raw);
        const parsed = Number(raw.replace(",", "."));
        if (raw.trim() !== "" && Number.isFinite(parsed)) onChange(parsed);
        else if (raw.trim() === "") onChange(0);
      }}
      onBlur={() => setTyped(null)}
    />
  );
}

export function EffectListEditor({
  effects,
  variables: allVariables,
  onChange,
}: {
  effects: VariableEffect[];
  variables: VariableDef[];
  onChange: (effects: VariableEffect[]) => void;
}) {
  // A computed variable has no value to change, so it's never a target.
  const variables = allVariables.filter(isSettableVariable);
  return (
    <>
      {effects.map((effect, index) => {
        const target = allVariables.find((v) => v.id === effect.variableId);
        const isBoolean = !!target && isBooleanVariable(target);
        return (
          <div key={index} className="weft-effect-row">
            <select
              value={effect.variableId}
              onChange={(e) => {
                const next = [...effects];
                const chosen = variables.find((v) => v.id === e.target.value);
                // Switching between kinds of variable (number/text/Ja-Nein) restarts the effect, since
                // an "add 1" or a text value means nothing on the other kind.
                next[index] =
                  chosen && chosen.type !== target?.type ? defaultEffectFor(chosen) : { ...effect, variableId: e.target.value };
                onChange(next);
              }}
            >
              {/* Keeps showing a target that was computed after the effect was made, rather than a blank. */}
              {target && !isSettableVariable(target) && <option value={target.id}>{target.name} {tr("ui.calculated")}</option>}
              {variables.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <select
              value={effect.op}
              disabled={isBoolean}
              onChange={(e) => {
                const op = e.target.value as VariableEffect["op"];
                const next = [...effects];
                next[index] =
                  op === "add"
                    ? { variableId: effect.variableId, op, value: 1 }
                    : op === "append"
                      ? { variableId: effect.variableId, op, value: "" }
                      : { variableId: effect.variableId, op, value: target?.type === "number" ? 0 : "" };
                onChange(next);
              }}
            >
              <option value="set">{tr("ui.set_to")}</option>
              {!isBoolean && <option value="add">addieren</option>}
              {!isBoolean && <option value="append">{tr("ui.append")}</option>}
            </select>
            {isBoolean ? (
              <select
                value={effect.value === true ? "yes" : "no"}
                onChange={(e) => {
                  const next = [...effects];
                  next[index] = { variableId: effect.variableId, op: "set", value: e.target.value === "yes" };
                  onChange(next);
                }}
              >
                <option value="yes">{tr("ui.yes")}</option>
                <option value="no">{tr("ui.no")}</option>
              </select>
            ) : (
              <EffectValueInput
                effect={effect}
                // A number variable is set/added to with a number, never with text that merely looks like one.
                numeric={effect.op === "add" || (effect.op === "set" && target?.type === "number")}
                onChange={(value) => {
                  const next = [...effects];
                  next[index] = { ...effect, value } as VariableEffect;
                  onChange(next);
                }}
              />
            )}
            <button type="button" className="weft-icon-button" onClick={() => onChange(effects.filter((_, i) => i !== index))}>
              ×
            </button>
          </div>
        );
      })}
      {variables.length > 0 && (
        <button
          type="button"
          className="weft-ghost-button weft-full-width"
          onClick={() => onChange([...effects, defaultEffectFor(variables[0])])}
        >
          {tr("ui.effect_2")}
        </button>
      )}
    </>
  );
}
