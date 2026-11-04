# Content that comes with Weft

The start screen (`src/features/start/`) shows modules that ship with the app. They are ordinary `.weft` files in one of three
folders; each folder has a `manifest.json` that lists them. A manifest entry whose file is not in the folder yet is simply not shown -
so a file only has to be dropped in next to its entry.

| Folder       | Where it shows                                  | What happens on a click                              |
| ------------ | ----------------------------------------------- | ---------------------------------------------------- |
| `templates/` | "Mit Vorlage starten" (a dialog with all of them) | a new, unsaved module that is a copy of the file     |
| `examples/`  | "Beispiel erkunden" (one entry: it is opened; several: a dialog with all of them) | a new, unsaved module that is a copy of the file     |
| `tutorials/` | "Tutorials" (a row of cards, under "Meine Projekte") | played in the player only - nothing can be edited, in the language of Weft's interface |

Whichever way a module of these folders is opened, working on it never changes the file: it opens as a copy of its own (a new id, an
editing history of its own) that has no file yet, so the first "Speichern" asks where to put it. The files carry `"template": true` in
their `weft.json` (`weft edit` with `{"op": "set_template"}` sets it) - that is what makes Weft open one as a copy when it is opened
from anywhere else too (File > Open, a double click), not only from the start screen. The copy is not a template any more. A template that has its texts in several languages (the module's `languages`) opens in the language of the person who opens it: the language of Weft's interface becomes its default language - the blocks and the editor are in it - and the other languages stay as translations. The title comes from the manifest (`title` per language), since a module's title has no translations of its own. A template that lacks that language opens as it is.

A tutorial is not played from the page the file was saved with: Weft makes the page from the module itself (`weft.json`, see `src/core/io/playModule.ts`) and starts it in the
language of Weft's interface - the one of the module's `languages` that matches it, otherwise English, otherwise the player decides (as for a learner). So a
tutorial can be one module with its texts in several languages (as `willkommen.weft`), and a file that the `weft` command line wrote works as well (it has no page of its
own). Only a custom font of a tutorial is not shown (the fonts are read from the editor's own store).

`tutorials/erstes-lernmodul.weft` and `templates/lernpyramide.weft` are made by `scripts/tutorial-erstes-lernmodul/` (see its README): they have their texts in all eight languages of Weft's
interface, so the tutorial plays - and the template opens - in the language of the app, and the tile on the start screen shows the first slide in it too.
`tutorials/interaktives-video.weft` is made by `scripts/tutorial-interaktive-videos/` (see its README) - also in all eight languages, kept small on purpose (0.7 MB: the video is 40 KB); its tile shows a cover picture of its own (`logo.png` in the file).
`tutorials/zusammenarbeit.weft` is made by `scripts/tutorial-zusammenarbeit/` (see its README) - all eight languages as well, 0.7 MB, a look of its own (near-black, glowing lines in the manner of Tron); the pictures of the editor in it are real ones of the app, one set for every interface language, and its cover picture is `logo.png` in the file.

## manifest.json

A list of entries:

```json
[
  {
    "file": "grundlagen.weft",
    "title": { "de": "Die erste Präsentation", "en": "Your first presentation" },
    "description": { "de": "…", "en": "…" },
    "tag": { "de": "Grundlagen", "en": "Basics" },
    "minutes": 6
  }
]
```

- `file`: the file name in the same folder.
- `title`, `description`, `tag`: a text, or `{ "de": …, "en": … }` for both languages of the interface (the other language is used when
  one is missing). `description` and `tag` are optional; `tag` is the label on the picture (tutorials only), `minutes` the
  duration shown on a tutorial card.
- The picture of a card is the top of the module's first slide - made by Weft from the file, nothing to prepare.

## Making the files

Save a module as usual ("Speichern"), or export it as a player file ("Player-Datei exportieren…") - both work for all three folders;
a tutorial is only ever played, whichever way it was saved. The files are part of the app, so keep them small (large videos make the
app large).
