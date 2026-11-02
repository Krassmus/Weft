import { unzipSync } from "fflate";
import type { Language } from "../i18n/translations";
import { usedAssetIds, withoutDeletedPages } from "../document/usedAssets";
import { buildInlineFontFaceCss } from "../runtime/buildInlineFontFaceCss";
import { blobToDataUrl } from "../runtime/buildPreviewAssetUrls";
import { buildRuntimeHtml } from "../runtime/buildRuntimeHtml";
import { localAssetUrl } from "./localAssetUrl";
import { loadPlayerFile } from "./playerFile";
import type { PlayerFile } from "./playerFile";
import { unpackDocument } from "./unpack";

/**
 * The language a module that comes with Weft starts in: the one of its languages that is the language of Weft's interface, otherwise
 * English, otherwise none (the player then picks as it would for a learner: the browser's language, or the module's first).
 */
export function startLocaleFor(languages: readonly string[], language: Language): string | null {
  const base = (locale: string) => locale.split(/[_-]/)[0].toLowerCase();
  return languages.find((locale) => base(locale) === language) ?? languages.find((locale) => base(locale) === "en") ?? null;
}

/** The page of a module with the language it starts in set (see startLocaleFor) - for a page that is already made, like the one in a player file. */
export function withStartLanguage(html: string, language: Language): string {
  const data = DATA_TAG.exec(html);
  const languages = data ? ((JSON.parse(data[1]) as { languages?: string[] }).languages ?? []) : [];
  const locale = startLocaleFor(languages, language);
  return html.replace(START_LANGUAGE_TAG, (_, open: string, close: string) => open + JSON.stringify(locale) + close);
}

const DATA_TAG = /<script id="weft-data" type="application\/json">([\s\S]*?)<\/script>/;
const START_LANGUAGE_TAG = /(<script id="weft-start-language" type="application\/json">)[\s\S]*?(<\/script>)/;

/**
 * Makes a module that comes with Weft playable in Weft's player - in `language`, the language of Weft's interface. Used for the tutorials
 * on the start screen (they are only played, never edited).
 *
 * A file the app saved has its own page (index.html), but that page does not know which language to start in; and a file that a tool like
 * the `weft` command line wrote has none. So the page is made from the module itself (weft.json), the way the app makes it when it saves,
 * with the start language set. A player file (no weft.json) has only its page: the start language is written into that.
 */
export async function loadModuleForPlay(zipBytes: Uint8Array, language: Language): Promise<PlayerFile> {
  const files = unzipSync(zipBytes);
  if (!files["weft.json"]) {
    const player = await loadPlayerFile(zipBytes);
    return { html: withStartLanguage(player.html, language), title: player.title };
  }

  // (importAssets: false - the pictures are read from the archive here and not put into the editor's own store.)
  const content = unpackDocument(zipBytes, { importAssets: false }).content;
  const used = usedAssetIds(content);
  const urls: Record<string, string> = {};
  for (const meta of content.assets) {
    if (!used.has(meta.id)) continue;
    const path = Object.keys(files).find((name) => name.startsWith(`assets/${meta.id}_`));
    if (!path) continue;
    const blob = new Blob([files[path] as BlobPart], { type: meta.mimeType });
    // A video as a data: URL can be too much for the video decoder (see localAssetUrl); everything else is small.
    urls[meta.id] = (meta.mimeType.startsWith("video/") ? await localAssetUrl(meta.id, blob, path) : null) ?? (await blobToDataUrl(blob));
  }
  const played = withoutDeletedPages(content);
  const html = await buildRuntimeHtml(played, urls, await buildInlineFontFaceCss(played), null, startLocaleFor(content.languages, language), true);
  return { html, title: content.title ?? "" };
}
