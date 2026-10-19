import { buildEventGraph } from "../eventGraph/buildEventGraph";
import type { Layout, Page } from "../types";
import { blockEffectNodeId } from "./pageTimeline";
import { orderedValues } from "./ordering";

/** When each event of the page happens at the earliest, counted as [presses of Weiter, milliseconds after the last of them] - from its event graph.
 * What nothing leads to from the start of the page (it waits for a quiz, say) has no entry. */
export function eventTimes(page: Page, layout: Layout | null | undefined): Map<string, [number, number]> {
  const graph = buildEventGraph(page, layout ?? null);
  const best = new Map<string, [number, number]>([["start", [0, 0]]]);
  const queue = ["start"];
  for (let steps = 0; queue.length > 0 && steps < 5000; steps++) {
    const id = queue.shift() as string;
    const at = best.get(id) as [number, number];
    for (const trigger of graph.triggers.filter((t) => t.from === id)) {
      const time: [number, number] = trigger.weiter ? [at[0] + 1, trigger.delayMs] : [at[0], at[1] + trigger.delayMs];
      const known = best.get(trigger.to);
      if (!known || time[0] < known[0] || (time[0] === known[0] && time[1] < known[1])) {
        best.set(trigger.to, time);
        queue.push(trigger.to);
      }
    }
  }
  return best;
}

/**
 * The order a page's own blocks are read in (and gone through with Tab in the editor): by their place on the slide, row by row from the
 * top and left to right within a row; the blocks that appear one after another (an Aufbau after a press of Weiter or a delay) keep the
 * order of their appearance among themselves and take the places that the sorting by place gave to them. The same as `readingOrder` in
 * player.runtime.js, which orders what the player puts into the document - keep the two alike.
 */
export function pageReadingOrder(page: Page, layout: Layout | null | undefined): string[] {
  const blocks = orderedValues(page.blocks).filter((block) => block.kind !== "script");
  const byTop = [...blocks].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  const rows: { top: number; bottom: number; items: typeof blocks }[] = [];
  for (const block of byTop) {
    const middle = block.position.y + block.position.height / 2;
    const row = rows[rows.length - 1];
    if (row && middle >= row.top && middle <= row.bottom) row.items.push(block);
    else rows.push({ top: block.position.y, bottom: block.position.y + block.position.height, items: [block] });
  }
  const ordered = rows.flatMap((row) => [...row.items].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y));

  const best = eventTimes(page, layout);
  const slots: number[] = [];
  const built: { id: string; time: [number, number]; index: number }[] = [];
  ordered.forEach((block, index) => {
    const time = best.get(blockEffectNodeId(block.id, "entrance"));
    if (!time || (time[0] === 0 && time[1] === 0)) return;
    slots.push(index);
    built.push({ id: block.id, time, index });
  });
  built.sort((a, b) => a.time[0] - b.time[0] || a.time[1] - b.time[1] || a.index - b.index);
  const result = ordered.map((block) => block.id);
  built.forEach((entry, n) => {
    result[slots[n]] = entry.id;
  });
  return result;
}
