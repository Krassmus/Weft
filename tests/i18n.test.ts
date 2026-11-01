import { describe, expect, it } from "vitest";
import { systemLanguage } from "../src/core/i18n/languageStore";
import { fillParams } from "../src/core/i18n/tr";
import { LANGUAGES, LANGUAGE_LOCALES, LANGUAGE_NAMES, translations } from "../src/core/i18n/translations";
import type { TranslationKey } from "../src/core/i18n/translations";

const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
const tags = (text: string) => (text.match(/<\/?[a-z0-9]+>/g) ?? []).sort();
const keys = Object.keys(translations.en) as TranslationKey[];

describe("interface languages", () => {
  it("every language has a name and a locale", () => {
    for (const language of LANGUAGES) {
      expect(LANGUAGE_NAMES[language]).toBeTruthy();
      expect(() => new Intl.DateTimeFormat(LANGUAGE_LOCALES[language])).not.toThrow();
    }
  });

  for (const language of LANGUAGES) {
    describe(language, () => {
      const table = translations[language];

      it("has exactly the keys of the English set", () => {
        expect(Object.keys(table).sort()).toEqual([...keys].sort());
      });

      it("has no empty text", () => {
        expect(keys.filter((key) => !table[key].trim())).toEqual([]);
      });

      it("keeps {placeholders}, line breaks and tags of the English text", () => {
        const broken = keys.filter(
          (key) =>
            placeholders(table[key]).join() !== placeholders(translations.en[key]).join() ||
            table[key].split("\n").length !== translations.en[key].split("\n").length ||
            tags(table[key]).join() !== tags(translations.en[key]).join(),
        );
        expect(broken).toEqual([]);
      });
    });
  }

  it("fills in the parameters of a translated text", () => {
    expect(fillParams(translations.pl["ui.change_history"], { n: 1 })).toBe(translations.pl["ui.change_history"]);
    expect(fillParams(translations.fr["ui.merged_n_changes"], { count: 3, unit: "x" })).toContain("3");
  });
});

describe("system language", () => {
  it("takes the first preferred language the interface has", () => {
    expect(systemLanguage(["pt-PT", "de"])).toBe("pt");
    expect(systemLanguage(["ja-JP", "tr-TR", "de"])).toBe("tr");
    expect(systemLanguage(["de-AT"])).toBe("de");
    expect(systemLanguage(["pl"])).toBe("pl");
  });

  it("falls back to English", () => {
    expect(systemLanguage(["ja-JP", "ko"])).toBe("en");
    expect(systemLanguage([])).toBe("en");
  });
});
