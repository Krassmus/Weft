import { useMemo } from "react";
import { isTranslated } from "../../../core/document/translations";
import { useDocumentStore } from "../../../core/document/store";
import { useTranslation } from "../../../core/i18n/useTranslation";
import { flagForLocale, languageName } from "../../../core/i18n/languages";
import type { ButtonBlock, ClozeBlock, ListBlock, RevealerBlock, QuizBlock, TextBlock } from "../../../core/types";
import { useEditingLanguage } from "../useEditingLanguage";
import { tr } from "../../../core/i18n/tr";

/**
 * The language switch at the top of a text-carrying block's "Inhalt" in the sidebar: a select of the
 * module's languages (flag, then the name), which changes what the whole text field(s) of the block
 * being edited show - and everything else on the slide with them, since the editing language is
 * one setting shared by the canvas, the thumbnails and every switch like this (see
 * DocumentState.editingLanguage). Only appears while the module offers more than one language.
 */
export function LanguageSelect({ block }: { block: TextBlock | QuizBlock | ButtonBlock | ListBlock | ClozeBlock | RevealerBlock }) {
  const { lang, defaultLang, languages } = useEditingLanguage();
  const setEditingLanguage = useDocumentStore((s) => s.setEditingLanguage);
  const { lang: uiLanguage } = useTranslation();
  const names = useMemo(
    () => new Map(languages.map((locale) => [locale, `${flagForLocale(locale)} ${languageName(locale, uiLanguage)}`])),
    [languages, uiLanguage],
  );

  if (languages.length < 2 || !lang) return null;
  return (
    <>
      <label className="weft-field">
        <span>{tr("ui.language")}</span>
        <select value={lang} onChange={(e) => setEditingLanguage(e.target.value)}>
          {languages.map((locale) => (
            <option key={locale} value={locale}>
              {names.get(locale)}
              {locale === defaultLang ? " (Standard)" : ""}
            </option>
          ))}
        </select>
      </label>
      {!(block.kind === "revealer" ? lang === defaultLang || block.translations?.[lang]?.title !== undefined : isTranslated(block, lang, defaultLang)) && (
        <p className="weft-hint">
          {tr("ui.there_is_no_translation_for_this")}
        </p>
      )}
    </>
  );
}
