import { ASPECT_RATIO_CSS } from "../../core/aspectRatio";
import { useAssetStore } from "../../core/assets/assetStore";
import { useDocumentStore } from "../../core/document/store";
import type { Block } from "../../core/types";
// Same "this is a video, not a button" watermark as the editor canvas (see BlockView.tsx) - kept
// visually consistent between the two views, per the same reasoning: it's not clickable here
// either.
import video2IconSvg from "../../../mockups/icons/video2.svg?raw";
import globeIconSvg from "../../../mockups/icons/globe.svg?raw";
import qrIconSvg from "../../../mockups/icons/code-qr.svg?raw";

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
export function SlideThumbnail({ blocks }: { blocks: Block[] }) {
  const aspectRatio = useDocumentStore((s) => s.doc.content.aspectRatio);

  return (
    <div className="weft-thumb" style={{ aspectRatio: ASPECT_RATIO_CSS[aspectRatio] }}>
      <div className="weft-thumb-stage">
        {blocks.map((block) => (
          <ThumbBlock key={block.id} block={block} />
        ))}
      </div>
    </div>
  );
}

function ThumbBlock({ block }: { block: Block }) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  const style = {
    left: `${block.position.x}%`,
    top: `${block.position.y}%`,
    width: `${block.position.width}%`,
    height: `${block.position.height}%`,
  };

  if (block.kind === "text") {
    return <div className="weft-thumb-block weft-thumb-block-text" style={style} dangerouslySetInnerHTML={{ __html: block.html }} />;
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
  if (block.kind === "iframe") {
    return (
      <div className="weft-thumb-block weft-thumb-block-placeholder" style={style}>
        <span className="weft-thumb-icon" dangerouslySetInnerHTML={{ __html: block.qrCode ? qrIconSvg : globeIconSvg }} />
      </div>
    );
  }
  if (block.kind === "button") {
    return (
      <div className="weft-thumb-block weft-thumb-block-button" style={style}>
        {block.text || "Weiter"}
      </div>
    );
  }
  if (block.kind === "quiz") {
    return (
      <div className="weft-thumb-block weft-thumb-block-quiz" style={style}>
        <strong>{block.question || "(Frage)"}</strong>
        <ul>
          {block.options.map((opt) => (
            <li key={opt.id} className={block.correctOptionIds.includes(opt.id) ? "is-correct" : ""}>
              {opt.text}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return null;
}
