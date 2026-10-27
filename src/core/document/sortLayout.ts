import type { SortBlock } from "../types";

/**
 * How the objects of a sorting puzzle share the room: on one line - or, when they cannot stand on one at the size the author gave them, on several
 * (rows under each other along a horizontal line, columns side by side along a vertical one), each with a line of its own. The right order reads
 * like text: a row from left to right, then the next one; a column from top to bottom, then the next one. Kept in sync by hand with sortLayout in
 * player.runtime.js, which can't import this.
 *
 * The size along the line (itemSize.width of a horizontal one, .height of a vertical one) is the share of the whole line an object takes: as many
 * of them as fit in 100 percent stand on a line; with more objects than that the lines are filled evenly (nine on two lines: five and four).
 */
export function sortLayout(block: Pick<SortBlock, "orientation" | "itemSize" | "items">): { lines: number; per: number } {
  const count = block.items.length;
  const along = block.orientation === "horizontal" ? block.itemSize.width : block.itemSize.height;
  const fit = Math.max(1, Math.floor(100 / Math.max(1, along) + 0.001));
  if (count <= fit) return { lines: 1, per: Math.max(1, count) };
  const per = Math.ceil(count / Math.ceil(count / fit));
  return { lines: Math.ceil(count / per), per };
}

/** The size of an object in percent of its room (the whole line's room when it is alone on it, else the room of its place on it). */
export function sortItemBox(
  block: Pick<SortBlock, "orientation" | "itemSize">,
  layout: { lines: number; per: number },
  image: boolean,
): { width: number; height: number } {
  const { width, height } = block.itemSize;
  if (block.orientation === "horizontal") {
    // (A picture on a horizontal line has the room for twice the height; the words under the line move down with the lowest object.)
    return { width: layout.lines > 1 ? Math.min(100, width * layout.per) : width, height: image ? Math.min(100, height * 2) : height };
  }
  return { width, height: layout.lines > 1 ? Math.min(100, height * layout.per) : height };
}

/**
 * Where a dragged object goes: its place among the others (the number of the others it comes after). `boxes` are all the objects in their order on
 * the lines - the dragged one too, which still holds its place - with the middle of each along its line and across it; the pointer is given the
 * same way. It goes onto the line whose middle is nearest across, and there after every object whose middle the pointer has passed.
 */
export function sortDropIndex(per: number, boxes: { along: number; cross: number }[], dragged: number, along: number, cross: number): number {
  const lanes = Math.ceil(boxes.length / per);
  let lane = 0;
  let nearest = Infinity;
  for (let l = 0; l < lanes; l++) {
    const distance = Math.abs(boxes[l * per].cross - cross);
    if (distance < nearest) {
      nearest = distance;
      lane = l;
    }
  }
  let index = 0;
  let others = 0;
  boxes.forEach((box, i) => {
    if (i === dragged) return;
    others++;
    const boxLane = Math.floor(i / per);
    if (boxLane < lane || (boxLane === lane && along > box.along)) index = others;
  });
  return index;
}
