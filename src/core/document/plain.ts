/**
 * A deep copy made of nothing but plain JSON data: no `undefined` fields, and above all nothing
 * that is still part of a document. A mergeable document (Automerge) refuses both: a value it
 * already holds can't be assigned to a second place ("Cannot create a reference to an existing
 * document object"), and `undefined` isn't a value at all. UI code builds its patches by spreading
 * the objects it was handed from the document ([...block.options, extra], { ...block.translations }),
 * so everything an action takes from outside goes through here before it is written.
 */
export function plain<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

/** `Object.assign(target, patch)` for a document: values are copied (see plain), and a field whose
 * patch value is `undefined` is removed - what "no value" has to mean when `undefined` can't be
 * stored. */
export function assignPatch<T extends object>(target: T, patch: Partial<T> | Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete (target as Record<string, unknown>)[key];
    else (target as Record<string, unknown>)[key] = plain(value);
  }
}

/** Removes every item matching `predicate` from `list` in place (from the back, by index). Assigning
 * a filtered copy back - `list = list.filter(...)` - would put objects that are already in the
 * document into a new list, which a mergeable document refuses; and removing the items one by one
 * also leaves the other items alone for whoever is editing them at the same time. */
export function removeWhere<T>(list: T[], predicate: (item: T) => boolean): void {
  for (let i = list.length - 1; i >= 0; i--) {
    if (predicate(list[i])) list.splice(i, 1);
  }
}
