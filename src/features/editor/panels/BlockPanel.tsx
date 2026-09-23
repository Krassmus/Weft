import { createId } from "../../../core/id";
import { addCustomFont } from "../../../core/document/actions";
import type { VideoUploadResult } from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";
import { CURATED_FONT_FAMILIES } from "../../../core/fonts/curatedFonts";
import { DEFAULT_FONT_FAMILY } from "../../../core/fonts/fontFaceCss";
import { BLOCK_KIND_KEYS } from "../../../core/i18n/translations";
import { useTranslation } from "../../../core/i18n/useTranslation";
import { pickFontFile, warnUnplayableVideo } from "../../../core/io/fileIO";
import { useTranscodeStatus } from "../../../core/io/videoTranscode";
import type { Block, ButtonBlock, IframeBlock, ImageBlock, QuizBlock, VariableEffect, VideoBlock } from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { applyFontSize, applyFormat, useFormatSnapshot } from "../blocks/richText";
import type { TriState } from "../blocks/richText";
import { FontSelect } from "./FontSelect";
import type { FontSelectGroup } from "./FontSelect";

const SANDBOX_FLAGS = ["allow-scripts", "allow-same-origin", "allow-popups", "allow-forms"];
const UPLOAD_FONT_VALUE = "__upload__";

interface BlockPanelProps {
  block: Block;
  onUpdate: (patch: Partial<Block>) => void;
  onSetImage: (file: File) => void;
  onSetVideo: (file: File) => Promise<VideoUploadResult>;
}

export function BlockPanel({ block, onUpdate, onSetImage, onSetVideo }: BlockPanelProps) {
  return (
    <>
      {block.kind === "text" && <TextEditor />}
      {block.kind === "image" && <ImageEditor block={block} onUpdate={onUpdate} onSetImage={onSetImage} />}
      {block.kind === "video" && <VideoEditor block={block} onUpdate={onUpdate} onSetVideo={onSetVideo} />}
      {block.kind === "iframe" && <IframeEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "button" && <ButtonEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "quiz" && <QuizEditor block={block} onUpdate={onUpdate} />}
      {/* Least important thing here, since it's rarely worth fiddling with numerically instead of
          just dragging the block on the canvas - always last regardless of block kind, rather
          than leading with a wall of coordinate fields before anything content-related. */}
      <PositionCollapsible block={block} onUpdate={onUpdate} />
    </>
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
  return (
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
  );
}

const DEFAULT_VIEWPORT_WIDTH = 768;

function IframeEditor({ block, onUpdate }: { block: IframeBlock; onUpdate: BlockPanelProps["onUpdate"] }) {
  const forcedViewportWidth = block.forcedViewportWidth;
  return (
    <Collapsible title="Inhalt">
      <label className="weft-field">
        <span>URL (z. B. YouTube-Embed oder ein anderes interaktives Tool)</span>
        <input value={block.url} onChange={(e) => onUpdate({ url: e.target.value })} />
      </label>
      <label className="weft-field weft-field-inline">
        <input
          type="checkbox"
          checked={!!forcedViewportWidth}
          onChange={(e) => onUpdate({ forcedViewportWidth: e.target.checked ? DEFAULT_VIEWPORT_WIDTH : undefined })}
        />
        <span>Feste Bildschirmgröße erzwingen (z. B. um die mobile Ansicht der Seite zu zeigen)</span>
      </label>
      {forcedViewportWidth && (
        <>
          <label className="weft-field">
            <span>Virtuelle Breite (px)</span>
            <input
              type="number"
              min={1}
              value={forcedViewportWidth}
              onChange={(e) => onUpdate({ forcedViewportWidth: Math.max(1, Number(e.target.value)) })}
            />
          </label>
          <p className="weft-hint">
            Die Seite wird immer so dargestellt, als wäre das Browserfenster genau {forcedViewportWidth} Pixel breit –
            unabhängig davon, wie groß das Lernmodul selbst angezeigt wird. Die Höhe ergibt sich automatisch aus der Höhe
            des Blocks hier im Editor, sodass die Seite den Block immer exakt (ohne Verzerrung) ausfüllt.
          </p>
        </>
      )}

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

function QuizEditor({ block, onUpdate }: { block: QuizBlock; onUpdate: BlockPanelProps["onUpdate"] }) {
  const variables = useDocumentStore((s) => s.doc.content.variables);

  return (
    <>
      <Collapsible title="Frage & Antworten">
        <label className="weft-field">
          <span>Frage</span>
          <textarea rows={2} value={block.question} onChange={(e) => onUpdate({ question: e.target.value })} />
        </label>

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
            <input
              value={opt.text}
              onChange={(e) =>
                onUpdate({
                  options: block.options.map((o) => (o.id === opt.id ? { ...o, text: e.target.value } : o)),
                })
              }
            />
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
          onClick={() => onUpdate({ options: [...block.options, { id: createId(), text: "Neue Option" }] })}
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
