#!/usr/bin/env node
/**
 * Prepares the command line tool (`weft`) and the MCP server (`weft-mcp`) to be shipped INSIDE the desktop app, with a Node of its own -
 * so that whoever downloads the app needs neither Node nor the repository.
 *
 *   node scripts/bundle-cli.mjs [--target <rust target triple>] [--node <path to a node binary>]
 *
 * It makes
 *   src-tauri/resources/weft-cli/        the built tool (cli/dist, with its dependencies inside), the curated fonts (public/fonts, which
 *                                        `weft render` needs), and the launchers `weft` and `weft-mcp` (`.cmd` on Windows)
 *   src-tauri/binaries/weft-node-<triple>   the Node binary (Tauri's "externalBin": copied next to the app's own executable as `weft-node`
 *                                        and signed with it)
 * Both are described by src-tauri/tauri.cli.conf.json, which a release build adds:
 *
 *   npm run bundle:cli && npm run tauri build -- --config src-tauri/tauri.cli.conf.json
 *
 * (A normal `tauri dev` / iOS build / Mac App Store build does not use it: iOS cannot run a program like this, and the App Store's sandbox
 * does not allow a tool to be installed from the app.)
 *
 * The Node binary is, in this order: the one given with --node or WEFT_NODE_BINARY (it has to run on the machine the app is built for -
 * Homebrew's node does not: it loads Homebrew's libraries); else the official build from nodejs.org for the target, checked against the
 * published SHA-256 sums, cached in src-tauri/binaries/.cache.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NODE_VERSION = "22.21.1";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

function hostTriple() {
  const out = execFileSync("rustc", ["-vV"], { encoding: "utf8" });
  const match = /^host: (.+)$/m.exec(out);
  if (!match) throw new Error("rustc -vV does not say the host triple.");
  return match[1];
}

const triple = flag("target") ?? process.env.TAURI_ENV_TARGET_TRIPLE ?? hostTriple();
const windows = triple.includes("windows");

// Where the official Node for each target lives (nodejs.org/dist/v<version>/node-v<version>-<name>).
function officialName(target) {
  if (target === "aarch64-apple-darwin") return { name: `darwin-arm64.tar.gz`, binary: "bin/node" };
  if (target === "x86_64-apple-darwin") return { name: `darwin-x64.tar.gz`, binary: "bin/node" };
  if (target === "x86_64-unknown-linux-gnu") return { name: `linux-x64.tar.xz`, binary: "bin/node" };
  if (target === "aarch64-unknown-linux-gnu") return { name: `linux-arm64.tar.xz`, binary: "bin/node" };
  if (target === "x86_64-pc-windows-msvc") return { name: `win-x64.zip`, binary: "node.exe" };
  if (target === "aarch64-pc-windows-msvc") return { name: `win-arm64.zip`, binary: "node.exe" };
  throw new Error(`No official Node build known for ${target}: give one with --node <path>.`);
}

async function officialNode(target) {
  const { name, binary } = officialName(target);
  const base = `node-v${NODE_VERSION}-${name}`;
  const cache = join(ROOT, "src-tauri", "binaries", ".cache");
  mkdirSync(cache, { recursive: true });
  const archive = join(cache, base);
  const sums = await (await fetch(`https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt`)).text();
  const line = sums.split("\n").find((l) => l.endsWith(`  ${base}`));
  if (!line) throw new Error(`${base} is not in the published sums of Node ${NODE_VERSION}.`);
  const wanted = line.split(/\s+/)[0];
  const sumOf = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
  if (!existsSync(archive) || sumOf(archive) !== wanted) {
    console.log(`Downloading ${base} from nodejs.org ...`);
    const response = await fetch(`https://nodejs.org/dist/v${NODE_VERSION}/${base}`);
    if (!response.ok) throw new Error(`${base}: ${response.status}`);
    writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
    if (sumOf(archive) !== wanted) throw new Error(`${base}: the sum does not match the published one - not used.`);
  }
  const unpacked = join(cache, base.replace(/\.(tar\.gz|tar\.xz|zip)$/, ""));
  rmSync(unpacked, { recursive: true, force: true });
  execFileSync("tar", ["-xf", archive, "-C", cache]); // (bsdtar reads .zip too; Windows 10 and later have it)
  return join(unpacked, binary);
}

// ---- the launchers ----------------------------------------------------------------------------------------------------------

// The tool lives in <resources>/weft-cli; the Node next to the app's executable (see tauri.cli.conf.json): macOS Contents/MacOS/weft-node,
// Linux (deb) /usr/bin/weft-node. A link made by the app (~/.local/bin/weft) is followed to find them.
const launcher = (script) => `#!/bin/sh
# Starts ${script === "weft.mjs" ? "the Weft command line tool" : "the Weft MCP server"} with the Node that comes with the app.
SELF="$0"
while [ -L "$SELF" ]; do
  DIR=$(cd "$(dirname "$SELF")" && pwd)
  SELF=$(readlink "$SELF")
  case "$SELF" in /*) ;; *) SELF="$DIR/$SELF" ;; esac
done
HERE=$(cd "$(dirname "$SELF")" && pwd)
NODE=""
for CANDIDATE in "$HERE/../../MacOS/weft-node" "$HERE/../../../bin/weft-node" "$HERE/../../bin/weft-node" "$HERE/node" "$WEFT_NODE"; do
  if [ -n "$CANDIDATE" ] && [ -x "$CANDIDATE" ]; then NODE="$CANDIDATE"; break; fi
done
if [ -z "$NODE" ]; then NODE=$(command -v node 2>/dev/null); fi
if [ -z "$NODE" ]; then
  echo "weft: the Node that comes with the app was not found next to it (is the app complete?)." >&2
  exit 2
fi
exec "$NODE" "$HERE/${script}" "$@"
`;

const windowsLauncher = (script) => `@echo off\r\n"%~dp0..\\weft-node.exe" "%~dp0${script}" %*\r\n`;

// ---- go ---------------------------------------------------------------------------------------------------------------------

console.log("Building the tool ...");
execFileSync("npm", ["run", "build:cli", "--silent"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });

const out = join(ROOT, "src-tauri", "resources", "weft-cli");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(ROOT, "cli", "dist"), out, { recursive: true });
cpSync(join(ROOT, "public", "fonts"), join(out, "public", "fonts"), { recursive: true });
const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
writeFileSync(join(out, "VERSION"), `${version}\n`);
for (const [name, script] of [["weft", "weft.mjs"], ["weft-mcp", "weft-mcp.mjs"]]) {
  if (windows) writeFileSync(join(out, `${name}.cmd`), windowsLauncher(script));
  else {
    writeFileSync(join(out, name), launcher(script));
    chmodSync(join(out, name), 0o755);
  }
}

const binaries = join(ROOT, "src-tauri", "binaries");
mkdirSync(binaries, { recursive: true });
const given = flag("node") ?? process.env.WEFT_NODE_BINARY;
const source = given ? resolve(given) : await officialNode(triple);
if (!existsSync(source)) throw new Error(`The Node binary ${source} is not there.`);
const target = join(binaries, `weft-node-${triple}${windows ? ".exe" : ""}`);
copyFileSync(source, target);
if (!windows) chmodSync(target, 0o755);

const size = (path) => (statSync(path).size / 1024 / 1024).toFixed(1);
const total = readdirSync(out, { recursive: true }).reduce((sum, f) => {
  const p = join(out, f);
  return sum + (statSync(p).isFile() ? statSync(p).size : 0);
}, 0);
console.log(`weft ${version} for ${triple}:`);
console.log(`  ${out}  (${(total / 1024 / 1024).toFixed(1)} MB)`);
console.log(`  ${target}  (${size(target)} MB${given ? ", given" : ", official Node " + NODE_VERSION})`);
