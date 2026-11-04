// Takes the pictures of the Weft editor that the tutorial shows (crops of the real editor, JPEG), in the interface language UI (de, en, es, fr, pt, it, tr, pl):
//   node capture.mjs <module.weft> <folder> [ui language]
// The module has slide 3 with the video, its time mark and the question (see build.py). Where things are is looked up in the page - what depends on the
// words of a language (the dialog's height, the labels of the graph) moves - and written down in rects.json (pixels of each crop), so that the rings of
// build.py sit in the same place in every language's picture.
import { writeFileSync } from "node:fs";
import { launch, sleep } from "../tutorial-erstes-lernmodul/cdp.mjs";
const [MODULE, OUT, UI = "de"] = process.argv.slice(2);
const OPEN_FILE = { de: "Datei öffnen", en: "Open file", es: "Abrir archivo", fr: "Ouvrir un fichier", pt: "Abrir arquivo", it: "Apri file", tr: "Dosya aç", pl: "Otwórz plik" }[UI];
// The name of the video as the variant of this language has it (variants.py) - it is looked up in the list of the slide's elements.
const VIDEO_NAME = { de: "Video (mit Zeitmarke)", en: "Video (with time mark)", es: "Vídeo (con marca de tiempo)", fr: "Vidéo (avec repère temporel)", pt: "Vídeo (com marca de tempo)", it: "Video (con marcatore temporale)", tr: "Video (zaman işaretli)", pl: "Wideo (ze znacznikiem czasu)" }[UI];
process.env.WEFT_JPEG_QUALITY ||= "70"; // (the installation is not to grow: these pictures are small on purpose)
const SCALE = 0.62; // of what the screen (2x) has: the pictures only have to be seen at about the size of the slide

const c = await launch(1600, 900, 2);
await c.send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("weft:language","${UI}")` });
await c.send("Page.setInterceptFileChooserDialog", { enabled: true });
c.on(async (m) => {
  if (m.method === "Page.fileChooserOpened") await c.send("DOM.setFileInputFiles", { files: [MODULE], backendNodeId: m.params.backendNodeId });
});
await c.goto("http://localhost:1420/");
const open = await c.evaluate(`(() => { const b=[...document.querySelectorAll("button")].find(b=>new RegExp(${JSON.stringify(OPEN_FILE)}).test(b.textContent)); const r=b.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]; })()`);
await c.clickAt(...open);
await sleep(4000);

const click = async (x, y, wait = 700) => { await c.clickAt(x, y); await sleep(wait); };
const centre = (expr) => c.evaluate(`(() => { const r = (${expr}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
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

// slide 3 (the third thumbnail), the video in the list of the slide's elements
await click(143, 432);
// the + menu above the slide, with the question in it (it is the 4th of the "interactive" column: the 15th button)
const plusAt = await c.evaluate(`(() => { const r=[...document.querySelectorAll("button")].map(b=>b.getBoundingClientRect()).filter(r=>r.y>45&&r.y<60&&r.x>270).sort((a,b)=>a.x-b.x)[1]; return [r.x+r.width/2, r.y+r.height/2]; })()`);
await click(...plusAt, 800);
const popup = `(() => { let e = document.elementFromPoint(${plusAt[0]} + 60, ${plusAt[1]} + 140); while (e && !(e.getBoundingClientRect().width > 250 && e.getBoundingClientRect().height > 300)) e = e.parentElement; return e; })()`;
const popupRect = await c.evaluate(box(popup));
// (the menu is higher in a language whose words break into two lines: the picture is cut to the same height everywhere, at the top of it)
await picture("plus-menu", [popupRect[0] - 6, popupRect[1] - 6, popupRect[2] + 6, popupRect[1] + 340], { quiz: box(`${popup}.querySelectorAll("button")[14]`) });
await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
await sleep(400);
await click(800, 22, 500); // (the empty bar at the top: the menu is surely closed)
const videoItem = await c.evaluate(`(() => { const e=[...document.querySelectorAll(".weft-inspector *")].filter(e=>e.textContent.trim()===${JSON.stringify(VIDEO_NAME)}).pop(); if (!e) return null; const r=e.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]; })()`);
if (!videoItem) { await c.shot(`${OUT}/debug.png`); throw new Error("the video is not in the list of elements - see debug.png"); }
await click(...videoItem);

// the dialog of the time marks, with the mark chosen
const configure = await c.evaluate(`(() => { const b=[...document.querySelectorAll(".weft-inspector button")].find(b=>b.textContent.includes("Zeitmarken konfig") || /configur|konfigur|configurar|configurer|configura|yapılandır|konfiguruj|ayarla/i.test(b.textContent)); const r=b.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]; })()`);
await click(...configure, 900);
await click(...(await centre(`document.querySelector(".weft-stop-point-marker")`)), 1000);
const modal = `document.querySelector(".weft-modal")`;
const mx = await c.evaluate(box(modal));
const mark = `document.querySelector(".weft-stop-point-marker")`;
const controls = `document.querySelector(".weft-stop-point-controls")`;
const settings = `document.querySelector(".weft-stop-point-settings")`;
const stopBox = `${settings}.querySelector("label")`;
const stopRect = await c.evaluate(box(stopBox));
const ctrlTop = await c.evaluate(`${controls}.getBoundingClientRect().top`);
await picture("dialog-mark", [mx[0], ctrlTop - 5, mx[2], stopRect[3] + 12], {
  mark: box(mark), button: box(`document.querySelector(".weft-stop-point-actions button")`), title: box(`${settings}.querySelector(".weft-stop-point-settings-title")`), stop: box(stopBox),
});
const shows = `document.querySelector(".weft-stop-point-shows")`;
const showsRect = await c.evaluate(box(shows));
await picture("dialog-shows", [mx[0], showsRect[1] - 12, mx[2], showsRect[3] + 12], {
  row: box(`document.querySelector(".weft-stop-point-shows-row")`), again: box(`document.querySelector(".weft-stop-point-shows-again")`), select: box(`${shows}.querySelector("select")`),
});
await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
await sleep(600);

// the graph below the slide, and the panel of "Start des Videos" (the 4th point of the graph)
const graph = await c.evaluate(box(`document.querySelector(".weft-timeline")`));
const icons = `[...document.querySelectorAll(".weft-timeline-node-icon")]`;
// (a click on empty paper first: nothing of the slide is selected then)
await click(...(await centre(`${icons}[3]`)), 900);
const inspector = await c.evaluate(box(`document.querySelector(".weft-inspector")`));
const panelTop = await c.evaluate(`document.querySelector(".weft-inspector-body").getBoundingClientRect().top`);
const sections = `[...document.querySelectorAll(".weft-inspector .weft-collapsible")]`;
const trig = `${sections}[0]`;
const trigRect = await c.evaluate(box(trig));
await picture("event-panel", [inspector[0], panelTop - 4, inspector[2], trigRect[3] + 10], {
  type: box(`${trig}.querySelector("select")`), delay: box(`${trig}.querySelector("input[type=number], input[type=text]").closest("div")`), after: box(`${trig}.querySelectorAll("select")[1]`),
});
// the graph again, with nothing chosen: a picture of the whole of it, the points of the video and the question marked
await click(1120, 150, 600); // empty canvas around the slide
await picture("graph", [graph[0], graph[1] + 4, graph[2], graph[3]], {
  mark: box(`${icons}[4]`), submitted: box(`${icons}[2]`), start: box(`${icons}[3]`), shown: box(`${icons}[5]`), resume: box(`${icons}[6]`), gone: box(`${icons}[7]`),
});
c.close();
writeFileSync(`${OUT}/rects.json`, JSON.stringify(rects, null, 1));
console.log("captured", UI);
