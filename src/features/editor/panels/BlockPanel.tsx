import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import pauseIconSvg from "../../../../mockups/icons/pause.svg?raw";
import { createId } from "../../../core/id";
import { addCustomFont } from "../../../core/document/actions";
import type { VideoUploadResult } from "../../../core/document/actions";
import { useAssetStore } from "../../../core/assets/assetStore";
import { formatTimeMMSS } from "../../../core/formatTime";
import { useDocumentStore } from "../../../core/document/store";
import { CURATED_FONT_FAMILIES } from "../../../core/fonts/curatedFonts";
import { DEFAULT_FONT_FAMILY } from "../../../core/fonts/fontFaceCss";
import { BLOCK_KIND_KEYS } from "../../../core/i18n/translations";
import { useTranslation } from "../../../core/i18n/useTranslation";
import { pickFontFile, warnUnplayableVideo } from "../../../core/io/fileIO";
import { useTranscodeStatus } from "../../../core/io/videoTranscode";
import type {
  Block,
  BlockEffect,
  BlockEffectType,
  ButtonBlock,
  IframeBlock,
  ImageBlock,
  Page,
  QuizBlock,
  VariableEffect,
  VideoBlock,
  VideoStopPoint,
} from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { applyFontSize, applyFormat, useFormatSnapshot } from "../blocks/richText";
import type { TriState } from "../blocks/richText";
import { nodeLabel } from "../Timeline";
import { FontSelect } from "./FontSelect";
import type { FontSelectGroup } from "./FontSelect";

const SANDBOX_FLAGS = ["allow-scripts", "allow-same-origin", "allow-popups", "allow-forms"];
const UPLOAD_FONT_VALUE = "__upload__";

interface BlockPanelProps {
  block: Block;
  onUpdate: (patch: Partial<Block>) => void;
  onSetImage: (file: File) => void;
  onSetVideo: (file: File) => Promise<VideoUploadResult>;
  /** Present only when editing a block that lives directly on a page (not inside a Layout) -
   * Aufbau/Abbau (see BlockEffectEditor) only make sense there: a Layout applies to every page
   * that uses it, with no timeline of its own for a trigger to come from. Also doubles as the
   * source for the trigger-event picker itself (see listPageTriggerEvents). */
  page?: Page;
}

export function BlockPanel({ block, onUpdate, onSetImage, onSetVideo, page }: BlockPanelProps) {
  const triggerEvents = page ? listPageTriggerEvents(page) : [];
  return (
    <>
      {/* Same formatting toolbar for both - a quiz's question and options are rich text edited
          directly on the canvas exactly like a text block's own content, just several regions
          sharing one block instead of one filling it (see EditableRichText in BlockView.tsx). */}
      {(block.kind === "text" || block.kind === "quiz") && <TextEditor />}
      {block.kind === "image" && <ImageEditor block={block} onUpdate={onUpdate} onSetImage={onSetImage} />}
      {block.kind === "video" && <VideoEditor block={block} onUpdate={onUpdate} onSetVideo={onSetVideo} />}
      {block.kind === "iframe" && <IframeEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "button" && <ButtonEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "quiz" && <QuizEditor block={block} onUpdate={onUpdate} />}
      {page && (
        <>
          <BlockEffectEditor
            title="Aufbau"
            effect={block.entranceEffect}
            events={triggerEvents}
            allowNoTrigger={false}
            onChange={(entranceEffect) => onUpdate({ entranceEffect })}
          />
          <BlockEffectEditor
            title="Abbau"
            effect={block.exitEffect}
            events={triggerEvents}
            allowNoTrigger={true}
            onChange={(exitEffect) => onUpdate({ exitEffect })}
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

/** Every event a block's own Aufbau/Abbau can trigger off (see BlockEffectEditor) - every node in
 * the page's own timeline graph (see PageTimeline in core/types.ts) except "end" (Nächste Folie),
 * which BlockEffect.triggerEventId's own doc comment explains is excluded because the slide is
 * already gone by the time it fires. Deduplicated by node id, since the same node (e.g. "start",
 * or a quiz's shared submit event) can legitimately appear in more than one lane. */
function listPageTriggerEvents(page: Page): { id: string; label: string }[] {
  const seen = new Map<string, string>();
  for (const lane of page.timeline.lanes) {
    for (const node of lane.nodes) {
      if (node.kind === "end") continue;
      if (!seen.has(node.id)) seen.set(node.id, nodeLabel(node));
    }
  }
  return Array.from(seen, ([id, label]) => ({ id, label }));
}

const BLOCK_EFFECT_TYPES: BlockEffectType[] = ["none", "fade", "move"];

const BLOCK_EFFECT_LABELS: Record<BlockEffectType, string> = {
  none: "Keine Animation",
  fade: "Fade",
  move: "Move",
};

/**
 * Editor for one BlockEffect (a block's own Aufbau or Abbau, see BaseBlock.entranceEffect/
 * exitEffect in core/types.ts) - type/duration mirror TransitionPanel.tsx's own radio group
 * exactly (same three options, same "hide duration while there's nothing to time" rule), plus the
 * trigger-event picker and delay this needs that a page's own outgoing transition doesn't: a
 * block's appearance/disappearance can be tied to any event on the page, not just "the page is
 * ending". `allowNoTrigger` adds a leading "no trigger at all" option (triggerEventId null) - only
 * for Abbau, since a block always has to appear *somehow*, but never disappearing early (staying
 * until the page itself does) is the sensible default for Abbau specifically.
 */
function BlockEffectEditor({
  title,
  effect,
  events,
  allowNoTrigger,
  onChange,
}: {
  title: string;
  effect: BlockEffect;
  events: { id: string; label: string }[];
  allowNoTrigger: boolean;
  onChange: (effect: BlockEffect) => void;
}) {
  return (
    <Collapsible title={title} defaultOpen={false}>
      {BLOCK_EFFECT_TYPES.map((type) => (
        <label key={type} className="weft-field weft-field-inline">
          <input
            type="radio"
            name={`weft-block-effect-${title}`}
            checked={effect.type === type}
            onChange={() => onChange({ ...effect, type })}
          />
          <span>{BLOCK_EFFECT_LABELS[type]}</span>
        </label>
      ))}
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
              onChange({ ...effect, durationMs: Math.round(seconds * 1000) });
            }}
          />
        </label>
      )}
      <label className="weft-field">
        <span>Ausgelöst durch</span>
        <select value={effect.triggerEventId ?? ""} onChange={(e) => onChange({ ...effect, triggerEventId: e.target.value || null })}>
          {allowNoTrigger && <option value="">Kein automatischer Abbau</option>}
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.label}
            </option>
          ))}
        </select>
      </label>
      <label className="weft-field">
        <span>Verzögerung (Sekunden)</span>
        <input
          type="number"
          min={0}
          step={0.1}
          disabled={effect.triggerEventId === null}
          value={effect.delayMs / 1000}
          onChange={(e) => {
            const seconds = Number(e.target.value);
            if (!Number.isFinite(seconds) || seconds < 0) return;
            onChange({ ...effect, delayMs: Math.round(seconds * 1000) });
          }}
        />
      </label>
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
function TextEditor() {
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
                  applyFontSize(Math.max(8, current - 1));
                }}
              >
                −
              </button>
              <input
                key={fontSizeKey}
                type="number"
                min={8}
                max={300}
                defaultValue={fontSizeKey === "mixed" ? "" : fontSizeKey}
                placeholder={snapshot.fontSizePx === "mixed" ? "Verschiedene" : "24"}
                onBlur={(e) => {
                  const px = Number(e.target.value);
                  if (px > 0) applyFontSize(px);
                }}
              />
              <button
                type="button"
                className="weft-format-button"
                title="Größer"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const current = typeof snapshot.fontSizePx === "number" ? snapshot.fontSizePx : 16;
                  applyFontSize(Math.min(300, current + 1));
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
                if (!result.playable) {
                  void warnUnplayableVideo([{ fileName: file.name, ffmpegAttempted: result.ffmpegAttempted, error: result.error }]);
                }
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
  return (
    <Collapsible title="Inhalt">
      <label className="weft-field">
        <span>Text</span>
        <input value={block.text} onChange={(e) => onUpdate({ text: e.target.value })} />
      </label>
      <label className="weft-field">
        <span>Aktion</span>
        <select value={block.action} onChange={(e) => onUpdate({ action: e.target.value as ButtonBlock["action"] })}>
          <option value="next">Nächste Folie</option>
          <option value="prev">Vorherige Folie</option>
        </select>
      </label>
      {block.action === "prev" && (
        <p className="weft-hint">
          Auf der ersten Folie automatisch deaktiviert – der Player merkt sich dazu den bisherigen Lernpfad.
        </p>
      )}
    </Collapsible>
  );
}

// Plain-text preview only, for the sidebar's option list (see QuizEditor) to tell options apart
// by - the actual text is edited on the canvas now (WYSIWYG, like a text block), not here.
function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent ?? "";
}

function QuizEditor({ block, onUpdate }: { block: QuizBlock; onUpdate: BlockPanelProps["onUpdate"] }) {
  const variables = useDocumentStore((s) => s.doc.content.variables);

  return (
    <>
      <Collapsible title="Frage & Antworten">
        <p className="weft-hint">Frage und Antworten direkt auf der Folie eingeben. Markierten Text hier formatieren.</p>

        {block.options.map((opt) => (
          <div key={opt.id} className="weft-quiz-option-row">
            <input
              type="checkbox"
              title="Richtig?"
              checked={block.correctOptionIds.includes(opt.id)}
              onChange={(e) => {
                const correctOptionIds = e.target.checked
                  ? [...block.correctOptionIds, opt.id]
                  : block.correctOptionIds.filter((id) => id !== opt.id);
                onUpdate({ correctOptionIds });
              }}
            />
            <span className="weft-quiz-option-row-label">{stripHtml(opt.html) || "(leer)"}</span>
            <button
              type="button"
              className="weft-icon-button"
              onClick={() =>
                onUpdate({
                  options: block.options.filter((o) => o.id !== opt.id),
                  correctOptionIds: block.correctOptionIds.filter((id) => id !== opt.id),
                })
              }
            >
              ×
            </button>
          </div>
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

function EffectListEditor({
  effects,
  variables,
  onChange,
}: {
  effects: VariableEffect[];
  variables: { id: string; name: string }[];
  onChange: (effects: VariableEffect[]) => void;
}) {
  return (
    <>
      {effects.map((effect, index) => (
        <div key={index} className="weft-effect-row">
          <select
            value={effect.variableId}
            onChange={(e) => {
              const next = [...effects];
              next[index] = { ...effect, variableId: e.target.value };
              onChange(next);
            }}
          >
            {variables.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <select
            value={effect.op}
            onChange={(e) => {
              const op = e.target.value as VariableEffect["op"];
              const next = [...effects];
              next[index] =
                op === "add"
                  ? { variableId: effect.variableId, op, value: 1 }
                  : op === "append"
                    ? { variableId: effect.variableId, op, value: "" }
                    : { variableId: effect.variableId, op, value: 0 };
              onChange(next);
            }}
          >
            <option value="set">setzen auf</option>
            <option value="add">addieren</option>
            <option value="append">anhängen</option>
          </select>
          <input
            value={String(effect.value)}
            onChange={(e) => {
              const raw = e.target.value;
              const value = effect.op === "add" ? Number(raw) : raw;
              const next = [...effects];
              next[index] = { ...effect, value } as VariableEffect;
              onChange(next);
            }}
          />
          <button type="button" className="weft-icon-button" onClick={() => onChange(effects.filter((_, i) => i !== index))}>
            ×
          </button>
        </div>
      ))}
      {variables.length > 0 && (
        <button
          type="button"
          className="weft-ghost-button weft-full-width"
          onClick={() => onChange([...effects, { variableId: variables[0].id, op: "add", value: 1 }])}
        >
          + Effekt
        </button>
      )}
    </>
  );
}
