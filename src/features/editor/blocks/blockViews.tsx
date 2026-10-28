import type { ReactNode } from "react";
import type { Block, GalleryBlock, SolutionBlock } from "../../../core/types";
import { GalleryCanvas } from "./GalleryCanvas";
import { GalleryView } from "./GalleryView";
import { SolutionView } from "./SolutionView";

/** What a view is given. */
export interface BlockViewProps<B extends Block = Block> {
  block: B;
  lang: string | null;
  defaultLang: string | null;
  selected: boolean;
  onUpdate?: (patch: Partial<Block>) => void;
}

/**
 * What the editor draws of a kind of block that describes itself (see core/blocks/registry.ts): the editor's half of the descriptor - the things
 * that are React. The icon is in describedIcons.tsx.
 */
export interface BlockViewSpec<B extends Block = Block> {
  /** The block as it is drawn in a thumbnail (and, without a `Canvas`, on the canvas); nothing in it can be used. */
  View(props: BlockViewProps<B>): ReactNode;
  /** The block on the canvas, where it can be used a little (a selected gallery is paged through). */
  Canvas?(props: BlockViewProps<B>): ReactNode;
  /** Dragged from anywhere on it (not only by its frame). */
  freelyMovable: boolean;
}

const solutionView: BlockViewSpec<SolutionBlock> = {
  View: ({ block, lang, defaultLang }) => <SolutionView block={block} lang={lang} defaultLang={defaultLang} />,
  freelyMovable: true,
};

const galleryView: BlockViewSpec<GalleryBlock> = {
  View: ({ block }) => <GalleryView block={block} />,
  Canvas: ({ block, selected }) => <GalleryCanvas block={block} selected={selected} />,
  freelyMovable: true,
};

const VIEWS: Partial<Record<Block["kind"], BlockViewSpec<never>>> = {
  solution: solutionView as BlockViewSpec<never>,
  gallery: galleryView as BlockViewSpec<never>,
};

/** The editor's views of a kind, if it has them here. */
export function viewOf(kind: Block["kind"]): BlockViewSpec | undefined {
  return VIEWS[kind] as unknown as BlockViewSpec | undefined;
}
