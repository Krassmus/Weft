import { renameBranch, renameLogicBlock, updateBranchCondition } from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";
import { isBooleanVariable } from "../../../core/document/variables";
import type { LogicBlock, VariableCondition } from "../../../core/types";
import { Collapsible } from "../Collapsible";

const COMPARATORS: { value: VariableCondition["comparator"]; label: string }[] = [
  { value: "eq", label: "=" },
  { value: "neq", label: "≠" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
];

export function LogicBlockPanel({ logicBlock }: { logicBlock: LogicBlock }) {
  const variables = useDocumentStore((s) => s.doc.content.variables);

  return (
    <>
      <Collapsible title="Logikblock">
        <p className="weft-hint">
          Wird von oben nach unten geprüft: Zweig 1 gewinnt, wenn seine Bedingung zutrifft, sonst Zweig 2 usw. Der
          letzte Zweig hat keine Bedingung und greift immer, wenn keiner der anderen zutraf – wie ein "sonst".
          Danach geht es zurück in die Hauptfolge; Zweige können keine weiteren Logikblöcke enthalten.
        </p>
        <label className="weft-field">
          <span>Name</span>
          <input value={logicBlock.name} onChange={(e) => renameLogicBlock(logicBlock.id, e.target.value)} />
        </label>
      </Collapsible>

      {logicBlock.branches.map((branch, index) => {
        const isLast = index === logicBlock.branches.length - 1;
        const condition = branch.condition;
        const conditionTarget = variables.find((v) => v.id === condition?.variableId);
        const compareAsBoolean = !!conditionTarget && isBooleanVariable(conditionTarget);

        return (
          <Collapsible key={branch.id} title={`${index + 1}. ${branch.label}`}>
            <label className="weft-field">
              <span>Bezeichnung</span>
              <input value={branch.label} onChange={(e) => renameBranch(logicBlock.id, branch.id, e.target.value)} />
            </label>

            {isLast ? (
              <p className="weft-hint">Sonst – greift immer, wenn keine Bedingung der Zweige davor zutraf.</p>
            ) : (
              <div className="weft-condition-row">
                <select
                  value={condition?.variableId ?? ""}
                  onChange={(e) => {
                    const chosen = variables.find((v) => v.id === e.target.value);
                    // A Ja/Nein variable is compared with Ja or Nein; switching away from one drops that
                    // boolean so the text field doesn't start out holding "true".
                    const value =
                      chosen && isBooleanVariable(chosen) ? true : typeof condition?.value === "boolean" ? "" : condition?.value;
                    updateBranchCondition(logicBlock.id, branch.id, { variableId: e.target.value, ...(value !== undefined && { value }) });
                  }}
                >
                  {variables.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <select
                  value={condition?.comparator ?? "eq"}
                  onChange={(e) =>
                    updateBranchCondition(logicBlock.id, branch.id, { comparator: e.target.value as VariableCondition["comparator"] })
                  }
                >
                  {COMPARATORS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {compareAsBoolean ? (
                  <select
                    value={condition?.value === true || condition?.value === "true" ? "yes" : "no"}
                    onChange={(e) => updateBranchCondition(logicBlock.id, branch.id, { value: e.target.value === "yes" })}
                  >
                    <option value="yes">Ja</option>
                    <option value="no">Nein</option>
                  </select>
                ) : (
                  <input
                    value={String(condition?.value ?? "")}
                    onChange={(e) => updateBranchCondition(logicBlock.id, branch.id, { value: e.target.value })}
                  />
                )}
              </div>
            )}
          </Collapsible>
        );
      })}
    </>
  );
}
