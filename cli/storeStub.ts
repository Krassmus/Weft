import type { WeftModule } from "../src/core/types";

// Stands in for src/core/document/store.ts in the command line tool (see vite.cli.config.ts): the editor's actions
// (core/document/actions.ts) change "the document" through useDocumentStore.getState().edit(label, recipe). Here the document is a
// plain module that a run of operations (cli/ops.ts) hands in, and the recipe simply changes it in place.

let current: WeftModule | null = null;

/** The module the actions work on until it is set again (null: none). */
export function setCurrentModule(module: WeftModule | null): void {
  current = module;
}

function module(): WeftModule {
  if (!current) throw new Error("Es ist kein Modul geladen, an dem etwas geändert werden könnte.");
  return current;
}

export const useDocumentStore = {
  getState() {
    return {
      edit(_label: string, recipe: (draft: WeftModule) => void): void {
        recipe(module());
      },
      get doc() {
        return { formatVersion: 5, content: module() };
      },
      select(): void {
        // there is no selection here
      },
    };
  },
};

export type BlockContainerRef = { kind: "page"; pageId: string } | { kind: "layout"; layoutId: string };
