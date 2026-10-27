# Ein Lernmodul bauen (für KI und Skripte)

Diese Seite ist die kurze Anleitung, wie man mit `weft` (Kommandozeile oder [MCP-Server](mcp.md)) ein Lernmodul baut, das gut aussieht und funktioniert. Sie sammelt, was man sonst durch Ausprobieren herausfindet. Die Befehle stehen in [cli.md](cli.md), die Operationen von `weft edit` in [operations.md](operations.md) (`weft guide ops`, MCP: `weft_operations`). Englische Fassung dieser Seite: [ai-authoring.en.md](ai-authoring.en.md); `weft guide` gibt sie im Programm aus. Ein fertiges Beispiel: [`src/start-content/examples/durch-drei-teilbar.weft`](../src/start-content/examples/durch-drei-teilbar.weft).

## Der Ablauf

1. **Anlegen:** `weft new modul.weft --empty` (kein Layout, keine Folie; sonst gibt es ein Layout „Standard" mit Titel-Platzhalter und eine leere Folie).
2. **Bauen:** `weft edit modul.weft operationen.json -o modul.weft`. Alles oder nichts; die Antwort nennt die Ids. Mit `"as": "name"` vergibt man einen Namen, den spätere Operationen als `"$name"` benutzen.
3. **Prüfen:** `weft validate modul.weft --layout`. Ohne `--layout` liest es nur die Datei, mit `--layout` zeichnet es die Folien im Player und meldet, was nicht in seinen Kasten passt (`block-overflow`, mit der Höhe, die der Block mindestens braucht).
4. **Durchspielen:** `weft play modul.weft --page 4 --steps "tick 1 3; submit; weiter"`: nach jedem Schritt steht da, was neu zu sehen ist oder verschwand, welche Meldung ein Quiz gab und auf welcher Folie man ist; dazu ein Bild je Schritt. Hier zeigt sich, was `weft render` (eine Folie, ein Zustand) nicht zeigt.
5. **Ansehen:** `weft render modul.weft --all -o bilder/` (alles auf der Folie) oder `--state start` (so, wie sie beginnt).

Die Befehle 3 bis 5 brauchen Chrome, Chromium, Edge oder Brave (sonst `WEFT_CHROME`).

## Das Raster einer Folie

- Positionen und Größen sind **Prozent** der Folie (`x`, `y`, `width`, `height`; 0 bis 100). Bei 16:9 sind 1 % Breite 12,8 Pixel bei 1280 Pixel Folienbreite.
- **Schriftgrößen** sind in `cqw`: Prozent der Folienbreite. Standardtext 1,7 · Fließtext 2,2 bis 2,9 · Überschrift 3,5 bis 6 · Kleingedrucktes 1,6 bis 1,9.
- **Höhe eines Textes:** Eine Zeile braucht `Größe × Zeilenhöhe` cqw; 1 cqw sind bei 16:9 1,78 % der Folienhöhe (allgemein: `Seitenverhältnis` %). Eine Zeile mit 2,4 cqw und Zeilenhöhe 1,25 braucht also etwa 5,3 % plus ein wenig Luft. Ein Buchstabe ist etwa 0,5 em breit. `add_text` schätzt die Höhe selbst, wenn man keine angibt; `validate --layout` sagt genau, ob sie reicht.
- Unten links und rechts brauchen Buttons Platz (Zurück/Weiter bei y ≈ 85,6), darunter ein Fortschrittsbalken (y ≈ 94). Inhalt endet am besten bei y ≈ 83.

## Texte

`add_text` schreibt das HTML so, wie der Editor es schreibt:

```json
{"op": "add_text", "page": "$eins", "x": 7, "y": 22, "width": 60,
 "paragraphs": [[{"text": "Quersumme", "color": "#fbbf24", "bold": true}, " = alle Ziffern addieren."], "Beispiel: 4 + 8 + 2 + 7 = 21"],
 "size": 2.4, "color": "#f8fafc", "gap": 1, "box": {"fillOpacity": 0.1, "radius": 2, "padding": 2}, "effect": "fade"}
```

`text` (Zeilen = Absätze) oder `paragraphs` (Absätze aus Teilen mit eigener Farbe, Größe, Schrift) oder rohes `html`. Mit `box` bekommt der Text einen **Hintergrund mit Rand**: eine Karte in einem Block (Füllung, Rand, Rundung, Abstand; mit `"blur": true` scheint der Hintergrund unscharf durch, wie Milchglas). Das ist besser als eine Form unter einem Text: ein Aufbau, ein Objekt zum Kopieren.

Wenn man HTML selbst schreibt:

- Erlaubt und vom Editor gelesen: `<p style="…">`, `<b>`, `<i>`, `<u>`, `<br>`, `<font color="#rrggbb" face="Schrift">`, `<span style="font-size:2.4cqw">`.
- **`<font color>` nimmt nur `#rrggbb`.** Eine `rgba(…)`-Farbe dort wird still als eine andere Farbe gelesen. Durchscheinend geht mit `<span style="color:rgba(251,191,36,0.4)">`. `validate` meldet das als `html-color-invalid`.
- Absätze haben einen Abstand: `<p style="margin:0 0 1cqw 0;line-height:1.25">` macht die Höhe berechenbar.
- **Schriften** nur aus der Liste, mit genau diesem Namen in `face` (sonst `html-font-unknown` und Standardschrift): Open Sans (Standard), Roboto, Oswald, Merriweather, Playfair Display, Cinzel, Courier Prime, Metamorphous, Caveat, Amatic SC, Schoolbell, Lato, Quicksand, Cormorant Garamond, Dancing Script, Ubuntu, Black Ops One, Original Surfer, Bungee, Libre Baskerville, Share Tech, Lilita One, Mansalva, Ribeye, Abril Fatface, Barlow Condensed, Josefin Sans, Unbounded, Over the Rainbow, Sanchez, Orbitron, Exo 2, Montserrat Alternates, Racing Sans One, Shadows Into Light, Eagle Lake, Delicious Handrawn, Sassy Frass, Quattrocento, Indie Flower, Titan One, Luckiest Guy, Vast Shadow, Pirata One, Alice, Pixelify Sans, Averia Serif Libre, Sedgwick Ave Display, Barriecito, Oi, Alumni Sans Collegiate One, Matemasie, Nosifer, Rubik Broken Fax, Monofett, Rubik Dirt, Creepster, UnifrakturCook, Rubik Wet Paint, Frijole, Barrio, Butcherman, Geist Pixel, Faster One, Uncial Antiqua.
- Ein **Button** hat keine eigene Schrift: sie kommt vom Stil des Moduls (`set_look`). Nur sein Text ist frei.

## Formen und Aussehen

- `add_shape`: Rechteck, Ellipse, Vieleck, Stern, mit `color`/`opacity` oder `gradient` (`{"kind": "linear", "angle": 135, "stops": [["#0b1124", 0], ["#1c1a4d", 100]]}`), `radius`, `stroke`, `shadow`, `blur` (nur Rechteck und Ellipse: lässt den Hintergrund unscharf durchscheinen). Ein Hintergrund über die ganze Folie gehört in ein **Layout**, nicht auf jede Folie.
- `set` in `add_block`/`update_block` führt Objekte mit dem Vorhandenen zusammen: `{"position": {"y": 40}}` lässt `x`, `width` und `height`.
- `set_look {brightness, accentColor, interactiveStyle}`: hell/dunkel, die Akzentfarbe (Buttons, Quiz, Markierung) und der Stil von Buttons und Antworten (`plain`, `elegant`, `round`, `futuristic`). Das ist alles, was für die Standardelemente einzustellen ist.
- `set_palette {colors}` legt die Farben des Moduls in jede Farbwahl; `set_transition {page: "all", type, durationMs}` setzt den Folienübergang.
- **Links** sind ein eigenes Element, kein Teil eines Textes: `{"op": "add_link", "page": "$eins", "url": "example.org/lernen", "text": "Zur Lernseite"}` öffnet die Seite in einem neuen Tab. Das Aussehen (dunkelgrau, Ecken) kommt vom Stil der interaktiven Elemente (`set_look`) und ist nicht einzeln einstellbar; Dateien, die zum Modul gehören, kommen in den Dateien-Block.
- **Schlussfolie:** Hinter der letzten Folie zeigt der Player „Danke fürs Mitmachen!" und - nur wenn „Navigation durch Weiter erlauben" (`set_keyboard_navigation`) an ist - „Neu starten". Ändern Quizze oder Lückentexte (Effekte `onCorrect`, `onIncorrect`, `onEachCorrect`, Antwort-Effekte) eine **Zahlen-Variable**, folgt eine Tabelle: eine Zeile je Quiz/Lückentext (der `name` des Blocks, sonst der Anfang der Frage), Ergebnis (richtig/falsch/nicht beantwortet) und die gewonnenen Punkte, zuletzt die Summe. Bei mehreren Zahlen-Variablen gibt es je eine Spalte. Ändert etwas anderes die Variable - ein Logikblock (`vars.punkte += 7;`), ein Button-Effekt -, steht die Differenz als eigene Zeile „Weitere Änderungen" dazwischen (nur wenn es sie gibt), und die Summe ist der tatsächliche Wert der Variable, wie er an das LMS geht. Dafür ist nichts einzustellen. Wo diese Tabelle steht, bietet die Schlussfolie auch „Zertifikat herunterladen" an: ein PDF (DIN A4, bei langer Tabelle mit Seitenumbruch und wiederholter Kopfzeile) mit der Überschrift „Weft-Zertifikat", dem Namen des Lernmoduls (`title`), Datum und Uhrzeit (wann das Zertifikat erstellt wird, so geschrieben, wie die Sprache der Lernperson es tut) und derselben Tabelle, in der Sprache der Lernperson (Überschrift, Button und die Texte der Auswertung sind in allen Sprachen des Players übersetzt). Der Name des Moduls und die Aufgabentitel stehen so da, wie die Autorin sie geschrieben hat. Ohne Tabelle gibt es keinen Button.
- **Sortierrätsel** (`add_sort`): Texte oder Bilder (`items`, in der **richtigen** Reihenfolge angegeben), die die Lernperson per Drag & Drop in die richtige Reihenfolge bringt - sie sieht sie zufällig gemischt (nie in der richtigen Reihenfolge) auf einer dünnen Linie, `"orientation": "vertical"` (Standard) oder `"horizontal"` (eher für Bilder). `startLabel`/`endLabel` nennen die beiden Enden („älter" / „jünger"). Ein Fehler ist eine Verschiebung: die kleinste Zahl an Verschiebungen (ein Objekt nehmen und woanders hinlegen), die die Reihenfolge richtig macht. `onSubmit` ändert Variablen bei jedem Abschicken (hier steht die **maximale Punktzahl**: `Punkte +5`), `onEachError` für jeden Fehler (`Punkte -1`), `onCorrect`/`onIncorrect` für richtige/falsche Reihenfolge. Bilder (`{"file": "bild.png", "text": "Beschreibung"}`) lassen sich per Klick vergrößern. Reicht der Platz auf einer Linie nicht (mehr Objekte, als bei `itemSize` entlang der Linie hineinpassen), bricht sie von selbst auf mehrere Linien um (jede mit eigener Linie, wie Text gelesen); mit wenigen Objekten bleibt es bei einer. Ereignisse wie beim Quiz; `weft play`: `sortieren "Ei" "Raupe" …`.
- **Matching** (`add_matching`): zwei Listen von Karten (Texte oder Bilder); die Lernperson zieht die Objekte (`sources`) per Drag & Drop auf die Ziele (`targets`), schickt ab, und es wird gezeigt, was richtig war. `pairs` (`[[0, 1], [1, 0]]`: Objekt Nr. → Ziel Nr.) legt die richtigen Zuordnungen fest; ein Objekt ohne Paar ist ein Ablenker. `onEachCorrect`/`onEachWrong` ändern Variablen für jede richtig/falsch zugeordnete Karte (Minuspunkte sind möglich), `onCorrect`/`onIncorrect` für alles richtig/nicht. `shuffle` mischt die Plätze der Karten. Bilder: `{"file": "bild.png", "text": "Beschreibung"}`. Ereignisse wie beim Quiz.
- **Checker** (`add_checker`): ein Kästchen mit Text (etwa eine Einverständniserklärung) und „Abschicken". `onChecked`/`onUnchecked` ändern Variablen, je nachdem ob beim Abschicken der Haken gesetzt war; `required` macht es zur Pflichtangabe. Die Ereignisse sind die eines Quiz (`quiz-submit:<Id>`, mit Haken `…:richtig`, ohne `…:falsch`). Das Aussehen folgt dem Stil der interaktiven Elemente (`set_look`).
- **Listen** (`add_block` mit `kind: "list"`): `items` (`id`, `html`), `marker` (`dot`, `dash`, `number`, `image`), `markerColor` (`"#rrggbb"`: die Farbe des Punkts, Strichs oder der Zahl - ohne Angabe die des Textes; `null` nimmt sie zurück), `spacing`, `itemEntrance` (jeder Punkt erscheint einzeln auf Weiter).
- **Aufbau-/Abbau-Effekte** (`"effect": {...}` bei `add_text`, `add_shape` …, sonst `entranceEffect`/`exitEffect` in `set`): `{"type": "fade", "durationMs": 600, "motion": "up"}` - `motion` (nur Fade) lässt den Block mit einer kleinen Bewegung einblenden: `up`/`down` (er startet etwas darüber/darunter; beim Abbau geht er dorthin zurück) oder `scale` (er startet etwas kleiner). `{"type": "move", "moveDirection": "angle", "moveAngle": 45}` - `moveDirection` (nur Move) ist die Seite, von der der Block kommt (Aufbau) oder zu der er geht (Abbau): `right` (Standard), `left`, `up`, `down` oder `angle` mit `moveAngle` von 0 bis 360 (0 rechts, 90 unten, 180 links, 270 oben).
- Blöcke können einen **Namen** haben (`"name": "Überschrift"`): er steht im Ereignis-Graph, in der Elementliste und in `weft inspect` statt der Art.

## Aufbau Schritt für Schritt (Weiter)

Ein Block mit Aufbau-Effekt (`"effect": "fade"`) bekommt von selbst einen Auslöser „bei der nächsten Weiter-Eingabe", in der Reihenfolge, in der die Blöcke angelegt wurden. Das ist meist, was man will: Weiter, und der nächste Gedanke erscheint; nach dem letzten geht es zur nächsten Folie.

Anders gewünscht? Dann mit `set_trigger` festlegen, was auslöst (das **ersetzt**; `add_trigger` dagegen fügt hinzu, und der erste Auslöser, der eintritt, gilt – die Weiter-Kette bleibt dann also auch):

```json
{"op": "set_trigger", "page": "$eins", "to": "entrance:$regel", "from": "start", "weiter": true}
{"op": "set_trigger", "page": "$eins", "to": "entrance:$hinweis", "from": "entrance:$regel", "weiter": true}
{"op": "set_trigger", "page": "$eins", "to": "end", "from": "entrance:$hinweis", "weiter": true}
```

- `"weiter": true`: erst bei der nächsten Eingabe nach `from`. Ohne: nach `delayMs` (Standard 0), also gleichzeitig.
- Ereignisse: `start`, `end` (Nächste Folie), `entrance:<Block>`, `exit:<Block>`, `click:<Button>`, `quiz-fill:<Quiz>`, `quiz-submit:<Quiz>`, `quiz-correct:<Quiz>`, `quiz-incorrect:<Quiz>`, `video-start:<Video>`.
- Wenn eine Karte und ein Text zusammen erscheinen sollen: der Text mit `box` ist ein Block. Sonst Form und Text mit `set_trigger` ohne `weiter` aneinander hängen.
- `weft validate` meldet `event-multiple-triggers`, wenn ein Ereignis von mehreren ausgelöst wird (Warnung, wenn ein Weiter dabei ist), und `weft inspect --page` markiert diese Auslöser.

## Quiz und Lückentext

- Quiz: `questionHtml`, `options` (`id`, `html`), `correctOptionIds`. **`explanation`** ist ein Text, der nach dem Abschicken unter „richtig/falsch" steht – dafür braucht es keinen Umweg über Auslöser. Mehrere richtige Antworten sind möglich.
- Lückentext: die Antworten stehen als `[[Antwort]]` im Text, mehrere richtige mit `|` (`[[Shakespeare|Shakespear]]`). `caseSensitive` und `tolerance` (Tippfehler, 0 bis 2) steuern, was als richtig gilt. Leerzeichen zählen nie (1 714 ist 1714).
- **Pflichtangabe:** `"required": true` am Quiz oder Lückentext (Standard: aus). Solange sie nicht abgeschickt ist, hält der Player jedes Weiter zurück, das die Folie verlassen würde - Button, Leertaste, Pfeil, Tippen -; Aufbau-Schritte davor laufen weiter. Ein Button mit der Aktion `advance` („Weiter") ist solange ausgegraut, wenn sein nächster Druck die Folie verlassen würde. Ein Button mit `goto` oder ein automatischer Wechsel (zum Beispiel „nach dem Abschicken zur nächsten Folie") ist davon nicht betroffen.
- Beide brauchen Platz für ihre Rückmeldung unter dem Button: `validate --layout` misst sie mit.

## Verzweigungen

Wer ein Quiz falsch beantwortet, kann einen anderen Weg gehen als wer es richtig hatte. Dazu merkt sich das Quiz das Ergebnis in einer Variablen, und eine Verzweigung wählt danach den Zweig:

```json
{"op": "add_variable", "name": "quizCorrect", "type": "boolean", "initialValue": false}
{"op": "add_block", "page": "$quiz", "kind": "quiz", "set": {"…": "…", "onCorrect": [{"variableId": "quizCorrect", "op": "set", "value": true}], "onIncorrect": [{"variableId": "quizCorrect", "op": "set", "value": false}]}}
{"op": "add_logic", "layout": "$inhalt", "name": "Quiz richtig?", "as": "fork", "branches": [
  {"label": "Richtig", "condition": {"variable": "quizCorrect", "comparator": "eq", "value": true}},
  {"label": "Noch einmal genauer"}]}
{"op": "add_page", "layout": "$inhalt", "branch": {"logic": "$fork", "branch": "Richtig"}, "as": "weiter1"}
{"op": "remove_page", "page": "5.a.1"}
```

- Der letzte Zweig ist das „sonst" und hat keine Bedingung.
- **Jeder Zweig kommt mit einer leeren Folie.** Die eigenen Folien mit `add_page` und `branch` hinzufügen und die leere danach mit `remove_page` (Nummer wie `5.a.1`) wieder entfernen – die Nummern zählt `weft inspect`. Die gelöschte Folie bleibt als Hinweis `page-deleted` in der Datei; wer das nicht will, füllt stattdessen die leere Folie (ihre Id steht in der Antwort von `add_logic`) in einem zweiten `weft edit`.
- Nach der Verzweigung läuft die Hauptfolge weiter; alle Zweige treffen sich dort wieder.
- `weft play modul.weft --page 4 --steps "tick 2; submit; weiter"` geht einen Zweig durch.

## Mehrsprachig

Ein Modul in zwei Sprachen entsteht aus dem fertigen in der ersten Sprache:

1. `weft text export modul.weft --from de_DE --to en_US -o texte.json`: alle Texte als Liste (auch Quiz-Erklärungen und Info-Symbole).
2. Die Einträge übersetzen: das HTML bleibt, nur die Wörter ändern sich; `[[Antworten]]` in Lückentexten werden mit übersetzt. Zahlen schreibt man in der Zielsprache (4 827 → 4,827).
3. `weft text import modul.weft texte.json -o modul.zwei.weft`.
4. **Einen Sprachumschalter einbauen** (`add_block` mit `kind: "language"`, am besten in das Layout, oben rechts), sonst können die Lernenden die Sprache nicht wählen.
5. `weft validate --layout` prüft die Folien in jeder Sprache; eine Übersetzung ist oft länger als das Original (`block-overflow` mit der Sprache davor). `weft render --lang en_US` und `weft play --lang en_US` zeigen die Folien in einer Sprache.

Was Weft selbst zeigt („Abschicken", „Das war richtig!") kommt in der Sprache des Players; Namen von Blöcken, Variablen und Zweigen werden nicht übersetzt.

## Live in der offenen App

Läuft die Weft-App (Desktop) auf dem Computer der Person, kann man **an dem Modul arbeiten, das dort offen ist** - ohne Datei, und die Person sieht jede Änderung sofort:

1. `weft status` (MCP: `weft_status`): läuft die App, was ist offen, und was darf die KI (die Person stellt das in den Einstellungen unter „KI-Assistenten" ein: nichts, nur ansehen, ansehen und ändern).
2. Alle Befehle ohne Datei arbeiten am offenen Modul: `weft inspect`, `weft validate --layout`, `weft render`, `weft play`, `weft text export` - und `weft edit operationen.json` ändert es **live**. Alle Operationen einer Datei sind ein Schritt im Verlauf der App: die Person nimmt sie mit Cmd+Z / Strg+Z zurück.
3. Ist kein Modul offen (Startseite), oder soll ein Modul neu hinein: erst als Datei bauen, dann `weft open modul.weft` (MCP: `weft_open`) - es erscheint in der App als neues, noch nicht gespeichertes Modul. Hat die Person ungespeicherte Änderungen offen, fragt die App sie erst.
4. Die Person arbeitet weiter, während man ändert: vor jedem Schritt neu ansehen (`inspect`) statt aus dem Gedächtnis zu ändern. Was zwischen Ansehen und Ändern von der Person gelöscht wurde, wird übersprungen und gemeldet (`skipped`), nichts wird erzwungen.

Auf dem iPad geht das nicht (die KI läuft dort nicht, und eine App kann eine andere nicht steuern).

## Logikblöcke (JavaScript)

Ein Block der Art `script` führt JavaScript aus, wenn sein grünes Ereignis erreicht wird (standardmäßig mit Weiter; wann, bestimmt der Graph): `{"op": "add_block", "page": "$eins", "kind": "script", "set": {"code": "vars.score = vars.score + 1;"}}`. Im Code gibt es `vars` (Variablen über ihren Namen lesen und schreiben), `debug(...)`, `trigger("Titel")`, `jump("2.a.3", "fade")` und `VanillaLM`.

Eigene Bibliotheken: `{"op": "add_script_library", "file": "mylib.js"}` (oder `name` und `code`) legt eine JavaScript-Datei **für das ganze Modul** ab. Sie läuft einmal beim Start, in der Reihenfolge des Hinzufügens (eine, die eine andere braucht, kommt danach), im globalen Bereich - was sie definiert (auch ein `const` oberhalb), kann der Code jedes Logikblocks benutzen. Löscht man einen Logikblock, bleibt die Bibliothek; `remove_script_library` entfernt sie. `weft inspect` listet sie.

## Die typischen Fallen

| Falle | Woran man sie merkt |
|---|---|
| Text läuft aus dem Kasten | `validate --layout`: `block-overflow` |
| `rgba` in `<font color>` | `html-color-invalid` |
| Schrift nicht in der Liste | `html-font-unknown` |
| Ein Ereignis hat mehrere Auslöser (Weiter-Kette und Quiz) | `event-multiple-triggers` |
| `weft new` ohne `--empty` legt eine leere erste Folie an | `weft inspect` zeigt „Folie 1 (keine Blöcke)" |
| Ein Block liegt zum Teil außerhalb der Folie | `block-off-slide` |
| Ein Button springt auf eine Folie, die es nicht gibt | `button-target-missing` |
| Ein Block der Folie liegt über einem Block des Layouts (Sprachumschalter, Zurück/Weiter): die Klicks gehen an den oberen | nur im Player (Klicken) - Blöcke der Folie liegen immer über denen des Layouts, also die Bereiche freihalten |

Und immer: nach dem Bauen `validate --layout`, dann `play` mit den Schritten einer Lernperson, dann die Bilder ansehen.
