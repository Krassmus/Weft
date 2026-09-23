import { useTranslation } from "../../core/i18n/useTranslation";
import { useLanguageStore } from "../../core/i18n/languageStore";
import type { LanguagePreference } from "../../core/i18n/languageStore";
import { useSyncMenuLanguage } from "../../core/i18n/useSyncMenuLanguage";

const LANGUAGE_OPTIONS: { value: LanguagePreference; labelKey: "settings.language.system" | "settings.language.de" | "settings.language.en" }[] = [
  { value: "system", labelKey: "settings.language.system" },
  { value: "de", labelKey: "settings.language.de" },
  { value: "en", labelKey: "settings.language.en" },
];

/** The app-level "Einstellungen…"/"Settings…" window (see the app menu, src-tauri/src/lib.rs) -
 * a separate native window from the main editor, not another sidebar tab. Deliberately not the
 * same thing as the *document's* own "Einstellungen" tab in the sidebar (title, aspect ratio,
 * fonts, LMS) - this holds preferences about Weft itself, which is why changing the language
 * here isn't part of any .weft file's content at all (see languageStore.ts). Only one setting
 * today; more (per the person who asked for this) means more fields in here later, not a
 * different place to put them. */
export function SettingsWindow() {
  const { t } = useTranslation();
  const preference = useLanguageStore((s) => s.preference);
  const setPreference = useLanguageStore((s) => s.setPreference);
  useSyncMenuLanguage();

  return (
    <div className="weft-settings-window">
      <h1 className="weft-settings-window-title">{t("settings.window.title")}</h1>
      <fieldset className="weft-settings-field">
        <legend>{t("settings.language.legend")}</legend>
        {LANGUAGE_OPTIONS.map((option) => (
          <label key={option.value} className="weft-field weft-field-inline">
            <input
              type="radio"
              name="language"
              checked={preference === option.value}
              onChange={() => setPreference(option.value)}
            />
            <span>{t(option.labelKey)}</span>
          </label>
        ))}
        <p className="weft-hint">{t("settings.language.hint")}</p>
      </fieldset>
    </div>
  );
}
