import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTouchDevice } from "../platform";

/**
 * The DOM Fullscreen API (`Element.requestFullscreen`) is unreliable inside Tauri's WKWebView -
 * on macOS the generic (non-<video>) element-fullscreen path has known bugs/private-API gaps, so
 * in practice it just silently does nothing. Inside Tauri we instead drive the native window's
 * own fullscreen state via the Rust-backed window API; the DOM API remains the fallback for
 * plain `npm run dev` in a regular browser tab, where it works fine.
 */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// A tablet app fills the screen anyway - there is no window to put into full screen (and asking Tauri to fails there).
export async function enterFullscreenPreview(): Promise<void> {
  if (isTouchDevice()) return;
  if (isTauriRuntime()) {
    await getCurrentWindow().setFullscreen(true).catch(() => undefined);
    return;
  }
  try {
    // Fullscreens the whole tab rather than a specific element: React swaps the entire shell
    // out for the presentation view anyway, so there is nothing else worth keeping on screen.
    await document.documentElement.requestFullscreen?.();
  } catch {
    // Fullscreen can be refused (no user gesture, embedded context, ...) - the presentation view
    // still shows full-viewport via CSS, which is a reasonable fallback rather than a hard failure.
  }
}

export async function exitFullscreenPreview(): Promise<void> {
  if (isTouchDevice()) return;
  if (isTauriRuntime()) {
    await getCurrentWindow().setFullscreen(false).catch(() => undefined);
    return;
  }
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
}

/**
 * Notifies `onExit` whenever fullscreen is exited from outside our own controls (Escape, the
 * native macOS green-button/menu toggle, ...). Returns a cleanup function.
 */
export function watchFullscreenExit(onExit: () => void): () => void {
  // (A tablet has no full screen to leave - and its window "resizing" is turning the device or a keyboard, not that.)
  if (isTouchDevice()) return () => {};
  if (isTauriRuntime()) {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onResized(async () => {
        if (cancelled) return;
        const fullscreen = await getCurrentWindow().isFullscreen();
        if (!fullscreen) onExit();
      })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }

  function onFullscreenChange() {
    if (!document.fullscreenElement) onExit();
  }
  document.addEventListener("fullscreenchange", onFullscreenChange);
  return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
}
