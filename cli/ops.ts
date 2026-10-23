import "./domShim";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { safeLinkUrl } from "../src/core/document/linkUrl";
import * as actions from "../src/core/document/actions";
import { DEFAULT_TEXT_BOX } from "../src/core/document/textBox";
import { buildTextHtml, estimateHeightPercent } from "./markup";
import type { TextSpec } from "./markup";
import { applyPlaceholderStyle, plainParagraphs } from "../src/core/document/placeholders";
import { pageLabels } from "../src/core/document/pageLabels";
import {
  blockEffectNodeId,
  buttonClickNodeId,
  groupEffectNodeId,
  listItemNodeId,
  quizEndNodeId,
  quizFillNodeId,
  quizSubmitNodeId,
  videoEndNodeId,
  videoResumeNodeId,
  videoStartNodeId,
  revealerButtonNodeId,
  revealerOpenNodeId,
  videoStopNodeId,
} from "../src/core/document/pageTimeline";
import { branchPageIds, sequenceOf } from "../src/core/document/sequence";
import type { Block, VariableCondition, VariableType, WeftModule } from "../src/core/types";
import { createId } from "../src/core/id";
import { aspectRatioNumeric } from "../src/core/aspectRatio";
import { CliError } from "./load";
import { readMedia } from "./media";
import { setCurrentModule } from "./storeStub";

/**
 * Changes to a module as a list of operations (weft edit, the MCP tool weft_edit). Every operation is one of the editor's own
 * actions (core/document/actions.ts) run on the module - so what comes out is what the editor would have made: the page timeline
 * kept in step, the order keys, the defaults of a new block.
 *
 * Things are named the way the overview names them: a page by its number ("3", "2.a.1") or its id, a layout by its name or id, a
 * variable by its name or id, a block by its id. An operation can give what it creates a name of its own (`as`) that the operations
 * after it can use as "$name".
 */

/** A plain text (lines = paragraphs) or html, formatted like the sample text of a placeholder. */
function styledHtml(sampleHtml: string, text: string): string {
  const paragraphs = text.includes("<") ? plainParagraphs(text) : text.split(/\r?\n/);
  return applyPlaceholderStyle(sampleHtml, paragraphs);
}

export type Operation = { op: string; as?: string } & Record<string, unknown>;

export interface OperationResult {
  index: number;
  op: string;
  /** What the operation made or did, with ids. */
  result: Record<string, unknown>;
}

const TRANSITION_TYPES = ["none", "fade", "move", "iris", "cube", "blur", "horror", "wheel"];
const COMPARATORS = ["eq", "neq", "gt", "gte", "lt", "lte"] as const;

/** A file that goes into the archive along with the changes (a picture, a video): the module only lists it (assets). */
export interface PendingAsset {
  id: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

interface Context {
  content: WeftModule;
  aliases: Map<string, string>;
  assets: PendingAsset[];
  /** What is known of the files added in this run, by asset id (the pixel size). */
  media: Map<string, { kind: "image" | "video" | "audio"; width?: number; height?: number; path: string }>;
}

function fail(message: string): never {
  throw new CliError(message, 1);
}

function str(value: unknown, what: string): string {
  if (typeof value !== "string" || value === "") fail(`„${what}" fehlt (oder ist kein Text).`);
  return value;
}

function alias(ctx: Context, value: string): string {
  if (!value.startsWith("$")) return value;
  const id = ctx.aliases.get(value.slice(1));
  if (!id) fail(`Der Name „${value}" ist noch nicht vergeben (mit "as" bei der Operation, die es anlegt).`);
  return id;
}

function pageId(ctx: Context, ref: unknown, what = "page"): string {
  const value = alias(ctx, str(ref, what));
  if (ctx.content.pages[value]) return value;
  const labels = pageLabels(ctx.content);
  const found = Object.entries(labels).find(([, label]) => label === value);
  if (found) return found[0];
  return fail(`Es gibt keine Folie „${value}". Folien heißen wie in der Übersicht (3, 2.a.1) oder haben eine Id.`);
}

function layoutId(ctx: Context, ref: unknown, what = "layout"): string {
  const value = alias(ctx, str(ref, what));
  if (ctx.content.layouts[value]) return value;
  const byName = Object.values(ctx.content.layouts).filter((l) => l.name === value);
  if (byName.length === 1) return byName[0].id;
  if (byName.length > 1) fail(`Es gibt mehrere Layouts „${value}" - die Id nehmen.`);
  return fail(`Es gibt kein Layout „${value}".`);
}

function variableId(ctx: Context, ref: unknown): string {
  const value = alias(ctx, str(ref, "variable"));
  const byId = ctx.content.variables.find((v) => v.id === value);
  if (byId) return byId.id;
  const byName = ctx.content.variables.find((v) => v.name === value);
  if (byName) return byName.id;
  return fail(`Es gibt keine Variable „${value}". Mit {"op":"add_variable", ...} anlegen.`);
}

function logicId(ctx: Context, ref: unknown): string {
  const value = alias(ctx, str(ref, "logic"));
  if (ctx.content.logicBlocks[value]) return value;
  const byName = Object.values(ctx.content.logicBlocks).filter((l) => l.name === value);
  if (byName.length === 1) return byName[0].id;
  return fail(`Es gibt keine Verzweigung „${value}"${byName.length > 1 ? " (mehrere gleichen Namens - die Id nehmen)" : ""}.`);
}

function branchId(ctx: Context, logic: string, ref: unknown): string {
  const value = alias(ctx, str(ref, "branch"));
  const branches = ctx.content.logicBlocks[logic].branches;
  const found = branches.find((b) => b.id === value) ?? branches.find((b) => b.label === value);
  return found ? found.id : fail(`Die Verzweigung hat keinen Zweig „${value}". Es gibt: ${branches.map((b) => b.label).join(", ")}.`);
}

function condition(ctx: Context, raw: unknown): VariableCondition {
  const c = raw as { variable?: unknown; comparator?: unknown; value?: unknown } | undefined;
  if (!c || typeof c !== "object") return fail('Eine Bedingung braucht {"variable": "name", "comparator": "gte", "value": 1}.');
  const comparator = String(c.comparator ?? "eq");
  if (!(COMPARATORS as readonly string[]).includes(comparator)) fail(`„${comparator}" ist kein Vergleich. Möglich: ${COMPARATORS.join(", ")}.`);
  return { variableId: variableId(ctx, c.variable), comparator: comparator as VariableCondition["comparator"], value: c.value as VariableCondition["value"] };
}

/** Where a block is: a page, or a layout. */
function findBlock(ctx: Context, ref: unknown): { block: Block; container: { kind: "page"; id: string } | { kind: "layout"; id: string } } {
  const id = alias(ctx, str(ref, "block"));
  for (const [pid, page] of Object.entries(ctx.content.pages)) {
    if (page.blocks[id]) return { block: page.blocks[id], container: { kind: "page", id: pid } };
  }
  for (const [lid, layout] of Object.entries(ctx.content.layouts)) {
    if (layout.blocks[id]) return { block: layout.blocks[id] as Block, container: { kind: "layout", id: lid } };
  }
  return fail(`Es gibt keinen Block mit der Id „${id}".`);
}

/** The node of an event graph named in a short way ("start", "end", "entrance:<block>", ...) or by its real id. */
function eventId(ctx: Context, raw: unknown, what: string): string {
  const value = alias(ctx, str(raw, what));
  const colon = value.indexOf(":");
  if (value === "start" || value === "end" || colon < 0) return value;
  const kind = value.slice(0, colon);
  const rest = value.slice(colon + 1);
  const blockOf = () => findBlock(ctx, rest).block.id;
  switch (kind) {
    case "entrance":
      return blockEffectNodeId(blockOf(), "entrance");
    case "exit":
      return blockEffectNodeId(blockOf(), "exit");
    case "click":
      return buttonClickNodeId(blockOf());
    case "group-entrance":
      return groupEffectNodeId(rest, "entrance");
    case "group-exit":
      return groupEffectNodeId(rest, "exit");
    case "quiz-fill":
      return quizFillNodeId(blockOf());
    case "quiz-submit":
      return quizSubmitNodeId(blockOf());
    case "quiz-correct":
      return quizSubmitNodeId(blockOf(), "richtig");
    case "quiz-incorrect":
      return quizSubmitNodeId(blockOf(), "falsch");
    case "quiz-correct-end":
      return quizEndNodeId(blockOf(), "richtig");
    case "quiz-incorrect-end":
      return quizEndNodeId(blockOf(), "falsch");
    case "revealer-open":
      return revealerOpenNodeId(blockOf());
    case "revealer-button":
      return revealerButtonNodeId(blockOf());
    case "video-start":
      return videoStartNodeId(blockOf());
    case "video-end":
      return videoEndNodeId(blockOf());
    case "video-stop": {
      const [block, point] = rest.split(":");
      return videoStopNodeId(findBlock(ctx, block).block.id, point);
    }
    case "video-resume": {
      const [block, point] = rest.split(":");
      return videoResumeNodeId(findBlock(ctx, block).block.id, point);
    }
    case "list-item": {
      const [block, item] = rest.split(":");
      return listItemNodeId(findBlock(ctx, block).block.id, item);
    }
    default:
      return value; // a real id with a colon in it ("block-entrance:<id>", "end:quiz:...")
  }
}

/** Index in the main sequence after which a new entry goes. */
function afterIndex(ctx: Context, after: unknown): number {
  const entries = sequenceOf(ctx.content);
  if (after === undefined || after === "end") return entries.length - 1;
  if (after === "start") return -1;
  const value = alias(ctx, str(after, "after"));
  const labels = pageLabels(ctx.content);
  // A logic block by its name or id: after the whole block.
  const logic = Object.values(ctx.content.logicBlocks).find((l) => l.id === value || l.name === value);
  const index = entries.findIndex((entry) =>
    entry.kind === "logic" ? (logic ? entry.logicBlockId === logic.id : false) : entry.pageId === value || labels[entry.pageId] === value,
  );
  if (index < 0) fail(`„${value}" steht nicht in der Hauptfolge (nur Folien und Verzweigungen dort; in einem Zweig mit "branch" einfügen).`);
  return index;
}

function plainBranchPages(ctx: Context, logic: string, branch: string): string[] {
  const found = ctx.content.logicBlocks[logic].branches.find((b) => b.id === branch);
  return found ? branchPageIds(found) : [];
}

/**
 * The values of a "set" with the names of the operations resolved: "$name" is what was made under that name, a `variableId` may be
 * the name of a variable, a `targetPageId` the number of a page ("2.a.1"). Anything else is left alone.
 */
function resolveSet(ctx: Context, value: unknown, key?: string): unknown {
  if (typeof value === "string") {
    if (value.startsWith("$") && ctx.aliases.has(value.slice(1))) return ctx.aliases.get(value.slice(1));
    if (key === "variableId") {
      const variable = ctx.content.variables.find((v) => v.id === value) ?? ctx.content.variables.find((v) => v.name === value);
      return variable ? variable.id : value;
    }
    if (key === "targetPageId" || key === "defaultPageId") {
      if (ctx.content.pages[value]) return value;
      const found = Object.entries(pageLabels(ctx.content)).find(([, label]) => label === value);
      return found ? found[0] : value;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => resolveSet(ctx, item, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveSet(ctx, v, k)]));
  }
  return value;
}

// A block's fields that are objects (position, fill, stroke, entranceEffect ...) are merged with what the block has, not replaced: setting
// {"fill": {"color": "#fbbf24"}} keeps the rest of the fill, and {"position": {"y": 40}} the rest of the position. (Lists are replaced.)
const isPlain = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

function mergeDeep(current: unknown, patch: unknown): unknown {
  if (isPlain(current) && isPlain(patch)) {
    const merged: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(patch)) merged[key] = key in current ? mergeDeep(current[key], value) : value;
    return merged;
  }
  return patch;
}

function mergePatch(block: unknown, patch: unknown): unknown {
  if (!isPlain(patch)) return patch;
  const current = JSON.parse(JSON.stringify(block)) as Record<string, unknown>;
  const merged: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    // A text box that is not there yet starts from the standard one.
    merged[key] = key === "box" && current.box === undefined && isPlain(value) ? mergeDeep(DEFAULT_TEXT_BOX, value) : mergeDeep(current[key], value);
  }
  return merged;
}

interface AssetInfo {
  kind: "image" | "video" | "audio";
  fileName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  warnings: string[];
}

function kindWithArticle(kind: "image" | "video" | "audio"): string {
  return kind === "image" ? "ein Bild" : kind === "video" ? "ein Video" : "eine Audiodatei";
}

/** The asset an operation names: a file on disk (`file`: it is added to the module) or one the module has (`asset`: its id, file name or
 * a "$name" from add_asset). Only a file added in this run is known by its pixel size. */
function assetFor(ctx: Context, op: Operation, expect: "image" | "video" | "audio" | undefined): { id: string; info: AssetInfo } {
  if (typeof op.file === "string") {
    const media = readMedia(op.file);
    if (expect && media.kind !== expect) fail(`„${op.file}" ist ${kindWithArticle(media.kind)}, hier wird ${kindWithArticle(expect)} gebraucht.`);
    // The same file twice in one run is one asset.
    const known = [...ctx.media.entries()].find(([, m]) => m.path === media.path);
    if (known) {
      const meta = ctx.content.assets.find((a) => a.id === known[0])!;
      return { id: known[0], info: { kind: media.kind, fileName: meta.fileName, mimeType: meta.mimeType, size: media.bytes.length, width: media.width, height: media.height, warnings: [] } };
    }
    const id = createId();
    ctx.content.assets.push({ id, fileName: media.fileName, mimeType: media.mimeType });
    ctx.assets.push({ id, fileName: media.fileName, mimeType: media.mimeType, bytes: media.bytes });
    ctx.media.set(id, { kind: media.kind, width: media.width, height: media.height, path: media.path });
    return {
      id,
      info: { kind: media.kind, fileName: media.fileName, mimeType: media.mimeType, size: media.bytes.length, width: media.width, height: media.height, warnings: media.warnings },
    };
  }
  if (typeof op.asset === "string") {
    const ref = alias(ctx, op.asset);
    const meta = ctx.content.assets.find((a) => a.id === ref) ?? ctx.content.assets.find((a) => a.fileName === ref);
    if (!meta) return fail(`Das Modul hat keine Datei „${ref}". Mit "file" eine Datei hinzufügen (oder add_asset).`);
    const kind = meta.mimeType.startsWith("video/") ? "video" : meta.mimeType.startsWith("audio/") ? "audio" : "image";
    if (expect && kind !== expect) fail(`Die Datei „${meta.fileName}" ist ${kindWithArticle(kind)}, hier wird ${kindWithArticle(expect)} gebraucht.`);
    const known = ctx.media.get(meta.id);
    return { id: meta.id, info: { kind, fileName: meta.fileName, mimeType: meta.mimeType, size: 0, width: known?.width, height: known?.height, warnings: [] } };
  }
  return fail('"file" (Pfad einer Bild-/Video-/Audiodatei) oder "asset" (eine Datei, die das Modul schon hat) fehlt.');
}

/** `position`, reshaped to the picture's own shape (the same centre and about the same area), so that it fills its box. */
function fittedPosition(ctx: Context, position: Block["position"], info: AssetInfo) {
  const ratio = info.width && info.height ? info.width / info.height : info.kind === "video" ? 16 / 9 : null;
  if (!ratio) return position;
  return actions.fitToAspect(position, ratio / aspectRatioNumeric(ctx.content.aspectRatio));
}

function addMediaBlock(ctx: Context, op: Operation, kind: "image" | "video" | "audio"): Record<string, unknown> {
  const { id: assetId, info } = assetFor(ctx, op, kind);
  const footprint = (op.position as Block["position"] | undefined) ?? { x: 20, y: 20, width: 60, height: 60 };
  // A sound has no shape of its own: a bar of the width given (and 12 % high) unless a position says otherwise.
  const position =
    kind === "audio"
      ? ((op.position as Block["position"] | undefined) ?? { x: 30, y: 40, width: 40, height: 12 })
      : op.fit === false
        ? footprint
        : fittedPosition(ctx, { ...footprint, rotation: footprint.rotation }, info);
  const set: Record<string, unknown> = { assetId, position };
  if (kind === "image" && typeof op.alt === "string") set.alt = op.alt;
  if (kind === "video") {
    for (const key of ["autoplay", "loop", "muted", "controls"] as const) if (typeof op[key] === "boolean") set[key] = op[key];
  }
  if (kind === "audio") {
    if (typeof op.autoplay === "boolean") set.autoplay = op.autoplay;
    if (typeof op.loop === "boolean") set.loop = op.loop;
    if (op.appearance === "hidden" || op.appearance === "player") set.appearance = op.appearance;
  }
  let blockId: string;
  if (op.layout !== undefined) {
    const layout = layoutId(ctx, op.layout);
    blockId = actions.addBlockToLayout(layout, kind);
    actions.updateLayoutBlock(layout, blockId, set as never);
  } else {
    const page = pageId(ctx, op.page);
    if (ctx.content.pages[page].jump) fail("Auf eine Sprung-Folie lassen sich keine Blöcke legen.");
    blockId = actions.addBlockToPage(page, kind);
    actions.updateBlock(page, blockId, set as never);
  }
  remember(ctx, op, blockId);
  return { block: blockId, asset: assetId, position, ...(info.warnings.length ? { warnings: info.warnings } : {}) };
}

function remember(ctx: Context, op: Operation, id: string): void {
  if (typeof op.as === "string" && op.as !== "") ctx.aliases.set(op.as.replace(/^\$/, ""), id);
}

// ---- the operations ------------------------------------------------------------------------------------------------------

type Handler = (ctx: Context, op: Operation) => Record<string, unknown>;

const HANDLERS: Record<string, Handler> = {
  set_title(ctx, op) {
    actions.setModuleTitle(str(op.title, "title"));
    return { title: ctx.content.title };
  },
  set_template(ctx, op) {
    actions.setTemplate(op.template !== false);
    return { template: !!ctx.content.template };
  },
  set_languages(ctx, op) {
    const languages = op.languages;
    if (!Array.isArray(languages) || languages.some((l) => typeof l !== "string")) fail('"languages" ist eine Liste von Sprachcodes, zum Beispiel ["de_DE", "fr_FR"].');
    actions.setLanguages(languages as string[]);
    return { languages: ctx.content.languages };
  },
  set_aspect_ratio(ctx, op) {
    actions.setAspectRatio(str(op.aspectRatio, "aspectRatio") as never);
    return { aspectRatio: ctx.content.aspectRatio };
  },
  set_look(ctx, op) {
    if (op.brightness !== undefined) {
      if (op.brightness !== "light" && op.brightness !== "dark") fail('"brightness" ist "light" oder "dark".');
      actions.setBrightness(op.brightness);
    }
    if (op.accentColor !== undefined) {
      if (op.accentColor === null) actions.setAccentColor(null);
      else {
        const color = str(op.accentColor, "accentColor");
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) fail('"accentColor" ist eine Farbe wie "#3b82f6" (oder null: keine).');
        actions.setAccentColor(color.toLowerCase());
      }
    }
    if (op.interactiveStyle !== undefined) {
      if (!["plain", "elegant", "round", "futuristic"].includes(op.interactiveStyle as string)) fail('"interactiveStyle" ist "plain", "elegant", "round" oder "futuristic".');
      actions.setInteractiveStyle(op.interactiveStyle as never);
    }
    return { brightness: ctx.content.brightness ?? "light", accentColor: ctx.content.accentColor ?? null, interactiveStyle: ctx.content.interactiveStyle ?? "plain" };
  },
  // The slide transition (how a page goes away): set_transition {page | "all" | [pages], type, durationMs?, direction?, contentOnly?, hardEdge?,
  // end? (the "Nächste Folie" of a quiz outcome; default the plain one)}
  set_transition(ctx, op) {
    const type = str(op.type, "type");
    if (!TRANSITION_TYPES.includes(type)) fail(`„${type}" ist kein Übergang. Möglich: ${TRANSITION_TYPES.join(", ")}.`);
    const refs = op.page === "all" ? Object.entries(pageLabels(ctx.content)).filter(([id]) => ctx.content.pages[id] && !ctx.content.pages[id].jump).map(([id]) => id) : (Array.isArray(op.page) ? op.page : [op.page]).map((ref) => pageId(ctx, ref));
    const endId = typeof op.end === "string" ? op.end : "end";
    for (const id of refs) {
      if (!ctx.content.pages[id].timeline.ends[endId]) fail(`Die Folie hat kein „${endId}" (Nächste Folie).`);
      actions.setEndTransitionType(id, endId, type as never);
      if (typeof op.durationMs === "number") actions.setEndTransitionDuration(id, endId, op.durationMs);
      const options: Record<string, unknown> = {};
      for (const key of ["direction", "contentOnly", "hardEdge", "irisCenter", "background"]) if (op[key] !== undefined) options[key] = op[key];
      if (Object.keys(options).length > 0) actions.updateEndTransition(id, endId, options as never);
    }
    return { pages: refs.length, type };
  },
  // The colour scheme of the module (the colours every colour picker offers): set_palette {colors: ["#fbbf24", ...]} replaces it.
  set_palette(ctx, op) {
    if (!Array.isArray(op.colors) || op.colors.some((c) => typeof c !== "string" || !/^#[0-9a-fA-F]{6}$/.test(c))) fail('"colors" ist eine Liste von Farben wie ["#fbbf24", "#2dd4bf"].');
    for (const entry of [...(ctx.content.colorPalette ?? [])]) actions.removePaletteColor(entry.id);
    for (const color of op.colors as string[]) actions.addPaletteColor(color);
    return { colors: (ctx.content.colorPalette ?? []).map((c) => c.color) };
  },
  // A JavaScript library for the logic blocks (script blocks) of the module: add_script_library {file: "path/to/lib.js"} or {name: "lib.js", code: "..."},
  // run once at the start, in the order they were added; one with the same name is replaced.
  add_script_library(ctx, op) {
    let name: string;
    let code: string;
    if (typeof op.file === "string") {
      try {
        code = readFileSync(op.file, "utf8");
      } catch (error) {
        return fail(`Die Datei „${op.file}" lässt sich nicht lesen: ${(error as Error).message}`);
      }
      name = typeof op.name === "string" && op.name !== "" ? op.name : basename(op.file);
    } else {
      name = str(op.name, "name");
      code = str(op.code, "code");
    }
    const id = actions.addScriptLibrary(name, code);
    remember(ctx, op, id);
    return { library: id, fileName: name, size: code.length };
  },
  remove_script_library(ctx, op) {
    const ref = alias(ctx, str(op.library, "library"));
    const found = (ctx.content.scriptLibraries ?? []).find((l) => l.id === ref || l.fileName === ref);
    if (!found) return fail(`Es gibt keine JavaScript-Bibliothek „${ref}". Es gibt: ${(ctx.content.scriptLibraries ?? []).map((l) => l.fileName).join(", ") || "keine"}.`);
    actions.removeScriptLibrary(found.id);
    return { library: found.id };
  },
  set_keyboard_navigation(_ctx, op) {
    actions.setKeyboardNavigationEnabled(op.enabled !== false);
    return { enabled: op.enabled !== false };
  },

  add_variable(ctx, op) {
    const type = str(op.type ?? "number", "type") as VariableType;
    const id = actions.addVariable(str(op.name, "name"), type);
    if (op.initialValue !== undefined || op.expression !== undefined) {
      actions.updateVariable(id, {
        ...(op.initialValue !== undefined ? { initialValue: op.initialValue as never } : {}),
        ...(op.expression !== undefined ? { expression: String(op.expression) } : {}),
      });
    }
    remember(ctx, op, id);
    return { variable: id, name: op.name };
  },
  update_variable(ctx, op) {
    const id = variableId(ctx, op.variable);
    actions.updateVariable(id, resolveSet(ctx, op.set ?? {}) as never);
    return { variable: id };
  },
  remove_variable(ctx, op) {
    const id = variableId(ctx, op.variable);
    actions.removeVariable(id);
    return { variable: id };
  },

  add_layout(ctx, op) {
    const id = actions.addLayout(str(op.name, "name"));
    remember(ctx, op, id);
    return { layout: id };
  },
  rename_layout(ctx, op) {
    const id = layoutId(ctx, op.layout);
    actions.renameLayout(id, str(op.name, "name"));
    return { layout: id };
  },

  add_page(ctx, op) {
    const layout = op.layout !== undefined ? layoutId(ctx, op.layout) : (Object.keys(ctx.content.layouts)[0] ?? null);
    let id: string;
    if (op.branch !== undefined) {
      const b = op.branch as { logic?: unknown; branch?: unknown; after?: unknown };
      const logic = logicId(ctx, b.logic);
      const branch = branchId(ctx, logic, b.branch);
      const afterPage = b.after !== undefined ? pageId(ctx, b.after, "branch.after") : undefined;
      id = actions.addPageToBranch(logic, branch, layout, afterPage);
    } else {
      id = actions.addPageToSequence(afterIndex(ctx, op.after), layout);
    }
    remember(ctx, op, id);
    return { page: id, label: pageLabels(ctx.content)[id] };
  },
  add_jump_page(ctx, op) {
    let id: string;
    if (op.branch !== undefined) {
      const b = op.branch as { logic?: unknown; branch?: unknown; after?: unknown };
      const logic = logicId(ctx, b.logic);
      const branch = branchId(ctx, logic, b.branch);
      id = actions.addJumpToBranch(logic, branch, b.after !== undefined ? pageId(ctx, b.after, "branch.after") : undefined);
    } else {
      id = actions.addJumpToSequence(afterIndex(ctx, op.after));
    }
    for (const target of (op.targets as { page?: unknown; condition?: unknown }[] | undefined) ?? []) {
      actions.addJumpTarget(id, pageId(ctx, target.page, "targets[].page"));
      const jump = ctx.content.pages[id].jump!;
      const created = jump.targets[jump.targets.length - 1];
      actions.updateJumpTarget(id, created.id, { condition: condition(ctx, target.condition) });
    }
    if (op.default !== undefined) actions.setJumpDefault(id, op.default === null ? null : pageId(ctx, op.default, "default"));
    remember(ctx, op, id);
    return { page: id, label: pageLabels(ctx.content)[id] };
  },
  add_jump_target(ctx, op) {
    const id = pageId(ctx, op.page);
    actions.addJumpTarget(id, pageId(ctx, op.target, "target"));
    const jump = ctx.content.pages[id].jump;
    if (!jump) return fail(`Die Folie ${String(op.page)} ist keine Sprung-Folie.`);
    const created = jump.targets[jump.targets.length - 1];
    if (op.condition !== undefined) actions.updateJumpTarget(id, created.id, { condition: condition(ctx, op.condition) });
    return { page: id, target: created.id };
  },
  add_logic(ctx, op) {
    const layout = op.layout !== undefined ? layoutId(ctx, op.layout) : (Object.keys(ctx.content.layouts)[0] ?? null);
    const specs = (op.branches as { label?: string; condition?: unknown }[] | undefined) ?? [{ label: "Zweig 1" }];
    if (specs.length < 1) fail('"branches" braucht mindestens einen Zweig (der letzte ist das „sonst").');
    const logic = actions.addLogicBlockToSequence(afterIndex(ctx, op.after), layout);
    if (op.name !== undefined) actions.renameLogicBlock(logic, str(op.name, "name"));
    // The block comes with one branch (the "sonst"); every further one goes in front of it.
    for (let i = 1; i < specs.length; i++) actions.addBranch(logic, layout);
    const branches = ctx.content.logicBlocks[logic].branches;
    specs.forEach((spec, i) => {
      const branch = branches[i];
      actions.renameBranch(logic, branch.id, spec.label ?? `Zweig ${i + 1}`);
      if (i < specs.length - 1) {
        if (spec.condition === undefined) fail(`Der Zweig „${spec.label ?? i + 1}" braucht eine "condition" (nur der letzte ist das „sonst").`);
        actions.updateBranchCondition(logic, branch.id, condition(ctx, spec.condition));
      }
    });
    remember(ctx, op, logic);
    const labels = pageLabels(ctx.content);
    return {
      logic,
      branches: ctx.content.logicBlocks[logic].branches.map((b) => ({
        id: b.id,
        label: b.label,
        pages: plainBranchPages(ctx, logic, b.id).map((p) => ({ page: p, label: labels[p] })),
      })),
    };
  },
  add_branch_page(ctx, op) {
    return HANDLERS.add_page(ctx, op);
  },
  remove_page(ctx, op) {
    const id = pageId(ctx, op.page);
    actions.removePage(id);
    return { page: id };
  },
  set_page_layout(ctx, op) {
    const id = pageId(ctx, op.page);
    actions.setPageLayout(id, op.layout === null ? null : layoutId(ctx, op.layout));
    return { page: id };
  },

  add_block(ctx, op) {
    const kind = str(op.kind, "kind") as Block["kind"];
    let id: string;
    if (op.layout !== undefined) {
      const layout = layoutId(ctx, op.layout);
      id = actions.addBlockToLayout(layout, kind as never);
      if (op.set) actions.updateLayoutBlock(layout, id, mergePatch(ctx.content.layouts[layout].blocks[id], resolveSet(ctx, op.set)) as never);
    } else {
      const page = pageId(ctx, op.page);
      if (ctx.content.pages[page].jump) fail("Auf eine Sprung-Folie lassen sich keine Blöcke legen.");
      if (kind === "placeholder") fail("Ein Platzhalter-Text gehört in ein Layout (mit \"layout\"), nicht auf eine Folie.");
      id = actions.addBlockToPage(page, kind);
      if (op.set) actions.updateBlock(page, id, mergePatch(ctx.content.pages[page].blocks[id], resolveSet(ctx, op.set)) as never);
    }
    remember(ctx, op, id);
    return { block: id };
  },
  // A text from a plain description (the markup is the editor's, see markup.ts): add_text {page | layout, text | paragraphs | html,
  // x, y, width, height | "auto", size, color, bold, italic, align, font, lineHeight, gap, box, effect, as}
  add_text(ctx, op) {
    const container = op.layout !== undefined ? { layout: op.layout } : { page: op.page };
    let html: string;
    if (typeof op.html === "string") html = op.html;
    else if (op.text !== undefined || op.paragraphs !== undefined) html = buildTextHtml(op as TextSpec);
    else return fail('add_text braucht "text" (Zeilen = Absätze), "paragraphs" (Absätze aus Teilen mit eigener Farbe/Größe) oder "html".');
    const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
    const width = num(op.width, 50);
    const height = typeof op.height === "number" ? op.height : estimateHeightPercent(op as TextSpec, width, aspectRatioNumeric(ctx.content.aspectRatio), num((op.box as { padding?: number } | undefined)?.padding, 0.8));
    const set: Record<string, unknown> = { html, position: { x: num(op.x, 10), y: num(op.y, 10), width, height: Math.round(height * 100) / 100 } };
    for (const key of ["box", "scrollable", "name"]) if (op[key] !== undefined) set[key] = op[key];
    if (op.effect !== undefined) set.entranceEffect = typeof op.effect === "string" ? { type: op.effect, durationMs: 450 } : op.effect;
    const result = HANDLERS.add_block(ctx, { op: "add_block", ...container, kind: "text", set, as: op.as });
    return { ...result, height: set.height as number };
  },
  // A shape from a plain description: add_shape {page | layout, shape: rectangle | ellipse | polygon | star, x, y, width, height, color, opacity,
  // gradient: {kind, angle, stops: [[color, offset, opacity?], ...]}, radius (0-50, a rectangle's corners), stroke: {color, width, opacity,
  // style}, shadow: true | {...}, blur (a rectangle or ellipse lets what is behind it show through, blurred), sides, points, effect, as}
  add_shape(ctx, op) {
    const container = op.layout !== undefined ? { layout: op.layout } : { page: op.page };
    const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
    const set: Record<string, unknown> = {
      position: { x: num(op.x, 30), y: num(op.y, 30), width: num(op.width, 40), height: num(op.height, 40) },
    };
    if (op.shape !== undefined) set.shapeKind = op.shape;
    if (op.gradient && typeof op.gradient === "object") {
      const g = op.gradient as { kind?: string; angle?: number; stops?: unknown[] };
      const stops = (g.stops ?? []).map((stop, i) => {
        const [color, offset, opacity] = stop as [string, number, number?];
        return { id: `s${i}`, color, offset: offset ?? (i === 0 ? 0 : 100), opacity: opacity ?? 1 };
      });
      if (stops.length < 2) fail('Ein Verlauf braucht mindestens zwei Stopps: "stops": [["#0b1124", 0], ["#1c1a4d", 100]].');
      set.fill = { type: "gradient", color: stops[0].color, opacity: 1, gradient: { kind: g.kind ?? "linear", angle: g.angle ?? 90, stops } };
    } else if (op.color === null || op.fill === "none") set.fill = { type: "none" };
    else if (typeof op.color === "string") set.fill = { type: "solid", color: op.color, ...(op.opacity !== undefined ? { opacity: op.opacity } : {}) };
    else if (op.opacity !== undefined) set.fill = { opacity: op.opacity };
    if (typeof op.radius === "number") set.cornerRadii = { topLeft: op.radius, topRight: op.radius, bottomLeft: op.radius, bottomRight: op.radius };
    if (op.stroke && typeof op.stroke === "object") set.stroke = { enabled: true, ...(op.stroke as object) };
    if (op.shadow === true) set.shadow = { enabled: true };
    else if (op.shadow && typeof op.shadow === "object") set.shadow = { enabled: true, ...(op.shadow as object) };
    if (op.blur !== undefined) {
      if (op.shape !== undefined && op.shape !== "rectangle" && op.shape !== "ellipse") fail('"blur" geht nur bei einem Rechteck oder einer Ellipse.');
      set.blurBehind = !!op.blur;
    }
    if (typeof op.sides === "number") set.sides = op.sides;
    if (typeof op.points === "number") set.starPoints = op.points;
    for (const key of ["name"]) if (op[key] !== undefined) set[key] = op[key];
    if (op.effect !== undefined) set.entranceEffect = typeof op.effect === "string" ? { type: op.effect, durationMs: 450 } : op.effect;
    return HANDLERS.add_block(ctx, { op: "add_block", ...container, kind: "shape", set, as: op.as });
  },
  // A link as its own element: add_link {page | layout, url, text?, download?, x, y, width, height, effect?, name?, as}. url: an address (http, https,
  // mailto, tel; one without a scheme becomes https) that opens in a new tab; download: true when it is a file to download (the symbol is a
  // download symbol then). How it looks is the module's style of interactive elements.
  add_link(ctx, op) {
    const container = op.layout !== undefined ? { layout: op.layout } : { page: op.page };
    const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
    const set: Record<string, unknown> = { position: { x: num(op.x, 35), y: num(op.y, 50), width: num(op.width, 30), height: num(op.height, 8) } };
    if (typeof op.url !== "string") fail('"url" fehlt: die Adresse, zu der der Link führt.');
    const safe = safeLinkUrl(op.url as string);
    if (!safe) fail(`„${op.url}" ist keine Adresse, zu der ein Link führen kann (erlaubt: http(s)://, mailto:, tel:).`);
    set.url = safe;
    if (op.download !== undefined) set.download = op.download === true;
    for (const key of ["text", "name"]) if (op[key] !== undefined) set[key] = op[key];
    if (op.effect !== undefined) set.entranceEffect = typeof op.effect === "string" ? { type: op.effect, durationMs: 450 } : op.effect;
    return HANDLERS.add_block(ctx, { op: "add_block", ...container, kind: "link", set, as: op.as });
  },
  update_block(ctx, op) {
    const { block, container } = findBlock(ctx, op.block);
    if (!op.set || typeof op.set !== "object") fail('"set" fehlt: die Felder, die der Block bekommen soll ({"html": "<p>…</p>"}).');
    const patch = mergePatch(block, resolveSet(ctx, op.set)) as never;
    if (container.kind === "page") actions.updateBlock(container.id, block.id, patch);
    else actions.updateLayoutBlock(container.id, block.id, patch);
    return { block: block.id };
  },
  remove_block(ctx, op) {
    const { block, container } = findBlock(ctx, op.block);
    if (container.kind === "page") actions.removeBlock(container.id, block.id);
    else actions.removeLayoutBlock(container.id, block.id);
    return { block: block.id };
  },

  fill_placeholder(ctx, op) {
    // The text a page has for a placeholder of its layout: made if it is not there, with the placeholder's formatting.
    const page = pageId(ctx, op.page);
    const layout = ctx.content.pages[page].layoutId ? ctx.content.layouts[ctx.content.pages[page].layoutId!] : undefined;
    if (!layout) fail("Die Folie hat kein Layout - also auch keine Platzhalter.");
    const ref = op.placeholder === undefined ? undefined : alias(ctx, str(op.placeholder, "placeholder"));
    const placeholders = Object.values(layout.blocks).filter((b) => b.kind === "placeholder");
    const placeholder =
      ref === undefined
        ? placeholders.length === 1
          ? placeholders[0]
          : undefined
        : (placeholders.find((b) => b.id === ref) ?? placeholders.find((b) => (b as { label?: string }).label === ref));
    if (!placeholder) {
      fail(`Das Layout „${layout.name}" hat ${ref === undefined ? "mehrere oder keine Platzhalter - einen mit \"placeholder\" wählen" : `keinen Platzhalter „${ref}"`}. Es gibt: ${placeholders.map((b) => `${(b as { label?: string }).label} [${b.id}]`).join(", ") || "keine"}.`);
    }
    const id = actions.createPlaceholderText(page, placeholder.id);
    if (!id) return fail("Der Text für den Platzhalter ließ sich nicht anlegen.");
    const sample = (placeholder as { html: string }).html;
    if (typeof op.html === "string") actions.updateBlock(page, id, { html: op.html } as never);
    else if (typeof op.text === "string") actions.updateBlock(page, id, { html: styledHtml(sample, op.text) } as never);
    else fail('"text" (reiner Text, Zeilen = Absätze) oder "html" fehlt.');
    remember(ctx, op, id);
    return { block: id };
  },

  add_asset(ctx, op) {
    const { id, info } = assetFor(ctx, op, undefined);
    remember(ctx, op, id);
    return { asset: id, fileName: info.fileName, mimeType: info.mimeType, kind: info.kind, size: info.size, ...(info.warnings.length ? { warnings: info.warnings } : {}) };
  },
  add_image(ctx, op) {
    return addMediaBlock(ctx, op, "image");
  },
  add_video(ctx, op) {
    return addMediaBlock(ctx, op, "video");
  },
  add_audio(ctx, op) {
    return addMediaBlock(ctx, op, "audio");
  },
  set_media(ctx, op) {
    const { block, container } = findBlock(ctx, op.block);
    if (block.kind !== "image" && block.kind !== "video" && block.kind !== "audio") fail(`Der Block ${block.id} ist ${block.kind}, kein Bild, Video oder Audio.`);
    const { id, info } = assetFor(ctx, op, block.kind);
    const patch: Record<string, unknown> = { assetId: id };
    if (op.fit !== false) patch.position = fittedPosition(ctx, block.position, info);
    if (container.kind === "page") actions.updateBlock(container.id, block.id, patch as never);
    else actions.updateLayoutBlock(container.id, block.id, patch as never);
    return { block: block.id, asset: id, ...(info.warnings.length ? { warnings: info.warnings } : {}) };
  },

  add_trigger(ctx, op) {
    const page = pageId(ctx, op.page);
    actions.addTrigger(page, eventId(ctx, op.from, "from"), eventId(ctx, op.to, "to"), typeof op.delayMs === "number" ? op.delayMs : 0, op.weiter === true);
    const triggers = Object.keys(ctx.content.pages[page].timeline.triggers);
    return { page, trigger: triggers[triggers.length - 1] };
  },
  // What triggers an event, replacing what did (the way "Ausgelöst durch" does in the editor): from = null for "nothing" ("Gar nicht").
  set_trigger(ctx, op) {
    const page = pageId(ctx, op.page);
    const from = op.from === null || op.from === undefined ? null : eventId(ctx, op.from, "from");
    const to = eventId(ctx, op.to, "to");
    actions.setEventTrigger(page, to, from, typeof op.delayMs === "number" ? op.delayMs : 0, op.weiter === true ? "advance" : "timed");
    return { page, to, from };
  },
  remove_trigger(ctx, op) {
    const page = pageId(ctx, op.page);
    const id = str(op.trigger, "trigger");
    if (!ctx.content.pages[page].timeline.triggers[id]) fail(`Die Folie hat keinen Auslöser „${id}" (weft inspect --page zeigt sie).`);
    actions.removeTrigger(page, id);
    return { page, trigger: id };
  },
};

export const OPERATION_NAMES = Object.keys(HANDLERS).filter((name) => name !== "add_branch_page");

/** Runs `operations` on `content` (changed in place). Throws at the first operation that fails: the caller works on a copy. */
export function runOperations(content: WeftModule, operations: Operation[]): { results: OperationResult[]; assets: PendingAsset[] } {
  const ctx: Context = { content, aliases: new Map(), assets: [], media: new Map() };
  const results: OperationResult[] = [];
  setCurrentModule(content);
  try {
    operations.forEach((operation, index) => {
      const handler = HANDLERS[String(operation?.op)];
      if (!handler) {
        throw new CliError(`Operation ${index + 1}: „${String(operation?.op)}" kennt das Werkzeug nicht. Möglich: ${OPERATION_NAMES.join(", ")}.`, 1);
      }
      try {
        results.push({ index, op: operation.op, result: handler(ctx, operation) });
      } catch (error) {
        if (error instanceof CliError) throw new CliError(`Operation ${index + 1} (${operation.op}): ${error.message}`, 1);
        throw new CliError(`Operation ${index + 1} (${operation.op}): ${(error as Error).message}`, 1);
      }
    });
  } finally {
    setCurrentModule(null);
  }
  content.modifiedAt = new Date().toISOString();
  return { results, assets: ctx.assets };
}
