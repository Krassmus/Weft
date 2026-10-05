## Mehr Animationen (Aufbau)
- 


## Dateien

Weft sollte einen weiteren Element-Typ bekommen, der Dateien heißt. Man kann damit eine oder mehrere Dateien bereitstellen, die die Rezipienten des Moduls herunterladen können.
Diese Dateien können optional über ein Passwort abgesichert werden. Erst wenn der Rezipient ein Passwort eingibt, werden die Dateien angezeigt. Die Dateien sind dabei wirklich verschlüsselt im Lernmodul abgelegt. Sie sind dabei AES-verschlüsselt. Das heißt, ohne das Passwort kommt man an die Dateien auch nicht dann ran, wenn man die .weft.zip Datei als ZIP öffnet und die Ordner durchschaut nach den Rohdateien. Man braucht dann trotzdem noch das Passwort. Aber die Metadaten wie Dateiname, Typ, Größe und so weiter stehen in den Metadaten der Folien und werden nicht verschlüsselt.

## Player-Export

Man exportiert eine Weft-Datei oder .weft.zip, die keine Metadaten enthält und demnach auch von Weft nicht bearbeitet werden kann. Aber wenn Weft sie öffnet, soll Weft das index.html abspielen. In dem Modus sind dann die Controll des Editors komplett verschwunden. Man sieht eigentlich nur ein Fenster mit schwarzem Rahmen, das das Lernmodul auf der ersten Seite anzeigt. Mit einem Button im schwarzen Rand kann man den Vollbildmodus triggern.

## Moderatornotizen



## Weitere Seitenverhältnisse

Oben links in den Einstellungen kann man das Seitenverhältnis des Lernmoduls einstellen. Dort fehlt noch die Möglichkeit, eine typische Mobilansicht "9:16 (Smartphone)" zu erzeugen. Und wem das nicht reicht, der soll die Möglichkeit bekommen, ein Seitenverhältnis völlig frei zu definieren. Es wird eine weitere Option "Anderes Verhältnis" angeboten, mit dem man zwei beliebige Zahlen angeben kann. Daneben soll schematisch gezeigt werden, wie das Seitenverhältnis dann aussehen würde.



