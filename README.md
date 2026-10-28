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
  Editor in `features/editor/blocks/blockViews.tsx`. Fünf davon (alle außer der Galerie) werden sogar von **einer** Funktion gezeichnet
  (`blocks/<Art>/render.js`, reines JavaScript ohne Imports): der
  Player bettet sie unverändert ein, der Editor ruft sie für Canvas, Miniaturen und PDF auf (`RenderHost.tsx`). Ein
  *Modus* sagt, wo gezeichnet wird, und der Block entscheidet selbst, was er dort zeigt: `play` (bedienbar), `edit`
  (Canvas: ein Bild, nichts darin ist bedienbar), `thumbnail`, `print` (PDF). Das Lösungswort ist außerhalb von `play`
  das leere Feld; die eingebettete Seite ist live im Player und im Canvas, ein grauer Kasten mit Icon in der Miniatur
  und eine Karte mit Adresse und QR-Code im PDF; der Link ist nur im Player ein Link, sonst ein Bild davon (im PDF
  mit der Adresse als Link); der Sprachumschalter ist ein echtes Auswahlfeld im Player und im Canvas und ein grauer
  Kasten in Miniatur und PDF; der Fortschrittsbalken bekommt seinen Wert vom Ort (im Player von der Variable, mit
  Animation). Das gemeinsame Aussehen steht in `core/runtime/quizCard.css` und `blocks/*/render.css`,
  die Player und Editor beide laden. Bisher beschreiben sich das Lösungswort, die Galerie, die eingebettete Seite, der Link, der Fortschrittsbalken und der
  Sprachumschalter so (`blocks/solution/`, `blocks/gallery/`, `blocks/iframe/`, `blocks/link/`, `blocks/progress/`,
  `blocks/language/`; Feldtypen: Text, Ja/Nein, Zahl, Variablen-Effekte, Datei, Liste von
  Elementen mit Datei und Text); die anderen Arten sind noch von Hand an diesen Stellen eingetragen. Der Deskriptor
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
