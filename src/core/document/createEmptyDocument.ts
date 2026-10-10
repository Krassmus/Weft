import { createId } from "../id";
import { CURRENT_FORMAT_VERSION } from "../types";
import type {
  Branch,
  NewBlock,
  SequenceEntry,
  SequenceNodeRef,
  Layout,
  LogicBlock,
  Page,
  WeftDocument,
  WeftModule,
} from "../types";
import { orderedRecord, orderedRecordBy } from "./ordering";
import { sequenceKey } from "./sequence";
import { defaultEntranceEffect, defaultExitEffect } from "./blockEffects";
import { createDefaultPageTimeline, syncPageTimelineEvents } from "./pageTimeline";
import { ensureBuiltinVariables } from "./variables";

/** A page's/layout's blocks keyed by id, stacked in the order given (the last one on top). */
function blockRecord<T extends NewBlock>(blocks: T[]): Record<string, T & { order: string }> {
  return orderedRecord(blocks.map((b) => ({ ...b })));
}

/**
 * Builds a small but complete demo module (title, content, one branch, one ending slide)
 * so a freshly created project has something to look at instead of a blank canvas.
 */
export function createEmptyDocument(): WeftDocument {
  const now = new Date().toISOString();

  const layout: Layout = {
    id: createId(),
    name: "Standard",
    blocks: blockRecord([
      {
        id: createId(),
        kind: "text",
        position: { x: 5, y: 5, width: 90, height: 15 },
        html: "<h1>Titel der Folie</h1>",
        entranceEffect: defaultEntranceEffect(),
        exitEffect: defaultExitEffect(),
      },
    ]),
  };

  const scoreVariableId = createId();

  const titlePage: Page = {
    id: createId(),
    layoutId: layout.id,
    blocks: blockRecord([
      {
        id: createId(),
        kind: "text",
        position: { x: 5, y: 25, width: 90, height: 50 },
        html: "<p>Willkommen in eurem neuen Lernmodul. Bearbeite diese Folie oder füge weitere hinzu.</p>",
        entranceEffect: defaultEntranceEffect(),
        exitEffect: defaultExitEffect(),
      },
    ]),
    groups: [],
    timeline: createDefaultPageTimeline(),
  };

  const branchAId = createId();
  const quizOptionYes = createId();
  const quizOptionNo = createId();
  const branchAPage: Page = {
    id: createId(),
    layoutId: layout.id,
    blocks: blockRecord([
      {
        id: createId(),
        kind: "quiz",
        position: { x: 5, y: 25, width: 90, height: 50 },
        questionHtml: "<p>Ist Weft plattformübergreifend?</p>",
        options: [
          { id: quizOptionYes, html: "Ja" },
          { id: quizOptionNo, html: "Nein" },
        ],
        correctOptionIds: [quizOptionYes],
        onCorrect: [{ variableId: scoreVariableId, op: "add", value: 1 }],
        onIncorrect: [],
        entranceEffect: defaultEntranceEffect(),
        exitEffect: defaultExitEffect(),
      },
    ]),
    groups: [],
    timeline: createDefaultPageTimeline(),
  };
  // This demo page's quiz block is built as a raw literal above rather than via addBlockToPage,
  // so it bypasses that action's own sync call - do it here instead (see syncPageTimelineEvents).
  syncPageTimelineEvents(branchAPage);

  const branchBPage: Page = {
    id: createId(),
    layoutId: layout.id,
    blocks: blockRecord([
      {
        id: createId(),
        kind: "text",
        position: { x: 5, y: 25, width: 90, height: 50 },
        html: "<p>Das ist der zweite Zweig – lege hier den alternativen Lernpfad an.</p>",
        entranceEffect: defaultEntranceEffect(),
        exitEffect: defaultExitEffect(),
      },
    ]),
    groups: [],
    timeline: createDefaultPageTimeline(),
  };

  const branches: Branch[] = [
    {
      id: branchAId,
      label: "Zweig A",
      condition: { variableId: scoreVariableId, comparator: "gte", value: 1 },
      pages: orderedRecord([{ id: branchAPage.id }]),
    },
    { id: createId(), label: "Zweig B (sonst)", condition: null, pages: orderedRecord([{ id: branchBPage.id }]) },
  ];

  const logicBlock: LogicBlock = {
    id: createId(),
    name: "Verzweigung",
    branches,
  };

  const finalPage: Page = {
    id: createId(),
    layoutId: layout.id,
    blocks: blockRecord([
      {
        id: createId(),
        kind: "text",
        position: { x: 5, y: 25, width: 90, height: 50 },
        html: "<p>Geschafft! Hier landen alle Zweige wieder.</p>",
        entranceEffect: defaultEntranceEffect(),
        exitEffect: defaultExitEffect(),
      },
    ]),
    groups: [],
    timeline: createDefaultPageTimeline(),
  };

  const pages: Record<string, Page> = {
    [titlePage.id]: titlePage,
    [branchAPage.id]: branchAPage,
    [branchBPage.id]: branchBPage,
    [finalPage.id]: finalPage,
  };

  const sequence = orderedRecordBy<SequenceNodeRef>(
    [
      { kind: "page", pageId: titlePage.id },
      { kind: "logic", logicBlockId: logicBlock.id },
      { kind: "page", pageId: finalPage.id },
    ],
    sequenceKey,
  ) as Record<string, SequenceEntry>;

  const content: WeftModule = {
    id: createId(),
    title: "Neues Lernmodul",
    aspectRatio: "16:9",
    createdAt: now,
    modifiedAt: now,
    variables: [{ id: scoreVariableId, name: "score", type: "number", initialValue: 0 }],
    layouts: { [layout.id]: layout },
    pages,
    logicBlocks: { [logicBlock.id]: logicBlock },
    sequence,
    assets: [],
    customFonts: [],
    languages: [],
    keyboardNavigationEnabled: true,
  };
  ensureBuiltinVariables(content.variables);

  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    content,
  };
}
