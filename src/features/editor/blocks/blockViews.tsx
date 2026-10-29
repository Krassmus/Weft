import type { ReactNode } from "react";
import type { Block, ButtonBlock, CheckerBlock, ClozeBlock, GalleryBlock, IframeBlock, LanguageBlock, LinkBlock, ListBlock, MatchingBlock, ProgressBlock, QuizBlock, RevealerBlock, SortBlock, SolutionBlock, TextBlock } from "../../../core/types";
import { ButtonView } from "./ButtonView";
import { CheckerCanvas } from "./CheckerCanvas";
import { CheckerView } from "./CheckerView";
import { ClozeView } from "./ClozeView";
import { GalleryCanvas } from "./GalleryCanvas";
import { GalleryView } from "./GalleryView";
import { IframeView } from "./IframeView";
import { LanguageView } from "./LanguageView";
import { LinkView } from "./LinkView";
import { ListView } from "./ListView";
import { MatchingRenderView } from "./MatchingRenderView";
import { ProgressView } from "./ProgressView";
import { QuizView } from "./QuizView";
import { RevealerView } from "./RevealerView";
import { SortRenderView } from "./SortRenderView";
import { SolutionView } from "./SolutionView";
import { TextView } from "./TextView";

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
  /** The value of `progress` on the page a thumbnail is the picture of, where it is known (a progress bar shows it). */
  progress?: number | null;
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
  /** The canvas draws the block by itself (BlockView): this is only what the thumbnails and the PDF draw. */
  ownCanvas?: boolean;
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

const progressView: BlockViewSpec<ProgressBlock> = {
  View: ({ block, mode, progress }) => <ProgressView block={block} mode={mode} progress={progress} />,
  freelyMovable: true,
};

const languageView: BlockViewSpec<LanguageBlock> = {
  View: ({ lang, mode }) => <LanguageView lang={lang} mode={mode} />,
  freelyMovable: true,
};

const checkerView: BlockViewSpec<CheckerBlock> = {
  View: ({ block, lang, defaultLang, mode }) => <CheckerView block={block} lang={lang} defaultLang={defaultLang} mode={mode} />,
  Canvas: ({ block, selected, onUpdate }) => <CheckerCanvas block={block} selected={selected} onUpdate={onUpdate} />,
  freelyMovable: true,
};

const buttonView: BlockViewSpec<ButtonBlock> = {
  View: ({ block, lang, defaultLang, mode }) => <ButtonView block={block} lang={lang} defaultLang={defaultLang} mode={mode} />,
  // (Its label is written in place on the canvas, with the editor's rich text.)
  ownCanvas: true,
  freelyMovable: false,
};

const textView: BlockViewSpec<TextBlock> = {
  View: ({ block, lang, defaultLang, mode, progress }) => <TextView block={block} lang={lang} defaultLang={defaultLang} mode={mode} progress={progress} />,
  // (Its words are written in place on the canvas, with the editor's rich text; a text is moved by its frame while that goes on.)
  ownCanvas: true,
  freelyMovable: false,
};

const listView: BlockViewSpec<ListBlock> = {
  View: ({ block, lang, defaultLang, mode, progress }) => <ListView block={block} lang={lang} defaultLang={defaultLang} mode={mode} progress={progress} />,
  // (Its points are written in place on the canvas, one after the other: Enter, Backspace and the arrow keys go from one to the next.)
  ownCanvas: true,
  freelyMovable: false,
};

const clozeView: BlockViewSpec<ClozeBlock> = {
  View: ({ block, lang, defaultLang, mode, progress }) => <ClozeView block={block} lang={lang} defaultLang={defaultLang} mode={mode} progress={progress} />,
  // (Its text is written in place on the canvas, the blanks as [[answer]], with the editor's rich text.)
  ownCanvas: true,
  freelyMovable: false,
};

const quizView: BlockViewSpec<QuizBlock> = {
  View: ({ block, lang, defaultLang, mode, progress }) => <QuizView block={block} lang={lang} defaultLang={defaultLang} mode={mode} progress={progress} />,
  // (The question and the answers are written in place on the canvas, and the right ones are marked there: the editor's own.)
  ownCanvas: true,
  freelyMovable: false,
};

const revealerView: BlockViewSpec<RevealerBlock> = {
  View: ({ block, lang, defaultLang, mode }) => <RevealerView block={block} lang={lang} defaultLang={defaultLang} mode={mode} />,
  // On the canvas the window stands open around the icon while the block is selected.
  Canvas: ({ block, lang, defaultLang, selected }) => <RevealerView block={block} lang={lang} defaultLang={defaultLang} mode="edit" open={selected} />,
  freelyMovable: true,
};

const matchingView: BlockViewSpec<MatchingBlock> = {
  View: ({ block, lang, defaultLang, mode, progress }) => <MatchingRenderView block={block} lang={lang} defaultLang={defaultLang} mode={mode} progress={progress} />,
  // (On the canvas the cards are moved, their words written in place and their pictures changed: the editor's own, MatchingCanvas.)
  ownCanvas: true,
  freelyMovable: false,
};

const sortView: BlockViewSpec<SortBlock> = {
  View: ({ block, lang, defaultLang, mode, progress }) => <SortRenderView block={block} lang={lang} defaultLang={defaultLang} mode={mode} progress={progress} />,
  // (On the canvas the objects are put in order by dragging, their words written in place and their pictures changed: the editor's own, SortCanvas.)
  ownCanvas: true,
  freelyMovable: false,
};

const VIEWS: Partial<Record<Block["kind"], BlockViewSpec<never>>> = {
  solution: solutionView as BlockViewSpec<never>,
  gallery: galleryView as BlockViewSpec<never>,
  iframe: iframeView as BlockViewSpec<never>,
  link: linkView as BlockViewSpec<never>,
  progress: progressView as BlockViewSpec<never>,
  language: languageView as BlockViewSpec<never>,
  checker: checkerView as BlockViewSpec<never>,
  button: buttonView as BlockViewSpec<never>,
  text: textView as BlockViewSpec<never>,
  list: listView as BlockViewSpec<never>,
  cloze: clozeView as BlockViewSpec<never>,
  quiz: quizView as BlockViewSpec<never>,
  revealer: revealerView as BlockViewSpec<never>,
  matching: matchingView as BlockViewSpec<never>,
  sort: sortView as BlockViewSpec<never>,
};

/** The editor's views of a kind, if it has them here. */
export function viewOf(kind: Block["kind"]): BlockViewSpec | undefined {
  return VIEWS[kind] as unknown as BlockViewSpec | undefined;
}
