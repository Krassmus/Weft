import { defineConfig } from "vitest/config";

/**
 * The tests (tests/*.test.ts) run the pure parts of src/core in Node, the way the command line tool does (vite.cli.config.ts): the editor's
 * actions work on a plain module there (cli/storeStub.ts) and Automerge is not needed - so the same aliases.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: /^\.\/automerge$/, replacement: new URL("./cli/automergeStub.ts", import.meta.url).pathname },
      { find: /^(\.{1,2}\/)(.*\/)?store$/, replacement: new URL("./cli/storeStub.ts", import.meta.url).pathname },
      { find: /^(\.{1,2}\/)(.*\/)?videoTranscode$/, replacement: new URL("./cli/videoStub.ts", import.meta.url).pathname },
    ],
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
