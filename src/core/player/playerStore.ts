import { create } from "zustand";
import type { PlayerFile } from "../io/playerFile";

/** The player file Weft is showing instead of the editor, if any (see features/player/PlayerShell.tsx). */
interface PlayerState {
  player: (PlayerFile & { path: string | null }) | null;
  open: (player: PlayerFile, path: string | null) => void;
  /** Back to the editor - whatever loads a module of its own calls this (see EditorShell.tsx). */
  close: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  player: null,
  open: (player, path) => set({ player: { ...player, path } }),
  close: () => set((state) => (state.player ? { player: null } : state)),
}));
