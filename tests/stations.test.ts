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
      return `<p>Beispiel ${name}</p>`;
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
    case "asset":
      return ids.asset;
    case "list": {
      const item = (n: number) => {
        const made = spec.newItem(ids.asset);
        for (const [itemName, itemSpec] of Object.entries(spec.item)) {
          if (itemSpec.type === "text") made[itemName] = `Beispiel ${name} ${n}`;
          if (itemSpec.type === "html") made[itemName] = `<p>Beispiel ${name} ${n}</p>`;
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
    const expected = [
      ...exportedTexts(block).filter((text) => hasWords(text.value)).map((text) => `${block.id}#${text.part}`),
      ...exportedItemTexts(block).filter((text) => hasWords(text.value)).map((text) => `${block.id}#item:${text.itemId}`),
    ];
    expect(mine.map((item) => item.key).sort()).toEqual(expected.sort());
    expect(collectTexts(content).filter((entry) => entry.block.id === block.id).length).toBe(expected.length);

    for (const item of mine) item.translations[EN] = `EN ${item.source}`;
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
  const TYPES = ["text", "html", "choice", "number", "bool", "int", "effects", "asset", "list"];

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

  it("has its {{variables}} found - in every language - and checked", () => {
    const m = made();
    Object.assign(m.content.pages[m.pageId].blocks[m.blockId], { html: "<p>{{punkte}} und {{gibtesnicht}}</p>" }, fieldHtmlPatch(m.now, "html", EN, DE, "<p>{{ punkte }} in English</p>"));
    expect(placeholderSources(m.now)).toEqual(["<p>{{punkte}} und {{gibtesnicht}}</p>", "<p>{{ punkte }} in English</p>"]);
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
