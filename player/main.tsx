import React, { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "../src/ErrorBoundary";
import { useResolvedLanguage } from "../src/core/i18n/languageStore";
import { initLibrary } from "../src/core/io/library";
import { runsInTauri } from "../src/core/platform";
import { PlayerApp } from "./PlayerApp";
import "./player.css";

// Outside the app (this page in a browser while it is being worked on) there is no disk: the library is one in memory (see libraryDemo in core/platform.ts).
if (!runsInTauri()) {
  try {
    localStorage.setItem("weft:libraryDemo", "1");
  } catch {
    // no storage: the library then simply is the real one, which does not exist here
  }
}

/** The language of the phone is the language of the page for a screen reader (which picks its voice by it). */
function DocumentLanguage() {
  const language = useResolvedLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return null;
}

// The library (the Documents folder of the app) has to be found before anything reads from it - so the app is only shown after that.
void initLibrary()
  .catch((error) => console.error("The library is not available:", error))
  .finally(() => {
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <ErrorBoundary>
          <DocumentLanguage />
          <PlayerApp />
        </ErrorBoundary>
      </React.StrictMode>,
    );
  });

// The phone: the page is to use the whole screen, down to the home indicator - the native side has to switch something off for that and make WebKit lay the
// page out again (see `full_screen` in src-tauri/src/lib.rs). Once the page is running, and again after the phone was turned.
if (runsInTauri()) {
  const fillScreen = () => void invoke("full_screen").catch(() => undefined);
  fillScreen();
  const afterTurn = () => window.setTimeout(fillScreen, 300);
  window.addEventListener("orientationchange", afterTurn);
  screen.orientation?.addEventListener("change", afterTurn);
}
