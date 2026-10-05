import { useLayoutEffect, useMemo, useRef } from "react";
import { renderTexToHtml } from "../../../core/tex/renderTex";

/**
 * A rendered TeX formula, scaled to fit (contain, centered) whatever box it's put in - same idea
 * as an image's object-fit: contain, so resizing the block resizes the formula. The formula is
 * laid out once at its natural size (.weft-tex-inner, see App.css) and then only transformed,
 * never re-typeset. player.runtime.js mirrors this by hand (fitTexBlock) - keep the two in sync.
 */
export function TexView({ tex, color }: { tex: string; color?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const html = useMemo(() => (tex.trim() ? renderTexToHtml(tex) : ""), [tex]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const inner = innerRef.current;
    if (!box || !inner) return;
    function fit() {
      const boxWidth = box!.clientWidth;
      const boxHeight = box!.clientHeight;
      const width = inner!.offsetWidth;
      const height = inner!.offsetHeight;
      if (!width || !height || !boxWidth || !boxHeight) return;
      const scale = Math.min(boxWidth / width, boxHeight / height);
      const x = (boxWidth - width * scale) / 2;
      const y = (boxHeight - height * scale) / 2;
      inner!.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      inner!.style.visibility = "inherit";
    }
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    // KaTeX's own fonts load lazily, and the formula's natural size changes once they arrive -
    // without watching it too, the first fit (made against fallback-font metrics) would stay.
    observer.observe(inner);
    return () => observer.disconnect();
  }, [html]);

  if (!html) return <div className="weft-edit-block-placeholder">Formel eingeben …</div>;
  return (
    <div ref={boxRef} className="weft-tex" style={color ? { color } : undefined}>
      <div ref={innerRef} className="weft-tex-inner" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
