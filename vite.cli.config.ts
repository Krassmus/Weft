import { defineConfig } from "vite";

/**
 * Builds the command line tool (cli/main.ts -> cli/dist/weft.mjs, see `npm run weft`). It reuses the pure parts of src/core - page
 * labels, the event graph, the translations - so what it says about a module is what the editor says. Automerge (what the editor
 * keeps its documents in) is not needed to read a file: the one place in src/core that asks it something is stubbed. The editor's
 * actions (core/document/actions.ts) run on a plain module there (cli/storeStub.ts), which is what makes `weft edit` and the
 * MCP server (cli/mcp.ts -> cli/dist/weft-mcp.mjs) exactly as capable - and as careful - as the editor.
 */
export default defineConfig({
  // (Not the editor's public/ folder.)
  publicDir: false,
  resolve: {
    alias: [
      { find: /^\.\/automerge$/, replacement: new URL("./cli/automergeStub.ts", import.meta.url).pathname },
      // The editor's actions change the document through its store: here they change a plain module (see cli/storeStub.ts).
      { find: /^(\.{1,2}\/)(.*\/)?store$/, replacement: new URL("./cli/storeStub.ts", import.meta.url).pathname },
      { find: /^(\.{1,2}\/)(.*\/)?videoTranscode$/, replacement: new URL("./cli/videoStub.ts", import.meta.url).pathname },
    ],
  },
  build: {
    ssr: true,
    outDir: "cli/dist",
    emptyOutDir: true,
    target: "node22",
    minify: false,
    rollupOptions: {
      input: { weft: "cli/main.ts", "weft-mcp": "cli/mcp.ts" },
      output: { entryFileNames: "[name].mjs" },
    },
  },
});
