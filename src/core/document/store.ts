import { create } from "zustand";
import { applyPatches, enablePatches, produceWithPatches } from "immer";
import type { Patch } from "immer";
import { createId } from "../id";
import type { WeftDocument, WeftModule } from "../types";
import { createEmptyDocument } from "./createEmptyDocument";

enablePatches();

/** One undoable step. The undo history belongs to whoever is editing, not to the document: it is
 * not saved into the file, and (once documents are edited by several people at once) must only ever
 * take back one's own changes. */
export interface UndoEntry {
  id: string;
  label: string;
  timestamp: string;
  patches: Patch[];
  inversePatches: Patch[];
}

export type BlockContainerRef = { kind: "page"; pageId: string } | { kind: "layout"; layoutId: string };

export type SelectionRef =
  | { type: "page"; pageId: string }
  | { type: "logic"; logicBlockId: string }
  | { type: "layout"; layoutId: string }
  | { type: "block"; container: BlockContainerRef; blockId: string }
  /** A transient, pre-group multi-selection (Shift+Click or a marquee drag on the canvas - see
   * Canvas.tsx) - never persisted anywhere, it only ever exists in this one field until the user
   * either groups it (document/actions.ts's groupBlocks, which replaces this with a `"group"`
   * selection of the newly-formed group) or selects something else. Shift-clicking a block that's
   * already part of an existing BlockGroup adds that whole group's own blockIds here, not just
   * the one clicked block - see Canvas.tsx's own shift-click handler - so this can hold a mix of
   * loose block ids and whole existing groups' members, and `groupBlocks` dissolves any of those
   * existing groups when forming the new one from the full set. Always page-only in practice
   * (grouping itself is page-only, see BlockGroup's own doc comment in core/types.ts), but typed
   * with the full BlockContainerRef for consistency with the plain `"block"` variant above.
   * Collapses to a plain `{type:"block"}` selection the moment it's down to one id, and clears
   * entirely at zero - a multi-selection of fewer than two blocks isn't meaningfully different
   * from (and should behave exactly like) an ordinary single-block/no selection. */
  | { type: "blocks"; container: BlockContainerRef; blockIds: string[] }
  /** A BlockGroup (core/types.ts), selected as a whole - the result of actually grouping a
   * `"blocks"` multi-selection, or of clicking any one of a group's members on the canvas (which
   * selects the whole group, not just that member - see Canvas.tsx's isGroupMember handling) or
   * its header row in the sidebar (PagePanel.tsx). Double-clicking a member "enters" the group
   * instead (Canvas.tsx's own enteredGroupId, not stored here at all - it's transient canvas-only
   * UI state, not a kind of selection in its own right) so that member can be selected directly
   * as a plain `{type:"block"}` for individual editing/resizing, same as the sidebar's own
   * indented member rows already allow. */
  | { type: "group"; pageId: string; groupId: string }
  /** A node in a page's own timeline/event graph (see Timeline.tsx and PageTimeline in
   * core/types.ts) - "start", "end" (a specific lane's "Nächste Folie" - see
   * syncQuizTimelineEvents's own end-node ids, unique per quiz outcome even though several can
   * share the same "Nächste Folie" label/look), or a block-contributed "event" node. Routes the
   * Inspector to EventPanel.tsx, deliberately never to a content/position editor - see its own
   * doc comment for why clicking an event is its own kind of selection, not a shortcut for
   * selecting whatever block happens to be behind it. */
  | { type: "event"; pageId: string; nodeId: string };

/** The layout currently being edited on the canvas (a layout selected directly, or one of its own
 * blocks) - null whenever the canvas shows a page instead. Drives both the sidebar's switch from
 * the slide overview to the layout overview (Sidebar.tsx) and the canvas toolbar's "Bearbeiten
 * beenden" button (Canvas.tsx). */
export function editedLayoutId(selection: SelectionRef | null): string | null {
  if (selection?.type === "layout") return selection.layoutId;
  if ((selection?.type === "block" || selection?.type === "blocks") && selection.container.kind === "layout") {
    return selection.container.layoutId;
  }
  return null;
}

interface DocumentState {
  doc: WeftDocument;
  selection: SelectionRef | null;
  filePath: string | null;
  /** The `content` that was last written to disk (a manual or automatic save) or loaded from it.
   * Every edit/undo/redo produces a new content object, so `doc.content !== savedContent` is
   * exactly "there are unsaved changes" - what automatic saving (core/io/autosave.ts) keys on. */
  savedContent: WeftModule;
  markSaved: (content: WeftModule) => void;
  /** The language the editor currently shows and edits texts in (a locale from
   * WeftModule.languages) - UI state only, shared by every language switch in the sidebar, the
   * canvas, the thumbnails and the preview's starting language. null = whatever the module's default
   * language is; a language that isn't (any more) in the module's list counts as that, too (see
   * effectiveLanguage). */
  editingLanguage: string | null;
  setEditingLanguage: (language: string | null) => void;

  /** This editor's own undo history (see UndoEntry), reset whenever a document is loaded. */
  undoHistory: UndoEntry[];
  /** Index of the last applied entry; -1 means the document is at its initial state. */
  undoIndex: number;

  /** Applies `recipe` to the content, records one undo entry (unless it was a no-op). */
  edit: (label: string, recipe: (draft: WeftModule) => void) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  loadDocument: (doc: WeftDocument, filePath?: string | null) => void;
  select: (ref: SelectionRef | null) => void;
}

const initialDocument = createEmptyDocument();

export const useDocumentStore = create<DocumentState>((set, get) => ({
  doc: initialDocument,
  selection: null,
  filePath: null,
  savedContent: initialDocument.content,
  markSaved: (content) => set({ savedContent: content }),
  editingLanguage: null,
  setEditingLanguage: (language) => set({ editingLanguage: language }),

  undoHistory: [],
  undoIndex: -1,

  edit: (label, recipe) =>
    set((state) => {
      const [nextContent, patches, inversePatches] = produceWithPatches(state.doc.content, (draft) => {
        recipe(draft);
        draft.modifiedAt = new Date().toISOString();
      });
      if (patches.length === 0) return state;

      const truncated = state.undoHistory.slice(0, state.undoIndex + 1);
      const undoHistory = [
        ...truncated,
        { id: createId(), label, timestamp: new Date().toISOString(), patches, inversePatches },
      ];

      return { doc: { ...state.doc, content: nextContent }, undoHistory, undoIndex: undoHistory.length - 1 };
    }),

  undo: () =>
    set((state) => {
      if (state.undoIndex < 0) return state;
      const entry = state.undoHistory[state.undoIndex];
      const content = applyPatches(state.doc.content, entry.inversePatches);
      return { doc: { ...state.doc, content }, undoIndex: state.undoIndex - 1 };
    }),

  redo: () =>
    set((state) => {
      const nextIndex = state.undoIndex + 1;
      if (nextIndex >= state.undoHistory.length) return state;
      const entry = state.undoHistory[nextIndex];
      const content = applyPatches(state.doc.content, entry.patches);
      return { doc: { ...state.doc, content }, undoIndex: nextIndex };
    }),

  canUndo: () => get().undoIndex >= 0,
  canRedo: () => get().undoIndex < get().undoHistory.length - 1,

  loadDocument: (doc, filePath = null) =>
    set({ doc, selection: null, filePath, savedContent: doc.content, undoHistory: [], undoIndex: -1 }),
  select: (ref) => set({ selection: ref }),
}));
