import { ASPECT_RATIO_CSS } from "../../core/aspectRatio";
import { useAssetStore } from "../../core/assets/assetStore";
import { useDocumentStore } from "../../core/document/store";
import type { Block } from "../../core/types";

/**
 * A small, inert preview of a block list (a page's layout+own blocks combined, or just a
 * layout's blocks on their own) - percent-based block positions mean it needs no scale() math,
 * just a smaller container with the module's aspect ratio. Iframes and quizzes render as
 * placeholders rather than live content: a real iframe per thumbnail would be one sandboxed
 * document per slide, which doesn't scale once a module has more than a few.
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
  if (block.kind === "iframe") {
    return (
      <div className="weft-thumb-block weft-thumb-block-placeholder" style={style}>
        ▶
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
  return (
    <div className="weft-thumb-block weft-thumb-block-placeholder" style={style}>
      ?
    </div>
  );
}
