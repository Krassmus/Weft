import { tr } from "../../i18n/tr";
import type { PlaceholderBlock } from "../../types";
import type { BlockDescriptor } from "../types";

/**
 * The placeholder of a layout: a slot that the slides of the layout fill with a text of their own (TextBlock.placeholderOf), with a label that says what
 * it is for ("Titel") and a sample text that has the formatting the texts of the slides take over. It exists only in a layout (`layoutOnly`): on a slide it
 * is the text that stands in the slot. Edited in place on the layout and in the panel of the layout block; the player shows nothing of it
 * (the texts of the slides are what is seen), the editor draws the slot (BlockView, SlideThumbnail).
 */
export const placeholderBlock: BlockDescriptor<PlaceholderBlock> = {
  kind: "placeholder",
  version: 1,
  cliName: "Platzhalter-Text",
  schemaDefinition: "PlaceholderBlock",
  description: "Ein Platzhalter in einem Layout: ein Platz (`label`: wofür, z. B. „Titel“), den die Folien des Layouts mit einem eigenen Text füllen; `html` ist der Mustertext mit der Formatierung, die diese Texte übernehmen. Nur in Layouts.",
  placement: { pageOnly: false, layoutOnly: true, box: { x: 10, y: 40, width: 80, height: 20 } },
  fields: {
    label: { type: "text" },
    html: { type: "html", shown: true, variables: true },
  },
  defaults: () => ({ kind: "placeholder", label: tr("ui.placeholder"), html: tr("ui.placeholder_text") }),
  summary: (block) => `Platzhalter „${block.label}"`,
};
