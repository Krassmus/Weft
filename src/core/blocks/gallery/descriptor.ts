import { createId } from "../../id";
import type { GalleryBlock } from "../../types";
import type { BlockDescriptor, BlockProblem } from "../types";

const clip = (text: string, max: number) => {
  const plain = text.replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
};

/**
 * The gallery: pictures in a carousel (see GalleryBlock). Its one field is a list - each picture is an item with its file and a caption, the
 * caption being the text of an item that has its own wording in each language. How it looks and works is in its views: the editor's
 * (blocks/GalleryView.tsx) and the player's (renderGalleryBlock in runtime/player.runtime.js).
 */
export const galleryBlock: BlockDescriptor<GalleryBlock> = {
  kind: "gallery",
  version: 1,
  cliName: "Bildergalerie",
  schemaDefinition: "GalleryBlock",
  description:
    "Bildergalerie: Bilder (items, jedes mit optionaler Bildunterschrift `caption`) in einem Karussell mit Pfeilen, Wischgeste und Pfeiltasten; ein Klick öffnet das Bild in voller Größe in einem Fenster, mit der Bildunterschrift darunter. Nur auf Folien.",
  placement: { pageOnly: true, box: { x: 20, y: 15, width: 60, height: 70 } },
  fields: {
    items: {
      type: "list",
      item: {
        assetId: { type: "asset", kind: "image" },
        caption: { type: "text", translatable: true, shown: true, variables: true, ui: { label: "ui.gallery_caption" } },
      },
      newItem: (asset) => ({ id: createId(), assetId: asset, caption: "" }),
      history: { add: "Bild zur Galerie hinzufügen", addMany: "Bilder zur Galerie hinzufügen", change: "Bild der Galerie wählen" },
      cliRole: (number) => `Bild ${number} (Bildunterschrift)`,
      ui: {
        empty: "ui.gallery_empty",
        textLabel: "ui.gallery_caption",
        add: "ui.gallery_add_pictures",
        change: "ui.gallery_change_picture",
        choose: "ui.gallery_choose_picture",
        moveUp: "ui.gallery_move_up",
        moveDown: "ui.gallery_move_down",
        remove: "ui.gallery_remove_picture",
      },
    },
  },
  // No pictures yet: they are chosen in the panel (or by a drop of files on the block).
  defaults: () => ({ kind: "gallery", items: [] }),
  panel: {
    sections: [
      { title: "ui.gallery", hint: "ui.gallery_hint", language: true, fields: [] },
      { title: "ui.gallery_pictures", fields: ["items"] },
    ],
  },
  summary: (block) => `${block.items.length} Bilder: ${block.items.map((item) => `[${clip(item.caption, 20) || "ohne Bildunterschrift"}]`).join(", ")}`,
  validate: (block, module) => {
    const items = block.items ?? [];
    const problems: BlockProblem[] = [];
    if (items.length === 0) problems.push({ level: "warning", code: "gallery-empty", message: "Die Galerie hat noch kein Bild." });
    for (const item of items) {
      if (!item.assetId) problems.push({ level: "warning", code: "gallery-no-image", message: "Ein Bild der Galerie hat noch keine Datei." });
      else if (!module.assets.some((a) => a.id === item.assetId))
        problems.push({ level: "error", code: "asset-missing", message: `Ein Bild der Galerie verweist auf die Datei ${item.assetId}, die nicht in der Liste der Dateien steht.` });
      else if (!item.caption?.trim())
        problems.push({ level: "info", code: "image-no-alt", message: "Ein Bild der Galerie ohne Bildunterschrift (caption) - sie ist auch die Beschreibung für alle, die das Bild nicht sehen." });
    }
    return problems;
  },
};
