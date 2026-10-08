import { create } from "zustand";

/** Which dialog from the File menu is open (see CollabDialogs.tsx): joining an invitation, merging a file, the
 * app's settings (where there is no separate settings window - see hasNativeMenu), the library of modules (a tablet - see
 * libraryMode), who is working on the module (a click on the avatars above the slide). */
export type MenuDialog = "join" | "merge" | "settings" | "library" | "people";

export const useCollabDialog = create<{
  open: MenuDialog | null;
  show: (dialog: MenuDialog) => void;
  close: () => void;
}>((set) => ({
  open: null,
  show: (dialog) => set({ open: dialog }),
  close: () => set({ open: null }),
}));
