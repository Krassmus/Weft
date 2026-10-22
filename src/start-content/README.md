# Content that comes with Weft

The start screen (`src/features/start/`) shows modules that ship with the app. They are ordinary `.weft` files in one of three
folders; each folder has a `manifest.json` that lists them. A manifest entry whose file is not in the folder yet is simply not shown -
so a file only has to be dropped in next to its entry.

| Folder       | Where it shows                                  | What happens on a click                              |
| ------------ | ----------------------------------------------- | ---------------------------------------------------- |
| `templates/` | "Mit Vorlage starten" (a dialog with all of them) | a new, unsaved module that is a copy of the file     |
| `examples/`  | "Beispiel erkunden" (the first entry is opened)  | a new, unsaved module that is a copy of the file     |
| `tutorials/` | "Weft kennenlernen" (a row of cards)             | played in the player only - nothing can be edited    |

Whichever way a module of these folders is opened, working on it never changes the file: it opens as a copy of its own (a new id, an
editing history of its own) that has no file yet, so the first "Speichern" asks where to put it. The files carry `"template": true` in
their `weft.json` (`weft edit` with `{"op": "set_template"}` sets it) - that is what makes Weft open one as a copy when it is opened
from anywhere else too (File > Open, a double click), not only from the start screen. The copy is not a template any more.

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
