import { useDocumentStore } from "../../../core/document/store";
import { isBooleanVariable } from "../../../core/document/variables";
import type { VariableCondition } from "../../../core/types";

const COMPARATORS: { value: VariableCondition["comparator"]; label: string }[] = [
  { value: "eq", label: "=" },
  { value: "neq", label: "≠" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
];

/** A condition on a variable - "variable, comparison, value" - as a row of controls: the branches of a logic block and the ways
 * out of a jump page are chosen by one. `onChange` gets only what was changed. */
export function ConditionFields({ condition, onChange }: { condition: VariableCondition | null | undefined; onChange: (patch: Partial<VariableCondition>) => void }) {
  const variables = useDocumentStore((s) => s.doc.content.variables);
  const conditionTarget = variables.find((v) => v.id === condition?.variableId);
  const compareAsBoolean = !!conditionTarget && isBooleanVariable(conditionTarget);

  return (
    <div className="weft-condition-row">
      <select
        value={condition?.variableId ?? ""}
        onChange={(e) => {
          const chosen = variables.find((v) => v.id === e.target.value);
          // A Ja/Nein variable is compared with Ja or Nein; switching away from one drops that
          // boolean so the text field doesn't start out holding "true".
          const value = chosen && isBooleanVariable(chosen) ? true : typeof condition?.value === "boolean" ? "" : condition?.value;
          onChange({ variableId: e.target.value, ...(value !== undefined && { value }) });
        }}
      >
        {variables.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
      <select value={condition?.comparator ?? "eq"} onChange={(e) => onChange({ comparator: e.target.value as VariableCondition["comparator"] })}>
        {COMPARATORS.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      {compareAsBoolean ? (
        <select
          value={condition?.value === true || condition?.value === "true" ? "yes" : "no"}
          onChange={(e) => onChange({ value: e.target.value === "yes" })}
        >
          <option value="yes">Ja</option>
          <option value="no">Nein</option>
        </select>
      ) : (
        <input value={String(condition?.value ?? "")} onChange={(e) => onChange({ value: e.target.value })} />
      )}
    </div>
  );
}
