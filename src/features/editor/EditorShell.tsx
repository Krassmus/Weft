import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { listen } from "@tauri-apps/api/event";
import { useDocumentStore } from "../../core/document/store";
import { useCustomFontRegistration } from "../../core/fonts/registerCustomFonts";
import { useSyncMenuLanguage } from "../../core/i18n/useSyncMenuLanguage";
import { useTranslation } from "../../core/i18n/useTranslation";
import {
  exportAsHtmlModule,
  isTauri,
  openDocument,
  openDocumentAtPath,
  saveDocumentAs,
  saveDocumentToPath,
} from "../../core/io/fileIO";
import { enterFullscreenPreview, watchFullscreenExit } from "../../core/window/fullscreen";
import { Canvas } from "./Canvas";
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
  const canUndo = useDocumentStore((s) => s.doc.undoIndex >= 0);
  const canRedo = useDocumentStore((s) => s.doc.undoIndex < s.doc.undoHistory.length - 1);
  const loadDocument = useDocumentStore((s) => s.loadDocument);
  const [busy, setBusy] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
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
  useEffect(() => {
    const lastPath = readLastPath();
    if (!lastPath) return;
    void openDocumentAtPath(lastPath)
      .then((doc) => {
        if (doc && useDocumentStore.getState().filePath === null) loadDocument(doc, lastPath);
      })
      .catch(() => forgetLastPath());
  }, []);

  // "Öffnen"/"Speichern" in the native "Datei" menu (see src-tauri/src/lib.rs, which owns the
  // Cmd/Ctrl+O and Cmd/Ctrl+S accelerators) just emit an event - refs, not a dependency array,
  // so this one-time subscription always calls whichever handleOpen/handleSave closure is
  // current instead of the one captured on mount. presentingRef guards against calling a stale
  // handler while presenting - handleSave/handleOpen stop being reassigned past the early return
  // below, and a save dialog popping up over a live presentation would be unwelcome anyway.
  const handleSaveRef = useRef<() => void>(() => {});
  const handleOpenRef = useRef<() => void>(() => {});
  const presentingRef = useRef(presenting);
  presentingRef.current = presenting;
  // "Undo"/"Redo" in the native "Edit" menu (see src-tauri/src/lib.rs, which owns the
  // Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z accelerators) - replacing the platform default Edit menu,
  // whose Undo/Redo instead drove the focused WKWebView's own contentEditable undo stack, out of
  // sync with (and confusingly different from) the toolbar buttons below. undo/redo themselves
  // are stable Zustand action references, so - unlike handleSave/handleOpen above - no ref
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
    const unlistenOpen = listen("weft://menu-open", () => {
      if (!presentingRef.current) handleOpenRef.current();
    });
    return () => {
      void unlistenSave.then((fn) => fn());
      void unlistenOpen.then((fn) => fn());
    };
  }, []);

  function handlePresent() {
    setPresenting(true);
    void enterFullscreenPreview();
  }

  if (presenting) {
    return <PresentationView onExit={() => setPresenting(false)} />;
  }

  // Only a brand-new document (no filePath yet) asks where to save - once it has one, whether
  // from a prior save or from "Öffnen", Speichern/Cmd+S silently overwrites that same file,
  // matching how Save works in most other apps.
  async function handleSave() {
    setBusy(t("toolbar.saving"));
    try {
      if (filePath) {
        await saveDocumentToPath(doc, filePath);
      } else {
        const path = await saveDocumentAs(doc);
        if (path) useDocumentStore.setState({ filePath: path });
      }
    } catch (err) {
      alert(`${t("toolbar.saveFailed")}\n${errorMessage(err)}`);
    } finally {
      setBusy(null);
    }
  }
  handleSaveRef.current = handleSave;

  async function handleExport() {
    setBusy(t("toolbar.exporting"));
    try {
      await exportAsHtmlModule(doc);
    } catch (err) {
      alert(`${t("toolbar.exportFailed")}\n${errorMessage(err)}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleOpen() {
    setBusy(t("toolbar.opening"));
    try {
      const result = await openDocument();
      if (result) loadDocument(result.doc, result.path);
    } catch (err) {
      alert(`${t("toolbar.openFailed")}\n${errorMessage(err)}`);
    } finally {
      setBusy(null);
    }
  }
  handleOpenRef.current = handleOpen;

  return (
    <div className="weft-shell">
      <header className="weft-toolbar">
        <span className="weft-app-name">Weft</span>
        <span className="weft-toolbar-divider" />
        <span className="weft-doc-title">
          {doc.content.title}
          {!filePath && <span className="weft-doc-title-unsaved"> • {t("toolbar.unsaved")}</span>}
        </span>

        <div className="weft-toolbar-spacer" />

        {busy && <span className="weft-busy">{busy}</span>}

        <div className="weft-toolbar-group">
          <button type="button" className="weft-icon-button" onClick={undo} disabled={!canUndo} title={t("toolbar.undo")}>
            ↶
          </button>
          <button type="button" className="weft-icon-button" onClick={redo} disabled={!canRedo} title={t("toolbar.redo")}>
            ↷
          </button>
        </div>

        <button type="button" className="weft-ghost-button" onClick={handleOpen}>
          {t("toolbar.open")}
        </button>
        <button type="button" className="weft-ghost-button" onClick={handleSave}>
          {t("toolbar.save")}
        </button>
        <button type="button" className="weft-primary-button" onClick={handleExport}>
          {t("toolbar.export")}
        </button>
      </header>

      <div className="weft-body" style={{ gridTemplateColumns: `${sidebarWidth}px 6px 1fr 300px` }}>
        <Sidebar />
        <div className="weft-resizer" onPointerDown={handleResizerPointerDown} title={t("toolbar.resizerTitle")} />
        <Canvas onPresent={handlePresent} />
        <Inspector />
      </div>
    </div>
  );
}
