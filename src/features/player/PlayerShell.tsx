import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { isTouchDevice } from "../../core/platform";
import { enterFullscreenPreview, exitFullscreenPreview, watchFullscreenExit } from "../../core/window/fullscreen";
import { withPlayerChrome } from "../../core/io/playerFile";
import type { PlayerFile } from "../../core/io/playerFile";
import { ModuleFrame } from "../editor/ModuleFrame";
import { tr } from "../../core/i18n/tr";

/** The signs of the buttons in the bar - drawn, not typed: a letter sits where the font puts it (a little low), a drawing exactly in the middle of its button. */
function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  );
}
const ICON_CLOSE = "M3 3 L13 13 M13 3 L3 13";
const ICON_FULL_SCREEN = "M9.5 2.5 H13.5 V6.5 M13.5 2.5 L9 7 M6.5 13.5 H2.5 V9.5 M2.5 13.5 L7 9";
const ICON_LEAVE_FULL_SCREEN = "M13 6 H10 V3 M10 6 L14 2 M3 10 H6 V13 M6 10 L2 14";

/**
 * What Weft shows for a player file (see exportPlayerFile in core/io/fileIO.ts): none of the editor, just the
 * module on its first page in a wide black frame, and a button in the black border for full screen. The
 * file's page plays exactly as it does in a browser. A button leads back to the start screen (and so to other files).
 */
export function PlayerShell({ file, menu, onStart }: { file: PlayerFile; menu?: ReactNode; onStart?: () => void }) {
  const [fullscreen, setFullscreen] = useState(false);
  const fullscreenRef = useRef(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => withPlayerChrome(file.html), [file.html]);
  fullscreenRef.current = fullscreen;

  // Full screen left by other means (Escape, the window's own button) - the button follows.
  useEffect(() => watchFullscreenExit(() => setFullscreen(false)), []);
  // Escape inside the frame doesn't reach this window; the module posts it across (see player.runtime.js).
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data && e.data.source === "weft-module" && e.data.type === "exit-presentation" && fullscreenRef.current) void toggleFullscreen();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  // The slide's rounded corners go in full screen: there it is to be as big as the screen allows.
  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage({ source: "weft-host", type: "stage-radius", value: fullscreen ? "0px" : "14px" }, "*");
  }, [fullscreen]);
  // Leaving to the editor (or another file) must not leave the window in full screen.
  useEffect(() => () => void exitFullscreenPreview(), []);

  async function toggleFullscreen() {
    if (fullscreenRef.current) {
      setFullscreen(false);
      await exitFullscreenPreview();
    } else {
      setFullscreen(true);
      await enterFullscreenPreview();
    }
  }

  return (
    <div className={"weft-player-shell" + (fullscreen ? " is-fullscreen" : "")}>
      <div className="weft-player-bar">
        {/* `menu` (the File menu) is optional and not used by the app at present. */}
        {menu && <div className="weft-player-menu">{menu}</div>}
        {!isTouchDevice() && (
        <button type="button" className="weft-player-fullscreen" onClick={() => void toggleFullscreen()} title={fullscreen ? tr("ui.exit_full_screen_esc") : tr("ui.full_screen")}>
          <Icon path={fullscreen ? ICON_LEAVE_FULL_SCREEN : ICON_FULL_SCREEN} />
        </button>
        )}
        {/* The way back to the start screen (and so to other files): a cross in the corner, as for any window that is closed. */}
        {onStart && (
          <button type="button" className="weft-player-fullscreen weft-player-close" onClick={onStart} title={tr("ui.close")} aria-label={tr("ui.close")}>
            <Icon path={ICON_CLOSE} />
          </button>
        )}
      </div>
      <div className="weft-player-stage">
        <ModuleFrame srcDoc={srcDoc} title={file.title || tr("ui.learning_module")} frameRef={frameRef} />
      </div>
    </div>
  );
}
