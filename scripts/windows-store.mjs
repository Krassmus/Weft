#!/usr/bin/env node
/**
 * The Microsoft Store version of the desktop app: an MSIX package (src-tauri/msix/AppxManifest.xml). The Store signs it itself, so no
 * code signing certificate is needed.
 *
 *   npm run windows:store:test     the package as a folder, to try on THIS computer:
 *                                  Add-AppxPackage -Register src-tauri\target\msix\test\AppxManifest.xml
 *                                  (needs the Entwicklermodus: Settings > System > Erweitert, or `start ms-settings:developers`;
 *                                  Get-AppxPackage *WeftAuthoring* | Remove-AppxPackage takes it away again)
 *   npm run windows:store          src-tauri/target/msix/Weft-<version>.msix, to upload in Partner Center (Pakete)
 *
 * The command line tool and the MCP server come inside (scripts/bundle-cli.mjs, with a Node of their own), as the commands `weft` and
 * `weft-mcp` (aliases in the manifest, started through src-tauri/msix/launcher).
 *
 * The identity (name, publisher) is the one from Partner Center (Apps und Spiele > Weft > Produktverwaltung > Produktidentität),
 * written into src-tauri/msix/AppxManifest.xml. The version is package.json's with a fourth part 0 (the Store wants it 0); it has to be higher than every one uploaded before.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
if (mode !== "test" && mode !== "release") {
  console.error("usage: node scripts/windows-store.mjs test|release");
  process.exit(2);
}
if (process.platform !== "win32") {
  console.error("The MSIX package can only be made on Windows (makeappx.exe from the Windows SDK).");
  process.exit(1);
}

// makeappx.exe and makepri.exe from the newest Windows SDK
function sdkTool(exe) {
  const kits = "C:\\Program Files (x86)\\Windows Kits\\10\\bin";
  const versions = existsSync(kits) ? readdirSync(kits).filter((v) => /^10\./.test(v)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
  for (const v of versions.reverse()) {
    const path = join(kits, v, "x64", exe);
    if (existsSync(path)) return path;
  }
  console.error(`${exe} not found - install the Windows SDK (https://developer.microsoft.com/windows/downloads/windows-sdk/)`);
  process.exit(1);
}
const makeappx = sdkTool("makeappx.exe");
const makepri = sdkTool("makepri.exe");

const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const msixVersion = `${version.split("-")[0]}.0`;

// The program alone, no installer: the package is the installer. Then the tool, and the program behind its commands (without the C
// runtime as a DLL, like the app).
execFileSync("npx tauri build --no-bundle", { cwd: ROOT, stdio: "inherit", shell: true });
execFileSync("node scripts/bundle-cli.mjs", { cwd: ROOT, stdio: "inherit", shell: true });
const launcherTarget = join(ROOT, "src-tauri", "target", "msix-launcher");
execFileSync(
  "cargo",
  ["build", "--release", "--manifest-path", join(ROOT, "src-tauri", "msix", "launcher", "Cargo.toml"), "--target-dir", launcherTarget],
  { cwd: ROOT, stdio: "inherit", env: { ...process.env, RUSTFLAGS: "-C target-feature=+crt-static" } },
);

const out = join(ROOT, "src-tauri", "target", "msix");
// (two folders: Windows keeps the registered test folder locked while the test is installed)
const dir = join(out, mode);
rmSync(dir, { recursive: true, force: true });
mkdirSync(join(dir, "Assets"), { recursive: true });

copyFileSync(join(ROOT, "src-tauri", "target", "release", "weft.exe"), join(dir, "weft.exe"));
// where cli_tool.rs looks for the tool: next to the program (Tauri's resource directory on Windows), as with tauri.cli.conf.json
cpSync(join(ROOT, "src-tauri", "resources", "weft-cli"), join(dir, "weft-cli"), { recursive: true });
copyFileSync(join(ROOT, "src-tauri", "binaries", "weft-node-x86_64-pc-windows-msvc.exe"), join(dir, "weft-node.exe"));
for (const name of ["weft", "weft-mcp"]) {
  copyFileSync(join(launcherTarget, "release", "weft-msix-launcher.exe"), join(dir, "weft-cli", `${name}.exe`));
}

const icons = join(ROOT, "src-tauri", "icons");
for (const name of ["StoreLogo", "Square44x44Logo", "Square71x71Logo", "Square150x150Logo"]) {
  copyFileSync(join(icons, `${name}.png`), join(dir, "Assets", `${name}.png`));
}
// the taskbar and the start menu list: the icon without the coloured plate behind it
copyFileSync(join(icons, "Square44x44Logo.png"), join(dir, "Assets", "Square44x44Logo.targetsize-44_altform-unplated.png"));

let manifest = readFileSync(join(ROOT, "src-tauri", "msix", "AppxManifest.xml"), "utf8").replaceAll("{{VERSION}}", msixVersion);
if (mode === "test") {
  // a name of its own, so the test sits next to the version from the Store instead of in its place
  manifest = manifest.replace(/<Identity Name="[^"]*"/, '<Identity Name="RasmusFuhse.WeftAuthoring.Test"');
}
writeFileSync(join(dir, "AppxManifest.xml"), manifest);

// resources.pri: lets Windows pick the unplated icon. makepri talks in UTF-16 and fails without a console to write to, so its
// output is caught and only shown when it goes wrong.
function makepriRun(args) {
  try {
    execFileSync(makepri, args, { stdio: "pipe" });
  } catch (e) {
    console.error(Buffer.concat([e.stdout ?? Buffer.alloc(0), e.stderr ?? Buffer.alloc(0)]).toString("utf16le"));
    process.exit(1);
  }
}
const priconfig = join(out, "priconfig.xml");
makepriRun(["createconfig", "/cf", priconfig, "/dq", "de-DE", "/o"]);
makepriRun(["new", "/pr", dir, "/cf", priconfig, "/of", join(dir, "resources.pri"), "/o"]);

if (mode === "test") {
  console.log(`--- ${dir}`);
  console.log(`Try it (Entwicklermodus on): Add-AppxPackage -Register "${join(dir, "AppxManifest.xml")}"`);
} else {
  const msix = join(out, `Weft-${msixVersion}.msix`);
  execFileSync(makeappx, ["pack", "/d", dir, "/p", msix, "/o"], { stdio: "inherit" });
  console.log(`--- ${msix}`);
  console.log("Upload it in Partner Center (Apps und Spiele > Weft > Einreichung > Pakete).");
}
