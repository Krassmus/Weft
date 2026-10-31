import { useEffect, useMemo, useRef, useState } from "react";
import { IMAGE_FILE_ACCEPT } from "../../../core/io/imageFileTypes";
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
  removeTextColor,
  pinActiveEditor,
  readExtendedFormat,
  selectAllIfCollapsed,
  useFormatSnapshot,
} from "../blocks/richText";
import type { TextBackground } from "../blocks/richText";
import { FontSelect } from "./FontSelect";
import type { FontSelectGroup } from "./FontSelect";
import { StepperSlider } from "./StepperSlider";
import { tr } from "../../../core/i18n/tr";
import { ColorField } from "../ColorField";
import { useBackdropClose } from "../useBackdropClose";
import { useDialogA11y } from "../useDialogA11y";

type Align = "left" | "center" | "right";

const sampleText = () => [tr("ui.sample_text_1"), tr("ui.sample_text_2")];

/**
 * The dialog "Schrift": everything the formatting panel has (font, size, colour, bold, italic, underlined, alignment) and what only
 * it has - the line height, small capitals, and a gradient or a picture seen through the letters (background-clip: text) - with a
 * sample text on top that shows what the options make of a text. "Übernehmen" applies all of it to what is selected in the text
 * being edited (no selection: the whole text of the block). The panel's own controls stay as they are.
 */
/** From this brightness (0-1) on, a text colour counts as light. */
const LIGHT_TEXT_BRIGHTNESS = 0.51;

/** The colour of the sample text while the text has no colour of its own (on the white of the sample, the colour of a light slide's text). */
const DEFAULT_PREVIEW_COLOR = "#18181b";

/** How bright a colour looks, 0 (black) to 1 (white) - weighted by how much the eye takes from red, green and blue - or null if it is not
 * a colour written as #rgb, #rrggbb or rgb(...). */
function brightness(color: string): number | null {
  const text = color.trim().toLowerCase();
  let r: number, g: number, b: number;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    [r, g, b] = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16));
  } else {
    const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(text);
    if (!rgb) return null;
    [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function mixBrightness(a: string, b: string): number | null {
  const first = brightness(a);
  const second = brightness(b);
  return first === null || second === null ? null : (first + second) / 2;
}

export function TextFormatDialog({ onClose }: { onClose: () => void }) {
  const backdropClose = useBackdropClose(onClose);
  // (It works on the text that is being edited: the selection stays where it is, so the focus is not moved into it.)
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, { moveFocus: false });
  const snapshot = useMemo(() => useFormatSnapshot.getState(), []);
  const extended = useMemo(() => readExtendedFormat(), []);
  const customFonts = useDocumentStore((s) => s.doc.content.customFonts);
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);

  // What the fields show to begin with: only what is changed from that is applied (a font nobody picked is not written into the text).
  const initial = useMemo(
    () => ({
      family: snapshot.fontFamily === "mixed" || !snapshot.fontFamily ? DEFAULT_FONT_FAMILY : snapshot.fontFamily,
      sizePx: typeof snapshot.fontSizePx === "number" ? snapshot.fontSizePx : 24,
      // (null: no colour of its own - the slide's; also what a selection with several colours starts as: nothing is changed unless a colour is picked.)
      color: snapshot.color === "mixed" || !snapshot.color ? null : snapshot.color,
      bold: snapshot.bold === "on",
      italic: snapshot.italic === "on",
      underline: snapshot.underline === "on",
      align: (snapshot.align === "mixed" ? "left" : snapshot.align) as Align,
      lineHeight: typeof extended?.lineHeight === "number" ? extended.lineHeight : null,
      paragraphSpacing: typeof extended?.paragraphSpacing === "number" ? extended.paragraphSpacing : null,
      smallCaps: extended?.smallCaps === "on",
      background: (extended && extended.background !== "mixed" ? extended.background : { kind: "none" }) as TextBackground,
    }),
    [snapshot, extended],
  );
  const [family, setFamily] = useState(initial.family);
  const [sizePx, setSizePx] = useState(initial.sizePx);
  const [color, setColor] = useState<string | null>(initial.color);
  // (A colour that was picked is applied even if it is the one the dialog began with - after "several colours", the standard one removes them all.)
  const [colorTouched, setColorTouched] = useState(false);
  const pickColor = (picked: string | null) => {
    setColorTouched(true);
    setColor(picked);
  };
  const [bold, setBold] = useState(initial.bold);
  const [italic, setItalic] = useState(initial.italic);
  const [underline, setUnderline] = useState(initial.underline);
  const [align, setAlign] = useState<Align>(initial.align);
  const [lineHeight, setLineHeight] = useState<number | null>(initial.lineHeight);
  const [paragraphSpacing, setParagraphSpacing] = useState<number | null>(initial.paragraphSpacing);
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
      ? [{ label: tr("ui.own_fonts"), options: customFonts.map((font) => ({ value: font.family, label: font.family, previewFamily: font.family })) }]
      : []),
    {
      label: tr("ui.fonts_included_in_the_export"),
      options: CURATED_FONT_FAMILIES.filter((f) => f !== DEFAULT_FONT_FAMILY)
        .sort((a, b) => a.localeCompare(b, "de"))
        .map((f) => ({ value: f, label: f, previewFamily: f })),
    },
  ];

  const imageUrl = assetId ? getObjectUrl(assetId) : undefined;
  // Light letters would vanish on the white of the sample: from this brightness on, the sample sits on black. (A gradient: the middle
  // of its two colours. A picture in the letters says nothing about it, so it stays on white.)
  const shownColor = backgroundKind === "gradient" ? mixBrightness(from, to) : backgroundKind === "image" && imageUrl ? null : color === null ? null : brightness(color);
  const darkPreview = shownColor !== null && shownColor >= LIGHT_TEXT_BRIGHTNESS;
  const previewStyle: CSSProperties = {
    fontFamily: `"${family}", sans-serif`,
    // (The size of the text on the slide depends on the slide's width: the sample is shown larger than the number says.)
    fontSize: `${Math.min(Math.max(sizePx * 1.6, 14), 64)}px`,
    color: color ?? DEFAULT_PREVIEW_COLOR,
    fontWeight: bold ? 700 : 400,
    fontStyle: italic ? "italic" : "normal",
    textDecoration: underline ? "underline" : "none",
    textAlign: align,
    lineHeight: lineHeight ?? "normal",
    margin: `0 0 ${paragraphSpacing ?? 1}em`,
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
    if (colorTouched) {
      if (color === null) removeTextColor();
      else applyFormat("foreColor", color);
    }
    if (sizePx !== initial.sizePx) applyFontSize(sizePx);

    const input: Parameters<typeof applyExtendedFormat>[0] = {};
    if (lineHeight !== initial.lineHeight) input.lineHeight = lineHeight;
    if (paragraphSpacing !== initial.paragraphSpacing) input.paragraphSpacing = paragraphSpacing;
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
    <div className="weft-modal-backdrop" {...backdropClose}>
      <div ref={dialogRef} className="weft-modal weft-text-format-dialog" data-weft-format-control onClick={(e) => e.stopPropagation()}>
        <div className="weft-modal-header">
          <h3>{tr("ui.font_2")}</h3>
          <button type="button" className="weft-icon-button" title={tr("ui.close")} aria-label={tr("ui.close")} onClick={onClose}>
            ×
          </button>
        </div>

        <div className={"weft-text-format-preview" + (darkPreview ? " is-dark" : "")} aria-label={tr("ui.preview")}>
          {sampleText().map((text) => (
            <p key={text} style={previewStyle}>
              {text}
            </p>
          ))}
        </div>

        <div className="weft-text-format-grid">
          <label className="weft-field weft-text-format-wide">
            <span>{tr("ui.font")}</span>
            <FontSelect value={family} isMixed={false} groups={fontGroups} onPick={setFamily} />
          </label>
          <div className="weft-field">
            <span>{tr("ui.font_size_px")}</span>
            <StepperSlider label={tr("ui.font_size")} value={sizePx} min={4} max={120} step={1} onChange={setSizePx} />
          </div>
          <label className="weft-field">
            <span>{tr("ui.colour")}</span>
            <ColorField value={color ?? "#000000"} ariaLabel={tr("ui.colour")} isDefault={color === null} onReset={() => pickColor(null)} onChange={pickColor} />
          </label>

          <div className="weft-field weft-text-format-wide">
            <span>{tr("ui.style")}</span>
            <div className="weft-format-row">
              <button type="button" className={"weft-format-button" + (bold ? " is-active" : "")} title={tr("ui.bold")} onClick={() => setBold(!bold)}>
                <b>F</b>
              </button>
              <button type="button" className={"weft-format-button" + (italic ? " is-active" : "")} title={tr("ui.italic")} onClick={() => setItalic(!italic)}>
                <i>K</i>
              </button>
              <button
                type="button"
                className={"weft-format-button" + (underline ? " is-active" : "")}
                title={tr("ui.underline")}
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
                  title={value === "left" ? tr("ui.align_left") : value === "center" ? tr("ui.centre") : tr("ui.align_right")}
                  onClick={() => setAlign(value)}
                >
                  {value === "left" ? "⇤" : value === "center" ? "↔" : "⇥"}
                </button>
              ))}
              <span className="weft-text-format-sep" />
              <label className="weft-field weft-field-inline">
                <input type="checkbox" checked={smallCaps} onChange={(e) => setSmallCaps(e.target.checked)} />
                <span>{tr("ui.small_capitals")}</span>
              </label>
            </div>
          </div>

          <div className="weft-field weft-text-format-wide">
            <span>{tr("ui.line_height")}</span>
            <label className="weft-field weft-field-inline">
              <input type="checkbox" checked={lineHeight === null} onChange={(e) => setLineHeight(e.target.checked ? null : 1.35)} />
              <span>{tr("ui.default")}</span>
            </label>
            {lineHeight !== null && (
              <StepperSlider
                label={tr("ui.line_height")}
                value={lineHeight}
                min={0.8}
                max={3}
                step={0.05}
                onChange={(value) => setLineHeight(Math.round(value * 100) / 100)}
              />
            )}
          </div>

          <div className="weft-field weft-text-format-wide">
            <span>{tr("ui.space_between_paragraphs")}</span>
            <label className="weft-field weft-field-inline">
              <input type="checkbox" checked={paragraphSpacing === null} onChange={(e) => setParagraphSpacing(e.target.checked ? null : 1)} />
              <span>{tr("ui.default")}</span>
            </label>
            {paragraphSpacing !== null && (
              <StepperSlider
                label={tr("ui.space_between_paragraphs")}
                value={paragraphSpacing}
                min={0}
                max={3}
                step={0.1}
                onChange={(value) => setParagraphSpacing(Math.round(value * 10) / 10)}
              />
            )}
          </div>

          <div className="weft-field weft-text-format-wide">
            <span>{tr("ui.background_of_the_letters")}</span>
            <select value={backgroundKind} onChange={(e) => setBackgroundKind(e.target.value as TextBackground["kind"])}>
              <option value="none">{tr("ui.none")}</option>
              <option value="gradient">{tr("ui.gradient")}</option>
              <option value="image">{tr("ui.image")}</option>
            </select>
            {backgroundKind === "gradient" && (
              <div className="weft-text-format-gradient">
                <ColorField value={from} onChange={setFrom} ariaLabel={tr("ui.colour_at_the_start")} />
                <ColorField value={to} onChange={setTo} ariaLabel={tr("ui.colour_at_the_end")} />
                <StepperSlider label={tr("ui.angle")} value={angle} min={0} max={360} step={15} onChange={setAngle} />
              </div>
            )}
            {backgroundKind === "image" && (
              <label className="weft-field">
                <span>{tr("ui.image_file")}</span>
                <input
                  type="file"
                  accept={IMAGE_FILE_ACCEPT}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setAssetId(addAssetFromFile(file));
                  }}
                />
              </label>
            )}
            <p className="weft-hint">
              {tr("ui.the_gradient_or_image_shines_through")}
            </p>
          </div>
        </div>

        <div className="weft-text-format-actions">
          <button type="button" className="weft-ghost-button" onClick={onClose}>
            {tr("ui.cancel")}
          </button>
          <button type="button" className="weft-primary-button" onClick={apply}>
            {tr("ui.apply")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
