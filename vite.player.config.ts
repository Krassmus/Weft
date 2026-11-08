import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";

// The page of the app "Weft Player" (player/): only plays learning modules - none of the editor is in it. It shares the code of src/ (reading a
// module, making its page, the library of a device) and has its own entry point, so that only what it needs ends up in its bundle.
//   npm run dev:player     the page in a browser (port 1430) - the Tauri app of the player (player/src-tauri) loads it from there
//   npm run build:player   dist-player/ - what the Tauri app of the player packs
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
  root: "player",
  plugins: [react()],
  resolve: {
    alias: [
      // As in vite.config.ts: Automerge's browser entry loads its WebAssembly as a separate module; the embedded-base64 entry works in any bundler and
      // inside the web view of an app alike. (Reading a module goes through code that knows Automerge - src/core/io/unpack.ts.)
      {
        find: /^@automerge\/automerge$/,
        replacement: new URL("./node_modules/@automerge/automerge/dist/mjs/entrypoints/fullfat_base64.js", import.meta.url).pathname,
      },
    ],
  },
  clearScreen: false,
  server: {
    port: 1430,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1431 } : undefined,
    // (The code of src/ is outside the root of this page.)
    fs: { allow: [".."] },
  },
  build: {
    outDir: "../dist-player",
    emptyOutDir: true,
  },
}));
