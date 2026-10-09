import { renameBranch, renameLogicBlock, updateBranchCondition } from "../../../core/document/actions";
import type { LogicBlock } from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { ConditionFields } from "./ConditionFields";

export function LogicBlockPanel({ logicBlock }: { logicBlock: LogicBlock }) {
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

        return (
          <Collapsible key={branch.id} title={`${index + 1}. ${branch.label}`}>
            <label className="weft-field">
              <span>Bezeichnung</span>
              <input value={branch.label} onChange={(e) => renameBranch(logicBlock.id, branch.id, e.target.value)} />
            </label>

            {isLast ? (
              <p className="weft-hint">Sonst – greift immer, wenn keine Bedingung der Zweige davor zutraf.</p>
            ) : (
              <ConditionFields condition={condition} onChange={(patch) => updateBranchCondition(logicBlock.id, branch.id, patch)} />
            )}
          </Collapsible>
        );
      })}
    </>
  );
}
