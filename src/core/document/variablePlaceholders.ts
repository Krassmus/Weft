import type { Block } from "../types";
import { variableWordings } from "../blocks/registry";

import { tr } from "../i18n/tr";
// Must match VARIABLE_PLACEHOLDER in player.runtime.js: a placeholder is recognised only when it
// sits inside ONE text node, i.e. has no formatting in the middle of it.
const IN_NODE = /\{\{([^{}<>]*)\}\}/g;
const IN_TEXT = /\{\{([^{}]*)\}\}/g;

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The rich-text/plain-text strings of `block` that can contain {{variable}} placeholders (the
 * same ones the player substitutes in: text, a quiz's question and options, a button's label),
 * all as HTML - a button's plain label is escaped first, so it parses as the text it is. */
export function placeholderSources(block: Block): string[] {
  switch (block.kind) {
    // Every language's wording, not just the default's - a placeholder is just as wrong in French.
    case "placeholder":
      return [block.html];
    case "cloze":
      return [block.html, ...Object.values(block.translations ?? {}).flatMap((t) => (t.html !== undefined ? [t.html] : []))];
    case "quiz":
      return [
        block.questionHtml,
        ...block.options.map((o) => o.html),
        ...Object.values(block.translations ?? {}).flatMap((t) => [
          ...(t.questionHtml !== undefined ? [t.questionHtml] : []),
          ...Object.values(t.options ?? {}),
        ]),
      ];
    case "matching":
      // The words of the cards (plain texts, escaped first), in every language.
      return [
        ...[...block.sources, ...block.targets].filter((item) => item.kind === "text").map((item) => escapeText(item.text)),
        ...Object.values(block.translations ?? {}).flatMap((t) => Object.values(t.items ?? {}).map(escapeText)),
      ];
    case "sort":
      // The words of the objects and the two ends of the line (plain texts, escaped first), in every language.
      return [
        ...block.items.filter((item) => item.kind === "text").map((item) => escapeText(item.text)),
        ...[block.startLabel, block.endLabel].filter((t): t is string => !!t).map(escapeText),
        ...Object.values(block.translations ?? {}).flatMap((t) => [...Object.values(t.items ?? {}), t.startLabel, t.endLabel].filter((x): x is string => !!x).map(escapeText)),
      ];
    default:
      // (A block that describes itself says which of its texts are seen: plain texts, escaped first.)
      return variableWordings(block).flatMap(({ own, translated, html }) => [...(own ? [html ? own : escapeText(own)] : []), ...translated.map((words) => (html ? words : escapeText(words)))]);
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
    if (!variableNames.has(name)) problems.push(tr("ui.variable_does_not_exist", { name }));
  }

  // Everything that looks like a placeholder once formatting is ignored - whatever of that wasn't
  // recognised above is split by formatting.
  const remaining = [...recognised];
  for (const match of (body.textContent ?? "").matchAll(IN_TEXT)) {
    const index = remaining.indexOf(match[0]);
    if (index >= 0) remaining.splice(index, 1);
    else problems.push(tr("ui.placeholder_formatting_inside", { placeholder: match[0] }));
  }
  return problems;
}

export function findBlockPlaceholderProblems(block: Block, variableNames: ReadonlySet<string>): string[] {
  return [...new Set(placeholderSources(block).flatMap((html) => findPlaceholderProblems(html, variableNames)))];
}

/** The html of a picture of a page (a thumbnail, the PDF), with a {{progress}} in it as the value `progress` has on that page (the name is matched the way
 * the player matches it); without a value (null) the placeholder stays. */
export function withProgress(html: string, progress: number | null | undefined): string {
  return progress == null ? html : html.replace(/\{\{([^{}<>]*)\}\}/g, (all, name: string) => (name.trim() === "progress" ? String(progress) : all));
}
