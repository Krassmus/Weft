# Weft im App Store (Mac und iPad)

Beide Apps gehen über den App Store. Dieses Dokument beschreibt, was dafür im Code steht und was im Apple-Konto zu tun ist.

## Was im Code dafür gemacht ist

**Mac (Sandbox).** Im Mac App Store ist die App-Sandbox Pflicht. Die Mac-App darf dann nur Dateien anfassen, die die Person gewählt hat (Dialog, Finder), und nur bis zum Beenden der App. Damit „Zuletzt geöffnet“, das Autospeichern und der gemeinsame Ordner (Nextcloud …) nach einem Neustart weiter gehen, merkt sich die App den Zugriff in *Security-Scoped Bookmarks* (`src-tauri/src/sandbox.rs`):

- Nach jedem Öffnen, Speichern und Ordner-Wählen meldet die Seite den Pfad (`src/core/io/sandboxAccess.ts` → `grant_access`), und die App legt ein Lesezeichen an. Eine Datei, die der Finder übergibt, wird in Rust gemerkt (`open_files::open_path`).
- Beim Start öffnet die App alle gemerkten Lesezeichen (die letzten 100), noch bevor die Seite läuft.
- Außerhalb der Sandbox (Entwicklung, Windows, Linux, iPad) tut das alles nichts; erkannt wird die Sandbox an der Umgebungsvariable `APP_SANDBOX_CONTAINER_ID`.
- In der Sandbox startet der lokale Steuerserver für KI-Assistenten (`control.rs`) nicht. Das Kommandozeilenwerkzeug (`weft`, mit eigenem Node) ist nicht in der Store-Version: Es kommt nur über `tauri.cli.conf.json` ins Paket, und die Store-Version nutzt diese Datei nicht.
- Die Rechte stehen in `src-tauri/appstore/Entitlements.plist`: Netzwerk (Client und Server, für WebRTC), vom Menschen gewählte Dateien lesen und schreiben, Lesezeichen.

**Datenschutz-Manifest.** `PrivacyInfo.xcprivacy` (Mac: `src-tauri/appstore/`, iPad: `src-tauri/gen/apple/weft_iOS/`; beide gleich halten). Weft sammelt nichts und verfolgt nichts. Eingetragen sind die „Required Reason“-Schnittstellen, die Laufzeit und Dateiverwaltung benutzen: Dateizeiten, Uhr (Messung), UserDefaults. Fehlt Apple etwas, schreibt es nach dem Hochladen eine E-Mail mit dem genauen Namen – dann hier ergänzen.

## Mac: bauen

Zum Ausprobieren der Sandbox auf diesem Mac (nicht hochladbar, ad-hoc signiert):

```bash
npm run mac:appstore:test
```

Die App läuft dann in ihrem eigenen Container (`~/Library/Containers/eu.townwork.weft`). Ihre Meldungen sieht man, wenn man `src-tauri/target/release/bundle/macos/Weft.app/Contents/MacOS/weft` im Terminal startet („sandbox: access to N files and folders restored“).

Für den Store, signiert:

```bash
export WEFT_APP_IDENTITY="Apple Distribution: … (7GD6JHBABJ)"
export WEFT_INSTALLER_IDENTITY="3rd Party Mac Developer Installer: … (7GD6JHBABJ)"
export WEFT_PROVISIONING_PROFILE=~/Downloads/Weft_Mac_App_Store.provisionprofile
npm run mac:appstore
```

Das ergibt `src-tauri/target/release/bundle/macos/Weft-<version>.pkg`, das mit der App **Transporter** hochgeladen wird. Die genauen Namen der Zertifikate zeigt `security find-identity -v`.

## Im Apple-Konto (einmalig, nur der Kontoinhaber kann das)

1. **App-ID** `eu.townwork.weft` anlegen, für macOS und für iOS (Certificates, Identifiers & Profiles → Identifiers). Die Bundle-ID ist die umgekehrte Schreibweise der eigenen Domain (townwork.eu); sie lässt sich nach dem Anlegen der App in App Store Connect nicht mehr ändern.
2. **Zertifikate** für den Mac erzeugen: „Apple Distribution“ und „Mac Installer Distribution“ (früher „3rd Party Mac Developer Application“ / „Installer“). Die Anfrage erzeugt die Schlüsselbundverwaltung.
3. **Provisioning Profile** „Mac App Store Connect“ für `eu.townwork.weft` erzeugen und herunterladen (`.provisionprofile`).
4. In **App Store Connect** zwei Apps anlegen (oder eine mit zwei Plattformen, Bundle-ID `eu.townwork.weft`): Name, Kategorie, Beschreibung (acht Sprachen möglich), Screenshots (Mac: 1280×800 oder größer; iPad: 2048×2732 oder 2064×2752), Datenschutz-URL, Support-URL, Altersfreigabe.
5. **Datenschutz-Angaben** („App-Datenschutz“): Weft erhebt keine Daten. Die Zusammenarbeit läuft direkt zwischen den Geräten (WebRTC), vermittelt über öffentliche Relays und STUN-Server; die sehen IP-Adressen. Das steht auch auf der Datenschutzseite in der App (`src/features/start/PrivacyPage.tsx`) und gehört in die Datenschutzerklärung unter der Datenschutz-URL.
6. **Exportvorschriften** („Verschlüsselung“): App Store Connect fragt bei jedem Upload, ob die App Verschlüsselung nutzt. Die Zusammenarbeit verschlüsselt mit einem eigenen Schlüssel (der Einladungslink enthält ihn). Wie das rechtlich einzuordnen ist, entscheidet der Kontoinhaber; der Schlüssel `ITSAppUsesNonExemptEncryption` steht deshalb **nicht** in den Info.plist-Dateien.

## Vor jedem Upload

- Die **Version** (`package.json`, `tauri.conf.json`, `Cargo.toml`, iOS `project.yml` und `Info.plist`) und die **Build-Nummer**: Jeder Upload braucht eine Build-Nummer, die höher ist als jede zuvor hochgeladene. Für den Mac ist das `CFBundleVersion` (bei Tauri `bundle.macOS.bundleVersion`), für das iPad `CFBundleVersion` in `Info.plist`/`project.yml`. Die erste Einreichung ist `1.0.0` (Version und Build-Nummer); danach muss die Build-Nummer bei jedem Upload steigen (zum Beispiel `1.0.1`, auch wenn die Version `1.0.0` bleibt).
- `npm test` und `npx tsc --noEmit -p .`.

## Screenshots für den Mac App Store

```bash
npm run dev                                   # in einem zweiten Terminal (Port 1420)
node scripts/appstore-screenshots/capture.mjs app-store-screenshots
```

Das macht für jede der acht Sprachen (`de en es fr pt it tr pl`) fünf Bilder mit je 2560 × 1600 Pixeln (eine der Größen, die der Mac App Store nimmt; PNG ohne Transparenz) in `app-store-screenshots/<Sprache>/`: der Editor mit der Vorlage „Lernpyramide“ (Sortieraufgabe, Aufgabe gewählt), das „+“ über der Folie offen (alle Elemente) und die drei Tutorials im Player. `ONLY=02-werkzeuge node …` nimmt nur ein Motiv neu auf, ein dritter Parameter (`de,en`) nur diese Sprachen. Der Ordner steht in `.gitignore` (etwa 25 MB).

- Aufgenommen wird die Weboberfläche mit Chrome (dieselbe Seite wie in der Mac-App, aber ohne Fensterrahmen und Menüleiste des Systems). Die Leiste mit „Datei“, Rückgängig und Zahnrad gibt es nur ohne eigene Menüleiste (Browser, iPad), deshalb wird sie ausgeblendet: Die Bilder zeigen den Editor, wie er am Mac aussieht.
- **iPad:** `DEVICE=ipad node scripts/appstore-screenshots/capture.mjs app-store-screenshots-ipad` macht dieselben fünf Motive im Querformat mit 2752 × 2064 Pixeln (ein 13-Zoll-iPad; App Store Connect nimmt auch 2064 × 2752, 2732 × 2048 und 2048 × 2732). Die obere Leiste (Datei, Rückgängig, Zahnrad) bleibt hier stehen, weil sie auf dem iPad zur App gehört. Aufgenommen wird auch hier die Weboberfläche in einem Fenster dieser Größe, nicht ein echtes iPad. Der Ordner steht in `.gitignore`.
- Kein Bild vom Startbildschirm: Den sehen die Leute beim ersten Start.
- Die Namen der beiden Verzweigungen in der Vorlage („Order correct?“ …) sind in allen Sprachen englisch (ein Verzweigungsname ist ein einzelner Text ohne Übersetzungen). Für die Bilder benennt das Skript sie in einer Kopie der Vorlage in der Sprache der Oberfläche um (`BRANCH_NAMES` in `capture.mjs`, nicht von Muttersprachlern geprüft); die Vorlage selbst bleibt unverändert.
- Gewählt sind Folien, bei denen im Ereignisgraphen kein Wort steht, das die App nicht übersetzt (bei Folien, auf denen Elemente erscheinen, steht „… erscheint“ in jeder Sprache auf Deutsch; offene Lücke des Editors).
- In App Store Connect: bei jeder Sprache („Lokalisierung“) die Bilder des passenden Ordners hochladen.

## Webseiten für den Store (Datenschutz und Support)

App Store Connect verlangt eine **Datenschutz-URL** und eine **Support-URL**. Dafür gibt es zwei Seiten, `website/privacy.html` und `website/support.html`, in allen acht Sprachen:

```bash
node scripts/website/build.mjs      # schreibt website/privacy.html und website/support.html
```

Die Texte stehen in `scripts/website/texts.mjs` (der Datenschutztext ist der von `src/features/start/PrivacyPage.tsx`, die es in der App nur auf Deutsch und Englisch gibt; die anderen sechs Sprachen sind nicht von Muttersprachlern geprüft; ändert sich der Text in der App, hier mitändern). Jede Seite ist eine einzige Datei mit allen Sprachen: Sie zeigt die Sprache des Browsers, man kann sie oben wechseln, und die Adresse kann sie festlegen: `privacy.html#fr` (oder `?lang=fr`). So bekommt in App Store Connect jede Lokalisierung ihre eigene Adresse. Ohne Skript erscheint die Seite auf Englisch. Die Seiten setzen keine Cookies und laden nichts von anderen Seiten.

Die Dateien aus `website/` auf den eigenen Webserver legen (townwork.eu); die Adressen kommen dann unter „App-Informationen“ (Datenschutz-URL) und bei der Version (Support-URL) in App Store Connect. Der Datenschutztext muss zu den „App-Datenschutz“-Angaben passen (siehe oben, Punkt 5).

## Was sich in der Store-Version des Mac ändert

- Datei **neben** der gespeicherten Datei anlegen (die temporäre Datei beim sicheren Speichern) darf die Sandbox nicht; die App schreibt dann direkt in die Datei (ein Absturz mitten im Schreiben könnte sie beschädigen – das Autospeichern läuft alle paar Sekunden, deshalb ist der Fall selten).
- Dateien, die Finder-Kopien aus der Zwischenablage liefern, kann die Sandbox nicht immer lesen (Einfügen von Dateien aus dem Finder).
- Das Erkennen von Kopien einer Datei (gleiche Modul-ID an einem anderen Ort, `documentLocations.ts`) sieht nur Orte, auf die die App Zugriff hat.
- Kein Kommandozeilenwerkzeug und keine KI-Assistenten-Anbindung; das ist eine Funktion der Version außerhalb des Stores.
