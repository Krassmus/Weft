/** Whether this is the Tauri app (desktop or tablet) rather than a plain browser. Kept here, free of other imports, so
 * everything may ask. */
export function runsInTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let tablet: boolean | null = null;

/**
 * Whether this is a tablet (a finger rather than a mouse - no hover, no right click). Decided once, from what the device is
 * (an iPad calls itself a Mac, but a Mac has no touch screen) and not from the pointer media query, which can change while the
 * app runs - a trackpad attached to an iPad - and would switch the app between its two ways of keeping files in the middle of
 * a session.
 */
export function isTouchDevice(): boolean {
  if (tablet === null) {
    if (typeof navigator === "undefined") return false;
    const ipadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    const handheld = /iPad|iPhone|Android/.test(navigator.userAgent);
    const coarse = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    tablet = ipadOs || handheld || coarse;
  }
  return tablet;
}

/** Whether the app has a menu bar of its own (the desktop app: src-tauri/src/lib.rs). Without one - in a browser, and on
 * a tablet - the File menu, undo and redo are in the app itself (features/editor/FileMenu.tsx). */
export function hasNativeMenu(): boolean {
  return runsInTauri() && !isTouchDevice();
}

/** Only for trying the library in a browser (it has no files of its own): `localStorage["weft:libraryDemo"] = "1"` makes
 * it behave like the tablet app, on an in-memory "disk" (see MemoryLibraryFs in core/io/library.ts). */
export function libraryDemo(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("weft:libraryDemo") === "1";
  } catch {
    return false;
  }
}

/**
 * Whether Weft keeps the modules in a library of its own, in the app's Documents folder (see core/io/library.ts), instead of
 * opening and saving files wherever the user's dialogs point: on a tablet. There an app can neither write back to a file it
 * was handed (it gets a copy) nor save to a place of its own choosing, so every module lives in the library from the moment
 * it exists, is saved there continuously, and goes out of the app by sharing a copy.
 */
export function libraryMode(): boolean {
  return (runsInTauri() && isTouchDevice()) || libraryDemo();
}
