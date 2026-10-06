import { create } from "zustand";
import type { DocHandle } from "@automerge/automerge-repo";
import { Automerge, Repo } from "../collab/automerge";
import { applyPatches } from "../collab/applyPatches";
import { runMutation } from "../collab/mutationScope";
import { sharesOrigin } from "../collab/origin";
import { createId } from "../id";
import type { WeftDocument, WeftModule } from "../types";
import { createEmptyDocument } from "./createEmptyDocument";
import { plain } from "./plain";

/**
 * The document lives in an Automerge document, owned by a Repo: every edit is an Automerge change,
 * so the same document can be edited by several people at once and merged without conflicts (see
 * core/collab/). `state.doc.content` is always the current Automerge state - readable like the plain
 * JSON object it is, replaced (not mutated) by every change, local or remote.
 */
const sharedDocumentIds = new Set<string>();

/** Lets the document with this id be given to the peers the repo is connected to. By default a
 * repo offers EVERY document it has to every peer - which would hand a document that was never
 * shared (another file that happens to be open) to whoever is in the room of the one that was. */
export function allowSharing(documentId: string): void {
  sharedDocumentIds.add(documentId);
}

export const repo = new Repo({
  network: [],
  shareConfig: {
    announce: async (_peer, documentId) => !!documentId && sharedDocumentIds.has(documentId),
    access: async (_peer, documentId) => sharedDocumentIds.has(documentId),
  },
});
let handle: DocHandle<WeftModule>;
let unbindHandle: (() => void) | null = null;

/** The handle of the document being edited - for the collaboration layer. */
export function currentHandle(): DocHandle<WeftModule> {
  return handle;
}

/** One undoable step. The undo history belongs to whoever is editing, not to the document: it is
 * not saved into the file, and (once documents are edited by several people at once) must only ever
 * take back one's own changes. */
export interface UndoEntry {
  id: string;
  label: string;
  timestamp: string;
  /** The document's heads just before and just after this step's change. What the step did is the
   * difference between them (Automerge.diff), so it can be taken back - or redone - later, on top
   * of whatever has happened since, other people's changes included. */
  beforeHeads: Automerge.Heads;
  afterHeads: Automerge.Heads;
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
handle = repo.create<WeftModule>(plain(initialDocument.content));
const initialContent = handle.doc() as WeftModule;

export const useDocumentStore = create<DocumentState>((set, get) => ({
  doc: { formatVersion: initialDocument.formatVersion, content: initialContent },
  selection: null,
  filePath: null,
  savedContent: initialContent,
  markSaved: (content) => set({ savedContent: content }),
  editingLanguage: null,
  setEditingLanguage: (language) => set({ editingLanguage: language }),

  undoHistory: [],
  undoIndex: -1,

  edit: (label, recipe) => {
    const beforeHeads = Automerge.getHeads(handle.doc());
    handle.change((draft) => {
      // Only the recipe runs as a "mutation" (see runMutation); the change event that follows
      // updates the store outside it.
      runMutation(() => recipe(draft as WeftModule));
      draft.modifiedAt = new Date().toISOString();
    });
    const afterHeads = Automerge.getHeads(handle.doc());
    if (beforeHeads.join() === afterHeads.join()) return;
    set((state) => {
      const truncated = state.undoHistory.slice(0, state.undoIndex + 1);
      const undoHistory = [...truncated, { id: createId(), label, timestamp: new Date().toISOString(), beforeHeads, afterHeads }];
      return { undoHistory, undoIndex: undoHistory.length - 1 };
    });
  },

  undo: () => {
    const { undoIndex, undoHistory } = get();
    if (undoIndex < 0) return;
    const entry = undoHistory[undoIndex];
    const patches = Automerge.diff(handle.doc(), entry.afterHeads, entry.beforeHeads);
    handle.change((draft) => runMutation(() => applyPatches(draft, patches)));
    set({ undoIndex: undoIndex - 1 });
  },

  redo: () => {
    const { undoIndex, undoHistory } = get();
    const nextIndex = undoIndex + 1;
    if (nextIndex >= undoHistory.length) return;
    const entry = undoHistory[nextIndex];
    const patches = Automerge.diff(handle.doc(), entry.beforeHeads, entry.afterHeads);
    handle.change((draft) => runMutation(() => applyPatches(draft, patches)));
    set({ undoIndex: nextIndex });
  },

  canUndo: () => get().undoIndex >= 0,
  canRedo: () => get().undoIndex < get().undoHistory.length - 1,

  loadDocument: (doc, filePath = null) => {
    // A document opened from a file becomes an Automerge document of its own. (Joining a shared
    // one is openSharedDocument.)
    // With the editing history from the file, it goes on from there - that is what lets this copy
    // be merged with other copies of the same file later; without one, history starts here.
    const next = doc.history ? repo.import<WeftModule>(doc.history) : repo.create<WeftModule>(plain(doc.content));
    bindHandle(next);
    const content = next.doc() as WeftModule;
    set({
      doc: { formatVersion: doc.formatVersion, content },
      selection: null,
      filePath,
      savedContent: content,
      undoHistory: [],
      undoIndex: -1,
    });
  },
  select: (ref) => set({ selection: ref }),
}));

/** Makes `next` the document being edited: the store follows every change to it, whoever made it. */
function bindHandle(next: DocHandle<WeftModule>): void {
  unbindHandle?.();
  handle = next;
  const onChange = ({ doc }: { doc: Automerge.Doc<WeftModule> }) =>
    useDocumentStore.setState((state) => ({ doc: { ...state.doc, content: doc as WeftModule } }));
  next.on("change", onChange);
  unbindHandle = () => next.off("change", onChange);
}
bindHandle(handle);

/** Switches the editor to a document that already exists elsewhere (a shared one), found by its URL.
 * Resolves once its content has arrived; rejects with a plain message if nobody answers within
 * `timeoutMs`. If the document being edited is another copy of the same module (same module, same
 * beginning), what was changed in it and isn't in the shared one yet is merged in rather than lost. */
export async function openSharedDocument(url: string, timeoutMs = 45000): Promise<void> {
  const local = handle;
  let next: DocHandle<WeftModule>;
  try {
    next = await repo.find<WeftModule>(url as never, { signal: AbortSignal.timeout(timeoutMs) });
    await next.whenReady(undefined, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new Error(
      "Das geteilte Dokument ließ sich nicht laden: Niemand hat geantwortet. Ist die andere Person online, und ist der Link vollständig?",
    );
  }
  const localDoc = local.doc();
  const sharedDoc = next.doc();
  if (next !== local && sharedDoc.id === localDoc.id && sharesOrigin(localDoc, sharedDoc)) next.merge(local);
  bindHandle(next);
  const content = next.doc() as WeftModule;
  useDocumentStore.setState((state) => ({
    doc: { formatVersion: state.doc.formatVersion, content },
    selection: null,
    filePath: null,
    savedContent: content,
    undoHistory: [],
    undoIndex: -1,
  }));
}
