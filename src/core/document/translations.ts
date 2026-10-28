import { descriptorOf, fieldsOf, itemTextName, listFieldsOf } from "../blocks/registry";
import type { FieldSpec } from "../blocks/types";
import type { Block, BlockTranslation, ButtonBlock, CheckerBlock, SolutionBlock, ClozeBlock, LinkBlock, GalleryBlock, MatchItem, MatchingBlock, ListBlock, QuizBlock, RevealerBlock, SortBlock, SortItem, TextBlock, WeftModule } from "../types";

/**
 * Per-language wording of the blocks that carry text (text, quiz, button). The block's own fields
 * ARE the default language's wording; every other language only has a BlockTranslation entry for
 * what was actually translated (see BlockTranslation in types.ts), and anything missing is shown in
 * the default wording instead. A `null` language means "not multilingual" and always reads the
 * block's own fields.
 */

type Translatable = TextBlock | QuizBlock | ButtonBlock | LinkBlock | CheckerBlock | SolutionBlock | MatchingBlock | SortBlock | GalleryBlock | ListBlock | ClozeBlock;
type Translations = Record<string, BlockTranslation> | undefined;

export function defaultLanguageOf(languages: readonly string[]): string | null {
  return languages[0] ?? null;
}

/** `wanted` if the module offers it, else the module's default language (null for a module that
 * has none) - the language an editing view or the player actually uses. */
export function effectiveLanguage(languages: readonly string[], wanted: string | null | undefined): string | null {
  if (wanted && languages.includes(wanted)) return wanted;
  return defaultLanguageOf(languages);
}

function isOwnWording(language: string | null, defaultLanguage: string | null): boolean {
  return language === null || language === defaultLanguage;
}

function translationOf(translations: Translations, language: string | null, defaultLanguage: string | null) {
  return isOwnWording(language, defaultLanguage) || !language ? undefined : translations?.[language];
}

export function textHtml(block: TextBlock | ClozeBlock, language: string | null, defaultLanguage: string | null): string {
  return translationOf(block.translations, language, defaultLanguage)?.html ?? block.html;
}

export function quizQuestionHtml(block: QuizBlock, language: string | null, defaultLanguage: string | null): string {
  return translationOf(block.translations, language, defaultLanguage)?.questionHtml ?? block.questionHtml;
}

export function quizOptionHtml(
  block: QuizBlock,
  optionId: string,
  language: string | null,
  defaultLanguage: string | null,
): string {
  const own = block.options.find((o) => o.id === optionId)?.html ?? "";
  return translationOf(block.translations, language, defaultLanguage)?.options?.[optionId] ?? own;
}

export function listItemHtml(block: ListBlock, itemId: string, language: string | null, defaultLanguage: string | null): string {
  const own = block.items.find((item) => item.id === itemId)?.html ?? "";
  return translationOf(block.translations, language, defaultLanguage)?.items?.[itemId] ?? own;
}

/** The words of a card of a matching in `language`: its translation if there is one, else the card's own (the default language's). */
export function matchingItemText(block: MatchingBlock, item: MatchItem, language: string | null, defaultLanguage: string | null): string {
  return translationOf(block.translations, language, defaultLanguage)?.items?.[item.id] ?? item.text;
}

/** The patch that sets the words of a card in `language`: into the card itself for the default language, into the translations for another. */
export function matchingItemTextPatch(block: MatchingBlock, itemId: string, language: string | null, defaultLanguage: string | null, text: string): Partial<MatchingBlock> {
  if (isOwnWording(language, defaultLanguage) || !language) {
    const set = (items: MatchItem[]) => items.map((item) => (item.id === itemId ? { ...item, text } : item));
    return { sources: set(block.sources), targets: set(block.targets) };
  }
  const existing = block.translations?.[language] ?? {};
  return { translations: { ...block.translations, [language]: { ...existing, items: { ...existing.items, [itemId]: text } } } };
}

/** The words of an object of a sorting puzzle in `language`: its translation if there is one, else the object's own (the default language's). */
export function sortItemText(block: SortBlock, item: SortItem, language: string | null, defaultLanguage: string | null): string {
  return translationOf(block.translations, language, defaultLanguage)?.items?.[item.id] ?? item.text;
}

export function sortItemTextPatch(block: SortBlock, itemId: string, language: string | null, defaultLanguage: string | null, text: string): Partial<SortBlock> {
  if (isOwnWording(language, defaultLanguage) || !language) {
    return { items: block.items.map((item) => (item.id === itemId ? { ...item, text } : item)) };
  }
  const existing = block.translations?.[language] ?? {};
  return { translations: { ...block.translations, [language]: { ...existing, items: { ...existing.items, [itemId]: text } } } };
}

/**
 * The words of an item of a list of a block that describes itself (a gallery's caption) in `language`: its translation if there is one, else the
 * item's own (the default language's).
 */
export function itemWording(block: Block, listName: string, itemId: string, language: string | null, defaultLanguage: string | null): string {
  const textName = itemTextNameOf(block, listName);
  const own = textName ? ((listItems(block, listName).find((item) => item.id === itemId)?.[textName] as string | undefined) ?? "") : "";
  return translationOf((block as Translatable).translations, language, defaultLanguage)?.items?.[itemId] ?? own;
}

export function itemWordingPatch(block: Block, listName: string, itemId: string, language: string | null, defaultLanguage: string | null, text: string): Partial<Block> {
  const textName = itemTextNameOf(block, listName);
  if (!textName) return {};
  if (isOwnWording(language, defaultLanguage) || !language) {
    return { [listName]: listItems(block, listName).map((item) => (item.id === itemId ? { ...item, [textName]: text } : item)) } as Partial<Block>;
  }
  const translations = (block as Translatable).translations;
  const existing = translations?.[language] ?? {};
  return { translations: { ...translations, [language]: { ...existing, items: { ...existing.items, [itemId]: text } } } } as Partial<Block>;
}

function listItems(block: Block, listName: string): ({ id: string } & Record<string, unknown>)[] {
  return ((block as unknown as Record<string, unknown>)[listName] as ({ id: string } & Record<string, unknown>)[] | undefined) ?? [];
}

function itemTextNameOf(block: Block, listName: string): string | undefined {
  const spec = (descriptorOf(block)?.fields as Record<string, FieldSpec | undefined> | undefined)?.[listName];
  return spec?.type === "list" ? itemTextName(spec) : undefined;
}

/** The words at the start / the end of the line of a sorting puzzle in `language`. */
export function sortLabel(block: SortBlock, which: "start" | "end", language: string | null, defaultLanguage: string | null): string {
  const translated = translationOf(block.translations, language, defaultLanguage);
  return (which === "start" ? translated?.startLabel ?? block.startLabel : translated?.endLabel ?? block.endLabel) ?? "";
}

export function sortLabelPatch(block: SortBlock, which: "start" | "end", language: string | null, defaultLanguage: string | null, text: string): Partial<SortBlock> {
  const key = which === "start" ? "startLabel" : "endLabel";
  if (isOwnWording(language, defaultLanguage) || !language) return { [key]: text };
  return { translations: { ...block.translations, [language]: { ...(block.translations?.[language] ?? {}), [key]: text } } };
}

/**
 * The wording of a translatable text field of a block that describes itself (see blocks/registry.ts) in `language`: its translation if there is
 * one, else the block's own (the default language's).
 */
export function fieldWording(block: Block, name: string, language: string | null, defaultLanguage: string | null): string {
  const key = wordingKey(block, name);
  const own = (block as unknown as Record<string, string | undefined>)[name] ?? "";
  return (translationOf((block as Translatable).translations, language, defaultLanguage)?.[key] as string | undefined) ?? own;
}

export function fieldWordingPatch(block: Block, name: string, language: string | null, defaultLanguage: string | null, text: string): Partial<Block> {
  const key = wordingKey(block, name);
  return wordingPatch(block as Translatable, language, defaultLanguage, { [name]: text } as Partial<Translatable>, (t) => ({ ...t, [key]: text })) as Partial<Block>;
}

/**
 * The formatted words (HTML) of a text field that has a formatted variant (a button's label; see TextField.formatted) in `language`: its translation's
 * formatting, else its translation's plain words escaped, else the block's own formatting - a text that was never formatted is its plain words.
 */
export function fieldHtml(block: Block, name: string, language: string | null, defaultLanguage: string | null): string {
  const key = wordingKey(block, name);
  const formatted = formattedOf(block, name);
  const own = block as unknown as Record<string, string | undefined>;
  const translation = translationOf((block as Translatable).translations, language, defaultLanguage);
  if (translation?.html !== undefined) return translation.html;
  const plain = translation?.[key] as string | undefined;
  if (plain !== undefined) return escapeHtml(plain);
  return (formatted ? own[formatted] : undefined) ?? escapeHtml(own[name] ?? "");
}

/** The patch that stores formatted words as the wording in `language` (their plain words with them): into the block for the default language. */
export function fieldHtmlPatch(block: Block, name: string, language: string | null, defaultLanguage: string | null, html: string): Partial<Block> {
  const key = wordingKey(block, name);
  const formatted = formattedOf(block, name) ?? "html";
  const text = plainTextOfHtml(html);
  return wordingPatch(block as Translatable, language, defaultLanguage, { [formatted]: html, [name]: text } as Partial<Translatable>, (t) => ({ ...t, html, [key]: text })) as Partial<Block>;
}

function formattedOf(block: Block, name: string): string | undefined {
  const spec = descriptorOf(block)?.fields[name as never] as FieldSpec | undefined;
  return spec?.type === "text" ? spec.formatted : undefined;
}

/** The key in a BlockTranslation where the wording of a field is kept. */
function wordingKey(block: Block, name: string): keyof BlockTranslation {
  const spec = descriptorOf(block)?.fields[name as never] as FieldSpec | undefined;
  return (spec?.type === "text" && spec.translationKey) || (name as keyof BlockTranslation);
}

/** The translatable text fields of a block that describes itself: their names and the keys of their wording in a translation. */
function translatableFields(block: Block): { name: string; key: keyof BlockTranslation; formatted?: string }[] {
  return fieldsOf(block)
    .filter(([, spec]) => spec.type === "text" && spec.translatable)
    .map(([name, spec]) => ({ name, key: wordingKey(block, name), formatted: spec.type === "text" ? spec.formatted : undefined }));
}

/** The presenter notes of a page in `language` (see Page.notes): the translation if there is one, else the default language's. */
export function pageNotes(page: { notes?: string; notesTranslations?: Record<string, string> }, language: string | null, defaultLanguage: string | null): string {
  if (isOwnWording(language, defaultLanguage) || !language) return page.notes ?? "";
  return page.notesTranslations?.[language] ?? page.notes ?? "";
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The words of some html, without its formatting (paragraphs and line breaks become a space). */
export function plainTextOfHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Whether the block's main text has its own wording in `language` - always true for the default
 * language (it IS the block's own wording). Drives the "not translated yet" hint. */
export function isTranslated(block: Translatable, language: string | null, defaultLanguage: string | null): boolean {
  if (isOwnWording(language, defaultLanguage) || !language) return true;
  const translation = block.translations?.[language];
  if (block.kind === "text" || block.kind === "cloze") return translation?.html !== undefined;
  if (block.kind === "quiz") return translation?.questionHtml !== undefined;
  if (block.kind === "list") return block.items.length === 0 || translation?.items?.[block.items[0].id] !== undefined;
  if (block.kind === "matching") {
    const first = block.sources[0] ?? block.targets[0];
    return !first || translation?.items?.[first.id] !== undefined;
  }
  if (descriptorOf(block)) {
    // (Every text of the block that has words has to be there in the language.)
    const own = block as unknown as Record<string, string | undefined>;
    const textsThere = translatableFields(block).every(
      ({ name, key, formatted }) => (own[name] ?? "").trim() === "" || translation?.[key] !== undefined || (!!formatted && translation?.html !== undefined),
    );
    // (And the first item of every list: the others are translated with it, as with a list or a matching.)
    const itemsThere = listFieldsOf(block).every(([name]) => {
      const first = listItems(block, name)[0];
      return !first || translation?.items?.[first.id] !== undefined;
    });
    return textsThere && itemsThere;
  }
  if (block.kind === "sort") return block.items.length === 0 || translation?.items?.[block.items[0].id] !== undefined;
  return translation?.text !== undefined || translation?.html !== undefined;
}

/** The patch that stores `fields` as the wording in `language`: into the block's own fields for the
 * default language (`own`), into its translations entry for any other one. */
function wordingPatch(
  block: Translatable,
  language: string | null,
  defaultLanguage: string | null,
  own: Partial<Translatable>,
  translated: (existing: BlockTranslation) => BlockTranslation,
): Partial<Translatable> {
  if (isOwnWording(language, defaultLanguage) || !language) return own;
  const translations = { ...block.translations, [language]: translated(block.translations?.[language] ?? {}) };
  return { translations };
}

export function textHtmlPatch(block: TextBlock, language: string | null, defaultLanguage: string | null, html: string): Partial<TextBlock>;
export function textHtmlPatch(block: ClozeBlock, language: string | null, defaultLanguage: string | null, html: string): Partial<ClozeBlock>;
export function textHtmlPatch(block: TextBlock | ClozeBlock, language: string | null, defaultLanguage: string | null, html: string) {
  return wordingPatch(block, language, defaultLanguage, { html }, (t) => ({ ...t, html }));
}

/** The explanation a quiz tells after submitting (plain text) in `language`. */
export function quizExplanation(block: QuizBlock, language: string | null, defaultLanguage: string | null): string {
  return translationOf(block.translations, language, defaultLanguage)?.explanation ?? block.explanation ?? "";
}

export function quizExplanationPatch(block: QuizBlock, language: string | null, defaultLanguage: string | null, text: string) {
  return wordingPatch(block, language, defaultLanguage, { explanation: text }, (t) => ({ ...t, explanation: text })) as Partial<QuizBlock>;
}

export function quizQuestionPatch(block: QuizBlock, language: string | null, defaultLanguage: string | null, html: string) {
  return wordingPatch(block, language, defaultLanguage, { questionHtml: html }, (t) => ({
    ...t,
    questionHtml: html,
  })) as Partial<QuizBlock>;
}

export function quizOptionPatch(
  block: QuizBlock,
  optionId: string,
  language: string | null,
  defaultLanguage: string | null,
  html: string,
) {
  return wordingPatch(
    block,
    language,
    defaultLanguage,
    { options: block.options.map((o) => (o.id === optionId ? { ...o, html } : o)) },
    (t) => ({ ...t, options: { ...t.options, [optionId]: html } }),
  ) as Partial<QuizBlock>;
}

export function listItemPatch(
  block: ListBlock,
  itemId: string,
  language: string | null,
  defaultLanguage: string | null,
  html: string,
) {
  return wordingPatch(
    block,
    language,
    defaultLanguage,
    { items: block.items.map((item) => (item.id === itemId ? { ...item, html } : item)) },
    (t) => ({ ...t, items: { ...t.items, [itemId]: html } }),
  ) as Partial<ListBlock>;
}

/**
 * The patch for pressing Enter in item `itemId` of a list: the item keeps `beforeHtml` and a new item `newItemId` right after it holds
 * `afterHtml`. In another language than the default one the wording goes to that language's entry (and the new item's own wording -
 * the default's - is the same text, which is what an untranslated item shows anyway).
 */
export function listSplitPatch(
  block: ListBlock,
  itemId: string,
  newItemId: string,
  language: string | null,
  defaultLanguage: string | null,
  beforeHtml: string,
  afterHtml: string,
): Partial<ListBlock> {
  const own = isOwnWording(language, defaultLanguage) || !language;
  const items: ListBlock["items"] = [];
  for (const item of block.items) {
    items.push(own && item.id === itemId ? { ...item, html: beforeHtml } : item);
    if (item.id === itemId) items.push({ id: newItemId, html: afterHtml });
  }
  if (own) return { items };
  const existing = block.translations?.[language] ?? {};
  const translated = { ...existing.items, [itemId]: beforeHtml, [newItemId]: afterHtml };
  return { items, translations: { ...block.translations, [language]: { ...existing, items: translated } } };
}

/**
 * The patch for joining item `removeId` of a list with item `keepId` (the text of the one that goes is already in `mergedHtml`, the
 * wording of the one that stays): `removeId` is gone, `keepId` holds `mergedHtml`.
 */
export function listMergePatch(
  block: ListBlock,
  keepId: string,
  removeId: string,
  language: string | null,
  defaultLanguage: string | null,
  mergedHtml: string,
): Partial<ListBlock> {
  const own = isOwnWording(language, defaultLanguage) || !language;
  const items = block.items.filter((item) => item.id !== removeId).map((item) => (own && item.id === keepId ? { ...item, html: mergedHtml } : item));
  if (own) return { items };
  const existing = block.translations?.[language] ?? {};
  const translated = { ...existing.items, [keepId]: mergedHtml };
  delete translated[removeId];
  return { items, translations: { ...block.translations, [language]: { ...existing, items: translated } } };
}

/** The words of a revealer in `language`: what it has in that language, else the block's own wording (the default language's). */
export interface RevealerWording {
  title: string;
  body: string;
  imageAlt: string;
  buttonText: string;
}

export function revealerWording(block: RevealerBlock, language: string | null, defaultLanguage: string | null): RevealerWording {
  const t = isOwnWording(language, defaultLanguage) || !language ? undefined : block.translations?.[language];
  return {
    title: t?.title ?? block.title,
    body: t?.body ?? block.body,
    imageAlt: t?.alt ?? block.imageAlt,
    buttonText: t?.text ?? block.button?.text ?? "",
  };
}

/** The patch that stores some of a revealer's words in `language`: into the block's own fields for the default language, into its translations
 * entry for any other one. */
export function revealerWordingPatch(
  block: RevealerBlock,
  language: string | null,
  defaultLanguage: string | null,
  fields: Partial<RevealerWording>,
): Partial<RevealerBlock> {
  if (isOwnWording(language, defaultLanguage) || !language) {
    const own: Partial<RevealerBlock> = {};
    if (fields.title !== undefined) own.title = fields.title;
    if (fields.body !== undefined) own.body = fields.body;
    if (fields.imageAlt !== undefined) own.imageAlt = fields.imageAlt;
    if (fields.buttonText !== undefined && block.button) own.button = { ...block.button, text: fields.buttonText };
    return own;
  }
  const existing = block.translations?.[language] ?? {};
  const next: BlockTranslation = { ...existing };
  if (fields.title !== undefined) next.title = fields.title;
  if (fields.body !== undefined) next.body = fields.body;
  if (fields.imageAlt !== undefined) next.alt = fields.imageAlt;
  if (fields.buttonText !== undefined) next.text = fields.buttonText;
  return { translations: { ...block.translations, [language]: next } };
}

/**
 * The default language changed (a different one was dragged to the top, or the default was
 * removed): the blocks' own fields must hold the NEW default's wording, so swap them with its
 * translation - the old default's wording moves into its own translations entry (which then also
 * keeps it should the language stay in the list, or be added back later). Wording the new default
 * has no translation for stays as it is, the nearest thing to fall back on. Mutates `content` (an
 * immer draft, inside an edit()).
 */
export function rotateDefaultLanguage(content: WeftModule, oldDefault: string, newDefault: string): void {
  const blocks = [
    ...Object.values(content.pages).flatMap((page) => Object.values(page.blocks)),
    ...Object.values(content.layouts).flatMap((layout) => Object.values(layout.blocks)),
  ];
  for (const block of blocks) {
    if (block.kind === "revealer") {
      // The words of a revealer swap with the translation of the new default like any other block's.
      const incomingWords = block.translations?.[newDefault];
      const outgoingWords: BlockTranslation = { title: block.title, body: block.body, alt: block.imageAlt };
      if (block.button) outgoingWords.text = block.button.text;
      if (incomingWords?.title !== undefined) block.title = incomingWords.title;
      if (incomingWords?.body !== undefined) block.body = incomingWords.body;
      if (incomingWords?.alt !== undefined) block.imageAlt = incomingWords.alt;
      if (block.button && incomingWords?.text !== undefined) block.button.text = incomingWords.text;
      block.translations = { ...block.translations, [oldDefault]: outgoingWords };
      delete block.translations[newDefault];
      continue;
    }
    if (descriptorOf(block)) {
      // A block that describes itself: the translatable texts swap, field for field - one without any has nothing to swap.
      if (translatableFields(block).length === 0 && listFieldsOf(block).length === 0) continue;
      const own = block as unknown as Record<string, string | undefined>;
      const incomingWords = (block as Translatable).translations?.[newDefault];
      const outgoingWords: BlockTranslation = {};
      for (const { name, key, formatted } of translatableFields(block)) {
        outgoingWords[key as "text"] = own[name] ?? "";
        const translated = incomingWords?.[key as "text"];
        if (formatted) {
          // (Formatted words: the formatting goes along where there is some - else the words it had are plain ones.)
          if (own[formatted] !== undefined) outgoingWords.html = own[formatted];
          if (incomingWords?.html !== undefined) {
            own[formatted] = incomingWords.html;
            own[name] = translated ?? plainTextOfHtml(incomingWords.html);
          } else if (translated !== undefined) {
            own[name] = translated;
            delete own[formatted];
          }
        } else if (translated !== undefined) own[name] = translated;
      }
      for (const [listName, spec] of listFieldsOf(block)) {
        const textName = itemTextName(spec);
        if (!textName) continue;
        const items = listItems(block, listName);
        outgoingWords.items = { ...outgoingWords.items, ...Object.fromEntries(items.map((item) => [item.id, (item[textName] as string | undefined) ?? ""])) };
        for (const item of items) {
          const translated = incomingWords?.items?.[item.id];
          if (translated !== undefined) item[textName] = translated;
        }
      }
      const translations = { ...(block as Translatable).translations, [oldDefault]: outgoingWords };
      delete translations[newDefault];
      (block as Translatable).translations = translations;
      continue;
    }
    if (block.kind !== "text" && block.kind !== "cloze" && block.kind !== "quiz" && block.kind !== "matching" && block.kind !== "sort" && block.kind !== "list") continue;
    const incoming = block.translations?.[newDefault];
    const outgoing: BlockTranslation = {};
    if (block.kind === "text" || block.kind === "cloze") {
      outgoing.html = block.html;
      if (incoming?.html !== undefined) block.html = incoming.html;
    } else if (block.kind === "matching") {
      const cards = [...block.sources, ...block.targets];
      outgoing.items = Object.fromEntries(cards.map((item) => [item.id, item.text]));
      for (const item of cards) {
        const translated = incoming?.items?.[item.id];
        if (translated !== undefined) item.text = translated;
      }
    } else if (block.kind === "sort") {
      outgoing.items = Object.fromEntries(block.items.map((item) => [item.id, item.text]));
      for (const item of block.items) {
        const translated = incoming?.items?.[item.id];
        if (translated !== undefined) item.text = translated;
      }
      outgoing.startLabel = block.startLabel ?? "";
      outgoing.endLabel = block.endLabel ?? "";
      if (incoming?.startLabel !== undefined) block.startLabel = incoming.startLabel;
      if (incoming?.endLabel !== undefined) block.endLabel = incoming.endLabel;
    } else if (block.kind === "list") {
      outgoing.items = Object.fromEntries(block.items.map((item) => [item.id, item.html]));
      for (const item of block.items) {
        const translated = incoming?.items?.[item.id];
        if (translated !== undefined) item.html = translated;
      }
    } else {
      outgoing.questionHtml = block.questionHtml;
      outgoing.options = Object.fromEntries(block.options.map((o) => [o.id, o.html]));
      if (incoming?.questionHtml !== undefined) block.questionHtml = incoming.questionHtml;
      if (block.explanation !== undefined) outgoing.explanation = block.explanation;
      if (incoming?.explanation !== undefined) block.explanation = incoming.explanation;
      for (const option of block.options) {
        const translated = incoming?.options?.[option.id];
        if (translated !== undefined) option.html = translated;
      }
    }
    block.translations = { ...block.translations, [oldDefault]: outgoing };
    delete block.translations[newDefault];
  }
}
