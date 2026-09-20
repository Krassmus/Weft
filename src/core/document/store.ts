import { create } from "zustand";
import { applyPatches, enablePatches, produceWithPatches } from "immer";
import { createId } from "../id";
import type { WeftDocument, WeftModule } from "../types";
import { createEmptyDocument } from "./createEmptyDocument";

enablePatches();

export type BlockContainerRef = { kind: "page"; pageId: string } | { kind: "layout"; layoutId: string };

export type SelectionRef =
  | { type: "page"; pageId: string }
  | { type: "logic"; logicBlockId: string }
  | { type: "layout"; layoutId: string }
  | { type: "block"; container: BlockContainerRef; blockId: string };

interface DocumentState {
  doc: WeftDocument;
  selection: SelectionRef | null;
  filePath: string | null;

  /** Applies `recipe` to the content, records one undo entry (unless it was a no-op). */
  edit: (label: string, recipe: (draft: WeftModule) => void) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  loadDocument: (doc: WeftDocument, filePath?: string | null) => void;
  select: (ref: SelectionRef | null) => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  doc: createEmptyDocument(),
  selection: null,
  filePath: null,

  edit: (label, recipe) =>
    set((state) => {
      const [nextContent, patches, inversePatches] = produceWithPatches(state.doc.content, (draft) => {
        recipe(draft);
        draft.modifiedAt = new Date().toISOString();
      });
      if (patches.length === 0) return state;

      const truncated = state.doc.undoHistory.slice(0, state.doc.undoIndex + 1);
      const undoHistory = [
        ...truncated,
        { id: createId(), label, timestamp: new Date().toISOString(), patches, inversePatches },
      ];

      return {
        doc: { ...state.doc, content: nextContent, undoHistory, undoIndex: undoHistory.length - 1 },
      };
    }),

  undo: () =>
    set((state) => {
      if (state.doc.undoIndex < 0) return state;
      const entry = state.doc.undoHistory[state.doc.undoIndex];
      const content = applyPatches(state.doc.content, entry.inversePatches);
      return { doc: { ...state.doc, content, undoIndex: state.doc.undoIndex - 1 } };
    }),

  redo: () =>
    set((state) => {
      const nextIndex = state.doc.undoIndex + 1;
      if (nextIndex >= state.doc.undoHistory.length) return state;
      const entry = state.doc.undoHistory[nextIndex];
      const content = applyPatches(state.doc.content, entry.patches);
      return { doc: { ...state.doc, content, undoIndex: nextIndex } };
    }),

  canUndo: () => get().doc.undoIndex >= 0,
  canRedo: () => get().doc.undoIndex < get().doc.undoHistory.length - 1,

  loadDocument: (doc, filePath = null) => set({ doc, selection: null, filePath }),
  select: (ref) => set({ selection: ref }),
}));
