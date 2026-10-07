import { useEffect, useRef, useState } from "react";
import { enterFullscreenPreview, exitFullscreenPreview, watchFullscreenExit } from "../../core/window/fullscreen";
import type { PlayerFile } from "../../core/io/playerFile";
import { ModuleFrame } from "../editor/ModuleFrame";

/**
 * What Weft shows for a player file (see exportPlayerFile in core/io/fileIO.ts): none of the editor, just the
 * module on its first page in a wide black frame, and a button in the black border for full screen. The
 * file's page plays exactly as it does in a browser. The window's menu is still there, for opening another file.
 */
export function PlayerShell({ file }: { file: PlayerFile }) {
  const [fullscreen, setFullscreen] = useState(false);
  const fullscreenRef = useRef(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
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
        <button type="button" className="weft-player-fullscreen" onClick={() => void toggleFullscreen()} title={fullscreen ? "Vollbild beenden (Esc)" : "Vollbild"}>
          {fullscreen ? "⤡" : "⤢"}
        </button>
      </div>
      <div className="weft-player-stage">
        <ModuleFrame srcDoc={file.html} title={file.title || "Lernmodul"} frameRef={frameRef} />
      </div>
    </div>
  );
}
