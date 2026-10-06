import { create } from "zustand";

/**
 * Who this person is to the people they work with: a name and an optional avatar picture. It belongs
 * to the person, not to any module - it is kept in the app's own storage (like the interface language,
 * see core/i18n/languageStore.ts), edited in the app settings window and shown to the others when
 * collaborating (core/collab/presence.ts). Nothing of it is written into a .weft file.
 *
 * The avatar is a small square picture as a data URL (see avatarFromFile), small enough to be sent to
 * every peer as is.
 */
const NAME_KEY = "weft:profile-name";
const AVATAR_KEY = "weft:profile-avatar";
// Where the name was kept before it got its own place.
const LEGACY_NAME_KEY = "weft.collabName";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage unavailable (private/locked-down webview) - the profile just isn't remembered
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* not persisted - fine */
  }
}

function readName(): string {
  const stored = read(NAME_KEY) ?? read(LEGACY_NAME_KEY);
  if (stored) return stored;
  // Somebody who never chose a name is still told apart from the others.
  const generated = `Gast ${Math.floor(1000 + Math.random() * 9000)}`;
  write(NAME_KEY, generated);
  return generated;
}

interface ProfileState {
  name: string;
  /** A small square picture as a data URL, or null. */
  avatar: string | null;
  setName: (name: string) => void;
  setAvatar: (avatar: string | null) => void;
}

export const useProfileStore = create<ProfileState>((set) => ({
  name: readName(),
  avatar: read(AVATAR_KEY),
  setName: (name) => {
    write(NAME_KEY, name);
    set({ name });
  },
  setAvatar: (avatar) => {
    write(AVATAR_KEY, avatar);
    set({ avatar });
  },
}));

// The settings window and the editor are separate webviews that share this storage but not their
// in-memory state: a change made in one reaches the other through the browser's "storage" event
// (which never fires in the window that made it).
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === NAME_KEY) useProfileStore.setState({ name: read(NAME_KEY) ?? "" });
    if (e.key === AVATAR_KEY) useProfileStore.setState({ avatar: read(AVATAR_KEY) });
  });
}
