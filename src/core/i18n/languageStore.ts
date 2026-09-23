import { create } from "zustand";
import type { Language } from "./translations";

export type LanguagePreference = "system" | Language;

const STORAGE_KEY = "weft:language";

function systemLanguage(): Language {
  const raw = (typeof navigator !== "undefined" && navigator.language) || "en";
  return raw.toLowerCase().startsWith("de") ? "de" : "en";
}

function readStoredPreference(): LanguagePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "system" || stored === "de" || stored === "en") return stored;
  } catch {
    // Storage unavailable (private/locked-down webview) - just fall back to system detection.
  }
  return "system";
}

interface LanguageState {
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => void;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  preference: readStoredPreference(),
  setPreference: (preference) => {
    try {
      localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      // Not fatal - the choice just won't survive a restart.
    }
    set({ preference });
  },
}));

/** The settings window and the main editor window are two separate webview instances sharing
 * the same localStorage (same origin) but not each other's in-memory state - changing the
 * language in one doesn't retroactively update the other's already-running Zustand store on its
 * own. The browser's own "storage" event fires in every *other* same-origin window whenever one
 * of them writes to localStorage, which is exactly the signal needed to keep them in sync; it
 * never fires in the window that made the change, so this can't just re-apply its own writes. */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) useLanguageStore.setState({ preference: readStoredPreference() });
  });
}

export function resolveLanguage(preference: LanguagePreference): Language {
  return preference === "system" ? systemLanguage() : preference;
}

export function useResolvedLanguage(): Language {
  return resolveLanguage(useLanguageStore((s) => s.preference));
}
