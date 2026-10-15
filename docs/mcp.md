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
| `weft_validate` | Prüfung mit Codes und Hinweisen (kaputte Verweise, Ereignisse die nie passieren, unbekannte Variablen ...) |
| `weft_schema` | Das Dateiformat: Arten von Blöcken, die Felder einer Art oder Definition |
| `weft_text_export` / `weft_text_import` | Texte als flache Liste zum Übersetzen und zurück in ein neues Modul |
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

- Bilder, Videos und Schriften lassen sich noch nicht hinzufügen oder austauschen (das geht im Editor). Vorhandene bleiben bei jeder Änderung erhalten.
- Es gibt keine Vorschau als Bild. Was auf einer Folie wirklich zu sehen ist, sagt `weft_validate` nur strukturell (außerhalb der Folie, überlappend ist nicht geprüft).
- Der Server verändert nur Dateien, die man ihm nennt (Quelle lesen, Ziel schreiben); eine vorhandene Zieldatei überschreibt er nicht (außer der Arbeitskopie `….ai.weft`).
