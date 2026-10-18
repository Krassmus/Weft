import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Block } from "../../core/types";
import { BlockKindIcon } from "./BlockKindIcon";
import pauseIconSvg from "../../../mockups/icons/pause.svg?raw";
import animationIconSvgRaw from "../../../mockups/icons/animation.svg?raw";
import pinIconSvgRaw from "../../../mockups/icons/pin.svg?raw";

// The animation symbol has its blue as an inline style, which the colour of the event (see .weft-timeline-node-icon in App.css) does
// not override.
const animationIconSvg = animationIconSvgRaw.replace(/style="fill:rgb\([^)]*\);/, 'style="');

// The pin has an invisible square as its first shape; the icons are all drawn in the colour of their event, which would make that
// square visible.
const pinIconSvg = pinIconSvgRaw.replace(/<path fill="none"[^>]*\/>/, "");

/** The icon of a time mark of a video: if elements appear there, the icon of their kind (when all are of the same kind) or the animation
 * symbol (when they are of several kinds) - the author sees that something happens and what; else a pause if the video stops there,
 * else a pin - a pause would promise something the video does not do. Used by the graph and by the dialog that sets the marks. */
export function stopPointIconSvg(stopsVideo: boolean, shownKinds: readonly Block["kind"][] = []): string {
  if (shownKinds.length === 1) return kindIconSvg(shownKinds[0]);
  if (shownKinds.length > 1) return animationIconSvg;
  return stopsVideo ? pauseIconSvg : pinIconSvg;
}

const kindIconCache = new Map<Block["kind"], string>();
function kindIconSvg(kind: Block["kind"]): string {
  let svg = kindIconCache.get(kind);
  if (svg === undefined) {
    svg = renderToStaticMarkup(createElement(BlockKindIcon, { kind, size: 12 }));
    kindIconCache.set(kind, svg);
  }
  return svg;
}
