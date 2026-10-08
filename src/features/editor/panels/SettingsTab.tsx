import { useEffect, useMemo, useState } from "react";
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
import { confirmDestructive, pickFontFile } from "../../../core/io/fileIO";
import { useAssetTransfers } from "../../../core/collab/assetSync";
import { COMPACT_KEEP_BYTES, COMPACT_OFFER_BYTES, compactHistory, historyStats } from "../../../core/collab/compact";
import type { HistoryStats } from "../../../core/collab/compact";
import {
  chooseSyncFolder,
  listModulesInFolder,
  folderSyncAvailable,
  openModuleFromFolder,
  startFolderSync,
  stopFolderSync,
  useFolderSync,
} from "../../../core/collab/folder/folderSession";
import type { FolderModule } from "../../../core/collab/folder/folderSync";
import { presenceColor, usePresence } from "../../../core/collab/presence";
import { PersonAvatar } from "../PersonAvatar";
import { useDirectConnection } from "../../../core/collab/webrtcAdapter";
import { COLLAB_SERVER_KEY, readSetting } from "../../../core/collab/settings";
import {
  connectLiveCollaboration,
  disableLiveCollaboration,
  enableLiveCollaboration,
  invitationLink,
} from "../../../core/collab/session";
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

/**
 * Work together through a shared folder (Nextcloud, Sciebo, Dropbox, Syncthing ...): Weft writes this
 * module's changes into the folder and merges in what the others have written there - nobody has to be
 * online at the same time, and no server is involved. See core/collab/folder/folderSync.ts.
 */
function FolderSyncField() {
  const sync = useFolderSync();
  const [error, setError] = useState("");
  const [pickedFolder, setPickedFolder] = useState<string | null>(null);
  const [modules, setModules] = useState<FolderModule[] | null>(null);

  if (!folderSyncAvailable()) {
    return (
      <div className="weft-field">
        <span>Ordner-Abgleich</span>
        <p className="weft-hint">Den Abgleich über einen gemeinsamen Ordner gibt es in der Desktop-App.</p>
      </div>
    );
  }

  async function chooseAndStart() {
    setError("");
    const folder = await chooseSyncFolder();
    if (folder) await startFolderSync(folder);
  }

  async function browse() {
    setError("");
    setModules(null);
    const folder = await chooseSyncFolder();
    if (!folder) return;
    try {
      setModules(await listModulesInFolder(folder));
      setPickedFolder(folder);
    } catch (err) {
      setError(`Der Ordner lässt sich nicht lesen: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function openModule(module: FolderModule) {
    if (!pickedFolder) return;
    setError("");
    try {
      await openModuleFromFolder(pickedFolder, module);
      setModules(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const { status } = sync;
  return (
    <div className="weft-field">
      <span>Ordner-Abgleich</span>
      <p className="weft-hint">
        Mit einem Ordner abgleichen, den ein Dienst wie Nextcloud oder Sciebo für alle gleich hält: Weft legt dort die
        Änderungen ab und übernimmt, was die anderen hineinlegen. Niemand muss gleichzeitig online sein, ein Server ist
        nicht nötig.
      </p>
      {sync.active ? (
        <>
          <p className="weft-hint">
            Ordner: {sync.folder}
            <br />
            {status.lastSyncAt
              ? `Zuletzt abgeglichen: ${new Date(status.lastSyncAt).toLocaleTimeString()} - ${status.peerFiles} ${status.peerFiles === 1 ? "weitere Kopie" : "weitere Kopien"} im Ordner`
              : "Gleiche ab …"}
            {status.missingMedia > 0 && ` - ${status.missingMedia} ${status.missingMedia === 1 ? "Bild/Video fehlt" : "Bilder/Videos fehlen"} noch (kommen mit dem Ordner)`}
          </p>
          <button type="button" className="weft-ghost-button weft-full-width" onClick={() => stopFolderSync(true)}>
            Abgleich beenden
          </button>
        </>
      ) : (
        <button type="button" className="weft-ghost-button weft-full-width" onClick={() => void chooseAndStart()}>
          Ordner wählen und abgleichen …
        </button>
      )}
      {status.error && <p className="weft-placeholder-warning">{status.error}</p>}
      <button type="button" className="weft-ghost-button weft-full-width" onClick={() => void browse()}>
        Lernmodul aus einem Ordner öffnen …
      </button>
      {modules && (
        <div className="weft-folder-modules">
          {modules.length === 0 ? (
            <p className="weft-hint">In diesem Ordner liegt noch kein abgeglichenes Lernmodul.</p>
          ) : (
            modules.map((module) => (
              <button key={module.dir} type="button" className="weft-ghost-button weft-full-width" onClick={() => void openModule(module)}>
                {module.title} ({module.peerFiles} {module.peerFiles === 1 ? "Kopie" : "Kopien"})
              </button>
            ))
          )}
        </div>
      )}
      {error && <p className="weft-placeholder-warning">{error}</p>}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

/**
 * The module remembers every change that was ever made to it (that is what lets copies of it be merged
 * and worked on together) - earlier versions of every text included, and what was deleted. "Verlauf
 * verkleinern" keeps only the most recent changes; see core/collab/compact.ts for what that costs. It is
 * offered once the history takes up COMPACT_OFFER_BYTES.
 */
function HistoryField() {
  const content = useDocumentStore((s) => s.doc.content);
  const live = useDocumentStore((s) => s.live);
  const folderActive = useFolderSync((s) => s.active);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [busy, setBusy] = useState(false);

  // Packing the module twice is not for every keystroke: worked out once the editing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setStats(historyStats()), 1200);
    return () => clearTimeout(timer);
  }, [content]);

  async function compact() {
    const together = live !== null || folderActive;
    const ok = await confirmDestructive(
      `Der Änderungsverlauf wird verkleinert: Es bleiben nur die letzten Änderungen (rund ${formatBytes(COMPACT_KEEP_BYTES)} Verlauf). Frühere Fassungen von Texten und Gelöschtes aus der Zeit davor sind endgültig weg, und Rückgängig-Schritte gibt es erst wieder für neue Änderungen.` +
        "\n\nKopien dieses Lernmoduls, die vorher entstanden sind, lassen sich danach nicht mehr einmischen." +
        (together
          ? "\n\nDie Verbindung zu den anderen (An Datei zusammen arbeiten, Ordner-Abgleich) wird beendet. Zum gemeinsamen Arbeiten schaltest du sie danach wieder ein und gibst die neue Datei weiter."
          : ""),
      "Verlauf verkleinern",
    );
    if (!ok) return;
    setBusy(true);
    try {
      if (await compactHistory()) setStats(null);
      else window.alert("Das Lernmodul wurde währenddessen geändert. Bitte noch einmal versuchen.");
    } finally {
      setBusy(false);
    }
  }

  // Everything about the history is only worth showing when it can be shrunk.
  if (!stats || stats.historyBytes < COMPACT_OFFER_BYTES) return null;
  return (
    <>
      <div className="weft-divider" />
      <div className="weft-field">
        <span>Änderungsverlauf</span>
        <p className="weft-hint">
          Das Lernmodul merkt sich jede Änderung (dadurch lassen sich Kopien zusammenführen), auch frühere Fassungen
          von Texten und Gelöschtes. Das ist inzwischen {formatBytes(stats.historyBytes)} der Datei ({stats.changes.toLocaleString("de-DE")}{" "}
          Änderungen).
        </p>
        <button type="button" className="weft-ghost-button weft-full-width" disabled={busy} onClick={() => void compact()}>
          {busy ? "Verkleinere …" : "Verlauf verkleinern …"}
        </button>
      </div>
    </>
  );
}

const DIRECT_STATUS_TEXT = {
  off: "",
  searching: "Direktverbindung: suche die anderen …",
  connected: "Direktverbindung steht",
  failed: "Direktverbindung gescheitert",
} as const;

/**
 * Edit this module together with others: "An Datei zusammen arbeiten" announces the document being
 * edited, saves its password in the file and shows the link others join with (joining and merging a
 * file are in the File menu). The people are connected directly (WebRTC - no server of ours); how
 * (relays, TURN, a sync server) is set once for the app, in its settings window. See core/collab/.
 */
function CollaborationField() {
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const { missing, transfers } = useAssetTransfers();
  const connection = useDirectConnection();
  const live = useDocumentStore((s) => s.live);
  const people = Object.values(usePresence((s) => s.peers));
  const receiving = Object.values(transfers);
  const megabytes = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
  const webRtcAvailable = typeof RTCPeerConnection !== "undefined";
  const serverUrl = readSetting(COLLAB_SERVER_KEY, "").trim();

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(invitationLink() ?? "");
      setCopied(true);
    } catch {
      setError("Kopieren nicht möglich - den Link bitte markieren und von Hand kopieren.");
    }
  }

  return (
    <div className="weft-field">
      <span>Zusammenarbeit</span>
      <p className="weft-hint">
        Einer Einladung beitreten und die Änderungen einer Dateikopie übernehmen: Menü „Datei“.
      </p>
      <p className="weft-hint">Live: Zusammen im selben Lernmodul arbeiten.</p>
      <label className="weft-field weft-field-inline">
        <input
          type="checkbox"
          checked={live !== null}
          disabled={!webRtcAvailable && !serverUrl}
          onChange={(e) => (e.target.checked ? enableLiveCollaboration() : disableLiveCollaboration())}
        />
        <span>An Datei zusammen arbeiten</span>
      </label>
      <p className="weft-hint">
        Jeder mit der Datei oder folgendem Link kann an deiner Datei mitarbeiten, solange du online bist. Passwort steht
        in der Datei selbst drin.
      </p>
      {live && (
        <>
          <input readOnly value={invitationLink() ?? ""} onFocus={(e) => e.currentTarget.select()} title="Diesen Link an andere weitergeben" />
          <button type="button" className="weft-ghost-button weft-full-width" onClick={() => void copyLink()}>
            {copied ? "Kopiert" : "Link kopieren"}
          </button>
          <p className="weft-hint">
            Für Leute, die die Datei nicht haben: Wer den Link hat, kann beitreten und alles ändern. Er bleibt gültig,
            auch wenn du die gespeicherte Datei später wieder öffnest.
          </p>
        </>
      )}
      {live && connection.state === "off" && (
        <button type="button" className="weft-ghost-button weft-full-width" onClick={() => void connectLiveCollaboration(true)}>
          Jetzt verbinden
        </button>
      )}
      {!webRtcAvailable && <p className="weft-placeholder-warning">Dieses System unterstützt keine Direktverbindung (WebRTC).</p>}
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

      <FolderSyncField />

      <div className="weft-divider" />

      <CollaborationField />

      <HistoryField />

      <div className="weft-divider" />

      <label className="weft-field weft-field-inline">
        <input
          type="checkbox"
          checked={content.keyboardNavigationEnabled}
          onChange={(e) => setKeyboardNavigationEnabled(e.target.checked)}
        />
        <span>Navigation per Tastatur und Tippen (Leertaste, Pfeiltasten, Klick auf die Folie)</span>
      </label>
      <p className="weft-hint">
        Mit Leertaste und Pfeiltasten geht es vor und zurück; ein Klick oder Tipp auf die Folie (nicht auf einen Button,
        ein Quiz oder ein anderes bedienbares Element) geht weiter, am linken Rand (das linke Fünftel) zurück. Ausgeschaltet können Lernende nur noch über Buttons
        oder eine Quiz-Auswertung weiterblättern - vor allem nicht mehr zurück, um ein bereits beantwortetes Quiz
        erneut zu versuchen.
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
