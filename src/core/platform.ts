import { isTauri } from "./io/fileIO";

/** Whether the main input is a finger (a tablet) rather than a mouse - no hover, no right click. */
export function isTouchDevice(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
}

/** Whether the app has a menu bar of its own (the desktop app: src-tauri/src/lib.rs). Without one - in a browser, and on
 * a tablet - the File menu, undo and redo are in the app itself (features/editor/FileMenu.tsx). */
export function hasNativeMenu(): boolean {
  return isTauri() && !isTouchDevice();
}
