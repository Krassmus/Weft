import { create } from "zustand";

/**
 * A block that is to be edited as soon as it is on the canvas: the text that has just been made for a placeholder (clicking the slot
 * is "start typing here", not "select it" - see PlaceholderSlot.tsx). BlockView takes the request when it has the block selected.
 */
interface PendingEditState {
  blockId: string | null;
  request: (blockId: string) => void;
  clear: () => void;
}

export const usePendingEdit = create<PendingEditState>((set) => ({
  blockId: null,
  request: (blockId) => set({ blockId }),
  clear: () => set({ blockId: null }),
}));
