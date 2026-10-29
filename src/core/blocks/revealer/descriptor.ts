import { tr } from "../../i18n/tr";
import type { RevealerBlock } from "../../types";
import type { BlockDescriptor, BlockProblem } from "../types";

/**
 * The revealer: a small icon in a coloured shape on the slide (an i, a warning, an exclamation mark, a question mark) that opens a window around itself
 * - with a click on it, or with a trigger to its event - holding a heading and, all of them optional, a small text, a picture and a button (see
 * RevealerBlock). Its two events (it opens; its button was clicked) are described in `events` below. Drawn by
 * one function for the player, the thumbnails, the PDF and the canvas (blocks/revealer/render.js); on the canvas the window stands open while the block
 * is selected. What the button does is the player's (renderRevealerBlock) and its panel (RevealerEditor in panels/BlockPanel.tsx) the editor's own.
 *
 * The button is an object (`button`: its label, what a click does, the changes to variables): it is not one of the fields - the words of its label
 * are translated by hand (revealerWording in document/translations.ts, rotateDefaultLanguage, `weft text export`).
 */
export const revealerBlock: BlockDescriptor<RevealerBlock> = {
  kind: "revealer",
  version: 1,
  cliName: "Info-Symbol",
  schemaDefinition: "RevealerBlock",
  description:
    "Ein Icon (Info, Warnung, Ausrufe- oder Fragezeichen), das beim Klick ein Fenster mit Überschrift, optional Text, Bild und Button öffnet; ein Klick im Fenster ist ein Ereignis.",
  // A square on a 16:9 slide (the icon is drawn as large as fits in its box, whatever the box is).
  placement: { pageOnly: false, box: { x: 20, y: 30, width: 4.5, height: 8 } },
  fields: {
    icon: { type: "choice", options: ["info", "warning", "exclamation", "question"] },
    // The colour of the icon (a hex colour).
    color: { type: "text", sample: "#3b82f6" },
    title: { type: "text", translatable: true, shown: true, cli: { part: "title", role: "Überschrift" } },
    body: { type: "text", translatable: true, shown: true, cli: { part: "body", role: "Text des Fensters" } },
    imageAssetId: { type: "asset", kind: "image" },
    imageAlt: { type: "text", translatable: true, translationKey: "alt", cli: { part: "alt", role: "Bildbeschreibung" } },
    windowStyle: { type: "choice", options: ["dark", "light"] },
  },
  // Its events: its window opens (by a click on the icon or by a trigger, so it is triggerable like a video's start) and, when it has one, the button in the
  // window is clicked (a user event: it comes after the opening, a dashed line - the learner does it). An icon that appears can be opened only after it has.
  events: [
    {
      key: "open",
      idPrefix: "revealer-open",
      graphKind: "revealer-open",
      timelineType: "revealer-open",
      triggerable: true,
      lane: true,
      cliAlias: "revealer-open",
      looks: { "revealer-open": { label: () => tr("ui.revealer_opens"), icon: "info", color: "blue" } },
      label: () => tr("ui.revealer_opens"),
    },
    {
      key: "button",
      idPrefix: "revealer-button",
      graphKind: "revealer-button",
      timelineType: "revealer-button",
      exists: (block) => !!block.button,
      triggerable: false,
      lane: true,
      cliAlias: "revealer-button",
      looks: { "revealer-button": { label: () => tr("ui.revealer_button_clicked"), hint: () => tr("ui.revealer_button_hint"), icon: "hand", color: "violet", byLearner: true } },
      label: () => tr("ui.revealer_button_clicked"),
    },
  ],
  defaults: () => ({
    kind: "revealer",
    icon: "info",
    color: "#3b82f6",
    title: tr("ui.revealer_default_title"),
    body: tr("ui.revealer_default_text"),
    imageAssetId: null,
    imageAlt: "",
    button: { text: tr("ui.revealer_default_button"), action: "event" },
    windowStyle: "dark",
  }),
  summary: (block) => `${block.icon}: „${block.title}"${block.body ? " + Text" : ""}${block.imageAssetId ? " + Bild" : ""}${block.button ? ` + Button „${block.button.text}"` : ""}`,
  validate: (block, module) => {
    const problems: BlockProblem[] = [];
    if (block.imageAssetId) {
      if (!module.assets.some((asset) => asset.id === block.imageAssetId))
        problems.push({ level: "error", code: "asset-missing", message: `revealer-Block verweist auf das Bild ${block.imageAssetId}, das nicht in der Liste der Dateien steht.` });
      else if (!block.imageAlt.trim()) problems.push({ level: "info", code: "image-no-alt", message: "Bild im Revealer ohne Alternativtext (imageAlt)." });
    }
    if (!block.title.trim()) problems.push({ level: "warning", code: "revealer-no-title", message: "Revealer ohne Überschrift." });
    if (block.button?.action === "goto") {
      if (!block.button.targetPageId)
        problems.push({ level: "warning", code: "button-target-empty", message: "Der Button des Revealers springt zu einer Folie, hat aber kein Ziel.", hint: "button.targetPageId setzen." });
      else if (!module.pages[block.button.targetPageId])
        problems.push({ level: "error", code: "button-target-missing", message: "Der Button des Revealers springt zu einer Folie, die es nicht mehr gibt." });
    }
    return problems;
  },
};
