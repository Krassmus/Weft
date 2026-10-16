import { useEffect } from "react";
import { create } from "zustand";

/**
 * The elements the mouse is over in the sidebar's list of a slide's elements (see PagePanel.tsx, LayoutPanel.tsx): on the slide they get the
 * dashed outline a hover over them would give (see `eventHover` in blocks/BlockView.tsx), so that it is clear which one a row is.
 */
interface ListHoverState {
  ids: string[];
  set: (ids: string[]) => void;
}

export const useListHover = create<ListHoverState>((set) => ({
  ids: [],
  set: (ids) => set((state) => (state.ids.length === 0 && ids.length === 0 ? state : { ids })),
}));

/** The mouse handlers of a row that stands for the elements `ids`. */
export function listHoverProps(ids: string[]) {
  return {
    onMouseEnter: () => useListHover.getState().set(ids),
    onMouseLeave: () => useListHover.getState().set([]),
  };
}

/** For a list: nothing stays marked when it goes away (a row removed under the mouse never gets its mouse-leave). */
export function useClearListHoverOnUnmount() {
  useEffect(() => () => useListHover.getState().set([]), []);
}
