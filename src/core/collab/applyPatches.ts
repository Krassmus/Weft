import { Automerge } from "./automerge";

type Path = (string | number)[];

/** Whatever a patch value leaves to the patches that follow it: Automerge reports a new object or
 * list as an empty one first and then each of its fields/elements as patches of their own, and a
 * new string as "" followed by `splice` patches that type its characters in. */
function empty(value: unknown): unknown {
  if (Array.isArray(value)) return [];
  if (value !== null && typeof value === "object") return {};
  return value;
}

function resolve(root: any, path: Path): any {
  let node = root;
  for (const key of path) node = node?.[key];
  return node;
}

/**
 * Applies patches - as Automerge.diff reports them - to a document inside `change`. Used for undo
 * and redo: the patches that lead from the state after a change back to the state before it
 * (Automerge.diff(doc, afterHeads, beforeHeads)) undo exactly what that one change did, and are
 * applied as a new change of their own, on top of whatever has happened since - including what
 * other people changed meanwhile, which a restore of an old snapshot would wipe out.
 */
export function applyPatches(draft: unknown, patches: Automerge.Patch[]): void {
  for (const patch of patches) {
    const path = patch.path as Path;
    const parentPath = path.slice(0, -1);
    const key = path[path.length - 1];
    switch (patch.action) {
      case "put": {
        resolve(draft, parentPath)[key] = empty(patch.value);
        break;
      }
      case "insert": {
        resolve(draft, parentPath).splice(key as number, 0, ...patch.values.map(empty));
        break;
      }
      case "del": {
        const parent = resolve(draft, parentPath);
        if (typeof parent === "string") {
          // Characters of a string: `path` is [...text, index].
          Automerge.splice(draft as Automerge.Doc<unknown>, parentPath as Automerge.Prop[], key as number, patch.length ?? 1);
        } else if (Array.isArray(parent)) {
          parent.splice(key as number, patch.length ?? 1);
        } else {
          delete parent[key];
        }
        break;
      }
      case "splice": {
        Automerge.splice(draft as Automerge.Doc<unknown>, parentPath as Automerge.Prop[], key as number, 0, patch.value);
        break;
      }
      default:
        throw new Error(`Patch "${patch.action}" wird beim Rückgängigmachen nicht unterstützt.`);
    }
  }
}
