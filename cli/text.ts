import type { Block, Page, WeftModule } from "../src/core/types";
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
  switch (block.kind) {
    case "text":
      return words(block.html) || "(leer)";
    case "placeholder":
      return `Platzhalter „${block.label}"`;
    case "cloze":
      return words(block.html) || "(leer)";
    case "list":
      return `${block.items.length} Punkte: ${block.items
        .slice(0, 3)
        .map((item) => words(item.html, 30))
        .join(" | ")}`;
    case "quiz": {
      const options = block.options.length;
      const correct = block.correctOptionIds.length;
      return `${words(block.questionHtml, 80) || "(ohne Frage)"} [${options} Optionen${block.open ? ", offen" : `, ${correct} richtig`}]`;
    }
    case "button": {
      const label = words(block.html ?? block.text, 40) || "(ohne Text)";
      const action =
        block.action === "advance"
          ? "Weiter"
          : block.action === "prev"
            ? "Vorherige Folie"
            : block.action === "goto"
              ? `springt zu Folie ${(block.targetPageId && labels[block.targetPageId]) ?? "(gelöscht)"}`
              : "löst ein Ereignis aus";
      return `„${label}" → ${action}`;
    }
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
      return block.url;
    case "shape":
      return block.shapeKind;
    case "arrow":
      return `${block.points.length} Punkte`;
    case "files":
      return `${block.files.length} Dateien${block.protection ? ", geschützt" : ""}`;
    case "language":
      return "Sprachumschalter";
    case "script":
      return `Logikblock: ${(block.code.split("\n").find((line) => line.trim() !== "" && !line.trim().startsWith("//")) ?? "").trim().slice(0, 50)}`;
  }
}
