import { defineConfig } from "vite";

/**
 * Builds the command line tool (cli/main.ts -> cli/dist/weft.mjs, see `npm run weft`). It reuses the pure parts of src/core - page
 * labels, the event graph, the translations - so what it says about a module is what the editor says. Automerge (what the editor
 * keeps its documents in) is not needed to read a file: the one place in src/core that asks it something is stubbed.
 */
export default defineConfig({
  resolve: {
    alias: [{ find: /^\.\/automerge$/, replacement: new URL("./cli/automergeStub.ts", import.meta.url).pathname }],
  },
  build: {
    ssr: "cli/main.ts",
    outDir: "cli/dist",
    emptyOutDir: true,
    target: "node22",
    minify: false,
    rollupOptions: { output: { entryFileNames: "weft.mjs" } },
  },
});
