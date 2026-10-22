import { syncFolderForCurrentDocument } from "../../core/collab/folder/folderSession";
import { syncLiveForCurrentDocument } from "../../core/collab/session";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAccessibilityStore } from "../../core/accessibility/accessibilityStore";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createBlankDocument } from "../../core/document/createEmptyDocument";
import { plain } from "../../core/document/plain";
import { useDocumentStore } from "../../core/document/store";
import { createId } from "../../core/id";
import { copyOfTemplate } from "../../core/document/template";
import { usePlayerStore } from "../../core/player/playerStore";
import { useCustomFontRegistration } from "../../core/fonts/registerCustomFonts";
import { useSyncMenuLanguage } from "../../core/i18n/useSyncMenuLanguage";
import { useTranslation } from "../../core/i18n/useTranslation";
import { startDeepLinks } from "../../core/deepLink";
import { startOpenFiles } from "../../core/openFiles";
import { flushAutosave, startAutosave } from "../../core/io/autosave";
import {
  chooseModuleSavePath,
  clearRecoveryCopy,
  confirmDestructive,
  exportAsHtmlModule,
  exportPlayerFile,
  isTauri,
  openDocument,
  openDocumentAtPath,
  readRecoveryCopy,
  savePdf,
  saveDocumentAs,
  saveDocumentToPath,
  saveRecoveryCopy,
} from "../../core/io/fileIO";
import { forgetRecentFile, rememberRecentFile, syncRecentMenu } from "../../core/io/recentFiles";
import { knownLocalCopy, reconcileOpenedDocument, rememberSavedLocation } from "../../core/io/documentLocations";
import { moduleOfLink, readModuleFromFolder, rememberSyncFolder, startFolderSync } from "../../core/collab/folder/folderSession";
import type { FolderLink } from "../../core/collab/folder/folderSync";
import type { WeftDocument } from "../../core/types";
import { enterFullscreenPreview, watchFullscreenExit } from "../../core/window/fullscreen";
import { Canvas } from "./Canvas";
import { AppBar, FileMenu } from "./FileMenu";
import type { MenuCommand } from "./FileMenu";
import { CollabDialogs } from "./CollabDialogs";
import { FolderLostDialog } from "./FolderLostDialog";
import { LibraryDialogs } from "./LibraryDialogs";
import { useCollabDialog } from "./collabDialogStore";
import { Inspector } from "./Inspector";
import { PresentationView } from "./PresentationView";
import { PresenterView } from "../presenter/PresenterView";
import { announceStatus } from "../../core/accessibility/statusAnnouncer";
import { hasNativeMenu, libraryMode } from "../../core/platform";
import { loadPlayerFile } from "../../core/io/playerFile";
import { unpackDocument } from "../../core/io/unpack";
import { StartScreen } from "../start/StartScreen";
import { useStartStore } from "../start/startStore";
import { createLibraryFile } from "../../core/io/library";
import { packDocument } from "../../core/io/pack";
import { PlayerShell } from "../player/PlayerShell";
import { Sidebar } from "./Sidebar";
import { useCopyPaste } from "./useCopyPaste";
import { useDeleteSelection } from "./useDeleteSelection";
import { tr } from "../../core/i18n/tr";

const SIDEBAR_WIDTH_MIN = 220;
const SIDEBAR_WIDTH_MAX = 560;
const SIDEBAR_WIDTH_DEFAULT = 260;
const RESIZER_WIDTH = 6;
const INSPECTOR_WIDTH = 300;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The slide a selection is on (what "Abspielen" and "Präsentieren" start from), or null: the module's beginning. */
function startPageIdOf(selection: ReturnType<typeof useDocumentStore.getState>["selection"]): string | null {
  switch (selection?.type) {
    case "page":
    case "group":
    case "event":
      return selection.pageId;
    case "block":
    case "blocks":
      return selection.container.kind === "page" ? selection.container.pageId : null;
    default:
      return null;
  }
}

export function EditorShell() {
  const { t } = useTranslation();
  useSyncMenuLanguage();
  const doc = useDocumentStore((s) => s.doc);
  const filePath = useDocumentStore((s) => s.filePath);
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);
  const storeLoadDocument = useDocumentStore((s) => s.loadDocument);
  // (Leaves the start screen at once, not only when the document key has changed a render later: what follows a load - the
  // library's file for the new module - already asks which of the two is on screen.)
  const loadDocument: typeof storeLoadDocument = (next, path) => {
    storeLoadDocument(next, path);
    useStartStore.getState().setPhase("editor");
  };
  const documentKey = useDocumentStore((s) => s.documentKey);
  // A player file Weft is playing instead of showing the editor (see features/player/): while it is, nothing
  // here may act on the module that is open underneath.
  const player = usePlayerStore((s) => s.player);
  // The start screen is what the app opens with (see core of the launch below); `phaseRef` for the handlers that are subscribed once.
  const phase = useStartStore((s) => s.phase);
  const setPhase = useStartStore((s) => s.setPhase);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const openPlayer = usePlayerStore((s) => s.open);
  const playerRef = useRef(player);
  playerRef.current = player;
  const [presenting, setPresenting] = useState(false);
  // The presenter view (see features/presenter/) is on: the page it was started on (null: the module's beginning).
  const [presenter, setPresenter] = useState<{ startPageId: string | null } | null>(null);
  // Which page "Abspielen" should open on - captured once when it's clicked (see Canvas.tsx,
  // which resolves it from whatever's currently selected), not read live while presenting, since
  // there's no selection UI to keep it in sync with once PresentationView has taken over anyway.
  const [presentStartPageId, setPresentStartPageId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_WIDTH_DEFAULT);
  // The progress of "Exportieren als PDF" (see handleExportPdf). Declared up here with the other state: everything from the early
  // return for the presentation (below) on is not run while presenting, and hooks must be the same in every render.
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number } | null>(null);
  const exportingPdfRef = useRef(false);
  // Set when a file that was opened turned out to be a copy of another one and got a new id (see core/io/documentLocations.ts).
  const [copyNotice, setCopyNotice] = useState<{ file: string; of: string } | null>(null);
  // The note goes away by itself.
  useEffect(() => {
    if (!copyNotice) return;
    const timer = setTimeout(() => setCopyNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [copyNotice]);

  // On a narrow window (an iPad upright) the two sidebars leave the middle a few pixels: when the work area would get less than a
  // third of the width, the right sidebar becomes a drawer over it - out of the way until something is selected or its tab is
  // tapped, and gone again with a tap on the empty work area. With a third or more it is a fixed column, as always.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyWidth, setBodyWidth] = useState(0);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const selection = useDocumentStore((s) => s.selection);
  const compact = bodyWidth > 0 && (bodyWidth - sidebarWidth - RESIZER_WIDTH - INSPECTOR_WIDTH) * 3 < bodyWidth;
  const compactRef = useRef(compact);
  compactRef.current = compact;
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setBodyWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [player !== null]);
  // An event of the graph was selected: its panel is what the drawer is for. Not for what is selected on the slide - tapping an object
  // is for moving it and for selecting its text, and a drawer that comes out by itself is in the way of that; its tab brings it.
  useEffect(() => {
    if (selection?.type === "event") setInspectorOpen(true);
  }, [selection]);
  // The drawer covers the right end of the work area: what is selected (or being edited) there would be under it - and on a tablet
  // the caret and the selection are drawn by the system above the page, so they would show through the drawer. The work area gets
  // room to scroll (see .has-drawer-open in App.css) and, when the drawer comes out, is scrolled so that the object is left of it.
  const drawerOpen = compact && inspectorOpen;
  useEffect(() => {
    if (!drawerOpen) return;
    const timer = setTimeout(() => {
      const wrap = document.querySelector<HTMLElement>(".weft-canvas-stage-wrap");
      const drawer = document.querySelector<HTMLElement>(".weft-inspector-slot.is-drawer");
      if (!wrap || !drawer) return;
      const active = document.activeElement;
      const target = (active instanceof Element ? active.closest<HTMLElement>(".weft-edit-block") : null) ?? wrap.querySelector<HTMLElement>(".weft-edit-block.is-selected");
      if (!target) return;
      // Where the drawer will stand (it may still be sliding in: its own rectangle moves with it).
      const body = bodyRef.current;
      if (!body) return;
      const free = body.getBoundingClientRect().left + drawer.offsetLeft - 12;
      const rect = target.getBoundingClientRect();
      if (rect.right <= free) return;
      // As far as the object's right edge needs - but its left edge stays in view.
      const delta = Math.min(rect.right - free, rect.left - (wrap.getBoundingClientRect().left + 8));
      if (delta > 0) wrap.scrollBy({ left: delta, behavior: "smooth" });
    }, 80);
    return () => clearTimeout(timer);
  }, [drawerOpen]);
  // A tap on the empty work area (not on an object, a button, the graph...) puts the drawer away again.
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!compactRef.current) return;
      const target = e.target;
      if (!(target instanceof Element) || !target.closest(".weft-canvas")) return;
      if (target.closest("button, input, select, textarea, a, [contenteditable='true'], .weft-edit-block, .weft-resize-handle, .weft-eg-node, [class*='weft-group']")) return;
      setInspectorOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // Dragging the splitter only ever changes the sidebar's own width - the canvas column is "1fr"
  // in the grid below, so it's always the one that gives up (or gets back) the space. startWidth
  // is captured once here and never re-read from state, so this stays correct across the whole
  // drag even though sidebarWidth itself changes (and re-renders this component) on every move.
  function handleResizerPointerDown(e: ReactPointerEvent) {
    e.preventDefault();
    // The finger stays with the line even where it leaves it (and over the iframes and the like on the way).
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // not every pointer can be captured; the window listeners below do the work anyway
    }
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    function onMove(ev: PointerEvent) {
      const next = Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, startWidth + (ev.clientX - startX)));
      setSidebarWidth(next);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("weft-dragging");
      document.body.style.cursor = "";
    }

    document.body.style.cursor = "col-resize";
    document.body.classList.add("weft-dragging");
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  // If fullscreen is exited from outside our own controls (Escape, the native macOS toggle, a
  // touch swipe, ...) leave presentation mode too, so the two never fall out of sync.
  // (The slide the presentation is on - the module tells which: see "page-shown" in player.runtime.js - is what the editor shows afterwards.)
  const shownPageRef = useRef<string | null>(null);
  const endPresentationRef = useRef<() => void>(() => {});
  useEffect(() => watchFullscreenExit(() => endPresentationRef.current()), []);
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data && e.data.source === "weft-module" && e.data.type === "page-shown" && typeof e.data.pageId === "string") shownPageRef.current = e.data.pageId;
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Disabled while presenting: there's no selection UI to copy/paste against there, and the
  // listener would otherwise silently act on whatever was selected before presenting started.
  useCopyPaste(!presenting && !player && phase === "editor");
  useDeleteSelection(!presenting && !player && phase === "editor");
  useCustomFontRegistration();

  // Keeps the native title bar (next to the traffic-light buttons) showing which module is
  // open instead of a static "Weft" - EditorShell is only ever the main window (the settings
  // window renders SettingsWindow instead, see App.tsx's isSettingsWindow()), so this never
  // fights over the title with anything else.
  useEffect(() => {
    const title = (player ? player.title : phase === "editor" ? doc.content.title : "").trim();
    // (The title of the page too - in a browser it is the tab's, and a screen reader says it when the page opens.)
    document.title = title ? `Weft - ${title}` : "Weft";
    if (!isTauri()) return;
    // Needs its own explicit "core:window:allow-set-title" capability grant (see
    // src-tauri/capabilities/default.json) - Tauri 2's default core permissions don't include
    // it, so without that this call is silently denied and the title bar just never updates,
    // with nothing surfaced to the user. Logged (not alert()ed) if it ever happens again for
    // some other reason - a stale title bar isn't worth interrupting anyone over.
    getCurrentWindow()
      .setTitle(title ? `Weft - ${title}` : "Weft")
      .catch((err: unknown) => console.error("Failed to update window title:", err));
  }, [doc.content.title, player, phase]);

  // The file that is open - a player file counts, too (see below: it goes to the top of "Zuletzt geöffnet").
  const currentPath = player ? player.path : filePath;
  // The same file goes to the top of "Datei > Zuletzt geöffnet" (also once on launch, which is what
  // fills the native menu with the list of the last session).
  useEffect(() => syncRecentMenu(rememberRecentFile(currentPath)), [currentPath]);
  // Any module that gets loaded takes the window back from the player - and from the start screen (the key of the launch is not a load).
  const seenKeyRef = useRef(documentKey);
  useEffect(() => {
    usePlayerStore.getState().close();
    if (seenKeyRef.current !== documentKey) {
      seenKeyRef.current = documentKey;
      setPhase("editor");
    }
  }, [documentKey]);
  // The menu items that act on the module being edited are greyed out while a player file or the start screen is shown.
  useEffect(() => {
    if (isTauri()) void invoke("set_player_mode", { active: player !== null || phase !== "editor" }).catch(() => undefined);
  }, [player !== null, phase !== "editor"]);

  // The launch. The app opens on the start screen (see features/start/) - with one exception: a module that was never saved but
  // worked on has its recovery copy (see core/io/fileIO.ts), and that is picked up where it left off rather than left behind a
  // screen that does not mention it. (A module that was only just created and never touched is not worth keeping: it is dropped.)
  const restoredRef = useRef<Promise<unknown>>(Promise.resolve());
  const ensureLibraryDocumentRef = useRef<() => Promise<void>>(async () => {});
  const ensuringRef = useRef<Promise<void> | null>(null);
  useEffect(() => {
    restoredRef.current = readRecoveryCopy()
      .then(async (recovered) => {
        if (!recovered || useDocumentStore.getState().filePath !== null) return;
        if (recovered.content.modifiedAt === recovered.content.createdAt) return clearRecoveryCopy();
        loadDocument(recovered, null);
        setPhase("editor");
        await ensureLibraryDocumentRef.current();
      })
      .catch(() => undefined)
      .then(() => {
        if (useStartStore.getState().phase === "launching") setPhase("start");
      });
  }, []);

  // A tablet may end the app any time after it goes to the background: what is unsaved is written right then.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") void flushAutosave().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  // A click on an invitation link ("weft:...") anywhere on the computer opens Weft and joins (see
  // core/deepLink.ts) - after the module that was open last has been restored, which a join would
  // otherwise be replaced by.
  useEffect(() => (isTauri() ? startDeepLinks(restoredRef.current) : undefined), []);
  // ...and a .weft file handed over by the system ("In Weft öffnen") is opened in the same way, after that.
  useEffect(() => (isTauri() ? startOpenFiles(restoredRef.current, (path) => void handleOpenRecentRef.current(path)) : undefined), []);

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
  const handleExportPdfRef = useRef<() => void>(() => {});
  const handleOpenRef = useRef<() => void>(() => {});
  const handleNewRef = useRef<() => void>(() => {});
  const showStartRef = useRef<() => void>(() => {});
  const handleDuplicateRef = useRef<() => void>(() => {});
  const handleOpenRecentRef = useRef<(path: string) => Promise<void> | void>(() => {});
  // "Abspielen" and "Präsentieren" in the native "Ansicht" menu: on the slide that is selected.
  const playFromMenuRef = useRef<() => void>(() => {});
  const presentFromMenuRef = useRef<() => void>(() => {});
  const presentingRef = useRef(presenting);
  presentingRef.current = presenting;
  const presenterRef = useRef(presenter);
  presenterRef.current = presenter;
  // "Undo"/"Redo" in the native "Edit" menu (see src-tauri/src/lib.rs, which owns the
  // Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z accelerators) - replacing the platform default Edit menu,
  // whose Undo/Redo instead drove the focused WKWebView's own contentEditable undo stack, out of
  // sync with (and confusingly different from) the app's own document-level undo/redo. undo/redo
  // themselves are stable Zustand action references, so - unlike the handlers below - no ref
  // indirection is needed to keep this subscription from going stale.
  useEffect(() => {
    if (!isTauri()) return;
    const unlistenZoom = listen<string>("weft://menu-zoom", (e) => {
      useAccessibilityStore.getState().stepUiZoom(e.payload === "in" ? 1 : e.payload === "out" ? -1 : 0);
    });
    const unlistenUndo = listen("weft://menu-undo", () => {
      if (!presentingRef.current && !playerRef.current && phaseRef.current === "editor") {
        undo();
        announceStatus(tr("ui.status_undone"));
      }
    });
    const unlistenRedo = listen("weft://menu-redo", () => {
      if (!presentingRef.current && !playerRef.current && phaseRef.current === "editor") {
        redo();
        announceStatus(tr("ui.status_redone"));
      }
    });
    return () => {
      void unlistenZoom.then((fn) => fn());
      void unlistenUndo.then((fn) => fn());
      void unlistenRedo.then((fn) => fn());
    };
  }, [undo, redo]);

  useEffect(() => {
    if (!isTauri()) return;
    // (The items that act on the module being edited are greyed out while a player file is shown - see
    // set_player_mode - and ignored here as well, in case a shortcut still gets through.)
    const idle = () => presentingRef.current || playerRef.current !== null || phaseRef.current !== "editor";
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
    const unlistenExportPdf = listen("weft://menu-export-pdf", () => {
      if (!idle()) handleExportPdfRef.current();
    });
    const unlistenOpen = listen("weft://menu-open", () => {
      if (!presentingRef.current) handleOpenRef.current();
    });
    const unlistenStart = listen("weft://menu-start", () => {
      if (!presentingRef.current) showStartRef.current();
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
    const unlistenPlay = listen("weft://menu-play", () => {
      if (!idle() && !presenterRef.current) playFromMenuRef.current();
    });
    const unlistenPresent = listen("weft://menu-present", () => {
      if (!idle() && !presenterRef.current) presentFromMenuRef.current();
    });
    return () => {
      void unlistenSave.then((fn) => fn());
      void unlistenSaveAs.then((fn) => fn());
      void unlistenExport.then((fn) => fn());
      void unlistenExportPlayer.then((fn) => fn());
      void unlistenExportPdf.then((fn) => fn());
      void unlistenOpen.then((fn) => fn());
      void unlistenStart.then((fn) => fn());
      void unlistenNew.then((fn) => fn());
      void unlistenDuplicate.then((fn) => fn());
      void unlistenOpenRecent.then((fn) => fn());
      void unlistenJoin.then((fn) => fn());
      void unlistenMerge.then((fn) => fn());
      void unlistenPlay.then((fn) => fn());
      void unlistenPresent.then((fn) => fn());
    };
  }, []);

  // F6 / Shift+F6 go to the next / previous of the three areas (the slides, the work area, the properties); Shift+Enter goes from a selected
  // element into its properties and back; Cmd/Ctrl+Alt+1, 2 and 3 go to one of the areas directly. The focus lands on what is selected there (or on its
  // first control).
  useEffect(() => {
    function focusArea(index: number) {
      const areas = [".weft-sidebar", ".weft-canvas", ".weft-inspector"];
      const root = document.querySelector<HTMLElement>(areas[index]);
      if (!root) return false;
      const isUsable = (el: HTMLElement) => el.getClientRects().length > 0 && !(el as HTMLButtonElement).disabled;
      // What gets the focus, the first that is there: what is selected in that area, else its first control.
      const preferred: Record<number, string[]> = {
        0: [".weft-node.is-active", ".weft-node.is-current", ".weft-sidebar-tab.is-active"],
        1: ["[data-block-id].is-selected", ".weft-stage-edit"],
        // (The first real control, not the heading of the first foldable section.)
        2: [
          ".weft-inspector-body .weft-collapsible-body :is(button, input, select, textarea)",
          ".weft-inspector-body :is(button, input, select, textarea)",
        ],
      };
      let target: HTMLElement = root;
      for (const selector of preferred[index]) {
        const found = Array.from(root.querySelectorAll<HTMLElement>(selector)).find(isUsable);
        if (found) {
          target = found;
          break;
        }
      }
      if (target === root) root.tabIndex = -1;
      target.focus({ preventScroll: false });
      return true;
    }
    function currentArea(): number {
      const active = document.activeElement;
      if (active?.closest(".weft-inspector")) return 2;
      if (active?.closest(".weft-sidebar")) return 0;
      return 1;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (presentingRef.current || phaseRef.current !== "editor" || playerRef.current !== null) return;
      if (e.key === "F6" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        focusArea((currentArea() + (e.shiftKey ? 2 : 1)) % 3);
      } else if (e.key === "Enter" && e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Shift+Enter: from the selected element into its properties, and from the properties back to the element. (Not where it is a line
        // break: in a text that is being edited, or in a text area.)
        const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (!active) return;
        if (active.closest(".weft-inspector")) {
          if (active.tagName === "TEXTAREA" || active.isContentEditable) return;
          e.preventDefault();
          focusArea(1);
        } else if (active.hasAttribute("data-block-id") && active.closest(".weft-canvas")) {
          e.preventDefault();
          focusArea(2);
        }
      } else if ((e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey && ["Digit1", "Digit2", "Digit3"].includes(e.code)) {
        e.preventDefault();
        focusArea(Number(e.code.slice(-1)) - 1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Where there is no menu bar (a browser, a tablet) the same commands come from the app's own File menu (FileMenu.tsx) and,
  // with a keyboard, from the usual shortcuts.
  const inAppMenu = !hasNativeMenu();
  function runCommand(command: MenuCommand) {
    const editing = !presentingRef.current && playerRef.current === null && phaseRef.current === "editor";
    switch (command) {
      case "start":
        return void showStartRef.current();
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
      case "exportPdf":
        return editing ? void handleExportPdfRef.current() : undefined;
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
      } else if ((key === "z" || key === "y") && !typing && playerRef.current === null && phaseRef.current === "editor") {
        e.preventDefault();
        if (key === "y" || e.shiftKey) {
          redo();
          announceStatus(tr("ui.status_redone"));
        } else {
          undo();
          announceStatus(tr("ui.status_undone"));
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inAppMenu, undo, redo]);

  function endPresentation() {
    if (!presentingRef.current) return;
    setPresenting(false);
    const pageId = shownPageRef.current;
    const { doc: current, select } = useDocumentStore.getState();
    if (pageId && current.content.pages[pageId]) select({ type: "page", pageId });
  }
  endPresentationRef.current = endPresentation;

  function handlePresent(startPageId: string | null) {
    shownPageRef.current = startPageId;
    setPresentStartPageId(startPageId);
    setPresenting(true);
    void enterFullscreenPreview();
  }

  if (presenting) {
    return <PresentationView startPageId={presentStartPageId} onExit={endPresentation} />;
  }
  if (presenter) {
    return <PresenterView startPageId={presenter.startPageId} onExit={() => setPresenter(null)} />;
  }

  // Only a brand-new document (no filePath yet) asks where to save - once it has one, whether
  // from a prior save or from "Öffnen", Speichern/Cmd+S silently overwrites that same file,
  // matching how Save works in most other apps.
  async function handleSave() {
    try {
      if (filePath) {
        await saveDocumentToPath(doc, filePath);
        useDocumentStore.getState().markSaved(doc.content);
        announceStatus(tr("ui.status_saved"));
      } else if (libraryMode()) {
        await ensureLibraryDocument();
      } else {
        const path = await saveDocumentAs(doc);
        if (path) {
          useDocumentStore.setState({ filePath: path });
          useDocumentStore.getState().markSaved(doc.content);
          void clearRecoveryCopy();
          announceStatus(tr("ui.status_saved"));
        }
      }
    } catch (err) {
      alert(`${t("toolbar.saveFailed")}\n${errorMessage(err)}`);
    }
  }
  handleSaveRef.current = handleSave;

  // In the library every module has a file from the start (see core/io/library.ts): one that has none yet - the module the app
  // starts with, one restored from the recovery copy - gets its file now.
  // (One at a time: asked twice before the first is done - a double-fired effect, a quick second tap - it must not make two files.)
  function ensureLibraryDocument(): Promise<void> {
    if (!libraryMode()) return Promise.resolve();
    ensuringRef.current ??= (async () => {
      const { filePath: path, doc: current } = useDocumentStore.getState();
      if (path !== null || usePlayerStore.getState().player || useStartStore.getState().phase !== "editor") return;
      const created = await createLibraryFile(current.content.title, await packDocument(current));
      useDocumentStore.setState({ filePath: created });
      useDocumentStore.getState().markSaved(current.content);
      void clearRecoveryCopy();
    })().finally(() => {
      ensuringRef.current = null;
    });
    return ensuringRef.current;
  }
  ensureLibraryDocumentRef.current = ensureLibraryDocument;

  // Unlike handleSave, always asks where to save - even once the document already has a
  // filePath - and then adopts whatever path was chosen as the document's own going forward
  // (like most apps' Save As: this becomes the file Speichern/Cmd+S now silently overwrites,
  // not the one it was opened from or last saved to).
  async function handleSaveAs() {
    try {
      if (libraryMode()) {
        // A tablet app can't save to a place of its own choosing: "Speichern unter" is a copy handed on (the share sheet, see
        // ExportReadyDialog) - the module itself stays where it is, in the library.
        await saveDocumentAs(doc);
        return;
      }
      const path = await saveDocumentAs(doc);
      if (path) {
        useDocumentStore.setState({ filePath: path });
        useDocumentStore.getState().markSaved(doc.content);
        void clearRecoveryCopy();
        announceStatus(tr("ui.status_saved"));
      }
    } catch (err) {
      alert(`${t("toolbar.saveFailed")}\n${errorMessage(err)}`);
    }
  }
  handleSaveAsRef.current = handleSaveAs;

  async function handleExport() {
    try {
      if (await exportAsHtmlModule(doc)) announceStatus(tr("ui.status_exported"));
    } catch (err) {
      alert(`${t("toolbar.exportFailed")}\n${errorMessage(err)}`);
    }
  }
  handleExportRef.current = handleExport;

  async function handleExportPlayer() {
    try {
      if (await exportPlayerFile(doc)) announceStatus(tr("ui.status_exported"));
    } catch (err) {
      alert(`${t("toolbar.exportFailed")}\n${errorMessage(err)}`);
    }
  }
  handleExportPlayerRef.current = handleExportPlayer;

  // "Exportieren als PDF": every page of the module as a picture on a page of a PDF (see exportPdf.tsx) - which takes a moment,
  // shown as a small note while it runs.
  async function handleExportPdf() {
    if (exportingPdfRef.current) return;
    exportingPdfRef.current = true;
    setPdfProgress({ done: 0, total: 0 });
    announceStatus(tr("ui.status_pdf_started"));
    try {
      const { exportModuleAsPdf } = await import("./exportPdf");
      const bytes = await exportModuleAsPdf(useDocumentStore.getState().doc.content, (done, total) => setPdfProgress({ done, total }));
      setPdfProgress(null);
      if (await savePdf(useDocumentStore.getState().doc, bytes)) announceStatus(tr("ui.status_exported"));
    } catch (err) {
      setPdfProgress(null);
      alert(`${t("toolbar.exportFailed")}\n${errorMessage(err)}`);
    } finally {
      exportingPdfRef.current = false;
    }
  }
  handleExportPdfRef.current = handleExportPdf;
  playFromMenuRef.current = () => handlePresent(startPageIdOf(useDocumentStore.getState().selection));
  presentFromMenuRef.current = () => setPresenter({ startPageId: startPageIdOf(useDocumentStore.getState().selection) });

  // Switching to another module replaces the one that is open: what is saved in its file already (the
  // pending autosave is written first), what is not asks first - a module that was never saved has only
  // the recovery copy, which the next one takes over.
  async function confirmLeave(): Promise<boolean> {
    const { filePath: path, doc: current } = useDocumentStore.getState();
    if (path === null) {
      if (current.content.modifiedAt === current.content.createdAt) return true;
      return confirmDestructive(
        tr("ui.the_current_learning_module_has_not"),
        tr("ui.not_saved"),
      );
    }
    try {
      await flushAutosave();
      return true;
    } catch (err) {
      return confirmDestructive(tr("ui.the_current_learning_module_could_not", { n0: errorMessage(err) }), tr("ui.not_saved"));
    }
  }

  // A module without a file of its own (new, or a copy) is kept in the recovery copy until it is saved - and
  // not the file that was open before is what the next launch comes back to.
  async function startUnsavedDocument(next: WeftDocument) {
    loadDocument(next, null);
    if (libraryMode()) {
      // (In the library there is no such thing as an unsaved module: it gets its file right away.)
      await ensureLibraryDocument();
      return;
    }
    try {
      const { doc: loaded } = useDocumentStore.getState();
      await saveRecoveryCopy(loaded);
    } catch {
      // The autosave tries again with the first change.
    }
  }

  async function handleNew() {
    if (!(await confirmLeave())) return;
    await startUnsavedDocument(createBlankDocument());
  }
  handleNewRef.current = handleNew;

  // A module that comes with Weft (a template, an example - see features/start/) becomes a module of its own: a copy under a new id and
  // with an editing history of its own, not yet saved anywhere.
  async function handleUseModule(bytes: Uint8Array) {
    try {
      if (!(await confirmLeave())) return;
      await startUnsavedDocument(copyOfTemplate(unpackDocument(bytes)));
    } catch (err) {
      alert(`${t("toolbar.openFailed")}\n${errorMessage(err)}`);
    }
  }

  // A tutorial is only played (nothing of the module that is open is touched: the start screen comes back with "Start").
  async function handlePlayModule(bytes: Uint8Array) {
    try {
      openPlayer(await loadPlayerFile(bytes), null);
    } catch (err) {
      alert(`${t("toolbar.openFailed")}\n${errorMessage(err)}`);
    }
  }

  function showStart() {
    usePlayerStore.getState().close();
    setPhase("start");
  }
  showStartRef.current = showStart;

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
    const content = { ...plain(current.content), id: createId(), title: tr("ui.copy", { title: current.content.title }), createdAt: now, modifiedAt: now };
    await startUnsavedDocument({ formatVersion: current.formatVersion, content });
  }
  handleDuplicateRef.current = handleDuplicate;

  /**
   * Loads a document read from a file - a copy of another file (same module id seen at another place, see documentLocations.ts) gets a
   * new id first. That new id is not yet in the file: the document counts as changed, so that the autosave writes it.
   */
  async function loadFromFile(doc: WeftDocument, path: string | null) {
    // A template is never worked on in its own file: it opens as a copy that has no file yet.
    if (doc.content.template) {
      setCopyNotice(null);
      await startUnsavedDocument(copyOfTemplate(doc));
      return;
    }
    const { doc: reconciled, copyOf } = await reconcileOpenedDocument(doc, path);
    loadDocument(reconciled, path);
    if (copyOf && path) {
      const { doc: loaded } = useDocumentStore.getState();
      useDocumentStore.setState({ savedContent: { ...loaded.content } });
      setCopyNotice({ file: path.split(/[\\/]/).pop() ?? path, of: copyOf });
    } else {
      setCopyNotice(null);
    }
  }

  async function handleOpen() {
    if (libraryMode()) {
      // The modules of the library to choose from (and the way to bring one in) - which asks before replacing what is open.
      useCollabDialog.getState().show("library");
      return;
    }
    try {
      if (!(await confirmLeave())) return;
      const result = await openDocument();
      if (!result) return;
      if (result.kind === "player") openPlayer(result.player, result.path);
      else if (result.kind === "folder") await openFromSharedFolder(result.link, result.path);
      else await loadFromFile(result.doc, result.path);
    } catch (err) {
      alert(`${t("toolbar.openFailed")}\n${errorMessage(err)}`);
    }
  }
  handleOpenRef.current = handleOpen;

  /**
   * A link file ("<title>.weft" in a module's directory of a shared folder, see FolderLink) was opened. If this computer has a copy of the
   * module already, that one is opened - and goes on syncing with the folder. If not, the person is asked where to keep a copy; it is made
   * from the folder (everybody's work merged), saved there and synced with the folder from then on.
   */
  async function openFromSharedFolder(link: FolderLink, linkPath: string | null) {
    if (!linkPath) throw new Error(tr("ui.this_folder_does_not_hold_a"));
    const { root, module } = moduleOfLink(link, linkPath);
    const local = await knownLocalCopy(module.moduleId);
    if (local) {
      rememberSyncFolder(module.moduleId, root);
      const opened = await openDocumentAtPath(local);
      if (opened?.kind === "document") await loadFromFile(opened.doc, local);
      return;
    }
    let target: string | null = null;
    if (!libraryMode()) {
      if (!(await confirmDestructive(tr("ui.folder_module_new_copy"), tr("ui.folder_module_title")))) return;
      target = await chooseModuleSavePath(module.title);
      if (!target) return;
    }
    const opened = await readModuleFromFolder(root, module);
    loadDocument(opened, null);
    await startFolderSync(root);
    if (target) {
      const { doc: loaded } = useDocumentStore.getState();
      await saveDocumentToPath(loaded, target);
      useDocumentStore.setState({ filePath: target });
      useDocumentStore.getState().markSaved(loaded.content);
      await rememberSavedLocation(loaded.content.id, target).catch(() => undefined);
      void clearRecoveryCopy();
    } else {
      await ensureLibraryDocument();
    }
  }

  async function handleOpenRecent(path: string) {
    try {
      if (!(await confirmLeave())) return;
      const opened = await openDocumentAtPath(path);
      if (!opened) return;
      if (opened.kind === "player") openPlayer(opened.player, path);
      else if (opened.kind === "folder") await openFromSharedFolder(opened.link, path);
      else await loadFromFile(opened.doc, path);
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
          onStart={showStart}
          menu={inAppMenu ? <FileMenu onCommand={runCommand} onOpenRecent={(path) => void handleOpenRecentRef.current(path)} playerShown /> : undefined}
        />
        <CollabDialogs />
        <LibraryDialogs onOpen={(path) => void handleOpenRecentRef.current(path)} currentPath={currentPath} />
      </div>
    );
  }

  if (phase === "launching") return <div className="weft-shell" />;

  if (phase === "start") {
    return (
      <div className="weft-shell">
        <StartScreen
          actions={{
            onNew: () => void handleNewRef.current(),
            onOpenFile: () => void handleOpenRef.current(),
            onOpenPath: async (path) => void (await handleOpenRecentRef.current(path)),
            onUseModule: (bytes) => handleUseModule(bytes),
            onPlay: (bytes) => handlePlayModule(bytes),
            // (The desktop app has the settings in a window of their own, see show_settings_window in src-tauri/src/lib.rs.)
            onSettings: () => (hasNativeMenu() ? void invoke("open_settings_window").catch(() => undefined) : useCollabDialog.getState().show("settings")),
          }}
        />
        <CollabDialogs />
        <LibraryDialogs onOpen={(path) => void handleOpenRecentRef.current(path)} currentPath={currentPath} />
      </div>
    );
  }

  return (
    <div className="weft-shell">
      {inAppMenu && <AppBar onCommand={runCommand} onOpenRecent={(path) => void handleOpenRecentRef.current(path)} />}
      <div
        className={"weft-body" + (drawerOpen ? " has-drawer-open" : "")}
        ref={bodyRef}
        style={{ gridTemplateColumns: compact ? `${sidebarWidth}px ${RESIZER_WIDTH}px 1fr` : `${sidebarWidth}px ${RESIZER_WIDTH}px 1fr ${INSPECTOR_WIDTH}px` }}
      >
        <Sidebar />
        <div className="weft-resizer" onPointerDown={handleResizerPointerDown} title={t("toolbar.resizerTitle")} />
        <Canvas onPresent={handlePresent} />
        <div className={"weft-inspector-slot" + (compact ? " is-drawer" : "") + (compact && inspectorOpen ? " is-open" : "")}>
          {compact && (
            <button
              type="button"
              className="weft-inspector-tab"
              aria-expanded={inspectorOpen}
              aria-label={tr("ui.properties")}
              title={tr("ui.properties")}
              // Like the format buttons of the panel: a tap on it must not take the focus - and with it the marked text - away
              // from the slide (see TextEditor in panels/BlockPanel.tsx).
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setInspectorOpen((open) => !open)}
            >
              {inspectorOpen ? "›" : "‹"}
            </button>
          )}
          <Inspector />
        </div>
      </div>
      {copyNotice && (
        <div className="weft-export-progress weft-copy-notice" role="status">
          <span>
            {tr("ui.weft_has_recognised_this_file_as")}
          </span>
          <button type="button" className="weft-icon-button" title={tr("ui.close")} aria-label={tr("ui.close")} onClick={() => setCopyNotice(null)}>
            ×
          </button>
        </div>
      )}
      {pdfProgress && (
        <div className="weft-export-progress" role="status">
          {tr("ui.creating_pdf")}{pdfProgress.total > 0 ? ` ${Math.min(pdfProgress.done + 1, pdfProgress.total)} / ${pdfProgress.total}` : ""}
        </div>
      )}
      <CollabDialogs />
      <FolderLostDialog />
      <LibraryDialogs onOpen={(path) => void handleOpenRecentRef.current(path)} currentPath={currentPath} />
    </div>
  );
}
