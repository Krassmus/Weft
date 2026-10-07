import type { ArrowBlock, ArrowPoint, BlockPosition } from "../types";

/** The smallest the box of an arrow may be in either direction (percent of the slide's width): a straight
 * horizontal arrow has no height of its own, and a box without one can't be grabbed. */
const MIN_BOX = 3;

/** An arrow with its waypoints (in percent of its box) as `points`, and the box that fits them: the box is
 * made to be the bounding box of the waypoints, and the waypoints are written again relative to it. Works in
 * the block's own turned frame, so that a rotated arrow stays where it is on the slide while its box changes
 * (`slideAspect` = the slide's width : height, which tells how a percent of its height compares with one of
 * its width). Called after the waypoints were edited. */
export function fitArrowBox(position: BlockPosition, points: ArrowPoint[], slideAspect: number): Pick<ArrowBlock, "position" | "points"> {
  // Everything in "percent of the slide's width", both ways - the same unit, so rotating is plain geometry.
  const width = position.width;
  const height = position.height / slideAspect;
  const local = points.map((p) => ({ x: ((p.x - 50) / 100) * width, y: ((p.y - 50) / 100) * height }));
  let minX = Math.min(...local.map((p) => p.x));
  let maxX = Math.max(...local.map((p) => p.x));
  let minY = Math.min(...local.map((p) => p.y));
  let maxY = Math.max(...local.map((p) => p.y));
  if (maxX - minX < MIN_BOX) {
    const middle = (minX + maxX) / 2;
    minX = middle - MIN_BOX / 2;
    maxX = middle + MIN_BOX / 2;
  }
  if (maxY - minY < MIN_BOX) {
    const middle = (minY + maxY) / 2;
    minY = middle - MIN_BOX / 2;
    maxY = middle + MIN_BOX / 2;
  }
  const offsetX = (minX + maxX) / 2;
  const offsetY = (minY + maxY) / 2;
  const angle = ((position.rotation ?? 0) * Math.PI) / 180;
  const centerX = position.x + position.width / 2 + (offsetX * Math.cos(angle) - offsetY * Math.sin(angle));
  const centerY = position.y + position.height / 2 + (offsetX * Math.sin(angle) + offsetY * Math.cos(angle)) * slideAspect;
  const newWidth = maxX - minX;
  const newHeight = (maxY - minY) * slideAspect;
  return {
    position: { ...position, x: centerX - newWidth / 2, y: centerY - newHeight / 2, width: newWidth, height: newHeight },
    points: local.map((p) => ({ x: ((p.x - minX) / (maxX - minX)) * 100, y: ((p.y - minY) / (maxY - minY)) * 100 })),
  };
}

export function defaultArrowColor(): string {
  return "#18181b";
}
