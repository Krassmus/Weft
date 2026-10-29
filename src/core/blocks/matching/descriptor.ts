import { createId } from "../../id";
import { tr } from "../../i18n/tr";
import type { MatchItem, MatchingBlock } from "../../types";
import type { BlockDescriptor, BlockProblem, ListField } from "../types";

const clip = (text: string, max: number) => {
  const plain = text.replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
};

/** The cards of one of the two lists: a text or a picture at a place of the area, each with the words that are its text (a picture's description). */
const cards = (name: "Objekt" | "Ziel"): ListField => ({
  type: "list",
  item: {
    kind: { type: "choice", options: ["text", "image"] },
    text: { type: "text", translatable: true, shown: true, variables: true },
    // (The picture is only used - and only stays in the module - while the card is a picture.)
    assetId: { type: "asset", kind: "image", usedWhen: { field: "kind", is: "image" } },
    x: { type: "number", min: 0, max: 100 },
    y: { type: "number", min: 0, max: 100 },
  },
  newItem: () => ({ id: createId(), kind: "text", text: "", x: 0, y: 0 }),
  history: { add: `${name} hinzufügen`, addMany: `${name}e hinzufügen`, change: `${name} ändern` },
  cliRole: (number, item) => `${name} ${number}${item.kind === "image" ? " (Bildbeschreibung)" : ""}`,
});

/**
 * The matching ("Zuordnung"): two lists of cards - texts or pictures - on an area of the slide; the learner drags the cards of the first (`sources`) onto
 * those of the second (`targets`) and presses "Abschicken": what was right and what was not is shown (see MatchingBlock). `pairs` says which target each
 * source belongs to; a source without a partner is a decoy. Like a quiz it is graded and has its events in the page's graph. Drawn by one function for the
 * player, the thumbnails and the PDF (blocks/matching/render.js), which also does what the learner does with it - picking up, dragging, putting down, the
 * keyboard - and judges the answer; what a submit makes happen (the changes to variables for every right and every wrong card and for the whole, the
 * score, the required task, the events) is the player's (renderMatchingBlock). On the canvas the cards are moved, their words written in place and their
 * pictures changed (MatchingCanvas in blocks/MatchingCanvas.tsx, which draws with MatchingView: `ownCanvas`) - and the panel (MatchingEditor in
 * panels/BlockPanel.tsx) is the editor's own too. The size of the cards (`sourceSize`, `targetSize`) is an object: it is not one of the fields.
 */
export const matchingBlock: BlockDescriptor<MatchingBlock> = {
  kind: "matching",
  version: 1,
  cliName: "Matching",
  schemaDefinition: "MatchingBlock",
  description:
    "Matching: zwei Listen von Karten (Texte oder Bilder), die Objekte der ersten werden per Drag & Drop auf die der zweiten gezogen; richtige Zuordnungen (pairs), Ablenker ohne Ziel, Punkte für richtige und Folgen für falsche (Variablen-Effekte), Ereignisse wie bei einem Quiz.",
  placement: { pageOnly: true, box: { x: 10, y: 22, width: 80, height: 58 } },
  fields: {
    sources: cards("Objekt"),
    targets: cards("Ziel"),
    pairs: { type: "pairs", from: "sources", to: "targets" },
    shuffle: { type: "bool" },
    required: { type: "bool" },
    onEachCorrect: { type: "effects", cliWhat: "bei jeder richtigen Zuordnung" },
    onEachWrong: { type: "effects", cliWhat: "bei jeder falschen Zuordnung" },
    onCorrect: { type: "effects", firesOn: "richtig", cliWhat: "wenn alles richtig ist" },
    onIncorrect: { type: "effects", firesOn: "falsch", cliWhat: "wenn nicht alles richtig ist" },
  },
  defaults: () => {
    // Three objects, two of which belong to a target and one to none (a decoy), and the two targets: the cards stand in two columns.
    const sources: MatchItem[] = tr("ui.matching_sample_sources")
      .split("|")
      .map((text, i) => ({ id: createId(), kind: "text" as const, text, x: 3, y: 4 + i * 28 }));
    const targets: MatchItem[] = tr("ui.matching_sample_targets")
      .split("|")
      .map((text, i) => ({ id: createId(), kind: "text" as const, text, x: 55, y: 4 + i * 44 }));
    return {
      kind: "matching",
      sources,
      targets,
      pairs: { [sources[0].id]: targets[0].id, [sources[1].id]: targets[1].id },
      sourceSize: { width: 34, height: 20 },
      targetSize: { width: 40, height: 40 },
      onEachCorrect: [],
      onEachWrong: [],
      onCorrect: [],
      onIncorrect: [],
    };
  },
  task: {
    labels: { fill: "ui.matching_first", submit: "ui.matching_submitted", correct: "ui.matching_submitted_correct", incorrect: "ui.matching_submitted_incorrect" },
    cliNames: {
      fill: "Matching: erste Zuordnung",
      submit: "Matching abgeschickt",
      correct: "Matching abgeschickt (alles richtig)",
      incorrect: "Matching abgeschickt (nicht alles richtig)",
    },
  },
  summary: (block) => {
    const describe = (items: MatchItem[]) => items.map((item) => (item.kind === "image" ? `[Bild: ${clip(item.text, 20) || "ohne Beschreibung"}]` : clip(item.text, 20))).join(", ");
    const pairs = Object.keys(block.pairs ?? {}).length;
    return `Objekte: ${describe(block.sources)} → Ziele: ${describe(block.targets)} (${pairs} richtig, ${block.sources.length - pairs} Ablenker)${block.shuffle ? " [zufällig]" : ""}${block.required ? " [Pflicht]" : ""}`;
  },
  validate: (block, module) => {
    const problems: BlockProblem[] = [];
    const sources = block.sources ?? [];
    const targets = block.targets ?? [];
    const sourceIds = new Set(sources.map((item) => item.id));
    const targetIds = new Set(targets.map((item) => item.id));
    if (sources.length === 0 || targets.length === 0) problems.push({ level: "warning", code: "matching-empty", message: "Das Matching braucht mindestens ein Objekt und ein Ziel." });
    for (const [source, target] of Object.entries(block.pairs ?? {})) {
      if (!sourceIds.has(source) || !targetIds.has(target)) {
        problems.push({
          level: "error",
          code: "matching-pair-broken",
          message: "Eine richtige Zuordnung (pairs) verweist auf ein Objekt oder Ziel, das es nicht gibt.",
          hint: "pairs: Objekt-Id → Ziel-Id; ein Objekt ohne Eintrag ist ein Ablenker.",
        });
      }
    }
    if (sources.length > 0 && sources.every((item) => !(block.pairs ?? {})[item.id])) {
      problems.push({ level: "info", code: "matching-no-pairs", message: "Kein Objekt hat ein Ziel: alles ist ein Ablenker, nichts kann richtig zugeordnet werden." });
    }
    for (const item of [...sources, ...targets]) {
      if (item.kind !== "image") continue;
      if (!item.assetId) problems.push({ level: "warning", code: "matching-no-image", message: "Eine Karte des Matchings ist ein Bild, hat aber noch keins." });
      else if (!module.assets.some((asset) => asset.id === item.assetId))
        problems.push({ level: "error", code: "asset-missing", message: `Eine Karte des Matchings verweist auf die Datei ${item.assetId}, die nicht in der Liste der Dateien steht.` });
      else if (!item.text?.trim()) problems.push({ level: "info", code: "image-no-alt", message: "Ein Bild des Matchings ohne Beschreibung (text)." });
    }
    return problems;
  },
};
