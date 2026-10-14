import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { addAssetFromFile } from "../../../core/document/actions";
import { useAssetStore } from "../../../core/assets/assetStore";
import { useDocumentStore } from "../../../core/document/store";
import { CURATED_FONT_FAMILIES } from "../../../core/fonts/curatedFonts";
import { DEFAULT_FONT_FAMILY } from "../../../core/fonts/fontFaceCss";
import {
  applyExtendedFormat,
  applyFontSize,
  applyFormat,
  pinActiveEditor,
  readExtendedFormat,
  selectAllIfCollapsed,
  useFormatSnapshot,
} from "../blocks/richText";
import type { TextBackground } from "../blocks/richText";
import { FontSelect } from "./FontSelect";
import type { FontSelectGroup } from "./FontSelect";
import { StepperSlider } from "./StepperSlider";

type Align = "left" | "center" | "right";

const SAMPLE = "Beispieltext - So sieht die Schrift aus";

/**
 * The dialog "Schrift": everything the formatting panel has (font, size, colour, bold, italic, underlined, alignment) and what only
 * it has - the line height, small capitals, and a gradient or a picture seen through the letters (background-clip: text) - with a
 * sample text on top that shows what the options make of a text. "Übernehmen" applies all of it to what is selected in the text
 * being edited (no selection: the whole text of the block). The panel's own controls stay as they are.
 */
export function TextFormatDialog({ onClose }: { onClose: () => void }) {
  const snapshot = useMemo(() => useFormatSnapshot.getState(), []);
  const extended = useMemo(() => readExtendedFormat(), []);
  const customFonts = useDocumentStore((s) => s.doc.content.customFonts);
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);

  // What the fields show to begin with: only what is changed from that is applied (a font nobody picked is not written into the text).
  const initial = useMemo(
    () => ({
      family: snapshot.fontFamily === "mixed" || !snapshot.fontFamily ? DEFAULT_FONT_FAMILY : snapshot.fontFamily,
      sizePx: typeof snapshot.fontSizePx === "number" ? snapshot.fontSizePx : 24,
      color: snapshot.color === "mixed" || !snapshot.color ? "#000000" : snapshot.color,
      bold: snapshot.bold === "on",
      italic: snapshot.italic === "on",
      underline: snapshot.underline === "on",
      align: (snapshot.align === "mixed" ? "left" : snapshot.align) as Align,
      lineHeight: typeof extended?.lineHeight === "number" ? extended.lineHeight : null,
      smallCaps: extended?.smallCaps === "on",
      background: (extended && extended.background !== "mixed" ? extended.background : { kind: "none" }) as TextBackground,
    }),
    [snapshot, extended],
  );
  const [family, setFamily] = useState(initial.family);
  const [sizePx, setSizePx] = useState(initial.sizePx);
  const [color, setColor] = useState(initial.color);
  const [bold, setBold] = useState(initial.bold);
  const [italic, setItalic] = useState(initial.italic);
  const [underline, setUnderline] = useState(initial.underline);
  const [align, setAlign] = useState<Align>(initial.align);
  const [lineHeight, setLineHeight] = useState<number | null>(initial.lineHeight);
  const [smallCaps, setSmallCaps] = useState(initial.smallCaps);
  const start: TextBackground = initial.background;
  const [backgroundKind, setBackgroundKind] = useState<TextBackground["kind"]>(start.kind);
  const [from, setFrom] = useState(start.kind === "gradient" ? start.from : "#3b82f6");
  const [to, setTo] = useState(start.kind === "gradient" ? start.to : "#ec4899");
  const [angle, setAngle] = useState(start.kind === "gradient" ? start.angle : 90);
  const [assetId, setAssetId] = useState(start.kind === "image" ? start.assetId : "");

  // The editor of the text stays the one the options go to, however the focus moves about in here.
  useEffect(() => {
    pinActiveEditor(true);
    return () => pinActiveEditor(false);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fontGroups: FontSelectGroup[] = [
    { options: [{ value: DEFAULT_FONT_FAMILY, label: DEFAULT_FONT_FAMILY, previewFamily: DEFAULT_FONT_FAMILY }] },
    ...(customFonts.length > 0
      ? [{ label: "Eigene Schriften", options: customFonts.map((font) => ({ value: font.family, label: font.family, previewFamily: font.family })) }]
      : []),
    {
      label: "Schriften (im Export enthalten)",
      options: CURATED_FONT_FAMILIES.filter((f) => f !== DEFAULT_FONT_FAMILY)
        .sort((a, b) => a.localeCompare(b, "de"))
        .map((f) => ({ value: f, label: f, previewFamily: f })),
    },
  ];

  const imageUrl = assetId ? getObjectUrl(assetId) : undefined;
  const previewStyle: CSSProperties = {
    fontFamily: `"${family}", sans-serif`,
    // (The size of the text on the slide depends on the slide's width: the sample is shown larger than the number says.)
    fontSize: `${Math.min(Math.max(sizePx * 1.6, 14), 64)}px`,
    color,
    fontWeight: bold ? 700 : 400,
    fontStyle: italic ? "italic" : "normal",
    textDecoration: underline ? "underline" : "none",
    textAlign: align,
    lineHeight: lineHeight ?? "normal",
    fontVariant: smallCaps ? "small-caps" : "normal",
    ...(backgroundKind !== "none" && (backgroundKind === "gradient" || imageUrl)
      ? {
          backgroundImage: backgroundKind === "gradient" ? `linear-gradient(${angle}deg, ${from}, ${to})` : `url("${imageUrl}")`,
          backgroundSize: backgroundKind === "image" ? "cover" : undefined,
          backgroundPosition: "center",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }
      : {}),
  };

  function apply() {
    // No selection: the options are for the whole text of the block.
    selectAllIfCollapsed();
    // bold/italic/underline are toggles: they are only pressed when the field was changed.
    if (bold !== initial.bold) applyFormat("bold");
    if (italic !== initial.italic) applyFormat("italic");
    if (underline !== initial.underline) applyFormat("underline");
    if (align !== initial.align) applyFormat(align === "center" ? "justifyCenter" : align === "right" ? "justifyRight" : "justifyLeft");
    if (family !== initial.family) applyFormat("fontName", family);
    if (color !== initial.color) applyFormat("foreColor", color);
    if (sizePx !== initial.sizePx) applyFontSize(sizePx);

    const input: Parameters<typeof applyExtendedFormat>[0] = {};
    if (lineHeight !== initial.lineHeight) input.lineHeight = lineHeight;
    if (smallCaps !== initial.smallCaps) input.smallCaps = smallCaps;
    const background: TextBackground & { url?: string } =
      backgroundKind === "gradient"
        ? { kind: "gradient", from, to, angle }
        : backgroundKind === "image" && assetId
          ? { kind: "image", assetId, url: imageUrl }
          : { kind: "none" };
    if (JSON.stringify({ ...background, url: undefined }) !== JSON.stringify(initial.background)) input.background = background;
    if (Object.keys(input).length > 0) applyExtendedFormat(input);
    onClose();
  }

  return createPortal(
    <div className="weft-modal-backdrop" onClick={onClose}>
      <div className="weft-modal weft-text-format-dialog" data-weft-format-control onClick={(e) => e.stopPropagation()}>
        <div className="weft-modal-header">
          <h3>Schrift</h3>
          <button type="button" className="weft-icon-button" title="Schließen" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="weft-text-format-preview" aria-label="Vorschau">
          <span style={previewStyle}>{SAMPLE}</span>
        </div>

        <div className="weft-text-format-grid">
          <label className="weft-field weft-text-format-wide">
            <span>Schriftart</span>
            <FontSelect value={family} isMixed={false} groups={fontGroups} onPick={setFamily} />
          </label>
          <div className="weft-field">
            <span>Schriftgröße (px)</span>
            <StepperSlider label="Schriftgröße" value={sizePx} min={4} max={120} step={1} onChange={setSizePx} />
          </div>
          <label className="weft-field">
            <span>Farbe</span>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>

          <div className="weft-field weft-text-format-wide">
            <span>Stil</span>
            <div className="weft-format-row">
              <button type="button" className={"weft-format-button" + (bold ? " is-active" : "")} title="Fett" onClick={() => setBold(!bold)}>
                <b>F</b>
              </button>
              <button type="button" className={"weft-format-button" + (italic ? " is-active" : "")} title="Kursiv" onClick={() => setItalic(!italic)}>
                <i>K</i>
              </button>
              <button
                type="button"
                className={"weft-format-button" + (underline ? " is-active" : "")}
                title="Unterstrichen"
                onClick={() => setUnderline(!underline)}
              >
                <u>U</u>
              </button>
              <span className="weft-text-format-sep" />
              {(["left", "center", "right"] as Align[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={"weft-format-button" + (align === value ? " is-active" : "")}
                  title={value === "left" ? "Linksbündig" : value === "center" ? "Zentriert" : "Rechtsbündig"}
                  onClick={() => setAlign(value)}
                >
                  {value === "left" ? "⇤" : value === "center" ? "↔" : "⇥"}
                </button>
              ))}
              <span className="weft-text-format-sep" />
              <label className="weft-field weft-field-inline">
                <input type="checkbox" checked={smallCaps} onChange={(e) => setSmallCaps(e.target.checked)} />
                <span>Kapitälchen</span>
              </label>
            </div>
          </div>

          <div className="weft-field weft-text-format-wide">
            <span>Zeilenhöhe</span>
            <label className="weft-field weft-field-inline">
              <input type="checkbox" checked={lineHeight === null} onChange={(e) => setLineHeight(e.target.checked ? null : 1.35)} />
              <span>Standard</span>
            </label>
            {lineHeight !== null && (
              <StepperSlider
                label="Zeilenhöhe"
                value={lineHeight}
                min={0.8}
                max={3}
                step={0.05}
                onChange={(value) => setLineHeight(Math.round(value * 100) / 100)}
              />
            )}
          </div>

          <div className="weft-field weft-text-format-wide">
            <span>Hintergrund der Buchstaben</span>
            <select value={backgroundKind} onChange={(e) => setBackgroundKind(e.target.value as TextBackground["kind"])}>
              <option value="none">Keiner</option>
              <option value="gradient">Farbverlauf</option>
              <option value="image">Bild</option>
            </select>
            {backgroundKind === "gradient" && (
              <div className="weft-text-format-gradient">
                <input type="color" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Farbe am Anfang" />
                <input type="color" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Farbe am Ende" />
                <StepperSlider label="Winkel" value={angle} min={0} max={360} step={15} onChange={setAngle} />
              </div>
            )}
            {backgroundKind === "image" && (
              <label className="weft-field">
                <span>Bilddatei</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setAssetId(addAssetFromFile(file));
                  }}
                />
              </label>
            )}
            <p className="weft-hint">
              Der Verlauf oder das Bild scheint durch die Buchstaben (CSS „background-clip: text“). Im PDF-Export sind die Buchstaben einfarbig.
            </p>
          </div>
        </div>

        <div className="weft-text-format-actions">
          <button type="button" className="weft-ghost-button" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="weft-primary-button" onClick={apply}>
            Übernehmen
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
