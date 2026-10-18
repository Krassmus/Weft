import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { stopPointIconSvg } from "../stopPointIcon";
import moreOptionsIconSvg from "../../../../mockups/icons/admin.svg?raw";
import { TextFormatDialog } from "./TextFormatDialog";
import { ImageEffectDialog } from "./ImageEffectDialog";
import { IMAGE_MASK_SHAPES, defaultMask, removePoint, setRadius, toggleSmooth } from "../../../core/document/imageMask";
import { useImageEdit } from "../blocks/imageEditStore";
import { useImageBoxAspect } from "../blocks/ImageSvg";
import { CODE_THEMES } from "../../../core/code/codeThemes";
import { AUTO_LANGUAGE, CODE_LANGUAGES } from "../../../core/code/highlight";
import { createId } from "../../../core/id";
import { addCustomFont, addTrigger, removeTrigger, setEventTrigger, setQuizAdvance, updateTrigger } from "../../../core/document/actions";
import type { VideoUploadResult } from "../../../core/document/actions";
import {
  blockEffectNodeId,
  buttonClickNodeId,
  endNodeIds,
  findNode,
  getBlockEntranceTrigger,
  getBlockExitTrigger,
  isListPerItem,
  outgoingTriggers,
  quizEndNodeId,
  scriptRunNodeId,
} from "../../../core/document/pageTimeline";
import type { ResolvedTrigger } from "../../../core/document/pageTimeline";
import { DIRECTION_LABELS } from "../../../core/document/transitions";
import { useAssetStore } from "../../../core/assets/assetStore";
import { formatTimeMMSS } from "../../../core/formatTime";
import { useDocumentStore } from "../../../core/document/store";
import { isBooleanVariable, isSettableVariable } from "../../../core/document/variables";
import { CURATED_FONT_FAMILIES } from "../../../core/fonts/curatedFonts";
import { DEFAULT_FONT_FAMILY } from "../../../core/fonts/fontFaceCss";
import { BLOCK_KIND_KEYS } from "../../../core/i18n/translations";
import { useTranslation } from "../../../core/i18n/useTranslation";
import { SecondsControl } from "./SecondsControl";
import { StepperSlider } from "./StepperSlider";
import { addFilesToBlock, removeFileFromBlock, setFilesPassword } from "../../../core/document/filesActions";
import type { BlockContainerRef } from "../../../core/document/store";
import { confirmDestructive, pickFilesFromDisk, pickFontFile, warnAboutVideoUploads } from "../../../core/io/fileIO";
import { filesCheckPassword } from "../../../core/runtime/filesCrypto.js";
import { formatFileSize } from "../blocks/FilesView";
import { useTranscodeStatus } from "../../../core/io/videoTranscode";
import type {
  Block,
  BlockEffect,
  BlockEffectType,
  TransitionDirection,
  ButtonAppearance,
  ButtonBlock,
  ClozeBlock,
  CodeBlock,
  ScriptBlock,
  IframeBlock,
  ImageBlock,
  ListBlock,
  ListMarkerKind,
  Page,
  QuizBlock,
  QuizOption,
  ArrowBlock,
  ArrowStyle,
  FilesBlock,
  ShapeBlock,
  ShapeCornerRadii,
  ShapeFill,
  ShapeGradient,
  ShapeGradientStop,
  ShapeKind,
  ShapeShadow,
  ShapeStroke,
  TextBlock,
  TimelineEdgeKind,
  VariableDef,
  VariableEffect,
  VideoBlock,
  VideoStopPoint,
} from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { applyFontSize, applyFormat, useFormatSnapshot } from "../blocks/richText";
import type { TriState } from "../blocks/richText";
import { listPageTriggerEvents, listTriggerableNodes, nodeLabel } from "../Timeline";
import { OutgoingTriggersSection } from "./TriggerSections";
import { pageChoices } from "./pageChoices";
import { PageMiniature } from "../PageMiniature";
import { buttonAppearanceOf } from "../../../core/document/buttonAppearance";
import { placeholderOfText, textsWithOtherFormatting } from "../../../core/document/placeholders";
import { applyPlaceholderFormattingToPages, resetPlaceholderFormatting } from "../../../core/document/actions";
import { FontSelect } from "./FontSelect";
import type { FontSelectGroup } from "./FontSelect";
import { usePlaceholderProblems } from "../blocks/usePlaceholderProblems";
import { listItemHtml, quizOptionHtml, textHtml } from "../../../core/document/translations";
import { clozeBlanks } from "../../../core/document/cloze";
import { useEditingLanguage } from "../useEditingLanguage";
import { LanguageSelect } from "./LanguageSelect";
import { TexEditor } from "./TexEditor";
import { TriggerPicker } from "./TriggerPicker";
import { tr } from "../../../core/i18n/tr";
import { ColorField } from "../ColorField";
import { useStopPointDialog } from "../blocks/stopPointDialogStore";
import { useBackdropClose } from "../useBackdropClose";

const SANDBOX_FLAGS = ["allow-scripts", "allow-same-origin", "allow-popups", "allow-forms"];
const UPLOAD_FONT_VALUE = "__upload__";
// Single source of truth for the font-size stepper's floor/ceiling - used by the number input's
// own min/max *and* by both step buttons *and* by typing a value directly, so all three ways of
// changing the size agree. Previously the buttons hardcoded their own "8" separately from the
// input's min attribute, and a typed value wasn't clamped at all - so a value typed below 8
// (allowed) and then nudged with the "−" button (floored at the button's own hardcoded 8) would
// visibly jump back *up* to 8 instead of continuing to shrink, which is what actually caused the
// "inconsistent"/"komisch" behavior reported for small sizes, not the cqw storage itself.
const MIN_FONT_SIZE_PX = 4;
const MAX_FONT_SIZE_PX = 300;

interface BlockPanelProps {
  block: Block;
  onUpdate: (patch: Partial<Block>) => void;
  onSetImage: (file: File) => void;
  onSetVideo: (file: File) => Promise<VideoUploadResult>;
  /** Where the block is (a page or a layout) - what the files block's actions need to find it. */
  container: BlockContainerRef;
  /** Present only when editing a block that lives directly on a page (not inside a Layout) -
   * Aufbau/Abbau (see BlockEffectEditor) only make sense there: a Layout applies to every page
   * that uses it, with no timeline of its own for a trigger to come from. Also doubles as the
   * source for the trigger-event picker itself (see listPageTriggerEvents). */
  page?: Page;
}

export function BlockPanel({ block, onUpdate, onSetImage, onSetVideo, container, page }: BlockPanelProps) {
  // A block's own Aufbau/Abbau can name any other event as its trigger, but never itself - that's
  // not a real "it happens later" relationship, just a node pointing at its own not-yet-fired self.
  const ownEffectNodeIds = new Set([blockEffectNodeId(block.id, "entrance"), blockEffectNodeId(block.id, "exit")]);
  const triggerEvents = page ? listPageTriggerEvents(page).filter((e) => !ownEffectNodeIds.has(e.id)) : [];
  const placeholderProblems = usePlaceholderProblems(block);
  const content = useDocumentStore((s) => s.doc.content);
  const fromPlaceholder = placeholderOfText(content, page, block) !== null;
  const deviating =
    block.kind === "placeholder" && container.kind === "layout" ? textsWithOtherFormatting(content, container.layoutId, block).length : 0;
  return (
    <>
      {placeholderProblems.length > 0 && (
        <div className="weft-placeholder-warning">
          {placeholderProblems.map((problem) => (
            <p key={problem}>⚠ {problem}</p>
          ))}
        </div>
      )}
      {/* Same formatting toolbar for both - a quiz's question and options are rich text edited
          directly on the canvas exactly like a text block's own content, just several regions
          sharing one block instead of one filling it (see EditableRichText in BlockView.tsx). */}
      {(block.kind === "text" ||
        block.kind === "placeholder" ||
        block.kind === "quiz" ||
        block.kind === "list" ||
        block.kind === "cloze" ||
        block.kind === "button") && (
        <TextEditor
          block={block.kind === "text" || block.kind === "button" ? block : undefined}
          onUpdate={onUpdate}
          // A text a page has for a placeholder of its layout: its formatting can be brought back to the placeholder's.
          onResetStyle={fromPlaceholder && page ? () => resetPlaceholderFormatting(page.id, block.id) : undefined}
          // On the template: the formatting of this placeholder can be put on the texts of all pages - offered when some of them have
          // another one.
          onApplyToPages={
            block.kind === "placeholder" && container.kind === "layout" && deviating > 0
              ? () => applyPlaceholderFormattingToPages(container.layoutId, block.id)
              : undefined
          }
          appliesToCount={deviating}
        />
      )}
      {block.kind === "placeholder" && (
        <Collapsible title={tr("ui.placeholder")}>
          <label className="weft-field">
            <span>{tr("ui.name")}</span>
            <input value={block.label} onChange={(e) => onUpdate({ label: e.target.value })} />
          </label>
          <p className="weft-hint">
            {tr("ui.the_text_here_is_only_a")}
          </p>
        </Collapsible>
      )}
      {fromPlaceholder && page?.layoutId && (
        <Collapsible title={tr("ui.element_text_placeholder")} defaultOpen>
          <p className="weft-hint">{tr("ui.the_position_is_defined_on_the")}</p>
          <button
            type="button"
            className="weft-ghost-button weft-full-width"
            onClick={() => useDocumentStore.getState().select({ type: "layout", layoutId: page.layoutId! })}
          >
            {tr("ui.edit_template_slide")}
          </button>
        </Collapsible>
      )}
      {block.kind === "list" && <ListEditor block={block} page={page} onUpdate={onUpdate} onSetImage={onSetImage} />}
      {block.kind === "cloze" && <ClozeEditor block={block} page={page} onUpdate={onUpdate} />}
      {block.kind === "code" && <CodeEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "tex" && <TexEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "image" && <ImageEditor block={block} onUpdate={onUpdate} onSetImage={onSetImage} />}
      {block.kind === "video" && <VideoEditor block={block} onUpdate={onUpdate} onSetVideo={onSetVideo} />}
      {block.kind === "iframe" && <IframeEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "button" && <ButtonEditor block={block} page={page} onUpdate={onUpdate} />}
      {block.kind === "quiz" && <QuizEditor block={block} page={page} onUpdate={onUpdate} />}
      {block.kind === "shape" && <ShapeEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "arrow" && <ArrowEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "files" && <FilesEditor key={block.id} block={block} container={container} onUpdate={onUpdate} />}
      {block.kind === "script" && <ScriptEditor key={block.id} block={block} page={page} onUpdate={onUpdate} />}
      {/* (A logic block has no Aufbau/Abbau: it has an event of its own, in the graph.) */}
      {page && block.kind !== "script" && (
        <>
          <BlockEffectEditor
            key={block.id + "-entrance"}
            title={tr("ui.entrance")}
            page={page}
            targetNodeId={blockEffectNodeId(block.id, "entrance")}
            effect={block.entranceEffect}
            trigger={getBlockEntranceTrigger(page, block)}
            events={triggerEvents}
            // A list whose items appear one by one has no Aufbau event of its own: the triggers are those of its items.
            hideTrigger={isListPerItem(block)}
            onEffectChange={(entranceEffect) => onUpdate({ entranceEffect })}
            onTriggerChange={(from, delayMs, kind) =>
              setEventTrigger(page.id, blockEffectNodeId(block.id, "entrance"), from, delayMs, kind)
            }
          />
          <BlockEffectEditor
            key={block.id + "-exit"}
            title={tr("ui.exit")}
            page={page}
            targetNodeId={blockEffectNodeId(block.id, "exit")}
            effect={block.exitEffect}
            trigger={getBlockExitTrigger(page, block)}
            events={triggerEvents}
            onEffectChange={(exitEffect) => onUpdate({ exitEffect })}
            onTriggerChange={(from, delayMs, kind) => setEventTrigger(page.id, blockEffectNodeId(block.id, "exit"), from, delayMs, kind)}
          />
        </>
      )}
      {/* Least important thing here, since it's rarely worth fiddling with numerically instead of
          just dragging the block on the canvas - always last regardless of block kind, rather
          than leading with a wall of coordinate fields before anything content-related. */}
      {!fromPlaceholder && <PositionCollapsible block={block} onUpdate={onUpdate} />}
    </>
  );
}

const BLOCK_EFFECT_DIRECTIONS: TransitionDirection[] = ["right", "left", "down", "up"];

// "off" is listed separately (its label depends on Aufbau/Abbau, see BlockEffectEditor).
const BLOCK_EFFECT_LABELS: Record<Exclude<BlockEffectType, "off">, { entrance: string; exit: string }> = {
  none: { get entrance() { return tr("ui.no_animation"); }, get exit() { return tr("ui.no_animation"); } },
  fade: { get entrance() { return tr("ui.fade"); }, get exit() { return tr("ui.fade"); } },
  move: { get entrance() { return tr("ui.move"); }, get exit() { return tr("ui.move"); } },
  iris: { get entrance() { return tr("ui.iris_wipe"); }, get exit() { return tr("ui.iris_wipe"); } },
  wipe: { get entrance() { return tr("ui.wipe"); }, get exit() { return tr("ui.wipe"); } },
  anvil: { get entrance() { return tr("ui.anvil"); }, get exit() { return tr("ui.anvil_away_upwards"); } },
  blur: { get entrance() { return tr("ui.blur_2"); }, get exit() { return tr("ui.blur_2"); } },
  // Only an Abbau (see BLOCK_EFFECT_EXIT_ONLY).
  shatter: { get entrance() { return tr("ui.shatter"); }, get exit() { return tr("ui.shatter"); } },
};
const BLOCK_EFFECT_ORDER: Exclude<BlockEffectType, "off">[] = ["none", "fade", "move", "iris", "wipe", "anvil", "blur", "shatter"];
/** Effects that make no sense as an Aufbau (a thing that breaks to pieces and flies off can't appear that way). */
const BLOCK_EFFECT_EXIT_ONLY: BlockEffectType[] = ["shatter"];

/**
 * Editor for one block's Aufbau or Abbau - the animation itself (BaseBlock.entranceEffect/
 * exitEffect, `effect`/`onEffectChange`) plus, for anything other than "off", who triggers it and
 * after what delay (`trigger`/`onTriggerChange`, backed by a PageTimeline.triggerEdges entry - see
 * setEventTrigger in document/actions.ts - not by the effect object itself, see BlockEffect's own
 * doc comment in core/types.ts). "off" ("Kein Aufbau"/"Kein Abbau", the default - see
 * BlockEffectType's own doc comment) means there's no Aufbau/Abbau here at all: the block is just
 * always there/never auto-removed, with no trigger, no duration, and no node of its own in the
 * event graph - picking it hides both of those fields entirely, since there's nothing to
 * configure. Any other choice (even "Keine Animation" - a real Aufbau/Abbau that just doesn't
 * animate) always has a real trigger (`trigger` is only ever null while "off" is selected - see
 * getBlockEntranceTrigger/getBlockExitTrigger), so the trigger picker has no separate "none"
 * option of its own to offer any more. Type/duration mirror TransitionPanel.tsx's own radio group
 * otherwise (same "hide duration while there's nothing to time" rule).
 */
export function BlockEffectEditor({
  title,
  page,
  targetNodeId,
  effect,
  trigger,
  events,
  hideTrigger,
  onEffectChange,
  onTriggerChange,
}: {
  title: string;
  page: Page;
  targetNodeId: string;
  effect: BlockEffect;
  trigger: ResolvedTrigger | null;
  events: { id: string; label: string }[];
  /** Leave out the trigger picker (the event's own panel lists all its triggers itself). */
  hideTrigger?: boolean;
  onEffectChange: (effect: BlockEffect) => void;
  onTriggerChange: (from: string | null, delayMs: number, kind: TimelineEdgeKind) => void;
}) {
  const phase = title === "Aufbau" ? "entrance" : "exit";
  const offLabel = phase === "entrance" ? tr("ui.no_entrance") : tr("ui.no_exit");
  return (
    <Collapsible title={title} defaultOpen={effect.type !== "off"}>
      <label className="weft-field">
        <span>{tr("ui.type")}</span>
        <select value={effect.type} onChange={(e) => onEffectChange({ ...effect, type: e.target.value as BlockEffectType })}>
          <option value="off">{offLabel}</option>
          {BLOCK_EFFECT_ORDER.filter((type) => phase === "exit" || !BLOCK_EFFECT_EXIT_ONLY.includes(type)).map((type) => (
            <option key={type} value={type}>
              {BLOCK_EFFECT_LABELS[type][phase]}
            </option>
          ))}
        </select>
      </label>
      {effect.type !== "off" && (
        <>
          {effect.type !== "none" && (
            <div className="weft-field">
              <span>{tr("ui.duration_in_seconds")}</span>
              <SecondsControl
                label={tr("ui.duration_seconds")}
                minMs={100}
                valueMs={effect.durationMs}
                onChange={(durationMs) => onEffectChange({ ...effect, durationMs })}
              />
            </div>
          )}
          {effect.type === "wipe" && (
            <label className="weft-field">
              <span>{tr("ui.direction_of_the_wipe")}</span>
              <select
                value={effect.direction ?? "right"}
                onChange={(e) => onEffectChange({ ...effect, direction: e.target.value as TransitionDirection })}
              >
                {BLOCK_EFFECT_DIRECTIONS.map((direction) => (
                  <option key={direction} value={direction}>
                    {DIRECTION_LABELS[direction]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!hideTrigger && (
            <TriggerPicker
              page={page}
              targetNodeId={targetNodeId}
              trigger={trigger}
              options={events}
              allowNoTrigger={false}
              noTriggerLabel=""
              onChange={onTriggerChange}
            />
          )}
        </>
      )}
    </Collapsible>
  );
}

function PositionCollapsible({ block, onUpdate }: { block: Block; onUpdate: BlockPanelProps["onUpdate"] }) {
  const { t } = useTranslation();
  return (
    <Collapsible title={`${t("panel.element")} · ${t(BLOCK_KIND_KEYS[block.kind])}`}>
      <PositionEditor block={block} onUpdate={onUpdate} />
      <RotationEditor block={block} onUpdate={onUpdate} />
    </Collapsible>
  );
}

// Drag math already rounds x/y/width/height to 3 decimals at the source (see resizeMath.ts), but
// a document saved before that existed - or edited by typing a long value into one of these
// fields directly - can still carry a raw float; rounding again here just for display (and for
// the width/height this function derives below) keeps things readable without touching what's
// actually stored until a field is edited.
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function PositionEditor({ block, onUpdate }: { block: Block; onUpdate: BlockPanelProps["onUpdate"] }) {
  const { x, y, width, height } = block.position;
  // Matches the canvas: image/video blocks only ever get corner handles there (see
  // isFreelyMovableBlock in BlockView.tsx), which always resize proportionally - width and height
  // typed here should keep the same ratio for the same reason, rather than letting the sidebar
  // silently stretch/squish what dragging a corner never could.
  const lockAspect = block.kind === "image" || block.kind === "video";

  function updateWidth(nextWidth: number) {
    const patch = lockAspect && width > 0 ? { width: nextWidth, height: round3(nextWidth * (height / width)) } : { width: nextWidth };
    onUpdate({ position: { ...block.position, ...patch } });
  }

  function updateHeight(nextHeight: number) {
    const patch = lockAspect && height > 0 ? { height: nextHeight, width: round3(nextHeight * (width / height)) } : { height: nextHeight };
    onUpdate({ position: { ...block.position, ...patch } });
  }

  return (
    <div className="weft-field-grid">
      <label>
        <span>x</span>
        <input type="number" value={round3(x)} onChange={(e) => onUpdate({ position: { ...block.position, x: Number(e.target.value) } })} />
      </label>
      <label>
        <span>y</span>
        <input type="number" value={round3(y)} onChange={(e) => onUpdate({ position: { ...block.position, y: Number(e.target.value) } })} />
      </label>
      <label>
        <span>{tr("ui.width")}</span>
        <input type="number" value={round3(width)} onChange={(e) => updateWidth(Number(e.target.value))} />
      </label>
      <label>
        <span>{tr("ui.height")}</span>
        <input type="number" value={round3(height)} onChange={(e) => updateHeight(Number(e.target.value))} />
      </label>
    </div>
  );
}

/** The rotation in degrees: the number, "−" / "+" in steps of one degree and a slider from 0 to 360 (a typed value is held to that
 * range too). Under the x/y/width/height grid, its label as wide as theirs. */
function RotationEditor({ block, onUpdate }: { block: Block; onUpdate: BlockPanelProps["onUpdate"] }) {
  const rotation = round3(block.position.rotation ?? 0);
  return (
    <div className="weft-rotation-row">
      <span>{tr("ui.rotation")}</span>
      <StepperSlider
        label={tr("ui.rotation_2")}
        value={rotation}
        min={0}
        max={360}
        step={1}
        onChange={(value) => onUpdate({ position: { ...block.position, rotation: Math.min(360, Math.max(0, value)) } })}
      />
    </div>
  );
}

function formatButtonClass(state: TriState): string {
  return "weft-format-button" + (state === "on" ? " is-active" : state === "mixed" ? " is-mixed" : "");
}

/**
 * No HTML source field on purpose - the text itself is edited directly on the slide (see
 * EditableText in blocks/BlockView.tsx, contentEditable while the block is selected); this panel
 * only holds the formatting controls for whatever's currently selected/typed there, reflecting
 * its current state (useFormatSnapshot, recomputed on every selection change - see richText.ts).
 * A selection can span mixed formatting (e.g. only half of it bold), shown as "is-mixed" rather
 * than picking a side. The buttons use onMouseDown+preventDefault so clicking them never steals
 * focus (and with it the text selection) away from the slide; the select/inputs can't avoid
 * taking focus themselves, so they carry data-weft-format-control, which EditableText's blur
 * handler checks to keep richText.ts's notion of "the active editor" alive across that focus hop
 * instead of tearing it down.
 */
function TextEditor({
  block,
  onUpdate,
  onResetStyle,
  onApplyToPages,
  appliesToCount = 0,
}: {
  block?: TextBlock | ButtonBlock;
  onUpdate: BlockPanelProps["onUpdate"];
  onResetStyle?: () => void;
  onApplyToPages?: () => void;
  /** How many texts of the pages have a formatting other than the placeholder's (for the button of onApplyToPages). */
  appliesToCount?: number;
}) {
  const snapshot = useFormatSnapshot();
  const [formatDialogOpen, setFormatDialogOpen] = useState(false);
  const customFonts = useDocumentStore((s) => s.doc.content.customFonts);
  const sortedOtherFonts = CURATED_FONT_FAMILIES.filter((family) => family !== DEFAULT_FONT_FAMILY).sort((a, b) =>
    a.localeCompare(b, "de"),
  );
  // Reflecting the live value means these can't be plain controlled inputs (there's nowhere to
  // store what's mid-typed - the source of truth is the DOM selection, not local component
  // state), so they're kept as remount-on-change-elsewhere uncontrolled fields instead: a key
  // tied to the reflected value forces a fresh DOM input (and fresh cursor) only when the
  // selection actually moved to different formatting, never while the user is still typing here.
  const fontSizeKey = snapshot.fontSizePx === "mixed" ? "mixed" : String(snapshot.fontSizePx ?? "");
  const fontGroups: FontSelectGroup[] = [
    { options: [{ value: DEFAULT_FONT_FAMILY, label: DEFAULT_FONT_FAMILY, previewFamily: DEFAULT_FONT_FAMILY }] },
    ...(customFonts.length > 0
      ? [
          {
            label: tr("ui.own_fonts"),
            options: customFonts.map((font) => ({ value: font.family, label: font.family, previewFamily: font.family })),
          },
        ]
      : []),
    {
      label: tr("ui.fonts_included_in_the_export"),
      options: sortedOtherFonts.map((family) => ({ value: family, label: family, previewFamily: family })),
    },
    { options: [{ value: UPLOAD_FONT_VALUE, label: tr("ui.upload_your_own_font") }] },
  ];

  return (
    <Collapsible title={tr("ui.content")}>
      {block && <LanguageSelect block={block} />}
      <p className="weft-hint">{tr("ui.type_text_directly_on_the_slide")}</p>
      <div className="weft-format-toolbar" data-weft-format-control>
        <div className="weft-format-row">
          <button
            type="button"
            className={formatButtonClass(snapshot.bold)}
            title={tr("ui.bold")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat("bold")}
          >
            <strong>F</strong>
          </button>
          <button
            type="button"
            className={formatButtonClass(snapshot.italic)}
            title={tr("ui.italic")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat("italic")}
          >
            <em>K</em>
          </button>
          <button
            type="button"
            className={formatButtonClass(snapshot.underline)}
            title={tr("ui.underline")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat("underline")}
          >
            <span style={{ textDecoration: "underline" }}>U</span>
          </button>
          <span className="weft-format-divider" />
          <button
            type="button"
            className={"weft-format-button" + (snapshot.align === "left" ? " is-active" : "")}
            title={tr("ui.align_left")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat("justifyLeft")}
          >
            ⇤
          </button>
          <button
            type="button"
            className={"weft-format-button" + (snapshot.align === "center" ? " is-active" : "")}
            title={tr("ui.centre")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat("justifyCenter")}
          >
            ↔
          </button>
          <button
            type="button"
            className={"weft-format-button" + (snapshot.align === "right" ? " is-active" : "")}
            title={tr("ui.align_right")}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat("justifyRight")}
          >
            ⇥
          </button>
        </div>

        <label className="weft-field">
          <span>{tr("ui.font")}</span>
          <FontSelect
            value={snapshot.fontFamily === "mixed" ? "" : snapshot.fontFamily || DEFAULT_FONT_FAMILY}
            isMixed={snapshot.fontFamily === "mixed"}
            groups={fontGroups}
            onPick={(family) => {
              if (family === UPLOAD_FONT_VALUE) {
                void pickFontFile().then((file) => {
                  if (!file) return;
                  const { family: uploadedFamily } = addCustomFont(file);
                  applyFormat("fontName", uploadedFamily);
                });
                return;
              }
              applyFormat("fontName", family);
            }}
          />
        </label>

        <div className="weft-format-row">
          <label className="weft-field">
            <span>{tr("ui.font_size")}</span>
            <div className="weft-stepper">
              <button
                type="button"
                className="weft-format-button"
                title={tr("ui.smaller")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const current = typeof snapshot.fontSizePx === "number" ? snapshot.fontSizePx : 16;
                  applyFontSize(Math.max(MIN_FONT_SIZE_PX, current - 1));
                }}
              >
                −
              </button>
              <input
                key={fontSizeKey}
                type="number"
                min={MIN_FONT_SIZE_PX}
                max={MAX_FONT_SIZE_PX}
                defaultValue={fontSizeKey === "mixed" ? "" : fontSizeKey}
                placeholder={snapshot.fontSizePx === "mixed" ? tr("ui.mixed") : "24"}
                onBlur={(e) => {
                  const px = Number(e.target.value);
                  // Clamped here, not just via the input's own min/max attributes - those only
                  // affect the native spinner UI, not a value typed directly and read via
                  // e.target.value, which is why typing e.g. "2" previously stored a font-size
                  // below the intended floor at all (see MIN_FONT_SIZE_PX's own comment).
                  if (Number.isFinite(px)) applyFontSize(Math.min(MAX_FONT_SIZE_PX, Math.max(MIN_FONT_SIZE_PX, px)));
                }}
              />
              <button
                type="button"
                className="weft-format-button"
                title={tr("ui.larger")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const current = typeof snapshot.fontSizePx === "number" ? snapshot.fontSizePx : 16;
                  applyFontSize(Math.min(MAX_FONT_SIZE_PX, current + 1));
                }}
              >
                +
              </button>
            </div>
          </label>
          <label className="weft-field">
            <span>{tr("ui.colour")}</span>
            <ColorField
              value={snapshot.color === "mixed" || !snapshot.color ? "#000000" : snapshot.color}
              ariaLabel={tr("ui.colour")}
              onChange={(color) => applyFormat("foreColor", color)}
            />
          </label>
          {/* More options in a dialog: line height, small capitals, a gradient or picture behind the letters (see TextFormatDialog). */}
          <button
            type="button"
            className="weft-format-button weft-format-more"
            title={tr("ui.more_font_options")}
            aria-label={tr("ui.more_font_options")}
            disabled={!snapshot.active}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setFormatDialogOpen(true)}
            dangerouslySetInnerHTML={{ __html: moreOptionsIconSvg }}
          />
        </div>
      </div>
      {formatDialogOpen && <TextFormatDialog onClose={() => setFormatDialogOpen(false)} />}
      {onApplyToPages && (
        <>
          <button type="button" className="weft-ghost-button weft-full-width" onClick={onApplyToPages}>
            {tr("ui.apply_formatting_to_all_slides")}
          </button>
          <p className="weft-hint">
            {appliesToCount === 1
              ? tr("ui.one_text_on_the_slides_has")
              : tr("ui.texts_on_the_slides_have_a", { appliesToCount: appliesToCount })}{" "}
            {tr("ui.the_words_stay_the_formatting_is")}
          </p>
        </>
      )}
      {onResetStyle && (
        <button type="button" className="weft-ghost-button weft-full-width" onClick={onResetStyle}>
          {tr("ui.restore_the_formatting_of_the_template")}
        </button>
      )}
      {block && block.kind === "text" && (
        <>
          <label className="weft-field weft-field-inline">
            <input
              type="checkbox"
              checked={!!block.scrollable}
              onChange={(e) => onUpdate({ scrollable: e.target.checked })}
            />
            <span>{tr("ui.scrollbar")}</span>
          </label>
          <p className="weft-hint">
            {tr("ui.text_that_is_too_long_can")}
          </p>
        </>
      )}
    </Collapsible>
  );
}

function ImageEditor({
  block,
  onUpdate,
  onSetImage,
}: {
  block: ImageBlock;
  onUpdate: BlockPanelProps["onUpdate"];
  onSetImage: BlockPanelProps["onSetImage"];
}) {
  return (
    <Collapsible title={tr("ui.content")}>
      <label className="weft-field">
        <span>{tr("ui.image_file")}</span>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onSetImage(file);
          }}
        />
      </label>
      <label className="weft-field">
        <span>{tr("ui.alt_text")}</span>
        <input value={block.alt} onChange={(e) => onUpdate({ alt: e.target.value })} />
      </label>
      {block.assetId && <ImageEditTiles block={block} onUpdate={onUpdate} />}
    </Collapsible>
  );
}

/**
 * The two steps of editing a picture: "Maske" (what is shown: a shape that can be moved, scaled and edited as a curve on the
 * canvas, see MaskHandles) and "Effekt" (a dialog: border, shadow, reflection, paper edge, glow).
 */
function ImageEditTiles({ block, onUpdate }: { block: ImageBlock; onUpdate: BlockPanelProps["onUpdate"] }) {
  const boxAspect = useImageBoxAspect(block);
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  const editing = useImageEdit((s) => s.blockId === block.id);
  const selected = useImageEdit((s) => s.selectedPoint);
  const edit = useImageEdit((s) => s.edit);
  const select = useImageEdit((s) => s.select);
  const [effectOpen, setEffectOpen] = useState(false);
  const mask = block.mask ?? null;

  // The canvas shows the points only while this block is the selected one.
  useEffect(
    () => () => {
      if (useImageEdit.getState().blockId === block.id) useImageEdit.getState().edit(null);
    },
    [block.id],
  );

  const selectedPoint = mask && selected !== null ? mask.points[selected] : undefined;
  const corners = mask ? mask.points.filter((p) => !p.smooth) : [];
  const radius = selectedPoint ? (selectedPoint.smooth ? 0 : (selectedPoint.radius ?? 0)) : (corners[0]?.radius ?? 0);
  const canRound = selectedPoint ? !selectedPoint.smooth : corners.length > 0;

  return (
    <>
      <div className="weft-image-tiles">
        <button
          type="button"
          className={"weft-image-tile" + (editing ? " is-open" : "") + (mask ? " is-set" : "")}
          aria-pressed={editing}
          onClick={() => edit(editing ? null : block.id)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 2.4" />
            <rect x="9" y="9" width="6" height="6" fill="currentColor" opacity="0.5" />
          </svg>
          <span>{tr("ui.mask")}</span>
        </button>
        <button type="button" className={"weft-image-tile" + (block.effect ? " is-set" : "")} onClick={() => setEffectOpen(true)}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <rect x="5" y="5" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
            <rect x="9" y="9" width="11" height="11" rx="1.5" fill="currentColor" opacity="0.4" />
          </svg>
          <span>{tr("ui.effect")}</span>
        </button>
      </div>

      {editing && (
        <div className="weft-image-mask-panel">
          <span className="weft-image-mask-title">{tr("ui.basic_shape")}</span>
          <div className="weft-image-shapes">
            {IMAGE_MASK_SHAPES.map((shape) => (
              <button
                key={shape.id}
                type="button"
                className={"weft-image-shape" + (mask?.shape === shape.id ? " is-active" : "")}
                onClick={() => {
                  select(null);
                  onUpdate({ mask: defaultMask(shape.id, boxAspect) });
                }}
              >
                {shape.label}
              </button>
            ))}
          </div>
          {mask ? (
            <>
              <p className="weft-hint">
                {tr("ui.on_the_slide_drag_points_drag")}
              </p>
              {canRound && (
                <div className="weft-field">
                  <span>{selectedPoint ? tr("ui.rounding_of_this_corner") : tr("ui.rounding_of_the_corners")}</span>
                  <StepperSlider
                    label={tr("ui.rounding")}
                    value={Math.round(radius)}
                    min={0}
                    max={40}
                    step={1}
                    onChange={(value) => onUpdate({ mask: { ...mask, points: setRadius(mask.points, selected, value) } })}
                  />
                </div>
              )}
              {selectedPoint && (
                <div className="weft-image-point-actions">
                  <button
                    type="button"
                    className="weft-ghost-button"
                    onClick={() => onUpdate({ mask: { ...mask, points: toggleSmooth(mask.points, selected!) } })}
                  >
                    {selectedPoint.smooth ? tr("ui.make_corner") : tr("ui.make_smooth")}
                  </button>
                  <button
                    type="button"
                    className="weft-ghost-button"
                    disabled={mask.points.length <= 3}
                    onClick={() => {
                      onUpdate({ mask: { ...mask, points: removePoint(mask.points, selected!) } });
                      select(null);
                    }}
                  >
                    {tr("ui.remove_point")}
                  </button>
                </div>
              )}
              <button
                type="button"
                className="weft-ghost-button"
                onClick={() => {
                  select(null);
                  onUpdate({ mask: null });
                }}
              >
                {tr("ui.reset_mask")}
              </button>
            </>
          ) : (
            <p className="weft-hint">{tr("ui.choose_a_shape_everything_outside_of")}</p>
          )}
        </div>
      )}

      {effectOpen && (
        <ImageEffectDialog
          block={block}
          src={getObjectUrl(block.assetId ?? "") ?? ""}
          onApply={(effect) => onUpdate({ effect })}
          onClose={() => setEffectOpen(false)}
        />
      )}
    </>
  );
}

/** The code of a logic block (ScriptBlock) and what it can use - and the way to its event in the graph, where it is triggered. */
function ScriptEditor({ block, page, onUpdate }: { block: ScriptBlock; page?: Page; onUpdate: BlockPanelProps["onUpdate"] }) {
  const select = useDocumentStore((s) => s.select);
  return (
    <Collapsible title={tr("ui.script_block")} defaultOpen>
      <p className="weft-hint">{tr("ui.script_hint")}</p>
      <textarea
        className="weft-script-editor-code"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        value={block.code}
        aria-label={tr("ui.script_block")}
        onChange={(e) => onUpdate({ code: e.target.value })}
        onKeyDown={(e) => {
          // Tab writes a tab (two spaces wide) instead of leaving the field.
          if (e.key !== "Tab" || e.shiftKey) return;
          e.preventDefault();
          const field = e.currentTarget;
          const { selectionStart, selectionEnd, value } = field;
          onUpdate({ code: `${value.slice(0, selectionStart)}\t${value.slice(selectionEnd)}` });
          requestAnimationFrame(() => field.setSelectionRange(selectionStart + 1, selectionStart + 1));
        }}
      />
      <p className="weft-hint weft-script-api">{tr("ui.script_api_hint")}</p>
      {page && (
        <button
          type="button"
          className="weft-ghost-button weft-full-width"
          onClick={() => select({ type: "event", pageId: page.id, nodeId: scriptRunNodeId(block.id) })}
        >
          {tr("ui.script_show_event")}
        </button>
      )}
    </Collapsible>
  );
}

function CodeEditor({ block, onUpdate }: { block: CodeBlock; onUpdate: BlockPanelProps["onUpdate"] }) {
  return (
    <Collapsible title={tr("ui.code")}>
      <p className="weft-hint">{tr("ui.type_code_directly_on_the_slide")}</p>
      <label className="weft-field">
        <span>{tr("ui.language")}</span>
        <select value={block.language} onChange={(e) => onUpdate({ language: e.target.value })}>
          <option value={AUTO_LANGUAGE}>{tr("ui.detect_automatically")}</option>
          {CODE_LANGUAGES.map((language) => (
            <option key={language.id} value={language.id}>
              {language.label}
            </option>
          ))}
        </select>
      </label>
      <label className="weft-field">
        <span>{tr("ui.theme")}</span>
        <select value={block.theme} onChange={(e) => onUpdate({ theme: e.target.value })}>
          {CODE_THEMES.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.label}
            </option>
          ))}
        </select>
      </label>
      <label className="weft-field weft-field-inline">
        <input
          type="checkbox"
          checked={!!block.transparentBackground}
          onChange={(e) => onUpdate({ transparentBackground: e.target.checked })}
        />
        <span>{tr("ui.transparent_background")}</span>
      </label>
      <label className="weft-field">
        <span>{tr("ui.font_size")}</span>
        <input
          type="number"
          min={6}
          max={60}
          value={block.fontSize}
          onChange={(e) => {
            const size = Number(e.target.value);
            if (Number.isFinite(size) && size > 0) onUpdate({ fontSize: Math.min(60, Math.max(6, size)) });
          }}
        />
      </label>
    </Collapsible>
  );
}

function VideoEditor({
  block,
  onUpdate,
  onSetVideo,
}: {
  block: VideoBlock;
  onUpdate: BlockPanelProps["onUpdate"];
  onSetVideo: BlockPanelProps["onSetVideo"];
}) {
  const transcode = useTranscodeStatus();
  // (Open by the button below or by a double-click on the video on the slide - see stopPointDialogStore.ts.)
  const stopPointDialogOpen = useStopPointDialog((s) => s.blockId === block.id);
  const openStopPointDialog = useStopPointDialog((s) => s.open);
  const closeStopPointDialog = useStopPointDialog((s) => s.close);
  return (
    <>
      <Collapsible title={tr("ui.content")}>
        <label className="weft-field">
          <span>{tr("ui.video_file")}</span>
          <input
            type="file"
            accept="video/*"
            disabled={transcode.active}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void onSetVideo(file).then((result) => {
                void warnAboutVideoUploads([{ fileName: file.name, ...result }]);
              });
            }}
          />
        </label>
        {transcode.active && (
          <p className="weft-hint">
            „{transcode.fileName}{tr("ui.is_being_converted_to_h_264")}
            {transcode.progress !== null ? ` … ${Math.round(transcode.progress * 100)}%` : " …"}
          </p>
        )}
        <p className="weft-hint">
          {tr("ui.mp4_h_264_aac_is_best")}
        </p>

        <label className="weft-field weft-field-inline">
          <input type="checkbox" checked={block.controls} onChange={(e) => onUpdate({ controls: e.target.checked })} />
          <span>{tr("ui.show_controls")}</span>
        </label>
        <label className="weft-field weft-field-inline">
          <input type="checkbox" checked={block.loop} onChange={(e) => onUpdate({ loop: e.target.checked })} />
          <span>{tr("ui.loop")}</span>
        </label>
        <label className="weft-field weft-field-inline">
          <input
            type="checkbox"
            checked={block.muted}
            disabled={block.autoplay}
            onChange={(e) => onUpdate({ muted: e.target.checked })}
          />
          <span>{tr("ui.muted")}</span>
        </label>
        <label className="weft-field weft-field-inline">
          <input
            type="checkbox"
            checked={block.autoplay}
            onChange={(e) => {
              const autoplay = e.target.checked;
              // Every browser's autoplay policy refuses to autoplay with sound - coupling the two
              // here means that's never a silent trap where autoplay is switched on but quietly
              // never actually plays.
              onUpdate(autoplay ? { autoplay, muted: true } : { autoplay });
            }}
          />
          <span>{tr("ui.play_automatically_muted_only")}</span>
        </label>
      </Collapsible>

      <Collapsible title={tr("ui.time_marks")} defaultOpen={block.stopPoints.length > 0}>
        <p className="weft-hint">
          {tr("ui.time_marks_can_pause_the_video")}
        </p>
        {block.stopPoints.length > 0 && (
          <p className="weft-hint">
            {block.stopPoints.length} {tr("ui.time_mark_2")}{block.stopPoints.length === 1 ? "" : "n"} angelegt.
          </p>
        )}
        <button
          type="button"
          className="weft-ghost-button weft-full-width"
          disabled={!block.assetId}
          onClick={() => openStopPointDialog(block.id)}
        >
          {tr("ui.configure_time_marks")}
        </button>
        {!block.assetId && <p className="weft-hint">{tr("ui.choose_a_video_file_first")}</p>}
      </Collapsible>

      {stopPointDialogOpen && block.assetId && (
        <VideoStopPointDialog block={block} assetId={block.assetId} onUpdate={onUpdate} onClose={closeStopPointDialog} />
      )}
    </>
  );
}


/**
 * Opened from VideoEditor's "Zeitmarken konfigurieren" - the video plays here full-size (native
 * controls, so scrubbing/volume/fullscreen all work for free) instead of the small, inert canvas
 * preview; "Zeitmarke erstellen" reads the <video>'s own currentTime rather than needing a
 * separate scrubber. Existing stop points render as pause-icon markers along a mini-timeline
 * below, positioned by time/duration - clicking one selects it (toggling the same one again
 * deselects), opening a settings section underneath for just that point (currently just the
 * "Video hier stoppen" checkbox, plus the only way to remove one).
 */
function VideoStopPointDialog({
  block,
  assetId,
  onUpdate,
  onClose,
}: {
  block: VideoBlock;
  assetId: string;
  onUpdate: BlockPanelProps["onUpdate"];
  onClose: () => void;
}) {
  const backdropClose = useBackdropClose(onClose);
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  // Where the video is now (seconds): the timeline below it is coloured up to there.
  const [currentTime, setCurrentTime] = useState(0);
  const [selectedStopPointId, setSelectedStopPointId] = useState<string | null>(null);
  // The picture of the video at the place the mouse is over on the timeline (a second, silent video element that is moved there - made
  // when the mouse first comes). `x` is the place in pixels from the left edge of the timeline.
  const [hover, setHover] = useState<{ x: number; time: number; width: number } | null>(null);
  const [previewMade, setPreviewMade] = useState(false);
  const [aspect, setAspect] = useState(16 / 9);
  const previewRef = useRef<HTMLVideoElement>(null);
  const wantedPreviewTime = useRef<number | null>(null);

  // One seek at a time: a new place wanted while the video is still on its way is taken once it has arrived.
  function showPreviewAt(time: number) {
    const preview = previewRef.current;
    if (!preview) return;
    wantedPreviewTime.current = time;
    if (!preview.seeking) {
      wantedPreviewTime.current = null;
      preview.currentTime = time;
    }
  }

  function hoverTimeline(event: ReactMouseEvent<HTMLDivElement>) {
    if (duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(rect.width, Math.max(0, event.clientX - rect.left));
    const time = (x / rect.width) * duration;
    setPreviewMade(true);
    setHover({ x, time, width: rect.width });
    showPreviewAt(time);
  }

  // The controls are the dialog's own (not the video element's: most of what those offer makes no sense here, and the timeline is below).
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
  }, [volume, muted]);

  function togglePlaying() {
    const video = videoRef.current;
    if (!video) return;
    // (play() answers with a promise that is refused when the video can't be played - nothing to do about that here.)
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  }

  // While the video plays, follow it every frame ("timeupdate" alone comes only a few times a second).
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const video = videoRef.current;
      if (video && !video.paused) setCurrentTime(video.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // A click on the timeline goes to that place in the video.
  function seekTo(event: ReactMouseEvent<HTMLDivElement>) {
    const video = videoRef.current;
    if (!video || duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    video.currentTime = fraction * duration;
    setCurrentTime(video.currentTime);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function addStopPointHere() {
    const time = videoRef.current?.currentTime;
    if (time === undefined) return;
    const stopPoints = [...block.stopPoints, { id: createId(), timeSeconds: time, stopsVideo: true }].sort(
      (a, b) => a.timeSeconds - b.timeSeconds,
    );
    onUpdate({ stopPoints });
  }

  function updateStopPoint(id: string, patch: Partial<VideoStopPoint>) {
    onUpdate({ stopPoints: block.stopPoints.map((sp) => (sp.id === id ? { ...sp, ...patch } : sp)) });
  }

  function removeStopPoint(id: string) {
    onUpdate({ stopPoints: block.stopPoints.filter((sp) => sp.id !== id) });
    setSelectedStopPointId(null);
  }

  const selectedStopPoint = block.stopPoints.find((sp) => sp.id === selectedStopPointId);

  return createPortal(
    <div className="weft-modal-backdrop" {...backdropClose}>
      <div className="weft-modal" onClick={(e) => e.stopPropagation()}>
        <div className="weft-modal-header">
          <h3>{tr("ui.time_marks")}</h3>
          <button type="button" className="weft-icon-button" title={tr("ui.close")} onClick={onClose}>
            ×
          </button>
        </div>

        <video
          ref={videoRef}
          src={getObjectUrl(assetId)}
          className="weft-stop-point-video"
          onClick={togglePlaying}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
            if (e.currentTarget.videoWidth > 0 && e.currentTarget.videoHeight > 0) setAspect(e.currentTarget.videoWidth / e.currentTarget.videoHeight);
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onSeeked={(e) => setCurrentTime(e.currentTarget.currentTime)}
        />

        <div className="weft-stop-point-controls">
          <button
            type="button"
            className="weft-stop-point-play"
            title={playing ? tr("ui.pause") : tr("ui.play")}
            aria-label={playing ? tr("ui.pause") : tr("ui.play")}
            onClick={togglePlaying}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5.5v13l11-6.5z" />}
            </svg>
          </button>
        {/* The timeline: the line is coloured up to where the video is now; a click on it goes there. */}
        <div className="weft-stop-point-track" onClick={seekTo} onMouseMove={hoverTimeline} onMouseLeave={() => setHover(null)}>
          <div className="weft-stop-point-progress" style={{ width: `${duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0}%` }} />
          {block.stopPoints.map((sp) => (
            <button
              key={sp.id}
              type="button"
              // The marks the video has reached (they stand on the coloured part of the line) are blue, like the line; the selected one
              // has the ring of a hot event on top of that.
              className={
                "weft-timeline-node-icon weft-stop-point-marker" +
                (sp.timeSeconds <= currentTime + 0.001 ? " is-blue" : "") +
                (sp.id === selectedStopPointId ? " is-selected is-hot" : "")
              }
              style={{ left: `${duration > 0 ? (sp.timeSeconds / duration) * 100 : 0}%` }}
              title={formatTimeMMSS(sp.timeSeconds)}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedStopPointId((current) => (current === sp.id ? null : sp.id));
                // The video goes to the time mark, as it does for a click on the line.
                const video = videoRef.current;
                if (video) {
                  video.currentTime = sp.timeSeconds;
                  setCurrentTime(video.currentTime);
                }
              }}
              dangerouslySetInnerHTML={{ __html: stopPointIconSvg(sp.stopsVideo) }}
            />
          ))}
          {/* What the video shows at the place the mouse is over - nothing to operate, only for looking for a scene. */}
          {previewMade && (
            <div
              className="weft-stop-point-preview"
              // Over the mouse, but not out of the dialog (the timeline has 13px of margin on each side).
              style={{
                left: hover ? Math.max(PREVIEW_WIDTH / 2 - 13, Math.min(hover.x, hover.width - PREVIEW_WIDTH / 2 + 13)) : 0,
                visibility: hover ? "visible" : "hidden",
              }}
            >
              <video
                ref={previewRef}
                src={getObjectUrl(assetId)}
                muted
                playsInline
                preload="auto"
                tabIndex={-1}
                style={{ width: PREVIEW_WIDTH, aspectRatio: String(aspect) }}
                onSeeked={() => {
                  const wanted = wantedPreviewTime.current;
                  if (wanted !== null && previewRef.current) {
                    wantedPreviewTime.current = null;
                    previewRef.current.currentTime = wanted;
                  }
                }}
              />
              <span className="weft-stop-point-preview-time">{hover ? formatTimeMMSS(hover.time) : ""}</span>
            </div>
          )}
        </div>
          <div className="weft-stop-point-volume">
            <button
              type="button"
              className="weft-stop-point-mute"
              title={muted || volume === 0 ? tr("ui.sound_on") : tr("ui.sound_off")}
              aria-label={muted || volume === 0 ? tr("ui.sound_on") : tr("ui.sound_off")}
              onClick={() => {
                if (volume === 0) setVolume(1);
                setMuted((m) => (volume === 0 ? false : !m));
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" />
                {muted || volume === 0 ? <path d="m16 9.5 5 5m0-5-5 5" /> : <path d="M16 9a4 4 0 0 1 0 6m2.5-8.5a7.5 7.5 0 0 1 0 11" />}
              </svg>
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              aria-label={tr("ui.volume")}
              title={tr("ui.volume")}
              onChange={(e) => {
                const next = Number(e.target.value);
                setVolume(next);
                setMuted(next === 0);
              }}
            />
          </div>
        </div>

        <div className="weft-format-row weft-stop-point-actions">
          <button type="button" className="weft-primary-button" onClick={addStopPointHere}>
            {tr("ui.create_time_mark")}
          </button>
        </div>
        {selectedStopPoint && (
          <div className="weft-stop-point-settings">
            <p className="weft-stop-point-settings-title">{tr("ui.time_mark_at")} {formatTimeMMSS(selectedStopPoint.timeSeconds)}</p>
            <label className="weft-field weft-field-inline">
              <input
                type="checkbox"
                checked={selectedStopPoint.stopsVideo}
                onChange={(e) => updateStopPoint(selectedStopPoint.id, { stopsVideo: e.target.checked })}
              />
              <span>{tr("ui.stop_the_video_here")}</span>
            </label>
            {!selectedStopPoint.stopsVideo && <p className="weft-hint">{tr("ui.the_video_just_goes_on_at")}</p>}
            <button type="button" className="weft-ghost-button" onClick={() => removeStopPoint(selectedStopPoint.id)}>
              {tr("ui.remove_time_mark")}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Width of the picture that follows the mouse over the timeline of the time marks dialog. */
const PREVIEW_WIDTH = 168;

const DEFAULT_VIEWPORT_WIDTH = 768;

const VIEWPORT_WIDTH_PRESETS: { label: string; width: number }[] = [
  { get label() { return tr("ui.mobile"); }, width: 375 },
  { get label() { return tr("ui.tablet"); }, width: DEFAULT_VIEWPORT_WIDTH },
  { get label() { return tr("ui.desktop"); }, width: 1280 },
];

// The embedded page always sees a fixed virtual viewport width (see IframeFrame in
// BlockView.tsx) rather than whatever pixel size the block happens to render at - there's no
// "off" state for this any more, since a predictable, chosen width is strictly better than a
// size that silently drifts with how large the module itself is displayed.
function IframeEditor({ block, onUpdate }: { block: IframeBlock; onUpdate: BlockPanelProps["onUpdate"] }) {
  const forcedViewportWidth = block.forcedViewportWidth ?? DEFAULT_VIEWPORT_WIDTH;
  return (
    <Collapsible title={tr("ui.content")}>
      <label className="weft-field">
        <span>{tr("ui.url_e_g_a_youtube_embed")}</span>
        <input value={block.url} onChange={(e) => onUpdate({ url: e.target.value })} />
      </label>
      <label className="weft-field">
        <span>{tr("ui.virtual_width_px")}</span>
        <input
          type="number"
          min={1}
          value={forcedViewportWidth}
          onChange={(e) => onUpdate({ forcedViewportWidth: Math.max(1, Number(e.target.value)) })}
        />
      </label>
      <div className="weft-format-row">
        {VIEWPORT_WIDTH_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="weft-ghost-button"
            onClick={() => onUpdate({ forcedViewportWidth: preset.width })}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <span className="weft-subgroup-label">{tr("ui.sandbox_permissions")}</span>
      {SANDBOX_FLAGS.map((flag) => (
        <label key={flag} className="weft-field weft-field-inline">
          <input
            type="checkbox"
            checked={block.sandbox.includes(flag)}
            onChange={(e) => {
              const sandbox = e.target.checked ? [...block.sandbox, flag] : block.sandbox.filter((f) => f !== flag);
              onUpdate({ sandbox });
            }}
          />
          <span>{flag}</span>
        </label>
      ))}
      <label className="weft-field">
        <span>{tr("ui.allow_permissions_policy_e_g_autoplay")}</span>
        <input value={block.allow ?? ""} onChange={(e) => onUpdate({ allow: e.target.value })} />
      </label>

      <label className="weft-field weft-field-inline">
        <input type="checkbox" checked={block.qrCode} onChange={(e) => onUpdate({ qrCode: e.target.checked })} />
        <span>{tr("ui.show_a_qr_code_first_reveal")}</span>
      </label>
      {block.qrCode && (
        <label className="weft-field">
          <span>{tr("ui.alternative_address_for_the_presentation_optional")}</span>
          <input
            value={block.presentationUrl ?? ""}
            placeholder={block.url}
            onChange={(e) => onUpdate({ presentationUrl: e.target.value || undefined })}
          />
          <span className="weft-hint">
            {tr("ui.the_qr_code_still_links_to")}
          </span>
        </label>
      )}
    </Collapsible>
  );
}

/**
 * The settings of a gap text (see ClozeBlock): the blanks that were recognised in its text - so that an author sees at once whether
 * a [[marker]] is one - how an answer is judged (capital letters, typing slips) and what a right answer does: for every blank, for
 * one particular answer, for everything being right, for something being wrong.
 */
function ClozeEditor({ block, page, onUpdate }: { block: ClozeBlock; page?: Page; onUpdate: BlockPanelProps["onUpdate"] }) {
  const variables = useDocumentStore((s) => s.doc.content.variables);
  const { lang, defaultLang } = useEditingLanguage();
  const blanks = clozeBlanks(textHtml(block, lang, defaultLang));
  const goesOn = (outcome: "richtig" | "falsch") => !!page?.timeline.ends[quizEndNodeId(block.id, outcome)];
  const keys = Array.from(new Set(blanks.map((blank) => blank.key)));

  return (
    <>
      <Collapsible title={tr("ui.gaps")}>
        <LanguageSelect block={block} />
        <p className="weft-hint">
          {tr("ui.type_the_text_directly_on_the")}
        </p>
        {blanks.length === 0 ? (
          <p className="weft-hint">{tr("ui.no_gap_recognised_yet")}</p>
        ) : (
          <ol className="weft-cloze-answers">
            {blanks.map((blank, index) => (
              <li key={index}>
                {blank.answers.map((answer, n) => (
                  <span key={n} className="weft-cloze-answer">
                    {answer}
                  </span>
                ))}
              </li>
            ))}
          </ol>
        )}
      </Collapsible>

      <Collapsible title={tr("ui.scoring")} defaultOpen={false}>
        <label className="weft-field weft-field-inline">
          <input type="checkbox" checked={!!block.caseSensitive} onChange={(e) => onUpdate({ caseSensitive: e.target.checked })} />
          <span>{tr("ui.case_sensitive")}</span>
        </label>
        <label className="weft-field">
          <span>{tr("ui.tolerance_for_typos")}</span>
          <select value={block.tolerance ?? 0} onChange={(e) => onUpdate({ tolerance: Number(e.target.value) })}>
            <option value={0}>{tr("ui.none_exactly_as_written")}</option>
            <option value={1}>{tr("ui.1_wrong_character")}</option>
            <option value={2}>{tr("ui.2_wrong_characters")}</option>
          </select>
        </label>
        <p className="weft-hint">{tr("ui.for_very_short_answers_the_exact")}</p>
      </Collapsible>

      <Collapsible title={tr("ui.for_every_correct_answer")} defaultOpen={false}>
        <EffectListEditor effects={block.onEachCorrect ?? []} variables={variables} onChange={(onEachCorrect) => onUpdate({ onEachCorrect })} />
      </Collapsible>

      {keys.length > 0 && (
        <Collapsible title={tr("ui.depending_on_the_answer")} defaultOpen={false}>
          <p className="weft-hint">{tr("ui.in_addition_to_what_happens_for")}</p>
          {keys.map((key) => (
            <Collapsible key={key} title={key} defaultOpen={false}>
              <EffectListEditor
                effects={block.answerEffects?.[key] ?? []}
                variables={variables}
                onChange={(effects) => {
                  const answerEffects = { ...block.answerEffects, [key]: effects };
                  if (effects.length === 0) delete answerEffects[key];
                  onUpdate({ answerEffects });
                }}
              />
            </Collapsible>
          ))}
        </Collapsible>
      )}

      <Collapsible title={tr("ui.when_everything_is_correct")} defaultOpen={false}>
        <EffectListEditor effects={block.onCorrect} variables={variables} onChange={(onCorrect) => onUpdate({ onCorrect })} />
        <label className="weft-field weft-field-inline">
          <input
            type="checkbox"
            checked={goesOn("richtig")}
            disabled={!page}
            onChange={(e) => page && setQuizAdvance(page.id, block.id, "richtig", e.target.checked)}
          />
          <span>{tr("ui.continue_to_the_next_slide")}</span>
        </label>
      </Collapsible>
      <Collapsible title={tr("ui.when_not_everything_is_correct")} defaultOpen={false}>
        <EffectListEditor effects={block.onIncorrect} variables={variables} onChange={(onIncorrect) => onUpdate({ onIncorrect })} />
        <label className="weft-field weft-field-inline">
          <input
            type="checkbox"
            checked={goesOn("falsch")}
            disabled={!page}
            onChange={(e) => page && setQuizAdvance(page.id, block.id, "falsch", e.target.checked)}
          />
          <span>{tr("ui.continue_to_the_next_slide")}</span>
        </label>
      </Collapsible>
    </>
  );
}

const LIST_MARKER_LABELS: Record<ListMarkerKind, string> = {
  get dot() { return tr("ui.dot"); },
  get dash() { return tr("ui.dash"); },
  get number() { return tr("ui.number"); },
  get image() { return tr("ui.own_image"); },
};

/** The settings of a list: its items (add, order, remove - the text itself is edited on the slide), the mark in front of them, the
 * space between them, and - on a page - whether the Aufbau is the list's as a whole or each item's. */
function ListEditor({
  block,
  page,
  onUpdate,
  onSetImage,
}: {
  block: ListBlock;
  page?: Page;
  onUpdate: BlockPanelProps["onUpdate"];
  onSetImage: BlockPanelProps["onSetImage"];
}) {
  const { lang, defaultLang } = useEditingLanguage();
  const perItem = isListPerItem(block);
  function move(index: number, by: number) {
    const target = index + by;
    if (target < 0 || target >= block.items.length) return;
    const items = [...block.items];
    [items[index], items[target]] = [items[target], items[index]];
    onUpdate({ items });
  }
  return (
    <Collapsible title={tr("ui.list")}>
      <LanguageSelect block={block} />
      <p className="weft-hint">{tr("ui.type_the_items_directly_on_the")}</p>
      <ul className="weft-list-items">
        {block.items.map((item, index) => (
          <li key={item.id} className="weft-list-items-row">
            <span className="weft-list-items-label">{stripHtml(listItemHtml(block, item.id, lang, defaultLang)) || tr("ui.empty")}</span>
            <button type="button" className="weft-ghost-button" title={tr("ui.up")} disabled={index === 0} onClick={() => move(index, -1)}>
              ↑
            </button>
            <button
              type="button"
              className="weft-ghost-button"
              title={tr("ui.down")}
              disabled={index === block.items.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="weft-event-trigger-remove"
              aria-label={tr("ui.remove_list_item")}
              disabled={block.items.length < 2}
              onClick={() => onUpdate({ items: block.items.filter((other) => other.id !== item.id) })}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="weft-ghost-button weft-full-width"
        onClick={() => onUpdate({ items: [...block.items, { id: createId(), html: tr("ui.new_item") }] })}
      >
        {tr("ui.list_item_2")}
      </button>

      <label className="weft-field">
        <span>{tr("ui.bullet_style")}</span>
        <select value={block.marker} onChange={(e) => onUpdate({ marker: e.target.value as ListMarkerKind })}>
          {(Object.keys(LIST_MARKER_LABELS) as ListMarkerKind[]).map((marker) => (
            <option key={marker} value={marker}>
              {LIST_MARKER_LABELS[marker]}
            </option>
          ))}
        </select>
      </label>
      {block.marker === "image" && (
        <label className="weft-field">
          <span>{tr("ui.image_file_for_the_markers")}</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onSetImage(file);
            }}
          />
        </label>
      )}
      {block.marker === "image" && (
        <div className="weft-field">
          <span>{tr("ui.size_of_the_image")}</span>
          <StepperSlider
            label={tr("ui.size_of_the_image")}
            value={block.markerSize ?? 1.2}
            min={0.5}
            max={4}
            step={0.1}
            onChange={(markerSize) => onUpdate({ markerSize: Math.round(markerSize * 10) / 10 })}
          />
        </div>
      )}
      <div className="weft-field">
        <span>{tr("ui.space_between_the_items")}</span>
        <StepperSlider label={tr("ui.spacing")} value={block.spacing} min={0} max={6} step={0.2} onChange={(spacing) => onUpdate({ spacing: Math.round(spacing * 10) / 10 })} />
      </div>

      {page && (
        <>
          <label className="weft-field">
            <span>{tr("ui.entrance")}</span>
            <select value={block.itemEntrance ? "items" : "list"} onChange={(e) => onUpdate({ itemEntrance: e.target.value === "items" })}>
              <option value="list">{tr("ui.the_whole_list_at_once")}</option>
              <option value="items">{tr("ui.each_list_item_on_its_own")}</option>
            </select>
          </label>
          {block.itemEntrance && block.entranceEffect.type === "off" && (
            <p className="weft-hint">{tr("ui.choose_an_animation_under_entrance_so")}</p>
          )}
          {perItem && (
            <p className="weft-hint">
              {tr("ui.each_item_is_an_event_of")}
            </p>
          )}
        </>
      )}
    </Collapsible>
  );
}

/** What the "Aktion" menu of a button says for the click's first target in the graph (see ButtonEditor). */
const NO_TARGET = "event:";

function ButtonEditor({ block, page, onUpdate }: { block: ButtonBlock; page?: Page; onUpdate: BlockPanelProps["onUpdate"] }) {
  const clickId = buttonClickNodeId(block.id);
  const clickNode = page ? findNode(page, clickId) : undefined;
  const outgoing = page ? outgoingTriggers(page.timeline, clickId) : [];
  // What the click can make happen: the events of the page that can be triggered, and every "Nächste Folie".
  const targets = page
    ? [
        ...listTriggerableNodes(page),
        ...endNodeIds(page).map((id) => ({ id, label: page.timeline.titles?.[id]?.trim() || nodeLabel({ id, kind: "end" }) })),
      ].filter((target) => target.id !== clickId)
    : [];
  // The pages a click can lead to, named by their place in the sidebar ("4.a.1") - the block stores the id of the page.
  const content = useDocumentStore((s) => s.doc.content);
  const pages = pageChoices(content, false);
  const targetKnown = !!block.targetPageId && pages.some((p) => p.pageId === block.targetPageId);
  const value =
    block.action === "event"
      ? outgoing[0]
        ? `event:${outgoing[0].to}`
        : NO_TARGET
      : block.action === "goto"
        ? `goto:${block.targetPageId ?? ""}`
        : block.action;
  const variables = useDocumentStore((s) => s.doc.content.variables);
  const look = buttonAppearanceOf(block);
  const setLook = (patch: Partial<ButtonAppearance>) => onUpdate({ appearance: { ...look, ...patch } });

  function chooseAction(chosen: string) {
    if (chosen === "advance" || chosen === "prev") {
      onUpdate({ action: chosen });
      return;
    }
    if (chosen.startsWith("goto:")) {
      onUpdate({ action: "goto", targetPageId: chosen.slice("goto:".length) || undefined });
      return;
    }
    if (!page) {
      onUpdate({ action: "event" });
      return;
    }
    // Turning a button into one that triggers an event gives it its default trigger (to "Nächste Folie", see updateBlock); the
    // chosen event then takes that one's place.
    if (block.action !== "event") onUpdate({ action: "event" });
    const target = chosen.slice("event:".length);
    const current = outgoingTriggers(useDocumentStore.getState().doc.content.pages[page.id].timeline, clickId);
    if (!target) {
      for (const trigger of current) removeTrigger(page.id, trigger.id);
    } else if (current.length > 0) {
      updateTrigger(page.id, current[0].id, { to: target });
    } else {
      addTrigger(page.id, clickId, target, 0, false);
    }
  }

  return (
    <>
      <Collapsible title={tr("ui.action")}>
        <label className="weft-field">
          <span>{tr("ui.on_click")}</span>
          <select value={value} onChange={(e) => chooseAction(e.target.value)}>
            <option value="advance">{tr("ui.next")}</option>
            <option value="prev">{tr("ui.previous_slide")}</option>
            <optgroup label={tr("ui.jump_to_a_slide")}>
              {block.action === "goto" && !block.targetPageId && <option value="goto:">{tr("ui.choose_slide")}</option>}
              {block.action === "goto" && block.targetPageId && !targetKnown && (
                <option value={`goto:${block.targetPageId}`}>{tr("ui.deleted_slide")}</option>
              )}
              {pages.map((choice) => (
                <option key={choice.pageId} value={`goto:${choice.pageId}`}>
                  {choice.label}
                </option>
              ))}
            </optgroup>
            {page ? (
              <optgroup label={tr("ui.trigger_an_event")}>
                <option value={NO_TARGET}>{tr("ui.nothing_only_button_clicked")}</option>
                {targets.map((target) => (
                  <option key={target.id} value={`event:${target.id}`}>
                    {target.label}
                  </option>
                ))}
              </optgroup>
            ) : (
              <option value="event">{tr("ui.trigger_an_event_in_the_graph")}</option>
            )}
          </select>
        </label>
        {block.action === "advance" && (
          <p className="weft-hint">
            {tr("ui.first_shows_the_entrances_of_this")}
          </p>
        )}
        {block.action === "prev" && (
          <p className="weft-hint">
            {tr("ui.automatically_disabled_on_the_first_slide")}
          </p>
        )}
        {block.action === "goto" && (
          <>
            {targetKnown && block.targetPageId ? (
              <div className="weft-jump-miniature">
                <PageMiniature pageId={block.targetPageId} />
              </div>
            ) : (
              <p className="weft-hint">{tr("ui.this_slide_no_longer_exists_the")}</p>
            )}
            <p className="weft-hint">
              {tr("ui.jumps_to_this_slide_after_that")}
            </p>
          </>
        )}
        {block.action === "event" && !page && (
          <p className="weft-hint">
            {tr("ui.the_click_is_an_event_in")}
          </p>
        )}
      </Collapsible>
      {block.action === "event" && page && clickNode && <OutgoingTriggersSection page={page} node={clickNode} />}
      <Collapsible title={tr("ui.change_variables")} defaultOpen={(block.onClick ?? []).length > 0}>
        <p className="weft-hint">{tr("ui.on_every_click_in_addition_to")}</p>
        <EffectListEditor effects={block.onClick ?? []} variables={variables} onChange={(onClick) => onUpdate({ onClick })} />
        {variables.length === 0 && <p className="weft-hint">{tr("ui.there_are_no_variables_yet_create")}</p>}
      </Collapsible>
      <Collapsible title={tr("ui.appearance")}>
        <div className="weft-field">
          <span>{tr("ui.background")}</span>
          <div className="weft-button-look-row">
            <label className="weft-field weft-field-inline">
              <input type="checkbox" checked={look.background === null} onChange={(e) => setLook({ background: e.target.checked ? null : "#18181b" })} />
              <span>{tr("ui.no_background")}</span>
            </label>
            {look.background !== null && (
              <ColorField value={look.background} ariaLabel={tr("ui.background_colour")} onChange={(color) => setLook({ background: color })} />
            )}
          </div>
        </div>
        <div className="weft-field">
          <span>{tr("ui.border_thickness_of_the_slide_width")}</span>
          <StepperSlider
            label={tr("ui.border_thickness")}
            value={Math.round(look.borderWidth * 100) / 100}
            min={0}
            max={2}
            step={0.05}
            onChange={(value) => setLook({ borderWidth: Math.round(value * 100) / 100 })}
          />
        </div>
        {look.borderWidth > 0 && (
          <label className="weft-field">
            <span>{tr("ui.border_colour")}</span>
            <ColorField value={look.borderColor} ariaLabel={tr("ui.border_colour")} onChange={(color) => setLook({ borderColor: color })} />
          </label>
        )}
        <div className="weft-field">
          <span>{tr("ui.rounding_of_the_corners_of_the")}</span>
          <StepperSlider
            label={tr("ui.rounding_of_the_corners")}
            value={Math.round(look.radius * 100) / 100}
            min={0}
            max={5}
            step={0.1}
            onChange={(value) => setLook({ radius: Math.round(value * 100) / 100 })}
          />
        </div>
        <button type="button" className="weft-ghost-button" onClick={() => onUpdate({ appearance: undefined })}>
          {tr("ui.reset_appearance")}
        </button>
      </Collapsible>
    </>
  );
}

/**
 * The files of a files block and their password. The password is never stored: it is typed here, used to
 * encrypt (see core/document/filesActions.ts) and, while this panel stays open, remembered in `unlocked` so
 * that adding more files or changing the password doesn't ask again.
 */
function FilesEditor({ block, container, onUpdate }: { block: FilesBlock; container: BlockContainerRef; onUpdate: BlockPanelProps["onUpdate"] }) {
  const protectedBlock = block.protection !== null;
  const [unlocked, setUnlocked] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canEdit = !protectedBlock || unlocked !== null;

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function addFiles() {
    const files = await pickFilesFromDisk();
    if (files.length > 0) await run(() => addFilesToBlock(container, block.id, files, unlocked));
  }

  return (
    <Collapsible title={tr("ui.files")}>
      <label className="weft-field">
        <span>{tr("ui.heading")}</span>
        <input value={block.title} placeholder={tr("ui.files")} onChange={(e) => onUpdate({ title: e.target.value })} />
      </label>
      {block.files.length > 0 && (
        <ul className="weft-files-editor-list">
          {block.files.map((file) => (
            <li key={file.id}>
              <span className="weft-files-editor-name" title={file.name}>
                {file.name}
              </span>
              <span className="weft-hint">{formatFileSize(file.size)}</span>
              <button type="button" className="weft-icon-button" title={tr("ui.remove")} onClick={() => removeFileFromBlock(container, block.id, file.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="weft-ghost-button weft-full-width" disabled={busy || !canEdit} onClick={() => void addFiles()}>
        {tr("ui.add_files")}
      </button>
      {!canEdit && <p className="weft-hint">{tr("ui.to_add_files_enter_the_password")}</p>}

      <div className="weft-divider" />
      {!protectedBlock && (
        <>
          <label className="weft-field">
            <span>{tr("ui.password_protection_optional")}</span>
            <input type="password" autoComplete="off" value={password} placeholder={tr("ui.password")} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button
            type="button"
            className="weft-ghost-button weft-full-width"
            disabled={busy || password === ""}
            onClick={() =>
              void run(async () => {
                await setFilesPassword(container, block.id, null, password);
                setUnlocked(password);
                setPassword("");
              })
            }
          >
            {tr("ui.protect_with_password")}
          </button>
          <p className="weft-hint">
            {tr("ui.the_files_are_then_stored_encrypted")}
          </p>
        </>
      )}
      {protectedBlock && unlocked === null && (
        <>
          <p className="weft-hint">{tr("ui.protected_with_a_password_to_change")}</p>
          <label className="weft-field">
            <span>{tr("ui.password")}</span>
            <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button
            type="button"
            className="weft-ghost-button weft-full-width"
            disabled={busy || password === ""}
            onClick={() =>
              void run(async () => {
                if (!block.protection || !(await filesCheckPassword(block.protection, password))) throw new Error(tr("ui.wrong_password"));
                setUnlocked(password);
                setPassword("");
              })
            }
          >
            {tr("ui.unlock")}
          </button>
        </>
      )}
      {protectedBlock && unlocked !== null && (
        <>
          <p className="weft-hint">{tr("ui.protected_with_a_password_unlocked_as")}</p>
          <label className="weft-field">
            <span>{tr("ui.new_password")}</span>
            <input type="password" autoComplete="off" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
          <button
            type="button"
            className="weft-ghost-button weft-full-width"
            disabled={busy || newPassword === ""}
            onClick={() =>
              void run(async () => {
                await setFilesPassword(container, block.id, unlocked, newPassword);
                setUnlocked(newPassword);
                setNewPassword("");
              })
            }
          >
            {tr("ui.change_password")}
          </button>
          <button
            type="button"
            className="weft-ghost-button weft-full-width"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (!(await confirmDestructive(tr("ui.the_password_protection_is_removed_the"), tr("ui.remove_password_protection")))) return;
                await setFilesPassword(container, block.id, unlocked, null);
                setUnlocked(null);
              })
            }
          >
            {tr("ui.remove_password_protection")}
          </button>
        </>
      )}
      {busy && <p className="weft-hint">{tr("ui.one_moment")}</p>}
      {error && <p className="weft-placeholder-warning">{error}</p>}
    </Collapsible>
  );
}

const ARROW_STYLE_LABELS: Record<ArrowStyle, string> = {
  get plain() { return tr("ui.plain"); },
  get sketch() { return tr("ui.hand_drawn"); },
  get ornate() { return tr("ui.ornate_art_nouveau"); },
};

function ArrowEditor({ block, onUpdate }: { block: ArrowBlock; onUpdate: BlockPanelProps["onUpdate"] }) {
  return (
    <Collapsible title={tr("ui.arrow")}>
      <label className="weft-field">
        <span>{tr("ui.style")}</span>
        <select value={block.arrowStyle} onChange={(e) => onUpdate({ arrowStyle: e.target.value as ArrowStyle })}>
          {(Object.keys(ARROW_STYLE_LABELS) as ArrowStyle[]).map((style) => (
            <option key={style} value={style}>
              {ARROW_STYLE_LABELS[style]}
            </option>
          ))}
        </select>
      </label>
      <label className="weft-field">
        <span>Dicke ({block.width.toFixed(1).replace(".", ",")})</span>
        <input type="range" min={0.2} max={4} step={0.1} value={block.width} onChange={(e) => onUpdate({ width: Number(e.target.value) })} />
      </label>
      <label className="weft-field weft-field-inline">
        <span>{tr("ui.colour")}</span>
        <ColorField value={block.color} onChange={(color) => onUpdate({ color })} />
      </label>
      <label className="weft-field weft-field-inline">
        <input type="checkbox" checked={block.startHead} onChange={(e) => onUpdate({ startHead: e.target.checked })} />
        <span>{tr("ui.arrowhead_at_the_start")}</span>
      </label>
      <label className="weft-field weft-field-inline">
        <input type="checkbox" checked={block.endHead} onChange={(e) => onUpdate({ endHead: e.target.checked })} />
        <span>{tr("ui.arrowhead_at_the_end")}</span>
      </label>
      <p className="weft-hint">
        {tr("ui.the_line_runs_as_a_curve")}
      </p>
    </Collapsible>
  );
}

const SHAPE_KIND_LABELS: Record<ShapeKind, string> = {
  get rectangle() { return tr("ui.rectangle"); },
  get ellipse() { return tr("ui.ellipse"); },
  polygon: "n-Eck",
  get star() { return tr("ui.star"); },
};

function ShapeEditor({ block, onUpdate }: { block: ShapeBlock; onUpdate: BlockPanelProps["onUpdate"] }) {
  return (
    <>
      <Collapsible title={tr("ui.shape")}>
        <label className="weft-field">
          <span>{tr("ui.kind")}</span>
          <select value={block.shapeKind} onChange={(e) => onUpdate({ shapeKind: e.target.value as ShapeKind })}>
            {(Object.keys(SHAPE_KIND_LABELS) as ShapeKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {SHAPE_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        {block.shapeKind === "rectangle" && (
          <ShapeCornerRadiiEditor cornerRadii={block.cornerRadii} onChange={(cornerRadii) => onUpdate({ cornerRadii })} />
        )}
        {block.shapeKind === "polygon" && (
          <label className="weft-field">
            <span>Seiten ({block.sides})</span>
            <input type="range" min={3} max={20} value={block.sides} onChange={(e) => onUpdate({ sides: Number(e.target.value) })} />
          </label>
        )}
        {block.shapeKind === "star" && (
          <>
            <label className="weft-field">
              <span>Zacken ({block.starPoints})</span>
              <input
                type="range"
                min={3}
                max={20}
                value={block.starPoints}
                onChange={(e) => onUpdate({ starPoints: Number(e.target.value) })}
              />
            </label>
            <label className="weft-field">
              <span>Innenradius ({Math.round(block.starInnerRadius)}%)</span>
              <input
                type="range"
                min={0}
                max={100}
                value={block.starInnerRadius}
                onChange={(e) => onUpdate({ starInnerRadius: Number(e.target.value) })}
              />
            </label>
          </>
        )}
      </Collapsible>

      <Collapsible title={tr("ui.fill")}>
        <ShapeFillEditor fill={block.fill} onChange={(fill) => onUpdate({ fill })} />
      </Collapsible>

      <Collapsible title={tr("ui.outline")} defaultOpen={false}>
        <ShapeStrokeEditor stroke={block.stroke} onChange={(stroke) => onUpdate({ stroke })} />
      </Collapsible>

      <Collapsible title={tr("ui.shadow")} defaultOpen={false}>
        <ShapeShadowEditor shadow={block.shadow} onChange={(shadow) => onUpdate({ shadow })} />
      </Collapsible>
    </>
  );
}

// Reading order (top-left, top-right, bottom-left, bottom-right): rendered row by row in a two-column grid (.weft-corner-grid), so the
// four sliders stand where their corners are in the rectangle.
const CORNER_FIELDS: { key: keyof ShapeCornerRadii; label: string }[] = [
  { key: "topLeft", get label() { return tr("ui.top_left"); } },
  { key: "topRight", get label() { return tr("ui.top_right"); } },
  { key: "bottomLeft", get label() { return tr("ui.bottom_left"); } },
  { key: "bottomRight", get label() { return tr("ui.bottom_right"); } },
];

/** One shared "Eckenradius" slider that sets all four corners together (the common case, and
 * what PowerPoint/Keynote's own single handle does) by default - "Ecken einzeln einstellen"
 * reveals four independent sliders instead, one per corner (see ShapeCornerRadii in
 * core/types.ts). Starts already expanded if the four corners aren't all equal (e.g. a document
 * someone else already gave individual corners) so the mismatch isn't hidden; otherwise this is
 * pure UI state, never itself stored on the block - there's nothing to persist beyond the four
 * numbers themselves. */
function ShapeCornerRadiiEditor({
  cornerRadii,
  onChange,
}: {
  cornerRadii: ShapeCornerRadii;
  onChange: (cornerRadii: ShapeCornerRadii) => void;
}) {
  const allEqual =
    cornerRadii.topLeft === cornerRadii.topRight &&
    cornerRadii.topRight === cornerRadii.bottomRight &&
    cornerRadii.bottomRight === cornerRadii.bottomLeft;
  const [individual, setIndividual] = useState(!allEqual);

  return (
    <>
      <label className="weft-field weft-field-inline">
        <input type="checkbox" checked={individual} onChange={(e) => setIndividual(e.target.checked)} />
        <span>{tr("ui.set_corners_individually")}</span>
      </label>
      {individual ? (
        // Two by two, like the corners of the rectangle: top left | top right, then bottom left | bottom right.
        <div className="weft-corner-grid">
          {CORNER_FIELDS.map(({ key, label }) => (
            <label key={key} className="weft-field">
              <span>
                {label} ({Math.round(cornerRadii[key])})
              </span>
              <input
                type="range"
                min={0}
                max={50}
                value={cornerRadii[key]}
                onChange={(e) => onChange({ ...cornerRadii, [key]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
      ) : (
        <label className="weft-field">
          <span>Eckenradius ({Math.round(cornerRadii.topLeft)})</span>
          <input
            type="range"
            min={0}
            max={50}
            value={cornerRadii.topLeft}
            onChange={(e) => {
              const r = Number(e.target.value);
              onChange({ topLeft: r, topRight: r, bottomRight: r, bottomLeft: r });
            }}
          />
        </label>
      )}
    </>
  );
}

const SHAPE_FILL_TYPE_LABELS: Record<ShapeFill["type"], string> = {
  get none() { return tr("ui.none_2"); },
  get solid() { return tr("ui.colour"); },
  get gradient() { return tr("ui.gradient_2"); },
};

function ShapeFillEditor({ fill, onChange }: { fill: ShapeFill; onChange: (fill: ShapeFill) => void }) {
  return (
    <>
      <div className="weft-format-row">
        {(Object.keys(SHAPE_FILL_TYPE_LABELS) as ShapeFill["type"][]).map((type) => (
          <label key={type} className="weft-field weft-field-inline">
            <input type="radio" name="weft-shape-fill-type" checked={fill.type === type} onChange={() => onChange({ ...fill, type })} />
            <span>{SHAPE_FILL_TYPE_LABELS[type]}</span>
          </label>
        ))}
      </div>
      {fill.type === "solid" && (
        <div className="weft-format-row">
          <label className="weft-field">
            <span>{tr("ui.colour")}</span>
            <ColorField value={fill.color} onChange={(color) => onChange({ ...fill, color })} />
          </label>
          <label className="weft-field">
            <span>Deckkraft ({Math.round(fill.opacity * 100)}%)</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={fill.opacity}
              onChange={(e) => onChange({ ...fill, opacity: Number(e.target.value) })}
            />
          </label>
        </div>
      )}
      {fill.type === "gradient" && <ShapeGradientEditor gradient={fill.gradient} onChange={(gradient) => onChange({ ...fill, gradient })} />}
    </>
  );
}

function ShapeGradientEditor({ gradient, onChange }: { gradient: ShapeGradient; onChange: (gradient: ShapeGradient) => void }) {
  function updateStop(id: string, patch: Partial<ShapeGradientStop>) {
    onChange({ ...gradient, stops: gradient.stops.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }

  function addStop() {
    const last = gradient.stops[gradient.stops.length - 1];
    onChange({
      ...gradient,
      stops: [...gradient.stops, { id: createId(), offset: last ? Math.min(100, last.offset + 20) : 100, color: "#ffffff", opacity: 1 }],
    });
  }

  function removeStop(id: string) {
    // A gradient needs at least two stops to be a gradient at all - the last two can't be removed
    // down to one, which would leave ShapeSvg.tsx rendering a solid-looking fill under a "Verlauf"
    // label that no longer has anything to interpolate between.
    if (gradient.stops.length <= 2) return;
    onChange({ ...gradient, stops: gradient.stops.filter((s) => s.id !== id) });
  }

  return (
    <>
      <div className="weft-format-row">
        <label className="weft-field weft-field-inline">
          <input
            type="radio"
            name="weft-shape-gradient-kind"
            checked={gradient.kind === "linear"}
            onChange={() => onChange({ ...gradient, kind: "linear" })}
          />
          <span>{tr("ui.linear")}</span>
        </label>
        <label className="weft-field weft-field-inline">
          <input
            type="radio"
            name="weft-shape-gradient-kind"
            checked={gradient.kind === "radial"}
            onChange={() => onChange({ ...gradient, kind: "radial" })}
          />
          <span>{tr("ui.radial")}</span>
        </label>
      </div>
      {gradient.kind === "linear" && (
        <label className="weft-field">
          <span>Winkel ({Math.round(gradient.angle)}°)</span>
          <input
            type="range"
            min={0}
            max={360}
            value={gradient.angle}
            onChange={(e) => onChange({ ...gradient, angle: Number(e.target.value) })}
          />
        </label>
      )}
      <span className="weft-subgroup-label">{tr("ui.gradient_points")}</span>
      {gradient.stops.map((stop) => (
        <div key={stop.id} className="weft-effect-row">
          <ColorField value={stop.color} title={tr("ui.colour")} onChange={(color) => updateStop(stop.id, { color })} />
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(stop.offset)}
            title={tr("ui.position")}
            onChange={(e) => updateStop(stop.id, { offset: Math.min(100, Math.max(0, Number(e.target.value))) })}
          />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={stop.opacity}
            title={tr("ui.opacity")}
            onChange={(e) => updateStop(stop.id, { opacity: Number(e.target.value) })}
          />
          <button
            type="button"
            className="weft-icon-button"
            disabled={gradient.stops.length <= 2}
            onClick={() => removeStop(stop.id)}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="weft-ghost-button weft-full-width" onClick={addStop}>
        {tr("ui.gradient_point")}
      </button>
    </>
  );
}

const SHAPE_STROKE_STYLE_LABELS: Record<ShapeStroke["style"], string> = {
  get solid() { return tr("ui.solid"); },
  get dashed() { return tr("ui.dashed"); },
  get dotted() { return tr("ui.dotted"); },
};

function ShapeStrokeEditor({ stroke, onChange }: { stroke: ShapeStroke; onChange: (stroke: ShapeStroke) => void }) {
  return (
    <>
      <label className="weft-field weft-field-inline">
        <input type="checkbox" checked={stroke.enabled} onChange={(e) => onChange({ ...stroke, enabled: e.target.checked })} />
        <span>{tr("ui.show_outline")}</span>
      </label>
      {stroke.enabled && (
        <>
          <div className="weft-format-row">
            <label className="weft-field">
              <span>{tr("ui.colour")}</span>
              <ColorField value={stroke.color} onChange={(color) => onChange({ ...stroke, color })} />
            </label>
            <label className="weft-field">
              <span>Deckkraft ({Math.round(stroke.opacity * 100)}%)</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={stroke.opacity}
                onChange={(e) => onChange({ ...stroke, opacity: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="weft-field">
            <span>{tr("ui.width")}</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={stroke.width}
              onChange={(e) => onChange({ ...stroke, width: Math.max(0, Number(e.target.value)) })}
            />
          </label>
          <label className="weft-field">
            <span>{tr("ui.style")}</span>
            <select value={stroke.style} onChange={(e) => onChange({ ...stroke, style: e.target.value as ShapeStroke["style"] })}>
              {(Object.keys(SHAPE_STROKE_STYLE_LABELS) as ShapeStroke["style"][]).map((style) => (
                <option key={style} value={style}>
                  {SHAPE_STROKE_STYLE_LABELS[style]}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
    </>
  );
}

function ShapeShadowEditor({ shadow, onChange }: { shadow: ShapeShadow; onChange: (shadow: ShapeShadow) => void }) {
  return (
    <>
      <label className="weft-field weft-field-inline">
        <input type="checkbox" checked={shadow.enabled} onChange={(e) => onChange({ ...shadow, enabled: e.target.checked })} />
        <span>{tr("ui.show_shadow")}</span>
      </label>
      {shadow.enabled && (
        <>
          <div className="weft-format-row">
            <label className="weft-field">
              <span>{tr("ui.colour")}</span>
              <ColorField value={shadow.color} onChange={(color) => onChange({ ...shadow, color })} />
            </label>
            <label className="weft-field">
              <span>Deckkraft ({Math.round(shadow.opacity * 100)}%)</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={shadow.opacity}
                onChange={(e) => onChange({ ...shadow, opacity: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="weft-field">
            <span>{tr("ui.blur")}</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={shadow.blur}
              onChange={(e) => onChange({ ...shadow, blur: Math.max(0, Number(e.target.value)) })}
            />
          </label>
          <div className="weft-field-grid">
            <label>
              <span>{tr("ui.offset_x")}</span>
              <input type="number" step={0.1} value={shadow.offsetX} onChange={(e) => onChange({ ...shadow, offsetX: Number(e.target.value) })} />
            </label>
            <label>
              <span>{tr("ui.offset_y")}</span>
              <input type="number" step={0.1} value={shadow.offsetY} onChange={(e) => onChange({ ...shadow, offsetY: Number(e.target.value) })} />
            </label>
          </div>
        </>
      )}
    </>
  );
}

// Plain-text preview only, for the sidebar's option list (see QuizEditor) to tell options apart
// by - the actual text is edited on the canvas now (WYSIWYG, like a text block), not here.
function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent ?? "";
}

/** One answer in the sidebar: whether it is a correct one, and - folded away - what handling it right or wrong does. */
function QuizOptionRow({
  block,
  option,
  label,
  variables,
  open: openQuestion,
  onUpdate,
}: {
  block: QuizBlock;
  option: QuizOption;
  label: string;
  variables: VariableDef[];
  open: boolean;
  onUpdate: BlockPanelProps["onUpdate"];
}) {
  const onRight = option.onRight ?? [];
  const onWrong = option.onWrong ?? [];
  const count = onRight.length + onWrong.length;
  const [open, setOpen] = useState(count > 0);
  const patchOption = (patch: Partial<QuizOption>) =>
    onUpdate({ options: block.options.map((o) => (o.id === option.id ? { ...o, ...patch } : o)) });
  return (
    <div className="weft-quiz-option">
      <div className="weft-quiz-option-row">
        {!openQuestion && (
          <input
            type="checkbox"
            title={tr("ui.correct")}
            checked={block.correctOptionIds.includes(option.id)}
            onChange={(e) => {
              const correctOptionIds = e.target.checked
                ? [...block.correctOptionIds, option.id]
                : block.correctOptionIds.filter((id) => id !== option.id);
              onUpdate({ correctOptionIds });
            }}
          />
        )}
        <span className="weft-quiz-option-row-label">{label}</span>
        <button
          type="button"
          className={"weft-ghost-button weft-quiz-option-effects-toggle" + (count > 0 ? " has-effects" : "")}
          title={tr("ui.points_effects_of_this_answer")}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {count > 0 ? tr("ui.effects", { count: count }) : tr("ui.effects_2")}
        </button>
        <button
          type="button"
          className="weft-icon-button"
          onClick={() =>
            onUpdate({
              options: block.options.filter((o) => o.id !== option.id),
              correctOptionIds: block.correctOptionIds.filter((id) => id !== option.id),
            })
          }
        >
          ×
        </button>
      </div>
      {open && (
        <div className="weft-quiz-option-effects">
          <p className="weft-hint">
            {openQuestion
              ? tr("ui.depending_on_whether_the_answer_was")
              : tr("ui.handled_correctly_means_ticked_if_the")}
          </p>
          <span className="weft-field-label">{openQuestion ? tr("ui.if_ticked") : tr("ui.handled_correctly")}</span>
          <EffectListEditor effects={onRight} variables={variables} onChange={(onRight) => patchOption({ onRight })} />
          <span className="weft-field-label">{openQuestion ? tr("ui.if_not_ticked") : tr("ui.handled_wrongly")}</span>
          <EffectListEditor effects={onWrong} variables={variables} onChange={(onWrong) => patchOption({ onWrong })} />
        </div>
      )}
    </div>
  );
}

function QuizEditor({ block, page, onUpdate }: { block: QuizBlock; page?: Page; onUpdate: BlockPanelProps["onUpdate"] }) {
  // "Weiter zur nächsten Folie" of an outcome: a "Nächste Folie" event of its own for it, with a trigger from the outcome.
  const goesOn = (outcome: "richtig" | "falsch") => !!page?.timeline.ends[quizEndNodeId(block.id, outcome)];
  const variables = useDocumentStore((s) => s.doc.content.variables);
  const { lang, defaultLang } = useEditingLanguage();

  return (
    <>
      <Collapsible title={tr("ui.question_answers")}>
        <label className="weft-field">
          <span>{tr("ui.type")}</span>
          <select value={block.open ? "open" : "test"} onChange={(e) => onUpdate({ open: e.target.value === "open" })}>
            <option value="test">{tr("ui.test_right_or_wrong")}</option>
            <option value="open">{tr("ui.open_question_nothing_is_wrong")}</option>
          </select>
        </label>
        <LanguageSelect block={block} />
        <p className="weft-hint">{tr("ui.type_the_question_and_answers_directly")}</p>

        {block.options.map((opt) => (
          <QuizOptionRow
            key={opt.id}
            block={block}
            option={opt}
            label={stripHtml(quizOptionHtml(block, opt.id, lang, defaultLang)) || tr("ui.empty")}
            variables={variables}
            open={!!block.open}
            onUpdate={onUpdate}
          />
        ))}
        <button
          type="button"
          className="weft-ghost-button weft-full-width"
          onClick={() => onUpdate({ options: [...block.options, { id: createId(), html: tr("ui.new_option") }] })}
        >
          {tr("ui.option")}
        </button>
      </Collapsible>

      <Collapsible title={block.open ? tr("ui.after_submitting") : tr("ui.on_a_correct_answer")} defaultOpen={false}>
        <EffectListEditor effects={block.onCorrect} variables={variables} onChange={(onCorrect) => onUpdate({ onCorrect })} />
        <label className="weft-field weft-field-inline">
          <input
            type="checkbox"
            checked={goesOn("richtig")}
            disabled={!page}
            onChange={(e) => page && setQuizAdvance(page.id, block.id, "richtig", e.target.checked)}
          />
          <span>{tr("ui.continue_to_the_next_slide")}</span>
        </label>
        {goesOn("richtig") && (
          <p className="weft-hint">{tr("ui.happens_1_5_seconds_after_correct")}</p>
        )}
      </Collapsible>
      {!block.open && (
        <Collapsible title={tr("ui.on_a_wrong_answer")} defaultOpen={false}>
          <EffectListEditor effects={block.onIncorrect} variables={variables} onChange={(onIncorrect) => onUpdate({ onIncorrect })} />
          <label className="weft-field weft-field-inline">
            <input
              type="checkbox"
              checked={goesOn("falsch")}
              disabled={!page}
              onChange={(e) => page && setQuizAdvance(page.id, block.id, "falsch", e.target.checked)}
            />
            <span>{tr("ui.continue_to_the_next_slide")}</span>
          </label>
          {goesOn("falsch") && (
            <p className="weft-hint">
              {tr("ui.happens_1_5_seconds_after_the")}
            </p>
          )}
        </Collapsible>
      )}
    </>
  );
}

/** What a fresh effect on `variable` starts as - an addition for a number, set-to-yes for a Ja/Nein,
 * set-to-empty for text. */
function defaultEffectFor(variable: VariableDef): VariableEffect {
  if (isBooleanVariable(variable)) return { variableId: variable.id, op: "set", value: true };
  if (variable.type === "string") return { variableId: variable.id, op: "set", value: "" };
  return { variableId: variable.id, op: "add", value: 1 };
}

/** The value of an effect. A number is typed as text and only taken over once it is one: while "-" or "1." is on its way to
 * being "-1" or "1.5" it stays as typed (minus points have to be typeable). */
function EffectValueInput({ effect, numeric, onChange }: { effect: VariableEffect; numeric: boolean; onChange: (value: string | number) => void }) {
  const [typed, setTyped] = useState<string | null>(null);
  return (
    <input
      value={typed ?? String(effect.value)}
      inputMode={numeric ? "decimal" : undefined}
      onChange={(e) => {
        const raw = e.target.value;
        if (!numeric) return onChange(raw);
        setTyped(raw);
        const parsed = Number(raw.replace(",", "."));
        if (raw.trim() !== "" && Number.isFinite(parsed)) onChange(parsed);
        else if (raw.trim() === "") onChange(0);
      }}
      onBlur={() => setTyped(null)}
    />
  );
}

function EffectListEditor({
  effects,
  variables: allVariables,
  onChange,
}: {
  effects: VariableEffect[];
  variables: VariableDef[];
  onChange: (effects: VariableEffect[]) => void;
}) {
  // A computed variable has no value to change, so it's never a target.
  const variables = allVariables.filter(isSettableVariable);
  return (
    <>
      {effects.map((effect, index) => {
        const target = allVariables.find((v) => v.id === effect.variableId);
        const isBoolean = !!target && isBooleanVariable(target);
        return (
          <div key={index} className="weft-effect-row">
            <select
              value={effect.variableId}
              onChange={(e) => {
                const next = [...effects];
                const chosen = variables.find((v) => v.id === e.target.value);
                // Switching between kinds of variable (number/text/Ja-Nein) restarts the effect, since
                // an "add 1" or a text value means nothing on the other kind.
                next[index] =
                  chosen && chosen.type !== target?.type ? defaultEffectFor(chosen) : { ...effect, variableId: e.target.value };
                onChange(next);
              }}
            >
              {/* Keeps showing a target that was computed after the effect was made, rather than a blank. */}
              {target && !isSettableVariable(target) && <option value={target.id}>{target.name} {tr("ui.calculated")}</option>}
              {variables.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <select
              value={effect.op}
              disabled={isBoolean}
              onChange={(e) => {
                const op = e.target.value as VariableEffect["op"];
                const next = [...effects];
                next[index] =
                  op === "add"
                    ? { variableId: effect.variableId, op, value: 1 }
                    : op === "append"
                      ? { variableId: effect.variableId, op, value: "" }
                      : { variableId: effect.variableId, op, value: target?.type === "number" ? 0 : "" };
                onChange(next);
              }}
            >
              <option value="set">{tr("ui.set_to")}</option>
              {!isBoolean && <option value="add">addieren</option>}
              {!isBoolean && <option value="append">{tr("ui.append")}</option>}
            </select>
            {isBoolean ? (
              <select
                value={effect.value === true ? "yes" : "no"}
                onChange={(e) => {
                  const next = [...effects];
                  next[index] = { variableId: effect.variableId, op: "set", value: e.target.value === "yes" };
                  onChange(next);
                }}
              >
                <option value="yes">{tr("ui.yes")}</option>
                <option value="no">{tr("ui.no")}</option>
              </select>
            ) : (
              <EffectValueInput
                effect={effect}
                // A number variable is set/added to with a number, never with text that merely looks like one.
                numeric={effect.op === "add" || (effect.op === "set" && target?.type === "number")}
                onChange={(value) => {
                  const next = [...effects];
                  next[index] = { ...effect, value } as VariableEffect;
                  onChange(next);
                }}
              />
            )}
            <button type="button" className="weft-icon-button" onClick={() => onChange(effects.filter((_, i) => i !== index))}>
              ×
            </button>
          </div>
        );
      })}
      {variables.length > 0 && (
        <button
          type="button"
          className="weft-ghost-button weft-full-width"
          onClick={() => onChange([...effects, defaultEffectFor(variables[0])])}
        >
          {tr("ui.effect_2")}
        </button>
      )}
    </>
  );
}
