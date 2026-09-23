import { useResolvedLanguage } from "./languageStore";
import { translations } from "./translations";
import type { TranslationKey } from "./translations";

/** `t(key)` for whichever language is currently resolved (see useResolvedLanguage) - a plain
 * function, not a template-interpolating one, since every string here is static app chrome with
 * no variables to fill in; a key that needs one can grow that capability when it actually shows
 * up rather than speculatively now. */
export function useTranslation(): { t: (key: TranslationKey) => string; lang: ReturnType<typeof useResolvedLanguage> } {
  const lang = useResolvedLanguage();
  return { t: (key) => translations[lang][key], lang };
}
