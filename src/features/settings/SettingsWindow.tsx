import { useState } from "react";
import {
  COLLAB_RELAYS_KEY,
  COLLAB_SERVER_KEY,
  COLLAB_TURN_KEY,
  readSetting,
  readTurnSetting,
  writeSetting,
} from "../../core/collab/settings";
import type { TurnSetting } from "../../core/collab/settings";
import { useTranslation } from "../../core/i18n/useTranslation";
import { useLanguageStore } from "../../core/i18n/languageStore";
import type { LanguagePreference } from "../../core/i18n/languageStore";
import { useSyncMenuLanguage } from "../../core/i18n/useSyncMenuLanguage";
import { avatarFromFile } from "../../core/profile/avatarImage";
import { useProfileStore } from "../../core/profile/profileStore";
import { PersonAvatar } from "../editor/PersonAvatar";

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
 * different place to put them. Next to the language: the person's own profile (name and avatar
 * picture, see profileStore.ts) - what the people they collaborate with get to see of them - and
 * how their computer connects to them (network). */
/** How this computer connects for working together on a module (see core/collab/settings.ts). */
function NetworkSettings() {
  const { t } = useTranslation();
  const [server, setServer] = useState(() => readSetting(COLLAB_SERVER_KEY, ""));
  const [relays, setRelays] = useState(() => readSetting(COLLAB_RELAYS_KEY, ""));
  const [turn, setTurn] = useState<TurnSetting>(readTurnSetting);
  function updateTurn(patch: Partial<TurnSetting>) {
    const next = { ...turn, ...patch };
    setTurn(next);
    writeSetting(COLLAB_TURN_KEY, JSON.stringify(next));
  }

  return (
    <fieldset className="weft-settings-field">
      <legend>{t("settings.network.legend")}</legend>
      <p className="weft-hint">{t("settings.network.hint")}</p>
      <label className="weft-field">
        <span>{t("settings.network.server")}</span>
        <input
          value={server}
          placeholder="wss://…"
          onChange={(e) => {
            setServer(e.target.value);
            writeSetting(COLLAB_SERVER_KEY, e.target.value);
          }}
        />
      </label>
      <label className="weft-field">
        <span>{t("settings.network.relays")}</span>
        <textarea
          rows={3}
          value={relays}
          placeholder={t("settings.network.relaysPlaceholder")}
          onChange={(e) => {
            setRelays(e.target.value);
            writeSetting(COLLAB_RELAYS_KEY, e.target.value);
          }}
        />
      </label>
      <p className="weft-hint">{t("settings.network.relaysHint")}</p>
      <label className="weft-field">
        <span>{t("settings.network.turnUrl")}</span>
        <input value={turn.url ?? ""} placeholder="turn:turn.example.org:3478" onChange={(e) => updateTurn({ url: e.target.value })} />
      </label>
      <label className="weft-field">
        <span>{t("settings.network.turnUser")}</span>
        <input value={turn.user ?? ""} onChange={(e) => updateTurn({ user: e.target.value })} />
      </label>
      <label className="weft-field">
        <span>{t("settings.network.turnPassword")}</span>
        <input type="password" value={turn.password ?? ""} onChange={(e) => updateTurn({ password: e.target.value })} />
      </label>
      <p className="weft-hint">{t("settings.network.turnHint")}</p>
    </fieldset>
  );
}

export function SettingsWindow() {
  const { t } = useTranslation();
  const preference = useLanguageStore((s) => s.preference);
  const setPreference = useLanguageStore((s) => s.setPreference);
  useSyncMenuLanguage();
  const profile = useProfileStore();
  const [avatarError, setAvatarError] = useState(false);

  async function chooseAvatar(file: File | undefined) {
    if (!file) return;
    setAvatarError(false);
    try {
      profile.setAvatar(await avatarFromFile(file));
    } catch {
      setAvatarError(true);
    }
  }

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
      <fieldset className="weft-settings-field">
        <legend>{t("settings.profile.legend")}</legend>
        <label className="weft-field">
          <span>{t("settings.profile.name")}</span>
          <input value={profile.name} onChange={(e) => profile.setName(e.target.value)} />
        </label>
        <div className="weft-field">
          <span>{t("settings.profile.avatar")}</span>
          <div className="weft-profile-avatar-row">
            <PersonAvatar name={profile.name} color="var(--weft-accent)" avatar={profile.avatar} size={56} />
            {/* A real file input inside its label: opening it is a direct click on the control itself,
                which every webview allows (a script-triggered click on a hidden input is not always). */}
            <label className="weft-ghost-button weft-profile-avatar-choose">
              {t("settings.profile.choose")}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  void chooseAvatar(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {profile.avatar && (
              <button type="button" className="weft-ghost-button" onClick={() => profile.setAvatar(null)}>
                {t("settings.profile.remove")}
              </button>
            )}
          </div>
          {avatarError && <p className="weft-placeholder-warning">{t("settings.profile.error")}</p>}
        </div>
        <p className="weft-hint">{t("settings.profile.hint")}</p>
      </fieldset>
      <NetworkSettings />
    </div>
  );
}
