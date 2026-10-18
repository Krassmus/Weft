import { create } from "zustand";

/**
 * Which video block's dialog for its time marks is open (if any) - the same arrangement as texDialogStore.ts: it is opened by a
 * double-click on the video itself (BlockView.tsx) and by the button in the sidebar (VideoEditor in panels/BlockPanel.tsx), and rendered
 * by the sidebar, the one place that has the selected block and its onUpdate at hand.
 */
interface StopPointDialogState {
  blockId: string | null;
  open: (blockId: string) => void;
  close: () => void;
}

export const useStopPointDialog = create<StopPointDialogState>((set) => ({
  blockId: null,
  open: (blockId) => set({ blockId }),
  close: () => set({ blockId: null }),
}));
