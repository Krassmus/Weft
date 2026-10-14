import type { BlockTranslation, ButtonBlock, ClozeBlock, ListBlock, QuizBlock, TextBlock, WeftModule } from "../types";

/**
 * Per-language wording of the blocks that carry text (text, quiz, button). The block's own fields
 * ARE the default language's wording; every other language only has a BlockTranslation entry for
 * what was actually translated (see BlockTranslation in types.ts), and anything missing is shown in
 * the default wording instead. A `null` language means "not multilingual" and always reads the
 * block's own fields.
 */

type Translatable = TextBlock | QuizBlock | ButtonBlock | ListBlock | ClozeBlock;
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

export function buttonText(block: ButtonBlock, language: string | null, defaultLanguage: string | null): string {
  return translationOf(block.translations, language, defaultLanguage)?.text ?? block.text;
}

/** Whether the block's main text has its own wording in `language` - always true for the default
 * language (it IS the block's own wording). Drives the "not translated yet" hint. */
export function isTranslated(block: Translatable, language: string | null, defaultLanguage: string | null): boolean {
  if (isOwnWording(language, defaultLanguage) || !language) return true;
  const translation = block.translations?.[language];
  if (block.kind === "text" || block.kind === "cloze") return translation?.html !== undefined;
  if (block.kind === "quiz") return translation?.questionHtml !== undefined;
  if (block.kind === "list") return block.items.length === 0 || translation?.items?.[block.items[0].id] !== undefined;
  return translation?.text !== undefined;
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

export function buttonTextPatch(block: ButtonBlock, language: string | null, defaultLanguage: string | null, text: string) {
  return wordingPatch(block, language, defaultLanguage, { text }, (t) => ({ ...t, text })) as Partial<ButtonBlock>;
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
    if (block.kind !== "text" && block.kind !== "cloze" && block.kind !== "quiz" && block.kind !== "button" && block.kind !== "list") continue;
    const incoming = block.translations?.[newDefault];
    const outgoing: BlockTranslation = {};
    if (block.kind === "text" || block.kind === "cloze") {
      outgoing.html = block.html;
      if (incoming?.html !== undefined) block.html = incoming.html;
    } else if (block.kind === "button") {
      outgoing.text = block.text;
      if (incoming?.text !== undefined) block.text = incoming.text;
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
      for (const option of block.options) {
        const translated = incoming?.options?.[option.id];
        if (translated !== undefined) option.html = translated;
      }
    }
    block.translations = { ...block.translations, [oldDefault]: outgoing };
    delete block.translations[newDefault];
  }
}
