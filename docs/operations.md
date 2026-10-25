# Operationen von weft_edit

Bezeichnungen wie in der Übersicht: Folien mit Nummer ("3", "2.a.1") oder Id, Layouts mit Namen oder Id, Variablen mit Namen oder Id,
Blöcke mit Id. Jede Operation kann mit "as" einen Namen für das Angelegte vergeben, der danach als "$name" gilt.

- set_transition {page | "all" | [pages], type ("none" | "fade" | "move" | "iris" | "cube" | "blur" | "horror" | "wheel"), durationMs?, direction?, contentOnly?, hardEdge?} · set_palette {colors:["#fbbf24", …]} (die Farbwahl des Moduls, ersetzt die vorhandene) · set_title {title} · set_template {template?: true | false} (Vorlage: öffnet in Weft als Kopie, die erst an einem eigenen Ort gespeichert werden muss) · set_languages {languages:["de_DE","fr_FR"]} · set_aspect_ratio {aspectRatio} · set_look {brightness?:"light"|"dark", accentColor?:"#rrggbb"|null, interactiveStyle?:"plain"|"elegant"|"round"|"futuristic"} · set_keyboard_navigation {enabled}
- add_variable {name, type:"number"|"boolean"|"string"|"computed", initialValue?, expression?, as?} · update_variable {variable, set} · remove_variable {variable}
- add_layout {name, as?} · rename_layout {layout, name}
- add_page {after?:"start"|"end"|"3", layout?, branch?:{logic, branch, after?}, as?}  → {page, label}
- add_jump_page {after? | branch?, targets?:[{page, condition:{variable, comparator, value}}], default?, as?}  (eine Sprung-Folie wird nie gezeigt: sie führt je nach Bedingung zu einer Folie) · add_jump_target {page, target, condition?} (ein weiteres Ziel einer Sprung-Folie)
- add_logic {after?, name?, layout?, branches:[{label, condition?:{variable, comparator:"eq|neq|gt|gte|lt|lte", value}}], as?}  (der letzte Zweig ist das „sonst", ohne Bedingung). **Jeder Zweig kommt mit einer leeren Folie**: eigene Folien mit add_page und "branch" hinzufügen, die leere danach mit remove_page entfernen.
- remove_page {page} · set_page_layout {page, layout|null}
- add_asset {file, as?}  (eine Bild-/Videodatei von der Festplatte in das Modul aufnehmen: png jpg gif webp svg avif · mp4 webm ogv mov m4v)
- add_image {page | layout, file | asset, alt?, position?, fit?, as?} · add_video {page | layout, file | asset, autoplay?, loop?, muted?, controls?, position?, fit?, as?} · add_audio {page | layout, file | asset, autoplay?, loop?, appearance? ("player" | "hidden"), position?, as?}
  (legt Datei und Block in einem Schritt an; der Block bekommt die Form der Datei - "position" ist dafür der ungefähre Platz, mit "fit": false genau diese Lage)
- set_media {block, file | asset, fit?}  (ein anderes Bild/Video in einen vorhandenen Block)
- add_block {page | layout, kind, set?:{…Felder…}, as?}  → {block}   (kind: text, list, quiz, cloze, checker, matching, button, image, video, audio, code, tex, iframe, shape, arrow, files, language, script (Logikblock mit JavaScript, nur auf Folien); im Layout auch placeholder). Felder und Bedeutung: weft_schema <kind>.
- add_text {page | layout, text | paragraphs | html, x?, y?, width?, height? ("auto" oder Zahl in % - ohne Angabe wird sie geschätzt), size? (cqw, Standard 1.7), color? ("#rrggbb" oder "rgba(…)"), bold?, italic?, align?, font?, lineHeight?, gap?, box?, effect? ("fade" …), name?, as?}
  (ein Text aus einer Beschreibung: "text" mit Zeilen = Absätze, oder "paragraphs": [[{"text":"…","color":"#fbbf24","bold":true}, "…"], "…"] für Absätze aus Teilen; das HTML schreibt Weft so, wie der Editor es schreibt. "box": {"fill":"#ffffff","fillOpacity":0.08,"borderColor":…,"radius":1.2,"padding":1.5,"blur":true} legt einen Hintergrund mit Rand dahinter - eine Karte in einem Block; "blur": true lässt den Hintergrund der Folie unscharf durchscheinen.)
- add_shape {page | layout, shape? ("rectangle" | "ellipse" | "polygon" | "star"), x?, y?, width?, height?, color?, opacity?, gradient? {kind, angle, stops:[[Farbe, Offset, Deckkraft?], …]}, radius? (0-50), stroke? {color, width, opacity, style}, shadow? (true | {…}), blur? (true: lässt den Hintergrund unscharf durchscheinen - nur Rechteck und Ellipse), sides?, points?, effect?, name?, as?}
- add_matching {page, sources, targets, pairs?, shuffle?, required?, onEachCorrect?, onEachWrong?, onCorrect?, onIncorrect?, sourceSize?, targetSize?, x?, y?, width?, height?, effect?, name?, as?}
  (ein Matching: zwei Listen von Karten, die Lernperson zieht die Objekte der ersten ("sources") per Drag & Drop auf die der zweiten ("targets") und schickt ab; dann wird gezeigt, was richtig war. Karten sind {"text": "…"} oder Bilder {"file": "bild.png", "text": "Beschreibung"} (oder "asset"). "pairs": [[Nummer des Objekts, Nummer des Ziels], …], gezählt ab 0 - ein Objekt, das in keinem Paar steht, gehört zu keinem Ziel (ein Ablenker; es irgendwo abzulegen ist falsch). "onEachCorrect" / "onEachWrong": Variablen-Effekte für jede richtig / falsch zugeordnete Karte (zum Beispiel Minuspunkte), "onCorrect" / "onIncorrect" für alles richtig / nicht alles richtig. "shuffle": die Karten jeder Liste tauschen bei jedem Zeigen zufällig die Plätze. Die Karten stehen in zwei Spalten; ihre Plätze (x, y in Prozent der Fläche) und Größen ("sourceSize", "targetSize": {"width", "height"}) lassen sich mit update_block ändern - "pairs" wird dabei ganz ersetzt. Ereignisse wie bei einem Quiz. Nur auf Folien.)
- add_checker {page, text?, required?, onChecked?, onUnchecked?, x?, y?, width?, height?, effect?, name?, as?}
  (ein Checker: ein Kästchen mit Text daneben - zum Beispiel eine Einverständniserklärung - und darunter „Abschicken". "required": Pflichtangabe, ohne Abschicken kommt man mit Weiter nicht von der Folie weg. "onChecked" / "onUnchecked" sind Listen von Variablen-Effekten ({"variableId": "punkte", "op": "add", "value": 1}) für das Abschicken mit und ohne Haken. Ereignisse wie bei einem Quiz: erster Klick auf das Kästchen "quiz-fill:<Checker>", abgeschickt "quiz-submit:<Checker>", mit Haken "quiz-submit:<Checker>:richtig", ohne "…:falsch". Nur auf Folien, nicht im Layout.)
- add_link {page | layout, url, text? (Standard "Seite öffnen"), x?, y?, width?, height?, effect?, name?, as?}
  (ein Link als eigenes Element der Folie, kein Teil eines Textes: "url" - eine Adresse (http, https, mailto, tel; ohne Schema wird es https), die sich in einem neuen Tab öffnet. Er sieht aus wie ein Button des Modulstils (dunkelgrau, Ecken nach dem Stil der interaktiven Elemente) mit einem Globus vor dem Text. Kein Weg, eine Datei auszuliefern: ein Browser speichert eine Datei einer fremden Seite nicht, er öffnet sie nur; Dateien, die zum Modul gehören, kommen in den Dateien-Block.)
- update_block {block, set:{…}} · remove_block {block}
  (In "set" werden Felder, die Objekte sind - position, fill, stroke, entranceEffect, box … -, mit dem vorhandenen zusammengeführt, nicht ersetzt: {"position": {"y": 40}} lässt x, width und height. Listen werden ersetzt.)
- add_script_library {file | name + code, as?} (eine JavaScript-Bibliothek für die Logikblöcke des Moduls: läuft einmal beim Start, in der Reihenfolge des Hinzufügens, vor dem Code jedes Logikblocks; gleicher Name ersetzt) · remove_script_library {library (Name oder Id)}
- fill_placeholder {page, placeholder?, text | html}  (der Text der Folie für einen Platzhalter des Layouts, formatiert wie dieser; text: Zeilen = Absätze)
- add_trigger {page, from, to, delayMs?, weiter?} (FÜGT einen Auslöser hinzu: ein Ereignis kann mehrere haben, das erste, das eintritt, löst es aus - auch die Weiter-Kette, die jeder Block mit Aufbau von selbst bekommt, bleibt dann; zum Ersetzen set_trigger) · set_trigger {page, to, from|null, delayMs?, weiter?} (ersetzt, was "to" auslöste - wie „Ausgelöst durch" im Editor; ohne weiter: nach delayMs, mit weiter: bei der nächsten Weiter-Eingabe nach "from") · remove_trigger {page, trigger}
  Ereignisse: "start", "end" (Nächste Folie), "entrance:<Block>", "exit:<Block>", "click:<Button>", "quiz-fill:<Quiz>", "quiz-submit:<Quiz>",
  "quiz-correct:<Quiz>", "quiz-incorrect:<Quiz>", "quiz-correct-end:<Quiz>", "video-start:<Video>", "video-end:<Video>" oder die echte Id aus weft_inspect.

Wichtig zum Aufbau: Eine Sprung-Folie führt zu einer Folie, und danach läuft die Folge hinter DIESER Folie weiter (wie nach einem Zweig).
Für getrennte Wege, die sich danach wieder treffen, add_logic (Verzweigung mit Zweigen) benutzen. Ein Button, der zu einer Folie
springt: add_block kind "button" mit set {"action":"goto","targetPageId":"3"}.

In "set" werden Namen aufgelöst: "$name" ist, was unter diesem Namen angelegt wurde; ein "variableId" darf der Name der Variablen sein; ein
"targetPageId" die Nummer der Folie. Ids, die man selbst vergibt (zum Beispiel für Quiz-Optionen), dürfen beliebige eindeutige Texte sein.

Beispiel Rätsel mit Schlüssel:
[
 {"op":"add_variable","name":"schluessel","type":"boolean"},
 {"op":"add_page","as":"raum1"},
 {"op":"add_block","page":"$raum1","kind":"button","set":{"text":"Schlüssel nehmen","action":"event","onClick":[{"variableId":"schluessel","op":"set","value":true}]}},
 {"op":"add_page","as":"tuer"},
 {"op":"add_jump_page","after":"$raum1","targets":[{"page":"$tuer","condition":{"variable":"schluessel","comparator":"eq","value":true}}]}
]
