import { useMemo, useState } from "react";
import {
  ASPECT_RATIO_PRESETS,
  aspectRatioNumeric,
  formatAspectRatio,
  isPresetAspectRatio,
  isValidAspect,
  MAX_ASPECT,
  parseAspectRatio,
} from "../../../core/aspectRatio";
import {
  addCustomFont,
  removeCustomFont,
  setAspectRatio,
  setKeyboardNavigationEnabled,
  setModuleTitle,
} from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";
import { setLanguages } from "../../../core/document/actions";
import { buildLanguageCatalog, flagForLocale, languageName } from "../../../core/i18n/languages";
import { useTranslation } from "../../../core/i18n/useTranslation";
import { confirmDestructive, pickDocumentFile, pickFontFile } from "../../../core/io/fileIO";
import { useAssetTransfers } from "../../../core/collab/assetSync";
import { presenceColor, usePresence } from "../../../core/collab/presence";
import { useProfileStore } from "../../../core/profile/profileStore";
import { PersonAvatar } from "../PersonAvatar";
import { useDirectConnection } from "../../../core/collab/webrtcAdapter";
import { mergeDocumentFile } from "../../../core/collab/merge";
import { joinSharedDocument, shareCurrentDocument } from "../../../core/collab/session";
import { useDragReorder } from "../useDragReorder";

const CUSTOM_VALUE = "custom";

const LANGUAGE_LIST_ID = "languages";

/**
 * The languages the module is offered in. None by default (a single-language module); the list is
 * ordered, its first entry is the default language - dragging a language to the top makes it the
 * default (which also swaps the blocks' own wording to that language's, see setLanguages). With
 * languages selected, the module gets the `userlanguage` variable, a language switch element, and
 * a language select next to every text being edited.
 */
function LanguagesField() {
  const languages = useDocumentStore((s) => s.doc.content.languages);
  const { lang: uiLanguage } = useTranslation();
  const { bind } = useDragReorder();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  // Several hundred entries, named in the editor's own language - built once per UI language.
  const catalog = useMemo(() => buildLanguageCatalog(uiLanguage), [uiLanguage]);
  const candidates = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return catalog.filter(
      (entry) =>
        !languages.includes(entry.locale) &&
        (!needle || entry.name.toLocaleLowerCase().includes(needle) || entry.locale.toLocaleLowerCase().includes(needle)),
    );
  }, [catalog, languages, query]);

  function move(from: number, to: number) {
    const next = [...languages];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setLanguages(next);
  }

  return (
    <div className="weft-field">
      <span>Sprachen</span>
      <p className="weft-hint">
        Ohne Auswahl ist das Lernmodul einsprachig. Die oberste Sprache ist die Standardsprache - zum Ändern die
        Zeilen ziehen.
      </p>
      {languages.length > 0 && (
        <ul className="weft-language-list">
          {languages.map((locale, index) => {
            const { dragClassName, ...dragAttrs } = bind("language", LANGUAGE_LIST_ID, index, (_container, to) => move(index, to));
            return (
              <li key={locale} className={"weft-language-row" + dragClassName} {...dragAttrs}>
                <span className="weft-language-row-flag">{flagForLocale(locale)}</span>
                <span className="weft-language-row-name">{languageName(locale, uiLanguage)}</span>
                {index === 0 && <span className="weft-language-row-default">Standard</span>}
                <button
                  type="button"
                  className="weft-icon-button"
                  title="Sprache entfernen"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setLanguages(languages.filter((l) => l !== locale))}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {adding ? (
        <div className="weft-language-picker">
          <input
            autoFocus
            placeholder="Sprache suchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAdding(false);
              if (e.key === "Enter" && candidates[0]) {
                setLanguages([...languages, candidates[0].locale]);
                setQuery("");
              }
            }}
          />
          <ul className="weft-language-picker-list">
            {candidates.map((entry) => (
              <li key={entry.locale}>
                <button
                  type="button"
                  onClick={() => {
                    setLanguages([...languages, entry.locale]);
                    setQuery("");
                  }}
                >
                  <span className="weft-language-row-flag">{entry.flag}</span>
                  <span>{entry.name}</span>
                  <span className="weft-language-row-code">{entry.locale}</span>
                </button>
              </li>
            ))}
            {candidates.length === 0 && <li className="weft-hint">Keine passende Sprache.</li>}
          </ul>
          <button type="button" className="weft-ghost-button weft-full-width" onClick={() => setAdding(false)}>
            Fertig
          </button>
        </div>
      ) : (
        <button type="button" className="weft-ghost-button weft-full-width" onClick={() => setAdding(true)}>
          + Sprache hinzufügen
        </button>
      )}
    </div>
  );
}

/** The module's aspect ratio: a list of the usual ones plus "Anderes Verhältnis", which reveals two
 * number fields (width : height) with a small schematic of the resulting slide beside them. Whether
 * the custom fields are showing is local UI state, not part of the document: a ratio that happens
 * to equal a preset is then still editable as a custom one (typing 16 and 9 doesn't make the
 * fields vanish), and reopening the settings simply shows a preset by its name again. */
function AspectRatioField() {
  const aspectRatio = useDocumentStore((s) => s.doc.content.aspectRatio);
  const [customMode, setCustomMode] = useState(!isPresetAspectRatio(aspectRatio));
  const { width, height } = parseAspectRatio(aspectRatio);
  // The fields keep what is being typed, even while it isn't (yet) a usable ratio - the document only
  // ever receives a valid one.
  const [draft, setDraft] = useState({ width: String(width), height: String(height) });
  const valid = isValidAspect(Number(draft.width), Number(draft.height));

  function change(next: { width: string; height: string }) {
    setDraft(next);
    if (isValidAspect(Number(next.width), Number(next.height))) {
      setAspectRatio(formatAspectRatio(Number(next.width), Number(next.height)));
    }
  }

  return (
    <>
      <label className="weft-field">
        <span>Seitenverhältnis</span>
        <select
          value={customMode ? CUSTOM_VALUE : aspectRatio}
          onChange={(e) => {
            if (e.target.value === CUSTOM_VALUE) {
              setCustomMode(true);
              setDraft({ width: String(width), height: String(height) });
              return;
            }
            setCustomMode(false);
            setAspectRatio(e.target.value as typeof aspectRatio);
          }}
        >
          {ASPECT_RATIO_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
          <option value={CUSTOM_VALUE}>Anderes Verhältnis</option>
        </select>
      </label>
      {customMode && (
        <>
          <div className="weft-aspect-custom">
            <input
              type="number"
              min={0}
              step="any"
              aria-label="Breite"
              value={draft.width}
              onChange={(e) => change({ ...draft, width: e.target.value })}
            />
            <span>:</span>
            <input
              type="number"
              min={0}
              step="any"
              aria-label="Höhe"
              value={draft.height}
              onChange={(e) => change({ ...draft, height: e.target.value })}
            />
            <AspectRatioSketch aspect={valid ? Number(draft.width) / Number(draft.height) : aspectRatioNumeric(aspectRatio)} />
          </div>
          {!valid && (
            <p className="weft-variable-problem">
              Zwei Zahlen größer als 0 - das Verhältnis darf höchstens 1:{MAX_ASPECT} bis {MAX_ASPECT}:1 betragen.
            </p>
          )}
        </>
      )}
    </>
  );
}

/** A tiny schematic of a slide of the given width/height inside a square: the largest rectangle of
 * that shape that fits. */
function AspectRatioSketch({ aspect }: { aspect: number }) {
  const wide = aspect >= 1;
  return (
    <div className="weft-aspect-sketch" title="So sieht das Seitenverhältnis aus">
      <div
        className="weft-aspect-sketch-slide"
        style={{ width: wide ? "100%" : `${aspect * 100}%`, height: wide ? `${100 / aspect}%` : "100%" }}
      />
    </div>
  );
}

const COLLAB_SERVER_KEY = "weft.collabServer";
const COLLAB_DIRECT_KEY = "weft.collabDirect";
const COLLAB_RELAYS_KEY = "weft.collabRelays";
const COLLAB_TURN_KEY = "weft.collabTurn";

function readSetting(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not persisted - fine */
  }
}

const DIRECT_STATUS_TEXT = {
  off: "",
  searching: "Direktverbindung: suche die anderen …",
  connected: "Direktverbindung steht",
  failed: "Direktverbindung gescheitert",
} as const;

/**
 * Edit this module together with others. "Teilen" announces the document being edited and shows the
 * invitation link others join with; "Beitreten" replaces what is open with a document somebody else
 * shares (merging in what is only in the open copy, if it is another copy of the same module). The
 * people are connected directly (WebRTC - no server of ours), and/or through a sync server somebody
 * runs. "Mit Datei zusammenführen" needs no connection at all. See core/collab/.
 */
function CollaborationField() {
  const [server, setServer] = useState(() => readSetting(COLLAB_SERVER_KEY, ""));
  const [direct, setDirect] = useState(() => readSetting(COLLAB_DIRECT_KEY, "1") === "1");
  const [relays, setRelays] = useState(() => readSetting(COLLAB_RELAYS_KEY, ""));
  const [turn, setTurn] = useState(() => {
    try {
      return JSON.parse(readSetting(COLLAB_TURN_KEY, "{}")) as { url?: string; user?: string; password?: string };
    } catch {
      return {};
    }
  });
  const [link, setLink] = useState("");
  const [joinLink, setJoinLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mergeMessage, setMergeMessage] = useState("");
  const { missing, transfers } = useAssetTransfers();
  const connection = useDirectConnection();
  const profile = useProfileStore();
  const people = Object.values(usePresence((s) => s.peers));
  const receiving = Object.values(transfers);
  const megabytes = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
  const webRtcAvailable = typeof RTCPeerConnection !== "undefined";
  const options = {
    direct: direct && webRtcAvailable,
    serverUrl: server.trim() || undefined,
    relayUrls: relays.split(/\s+/).filter(Boolean),
    turnServers: turn.url?.trim()
      ? [{ urls: turn.url.trim(), username: turn.user?.trim() || undefined, credential: turn.password || undefined }]
      : [],
  };

  function updateTurn(patch: Partial<typeof turn>) {
    const next = { ...turn, ...patch };
    setTurn(next);
    writeSetting(COLLAB_TURN_KEY, JSON.stringify(next));
  }

  async function mergeFile() {
    setMergeMessage("");
    const picked = await pickDocumentFile("Datei zum Zusammenführen auswählen");
    if (!picked) return;
    const result = mergeDocumentFile(picked.bytes);
    setMergeMessage(
      result.ok
        ? result.newChanges > 0
          ? `Zusammengeführt: ${result.newChanges} Änderungen übernommen.`
          : "Diese Datei enthält nichts Neues - alle ihre Änderungen sind schon da."
        : {
            unreadable: "Die Datei lässt sich nicht lesen.",
            "no-history":
              "Diese Datei hat keinen Änderungsverlauf (sie stammt aus einer älteren Weft-Version). Sie lässt sich nur öffnen, nicht zusammenführen.",
            "other-module": "Das ist ein anderes Lernmodul.",
            "no-common-origin":
              "Die Datei geht nicht auf dieselbe Ausgangsdatei zurück. Zusammenführen geht nur mit Kopien einer Datei, die mit dieser Weft-Version gespeichert wurde.",
          }[result.reason],
    );
  }

  function share() {
    setError("");
    setCopied(false);
    setLink(shareCurrentDocument(options));
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("Kopieren nicht möglich - den Link bitte markieren und von Hand kopieren.");
    }
  }

  async function join() {
    setError("");
    const ok = await confirmDestructive(
      "Das geöffnete Lernmodul wird durch das geteilte ersetzt. Änderungen daran, die nur hier sind, bleiben erhalten, wenn es eine Kopie desselben Lernmoduls ist - sonst gehen nicht gespeicherte Änderungen verloren.",
      "Beitreten",
    );
    if (!ok) return;
    setBusy(true);
    try {
      await joinSharedDocument(joinLink, options);
      setJoinLink("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="weft-field">
      <span>Zusammenarbeit</span>
      <p className="weft-hint">
        Dateien: Wer eine Kopie dieser .weft-Datei weiterbearbeitet hat, kann sie hier mit dem geöffneten Lernmodul
        zusammenführen - ohne Server und ohne Internet, die Änderungen beider Seiten bleiben erhalten.
      </p>
      <button type="button" className="weft-ghost-button weft-full-width" onClick={() => void mergeFile()}>
        Mit Datei zusammenführen …
      </button>
      {mergeMessage && <p className="weft-hint">{mergeMessage}</p>}

      <p className="weft-hint">Live: Zusammen im selben Lernmodul arbeiten.</p>
      <div className="weft-presence-self">
        <PersonAvatar name={profile.name} color="var(--weft-accent)" avatar={profile.avatar} size={28} />
        <span>Du erscheinst als „{profile.name}“</span>
      </div>
      <p className="weft-hint">Name und Bild stellst du in den App-Einstellungen ein (Menü „Einstellungen…“).</p>
      <label className="weft-field weft-field-inline">
        <input
          type="checkbox"
          checked={direct && webRtcAvailable}
          disabled={!webRtcAvailable}
          onChange={(e) => {
            setDirect(e.target.checked);
            writeSetting(COLLAB_DIRECT_KEY, e.target.checked ? "1" : "0");
          }}
        />
        <span>Direkt mit den anderen verbinden (ohne Server)</span>
      </label>
      {!webRtcAvailable && <p className="weft-placeholder-warning">Dieses System unterstützt keine Direktverbindung (WebRTC).</p>}
      <label className="weft-field">
        <span>Sync-Server (optional)</span>
        <input
          value={server}
          placeholder="wss://…"
          onChange={(e) => {
            setServer(e.target.value);
            writeSetting(COLLAB_SERVER_KEY, e.target.value);
          }}
        />
      </label>
      <details className="weft-collab-advanced">
        <summary>Netzwerk (für schwierige Netze)</summary>
        <label className="weft-field">
          <span>Signaling-Relays (eine Adresse pro Zeile)</span>
          <textarea
            rows={3}
            value={relays}
            placeholder={"leer = öffentliche Standard-Relays\nwss://relay.example.org"}
            onChange={(e) => {
              setRelays(e.target.value);
              writeSetting(COLLAB_RELAYS_KEY, e.target.value);
            }}
          />
        </label>
        <p className="weft-hint">
          Über Relays finden sich die Teilnehmenden zuerst. Alle müssen dieselben benutzen - sie stehen deshalb im
          Einladungslink, und wer beitritt, übernimmt die des Links.
        </p>
        <label className="weft-field">
          <span>TURN-Server (Adresse)</span>
          <input value={turn.url ?? ""} placeholder="turn:turn.example.org:3478" onChange={(e) => updateTurn({ url: e.target.value })} />
        </label>
        <label className="weft-field">
          <span>TURN Benutzername</span>
          <input value={turn.user ?? ""} onChange={(e) => updateTurn({ user: e.target.value })} />
        </label>
        <label className="weft-field">
          <span>TURN Passwort</span>
          <input type="password" value={turn.password ?? ""} onChange={(e) => updateTurn({ password: e.target.value })} />
        </label>
        <p className="weft-hint">
          Ein TURN-Server leitet den Datenverkehr weiter, wenn zwei Rechner sich nicht direkt erreichen (manche
          Uni-Netze). Er gehört nur dir und steht nicht im Link. Ohne ihn klappt die Verbindung dort womöglich nicht.
        </p>
      </details>
      <button type="button" className="weft-ghost-button weft-full-width" onClick={share}>
        Dokument teilen
      </button>
      {link && (
        <>
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} title="Diesen Link an andere weitergeben" />
          <button type="button" className="weft-ghost-button weft-full-width" onClick={() => void copyLink()}>
            {copied ? "Kopiert" : "Link kopieren"}
          </button>
          <p className="weft-hint">
            Wer den Link hat, kann beitreten und alles ändern. Beide müssen online sein; das Lernmodul kommt direkt von
            Rechner zu Rechner. Der Link bleibt gültig, auch wenn du die gespeicherte Datei später wieder öffnest - und
            wer dieselbe Datei hat, kann mit ihr beitreten, ohne seine Änderungen zu verlieren.
          </p>
        </>
      )}
      <label className="weft-field">
        <span>Geteiltem Dokument beitreten</span>
        <input value={joinLink} placeholder="automerge:…" onChange={(e) => setJoinLink(e.target.value)} />
      </label>
      <button
        type="button"
        className="weft-ghost-button weft-full-width"
        disabled={!joinLink.trim() || busy}
        onClick={() => void join()}
      >
        {busy ? "Verbinde …" : "Beitreten"}
      </button>
      {error && <p className="weft-placeholder-warning">{error}</p>}
      {connection.state !== "off" && (
        <p className={connection.state === "failed" ? "weft-placeholder-warning" : "weft-hint"}>
          {DIRECT_STATUS_TEXT[connection.state]}
          {connection.state === "connected" && ` (${connection.peers} ${connection.peers === 1 ? "Person" : "Personen"})`}
          {connection.error && ` - ${connection.error}`}
        </p>
      )}
      {people.length > 0 && (
        <div className="weft-presence-list">
          <span className="weft-hint">Gerade dabei:</span>
          {people.map((person) => (
            <span key={person.peerId} className="weft-presence-list-item">
              <PersonAvatar name={person.name} color={presenceColor(person.peerId)} avatar={person.avatar} size={20} />
              {person.name}
            </span>
          ))}
        </div>
      )}
      {missing > 0 && (
        <p className="weft-hint">
          Medien: {missing} {missing === 1 ? "Datei fehlt" : "Dateien fehlen"} noch
          {receiving.length > 0 &&
            ` - ${megabytes(receiving.reduce((sum, t) => sum + Math.min(t.size, t.received * 48 * 1024), 0))} von ${megabytes(receiving.reduce((sum, t) => sum + t.size, 0))} MB werden übertragen`}
          . Sie kommen von den anderen, sobald jemand online ist, der sie hat.
        </p>
      )}
    </div>
  );
}

export function SettingsTab() {
  const content = useDocumentStore((s) => s.doc.content);

  return (
    <div className="weft-tab-panel">
      <label className="weft-field">
        <span>Titel</span>
        <input value={content.title} onChange={(e) => setModuleTitle(e.target.value)} />
      </label>

      <AspectRatioField />

      <div className="weft-divider" />

      <LanguagesField />

      <div className="weft-divider" />

      <CollaborationField />

      <div className="weft-divider" />

      <label className="weft-field weft-field-inline">
        <input
          type="checkbox"
          checked={content.keyboardNavigationEnabled}
          onChange={(e) => setKeyboardNavigationEnabled(e.target.checked)}
        />
        <span>Navigation per Tastatur (Leertaste, Pfeiltasten)</span>
      </label>
      <p className="weft-hint">
        Ausgeschaltet können Lernende nur noch über Buttons oder eine Quiz-Auswertung weiterblättern - vor allem
        nicht mehr zurück, um ein bereits beantwortetes Quiz erneut zu versuchen.
      </p>

      <div className="weft-divider" />

      <div className="weft-field">
        <span>Eigene Schriften</span>
        <p className="weft-hint">
          Hochgeladene Schriften stehen im ganzen Lernmodul zur Verfügung, tauchen bei jedem Textelement in der
          Schriftarten-Auswahl auf und werden beim Export automatisch mit eingebettet.
        </p>
        {content.customFonts.length > 0 && (
          <div className="weft-custom-font-list">
            {content.customFonts.map((font) => (
              <div key={font.id} className="weft-custom-font-row">
                <span className="weft-custom-font-row-label">{font.family}</span>
                <span className="weft-custom-font-row-preview" style={{ fontFamily: font.family }}>
                  Abc
                </span>
                <button
                  type="button"
                  title="Entfernen"
                  onClick={() => {
                    void confirmDestructive(`Schriftart „${font.family}“ wirklich entfernen?`, "Schriftart entfernen").then(
                      (ok) => {
                        if (ok) removeCustomFont(font.id);
                      },
                    );
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          className="weft-ghost-button weft-full-width"
          onClick={() => {
            void pickFontFile().then((file) => {
              if (file) addCustomFont(file);
            });
          }}
        >
          + Eigene Schriftart hochladen
        </button>
      </div>
    </div>
  );
}
