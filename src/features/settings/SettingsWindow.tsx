import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { AI_SETTINGS_VISIBLE, readControlMode, writeControlMode } from "../../core/control/bridge";
import type { ControlMode } from "../../core/control/bridge";
import { invoke } from "@tauri-apps/api/core";
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
import { UI_ZOOM_STEPS, useAccessibilityStore } from "../../core/accessibility/accessibilityStore";
import { isTauri } from "../../core/io/fileIO";
import type { ContrastLevel } from "../../core/accessibility/accessibilityStore";

/** A group of settings: a tile like the foldable sections of the side panels (see .weft-settings-field in App.css), named by its heading for a screen reader. */
function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section className="weft-settings-field" aria-labelledby={headingId}>
      <h2 id={headingId} className="weft-settings-field-title">
        {title}
      </h2>
      {children}
    </section>
  );
}

const LANGUAGE_OPTIONS: { value: LanguagePreference; labelKey: "settings.language.system" | "settings.language.de" | "settings.language.en" }[] = [
  { value: "system", labelKey: "settings.language.system" },
  { value: "de", labelKey: "settings.language.de" },
  { value: "en", labelKey: "settings.language.en" },
];

const CONTRAST_OPTIONS: { value: ContrastLevel; labelKey: "settings.contrast.stylish" | "settings.contrast.higher" | "settings.contrast.strong" }[] = [
  { value: "stylish", labelKey: "settings.contrast.stylish" },
  { value: "higher", labelKey: "settings.contrast.higher" },
  { value: "strong", labelKey: "settings.contrast.strong" },
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
    <SettingsGroup title={t("settings.network.legend")}>
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
    </SettingsGroup>
  );
}


/** What the desktop app tells about the command line tool that is part of it (src-tauri/src/cli_tool.rs). */
interface CliInfo {
  available: boolean;
  version: string | null;
  launcher: string | null;
  mcpLauncher: string | null;
  link: string | null;
  mcpLink: string | null;
  linked: boolean;
  canLink: boolean;
  linkDir: string | null;
  platform: string;
}

function CopyBlock({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="weft-settings-code">
      <pre>{text}</pre>
      <button
        type="button"
        className="weft-ghost-button"
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? t("settings.ai.copied") : t("settings.ai.copy")}
      </button>
    </div>
  );
}

/** What an assistant may do with the module that is open in the app (the local interface, see core/control/bridge.ts). */
function LiveSettings() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ControlMode>(readControlMode);
  const [copied, setCopied] = useState(false);
  const options: { value: ControlMode; label: string }[] = [
    { value: "edit", label: t("settings.ai.live.edit") },
    { value: "read", label: t("settings.ai.live.read") },
    { value: "off", label: t("settings.ai.live.off") },
  ];
  return (
    <>
      <span className="weft-settings-subtitle">{t("settings.ai.live.legend")}</span>
      <p className="weft-hint">{t("settings.ai.live.hint")}</p>
      {options.map((option) => (
        <label key={option.value} className="weft-field weft-field-inline">
          <input
            type="radio"
            name="control-mode"
            checked={mode === option.value}
            onChange={() => {
              setMode(option.value);
              writeControlMode(option.value);
            }}
          />
          <span>{option.label}</span>
        </label>
      ))}
      <div className="weft-field">
        <button
          type="button"
          className="weft-ghost-button"
          disabled={mode === "off"}
          onClick={() => {
            void navigator.clipboard?.writeText(t("settings.ai.live.prompt")).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? t("settings.ai.copied") : t("settings.ai.live.copy")}
        </button>
      </div>
    </>
  );
}

/** The command line tool and the MCP server for AI assistants: shipped inside the desktop app, with a Node of their own. */
function AiSettings() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<CliInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    invoke<CliInfo>("cli_info").then(setInfo, () => undefined);
  }, []);

  async function install() {
    setError(null);
    try {
      setInfo(await invoke<CliInfo>("install_cli_link"));
    } catch (problem) {
      setError(String(problem));
    }
  }

  // Where an assistant finds the tool: the link when it is made (it stays right when the app is moved or updated), else the app itself.
  const mcpCommand = info?.linked ? info.mcpLink : info?.mcpLauncher;
  const mcpConfig = mcpCommand ? JSON.stringify({ mcpServers: { weft: { command: mcpCommand } } }, null, 2) : "";

  return (
    <SettingsGroup title={t("settings.ai.legend")}>
      {isTauri() && <LiveSettings />}
      {!isTauri() ? (
        <p className="weft-hint">{t("settings.ai.web")}</p>
      ) : !info ? null : !info.available ? (
        <p className="weft-hint">{t("settings.ai.missing")}</p>
      ) : (
        <>
          <p className="weft-hint">{t("settings.ai.intro")}</p>
          {info.version && <p className="weft-hint">{t("settings.ai.version", { version: info.version })}</p>}
          {info.canLink ? (
            <>
              <div className="weft-field">
                <button type="button" className="weft-ghost-button" onClick={() => void install()}>
                  {t("settings.ai.install")}
                </button>
              </div>
              {info.linked && <p className="weft-hint">{t("settings.ai.installed", { dir: info.linkDir ?? "" })}</p>}
              {info.linked && info.linkDir && (
                <>
                  <p className="weft-hint">{t("settings.ai.pathHint")}</p>
                  <CopyBlock text={`export PATH="$HOME/.local/bin:$PATH"`} />
                </>
              )}
            </>
          ) : (
            <>
              <p className="weft-hint">{t("settings.ai.windows")}</p>
              <CopyBlock text={info.launcher ?? ""} />
            </>
          )}
          {error && <p className="weft-placeholder-warning">{t("settings.ai.error", { message: error })}</p>}
          <p className="weft-hint">{t("settings.ai.tell")}</p>
          <p className="weft-hint">{t("settings.ai.mcp")}</p>
          <CopyBlock text={mcpConfig} />
        </>
      )}
    </SettingsGroup>
  );
}

export function SettingsWindow() {
  const { t } = useTranslation();
  const preference = useLanguageStore((s) => s.preference);
  const setPreference = useLanguageStore((s) => s.setPreference);
  useSyncMenuLanguage();
  const contrast = useAccessibilityStore((s) => s.contrast);
  const uiZoom = useAccessibilityStore((s) => s.uiZoom);
  const setUiZoom = useAccessibilityStore((s) => s.setUiZoom);
  const isDesktopApp = isTauri();
  const setContrast = useAccessibilityStore((s) => s.setContrast);
  const focusRing = useAccessibilityStore((s) => s.focusRing);
  const setFocusRing = useAccessibilityStore((s) => s.setFocusRing);
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
      <SettingsGroup title={t("settings.language.legend")}>
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
      </SettingsGroup>
      <SettingsGroup title={t("settings.access.legend")}>
        <span className="weft-settings-subtitle">{t("settings.contrast.label")}</span>
        {CONTRAST_OPTIONS.map((option) => (
          <label key={option.value} className="weft-field weft-field-inline">
            <input type="radio" name="contrast" checked={contrast === option.value} onChange={() => setContrast(option.value)} />
            <span>{t(option.labelKey)}</span>
          </label>
        ))}
        <p className="weft-hint">{t("settings.contrast.hint")}</p>
        {isDesktopApp && (
          <label className="weft-field">
            <span>{t("settings.zoom.label")}</span>
            <select value={uiZoom} onChange={(e) => setUiZoom(Number(e.target.value))}>
              {UI_ZOOM_STEPS.map((step) => (
                <option key={step} value={step}>
                  {Math.round(step * 100)} %
                </option>
              ))}
            </select>
          </label>
        )}
        {isDesktopApp && <p className="weft-hint">{t("settings.zoom.hint")}</p>}
        <label className="weft-field weft-field-inline">
          <input type="checkbox" checked={focusRing} onChange={(e) => setFocusRing(e.target.checked)} />
          <span>{t("settings.focus.label")}</span>
        </label>
        <p className="weft-hint">{t("settings.focus.hint")}</p>
      </SettingsGroup>
      <SettingsGroup title={t("settings.profile.legend")}>
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
      </SettingsGroup>
      {AI_SETTINGS_VISIBLE && <AiSettings />}
      <NetworkSettings />
    </div>
  );
}
