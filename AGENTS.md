# AGENTS.md

Weft is an open-source app for presentations and interactive learning modules (Tauri 2, React, TypeScript). A learning module is a
`.weft` file: a zip archive with `weft.json` (the whole document), `index.html` (a self-contained player) and `logo.png`.

## If you are asked to build, check, translate or change a learning module

Use the command line tool `weft` (or the MCP server `weft-mcp`, same abilities). The desktop app brings both with a Node of its own (Settings → KI-Assistenten → install; `~/.local/bin/weft`); from the repository you need Node 22; for pictures of the slides
(`weft render`, `weft play`, `weft validate --layout`) also an installed Chrome, Chromium, Edge or Brave.

```bash
npm install && npm run build:cli          # builds cli/dist/weft.mjs and cli/dist/weft-mcp.mjs
node cli/dist/weft.mjs guide              # READ THIS FIRST: how to build a module that looks good and works
node cli/dist/weft.mjs guide ops          # every operation of `weft edit` with parameters and an example
node cli/dist/weft.mjs help               # every command
node cli/dist/weft.mjs version            # tool version, file format it reads and writes, Chrome found?
```

The loop: `weft new module.weft --empty` → `weft edit module.weft operations.json -o module.weft` (a JSON list of operations; all or
nothing) → `weft validate module.weft --layout` (also tells what does not fit its box) → `weft play module.weft --steps "weiter; tick 1; submit"`
and `weft render module.weft --all -o pictures/` (look at the result) → repeat. `weft inspect` shows what is in a module, `weft schema <kind>`
how a block looks, `weft text export` / `weft text import` translate it.

**Live in the open app:** if the person has the Weft desktop app open, `weft status` (MCP: `weft_status`) says so, and `weft inspect`, `weft validate`, `weft render`, `weft play` and `weft edit operations.json` called WITHOUT a file work on the module that is open there - every change shows up in the app at once as one undoable step. `weft open module.weft` puts a file into the app. The person allows this in the app's settings (KI-Assistenten).

Good to know: a file of a newer format than the tool knows is refused for changes, an older one too (open and save it in Weft once); the tool never overwrites its source (`weft edit` writes `<name>.ai.weft` or the file given with `-o`); its messages are in German,
their `code`s and the `--json` output are not; a finished example is `src/start-content/examples/durch-drei-teilbar.weft`. As an MCP server:
`node cli/dist/weft-mcp.mjs` over stdio, start with the tool `weft_guide`.

What does not work: on an iPad or iPhone (no Node, no Chrome, an app cannot drive another app) and in a chat without a shell - there
a person has to hand the `.weft` file over. See `docs/mcp.md` ("Ausblick") for what that means for distribution.

## If you are asked to change Weft itself

- `README.md` explains the architecture and the data model (`src/core/types.ts` is the source of truth for the file format).
- Check types with `npx tsc --noEmit -p .`; the CLI is built by `npm run build:cli` (it is not covered by `tsc`: run a command to try it).
- After a change to `src/core/types.ts` run `npm run schema` and commit `docs/weft.schema.json`.
- The docs exist in German and English (`docs/ai-authoring.md` / `.en.md`, `docs/cli.md` / `.en.md`, `docs/operations.md` / `.en.md`); the CLI
  embeds them for `weft guide`, so change both languages together. Every operation of `weft edit` must be described in `docs/operations*.md`.
- The editor in the browser: `npm run dev` (http://localhost:1420). The desktop and iOS apps: `npm run tauri …`.
