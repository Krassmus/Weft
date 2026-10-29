import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ErrorBoundary } from "./ErrorBoundary";
import { EditorShell } from "./features/editor/EditorShell";
import { SettingsWindow } from "./features/settings/SettingsWindow";
import { AudienceView } from "./features/presenter/AudienceView";
import { StatusLiveRegion } from "./features/editor/StatusLiveRegion";
import { OpeningBar } from "./features/editor/OpeningBar";
import { useResolvedLanguage } from "./core/i18n/languageStore";
import "./core/accessibility/accessibilityStore";
import "./features/editor/coverSnapshot";
import "./fonts.css";
import "./core/runtime/stageTheme.css";
import "./core/runtime/quizCard.css";
import "./core/blocks/iframe/render.css";
import "./core/blocks/link/render.css";
import "./core/blocks/progress/render.css";
import "./core/blocks/language/render.css";
import "./core/blocks/checker/render.css";
import "./core/blocks/button/render.css";
import "./core/blocks/text/render.css";
import "./core/blocks/list/render.css";
import "./core/blocks/cloze/render.css";
import "./core/blocks/revealer/render.css";
import "./core/blocks/matching/render.css";
import "./core/blocks/sort/render.css";
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
    // No Tauri runtime (a plain browser): the same screen is reachable as /?settings.
    return new URLSearchParams(window.location.search).has("settings");
  }
}

/** The window for the beamer of the presenter view (see src-tauri/src/lib.rs's open_audience_window): same bundle, own label. */
function isAudienceWindow(): boolean {
  try {
    return getCurrentWindow().label === "audience";
  } catch {
    // No Tauri runtime (a browser tab, the development preview): /?audience.
    return new URLSearchParams(window.location.search).has("audience");
  }
}

/** The language of the interface is the language of the page for a screen reader (which picks its voice by it). */
function DocumentLanguage() {
  const language = useResolvedLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <DocumentLanguage />
      {isSettingsWindow() ? <SettingsWindow /> : isAudienceWindow() ? <AudienceView /> : <EditorShell />}
      <StatusLiveRegion />
      <OpeningBar />
    </ErrorBoundary>
  );
}
