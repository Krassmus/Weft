import pauseIconSvg from "../../../mockups/icons/pause.svg?raw";
import pinIconSvgRaw from "../../../mockups/icons/pin.svg?raw";

// The pin has an invisible square as its first shape; the icons are all drawn in the colour of their event (see
// .weft-timeline-node-icon in App.css), which would make that square visible.
const pinIconSvg = pinIconSvgRaw.replace(/<path fill="none"[^>]*\/>/, "");

/** The icon of a time mark of a video: a pause if the video stops there, else a pin - a pause would promise something the video
 * does not do. Used by the graph and by the dialog that sets the marks. */
export function stopPointIconSvg(stopsVideo: boolean): string {
  return stopsVideo ? pauseIconSvg : pinIconSvg;
}
