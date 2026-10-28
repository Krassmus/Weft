import { readdirSync, readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderIframe } from "../src/core/blocks/iframe/render.js";
import { renderSolution } from "../src/core/blocks/solution/render.js";

/**
 * What a block looks like (core/blocks/<kind>/render.js): one function for the player, the canvas, the thumbnails and the PDF, told where it draws
 * (its mode). Each is drawn in every mode, in a DOM of its own (linkedom), and what the mode decides is checked: what can be used where, what is shown
 * where. How it looks (the stylesheet) is not here - that is what the player is measured by.
 */

type Mode = "play" | "edit" | "thumbnail" | "print";
const MODES: Mode[] = ["play", "edit", "thumbnail", "print"];

beforeAll(() => {
  const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
  // (A page has an address: a relative one is read against it.)
  (window as unknown as { location: unknown }).location = { href: "https://player.example/index.html" };
  Object.assign(globalThis, { window, document });
});

const element = () => document.createElement("div");
const find = (root: Element, selector: string) => root.querySelector(selector);
const fire = (target: Element, type: string) => target.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true }));

// ---- what each renderer is given ---------------------------------------------------------------------------------------------------------

const WORDS: Record<string, string> = {
  submit: "Abschicken",
  correct: "Richtig",
  incorrect: "Falsch",
  solutionWord: "Lösungswort",
  solutionAttemptsLeft: "Noch {n}",
  embedded: "Eingebettete Seite",
  noAddress: "(keine Adresse)",
};
const text = (key: string) => WORDS[key] ?? "";
const textWith = (key: string, values: Record<string, string | number>) => text(key).replace(/\{(\w+)\}/g, (all, name: string) => String(values[name] ?? all));
const ICONS = { submit: "<svg id='submit'></svg>", correct: "<svg id='ok'></svg>", incorrect: "<svg id='no'></svg>", globe: "<svg id='globe'></svg>", qr: "<svg id='qr'></svg>" };

/** Every render.js there is must be run here: this is the list of what is run (a new one fails the test below until it is added). */
const RENDERERS = ["solution", "iframe"];

describe("the render functions", () => {
  it("are all tested here", () => {
    const kinds = readdirSync("src/core/blocks", { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && readdirSync(`src/core/blocks/${entry.name}`).includes("render.js"))
      .map((entry) => entry.name)
      .sort();
    expect(kinds).toEqual([...RENDERERS].sort());
  });

  it.each(RENDERERS)("%s: can be inlined into the player as it is (no imports; what is exported is taken away at the start of a line)", (kind) => {
    const source = readFileSync(`src/core/blocks/${kind}/render.js`, "utf8");
    expect(source).not.toMatch(/^\s*import\b/m);
    const inlined = source.replace(/^export /gm, "");
    expect(inlined).not.toMatch(/\bexport\b\s+(function|var|const|let|default)/);
    // The way the page has it: a script of its own that leaves the function there for the player after it.
    const name = kind === "solution" ? "renderSolution" : "renderIframe";
    expect(new Function(`${inlined}; return typeof ${name};`)()).toBe("function");
  });
});

// ---- the solution word ------------------------------------------------------------------------------------------------------------------

describe.each(MODES)("a solution word drawn for %s", (mode) => {
  const props = { id: "s1", solution: "Hund", placeholder: "Tier eintippen", caseSensitive: false, attempts: 1 };
  const context = () => ({ mode, text, textWith, icons: ICONS, fill: vi.fn(), attempt: vi.fn(), announce: vi.fn() });

  it("is drawn, can be drawn again with other words, and goes away", () => {
    const root = element();
    const instance = renderSolution(root, props, context());
    expect(root.childNodes.length).toBeGreaterThan(0);
    expect(find(root, ".weft-solution-input")?.getAttribute("placeholder")).toBe("Tier eintippen");
    instance.update({ ...props, placeholder: "" });
    expect(find(root, ".weft-solution-input")?.getAttribute("placeholder")).toBe("Lösungswort");
    instance.destroy();
    expect(root.childNodes.length).toBe(0);
  });

  it(mode === "play" ? "is used: a word is tried, and what follows is the place's to do" : "is only a picture: nothing can be used", () => {
    const root = element();
    const ctx = context();
    renderSolution(root, props, ctx);
    const input = find(root, ".weft-solution-input") as HTMLInputElement;
    const submit = find(root, ".weft-quiz-submit") as HTMLButtonElement;
    const feedback = find(root, ".weft-quiz-feedback") as HTMLElement;
    expect(feedback.hidden).toBe(true);
    input.value = "Katze";
    fire(input, "input");
    fire(submit, "click");
    if (mode === "play") {
      expect(ctx.fill).toHaveBeenCalledTimes(1);
      expect(ctx.attempt).toHaveBeenCalledWith({ right: false, finished: true });
      expect(feedback.hidden).toBe(false);
      expect(find(root, ".weft-solution-field")?.className).toContain("is-incorrect");
      expect(input.disabled).toBe(true);
    } else {
      expect(input.readOnly).toBe(true);
      expect(ctx.fill).not.toHaveBeenCalled();
      expect(ctx.attempt).not.toHaveBeenCalled();
      expect(feedback.hidden).toBe(true);
    }
  });

  if (mode === "play") {
    it("takes a right word (spaces and capital letters do not count) and is then locked", () => {
      const root = element();
      const ctx = context();
      renderSolution(root, props, ctx);
      const input = find(root, ".weft-solution-input") as HTMLInputElement;
      input.value = "  hUnD ";
      fire(find(root, ".weft-quiz-submit") as Element, "click");
      expect(ctx.attempt).toHaveBeenCalledWith({ right: true, finished: true });
      expect(ctx.announce).toHaveBeenCalledWith("Richtig");
      expect(input.disabled).toBe(true);
    });
  }
});

// ---- the embedded page ------------------------------------------------------------------------------------------------------------------

describe.each(MODES)("an embedded page drawn for %s", (mode) => {
  const page = { id: "i1", url: "https://example.org/x", sandbox: ["allow-scripts"], allow: "fullscreen", qrCode: false, presentationUrl: undefined, forcedViewportWidth: 400, heightOverWidth: 0.5, qrSvg: "<svg id='code'></svg>" as string | null };
  const context = () => ({ mode, text, icons: ICONS });
  const draw = (props = page) => {
    const root = element();
    const instance = renderIframe(root, props, context());
    return { root, instance };
  };

  it("is drawn, can be drawn again, and goes away - with or without a QR code, with or without an address", () => {
    for (const props of [page, { ...page, qrCode: true }, { ...page, url: "", qrSvg: null }, { ...page, qrCode: true, qrSvg: null }]) {
      const { root, instance } = draw(props);
      expect(root.childNodes.length).toBeGreaterThan(0);
      instance.update(props);
      instance.destroy();
      expect(root.childNodes.length).toBe(0);
    }
  });

  if (mode === "thumbnail") {
    it("is a grey box with an icon - a thumbnail loads no page", () => {
      for (const props of [page, { ...page, qrCode: true }]) {
        const { root } = draw(props);
        expect(find(root, "iframe")).toBeNull();
        expect(find(root, ".weft-iframe-placeholder-icon")?.innerHTML).toContain(props.qrCode ? "qr" : "globe");
      }
    });
  }

  if (mode === "print") {
    it("is a card with the address and the code - and the address is a link; with no address a grey box", () => {
      const { root } = draw();
      expect(find(root, "iframe")).toBeNull();
      expect(find(root, ".weft-iframe-card")?.getAttribute("data-pdf-link")).toBe("https://example.org/x");
      expect(find(root, ".weft-iframe-card-qr")?.innerHTML).toContain("code");
      expect(find(root, ".weft-iframe-card-url")?.textContent).toBe("https://example.org/x");
      expect(find(root, ".weft-iframe-card-label")?.textContent).toBe("Eingebettete Seite");
      const none = draw({ ...page, url: "" });
      expect(find(none.root, ".weft-iframe-card")).toBeNull();
      expect(find(none.root, ".weft-iframe-placeholder")).not.toBeNull();
      expect(find(draw({ ...page, qrSvg: null }).root, ".weft-iframe-card-qr")).toBeNull();
    });
  }

  if (mode === "play" || mode === "edit") {
    it("is the page in a frame of the width it is given, as high as the block's shape makes it", () => {
      const { root } = draw();
      const frame = find(root, "iframe") as HTMLIFrameElement;
      expect(frame.getAttribute("src")).toBe("https://example.org/x");
      expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
      expect(frame.style.width).toBe("400px");
      expect(frame.style.height).toBe("200px");
      expect(frame.getAttribute("title")).toBe("Eingebettete Seite: example.org");
      // (The width the module has none of: the one a module saved before it existed gets.)
      expect((find(draw({ ...page, forcedViewportWidth: undefined }).root, "iframe") as HTMLElement).style.width).toBe("768px");
    });

    it(mode === "play" ? "gives the page what it asks for (allow)" : "gives it nothing: the author's canvas is not where a page may ask for the camera", () => {
      const frame = find(draw().root, "iframe") as HTMLIFrameElement;
      expect(frame.getAttribute("allow")).toBe(mode === "play" ? "fullscreen" : null);
    });

    it("shows the code and the address with a QR code - and a click on the address is the page only where it is used", () => {
      const props = { ...page, qrCode: true, presentationUrl: "https://example.org/ergebnis" };
      const { root } = draw(props);
      expect(find(root, ".weft-qr-code")?.innerHTML).toContain("code");
      const link = find(root, ".weft-qr-link") as HTMLElement;
      expect(link.textContent).toBe("https://example.org/x");
      expect(find(root, "iframe")).toBeNull();
      fire(link, "click");
      if (mode === "play") {
        expect(find(root, ".weft-qr-gate")).toBeNull();
        expect(find(root, "iframe")?.getAttribute("src")).toBe("https://example.org/ergebnis");
      } else {
        expect(find(root, ".weft-qr-gate")).not.toBeNull();
        expect(find(root, "iframe")).toBeNull();
      }
    });

    it("marks the place of a code that cannot be drawn - in the editor; in the player there is none", () => {
      const { root } = draw({ ...page, qrCode: true, qrSvg: null, url: "" });
      expect(find(root, ".weft-qr-code") !== null).toBe(mode === "edit");
      expect(find(root, ".weft-qr-code.is-empty") !== null).toBe(mode === "edit");
      expect(find(root, ".weft-qr-link")?.textContent).toBe("(keine Adresse)");
    });
  }
});
