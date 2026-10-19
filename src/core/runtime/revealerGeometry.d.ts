import type { RevealerBlock } from "../types";

/** The colour of a sign on `fill` that stands out most from it: "#000000" or "#ffffff" (see revealerGeometry.js). */
export function revealerSignColor(fill: string): "#000000" | "#ffffff";

/** The SVG of a Revealer's icon in the colour `fill`, with a sign on it that stands out from that colour. */
export function revealerIconSvg(icon: RevealerBlock["icon"], fill: string): string;
