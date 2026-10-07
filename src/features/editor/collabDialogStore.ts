import { create } from "zustand";

/** Which of the dialogs for working together is open (see CollabDialogs.tsx) - opened from the File menu
 * (see EditorShell.tsx). */
export const useCollabDialog = create<{
  open: "join" | "merge" | null;
  show: (dialog: "join" | "merge") => void;
  close: () => void;
}>((set) => ({
  open: null,
  show: (dialog) => set({ open: dialog }),
  close: () => set({ open: null }),
}));
