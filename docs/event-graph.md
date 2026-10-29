# Der Event-Graph

Dieses Dokument beschreibt, wie der Event-Graph einer Folie aufgebaut ist und was er bedeutet. Es ist die Grundlage für den Umbau des
bisherigen Event-Graphen (`Timeline.tsx`, `core/document/pageTimeline.ts`, der Teil des Players, der Trigger auswertet). Wo etwas noch
offen ist, steht das unter „Offene Punkte“.

Stand der Umsetzung: siehe den Abschnitt „Umsetzungsstufen“ ganz unten.

## 1. Grundbegriffe

**Event.** Ein Knoten („Bubble“) im Graphen: etwas, das auf der Folie passiert. „Start der Folie“, „Text erscheint“, „Video startet“,
„Antwort ist richtig“, „Nächste Folie“.

**Trigger.** Eine Linie im Graphen. Sie verbindet genau zwei Events: Ein Trigger gehört zu dem Event, das ihn auslöst (Ausgangstrigger),
und zu dem Event, das durch ihn ausgelöst wird (Eingangstrigger). Es ist derselbe Trigger, nur von zwei Seiten gesehen. Im Datenmodell
gibt es deshalb genau eine Liste von Triggern `{ von, nach, Verzögerung, wartet auf Weiter }` – nie eine zweite Fassung auf der anderen
Seite.

**Eingangstrigger / Ausgangstrigger.** Nur die Rolle aus Sicht eines Events. Ein Event hat null oder mehrere von jeder Sorte.

**Event-Block.** Ein Bereich des Graphen, den ein Objekt der Folie (ein Quiz, ein Video, eine Gruppe) selbst darstellt. Er stellt dem
Graphen Events zur Verfügung, die sich verhalten wie alle anderen, und darf das Innere frei zeichnen (siehe Abschnitt 5).

## 2. Ein Event

Jedes Event hat:

| Eigenschaft | Bedeutung |
| --- | --- |
| Icon | womit es im Graphen dargestellt wird |
| Titel | wird im Graphen angezeigt; der Standardtitel kommt vom Typ des Events, der Nutzer kann ihn pro Event überschreiben. Titel müssen nicht eindeutig sein – der Zusammenhang im Graphen unterscheidet. |
| Typ | bestimmt die Farbe: **blau** `#4D8DFF` Standard, **gelb** `#F5B83D` Animation, **violett** `#A66CFF` Nutzerinteraktion, **grün** `#34E0A1` ein Skript läuft (Logikblock) |
| Eingangstrigger | null oder mehrere; **ODER**: einer genügt, um das Event auszulösen |
| Ausgangstrigger | null oder mehrere; sie werden alle ausgelöst, wenn das Event passiert |

### Wann passiert ein Event?

- Ein Event kann **beliebig oft** passieren. Es gibt keine „höchstens einmal pro Besuch“-Regel. Dass etwas nur einmal geht, ist eine
  Eigenschaft der Aktion (ein Button, der nach einem Klick abgeschaltet wird) und kein Merkmal des Events.
- Passiert ein Event, werden alle seine Ausgangstrigger ausgelöst.
- Aktionen müssen mit mehrfachem Auslösen umgehen können: Ein „Text erscheint“, wenn der Text schon da ist, tut nichts (und löst auch
  nichts weiter aus); ein „Video startet“ bei einem laufenden Video ebenso.
- Eine Endlosschleife (A löst B aus, B löst A aus, ohne Verzögerung und ohne Weiter) ist konstruierbar. Damit sie den Player nicht
  einfriert, wird jeder Trigger asynchron zugestellt (ein Durchlauf der Ereignisschleife je Schritt) und es gibt eine Obergrenze pro
  Sekunde. Der Editor warnt bei einem solchen Zyklus.

### Unerreichbare Events

Ein Event ist **erreichbar**, wenn es vom Start der Folie oder von einem nutzerseitigen Event (violett, hat keine Eingangstrigger und
wartet auf den Nutzer) aus über Trigger erreicht werden kann. Alles andere ist unerreichbar: Es wird **rot** dargestellt, und in der
rechten Seitenleiste steht eine Warnung. Mehr geschieht nicht.

## 3. Ein Trigger

Ein Trigger hat:

- **Quelle** und **Ziel**: je ein Event (oder: der Start der Folie als Quelle).
- **Verzögerung** (Millisekunden, Standard 0): wie lange nach dem Auslösen des Triggers das Ziel passiert.
- **Wartet auf Weiter** (ja/nein): Wenn ja, wartet der Trigger, nachdem seine Quelle passiert ist, auf das nächste „Weiter“ des
  Lernenden (Leertaste, →, Tipp, ein Button mit der Aktion „Weiter“). Erst dann läuft die Verzögerung, dann passiert das Ziel.

**Weiter** löst **alle** Trigger aus, die in dem Moment auf Weiter warten – nicht nur einen. Ein Trigger beginnt erst zu warten,
wenn seine Quelle passiert ist. Dadurch ergeben sich Aufbau-Ketten („Text A, dann Weiter, dann Bild B, dann Weiter, dann nächste Folie“)
ohne eine eigene Warteschlange: Druck 1 löst A aus, erst dann wartet der Trigger zu B.

**Quelle „Variable“ (Bedingung):** Der Aufbau, der Abbau und jeder Aktionseffekt eines Elements können auch von einer **Formel** über die Variablen ausgelöst werden (die Sprache der
berechneten Variablen, z. B. `punkte >= 10 und stufe = 2`). Die Formel ist ein eigenes Event (`condition:<Ziel-Event>`, Typ „Variable“), das passiert,
wenn sie von falsch zu wahr wechselt – und einmal beim Betreten der Folie, wenn sie dann schon wahr ist. Es hat einen ganz normalen Trigger zum Ziel
(Verzögerung 0, ohne Weiter); in der Seitenleiste des Events lässt sich die Formel ändern und mit „Weiteres Ziel hinzufügen“ ein weiteres Ziel anhängen.
Fällt die Formel wieder auf falsch und wird erneut wahr, passiert das Event wieder (ein Aufbau eines Elements, das schon da ist, tut nichts; ein Aktionseffekt läuft erneut). Ein Aktionseffekt an einer Bedingung kann vor dem Aufbau seines Elements passieren, wenn die Formel dann schon wahr ist: der Graph zeigt das wie bei jedem anderen Auslöser als Problem. Die Formel
wird nach **jeder Änderung einer Variable** neu bewertet; ein Element, dessen Aufbau nur an einer nie wahr werdenden Formel hängt, erscheint nie.

Ein „Weiter“ ohne wartenden Trigger macht nichts. „Nächste Folie“ ist nie implizit: Wenn kein Trigger auf „Nächste Folie“ zeigt, kann
die Folie nur auf anderen Wegen verlassen werden (zum Beispiel ein Button, der direkt zu „Nächste Folie“ führt).

### Darstellung der Linie

- **durchgezogen**: passiert von selbst (nach der Verzögerung),
- **gestrichelt**: wartet auf den Lernenden („Weiter“),
- eine Verzögerung steht als kleine Beschriftung an der Linie,
- **doppelt**: zwischen zwei Knoten gibt es zwei Trigger (siehe „Ein Knoten, mehrere Events“). Doppellinien haben keine
  Beschriftung: Sie sagen, dass hier mehr passiert, als die Linie zeigen kann – Verzögerungen stehen im Panel.

### Pflichtaufgaben: die Bedingungslinie

Eine Pflichtaufgabe (Quiz, Lückentext, Checker, Lösungswort, Matching, Sortierrätsel mit „Pflichtangabe“) ist **kein Trigger**: Sie löst „Nächste Folie“
nicht aus, aber „Nächste Folie“ muss auch auf sie warten - Weiter verlässt die Folie erst, wenn sie abgeschickt ist (die Aufbauten davor laufen
weiter). Das ist ein „und“, und kein Weg im Graphen. Deshalb ist sie eine eigene Darstellung:

- eine **gepunktete violette Linie** vom Ereignis „abgeschickt“ der Aufgabe zu „Nächste Folie“, das ein **Schloss** unter seinem Titel
  trägt (auf dem Schloss enden alle Linien; der Hinweis dazu steht dort, wenn man darüberfährt),
- mehrere Pflichtaufgaben laufen in dasselbe Schloss: ihre Linien werden vor „Nächste Folie“ zusammengeführt,
- sie ist **abgeleitet** (aus „Pflichtangabe“ im Panel der Aufgabe): Es wird nichts gespeichert, man kann sie nicht bearbeiten, und sie hat
  keinen Einfluss darauf, wo etwas im Graphen steht.

### Ein Knoten, mehrere Events

Ein Knoten im Graphen kann mehrere Events zeigen (**Begleiter**), um Platz zu sparen. Jedes ist ein Event für sich – mit eigener ID,
eigenen Triggern und eigenem Titel; sie teilen sich nur den Platz. Das wird beim Zeichnen **abgeleitet**, nicht gespeichert (keine
neuen IDs, keine Migration), und Autor:innen können nichts selbst bündeln. Nur bestimmte Event-Blöcke bilden Knoten mit mehreren
Events:

- **Video, Zeitmarke, die das Video anhält:** Sie hat das Event „Video läuft weiter“ (`video-resume:<Block>:<Zeitmarke>`, passiert,
  wenn die Lernperson das Video danach wieder abspielt). Es steht im Knoten der Zeitmarke, solange es nur den Abbau von Objekten
  auslöst, die dieselbe Zeitmarke erscheinen lässt, und jeder dieser Abbaue nur von ihm ausgelöst wird und selbst nichts auslöst.
  Dieser Abbau steht dann im Knoten des Aufbaus. Zwischen den beiden Knoten laufen dann zwei Trigger: eine Doppellinie.
- **Audio:** Ein Audio-Block (`AudioBlock`) hat dieselben Events wie ein Video, mit denselben IDs und Arten (`video-start:<Block>`,
  `video-stop:<Block>:<Zeitmarke>`, `video-resume:...`, `video-end:<Block>`) - der Präfix „video“ steht für „abspielbares Medium“. Nur
  die Titel heißen „Start des Audios“, „Audio läuft weiter“ und „Ende des Audios“. Er hat kein Bild: `appearance` ist `player`
  (der Player des Browsers) oder `hidden` (auf der Folie nichts zu sehen; es startet durch `autoplay` oder einen Trigger).
- Sobald etwas anderes angeschlossen wird – „Video läuft weiter“ löst etwas anderes aus, der Abbau wird noch von etwas anderem
  ausgelöst oder löst selbst etwas aus –, bekommen die Events wieder eigene Knoten, und die Linien laufen einzeln.

Ein Knoten zeigt das Icon seines ersten Events (der Titel des Icons nennt alle). Ein Klick darauf zeigt in der Seitenleiste alle seine Events untereinander. Die Schalterkurzform „verschwindet wieder,
wenn das Video weiterläuft“ am Trigger von der Zeitmarke zum Aufbau legt dafür den Abbau (falls das Objekt keinen hat: einen, der es
sofort ausblendet) und den Trigger von „Video läuft weiter“ an – alles normale Events und Trigger. Das Objekt kann wieder
erscheinen, wenn die Zeitmarke noch einmal erreicht wird. Der Player und der Export kennen keine Sonderfälle.

## 4. Feste Events

- **„Start der Folie“** gibt es immer, genau einmal, oben links. Es hat keine Eingangstrigger.
- **„Nächste Folie“** steht rechts und kann **mehrfach** vorkommen. Jedes dieser Events trägt seinen **eigenen Übergang** (Typ, Dauer,
  Richtung ...). Das ist eine Änderung gegenüber heute, wo der Übergang an der Folie hängt (`Page.transition`): Der Übergang wandert
  an das Event, die Daten werden migriert (siehe Abschnitt 8).
  Sind zwei „Nächste Folie“-Events gleichzeitig erreichbar, **gewinnt das erste**: Das Event sagt „jetzt geht es zu Folie X mit
  Übergang Y“, und alles, was danach ebenfalls zur nächsten Folie wollte, wird ignoriert. Das ist eine Eigenschaft des Übergangs, nicht
  des Events.

## 5. Event-Blöcke

Ein Block (Objekt auf der Folie) liefert dem Graphen:

- **seine Events** (ID, Titel, Icon, Typ),
- je Event, ob dessen Ausgangstrigger **nach rechts** abgehen dürfen. Falls nicht, gehen sie nach unten ab (so steht ein von einem
  Stopppunkt ausgelöstes Event unterhalb des Stopppunkts),
- **sein Innenleben**: die Position seiner Events innerhalb des Blocks und die Linien dazwischen. Beim Quiz zeichnet der Block die
  Aufspaltung von „Antwort wird abgegeben“ in „richtig“ und „falsch“. Beim Video positioniert der Block die Stopppunkte entlang einer
  Zeitachse.

Event-Blöcke gibt es auch, um die Logik zu vereinfachen: Was formal viele Events wären, darf der Block für Menschen lesbar
zusammenfassen. Ein Block mit Aufbau und Abbau (zum Beispiel ein Text) ist ebenfalls ein Event-Block mit null bis zwei Events.

### Von außen in den Block

Trigger dürfen **von außen auf Events innerhalb eines Blocks** zeigen und von dort nach außen führen. Für die Events in einem Block
gilt alles wie für andere Events.

### Duplikate: ein Event, mehrere Eingangstrigger

Ein logisches Event (zum Beispiel „Video startet“) mit mehreren Eingangstriggern darf der Block **mehrfach darstellen**, je einmal pro
Eingangstrigger. Beispiel: Das Video kann der Nutzer direkt starten (violett, der „native“ Eingang des Blocks) und eine Animation
startet es (blau, mit sichtbarem Eingangstrigger). Die Ausgangslinien der Kopien werden nach dem Block zusammengeführt.

Wichtig:

- **Gespeichert wird nur das logische Event.** Es gibt eine Liste von Eingangstriggern und eine Liste von Ausgangstriggern. Die Kopien
  sind abgeleitet.
- Der Block bekommt vom Graphen die **Liste der Eingangstrigger je Eingangspunkt** (Quelle und Art: Nutzer, Animation, Weiter ...)
  und entscheidet damit, wie viele Knoten er zeichnet.
- Wählt man eine der Kopien an, zeigt die Seitenleiste dasselbe logische Event.

### Gruppen

Eine Gruppe ist ein Event-Block mit eigenen Events („Gruppe erscheint“, „Gruppe verschwindet“). Die Aufbauten der Mitglieder sind
**explizite** Trigger, die der Block nach außen zu **einer** Linie zusammenfasst. So gibt es keine Events mal N im Graphen und
trotzdem keine impliziten Trigger.

### Listen

Ein Listen-Block (`ListBlock`) hat einen Aufbau wie jedes Objekt – oder, mit dem Schalter **„Jeder Listenpunkt einzeln“**, einen Aufbau
**pro Listenpunkt**. Dann hat die Liste als Ganzes kein Aufbau-Event, sondern jeder Punkt ein eigenes
(`list-item:<Block>:<Punkt>`, im Graphen „Listenpunkt n“), alle mit dem Effekt des Listen-Aufbaus. Neue Punkte (und alle beim
Einschalten) bekommen ihren Platz in der Weiter-Kette, einer nach dem anderen; Trigger und Reihenfolge sind danach im Graphen frei
änderbar. Der Abbau gilt immer für die ganze Liste. In einem Layout gibt es den Schalter nicht (es gibt dort keine Trigger).

### Buttons

Ein Button-Block liefert das nutzerseitige Event „Button geklickt“. Ein Button mit der Aktion „Nächste Folie“ ist damit ein Trigger
von „Button geklickt“ zu einem „Nächste Folie“-Event und im Graphen sichtbar. Ein Button kann die Eigenschaft „nur einmal klickbar“
haben.

### Logikblöcke

Ein Logikblock (`ScriptBlock`, `kind: "script"`) ist ein Objekt **nur auf Folien**, das JavaScript enthält. Im Editor ist er ein grünes
Sechseck mit Zahnrad, im Player unsichtbar. Er hat statt eines Aufbaus ein **eigenes grünes Event** (`script-run:<Block>`, im Graphen
„Logikblock“): Kommt ein Trigger dort an, läuft das Skript, und danach hat das Event stattgefunden und schickt seine Ausgangstrigger.
Beim Anlegen steht das Event wie ein Aufbau am Ende der Weiter-Kette (meist vor „Nächste Folie“); Auslöser und Platz sind frei
änderbar wie bei jedem Aufbau.

Im Skript stehen zur Verfügung:

- `vars`: die Variablen des Moduls **nach Namen** – `vars.score` liest, `vars.score = 3` schreibt (nicht bei berechneten Variablen).
- `debug(...)`: zeigt beim Abspielen etwas in einem kleinen Fenster über der Folie.
- `trigger(name)`: löst ein Event **dieser Folie** aus – `name` ist der **Titel** des Events im Graphen (Groß-/Kleinschreibung egal; es
  geht auch die Event-Id). Es braucht dafür keine Linie. Die Aktion des Events läuft (ein Aufbau erscheint, die Folie wird verlassen ...).
- `jump(folie, übergang?, optionen?)`: springt zu einer anderen Folie. `folie` ist ihre Nummer wie in der Seitenleiste (`"3"`,
  `"2.a.3"`), `übergang` ein Übergangstyp (`"fade"`, `"move"`, `"wheel"` ... – ohne Angabe ein harter Schnitt), `optionen` seine
  weiteren Felder (`durationMs`, `direction`, ...).
- `VanillaLM`: die Bibliothek der Lernplattform.
- `getBlock(name)`: der Block **dieser Folie** (auch des Layouts), der im Editor `name` heißt (Groß-/Kleinschreibung egal) - oder `null`, mit einem Hinweis im
  Debug-Fenster. Er hat `id`, `kind` und `name`. Ein **Quiz** hat zusätzlich `question` (reiner Text), `options` (`{id, index, text, correct, hidden}` in der
  gezeigten Sprache; `hidden`: ein Skript hat sie ausgeblendet), `correctOptions` und `wrongOptions` (bei einer offenen Frage gilt alles als richtig), `visibleOptions` (was noch da ist) sowie `hideOptions(welche)` und `showOptions()`:
  `welche` ist eine Liste von Antworten aus `options`, ihren Ids oder ihren Plätzen. Eine ausgeblendete Antwort behält ihren Platz, zeigt nichts, ist
  nicht anwählbar und nicht angekreuzt - der 50:50-Joker eines Quizspiels. Das Ausblenden gilt, bis die Folie verlassen wird.

Das Skript läuft ohne Schutz (`new Function`): wer es schreibt, muss wissen, was er tut. Ein Fehler erscheint im Debug-Fenster, das
Modul läuft weiter. Ein `jump` im Skript lässt das Event ohne Ausgangstrigger enden (die Folie ist ja nicht mehr da).

### Wer die Ereignisse einer Blockart beschreibt

Die Ereignisse, die eine Blockart der Folie von sich aus gibt - der Lauf des Skripts eines Logikblocks, der Klick auf einen Button, das Öffnen
des Fensters eines Revealers und der Klick auf dessen Button, die Punkte einer Liste mit Aufbau je Punkt, der Start, die Zeitmarken (mit dem
Weiterlaufen nach einer, die das Video anhält) und das Ende eines Videos oder einer Audiodatei -, stehen im **Deskriptor** der Art
(`events`, siehe `OwnEventSpec` in `src/core/blocks/types.ts`; die der Aufgaben - erste Antwort, abgeschickt, richtig, falsch - leitet die Registry
für jede Art mit `task` ab, die Wörter stehen in deren `TaskSpec`): die Id (`idPrefix`, dazu `:<Block>`, bei Punkten und Zeitmarken `:<Punkt>`, bei
Aufgaben `:richtig` / `:falsch`), was es im
Graphen des Players (`graphKind`) und in der Zeitleiste des Editors (`timelineType`) ist, ob ein Trigger es auslösen kann (`triggerable`), ob es
wie ein Aufbau in der Weiter-Kette steht (`inChain`), ob es statt des Aufbaus gilt (`replacesEntrance`), ob es in einer eigenen Zeile nach dem
Aufbau gezeichnet wird (`lane`), wann es das Ereignis gibt (`exists`, mit `onPage`: ein Block eines Layouts hat auf der Folie keine eigenen
Ereignisse) und seine Beschriftung im Graphen (`label`). Wie der Editor jede Ereignisart zeigt, die ein Eintrag geben kann, steht in `looks` (je `timelineType`:
der Standardtitel, der Hinweis der Seitenleiste für ein Ereignis, das nichts auslösen kann, und der Name des Symbols aus dem Satz des Editors,
`EventIconName`; die Registry gibt sie heraus: `eventLookOf`). Wer alle Ereignisse einer Folie aufzählt (`buildEventGraph`, die Zeilen und Knoten
der Zeitleiste in `pageTimeline.ts`, `ensureEffectTriggers`, die Prüfung, welche Ereignisse es gibt), fragt die Registry (`ownEventsOf`,
`replacesEntrance`), nicht die Art. Was ein Ereignis **tut** (ein Skript ausführen, einen Punkt zeigen), steht nur im Player - er hat für jede
`graphKind` eine eigene Behandlung -, und die Ids sind Teil der Datei: der Player bildet dieselben (ein Test sucht die Präfixe in ihm). Auch die
Zeilen von Video, Audio und Aufgabe in der Zeitleiste kommen aus den Ereignissen des Deskriptors: ein Eintrag mit `lane: "own"` steht in der Zeile seines
Blocks (Start, Zeitmarken mit dem Weiterlaufen danach, Ende - in der Reihenfolge, in der der Block sie gibt), `timeField` nennt das Feld der Zeitmarke, aus dem
die Zeit zur vorigen wird (die Linie ist dann „timed“, sonst gestrichelt), `label` die Worte des Knotens (bei einem Eintrag mit Punkten mit `item`) und `node`
was der Knoten sonst noch hat (die Zeitmarke: hält sie das Video an, welche Blöcke lässt sie erscheinen: `stopPointShownKinds`). Die Zeile einer Aufgabe
(`buildQuizLane`) nimmt die Ereignisse „erste Antwort“ und „abgeschickt“ (oder „richtig“ / „falsch“) der Registry; welche Zeilen es gibt - je Ausgang eine, wenn er
zu „Nächste Folie“ führt, sonst die eine schlichte - entscheidet `buildPageLanes` aus den Triggern der Folie. Titel und Symbol der Ereignisse, die zur Folie gehören und zu keiner Art - Aufbau und Abbau (eines Blocks und einer Gruppe), die drei
Aktionseffekte, die Bedingung einer Variablen - stehen in `src/core/blocks/pageEvents.ts` (`pageEventLooks`, dieselbe Form wie `looks`;
`eventLookOf` kennt sie). Auch die Farbe jeder Art (`color`; `triggeredColor`, wo sie anders ist, sobald ein Trigger zu ihr führt: der Start eines Videos ist
das Drücken von Play, violett, bis etwas ihn auslöst) und ob sie der Lernende macht (`byLearner`: ein Klick, eine Antwort - davon geht die
Erreichbarkeit im Graphen aus) steht dort; `buildGraphModel` (`eventGraph/model.ts`) liest beides aus `eventLookOf`. Auch Aufbau und Abbau selbst - die Ids
(`block-entrance:<Block>`, `block-exit:<Block>`, `group-entrance:<Gruppe>`, `group-exit:<Gruppe>`), was sie im Graphen des Players und in der
Zeitleiste sind, die Worte ihres Knotens (`EffectEventSpec`, `effectEventSpecs` in `pageEvents.ts`) und wann ein Block oder eine Gruppe sie hat
(`effectEventsOf`, `groupEffectEventsOf` in der Registry: nicht, wo der Effekt „aus“ ist, und der Aufbau eines Blocks nicht, wo ein eigenes Ereignis
des Blocks an seiner Stelle steht) - stehen an einer Stelle; `buildEventGraph` und `pageTimeline.ts` (die Knoten, `blockEventIds`,
`ensureEffectTriggers`, `TRIGGERABLE_EVENT_TYPES`) fragen sie. Was Aufbau und Abbau **tun**, steht nur im Player (`blockEffectEventId` bildet dieselben Ids
wie der Editor). Die Kurznamen, unter denen `weft edit` ein Ereignis kennt (`click:<Button>`, `entrance:<Block>`, `video-stop:<Video>:<Zeitmarke>`, `quiz-correct:<Quiz>` ...),
stehen als `cliAlias` am Eintrag (bei Aufbau, Abbau und Aktionseffekten in `pageEvents.ts`); `eventIdOfAlias` in der Registry macht aus Name und Rest die Id,
`eventId` in `cli/ops.ts` fragt sie. Nur die „Nächste Folie“ der Ausgänge einer Aufgabe (`quiz-correct-end`, `quiz-incorrect-end`) kennt `cli/ops.ts` selbst; die
Namen stehen in `docs/operations.md` und `.en.md` (ein Test prüft es). Ebenso die Aktionseffekte eines Blocks
(`actionEventSpec`: `block-action:<Block>:<Effekt>`, nur auf einer Folie, die Art in der Zeitleiste je nach Effekt, in der Registry `actionEventsOf`) und die
Bedingungen einer Folie (`conditionEventSpec`: `condition:<Ereignis, das sie auslöst>`, ein Ereignis, das der Player eintreten lässt, wenn die Formel wahr
wird; kein Trigger kann es auslösen). Die Ereignisse, die ein Ziehen im Graphen umordnen kann, nennt `isReorderableEventId`. Was die Aktionen **tun** (der Block
bewegt, schüttelt, blinkt) und wie der Player eine Bedingung prüft, steht nur im Player; wo ein Aktionseffekt in der Kette steht (zwischen Aufbau und Abbau
seines Blocks), regelt `pageTimeline.ts`.

## 6. Layout

Die Anordnung folgt der zeitlichen Ordnung:

- Spalten ergeben sich aus der Tiefe (längster Weg vom Start), Zeilen aus Verzweigungen.
- **Ausgangstrigger** gehen von einem Event nach **rechts**, ist rechts schon besetzt, nach **unten**. **Eingangstrigger** kommen von
  **links** oder von **oben**.
- Wo eine Linie nicht klar nach rechts oder unten führen kann – ein Rücksprung, oder eine Zusammenführung, bei der die zweite Linie
  von unten käme –, gilt die **45°-Regel**: Die Linie geht im 45°-Winkel nach oben rechts bzw. unten rechts ab, hat eine
  Deckkraft von 0,5, verläuft als gerundete Linie **hinter** allen anderen Linien und Knoten durch den Graphen und kommt im
  45°-Winkel von oben links bzw. unten links an ihrem Ziel an.
- Bei einem Event-Block ordnet der Block sein Inneres selbst an. Außerhalb liegende Events, die von einem Event des Blocks ausgelöst
  werden, stehen rechts oder, wenn der Block das für dieses Event verbietet, darunter.

## 7. Seitenleiste

Wählt man ein Event, zeigt die rechte Seitenleiste:

- **Wird ausgelöst durch**: eine Liste aller Eingangstrigger (jeweils Quelle, Verzögerung, Weiter),
- **Löst aus**: eine Liste aller Ausgangstrigger,
- den **Titel** (überschreibbar),
- die Eigenschaften der Aktion (zum Beispiel Animationsart und Dauer beim Aufbau),
- bei unerreichbaren Events eine **Warnung**.

Hover: Das Event und seine Ein- und Ausgangslinien werden hervorgehoben, der Rest wird abgedunkelt; dasselbe, wenn man in der
Seitenleiste über einen Trigger fährt.

### Bearbeiten im Graphen

Die Reihenfolge von Animationen auf einer waagerechten Linie lässt sich per Drag & Drop ändern, **nur für lineare Ketten** (jeder
Knoten hat in der Kette genau einen Eingang und einen Ausgang). Beim Umsortieren bleiben die Trigger-Eigenschaften (Verzögerung,
Weiter) **an der Position**, die Events wandern: Aus A –Weiter→ B –Weiter→ C wird durch Ziehen von C vor B die Kette A –Weiter→ C
–Weiter→ B. Verzweigungen und Zusammenführungen werden in der Seitenleiste bearbeitet.

## 8. Daten

Gespeichert wird **nur das, was nicht aus den Blöcken folgt**:

- die Liste der **Trigger** `{ id, von, nach, Verzögerung, Weiter }`,
- die **„Nächste Folie“-Events** (jedes mit Übergang und optionalem Titel),
- **Titel-Überschreibungen** einzelner Events,
- die **Bedingungen** `conditions` (Event-ID `condition:<Ziel-Event>` → Formel) der Quelle „Variable“; sie gehen, sobald kein Trigger mehr von ihnen ausgeht.

Die Events, die Blöcke liefern (Aufbau, Abbau, Video, Quiz ...), sind abgeleitet; ihre IDs sind stabil (aus der Block-ID gebildet).
**Implizite Trigger gibt es nicht mehr**: Alles, was heute im Quiz-Panel („Weiter zur nächsten Folie“) oder in der Warteschlangenlogik
(„Weiter hängt an das Ende der Kette“) verborgen ist, wird zu einem expliziten Trigger.

### Migration aus dem heutigen Modell

Eine einmalige, deterministische Umwandlung beim Laden einer Datei:

| Heute | Neu |
| --- | --- |
| `page.timeline.triggerEdges[ziel] = { from, kind: "timed", delayMs }` | Trigger `{ von: from, nach: ziel, Verzögerung: delayMs, Weiter: nein }` |
| `… kind: "advance"` | Trigger `{ …, Weiter: ja }` |
| Aufbau ohne eigene Kante, am Ende der Weiter-Kette (`computeImplicitEntranceChain`) | explizite Weiter-Kette entlang der Block-Reihenfolge |
| „Nächste Folie“ mit Standard `getEndTrigger` | ein Trigger vom Ende der Kette (Weiter: ja) zu einem „Nächste Folie“-Event |
| „Nächste Folie“ = „Gar nicht“ | kein Trigger auf „Nächste Folie“ |
| `QuizBlock.advanceOnCorrect` / `advanceOnIncorrect` | Trigger von „richtig“ / „falsch“ (Verzögerung 1500 ms, Weiter: nein) zu je einem eigenen „Nächste Folie“-Event |
| `Page.transition` | Übergang jedes „Nächste Folie“-Events dieser Folie |
| `VideoBlock.autoplay` | Trigger vom Start der Folie (0 ms) zu „Video startet“; sonst startet es nur der Nutzer |
| `AudioBlock.autoplay` | dasselbe für „Start des Audios“ |

Die Änderung des Weiter-Verhaltens (ein Druck löst alle wartenden Trigger aus, statt einen aus einer Warteschlange) betrifft nur
Module, in denen zwei Aufbauten **ausdrücklich** beide direkt am selben Ereignis hängen und auf Weiter warten. Die Migration
erzeugt für die bisherigen impliziten Ketten ausdrücklich Ketten (A → B → C), das Verhalten bleibt dort gleich.

## 9. Player

Der Editor **kompiliert** den Graphen einer Folie beim Export in eine einfache Struktur, die der Player nur ausführt:

```
events:   [{ id, aktion }]          // aktion: was passiert, wenn das Event ausgelöst wird (zeigen, verstecken, abspielen,
                                    // Folie verlassen mit Übergang ...), oder keine
triggers: [{ id, von, nach, verzögerung, weiter }]
```

Der Player enthält keine Logik mehr zu impliziten Defaults, Ketten oder Warteschlangen. Dass diese Logik bisher zweimal von Hand
gepflegt wurde (im Editor und im Player), war eine Fehlerquelle.

Ausführung: Ein Event, das passiert, stellt alle seine Ausgangstrigger zu. Ein Trigger mit „Weiter“ wartet, bis „Weiter“ kommt
(einmal pro Wartezeit, nicht gezählt), und läuft dann wie jeder andere: nach der Verzögerung passiert das Ziel (seine Aktion läuft,
und wenn sie fertig ist – bei einer Animation nach ihrer Dauer –, passiert das Event im Sinne der Ausgangstrigger).

## 10. Offene Punkte

- **Titel eines Events in einer Folie mit Sprachen**: Sind überschriebene Titel übersetzbar? Für die erste Stufe ein Text pro Event.
- **Variablen als Events** („Variable x ändert sich“) und **UND-Verknüpfungen** sind ausdrücklich nicht Teil dieses Konzepts. Sie
  werden später als eigene Logik-Events hinzukommen.
- **Event-Blöcke in Layouts**: Layouts haben bisher keinen Event-Graphen. Das bleibt so.
- **Weiter-Taste mit nichts Wartendem** auf einer Folie ohne „Nächste Folie“-Trigger: tut nichts (wie heute bei „Gar nicht“).

## Umsetzungsstufen

1. **Kern und Player. (umgesetzt)** Neues Modell (`core/eventGraph/`), Ableitung des Graphen aus dem heutigen gespeicherten Modell
   (`buildEventGraph`), Kompilierung für den Player (`toRuntimeModule` legt `page.graph` ab); der Player führt nur noch aus
   (`setUpGraph`, `happened`, `deliver`, `weiter` in `player.runtime.js`). Gespeichert wird noch wie bisher, nach außen ändert
   sich nichts außer dem Weiter-Verhalten (siehe Abschnitt 3): Ein Druck löst jetzt alle wartenden Trigger aus.
2. **Speichern im neuen Modell** und Migration (Abschnitt 8); „Nächste Folie“-Events mit eigenem Übergang. **(umgesetzt, Dateiformat 4)**
   Gespeichert werden `page.timeline.triggers` (Trigger mit `weiter`) und `page.timeline.ends` (Übergang je „Nächste Folie“);
   `Page.transition` und die Quiz-Flags `advanceOnCorrect`/`advanceOnIncorrect` gibt es nicht mehr. Die Migration beim Öffnen einer
   älteren Datei (`io/legacyEventGraph.ts`) schreibt alle bisherigen Defaults als explizite Trigger aus. Neue Aufbauten/Abbauten
   bekommen ihren Trigger beim Wählen des Effekts (`syncPageTimelineEvents`: Weiter am Ende der Kette, „Nächste Folie“ bleibt das
   letzte Glied); wird ein Block gelöscht, überbrückt `syncPageTimelineEvents` die Kette. Im Editor wird weiter genau ein Trigger je
   Event bearbeitet; das Modell erlaubt mehrere (Stufe 4).
3. **Neuer Graph**: Layout, SVG-Darstellung, Event-Blöcke, Hover. **(umgesetzt)** `features/editor/eventGraph/layout.ts` ordnet die
   Events (Spalte = längster Weg vom Start, Zeile = Verzweigung, „Nächste Folie“ in der letzten Spalte), `Timeline.tsx` zeichnet
   sie als SVG-Linien mit abgerundeten Ecken und die Rücksprünge / Zusammenführungen von unten als blasse 45°-Umwege hinter allem.
   Farben nach Typ (blau, gelb, violett, rot für unerreichbare Events), Hover hebt ein Event und seine Linien hervor. Quiz und
   Video sind Event-Blöcke (gemeinsamer Rahmen; Stopppunkte lassen ausgelöste Events nach unten gehen). **Noch offen aus dem
   Konzept:** Gruppen und Buttons als Event-Blöcke (dafür fehlen noch deren Events im Datenmodell), Titel-Überschreibung pro Event.
4. **Seitenleiste** (Ein-/Ausgangstrigger-Listen, Titel, Warnung). **(umgesetzt)** `EventPanel.tsx`: Titel (überschreibbar,
   `page.timeline.titles`), „Wird ausgelöst durch“ und „Löst aus“ als Listen (Quelle bzw. Ziel, Verzögerung, „wartet auf Weiter“,
   Entfernen, Hinzufügen), Warnung bei unerreichbaren Events. Ein Aufbau/Abbau bekommt seinen Platz in der Weiter-Kette einmal, wenn
   der Effekt gewählt wird (`ensureEffectTriggers`); nimmt man ihm später den Trigger, bleibt er ohne und ist rot. Das
   Block-Panel bearbeitet weiter nur den ersten Trigger.
5. **Animationen** (Verschieben, Erscheinen, Linien einzeichnen) und **Drag & Drop** in linearen Ketten. **(umgesetzt)** Events
   gleiten bei Änderungen an ihren neuen Platz (`useAnimatedPositions`, 280 ms), ein neues Event wächst ins Bild, ein neuer Trigger
   wird von der Quelle zum Ziel gezeichnet; bei „reduzierte Bewegung“ und beim Seitenwechsel gibt es keine Animation. Animationen
   einer linearen Kette (`core/eventGraph/chains.ts`) lassen sich entlang der Linie ziehen (`reorderChain`): Verzögerungen und
   „Weiter“ bleiben an der Position, die Events wandern; ein Zug ist ein Rückgängig-Schritt.

6. **Gruppen und Buttons als Event-Blöcke. (umgesetzt, Dateiformat 5)**
   - Ein Button liefert das Event „Button geklickt“ (`button-click:<id>`, violett). Die Aktion „Nächste Folie“ gibt es nicht mehr:
     `ButtonBlock.action` ist `advance` (Weiter), `prev` oder `event` (der Klick ist nur das Event); wird ein Button zu `event`, legt
     der Editor einen Trigger zum „Nächste Folie“-Event an, den man im Graphen ändern oder entfernen kann. Migration: `next` wird
     zu `event` mit diesem Trigger. Ein Button im Layout bekommt den Trigger im Export (er lässt sich pro Folie nicht speichern).
   - Eine Gruppe kann einen Aufbau/Abbau als Ganzes haben (`BlockGroup.entranceEffect/exitEffect`): ein Event
     (`group-entrance:<id>`, `group-exit:<id>`), das die Aufbauten der Mitglieder über explizite Trigger (0 ms, ohne Weiter) auslöst.
     Der Graph fasst diese Mitglieder-Events zu dem einen Gruppen-Event zusammen, solange sie nur von der Gruppe ausgelöst werden.
     Für eine ältere Gruppe ohne eigenen Effekt zeigt das Panel den ersten Mitglied-Effekt; die erste Änderung macht ihn zum
     Gruppen-Effekt und nimmt die Mitglieder aus der Weiter-Kette (an deren Ende das Gruppen-Event tritt).
   - Ein **Revealer** (`RevealerBlock`: Icon, Farbe, Überschrift, optional Text, Bild und Button) hat zwei Events:
     „Revealer öffnet sich“ (`revealer-open:<id>`, passiert, sobald sein Fenster aufgeht - durch einen Klick auf das Icon oder durch
     einen Trigger; er ist ein auslösbares Ziel, das Fenster öffnet sich also auch ohne Klick) und - nur mit Button -
     „Button im Revealer geklickt“ (`revealer-button:<id>`, wie `button-click`; der Button ist erst da, wenn das Fenster offen ist, deshalb läuft eine gestrichelte Linie vom Öffnen zu diesem Klick: eine Lane wie beim Quiz von der ersten Antwort zum Abschicken). Hat der Revealer einen Aufbau, steht dessen Event („Revealer erscheint“) davor: Das Icon lässt sich erst öffnen, wenn es da ist. Was der Button tut (`button.action`, `onClick`,
     `targetPageId`), wird wie bei einem Button-Block gewählt. Die Icon-Farbe (weiß oder schwarz) folgt dem Kontrast zur Farbe.
   - Ein Element kann **Aktionseffekte** haben (`Block.actionEffects`): zwischen Aufbau und Abbau bewegt es sich zu einem Punkt (und dreht
     sich dabei), schüttelt sich einmal oder blinkt einmal. Jeder ist ein Event (`block-action:<Block>:<Effekt>`, Knotentypen
     `block-action-move`/`-shake`/`-blink`, gelb) mit eigenem Trigger. Ein neuer Effekt wird standardmäßig mit **Weiter** ausgelöst, ohne
     Verzögerung, und sortiert sich in die Kette ein: nach dem, was das Element zuletzt tat (Aufbau oder voriger Effekt) und vor dem, was
     dort auf Weiter wartete - auch vor dem Abbau des Elements; kommt ein Aufbau/Abbau später dazu, tritt er vor die Effekte bzw. hinter
     sie. Ein Effekt, der vor dem Aufbau oder nach dem Abbau seines Elements passieren kann (beurteilt nach der Kette der Auslöser, nicht
     nach der Zeit), ist **rot** und trägt eine Warnung; die Auswahl seines Auslösers führt solche Quellen gar nicht erst auf, und im
     Graphen wird ein Ziehen, das ihn so verschieben würde, abgewiesen. Der Player führt Bewegung und Drehung mit den CSS-Eigenschaften
     `translate`/`rotate` aus (sie stören `transform` von Drehung/Aufbau/Abbau nicht); eine Bewegung bleibt (das nächste Ereignis beginnt
     dort). Der Weg einer Bewegung wird
     auf der Folie wie ein Pfeil gezeichnet (`ActionEffect.path`: Versätze vom Startpunkt in Prozent der Folie; Zwischenstationen,
     durch die eine Kurve läuft; am Ende ein roter Punkt); `easing` ist eine CSS-Timing-Funktion, `rotation` die Drehung in Grad.
   - Der Graph zeigt jetzt jeden gespeicherten Trigger (vorher nur den ersten eines Events).
