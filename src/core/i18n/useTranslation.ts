import { useResolvedLanguage } from "./languageStore";
import { fillParams } from "./tr";
import { translations } from "./translations";
import type { TranslationKey } from "./translations";

/** `t(key, params?)` for whichever language is currently resolved (see useResolvedLanguage); `{name}` in a string is replaced
 * by params.name. */
export function useTranslation(): {
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  lang: ReturnType<typeof useResolvedLanguage>;
} {
  const lang = useResolvedLanguage();
  return { t: (key, params) => fillParams(translations[lang][key], params), lang };
}
