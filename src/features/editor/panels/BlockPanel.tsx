import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import pauseIconSvg from "../../../../mockups/icons/pause.svg?raw";
import { CODE_THEMES } from "../../../core/code/codeThemes";
import { AUTO_LANGUAGE, CODE_LANGUAGES } from "../../../core/code/highlight";
import { createId } from "../../../core/id";
import { addCustomFont, setEventTrigger } from "../../../core/document/actions";
import type { VideoUploadResult } from "../../../core/document/actions";
import { blockEffectNodeId, getBlockEntranceTrigger, getBlockExitTrigger } from "../../../core/document/pageTimeline";
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
  ButtonBlock,
  CodeBlock,
  IframeBlock,
  ImageBlock,
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
import { listPageTriggerEvents } from "../Timeline";
import { FontSelect } from "./FontSelect";
import type { FontSelectGroup } from "./FontSelect";
import { usePlaceholderProblems } from "../blocks/usePlaceholderProblems";
import { buttonText, buttonTextPatch, quizOptionHtml } from "../../../core/document/translations";
import { useEditingLanguage } from "../useEditingLanguage";
import { LanguageSelect } from "./LanguageSelect";
import { TexEditor } from "./TexEditor";
import { TriggerPicker } from "./TriggerPicker";

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
      {(block.kind === "text" || block.kind === "quiz") && <TextEditor block={block.kind === "text" ? block : undefined} onUpdate={onUpdate} />}
      {block.kind === "code" && <CodeEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "tex" && <TexEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "image" && <ImageEditor block={block} onUpdate={onUpdate} onSetImage={onSetImage} />}
      {block.kind === "video" && <VideoEditor block={block} onUpdate={onUpdate} onSetVideo={onSetVideo} />}
      {block.kind === "iframe" && <IframeEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "button" && <ButtonEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "quiz" && <QuizEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "shape" && <ShapeEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "arrow" && <ArrowEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "files" && <FilesEditor key={block.id} block={block} container={container} onUpdate={onUpdate} />}
      {page && (
        <>
          <BlockEffectEditor
            key={block.id + "-entrance"}
            title="Aufbau"
            page={page}
            targetNodeId={blockEffectNodeId(block.id, "entrance")}
            effect={block.entranceEffect}
            trigger={getBlockEntranceTrigger(page, block)}
            events={triggerEvents}
            onEffectChange={(entranceEffect) => onUpdate({ entranceEffect })}
            onTriggerChange={(from, delayMs, kind) =>
              setEventTrigger(page.id, blockEffectNodeId(block.id, "entrance"), from, delayMs, kind)
            }
          />
          <BlockEffectEditor
            key={block.id + "-exit"}
            title="Abbau"
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
      <PositionCollapsible block={block} onUpdate={onUpdate} />
    </>
  );
}

const BLOCK_EFFECT_DIRECTIONS: TransitionDirection[] = ["right", "left", "down", "up"];

// "off" is listed separately (its label depends on Aufbau/Abbau, see BlockEffectEditor).
const BLOCK_EFFECT_LABELS: Record<Exclude<BlockEffectType, "off">, { entrance: string; exit: string }> = {
  none: { entrance: "Keine Animation", exit: "Keine Animation" },
  fade: { entrance: "Fade", exit: "Fade" },
  move: { entrance: "Move", exit: "Move" },
  iris: { entrance: "Irisblende", exit: "Irisblende" },
  wipe: { entrance: "Wischen", exit: "Wischen" },
  anvil: { entrance: "Amboss", exit: "Amboss (nach oben weg)" },
  blur: { entrance: "Weichzeichnen", exit: "Weichzeichnen" },
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
  onEffectChange,
  onTriggerChange,
}: {
  title: string;
  page: Page;
  targetNodeId: string;
  effect: BlockEffect;
  trigger: ResolvedTrigger | null;
  events: { id: string; label: string }[];
  onEffectChange: (effect: BlockEffect) => void;
  onTriggerChange: (from: string | null, delayMs: number, kind: TimelineEdgeKind) => void;
}) {
  const phase = title === "Aufbau" ? "entrance" : "exit";
  const offLabel = phase === "entrance" ? "Kein Aufbau" : "Kein Abbau";
  return (
    <Collapsible title={title} defaultOpen={effect.type !== "off"}>
      <label className="weft-field">
        <span>Art</span>
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
            <label className="weft-field">
              <span>Dauer (Sekunden)</span>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={effect.durationMs / 1000}
                onChange={(e) => {
                  const seconds = Number(e.target.value);
                  if (!Number.isFinite(seconds) || seconds <= 0) return;
                  onEffectChange({ ...effect, durationMs: Math.round(seconds * 1000) });
                }}
              />
            </label>
          )}
          {effect.type === "wipe" && (
            <label className="weft-field">
              <span>Wischrichtung</span>
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
          <TriggerPicker
            page={page}
            targetNodeId={targetNodeId}
            trigger={trigger}
            options={events}
            allowNoTrigger={false}
            noTriggerLabel=""
            onChange={onTriggerChange}
          />
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
  const { x, y, width, height, rotation } = block.position;
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
        <span>Breite</span>
        <input type="number" value={round3(width)} onChange={(e) => updateWidth(Number(e.target.value))} />
      </label>
      <label>
        <span>Höhe</span>
        <input type="number" value={round3(height)} onChange={(e) => updateHeight(Number(e.target.value))} />
      </label>
      <label className="weft-field-grid-full">
        <span>Drehung °</span>
        <input
          type="number"
          min={0}
          max={360}
          value={round3(rotation ?? 0)}
          onChange={(e) => {
            const clamped = Math.min(360, Math.max(0, Number(e.target.value)));
            onUpdate({ position: { ...block.position, rotation: clamped } });
          }}
        />
      </label>
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
function TextEditor({ block, onUpdate }: { block?: TextBlock; onUpdate: BlockPanelProps["onUpdate"] }) {
  const snapshot = useFormatSnapshot();
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
  const colorKey = snapshot.color === "mixed" ? "mixed" : snapshot.color;
  const fontGroups: FontSelectGroup[] = [
    { options: [{ value: DEFAULT_FONT_FAMILY, label: DEFAULT_FONT_FAMILY, previewFamily: DEFAULT_FONT_FAMILY }] },
    ...(customFonts.length > 0
      ? [
          {
            label: "Eigene Schriften",
            options: customFonts.map((font) => ({ value: font.family, label: font.family, previewFamily: font.family })),
          },
        ]
      : []),
    {
      label: "Schriften (im Export enthalten)",
      options: sortedOtherFonts.map((family) => ({ value: family, label: family, previewFamily: family })),
    },
    { options: [{ value: UPLOAD_FONT_VALUE, label: "Eigene Schriftart hochladen …" }] },
  ];

  return (
    <Collapsible title="Inhalt">
      {block && <LanguageSelect block={block} />}
      <p className="weft-hint">Text direkt auf der Folie eingeben. Markierten Text hier formatieren.</p>
      <div className="weft-format-toolbar" data-weft-format-control>
        <div className="weft-format-row">
          <button
            type="button"
            className={formatButtonClass(snapshot.bold)}
            title="Fett"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat("bold")}
          >
            <strong>F</strong>
          </button>
          <button
            type="button"
            className={formatButtonClass(snapshot.italic)}
            title="Kursiv"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat("italic")}
          >
            <em>K</em>
          </button>
          <button
            type="button"
            className={formatButtonClass(snapshot.underline)}
            title="Unterstrichen"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat("underline")}
          >
            <span style={{ textDecoration: "underline" }}>U</span>
          </button>
          <span className="weft-format-divider" />
          <button
            type="button"
            className={"weft-format-button" + (snapshot.align === "left" ? " is-active" : "")}
            title="Linksbündig"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat("justifyLeft")}
          >
            ⇤
          </button>
          <button
            type="button"
            className={"weft-format-button" + (snapshot.align === "center" ? " is-active" : "")}
            title="Zentriert"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat("justifyCenter")}
          >
            ↔
          </button>
          <button
            type="button"
            className={"weft-format-button" + (snapshot.align === "right" ? " is-active" : "")}
            title="Rechtsbündig"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyFormat("justifyRight")}
          >
            ⇥
          </button>
        </div>

        <label className="weft-field">
          <span>Schriftart</span>
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
            <span>Schriftgröße</span>
            <div className="weft-stepper">
              <button
                type="button"
                className="weft-format-button"
                title="Kleiner"
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
                placeholder={snapshot.fontSizePx === "mixed" ? "Verschiedene" : "24"}
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
                title="Größer"
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
            <span>Farbe</span>
            <input
              key={colorKey}
              type="color"
              defaultValue={snapshot.color === "mixed" || !snapshot.color ? "#000000" : snapshot.color}
              onChange={(e) => applyFormat("foreColor", e.target.value)}
            />
          </label>
        </div>
      </div>
      {block && (
        <>
          <label className="weft-field weft-field-inline">
            <input
              type="checkbox"
              checked={!!block.scrollable}
              onChange={(e) => onUpdate({ scrollable: e.target.checked })}
            />
            <span>Scrollbar</span>
          </label>
          <p className="weft-hint">
            Zu langer Text lässt sich dann senkrecht scrollen. Ohne diese Option wird er am Rand des Blocks
            abgeschnitten.
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
    <Collapsible title="Inhalt">
      <label className="weft-field">
        <span>Bilddatei</span>
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
        <span>Alt-Text</span>
        <input value={block.alt} onChange={(e) => onUpdate({ alt: e.target.value })} />
      </label>
    </Collapsible>
  );
}

function CodeEditor({ block, onUpdate }: { block: CodeBlock; onUpdate: BlockPanelProps["onUpdate"] }) {
  return (
    <Collapsible title="Code">
      <p className="weft-hint">Code direkt auf der Folie eingeben. Mit Tab wird eingerückt.</p>
      <label className="weft-field">
        <span>Sprache</span>
        <select value={block.language} onChange={(e) => onUpdate({ language: e.target.value })}>
          <option value={AUTO_LANGUAGE}>Automatisch erkennen</option>
          {CODE_LANGUAGES.map((language) => (
            <option key={language.id} value={language.id}>
              {language.label}
            </option>
          ))}
        </select>
      </label>
      <label className="weft-field">
        <span>Design</span>
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
        <span>Transparenter Hintergrund</span>
      </label>
      <label className="weft-field">
        <span>Schriftgröße</span>
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
  const [stopPointDialogOpen, setStopPointDialogOpen] = useState(false);
  return (
    <>
      <Collapsible title="Inhalt">
        <label className="weft-field">
          <span>Videodatei</span>
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
            „{transcode.fileName}“ wird nach H.264 konvertiert
            {transcode.progress !== null ? ` … ${Math.round(transcode.progress * 100)}%` : " …"}
          </p>
        )}
        <p className="weft-hint">
          Am besten MP4 (H.264/AAC) verwenden. Ein Video in einem anderen Format oder Codec (z. B. HEVC/H.265 aus
          einem iPhone-Export) wird automatisch nach H.264 konvertiert, sofern ffmpeg installiert ist - sonst
          erscheint ein Hinweis mit Installationsanleitung.
        </p>

        <label className="weft-field weft-field-inline">
          <input type="checkbox" checked={block.controls} onChange={(e) => onUpdate({ controls: e.target.checked })} />
          <span>Steuerelemente anzeigen</span>
        </label>
        <label className="weft-field weft-field-inline">
          <input type="checkbox" checked={block.loop} onChange={(e) => onUpdate({ loop: e.target.checked })} />
          <span>Endlosschleife</span>
        </label>
        <label className="weft-field weft-field-inline">
          <input
            type="checkbox"
            checked={block.muted}
            disabled={block.autoplay}
            onChange={(e) => onUpdate({ muted: e.target.checked })}
          />
          <span>Stumm</span>
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
          <span>Automatisch abspielen (nur stumm möglich)</span>
        </label>
      </Collapsible>

      <Collapsible title="Stoppunkte" defaultOpen={false}>
        <p className="weft-hint">
          Ein Stoppunkt pausiert das Video an einer bestimmten Stelle, um dort z. B. Text oder ein Quiz zu zeigen.
        </p>
        {block.stopPoints.length > 0 && (
          <p className="weft-hint">
            {block.stopPoints.length} Stoppunkt{block.stopPoints.length === 1 ? "" : "e"} angelegt.
          </p>
        )}
        <button
          type="button"
          className="weft-ghost-button weft-full-width"
          disabled={!block.assetId}
          onClick={() => setStopPointDialogOpen(true)}
        >
          + Stoppunkt hinzufügen
        </button>
        {!block.assetId && <p className="weft-hint">Zuerst eine Videodatei auswählen.</p>}
      </Collapsible>

      {stopPointDialogOpen && block.assetId && (
        <VideoStopPointDialog block={block} assetId={block.assetId} onUpdate={onUpdate} onClose={() => setStopPointDialogOpen(false)} />
      )}
    </>
  );
}


/**
 * Opened from VideoEditor's "+ Stoppunkt hinzufügen" - the video plays here full-size (native
 * controls, so scrubbing/volume/fullscreen all work for free) instead of the small, inert canvas
 * preview; "Stoppunkt erstellen" reads the <video>'s own currentTime rather than needing a
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
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [selectedStopPointId, setSelectedStopPointId] = useState<string | null>(null);

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
    <div className="weft-modal-backdrop" onClick={onClose}>
      <div className="weft-modal" onClick={(e) => e.stopPropagation()}>
        <div className="weft-modal-header">
          <h3>Stoppunkte</h3>
          <button type="button" className="weft-icon-button" title="Schließen" onClick={onClose}>
            ×
          </button>
        </div>

        <video
          ref={videoRef}
          src={getObjectUrl(assetId)}
          controls
          className="weft-stop-point-video"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        />

        <div className="weft-format-row">
          <button type="button" className="weft-ghost-button" onClick={() => videoRef.current?.pause()}>
            Pausieren
          </button>
          <button type="button" className="weft-primary-button" onClick={addStopPointHere}>
            Stoppunkt erstellen
          </button>
        </div>

        {block.stopPoints.length > 0 && (
          <div className="weft-stop-point-track">
            {block.stopPoints.map((sp) => (
              <button
                key={sp.id}
                type="button"
                className={"weft-timeline-node-icon weft-stop-point-marker" + (sp.id === selectedStopPointId ? " is-selected" : "")}
                style={{ left: `${duration > 0 ? (sp.timeSeconds / duration) * 100 : 0}%` }}
                title={formatTimeMMSS(sp.timeSeconds)}
                onClick={() => setSelectedStopPointId((current) => (current === sp.id ? null : sp.id))}
                dangerouslySetInnerHTML={{ __html: pauseIconSvg }}
              />
            ))}
          </div>
        )}

        {selectedStopPoint && (
          <div className="weft-stop-point-settings">
            <p className="weft-stop-point-settings-title">Stoppunkt bei {formatTimeMMSS(selectedStopPoint.timeSeconds)}</p>
            <label className="weft-field weft-field-inline">
              <input
                type="checkbox"
                checked={selectedStopPoint.stopsVideo}
                onChange={(e) => updateStopPoint(selectedStopPoint.id, { stopsVideo: e.target.checked })}
              />
              <span>Video hier stoppen</span>
            </label>
            {!selectedStopPoint.stopsVideo && <p className="weft-hint">Das Video läuft an dieser Stelle einfach weiter.</p>}
            <button type="button" className="weft-ghost-button" onClick={() => removeStopPoint(selectedStopPoint.id)}>
              Stoppunkt entfernen
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

const DEFAULT_VIEWPORT_WIDTH = 768;

const VIEWPORT_WIDTH_PRESETS: { label: string; width: number }[] = [
  { label: "Mobil", width: 375 },
  { label: "Tablet", width: DEFAULT_VIEWPORT_WIDTH },
  { label: "Desktop", width: 1280 },
];

// The embedded page always sees a fixed virtual viewport width (see IframeFrame in
// BlockView.tsx) rather than whatever pixel size the block happens to render at - there's no
// "off" state for this any more, since a predictable, chosen width is strictly better than a
// size that silently drifts with how large the module itself is displayed.
function IframeEditor({ block, onUpdate }: { block: IframeBlock; onUpdate: BlockPanelProps["onUpdate"] }) {
  const forcedViewportWidth = block.forcedViewportWidth ?? DEFAULT_VIEWPORT_WIDTH;
  return (
    <Collapsible title="Inhalt">
      <label className="weft-field">
        <span>URL (z. B. YouTube-Embed oder ein anderes interaktives Tool)</span>
        <input value={block.url} onChange={(e) => onUpdate({ url: e.target.value })} />
      </label>
      <label className="weft-field">
        <span>Virtuelle Breite (px)</span>
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

      <span className="weft-subgroup-label">Sandbox-Rechte</span>
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
        <span>allow (Permissions Policy, z. B. "autoplay; fullscreen")</span>
        <input value={block.allow ?? ""} onChange={(e) => onUpdate({ allow: e.target.value })} />
      </label>

      <label className="weft-field weft-field-inline">
        <input type="checkbox" checked={block.qrCode} onChange={(e) => onUpdate({ qrCode: e.target.checked })} />
        <span>Erst QR-Code zeigen, per Klick auf die Adresse einblenden</span>
      </label>
      {block.qrCode && (
        <label className="weft-field">
          <span>Alternative Adresse für die Präsentation (optional)</span>
          <input
            value={block.presentationUrl ?? ""}
            placeholder={block.url}
            onChange={(e) => onUpdate({ presentationUrl: e.target.value || undefined })}
          />
          <span className="weft-hint">
            Der QR-Code verlinkt weiterhin auf die URL oben. Ist hier eine andere Adresse eingetragen, wird nach dem
            Klick diese statt der gescannten URL angezeigt – z. B. die Ergebnisse einer Umfrage, an der man
            per QR-Code teilnimmt.
          </span>
        </label>
      )}
    </Collapsible>
  );
}

function ButtonEditor({ block, onUpdate }: { block: ButtonBlock; onUpdate: BlockPanelProps["onUpdate"] }) {
  const { lang, defaultLang } = useEditingLanguage();
  return (
    <Collapsible title="Inhalt">
      <LanguageSelect block={block} />
      <label className="weft-field">
        <span>Text</span>
        <input
          value={buttonText(block, lang, defaultLang)}
          onChange={(e) => onUpdate(buttonTextPatch(block, lang, defaultLang, e.target.value))}
        />
      </label>
      <label className="weft-field">
        <span>Aktion</span>
        <select value={block.action} onChange={(e) => onUpdate({ action: e.target.value as ButtonBlock["action"] })}>
          <option value="advance">Weiter</option>
          <option value="next">Nächste Folie</option>
          <option value="prev">Vorherige Folie</option>
        </select>
      </label>
      {block.action === "advance" && (
        <p className="weft-hint">
          Zeigt zuerst noch wartende, auf „Weiter" wartende Aufbauten dieser Folie - erst wenn keine mehr warten,
          geht es zur nächsten Folie. Genau wie Leertaste/Pfeil rechts.
        </p>
      )}
      {block.action === "next" && (
        <p className="weft-hint">Springt sofort zur nächsten Folie, unabhängig von noch wartenden Aufbauten.</p>
      )}
      {block.action === "prev" && (
        <p className="weft-hint">
          Auf der ersten Folie automatisch deaktiviert – der Player merkt sich dazu den bisherigen Lernpfad.
        </p>
      )}
    </Collapsible>
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
    <Collapsible title="Dateien">
      <label className="weft-field">
        <span>Überschrift</span>
        <input value={block.title} placeholder="Dateien" onChange={(e) => onUpdate({ title: e.target.value })} />
      </label>
      {block.files.length > 0 && (
        <ul className="weft-files-editor-list">
          {block.files.map((file) => (
            <li key={file.id}>
              <span className="weft-files-editor-name" title={file.name}>
                {file.name}
              </span>
              <span className="weft-hint">{formatFileSize(file.size)}</span>
              <button type="button" className="weft-icon-button" title="Entfernen" onClick={() => removeFileFromBlock(container, block.id, file.id)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="weft-ghost-button weft-full-width" disabled={busy || !canEdit} onClick={() => void addFiles()}>
        + Dateien hinzufügen
      </button>
      {!canEdit && <p className="weft-hint">Zum Hinzufügen erst das Passwort eingeben (unten).</p>}

      <div className="weft-divider" />
      {!protectedBlock && (
        <>
          <label className="weft-field">
            <span>Passwortschutz (optional)</span>
            <input type="password" autoComplete="off" value={password} placeholder="Passwort" onChange={(e) => setPassword(e.target.value)} />
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
            Mit Passwort schützen
          </button>
          <p className="weft-hint">
            Die Dateien werden dann verschlüsselt (AES-256) im Lernmodul abgelegt und erscheinen erst nach Eingabe des Passworts.
            Das Passwort wird nirgends gespeichert - ohne es sind die Dateien nicht wiederherzustellen.
          </p>
        </>
      )}
      {protectedBlock && unlocked === null && (
        <>
          <p className="weft-hint">🔒 Mit Passwort geschützt. Zum Ändern oder Hinzufügen erst das Passwort eingeben.</p>
          <label className="weft-field">
            <span>Passwort</span>
            <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button
            type="button"
            className="weft-ghost-button weft-full-width"
            disabled={busy || password === ""}
            onClick={() =>
              void run(async () => {
                if (!block.protection || !(await filesCheckPassword(block.protection, password))) throw new Error("Falsches Passwort.");
                setUnlocked(password);
                setPassword("");
              })
            }
          >
            Entsperren
          </button>
        </>
      )}
      {protectedBlock && unlocked !== null && (
        <>
          <p className="weft-hint">🔒 Mit Passwort geschützt - entsperrt, solange dieses Element ausgewählt bleibt.</p>
          <label className="weft-field">
            <span>Neues Passwort</span>
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
            Passwort ändern
          </button>
          <button
            type="button"
            className="weft-ghost-button weft-full-width"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (!(await confirmDestructive("Der Passwortschutz wird entfernt: Die Dateien liegen danach unverschlüsselt im Lernmodul und sind für alle sichtbar.", "Passwortschutz entfernen"))) return;
                await setFilesPassword(container, block.id, unlocked, null);
                setUnlocked(null);
              })
            }
          >
            Passwortschutz entfernen
          </button>
        </>
      )}
      {busy && <p className="weft-hint">Einen Moment …</p>}
      {error && <p className="weft-placeholder-warning">{error}</p>}
    </Collapsible>
  );
}

const ARROW_STYLE_LABELS: Record<ArrowStyle, string> = {
  plain: "Nüchtern",
  sketch: "Handgemalt",
  ornate: "Verschnörkelt (Jugendstil)",
};

function ArrowEditor({ block, onUpdate }: { block: ArrowBlock; onUpdate: BlockPanelProps["onUpdate"] }) {
  return (
    <Collapsible title="Pfeil">
      <label className="weft-field">
        <span>Stil</span>
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
        <span>Farbe</span>
        <input type="color" value={block.color} onChange={(e) => onUpdate({ color: e.target.value })} />
      </label>
      <label className="weft-field weft-field-inline">
        <input type="checkbox" checked={block.startHead} onChange={(e) => onUpdate({ startHead: e.target.checked })} />
        <span>Pfeilspitze am Anfang</span>
      </label>
      <label className="weft-field weft-field-inline">
        <input type="checkbox" checked={block.endHead} onChange={(e) => onUpdate({ endHead: e.target.checked })} />
        <span>Pfeilspitze am Ende</span>
      </label>
      <p className="weft-hint">
        Die Linie läuft als Kurve durch alle Wegpunkte. Auf der Folie: Punkt ziehen verschiebt ihn, am Mittelpunkt
        zwischen zwei Punkten ziehen macht einen neuen Wegpunkt, Doppelklick auf einen Punkt entfernt ihn.
      </p>
    </Collapsible>
  );
}

const SHAPE_KIND_LABELS: Record<ShapeKind, string> = {
  rectangle: "Rechteck",
  ellipse: "Ellipse",
  polygon: "n-Eck",
  star: "Stern",
};

function ShapeEditor({ block, onUpdate }: { block: ShapeBlock; onUpdate: BlockPanelProps["onUpdate"] }) {
  return (
    <>
      <Collapsible title="Form">
        <label className="weft-field">
          <span>Typ</span>
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

      <Collapsible title="Füllung">
        <ShapeFillEditor fill={block.fill} onChange={(fill) => onUpdate({ fill })} />
      </Collapsible>

      <Collapsible title="Kontur" defaultOpen={false}>
        <ShapeStrokeEditor stroke={block.stroke} onChange={(stroke) => onUpdate({ stroke })} />
      </Collapsible>

      <Collapsible title="Schatten" defaultOpen={false}>
        <ShapeShadowEditor shadow={block.shadow} onChange={(shadow) => onUpdate({ shadow })} />
      </Collapsible>
    </>
  );
}

// Reading order (top-left, top-right, bottom-left, bottom-right), not the .weft-field-grid 2x2
// layout order this used to be rendered in - that grid fills row-major (left-to-right then down),
// so position 3 (bottomRight) landed in the grid's bottom-*left* cell and position 4 (bottomLeft)
// in its bottom-*right* cell, i.e. visually swapped from what their own labels said. Rendered as
// plain stacked .weft-field rows now instead (see ShapeCornerRadiiEditor below), so this order is
// just for a sensible reading sequence, not a grid position - but keeping bottomLeft before
// bottomRight here still matters for that reason.
const CORNER_FIELDS: { key: keyof ShapeCornerRadii; label: string }[] = [
  { key: "topLeft", label: "Oben links" },
  { key: "topRight", label: "Oben rechts" },
  { key: "bottomLeft", label: "Unten links" },
  { key: "bottomRight", label: "Unten rechts" },
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
        <span>Ecken einzeln einstellen</span>
      </label>
      {individual ? (
        // Plain stacked .weft-field rows, not .weft-field-grid - that grid's narrow 2-column
        // cells (built for a 2-3 digit x/y/width/height number, see its own comment in App.css)
        // left each range input only a sliver of a track, too short to land on anything but
        // roughly "0" or "near the end" with a mouse - exactly the "can only turn it off, can't
        // fine-tune, can't get it back off 0" behavior this was reported as. A full-width track,
        // like every other slider in this panel (Deckkraft, Winkel, the uniform Eckenradius
        // below, ...) already gets, is draggable precisely the same way those are.
        <>
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
        </>
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
  none: "Keine",
  solid: "Farbe",
  gradient: "Verlauf",
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
            <span>Farbe</span>
            <input type="color" value={fill.color} onChange={(e) => onChange({ ...fill, color: e.target.value })} />
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
          <span>Linear</span>
        </label>
        <label className="weft-field weft-field-inline">
          <input
            type="radio"
            name="weft-shape-gradient-kind"
            checked={gradient.kind === "radial"}
            onChange={() => onChange({ ...gradient, kind: "radial" })}
          />
          <span>Radial</span>
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
      <span className="weft-subgroup-label">Farbverlaufspunkte</span>
      {gradient.stops.map((stop) => (
        <div key={stop.id} className="weft-effect-row">
          <input
            type="color"
            value={stop.color}
            title="Farbe"
            onChange={(e) => updateStop(stop.id, { color: e.target.value })}
          />
          <input
            type="number"
            min={0}
            max={100}
            value={Math.round(stop.offset)}
            title="Position (%)"
            onChange={(e) => updateStop(stop.id, { offset: Math.min(100, Math.max(0, Number(e.target.value))) })}
          />
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={stop.opacity}
            title="Deckkraft"
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
        + Farbverlaufspunkt
      </button>
    </>
  );
}

const SHAPE_STROKE_STYLE_LABELS: Record<ShapeStroke["style"], string> = {
  solid: "Durchgezogen",
  dashed: "Gestrichelt",
  dotted: "Gepunktet",
};

function ShapeStrokeEditor({ stroke, onChange }: { stroke: ShapeStroke; onChange: (stroke: ShapeStroke) => void }) {
  return (
    <>
      <label className="weft-field weft-field-inline">
        <input type="checkbox" checked={stroke.enabled} onChange={(e) => onChange({ ...stroke, enabled: e.target.checked })} />
        <span>Kontur anzeigen</span>
      </label>
      {stroke.enabled && (
        <>
          <div className="weft-format-row">
            <label className="weft-field">
              <span>Farbe</span>
              <input type="color" value={stroke.color} onChange={(e) => onChange({ ...stroke, color: e.target.value })} />
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
            <span>Breite</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={stroke.width}
              onChange={(e) => onChange({ ...stroke, width: Math.max(0, Number(e.target.value)) })}
            />
          </label>
          <label className="weft-field">
            <span>Stil</span>
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
        <span>Schatten anzeigen</span>
      </label>
      {shadow.enabled && (
        <>
          <div className="weft-format-row">
            <label className="weft-field">
              <span>Farbe</span>
              <input type="color" value={shadow.color} onChange={(e) => onChange({ ...shadow, color: e.target.value })} />
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
            <span>Unschärfe</span>
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
              <span>Versatz X</span>
              <input type="number" step={0.1} value={shadow.offsetX} onChange={(e) => onChange({ ...shadow, offsetX: Number(e.target.value) })} />
            </label>
            <label>
              <span>Versatz Y</span>
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
  onUpdate,
}: {
  block: QuizBlock;
  option: QuizOption;
  label: string;
  variables: VariableDef[];
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
        <input
          type="checkbox"
          title="Richtig?"
          checked={block.correctOptionIds.includes(option.id)}
          onChange={(e) => {
            const correctOptionIds = e.target.checked
              ? [...block.correctOptionIds, option.id]
              : block.correctOptionIds.filter((id) => id !== option.id);
            onUpdate({ correctOptionIds });
          }}
        />
        <span className="weft-quiz-option-row-label">{label}</span>
        <button
          type="button"
          className={"weft-ghost-button weft-quiz-option-effects-toggle" + (count > 0 ? " has-effects" : "")}
          title="Punkte & Effekte dieser Antwort"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {count > 0 ? `Effekte (${count})` : "Effekte"}
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
            Richtig behandelt heißt: angekreuzt, wenn die Antwort stimmt – und nicht angekreuzt, wenn sie nicht stimmt. Das gilt für jede Antwort einzeln, unabhängig davon, ob das Quiz insgesamt richtig ist.
          </p>
          <span className="weft-field-label">Richtig behandelt</span>
          <EffectListEditor effects={onRight} variables={variables} onChange={(onRight) => patchOption({ onRight })} />
          <span className="weft-field-label">Falsch behandelt</span>
          <EffectListEditor effects={onWrong} variables={variables} onChange={(onWrong) => patchOption({ onWrong })} />
        </div>
      )}
    </div>
  );
}

function QuizEditor({ block, onUpdate }: { block: QuizBlock; onUpdate: BlockPanelProps["onUpdate"] }) {
  const variables = useDocumentStore((s) => s.doc.content.variables);
  const { lang, defaultLang } = useEditingLanguage();

  return (
    <>
      <Collapsible title="Frage & Antworten">
        <LanguageSelect block={block} />
        <p className="weft-hint">Frage und Antworten direkt auf der Folie eingeben. Markierten Text hier formatieren.</p>

        {block.options.map((opt) => (
          <QuizOptionRow
            key={opt.id}
            block={block}
            option={opt}
            label={stripHtml(quizOptionHtml(block, opt.id, lang, defaultLang)) || "(leer)"}
            variables={variables}
            onUpdate={onUpdate}
          />
        ))}
        <button
          type="button"
          className="weft-ghost-button weft-full-width"
          onClick={() => onUpdate({ options: [...block.options, { id: createId(), html: "Neue Option" }] })}
        >
          + Option
        </button>
      </Collapsible>

      <Collapsible title="Bei richtiger Antwort" defaultOpen={false}>
        <EffectListEditor effects={block.onCorrect} variables={variables} onChange={(onCorrect) => onUpdate({ onCorrect })} />
        <label className="weft-field weft-field-inline">
          <input
            type="checkbox"
            checked={block.advanceOnCorrect}
            onChange={(e) => onUpdate({ advanceOnCorrect: e.target.checked })}
          />
          <span>Weiter zur nächsten Folie</span>
        </label>
        {block.advanceOnCorrect && (
          <p className="weft-hint">Passiert 1,5 Sekunden nach Erscheinen von "Richtig", damit die Rückmeldung noch zu sehen ist.</p>
        )}
      </Collapsible>
      <Collapsible title="Bei falscher Antwort" defaultOpen={false}>
        <EffectListEditor effects={block.onIncorrect} variables={variables} onChange={(onIncorrect) => onUpdate({ onIncorrect })} />
        <label className="weft-field weft-field-inline">
          <input
            type="checkbox"
            checked={block.advanceOnIncorrect}
            onChange={(e) => onUpdate({ advanceOnIncorrect: e.target.checked })}
          />
          <span>Weiter zur nächsten Folie</span>
        </label>
        {block.advanceOnIncorrect && (
          <p className="weft-hint">
            Passiert 1,5 Sekunden nach Erscheinen der Rückmeldung, damit sie noch zu sehen ist.
          </p>
        )}
      </Collapsible>
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
              {target && !isSettableVariable(target) && <option value={target.id}>{target.name} (berechnet)</option>}
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
              <option value="set">setzen auf</option>
              {!isBoolean && <option value="add">addieren</option>}
              {!isBoolean && <option value="append">anhängen</option>}
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
                <option value="yes">Ja</option>
                <option value="no">Nein</option>
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
          + Effekt
        </button>
      )}
    </>
  );
}
