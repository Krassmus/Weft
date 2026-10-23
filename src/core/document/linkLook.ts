import type { LinkBlock } from "../types";

const mix = (color: string, opacity: number) => `color-mix(in srgb, ${color} ${Math.round(Math.max(0, Math.min(1, opacity)) * 100)}%, transparent)`;

/** The look of a link as CSS (the editor's canvas and the thumbnails; player.runtime.js writes the same by hand in linkStyle: keep them in step). */
export function linkCss(block: LinkBlock): { fontSize: string; color?: string; background?: string; borderRadius?: string } {
  return {
    fontSize: `${block.fontSize}cqw`,
    ...(block.color ? { color: block.color } : {}),
    ...(block.background ? { background: mix(block.background, block.backgroundOpacity), borderRadius: `${block.radius}cqw` } : {}),
  };
}
