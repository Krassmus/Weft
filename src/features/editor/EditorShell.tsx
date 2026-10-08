import { syncFolderForCurrentDocument } from "../../core/collab/folder/folderSession";
import { syncLiveForCurrentDocument } from "../../core/collab/session";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createEmptyDocument } from "../../core/document/createEmptyDocument";
import { plain } from "../../core/document/plain";
import { useDocumentStore } from "../../core/document/store";
import { createId } from "../../core/id";
import { usePlayerStore } from "../../core/player/playerStore";
import { useCustomFontRegistration } from "../../core/fonts/registerCustomFonts";
import { useSyncMenuLanguage } from "../../core/i18n/useSyncMenuLanguage";
import { useTranslation } from "../../core/i18n/useTranslation";
import { startDeepLinks } from "../../core/deepLink";
import { flushAutosave, startAutosave } from "../../core/io/autosave";
import {
  clearRecoveryCopy,
  confirmDestructive,
  exportAsHtmlModule,
  exportPlayerFile,
  isTauri,
  openDocument,
  openDocumentAtPath,
  readRecoveryCopy,
  saveDocumentAs,
  saveDocumentToPath,
  saveRecoveryCopy,
} from "../../core/io/fileIO";
import { forgetRecentFile, rememberRecentFile, syncRecentMenu } from "../../core/io/recentFiles";
import type { WeftDocument } from "../../core/types";
import { enterFullscreenPreview, watchFullscreenExit } from "../../core/window/fullscreen";
import { Canvas } from "./Canvas";
import { AppBar, FileMenu } from "./FileMenu";
import type { MenuCommand } from "./FileMenu";
import { CollabDialogs } from "./CollabDialogs";
import { useCollabDialog } from "./collabDialogStore";
import { Inspector } from "./Inspector";
import { PresentationView } from "./PresentationView";
import { hasNativeMenu } from "../../core/platform";
import { PlayerShell } from "../player/PlayerShell";
import { Sidebar } from "./Sidebar";
import { useCopyPaste } from "./useCopyPaste";
import { useDeleteSelection } from "./useDeleteSelection";

const SIDEBAR_WIDTH_MIN = 220;
const SIDEBAR_WIDTH_MAX = 560;
const SIDEBAR_WIDTH_DEFAULT = 260;

// Which module to silently re-open on the next launch - just a path string, so plain
// localStorage rather than anything in the document/undo model itself; it's a UI convenience,
// not part of any module's own content. Wrapped in try/catch everywhere it's touched since
// localStorage can throw in a locked-down webview context (private mode et al elsewhere), and
// "can't remember the last file" should never be why the app fails to start.
const LAST_PATH_KEY = "weft:lastOpenedPath";

function rememberLastPath(path: string | null) {
  try {
    if (path) localStorage.setItem(LAST_PATH_KEY, path);
  } catch {
    // Not fatal - just means next launch starts on a blank document instead.
  }
}

function forgetLastPath() {
  try {
    localStorage.removeItem(LAST_PATH_KEY);
  } catch {
    // Already unreadable/unwritable, so there's nothing to clear anyway.
  }
}

function readLastPath(): string | null {
  try {
    return localStorage.getItem(LAST_PATH_KEY);
  } catch {
    return null;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function EditorShell() {
  const { t } = useTranslation();
  useSyncMenuLanguage();
  const doc = useDocumentStore((s) => s.doc);
  const filePath = useDocumentStore((s) => s.filePath);
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);
  const loadDocument = useDocumentStore((s) => s.loadDocument);
  const documentKey = useDocumentStore((s) => s.documentKey);
  // A player file Weft is playing instead of showing the editor (see features/player/): while it is, nothing
  // here may act on the module that is open underneath.
  const player = usePlayerStore((s) => s.player);
  const openPlayer = usePlayerStore((s) => s.open);
  const playerRef = useRef(player);
  playerRef.current = player;
  const [presenting, setPresenting] = useState(false);
  // Which page "Abspielen" should open on - captured once when it's clicked (see Canvas.tsx,
  // which resolves it from whatever's currently selected), not read live while presenting, since
  // there's no selection UI to keep it in sync with once PresentationView has taken over anyway.
  const [presentStartPageId, setPresentStartPageId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_WIDTH_DEFAULT);

  // Dragging the splitter only ever changes the sidebar's own width - the canvas column is "1fr"
  // in the grid below, so it's always the one that gives up (or gets back) the space. startWidth
  // is captured once here and never re-read from state, so this stays correct across the whole
  // drag even though sidebarWidth itself changes (and re-renders this component) on every move.
  function handleResizerPointerDown(e: ReactPointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    function onMove(ev: PointerEvent) {
      const next = Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, startWidth + (ev.clientX - startX)));
      setSidebarWidth(next);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.classList.remove("weft-dragging");
      document.body.style.cursor = "";
    }

    document.body.style.cursor = "col-resize";
    document.body.classList.add("weft-dragging");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // If fullscreen is exited from outside our own controls (Escape, the native macOS toggle, a
  // touch swipe, ...) leave presentation mode too, so the two never fall out of sync.
  useEffect(() => watchFullscreenExit(() => setPresenting(false)), []);

  // Disabled while presenting: there's no selection UI to copy/paste against there, and the
  // listener would otherwise silently act on whatever was selected before presenting started.
  useCopyPaste(!presenting && !player);
  useDeleteSelection(!presenting && !player);
  useCustomFontRegistration();

  // Keeps the native title bar (next to the traffic-light buttons) showing which module is
  // open instead of a static "Weft" - EditorShell is only ever the main window (the settings
  // window renders SettingsWindow instead, see App.tsx's isSettingsWindow()), so this never
  // fights over the title with anything else.
  useEffect(() => {
    if (!isTauri()) return;
    const title = (player ? player.title : doc.content.title).trim();
    // Needs its own explicit "core:window:allow-set-title" capability grant (see
    // src-tauri/capabilities/default.json) - Tauri 2's default core permissions don't include
    // it, so without that this call is silently denied and the title bar just never updates,
    // with nothing surfaced to the user. Logged (not alert()ed) if it ever happens again for
    // some other reason - a stale title bar isn't worth interrupting anyone over.
    getCurrentWindow()
      .setTitle(title ? `Weft - ${title}` : "Weft")
      .catch((err: unknown) => console.error("Failed to update window title:", err));
  }, [doc.content.title, player]);

  // Whichever file Öffnen/Speichern most recently pointed at - not "Exportieren", which never
  // touches filePath at all, matching that an export is a delivery artifact, not "the module
  // you're working on". Re-saving the same reference on every render would be harmless but
  // pointless, so this only fires when filePath itself actually changes.
  // (A player file counts as the file open, too: that is what the next launch comes back to.)
  const currentPath = player ? player.path : filePath;
  useEffect(() => rememberLastPath(currentPath), [currentPath]);
  // The same file goes to the top of "Datei > Zuletzt geöffnet" (also once on launch, which is what
  // fills the native menu with the list of the last session).
  useEffect(() => syncRecentMenu(rememberRecentFile(currentPath)), [currentPath]);
  // Any module that gets loaded takes the window back from the player.
  useEffect(() => usePlayerStore.getState().close(), [documentKey]);
  // The menu items that act on the module being edited are greyed out while a player file is shown.
  useEffect(() => {
    if (isTauri()) void invoke("set_player_mode", { active: player !== null }).catch(() => undefined);
  }, [player !== null]);

  // Silently re-opens whatever was last open, once, on launch - only in Tauri (see
  // openDocumentAtPath) and only if nothing has already loaded a real document in the meantime
  // (the empty check guards against the - currently impossible, but cheap to guard anyway -
  // case of a user managing to open something else before this async read resolves). A path
  // that's since been moved/renamed/deleted just falls back to the normal blank document rather
  // than greeting a returning user with an error dialog for something that isn't their fault
  // right now; it also forgets that path so this doesn't keep silently failing every launch.
  const restoredRef = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    const lastPath = readLastPath();
    if (!lastPath) {
      // Nothing was ever saved to a file - but a module that was being worked on may have been
      // autosaved to the recovery copy (see core/io/fileIO.ts), so pick up where it left off.
      restoredRef.current = readRecoveryCopy()
        .then((doc) => {
          if (doc && useDocumentStore.getState().filePath === null) loadDocument(doc, null);
        })
        .catch(() => undefined);
      return;
    }
    restoredRef.current = openDocumentAtPath(lastPath)
      .then((opened) => {
        if (!opened || useDocumentStore.getState().filePath !== null) return;
        if (opened.kind === "player") openPlayer(opened.player, lastPath);
        else loadDocument(opened.doc, lastPath);
      })
      .catch(() => forgetLastPath());
  }, []);

  // A click on an invitation link ("weft:...") anywhere on the computer opens Weft and joins (see
  // core/deepLink.ts) - after the module that was open last has been restored, which a join would
  // otherwise be replaced by.
  useEffect(() => (isTauri() ? startDeepLinks(restoredRef.current) : undefined), []);

  // A module that is synced with a shared folder (see core/collab/folder/) picks that up again whenever
  // it is opened - and the sync of the module that was open before ends.
  useEffect(() => {
    void syncFolderForCurrentDocument();
    // ...and a file that is an invitation to live collaboration connects (see core/collab/session.ts).
    void syncLiveForCurrentDocument();
  }, [documentKey]);

  // Saves in the background whenever there are unsaved changes (see core/io/autosave.ts). A ref
  // for the message so a language change doesn't restart it - the subscription itself is
  // one-time.
  const autosaveFailedRef = useRef("");
  autosaveFailedRef.current = t("toolbar.autosaveFailed");
  useEffect(() => startAutosave(() => alert(autosaveFailedRef.current)), []);

  // Closing the window or quitting (see src-tauri/src/lib.rs, which holds the exit back and asks
  // for this): finish saving first, then end the app. If saving is impossible, the user decides -
  // quit and lose the unsaved changes, or stay and keep working.
  const quitMessagesRef = useRef({ message: "", title: "" });
  quitMessagesRef.current = { message: t("toolbar.quitSaveFailed"), title: t("toolbar.quitSaveFailedTitle") };
  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = listen("weft://flush-before-exit", async () => {
      try {
        await flushAutosave();
      } catch {
        const { message, title } = quitMessagesRef.current;
        if (!(await confirmDestructive(message, title))) {
          await invoke("cancel_exit");
          return;
        }
      }
      await invoke("exit_app");
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // "Öffnen"/"Speichern"/"Speichern unter"/"Exportieren" in the native "Datei" menu (see
  // src-tauri/src/lib.rs, which owns the Cmd/Ctrl+O, +S, +Shift+S and +E accelerators) just emit
  // an event - refs, not a dependency array, so this one-time subscription always calls whichever
  // handler closure is current instead of the one captured on mount. presentingRef guards against
  // calling a stale handler while presenting - these stop being reassigned past the early return
  // below, and a save dialog popping up over a live presentation would be unwelcome anyway.
  const handleSaveRef = useRef<() => void>(() => {});
  const handleSaveAsRef = useRef<() => void>(() => {});
  const handleExportRef = useRef<() => void>(() => {});
  const handleExportPlayerRef = useRef<() => void>(() => {});
  const handleOpenRef = useRef<() => void>(() => {});
  const handleNewRef = useRef<() => void>(() => {});
  const handleDuplicateRef = useRef<() => void>(() => {});
  const handleOpenRecentRef = useRef<(path: string) => void>(() => {});
  const presentingRef = useRef(presenting);
  presentingRef.current = presenting;
  // "Undo"/"Redo" in the native "Edit" menu (see src-tauri/src/lib.rs, which owns the
  // Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z accelerators) - replacing the platform default Edit menu,
  // whose Undo/Redo instead drove the focused WKWebView's own contentEditable undo stack, out of
  // sync with (and confusingly different from) the app's own document-level undo/redo. undo/redo
  // themselves are stable Zustand action references, so - unlike the handlers below - no ref
  // indirection is needed to keep this subscription from going stale.
  useEffect(() => {
    if (!isTauri()) return;
    const unlistenUndo = listen("weft://menu-undo", () => {
      if (!presentingRef.current && !playerRef.current) undo();
    });
    const unlistenRedo = listen("weft://menu-redo", () => {
      if (!presentingRef.current && !playerRef.current) redo();
    });
    return () => {
      void unlistenUndo.then((fn) => fn());
      void unlistenRedo.then((fn) => fn());
    };
  }, [undo, redo]);

  useEffect(() => {
    if (!isTauri()) return;
    // (The items that act on the module being edited are greyed out while a player file is shown - see
    // set_player_mode - and ignored here as well, in case a shortcut still gets through.)
    const idle = () => presentingRef.current || playerRef.current !== null;
    const unlistenSave = listen("weft://menu-save", () => {
      if (!idle()) handleSaveRef.current();
    });
    const unlistenSaveAs = listen("weft://menu-save-as", () => {
      if (!idle()) handleSaveAsRef.current();
    });
    const unlistenExport = listen("weft://menu-export", () => {
      if (!idle()) handleExportRef.current();
    });
    const unlistenExportPlayer = listen("weft://menu-export-player", () => {
      if (!idle()) handleExportPlayerRef.current();
    });
    const unlistenOpen = listen("weft://menu-open", () => {
      if (!presentingRef.current) handleOpenRef.current();
    });
    const unlistenNew = listen("weft://menu-new", () => {
      if (!presentingRef.current) handleNewRef.current();
    });
    const unlistenDuplicate = listen("weft://menu-duplicate", () => {
      if (!idle()) handleDuplicateRef.current();
    });
    const unlistenOpenRecent = listen<string>("weft://menu-open-recent", (event) => {
      if (!presentingRef.current) handleOpenRecentRef.current(event.payload);
    });
    const unlistenJoin = listen("weft://menu-join", () => {
      if (!presentingRef.current) useCollabDialog.getState().show("join");
    });
    const unlistenMerge = listen("weft://menu-merge", () => {
      if (!idle()) useCollabDialog.getState().show("merge");
    });
    return () => {
      void unlistenSave.then((fn) => fn());
      void unlistenSaveAs.then((fn) => fn());
      void unlistenExport.then((fn) => fn());
      void unlistenExportPlayer.then((fn) => fn());
      void unlistenOpen.then((fn) => fn());
      void unlistenNew.then((fn) => fn());
      void unlistenDuplicate.then((fn) => fn());
      void unlistenOpenRecent.then((fn) => fn());
      void unlistenJoin.then((fn) => fn());
      void unlistenMerge.then((fn) => fn());
    };
  }, []);

  // Where there is no menu bar (a browser, a tablet) the same commands come from the app's own File menu (FileMenu.tsx) and,
  // with a keyboard, from the usual shortcuts.
  const inAppMenu = !hasNativeMenu();
  function runCommand(command: MenuCommand) {
    const editing = !presentingRef.current && playerRef.current === null;
    switch (command) {
      case "new":
        return void handleNewRef.current();
      case "open":
        return void handleOpenRef.current();
      case "join":
        return void useCollabDialog.getState().show("join");
      case "settings":
        return void useCollabDialog.getState().show("settings");
      case "duplicate":
        return editing ? void handleDuplicateRef.current() : undefined;
      case "save":
        return editing ? void handleSaveRef.current() : undefined;
      case "saveAs":
        return editing ? void handleSaveAsRef.current() : undefined;
      case "export":
        return editing ? void handleExportRef.current() : undefined;
      case "exportPlayer":
        return editing ? void handleExportPlayerRef.current() : undefined;
      case "merge":
        return editing ? void useCollabDialog.getState().show("merge") : undefined;
    }
  }
  const runCommandRef = useRef(runCommand);
  runCommandRef.current = runCommand;
  useEffect(() => {
    if (!inAppMenu) return;
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || presentingRef.current) return;
      const key = e.key.toLowerCase();
      const typing = e.target instanceof HTMLElement && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
      const commands: Record<string, MenuCommand | undefined> = { s: e.shiftKey ? "saveAs" : "save", o: "open", n: "new", e: "export" };
      const command = commands[key];
      if (command) {
        e.preventDefault();
        runCommandRef.current(command);
      } else if ((key === "z" || key === "y") && !typing && playerRef.current === null) {
        e.preventDefault();
        if (key === "y" || e.shiftKey) redo();
        else undo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inAppMenu, undo, redo]);

  function handlePresent(startPageId: string | null) {
    setPresentStartPageId(startPageId);
    setPresenting(true);
    void enterFullscreenPreview();
  }

  if (presenting) {
    return <PresentationView startPageId={presentStartPageId} onExit={() => setPresenting(false)} />;
  }

  // Only a brand-new document (no filePath yet) asks where to save - once it has one, whether
  // from a prior save or from "Öffnen", Speichern/Cmd+S silently overwrites that same file,
  // matching how Save works in most other apps.
  async function handleSave() {
    try {
      if (filePath) {
        await saveDocumentToPath(doc, filePath);
        useDocumentStore.getState().markSaved(doc.content);
      } else {
        const path = await saveDocumentAs(doc);
        if (path) {
          useDocumentStore.setState({ filePath: path });
          useDocumentStore.getState().markSaved(doc.content);
          void clearRecoveryCopy();
        }
      }
    } catch (err) {
      alert(`${t("toolbar.saveFailed")}\n${errorMessage(err)}`);
    }
  }
  handleSaveRef.current = handleSave;

  // Unlike handleSave, always asks where to save - even once the document already has a
  // filePath - and then adopts whatever path was chosen as the document's own going forward
  // (like most apps' Save As: this becomes the file Speichern/Cmd+S now silently overwrites,
  // not the one it was opened from or last saved to).
  async function handleSaveAs() {
    try {
      const path = await saveDocumentAs(doc);
      if (path) {
        useDocumentStore.setState({ filePath: path });
        useDocumentStore.getState().markSaved(doc.content);
        void clearRecoveryCopy();
      }
    } catch (err) {
      alert(`${t("toolbar.saveFailed")}\n${errorMessage(err)}`);
    }
  }
  handleSaveAsRef.current = handleSaveAs;

  async function handleExport() {
    try {
      await exportAsHtmlModule(doc);
    } catch (err) {
      alert(`${t("toolbar.exportFailed")}\n${errorMessage(err)}`);
    }
  }
  handleExportRef.current = handleExport;

  async function handleExportPlayer() {
    try {
      await exportPlayerFile(doc);
    } catch (err) {
      alert(`${t("toolbar.exportFailed")}\n${errorMessage(err)}`);
    }
  }
  handleExportPlayerRef.current = handleExportPlayer;

  // Switching to another module replaces the one that is open: what is saved in its file already (the
  // pending autosave is written first), what is not asks first - a module that was never saved has only
  // the recovery copy, which the next one takes over.
  async function confirmLeave(): Promise<boolean> {
    const { filePath: path, doc: current } = useDocumentStore.getState();
    if (path === null) {
      if (current.content.modifiedAt === current.content.createdAt) return true;
      return confirmDestructive(
        "Das jetzige Lernmodul wurde noch nicht gespeichert und ist danach weg. Vorher mit „Speichern unter…“ in eine Datei sichern?\n\nTrotzdem fortfahren?",
        "Nicht gespeichert",
      );
    }
    try {
      await flushAutosave();
      return true;
    } catch (err) {
      return confirmDestructive(`Das jetzige Lernmodul ließ sich nicht speichern:\n${errorMessage(err)}\n\nTrotzdem fortfahren?`, "Nicht gespeichert");
    }
  }

  // A module without a file of its own (new, or a copy) is kept in the recovery copy until it is saved - and
  // not the file that was open before is what the next launch comes back to.
  async function startUnsavedDocument(next: WeftDocument) {
    loadDocument(next, null);
    forgetLastPath();
    try {
      const { doc: loaded } = useDocumentStore.getState();
      await saveRecoveryCopy(loaded);
    } catch {
      // The autosave tries again with the first change.
    }
  }

  async function handleNew() {
    if (!(await confirmLeave())) return;
    await startUnsavedDocument(createEmptyDocument());
  }
  handleNewRef.current = handleNew;

  // A copy of the open module under a new id - and a document of its own, with a new editing history: it has
  // no tie to the original any more (no live connection, no shared folder, no merging of the two).
  async function handleDuplicate() {
    const { filePath: path, doc: current } = useDocumentStore.getState();
    if (path !== null) {
      try {
        await flushAutosave();
      } catch {
        // The copy is made from what is open; the original just stays as it was last saved.
      }
    }
    const now = new Date().toISOString();
    const content = { ...plain(current.content), id: createId(), title: `${current.content.title} (Kopie)`, createdAt: now, modifiedAt: now };
    await startUnsavedDocument({ formatVersion: current.formatVersion, content });
  }
  handleDuplicateRef.current = handleDuplicate;

  async function handleOpen() {
    try {
      if (!(await confirmLeave())) return;
      const result = await openDocument();
      if (!result) return;
      if (result.kind === "player") openPlayer(result.player, result.path);
      else loadDocument(result.doc, result.path);
    } catch (err) {
      alert(`${t("toolbar.openFailed")}\n${errorMessage(err)}`);
    }
  }
  handleOpenRef.current = handleOpen;

  async function handleOpenRecent(path: string) {
    try {
      if (!(await confirmLeave())) return;
      const opened = await openDocumentAtPath(path);
      if (!opened) return;
      if (opened.kind === "player") openPlayer(opened.player, path);
      else loadDocument(opened.doc, path);
    } catch (err) {
      syncRecentMenu(forgetRecentFile(path));
      alert(`${t("toolbar.openFailed")}\n${path}\n${errorMessage(err)}`);
    }
  }
  handleOpenRecentRef.current = handleOpenRecent;

  if (player) {
    return (
      <div className="weft-shell">
        <PlayerShell
          file={player}
          menu={inAppMenu ? <FileMenu onCommand={runCommand} onOpenRecent={(path) => void handleOpenRecentRef.current(path)} playerShown /> : undefined}
        />
        <CollabDialogs />
      </div>
    );
  }

  return (
    <div className="weft-shell">
      {inAppMenu && <AppBar onCommand={runCommand} onOpenRecent={(path) => void handleOpenRecentRef.current(path)} />}
      <div className="weft-body" style={{ gridTemplateColumns: `${sidebarWidth}px 6px 1fr 300px` }}>
        <Sidebar />
        <div className="weft-resizer" onPointerDown={handleResizerPointerDown} title={t("toolbar.resizerTitle")} />
        <Canvas onPresent={handlePresent} />
        <Inspector />
      </div>
      <CollabDialogs />
    </div>
  );
}
