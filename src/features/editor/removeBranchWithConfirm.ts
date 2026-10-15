import { removeBranch } from "../../core/document/actions";
import { useDocumentStore } from "../../core/document/store";
import { confirmDestructive } from "../../core/io/fileIO";
import { tr } from "../../core/i18n/tr";

/** Deletes a branch of a logic block - after asking: its slides go with it. */
export async function removeBranchWithConfirm(logicBlockId: string, branchId: string): Promise<void> {
  const branch = useDocumentStore.getState().doc.content.logicBlocks[logicBlockId]?.branches.find((b) => b.id === branchId);
  if (!branch) return;
  const count = Object.keys(branch.pages).length;
  const slides = count === 0 ? "" : count === 1 ? ` ${tr("ui.with_its_slide")}` : ` ${tr("ui.with_n_slides", { count })}`;
  if (await confirmDestructive(tr("ui.really_delete_the_branch", { label: branch.label, slides: slides }), tr("ui.delete_branch"))) removeBranch(logicBlockId, branchId);
}
