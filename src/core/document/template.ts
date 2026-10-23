import { createId } from "../id";
import type { WeftDocument } from "../types";
import { plain } from "./plain";
import { rotateDefaultLanguage } from "./translations";

/**
 * What opening a template (WeftModule.template) or an example that ships with Weft makes of it: a module of its own - a new id, new dates,
 * an editing history of its own (none is carried over) - that is not a template any more. It has no file yet, so the first "Speichern" asks
 * where to put it; the file it came from is never written.
 *
 * It opens in the language of whoever opens it: a template that has the texts in several languages gets the author's language (`language`,
 * "de" or "en" - the language of the interface) as its default language - the one its blocks are in and the editor shows - and keeps the
 * others as translations. A template without that language stays as it is. `title`: the module's title in that language, where the
 * template's catalogue knows one (a title has no translations of its own). Only a template (`template: true`) is adapted.
 */
export function copyOfTemplate(opened: WeftDocument, options: { language?: string; title?: string } = {}): WeftDocument {
  const now = new Date().toISOString();
  const isTemplate = opened.content.template === true;
  const content = { ...plain(opened.content), id: createId(), createdAt: now, modifiedAt: now };
  delete content.template;
  const languages = content.languages ?? [];
  // (Only a template is adapted: any other module that is opened as a copy - one an assistant made - keeps the languages the way it was made.)
  const wanted = isTemplate && options.language ? languages.find((locale) => locale.split("_")[0].toLowerCase() === options.language!.toLowerCase()) : undefined;
  if (wanted && wanted !== languages[0]) {
    rotateDefaultLanguage(content, languages[0], wanted);
    content.languages = [wanted, ...languages.filter((locale) => locale !== wanted)];
  }
  if (wanted && options.title) content.title = options.title;
  return { formatVersion: opened.formatVersion, content };
}
