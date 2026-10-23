import type { LinkIcon } from "../types";

/** The icons a link can have, in the order they are offered (not "none"). */
export const LINK_ICONS: Exclude<LinkIcon, "none">[];

/** The SVG of a link's icon (one em square, in the colour of the text around it); "" for "none". */
export function linkIconSvg(icon: LinkIcon): string;
