// The cover picture of the tutorial (what its tile on the start screen shows): node cover.mjs <out.png>
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../../tutorial-erstes-lernmodul/cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const chrome = await launch(1280, 720, 1);
await chrome.goto("file://" + join(here, "anim.html"));
await chrome.evaluate("window.cover()");
await chrome.shot(process.argv[2], { x: 0, y: 0, width: 1280, height: 720 }, 0.5); // (a picture of 640 x 360 is enough for a tile)
chrome.close();
