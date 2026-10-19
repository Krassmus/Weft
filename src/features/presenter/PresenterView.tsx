import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { appCacheDir, join } from "@tauri-apps/api/path";
import { mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { useDocumentStore } from "../../core/document/store";
import { defaultLanguageOf, effectiveLanguage, pageNotes } from "../../core/document/translations";
import { pageLabels } from "../../core/document/pageLabels";
import { aspectRatioNumeric } from "../../core/aspectRatio";
import { packDocument } from "../../core/io/pack";
import { buildInlineFontFaceCss } from "../../core/runtime/buildInlineFontFaceCss";
import { buildPreviewAssetUrls } from "../../core/runtime/buildPreviewAssetUrls";
import { buildRuntimeHtml } from "../../core/runtime/buildRuntimeHtml";
import { isTauriRuntime } from "../../core/window/fullscreen";
import { tr } from "../../core/i18n/tr";
import { onPresenterMessage, sendPresenterMessage } from "./bus";
import type { PresenterCommand, PresenterState } from "./protocol";

/** The module's page for an instance that only follows (see `follower` in player.runtime.js): no sound, no animation, no navigation of
 * its own. The one for the next slide shows the slide with everything on it (the render mode of `weft render`). */
function followerHtml(html: string, everythingShown: boolean): string {
  const tags =
    '<script id="weft-follower" type="application/json">true</script>\n' +
    (everythingShown ? '<script id="weft-render-mode" type="application/json">{"all":true}</script>\n' : "");
  return html.replace('<script id="weft-start-page"', `${tags}<script id="weft-start-page"`);
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${hours}:${two(minutes)}:${two(rest)}` : `${two(minutes)}:${two(rest)}`;
}

/** The player file for the audience window as a file the app can hand over (the desktop app: written into the app's cache folder). */
async function writeAudienceFile(bytes: Uint8Array): Promise<string> {
  const dir = await join(await appCacheDir(), "presentation");
  await mkdir(dir, { recursive: true });
  const path = await join(dir, "audience.weft");
  await writeFile(path, bytes);
  return path;
}

/**
 * The speaker's screen: the editor's window turns into this while presenting, and a second window (AudienceView.tsx) shows the module
 * on the beamer. Here: the slide that is shown (a copy that follows the audience's), the next slide, the notes of the slide, the
 * time, a stopwatch, and the buttons - Space, the arrow keys and Page Up / Down work as well, Esc ends it.
 * The audience window is the one that plays (and that a click on the beamer's screen reaches); this window tells it what to do.
 */
export function PresenterView({ startPageId, onExit }: { startPageId: string | null; onExit: () => void }) {
  const content = useDocumentStore((s) => s.doc.content);
  const editingLanguage = useDocumentStore((s) => s.editingLanguage);
  const lang = effectiveLanguage(content.languages, editingLanguage);
  const defaultLang = defaultLanguageOf(content.languages);
  const labels = useMemo(() => pageLabels(content), [content]);

  const [docs, setDocs] = useState<{ current: string; next: string } | null>(null);
  const [state, setState] = useState<PresenterState | null>(null);
  const [audience, setAudience] = useState<"starting" | "connected" | "closed" | "failed">("starting");
  const [now, setNow] = useState(() => new Date());
  const [elapsed, setElapsed] = useState(0);
  const [timerRunning, setTimerRunning] = useState(true);
  const currentFrame = useRef<HTMLIFrameElement>(null);
  const nextFrame = useRef<HTMLIFrameElement>(null);
  const stateRef = useRef<PresenterState | null>(null);
  const shownNextRef = useRef<string | null>(null);
  const playerBytes = useRef<Uint8Array | null>(null);
  const exitedRef = useRef(false);

  // The instances that follow (this window's copies of the module).
  useEffect(() => {
    let cancelled = false;
    const module = useDocumentStore.getState().doc.content;
    Promise.all([buildPreviewAssetUrls(module), buildInlineFontFaceCss(module)])
      .then(([assetUrls, fontFaceCss]) => buildRuntimeHtml(module, assetUrls, fontFaceCss, startPageId, lang, true))
      .then((html) => {
        if (!cancelled) setDocs({ current: followerHtml(html, false), next: followerHtml(html, true) });
      });
    return () => {
      cancelled = true;
    };
    // (The module as it was when presenting began: it is not edited while presenting.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The copies catch up with what the audience's module shows.
  const syncFollowers = useCallback((next: PresenterState | null) => {
    if (!next) return;
    currentFrame.current?.contentWindow?.postMessage(
      { source: "weft-host", type: "control", action: "sync", pageId: next.pageId, buildsDone: next.buildsDone, finished: next.finished },
      "*",
    );
    if (next.nextPageId && next.nextPageId !== shownNextRef.current) {
      shownNextRef.current = next.nextPageId;
      nextFrame.current?.contentWindow?.postMessage({ source: "weft-host", type: "control", action: "goto", pageId: next.nextPageId }, "*");
    }
  }, []);

  function send(action: PresenterCommand, pageId?: string) {
    sendPresenterMessage({ type: "command", action, pageId });
  }

  // The audience window: opened here (the desktop app: a player file in the cache folder and a window on the other screen).
  const openAudience = useCallback(async () => {
    setAudience("starting");
    try {
      const doc = useDocumentStore.getState().doc;
      const bytes = await packDocument(doc, { playerOnly: true });
      playerBytes.current = bytes;
      if (isTauriRuntime()) {
        const path = await writeAudienceFile(bytes);
        // A window that is still open (it is opened again by hand) goes first, and its label is free a moment later; one more try
        // when the opening still meets it.
        await invoke("close_audience_window").catch(() => undefined);
        await new Promise((resolve) => window.setTimeout(resolve, 250));
        try {
          await invoke("open_audience_window", { path });
        } catch {
          await new Promise((resolve) => window.setTimeout(resolve, 500));
          await invoke("open_audience_window", { path });
        }
      } else {
        // A browser tab (the development preview): the audience tab is opened by hand or by this, and asks for the file.
        window.open(`${window.location.origin}/?audience`, "weft-audience");
      }
    } catch (error) {
      console.error("The audience window could not be opened:", error);
      setAudience("failed");
    }
  }, []);
  // Once - not twice, as a development build's double start of every effect would: the second opening would meet the first's window.
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    void openAudience();
  }, [openAudience]);

  // What the audience window says.
  useEffect(
    () =>
      onPresenterMessage((message) => {
        if (message.type === "audience-ready") {
          setAudience("connected");
          if (startPageId) sendPresenterMessage({ type: "command", action: "goto", pageId: startPageId });
        } else if (message.type === "state") {
          stateRef.current = message.state;
          setState(message.state);
          syncFollowers(message.state);
        } else if (message.type === "audience-closed") {
          setAudience("closed");
        } else if (message.type === "audience-exit") {
          void end();
        } else if (message.type === "need-file" && playerBytes.current) {
          sendPresenterMessage({ type: "file", bytes: playerBytes.current });
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [syncFollowers, startPageId],
  );

  // The clock and the stopwatch.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
      if (timerRunning) setElapsed((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [timerRunning]);

  async function end() {
    if (exitedRef.current) return;
    exitedRef.current = true;
    sendPresenterMessage({ type: "close" });
    if (isTauriRuntime()) await invoke("close_audience_window").catch(() => undefined);
    onExit();
  }

  // The keys: a clicker sends Page Up / Down or the arrow keys.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest("input, textarea, select")) return;
      if (e.key === "Escape") void end();
      else if ([" ", "ArrowRight", "ArrowDown", "PageDown", "Enter"].includes(e.key)) {
        e.preventDefault();
        send("weiter");
      } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) {
        e.preventDefault();
        send("prev");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentPageId = state?.pageId ?? startPageId;
  const currentPage = currentPageId ? content.pages[currentPageId] : undefined;
  const notes = currentPage ? pageNotes(currentPage, lang, defaultLang).trim() : "";
  const nextLabel = state?.nextPageId ? labels[state.nextPageId] : null;
  const ratio = aspectRatioNumeric(content.aspectRatio);
  const frameStyle = { aspectRatio: String(ratio) };

  return (
    <div className="weft-presenter">
      <div className="weft-presenter-top">
        <div className="weft-presenter-clock" title={tr("ui.presenter_time")}>
          {formatClock(now)}
        </div>
        <button
          type="button"
          className="weft-presenter-timer"
          title={timerRunning ? tr("ui.presenter_stopwatch_pause") : tr("ui.presenter_stopwatch_run")}
          onClick={() => setTimerRunning((running) => !running)}
          onDoubleClick={() => setElapsed(0)}
        >
          {formatElapsed(elapsed)}
        </button>
        <span className="weft-presenter-status">
          {audience === "starting" && tr("ui.presenter_audience_starting")}
          {audience === "failed" && tr("ui.presenter_audience_failed")}
          {audience === "closed" && tr("ui.presenter_audience_closed")}
        </span>
        {(audience === "closed" || audience === "failed") && (
          <button type="button" className="weft-ghost-button" onClick={() => void openAudience()}>
            {tr("ui.presenter_open_audience")}
          </button>
        )}
        <span className="weft-presenter-spacer" />
        <button type="button" className="weft-ghost-button" onClick={() => void end()}>
          {tr("ui.presenter_end")}
        </button>
      </div>

      <div className="weft-presenter-body">
        <div className="weft-presenter-main">
          <div className="weft-presenter-label">
            {tr("ui.presenter_current")}
            {state && !state.finished && state.pageLabel ? ` · ${tr("ui.presenter_slide", { label: state.pageLabel })}` : ""}
            {state && state.buildsTotal > 0 && !state.finished ? ` · ${tr("ui.presenter_builds", { done: state.buildsDone, total: state.buildsTotal })}` : ""}
          </div>
          <div className="weft-presenter-slide" style={frameStyle}>
            {docs ? (
              <iframe
                ref={currentFrame}
                className="weft-presenter-frame"
                title={tr("ui.presenter_current")}
                sandbox="allow-scripts"
                srcDoc={docs.current}
                tabIndex={-1}
                onLoad={() => syncFollowers(stateRef.current)}
              />
            ) : (
              <div className="weft-preview-loading">{tr("ui.presenter_preparing")}</div>
            )}
            {state?.finished && <div className="weft-presenter-finished">{tr("ui.presenter_finished")}</div>}
          </div>
          <div className="weft-presenter-controls">
            <button type="button" className="weft-ghost-button" onClick={() => send("prev")}>
              ‹ {tr("ui.presenter_back")}
            </button>
            <button type="button" className="weft-presenter-next-button" onClick={() => send("weiter")}>
              {state?.finished ? tr("ui.presenter_restart") : tr("ui.presenter_forward")} ›
            </button>
          </div>
        </div>

        <div className="weft-presenter-side">
          <div className="weft-presenter-label">
            {tr("ui.presenter_next")}
            {nextLabel ? ` · ${tr("ui.presenter_slide", { label: nextLabel })}` : ""}
          </div>
          <div className="weft-presenter-slide is-next" style={frameStyle}>
            {docs && (
              <iframe
                ref={nextFrame}
                className="weft-presenter-frame"
                title={tr("ui.presenter_next")}
                sandbox="allow-scripts"
                srcDoc={docs.next}
                tabIndex={-1}
                onLoad={() => {
                  shownNextRef.current = null;
                  syncFollowers(stateRef.current);
                }}
              />
            )}
            {state && !state.nextPageId && <div className="weft-presenter-finished">{tr("ui.presenter_end_of_module")}</div>}
          </div>
          <div className="weft-presenter-label">{tr("ui.presenter_notes")}</div>
          <div className="weft-presenter-notes-view">{notes || <span className="weft-presenter-no-notes">{tr("ui.presenter_no_notes")}</span>}</div>
        </div>
      </div>
    </div>
  );
}
