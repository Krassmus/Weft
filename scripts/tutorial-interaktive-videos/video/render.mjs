// Makes the tutorial's video: every frame of anim.html (headless Chrome), then ffmpeg. Usage: node render.mjs <out.mp4>
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { launch } from "../../tutorial-erstes-lernmodul/cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2];
const FPS = 20;
const frames = mkdtempSync(join(tmpdir(), "weft-video-"));
const chrome = await launch(1280, 720, 1);
await chrome.goto("file://" + join(here, "anim.html"));
const duration = await chrome.evaluate("window.DURATION");
const count = Math.round(duration * FPS);
for (let i = 0; i < count; i++) {
  await chrome.evaluate(`window.draw(${i / FPS})`);
  await chrome.shot(join(frames, String(i).padStart(4, "0") + ".jpg"));
}
chrome.close();
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(frames, "%04d.jpg"), "-vf", "scale=800:450:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-c:v", "libx264", "-crf", "30", "-preset", "veryslow", "-movflags", "+faststart", out]);
rmSync(frames, { recursive: true, force: true });
console.log(`${out}: ${duration} s, ${count} frames`);
