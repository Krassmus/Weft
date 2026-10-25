import { useLayoutEffect, useRef } from "react";
import { pageProgress } from "../../core/document/pageProgress";
import { textBoxCss } from "../../core/document/textBox";
import { backdropBlurCss, hasBackdropBlur, shapeCornerCss } from "../../core/document/backdropBlur";
import { revealerIconSvg } from "../../core/runtime/revealerGeometry.js";
import { aspectRatioCss, aspectRatioNumeric } from "../../core/aspectRatio";
import { buttonAppearanceCss } from "../../core/document/buttonAppearance";
import { resolveInlineAssets } from "./blocks/richText";
import { useAssetStore } from "../../core/assets/assetStore";
import { useDocumentStore } from "../../core/document/store";
import { useStageTheme } from "./stageTheme";
import type { Block } from "../../core/types";
import { ArrowSvg } from "./blocks/ArrowSvg";
import { FilesView } from "./blocks/FilesView";
import { ShapeSvg } from "./blocks/ShapeSvg";
import { ImageSvg } from "./blocks/ImageSvg";
import { buttonHtml, buttonText, listItemHtml, quizOptionHtml, quizQuestionHtml, textHtml } from "../../core/document/translations";
import { ListMarkerView } from "./blocks/ListMarkerView";
import { clozeBlanksAsBoxes } from "../../core/document/cloze";
import { fitListMarkers } from "./blocks/listCaret";
import { playerStringsFor } from "../../core/i18n/playerStrings";
import { useEditingLanguage } from "./useEditingLanguage";
import { CodeView } from "./blocks/CodeView";
import { TexView } from "./blocks/TexView";
// Same "this is a video, not a button" watermark as the editor canvas (see BlockView.tsx) - kept
// visually consistent between the two views, per the same reasoning: it's not clickable here
// either.
import video2IconSvg from "../../../mockups/icons/video2.svg?raw";
import globeIconSvg from "../../../mockups/icons/globe.svg?raw";
import qrIconSvg from "../../../mockups/icons/code-qr.svg?raw";
import checkboxCheckedSvg from "../../../mockups/icons/checkbox-checked.svg?raw";
import checkboxUncheckedSvg from "../../../mockups/icons/checkbox-unchecked.svg?raw";
import acceptSvg from "../../../mockups/icons/accept.svg?raw";
import { tr } from "../../core/i18n/tr";
import { LinkView } from "./blocks/LinkView";
import { CheckerView } from "./blocks/CheckerView";
import { MatchingView } from "./blocks/MatchingView";
import { safeLinkUrl } from "../../core/document/linkUrl";
import { ScriptHexagon } from "./blocks/ScriptHexagon";

const THUMB_MAX_HEIGHT_PX = 150;

/**
 * A small, inert preview of a block list (a page's layout+own blocks combined, or just a
 * layout's blocks on their own) - percent-based block positions mean it needs no scale() math,
 * just a smaller container with the module's aspect ratio. Text, image, video and quiz render
 * their real content, scaled down along with everything else via the container's own cqw units -
 * cheap even with many slides, since none of it needs a network fetch or a nested browsing
 * context. Iframes are the one exception and stay icon-only placeholders: a real iframe per
 * thumbnail would be one sandboxed document per slide, which doesn't scale once a module has
 * more than a few.
 */
export function SlideThumbnail({
  blocks,
  exportPxPerCqw,
  qrSvgs,
  imageUrls,
  backdrops,
  placeholderSlots = false,
  pageId,
}: {
  blocks: Block[];
  /** The page these blocks are the picture of: a progress bar and a {{progress}} in a text then show the value `progress` has on that
   * page (see pageProgress). Without it a bar shows half and a text keeps its placeholder. */
  pageId?: string;
  /** Show the placeholders of a layout (as their sample text in a dashed frame) - for the picture of a layout itself; on a page they
   * are not part of what is shown. */
  placeholderSlots?: boolean;
  exportPxPerCqw?: number;
  /** For the PDF: the QR code (as SVG) of an iframe block's address, by block id. */
  qrSvgs?: Record<string, string>;
  /** For the PDF: the picture of an image block that has a mask or an effect as a data: address (an SVG that is drawn as a
   * picture of its own cannot reach a blob: address), by block id. */
  imageUrls?: Record<string, string>;
  /** For the PDF: the picture of what is behind a block that blurs it (backdropBlur.ts), already blurred, by block id. */
  backdrops?: Record<string, string>;
}) {
  const aspectRatio = useDocumentStore((s) => s.doc.content.aspectRatio);
  const numeric = aspectRatioNumeric(aspectRatio);
  const theme = useStageTheme();
  // (Worked out only for a picture that has something to show it with; a declared variable of the same name wins, as when played.)
  const usesProgress = !!pageId && (blocks.some((b) => b.kind === "progress") || /\{\{\s*progress\s*\}\}/.test(JSON.stringify(blocks)));
  const progress = useDocumentStore((s) =>
    usesProgress && pageId && !s.doc.content.variables.some((v) => v.name === "progress") ? pageProgress(s.doc.content, pageId) : null,
  );
  // A portrait slide at the full width of the sidebar would be a huge tower - it is capped at the
  // height a landscape one has anyway and sits narrower instead.
  const portraitCap = numeric < 1 ? { flex: "0 1 auto", width: `min(100%, ${THUMB_MAX_HEIGHT_PX * numeric}px)`, marginInline: "auto" } : undefined;

  // A picture behind letters (see richText.ts) is stored as its asset's id: given its address here.
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  const stageRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (stageRef.current) resolveInlineAssets(stageRef.current, getObjectUrl);
  });

  return (
    <div className="weft-thumb" data-weft-theme={theme["data-weft-theme"]} data-weft-style={theme["data-weft-style"]} style={{ aspectRatio: aspectRatioCss(aspectRatio), ...portraitCap, ...theme.style }}>
      <div className="weft-thumb-stage" ref={stageRef}>
        {blocks.map((block) => (
          <ThumbBlock key={block.id} block={block} exportPxPerCqw={exportPxPerCqw} qrSvg={qrSvgs?.[block.id]} imageUrl={imageUrls?.[block.id]} backdrop={backdrops?.[block.id]} placeholderSlots={placeholderSlots} progress={progress} />
        ))}
      </div>
    </div>
  );
}

/** A block, with the glass behind it if it blurs what is behind it: CSS where the browser draws it; for the PDF (where html2canvas cannot) the
 * picture of the background that was made for it, laid under the block. */
function ThumbBlock(props: ThumbBlockProps) {
  const { block, exportPxPerCqw, backdrop } = props;
  const slideAspect = useDocumentStore((s) => aspectRatioNumeric(s.doc.content.aspectRatio));
  const glass = hasBackdropBlur(block) && (backdrop || !exportPxPerCqw) && block.kind !== "text";
  const forPdf = hasBackdropBlur(block) && !!backdrop;
  let glassElement = null;
  if (glass || forPdf) {
    const position = block.position;
    const corners = block.kind === "text" ? `${block.box?.radius ?? 0}cqw` : block.kind === "shape" ? shapeCornerCss(block, slideAspect) : undefined;
    glassElement = (
      <div
        className="weft-thumb-block"
        style={{
          left: `${position.x}%`,
          top: `${position.y}%`,
          width: `${position.width}%`,
          height: `${position.height}%`,
          transform: position.rotation ? `rotate(${position.rotation}deg)` : undefined,
          borderRadius: corners,
          ...(backdrop ? { backgroundImage: `url(${backdrop})`, backgroundSize: "100% 100%" } : backdropBlurCss()),
        }}
      />
    );
  }
  return (
    <>
      {glassElement}
      <ThumbBlockBody {...props} />
    </>
  );
}

interface ThumbBlockProps {
  block: Block;
  progress: number | null;
  exportPxPerCqw?: number;
  qrSvg?: string;
  imageUrl?: string;
  backdrop?: string;
  placeholderSlots?: boolean;
}

function ThumbBlockBody({
  block,
  exportPxPerCqw,
  qrSvg,
  imageUrl,
  placeholderSlots,
  progress,
}: {
  block: Block;
  /** The value of `progress` on this page, if it is known (see SlideThumbnail's pageId). */
  progress: number | null;
  exportPxPerCqw?: number;
  qrSvg?: string;
  imageUrl?: string;
  placeholderSlots?: boolean;
}) {
  const slideAspect = useDocumentStore((s) => aspectRatioNumeric(s.doc.content.aspectRatio));
  const variables = useDocumentStore((s) => s.doc.content.variables);
  const { lang, defaultLang } = useEditingLanguage();
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  const style = {
    left: `${block.position.x}%`,
    top: `${block.position.y}%`,
    width: `${block.position.width}%`,
    height: `${block.position.height}%`,
    transform: block.position.rotation ? `rotate(${block.position.rotation}deg)` : undefined,
  };

  // A {{progress}} in a text is its value on this page (the name is matched the way the player matches it).
  const shown = (html: string) =>
    progress === null ? html : html.replace(/\{\{([^{}<>]*)\}\}/g, (all, name: string) => (name.trim() === "progress" ? String(progress) : all));

  if (block.kind === "placeholder") {
    return placeholderSlots ? (
      <div
        className="weft-thumb-block weft-thumb-block-text weft-thumb-block-placeholder-slot"
        style={style}
        dangerouslySetInnerHTML={{ __html: block.html }}
      />
    ) : null;
  }
  if (block.kind === "text") {
    return (
      <div
        className="weft-thumb-block weft-thumb-block-text"
        style={{ ...style, ...textBoxCss(block.box) }}
        dangerouslySetInnerHTML={{ __html: shown(textHtml(block, lang, defaultLang)) }}
      />
    );
  }
  if (block.kind === "cloze") {
    return (
      <div className="weft-thumb-block weft-thumb-block-cloze" style={style}>
        <div className="weft-thumb-block-cloze-text" dangerouslySetInnerHTML={{ __html: clozeBlanksAsBoxes(shown(textHtml(block, lang, defaultLang))) }} />
        <div className="weft-thumb-block-quiz-submit">
          <span className="weft-thumb-block-quiz-submit-icon" dangerouslySetInnerHTML={{ __html: acceptSvg }} />
          {playerStringsFor(lang).submit}
        </div>
      </div>
    );
  }
  if (block.kind === "list") {
    return (
      <div
        ref={(el) => {
          if (el) fitListMarkers(el, ".weft-thumb-block-list-item", ".weft-thumb-block-list-item-text");
        }}
        className="weft-thumb-block weft-thumb-block-list"
        style={{ ...style, gap: `${block.spacing}cqw` }}
      >
        {block.items.map((item, index) => (
          <div key={item.id} className="weft-thumb-block-list-item">
            <ListMarkerView block={block} index={index} />
            <span className="weft-thumb-block-list-item-text" dangerouslySetInnerHTML={{ __html: shown(listItemHtml(block, item.id, lang, defaultLang)) }} />
          </div>
        ))}
      </div>
    );
  }
  if (block.kind === "language") {
    return (
      <div className="weft-thumb-block weft-thumb-block-placeholder" style={style}>
        🌐
      </div>
    );
  }
  if (block.kind === "script") {
    return (
      <div className="weft-thumb-block" style={style}>
        <ScriptHexagon />
      </div>
    );
  }
  if (block.kind === "code") {
    return (
      <div className="weft-thumb-block weft-thumb-block-code" style={style}>
        <CodeView block={block} editable={false} />
      </div>
    );
  }
  if (block.kind === "tex") {
    return (
      <div className="weft-thumb-block weft-thumb-block-tex" style={style}>
        <TexView tex={block.tex} color={block.color} />
      </div>
    );
  }
  if (block.kind === "image" && block.assetId && (block.mask || block.effect)) {
    return (
      <div className="weft-thumb-block weft-thumb-block-shape" style={style}>
        <ImageSvg block={block} src={imageUrl ?? getObjectUrl(block.assetId) ?? ""} />
      </div>
    );
  }
  if (block.kind === "image") {
    return block.assetId ? (
      <img className="weft-thumb-block" style={style} src={getObjectUrl(block.assetId)} alt="" draggable={false} />
    ) : (
      <div className="weft-thumb-block weft-thumb-block-placeholder" style={style} />
    );
  }
  if (block.kind === "video") {
    return block.assetId ? (
      <div className="weft-thumb-block weft-thumb-block-video-wrap" style={style}>
        <video src={getObjectUrl(block.assetId)} className="weft-thumb-block-video" muted playsInline />
        <div className="weft-thumb-block-video-icon" dangerouslySetInnerHTML={{ __html: video2IconSvg }} />
      </div>
    ) : (
      <div className="weft-thumb-block weft-thumb-block-placeholder" style={style} />
    );
  }
  if (block.kind === "progress") {
    const declared = variables.find((v) => v.name === block.variable);
    const initial = declared && declared.type === "number" ? Number(declared.initialValue) : NaN;
    const known = Number.isFinite(initial) ? initial : (block.variable || "progress") === "progress" && progress !== null ? progress : 50;
    const fill = Math.min(100, Math.max(0, known));
    return (
      <div className={"weft-thumb-block weft-thumb-block-progress" + (block.rounded ? " is-rounded" : "")} style={{ ...style, background: block.trackColor }}>
        <div style={{ width: `${fill}%`, height: "100%", background: block.color }} />
      </div>
    );
  }
  if (block.kind === "revealer") {
    return (
      <div
        className="weft-thumb-block weft-thumb-block-revealer"
        style={style}
        dangerouslySetInnerHTML={{ __html: revealerIconSvg(block.icon, block.color) }}
      />
    );
  }
  if (block.kind === "audio") {
    // Only a sound with a player has anything to see: a bar.
    return block.assetId && block.appearance === "player" ? (
      <div className="weft-thumb-block weft-thumb-block-audio" style={style} />
    ) : null;
  }
  if (block.kind === "iframe" && exportPxPerCqw && block.url) {
    // In the PDF an embedded page can't be what it is on the screen (it is live, and from another origin: no picture of it can be
    // taken): a card with its address as text and QR code - and the address is a link there (data-pdf-link, see exportPdf.tsx).
    return (
      <div className="weft-thumb-block weft-thumb-block-iframe-export" style={style} data-pdf-link={block.url}>
        {qrSvg && <div className="weft-thumb-block-iframe-export-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />}
        <div className="weft-thumb-block-iframe-export-text">
          <span className="weft-thumb-block-iframe-export-label">{tr("ui.embedded_page")}</span>
          <span className="weft-thumb-block-iframe-export-url">{block.url}</span>
        </div>
      </div>
    );
  }
  if (block.kind === "iframe") {
    return (
      <div className="weft-thumb-block weft-thumb-block-placeholder" style={style}>
        <span className="weft-thumb-icon" dangerouslySetInnerHTML={{ __html: block.qrCode ? qrIconSvg : globeIconSvg }} />
      </div>
    );
  }
  if (block.kind === "shape") {
    if (exportPxPerCqw && block.shadow.enabled) {
      // For the PDF: the shadow is drawn into a larger picture around the shape (see ShapeSvg's exportPxPerCqw).
      const bleed = block.shadow.blur + Math.max(Math.abs(block.shadow.offsetX), Math.abs(block.shadow.offsetY)) + 0.5;
      const bleedY = bleed * slideAspect;
      const bigStyle = {
        ...style,
        left: `${block.position.x - bleed}%`,
        top: `${block.position.y - bleedY}%`,
        width: `${block.position.width + 2 * bleed}%`,
        height: `${block.position.height + 2 * bleedY}%`,
      };
      return (
        <div className="weft-thumb-block weft-thumb-block-shape" style={bigStyle}>
          <ShapeSvg block={block} exportPxPerCqw={exportPxPerCqw} bleedCqw={bleed} />
        </div>
      );
    }
    return (
      <div className="weft-thumb-block weft-thumb-block-shape" style={style}>
        <ShapeSvg block={block} exportPxPerCqw={exportPxPerCqw} />
      </div>
    );
  }
  if (block.kind === "files") {
    return (
      <div className="weft-thumb-block" style={style}>
        <FilesView block={block} />
      </div>
    );
  }
  if (block.kind === "arrow") {
    return (
      <div className="weft-thumb-block weft-thumb-block-shape" style={style}>
        <ArrowSvg block={block} exportPxPerCqw={exportPxPerCqw} />
      </div>
    );
  }
  if (block.kind === "button") {
    return (
      <div className="weft-thumb-block weft-thumb-block-button" style={{ ...style, ...buttonAppearanceCss(block) }}>
        {buttonText(block, lang, defaultLang).trim() ? (
          <span className="weft-thumb-block-button-text" dangerouslySetInnerHTML={{ __html: shown(buttonHtml(block, lang, defaultLang)) }} />
        ) : (
          playerStringsFor(lang).next
        )}
      </div>
    );
  }
  if (block.kind === "link") {
    // (In the PDF a link is a link: where it stands in the picture, the address is clickable - see exportPdf.tsx.)
    const address = safeLinkUrl(block.url);
    return (
      <div className="weft-thumb-block weft-thumb-block-link" style={style} {...(address ? { "data-pdf-link": address } : {})}>
        <LinkView block={block} lang={lang} defaultLang={defaultLang} />
      </div>
    );
  }
  if (block.kind === "matching") {
    return (
      <div className="weft-thumb-block" style={style}>
        <MatchingView block={block} lang={lang} defaultLang={defaultLang} />
      </div>
    );
  }
  if (block.kind === "checker") {
    return (
      <div className="weft-thumb-block" style={style}>
        <CheckerView block={block} lang={lang} defaultLang={defaultLang} />
      </div>
    );
  }
  if (block.kind === "quiz") {
    // Same card layout, em-for-em, as the editor canvas (BlockView.tsx's .weft-edit-block-quiz*)
    // and the real player (player.runtime.js/.css's .weft-quiz*) - all three share the same
    // 1.7cqw block base size, so keeping the numbers in sync here too is what makes a quiz take
    // up the same proportion of its box everywhere, not just a smaller/blurrier version of a
    // differently-laid-out preview.
    return (
      <div className="weft-thumb-block weft-thumb-block-quiz" style={style}>
        <div className="weft-thumb-block-quiz-question" dangerouslySetInnerHTML={{ __html: shown(quizQuestionHtml(block, lang, defaultLang)) }} />
        <div className="weft-thumb-block-quiz-options">
          {block.options.map((opt) => {
            // (A PDF does not give away the answers: nothing is marked there, as when a learner starts the quiz.)
            const isCorrect = !exportPxPerCqw && !block.open && block.correctOptionIds.includes(opt.id);
            return (
              <div key={opt.id} className={"weft-thumb-block-quiz-option" + (isCorrect ? " is-correct" : "")}>
                <span
                  className="weft-thumb-block-quiz-option-checkbox"
                  dangerouslySetInnerHTML={{ __html: isCorrect ? checkboxCheckedSvg : checkboxUncheckedSvg }}
                />
                <span className="weft-thumb-block-quiz-option-text" dangerouslySetInnerHTML={{ __html: shown(quizOptionHtml(block, opt.id, lang, defaultLang)) }} />
              </div>
            );
          })}
        </div>
        <div className="weft-thumb-block-quiz-submit">
          <span className="weft-thumb-block-quiz-submit-icon" dangerouslySetInnerHTML={{ __html: acceptSvg }} />
          {playerStringsFor(lang).submit}
        </div>
      </div>
    );
  }
  return null;
}
