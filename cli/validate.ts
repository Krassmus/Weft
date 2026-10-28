import Ajv from "ajv";
import { descriptorOf, exportedTexts, fieldsOf } from "../src/core/blocks/registry";
import type { ErrorObject } from "ajv";
import schema from "../docs/weft.schema.json";
import { buildGraphModel } from "../src/features/editor/eventGraph/model";
import { orderedValues } from "../src/core/document/ordering";
import { pageLabels } from "../src/core/document/pageLabels";
import { branchPageIds, sequenceOf } from "../src/core/document/sequence";
import { isTranslated, plainTextOfHtml } from "../src/core/document/translations";
import { safeLinkUrl } from "../src/core/document/linkUrl";
import { placeholderSources } from "../src/core/document/variablePlaceholders";
import { virtualVariablesFor } from "../src/core/document/virtualVariables";
import { formulaProblem } from "../src/core/document/variables";
import { actionEffectProblem, listAllNodes } from "../src/core/document/pageTimeline";
import { CURATED_FONTS } from "../src/core/fonts/curatedFonts";
import { CURRENT_FORMAT_VERSION } from "../src/core/types";
import type { Block, Page, TimelineNode, VariableEffect, WeftModule } from "../src/core/types";
import type { LoadedWeft } from "./load";
import { blockSummary } from "./text";

export type Severity = "error" | "warning" | "info";

export interface Finding {
  severity: Severity;
  /** A short stable name of the kind of finding ("button-target-missing"): what a program can act on. */
  code: string;
  message: string;
  /** What to do about it, where there is something obvious. */
  hint?: string;
  /** Where: a page by its number in the sidebar ("2.a.1") and id, a block by its id. */
  page?: { label: string; id: string };
  layout?: { name: string; id: string };
  blockId?: string;
}

const MAX_SCHEMA_FINDINGS = 25;

// ---- the schema ---------------------------------------------------------------------------------------------------------------

/** The schema with every kind of block opened up to "any object": the blocks are checked one by one against the definition of their
 * own kind (a union of seventeen kinds says only "none of them matches", which tells nobody what is wrong). */
function moduleSchema() {
  const copy = JSON.parse(JSON.stringify(schema)) as { definitions: Record<string, unknown> };
  copy.definitions.Block = { type: "object" };
  copy.definitions.StaticBlock = { type: "object" };
  return copy;
}

const KIND_DEFINITIONS: Record<string, string> = {
  text: "TextBlock",
  placeholder: "PlaceholderBlock",
  language: "LanguageBlock",
  code: "CodeBlock",
  tex: "TexBlock",
  image: "ImageBlock",
  video: "VideoBlock",
  audio: "AudioBlock",
  iframe: "IframeBlock",
  button: "ButtonBlock",
  link: "LinkBlock",
  checker: "CheckerBlock",
  matching: "MatchingBlock",
  sort: "SortBlock",
  gallery: "GalleryBlock",
  quiz: "QuizBlock",
  cloze: "ClozeBlock",
  shape: "ShapeBlock",
  arrow: "ArrowBlock",
  files: "FilesBlock",
  list: "ListBlock",
  script: "ScriptBlock",
  revealer: "RevealerBlock",
  progress: "ProgressBlock",
};

function describe(error: ErrorObject): string {
  const where = error.instancePath || "(Wurzel)";
  if (error.keyword === "additionalProperties") return `${where}: unbekanntes Feld „${(error.params as { additionalProperty: string }).additionalProperty}"`;
  if (error.keyword === "required") return `${where}: Feld „${(error.params as { missingProperty: string }).missingProperty}" fehlt`;
  if (error.keyword === "enum") return `${where}: ${error.message} (${((error.params as { allowedValues: unknown[] }).allowedValues ?? []).join(", ")})`;
  return `${where}: ${error.message}`;
}

function schemaFindings(loaded: LoadedWeft, labels: Record<string, string>): Finding[] {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const whole = ajv.compile(moduleSchema());
  const findings: Finding[] = [];
  const add = (message: string, extra: Partial<Finding> = {}) => findings.push({ severity: "error", code: "schema", message, ...extra });
  // A field the format does not know is harmless (Weft ignores it) - a wrong or missing one is not.
  const addError = (error: ErrorObject, extra: Partial<Finding> = {}, prefix = "") => {
    if (error.keyword === "additionalProperties") {
      findings.push({ severity: "warning", code: "schema-unknown-field", message: prefix + describe(error), hint: "Das Feld entfernen.", ...extra });
    } else {
      add(prefix + describe(error), extra);
    }
  };

  if (!whole(loaded.json)) {
    for (const error of whole.errors ?? []) addError(error);
  }

  // Every block against the definition of its own kind.
  const validators = new Map<string, ReturnType<typeof ajv.compile>>();
  const validatorFor = (kind: string) => {
    const name = descriptorOf(kind)?.schemaDefinition ?? KIND_DEFINITIONS[kind];
    if (!name) return null;
    let validator = validators.get(kind);
    if (!validator) {
      validator = ajv.compile({ ...(schema as object), $ref: `#/definitions/${name}` } as object);
      validators.set(kind, validator);
    }
    return validator;
  };
  const checkBlocks = (blocks: Record<string, Block> | undefined, where: Partial<Finding>) => {
    for (const [key, block] of Object.entries(blocks ?? {})) {
      if (!block || typeof block !== "object") {
        add(`Block „${key}" ist kein Objekt.`, where);
        continue;
      }
      const loose = block as { kind?: string; id?: string };
      const validator = validatorFor(loose.kind ?? "");
      if (!validator) {
        add(`Block „${key}" hat die unbekannte Art „${String(loose.kind)}“.`, { ...where, blockId: loose.id ?? key });
        continue;
      }
      if (!validator(block)) {
        for (const error of validator.errors ?? []) {
          addError(error, { ...where, blockId: loose.id ?? key }, `Block ${loose.kind}: `);
        }
      }
    }
  };
  for (const [pageId, page] of Object.entries(loaded.content.pages ?? {})) {
    // (A page that has no place in the overview is a deleted one - see validate.)
    if (!labels[pageId]) continue;
    checkBlocks(page?.blocks, { page: { label: labels[pageId], id: pageId } });
  }
  for (const [layoutId, layout] of Object.entries(loaded.content.layouts ?? {})) {
    checkBlocks(layout?.blocks, { layout: { name: layout?.name ?? "?", id: layoutId } });
  }

  if (findings.length > MAX_SCHEMA_FINDINGS) {
    const rest = findings.length - MAX_SCHEMA_FINDINGS;
    findings.length = MAX_SCHEMA_FINDINGS;
    findings.push({ severity: "warning", code: "schema", message: `… und ${rest} weitere Abweichungen vom Schema.` });
  }
  return findings;
}

// ---- helpers --------------------------------------------------------------------------------------------------------------------

const NAME_IN_NODE = /\{\{([^{}<>]*)\}\}/g;
const NAME_IN_TEXT = /\{\{([^{}]*)\}\}/g;

/** What is wrong with the {{placeholders}} in some html (as findPlaceholderProblems in core/document/variablePlaceholders.ts says it,
 * which needs a DOM): a name that is no variable, or a name with formatting in the middle. */
function placeholderProblems(html: string, names: ReadonlySet<string>): string[] {
  if (!html.includes("{{")) return [];
  const problems: string[] = [];
  const recognised = [...html.matchAll(NAME_IN_NODE)].map((m) => m[0]);
  for (const raw of recognised) {
    const name = raw.slice(2, -2).trim();
    if (!names.has(name)) problems.push(`Die Variable „${name}" gibt es nicht.`);
  }
  const remaining = [...recognised];
  const text = html.replace(/<[^>]*>/g, "");
  for (const match of text.matchAll(NAME_IN_TEXT)) {
    const index = remaining.indexOf(match[0]);
    if (index >= 0) remaining.splice(index, 1);
    else problems.push(`${match[0]} hat Formatierung mitten im Namen und kann nicht ausgewertet werden.`);
  }
  return problems;
}

function effectsOf(block: Block): { effects: VariableEffect[]; what: string }[] {
  const groups: { effects: VariableEffect[]; what: string }[] = [];
  if (block.kind === "quiz") {
    groups.push({ effects: block.onCorrect ?? [], what: "bei richtiger Antwort" }, { effects: block.onIncorrect ?? [], what: "bei falscher Antwort" });
    for (const option of block.options ?? []) {
      groups.push({ effects: option.onRight ?? [], what: "bei richtig behandelter Option" }, { effects: option.onWrong ?? [], what: "bei falsch behandelter Option" });
    }
  } else if (block.kind === "cloze") {
    groups.push({ effects: block.onCorrect ?? [], what: "wenn alles richtig ist" }, { effects: block.onIncorrect ?? [], what: "wenn etwas falsch ist" });
    groups.push({ effects: block.onEachCorrect ?? [], what: "bei jeder richtigen Lücke" });
    for (const effects of Object.values(block.answerEffects ?? {})) groups.push({ effects, what: "bei einer bestimmten Antwort" });
  } else if (block.kind === "matching") {
    groups.push({ effects: block.onEachCorrect ?? [], what: "bei jeder richtigen Zuordnung" }, { effects: block.onEachWrong ?? [], what: "bei jeder falschen Zuordnung" });
    groups.push({ effects: block.onCorrect ?? [], what: "wenn alles richtig ist" }, { effects: block.onIncorrect ?? [], what: "wenn nicht alles richtig ist" });
  } else if (block.kind === "sort") {
    groups.push({ effects: block.onSubmit ?? [], what: "beim Abschicken" }, { effects: block.onEachError ?? [], what: "bei jedem Fehler" });
    groups.push({ effects: block.onCorrect ?? [], what: "wenn die Reihenfolge stimmt" }, { effects: block.onIncorrect ?? [], what: "wenn die Reihenfolge nicht stimmt" });
  } else if (descriptorOf(block)) {
    // (A block that describes itself - see core/blocks - says which of its fields are changes to variables, and when they happen.)
    for (const [name, spec] of fieldsOf(block)) {
      if (spec.type === "effects") groups.push({ effects: ((block as unknown as Record<string, VariableEffect[] | undefined>)[name]) ?? [], what: spec.cliWhat });
    }
  } else if (block.kind === "checker") {
    groups.push({ effects: block.onChecked ?? [], what: "beim Abschicken mit Haken" }, { effects: block.onUnchecked ?? [], what: "beim Abschicken ohne Haken" });
  } else if (block.kind === "button") {
    groups.push({ effects: block.onClick ?? [], what: "beim Klick" });
  }
  return groups;
}

/** Where a node of a page's event graph is in words (for a message). */
export function eventLabel(page: Page, node: TimelineNode, content: WeftModule, labels: Record<string, string>): string {
  const custom = page.timeline?.titles?.[node.id]?.trim();
  if (custom) return `„${custom}"`;
  if (node.kind === "start") return "Start der Folie";
  if (node.kind === "end") return "Nächste Folie";
  const block = node.sourceBlockId ? (page.blocks[node.sourceBlockId] ?? undefined) : undefined;
  const summary = block ? block.name?.trim() || blockSummary(block, content, labels) : "";
  const what = block ? ` (${summary.length > 40 ? `${summary.slice(0, 39)}…` : summary})` : "";
  const names: Record<string, string> = {
    "block-entrance": "Aufbau",
    "block-exit": "Abbau",
    "block-action-move": "Element bewegt sich",
    "block-action-shake": "Element schüttelt sich",
    "block-action-blink": "Element blinkt",
    "group-entrance": "Aufbau einer Gruppe",
    "group-exit": "Abbau einer Gruppe",
    "list-item-entrance": "Aufbau eines Listenpunkts",
    "button-click": "Button geklickt",
    "quiz-fill-start": "Quiz: erste Antwort gewählt",
    "quiz-submit": "Quiz abgeschickt",
    "quiz-submit-correct": "Quiz richtig abgeschickt",
    "quiz-submit-incorrect": "Quiz falsch abgeschickt",
    "video-start-auto": "Video startet",
    "video-start-manual": "Video wird gestartet",
    "video-stop-point": "Zeitmarke des Videos erreicht",
    "video-resume": "Video läuft weiter",
    "video-end-loop": "Video (Schleife)",
    "video-end-stop": "Video zu Ende",
    "script-run": "Logikblock läuft",
    "revealer-open": "Revealer öffnet sich",
    "revealer-button": "Button im Revealer geklickt",
  };
  // (A checker has the events of a quiz, under its own names: the box ticked or cleared, submitted - with the tick or without it.)
  if (block?.kind === "matching") {
    Object.assign(names, {
      "quiz-fill-start": "Matching: erste Zuordnung",
      "quiz-submit": "Matching abgeschickt",
      "quiz-submit-correct": "Matching abgeschickt (alles richtig)",
      "quiz-submit-incorrect": "Matching abgeschickt (nicht alles richtig)",
    });
  }
  if (block?.kind === "sort") {
    Object.assign(names, {
      "quiz-fill-start": "Sortierrätsel: erste Verschiebung",
      "quiz-submit": "Sortierrätsel abgeschickt",
      "quiz-submit-correct": "Sortierrätsel abgeschickt (richtige Reihenfolge)",
      "quiz-submit-incorrect": "Sortierrätsel abgeschickt (falsche Reihenfolge)",
    });
  }
  const cliNames = block ? descriptorOf(block)?.task?.cliNames : undefined;
  if (cliNames) {
    Object.assign(names, {
      "quiz-fill-start": cliNames.fill,
      "quiz-submit": cliNames.submit,
      "quiz-submit-correct": cliNames.correct,
      "quiz-submit-incorrect": cliNames.incorrect,
    });
  }
  if (block?.kind === "checker") {
    Object.assign(names, {
      "quiz-fill-start": "Checker: Haken gesetzt oder entfernt",
      "quiz-submit": "Checker abgeschickt",
      "quiz-submit-correct": "Checker mit Haken abgeschickt",
      "quiz-submit-incorrect": "Checker ohne Haken abgeschickt",
    });
  }
  return `${names[node.eventType ?? ""] ?? node.eventType ?? node.id}${what}`;
}

// ---- the checks -----------------------------------------------------------------------------------------------------------------

export function validate(loaded: LoadedWeft): Finding[] {
  const { content } = loaded;
  const findings: Finding[] = [];
  const add = (severity: Severity, code: string, message: string, extra: Partial<Finding> = {}) =>
    findings.push({ severity, code, message, ...extra });

  // Format version.
  if (loaded.json.formatVersion > CURRENT_FORMAT_VERSION) {
    add("error", "format-version", `Die Datei hat das Format ${loaded.json.formatVersion}, dieses Weft kennt bis ${CURRENT_FORMAT_VERSION}.`, {
      hint: "Mit einer neueren Weft-Version öffnen.",
    });
  } else if (loaded.json.formatVersion < CURRENT_FORMAT_VERSION) {
    add("warning", "format-version", `Die Datei hat das ältere Format ${loaded.json.formatVersion} (aktuell ${CURRENT_FORMAT_VERSION}). Weitere Prüfungen können Meldungen erzeugen, die es nach dem Öffnen nicht mehr gibt.`, {
      hint: "In Weft öffnen und einmal speichern - dabei wird die Datei auf das aktuelle Format gebracht.",
    });
  }

  // Shape - everything else relies on it being there.
  const collections = ["pages", "layouts", "logicBlocks", "sequence"] as const;
  const broken = collections.filter((name) => !content[name] || typeof content[name] !== "object");
  if (broken.length > 0 || !Array.isArray(content.variables) || !Array.isArray(content.assets)) {
    add("error", "schema", `Es fehlen Teile von „content": ${[...broken, ...(Array.isArray(content.variables) ? [] : ["variables"]), ...(Array.isArray(content.assets) ? [] : ["assets"])].join(", ")}.`);
    return findings;
  }

  const labels = pageLabels(content);
  const pageRef = (pageId: string) => ({ label: labels[pageId] ?? `(nicht eingeordnet) ${pageId.slice(0, 8)}`, id: pageId });

  findings.push(...schemaFindings(loaded, labels));

  const variableIds = new Set(content.variables.map((v) => v.id));
  const knownFonts = new Set([...CURATED_FONTS.map((f) => f.family), ...(content.customFonts ?? []).map((f) => f.family)]);
  const variableNames = new Set([...content.variables.map((v) => v.name), ...virtualVariablesFor(content.languages ?? []).map((v) => v.name)]);

  // Variables.
  const seenNames = new Map<string, number>();
  for (const variable of content.variables) seenNames.set(variable.name, (seenNames.get(variable.name) ?? 0) + 1);
  for (const [name, count] of seenNames) {
    if (count > 1) add("warning", "variable-duplicate", `Es gibt ${count} Variablen mit dem Namen „${name}".`, { hint: "Namen müssen eindeutig sein, sonst bleibt unklar, welche in {{ }} gemeint ist." });
  }

  // The sequence: every page of the module is in it, once.
  const placed = new Set<string>();
  /** The pages in the order they are played (messages follow it). */
  const playOrder: string[] = [];
  for (const entry of sequenceOf(content)) {
    if (entry.kind === "page") {
      if (!content.pages[entry.pageId]) add("error", "sequence-page-missing", `Die Folienübersicht verweist auf die Folie ${entry.pageId}, die es nicht gibt.`);
      placed.add(entry.pageId);
      playOrder.push(entry.pageId);
    } else {
      const logic = content.logicBlocks[entry.logicBlockId];
      if (!logic) {
        add("error", "sequence-logic-missing", `Die Folienübersicht verweist auf den Verzweigungsblock ${entry.logicBlockId}, den es nicht gibt.`);
        continue;
      }
      for (const branch of logic.branches ?? []) {
        for (const pageId of branchPageIds(branch)) {
          if (!content.pages[pageId]) add("error", "branch-page-missing", `Ein Zweig von „${logic.name}" verweist auf die Folie ${pageId}, die es nicht gibt.`);
          placed.add(pageId);
          playOrder.push(pageId);
        }
        if (branch.condition && !variableIds.has(branch.condition.variableId)) {
          add("error", "condition-variable-missing", `Die Bedingung des Zweigs „${branch.label}" in „${logic.name}" benutzt eine Variable, die es nicht gibt.`);
        }
      }
    }
  }

  const pages = [
    ...playOrder.filter((id) => content.pages[id]).map((id) => [id, content.pages[id]] as const),
    ...Object.entries(content.pages).filter(([id]) => !placed.has(id)),
  ];
  const deleted = pages.filter(([id]) => !placed.has(id)).length;
  if (deleted > 0) {
    add("info", "page-deleted", `${deleted} gelöschte Folie(n) stecken noch in der Datei (beim Löschen verschwindet nur der Platz in der Folienübersicht). Weft ignoriert sie.`);
  }
  for (const [pageId, page] of pages) {
    const ref = pageRef(pageId);
    // A page that was deleted stays in the file (deleting removes only its place in the overview, so that edits made at the same
    // time by somebody else still find it): nothing in it matters.
    if (!placed.has(pageId)) continue;
    if (page.layoutId && !content.layouts[page.layoutId]) {
      add("error", "layout-missing", `Das Layout ${page.layoutId} der Folie gibt es nicht.`, { page: ref, hint: "Der Folie ein vorhandenes Layout zuweisen (layoutId) oder null." });
    }
    // A jump page.
    if (page.jump) {
      const known = (id: string | null | undefined) => !id || (content.pages[id] && !content.pages[id].jump);
      for (const target of page.jump.targets ?? []) {
        if (!content.pages[target.pageId]) add("error", "jump-target-missing", `Ein Sprungziel der Sprung-Folie ${ref.label} gibt es nicht mehr.`, { page: ref });
        else if (content.pages[target.pageId].jump) add("warning", "jump-target-is-jump", `Ein Sprungziel der Sprung-Folie ${ref.label} ist selbst eine Sprung-Folie.`, { page: ref });
        if (!variableIds.has(target.condition?.variableId)) add("error", "condition-variable-missing", `Eine Bedingung der Sprung-Folie ${ref.label} benutzt eine Variable, die es nicht gibt.`, { page: ref });
      }
      if (!known(page.jump.defaultPageId)) add("error", "jump-target-missing", `Das Standardziel der Sprung-Folie ${ref.label} gibt es nicht.`, { page: ref });
      continue;
    }
    // Groups.
    for (const group of page.groups ?? []) {
      for (const blockId of group.blockIds) {
        if (!page.blocks[blockId]) add("warning", "group-block-missing", `Eine Gruppe der Folie ${ref.label} enthält einen Block, den es nicht gibt.`, { page: ref, blockId });
      }
    }
  }

  // Blocks.
  const languages = content.languages ?? [];
  const defaultLanguage = languages[0] ?? null;
  const untranslated = new Map<string, { page?: Finding["page"]; layout?: Finding["layout"]; language: string; blockIds: string[] }>();

  const checkBlock = (block: Block, where: { page?: Finding["page"]; layout?: Finding["layout"] }) => {
    const here = { ...where, blockId: block.id };
    const isLayout = !!where.layout;

    // Position.
    const p = block.position;
    if (p && (p.x < -0.5 || p.y < -0.5 || p.x + p.width > 100.5 || p.y + p.height > 100.5)) {
      add("warning", "block-off-slide", `${block.kind}-Block liegt (teilweise) außerhalb der Folie.`, { ...here, hint: "position so setzen, dass x+width und y+height höchstens 100 sind." });
    }
    if (p && (p.width <= 0 || p.height <= 0)) add("error", "block-no-size", `${block.kind}-Block hat keine Größe.`, here);

    // Aktionseffekte: only on a page, and between the Aufbau and the Abbau of the block (see actionEffectProblem).
    if (block.actionEffects?.length) {
      const page = where.page ? content.pages[where.page.id] : undefined;
      if (!page) add("warning", "action-effect-in-layout", "Aktionseffekte eines Layout-Blocks gelten nicht (nur Blöcke einer Folie haben welche).", here);
      for (const effect of block.actionEffects) {
        const problem = page ? actionEffectProblem(page, block, effect.id) : null;
        if (problem) {
          add("warning", "action-effect-misplaced", problem === "before-entrance" ? "Ein Aktionseffekt kann passieren, bevor das Element erschienen ist - er bewirkt dann nichts." : "Ein Aktionseffekt kann passieren, nachdem das Element verschwunden ist - er bewirkt dann nichts.", { ...here, hint: "Seinen Auslöser (Ereignis) so wählen, dass er nach dem Aufbau und vor dem Abbau des Elements kommt." });
        }
      }
    }

    // Placeholders.
    if (block.kind === "placeholder" && !isLayout) {
      add("error", "placeholder-on-page", "Ein Platzhalter-Text kann nur in einem Layout stehen.", { ...here, hint: "Den Block in ein Layout verschieben oder in einen Text-Block umwandeln." });
    }
    if (block.kind === "text" && block.placeholderOf) {
      const layout = where.page ? content.layouts[content.pages[where.page.id].layoutId ?? ""] : undefined;
      const target = layout?.blocks[block.placeholderOf];
      if (!target || target.kind !== "placeholder") {
        add("warning", "placeholder-link-broken", "Der Text gehört zu einem Platzhalter, den das Layout der Folie nicht hat - er verhält sich wie ein gewöhnlicher Text.", { ...here, hint: "placeholderOf entfernen." });
      }
    }

    // Media.
    if ((block.kind === "image" || block.kind === "video" || block.kind === "audio") && block.assetId) {
      const meta = content.assets.find((a) => a.id === block.assetId);
      if (!meta) add("error", "asset-missing", `${block.kind}-Block verweist auf die Datei ${block.assetId}, die nicht in der Liste der Dateien steht.`, here);
      else if (loaded.archive && !loaded.files.has(`assets/${meta.id}_${meta.fileName}`)) {
        add("error", "asset-file-missing", `Die Datei „${meta.fileName}" fehlt im Archiv.`, { ...here, hint: "Das Bild/Video/Audio neu einfügen." });
      }
    }
    if ((block.kind === "image" || block.kind === "video" || block.kind === "audio") && !block.assetId) {
      add("warning", "media-empty", `${block.kind}-Block hat noch keine Datei.`, here);
    }
    if (block.kind === "progress") {
      const known = block.variable === "progress" || content.variables.some((v) => v.name === block.variable && (v.type === "number" || v.type === "computed"));
      if (!known) add("warning", "progress-variable-unknown", `Der Fortschrittsbalken zeigt „${block.variable}“, aber das ist weder „progress“ noch eine Zahlen-Variable des Moduls (er bleibt leer).`, { ...here, hint: "variable auf „progress“ oder den Namen einer Zahlen-Variable setzen." });
    }
    if (block.kind === "revealer") {
      if (block.imageAssetId) {
        const meta = content.assets.find((a) => a.id === block.imageAssetId);
        if (!meta) add("error", "asset-missing", `revealer-Block verweist auf das Bild ${block.imageAssetId}, das nicht in der Liste der Dateien steht.`, here);
        else if (loaded.archive && !loaded.files.has(`assets/${meta.id}_${meta.fileName}`)) {
          add("error", "asset-file-missing", `Die Datei „${meta.fileName}" fehlt im Archiv.`, { ...here, hint: "Das Bild neu einfügen." });
        } else if (!block.imageAlt.trim()) add("info", "image-no-alt", "Bild im Revealer ohne Alternativtext (imageAlt).", here);
      }
      if (!block.title.trim()) add("warning", "revealer-no-title", "Revealer ohne Überschrift.", here);
      if (block.button?.action === "goto") {
        if (!block.button.targetPageId) add("warning", "button-target-empty", "Der Button des Revealers springt zu einer Folie, hat aber kein Ziel.", { ...here, hint: "button.targetPageId setzen." });
        else if (!content.pages[block.button.targetPageId]) add("error", "button-target-missing", "Der Button des Revealers springt zu einer Folie, die es nicht mehr gibt.", here);
      }
    }
    if (block.kind === "image" && block.assetId && !block.alt?.trim()) {
      add("info", "image-no-alt", "Bild ohne Alternativtext.", here);
    }

    // Variables in effects.
    for (const { effects, what } of effectsOf(block)) {
      for (const effect of effects) {
        if (!variableIds.has(effect.variableId)) {
          add("error", "effect-variable-missing", `${block.kind}-Block ändert ${what} eine Variable, die es nicht gibt.`, here);
        }
      }
    }

    // Button.
    if (block.kind === "button") {
      if (block.action === "goto") {
        if (!block.targetPageId) add("warning", "button-target-empty", "Button springt zu einer Folie, hat aber kein Ziel.", { ...here, hint: "targetPageId setzen." });
        else if (!content.pages[block.targetPageId]) add("error", "button-target-missing", "Button springt zu einer Folie, die es nicht mehr gibt.", { ...here, hint: "Ein vorhandenes Ziel (targetPageId) wählen." });
      }
      if (!plainTextOfHtml(block.html ?? block.text).trim()) add("info", "button-no-text", "Button ohne Text (der Player zeigt „Weiter“).", here);
    }

    // Matching.
    if (block.kind === "matching") {
      const sources = block.sources ?? [];
      const targets = block.targets ?? [];
      const sourceIds = new Set(sources.map((item) => item.id));
      const targetIds = new Set(targets.map((item) => item.id));
      if (sources.length === 0 || targets.length === 0) add("warning", "matching-empty", "Das Matching braucht mindestens ein Objekt und ein Ziel.", here);
      for (const [source, target] of Object.entries(block.pairs ?? {})) {
        if (!sourceIds.has(source) || !targetIds.has(target)) add("error", "matching-pair-broken", "Eine richtige Zuordnung (pairs) verweist auf ein Objekt oder Ziel, das es nicht gibt.", { ...here, hint: "pairs: Objekt-Id → Ziel-Id; ein Objekt ohne Eintrag ist ein Ablenker." });
      }
      if (sources.length > 0 && sources.every((item) => !(block.pairs ?? {})[item.id])) add("info", "matching-no-pairs", "Kein Objekt hat ein Ziel: alles ist ein Ablenker, nichts kann richtig zugeordnet werden.", here);
      for (const item of [...sources, ...targets]) {
        if (item.kind !== "image") continue;
        if (!item.assetId) add("warning", "matching-no-image", "Eine Karte des Matchings ist ein Bild, hat aber noch keins.", here);
        else if (!content.assets.some((a) => a.id === item.assetId)) add("error", "asset-missing", `Eine Karte des Matchings verweist auf die Datei ${item.assetId}, die nicht in der Liste der Dateien steht.`, here);
        else if (!item.text?.trim()) add("info", "image-no-alt", "Ein Bild des Matchings ohne Beschreibung (text).", here);
      }
    }

    // Sorting puzzle.
    if (block.kind === "sort") {
      const items = block.items ?? [];
      if (items.length < 2) add("warning", "sort-too-few", "Das Sortierrätsel braucht mindestens zwei Objekte, sonst gibt es nichts zu sortieren.", here);
      for (const item of items) {
        if (item.kind !== "image") continue;
        if (!item.assetId) add("warning", "sort-no-image", "Ein Objekt des Sortierrätsels ist ein Bild, hat aber noch keins.", here);
        else if (!content.assets.some((a) => a.id === item.assetId)) add("error", "asset-missing", `Ein Objekt des Sortierrätsels verweist auf die Datei ${item.assetId}, die nicht in der Liste der Dateien steht.`, here);
        else if (!item.text?.trim()) add("info", "image-no-alt", "Ein Bild des Sortierrätsels ohne Beschreibung (text).", here);
      }
      if (block.onEachError?.length === 0 && block.onSubmit?.length === 0 && block.onCorrect?.length === 0 && block.onIncorrect?.length === 0) add("info", "sort-no-effects", "Das Sortierrätsel vergibt keine Punkte (onSubmit / onEachError / onCorrect / onIncorrect sind leer).", here);
    }

    // What a block that describes itself (see core/blocks) says is wrong with it.
    for (const problem of descriptorOf(block)?.validate?.(block as never) ?? []) add(problem.level, problem.code, problem.message, here);

    // Gallery.
    if (block.kind === "gallery") {
      const items = block.items ?? [];
      if (items.length === 0) add("warning", "gallery-empty", "Die Galerie hat noch kein Bild.", here);
      for (const item of items) {
        if (!item.assetId) add("warning", "gallery-no-image", "Ein Bild der Galerie hat noch keine Datei.", here);
        else if (!content.assets.some((a) => a.id === item.assetId)) add("error", "asset-missing", `Ein Bild der Galerie verweist auf die Datei ${item.assetId}, die nicht in der Liste der Dateien steht.`, here);
        else if (!item.caption?.trim()) add("info", "image-no-alt", "Ein Bild der Galerie ohne Bildunterschrift (caption) - sie ist auch die Beschreibung für alle, die das Bild nicht sehen.", here);
      }
    }

    // Link.
    if (block.kind === "link") {
      if ((block.url ?? "").trim() === "" || block.url.trim() === "https://") add("warning", "link-no-target", "Der Link hat noch keine Adresse.", { ...here, hint: "url auf eine Adresse mit https://, mailto: oder tel: setzen." });
      else if (safeLinkUrl(block.url) === null) add("error", "link-url-invalid", `Der Link führt zu „${block.url}", dahin kann ein Link nicht führen.`, { ...here, hint: "Nur Adressen mit http(s)://, mailto: oder tel: sind erlaubt." });
    }

    // Quiz.
    if (block.kind === "quiz") {
      const ids = new Set(block.options.map((o) => o.id));
      for (const id of block.correctOptionIds) {
        if (!ids.has(id)) add("error", "quiz-correct-missing", "Das Quiz nennt eine richtige Option, die es nicht gibt.", { ...here, hint: "correctOptionIds auf vorhandene Option-Ids beschränken." });
      }
      if (!block.open && block.correctOptionIds.length === 0) add("warning", "quiz-no-correct", "Das Quiz hat keine richtige Option und ist nicht offen.", { ...here, hint: "Mindestens eine Option in correctOptionIds eintragen (oder open: true setzen)." });
      if (block.options.length < 2 && !block.open) add("info", "quiz-few-options", "Das Quiz hat weniger als zwei Optionen.", here);
    }

    // Gap text.
    if (block.kind === "cloze" && !/\[\[[^\]]+\]\]/.test(block.html)) {
      add("warning", "cloze-no-blanks", "Der Lückentext hat keine Lücke (Antworten stehen als [[Antwort]] im Text).", here);
    }

    // {{placeholders}}.
    const problems = [...new Set(placeholderSources(block).flatMap((html) => placeholderProblems(html, variableNames)))];
    for (const problem of problems) add("warning", "placeholder-variable", problem, here);

    // The markup of the texts: a colour in <font color> that is not a hex colour is not read (the text comes out in its own colour), a typeface
    // that is not in the list falls back to the standard one.
    const markupProblems = new Set<string>();
    for (const html of placeholderSources(block)) {
      for (const m of html.matchAll(/<font\b[^>]*?\scolor="([^"]*)"/gi)) {
        const value = m[1].trim();
        if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) && !/^[a-z]+$/i.test(value)) {
          markupProblems.add(`color:${value}`);
        }
      }
      for (const m of html.matchAll(/<font\b[^>]*?\sface="([^"]*)"/gi)) {
        const family = m[1].trim();
        if (!knownFonts.has(family)) markupProblems.add(`face:${family}`);
      }
    }
    for (const problem of markupProblems) {
      const [kind, value] = [problem.slice(0, problem.indexOf(":")), problem.slice(problem.indexOf(":") + 1)];
      if (kind === "color") {
        add("warning", "html-color-invalid", `<font color="${value}"> ist keine Farbe, die Weft liest: der Text bekommt seine eigene Farbe, nicht diese.`, {
          ...here,
          hint: 'In <font color> nur #rrggbb (oder #rgb) schreiben. Eine durchscheinende Farbe geht mit <span style="color:rgba(251,191,36,0.4)">.',
        });
      } else {
        add("warning", "html-font-unknown", `Die Schrift „${value}" gibt es nicht (nicht in der Schriftenliste, nicht im Modul): der Text erscheint in der Standardschrift.`, {
          ...here,
          hint: "Eine Schrift der Liste nehmen (docs/ai-authoring.md) oder die eigene Schrift im Editor in die Einstellungen laden.",
        });
      }
    }

    // Translations.
    const markUntranslated = () => {
      for (const language of languages) {
        if (language === defaultLanguage) continue;
        if (!isTranslated(block as never, language, defaultLanguage)) {
          const key = `${where.page?.id ?? where.layout?.id}:${language}`;
          const entry = untranslated.get(key) ?? { page: where.page, layout: where.layout, language, blockIds: [] };
          entry.blockIds.push(block.id);
          untranslated.set(key, entry);
        }
      }
    };
    // (A block that describes itself: any of its texts has words.)
    if (languages.length > 1 && descriptorOf(block) && exportedTexts(block).some(({ value }) => value.trim() !== "")) markUntranslated();
    if (languages.length > 1 && (block.kind === "text" || block.kind === "button" || block.kind === "link" || block.kind === "checker" || block.kind === "matching" || block.kind === "sort" || block.kind === "gallery" || block.kind === "quiz" || block.kind === "cloze" || block.kind === "list")) {
      const hasWords =
        block.kind === "quiz"
          ? plainTextOfHtml(block.questionHtml).trim() !== ""
          : block.kind === "list"
            ? block.items.length > 0
            : block.kind === "gallery"
              ? block.items.some((item) => item.caption.trim() !== "")
            : block.kind === "sort"
              ? block.items.some((item) => item.text.trim() !== "")
            : block.kind === "matching"
              ? [...block.sources, ...block.targets].some((item) => item.text.trim() !== "")
              : block.kind === "button" || block.kind === "link" || block.kind === "checker"
              ? block.text.trim() !== ""
              : plainTextOfHtml(block.html).trim() !== "";
      // A text that stands for a placeholder of the layout is the page's own, and has its words in each language like any other.
      if (hasWords) markUntranslated();
    }
  };

  for (const [pageId, page] of pages) {
    if (page.jump || !placed.has(pageId)) continue;
    for (const block of orderedValues(page.blocks ?? {})) checkBlock(block, { page: pageRef(pageId) });
  }
  for (const [layoutId, layout] of Object.entries(content.layouts)) {
    for (const block of orderedValues(layout.blocks ?? {})) checkBlock(block as Block, { layout: { name: layout.name, id: layoutId } });
  }
  for (const entry of untranslated.values()) {
    add("warning", "translation-missing", `${entry.blockIds.length} Text(e) ohne Übersetzung nach ${entry.language}.`, {
      page: entry.page,
      layout: entry.layout,
      hint: "Mit den Übersetzungen (translations[Sprache]) der Blöcke füllen; bis dahin zeigt Weft den Text der Standardsprache.",
    });
  }

  // Event graphs: triggers between events that exist, and events that nothing makes happen.
  for (const [pageId, page] of pages) {
    if (page.jump || !placed.has(pageId)) continue;
    const ref = pageRef(pageId);
    try {
      const nodeIds = new Set(listAllNodes(page).map((n) => n.id));
      for (const [triggerId, trigger] of Object.entries(page.timeline?.triggers ?? {})) {
        if (!nodeIds.has(trigger.from) || !nodeIds.has(trigger.to)) {
          add("warning", "trigger-dangling", `Ein Auslöser (${triggerId}) verbindet ein Ereignis, das es nicht (mehr) gibt: ${trigger.from} → ${trigger.to}.`, {
            page: ref,
            hint: "Der Auslöser wird beim nächsten Bearbeiten in Weft entfernt; sonst aus page.timeline.triggers löschen.",
          });
        }
      }
      // An event with several triggers happens at the first of them (so the Weiter chain that every block with an Aufbau gets is still there
      // when a block is also triggered by a quiz, say): worth a look, a warning when a Weiter is among them.
      const incoming = new Map<string, { from: string; weiter: boolean }[]>();
      for (const trigger of Object.values(page.timeline?.triggers ?? {})) {
        if (!nodeIds.has(trigger.from) || !nodeIds.has(trigger.to)) continue;
        incoming.set(trigger.to, [...(incoming.get(trigger.to) ?? []), { from: trigger.from, weiter: !!trigger.weiter }]);
      }
      const nodesById = new Map(listAllNodes(page).map((n) => [n.id, n]));
      for (const [to, list] of incoming) {
        if (list.length < 2 || !nodesById.get(to)) continue;
        const name = (id: string) => (nodesById.get(id) ? eventLabel(page, nodesById.get(id)!, content, labels) : id);
        const mixed = list.some((t) => t.weiter) && list.some((t) => !t.weiter);
        add(mixed ? "warning" : "info", "event-multiple-triggers", `„${name(to)}" wird von ${list.length} Ereignissen ausgelöst: ${list.map((t) => `${name(t.from)}${t.weiter ? " (mit Weiter)" : ""}`).join(", ")} - es passiert beim ersten davon.`, {
          page: ref,
          hint: "Gewollt? Sonst mit set_trigger festlegen, was es auslöst (das ersetzt die anderen); mit remove_trigger einen entfernen.",
        });
      }
      // The conditions of "Ausgelöst durch: Variable": the formula has to parse and to read variables that exist.
      for (const [id, formula] of Object.entries(page.timeline.conditions ?? {})) {
        const problem = formula.trim() === "" ? "Die Bedingung ist noch leer." : formulaProblem(formula, content.variables, virtualVariablesFor(content.languages ?? []).map((v) => v.name));
        if (problem) add("warning", "condition-invalid", `Die Bedingung „${formula}" (${id}) geht nicht: ${problem} So wird der Aufbau/Abbau nie ausgelöst.`, { page: ref, hint: 'Mit set_trigger {"to": "entrance:<Block>", "condition": "<Formel>"} neu setzen.' });
      }
      const model = buildGraphModel(page);
      for (const node of model.nodes.flatMap((n) => [n, ...n.companions])) {
        if (!node.unreachable) continue;
        const label = eventLabel(page, node.node, content, labels);
        if (node.node.kind === "end") {
          add("warning", "page-no-exit", `Auf Folie ${ref.label} ist „Nächste Folie" nicht erreichbar: die Folie lässt sich nur auf anderem Weg verlassen (zum Beispiel mit einem Button).`, {
            page: ref,
            hint: "Einen Auslöser zu „Nächste Folie“ setzen (page.timeline.triggers).",
          });
        } else {
          add("warning", "event-unreachable", `Das Ereignis „${label}" passiert nie: nichts löst es aus.`, {
            page: ref,
            blockId: node.node.sourceBlockId,
            hint: "Einen Auslöser dazu anlegen (page.timeline.triggers: von „start“ oder einem anderen Ereignis).",
          });
        }
      }
    } catch (error) {
      add("warning", "event-graph-error", `Der Ereignis-Graph der Folie ließ sich nicht auswerten: ${(error as Error).message}`, { page: ref });
    }
  }

  // Variables that nothing uses.
  const used = new Set<string>();
  const markCondition = (c?: { variableId?: string } | null) => c?.variableId && used.add(c.variableId);
  for (const logic of Object.values(content.logicBlocks)) for (const branch of logic.branches ?? []) markCondition(branch.condition);
  for (const [pageId, page] of Object.entries(content.pages)) {
    if (!placed.has(pageId)) continue;
    for (const target of page.jump?.targets ?? []) markCondition(target.condition);
    for (const block of Object.values(page.blocks ?? {})) {
      for (const { effects } of effectsOf(block)) for (const effect of effects) used.add(effect.variableId);
      for (const html of placeholderSources(block)) for (const m of html.matchAll(NAME_IN_NODE)) used.add(m[1].trim());
    }
  }
  for (const layout of Object.values(content.layouts)) {
    for (const block of Object.values(layout.blocks ?? {})) for (const html of placeholderSources(block as Block)) for (const m of html.matchAll(NAME_IN_NODE)) used.add(m[1].trim());
  }
  for (const variable of content.variables) {
    if (variable.fixed) continue;
    if (!used.has(variable.id) && !used.has(variable.name) && !content.variables.some((v) => v.expression?.includes(variable.name))) {
      add("info", "variable-unused", `Die Variable „${variable.name}" wird nirgends benutzt.`);
    }
  }
  return findings;
}
