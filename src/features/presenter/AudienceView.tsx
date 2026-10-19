import { useEffect, useRef, useState } from "react";
import { readFile } from "@tauri-apps/plugin-fs";
import { loadPlayerFile } from "../../core/io/playerFile";
import { isTauriRuntime } from "../../core/window/fullscreen";
import { onPresenterMessage, sendPresenterMessage } from "./bus";
import type { PresenterState } from "./protocol";

declare global {
  interface Window {
    /** Set by the desktop app when it opens the audience window (open_audience_window in lib.rs): the player file to play. */
    __WEFT_AUDIENCE_FILE__?: string;
  }
}

/**
 * The window for the beamer: nothing but the module, full window, on black. It plays a player file that the presenter's window has made
 * (PresenterView.tsx) and is the one that is true - it tells what it shows, and does what it is told (Weiter, Zurück, a jump). Space, the arrow keys and a click in it work as in any player.
 */
export function AudienceView() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState<string | null>(null);

  // The module: from the file the app wrote (the desktop app), else - in a browser tab - from the presenter's tab.
  useEffect(() => {
    let cancelled = false;
    const show = (bytes: Uint8Array) => {
      void loadPlayerFile(bytes).then((file) => {
        if (!cancelled) setHtml(file.html);
      });
    };
    const path = window.__WEFT_AUDIENCE_FILE__;
    if (isTauriRuntime() && path) {
      void readFile(path).then(show);
      return () => {
        cancelled = true;
      };
    }
    const stop = onPresenterMessage((message) => {
      if (message.type === "file") {
        window.clearInterval(retry);
        show(message.bytes);
      }
    });
    sendPresenterMessage({ type: "need-file" });
    const retry = window.setInterval(() => sendPresenterMessage({ type: "need-file" }), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(retry);
      stop();
    };
  }, []);

  // What the presenter wants.
  useEffect(
    () =>
      onPresenterMessage((message) => {
        if (message.type === "command") {
          frameRef.current?.contentWindow?.postMessage({ source: "weft-host", type: "control", action: message.action, pageId: message.pageId }, "*");
        } else if (message.type === "close" && !isTauriRuntime()) {
          window.close();
        }
      }),
    [],
  );

  // What the module says: where it is, and that Escape was pressed in it.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data;
      if (e.source !== frameRef.current?.contentWindow || !data || data.source !== "weft-module") return;
      if (data.type === "presenter-state") {
        const state: PresenterState = {
          pageId: data.pageId ?? null,
          pageLabel: String(data.pageLabel ?? ""),
          finished: !!data.finished,
          nextPageId: data.nextPageId ?? null,
          buildsDone: Number(data.buildsDone) || 0,
          buildsTotal: Number(data.buildsTotal) || 0,
        };
        sendPresenterMessage({ type: "state", state });
      } else if (data.type === "exit-presentation") {
        sendPresenterMessage({ type: "audience-exit" });
      }
    }
    window.addEventListener("message", onMessage);
    const tellClosed = () => sendPresenterMessage({ type: "audience-closed" });
    window.addEventListener("pagehide", tellClosed);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("pagehide", tellClosed);
    };
  }, []);

  return (
    <div className="weft-audience">
      {html && (
        <iframe
          ref={frameRef}
          className="weft-audience-frame"
          title="Weft"
          sandbox="allow-scripts"
          srcDoc={html}
          onLoad={(e) => {
            e.currentTarget.focus();
            e.currentTarget.contentWindow?.postMessage({ source: "weft-host", type: "report-state", on: true }, "*");
            sendPresenterMessage({ type: "audience-ready" });
          }}
        />
      )}
    </div>
  );
}
