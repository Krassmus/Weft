import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { unzipSync } from "fflate";
import { aspectRatioNumeric } from "../src/core/aspectRatio";
import { buildFontFaceCss } from "../src/core/fonts/fontFaceCss";
import { pageLabels } from "../src/core/document/pageLabels";
import { buildRuntimeHtml } from "../src/core/runtime/buildRuntimeHtml";
import { CliError, loadWeft } from "./load";

/**
 * A picture of a page: the module's own player (what a learner sees) in a headless Chrome, with everything of the page on it - no
 * Aufbau waits for its event (see renderMode in core/runtime/player.runtime.js). What a program that builds a module needs to see
 * what it has built: text that runs out of its box, blocks on top of each other, a layout that does not fit.
 *
 * Needs a Chrome, Chromium, Edge or Brave on the computer (or the path of one in WEFT_CHROME / `chrome`). Nothing else.
 */

/**
 * Runs Chrome until the picture is there, then ends it: a headless Chrome with a page that still has timers (a player) does not
 * always end by itself after the screenshot.
 */
function takeScreenshot(chrome: string, args: string[], pngPath: string, timeoutMs = 60000): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(chrome, args, { stdio: "ignore" });
    let lastSize = -1;
    let stable = 0;
    let finished = false;
    const done = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearInterval(poll);
      clearTimeout(timer);
      child.kill("SIGKILL");
      if (error) reject(error);
      else resolvePromise();
    };
    const poll = setInterval(() => {
      if (!existsSync(pngPath)) return;
      const size = statSync(pngPath).size;
      // Written completely when the size stops changing.
      if (size > 0 && size === lastSize) stable++;
      else stable = 0;
      lastSize = size;
      if (stable >= 2) done();
    }, 150);
    const timer = setTimeout(() => done(new Error("Chrome hat nicht rechtzeitig ein Bild geliefert.")), timeoutMs);
    child.on("error", (error) => done(error));
    child.on("exit", () => {
      // Ended by itself: the picture is there or it never will be.
      setTimeout(() => done(existsSync(pngPath) ? undefined : new Error("Chrome wurde beendet, ohne ein Bild zu liefern.")), 300);
    });
  });
}

const CANDIDATES: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ],
  linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium", "/usr/bin/microsoft-edge"],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ],
};

export function findChrome(given?: string): string {
  const wanted = given ?? process.env.WEFT_CHROME;
  if (wanted) {
    if (!existsSync(wanted)) throw new CliError(`Der Browser „${wanted}" (WEFT_CHROME / --chrome) ist nicht da.`);
    return wanted;
  }
  for (const candidate of CANDIDATES[process.platform] ?? []) if (existsSync(candidate)) return candidate;
  throw new CliError(
    "Zum Zeichnen einer Folie wird Chrome, Chromium, Edge oder Brave gebraucht, und keiner wurde gefunden. Den Pfad in WEFT_CHROME angeben " +
      "(oder mit --chrome).",
  );
}

/** The folder public/fonts of the Weft checkout this tool was built in. */
function curatedFontsFolder(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../public/fonts");
}

export interface RenderedPage {
  /** What was asked for ("2.a.1", an id). */
  ref: string;
  label: string;
  pageId: string;
  png: Uint8Array;
  width: number;
  height: number;
}

export interface RenderOptions {
  /** Pixels wide; the height follows from the shape of the module's slides. Default 1280. */
  width?: number;
  /** The language to show (a locale of the module). */
  language?: string;
  /** "all": everything of the page is there (default); "start": the page as it is when it begins - what waits for an Aufbau is not. */
  state?: "all" | "start";
  chrome?: string;
}

export async function renderPages(file: string, refs: string[], options: RenderOptions = {}): Promise<RenderedPage[]> {
  const loaded = loadWeft(file);
  const { content } = loaded;
  const labels = pageLabels(content);
  const width = Math.max(320, Math.min(options.width ?? 1280, 3840));
  const height = Math.round(width / aspectRatioNumeric(content.aspectRatio));
  const chrome = findChrome(options.chrome);
  if (options.language && !(content.languages ?? []).includes(options.language)) {
    throw new CliError(`Das Modul hat die Sprache „${options.language}" nicht (es hat: ${(content.languages ?? []).join(", ") || "keine"}).`);
  }

  // The pages asked for.
  const wanted = refs.map((ref) => {
    const id = content.pages[ref] ? ref : Object.entries(labels).find(([, label]) => label === ref)?.[0];
    if (!id) throw new CliError(`Es gibt keine Folie „${ref}". Folien heißen wie in der Übersicht (3, 2.a.1).`);
    if (content.pages[id].jump) throw new CliError(`Folie ${labels[id]} ist eine Sprung-Folie: sie wird nie gezeigt, es gibt nichts zu zeichnen.`);
    return { ref, id, label: labels[id] ?? ref };
  });

  const folder = mkdtempSync(join(tmpdir(), "weft-render-"));
  try {
    // The archive's pictures, videos and fonts, where the page looks for them (assets/<id>_<name>).
    if (loaded.archive) {
      const files = unzipSync(new Uint8Array(readFileSync(file)), { filter: (f) => f.name.startsWith("assets/") || f.name.startsWith("fonts/") });
      for (const [name, data] of Object.entries(files)) {
        const target = join(folder, name);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, data);
      }
    }
    const fontFaceCss = await buildFontFaceCss(
      content,
      async (fileName) => {
        const path = join(curatedFontsFolder(), fileName);
        return existsSync(path) ? `data:font/woff2;base64,${readFileSync(path).toString("base64")}` : "";
      },
      async (font) => {
        const path = join(folder, "fonts", `${font.id}_${font.fileName}`);
        return existsSync(path) ? `data:font/ttf;base64,${readFileSync(path).toString("base64")}` : "";
      },
    );

    const results: RenderedPage[] = [];
    for (const [index, page] of wanted.entries()) {
      let html = await buildRuntimeHtml(content, {}, fontFaceCss, page.id, options.language ?? null);
      if (options.state !== "start") {
        html = html.replace('<script id="weft-start-page"', '<script id="weft-render-mode" type="application/json">{"all":true}</script>\n<script id="weft-start-page"');
      }
      const htmlPath = join(folder, `page-${index}.html`);
      const pngPath = join(folder, `page-${index}.png`);
      writeFileSync(htmlPath, html);
      try {
        await takeScreenshot(
          chrome,
          [
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            "--allow-file-access-from-files",
            "--force-device-scale-factor=1",
            `--user-data-dir=${join(folder, "profile")}`,
            `--window-size=${width},${height}`,
            "--virtual-time-budget=3000",
            `--screenshot=${pngPath}`,
            pathToFileURL(htmlPath).href,
          ],
          pngPath,
        );
      } catch (error) {
        throw new CliError(`Chrome hat die Folie ${page.label} nicht gezeichnet: ${(error as Error).message}`);
      }
      if (!existsSync(pngPath)) throw new CliError(`Chrome hat für Folie ${page.label} kein Bild geliefert.`);
      results.push({ ref: page.ref, label: page.label, pageId: page.id, png: new Uint8Array(readFileSync(pngPath)), width, height });
    }
    return results;
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}
