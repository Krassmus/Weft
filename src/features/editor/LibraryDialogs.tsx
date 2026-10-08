import { useEffect, useState } from "react";
import { useDocumentStore } from "../../core/document/store";
import { flushAutosave } from "../../core/io/autosave";
import { confirmDestructive } from "../../core/io/fileIO";
import { useExportReady } from "../../core/io/exportReadyStore";
import { importModuleFromFiles } from "../../core/io/importModule";
import { deleteLibraryFile, listLibrary, readLibraryFile, renameLibraryFile, writeExport } from "../../core/io/library";
import type { LibraryEntry } from "../../core/io/library";
import { forgetRecentFile, syncRecentMenu } from "../../core/io/recentFiles";
import { canShareFile, shareFile } from "../../core/io/share";
import { DialogFrame } from "./CollabDialogs";
import { useCollabDialog } from "./collabDialogStore";

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(ms: number): string {
  return ms ? new Date(ms).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "";
}

/**
 * "Öffnen" on a tablet (see libraryMode): the modules in the library, to open, rename, share or delete - and the way in for
 * modules from elsewhere (a copy is made, see importModuleFromFiles). `currentPath` is the module that is open: it can be
 * renamed, but not deleted from under the editor.
 */
function LibraryDialog({ onClose, onOpen, currentPath }: { onClose: () => void; onOpen: (path: string) => void; currentPath: string | null }) {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; name: string } | null>(null);

  async function reload() {
    try {
      setEntries(await listLibrary());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  useEffect(() => void reload(), []);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function open(path: string) {
    onClose();
    if (path !== currentPath) onOpen(path);
  }

  const importFromFiles = () =>
    run(async () => {
      const path = await importModuleFromFiles();
      if (path) open(path);
    });

  const rename = () =>
    run(async () => {
      if (!renaming) return;
      // (A save that is on its way writes to the old name - let it finish first, or it would bring the old file back.)
      if (renaming.path === currentPath) await flushAutosave();
      const newPath = await renameLibraryFile(renaming.path, renaming.name);
      // What remembers the old name (the last file, the recent ones) follows - and so does the open module's own path.
      if (renaming.path === currentPath) {
        useDocumentStore.setState({ filePath: newPath });
      } else {
        syncRecentMenu(forgetRecentFile(renaming.path));
      }
      setRenaming(null);
      setActionsFor(null);
      await reload();
    });

  const share = (entry: LibraryEntry) =>
    run(async () => {
      const bytes = await readLibraryFile(entry.path);
      const path = await writeExport(`${entry.name}.weft`, bytes);
      onClose();
      useExportReady.getState().show({ name: path.split("/").pop() ?? entry.name, path, bytes });
    });

  const remove = (entry: LibraryEntry) =>
    run(async () => {
      if (!(await confirmDestructive(`„${entry.name}“ wird endgültig gelöscht.`, "Lernmodul löschen"))) return;
      await deleteLibraryFile(entry.path);
      syncRecentMenu(forgetRecentFile(entry.path));
      setActionsFor(null);
      await reload();
    });

  return (
    <DialogFrame title="Lernmodule" onClose={onClose}>
      <div className="weft-library">
        {entries === null ? (
          <p className="weft-hint">Lade …</p>
        ) : entries.length === 0 ? (
          <p className="weft-hint">Noch keine Lernmodule.</p>
        ) : (
          <ul className="weft-library-list">
            {entries.map((entry) => (
              <li key={entry.path} className="weft-library-row">
                {renaming?.path === entry.path ? (
                  <div className="weft-library-rename">
                    <input autoFocus value={renaming.name} onChange={(e) => setRenaming({ path: entry.path, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void rename()} />
                    <button type="button" className="weft-ghost-button" disabled={busy || !renaming.name.trim()} onClick={() => void rename()}>
                      OK
                    </button>
                    <button type="button" className="weft-ghost-button" onClick={() => setRenaming(null)}>
                      Abbrechen
                    </button>
                  </div>
                ) : (
                  <>
                    <button type="button" className="weft-library-open" onClick={() => open(entry.path)}>
                      <span className="weft-library-name">
                        {entry.name}
                        {entry.path === currentPath && <em> (geöffnet)</em>}
                      </span>
                      <span className="weft-library-meta">
                        {formatDate(entry.modified)} · {formatSize(entry.size)}
                      </span>
                    </button>
                    <button type="button" className="weft-icon-button weft-library-more" title="Mehr" aria-label="Mehr" onClick={() => setActionsFor(actionsFor === entry.path ? null : entry.path)}>
                      ⋯
                    </button>
                  </>
                )}
                {actionsFor === entry.path && !renaming && (
                  <div className="weft-library-actions">
                    <button type="button" className="weft-ghost-button" disabled={busy} onClick={() => setRenaming({ path: entry.path, name: entry.name })}>
                      Umbenennen
                    </button>
                    <button type="button" className="weft-ghost-button" disabled={busy} onClick={() => void share(entry)}>
                      Teilen …
                    </button>
                    <button type="button" className="weft-ghost-button" disabled={busy || entry.path === currentPath} title={entry.path === currentPath ? "Das geöffnete Lernmodul lässt sich nicht löschen" : undefined} onClick={() => void remove(entry)}>
                      Löschen
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="weft-placeholder-warning">{error}</p>}
        <div className="weft-modal-actions">
          <button type="button" className="weft-ghost-button" disabled={busy} onClick={() => void importFromFiles()}>
            Aus Dateien importieren …
          </button>
        </div>
        <p className="weft-hint">Die Lernmodule liegen auch in der Dateien-App unter „Auf meinem iPad“ › Weft - dort lassen sich Dateien hinein- und herauskopieren.</p>
      </div>
    </DialogFrame>
  );
}

/** After an export (or "Teilen …" in the library): the file is kept in the Files app already; here it can be handed on. */
function ExportReadyDialog({ onClose }: { onClose: () => void }) {
  const file = useExportReady((s) => s.file);
  const [error, setError] = useState("");
  if (!file) return null;
  const canShare = canShareFile(file.name, file.bytes);

  async function share() {
    if (!file) return;
    setError("");
    try {
      if (await shareFile(file.name, file.bytes)) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <DialogFrame title="Datei bereit" onClose={onClose}>
      <p>
        „{file.name}“ ist fertig und liegt in der Dateien-App unter „Auf meinem iPad“ › Weft › Exporte.
      </p>
      {error && <p className="weft-placeholder-warning">{error}</p>}
      <div className="weft-modal-actions">
        {canShare && (
          <button type="button" className="weft-primary-button" onClick={() => void share()}>
            Teilen …
          </button>
        )}
        <button type="button" className="weft-ghost-button" onClick={onClose}>
          Fertig
        </button>
      </div>
    </DialogFrame>
  );
}

/** The dialogs of the library (see libraryMode). `onOpen` opens a module of the library (it asks first if something
 * would be lost, see EditorShell.tsx). */
export function LibraryDialogs({ onOpen, currentPath }: { onOpen: (path: string) => void; currentPath: string | null }) {
  const open = useCollabDialog((s) => s.open);
  const close = useCollabDialog((s) => s.close);
  const ready = useExportReady((s) => s.file);
  const closeReady = useExportReady((s) => s.close);
  return (
    <>
      {open === "library" && <LibraryDialog onClose={close} onOpen={onOpen} currentPath={currentPath} />}
      {ready && <ExportReadyDialog onClose={closeReady} />}
    </>
  );
}
