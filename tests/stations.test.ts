import Ajv from "ajv";
import { parseHTML } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import schema from "../docs/weft.schema.json";
import { runOperations } from "../cli/ops";
import { setCurrentModule } from "../cli/storeStub";
import { collectTexts, exportTexts, importTexts } from "../cli/texts";
import { validate } from "../cli/validate";
import { describedKinds, descriptorOf, exportedItemTexts, exportedTexts, fieldsOf, isPageOnlyKind, isTaskBlock, listFieldsOf, shownWordings, variableWordings } from "../src/core/blocks/registry";
import type { BlockDescriptor, FieldSpec, ListField } from "../src/core/blocks/types";
import { pasteBlockInto } from "../src/core/document/actions";
import { clipboardEntryPlainText } from "../src/core/document/clipboard";
import { createEmptyDocument } from "../src/core/document/createEmptyDocument";
import { quizFillNodeId, quizSubmitNodeId } from "../src/core/document/pageTimeline";
import { fieldHtml, fieldHtmlPatch, fieldWording, fieldWordingPatch, isTranslated, itemWording, itemWordingPatch, rotateDefaultLanguage } from "../src/core/document/translations";
import { allowedSlips, clozeIsRight, levenshtein } from "../src/core/document/cloze";
import { usedAssetIds } from "../src/core/document/usedAssets";
import { placeholderSources, withProgress } from "../src/core/document/variablePlaceholders";
import { buildEventGraph } from "../src/core/eventGraph/buildEventGraph";
import { translations } from "../src/core/i18n/translations";
import { CURRENT_FORMAT_VERSION } from "../src/core/io/unpack";
import type { Block, WeftModule } from "../src/core/types";

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
  const made = runOperations(content, [{ op: "add_block", page: pageId, kind, ...(set ? { set } : {}) }]);
  const blockId = made.results[0].result.block as string;
  return { content, pageId, blockId, block: content.pages[pageId].blocks[blockId] as Block, descriptor, variable };
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
      Object.assign(content.pages[pageId].blocks[blockId], wording.patch(EN, `EN ${wording.what}`));
    }
    const written = content.pages[pageId].blocks[blockId] as Block;
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
    for (const wording of wordings(block)) Object.assign(content.pages[pageId].blocks[blockId], wording.patch(EN, `EN ${wording.what}`));
    const read = () => wordings(content.pages[pageId].blocks[blockId] as Block).map((wording) => [wording.what, wording.own, wording.read(EN)]);
    const before = read();
    rotateDefaultLanguage(content, DE, EN);
    // (EN is the default now: its words are the block's own.)
    const rotated = wordings(content.pages[pageId].blocks[blockId] as Block);
    for (const wording of rotated) expect(wording.own, wording.what).toBe(`EN ${wording.what}`);
    rotateDefaultLanguage(content, EN, DE);
    expect(read()).toEqual(before);
  });

  it("are left alone when the block has none (no translations are made for a block without words)", () => {
    const { block, content, pageId, blockId } = moduleWith(kind, true);
    if (wordings(block).length > 0) return;
    rotateDefaultLanguage(content, DE, EN);
    expect((content.pages[pageId].blocks[blockId] as { translations?: unknown }).translations).toBeUndefined();
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

    const imported = content.pages[pageId].blocks[blockId] as Block;
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
    quiz.correctOptionIds = [quiz.options[0].id];
    expect(descriptorOf("quiz")!.summary!(m.block as never, { labels: {} })).toMatch(/\[2 Optionen, 1 richtig\]$/);
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
