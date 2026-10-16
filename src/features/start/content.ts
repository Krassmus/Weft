
/**
 * The modules that come with Weft, shown on the start screen: templates (a way to start a module), examples (a finished module to
 * explore) and tutorials (modules that explain Weft, played in the player). They are .weft files in src/start-content/<kind>/,
 * described by that folder's manifest.json (see the README there). A manifest entry whose file isn't there (yet) is left out.
 */
export type ContentKind = "templates" | "examples" | "tutorials";

type Localized = string | Partial<Record<"de" | "en", string>>;

interface ManifestEntry {
  /** The file in the folder. */
  file: string;
  title: Localized;
  description?: Localized;
  /** A short label on the picture ("Grundlagen"). */
  tag?: Localized;
  /** About how long a tutorial takes. */
  minutes?: number;
}

export interface BundledModule {
  kind: ContentKind;
  file: string;
  url: string;
  title: Localized;
  description?: Localized;
  tag?: Localized;
  minutes?: number;
}

const files = import.meta.glob("../../start-content/*/*.weft", { query: "?url", import: "default", eager: true }) as Record<string, string>;
const manifests = import.meta.glob("../../start-content/*/manifest.json", { import: "default", eager: true }) as Record<string, ManifestEntry[]>;

/** The modules of one kind, in the order of the manifest. */
export function bundledModules(kind: ContentKind): BundledModule[] {
  const manifest = manifests[`../../start-content/${kind}/manifest.json`] ?? [];
  const result: BundledModule[] = [];
  for (const entry of manifest) {
    const url = files[`../../start-content/${kind}/${entry.file}`];
    if (url) result.push({ kind, file: entry.file, url, title: entry.title, description: entry.description, tag: entry.tag, minutes: entry.minutes });
  }
  return result;
}

/** A text of the manifest in the language of the editor (the other one, then any, when it has none for that). */
export function localized(text: Localized | undefined, lang: "de" | "en"): string {
  if (text === undefined) return "";
  if (typeof text === "string") return text;
  return text[lang] ?? text.en ?? text.de ?? "";
}

export async function loadBundledBytes(module: BundledModule): Promise<Uint8Array> {
  const response = await fetch(module.url);
  if (!response.ok) throw new Error(`${module.file}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

