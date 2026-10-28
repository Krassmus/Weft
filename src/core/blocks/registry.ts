import type { Block } from "../types";
import type { BlockDescriptor, FieldSpec, TaskSpec } from "./types";
import { solutionBlock } from "./solution/descriptor";

/**
 * Every kind of block that describes itself (see BlockDescriptor), by its kind. The stations that treat all blocks alike ask here; a kind that is
 * not in it yet is still known to them by hand - what they know by hand about the kinds that have not been moved here is below.
 */
const descriptors = new Map<string, BlockDescriptor<never>>();

export function registerBlock<B extends Block>(descriptor: BlockDescriptor<B>): void {
  descriptors.set(descriptor.kind, descriptor as unknown as BlockDescriptor<never>);
}

registerBlock(solutionBlock);

/** The descriptor of a kind, if it has one. */
export function descriptorOf<B extends Block>(block: B): BlockDescriptor<B> | undefined;
export function descriptorOf(kind: string): BlockDescriptor | undefined;
export function descriptorOf(kindOrBlock: string | Block): BlockDescriptor | undefined {
  const kind = typeof kindOrBlock === "string" ? kindOrBlock : kindOrBlock.kind;
  return descriptors.get(kind) as unknown as BlockDescriptor | undefined;
}

export function describedKinds(): string[] {
  return [...descriptors.keys()];
}

/** The fields of a block's kind that the descriptor describes, by name (none for a kind without a descriptor). */
export function fieldsOf(block: Block): [string, FieldSpec][] {
  return Object.entries(descriptorOf(block)?.fields ?? {}) as [string, FieldSpec][];
}

// The kinds that have not been moved to a descriptor yet and have the events of a quiz / cannot be in a layout.
const TASK_KINDS_BY_HAND = new Set(["quiz", "cloze", "checker", "matching", "sort"]);
const PAGE_ONLY_KINDS_BY_HAND = new Set(["quiz", "cloze", "checker", "matching", "sort", "gallery", "script"]);

/** Whether the block has the events of a quiz in the page's graph: the first answer, submitted, and submitted right / wrong. */
export function isTaskBlock(block: { kind: string }): boolean {
  return TASK_KINDS_BY_HAND.has(block.kind) || !!descriptorOf(block.kind)?.task;
}

/** What the events of a task block are called, if its kind describes it (the other kinds name them by hand). */
export function taskSpecOf(block: { kind: string }): TaskSpec | undefined {
  return descriptorOf(block.kind)?.task;
}

/** Whether a kind cannot be in a layout (it holds a state, or needs an answer). */
export function isPageOnlyKind(kind: string): boolean {
  return PAGE_ONLY_KINDS_BY_HAND.has(kind) || !!descriptorOf(kind)?.placement.pageOnly;
}

/**
 * The texts of a block that the learner sees (the fields marked `shown`), each as the block's own wording and every other language's - for a block
 * without a descriptor none.
 */
export function shownWordings(block: Block): { own: string; translated: string[] }[] {
  const record = block as unknown as Record<string, unknown>;
  const translations = Object.values((record.translations as Record<string, Record<string, unknown>> | undefined) ?? {});
  return fieldsOf(block)
    .filter(([, spec]) => spec.type === "text" && spec.shown)
    .map(([name, spec]) => {
      const key = (spec.type === "text" && spec.translationKey) || name;
      return {
        own: (record[name] as string | undefined) ?? "",
        translated: translations.flatMap((t) => (typeof t[key] === "string" ? [t[key] as string] : [])),
      };
    });
}

/** The texts of a block that `weft text export` lists: its translatable text fields that say what they are (`cli`), in the order of the descriptor. */
export function exportedTexts(block: Block): { name: string; key: string; part: string; role: string; value: string }[] {
  const record = block as unknown as Record<string, unknown>;
  return fieldsOf(block).flatMap(([name, spec]) =>
    spec.type === "text" && spec.translatable && spec.cli
      ? [{ name, key: spec.translationKey ?? name, part: spec.cli.part, role: spec.cli.role, value: (record[name] as string | undefined) ?? "" }]
      : [],
  );
}
