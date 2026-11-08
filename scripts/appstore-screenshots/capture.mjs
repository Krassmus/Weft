// Screenshots of Weft for the Mac App Store, in every language of the interface:
//   node capture.mjs <folder> [languages, e.g. de,en]
// Needs the dev server (`npm run dev`, port 1420) and an installed Chrome. Makes <folder>/<language>/01-….png … 05-….png, each 2560 x 1600 pixels
// (a window of 1280 x 800 at the sharpness of a Retina screen - one of the sizes the Mac App Store takes: 1280x800, 1440x900, 2560x1600, 2880x1800).
//
// What they show (every one of them exists in all eight languages, so the pictures are in the language of the interface):
//   01-editor      the editor with the template "Lernpyramide" (the slide with the sorting exercise, the exercise selected)
//   02-werkzeuge   the same, with the "+" above the slide open: every kind of element that can be put on a slide
//   03-tutorial-…  the three tutorials of the start screen, played: "Mit Lernmodulen arbeiten", "Ein interaktives Video erstellen", "Gemeinsam arbeiten"
// (No picture of the start screen: people see it when they start the app for the first time.)
// The pictures are of the web version of the app (the same page the desktop app shows), so there is no window frame around them. The bar above the editor
// with "Datei", undo, redo and the settings only exists where the app has no menu bar of its own (a browser, the iPad): the Mac has its menu bar, so the
// bar is hidden here (CSS below) and the pictures show the editor as it looks on the Mac.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { launch, sleep } from "../tutorial-erstes-lernmodul/cdp.mjs";

const OUT = process.argv[2];
const LANGS = (process.argv[3] || "de,en,es,fr,pt,it,tr,pl").split(",");
// ONLY=01-editor,02-werkzeuge,03-tutorial-lernmodul … takes just those pictures again
// DEVICE=ipad makes the pictures for the iPad instead (2752 x 2064 pixels - a 13" iPad across, a window of 1376 x 1032 at Retina sharpness; the App Store
// takes 2752x2064, 2064x2752, 2732x2048 and 2048x2732): the bar above the editor stays (on the iPad it belongs to the app). Use another folder for them.
const IPAD = process.env.DEVICE === "ipad";
const want = (name) => !process.env.ONLY || process.env.ONLY.split(",").includes(name);
const TEMPLATE_FILE = new URL("../../src/start-content/templates/lernpyramide.weft", import.meta.url).pathname;

// The names of the two branches of the template ("Order correct?" with "Correct"/"Almost", "Sceptical?" with "Correct"/"Surprised") are English in every language
// (the name of a branch is one text, it has no translations) - in a picture of the editor in French that would look wrong. So the pictures use a copy of the
// template in which the branches are named in the language of the interface, as a person working in that language would name them. (The template itself stays.)
const BRANCH_NAMES = {
  de: { "Order correct?": "Reihenfolge richtig?", Correct: "Richtig", Almost: "Fast", "Sceptical?": "Skeptisch?", Surprised: "Überrascht" },
  en: {},
  es: { "Order correct?": "¿Orden correcto?", Correct: "Correcto", Almost: "Casi", "Sceptical?": "¿Escéptico?", Surprised: "Sorprendido" },
  fr: { "Order correct?": "Bon ordre ?", Correct: "Correct", Almost: "Presque", "Sceptical?": "Sceptique ?", Surprised: "Surpris" },
  pt: { "Order correct?": "Ordem correta?", Correct: "Correto", Almost: "Quase", "Sceptical?": "Cético?", Surprised: "Surpreso" },
  it: { "Order correct?": "Ordine corretto?", Correct: "Corretto", Almost: "Quasi", "Sceptical?": "Scettico?", Surprised: "Sorpreso" },
  tr: { "Order correct?": "Sıra doğru mu?", Correct: "Doğru", Almost: "Neredeyse", "Sceptical?": "Şüpheci mi?", Surprised: "Şaşırmış" },
  pl: { "Order correct?": "Kolejność poprawna?", Correct: "Poprawnie", Almost: "Prawie", "Sceptical?": "Sceptycznie?", Surprised: "Zaskoczony" },
};
function templateFor(lang) {
  const names = BRANCH_NAMES[lang] ?? {};
  if (!Object.keys(names).length) return TEMPLATE_FILE;
  const dir = mkdtempSync(`${tmpdir()}/weft-appstore-`);
  execFileSync("unzip", ["-q", TEMPLATE_FILE, "-d", dir]);
  let json = readFileSync(`${dir}/weft.json`, "utf8");
  for (const [from, to] of Object.entries(names)) {
    const quoted = JSON.stringify(from);
    if (!json.includes(quoted)) throw new Error(`branch name ${quoted} is not in the template any more`);
    json = json.split(quoted).join(JSON.stringify(to));
  }
  writeFileSync(`${dir}/weft.json`, json);
  const file = `${dir}.weft`;
  execFileSync("zip", ["-q", "-r", file, "."], { cwd: dir }); // (everything: weft.json, the page, the picture and assets/)
  return file;
}
const OPEN_FILE = { de: "Datei öffnen", en: "Open file", es: "Abrir archivo", fr: "Ouvrir un fichier", pt: "Abrir arquivo", it: "Apri file", tr: "Dosya aç", pl: "Otwórz plik" };
// the tutorials by their place in the row on the start screen, and how many times the arrow key is pressed (slides and steps) to reach what is shown
const TUTORIALS = [
  { name: "03-tutorial-lernmodul", card: 1, presses: Number(process.env.P1 ?? 10) },
  { name: "04-tutorial-video", card: 2, presses: 0 },
  { name: "05-tutorial-zusammenarbeit", card: 3, presses: 0 },
];

for (const lang of LANGS) {
  const dir = `${OUT}/${lang}`;
  mkdirSync(dir, { recursive: true });
  const template = templateFor(lang);
  const c = await launch(IPAD ? 1376 : 1280, IPAD ? 1032 : 800, 2);
  await c.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem("weft:language","${lang}");
      ${IPAD ? "" : `document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = ".weft-appbar { display: none !important; }"; document.head.appendChild(s); });`}`,
  });
  await c.send("Page.setInterceptFileChooserDialog", { enabled: true });
  c.on(async (m) => {
    if (m.method === "Page.fileChooserOpened") await c.send("DOM.setFileInputFiles", { files: [template], backendNodeId: m.params.backendNodeId });
  });

  // 01 and 02 - the editor: the template, the slide with the sorting exercise, the exercise selected; then the "+" open
  if (want("01-editor") || want("02-werkzeuge")) {
  await c.goto("http://localhost:1420/");
  await sleep(1500);
  const open =await c.evaluate(`(() => { const b=[...document.querySelectorAll("button")].find(b=>new RegExp(${JSON.stringify(OPEN_FILE[lang])}).test(b.textContent)); const r=b.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]; })()`);
  await c.clickAt(...open);
  await sleep(4500);
  // 02 first, while nothing is selected: the panel on the right then shows a hint (translated) - with a slide or an element chosen it would list the names of the
  // elements, and those are English in the template. The button "Element hinzufügen" above the slide opens the menu with all kinds of elements.
  if (want("02-werkzeuge")) {
    const plus = await c.evaluate(`(() => { const b = document.querySelector(".weft-canvas-add-button"); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    if (!plus) throw new Error("no button for adding an element above the slide");
    await c.clickAt(...plus);
    await sleep(1200);
    await c.shot(`${dir}/02-werkzeuge.png`);
    for (const type of ["keyDown", "keyUp"]) await c.send("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(500);
  }
  // (the third slide: the exercise in which the seven ways of learning are put in order. Its graph of events says only what the app translates -
  // on the slides where elements appear it says "… erscheint" in German in every language, a gap of the editor that does not belong in a store picture)
  const MAIN = `[...document.querySelectorAll(".weft-node-page")].filter((b) => !b.closest(".weft-branch-pages"))`;
  await c.evaluate(`${MAIN}[2].scrollIntoView({block:"start"})`);
  await sleep(300);
  const slide = await c.evaluate(`(() => { const r = ${MAIN}[2].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  await c.clickAt(...slide);
  await sleep(1500);
  // (the exercise itself: the biggest element on the slide that is not the whole slide - clicked at its left edge, where no object of it is, so that nothing in it
  // is taken for being edited)
  const block = await c.evaluate(`(() => {
    const stage = document.querySelector(".weft-canvas-stage-wrap").getBoundingClientRect();
    const candidates = [...document.querySelectorAll(".weft-edit-block")].map((b) => { const r = b.getBoundingClientRect(); return { x: r.x + 8, y: r.y + r.height / 2, area: r.width * r.height }; }).filter((b) => b.area < stage.width * stage.height * 0.5);
    candidates.sort((a, b) => b.area - a.area);
    return candidates.length ? [candidates[0].x, candidates[0].y] : null;
  })()`);
  if (block) await c.clickAt(...block);
  await sleep(1200);
  if (want("01-editor")) await c.shot(`${dir}/01-editor.png`);
  }

  // 03 - 05: the tutorials, played
  for (const t of TUTORIALS.filter((t) => want(t.name))) {
    await c.goto("http://localhost:1420/");
    await sleep(1500);
    await c.evaluate(`document.querySelectorAll(".weft-start-card")[${t.card}].scrollIntoView({block:"center"})`);
    await sleep(400);
    const p = await c.evaluate(`(() => { const r = document.querySelectorAll(".weft-start-card")[${t.card}].getBoundingClientRect(); return [r.x + r.width / 2, r.y + 60]; })()`);
    await c.clickAt(...p);
    await sleep(3500);
    for (let i = 0; i < t.presses; i++) {
      for (const type of ["keyDown", "keyUp"]) await c.send("Input.dispatchKeyEvent", { type, key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
      await sleep(i === t.presses - 1 ? 2800 : 1200); // (a key pressed while an element is still appearing is lost)
    }
    await c.shot(`${dir}/${t.name}.png`);
  }
  c.close();
  console.log(lang, "done");
}
