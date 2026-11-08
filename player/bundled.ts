import type { Language } from "../src/core/i18n/translations";
import manifest from "../src/start-content/examples/manifest.json";

/**
 * The modules that come with the app: the two examples of Weft (src/start-content/examples) - so that the app is not empty before the first module is
 * opened. Only those: the tutorials explain the editor, which this app does not have (and the one of them is 6 MB).
 */
type Localized = string | Partial<Record<Language, string>>;

const files = import.meta.glob("../src/start-content/examples/*.weft", { query: "?url", import: "default", eager: true }) as Record<string, string>;

export interface BundledExample {
  /** The file in the folder (unique). */
  file: string;
  url: string;
  title: Localized;
}

export function bundledExamples(): BundledExample[] {
  const result: BundledExample[] = [];
  for (const entry of manifest as { file: string; title: Localized }[]) {
    const url = files[`../src/start-content/examples/${entry.file}`];
    if (url) result.push({ file: entry.file, url, title: entry.title });
  }
  return result;
}

/** A text of the manifest in the language of the phone (English, then any other, when it has none for that). */
export function localizedTitle(text: Localized, language: Language): string {
  if (typeof text === "string") return text;
  return text[language] ?? text.en ?? Object.values(text)[0] ?? "";
}

export async function loadExampleBytes(example: BundledExample): Promise<Uint8Array> {
  const response = await fetch(example.url);
  if (!response.ok) throw new Error(`${example.file}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
