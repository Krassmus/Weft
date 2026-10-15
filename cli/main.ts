import { loadWeft, CliError } from "./load";
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
  weft schema [<name>] [--list] [--json] [--full]
      Das Dateiformat. Ohne Name: die Arten von Blöcken. <name>: eine Definition oder die Art
      eines Blocks (zum Beispiel "quiz", "ButtonBlock", "Page").
  weft help

Statuscodes: 0 in Ordnung, 1 Prüfung fand Fehler, 2 Aufruf oder Datei falsch.
Eine Datei ist ein .weft-Archiv (oder ein weft.json). Es wird nie etwas verändert.
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
      if (["page", "format"].includes(name) && next !== undefined && !next.startsWith("--")) {
        flags.set(name, next);
        i++;
      } else flags.set(name, true);
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
