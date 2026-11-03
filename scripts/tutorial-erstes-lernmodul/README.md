# The tutorial "Mit Lernmodulen arbeiten" (until November 2026: "Dein erstes Lernmodul") and the template "Lernpyramide"

`src/start-content/tutorials/erstes-lernmodul.weft` and `src/start-content/templates/lernpyramide.weft` are made by the scripts in this folder, with the
`weft` command line tool - nothing in them was drawn by hand in the editor. This is how to make them again (after changing a text, a position, a picture).

| File | What it does |
| --- | --- |
| `build.py` | Part A (the learning pyramide: slides 1-11) and the layouts, as a list of operations for `weft edit`. `TEMPLATE=1`: only slides 1-10, marked as a template, with English names of blocks. |
| `partb.py` | Part B (how it is built, slides 12-29): pictures of the real editor with hand-drawn rings, arrows and labels; the knowledge check. |
| `doodles.py` | The hand-drawn pictures (SVG): icons, the seven levels of the pyramid, paper, rings, arrows. |
| `tr/*.txt`, `tr/segments.json` | The texts in seven languages, one line per distinct German text piece (`id\|text`, the id is the line in `segments.json`). |
| `assemble.py` | Puts the translations into the export of `weft text export` (checks that none is missing and that `[[gaps]]` are kept). |
| `cover.py` | The cover picture of the tutorial (`logo.png` in the archive, what its tile shows): the slide with the pyramid, cut down to paper, pyramid and percentages - no text, a picture does not change its language. Run by `build.sh` at the end. |
| `capture.mjs`, `cdp.mjs`, `variants.py` | Take the pictures of the editor (`crops/<language>/*.jpg`, with `rects.json`: where the things are that the callouts point to): a headless Chrome opens a copy of the module that has that language as its default one (`variants.py`: the slides and the names of blocks in it, too) in the editor of the dev server (`npm run dev`, port 1420), set to that interface language. The pictures of the panel on the right are cut where an element of it is, not at a fixed place - what is in the panel moves with the length of the words. |
| `build.sh` | The whole way: build, export the texts, fill in the translations, import them -> `lernpyramide.i18n.weft` or (`sh build.sh template`) `vorlage.i18n.weft`. |

```bash
npm run build:cli && npm run dev        # the tool, and the editor the pictures are taken in
cd scripts/tutorial-erstes-lernmodul
sh build.sh shots                       # new pictures of the editor, in all eight interface languages -> crops/<de|en|es|fr|pt|it|tr|pl>/
sh build.sh                             # the tutorial (the pictures in crops/ are needed); `sh build.sh template` the template
```

A change of a German text: change it in `build.py` / `partb.py`, then the new piece in `tr/segments.json` and its line in every `tr/<language>.txt`
(`build.sh` says which one is missing). Every picture of the editor is an image block with a picture for each language (`set_media` with `language`): a learner sees the
editor in their own language - the slides of the editor too. The callouts (rings, arrows) are the same for all languages: they sit on `rects.json`
of the German pictures, and the other languages' pictures are cut so that those things are in the same place (they differ by a pixel at most).
