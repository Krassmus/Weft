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
  return summary ? summary(block as never, { labels, assets: content.assets }) : "";
}
