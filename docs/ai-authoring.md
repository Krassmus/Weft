# Ein Lernmodul bauen (für KI und Skripte)

Diese Seite ist die kurze Anleitung, wie man mit `weft` (Kommandozeile oder [MCP-Server](mcp.md)) ein Lernmodul baut, das gut aussieht und funktioniert. Sie sammelt, was man sonst durch Ausprobieren herausfindet. Die Befehle stehen in [cli.md](cli.md), die Operationen von `weft edit` in `weft_operations` (oder [mcp.md](mcp.md)). Ein fertiges Beispiel: [`examples/durch-drei-teilbar.weft`](../examples/durch-drei-teilbar.weft).

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

Und immer: nach dem Bauen `validate --layout`, dann `play` mit den Schritten einer Lernperson, dann die Bilder ansehen.
