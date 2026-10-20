import { create } from "zustand";

/**
 * Which Aktionseffekt of which block is being edited - the one whose way (a move) is drawn on the slide for the author to drag (see
 * ActionPathOverlay). Set by the effect's card in the panels; the way is only shown while that block is the selected one (or the effect's
 * event is selected in the graph).
 */
interface ActionEditState {
  blockId: string | null;
  effectId: string | null;
  edit: (blockId: string, effectId: string) => void;
}

export const useActionEdit = create<ActionEditState>((set) => ({
  blockId: null,
  effectId: null,
  edit: (blockId, effectId) => set({ blockId, effectId }),
}));
