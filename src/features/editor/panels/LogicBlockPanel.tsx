import { addBranch, moveBranch, renameBranch, renameLogicBlock, updateBranchCondition } from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";
import type { LogicBlock } from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { removeBranchWithConfirm } from "../removeBranchWithConfirm";
import { ConditionFields } from "./ConditionFields";
import { tr } from "../../../core/i18n/tr";

export function LogicBlockPanel({ logicBlock }: { logicBlock: LogicBlock }) {
  // A new branch's page starts with the layout of the module's first one.
  const firstLayoutId = useDocumentStore((s) => Object.keys(s.doc.content.layouts)[0] ?? null);
  const select = useDocumentStore((s) => s.select);

  return (
    <>
      <Collapsible title={tr("ui.logic_block_2")}>
        <p className="weft-hint">
          {tr("ui.checked_from_top_to_bottom_branch")}
        </p>
        <label className="weft-field">
          <span>{tr("ui.name")}</span>
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
          {tr("ui.add_branch_2")}
        </button>
      </Collapsible>

      {logicBlock.branches.map((branch, index) => {
        const isLast = index === logicBlock.branches.length - 1;
        const condition = branch.condition;

        return (
          <Collapsible key={branch.id} title={tr("ui.text_2", { n0: index + 1, label: branch.label })}>
            <label className="weft-field">
              <span>{tr("ui.name_2")}</span>
              <input value={branch.label} onChange={(e) => renameBranch(logicBlock.id, branch.id, e.target.value)} />
            </label>

            {isLast ? (
              <p className="weft-hint">{tr("ui.otherwise_always_applies_if_no_condition")}</p>
            ) : (
              <ConditionFields condition={condition} onChange={(patch) => updateBranchCondition(logicBlock.id, branch.id, patch)} />
            )}
            <div className="weft-jump-actions">
              <button type="button" className="weft-ghost-button" disabled={index === 0} onClick={() => moveBranch(logicBlock.id, branch.id, -1)}>
                {tr("ui.check_earlier")}
              </button>
              <button
                type="button"
                className="weft-ghost-button"
                disabled={isLast}
                onClick={() => moveBranch(logicBlock.id, branch.id, 1)}
              >
                {tr("ui.check_later")}
              </button>
              <button
                type="button"
                className="weft-ghost-button"
                disabled={logicBlock.branches.length <= 1}
                onClick={() => void removeBranchWithConfirm(logicBlock.id, branch.id)}
              >
                {tr("ui.delete_branch")}
              </button>
            </div>
          </Collapsible>
        );
      })}
    </>
  );
}
