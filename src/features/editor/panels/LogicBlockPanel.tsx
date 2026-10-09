import { addBranch, moveBranch, renameBranch, renameLogicBlock, updateBranchCondition } from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";
import type { LogicBlock } from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { removeBranchWithConfirm } from "../removeBranchWithConfirm";
import { ConditionFields } from "./ConditionFields";

export function LogicBlockPanel({ logicBlock }: { logicBlock: LogicBlock }) {
  // A new branch's page starts with the layout of the module's first one.
  const firstLayoutId = useDocumentStore((s) => Object.keys(s.doc.content.layouts)[0] ?? null);
  const select = useDocumentStore((s) => s.select);

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
        <button
          type="button"
          className="weft-ghost-button weft-full-width"
          onClick={() => {
            const branchId = addBranch(logicBlock.id, firstLayoutId);
            // The new branch is the last but one (before the "sonst") - its slide is what is shown next.
            const branch = useDocumentStore.getState().doc.content.logicBlocks[logicBlock.id]?.branches.find((b) => b.id === branchId);
            const pageId = branch ? Object.keys(branch.pages)[0] : undefined;
            if (pageId) select({ type: "page", pageId });
          }}
        >
          + Zweig hinzufügen
        </button>
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
              <p className="weft-hint">Sonst – greift immer, wenn keine Bedingung der Zweige davor zutraf. Wird der Zweig weiter nach oben geschoben, bekommt er eine eigene Bedingung; der Zweig, der dann zuletzt kommt, wird zum „sonst“ und verliert seine.</p>
            ) : (
              <ConditionFields condition={condition} onChange={(patch) => updateBranchCondition(logicBlock.id, branch.id, patch)} />
            )}
            <div className="weft-jump-actions">
              <button type="button" className="weft-ghost-button" disabled={index === 0} onClick={() => moveBranch(logicBlock.id, branch.id, -1)}>
                ↑ Früher prüfen
              </button>
              <button
                type="button"
                className="weft-ghost-button"
                disabled={isLast}
                onClick={() => moveBranch(logicBlock.id, branch.id, 1)}
              >
                ↓ Später prüfen
              </button>
              <button
                type="button"
                className="weft-ghost-button"
                disabled={logicBlock.branches.length <= 1}
                onClick={() => void removeBranchWithConfirm(logicBlock.id, branch.id)}
              >
                Zweig löschen
              </button>
            </div>
          </Collapsible>
        );
      })}
    </>
  );
}
