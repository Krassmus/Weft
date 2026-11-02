import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { LANGUAGES } from "../src/core/i18n/translations";

/** The modules that come with Weft (src/start-content/): every entry of a manifest is a module that opens, and one that opens as a copy says so. */
const ROOT = join(__dirname, "../src/start-content");

for (const kind of ["templates", "examples", "tutorials"] as const) {
  const manifest = JSON.parse(readFileSync(join(ROOT, kind, "manifest.json"), "utf8")) as { file: string; title: Record<string, string> | string }[];
  const present = new Set(readdirSync(join(ROOT, kind)));

  describe(kind, () => {
    for (const entry of manifest.filter((e) => present.has(e.file))) {
      it(`${entry.file} is a module${kind === "tutorials" ? "" : " marked as a template"}`, () => {
        const files = unzipSync(new Uint8Array(readFileSync(join(ROOT, kind, entry.file))), { filter: (f) => f.name === "weft.json" });
        const content = JSON.parse(strFromU8(files["weft.json"])).content;
        expect(Object.keys(content.pages).length).toBeGreaterThan(0);
        // (What opens as a copy - a template, an example - says so; a tutorial is only played.)
        if (kind !== "tutorials") expect(content.template).toBe(true);
        // A module with texts in several languages has a title for each of them (or none is needed: the title falls back to English).
        const languages = (content.languages as string[]).map((l) => l.split("_")[0]);
        if (languages.length > 1 && typeof entry.title === "object" && Object.keys(entry.title).length > 2) {
          for (const language of languages.filter((l) => (LANGUAGES as readonly string[]).includes(l))) expect(entry.title[language], `${entry.file}: title in ${language}`).toBeTruthy();
        }
      });
    }
  });
}
