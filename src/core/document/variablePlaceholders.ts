import type { Block } from "../types";

// Must match VARIABLE_PLACEHOLDER in player.runtime.js: a placeholder is recognised only when it
// sits inside ONE text node, i.e. has no formatting in the middle of it.
const IN_NODE = /\{\{([^{}<>]*)\}\}/g;
const IN_TEXT = /\{\{([^{}]*)\}\}/g;

/** The rich-text/plain-text strings of `block` that can contain {{variable}} placeholders (the
 * same ones the player substitutes in: text, a quiz's question and options, a button's label),
 * all as HTML - a button's plain label is escaped first, so it parses as the text it is. */
export function placeholderSources(block: Block): string[] {
  switch (block.kind) {
    case "text":
      return [block.html];
    case "quiz":
      return [block.questionHtml, ...block.options.map((o) => o.html)];
    case "button":
      return [block.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")];
    default:
      return [];
  }
}

/**
 * Human-readable (German) reasons why a {{placeholder}} somewhere in `html` won't show its value
 * when played: the named variable doesn't exist, or the placeholder has formatting inside it
 * (e.g. {{meine<b>variable</b>}}) so the player can't see it as one piece. Empty when everything
 * in it is fine - including when it has no placeholders at all.
 */
export function findPlaceholderProblems(html: string, variableNames: ReadonlySet<string>): string[] {
  if (!html.includes("{{")) return [];
  const body = new DOMParser().parseFromString(html, "text/html").body;

  // What the player would recognise: matches within single text nodes.
  const recognised: string[] = [];
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    for (const match of (walker.currentNode.nodeValue ?? "").matchAll(IN_NODE)) recognised.push(match[0]);
  }

  const problems: string[] = [];
  for (const raw of recognised) {
    const name = raw.slice(2, -2).trim();
    if (!variableNames.has(name)) problems.push(`Die Variable „${name}" gibt es nicht.`);
  }

  // Everything that looks like a placeholder once formatting is ignored - whatever of that wasn't
  // recognised above is split by formatting.
  const remaining = [...recognised];
  for (const match of (body.textContent ?? "").matchAll(IN_TEXT)) {
    const index = remaining.indexOf(match[0]);
    if (index >= 0) remaining.splice(index, 1);
    else problems.push(`${match[0]} enthält Formatierung mitten im Namen und kann nicht ausgewertet werden. Eine Variable lässt sich nur als Ganzes formatieren.`);
  }
  return problems;
}

export function findBlockPlaceholderProblems(block: Block, variableNames: ReadonlySet<string>): string[] {
  return [...new Set(placeholderSources(block).flatMap((html) => findPlaceholderProblems(html, variableNames)))];
}
