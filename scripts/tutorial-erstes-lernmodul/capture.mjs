// Takes the pictures of the Weft editor that part B of the tutorial shows (crops of the real editor, 2x, as JPEG).
import { launch, sleep } from "./cdp.mjs";
const [MODULE, OUT] = process.argv.slice(2);
const LANGMODULE = MODULE; // (the module offers all its languages itself)

async function session(module) {
  const c = await launch(1600, 900, 2);
  await c.send("Page.addScriptToEvaluateOnNewDocument", { source: 'localStorage.setItem("weft:language","de")' });
  await c.send("Page.setInterceptFileChooserDialog", { enabled: true });
  c.on(async (m) => {
    if (m.method === "Page.fileChooserOpened") await c.send("DOM.setFileInputFiles", { files: [module], backendNodeId: m.params.backendNodeId });
  });
  await c.goto("http://localhost:1420/");
  const r = await c.evaluate(`(() => { const b=[...document.querySelectorAll("button")].find(b=>/Datei öffnen/.test(b.textContent)); const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await c.clickAt(r.x, r.y);
  await sleep(3500);
  return c;
}
const S = { w: 916, h: 516, x: 325, y: 144 };
const onSlide = (px, py) => [S.x + (px / 100) * S.w, S.y + (py / 100) * S.h];
const crop = (x, y, width, height) => ({ x, y, width, height });

let c = await session(MODULE);
const click = async (x, y, wait = 700) => { await c.clickAt(x, y); await sleep(wait); };
const shot = (name, clip) => c.shot(`${OUT}/${name}.jpg`, clip);

// slide 3 selected: the overview, the layout panel
await click(143, 432);
await shot("overview", crop(0, 0, 1600, 900));
await shot("layout-panel", crop(1313, 98, 274, 232));
// the + menu
await click(398, 66);
await shot("plus-menu", crop(380, 50, 350, 490));
await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
await click(1100, 800, 300);
// the sort block
await click(...onSlide(70, 30));
await shot("sort-canvas", crop(750, 165, 445, 430));
await shot("sort-panel", crop(1313, 98, 274, 470));
await shot("sort-required", crop(1313, 575, 274, 125));
await shot("timeline-sort", crop(275, 768, 1030, 124));
// the effects of the sort block that change variables
await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 1450, y: 500, deltaX: 0, deltaY: 1500 });
await sleep(600);
await click(1440, 440, 800);
await shot("effect-row", crop(1313, 425, 274, 150));
console.log(JSON.stringify(await c.evaluate(`[...document.querySelectorAll("select")].filter(s=>[...s.options].some(o=>/setzen/.test(o.textContent))).map(s=>[...s.options].map(o=>o.textContent))`)));
// slide 5: a tier
await click(143, 707);
await click(...onSlide(28, 52));
await shot("tier-canvas", crop(318, 180, 545, 455));
await shot("tier-effect", crop(1313, 425, 274, 345));
await shot("timeline-pyramid", crop(275, 818, 1030, 76));
// the fork
await click(130, 523);
await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 1450, y: 400, deltaX: 0, deltaY: -4000 });
await sleep(500);
await shot("fork-panel", crop(1313, 98, 274, 420));
await shot("fork-sidebar", crop(10, 500, 240, 135));
// variables
await click(118, 70);
await shot("variables", crop(0, 88, 262, 330));
// file menu
await click(45, 70);
await click(38, 22);
await shot("file-menu", crop(10, 40, 262, 455));
c.close();

// the languages: a copy of the module that offers them
c = await session(LANGMODULE);
await click(202, 70);
await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 130, y: 500, deltaX: 0, deltaY: 255 });
await sleep(600);
await shot("settings-languages", crop(10, 98, 240, 420));
c.close();
console.log("captured");
