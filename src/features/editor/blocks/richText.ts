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
  /** Current font size in px, resolved from the DOM either way: an explicit override (see
   * applyFontSize) converted from its stored cqw back to the stage's current rendered size, or
   * otherwise whatever the browser is actually rendering it at (via getComputedStyle, which
   * already resolves .weft-block's own base cqw rule - see App.css - to a real pixel value for
   * the stage's current width). null only when nothing is focused at all (see `active`);
   * "mixed" when the selection spans genuinely different rendered sizes. */
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
  // No explicit cqw override on (all of) the selection doesn't mean "no size" - text still
  // renders at whatever .weft-block's own base rule resolves to, which depends on the stage's
  // current width same as an explicit override does. Falling back to a guessed constant here
  // (as an earlier version of this code, and the size stepper that reads it, both did) shows a
  // number with no relation to the actual text, and jumps to a wildly wrong size the moment
  // it's used as the base for a +/- step.
  const fontSizePx =
    fontSizeCqw === "mixed"
      ? "mixed"
      : fontSizeCqw !== null && widthPx
        ? Math.round((fontSizeCqw / 100) * widthPx)
        : triValue(els, (el) => Math.round(parseFloat(getComputedStyle(el).fontSize)));

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

let pinned = false;

/** While a dialog for the text is open (the dialog "Schrift"), the editor stays the active one however the focus moves about in it. */
export function pinActiveEditor(on: boolean) {
  pinned = on;
}

export function registerActiveEditable(entry: ActiveEditor | null) {
  if (entry === null && pinned) return;
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
  active.el.querySelectorAll('font[size="7"]').forEach((fontEl) => {
    const span = document.createElement("span");
    span.style.fontSize = `${cqw}cqw`;
    span.innerHTML = fontEl.innerHTML;
    spans.push(span);
    // execCommand merges size onto whatever <font> already wraps the selection rather than
    // nesting a new element - so a font already carrying face/color (from a prior font-family
    // or color change) shows up here too, not just a bare size=7 one. Discarding the whole
    // element for the span would silently drop that face/color along with it; keep the <font>
    // (minus the size attribute) as the outer wrapper and nest the resized span inside instead.
    if (fontEl.hasAttribute("face") || fontEl.hasAttribute("color")) {
      fontEl.removeAttribute("size");
      fontEl.innerHTML = "";
      fontEl.appendChild(span);
    } else {
      fontEl.replaceWith(span);
    }
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

// ---- the options of the dialog "Schrift": line height, small capitals, a gradient or picture behind the letters --------------------

/** What shows behind (through) the letters of a text, see applyExtendedFormat. A picture is an asset of the document. */
export type TextBackground =
  | { kind: "none" }
  | { kind: "gradient"; from: string; to: string; angle: number }
  | { kind: "image"; assetId: string };

export interface ExtendedFormat {
  /** The factor of the line height of the block(s) of the selection; null: no value of its own (the normal one). */
  lineHeight: number | null | "mixed";
  /** The space below a paragraph, in em (the space between two paragraphs); null: no value of its own (the normal one). */
  paragraphSpacing: number | null | "mixed";
  smallCaps: TriState;
  background: TextBackground | "mixed";
}

function backgroundOf(el: HTMLElement, root: HTMLElement): TextBackground {
  const marked = el.closest<HTMLElement>("[data-weft-bg]");
  if (!marked || !root.contains(marked)) return { kind: "none" };
  if (marked.getAttribute("data-weft-bg") === "image") return { kind: "image", assetId: marked.getAttribute("data-weft-bg-asset") ?? "" };
  return {
    kind: "gradient",
    from: marked.getAttribute("data-weft-bg-from") ?? "#3b82f6",
    to: marked.getAttribute("data-weft-bg-to") ?? "#ec4899",
    angle: Number(marked.getAttribute("data-weft-bg-angle") ?? 90),
  };
}

/** What the selection has of the options of the dialog "Schrift" (null: no text is being edited). */
export function readExtendedFormat(): ExtendedFormat | null {
  if (!active) return null;
  const range = currentRange();
  if (!range) return null;
  const root = active.el;
  const els = referenceElements(range, root);
  const background = triValue(els, (el) => JSON.stringify(backgroundOf(el, root)));
  const lineHeight = triValue(els, (el) => {
    const value = parseFloat(blockAncestor(el, root).style.lineHeight);
    return Number.isFinite(value) ? value : null;
  });
  const paragraphSpacing = triValue(els, (el) => {
    const block = blockAncestor(el, root);
    if (!block.style.marginBottom.endsWith("em")) return null;
    const value = parseFloat(block.style.marginBottom);
    return Number.isFinite(value) ? value : null;
  });
  return {
    lineHeight,
    paragraphSpacing,
    smallCaps: triState(els, (el) => getComputedStyle(el).fontVariantCaps === "small-caps"),
    background: background === "mixed" ? "mixed" : (JSON.parse(background) as TextBackground),
  };
}

/** Puts the whole text of the edited block into the selection when there is none (just a caret): what the dialog's options are then for. */
export function selectAllIfCollapsed() {
  if (!active) return;
  const range = currentRange();
  if (range && !range.collapsed) return;
  const all = document.createRange();
  all.selectNodeContents(active.el);
  savedRange = all;
  active.el.focus();
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(all);
}

const BACKGROUND_STYLES = ["backgroundImage", "backgroundClip", "webkitBackgroundClip", "webkitTextFillColor", "backgroundSize", "backgroundPosition", "webkitBoxDecorationBreak", "boxDecorationBreak"];

/** Takes `what` (the gradient/picture, or the small capitals) off every element the range touches; a span that has nothing left is
 * taken out. */
function clearInlineStyles(range: Range, root: HTMLElement, what: "background" | "smallCaps") {
  root.querySelectorAll<HTMLElement>("span").forEach((span) => {
    if (!range.intersectsNode(span)) return;
    if (what === "background" && span.hasAttribute("data-weft-bg")) {
      for (const name of [...span.getAttributeNames()]) if (name.startsWith("data-weft-bg")) span.removeAttribute(name);
      const style = span.style as unknown as Record<string, string>;
      for (const property of BACKGROUND_STYLES) style[property] = "";
    }
    if (what === "smallCaps" && span.style.fontVariant) span.style.fontVariant = "";
    if (span.getAttributeNames().length === 0 || (span.getAttributeNames().length === 1 && !span.getAttribute("style")?.trim())) {
      span.replaceWith(...Array.from(span.childNodes));
    }
  });
}

/** Wraps the selection in a <span> with `styles` and `attributes` - the same way applyFontSize finds the elements execCommand makes. */
function wrapSelection(styles: Record<string, string>, attributes: Record<string, string>): HTMLElement[] {
  if (!active) return [];
  document.execCommand("fontSize", false, "6");
  const spans: HTMLElement[] = [];
  active.el.querySelectorAll('font[size="6"]').forEach((fontEl) => {
    const span = document.createElement("span");
    for (const [property, value] of Object.entries(styles)) span.style.setProperty(property, value);
    for (const [name, value] of Object.entries(attributes)) span.setAttribute(name, value);
    span.innerHTML = fontEl.innerHTML;
    spans.push(span);
    if (fontEl.hasAttribute("face") || fontEl.hasAttribute("color")) {
      fontEl.removeAttribute("size");
      fontEl.innerHTML = "";
      fontEl.appendChild(span);
    } else {
      fontEl.replaceWith(span);
    }
  });
  return spans;
}

export interface ExtendedFormatInput {
  /** undefined: leave as it is; null: back to the normal line height. */
  lineHeight?: number | null;
  /** The space between paragraphs, in em; null: back to the normal one. */
  paragraphSpacing?: number | null;
  smallCaps?: boolean;
  /** `url` of an image: what the asset can be shown by right now (the document only stores the asset's id). */
  background?: TextBackground & { url?: string };
}

/**
 * Applies the options of the dialog "Schrift" to the selection (the saved one, if the focus is in the dialog): the line height goes to
 * the paragraphs the selection touches (it is a property of a block, not of a few words), the rest to a <span> around the selection.
 */
export function applyExtendedFormat(input: ExtendedFormatInput) {
  if (!active) return;
  if (document.activeElement !== active.el) restoreSelection();
  const root = active.el;
  const range = currentRange();
  if (!range) return;

  if (input.lineHeight !== undefined || input.paragraphSpacing !== undefined) {
    const blocks = new Set<HTMLElement>();
    for (const el of referenceElements(range, root)) blocks.add(blockAncestor(el, root));
    blocks.forEach((block) => {
      if (input.lineHeight !== undefined) block.style.lineHeight = input.lineHeight === null ? "" : String(input.lineHeight);
      if (input.paragraphSpacing !== undefined) {
        // The space is the paragraph's own bottom margin (its top margin goes, or the browser's normal 1em would be the larger one).
        block.style.marginTop = input.paragraphSpacing === null ? "" : "0";
        block.style.marginBottom = input.paragraphSpacing === null ? "" : `${input.paragraphSpacing}em`;
      }
    });
  }

  const styles: Record<string, string> = {};
  const attributes: Record<string, string> = {};
  if (input.smallCaps !== undefined) {
    clearInlineStyles(range, root, "smallCaps");
    if (input.smallCaps) styles["font-variant"] = "small-caps";
  }
  const background = input.background;
  if (background) {
    clearInlineStyles(range, root, "background");
    if (background.kind === "gradient") {
      styles["background-image"] = `linear-gradient(${background.angle}deg, ${background.from}, ${background.to})`;
      attributes["data-weft-bg"] = "gradient";
      attributes["data-weft-bg-from"] = background.from;
      attributes["data-weft-bg-to"] = background.to;
      attributes["data-weft-bg-angle"] = String(background.angle);
    } else if (background.kind === "image") {
      if (background.url) styles["background-image"] = `url("${background.url}")`;
      attributes["data-weft-bg"] = "image";
      attributes["data-weft-bg-asset"] = background.assetId;
      styles["background-size"] = "cover";
      styles["background-position"] = "center";
    }
    if (background.kind !== "none") {
      styles["background-clip"] = "text";
      styles["-webkit-background-clip"] = "text";
      styles["-webkit-text-fill-color"] = "transparent";
      // Each line of a text that wraps has the picture/gradient of its own.
      styles["-webkit-box-decoration-break"] = "clone";
      styles["box-decoration-break"] = "clone";
    }
  }
  if (Object.keys(styles).length > 0 && !range.collapsed) {
    const spans = wrapSelection(styles, attributes);
    if (spans.length > 0) {
      const wrapped = document.createRange();
      wrapped.setStartBefore(spans[0]);
      wrapped.setEndAfter(spans[spans.length - 1]);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(wrapped);
    }
  }
  saveSelection();
  active.commit(root.innerHTML);
}

/** Gives the elements of `root` that carry a picture of the document (data-weft-bg-asset) the address it can be shown by - the stored
 * html has only the id (see EditableRichText), the address of an asset is different per session. */
export function resolveInlineAssets(root: HTMLElement, urlFor: (assetId: string) => string | undefined) {
  root.querySelectorAll<HTMLElement>("[data-weft-bg-asset]").forEach((el) => {
    const url = urlFor(el.getAttribute("data-weft-bg-asset") ?? "");
    if (url) el.style.backgroundImage = `url("${url}")`;
  });
}

/** The html as it is stored: the address a picture is shown by in this session is not part of it. */
export function storeableHtml(html: string): string {
  if (!html.includes("data-weft-bg-asset")) return html;
  const body = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;
  body.querySelectorAll<HTMLElement>("[data-weft-bg-asset]").forEach((el) => {
    el.style.backgroundImage = "";
    if (el.getAttribute("style")?.trim() === "") el.removeAttribute("style");
  });
  return body.innerHTML;
}
