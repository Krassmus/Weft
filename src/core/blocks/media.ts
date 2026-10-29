import { tr } from "../i18n/tr";
import type { AudioBlock, VideoBlock } from "../types";
import type { BlockProblem, OwnEventSpec } from "./types";

/** The words of "the kind of block" in what `weft validate` says about a file: `image-Block hat noch keine Datei.` */
export function mediaProblems(block: { kind: string; assetId: string | null; alt?: string }, module: { assets: { id: string }[] }): BlockProblem[] {
  const problems: BlockProblem[] = [];
  if (!block.assetId) {
    problems.push({ level: "warning", code: "media-empty", message: `${block.kind}-Block hat noch keine Datei.` });
    return problems;
  }
  if (!module.assets.some((asset) => asset.id === block.assetId))
    problems.push({ level: "error", code: "asset-missing", message: `${block.kind}-Block verweist auf die Datei ${block.assetId}, die nicht in der Liste der Dateien steht.` });
  if (block.kind === "image" && !block.alt?.trim()) problems.push({ level: "info", code: "image-no-alt", message: "Bild ohne Alternativtext." });
  return problems;
}

/** The name of the file of a block (`block.assetId`) in the list of the module's files, if it is given. */
export function fileNameOf(assetId: string | null, assets: { id: string; fileName: string }[] | undefined): string | undefined {
  return assets?.find((asset) => asset.id === assetId)?.fileName;
}

/**
 * The events of a video and of a sound (the same ones - see isMediaBlock): it starts (by the learner pressing play or by a trigger: by itself when
 * `autoplay`), it reaches each of its time marks (`stopPoints`), a mark that stops it has it going on again after it (the learner presses play), it ends
 * (or, looping, goes round). The player makes the stops and the end happen and the start when the learner does it; a trigger can make it start. The nodes
 * are drawn in a lane of the editor's own (buildVideoLane in document/pageTimeline.ts: the time marks in playback order, the times between them) - the
 * words of the nodes are made there as well, a sound has its own.
 */
export const mediaEvents: OwnEventSpec<VideoBlock | AudioBlock>[] = [
  {
    key: "start",
    idPrefix: "video-start",
    graphKind: "video-start",
    timelineType: (block) => (block.autoplay ? "video-start-auto" : "video-start-manual"),
    timelineTypes: ["video-start-auto", "video-start-manual"],
    triggerable: true,
    looks: {
      "video-start-auto": { label: () => tr("ui.start_of_the_video"), icon: "video", color: "violet", triggeredColor: "blue" },
      "video-start-manual": { label: () => tr("ui.start_of_the_video"), icon: "play", color: "violet", triggeredColor: "blue" },
    },
  },
  {
    key: "stop",
    idPrefix: "video-stop",
    graphKind: "video-stop",
    timelineType: "video-stop-point",
    perItem: "stopPoints",
    triggerable: false,
    looks: { "video-stop-point": { label: () => tr("ui.time_mark_2"), hint: () => tr("ui.happens_as_soon_as_playback_reaches"), icon: "stop-point", color: "blue" } },
    companions: [
      {
        key: "resume",
        idPrefix: "video-resume",
        graphKind: "video-resume",
        timelineType: "video-resume",
        exists: (_block, _where, item) => item?.stopsVideo === true,
        triggerable: false,
        looks: { "video-resume": { label: () => tr("ui.video_continues_2"), hint: () => tr("ui.happens_as_soon_as_the_learner_3"), icon: "play", color: "violet" } },
      },
    ],
  },
  {
    key: "end",
    idPrefix: "video-end",
    graphKind: "video-end",
    timelineType: (block) => (block.loop ? "video-end-loop" : "video-end-stop"),
    triggerable: false,
    looks: {
      "video-end-loop": { label: () => tr("ui.end_of_the_video"), hint: () => tr("ui.never_happens_the_video_runs_in"), icon: "infinity", color: "blue" },
      "video-end-stop": { label: () => tr("ui.end_of_the_video"), hint: () => tr("ui.happens_as_soon_as_the_video"), icon: "stop", color: "blue" },
    },
  },
];
