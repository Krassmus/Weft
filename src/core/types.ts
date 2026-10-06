import type { Patch } from "immer";

export type UUID = string;

/** "W:H" - one of the presets in core/aspectRatio.ts ("16:9", "9:16", ...) or any custom pair of positive
 * numbers, e.g. "21:9" or "1.85:1". */
export type AspectRatio = `${number}:${number}`;

/** "computed" is a variable whose value is never stored: it is worked out from other variables by
 * its `expression` every time it is read (see core/document/expressions.ts for the language). */
export type VariableType = "number" | "string" | "boolean" | "computed";
export type VariableValue = number | string | boolean;

export interface VariableDef {
  id: UUID;
  name: string;
  type: VariableType;
  initialValue: VariableValue;
  /** The formula of a "computed" variable; absent on every other type. */
  expression?: string;
  /** A built-in variable (`success`): always present, never renamed or removed, and a Ja/Nein either
   * way - its type can only be switched between "boolean" (set by hand/quiz effects) and "computed"
   * (a formula, whose result is read as Ja/Nein). See ensureBuiltinVariables in
   * core/document/variables.ts. */
  fixed?: boolean;
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
 * Abbau (exit) - plus "off", which isn't an animation at all. "off": there's no Aufbau/Abbau
 * here in the first place - the block is simply always there from the moment the slide is (for
 * entrance) or never auto-removed (for exit); never gets a trigger of any kind (see
 * getBlockEntranceTrigger/getBlockExitTrigger in document/pageTimeline.ts, both of which
 * short-circuit to `null` for it), and never shows up in the page's own event graph - there's
 * nothing there to configure or point at. "none" is a DIFFERENT thing: a real Aufbau/Abbau DOES
 * exist, it just shows/hides instantly rather than animating - still has its own trigger (default
 * "Weiter" for entrance), still shows up in the graph, same as "fade"/"move" do. */
export type BlockEffectType = "off" | "none" | "fade" | "move";

/** A block's own Aufbau or Abbau (see BaseBlock.entranceEffect/exitEffect below, and
 * BlockEffectEditor in features/editor/panels/BlockPanel.tsx) - independent of the page-level
 * Transition (core/types.ts's own Transition/TransitionType), which animates the whole slide
 * on the way to the *next* one, not one block's own appearance within the current slide. Only
 * the animation itself lives here - which event triggers it, and after what delay, is recorded
 * as a TimelineEdge in PageTimeline.triggerEdges instead (see getBlockEntranceTrigger/
 * getBlockExitTrigger in document/pageTimeline.ts), the same single mechanism every other kind
 * of trigger on the page uses - so this type doesn't need its own separate notion of "which
 * event" alongside it, except for "off" (see BlockEffectType's own doc comment), which bypasses
 * that mechanism entirely regardless of whatever trigger edge might still be stored (switching
 * back to "none"/"fade"/"move" later picks it back up unchanged). */
export interface BlockEffect {
  type: BlockEffectType;
  /** Only meaningful when `type` is "fade" or "move". */
  durationMs: number;
}

interface BaseBlock {
  id: UUID;
  position: BlockPosition;
  /** How this block appears - defaults to "off" (see BlockEffectType's own doc comment): just
   * there from the moment the slide is, i.e. exactly how every block behaved before this field
   * existed. */
  entranceEffect: BlockEffect;
  /** How this block disappears *before* the slide itself does - defaults to "off": never happens
   * at all, i.e. exactly how every block behaved before this field existed - it simply stays
   * until the slide changes. */
  exitEffect: BlockEffect;
}

/**
 * What one block says in a language OTHER than the module's default one (see WeftModule.languages) -
 * only the fields that have been translated; anything missing is shown in the default language's
 * wording instead. The block's own plain fields (html, questionHtml, text, ...) ARE the default
 * language's wording, so a module that never uses languages has none of this at all.
 */
export interface BlockTranslation {
  /** TextBlock. */
  html?: string;
  /** QuizBlock. */
  questionHtml?: string;
  /** QuizBlock: each option's html by option id. */
  options?: Record<UUID, string>;
  /** ButtonBlock. */
  text?: string;
}

export interface TextBlock extends BaseBlock {
  kind: "text";
  html: string;
  /** Other languages' wording, by locale ("fr_FR") - see BlockTranslation. */
  translations?: Record<string, BlockTranslation>;
}

/** A drop-down with which a learner picks the language of the module (it sets `userlanguage`) -
 * addable only while the module offers more than one language. */
export interface LanguageBlock extends BaseBlock {
  kind: "language";
}

/** Program code with syntax highlighting (highlight.js) - works like a text block (typed straight
 * into the block on the slide, scrolls if it doesn't fit) but is plain text: no formatting other
 * than what the highlighter itself colors. */
export interface CodeBlock extends BaseBlock {
  kind: "code";
  code: string;
  /** A highlight.js language id (see CODE_LANGUAGES in core/code/highlight.ts), or "auto" to let
   * the highlighter guess. */
  language: string;
  /** One of CODE_THEMES' ids (core/code/codeThemes.ts). */
  theme: string;
  /** In px on a 960px-wide slide, like a text block's sizes - stored (and rendered) as a share of
   * the slide's width (cqw), so it scales with the slide. */
  fontSize: number;
  /** Drops the theme's background color (the text colors stay) so the slide shows through.
   * Optional only so a block saved before this field existed still loads - absent means false. */
  transparentBackground?: boolean;
}

/** A TeX formula (rendered with KaTeX in display mode, so it may span several lines via a double backslash).
 * Behaves like an image on the slide: it is scaled to fit its box (contain), so resizing the box
 * resizes the formula. Formatting is deliberately limited to the block as a whole (`color`) plus
 * whatever TeX commands the author writes into `tex` itself (e.g. a color command around part of it). */
export interface TexBlock extends BaseBlock {
  kind: "tex";
  tex: string;
  /** CSS color for the whole formula; "" = inherit the slide's own text color. */
  color: string;
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
  translations?: Record<string, BlockTranslation>;
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
  translations?: Record<string, BlockTranslation>;
  /** "prev" is disabled on the first slide; "next"/"advance" both turn into a restart once the
   * module ended. "next" always jumps straight to the next page, regardless of any pending
   * "Weiter"-triggered builds still queued on the current one (see player.runtime.js's
   * advanceQueue) - the unconditional "skip ahead" action. "advance" instead steps that same
   * queue one "Weiter" press at a time, exactly like Space/→ - reveals the next queued build if
   * there is one, only actually leaving the page once the queue is empty (see
   * player.runtime.js's advanceOne). */
  action: "next" | "prev" | "advance";
}

/** The basic PowerPoint/Keynote-style shapes ShapeBlock supports - "polygon" is any regular n-gon
 * (ShapeBlock.sides picks n), not a free-form outline; there's no path editor. */
export type ShapeKind = "rectangle" | "ellipse" | "polygon" | "star";

export type ShapeFillType = "none" | "solid" | "gradient";

export type ShapeGradientKind = "linear" | "radial";

export interface ShapeGradientStop {
  id: UUID;
  /** Percent along the gradient, 0-100. */
  offset: number;
  color: string;
  opacity: number;
}

export interface ShapeGradient {
  kind: ShapeGradientKind;
  /** Degrees, only meaningful for "linear" - 0 points right, 90 points down, matching
   * BlockPosition.rotation's own clockwise-from-horizontal convention. */
  angle: number;
  /** At least two - see GradientStopsEditor in panels/BlockPanel.tsx, which never lets the count
   * drop below that (a one-stop gradient isn't a gradient). Not required to be sorted by offset;
   * SVG/CSS both render stops in list order regardless of their own offset values. */
  stops: ShapeGradientStop[];
}

/** A shape's own fill - "none" (see-through, stroke-only), a flat color, or a gradient. Only the
 * fields matching `type` are actually read when rendering; the others still round-trip in the
 * document so switching the fill type back and forth in the editor never loses whatever was last
 * configured on the side that isn't currently showing. */
export interface ShapeFill {
  type: ShapeFillType;
  /** Only meaningful for "solid". */
  color: string;
  opacity: number;
  /** Only meaningful for "gradient". */
  gradient: ShapeGradient;
}

export type ShapeStrokeStyle = "solid" | "dashed" | "dotted";

export interface ShapeStroke {
  enabled: boolean;
  color: string;
  /** cqw (percent of the slide's own rendered width - the same unit block text is sized in, see
   * App.css's .weft-edit-block) rather than a plain pixel count, so a stroke's visual weight stays
   * constant when this particular shape is resized (matching how a PowerPoint line weight doesn't
   * stretch along with the shape) while still scaling along with everything else when the whole
   * slide is displayed larger or smaller (e.g. presenting on a projector). */
  width: number;
  style: ShapeStrokeStyle;
  opacity: number;
}

export interface ShapeShadow {
  enabled: boolean;
  color: string;
  opacity: number;
  /** cqw, all three - see ShapeStroke.width's own doc comment for why. */
  blur: number;
  offsetX: number;
  offsetY: number;
}

/** One rounding value per corner of a "rectangle" ShapeBlock - each 0 (sharp) to 50 (fully
 * rounded/pill-shaped at that corner), as a percent of the block's own shorter *true* on-slide
 * side (its actual rendered width vs height, accounting for both the slide's own aspect ratio and
 * the block's own on-slide width/height - see ShapeSvg.tsx's roundedRectPath) - not of the
 * abstract 0-100 square every shape is drawn in before being stretched to the block's own shape.
 * That distinction is what keeps a corner a true circular arc rather than turning elliptical the
 * moment the block itself isn't square, matching what "rounded rectangle" means in PowerPoint/
 * Keynote (which only ever expose one shared radius via a single handle - ShapeEditor in
 * panels/BlockPanel.tsx additionally lets all four be set independently). */
export interface ShapeCornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export interface ShapeBlock extends BaseBlock {
  kind: "shape";
  shapeKind: ShapeKind;
  /** Only meaningful for "rectangle". */
  cornerRadii: ShapeCornerRadii;
  /** Only meaningful for "polygon" - 3-20. */
  sides: number;
  /** Only meaningful for "star" - 3-20. */
  starPoints: number;
  /** Only meaningful for "star" - how far in the star's inner vertices sit, 0-100 percent of the
   * outer radius; 100 would collapse it into a regular (starPoints*2)-gon. */
  starInnerRadius: number;
  fill: ShapeFill;
  stroke: ShapeStroke;
  shadow: ShapeShadow;
}

/** Blocks a Layout may contain. Quiz (or any future graded/interactive block) is deliberately
 * excluded here: a Layout is a page template, and templates must not carry graded state. A
 * navigation button (or a shape, which carries no state at all) has nothing graded to exclude, so
 * - unlike Quiz - both are allowed in a Layout, letting an author bake e.g. one consistent
 * background shape or "Weiter" button into every slide of that layout. */
export type StaticBlock = TextBlock | LanguageBlock | CodeBlock | TexBlock | ImageBlock | VideoBlock | IframeBlock | ButtonBlock | ShapeBlock;
export type Block = StaticBlock | QuizBlock;

export interface Layout {
  id: UUID;
  name: string;
  blocks: StaticBlock[];
}

/** Every kind of transition Weft knows how to animate the move to the *next* node with - "none"
 * is an instant cut, all others are animated (see player.runtime.js's animateTransition). Kept as
 * its own type rather than inlined into Transition so the player and the editor's own options
 * list (see document/transitions.ts) can both reference just this. */
export type TransitionType = "none" | "fade" | "move" | "iris" | "cube" | "blur" | "horror";

/** Which way the OUTGOING slide travels (a Move slides it off that way, a Cube turns that way) -
 * the incoming one arrives from the opposite side. */
export type TransitionDirection = "left" | "right" | "up" | "down";

export interface Transition {
  type: TransitionType;
  /** Only meaningful when type isn't "none" - how long the animation takes, in milliseconds.
   * Defaults to 500 (see setPageTransition/setPageTransitionDuration in document/actions.ts). */
  durationMs: number;
  /** "move" and "cube" only. Absent = that type's default (see defaultDirection in
   * document/transitions.ts) - every option below is optional so a module saved before it existed
   * still loads. */
  direction?: TransitionDirection;
  /** "move" only: slide just the page's own content while the slide itself (background and the
   * layout's blocks) stays put - possible only when the next slide uses the same layout, otherwise
   * the whole slide moves regardless (with the content trailing it by a few ms). */
  contentOnly?: boolean;
  /** "iris" only: a hard-edged circle instead of the default soft one. */
  hardEdge?: boolean;
  /** "iris" only: where the circle opens from, in percent of the slide. Absent = the middle. */
  irisCenter?: { x: number; y: number };
}

/** How an edge's timing is known: "unknown" - the "to" node happens sometime causally after the
 * "from" node, but not on any fixed schedule (e.g. it's waiting on a click) - rendered as a
 * dashed line. "timed" - it happens automatically, a fixed delay after "from" (see `delayMs`) -
 * rendered as a solid line. "advance" - it happens on the learner's NEXT "Weiter" input (Space/→,
 * or a button block whose action is "advance") after "from" has already fired - never on a timer,
 * and never automatic the way "unknown" quiz/video events are either (those happen because the
 * learner did something specific; this happens on the very next advance *regardless* of what the
 * learner does) - see player.runtime.js's advanceQueue/onAdvance. See Timeline.tsx. */
export type TimelineEdgeKind = "unknown" | "timed" | "advance";

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
 * submit-correct"/"quiz-submit-incorrect" are for the very same real-world moment (there's only
 * ever one submit), but get their own icon AND their own node id (see quizSubmitNodeId in
 * document/pageTimeline.ts) once a lane's been built for that particular outcome
 * (advanceOnCorrect/advanceOnIncorrect) - both so the two learning paths read as visually distinct
 * rather than both showing the same checkmark, and so they're two genuinely separate, independently
 * selectable/triggerable nodes rather than two different-looking labels sharing one id (which used
 * to make selecting either one in the graph highlight both at once). "video-start-
 * auto"/"video-start-manual": a VideoBlock starts playing - split in two so Timeline.tsx can show
 * a different icon for a video that starts itself (autoplay) versus one the learner has to press
 * play on. "video-end-loop"/"video-end-stop": likewise for how it stops - looping forever, or
 * actually ending. "video-stop-point": one of that video's own VideoStopPoint entries, placed
 * between "video-start-*" and "video-end-*" in playback order (see buildVideoLane) - always the
 * same pause icon regardless of VideoStopPoint.stopsVideo, matching VideoStopPointDialog's own
 * markers, which don't distinguish that either. "block-entrance"/"block-exit": any page block's
 * own Aufbau/Abbau (see BaseBlock.entranceEffect/exitEffect), once it's configured with something
 * other than the trivial default (see buildBlockEffectLane in document/pageTimeline.ts) - lets an
 * effect's trigger/timing show up in the graph itself, not just in that block's own panel. */
export type TimelineEventType =
  | "quiz-fill-start"
  | "quiz-submit"
  | "quiz-submit-correct"
  | "quiz-submit-incorrect"
  | "video-start-auto"
  | "video-start-manual"
  | "video-stop-point"
  | "video-end-loop"
  | "video-end-stop"
  | "block-entrance"
  | "block-exit";

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
  /** Other events triggered directly by this one, rendered as a small vertical stack right below
   * it (see Timeline.tsx) instead of as their own horizontal lane - used for a video's own stop
   * points specifically (see syncPageTimelineEvents in document/pageTimeline.ts): a stop point
   * sits in the *middle* of its video's own lane, so a horizontally forked trigger lane starting
   * from a copy of it would make the video's timeline look like it has two of the same stop point
   * on two different rows - confusing in a way a lane starting from "start" or a quiz's own
   * events isn't. Always exactly one level deep in practice (only a stop point ever gets any) -
   * the type stays self-referential mainly so a reader doesn't have to special-case it. */
  children?: { node: TimelineNode; delayMs: number }[];
  /** True when this node's single child (see `children`) should be shown *instead of* this
   * node's own icon/label at this exact graph position - see Timeline.tsx's own rendering and
   * EventPanel.tsx's own "effective node" redirect. Only ever set for a video's own non-stopping
   * stop point (VideoStopPoint.stopsVideo false) that triggers exactly one thing (see
   * syncPageTimelineEvents in document/pageTimeline.ts) - once there's nothing left that's
   * independently meaningful about the stop point itself (it doesn't even pause the video),
   * showing both it and its one child is pure clutter. This node's own id/label/eventType are
   * deliberately left untouched even so - it's still exactly as findable, and exactly as valid a
   * trigger *source* for anything else, as if this were false; only how it's *drawn* changes. */
  inlineChild?: boolean;
}

/** One horizontal row in the timeline UI: a chain of nodes joined by edges. Events with no
 * causal relationship to this lane's events get their own additional lane instead of sharing
 * this one - see PageTimeline.lanes. */
export interface TimelineLane {
  nodes: TimelineNode[];
  edges: TimelineEdge[];
}

/** A page's timeline, stored per-page rather than computed by scanning its blocks at render
 * time. Two parts, kept deliberately separate so there's only ever one place - `triggerEdges` -
 * that records "who fires this", instead of that living partly here and partly on whichever
 * block happens to own the effect (see BlockEffect's own doc comment):
 *
 * - `lanes`: this page's own structural skeleton - the base "start"->"end" line every page has,
 *   plus one lane per quiz outcome and one per video block - entirely recomputed from scratch by
 *   syncPageTimelineEvents (document/pageTimeline.ts) whenever a relevant block changes. Never
 *   written to directly by any UI - only ever replaced wholesale. Lane 0 always starts with a
 *   "start" node and ends with an "end" node - see createDefaultPageTimeline().
 * - `triggerEdges`: every trigger relationship the author has actually chosen, in one flat,
 *   uniform list, regardless of what caused it to be added - a block's own Aufbau/Abbau, a
 *   video's own non-autoplay start, or a free-standing "event X also fires event Y" link created
 *   directly in EventPanel.tsx. At most one edge per `to` (see findTriggerEdge in
 *   document/pageTimeline.ts) - an event has at most one thing that causes it. `to` may only ever
 *   be a node whose eventType is in TRIGGERABLE_EVENT_TYPES (document/pageTimeline.ts) - see that
 *   set's own doc comment for which events can actually be caused this way, and why most can't.
 *   syncPageTimelineEvents both reads this (to know which trigger lanes to render, appended after
 *   `lanes` above) and prunes it (dropping any edge whose `to`/`from` no longer exists).
 */
export interface PageTimeline {
  lanes: TimelineLane[];
  triggerEdges: TimelineEdge[];
}

/** Several of a page's own blocks, bundled so they move (and resize, together,
 * proportionally) as one unit on the canvas, same as a Keynote/PowerPoint group - see
 * groupBlocks in document/actions.ts. Deliberately thin: no position/rotation/effect fields of
 * its own. A group's own bounding box is always derived from its members' current positions
 * (see resizeMath.ts's groupBoundingBox), and its "shared" Aufbau/Abbau (see GroupPanel.tsx) is
 * UI sugar that writes the same entranceEffect/exitEffect/trigger to every member's own existing
 * fields rather than a new, separate concept the timeline graph or the exported player need to
 * know about - grouping is purely an editor/authoring convenience, invisible to player.runtime.js
 * and to the data a member block carries on its own.
 *
 * `blockIds` are always kept contiguous, in this exact order, within the owning Page's own
 * `blocks` array (see groupBlocks) - what lets the sidebar (PagePanel.tsx) render a clean
 * indented bracket under one group header, and keeps "the group's own stacking position" (see
 * bringGroupToFront/sendGroupToBack) well-defined even though there's no explicit z-index
 * anywhere in this app (block array order already doubles as that, see BlockContainerRef's own
 * doc comment in document/store.ts). Groups are page-only - a Layout has no timeline/graded state
 * and nothing about grouping needs either, so there was no reason to extend Layout the same way.
 */
export interface BlockGroup {
  id: UUID;
  blockIds: UUID[];
}

export interface Page {
  id: UUID;
  layoutId: UUID | null;
  blocks: Block[];
  /** This page's own groups (see BlockGroup) - empty for the vast majority of pages, which never
   * group anything. */
  groups: BlockGroup[];
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
  /** The languages this module is offered in, as locales ("de_DE", "en_US" - see
   * core/i18n/languages.ts), the first being the default one. Empty (the default) means a
   * single-language module: no `userlanguage` variable, no language switchers, nothing translated. */
  languages: string[];
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
 *
 * `formatVersion` 2: Weiter-as-a-trigger/"off" effect type exist (see migrateMissingAdvanceTriggers
 * in io/unpack.ts) - a document saved at 1 predates them, so its "no trigger edge" states still
 * mean the OLD defaults (immediate) and get frozen into explicit edges once on load; a document at
 * 2 was authored with the new dynamic defaults ("no edge" = "Weiter, after everything else"),
 * which that migration must never touch - re-running it would silently rewrite them.
 */
export interface WeftDocument {
  formatVersion: 1 | 2;
  content: WeftModule;
  undoHistory: UndoEntry[];
  /** Index of the last applied entry; -1 means the document is at its initial state. */
  undoIndex: number;
}
