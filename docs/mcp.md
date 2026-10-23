# Weft für KI-Assistenten (MCP)

Der MCP-Server `weft-mcp` (er sagt dem Client beim Verbinden, dass er zuerst `weft_guide` lesen soll) gibt einem KI-Assistenten (Claude Desktop, Claude Code, ChatGPT-Anbindungen mit MCP ...) dieselben Möglichkeiten wie das [Kommandozeilenwerkzeug](cli.md): ein Lernmodul lesen, prüfen, übersetzen und ändern. Die Änderungen sind die Aktionen des Editors, ausgeführt auf der Datei - das Ergebnis ist, was der Editor gemacht hätte.

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

Der Server spricht MCP über Standard-Ein-/Ausgabe, braucht kein Netz und nichts außer Node 22. **Mit der Desktop-App** ist das alles nicht nötig: Sie bringt den Server mit eigenem Node mit (Einstellungen → KI-Assistenten, unten „In der App und zum Ausliefern").

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
| `weft_status` | Läuft die Weft-App, was ist offen, was darf die KI. Ist ein Modul offen, arbeiten `weft_inspect`, `weft_validate`, `weft_render`, `weft_play`, `weft_text_export` und `weft_edit` **ohne `file`** daran - live (Änderungen erscheinen in der App, als ein Schritt im Verlauf) |
| `weft_open` | Eine .weft-Datei in der App zeigen, als neues, noch nicht gespeichertes Modul |
| `weft_version` | Version des Werkzeugs, Dateiformat, das es liest und schreibt, Node, gefundener Browser |
| `weft_guide` | **Zuerst lesen:** die Anleitung zum Bauen eines Lernmoduls (`topic`: `authoring`, `ops`, `cli`; englisch, `lang: "de"` deutsch) - dieselben Texte wie `weft guide` |
| `weft_operations` | Beschreibung der Operationen mit Beispiel (englisch, `lang: "de"` deutsch; steht in [operations.md](operations.md)) |

## Wie Änderungen geschrieben werden

- **Das Original bleibt unverändert.** `weft_edit` schreibt in eine Arbeitskopie `<name>.ai.weft` neben der Datei und nennt den Pfad im Ergebnis. Mit dieser Kopie arbeitet man weiter (`weft_edit` auf `….ai.weft` ändert die Kopie selbst). Ein anderes Ziel: `output`.
- **Alles oder nichts.** Schlägt eine Operation fehl, wird nichts geschrieben. Das Ergebnis jeder Operation (mit Ids) steht in der Antwort; mit `"as": "name"` vergibt eine Operation einen Namen, den spätere als `"$name"` benutzen können.
- **Erzeugen die Änderungen Fehler** (zum Beispiel ein Button, der auf eine Folie springt, die es nicht gibt), wird ebenfalls nichts geschrieben, und die Antwort sagt, welche. `allow_errors` schreibt trotzdem.
- `dry_run` prüft nur und schreibt nichts.
- Eine so geschriebene Datei hat keinen Editierverlauf und kein Abspiel-HTML mehr (beides beschreibt den alten Stand); Weft legt beides beim nächsten Speichern neu an. Wer die Datei zusammen mit anderen live bearbeitet hat, sollte die Kopie wie eine neue Datei behandeln.

## Ein Ablauf

(Wie man ein Lernmodul baut, das gut aussieht - Raster, Textgrößen, Weiter-Ketten, typische Fallen -: [ai-authoring.md](ai-authoring.md).)

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

## In der App und zum Ausliefern

**Aus der Desktop-App (Mac, Windows, Linux):** Das Werkzeug steckt in der App, mit einem eigenen Node - wer die App herunterlädt, braucht weder Node noch das Repository. In den Einstellungen (Abschnitt „KI-Assistenten") legt „Kommandozeilenwerkzeug installieren" Links `weft` und `weft-mcp` in `~/.local/bin` an (unter Windows zeigt der Abschnitt den Pfad) und zeigt die Konfiguration für einen MCP-Client zum Kopieren. Die Links zeigen ins App-Paket: **jedes App-Update aktualisiert das Werkzeug mit**, es passt immer zur App (`weft version`).

**So wird es gebaut** (Release-Rechner, einmal je Zielplattform):

```bash
npm run bundle:cli                # baut das Werkzeug, legt es mit Schriften und Startskripten in src-tauri/resources/weft-cli,
                                  # holt das offizielle Node von nodejs.org (Prüfsumme geprüft) nach src-tauri/binaries
npm run tauri build -- --config src-tauri/tauri.cli.conf.json
```

`src-tauri/tauri.cli.conf.json` fügt dem Build das Werkzeug als Ressource und Node als `externalBin` (`weft-node`) hinzu; ein normales `tauri dev` und der iOS-Build brauchen es nicht und benutzen die Datei nicht. Statt des Downloads geht `--node <Pfad>` oder `WEFT_NODE_BINARY` (das Node muss auf dem Zielsystem laufen - das von Homebrew tut das nicht, es lädt Homebrews Bibliotheken). Gewicht: das Node (rund 45 MB auf der Platte, das Installationspaket komprimiert es) plus das Werkzeug (rund 7 MB).

**Noch nicht geprüft:** das Signieren und Notarisieren auf dem Mac. Das Node-Programm führt JavaScript mit einem Just-in-time-Übersetzer aus; mit der gehärteten Laufzeit braucht es dafür Berechtigungen (`com.apple.security.cs.allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`) in der Entitlements-Datei, mit der Tauri signiert. Das gehört vor dem ersten Release probiert.

**Nicht über den Mac App Store:** Die Sandbox lässt weder Links aus der App heraus noch den freien Dateizugriff für das Werkzeug zu. Die Store-App (und iOS) enthält das Werkzeug nicht; die Einstellungen sagen das. Es kommt dann aus der Desktop-Fassung (notarisiertes DMG) oder dem Repository.

## Ausblick: was noch fehlt, und warum

**iPad**
- Dort geht es nicht: kein Node, kein Chrome, und eine App kann eine andere nicht steuern. Eine KI in einer Chat-App auf dem iPad kann die Weft-App nicht bedienen. Ein Mensch müsste Bilder kopieren oder exportieren.
- Die App hat „Exportieren als PDF…", dessen Seiten eine KI als Bilder lesen kann (gezeichnet mit html2canvas, also nicht überall genau wie im Player). Einen Export einzelner Folien als PNG oder „Folie als Bild kopieren" gibt es noch nicht; die Zeichnung steckt schon in `src/features/editor/exportPdf.tsx`.
- Sauber wäre es, dass die KI auf einem Mac oder Server arbeitet und das iPad nur das Bearbeitungsgerät ist, über eine Datei in der Cloud oder über die Live-Zusammenarbeit.

**Verteilen ohne die App**
- Für Server, KI-Sandboxes und wer die App nicht hat: das Werkzeug auf npm (`npx weft-cli@latest`, dieselben Versionsnummern wie die App) und/oder als `.mcpb`-Datei für Claude Desktop (dort bringt Claude Desktop nach unserem Kenntnisstand ein eigenes Node mit; das Format vor dem Bauen gegen die aktuelle Doku prüfen).
- Das Desktop-Programm von ChatGPT kann lokale MCP-Server nur eingeschränkt, Web-Chats gar nicht; für diese bräuchte es einen Server im Netz mit einer eigenen Sicherheitsüberlegung.

**Zeichnen ohne Chrome**
- Die App selbst könnte als Zeichner dienen (ein Befehl, der die Folie in der eigenen Webansicht headless zeichnet). Das wäre die Lösung für Rechner ohne Chrome, ist aber deutlich mehr Arbeit.

**Die KI als Teilnehmerin der Live-Zusammenarbeit (für das Tablet)**
- Am Computer gibt es das Arbeiten am offenen Modul schon, ohne Zusammenarbeit: `weft status` / `weft edit` ohne Datei (siehe `cli.md`). Für das Tablet bleibt der Weg über die Zusammenarbeit:
- Ein Programm auf einem Mac oder Server tritt per Einladungslink bei, bearbeitet das Modul mit denselben Operationen und zeichnet die Folien selbst. Der Mensch sieht die Änderungen live, ohne etwas auszulösen (auch auf dem iPad). Dazu bräuchte es das Beitreten ohne Browser (WebRTC in Node oder über den Sync-Server `scripts/collab-server.mjs`), das Einlesen von Änderungen und eine Regel, wann die KI „fertig" ist.

**Kleinere Lücken**
- Schriften lassen sich mit `weft_edit` nicht hinzufügen.
- `weft_validate` erkennt nicht, ob Text aus seinem Kasten läuft oder sich Blöcke überlappen; dafür ist `weft_render` da.
- Eine geschriebene Datei hat keinen Editierverlauf und kein Abspiel-HTML mehr (Weft legt beides beim nächsten Speichern neu an).
