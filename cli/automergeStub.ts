// Stands in for src/core/collab/automerge.ts in the command line tool: a file read from disk is a plain object, never an Automerge
// document (see isSnapshot in core/collab/mutationScope.ts, the only thing in the code the tool uses that asks).
export const Automerge = { getObjectId: (_object: unknown): string | null => null };
export const Repo = undefined;
