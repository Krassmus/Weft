import { useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import { addListAssets } from "../../../core/document/filesActions";
import type { BlockContainerRef } from "../../../core/document/store";

/** Whether a drag carries files (from the Finder) - not our own dragging of blocks, which uses pointer events and has no "Files" payload. */
export function dragHasFiles(e: ReactDragEvent): boolean {
  return e.dataTransfer.types.includes("Files");
}

/** The pictures among the files of a drop. */
export function droppedImages(e: ReactDragEvent): File[] {
  return Array.from(e.dataTransfer.files).filter((file) => file.type.startsWith("image/"));
}

/**
 * Pictures dropped onto a place (the side panel while a gallery is selected): they become the last pictures of the gallery, in one step of the history.
 * `over` is true while files are dragged over the place, for the outline that says they would land there. (The canvas has its own handling: Canvas.tsx's
 * handleMediaDrop, which has to tell a gallery from the rest of the slide.)
 */
export function useGalleryDrop(container: BlockContainerRef | null, blockId: string | null) {
  const [over, setOver] = useState(false);
  if (!container || !blockId) return { over: false, handlers: {} };
  return {
    over,
    handlers: {
      onDragOver: (e: ReactDragEvent) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      },
      onDragLeave: (e: ReactDragEvent) => {
        // (Moving from one element of the place to another is not leaving it.)
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setOver(false);
      },
      onDrop: (e: ReactDragEvent) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        setOver(false);
        const images = droppedImages(e);
        if (images.length > 0) addListAssets(container, blockId, "items", images).catch((error) => console.error(error));
      },
    },
  };
}
