import { beforeEach, describe, expect, it } from "vitest";
import { setCurrentModule } from "../cli/storeStub";
import { createEmptyDocument } from "../src/core/document/createEmptyDocument";
import { addFilesBlock } from "../src/core/document/actions";
import { useAssetStore } from "../src/core/assets/assetStore";
import type { FilesBlock, WeftModule } from "../src/core/types";

/**
 * Files dropped on the editor that are no picture, video or sound become one files block (addFilesBlock): the files are assets of the module, the block lists
 * them in the order of the drop, and it stands where it was dropped. (What is a picture, a video or a sound is decided by the canvas that gets the drop.)
 */
let module: WeftModule;
const position = { x: 10, y: 20, width: 40, height: 30 };

beforeEach(() => {
  module = createEmptyDocument().content;
  setCurrentModule(module);
});

const pageId = () => Object.keys(module.pages)[0];
const filesBlocks = (blocks: WeftModule["pages"][string]["blocks"]) => Object.values(blocks).filter((b): b is FilesBlock & { order: string } => b.kind === "files");

describe("dropping files that are none of picture, video, sound", () => {
  it("makes one files block of all of them, in the order of the drop, with their bytes as assets of the module", async () => {
    const assetsBefore = module.assets.length;
    const first = new File(["hello"], "Arbeitsblatt.pdf", { type: "application/pdf" });
    const second = new File(["a,b\n1,2"], "daten.csv", { type: "text/csv" });
    const third = new File(["x"], "ohne-typ.xyz");
    const id = await addFilesBlock({ kind: "page", pageId: pageId() }, [first, second, third], position);
    const blocks = filesBlocks(module.pages[pageId()].blocks);
    expect(blocks.length).toBe(1);
    const block = blocks[0];
    expect(block.id).toBe(id);
    expect(block.position).toEqual(position);
    expect(block.files.map((f) => [f.name, f.mimeType, f.size])).toEqual([
      ["Arbeitsblatt.pdf", "application/pdf", 5],
      ["daten.csv", "text/csv", 7],
      ["ohne-typ.xyz", "application/octet-stream", 1],
    ]);
    expect(block.protection).toBeNull();
    expect(module.assets.length).toBe(assetsBefore + 3);
    for (const file of block.files) {
      expect(module.assets.some((asset) => asset.id === file.id && asset.fileName === file.name)).toBe(true);
      expect(useAssetStore.getState().blobs.get(file.id)?.size).toBe(file.size);
    }
  });

  it("makes the block on a layout as well", async () => {
    const layoutId = Object.keys(module.layouts)[0];
    const id = await addFilesBlock({ kind: "layout", layoutId }, [new File(["1"], "a.txt", { type: "text/plain" })], position);
    expect(filesBlocks(module.layouts[layoutId].blocks).map((b) => b.id)).toEqual([id]);
  });

  it("makes no block where not one file can be read", async () => {
    const unreadable = { name: "Ordner", type: "", size: 0, arrayBuffer: () => Promise.reject(new Error("is a directory")) } as unknown as File;
    const before = Object.keys(module.pages[pageId()].blocks).length;
    expect(await addFilesBlock({ kind: "page", pageId: pageId() }, [unreadable], position)).toBeNull();
    expect(Object.keys(module.pages[pageId()].blocks).length).toBe(before);
  });

  it("leaves out the file that cannot be read and keeps the others", async () => {
    const unreadable = { name: "Ordner", type: "", size: 0, arrayBuffer: () => Promise.reject(new Error("is a directory")) } as unknown as File;
    await addFilesBlock({ kind: "page", pageId: pageId() }, [unreadable, new File(["1"], "a.txt", { type: "text/plain" })], position);
    expect(filesBlocks(module.pages[pageId()].blocks)[0].files.map((f) => f.name)).toEqual(["a.txt"]);
  });
});
