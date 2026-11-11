import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import logo from "../src/assets/weft-logo.png";
import { useResolvedLanguage } from "../src/core/i18n/languageStore";
import { deleteLibraryFile, listLibrary, readLibraryFile } from "../src/core/io/library";
import type { LibraryEntry } from "../src/core/io/library";
import { loadModuleForPlay } from "../src/core/io/playModule";
import type { PlayerFile } from "../src/core/io/playerFile";
import { runsInTauri } from "../src/core/platform";
import { ModuleThumb } from "../src/features/start/ModuleThumb";
import { summarizeModule } from "../src/features/start/moduleSummary";
import type { ModuleSummary } from "../src/features/start/moduleSummary";
import { bundledExamples, loadExampleBytes, localizedTitle } from "./bundled";
import type { BundledExample } from "./bundled";
import { startOpenFiles } from "./openFiles";
import { PlayerFrame } from "./PlayerFrame";
import { usePlayerStrings } from "./strings";

/**
 * The app "Weft Player": plays learning modules, nothing else. The start page shows the modules this phone knows - the ones that were opened here
 * (the library, see src/core/io/library.ts; a module that somebody sends lands there when it is opened with this app - see src-tauri/src/open_files.rs,
 * which this app shares with Weft) and the examples that come with the app. A tap plays one.
 */
const EXAMPLES = bundledExamples();
const WEFT_LINK = /^weft:/i;

const entryKey = (entry: LibraryEntry, language: string) => `${entry.path}|${entry.modified}|${language}`;
const exampleKey = (example: BundledExample, language: string) => `${example.file}|${language}`;

export function PlayerApp() {
  const t = usePlayerStrings();
  const language = useResolvedLanguage();
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [, setSummaryVersion] = useState(0);
  const summaries = useRef<Record<string, ModuleSummary | null>>({});
  const [playing, setPlaying] = useState<PlayerFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ title: string; text: string } | null>(null);
  const [removing, setRemoving] = useState<LibraryEntry | null>(null);
  const languageRef = useRef(language);
  languageRef.current = language;
  const tRef = useRef(t);
  tRef.current = t;

  const refresh = useCallback(async () => {
    try {
      setEntries(await listLibrary());
    } catch (error) {
      console.error("The library can't be read:", error);
      setEntries([]);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Only for trying this page in a browser (where the library is one in memory, see main.tsx): after a module was put into it by hand,
  // `window.dispatchEvent(new Event("weft-player-refresh"))` shows it.
  useEffect(() => {
    if (runsInTauri()) return;
    const onRefresh = () => void refresh();
    window.addEventListener("weft-player-refresh", onRefresh);
    return () => window.removeEventListener("weft-player-refresh", onRefresh);
  }, [refresh]);

  // The picture and the title of every tile, one module after the other (a module can be big; the phone should not hold all of them at once).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const wanted: { key: string; load: () => Promise<Uint8Array> }[] = [
        ...entries.map((entry) => ({ key: entryKey(entry, language), load: () => readLibraryFile(entry.path) })),
        ...EXAMPLES.map((example) => ({ key: exampleKey(example, language), load: () => loadExampleBytes(example) })),
      ];
      for (const item of wanted) {
        if (cancelled) return;
        if (item.key in summaries.current) continue;
        let summary: ModuleSummary | null = null;
        try {
          summary = await summarizeModule(await item.load(), language);
        } catch (error) {
          console.error("A module can't be summarized:", error);
        }
        if (cancelled) return;
        summaries.current[item.key] = summary;
        setSummaryVersion((version) => version + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entries, language]);

  const play = useCallback(async (load: () => Promise<Uint8Array>) => {
    setBusy(true);
    try {
      setPlaying(await loadModuleForPlay(await load(), languageRef.current));
    } catch (error) {
      console.error("A module can't be played:", error);
      setNotice({ title: "Weft Player", text: tRef.current.cannotOpen });
    } finally {
      setBusy(false);
    }
  }, []);

  // A file that was opened with the app (mail, messenger, Files): it is in the library now - and is played at once.
  useEffect(() => {
    if (!runsInTauri()) return;
    return startOpenFiles(
      (path) => {
        setRemoving(null);
        void refresh().then(() => play(() => readLibraryFile(path)));
      },
      (name, error) => {
        console.error(`${name} can't be opened: ${error}`);
        setNotice({ title: "Weft Player", text: tRef.current.cannotOpenFile });
      },
    );
  }, [refresh, play]);

  // A link to work together ("weft:..."): it is for the editor, on a tablet or a computer - this app only says so.
  useEffect(() => {
    if (!runsInTauri()) return;
    let stopped = false;
    let off: (() => void) | null = null;
    const invitation = (urls: string[] | null | undefined) => {
      if (urls?.some((url) => WEFT_LINK.test(url.trim()))) setNotice({ title: tRef.current.inviteTitle, text: tRef.current.inviteText });
    };
    void (async () => {
      invitation(await getCurrent().catch(() => null));
      const unlisten = await onOpenUrl(invitation);
      if (stopped) unlisten();
      else off = unlisten;
    })();
    return () => {
      stopped = true;
      off?.();
    };
  }, []);

  async function remove(entry: LibraryEntry) {
    setRemoving(null);
    try {
      await deleteLibraryFile(entry.path);
    } catch (error) {
      console.error("A module can't be removed:", error);
    }
    await refresh();
  }

  return (
    <div className="player-app">
      {playing ? (
        <div className="player-playing">
          <div className="player-bar">
            <span className="player-rotate">{t.rotate}</span>
            <button type="button" className="player-close" onClick={() => setPlaying(null)} title={t.close} aria-label={t.close}>
              <svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M3 3 L13 13 M13 3 L3 13" />
              </svg>
            </button>
          </div>
          <div className="player-stage">
            <PlayerFrame html={playing.html} title={playing.title || "Weft"} />
          </div>
        </div>
      ) : (
        <div className="player-home">
          <header className="player-header">
            <img className="player-logo" src={logo} alt="" />
            <h1>Weft Player</h1>
          </header>
          <main className="player-main">
            <section>
              <h2>{t.mine}</h2>
              {entries.length === 0 ? (
                <p className="player-empty">{t.empty}</p>
              ) : (
                <div className="player-grid">
                  {entries.map((entry) => {
                    const summary = summaries.current[entryKey(entry, language)];
                    return (
                      <div className="player-tile" key={entry.path}>
                        <button type="button" className="player-tile-open" onClick={() => void play(() => readLibraryFile(entry.path))}>
                          <ModuleThumb summary={summary} />
                          <span className="player-tile-title">{summary?.title || entry.name}</span>
                        </button>
                        <button type="button" className="player-tile-remove" aria-label={t.remove} title={t.remove} onClick={() => setRemoving(entry)}>
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
            <section>
              <h2>{t.examples}</h2>
              <div className="player-grid">
                {EXAMPLES.map((example) => {
                  const summary = summaries.current[exampleKey(example, language)];
                  return (
                    <div className="player-tile" key={example.file}>
                      <button type="button" className="player-tile-open" onClick={() => void play(() => loadExampleBytes(example))}>
                        <ModuleThumb summary={summary} />
                        <span className="player-tile-title">{localizedTitle(example.title, language)}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          </main>
        </div>
      )}
      {busy && <div className="player-busy" role="status">{t.opening}</div>}
      {removing && (
        <div className="player-sheet-backdrop" onClick={() => setRemoving(null)}>
          <div className="player-sheet" role="alertdialog" aria-label={t.remove} onClick={(e) => e.stopPropagation()}>
            <p>{t.removeAsk}</p>
            <div className="player-sheet-buttons">
              <button type="button" onClick={() => setRemoving(null)}>
                {t.cancel}
              </button>
              <button type="button" className="is-danger" onClick={() => void remove(removing)}>
                {t.remove}
              </button>
            </div>
          </div>
        </div>
      )}
      {notice && (
        <div className="player-sheet-backdrop" onClick={() => setNotice(null)}>
          <div className="player-sheet" role="alertdialog" aria-label={notice.title} onClick={(e) => e.stopPropagation()}>
            <h3>{notice.title}</h3>
            <p>{notice.text}</p>
            <div className="player-sheet-buttons">
              <button type="button" onClick={() => setNotice(null)}>
                {t.ok}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
