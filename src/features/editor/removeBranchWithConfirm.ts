import { removeBranch } from "../../core/document/actions";
import { useDocumentStore } from "../../core/document/store";
import { confirmDestructive } from "../../core/io/fileIO";

/** Deletes a branch of a logic block - after asking: its slides go with it. */
export async function removeBranchWithConfirm(logicBlockId: string, branchId: string): Promise<void> {
  const branch = useDocumentStore.getState().doc.content.logicBlocks[logicBlockId]?.branches.find((b) => b.id === branchId);
  if (!branch) return;
  const count = Object.keys(branch.pages).length;
  const slides = count === 0 ? "" : count === 1 ? " mit seiner Folie" : ` mit seinen ${count} Folien`;
  if (await confirmDestructive(`Den Zweig „${branch.label}“${slides} wirklich löschen?`, "Zweig löschen")) removeBranch(logicBlockId, branchId);
}
