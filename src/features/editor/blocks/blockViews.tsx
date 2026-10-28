import type { ReactNode } from "react";
import type { Block, SolutionBlock } from "../../../core/types";
import { SolutionView } from "./SolutionView";

/**
 * What the editor draws of a kind of block that describes itself (see core/blocks/registry.ts): the editor's half of the descriptor - the things
 * that are React. The canvas and the thumbnails draw the same `View`; a block that can be used in the editor itself (dragged, written into) has
 * a canvas of its own and is not in here yet.
 */
export interface BlockViewSpec<B extends Block = Block> {
  /** The paths of the icon (24 by 24, drawn with lines) - in the "+" menu and in the list of a slide's elements. */
  icon: ReactNode;
  /** The block as it is drawn; nothing in it can be used. */
  View(props: { block: B; lang: string | null; defaultLang: string | null }): ReactNode;
  /** Dragged from anywhere on it (not only by its frame). */
  freelyMovable: boolean;
}

const solutionView: BlockViewSpec<SolutionBlock> = {
  icon: (
    <>
      <rect x="3" y="5" width="18" height="8" rx="1.8" />
      <path d="M7 9h.01M11 9h.01M15 9h.01" strokeWidth="2.6" />
      <rect x="8" y="16" width="8" height="3.6" rx="1.4" />
    </>
  ),
  View: SolutionView,
  freelyMovable: true,
};

const VIEWS: Partial<Record<Block["kind"], BlockViewSpec<never>>> = { solution: solutionView as BlockViewSpec<never> };

/** The editor's views of a kind, if it has them here. */
export function viewOf(kind: Block["kind"]): BlockViewSpec | undefined {
  return VIEWS[kind] as unknown as BlockViewSpec | undefined;
}
