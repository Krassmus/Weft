import { TOOL_VERSION, versionInfo, versionText } from "./version";
import { guideLanguage, guideText, isGuideTopic } from "./guide";
import { readFileSync, writeFileSync } from "node:fs";
import { setFixedLanguage } from "../src/core/i18n/tr";
import { CliError } from "./load";
import { OPERATION_NAMES } from "./ops";
import type { Operation } from "./ops";
import { definitionJson, describeDefinition, fullSchema, listDefinitions } from "./schema";
import { writeFileSync as writeFile } from "node:fs";
import { renderPages } from "./render";
import { checkLayout } from "./layout";
import { playModule } from "./play";
import { editFile, exportTextsOf, importTextsFile, inspectFile, newFile, validateFile } from "./tools";
import type { TextsFile } from "./texts";

/**
 * The MCP server of Weft (Model Context Protocol, over standard input/output): the tools of the command line tool for an AI
 * assistant - read a module, check it, translate it, change it. `node cli/dist/weft-mcp.mjs` is what a client (Claude Desktop,
 * Claude Code, ...) starts; see docs/mcp.md.
 *
 * Written against the protocol directly (it is little: JSON-RPC 2.0, one message per line) so that there is nothing to install.
 */

// New content (a new text, the names of a branch ...) is made in German unless WEFT_LANG=en.
setFixedLanguage(process.env.WEFT_LANG === "en" ? "en" : "de");

const SERVER = { name: "weft", version: TOOL_VERSION };
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** The result as text or data - or, for a tool that makes pictures, `{ mcpContent: [...] }` with the content blocks as they are. */
  run: (args: Record<string, unknown>) => unknown | Promise<unknown>;
}

/** The first page of a module that can be drawn (not a jump page). */
async function firstPlayablePage(file: string): Promise<string> {
  const { loadWeft } = await import("./load");
  const { pageLabels } = await import("../src/core/document/pageLabels");
  const loaded = loadWeft(file);
  const labels = pageLabels(loaded.content);
  const first = Object.entries(labels).find(([id]) => loaded.content.pages[id] && !loaded.content.pages[id].jump);
  if (!first) throw new CliError("Das Modul hat keine Folie, die sich zeichnen ließe.");
  return first[1];
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
      "richtige Antwort, unbekannte {{Variablen}}, fehlende Übersetzungen. Jede Meldung hat einen Code, einen Hinweis und die Stelle. " +
      "Mit `layout` werden die Folien zusätzlich gezeichnet (Chrome nötig) und gemeldet, was nicht in seinen Kasten passt (block-overflow).",
    inputSchema: {
      type: "object",
      properties: {
        file: FILE,
        layout: { type: "boolean", description: "Auch prüfen, ob Text in seinen Kasten passt (zeichnet die Folien mit dem Player)." },
        pages: { type: "array", items: { type: "string" }, description: "Mit layout: nur diese Folien (Nummern wie 3 oder 2.a.1)." },
      },
      required: ["file"],
    },
    run: async (args) => {
      const file = arg(args, "file");
      const { findings } = validateFile(file);
      if (args.layout === true) {
        const pages = Array.isArray(args.pages) && args.pages.length > 0 ? args.pages.map(String) : undefined;
        findings.push(...(await checkLayout(file, pages)));
      }
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
        empty: { type: "boolean", description: "Gar nichts vorgegeben: kein Layout, keine Folie (add_layout und add_page legen sie an). Sonst gibt es ein Layout „Standard“ und eine leere Folie." },
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
        empty: args.empty === true,
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
    name: "weft_render",
    description:
      "Zeichnet Folien als Bild (PNG), so wie der Player sie zeigt - damit lässt sich prüfen, wie es wirklich aussieht: Text, der aus " +
      "seinem Kasten läuft, Blöcke übereinander, ein Layout, das nicht passt. Standard: alles auf der Folie ist da (nichts wartet " +
      "auf seinen Aufbau); mit state \"start\" so, wie die Folie beginnt. Braucht einen installierten Chrome/Chromium/Edge/Brave.",
    inputSchema: {
      type: "object",
      properties: {
        file: FILE,
        pages: { type: "array", items: { type: "string" }, description: 'Folien-Nummern ("1", "2.a.1") oder Ids; höchstens 6. Ohne Angabe: die erste.' },
        width: { type: "number", description: "Breite in Pixel (Standard 1280; die Höhe folgt aus dem Seitenverhältnis)." },
        language: { type: "string", description: "Sprache, in der gezeichnet wird (eine des Moduls)." },
        state: { type: "string", enum: ["all", "start"] },
        output_dir: { type: "string", description: "Ordner, in den die PNG-Dateien zusätzlich geschrieben werden." },
      },
      required: ["file"],
    },
    run: async (args) => {
      const pages = Array.isArray(args.pages) && args.pages.length > 0 ? args.pages.map(String) : [];
      if (pages.length > 6) throw new CliError("Höchstens 6 Folien auf einmal.");
      const file = arg(args, "file");
      const refs = pages.length > 0 ? pages : [await firstPlayablePage(file)];
      const images = await renderPages(file, refs, {
        width: typeof args.width === "number" ? args.width : undefined,
        language: optionalString(args, "language"),
        state: args.state === "start" ? "start" : "all",
      });
      const outputDir = optionalString(args, "output_dir");
      const content: unknown[] = [];
      for (const image of images) {
        if (outputDir) writeFile(`${outputDir}/folie-${image.label}.png`, image.png);
        content.push({ type: "text", text: `Folie ${image.label} (${image.width}×${image.height})` });
        content.push({ type: "image", data: Buffer.from(image.png).toString("base64"), mimeType: "image/png" });
      }
      return { mcpContent: content };
    },
  },
  {
    name: "weft_play",
    description:
      "Spielt ein Lernmodul wie eine Lernperson durch und berichtet nach jedem Schritt, was sich geändert hat (neue und verschwundene " +
      "Blöcke, die Meldung eines Quiz, die neue Folie). So lässt sich prüfen, was weft_render nicht zeigt: die Folie nach dem zweiten " +
      "Weiter, ein Quiz nach dem Abschicken, einen Lückentext nach dem Ausfüllen. Schritte (je ein Text): weiter, zurueck, " +
      'click <Text>, tick <n> <n> (Antworten des Quiz, ab 1), submit, fill <Text> <Text> (Lücken in Reihenfolge), key <Taste>, ' +
      "wait <ms>, shot. Bilder gibt es für die Schritte `shot` und den letzten. Braucht Chrome/Chromium/Edge/Brave.",
    inputSchema: {
      type: "object",
      properties: {
        file: FILE,
        steps: { type: "array", items: { type: "string" }, description: 'Die Schritte, z. B. ["weiter", "tick 1 3", "submit", "shot"].' },
        page: { type: "string", description: "Folie, mit der das Spiel beginnt (Standard: die erste)." },
        language: { type: "string", description: "Sprache des Moduls, in der gespielt wird." },
        output_dir: { type: "string", description: "Ordner, in den die Bilder aller Schritte zusätzlich geschrieben werden." },
      },
      required: ["file", "steps"],
    },
    run: async (args) => {
      if (!Array.isArray(args.steps) || args.steps.length === 0) throw new CliError('"steps" ist eine Liste von Schritten, z. B. ["weiter", "submit"].');
      const steps = args.steps.map(String);
      const result = await playModule(arg(args, "file"), steps, { page: optionalString(args, "page"), language: optionalString(args, "language") });
      const outputDir = optionalString(args, "output_dir");
      const content: unknown[] = [];
      const all = [result.start, ...result.steps];
      all.forEach((step, index) => {
        if (outputDir) writeFile(`${outputDir}/${String(index).padStart(2, "0")}-${step.step.split(" ")[0]}.png`, step.png);
        const last = index === all.length - 1;
        content.push({ type: "text", text: `${index}. ${step.step} → Folie ${step.page}${step.changes.length ? "\n" + step.changes.map((c) => "   " + c).join("\n") : ""}` });
        if (last || step.step === "shot") content.push({ type: "image", data: Buffer.from(step.png).toString("base64"), mimeType: "image/png" });
      });
      return { mcpContent: content };
    },
  },
  {
    name: "weft_operations",
    description: "Describes the operations of weft_edit with parameters and an example (English; lang \"de\" for German).",
    inputSchema: { type: "object", properties: { lang: { type: "string", enum: ["en", "de"], description: "Language of the description (default en)." } } },
    run: (args) => guideText("ops", guideLanguage(args.lang)),
  },
  {
    name: "weft_version",
    description:
      "The version of this tool, the file format it reads and writes (older files are only read, newer ones refused for changes), Node and the " +
      "browser found for drawing (weft_render, weft_play). Useful when a file reports another format than the tool knows.",
    inputSchema: { type: "object", properties: {} },
    run: () => versionText(versionInfo()),
  },
  {
    name: "weft_guide",
    description:
      "Read this first: the guide to building a learning module with Weft (the grid of a slide, texts, shapes, building up step by step, quizzes, " +
      "forks, languages, typical traps). `topic`: authoring (default), ops (the operations of weft_edit), cli (every command). English; lang \"de\" for German.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", enum: ["authoring", "ops", "cli"], description: "Which guide (default authoring)." },
        lang: { type: "string", enum: ["en", "de"], description: "Language (default en)." },
      },
    },
    run: (args) => {
      const topic = optionalString(args, "topic") ?? "authoring";
      if (!isGuideTopic(topic)) throw new Error(`Unknown topic "${topic}". Possible: authoring, ops, cli.`);
      return guideText(topic, guideLanguage(args.lang));
    },
  },
];

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
          "Weft makes presentations and interactive learning modules (.weft files). Read weft_guide first (how to build a module that looks " +
          "good), then weft_inspect to see what is there, weft_schema before writing a block, weft_edit to change (operations: weft_operations), " +
          "afterwards weft_validate with layout and weft_render / weft_play to look at the result. Changes go to a working copy (<name>.ai.weft) " +
          "- the source is never overwritten. The messages of the tools are in German; their codes are not.",
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
      Promise.resolve()
        .then(() => tool.run(args))
        .then((result) => {
          const raw = (result as { mcpContent?: unknown[] } | null)?.mcpContent;
          respond(id, { content: Array.isArray(raw) ? raw : [{ type: "text", text: text(result) }] });
        })
        .catch((error) => {
          const message = error instanceof CliError ? error.message : `Interner Fehler: ${(error as Error).message}`;
          respond(id, { content: [{ type: "text", text: message }], isError: true });
        });
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
