import { sortDropIndex, sortLayout } from "../blocks/sort/render.js";
import type { SortBlock } from "../types";

// How the objects of a sorting puzzle share the room (sortLayout), and where a dragged one goes among the others (sortDropIndex), is in
// blocks/sort/render.js - the player and the editor use the same.
export { sortDropIndex, sortLayout };

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
