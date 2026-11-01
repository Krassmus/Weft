import { create } from "zustand";
import { LANGUAGES } from "./translations";
import type { Language } from "./translations";

export type LanguagePreference = "system" | Language;

const STORAGE_KEY = "weft:language";

/** The first of the languages the system prefers (in its order) that the interface has - "pt-PT" gives "pt", "de-AT" gives "de";
 * English when none of them is offered. */
export function systemLanguage(preferred?: readonly string[]): Language {
  const list = preferred ?? (typeof navigator !== "undefined" ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []);
  for (const raw of list) {
    const code = (raw ?? "").toLowerCase().split(/[-_]/)[0];
    const match = LANGUAGES.find((language) => language === code);
    if (match) return match;
  }
  return "en";
}

function isLanguage(value: string | null): value is Language {
  return value !== null && (LANGUAGES as readonly string[]).includes(value);
}

function readStoredPreference(): LanguagePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "system" || isLanguage(stored)) return stored;
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
