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
| Typ | bestimmt die Farbe: **blau** `#4D8DFF` Standard, **gelb** `#F5B83D` Animation, **violett** `#A66CFF` Nutzerinteraktion |
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

Ein „Weiter“ ohne wartenden Trigger macht nichts. „Nächste Folie“ ist nie implizit: Wenn kein Trigger auf „Nächste Folie“ zeigt, kann
die Folie nur auf anderen Wegen verlassen werden (zum Beispiel ein Button, der direkt zu „Nächste Folie“ führt).

### Darstellung der Linie

- **durchgezogen**: passiert von selbst (nach der Verzögerung),
- **gestrichelt**: wartet auf den Lernenden („Weiter“),
- eine Verzögerung steht als kleine Beschriftung an der Linie.

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

### Buttons

Ein Button-Block liefert das nutzerseitige Event „Button geklickt“. Ein Button mit der Aktion „Nächste Folie“ ist damit ein Trigger
von „Button geklickt“ zu einem „Nächste Folie“-Event und im Graphen sichtbar. Ein Button kann die Eigenschaft „nur einmal klickbar“
haben.

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
- **Titel-Überschreibungen** einzelner Events.

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
4. **Seitenleiste** (Ein-/Ausgangstrigger-Listen, Titel, Warnung).
5. **Animationen** (Verschieben, Erscheinen, Linien einzeichnen) und **Drag & Drop** in linearen Ketten.
