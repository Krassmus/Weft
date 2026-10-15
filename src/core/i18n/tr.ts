import { resolveLanguage, useLanguageStore } from "./languageStore";
import { translations } from "./translations";
import type { Language, TranslationKey } from "./translations";

/**
 * `tr(key, params?)`: an interface string in the language the app is in right now - for code that is not a component (an action's
 * alert, a menu built in a function, the default text of a new block) and for strings inside components alike. Components that
 * show it are drawn again when the language changes (the roots of the windows watch it, see useResolvedLanguage), so a string
 * written with tr() follows the language like one written with t() of useTranslation. Do not keep the result in a module-level
 * constant - it would stay in the language it was made in.
 *
 * `{name}` in a string is replaced by params.name.
 */

let fixed: Language | null = null;

/** For programs without a settings window (the command line tool): this language, whatever the system says. */
export function setFixedLanguage(language: Language | null): void {
  fixed = language;
}

export function fillParams(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function tr(key: TranslationKey, params?: Record<string, string | number>): string {
  const language = fixed ?? resolveLanguage(useLanguageStore.getState().preference);
  return fillParams(translations[language][key], params);
}
