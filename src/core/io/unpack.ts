import { strFromU8, unzipSync } from "fflate";
import type { WeftDocument } from "../types";
import { useAssetStore } from "../assets/assetStore";
import { defaultEntranceEffect, defaultExitEffect } from "../document/blockEffects";
import { createDefaultPageTimeline, syncPageTimelineEvents } from "../document/pageTimeline";
import { assetZipPath, customFontZipPath } from "./pack";

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
    for (const block of page.blocks) {
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
  for (const page of Object.values(doc.content.pages)) {
    page.transition ??= { type: "none", durationMs: 500 };
    page.transition.durationMs ??= 500;
  }
}

// Older saves predate the per-page timeline graph (see Timeline.tsx and PageTimeline in
// types.ts) - default every page to the same start->end shape the old hardcoded UI always drew.
function migrateMissingTimelines(doc: WeftDocument) {
  for (const page of Object.values(doc.content.pages)) {
    page.timeline ??= createDefaultPageTimeline();
  }
}

// Older saves predate video stop points - default every video block (in a page or, since a video
// is a StaticBlock, a layout) to none rather than leave the field undefined, since the stop-point
// dialog and mini-timeline (see BlockPanel.tsx) assume it's always at least an empty array. A save
// from between that and the "Video hier stoppen" checkbox existing has stop points but no
// stopsVideo on them yet - backfill to true, matching the only thing a stop point did before.
function migrateMissingVideoStopPoints(doc: WeftDocument) {
  for (const page of Object.values(doc.content.pages)) {
    for (const block of page.blocks) {
      if (block.kind !== "video") continue;
      block.stopPoints ??= [];
      for (const sp of block.stopPoints) sp.stopsVideo ??= true;
    }
  }
  for (const layout of Object.values(doc.content.layouts)) {
    for (const block of layout.blocks) {
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
    for (const block of page.blocks) {
      block.entranceEffect ??= defaultEntranceEffect();
      block.exitEffect ??= defaultExitEffect();
    }
  }
  for (const layout of Object.values(doc.content.layouts)) {
    for (const block of layout.blocks) {
      block.entranceEffect ??= defaultEntranceEffect();
      block.exitEffect ??= defaultExitEffect();
    }
  }
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

export function unpackDocument(zipBytes: Uint8Array): WeftDocument {
  const files = unzipSync(zipBytes);

  const jsonBytes = files["weft.json"];
  if (!jsonBytes) throw new Error("weft.json fehlt im Archiv – das ist keine gültige Weft-Datei.");
  const doc = JSON.parse(strFromU8(jsonBytes)) as WeftDocument;
  // Older saves predate custom fonts - default rather than leave undefined, since every
  // customFonts.map/forEach elsewhere assumes an array.
  doc.content.customFonts ??= [];
  // Older saves predate the keyboard-navigation toggle - default to on, matching the behavior
  // every such module actually had before this setting existed.
  doc.content.keyboardNavigationEnabled ??= true;
  migrateLegacyQuizHtml(doc);
  migrateMissingTransitions(doc);
  migrateMissingTimelines(doc);
  migrateMissingVideoStopPoints(doc);
  migrateMissingBlockEffects(doc);
  syncAllPageTimelineEvents(doc);

  const setAsset = useAssetStore.getState().setAsset;
  for (const meta of doc.content.assets) {
    const bytes = files[assetZipPath(meta.id, meta.fileName)];
    if (bytes) setAsset(meta.id, new Blob([bytes], { type: meta.mimeType }));
  }
  for (const font of doc.content.customFonts) {
    const bytes = files[customFontZipPath(font.id, font.fileName)];
    if (bytes) setAsset(font.id, new Blob([bytes], { type: font.mimeType }));
  }

  return doc;
}
