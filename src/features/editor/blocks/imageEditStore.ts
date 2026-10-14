import { create } from "zustand";

/**
 * Whose mask is being edited on the canvas (the "Maske" tile in the sidebar, panels/BlockPanel.tsx - the points show on the block,
 * BlockView.tsx) and which of its points is the one the sidebar's buttons act on. A tiny store of its own because the sidebar and
 * the canvas are two places that know about it.
 */
interface ImageEditState {
  blockId: string | null;
  selectedPoint: number | null;
  edit: (blockId: string | null) => void;
  select: (index: number | null) => void;
}

export const useImageEdit = create<ImageEditState>((set) => ({
  blockId: null,
  selectedPoint: null,
  edit: (blockId) => set({ blockId, selectedPoint: null }),
  select: (selectedPoint) => set({ selectedPoint }),
}));
