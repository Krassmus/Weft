import type { Block, Page, WeftModule } from "../src/core/types";
import { descriptorOf } from "../src/core/blocks/registry";
import { orderedValues } from "../src/core/document/ordering";
import { plainTextOfHtml } from "../src/core/document/translations";

/** The words of some html, at most `max` characters of them. */
export function words(html: string | undefined, max = 70): string {
  const text = plainTextOfHtml(html ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Layout blocks and page blocks of a page in the order they are stacked (later = on top). */
export function pageBlocks(content: WeftModule, page: Page): { block: Block; fromLayout: boolean }[] {
  const layout = page.layoutId ? content.layouts[page.layoutId] : undefined;
  return [
    ...orderedValues(layout?.blocks ?? {}).map((block) => ({ block: block as Block, fromLayout: true })),
    ...orderedValues(page.blocks).map((block) => ({ block, fromLayout: false })),
  ];
}

/** One line that says what a block is: its words, its question, its picture. */
export function blockSummary(block: Block, content: WeftModule, labels: Record<string, string>): string {
  const name = block.name?.trim();
  return name ? `„${name}": ${blockContent(block, content, labels)}` : blockContent(block, content, labels);
}

function blockContent(block: Block, content: WeftModule, labels: Record<string, string>): string {
  // A block that describes itself (see core/blocks) says what it is itself.
  const summary = descriptorOf(block)?.summary;
  if (summary) return summary(block as never, { labels });
  switch (block.kind) {
    case "placeholder":
      return `Platzhalter „${block.label}"`;
    case "quiz": {
      const options = block.options.length;
      const correct = block.correctOptionIds.length;
      return `${words(block.questionHtml, 80) || "(ohne Frage)"} [${options} Optionen${block.open ? ", offen" : `, ${correct} richtig`}]`;
    }
    case "button":
      // (Described above.)
      return "";
    case "progress":
      // (Described above.)
      return "";
    case "revealer":
      return `${block.icon}: „${block.title}"${block.body ? " + Text" : ""}${block.imageAssetId ? " + Bild" : ""}${block.button ? ` + Button „${block.button.text}"` : ""}`;
    case "image": {
      const asset = content.assets.find((a) => a.id === block.assetId);
      return `${block.alt ? `„${block.alt}" ` : ""}${asset ? asset.fileName : "(kein Bild)"}`.trim();
    }
    case "video": {
      const asset = content.assets.find((a) => a.id === block.assetId);
      return `${asset ? asset.fileName : "(kein Video)"}${block.stopPoints.length > 0 ? `, ${block.stopPoints.length} Zeitmarken` : ""}`;
    }
    case "audio": {
      const asset = content.assets.find((a) => a.id === block.assetId);
      const shown = block.appearance === "hidden" ? "unsichtbar" : "mit Player";
      return `${asset ? asset.fileName : "(keine Audiodatei)"}, ${shown}${block.stopPoints.length > 0 ? `, ${block.stopPoints.length} Zeitmarken` : ""}`;
    }
    case "code":
      return `${block.language}: ${(block.code.split("\n")[0] ?? "").slice(0, 50)}`;
    case "tex":
      return block.tex.slice(0, 60);
    case "iframe":
      // (Described above.)
      return "";
    case "shape":
      return block.shapeKind;
    case "arrow":
      return `${block.points.length} Punkte`;
    case "matching": {
      const cards = (items: typeof block.sources) => items.map((item) => (item.kind === "image" ? `[Bild: ${words(item.text, 20) || "ohne Beschreibung"}]` : words(item.text, 20))).join(", ");
      const pairs = Object.keys(block.pairs ?? {}).length;
      return `Objekte: ${cards(block.sources)} → Ziele: ${cards(block.targets)} (${pairs} richtig, ${block.sources.length - pairs} Ablenker)${block.shuffle ? " [zufällig]" : ""}${block.required ? " [Pflicht]" : ""}`;
    }
    case "sort": {
      const items = block.items.map((item) => (item.kind === "image" ? `[Bild: ${words(item.text, 20) || "ohne Beschreibung"}]` : words(item.text, 20))).join(" → ");
      const ends = block.startLabel || block.endLabel ? ` (${block.startLabel ?? ""} … ${block.endLabel ?? ""})` : "";
      return `richtige Reihenfolge: ${items}${ends}${block.orientation === "horizontal" ? " [waagerecht]" : ""}${block.required ? " [Pflicht]" : ""}`;
    }
    case "gallery":
      // (Described above.)
      return "";
    case "solution":
      // (Described above.)
      return "";
    case "checker":
      // (Described above.)
      return "";
    case "link":
      // (Described above.)
      return "";
    case "files":
      return `${block.files.length} Dateien${block.protection ? ", geschützt" : ""}`;
    case "language":
      // (Described above.)
      return "";
    case "script":
      return `Logikblock: ${(block.code.split("\n").find((line) => line.trim() !== "" && !line.trim().startsWith("//")) ?? "").trim().slice(0, 50)}`;
  }
}
