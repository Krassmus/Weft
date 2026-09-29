import { formatTimeMMSS } from "../formatTime";
import type { Page, PageTimeline, QuizBlock, TimelineEdgeKind, TimelineLane, TimelineNode, VideoBlock } from "../types";

/**
 * What every page's timeline starts out as, and what older saves missing the field migrate to
 * (see unpack.ts): a single lane with just the "start" and "end" nodes, joined by a dashed
 * ("unknown"-timing) edge - causally after the start, but on no fixed schedule yet.
 */
export function createDefaultPageTimeline(): PageTimeline {
  return {
    lanes: [
      {
        nodes: [
          { id: "start", kind: "start" },
          { id: "end", kind: "end" },
        ],
        edges: [{ from: "start", to: "end", kind: "unknown" }],
      },
    ],
  };
}

function quizFillNodeId(quizBlockId: string): string {
  return `quiz-fill:${quizBlockId}`;
}

function quizSubmitNodeId(quizBlockId: string): string {
  return `quiz-submit:${quizBlockId}`;
}

const QUIZ_OUTCOME_EVENT_TYPES = { richtig: "quiz-submit-correct", falsch: "quiz-submit-incorrect" } as const;

/** A quiz outcome's own "Nächste Folie" - distinct per quiz *and* per outcome (see buildQuizLane's
 * own doc comment for why), even though every "end" node, this one included, still shows the same
 * generic "Nächste Folie" label/icon today (see nodeLabel/EVENT_ICONS in Timeline.tsx) - nothing
 * yet reads this id to show anything outcome-specific, but selecting one (see EventPanel.tsx) has
 * to land on *a* stable, distinct node, not the same one every other "end" would too. */
function quizEndNodeId(quizId: string, outcome: "richtig" | "falsch"): string {
  return `end:quiz:${quizId}:${outcome}`;
}

/**
 * Builds one quiz block's own lane: "Ausfüllen" (the learner picked a first option) leads to
 * "Quiz abgeschickt" (they submitted), both on no fixed schedule ("unknown"/dashed) since both
 * are up to the learner - neither is tied to "start", since filling out a quiz isn't the only
 * thing that can happen at the top of a page. Only when `finalEdge` is given does the lane reach
 * on to an "end" node at all - a quiz's outcome doesn't trigger the next slide unless the author
 * actually turned that on (see syncPageTimelineEvents), so an undefined outcome simply stops at
 * "submitted", rather than implying a connection to "end" that doesn't exist yet. `outcome`, when
 * given, also switches the submit node to its own outcome-specific TimelineEventType - so the
 * "richtig"/"falsch" lanes get visually distinct icons (see EVENT_ICONS in Timeline.tsx), not
 * just distinct labels - and gives its own "end" node its own id (see quizEndNodeId): a page can
 * have several distinct "Nächste Folie"s (the plain bypass one, and one per quiz outcome that
 * reaches it), each of which might reasonably want its own transition config some day, even
 * though they all still share the one page-wide Page.transition for now.
 */
function buildQuizLane(
  quiz: QuizBlock,
  finalEdge?: { kind: TimelineEdgeKind; delayMs?: number },
  outcome?: "richtig" | "falsch",
): TimelineLane {
  const fillId = quizFillNodeId(quiz.id);
  const submitId = quizSubmitNodeId(quiz.id);
  const nodes: TimelineNode[] = [
    { id: fillId, kind: "event", sourceBlockId: quiz.id, eventType: "quiz-fill-start" },
    {
      id: submitId,
      kind: "event",
      sourceBlockId: quiz.id,
      eventType: outcome ? QUIZ_OUTCOME_EVENT_TYPES[outcome] : "quiz-submit",
      ...(outcome ? { label: `Quiz abgeschickt (${outcome})` } : {}),
    },
  ];
  const edges: TimelineLane["edges"] = [{ from: fillId, to: submitId, kind: "unknown" }];
  if (finalEdge) {
    // outcome is always set here - finalEdge is only ever passed alongside it, see
    // syncPageTimelineEvents below.
    nodes.push({ id: outcome ? quizEndNodeId(quiz.id, outcome) : "end", kind: "end" });
    edges.push({ from: submitId, to: nodes[nodes.length - 1].id, ...finalEdge });
  }
  return { nodes, edges };
}

function videoStartNodeId(videoBlockId: string): string {
  return `video-start:${videoBlockId}`;
}

function videoEndNodeId(videoBlockId: string): string {
  return `video-end:${videoBlockId}`;
}

function videoStopNodeId(videoBlockId: string, stopPointId: string): string {
  return `video-stop:${videoBlockId}:${stopPointId}`;
}

/**
 * Builds one video block's own lane: "Start des Videos" leads through its stop points, in
 * playback order (VideoStopPoint.timeSeconds - see VideoStopPointDialog in panels/BlockPanel.tsx),
 * to "Ende des Videos". Unlike a quiz's timing, a video's own playback position *is* known once
 * it's started - so each edge up to the last stop point is "timed", with the exact delay between
 * the two points it connects (0ms into the first one, from "Start des Videos"); only the final
 * stretch into "Ende des Videos" stays "unknown"/dashed, since the video's total duration isn't
 * recorded anywhere in the document for it to be timed against. Which icon each end gets is
 * exactly what VideoBlock.autoplay/loop already say (see TimelineEventType in core/types.ts) - not
 * a separate setting of its own. Autoplay is the one case this *does* tie to "start": the video
 * starts itself the moment the slide does, so that edge is "timed" with a 0ms delay (solid,
 * immediate) - everything else about how a lane like this renders (dashed vs solid, aligned under
 * "Start der Folie" or not) then just falls out of the normal edge-kind/lead-gap rules in
 * Timeline.tsx, exactly like it does for buildQuizLane.
 */
function buildVideoLane(video: VideoBlock): TimelineLane {
  const startId = videoStartNodeId(video.id);
  const endId = videoEndNodeId(video.id);

  const nodes: TimelineNode[] = [];
  const edges: TimelineLane["edges"] = [];
  if (video.autoplay) {
    nodes.push({ id: "start", kind: "start" });
    edges.push({ from: "start", to: startId, kind: "timed", delayMs: 0 });
  }
  nodes.push({ id: startId, kind: "event", sourceBlockId: video.id, eventType: video.autoplay ? "video-start-auto" : "video-start-manual" });

  let previousId = startId;
  let previousTimeSeconds = 0;
  for (const stopPoint of video.stopPoints) {
    const stopId = videoStopNodeId(video.id, stopPoint.id);
    nodes.push({
      id: stopId,
      kind: "event",
      sourceBlockId: video.id,
      eventType: "video-stop-point",
      label: `Stoppunkt (${formatTimeMMSS(stopPoint.timeSeconds)})`,
    });
    edges.push({ from: previousId, to: stopId, kind: "timed", delayMs: Math.max(0, (stopPoint.timeSeconds - previousTimeSeconds) * 1000) });
    previousId = stopId;
    previousTimeSeconds = stopPoint.timeSeconds;
  }

  nodes.push({ id: endId, kind: "event", sourceBlockId: video.id, eventType: video.loop ? "video-end-loop" : "video-end-stop" });
  edges.push({ from: previousId, to: endId, kind: "unknown" });

  return { nodes, edges };
}

/**
 * Keeps a page's timeline in sync with its quiz and video blocks. A quiz is never mandatory - the
 * learner can always move on via Weiter/Leertaste/Pfeiltaste regardless of it (see the
 * keyboard-nav gate in player.runtime.js), so that direct start->end path is its own permanent
 * lane, dashed ("unknown"-timing), independent of any quiz or video. Each quiz block on the page
 * additionally gets its own lane (see buildQuizLane) for each outcome that's actually configured
 * to auto-advance (QuizBlock.advanceOnCorrect/advanceOnIncorrect - each its own solid/"timed"
 * 1.5s-pause lane, see the matching pause in the player), or, if neither is, a single lane
 * standing in for "fills it out and submits, but nothing scheduled to happen next" - which,
 * notably, does not reach "end" at all. Each video block similarly gets its own lane (see
 * buildVideoLane) - never reaching "end" either, since nothing here can trigger the next slide the
 * way a quiz's outcome can. Call this after any action that adds, removes, or reconfigures a
 * page's quiz/video blocks (see actions.ts) - the whole lane list is recomputed from scratch each
 * time rather than patched, so it can never end up with a stale/orphaned node.
 */
export function syncPageTimelineEvents(page: Page): void {
  const quizzes = page.blocks.filter((b): b is QuizBlock => b.kind === "quiz");
  const videos = page.blocks.filter((b): b is VideoBlock => b.kind === "video");

  const bypassLane: TimelineLane = {
    nodes: [
      { id: "start", kind: "start" },
      { id: "end", kind: "end" },
    ],
    edges: [{ from: "start", to: "end", kind: "unknown" }],
  };

  const lanes: TimelineLane[] = [bypassLane];
  for (const quiz of quizzes) {
    if (quiz.advanceOnCorrect) lanes.push(buildQuizLane(quiz, { kind: "timed", delayMs: 1500 }, "richtig"));
    if (quiz.advanceOnIncorrect) lanes.push(buildQuizLane(quiz, { kind: "timed", delayMs: 1500 }, "falsch"));
    if (!quiz.advanceOnCorrect && !quiz.advanceOnIncorrect) lanes.push(buildQuizLane(quiz));
  }
  for (const video of videos) {
    lanes.push(buildVideoLane(video));
  }

  page.timeline.lanes = lanes;
}
