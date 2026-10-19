import { create } from "zustand";

/**
 * The accessibility settings of the app itself (not of a module): how strong the contrasts of the interface are, and whether the
 * keyboard focus gets a ring. Kept in localStorage like the language (see languageStore.ts) and handed to the stylesheet as attributes of
 * <html> (`data-weft-contrast`, `data-weft-focus` - see the end of App.css), so that Weft looks as it always did until somebody changes
 * them.
 */
export type ContrastLevel = "stylish" | "higher" | "strong";

const CONTRAST_KEY = "weft:contrast";
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

function readFocusRing(): boolean {
  return read(FOCUS_KEY) === "on";
}

interface AccessibilityState {
  contrast: ContrastLevel;
  /** Whether the element that has the keyboard focus gets a visible ring. */
  focusRing: boolean;
  setContrast: (contrast: ContrastLevel) => void;
  setFocusRing: (focusRing: boolean) => void;
}

function apply(state: { contrast: ContrastLevel; focusRing: boolean }): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.weftContrast = state.contrast;
  document.documentElement.dataset.weftFocus = state.focusRing ? "on" : "off";
}

export const useAccessibilityStore = create<AccessibilityState>((set, get) => ({
  contrast: readContrast(),
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
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === CONTRAST_KEY || e.key === FOCUS_KEY) {
      useAccessibilityStore.setState({ contrast: readContrast(), focusRing: readFocusRing() });
      apply(useAccessibilityStore.getState());
    }
  });
}
