import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { listen } from "@tauri-apps/api/event";
import { useDocumentStore } from "../../core/document/store";
import { useCustomFontRegistration } from "../../core/fonts/registerCustomFonts";
import { exportAsHtmlModule, isTauri, openDocument, saveDocumentAs, saveDocumentToPath } from "../../core/io/fileIO";
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

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function EditorShell() {
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
    setBusy("Speichern …");
    try {
      if (filePath) {
        await saveDocumentToPath(doc, filePath);
      } else {
        const path = await saveDocumentAs(doc);
        if (path) useDocumentStore.setState({ filePath: path });
      }
    } catch (err) {
      alert(`Speichern fehlgeschlagen:\n${errorMessage(err)}`);
    } finally {
      setBusy(null);
    }
  }
  handleSaveRef.current = handleSave;

  async function handleExport() {
    setBusy("Exportieren …");
    try {
      await exportAsHtmlModule(doc);
    } catch (err) {
      alert(`Exportieren fehlgeschlagen:\n${errorMessage(err)}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleOpen() {
    setBusy("Öffnen …");
    try {
      const result = await openDocument();
      if (result) loadDocument(result.doc, result.path);
    } catch (err) {
      alert(`Öffnen fehlgeschlagen:\n${errorMessage(err)}`);
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
          {!filePath && <span className="weft-doc-title-unsaved"> • nicht gespeichert</span>}
        </span>

        <div className="weft-toolbar-spacer" />

        {busy && <span className="weft-busy">{busy}</span>}

        <div className="weft-toolbar-group">
          <button type="button" className="weft-icon-button" onClick={undo} disabled={!canUndo} title="Rückgängig">
            ↶
          </button>
          <button type="button" className="weft-icon-button" onClick={redo} disabled={!canRedo} title="Wiederholen">
            ↷
          </button>
        </div>

        <button type="button" className="weft-ghost-button" onClick={handleOpen}>
          Öffnen
        </button>
        <button type="button" className="weft-ghost-button" onClick={handleSave}>
          Speichern
        </button>
        <button type="button" className="weft-primary-button" onClick={handleExport}>
          ⬆ Exportieren
        </button>
      </header>

      <div className="weft-body" style={{ gridTemplateColumns: `${sidebarWidth}px 6px 1fr 300px` }}>
        <Sidebar />
        <div className="weft-resizer" onPointerDown={handleResizerPointerDown} title="Breite der Seitenleiste ziehen" />
        <Canvas onPresent={handlePresent} />
        <Inspector />
      </div>
    </div>
  );
}
