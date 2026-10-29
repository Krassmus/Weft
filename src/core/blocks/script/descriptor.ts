import { tr } from "../../i18n/tr";
import type { ScriptBlock } from "../../types";
import type { BlockDescriptor } from "../types";

/**
 * The logic block: JavaScript that runs when its event of the page's graph is reached (`events` below: the one event of its own). It reads and writes variables, starts events of the slide and jumps. Only on a slide, and nothing of
 * it is seen (`invisible`): the editor draws a hexagon, the player nothing. There is nothing in it to draw by one function for both - the code is only run, by
 * the player (runScript). The editor of the code is its own (ScriptEditor in panels/BlockPanel.tsx).
 */
export const scriptBlock: BlockDescriptor<ScriptBlock> = {
  kind: "script",
  version: 1,
  cliName: "Logikblock",
  schemaDefinition: "ScriptBlock",
  description: "Ein Logikblock: JavaScript (`code`), das läuft, wenn sein Ereignis im Graphen der Folie erreicht wird - es liest und schreibt Variablen (`vars.name`), startet Ereignisse der Folie (`trigger(\"Titel\")`) und springt (`jump(\"2.a.1\")`) und kennt die Blöcke der Folie (`getBlock(\"Name\")`: bei einem Quiz die Antworten, die richtigen und falschen, und `hideOptions` / `showOptions`). Unsichtbar; nur auf Folien.",
  // A hexagon that is a square on the usual 16:9 slide (the percentages are of the slide's width and height).
  invisible: true,
  placement: { pageOnly: true, box: { x: 44.5, y: 40.25, width: 11, height: 19.5 } },
  fields: {
    code: { type: "text" },
  },
  // Its one event: the script runs - instead of an Aufbau, with the trigger the page stores for it (a green event, triggered like an Aufbau). Only a page
  // has it: a logic block is not in a layout.
  events: [
    {
      key: "run",
      idPrefix: "script-run",
      graphKind: "script-run",
      timelineType: "script-run",
      exists: (_block, where) => where.onPage,
      replacesEntrance: () => true,
      triggerable: true,
      inChain: true,
      looks: { "script-run": { label: () => tr("ui.script_block"), icon: "gear", color: "green" } },
      label: (_block, context) => context.name,
    },
  ],
  defaults: () => ({ kind: "script", code: tr("ui.script_default_code") }),
  summary: (block) => `Logikblock: ${(block.code.split("\n").find((line) => line.trim() !== "" && !line.trim().startsWith("//")) ?? "").trim().slice(0, 50)}`,
};
