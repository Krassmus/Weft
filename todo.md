## Bilderquiz

## Lernkarten

## Tutorial über Zusammenarbeit in Weft

## Musikplaylist

In Weft soll eine Playlist von Audiodateien eingebaut werden, die nicht an bestimmte Folien geknüpft ist. Sie soll sich komplett unterscheiden von den Audio-Blöcken. Die Playlist ist eine geordnete Liste von Audiodateien. Und wenn sie einmal gestartet ist, dann läuft sie automatisch weiter von Lied zu Lied. Aber sie kann gesteuert werden von Buttons und anderen Ereignissen auf Folien. Zusätzlich kann man zu Songs in die Playlist Steuerblöcke einbauen. Mit diesen kann zum Beispiel eine Playlist wieder von vorne neu starten, indem ein Steuerblock sagt "Spiele jetzt Song 1". So bekäme man eine sich wiederholende Playlist. Diese Playlist kann man in den Eigenschaften des Moduls anlegen. Ein Song auf der Playlist stoppt nicht, wenn es einen Folienübergang gibt, es sei denn auf der nächsten Folie triggert ein Event, das die Playlist stoppen lässt.

## Timeline

Es soll ein neuer Präsentations-Block-Typ gebaut werden, der zeitliche Ereignisse in einer Linie darstellt. Man kann verschiedene Zeitpunkte eingeben und mit einem Titel versehen. Die Linie ist einstellbar als horizontal oder vertikal verlaufend. Wenn das Lernmodul abgespielt wird, soll jedes Ereignis nacheinander durch "Weiter" ausgelöst angezeigt werden, sodass der Zeitstrahl sich immer weiter verbreitet. Nach jedem "Weiter" kann man ein Event im Event-Graphen triggern, wodurch vielleicht ein Bild erscheint oder so. Das ist vielleicht so ähnlich wie beim Video-Block mit den Zeitmarken. Die Ereignisse sollen in Relation zueinander dargestellt werden, sodass zwei nahe beieiander befindliche Ereignisse auch im Zeitstrahl nahe beieinander stehen sollen.

## Inhaltsverzeichnis

## Plugins

Es soll jetzt noch einen Pluginschnittstelle für Weft gebaut werden. Ein Plugin ist eine Datei mit .weftplugin, die ein ZIP ist mit Metadaten drin. Grundsätzlich ist die Hauptaufgabe eines Plugins, dass ein weiterer Block hinzugefügt werden kann zu der Folie. Theoretisch könnte es in der Zukunft aber noch andere Aufgaben geben, die ein Plugin erfüllt wie einen besonderen Folienübergang bereitstellen oder anderes.

# Offene Fragen generell

Soll bei VanillaLM neben der background-color auch eine outside-color definiert werden, die dann die Farbe der schwarzen Ränder definiert? Die background-color ist ja eigentlich eine Information über die Hintergrundfarbe des Inhaltes. Andererseits sollte die Outside-Color immer Schwarz sein, wenn das Modul im Vollbildmodus bzw. auf dem Beamer gezeigt wird.


# Pro-Features

* TURN-Server
* Umfrage-Engine auf externem Server
* Gemeinsames Brainstorming-Tool auf externem Server


Farbcodes von ChatGPT

Blau → Ablauf
Violett → Benutzer
Grün → Entscheidung
Gelb → visuelle Veränderung
Cyan → Medien
Orange → Logik/Script
1. 🔵 Ablauf
2. 🟣 Interaktion
3. 🟡 Animation
4. 🟢 Bedingung
5. 🩵 Medien

Navigation      #4D8DFF  ████
Interaktion     #A66CFF  ████
Animation       #F5B83D  ████
Bedingung       #42C98A  ████
Medien          #42B8D4  ████












