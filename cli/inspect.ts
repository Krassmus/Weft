import { pageLabels } from "../src/core/document/pageLabels";
import { branchPageIds, sequenceOf } from "../src/core/document/sequence";
import { listAllNodes } from "../src/core/document/pageTimeline";
import { buildGraphModel } from "../src/features/editor/eventGraph/model";
import type { Block, Page, WeftModule } from "../src/core/types";
import type { LoadedWeft } from "./load";
import { CliError } from "./load";
import { blockSummary, pageBlocks } from "./text";
import { eventLabel } from "./validate";

export interface OutlineBlock {
  id: string;
  kind: string;
  /** One line that says what it is. */
  summary: string;
  fromLayout?: boolean;
  /** Only with a single page asked for. */
  position?: Block["position"];
  entrance?: string;
  exit?: string;
  placeholderOf?: string;
}

export interface OutlineEvent {
  id: string;
  label: string;
  unreachable?: boolean;
}

export interface OutlineTrigger {
  id: string;
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  delayMs: number;
  weiter: boolean;
}

export interface OutlinePage {
  /** The number in the sidebar ("3", "2.a.1"). */
  label: string;
  id: string;
  /** "page", "jump" (a jump page: never shown) */
  type: "page" | "jump";
  layout: string | null;
  /** The branch it is in: logic block, branch. */
  branch?: { logicBlock: string; branch: string };
  blocks: OutlineBlock[];
  events: OutlineEvent[];
  triggers: OutlineTrigger[];
  jump?: { targets: { label: string; condition: string }[]; default: string | null };
}

export interface Outline {
  file: string;
  formatVersion: number;
  title: string;
  id: string;
  aspectRatio: string;
  languages: string[];
  counts: { pages: number; blocks: number; layouts: number; variables: number; assets: number };
  variables: { id: string; name: string; type: string; initialValue: unknown; expression?: string }[];
  layouts: { id: string; name: string; blocks: OutlineBlock[] }[];
  /** The pages in the order they are played, with the branches where they are. */
  pages: OutlinePage[];
  assets: { id: string; fileName: string; mimeType: string; usedBy: number }[];
}

function aspect(content: WeftModule): string {
  const value = content.aspectRatio as unknown;
  return typeof value === "string" ? value : JSON.stringify(value);
}

function effectName(block: Block, phase: "entrance" | "exit"): string | undefined {
  const type = (phase === "entrance" ? block.entranceEffect : block.exitEffect)?.type;
  return type && type !== "off" ? type : undefined;
}

export function buildOutline(loaded: LoadedWeft, options: { page?: string } = {}): Outline {
  const { content } = loaded;
  const labels = pageLabels(content);
  const detailed = options.page !== undefined;

  const outlineBlock = (block: Block, fromLayout?: boolean): OutlineBlock => ({
    id: block.id,
    kind: block.kind,
    summary: blockSummary(block, content, labels),
    ...(fromLayout ? { fromLayout: true } : {}),
    ...(detailed ? { position: block.position, entrance: effectName(block, "entrance"), exit: effectName(block, "exit") } : {}),
    ...(block.kind === "text" && block.placeholderOf ? { placeholderOf: block.placeholderOf } : {}),
  });

  // Pages in playing order, with the branch each is in.
  const order: { pageId: string; branch?: OutlinePage["branch"] }[] = [];
  for (const entry of sequenceOf(content)) {
    if (entry.kind === "page") order.push({ pageId: entry.pageId });
    else {
      const logic = content.logicBlocks[entry.logicBlockId];
      for (const branch of logic?.branches ?? []) {
        for (const pageId of branchPageIds(branch)) order.push({ pageId, branch: { logicBlock: logic.name, branch: branch.label } });
      }
    }
  }
  // Pages that are in no sequence still show up (validate says they are lost).
  for (const pageId of Object.keys(content.pages)) if (!order.some((o) => o.pageId === pageId)) order.push({ pageId });

  const variableName = (id: string) => content.variables.find((v) => v.id === id)?.name ?? "(gelöscht)";
  const pages: OutlinePage[] = [];
  for (const { pageId, branch } of order) {
    const page: Page | undefined = content.pages[pageId];
    if (!page) continue;
    const label = labels[pageId] ?? "?";
    if (detailed && options.page !== label && options.page !== pageId) continue;
    const layout = page.layoutId ? content.layouts[page.layoutId] : undefined;
    const entry: OutlinePage = {
      label,
      id: pageId,
      type: page.jump ? "jump" : "page",
      layout: layout?.name ?? null,
      ...(branch ? { branch } : {}),
      blocks: [],
      events: [],
      triggers: [],
    };
    if (page.jump) {
      entry.jump = {
        targets: (page.jump.targets ?? []).map((t) => ({
          label: labels[t.pageId] ?? "(gelöscht)",
          condition: `${variableName(t.condition.variableId)} ${t.condition.comparator} ${String(t.condition.value)}`,
        })),
        default: page.jump.defaultPageId ? (labels[page.jump.defaultPageId] ?? "(gelöscht)") : null,
      };
    } else {
      entry.blocks = pageBlocks(content, page)
        // The blocks of the layout are listed once, with the layout - except when one page is asked for.
        .filter((b) => detailed || !b.fromLayout)
        .map((b) => outlineBlock(b.block, b.fromLayout));
      try {
        const model = buildGraphModel(page);
        const unreachable = new Set(model.nodes.flatMap((n) => [n, ...n.companions]).filter((n) => n.unreachable).map((n) => n.id));
        const nodes = listAllNodes(page);
        const labelOf = (id: string) => {
          const node = nodes.find((n) => n.id === id);
          return node ? eventLabel(page, node, content, labels) : id;
        };
        entry.events = nodes.map((node) => ({ id: node.id, label: eventLabel(page, node, content, labels), ...(unreachable.has(node.id) ? { unreachable: true } : {}) }));
        entry.triggers = Object.entries(page.timeline?.triggers ?? {}).map(([id, t]) => ({
          id,
          from: t.from,
          to: t.to,
          fromLabel: labelOf(t.from),
          toLabel: labelOf(t.to),
          delayMs: t.delayMs,
          weiter: t.weiter,
        }));
      } catch {
        // The graph of a broken page is not worth failing the whole overview for; validate reports it.
      }
    }
    pages.push(entry);
  }
  if (detailed && pages.length === 0) {
    throw new CliError(`Es gibt keine Folie „${options.page}". Die Nummern stehen in der Übersicht (weft inspect <datei>).`);
  }

  const blockCount = (page: Page) => Object.keys(page.blocks ?? {}).length;
  const usage = new Map<string, number>();
  for (const page of Object.values(content.pages)) {
    for (const block of Object.values(page.blocks ?? {})) {
      const id = (block as { assetId?: string | null }).assetId;
      if (id) usage.set(id, (usage.get(id) ?? 0) + 1);
    }
  }
  for (const layout of Object.values(content.layouts)) {
    for (const block of Object.values(layout.blocks ?? {})) {
      const id = (block as { assetId?: string | null }).assetId;
      if (id) usage.set(id, (usage.get(id) ?? 0) + 1);
    }
  }

  return {
    file: loaded.path,
    formatVersion: loaded.json.formatVersion,
    title: content.title,
    id: content.id,
    aspectRatio: aspect(content),
    languages: content.languages ?? [],
    counts: {
      pages: Object.keys(content.pages).length,
      blocks: Object.values(content.pages).reduce((n, p) => n + blockCount(p), 0),
      layouts: Object.keys(content.layouts).length,
      variables: content.variables.length,
      assets: content.assets.length,
    },
    variables: content.variables.map((v) => ({ id: v.id, name: v.name, type: v.type, initialValue: v.initialValue, ...(v.expression ? { expression: v.expression } : {}) })),
    layouts: Object.values(content.layouts).map((layout) => ({
      id: layout.id,
      name: layout.name,
      blocks: pageBlocks(content, { layoutId: layout.id, blocks: {} } as unknown as Page).map((b) => outlineBlock(b.block)),
    })),
    pages,
    assets: content.assets.map((a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, usedBy: usage.get(a.id) ?? 0 })),
  };
}

function ms(delayMs: number): string {
  return delayMs > 0 ? `, nach ${delayMs / 1000} s` : "";
}

export function outlineMarkdown(outline: Outline, detailed: boolean): string {
  const lines: string[] = [];
  lines.push(`# ${outline.title || "(ohne Titel)"}`);
  lines.push("");
  lines.push(`- Datei: ${outline.file}`);
  lines.push(`- Format ${outline.formatVersion}, Seitenverhältnis ${outline.aspectRatio}`);
  lines.push(`- Sprachen: ${outline.languages.length > 0 ? outline.languages.join(", ") + " (die erste ist die Standardsprache)" : "eine (nicht mehrsprachig)"}`);
  lines.push(`- ${outline.counts.pages} Folien, ${outline.counts.blocks} Blöcke, ${outline.counts.layouts} Layouts, ${outline.counts.variables} Variablen, ${outline.counts.assets} Dateien`);

  if (!detailed) {
    if (outline.variables.length > 0) {
      lines.push("", "## Variablen");
      for (const v of outline.variables) lines.push(`- ${v.name} (${v.type}, Start: ${JSON.stringify(v.initialValue)}${v.expression ? `, berechnet: ${v.expression}` : ""}) [${v.id}]`);
    }
    if (outline.layouts.length > 0) {
      lines.push("", "## Layouts");
      for (const layout of outline.layouts) {
        lines.push(`- **${layout.name}** [${layout.id}]`);
        for (const b of layout.blocks) lines.push(`  - ${b.kind}: ${b.summary} [${b.id}]`);
      }
    }
    lines.push("", "## Folien");
  }

  let lastBranch = "";
  for (const page of outline.pages) {
    const branch = page.branch ? `${page.branch.logicBlock} / ${page.branch.branch}` : "";
    if (branch !== lastBranch) {
      if (branch) lines.push(`### Verzweigung: ${branch}`);
      lastBranch = branch;
    }
    lines.push("", `#### Folie ${page.label}${page.type === "jump" ? " (Sprung-Folie, wird nie gezeigt)" : ""} [${page.id}]${page.layout ? ` · Layout „${page.layout}"` : ""}`);
    if (page.jump) {
      for (const t of page.jump.targets) lines.push(`- wenn ${t.condition}: → Folie ${t.label}`);
      lines.push(`- sonst: ${page.jump.default ? `→ Folie ${page.jump.default}` : "weiter wie gewohnt"}`);
      continue;
    }
    for (const b of page.blocks) {
      const extras = [
        b.fromLayout ? "aus dem Layout" : "",
        b.entrance ? `Aufbau: ${b.entrance}` : "",
        b.exit ? `Abbau: ${b.exit}` : "",
        b.position ? `x=${b.position.x} y=${b.position.y} b=${b.position.width} h=${b.position.height}` : "",
      ].filter(Boolean);
      lines.push(`- ${b.kind}: ${b.summary} [${b.id}]${extras.length > 0 ? ` (${extras.join("; ")})` : ""}`);
    }
    if (page.blocks.length === 0) lines.push("- (keine Blöcke)");
    if (detailed) {
      lines.push("", "Ereignisse:");
      for (const e of page.events) lines.push(`- ${e.label} [${e.id}]${e.unreachable ? " ⚠ passiert nie" : ""}`);
      lines.push("", "Auslöser:");
      const incoming = new Map<string, number>();
      for (const t of page.triggers) incoming.set(t.to, (incoming.get(t.to) ?? 0) + 1);
      for (const t of page.triggers) {
        const several = (incoming.get(t.to) ?? 0) > 1 ? "  ⚠ mehrere Auslöser für dieses Ereignis" : "";
        lines.push(`- ${t.fromLabel} → ${t.toLabel}${t.weiter ? ", mit Weiter" : ""}${ms(t.delayMs)} [${t.id}]${several}`);
      }
      if (page.triggers.length === 0) lines.push("- (keine)");
    } else {
      const unreachable = page.events.filter((e) => e.unreachable).length;
      if (unreachable > 0) lines.push(`- ⚠ ${unreachable} Ereignis(se) passieren nie (weft inspect <datei> --page ${page.label}, weft validate)`);
    }
  }

  if (!detailed && outline.assets.length > 0) {
    lines.push("", "## Dateien");
    for (const a of outline.assets) lines.push(`- ${a.fileName} (${a.mimeType}, in ${a.usedBy} Block/Blöcken) [${a.id}]`);
  }
  return lines.join("\n") + "\n";
}
