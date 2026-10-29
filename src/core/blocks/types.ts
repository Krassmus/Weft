import type { GraphEventKind } from "../eventGraph/types";
import type { Block, BlockTranslation, TimelineEventType } from "../types";
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
  /** The key in a BlockTranslation, where it is not `html` (a quiz's question is kept as `questionHtml`). */
  translationKey?: keyof BlockTranslation;
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

/** The ids of some of the items of a list of the block (a quiz's right options): each is the `id` of an item of the list `of`. */
export interface IdsField {
  type: "ids";
  of: string;
}

/** The right pairs of two lists of the block (a matching's `pairs`): a record of the id of an item of the list `from` -> the id of one of `to`. An item that
 * is not in it has no partner (a decoy). */
export interface PairsField {
  type: "pairs";
  from: string;
  to: string;
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
  kind: "image" | "video" | "audio";
  /** The file is only used while another field of the block has this value (the picture of a list's marker, while its marker is "image") - in the item of a
   * list: while another field of the item has it (a card of a matching: its picture, while it is a picture): else it does not stay in the module and is not
   * exported. */
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
  item: { [name: string]: TextField | HtmlField | AssetField | EffectsField | ChoiceField | NumberField };
  /** The key in a BlockTranslation the words of the items are kept under (`items`; a quiz's options are `options`). */
  translationKey?: "items" | "options";
  /** `weft text export`: the part of the key of an item's words, `<block>#<cliPart>:<id>` (`item`; a quiz's are `option`). */
  cliPart?: "item" | "option";
  /** The item that is made for a file that is added (`asset` is the id of the asset the file became). */
  newItem(asset: string): Record<string, unknown>;
  /** What the steps are called in the history (German): files added (one, several), the file of an item changed. */
  history: { add: string; addMany: string; change: string };
  /** `weft text export`: what the words of the item with this number (from 1) are (German). */
  cliRole?: (number: number, item: Record<string, unknown>) => string;
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

export type FieldSpec = TextField | HtmlField | BoolField | NumberField | ChoiceField | IntField | EffectsField | EffectsMapField | IdsField | PairsField | AssetField | ListField;

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

/**
 * An event a block gives its page that is its own - beyond the Aufbau, the Abbau and the Aktionseffekte every block can have: a logic block's script runs, a
 * button is clicked, a revealer's window opens, an item of a list appears, a video starts, reaches a time mark, ends. (The events of a task - the first
 * answer, submitted, submitted right or wrong - are the same for every kind that has a `task`: the registry makes them, the words are the TaskSpec's.) The page's graph (see
 * docs/event-graph.md) has a node for it, the stations that list a page's events ask the descriptor instead of each knowing the kind.
 * What the event DOES (a script is run, an item is shown) is the player's: it has a handler for each `graphKind`. The ids are part of the file's protocol
 * - the player makes the same ones (`${idPrefix}:${blockId}`, and `:${itemId}` for one of an item).
 */
export interface OwnEventSpec<B = never> {
  /** Names it among the block's events (the id of a node does not contain it). */
  key: string;
  /** The id of the node: `${idPrefix}:${blockId}`, or `${idPrefix}:${blockId}:${itemId}` for an event of an item; with `idSuffix`, `:${idSuffix}` more. */
  idPrefix: string;
  idSuffix?: string;
  /** What it is in the graph the player runs (eventGraph/types.ts) and what the editor's timeline calls it. */
  graphKind: GraphEventKind;
  /** What the timeline calls it: one type, or - where it depends on the block (a video starts by itself or by the learner) - a function, with all the types
   * it can be in `timelineTypes`. */
  timelineType: TimelineEventType | ((block: B) => TimelineEventType);
  timelineTypes?: TimelineEventType[];
  /** One event for each item of this array of the block (a list's items, a video's stop points), instead of one for the block. */
  perItem?: string;
  /** Whether the block has the event now (for an event of items: whether this item has it); `onPage` is false for a block of a layout. Absent: always. */
  exists?(block: B, where: { onPage: boolean }, item?: Record<string, unknown>): boolean;
  /** Events of the same item that follow this one, in this order (a stop point that stops the video has the video going on after it). */
  companions?: OwnEventSpec<B>[];
  /** The event is instead of the block's Aufbau: while it is there the block has none of its own. */
  replacesEntrance?(block: B, where: { onPage: boolean }): boolean;
  /** A trigger can make it happen (the editor offers it as a target), not only the learner or the player. */
  triggerable: boolean;
  /** It takes its place in the chain of Weiter when it is made, like an Aufbau, and is shown on a row of its own where nothing triggers it. */
  inChain?: boolean;
  /** Drawn in a lane of its own, after the block's Aufbau if it has one, joined to the block's other lane events by dashed lines (the learner does them). */
  lane?: boolean;
  /** The words of the node in the graph (editor language): `index` is the place of the item. Absent or undefined: it has none of its own. */
  label?(block: B, context: { name: string; index?: number }): string | undefined;
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
  placement: { pageOnly: boolean; layoutOnly?: boolean; box: { x: number; y: number; width: number; height: number } };
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
  /** The events the block gives its page that are its own (see OwnEventSpec). */
  events?: OwnEventSpec<B>[];
  /** Nothing of the block is seen or read when a slide is played, and it has no Aufbau or Abbau (a logic block): it is not in the reading order, not in the
   * picture the cover is made from, and cannot be made to appear by a video's time mark. The editor draws a mark where it stands. */
  invisible?: boolean;
  /** What the panel in the sidebar shows, in what order. Absent: the block's panel is its own (panels/BlockPanel.tsx). */
  panel?: PanelSpec;
  /** What `weft inspect` says about the block, in one line (German). */
  summary?(block: B, context: { labels: Record<string, string>; assets?: { id: string; fileName: string }[] }): string;
  /** What is wrong with the block (`weft validate`; German). */
  validate?(block: B, module: { assets: { id: string }[]; variables: { name: string; type: string }[]; pages: Record<string, unknown> }): BlockProblem[];
}
