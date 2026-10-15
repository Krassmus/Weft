import schema from "../docs/weft.schema.json";
import { CliError } from "./load";

type Node = {
  $ref?: string;
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  anyOf?: Node[];
  items?: Node;
  properties?: Record<string, Node>;
  required?: string[];
  additionalProperties?: boolean | Node;
  description?: string;
};

const definitions = (schema as unknown as { definitions: Record<string, Node> }).definitions;

/** What each kind of block is for - the one thing the schema cannot say. */
export const BLOCK_KINDS: Record<string, { definition: string; what: string }> = {
  text: { definition: "TextBlock", what: "Ein Text (formatiertes HTML in `html`; Übersetzungen in `translations`)." },
  placeholder: { definition: "PlaceholderBlock", what: "Nur im Layout: Ort und Formatierung für einen Text, den die Folien selbst eingeben." },
  list: { definition: "ListBlock", what: "Eine Liste (Punkte, Striche, Nummern oder Bilder davor); Punkte können einzeln erscheinen." },
  quiz: { definition: "QuizBlock", what: "Frage mit Antwortoptionen; richtig/falsch löst Variablen-Effekte und Ereignisse aus." },
  cloze: { definition: "ClozeBlock", what: "Lückentext: Antworten stehen als [[Antwort]] im Text." },
  button: { definition: "ButtonBlock", what: "Ein Button: Weiter, vorherige Folie, zu einer Folie springen oder ein Ereignis auslösen; kann Variablen ändern." },
  image: { definition: "ImageBlock", what: "Ein Bild (Datei aus `assets`), optional mit Maske und Effekt." },
  video: { definition: "VideoBlock", what: "Ein Video (Datei aus `assets`), mit Zeitmarken, an denen es anhalten kann." },
  code: { definition: "CodeBlock", what: "Quelltext mit Syntaxfärbung." },
  tex: { definition: "TexBlock", what: "Eine Formel (TeX)." },
  iframe: { definition: "IframeBlock", what: "Eine eingebettete Seite (oder ein QR-Code dafür)." },
  shape: { definition: "ShapeBlock", what: "Eine Form: Rechteck, Ellipse, Vieleck, Stern." },
  arrow: { definition: "ArrowBlock", what: "Ein Pfeil durch mehrere Punkte." },
  files: { definition: "FilesBlock", what: "Dateien zum Herunterladen, optional mit Passwort." },
  language: { definition: "LanguageBlock", what: "Sprachumschalter (nur sinnvoll in mehrsprachigen Modulen)." },
};

function typeOf(node: Node | boolean | undefined): string {
  if (node === undefined) return "any";
  if (typeof node === "boolean") return node ? "any" : "never";
  if (node.$ref) return node.$ref.split("/").pop() ?? node.$ref;
  if ("const" in node) return JSON.stringify(node.const);
  if (node.enum) return node.enum.map((v) => JSON.stringify(v)).join(" | ");
  if (node.anyOf) return [...new Set(node.anyOf.map((n) => typeOf(n)))].join(" | ");
  if (node.type === "array") return `${typeOf(node.items)}[]`;
  if (node.type === "object" || node.properties) {
    if (node.additionalProperties && typeof node.additionalProperties === "object" && !node.properties) {
      return `{ [id]: ${typeOf(node.additionalProperties)} }`;
    }
    return "object";
  }
  return Array.isArray(node.type) ? node.type.join(" | ") : (node.type ?? "any");
}

function oneLine(text: string | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** The name of a definition, from either its name or the kind of a block ("quiz" -> "QuizBlock"). */
export function resolveDefinition(name: string): string {
  if (definitions[name]) return name;
  const byKind = BLOCK_KINDS[name];
  if (byKind) return byKind.definition;
  const lower = Object.keys(definitions).find((k) => k.toLowerCase() === name.toLowerCase());
  if (lower) return lower;
  throw new CliError(`„${name}" kennt das Schema nicht. Die Namen: weft schema --list`);
}

export function listDefinitions(): string {
  const lines = ["# Arten von Blöcken", ""];
  for (const [kind, info] of Object.entries(BLOCK_KINDS)) lines.push(`- **${kind}** (${info.definition}): ${info.what}`);
  lines.push("", "# Weitere Definitionen", "", Object.keys(definitions).filter((n) => !Object.values(BLOCK_KINDS).some((b) => b.definition === n)).sort().join(", "));
  lines.push("", "Eine Definition mit allen Feldern zeigt `weft schema <Name oder Art>`, zum Beispiel `weft schema quiz`.");
  return lines.join("\n") + "\n";
}

/** The fields of one definition as a table. */
export function describeDefinition(name: string): string {
  const resolved = resolveDefinition(name);
  const node = definitions[resolved];
  const lines = [`# ${resolved}`];
  const kind = Object.entries(BLOCK_KINDS).find(([, v]) => v.definition === resolved);
  if (kind) lines.push("", `Art \`${kind[0]}\`: ${kind[1].what}`);
  if (node.description) lines.push("", oneLine(node.description));
  if (node.properties) {
    const required = new Set(node.required ?? []);
    lines.push("", "| Feld | Typ | | Beschreibung |", "|---|---|---|---|");
    for (const [field, value] of Object.entries(node.properties)) {
      lines.push(`| ${field} | ${typeOf(value).replace(/\|/g, "\\|")} | ${required.has(field) ? "nötig" : "optional"} | ${oneLine(value.description)} |`);
    }
  } else {
    lines.push("", `Typ: ${typeOf(node)}`);
    if (node.anyOf) {
      for (const option of node.anyOf) {
        if (option.$ref) continue;
        if (option.properties) {
          const required = new Set(option.required ?? []);
          lines.push("", `- ${Object.entries(option.properties).map(([k, v]) => `${k}${required.has(k) ? "" : "?"}: ${typeOf(v)}`).join(", ")}`);
        }
      }
    }
  }
  return lines.join("\n") + "\n";
}

export function definitionJson(name: string): unknown {
  return definitions[resolveDefinition(name)];
}

export function fullSchema(): unknown {
  return schema;
}
