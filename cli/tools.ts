import { basename, dirname, extname, join } from "node:path";
import * as actions from "../src/core/document/actions";
import { createEmptyDocument } from "../src/core/document/createEmptyDocument";
import { ensureBuiltinVariables } from "../src/core/document/variables";
import type { Block, WeftFileJson, WeftModule } from "../src/core/types";
import { buildOutline, outlineMarkdown } from "./inspect";
import type { Outline } from "./inspect";
import { CliError, loadWeft } from "./load";
import type { LoadedWeft } from "./load";
import { runOperations } from "./ops";
import type { Operation, OperationResult } from "./ops";
import { setCurrentModule } from "./storeStub";
import { exportTexts, importTexts, isKnownLocale } from "./texts";
import type { ImportReport, TextsFile } from "./texts";
import { validate } from "./validate";
import type { Finding } from "./validate";
import { writeWeft } from "./write";

/**
 * What the command line tool (main.ts) and the MCP server (mcp.ts) both do - one place, so that they cannot differ.
 */

export function inspectFile(file: string, options: { page?: string } = {}): { outline: Outline; markdown: string } {
  const loaded = loadWeft(file);
  const outline = buildOutline(loaded, options);
  return { outline, markdown: outlineMarkdown(outline, options.page !== undefined) };
}

export function validateFile(file: string): { findings: Finding[] } {
  return { findings: validate(loadWeft(file)) };
}

export function exportTextsOf(file: string, options: { from?: string; to: string[]; onlyMissing?: boolean }): TextsFile {
  const loaded = loadWeft(file);
  return exportTexts(loaded.content, { file: basename(file), ...options });
}

// ---- writing ------------------------------------------------------------------------------------------------------------------

/** The file a change is written to: `output` if given; else, for a file that is a working copy of this tool (name.ai.weft), that
 * file itself; else name.ai.weft next to it - the original is never the target by accident. */
export function targetFor(file: string, output: string | undefined): { target: string; inPlace: boolean } {
  if (output) return { target: output, inPlace: output === file };
  const ext = extname(file) || ".weft";
  const stem = basename(file, ext);
  if (stem.endsWith(".ai")) return { target: file, inPlace: true };
  return { target: join(dirname(file), `${stem}.ai${ext}`), inPlace: false };
}

function findingKey(f: Finding): string {
  return `${f.code}|${f.page?.id ?? ""}|${f.blockId ?? ""}|${f.message}`;
}

export interface EditOutcome {
  target: string;
  wrote: boolean;
  results: OperationResult[];
  /** Findings of the result that the file did not have before. */
  introduced: Finding[];
  /** How many findings of each severity the result has (all, not only the new ones). */
  totals: { error: number; warning: number; info: number };
  /** Why nothing was written, if it was not. */
  refused?: string;
}

/** Runs `operations` on a copy of the module in `file`, checks the result and writes it (see targetFor). Nothing is written when
 * an operation fails, or when the operations introduce errors (unless `allowErrors`), or on `dryRun`. */
export function editFile(
  file: string,
  operations: Operation[],
  options: { output?: string; dryRun?: boolean; allowErrors?: boolean; force?: boolean } = {},
): EditOutcome {
  const loaded = loadWeft(file);
  const before = new Set(validate(loaded).map(findingKey));
  const content = structuredClone(loaded.content);
  const results = runOperations(content, operations);
  const next: LoadedWeft = { ...loaded, content, json: { ...loaded.json, content } };
  const after = validate(next);
  const introduced = after.filter((f) => !before.has(findingKey(f)));
  const totals = { error: 0, warning: 0, info: 0 };
  for (const f of after) totals[f.severity]++;
  const { target, inPlace } = targetFor(file, options.output);
  const outcome: EditOutcome = { target, wrote: false, results, introduced, totals };
  if (options.dryRun) {
    outcome.refused = "Probelauf: nichts geschrieben.";
    return outcome;
  }
  if (introduced.some((f) => f.severity === "error") && !options.allowErrors) {
    outcome.refused = "Die Änderungen erzeugen Fehler; nichts geschrieben. Mit allow_errors/--allow-errors trotzdem schreiben.";
    return outcome;
  }
  writeWeft(file, next.json, target, options.force || inPlace);
  outcome.wrote = true;
  return outcome;
}

// ---- a new module -------------------------------------------------------------------------------------------------------------

export function createModule(options: { title?: string; languages?: string[]; aspectRatio?: string; demo?: boolean }): WeftFileJson {
  const doc = createEmptyDocument();
  const content = doc.content;
  if (!options.demo) {
    content.pages = {};
    content.sequence = {};
    content.logicBlocks = {};
    content.variables = [];
    ensureBuiltinVariables(content.variables);
    const layout = Object.values(content.layouts)[0];
    layout.blocks = {};
    setCurrentModule(content);
    try {
      // The one layout has a placeholder for the title of each page, then one empty page to begin with.
      const placeholder = actions.addBlockToLayout(layout.id, "placeholder");
      actions.updateLayoutBlock(layout.id, placeholder, {
        label: "Titel",
        position: { x: 5, y: 5, width: 90, height: 15 },
        html: "<h1>Titel der Folie</h1>",
      } as never);
      actions.addPageToSequence(-1, layout.id);
    } finally {
      setCurrentModule(null);
    }
  }
  if (options.title) content.title = options.title;
  if (options.aspectRatio) content.aspectRatio = options.aspectRatio as never;
  if (options.languages && options.languages.length > 0) {
    for (const language of options.languages) {
      if (!isKnownLocale(language)) throw new CliError(`„${language}" ist kein bekannter Sprachcode (zum Beispiel de_DE, fr_FR).`);
    }
    content.languages = options.languages;
  }
  return { formatVersion: doc.formatVersion, content };
}

export function newFile(output: string, options: Parameters<typeof createModule>[0] & { force?: boolean }): { target: string } {
  const json = createModule(options);
  // A module is a weft.json in a zip - nothing else is needed (Weft makes the player on the first save).
  writeWeft("", json, output, options.force);
  return { target: output };
}

// ---- texts --------------------------------------------------------------------------------------------------------------------

export interface TextImportOutcome {
  report: ImportReport;
  target: string;
  wrote: boolean;
}

export function importTextsFile(
  file: string,
  texts: TextsFile,
  options: { output?: string; dryRun?: boolean; force?: boolean } = {},
): TextImportOutcome {
  const loaded = loadWeft(file);
  const content = structuredClone(loaded.content);
  const report = importTexts(content, texts);
  const languages = [...new Set(texts.items.flatMap((i) => Object.keys(i.translations ?? {})))];
  // A translation does not make a working copy of "this tool" (name.ai.weft) the way an edit does: it goes to name.<language>.weft.
  const ext = extname(file) || ".weft";
  const target = options.output ?? join(dirname(file), `${basename(file, ext)}.${languages[0] ?? "texte"}${ext}`);
  const changed = report.applied > 0 || report.addedLanguages.length > 0;
  if (options.dryRun || !changed) return { report, target, wrote: false };
  content.modifiedAt = new Date().toISOString();
  writeWeft(file, { ...loaded.json, content }, target, options.force);
  return { report, target, wrote: true };
}

export type { Block, WeftModule };
