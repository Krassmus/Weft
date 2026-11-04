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

Die App läuft dann in ihrem eigenen Container (`~/Library/Containers/com.weft.app`). Ihre Meldungen sieht man, wenn man `src-tauri/target/release/bundle/macos/Weft.app/Contents/MacOS/weft` im Terminal startet („sandbox: access to N files and folders restored“).

Für den Store, signiert:

```bash
export WEFT_APP_IDENTITY="Apple Distribution: … (7GD6JHBABJ)"
export WEFT_INSTALLER_IDENTITY="3rd Party Mac Developer Installer: … (7GD6JHBABJ)"
export WEFT_PROVISIONING_PROFILE=~/Downloads/Weft_Mac_App_Store.provisionprofile
npm run mac:appstore
```

Das ergibt `src-tauri/target/release/bundle/macos/Weft-<version>.pkg`, das mit der App **Transporter** hochgeladen wird. Die genauen Namen der Zertifikate zeigt `security find-identity -v`.

## Im Apple-Konto (einmalig, nur der Kontoinhaber kann das)

1. **App-ID** `com.weft.app` für macOS anlegen (Certificates, Identifiers & Profiles → Identifiers; für iOS gibt es sie schon).
2. **Zertifikate** für den Mac erzeugen: „Apple Distribution“ und „Mac Installer Distribution“ (früher „3rd Party Mac Developer Application“ / „Installer“). Die Anfrage erzeugt die Schlüsselbundverwaltung.
3. **Provisioning Profile** „Mac App Store Connect“ für `com.weft.app` erzeugen und herunterladen (`.provisionprofile`).
4. In **App Store Connect** zwei Apps anlegen (oder eine mit zwei Plattformen, Bundle-ID `com.weft.app`): Name, Kategorie, Beschreibung (acht Sprachen möglich), Screenshots (Mac: 1280×800 oder größer; iPad: 2048×2732 oder 2064×2752), Datenschutz-URL, Support-URL, Altersfreigabe.
5. **Datenschutz-Angaben** („App-Datenschutz“): Weft erhebt keine Daten. Die Zusammenarbeit läuft direkt zwischen den Geräten (WebRTC), vermittelt über öffentliche Relays und STUN-Server; die sehen IP-Adressen. Das steht auch auf der Datenschutzseite in der App (`src/features/start/PrivacyPage.tsx`) und gehört in die Datenschutzerklärung unter der Datenschutz-URL.
6. **Exportvorschriften** („Verschlüsselung“): App Store Connect fragt bei jedem Upload, ob die App Verschlüsselung nutzt. Die Zusammenarbeit verschlüsselt mit einem eigenen Schlüssel (der Einladungslink enthält ihn). Wie das rechtlich einzuordnen ist, entscheidet der Kontoinhaber; der Schlüssel `ITSAppUsesNonExemptEncryption` steht deshalb **nicht** in den Info.plist-Dateien.

## Vor jedem Upload

- Die **Version** (`package.json`, `tauri.conf.json`, `Cargo.toml`, iOS `project.yml` und `Info.plist`) und die **Build-Nummer**: Jeder Upload braucht eine Build-Nummer, die höher ist als jede zuvor hochgeladene. Für den Mac ist das `CFBundleVersion` (bei Tauri `bundle.macOS.bundleVersion`), für das iPad `CFBundleVersion` in `Info.plist`/`project.yml`. Bei der ersten Einreichung reicht `0.2.0`.
- `npm test` und `npx tsc --noEmit -p .`.

## Was sich in der Store-Version des Mac ändert

- Datei **neben** der gespeicherten Datei anlegen (die temporäre Datei beim sicheren Speichern) darf die Sandbox nicht; die App schreibt dann direkt in die Datei (ein Absturz mitten im Schreiben könnte sie beschädigen – das Autospeichern läuft alle paar Sekunden, deshalb ist der Fall selten).
- Dateien, die Finder-Kopien aus der Zwischenablage liefern, kann die Sandbox nicht immer lesen (Einfügen von Dateien aus dem Finder).
- Das Erkennen von Kopien einer Datei (gleiche Modul-ID an einem anderen Ort, `documentLocations.ts`) sieht nur Orte, auf die die App Zugriff hat.
- Kein Kommandozeilenwerkzeug und keine KI-Assistenten-Anbindung; das ist eine Funktion der Version außerhalb des Stores.
