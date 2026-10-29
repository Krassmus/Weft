import { tr } from "../../i18n/tr";
import type { ButtonBlock } from "../../types";
import type { BlockDescriptor, BlockProblem } from "../types";

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
 * The button: a click that is an event of the page's graph, and what else the author says it does - goes on (Weiter), back, to a slide - and changes to
 * variables (see ButtonBlock). Its label is a formatted text (`html`, with `text` the plain words), edited on the canvas like a text. Drawn by one function
 * for the player, the thumbnails and the PDF (blocks/button/render.js); on the canvas the label is written in place, which is the editor's own
 * (BlockView.tsx: `ownCanvas`). What a click does is the player's (renderButtonBlock), its place in the graph the event graph's - and its panel
 * (ButtonEditor in panels/BlockPanel.tsx) is its own.
 */
export const buttonBlock: BlockDescriptor<ButtonBlock> = {
  kind: "button",
  version: 1,
  cliName: "Button",
  schemaDefinition: "ButtonBlock",
  description:
    "Ein Button: Weiter, vorherige Folie, zu einer Folie springen oder ein Ereignis auslösen; kann Variablen ändern.",
  placement: { pageOnly: false, box: { x: 35, y: 82, width: 30, height: 10 } },
  fields: {
    // The words: plain in `text`, with their formatting in `html` (a label with no words is the player's own "Weiter").
    text: { type: "text", translatable: true, formatted: "html", shown: true, variables: true, cli: { part: "label", role: "Beschriftung" } },
    onClick: { type: "effects", cliWhat: "beim Klick" },
  },
  // Its one event: it is clicked - a user event, nothing can make it happen but the learner (violet in the graph; a button that appears can be clicked only
  // after it has). Where the click leads is what its action says and the triggers from this event.
  events: [
    {
      key: "click",
      idPrefix: "button-click",
      graphKind: "button-click",
      timelineType: "button-click",
      triggerable: false,
      lane: true,
      cliAlias: "click",
      looks: { "button-click": { label: () => tr("ui.button_clicked"), hint: () => tr("ui.happens_as_soon_as_the_learner"), icon: "cursor", color: "violet", byLearner: true } },
      label: (block) => {
        const name = block.name?.trim();
        return name ? tr("ui.named_clicked", { n0: name }) : undefined;
      },
    },
  ],
  defaults: () => ({ kind: "button", text: tr("ui.next"), action: "advance" }),
  summary: (block, context) => {
    const label = clip(block.html ?? block.text, 40) || "(ohne Text)";
    const action =
      block.action === "advance"
        ? "Weiter"
        : block.action === "prev"
          ? "Vorherige Folie"
          : block.action === "goto"
            ? `springt zu Folie ${(block.targetPageId && context.labels[block.targetPageId]) ?? "(gelöscht)"}`
            : "löst ein Ereignis aus";
    return `„${label}" → ${action}`;
  },
  validate: (block, module) => {
    const problems: BlockProblem[] = [];
    if (block.action === "goto") {
      if (!block.targetPageId) problems.push({ level: "warning", code: "button-target-empty", message: "Button springt zu einer Folie, hat aber kein Ziel.", hint: "targetPageId setzen." });
      else if (!module.pages[block.targetPageId])
        problems.push({ level: "error", code: "button-target-missing", message: "Button springt zu einer Folie, die es nicht mehr gibt.", hint: "Ein vorhandenes Ziel (targetPageId) wählen." });
    }
    if (!clip(block.html ?? block.text, 1000).trim()) problems.push({ level: "info", code: "button-no-text", message: "Button ohne Text (der Player zeigt „Weiter“)." });
    return problems;
  },
};
