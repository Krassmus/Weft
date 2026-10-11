import { incomingTriggers } from "../../../core/document/pageTimeline";
import type { SelectionRef } from "../../../core/document/store";
import type { Page } from "../../../core/types";

/** What a selected event shows of a video on the canvas: the still of the video at the moment the event is about. */
export interface VideoPreview {
  blockId: string;
  /** Seconds into the video, or "end" for its last frame. */
  time: number | "end";
}

/**
 * The moment of a video that the event selected in the graph belongs to, if any: a video's own events (its start, a time mark,
 * its end), and everything a time mark triggers - it happens at that moment of the video. The graph selects, the canvas looks at the
 * selection: that is how a click on an event reaches the picture in the editor (see EditorVideo in blocks/BlockView.tsx).
 */
export function videoPreviewFor(page: Page, selection: SelectionRef | null): VideoPreview | null {
  if (selection?.type !== "event" || selection.pageId !== page.id) return null;
  let id = selection.nodeId;
  for (let depth = 0; depth < 12; depth++) {
    const [kind, blockId, stopPointId] = id.split(":");
    const block = page.blocks[blockId ?? ""];
    if (block?.kind === "video") {
      if (kind === "video-stop") {
        const stopPoint = block.stopPoints.find((s) => s.id === stopPointId);
        return stopPoint ? { blockId: block.id, time: stopPoint.timeSeconds } : null;
      }
      if (kind === "video-start") return { blockId: block.id, time: 0 };
      if (kind === "video-end") return { blockId: block.id, time: "end" };
    }
    // Something that happens because of something else: where does that come from?
    const from = incomingTriggers(page.timeline, id)[0]?.from;
    if (!from || from === id) return null;
    id = from;
  }
  return null;
}
