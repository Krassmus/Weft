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
  /** Degrees, 0-360. Optional (rather than defaulting to 0 in every object literal that builds a
   * BlockPosition) since a module saved before this field existed won't have it in its JSON
   * either way - readers fall back to `?? 0`, so there's no real difference between "optional"
   * and "required with a default" here, just less churn at every construction site that doesn't
   * care about rotation. */
  rotation?: number;
};

/** Every kind of appear/disappear animation a block can use for its own Aufbau (entrance) or
 * Abbau (exit) - "none" is an instant show/hide, not "no effect at all" (see BlockEffect.
 * triggerEventId for what actually turns the whole thing off for exit). */
export type BlockEffectType = "none" | "fade" | "move";

/** A block's own Aufbau or Abbau (see BaseBlock.entranceEffect/exitEffect below, and
 * BlockEffectEditor in features/editor/panels/BlockPanel.tsx) - independent of the page-level
 * Transition (core/types.ts's own Transition/TransitionType), which animates the whole slide
 * on the way to the *next* one, not one block's own appearance within the current slide. */
export interface BlockEffect {
  type: BlockEffectType;
  /** Only meaningful when `type` isn't "none". */
  durationMs: number;
  /** Which event starts this effect (after `delayMs`) - "start" (Start der Folie), or an event
   * node id from the page's own timeline graph (see PageTimeline in this file) - never "end"
   * (Nächste Folie), since the slide is already gone by the time that fires. For an exit effect
   * only, this can also be null: "no automatic Abbau at all", the block simply staying until the
   * page itself does (see syncPageTimelineEvents's own doc comment on why an entrance effect
   * has no equivalent "never" option - it always eventually has to appear somehow). */
  triggerEventId: string | null;
  /** Milliseconds between the trigger firing and the effect actually starting. */
  delayMs: number;
}

interface BaseBlock {
  id: UUID;
  position: BlockPosition;
  /** How this block appears - defaults to instant and immediate (type "none", triggered by
   * "start" with no delay), i.e. exactly how every block behaved before this field existed: just
   * there from the moment the slide is. */
  entranceEffect: BlockEffect;
  /** How this block disappears *before* the slide itself does - defaults to never happening at
   * all (triggerEventId null), i.e. exactly how every block behaved before this field existed:
   * it simply stays until the slide changes. */
  exitEffect: BlockEffect;
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

/** A point on a video's own timeline - an event and a trigger at once (see VideoStopPointDialog
 * in panels/BlockPanel.tsx): something is meant to happen once playback reaches it, though what
 * isn't modeled yet beyond stopsVideo. */
export interface VideoStopPoint {
  id: UUID;
  /** Seconds into the video's own playback. */
  timeSeconds: number;
  /** Whether reaching this point actually pauses the video (the "Video hier stoppen" checkbox in
   * VideoStopPointDialog) - off just marks the moment without interrupting playback. Defaults to
   * true, since pausing is the only thing a stop point can actually do today. */
  stopsVideo: boolean;
}

export interface VideoBlock extends BaseBlock {
  kind: "video";
  assetId: UUID | null;
  autoplay: boolean;
  loop: boolean;
  /** Autoplay only ever actually starts when this is true too (every browser's autoplay policy
   * requires it) - BlockPanel.tsx keeps the two in sync in the UI so that's never a silent trap. */
  muted: boolean;
  controls: boolean;
  /** Always kept sorted by timeSeconds (see VideoStopPointDialog) - so both the dialog's own
   * mini-timeline and any future reader can assume ascending order rather than re-sorting. */
  stopPoints: VideoStopPoint[];
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
  /** The embedded page is always given exactly this CSS-pixel width as its viewport (e.g. to
   * force its mobile layout) rather than whatever the block happens to render at - height isn't
   * separately configurable, it's derived from the block's own on-slide aspect ratio, so the
   * scaled result always fills the block exactly with no letterboxing. Optional only so a module
   * saved before this field existed still loads - readers fall back to DEFAULT_VIEWPORT_WIDTH
   * (see BlockPanel.tsx). */
  forcedViewportWidth?: number;
}

export interface QuizBlock extends BaseBlock {
  kind: "quiz";
  /** Rich HTML, exactly like TextBlock.html - edited in place on the canvas with the same
   * bold/italic/underline/font/size/color toolbar (see EditableText/TextEditor). A module saved
   * before this held HTML is migrated on load (see unpack.ts) by escaping its old plain text
   * into an equivalent paragraph, so every reader can assume this is always already-safe HTML. */
  questionHtml: string;
  options: { id: UUID; html: string }[];
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
export type StaticBlock = TextBlock | ImageBlock | VideoBlock | IframeBlock | ButtonBlock;
export type Block = StaticBlock | QuizBlock;

export interface Layout {
  id: UUID;
  name: string;
  blocks: StaticBlock[];
}

/** Every kind of transition Weft knows how to animate the move to the *next* node with - "none"
 * is an instant cut; "fade"/"move" are animated (see player.runtime.js's animateTransition).
 * Kept as its own type rather than inlined into Transition so the player and the timeline UI's
 * own options list (see Timeline.tsx) can both reference just this. */
export type TransitionType = "none" | "fade" | "move";

export interface Transition {
  type: TransitionType;
  /** Only meaningful when type isn't "none" - how long the animation takes, in milliseconds.
   * Defaults to 500 (see setPageTransition/setPageTransitionDuration in document/actions.ts). */
  durationMs: number;
}

/** How an edge's timing is known: "unknown" - the "to" node happens sometime causally after the
 * "from" node, but not on any fixed schedule (e.g. it's waiting on a click) - rendered as a
 * dashed line. "timed" - it happens automatically, a fixed delay after "from" (see `delayMs`) -
 * rendered as a solid line. See Timeline.tsx. */
export type TimelineEdgeKind = "unknown" | "timed";

export interface TimelineEdge {
  from: string;
  to: string;
  kind: TimelineEdgeKind;
  /** Only meaningful when `kind` is "timed": how long after `from` this fires, in milliseconds. */
  delayMs?: number;
}

/** "start" and "end" are the two fixed ends every lane has today - "end" is the same node the
 * "Nächste Folie" UI edits (its animation is `Page.transition`, not stored here). "event" is a
 * node a block contributes itself - see TimelineEventType for which ones exist. */
export type TimelineNodeKind = "start" | "end" | "event";

/** Which specific event/trigger an "event" node represents - a closed set so Timeline.tsx can
 * give each its own icon/label without storing free-text or markup in the document itself (see
 * syncPageTimelineEvents in document/pageTimeline.ts, which is what creates all of these).
 * "quiz-fill-start": a QuizBlock's learner picked a first option. "quiz-submit": they submitted
 * their answer, with no outcome-specific auto-advance defined yet (see buildQuizLane) - "quiz-
 * submit-correct"/"quiz-submit-incorrect" are the same submit event, split so a lane built for one
 * particular outcome (advanceOnCorrect/advanceOnIncorrect) gets its own icon, making the two
 * learning paths visually distinct rather than both showing the same checkmark. "video-start-
 * auto"/"video-start-manual": a VideoBlock starts playing - split in two so Timeline.tsx can show
 * a different icon for a video that starts itself (autoplay) versus one the learner has to press
 * play on. "video-end-loop"/"video-end-stop": likewise for how it stops - looping forever, or
 * actually ending. "video-stop-point": one of that video's own VideoStopPoint entries, placed
 * between "video-start-*" and "video-end-*" in playback order (see buildVideoLane) - always the
 * same pause icon regardless of VideoStopPoint.stopsVideo, matching VideoStopPointDialog's own
 * markers, which don't distinguish that either. */
export type TimelineEventType =
  | "quiz-fill-start"
  | "quiz-submit"
  | "quiz-submit-correct"
  | "quiz-submit-incorrect"
  | "video-start-auto"
  | "video-start-manual"
  | "video-stop-point"
  | "video-end-loop"
  | "video-end-stop";

export interface TimelineNode {
  id: string;
  kind: TimelineNodeKind;
  /** For kind "event": which block this node belongs to, so deleting/reconfiguring that block
   * can keep this node in sync (see syncPageTimelineEvents). */
  sourceBlockId?: UUID;
  /** Required when kind is "event": which event this is. */
  eventType?: TimelineEventType;
  /** Overrides the default per-kind/per-eventType label (see nodeLabel in Timeline.tsx) - e.g.
   * distinguishing a quiz's "correct answer" and "incorrect answer" outcome lanes, which would
   * otherwise both show the same generic "quiz submitted" node with nothing telling them apart. */
  label?: string;
}

/** One horizontal row in the timeline UI: a chain of nodes joined by edges. Events with no
 * causal relationship to this lane's events get their own additional lane instead of sharing
 * this one - see PageTimeline.lanes. */
export interface TimelineLane {
  nodes: TimelineNode[];
  edges: TimelineEdge[];
}

/** A page's timeline, stored per-page rather than computed by scanning its blocks at render
 * time: blocks are meant to insert/remove their own nodes and edges here directly as they gain
 * events/triggers to expose. Lane 0 always starts with a "start" node and ends with an "end"
 * node - see createDefaultPageTimeline() in document/pageTimeline.ts. */
export interface PageTimeline {
  lanes: TimelineLane[];
}

export interface Page {
  id: UUID;
  layoutId: UUID | null;
  blocks: Block[];
  /** How this page animates out on the way to whatever the sequence/a branch says comes next -
   * edited by selecting the "Nächste Folie" node at the right end of this page's timeline (see
   * Timeline.tsx). Defaults to "none", which is also the only type the player actually animates
   * today - "fade"/"move" are captured here ready for a player implementation to catch up to. */
  transition: Transition;
  /** This page's timeline graph - see PageTimeline. */
  timeline: PageTimeline;
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
  /** On by default (matches every module saved before this existed - see unpack.ts's migration).
   * Switched off, the player ignores Space/←/→ entirely - only an author-placed button block or a
   * quiz's own onCorrect/onIncorrect effects can move the learner forward or back. The main
   * reason to turn it off: without it, nothing stops a learner from pressing ← to back up past a
   * quiz they've already answered and retake it. */
  keyboardNavigationEnabled: boolean;
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
