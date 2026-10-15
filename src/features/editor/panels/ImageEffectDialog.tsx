import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ImageBlock, ImageEffect, ImageEffectKind } from "../../../core/types";
import { ImageSvg, useImageBoxAspect } from "../blocks/ImageSvg";
import { StepperSlider } from "./StepperSlider";
import { tr } from "../../../core/i18n/tr";
import { ColorField } from "../ColorField";

export const IMAGE_EFFECT_KINDS: { id: ImageEffectKind; label: string }[] = [
  { id: "border", get label() { return tr("ui.border"); } },
  { id: "shadow", get label() { return tr("ui.shadow"); } },
  { id: "reflection", get label() { return tr("ui.reflection"); } },
  { id: "paper", get label() { return tr("ui.paper_edge"); } },
  { id: "glow", get label() { return tr("ui.glow"); } },
];

/** What an effect starts with when it is chosen. Lengths are cqw. */
function defaultEffect(kind: ImageEffectKind): ImageEffect {
  switch (kind) {
    case "border":
      return { kind, color: "#ffffff", width: 1, opacity: 1 };
    case "shadow":
      return { kind, color: "#000000", opacity: 0.45, offsetX: 0.8, offsetY: 1.2, blur: 1.5 };
    case "reflection":
      return { kind, opacity: 0.5, height: 60, squash: 100, skew: 0, gap: 0.5 };
    case "paper":
      return { kind, color: "#fbf8f1", width: 1.2, roughness: 40 };
    case "glow":
      return { kind, color: "#fde047", size: 2, strength: 60 };
  }
}

const PREVIEW_WIDTH_PX = 220;
const PREVIEW_MAX_HEIGHT_PX = 170;

/**
 * The dialog "Effekt" of an image (step two of editing it, after the mask): one effect - a border, a shadow, a reflection, a paper
 * edge or a glow - and its parameters, with the picture (and its mask) as it would look. "Übernehmen" puts it on the block.
 */
export function ImageEffectDialog({
  block,
  src,
  onApply,
  onClose,
}: {
  block: ImageBlock;
  src: string;
  onApply: (effect: ImageEffect | null) => void;
  onClose: () => void;
}) {
  const [effect, setEffect] = useState<ImageEffect | null>(block.effect ?? null);
  const boxAspect = useImageBoxAspect(block);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The picture is shown at a size of its own - what an effect looks like does not depend on it, as its lengths follow the block's
  // width (see imageSvgMarkup).
  const maxHeight = effect?.kind === "reflection" ? PREVIEW_MAX_HEIGHT_PX * 0.6 : PREVIEW_MAX_HEIGHT_PX;
  const previewHeight = Math.min(maxHeight, PREVIEW_WIDTH_PX / (boxAspect || 1));
  const previewWidth = previewHeight * (boxAspect || 1);
  const previewBlock: ImageBlock = { ...block, effect };

  const patch = (changes: Record<string, unknown>) => setEffect((current) => (current ? ({ ...current, ...changes } as ImageEffect) : current));
  const percent = (label: string, key: string, value: number, min = 0, max = 100) => (
    <div className="weft-field weft-text-format-wide" key={key}>
      <span>{label}</span>
      <StepperSlider label={label} value={Math.round(value * 100)} min={min} max={max} step={1} onChange={(v) => patch({ [key]: v / 100 })} />
    </div>
  );
  const length = (label: string, key: string, value: number, min: number, max: number, step = 0.1) => (
    <div className="weft-field weft-text-format-wide" key={key}>
      <span>{label}</span>
      <StepperSlider label={label} value={Math.round(value * 100) / 100} min={min} max={max} step={step} onChange={(v) => patch({ [key]: Math.round(v * 100) / 100 })} />
    </div>
  );
  const number = (label: string, key: string, value: number, min: number, max: number, step = 1) => (
    <div className="weft-field weft-text-format-wide" key={key}>
      <span>{label}</span>
      <StepperSlider label={label} value={value} min={min} max={max} step={step} onChange={(v) => patch({ [key]: v })} />
    </div>
  );
  const colour = (label: string, key: string, value: string) => (
    <label className="weft-field" key={key}>
      <span>{label}</span>
      <ColorField value={value} ariaLabel={label} onChange={(color) => patch({ [key]: color })} />
    </label>
  );

  return createPortal(
    <div className="weft-modal-backdrop" onClick={onClose}>
      <div className="weft-modal weft-text-format-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="weft-modal-header">
          <h3>{tr("ui.effect")}</h3>
          <button type="button" className="weft-icon-button" title={tr("ui.close")} onClick={onClose}>
            ×
          </button>
        </div>

        <div
          className="weft-image-effect-preview"
          aria-label={tr("ui.preview")}
          // A reflection reaches below the picture: room for it.
          style={effect?.kind === "reflection" ? { paddingBottom: 36 + previewHeight * 0.9 } : undefined}
        >
          <div style={{ width: previewWidth, height: previewHeight, position: "relative" }}>
            <ImageSvg block={{ ...previewBlock, position: { ...block.position, rotation: 0 } }} src={src} />
          </div>
        </div>

        <div className="weft-text-format-grid">
          <label className="weft-field weft-text-format-wide">
            <span>{tr("ui.effect")}</span>
            <select
              value={effect?.kind ?? "none"}
              onChange={(e) => setEffect(e.target.value === "none" ? null : defaultEffect(e.target.value as ImageEffectKind))}
            >
              <option value="none">{tr("ui.none")}</option>
              {IMAGE_EFFECT_KINDS.map((kind) => (
                <option key={kind.id} value={kind.id}>
                  {kind.label}
                </option>
              ))}
            </select>
          </label>

          {effect?.kind === "border" && [
            colour(tr("ui.colour"), "color", effect.color),
            length("Dicke (% der Folienbreite)", "width", effect.width, 0.1, 8),
            percent(tr("ui.opacity_2"), "opacity", effect.opacity),
          ]}
          {effect?.kind === "shadow" && [
            colour(tr("ui.colour"), "color", effect.color),
            percent(tr("ui.opacity_2"), "opacity", effect.opacity),
            length(tr("ui.offset_to_the_right"), "offsetX", effect.offsetX, -10, 10),
            length(tr("ui.offset_downwards"), "offsetY", effect.offsetY, -10, 10),
            length(tr("ui.blur"), "blur", effect.blur, 0, 12),
          ]}
          {effect?.kind === "reflection" && [
            percent(tr("ui.opacity_2"), "opacity", effect.opacity),
            number(tr("ui.length_of_the_reflection"), "height", effect.height, 5, 100),
            number(tr("ui.distortion_height"), "squash", effect.squash, 20, 100),
            number(tr("ui.distortion_tilt"), "skew", effect.skew, -60, 60),
            length(tr("ui.distance_to_the_image"), "gap", effect.gap, 0, 10),
          ]}
          {effect?.kind === "paper" && [
            colour(tr("ui.colour_of_the_paper"), "color", effect.color),
            length(tr("ui.width_of_the_border"), "width", effect.width, 0.1, 8),
            number(tr("ui.roughness_of_the_edge"), "roughness", effect.roughness, 0, 100),
          ]}
          {effect?.kind === "glow" && [
            colour(tr("ui.colour"), "color", effect.color),
            length(tr("ui.size"), "size", effect.size, 0.2, 10),
            number(tr("ui.strength"), "strength", effect.strength, 0, 100),
          ]}
        </div>

        <div className="weft-text-format-actions">
          <button type="button" className="weft-ghost-button" onClick={onClose}>
            {tr("ui.cancel")}
          </button>
          <button
            type="button"
            className="weft-primary-button"
            onClick={() => {
              onApply(effect);
              onClose();
            }}
          >
            {tr("ui.apply")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
