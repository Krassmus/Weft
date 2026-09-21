import { create } from "zustand";

/**
 * Bridges the sidebar's formatting controls (panels/BlockPanel.tsx) to whichever text block is
 * currently being edited directly on the canvas (BlockView.tsx) - a single module-level "active
 * editor" rather than something passed through props, since the two live in separate parts of
 * the component tree and the app only ever has one block selected (and therefore editable) at a
 * time anyway.
 *
 * Built on the browser's own contentEditable + execCommand rather than a custom rich-text model
 * - Weft's formatting needs are small (bold/italic/underline/color/size/alignment), and the
 * resulting HTML (<b>/<i>/<u>/<font>/a plain <span style="font-size:...cqw">) needs no special
 * handling to render correctly in the exported, framework-free player (see
 * core/runtime/player.runtime.js), which just drops block.html in verbatim.
 */

interface ActiveEditor {
  el: HTMLElement;
  commit: (html: string) => void;
}

let active: ActiveEditor | null = null;
let savedRange: Range | null = null;

// ---- what the sidebar shows - current formatting at the cursor/selection ---------------------

/** "mixed" means the selection spans both a value and its absence, or two different values -
 * the toolbar shows that as an indeterminate/blank state rather than picking one arbitrarily. */
export type TriState = "on" | "off" | "mixed";

export interface FormatSnapshot {
  /** Whether a text block is currently focused for editing at all - the sidebar greys/hides its
   * controls otherwise, since there's nothing for them to act on. */
  active: boolean;
  bold: TriState;
  italic: TriState;
  underline: TriState;
  align: "left" | "center" | "right" | "mixed";
  /** "" = no explicit font set (using the default) - distinct from "mixed". */
  fontFamily: string | "mixed";
  /** Rounded px-equivalent at the stage's current rendered size, for display only - the actual
   * stored value is in cqw (see applyFontSize) so it scales with the slide. null = no explicit
   * size set. */
  fontSizePx: number | "mixed" | null;
  /** "" = no explicit color set. */
  color: string | "mixed";
}

const INACTIVE_SNAPSHOT: FormatSnapshot = {
  active: false,
  bold: "off",
  italic: "off",
  underline: "off",
  align: "left",
  fontFamily: "",
  fontSizePx: null,
  color: "",
};

export const useFormatSnapshot = create<FormatSnapshot>(() => INACTIVE_SNAPSHOT);

function currentRange(): Range | null {
  if (!active) return null;
  const sel = window.getSelection();
  if (document.activeElement === active.el && sel && sel.rangeCount > 0 && active.el.contains(sel.anchorNode)) {
    return sel.getRangeAt(0);
  }
  return savedRange;
}

/** The elements to inspect for the current formatting - every text node's parent that the
 * (possibly collapsed) range touches. A collapsed cursor has no selected text, so it falls back
 * to whatever element it sits in/next to - what queryCommandState calls "the typing style". */
function referenceElements(range: Range, root: HTMLElement): HTMLElement[] {
  if (range.collapsed) {
    const node = range.startContainer;
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement | null);
    return el ? [el] : [root];
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (range.intersectsNode(n) && n.textContent ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const els: HTMLElement[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (n.parentElement) els.push(n.parentElement);
  }
  return els.length > 0 ? els : [root];
}

function triState(els: HTMLElement[], predicate: (el: HTMLElement) => boolean): TriState {
  let on = 0;
  for (const el of els) if (predicate(el)) on++;
  if (on === 0) return "off";
  if (on === els.length) return "on";
  return "mixed";
}

function triValue<T>(els: HTMLElement[], getValue: (el: HTMLElement) => T): T | "mixed" {
  const first = getValue(els[0]);
  for (const el of els.slice(1)) if (getValue(el) !== first) return "mixed";
  return first;
}

function isWithin(el: HTMLElement, tags: string, root: HTMLElement): boolean {
  const match = el.closest(tags);
  return !!match && root.contains(match);
}

/** The nearest block-level ancestor (a <p>, the root itself, ...) - execCommand's justify
 * commands set text-align on that element, not on the selected text's own span. */
function blockAncestor(el: HTMLElement, root: HTMLElement): HTMLElement {
  let cur: HTMLElement = el;
  while (cur !== root) {
    if (getComputedStyle(cur).display.startsWith("block") || /^(P|DIV|H[1-6]|LI)$/.test(cur.tagName)) return cur;
    if (!cur.parentElement) return root;
    cur = cur.parentElement;
  }
  return root;
}

function alignOf(el: HTMLElement, root: HTMLElement): "left" | "center" | "right" {
  const ta = getComputedStyle(blockAncestor(el, root)).textAlign;
  if (ta === "center") return "center";
  if (ta === "right" || ta === "end") return "right";
  return "left";
}

function fontFamilyOf(el: HTMLElement, root: HTMLElement): string {
  const font = el.closest("font[face]");
  return font && root.contains(font) ? (font.getAttribute("face") ?? "") : "";
}

function colorOf(el: HTMLElement, root: HTMLElement): string {
  const font = el.closest("font[color]");
  return font && root.contains(font) ? (font.getAttribute("color") ?? "") : "";
}

/** Walks up for the nearest ancestor (within root) carrying an explicit cqw font-size - see
 * applyFontSize, which is the only thing that ever sets one. */
function fontSizeCqwOf(el: HTMLElement, root: HTMLElement): number | null {
  let cur: HTMLElement | null = el;
  while (cur) {
    if (cur.style.fontSize.endsWith("cqw")) return parseFloat(cur.style.fontSize);
    if (cur === root) return null;
    cur = cur.parentElement;
  }
  return null;
}

function stageWidthPx(el: HTMLElement): number | null {
  const stage = el.closest(".weft-stage");
  return stage ? stage.getBoundingClientRect().width : null;
}

function computeSnapshot(): FormatSnapshot {
  if (!active) return INACTIVE_SNAPSHOT;
  const range = currentRange();
  if (!range) return { ...INACTIVE_SNAPSHOT, active: true };

  const root = active.el;
  const els = referenceElements(range, root);

  const fontSizeCqw = triValue(els, (el) => fontSizeCqwOf(el, root));
  const widthPx = stageWidthPx(root);
  const fontSizePx =
    fontSizeCqw === "mixed" || fontSizeCqw === null || !widthPx ? fontSizeCqw : Math.round((fontSizeCqw / 100) * widthPx);

  return {
    active: true,
    bold: triState(els, (el) => isWithin(el, "b,strong", root)),
    italic: triState(els, (el) => isWithin(el, "i,em", root)),
    underline: triState(els, (el) => isWithin(el, "u", root)),
    align: triValue(els, (el) => alignOf(el, root)),
    fontFamily: triValue(els, (el) => fontFamilyOf(el, root)),
    fontSizePx,
    color: triValue(els, (el) => colorOf(el, root)),
  };
}

function refreshSnapshot() {
  useFormatSnapshot.setState(computeSnapshot());
}

export function registerActiveEditable(entry: ActiveEditor | null) {
  // restoreSelection() below calls active.el.focus(), which re-fires this same editable's own
  // onFocus - re-registering itself, not a real switch to a different block. Wiping savedRange
  // on that redundant re-entry would erase the very range restoreSelection is about to apply.
  if (entry && active?.el === entry.el) {
    active = entry;
    refreshSnapshot();
    return;
  }
  active = entry;
  savedRange = null;
  refreshSnapshot();
}

export function hasActiveEditable(): boolean {
  return active !== null;
}

/** Call on selection/cursor changes inside the editable - remembers where formatting should
 * apply even once focus has briefly moved to a sidebar control (a <select>, a color/number
 * input) that needs its own focus to work, unlike a plain button - and refreshes what the
 * sidebar shows as the current formatting. */
export function saveSelection() {
  if (!active) return;
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && active.el.contains(sel.anchorNode)) {
    savedRange = sel.getRangeAt(0).cloneRange();
  }
  refreshSnapshot();
}

function restoreSelection() {
  if (!active || !savedRange) return;
  active.el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(savedRange);
}

export function applyFormat(command: string, value?: string) {
  if (!active) return;
  if (document.activeElement !== active.el) restoreSelection();
  document.execCommand(command, false, value);
  // execCommand wrapping only part of the text (the common case - picking a font for a
  // selected phrase, not the whole block) splits the original text node, so savedRange's
  // pre-mutation boundary points no longer land where they used to. The browser's own live
  // selection *does* still correctly cover the just-wrapped text right after execCommand
  // though, so recapture it here - otherwise the next format change (once focus has hopped
  // back to a sidebar control and restoreSelection() re-applies the now-stale savedRange)
  // silently collapses the selection instead of extending the new formatting.
  saveSelection();
  active.commit(active.el.innerHTML);
}

/** execCommand's "fontSize" only understands the legacy 1-7 scale, not arbitrary sizes - apply
 * the largest legacy size, then swap the <font size="7"> markers it leaves behind for a real
 * size. That size is in cqw, not px: the stage is a CSS containment context (container-type:
 * inline-size, see App.css/player.runtime.css) sized to the slide itself, so 1cqw is always 1%
 * of the slide's own rendered width - in the editor, in the sidebar thumbnail, and in the
 * exported module alike. The px value is only how the user thinks of it (and only correct at
 * the stage's current on-screen size); it's converted to the equivalent cqw right away so the
 * text then scales with the slide like everything else, without needing to say so.
 */
export function applyFontSize(px: number) {
  if (!active) return;
  if (document.activeElement !== active.el) restoreSelection();
  const widthPx = stageWidthPx(active.el);
  if (!widthPx) return;
  const cqw = (px / widthPx) * 100;
  document.execCommand("fontSize", false, "7");
  const spans: HTMLElement[] = [];
  active.el.querySelectorAll('font[size="7"]').forEach((el) => {
    const span = document.createElement("span");
    span.style.fontSize = `${cqw}cqw`;
    span.innerHTML = el.innerHTML;
    el.replaceWith(span);
    spans.push(span);
  });
  // Unlike applyFormat's execCommand-only wrap, replaceWith() here rebuilds the affected nodes
  // from an innerHTML string, so the browser's live selection (still pointing at the discarded
  // originals) is gone, not just stale - reconstruct it from the new spans before saving it,
  // or a second size change in a row would find nothing to resize (same failure as the
  // font-family case, just guaranteed on the very first call instead of the second).
  if (spans.length > 0) {
    const range = document.createRange();
    range.setStartBefore(spans[0]);
    range.setEndAfter(spans[spans.length - 1]);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
  saveSelection();
  active.commit(active.el.innerHTML);
}
