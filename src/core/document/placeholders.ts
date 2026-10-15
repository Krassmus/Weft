import type { Block, Page, PlaceholderBlock, TextBlock, WeftModule } from "../types";

/**
 * Placeholder texts (PlaceholderBlock in a layout, and the TextBlock with `placeholderOf` a page has for it): what carries the
 * formatting from one to the other. The placeholder's `html` is a sample text whose formatting - the elements around its text:
 * <p style="text-align:...">, <font face color>, <b>, <span style="font-size:...cqw"> - is what the texts of the pages start with.
 */

/** The body of a document made of `html` (the same in a browser and in the command line tool, which has its own DOMParser). */
function parseBody(html: string): HTMLElement {
  return new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html").body;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "PRE"]);

/** `lines` without the empty ones before and after the words (an empty text is one empty line). */
function trimEmpty(lines: string[]): string[] {
  let result = lines.length > 0 ? lines : [""];
  while (result.length > 1 && result[0].trim() === "") result = result.slice(1);
  while (result.length > 1 && result[result.length - 1].trim() === "") result = result.slice(0, -1);
  return result;
}

/** The words of some html as paragraphs (one string per paragraph, a line break splits too). */
export function plainParagraphs(html: string): string[] {
  const root = parseBody(html);
  // The <br> at the end of a paragraph is only what holds an empty paragraph open (or what a browser leaves behind): no line.
  root.querySelectorAll(Array.from(BLOCK_TAGS).join(",")).forEach((block) => {
    let last: Node | null = block.lastChild;
    while (last && last.nodeType === Node.ELEMENT_NODE && (last as HTMLElement).tagName !== "BR") last = last.lastChild;
    if (last && (last as HTMLElement).tagName === "BR") last.parentNode?.removeChild(last);
  });
  root.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  const paragraphs: string[] = [];
  let inline = "";
  const flush = () => {
    if (inline.trim() !== "") paragraphs.push(...inline.split("\n"));
    inline = "";
  };
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      inline += node.textContent ?? "";
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "UL" || node.tagName === "OL") {
      flush();
      node.childNodes.forEach(visit);
      flush();
      return;
    }
    if (BLOCK_TAGS.has(node.tagName)) {
      flush();
      paragraphs.push(...(node.textContent ?? "").split("\n"));
      return;
    }
    node.childNodes.forEach(visit);
  };
  root.childNodes.forEach(visit);
  flush();
  return paragraphs;
}

/**
 * `paragraphs` formatted like `sampleHtml`: every paragraph is a copy of the sample's first paragraph (the elements around its first
 * text: alignment, line height, font, colour, size, bold, ...) with the words put in. An empty paragraph keeps the formatting for
 * whatever is typed into it.
 */
export function applyPlaceholderStyle(sampleHtml: string, paragraphs: string[]): string {
  const root = parseBody(sampleHtml);
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let leaf: Node | null = null;
  let any: Node | null = null;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    any ??= node;
    if ((node.textContent ?? "").trim() !== "") {
      leaf = node;
      break;
    }
  }
  leaf ??= any;
  const plain = (text: string) => `<p>${text === "" ? "<br>" : escapeHtml(text)}</p>`;
  if (!leaf) return trimEmpty(paragraphs).map(plain).join("");

  // The element of the sample's top level that holds the first text, and the way down from it to that text.
  let top: Node = leaf;
  while (top.parentNode && top.parentNode !== root) top = top.parentNode;
  const path: number[] = [];
  for (let n: Node = leaf; n !== top; n = n.parentNode!) path.unshift(Array.prototype.indexOf.call(n.parentNode!.childNodes, n));
  const topIsText = top === leaf;

  // Empty paragraphs before and after the words are only space the text sits in (they push it down in its box, out of sight): left
  // out. An empty text is one empty paragraph.
  const lines = trimEmpty(paragraphs);

  const out: string[] = [];
  for (const paragraph of lines) {
    if (topIsText) {
      out.push(plain(paragraph));
      continue;
    }
    const clone = top.cloneNode(true) as HTMLElement;
    let target: Node = clone;
    for (const index of path) target = target.childNodes[index];
    // Other texts of the sample's paragraph (words in a different formatting) are not part of the style.
    const walkerClone = root.ownerDocument.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    const others: Node[] = [];
    let text: Node | null;
    while ((text = walkerClone.nextNode())) if (text !== target) others.push(text);
    others.forEach((n) => n.parentNode?.removeChild(n));
    target.textContent = paragraph;
    if (paragraph === "") target.parentNode?.insertBefore(root.ownerDocument.createElement("br"), target.nextSibling);
    // Elements that were only there for the other texts.
    let removed = true;
    while (removed) {
      removed = false;
      clone.querySelectorAll("*").forEach((el) => {
        if (el.childNodes.length === 0 && el.tagName !== "BR") {
          el.remove();
          removed = true;
        }
      });
    }
    // Every paragraph stands on its own: formatting that was only inline (no paragraph around it) gets one.
    out.push(BLOCK_TAGS.has(clone.tagName) ? clone.outerHTML : `<p>${clone.outerHTML}</p>`);
  }
  return out.join("");
}

/** The placeholder of the page's layout that `block` is the text for - null for a text of its own (or whose placeholder is gone). */
export function placeholderOfText(content: WeftModule, page: Page | undefined, block: Block): PlaceholderBlock | null {
  if (block.kind !== "text" || !block.placeholderOf || !page?.layoutId) return null;
  const candidate = content.layouts[page.layoutId]?.blocks[block.placeholderOf];
  return candidate && candidate.kind === "placeholder" ? candidate : null;
}

/** The texts of the pages that use `layoutId` whose formatting is not the sample's (the author formatted them differently, or the
 * sample was changed after they were made) - what "apply to all pages" would change. */
export function textsWithOtherFormatting(content: WeftModule, layoutId: string, placeholder: PlaceholderBlock): TextBlock[] {
  const differs = (html: string) => html !== applyPlaceholderStyle(placeholder.html, plainParagraphs(html));
  return Object.values(content.pages)
    .filter((page) => page.layoutId === layoutId)
    .flatMap((page) => textsForPlaceholder(page, placeholder.id))
    .filter((text) => differs(text.html) || Object.values(text.translations ?? {}).some((t) => t.html !== undefined && differs(t.html)));
}

/** The text blocks of `page` that are the page's text for placeholder `placeholderId`. */
export function textsForPlaceholder(page: Page, placeholderId: string): TextBlock[] {
  return Object.values(page.blocks).filter((b): b is TextBlock => b.kind === "text" && b.placeholderOf === placeholderId);
}
