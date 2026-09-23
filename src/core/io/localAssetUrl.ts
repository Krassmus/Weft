import { convertFileSrc } from "@tauri-apps/api/core";
import { appCacheDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { isTauri } from "./fileIO";

// assetId -> already-converted URL, so a large file is only ever written to disk once per
// session rather than on every preview open.
const urlCache = new Map<string, string>();

async function cacheDir(): Promise<string> {
  const dir = await join(await appCacheDir(), "preview-assets");
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Writes a blob to a stable cache file and returns a URL the webview can load it from directly,
 * via Tauri's own asset protocol (see tauri.conf.json's security.assetProtocol, scoped to
 * $APPCACHE) - the scalable alternative to a data: URI for the live preview's sandboxed iframe
 * (see PreviewFrame.tsx). A data: URI means holding the *entire* base64-inflated file in memory
 * as part of one giant HTML string; for a large video that's not just slow, WebKit's video
 * decoder can fail outright on a big enough one - which is exactly what an 84MB upload hit in
 * practice: the video showed "broken" in the preview despite being perfectly playable in the
 * editor's own <video> (which reads the same blob through a normal blob: object URL - no
 * size-dependent encoding step at all). blob: URLs aren't an option here either: the preview
 * iframe is sandboxed without allow-same-origin, giving it an opaque origin that can't
 * dereference a blob: URL created in the parent window.
 *
 * null outside Tauri (the browser-only dev preview - see isTauri()), where this protocol isn't
 * available at all; callers fall back to a data: URI in that case.
 */
export async function localAssetUrl(assetId: string, blob: Blob, fileName: string): Promise<string | null> {
  if (!isTauri()) return null;
  const cached = urlCache.get(assetId);
  if (cached) return cached;
  const dir = await cacheDir();
  // The asset protocol sniffs content for its Content-Type (so this works even without a real
  // extension), but a real one is a cheap way to rule that whole path out - keep it if the
  // original file name had one.
  const extMatch = /\.([a-zA-Z0-9]+)$/.exec(fileName);
  const path = await join(dir, extMatch ? `${assetId}.${extMatch[1]}` : assetId);
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  const url = convertFileSrc(path);
  urlCache.set(assetId, url);
  return url;
}
