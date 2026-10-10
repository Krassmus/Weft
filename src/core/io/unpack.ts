import { strFromU8, unzipSync } from "fflate";
import { Automerge } from "../collab/automerge";
import { CURRENT_FORMAT_VERSION } from "../types";
import type { Block, LiveInvitation, WeftDocument, WeftModule } from "../types";
import { useAssetStore } from "../assets/assetStore";
import { defaultEntranceEffect, defaultExitEffect } from "../document/blockEffects";
import { createDefaultPageTimeline, syncPageTimelineEvents } from "../document/pageTimeline";
import { legacyPageToTimeline } from "./legacyEventGraph";
import type { LegacyPage } from "./legacyEventGraph";
import { orderedIdRecord, orderedRecord, orderedRecordBy } from "../document/ordering";
import { ensureBuiltinVariables } from "../document/variables";
import { assetZipPath, COLLAB_FILE, customFontZipPath, encryptedScriptPath, HISTORY_FILE } from "./pack";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Older saves predate rich-text quiz content - question/option text was plain, not HTML, in a
// field named `question`/`text` rather than today's `questionHtml`/`html`. Escaping it into an
// equivalent paragraph here, once, on load - rather than leaving every later reader (the canvas,
// the player, the export) to guess whether a given quiz block is old- or new-shaped - means
// QuizBlock.questionHtml/option.html can stay simple, always-present, always-already-HTML fields.
function migrateLegacyQuizHtml(doc: WeftDocument) {
  for (const page of Object.values(doc.content.pages)) {
    for (const block of Object.values(page.blocks)) {
      if (block.kind !== "quiz") continue;
      const legacy = block as unknown as { question?: string; options: { text?: string; html?: string }[] };
      if (block.questionHtml === undefined) block.questionHtml = `<p>${escapeHtml(legacy.question ?? "")}</p>`;
      for (const opt of legacy.options) {
        if (opt.html === undefined) opt.html = escapeHtml(opt.text ?? "");
      }
    }
  }
}

// Older saves predate the per-page transition (see Timeline.tsx) - default every page to "none",
// an instant cut, which is exactly the only behavior any of them ever actually had. A save from
// between that and the animation duration existing has a transition but no durationMs on it yet -
// backfill just that field rather than the whole object, so its type isn't lost.
function migrateMissingTransitions(doc: WeftDocument) {
  for (const page of Object.values(doc.content.pages) as unknown as LegacyPage[]) {
    page.transition ??= { type: "none", durationMs: 500 };
    page.transition.durationMs ??= 500;
  }
}

// Older saves predate the per-page timeline graph (see Timeline.tsx and PageTimeline in
// types.ts) - default every page to the same start->end shape the old hardcoded UI always drew.
function migrateMissingTimelines(doc: WeftDocument, fileVersion: number) {
  for (const page of Object.values(doc.content.pages)) {
    // A file before format 4 is converted from the old shape by migrateToEventGraph below - until then it has the old one.
    page.timeline ??= fileVersion < 4 ? ({ triggerEdges: {} } as unknown as typeof page.timeline) : createDefaultPageTimeline();
  }
}

// Older saves predate video stop points - default every video block (in a page or, since a video
// is a StaticBlock, a layout) to none rather than leave the field undefined, since the stop-point
// dialog and mini-timeline (see BlockPanel.tsx) assume it's always at least an empty array. A save
// from between that and the "Video hier stoppen" checkbox existing has stop points but no
// stopsVideo on them yet - backfill to true, matching the only thing a stop point did before.
function migrateMissingVideoStopPoints(doc: WeftDocument) {
  for (const page of Object.values(doc.content.pages)) {
    for (const block of Object.values(page.blocks)) {
      if (block.kind !== "video") continue;
      block.stopPoints ??= [];
      for (const sp of block.stopPoints) sp.stopsVideo ??= true;
    }
  }
  for (const layout of Object.values(doc.content.layouts)) {
    for (const block of Object.values(layout.blocks)) {
      if (block.kind !== "video") continue;
      block.stopPoints ??= [];
      for (const sp of block.stopPoints) sp.stopsVideo ??= true;
    }
  }
}

// Older saves predate a block's own Aufbau/Abbau (entrance/exit) effects - default every block (in
// a page or a layout) to instant-and-immediate/never-fires, i.e. exactly how every block actually
// behaved before this existed (see defaultEntranceEffect/defaultExitEffect's own doc comments).
function migrateMissingBlockEffects(doc: WeftDocument) {
  for (const page of Object.values(doc.content.pages)) {
    for (const block of Object.values(page.blocks)) {
      block.entranceEffect ??= defaultEntranceEffect();
      block.exitEffect ??= defaultExitEffect();
    }
  }
  for (const layout of Object.values(doc.content.layouts)) {
    for (const block of Object.values(layout.blocks)) {
      block.entranceEffect ??= defaultEntranceEffect();
      block.exitEffect ??= defaultExitEffect();
    }
  }
}

// Older saves (including ones made mid-development, before this existed) predate
// PageTimeline.triggerEdges and kept a block's own Aufbau/Abbau trigger directly on BlockEffect
// itself (triggerEventId/delayMs) - move whichever of those isn't already the implicit default
// (see getBlockEntranceTrigger/getBlockExitTrigger in document/pageTimeline.ts) into a real
// triggerEdges entry instead, then drop the old fields so nothing downstream has to keep
// tolerating their presence.
function migrateBlockEffectTriggers(doc: WeftDocument) {
  for (const page of Object.values(doc.content.pages)) {
    const timeline = page.timeline as unknown as { triggerEdges: Record<string, unknown> };
    timeline.triggerEdges ??= {};
    for (const block of Object.values(page.blocks)) {
      const legacyEntrance = block.entranceEffect as unknown as { triggerEventId?: string | null; delayMs?: number };
      if (legacyEntrance.triggerEventId !== undefined) {
        if (legacyEntrance.triggerEventId && !(legacyEntrance.triggerEventId === "start" && (legacyEntrance.delayMs ?? 0) === 0)) {
          timeline.triggerEdges[`block-entrance:${block.id}`] = {
            from: legacyEntrance.triggerEventId,
            kind: "timed",
            delayMs: legacyEntrance.delayMs ?? 0,
          };
        }
        delete legacyEntrance.triggerEventId;
        delete legacyEntrance.delayMs;
      }
      const legacyExit = block.exitEffect as unknown as { triggerEventId?: string | null; delayMs?: number };
      if (legacyExit.triggerEventId !== undefined) {
        if (legacyExit.triggerEventId) {
          timeline.triggerEdges[`block-exit:${block.id}`] = {
            from: legacyExit.triggerEventId,
            kind: "timed",
            delayMs: legacyExit.delayMs ?? 0,
          };
        }
        delete legacyExit.triggerEventId;
        delete legacyExit.delayMs;
      }
    }
  }
}

// Saves from before a "rectangle" ShapeBlock's corners could be set independently (even ones from
// earlier the same day this was built - not just old "legacy" files) carry a single `cornerRadius`
// number rather than today's `cornerRadii` object. Without this, rendering that block (see
// ShapeSvg.tsx's roundedRectPath, which reads cornerRadii.topLeft etc.) throws on `undefined`
// partway through - and since that happens *during render*, with no error boundary catching it,
// it unmounts the whole app, not just that one block. Combined with the last-opened document
// reloading itself automatically on launch (see EditorShell.tsx), a single old save with a shape
// block on it was enough to make the app appear broken - a black window - on every single launch,
// not just "this one file fails to open".
function migrateLegacyShapeCornerRadius(doc: WeftDocument) {
  function migrateBlocks(blocks: Block[]) {
    for (const block of blocks) {
      if (block.kind !== "shape") continue;
      const legacy = block as unknown as { cornerRadius?: number; cornerRadii?: unknown };
      if (legacy.cornerRadii === undefined) {
        const r = legacy.cornerRadius ?? 0;
        block.cornerRadii = { topLeft: r, topRight: r, bottomRight: r, bottomLeft: r };
      }
      delete legacy.cornerRadius;
    }
  }
  for (const page of Object.values(doc.content.pages)) migrateBlocks(Object.values(page.blocks));
  for (const layout of Object.values(doc.content.layouts)) migrateBlocks(Object.values(layout.blocks));
}

// Every save predating the quiz/video timeline events (or made with an older build's actions,
// before some edit forgot to resync) may have quiz/video blocks its timeline doesn't reflect yet -
// reconcile once on load rather than trust whatever's already in the file (see
// syncPageTimelineEvents).
function syncAllPageTimelineEvents(doc: WeftDocument) {
  for (const page of Object.values(doc.content.pages)) {
    syncPageTimelineEvents(page);
  }
}

// Older saves predate grouping (see BlockGroup in types.ts) - default every page to no groups,
// since every page.groups.map/forEach elsewhere assumes an array.
function migrateMissingGroups(doc: WeftDocument) {
  for (const page of Object.values(doc.content.pages)) {
    page.groups ??= [];
  }
}

// Older saves predate both "Weiter" (advance) as a trigger (see TimelineEdgeKind in types.ts) AND
// "off" as a BlockEffectType (see its own doc comment in types.ts - "there's no Aufbau/Abbau here
// at all", distinct from "none"/"Keine Animation", which still has a real trigger, just no visual
// transition). Back in that world, "Nächste Folie" had no trigger of its own at all (advancing was
// hardcoded in the player), and a block's own entranceEffect.type "none" meant EITHER "never
// configured, just appears instantly" (by far the common case) OR "deliberately instant, but with
// some custom trigger/delay" (rarer, but genuinely supported, and already frozen into an explicit
// edge by migrateBlockEffectTriggers above if the author ever actually used it). Both of those old
// meanings are about to change (getEndTrigger/getBlockEntranceTrigger in document/pageTimeline.ts
// now default to "Weiter" for a page/block with no edge) - so every *already-saved* page gets its
// old behavior frozen here, once, before the defaults it stood in for mean something different:
// - "end": an explicit {from:"start",kind:"advance"} edge, same as always (nothing else changed).
// - a block's entrance with NO edge of its own (migrateBlockEffectTriggers already turned a
//   genuinely custom one into an edge, so "still none" here only ever means "never configured"):
//   "none" becomes "off" outright (that IS what "off" means now, no edge needed at all);
//   anything else (a real, deliberately configured "fade"/"move") gets the old "start, 0ms"
//   default frozen into an explicit edge instead, so it keeps firing exactly where it always did.
// - a block's exit with type "none" (its own only possible unconfigured state, given Abbau never
//   had an implicit non-null trigger in the first place) becomes "off" too, purely so it DISPLAYS
//   consistently with a freshly created block's own default - no edge or behavior to preserve.
// A page/block that gets its first-ever edge/effect-type >after< this point (a brand-new page, or
// a block added to one) is correctly left alone - its "off"/"no edge yet" genuinely means "never
// configured", and should pick up the new defaults exactly as intended. Layout blocks are
// deliberately not touched here (see getBlockEntranceTrigger's own doc comment - their trigger can
// never durably persist per-page anyway, migrating them would be pointless).
function migrateMissingAdvanceTriggers(doc: WeftDocument) {
  for (const page of Object.values(doc.content.pages)) {
    const edges = (page.timeline as unknown as { triggerEdges: Record<string, { from: string; kind: string; delayMs?: number }> }).triggerEdges;
    if (!edges["end"]) {
      edges["end"] = { from: "start", kind: "advance" };
    }
    for (const block of Object.values(page.blocks)) {
      const entranceId = `block-entrance:${block.id}`;
      if (!edges[entranceId]) {
        if (block.entranceEffect.type === "none") {
          block.entranceEffect.type = "off";
        } else if (block.entranceEffect.type !== "off") {
          edges[entranceId] = { from: "start", kind: "timed", delayMs: 0 };
        }
      }
      const exitId = `block-exit:${block.id}`;
      if (block.exitEffect.type === "none" && !edges[exitId]) {
        block.exitEffect.type = "off";
      }
    }
  }
}

// Format 4 stores the event graph as triggers and "Nächste Folie" events (see PageTimeline); everything before has trigger edges
// keyed by event, one transition per page and quiz flags - see io/legacyEventGraph.ts for what becomes what.
function migrateToEventGraph(doc: WeftDocument) {
  for (const page of Object.values(doc.content.pages)) {
    const legacy = page as unknown as LegacyPage & { transition?: unknown };
    page.timeline = legacyPageToTimeline(legacy);
    delete legacy.transition;
    for (const block of Object.values(page.blocks)) {
      const quiz = block as unknown as { advanceOnCorrect?: unknown; advanceOnIncorrect?: unknown };
      delete quiz.advanceOnCorrect;
      delete quiz.advanceOnIncorrect;
    }
  }
}

// Whatever a document of the current format may still lack (a save from a build in between): the two collections and the page's
// own "Nächste Folie".
function backfillEventGraph(doc: WeftDocument) {
  for (const page of Object.values(doc.content.pages)) {
    page.timeline.triggers ??= {};
    page.timeline.ends ??= {};
    page.timeline.ends["end"] ??= { transition: { type: "none", durationMs: 500 } };
  }
}

// Documents before formatVersion 3 keep their blocks, the page sequence and a branch's pages as
// arrays, store the timeline's lanes, and carry the undo history in the file. Version 3 is the
// mergeable shape (see WeftDocument.formatVersion, core/document/ordering.ts): the same data as
// keyed collections with `order` keys, the lanes left out (they are computed, see getPageLanes), and
// no undo history (it is local to the editor, see store.ts). Purely structural - fields that older
// saves lack are still backfilled by the migrations that follow. Runs exactly once per file: on a
// version-3 document it must never run again.
function migrateToMergeableShape(doc: WeftDocument) {
  type Legacy = {
    sequence?: unknown;
    pages: Record<string, { blocks: unknown; timeline?: { lanes?: unknown; triggerEdges?: unknown } }>;
    layouts: Record<string, { blocks: unknown }>;
    logicBlocks: Record<string, { branches: { pageIds?: string[]; pages?: unknown }[] }>;
  };
  const content = doc.content as unknown as Legacy;
  const asRecord = (blocks: unknown) => (Array.isArray(blocks) ? orderedRecord(blocks as { id: string }[]) : blocks);

  if (Array.isArray(content.sequence)) {
    const nodes = content.sequence as { kind: "page" | "logic"; pageId?: string; logicBlockId?: string }[];
    content.sequence = orderedRecordBy(nodes, (node) => (node.kind === "page" ? node.pageId : node.logicBlockId) as string);
  }
  for (const page of Object.values(content.pages)) {
    page.blocks = asRecord(page.blocks);
    if (page.timeline) {
      delete page.timeline.lanes;
      // The edges become a map by the event they cause (there was at most one per event; should an
      // old file somehow hold two, the later one wins).
      if (Array.isArray(page.timeline.triggerEdges)) {
        const byTarget: Record<string, unknown> = {};
        for (const { to, ...edge } of page.timeline.triggerEdges as { to: string }[]) byTarget[to] = edge;
        page.timeline.triggerEdges = byTarget;
      }
    }
  }
  for (const layout of Object.values(content.layouts)) layout.blocks = asRecord(layout.blocks);
  for (const logicBlock of Object.values(content.logicBlocks)) {
    for (const branch of logicBlock.branches) {
      if (Array.isArray(branch.pageIds)) {
        branch.pages = orderedIdRecord(branch.pageIds);
        delete branch.pageIds;
      }
    }
  }
  const legacyDoc = doc as unknown as { undoHistory?: unknown; undoIndex?: unknown };
  delete legacyDoc.undoHistory;
  delete legacyDoc.undoIndex;
}

/** The editing history stored next to weft.json (see HISTORY_FILE in pack.ts) - if it is there, can be
 * read, and describes the very same state weft.json does (same module, same last change). Anything
 * else (a file written by an older version, one whose weft.json was edited by hand) is ignored, and
 * the document then simply starts a new history from weft.json. */
function readHistory(bytes: Uint8Array | undefined, marker: { id: string; modifiedAt: string }): Uint8Array | undefined {
  if (!bytes) return undefined;
  try {
    const loaded = Automerge.load<WeftModule>(bytes);
    return loaded.id === marker.id && loaded.modifiedAt === marker.modifiedAt ? bytes : undefined;
  } catch {
    return undefined;
  }
}

/** Puts the binary assets (images, videos, fonts) the archive carries for `content` into the asset
 * store. unpackDocument does this itself; a merge (collab/merge.ts) does it only once it has
 * succeeded, for what the merged module references. */
export function importArchiveAssets(zipBytes: Uint8Array, content: Pick<WeftModule, "assets" | "customFonts">): void {
  importAssets(unzipSync(zipBytes), content);
}

/** The bytes in the script an export keeps an encrypted file in (see encryptedScript in pack.ts), if it is one. */
export function bytesOfEncryptedScript(script: Uint8Array | undefined): Uint8Array | undefined {
  if (!script) return undefined;
  const base64 = /"([A-Za-z0-9+/=]*)"\);\s*$/.exec(strFromU8(script))?.[1];
  if (base64 === undefined) return undefined;
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

function importAssets(files: Record<string, Uint8Array>, content: Pick<WeftModule, "assets" | "customFonts">): void {
  const setAsset = useAssetStore.getState().setAsset;
  for (const meta of content.assets) {
    const bytes = files[assetZipPath(meta.id, meta.fileName)] ?? bytesOfEncryptedScript(files[encryptedScriptPath(meta.id, meta.fileName)]);
    if (bytes) setAsset(meta.id, new Blob([bytes as BlobPart], { type: meta.mimeType }));
  }
  for (const font of content.customFonts) {
    const bytes = files[customFontZipPath(font.id, font.fileName)];
    if (bytes) setAsset(font.id, new Blob([bytes as BlobPart], { type: font.mimeType }));
  }
}

/** What is stored next to the history (see COLLAB_FILE in pack.ts): the Automerge document id, if it is
 * there and looks like one, and - if the file is an invitation to live collaboration - its password and
 * relays (only read when they look right: they end up in a URL and a WebSocket address). */
function readCollab(bytes: Uint8Array | undefined): { documentId?: string; live?: LiveInvitation } {
  if (!bytes) return {};
  try {
    const { documentId, live } = JSON.parse(strFromU8(bytes)) as { documentId?: unknown; live?: { secret?: unknown; relays?: unknown } };
    if (typeof documentId !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{20,40}$/.test(documentId)) return {};
    const secret = live?.secret;
    if (typeof secret !== "string" || !/^[A-Za-z0-9_-]{16,64}$/.test(secret)) return { documentId };
    const relays = Array.isArray(live?.relays)
      ? (live.relays as unknown[]).filter((r): r is string => typeof r === "string" && /^wss?:\/\//.test(r)).slice(0, 10)
      : [];
    return { documentId, live: { secret, relays } };
  } catch {
    return {};
  }
}

export function unpackDocument(zipBytes: Uint8Array, options: { importAssets?: boolean } = {}): WeftDocument {
  const files = unzipSync(zipBytes);

  const jsonBytes = files["weft.json"];
  if (!jsonBytes) throw new Error("weft.json fehlt im Archiv – das ist keine gültige Weft-Datei.");
  const doc = JSON.parse(strFromU8(jsonBytes)) as WeftDocument;
  const fileVersion = doc.formatVersion ?? 1;
  if (fileVersion > CURRENT_FORMAT_VERSION) {
    throw new Error(
      "Diese Datei wurde mit einer neueren Version von Weft gespeichert und lässt sich hier nicht öffnen. Bitte Weft aktualisieren.",
    );
  }
  // What the history, if there is one, has to agree with to be trusted (see readHistory).
  const jsonContentMarker = { id: doc.content.id, modifiedAt: doc.content.modifiedAt };
  // The shape conversion comes first: every migration below works on the current shape.
  if (fileVersion < 3) migrateToMergeableShape(doc);
  // Older saves predate custom fonts - default rather than leave undefined, since every
  // customFonts.map/forEach elsewhere assumes an array.
  doc.content.customFonts ??= [];
  // Older saves predate the keyboard-navigation toggle - default to on, matching the behavior
  // every such module actually had before this setting existed.
  doc.content.keyboardNavigationEnabled ??= true;
  migrateLegacyQuizHtml(doc);
  if (fileVersion < 4) migrateMissingTransitions(doc);
  migrateMissingTimelines(doc, fileVersion);
  migrateMissingVideoStopPoints(doc);
  migrateMissingBlockEffects(doc);
  if (fileVersion < 4) migrateBlockEffectTriggers(doc);
  migrateLegacyShapeCornerRadius(doc);
  migrateMissingGroups(doc);
  // Older saves predate languages: a single-language module.
  doc.content.languages ??= [];
  // The built-in `success` variable exists in every module - older saves predate it.
  ensureBuiltinVariables(doc.content.variables);
  // The old per-module "LMS-Anbindung" setting no longer exists (VanillaLM is always active).
  delete (doc.content as unknown as { lms?: unknown }).lms;
  // Only a pre-"Weiter" save (formatVersion 1) has implicit defaults that still mean the OLD
  // behavior - see WeftDocument.formatVersion. Running this on an already-current document would
  // misread its (intentional) "no edge yet = Weiter" blocks as legacy and freeze them to "Start
  // der Folie" on every single reopen.
  if (fileVersion < 2) migrateMissingAdvanceTriggers(doc);
  if (fileVersion < 4) migrateToEventGraph(doc);
  backfillEventGraph(doc);
  doc.formatVersion = CURRENT_FORMAT_VERSION;
  syncAllPageTimelineEvents(doc);
  if (fileVersion === CURRENT_FORMAT_VERSION) {
    doc.history = readHistory(files[HISTORY_FILE], jsonContentMarker);
    // The id only goes with a history that is actually used - it names the document that history is of.
    if (doc.history) {
      const collab = readCollab(files[COLLAB_FILE]);
      doc.documentId = collab.documentId;
      doc.live = collab.live;
    }
  }

  if (options.importAssets !== false) importAssets(files, doc.content);

  return doc;
}
