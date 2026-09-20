import { createId } from "../id";
import type {
  Branch,
  Layout,
  LogicBlock,
  Page,
  SequenceNodeRef,
  WeftDocument,
  WeftModule,
} from "../types";

/**
 * Builds a small but complete demo module (title, content, one branch, one ending slide)
 * so a freshly created project has something to look at instead of a blank canvas.
 */
export function createEmptyDocument(): WeftDocument {
  const now = new Date().toISOString();

  const layout: Layout = {
    id: createId(),
    name: "Standard",
    blocks: [
      {
        id: createId(),
        kind: "text",
        position: { x: 5, y: 5, width: 90, height: 15 },
        html: "<h1>Titel der Folie</h1>",
      },
    ],
  };

  const scoreVariableId = createId();

  const titlePage: Page = {
    id: createId(),
    layoutId: layout.id,
    blocks: [
      {
        id: createId(),
        kind: "text",
        position: { x: 5, y: 25, width: 90, height: 50 },
        html: "<p>Willkommen in eurem neuen Lernmodul. Bearbeite diese Folie oder füge weitere hinzu.</p>",
      },
    ],
  };

  const branchAId = createId();
  const quizOptionYes = createId();
  const quizOptionNo = createId();
  const branchAPage: Page = {
    id: createId(),
    layoutId: layout.id,
    blocks: [
      {
        id: createId(),
        kind: "quiz",
        position: { x: 5, y: 25, width: 90, height: 50 },
        question: "Ist Weft plattformübergreifend?",
        options: [
          { id: quizOptionYes, text: "Ja" },
          { id: quizOptionNo, text: "Nein" },
        ],
        correctOptionIds: [quizOptionYes],
        onCorrect: [{ variableId: scoreVariableId, op: "add", value: 1 }],
        onIncorrect: [],
        advanceOnCorrect: false,
        advanceOnIncorrect: false,
      },
    ],
  };

  const branchBPage: Page = {
    id: createId(),
    layoutId: layout.id,
    blocks: [
      {
        id: createId(),
        kind: "text",
        position: { x: 5, y: 25, width: 90, height: 50 },
        html: "<p>Das ist der zweite Zweig – lege hier den alternativen Lernpfad an.</p>",
      },
    ],
  };

  const branches: Branch[] = [
    {
      id: branchAId,
      label: "Zweig A",
      condition: { variableId: scoreVariableId, comparator: "gte", value: 1 },
      pageIds: [branchAPage.id],
    },
    { id: createId(), label: "Zweig B (sonst)", condition: null, pageIds: [branchBPage.id] },
  ];

  const logicBlock: LogicBlock = {
    id: createId(),
    name: "Verzweigung",
    branches,
  };

  const finalPage: Page = {
    id: createId(),
    layoutId: layout.id,
    blocks: [
      {
        id: createId(),
        kind: "text",
        position: { x: 5, y: 25, width: 90, height: 50 },
        html: "<p>Geschafft! Hier landen alle Zweige wieder.</p>",
      },
    ],
  };

  const pages: Record<string, Page> = {
    [titlePage.id]: titlePage,
    [branchAPage.id]: branchAPage,
    [branchBPage.id]: branchBPage,
    [finalPage.id]: finalPage,
  };

  const sequence: SequenceNodeRef[] = [
    { kind: "page", pageId: titlePage.id },
    { kind: "logic", logicBlockId: logicBlock.id },
    { kind: "page", pageId: finalPage.id },
  ];

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
    lms: { enabled: false, allowedOrigins: [] },
  };

  return {
    formatVersion: 1,
    content,
    undoHistory: [],
    undoIndex: -1,
  };
}
