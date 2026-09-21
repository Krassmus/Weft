import { createId } from "../../../core/id";
import { addCustomFont } from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";
import { CURATED_FONT_FAMILIES } from "../../../core/fonts/curatedFonts";
import { DEFAULT_FONT_FAMILY } from "../../../core/fonts/fontFaceCss";
import type { Block, ButtonBlock, IframeBlock, ImageBlock, QuizBlock, VariableEffect } from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { applyFontSize, applyFormat, useFormatSnapshot } from "../blocks/richText";
import type { TriState } from "../blocks/richText";

const SANDBOX_FLAGS = ["allow-scripts", "allow-same-origin", "allow-popups", "allow-forms"];
const BLOCK_KIND_LABELS: Record<Block["kind"], string> = {
  text: "Text",
  image: "Bild",
  iframe: "Iframe",
  button: "Button",
  quiz: "Quiz",
};

interface BlockPanelProps {
  block: Block;
  onUpdate: (patch: Partial<Block>) => void;
  onSetImage: (file: File) => void;
}

export function BlockPanel({ block, onUpdate, onSetImage }: BlockPanelProps) {
  return (
    <>
      <Collapsible title={`Element · ${BLOCK_KIND_LABELS[block.kind]}`}>
        <PositionEditor block={block} onUpdate={onUpdate} />
      </Collapsible>
      {block.kind === "text" && <TextEditor />}
      {block.kind === "image" && <ImageEditor block={block} onUpdate={onUpdate} onSetImage={onSetImage} />}
      {block.kind === "iframe" && <IframeEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "button" && <ButtonEditor block={block} onUpdate={onUpdate} />}
      {block.kind === "quiz" && <QuizEditor block={block} onUpdate={onUpdate} />}
    </>
  );
}

function PositionEditor({ block, onUpdate }: { block: Block; onUpdate: BlockPanelProps["onUpdate"] }) {
  const { x, y, width, height } = block.position;
  return (
    <div className="weft-position-grid">
      <label>
        x
        <input type="number" value={x} onChange={(e) => onUpdate({ position: { ...block.position, x: Number(e.target.value) } })} />
      </label>
      <label>
        y
        <input type="number" value={y} onChange={(e) => onUpdate({ position: { ...block.position, y: Number(e.target.value) } })} />
      </label>
      <label>
        Breite
        <input
          type="number"
          value={width}
          onChange={(e) => onUpdate({ position: { ...block.position, width: Number(e.target.value) } })}
        />
      </label>
      <label>
        Höhe
        <input
          type="number"
          value={height}
          onChange={(e) => onUpdate({ position: { ...block.position, height: Number(e.target.value) } })}
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
          <select
            value={snapshot.fontFamily === "mixed" ? "mixed" : snapshot.fontFamily || DEFAULT_FONT_FAMILY}
            onChange={(e) => {
              if (e.target.value) applyFormat("fontName", e.target.value);
            }}
          >
            {snapshot.fontFamily === "mixed" && (
              <option value="mixed" disabled>
                Verschiedene …
              </option>
            )}
            <option value={DEFAULT_FONT_FAMILY}>{DEFAULT_FONT_FAMILY}</option>
            {customFonts.length > 0 && (
              <optgroup label="Eigene Schriften">
                {customFonts.map((font) => (
                  <option key={font.id} value={font.family}>
                    {font.family}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Schriften (im Export enthalten)">
              {sortedOtherFonts.map((family) => (
                <option key={family} value={family}>
                  {family}
                </option>
              ))}
            </optgroup>
          </select>
        </label>

        {/* Its own <label>, not sharing one with the select above or anything else interactive -
            nesting another control inside a <label> makes clicking it also forward a click to
            the label's own input (see the same fix in SettingsTab.tsx), popping the file picker
            open unexpectedly. Uploading here is a shortcut: the font is still stored globally
            (doc.content.customFonts, the same list Einstellungen manages) and just also gets
            applied to the current selection immediately, since that's the point of reaching for
            it while formatting text rather than in Einstellungen. */}
        <label className="weft-field">
          <span>Eigene Schriftart hochladen</span>
          <input
            type="file"
            accept=".woff2,.woff,.ttf,.otf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const { family } = addCustomFont(file);
              applyFormat("fontName", family);
            }}
          />
        </label>

        <div className="weft-format-row">
          <label className="weft-field">
            <span>Schriftgröße (px)</span>
            <input
              key={fontSizeKey}
              type="number"
              min={8}
              max={300}
              defaultValue={fontSizeKey === "mixed" ? "" : fontSizeKey}
              placeholder={snapshot.fontSizePx === "mixed" ? "Verschiedene" : "z. B. 24"}
              onBlur={(e) => {
                const px = Number(e.target.value);
                if (px > 0) applyFontSize(px);
              }}
            />
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

function IframeEditor({ block, onUpdate }: { block: IframeBlock; onUpdate: BlockPanelProps["onUpdate"] }) {
  return (
    <Collapsible title="Inhalt">
      <label className="weft-field">
        <span>URL (z. B. YouTube-Embed oder ein anderes interaktives Tool)</span>
        <input value={block.url} onChange={(e) => onUpdate({ url: e.target.value })} />
      </label>
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
