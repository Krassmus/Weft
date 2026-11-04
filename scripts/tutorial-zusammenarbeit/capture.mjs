// Takes the pictures of the Weft editor that the tutorial shows (crops of the real editor, JPEG), in the interface language UI (de, en, es, fr, pt, it, tr, pl):
//   node capture.mjs <module.weft> <folder> [ui language]
// Pictures: the card "Kollaboration" with the switch on and the invitation link (card-on), the dialog "Einladung beitreten" (join), the network group of the app's
// settings (network: TURN server and relays), and the card with the folder sync - before (folder-off) and after a folder was chosen (folder-on, with two others
// in it). Where things are is looked up in the page (what depends on the words of a language moves) and written down in rects.json (pixels of each crop), so
// that the rings of build.py sit in the same place in every language's picture.
//
// Nothing leaves this computer: the public relays (wss://) are blocked, so the switch only makes the link; the shared folder of the desktop app (it is not
// there in a browser) is a folder in memory (MemorySyncFs of the app itself), with the files of two other people put into it.
import { writeFileSync } from "node:fs";
import { launch, sleep } from "../tutorial-erstes-lernmodul/cdp.mjs";
const [MODULE, OUT, UI = "de"] = process.argv.slice(2);
const OPEN_FILE = { de: "Datei öffnen", en: "Open file", es: "Abrir archivo", fr: "Ouvrir un fichier", pt: "Abrir arquivo", it: "Apri file", tr: "Dosya aç", pl: "Otwórz plik" }[UI];
const JOIN = { de: "Einladung beitreten…", en: "Join invitation…", es: "Unirse a una invitación…", fr: "Rejoindre une invitation…", pt: "Entrar em um convite…", it: "Partecipa a un invito…", tr: "Bir davete katıl…", pl: "Dołącz do zaproszenia…" }[UI];
const NETWORK = { de: "Netzwerk", en: "Network", es: "Red", fr: "Réseau", pt: "Rede", it: "Rete", tr: "Ağ", pl: "Sieć" }[UI];
const LINK = "weft://3GDLE3hrtEuQa9hj17pRn1gKq8WsYv4Zc2BmNx?k=Xr7Hq2LmZpA9vBt4yNc1dg";
process.env.WEFT_JPEG_QUALITY ||= "72"; // (the installation is not to grow: these pictures are small on purpose)
const SCALE = 0.7; // of what the screen (2x) has: the pictures only have to be seen at about the size of the slide

const c = await launch(1600, 1200, 2);
await c.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("weft:language","${UI}")` });
await c.send("Page.setInterceptFileChooserDialog", { enabled: true });
c.on(async (m) => {
  if (m.method === "Page.fileChooserOpened") await c.send("DOM.setFileInputFiles", { files: [MODULE], backendNodeId: m.params.backendNodeId });
});
await c.goto("http://localhost:1420/");
const open = await c.evaluate(`(() => { const b=[...document.querySelectorAll("button")].find(b=>new RegExp(${JSON.stringify(OPEN_FILE)}).test(b.textContent)); const r=b.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]; })()`);
await c.clickAt(...open);
await sleep(4000);
await c.send("Network.enable");
await c.send("Network.setBlockedURLs", { urls: ["wss://*"] });

const click = async (x, y, wait = 700) => { await c.clickAt(x, y); await sleep(wait); };
const box = (expr) => `(() => { const r = (${expr}).getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })()`;
const rects = {};
// a picture of the region [x0, y0, x1, y1] (screen pixels) and where the named things are in it
async function picture(name, [x0, y0, x1, y1], named = {}) {
  const clip = { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) };
  rects[name] = { size: [clip.width, clip.height] };
  for (const [key, expression] of Object.entries(named)) {
    const r = await c.evaluate(expression);
    rects[name][key] = [r[0] - clip.x, r[1] - clip.y, r[2] - clip.x, r[3] - clip.y].map((v) => Math.round(v));
  }
  await c.shot(`${OUT}/${name}.jpg`, clip, SCALE);
}
// A paragraph at least `lines` lines high: the words of a language wrap into more or fewer lines, and what is below them would move - this keeps the
// pictures of all languages the same size and everything in them in the same place. (`over` tells when a language needs more lines than that.)
const over = [];
async function atLeast(expr, lines, label) {
  const used = await c.evaluate(`(() => { const e = ${expr}; const lh = parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.4; e.style.minHeight = (lh * ${lines}) + "px"; return Math.round(e.getBoundingClientRect().height / lh * 10) / 10; })()`);
  if (used > lines + 0.2) over.push(`${label}: ${used} lines (room for ${lines})`);
}
const tabs = async () => c.evaluate(`[...document.querySelectorAll("button")].map(b=>b.getBoundingClientRect()).filter(r=>r.y>45&&r.y<65&&r.x<260).sort((a,b)=>a.x-b.x).map(r=>[r.x+r.width/2, r.y+r.height/2])`);
// the card with the switch (the one that holds "An Datei zusammen arbeiten"): scrolled into the middle of the sidebar
const CARD = `[...document.querySelectorAll(".weft-collapsible")].filter(e => !e.querySelector(".weft-collapsible") && e.querySelector(".weft-field-inline input[type=checkbox]")).pop()`;
const cardRect = async () => { await c.evaluate(`${CARD}.scrollIntoView({block:"center"})`); await sleep(400); return c.evaluate(box(CARD)); };

// ---- the card with the folder sync: before (the desktop app has the button; in a browser a hint says it is only there - a folder in memory stands in) ----
const [, , settingsTab] = await tabs();
const [folienTab] = await tabs();
await click(...settingsTab);
await c.evaluate(`(async () => {
  const fsMod = await import("/src/core/collab/folder/syncFs.ts");
  const session = await import("/src/core/collab/folder/folderSession.ts");
  window.__fs = new fsMod.MemorySyncFs();
  session.setSyncFsFactory(() => window.__fs);
  window.__session = session;
})()`);
// (the sidebar draws the card again when the tab is shown again)
await click(...folienTab, 400);
await click(...settingsTab, 800);
// (the folder part of the card: from the heading "Ordner-Abgleich" down)
const FOLDER_FIELD = `${CARD}.querySelector(".weft-ghost-button").closest(".weft-field")`;
let r = await cardRect();
await atLeast(`${CARD}.querySelector(".weft-folder-sync-state")`, 3, "folder-off");
let f = await c.evaluate(box(FOLDER_FIELD));
// (the button's label breaks into two lines in some languages: its height is the one of two lines everywhere)
await c.evaluate(`${CARD}.querySelector(".weft-ghost-button").style.minHeight = "44px"`);
const offButton = await c.evaluate(box(`${CARD}.querySelector(".weft-ghost-button")`));
if (offButton[3] - offButton[1] > 44.5) over.push("folder-off button: " + (offButton[3] - offButton[1]) + " px high");
await picture("folder-off", [r[0] - 6, f[1] - 10, r[2] + 6, offButton[3] + 14], { button: box(`${CARD}.querySelector(".weft-ghost-button")`) });

// ---- ... and after a folder was chosen, with two others in it ----
await c.evaluate(`window.__session.startFolderSync("/Users/mara/Nextcloud/Team")`);
await sleep(2500);
await c.evaluate(`(async () => {
  const fs = window.__fs;
  const own = [...fs.files.keys()].find((k) => /peer-[A-Za-z0-9_-]+\\.automerge$/.test(k));
  if (!own) throw new Error("no history written yet");
  const dir = own.split("/").slice(0, -1);
  const enc = (o) => new TextEncoder().encode(JSON.stringify(o));
  for (const [id, name, ago] of [["mara0001", "Mara", 30e3], ["timo0002", "Timo", 20 * 60e3]]) {
    await fs.write([...dir, "peer-" + id + ".automerge"], fs.files.get(own).data);
    await fs.write([...dir, "peer-" + id + ".profile.json"], enc({ name, avatar: null }));
    await fs.write([...dir, "peer-" + id + ".activity.json"], enc({ editedAt: Date.now() - ago }));
  }
})()`);
await sleep(7000); // (the folder is looked at every five seconds)
r = await cardRect();
await atLeast(`${CARD}.querySelector(".weft-folder-sync-state")`, 6, "folder-on");
// (the line with the others' pictures breaks into two in some languages: it is two lines high everywhere)
await c.evaluate(`${CARD}.querySelector(".weft-folder-peers").style.minHeight = "60px"`);
const peersHeight = await c.evaluate(`${CARD}.querySelector(".weft-folder-peers").getBoundingClientRect().height`);
if (peersHeight > 60.5) over.push("folder-on peers: " + peersHeight + " px high");
f = await c.evaluate(box(FOLDER_FIELD));
const stopButton = await c.evaluate(box(`${CARD}.querySelector(".weft-ghost-button")`));
await picture("folder-on", [r[0] - 6, f[1] - 10, r[2] + 6, stopButton[3] + 14], {
  graphic: box(`${CARD}.querySelector(".weft-folder-link-graphic")`), state: box(`${CARD}.querySelector(".weft-folder-sync-state")`), peers: box(`${CARD}.querySelector(".weft-folder-peers")`),
});
await c.evaluate(`window.__session.stopFolderSync(true)`);
await sleep(500);

// ---- the card with the switch on ----
await click(...folienTab, 400);
await click(...settingsTab, 800);
await cardRect();
const switchAt = await c.evaluate(`(() => { const r = ${CARD}.querySelector(".weft-field-inline input[type=checkbox]").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
await click(...switchAt, 2000);
r = await cardRect();
const copyBottom = (await c.evaluate(box(`${CARD}.querySelector("input[readonly] + button")`)))[3];
await picture("card-on", [r[0] - 6, r[1] - 6, r[2] + 6, copyBottom + 14], {
  switch: box(`${CARD}.querySelector(".weft-field-inline")`), link: box(`${CARD}.querySelector("input[readonly]")`), copy: box(`${CARD}.querySelector("input[readonly] + button")`),
});
await click(...switchAt, 600); // (off again)

// ---- the dialog "Einladung beitreten" with a link in it ----
await click(38, 22, 600);
const join = await c.evaluate(`(() => { const b=[...document.querySelectorAll("button, [role=menuitem]")].find(b=>b.textContent.trim()===${JSON.stringify(JOIN)}); if(!b) return null; const r=b.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]; })()`);
if (!join) { await c.shot(`${OUT}/debug.png`); throw new Error("no menu item " + JOIN + " - see debug.png"); }
await click(...join, 900);
await c.send("Input.insertText", { text: LINK });
await sleep(500);
const modal = `document.querySelector(".weft-modal")`;
await atLeast(`${modal}.querySelectorAll("p.weft-hint")[0]`, 4, "join 1");
await atLeast(`${modal}.querySelectorAll("p.weft-hint")[1]`, 4, "join 2");
const m = await c.evaluate(box(modal));
await picture("join", [m[0] - 4, m[1] - 4, m[2] + 4, m[3] + 4], { link: box(`${modal}.querySelector("input")`), join: box(`${modal}.querySelector(".weft-modal-actions button:last-child")`) });
await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
await sleep(500);

// ---- the network group of the app's settings ----
await click(1566, 22, 900); // (the gear at the top right)
await c.evaluate(`[...document.querySelectorAll("h2")].find(e=>e.textContent.startsWith(${JSON.stringify(NETWORK)})).scrollIntoView({block:"start"})`);
await sleep(500);
const group = `[...document.querySelectorAll("h2")].find(e=>e.textContent.startsWith(${JSON.stringify(NETWORK)})).closest("section")`;
await atLeast(`${group}.querySelectorAll(".weft-hint")[0]`, 4, "network");
const g = await c.evaluate(box(group));
const pwBottom = (await c.evaluate(box(`${group}.querySelectorAll("label")[2]`)))[3];
await picture("network", [g[0] - 4, g[1] - 4, g[2] + 4, pwBottom + 12], {
  turn: box(`${group}.querySelectorAll("label")[0]`), user: box(`${group}.querySelectorAll("label")[1]`), password: box(`${group}.querySelectorAll("label")[2]`), hint: box(`${group}.querySelectorAll(".weft-hint")[1]`),
});
c.close();
if (over.length) console.error("MORE LINES THAN ROOM:", over.join("; "));
writeFileSync(`${OUT}/rects.json`, JSON.stringify(rects, null, 1));
console.log("captured", UI, JSON.stringify(Object.fromEntries(Object.entries(rects).map(([k, v]) => [k, v.size]))));
