# Weft für KI-Assistenten (MCP)

Der MCP-Server `weft-mcp` gibt einem KI-Assistenten (Claude Desktop, Claude Code, ChatGPT-Anbindungen mit MCP ...) dieselben Möglichkeiten wie das [Kommandozeilenwerkzeug](cli.md): ein Lernmodul lesen, prüfen, übersetzen und ändern. Die Änderungen sind die Aktionen des Editors, ausgeführt auf der Datei - das Ergebnis ist, was der Editor gemacht hätte.

## Einrichten

```bash
npm install
npm run build:cli      # baut cli/dist/weft-mcp.mjs
```

In der Konfiguration des Clients (bei Claude Desktop `claude_desktop_config.json`, bei Claude Code `claude mcp add`):

```json
{
  "mcpServers": {
    "weft": {
      "command": "node",
      "args": ["/Pfad/zu/Weft/cli/dist/weft-mcp.mjs"]
    }
  }
}
```

Der Server spricht MCP über Standard-Ein-/Ausgabe, braucht kein Netz und nichts außer Node 22.

## Die Werkzeuge

| Werkzeug | Wofür |
|---|---|
| `weft_inspect` | Gliederung eines Moduls; mit `page` eine Folie ausführlich (Positionen, Effekte, Ereignisse, Auslöser) |
| `weft_validate` | Prüfung mit Codes und Hinweisen (kaputte Verweise, Ereignisse die nie passieren, unbekannte Variablen ...); mit `layout` auch, ob der Inhalt in seinen Kasten passt |
| `weft_schema` | Das Dateiformat: Arten von Blöcken, die Felder einer Art oder Definition |
| `weft_text_export` / `weft_text_import` | Texte als flache Liste zum Übersetzen und zurück in ein neues Modul |
| `weft_render` | Folien als Bild (PNG), wie der Player sie zeigt - der Assistent sieht sein Ergebnis |
| `weft_play` | Das Modul wie eine Lernperson durchspielen (weiter, ankreuzen, abschicken, ausfüllen): nach jedem Schritt in Worten, was sich geändert hat, dazu Bilder |
| `weft_new` | Ein neues leeres Modul |
| `weft_edit` | Änderungen als Liste von Operationen (alles oder nichts) |
| `weft_operations` | Beschreibung der Operationen mit Beispiel |

## Wie Änderungen geschrieben werden

- **Das Original bleibt unverändert.** `weft_edit` schreibt in eine Arbeitskopie `<name>.ai.weft` neben der Datei und nennt den Pfad im Ergebnis. Mit dieser Kopie arbeitet man weiter (`weft_edit` auf `….ai.weft` ändert die Kopie selbst). Ein anderes Ziel: `output`.
- **Alles oder nichts.** Schlägt eine Operation fehl, wird nichts geschrieben. Das Ergebnis jeder Operation (mit Ids) steht in der Antwort; mit `"as": "name"` vergibt eine Operation einen Namen, den spätere als `"$name"` benutzen können.
- **Erzeugen die Änderungen Fehler** (zum Beispiel ein Button, der auf eine Folie springt, die es nicht gibt), wird ebenfalls nichts geschrieben, und die Antwort sagt, welche. `allow_errors` schreibt trotzdem.
- `dry_run` prüft nur und schreibt nichts.
- Eine so geschriebene Datei hat keinen Editierverlauf und kein Abspiel-HTML mehr (beides beschreibt den alten Stand); Weft legt beides beim nächsten Speichern neu an. Wer die Datei zusammen mit anderen live bearbeitet hat, sollte die Kopie wie eine neue Datei behandeln.

## Ein Ablauf

1. `weft_inspect` - verstehen, was da ist.
2. `weft_schema <Art>` - nachlesen, wie ein Block aussieht, bevor man einen schreibt.
3. `weft_edit` mit einer Liste von Operationen.
4. `weft_validate` auf der Arbeitskopie; Meldungen beheben (wieder mit `weft_edit`).
5. `weft_render` auf den neuen Folien: ansehen, ob es so aussieht, wie gedacht, und nachbessern.

Beispiel für „baue ein kleines Rätsel mit Schlüssel":

```json
[
  {"op": "add_variable", "name": "schluessel", "type": "boolean"},
  {"op": "add_page", "as": "raum"},
  {"op": "add_block", "page": "$raum", "kind": "button",
   "set": {"text": "Schlüssel nehmen", "action": "event",
           "onClick": [{"variableId": "schluessel", "op": "set", "value": true}]}},
  {"op": "add_page", "as": "tuer"},
  {"op": "add_jump_page", "after": "$raum",
   "targets": [{"page": "$tuer", "condition": {"variable": "schluessel", "comparator": "eq", "value": true}}]}
]
```

Wichtig zum Aufbau: Eine Sprung-Folie führt zu einer Folie, danach läuft die Folge hinter **dieser** Folie weiter. Für Wege, die sich wieder treffen, `add_logic` (Verzweigung) benutzen.

## Grenzen

- Bilder, Videos und Audiodateien kommen von der Festplatte (`add_image`, `add_video`, `add_audio`, `add_asset`, `set_media` - nur Dateien dieser Arten, nichts anderes). Schriften lassen sich damit nicht hinzufügen (das geht im Editor). Videos werden nicht umgewandelt: Das Format muss für die Browser passen (H.264 in mp4, oder WebM); bei anderen Kodierungen (HEVC, ProRes ...) gibt es eine Warnung. Ist `ffprobe` installiert, wird die Größe des Videos gelesen; sonst gilt 16:9. Ein Audio-Block (`add_audio`: `autoplay`, `loop`, `appearance` = `player` oder `hidden`) hat dieselben Zeitmarken und Events wie ein Video, nur kein Bild.
- `weft_validate` prüft nur die Struktur (ob ein Block außerhalb der Folie liegt, ja; ob Text aus seinem Kasten läuft oder sich Blöcke überlappen, nein). Dafür gibt es `weft_render`: das Bild der Folie ansehen und danach `weft_edit`.
- `weft_render` braucht einen installierten Chrome, Chromium, Edge oder Brave (sonst Pfad in `WEFT_CHROME`). Es zeichnet mit dem Player des Moduls; eingebettete Seiten (iframe) erscheinen, wenn sie erreichbar sind.
- Der Server verändert nur Dateien, die man ihm nennt (Quelle lesen, Ziel schreiben); eine vorhandene Zieldatei überschreibt er nicht (außer der Arbeitskopie `….ai.weft`).

## Ausblick: was noch fehlt, und warum

Stand: Der Server funktioniert, aber er ist ein Werkzeug für Leute, die das Repo bauen können. Für „jemand lädt die App herunter und die KI kann sie steuern" fehlt noch einiges. Hier steht, was es ist und was wir dabei überlegt haben.

**Heute nötig, damit ein Assistent mit Weft arbeitet**
- Node 22, der gebaute Server (`npm run build:cli`; er liest die Schriften aus `public/fonts` des Repos) und ein Eintrag in der Client-Konfiguration.
- Für `weft_render` ein installierter Chrome, Chromium, Edge oder Brave.
- Nichts davon steckt in der App. Wer sie nur herunterlädt, hat den MCP-Server nicht.

**iPad**
- Dort geht es nicht: kein Node, kein Chrome, und eine App kann eine andere nicht steuern. Eine KI in einer Chat-App auf dem iPad kann die Weft-App nicht bedienen. Ein Mensch müsste Bilder kopieren oder exportieren.
- Die App hat „Exportieren als PDF…", dessen Seiten eine KI als Bilder lesen kann (gezeichnet mit html2canvas, also nicht überall genau wie im Player). Einen Export einzelner Folien als PNG oder „Folie als Bild kopieren" gibt es noch nicht; die Zeichnung steckt schon in `src/features/editor/exportPdf.tsx`.
- Sauber wäre es, dass die KI auf einem Mac oder Server arbeitet und das iPad nur das Bearbeitungsgerät ist, über eine Datei in der Cloud oder über die Live-Zusammenarbeit.

**Verteilen**
- **Mac App Store:** Apps dort laufen in einer Sandbox. Ein Hilfsprogramm darin darf nicht beliebige Dateien lesen und schreiben, die ihm die KI nennt. Der MCP-Server würde nur in freigegebenen Ordnern funktionieren. Besser passt ein Vertrieb außerhalb des Stores (notarisierte App, Download).
- **Als Claude-Desktop-Erweiterung verpacken** (`.mcpb`, ein Doppelklick): Nach unserem Kenntnisstand bringt Claude Desktop dafür eine eigene Node-Laufzeit mit, der Nutzer bräuchte kein Node. Server und Schriften würden in einer Datei gebündelt. Das Format vor dem Bauen gegen die aktuelle Doku prüfen. Das ist der kleinste Schritt mit dem größten Gewinn.
- **Seite „KI-Anbindung" in den Einstellungen:** erklärt, was möglich ist, zeigt den fertigen Konfigurationsausschnitt (oder den Befehl für Claude Code) zum Kopieren und prüft, ob ein Chrome da ist.
- **Als eigenständiges Programm mit der App ausliefern** (ohne Node), falls auch andere Clients als Claude Desktop bedient werden sollen. Das Desktop-Programm von ChatGPT kann lokale MCP-Server nur eingeschränkt, Web-Chats gar nicht; für diese bräuchte es einen Server im Netz mit einer eigenen Sicherheitsüberlegung.

**Zeichnen ohne Chrome**
- Die App selbst könnte als Zeichner dienen (ein Befehl, der die Folie in der eigenen Webansicht headless zeichnet). Das wäre die Lösung für Macs ohne Chrome, ist aber deutlich mehr Arbeit.

**Die KI als Teilnehmerin der Live-Zusammenarbeit**
- Ein Programm auf einem Mac oder Server tritt per Einladungslink bei, bearbeitet das Modul mit denselben Operationen und zeichnet die Folien selbst. Der Mensch sieht die Änderungen live, ohne etwas auszulösen (auch auf dem iPad). Dazu bräuchte es das Beitreten ohne Browser (WebRTC in Node oder über den Sync-Server `scripts/collab-server.mjs`), das Einlesen von Änderungen und eine Regel, wann die KI „fertig" ist.

**Kleinere Lücken**
- Schriften lassen sich mit `weft_edit` nicht hinzufügen.
- `weft_validate` erkennt nicht, ob Text aus seinem Kasten läuft oder sich Blöcke überlappen; dafür ist `weft_render` da.
- Eine geschriebene Datei hat keinen Editierverlauf und kein Abspiel-HTML mehr (Weft legt beides beim nächsten Speichern neu an).
