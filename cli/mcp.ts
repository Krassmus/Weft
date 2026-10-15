import { readFileSync, writeFileSync } from "node:fs";
import { CliError } from "./load";
import { OPERATION_NAMES } from "./ops";
import type { Operation } from "./ops";
import { definitionJson, describeDefinition, fullSchema, listDefinitions } from "./schema";
import { editFile, exportTextsOf, importTextsFile, inspectFile, newFile, validateFile } from "./tools";
import type { TextsFile } from "./texts";

/**
 * The MCP server of Weft (Model Context Protocol, over standard input/output): the tools of the command line tool for an AI
 * assistant - read a module, check it, translate it, change it. `node cli/dist/weft-mcp.mjs` is what a client (Claude Desktop,
 * Claude Code, ...) starts; see docs/mcp.md.
 *
 * Written against the protocol directly (it is little: JSON-RPC 2.0, one message per line) so that there is nothing to install.
 */

const SERVER = { name: "weft", version: "0.1.0" };
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>) => unknown;
}

const FILE = { type: "string", description: "Pfad einer .weft-Datei (oder eines weft.json)." };

function text(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function arg(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== "string" || value === "") throw new CliError(`Der Parameter „${name}" fehlt.`);
  return value;
}

function optionalString(args: Record<string, unknown>, name: string): string | undefined {
  const value = args[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function summariseFindings(findings: { severity: string }[]): string {
  const counts = { error: 0, warning: 0, info: 0 } as Record<string, number>;
  for (const f of findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return `${counts.error} Fehler, ${counts.warning} Warnungen, ${counts.info} Hinweise`;
}

const TOOLS: Tool[] = [
  {
    name: "weft_inspect",
    description:
      "Gliederung eines Weft-Lernmoduls: Titel, Sprachen, Variablen, Layouts, alle Folien in Spielreihenfolge (Nummern wie 3 oder 2.a.1) " +
      "mit ihren Blöcken (Art, Inhalt, Id). Mit `page` eine Folie ausführlich: Positionen, Effekte, Ereignisse und Auslöser. " +
      "Damit anfangen, bevor etwas geändert wird.",
    inputSchema: {
      type: "object",
      properties: { file: FILE, page: { type: "string", description: "Folien-Nummer (2.a.1) oder Id für die Einzelansicht." } },
      required: ["file"],
    },
    run: (args) => inspectFile(arg(args, "file"), { page: optionalString(args, "page") }).markdown,
  },
  {
    name: "weft_validate",
    description:
      "Prüft ein Lernmodul: kaputte Verweise (Layout, Zweige, Sprungziele, Variablen, Dateien), Ereignisse die nie passieren, Quizze ohne " +
      "richtige Antwort, unbekannte {{Variablen}}, fehlende Übersetzungen. Jede Meldung hat einen Code, einen Hinweis und die Stelle.",
    inputSchema: { type: "object", properties: { file: FILE }, required: ["file"] },
    run: (args) => {
      const { findings } = validateFile(arg(args, "file"));
      return { summary: summariseFindings(findings), findings };
    },
  },
  {
    name: "weft_schema",
    description:
      "Das Dateiformat. Ohne `name`: die Arten von Blöcken und was sie tun. Mit `name` (eine Art wie quiz/button/image oder eine Definition " +
      "wie Page, BlockEffect): alle Felder mit Typ und Beschreibung. Vor dem Schreiben eines Blocks nachlesen.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Block-Art oder Definition; leer: Übersicht." },
        format: { type: "string", enum: ["table", "json"], description: "table (Standard) oder json (JSON-Schema der Definition)." },
        full: { type: "boolean", description: "Das ganze JSON-Schema (groß)." },
      },
    },
    run: (args) => {
      if (args.full === true) return fullSchema();
      const name = optionalString(args, "name");
      if (!name) return listDefinitions();
      return args.format === "json" ? definitionJson(name) : describeDefinition(name);
    },
  },
  {
    name: "weft_text_export",
    description:
      "Alle Texte, die Lernende sehen (Texte, Lückentexte, Quiz-Fragen/-Antworten, Listenpunkte, Button-Beschriftungen, auch in Layouts), " +
      "als Liste zum Übersetzen. Jeder Eintrag hat `key`, `source` (HTML), `context` und `translations.<Sprache>` (leer, auszufüllen). " +
      "Mit `output` wird die Liste in eine Datei geschrieben statt zurückgegeben (bei großen Modulen sinnvoll).",
    inputSchema: {
      type: "object",
      properties: {
        file: FILE,
        to: { type: "array", items: { type: "string" }, description: 'Zielsprachen, z. B. ["fr_FR"].' },
        from: { type: "string", description: "Sprache der Texte (nur nötig, wenn das Modul noch keine Sprache eingestellt hat), z. B. de_DE." },
        only_missing: { type: "boolean", description: "Nur Texte ohne Übersetzung." },
        output: { type: "string", description: "Pfad einer .json-Datei, in die die Liste geschrieben wird." },
      },
      required: ["file", "to"],
    },
    run: (args) => {
      const to = args.to;
      if (!Array.isArray(to) || to.length === 0) throw new CliError('"to" ist eine Liste von Sprachcodes, z. B. ["fr_FR"].');
      const texts = exportTextsOf(arg(args, "file"), { to: to.map(String), from: optionalString(args, "from"), onlyMissing: args.only_missing === true });
      const output = optionalString(args, "output");
      if (output) {
        writeFileSync(output, JSON.stringify(texts, null, 2) + "\n");
        return `${texts.items.length} Texte nach ${output} geschrieben (${texts.from} → ${texts.to.join(", ")}). Dort in translations.<Sprache> ausfüllen und mit weft_text_import zurückspielen.`;
      }
      return texts;
    },
  },
  {
    name: "weft_text_import",
    description:
      "Schreibt übersetzte Texte (die Liste von weft_text_export, mit ausgefüllten `translations`) in ein NEUES Modul; die Quelle bleibt " +
      "unverändert. Fehlende Sprachen werden hinzugefügt. Jede Übersetzung wird geprüft (Tags, [[Lücken]], {{Variablen}}, kein aktiver " +
      "Inhalt); was nicht stimmt, wird übersprungen und gemeldet.",
    inputSchema: {
      type: "object",
      properties: {
        file: FILE,
        texts: { type: "object", description: "Die Liste (Objekt von weft_text_export) mit ausgefüllten translations." },
        texts_file: { type: "string", description: "Oder: Pfad der .json-Datei mit der Liste." },
        output: { type: "string", description: "Zieldatei; Standard <name>.<sprache>.weft neben der Quelle." },
        dry_run: { type: "boolean" },
      },
      required: ["file"],
    },
    run: (args) => {
      let texts: TextsFile;
      if (args.texts && typeof args.texts === "object") texts = args.texts as TextsFile;
      else {
        const path = arg(args, "texts_file");
        try {
          texts = JSON.parse(readFileSync(path, "utf8")) as TextsFile;
        } catch (error) {
          throw new CliError(`Die Textdatei „${path}" lässt sich nicht lesen: ${(error as Error).message}`);
        }
      }
      const outcome = importTextsFile(arg(args, "file"), texts, { output: optionalString(args, "output"), dryRun: args.dry_run === true });
      return {
        written: outcome.wrote ? outcome.target : null,
        applied: outcome.report.applied,
        unchanged: outcome.report.unchanged,
        skipped: outcome.report.skipped,
        addedLanguages: outcome.report.addedLanguages,
        problems: outcome.report.problems,
      };
    },
  },
  {
    name: "weft_new",
    description:
      "Legt ein neues, leeres Lernmodul an: ein Layout „Standard“ mit einem Platzhalter für den Titel und eine leere Folie. Danach mit " +
      "weft_edit füllen.",
    inputSchema: {
      type: "object",
      properties: {
        output: { type: "string", description: "Pfad der neuen .weft-Datei." },
        title: { type: "string" },
        languages: { type: "array", items: { type: "string" }, description: "Sprachcodes, die erste ist die Standardsprache. Leer: nicht mehrsprachig." },
        aspect_ratio: { type: "string", description: '"16:9" (Standard), "4:3" ...' },
        demo: { type: "boolean", description: "Statt leer das kleine Beispielmodul (mit Quiz und Verzweigung)." },
        force: { type: "boolean", description: "Eine vorhandene Datei überschreiben." },
      },
      required: ["output"],
    },
    run: (args) => {
      const out = newFile(arg(args, "output"), {
        title: optionalString(args, "title"),
        languages: Array.isArray(args.languages) ? args.languages.map(String) : undefined,
        aspectRatio: optionalString(args, "aspect_ratio"),
        demo: args.demo === true,
        force: args.force === true,
      });
      return `Angelegt: ${out.target}. Mit weft_inspect ansehen, mit weft_edit füllen.`;
    },
  },
  {
    name: "weft_edit",
    description:
      "Ändert ein Modul mit einer Liste von Operationen (alle zusammen oder gar nicht). Die Operationen sind die des Editors, das Ergebnis " +
      "ist, was der Editor gemacht hätte. Geschrieben wird in eine Arbeitskopie `<name>.ai.weft` neben der Datei (mit `output` anders; " +
      "das Original wird nie verändert). Danach die Meldungen lesen und mit der Arbeitskopie weitermachen. " +
      `Operationen: ${OPERATION_NAMES.join(", ")}. Siehe die Beschreibung dieser Operationen mit weft_operations.`,
    inputSchema: {
      type: "object",
      properties: {
        file: FILE,
        operations: {
          type: "array",
          items: { type: "object", properties: { op: { type: "string" }, as: { type: "string", description: 'Name für das Angelegte, später als "$name" benutzbar.' } }, required: ["op"] },
        },
        output: { type: "string", description: "Zieldatei (sonst <name>.ai.weft)." },
        dry_run: { type: "boolean", description: "Nur prüfen, nichts schreiben." },
        allow_errors: { type: "boolean", description: "Auch schreiben, wenn die Änderungen Fehler erzeugen." },
      },
      required: ["file", "operations"],
    },
    run: (args) => {
      if (!Array.isArray(args.operations)) throw new CliError('"operations" ist eine Liste von Operationen.');
      const outcome = editFile(arg(args, "file"), args.operations as Operation[], {
        output: optionalString(args, "output"),
        dryRun: args.dry_run === true,
        allowErrors: args.allow_errors === true,
      });
      return {
        written: outcome.wrote ? outcome.target : null,
        workingCopy: outcome.target,
        ...(outcome.refused ? { notWritten: outcome.refused } : {}),
        results: outcome.results,
        newFindings: outcome.introduced,
        totals: outcome.totals,
      };
    },
  },
  {
    name: "weft_operations",
    description: "Beschreibt die Operationen von weft_edit mit Parametern und je einem Beispiel.",
    inputSchema: { type: "object", properties: {} },
    run: () => OPERATIONS_DOC,
  },
];

const OPERATIONS_DOC = `# Operationen von weft_edit

Bezeichnungen wie in der Übersicht: Folien mit Nummer ("3", "2.a.1") oder Id, Layouts mit Namen oder Id, Variablen mit Namen oder Id,
Blöcke mit Id. Jede Operation kann mit "as" einen Namen für das Angelegte vergeben, der danach als "$name" gilt.

- set_title {title} · set_languages {languages:["de_DE","fr_FR"]} · set_aspect_ratio {aspectRatio} · set_keyboard_navigation {enabled}
- add_variable {name, type:"number"|"boolean"|"string"|"computed", initialValue?, expression?, as?} · update_variable {variable, set} · remove_variable {variable}
- add_layout {name, as?} · rename_layout {layout, name}
- add_page {after?:"start"|"end"|"3", layout?, branch?:{logic, branch, after?}, as?}  → {page, label}
- add_jump_page {after? | branch?, targets?:[{page, condition:{variable, comparator, value}}], default?, as?}  (eine Sprung-Folie wird nie gezeigt: sie führt je nach Bedingung zu einer Folie)
- add_logic {after?, name?, layout?, branches:[{label, condition?:{variable, comparator:"eq|neq|gt|gte|lt|lte", value}}], as?}  (der letzte Zweig ist das „sonst", ohne Bedingung)
- remove_page {page} · set_page_layout {page, layout|null}
- add_block {page | layout, kind, set?:{…Felder…}, as?}  → {block}   (kind: text, list, quiz, cloze, button, image, video, code, tex, iframe, shape, arrow, files, language; im Layout auch placeholder). Felder und Bedeutung: weft_schema <kind>.
- update_block {block, set:{…}} · remove_block {block}
- fill_placeholder {page, placeholder?, text | html}  (der Text der Folie für einen Platzhalter des Layouts, formatiert wie dieser; text: Zeilen = Absätze)
- add_trigger {page, from, to, delayMs?, weiter?} · remove_trigger {page, trigger}
  Ereignisse: "start", "end" (Nächste Folie), "entrance:<Block>", "exit:<Block>", "click:<Button>", "quiz-fill:<Quiz>", "quiz-submit:<Quiz>",
  "quiz-correct:<Quiz>", "quiz-incorrect:<Quiz>", "quiz-correct-end:<Quiz>", "video-start:<Video>", "video-end:<Video>" oder die echte Id aus weft_inspect.

Wichtig zum Aufbau: Eine Sprung-Folie führt zu einer Folie, und danach läuft die Folge hinter DIESER Folie weiter (wie nach einem Zweig).
Für getrennte Wege, die sich danach wieder treffen, add_logic (Verzweigung mit Zweigen) benutzen. Ein Button, der zu einer Folie
springt: add_block kind "button" mit set {"action":"goto","targetPageId":"3"}.

In "set" werden Namen aufgelöst: "$name" ist, was unter diesem Namen angelegt wurde; ein "variableId" darf der Name der Variablen sein; ein
"targetPageId" die Nummer der Folie. Ids, die man selbst vergibt (zum Beispiel für Quiz-Optionen), dürfen beliebige eindeutige Texte sein.

Beispiel Rätsel mit Schlüssel:
[
 {"op":"add_variable","name":"schluessel","type":"boolean"},
 {"op":"add_page","as":"raum1"},
 {"op":"add_block","page":"$raum1","kind":"button","set":{"text":"Schlüssel nehmen","action":"event","onClick":[{"variableId":"schluessel","op":"set","value":true}]}},
 {"op":"add_page","as":"tuer"},
 {"op":"add_jump_page","after":"$raum1","targets":[{"page":"$tuer","condition":{"variable":"schluessel","comparator":"eq","value":true}}]}
]
`;

// ---- the protocol ------------------------------------------------------------------------------------------------------------

interface Request {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function send(message: unknown): void {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function respond(id: Request["id"], result: unknown): void {
  send({ jsonrpc: "2.0", id, result });
}

function respondError(id: Request["id"], code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function handle(request: Request): void {
  const { id, method, params } = request;
  const isNotification = id === undefined;
  switch (method) {
    case "initialize": {
      const wanted = String((params as { protocolVersion?: unknown } | undefined)?.protocolVersion ?? "");
      respond(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(wanted) ? wanted : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: SERVER,
        instructions:
          "Weft ist ein Programm für Präsentationen und Lernmodule (.weft-Dateien). Zuerst weft_inspect, vor dem Schreiben eines Blocks " +
          "weft_schema, nach Änderungen weft_validate. Geändert wird nur in einer Arbeitskopie (<name>.ai.weft).",
      });
      return;
    }
    case "ping":
      respond(id, {});
      return;
    case "tools/list":
      respond(id, { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      return;
    case "tools/call": {
      const name = String((params as { name?: unknown } | undefined)?.name ?? "");
      const args = ((params as { arguments?: Record<string, unknown> } | undefined)?.arguments ?? {}) as Record<string, unknown>;
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) {
        respondError(id, -32602, `Unbekanntes Werkzeug „${name}".`);
        return;
      }
      try {
        respond(id, { content: [{ type: "text", text: text(tool.run(args)) }] });
      } catch (error) {
        const message = error instanceof CliError ? error.message : `Interner Fehler: ${(error as Error).message}`;
        respond(id, { content: [{ type: "text", text: message }], isError: true });
      }
      return;
    }
    default:
      if (!isNotification) respondError(id, -32601, `Unbekannte Methode „${method}".`);
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk: string) => {
  buffer += chunk;
  let newline: number;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    try {
      handle(JSON.parse(line) as Request);
    } catch (error) {
      respondError(null, -32700, `Nicht lesbare Nachricht: ${(error as Error).message}`);
    }
  }
});
process.stdin.on("end", () => process.exit(0));
