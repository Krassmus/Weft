// A headless Chrome driven over the DevTools protocol: opens the Weft editor (dev server), opens a module and takes pictures of it.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.WEFT_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch(width = 1600, height = 900, dpr = 1) {
  const profile = mkdtempSync(join(tmpdir(), "weft-shoot-"));
  const child = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", `--force-device-scale-factor=${dpr}`, "--remote-debugging-port=0", `--user-data-dir=${profile}`, `--window-size=${width},${height}`, "about:blank"], { stdio: "ignore" });
  let port = 0;
  for (let i = 0; i < 100 && !port; i++) {
    const f = join(profile, "DevToolsActivePort");
    if (existsSync(f)) port = Number(readFileSync(f, "utf8").split("\n")[0]);
    else await sleep(100);
  }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const pending = new Map();
  const handlers = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    if (m.id !== undefined) {
      pending.get(m.id)?.(m);
      pending.delete(m.id);
    } else handlers.forEach((h) => h(m));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, (m) => (m.error ? reject(new Error(method + ": " + m.error.message)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send("Page.enable");
  await send("DOM.enable");
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile: false });
  const api = {
    send,
    on: (h) => handlers.push(h),
    async evaluate(expression) {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    // `scale`: of the picture to what the screen (device pixels) has - 1: as sharp as the screen is, 0.5: half of that
    async shot(file, clip, scale = 1) {
      const jpeg = file.endsWith(".jpg");
      const r = await send("Page.captureScreenshot", { format: jpeg ? "jpeg" : "png", ...(jpeg ? { quality: 82 } : {}), ...(clip ? { clip: { ...clip, scale } } : {}) });
      writeFileSync(file, Buffer.from(r.data, "base64"));
    },
    async goto(url) {
      await send("Page.navigate", { url });
      await sleep(1800);
    },
    // clicks the element at a point (real mouse events)
    async clickAt(x, y) {
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
    },
    close() {
      try { ws.close(); } catch {}
      child.kill();
    },
  };
  return api;
}
