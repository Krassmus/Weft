import { getCurrentWindow } from "@tauri-apps/api/window";
import { ErrorBoundary } from "./ErrorBoundary";
import { EditorShell } from "./features/editor/EditorShell";
import { SettingsWindow } from "./features/settings/SettingsWindow";
import "./fonts.css";
import "./App.css";

/** The settings window (see src-tauri/src/lib.rs's "weft-settings" menu handler) loads this
 * exact same bundle in its own webview, distinguished only by its window label - there's no
 * router, so this is the one place that decides which top-level screen to render. Wrapped in
 * try/catch since getCurrentWindow() assumes a real Tauri runtime; outside one (the plain
 * browser dev preview) it throws rather than returning something falsy, so this just falls back
 * to the normal editor there. */
function isSettingsWindow(): boolean {
  try {
    return getCurrentWindow().label === "settings";
  } catch {
    return false;
  }
}

export default function App() {
  return <ErrorBoundary>{isSettingsWindow() ? <SettingsWindow /> : <EditorShell />}</ErrorBoundary>;
}
