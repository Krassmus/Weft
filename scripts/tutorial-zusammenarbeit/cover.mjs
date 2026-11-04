// The cover picture of the tutorial (what its tile on the start screen shows): node cover.mjs <out.png> - the picture assets/cover.svg (drawings.py), 640 x 360.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../tutorial-erstes-lernmodul/cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const chrome = await launch(1280, 720, 1);
await chrome.goto("file://" + join(here, "assets", "cover.svg"));
await chrome.shot(process.argv[2], { x: 0, y: 0, width: 1280, height: 720 }, 0.4); // (a picture of 512 x 288 is enough for a tile)
chrome.close();
