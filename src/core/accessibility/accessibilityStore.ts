import { create } from "zustand";

/**
 * The accessibility settings of the app itself (not of a module): how strong the contrasts of the interface are, and whether the
 * keyboard focus gets a ring. Kept in localStorage like the language (see languageStore.ts) and handed to the stylesheet as attributes of
 * <html> (`data-weft-contrast`, `data-weft-focus` - see the end of App.css), so that Weft looks as it always did until somebody changes
 * them.
 */
export type ContrastLevel = "stylish" | "higher" | "strong";

/** The sizes of the interface to choose from (1 = as designed). Only the desktop app has them: the webview is zoomed as a whole. */
export const UI_ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

const CONTRAST_KEY = "weft:contrast";
const ZOOM_KEY = "weft:ui-zoom";
const FOCUS_KEY = "weft:focus-ring";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readContrast(): ContrastLevel {
  const stored = read(CONTRAST_KEY);
  return stored === "higher" || stored === "strong" ? stored : "stylish";
}

function readUiZoom(): number {
  const stored = Number(read(ZOOM_KEY));
  return UI_ZOOM_STEPS.includes(stored) ? stored : 1;
}

function readFocusRing(): boolean {
  return read(FOCUS_KEY) === "on";
}

interface AccessibilityState {
  contrast: ContrastLevel;
  /** Whether the element that has the keyboard focus gets a visible ring. */
  focusRing: boolean;
  /** How large the interface of the desktop app is (one of UI_ZOOM_STEPS). */
  uiZoom: number;
  setContrast: (contrast: ContrastLevel) => void;
  setUiZoom: (zoom: number) => void;
  /** One step larger (1), smaller (-1) or back to the original size (0). */
  stepUiZoom: (direction: -1 | 0 | 1) => void;
  setFocusRing: (focusRing: boolean) => void;
}

function apply(state: { contrast: ContrastLevel; focusRing: boolean }): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.weftContrast = state.contrast;
  document.documentElement.dataset.weftFocus = state.focusRing ? "on" : "off";
}

let lastAppliedZoom = 1;

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Zooms the webview of this window as a whole (not the audience's window: what the audience sees is the slide, whatever the author's eyes need). */
function applyUiZoom(zoom: number): void {
  if (!isTauri() || zoom === lastAppliedZoom) return;
  lastAppliedZoom = zoom;
  void import("@tauri-apps/api/webview")
    .then(({ getCurrentWebview }) => {
      const webview = getCurrentWebview();
      if (webview.label === "audience") return;
      return webview.setZoom(zoom);
    })
    .catch(() => {
      lastAppliedZoom = 1;
    });
}

export const useAccessibilityStore = create<AccessibilityState>((set, get) => ({
  contrast: readContrast(),
  uiZoom: readUiZoom(),
  setUiZoom: (uiZoom) => {
    try {
      localStorage.setItem(ZOOM_KEY, String(uiZoom));
    } catch {
      // Not fatal.
    }
    set({ uiZoom });
    applyUiZoom(uiZoom);
  },
  stepUiZoom: (direction) => {
    const current = UI_ZOOM_STEPS.indexOf(get().uiZoom);
    const index = direction === 0 ? UI_ZOOM_STEPS.indexOf(1) : Math.max(0, Math.min(UI_ZOOM_STEPS.length - 1, current + direction));
    get().setUiZoom(UI_ZOOM_STEPS[index]);
  },
  focusRing: readFocusRing(),
  setContrast: (contrast) => {
    try {
      localStorage.setItem(CONTRAST_KEY, contrast);
    } catch {
      // Not fatal - the choice just won't survive a restart.
    }
    set({ contrast });
    apply(get());
  },
  setFocusRing: (focusRing) => {
    try {
      localStorage.setItem(FOCUS_KEY, focusRing ? "on" : "off");
    } catch {
      // Not fatal.
    }
    set({ focusRing });
    apply(get());
  },
}));

// Before the first picture is drawn (no flash of the default look), and in every window when another one changes a setting: the settings
// window and the editor are separate webviews that share localStorage, and "storage" fires in the other windows only.
apply(useAccessibilityStore.getState());
applyUiZoom(useAccessibilityStore.getState().uiZoom);
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === CONTRAST_KEY || e.key === FOCUS_KEY || e.key === ZOOM_KEY) {
      useAccessibilityStore.setState({ contrast: readContrast(), focusRing: readFocusRing(), uiZoom: readUiZoom() });
      apply(useAccessibilityStore.getState());
      applyUiZoom(useAccessibilityStore.getState().uiZoom);
    }
  });
}
