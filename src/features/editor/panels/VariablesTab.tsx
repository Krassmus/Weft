import { addVariable, removeVariable, updateVariable } from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";
import type { VariableType } from "../../../core/types";

export function VariablesTab() {
  const variables = useDocumentStore((s) => s.doc.content.variables);

  return (
    <div className="weft-tab-panel">
      <p className="weft-hint">
        Globale Variablen für das ganze Modul. Quiz- und andere interaktive Blöcke können sie ändern
        (meist per "addieren"); Logikblöcke können anhand ihres Werts verzweigen.
      </p>
      <div className="weft-variable-list">
        {variables.map((v) => (
          <div key={v.id} className="weft-variable-row">
            <input value={v.name} onChange={(e) => updateVariable(v.id, { name: e.target.value })} />
            <select value={v.type} onChange={(e) => updateVariable(v.id, { type: e.target.value as VariableType })}>
              <option value="number">Zahl</option>
              <option value="string">Text</option>
              <option value="boolean">Ja/Nein</option>
            </select>
            <button type="button" className="weft-icon-button" onClick={() => removeVariable(v.id)} title="Entfernen">
              ×
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="weft-ghost-button weft-full-width" onClick={() => addVariable("neueVariable", "number")}>
        + Variable
      </button>
    </div>
  );
}
