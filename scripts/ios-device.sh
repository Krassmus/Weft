#!/bin/sh
# Builds the app for a real iPad/iPhone (signed with the team in src-tauri/gen/apple/project.yml), installs it and starts it.
#
#   npm run ios:device              the device called "iPad Ras"
#   npm run ios:device -- "My iPad" another device (name or UDID as `xcrun devicectl list devices` shows it)
#
# The device has to be unlocked and reachable (a USB cable is the most reliable; "Entwicklermodus" must be on:
# Einstellungen > Datenschutz & Sicherheit). The first start asks to trust the developer certificate on the device:
# Einstellungen > Allgemein > VPN & Geräteverwaltung.
set -e
DEVICE="${1:-iPad Ras}"
cd "$(dirname "$0")/.."
BUILD=src-tauri/gen/apple/build
rm -rf "$BUILD/weft_iOS.xcarchive" "$BUILD/arm64"
npx tauri ios build --debug --target aarch64 --export-method debugging --ci
xcrun devicectl device install app --device "$DEVICE" "$BUILD/arm64/Weft.ipa"
xcrun devicectl device process launch --device "$DEVICE" --terminate-existing com.weft.app
