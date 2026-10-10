import { orderedValues } from "../document/ordering";
import { buildEventGraph } from "../eventGraph/buildEventGraph";
import { branchPageIds, sequenceOf } from "../document/sequence";
import type { WeftModule } from "../types";

function withoutOrder<T extends { order: string }>(item: T): Omit<T, "order"> {
  const { order: _order, ...rest } = item;
  return rest;
}

function mapValues<T, R>(record: Record<string, T>, fn: (value: T) => R): Record<string, R> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, fn(value)]));
}

/**
 * The module as player.runtime.js reads it: the exported player keeps working on plain arrays -
 * blocks bottom to top, the sequence in playing order, a branch's `pageIds`, a page's trigger edges - while the document the
 * editor saves keeps those as keyed collections with `order` keys (see core/document/ordering.ts).
 * Converting here, once, at export time keeps the player free of that and exported modules in one
 * stable shape however the document's own shape moves on.
 */
export function toRuntimeModule(module: WeftModule): unknown {
  return {
    ...module,
    sequence: sequenceOf(module).map(withoutOrder),
    layouts: mapValues(module.layouts, (layout) => ({ ...layout, blocks: orderedValues(layout.blocks).map(withoutOrder) })),
    pages: mapValues(module.pages, (page) => {
      const { timeline: _timeline, ...rest } = page;
      return {
        ...rest,
        blocks: orderedValues(page.blocks).map(withoutOrder),
        // What happens on the page and what causes what, ready to run (see core/eventGraph): the player reads nothing of the
        // stored timeline.
        graph: buildEventGraph(page, page.layoutId ? module.layouts[page.layoutId] : null),
      };
    }),
    logicBlocks: mapValues(module.logicBlocks, (logicBlock) => ({
      ...logicBlock,
      branches: logicBlock.branches.map(({ pages: _pages, ...branch }) => ({ ...branch, pageIds: branchPageIds({ pages: _pages }) })),
    })),
  };
}
