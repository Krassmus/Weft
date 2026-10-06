import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],

  resolve: {
    alias: [
      // Automerge's browser entry loads its WebAssembly as a separate module (needs a bundler plugin);
      // the embedded-base64 entry works in any bundler and inside Tauri's webview alike. automerge-repo
      // itself only imports "@automerge/automerge/slim" and expects this entry to have set the
      // WebAssembly up first (see core/collab/automerge.ts).
      {
        find: /^@automerge\/automerge$/,
        replacement: new URL("./node_modules/@automerge/automerge/dist/mjs/entrypoints/fullfat_base64.js", import.meta.url).pathname,
      },
    ],
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
