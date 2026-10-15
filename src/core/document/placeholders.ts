import type { Block, Page, PlaceholderBlock, TextBlock, WeftModule } from "../types";

/**
 * Placeholder texts (PlaceholderBlock in a layout, and the TextBlock with `placeholderOf` a page has for it): what carries the
 * formatting from one to the other. The placeholder's `html` is a sample text whose formatting - the elements around its text:
 * <p style="text-align:...">, <font face color>, <b>, <span style="font-size:...cqw"> - is what the texts of the pages start with.
 */

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const BLOCK_TAGS = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "PRE"]);

/** The words of some html as paragraphs (one string per paragraph, a line break splits too). */
export function plainParagraphs(html: string): string[] {
  const root = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;
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
  const root = new DOMParser().parseFromString(`<body>${sampleHtml}</body>`, "text/html").body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
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
  if (!leaf) return (paragraphs.length > 0 ? paragraphs : [""]).map(plain).join("");

  // The element of the sample's top level that holds the first text, and the way down from it to that text.
  let top: Node = leaf;
  while (top.parentNode && top.parentNode !== root) top = top.parentNode;
  const path: number[] = [];
  for (let n: Node = leaf; n !== top; n = n.parentNode!) path.unshift(Array.prototype.indexOf.call(n.parentNode!.childNodes, n));
  const topIsText = top === leaf;

  const out: string[] = [];
  for (const paragraph of paragraphs.length > 0 ? paragraphs : [""]) {
    if (topIsText) {
      out.push(plain(paragraph));
      continue;
    }
    const clone = top.cloneNode(true) as HTMLElement;
    let target: Node = clone;
    for (const index of path) target = target.childNodes[index];
    // Other texts of the sample's paragraph (words in a different formatting) are not part of the style.
    const walkerClone = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
    const others: Node[] = [];
    let text: Node | null;
    while ((text = walkerClone.nextNode())) if (text !== target) others.push(text);
    others.forEach((n) => n.parentNode?.removeChild(n));
    target.textContent = paragraph;
    if (paragraph === "") target.parentNode?.insertBefore(document.createElement("br"), target.nextSibling);
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
    out.push(clone.outerHTML);
  }
  return out.join("");
}

/** The placeholder of the page's layout that `block` is the text for - null for a text of its own (or whose placeholder is gone). */
export function placeholderOfText(content: WeftModule, page: Page | undefined, block: Block): PlaceholderBlock | null {
  if (block.kind !== "text" || !block.placeholderOf || !page?.layoutId) return null;
  const candidate = content.layouts[page.layoutId]?.blocks[block.placeholderOf];
  return candidate && candidate.kind === "placeholder" ? candidate : null;
}

/** The text blocks of `page` that are the page's text for placeholder `placeholderId`. */
export function textsForPlaceholder(page: Page, placeholderId: string): TextBlock[] {
  return Object.values(page.blocks).filter((b): b is TextBlock => b.kind === "text" && b.placeholderOf === placeholderId);
}
