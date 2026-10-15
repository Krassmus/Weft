import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { loadWeft, CliError } from "./load";
import { exportTexts, importTexts } from "./texts";
import type { TextsFile } from "./texts";
import { writeWeft } from "./write";
import { buildOutline, outlineMarkdown } from "./inspect";
import { definitionJson, describeDefinition, fullSchema, listDefinitions } from "./schema";
import { validate } from "./validate";
import type { Finding } from "./validate";

const HELP = `weft - ein Lernmodul (.weft) lesen und prüfen

Benutzung:
  weft inspect <datei> [--page <nummer>] [--json]
      Gliederung: Layouts, Variablen, Folien mit ihren Blöcken, Ereignisse und Auslöser.
      --page 2.a.1   eine Folie ausführlich (Positionen, Effekte, Ereignisse, Auslöser)
  weft validate <datei> [--json] [--strict]
      Prüft Struktur und Inhalt (Verweise, Dateien, Auslöser, Variablen, Übersetzungen ...).
      Ende mit Status 1, wenn es Fehler gibt (mit --strict auch bei Warnungen).
  weft text export <datei> --to <sprache[,sprache]> [--from <sprache>] [--missing] [-o <texte.json>]
      Alle Texte des Moduls als Liste zum Übersetzen (HTML mit Schlüssel, Quelle, Fundstelle).
      Ohne -o auf der Standardausgabe. --missing: nur, was noch keine Übersetzung hat.
  weft text import <datei> <texte.json> [-o <ziel.weft>] [--dry-run] [--force]
      Schreibt die übersetzten Texte in ein NEUES Modul (nie in die Quelle): Standard
      <name>.<sprache>.weft neben der Datei. Fehlende Sprachen werden dem Modul hinzugefügt.
  weft schema [<name>] [--list] [--json] [--full]
      Das Dateiformat. Ohne Name: die Arten von Blöcken. <name>: eine Definition oder die Art
      eines Blocks (zum Beispiel "quiz", "ButtonBlock", "Page").
  weft help

Statuscodes: 0 in Ordnung, 1 Prüfung fand Fehler, 2 Aufruf oder Datei falsch.
Eine Datei ist ein .weft-Archiv (oder ein weft.json). Die Quelle wird nie verändert.
`;

interface Args {
  positional: string[];
  flags: Map<string, string | true>;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      const next = argv[i + 1];
      if (["page", "format", "to", "from", "output"].includes(name) && next !== undefined && !next.startsWith("--")) {
        flags.set(name, next);
        i++;
      } else flags.set(name, true);
    } else if (arg === "-o" && argv[i + 1] !== undefined) {
      flags.set("output", argv[++i]);
    } else positional.push(arg);
  }
  return { positional, flags };
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;
const SEVERITY_MARK = { error: "FEHLER ", warning: "Warnung", info: "Hinweis" } as const;

function whereText(f: Finding): string {
  const parts: string[] = [];
  if (f.page) parts.push(`Folie ${f.page.label}`);
  if (f.layout) parts.push(`Layout „${f.layout.name}"`);
  if (f.blockId) parts.push(`Block ${f.blockId}`);
  return parts.join(", ");
}

function printFindings(findings: Finding[], file: string): void {
  const sorted = [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  if (findings.length === 0) {
    console.log(`${file}: in Ordnung - nichts gefunden.`);
    return;
  }
  console.log(`${file}: ${counts.error} Fehler, ${counts.warning} Warnungen, ${counts.info} Hinweise\n`);
  for (const f of sorted) {
    const where = whereText(f);
    console.log(`${SEVERITY_MARK[f.severity]} [${f.code}]${where ? ` ${where}:` : ""} ${f.message}`);
    if (f.hint) console.log(`           → ${f.hint}`);
  }
}

function main(argv: string[]): number {
  const { positional, flags } = parseArgs(argv);
  const [command, ...rest] = positional;
  const json = flags.has("json") || flags.get("format") === "json";

  switch (command) {
    case undefined:
    case "help":
    case "--help": {
      console.log(HELP);
      return command === undefined ? 2 : 0;
    }
    case "schema": {
      const name = rest[0];
      if (flags.has("full")) {
        console.log(JSON.stringify(fullSchema(), null, 2));
      } else if (!name || flags.has("list")) {
        console.log(listDefinitions());
      } else if (json) {
        console.log(JSON.stringify(definitionJson(name), null, 2));
      } else {
        console.log(describeDefinition(name));
      }
      return 0;
    }
    case "text": {
      const [what, file, extra] = rest;
      if (what === "export") {
        if (!file) throw new CliError("Welche Datei? weft text export <datei> --to fr_FR");
        const to = typeof flags.get("to") === "string" ? (flags.get("to") as string).split(",").map((s) => s.trim()).filter(Boolean) : [];
        const from = typeof flags.get("from") === "string" ? (flags.get("from") as string) : undefined;
        const loaded = loadWeft(file);
        const texts = exportTexts(loaded.content, { file: basename(file), from, to, onlyMissing: flags.has("missing") });
        const output = typeof flags.get("output") === "string" ? (flags.get("output") as string) : null;
        const text = JSON.stringify(texts, null, 2) + "\n";
        if (output) {
          writeFileSync(output, text);
          console.error(`${texts.items.length} Texte nach ${output} geschrieben (${texts.from} → ${texts.to.join(", ")}).`);
        } else console.log(text);
        return 0;
      }
      if (what === "import") {
        if (!file || !extra) throw new CliError("weft text import <datei> <texte.json>");
        const loaded = loadWeft(file);
        let texts: TextsFile;
        try {
          texts = JSON.parse(readFileSync(extra, "utf8")) as TextsFile;
        } catch (error) {
          throw new CliError(`Die Textdatei „${extra}" lässt sich nicht lesen: ${(error as Error).message}`);
        }
        const report = importTexts(loaded.content, texts);
        for (const problem of report.problems) {
          console.error(`${problem.severity === "error" ? "FEHLER " : "Warnung"} ${problem.key}: ${problem.message}`);
        }
        const wantedLanguages = [...new Set(texts.items.flatMap((i) => Object.keys(i.translations ?? {})))];
        const given = typeof flags.get("output") === "string" ? (flags.get("output") as string) : null;
        const target = given ?? join(dirname(file), `${basename(file, extname(file))}.${wantedLanguages[0] ?? "texte"}${extname(file) || ".weft"}`);
        console.log(
          `${report.applied} Texte übernommen, ${report.unchanged} unverändert, ${report.skipped} übersprungen` +
            (report.addedLanguages.length > 0 ? `; Sprachen hinzugefügt: ${report.addedLanguages.join(", ")}` : "") +
            ".",
        );
        if (flags.has("dry-run")) {
          console.log("(Probelauf: es wurde nichts geschrieben.)");
        } else if (report.applied === 0 && report.addedLanguages.length === 0) {
          console.log("Nichts zu schreiben.");
        } else {
          loaded.json.content.modifiedAt = new Date().toISOString();
          writeWeft(file, loaded.json, target, flags.has("force"));
          console.log(`Geschrieben: ${target}`);
        }
        return report.problems.some((p) => p.severity === "error") ? 1 : 0;
      }
      throw new CliError("weft text export | import");
    }
    case "inspect": {
      if (!rest[0]) throw new CliError("Welche Datei? weft inspect <datei>");
      const loaded = loadWeft(rest[0]);
      const page = typeof flags.get("page") === "string" ? (flags.get("page") as string) : undefined;
      const outline = buildOutline(loaded, { page });
      console.log(json ? JSON.stringify(outline, null, 2) : outlineMarkdown(outline, page !== undefined));
      return 0;
    }
    case "validate": {
      if (!rest[0]) throw new CliError("Welche Datei? weft validate <datei>");
      const loaded = loadWeft(rest[0]);
      const findings = validate(loaded);
      if (json) {
        console.log(JSON.stringify({ file: rest[0], findings }, null, 2));
      } else {
        printFindings(findings, rest[0]);
      }
      const errors = findings.some((f) => f.severity === "error");
      const warnings = findings.some((f) => f.severity === "warning");
      return errors || (flags.has("strict") && warnings) ? 1 : 0;
    }
    default:
      throw new CliError(`Unbekannter Befehl „${command}". weft help zeigt die Befehle.`);
  }
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  if (error instanceof CliError) {
    console.error(error.message);
    process.exitCode = error.exitCode;
  } else {
    throw error;
  }
}
