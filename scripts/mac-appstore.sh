#!/bin/sh
# The Mac App Store version of the desktop app: the App Sandbox (src-tauri/appstore/Entitlements.plist), no command line tool inside, a
# privacy manifest, the category "Education" (src-tauri/tauri.macos-appstore.conf.json).
#
#   npm run mac:appstore:test     the sandboxed app with an ad hoc signature, to try on THIS Mac (it runs in its own container,
#                                 ~/Library/Containers/com.weft.app) - cannot be uploaded
#   npm run mac:appstore          signed for the store: src-tauri/target/release/bundle/macos/Weft-<version>.pkg, to upload with the
#                                 app "Transporter" (or `xcrun altool --upload-package`)
#
# The signed version needs three things from the developer account (developer.apple.com > Certificates, Identifiers & Profiles):
#   WEFT_APP_IDENTITY            the certificate "Apple Distribution: Name (7GD6JHBABJ)" (older name: "3rd Party Mac Developer Application: ...")
#   WEFT_INSTALLER_IDENTITY      the certificate "3rd Party Mac Developer Installer: Name (7GD6JHBABJ)" (newer: "Mac Installer Distribution: ...")
#   WEFT_PROVISIONING_PROFILE    the path of the provisioning profile "Mac App Store" for the app id com.weft.app (a .provisionprofile file)
# (`security find-identity -v` shows the exact names of the certificates in the keychain.)
set -e
MODE="${1:-}"
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
OUT="$ROOT/src-tauri/target/appstore"
APP="$ROOT/src-tauri/target/release/bundle/macos/Weft.app"
mkdir -p "$OUT"

case "$MODE" in
  test)
    # Without the two keys that belong to the provisioning profile (the system refuses to start an ad hoc signed app that has them).
    ENTITLEMENTS="$OUT/Entitlements.test.plist"
    cp src-tauri/appstore/Entitlements.plist "$ENTITLEMENTS"
    /usr/libexec/PlistBuddy -c "Delete :com.apple.application-identifier" "$ENTITLEMENTS"
    /usr/libexec/PlistBuddy -c "Delete :com.apple.developer.team-identifier" "$ENTITLEMENTS"
    cat > "$OUT/extra.conf.json" <<JSON
{ "bundle": { "macOS": { "signingIdentity": "-", "entitlements": "$ENTITLEMENTS" } } }
JSON
    ;;
  release)
    : "${WEFT_APP_IDENTITY:?set WEFT_APP_IDENTITY (see the top of this script)}"
    : "${WEFT_INSTALLER_IDENTITY:?set WEFT_INSTALLER_IDENTITY (see the top of this script)}"
    : "${WEFT_PROVISIONING_PROFILE:?set WEFT_PROVISIONING_PROFILE (see the top of this script)}"
    [ -f "$WEFT_PROVISIONING_PROFILE" ] || { echo "No such file: $WEFT_PROVISIONING_PROFILE" >&2; exit 1; }
    cat > "$OUT/extra.conf.json" <<JSON
{ "bundle": { "macOS": { "signingIdentity": "$WEFT_APP_IDENTITY", "files": { "embedded.provisionprofile": "$WEFT_PROVISIONING_PROFILE" } } } }
JSON
    ;;
  *)
    echo "usage: sh scripts/mac-appstore.sh test|release" >&2
    exit 2
    ;;
esac

rm -rf "$APP"
npx tauri build --bundles app -c "$ROOT/src-tauri/tauri.macos-appstore.conf.json" -c "$OUT/extra.conf.json"

echo "--- signature"
codesign --verify --deep --strict --verbose=2 "$APP"
echo "--- entitlements"
codesign -d --entitlements - "$APP" 2>/dev/null | sed -n '1,40p'

if [ "$MODE" = "release" ]; then
  VERSION="$(node -p "require('./package.json').version")"
  PKG="$ROOT/src-tauri/target/release/bundle/macos/Weft-$VERSION.pkg"
  rm -f "$PKG"
  productbuild --component "$APP" /Applications --sign "$WEFT_INSTALLER_IDENTITY" "$PKG"
  echo "--- $PKG"
  echo "Upload it with the app Transporter (Mac App Store) - the build number must be higher than every one uploaded before."
else
  echo "--- $APP (sandboxed, ad hoc signature): open it, or start $APP/Contents/MacOS/weft in a terminal to see its messages"
fi
