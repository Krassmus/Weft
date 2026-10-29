import { orderedValues } from "../src/core/document/ordering";
import { pageLabels } from "../src/core/document/pageLabels";
import { branchPageIds, sequenceOf } from "../src/core/document/sequence";
import { buildLanguageCatalog } from "../src/core/i18n/languages";
import { descriptorOf, exportedItemTexts, exportedTexts, itemsKeyOf, itemTextIsHtml, listFieldsOf } from "../src/core/blocks/registry";
import type { ListField } from "../src/core/blocks/types";
import { plainTextOfHtml } from "../src/core/document/translations";
import type { Block, WeftModule } from "../src/core/types";
import { CliError } from "./load";

/**
 * The texts of a module as a flat list for translation, and the way back (weft text export / import).
 *
 * Every text has a `key` that says where it belongs - `<block id>#<part>` - so that the list can be translated by anything that
 * turns text into text (a person, an AI, a translation service) without knowing how a module is built, and what comes back lands in
 * the right place. What is translated is the block's own wording; the module's languages are the locales ("de_DE") of
 * `content.languages`, the first being the one the blocks' own fields are in (see BlockTranslation in core/types.ts).
 */

export const TEXTS_FORMAT = "weft-texts";

export interface TextItem {
  /** Where the text belongs: "<block id>#html", "#question", "#option:<id>", "#item:<id>" or "#label" (a button). */
  key: string;
  /** All of these are HTML (the formatting of a text is tags around its words); a button's label too. */
  source: string;
  /** Where it is, in words: "Folie 2.a.1 · Quiz · Antwort 2". */
  context: string;
  /** The text in each target language (empty: not translated yet). This is what is filled in. */
  translations: Record<string, string>;
}

export interface TextsFile {
  format: typeof TEXTS_FORMAT;
  version: 1;
  /** What to do with this file - for whoever (or whatever) translates it. */
  instructions: string;
  file: string;
  module: { id: string; title: string };
  /** The language the texts are in. */
  from: string;
  /** The languages to translate into. */
  to: string[];
  items: TextItem[];
}

const INSTRUCTIONS =
  "Fülle für jeden Eintrag in `items` das Feld `translations.<Sprache>` mit der Übersetzung von `source`. " +
  "`source` ist HTML: Übersetze nur den sichtbaren Text, lasse alle Tags und Attribute (<b>, <font color=...>, <span style=...> usw.) " +
  "an derselben Stelle stehen. Platzhalter wie {{variable}} bleiben unverändert. In Lückentexten steht die richtige Antwort in " +
  "[[doppelten eckigen Klammern]]: Die Klammern bleiben, die Antwort darin wird mit übersetzt. Einträge, die schon eine " +
  "Übersetzung haben, bleiben, wie sie sind, wenn sie nicht geändert werden sollen. Schlüssel (`key`) und `source` nicht ändern. " +
  "Zurück ins Modul mit: weft text import <datei.weft> <diese-datei.json>.";

function hasWords(html: string | undefined): boolean {
  return plainTextOfHtml(html ?? "").trim() !== "";
}

/** The translatable texts of one block. */
function textsOfBlock(block: Block): { key: string; source: string; role: string }[] {
  const id = block.id;
  switch (block.kind) {
    case "sort": {
      const plain = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return [
        ...(block.startLabel?.trim() ? [{ key: `${id}#start`, source: plain(block.startLabel), role: "Wort am Anfang der Linie" }] : []),
        ...block.items
          .map((item, index) => ({ item, role: `Objekt ${index + 1}` }))
          .filter(({ item }) => hasWords(item.text))
          .map(({ item, role }) => ({ key: `${id}#item:${item.id}`, source: plain(item.text), role: item.kind === "image" ? `${role} (Bildbeschreibung)` : role })),
        ...(block.endLabel?.trim() ? [{ key: `${id}#end`, source: plain(block.endLabel), role: "Wort am Ende der Linie" }] : []),
      ];
    }
    default:
      // A block that describes itself (see core/blocks): its translatable texts are plain texts.
      return exportedTexts(block)
        .filter(({ value }) => hasWords(value))
        // (A formatted text is HTML already; a plain one is escaped first.)
        .map(({ part, role, value, html }) => ({ key: `${id}#${part}`, source: html ? value : value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"), role }))
        // (And the words of the items of its lists - a picture's caption: plain texts, escaped first, with the id of the item in the key.)
        .concat(
          exportedItemTexts(block)
            .filter(({ value }) => hasWords(value))
            // (The points of a list are formatted: HTML already.)
            .map(({ part, itemId, role, value, html }) => ({ key: `${id}#${part}:${itemId}`, source: html ? value : value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"), role })),
        )
        // (The label of the button of a revealer's window is an object field: it is not one of those the descriptor lists - see revealerBlock.)
        .concat(block.kind === "revealer" && block.button?.text.trim() ? [{ key: `${id}#button`, source: plainToHtml(block.button.text), role: "Button des Fensters" }] : []);
  }
}

/** A plain text escaped - the form in which the texts of a matching, a sorting puzzle and the other plain ones are exported. */
function escapePlain(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A plain text (lines) as paragraphs of HTML - the form every text of the list has - and back. */
function plainToHtml(text: string): string {
  return text
    .split("\n")
    .map((line) => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`)
    .join("");
}

function htmlToPlain(html: string): string {
  return html
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/** The list of a block that describes itself that a part of a text key (`item:<id>`, `option:<id>`) belongs to. */
function listOfPart(block: Block, part: string): ListField | undefined {
  const prefix = part.slice(0, part.indexOf(":"));
  return listFieldsOf(block).find(([, spec]) => (spec.cliPart ?? "item") === prefix)?.[1];
}

const KIND_NAMES: Record<string, string> = { matching: "Matching", sort: "Sortierrätsel", checker: "Checker", link: "Link", text: "Text", cloze: "Lückentext", quiz: "Quiz", list: "Liste", button: "Button", revealer: "Info-Symbol" };

/** The text a block has in `language`, if it has been translated (the block's own wording is not a translation). */
function existingTranslation(block: Block, key: string, language: string): string {
  const translation = (block as { translations?: Record<string, { html?: string; questionHtml?: string; options?: Record<string, string>; items?: Record<string, string>; text?: string; explanation?: string; title?: string; body?: string; alt?: string; startLabel?: string; endLabel?: string }> }).translations?.[language];
  if (!translation) return "";
  const part = key.slice(key.indexOf("#") + 1);
  // (A block that describes itself: the texts it exports are plain, escaped.)
  const field = exportedTexts(block).find((text) => text.part === part);
  if (field) {
    const t = translation as Record<string, string | undefined>;
    // (A formatted text: its translation's formatting - kept as `html`, or under a key of its own - else its plain words escaped.)
    if (field.html) {
      const htmlKey = field.formatted ? "html" : field.key;
      if (t[htmlKey] !== undefined) return t[htmlKey]!;
    }
    return (t[field.key] ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  if (part === "html" || part === "label") return translation.html ?? (part === "label" ? (translation.text ?? "") : "");
  // (The items of a list of a block that describes itself: plain texts, or formatted ones - a list's points, a quiz's options.)
  const list = listOfPart(block, part);
  if (list) {
    const own = (translation as Record<string, Record<string, string> | undefined>)[itemsKeyOf(list)]?.[part.slice(part.indexOf(":") + 1)] ?? "";
    // (A plain text is exported escaped - that is the form its translation is compared in.)
    return itemTextIsHtml(list) ? own : escapePlain(own);
  }
  if (part === "title" || part === "body" || part === "alt") return translation[part] ? plainToHtml(translation[part] as string) : "";
  if (part === "button") return translation.text ? plainToHtml(translation.text) : "";
  if (part === "start" || part === "end") return escapePlain((translation[part === "start" ? "startLabel" : "endLabel"] as string | undefined) ?? "");
  if (part.startsWith("item:")) {
    const own = translation.items?.[part.slice(5)] ?? "";
    // (The objects of a sorting puzzle are plain texts, exported escaped.)
    return block.kind === "sort" ? escapePlain(own) : own;
  }
  return "";
}

/** Every text of the module that is shown on a page (the layouts' too), in the order it is played. */
export function collectTexts(content: WeftModule): { key: string; source: string; context: string; block: Block }[] {
  const labels = pageLabels(content);
  const result: { key: string; source: string; context: string; block: Block }[] = [];
  const seen = new Set<string>();
  const addBlocks = (blocks: Block[], where: string) => {
    for (const block of blocks) {
      for (const item of textsOfBlock(block)) {
        if (seen.has(item.key)) continue;
        seen.add(item.key);
        result.push({ key: item.key, source: item.source, context: `${where} · ${descriptorOf(block)?.cliName ?? KIND_NAMES[block.kind] ?? block.kind} · ${item.role}`, block });
      }
    }
  };

  const order: string[] = [];
  for (const entry of sequenceOf(content)) {
    if (entry.kind === "page") order.push(entry.pageId);
    else for (const branch of content.logicBlocks[entry.logicBlockId]?.branches ?? []) order.push(...branchPageIds(branch));
  }
  // The layouts first: their texts are on every page that uses them, and give the rest its context (titles, ...).
  for (const layout of Object.values(content.layouts)) addBlocks(orderedValues(layout.blocks ?? {}) as Block[], `Layout „${layout.name}"`);
  for (const pageId of order) {
    const page = content.pages[pageId];
    if (!page || page.jump) continue;
    addBlocks(orderedValues(page.blocks ?? {}), `Folie ${labels[pageId] ?? "?"}`);
  }
  return result;
}

export function isKnownLocale(locale: string): boolean {
  return buildLanguageCatalog("en").some((entry) => entry.locale === locale);
}

export function exportTexts(
  content: WeftModule,
  options: { file: string; from?: string; to: string[]; onlyMissing?: boolean },
): TextsFile {
  const known = content.languages ?? [];
  const from = options.from ?? known[0];
  if (!from) {
    throw new CliError(
      "Das Modul hat keine eingestellte Sprache. Die Sprache der Texte mit --from angeben (zum Beispiel --from de_DE).",
    );
  }
  if (known.length > 0 && known[0] !== from) {
    throw new CliError(`Die Standardsprache des Moduls ist ${known[0]}, nicht ${from}. Ohne --from wird sie benutzt.`);
  }
  const to = options.to.filter((language) => language !== from);
  if (to.length === 0) throw new CliError("In welche Sprache soll übersetzt werden? --to fr_FR (mehrere: --to fr_FR,es_ES)");
  for (const locale of [from, ...to]) {
    if (!isKnownLocale(locale)) {
      throw new CliError(`„${locale}" ist kein bekannter Sprachcode. Er steht so wie de_DE, en_US, fr_FR (Sprache_REGION).`);
    }
  }
  const items: TextItem[] = [];
  for (const entry of collectTexts(content)) {
    const translations: Record<string, string> = {};
    for (const language of to) translations[language] = existingTranslation(entry.block, entry.key, language);
    if (options.onlyMissing && to.every((language) => translations[language] !== "")) continue;
    items.push({ key: entry.key, source: entry.source, context: entry.context, translations });
  }
  return {
    format: TEXTS_FORMAT,
    version: 1,
    instructions: INSTRUCTIONS,
    file: options.file,
    module: { id: content.id, title: content.title },
    from,
    to,
    items,
  };
}

// ---- import -------------------------------------------------------------------------------------------------------------------

export interface ImportReport {
  applied: number;
  unchanged: number;
  skipped: number;
  /** What was wrong, per text. `error` ones were not imported. */
  problems: { severity: "error" | "warning"; key: string; message: string }[];
  addedLanguages: string[];
}

const TAG = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;
const VOID = new Set(["br", "hr", "img", "wbr"]);

/** The tags of some html, in order, as written (name and attributes). */
function tagsOf(html: string): string[] {
  return [...html.matchAll(TAG)].map((m) => m[0].replace(/\s+/g, " ").toLowerCase());
}

/** Whether the tags of `html` open and close in order. */
function wellFormed(html: string): boolean {
  const stack: string[] = [];
  for (const match of html.matchAll(TAG)) {
    const name = match[1].toLowerCase();
    if (VOID.has(name) || match[0].endsWith("/>")) continue;
    if (match[0].startsWith("</")) {
      if (stack.pop() !== name) return false;
    } else stack.push(name);
  }
  return stack.length === 0;
}

function names(html: string, pattern: RegExp): string[] {
  return [...html.matchAll(pattern)].map((m) => m[0]).sort();
}

/** Checks one translation against its source: returns problems (errors keep it from being imported). */
export function checkTranslation(source: string, translated: string, isCloze: boolean): { severity: "error" | "warning"; message: string }[] {
  const problems: { severity: "error" | "warning"; message: string }[] = [];
  if (/<\s*(script|iframe|object|embed|style|link|meta)\b/i.test(translated) || /\son[a-z]+\s*=/i.test(translated) || /javascript:/i.test(translated)) {
    problems.push({ severity: "error", message: "enthält aktive Inhalte (Skript, Ereignis-Attribut, iframe ...) und wird nicht übernommen." });
    return problems;
  }
  if (!wellFormed(translated)) {
    problems.push({ severity: "error", message: "Die Tags sind nicht richtig geschachtelt oder nicht geschlossen - nicht übernommen." });
    return problems;
  }
  if (isCloze) {
    const blanksSource = [...source.matchAll(/\[\[[^\]]*\]\]/g)].length;
    const blanksTranslated = [...translated.matchAll(/\[\[[^\]]*\]\]/g)].length;
    if (blanksSource !== blanksTranslated) {
      problems.push({ severity: "error", message: `Der Lückentext hatte ${blanksSource} Lücken [[...]], die Übersetzung hat ${blanksTranslated} - nicht übernommen.` });
      return problems;
    }
  }
  const variablesSource = names(source, /\{\{[^{}<>]*\}\}/g);
  const variablesTranslated = names(translated, /\{\{[^{}<>]*\}\}/g);
  if (variablesSource.join() !== variablesTranslated.join()) {
    problems.push({ severity: "warning", message: `Die {{Variablen}} stimmen nicht überein (Quelle: ${variablesSource.join(" ") || "keine"}; Übersetzung: ${variablesTranslated.join(" ") || "keine"}).` });
  }
  if (tagsOf(source).sort().join("") !== tagsOf(translated).sort().join("")) {
    problems.push({ severity: "warning", message: "Die Formatierung (Tags) weicht von der Quelle ab." });
  }
  if (!plainTextOfHtml(translated).trim()) {
    problems.push({ severity: "warning", message: "Die Übersetzung hat keinen Text." });
  }
  return problems;
}

type MutableBlock = Block & {
  translations?: Record<string, { html?: string; questionHtml?: string; options?: Record<string, string>; items?: Record<string, string>; text?: string; explanation?: string; title?: string; body?: string; alt?: string }>;
};

/** Writes the translations of `file` into `content` (changed in place). Nothing is written for a text that has a problem that is an
 * error; a text whose translation is the one the block already has is left alone. */
export function importTexts(content: WeftModule, file: TextsFile): ImportReport {
  if (!file || file.format !== TEXTS_FORMAT || !Array.isArray(file.items)) {
    throw new CliError(`Das ist keine Textdatei von „weft text export" (format: "${TEXTS_FORMAT}" fehlt).`);
  }
  const report: ImportReport = { applied: 0, unchanged: 0, skipped: 0, problems: [], addedLanguages: [] };

  // The languages of the module: the one the texts are in first, then the ones translated into.
  const wanted = new Set<string>();
  for (const item of file.items) for (const [language, text] of Object.entries(item.translations ?? {})) if (text && text.trim()) wanted.add(language);
  const languages = content.languages ?? [];
  if (languages.length === 0) {
    if (!file.from) throw new CliError("In der Textdatei fehlt `from` (die Sprache der Texte) - das Modul hat keine eingestellte Sprache.");
    content.languages = [file.from];
    report.addedLanguages.push(file.from);
  } else if (file.from && languages[0] !== file.from) {
    throw new CliError(`Die Textdatei ist von ${file.from}, die Standardsprache des Moduls ist ${languages[0]}.`);
  }
  for (const language of wanted) {
    if (!isKnownLocale(language)) throw new CliError(`„${language}" ist kein bekannter Sprachcode (zum Beispiel fr_FR).`);
    if (!content.languages.includes(language)) {
      content.languages.push(language);
      report.addedLanguages.push(language);
    }
  }

  // The blocks by id, wherever they are.
  const blocks = new Map<string, MutableBlock>();
  for (const page of Object.values(content.pages)) for (const block of Object.values(page.blocks ?? {})) blocks.set(block.id, block as MutableBlock);
  for (const layout of Object.values(content.layouts)) for (const block of Object.values(layout.blocks ?? {})) blocks.set(block.id, block as MutableBlock);

  for (const item of file.items) {
    const hash = typeof item.key === "string" ? item.key.indexOf("#") : -1;
    if (hash < 0) {
      report.problems.push({ severity: "error", key: String(item.key), message: "Der Schlüssel hat nicht die Form <Block>#<Teil>." });
      report.skipped++;
      continue;
    }
    const block = blocks.get(item.key.slice(0, hash));
    const part = item.key.slice(hash + 1);
    if (!block) {
      report.problems.push({ severity: "error", key: item.key, message: "Diesen Block gibt es nicht (mehr) - übersprungen." });
      report.skipped++;
      continue;
    }
    for (const [language, translated] of Object.entries(item.translations ?? {})) {
      if (typeof translated !== "string" || translated.trim() === "") continue;
      const source = textsOfBlock(block).find((t) => t.key === item.key)?.source;
      if (source === undefined) {
        report.problems.push({ severity: "error", key: item.key, message: "Diesen Text gibt es im Block nicht (mehr) - übersprungen." });
        report.skipped++;
        continue;
      }
      const problems = checkTranslation(source, translated, exportedTexts(block).find((text) => text.part === part)?.blanks === true);
      for (const problem of problems) report.problems.push({ ...problem, key: `${item.key} (${language})` });
      if (problems.some((p) => p.severity === "error")) {
        report.skipped++;
        continue;
      }
      if (existingTranslation(block, item.key, language) === translated) {
        report.unchanged++;
        continue;
      }
      const translations = (block.translations ??= {});
      const target = (translations[language] ??= {});
      const described = exportedTexts(block).find((text) => text.part === part);
      const list = listOfPart(block, part);
      if (described?.html) {
        // A formatted text keeps its formatting; its plain words go with it - where it has any (a button's label: `html` and `text`).
        (target as Record<string, string>)[described.formatted ? "html" : described.key] = translated;
        if (described.formatted) (target as Record<string, string>)[described.key] = plainTextOfHtml(translated);
      } else if (list) {
        // (The items of a list of a block that describes itself: plain texts, or formatted ones.)
        const itemsKey = itemsKeyOf(list);
        const words = (target as Record<string, Record<string, string> | undefined>);
        (words[itemsKey] ??= {})[part.slice(part.indexOf(":") + 1)] = itemTextIsHtml(list) ? translated : htmlToPlain(translated);
      } else if (described) (target as Record<string, string>)[described.key] = htmlToPlain(translated);
      else if (part === "html") target.html = translated;
      else if (part === "label") {
        target.html = translated;
        target.text = plainTextOfHtml(translated);
      } else if (part === "title" || part === "body" || part === "alt") target[part] = htmlToPlain(translated);
      else if (part === "button") target.text = htmlToPlain(translated);
      else if (part === "start") target.startLabel = htmlToPlain(translated);
      else if (part === "end") target.endLabel = htmlToPlain(translated);
      else if (part.startsWith("item:")) (target.items ??= {})[part.slice(5)] = htmlToPlain(translated);
      report.applied++;
    }
  }
  return report;
}
