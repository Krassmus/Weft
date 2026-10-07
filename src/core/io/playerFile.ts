import { strFromU8, unzipSync } from "fflate";
import { blobToDataUrl } from "../runtime/buildPreviewAssetUrls";
import { localAssetUrl } from "./localAssetUrl";
import { PLAYER_MARKER_FILE } from "./pack";
import { bytesOfEncryptedScript } from "./unpack";

/**
 * A player file (see exportPlayerFile in fileIO.ts): a .weft archive that holds only the page that plays the
 * module and its media, marked by PLAYER_MARKER_FILE - no weft.json, no editing history, so Weft can't edit
 * it. Weft opens one into its player (features/player/), which plays index.html like a browser would.
 */
export interface PlayerFile {
  /** The module's page, ready to be the `srcDoc` of a sandboxed frame. */
  html: string;
  title: string;
}

/** Whether this archive is a player file. (Unpacks only the marker.) */
export function isPlayerArchive(zipBytes: Uint8Array): boolean {
  return PLAYER_MARKER_FILE in unzipSync(zipBytes, { filter: (file) => file.name === PLAYER_MARKER_FILE });
}

const ASSET_URLS_TAG = /(<script id="weft-asset-urls" type="application\/json">)[\s\S]*?(<\/script>)/;
const SAVE_VIA_HOST_TAG = /(<script id="weft-save-via-host" type="application\/json">)[\s\S]*?(<\/script>)/;
const DATA_TAG = /<script id="weft-data" type="application\/json">([\s\S]*?)<\/script>/;

/** In Weft's player the slide has rounded corners - except in full screen, where the window around it tells the page
 * so (see PlayerShell.tsx). The corners show the letterbox colour behind the slide. */
const PLAYER_STYLE = "<style>.weft-stage{border-radius:var(--weft-stage-radius,14px)}</style>";
const PLAYER_SCRIPT =
  '<script>window.addEventListener("message",function(e){var d=e.data;if(e.source===window.parent&&d&&d.source==="weft-host"&&d.type==="stage-radius")document.documentElement.style.setProperty("--weft-stage-radius",String(d.value));});</script>';

/** The page of a player file as Weft's player shows it: with the rounded slide (see PLAYER_STYLE). Done when it is
 * shown, not when the file is read, so that it is always the current version of this that is shown. */
export function withPlayerChrome(html: string): string {
  // The real closing tags: the head's is the last one before <body> (the player's script, further down, may mention
  // them in a string), the body's the last one of the page.
  const head = html.lastIndexOf("</head>", html.indexOf("<body>"));
  const body = html.lastIndexOf("</body>");
  if (head < 0 || body < 0) return html;
  return `${html.slice(0, head)}${PLAYER_STYLE}\n${html.slice(head, body)}${PLAYER_SCRIPT}\n${html.slice(body)}`;
}

/**
 * Makes a player file playable inside Weft: a sandboxed frame has no folder to read media from next to its page,
 * so every file of the archive is handed to the page directly (the player's own `weft-asset-urls` - the same
 * thing the editor's preview does), and the page is told that the window around it saves downloads.
 */
export async function loadPlayerFile(zipBytes: Uint8Array): Promise<PlayerFile> {
  const files = unzipSync(zipBytes);
  const page = files["index.html"];
  if (!page) throw new Error("index.html fehlt im Archiv – das ist keine gültige Player-Datei.");
  let html = strFromU8(page);

  const data = DATA_TAG.exec(html);
  const module = data ? (JSON.parse(data[1]) as { title?: string; assets?: { id: string; mimeType: string }[] }) : {};
  const mimeById = new Map((module.assets ?? []).map((asset) => [asset.id, asset.mimeType]));

  const urls: Record<string, string> = {};
  for (const [path, bytes] of Object.entries(files)) {
    if (!path.startsWith("assets/")) continue;
    // assets/<id>_<name>; an encrypted file (see encryptedScriptPath in pack.ts) is a script with its bytes in it
    const name = path.slice("assets/".length);
    const separator = name.indexOf("_");
    if (separator <= 0) continue;
    const id = name.slice(0, separator);
    const encrypted = name.endsWith(".enc.js");
    const raw = encrypted ? bytesOfEncryptedScript(bytes) : bytes;
    if (!raw) continue;
    const mimeType = encrypted ? "application/octet-stream" : (mimeById.get(id) ?? "application/octet-stream");
    const blob = new Blob([raw as BlobPart], { type: mimeType });
    // A video as a data: URL can be too much for the video decoder (see localAssetUrl); everything else is small.
    urls[id] = (mimeType.startsWith("video/") ? await localAssetUrl(id, blob, name) : null) ?? (await blobToDataUrl(blob));
  }

  html = html
    .replace(ASSET_URLS_TAG, (_, open: string, close: string) => open + JSON.stringify(urls).replace(/</g, "\\u003c") + close)
    .replace(SAVE_VIA_HOST_TAG, (_, open: string, close: string) => open + "true" + close);
  return { html, title: module.title ?? "" };
}
