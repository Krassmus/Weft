import { createId } from "../../id";
import { tr } from "../../i18n/tr";
import type { SortBlock, SortItem } from "../../types";
import type { BlockDescriptor, BlockProblem } from "../types";

const clip = (text: string, max: number) => {
  const plain = text.replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
};

/**
 * The sorting puzzle ("Sortierrätsel"): texts or pictures that the learner puts into the right order by drag and drop - or with the keyboard - and then
 * presses "Abschicken" (see SortBlock). `items` is the RIGHT order; the learner sees them mixed up, never in the right order. What counts as a mistake is
 * the smallest number of moves that make the order right. Like a quiz it is graded and has its events in the page's graph. Drawn by one function for the
 * player, the thumbnails and the PDF (blocks/sort/render.js), which also does what the learner does with it - picking up, dragging, moving with the keys,
 * putting down - and judges the order; what a submit makes happen (the changes to variables for every submission and every mistake and for the whole, the
 * score, the required task, the events) is the player's (renderSortBlock). On the canvas the objects are put in order by dragging, their words written in
 * place and their pictures changed (SortCanvas in blocks/SortCanvas.tsx, which draws with SortView: `ownCanvas`) - and the panel (SortEditor in
 * panels/BlockPanel.tsx) is the editor's own too. The size of the objects (`itemSize`) is an object: it is not one of the fields.
 */
export const sortBlock: BlockDescriptor<SortBlock> = {
  kind: "sort",
  version: 1,
  cliName: "Sortierrätsel",
  schemaDefinition: "SortBlock",
  description:
    "Sortierrätsel: Texte oder Bilder (items, in der RICHTIGEN Reihenfolge), die die Lernperson per Drag & Drop in die richtige Reihenfolge bringt; senkrecht oder waagerecht auf einer dünnen Linie, Wörter an ihren Enden (startLabel / endLabel), Punkte beim Abschicken (onSubmit) und für jeden Fehler (onEachError, die kleinste Zahl an Verschiebungen), Ereignisse wie bei einem Quiz.",
  placement: { pageOnly: true, box: { x: 25, y: 8, width: 50, height: 84 } },
  fields: {
    items: {
      type: "list",
      item: {
        kind: { type: "choice", options: ["text", "image"] },
        text: { type: "text", translatable: true, shown: true, variables: true },
        // (The picture is only used - and only stays in the module - while the object is a picture.)
        assetId: { type: "asset", kind: "image", usedWhen: { field: "kind", is: "image" } },
      },
      newItem: () => ({ id: createId(), kind: "text", text: "" }),
      history: { add: "Objekt hinzufügen", addMany: "Objekte hinzufügen", change: "Objekt ändern" },
      cliRole: (number, item) => `Objekt ${number}${item.kind === "image" ? " (Bildbeschreibung)" : ""}`,
    },
    orientation: { type: "choice", options: ["vertical", "horizontal"] },
    // The words at the two ends of the line ("älter" / "jünger").
    startLabel: { type: "text", translatable: true, shown: true, variables: true, cli: { part: "start", role: "Wort am Anfang der Linie" } },
    endLabel: { type: "text", translatable: true, shown: true, variables: true, cli: { part: "end", role: "Wort am Ende der Linie" } },
    required: { type: "bool" },
    onEachError: { type: "effects", cliWhat: "bei jedem Fehler" },
    onSubmit: { type: "effects", cliWhat: "beim Abschicken" },
    onCorrect: { type: "effects", firesOn: "richtig", cliWhat: "wenn die Reihenfolge stimmt" },
    onIncorrect: { type: "effects", firesOn: "falsch", cliWhat: "wenn die Reihenfolge nicht stimmt" },
  },
  defaults: () => ({
    kind: "sort",
    // Four objects in their right order; the learner sees them mixed up.
    items: tr("ui.sort_sample_items")
      .split("|")
      .map((text): SortItem => ({ id: createId(), kind: "text", text })),
    orientation: "vertical",
    itemSize: { width: 60, height: 14 },
    onEachError: [],
    onSubmit: [],
    onCorrect: [],
    onIncorrect: [],
  }),
  task: {
    labels: { fill: "ui.sort_first", submit: "ui.sort_submitted", correct: "ui.sort_submitted_correct", incorrect: "ui.sort_submitted_incorrect" },
    cliNames: {
      fill: "Sortierrätsel: erste Verschiebung",
      submit: "Sortierrätsel abgeschickt",
      correct: "Sortierrätsel abgeschickt (richtige Reihenfolge)",
      incorrect: "Sortierrätsel abgeschickt (falsche Reihenfolge)",
    },
  },
  summary: (block) => {
    const items = block.items.map((item) => (item.kind === "image" ? `[Bild: ${clip(item.text, 20) || "ohne Beschreibung"}]` : clip(item.text, 20))).join(" → ");
    const ends = block.startLabel || block.endLabel ? ` (${block.startLabel ?? ""} … ${block.endLabel ?? ""})` : "";
    return `richtige Reihenfolge: ${items}${ends}${block.orientation === "horizontal" ? " [waagerecht]" : ""}${block.required ? " [Pflicht]" : ""}`;
  },
  validate: (block, module) => {
    const problems: BlockProblem[] = [];
    const items = block.items ?? [];
    if (items.length < 2) problems.push({ level: "warning", code: "sort-too-few", message: "Das Sortierrätsel braucht mindestens zwei Objekte, sonst gibt es nichts zu sortieren." });
    for (const item of items) {
      if (item.kind !== "image") continue;
      if (!item.assetId) problems.push({ level: "warning", code: "sort-no-image", message: "Ein Objekt des Sortierrätsels ist ein Bild, hat aber noch keins." });
      else if (!module.assets.some((asset) => asset.id === item.assetId))
        problems.push({ level: "error", code: "asset-missing", message: `Ein Objekt des Sortierrätsels verweist auf die Datei ${item.assetId}, die nicht in der Liste der Dateien steht.` });
      else if (!item.text?.trim()) problems.push({ level: "info", code: "image-no-alt", message: "Ein Bild des Sortierrätsels ohne Beschreibung (text)." });
    }
    if (block.onEachError?.length === 0 && block.onSubmit?.length === 0 && block.onCorrect?.length === 0 && block.onIncorrect?.length === 0)
      problems.push({ level: "info", code: "sort-no-effects", message: "Das Sortierrätsel vergibt keine Punkte (onSubmit / onEachError / onCorrect / onIncorrect sind leer)." });
    return problems;
  },
};
