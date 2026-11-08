import { useEffect, useMemo, useRef } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { safeLinkUrl } from "../src/core/document/linkUrl";
import { withPlayerChrome } from "../src/core/io/playerFile";
import { runsInTauri } from "../src/core/platform";

/**
 * A module's page in a sandboxed frame (no `allow-same-origin`: it genuinely can't reach the app around it) - like ModuleFrame of the editor
 * (src/features/editor/ModuleFrame.tsx), but without what only the editor needs: a link of the module goes to the system's browser, and
 * that is all. (A module that offers files for download: not yet - the phone has no place for them in this app.)
 */
export function PlayerFrame({ html, title }: { html: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => withPlayerChrome(html), [html]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data;
      if (e.source !== frameRef.current?.contentWindow || !data || data.source !== "weft-module") return;
      if (data.type === "open-url") {
        const address = typeof data.url === "string" ? safeLinkUrl(data.url) : null;
        if (!address) return;
        if (runsInTauri()) void openUrl(address).catch(() => undefined);
        else window.open(address, "_blank", "noopener,noreferrer");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return <iframe ref={frameRef} className="player-frame" title={title} sandbox="allow-scripts" srcDoc={srcDoc} onLoad={(e) => e.currentTarget.focus()} />;
}
