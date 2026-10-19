import { BLOCK_KIND_KEYS } from "../../core/i18n/translations";
import type { TranslationKey } from "../../core/i18n/translations";
import { plainTextOfHtml } from "../../core/document/translations";
import type { Block } from "../../core/types";

/** What to call a block in a list of the page's elements: its kind and, where it has words, the first of them. */
export function blockTitle(block: Block, t: (key: TranslationKey) => string): string {
  if (block.kind === "revealer") {
    const kindName = t(BLOCK_KIND_KEYS[block.kind]);
    const title = block.title.trim();
    return title ? `${kindName}: ${title.length > 26 ? `${title.slice(0, 25)}…` : title}` : kindName;
  }
  const html =
    block.kind === "text" || block.kind === "placeholder" || block.kind === "cloze"
      ? block.html
      : block.kind === "button"
        ? (block.html ?? block.text)
        : block.kind === "quiz"
          ? block.questionHtml
          : block.kind === "list"
            ? (block.items[0]?.html ?? "")
            : "";
  const words = plainTextOfHtml(html);
  const kind = t(BLOCK_KIND_KEYS[block.kind]);
  if (!words) return kind;
  return `${kind}: ${words.length > 26 ? `${words.slice(0, 25)}…` : words}`;
}

