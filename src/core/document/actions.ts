import { createId } from "../id";
import { ASPECT_RATIO_NUMERIC } from "../aspectRatio";
import { useAssetStore } from "../assets/assetStore";
import { isFfmpegAvailable, transcodeToH264 } from "../io/videoTranscode";
import type {
  AspectRatio,
  Block,
  BlockPosition,
  Branch,
  CustomFont,
  Layout,
  Page,
  StaticBlock,
  VariableCondition,
  VariableDef,
  VariableType,
  WeftModule,
} from "../types";
import { useDocumentStore } from "./store";

function edit(label: string, recipe: (draft: WeftModule) => void) {
  useDocumentStore.getState().edit(label, recipe);
}

function emptyPage(layoutId: string | null): Page {
  return { id: createId(), layoutId, blocks: [] };
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

export function moveBranchPage(logicBlockId: string, branchId: string, from: number, to: number) {
  if (from === to) return;
  edit("Reihenfolge im Zweig ändern", (m) => {
    const branch = m.logicBlocks[logicBlockId]?.branches.find((b) => b.id === branchId);
    if (!branch) return;
    const [pageId] = branch.pageIds.splice(from, 1);
    branch.pageIds.splice(to, 0, pageId);
  });
}

export function removePageFromBranch(logicBlockId: string, branchId: string, pageId: string) {
  edit("Folie aus Zweig entfernen", (m) => {
    const branch = m.logicBlocks[logicBlockId]?.branches.find((b) => b.id === branchId);
    if (branch) branch.pageIds = branch.pageIds.filter((id) => id !== pageId);
  });
}

// ---- Blocks ----------------------------------------------------------------

function defaultBlockFor(kind: Block["kind"]): Block {
  const position = { x: 10, y: 40, width: 80, height: 20 };
  switch (kind) {
    case "text":
      return { id: createId(), kind, position, html: "<p>Neuer Text</p>" };
    case "image":
      return { id: createId(), kind, position, assetId: null, alt: "" };
    case "video":
      return { id: createId(), kind, position, assetId: null, autoplay: false, loop: false, muted: false, controls: true };
    case "iframe":
      return { id: createId(), kind, position, url: "https://www.youtube.com/embed/", sandbox: ["allow-scripts"], qrCode: false };
    case "button":
      return { id: createId(), kind, position: { x: 35, y: 82, width: 30, height: 10 }, text: "Weiter", action: "next" };
    case "quiz":
      return {
        id: createId(),
        kind,
        position,
        question: "Neue Frage",
        options: [
          { id: createId(), text: "Option A" },
          { id: createId(), text: "Option B" },
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
    m.pages[pageId]?.blocks.push(block);
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

export function updateBlock(pageId: string, blockId: string, patch: Partial<Block>) {
  edit("Block bearbeiten", (m) => {
    const block = m.pages[pageId]?.blocks.find((b) => b.id === blockId);
    if (block) Object.assign(block, patch);
  });
}

export function removeBlock(pageId: string, blockId: string) {
  edit("Block entfernen", (m) => {
    const page = m.pages[pageId];
    if (page) page.blocks = page.blocks.filter((b) => b.id !== blockId);
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
    m.pages[pageId]?.blocks.push({ id: blockId, kind: "image", position: fitToAspect(position, percentRatio), assetId, alt: "" });
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
    m.layouts[layoutId]?.blocks.push({ id: blockId, kind: "image", position: fitToAspect(position, percentRatio), assetId, alt: "" });
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
    m.pages[pageId]?.blocks.push({
      id: blockId,
      kind: "video",
      position: fitToAspect(position, percentRatioForAspect(resolved.aspect)),
      assetId,
      autoplay: false,
      loop: false,
      muted: false,
      controls: true,
    });
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
    const newPage: Page = {
      id: newPageId,
      layoutId: sourcePage.layoutId,
      blocks: sourcePage.blocks.map(cloneBlockWithNewId),
    };
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
