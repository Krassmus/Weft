# The tutorial "Ein interaktives Video erstellen"

A short tutorial (10 slides) that shows how a video becomes an interactive one: the video block is first an element of a presentation, then it stops by itself
at a time mark, asks a question and goes on when it is answered; then the three steps that make it, the time marks in detail, the event graph and some ideas.
Its look is its own, on purpose different from "Mit Lernmodulen arbeiten" (`../tutorial-erstes-lernmodul`, cream grid paper and hand drawings): dark navy, no pattern at all,
Oswald and Lato, flat icons, amber as the accent. It is made the same way. Kept small on purpose (it is part of the installation): the video is 40 KB, the
pictures of the editor are crops of 12-32 KB, one for each language.

| File | What it does |
|---|---|
| `video/anim.html`, `video/render.mjs` | The video "Farben mischen" (7.6 s, 800 x 450, no sound, no words, a plain dark panel without a pattern): two blobs of paint meet and mix. Every frame is drawn by headless Chrome, `ffmpeg` makes the video (`node video/render.mjs assets/farben.mp4`). Nothing in it is written, so it needs no translation. |
| `drawings.py` | The pictures (SVG, into `assets/`): flat icons, the timeline, rings, arrows and the numbered marker, in the colours of the module. |
| `kit.py` | The helpers of the slides (text, pictures, callouts with rings and arrows, numbered markers) - adapted from `../tutorial-erstes-lernmodul/build.py` and `partb.py` (the look - colours, fonts - is at the top). |
| `build.py` | The slides (German) as operations of `weft edit` -> `ops.json`. `SHOTS=0` leaves out the pictures of the editor (what `capture.mjs` needs first). |
| `capture.mjs` | Takes the pictures of the editor (`crops/<language>/*.jpg` and `rects.json`: where the things are that the rings point to) with headless Chrome against the dev server (`npm run dev`, port 1420), once for each interface language: the plus menu with the quiz, the dialog of the time marks (with the mark, and "Makes appear"), the panel of "Start of the video", the event graph. The pictures are kept small on purpose (JPEG 70, 1.2x): about 70 KB for all five of a language. |
| `assemble.py`, `tr/` | The translations. `tr/segments.json`: every distinct German text of the module (the number is its line); `tr/<language>.txt`: `number|translation` for the seven other languages. `assemble.py` fills the exported texts with them (and checks that none is missing). A new or changed German text needs a line in all seven files - and its entry in `segments.json`. The words of the interface in the texts (the names of buttons, the "time mark" of each language) are those of the app's own strings (`src/core/i18n`). |
| `variants.py` | A copy of the module for each language with that language as its default one and the names of the two blocks that are to be seen in the pictures (the question, the video) translated: what `capture.mjs` opens (Weft does not translate names; the finished tutorial keeps the German ones). |
| `cover.py`, `video/cover.mjs` | The cover picture (`logo.png` in the archive, what the tile on the start screen shows): the picture of the video with a time mark on its bar - nothing written on it. |
| `build.sh` | `sh build.sh shots` (the pictures of the editor in all languages), then `sh build.sh` -> `tutorial.i18n.weft`: the file for `src/start-content/tutorials/interaktives-video.weft`. |
| `run.sh` | A quick build of the German module (`./run.sh` -> `iv.weft`), without the translations. |

After a change: `sh build.sh shots` (only if something the pictures show has changed), `sh build.sh`, then `weft validate tutorial.i18n.weft --layout` must show 0 warnings in ALL languages (translations are longer than the German: boxes, headings and the labels of the rings), look at renders of the longest languages (`weft render ... --lang fr_FR --page 5`), then copy the file to `src/start-content/tutorials/interaktives-video.weft`.
