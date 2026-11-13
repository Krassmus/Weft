import { parseHTML } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import { clipboardEntryHtml, clipboardEntryOfSelection, parseClipboardHtml, parseClipboardText, serializeClipboardEntry } from "../src/core/document/clipboard";
import type { Block, Page, WeftModule } from "../src/core/types";

// (The clipboard reads formatted texts with a DOM, as the editor has one.)
beforeAll(() => {
  class TestDOMParser {
    parseFromString(html: string) {
      return parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
    }
  }
  Object.assign(globalThis, { DOMParser: TestDOMParser });
});

const shape = (id: string, order: string): Block => ({ id, order, kind: "shape", position: { x: 10, y: 10, width: 20, height: 20 } }) as unknown as Block;

function module(): WeftModule {
  const page = {
    id: "p1",
    blocks: { a: shape("a", "a"), b: shape("b", "b"), c: shape("c", "c") },
    groups: [{ id: "g1", blockIds: ["a", "b"], entranceEffect: { type: "fade" } }],
  } as unknown as Page;
  return { pages: { p1: page }, layouts: {} } as unknown as WeftModule;
}

describe("clipboard: groups and several blocks", () => {
  it("a group is copied with all its members and itself", () => {
    const entry = clipboardEntryOfSelection(module(), { type: "group", pageId: "p1", groupId: "g1" });
    expect(entry?.kind).toBe("blocks");
    if (entry?.kind !== "blocks") return;
    expect(entry.blocks.map((b) => b.id)).toEqual(["a", "b"]);
    expect(entry.groups).toEqual([{ blockIds: ["a", "b"], entranceEffect: { type: "fade" } }]);
  });

  it("a multi-selection keeps only the groups that are wholly in it", () => {
    const m = module();
    const whole = clipboardEntryOfSelection(m, { type: "blocks", container: { kind: "page", pageId: "p1" }, blockIds: ["c", "a", "b"] });
    expect(whole?.kind === "blocks" && whole.blocks.map((b) => b.id)).toEqual(["a", "b", "c"]);
    expect(whole?.kind === "blocks" && whole.groups.length).toBe(1);
    const part = clipboardEntryOfSelection(m, { type: "blocks", container: { kind: "page", pageId: "p1" }, blockIds: ["a", "c"] });
    expect(part?.kind === "blocks" && part.groups.length).toBe(0);
  });

  it("survives the clipboard as text and as HTML - also without any words in it", () => {
    for (const selection of [
      { type: "group", pageId: "p1", groupId: "g1" } as const,
      { type: "block", container: { kind: "page", pageId: "p1" }, blockId: "c" } as const,
    ]) {
      const entry = clipboardEntryOfSelection(module(), selection)!;
      expect(parseClipboardText(serializeClipboardEntry(entry))).toEqual(entry);
      expect(parseClipboardHtml(clipboardEntryHtml(entry))).toEqual(entry);
      // (Never an empty container: a webview that cleans the HTML would throw it away with the structure.)
      expect(clipboardEntryHtml(entry)).toContain("<p>");
    }
  });

  it("nothing selected, nothing copied", () => {
    expect(clipboardEntryOfSelection(module(), null)).toBeNull();
    expect(clipboardEntryOfSelection(module(), { type: "group", pageId: "p1", groupId: "nope" })).toBeNull();
  });
});
