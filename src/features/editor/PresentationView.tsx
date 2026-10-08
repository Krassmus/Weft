import { useEffect } from "react";
import { useDocumentStore } from "../../core/document/store";
import { exitFullscreenPreview } from "../../core/window/fullscreen";
import { PreviewFrame } from "./PreviewFrame";

/**
 * The Keynote-style "present" screen: full-viewport, nothing but the running module. No
 * sidebar, inspector or editing controls - Escape (or the small corner button, for touch
 * devices with no Escape key) is the only way out.
 */
export function PresentationView({
  startPageId,
  onExit,
}: {
  /** Which page to open on - whatever was selected when "Abspielen" was clicked (see
   * Canvas.tsx/EditorShell.tsx), or null to start from the module's actual beginning like a real
   * learner would. */
  startPageId: string | null;
  onExit: () => void;
}) {
  const content = useDocumentStore((s) => s.doc.content);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") void handleExit();
    }
    // The preview iframe holds keyboard focus (see PreviewFrame's onLoad) so its own module
    // content can receive Space/arrow-key navigation - which means a keydown for Escape fires
    // inside the iframe's own document and never reaches this listener at all. The runtime posts
    // it across the sandbox boundary instead (postMessage works even without allow-same-origin).
    function onMessage(e: MessageEvent) {
      if (e.data && e.data.source === "weft-module" && e.data.type === "exit-presentation") void handleExit();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("message", onMessage);
    };
  }, []);

  async function handleExit() {
    // Leaving the presentation must never depend on leaving full screen having worked.
    try {
      await exitFullscreenPreview();
    } finally {
      onExit();
    }
  }

  return (
    <div className="weft-presentation">
      <button type="button" className="weft-presentation-exit" onClick={() => void handleExit()} title="Vorschau beenden (Esc)">
        ✕
      </button>
      <PreviewFrame module={content} startPageId={startPageId} />
    </div>
  );
}
