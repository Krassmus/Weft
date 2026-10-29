import type { Block, BlockTranslation } from "../types";
import type { TranslationKey } from "../i18n/translations";

/**
 * What a kind of block says about itself - the one place the stations that treat every block alike (the menu, the defaults, the translations,
 * the event graph, the text export, the checks of `weft validate` ...) ask, instead of each having a `switch (block.kind)` of its own.
 * A kind that has a descriptor (see registry.ts) is described here; the kinds that have none yet are still known to those stations by hand.
 * The shape is meant to become the manifest of a plugin's block: everything in here is data or a pure function on the block's JSON, nothing
 * of the editor's (React) or the player's (DOM) - those are the block's own views.
 */

/** How a field is shown in the panel that is made from the fields (panels/FieldsPanel.tsx). */
export interface FieldUi {
  label: TranslationKey;
  /** Under the field: for a flag while it is on, for a number while it is set. */
  hint?: TranslationKey;
  /** A text: the words that stand in the field while it is empty - a word of the player (see playerStrings.ts). */
  placeholderString?: string;
  /** A text that is not prose (a word to be typed, a code): no spell checking. */
  plain?: boolean;
  /** A number the author need not set: the two choices of the select (without / with a number) and the label of the number. */
  unsetLabel?: TranslationKey;
  setLabel?: TranslationKey;
  countLabel?: TranslationKey;
  /** The outcome's effects: what is said under "Weiter zur nächsten Folie" while it is on. */
  advanceHint?: TranslationKey;
}

/** A text of the block (plain text). */
export interface TextField {
  type: "text";
  /** Has its own wording in each language of the module: the block's field is the default language's, the others' are kept in
   * `translations[language][translationKey ?? name]`. */
  translatable?: boolean;
  /** The key in a BlockTranslation, where it is not the field's own name (a placeholder is kept as `text`: the field is older than the key). */
  translationKey?: keyof BlockTranslation;
  /** The learner sees it: it is part of the block's plain text (the clipboard's). */
  shown?: boolean;
  /** The player puts the value of a variable in for a placeholder in it ("{{punkte}}"): it is found when a variable is looked for, and checked. */
  variables?: boolean;
  /** The words also exist with their formatting (HTML), kept in this other field of the block (a button's `html`; `text` is the plain words, always
   * what the formatted ones say without the formatting). Absent: only plain text. The translations keep both: `html` and the field's own key. */
  formatted?: string;
  /** A value that is valid for the field, where not every text is (an address): what the tests fill it with. */
  sample?: string;
  /** `weft text export`: the key of the text is `<block>#<part>`, `role` says what it is for (German, like the tool). */
  cli?: { part: string; role: string };
  ui?: FieldUi;
}

/**
 * A formatted text: HTML, kept in the field itself (a text block's `html`) - there is no plain copy beside it (a button's label has one: see
 * TextField.formatted). The translations keep it as `html`, which is why the field's name is "html".
 */
export interface HtmlField {
  type: "html";
  /** `[[answer]]` in it are the blanks of a gap text: a translation has to keep as many of them as the text has. */
  blanks?: boolean;
  translatable?: boolean;
  shown?: boolean;
  variables?: boolean;
  cli?: { part: string; role: string };
  ui?: FieldUi;
}

export interface BoolField {
  type: "bool";
  ui?: FieldUi;
}

/** Changes to variables by a word: a record of lists of effects (a gap text's `answerEffects`, by what stands in the brackets). */
export interface EffectsMapField {
  type: "effectsMap";
  /** What `weft validate` says it is for, in "… Effekt ohne Variable" (German). */
  cliWhat: string;
}

/** A number that may have decimals (a distance, a size); absent when the author has not set it. */
export interface NumberField {
  type: "number";
  min?: number;
  max?: number;
  ui?: FieldUi;
}

/** One of a few words (a kind of mark, a kind of effect): the value is one of `options`. */
export interface ChoiceField {
  type: "choice";
  options: string[];
  ui?: FieldUi;
}

/** A whole number; the field is absent when the author has not set it. */
export interface IntField {
  type: "int";
  min?: number;
  ui?: FieldUi;
}

/** A list of changes to variables that happens at one of the block's events. */
export interface EffectsField {
  type: "effects";
  /** The outcome of the task it happens at (a block that is no task: absent). */
  firesOn?: "richtig" | "falsch";
  /** What `weft validate` says it is for, in "… Effekt ohne Variable" (German). */
  cliWhat: string;
  ui?: FieldUi;
}

/** A file of the module (an asset): the id of the asset, or null while none is chosen. */
export interface AssetField {
  type: "asset";
  kind: "image";
  /** The file is only used while another field of the block has this value (the picture of a list's marker, while its marker is "image"): else it
   * does not stay in the module and is not exported. */
  usedWhen?: { field: string; is: string };
}

/**
 * A list of things the author adds, orders and removes - each with an `id` and fields of its own (a text, a file). The words of its items are kept
 * in a translation by the id of the item (`translations[language].items[id]`); they are the one translatable text field of an item - a plain text,
 * or `html` (a list's points: formatted, and kept as the formatted words in the translation too).
 */
export interface ListField {
  type: "list";
  /** The fields of one item, by name. */
  item: { [name: string]: TextField | HtmlField | AssetField };
  /** The item that is made for a file that is added (`asset` is the id of the asset the file became). */
  newItem(asset: string): Record<string, unknown>;
  /** What the steps are called in the history (German): files added (one, several), the file of an item changed. */
  history: { add: string; addMany: string; change: string };
  /** `weft text export`: what the words of the item with this number (from 1) are (German). */
  cliRole?: (number: number) => string;
  ui?: ListUi;
}

/** How a list is shown in the panel: its items in rows, with a button that adds files. */
export interface ListUi {
  /** What is said while the list is empty. */
  empty: TranslationKey;
  /** The label of the field of an item that has words, of the button that adds files, of the one that gives an item another file (or a first one). */
  textLabel: TranslationKey;
  add: TranslationKey;
  change: TranslationKey;
  choose: TranslationKey;
  moveUp: TranslationKey;
  moveDown: TranslationKey;
  remove: TranslationKey;
}

export type FieldSpec = TextField | HtmlField | BoolField | NumberField | ChoiceField | IntField | EffectsField | EffectsMapField | AssetField | ListField;

/**
 * A block with a task, as a quiz has: the events "first answer", "submitted", and "submitted - right / wrong" in the page's graph, which what is to
 * follow hangs on (and a "Nächste Folie" after an outcome).
 */
export interface TaskSpec {
  /** The words of the events in the graph (editor language). */
  labels: { fill: TranslationKey; submit: TranslationKey; correct: TranslationKey; incorrect: TranslationKey };
  /** The words of the events in `weft inspect` and `weft validate` (German). */
  cliNames: { fill: string; submit: string; correct: string; incorrect: string };
  /** Both outcomes are always in the graph: what is to follow hangs on them, and an event that is not there cannot be picked as a trigger. Absent:
   * an outcome is there when something goes on from it. (The plain "submitted" is then only there when something hangs on it.) */
  outcomesAlwaysShown?: boolean;
}

/** The panel of a block, made from its fields: sections in the order they are shown. */
export interface PanelSpec {
  sections: {
    title: TranslationKey;
    hint?: TranslationKey;
    /** Folded open when the block is selected (default: yes). */
    open?: boolean;
    /** The select for the language the texts are edited in stands at the top. */
    language?: boolean;
    fields: string[];
  }[];
}

/** A problem `weft validate` reports. */
export interface BlockProblem {
  level: "error" | "warning" | "info";
  code: string;
  message: string;
  /** What to do about it (German). */
  hint?: string;
}

export interface BlockDescriptor<B extends Block = Block> {
  kind: B["kind"];
  /** The version of the shape of the block's data. Built-in blocks follow the file's format version; a plugin block carries its own (see `migrate`). */
  version: number;
  /** Where the block can stand and how big it is when it is added. `pageOnly`: not in a layout (it holds a state, or needs an answer). */
  placement: { pageOnly: boolean; box: { x: number; y: number; width: number; height: number } };
  /** What `weft inspect`, `weft validate` and `weft text export` call the kind (German). */
  cliName: string;
  /** The name of the block's definition in the file's JSON schema (docs/weft.schema.json), and what `weft schema` says it is (German). */
  schemaDefinition: string;
  description: string;
  /** The data beyond what every block has, by the name of the field. */
  fields: { [K in Exclude<keyof B, keyof Block | "kind" | "translations">]?: FieldSpec };
  /** What a new block of this kind has beyond what every block has (its position is `placement.box`). */
  defaults(): Omit<B, "id" | "order" | "position" | "entranceEffect" | "exitEffect" | "actionEffects">;
  /** Present: the block has the events of a quiz. */
  task?: TaskSpec;
  /** What the panel in the sidebar shows, in what order. Absent: the block's panel is its own (panels/BlockPanel.tsx). */
  panel?: PanelSpec;
  /** What `weft inspect` says about the block, in one line (German). */
  summary?(block: B, context: { labels: Record<string, string> }): string;
  /** What is wrong with the block (`weft validate`; German). */
  validate?(block: B, module: { assets: { id: string }[]; variables: { name: string; type: string }[]; pages: Record<string, unknown> }): BlockProblem[];
}
