# Building a learning module (for AI and scripts)

`weft` reads, checks, changes and draws Weft learning modules (`.weft` files: a zip archive with `weft.json`). This page is the short guide to building one that looks good and works - it collects what one would otherwise find out by trying. It is the English version of [ai-authoring.md](ai-authoring.md). The commands are in [cli.en.md](cli.en.md), the operations of `weft edit` in [operations.en.md](operations.en.md) (`weft guide ops`). A finished example: [`src/start-content/examples/durch-drei-teilbar.weft`](../src/start-content/examples/durch-drei-teilbar.weft) ("Numbers divisible by three": steps that appear on Weiter, quizzes, gap texts, a fork, two languages).

Good to know before you start:

- **The messages of the tool are in German** (finding texts, hints), their `code`s are not (`block-overflow`, `html-color-invalid` …). `--json` gives them as data. `WEFT_LANG=en` makes the content that commands create (names of a new branch ...) English.
- **"Weiter"** is the learner's "next" input (Space, arrow, tap, the Weiter button): a slide can show its content step by step on every Weiter before it moves on.
- **Nothing is overwritten**: `weft edit` writes a working copy (`<name>.ai.weft`) or the file you name with `-o`.

## The loop

1. **Create:** `weft new module.weft --empty` (no layout, no slide; without `--empty` there is a layout "Standard" with a title placeholder and one empty slide).
2. **Build:** `weft edit module.weft operations.json -o module.weft`. All or nothing; the answer names the ids. With `"as": "name"` an operation gives a name that later operations use as `"$name"`.
3. **Check:** `weft validate module.weft --layout`. Without `--layout` it only reads the file; with `--layout` it draws the slides in the player and reports what does not fit its box (`block-overflow`, with the height the block needs at least).
4. **Play through:** `weft play module.weft --page 4 --steps "tick 1 3; submit; weiter"`: after every step it says what is new or gone, which message a quiz gave and which slide you are on; plus a picture per step. This shows what `weft render` (one slide, one state) does not.
5. **Look:** `weft render module.weft --all -o pictures/` (everything on the slide) or `--state start` (the way it begins).

Commands 3 to 5 need Chrome, Chromium, Edge or Brave (otherwise `WEFT_CHROME`).

## The grid of a slide

- Positions and sizes are **percent** of the slide (`x`, `y`, `width`, `height`; 0 to 100). At 16:9, 1 % of the width is 12.8 pixels at a slide width of 1280 pixels.
- **Font sizes** are in `cqw`: percent of the slide's width. Standard text 1.7 · body text 2.2 to 2.9 · headings 3.5 to 6 · small print 1.6 to 1.9.
- **Height of a text:** a line needs `size × line height` cqw; at 16:9, 1 cqw is 1.78 % of the slide's height (in general: the aspect ratio in %). A line of 2.4 cqw with a line height of 1.25 therefore needs about 5.3 % plus a little air. A letter is about 0.5 em wide. `add_text` estimates the height when you give none; `validate --layout` tells exactly whether it is enough.
- Buttons need room at the bottom left and right (Back/Next at y ≈ 85.6), below them a progress bar (y ≈ 94). Content should end at about y ≈ 83.

## Texts

`add_text` writes the HTML the way the editor writes it:

```json
{"op": "add_text", "page": "$one", "x": 7, "y": 22, "width": 60,
 "paragraphs": [[{"text": "Digit sum", "color": "#fbbf24", "bold": true}, " = add up all the digits."], "Example: 4 + 8 + 2 + 7 = 21"],
 "size": 2.4, "color": "#f8fafc", "gap": 1, "box": {"fillOpacity": 0.1, "radius": 2, "padding": 2}, "effect": "fade"}
```

`text` (lines = paragraphs) or `paragraphs` (paragraphs made of parts with their own colour, size, font) or raw `html`. With `box` the text gets a **background with a border**: a card in one block (fill, border, rounding, padding; with `"blur": true` the background shows through, blurred, like frosted glass). That is better than a shape under a text: one build step, one object to copy.

If you write HTML yourself:

- Allowed and read by the editor: `<p style="…">`, `<b>`, `<i>`, `<u>`, `<br>`, `<font color="#rrggbb" face="Font">`, `<span style="font-size:2.4cqw">`.
- **`<font color>` takes only `#rrggbb`.** An `rgba(…)` colour there is silently read as another colour. Translucent works with `<span style="color:rgba(251,191,36,0.4)">`. `validate` reports it as `html-color-invalid`.
- Paragraphs have a gap: `<p style="margin:0 0 1cqw 0;line-height:1.25">` makes the height predictable.
- **Fonts** only from the list, with exactly this name in `face` (otherwise `html-font-unknown` and the standard font): Open Sans (standard), Roboto, Oswald, Merriweather, Playfair Display, Cinzel, Courier Prime, Metamorphous, Caveat, Amatic SC, Schoolbell, Lato, Quicksand, Cormorant Garamond, Dancing Script, Ubuntu, Black Ops One, Original Surfer, Bungee, Libre Baskerville, Share Tech, Lilita One, Mansalva, Ribeye, Abril Fatface, Barlow Condensed, Josefin Sans, Unbounded, Over the Rainbow, Sanchez, Orbitron, Exo 2, Montserrat Alternates, Racing Sans One, Shadows Into Light, Eagle Lake, Delicious Handrawn, Sassy Frass, Quattrocento, Indie Flower, Titan One, Luckiest Guy, Vast Shadow, Pirata One, Alice, Pixelify Sans, Averia Serif Libre, Sedgwick Ave Display, Barriecito, Oi, Alumni Sans Collegiate One, Matemasie, Nosifer, Rubik Broken Fax, Monofett, Rubik Dirt, Creepster, UnifrakturCook, Rubik Wet Paint, Frijole, Barrio, Butcherman, Geist Pixel, Faster One, Uncial Antiqua.
- A **button** has no font of its own: it comes from the style of the module (`set_look`). Only its text is free.

## Shapes and look

- `add_shape`: rectangle, ellipse, polygon, star, with `color`/`opacity` or `gradient` (`{"kind": "linear", "angle": 135, "stops": [["#0b1124", 0], ["#1c1a4d", 100]]}`), `radius`, `stroke`, `shadow`, `blur` (rectangle and ellipse only: lets the background show through, blurred). A background over the whole slide belongs in a **layout**, not on every slide.
- `set` in `add_block`/`update_block` merges objects with what is there: `{"position": {"y": 40}}` keeps `x`, `width` and `height`.
- `set_look {brightness, accentColor, interactiveStyle}`: light/dark, the accent colour (buttons, quiz, marking) and the style of buttons and answers (`plain`, `elegant`, `round`, `futuristic`). That is all there is to set for the standard elements.
- `set_palette {colors}` puts the colours of the module into every colour picker; `set_transition {page: "all", type, durationMs}` sets the slide transition.
- Blocks can have a **name** (`"name": "Heading"`): it shows in the event graph, in the list of elements and in `weft inspect` instead of the kind.

## Building up step by step (Weiter)

A block with an entrance effect (`"effect": "fade"`) automatically gets a trigger "at the next Weiter input", in the order in which the blocks were created. That is usually what you want: Weiter, and the next thought appears; after the last one the next slide follows.

Want it differently? Then say what triggers with `set_trigger` (this **replaces**; `add_trigger` on the other hand adds, and the first trigger that happens counts - the Weiter chain stays too):

```json
{"op": "set_trigger", "page": "$one", "to": "entrance:$rule", "from": "start", "weiter": true}
{"op": "set_trigger", "page": "$one", "to": "entrance:$hint", "from": "entrance:$rule", "weiter": true}
{"op": "set_trigger", "page": "$one", "to": "end", "from": "entrance:$hint", "weiter": true}
```

- `"weiter": true`: only at the next input after `from`. Without: after `delayMs` (default 0), that is at the same time.
- Events: `start`, `end` (next slide), `entrance:<block>`, `exit:<block>`, `click:<button>`, `quiz-fill:<quiz>`, `quiz-submit:<quiz>`, `quiz-correct:<quiz>`, `quiz-incorrect:<quiz>`, `video-start:<video>`.
- When a card and a text should appear together: the text with `box` is one block. Otherwise hang shape and text on each other with `set_trigger` without `weiter`.
- `weft validate` reports `event-multiple-triggers` when an event is triggered by several (a warning when a Weiter is among them), and `weft inspect --page` marks these triggers.

## Quiz and gap text

- Quiz: `questionHtml`, `options` (`id`, `html`), `correctOptionIds`. **`explanation`** is a text shown after submitting under "right/wrong" - no detour through triggers needed. Several right answers are possible.
- Gap text: the answers stand as `[[answer]]` in the text, several right ones with `|` (`[[Shakespeare|Shakespear]]`). `caseSensitive` and `tolerance` (typos, 0 to 2) say what counts as right. Spaces never count (1 714 is 1714).
- Both need room for their feedback under the button: `validate --layout` measures it too.

## Forks

Whoever answers a quiz wrongly can take another way than whoever had it right. For that the quiz remembers the result in a variable, and a fork then picks the branch:

```json
{"op": "add_variable", "name": "quizCorrect", "type": "boolean", "initialValue": false}
{"op": "add_block", "page": "$quiz", "kind": "quiz", "set": {"…": "…", "onCorrect": [{"variableId": "quizCorrect", "op": "set", "value": true}], "onIncorrect": [{"variableId": "quizCorrect", "op": "set", "value": false}]}}
{"op": "add_logic", "layout": "$content", "name": "Quiz correct?", "as": "fork", "branches": [
  {"label": "Correct", "condition": {"variable": "quizCorrect", "comparator": "eq", "value": true}},
  {"label": "A closer look"}]}
{"op": "add_page", "layout": "$content", "branch": {"logic": "$fork", "branch": "Correct"}, "as": "next1"}
{"op": "remove_page", "page": "5.a.1"}
```

- The last branch is the "otherwise" and has no condition.
- **Every branch comes with an empty slide.** Add your own slides with `add_page` and `branch`, then remove the empty one with `remove_page` (a number like `5.a.1`) - `weft inspect` counts the numbers. The deleted slide stays in the file as the hint `page-deleted`; if you do not want that, fill the empty slide instead (its id is in the answer of `add_logic`) in a second `weft edit`.
- After the fork the main sequence goes on; all branches meet there again.
- `weft play module.weft --page 4 --steps "tick 2; submit; weiter"` plays one branch through.
- Variable names are not translated: give them English names.

## Several languages

A module in two languages is made from the finished one in the first language:

1. `weft text export module.weft --from de_DE --to en_US -o texts.json`: all texts as a list (quiz explanations and info icons too).
2. Translate the entries: the HTML stays, only the words change; `[[answers]]` in gap texts are translated with it. Write numbers the way the target language does (4 827 → 4,827).
3. `weft text import module.weft texts.json -o module.two.weft`.
4. **Add a language switch** (`add_block` with `kind: "language"`, best in the layout, top right and wide enough for "English (United States)"), otherwise the learners cannot choose the language.
5. `weft validate --layout` checks the slides in every language; a translation is often longer than the original (`block-overflow` with the language in front). `weft render --lang en_US` and `weft play --lang en_US` show the slides in one language.

What Weft itself shows ("Submit", "That was correct!") comes in the language of the player; names of blocks, variables and branches are not translated. The first language of `set_languages` is the default: the blocks' own fields are in it, the others are translations (`set_languages` with another first language turns them around).

## Live in the open app

When the Weft app (desktop) is running on the person's computer, you can **work on the module that is open there** - without a file, and the person sees every change at once:

1. `weft status` (MCP: `weft_status`): is the app running, what is open, and what may the AI do (the person sets that in the settings under "KI-Assistenten": nothing, look only, look and change).
2. Every command without a file works on the open module: `weft inspect`, `weft validate --layout`, `weft render`, `weft play`, `weft text export` - and `weft edit operations.json` changes it **live**. All the operations of one file are one step of the app's history: the person takes them back with Cmd+Z / Ctrl+Z.
3. No module open (the start page), or a module should go in: build it as a file first, then `weft open module.weft` (MCP: `weft_open`) - it appears in the app as a new module that is not saved yet. If the person has unsaved changes open, the app asks them first.
4. The person keeps working while you change: look again (`inspect`) before every step instead of changing from memory. What the person deleted between your look and your change is skipped and reported (`skipped`); nothing is forced.

On an iPad this does not work (the AI does not run there, and an app cannot drive another app).

## The typical traps

| Trap | How you notice |
|---|---|
| A text runs out of its box | `validate --layout`: `block-overflow` |
| `rgba` in `<font color>` | `html-color-invalid` |
| A font that is not in the list | `html-font-unknown` |
| An event has several triggers (Weiter chain and quiz) | `event-multiple-triggers` |
| `weft new` without `--empty` creates an empty first slide | `weft inspect` shows "Folie 1 (keine Blöcke)" |
| A block lies partly outside the slide | `block-off-slide` |
| A button jumps to a slide that does not exist | `button-target-missing` |
| A block of the slide lies over a block of the layout (language switch, Back/Next): the clicks go to the upper one | only in the player (clicking) - blocks of a slide always lie over those of the layout, so keep those areas free |

And always: after building, `validate --layout`, then `play` with the steps of a learner, then look at the pictures.
