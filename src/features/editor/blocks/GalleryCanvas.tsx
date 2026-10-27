import { useState } from "react";
import type { GalleryBlock } from "../../../core/types";
import { GalleryView } from "./GalleryView";

/**
 * A gallery on the canvas: once the block is selected (before that a press on it moves the block, like with any other), its arrows and dots go
 * through the pictures, to see them the way the learner will. Which picture is shown is only what the author looks at - nothing is written into
 * the block.
 */
export function GalleryCanvas({ block, selected }: { block: GalleryBlock; selected: boolean }) {
  const [index, setIndex] = useState(0);
  return <GalleryView block={block} index={index} onIndex={selected ? setIndex : undefined} />;
}
