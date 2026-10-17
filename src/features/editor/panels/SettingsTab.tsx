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
  addPaletteColor,
  movePaletteColor,
  removeCustomFont,
  removePaletteColor,
  setPaletteColor,
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
  folderSyncAvailable,
  startFolderSync,
  stopFolderSync,
  useFolderSync,
} from "../../../core/collab/folder/folderSession";
import type { FolderPeer } from "../../../core/collab/folder/folderSync";
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
import fileIconSvg from "../../../../mockups/icons/file.svg?raw";
import folderCloudIconSvg from "../../../../mockups/icons/folder-cloud.svg?raw";
import trashIconSvg from "../../../../mockups/icons/trash.svg?raw";
import { countColorUsage } from "../../../core/colors/usage";
import { ColorField } from "../ColorField";
import { DialogFrame } from "../CollabDialogs";
import { folderLostText } from "../FolderLostDialog";
import { tr } from "../../../core/i18n/tr";

const CUSTOM_VALUE = "custom";

/** What new scheme colours start as, in this order (the person changes them right away). */
const NEW_PALETTE_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#f5b83d", "#a66cff", "#111827", "#ffffff"];

/** The module's colour scheme (WeftModule.colorPalette): colours every colour picker offers. Here only shown - the colours, and
 * the dialog to change them (ColorSchemeDialog) behind a click on them. A colour can also be added from a picker itself ("Add to
 * color scheme"). */
function ColorSchemeField() {
  const palette = useDocumentStore((s) => s.doc.content.colorPalette) ?? [];
  const [open, setOpen] = useState(false);
  return (
    <div className="weft-field">
      <span>{tr("ui.colour_scheme")}</span>
      {palette.length === 0 ? (
        <button type="button" className="weft-ghost-button weft-full-width" onClick={() => setOpen(true)}>
          {tr("ui.configure_colour_scheme")}
        </button>
      ) : (
        <div className="weft-color-palette-row">
          {palette.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="weft-color-cell"
              style={{ ["--swatch" as string]: entry.color }}
              title={tr("ui.configure_colour_scheme")}
              aria-label={tr("ui.configure_colour_scheme")}
              onClick={() => setOpen(true)}
            />
          ))}
        </div>
      )}
      {open && <ColorSchemeDialog onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Where the colours of the scheme are changed, removed and added: a small table - the colour, how often the slides use it, and the
 * way to remove it. */
function ColorSchemeDialog({ onClose }: { onClose: () => void }) {
  const { bind } = useDragReorder();
  const palette = useDocumentStore((s) => s.doc.content.colorPalette) ?? [];
  const pages = useDocumentStore((s) => s.doc.content.pages);
  const layouts = useDocumentStore((s) => s.doc.content.layouts);
  const colorKey = palette.map((c) => c.color).join(",");
  const usage = useMemo(() => countColorUsage({ pages, layouts }, palette.map((c) => c.color)), [pages, layouts, colorKey]);
  return (
    <DialogFrame title={tr("ui.colour_scheme")} onClose={onClose} floating>
      <p className="weft-hint">{tr("ui.colour_scheme_hint")}</p>
      {palette.length > 0 && (
        <table className="weft-color-table">
          <thead>
            <tr>
              <th>{tr("ui.colour")}</th>
              <th>{tr("ui.colour_used")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {palette.map((entry, index) => {
              const { dragClassName, ...dragAttrs } = bind("color", COLOR_LIST_ID, index, (_container, to) => movePaletteColor(entry.id, to));
              return (
                <tr key={entry.id} className={dragClassName} {...dragAttrs}>
                  <td>
                    <ColorField value={entry.color} ariaLabel={tr("ui.colour")} hideScheme onChange={(color) => setPaletteColor(entry.id, color)} />
                  </td>
                  <td className="weft-color-table-count">{usage[index]}</td>
                  <td>
                    <button
                      type="button"
                      className="weft-icon-button weft-trash-button"
                      title={tr("ui.remove_colour")}
                      aria-label={tr("ui.remove_colour")}
                      onClick={() => {
                        void confirmDestructive(tr("ui.really_delete_colour"), tr("ui.delete_colour")).then((ok) => {
                          if (ok) removePaletteColor(entry.id);
                        });
                      }}
                      dangerouslySetInnerHTML={{ __html: trashIconSvg }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="weft-modal-actions">
        <button type="button" className="weft-ghost-button" onClick={() => addPaletteColor(unusedPaletteColor(palette.map((c) => c.color)))}>
          {tr("ui.add_colour")}
        </button>
        <button type="button" className="weft-ghost-button" onClick={onClose}>
          {tr("ui.close")}
        </button>
      </div>
    </DialogFrame>
  );
}

/** A start colour for a new scheme colour that is not in the scheme yet (adding a duplicate does nothing). */
function unusedPaletteColor(taken: string[]): string {
  const used = new Set(taken.map((c) => c.toLowerCase()));
  const free = NEW_PALETTE_COLORS.find((c) => !used.has(c));
  if (free) return free;
  for (let n = 1; n < 256; n++) {
    const candidate = `#${(n * 0x010203).toString(16).padStart(6, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
  return "#808080";
}

const LANGUAGE_LIST_ID = "languages";
const COLOR_LIST_ID = "colors";

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
      <span>{tr("ui.languages")}</span>
      {languages.length > 0 && (
        <ul className="weft-language-list">
          {languages.map((locale, index) => {
            const { dragClassName, ...dragAttrs } = bind("language", LANGUAGE_LIST_ID, index, (_container, to) => move(index, to));
            return (
              <li key={locale} className={"weft-language-row" + dragClassName} {...dragAttrs}>
                <span className="weft-language-row-flag">{flagForLocale(locale)}</span>
                <span className="weft-language-row-name">{languageName(locale, uiLanguage)}</span>
                {index === 0 && <span className="weft-language-row-default">{tr("ui.default")}</span>}
                <button
                  type="button"
                  className="weft-icon-button"
                  title={tr("ui.remove_language")}
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
            placeholder={tr("ui.search_language")}
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
            {candidates.length === 0 && <li className="weft-hint">{tr("ui.no_matching_language")}</li>}
          </ul>
          <button type="button" className="weft-ghost-button weft-full-width" onClick={() => setAdding(false)}>
            {tr("ui.done")}
          </button>
        </div>
      ) : (
        <button type="button" className="weft-ghost-button weft-full-width" onClick={() => setAdding(true)}>
          {tr("ui.add_language")}
        </button>
      )}
      <p className="weft-hint">
        {tr("ui.without_a_selection_the_learning_module")}
      </p>
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
        <span>{tr("ui.aspect_ratio")}</span>
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
          <option value={CUSTOM_VALUE}>{tr("ui.other_ratio")}</option>
        </select>
      </label>
      {customMode && (
        <>
          <div className="weft-aspect-custom">
            <input
              type="number"
              min={0}
              step="any"
              aria-label={tr("ui.width")}
              value={draft.width}
              onChange={(e) => change({ ...draft, width: e.target.value })}
            />
            <span>:</span>
            <input
              type="number"
              min={0}
              step="any"
              aria-label={tr("ui.height")}
              value={draft.height}
              onChange={(e) => change({ ...draft, height: e.target.value })}
            />
            <AspectRatioSketch aspect={valid ? Number(draft.width) / Number(draft.height) : aspectRatioNumeric(aspectRatio)} />
          </div>
          {!valid && (
            <p className="weft-variable-problem">
              {tr("ui.aspect_ratio_invalid", { max: MAX_ASPECT })}
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
    <div className="weft-aspect-sketch" title={tr("ui.this_is_what_the_aspect_ratio")}>
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
/** A person who has changed the module within this long (ms) counts as working on it right now. */
const ACTIVE_WITHIN_MS = 3 * 60 * 1000;

/** The other people with a copy of the module in the folder, as avatars (their names show on hovering). A person with several computers is
 * one. Those who changed the module in the last three minutes are lit, the others are greyed. */
function FolderPeers({ peers }: { peers: FolderPeer[] }) {
  // (Re-drawn from time to time: somebody stops being "active" without anything happening.)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const people = new Map<string, { peer: FolderPeer; active: boolean }>();
  for (const peer of peers) {
    const key = peer.name ? `name:${peer.name}` : `id:${peer.id}`;
    const active = peer.editedAt !== null && now - peer.editedAt <= ACTIVE_WITHIN_MS;
    const earlier = people.get(key);
    people.set(key, { peer: earlier?.peer ?? peer, active: (earlier?.active ?? false) || active });
  }
  const list = [...people.values()].sort((a, b) => a.peer.name.localeCompare(b.peer.name));
  return (
    <div className="weft-folder-peers">
      {list.length === 0 ? (
        <span className="weft-hint">{tr("ui.folder_nobody_else")}</span>
      ) : (
        <>
          <span className="weft-hint">{tr("ui.folder_working_with")}</span>
          {list.map(({ peer, active }) => {
            const name = peer.name || tr("ui.unknown_person");
            return (
              <PersonAvatar
                key={peer.id}
                name={active ? tr("ui.folder_peer_active", { name }) : name}
                color={presenceColor(peer.id)}
                avatar={peer.avatar}
                size={26}
                className={active ? "weft-folder-peer is-active" : "weft-folder-peer is-idle"}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

/** File and folder are two things: the picture above the folder's state - this module's file, the shared folder, and the sync between them. */
function FolderLinkGraphic() {
  return (
    <div className="weft-folder-link-graphic" aria-hidden="true">
      <span className="weft-folder-link-icon" title={tr("ui.folder_graphic_file")} dangerouslySetInnerHTML={{ __html: fileIconSvg }} />
      <span className="weft-folder-link-line" />
      <span className="weft-folder-link-icon" title={tr("ui.folder_graphic_folder")} dangerouslySetInnerHTML={{ __html: folderCloudIconSvg }} />
    </div>
  );
}

function FolderSyncField() {
  const sync = useFolderSync();
  const [error, setError] = useState("");

  if (!folderSyncAvailable()) {
    return (
      <div className="weft-field">
        <span>{tr("ui.folder_sync")}</span>
        <p className="weft-hint">{tr("ui.syncing_through_a_shared_folder_is")}</p>
      </div>
    );
  }

  async function chooseAndStart() {
    setError("");
    const folder = await chooseSyncFolder();
    if (folder) await startFolderSync(folder);
  }

  function disconnect() {
    void confirmDestructive(tr("ui.really_stop_folder_sync"), tr("ui.disconnect_folder")).then((ok) => {
      if (ok) stopFolderSync(true);
    });
  }

  const { status } = sync;
  // (The module's own directory in the shared folder: that is what is synced with.)
  const path = sync.folder && sync.dir ? `${sync.folder.replace(/[\\/]+$/, "")}/${sync.dir}` : (sync.folder ?? "");
  return (
    <div className="weft-field">
      <span>{tr("ui.folder_sync")}</span>
      {sync.active ? (
        <>
          <FolderLinkGraphic />
          <p className="weft-hint weft-folder-sync-state">
            {tr("ui.folder_sync_state_on", { path })}
            <br />
            {status.lastSyncAt
              ? tr("ui.last_synced_at", { time: new Date(status.lastSyncAt).toLocaleTimeString() })
              : tr("ui.syncing")}
            {status.missingMedia > 0 && ` - ${tr("ui.media_missing_still", { count: status.missingMedia, what: tr(status.missingMedia === 1 ? "ui.image_video_missing_one" : "ui.image_video_missing_many") })}`}
          </p>
          <FolderPeers peers={status.peers} />
          <button type="button" className="weft-ghost-button weft-full-width" onClick={disconnect}>
            {tr("ui.stop_syncing")}
          </button>
        </>
      ) : (
        sync.lost ? (
          <>
            <p className="weft-placeholder-warning">{folderLostText(sync.lost)}</p>
            <p className="weft-hint">{tr("ui.folder_lost_explain")}</p>
            <button type="button" className="weft-ghost-button weft-full-width" onClick={() => void chooseAndStart()}>
              {tr("ui.folder_lost_choose")}
            </button>
            <button type="button" className="weft-ghost-button weft-full-width" onClick={disconnect}>
              {tr("ui.disconnect_folder")}
            </button>
          </>
        ) : (
          <>
            <p className="weft-hint weft-folder-sync-state">{tr("ui.folder_sync_state_off")}</p>
            <button type="button" className="weft-ghost-button weft-full-width" onClick={() => void chooseAndStart()}>
              {tr("ui.choose_folder_and_sync")}
            </button>
          </>
        )
      )}
      {status.error && <p className="weft-placeholder-warning">{status.error}</p>}
      {error && <p className="weft-placeholder-warning">{error}</p>}
      <p className="weft-hint">{tr("ui.sync_with_a_folder_that_a")}</p>
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
      tr("ui.compact_confirm", { size: formatBytes(COMPACT_KEEP_BYTES) }) +
        `\n\n${tr("ui.compact_copies")}` +
        (together ? `\n\n${tr("ui.compact_connection")}` : ""),
      tr("ui.reduce_history"),
    );
    if (!ok) return;
    setBusy(true);
    try {
      if (await compactHistory()) setStats(null);
      else window.alert(tr("ui.the_learning_module_was_changed_in"));
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
        <span>{tr("ui.change_history")}</span>
        <p className="weft-hint">
          {tr("ui.history_explainer", { size: formatBytes(stats.historyBytes), changes: stats.changes.toLocaleString() })}
        </p>
        <button type="button" className="weft-ghost-button weft-full-width" disabled={busy} onClick={() => void compact()}>
          {busy ? tr("ui.reducing") : tr("ui.reduce_history_2")}
        </button>
      </div>
    </>
  );
}

const DIRECT_STATUS_TEXT = {
  off: "",
  // (While it is looking for the others nothing is said - only when it has found them or has not.)
  searching: "",
  get connected() { return tr("ui.direct_connection_established"); },
  get failed() { return tr("ui.direct_connection_failed"); },
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
      setError(tr("ui.copying_is_not_possible_please_select"));
    }
  }

  return (
    <div className="weft-field">
      <span>{tr("ui.collaboration")}</span>
      <label className="weft-field weft-field-inline">
        <input
          type="checkbox"
          checked={live !== null}
          disabled={!webRtcAvailable && !serverUrl}
          onChange={(e) => (e.target.checked ? enableLiveCollaboration() : disableLiveCollaboration())}
        />
        <span>{tr("ui.work_on_the_file_together")}</span>
      </label>
      {live && (
        <>
          <input readOnly value={invitationLink() ?? ""} onFocus={(e) => e.currentTarget.select()} title={tr("ui.pass_this_link_on_to_others")} />
          <button type="button" className="weft-ghost-button weft-full-width" onClick={() => void copyLink()}>
            {copied ? tr("ui.copied") : tr("ui.copy_link")}
          </button>
          <p className="weft-hint">
            {tr("ui.for_people_who_do_not_have")}
          </p>
        </>
      )}
      {live && connection.state === "off" && (
        <button type="button" className="weft-ghost-button weft-full-width" onClick={() => void connectLiveCollaboration(true)}>
          {tr("ui.connect_now")}
        </button>
      )}
      {!webRtcAvailable && <p className="weft-placeholder-warning">{tr("ui.this_system_does_not_support_direct")}</p>}
      {error && <p className="weft-placeholder-warning">{error}</p>}
      {(connection.state === "connected" || connection.state === "failed" || connection.error) && (
        <p className={connection.state === "failed" ? "weft-placeholder-warning" : "weft-hint"}>
          {DIRECT_STATUS_TEXT[connection.state]}
          {connection.state === "connected" && ` (${connection.peers} ${connection.peers === 1 ? tr("ui.person") : tr("ui.people")})`}
          {connection.error && ` - ${connection.error}`}
        </p>
      )}
      {people.length > 0 && (
        <div className="weft-presence-list">
          <span className="weft-hint">{tr("ui.currently_working")}</span>
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
          {tr("ui.media")} {missing} {missing === 1 ? tr("ui.file_missing_2") : tr("ui.files_missing")}
          {receiving.length > 0 &&
            ` - ${tr("ui.transferring", {
              done: megabytes(receiving.reduce((sum, t) => sum + Math.min(t.size, t.received * 48 * 1024), 0)),
              total: megabytes(receiving.reduce((sum, t) => sum + t.size, 0)),
            })}`}
          . {tr("ui.media_come_from_others")}
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
        <span>{tr("ui.title")}</span>
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
        <span>{tr("ui.navigation_with_keyboard_and_tapping_space")}</span>
      </label>
      <p className="weft-hint">
        {tr("ui.space_and_the_arrow_keys_go")}
      </p>

      <div className="weft-divider" />

      <ColorSchemeField />

      <div className="weft-divider" />

      <div className="weft-field">
        <span>{tr("ui.own_fonts")}</span>
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
                  title={tr("ui.remove")}
                  onClick={() => {
                    void confirmDestructive(tr("ui.really_remove_the_font", { family: font.family }), tr("ui.remove_font")).then(
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
          {tr("ui.upload_your_own_font_2")}
        </button>
        <p className="weft-hint">
          {tr("ui.uploaded_fonts_are_available_in_the")}
        </p>
      </div>
    </div>
  );
}
