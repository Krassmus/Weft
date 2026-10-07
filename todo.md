## Dateien

Weft sollte einen weiteren Element-Typ bekommen, der Dateien heißt. Man kann damit eine oder mehrere Dateien bereitstellen, die die Rezipienten des Moduls herunterladen können.
Diese Dateien können optional über ein Passwort abgesichert werden. Erst wenn der Rezipient ein Passwort eingibt, werden die Dateien angezeigt. Die Dateien sind dabei wirklich verschlüsselt im Lernmodul abgelegt. Sie sind dabei AES-verschlüsselt. Das heißt, ohne das Passwort kommt man an die Dateien auch nicht dann ran, wenn man die .weft.zip Datei als ZIP öffnet und die Ordner durchschaut nach den Rohdateien. Man braucht dann trotzdem noch das Passwort. Aber die Metadaten wie Dateiname, Typ, Größe und so weiter stehen in den Metadaten der Folien und werden nicht verschlüsselt.

## Player-Export

Man exportiert eine Weft-Datei oder .weft.zip, die keine Metadaten enthält und demnach auch von Weft nicht bearbeitet werden kann. Aber wenn Weft sie öffnet, soll Weft das index.html abspielen. In dem Modus sind dann die Controls des Editors komplett verschwunden. Man sieht eigentlich nur ein Fenster mit schwarzem Rahmen, das das Lernmodul auf der ersten Seite anzeigt. Mit einem Button im schwarzen Rand kann man den Vollbildmodus triggern.

## Moderatornotizen

# Fragen

Soll bei VanillaLM neben der background-color auch eine outside-color definiert werden, die dann die Farbe der schwarzen Ränder definiert? Die background-color ist ja eigentlich eine Information über die Hintergrundfarbe des Inhaltes. Andererseits sollte die Outside-Color immer Schwarz sein, wenn das Modul im Vollbildmodus bzw. auf dem Beamer gezeigt wird.