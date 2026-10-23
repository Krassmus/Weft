/**
 * Changes to a module as a list of small steps, found by comparing two states of it (diffJson) and put on a live document (applyJsonPatches).
 * The command line tool works on a copy of what is open in the app; what it changed goes back as these steps - so that what the person
 * typed in the meantime stays, instead of the whole module being replaced by the copy.
 *
 * Objects are compared field by field; a list, a text or a number that differs is replaced as a whole (the module keeps its sequences
 * as objects with an `order`, see document/ordering.ts, so lists are small: the options of a quiz, the stops of a gradient).
 */
export type JsonPath = (string | number)[];

export interface JsonPatch {
  path: JsonPath;
  op: "set" | "del";
  /** For "set": the new value (plain JSON). */
  value?: unknown;
}

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => same(item, b[index]));
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) if (!same(left[key], right[key])) return false;
  return true;
}

/** The steps that lead from `before` to `after`. */
export function diffJson(before: unknown, after: unknown, path: JsonPath = []): JsonPatch[] {
  if (same(before, after)) return [];
  if (!isObject(before) || !isObject(after)) return [{ path, op: "set", value: after }];
  const patches: JsonPatch[] = [];
  for (const key of Object.keys(before)) {
    if (!(key in after) || after[key] === undefined) patches.push({ path: [...path, key], op: "del" });
  }
  for (const key of Object.keys(after)) {
    if (after[key] === undefined) continue;
    if (!(key in before)) patches.push({ path: [...path, key], op: "set", value: after[key] });
    else patches.push(...diffJson(before[key], after[key], [...path, key]));
  }
  return patches;
}

/**
 * Puts the steps on `root` (a draft of the live module, inside its change). A step whose place is not there any more (the person deleted
 * that slide meanwhile) is skipped, not forced; the counts say how many were applied and how many were not.
 */
export function applyJsonPatches(root: unknown, patches: JsonPatch[]): { applied: number; skipped: number } {
  let applied = 0;
  let skipped = 0;
  for (const patch of patches) {
    let node: any = root;
    for (const key of patch.path.slice(0, -1)) node = node === null || typeof node !== "object" ? undefined : node[key];
    const last = patch.path[patch.path.length - 1];
    if (node === null || typeof node !== "object" || last === undefined) {
      skipped++;
      continue;
    }
    if (patch.op === "del") delete node[last];
    else node[last] = patch.value === undefined ? null : JSON.parse(JSON.stringify(patch.value));
    applied++;
  }
  return { applied, skipped };
}
