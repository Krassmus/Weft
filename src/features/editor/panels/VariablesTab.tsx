import { useEffect, useMemo, useRef, useState } from "react";
import { addVariable, removeVariable, updateVariable } from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";
import { computedVariableProblems, isComputedVariable } from "../../../core/document/variables";
import { VIRTUAL_VARIABLES, VIRTUAL_VARIABLE_NAMES } from "../../../core/document/virtualVariables";
import type { VariableDef, VariableType } from "../../../core/types";

const TYPE_LABELS: Record<VariableType, string> = {
  number: "Zahl",
  string: "Text",
  boolean: "Ja/Nein",
  computed: "Berechnet",
};

export function VariablesTab() {
  const variables = useDocumentStore((s) => s.doc.content.variables);
  const problems = useMemo(() => computedVariableProblems(variables, VIRTUAL_VARIABLE_NAMES), [variables]);
  // The always-present ones come first - `success`, then the virtual ones like `progress` - and the
  // author's own variables below them, all in one list.
  const builtin = variables.filter((v) => v.fixed);
  const custom = variables.filter((v) => !v.fixed);

  return (
    <div className="weft-tab-panel">
      <p className="weft-hint">
        Globale Variablen für das ganze Modul. Quiz- und andere interaktive Blöcke können sie ändern
        (meist per "addieren"); Logikblöcke können anhand ihres Werts verzweigen.
      </p>
      <div className="weft-variable-list">
        {builtin.map((v) => (
          <VariableRow key={v.id} variable={v} problem={problems.get(v.id)} />
        ))}
        {VIRTUAL_VARIABLES.map((v) => (
          <VirtualVariableRow key={v.name} name={v.name} range={v.range} description={v.description} />
        ))}
        {custom.map((v) => (
          <VariableRow key={v.id} variable={v} problem={problems.get(v.id)} />
        ))}
      </div>
      <button type="button" className="weft-ghost-button weft-full-width" onClick={() => addVariable("neueVariable", "number")}>
        + Variable
      </button>

      {variables.some(isComputedVariable) && (
        <>
          <h4 className="weft-variable-virtual-title">Berechnete Variablen</h4>
          <p className="weft-hint">
            Eine berechnete Variable hat keinen eigenen Wert, sondern rechnet ihn aus anderen Variablen aus - z. B.
            mit <code>score &gt; 10 &amp;&amp; progress === 100</code>. Das Ergebnis lässt sich wie jede Variable in
            Texten und Logikblöcken verwenden, nicht aber per Quiz-Effekt ändern.
          </p>
          <p className="weft-hint">
            Die Berechnung ist ein JavaScript-Ausdruck (wird aber nie als JavaScript ausgeführt): Zahlen, "Text",
            true/false, Variablennamen, + - * / % **, Vergleiche (== != === !== &lt; &lt;= &gt; &gt;=), ! && ||,
            <code> Bedingung ? dann : sonst</code>, Klammern und Math.round / floor / ceil / abs / min / max. Statt
            && || ! gehen auch und / oder / nicht (and / or / not), statt true / false auch wahr / falsch. Namen mit
            Leerzeichen schreibst du in `Backticks`.
          </p>
        </>
      )}
    </div>
  );
}

/** The type choices: all of them for a variable of the author's own, only Ja/Nein and Berechnet for
 * the built-in `success`. */
function typeOptions(variable: VariableDef): VariableType[] {
  return variable.fixed ? ["boolean", "computed"] : (Object.keys(TYPE_LABELS) as VariableType[]);
}

/** A virtual variable (`progress`): there to be used in texts and formulas, so it only shows its
 * name and the range it takes - nothing to edit or remove. */
function VirtualVariableRow({ name, range, description }: { name: string; range: string; description: string }) {
  return (
    <div className="weft-variable-item" title={description}>
      <div className="weft-variable-row">
        <input value={name} disabled readOnly />
        <select value="range" disabled>
          <option value="range">{range}</option>
        </select>
        <span className="weft-variable-row-spacer" />
      </div>
    </div>
  );
}

function VariableRow({ variable, problem }: { variable: VariableDef; problem: string | undefined }) {
  return (
    <div className="weft-variable-item">
      <div className="weft-variable-row">
        <input
          value={variable.name}
          disabled={variable.fixed}
          title={variable.fixed ? "Eingebaute Variable - der Name ist fest" : undefined}
          onChange={(e) => updateVariable(variable.id, { name: e.target.value })}
        />
        <select value={variable.type} onChange={(e) => updateVariable(variable.id, { type: e.target.value as VariableType })}>
          {typeOptions(variable).map((type) => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        {variable.fixed ? (
          // Keeps the columns of every row lined up where the remove button would be.
          <span className="weft-variable-row-spacer" />
        ) : (
          <button type="button" className="weft-icon-button" onClick={() => removeVariable(variable.id)} title="Entfernen">
            ×
          </button>
        )}
      </div>
      {variable.type === "computed" && (
        <>
          <FormulaInput
            value={variable.expression ?? ""}
            placeholder="z. B. score > 10 && progress === 100"
            invalid={!!problem}
            onCommit={(expression) => updateVariable(variable.id, { expression })}
          />
          {problem && <p className="weft-variable-problem">⚠ {problem}</p>}
        </>
      )}
    </div>
  );
}

// How long after the last keystroke a formula is committed to the document - one undo step per
// burst of typing rather than one per character, yet quick enough that a save never misses it.
const FORMULA_COMMIT_DELAY_MS = 500;

/** A formula text field: edited locally, committed shortly after typing pauses and when it loses
 * focus, and kept in step with the document (undo, ...) whenever it isn't being typed in. */
function FormulaInput({
  value,
  placeholder,
  invalid,
  onCommit,
}: {
  value: string;
  placeholder: string;
  invalid: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const latest = useRef({ draft, value, onCommit });
  latest.current = { draft, value, onCommit };

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  function commitNow() {
    const { draft: current, value: saved, onCommit: commit } = latest.current;
    if (current !== saved) commit(current);
  }

  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(commitNow, FORMULA_COMMIT_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(
    () => () => {
      if (focused.current) commitNow();
    },
    [],
  );

  return (
    <input
      className={"weft-formula-input" + (invalid ? " is-invalid" : "")}
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        commitNow();
      }}
    />
  );
}
