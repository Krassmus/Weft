# Weft von der Kommandozeile (und für KI)

Das Werkzeug `weft` liest eine `.weft`-Datei und beantwortet drei Fragen, ohne etwas zu verändern:

- **Was steht darin?** `weft inspect`
- **Stimmt es?** `weft validate`
- **Wie ist das Format aufgebaut?** `weft schema`

Und es hilft beim Übersetzen: `weft text export` macht aus dem Modul eine flache Textliste, `weft text import` schreibt die übersetzten Texte in ein neues Modul.

Es benutzt dieselben Funktionen wie der Editor (Folien-Nummern, Ereignis-Graph, Übersetzungen); was es sagt, ist also das, was Weft selbst sagen würde. **Neu hier? `weft guide` gibt die Anleitung zum Bauen eines Lernmoduls aus** (englisch, mit `--lang de` deutsch; `weft guide ops` die Operationen, `weft guide cli` diese Seite). Englische Fassung dieser Seite: [cli.en.md](cli.en.md). Gedacht ist es für Skripte und für KI-Assistenten, die ein Lernmodul verstehen, prüfen oder bearbeiten sollen (`weft.json` im Archiv ist die Quelle der Wahrheit; der Automerge-Verlauf daneben wird beim Öffnen nur benutzt, wenn er dazu passt).

## Aufruf

**Mit der Desktop-App:** Sie bringt das Werkzeug mit eigenem Node mit. In den Einstellungen unter „KI-Assistenten" auf „Kommandozeilenwerkzeug installieren" klicken, dann geht `weft …` in einem Terminal (der Ordner `~/.local/bin` muss im PATH sein; die Einstellungen sagen, wie). Ein Update der App aktualisiert das Werkzeug mit.

Im Projekt (Node 22):

```bash
npm run weft -- inspect mein-modul.weft
npm run weft -- validate mein-modul.weft
npm run weft -- schema quiz
```

`npm run weft` baut das Werkzeug (`cli/dist/weft.mjs`) und führt es aus. Danach geht auch direkt `node cli/dist/weft.mjs <Befehl> …`.

Statuscodes: `0` in Ordnung · `1` die Prüfung fand Fehler (mit `--strict` auch bei Warnungen) · `2` falscher Aufruf oder nicht lesbare Datei.

## `weft version [--json]`

Die Version des Werkzeugs (die der Weft-App, aus der es gebaut ist), das Dateiformat, das es liest und schreibt (heute 5), Node und der gefundene Browser zum Zeichnen. Auch `weft --version`.

**Dateien eines anderen Formats:** Das Werkzeug wandelt nichts um. Eine Datei mit **neuerem** Format (mit einer neueren Weft-Version gespeichert) kann es nur mit Vorbehalt lesen; `inspect`, `render`, `play`, `html` und `text export` sagen das als Hinweis auf der Fehlerausgabe, `validate` meldet `format-version` als Fehler, und **ändern** (`edit`, `text import`) lehnt es ab. Eine Datei mit **älterem** Format wird gelesen (mit Hinweis, `validate` warnt), aber nicht geändert - sie einmal in Weft öffnen und speichern, dann geht es. So beschädigt ein altes Werkzeug keine neuere Datei, und ein neues schreibt keine Mischung aus alter und neuer Form.

## Das in der App offene Modul: ohne Datei, `weft status`, `weft open`

Läuft die Weft-App (Desktop), arbeiten `inspect`, `validate`, `render`, `play`, `html` und `text export` **ohne Dateiangabe** an dem Modul, das dort offen ist. `weft edit operationen.json` (nur die Operationen, keine Datei) **ändert es live**: Die Änderungen erscheinen sofort in der App, als ein Schritt im Verlauf (Cmd+Z / Strg+Z), und was die Person inzwischen selbst geändert hat, bleibt.

```bash
weft status                        # läuft die App, was ist offen, was darf die KI
weft inspect                       # das offene Modul
weft edit operationen.json         # live ändern
weft open modul.weft               # eine Datei in der App zeigen (als neues, noch nicht gespeichertes Modul)
```

Die Person bestimmt in den Einstellungen der App (KI-Assistenten), ob das erlaubt ist: nichts, nur ansehen, ansehen und ändern. Die App öffnet dafür einen Zugang nur für diesen Computer (ein Socket auf 127.0.0.1, Port und Passwort in `control.json` im Datenordner der App, nur für diesen Benutzer lesbar); `WEFT_CONTROL_FILE` zeigt auf eine andere `control.json` (zum Beispiel für eine zweite App-Kopie). Auf dem iPad und iPhone gibt es das nicht, auch nicht in der Store-Fassung (sie liegt in einem eigenen Datenordner).

**Stand:** Die Einstellungsseite „KI-Assistenten" ist zurzeit ausgeblendet (`AI_SETTINGS_VISIBLE` in `src/core/control/bridge.ts`), und solange sie es ist, ist der Zugang **aus**. Zum Ausprobieren in der Webansicht der App `localStorage["weft.control.mode"] = "edit"` setzen (oder `"read"`).

## `weft inspect <datei> [--page <nummer>] [--json]`

Gliederung des Moduls: Titel, Sprachen, Variablen, Layouts mit ihren Blöcken, dann alle Folien in der Reihenfolge, in der sie gespielt werden (mit Verzweigungen und Sprung-Folien). Jeder Block steht in einer Zeile mit Art, Inhalt und Id.

- Die Folien tragen die Nummern der Folienübersicht (`3`, `2.a.1`). Mit `--page 2.a.1` (oder einer Folien-Id) gibt es eine Folie ausführlich: Position und Effekte der Blöcke, alle Ereignisse („Start der Folie", „Aufbau …", „Quiz richtig abgeschickt" …) und alle Auslöser dazwischen. Ereignisse, die nie passieren, sind markiert.
- `--json` gibt dieselben Daten als JSON aus, zum Weiterverarbeiten.

## `weft validate <datei> [--json] [--strict]`

Prüft die Datei auf

| Gruppe | Meldungen (`code`) |
|---|---|
| Format | `format-version` (neuer/älter als diese Weft-Version), `schema` (Feld fehlt oder hat die falsche Art), `schema-unknown-field` (unbekanntes Feld, harmlos) |
| Verweise | `layout-missing`, `sequence-page-missing`, `branch-page-missing`, `condition-variable-missing`, `jump-target-missing`, `button-target-missing`, `button-target-empty`, `effect-variable-missing`, `quiz-correct-missing`, `group-block-missing`, `placeholder-link-broken`, `placeholder-on-page` |
| Dateien | `asset-missing` (nicht in der Liste), `asset-file-missing` (nicht im Archiv), `media-empty` |
| Ereignisse | `event-unreachable` (nichts löst es aus), `event-multiple-triggers` (mehrere Auslöser - zum Beispiel Weiter-Kette und Quiz; Warnung, wenn ein Weiter dabei ist), `page-no-exit` („Nächste Folie" nicht erreichbar), `trigger-dangling` (Auslöser zwischen Ereignissen, die es nicht gibt) |
| Inhalt | `placeholder-variable` (unbekannte `{{Variable}}` oder Formatierung mitten im Namen), `html-color-invalid` (`<font color>` ohne #rrggbb, zum Beispiel rgba), `html-font-unknown` (Schrift nicht in der Liste), `quiz-no-correct`, `quiz-few-options`, `cloze-no-blanks`, `translation-missing`, `block-off-slide`, `block-no-size` |
| Hinweise | `image-no-alt`, `button-no-text`, `variable-unused`, `variable-duplicate`, `page-deleted` |

Jede Meldung hat `severity` (`error`, `warning`, `info`), `code`, `message`, wo sinnvoll `hint` (was zu tun ist) und die Stelle (`page` mit Nummer und Id, `layout`, `blockId`).

Ein Hinweis zu gelöschten Folien: Beim Löschen einer Folie verschwindet nur ihr Platz in der Folienübersicht; das Objekt bleibt in der Datei. `weft` ignoriert solche Folien und meldet sie einmal als `page-deleted`.

### Passt der Inhalt in seinen Kasten? `weft validate --layout`

Die Prüfung oben liest nur die Datei. Ob ein Text in seinen Kasten passt, sagt erst ein Browser: `weft validate <datei> --layout [--page 3]` zeichnet die Folien mit dem Player des Moduls (Chrome, Chromium, Edge oder Brave nötig, wie bei `weft render`) und misst. Was nicht passt, meldet es als `block-overflow` mit dem Hinweis, wie hoch der Block mindestens sein müsste. Gemessen werden Texte, Listen, Buttons, Quizze und Lückentexte; bei den beiden letzten mit der Rückmeldung, die nach dem Abschicken den Button ersetzt. Ein paar Pixel unter der Schrift (Platz für Unterlängen) gelten nicht als abgeschnitten.

## `weft schema [<name>] [--list] [--json] [--full]`

Das Dateiformat. Ohne Name: die Arten von Blöcken mit je einem Satz, wofür sie da sind. Mit Name (eine Art wie `quiz` oder eine Definition wie `Page`, `BlockEffect`): alle Felder mit Typ, Pflicht und Beschreibung. `--json` gibt die Definition als JSON-Schema aus, `--full` das ganze Schema.

Das Schema steht auch als Datei in [`weft.schema.json`](weft.schema.json). Es wird aus den TypeScript-Typen in `src/core/types.ts` erzeugt:

```bash
npm run schema
```

(Nach jeder Änderung an den Typen neu erzeugen und mit einchecken.)

## Übersetzen: `weft text export` / `weft text import`

Der Weg für „übersetze dieses Lernmodul ins Französische":

```bash
npm run weft -- text export modul.weft --to fr_FR --from de_DE -o texte.json
# ... texte.json übersetzen lassen (zum Beispiel von einer KI) ...
npm run weft -- text import modul.weft texte.json -o modul.fr.weft
```

**Export** (`--to` eine oder mehrere Sprachen, durch Komma getrennt; `--from` nur nötig, wenn das Modul noch keine Sprache eingestellt hat; `--missing` nur, was noch keine Übersetzung hat):

- Eine JSON-Datei mit allen Texten, die einer Lernperson gezeigt werden: Texte, Lückentexte, Fragen und Antworten von Quizzen, Listenpunkte und Button-Beschriftungen, Überschrift und Text der Info-Symbole, auch die der Layouts. Gelöschte Folien sind nicht dabei.
- Jeder Eintrag in `items` hat einen `key` (`<Block-Id>#<Teil>`), die `source` (HTML mit Formatierung), die Fundstelle als `context` („Folie 2.a.1 · Quiz · Antwort 2") und `translations` mit einem leeren Feld je Zielsprache. Dort steht die Übersetzung, ausgefüllt von Person oder KI. Schon vorhandene Übersetzungen sind eingetragen.
- Die Datei enthält in `instructions` eine kurze Anleitung für den, der übersetzt: Tags und `{{Variablen}}` bleiben, in Lückentexten werden die Antworten in `[[ ]]` mitübersetzt, Schlüssel und Quelle nicht ändern.

**Import** (`-o` Zieldatei, Standard `<name>.<sprache>.weft` neben der Quelle; `--dry-run` zeigt nur, was passieren würde; `--force` erlaubt Überschreiben):

- Schreibt in eine **neue** Datei - die Quelle bleibt unverändert. Bilder, Videos, Audiodateien und Schriften werden mit kopiert.
- Fehlende Sprachen werden dem Modul hinzugefügt (hat es keine, wird `--from`/`from` die Standardsprache). Die Sprache des Moduls wird erst dann zur Wahl für die Lernenden, wenn es einen Sprachumschalter (Block „Sprachumschalter") gibt - den setzt man in Weft.
- Jede Übersetzung wird geprüft, bevor sie übernommen wird: Tags müssen richtig geschachtelt sein; Skripte, `on…=`-Attribute und `iframe` sind verboten (dann wird der Text übersprungen); bei Lückentexten muss die Zahl der `[[Lücken]]` stimmen. Abweichende `{{Variablen}}` oder Tags sind Warnungen. Was übersprungen wurde, steht mit Schlüssel im Bericht, und der Statuscode ist dann `1`.
- Der Editierverlauf (`weft.automerge`) und das Abspiel-HTML (`index.html`) werden nicht mitgenommen: sie beschrieben den alten Stand. Weft schreibt das beim nächsten Speichern neu.

## Folien zeichnen: `weft render`

```bash
npm run weft -- render modul.weft --page 2.a.1 -o folie.png
npm run weft -- render modul.weft --all -o bilder/        # alle Folien, eine PNG je Folie
```

Zeichnet eine Folie als PNG mit dem Player des Moduls in einem headless Chrome (Chrome, Chromium, Edge oder Brave muss installiert sein; sonst den Pfad in `WEFT_CHROME` oder mit `--chrome` angeben). Schriften, Bilder und Videos (erstes Bild) stammen aus dem Modul.

- Standard: alles, was auf der Folie steht, ist da (nichts wartet auf seinen Aufbau, nichts geht von selbst weiter); `--state start` zeigt die Folie, wie sie beginnt.
- `--width 1280` (Standard; die Höhe folgt aus dem Seitenverhältnis), `--lang fr_FR` für eine Sprache des Moduls.
- Sprung-Folien werden nie gezeigt und lassen sich nicht zeichnen.

## Durchspielen: `weft play`

```bash
npm run weft -- play modul.weft --page 4 --steps "tick 1 3 5; submit; weiter" -o spiel/
```

`weft render` zeichnet eine Folie in einem Zustand. `weft play` spielt das Modul wie eine Lernperson (der Player in einem Chrome, wie bei `render`) und sagt nach jedem Schritt in Worten, was sich geändert hat: welche Blöcke neu zu sehen sind oder verschwunden, auf welcher Folie man jetzt ist, was ein Quiz gemeldet hat. Dazu ein Bild je Schritt im Ordner `-o` (Standard `weft-spiel`).

| Schritt | Was er tut |
|---|---|
| `weiter` · `zurueck` | → / ← drücken (die Tastaturbedienung des Moduls muss an sein) |
| `click <Text>` | den ersten sichtbaren Button, die Antwort oder den Link mit diesem Text anklicken |
| `tick <n> …` | die n-ten Antworten (ab 1) des ersten noch offenen Quiz ankreuzen |
| `zuordnen <Objekt> <Ziel>` | im ersten Matching ein Objekt (nach seinem Text) einem Ziel zuordnen |
| `sortieren <Objekt> …` | im ersten noch offenen Sortierrätsel die Objekte (nach ihren Texten) in diese Reihenfolge bringen |
| `galerie weiter\|zurueck\|oeffnen\|schliessen` | in der ersten Galerie zum nächsten / vorigen Bild blättern (auch im geöffneten Bild), das gezeigte Bild groß öffnen (mit Bildunterschrift) oder das geöffnete schließen |
| `loesung <Wort>` | in das erste Lösungswort, das noch zu versuchen ist, das Wort schreiben und „Abschicken" drücken (die Meldung sagt, ob es richtig war) |
| `submit` | „Abschicken" des ersten noch offenen Quiz, Lückentextes, Matchings oder Sortierrätsels drücken |
| `fill <Text> …` | die Lücken des ersten offenen Lückentextes der Reihe nach ausfüllen |
| `key <Taste>` · `wait <ms>` · `shot` | eine Taste drücken · warten · nur ein Bild |

`--page` sagt, mit welcher Folie das Spiel beginnt, `--lang` in welcher Sprache. Schritte stehen in `--steps` durch `;` getrennt (Wörter mit Leerzeichen in "Anführungszeichen").

## Die Seite des Players: `weft html`

```bash
npm run weft -- html modul.weft -o ordner/ [--page 3]
```

Schreibt `index.html` mit Bildern, Videos und Schriften in einen Ordner, zum Ansehen im Browser oder zum Weiterprüfen mit eigenen Werkzeugen. Mit `--page` beginnt das Modul mit dieser Folie.

## Neu anlegen und ändern: `weft new` / `weft edit`

```bash
npm run weft -- new raum.weft --title "Escape Room" --languages de_DE
npm run weft -- new leer.weft --empty                 # ohne Layout und Folie (add_layout, add_page legen sie an)
npm run weft -- edit raum.weft operationen.json      # schreibt raum.ai.weft
```

`weft edit` führt eine Liste von Operationen aus (`set_title`, `add_page`, `add_block`, `update_block`, `add_variable`, `add_logic`, `add_jump_page`, `add_trigger`, `fill_placeholder`, `add_image`, `add_video`, `add_audio` ...). Es sind die Aktionen des Editors, ausgeführt auf der Datei. Die Quelle bleibt unverändert, geschrieben wird in die Arbeitskopie `<name>.ai.weft` (oder mit `-o`). Es wird nichts geschrieben, wenn eine Operation fehlschlägt oder die Änderungen Fehler erzeugen (`--allow-errors`); `--dry-run` prüft nur. Die Operationen mit Beispielen: `weft edit --ops` oder `weft guide ops` ([operations.md](operations.md)); als MCP-Server sind alle Befehle ohne Kommandozeile für KI-Assistenten da.

## Wie eine KI damit arbeiten kann

Wie man ein Lernmodul baut, das gut aussieht (Raster, Textgrößen, Weiter-Ketten, Fallen), steht in [ai-authoring.md](ai-authoring.md) (englisch: [ai-authoring.en.md](ai-authoring.en.md)); `weft guide` gibt es im Programm aus.

1. `weft inspect datei.weft` - einen Überblick holen, ohne die ganze Datei zu lesen.
2. `weft schema <Art>` - nachlesen, wie ein Block aussieht, bevor man einen schreibt.
3. Übersetzen: `weft text export`, die Einträge übersetzen, `weft text import` - ohne die Struktur des Moduls kennen zu müssen.
4. Anderes ändern: `weft.json` im Archiv bearbeiten (`unzip`, bearbeiten, wieder zippen) - die Ids, `order`-Schlüssel und Verweise wie in der Gliederung.
5. `weft validate datei.weft --json` - Fehler und Warnungen mit Hinweisen auswerten und beheben, bis nichts mehr gemeldet wird.
