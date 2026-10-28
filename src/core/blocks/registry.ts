import type { Block } from "../types";
import type { BlockDescriptor, FieldSpec, ListField, TaskSpec, TextField } from "./types";
import { galleryBlock } from "./gallery/descriptor";
import { iframeBlock } from "./iframe/descriptor";
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
registerBlock(galleryBlock);
registerBlock(iframeBlock);

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
const PAGE_ONLY_KINDS_BY_HAND = new Set(["quiz", "cloze", "checker", "matching", "sort", "script"]);

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

/** The lists of a block that describes itself, by name. */
export function listFieldsOf(block: Block): [string, ListField][] {
  return fieldsOf(block).filter((entry): entry is [string, ListField] => entry[1].type === "list");
}

/** The name of the field of an item of a list that holds its words (the one translatable text), if it has one. */
export function itemTextName(list: ListField): string | undefined {
  return Object.entries(list.item).find((entry): entry is [string, TextField] => entry[1].type === "text" && !!entry[1].translatable)?.[0];
}

type Items = { id: string }[];

/** The ids of the assets (files of the module) a block that describes itself uses: in its own fields and in the items of its lists. */
export function assetIdsOfFields(block: Block): string[] {
  const record = block as unknown as Record<string, unknown>;
  const ids: unknown[] = [];
  for (const [name, spec] of fieldsOf(block)) {
    if (spec.type === "asset") ids.push(record[name]);
    else if (spec.type === "list") {
      for (const item of (record[name] as Record<string, unknown>[] | undefined) ?? []) {
        for (const [itemName, itemSpec] of Object.entries(spec.item)) if (itemSpec.type === "asset") ids.push(item[itemName]);
      }
    }
  }
  return ids.filter((id): id is string => typeof id === "string" && id !== "");
}

/**
 * The texts of a block that the learner sees (the fields marked `shown`, and those of the items of its lists), each as the block's own wording and
 * every other language's - for a block without a descriptor none.
 */
export function shownWordings(block: Block): { own: string; translated: string[] }[] {
  const record = block as unknown as Record<string, unknown>;
  const translations = Object.values((record.translations as Record<string, Record<string, unknown>> | undefined) ?? {});
  const wordings: { own: string; translated: string[] }[] = [];
  for (const [name, spec] of fieldsOf(block)) {
    if (spec.type === "text" && spec.shown) {
      const key = spec.translationKey || name;
      wordings.push({ own: (record[name] as string | undefined) ?? "", translated: translations.flatMap((t) => (typeof t[key] === "string" ? [t[key] as string] : [])) });
    } else if (spec.type === "list") {
      const textName = itemTextName(spec);
      const shown = textName && (spec.item[textName] as TextField).shown;
      if (!textName || !shown) continue;
      for (const item of (record[name] as (Items[number] & Record<string, unknown>)[] | undefined) ?? []) {
        wordings.push({
          own: (item[textName] as string | undefined) ?? "",
          translated: translations.flatMap((t) => {
            const words = (t.items as Record<string, string> | undefined)?.[item.id];
            return typeof words === "string" ? [words] : [];
          }),
        });
      }
    }
  }
  return wordings;
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

/** The texts of the items of a block's lists that `weft text export` lists: one for every item that has a caption-like text, with the number of the item. */
export function exportedItemTexts(block: Block): { list: string; itemId: string; role: string; value: string }[] {
  const record = block as unknown as Record<string, unknown>;
  return listFieldsOf(block).flatMap(([name, spec]) => {
    const textName = itemTextName(spec);
    if (!textName || !spec.cliRole) return [];
    const items = (record[name] as (Items[number] & Record<string, unknown>)[] | undefined) ?? [];
    return items.map((item, index) => ({ list: name, itemId: item.id, role: spec.cliRole!(index + 1), value: (item[textName] as string | undefined) ?? "" }));
  });
}
