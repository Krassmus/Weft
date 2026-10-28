import { safeLinkUrl } from "../../document/linkUrl";
import { tr } from "../../i18n/tr";
import type { LinkBlock } from "../../types";
import type { BlockDescriptor, BlockProblem } from "../types";

const clip = (text: string, max: number) => {
  const plain = text.replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
};

/**
 * The link: a button of the module's style that leads to an address (a page in a new tab, a mail address, a phone number). Drawn by one function for
 * the player, the canvas, the thumbnails and the PDF (blocks/link/render.js): a link only in the player - everywhere else a picture of one, and in
 * the PDF the address is a link where the picture stands. Its panel (LinkEditor in panels/BlockPanel.tsx) is its own: it completes an address typed
 * without its scheme and warns of one that leads nowhere.
 */
export const linkBlock: BlockDescriptor<LinkBlock> = {
  kind: "link",
  version: 1,
  cliName: "Link",
  schemaDefinition: "LinkBlock",
  description:
    "Ein Link als eigenes Element: führt zu einer Adresse im Internet (neuer Tab), mit einem Globus; sieht aus wie ein Button des Modulstils. Dateien des Moduls gehören in den Dateien-Block.",
  placement: { pageOnly: false, box: { x: 35, y: 50, width: 30, height: 8 } },
  fields: {
    url: { type: "text", sample: "https://example.org/seite" },
    // (What the learner reads: no placeholders for variables in it.)
    text: { type: "text", translatable: true, shown: true, cli: { part: "label", role: "Text" } },
  },
  defaults: () => ({ kind: "link", url: "https://", text: tr("ui.link_default_text") }),
  summary: (block) => `„${clip(block.text, 40) || "(ohne Text)"}" → ${block.url ?? "(ohne Adresse)"}`,
  validate: (block) => {
    const problems: BlockProblem[] = [];
    if ((block.url ?? "").trim() === "" || block.url.trim() === "https://")
      problems.push({ level: "warning", code: "link-no-target", message: "Der Link hat noch keine Adresse.", hint: "url auf eine Adresse mit https://, mailto: oder tel: setzen." });
    else if (safeLinkUrl(block.url) === null)
      problems.push({ level: "error", code: "link-url-invalid", message: `Der Link führt zu „${block.url}", dahin kann ein Link nicht führen.`, hint: "Nur Adressen mit http(s)://, mailto: oder tel: sind erlaubt." });
    return problems;
  },
};
