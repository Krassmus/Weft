# The tutorial "Gemeinsam an einem Weft-Dokument arbeiten"

A tutorial (14 slides) about working together on a Weft module: first a way out for people who prefer to work alone (a button that jumps to the last slide), then three ways -
the invitation link ("An Datei zusammen arbeiten": the link, how others join), the file with the link in it (the same switch, saved), the shared folder (Nextcloud, Sciebo,
Dropbox, Syncthing: how it is set up, what is in the folder, how the others join) - and, between the second and the third, what a TURN server is for and where it is entered.
What it says is what the app does: `src/core/collab/` (session.ts, webrtcAdapter.ts, folder/folderSync.ts), the card "Kollaboration" in `SettingsTab.tsx`, the network group of
`SettingsWindow.tsx`, the privacy page. Its look is its own, on purpose different from the other two: near-black with thin glowing lines - a digital world in the manner of
Tron: a floor of lines on the title slide, a network of people, icons made of one line, cyan for the world and orange for what matters. Unbounded for the headings, Ubuntu
for the rest (`Orbitron` and `Exo 2` would be nearer to Tron, but the one lacks the letters of Turkish and Polish, and the other does not load in `weft render`).

| File | What it does |
|---|---|
| `drawings.py` | The pictures (SVG, into `assets/`): the two backgrounds (a faint grid and corner brackets; the floor of lines), the network of the title slide and the cover, the icons, the diagrams of the TURN server and of the cloud folder, the picture of the folder, rings, arrows, the numbered marker. No words in them - except the file names in the picture of the folder, which are no language. |
| `kit.py` | The helpers of the slides (text, pictures, cards with a glowing border, steps, pictures of the editor with rings, arrows and labels) - adapted from `../tutorial-interaktive-videos/kit.py` (the look - colours, fonts - is at the top). |
| `build.py` | The slides (German) as operations of `weft edit` -> `ops.json`. `SHOTS=0` leaves out the pictures of the editor, `DE_ONLY=1` makes a draft in German alone (`./run.sh` -> `zu.weft`). |
| `capture.mjs` | Takes the pictures of the editor (`crops/<language>/*.jpg` and `rects.json`) with headless Chrome against the dev server (`npm run dev`, port 1420), once for each interface language: the card with the switch and the link, the dialog "Einladung beitreten", the network group of the settings, the folder sync before and after. Nothing leaves the computer: the public relays (`wss://`) are blocked, and the shared folder of the desktop app (not there in a browser) is a folder in memory (the app's own `MemorySyncFs`) with the files of two other people in it. Paragraphs that wrap differently in each language get a minimum height, so that every language's picture has the same size and the same things in the same places (it says when a language needs more). |
| `ui.py` | The words of the app's interface in all eight languages, read from `src/core/i18n` (`python3 -I ui.py`): what the translations quote ("An Datei zusammen arbeiten", "Einladung beitreten…", "Ordner wählen und abgleichen …") has to be exactly that. |
| `segments.py`, `assemble.py`, `tr/` | The translations. `tr/segments.json`: every distinct German text of the module (the number is its line); `tr/<language>.txt`: `number|translation` for the seven other languages. `segments.py texts-tutorial.json` adds new German texts at the end and says what is missing; `assemble.py` fills the exported texts (and checks that none is missing). |
| `cover.py`, `cover.mjs` | The cover picture (`logo.png` in the archive, what the tile on the start screen shows): the floor and the network - nothing written on it. |
| `build.sh` | `sh build.sh shots` (the pictures of the editor in all languages, once), then `sh build.sh` -> `tutorial.i18n.weft`: the file for `src/start-content/tutorials/zusammenarbeit.weft`. |

After a change: `sh build.sh shots` (only if something the pictures show has changed - and check `shots.log` for "MORE LINES THAN ROOM"), `sh build.sh`, then
`weft validate tutorial.i18n.weft --layout` must show 0 warnings in ALL languages (translations are longer than the German: headings must stay in one line, so keep them
under about 30 letters), look at renders of the longest languages (`weft render ... --lang fr_FR --page 5`), then copy the file to `src/start-content/tutorials/`.
