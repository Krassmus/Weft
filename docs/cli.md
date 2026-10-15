# Weft von der Kommandozeile (und für KI)

Das Werkzeug `weft` liest eine `.weft`-Datei und beantwortet drei Fragen, ohne etwas zu verändern:

- **Was steht darin?** `weft inspect`
- **Stimmt es?** `weft validate`
- **Wie ist das Format aufgebaut?** `weft schema`

Und es hilft beim Übersetzen: `weft text export` macht aus dem Modul eine flache Textliste, `weft text import` schreibt die übersetzten Texte in ein neues Modul.

Es benutzt dieselben Funktionen wie der Editor (Folien-Nummern, Ereignis-Graph, Übersetzungen); was es sagt, ist also das, was Weft selbst sagen würde. Gedacht ist es für Skripte und für KI-Assistenten, die ein Lernmodul verstehen, prüfen oder bearbeiten sollen (`weft.json` im Archiv ist die Quelle der Wahrheit; der Automerge-Verlauf daneben wird beim Öffnen nur benutzt, wenn er dazu passt).

## Aufruf

Im Projekt (Node 22):

```bash
npm run weft -- inspect mein-modul.weft
npm run weft -- validate mein-modul.weft
npm run weft -- schema quiz
```

`npm run weft` baut das Werkzeug (`cli/dist/weft.mjs`) und führt es aus. Danach geht auch direkt `node cli/dist/weft.mjs <Befehl> …`.

Statuscodes: `0` in Ordnung · `1` die Prüfung fand Fehler (mit `--strict` auch bei Warnungen) · `2` falscher Aufruf oder nicht lesbare Datei.

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
| Ereignisse | `event-unreachable` (nichts löst es aus), `page-no-exit` („Nächste Folie" nicht erreichbar), `trigger-dangling` (Auslöser zwischen Ereignissen, die es nicht gibt) |
| Inhalt | `placeholder-variable` (unbekannte `{{Variable}}` oder Formatierung mitten im Namen), `quiz-no-correct`, `quiz-few-options`, `cloze-no-blanks`, `translation-missing`, `block-off-slide`, `block-no-size` |
| Hinweise | `image-no-alt`, `button-no-text`, `variable-unused`, `variable-duplicate`, `page-deleted` |

Jede Meldung hat `severity` (`error`, `warning`, `info`), `code`, `message`, wo sinnvoll `hint` (was zu tun ist) und die Stelle (`page` mit Nummer und Id, `layout`, `blockId`).

Ein Hinweis zu gelöschten Folien: Beim Löschen einer Folie verschwindet nur ihr Platz in der Folienübersicht; das Objekt bleibt in der Datei. `weft` ignoriert solche Folien und meldet sie einmal als `page-deleted`.

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

- Eine JSON-Datei mit allen Texten, die einer Lernperson gezeigt werden: Texte, Lückentexte, Fragen und Antworten von Quizzen, Listenpunkte und Button-Beschriftungen, auch die der Layouts. Gelöschte Folien sind nicht dabei.
- Jeder Eintrag in `items` hat einen `key` (`<Block-Id>#<Teil>`), die `source` (HTML mit Formatierung), die Fundstelle als `context` („Folie 2.a.1 · Quiz · Antwort 2") und `translations` mit einem leeren Feld je Zielsprache. Dort steht die Übersetzung, ausgefüllt von Person oder KI. Schon vorhandene Übersetzungen sind eingetragen.
- Die Datei enthält in `instructions` eine kurze Anleitung für den, der übersetzt: Tags und `{{Variablen}}` bleiben, in Lückentexten werden die Antworten in `[[ ]]` mitübersetzt, Schlüssel und Quelle nicht ändern.

**Import** (`-o` Zieldatei, Standard `<name>.<sprache>.weft` neben der Quelle; `--dry-run` zeigt nur, was passieren würde; `--force` erlaubt Überschreiben):

- Schreibt in eine **neue** Datei - die Quelle bleibt unverändert. Bilder, Videos und Schriften werden mit kopiert.
- Fehlende Sprachen werden dem Modul hinzugefügt (hat es keine, wird `--from`/`from` die Standardsprache). Die Sprache des Moduls wird erst dann zur Wahl für die Lernenden, wenn es einen Sprachumschalter (Block „Sprachumschalter") gibt - den setzt man in Weft.
- Jede Übersetzung wird geprüft, bevor sie übernommen wird: Tags müssen richtig geschachtelt sein; Skripte, `on…=`-Attribute und `iframe` sind verboten (dann wird der Text übersprungen); bei Lückentexten muss die Zahl der `[[Lücken]]` stimmen. Abweichende `{{Variablen}}` oder Tags sind Warnungen. Was übersprungen wurde, steht mit Schlüssel im Bericht, und der Statuscode ist dann `1`.
- Der Editierverlauf (`weft.automerge`) und das Abspiel-HTML (`index.html`) werden nicht mitgenommen: sie beschrieben den alten Stand. Weft schreibt das beim nächsten Speichern neu.

## Wie eine KI damit arbeiten kann

1. `weft inspect datei.weft` - einen Überblick holen, ohne die ganze Datei zu lesen.
2. `weft schema <Art>` - nachlesen, wie ein Block aussieht, bevor man einen schreibt.
3. Übersetzen: `weft text export`, die Einträge übersetzen, `weft text import` - ohne die Struktur des Moduls kennen zu müssen.
4. Anderes ändern: `weft.json` im Archiv bearbeiten (`unzip`, bearbeiten, wieder zippen) - die Ids, `order`-Schlüssel und Verweise wie in der Gliederung.
5. `weft validate datei.weft --json` - Fehler und Warnungen mit Hinweisen auswerten und beheben, bis nichts mehr gemeldet wird.
