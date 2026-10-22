import { readFileSync, writeFileSync } from "node:fs";
import { pageLabels } from "../src/core/document/pageLabels";
import { setFixedLanguage } from "../src/core/i18n/tr";
import { loadWeft, CliError } from "./load";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { OPERATION_NAMES } from "./ops";
import { renderPages } from "./render";
import type { Operation } from "./ops";
import { editFile, exportTextsOf, importTextsFile, newFile } from "./tools";
import type { TextsFile } from "./texts";
import { buildOutline, outlineMarkdown } from "./inspect";
import { definitionJson, describeDefinition, fullSchema, listDefinitions } from "./schema";
import { validate } from "./validate";
import { checkLayout } from "./layout";
import { playModule, splitSteps } from "./play";
import { preparePlayer, resolvePages } from "./render";
import { copyFileSync, cpSync } from "node:fs";
import type { Finding } from "./validate";

const HELP = `weft - ein Lernmodul (.weft) lesen und prüfen

Benutzung:
  weft inspect <datei> [--page <nummer>] [--json]
      Gliederung: Layouts, Variablen, Folien mit ihren Blöcken, Ereignisse und Auslöser.
      --page 2.a.1   eine Folie ausführlich (Positionen, Effekte, Ereignisse, Auslöser)
  weft validate <datei> [--json] [--strict] [--layout [--page <nummer>]]
      Prüft Struktur und Inhalt (Verweise, Dateien, Auslöser, Variablen, Übersetzungen ...).
      Ende mit Status 1, wenn es Fehler gibt (mit --strict auch bei Warnungen).
      --layout zeichnet die Folien zusätzlich mit dem Player (Chrome nötig) und meldet Inhalt, der nicht in seinen Kasten
      passt (block-overflow: Text, der unten oder rechts abgeschnitten wird).
  weft text export <datei> --to <sprache[,sprache]> [--from <sprache>] [--missing] [-o <texte.json>]
      Alle Texte des Moduls als Liste zum Übersetzen (HTML mit Schlüssel, Quelle, Fundstelle).
      Ohne -o auf der Standardausgabe. --missing: nur, was noch keine Übersetzung hat.
  weft text import <datei> <texte.json> [-o <ziel.weft>] [--dry-run] [--force]
      Schreibt die übersetzten Texte in ein NEUES Modul (nie in die Quelle): Standard
      <name>.<sprache>.weft neben der Datei. Fehlende Sprachen werden dem Modul hinzugefügt.
  weft new <ziel.weft> [--title <text>] [--languages de_DE,fr_FR] [--demo | --empty] [--force]
      Ein neues Modul: ein Layout "Standard" mit Titel-Platzhalter und eine leere Folie; mit --empty gar nichts (kein Layout, keine
      Folie: add_layout und add_page legen sie an), mit --demo das kleine Beispiel.
  weft edit <datei> <operationen.json> [-o <ziel.weft>] [--dry-run] [--allow-errors]
      Ändert das Modul mit einer Liste von Operationen (die Aktionen des Editors) in einer Arbeitskopie
      <name>.ai.weft - die Quelle bleibt unverändert. Schreibt nur, wenn die Änderungen keine Fehler erzeugen.
      Die Operationen: weft edit --ops
  weft render <datei> [--page <nummer>] [--all] [-o <bild.png | ordner>] [--width 1280] [--lang fr_FR] [--state all|start]
      Zeichnet eine Folie als PNG - mit dem Player in einem Chrome (muss installiert sein; Pfad sonst in WEFT_CHROME).
      Standard: die erste Folie, mit allem darauf (nichts wartet auf seinen Aufbau); --state start: so, wie sie beginnt.
      --all zeichnet alle Folien in den Ordner -o.
  weft play <datei> --steps "weiter; tick 1 3; submit" [--page <nummer>] [-o <ordner>] [--lang fr_FR]
      Spielt das Modul wie eine Lernperson und sagt nach jedem Schritt, was sich geändert hat (neue und verschwundene
      Blöcke, die Meldung eines Quiz, die neue Folie); dazu ein Bild je Schritt im Ordner -o (Standard weft-spiel).
      Schritte: weiter, zurueck, click <Text>, tick <n>… (Antworten des Quiz, ab 1), submit, fill <Text>… (Lücken),
      key <Taste>, wait <ms>, shot. Chrome nötig, wie bei render.
  weft html <datei> -o <ordner> [--page <nummer>]
      Schreibt die Seite des Players (index.html mit Bildern, Videos und Schriften) in einen Ordner - zum Ansehen im Browser
      oder zum Weiterprüfen. --page: das Modul beginnt mit dieser Folie.
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
      if (["page", "format", "to", "from", "output", "title", "languages", "width", "lang", "state", "chrome", "steps"].includes(name) && next !== undefined && !next.startsWith("--")) {
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

// The default content a command makes (a new text, the names of a branch ...) is in this language: German, as the tool's own messages
// are - WEFT_LANG=en for English.
setFixedLanguage(process.env.WEFT_LANG === "en" ? "en" : "de");

async function main(argv: string[]): Promise<number> {
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
        const texts = exportTextsOf(file, { from, to, onlyMissing: flags.has("missing") });
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
        let texts: TextsFile;
        try {
          texts = JSON.parse(readFileSync(extra, "utf8")) as TextsFile;
        } catch (error) {
          throw new CliError(`Die Textdatei „${extra}" lässt sich nicht lesen: ${(error as Error).message}`);
        }
        const output = typeof flags.get("output") === "string" ? (flags.get("output") as string) : undefined;
        const { report, target, wrote } = importTextsFile(file, texts, { output, dryRun: flags.has("dry-run"), force: flags.has("force") });
        for (const problem of report.problems) {
          console.error(`${problem.severity === "error" ? "FEHLER " : "Warnung"} ${problem.key}: ${problem.message}`);
        }
        console.log(
          `${report.applied} Texte übernommen, ${report.unchanged} unverändert, ${report.skipped} übersprungen` +
            (report.addedLanguages.length > 0 ? `; Sprachen hinzugefügt: ${report.addedLanguages.join(", ")}` : "") +
            ".",
        );
        if (flags.has("dry-run")) console.log("(Probelauf: es wurde nichts geschrieben.)");
        else if (!wrote) console.log("Nichts zu schreiben.");
        else console.log(`Geschrieben: ${target}`);
        return report.problems.some((p) => p.severity === "error") ? 1 : 0;
      }
      throw new CliError("weft text export | import");
    }
    case "new": {
      if (!rest[0]) throw new CliError("Wohin? weft new <ziel.weft>");
      const languages = typeof flags.get("languages") === "string" ? (flags.get("languages") as string).split(",").map((l) => l.trim()).filter(Boolean) : undefined;
      const title = typeof flags.get("title") === "string" ? (flags.get("title") as string) : undefined;
      const { target } = newFile(rest[0], { title, languages, demo: flags.has("demo"), empty: flags.has("empty"), force: flags.has("force") });
      console.log(`Angelegt: ${target}`);
      return 0;
    }
    case "edit": {
      if (flags.has("ops")) {
        console.log(`Operationen: ${OPERATION_NAMES.join(", ")}\nBeschreibung mit Beispielen: docs/mcp.md (Werkzeug weft_operations).`);
        return 0;
      }
      if (!rest[0] || !rest[1]) throw new CliError("weft edit <datei> <operationen.json>");
      let operations: Operation[];
      try {
        const parsed = JSON.parse(readFileSync(rest[1], "utf8")) as Operation[] | { operations: Operation[] };
        operations = Array.isArray(parsed) ? parsed : parsed.operations;
      } catch (error) {
        throw new CliError(`Die Operationen in „${rest[1]}" lassen sich nicht lesen: ${(error as Error).message}`);
      }
      if (!Array.isArray(operations)) throw new CliError("Die Datei enthält keine Liste von Operationen.");
      const output = typeof flags.get("output") === "string" ? (flags.get("output") as string) : undefined;
      const outcome = editFile(rest[0], operations, { output, dryRun: flags.has("dry-run"), allowErrors: flags.has("allow-errors"), force: flags.has("force") });
      for (const r of outcome.results) console.log(`${r.index + 1}. ${r.op}: ${JSON.stringify(r.result)}`);
      for (const f of outcome.introduced) console.log(`${f.severity === "error" ? "FEHLER " : f.severity === "warning" ? "Warnung" : "Hinweis"} [${f.code}] ${f.message}`);
      if (outcome.wrote) console.log(`Geschrieben: ${outcome.target}`);
      else console.log(outcome.refused ?? "Nichts geschrieben.");
      return outcome.refused && !flags.has("dry-run") ? 1 : 0;
    }
    case "render": {
      if (!rest[0]) throw new CliError("Welche Datei? weft render <datei> [--page 2.a.1]");
      const loaded = loadWeft(rest[0]);
      const labels = pageLabels(loaded.content);
      const playable = Object.entries(labels)
        .filter(([id]) => loaded.content.pages[id] && !loaded.content.pages[id].jump)
        .map(([, label]) => label);
      const all = flags.has("all");
      const page = typeof flags.get("page") === "string" ? (flags.get("page") as string) : undefined;
      const refs = all ? playable : [page ?? playable[0]];
      if (!refs[0]) throw new CliError("Das Modul hat keine Folie, die sich zeichnen ließe.");
      const output = typeof flags.get("output") === "string" ? (flags.get("output") as string) : null;
      const images = await renderPages(rest[0], refs, {
        width: typeof flags.get("width") === "string" ? Number(flags.get("width")) : undefined,
        language: typeof flags.get("lang") === "string" ? (flags.get("lang") as string) : undefined,
        state: flags.get("state") === "start" ? "start" : "all",
        chrome: typeof flags.get("chrome") === "string" ? (flags.get("chrome") as string) : undefined,
      });
      if (all) {
        const folder = output ?? "weft-folien";
        mkdirSync(folder, { recursive: true });
        for (const image of images) {
          const target = join(folder, `folie-${image.label}.png`);
          writeFileSync(target, image.png);
          console.log(target);
        }
      } else {
        const target = output ?? `folie-${images[0].label}.png`;
        writeFileSync(target, images[0].png);
        console.log(`${target} (${images[0].width}×${images[0].height}, Folie ${images[0].label})`);
      }
      return 0;
    }
    case "play": {
      if (!rest[0]) throw new CliError('Welche Datei? weft play <datei> --steps "weiter; weiter"');
      const stepsText = typeof flags.get("steps") === "string" ? (flags.get("steps") as string) : "";
      const steps = splitSteps(stepsText);
      if (steps.length === 0) throw new CliError('Welche Schritte? --steps "weiter; tick 1 3; submit" (weft help zeigt sie).');
      const folder = typeof flags.get("output") === "string" ? (flags.get("output") as string) : "weft-spiel";
      mkdirSync(folder, { recursive: true });
      const result = await playModule(rest[0], steps, {
        page: typeof flags.get("page") === "string" ? (flags.get("page") as string) : undefined,
        language: typeof flags.get("lang") === "string" ? (flags.get("lang") as string) : undefined,
        chrome: typeof flags.get("chrome") === "string" ? (flags.get("chrome") as string) : undefined,
      });
      const all = [result.start, ...result.steps];
      all.forEach((step, index) => {
        const file = join(folder, `${String(index).padStart(2, "0")}-${step.step.split(" ")[0]}.png`);
        writeFileSync(file, step.png);
        console.log(`${String(index).padStart(2, "0")} ${step.step} → Folie ${step.page}  [${file}]`);
        for (const change of step.changes) console.log(`     ${change}`);
      });
      return 0;
    }
    case "html": {
      if (!rest[0]) throw new CliError("Welche Datei? weft html <datei> -o <ordner>");
      const folder = typeof flags.get("output") === "string" ? (flags.get("output") as string) : null;
      if (!folder) throw new CliError("Wohin? weft html <datei> -o <ordner>");
      const player = await preparePlayer(rest[0]);
      try {
        const page = typeof flags.get("page") === "string" ? (flags.get("page") as string) : undefined;
        const startId = page ? resolvePages(player.content, player.labels, [page])[0].id : null;
        const htmlPath = await player.htmlFile(startId, { all: false });
        mkdirSync(folder, { recursive: true });
        cpSync(player.folder, folder, { recursive: true, filter: (source) => !/page-\d+\.html$/.test(source) && !source.endsWith("profile") });
        copyFileSync(htmlPath, join(folder, "index.html"));
        console.log(join(folder, "index.html"));
      } finally {
        player.cleanup();
      }
      return 0;
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
      if (flags.has("layout")) {
        const page = typeof flags.get("page") === "string" ? (flags.get("page") as string) : undefined;
        findings.push(...(await checkLayout(rest[0], page ? [page] : undefined, { chrome: typeof flags.get("chrome") === "string" ? (flags.get("chrome") as string) : undefined })));
      }
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

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    if (error instanceof CliError) {
      console.error(error.message);
      process.exitCode = error.exitCode;
    } else {
      throw error;
    }
  },
);
