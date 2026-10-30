import { aspectRatioNumeric } from "../src/core/aspectRatio";
import { ChromeSession, sleep } from "./chromeSession";
import { CliError } from "./load";
import { findChrome, preparePlayer, resolvePages } from "./render";

/**
 * A module played the way a learner plays it, step by step, with a picture and a short account of what changed after every step: which
 * blocks appeared or went, which slide it is now, what a quiz or gap text said. What `weft render` cannot show (it draws one slide in one
 * state): the slide after the second Weiter, a quiz after it was submitted, a gap text after it was filled in.
 *
 * Steps (one string each; words with spaces in "quotes"):
 *   weiter · zurueck          press → / ←  (the keys of a learner - the module's keyboard navigation has to be on; ← takes the builds of the slide back first)
 *   click <text>              click the first visible button, answer or link that has this text
 *   tick <n> [<n> ...]        tick the n-th answers (1, 2, ...) of the first quiz that is not answered yet
 *   submit                    press "Abschicken" of the first quiz or gap text that is not answered yet
 *   fill <text> [<text> ...]  fill in the gaps of the first gap text, in order
 *   key <Name>                press a key (Enter, Escape, ArrowRight ...)
 *   wait <ms>                 let time pass (animations)
 *   shot                      nothing - only a picture for the account (every step has one)
 */

export interface PlayStep {
  /** The step as given ("weiter", "tick 1 3"). */
  step: string;
  /** The slide shown after it ("3", "2.a.1"), or "Ende" on the final screen. */
  page: string;
  /** What changed, in words: "neu: …", "weg: …", "Folie 3 → 4", the messages of quizzes and gaps. */
  changes: string[];
  png: Uint8Array;
}

interface BlockState {
  id: string;
  kind: string;
  excerpt: string;
  visible: boolean;
}

interface Snapshot {
  pageId: string | null;
  done: boolean;
  blocks: BlockState[];
  messages: string[];
  /** The rows of the table on the finished screen (what the graded elements gave), cells joined by " | ". */
  summary: string[];
}

const SNAPSHOT = `(() => {
  const stage = document.querySelector('.weft-stage');
  const done = !!document.querySelector('.weft-done-message');
  const shown = (element) => {
    if (element.closest('[hidden]')) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.05;
  };
  const blocks = [...document.querySelectorAll('.weft-stage .weft-block')].map((block) => ({
    id: block.getAttribute('data-weft-block') || '',
    kind: [...block.classList].find((c) => c.startsWith('weft-block-') && c !== 'weft-block').slice(11),
    excerpt: block.innerText.replace(/\\s+/g, ' ').trim().slice(0, 40),
    visible: shown(block),
  }));
  const messages = [...document.querySelectorAll('.weft-quiz-feedback')].filter(shown).map((f) => f.innerText.replace(/\\s+/g, ' ').trim());
  const summary = [...document.querySelectorAll('.weft-done-summary tr')].map((row) => [...row.children].map((c) => c.innerText.trim()).join(' | '));
  return { pageId: stage ? stage.getAttribute('data-weft-page') : null, done, blocks, messages, summary };
})()`;

function tokens(step: string): string[] {
  const out: string[] = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  for (let match = pattern.exec(step); match; match = pattern.exec(step)) out.push(match[1] ?? match[2]);
  return out;
}

const quote = (value: string) => JSON.stringify(value);

interface Outcome {
  problem?: string;
  /** Said in the account, for steps that change nothing a block shows (ticking, filling in). */
  note?: string;
}

async function perform(session: ChromeSession, step: string): Promise<Outcome> {
  const [word, ...args] = tokens(step);
  switch (word) {
    case "weiter":
      await session.key("ArrowRight");
      return {};
    case "zurueck":
    case "zurück":
      await session.key("ArrowLeft");
      return {};
    case "key":
      if (!args[0]) throw new CliError('Welche Taste? key Enter');
      await session.key(args[0]);
      return {};
    case "wait":
      await sleep(Number(args[0]) || 500);
      return {};
    case "shot":
      return {};
    case "click": {
      const text = args.join(" ");
      if (!text) throw new CliError('Worauf? click "Los geht’s"');
      const result = await session.eval<string>(`(() => {
        const wanted = ${quote(text.toLowerCase())};
        const shown = (e) => { if (e.closest('[hidden]')) return false; const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
        const candidates = [...document.querySelectorAll('button, a, label, .weft-quiz-option, [role=button]')].filter((e) => shown(e) && !e.disabled);
        const target = candidates.find((e) => e.textContent.trim().toLowerCase() === wanted) || candidates.find((e) => e.textContent.toLowerCase().includes(wanted));
        if (!target) return 'nichts mit „' + ${quote(text)} + '“ zum Anklicken';
        target.click();
        return '';
      })()`);
      return result ? { problem: result } : {};
    }
    case "tick": {
      const numbers = args.map(Number);
      if (numbers.length === 0 || numbers.some((n) => !Number.isInteger(n) || n < 1)) throw new CliError("Welche Antworten? tick 1 3 (gezählt ab 1)");
      const result = await session.eval<string>(`(() => {
        const quiz = [...document.querySelectorAll('.weft-block-quiz, .weft-block-checker')].find((b) => b.querySelector('.weft-quiz-submit:not([hidden])'));
        if (!quiz) return 'kein Quiz oder Checker, das noch zu beantworten ist';
        const boxes = [...quiz.querySelectorAll('.weft-quiz-option-input')];
        for (const n of ${JSON.stringify(numbers)}) { if (!boxes[n - 1]) return 'das Quiz hat nur ' + boxes.length + ' Antworten'; if (!boxes[n - 1].checked) boxes[n - 1].click(); }
        return '';
      })()`);
      return result ? { problem: result } : { note: `Antworten angekreuzt: ${numbers.join(", ")}` };
    }
    case "zuordnen": {
      // zuordnen "Objekt" "Ziel": picks the object (by its text) and then the target, as the keyboard does - no dragging needed.
      if (args.length < 2) throw new CliError('Was wohin? zuordnen "Apfel" "Obst"');
      const result = await session.eval<string>(`(() => {
        const [objectText, targetText] = ${JSON.stringify(args)};
        const by = (selector, text) => [...document.querySelectorAll(selector)].find((b) => (b.innerText || b.getAttribute('aria-label') || '').trim().toLowerCase().includes(String(text).toLowerCase()));
        const source = by('.weft-matching-source', objectText);
        if (!source) return 'kein Objekt „' + objectText + '“ (mehr) zum Zuordnen';
        const target = by('.weft-matching-target', targetText);
        if (!target) return 'kein Ziel „' + targetText + '“';
        source.click();
        target.click();
        return '';
      })()`);
      return result ? { problem: result } : { note: `zugeordnet: ${args[0]} → ${args[1]}` };
    }
    case "loesung": {
      // loesung <Wort>: writes the word into the first solution word that can still be tried and presses "Abschicken". The note says how it went.
      const word = args.join(" ");
      if (word === "") throw new CliError('Welches Wort? loesung "Sonne"');
      const result = await session.eval<{ problem?: string; note?: string }>(`(async () => {
        const block = [...document.querySelectorAll('.weft-block-solution')].find((b) => b.querySelector('.weft-solution-input:not(:disabled)'));
        if (!block) return { problem: 'kein Lösungswort, das noch zu versuchen ist' };
        const input = block.querySelector('.weft-solution-input');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(word)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        block.querySelector('.weft-quiz-submit').click();
        await new Promise((resolve) => setTimeout(resolve, 100));
        const feedback = block.querySelector('.weft-quiz-feedback');
        return { note: 'Lösungswort „' + ${JSON.stringify(word)} + '“: ' + (feedback && !feedback.hidden ? feedback.textContent : 'nichts passiert') + (input.disabled ? ' (gesperrt)' : '') };
      })()`);
      return result.problem ? { problem: result.problem } : { note: result.note };
    }
    case "galerie": {
      // galerie weiter | zurueck | oeffnen | schliessen: the arrows of the first gallery on the slide, a click on the picture that is shown (it opens
      // large, with its caption), a click on the open picture (it closes). The note says which picture is shown and, once open, its caption.
      const what = args[0];
      if (!["weiter", "zurueck", "oeffnen", "schliessen"].includes(what ?? "")) throw new CliError("Was mit der Galerie? galerie weiter | zurueck | oeffnen | schliessen");
      const result = await session.eval<{ problem?: string; note?: string }>(`(async () => {
        const what = ${quote(what)};
        if (what === 'schliessen') {
          const open = document.querySelector('.weft-matching-lightbox');
          if (!open) return { problem: 'kein Bild ist geöffnet' };
          open.click();
          return { note: 'Bild geschlossen' };
        }
        const gallery = [...document.querySelectorAll('.weft-block-gallery')].find((b) => b.querySelector('.weft-gallery'));
        if (!gallery) return { problem: 'keine Galerie auf dieser Folie (oder sie hat noch kein Bild)' };
        const slides = [...gallery.querySelectorAll('.weft-gallery-slide')];
        const position = () => 'Bild ' + (slides.findIndex((s) => s.tabIndex === 0) + 1) + ' von ' + slides.length;
        // (While a picture is open large, the arrows of its window go on - and the carousel behind it follows.)
        const open = document.querySelector('.weft-matching-lightbox');
        if (open && (what === 'weiter' || what === 'zurueck')) {
          const arrow = open.querySelector(what === 'weiter' ? '.weft-gallery-arrow.is-next' : '.weft-gallery-arrow.is-prev');
          if (!arrow) return { problem: 'das geöffnete Bild gehört zu keiner Galerie mit mehreren Bildern' };
          if (arrow.disabled) return { problem: what === 'weiter' ? 'das ist schon das letzte Bild' : 'das ist schon das erste Bild' };
          arrow.click();
          // (The picture changes with a short move: wait for it.)
          await new Promise((resolve) => setTimeout(resolve, 600));
          const caption = open.querySelector('.weft-matching-lightbox-caption');
          return { note: position() + ' (geöffnet' + (caption && caption.textContent ? ': „' + caption.textContent + '“' : ', ohne Bildunterschrift') + ')' };
        }
        if (what === 'oeffnen') {
          const slide = gallery.querySelector('.weft-gallery-slide[tabindex="0"]');
          slide.click();
          const box = document.querySelector('.weft-matching-lightbox');
          const caption = box && box.querySelector('.weft-matching-lightbox-caption');
          return { note: 'Bild geöffnet' + (caption ? ': „' + caption.textContent + '“' : ' (ohne Bildunterschrift)') };
        }
        const arrow = gallery.querySelector(what === 'weiter' ? '.weft-gallery-arrow.is-next' : '.weft-gallery-arrow.is-prev');
        if (!arrow) return { problem: 'die Galerie hat nur ein Bild' };
        if (arrow.disabled) return { problem: what === 'weiter' ? 'das ist schon das letzte Bild' : 'das ist schon das erste Bild' };
        arrow.click();
        return { note: position() };
      })()`);
      return result.problem ? { problem: result.problem } : { note: result.note };
    }
    case "sortieren": {
      // sortieren "Ei" "Raupe" "Puppe": brings the objects into this order (by their texts), as the keyboard does: pick one up, move it with the
      // arrow keys, put it down - no dragging needed.
      if (args.length < 2) throw new CliError('In welche Reihenfolge? sortieren "Ei" "Raupe" "Puppe"');
      const result = await session.eval<string>(`(() => {
        const wanted = ${JSON.stringify(args)};
        const block = [...document.querySelectorAll('.weft-block-sort')].find((b) => b.querySelector('.weft-quiz-submit:not([hidden])'));
        if (!block) return 'kein Sortierrätsel, das noch zu sortieren ist';
        const list = block.querySelector('.weft-sort-list');
        const items = () => [...list.children];
        const textOf = (b) => (b.innerText || b.getAttribute('aria-label') || '').trim().toLowerCase();
        for (let place = 0; place < wanted.length; place++) {
          const text = String(wanted[place]).toLowerCase();
          const card = items().find((b) => textOf(b) === text) || items().find((b) => textOf(b).includes(text));
          if (!card) return 'kein Objekt „' + wanted[place] + '“';
          const steps = items().indexOf(card) - place;
          if (steps === 0) continue;
          card.focus();
          card.click();
          // (The keys along the line: across it, with several lines, one jumps a whole line.)
          const vertical = block.querySelector('.weft-sort').classList.contains('is-vertical');
          const [earlier, later] = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
          for (let i = 0; i < Math.abs(steps); i++) card.dispatchEvent(new KeyboardEvent('keydown', { key: steps > 0 ? earlier : later, bubbles: true, cancelable: true }));
          card.click();
        }
        return '';
      })()`);
      return result ? { problem: result } : { note: `sortiert: ${args.join(", ")}` };
    }
    case "submit": {
      const result = await session.eval<string>(`(() => {
        const button = [...document.querySelectorAll('.weft-quiz-submit')].find((b) => !b.hidden && !b.closest('[hidden]') && !b.disabled);
        if (!button) return 'nichts zum Abschicken';
        button.click();
        return '';
      })()`);
      return result ? { problem: result } : {};
    }
    case "fill": {
      if (args.length === 0) throw new CliError('Was eintragen? fill 12 4');
      const result = await session.eval<string>(`(() => {
        const cloze = [...document.querySelectorAll('.weft-block-cloze')].find((b) => b.querySelector('.weft-quiz-submit:not([hidden])'));
        if (!cloze) return 'kein Lückentext, der noch auszufüllen ist';
        const inputs = [...cloze.querySelectorAll('.weft-cloze-input')];
        const values = ${JSON.stringify(args)};
        values.forEach((value, i) => { if (inputs[i]) { inputs[i].value = value; inputs[i].dispatchEvent(new Event('input', { bubbles: true })); } });
        return values.length > inputs.length ? 'der Lückentext hat nur ' + inputs.length + ' Lücken' : '';
      })()`);
      return result ? { problem: result } : { note: `eingetragen: ${args.join(", ")}` };
    }
    default:
      throw new CliError(`Unbekannter Schritt „${step}". Möglich: weiter, zurueck, click <Text>, tick <n>…, zuordnen <Objekt> <Ziel>, sortieren <Objekt>…, galerie weiter|zurueck|oeffnen|schliessen, loesung <Wort>, submit, fill <Text>…, key <Taste>, wait <ms>, shot.`);
  }
}

function describeChange(before: Snapshot, after: Snapshot, labels: Record<string, string>): string[] {
  const changes: string[] = [];
  const name = (b: BlockState) => (b.excerpt ? `„${b.excerpt}${b.excerpt.length >= 40 ? "…" : ""}"` : b.kind);
  if (after.done && !before.done) {
    changes.push("Ende erreicht („Danke fürs Mitmachen!“)");
    if (after.summary.length > 0) changes.push(`Auswertung:\n    ${after.summary.join("\n    ")}`);
  }
  else if (after.pageId !== before.pageId && after.pageId) changes.push(`Folie ${before.pageId ? labels[before.pageId] ?? "?" : "–"} → ${labels[after.pageId] ?? after.pageId}`);
  else {
    const was = new Map(before.blocks.map((b) => [b.id, b]));
    for (const block of after.blocks) {
      const old = was.get(block.id);
      if (block.visible && old && !old.visible) changes.push(`neu: ${block.kind}${block.excerpt ? ` ${name(block)}` : ""}`);
      if (!block.visible && old?.visible) changes.push(`weg: ${block.kind}${block.excerpt ? ` ${name(block)}` : ""}`);
    }
  }
  for (const message of after.messages) if (!before.messages.includes(message)) changes.push(`Meldung: ${message}`);
  return changes;
}

export interface PlayOptions {
  page?: string;
  language?: string;
  chrome?: string;
  width?: number;
}

export async function playModule(file: string, steps: string[], options: PlayOptions = {}): Promise<{ start: PlayStep; steps: PlayStep[] }> {
  const player = await preparePlayer(file);
  const width = options.width ?? 1280;
  const height = Math.round(width / aspectRatioNumeric(player.content.aspectRatio));
  const chrome = findChrome(options.chrome);
  const playable = Object.entries(player.labels).filter(([id]) => player.content.pages[id] && !player.content.pages[id].jump);
  const first = options.page ?? playable[0]?.[1];
  if (!first) throw new CliError("Das Modul hat keine Folie, die sich spielen ließe.");
  const [{ id: startId }] = resolvePages(player.content, player.labels, [first]);
  const session = await ChromeSession.open(chrome, width, height);
  try {
    await session.load(await player.htmlFile(startId, { all: false, language: options.language }));
    const labelOf = (snapshot: Snapshot) => (snapshot.done ? "Ende" : snapshot.pageId ? player.labels[snapshot.pageId] ?? snapshot.pageId : "?");
    let current = await session.eval<Snapshot>(SNAPSHOT);
    const start: PlayStep = { step: "start", page: labelOf(current), changes: [], png: await session.screenshot() };
    const played: PlayStep[] = [];
    for (const step of steps) {
      const { problem, note } = await perform(session, step);
      await session.settle(step.startsWith("wait") ? 100 : 900);
      const next = await session.eval<Snapshot>(SNAPSHOT);
      const changes = describeChange(current, next, player.labels);
      if (problem) changes.unshift(`Das ging nicht: ${problem}`);
      else if (note) changes.unshift(note);
      else if (changes.length === 0 && !step.startsWith("shot") && !step.startsWith("wait")) changes.push("nichts hat sich geändert");
      played.push({ step, page: labelOf(next), changes, png: await session.screenshot() });
      current = next;
    }
    return { start, steps: played };
  } finally {
    session.close();
    player.cleanup();
  }
}

/** The steps from a string: "weiter; tick 1 3; submit" (or one per line). */
export function splitSteps(text: string): string[] {
  return text
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
