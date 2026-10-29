import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { readFile, stat } from "@tauri-apps/plugin-fs";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import settingsIconSvg from "../../../mockups/icons/admin.svg?raw";
import logo from "../../assets/weft-logo.png";
import { tr } from "../../core/i18n/tr";
import { useTranslation } from "../../core/i18n/useTranslation";
import { listLibrary, readLibraryFile } from "../../core/io/library";
import { forgetRecentFile, readRecentFiles, syncRecentMenu } from "../../core/io/recentFiles";
import { libraryMode, runsInTauri } from "../../core/platform";
import { DialogFrame } from "../editor/CollabDialogs";
import { bundledModules, loadBundledBytes, localized } from "./content";
import type { BundledModule } from "./content";
import { ModuleThumb } from "./ModuleThumb";
import { summarizeModule } from "./moduleSummary";
import type { ModuleSummary } from "./moduleSummary";
import { LoadBar, useOpenProgress } from "./openProgress";
import type { OpenProgress } from "./openProgress";
import { PrivacyPage } from "./PrivacyPage";
import "./start.css";

/** What the start screen can make happen - EditorShell.tsx knows how (asking before something unsaved is replaced, and so on). */
export interface StartActions {
  /** A new learning module with one white slide. */
  onNew: () => void;
  /** The file dialog (on a tablet: the library). */
  onOpenFile: () => void;
  onOpenPath: (path: string) => Promise<void>;
  /** A template or an example: a module of its own, made from a copy of the file. */
  /** `title`: the module's title in the language of the interface, where the catalogue has one (the module opens in that language). */
  onUseModule: (bytes: Uint8Array, title?: string) => Promise<void>;
  /** A tutorial: played in the player, not editable. */
  onPlay: (bytes: Uint8Array) => Promise<void>;
  onSettings: () => void;
}

const PROJECTS_SHOWN = 4;
const TUTORIALS_SHOWN = 5;

const icon = {
  plus: <path d="M12 5v14M5 12h14" />,
  layout: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </>
  ),
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
};

function Icon({ name, size = 20 }: { name: keyof typeof icon; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icon[name]}
    </svg>
  );
}

// ---- What the tiles show of a module --------------------------------------------------------------------------------------

/** The summaries of the bundled modules are read once (they do not change while the app runs). */
const bundledSummaries = new Map<string, Promise<ModuleSummary | null>>();

function bundledSummary(module: BundledModule): Promise<ModuleSummary | null> {
  let summary = bundledSummaries.get(module.url);
  if (!summary) {
    summary = loadBundledBytes(module)
      .then(summarizeModule)
      .catch(() => null);
    bundledSummaries.set(module.url, summary);
  }
  return summary;
}

function useBundledSummaries(modules: BundledModule[]): Record<string, ModuleSummary | null> {
  const [summaries, setSummaries] = useState<Record<string, ModuleSummary | null>>({});
  useEffect(() => {
    let alive = true;
    for (const module of modules) {
      void bundledSummary(module).then((summary) => alive && setSummaries((all) => ({ ...all, [module.url]: summary })));
    }
    return () => {
      alive = false;
    };
  }, [modules]);
  return summaries;
}

interface Project {
  path: string;
  /** file name without its extension */
  name: string;
  modified: number;
  size: number;
  folder: string;
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function folderName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts.length >= 2 ? parts[parts.length - 2] : "";
}

function stripExtension(name: string): string {
  return name.replace(/\.zip$/i, "").replace(/\.weft$/i, "");
}

/** The modules this computer opened or saved last (the tablet: the ones in its library), newest first. A file that is gone is left out. */
async function listProjects(): Promise<Project[]> {
  if (libraryMode()) {
    return (await listLibrary()).map((entry) => ({ path: entry.path, name: entry.name, modified: entry.modified, size: entry.size, folder: "" }));
  }
  if (!runsInTauri()) return [];
  const projects: Project[] = [];
  for (const path of readRecentFiles()) {
    try {
      const info = await stat(path);
      if (!info.isFile) continue;
      projects.push({ path, name: stripExtension(baseName(path)), modified: info.mtime ? info.mtime.getTime() : 0, size: info.size, folder: folderName(path) });
    } catch {
      // gone, or out of reach
    }
  }
  return projects;
}

function useProjects(): { projects: Project[] | null; summaries: Record<string, ModuleSummary | null>; remove: (path: string) => void } {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [summaries, setSummaries] = useState<Record<string, ModuleSummary | null>>({});

  useEffect(() => {
    let alive = true;
    void listProjects()
      .catch(() => [] as Project[])
      .then(async (list) => {
        if (!alive) return;
        setProjects(list);
        // One after the other: a module can be large, and the tiles fill in as they are read.
        for (const project of list) {
          if (!alive) return;
          try {
            const bytes = libraryMode() ? await readLibraryFile(project.path) : await readFile(project.path);
            const summary = await summarizeModule(bytes);
            if (alive) setSummaries((all) => ({ ...all, [project.path]: summary }));
          } catch {
            if (alive) setSummaries((all) => ({ ...all, [project.path]: null }));
          }
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  return {
    projects,
    summaries,
    remove: (path) => {
      syncRecentMenu(forgetRecentFile(path));
      setProjects((list) => list && list.filter((project) => project.path !== path));
    },
  };
}

// ---- The screen -----------------------------------------------------------------------------------------------------------

/** How big a bundled module is (to know whether opening it takes a while): what the server says, null when it does not. */
async function bundledSize(module: BundledModule): Promise<number | null> {
  try {
    const length = (await fetch(module.url, { method: "HEAD" })).headers.get("content-length");
    return length ? Number(length) : null;
  } catch {
    return null;
  }
}

export function StartScreen({ actions }: { actions: StartActions }) {
  const [view, setView] = useState<"home" | "privacy">("home");
  return (
    <div className="weft-start">
      <header className="weft-start-header">
        <button type="button" className="weft-start-brand" onClick={() => setView("home")} aria-label="Weft">
          <img src={logo} alt="" width={32} height={32} />
          <span>Weft</span>
        </button>
        <div className="weft-start-header-end">
          <button type="button" className={"weft-start-link" + (view === "privacy" ? " is-active" : "")} onClick={() => setView("privacy")}>
            {tr("ui.start_privacy_link")}
          </button>
          <button type="button" className="weft-start-gear" title={tr("ui.settings")} aria-label={tr("ui.settings")} onClick={actions.onSettings} dangerouslySetInnerHTML={{ __html: settingsIconSvg }} />
        </div>
      </header>
      <main className="weft-start-main">
        {view === "privacy" ? <PrivacyPage onBack={() => setView("home")} /> : <Home actions={actions} />}
      </main>
    </div>
  );
}

function Home({ actions }: { actions: StartActions }) {
  const { lang } = useTranslation();
  const templates = useMemo(() => bundledModules("templates"), []);
  const examples = useMemo(() => bundledModules("examples"), []);
  const tutorials = useMemo(() => bundledModules("tutorials"), []);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const progress = useOpenProgress();

  async function play(module: BundledModule) {
    await progress.run(module.url, await bundledSize(module), async () => actions.onPlay(await loadBundledBytes(module)));
  }

  async function use(module: BundledModule) {
    await progress.run(module.url, await bundledSize(module), async () => actions.onUseModule(await loadBundledBytes(module), localized(module.title, lang)));
  }

  return (
    <>
      <section className="weft-start-hero">
        <h1>
          {tr("ui.start_welcome")} <span>Weft</span>
        </h1>
        <p>{tr("ui.start_tagline")}</p>
        <svg className="weft-start-wave" viewBox="0 0 640 140" aria-hidden="true" preserveAspectRatio="none">
          <defs>
            <linearGradient id="weft-wave" x1="0" x2="1">
              <stop offset="0" stopColor="#3b82f6" stopOpacity="0" />
              <stop offset="0.6" stopColor="#3b82f6" />
              <stop offset="1" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
          {Array.from({ length: 9 }, (_, i) => (
            <path key={i} d={`M0 ${100 + i * 2} C 160 ${120 - i * 5}, 260 ${20 + i * 3}, 400 ${60 - i * 2} S 580 ${10 + i * 4}, 640 ${30 + i}`} fill="none" stroke="url(#weft-wave)" strokeWidth="1" opacity={0.25 + i * 0.07} />
          ))}
        </svg>
      </section>

      <section className="weft-start-tiles">
        <ActionTile tone="blue" icon="plus" title={tr("ui.new_learning_module")} text={tr("ui.start_new_text")} button={tr("ui.start_new_button")} buttonIcon="plus" onClick={actions.onNew} />
        <ActionTile
          tone="teal"
          icon="layout"
          title={tr("ui.start_template_title")}
          text={tr("ui.start_template_text")}
          button={tr("ui.start_template_button")}
          disabled={templates.length === 0}
          hint={templates.length === 0 ? tr("ui.start_coming_soon") : undefined}
          onClick={() => setTemplatesOpen(true)}
        />
        <ActionTile
          tone="violet"
          icon="play"
          title={tr("ui.start_example_title")}
          text={tr("ui.start_example_text")}
          // (With more than one example the button shows them all, as the templates are shown; with one it opens it.)
          button={examples.length > 1 ? tr("ui.start_examples_button") : tr("ui.start_example_button")}
          disabled={examples.length === 0}
          hint={examples.length === 0 ? tr("ui.start_coming_soon") : undefined}
          onClick={() => (examples.length > 1 ? setExamplesOpen(true) : void use(examples[0]))}
        />
      </section>

      <ProjectsSection actions={actions} progress={progress} />

      {tutorials.length > 0 && <TutorialsSection tutorials={tutorials} lang={lang} progress={progress} onPlay={play} />}

      {templatesOpen && (
        <TemplatesDialog
          templates={templates}
          lang={lang}
          progress={progress}
          onClose={() => setTemplatesOpen(false)}
          onUse={(module) => void use(module)}
        />
      )}
      {examplesOpen && (
        <TemplatesDialog
          title={tr("ui.start_example_title")}
          templates={examples}
          lang={lang}
          progress={progress}
          onClose={() => setExamplesOpen(false)}
          onUse={(module) => void use(module)}
        />
      )}
    </>
  );
}

function ActionTile({
  tone,
  icon: iconName,
  title,
  text,
  button,
  buttonIcon,
  disabled,
  hint,
  onClick,
}: {
  tone: "blue" | "teal" | "violet";
  icon: keyof typeof icon;
  title: string;
  text: string;
  button: string;
  buttonIcon?: keyof typeof icon;
  disabled?: boolean;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <div className={`weft-start-tile is-${tone}`}>
      <div className="weft-start-tile-head">
        <span className="weft-start-tile-icon">
          <Icon name={iconName} size={24} />
        </span>
        <h2>{title}</h2>
      </div>
      <p>{text}</p>
      <div className="weft-start-tile-foot">
        <button type="button" className="weft-start-tile-button" disabled={disabled} onClick={onClick}>
          {buttonIcon && <Icon name={buttonIcon} size={16} />}
          {button}
        </button>
        {hint && <span className="weft-start-tile-hint">{hint}</span>}
      </div>
    </div>
  );
}

function SectionHead({ icon: iconName, title, hint, children }: { icon: keyof typeof icon; title: string; hint: string; children?: ReactNode }) {
  return (
    <div className="weft-start-section-head">
      <span className="weft-start-section-icon">
        <Icon name={iconName} size={26} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{hint}</p>
      </div>
      <div className="weft-start-section-end">{children}</div>
    </div>
  );
}

function ProjectsSection({ actions, progress }: { actions: StartActions; progress: OpenProgress }) {
  const { lang } = useTranslation();
  const { projects, summaries, remove } = useProjects();
  const [all, setAll] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const shown = projects ? (all ? projects : projects.slice(0, PROJECTS_SHOWN)) : [];
  const canManage = runsInTauri() && !libraryMode();
  const open = (project: Project) => progress.run(project.path, project.size, () => actions.onOpenPath(project.path));

  useEffect(() => {
    if (menuFor === null) return;
    const close = () => setMenuFor(null);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuFor]);

  return (
    <section className="weft-start-section">
      <SectionHead icon="folder" title={tr("ui.start_my_projects")} hint={tr("ui.start_my_projects_hint")}>
        <button type="button" className="weft-start-link" onClick={actions.onOpenFile}>
          {tr("ui.start_open_file")}
        </button>
        {projects && projects.length > PROJECTS_SHOWN && (
          <button type="button" className="weft-start-link" onClick={() => setAll((v) => !v)}>
            {all ? tr("ui.start_show_fewer") : tr("ui.start_show_all_projects")} <Icon name="arrow" size={16} />
          </button>
        )}
      </SectionHead>
      {projects && projects.length === 0 ? (
        <p className="weft-start-empty">{tr("ui.start_no_projects")}</p>
      ) : (
        <div className="weft-start-grid is-projects">
          {shown.map((project) => {
            const summary = summaries[project.path];
            const title = summary?.title || project.name;
            return (
              <div
                key={project.path}
                className="weft-start-card"
                role="button"
                tabIndex={0}
                onClick={() => void open(project)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), void open(project))}
              >
                <ModuleThumb summary={summary} />
                {progress.active?.key === project.path && <LoadBar seconds={progress.active.seconds} />}
                <div className="weft-start-card-body">
                  <h3 title={title}>{title}</h3>
                  <p>{tr("ui.start_last_edited", { date: project.modified ? new Date(project.modified).toLocaleDateString(lang === "de" ? "de-DE" : "en-GB") : "-" })}</p>
                  <span className="weft-start-card-folder" title={project.path}>
                    <Icon name="folder" size={16} />
                    {project.folder}
                  </span>
                </div>
                {canManage && (
                  <>
                    <button
                      type="button"
                      className="weft-start-card-more"
                      title={tr("ui.start_more")}
                      aria-label={tr("ui.start_more")}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuFor((current) => (current === project.path ? null : project.path));
                      }}
                    >
                      <Icon name="more" size={18} />
                    </button>
                    {menuFor === project.path && (
                      <div className="weft-start-card-menu" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuFor(null);
                            void revealItemInDir(project.path).catch(() => undefined);
                          }}
                        >
                          {tr("ui.start_show_in_folder")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuFor(null);
                            remove(project.path);
                          }}
                        >
                          {tr("ui.start_remove_from_list")}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function TutorialsSection({ tutorials, lang, progress, onPlay }: { tutorials: BundledModule[]; lang: "de" | "en"; progress: OpenProgress; onPlay: (module: BundledModule) => Promise<void> }) {
  const [all, setAll] = useState(false);
  const summaries = useBundledSummaries(tutorials);
  const shown = all ? tutorials : tutorials.slice(0, TUTORIALS_SHOWN);
  return (
    <section className="weft-start-section">
      <SectionHead icon="play" title={tr("ui.start_learn_weft")} hint={tr("ui.start_learn_weft_hint")}>
        {tutorials.length > TUTORIALS_SHOWN && (
          <button type="button" className="weft-start-link" onClick={() => setAll((v) => !v)}>
            {all ? tr("ui.start_show_fewer") : tr("ui.start_show_all_tutorials")} <Icon name="arrow" size={16} />
          </button>
        )}
      </SectionHead>
      <div className="weft-start-grid is-tutorials">
        {shown.map((module) => {
          const title = localized(module.title, lang);
          const tag = localized(module.tag, lang);
          return (
            <div
              key={module.url}
              className="weft-start-card"
              role="button"
              tabIndex={0}
              onClick={() => void onPlay(module)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), void onPlay(module))}
            >
              <div className="weft-start-card-picture">
                <ModuleThumb summary={summaries[module.url]} />
                {progress.active?.key === module.url && <LoadBar seconds={progress.active.seconds} />}
                {tag && <span className="weft-start-tag">{tag}</span>}
              </div>
              <div className="weft-start-card-body">
                <h3 title={title}>{title}</h3>
                <p>{localized(module.description, lang)}</p>
                <div className="weft-start-card-foot">
                  {module.minutes !== undefined && (
                    <span className="weft-start-minutes">
                      <Icon name="clock" size={16} />
                      {tr("ui.start_minutes", { n: module.minutes })}
                    </span>
                  )}
                  <span className="weft-start-play" aria-label={tr("ui.start_play")}>
                    <Icon name="play" size={14} />
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** The dialog that lists modules that come with Weft as cards to pick from - the templates, or (with `title`) the examples. */
function TemplatesDialog({ title, templates, lang, progress, onClose, onUse }: { title?: string; templates: BundledModule[]; lang: "de" | "en"; progress: OpenProgress; onClose: () => void; onUse: (module: BundledModule) => void }) {
  const summaries = useBundledSummaries(templates);
  const firstRef = useRef<HTMLDivElement>(null);
  useEffect(() => firstRef.current?.focus(), []);
  return (
    <DialogFrame title={title ?? tr("ui.start_template_title")} onClose={onClose} appear>
      {templates.length === 0 ? (
        <p className="weft-hint">{tr("ui.start_templates_empty")}</p>
      ) : (
        <div className="weft-start-grid is-templates">
          {templates.map((module, index) => (
            <div
              key={module.url}
              ref={index === 0 ? firstRef : undefined}
              className="weft-start-card"
              // (The cards come in one after the other: the position is the delay, see .weft-start-grid.is-templates.)
              style={{ ["--i" as string]: index }}
              role="button"
              tabIndex={0}
              onClick={() => onUse(module)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onUse(module))}
            >
              <ModuleThumb summary={summaries[module.url]} />
              {progress.active?.key === module.url && <LoadBar seconds={progress.active.seconds} />}
              <div className="weft-start-card-body">
                <h3>{localized(module.title, lang)}</h3>
                <p>{localized(module.description, lang)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </DialogFrame>
  );
}
