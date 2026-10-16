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
import { tr } from "../i18n/tr";

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
    name: tr("ui.default"),
    blocks: blockRecord([
      {
        id: createId(),
        kind: "text",
        position: { x: 5, y: 5, width: 90, height: 15 },
        html: tr("ui.slide_title"),
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
        html: tr("ui.welcome_to_your_new_learning_module"),
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
        questionHtml: tr("ui.is_weft_cross_platform"),
        options: [
          { id: quizOptionYes, html: tr("ui.yes") },
          { id: quizOptionNo, html: tr("ui.no") },
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
        html: tr("ui.this_is_the_second_branch_put"),
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
      label: tr("ui.branch_a"),
      condition: { variableId: scoreVariableId, comparator: "gte", value: 1 },
      pages: orderedRecord([{ id: branchAPage.id }]),
    },
    { id: createId(), label: tr("ui.branch_b_else"), condition: null, pages: orderedRecord([{ id: branchBPage.id }]) },
  ];

  const logicBlock: LogicBlock = {
    id: createId(),
    name: tr("ui.branching"),
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
        html: tr("ui.done_this_is_where_all_branches"),
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
    title: tr("ui.new_learning_module"),
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
    colorPalette: [],
    languages: [],
    keyboardNavigationEnabled: true,
  };
  ensureBuiltinVariables(content.variables);

  return {
    formatVersion: CURRENT_FORMAT_VERSION,
    content,
  };
}

/**
 * A new learning module with one white slide and nothing on it (the "Neues Lernmodul" of the start screen and File > New): a
 * layout without elements, one page, one entry in the sequence. The demo module `createEmptyDocument` builds is
 * what the command line tool starts from.
 */
export function createBlankDocument(): WeftDocument {
  const now = new Date().toISOString();
  const layout: Layout = { id: createId(), name: tr("ui.default"), blocks: {} };
  const page: Page = { id: createId(), layoutId: layout.id, blocks: {}, groups: [], timeline: createDefaultPageTimeline() };
  const sequence = orderedRecordBy<SequenceNodeRef>([{ kind: "page", pageId: page.id }], sequenceKey) as Record<string, SequenceEntry>;
  const content: WeftModule = {
    id: createId(),
    title: tr("ui.new_learning_module"),
    aspectRatio: "16:9",
    createdAt: now,
    modifiedAt: now,
    variables: [],
    layouts: { [layout.id]: layout },
    pages: { [page.id]: page },
    logicBlocks: {},
    sequence,
    assets: [],
    customFonts: [],
    colorPalette: [],
    languages: [],
    keyboardNavigationEnabled: true,
  };
  ensureBuiltinVariables(content.variables);
  return { formatVersion: CURRENT_FORMAT_VERSION, content };
}
