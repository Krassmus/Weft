import { create } from "zustand";
import { createId } from "../id";
import type { ModuleLicense } from "../types";

/**
 * The licences the author has made themselves: a name and a text, kept in the app's own storage (like the profile, see profileStore.ts) and made and
 * edited in the settings window. A module takes one of them as its licence in the module's settings - and then carries a copy of its name and text (see
 * ModuleLicense), so it does not depend on this list.
 */
export interface CustomLicense {
  id: string;
  name: string;
  text: string;
}

const KEY = "weft:licenses";

function read(): CustomLicense[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is CustomLicense => !!entry && typeof entry.id === "string" && typeof entry.name === "string" && typeof entry.text === "string",
    );
  } catch {
    return []; // storage unavailable or not readable: no licences of the author's own
  }
}

function write(licenses: CustomLicense[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(licenses));
  } catch {
    /* not persisted - fine */
  }
}

interface LicenseState {
  licenses: CustomLicense[];
  add: () => string;
  update: (id: string, patch: Partial<Pick<CustomLicense, "name" | "text">>) => void;
  remove: (id: string) => void;
}

export const useLicenseStore = create<LicenseState>((set, get) => {
  const change = (licenses: CustomLicense[]) => {
    write(licenses);
    set({ licenses });
  };
  return {
    licenses: read(),
    add: () => {
      const license: CustomLicense = { id: `custom-${createId()}`, name: "", text: "" };
      change([...get().licenses, license]);
      return license.id;
    },
    update: (id, patch) => change(get().licenses.map((license) => (license.id === id ? { ...license, ...patch } : license))),
    remove: (id) => change(get().licenses.filter((license) => license.id !== id)),
  };
});

/** What a module carries of a licence of the author's own. */
export function moduleLicenseOf(license: CustomLicense): ModuleLicense {
  return { id: license.id, name: license.name, text: license.text };
}

// The settings window and the editor are separate webviews that share this storage but not their in-memory state: a change made in one reaches the other
// through the browser's "storage" event (which never fires in the window that made it).
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) useLicenseStore.setState({ licenses: read() });
  });
}
