import { aspectRatioNumeric } from "../src/core/aspectRatio";
import { ChromeSession } from "./chromeSession";
import { findChrome, preparePlayer, resolvePages } from "./render";
import type { Finding } from "./validate";

/**
 * The part of a module's layout that only a browser can tell: whether the content of a block fits into its box. `weft validate` reads the
 * file; this draws every slide with the module's own player (all there, as `weft render` shows it) and measures. A text that runs out of its
 * box is cut off at the box's edge for a learner - and nothing in the file says so.
 *
 * Besides what is on the slide, the answers of a quiz and of a gap text are measured with their feedback shown (it replaces the submit button
 * and may be what does not fit).
 */

interface Measured {
  blockId: string;
  kind: string;
  excerpt: string;
  /** Pixels the content is higher / wider than its box (0: fits). */
  overflowY: number;
  overflowX: number;
  boxHeight: number;
  boxWidth: number;
  stageHeight: number;
}

const MEASURE = `(() => {
  const stage = document.querySelector('.weft-stage');
  const stageHeight = stage.getBoundingClientRect().height;
  const out = [];
  const hiddenAway = (element) => {
    if (element.closest('[hidden]')) return true;
    const style = getComputedStyle(element);
    return style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0';
  };
  // How far what can be seen in a box reaches: the letters (their line boxes, not the leading between lines) and the things that are drawn.
  // The part of a line below the baseline is only a descender for most letters, so a little of it ("slack", 0.22 em) may be past the edge.
  const extent = (root) => {
    let bottom = -Infinity;
    let right = -Infinity;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || !node.parentElement || hiddenAway(node.parentElement)) continue;
      const fontSize = parseFloat(getComputedStyle(node.parentElement).fontSize) || 16;
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        bottom = Math.max(bottom, r.bottom - 0.22 * fontSize);
        right = Math.max(right, r.right);
      }
    }
    for (const element of root.querySelectorAll('input, svg, img, button, .weft-quiz-option, .weft-quiz-feedback, .weft-cloze-input')) {
      if (hiddenAway(element)) continue;
      const r = element.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      bottom = Math.max(bottom, r.bottom);
      right = Math.max(right, r.right);
    }
    return { bottom, right };
  };
  for (const block of stage.querySelectorAll('.weft-block-text, .weft-block-list, .weft-block-quiz, .weft-block-cloze, .weft-block-button')) {
    if (block.classList.contains('is-scrollable')) continue;
    const excerpt = block.innerText.replace(/\\s+/g, ' ').trim().slice(0, 48);
    // What the answer to a quiz or a gap text shows replaces its submit button: measure it shown.
    for (const feedback of block.querySelectorAll('.weft-quiz-feedback')) {
      const submit = block.querySelector('.weft-quiz-submit');
      if (submit) submit.hidden = true;
      feedback.hidden = false;
      feedback.className = 'weft-quiz-feedback is-incorrect';
      const title = feedback.querySelector('.weft-quiz-feedback-title');
      if (title && !title.textContent.trim()) title.textContent = 'Das war leider nicht richtig.';
    }
    const candidates = new Set([block, ...block.querySelectorAll(':scope > *')]);
    for (const element of block.querySelectorAll('*')) {
      const overflow = getComputedStyle(element).overflowY;
      if (overflow === 'auto' || overflow === 'scroll') candidates.add(element);
    }
    let overflowY = 0;
    let overflowX = 0;
    let box = block;
    for (const element of candidates) {
      const style = getComputedStyle(element);
      const clipsY = /hidden|auto|scroll|clip/.test(style.overflowY) || element.tagName === 'BUTTON';
      const clipsX = /hidden|auto|scroll|clip/.test(style.overflowX) || element.tagName === 'BUTTON';
      if (!clipsY && !clipsX) continue;
      const rect = element.getBoundingClientRect();
      const reach = extent(element);
      const y = reach.bottom - (rect.bottom - parseFloat(style.borderBottomWidth));
      const x = reach.right - (rect.right - parseFloat(style.borderRightWidth));
      if (clipsY && y > overflowY) { overflowY = y; box = element; }
      if (clipsX && x > overflowX) overflowX = x;
    }
    const rect = box.getBoundingClientRect();
    out.push({
      blockId: block.getAttribute('data-weft-block') || '',
      kind: [...block.classList].find((c) => c.startsWith('weft-block-') && c !== 'weft-block').slice(11),
      excerpt,
      overflowY: overflowY > 2 ? overflowY : 0,
      overflowX: overflowX > 2 ? overflowX : 0,
      boxHeight: rect.height,
      boxWidth: rect.width,
      stageHeight,
    });
  }
  return out;
})()`;

export async function checkLayout(file: string, refs?: string[], options: { chrome?: string; width?: number } = {}): Promise<Finding[]> {
  const player = await preparePlayer(file);
  const chrome = findChrome(options.chrome);
  const width = options.width ?? 1280;
  const height = Math.round(width / aspectRatioNumeric(player.content.aspectRatio));
  const session = await ChromeSession.open(chrome, width, height);
  const findings: Finding[] = [];
  try {
    const playable = Object.entries(player.labels)
      .filter(([id]) => player.content.pages[id] && !player.content.pages[id].jump)
      .map(([, label]) => label);
    for (const page of resolvePages(player.content, player.labels, refs ?? playable)) {
      await session.load(await player.htmlFile(page.id));
      const measured = await session.eval<Measured[]>(MEASURE);
      for (const m of measured) {
        if (m.overflowY === 0 && m.overflowX === 0) continue;
        const where = { page: { label: page.label, id: page.id }, blockId: m.blockId };
        const name = m.excerpt ? `„${m.excerpt}${m.excerpt.length >= 48 ? "…" : ""}"` : m.kind;
        if (m.overflowY > 0) {
          const needed = Math.ceil(((m.boxHeight + m.overflowY) / m.stageHeight) * 1000) / 10;
          const have = Math.round((m.boxHeight / m.stageHeight) * 1000) / 10;
          findings.push({
            severity: "warning",
            code: "block-overflow",
            ...where,
            message: `${m.kind}-Block ${name}: der Inhalt ist ${Math.round(m.overflowY)} px höher als sein Kasten und wird unten abgeschnitten.`,
            hint: `Den Block höher machen (er braucht mindestens ${needed} % der Folienhöhe, hat ${have} %) oder die Schrift verkleinern.`,
          });
        }
        if (m.overflowX > 0) {
          findings.push({
            severity: "warning",
            code: "block-overflow",
            ...where,
            message: `${m.kind}-Block ${name}: der Inhalt ist ${Math.round(m.overflowX)} px breiter als sein Kasten.`,
            hint: "Den Block breiter machen oder die Schrift verkleinern (ein sehr langes Wort bricht nicht um).",
          });
        }
      }
    }
  } finally {
    session.close();
    player.cleanup();
  }
  return findings;
}
