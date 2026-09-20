# Weft

Weft ist eine Open-Source-App, die eine Folienpräsentation (wie Keynote/PowerPoint) mit
einem Authoring-Tool für interaktive HTML-Lernmodule (wie Adobe Captivate/Lectora)
verbindet. Wird eine Folie nicht mit interaktiven Aufgaben versehen, bleibt Weft ein
reines Präsentationstool.

## Architektur

- **Tauri 2 + React + TypeScript.** Die eigentliche Editor-Oberfläche ist eine Web-App;
  Tauri packt sie für Desktop (macOS/Windows/Linux) *und* für iOS/iPadOS/Android in
  native Shells, ohne den Code zu duplizieren.
- **Speicherformat = Exportformat.** Ein Lernmodul ist immer ein ZIP-Archiv mit
  `weft.json` (das komplette Dokument inkl. Undo-Historie) und `index.html` (ein
  eigenständiger, abhängigkeitsfreier Player). "Speichern" und "Als HTML-Modul
  exportieren" rufen denselben Pack-Code auf (`src/core/io/pack.ts`) – nur die
  Dateiendung unterscheidet sich (`.weft` bzw. `.zip`).
- **Sandboxed iframe, konsequent.** Die editorinterne Vorschau rendert nicht etwa eine
  zweite, separate React-Implementierung, sondern exakt dasselbe generierte
  `index.html` in einem `sandbox="allow-scripts"`-iframe (`PreviewFrame.tsx`) – WYSIWYG,
  weil Editor-Vorschau und exportiertes Modul denselben Code durchlaufen. Genau dieses
  `index.html` ist es auch, das später in ein LMS eingebettet wird.
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
