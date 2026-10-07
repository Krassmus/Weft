import { syncFolderForCurrentDocument } from "../../core/collab/folder/folderSession";
import { syncLiveForCurrentDocument } from "../../core/collab/session";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useDocumentStore } from "../../core/document/store";
import { useCustomFontRegistration } from "../../core/fonts/registerCustomFonts";
import { useSyncMenuLanguage } from "../../core/i18n/useSyncMenuLanguage";
import { useTranslation } from "../../core/i18n/useTranslation";
import { startDeepLinks } from "../../core/deepLink";
import { flushAutosave, startAutosave } from "../../core/io/autosave";
import {
  clearRecoveryCopy,
  confirmDestructive,
  exportAsHtmlModule,
  isTauri,
  openDocument,
  openDocumentAtPath,
  readRecoveryCopy,
  saveDocumentAs,
  saveDocumentToPath,
} from "../../core/io/fileIO";
import { enterFullscreenPreview, watchFullscreenExit } from "../../core/window/fullscreen";
import { Canvas } from "./Canvas";
import { CollabDialogs } from "./CollabDialogs";
import { useCollabDialog } from "./collabDialogStore";
import { Inspector } from "./Inspector";
import { PresentationView } from "./PresentationView";
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
  useCopyPaste(!presenting);
  useDeleteSelection(!presenting);
  useCustomFontRegistration();

  // Keeps the native title bar (next to the traffic-light buttons) showing which module is
  // open instead of a static "Weft" - EditorShell is only ever the main window (the settings
  // window renders SettingsWindow instead, see App.tsx's isSettingsWindow()), so this never
  // fights over the title with anything else.
  useEffect(() => {
    if (!isTauri()) return;
    const title = doc.content.title.trim();
    // Needs its own explicit "core:window:allow-set-title" capability grant (see
    // src-tauri/capabilities/default.json) - Tauri 2's default core permissions don't include
    // it, so without that this call is silently denied and the title bar just never updates,
    // with nothing surfaced to the user. Logged (not alert()ed) if it ever happens again for
    // some other reason - a stale title bar isn't worth interrupting anyone over.
    getCurrentWindow()
      .setTitle(title ? `Weft - ${title}` : "Weft")
      .catch((err: unknown) => console.error("Failed to update window title:", err));
  }, [doc.content.title]);

  // Whichever file Öffnen/Speichern most recently pointed at - not "Exportieren", which never
  // touches filePath at all, matching that an export is a delivery artifact, not "the module
  // you're working on". Re-saving the same reference on every render would be harmless but
  // pointless, so this only fires when filePath itself actually changes.
  useEffect(() => rememberLastPath(filePath), [filePath]);

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
      .then((doc) => {
        if (doc && useDocumentStore.getState().filePath === null) loadDocument(doc, lastPath);
      })
      .catch(() => forgetLastPath());
  }, []);

  // A click on an invitation link ("weft:...") anywhere on the computer opens Weft and joins (see
  // core/deepLink.ts) - after the module that was open last has been restored, which a join would
  // otherwise be replaced by.
  useEffect(() => (isTauri() ? startDeepLinks(restoredRef.current) : undefined), []);

  // A module that is synced with a shared folder (see core/collab/folder/) picks that up again whenever
  // it is opened - and the sync of the module that was open before ends.
  const documentKey = useDocumentStore((s) => s.documentKey);
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
  const handleOpenRef = useRef<() => void>(() => {});
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
      if (!presentingRef.current) undo();
    });
    const unlistenRedo = listen("weft://menu-redo", () => {
      if (!presentingRef.current) redo();
    });
    return () => {
      void unlistenUndo.then((fn) => fn());
      void unlistenRedo.then((fn) => fn());
    };
  }, [undo, redo]);

  useEffect(() => {
    if (!isTauri()) return;
    const unlistenSave = listen("weft://menu-save", () => {
      if (!presentingRef.current) handleSaveRef.current();
    });
    const unlistenSaveAs = listen("weft://menu-save-as", () => {
      if (!presentingRef.current) handleSaveAsRef.current();
    });
    const unlistenExport = listen("weft://menu-export", () => {
      if (!presentingRef.current) handleExportRef.current();
    });
    const unlistenOpen = listen("weft://menu-open", () => {
      if (!presentingRef.current) handleOpenRef.current();
    });
    const unlistenJoin = listen("weft://menu-join", () => {
      if (!presentingRef.current) useCollabDialog.getState().show("join");
    });
    const unlistenMerge = listen("weft://menu-merge", () => {
      if (!presentingRef.current) useCollabDialog.getState().show("merge");
    });
    return () => {
      void unlistenSave.then((fn) => fn());
      void unlistenSaveAs.then((fn) => fn());
      void unlistenExport.then((fn) => fn());
      void unlistenOpen.then((fn) => fn());
      void unlistenJoin.then((fn) => fn());
      void unlistenMerge.then((fn) => fn());
    };
  }, []);

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

  async function handleOpen() {
    try {
      const result = await openDocument();
      if (result) loadDocument(result.doc, result.path);
    } catch (err) {
      alert(`${t("toolbar.openFailed")}\n${errorMessage(err)}`);
    }
  }
  handleOpenRef.current = handleOpen;

  return (
    <div className="weft-shell">
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
