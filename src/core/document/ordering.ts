import { isDraft } from "immer";

/**
 * Ordered collections for a document that can be merged (CRDT-friendly): a list whose entries are
 * moved around (the blocks' stacking order, the page sequence) is NOT stored as an array, because a
 * move is a delete + insert there - two people moving the same entry at once would leave two copies
 * of it. Instead such a list is a Record keyed by the entry's id, and every entry carries an `order`
 * string; moving an entry only changes that one scalar (concurrent moves: the last one wins, nothing
 * is duplicated), and the list is whatever the entries sort to (orderedValues).
 *
 * `order` strings are fractional keys (as in "fractional indexing"): there's always a string
 * strictly between two others, so an entry can be put between any two neighbours by writing just its
 * own key - no other entry is renumbered. They compare by plain `<` (UTF-16 code units; the digits
 * below are in ASCII order) and never end in the lowest digit, which keeps every key reachable from
 * both sides. Two entries given the same key by concurrent inserts are told apart by their id.
 */
export interface Ordered {
  order: string;
}

/** `T` as it is before it has been put somewhere (distributes over a union). */
export type WithoutOrder<T> = T extends unknown ? Omit<T, "order"> : never;

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = DIGITS.length;

function digitValue(char: string | undefined): number {
  const value = char === undefined ? 0 : DIGITS.indexOf(char);
  if (value < 0) throw new Error(`Ungültiger Order-Schlüssel (Zeichen "${char}")`);
  return value;
}

/** A key strictly between `a` ("" = the very beginning) and `b` (null = the very end), as digit
 * strings read as fractions 0.d1d2d3...; requires a < b. */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    // Keys share a prefix: it stays, only what comes after it needs a midpoint.
    let n = 0;
    while ((a[n] ?? DIGITS[0]) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const digitA = digitValue(a[0]);
  const digitB = b !== null ? digitValue(b[0]) : BASE;
  if (digitB - digitA > 1) {
    // Appending to / prepending before the list takes the very next / previous digit instead of the
    // middle one: the common case (new block on top, new page at the end) then grows a key by one
    // character per ~60 entries instead of per ~5.
    if (b === null && a.length > 0) return DIGITS[digitA + 1];
    if (a.length === 0 && b !== null) return DIGITS[digitB - 1];
    return DIGITS[Math.round(0.5 * (digitA + digitB))];
  }
  // Neighbouring first digits: either b's own first digit alone fits (b continues after it), or a's
  // first digit stays and the rest is a midpoint to the end.
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[digitA] + midpoint(a.slice(1), null);
}

/** A key that sorts strictly between `before` and `after` (either may be null: nothing on that
 * side). Equal or inverted neighbours - only possible after concurrent inserts picked the same key -
 * can't have anything between them; the key then goes right after `before` (which is as good as
 * any place among entries the author can't tell apart anyway). */
export function keyBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) return midpoint(before, null);
  return midpoint(before ?? "", after);
}

/** `count` increasing keys that all sort between `before` and `after` - spread out evenly (by
 * halving), so a long run doesn't give its keys a length that grows with every one. */
export function keysBetween(before: string | null, after: string | null, count: number): string[] {
  if (count <= 0) return [];
  const middleIndex = Math.floor(count / 2);
  const middle = keyBetween(before, after);
  return [...keysBetween(before, middle, middleIndex), middle, ...keysBetween(middle, after, count - middleIndex - 1)];
}

const cache = new WeakMap<object, unknown[]>();

/** The entries in order. Memoized per record while it's an immutable snapshot (so a React
 * component calling it every render gets the same array until something changed); anything still
 * being edited is sorted fresh every time. */
export function orderedValues<T extends Ordered>(record: Record<string, T>): T[] {
  const draft = isDraft(record);
  // Only a frozen record (what an edit produces) is a snapshot that can't change under the cache -
  // a plain object being filled in (a document that's just been parsed, a migration) can.
  const cacheable = !draft && Object.isFrozen(record);
  if (cacheable) {
    const cached = cache.get(record);
    if (cached) return cached as T[];
  }
  const sorted = Object.entries(record)
    .sort(([idA, a], [idB, b]) => (a.order < b.order ? -1 : a.order > b.order ? 1 : idA < idB ? -1 : idA > idB ? 1 : 0))
    .map(([, value]) => value);
  if (cacheable) cache.set(record, sorted);
  return sorted;
}

/** The ids (record keys) in order - same order as orderedValues. */
export function orderedKeys<T extends Ordered>(record: Record<string, T>): string[] {
  return Object.entries(record)
    .sort(([idA, a], [idB, b]) => (a.order < b.order ? -1 : a.order > b.order ? 1 : idA < idB ? -1 : idA > idB ? 1 : 0))
    .map(([id]) => id);
}

function keyAtIndex(list: Ordered[], index: number): string {
  const clamped = Math.min(Math.max(index, 0), list.length);
  return keyBetween(list[clamped - 1]?.order ?? null, list[clamped]?.order ?? null);
}

/** Puts `value` into `record` under `id`, at `index` in the current order (default: the end - on
 * top, for blocks). */
export function insertOrdered<T extends Ordered>(record: Record<string, T>, id: string, value: WithoutOrder<T>, index?: number): void {
  const list = orderedValues(record);
  (record as Record<string, unknown>)[id] = { ...value, order: keyAtIndex(list, index ?? list.length) };
}

/** Moves entry `id` so that it sits at `toIndex` of the list WITHOUT it (the same convention as
 * removing it from an array and splicing it back in). */
export function moveOrdered<T extends Ordered>(record: Record<string, T>, id: string, toIndex: number): void {
  const entry = record[id];
  if (!entry) return;
  const others = orderedValues(record).filter((value) => value !== entry);
  entry.order = keyAtIndex(others, toIndex);
}

/** Re-keys the entries `ids` (in that order) so they sit as one contiguous run at `toIndex` of the
 * list without them. */
export function moveOrderedRun<T extends Ordered>(record: Record<string, T>, ids: string[], toIndex: number): void {
  const moving = new Set(ids.map((id) => record[id]).filter(Boolean));
  const others = orderedValues(record).filter((value) => !moving.has(value));
  const clamped = Math.min(Math.max(toIndex, 0), others.length);
  const keys = keysBetween(others[clamped - 1]?.order ?? null, others[clamped]?.order ?? null, ids.length);
  ids.forEach((id, i) => {
    if (record[id]) record[id].order = keys[i];
  });
}

/** An ordered record built from a plain list, each item stored under `keyOf(item)` - for new
 * documents, migrations and tests. */
export function orderedRecordBy<T extends object>(items: T[], keyOf: (item: T) => string): Record<string, T & Ordered> {
  const keys = keysBetween(null, null, items.length);
  return Object.fromEntries(items.map((item, i) => [keyOf(item), { ...item, order: keys[i] }]));
}

/** orderedRecordBy for items that carry their own `id`. */
export function orderedRecord<T extends { id: string }>(items: T[]): Record<string, T & Ordered> {
  return orderedRecordBy(items, (item) => item.id);
}

/** An ordered set of ids with no data of their own (a branch's pages), in the order given. */
export function orderedIdRecord(ids: string[]): Record<string, Ordered> {
  const keys = keysBetween(null, null, ids.length);
  return Object.fromEntries(ids.map((id, i) => [id, { order: keys[i] }]));
}
