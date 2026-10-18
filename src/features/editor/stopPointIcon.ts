import pauseIconSvg from "../../../mockups/icons/pause.svg?raw";
import animationIconSvgRaw from "../../../mockups/icons/animation.svg?raw";
import pinIconSvgRaw from "../../../mockups/icons/pin.svg?raw";

// The animation symbol has its blue as an inline style, which the colour of the event (see .weft-timeline-node-icon in App.css) does
// not override.
const animationIconSvg = animationIconSvgRaw.replace(/style="fill:rgb\([^)]*\);/, 'style="');

// The pin has an invisible square as its first shape; the icons are all drawn in the colour of their event, which would make that
// square visible.
const pinIconSvg = pinIconSvgRaw.replace(/<path fill="none"[^>]*\/>/, "");

/** The icon of a time mark of a video: the animation symbol if something appears there (the author sees that something happens), else a
 * pause if the video stops there, else a pin - a pause would promise something the video does not do. Used by the graph and by the
 * dialog that sets the marks. */
export function stopPointIconSvg(stopsVideo: boolean, showsSomething = false): string {
  if (showsSomething) return animationIconSvg;
  return stopsVideo ? pauseIconSvg : pinIconSvg;
}
