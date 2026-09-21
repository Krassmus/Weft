import type { Patch } from "immer";

export type UUID = string;

export type AspectRatio = "16:9" | "4:3" | "1:1" | "3:2";

export type VariableType = "number" | "string" | "boolean";
export type VariableValue = number | string | boolean;

export interface VariableDef {
  id: UUID;
  name: string;
  type: VariableType;
  initialValue: VariableValue;
}

export type VariableEffect =
  | { variableId: UUID; op: "set"; value: VariableValue }
  | { variableId: UUID; op: "add"; value: number }
  | { variableId: UUID; op: "append"; value: string };

export type BlockPosition = {
  /** Percent of the slide (0-100). Percent, not pixels, so the block stays put across the module's fixed aspect ratio at any render size. */
  x: number;
  y: number;
  width: number;
  height: number;
};

interface BaseBlock {
  id: UUID;
  position: BlockPosition;
}

export interface TextBlock extends BaseBlock {
  kind: "text";
  html: string;
}

export interface ImageBlock extends BaseBlock {
  kind: "image";
  assetId: UUID | null;
  alt: string;
}

export interface IframeBlock extends BaseBlock {
  kind: "iframe";
  url: string;
  /** e.g. ["allow-scripts", "allow-same-origin"] - kept explicit per block, never "allow everything" by default. */
  sandbox: string[];
  allow?: string;
  /** When true, the block shows a scannable QR code for `url` plus the plain address instead of
   * embedding the iframe right away; clicking the address reveals the iframe, like a gate. */
  qrCode: boolean;
  /** Optional: once revealed, show this URL instead of `url` - e.g. `url` is a live survey
   * people join by scanning the code on their phone, this is the results view shown on screen.
   * Falls back to `url` when empty. */
  presentationUrl?: string;
}

export interface QuizBlock extends BaseBlock {
  kind: "quiz";
  question: string;
  options: { id: UUID; text: string }[];
  correctOptionIds: UUID[];
  onCorrect: VariableEffect[];
  onIncorrect: VariableEffect[];
  /** Auto-advance 1.5s after the feedback text appears - not immediately, so the learner still
   * gets to see it before the slide moves on. Mirrors a "Weiter" button's own restart-at-the-end
   * behavior once the module has ended. */
  advanceOnCorrect: boolean;
  advanceOnIncorrect: boolean;
}

export interface ButtonBlock extends BaseBlock {
  kind: "button";
  text: string;
  /** "prev" is disabled on the first slide; "next" turns into a restart once the module ended -
   * both mirror the player's own built-in Zurück/Weiter controls exactly. */
  action: "next" | "prev";
}

/** Blocks a Layout may contain. Quiz (or any future graded/interactive block) is deliberately
 * excluded here: a Layout is a page template, and templates must not carry graded state. A
 * navigation button carries no state of its own, so - unlike Quiz - it's allowed in a Layout,
 * which lets an author bake one consistent "Weiter" button into every slide of that layout. */
export type StaticBlock = TextBlock | ImageBlock | IframeBlock | ButtonBlock;
export type Block = StaticBlock | QuizBlock;

export interface Layout {
  id: UUID;
  name: string;
  blocks: StaticBlock[];
}

export interface Page {
  id: UUID;
  layoutId: UUID | null;
  blocks: Block[];
}

export interface VariableCondition {
  variableId: UUID;
  comparator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte";
  value: VariableValue;
}

/**
 * A Branch only ever holds Page ids, never a LogicBlock. This is what keeps branching
 * one level deep by construction: you cannot nest a logic block inside a branch, so the
 * learner is always funneled back to the single main sequence after a branch ends.
 */
export interface Branch {
  id: UUID;
  label: string;
  /**
   * Evaluated like if/else-if/else in array order (see LogicBlock.branches): every branch but
   * the last must carry a condition, and only the last branch may be null - it is always the
   * unconditional "sonst" fallback taken when none of the earlier conditions matched.
   */
  condition: VariableCondition | null;
  pageIds: UUID[];
}

export interface LogicBlock {
  id: UUID;
  name: string;
  /** Order matters - see Branch.condition for the if/else-if/else evaluation rule. */
  branches: Branch[];
}

export type SequenceNodeRef =
  | { kind: "page"; pageId: UUID }
  | { kind: "logic"; logicBlockId: UUID };

export interface AssetMeta {
  id: UUID;
  fileName: string;
  mimeType: string;
}

/** A font file the user uploaded (see core/fonts/), stored as a blob keyed by `id` exactly like
 * an AssetMeta - unlike the curated set in core/fonts/curatedFonts.ts, which ships with the app
 * and isn't a per-document asset at all. `family` is what block HTML's font-face/font-family
 * actually references, so renaming here would silently detach it from any text already using it. */
export interface CustomFont {
  id: UUID;
  family: string;
  fileName: string;
  mimeType: string;
}

export interface LmsConfig {
  /** Off by default - the module works as a stand-alone presentation until this is switched on. */
  enabled: boolean;
  allowedOrigins: string[];
}

export interface WeftModule {
  /** Set once with crypto.randomUUID() at creation and never reused, so an LMS can key progress on it forever. */
  id: UUID;
  title: string;
  aspectRatio: AspectRatio;
  createdAt: string;
  modifiedAt: string;
  variables: VariableDef[];
  layouts: Record<UUID, Layout>;
  pages: Record<UUID, Page>;
  logicBlocks: Record<UUID, LogicBlock>;
  sequence: SequenceNodeRef[];
  assets: AssetMeta[];
  customFonts: CustomFont[];
  lms: LmsConfig;
}

export interface UndoEntry {
  id: UUID;
  label: string;
  timestamp: string;
  patches: Patch[];
  inversePatches: Patch[];
}

/**
 * The root object that is serialized to weft.json. Save format and export format are the
 * same on purpose: exporting is just packing this plus a generated index.html into a zip.
 */
export interface WeftDocument {
  formatVersion: 1;
  content: WeftModule;
  undoHistory: UndoEntry[];
  /** Index of the last applied entry; -1 means the document is at its initial state. */
  undoIndex: number;
}
