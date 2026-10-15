import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "../io/fileIO";

/**
 * The eyedropper: a colour from anywhere on the screen. Two routes, whichever the platform has:
 *  - "native": the Mac app asks the system's own colour sampler (src-tauri/src/color_sampler.rs) - a WKWebView has no web API for it;
 *  - "web": the `EyeDropper` of Chromium-based web views (Windows' WebView2, Chrome, Edge).
 * Nowhere else (the iPad, a web view of Safari or Firefox) there is none - then the button is not shown.
 */
export type ScreenColorRoute = "native" | "web" | null;

interface EyeDropperApi {
  open(options?: { signal?: AbortSignal }): Promise<{ sRGBHex: string }>;
}
declare global {
  interface Window {
    EyeDropper?: new () => EyeDropperApi;
  }
}

let routePromise: Promise<ScreenColorRoute> | null = null;

export function screenColorRoute(): Promise<ScreenColorRoute> {
  routePromise ??= (async (): Promise<ScreenColorRoute> => {
    if (isTauri()) {
      try {
        if (await invoke<boolean>("screen_color_picker_available")) return "native";
      } catch {
        // An older shell without the command: fall through to the web API.
      }
    }
    return typeof window !== "undefined" && typeof window.EyeDropper === "function" ? "web" : null;
  })();
  return routePromise;
}

/** "#rrggbb" of what the person clicked, or null when they cancelled or nothing is available. */
export async function pickScreenColor(): Promise<string | null> {
  const route = await screenColorRoute();
  try {
    if (route === "native") return (await invoke<string | null>("pick_screen_color")) ?? null;
    if (route === "web" && window.EyeDropper) return (await new window.EyeDropper().open()).sRGBHex.toLowerCase();
  } catch {
    // Esc in the web API rejects - the same as cancelling.
  }
  return null;
}
