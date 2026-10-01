import { createId } from "../id";
import { ASPECT_RATIO_NUMERIC } from "../aspectRatio";
import { useAssetStore } from "../assets/assetStore";
import { isFfmpegAvailable, transcodeToH264 } from "../io/videoTranscode";
import type {
  AspectRatio,
  Block,
  BlockEffect,
  BlockGroup,
  BlockPosition,
  Branch,
  CustomFont,
  Layout,
  Page,
  StaticBlock,
  TransitionType,
  UUID,
  VariableCondition,
  VariableDef,
  VariableType,
  WeftModule,
} from "../types";
import { defaultEntranceEffect, defaultExitEffect } from "./blockEffects";
import { blockEffectNodeId, createDefaultPageTimeline, syncPageTimelineEvents, withTriggerEdge } from "./pageTimeline";
import { defaultShapeCornerRadii, defaultShapeFill, defaultShapeShadow, defaultShapeStroke } from "./shapeDefaults";
import type { BlockContainerRef } from "./store";
import { useDocumentStore } from "./store";

function edit(label: string, recipe: (draft: WeftModule) => void) {
  useDocumentStore.getState().edit(label, recipe);
}

function emptyPage(layoutId: string | null): Page {
  return {
    id: createId(),
    layoutId,
    blocks: [],
    groups: [],
    transition: { type: "none", durationMs: 500 },
    timeline: createDefaultPageTimeline(),
  };
}

// ---- Module settings -------------------------------------------------

export function setModuleTitle(title: string) {
  edit("Titel ändern", (m) => {
    m.title = title;
  });
}

export function setAspectRatio(aspectRatio: AspectRatio) {
  edit("Seitenverhältnis ändern", (m) => {
    m.aspectRatio = aspectRatio;
  });
}

export function setLmsEnabled(enabled: boolean) {
  edit("LMS-Anbindung umschalten", (m) => {
    m.lms.enabled = enabled;
  });
}

export function setLmsAllowedOrigins(origins: string[]) {
  edit("Erlaubte LMS-Origins ändern", (m) => {
    m.lms.allowedOrigins = origins;
  });
}

export function setKeyboardNavigationEnabled(enabled: boolean) {
  edit("Tastatur-Navigation umschalten", (m) => {
    m.keyboardNavigationEnabled = enabled;
  });
}

// ---- Variables ---------------------------------------------------------

export function addVariable(name: string, type: VariableType) {
  const initialValue = type === "number" ? 0 : type === "boolean" ? false : "";
  const variable: VariableDef = { id: createId(), name, type, initialValue };
  edit("Variable hinzufügen", (m) => {
    m.variables.push(variable);
  });
  return variable.id;
}

export function updateVariable(id: string, patch: Partial<Omit<VariableDef, "id">>) {
  edit("Variable bearbeiten", (m) => {
    const variable = m.variables.find((v) => v.id === id);
    if (variable) Object.assign(variable, patch);
  });
}

export function removeVariable(id: string) {
  edit("Variable entfernen", (m) => {
    m.variables = m.variables.filter((v) => v.id !== id);
  });
}

// ---- Sequence: pages & logic blocks -------------------------------------

export function addPageToSequence(afterIndex: number, layoutId: string | null) {
  const page = emptyPage(layoutId);
  edit("Folie hinzufügen", (m) => {
    m.pages[page.id] = page;
    m.sequence.splice(afterIndex + 1, 0, { kind: "page", pageId: page.id });
  });
  return page.id;
}

export function addLogicBlockToSequence(afterIndex: number, layoutId: string | null) {
  const branchPage = emptyPage(layoutId);
  const branch: Branch = { id: createId(), label: "Zweig 1", condition: null, pageIds: [branchPage.id] };
  const logicBlockId = createId();
  edit("Logikblock hinzufügen", (m) => {
    m.pages[branchPage.id] = branchPage;
    m.logicBlocks[logicBlockId] = { id: logicBlockId, name: "Verzweigung", branches: [branch] };
    m.sequence.splice(afterIndex + 1, 0, { kind: "logic", logicBlockId });
  });
  return logicBlockId;
}

export function moveSequenceNode(from: number, to: number) {
  if (from === to) return;
  edit("Reihenfolge ändern", (m) => {
    const [node] = m.sequence.splice(from, 1);
    m.sequence.splice(to, 0, node);
  });
}

export function removeSequenceNodeAt(index: number) {
  edit("Element entfernen", (m) => {
    m.sequence.splice(index, 1);
  });
}

export function removeLogicBlock(logicBlockId: string) {
  edit("Verzweigung löschen", (m) => {
    const index = m.sequence.findIndex((n) => n.kind === "logic" && n.logicBlockId === logicBlockId);
    if (index !== -1) m.sequence.splice(index, 1);
  });
}

/** Removes a page wherever it lives - the main sequence or a branch - without the caller having
 * to know which (unlike removeSequenceNodeAt/removePageFromBranch, used by the Sidebar's own
 * context menus, which already have that location at hand from the row they're rendering). Used
 * by the Delete/Backspace shortcut, where the selection only carries a page id. */
export function removePage(pageId: string) {
  edit("Folie löschen", (m) => {
    const location = locatePage(m, pageId);
    if (!location) return;
    if (location.kind === "top") {
      m.sequence.splice(location.index, 1);
    } else {
      const branch = m.logicBlocks[location.logicBlockId]?.branches.find((b) => b.id === location.branchId);
      branch?.pageIds.splice(location.index, 1);
    }
  });
}

export function setPageLayout(pageId: string, layoutId: string | null) {
  edit("Layout zuweisen", (m) => {
    const page = m.pages[pageId];
    if (page) page.layoutId = layoutId;
  });
}

export function setPageTransition(pageId: string, type: TransitionType) {
  edit("Übergang ändern", (m) => {
    const page = m.pages[pageId];
    if (page) page.transition.type = type;
  });
}

export function setPageTransitionDuration(pageId: string, durationMs: number) {
  edit("Übergangsdauer ändern", (m) => {
    const page = m.pages[pageId];
    if (page) page.transition.durationMs = durationMs;
  });
}

export function addLayout(name: string) {
  const layout: Layout = { id: createId(), name, blocks: [] };
  edit("Layout hinzufügen", (m) => {
    m.layouts[layout.id] = layout;
  });
  return layout.id;
}

export function renameLayout(layoutId: string, name: string) {
  edit("Layout umbenennen", (m) => {
    const layout = m.layouts[layoutId];
    if (layout) layout.name = name;
  });
}

export function renameLogicBlock(logicBlockId: string, name: string) {
  edit("Logikblock umbenennen", (m) => {
    const logicBlock = m.logicBlocks[logicBlockId];
    if (logicBlock) logicBlock.name = name;
  });
}

// ---- Branches ------------------------------------------------------------

/**
 * Branches are evaluated in array order like if/else-if/else: every branch but the last must
 * carry a condition, and the last branch is always the unconditional fallback. A new branch is
 * therefore inserted just before the trailing branch (which stays last and stays condition-less)
 * rather than appended after it - appending would silently turn the old "sonst" into a
 * conditional branch and leave nothing as the fallback.
 */
export function addBranch(logicBlockId: string, layoutId: string | null) {
  const page = emptyPage(layoutId);
  const branchId = createId();
  edit("Zweig hinzufügen", (m) => {
    m.pages[page.id] = page;
    const logicBlock = m.logicBlocks[logicBlockId];
    if (!logicBlock) return;
    const branch: Branch = {
      id: branchId,
      label: "Neuer Zweig",
      condition: { variableId: m.variables[0]?.id ?? "", comparator: "eq", value: 0 },
      pageIds: [page.id],
    };
    logicBlock.branches.splice(Math.max(logicBlock.branches.length - 1, 0), 0, branch);
  });
  return branchId;
}

export function removeBranch(logicBlockId: string, branchId: string) {
  edit("Zweig entfernen", (m) => {
    const logicBlock = m.logicBlocks[logicBlockId];
    if (!logicBlock) return;
    logicBlock.branches = logicBlock.branches.filter((b) => b.id !== branchId);
    // If the removed branch was the trailing "sonst", promote the new last branch into that role.
    const newLast = logicBlock.branches[logicBlock.branches.length - 1];
    if (newLast) newLast.condition = null;
  });
}

export function renameBranch(logicBlockId: string, branchId: string, label: string) {
  edit("Zweig umbenennen", (m) => {
    const branch = m.logicBlocks[logicBlockId]?.branches.find((b) => b.id === branchId);
    if (branch) branch.label = label;
  });
}

/** Edits the fields of a non-last branch's condition; never used on the trailing "sonst" branch. */
export function updateBranchCondition(logicBlockId: string, branchId: string, patch: Partial<VariableCondition>) {
  edit("Bedingung ändern", (m) => {
    const branch = m.logicBlocks[logicBlockId]?.branches.find((b) => b.id === branchId);
    if (!branch) return;
    branch.condition = { ...(branch.condition ?? { variableId: "", comparator: "eq", value: 0 }), ...patch };
  });
}

export function addPageToBranch(logicBlockId: string, branchId: string, layoutId: string | null) {
  const page = emptyPage(layoutId);
  edit("Folie zu Zweig hinzufügen", (m) => {
    m.pages[page.id] = page;
    m.logicBlocks[logicBlockId]?.branches.find((b) => b.id === branchId)?.pageIds.push(page.id);
  });
  return page.id;
}

export function removePageFromBranch(logicBlockId: string, branchId: string, pageId: string) {
  edit("Folie aus Zweig entfernen", (m) => {
    const branch = m.logicBlocks[logicBlockId]?.branches.find((b) => b.id === branchId);
    if (branch) branch.pageIds = branch.pageIds.filter((id) => id !== pageId);
  });
}

/** Where a page reference can live: the top-level sequence, or a specific branch's page list. */
export type PageContainerRef = { kind: "top" } | { kind: "branch"; logicBlockId: string; branchId: string };

/**
 * Moves a page reference from wherever it currently lives (top-level sequence or any branch,
 * found via locatePage - same lookup removePage uses) to a position in `target`, which may be a
 * different container than the one it started in (e.g. dragging a branch page out to the main
 * sequence, or into another branch) or the same one (a plain reorder). The Page object itself
 * never moves - pages always live in the flat m.pages dictionary regardless of which list of ids
 * points at them - so this only ever touches the reference arrays (m.sequence / a branch's
 * pageIds), same as removePage/addPageToBranch do individually. Used by the Sidebar's drag-reorder
 * (see useDragReorder.ts), which no longer restricts a drag to the container it started in.
 *
 * `toIndex` is where to splice the page back in *after* it's already been removed from its
 * origin - the same convention moveSequenceNode's own `to` uses - not its raw pre-removal
 * position. useDragReorder's finish() already does that arithmetic once (it has to, to also
 * serve moveSequenceNode); redoing it here for the same-container case double-adjusted and
 * silently turned some same-container drags (moving an earlier row later) into a no-op.
 */
export function movePageTo(pageId: string, target: PageContainerRef, toIndex: number) {
  edit("Folie verschieben", (m) => {
    const from = locatePage(m, pageId);
    if (!from) return;

    if (from.kind === "top") m.sequence.splice(from.index, 1);
    else m.logicBlocks[from.logicBlockId]?.branches.find((b) => b.id === from.branchId)?.pageIds.splice(from.index, 1);

    if (target.kind === "top") m.sequence.splice(toIndex, 0, { kind: "page", pageId });
    else m.logicBlocks[target.logicBlockId]?.branches.find((b) => b.id === target.branchId)?.pageIds.splice(toIndex, 0, pageId);
  });
}

// ---- Blocks ----------------------------------------------------------------

function defaultBlockFor(kind: Block["kind"]): Block {
  const position = { x: 10, y: 40, width: 80, height: 20 };
  const base = { id: createId(), entranceEffect: defaultEntranceEffect(), exitEffect: defaultExitEffect() };
  switch (kind) {
    case "text":
      return { ...base, kind, position, html: "<p>Neuer Text</p>" };
    case "image":
      return { ...base, kind, position, assetId: null, alt: "" };
    case "video":
      return { ...base, kind, position, assetId: null, autoplay: false, loop: false, muted: false, controls: true, stopPoints: [] };
    case "iframe":
      return { ...base, kind, position, url: "https://www.youtube.com/embed/", sandbox: ["allow-scripts"], qrCode: false };
    case "button":
      return { ...base, kind, position: { x: 35, y: 82, width: 30, height: 10 }, text: "Weiter", action: "next" };
    case "shape":
      return {
        ...base,
        kind,
        position: { x: 30, y: 30, width: 40, height: 40 },
        shapeKind: "rectangle",
        cornerRadii: defaultShapeCornerRadii(),
        sides: 6,
        starPoints: 5,
        starInnerRadius: 45,
        fill: defaultShapeFill(),
        stroke: defaultShapeStroke(),
        shadow: defaultShapeShadow(),
      };
    case "quiz":
      return {
        ...base,
        kind,
        position,
        questionHtml: "<p>Neue Frage</p>",
        options: [
          { id: createId(), html: "Option A" },
          { id: createId(), html: "Option B" },
        ],
        correctOptionIds: [],
        onCorrect: [],
        onIncorrect: [],
        advanceOnCorrect: false,
        advanceOnIncorrect: false,
      };
  }
}

export function addBlockToPage(pageId: string, kind: Block["kind"]) {
  const block = defaultBlockFor(kind);
  edit("Block hinzufügen", (m) => {
    const page = m.pages[pageId];
    if (!page) return;
    page.blocks.push(block);
    syncPageTimelineEvents(page);
  });
  return block.id;
}

export function addBlockToLayout(layoutId: string, kind: StaticBlock["kind"]) {
  const block = defaultBlockFor(kind) as StaticBlock;
  edit("Block zu Layout hinzufügen", (m) => {
    m.layouts[layoutId]?.blocks.push(block);
  });
  return block.id;
}

/** Pastes OS clipboard text (see useCopyPaste.ts) as a new TextBlock carrying `html` right away -
 * unlike addBlockToPage/addBlockToLayout's empty placeholder, which would need a second
 * updateBlock call to fill in and so show up as two separate undo steps for what's really one
 * paste. Unified across page/layout via BlockContainerRef like the layer-order actions above,
 * since there's nothing page-only here beyond syncPageTimelineEvents. */
export function pasteTextBlockInto(container: BlockContainerRef, html: string): string {
  const block = defaultBlockFor("text") as Block & { kind: "text" };
  block.html = html;
  edit("Text einfügen", (m) => {
    if (container.kind === "page") {
      const page = m.pages[container.pageId];
      if (!page) return;
      page.blocks.push(block);
      syncPageTimelineEvents(page);
    } else {
      m.layouts[container.layoutId]?.blocks.push(block);
    }
  });
  return block.id;
}

export function updateBlock(pageId: string, blockId: string, patch: Partial<Block>) {
  edit("Block bearbeiten", (m) => {
    const page = m.pages[pageId];
    const block = page?.blocks.find((b) => b.id === blockId);
    if (!block) return;
    Object.assign(block, patch);
    // Only a quiz's/video's own timeline-relevant fields, or any block's entrance/exit effect
    // type (see makeBlockEffectNode's own visibility rule in pageTimeline.ts), can change what
    // the timeline should show, so skip the (cheap but pointless) resync for every other block
    // edit, e.g. a position drag. Who triggers an effect, and after what delay, lives in
    // page.timeline.triggerEdges now, not on the block itself - see setEventTrigger below.
    const touchesEffect = "entranceEffect" in patch || "exitEffect" in patch;
    if (page && (block.kind === "quiz" || block.kind === "video" || touchesEffect)) syncPageTimelineEvents(page);
  });
}

/**
 * The one write path for every trigger edge on a page - a block's own Aufbau/Abbau (see
 * BlockEffectEditor in panels/BlockPanel.tsx), a video's own start (see EventPanel.tsx), or a
 * free-standing "event X also fires event Y" link created directly in EventPanel.tsx - see
 * PageTimeline.triggerEdges' own doc comment for why these all share this one mechanism.
 * `targetNodeId` must name a node in TRIGGERABLE_EVENT_TYPES (document/pageTimeline.ts); `from`
 * null removes whatever edge currently targets it (see withTriggerEdge).
 */
export function setEventTrigger(pageId: string, targetNodeId: string, from: string | null, delayMs: number) {
  edit("Auslöser bearbeiten", (m) => {
    const page = m.pages[pageId];
    if (!page) return;
    page.timeline.triggerEdges = withTriggerEdge(page.timeline.triggerEdges, targetNodeId, from, delayMs);
    syncPageTimelineEvents(page);
  });
}

export function removeBlock(pageId: string, blockId: string) {
  edit("Block entfernen", (m) => {
    const page = m.pages[pageId];
    if (!page) return;
    page.blocks = page.blocks.filter((b) => b.id !== blockId);
    // A removed block can't stay a member of a group it no longer exists in; a group left with
    // fewer than 2 members isn't a group anymore (see BlockGroup's own doc comment in types.ts).
    for (const group of page.groups) group.blockIds = group.blockIds.filter((id) => id !== blockId);
    page.groups = page.groups.filter((g) => g.blockIds.length >= 2);
    syncPageTimelineEvents(page);
  });
}

// ---- Groups (page-only - see BlockGroup's own doc comment in core/types.ts) -------------------

/** Removes every existing group that shares any member with `ids` - called before forming a new
 * group from a selection that might already include whole existing groups (see SelectionRef's
 * `"blocks"` variant in store.ts: a block can only ever belong to one group at a time, and
 * grouping never nests - regrouping a selection that touches old groups just replaces them). */
function dissolveGroupsTouching(page: Page, ids: UUID[]): void {
  const idSet = new Set(ids);
  page.groups = page.groups.filter((g) => !g.blockIds.some((id) => idSet.has(id)));
}

/** Removes `ids` from `blocks` and re-splices them back in as one contiguous run, in their
 * original relative order, at the stacking position their previously topmost (last-rendered)
 * member held - so forming a group doesn't silently reorder the page's visual stack. Contiguity
 * itself is the invariant groupBlocks has to establish and then maintain (PagePanel.tsx's sidebar
 * bracket rendering relies on every group's members sitting next to each other in page.blocks). */
function spliceGroupToTopmostPosition(blocks: Block[], ids: UUID[]): void {
  const idSet = new Set(ids);
  const topmostOriginalIndex = blocks.reduce((max, b, i) => (idSet.has(b.id) ? i : max), -1);
  if (topmostOriginalIndex === -1) return;
  const members = blocks.filter((b) => idSet.has(b.id));
  const rest = blocks.filter((b) => !idSet.has(b.id));
  const insertAt = blocks.slice(0, topmostOriginalIndex).filter((b) => !idSet.has(b.id)).length;
  const next = [...rest.slice(0, insertAt), ...members, ...rest.slice(insertAt)];
  blocks.splice(0, blocks.length, ...next);
}

/** Moves every one of `ids` to one edge of `blocks` together, as one contiguous run in their
 * relative order - the group equivalent of bringBlockToFront/sendBlockToBack below. */
function moveGroupToEdge(blocks: Block[], ids: UUID[], edge: "front" | "back"): void {
  const idSet = new Set(ids);
  const members = blocks.filter((b) => idSet.has(b.id));
  const rest = blocks.filter((b) => !idSet.has(b.id));
  const next = edge === "front" ? [...rest, ...members] : [...members, ...rest];
  blocks.splice(0, blocks.length, ...next);
}

/**
 * Groups `blockIds` on `pageId` into one new BlockGroup, dissolving any existing group(s) that
 * already touched them (see dissolveGroupsTouching) and making the full set contiguous in
 * page.blocks (see spliceGroupToTopmostPosition). Returns null (and writes nothing) if fewer than
 * two of the given ids still exist on the page - grouping a single block isn't meaningful.
 */
export function groupBlocks(pageId: string, blockIds: string[]): string | null {
  const groupId = createId();
  let created = false;
  edit("Objekte gruppieren", (m) => {
    const page = m.pages[pageId];
    if (!page) return;
    const existingIds = new Set(page.blocks.map((b) => b.id));
    const ids = blockIds.filter((id) => existingIds.has(id));
    if (ids.length < 2) return;
    dissolveGroupsTouching(page, ids);
    spliceGroupToTopmostPosition(page.blocks, ids);
    page.groups.push({ id: groupId, blockIds: ids });
    created = true;
  });
  return created ? groupId : null;
}

/** "Gruppe auflösen" - removes the group record only; its member blocks stay exactly where they
 * are, in place and independently selectable again (unlike removeGroup, which deletes them too). */
export function ungroupBlocks(pageId: string, groupId: string) {
  edit("Gruppe auflösen", (m) => {
    const page = m.pages[pageId];
    if (!page) return;
    page.groups = page.groups.filter((g) => g.id !== groupId);
  });
}

/** Deletes a group and every one of its member blocks together, in one undo step - used by the
 * Delete key and the sidebar's "×" on a group's header row (see useDeleteSelection.ts/
 * PagePanel.tsx). */
export function removeGroup(pageId: string, groupId: string) {
  edit("Gruppe entfernen", (m) => {
    const page = m.pages[pageId];
    if (!page) return;
    const group = page.groups.find((g) => g.id === groupId);
    if (!group) return;
    const idSet = new Set(group.blockIds);
    page.blocks = page.blocks.filter((b) => !idSet.has(b.id));
    page.groups = page.groups.filter((g) => g.id !== groupId);
    syncPageTimelineEvents(page);
  });
}

/** Batched version of removeBlock - deletes every block in `blockIds` from `container` together,
 * in one undo step, used for a `"blocks"` multi-selection (see SelectionRef in store.ts). Also
 * runs the same group-membership cleanup removeBlock does for a page target, since a
 * multi-selection can include blocks that happen to belong to a group without the whole group
 * being selected. */
export function removeBlocks(container: BlockContainerRef, blockIds: string[]) {
  edit("Elemente entfernen", (m) => {
    const idSet = new Set(blockIds);
    if (container.kind === "page") {
      const page = m.pages[container.pageId];
      if (!page) return;
      page.blocks = page.blocks.filter((b) => !idSet.has(b.id));
      for (const group of page.groups) group.blockIds = group.blockIds.filter((id) => !idSet.has(id));
      page.groups = page.groups.filter((g) => g.blockIds.length >= 2);
      syncPageTimelineEvents(page);
    } else {
      const layout = m.layouts[container.layoutId];
      if (!layout) return;
      layout.blocks = layout.blocks.filter((b) => !idSet.has(b.id));
    }
  });
}

/** One batched position setter for every member of a moving or resizing group (see Canvas.tsx) -
 * both compute the final position of every member up front and commit them all here in a single
 * undo step, rather than one updateBlock call per member. */
export function updateBlockPositions(container: BlockContainerRef, positions: { id: string; position: BlockPosition }[]) {
  edit("Position ändern", (m) => {
    const byId = new Map(positions.map((p) => [p.id, p.position]));
    const blocks = container.kind === "page" ? m.pages[container.pageId]?.blocks : m.layouts[container.layoutId]?.blocks;
    if (!blocks) return;
    for (const block of blocks) {
      const next = byId.get(block.id);
      if (next) block.position = next;
    }
  });
}

/** Fans a single new Aufbau/Abbau animation out to every block in `blockIds` - a group's "shared"
 * effect is UI sugar over each member's own, otherwise-untouched entranceEffect/exitEffect field
 * (see BlockGroup's own doc comment in types.ts: a group carries no effect of its own), just
 * written to every member in one undo step instead of one updateBlock call each. */
export function setGroupEffect(pageId: string, blockIds: string[], phase: "entrance" | "exit", effect: BlockEffect) {
  edit("Animation ändern", (m) => {
    const page = m.pages[pageId];
    if (!page) return;
    const idSet = new Set(blockIds);
    let touched = false;
    for (const block of page.blocks) {
      if (!idSet.has(block.id)) continue;
      if (phase === "entrance") block.entranceEffect = effect;
      else block.exitEffect = effect;
      touched = true;
    }
    if (touched) syncPageTimelineEvents(page);
  });
}

/** Fans a single trigger out to every member of a group's own entrance/exit node - same
 * PageTimeline.triggerEdges mechanism as the single-block setEventTrigger above, just applied to
 * every blockId in one undo step. */
export function setGroupEventTrigger(
  pageId: string,
  blockIds: string[],
  phase: "entrance" | "exit",
  from: string | null,
  delayMs: number,
) {
  edit("Auslöser bearbeiten", (m) => {
    const page = m.pages[pageId];
    if (!page) return;
    for (const blockId of blockIds) {
      page.timeline.triggerEdges = withTriggerEdge(page.timeline.triggerEdges, blockEffectNodeId(blockId, phase), from, delayMs);
    }
    syncPageTimelineEvents(page);
  });
}

/** "Ganz nach vorne" for a whole group (see bringBlockToFront below) - moves every member to the
 * end of the page's blocks array together, preserving their relative order, so the group stays on
 * top as one contiguous run. */
export function bringGroupToFront(pageId: string, groupId: string) {
  edit("Ganz nach vorne", (m) => {
    const page = m.pages[pageId];
    const group = page?.groups.find((g) => g.id === groupId);
    if (!page || !group) return;
    moveGroupToEdge(page.blocks, group.blockIds, "front");
  });
}

/** "Ganz nach hinten" - the mirror of bringGroupToFront above. */
export function sendGroupToBack(pageId: string, groupId: string) {
  edit("Ganz nach hinten", (m) => {
    const page = m.pages[pageId];
    const group = page?.groups.find((g) => g.id === groupId);
    if (!page || !group) return;
    moveGroupToEdge(page.blocks, group.blockIds, "back");
  });
}

// ---- Layer order - a page's/layout's blocks array IS its stacking order, later renders on top
// of earlier (see BlockView.tsx: no block ever carries an explicit z-index), so "move" here always
// means "move within that one array" - unified across both container kinds via BlockContainerRef
// rather than page/layout getting their own separate pair of functions (like most other block
// actions in this file do), since there's no page-only concern like syncPageTimelineEvents to keep
// separate for these three specifically. ------------------------------------------------------

function blockArray(m: WeftModule, container: BlockContainerRef): { id: UUID }[] | undefined {
  return container.kind === "page" ? m.pages[container.pageId]?.blocks : m.layouts[container.layoutId]?.blocks;
}

/** Moves one block to `toIndex` within its own container's blocks array - used by the sidebar's
 * drag-reorder (see useDragReorder's own "block" kind in PagePanel.tsx/LayoutPanel.tsx), which
 * already computes the target index the same way page/logic-block reordering does. */
export function reorderBlock(container: BlockContainerRef, blockId: string, toIndex: number) {
  edit("Element verschieben", (m) => {
    const blocks = blockArray(m, container);
    if (!blocks) return;
    const fromIndex = blocks.findIndex((b) => b.id === blockId);
    if (fromIndex === -1) return;
    const [block] = blocks.splice(fromIndex, 1);
    blocks.splice(Math.min(Math.max(toIndex, 0), blocks.length), 0, block);
  });
}

/** "Ganz nach vorne" in a block's right-click menu (see BlockView.tsx) - moves it to the very end
 * of its container's blocks array, i.e. on top of every other block on this page/layout. */
export function bringBlockToFront(container: BlockContainerRef, blockId: string) {
  edit("Ganz nach vorne", (m) => {
    const blocks = blockArray(m, container);
    if (!blocks) return;
    const index = blocks.findIndex((b) => b.id === blockId);
    if (index === -1) return;
    const [block] = blocks.splice(index, 1);
    blocks.push(block);
  });
}

/** "Ganz nach hinten" - the mirror of bringBlockToFront above. */
export function sendBlockToBack(container: BlockContainerRef, blockId: string) {
  edit("Ganz nach hinten", (m) => {
    const blocks = blockArray(m, container);
    if (!blocks) return;
    const index = blocks.findIndex((b) => b.id === blockId);
    if (index === -1) return;
    const [block] = blocks.splice(index, 1);
    blocks.unshift(block);
  });
}

// ---- Media sizing: fitting a picked/dropped image or video to its own aspect ratio -----------

async function imageAspectRatio(file: File): Promise<number> {
  const bitmap = await createImageBitmap(file);
  try {
    return bitmap.width / bitmap.height;
  } finally {
    bitmap.close();
  }
}

interface VideoProbe {
  aspect: number;
  /** Whether this browser could actually decode the file at all - false most commonly means an
   * iPhone/Mac export in HEVC/H.265, which only Safari can play back. Surfaced to the caller so
   * the UI can warn the author (see fileIO.ts's warnUnplayableVideo) - the exported module needs
   * to run wherever it's opened, not just in whichever browser uploaded it. */
  playable: boolean;
}

/** Reads a video file's own pixel aspect ratio and whether this browser can actually play it
 * back, via one throwaway <video> element (there's no createImageBitmap equivalent for video,
 * and a second element/object URL would just repeat the same probe). Aspect falls back to 16:9
 * if dimensions never became available - fitToAspect still needs *some* ratio, and a wrong guess
 * is only ever a one-time sizing nuisance the author can resize away, not a blocker to adding
 * the block at all; unlike `playable`, it doesn't gate the warning.
 *
 * Loading enough to decode and show one frame (loadeddata/canplay) turned out not to be proof
 * playback actually works: some engines can display a single keyframe for a codec they can't
 * sustain real decoding for at all, which is exactly what let a genuinely unplayable upload
 * through with no warning before - the editor's own paused preview looked completely normal,
 * and only autoplay in the live "Vorschau" (a real play() call) ever revealed the broken-play
 * icon. So this actually calls play() once loading gets that far, and only trusts the video's
 * own currentTime genuinely advancing afterwards - attached off-screen in the document while it
 * runs, since a detached element risks the same inconsistent decode behavior this is trying to
 * catch in the first place. */
function probeVideo(file: File): Promise<VideoProbe> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const videoEl = document.createElement("video");
    videoEl.muted = true;
    videoEl.playsInline = true;
    // Loops so a very short clip can't reach its natural end mid-probe (see the catch handler
    // below for what that does to play()'s promise) - irrelevant to real playback, this element
    // is thrown away the moment the probe settles either way.
    videoEl.loop = true;
    videoEl.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;";
    document.body.appendChild(videoEl);

    let settled = false;
    let triedPlay = false;
    function aspectOf(): number {
      return videoEl.videoWidth && videoEl.videoHeight ? videoEl.videoWidth / videoEl.videoHeight : 16 / 9;
    }
    function finish(playable: boolean) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      videoEl.pause();
      videoEl.remove();
      URL.revokeObjectURL(url);
      resolve({ aspect: aspectOf(), playable });
    }
    function attemptPlayback() {
      if (triedPlay) return;
      triedPlay = true;
      videoEl
        .play()
        .then(() => {
          videoEl.ontimeupdate = () => finish(true);
          // Some engines resolve play() itself even though decoding then silently never
          // advances - give it a moment to actually move before giving up.
          setTimeout(() => finish(videoEl.currentTime > 0), 1500);
        })
        .catch(() => {
          // A very short clip can reach the end before play()'s own promise resolves, which
          // Chromium reports as an AbortError rejection here rather than a normal resolve +
          // immediate "ended" - `ended` still means it genuinely played through, not that
          // playback failed (loop above mostly prevents this, but a last frame decoded exactly
          // as play() settles is still possible).
          finish(videoEl.ended);
        });
    }
    videoEl.onloadeddata = attemptPlayback;
    videoEl.oncanplay = attemptPlayback;
    videoEl.onerror = () => finish(false);
    // Nothing above is guaranteed to fire at all for a codec this browser can't handle - the
    // container itself can be perfectly valid (so it's never rejected outright), it just never
    // manages to decode anything, so it sits "loading" forever instead of failing loudly.
    // Timing out therefore has to mean "not confirmed playable", not "probably fine" - everything
    // here is a local blob URL (no network fetch), so actually playing a frame should be
    // near-instant regardless of file size whenever it's going to work at all.
    const timer = setTimeout(() => finish(false), 8000);
    videoEl.preload = "auto";
    videoEl.src = url;
    videoEl.load();
  });
}

/** What a video upload came away with - whether it's confirmed playable, and if not, enough to
 * explain why (see fileIO.ts's warnUnplayableVideo): `ffmpegAttempted` distinguishes "no ffmpeg
 * to try" from "ffmpeg ran and still didn't produce a playable file", and `error` carries
 * whatever ffmpeg itself (or finding it) actually said, surfaced instead of just logged - a
 * silent "nothing happened, no idea why" is exactly the failure mode this exists to avoid. */
export interface VideoUploadResult {
  playable: boolean;
  ffmpegAttempted: boolean;
  error?: string;
}

/** The file to actually store for a video upload, plus its aspect ratio and its VideoUploadResult
 * - probes the file as given, and if that fails, tries re-encoding it with a local ffmpeg (see
 * videoTranscode.ts) before giving up and handing back the original alongside
 * `playable: false`. Kept as one shared step for all four setBlockVideo/setLayoutBlockVideo/
 * addVideoBlockToPage/addVideoBlockToLayout entry points, so a converted file only ever gets
 * probed and stored once rather than each of them re-implementing the same fallback chain. */
async function resolvePlayableVideo(file: File): Promise<{ file: File; aspect: number } & VideoUploadResult> {
  const probe = await probeVideo(file);
  if (probe.playable) return { file, ...probe, ffmpegAttempted: false };
  const ffmpegFound = await isFfmpegAvailable();
  if (!ffmpegFound) return { file, ...probe, ffmpegAttempted: false };
  try {
    const converted = await transcodeToH264(file);
    const reprobe = await probeVideo(converted);
    return { file: converted, aspect: reprobe.aspect, playable: reprobe.playable, ffmpegAttempted: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Video-Konvertierung fehlgeschlagen:", message);
    return { file, ...probe, ffmpegAttempted: true, error: message };
  }
}

/** A media file's own pixel aspect ratio, translated through the module's stage aspect ratio
 * into the width%/height% ratio a block needs to render that file edge-to-edge (percent axes
 * aren't equal-scale unless the stage itself is square, so this isn't just the file's raw
 * ratio). */
function percentRatioForAspect(mediaAspect: number): number {
  const stageAspect = ASPECT_RATIO_NUMERIC[useDocumentStore.getState().doc.content.aspectRatio];
  return mediaAspect / stageAspect;
}

function clampPercent(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Reshapes a block's rect to a given width%/height% ratio, keeping the same center and roughly
 * the same footprint (area), clamped to the stage - so a newly picked/dropped image or video
 * renders edge-to-edge in its selection box instead of letterboxed inside an unrelated
 * rectangle. Duplicated in spirit from clampMove in features/editor/blocks/resizeMath.ts rather
 * than imported, so core/ doesn't reach into features/. */
function fitToAspect(position: BlockPosition, percentRatio: number): BlockPosition {
  const area = position.width * position.height;
  let width = Math.sqrt(area * percentRatio);
  let height = width / percentRatio;
  const scale = Math.min(1, 100 / width, 100 / height);
  width *= scale;
  height *= scale;
  const centerX = position.x + position.width / 2;
  const centerY = position.y + position.height / 2;
  return {
    ...position,
    x: clampPercent(centerX - width / 2, 0, 100 - width),
    y: clampPercent(centerY - height / 2, 0, 100 - height),
    width,
    height,
  };
}

export async function setBlockImage(pageId: string, blockId: string, file: File) {
  const assetId = createId();
  useAssetStore.getState().setAsset(assetId, file);
  const percentRatio = percentRatioForAspect(await imageAspectRatio(file));
  edit("Bild setzen", (m) => {
    m.assets.push({ id: assetId, fileName: file.name, mimeType: file.type || "application/octet-stream" });
    const block = m.pages[pageId]?.blocks.find((b) => b.id === blockId);
    if (block && block.kind === "image") {
      block.assetId = assetId;
      block.position = fitToAspect(block.position, percentRatio);
    }
  });
}

export async function setBlockVideo(pageId: string, blockId: string, file: File): Promise<VideoUploadResult> {
  const resolved = await resolvePlayableVideo(file);
  const assetId = createId();
  useAssetStore.getState().setAsset(assetId, resolved.file);
  edit("Video setzen", (m) => {
    m.assets.push({ id: assetId, fileName: resolved.file.name, mimeType: resolved.file.type || "video/mp4" });
    const block = m.pages[pageId]?.blocks.find((b) => b.id === blockId);
    if (block && block.kind === "video") {
      block.assetId = assetId;
      block.position = fitToAspect(block.position, percentRatioForAspect(resolved.aspect));
    }
  });
  return { playable: resolved.playable, ffmpegAttempted: resolved.ffmpegAttempted, error: resolved.error };
}

export function updateLayoutBlock(layoutId: string, blockId: string, patch: Partial<Block>) {
  edit("Block bearbeiten", (m) => {
    const block = m.layouts[layoutId]?.blocks.find((b) => b.id === blockId);
    if (block) Object.assign(block, patch);
  });
}

export function removeLayoutBlock(layoutId: string, blockId: string) {
  edit("Block entfernen", (m) => {
    const layout = m.layouts[layoutId];
    if (layout) layout.blocks = layout.blocks.filter((b) => b.id !== blockId);
  });
}

export async function setLayoutBlockImage(layoutId: string, blockId: string, file: File) {
  const assetId = createId();
  useAssetStore.getState().setAsset(assetId, file);
  const percentRatio = percentRatioForAspect(await imageAspectRatio(file));
  edit("Bild setzen", (m) => {
    m.assets.push({ id: assetId, fileName: file.name, mimeType: file.type || "application/octet-stream" });
    const block = m.layouts[layoutId]?.blocks.find((b) => b.id === blockId);
    if (block && block.kind === "image") {
      block.assetId = assetId;
      block.position = fitToAspect(block.position, percentRatio);
    }
  });
}

export async function setLayoutBlockVideo(layoutId: string, blockId: string, file: File): Promise<VideoUploadResult> {
  const resolved = await resolvePlayableVideo(file);
  const assetId = createId();
  useAssetStore.getState().setAsset(assetId, resolved.file);
  edit("Video setzen", (m) => {
    m.assets.push({ id: assetId, fileName: resolved.file.name, mimeType: resolved.file.type || "video/mp4" });
    const block = m.layouts[layoutId]?.blocks.find((b) => b.id === blockId);
    if (block && block.kind === "video") {
      block.assetId = assetId;
      block.position = fitToAspect(block.position, percentRatioForAspect(resolved.aspect));
    }
  });
  return { playable: resolved.playable, ffmpegAttempted: resolved.ffmpegAttempted, error: resolved.error };
}

/** Drops a new image block onto a page/layout in one step, already carrying the file - used by
 * dragging an image in from the Finder (see Canvas.tsx), where there's no existing block to
 * attach it to yet the way setBlockImage/setLayoutBlockImage's picker flow has. `position` is
 * treated as a starting footprint (its area and center are kept) and reshaped to the image's own
 * aspect ratio - see fitToAspect. */
export async function addImageBlockToPage(pageId: string, file: File, position: BlockPosition) {
  const assetId = createId();
  const blockId = createId();
  useAssetStore.getState().setAsset(assetId, file);
  const percentRatio = percentRatioForAspect(await imageAspectRatio(file));
  edit("Bild hinzufügen", (m) => {
    m.assets.push({ id: assetId, fileName: file.name, mimeType: file.type || "application/octet-stream" });
    m.pages[pageId]?.blocks.push({
      id: blockId,
      kind: "image",
      position: fitToAspect(position, percentRatio),
      assetId,
      alt: "",
      entranceEffect: defaultEntranceEffect(),
      exitEffect: defaultExitEffect(),
    });
  });
  return blockId;
}

export async function addImageBlockToLayout(layoutId: string, file: File, position: BlockPosition) {
  const assetId = createId();
  const blockId = createId();
  useAssetStore.getState().setAsset(assetId, file);
  const percentRatio = percentRatioForAspect(await imageAspectRatio(file));
  edit("Bild hinzufügen", (m) => {
    m.assets.push({ id: assetId, fileName: file.name, mimeType: file.type || "application/octet-stream" });
    m.layouts[layoutId]?.blocks.push({
      id: blockId,
      kind: "image",
      position: fitToAspect(position, percentRatio),
      assetId,
      alt: "",
      entranceEffect: defaultEntranceEffect(),
      exitEffect: defaultExitEffect(),
    });
  });
  return blockId;
}

/** Drops a new video block onto a page/layout in one step - see addImageBlockToPage above, same
 * shape, just for a dropped video file. */
export async function addVideoBlockToPage(
  pageId: string,
  file: File,
  position: BlockPosition,
): Promise<{ blockId: string } & VideoUploadResult> {
  const resolved = await resolvePlayableVideo(file);
  const assetId = createId();
  const blockId = createId();
  useAssetStore.getState().setAsset(assetId, resolved.file);
  edit("Video hinzufügen", (m) => {
    m.assets.push({ id: assetId, fileName: resolved.file.name, mimeType: resolved.file.type || "video/mp4" });
    const page = m.pages[pageId];
    if (!page) return;
    page.blocks.push({
      id: blockId,
      kind: "video",
      position: fitToAspect(position, percentRatioForAspect(resolved.aspect)),
      assetId,
      autoplay: false,
      loop: false,
      muted: false,
      controls: true,
      stopPoints: [],
      entranceEffect: defaultEntranceEffect(),
      exitEffect: defaultExitEffect(),
    });
    syncPageTimelineEvents(page);
  });
  return { blockId, playable: resolved.playable, ffmpegAttempted: resolved.ffmpegAttempted, error: resolved.error };
}

export async function addVideoBlockToLayout(
  layoutId: string,
  file: File,
  position: BlockPosition,
): Promise<{ blockId: string } & VideoUploadResult> {
  const resolved = await resolvePlayableVideo(file);
  const assetId = createId();
  const blockId = createId();
  useAssetStore.getState().setAsset(assetId, resolved.file);
  edit("Video hinzufügen", (m) => {
    m.assets.push({ id: assetId, fileName: resolved.file.name, mimeType: resolved.file.type || "video/mp4" });
    m.layouts[layoutId]?.blocks.push({
      id: blockId,
      kind: "video",
      position: fitToAspect(position, percentRatioForAspect(resolved.aspect)),
      assetId,
      autoplay: false,
      loop: false,
      muted: false,
      controls: true,
      stopPoints: [],
      entranceEffect: defaultEntranceEffect(),
      exitEffect: defaultExitEffect(),
    });
  });
  return { blockId, playable: resolved.playable, ffmpegAttempted: resolved.ffmpegAttempted, error: resolved.error };
}

// ---- Copy / paste (Cmd/Ctrl+C / +V - see features/editor/useCopyPaste.ts) -------------------

type PageLocation =
  | { kind: "top"; index: number }
  | { kind: "branch"; logicBlockId: string; branchId: string; index: number };

function locatePage(m: WeftModule, pageId: string): PageLocation | null {
  const topIndex = m.sequence.findIndex((n) => n.kind === "page" && n.pageId === pageId);
  if (topIndex !== -1) return { kind: "top", index: topIndex };
  for (const logicBlock of Object.values(m.logicBlocks)) {
    for (const branch of logicBlock.branches) {
      const branchIndex = branch.pageIds.indexOf(pageId);
      if (branchIndex !== -1) return { kind: "branch", logicBlockId: logicBlock.id, branchId: branch.id, index: branchIndex };
    }
  }
  return null;
}

function cloneBlockWithNewId(block: Block): Block {
  return { ...structuredClone(block), id: createId() };
}

/** Nudges a pasted block a few percent down-right so it doesn't land exactly on top of the
 * block it was copied from, clamped to stay on the slide - same clamp shape as clampMove in
 * features/editor/blocks/resizeMath.ts, duplicated rather than imported so core/ doesn't reach
 * into features/. */
function offsetPosition(position: BlockPosition): BlockPosition {
  return {
    ...position,
    x: Math.min(Math.max(position.x + 3, 0), 100 - position.width),
    y: Math.min(Math.max(position.y + 3, 0), 100 - position.height),
  };
}

/**
 * Pastes a copied page right after wherever `afterPageId` currently lives (top-level sequence or
 * a branch) - copy/paste always duplicates in place next to a reference page, never at some
 * unrelated spot, so "paste" reads the same as "duplicate this page". Returns null if
 * `afterPageId` no longer exists (e.g. it was deleted between copy and paste).
 */
export function pastePageAfter(afterPageId: string, sourcePage: Page): string | null {
  const newPageId = createId();
  let inserted = false;
  edit("Folie einfügen", (m) => {
    const location = locatePage(m, afterPageId);
    if (!location) return;
    // Tracked so sourcePage.groups' own blockIds (still pointing at the *old* blocks) can be
    // remapped onto the freshly cloned ones below - a pasted page's groups need to survive the
    // copy pointing at the right (new) blocks, exactly like its quiz/video timeline events do.
    const idMap = new Map<UUID, UUID>();
    const blocks = sourcePage.blocks.map((block) => {
      const cloned = cloneBlockWithNewId(block);
      idMap.set(block.id, cloned.id);
      return cloned;
    });
    const groups: BlockGroup[] = sourcePage.groups.map((group) => ({
      id: createId(),
      blockIds: group.blockIds.map((id) => idMap.get(id)).filter((id): id is UUID => id !== undefined),
    }));
    const newPage: Page = {
      id: newPageId,
      layoutId: sourcePage.layoutId,
      blocks,
      groups,
      transition: sourcePage.transition,
      // Deep-cloned first so any future extra lanes survive the copy untouched, then rebuilt below
      // since its quiz/video-event nodes still pointed at the *old* block ids.
      timeline: structuredClone(sourcePage.timeline),
    };
    syncPageTimelineEvents(newPage);
    m.pages[newPageId] = newPage;
    if (location.kind === "top") {
      m.sequence.splice(location.index + 1, 0, { kind: "page", pageId: newPageId });
    } else {
      const branch = m.logicBlocks[location.logicBlockId]?.branches.find((b) => b.id === location.branchId);
      branch?.pageIds.splice(location.index + 1, 0, newPageId);
    }
    inserted = true;
  });
  return inserted ? newPageId : null;
}

/**
 * Pastes a copied block into a page's or layout's own block list. Silently refuses a Quiz block
 * for a layout target, since layouts can't carry interactive/graded blocks (see StaticBlock).
 */
export function pasteBlockInto(
  target: { kind: "page"; pageId: string } | { kind: "layout"; layoutId: string },
  sourceBlock: Block,
): string | null {
  if (target.kind === "layout" && sourceBlock.kind === "quiz") return null;
  const newBlock = cloneBlockWithNewId(sourceBlock);
  newBlock.position = offsetPosition(newBlock.position);

  let inserted = false;
  edit("Element einfügen", (m) => {
    if (target.kind === "page") {
      const page = m.pages[target.pageId];
      if (!page) return;
      page.blocks.push(newBlock);
      syncPageTimelineEvents(page);
    } else {
      const layout = m.layouts[target.layoutId];
      if (!layout) return;
      layout.blocks.push(newBlock as StaticBlock);
    }
    inserted = true;
  });
  return inserted ? newBlock.id : null;
}

// ---- Custom fonts (uploaded, unlike the curated set shipped with the app - see core/fonts/) --

function deriveFontFamilyName(fileName: string, existing: CustomFont[]): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Eigene Schriftart";
  const taken = new Set(existing.map((f) => f.family));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** Uploads a font file as a document asset (same blob store as images) and makes it selectable
 * in the font-family control - see BlockPanel.tsx and richText.ts's applyFormat("fontName", …).
 * Its family name is derived from the file name, not user-chosen, since that name is also what
 * gets written into every span/font tag that uses it. */
export function addCustomFont(file: File): { id: string; family: string } {
  const fontId = createId();
  useAssetStore.getState().setAsset(fontId, file);
  const family = deriveFontFamilyName(file.name, useDocumentStore.getState().doc.content.customFonts);
  edit("Schriftart hinzufügen", (m) => {
    m.customFonts.push({ id: fontId, family, fileName: file.name, mimeType: file.type || "font/woff2" });
  });
  return { id: fontId, family };
}

export function removeCustomFont(id: string) {
  edit("Schriftart entfernen", (m) => {
    m.customFonts = m.customFonts.filter((f) => f.id !== id);
  });
}
