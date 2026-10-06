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
import { confirmDestructive, pickFontFile } from "../../../core/io/fileIO";
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

/**
 * Spike: edit this module together with others. "Teilen" announces the document being edited to the
 * sync server (and to other tabs of this browser) and shows the link others join with; "Beitreten"
 * replaces what is open with a document somebody else shares. See core/collab/session.ts.
 */
function CollaborationField() {
  const [server, setServer] = useState(() => {
    try {
      return localStorage.getItem(COLLAB_SERVER_KEY) ?? "ws://localhost:3030";
    } catch {
      return "ws://localhost:3030";
    }
  });
  const [link, setLink] = useState("");
  const [joinLink, setJoinLink] = useState("");
  const [error, setError] = useState("");

  function remember(value: string) {
    setServer(value);
    try {
      localStorage.setItem(COLLAB_SERVER_KEY, value);
    } catch {
      /* not persisted - fine */
    }
  }

  async function join() {
    setError("");
    const ok = await confirmDestructive(
      "Das geöffnete Lernmodul wird durch das geteilte ersetzt. Nicht gespeicherte Änderungen gehen verloren.",
      "Beitreten",
    );
    if (!ok) return;
    try {
      await joinSharedDocument(joinLink.trim(), { serverUrl: server.trim() || undefined });
      setJoinLink("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="weft-field">
      <span>Zusammenarbeit (Test)</span>
      <label className="weft-field">
        <span>Sync-Server</span>
        <input value={server} placeholder="ws://localhost:3030" onChange={(e) => remember(e.target.value)} />
      </label>
      <button
        type="button"
        className="weft-ghost-button weft-full-width"
        onClick={() => setLink(shareCurrentDocument({ serverUrl: server.trim() || undefined }))}
      >
        Dokument teilen
      </button>
      {link && (
        <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} title="Diesen Link an andere weitergeben" />
      )}
      <label className="weft-field">
        <span>Geteiltem Dokument beitreten</span>
        <input value={joinLink} placeholder="automerge:..." onChange={(e) => setJoinLink(e.target.value)} />
      </label>
      <button type="button" className="weft-ghost-button weft-full-width" disabled={!joinLink.trim()} onClick={() => void join()}>
        Beitreten
      </button>
      {error && <p className="weft-placeholder-warning">{error}</p>}
      <p className="weft-hint">
        Nur das Lernmodul selbst wird geteilt, Bilder und Videos noch nicht. Der Server wird mit
        „npm run collab-server“ gestartet.
      </p>
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
