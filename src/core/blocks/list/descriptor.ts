import { createId } from "../../id";
import { tr } from "../../i18n/tr";
import type { ListBlock } from "../../types";
import type { BlockDescriptor } from "../types";

// The words of some html, as `weft inspect` shows them (translations.ts's plainTextOfHtml: the registry cannot import that file).
const clip = (html: string, max: number) => {
  const plain = html
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
};

/**
 * The list: points, each with a mark in front (a dot, a dash, a number or the author's picture) - see ListBlock. Each point is formatted text (`html`)
 * with its own wording in each language, edited in place on the slide. Drawn by one function for the player, the thumbnails and the PDF
 * (blocks/list/render.js); on the canvas the points are written in place - with Enter that makes a new one, Backspace that joins two, arrows that
 * go from one to the next - which is the editor's own (ListBlockCanvas in blocks/BlockView.tsx: `ownCanvas`), and so is the panel (ListEditor in
 * panels/BlockPanel.tsx). The Aufbau of the points one by one (`itemEntrance`) is made of events of the page's graph (listItemNodeId in
 * document/pageTimeline.ts) and the player's: the function only says where each point is.
 */
export const listBlock: BlockDescriptor<ListBlock> = {
  kind: "list",
  version: 1,
  cliName: "Liste",
  schemaDefinition: "ListBlock",
  description: "Eine Liste (Punkte, Striche, Nummern oder Bilder davor); Punkte können einzeln erscheinen.",
  placement: { pageOnly: false, box: { x: 10, y: 35, width: 80, height: 40 } },
  fields: {
    // The points: formatted words, each kept as the formatting in the translations too (`items[id]`).
    items: {
      type: "list",
      item: { html: { type: "html", translatable: true, shown: true, variables: true } },
      newItem: () => ({ id: createId(), html: "" }),
      history: { add: "Punkt hinzufügen", addMany: "Punkte hinzufügen", change: "Punkt ändern" },
      cliRole: (number) => `Punkt ${number}`,
    },
    marker: { type: "choice", options: ["dot", "dash", "number", "image"] },
    markerColor: { type: "text", sample: "#16a34a" },
    // (The picture is only used - and only stays in the module - while the marker is a picture.)
    markerAssetId: { type: "asset", kind: "image", usedWhen: { field: "marker", is: "image" } },
    markerSize: { type: "number", min: 0.3 },
    spacing: { type: "number", min: 0 },
    itemEntrance: { type: "bool" },
  },
  // Its events, when it has an Aufbau for each item (`itemEntrance`): the items appear one by one, each an event of its own - and the list as a whole has no
  // Aufbau event. Only a list on a page has them (a list of a layout appears as a whole).
  events: [
    {
      key: "item",
      idPrefix: "list-item",
      graphKind: "list-item",
      timelineType: "list-item-entrance",
      perItem: "items",
      exists: (block, where) => where.onPage && !!block.itemEntrance && block.entranceEffect.type !== "off",
      replacesEntrance: (block, where) => where.onPage && !!block.itemEntrance && block.entranceEffect.type !== "off",
      triggerable: true,
      inChain: true,
      looks: { "list-item-entrance": { label: () => tr("ui.list_item_3"), icon: "animation", color: "yellow" } },
      label: (_block, context) => tr("ui.list_item", { n0: (context.index ?? 0) + 1 }),
    },
  ],
  defaults: () => ({
    kind: "list",
    items: [
      { id: createId(), html: tr("ui.first_item") },
      { id: createId(), html: tr("ui.second_item") },
      { id: createId(), html: tr("ui.third_item") },
    ],
    marker: "dot",
    spacing: 1.2,
  }),
  summary: (block) =>
    `${block.items.length} Punkte: ${block.items
      .slice(0, 3)
      .map((item) => clip(item.html, 30))
      .join(" | ")}`,
};
