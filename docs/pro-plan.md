# Weft Pro (Plan)

Stand: 14.11.2026. **Vorbereitet, nicht live:** Im Code steht die Schicht für den Status eines Abos (`src/core/pro/`) und eine versteckte Karte in den Einstellungen; der Server hat ein Gerüst (`server/`, `docs/server.md`). Es läuft noch nichts auf einem Server, es gibt keine Store-Produkte und keine Funktion, die Pro verlangt. Für Nutzer ist nichts sichtbar.

## Entscheidungen

- **Optionales Abo für alles, was einen Server braucht.** Alles andere in Weft bleibt kostenlos.
- **Preis: 4,99 € im Monat** (Entscheidung vom 13.11.2026). Dazu ein Jahresabo (Vorschlag 49,99 €, zwei Monate geschenkt) und eine kostenlose Probezeit von 7 bis 14 Tagen. Ein Einführungspreis für die ersten Abonnenten ist möglich.
- **Mehr Speicherplatz in der Cloud**, als man zuerst denkt: Wer interaktive Videos macht, braucht ihn. Die Grenzen werden später festgelegt (Speicher kostet wenig, siehe unten).
- **Kein Konto am Anfang:** Der Kauf im jeweiligen Store ist die Identität. Ein Abo gilt dann je Store; Mac und iPad haben dieselbe Bundle-ID (`eu.townwork.weft`) und sollten sich einen Kauf teilen (Universal Purchase; in App Store Connect bestätigen).
- **Lernende zahlen nichts.** Wer ein Modul mit Umfrage oder Diskussion abspielt, braucht kein Pro, nur die Person, die den Block anlegt. Auch der Weft Player (iPhone) braucht kein Pro.

## Was Pro bringt

| Funktion (`ProFeature`) | Was der Server dazu tut | Aufwand |
|---|---|---|
| `turn` | TURN-Server (coturn) mit befristeten Zugangsdaten; die App trägt sie in die vorhandene TURN-Einstellung ein (`COLLAB_TURN_KEY`, `src/core/collab/settings.ts`) | klein, der erste Dienst |
| `cloudDocuments` | Automerge-Sync-Server (die App nutzt Automerge schon) mit Token-Prüfung und Speicher je Dokument | mittel |
| `cloudBlocks` | Umfrage, gemeinsames Schreiben, Diskussion mit Up- und Downvotes: Die Autorin legt in der App eine Instanz an, das Modul bettet sie als `<iframe>` ein | groß: Speicher, Moderation, Datenschutz |

Ein exportiertes Modul ist weiter eine einzelne HTML-Datei. Die Cloud-Blöcke sind darin Rahmen auf `https://blocks.<Domain>/embed/<Art>/<Id>` und brauchen beim Abspielen Netz; ohne Netz zeigt der Rahmen einen Platzhalter.

## Aufbau

1. **Die App** (`src/core/pro/`, erledigt):
   - `types.ts`: `ProFeature`, `ProStatus` (unbekannt, frei, Pro mit Store und Ablaufdatum), `ProProvider` (was ein Store können muss: `status`, `purchase`, `restore`, `manage`).
   - `providers.ts`: `noProvider` (kein Store: niemand ist Pro), `previewProvider` (zum Ausprobieren, siehe unten) und `registerProProvider`, womit sich später der Store einer Plattform anmeldet.
   - `proStore.ts`: der Zustand (`useProStore`), `isPro()` und **`requirePro(Funktion)`**, das eine Pro-Funktion vor dem Start prüft. Die letzte Antwort des Stores wird gemerkt: Wer bezahlt hat, bleibt bis zu 7 Tage Pro, auch wenn der Store nicht antwortet (nicht, wenn das Ende bekannt ist).
   - `featureTexts.ts`: der Satz in den Einstellungen zu jeder Funktion (`tests/pro.test.ts` prüft, dass es ihn in allen Sprachen gibt).
2. **Die Stores** (noch nicht gebaut), je Plattform ein `ProProvider`:

   | Plattform | Kauf | Hinweise |
   |---|---|---|
   | Mac, iPad | automatisch verlängerndes Abo (StoreKit 2), Abo-Gruppe in App Store Connect, Produkte etwa `eu.townwork.weft.pro.monthly` und `.yearly` | Für den Server braucht es die signierte Transaktion (JWS). Das Tauri-Plugin [`tauri-plugin-iap`](https://docs.rs/crate/tauri-plugin-iap/0.8.0) kann iOS, macOS, Windows und Android, ist aber jung; Alternative `tauri-plugin-apple-iap` (nur Apple, liefert die JWS) oder ein eigenes dünnes Plugin |
   | Windows | Abo-Add-on im Microsoft Store, `Windows.Services.Store.StoreContext` | Das Paket ist schon MSIX, das ist die Voraussetzung ([Microsoft: Abo-Add-ons](https://learn.microsoft.com/en-us/windows/uwp/monetize/enable-subscription-add-ons-for-your-app)); zum Testen muss die App einmal aus dem Store geladen sein |
   | Android (später) | Google Play Billing | |
   | Linux, Browser | kein Pro | Apple verbietet es, in der App auf einen Kauf außerhalb des Stores zu lenken (Regel 3.1.1, aktuelle Fassung prüfen) |

3. **Der Server** („Weft Cloud“, noch nicht gebaut), Entwurf der Schnittstelle:
   - `POST /v1/session` mit `{ store, proof }` gibt ein kurzlebiges Token zurück. `proof` ist bei Apple die signierte Transaktion; der Server prüft sie über die App Store Server API und hält den Stand über die Benachrichtigungen (Verlängerung, Ablauf) aktuell. Bei Microsoft ist es der Store-ID-Schlüssel, geprüft über die Microsoft-Store-Sammlungs-API (braucht eine Azure-AD-Anwendung).
   - `GET /v1/turn` (mit Token) gibt `{ urls, username, credential, ttl }` zurück (coturn mit `use-auth-secret`).
   - `wss://…/v1/sync`: Automerge-Sync, das Token steht im Handshake.
   - `POST /v1/blocks` mit `{ kind }` gibt `{ id, adminKey }` zurück; Teilnehmende sind anonym, die Moderation geht über den `adminKey`.
   - Offen: Was passiert nach dem Ende des Abos (Dokumente zuerst nur lesbar, dann gelöscht? Blöcke bleiben lesbar?).

## Ausprobieren (nur für die Entwicklung)

Die Karte „Weft Pro“ in den Einstellungen erscheint nur, wenn von Hand ein Wert gesetzt ist. Im Browser (`npm run dev`, dann `http://localhost:1420/?settings`) in der Konsole:

```js
localStorage.setItem("weft:pro.preview", "free")   // oder "pro", oder {"state":"pro","expiresAt":1790000000000}
```

Dann gibt es den Test-Anbieter: „Abonnieren“ macht 30 Tage Pro, „Abo verwalten“ beendet es wieder. Entfernen mit `localStorage.removeItem("weft:pro.preview")`.

## Kosten und Preis

Der Server kostet wenig, die Quote ist kein Preistreiber: Ein kleiner EU-Server liegt bei etwa 4 bis 6 € im Monat mit 20 TB Datenverkehr (Hetzner hat 2026 die Preise angehoben; vor dem Kauf nachsehen), 10 GB Speicher bei grob 0,05 bis 0,30 € im Monat (Schätzung). Die Grenzen schützen vor Missbrauch. Abgezogen werden Steuer und Provision (Beispiel mit 19 % MwSt.; Apple 15 % im [Small Business Program](https://developer.apple.com/app-store/small-business-program/), zu beantragen; Microsofts Satz im Partner Center nachsehen):

| Preis (brutto) | ohne MwSt. | nach 15 % Provision |
|---|---|---|
| 2,99 € | 2,51 € | 2,14 € |
| **4,99 €** | 4,19 € | **3,56 €** |
| 49,99 € im Jahr | 42,01 € | 35,71 € |
| 7,99 € | 6,71 € | 5,71 € |

Der Server ist mit etwa 10 bis 20 € im Monat (Server, Sicherung, Domain) schon mit rund fünf Abos gedeckt. Der größere Posten ist die Zeit für Betrieb, Support und Moderation.

## Checkliste vor dem Start

- **Apple:** Vertrag für kostenpflichtige Apps und Bank- und Steuerdaten in App Store Connect; Small Business Program beantragen; Abo-Gruppe und Produkte anlegen; in der App Preis, Laufzeit, automatische Verlängerung und Links zu Nutzungsbedingungen und Datenschutz zeigen; „Käufe wiederherstellen“; Sandbox-Tests.
- **Microsoft:** Abo-Add-on im Partner Center, Store-Test.
- **Datenschutz:** Die Datenschutzseiten (`website/`, `PrivacyPage.tsx`) und die Angabe „Keine Daten erhoben“ in App Store Connect stimmen für Pro nicht mehr (der Server sieht IP-Adressen, das Token und die Inhalte der Blöcke). Dazu: Verantwortlicher, Auftragsverarbeitung (Hoster), Löschfristen, Auskunft und Löschen.
- **Nutzergenerierte Inhalte** (Diskussion mit Votes): Apple verlangt dafür Melden, Blockieren und Moderation (Regel 1.2, prüfen, ob sie hier greift); in der EU die Pflichten des Digital Services Act für Hoster (Meldeweg, Umgang mit Hinweisen). Die Moderation geht über den `adminKey` der Autorin, die Plattform braucht trotzdem einen Weg, Missbrauch zu melden und abzuschalten.
- **Server:** Betreiber, Ort (EU), Domain, Sicherung, Überwachung, Schutz vor Missbrauch (Begrenzung der Anfragen).

## Reihenfolge

1. Die Schicht in der App (erledigt).
2. Server-Grundlage und TURN: Sitzung und TURN-Zugang sind der kleinste ganze Kreislauf (Kauf, Prüfung, Token, Dienst). **Gerüst steht** (`server/`, `docs/server.md`: Sitzung und TURN-Zugangsdaten mit einem Entwicklungs-Store, Docker, Caddy, coturn; auf keinem Server ausprobiert). Offen: die Prüfung bei Apple und Microsoft, der Anbieter in der App, die Store-Produkte (mit den Test-Konten der Stores ausprobieren).
3. Cloud-Dokumente.
4. Cloud-Blöcke, zuerst die Umfrage.
5. Später: Lizenz für Schulen und Teams (Rechnung außerhalb der Stores), mehr Speicher, Android.
