import { create } from "zustand";

/**
 * What the window shows (see EditorShell.tsx): `launching` for the moment the app decides, `start` the start screen (the app was
 * opened without a file - see StartScreen.tsx), `editor` the module being edited. A player file that is shown (see usePlayerStore)
 * is on top of whichever of the two is underneath.
 */
type Phase = "launching" | "start" | "editor";

interface StartState {
  phase: Phase;
  setPhase: (phase: Phase) => void;
}

export const useStartStore = create<StartState>((set) => ({
  phase: "launching",
  setPhase: (phase) => set((state) => (state.phase === phase ? state : { phase })),
}));
