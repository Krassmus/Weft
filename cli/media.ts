import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";
import { CliError } from "./load";

/** What the tool can say about a picture or video file it is asked to put into a module. */
export interface MediaFile {
  kind: "image" | "video" | "audio";
  path: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  /** Pixels, when they could be told. */
  width?: number;
  height?: number;
  /** Things to know (a video that only some browsers play, a size that could not be read). */
  warnings: string[];
}

const IMAGES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};
const AUDIOS: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg",
  ".flac": "audio/flac",
};
const VIDEOS: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".mov": "video/quicktime",
};

function pngSize(b: Uint8Array): [number, number] | null {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
}

function gifSize(b: Uint8Array): [number, number] | null {
  if (b.length < 10 || b[0] !== 0x47 || b[1] !== 0x49) return null;
  return [b[6] | (b[7] << 8), b[8] | (b[9] << 8)];
}

function jpegSize(b: Uint8Array): [number, number] | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const length = (b[i + 2] << 8) | b[i + 3];
    // The start-of-frame markers carry the size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
    }
    i += 2 + length;
  }
  return null;
}

function webpSize(b: Uint8Array): [number, number] | null {
  if (b.length < 30 || String.fromCharCode(...b.slice(0, 4)) !== "RIFF" || String.fromCharCode(...b.slice(8, 12)) !== "WEBP") return null;
  const kind = String.fromCharCode(...b.slice(12, 16));
  if (kind === "VP8 ") return [(b[26] | (b[27] << 8)) & 0x3fff, (b[28] | (b[29] << 8)) & 0x3fff];
  if (kind === "VP8L") {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  if (kind === "VP8X") return [1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16))];
  return null;
}

function svgSize(text: string): [number, number] | null {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!tag) return null;
  const number = (name: string) => {
    const m = new RegExp(`\\b${name}\\s*=\\s*["']([\\d.]+)(?:px)?["']`, "i").exec(tag);
    return m ? parseFloat(m[1]) : null;
  };
  const width = number("width");
  const height = number("height");
  if (width && height) return [width, height];
  const box = /viewBox\s*=\s*["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)/i.exec(tag);
  return box ? [parseFloat(box[1]), parseFloat(box[2])] : null;
}

/** The size and codec of a video, if ffprobe is there. */
function probeVideo(path: string): { width?: number; height?: number; codec?: string } {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name", "-of", "csv=p=0", path],
      { encoding: "utf8", timeout: 20000, stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    const [codec, width, height] = out.split(",");
    return { codec, width: Number(width) || undefined, height: Number(height) || undefined };
  } catch {
    return {};
  }
}

/** Reads an image or video file (by its extension: nothing else is taken, so that a module cannot be made to carry just any file). */
export function readMedia(path: string): MediaFile {
  const extension = extname(path).toLowerCase();
  const kind: MediaFile["kind"] | null = IMAGES[extension] ? "image" : VIDEOS[extension] ? "video" : AUDIOS[extension] ? "audio" : null;
  if (!kind) {
    throw new CliError(`„${path}": nur Bilder (${Object.keys(IMAGES).join(" ")}), Videos (${Object.keys(VIDEOS).join(" ")}) und Audio (${Object.keys(AUDIOS).join(" ")}) lassen sich hinzufügen.`);
  }
  let bytes: Uint8Array;
  try {
    if (!statSync(path).isFile()) throw new Error("keine Datei");
    bytes = new Uint8Array(readFileSync(path));
  } catch (error) {
    throw new CliError(`Die Datei „${path}" lässt sich nicht lesen: ${(error as Error).message}`);
  }
  const media: MediaFile = {
    kind,
    path,
    fileName: basename(path).replace(/[\\/]/g, "_"),
    mimeType: (kind === "image" ? IMAGES : kind === "audio" ? AUDIOS : VIDEOS)[extension],
    bytes,
    warnings: [],
  };
  if (kind === "image") {
    const size =
      extension === ".png"
        ? pngSize(bytes)
        : extension === ".gif"
          ? gifSize(bytes)
          : extension === ".jpg" || extension === ".jpeg"
            ? jpegSize(bytes)
            : extension === ".webp"
              ? webpSize(bytes)
              : extension === ".svg"
                ? svgSize(Buffer.from(bytes).toString("utf8"))
                : null;
    if (size) [media.width, media.height] = size;
    else media.warnings.push("Die Größe des Bildes ließ sich nicht lesen - es bekommt eine Standardform, im Editor anpassen.");
  } else if (kind === "video") {
    const info = probeVideo(path);
    media.width = info.width;
    media.height = info.height;
    if (!info.width) media.warnings.push("Die Größe des Videos ließ sich nicht lesen (ffprobe fehlt) - 16:9 angenommen.");
    if (info.codec && /^(hevc|h265|prores|mpeg2video)$/i.test(info.codec)) {
      media.warnings.push(`Das Video ist ${info.codec}-kodiert: nicht jeder Browser spielt das ab. Für alle Browser H.264 (mp4) oder VP8/VP9 in WebM nehmen.`);
    }
    if (extension === ".mov") media.warnings.push("Ein .mov-Video spielt nicht überall; als .mp4 (H.264) ist es sicherer.");
  }
  return media;
}
