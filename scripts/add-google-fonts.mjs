#!/usr/bin/env node
// Adds Google Fonts (SIL OFL) to the fonts the app ships: downloads their woff2 files into public/fonts/, appends them to
// src/core/fonts/curatedFonts.ts (what the font list and the export read) and to src/fonts.css (the editor's own @font-face rules).
//
//   node scripts/add-google-fonts.mjs "Lato" "Quicksand" ...
//
// Per family: the regular and the bold face (400 / 700), upright and italic, as far as the family has them (a family with only
// one weight gets that one - the browser makes bold or italic up where it is missing). Only the latin and latin-ext subsets,
// like the fonts that are there already. Families that are already in curatedFonts.ts are skipped, so it can be run again.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FONT_DIR = join(root, "public", "fonts");
const CURATED = join(root, "src", "core", "fonts", "curatedFonts.ts");
const FONTS_CSS = join(root, "src", "fonts.css");
const SUBSETS = ["latin-ext", "latin"]; // the order the existing entries have
// Google serves woff2 files split by subset to a browser it recognises as modern.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const families = process.argv.slice(2);
if (families.length === 0) {
  console.error("Usage: node scripts/add-google-fonts.mjs <Family> [<Family> ...]");
  process.exit(1);
}

const slug = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function get(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response;
}

const metadata = JSON.parse(await (await get("https://fonts.google.com/metadata/fonts")).text());
const known = new Map(metadata.familyMetadataList.map((entry) => [entry.family, entry]));
const existing = readFileSync(CURATED, "utf8");

const entries = [];
const cssBlocks = [];
const problems = [];

for (const family of families) {
  if (existing.includes(`family: ${JSON.stringify(family)}`)) {
    console.log(`${family}: already there`);
    continue;
  }
  const meta = known.get(family);
  if (!meta) {
    problems.push(`${family}: not a Google Fonts family`);
    continue;
  }
  // The variants the family has, e.g. "400", "400i", "700".
  const have = new Set(Object.keys(meta.fonts));
  const tuples = []; // [italic 0|1, weight]
  for (const italic of [0, 1]) {
    const weights = [...have].filter((v) => v.endsWith("i") === Boolean(italic)).map((v) => parseInt(v, 10)).sort((a, b) => a - b);
    const wanted = [400, 700].filter((w) => weights.includes(w));
    if (wanted.length === 0 && weights.length > 0 && italic === 0) wanted.push(weights[0]);
    for (const w of wanted) tuples.push([italic, w]);
  }
  if (tuples.length === 0) {
    problems.push(`${family}: no usable weight`);
    continue;
  }
  const hasItalic = tuples.some(([italic]) => italic === 1);
  const spec = hasItalic ? `ital,wght@${tuples.map(([i, w]) => `${i},${w}`).join(";")}` : `wght@${tuples.map(([, w]) => w).join(";")}`;
  const cssUrl = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:${spec}&display=swap`;
  let css;
  try {
    css = await (await get(cssUrl, { headers: { "User-Agent": UA } })).text();
  } catch (error) {
    problems.push(`${family}: ${error.message}`);
    continue;
  }

  // Every @font-face rule, with the subset named in the comment above it.
  const faces = [];
  for (const match of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
    const [, subset, body] = match;
    if (!SUBSETS.includes(subset)) continue;
    const style = /font-style:\s*(\w+)/.exec(body)?.[1] ?? "normal";
    const weightText = /font-weight:\s*([\d ]+);/.exec(body)?.[1].trim() ?? "400";
    const url = /src:[^;]*url\(([^)]+)\)/.exec(body)?.[1];
    const unicodeRange = /unicode-range:\s*([^;]+);/.exec(body)?.[1].trim() ?? null;
    if (!url) continue;
    // A variable face may announce a range ("400 700"): it stands for the weights asked for within it.
    const [low, high] = weightText.split(" ").map(Number);
    const weights = tuples.filter(([i, w]) => (i === 1) === (style === "italic") && w >= low && w <= (high ?? low)).map(([, w]) => w);
    for (const weight of weights.length > 0 ? weights : [low]) faces.push({ subset, style, weight, url, unicodeRange });
  }
  if (faces.length === 0) {
    problems.push(`${family}: no latin face in the CSS`);
    continue;
  }

  // The same file for several weights (a variable font) is stored once, named "var" like the fonts that are there already:
  // "<slug>-var-<style>-<subset>" for a variable font, "<slug>-<weight>-<style>-<subset>" otherwise.
  const weightsOfFile = new Map();
  for (const face of faces) weightsOfFile.set(face.url, new Set([...(weightsOfFile.get(face.url) ?? []), face.weight]));
  const fileOf = new Map();
  for (const face of faces) {
    if (fileOf.has(face.url)) continue;
    const shared = weightsOfFile.get(face.url).size > 1;
    fileOf.set(face.url, `${slug(family)}-${shared ? "var" : face.weight}-${face.style}-${face.subset}.woff2`);
  }
  for (const [url, name] of fileOf) {
    const target = join(FONT_DIR, name);
    if (!existsSync(target)) await writeFile(target, Buffer.from(await (await get(url)).arrayBuffer()));
  }

  faces.sort(
    (a, b) =>
      (a.style === b.style ? 0 : a.style === "normal" ? -1 : 1) || a.weight - b.weight || SUBSETS.indexOf(a.subset) - SUBSETS.indexOf(b.subset),
  );
  const faceLines = faces.map(
    (f) => `      { weight: ${f.weight}, style: "${f.style}", unicodeRange: ${f.unicodeRange ? JSON.stringify(f.unicodeRange) : "null"}, file: ${JSON.stringify(fileOf.get(f.url))} },`,
  );
  entries.push(`  {\n    family: ${JSON.stringify(family)},\n    faces: [\n${faceLines.join("\n")}\n    ],\n  },`);
  for (const f of faces) {
    cssBlocks.push(
      `@font-face {\n  font-family: '${family.replace(/'/g, "\\'")}';\n  font-style: ${f.style};\n  font-weight: ${f.weight};\n  font-display: swap;\n  src: url('/fonts/${fileOf.get(f.url)}') format('woff2');${f.unicodeRange ? `\n  unicode-range: ${f.unicodeRange};` : ""}\n}`,
    );
  }
  console.log(`${family}: ${faces.length} faces, ${fileOf.size} files`);
}

if (entries.length > 0) {
  const marker = "];\n\nexport const CURATED_FONT_FAMILIES";
  if (!existing.includes(marker)) throw new Error("curatedFonts.ts has changed its shape");
  writeFileSync(CURATED, existing.replace(marker, `${entries.join("\n")}\n${marker}`));
  writeFileSync(FONTS_CSS, `${readFileSync(FONTS_CSS, "utf8").replace(/\s*$/, "")}\n\n${cssBlocks.join("\n\n")}\n`);
}
if (problems.length > 0) {
  console.error("\nNot added:\n" + problems.map((p) => `  ${p}`).join("\n"));
  process.exitCode = 2;
}
