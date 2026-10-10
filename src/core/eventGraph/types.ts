import type { Transition } from "../types";

/**
 * The event graph of one page as the player runs it (see docs/event-graph.md). The editor builds it from what a page stores
 * (buildEventGraph) and puts it into the exported module; the player only executes it - it has no logic of its own about defaults,
 * chains or queues.
 *
 * An event "happens" (and then sends all its outgoing triggers) either because the player makes it happen (the start of the page, a
 * quiz being submitted, a video reaching a stop point) or because an incoming trigger reached it and the action behind it ran (an
 * element appears, a video starts, the page is left). `GraphEventKind` says which action that is.
 */
export type GraphEventKind =
  /** The page was entered. */
  | "start"
  /** A block's Aufbau: the block appears. `id` is `block-entrance:<blockId>`. */
  | "entrance"
  /** A block's Abbau: the block disappears. `id` is `block-exit:<blockId>`. */
  | "exit"
  /** A video starts playing (`video-start:<blockId>`) - by an incoming trigger or by the learner pressing play. */
  | "video-start"
  /** A video reaches one of its stop points (`video-stop:<blockId>:<stopPointId>`). Made to happen by the player. */
  | "video-stop"
  /** A video ends (`video-end:<blockId>`). Made to happen by the player. */
  | "video-end"
  /** The learner picked a first option of a quiz (`quiz-fill:<blockId>`). Made to happen by the player. */
  | "quiz-fill"
  /** The learner submitted a quiz (`quiz-submit:<blockId>`, with `:richtig` / `:falsch` once the outcome has its own event). */
  | "quiz-submit"
  /** A button was clicked (`button-click:<blockId>`). Made to happen by the player. */
  | "button-click"
  /** The Aufbau/Abbau of a group as a whole (`group-entrance:<groupId>`, `group-exit:<groupId>`): it has no action of its own - what it
   * triggers are the Aufbau/Abbau of its members, which do the work. */
  | "group-entrance"
  | "group-exit"
  /** The page is left, going on to the next one with `transition`. When several of these are reached, the first one wins. */
  | "end";

export interface GraphEvent {
  id: string;
  kind: GraphEventKind;
  /** Only for "end": how the page is left. */
  transition?: Transition;
}

/** One line of the graph: when `from` has happened, `to` happens `delayMs` later - if `weiter`, only once the learner has pressed
 * Weiter after `from` (then `delayMs` runs from that press). */
export interface GraphTrigger {
  id: string;
  from: string;
  to: string;
  delayMs: number;
  weiter: boolean;
}

export interface PageGraph {
  events: GraphEvent[];
  triggers: GraphTrigger[];
}
