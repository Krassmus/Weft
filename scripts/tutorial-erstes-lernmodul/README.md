# The tutorial "Dein erstes Lernmodul" and the template "Lernpyramide"

`src/start-content/tutorials/erstes-lernmodul.weft` and `src/start-content/templates/lernpyramide.weft` are made by the scripts in this folder, with the
`weft` command line tool - nothing in them was drawn by hand in the editor. This is how to make them again (after changing a text, a position, a picture).

| File | What it does |
| --- | --- |
| `build.py` | Part A (the learning pyramide: slides 1-11) and the layouts, as a list of operations for `weft edit`. `TEMPLATE=1`: only slides 1-10, marked as a template, with English names of blocks. |
| `partb.py` | Part B (how it is built, slides 12-29): pictures of the real editor with hand-drawn rings, arrows and labels; the knowledge check. |
| `doodles.py` | The hand-drawn pictures (SVG): icons, the seven levels of the pyramid, paper, rings, arrows. |
| `tr/*.txt`, `tr/segments.json` | The texts in seven languages, one line per distinct German text piece (`id\|text`, the id is the line in `segments.json`). |
| `assemble.py` | Puts the translations into the export of `weft text export` (checks that none is missing and that `[[gaps]]` are kept). |
| `capture.mjs`, `cdp.mjs` | Take the pictures of the editor (`crops/*.jpg`): a headless Chrome opens the module in the editor of the dev server (`npm run dev`, port 1420). |
| `build.sh` | The whole way: build, export the texts, fill in the translations, import them -> `lernpyramide.i18n.weft` or (`sh build.sh template`) `vorlage.i18n.weft`. |

```bash
npm run build:cli && npm run dev        # the tool, and the editor the pictures are taken in
cd scripts/tutorial-erstes-lernmodul
sh build.sh                             # the pictures in crops/ are needed (they are also in the finished file: unzip its assets/)
node capture.mjs lernpyramide.i18n.weft crops   # new pictures of the editor, then build again
```

A change of a German text: change it in `build.py` / `partb.py`, then the new piece in `tr/segments.json` and its line in every `tr/<language>.txt`
(`build.sh` says which one is missing). The pictures of the editor show the German interface in every language: a block cannot have another picture
per language.
