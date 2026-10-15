import { orderedValues } from "../../../core/document/ordering";
import { pageLabels } from "../../../core/document/pageLabels";
import type { Page, WeftModule } from "../../../core/types";

/** The first words of a page's text, to tell pages apart by in a list. */
function pageTitle(page: Page): string {
  for (const block of orderedValues(page.blocks)) {
    if (block.kind !== "text") continue;
    const div = document.createElement("div");
    div.innerHTML = block.html;
    const text = (div.textContent ?? "").trim().replace(/\s+/g, " ");
    if (text) return text.length > 28 ? `${text.slice(0, 27)}…` : text;
  }
  return "";
}

/** The pages a jump can lead to (every page that is not a jump page itself), in the order of the sidebar. With `withTitle` the
 * first words of the page's text follow its number. */
export function pageChoices(content: WeftModule, withTitle = true): { pageId: string; label: string }[] {
  const labels = pageLabels(content);
  return Object.entries(labels)
    .filter(([pageId]) => content.pages[pageId] && !content.pages[pageId].jump)
    .map(([pageId, label]) => {
      const title = withTitle ? pageTitle(content.pages[pageId]) : "";
      return { pageId, label: title ? `${label} · ${title}` : label };
    });
}

