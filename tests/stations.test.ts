import Ajv from "ajv";
import { parseHTML } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import schema from "../docs/weft.schema.json";
import { runOperations } from "../cli/ops";
import { setCurrentModule } from "../cli/storeStub";
import { collectTexts, exportTexts, importTexts } from "../cli/texts";
import { validate } from "../cli/validate";
import { actionEventId, actionEventsOf, conditionEventId, describedKinds, descriptorOf, effectEventId, eventAliasNames, eventIdOfAlias, effectEventsOf, eventLookOf, exportedItemTexts, exportedTexts, fieldsOf, isInvisibleKind, isPageOnlyKind, isTaskBlock, listFieldsOf, ownEventId, ownEventsOf, groupEffectEventsOf, isConditionEventId, isReorderableEventId, parseActionEventId, replacesEntrance, shownWordings, taskEventId, triggerableActionEventTypes, triggerableEffectEventTypes, triggerableOwnEventTypes, variableWordings } from "../src/core/blocks/registry";
import { buildRuntimeHtml } from "../src/core/runtime/buildRuntimeHtml";
import { pageReadingOrder } from "../src/core/document/readingOrder";
import { formatTimeMMSS } from "../src/core/formatTime";
import { TRIGGERABLE_EVENT_TYPES, isChainOrderAllowed, blockActionNodeId, blockEffectNodeId, conditionNodeId, blockNameOf, buttonClickNodeId, canTriggerActionEffectFrom, ensureEffectTriggers, getPageLanes, isListPerItem, listAllNodes, listItemNodeId, quizFillNodeId, groupEffectNodeId, quizSubmitNodeId, revealerButtonNodeId, revealerOpenNodeId, scriptRunNodeId, syncPageTimelineEvents, videoEndNodeId, videoResumeNodeId, videoStartNodeId, videoStopNodeId } from "../src/core/document/pageTimeline";
import { buildEventGraph } from "../src/core/eventGraph/buildEventGraph";
import { buildGraphModel } from "../src/features/editor/eventGraph/model";
import { readFileSync } from "node:fs";
import type { BlockDescriptor, FieldSpec, ListField } from "../src/core/blocks/types";
import { effectEventSpecs } from "../src/core/blocks/pageEvents";
import { pasteBlockInto } from "../src/core/document/actions";
import { clipboardEntryPlainText } from "../src/core/document/clipboard";
import { createEmptyDocument } from "../src/core/document/createEmptyDocument";
import { fieldHtml, fieldHtmlPatch, fieldWording, fieldWordingPatch, isTranslated, itemWording, itemWordingPatch, rotateDefaultLanguage } from "../src/core/document/translations";
import { allowedSlips, clozeIsRight, levenshtein } from "../src/core/document/cloze";
import { usedAssetIds } from "../src/core/document/usedAssets";
import { placeholderSources, withProgress } from "../src/core/document/variablePlaceholders";
import { translations } from "../src/core/i18n/translations";
import { tr } from "../src/core/i18n/tr";
import { CURRENT_FORMAT_VERSION } from "../src/core/io/unpack";
import type { Block, Page, WeftModule } from "../src/core/types";

/**
 * The stations (core/blocks): every kind of block that describes itself (core/blocks/registry.ts) is run through every place that treats all blocks alike -
 * the defaults, the schema, the events of the graph, the translations, the text export and import, the placeholders, the clipboard, the files a block uses,
 * the checks of `weft validate`. The block is made from its descriptor (every field filled, by its type), so a new kind - and a new type of field - is
 * tested by the same code as soon as it is registered: a station that does not know it fails here, not in somebody's module.
 *
 * What a block looks like (its render.js) is in render.test.ts.
 */

// (The clipboard reads formatted texts with a DOM, as the editor has one.)
beforeAll(() => {
  class TestDOMParser {
    parseFromString(html: string) {
      return parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
    }
  }
  Object.assign(globalThis, { DOMParser: TestDOMParser });
});

const DE = "de_DE";
const EN = "en_GB";
const KINDS = describedKinds();

type Fields = Record<string, unknown>;

/** What a field of this type holds in a block that is filled in (the ids are those of the module `populated` makes). */
function sampleOf(name: string, spec: FieldSpec, ids: { asset: string; variable: string }): unknown {
  switch (spec.type) {
    case "text":
      return spec.sample ?? `Beispiel ${name}`;
    case "html":
      return spec.blanks ? `<p>Beispiel [[${name}]] und [[eins|zwei]]</p>` : `<p>Beispiel ${name}</p>`;
    case "number":
      return Math.max(spec.min ?? 0, 2) + 0.5;
    case "choice":
      return spec.options[spec.options.length - 1];
    case "bool":
      return true;
    case "int":
      return Math.max(spec.min ?? 0, 2);
    case "effects":
      return [{ variableId: ids.variable, op: "add", value: 1 }];
    case "ids":
      return [];
    case "pairs":
      return {};
    case "effectsMap":
      return { [`Beispiel ${name}`]: [{ variableId: ids.variable, op: "add", value: 1 }] };
    case "asset":
      return ids.asset;
    case "list": {
      const item = (n: number) => {
        const made = spec.newItem(ids.asset);
        for (const [itemName, itemSpec] of Object.entries(spec.item)) {
          if (itemSpec.type === "text") made[itemName] = `Beispiel ${name} ${n}`;
          if (itemSpec.type === "html") made[itemName] = `<p>Beispiel ${name} ${n}</p>`;
          if (itemSpec.type === "effects") made[itemName] = [{ variableId: ids.variable, op: "add", value: 1 }];
          if (itemSpec.type === "choice") made[itemName] = itemSpec.options[itemSpec.options.length - 1];
          if (itemSpec.type === "number") made[itemName] = Math.max(itemSpec.min ?? 0, 2) + 0.5;
          if (itemSpec.type === "asset") made[itemName] = ids.asset;
        }
        return made;
      };
      return [item(1), item(2)];
    }
  }
}

function sampleFields(descriptor: BlockDescriptor, ids: { asset: string; variable: string }): Fields {
  return Object.fromEntries(Object.entries(descriptor.fields as Record<string, FieldSpec>).map(([name, spec]) => [name, sampleOf(name, spec, ids)]));
}

/** A module (two languages, the first the default) with one page that has one block of the kind: made from its defaults only, or with every field filled. */
function moduleWith(kind: string, filled: boolean) {
  const content = createEmptyDocument().content;
  content.languages = [DE, EN];
  content.assets.push({ id: "asset-1", fileName: "eins.png", mimeType: "image/png" }, { id: "asset-2", fileName: "zwei.png", mimeType: "image/png" });
  const base = runOperations(content, [{ op: "add_variable", name: "punkte", type: "number" }, { op: "add_page" }]);
  const variable = base.results[0].result.variable as string;
  const pageId = base.results[1].result.page as string;
  const descriptor = descriptorOf(kind) as BlockDescriptor;
  const set = filled ? sampleFields(descriptor, { asset: "asset-1", variable }) : undefined;
  // (A kind that exists only in a layout is put in the first layout.)
  const layoutId = Object.keys(content.layouts)[0];
  const where = descriptor.placement.layoutOnly ? { layout: layoutId } : { page: pageId };
  const made = runOperations(content, [{ op: "add_block", ...where, kind, ...(set ? { set } : {}) }]);
  const blockId = made.results[0].result.block as string;
  const block = (descriptor.placement.layoutOnly ? content.layouts[layoutId].blocks[blockId] : content.pages[pageId].blocks[blockId]) as Block;
  return { content, pageId, blockId, block, descriptor, variable };
}

/** The block `blockId` of the module, on the page or (a placeholder) in a layout. */
function blockIn(content: WeftModule, pageId: string, blockId: string) {
  return content.pages[pageId].blocks[blockId] ?? Object.values(content.layouts).map((layout) => layout.blocks[blockId]).find(Boolean);
}

const ajv = new Ajv({ allErrors: true, strict: false });
function schemaProblems(block: Block, definition: string): string[] {
  const validator = ajv.compile({ ...(schema as object), $ref: `#/definitions/${definition}` } as object);
  validator(block);
  return (validator.errors ?? []).map((error) => `${error.instancePath || "(block)"} ${error.message}`);
}

const hasWords = (text: unknown) => typeof text === "string" && text.trim() !== "";
const escapeText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

describe("the registry", () => {
  it("describes at least the kinds that have been moved to it", () => {
    expect(KINDS).toEqual(expect.arrayContaining(["solution", "gallery", "iframe"]));
  });

  it("gives every kind its own definition in the file's schema", () => {
    const definitions = KINDS.map((kind) => (descriptorOf(kind) as BlockDescriptor).schemaDefinition);
    expect(new Set(definitions).size).toBe(definitions.length);
  });
});

describe.each(KINDS)("the descriptor of %s", (kind) => {
  const descriptor = descriptorOf(kind) as BlockDescriptor;
  const definitions = (schema as { definitions: Record<string, { properties?: Record<string, { const?: string }> }> }).definitions;

  it("matches its definition in the file's schema (docs/weft.schema.json)", () => {
    const definition = definitions[descriptor.schemaDefinition];
    expect(definition, `the schema has no ${descriptor.schemaDefinition}`).toBeDefined();
    expect(definition.properties?.kind?.const).toBe(kind);
    // (A field the descriptor names that the block does not have is a slip: no station would ever find it.)
    for (const name of Object.keys(descriptor.fields)) expect(Object.keys(definition.properties ?? {}), `${name} is not a property of ${descriptor.schemaDefinition}`).toContain(name);
  });

  it("names words that exist (the labels of the panel and of the events)", () => {
    const words = translations.en as Record<string, string>;
    const keys: string[] = [];
    for (const [, spec] of fieldsOf({ kind } as Block)) {
      const ui = spec.type === "list" ? spec.ui && Object.values(spec.ui) : spec.type === "asset" ? undefined : spec.ui && [spec.ui.label, spec.ui.hint, spec.ui.unsetLabel, spec.ui.setLabel, spec.ui.countLabel, spec.ui.advanceHint];
      keys.push(...((ui ?? []) as (string | undefined)[]).filter((key): key is string => !!key));
      if (spec.type === "list") for (const itemSpec of Object.values(spec.item)) if (itemSpec.type === "text" && itemSpec.ui) keys.push(itemSpec.ui.label);
    }
    for (const section of descriptor.panel?.sections ?? []) keys.push(section.title, ...(section.hint ? [section.hint] : []));
    if (descriptor.task) keys.push(...Object.values(descriptor.task.labels));
    for (const key of keys) expect(words[key], `no English word for "${key}"`).toBeTruthy();
  });

  it("has a panel that only shows fields the block has - and shows every field that has a label", () => {
    if (!descriptor.panel) return;
    const shown = descriptor.panel.sections.flatMap((section) => section.fields);
    for (const name of shown) expect(Object.keys(descriptor.fields), `the panel shows ${name}`).toContain(name);
    for (const [name, spec] of Object.entries(descriptor.fields as Record<string, FieldSpec>)) {
      const labelled = spec.type !== "asset" && spec.ui !== undefined;
      if (labelled) expect(shown, `${name} has a label but is not in the panel`).toContain(name);
    }
  });

  it("is put somewhere on the slide that exists, and its events (if it has a task) are named", () => {
    const box = descriptor.placement.box;
    for (const value of [box.x, box.y, box.width, box.height]) expect(value).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(100);
    expect(box.y + box.height).toBeLessThanOrEqual(100);
    if (descriptor.task) for (const name of Object.values(descriptor.task.cliNames)) expect(name.trim()).not.toBe("");
  });
});

describe.each(KINDS)("a new %s", (kind) => {
  it("is made from its defaults and is valid by the schema", () => {
    const { block, descriptor } = moduleWith(kind, false);
    expect(block.kind).toBe(kind);
    expect(Object.keys(block.position)).toEqual(expect.arrayContaining(["x", "y", "width", "height"]));
    expect(schemaProblems(block, descriptor.schemaDefinition)).toEqual([]);
  });
});

describe.each(KINDS)("%s with every field filled", (kind) => {
  it("is valid by the schema", () => {
    const { block, descriptor } = moduleWith(kind, true);
    expect(schemaProblems(block, descriptor.schemaDefinition)).toEqual([]);
  });

  it("says what it is (`weft inspect`) and what is wrong with it (`weft validate`)", () => {
    const { block, content, descriptor } = moduleWith(kind, true);
    if (descriptor.summary) expect(descriptor.summary(block as never).trim()).not.toBe("");
    for (const problem of descriptor.validate?.(block as never, content) ?? []) {
      expect(["error", "warning", "info"]).toContain(problem.level);
      expect(problem.code).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(problem.message.trim()).not.toBe("");
    }
    // The whole file, as `weft validate` reads it: the block raises no error.
    const findings = validate({ path: "test.weft", json: { formatVersion: CURRENT_FORMAT_VERSION, content }, content, files: new Set(), archive: false });
    const own = findings.filter((finding) => finding.severity === "error" && JSON.stringify(finding).includes(block.id));
    expect(own).toEqual([]);
  });

  it("is a task block exactly when its descriptor has a task, and then has the events of a quiz in the graph", () => {
    const { block, content, pageId } = moduleWith(kind, true);
    const descriptor = descriptorOf(kind) as BlockDescriptor;
    expect(isTaskBlock(block)).toBe(!!descriptor.task);
    const graph = buildEventGraph(content.pages[pageId], null);
    const ids = new Set(graph.events.map((event) => event.id));
    const events = [quizFillNodeId(block.id), quizSubmitNodeId(block.id), quizSubmitNodeId(block.id, "richtig"), quizSubmitNodeId(block.id, "falsch")];
    for (const id of events) expect(ids.has(id), id).toBe(!!descriptor.task);
  });

  it("can be in a layout exactly when it is not page-only", () => {
    const { block, content, descriptor } = moduleWith(kind, true);
    expect(isPageOnlyKind(kind)).toBe(descriptor.placement.pageOnly);
    const layoutId = Object.keys(content.layouts)[0];
    setCurrentModule(content);
    try {
      const pasted = pasteBlockInto({ kind: "layout", layoutId }, block);
      expect(pasted === null).toBe(descriptor.placement.pageOnly);
      // (And on a slide exactly when it is not layout-only.)
      expect(pasteBlockInto({ kind: "page", pageId: Object.keys(content.pages)[0] }, block) === null).toBe(!!descriptor.placement.layoutOnly);
    } finally {
      setCurrentModule(null);
    }
  });

  it("uses exactly the files its fields say (the files of the archive that are kept)", () => {
    const { block, content } = moduleWith(kind, true);
    const wanted = new Set<string>();
    for (const [name, spec] of fieldsOf(block)) {
      if (spec.type === "asset") wanted.add((block as unknown as Fields)[name] as string);
      if (spec.type === "list") for (const item of (block as unknown as Record<string, Fields[]>)[name]) for (const [itemName, itemSpec] of Object.entries(spec.item)) if (itemSpec.type === "asset") wanted.add(item[itemName] as string);
    }
    const used = new Set(usedAssetIds(content));
    for (const id of wanted) expect(used.has(id), id).toBe(true);
    // (And nothing the block does not use.)
    if (wanted.size === 0) for (const id of ["asset-1", "asset-2"]) expect(used.has(id), id).toBe(false);
  });

  it("is found by the clipboard where it shows words, and by the variable placeholders where the player puts values in", () => {
    const { block } = moduleWith(kind, true);
    const text = clipboardEntryPlainText({ kind: "block", block } as never);
    // (A formatted text is in the clipboard as its words: "Beispiel text" is what its HTML says.)
    for (const wording of shownWordings(block).filter((wording) => hasWords(wording.own))) expect(text, wording.own).toContain(wording.html ? wording.own.replace(/<[^>]*>/g, "") : wording.own);
    const sources = placeholderSources(block);
    const withValues = variableWordings(block);
    for (const wording of withValues.filter((wording) => hasWords(wording.own))) expect(sources, wording.own).toContain(wording.html ? wording.own : escapeText(wording.own));
    // (Every text the descriptor says has values put in, or is shown, is among them - the two lists above would agree on nothing as well.)
    const own = block as unknown as Record<string, unknown>;
    const flagged = (flag: "variables" | "shown") => fieldsOf(block).filter(([, spec]) => (spec.type === "text" || spec.type === "html") && spec[flag]).map(([name]) => own[name]).filter(hasWords);
    for (const words of flagged("variables")) expect(withValues.map((wording) => wording.own), `${words}`).toContain(words);
    for (const words of flagged("shown")) expect(shownWordings(block).map((wording) => wording.own), `${words}`).toContain(words);
    // (What the player puts nothing in for is not looked at.)
    expect(sources.length).toBe(withValues.reduce((count, wording) => count + (wording.own ? 1 : 0) + wording.translated.length, 0));
    // (Every text that has placeholders is a text that is shown.)
    expect(shownWordings(block).length).toBeGreaterThanOrEqual(withValues.length);
  });
});

/** The texts of a block that have wording of their own in each language: name and the way to read and write it. */
function wordings(block: Block) {
  const own = block as unknown as Record<string, unknown>;
  const texts = fieldsOf(block)
    .filter(([, spec]) => (spec.type === "text" || spec.type === "html") && spec.translatable)
    .map(([name, spec]) => ({
      what: name,
      // (A formatted text is HTML already; a plain one is escaped when it is exported.)
      html: spec.type === "html",
      own: own[name] as string,
      read: (language: string) => fieldWording(block, name, language, DE),
      patch: (language: string, text: string) => fieldWordingPatch(block, name, language, DE, text),
    }));
  const items = listFieldsOf(block).flatMap(([listName, spec]: [string, ListField]) => {
    const textEntry = Object.entries(spec.item).find(([, itemSpec]) => (itemSpec.type === "text" || itemSpec.type === "html") && itemSpec.translatable);
    if (!textEntry) return [];
    const textName = textEntry[0];
    return (own[listName] as ({ id: string } & Fields)[]).map((item) => ({
      what: `${listName}[${item.id}]`,
      html: textEntry[1].type === "html",
      own: item[textName] as string,
      read: (language: string) => itemWording(block, listName, item.id, language, DE),
      patch: (language: string, text: string) => itemWordingPatch(block, listName, item.id, language, DE, text),
    }));
  });
  return [...texts, ...items];
}

describe.each(KINDS)("the words of %s in other languages", (kind) => {
  it("read as the block's own words in the default language, and are missing in the other until they are written", () => {
    const { block } = moduleWith(kind, true);
    const all = wordings(block);
    for (const wording of all) {
      expect(wording.read(DE), wording.what).toBe(wording.own);
      expect(wording.read(EN), wording.what).toBe(wording.own);
    }
    expect(isTranslated(block as never, DE, DE)).toBe(true);
    expect(isTranslated(block as never, EN, DE)).toBe(all.length === 0);
  });

  it("are written into the block's translations for another language - and into the block itself for the default one", () => {
    const { block, content, pageId, blockId } = moduleWith(kind, true);
    const all = wordings(block);
    for (const wording of all) {
      Object.assign(blockIn(content, pageId, blockId), wording.patch(EN, `EN ${wording.what}`));
    }
    const written = blockIn(content, pageId, blockId) as Block;
    for (const wording of wordings(written)) {
      expect(wording.read(EN), wording.what).toBe(`EN ${wording.what}`);
      expect(wording.read(DE), wording.what).toBe(wording.own);
    }
    expect(isTranslated(written as never, EN, DE)).toBe(true);
    // The default language: the block's own field changes, not a translation.
    for (const wording of wordings(written)) Object.assign(written, wording.patch(DE, `DE ${wording.what}`));
    for (const wording of wordings(written)) expect(wording.own, wording.what).toBe(`DE ${wording.what}`);
  });

  it("swap places with the new default language and back (the texts of each language are what they were)", () => {
    const { block, content, pageId, blockId } = moduleWith(kind, true);
    for (const wording of wordings(block)) Object.assign(blockIn(content, pageId, blockId), wording.patch(EN, `EN ${wording.what}`));
    const read = () => wordings(blockIn(content, pageId, blockId) as Block).map((wording) => [wording.what, wording.own, wording.read(EN)]);
    const before = read();
    rotateDefaultLanguage(content, DE, EN);
    // (EN is the default now: its words are the block's own.)
    const rotated = wordings(blockIn(content, pageId, blockId) as Block);
    for (const wording of rotated) expect(wording.own, wording.what).toBe(`EN ${wording.what}`);
    rotateDefaultLanguage(content, EN, DE);
    expect(read()).toEqual(before);
  });

  it("are left alone when the block has none (no translations are made for a block without words)", () => {
    const { block, content, pageId, blockId } = moduleWith(kind, true);
    if (wordings(block).length > 0) return;
    rotateDefaultLanguage(content, DE, EN);
    expect((blockIn(content, pageId, blockId) as { translations?: unknown }).translations).toBeUndefined();
  });
});

describe.each(KINDS)("the texts of %s in `weft text export` and `weft text import`", (kind) => {
  it("are exported with a key each, and what comes back in is written where it belongs", () => {
    const { block, content, pageId, blockId } = moduleWith(kind, true);
    const own = wordings(block);
    const file = exportTexts(content, { file: "test.weft", to: [EN] });
    const mine = file.items.filter((item) => item.key.startsWith(`${block.id}#`));

    // Every text that has words is in the list, once - and the list has nothing else of this block.
    // (The label of a revealer's button is an object field: the texts of the descriptor are not all of its texts, and it is exported by hand.)
    const byHand = kind === "revealer" ? [`${block.id}#button`] : [];
    const expected = [
      ...byHand,
      ...exportedTexts(block).filter((text) => hasWords(text.value)).map((text) => `${block.id}#${text.part}`),
      ...exportedItemTexts(block).filter((text) => hasWords(text.value)).map((text) => `${block.id}#${text.part}:${text.itemId}`),
    ];
    expect(mine.map((item) => item.key).sort()).toEqual(expected.sort());
    expect(collectTexts(content).filter((entry) => entry.block.id === block.id).length).toBe(expected.length);

    // (The label of a revealer's button is exported as a paragraph: its translation is one too.)
    for (const item of mine) item.translations[EN] = item.key.endsWith("#button") ? item.source.replace("<p>", "<p>EN ") : `EN ${item.source}`;
    const report = importTexts(content, file);
    expect(report.problems).toEqual([]);
    expect(report.applied).toBe(mine.length);

    const imported = blockIn(content, pageId, blockId) as Block;
    for (const wording of wordings(imported)) {
      if (!hasWords(wording.own)) continue;
      expect(wording.read(EN), wording.what).toBe(`EN ${"html" in wording && wording.html ? wording.own : escapeText(wording.own)}`);
      expect(wording.read(DE), wording.what).toBe(wording.own);
    }
    expect(isTranslated(imported as never, EN, DE)).toBe(true);
    // (A second export finds them translated: nothing is missing.)
    // (And the same texts again are not written again: what a translation has is compared in the form it was exported in.)
    expect(importTexts(content, file).applied).toBe(0);
    const again = exportTexts(content, { file: "test.weft", to: [EN], onlyMissing: true });
    expect(again.items.filter((item) => item.key.startsWith(`${block.id}#`))).toEqual([]);
    expect(own.length).toBeGreaterThanOrEqual(0);
  });
});

describe("what is known about each kind", () => {
  // The stations follow the descriptor; whether the descriptor says the right thing is for somebody to know. This is what is known - a new kind has to
  // be added here, and a changed answer is a change somebody means.
  const KNOWN: Record<string, { pageOnly: boolean; task: boolean; translatable: string[]; lists: string[] }> = {
    solution: { pageOnly: true, task: true, translatable: ["solution", "placeholder"], lists: [] },
    checker: { pageOnly: true, task: true, translatable: ["text"], lists: [] },
    gallery: { pageOnly: true, task: false, translatable: [], lists: ["items"] },
    iframe: { pageOnly: false, task: false, translatable: [], lists: [] },
    link: { pageOnly: false, task: false, translatable: ["text"], lists: [] },
    button: { pageOnly: false, task: false, translatable: ["text"], lists: [] },
    progress: { pageOnly: false, task: false, translatable: [], lists: [] },
    language: { pageOnly: false, task: false, translatable: [], lists: [] },
    text: { pageOnly: false, task: false, translatable: ["html"], lists: [] },
    list: { pageOnly: false, task: false, translatable: [], lists: ["items"] },
    cloze: { pageOnly: true, task: true, translatable: ["html"], lists: [] },
    matching: { pageOnly: true, task: true, translatable: [], lists: ["sources", "targets"] },
    sort: { pageOnly: true, task: true, translatable: ["endLabel", "startLabel"], lists: ["items"] },
    placeholder: { pageOnly: false, task: false, translatable: [], lists: [] },
    shape: { pageOnly: false, task: false, translatable: [], lists: [] },
    arrow: { pageOnly: false, task: false, translatable: [], lists: [] },
    code: { pageOnly: false, task: false, translatable: [], lists: [] },
    tex: { pageOnly: false, task: false, translatable: [], lists: [] },
    script: { pageOnly: true, task: false, translatable: [], lists: [] },
    image: { pageOnly: false, task: false, translatable: [], lists: [] },
    video: { pageOnly: false, task: false, translatable: [], lists: [] },
    audio: { pageOnly: false, task: false, translatable: [], lists: [] },
    files: { pageOnly: false, task: false, translatable: [], lists: [] },
    revealer: { pageOnly: false, task: false, translatable: ["body", "imageAlt", "title"], lists: [] },
    quiz: { pageOnly: true, task: true, translatable: ["explanation", "questionHtml"], lists: ["options"] },
  };

  it("has an entry for every kind that describes itself - and for no other", () => {
    expect(Object.keys(KNOWN).sort()).toEqual([...KINDS].sort());
  });

  it.each(KINDS)("%s: where it can be, whether it has the events of a quiz, which of its texts have words in each language", (kind) => {
    const descriptor = descriptorOf(kind) as BlockDescriptor;
    const known = KNOWN[kind];
    expect(descriptor.placement.pageOnly).toBe(known.pageOnly);
    expect(!!descriptor.task).toBe(known.task);
    const fields = Object.entries(descriptor.fields as Record<string, FieldSpec>);
    expect(fields.filter(([, spec]) => (spec.type === "text" || spec.type === "html") && spec.translatable).map(([name]) => name).sort()).toEqual([...known.translatable].sort());
    expect(fields.filter(([, spec]) => spec.type === "list").map(([name]) => name).sort()).toEqual([...known.lists].sort());
  });
});

describe("what `weft validate` says about a block that is wrong", () => {
  // (What is wrong is the author's to know: each descriptor that has a check is shown a block that fails it.)
  const cases: [string, (block: Fields) => void, string, "error" | "warning" | "info"][] = [
    ["solution", (block) => (block.solution = ""), "solution-empty", "warning"],
    ["solution", (block) => (block.attempts = 0), "solution-attempts", "error"],
    ["gallery", (block) => (block.items = []), "gallery-empty", "warning"],
    ["gallery", (block) => ((block.items as Fields[])[0].assetId = null), "gallery-no-image", "warning"],
    ["gallery", (block) => ((block.items as Fields[])[0].assetId = "gibt-es-nicht"), "asset-missing", "error"],
    ["gallery", (block) => ((block.items as Fields[])[0].caption = ""), "image-no-alt", "info"],
    ["image", (block) => (block.assetId = null), "media-empty", "warning"],
    ["image", (block) => (block.assetId = "gibt-es-nicht"), "asset-missing", "error"],
    ["image", (block) => (block.alt = " "), "image-no-alt", "info"],
    ["video", (block) => (block.assetId = null), "media-empty", "warning"],
    ["video", (block) => (block.assetId = "gibt-es-nicht"), "asset-missing", "error"],
    ["audio", (block) => (block.assetId = null), "media-empty", "warning"],
    ["audio", (block) => (block.assetId = "gibt-es-nicht"), "asset-missing", "error"],
    ["link", (block) => (block.url = "https://"), "link-no-target", "warning"],
    ["link", (block) => (block.url = "javascript:alert(1)"), "link-url-invalid", "error"],
    ["progress", (block) => (block.variable = "gibt-es-nicht"), "progress-variable-unknown", "warning"],
    ["button", (block) => ((block.action = "goto"), (block.targetPageId = undefined)), "button-target-empty", "warning"],
    ["button", (block) => ((block.action = "goto"), (block.targetPageId = "gibt-es-nicht")), "button-target-missing", "error"],
    ["button", (block) => ((block.text = ""), delete block.html), "button-no-text", "info"],
  ];
  it.each(cases)("%s: %#", (kind, spoil, code, level) => {
    const { block, content, descriptor } = moduleWith(kind, true);
    expect(descriptor.validate?.(block as never, content).map((problem) => problem.code) ?? []).not.toContain(code);
    spoil(block as unknown as Fields);
    const found = (descriptor.validate?.(block as never, content) ?? []).find((problem) => problem.code === code);
    expect(found, `no "${code}"`).toBeDefined();
    expect(found?.level).toBe(level);
  });
});

describe("a field of every type", () => {
  // The field types the stations are told about (blocks/types.ts): a type that is new has to be in a descriptor that is tested above, or it is
  // not tested at all.
  const TYPES = ["text", "html", "choice", "number", "bool", "int", "effects", "effectsMap", "ids", "pairs", "asset", "list"];

  it("is in at least one descriptor, so that every station has been run with it", () => {
    const seen = new Set<string>();
    for (const kind of KINDS) {
      for (const [, spec] of fieldsOf({ kind } as Block)) {
        seen.add(spec.type);
        if (spec.type === "list") for (const itemSpec of Object.values(spec.item)) seen.add(itemSpec.type);
      }
    }
    for (const type of TYPES) expect([...seen], `no descriptor has a field of the type "${type}"`).toContain(type);
  });

  it("is a type this list knows (a new one is added to the list above - and to the stations)", () => {
    for (const kind of KINDS) for (const [name, spec] of fieldsOf({ kind } as Block)) expect(TYPES, `${kind}.${name}`).toContain(spec.type);
  });
});

/** Keeps the type of `WeftModule` in use for the helper above. */
export type { WeftModule };

describe("the label of a button, which is formatted text", () => {
  const html = "<p>Los <b>geht's</b> &amp; weiter</p>";
  const fieldsOfLabel = () => {
    const { block, content, pageId, blockId } = moduleWith("button", true);
    // (The label was formatted: its plain words are what the formatting says, without it.)
    Object.assign(content.pages[pageId].blocks[blockId], fieldHtmlPatch(block, "text", DE, DE, html));
    return { content, pageId, blockId, get block() { return content.pages[pageId].blocks[blockId] as Block; } };
  };

  it("keeps the formatting in `html` and the words without it in `text`, in the block itself for the default language", () => {
    const made = fieldsOfLabel();
    const own = made.block as unknown as { html: string; text: string };
    expect(own.html).toBe(html);
    expect(own.text).toBe("Los geht's & weiter");
    expect(fieldHtml(made.block, "text", DE, DE)).toBe(html);
    expect(fieldWording(made.block, "text", DE, DE)).toBe("Los geht's & weiter");
  });

  it("is a label that was never formatted when it has only plain words (escaped)", () => {
    const { block } = moduleWith("button", true);
    expect(fieldHtml(block, "text", DE, DE)).toBe("Beispiel text");
    (block as unknown as { text: string }).text = "a < b";
    expect(fieldHtml(block, "text", DE, DE)).toBe("a &lt; b");
  });

  it("has its own formatting in another language - and the plain words of a translation when it has none", () => {
    const made = fieldsOfLabel();
    Object.assign(made.content.pages[made.pageId].blocks[made.blockId], fieldHtmlPatch(made.block, "text", EN, DE, "<p><i>Go</i></p>"));
    expect(fieldHtml(made.block, "text", EN, DE)).toBe("<p><i>Go</i></p>");
    expect(fieldWording(made.block, "text", EN, DE)).toBe("Go");
    expect(fieldHtml(made.block, "text", DE, DE)).toBe(html);
    // Only plain words in the translation (as an import of plain texts makes them): escaped.
    const plain = moduleWith("button", true);
    Object.assign(plain.content.pages[plain.pageId].blocks[plain.blockId], fieldWordingPatch(plain.block, "text", EN, DE, "a < b"));
    expect(fieldHtml(plain.block, "text", EN, DE)).toBe("a &lt; b");
  });

  it("swaps with the new default language and back with its formatting", () => {
    const made = fieldsOfLabel();
    Object.assign(made.content.pages[made.pageId].blocks[made.blockId], fieldHtmlPatch(made.block, "text", EN, DE, "<p><i>Go</i></p>"));
    rotateDefaultLanguage(made.content, DE, EN);
    const rotated = made.block as unknown as { html?: string; text: string };
    expect(rotated.html).toBe("<p><i>Go</i></p>");
    expect(rotated.text).toBe("Go");
    rotateDefaultLanguage(made.content, EN, DE);
    const back = made.block as unknown as { html?: string; text: string };
    expect(back.html).toBe(html);
    expect(back.text).toBe("Los geht's & weiter");
    // (And the other language has its words again, formatted.)
    expect(fieldHtml(made.block, "text", EN, DE)).toBe("<p><i>Go</i></p>");
  });

  it("is exported as its HTML, and what comes back with formatting is written with it", () => {
    const made = fieldsOfLabel();
    const file = exportTexts(made.content, { file: "test.weft", to: [EN] });
    const item = file.items.find((entry) => entry.key === `${made.blockId}#label`);
    expect(item?.source).toBe(html);
    expect(item?.context).toContain("Beschriftung");
    item!.translations[EN] = "<p>Let's <b>go</b></p>";
    expect(importTexts(made.content, file).problems).toEqual([]);
    expect(fieldHtml(made.block, "text", EN, DE)).toBe("<p>Let's <b>go</b></p>");
    expect(fieldWording(made.block, "text", EN, DE)).toBe("Let's go");
    expect(isTranslated(made.block as never, EN, DE)).toBe(true);
  });

  it("is looked at for placeholders as HTML, and in the clipboard as its words", () => {
    const made = fieldsOfLabel();
    expect(placeholderSources(made.block)).toContain(html);
    expect(clipboardEntryPlainText({ kind: "block", block: made.block } as never)).toBe("Los geht's & weiter");
  });
});

describe("the words of a text, which are only HTML (a field of the type html)", () => {
  const html = "<p>Los <b>geht's</b> &amp; weiter</p>";
  const made = () => {
    const m = moduleWith("text", true);
    Object.assign(m.content.pages[m.pageId].blocks[m.blockId], fieldHtmlPatch(m.block, "html", DE, DE, html));
    return { ...m, get now() { return m.content.pages[m.pageId].blocks[m.blockId] as Block; } };
  };

  it("keeps the formatting in the field itself - no plain words beside it - and reads it back as it is, not escaped", () => {
    const m = made();
    expect((m.now as unknown as { html: string; text?: string }).html).toBe(html);
    expect("text" in m.now).toBe(false);
    expect(fieldHtml(m.now, "html", DE, DE)).toBe(html);
    expect(fieldWording(m.now, "html", DE, DE)).toBe(html);
  });

  it("has its own formatting in another language, which is `html` in the translation and nothing else", () => {
    const m = made();
    Object.assign(m.content.pages[m.pageId].blocks[m.blockId], fieldHtmlPatch(m.now, "html", EN, DE, "<p><i>Go</i></p>"));
    expect((m.now as unknown as { translations: Record<string, unknown> }).translations[EN]).toEqual({ html: "<p><i>Go</i></p>" });
    expect(fieldHtml(m.now, "html", EN, DE)).toBe("<p><i>Go</i></p>");
    expect(fieldWording(m.now, "html", EN, DE)).toBe("<p><i>Go</i></p>");
    expect(fieldHtml(m.now, "html", DE, DE)).toBe(html);
    expect(isTranslated(m.now as never, EN, DE)).toBe(true);
    // The patch of plain wording goes to the same place.
    Object.assign(m.content.pages[m.pageId].blocks[m.blockId], fieldWordingPatch(m.now, "html", EN, DE, "<p>Plain</p>"));
    expect(fieldHtml(m.now, "html", EN, DE)).toBe("<p>Plain</p>");
  });

  it.each(["text", "cloze"])("has its {{variables}} found - in every language - and checked (%s)", (kind) => {
    const m = moduleWith(kind, true);
    const stored = () => m.content.pages[m.pageId].blocks[m.blockId] as Block;
    Object.assign(stored(), { html: "<p>{{punkte}} und {{gibtesnicht}}</p>" }, fieldHtmlPatch(stored(), "html", EN, DE, "<p>{{ punkte }} in English</p>"));
    expect(placeholderSources(stored())).toEqual(["<p>{{punkte}} und {{gibtesnicht}}</p>", "<p>{{ punkte }} in English</p>"]);
    const findings = validate({ path: "test.weft", json: { formatVersion: CURRENT_FORMAT_VERSION, content: m.content }, content: m.content, files: new Set(), archive: false });
    expect(findings.filter((finding) => finding.code === "placeholder-variable").map((finding) => finding.message)).toEqual(expect.arrayContaining([expect.stringContaining("gibtesnicht")]));
  });

  it("swaps with the new default language and back", () => {
    const m = made();
    Object.assign(m.content.pages[m.pageId].blocks[m.blockId], fieldHtmlPatch(m.now, "html", EN, DE, "<p><i>Go</i></p>"));
    rotateDefaultLanguage(m.content, DE, EN);
    expect((m.now as unknown as { html: string }).html).toBe("<p><i>Go</i></p>");
    rotateDefaultLanguage(m.content, EN, DE);
    expect((m.now as unknown as { html: string }).html).toBe(html);
    expect(fieldHtml(m.now, "html", EN, DE)).toBe("<p><i>Go</i></p>");
  });
});

describe("the {{progress}} in the words of a picture of a page", () => {
  it("is the value the page has, however it is spaced - and stays where the value is not known", () => {
    expect(withProgress("<p>{{progress}} und {{ progress }} und {{punkte}}</p>", 40)).toBe("<p>40 und 40 und {{punkte}}</p>");
    expect(withProgress("<p>{{progress}}</p>", null)).toBe("<p>{{progress}}</p>");
    expect(withProgress("<p>{{progress}}</p>", undefined)).toBe("<p>{{progress}}</p>");
  });
});

describe("the points of a list (formatted words of the items, a picture that is only sometimes used)", () => {
  const made = () => moduleWith("list", true);

  it("has its picture kept only while its marker is a picture", () => {
    const m = made();
    const block = m.content.pages[m.pageId].blocks[m.blockId] as unknown as { marker: string; markerAssetId: string };
    expect(block.marker).toBe("image");
    expect(new Set(usedAssetIds(m.content)).has(block.markerAssetId)).toBe(true);
    block.marker = "dot";
    expect(new Set(usedAssetIds(m.content)).has(block.markerAssetId)).toBe(false);
  });

  it("has the {{variables}} of its points found - in every language - and checked", () => {
    const m = made();
    const block = m.content.pages[m.pageId].blocks[m.blockId] as unknown as { items: { id: string; html: string }[]; translations?: Record<string, unknown> };
    block.items[0].html = "<p>{{punkte}} und {{gibtesnicht}}</p>";
    block.translations = { [EN]: { items: { [block.items[0].id]: "<p>{{ punkte }} in English</p>" } } };
    expect(placeholderSources(m.block)).toEqual(expect.arrayContaining(["<p>{{punkte}} und {{gibtesnicht}}</p>", "<p>{{ punkte }} in English</p>"]));
    const findings = validate({ path: "test.weft", json: { formatVersion: CURRENT_FORMAT_VERSION, content: m.content }, content: m.content, files: new Set(), archive: false });
    expect(findings.filter((finding) => finding.code === "placeholder-variable").map((finding) => finding.message)).toEqual(expect.arrayContaining([expect.stringContaining("gibtesnicht")]));
  });

  it("is imported as formatted words, and found translated when the same texts come again", () => {
    const m = made();
    const file = exportTexts(m.content, { file: "test.weft", to: [EN] });
    const mine = file.items.filter((item) => item.key.startsWith(`${m.block.id}#item:`));
    expect(mine.length).toBe(2);
    for (const item of mine) item.translations[EN] = `<p><i>EN</i> ${item.source.replace(/<\/?p>/g, "")}</p>`;
    const first = importTexts(m.content, file);
    expect(first.applied).toBe(mine.length);
    // (The same words again change nothing - the translation that is there is the one that came, formatting and all.)
    const again = importTexts(m.content, file);
    expect(again.unchanged).toBe(mine.length);
    expect(again.applied).toBe(0);
    const stored = (m.content.pages[m.pageId].blocks[m.blockId] as unknown as { translations: Record<string, { items: Record<string, string> }> }).translations[EN].items;
    expect(Object.values(stored)).toEqual(mine.map((item) => item.translations[EN]));
  });

  it("is exported with the formatting of its points, not escaped", () => {
    const m = made();
    const own = (m.content.pages[m.pageId].blocks[m.blockId] as unknown as { items: { id: string; html: string }[] }).items;
    const file = exportTexts(m.content, { file: "test.weft", to: [EN] });
    for (const item of own) expect(file.items.find((entry) => entry.key === `${m.block.id}#item:${item.id}`)?.source).toBe(item.html);
  });
});

describe.each(KINDS)("the changes to variables of %s, which `weft validate` checks", (kind) => {
  it("are found in every list of effects the descriptor has - in an answer map too - when a variable is missing", () => {
    const m = moduleWith(kind, true);
    const lists = fieldsOf(m.block).filter(([, spec]) => spec.type === "effects" || spec.type === "effectsMap");
    if (lists.length === 0) return;
    const block = m.content.pages[m.pageId].blocks[m.blockId] as unknown as Record<string, unknown>;
    let expected = 0;
    for (const [name, spec] of lists) {
      const gone = [{ variableId: "gibtsnicht", op: "add", value: 1 }];
      if (spec.type === "effects") block[name] = gone;
      else block[name] = { eins: gone, zwei: gone };
      expected += spec.type === "effects" ? 1 : 2;
    }
    const findings = validate({ path: "test.weft", json: { formatVersion: CURRENT_FORMAT_VERSION, content: m.content }, content: m.content, files: new Set(), archive: false });
    expect(findings.filter((finding) => finding.code === "effect-variable-missing" && JSON.stringify(finding).includes(m.block.id)).length).toBe(expected);
  });
});

describe("the gap text", () => {
  it("has the blanks of its translations checked: one with fewer is refused, one with as many is taken - with its role in the list", () => {
    const m = moduleWith("cloze", true);
    const file = exportTexts(m.content, { file: "test.weft", to: [EN] });
    const mine = file.items.find((item) => item.key === `${m.block.id}#html`);
    expect(mine).toBeDefined();
    expect(exportedTexts(m.block).map((text) => text.role)).toEqual(["Lückentext"]);
    expect(mine!.source.match(/\[\[/g)?.length).toBe(2);
    mine!.translations[EN] = "<p>Nur [[eine]] Lücke</p>";
    const refused = importTexts(m.content, file);
    expect(refused.skipped).toBe(1);
    expect(refused.applied).toBe(0);
    expect(refused.problems.map((problem) => problem.message).join(" ")).toContain("Lücken");
    mine!.translations[EN] = "<p>Zwei [[one]] und [[two|deux]] Lücken</p>";
    const taken = importTexts(m.content, file);
    expect(taken.applied).toBe(1);
  });

  it("has the changes to variables the player makes: for every right blank, for a particular answer, for everything right, for something wrong", () => {
    const m = moduleWith("cloze", false);
    expect(fieldsOf(m.block).filter(([, spec]) => spec.type === "effects").map(([name]) => name)).toEqual(["onEachCorrect", "onCorrect", "onIncorrect"]);
    expect(fieldsOf(m.block).filter(([, spec]) => spec.type === "effectsMap").map(([name]) => name)).toEqual(["answerEffects"]);
  });

  it("is judged by the editor as the player judges it", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(allowedSlips(3, 1)).toBe(1);
    expect(allowedSlips(2, 1)).toBe(0);
    expect(clozeIsRight("Berlim", ["Berlin"], false, 1)).toBe(true);
    expect(clozeIsRight("berlin", ["Berlin"], true, 0)).toBe(false);
  });
});

describe("the quiz", () => {
  const stored = (m: ReturnType<typeof moduleWith>) => m.content.pages[m.pageId].blocks[m.blockId] as unknown as { options: { id: string; html: string }[]; correctOptionIds: string[]; open?: boolean; translations?: Record<string, Record<string, unknown>> };
  const findings = (m: ReturnType<typeof moduleWith>) => validate({ path: "test.weft", json: { formatVersion: CURRENT_FORMAT_VERSION, content: m.content }, content: m.content, files: new Set(), archive: false });

  it("has the changes to variables it makes: the quiz as a whole, and what each answer does when it is handled right or wrong", () => {
    const m = moduleWith("quiz", false);
    expect(fieldsOf(m.block).filter(([, spec]) => spec.type === "effects").map(([name]) => name)).toEqual(["onCorrect", "onIncorrect"]);
    const options = fieldsOf(m.block).find(([name]) => name === "options")![1] as ListField;
    expect(Object.entries(options.item).filter(([, spec]) => spec.type === "effects").map(([name]) => name)).toEqual(["onRight", "onWrong"]);
  });

  it("has the effects of its answers checked for variables that are not there - one list of each kind for every answer", () => {
    const m = moduleWith("quiz", true);
    const quiz = stored(m);
    for (const option of quiz.options as unknown as Record<string, unknown>[]) {
      option.onRight = [{ variableId: "gibtsnicht", op: "add", value: 1 }];
      option.onWrong = [{ variableId: "gibtsnicht", op: "add", value: 1 }];
    }
    const missing = findings(m).filter((finding) => finding.code === "effect-variable-missing" && JSON.stringify(finding).includes(m.block.id));
    expect(missing.map((finding) => finding.message).filter((message) => message.includes("richtig behandelter Option")).length).toBe(quiz.options.length);
    expect(missing.map((finding) => finding.message).filter((message) => message.includes("falsch behandelter Option")).length).toBe(quiz.options.length);
  });

  it("is exported by the keys it always had - question, option:<id>, explanation - and what comes back is kept where a quiz keeps it", () => {
    const m = moduleWith("quiz", true);
    const file = exportTexts(m.content, { file: "test.weft", to: [EN] });
    const mine = file.items.filter((item) => item.key.startsWith(`${m.block.id}#`));
    const quiz = stored(m);
    expect(mine.map((item) => item.key.split("#")[1]).sort()).toEqual(["explanation", "question", ...quiz.options.map((option) => `option:${option.id}`)].sort());
    for (const item of mine) item.translations[EN] = `EN ${item.source}`;
    expect(importTexts(m.content, file).applied).toBe(mine.length);
    const translation = stored(m).translations![EN] as { questionHtml: string; options: Record<string, string>; explanation: string };
    expect(Object.keys(translation).sort()).toEqual(["explanation", "options", "questionHtml"]);
    expect(translation.questionHtml).toMatch(/^EN <p>/);
    expect(Object.keys(translation.options).sort()).toEqual(quiz.options.map((option) => option.id).sort());
    expect(translation.options[quiz.options[0].id]).toMatch(/^EN <p>/);
    expect(translation.explanation).toMatch(/^EN /);
    // The same texts again change nothing.
    expect(importTexts(m.content, file).unchanged).toBe(mine.length);
  });

  it("keeps the formatted words of its question as `questionHtml` of a translation - read and written", () => {
    const m = moduleWith("quiz", true);
    const quiz = stored(m);
    Object.assign(quiz, fieldHtmlPatch(m.block, "questionHtml", EN, DE, "<p>Is it?</p>"));
    expect(quiz.translations![EN]).toEqual({ questionHtml: "<p>Is it?</p>" });
    expect(fieldHtml(m.block, "questionHtml", EN, DE)).toBe("<p>Is it?</p>");
    expect(fieldHtml(m.block, "questionHtml", DE, DE)).toBe((m.block as unknown as { questionHtml: string }).questionHtml);
    expect(fieldWording(m.block, "questionHtml", EN, DE)).toBe("<p>Is it?</p>");
  });

  it("says in one line what it is (`weft inspect`): the question, how many answers, how many right - or that it is open", () => {
    const m = moduleWith("quiz", true);
    const quiz = stored(m);
    quiz.open = false;
    quiz.single = false;
    quiz.correctOptionIds = [quiz.options[0].id];
    expect(descriptorOf("quiz")!.summary!(m.block as never, { labels: {} })).toMatch(/\[2 Optionen, 1 richtig\]$/);
    quiz.single = true;
    expect(descriptorOf("quiz")!.summary!(m.block as never, { labels: {} })).toMatch(/\[2 Optionen, 1 richtig, genau eine Antwort wählbar\]$/);
    quiz.open = true;
    expect(descriptorOf("quiz")!.summary!(m.block as never, { labels: {} })).toMatch(/\[2 Optionen, offen\]$/);
  });

  it("is found translated only when its question, its explanation and its first answer are", () => {
    const m = moduleWith("quiz", true);
    const quiz = stored(m);
    expect(isTranslated(quiz as never, EN, DE)).toBe(false);
    quiz.translations = { [EN]: { questionHtml: "<p>Q</p>", options: { [quiz.options[0].id]: "<p>A</p>" } } };
    expect(isTranslated(quiz as never, EN, DE)).toBe(false);
    quiz.translations[EN].explanation = "Because";
    expect(isTranslated(quiz as never, EN, DE)).toBe(true);
  });

  it("has the {{variables}} of its question and its answers found - in every language - and checked", () => {
    const m = moduleWith("quiz", true);
    const quiz = stored(m);
    Object.assign(quiz, { questionHtml: "<p>{{punkte}} {{gibtesnicht}}</p>" });
    quiz.options[0].html = "<p>{{punkte}}</p>";
    quiz.translations = { [EN]: { questionHtml: "<p>{{ punkte }} en</p>", options: { [quiz.options[0].id]: "<p>{{punkte}} en</p>" } } };
    expect(placeholderSources(m.block)).toEqual(expect.arrayContaining(["<p>{{punkte}} {{gibtesnicht}}</p>", "<p>{{punkte}}</p>", "<p>{{ punkte }} en</p>", "<p>{{punkte}} en</p>"]));
    expect(findings(m).filter((finding) => finding.code === "placeholder-variable").map((finding) => finding.message)).toEqual(expect.arrayContaining([expect.stringContaining("gibtesnicht")]));
  });

  it("has what is wrong with it said: a right answer that is not there, no right answer, too few answers - and an open question is spared the last two", () => {
    const m = moduleWith("quiz", true);
    const quiz = stored(m);
    quiz.open = false;
    quiz.correctOptionIds = ["gibtsnicht"];
    expect(findings(m).some((finding) => finding.code === "quiz-correct-missing" && finding.severity === "error")).toBe(true);
    quiz.correctOptionIds = [];
    expect(findings(m).some((finding) => finding.code === "quiz-no-correct" && finding.severity === "warning")).toBe(true);
    quiz.options = quiz.options.slice(0, 1);
    expect(findings(m).some((finding) => finding.code === "quiz-few-options" && finding.severity === "info")).toBe(true);
    quiz.open = true;
    const codes = findings(m).map((finding) => finding.code);
    expect(codes).not.toContain("quiz-no-correct");
    expect(codes).not.toContain("quiz-few-options");
  });

  it("says when only one answer can be picked but several are right - and not for one right answer, or an open question", () => {
    const m = moduleWith("quiz", true);
    const quiz = stored(m) as unknown as { single?: boolean; open?: boolean; options: { id: string }[]; correctOptionIds: string[] };
    quiz.open = false;
    quiz.correctOptionIds = quiz.options.map((option) => option.id);
    quiz.single = false;
    expect(findings(m).map((finding) => finding.code)).not.toContain("quiz-single-many-correct");
    quiz.single = true;
    expect(findings(m).some((finding) => finding.code === "quiz-single-many-correct" && finding.severity === "warning")).toBe(true);
    quiz.correctOptionIds = [quiz.options[0].id];
    expect(findings(m).map((finding) => finding.code)).not.toContain("quiz-single-many-correct");
    quiz.correctOptionIds = quiz.options.map((option) => option.id);
    quiz.open = true;
    expect(findings(m).map((finding) => finding.code)).not.toContain("quiz-single-many-correct");
  });
});

describe("the revealer", () => {
  type Stored = { title: string; body: string; imageAssetId: string | null; imageAlt: string; icon: string; windowStyle: string; button: { text: string; action: string; targetPageId?: string } | null };
  const stored = (m: ReturnType<typeof moduleWith>) => m.content.pages[m.pageId].blocks[m.blockId] as unknown as Stored;
  const findings = (m: ReturnType<typeof moduleWith>, extra: Partial<Parameters<typeof validate>[0]> = {}) => validate({ path: "test.weft", json: { formatVersion: CURRENT_FORMAT_VERSION, content: m.content }, content: m.content, files: new Set(), archive: false, ...extra });
  const codes = (m: ReturnType<typeof moduleWith>) => findings(m).filter((finding) => JSON.stringify(finding).includes(m.block.id)).map((finding) => finding.code);

  it("copies the heading and the text of its window - nothing else - and says what the learner is told", () => {
    const m = moduleWith("revealer", true);
    Object.assign(stored(m), { title: "Der Titel", body: "Erste\nZweite Zeile", imageAlt: "Beschreibung" });
    expect(clipboardEntryPlainText({ kind: "block", block: m.block } as never)).toBe("Der Titel\nErste\nZweite Zeile");
  });

  it("is exported with the roles of the texts it has, translated under the keys a revealer keeps them under", () => {
    const m = moduleWith("revealer", true);
    expect(exportedTexts(m.block).map((text) => [text.part, text.role, text.key])).toEqual([
      ["title", "Überschrift", "title"],
      ["body", "Text des Fensters", "body"],
      ["alt", "Bildbeschreibung", "alt"],
    ]);
    const file = exportTexts(m.content, { file: "test.weft", to: [EN] });
    for (const item of file.items.filter((entry) => entry.key.startsWith(`${m.block.id}#`))) item.translations[EN] = `EN ${item.source}`;
    importTexts(m.content, file);
    const translation = (m.content.pages[m.pageId].blocks[m.blockId] as unknown as { translations: Record<string, Record<string, string>> }).translations[EN];
    expect(Object.keys(translation).sort()).toEqual(["alt", "body", "text", "title"]);
    expect(translation.text).toMatch(/^EN /);
  });

  it("has its picture counted as a file the module uses, whatever else it has", () => {
    const m = moduleWith("revealer", true);
    expect(stored(m).imageAssetId).toBe("asset-1");
    expect(new Set(usedAssetIds(m.content)).has("asset-1")).toBe(true);
    stored(m).imageAssetId = null;
    expect(new Set(usedAssetIds(m.content)).has("asset-1")).toBe(false);
  });

  it("has an icon and a window style that are one of a few words", () => {
    const m = moduleWith("revealer", false);
    const fields = Object.fromEntries(fieldsOf(m.block));
    expect(fields.icon).toEqual({ type: "choice", options: ["info", "warning", "exclamation", "question"] });
    expect(fields.windowStyle).toEqual({ type: "choice", options: ["dark", "light"] });
  });

  it("says in one line what it is (`weft inspect`): the icon, its heading, what its window holds", () => {
    const m = moduleWith("revealer", true);
    Object.assign(stored(m), { icon: "warning", title: "Achtung", body: "Text", button: { text: "Los", action: "event" } });
    expect(descriptorOf("revealer")!.summary!(m.block as never, { labels: {} })).toBe("warning: „Achtung\" + Text + Bild + Button „Los\"");
    Object.assign(stored(m), { body: "", imageAssetId: null, button: null });
    expect(descriptorOf("revealer")!.summary!(m.block as never, { labels: {} })).toBe("warning: „Achtung\"");
  });

  it("has what is wrong with it said: a picture that is not there (or has no description), no heading, a button that leads nowhere", () => {
    const m = moduleWith("revealer", true);
    stored(m).imageAssetId = "gibtsnicht";
    expect(codes(m)).toContain("asset-missing");
    stored(m).imageAssetId = "asset-1";
    stored(m).imageAlt = "";
    expect(codes(m)).toContain("image-no-alt");
    stored(m).imageAlt = "Beschreibung";
    expect(codes(m)).not.toContain("image-no-alt");
    stored(m).title = "  ";
    expect(codes(m)).toContain("revealer-no-title");
    stored(m).button = { text: "Los", action: "goto" };
    expect(codes(m)).toContain("button-target-empty");
    stored(m).button = { text: "Los", action: "goto", targetPageId: "gibtsnicht" };
    const missing = findings(m).find((finding) => finding.code === "button-target-missing");
    expect(missing?.severity).toBe("error");
    stored(m).button = { text: "Los", action: "goto", targetPageId: m.pageId };
    expect(codes(m)).not.toContain("button-target-missing");
    expect(codes(m)).not.toContain("button-target-empty");
  });

  it.each(["revealer", "gallery", "list"])("has a file it uses that is in the list of the module's files but not in the archive reported (%s)", (kind) => {
    const m = moduleWith(kind, true);
    const asset = m.content.assets[0];
    const inArchive = new Set(m.content.assets.map((a) => `assets/${a.id}_${a.fileName}`));
    expect(findings(m, { archive: true, files: inArchive }).some((finding) => finding.code === "asset-file-missing")).toBe(false);
    inArchive.delete(`assets/${asset.id}_${asset.fileName}`);
    const lost = findings(m, { archive: true, files: inArchive }).filter((finding) => finding.code === "asset-file-missing");
    expect(lost.length).toBeGreaterThan(0);
    expect(lost[0].severity).toBe("error");
    // (A module that is not an archive has no files to look in.)
    expect(findings(m, { archive: false, files: new Set() }).some((finding) => finding.code === "asset-file-missing")).toBe(false);
  });
});

describe("the matching", () => {
  type Card = { id: string; kind: string; text: string; assetId?: string | null; x: number; y: number };
  type Stored = { sources: Card[]; targets: Card[]; pairs: Record<string, string>; shuffle?: boolean; translations?: Record<string, Record<string, unknown>> };
  const stored = (m: ReturnType<typeof moduleWith>) => m.content.pages[m.pageId].blocks[m.blockId] as unknown as Stored;
  const findings = (m: ReturnType<typeof moduleWith>) => validate({ path: "test.weft", json: { formatVersion: CURRENT_FORMAT_VERSION, content: m.content }, content: m.content, files: new Set(), archive: false });
  const codes = (m: ReturnType<typeof moduleWith>) => findings(m).filter((finding) => JSON.stringify(finding).includes(m.block.id)).map((finding) => finding.code);

  it("has its two lists of cards, the right pairs and four lists of changes to variables - the effects of the whole and of every card", () => {
    const m = moduleWith("matching", false);
    expect(fieldsOf(m.block).filter(([, spec]) => spec.type === "list").map(([name]) => name)).toEqual(["sources", "targets"]);
    expect(fieldsOf(m.block).filter(([, spec]) => spec.type === "effects").map(([name]) => name)).toEqual(["onEachCorrect", "onEachWrong", "onCorrect", "onIncorrect"]);
    expect(fieldsOf(m.block).find(([name]) => name === "pairs")![1]).toEqual({ type: "pairs", from: "sources", to: "targets" });
  });

  it("is made with the cards the author finds in a new one: two columns, three objects (one a decoy) and two targets", () => {
    const m = moduleWith("matching", false);
    const block = stored(m);
    expect(block.sources.length).toBe(3);
    expect(block.targets.length).toBe(2);
    expect(Object.keys(block.pairs).length).toBe(2);
    expect(Object.entries(block.pairs).every(([s, t]) => block.sources.some((c) => c.id === s) && block.targets.some((c) => c.id === t))).toBe(true);
    expect(block.sources.every((card) => card.x === 3)).toBe(true);
    expect(block.targets.every((card) => card.x === 55)).toBe(true);
  });

  it("has the picture of a card kept only while the card is a picture", () => {
    const m = moduleWith("matching", true);
    const block = stored(m);
    expect(block.sources[0].kind).toBe("image");
    expect(new Set(usedAssetIds(m.content)).has("asset-1")).toBe(true);
    for (const card of [...block.sources, ...block.targets]) card.kind = "text";
    expect(new Set(usedAssetIds(m.content)).has("asset-1")).toBe(false);
    block.targets[1].kind = "image";
    expect(new Set(usedAssetIds(m.content)).has("asset-1")).toBe(true);
  });

  it("is exported with the numbers of its objects and its targets - a picture's words as its description - and exported plain, escaped", () => {
    const m = moduleWith("matching", true);
    const block = stored(m);
    block.sources[0].text = "A & B";
    block.sources[1].kind = "text";
    const file = exportTexts(m.content, { file: "test.weft", to: [EN] });
    const mine = file.items.filter((item) => item.key.startsWith(`${m.block.id}#item:`));
    expect(mine.map((item) => item.source)).toContain("A &amp; B");
    expect(exportedItemTexts(m.block).map((text) => text.role)).toEqual(["Objekt 1 (Bildbeschreibung)", "Objekt 2", "Ziel 1 (Bildbeschreibung)", "Ziel 2 (Bildbeschreibung)"]);
    for (const item of mine) item.translations[EN] = item.source.replace("A &amp; B", "C &amp; D");
    importTexts(m.content, file);
    const translated = (stored(m).translations![EN] as { items: Record<string, string> }).items;
    expect(translated[block.sources[0].id]).toBe("C & D");
  });

  it("has the words of its cards found by the clipboard, and its text checked for placeholders (the words of a picture card too)", () => {
    const m = moduleWith("matching", true);
    const block = stored(m);
    block.sources[1].text = "{{gibtesnicht}} da";
    expect(clipboardEntryPlainText({ kind: "block", block: m.block } as never)).toContain("{{gibtesnicht}} da");
    expect(findings(m).filter((finding) => finding.code === "placeholder-variable").map((finding) => finding.message)).toEqual(expect.arrayContaining([expect.stringContaining("gibtesnicht")]));
  });

  it("says in one line what it is (`weft inspect`): the cards of both lists, how many pairs and decoys, and its flags", () => {
    const m = moduleWith("matching", false);
    const block = stored(m);
    block.shuffle = true;
    (block as unknown as { required: boolean }).required = true;
    const line = descriptorOf("matching")!.summary!(m.block as never, { labels: {} });
    expect(line).toMatch(/^Objekte: .* → Ziele: .* \(2 richtig, 1 Ablenker\) \[zufällig\] \[Pflicht\]$/);
    block.sources[0].kind = "image";
    block.sources[0].text = "";
    expect(descriptorOf("matching")!.summary!(m.block as never, { labels: {} })).toContain("[Bild: ohne Beschreibung]");
  });

  it("has what is wrong with it said: no cards, a pair that leads nowhere, nothing paired, a picture card without a picture or file or description", () => {
    const m = moduleWith("matching", false);
    const block = stored(m);
    block.pairs = { gibtsnicht: block.targets[0].id };
    expect(findings(m).find((finding) => finding.code === "matching-pair-broken")?.severity).toBe("error");
    block.pairs = {};
    expect(codes(m)).toContain("matching-no-pairs");
    block.sources[0].kind = "image";
    block.sources[0].assetId = null;
    expect(codes(m)).toContain("matching-no-image");
    block.sources[0].assetId = "gibtsnicht";
    expect(findings(m).find((finding) => finding.code === "asset-missing")?.severity).toBe("error");
    block.sources[0].assetId = "asset-1";
    block.sources[0].text = " ";
    expect(codes(m)).toContain("image-no-alt");
    block.sources = [];
    expect(codes(m)).toContain("matching-empty");
  });

  it("is found translated only when the first card of each list is - and its cards swap with the new default language", () => {
    const m = moduleWith("matching", false);
    const block = stored(m);
    expect(isTranslated(block as never, EN, DE)).toBe(false);
    block.translations = { [EN]: { items: { [block.sources[0].id]: "Dog" } } };
    expect(isTranslated(block as never, EN, DE)).toBe(false);
    (block.translations[EN].items as Record<string, string>)[block.targets[0].id] = "Animal";
    expect(isTranslated(block as never, EN, DE)).toBe(true);
    const own = block.sources[0].text;
    rotateDefaultLanguage(m.content, DE, EN);
    expect(block.sources[0].text).toBe("Dog");
    expect(block.targets[0].text).toBe("Animal");
    expect((block.translations![DE].items as Record<string, string>)[block.sources[0].id]).toBe(own);
  });
});

describe("the sorting puzzle", () => {
  type Item = { id: string; kind: string; text: string; assetId?: string | null };
  type Stored = { items: Item[]; startLabel?: string; endLabel?: string; orientation: string; required?: boolean; translations?: Record<string, Record<string, unknown>> };
  const stored = (m: ReturnType<typeof moduleWith>) => m.content.pages[m.pageId].blocks[m.blockId] as unknown as Stored;
  const findings = (m: ReturnType<typeof moduleWith>) => validate({ path: "test.weft", json: { formatVersion: CURRENT_FORMAT_VERSION, content: m.content }, content: m.content, files: new Set(), archive: false });
  const codes = (m: ReturnType<typeof moduleWith>) => findings(m).filter((finding) => JSON.stringify(finding).includes(m.block.id)).map((finding) => finding.code);

  it("has its objects in their right order as a list, a line, two words for its ends and four lists of changes to variables", () => {
    const m = moduleWith("sort", false);
    expect(fieldsOf(m.block).filter(([, spec]) => spec.type === "list").map(([name]) => name)).toEqual(["items"]);
    expect(fieldsOf(m.block).filter(([, spec]) => spec.type === "effects").map(([name]) => name)).toEqual(["onEachError", "onSubmit", "onCorrect", "onIncorrect"]);
    expect(fieldsOf(m.block).filter(([, spec]) => spec.type === "text").map(([name]) => name)).toEqual(["startLabel", "endLabel"]);
  });

  it("is made with a vertical line of the sample objects, in a box of its own, with the size of an object", () => {
    const block = stored(moduleWith("sort", false));
    expect(block.orientation).toBe("vertical");
    expect(block.items.length).toBeGreaterThanOrEqual(3);
    expect(block.items.every((item) => item.kind === "text" && item.text.trim() !== "")).toBe(true);
    expect(new Set(block.items.map((item) => item.id)).size).toBe(block.items.length);
  });

  it("has the picture of an object kept only while the object is a picture", () => {
    const m = moduleWith("sort", false);
    const block = stored(m);
    block.items[0].kind = "image";
    block.items[0].assetId = "asset-1";
    expect(new Set(usedAssetIds(m.content)).has("asset-1")).toBe(true);
    block.items[0].kind = "text";
    expect(new Set(usedAssetIds(m.content)).has("asset-1")).toBe(false);
  });

  it("is exported with a number for each object and the words at both ends of the line - a picture's words as its description", () => {
    const m = moduleWith("sort", false);
    const block = stored(m);
    block.startLabel = "Früh";
    block.endLabel = "Spät";
    block.items[1].kind = "image";
    block.items[1].assetId = "asset-1";
    expect(exportedItemTexts(m.block).map((text) => text.role)).toEqual(block.items.map((_, i) => `Objekt ${i + 1}` + (i === 1 ? " (Bildbeschreibung)" : "")));
    expect(exportedTexts(m.block).map((text) => text.role)).toEqual(["Wort am Anfang der Linie", "Wort am Ende der Linie"]);
    const file = exportTexts(m.content, { file: "test.weft", to: [EN] });
    const mine = file.items.filter((item) => item.key.startsWith(`${m.block.id}#`));
    expect(mine.map((item) => item.key)).toEqual(expect.arrayContaining([`${m.block.id}#start`, `${m.block.id}#end`, `${m.block.id}#item:${block.items[0].id}`]));
    for (const item of mine) item.translations[EN] = "EN " + item.source;
    importTexts(m.content, file);
    const translated = stored(m).translations![EN] as { startLabel: string; endLabel: string; items: Record<string, string> };
    expect(translated.startLabel).toBe("EN Früh");
    expect(translated.endLabel).toBe("EN Spät");
    expect(translated.items[block.items[0].id]).toBe("EN " + block.items[0].text);
  });

  it("has the words of its objects and its ends found by the clipboard, and checked for placeholders", () => {
    const m = moduleWith("sort", false);
    const block = stored(m);
    block.items[0].text = "{{gibtesnicht}} zuerst";
    block.endLabel = "Ende {{auchnicht}}";
    const plain = clipboardEntryPlainText({ kind: "block", block: m.block } as never);
    expect(plain).toContain("{{gibtesnicht}} zuerst");
    expect(plain).toContain("Ende {{auchnicht}}");
    expect(plain.indexOf(block.items[0].text)).toBeLessThan(plain.indexOf(block.items[1].text));
    const messages = findings(m).filter((finding) => finding.code === "placeholder-variable").map((finding) => finding.message);
    expect(messages).toEqual(expect.arrayContaining([expect.stringContaining("gibtesnicht"), expect.stringContaining("auchnicht")]));
  });

  it("says in one line what it is (`weft inspect`): the right order, the words at the ends and its flags", () => {
    const m = moduleWith("sort", false);
    const block = stored(m);
    block.startLabel = "Früh";
    block.endLabel = "Spät";
    block.orientation = "horizontal";
    block.required = true;
    const line = descriptorOf("sort")!.summary!(m.block as never, { labels: {} });
    expect(line).toMatch(/^richtige Reihenfolge: .* → .*\(Früh … Spät\) \[waagerecht\] \[Pflicht\]$/);
    block.items[0].kind = "image";
    block.items[0].text = "";
    expect(descriptorOf("sort")!.summary!(m.block as never, { labels: {} })).toContain("[Bild: ohne Beschreibung]");
    block.startLabel = "";
    expect(descriptorOf("sort")!.summary!(m.block as never, { labels: {} })).toContain("( … Spät)");
  });

  it("has what is wrong with it said: one object, a picture without a picture or file or description, no points at all", () => {
    const m = moduleWith("sort", false);
    const block = stored(m);
    block.items[0].kind = "image";
    block.items[0].assetId = null;
    expect(codes(m)).toContain("sort-no-image");
    block.items[0].assetId = "gibtsnicht";
    expect(findings(m).find((finding) => finding.code === "asset-missing")?.severity).toBe("error");
    block.items[0].assetId = "asset-1";
    block.items[0].text = " ";
    expect(codes(m)).toContain("image-no-alt");
    block.items = block.items.slice(0, 1);
    expect(codes(m)).toContain("sort-too-few");
    // (Points for one of the four are points.)
    const some = moduleWith("sort", false);
    const partly = some.content.pages[some.pageId].blocks[some.blockId] as unknown as Record<string, unknown[]>;
    for (const name of ["onSubmit", "onCorrect", "onIncorrect"]) partly[name] = [];
    partly.onEachError = [{ variable: some.variable, op: "add", value: 1 }];
    expect(codes(some)).not.toContain("sort-no-effects");
    const none = moduleWith("sort", false);
    const bare = none.content.pages[none.pageId].blocks[none.blockId] as unknown as Record<string, unknown[]>;
    for (const name of ["onSubmit", "onEachError", "onCorrect", "onIncorrect"]) bare[name] = [];
    expect(codes(none)).toContain("sort-no-effects");
  });

  it("is found translated when its first object is - and its objects and ends swap with the new default language", () => {
    const m = moduleWith("sort", false);
    const block = stored(m);
    block.startLabel = "Früh";
    expect(isTranslated(block as never, EN, DE)).toBe(false);
    block.translations = { [EN]: { items: { [block.items[0].id]: "First" }, startLabel: "Early" } };
    const own = block.items[0].text;
    rotateDefaultLanguage(m.content, DE, EN);
    expect(block.items[0].text).toBe("First");
    expect(block.startLabel).toBe("Early");
    expect((block.translations![DE].items as Record<string, string>)[block.items[0].id]).toBe(own);
    expect(block.translations![DE].startLabel).toBe("Früh");
  });
});

describe("the picture, the video, the sound and the box of files", () => {
  type Media = { assetId: string | null; alt?: string; appearance?: string; stopPoints?: unknown[]; files?: unknown[]; protection?: unknown; title?: string };
  const stored = (m: ReturnType<typeof moduleWith>) => m.content.pages[m.pageId].blocks[m.blockId] as unknown as Media;
  const say = (m: ReturnType<typeof moduleWith>) => descriptorOf(m.block.kind)!.summary!(m.block as never, { labels: {}, assets: m.content.assets });

  it("say in one line what they are (`weft inspect`): the name of the file, the description, the time marks, how it shows", () => {
    const image = moduleWith("image", true);
    expect(say(image)).toBe(`„Beispiel alt" eins.png`);
    stored(image).alt = "";
    expect(say(image)).toBe("eins.png");
    stored(image).assetId = null;
    expect(say(image)).toBe("(kein Bild)");
    const video = moduleWith("video", true);
    expect(say(video)).toBe("eins.png");
    stored(video).stopPoints = [{ id: "a", timeSeconds: 2, stopsVideo: true }];
    expect(say(video)).toBe("eins.png, 1 Zeitmarken");
    stored(video).stopPoints = [{ id: "a", timeSeconds: 2, stopsVideo: true }, { id: "b", timeSeconds: 5, stopsVideo: false }];
    expect(say(video)).toBe("eins.png, 2 Zeitmarken");
    stored(video).assetId = null;
    expect(say(video)).toBe("(kein Video), 2 Zeitmarken");
    const audio = moduleWith("audio", true);
    expect(say(audio)).toBe("eins.png, mit Player");
    stored(audio).appearance = "hidden";
    stored(audio).stopPoints = [{ id: "a", timeSeconds: 2, stopsVideo: true }];
    expect(say(audio)).toBe("eins.png, unsichtbar, 1 Zeitmarken");
    stored(audio).assetId = null;
    expect(say(audio)).toBe("(keine Audiodatei), unsichtbar, 1 Zeitmarken");
    const files = moduleWith("files", false);
    expect(say(files)).toBe("0 Dateien");
    stored(files).files = [{ id: "asset-2", name: "x.pdf", mimeType: "application/pdf", size: 1 }];
    stored(files).protection = { salt: "a", iterations: 1, verifier: "b" };
    expect(say(files)).toBe("1 Dateien, geschützt");
  });

  it("have one thing said about their file at a time - and only a picture is asked for a description", () => {
    const codes = (m: ReturnType<typeof moduleWith>) => descriptorOf(m.block.kind)!.validate!(m.block as never, m.content).map((problem) => problem.code);
    for (const kind of ["image", "video", "audio"]) {
      const m = moduleWith(kind, true);
      stored(m).assetId = null;
      expect(codes(m), kind).toEqual(["media-empty"]);
      stored(m).assetId = "gibt-es-nicht";
      expect(codes(m), kind).toEqual(["asset-missing"]);
    }
    for (const kind of ["video", "audio"]) expect(codes(moduleWith(kind, true)), kind).toEqual([]);
  });

  it("are made as they always were: where on the slide, what is set, nothing chosen yet", () => {
    const made = (kind: string) => moduleWith(kind, false).block as unknown as Record<string, unknown>;
    expect(made("image")).toMatchObject({ position: { x: 10, y: 40, width: 80, height: 20 }, assetId: null, alt: "" });
    expect(made("video")).toMatchObject({ position: { x: 10, y: 40, width: 80, height: 20 }, assetId: null, autoplay: false, loop: false, muted: false, controls: true, stopPoints: [] });
    expect(made("audio")).toMatchObject({ position: { x: 30, y: 40, width: 40, height: 12 }, assetId: null, autoplay: false, loop: false, appearance: "player", stopPoints: [] });
    expect(made("files")).toMatchObject({ position: { x: 30, y: 35, width: 40, height: 30 }, title: "", files: [], protection: null });
  });

  it("keep the file they show - and the box of files the files it holds - in the module, and let go of it when the block is not that any more", () => {
    for (const kind of ["image", "video", "audio"]) {
      const m = moduleWith(kind, true);
      expect(new Set(usedAssetIds(m.content)).has("asset-1"), kind).toBe(true);
      stored(m).assetId = null;
      expect(new Set(usedAssetIds(m.content)).has("asset-1"), kind).toBe(false);
    }
    const files = moduleWith("files", false);
    stored(files).files = [{ id: "asset-2", name: "x.pdf", mimeType: "application/pdf", size: 1 }];
    expect(new Set(usedAssetIds(files.content))).toEqual(new Set(["asset-2"]));
  });

  it("have a file that is in the list of the module's files but not in the archive reported (a file of any kind)", () => {
    for (const kind of ["image", "video", "audio"]) {
      const m = moduleWith(kind, true);
      const asset = m.content.assets[0];
      const inArchive = new Set(m.content.assets.map((a) => `assets/${a.id}_${a.fileName}`));
      const check = () => validate({ path: "test.weft", json: { formatVersion: CURRENT_FORMAT_VERSION, content: m.content }, content: m.content, files: inArchive, archive: true }).filter((finding) => finding.code === "asset-file-missing");
      expect(check(), kind).toEqual([]);
      inArchive.delete(`assets/${asset.id}_${asset.fileName}`);
      expect(check()[0]?.severity, kind).toBe("error");
    }
  });
});

describe("the shape, the arrow, the code, the formula and the logic block", () => {
  type Stored = Record<string, unknown>;
  const stored = (m: ReturnType<typeof moduleWith>) => m.content.pages[m.pageId].blocks[m.blockId] as unknown as Stored;
  const say = (m: ReturnType<typeof moduleWith>) => descriptorOf(m.block.kind)!.summary!(m.block as never, { labels: {} });

  it("say in one line what they are (`weft inspect`)", () => {
    const shape = moduleWith("shape", false);
    expect(say(shape)).toBe("rectangle");
    stored(shape).shapeKind = "star";
    expect(say(shape)).toBe("star");
    const arrow = moduleWith("arrow", false);
    expect(say(arrow)).toBe("3 Punkte");
    stored(arrow).points = [{ x: 0, y: 0 }, { x: 5, y: 5 }];
    expect(say(arrow)).toBe("2 Punkte");
    const code = moduleWith("code", false);
    stored(code).code = "first line\nsecond";
    expect(say(code)).toBe("javascript: first line");
    stored(code).code = "x".repeat(80);
    expect(say(code)).toBe("javascript: " + "x".repeat(50));
    const tex = moduleWith("tex", false);
    stored(tex).tex = "y".repeat(70);
    expect(say(tex)).toBe("y".repeat(60));
    const script = moduleWith("script", false);
    stored(script).code = "// a comment\n\n  vars.a = 1;\nmore";
    expect(say(script)).toBe("Logikblock: vars.a = 1;");
    stored(script).code = "// only a comment";
    expect(say(script)).toBe("Logikblock: ");
    stored(script).code = "z".repeat(80);
    expect(say(script)).toBe("Logikblock: " + "z".repeat(50));
  });

  it("are made as they always were: where on the slide and with what", () => {
    const made = (kind: string) => moduleWith(kind, false).block as unknown as Record<string, unknown>;
    expect(made("shape")).toMatchObject({ position: { x: 30, y: 30, width: 40, height: 40 }, shapeKind: "rectangle", sides: 6, starPoints: 5, starInnerRadius: 45, fill: { type: "solid" }, stroke: { enabled: false }, shadow: { enabled: false } });
    expect(made("arrow")).toMatchObject({ position: { x: 20, y: 35, width: 60, height: 30 }, arrowStyle: "plain", width: 0.8, startHead: false, endHead: true, points: [{ x: 0, y: 80 }, { x: 45, y: 25 }, { x: 100, y: 50 }] });
    expect(made("code")).toMatchObject({ position: { x: 10, y: 30, width: 80, height: 40 }, language: "javascript", theme: "atom-one-dark", fontSize: 13 });
    expect(made("tex")).toMatchObject({ position: { x: 25, y: 35, width: 50, height: 30 }, color: "" });
    expect(made("script")).toMatchObject({ position: { x: 44.5, y: 40.25, width: 11, height: 19.5 } });
    expect(made("script").code).toMatch(/^\/\//);
  });

  it("have their text in the clipboard: the code with its empty lines, the formula as it is - and nothing for what is only drawn", () => {
    const code = moduleWith("code", false);
    stored(code).code = "a\n\nb\nc";
    expect(clipboardEntryPlainText({ kind: "block", block: code.block } as never)).toBe("a\n\nb\nc");
    const tex = moduleWith("tex", false);
    stored(tex).tex = "x^2";
    expect(clipboardEntryPlainText({ kind: "block", block: tex.block } as never)).toBe("x^2");
    for (const kind of ["shape", "arrow", "script"]) expect(clipboardEntryPlainText({ kind: "block", block: moduleWith(kind, false).block } as never), kind).toBe("");
  });

  it("have no words to translate - what is in them is shown as it is - and only the logic block is kept off the layouts", () => {
    for (const kind of ["shape", "arrow", "code", "tex", "script"]) {
      const m = moduleWith(kind, true);
      expect(exportedTexts(m.block), kind).toEqual([]);
      expect(placeholderSources(m.block), kind).toEqual([]);
      expect(isPageOnlyKind(kind), kind).toBe(kind === "script");
    }
  });
});

describe("the placeholder of a layout", () => {
  const made = () => moduleWith("placeholder", false);
  const stored = (m: ReturnType<typeof moduleWith>) => m.block as unknown as { label: string; html: string };
  const findings = (m: ReturnType<typeof moduleWith>) => validate({ path: "test.weft", json: { formatVersion: CURRENT_FORMAT_VERSION, content: m.content }, content: m.content, files: new Set(), archive: false });

  it("is made in a layout, with a label and a sample text, and says in one line what it is", () => {
    const m = made();
    expect(Object.values(m.content.layouts).some((layout) => layout.blocks[m.blockId])).toBe(true);
    expect(Object.values(m.content.pages[m.pageId].blocks).length).toBe(0);
    expect(m.block.position).toEqual({ x: 10, y: 40, width: 80, height: 20 });
    expect(stored(m).label.trim()).not.toBe("");
    expect(stored(m).html).toMatch(/^<p>.+<\/p>$/);
    stored(m).label = "Titel";
    expect(descriptorOf("placeholder")!.summary!(m.block as never, { labels: {} })).toBe("Platzhalter „Titel\"");
  });

  it("is refused on a slide: by `weft edit`, by a paste - and reported when a file has one there", () => {
    const m = made();
    expect(() => runOperations(m.content, [{ op: "add_block", page: m.pageId, kind: "placeholder" }])).toThrow(/gehört in ein Layout/);
    const clean = findings(m).filter((finding) => finding.code === "placeholder-on-page");
    expect(clean).toEqual([]);
    m.content.pages[m.pageId].blocks[m.blockId] = { ...m.block, order: 1 } as never;
    const found = findings(m).find((finding) => finding.code === "placeholder-on-page");
    expect(found?.severity).toBe("error");
  });

  it("has its sample text checked for variables that do not exist, but not exported for translation", () => {
    const m = made();
    (m.block as unknown as { html: string }).html = "<p>Wert {{gibtesnicht}}</p>";
    expect(placeholderSources(m.block)).toEqual(["<p>Wert {{gibtesnicht}}</p>"]);
    expect(findings(m).some((finding) => finding.code === "placeholder-variable")).toBe(true);
    expect(exportedTexts(m.block)).toEqual([]);
  });
});

describe("what nothing is seen of when a slide is played (a logic block)", () => {
  const withBlocks = () => {
    const m = moduleWith("script", false);
    const add = (kind: string, set: Record<string, unknown>) => runOperations(m.content, [{ op: "add_block", page: m.pageId, kind, set }]).results[0].result.block as string;
    const upper = add("text", { position: { x: 10, y: 10, width: 30, height: 10 } });
    const lower = add("text", { position: { x: 10, y: 40, width: 30, height: 10 } });
    return { ...m, upper, lower };
  };

  it("is only said of the logic block - by its descriptor", () => {
    expect(KINDS.filter((kind) => isInvisibleKind(kind))).toEqual(["script"]);
    expect(isInvisibleKind("text")).toBe(false);
    expect(isInvisibleKind("gibt-es-nicht")).toBe(false);
  });

  it("is not in the reading order of the slide, however high it stands", () => {
    const m = withBlocks();
    const script = m.content.pages[m.pageId].blocks[m.blockId];
    script.position = { x: 0, y: 0, width: 10, height: 10 };
    const order = pageReadingOrder(m.content.pages[m.pageId], null);
    expect(order).toEqual([m.upper, m.lower]);
    expect(order).not.toContain(m.blockId);
  });

  it("has no Aufbau for an Aktionseffekt to wait for, even where its block says it has one", () => {
    const m = withBlocks();
    const page = m.content.pages[m.pageId];
    const fade = { type: "fade", durationMs: 400 } as never;
    page.blocks[m.blockId].entranceEffect = fade;
    page.blocks[m.lower].entranceEffect = fade;
    // (What an effect may be triggered by: where there is an Aufbau only that and what comes after it - the start of the slide is too early.)
    expect(canTriggerActionEffectFrom(page, page.blocks[m.lower], "e", "start")).toBe(false);
    expect(canTriggerActionEffectFrom(page, page.blocks[m.blockId], "e", "start")).toBe(true);
  });

  it("is told to the player: the page it is run in knows the kinds nothing of which is seen", async () => {
    const m = withBlocks();
    const html = await buildRuntimeHtml(m.content);
    expect(html).toContain('<script id="weft-invisible-kinds" type="application/json">["script"]</script>');
  });
});

describe("the events of their own that a block gives its page (the descriptor's `events`)", () => {
  const make = (kind: string, set: Record<string, unknown> = {}) => {
    const m = moduleWith(kind, false);
    const block = m.content.pages[m.pageId].blocks[m.blockId] ?? Object.values(m.content.layouts)[0].blocks[m.blockId];
    Object.assign(block, set);
    return { ...m, block: block as Block };
  };
  const ON = { onPage: true };
  const OFF = { onPage: false };
  const fade = { type: "fade", durationMs: 400 };

  it("are described well: the keys of a kind differ, the ids differ between all kinds (a video and a sound have the same events), an event of items names an array the block has", () => {
    const specsByPrefix = new Map<string, unknown>();
    for (const kind of KINDS) {
      const specs = descriptorOf(kind)?.events ?? [];
      const all = specs.flatMap((spec) => [spec, ...(spec.companions ?? [])]);
      expect(new Set(all.map((spec) => spec.key)).size, kind).toBe(all.length);
      for (const spec of all) {
        expect(spec.idPrefix, kind).toMatch(/^[a-z]+(-[a-z]+)*$/);
        // (The same prefix in two kinds is the same event: the one description, shared.)
        const same = specsByPrefix.get(spec.idPrefix + (spec.idSuffix ?? ""));
        if (same) expect(same, spec.idPrefix).toBe(spec);
        specsByPrefix.set(spec.idPrefix + (spec.idSuffix ?? ""), spec);
        if (spec.perItem) {
          const sample = (descriptorOf(kind) as BlockDescriptor).defaults() as unknown as Record<string, unknown>;
          expect(Array.isArray(sample[spec.perItem]), `${kind}.${spec.key}`).toBe(true);
        }
      }
    }
    expect(KINDS.filter((kind) => descriptorOf(kind)?.events).sort()).toEqual(["audio", "button", "list", "revealer", "script", "video"]);
  });

  it("have ids that the player makes the same way - the ids are part of the file", () => {
    const player = readFileSync("src/core/runtime/player.runtime.js", "utf8");
    for (const kind of KINDS) for (const spec of (descriptorOf(kind)?.events ?? []).flatMap((event) => [event, ...(event.companions ?? [])])) expect(player, spec.idPrefix).toContain(`"${spec.idPrefix}:"`);
    // (And a task's: the first answer, submitted - with the outcome after it.)
    for (const prefix of ["quiz-fill", "quiz-submit"]) expect(player, prefix).toContain(`"${prefix}:"`);
  });

  it("are made into the ids the editor's functions give", () => {
    expect(ownEventId("script", "run", "b1")).toBe("script-run:b1");
    expect(ownEventId("button", "click", "b1")).toBe("button-click:b1");
    expect(ownEventId("revealer", "open", "b1")).toBe("revealer-open:b1");
    expect(ownEventId("revealer", "button", "b1")).toBe("revealer-button:b1");
    expect(ownEventId("list", "item", "b1", "i1")).toBe("list-item:b1:i1");
    expect(ownEventId("video", "start", "b1")).toBe("video-start:b1");
    expect(ownEventId("audio", "end", "b1")).toBe("video-end:b1");
    expect(ownEventId("video", "stop", "b1", "s1")).toBe("video-stop:b1:s1");
    expect(ownEventId("video", "resume", "b1", "s1")).toBe("video-resume:b1:s1");
    expect([taskEventId("fill", "q"), taskEventId("submit", "q"), taskEventId("correct", "q"), taskEventId("incorrect", "q")]).toEqual(["quiz-fill:q", "quiz-submit:q", "quiz-submit:q:richtig", "quiz-submit:q:falsch"]);
    expect([quizFillNodeId("q"), quizSubmitNodeId("q"), quizSubmitNodeId("q", "richtig"), quizSubmitNodeId("q", "falsch")]).toEqual(["quiz-fill:q", "quiz-submit:q", "quiz-submit:q:richtig", "quiz-submit:q:falsch"]);
    expect([videoStartNodeId("v"), videoStopNodeId("v", "s"), videoResumeNodeId("v", "s"), videoEndNodeId("v")]).toEqual(["video-start:v", "video-stop:v:s", "video-resume:v:s", "video-end:v"]);
    expect([scriptRunNodeId("b1"), buttonClickNodeId("b1"), revealerOpenNodeId("b1"), revealerButtonNodeId("b1"), listItemNodeId("b1", "i1")]).toEqual(["script-run:b1", "button-click:b1", "revealer-open:b1", "revealer-button:b1", "list-item:b1:i1"]);
    expect(() => ownEventId("text", "run", "b1")).toThrow(/no event/);
    expect(() => ownEventId("script", "gibt-es-nicht", "b1")).toThrow(/no event/);
  });

  it("are a logic block's script running (on a page, not in a layout), a button's click, a revealer's opening and - while it has one - its button", () => {
    const script = make("script");
    expect(ownEventsOf(script.block, ON).map((event) => event.id)).toEqual([`script-run:${script.block.id}`]);
    expect(ownEventsOf(script.block, OFF)).toEqual([]);
    const button = make("button");
    expect(ownEventsOf(button.block, ON).map((event) => event.id)).toEqual([`button-click:${button.block.id}`]);
    expect(ownEventsOf(button.block, OFF).map((event) => event.id)).toEqual([`button-click:${button.block.id}`]);
    const revealer = make("revealer", { button: undefined });
    expect(ownEventsOf(revealer.block, ON).map((event) => event.id)).toEqual([`revealer-open:${revealer.block.id}`]);
    (revealer.block as unknown as { button: unknown }).button = { text: "ok", action: "none" };
    expect(ownEventsOf(revealer.block, ON).map((event) => event.id)).toEqual([`revealer-open:${revealer.block.id}`, `revealer-button:${revealer.block.id}`]);
    expect(ownEventsOf(make("text").block, ON)).toEqual([]);
  });

  it("are, for a video and a sound: the start, each time mark - and after one that stops it the video going on - and the end; the start and the end as the block says", () => {
    const stops = [{ id: "s1", timeSeconds: 3, stopsVideo: true }, { id: "s2", timeSeconds: 7, stopsVideo: false }, { id: "s3", timeSeconds: 9, stopsVideo: true }];
    for (const kind of ["video", "audio"]) {
      const media = make(kind, { stopPoints: stops, autoplay: false, loop: false });
      const id = media.block.id;
      const events = () => ownEventsOf(media.block, ON).map((event) => [event.id, event.spec.graphKind, event.timelineType]);
      expect(events(), kind).toEqual([
        [`video-start:${id}`, "video-start", "video-start-manual"],
        [`video-stop:${id}:s1`, "video-stop", "video-stop-point"],
        [`video-resume:${id}:s1`, "video-resume", "video-resume"],
        [`video-stop:${id}:s2`, "video-stop", "video-stop-point"],
        [`video-stop:${id}:s3`, "video-stop", "video-stop-point"],
        [`video-resume:${id}:s3`, "video-resume", "video-resume"],
        [`video-end:${id}`, "video-end", "video-end-stop"],
      ]);
      Object.assign(media.block, { autoplay: true, loop: true });
      expect(events()[0][2], kind).toBe("video-start-auto");
      expect(events()[events().length - 1][2], kind).toBe("video-end-loop");
      // (In a layout too: a block of a layout has them.)
      expect(ownEventsOf(media.block, OFF).length, kind).toBe(7);
      Object.assign(media.block, { stopPoints: [] });
      expect(events().map((event) => event[0]), kind).toEqual([`video-start:${id}`, `video-end:${id}`]);
    }
  });

  it("are, for a task - a quiz, a gap text, a checker, a solution word, a matching, a sorting puzzle - the first answer, submitted, and submitted right and wrong, in the words of its descriptor", () => {
    const tasks = KINDS.filter((kind) => descriptorOf(kind)?.task);
    expect(tasks.sort()).toEqual(["checker", "cloze", "matching", "quiz", "solution", "sort"]);
    for (const kind of tasks) {
      const task = make(kind);
      const id = task.block.id;
      const labels = (descriptorOf(kind) as BlockDescriptor).task!.labels;
      const events = ownEventsOf(task.block, ON);
      expect(events.map((event) => [event.id, event.spec.graphKind, event.timelineType]), kind).toEqual([
        [`quiz-fill:${id}`, "quiz-fill", "quiz-fill-start"],
        [`quiz-submit:${id}`, "quiz-submit", "quiz-submit"],
        [`quiz-submit:${id}:richtig`, "quiz-submit", "quiz-submit-correct"],
        [`quiz-submit:${id}:falsch`, "quiz-submit", "quiz-submit-incorrect"],
      ]);
      expect(events.map((event) => event.spec.label?.(task.block as never, { name: "" })), kind).toEqual([tr(labels.fill), tr(labels.submit), tr(labels.correct), tr(labels.incorrect)]);
      expect(ownEventsOf(task.block, OFF).length, kind).toBe(4);
    }
    expect(() => taskEventId("gibt-es-nicht" as never, "q")).toThrow(/no event/);
  });

  it("are, for a list, one for each item - while it has an Aufbau for each item, on a page", () => {
    const list = make("list", { items: [{ id: "a", html: "<p>1</p>" }, { id: "b", html: "<p>2</p>" }], entranceEffect: fade, itemEntrance: true });
    const id = list.block.id;
    expect(ownEventsOf(list.block, ON).map((event) => [event.id, event.itemId, event.index])).toEqual([[`list-item:${id}:a`, "a", 0], [`list-item:${id}:b`, "b", 1]]);
    expect(ownEventsOf(list.block, OFF)).toEqual([]);
    Object.assign(list.block, { itemEntrance: false });
    expect(ownEventsOf(list.block, ON)).toEqual([]);
    Object.assign(list.block, { itemEntrance: true, entranceEffect: { type: "off", durationMs: 400 } });
    expect(ownEventsOf(list.block, ON)).toEqual([]);
  });

  it("stand in for the Aufbau of the block: a logic block has none, a list with an Aufbau for each item has the items', nothing else does", () => {
    expect(replacesEntrance(make("script").block, ON)).toBe(true);
    expect(replacesEntrance(make("script").block, OFF)).toBe(true);
    const list = make("list", { entranceEffect: fade, itemEntrance: true });
    expect(replacesEntrance(list.block, ON)).toBe(true);
    expect(replacesEntrance(list.block, OFF)).toBe(false);
    Object.assign(list.block, { itemEntrance: false });
    expect(replacesEntrance(list.block, ON)).toBe(false);
    Object.assign(list.block, { itemEntrance: true, entranceEffect: { type: "off", durationMs: 400 } });
    expect(replacesEntrance(list.block, ON)).toBe(false);
    for (const kind of ["button", "revealer", "text", "quiz"]) expect(replacesEntrance(make(kind).block, ON), kind).toBe(false);
  });

  it("can be made to happen by a trigger where the descriptor says so: the opening of a revealer, a list's items, a script - not a click", () => {
    expect(triggerableOwnEventTypes().sort()).toEqual(["list-item-entrance", "revealer-open", "script-run", "video-start-auto", "video-start-manual"]);
    for (const type of ["revealer-open", "list-item-entrance", "script-run", "video-start-auto", "video-start-manual"] as const) expect(TRIGGERABLE_EVENT_TYPES.has(type), type).toBe(true);
    for (const type of ["button-click", "revealer-button", "video-stop-point", "video-resume", "video-end-loop", "video-end-stop", "quiz-fill-start", "quiz-submit", "quiz-submit-correct", "quiz-submit-incorrect"] as const) expect(TRIGGERABLE_EVENT_TYPES.has(type), type).toBe(false);
  });

  it("are in the page's graph as what the player makes of them, where the descriptor puts them - and a layout's block gives a page the same only where it may", () => {
    const m = make("script");
    const add = (kind: string, set: Record<string, unknown>, layout = false) => runOperations(m.content, [{ op: "add_block", ...(layout ? { layout: Object.keys(m.content.layouts)[0] } : { page: m.pageId }), kind, set }]).results[0].result.block as string;
    const revealer = add("revealer", { button: { text: "ok", action: "none" } });
    const button = add("button", {});
    const list = add("list", { items: [{ id: "a", html: "<p>1</p>" }], entranceEffect: fade, itemEntrance: true });
    const layoutList = add("list", { items: [{ id: "z", html: "<p>1</p>" }], entranceEffect: fade, itemEntrance: true }, true);
    const layoutButton = add("button", { action: "event" }, true);
    const video = add("video", { stopPoints: [{ id: "s1", timeSeconds: 3, stopsVideo: true }, { id: "s2", timeSeconds: 5, stopsVideo: false }] });
    const quiz = add("quiz", {});
    const checker = add("checker", {});
    const page = m.content.pages[m.pageId];
    const graph = buildEventGraph(page, m.content.layouts[Object.keys(m.content.layouts)[0]]);
    const kinds = Object.fromEntries(graph.events.map((event) => [event.id, event.kind]));
    // (A video's: start, each time mark, the video going on after one that stops it, the end. A task's: the first answer and submitted - plain, right, wrong.)
    expect(kinds[`video-start:${video}`]).toBe("video-start");
    expect(kinds[`video-stop:${video}:s1`]).toBe("video-stop");
    expect(kinds[`video-stop:${video}:s2`]).toBe("video-stop");
    expect(kinds[`video-resume:${video}:s1`]).toBe("video-resume");
    expect(kinds[`video-resume:${video}:s2`]).toBeUndefined();
    expect(kinds[`video-end:${video}`]).toBe("video-end");
    for (const task of [quiz, checker]) {
      expect(kinds[`quiz-fill:${task}`]).toBe("quiz-fill");
      for (const id of [`quiz-submit:${task}`, `quiz-submit:${task}:richtig`, `quiz-submit:${task}:falsch`]) expect(kinds[id], id).toBe("quiz-submit");
    }
    expect(kinds[`script-run:${m.blockId}`]).toBe("script-run");
    expect(kinds[`revealer-open:${revealer}`]).toBe("revealer-open");
    expect(kinds[`revealer-button:${revealer}`]).toBe("revealer-button");
    expect(kinds[`button-click:${button}`]).toBe("button-click");
    expect(kinds[`list-item:${list}:a`]).toBe("list-item");
    expect(kinds[`block-entrance:${list}`]).toBeUndefined();
    // (A list of the layout appears as a whole, and a button of the layout that goes on does so for every page.)
    expect(kinds[`list-item:${layoutList}:z`]).toBeUndefined();
    expect(kinds[`block-entrance:${layoutList}`]).toBe("entrance");
    expect(kinds[`button-click:${layoutButton}`]).toBe("button-click");
    expect(graph.triggers.some((trigger) => trigger.id === `layout:button-click:${layoutButton}` && trigger.to === "end")).toBe(true);
    // The order of the events: the ones that stand in for an Aufbau where the Aufbau would be, the others after the Abbau.
    const order = graph.events.map((event) => event.id);
    expect(order.indexOf(`revealer-open:${revealer}`)).toBeLessThan(order.indexOf(`revealer-button:${revealer}`));
  });

  it("have in the page's graph the Aufbau and the Abbau of a block (the Aufbau first, the Aktionseffekte between), the layout's Aufbau at the start, and those of a group", () => {
    const m = make("text");
    const add = (set: Record<string, unknown>, layout = false) => runOperations(m.content, [{ op: "add_block", ...(layout ? { layout: Object.keys(m.content.layouts)[0] } : { page: m.pageId }), kind: "text", set }]).results[0].result.block as string;
    const off = { type: "off", durationMs: 400 };
    const both = add({ entranceEffect: fade, exitEffect: fade });
    const onlyExit = add({ entranceEffect: off, exitEffect: fade });
    const fromLayout = add({ entranceEffect: fade, exitEffect: fade }, true);
    const page = m.content.pages[m.pageId];
    page.blocks[both].actionEffects = [{ id: "a1", type: "move" } as never];
    page.groups = [{ id: "g1", blockIds: [both], entranceEffect: fade, exitEffect: off } as never, { id: "g2", blockIds: [both], exitEffect: fade } as never];
    const graph = buildEventGraph(page, m.content.layouts[Object.keys(m.content.layouts)[0]]);
    const order = graph.events.map((event) => event.id);
    const kinds = Object.fromEntries(graph.events.map((event) => [event.id, event.kind]));
    expect(kinds[`block-entrance:${both}`]).toBe("entrance");
    expect(kinds[`block-exit:${both}`]).toBe("exit");
    expect(kinds[`block-action:${both}:a1`]).toBe("action");
    expect(order.indexOf(`block-entrance:${both}`)).toBeLessThan(order.indexOf(`block-action:${both}:a1`));
    expect(order.indexOf(`block-action:${both}:a1`)).toBeLessThan(order.indexOf(`block-exit:${both}`));
    expect(kinds[`block-entrance:${onlyExit}`]).toBeUndefined();
    expect(kinds[`block-exit:${onlyExit}`]).toBe("exit");
    // (The layout's: it happens at the start of the page, with no trigger of the page's own - and no Aktionseffekte.)
    expect(kinds[`block-entrance:${fromLayout}`]).toBe("entrance");
    expect(kinds[`block-exit:${fromLayout}`]).toBe("exit");
    const layoutTriggers = graph.triggers.filter((trigger) => trigger.id.startsWith("layout:block-entrance:"));
    expect(layoutTriggers.map((trigger) => [trigger.id, trigger.from, trigger.to])).toEqual([[`layout:block-entrance:${fromLayout}`, "start", `block-entrance:${fromLayout}`]]);
    // (A group's: each effect it has that is not "off".)
    expect(kinds["group-entrance:g1"]).toBe("group-entrance");
    expect(kinds["group-exit:g1"]).toBeUndefined();
    expect(kinds["group-exit:g2"]).toBe("group-exit");
    expect(kinds["group-entrance:g2"]).toBeUndefined();
    // The words of the nodes in the timeline: the block's name, then what happens.
    syncPageTimelineEvents(page);
    const nodes = listAllNodes(page);
    const labelOf = (id: string) => nodes.find((node) => node.id === id)?.label;
    expect(labelOf(`block-entrance:${both}`)).toBe(`${blockNameOf(page.blocks[both])} erscheint`);
    expect(labelOf(`block-exit:${both}`)).toBe(`${blockNameOf(page.blocks[both])} verschwindet`);
    expect(nodes.find((node) => node.id === "group-entrance:g1")?.eventType).toBe("group-entrance");
    expect(nodes.find((node) => node.id === "group-exit:g2")?.eventType).toBe("group-exit");
  });

  it("have, for the Aktionseffekte of a block and the conditions of a page (pageEvents.ts): the ids, the types, the place in the graph and in the timeline", () => {
    const player = readFileSync("src/core/runtime/player.runtime.js", "utf8");
    expect(player).toContain('return "block-action:" + blockId + ":" + effectId;');
    expect(actionEventId("b1", "e1")).toBe("block-action:b1:e1");
    expect(blockActionNodeId("b1", "e1")).toBe("block-action:b1:e1");
    expect(parseActionEventId("block-action:b1:e1")).toEqual({ blockId: "b1", effectId: "e1" });
    for (const id of ["block-entrance:b1", "block-action:b1", "block-action:b1:e1:x", "x-block-action:b1:e1"]) expect(parseActionEventId(id), id).toBeNull();
    expect(conditionEventId("block-entrance:b1")).toBe("condition:block-entrance:b1");
    expect(conditionNodeId("t")).toBe("condition:t");
    expect(isConditionEventId("condition:t")).toBe(true);
    expect(isConditionEventId("block-entrance:b1")).toBe(false);
    expect(triggerableActionEventTypes().sort()).toEqual(["block-action-blink", "block-action-move", "block-action-shake"]);
    for (const type of triggerableActionEventTypes()) expect(TRIGGERABLE_EVENT_TYPES.has(type), type).toBe(true);
    expect(TRIGGERABLE_EVENT_TYPES.has("variable-condition")).toBe(false);
    // The events a drag in the graph can reorder: Aufbau, Abbau, Aktionseffekt, the item of a list - nothing else.
    for (const id of ["block-entrance:b", "block-exit:b", "block-action:b:e", "list-item:b:i"]) expect(isReorderableEventId(id), id).toBe(true);
    for (const id of ["group-entrance:g", "script-run:b", "button-click:b", "condition:x", "video-start:b", "start", "end"]) expect(isReorderableEventId(id), id).toBe(false);

    const m = make("text");
    const add = (set: Record<string, unknown>, layout = false) => runOperations(m.content, [{ op: "add_block", ...(layout ? { layout: Object.keys(m.content.layouts)[0] } : { page: m.pageId }), kind: "text", set }]).results[0].result.block as string;
    const actions = [{ id: "a1", type: "move", durationMs: 500 }, { id: "a2", type: "shake", durationMs: 300 }, { id: "a3", type: "blink", durationMs: 300 }];
    const block = add({ entranceEffect: fade, actionEffects: actions });
    const layoutBlock = add({ entranceEffect: fade, actionEffects: actions }, true);
    const page = m.content.pages[m.pageId];
    expect(actionEventsOf(page.blocks[block], ON).map((event) => [event.id, event.timelineType])).toEqual([
      [`block-action:${block}:a1`, "block-action-move"],
      [`block-action:${block}:a2`, "block-action-shake"],
      [`block-action:${block}:a3`, "block-action-blink"],
    ]);
    expect(actionEventsOf(page.blocks[block], OFF)).toEqual([]);
    expect(actionEventsOf(make("text").block, ON)).toEqual([]);
    // In the graph: one kind for all of them, between the block's Aufbau and Abbau - and none for a block of the layout.
    const condition = `condition:block-action:${block}:a1`;
    page.timeline.conditions = { [condition]: "punkte >= 10" };
    page.timeline.triggers["t:c"] = { from: condition, to: `block-action:${block}:a1`, delayMs: 0, weiter: false };
    const graph = buildEventGraph(page, m.content.layouts[Object.keys(m.content.layouts)[0]]);
    const kinds = Object.fromEntries(graph.events.map((event) => [event.id, event.kind]));
    for (const id of ["a1", "a2", "a3"]) expect(kinds[`block-action:${block}:${id}`], id).toBe("action");
    expect(Object.keys(kinds).filter((id) => id.includes(layoutBlock) && id.startsWith("block-action:"))).toEqual([]);
    expect(kinds[condition]).toBe("condition");
    const conditionEvent = graph.events.find((event) => event.id === condition) as { expr?: unknown } | undefined;
    expect(conditionEvent?.expr).not.toBeNull();
    // In the timeline: the nodes with the words the specs give, as what the specs call them.
    syncPageTimelineEvents(page);
    const nodes = listAllNodes(page);
    const name = blockNameOf(page.blocks[block]);
    const labels = ["a1", "a2", "a3"].map((id) => nodes.find((node) => node.id === `block-action:${block}:${id}`)?.label);
    expect(labels).toEqual([tr("ui.action_moves", { n0: name }), tr("ui.action_shakes", { n0: name }), tr("ui.action_blinks", { n0: name })]);
    expect(nodes.find((node) => node.id === `block-action:${block}:a2`)?.eventType).toBe("block-action-shake");
    const node = nodes.find((candidate) => candidate.id === condition);
    expect(node?.eventType).toBe("variable-condition");
    expect(node?.label).toBe(tr("ui.condition_event", { n0: "punkte >= 10" }));
    // (No node for an effect of a layout's block.)
    expect(nodes.filter((candidate) => candidate.id.startsWith("block-action:") && candidate.id.includes(layoutBlock))).toEqual([]);
    // (Lines and blanks of the formula are one blank.)
    page.timeline.conditions = { [condition]: "  punkte\n >=   10 " };
    syncPageTimelineEvents(page);
    expect(listAllNodes(page).find((candidate) => candidate.id === condition)?.label).toBe(tr("ui.condition_event", { n0: "punkte >= 10" }));
    // An Aktionseffekt stays between the Aufbau and the Abbau of its block when the chain is reordered - for those of the block that are in it.
    expect(isChainOrderAllowed([`block-entrance:${block}`, `block-action:${block}:a1`, `block-exit:${block}`])).toBe(true);
    expect(isChainOrderAllowed([`block-action:${block}:a1`, `block-entrance:${block}`])).toBe(false);
    expect(isChainOrderAllowed([`block-exit:${block}`, `block-action:${block}:a1`])).toBe(false);
    expect(isChainOrderAllowed([`block-action:${block}:a1`, `block-exit:other`, `block-entrance:other`])).toBe(true);
    expect(isChainOrderAllowed([`block-exit:other`, `block-entrance:other`])).toBe(true);
    // The Aufbau that comes back to a block with Aktionseffekte goes before the first of them.
    page.timeline.triggers = { "t:a": { from: "start", to: `block-action:${block}:a1`, delayMs: 0, weiter: true } };
    ensureEffectTriggers(page, [block]);
    expect(page.timeline.triggers[`t:block-entrance:${block}`]).toEqual({ from: "start", to: `block-entrance:${block}`, delayMs: 0, weiter: true });
    expect(page.timeline.triggers["t:a"].from).toBe(`block-entrance:${block}`);
    page.timeline.conditions = { [condition]: "eine_sehr_lange_formel_die_gekuerzt_wird > 100000" };
    page.timeline.triggers["t:c"] = { from: condition, to: `block-action:${block}:a1`, delayMs: 0, weiter: false };
    syncPageTimelineEvents(page);
    expect(listAllNodes(page).find((candidate) => candidate.id === condition)?.label).toBe(tr("ui.condition_event", { n0: "eine_sehr_lange_formel_die_…" }));
  });

  describe("in the page's timeline", () => {
    const setup = () => {
      const m = make("script");
      const page = m.content.pages[m.pageId];
      const add = (kind: string, set: Record<string, unknown> = {}) => runOperations(m.content, [{ op: "add_block", page: m.pageId, kind, set }]).results[0].result.block as string;
      return { m, page, add };
    };
    const lanesWith = (page: Page, id: string) => getPageLanes(page).filter((lane) => lane.nodes.some((node) => node.id === id));
    const triggersTo = (page: Page, id: string) => Object.values(page.timeline.triggers).filter((trigger) => trigger.to === id);

    it("draw the lane of a video or a sound from the descriptor's events: in the order they are given, a time mark timed from the one before, the words of a sound its own", () => {
      const { page, add } = setup();
      const text = add("text", { entranceEffect: fade });
      const video = add("video", { autoplay: false, loop: false, stopPoints: [{ id: "s1", timeSeconds: 3, stopsVideo: true }, { id: "s2", timeSeconds: 7.5, stopsVideo: false }, { id: "s3", timeSeconds: 12, stopsVideo: true }] });
      const looping = add("video", { autoplay: false, loop: true, stopPoints: [] });
      const sound = add("audio", { autoplay: false, loop: false, stopPoints: [{ id: "t1", timeSeconds: 65, stopsVideo: true }, { id: "t2", timeSeconds: 5, stopsVideo: false }] });
      page.timeline.triggers["t:x"] = { from: `video-stop:${video}:s1`, to: `block-entrance:${text}`, delayMs: 0, weiter: false };
      syncPageTimelineEvents(page);
      const laneOf = (id: string) => lanesWith(page, `video-start:${id}`).find((lane) => lane.nodes.some((node) => node.id === `video-end:${id}`))!;
      const lane = laneOf(video);
      expect(lane.nodes.map((node) => node.id)).toEqual([
        `video-start:${video}`, `video-stop:${video}:s1`, `video-resume:${video}:s1`, `video-stop:${video}:s2`, `video-stop:${video}:s3`, `video-resume:${video}:s3`, `video-end:${video}`,
      ]);
      expect(lane.nodes.map((node) => node.eventType)).toEqual(["video-start-manual", "video-stop-point", "video-resume", "video-stop-point", "video-stop-point", "video-resume", "video-end-stop"]);
      expect(lane.edges).toEqual([
        { from: `video-start:${video}`, to: `video-stop:${video}:s1`, kind: "timed", delayMs: 3000 },
        { from: `video-stop:${video}:s1`, to: `video-resume:${video}:s1`, kind: "unknown" },
        { from: `video-resume:${video}:s1`, to: `video-stop:${video}:s2`, kind: "timed", delayMs: 4500 },
        { from: `video-stop:${video}:s2`, to: `video-stop:${video}:s3`, kind: "timed", delayMs: 4500 },
        { from: `video-stop:${video}:s3`, to: `video-resume:${video}:s3`, kind: "unknown" },
        { from: `video-resume:${video}:s3`, to: `video-end:${video}`, kind: "unknown" },
      ]);
      // (A time mark: whether it stops the video and which blocks it makes appear; the words: its time.)
      const stops = lane.nodes.filter((node) => node.eventType === "video-stop-point");
      expect(stops.map((node) => node.stopsVideo)).toEqual([true, false, true]);
      expect(stops.map((node) => node.shownKinds)).toEqual([["text"], [], []]);
      expect(stops.map((node) => node.label)).toEqual([tr("ui.time_mark", { n0: formatTimeMMSS(3) }), tr("ui.time_mark", { n0: formatTimeMMSS(7.5) }), tr("ui.time_mark", { n0: formatTimeMMSS(12) })]);
      expect(lane.nodes.filter((node) => node.eventType === "video-resume").map((node) => node.label)).toEqual([tr("ui.video_continues", { n0: formatTimeMMSS(3) }), tr("ui.video_continues", { n0: formatTimeMMSS(12) })]);
      // (A video has no words of its own for its start and its end; the node of a time mark and every other carry the block they are of.)
      expect(lane.nodes[0].label).toBeUndefined();
      expect(lane.nodes[lane.nodes.length - 1].label).toBeUndefined();
      expect(lane.nodes.every((node) => node.sourceBlockId === video)).toBe(true);
      // A video that loops and starts by the learner: no marks, the start leads to the end.
      const bare = laneOf(looping);
      expect(bare.nodes.map((node) => node.eventType)).toEqual(["video-start-manual", "video-end-loop"]);
      expect(bare.edges).toEqual([{ from: `video-start:${looping}`, to: `video-end:${looping}`, kind: "unknown" }]);
      // A sound: the marks in the order they stand (a time that lies before the one before is no wait), the words of a sound.
      const audioLane = laneOf(sound);
      expect(audioLane.nodes.map((node) => node.id)).toEqual([`video-start:${sound}`, `video-stop:${sound}:t1`, `video-resume:${sound}:t1`, `video-stop:${sound}:t2`, `video-end:${sound}`]);
      expect(audioLane.edges.map((edge) => [edge.kind, edge.kind === "timed" ? edge.delayMs : undefined])).toEqual([["timed", 65000], ["unknown", undefined], ["timed", 0], ["unknown", undefined]]);
      expect(audioLane.nodes[0].label).toBe(tr("ui.start_of_the_audio"));
      expect(audioLane.nodes[audioLane.nodes.length - 1].label).toBe(tr("ui.end_of_the_audio"));
      expect(audioLane.nodes[2].label).toBe(tr("ui.audio_continues", { n0: formatTimeMMSS(65) }));
      // (The lanes come in this order: the page's own, the tasks', the videos' and sounds' in the order of the blocks, then the lanes of the other kinds.)
      const order = getPageLanes(page).map((candidate) => candidate.nodes[0].id);
      expect(order.indexOf(`video-start:${video}`)).toBeLessThan(order.indexOf(`video-start:${looping}`));
      expect(order.indexOf(`video-start:${looping}`)).toBeLessThan(order.indexOf(`video-start:${sound}`));
    });

    it("draw the lane of a task from the descriptor's events: the first answer and submitted (plain, or right or wrong where an outcome goes on), in the task's words", () => {
      const { page, add } = setup();
      const quiz = add("quiz");
      const cloze = add("cloze");
      const word = add("solution");
      const taskLanes = (id: string) => getPageLanes(page).filter((lane) => lane.nodes.some((node) => node.id === `quiz-fill:${id}`));
      syncPageTimelineEvents(page);
      // Nothing goes on after it: one lane, the first answer leads to submitted.
      expect(taskLanes(quiz).map((lane) => lane.nodes.map((node) => node.id))).toEqual([[`quiz-fill:${quiz}`, `quiz-submit:${quiz}`]]);
      expect(taskLanes(quiz)[0].edges).toEqual([{ from: `quiz-fill:${quiz}`, to: `quiz-submit:${quiz}`, kind: "unknown" }]);
      expect(taskLanes(quiz)[0].nodes.map((node) => node.eventType)).toEqual(["quiz-fill-start", "quiz-submit"]);
      // The outcomes that go on to a "Nächste Folie" have a lane each, to that end (after a delay, or by Weiter).
      page.timeline.triggers["t:r"] = { from: `quiz-submit:${quiz}:richtig`, to: "end", delayMs: 250, weiter: false };
      page.timeline.triggers["t:f"] = { from: `quiz-submit:${quiz}:falsch`, to: "end", delayMs: 0, weiter: true };
      syncPageTimelineEvents(page);
      const lanes = taskLanes(quiz);
      expect(lanes.map((lane) => lane.nodes.map((node) => node.id))).toEqual([
        [`quiz-fill:${quiz}`, `quiz-submit:${quiz}:richtig`, "end"],
        [`quiz-fill:${quiz}`, `quiz-submit:${quiz}:falsch`, "end"],
      ]);
      expect(lanes.map((lane) => lane.nodes[1].eventType)).toEqual(["quiz-submit-correct", "quiz-submit-incorrect"]);
      expect(lanes[0].edges).toEqual([{ from: `quiz-fill:${quiz}`, to: `quiz-submit:${quiz}:richtig`, kind: "unknown" }, { from: `quiz-submit:${quiz}:richtig`, to: "end", kind: "timed", delayMs: 250 }]);
      expect(lanes[1].edges[1]).toEqual({ from: `quiz-submit:${quiz}:falsch`, to: "end", kind: "advance", delayMs: 0 });
      // (The words are the task's: a gap text has its own, and so has a solution word, which has both outcomes always.)
      for (const [id, kind] of [[quiz, "quiz"], [cloze, "cloze"], [word, "solution"]] as const) {
        const labels = (descriptorOf(kind) as BlockDescriptor).task!.labels;
        const nodes = getPageLanes(page).flatMap((lane) => lane.nodes);
        expect(nodes.find((node) => node.id === `quiz-fill:${id}`)?.label, kind).toBe(tr(labels.fill));
        expect(nodes.find((node) => node.id === `quiz-submit:${id}`)?.label ?? tr(labels.submit), kind).toBe(tr(labels.submit));
      }
      const wordLanes = taskLanes(word).map((lane) => lane.nodes.map((node) => node.eventType));
      expect(wordLanes).toEqual([["quiz-fill-start", "quiz-submit-correct"], ["quiz-fill-start", "quiz-submit-incorrect"]]);
      expect(taskLanes(word).map((lane) => lane.nodes[1].label)).toEqual([tr((descriptorOf("solution") as BlockDescriptor).task!.labels.correct), tr((descriptorOf("solution") as BlockDescriptor).task!.labels.incorrect)]);
    });

    it("have each their one place on a lane - one that is in the chain is a row of its own only where nothing leads to it, the others are in the lane the descriptor draws", () => {
      const { m, page, add } = setup();
      const list = add("list", { items: [{ id: "a", html: "<p>1</p>" }, { id: "b", html: "<p>2</p>" }], entranceEffect: fade, itemEntrance: true });
      const button = add("button");
      const revealer = add("revealer", { button: { text: "ok", action: "none" } });
      const own = [`script-run:${m.blockId}`, `list-item:${list}:a`, `list-item:${list}:b`, `button-click:${button}`, `revealer-open:${revealer}`, `revealer-button:${revealer}`];
      for (const id of own) expect(lanesWith(page, id).length, id).toBe(1);
      // (Where nothing leads to a list's items, each is a row of its own.)
      page.timeline.triggers = {};
      for (const id of own) expect(lanesWith(page, id).length, id).toBe(1);
      expect(lanesWith(page, `list-item:${list}:a`)[0].nodes.length).toBe(1);
      // (The lanes the descriptors draw hold their events one after the other: a button's click alone, a revealer's opening and its button.)
      expect(lanesWith(page, `button-click:${button}`)[0].nodes.map((node) => node.id)).toEqual([`button-click:${button}`]);
      expect(lanesWith(page, `revealer-open:${revealer}`)[0].nodes.map((node) => node.id)).toEqual([`revealer-open:${revealer}`, `revealer-button:${revealer}`]);
    });

    it("are drawn button by button before revealer by revealer, whichever block came first", () => {
      const { page, add } = setup();
      const revealer = add("revealer");
      const button = add("button");
      const lanes = getPageLanes(page);
      const place = (id: string) => lanes.findIndex((lane) => lane.nodes.some((node) => node.id === id));
      expect(place(`button-click:${button}`)).toBeGreaterThan(-1);
      expect(place(`button-click:${button}`)).toBeLessThan(place(`revealer-open:${revealer}`));
    });

    it("are the nodes of what the descriptor says they are", () => {
      const { m, page, add } = setup();
      const list = add("list", { items: [{ id: "a", html: "<p>1</p>" }], entranceEffect: fade, itemEntrance: true });
      const button = add("button");
      const revealer = add("revealer", { button: { text: "ok", action: "none" } });
      const nodes = getPageLanes(page).flatMap((lane) => lane.nodes);
      const type = (id: string) => nodes.find((node) => node.id === id)?.eventType;
      expect(type(`script-run:${m.blockId}`)).toBe("script-run");
      expect(type(`list-item:${list}:a`)).toBe("list-item-entrance");
      expect(type(`button-click:${button}`)).toBe("button-click");
      expect(type(`revealer-open:${revealer}`)).toBe("revealer-open");
      expect(type(`revealer-button:${revealer}`)).toBe("revealer-button");
      expect(nodes.find((node) => node.id === `script-run:${m.blockId}`)?.sourceBlockId).toBe(m.blockId);
    });

    it("leave the block without an Aufbau of its own where they stand in for it: no node for it, no id for it, no place in the chain for it", () => {
      const { m, page, add } = setup();
      const list = add("list", { items: [{ id: "a", html: "<p>1</p>" }], entranceEffect: fade, itemEntrance: true });
      const script = m.content.pages[m.pageId].blocks[m.blockId];
      script.entranceEffect = fade as never;
      const whole = add("list", { items: [{ id: "w", html: "<p>1</p>" }], entranceEffect: fade });
      for (const id of [`block-entrance:${m.blockId}`, `block-entrance:${list}`]) expect(lanesWith(page, id), id).toEqual([]);
      expect(lanesWith(page, `block-entrance:${whole}`).length).toBe(1);
      // (An id that no event has is not kept as the source or the target of a trigger.)
      for (const id of [`block-entrance:${m.blockId}`, `block-entrance:${list}`]) page.timeline.triggers[`t:${id}`] = { from: "start", to: id, delayMs: 0, weiter: true };
      syncPageTimelineEvents(page);
      for (const id of [`block-entrance:${m.blockId}`, `block-entrance:${list}`]) expect(triggersTo(page, id), id).toEqual([]);
      // (The Aufbau of a list that has one as a whole is, and keeps its trigger.)
      expect(triggersTo(page, `block-entrance:${whole}`).length).toBe(1);
      // (Nor does the chain wait for it.)
      page.timeline.triggers = {};
      ensureEffectTriggers(page, [m.blockId, list, whole]);
      expect(triggersTo(page, `block-entrance:${m.blockId}`)).toEqual([]);
      expect(triggersTo(page, `block-entrance:${list}`)).toEqual([]);
      expect(triggersTo(page, `block-entrance:${whole}`).length).toBe(1);
    });

    it("are coloured as the look of their type says: what the learner does violet, an animation yellow, a script or a condition green, the rest blue - a video's start violet until something triggers it", () => {
      const { m, page, add } = setup();
      const quiz = add("quiz");
      const button = add("button", { entranceEffect: fade });
      const revealer = add("revealer");
      const list = add("list", { items: [{ id: "a", html: "<p>1</p>" }], entranceEffect: fade, itemEntrance: true });
      const video = add("video", { stopPoints: [{ id: "s1", timeSeconds: 3, stopsVideo: true }], entranceEffect: fade });
      syncPageTimelineEvents(page);
      const colors = () => {
        const out: Record<string, string> = {};
        for (const node of buildGraphModel(page).nodes) for (const each of [node, ...node.companions]) out[each.id] = each.color;
        return out;
      };
      const before = colors();
      expect(before[`revealer-button:${revealer}`]).toBe("violet");
      expect(before[`script-run:${m.blockId}`]).toBe("green");
      for (const id of [`quiz-fill:${quiz}`, `quiz-submit:${quiz}`, `button-click:${button}`, `video-resume:${video}:s1`, `video-start:${video}`])
        expect(before[id], id).toBe("violet");
      for (const id of [`list-item:${list}:a`, `block-entrance:${button}`, `block-entrance:${video}`]) expect(before[id], id).toBe("yellow");
      for (const id of [`revealer-open:${revealer}`, `video-stop:${video}:s1`, `video-end:${video}`, "start", "end"]) expect(before[id], id).toBe("blue");
      // (What the learner does needs no way in: nothing marks it unreachable. A stop point of a video that nothing starts is not the learner's.)
      const unreachable = new Set(buildGraphModel(page).nodes.flatMap((node) => [node, ...node.companions]).filter((node) => node.unreachable).map((node) => node.id));
      for (const id of [`quiz-fill:${quiz}`, `quiz-submit:${quiz}`, `button-click:${button}`, `revealer-button:${revealer}`]) expect(unreachable.has(id), id).toBe(false);
      // (Something triggers the start of the video: it is no longer the learner pressing play.)
      page.timeline.triggers["t:video"] = { from: "start", to: `video-start:${video}`, delayMs: 0 } as never;
      syncPageTimelineEvents(page);
      expect(colors()[`video-start:${video}`]).toBe("blue");
    });

    it("take their place in the chain of Weiter when the block is made, or asked for - the items of a list in the order of the list", () => {
      const { m, page, add } = setup();
      // (A logic block made by add_block - addBlockToPage - has its trigger at once.)
      expect(triggersTo(page, `script-run:${m.blockId}`).length).toBe(1);
      const list = add("list", { items: [{ id: "a", html: "<p>1</p>" }, { id: "b", html: "<p>2</p>" }], entranceEffect: fade, itemEntrance: true });
      page.timeline.triggers = {};
      ensureEffectTriggers(page, [list, m.blockId]);
      expect(triggersTo(page, `list-item:${list}:a`).length).toBe(1);
      expect(triggersTo(page, `list-item:${list}:b`).length).toBe(1);
      expect(triggersTo(page, `script-run:${m.blockId}`).length).toBe(1);
      // (A button's click is the learner's: nothing puts it in the chain.)
      const button = add("button", { entranceEffect: fade });
      ensureEffectTriggers(page, [button]);
      expect(triggersTo(page, `button-click:${button}`)).toEqual([]);
      expect(triggersTo(page, `block-entrance:${button}`).length).toBe(1);
    });

    it("say which blocks have the Aufbau made by their items: lists with an Aufbau for each item", () => {
      const { m, add } = setup();
      const content = m.content;
      const block = (id: string) => content.pages[m.pageId].blocks[id];
      const per = add("list", { entranceEffect: fade, itemEntrance: true });
      const whole = add("list", { entranceEffect: fade });
      const noEffect = add("list", { itemEntrance: true });
      expect(isListPerItem(block(per))).toBe(true);
      expect(isListPerItem(block(whole))).toBe(false);
      expect(isListPerItem(block(noEffect))).toBe(false);
      expect(isListPerItem(block(m.blockId))).toBe(false);
      expect(isListPerItem(block(add("text")))).toBe(false);
    });

    it("leave an Aktionseffekt of a list with an Aufbau for each item no Aufbau to wait for - one of a list with an Aufbau as a whole has it", () => {
      const { page, add } = setup();
      const per = add("list", { entranceEffect: fade, itemEntrance: true });
      const whole = add("list", { entranceEffect: fade });
      expect(canTriggerActionEffectFrom(page, page.blocks[per], "e", "start")).toBe(true);
      expect(canTriggerActionEffectFrom(page, page.blocks[whole], "e", "start")).toBe(false);
    });
  });

  it("show in the lanes of the timeline with the words the descriptor gives them", () => {
    const m = make("script", { name: "Mein Skript" });
    const add = (kind: string, set: Record<string, unknown>) => runOperations(m.content, [{ op: "add_block", page: m.pageId, kind, set }]).results[0].result.block as string;
    const list = add("list", { items: [{ id: "a", html: "<p>1</p>" }, { id: "b", html: "<p>2</p>" }], entranceEffect: fade, itemEntrance: true });
    const named = add("button", { name: "Knopf", entranceEffect: fade });
    const plain = add("button", {});
    const revealer = add("revealer", { button: { text: "ok", action: "none" } });
    const page = m.content.pages[m.pageId];
    const nodes = getPageLanes(page).flatMap((lane) => lane.nodes);
    const label = (id: string) => nodes.find((node) => node.id === id)?.label;
    expect(label(`script-run:${m.blockId}`)).toBe("Mein Skript");
    expect(label(`list-item:${list}:a`)).toBe(tr("ui.list_item", { n0: 1 }));
    expect(label(`list-item:${list}:b`)).toBe(tr("ui.list_item", { n0: 2 }));
    expect(label(`button-click:${named}`)).toBe(tr("ui.named_clicked", { n0: "Knopf" }));
    expect(nodes.find((node) => node.id === `button-click:${plain}`)).toBeDefined();
    expect("label" in (nodes.find((node) => node.id === `button-click:${plain}`) ?? {})).toBe(false);
    expect(label(`revealer-open:${revealer}`)).toBe(tr("ui.revealer_opens"));
    expect(label(`revealer-button:${revealer}`)).toBe(tr("ui.revealer_button_clicked"));
    // A lane of a block that appears starts with its Aufbau, joined to the events by dashed lines; a block that does not has the events alone.
    const lane = getPageLanes(page).find((candidate) => candidate.nodes.some((node) => node.id === `button-click:${named}`));
    expect(lane?.nodes.map((node) => node.id)).toEqual([`block-entrance:${named}`, `button-click:${named}`]);
    expect(lane?.edges).toEqual([{ from: `block-entrance:${named}`, to: `button-click:${named}`, kind: "unknown" }]);
    const bare = getPageLanes(page).find((candidate) => candidate.nodes.some((node) => node.id === `button-click:${plain}`));
    expect(bare?.nodes.map((node) => node.id)).toEqual([`button-click:${plain}`]);
    expect(bare?.edges).toEqual([]);
    expect(blockNameOf(m.content.pages[m.pageId].blocks[m.blockId])).toBe("Mein Skript");
  });

  it("have, for every block and every group, the Aufbau and the Abbau (pageEvents.ts): the ids, where the Aufbau is none, what a trigger can make happen", () => {
    const player = readFileSync("src/core/runtime/player.runtime.js", "utf8");
    // (The player makes the ids of a block's: "block-" and the phase.)
    expect(player).toContain('return "block-" + phase + ":" + blockId;');
    expect(effectEventId("block", "entrance", "b1")).toBe("block-entrance:b1");
    expect(effectEventId("block", "exit", "b1")).toBe("block-exit:b1");
    expect(effectEventId("group", "entrance", "g1")).toBe("group-entrance:g1");
    expect(effectEventId("group", "exit", "g1")).toBe("group-exit:g1");
    expect(blockEffectNodeId("b1", "entrance")).toBe("block-entrance:b1");
    expect(groupEffectNodeId("g1", "exit")).toBe("group-exit:g1");
    // (No prefix of theirs is a kind's own event.)
    const ownPrefixes = new Set(describedKinds().flatMap((kind) => (descriptorOf(kind)?.events ?? []).flatMap((spec) => [spec, ...(spec.companions ?? [])]).map((spec) => spec.idPrefix)));
    for (const phase of ["entrance", "exit"] as const) for (const of of ["block", "group"] as const) expect(ownPrefixes.has(effectEventSpecs[phase][of].idPrefix)).toBe(false);
    expect(triggerableEffectEventTypes().sort()).toEqual(["block-entrance", "block-exit", "group-entrance", "group-exit"]);
    for (const type of triggerableEffectEventTypes()) expect(TRIGGERABLE_EVENT_TYPES.has(type), type).toBe(true);

    const phases = (events: { phase: string }[]) => events.map((event) => event.phase);
    const off = { type: "off", durationMs: 400 };
    const text = make("text", { entranceEffect: fade, exitEffect: fade }).block;
    expect(effectEventsOf(text, ON).map((event) => event.id)).toEqual([`block-entrance:${text.id}`, `block-exit:${text.id}`]);
    Object.assign(text, { entranceEffect: off });
    expect(phases(effectEventsOf(text, ON))).toEqual(["exit"]);
    Object.assign(text, { entranceEffect: fade, exitEffect: off });
    expect(phases(effectEventsOf(text, ON))).toEqual(["entrance"]);
    // (Where an event of the block's own stands in for the Aufbau, it has none: a logic block's script, the items of a list - on a page.)
    const script = make("script", { entranceEffect: fade, exitEffect: fade }).block;
    expect(phases(effectEventsOf(script, ON))).toEqual(["exit"]);
    const list = make("list", { items: [{ id: "a", html: "<p>1</p>" }], entranceEffect: fade, exitEffect: off, itemEntrance: true }).block;
    expect(effectEventsOf(list, ON)).toEqual([]);
    expect(phases(effectEventsOf(list, OFF))).toEqual(["entrance"]);
    // (A group: each effect it has that is not "off".)
    expect(groupEffectEventsOf({ id: "g", entranceEffect: fade, exitEffect: fade }).map((event) => event.id)).toEqual(["group-entrance:g", "group-exit:g"]);
    expect(groupEffectEventsOf({ id: "g", entranceEffect: off, exitEffect: fade }).map((event) => event.id)).toEqual(["group-exit:g"]);
    expect(groupEffectEventsOf({ id: "g", entranceEffect: fade, exitEffect: off }).map((event) => event.id)).toEqual(["group-entrance:g"]);
    expect(groupEffectEventsOf({ id: "g" })).toEqual([]);
    expect(groupEffectEventsOf({ id: "g", entranceEffect: null, exitEffect: undefined })).toEqual([]);
  });

  it("have the short names `weft edit` knows them by (cliAlias): each one once, made into the id the specs give, written down in the docs of both languages", () => {
    const names = eventAliasNames().sort();
    expect(names).toEqual(["action", "click", "entrance", "exit", "group-entrance", "group-exit", "list-item", "quiz-correct", "quiz-fill", "quiz-incorrect", "quiz-submit", "revealer-button", "revealer-open", "script-run", "video-end", "video-resume", "video-start", "video-stop"]);
    // (Every alias of a spec is its own: one name for one event.)
    const specs = describedKinds().flatMap((kind) => (descriptorOf(kind)?.events ?? []).flatMap((spec) => [spec, ...(spec.companions ?? [])]));
    const given = [...new Set(specs)].map((spec) => spec.cliAlias).filter(Boolean);
    expect(new Set(given).size).toBe(given.length);
    // The id made of the name and what follows it: the block (a name, an alias or an id: here the block is given by `b:` + the name), the item for an event of items.
    const blockOf = (ref: string) => `B(${ref})`;
    const id = (alias: string, rest: string) => eventIdOfAlias(alias, rest, blockOf);
    expect(id("entrance", "x")).toBe("block-entrance:B(x)");
    expect(id("exit", "x")).toBe("block-exit:B(x)");
    expect(id("action", "x:e1")).toBe("block-action:B(x):e1");
    expect(id("group-entrance", "g1")).toBe("group-entrance:g1");
    expect(id("group-exit", "g1")).toBe("group-exit:g1");
    expect(id("click", "x")).toBe("button-click:B(x)");
    expect(id("revealer-open", "x")).toBe("revealer-open:B(x)");
    expect(id("revealer-button", "x")).toBe("revealer-button:B(x)");
    expect(id("list-item", "x:i1")).toBe("list-item:B(x):i1");
    expect(id("list-item", "x")).toBe("list-item:B(x)");
    expect(id("video-start", "x")).toBe("video-start:B(x)");
    expect(id("video-end", "x")).toBe("video-end:B(x)");
    expect(id("video-stop", "x:s1")).toBe("video-stop:B(x):s1");
    expect(id("video-resume", "x:s1")).toBe("video-resume:B(x):s1");
    expect(id("quiz-fill", "x")).toBe("quiz-fill:B(x)");
    expect(id("quiz-submit", "x")).toBe("quiz-submit:B(x)");
    expect(id("quiz-correct", "x")).toBe("quiz-submit:B(x):richtig");
    expect(id("quiz-incorrect", "x")).toBe("quiz-submit:B(x):falsch");
    expect(id("script-run", "x")).toBe("script-run:B(x)");
    expect(id("gibt-es-nicht", "x")).toBeUndefined();
    // (The ids are the ones the editor's functions give.)
    expect(id("video-resume", "b:s1")).toBe(videoResumeNodeId("B(b)", "s1"));
    expect(id("quiz-correct", "b")).toBe(quizSubmitNodeId("B(b)", "richtig"));
    // `weft edit` takes them: a trigger from the click on a button to the Aufbau of a text, from a right answer to its Abbau - the blocks by the name an operation gave them.
    const m = moduleWith("text", false);
    const run = (ops: object[]) => runOperations(m.content, [
      { op: "add_block", page: m.pageId, kind: "text", set: { entranceEffect: fade, exitEffect: fade }, as: "t" },
      { op: "add_block", page: m.pageId, kind: "button", set: {}, as: "btn" },
      { op: "add_block", page: m.pageId, kind: "quiz", set: {}, as: "q" },
      ...ops,
    ] as never);
    const page = m.content.pages[m.pageId];
    const triggerIds = () => Object.values(page.timeline.triggers).map((t) => `${t.from} > ${t.to}`);
    const made = run([{ op: "add_trigger", page: m.pageId, from: "click:$btn", to: "entrance:$t" }, { op: "add_trigger", page: m.pageId, from: "quiz-correct:$q", to: "exit:$t" }]);
    const [text, button, quiz] = made.results.slice(0, 3).map((result) => result.result.block as string);
    expect(triggerIds()).toContain(`button-click:${button} > block-entrance:${text}`);
    expect(triggerIds()).toContain(`quiz-submit:${quiz}:richtig > block-exit:${text}`);
    // (The "Nächste Folie" of an outcome is no event of a block: its own name.)
    const ended = run([{ op: "add_trigger", page: m.pageId, from: "quiz-correct-end:$q", to: "entrance:$t" }, { op: "add_trigger", page: m.pageId, from: "quiz-incorrect-end:$q", to: "exit:$t" }]);
    const [, , quiz2] = ended.results.slice(0, 3).map((result) => result.result.block as string);
    expect(triggerIds()).toContain(`end:quiz:${quiz2}:richtig > block-entrance:${ended.results[0].result.block}`);
    expect(triggerIds()).toContain(`end:quiz:${quiz2}:falsch > block-exit:${ended.results[0].result.block}`);
    // The docs name every one of them, and the two "Nächste Folie" of a quiz's outcomes, in German and in English.
    for (const file of ["docs/operations.md", "docs/operations.en.md"]) {
      const text = readFileSync(file, "utf8");
      for (const name of [...names, "quiz-correct-end", "quiz-incorrect-end"]) expect(text, `${file}: ${name}`).toContain(`"${name}:<`);
    }
  });

  it("have a look each in the editor: every type a spec can give has a title and an icon; so has every type of the timeline", () => {
    const specs = describedKinds().flatMap((kind) => descriptorOf(kind)?.events ?? []);
    const typesOf = (spec: (typeof specs)[number]): string[] => [
      ...(spec.timelineTypes ?? (typeof spec.timelineType === "string" ? [spec.timelineType] : [])),
      ...(spec.companions ?? []).flatMap(typesOf),
    ];
    const given = new Set(specs.flatMap(typesOf));
    // (The types of a task come from the registry: the four of a quiz.)
    for (const type of ["quiz-fill-start", "quiz-submit", "quiz-submit-correct", "quiz-submit-incorrect"] as const) given.add(type);
    for (const type of given) {
      const look = eventLookOf(type as never);
      expect(look, type).toBeDefined();
      expect(look!.label(), type).not.toBe("");
    }
    // (And the events of the page: Aufbau, Abbau, the Aktionseffekte, the condition - see the next test - so that every type of the timeline has one.)
    const all = ["quiz-fill-start", "quiz-submit", "quiz-submit-correct", "quiz-submit-incorrect", "video-start-auto", "video-start-manual", "video-stop-point", "video-resume", "video-end-loop", "video-end-stop", "block-entrance", "block-exit", "block-action-move", "block-action-shake", "block-action-blink", "button-click", "group-entrance", "group-exit", "list-item-entrance", "script-run", "revealer-open", "revealer-button", "variable-condition"];
    for (const type of all) expect(eventLookOf(type as never)?.label(), type).toBeTruthy();
  });

  it("have the colour they had before the descriptors named it, and the learner does the violet ones the graph lets happen at any time", () => {
    const violet = ["quiz-fill-start", "quiz-submit", "quiz-submit-correct", "quiz-submit-incorrect", "button-click", "revealer-button", "video-resume", "video-start-auto", "video-start-manual"];
    const yellow = ["block-entrance", "block-exit", "group-entrance", "group-exit", "block-action-move", "block-action-shake", "block-action-blink", "list-item-entrance"];
    const green = ["script-run", "variable-condition"];
    const blue = ["revealer-open", "video-stop-point", "video-end-loop", "video-end-stop"];
    for (const [color, types] of Object.entries({ violet, yellow, green, blue })) for (const type of types) expect(eventLookOf(type as never)?.color, type).toBe(color);
    // (Only a video's start has another colour once a trigger leads to it.)
    for (const type of [...violet, ...yellow, ...green, ...blue]) expect(eventLookOf(type as never)?.triggeredColor, type).toBe(type.startsWith("video-start") ? "blue" : undefined);
    // (What the learner does and nothing else can make happen: the reachability of the graph starts from these.)
    const learner = [...violet, ...yellow, ...green, ...blue].filter((type) => eventLookOf(type as never)?.byLearner);
    expect(learner.sort()).toEqual(["button-click", "quiz-fill-start", "quiz-submit", "quiz-submit-correct", "quiz-submit-incorrect", "revealer-button"]);
  });

  it("show what they showed before the descriptors named them: title, hint and icon of every type (the 15 of the blocks and the 8 of the page)", () => {
    const expected: Record<string, [string, string | undefined, string]> = {
      "quiz-fill-start": ["ui.fill_in", "ui.happens_as_soon_as_the_learner_2", "cursor"],
      "quiz-submit": ["ui.quiz_submitted", "ui.happens_as_soon_as_the_quiz", "accept"],
      "quiz-submit-correct": ["ui.quiz_submitted", "ui.happens_as_soon_as_the_quiz_2", "accept"],
      "quiz-submit-incorrect": ["ui.quiz_submitted", "ui.happens_as_soon_as_the_quiz_3", "decline"],
      "video-start-auto": ["ui.start_of_the_video", undefined, "video"],
      "video-start-manual": ["ui.start_of_the_video", undefined, "play"],
      "video-stop-point": ["ui.time_mark_2", "ui.happens_as_soon_as_playback_reaches", "stop-point"],
      "video-resume": ["ui.video_continues_2", "ui.happens_as_soon_as_the_learner_3", "play"],
      "video-end-loop": ["ui.end_of_the_video", "ui.never_happens_the_video_runs_in", "infinity"],
      "video-end-stop": ["ui.end_of_the_video", "ui.happens_as_soon_as_the_video", "stop"],
      "button-click": ["ui.button_clicked", "ui.happens_as_soon_as_the_learner", "cursor"],
      "revealer-open": ["ui.revealer_opens", undefined, "info"],
      "revealer-button": ["ui.revealer_button_clicked", "ui.revealer_button_hint", "hand"],
      "list-item-entrance": ["ui.list_item_3", undefined, "animation"],
      "script-run": ["ui.script_block", undefined, "gear"],
      // (The events of the page - Aufbau, Abbau, the Aktionseffekte, the condition: pageEvents.ts.)
      "block-entrance": ["ui.appears", undefined, "animation"],
      "block-exit": ["ui.disappears", undefined, "dashing-away"],
      "group-entrance": ["ui.group_appears", undefined, "animation"],
      "group-exit": ["ui.group_disappears", undefined, "dashing-away"],
      "block-action-move": ["ui.action_move_event", undefined, "action-move"],
      "block-action-shake": ["ui.action_shake_event", undefined, "action-shake"],
      "block-action-blink": ["ui.action_blink_event", undefined, "action-blink"],
      "variable-condition": ["ui.condition_event_label", undefined, "condition"],
    };
    for (const [type, [label, hint, icon]] of Object.entries(expected)) {
      const look = eventLookOf(type as never);
      expect(look?.label(), type).toBe(tr(label as never));
      expect(look?.hint?.(), type).toBe(hint === undefined ? undefined : tr(hint as never));
      expect(look?.icon, type).toBe(icon);
    }
  });
});
