import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
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
import { addCustomFont, addScriptLibrary, addTrigger, removeScriptLibrary, removeTrigger, setConditionTrigger, setDisappearsOnResumeOf, setEventTrigger, setQuizAdvance, setStopPointShows, updateTrigger } from "../../../core/document/actions";
import type { VideoUploadResult } from "../../../core/document/actions";
import {
  blockEffectNodeId,
  buttonClickNodeId,
  conditionNodeId,
  disappearsOnResume,
  endNodeIds,
  findNode,
  getBlockEntranceTrigger,
  getBlockExitTrigger,
  isListPerItem,
  outgoingTriggers,
  quizEndNodeId,
  revealerButtonNodeId,
  scriptRunNodeId,
  videoResumeNodeId,
  videoStopNodeId,
  stopPointShownKinds,
} from "../../../core/document/pageTimeline";
import type { ResolvedTrigger } from "../../../core/document/pageTimeline";
import { DIRECTION_LABELS } from "../../../core/document/transitions";
import { useAssetStore } from "../../../core/assets/assetStore";
import { formatTimeMMSS } from "../../../core/formatTime";
import { useDocumentStore } from "../../../core/document/store";
import { CURATED_FONT_FAMILIES } from "../../../core/fonts/curatedFonts";
import { DEFAULT_FONT_FAMILY } from "../../../core/fonts/fontFaceCss";
import { BLOCK_KIND_KEYS } from "../../../core/i18n/translations";
import { useTranslation } from "../../../core/i18n/useTranslation";
import { SecondsControl } from "./SecondsControl";
import { StepperSlider } from "./StepperSlider";
import { ActionEffectsEditor } from "./ActionEffectsEditor";
import { addFilesToBlock, removeFileFromBlock, setFilesPassword, setMatchingImage, setSortImage } from "../../../core/document/filesActions";
import { safeLinkUrl } from "../../../core/document/linkUrl";
import type { BlockContainerRef } from "../../../core/document/store";
import { confirmDestructive, pickFilesFromDisk, pickFontFile, pickScriptFile, warnAboutVideoUploads } from "../../../core/io/fileIO";
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
  MatchItem,
  MatchingBlock,
  SortBlock,
  SortItem,
  CodeBlock,
  ScriptBlock,
  IframeBlock,
  ImageBlock,
  LinkBlock,
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
  TextBox,
  TimelineEdgeKind,
  VariableDef,
  VariableEffect,
  AudioBlock,
  MediaBlock,
  ProgressBlock,
  RevealerBlock,
  VideoBlock,
  VideoStopPoint,
} from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { EffectListEditor } from "./EffectListEditor";
import { DEFAULT_VIEWPORT_WIDTH } from "../../../core/blocks/iframe/render.js";
import { FieldsPanel } from "./FieldsPanel";
import { descriptorOf, isInvisibleKind } from "../../../core/blocks/registry";
import { applyFontSize, applyFormat, removeTextColor, useFormatSnapshot } from "../blocks/richText";
import type { TriState } from "../blocks/richText";
import { listPageTriggerEvents, listTriggerableNodes, nodeLabel } from "../Timeline";
import { OutgoingTriggersSection } from "./TriggerSections";
import { pageChoices } from "./pageChoices";
import { PageMiniature } from "../PageMiniature";
import { buttonAppearanceOf, defaultButtonColor } from "../../../core/document/buttonAppearance";
import { DEFAULT_TEXT_BOX } from "../../../core/document/textBox";
import { placeholderOfText, textsWithOtherFormatting } from "../../../core/document/placeholders";
import { applyPlaceholderFormattingToPages, resetPlaceholderFormatting } from "../../../core/document/actions";
import { FontSelect } from "./FontSelect";
import type { FontSelectGroup } from "./FontSelect";
import { usePlaceholderProblems } from "../blocks/usePlaceholderProblems";
import { matchingItemText, matchingItemTextPatch, sortItemText, sortItemTextPatch, sortLabel, sortLabelPatch, fieldWording, fieldWordingPatch, quizExplanation, quizExplanationPatch, quizOptionHtml, revealerWording, revealerWordingPatch, textHtml } from "../../../core/document/translations";
import type { RevealerWording } from "../../../core/document/translations";
import { revealerIconSvg } from "../../../core/runtime/revealerGeometry";
import { clozeBlanks } from "../../../core/document/cloze";
import { useEditingLanguage } from "../useEditingLanguage";
import { LanguageSelect } from "./LanguageSelect";
import { TexEditor } from "./TexEditor";
import { TriggerPicker } from "./TriggerPicker";
import { tr } from "../../../core/i18n/tr";
import { ColorField } from "../ColorField";
import { useStopPointDialog } from "../blocks/stopPointDialogStore";
import { useBackdropClose } from "../useBackdropClose";
import { useDialogA11y } from "../useDialogA11y";
import { blockTitle } from "../blockTitle";
import { Waveform } from "./Waveform";
import trashIconSvg from "../../../../mockups/icons/trash.svg?raw";
import { orderedValues } from "../../../core/document/ordering";
import { BlockKindIcon } from "../BlockKindIcon";

const SANDBOX_FLAGS = ["allow-scripts", "allow-same-origin", "allow-popups", "allow-forms"];
const UPLOAD_FONT_VALUE = "__upload__";
// Single source of truth for the font-size stepper's floor/ceiling - used by the number input's
// own min/max *and* by both step buttons *and* by typing a value directly, so all three ways of
// changing the size agree. Previously the buttons hardcoded their own "8" separately from the
// input's min attribute, and a typed value wasn't clamped at all - so a value typed below 8
// (allowed) and then nudged with the "−" button (floored at the button's own hardcoded 8) would
// visibly jump back *up* to 8 instead of continuing to shrink, which is what actually caused the
// "inconsistent"/"komisch" behavior reported for small sizes, not the cqw storage itself.
/** Applies a size typed into the field of the sidebar: only when there is a number in it that is not the size the text has already. Clamped
 * here, not just via the input's own min/max attributes - those only affect the native spinner UI, not a value typed directly (which is why
 * typing e.g. "2" previously stored a font-size below the intended floor at all, see MIN_FONT_SIZE_PX's own comment). */
function commitTypedFontSize(typed: string): void {
  if (typed.trim() === "") return;
  const px = Number(typed);
  if (!Number.isFinite(px) || px === useFormatSnapshot.getState().fontSizePx) return;
  applyFontSize(Math.min(MAX_FONT_SIZE_PX, Math.max(MIN_FONT_SIZE_PX, px)));
}

const MIN_FONT_SIZE_PX = 4;
const MAX_FONT_SIZE_PX = 300;

interface BlockPanelProps {
  block: Block;
  onUpdate: (patch: Partial<Block>) => void;
  onSetImage: (file: File) => void;
  onSetVideo: (file: File) => Promise<VideoUploadResult>;
  onSetAudio: (file: File) => Promise<void>;
  /** Where the block is (a page or a layout) - what the files block's actions need to find it. */
  container: BlockContainerRef;
  /** Present only when editing a block that lives directly on a page (not inside a Layout) -
   * Aufbau/Abbau (see BlockEffectEditor) only make sense there: a Layout applies to every page
   * that uses it, with no timeline of its own for a trigger to come from. Also doubles as the
   * source for the trigger-event picker itself (see listPageTriggerEvents). */
  page?: Page;
}

export function BlockPanel({ block, onUpdate, onSetImage, onSetVideo, onSetAudio, container, page }: BlockPanelProps) {
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
      {/* (Not for a button: its look comes from the module's style - see "Stil interaktiver Elemente" - and only its words are the author's.) */}
      {(block.kind === "text" ||
        block.kind === "placeholder" ||
        block.kind === "quiz" ||
        block.kind === "list" ||
        block.kind === "cloze") && (
        <TextEditor
          block={block.kind === "text" ? block : undefined}
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
      {block.kind === "text" && <TextBoxEditor key={block.id} block={block} onUpdate={onUpdate} />}
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
      {block.kind === "video" && <VideoEditor block={block} page={page} onUpdate={onUpdate} onSetVideo={onSetVideo} />}
      {block.kind === "audio" && <AudioEditor block={block} page={page} onUpdate={onUpdate} onSetAudio={onSetAudio} />}
      {block.kind === "iframe" && <IframeEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "button" && <ButtonEditor block={block} page={page} onUpdate={onUpdate} />}
      {block.kind === "link" && <LinkEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "revealer" && <RevealerEditor block={block} page={page} onUpdate={onUpdate} onSetImage={onSetImage} />}
      {block.kind === "quiz" && <QuizEditor block={block} page={page} onUpdate={onUpdate} />}
      {descriptorOf(block) && <FieldsPanel block={block} container={container} page={page} onUpdate={onUpdate} />}
      {block.kind === "matching" && <MatchingEditor block={block} container={container} page={page} onUpdate={onUpdate} />}
            {block.kind === "sort" && <SortEditor block={block} container={container} page={page} onUpdate={onUpdate} />}
      {block.kind === "shape" && <ShapeEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "arrow" && <ArrowEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "progress" && <ProgressEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "files" && <FilesEditor key={block.id} block={block} container={container} onUpdate={onUpdate} />}
      {block.kind === "script" && <ScriptEditor key={block.id} block={block} page={page} onUpdate={onUpdate} />}
      {/* (A logic block has no Aufbau/Abbau: it has an event of its own, in the graph.) */}
      {page && !isInvisibleKind(block.kind) && (
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
          {/* What the block does between its Aufbau and its Abbau: a block of the page only (the effects of a layout's blocks are the layout's). */}
          {block.id in page.blocks && <ActionEffectsEditor key={block.id + "-actions"} block={block} page={page} />}
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

/** The small movement of a "fade" (BlockEffect.motion), by phase: an Aufbau starts from a side, an Abbau goes off to it. */
const FADE_MOTIONS: NonNullable<BlockEffect["motion"]>[] = ["up", "down", "scale"];
function fadeMotionLabel(motion: NonNullable<BlockEffect["motion"]>, phase: "entrance" | "exit"): string {
  if (motion === "scale") return tr("ui.effect_scale");
  if (motion === "up") return phase === "entrance" ? tr("ui.effect_from_top") : tr("ui.effect_to_top");
  return phase === "entrance" ? tr("ui.effect_from_bottom") : tr("ui.effect_to_bottom");
}

/** The side a "move" comes from (an Aufbau) or goes off to (an Abbau), BlockEffect.moveDirection - "angle" is any other side, by degrees. */
const MOVE_DIRECTIONS: NonNullable<BlockEffect["moveDirection"]>[] = ["right", "left", "up", "down", "angle"];
function moveDirectionLabel(direction: NonNullable<BlockEffect["moveDirection"]>, phase: "entrance" | "exit"): string {
  if (direction === "angle") return tr("ui.effect_angle");
  const from = phase === "entrance";
  if (direction === "right") return from ? tr("ui.effect_from_right") : tr("ui.effect_to_right");
  if (direction === "left") return from ? tr("ui.effect_from_left") : tr("ui.effect_to_left");
  if (direction === "up") return from ? tr("ui.effect_from_top") : tr("ui.effect_to_top");
  return from ? tr("ui.effect_from_bottom") : tr("ui.effect_to_bottom");
}

// "off" is listed separately (its label depends on Aufbau/Abbau, see BlockEffectEditor).
const BLOCK_EFFECT_LABELS: Record<Exclude<BlockEffectType, "off">, { entrance: string; exit: string }> = {
  none: { get entrance() { return tr("ui.no_animation"); }, get exit() { return tr("ui.no_animation"); } },
  fade: { get entrance() { return tr("ui.fade"); }, get exit() { return tr("ui.fade"); } },
  move: { get entrance() { return tr("ui.move"); }, get exit() { return tr("ui.move"); } },
  iris: { get entrance() { return tr("ui.iris_wipe"); }, get exit() { return tr("ui.iris_wipe"); } },
  wipe: { get entrance() { return tr("ui.wipe"); }, get exit() { return tr("ui.wipe"); } },
  anvil: { get entrance() { return tr("ui.anvil"); }, get exit() { return tr("ui.anvil_away_upwards"); } },
  blur: { get entrance() { return tr("ui.blur_2"); }, get exit() { return tr("ui.blur_2"); } },
};
const BLOCK_EFFECT_ORDER: Exclude<BlockEffectType, "off">[] = ["none", "fade", "move", "iris", "wipe", "anvil", "blur"];

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
          {BLOCK_EFFECT_ORDER.map((type) => (
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
          {effect.type === "fade" && (
            <label className="weft-field">
              <span>{tr("ui.effect_motion")}</span>
              <select
                value={effect.motion ?? "none"}
                onChange={(e) => {
                  const { motion: _old, ...rest } = effect;
                  onEffectChange(e.target.value === "none" ? rest : { ...rest, motion: e.target.value as NonNullable<BlockEffect["motion"]> });
                }}
              >
                <option value="none">{tr("ui.effect_motion_none")}</option>
                {FADE_MOTIONS.map((motion) => (
                  <option key={motion} value={motion}>
                    {fadeMotionLabel(motion, phase)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {effect.type === "move" && (
            <>
              <label className="weft-field">
                <span>{tr("ui.effect_move_direction")}</span>
                <select
                  value={effect.moveDirection ?? "right"}
                  onChange={(e) => onEffectChange({ ...effect, moveDirection: e.target.value as NonNullable<BlockEffect["moveDirection"]> })}
                >
                  {MOVE_DIRECTIONS.map((direction) => (
                    <option key={direction} value={direction}>
                      {moveDirectionLabel(direction, phase)}
                    </option>
                  ))}
                </select>
              </label>
              {effect.moveDirection === "angle" && (
                <div className="weft-field">
                  <span>{tr("ui.effect_angle_degrees")}</span>
                  <StepperSlider
                    label={tr("ui.effect_angle_degrees")}
                    value={effect.moveAngle ?? 0}
                    min={0}
                    max={360}
                    step={1}
                    onChange={(moveAngle) => onEffectChange({ ...effect, moveAngle: Math.round(moveAngle) })}
                  />
                  <p className="weft-hint">{tr("ui.effect_angle_hint")}</p>
                </div>
              )}
            </>
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
              condition={{ formula: page.timeline.conditions?.[conditionNodeId(targetNodeId)] ?? null, onChange: (formula) => setConditionTrigger(page.id, targetNodeId, formula) }}
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
      <label className="weft-field">
        <span>{tr("ui.block_name")}</span>
        <input
          value={block.name ?? ""}
          placeholder={t(BLOCK_KIND_KEYS[block.kind])}
          title={tr("ui.block_name_hint")}
          onChange={(e) => onUpdate({ name: e.target.value === "" ? undefined : e.target.value })}
        />
      </label>
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
  // The size field stays the same element (its focus must survive a change of the size, or a second arrow key press would find nothing to
  // work on): it is told the size when the selection moves on, unless a number is being typed into it.
  const sizeInputRef = useRef<HTMLInputElement>(null);
  const sizeTyping = useRef(false);
  useEffect(() => {
    const field = sizeInputRef.current;
    if (field && !sizeTyping.current) field.value = fontSizeKey === "mixed" ? "" : fontSizeKey;
  }, [fontSizeKey]);
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
                ref={sizeInputRef}
                type="number"
                min={MIN_FONT_SIZE_PX}
                max={MAX_FONT_SIZE_PX}
                defaultValue={fontSizeKey === "mixed" ? "" : fontSizeKey}
                placeholder={snapshot.fontSizePx === "mixed" ? tr("ui.mixed") : "24"}
                // A size that was typed is applied when Enter is pressed or the field is left. (When it is left: a frame later - the
                // text needs the focus for the change, and Safari does not hand it over in the middle of the focus moving on.)
                onInput={() => {
                  sizeTyping.current = true;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    sizeTyping.current = false;
                    commitTypedFontSize(e.currentTarget.value);
                    e.currentTarget.select();
                  } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                    // ↑/↓ change the size by one (ten with Shift) and apply it at once, to see what it looks like. (Typing does not apply
                    // anything until Enter or leaving the field: a 12 that becomes a 14 is for a moment a 1.)
                    e.preventDefault();
                    const typed = Number(e.currentTarget.value);
                    const base = e.currentTarget.value.trim() !== "" && Number.isFinite(typed) ? typed : typeof snapshot.fontSizePx === "number" ? snapshot.fontSizePx : 16;
                    const step = (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1);
                    const next = Math.min(MAX_FONT_SIZE_PX, Math.max(MIN_FONT_SIZE_PX, Math.round(base) + step));
                    sizeTyping.current = false;
                    e.currentTarget.value = String(next);
                    applyFontSize(next);
                    e.currentTarget.select();
                  }
                }}
                onBlur={(e) => {
                  const typed = e.currentTarget.value;
                  sizeTyping.current = false;
                  // (A frame later: the text needs the focus for the change, and Safari does not hand it over in the middle of the focus
                  // moving on. Then the field shows the size the text has.)
                  window.setTimeout(() => {
                    commitTypedFontSize(typed);
                    const field = sizeInputRef.current;
                    const size = useFormatSnapshot.getState().fontSizePx;
                    if (field && document.activeElement !== field) field.value = size === "mixed" || size === null ? "" : String(size);
                  }, 0);
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
              // No colour of its own is the slide's: light letters on a dark slide, dark on a light one.
              isDefault={snapshot.color === ""}
              onReset={() => removeTextColor()}
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

/** The JavaScript libraries of the module, as far as a logic block needs to know: which there are, and the way to add one. They belong to the
 * whole module (the list, the order and the removing are in the settings), not to this block. */
function ScriptLibrariesField() {
  const libraries = useDocumentStore((s) => s.doc.content.scriptLibraries) ?? [];
  return (
    <div className="weft-field">
      <span>{tr("ui.script_libraries")}</span>
      {libraries.length > 0 ? (
        <ul className="weft-script-library-list">
          {libraries.map((library) => (
            <li key={library.id}>
              <span>{library.fileName}</span>
              <button
                type="button"
                className="weft-icon-button"
                title={tr("ui.script_library_remove")}
                aria-label={`${tr("ui.script_library_remove")}: ${library.fileName}`}
                onClick={() => {
                  void confirmDestructive(tr("ui.script_library_really_remove", { name: library.fileName }), tr("ui.script_library_remove")).then((ok) => {
                    if (ok) removeScriptLibrary(library.id);
                  });
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="weft-hint">{tr("ui.script_libraries_none")}</p>
      )}
      <button
        type="button"
        className="weft-ghost-button weft-full-width"
        onClick={() => {
          void pickScriptFile().then((file) => {
            if (file) addScriptLibrary(file.fileName, file.code);
          });
        }}
      >
        {tr("ui.script_library_add")}
      </button>
      <p className="weft-hint">{tr("ui.script_libraries_hint")}</p>
    </div>
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
      <ScriptLibrariesField />
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
  page,
  onUpdate,
  onSetVideo,
}: {
  block: VideoBlock;
  page?: Page;
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
        <VideoStopPointDialog block={block} page={page} assetId={block.assetId} onUpdate={onUpdate} onClose={closeStopPointDialog} />
      )}
    </>
  );
}


/** The panel of an audio block: the file, how it looks on the slide (not at all, or with a player), and its time marks (the dialog of the
 * video's time marks - a sound has the same events). */
function AudioEditor({
  block,
  page,
  onUpdate,
  onSetAudio,
}: {
  block: AudioBlock;
  page?: Page;
  onUpdate: BlockPanelProps["onUpdate"];
  onSetAudio: BlockPanelProps["onSetAudio"];
}) {
  const stopPointDialogOpen = useStopPointDialog((s) => s.blockId === block.id);
  const openStopPointDialog = useStopPointDialog((s) => s.open);
  const closeStopPointDialog = useStopPointDialog((s) => s.close);
  return (
    <>
      <Collapsible title={tr("ui.content")}>
        <label className="weft-field">
          <span>{tr("ui.audio_file")}</span>
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onSetAudio(file);
            }}
          />
        </label>
        <p className="weft-hint">{tr("ui.audio_formats_hint")}</p>

        <label className="weft-field">
          <span>{tr("ui.audio_on_the_slide")}</span>
          <select value={block.appearance} onChange={(e) => onUpdate({ appearance: e.target.value as AudioBlock["appearance"] })}>
            <option value="player">{tr("ui.audio_with_player")}</option>
            <option value="hidden">{tr("ui.audio_not_visible")}</option>
          </select>
        </label>
        {block.appearance === "hidden" && <p className="weft-hint">{tr("ui.audio_hidden_hint")}</p>}
        <label className="weft-field weft-field-inline">
          <input type="checkbox" checked={block.loop} onChange={(e) => onUpdate({ loop: e.target.checked })} />
          <span>{tr("ui.loop")}</span>
        </label>
        <label className="weft-field weft-field-inline">
          <input type="checkbox" checked={block.autoplay} onChange={(e) => onUpdate({ autoplay: e.target.checked })} />
          <span>{tr("ui.audio_play_automatically")}</span>
        </label>
      </Collapsible>

      <Collapsible title={tr("ui.time_marks")} defaultOpen={block.stopPoints.length > 0}>
        <p className="weft-hint">{tr("ui.time_marks_can_pause_the_audio")}</p>
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
        {!block.assetId && <p className="weft-hint">{tr("ui.choose_an_audio_file_first")}</p>}
      </Collapsible>

      {stopPointDialogOpen && block.assetId && (
        <VideoStopPointDialog block={block} page={page} assetId={block.assetId} onUpdate={onUpdate} onClose={closeStopPointDialog} />
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
  page,
  assetId,
  onUpdate,
  onClose,
}: {
  block: MediaBlock;
  /** The page the video is on (no page: a video of a layout, which has no events). */
  page?: Page;
  assetId: string;
  onUpdate: BlockPanelProps["onUpdate"];
  onClose: () => void;
}) {
  const backdropClose = useBackdropClose(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef);
  const isAudio = block.kind === "audio";
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

  // One seek at a time: a new place wanted while the video is still on its way is taken once it has arrived. After switching to another
  // app the webview may drop what it holds for a video (the picture then stays on one frame, with or without "seeked"); nothing helps
  // but a new element - so the preview video is made anew (`previewKey`) when the window comes back, and when a seek has not arrived
  // after SEEK_PATIENCE_MS (the hovered place is then asked from the new one).
  const [previewKey, setPreviewKey] = useState(0);
  const latestHoverTime = useRef(0);
  const seekWatchdog = useRef<number | undefined>(undefined);
  function showPreviewAt(time: number) {
    latestHoverTime.current = time;
    const preview = previewRef.current;
    if (!preview) return;
    if (preview.seeking) {
      wantedPreviewTime.current = time;
    } else {
      wantedPreviewTime.current = null;
      askPreviewFor(preview, time);
    }
  }
  function askPreviewFor(preview: HTMLVideoElement, time: number) {
    preview.currentTime = time;
    window.clearTimeout(seekWatchdog.current);
    seekWatchdog.current = window.setTimeout(() => {
      if (previewRef.current?.seeking) setPreviewKey((k) => k + 1);
    }, SEEK_PATIENCE_MS);
  }
  useEffect(() => {
    const comeBack = () => {
      if (document.visibilityState === "hidden") return;
      wantedPreviewTime.current = null;
      setPreviewKey((k) => k + 1);
    };
    document.addEventListener("visibilitychange", comeBack);
    window.addEventListener("focus", comeBack);
    window.addEventListener("pageshow", comeBack);
    return () => {
      document.removeEventListener("visibilitychange", comeBack);
      window.removeEventListener("focus", comeBack);
      window.removeEventListener("pageshow", comeBack);
      window.clearTimeout(seekWatchdog.current);
    };
  }, []);

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

  // The time mark the video has just passed (going forward, playing or jumped to) becomes the selected one - and stays so until the next
  // one is reached (or something else is clicked).
  const previousTime = useRef(0);
  useEffect(() => {
    const before = previousTime.current;
    previousTime.current = currentTime;
    if (currentTime <= before) return;
    const passed = block.stopPoints.filter((sp) => sp.timeSeconds > before && sp.timeSeconds <= currentTime + 0.001);
    const last = passed[passed.length - 1];
    if (last) setSelectedStopPointId(last.id);
  }, [currentTime, block.stopPoints]);

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
      // The space bar starts and pauses the video, as everywhere - except where it has a meaning of its own (typing, a focused button
      // or slider, which the browser handles itself).
      if (e.key === " " && !e.repeat && !e.defaultPrevented && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target instanceof HTMLElement ? e.target : null;
        if (target?.closest("input, textarea, select, button, [contenteditable='true'], [role='slider']")) return;
        e.preventDefault();
        togglePlaying();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // togglePlaying only reads the video element's ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <div ref={dialogRef} className="weft-modal" onClick={(e) => e.stopPropagation()}>
        <div className="weft-modal-header">
          <h3>{tr("ui.time_marks")}</h3>
          <button type="button" className="weft-icon-button" title={tr("ui.close")} aria-label={tr("ui.close")} onClick={onClose}>
            ×
          </button>
        </div>

        {isAudio ? (
          // A sound has no picture - the element only plays (it is the same ref as the video's: both are "media elements").
          <audio
            ref={videoRef as unknown as RefObject<HTMLAudioElement>}
            src={getObjectUrl(assetId)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onSeeked={(e) => setCurrentTime(e.currentTarget.currentTime)}
          />
        ) : (
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
        )}

        <div className={"weft-stop-point-controls" + (isAudio ? " has-wave" : "")}>
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
        <div className={"weft-stop-point-track" + (isAudio ? " has-wave" : "")} onClick={seekTo} onMouseMove={hoverTimeline} onMouseLeave={() => setHover(null)}>
          {isAudio && <Waveform url={getObjectUrl(assetId)} progress={duration > 0 ? currentTime / duration : 0} />}
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
              dangerouslySetInnerHTML={{ __html: stopPointIconSvg(sp.stopsVideo, page ? stopPointShownKinds(page, videoStopNodeId(block.id, sp.id)) : []) }}
            />
          ))}
          {/* What the video shows at the place the mouse is over - nothing to operate, only for looking for a scene. */}
          {previewMade && isAudio && (
            // A sound has no picture to look at: only the time under the mouse.
            <div
              className="weft-stop-point-preview is-time-only"
              style={{ left: hover ? Math.max(26 - 13, Math.min(hover.x, hover.width - 26 + 13)) : 0, visibility: hover ? "visible" : "hidden" }}
            >
              <span className="weft-stop-point-preview-time">{hover ? formatTimeMMSS(hover.time) : ""}</span>
            </div>
          )}
          {previewMade && !isAudio && (
            <div
              className="weft-stop-point-preview"
              // Over the mouse, but not out of the dialog (the timeline has 13px of margin on each side).
              style={{
                left: hover ? Math.max(PREVIEW_WIDTH / 2 - 13, Math.min(hover.x, hover.width - PREVIEW_WIDTH / 2 + 13)) : 0,
                visibility: hover ? "visible" : "hidden",
              }}
            >
              <video
                key={previewKey}
                ref={previewRef}
                src={getObjectUrl(assetId)}
                muted
                playsInline
                preload="auto"
                tabIndex={-1}
                style={{ width: PREVIEW_WIDTH, aspectRatio: String(aspect) }}
                // A new element goes to the place the mouse is over as soon as it can.
                onLoadedData={(event) => askPreviewFor(event.currentTarget, latestHoverTime.current)}
                onSeeked={(event) => {
                  window.clearTimeout(seekWatchdog.current);
                  const wanted = wantedPreviewTime.current;
                  if (wanted !== null) {
                    wantedPreviewTime.current = null;
                    askPreviewFor(event.currentTarget, wanted);
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
            <div className="weft-stop-point-settings-head">
              <p className="weft-stop-point-settings-title">{tr("ui.time_mark_at")} {formatTimeMMSS(selectedStopPoint.timeSeconds)}</p>
              <button
                type="button"
                className="weft-icon-button weft-trash-button"
                title={tr("ui.remove_time_mark")}
                aria-label={tr("ui.remove_time_mark")}
                onClick={() => {
                  void confirmDestructive(tr("ui.really_delete_time_mark"), tr("ui.remove_time_mark")).then((ok) => {
                    if (ok) removeStopPoint(selectedStopPoint.id);
                  });
                }}
                dangerouslySetInnerHTML={{ __html: trashIconSvg }}
              />
            </div>
            <label className="weft-field weft-field-inline">
              <input
                type="checkbox"
                checked={selectedStopPoint.stopsVideo}
                onChange={(e) => updateStopPoint(selectedStopPoint.id, { stopsVideo: e.target.checked })}
              />
              <span>{tr(isAudio ? "ui.stop_the_audio_here" : "ui.stop_the_video_here")}</span>
            </label>
            {!selectedStopPoint.stopsVideo && <p className="weft-hint">{tr(isAudio ? "ui.the_audio_just_goes_on_at" : "ui.the_video_just_goes_on_at")}</p>}
            {page && <StopPointShows page={page} video={block} stopPoint={selectedStopPoint} />}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * "Lässt erscheinen" under a time mark of a video: the page's elements (all but the video itself) as a list to tick - each ticked one appears
 * when the video reaches this time mark - and, for a mark that stops the video, a switch per ticked one: it disappears again when the video
 * goes on. The short form of the triggers from the mark's event to the Aufbau of those elements (see setStopPointShows).
 */
function StopPointShows({ page, video, stopPoint }: { page: Page; video: MediaBlock; stopPoint: VideoStopPoint }) {
  const { t } = useTranslation();
  const stopId = videoStopNodeId(video.id, stopPoint.id);
  const resumeId = videoResumeNodeId(video.id, stopPoint.id);
  const candidates = orderedValues(page.blocks).filter((b) => b.id !== video.id && !isInvisibleKind(b.kind));
  if (candidates.length === 0) return null;
  const shows = (blockId: string) =>
    Object.values(page.timeline.triggers).some((trigger) => trigger.from === stopId && trigger.to === blockEffectNodeId(blockId, "entrance"));
  const shown = candidates.filter((candidate) => shows(candidate.id));
  const addable = candidates.filter((candidate) => !shows(candidate.id));
  return (
    <div className="weft-stop-point-shows">
      <span className="weft-subgroup-label">{tr("ui.makes_appear")}</span>
      {shown.length > 0 && (
        <div className="weft-stop-point-shows-list">
          {shown.map((candidate) => (
            <div key={candidate.id} className="weft-stop-point-shows-item">
              <div className="weft-stop-point-shows-row">
                <BlockKindIcon kind={candidate.kind} size={14} />
                <span>{blockTitle(candidate, t)}</span>
                <button
                  type="button"
                  className="weft-icon-button weft-trash-button"
                  title={tr("ui.remove_shown_element")}
                  aria-label={tr("ui.remove_shown_element")}
                  onClick={() => {
                    void confirmDestructive(tr("ui.really_remove_shown_element"), tr("ui.remove_shown_element")).then((ok) => {
                      if (ok) setStopPointShows(page.id, video.id, stopPoint.id, candidate.id, false);
                    });
                  }}
                  dangerouslySetInnerHTML={{ __html: trashIconSvg }}
                />
              </div>
              {stopPoint.stopsVideo && (
                <label className="weft-field weft-field-inline weft-stop-point-shows-again">
                  <input
                    type="checkbox"
                    checked={disappearsOnResume(page, candidate.id, resumeId)}
                    onChange={(e) => setDisappearsOnResumeOf(page.id, candidate.id, resumeId, e.target.checked)}
                  />
                  <span>{tr(video.kind === "audio" ? "ui.disappears_again_when_the_audio_goes" : "ui.disappears_again_when_the_video_goes")}</span>
                </label>
              )}
            </div>
          ))}
        </div>
      )}
      {addable.length > 0 && (
        // Always back on "Keines": a chosen element goes up into the list.
        <label className="weft-field">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) setStopPointShows(page.id, video.id, stopPoint.id, e.target.value, true);
            }}
          >
            <option value="">{tr("ui.no_element_chosen")}</option>
            {addable.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {blockTitle(candidate, t)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

/** Width of the picture that follows the mouse over the timeline of the time marks dialog. */
const PREVIEW_WIDTH = 168;
/** How long a seek of that picture may take before a new one is started regardless (ms). */
const SEEK_PATIENCE_MS = 1500;


const VIEWPORT_WIDTH_PRESETS: { label: string; width: number }[] = [
  { get label() { return tr("ui.mobile"); }, width: 375 },
  { get label() { return tr("ui.tablet"); }, width: DEFAULT_VIEWPORT_WIDTH },
  { get label() { return tr("ui.desktop"); }, width: 1280 },
];

// The embedded page always sees a fixed virtual viewport width (see renderIframe in
// blocks/iframe/render.js) rather than whatever pixel size the block happens to render at - there's no
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
        <label className="weft-field weft-field-inline">
          <input type="checkbox" checked={block.required === true} onChange={(e) => onUpdate({ required: e.target.checked ? true : undefined })} />
          <span>{tr("ui.required_task")}</span>
        </label>
        {block.required && <p className="weft-hint">{tr("ui.required_task_hint")}</p>}
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
  const perItem = isListPerItem(block);
  return (
    <Collapsible title={tr("ui.list")}>
      <LanguageSelect block={block} />

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
      {block.marker !== "image" && (
        <label className="weft-field">
          <span>{tr("ui.marker_colour")}</span>
          {/* No colour of its own is the colour of the text. */}
          <ColorField
            value={block.markerColor ?? "#000000"}
            ariaLabel={tr("ui.marker_colour")}
            isDefault={!block.markerColor}
            onReset={() => onUpdate({ markerColor: null })}
            onChange={(markerColor) => onUpdate({ markerColor })}
          />
        </label>
      )}
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

const REVEALER_ICONS: { icon: RevealerBlock["icon"]; label: () => string }[] = [
  { icon: "info", label: () => tr("ui.revealer_icon_info") },
  { icon: "warning", label: () => tr("ui.revealer_icon_warning") },
  { icon: "exclamation", label: () => tr("ui.revealer_icon_exclamation") },
  { icon: "question", label: () => tr("ui.revealer_icon_question") },
];

/**
 * The panel of a revealer: its icon and colour, what its window says (a heading, and - optional - a small text, a picture and a button), how the
 * window looks, and what the button does (the same choices as a button block: see ButtonActionSection). The window is shown on the canvas while the
 * block is selected.
 */
function RevealerEditor({
  block,
  page,
  onUpdate,
  onSetImage,
}: {
  block: RevealerBlock;
  page?: Page;
  onUpdate: BlockPanelProps["onUpdate"];
  onSetImage: BlockPanelProps["onSetImage"];
}) {
  const { lang, defaultLang } = useEditingLanguage();
  const words = revealerWording(block, lang, defaultLang);
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  const imageUrl = block.imageAssetId ? getObjectUrl(block.imageAssetId) : undefined;
  const say = (fields: Partial<RevealerWording>) => onUpdate(revealerWordingPatch(block, lang, defaultLang, fields));
  const button = block.button;
  return (
    <>
      <Collapsible title={tr("ui.revealer")}>
        <LanguageSelect block={block} />
        <div className="weft-field">
          <span>{tr("ui.revealer_icon")}</span>
          <div className="weft-revealer-icon-choice" role="group" aria-label={tr("ui.revealer_icon")}>
            {REVEALER_ICONS.map((choice) => (
              <button
                key={choice.icon}
                type="button"
                className={"weft-revealer-icon-button" + (block.icon === choice.icon ? " is-active" : "")}
                aria-pressed={block.icon === choice.icon}
                title={choice.label()}
                aria-label={choice.label()}
                onClick={() => onUpdate({ icon: choice.icon })}
                dangerouslySetInnerHTML={{ __html: revealerIconSvg(choice.icon, block.color) }}
              />
            ))}
          </div>
        </div>
        <label className="weft-field">
          <span>{tr("ui.revealer_color")}</span>
          <ColorField value={block.color} ariaLabel={tr("ui.revealer_color")} onChange={(color) => onUpdate({ color })} />
        </label>
        <label className="weft-field">
          <span>{tr("ui.revealer_window")}</span>
          <select value={block.windowStyle} onChange={(e) => onUpdate({ windowStyle: e.target.value as RevealerBlock["windowStyle"] })}>
            <option value="dark">{tr("ui.revealer_window_dark")}</option>
            <option value="light">{tr("ui.revealer_window_light")}</option>
          </select>
        </label>
      </Collapsible>

      <Collapsible title={tr("ui.revealer_content")}>
        <label className="weft-field">
          <span>{tr("ui.revealer_title")}</span>
          <input value={words.title} onChange={(e) => say({ title: e.target.value })} />
        </label>
        <label className="weft-field">
          <span>{tr("ui.revealer_text")}</span>
          <textarea rows={4} value={words.body} onChange={(e) => say({ body: e.target.value })} />
        </label>
        <div className="weft-field">
          <span>{tr("ui.revealer_image")}</span>
          {imageUrl && <img className="weft-cover-preview" src={imageUrl} alt="" />}
          <input
            type="file"
            accept="image/*"
            aria-label={tr("ui.revealer_choose_image")}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onSetImage(file);
              e.target.value = "";
            }}
          />
          {imageUrl && (
            <button type="button" className="weft-ghost-button weft-full-width" onClick={() => onUpdate({ imageAssetId: null })}>
              {tr("ui.revealer_remove_image")}
            </button>
          )}
        </div>
        {imageUrl && (
          <label className="weft-field">
            <span>{tr("ui.revealer_image_alt")}</span>
            <input value={words.imageAlt} onChange={(e) => say({ imageAlt: e.target.value })} />
          </label>
        )}
        <label className="weft-field weft-field-inline">
          <input
            type="checkbox"
            checked={button !== null}
            onChange={(e) =>
              onUpdate({ button: e.target.checked ? { text: tr("ui.revealer_default_button"), action: "event" } : null })
            }
          />
          <span>{tr("ui.revealer_button_on")}</span>
        </label>
        {button && (
          <label className="weft-field">
            <span>{tr("ui.revealer_button_text")}</span>
            <input value={words.buttonText} onChange={(e) => say({ buttonText: e.target.value })} />
          </label>
        )}
        <p className="weft-hint">{tr("ui.revealer_opens_note")}</p>
      </Collapsible>

      {button && (
        <ButtonActionSection
          page={page}
          clickId={revealerButtonNodeId(block.id)}
          action={button.action}
          targetPageId={button.targetPageId}
          effects={button.onClick ?? []}
          onChange={(patch) => onUpdate({ button: { ...button, ...patch } })}
        />
      )}
    </>
  );
}

/** What a click on a button does, and what it triggers: the sections "Aktion", "Löst aus" and "Variablen ändern" of a button block - and of the button in
 * the window of a revealer, which does the same. `clickId` is the event of the click; `onChange` receives the fields that changed. */
function ButtonActionSection({
  page,
  clickId,
  action,
  targetPageId,
  effects,
  onChange,
}: {
  page?: Page;
  clickId: string;
  action: ButtonBlock["action"];
  targetPageId?: string;
  effects: VariableEffect[];
  onChange: (patch: { action?: ButtonBlock["action"]; targetPageId?: string; onClick?: VariableEffect[] }) => void;
}) {
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
  const targetKnown = !!targetPageId && pages.some((p) => p.pageId === targetPageId);
  const value =
    action === "event"
      ? outgoing[0]
        ? `event:${outgoing[0].to}`
        : NO_TARGET
      : action === "goto"
        ? `goto:${targetPageId ?? ""}`
        : action;
  const variables = useDocumentStore((s) => s.doc.content.variables);

  function chooseAction(chosen: string) {
    if (chosen === "advance" || chosen === "prev") {
      onChange({ action: chosen });
      return;
    }
    if (chosen.startsWith("goto:")) {
      onChange({ action: "goto", targetPageId: chosen.slice("goto:".length) || undefined });
      return;
    }
    if (!page) {
      onChange({ action: "event" });
      return;
    }
    // Turning a button into one that triggers an event gives a button block its default trigger (to "Nächste Folie", see updateBlock); the
    // chosen event then takes that one's place.
    if (action !== "event") onChange({ action: "event" });
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
              {action === "goto" && !targetPageId && <option value="goto:">{tr("ui.choose_slide")}</option>}
              {action === "goto" && targetPageId && !targetKnown && (
                <option value={`goto:${targetPageId}`}>{tr("ui.deleted_slide")}</option>
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
        {action === "advance" && (
          <p className="weft-hint">
            {tr("ui.first_shows_the_entrances_of_this")}
          </p>
        )}
        {action === "prev" && (
          <p className="weft-hint">
            {tr("ui.automatically_disabled_on_the_first_slide")}
          </p>
        )}
        {action === "goto" && (
          <>
            {targetKnown && targetPageId ? (
              <div className="weft-jump-miniature">
                <PageMiniature pageId={targetPageId} />
              </div>
            ) : (
              <p className="weft-hint">{tr("ui.this_slide_no_longer_exists_the")}</p>
            )}
            <p className="weft-hint">
              {tr("ui.jumps_to_this_slide_after_that")}
            </p>
          </>
        )}
        {action === "event" && !page && (
          <p className="weft-hint">
            {tr("ui.the_click_is_an_event_in")}
          </p>
        )}
      </Collapsible>
      {action === "event" && page && clickNode && <OutgoingTriggersSection page={page} node={clickNode} />}
      <Collapsible title={tr("ui.change_variables")} defaultOpen={(effects).length > 0}>
        <p className="weft-hint">{tr("ui.on_every_click_in_addition_to")}</p>
        <EffectListEditor effects={effects} variables={variables} onChange={(onClick) => onChange({ onClick })} />
        {variables.length === 0 && <p className="weft-hint">{tr("ui.there_are_no_variables_yet_create")}</p>}
      </Collapsible>
    </>
  );
}

/** The background and border of a text (TextBlock.box): a card in one block. */
function TextBoxEditor({ block, onUpdate }: { block: TextBlock; onUpdate: BlockPanelProps["onUpdate"] }) {
  const box = block.box;
  const set = (patch: Partial<TextBox>) => onUpdate({ box: { ...(box ?? DEFAULT_TEXT_BOX), ...patch } });
  return (
    <Collapsible title={tr("ui.text_box")} defaultOpen={box !== undefined}>
      <label className="weft-field weft-field-inline">
        <input type="checkbox" checked={box !== undefined} onChange={(e) => onUpdate({ box: e.target.checked ? { ...DEFAULT_TEXT_BOX } : undefined })} />
        <span>{tr("ui.text_box_show")}</span>
      </label>
      {box && (
        <>
          <div className="weft-field">
            <span>{tr("ui.background")}</span>
            <div className="weft-button-look-row">
              <label className="weft-field weft-field-inline">
                <input type="checkbox" checked={box.fill === null} onChange={(e) => set({ fill: e.target.checked ? null : DEFAULT_TEXT_BOX.fill })} />
                <span>{tr("ui.no_background")}</span>
              </label>
              {box.fill !== null && <ColorField value={box.fill} ariaLabel={tr("ui.background_colour")} onChange={(color) => set({ fill: color })} />}
            </div>
          </div>
          {box.fill !== null && (
            <div className="weft-field">
              <span>{tr("ui.opacity_2")}</span>
              <StepperSlider label={tr("ui.opacity")} value={Math.round(box.fillOpacity * 100)} min={0} max={100} step={5} onChange={(value) => set({ fillOpacity: Math.min(100, value) / 100 })} />
            </div>
          )}
          <label className="weft-field weft-field-inline">
            <input type="checkbox" checked={!!box.blur} onChange={(e) => set({ blur: e.target.checked })} />
            <span>{tr("ui.blur_behind")}</span>
          </label>
          <div className="weft-field">
            <span>{tr("ui.border_thickness_of_the_slide_width")}</span>
            <StepperSlider
              label={tr("ui.border_thickness")}
              value={Math.round(box.borderWidth * 100) / 100}
              min={0}
              max={2}
              step={0.05}
              onChange={(value) => set({ borderWidth: Math.round(value * 100) / 100, borderColor: box.borderColor ?? DEFAULT_TEXT_BOX.borderColor })}
            />
          </div>
          {box.borderWidth > 0 && box.borderColor !== null && (
            <>
              <label className="weft-field">
                <span>{tr("ui.border_colour")}</span>
                <ColorField value={box.borderColor} ariaLabel={tr("ui.border_colour")} onChange={(color) => set({ borderColor: color })} />
              </label>
              <div className="weft-field">
                <span>{tr("ui.border_opacity")}</span>
                <StepperSlider label={tr("ui.border_opacity")} value={Math.round(box.borderOpacity * 100)} min={0} max={100} step={5} onChange={(value) => set({ borderOpacity: Math.min(100, value) / 100 })} />
              </div>
            </>
          )}
          <div className="weft-field">
            <span>{tr("ui.rounding_of_the_corners_of_the")}</span>
            <StepperSlider label={tr("ui.rounding_of_the_corners")} value={Math.round(box.radius * 100) / 100} min={0} max={8} step={0.1} onChange={(value) => set({ radius: Math.round(value * 100) / 100 })} />
          </div>
          <div className="weft-field">
            <span>{tr("ui.text_box_padding")}</span>
            <StepperSlider label={tr("ui.text_box_padding")} value={Math.round(box.padding * 100) / 100} min={0} max={10} step={0.1} onChange={(value) => set({ padding: Math.round(value * 100) / 100 })} />
          </div>
        </>
      )}
    </Collapsible>
  );
}

/** A link (LinkBlock): the address it leads to and its text. How it looks is the module's style of interactive elements. */
function LinkEditor({ block, onUpdate }: { block: LinkBlock; onUpdate: BlockPanelProps["onUpdate"] }) {
  const { lang, defaultLang } = useEditingLanguage();
  const url = block.url ?? "";
  const invalidUrl = url.trim() !== "" && url.trim() !== "https://" && safeLinkUrl(url) === null;

  return (
    <Collapsible title={tr("ui.link")} defaultOpen>
      <label className="weft-field">
        <span>{tr("ui.link_address")}</span>
        <input
          value={url}
          placeholder="https://…"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(e) => onUpdate({ url: e.target.value })}
          // What was typed without its scheme ("example.org") is completed when the field is left.
          onBlur={() => {
            const safe = safeLinkUrl(url);
            if (safe && safe !== url) onUpdate({ url: safe });
          }}
        />
      </label>
      {invalidUrl && <p className="weft-placeholder-warning">{tr("ui.link_address_invalid")}</p>}
      <p className="weft-hint">{tr("ui.link_address_hint")}</p>
      <LanguageSelect block={block} />
      <label className="weft-field">
        <span>{tr("ui.link_text")}</span>
        <input value={fieldWording(block, "text", lang, defaultLang)} onChange={(e) => onUpdate(fieldWordingPatch(block, "text", lang, defaultLang, e.target.value))} />
      </label>
    </Collapsible>
  );
}

function ButtonEditor({ block, page, onUpdate }: { block: ButtonBlock; page?: Page; onUpdate: BlockPanelProps["onUpdate"] }) {
  const brightness = useDocumentStore((s) => s.doc.content.brightness);
  const accentColor = useDocumentStore((s) => s.doc.content.accentColor);
  const moduleLook = { brightness, accentColor };
  const look = buttonAppearanceOf(block, moduleLook);
  // Only what is changed is written: the rest stays what the module's look makes of it (the accent colour, say).
  const setLook = (patch: Partial<ButtonAppearance>) => onUpdate({ appearance: { ...block.appearance, ...patch } });

  return (
    <>
      <ButtonActionSection
        page={page}
        clickId={buttonClickNodeId(block.id)}
        action={block.action}
        targetPageId={block.targetPageId}
        effects={block.onClick ?? []}
        onChange={(patch) => onUpdate(patch)}
      />
      <Collapsible title={tr("ui.appearance")}>
        <div className="weft-field">
          <span>{tr("ui.background")}</span>
          <div className="weft-button-look-row">
            <label className="weft-field weft-field-inline">
              <input type="checkbox" checked={look.background === null} onChange={(e) => setLook({ background: e.target.checked ? null : defaultButtonColor(moduleLook) })} />
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

/** The progress bar's panel: which variable it shows (`progress` - how far the learner is - or a number variable), its colours and whether it moves. */
function ProgressEditor({ block, onUpdate }: { block: ProgressBlock; onUpdate: BlockPanelProps["onUpdate"] }) {
  const variables = useDocumentStore((s) => s.doc.content.variables);
  // What can be shown: the virtual `progress`, and the number (and computed) variables of the module - and whatever the block already
  // names, even if that variable has been renamed or removed since (so that the select shows what is stored).
  const names = ["progress", ...variables.filter((v) => v.type === "number" || v.type === "computed").map((v) => v.name)];
  if (!names.includes(block.variable)) names.push(block.variable);
  return (
    <Collapsible title={tr("ui.progress_bar")}>
      <label className="weft-field">
        <span>{tr("ui.progress_variable")}</span>
        <select value={block.variable} onChange={(e) => onUpdate({ variable: e.target.value })}>
          {names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <p className="weft-hint">{tr("ui.progress_variable_hint")}</p>
      <label className="weft-field">
        <span>{tr("ui.progress_color")}</span>
        <ColorField value={block.color} ariaLabel={tr("ui.progress_color")} onChange={(color) => onUpdate({ color })} />
      </label>
      <label className="weft-field">
        <span>{tr("ui.progress_track")}</span>
        <ColorField value={block.trackColor} ariaLabel={tr("ui.progress_track")} onChange={(trackColor) => onUpdate({ trackColor })} />
      </label>
      <label className="weft-field weft-field-inline">
        <input type="checkbox" checked={block.rounded} onChange={(e) => onUpdate({ rounded: e.target.checked })} />
        <span>{tr("ui.progress_rounded")}</span>
      </label>
      <label className="weft-field weft-field-inline">
        <input type="checkbox" checked={block.animate} onChange={(e) => onUpdate({ animate: e.target.checked })} />
        <span>{tr("ui.progress_animate")}</span>
      </label>
      <p className="weft-hint">{tr("ui.progress_animate_hint")}</p>
      <p className="weft-hint">{tr("ui.progress_preview_note")}</p>
    </Collapsible>
  );
}

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
        {(block.shapeKind === "rectangle" || block.shapeKind === "ellipse") && (
          <label className="weft-field weft-field-inline">
            <input type="checkbox" checked={!!block.blurBehind} onChange={(e) => onUpdate({ blurBehind: e.target.checked })} />
            <span>{tr("ui.blur_behind")}</span>
          </label>
        )}
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
    // down to one, which would leave blocks/shape/render.js rendering a solid-looking fill under a "Verlauf"
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
    <div className="weft-quiz-panel-option">
      <div className="weft-quiz-panel-option-row">
        {!openQuestion && (
          <input
            type="checkbox"
            title={tr("ui.correct")}
            checked={block.correctOptionIds.includes(option.id)}
            onChange={(e) => {
              // (Where only one answer can be picked, a right answer is the only one.)
              const correctOptionIds = e.target.checked
                ? block.single
                  ? [option.id]
                  : [...block.correctOptionIds, option.id]
                : block.correctOptionIds.filter((id) => id !== option.id);
              onUpdate({ correctOptionIds });
            }}
          />
        )}
        <span className="weft-quiz-panel-option-row-label">{label}</span>
        <button
          type="button"
          className={"weft-ghost-button weft-quiz-panel-option-effects-toggle" + (count > 0 ? " has-effects" : "")}
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
        <div className="weft-quiz-panel-option-effects">
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

/** The size of the objects of a matching or a sorting puzzle - the share of the block each takes, width and height, 5 to 100 percent: a slider with
 * "−" and "+" (one percent at a time). It is a share, so it stays the same when the whole block is scaled; the objects scale with it. */
function ObjectSizeControl({ title, size, onChange }: { title: string; size: { width: number; height: number }; onChange: (size: { width: number; height: number }) => void }) {
  return (
    <div className="weft-field">
      <span>{title}</span>
      {(["width", "height"] as const).map((dimension) => {
        const label = dimension === "width" ? tr("ui.matching_width") : tr("ui.matching_height");
        const set = (value: number) => onChange({ ...size, [dimension]: Math.min(100, Math.max(5, Math.round(value))) });
        return (
          <label key={dimension} className="weft-field">
            <span>
              {label} ({size[dimension]} %)
            </span>
            <span className="weft-delay-control">
              <button type="button" className="weft-delay-step" aria-label={tr("ui.decrease", { label })} disabled={size[dimension] <= 5} onClick={() => set(size[dimension] - 1)}>
                −
              </button>
              <input type="range" className="weft-delay-slider" min={5} max={100} step={1} value={size[dimension]} onChange={(e) => set(Number(e.target.value))} />
              <button type="button" className="weft-delay-step" aria-label={tr("ui.increase", { label })} disabled={size[dimension] >= 100} onClick={() => set(size[dimension] + 1)}>
                +
              </button>
            </span>
          </label>
        );
      })}
    </div>
  );
}

/** The settings of a matching (MatchingBlock): the cards of both lists (text or picture; which target each object belongs to, or none: a decoy), their
 * sizes, whether they take each other's places at random, whether it is a required task, and what a right and a wrong assignment do - changes to
 * variables - and the way on to the next slide, as with a quiz. The places of the cards are set by moving them on the slide. */
function MatchingEditor({ block, container, page, onUpdate }: { block: MatchingBlock; container: BlockContainerRef; page?: Page; onUpdate: BlockPanelProps["onUpdate"] }) {
  const goesOn = (outcome: "richtig" | "falsch") => !!page?.timeline.ends[quizEndNodeId(block.id, outcome)];
  const variables = useDocumentStore((s) => s.doc.content.variables);
  const { lang, defaultLang } = useEditingLanguage();
  const [error, setError] = useState("");
  const labelOf = (item: MatchItem, index: number) =>
    matchingItemText(block, item, lang, defaultLang).trim() || (item.kind === "image" ? tr("ui.matching_kind_image") : tr("ui.matching_target_n", { n: index + 1 }));

  const withItem = (side: "sources" | "targets", id: string, patch: Partial<MatchItem>) => ({
    [side]: block[side].map((item) => (item.id === id ? { ...item, ...patch } : item)),
  });
  function addItem(side: "sources" | "targets") {
    const size = side === "sources" ? block.sourceSize : block.targetSize;
    const index = block[side].length;
    // Below the last one, and, where that no longer fits, in a new column to the right.
    const rows = Math.max(1, Math.floor(100 / (size.height + 4)));
    const column = Math.floor(index / rows);
    const x = Math.min(100 - size.width, (side === "sources" ? 3 : 55) + column * (size.width + 3));
    const y = Math.min(100 - size.height, 4 + (index % rows) * (size.height + 4));
    const item: MatchItem = { id: createId(), kind: "text", text: side === "sources" ? tr("ui.matching_add_source") : tr("ui.matching_add_target"), x, y };
    onUpdate({ [side]: [...block[side], item] });
  }
  function removeItem(side: "sources" | "targets", id: string) {
    const pairs = Object.fromEntries(Object.entries(block.pairs).filter(([source, target]) => source !== id && target !== id));
    const translations = block.translations
      ? Object.fromEntries(Object.entries(block.translations).map(([language, t]) => [language, t.items ? { ...t, items: Object.fromEntries(Object.entries(t.items).filter(([key]) => key !== id)) } : t]))
      : undefined;
    onUpdate({ [side]: block[side].filter((item) => item.id !== id), pairs, ...(translations ? { translations } : {}) });
  }
  function setBelongsTo(sourceId: string, targetId: string) {
    const pairs = { ...block.pairs };
    if (targetId === "") delete pairs[sourceId];
    else pairs[sourceId] = targetId;
    onUpdate({ pairs });
  }
  async function chooseImage(itemId: string, file: File) {
    setError("");
    try {
      await setMatchingImage(container, block.id, itemId, file);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const itemRows = (side: "sources" | "targets") =>
    block[side].map((item) => (
      <div key={item.id} className="weft-matching-row">
        <div className="weft-matching-row-head">
          <select
            value={item.kind}
            aria-label={tr("ui.matching_item_kind")}
            onChange={(e) => onUpdate(withItem(side, item.id, { kind: e.target.value as MatchItem["kind"] }))}
          >
            <option value="text">{tr("ui.matching_kind_text")}</option>
            <option value="image">{tr("ui.matching_kind_image")}</option>
          </select>
          <button type="button" className="weft-icon-button" title={tr("ui.matching_remove_item")} aria-label={tr("ui.matching_remove_item")} onClick={() => removeItem(side, item.id)}>
            ×
          </button>
        </div>
        {item.kind === "text" ? (
          <input
            value={matchingItemText(block, item, lang, defaultLang)}
            aria-label={tr("ui.matching_item_text")}
            onChange={(e) => onUpdate(matchingItemTextPatch(block, item.id, lang, defaultLang, e.target.value))}
          />
        ) : (
          <>
            <input
              value={matchingItemText(block, item, lang, defaultLang)}
              placeholder={tr("ui.matching_item_alt")}
              aria-label={tr("ui.matching_item_alt")}
              onChange={(e) => onUpdate(matchingItemTextPatch(block, item.id, lang, defaultLang, e.target.value))}
            />
            <label className="weft-ghost-button weft-full-width weft-matching-file">
              {item.assetId ? tr("ui.matching_change_image") : tr("ui.matching_choose_image")}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void chooseImage(item.id, file);
                }}
              />
            </label>
            {!item.assetId && <p className="weft-hint">{tr("ui.matching_no_image")}</p>}
          </>
        )}
        {side === "sources" && (
          <label className="weft-field">
            <span>{tr("ui.matching_belongs_to")}</span>
            <select value={block.pairs[item.id] ?? ""} onChange={(e) => setBelongsTo(item.id, e.target.value)}>
              <option value="">{tr("ui.matching_belongs_to_none")}</option>
              {block.targets.map((target, i) => (
                <option key={target.id} value={target.id}>
                  {labelOf(target, i)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    ));

  const sizeFields = (key: "sourceSize" | "targetSize", title: string) => (
    <ObjectSizeControl title={title} size={block[key]} onChange={(size) => onUpdate({ [key]: size })} />
  );

  return (
    <>
      <Collapsible title={tr("ui.matching")}>
        <p className="weft-hint">{tr("ui.matching_hint")}</p>
        <LanguageSelect block={block} />
        <label className="weft-field weft-field-inline">
          <input type="checkbox" checked={block.shuffle === true} onChange={(e) => onUpdate({ shuffle: e.target.checked ? true : undefined })} />
          <span>{tr("ui.matching_shuffle")}</span>
        </label>
        {block.shuffle && <p className="weft-hint">{tr("ui.matching_shuffle_hint")}</p>}
        <label className="weft-field weft-field-inline">
          <input type="checkbox" checked={block.required === true} onChange={(e) => onUpdate({ required: e.target.checked ? true : undefined })} />
          <span>{tr("ui.required_task")}</span>
        </label>
        {block.required && <p className="weft-hint">{tr("ui.required_task_hint")}</p>}
      </Collapsible>
      <Collapsible title={tr("ui.matching_sources")} defaultOpen>
        {itemRows("sources")}
        <button type="button" className="weft-ghost-button weft-full-width" onClick={() => addItem("sources")}>
          {tr("ui.matching_add_source")}
        </button>
        {sizeFields("sourceSize", tr("ui.matching_size_sources"))}
      </Collapsible>
      <Collapsible title={tr("ui.matching_targets")} defaultOpen>
        {itemRows("targets")}
        <button type="button" className="weft-ghost-button weft-full-width" onClick={() => addItem("targets")}>
          {tr("ui.matching_add_target")}
        </button>
        {sizeFields("targetSize", tr("ui.matching_size_targets"))}
        {error && <p className="weft-placeholder-warning">{error}</p>}
      </Collapsible>
      <Collapsible title={tr("ui.matching_each_correct")} defaultOpen={false}>
        <EffectListEditor effects={block.onEachCorrect} variables={variables} onChange={(onEachCorrect) => onUpdate({ onEachCorrect })} />
      </Collapsible>
      <Collapsible title={tr("ui.matching_each_wrong")} defaultOpen={false}>
        <EffectListEditor effects={block.onEachWrong} variables={variables} onChange={(onEachWrong) => onUpdate({ onEachWrong })} />
      </Collapsible>
      <Collapsible title={tr("ui.matching_all_correct")} defaultOpen={false}>
        <EffectListEditor effects={block.onCorrect} variables={variables} onChange={(onCorrect) => onUpdate({ onCorrect })} />
        <label className="weft-field weft-field-inline">
          <input type="checkbox" checked={goesOn("richtig")} disabled={!page} onChange={(e) => page && setQuizAdvance(page.id, block.id, "richtig", e.target.checked)} />
          <span>{tr("ui.continue_to_the_next_slide")}</span>
        </label>
        {goesOn("richtig") && <p className="weft-hint">{tr("ui.happens_1_5_seconds_after_correct")}</p>}
      </Collapsible>
      <Collapsible title={tr("ui.matching_not_all_correct")} defaultOpen={false}>
        <EffectListEditor effects={block.onIncorrect} variables={variables} onChange={(onIncorrect) => onUpdate({ onIncorrect })} />
        <label className="weft-field weft-field-inline">
          <input type="checkbox" checked={goesOn("falsch")} disabled={!page} onChange={(e) => page && setQuizAdvance(page.id, block.id, "falsch", e.target.checked)} />
          <span>{tr("ui.continue_to_the_next_slide")}</span>
        </label>
        {goesOn("falsch") && <p className="weft-hint">{tr("ui.happens_1_5_seconds_after_the")}</p>}
      </Collapsible>
    </>
  );
}

/** The settings of a sorting puzzle (SortBlock): the objects (text or picture) in their RIGHT order - the learner sees them mixed up -, the
 * direction of the line and the words at its two ends, the size of an object, whether it is a required task, and what the submission, every
 * mistake and a right / wrong order do - changes to variables - and the way on to the next slide, as with a quiz. */
function SortEditor({ block, container, page, onUpdate }: { block: SortBlock; container: BlockContainerRef; page?: Page; onUpdate: BlockPanelProps["onUpdate"] }) {
  const goesOn = (outcome: "richtig" | "falsch") => !!page?.timeline.ends[quizEndNodeId(block.id, outcome)];
  const variables = useDocumentStore((s) => s.doc.content.variables);
  const { lang, defaultLang } = useEditingLanguage();
  const [error, setError] = useState("");
  const vertical = block.orientation !== "horizontal";

  const withItem = (id: string, patch: Partial<SortItem>) => ({ items: block.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  function addItem() {
    onUpdate({ items: [...block.items, { id: createId(), kind: "text", text: tr("ui.sort_add_item") }] });
  }
  function removeItem(id: string) {
    const translations = block.translations
      ? Object.fromEntries(Object.entries(block.translations).map(([language, t]) => [language, t.items ? { ...t, items: Object.fromEntries(Object.entries(t.items).filter(([key]) => key !== id)) } : t]))
      : undefined;
    onUpdate({ items: block.items.filter((item) => item.id !== id), ...(translations ? { translations } : {}) });
  }
  function move(index: number, step: -1 | 1) {
    const items = [...block.items];
    const to = index + step;
    if (to < 0 || to >= items.length) return;
    [items[index], items[to]] = [items[to], items[index]];
    onUpdate({ items });
  }
  // A line that runs the other way wants objects of another shape: the size follows, as long as it is still the one the other direction has.
  function setOrientation(orientation: "vertical" | "horizontal") {
    const sizeOf = (o: "vertical" | "horizontal") => (o === "vertical" ? { width: 60, height: 14 } : { width: 20, height: 60 });
    const current = block.itemSize;
    const other = sizeOf(orientation === "vertical" ? "horizontal" : "vertical");
    const itemSize = current.width === other.width && current.height === other.height ? sizeOf(orientation) : current;
    onUpdate({ orientation, itemSize });
  }
  async function chooseImage(itemId: string, file: File) {
    setError("");
    try {
      await setSortImage(container, block.id, itemId, file);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <Collapsible title={tr("ui.sort")}>
        <p className="weft-hint">{tr("ui.sort_hint")}</p>
        <LanguageSelect block={block} />
        <label className="weft-field">
          <span>{tr("ui.sort_orientation")}</span>
          <select value={vertical ? "vertical" : "horizontal"} onChange={(e) => setOrientation(e.target.value as "vertical" | "horizontal")}>
            <option value="vertical">{tr("ui.sort_vertical")}</option>
            <option value="horizontal">{tr("ui.sort_horizontal")}</option>
          </select>
        </label>
        <label className="weft-field">
          <span>{tr("ui.sort_start_label")}</span>
          <input value={sortLabel(block, "start", lang, defaultLang)} onChange={(e) => onUpdate(sortLabelPatch(block, "start", lang, defaultLang, e.target.value))} />
        </label>
        <label className="weft-field">
          <span>{tr("ui.sort_end_label")}</span>
          <input value={sortLabel(block, "end", lang, defaultLang)} onChange={(e) => onUpdate(sortLabelPatch(block, "end", lang, defaultLang, e.target.value))} />
        </label>
        <ObjectSizeControl title={tr("ui.sort_size")} size={block.itemSize} onChange={(itemSize) => onUpdate({ itemSize })} />
        <label className="weft-field weft-field-inline">
          <input type="checkbox" checked={block.required === true} onChange={(e) => onUpdate({ required: e.target.checked ? true : undefined })} />
          <span>{tr("ui.required_task")}</span>
        </label>
        {block.required && <p className="weft-hint">{tr("ui.required_task_hint")}</p>}
      </Collapsible>
      <Collapsible title={tr("ui.sort_items")} defaultOpen>
        {block.items.map((item, index) => (
          <div key={item.id} className="weft-matching-row">
            <div className="weft-matching-row-head">
              <select value={item.kind} aria-label={tr("ui.matching_item_kind")} onChange={(e) => onUpdate(withItem(item.id, { kind: e.target.value as SortItem["kind"] }))}>
                <option value="text">{tr("ui.matching_kind_text")}</option>
                <option value="image">{tr("ui.matching_kind_image")}</option>
              </select>
              <button type="button" className="weft-icon-button" title={tr("ui.sort_move_up")} aria-label={tr("ui.sort_move_up")} disabled={index === 0} onClick={() => move(index, -1)}>
                ↑
              </button>
              <button type="button" className="weft-icon-button" title={tr("ui.sort_move_down")} aria-label={tr("ui.sort_move_down")} disabled={index === block.items.length - 1} onClick={() => move(index, 1)}>
                ↓
              </button>
              <button type="button" className="weft-icon-button" title={tr("ui.matching_remove_item")} aria-label={tr("ui.matching_remove_item")} onClick={() => removeItem(item.id)}>
                ×
              </button>
            </div>
            <input
              value={sortItemText(block, item, lang, defaultLang)}
              placeholder={item.kind === "image" ? tr("ui.matching_item_alt") : undefined}
              aria-label={item.kind === "image" ? tr("ui.matching_item_alt") : tr("ui.matching_item_text")}
              onChange={(e) => onUpdate(sortItemTextPatch(block, item.id, lang, defaultLang, e.target.value))}
            />
            {item.kind === "image" && (
              <>
                <label className="weft-ghost-button weft-full-width weft-matching-file">
                  {item.assetId ? tr("ui.matching_change_image") : tr("ui.matching_choose_image")}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void chooseImage(item.id, file);
                    }}
                  />
                </label>
                {!item.assetId && <p className="weft-hint">{tr("ui.matching_no_image")}</p>}
              </>
            )}
          </div>
        ))}
        <button type="button" className="weft-ghost-button weft-full-width" onClick={addItem}>
          {tr("ui.sort_add_item")}
        </button>
        {error && <p className="weft-placeholder-warning">{error}</p>}
      </Collapsible>
      <Collapsible title={tr("ui.sort_on_submit")} defaultOpen={false}>
        <p className="weft-hint">{tr("ui.sort_on_submit_hint")}</p>
        <EffectListEditor effects={block.onSubmit} variables={variables} onChange={(onSubmit) => onUpdate({ onSubmit })} />
      </Collapsible>
      <Collapsible title={tr("ui.sort_each_error")} defaultOpen={false}>
        <p className="weft-hint">{tr("ui.sort_each_error_hint")}</p>
        <EffectListEditor effects={block.onEachError} variables={variables} onChange={(onEachError) => onUpdate({ onEachError })} />
      </Collapsible>
      <Collapsible title={tr("ui.sort_all_correct")} defaultOpen={false}>
        <EffectListEditor effects={block.onCorrect} variables={variables} onChange={(onCorrect) => onUpdate({ onCorrect })} />
        <label className="weft-field weft-field-inline">
          <input type="checkbox" checked={goesOn("richtig")} disabled={!page} onChange={(e) => page && setQuizAdvance(page.id, block.id, "richtig", e.target.checked)} />
          <span>{tr("ui.continue_to_the_next_slide")}</span>
        </label>
        {goesOn("richtig") && <p className="weft-hint">{tr("ui.happens_1_5_seconds_after_correct")}</p>}
      </Collapsible>
      <Collapsible title={tr("ui.sort_not_all_correct")} defaultOpen={false}>
        <EffectListEditor effects={block.onIncorrect} variables={variables} onChange={(onIncorrect) => onUpdate({ onIncorrect })} />
        <label className="weft-field weft-field-inline">
          <input type="checkbox" checked={goesOn("falsch")} disabled={!page} onChange={(e) => page && setQuizAdvance(page.id, block.id, "falsch", e.target.checked)} />
          <span>{tr("ui.continue_to_the_next_slide")}</span>
        </label>
        {goesOn("falsch") && <p className="weft-hint">{tr("ui.happens_1_5_seconds_after_the")}</p>}
      </Collapsible>
    </>
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
        {!block.open && (
          <label className="weft-field weft-field-inline">
            <input
              type="checkbox"
              checked={block.single === true}
              // (Only one answer can be right then: the first of those marked stays.)
              onChange={(e) => onUpdate(e.target.checked ? { single: true, correctOptionIds: block.correctOptionIds.slice(0, 1) } : { single: undefined })}
            />
            <span>{tr("ui.quiz_single")}</span>
          </label>
        )}
        {block.single && !block.open && <p className="weft-hint">{tr("ui.quiz_single_hint")}</p>}
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
        <label className="weft-field weft-field-inline">
          <input type="checkbox" checked={block.required === true} onChange={(e) => onUpdate({ required: e.target.checked ? true : undefined })} />
          <span>{tr("ui.required_task")}</span>
        </label>
        {block.required && <p className="weft-hint">{tr("ui.required_task_hint")}</p>}
        {block.required && block.options.length > 0 && <p className="weft-hint">{tr("ui.quiz_required_hint")}</p>}
      </Collapsible>

      <Collapsible title={tr("ui.quiz_explanation")} defaultOpen={quizExplanation(block, lang, defaultLang).trim() !== ""}>
        <p className="weft-hint">{tr("ui.quiz_explanation_hint")}</p>
        <LanguageSelect block={block} />
        <textarea
          rows={4}
          aria-label={tr("ui.quiz_explanation")}
          value={quizExplanation(block, lang, defaultLang)}
          onChange={(e) => onUpdate(quizExplanationPatch(block, lang, defaultLang, e.target.value))}
        />
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
