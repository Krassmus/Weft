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
| `capture.mjs` | Takes the pictures of the editor (`crops/<language>/*.jpg` and `rects.json`: where the things are that the rings point to) with headless Chrome against the dev server (`npm run dev`, port 1420): the dialog of the time marks, the panel of "Start des Videos", the event graph. |
| `run.sh` | A quick build of the German module: `./run.sh` -> `iv.weft`. |

The order: `SHOTS=0 ./run.sh`, then `node capture.mjs "$PWD/iv.weft" crops/de de`, then `./run.sh`. (Translations and the pictures in the other languages are
put in the way `../tutorial-erstes-lernmodul` does it.)
