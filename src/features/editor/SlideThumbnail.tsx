import { useLayoutEffect, useRef } from "react";
import { aspectRatioCss, aspectRatioNumeric } from "../../core/aspectRatio";
import { buttonAppearanceCss } from "../../core/document/buttonAppearance";
import { resolveInlineAssets } from "./blocks/richText";
import { useAssetStore } from "../../core/assets/assetStore";
import { useDocumentStore } from "../../core/document/store";
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
}: {
  blocks: Block[];
  exportPxPerCqw?: number;
  /** For the PDF: the QR code (as SVG) of an iframe block's address, by block id. */
  qrSvgs?: Record<string, string>;
  /** For the PDF: the picture of an image block that has a mask or an effect as a data: address (an SVG that is drawn as a
   * picture of its own cannot reach a blob: address), by block id. */
  imageUrls?: Record<string, string>;
}) {
  const aspectRatio = useDocumentStore((s) => s.doc.content.aspectRatio);
  const numeric = aspectRatioNumeric(aspectRatio);
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
    <div className="weft-thumb" style={{ aspectRatio: aspectRatioCss(aspectRatio), ...portraitCap }}>
      <div className="weft-thumb-stage" ref={stageRef}>
        {blocks.map((block) => (
          <ThumbBlock key={block.id} block={block} exportPxPerCqw={exportPxPerCqw} qrSvg={qrSvgs?.[block.id]} imageUrl={imageUrls?.[block.id]} />
        ))}
      </div>
    </div>
  );
}

function ThumbBlock({ block, exportPxPerCqw, qrSvg, imageUrl }: { block: Block; exportPxPerCqw?: number; qrSvg?: string; imageUrl?: string }) {
  const slideAspect = useDocumentStore((s) => aspectRatioNumeric(s.doc.content.aspectRatio));
  const { lang, defaultLang } = useEditingLanguage();
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  const style = {
    left: `${block.position.x}%`,
    top: `${block.position.y}%`,
    width: `${block.position.width}%`,
    height: `${block.position.height}%`,
    transform: block.position.rotation ? `rotate(${block.position.rotation}deg)` : undefined,
  };

  if (block.kind === "text") {
    return <div className="weft-thumb-block weft-thumb-block-text" style={style} dangerouslySetInnerHTML={{ __html: textHtml(block, lang, defaultLang) }} />;
  }
  if (block.kind === "cloze") {
    return (
      <div className="weft-thumb-block weft-thumb-block-cloze" style={style}>
        <div className="weft-thumb-block-cloze-text" dangerouslySetInnerHTML={{ __html: clozeBlanksAsBoxes(textHtml(block, lang, defaultLang)) }} />
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
            <span className="weft-thumb-block-list-item-text" dangerouslySetInnerHTML={{ __html: listItemHtml(block, item.id, lang, defaultLang) }} />
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
  if (block.kind === "iframe" && exportPxPerCqw && block.url) {
    // In the PDF an embedded page can't be what it is on the screen (it is live, and from another origin: no picture of it can be
    // taken): a card with its address as text and QR code - and the address is a link there (data-pdf-link, see exportPdf.tsx).
    return (
      <div className="weft-thumb-block weft-thumb-block-iframe-export" style={style} data-pdf-link={block.url}>
        {qrSvg && <div className="weft-thumb-block-iframe-export-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />}
        <div className="weft-thumb-block-iframe-export-text">
          <span className="weft-thumb-block-iframe-export-label">Eingebettete Seite</span>
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
          <span className="weft-thumb-block-button-text" dangerouslySetInnerHTML={{ __html: buttonHtml(block, lang, defaultLang) }} />
        ) : (
          playerStringsFor(lang).next
        )}
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
        <div className="weft-thumb-block-quiz-question" dangerouslySetInnerHTML={{ __html: quizQuestionHtml(block, lang, defaultLang) }} />
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
                <span className="weft-thumb-block-quiz-option-text" dangerouslySetInnerHTML={{ __html: quizOptionHtml(block, opt.id, lang, defaultLang) }} />
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
