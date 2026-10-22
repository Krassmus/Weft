import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CliError } from "./load";

/**
 * A headless Chrome that stays open, driven through the DevTools protocol: load a page, run script in it, press keys, take a picture.
 * What `weft render` cannot do (it takes one picture and ends Chrome): look at a page after something happened in it - what the
 * checks of `weft validate --layout` and `weft play` need.
 *
 * Needs the same Chrome as `weft render` (see findChrome in render.ts) and Node 22 (the global WebSocket).
 */
export class ChromeSession {
  private socket!: WebSocket;
  private nextId = 0;
  private pending = new Map<number, (message: { result?: unknown; error?: { message: string } }) => void>();
  private child!: ChildProcess;
  private profile!: string;

  static async open(chrome: string, width: number, height: number): Promise<ChromeSession> {
    const session = new ChromeSession();
    session.profile = mkdtempSync(join(tmpdir(), "weft-chrome-"));
    session.child = spawn(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--allow-file-access-from-files",
        "--force-device-scale-factor=1",
        "--remote-debugging-port=0",
        `--user-data-dir=${session.profile}`,
        `--window-size=${width},${height}`,
        "about:blank",
      ],
      { stdio: "ignore" },
    );
    try {
      const port = await session.waitForPort();
      const pageSocket = await session.pageSocketUrl(port);
      session.socket = new WebSocket(pageSocket);
      await new Promise<void>((resolve, reject) => {
        session.socket.onopen = () => resolve();
        session.socket.onerror = () => reject(new Error("Chrome nimmt keine Verbindung an."));
      });
      session.socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } };
        if (message.id !== undefined) {
          session.pending.get(message.id)?.(message);
          session.pending.delete(message.id);
        }
      };
      await session.send("Page.enable");
      await session.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      return session;
    } catch (error) {
      session.close();
      throw error instanceof CliError ? error : new CliError(`Chrome ließ sich nicht steuern: ${(error as Error).message}`);
    }
  }

  private async waitForPort(): Promise<number> {
    const file = join(this.profile, "DevToolsActivePort");
    for (let i = 0; i < 100; i++) {
      if (existsSync(file)) {
        const port = Number(readFileSync(file, "utf8").split("\n")[0]);
        if (port > 0) return port;
      }
      await sleep(100);
    }
    throw new CliError("Chrome wurde nicht rechtzeitig bereit.");
  }

  private async pageSocketUrl(port: number): Promise<string> {
    for (let i = 0; i < 50; i++) {
      try {
        const list = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
        const page = list.find((target) => target.type === "page");
        if (page) return page.webSocketDebuggerUrl;
      } catch {
        // not up yet
      }
      await sleep(100);
    }
    throw new CliError("Chrome hat keine Seite geöffnet.");
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      this.pending.set(id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Loads a file and waits until the page has been drawn (the load event, the fonts, two frames). */
  async load(path: string): Promise<void> {
    await this.send("Page.navigate", { url: `file://${path}` });
    for (let i = 0; i < 100; i++) {
      if ((await this.eval("document.readyState")) === "complete") break;
      await sleep(100);
    }
    await this.eval("document.fonts ? document.fonts.ready.then(() => true) : true");
    await this.settle();
  }

  /** Waits for the animations the player starts when a page shows (and the frames they need). */
  async settle(ms = 700): Promise<void> {
    await sleep(ms);
    await this.eval("new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))");
  }

  /** Runs an expression in the page and returns its value (JSON). */
  async eval<T = unknown>(expression: string): Promise<T> {
    const response = (await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })) as {
      result?: { value?: T };
      exceptionDetails?: { exception?: { description?: string }; text?: string };
    };
    if (response.exceptionDetails) throw new CliError(`Fehler in der Seite: ${response.exceptionDetails.exception?.description ?? response.exceptionDetails.text}`);
    return response.result?.value as T;
  }

  async key(key: string, code = key): Promise<void> {
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: KEY_CODES[key] ?? 0 });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: KEY_CODES[key] ?? 0 });
  }

  async screenshot(): Promise<Uint8Array> {
    const result = (await this.send("Page.captureScreenshot", { format: "png" })) as { data: string };
    return new Uint8Array(Buffer.from(result.data, "base64"));
  }

  close(): void {
    try {
      this.socket?.close();
    } catch {
      // already closed
    }
    this.child?.kill("SIGKILL");
    // Chrome's helper processes may still be writing into the profile for a moment: try again, and never fail over a temporary folder.
    if (this.profile) {
      try {
        rmSync(this.profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
      } catch {
        // left in the temporary folder
      }
    }
  }
}

const KEY_CODES: Record<string, number> = { ArrowRight: 39, ArrowLeft: 37, " ": 32, Enter: 13, Escape: 27 };

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
