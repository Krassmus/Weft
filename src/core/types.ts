export type UUID = string;

/** Position among the siblings of an ordered collection (a page's blocks, the page sequence, a
 * branch's pages) - a fractional key, see core/document/ordering.ts. */
export type OrderKey = string;

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
export type BlockEffectType = "off" | "none" | "fade" | "move" | "iris" | "wipe" | "anvil" | "blur";

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
  /** Only meaningful when `type` isn't "none" (which always shows/hides instantly). */
  durationMs: number;
  /** "wipe" only: the way the wipe travels (an Aufbau "Nach rechts" uncovers the block from its left
   * edge towards the right one, an Abbau covers it up the same way). Absent = "right" - optional so
   * a module saved before it existed still loads. */
  direction?: TransitionDirection;
}

interface BaseBlock {
  id: UUID;
  /** Stacking order among the blocks of its page/layout (later = on top) - see ordering.ts. */
  order: OrderKey;
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
  /** Text longer than the block can be scrolled vertically (never horizontally). Off by default -
   * and absent on every block saved before this existed, which therefore stay unscrollable: the
   * overflowing text is simply cut off at the block's edge. */
  scrollable?: boolean;
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

/** One answer of a quiz. An option is "handled right" when it is ticked if it is a correct one and left alone if it isn't (so
 * even knowing that an answer is wrong earns something); "handled wrong" is the opposite. Each case can have effects of its own
 * (points of one kind or another, minus points ...), independent of the quiz as a whole being right. Optional so that a module
 * saved before they existed loads as it is: no effects. */
export interface QuizOption {
  id: UUID;
  html: string;
  onRight?: VariableEffect[];
  onWrong?: VariableEffect[];
}

export interface QuizBlock extends BaseBlock {
  kind: "quiz";
  translations?: Record<string, BlockTranslation>;
  /** Rich HTML, exactly like TextBlock.html - edited in place on the canvas with the same
   * bold/italic/underline/font/size/color toolbar (see EditableText/TextEditor). A module saved
   * before this held HTML is migrated on load (see unpack.ts) by escaping its old plain text
   * into an equivalent paragraph, so every reader can assume this is always already-safe HTML. */
  questionHtml: string;
  options: QuizOption[];
  correctOptionIds: UUID[];
  /** An open question rather than a test: nothing is right or wrong. Submitting it is thanked ("Danke!") instead of judged, correctOptionIds
   * and onIncorrect are ignored, onCorrect is what happens on submitting (and it counts as "richtig" for the page's graph), and an
   * answer's own effects are by whether it is ticked (onRight) or not (onWrong). Optional: a module saved before this is a test. */
  open?: boolean;
  /** What happens once the quiz as a whole was answered right / wrong (all options as they should be / not). */
  onCorrect: VariableEffect[];
  onIncorrect: VariableEffect[];
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

/** How an arrow is drawn: a plain line, as if drawn by hand, or in the curls of Art Nouveau. */
export type ArrowStyle = "plain" | "sketch" | "ornate";

/** One waypoint of an arrow, in percent of the arrow block's own box (0,0 = its top left corner) - not
 * necessarily within it while the arrow is being edited. */
export interface ArrowPoint {
  x: number;
  y: number;
}

/** An arrow: a curve through its waypoints (two or more; the first and last are its ends), with an arrowhead
 * at either end if wanted. The block's box is the box around the waypoints (the editor keeps them
 * in step - see core/document/arrow.ts), so moving, rotating, scaling and the entrance/exit effects work
 * on it like on any other block. Drawn by runtime/arrowGeometry.js, the same code in the editor and the
 * player. */
export interface ArrowBlock extends BaseBlock {
  kind: "arrow";
  points: ArrowPoint[];
  arrowStyle: ArrowStyle;
  color: string;
  /** Line thickness in cqw (percent of the slide's width). */
  width: number;
  startHead: boolean;
  endHead: boolean;
}

/** One file offered for download by a FilesBlock. The bytes are an asset (`id`, see AssetMeta) - encrypted ones
 * if the block is protected. The rest is plain data about the original file, and stays readable in the
 * module whether or not there is a password. */
export interface FileEntry {
  id: UUID;
  /** The file's name for the download. */
  name: string;
  mimeType: string;
  /** Size of the original file in bytes. */
  size: number;
}

/** What a password-protected FilesBlock keeps to check a password and derive the key (see
 * runtime/filesCrypto.js) - never the password itself. */
export interface FilesProtection {
  /** Random salt of the key derivation (base64). */
  salt: string;
  /** PBKDF2 iterations. */
  iterations: number;
  /** A known text, encrypted with the key (base64): decrypting it is how a password is checked. */
  verifier: string;
}

/** Files the learners can download. With a password, the files in the archive are really encrypted (AES-256-GCM)
 * and the learner sees them only after entering it; names, types and sizes (`files`) stay readable. */
export interface FilesBlock extends BaseBlock {
  kind: "files";
  /** The heading of the box; empty: the player's own default ("Dateien"). */
  title: string;
  files: FileEntry[];
  protection: FilesProtection | null;
}

/** Blocks a Layout may contain. Quiz (or any future graded/interactive block) is deliberately
 * excluded here: a Layout is a page template, and templates must not carry graded state. A
 * navigation button (or a shape, which carries no state at all) has nothing graded to exclude, so
 * - unlike Quiz - both are allowed in a Layout, letting an author bake e.g. one consistent
 * background shape or "Weiter" button into every slide of that layout. */
export type StaticBlock = TextBlock | LanguageBlock | CodeBlock | TexBlock | ImageBlock | VideoBlock | IframeBlock | ButtonBlock | ShapeBlock | ArrowBlock | FilesBlock;
export type Block = StaticBlock | QuizBlock;

/** A block as it's first made, before it has been put somewhere (and so given its `order`). */
export type NewBlock = Block extends infer B ? (B extends Block ? Omit<B, "order"> : never) : never;
export type NewStaticBlock = StaticBlock extends infer B ? (B extends StaticBlock ? Omit<B, "order"> : never) : never;

export interface Layout {
  id: UUID;
  name: string;
  /** By block id; the stacking order is each block's own `order` (see ordering.ts's
   * orderedValues). Not an array so that moving a block is a change of one field. */
  blocks: Record<UUID, StaticBlock>;
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
 * this one - see getPageLanes in document/pageTimeline.ts. */
export interface TimelineLane {
  nodes: TimelineNode[];
  edges: TimelineEdge[];
}

/**
 * One trigger of a page (see PageTimeline.triggers): when the event `from` has happened, the event `to` happens `delayMs` later - if
 * `weiter`, only once the learner has pressed Weiter after `from` (then `delayMs` runs from that press). The ids are those of the
 * page's events (see core/eventGraph and docs/event-graph.md): "start", "end" or one of document/pageTimeline.ts's `*NodeId`.
 * An event can have several incoming triggers; any one of them is enough to make it happen.
 */
export interface PageTrigger {
  from: string;
  to: string;
  delayMs: number;
  weiter: boolean;
}

/** A "Nächste Folie" event of a page: leaving it, with `transition` (how the slide goes away - see Transition). */
export interface PageEnd {
  transition: Transition;
}

/**
 * What a page's event graph stores (see docs/event-graph.md): only what does not follow from its blocks. The events themselves
 * - an element's Aufbau/Abbau, a video's start and stop points, what a quiz does - are derived (getPageLanes in
 * document/pageTimeline.ts) and have stable ids made of the block's id; what is chosen by the author is here:
 *
 * - `triggers`: every line of the graph, by trigger id. Keyed so that two people changing different triggers of the same page never
 *   overwrite each other (a list that is replaced whole would). A trigger whose event or source no longer exists is pruned by
 *   syncPageTimelineEvents.
 * - `ends`: the "Nächste Folie" events, by id: "end" is the page's own and always there; a quiz that goes on to the next page
 *   after its feedback has `end:quiz:<blockId>:<richtig|falsch>`. Each has the transition of its own.
 *
 * There are no implicit triggers: an Aufbau that waits for Weiter at the end of the chain has a trigger of its own, put there when
 * the effect was chosen (see syncPageTimelineEvents), and so has "Nächste Folie". Deliberately NOT stored: the rows of the graph
 * the editor draws (TimelineLane) - they follow entirely from the blocks and these triggers, so they are computed.
 */
export interface PageTimeline {
  triggers: Record<string, PageTrigger>;
  ends: Record<string, PageEnd>;
  /** A title the author gave an event instead of its standard one, by event id. Absent: the standard titles. */
  titles?: Record<string, string>;
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
 * block stacking order (see groupBlocks) - what lets the sidebar (PagePanel.tsx) render a clean
 * indented bracket under one group header, and keeps "the group's own stacking position" (see
 * bringGroupToFront/sendGroupToBack) well-defined even though there's no explicit z-index
 * anywhere in this app (the blocks' `order` keys already double as that, see ordering.ts). Groups are page-only - a Layout has no timeline/graded state
 * and nothing about grouping needs either, so there was no reason to extend Layout the same way.
 */
export interface BlockGroup {
  id: UUID;
  blockIds: UUID[];
}

/** One way out of a jump page: where to go if `condition` holds. */
export interface JumpTarget {
  id: UUID;
  /** The page to go to (by id - the page may have been deleted since: then this way is skipped). */
  pageId: UUID;
  condition: VariableCondition;
}

/**
 * What makes a page a jump page: it is never shown. The moment the learner gets there he is sent on to another page - the
 * first of `targets` whose condition holds (in this order, like the branches of a logic block), else `defaultPageId` (the
 * "sonst"). Without a default and with nothing that holds, the jump page is just passed over. The sequence goes on after
 * the page that was jumped to, as if the learner had got there the normal way.
 */
export interface PageJump {
  targets: JumpTarget[];
  defaultPageId: UUID | null;
}

export interface Page {
  id: UUID;
  layoutId: UUID | null;
  /** Set for a jump page (see PageJump): then the page has no blocks and is not shown. */
  jump?: PageJump;
  /** By block id - see Layout.blocks. */
  blocks: Record<UUID, Block>;
  /** This page's own groups (see BlockGroup) - empty for the vast majority of pages, which never
   * group anything. */
  groups: BlockGroup[];
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
  /** The pages of this branch, by page id; the order they're played in is each entry's own
   * `order` (see ordering.ts) - not an array so that moving a page is a change of one field. */
  pages: Record<UUID, { order: OrderKey }>;
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

/** One entry of WeftModule.sequence: a node plus its position in the main sequence. */
export type SequenceEntry = SequenceNodeRef & { order: OrderKey };

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
  /** The main sequence, by the id of the page / logic block each entry stands for; played in each
   * entry's own `order` (see ordering.ts's orderedValues, and sequenceOf in document/sequence.ts). */
  sequence: Record<UUID, SequenceEntry>;
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

/**
 * The root object that is serialized to weft.json. Save format and export format are the
 * same on purpose: exporting is just packing this plus a generated index.html into a zip.
 *
 * `formatVersion` says which shape `content` has, and which of the migrations in io/unpack.ts have
 * already been applied to it - those run exactly once, when a file of an older version is opened,
 * never on a document that is already current (re-running one would silently rewrite what the
 * author has since changed - and, in a document edited by several people at once, every one of them
 * would apply it and the copies would conflict). A file with a HIGHER version than this build knows
 * is refused rather than opened half-understood.
 *  - 1: before "Weiter" was a trigger (see migrateMissingAdvanceTriggers) - "no trigger edge" still
 *    means the OLD defaults (immediate).
 *  - 2: dynamic Weiter defaults ("no edge" = "Weiter, after everything else").
 *  - 3: mergeable shape - blocks, the page sequence and a branch's pages are keyed by id and carry
 *    an `order` key instead of being arrays (see core/document/ordering.ts), a page's trigger edges
 *    are keyed by the event they cause, the timeline's lanes are computed instead of stored, and the
 *    undo history is no longer part of the file (it is local to whoever is editing: see UndoEntry
 *    in document/store.ts).
 *  - 4: the page's event graph is stored as it is understood now (see PageTimeline and docs/event-graph.md): a list of triggers
 *    with an optional Weiter instead of trigger edges keyed by event, "Nächste Folie" as events of their own that carry the
 *    transition (`Page.transition` is gone), a quiz that goes on to the next page by a trigger and such an event (the flags
 *    `advanceOnCorrect`/`advanceOnIncorrect` are gone), and no implicit defaults any more.
 * Only migrations that CHANGE data (the conversion to the mergeable shape, the Weiter freeze) are
 * gated on this number. The small "field missing? give it its default" backfills in io/unpack.ts
 * run on every load - they write nothing at all to a document that already has the field.
 */
export const CURRENT_FORMAT_VERSION = 4;

export interface WeftDocument {
  formatVersion: number;
  content: WeftModule;
  /** The document's full editing history (Automerge's binary format), set only on a document that
   * has just been read from a file that carries one - what lets the same lineage be merged with
   * other copies of it (see mergeHistory in document/store.ts). Never part of weft.json itself;
   * loadDocument consumes it. */
  history?: Uint8Array;
  /** The id of the Automerge document this file was saved from (see COLLAB_FILE in io/pack.ts), set
   * together with `history`: opening the file continues under that same id, so a link that was shared
   * for it keeps working and every copy of the file finds the same room. Never part of weft.json. */
  documentId?: string;
  /** Set when the file is an invitation to live collaboration (see LiveInvitation) - only on a file saved
   * with that switched on, never in an export. */
  live?: LiveInvitation;
}

/**
 * What a .weft file carries when it is an invitation: whoever opens it joins the others who have it
 * open, live. `secret` is the password of the room (see core/collab/session.ts) - whoever has the file
 * has it, which is the point: the file is shared only with the people who may work on the module (in a
 * shared Nextcloud folder, say) - so it is written into saved working files only, never into an exported
 * module (see COLLAB_FILE in io/pack.ts). `relays` are the signaling relays to meet over, if not the
 * public defaults.
 */
export interface LiveInvitation {
  secret: string;
  relays: string[];
}
