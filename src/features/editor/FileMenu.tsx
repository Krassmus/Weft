import { useEffect, useState } from "react";
import settingsIconSvg from "../../../mockups/icons/admin.svg?raw";
import { readRecentFiles } from "../../core/io/recentFiles";
import { libraryMode } from "../../core/platform";
import { useDocumentStore } from "../../core/document/store";
import { tr } from "../../core/i18n/tr";

export type MenuCommand =
  | "new"
  | "duplicate"
  | "open"
  | "save"
  | "saveAs"
  | "export"
  | "exportPdf"
  | "exportPlayer"
  | "join"
  | "merge"
  | "settings";

/** The commands that act on the module being edited - not available while a player file is shown. */
const EDITING_COMMANDS: MenuCommand[] = [
  "duplicate",
  "save",
  "saveAs",
  "export",
  "exportPdf",
  "exportPlayer",
  "merge",
];

/** The entries. In the library (a tablet, see libraryMode) "Öffnen" shows the library, and "Speichern unter" - which an app there
 * can't do - becomes handing on a copy of the module. */
function items(): ({ command: MenuCommand; label: string } | "separator")[] {
  const library = libraryMode();
  return [
    { command: "new", label: tr("ui.new") },
    { command: "duplicate", label: tr("ui.duplicate") },
    "separator",
    { command: "open", label: library ? "Lernmodule…" : tr("ui.open_2") },
    { command: "join", label: tr("ui.join_invitation") },
    "separator",
    { command: "save", label: tr("ui.save") },
    {
      command: "saveAs",
      label: library ? "Weft-Datei teilen…" : tr("ui.save_as"),
    },
    { command: "export", label: tr("ui.export") },
    { command: "exportPdf", label: tr("ui.export_as_pdf") },
    { command: "exportPlayer", label: tr("ui.export_player_file") },
    { command: "merge", label: tr("ui.merge_with_file_2") },
    "separator",
    { command: "settings", label: tr("ui.settings_2") },
  ];
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * The "Datei" menu for where there is no menu bar (a browser, a tablet - see hasNativeMenu): the same entries as the
 * desktop app's File menu, plus the files opened last. `playerShown`: a player file is on screen, so what acts on the
 * module being edited is greyed out, as in the desktop menu.
 */
export function FileMenu({
  onCommand,
  onOpenRecent,
  playerShown = false,
}: {
  onCommand: (command: MenuCommand) => void;
  onOpenRecent: (path: string) => void;
  playerShown?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setRecent(readRecentFiles());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div className="weft-filemenu">
      <button
        type="button"
        className="weft-filemenu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {tr("ui.file")}
      </button>
      {open && (
        <>
          <div
            className="weft-filemenu-backdrop"
            onClick={() => setOpen(false)}
          />
          <div className="weft-filemenu-popup" role="menu">
            {items().map((item, i) =>
              item === "separator" ? (
                <div
                  key={`separator-${i}`}
                  className="weft-filemenu-separator"
                />
              ) : (
                <button
                  key={item.command}
                  type="button"
                  role="menuitem"
                  className="weft-filemenu-item"
                  disabled={
                    playerShown && EDITING_COMMANDS.includes(item.command)
                  }
                  onClick={() => choose(() => onCommand(item.command))}
                >
                  {item.label}
                </button>
              ),
            )}
            {recent.length > 0 && (
              <>
                <div className="weft-filemenu-separator" />
                <div className="weft-filemenu-heading">{tr("ui.recent")}</div>
                {recent.map((path) => (
                  <button
                    key={path}
                    type="button"
                    role="menuitem"
                    className="weft-filemenu-item weft-filemenu-recent"
                    title={path}
                    onClick={() => choose(() => onOpenRecent(path))}
                  >
                    {fileName(path)}
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** The bar above the editor where there is no menu bar: the File menu, undo and redo. */
export function AppBar({
  onCommand,
  onOpenRecent,
}: {
  onCommand: (command: MenuCommand) => void;
  onOpenRecent: (path: string) => void;
}) {
  const canUndo = useDocumentStore((s) => s.undoIndex >= 0);
  const canRedo = useDocumentStore(
    (s) => s.undoIndex < s.undoHistory.length - 1,
  );
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);
  return (
    <div className="weft-appbar">
      <FileMenu onCommand={onCommand} onOpenRecent={onOpenRecent} />
      <button
        type="button"
        className="weft-appbar-button"
        title={tr("ui.undo")}
        aria-label={tr("ui.undo")}
        disabled={!canUndo}
        onClick={undo}
      >
        ↶
      </button>
      <button
        type="button"
        className="weft-appbar-button"
        title={tr("ui.redo")}
        aria-label={tr("ui.redo")}
        disabled={!canRedo}
        onClick={redo}
      >
        ↷
      </button>
      {/* The app's settings (language, profile, network): the desktop app has them in its menu bar and a window of their own. */}
      <button
        type="button"
        className="weft-appbar-button weft-appbar-icon"
        title={tr("ui.settings")}
        aria-label={tr("ui.settings")}
        onClick={() => onCommand("settings")}
        dangerouslySetInnerHTML={{ __html: settingsIconSvg }}
      />
    </div>
  );
}
