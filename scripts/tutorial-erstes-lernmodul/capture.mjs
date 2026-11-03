// Takes the pictures of the Weft editor that part B of the tutorial shows (crops of the real editor, 2x, as JPEG), in the interface language UI
// (de, en, es, fr, pt, it, tr, pl): `node capture.mjs <module.weft> <folder> [ui language]`. The module should have that language as its default one (the slides
// in the pictures are then in it too; see build.sh's `variants`).
import { writeFileSync } from "node:fs";
import { launch, sleep } from "./cdp.mjs";
const [MODULE, OUT, UI = "de"] = process.argv.slice(2);
const LANGMODULE = MODULE; // (the module offers all its languages itself)
// The words of "Open file…" on the start screen, by interface language.
const OPEN_FILE = { de: "Datei öffnen", en: "Open file", es: "Abrir archivo", fr: "Ouvrir un fichier", pt: "Abrir arquivo", it: "Apri file", tr: "Dosya aç", pl: "Otwórz plik" }[UI];

async function session(module) {
  const c = await launch(1600, 900, 2);
  await c.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("weft:language","${UI}")` });
  await c.send("Page.setInterceptFileChooserDialog", { enabled: true });
  c.on(async (m) => {
    if (m.method === "Page.fileChooserOpened") await c.send("DOM.setFileInputFiles", { files: [module], backendNodeId: m.params.backendNodeId });
  });
  await c.goto("http://localhost:1420/");
  const r = await c.evaluate(`(() => { const b=[...document.querySelectorAll("button")].find(b=>new RegExp(${JSON.stringify(OPEN_FILE)}).test(b.textContent)); const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await c.clickAt(r.x, r.y);
  await sleep(3500);
  return c;
}
// Where things are: what depends on the width of a word (the tabs, the + above the slide) is looked up, the rest stands where it always does.
const tab = (c, i) => c.evaluate(`(() => { const r=document.querySelectorAll("[role=tab]")[${i}].getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]; })()`);
const plus = (c) => c.evaluate(`(() => { const r=[...document.querySelectorAll("button")].map(b=>b.getBoundingClientRect()).filter(r=>r.y>45&&r.y<60&&r.x>270).sort((a,b)=>a.x-b.x)[1]; return [r.x, r.y+r.height/2, r.width]; })()`);
const S = { w: 916, h: 516, x: 325, y: 144 };
const onSlide = (px, py) => [S.x + (px / 100) * S.w, S.y + (py / 100) * S.h];
const crop = (x, y, width, height) => ({ x, y, width, height });

let c = await session(MODULE);
const click = async (x, y, wait = 700) => { await c.clickAt(x, y); await sleep(wait); };
const rects = {}; // by crop: the elements the callouts point to, in pixels of the crop (rects.json - partb.py draws its rings around them)
const shot = (name, clip, scale) => c.shot(`${OUT}/${name}.jpg`, clip, scale);
// The panel on the right: what is in it moves with the length of the words (a paragraph of three lines in one language is five in another), so a picture of
// it is cut where an element of it is, not at a fixed place. `anchor`: the expression for the top of that element; `above`: how far above it the picture begins;
// `named`: expressions for the rectangles [x0, y0, x1, y1] that are to be written down (they are shifted to the picture's own pixels).
async function panelShot(name, { anchor, above, height, named = {} }) {
  const top = await c.evaluate(anchor);
  const clip = crop(1313, Math.round(top - above), 274, height);
  const found = {};
  for (const [key, expression] of Object.entries(named)) {
    const r = await c.evaluate(expression);
    found[key] = [r[0] - clip.x, r[1] - clip.y, r[2] - clip.x, r[3] - clip.y].map((v) => Math.round(v));
  }
  rects[name] = found;
  await shot(name, clip);
}
const inspector = `document.querySelector(".weft-inspector-body")`;
const section = (i) => `document.querySelectorAll(".weft-inspector .weft-collapsible")[${i}]`;
const box = (expr) => `(() => { const r = (${expr}).getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })()`;
const union = (...exprs) => `(() => { const rs = [${exprs.join(",")}].map((e) => e.getBoundingClientRect()); return [Math.min(...rs.map((r) => r.left)), Math.min(...rs.map((r) => r.top)), Math.max(...rs.map((r) => r.right)), Math.max(...rs.map((r) => r.bottom))]; })()`;
const inputs = `[...document.querySelectorAll(".weft-inspector input")]`;

// slide 3 selected: the overview, the layout panel
await click(143, 432);
// (The whole window is shown at about half the width of the slide: no need for it to be sharper than the screen.)
await shot("overview", crop(0, 0, 1600, 900), 0.5);
await shot("layout-panel", crop(1313, 98, 274, 232));
// the + menu (the crop moves with the button: in German it starts 3 px left of it, 18 px)
const [plusX, plusY, plusW] = await plus(c);
await click(plusX + plusW / 2, plusY);
await shot("plus-menu", crop(plusX - 3, 50, 350, 490));
await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
await click(1100, 800, 300);
// the sort block
await click(...onSlide(70, 30));
await shot("sort-canvas", crop(750, 165, 445, 430));
await panelShot("sort-panel", {
  anchor: `${inputs}[0].closest("label").getBoundingClientRect().top`, above: 62, height: 300,
  named: { words: union(`${inputs}[0].closest("label")`, `${inputs}[1].closest("label")`) },
});
await panelShot("sort-required", {
  anchor: `${inputs}.find((i) => i.type === "checkbox").closest("label").getBoundingClientRect().top`, above: 16, height: 125,
  named: { tick: box(`${inputs}.find((i) => i.type === "checkbox").closest("label")`) },
});
await shot("timeline-sort", crop(275, 768, 1030, 124));
// the effects of the sort block that change variables: the 5th section ("when the order is right"), opened
await c.evaluate(`${section(4)}.scrollIntoView({ block: "center" })`);
await sleep(400);
const header = await c.evaluate(box(`${section(4)}.querySelector("header, button")`));
await click((header[0] + header[2]) / 2, (header[1] + header[3]) / 2, 800);
const row = `${section(4)}.querySelector("select").parentElement`;
await panelShot("effect-row", {
  anchor: `${section(4)}.getBoundingClientRect().top`, above: 12, height: 150,
  named: { row: box(row), more: box(`[...${section(4)}.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("+"))`) },
});
// slide 5: a tier
await click(143, 707);
await click(...onSlide(28, 52));
await shot("tier-canvas", crop(318, 180, 545, 455));
const fields = `[...${section(1)}.querySelector(".weft-collapsible-body").children]`;
await panelShot("tier-effect", {
  anchor: `${section(1)}.getBoundingClientRect().top`, above: 10, height: 366,
  named: { how: union(`${fields}[0]`, `${fields}[2]`), trigger: union(`${fields}[3]`, `${fields}[4]`) },
});
await shot("timeline-pyramid", crop(275, 818, 1030, 76));
// the fork
await click(130, 523);
await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 1450, y: 400, deltaX: 0, deltaY: -4000 });
await sleep(500);
await panelShot("fork-panel", {
  anchor: `${section(1)}.getBoundingClientRect().top`, above: 279, height: 420,
  named: { condition: box(`${section(1)}.querySelector(".weft-condition-row")`) },
});
await shot("fork-sidebar", crop(10, 500, 240, 135));
// variables
await click(...(await tab(c, 1)));
// (The list of variables is cut at its end - the "+ Variable" button - because the text above it is of different lengths.)
const addVariable = `[...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("+") && b.getBoundingClientRect().left < 270)`;
const variablesBottom = await c.evaluate(`${addVariable}.getBoundingClientRect().bottom`);
const variablesClip = crop(0, Math.round(variablesBottom + 8 - 330), 262, 330);
rects.variables = {};
for (const [key, expression] of Object.entries({
  row: box(`[...document.querySelectorAll("input")].find((i) => i.value === "score").parentElement`),
  add: box(addVariable),
})) {
  const r = await c.evaluate(expression);
  rects.variables[key] = [r[0] - variablesClip.x, r[1] - variablesClip.y, r[2] - variablesClip.x, r[3] - variablesClip.y].map((v) => Math.round(v));
}
await shot("variables", variablesClip);
// file menu
await click(...(await tab(c, 0)));
await click(38, 22);
await shot("file-menu", crop(10, 40, 262, 455));
c.close();

// the languages: a copy of the module that offers them
c = await session(LANGMODULE);
await click(...(await tab(c, 2)));
await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 130, y: 500, deltaX: 0, deltaY: 255 });
await sleep(600);
await shot("settings-languages", crop(10, 98, 240, 420));
c.close();
writeFileSync(`${OUT}/rects.json`, JSON.stringify(rects, null, 1));
console.log("captured");
