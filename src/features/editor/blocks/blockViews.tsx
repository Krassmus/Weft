import type { ReactNode } from "react";
import type { Block, GalleryBlock, IframeBlock, LinkBlock, SolutionBlock } from "../../../core/types";
import { GalleryCanvas } from "./GalleryCanvas";
import { GalleryView } from "./GalleryView";
import { IframeView } from "./IframeView";
import { LinkView } from "./LinkView";
import { SolutionView } from "./SolutionView";

/** What a view is given. */
export interface BlockViewProps<B extends Block = Block> {
  block: B;
  lang: string | null;
  defaultLang: string | null;
  selected: boolean;
  /** Where it is drawn: the editor's canvas, a thumbnail, the PDF. */
  mode: "edit" | "thumbnail" | "print";
  /** A QR code made for the block (for the PDF). */
  qrSvg?: string;
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
  View: ({ block, lang, defaultLang, mode }) => <SolutionView block={block} lang={lang} defaultLang={defaultLang} mode={mode} />,
  freelyMovable: true,
};

const galleryView: BlockViewSpec<GalleryBlock> = {
  View: ({ block }) => <GalleryView block={block} />,
  Canvas: ({ block, selected }) => <GalleryCanvas block={block} selected={selected} />,
  freelyMovable: true,
};

const iframeView: BlockViewSpec<IframeBlock> = {
  View: ({ block, lang, mode, qrSvg }) => <IframeView block={block} lang={lang} mode={mode} qrSvg={qrSvg} />,
  freelyMovable: true,
};

const linkView: BlockViewSpec<LinkBlock> = {
  View: ({ block, lang, defaultLang, mode }) => <LinkView block={block} lang={lang} defaultLang={defaultLang} mode={mode} />,
  freelyMovable: true,
};

const VIEWS: Partial<Record<Block["kind"], BlockViewSpec<never>>> = {
  solution: solutionView as BlockViewSpec<never>,
  gallery: galleryView as BlockViewSpec<never>,
  iframe: iframeView as BlockViewSpec<never>,
  link: linkView as BlockViewSpec<never>,
};

/** The editor's views of a kind, if it has them here. */
export function viewOf(kind: Block["kind"]): BlockViewSpec | undefined {
  return VIEWS[kind] as unknown as BlockViewSpec | undefined;
}
