# Weft Cloud (der Server)

Stand: 14.11.2026. **Grundgerüst, nicht live.** Der Dienst in `server/` kann eine Sitzung aus einem Kaufnachweis machen und TURN-Zugangsdaten ausgeben. Die Prüfung bei Apple und Microsoft ist noch nicht gebaut, und es läuft noch nichts auf einem Server. Der Hintergrund steht in `docs/pro-plan.md`.

**Annahmen, die du noch bestätigen musst:**
- Weft Cloud läuft auf einem **zweiten, kleinen Server**, nicht auf dem mit den Datenschutz- und Support-Seiten von `townwork.eu` (diese sind für die Stores wichtig und bleiben unberührt).
- Die Adressen sind Unteradressen von `townwork.eu`: `cloud.townwork.eu` (Sitzung, später Sync) und `turn.townwork.eu`; `blocks.townwork.eu` kommt für die Cloud-Blöcke dazu.

## Was in `server/` steht

| Datei | Was |
|---|---|
| `src/main.ts`, `src/app.ts` | der Dienst: `GET /health`, `POST /v1/session`, `GET /v1/turn` (Node, keine Abhängigkeiten; Node 22.18 oder neuer führt die `.ts`-Dateien selbst aus) |
| `src/token.ts` | das Token (JWT, HS256): wer abonniert hat (ein Pseudonym, nie die Kennung des Stores) und bis wann |
| `src/verify.ts` | Prüfung eines Kaufs, je Store eine. Apple, Microsoft und Google sagen noch `501`; nur der Store `dev` funktioniert, und nur im Entwicklungsmodus |
| `src/turn.ts` | TURN-Zugangsdaten nach der REST-Art von coturn (`use-auth-secret`): Name `<Ende>:<Wer>`, Passwort HMAC-SHA1 davon; es wird nichts gespeichert |
| `src/rateLimit.ts` | Bremse gegen Raten und Lärm (im Speicher, pro Adresse) |
| `src/config.ts` | die Einstellungen aus der Umgebung; ein falscher Wert stoppt den Start mit einer klaren Meldung |
| `Dockerfile`, `compose.yaml`, `Caddyfile`, `.env.example` | Betrieb: der Dienst, Caddy davor (Zertifikate von Let's Encrypt, holt Caddy selbst), coturn |
| `../tests/server.test.ts` | Tests gegen einen echten, lokal gestarteten Dienst (`npm test`) |

Die Schnittstelle:

```
POST /v1/session   { "store": "apple" | "microsoft" | "google" | "dev", "proof": "…" }
                   -> 200 { token, expiresAt, proUntil } | 402 no_subscription | 429 | 400 | 501 store_not_supported_yet
GET  /v1/turn      Authorization: Bearer <token>
                   -> 200 { urls, username, credential, ttl } | 401 invalid_token | 402 | 503 turn_not_configured
```

## Lokal ausprobieren

```bash
npm run server:dev        # http://127.0.0.1:8080, Store "dev" erlaubt
curl -s -X POST http://127.0.0.1:8080/v1/session -H 'Content-Type: application/json' -d '{"store":"dev","proof":"dev-pro:Mara"}'
curl -s http://127.0.0.1:8080/v1/turn -H "Authorization: Bearer <token>"
npm run server:check      # Typen
npm test                  # alle Tests, auch tests/server.test.ts
```

Der Entwicklungsmodus (`WEFT_CLOUD_DEV=1`) nimmt jeden als Abonnenten an. Er startet deshalb nur mit `HOST=127.0.0.1` (der Dienst verweigert sonst den Start) und gehört nie auf den Server.

## Einstellungen (`server/.env`, Vorlage `.env.example`)

| Name | Bedeutung |
|---|---|
| `WEFT_CLOUD_TOKEN_SECRET` | signiert die Tokens, mindestens 32 Zeichen (`openssl rand -hex 32`) |
| `WEFT_CLOUD_TOKEN_TTL` | wie lange ein Token gilt (Sekunden, Vorgabe 3600); die App fragt danach mit dem Nachweis des Stores neu |
| `SESSIONS_PER_MINUTE` | Sitzungen je Adresse und Minute (Vorgabe 20) |
| `TURN_SECRET`, `TURN_URLS`, `TURN_TTL`, `TURN_REALM` | Geheimnis von coturn (gleich im Dienst und in coturn), die Adressen, die die Apps bekommen, wie lange die Zugangsdaten gelten (Vorgabe 24 Stunden: ein Anruf darf nicht länger dauern), die Domäne von coturn |
| `CLOUD_HOST` | die Adresse des Dienstes für Caddy |

## Einen neuen Server aufsetzen (von dir auszuführen)

Ich habe keinen Zugang zu deinem Server und brauche keinen. Die Schritte sind so geschrieben, dass du sie dort selbst ausführst. **Nichts davon habe ich ausprobiert**, insbesondere nicht Docker und coturn: Der erste Start auf dem Server ist der erste Test.

1. **Server:** ein kleiner Server bei Netcup oder einem anderen Anbieter in der EU, Debian 12 oder Ubuntu 24.04 LTS, mit fester IPv4 (IPv6 ist ein Gewinn). Datenverkehr und Preis im Kundenbereich nachsehen: TURN braucht Datenverkehr.
2. **DNS bei INWX:** A-Einträge für `cloud.townwork.eu` und `turn.townwork.eu` auf die IP des neuen Servers (und AAAA, wenn es IPv6 gibt). Vorher die Gültigkeit (TTL) auf 300 Sekunden stellen. Die Hauptadresse `townwork.eu` bleibt auf dem alten Server.
3. **Erste Absicherung:** `apt update && apt upgrade`; einen eigenen Benutzer anlegen und SSH-Schlüssel hinterlegen, dann die Anmeldung als `root` und per Passwort abschalten; Firewall mit diesen Ports: `22/tcp` (SSH), `80/tcp`, `443/tcp` und `443/udp` (Caddy), `3478/tcp` und `3478/udp` (TURN), `49152:65535/udp` (die Ports, die TURN vergibt); `fail2ban`; automatische Sicherheitsupdates (`unattended-upgrades`). Die Firewall im Kundenbereich des Anbieters, falls es eine gibt, bekommt dieselben Regeln.
4. **Docker** nach der Anleitung des Docker-Projekts für das Betriebssystem installieren (Engine und Compose-Plugin).
5. **Code und Einstellungen:** `git clone` des Repositorys (nur `server/` wird gebraucht), dort `cp .env.example .env`, die beiden Geheimnisse mit `openssl rand -hex 32` einsetzen, `TURN_URLS` und `CLOUD_HOST` prüfen. `.env` nie ins Repository legen.
6. **Starten:** `docker compose up -d --build`. Dann `docker compose ps`, `docker compose logs caddy` (das Zertifikat wird beim ersten Aufruf geholt) und `curl https://cloud.townwork.eu/health`.
7. **TURN prüfen:** `docker compose logs coturn`. Zugangsdaten mit einer Entwicklungs-Sitzung holen ist auf dem Server nicht möglich (dort gibt es den Store `dev` nicht): zum Testen kurz einen Test-Dienst lokal mit demselben `TURN_SECRET` starten, `/v1/turn` aufrufen und die Zugangsdaten in die Testseite „Trickle ICE“ des WebRTC-Projekts eintragen; es müssen Kandidaten vom Typ `relay` erscheinen. Danach die Optionen von coturn in `compose.yaml` gegen die Meldungen im Protokoll prüfen.
8. **TLS für TURN** (`turns:`, Port 443 oder 5349) ist eine zweite Stufe: Auf Port 443 würde coturn mit Caddy streiten (eigene IP oder SNI-Weiche nötig). Für den Anfang reicht `turn:` auf 3478 über UDP und TCP; hinter strengen Firewalls hilft TLS auf 443, das kommt danach.
9. **Sicherung und Überwachung:** Es gibt (noch) keinen Zustand außer den Zertifikaten von Caddy (`caddy_data`); Snapshots des Servers beim Anbieter reichen. Ein Überwachungsdienst (zum Beispiel Uptime Kuma auf dem alten Server) ruft `/health` ab.

## Datenschutz

- **Der Dienst** schreibt kein Protokoll von Adressen oder Anfragen. Die Bremse (`rateLimit.ts`) hält Adressen nur im Speicher und vergisst sie nach einer Minute. Ein Abonnent erscheint nur als Pseudonym (Hash der Store-Kennung).
- **Caddy** schreibt ohne weitere Einstellung kein Zugriffsprotokoll; das bleibt so. Fehler stehen im Protokoll des Containers (10 MB, drei Dateien, dann überschrieben).
- **coturn** protokolliert Adressen der Beteiligten (so arbeitet ein TURN-Server). Das Protokoll ist auf wenige Tage begrenzt (`max-size`/`max-file` in `compose.yaml`); in der Datenschutzerklärung stehen muss es trotzdem.
- Die Datenschutzseiten (`website/`, `PrivacyPage.tsx`) und die Angabe „Keine Daten erhoben“ in App Store Connect müssen mit dem Start von Pro angepasst werden (siehe `docs/pro-plan.md`).

## Was noch fehlt

1. **Prüfung der Käufe** bei Apple (signierte Transaktion über die App Store Server API, Benachrichtigungen über Verlängerung und Ablauf) und Microsoft (Store-ID-Schlüssel über die Sammlungs-API, braucht eine Azure-AD-Anwendung): `src/verify.ts`.
2. **Die App:** ein Anbieter je Store (`registerProProvider`, `src/core/pro/`), der den Nachweis an `/v1/session` schickt, das Token hält und die TURN-Zugangsdaten in die vorhandene TURN-Einstellung einträgt (`COLLAB_TURN_KEY`). Dazu die Anmeldung der App-Produkte in App Store Connect und im Partner Center.
3. **Cloud-Dokumente** (Automerge-Sync-Server hinter `sync.townwork.eu`, mit Prüfung des Tokens) und **Cloud-Blöcke** (`blocks.townwork.eu`).
4. **Der alte Server** `townwork.eu` bleibt für die Seiten der Stores: Ubuntu 22.04 bekommt nach meinem Wissen bis April 2027 reguläre Sicherheitsupdates (prüfen) und sollte davor aktualisiert oder umgezogen werden; das Zertifikat läuft bis Januar 2027, die Erneuerung ist eingerichtet.
