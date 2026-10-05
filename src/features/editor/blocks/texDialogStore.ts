import { create } from "zustand";

/**
 * Which TeX block's editing dialog is open (if any). A tiny store of its own because two places
 * open it - a double-click on the block itself (BlockView.tsx) and the icon in the sidebar
 * (TexEditor in panels/BlockPanel.tsx) - while the dialog itself is rendered by the sidebar's
 * TexEditor, the one place that has the selected block and its onUpdate at hand.
 */
interface TexDialogState {
  blockId: string | null;
  open: (blockId: string) => void;
  close: () => void;
}

export const useTexDialog = create<TexDialogState>((set) => ({
  blockId: null,
  open: (blockId) => set({ blockId }),
  close: () => set({ blockId: null }),
}));
