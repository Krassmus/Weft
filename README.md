# Weft

Weft ist eine Open-Source-App, die eine Folienpräsentation (wie Keynote/PowerPoint) mit
einem Authoring-Tool für interaktive HTML-Lernmodule (wie Adobe Captivate/Lectora)
verbindet. Wird eine Folie nicht mit interaktiven Aufgaben versehen, bleibt Weft ein
reines Präsentationstool.

## Working with AI (command line and MCP)

An AI assistant can read, build, check, translate, draw and play through learning modules with the command line tool `weft` or the MCP
server `weft-mcp`. The desktop app ships both with a Node of its own (Settings → KI-Assistenten → install); from the repository they need Node 22. Chrome is needed for pictures of slides:

```bash
npm install && npm run build:cli
node cli/dist/weft.mjs guide      # the guide to building a module that looks good - start here
node cli/dist/weft.mjs help       # every command
```

With the Weft desktop app open, the tool can work on the module that is open there, live (`weft status`, then `weft edit operations.json` without a file; the person sees every change at once and can undo it).

Guides: [docs/ai-authoring.en.md](docs/ai-authoring.en.md), [docs/operations.en.md](docs/operations.en.md), [docs/cli.en.md](docs/cli.en.md),
[docs/mcp.md](docs/mcp.md) (MCP, German); short version for agents: [AGENTS.md](AGENTS.md), [llms.txt](llms.txt). Auf Deutsch:
[docs/ai-authoring.md](docs/ai-authoring.md), [docs/cli.md](docs/cli.md). Die Desktop-App (Mac, Windows, Linux) bringt das Werkzeug mit eigenem Node mit
(Einstellungen → KI-Assistenten); auf iPad und iPhone und in der Store-Fassung gibt es es nicht.

## Architektur

- **Tauri 2 + React + TypeScript.** Die eigentliche Editor-Oberfläche ist eine Web-App;
  Tauri packt sie für Desktop (macOS/Windows/Linux) *und* für iOS/iPadOS/Android in
  native Shells, ohne den Code zu duplizieren.
- **Speicherformat = Exportformat.** Ein Lernmodul ist immer ein ZIP-Archiv mit
  `weft.json` (das komplette Dokument inkl. Undo-Historie), `index.html` (ein
  eigenständiger, abhängigkeitsfreier Player) und `logo.png` (das Titelbild des Moduls;
  ohne hochgeladenes Bild ein Bild der ersten Folie, wenn alles Automatische gelaufen ist
  und noch nichts geklickt wurde). "Speichern" und "Als HTML-Modul
  exportieren" rufen denselben Pack-Code auf (`src/core/io/pack.ts`) – nur die
  Dateiendung unterscheidet sich (`.weft` bzw. `.zip`).
- **Sandboxed iframe, konsequent.** Die editorinterne Vorschau rendert nicht etwa eine
  zweite, separate React-Implementierung, sondern exakt dasselbe generierte
  `index.html` in einem `sandbox="allow-scripts"`-iframe (`PreviewFrame.tsx`) – WYSIWYG,
  weil Editor-Vorschau und exportiertes Modul denselben Code durchlaufen. Genau dieses
  `index.html` ist es auch, das später in ein LMS eingebettet wird.
- **Block-Registry (`src/core/blocks/`).** Eine Art von Block beschreibt sich selbst in einem
  *Deskriptor* (`BlockDescriptor`): Felder (mit Übersetzbarkeit, Texten für den Export), Platzierung und
  Standardgröße, Ereignisse eines Quiz (`task`), Panel, Zusammenfassung und Prüfungen der CLI. Die Stellen,
  die alle Blöcke gleich behandeln (Menü, Standardwerte, Übersetzungen, Event-Graph, Textexport,
  `weft validate` / `inspect` / `schema`, das Panel in der Seitenleiste), fragen die Registry
  (`registry.ts`) statt eines eigenen `switch (block.kind)`. Der React-Teil (Icon, Ansicht) steht im
  Editor in `features/editor/blocks/blockViews.tsx`. Achtzehn davon werden sogar von **einer** Funktion gezeichnet (die anderen - Galerie, Bild, Video, Audio, Dateien-Kasten, Logikblock und Platzhalter - haben nur den Deskriptor, siehe unten)
  (`blocks/<Art>/render.js`, reines JavaScript ohne Imports): der
  Player bettet sie unverändert ein, der Editor ruft sie für Canvas, Miniaturen und PDF auf (`RenderHost.tsx`). Ein
  *Modus* sagt, wo gezeichnet wird, und der Block entscheidet selbst, was er dort zeigt: `play` (bedienbar), `edit`
  (Canvas: ein Bild, nichts darin ist bedienbar), `thumbnail`, `print` (PDF). Das Lösungswort und der Checker sind außerhalb von `play`
  das leere Feld (beim Checker schreibt man die Worte auf dem Canvas an Ort und Stelle, beim Button die Beschriftung, beim Text die Worte mit dem Rich-Text des Editors, bei der Liste ihre Punkte (Enter teilt, Rücktaste verbindet, Pfeiltasten wechseln den Punkt), beim Lückentext der Text mit den Lücken als `[[Antwort]]`, beim Quiz die Frage und die Antworten (die richtigen sind dort markiert): das sind die eigenen Ansichten des Editors, `ownCanvas`); die eingebettete Seite ist live im Player und im Canvas, ein grauer Kasten mit Icon in der Miniatur
  und eine Karte mit Adresse und QR-Code im PDF; der Link ist nur im Player ein Link, sonst ein Bild davon (im PDF
  mit der Adresse als Link); der Sprachumschalter ist ein echtes Auswahlfeld im Player, ein Bild davon im Canvas (ein
  natives Auswahlfeld skaliert nicht mit der Folie und ist beim Zoomen langsam) und ein grauer Kasten in Miniatur und PDF; der Fortschrittsbalken bekommt seinen Wert vom Ort (im Player von der Variable, mit
  Animation); der Text ist das positionierte Element selbst (Kasten, Weichzeichner und Scrollen gehören ihm: ein Weichzeichner hinter einem Kind eines eingeblendeten Elements sähe die Folie nicht), scrollt nur im Player und kürzt sonst ab; die Liste gibt dem Player die Zeile jedes Punktes zurück (`rows`), an der er den Aufbau Punkt für Punkt hängt (die Ereignisse stehen im Graph der Folie); der Lückentext ist außerhalb von `play` ein Bild der leeren Felder und des Buttons und beurteilt Antworten mit derselben Funktion, die der Editor benutzt (`core/document/cloze.ts` bezieht sie von dort) - was nach dem Abschicken passiert (Variablen, Punkte, Pflichtaufgabe, Ereignisse) ist Sache des Players, beim Quiz ebenso; seine Miniatur zeigt die richtigen Antworten angekreuzt, das PDF keine; das Info-Symbol (Revealer) ist im Canvas dieselbe Funktion wie im Player, mit dem Fenster offen, solange der Block ausgewählt ist - und setzt sein Fenster selbst (rechts vom Icon, am Folienrand links, unten hochgeschoben); beim Sortierrätsel zeichnet und bedient dieselbe Funktion Player, Miniatur und PDF (Mischen, Aufnehmen, Ziehen mit Geisterbild, Pfeiltasten, Escape, Beurteilung durch die Mindestzahl an Zügen `sortMistakes`; die Verteilung auf Linien `sortLayout` und die Ablagestelle `sortDropIndex` stehen ebenfalls dort, `core/document/sortLayout.ts` reicht sie nur weiter; Rahmen und Häkchen teilt es sich mit dem Matching; der Canvas bleibt die eigene Ansicht des Editors); Form und Pfeil zeichnet in Player, Canvas, Miniaturen und PDF dieselbe Funktion (`blocks/shape/render.js`, `blocks/arrow/render.js`; in der des Pfeils liegt auch die Kurve, auf der die Griffe des Editors sitzen): als Bild in einem Host, der nicht abschneidet (`RenderHost` mit `is-overflowing`: Schatten und Pfeilspitzen ragen über den Block hinaus), für das PDF mit dem Schatten als SVG-Filter und Rand ringsum (`pxPerCqw`, `bleedCqw`); das Weichzeichnen dessen, was hinter einer Form liegt (`blurBehind`), bleibt CSS des Blocks im Player und eine Glasscheibe darunter im Editor (`backdropBlur.ts`); Code und Formel zeichnet ebenfalls je eine Funktion (`blocks/code/render.js`, `blocks/tex/render.js`) aus dem HTML, das beim Bauen der Seite einmal entsteht (highlight.js, KaTeX: der Player führt beide nie aus, der Editor ruft dieselben Funktionen auf); der Code wird im Canvas direkt in den Block getippt (`CodeView`, eine Textarea über der gefärbten Kopie), Miniaturen und PDF zeichnen die Funktion; die Formel zeichnet sie auch im Canvas (bearbeitet wird sie im Dialog) und passt sie ihrem Kasten an (`fitTo`: sofort, wo der Kasten schon steht, sonst beim ersten Beobachter-Aufruf, und bei jeder Größenänderung - auch wenn KaTeX' Schriften später kommen); das Matching ist in Player, Miniatur und PDF dieselbe Funktion, auch für das, was die Lernenden damit tun (aufnehmen, ziehen, ablegen, Tastatur) und für die Beurteilung - nur der Canvas bleibt die eigene Ansicht des Editors (Karten verschieben, Worte und Bilder ändern; er zeichnet mit denselben Klassen und derselben CSS). Das gemeinsame Aussehen steht in `core/runtime/quizCard.css` und `blocks/*/render.css`,
  die Player und Editor beide laden. Bisher beschreiben sich das Lösungswort, der Checker, der Button, der Text, die Liste, der Lückentext, das Quiz, das Info-Symbol, das Matching, das Sortierrätsel, die Galerie, das Bild, das Video, die Audiodatei, der Dateien-Kasten, die Form, der Pfeil, der Code, die Formel, der Logikblock, der Platzhalter, die eingebettete Seite, der Link, der
  Fortschrittsbalken und der Sprachumschalter so (`blocks/solution/`, `blocks/checker/`, `blocks/button/`, `blocks/text/`,
  `blocks/list/`, `blocks/cloze/`, `blocks/quiz/`, `blocks/revealer/`, `blocks/matching/`, `blocks/sort/`, `blocks/gallery/`, `blocks/image/`, `blocks/video/`, `blocks/audio/`, `blocks/files/`, `blocks/shape/`, `blocks/arrow/`, `blocks/code/`, `blocks/tex/`, `blocks/script/`, `blocks/placeholder/`, `blocks/iframe/`, `blocks/link/`, `blocks/progress/`, `blocks/language/`; Feldtypen: Text - auch mit einer formatierten Variante (HTML) wie die Beschriftung des Buttons -, reines HTML (der Text-Block, die Punkte der Liste, der Lückentext), Ja/Nein, Zahl (ganz oder mit Nachkommastellen), Auswahl aus einigen Wörtern,
  Variablen-Effekte (auch je Wort: `answerEffects` des Lückentexts; und je Element einer Liste: die Antworten des Quiz), Ids von Elementen (`correctOptionIds`), Paare von Ids (`pairs` des Matchings), Datei, Liste von Elementen mit Datei und Text). Alle Arten haben einen Deskriptor; nur ein Teil wird auch von einer gemeinsamen Funktion gezeichnet. Bild, Video, Audio, Dateien-Kasten, Logikblock und Platzhalter haben nur den Deskriptor, keine Zeichenfunktion (bei Form, Pfeil, Code und Formel ist es der Deskriptor und die Funktion): Maske und Effekt des Bildes, die Zeitmarken von Video und Audio (`stopPoints`, im Zeitmarken-Dialog gesetzt und im Graphen der Folie als Ereignisse), die Dateiliste mit Passwortschutz, Füllung, Linie und Schatten der Form und die Stützpunkte des Pfeils sind keine Felder (das Ereignis des Logikblocks baut der Graph aus der Art, `scriptRunNodeId`). Der Deskriptor nennt Datei, Beschreibung, Schalter und Texte, sagt, was `weft inspect` zeigt und was `weft validate` prüft (`blocks/media.ts` teilt sich die Prüfung der Datei), und lässt Standardwerte, genutzte Dateien, Zwischenablage und Platzhalter in Texten von der Registry beantworten. Der Platzhalter ist die einzige Art mit `placement.layoutOnly`: es gibt ihn nur in Layouts (`isLayoutOnlyKind`), wie es Arten gibt, die nur auf Folien stehen (`pageOnly`). Der Deskriptor
  ist so geschnitten (nur Daten und reine Funktionen auf dem JSON des Blocks), dass er das Manifest
  eines Plugin-Blocks werden kann.
- **Undo/Redo über immer-Patches**, gespeichert *im Dokument selbst*
  (`content.undoHistory` + `content.undoIndex` in `weft.json`), getrennt vom eigentlichen
  Modulinhalt, damit die Undo-Buchführung nicht rekursiv ihre eigenen Änderungen
  mitschneidet.

## Datenmodell (`src/core/types.ts`)

- `WeftModule` enthält `variables` (globale Variablen), `layouts`, `pages`,
  `logicBlocks` und eine flache `sequence` aus Folien und Logikblöcken.
- Eine **Folie** (`Page`) referenziert optional ein **Layout** – ein Layout ist selbst
  wie eine Folie aufgebaut, darf aber laut Typ (`StaticBlock`, ohne `QuizBlock`) keine
  interaktiven Blöcke enthalten.
- Ein **Logikblock** (`LogicBlock`) verzweigt in `n` `Branch`es. Ein `Branch` referenziert
  ausschließlich `pageIds` (`UUID[]`) – nie weitere Logikblöcke. Diese Typ-Einschränkung
  ist bewusst: sie erzwingt strukturell, dass Verzweigungen nicht ineinander
  verschachtelt werden können. Nach dem letzten Branch-Element geht es immer mit dem
  nächsten Element der Hauptfolge weiter.
- **Quiz-/Interaktions-Blöcke** können über `VariableEffect`s globale Variablen ändern
  (meist `add`), referenziert über die Variablen-ID aus den Moduleinstellungen.
- Jedes Modul hat eine global eindeutige `id` (`crypto.randomUUID()`), einmal beim
  Erstellen gesetzt.

## LMS-Anbindung (Stud.IP, optional)

`src/core/lms/protocol.ts` definiert das postMessage-Protokoll zwischen dem
eingebetteten Modul (`weft-module`) und dem umgebenden LMS (`weft-lms-host`). Die
Laufzeit-Implementierung dazu lebt – weil sie ohne Bundler in die exportierte
`index.html` eingebettet wird – handgeschrieben in
`src/core/runtime/player.runtime.js` und muss bei Protokolländerungen von Hand
synchron gehalten werden. Die Schnittstelle ist standardmäßig deaktiviert
(`lms.enabled = false`) und wird pro Modul in den Moduleinstellungen aktiviert.

## Entwicklung starten

```bash
npm install
npm run tauri dev
```

`npm test` führt die Tests aus (`tests/`): Jede Blockart mit Deskriptor läuft durch alle Stellen, die Blöcke
gleich behandeln, und jede gemeinsame Darstellung (`render.js`) in allen vier Modi.

Für die Web-Vorschau ohne Tauri-Shell reicht `npm run dev` – Speichern/Öffnen fallen
dann automatisch auf Browser-Download bzw. einen Datei-Input zurück
(`src/core/io/fileIO.ts`).

### Mobile Targets hinzufügen

Noch nicht initialisiert – dafür wird ein Mac mit Xcode (iOS) bzw. Android
Studio/SDK (Android) benötigt:

```bash
npm run tauri ios init
npm run tauri android init
```

## Stand des Gerüsts / offene Baustellen

Dies ist ein Programmgerüst, kein fertiges Produkt. Funktionsfähig und "echt"
implementiert sind: Datenmodell, Undo/Redo, Sequenz-/Branch-Verwaltung, ZIP-Pack/Unpack,
der eigenständige Player-Runtime sowie Speichern/Öffnen/Exportieren über Tauris
Dialog-/Dateisystem-Plugins. Bewusst noch nicht gebaut:

- Drag-and-drop-Platzierung von Blöcken (Position/Größe werden aktuell als Prozentwerte
  über Zahlenfelder im Inspector gesetzt)
- Eine Asset-Verwaltung jenseits von "Bild pro Bild-Block hochladen"
- Mobile-Init (iOS/Android) wurde noch nicht ausgeführt
- Kollaboratives Bearbeiten (braucht einen zentralen Server, siehe Projektidee)
