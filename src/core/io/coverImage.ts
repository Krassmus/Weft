import { useAssetStore } from "../assets/assetStore";
import type { WeftModule } from "../types";

/** The file a module keeps its cover picture in, at the top of a saved or exported archive (see packDocument). */
export const LOGO_FILE = "logo.png";

/** The widest a cover picture is kept (a larger upload is scaled down): it stands for the module in tiles, it does not have to be large. */
const COVER_MAX_WIDTH = 1280;

/** Any picture the browser can show, as a PNG (scaled down to COVER_MAX_WIDTH if it is wider). */
export async function imageToPng(file: Blob, maxWidth = COVER_MAX_WIDTH): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, maxWidth / Math.max(1, image.naturalWidth));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("The picture could not be turned into a PNG.");
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * What the editor can draw a module's first slide with (the picture a module without a cover gets, see coverLogoBytes). Registered by the
 * app's own window - the drawing needs a page to draw on, which the command line tool has not - so that this file can stay free of it.
 */
export interface CoverRenderer {
  /** What the picture depends on (the first slide and what it is made of), or null if there is nothing to draw. */
  keyOf(content: WeftModule): string | null;
  render(content: WeftModule): Promise<Blob | null>;
}

let renderer: CoverRenderer | null = null;
export function setCoverRenderer(next: CoverRenderer): void {
  renderer = next;
}

// The picture of the first slide, kept: it only has to be made again when the slide has changed - and, since a save happens every few
// seconds while somebody types, no more often than every REUSE_MS (the picture is then a little behind) unless `fresh` asks for it.
let cached: { key: string; bytes: Uint8Array; at: number } | null = null;
const REUSE_MS = 30_000;

/**
 * The bytes of `logo.png` for a module: the cover picture it has, else a picture of its first slide in the state it is in once everything that
 * happens by itself has happened and nothing has been clicked (null when that cannot be made, e.g. a module without slides). Never throws:
 * a file is saved with or without it.
 */
export async function coverLogoBytes(content: WeftModule, options: { fresh?: boolean } = {}): Promise<Uint8Array | null> {
  try {
    if (content.coverAssetId) {
      const blob = useAssetStore.getState().blobs.get(content.coverAssetId);
      if (blob) return new Uint8Array(await blob.arrayBuffer());
    }
    if (!renderer) return null;
    const key = renderer.keyOf(content);
    if (key === null) return null;
    const now = Date.now();
    // A copy every time: the zip is made in a worker that is handed the buffers (see zipInWorker in pack.ts) - the kept one would be gone
    // after the first save ("The object can not be cloned" on the next).
    if (cached && cached.key === key) return cached.bytes.slice();
    if (cached && !options.fresh && now - cached.at < REUSE_MS) return cached.bytes.slice();
    const png = await renderer.render(content);
    if (!png) return null;
    cached = { key, bytes: new Uint8Array(await png.arrayBuffer()), at: now };
    return cached.bytes.slice();
  } catch (error) {
    console.warn("The cover picture could not be made:", error);
    return null;
  }
}
