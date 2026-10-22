import type { Block, ShapeBlock } from "../types";

/**
 * Blurring what is behind a block ("Hintergrund durchscheinen lassen"): a text with a box (TextBlock.box.blur) or a rectangle or ellipse
 * (ShapeBlock.blurBehind). In the player and on the canvas it is CSS (backdrop-filter); in the PDF, which is a picture of the slide, the
 * background is drawn first and blurred by hand (features/editor/exportCanvas.ts) - the browser filter is not something html2canvas can draw.
 */

/** How strong the blur is, in cqw (percent of the slide's width): about 10px on a slide of 1280px. */
export const BACKDROP_BLUR_CQW = 0.8;

/** Whether `block` blurs what is behind it. */
export function hasBackdropBlur(block: Block): boolean {
  if (block.kind === "text") return !!block.box?.blur;
  if (block.kind === "shape") return !!block.blurBehind && (block.shapeKind === "rectangle" || block.shapeKind === "ellipse");
  return false;
}

/** The CSS for it (with the prefix that Safari and the webview of the Mac app still want). */
export function backdropBlurCss(): { backdropFilter: string; WebkitBackdropFilter: string } {
  const filter = `blur(${BACKDROP_BLUR_CQW}cqw)`;
  return { backdropFilter: filter, WebkitBackdropFilter: filter };
}

/** The corners a shape's box has to have for the blur to follow its outline: a rectangle's rounded corners (a percent of its shorter side), an
 * ellipse's full roundness. In cqw, as everything is. `slideAspect` is the slide's width : height. */
export function shapeCornerCss(block: ShapeBlock, slideAspect: number): string {
  if (block.shapeKind === "ellipse") return "50%";
  const shorter = Math.min(block.position.width, block.position.height / slideAspect);
  const { topLeft, topRight, bottomRight, bottomLeft } = block.cornerRadii;
  return [topLeft, topRight, bottomRight, bottomLeft].map((percent) => `${Math.round((percent / 100) * shorter * 1000) / 1000}cqw`).join(" ");
}

/** The style of a shape's block that blurs behind it. */
export function shapeBackdropCss(block: ShapeBlock, slideAspect: number): { backdropFilter: string; WebkitBackdropFilter: string; borderRadius: string } {
  return { ...backdropBlurCss(), borderRadius: shapeCornerCss(block, slideAspect) };
}

/** A box blur on RGBA pixels, three passes (which come close to a Gaussian blur of the standard deviation `sigma`), edges as they are. */
export function blurPixels(data: Uint8ClampedArray, width: number, height: number, sigma: number): void {
  if (sigma < 0.3) return;
  // The widths of three boxes that together make a Gaussian of this sigma.
  const ideal = Math.sqrt((12 * sigma * sigma) / 3 + 1);
  let lower = Math.floor(ideal);
  if (lower % 2 === 0) lower--;
  const upper = lower + 2;
  const smaller = Math.round((12 * sigma * sigma - 3 * lower * lower - 12 * lower - 9) / (-4 * lower - 4));
  const sizes = [0, 1, 2].map((i) => (i < smaller ? lower : upper));
  const scratch = new Uint8ClampedArray(data.length);
  for (const size of sizes) {
    const radius = (size - 1) / 2;
    boxPass(data, scratch, width, height, radius, true);
    boxPass(scratch, data, width, height, radius, false);
  }
}

function boxPass(source: Uint8ClampedArray, target: Uint8ClampedArray, width: number, height: number, radius: number, horizontal: boolean): void {
  const lines = horizontal ? height : width;
  const length = horizontal ? width : height;
  const step = horizontal ? 4 : width * 4;
  const lineStep = horizontal ? width * 4 : 4;
  const size = 2 * radius + 1;
  for (let line = 0; line < lines; line++) {
    const start = line * lineStep;
    for (let channel = 0; channel < 4; channel++) {
      const first = source[start + channel];
      const last = source[start + (length - 1) * step + channel];
      // The window starts left of the line, where the edge pixel stands in for what is not there.
      let sum = (radius + 1) * first;
      for (let i = 0; i < radius; i++) sum += source[start + Math.min(i, length - 1) * step + channel];
      for (let i = 0; i < length; i++) {
        const entering = i + radius < length ? source[start + (i + radius) * step + channel] : last;
        sum += entering;
        target[start + i * step + channel] = Math.round(sum / size);
        const leaving = i - radius >= 0 ? source[start + (i - radius) * step + channel] : first;
        sum -= leaving;
      }
    }
  }
}
