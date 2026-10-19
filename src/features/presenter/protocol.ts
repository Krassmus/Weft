/**
 * What the two windows of the presenter view say to each other (see PresenterView.tsx, which is the editor's window with the
 * speaker's screen, and AudienceView.tsx, the window for the beamer). The audience window plays the module - it is what is true -
 * and tells the presenter's window what it shows; the presenter's window sends commands (and follows the state it is told).
 */

/** What the module in the audience window shows right now (reported by player.runtime.js, see reportState there). */
export interface PresenterState {
  /** The slide that is shown; null on the screen at the end of the module. */
  pageId: string | null;
  /** The name of that slide in the editor ("3", "2.a.1"). */
  pageLabel: string;
  finished: boolean;
  /** The slide after it, if there is one. */
  nextPageId: string | null;
  /** How many of the slide's builds (elements that appear on Weiter ...) have happened, and how many there are. */
  buildsDone: number;
  buildsTotal: number;
}

export type PresenterCommand = "weiter" | "prev" | "restart" | "goto" | "blackout";

export type PresenterMessage =
  /** Presenter -> audience: do this (the same as Space, ←, a jump to a slide, ...). */
  | { type: "command"; action: PresenterCommand; pageId?: string }
  /** Audience -> presenter: this is what the module shows now. */
  | { type: "state"; state: PresenterState }
  | { type: "audience-ready" }
  | { type: "audience-closed" }
  /** Audience -> presenter: Escape was pressed there. */
  | { type: "audience-exit" }
  /** Presenter -> audience: the presentation is over. */
  | { type: "close" }
  /** Without a desktop app (a browser tab): the audience tab asks for the module, and gets it as a player file's bytes. */
  | { type: "need-file" }
  | { type: "file"; bytes: Uint8Array };
