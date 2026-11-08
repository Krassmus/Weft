# Weft Player

A small app that only **plays** Weft learning modules - for smartphones (iPhone now, Android later). "Weft Authoring" (the editor, `src/` and `src-tauri/`) is for
Mac and iPad; the two are never installed on one device, but it does no harm if they are.

|                |                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------- |
| Name, id       | "Weft Player", `eu.townwork.weft.player`, version as Weft (`1.0.0`)                            |
| Page           | `player/` (React, `index.html` + `main.tsx`), built by `vite.player.config.ts` into `dist-player/` |
| Native side    | `player/src-tauri/` (an own Tauri project; `gen/apple/` is the iOS project of it)                  |
| Shared with Weft | all of `src/core/` (reading a module, making its page, the library), `ModuleThumb` and `summarizeModule` of the start screen, `src-tauri/src/open_files.rs` and `ios_open_urls.rs` (used where they lie, by `#[path]`) |

## What it does

- **Start page**: the modules this phone knows - those that were opened here (the library: the Documents folder of the app, `src/core/io/library.ts`) and the two
  examples that come with the app (`src/start-content/examples`). A tap plays one, the × of a tile removes it (after asking).
- **Open from outside**: a `.weft` attachment (Mail, a messenger), the Files app, AirDrop: the system hands the file to the app (`CFBundleDocumentTypes`, the type
  `com.weft.module` is only *imported* here - Weft declares it); `open_files.rs` copies it into the library, the page is told (`weft://open-file`) and plays it at once.
- **"weft:" links** (an invitation to work together): the app says that this link is for Weft on a tablet or a computer.
- **Playing**: `loadModuleForPlay` (`src/core/io/playModule.ts`) makes the page of a module from its `weft.json` with the runtime of the app (a file that only
  has a page - a player file exported by Weft - is played from that page); `PlayerFrame` shows it in a sandboxed frame like the editor's player. A module
  of a newer Weft than the app is therefore only as playable as this app is up to date.
- Words of the app: `strings.ts`, eight languages, in the language of the phone.

## Working on it

```bash
npm run dev:player            # the page in a browser, port 1430 (the library is then one in memory; see main.tsx and PlayerApp.tsx for how to put a module in)
npm run build:player          # dist-player/
cd player/src-tauri && ../../node_modules/.bin/tauri ios build --debug --target aarch64-sim --ci     # the app for the iPhone simulator
```

- `tauri ios init` wants CocoaPods (not needed: the Podfile has no pods). Without it installed, run it with an empty program called `pod` first in the `PATH`.
- `gen/apple/project.yml` is changed by hand (file type, URL scheme, iPhone only, dark): `xcodegen generate` in `gen/apple` makes the project and the Info.plist
  from it - the Info.plist is not kept separately.
- The icon: the one of Weft with a play sign (`icons/`, made with `tauri icon`).
- Two traps met on the way (both are explained where they are solved): the build phase of the Xcode project calls the Tauri CLI directly, not through `npm run`
  (npm changes into the main folder, where the CLI finds the project of Weft and not this one); and WebKit takes the safe areas off the height of the page on the
  phone (a black strip below the page) - `full_screen` in `src-tauri/src/lib.rs`, asked for by `main.tsx`, switches that off.
- Tried so far: in the iPhone simulator (list, a file from outside - `xcrun simctl openurl booted file://…` -, removing, a `weft:` link). Not tried: a real iPhone,
  a signed build for the store (`npm run player:ios` registers the app id in the developer account by itself).

## Not done yet

- A slimmer bundle (it carries Automerge and the code of the file functions of the editor because `unpack.ts` and `pack.ts` know them).
- Saving a file that a module offers for download.
- Android (`tauri android init` in this folder; `open_files.rs` has to learn the folder of the library there).
- Screenshots and the App Store entry (iPhone 6.9"; `scripts/appstore-screenshots/capture.mjs` has no phone mode yet).
