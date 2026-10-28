# Weft on the command line (and for AI)

The tool `weft` reads a `.weft` file (a zip archive; `weft.json` inside is the source of truth) and answers questions without changing anything:

- **What is in it?** `weft inspect`
- **Is it right?** `weft validate`
- **How is the format built?** `weft schema`

It also draws and plays modules (`weft render`, `weft play`), creates and changes them (`weft new`, `weft edit`) and helps with translating (`weft text export`, `weft text import`). This page is the English version of [cli.md](cli.md).

It uses the same functions as the editor (slide numbers, event graph, translations); what it says is what Weft itself would say. It is made for scripts and for AI assistants that have to understand, check or edit a learning module. **New here? `weft guide` prints the guide to building a module** (`weft guide ops` the operations, `weft guide cli` this page).

## Calling it

**With the desktop app:** it brings the tool with a Node of its own. In the settings, under "AI assistants" (KI-Assistenten), click "Install the command line tool", then `weft …` works in a terminal (the folder `~/.local/bin` has to be on the PATH; the settings say how). An update of the app updates the tool with it.

In the project (Node 22):

```bash
npm run weft -- inspect my-module.weft
npm run weft -- validate my-module.weft
npm run weft -- schema quiz
```

`npm run weft` builds the tool (`cli/dist/weft.mjs`) and runs it. After that `node cli/dist/weft.mjs <command> …` works too.

Status codes: `0` fine · `1` the check found errors (with `--strict` warnings too) · `2` wrong call or unreadable file.

**The messages of the tool are in German** (the texts of findings and hints); their `code`s and `--json` are language independent. `WEFT_LANG=en` makes the content that commands create (names of a new branch ...) English.

## `weft version [--json]`

The version of the tool (that of the Weft app it is built from), the file format it reads and writes (5 today), Node and the browser found for drawing. Also `weft --version`.

**Files of another format:** the tool converts nothing. A file with a **newer** format (saved by a newer Weft) can only be read with reservations; `inspect`, `render`, `play`, `html` and `text export` say so as a notice on stderr, `validate` reports `format-version` as an error, and **changing** (`edit`, `text import`) is refused. A file with an **older** format is read (with a notice, `validate` warns) but not changed - open it in Weft once and save, then it works. That way an old tool never damages a newer file, and a new one never writes a mixture of the old and the new shape.

## The module that is open in the app: without a file, `weft status`, `weft open`

When the Weft app (desktop) is running, `inspect`, `validate`, `render`, `play`, `html` and `text export` work **without a file** on the module that is open there. `weft edit operations.json` (only the operations, no file) **changes it live**: the changes appear in the app at once, as one step of its history (Cmd+Z / Ctrl+Z), and whatever the person changed themselves meanwhile stays.

```bash
weft status                        # is the app running, what is open, what may the AI do
weft inspect                       # the open module
weft edit operations.json          # change it live
weft open module.weft              # show a file in the app (as a new module that is not saved yet)
```

The person decides in the app's settings (KI-Assistenten) whether that is allowed: nothing, look only, look and change. The app opens a door for this computer only (a socket on 127.0.0.1, port and password in `control.json` in the app's data folder, readable by this user only); `WEFT_CONTROL_FILE` points to another `control.json` (a second copy of the app, say). There is none on an iPad or iPhone, nor in the App Store version (it keeps its data in a folder of its own).

**Status:** the settings section "KI-Assistenten" is hidden for now (`AI_SETTINGS_VISIBLE` in `src/core/control/bridge.ts`), and while it is, the door is **off**. To try it, set `localStorage["weft.control.mode"] = "edit"` (or `"read"`) in the app's web view.

## `weft inspect <file> [--page <number>] [--json]`

The outline of the module: title, languages, variables, layouts with their blocks, then all slides in the order in which they are played (with forks and jump slides). Every block is one line with kind, content and id.

- Slides carry the numbers of the slide overview (`3`, `2.a.1`). With `--page 2.a.1` (or a slide id) one slide is given in detail: position and effects of the blocks, all events ("Start der Folie", "Aufbau …", "Quiz richtig abgeschickt" …) and all triggers between them. Events that never happen are marked.
- `--json` gives the same data as JSON, for further processing.

## `weft validate <file> [--json] [--strict]`

Checks the file for

| Group | Messages (`code`) |
|---|---|
| Format | `format-version` (newer/older than this Weft), `schema` (a field is missing or of the wrong kind), `schema-unknown-field` (unknown field, harmless) |
| References | `layout-missing`, `sequence-page-missing`, `branch-page-missing`, `condition-variable-missing`, `jump-target-missing`, `button-target-missing`, `button-target-empty`, `effect-variable-missing`, `quiz-correct-missing`, `group-block-missing`, `placeholder-link-broken`, `placeholder-on-page` |
| Files | `asset-missing` (not in the list), `asset-file-missing` (not in the archive), `media-empty` |
| Events | `event-unreachable` (nothing triggers it), `event-multiple-triggers` (several triggers - a Weiter chain and a quiz, say; a warning when a Weiter is among them), `page-no-exit` (the "next slide" cannot be reached), `trigger-dangling` (a trigger between events that do not exist) |
| Content | `placeholder-variable` (unknown `{{variable}}` or formatting inside the name), `html-color-invalid` (`<font color>` without #rrggbb, rgba for instance), `html-font-unknown` (font not in the list), `quiz-no-correct`, `quiz-few-options`, `cloze-no-blanks`, `translation-missing`, `block-off-slide`, `block-no-size` |
| Hints | `image-no-alt`, `button-no-text`, `variable-unused`, `variable-duplicate`, `page-deleted` |

Every message has `severity` (`error`, `warning`, `info`), `code`, `message`, where useful `hint` (what to do) and the place (`page` with number and id, `layout`, `blockId`).

A note on deleted slides: deleting a slide only removes its place in the slide overview; the object stays in the file. `weft` ignores such slides and reports them once as `page-deleted`.

### Does the content fit its box? `weft validate --layout`

The check above only reads the file. Whether a text fits its box only a browser can tell: `weft validate <file> --layout [--page 3]` draws the slides with the module's player (Chrome, Chromium, Edge or Brave needed, as for `weft render`) and measures. What does not fit is reported as `block-overflow` with the hint how high the block has to be at least. Texts, lists, buttons, quizzes and gap texts are measured; the last two with the feedback that replaces the button after submitting. A few pixels below the letters (room for descenders) do not count as cut off. A module with several languages is checked in each of them (`[en_US]` in front of the finding).

## `weft schema [<name>] [--list] [--json] [--full]`

The file format. Without a name: the kinds of blocks with one sentence each on what they are for. With a name (a kind like `quiz` or a definition like `Page`, `BlockEffect`): all fields with type, required and description. `--json` gives the definition as JSON Schema, `--full` the whole schema.

The schema is also a file: [`weft.schema.json`](weft.schema.json). It is generated from the TypeScript types in `src/core/types.ts`:

```bash
npm run schema
```

## Translating: `weft text export` / `weft text import`

The way for "translate this learning module into French":

```bash
npm run weft -- text export module.weft --to fr_FR --from de_DE -o texts.json
# ... have texts.json translated (by an AI, say) ...
npm run weft -- text import module.weft texts.json -o module.fr.weft
```

**Export** (`--to` one or more languages separated by commas; `--from` only needed when the module has no language yet; `--missing` only what has no translation yet):

- A JSON file with all the texts a learner is shown: texts, gap texts, questions and answers of quizzes, quiz explanations, list items and button labels, heading and text of info icons, also those of the layouts. Deleted slides are not in it.
- Every entry in `items` has a `key` (`<block id>#<part>`), the `source` (HTML with formatting), the place as `context` ("Folie 2.a.1 · Quiz · Antwort 2") and `translations` with an empty field per target language. The translation goes there, filled in by a person or an AI. Existing translations are entered.
- The file holds short instructions in `instructions` for whoever translates: tags and `{{variables}}` stay, in gap texts the answers in `[[ ]]` are translated too, do not change keys and source.

**Import** (`-o` target file, default `<name>.<language>.weft` next to the source; `--dry-run` only shows what would happen; `--force` allows overwriting):

- Writes to a **new** file - the source stays unchanged. Images, videos, audio files and fonts are copied.
- Missing languages are added to the module (when it has none, `--from`/`from` becomes the default language). The language of the module only becomes a choice for the learners when there is a language switch (the "language" block) - add it with `add_block` and `kind: "language"` (see [ai-authoring.en.md](ai-authoring.en.md)).
- Every translation is checked before it is taken: tags have to be nested correctly; scripts, `on…=` attributes and `iframe` are forbidden (the text is skipped then); in gap texts the number of `[[blanks]]` has to match. Differing `{{variables}}` or tags are warnings. What was skipped is in the report with its key, and the status code is `1` then.
- The editing history (`weft.automerge`) and the playing HTML (`index.html`) are not taken along: they described the old state. Weft writes them again on the next save.

## Drawing slides: `weft render`

```bash
npm run weft -- render module.weft --page 2.a.1 -o slide.png
npm run weft -- render module.weft --all -o pictures/        # all slides, one PNG each
```

Draws a slide as PNG with the module's player in a headless Chrome (Chrome, Chromium, Edge or Brave must be installed; otherwise give the path in `WEFT_CHROME` or with `--chrome`). Fonts, images and videos (first frame) come from the module.

- Default: everything on the slide is there (nothing waits for its build step, nothing goes on by itself); `--state start` shows the slide the way it begins.
- `--width 1280` (default; the height follows from the aspect ratio), `--lang fr_FR` for a language of the module.
- Jump slides are never shown and cannot be drawn.

## Playing through: `weft play`

```bash
npm run weft -- play module.weft --page 4 --steps "tick 1 3 5; submit; weiter" -o play/
```

`weft render` draws one slide in one state. `weft play` plays the module like a learner (the player in a Chrome, as for `render`) and says after every step in words what changed: which blocks are new or gone, which slide you are on now, what a quiz reported. Plus a picture per step in the folder `-o` (default `weft-spiel`).

| Step | What it does |
|---|---|
| `weiter` · `zurueck` | press → / ← (the module's keyboard navigation has to be on) |
| `click <text>` | click the first visible button, answer or link with this text |
| `tick <n> …` | tick the n-th answers (from 1) of the first quiz that is still open |
| `zuordnen <object> <target>` | in the first matching, assign an object (by its text) to a target |
| `sortieren <object> …` | in the first sorting puzzle that is still open, bring the objects (by their texts) into this order |
| `galerie weiter\|zurueck\|oeffnen\|schliessen` | in the first gallery go to the next / previous picture (also while one is open large), open the picture that is shown large (with its caption) or close the open one |
| `loesung <Wort>` | write the word into the first solution word that can still be tried and press "Abschicken" (the message says whether it was right) |
| `submit` | press "Abschicken" of the first quiz, gap text, matching or sorting puzzle that is still open |
| `fill <text> …` | fill in the blanks of the first open gap text in order |
| `key <name>` · `wait <ms>` · `shot` | press a key · wait · just a picture |

`--page` says which slide the play begins with, `--lang` in which language. Steps stand in `--steps` separated by `;` (words with spaces in "quotes").

## The page of the player: `weft html`

```bash
npm run weft -- html module.weft -o folder/ [--page 3]
```

Writes `index.html` with images, videos and fonts into a folder, for looking at it in a browser or for checking further with your own tools. With `--page` the module begins with that slide.

## Creating and changing: `weft new` / `weft edit`

```bash
npm run weft -- new room.weft --title "Escape room" --languages de_DE
npm run weft -- new empty.weft --empty                 # no layout and no slide (add_layout, add_page create them)
npm run weft -- edit room.weft operations.json         # writes room.ai.weft
npm run weft -- edit --ops                             # the operations, with parameters and an example
```

`weft edit` runs a list of operations (`set_title`, `add_page`, `add_block`, `update_block`, `add_variable`, `add_logic`, `add_jump_page`, `add_trigger`, `fill_placeholder`, `add_image`, `add_video`, `add_audio` ...). They are the actions of the editor, run on the file. The source stays unchanged, the working copy `<name>.ai.weft` (or with `-o`) is written. Nothing is written when an operation fails or the changes produce errors (`--allow-errors`); `--dry-run` only checks. The operations with examples: `weft guide ops` ([operations.en.md](operations.en.md)). As an MCP server all commands are there for AI assistants without a command line ([mcp.md](mcp.md)).

## How an AI can work with it

How to build a learning module that looks good (grid, font sizes, Weiter chains, traps) is in [ai-authoring.en.md](ai-authoring.en.md) - `weft guide` prints it.

1. `weft guide` - read the guide once.
2. `weft inspect file.weft` - get an overview without reading the whole file.
3. `weft schema <kind>` - look up what a block looks like before writing one.
4. `weft edit` with a list of operations (`weft guide ops`), then `weft validate --layout`, `weft play`, `weft render` - until nothing is reported and the pictures look right.
5. Translating: `weft text export`, translate the entries, `weft text import` - without having to know the structure of the module.
6. Anything the operations cannot do: edit `weft.json` in the archive (`unzip`, edit, zip again) - the ids, `order` keys and references as in the outline.
