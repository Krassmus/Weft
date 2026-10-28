import { readdirSync, readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderIframe } from "../src/core/blocks/iframe/render.js";
import { renderLanguage } from "../src/core/blocks/language/render.js";
import { renderProgress } from "../src/core/blocks/progress/render.js";
import { linkHref, renderLink } from "../src/core/blocks/link/render.js";
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
  // (linkedom's drop-down cannot be given a value: it is told by the option that is selected, which is what a browser does.)
  const select = (window as unknown as { HTMLSelectElement: { prototype: object } }).HTMLSelectElement.prototype;
  Object.defineProperty(select, "value", {
    configurable: true,
    get(this: Element) {
      const options = [...this.querySelectorAll("option")];
      const chosen = options.find((option) => option.hasAttribute("selected")) ?? options[0];
      return chosen ? (chosen.getAttribute("value") ?? chosen.textContent ?? "") : "";
    },
    set(this: Element, value: string) {
      for (const option of this.querySelectorAll("option")) {
        if ((option.getAttribute("value") ?? option.textContent) === value) option.setAttribute("selected", "");
        else option.removeAttribute("selected");
      }
    },
  });
});

const element = () => document.createElement("div");
const find = (root: Element, selector: string) => root.querySelector(selector);
const fire = (target: Element, type: string) => target.dispatchEvent(new window.Event(type, { bubbles: true, cancelable: true }));

// ---- what each renderer is given ---------------------------------------------------------------------------------------------------------

const WORDS: Record<string, string> = {
  language: "Sprache",
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
const RENDERERS = ["solution", "iframe", "link", "progress", "language"];

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
    const name = { solution: "renderSolution", iframe: "renderIframe", link: "renderLink", progress: "renderProgress", language: "renderLanguage" }[kind];
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

// ---- the link ---------------------------------------------------------------------------------------------------------------------------

describe("where a link leads", () => {
  it("is a page, a mail address or a phone number - and nothing else", () => {
    expect(linkHref("https://example.org/a")).toBe("https://example.org/a");
    expect(linkHref(" http://example.org ")).toBe("http://example.org");
    expect(linkHref("mailto:a@example.org")).toBe("mailto:a@example.org");
    expect(linkHref("tel:+4912345")).toBe("tel:+4912345");
    for (const url of ["", "https://", "javascript:alert(1)", "data:text/html,x", "example.org", "ftp://example.org", undefined]) expect(linkHref(url as string)).toBe("");
  });
});

describe.each(MODES)("a link drawn for %s", (mode) => {
  const props = { href: "https://example.org/seite", label: "Zur Seite" };
  const open = vi.fn();
  const context = (withOpen = false) => ({ mode, icon: ICONS.globe, ...(withOpen ? { open } : {}) });

  it("is drawn, can be drawn again with other words, and goes away - with words, with the symbol alone and with an address that leads nowhere", () => {
    for (const shown of [props, { ...props, label: "" }, { href: "", label: "Tot" }]) {
      const root = element();
      const instance = renderLink(root, shown, context());
      expect(root.childNodes.length).toBeGreaterThan(0);
      expect(find(root, ".weft-link-icon")?.innerHTML).toContain("globe");
      expect((find(root, ".weft-link-text") as HTMLElement).hidden).toBe(!shown.label);
      instance.update({ ...shown, label: "Andere Worte" });
      expect(find(root, ".weft-link-text")?.textContent).toBe("Andere Worte");
      instance.destroy();
      expect(root.childNodes.length).toBe(0);
    }
  });

  if (mode === "play") {
    it("is a link: it leads to the address, a page in a new tab, a mail address to the program that sends it", () => {
      const root = element();
      renderLink(root, props, context());
      const link = find(root, ".weft-link") as HTMLElement;
      expect(link.tagName).toBe("A");
      expect(link.getAttribute("href")).toBe("https://example.org/seite");
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
      expect(link.getAttribute("aria-label")).toBeNull();
      const mail = element();
      renderLink(mail, { href: "mailto:a@example.org", label: "" }, context());
      expect(find(mail, ".weft-link")?.getAttribute("target")).toBeNull();
      // (A link that is only a symbol is named by where it leads.)
      expect(find(mail, ".weft-link")?.getAttribute("aria-label")).toBe("mailto:a@example.org");
    });

    it("hands the address to the window around it where the page cannot open a tab", () => {
      const root = element();
      renderLink(root, props, context(true));
      const click = new window.Event("click", { bubbles: true, cancelable: true });
      find(root, ".weft-link")?.dispatchEvent(click);
      expect(open).toHaveBeenCalledWith("https://example.org/seite");
      expect(click.defaultPrevented).toBe(true);
    });

    it("is no link where the address leads nowhere", () => {
      const root = element();
      renderLink(root, { href: "", label: "Tot" }, context());
      expect(find(root, ".weft-link")?.tagName).toBe("SPAN");
      expect(find(root, "a")).toBeNull();
    });
  } else {
    it("is only a picture of a link: nothing to click", () => {
      const root = element();
      renderLink(root, props, context(true));
      const link = find(root, ".weft-link") as HTMLElement;
      expect(link.tagName).toBe("SPAN");
      expect(find(root, "a")).toBeNull();
      expect(link.getAttribute("href")).toBeNull();
    });

    it(mode === "print" ? "has the address as a link of the PDF where it stands" : "has no link in the PDF to make", () => {
      const link = find((() => { const root = element(); renderLink(root, props, context()); return root; })(), ".weft-link") as HTMLElement;
      expect(link.getAttribute("data-pdf-link")).toBe(mode === "print" ? "https://example.org/seite" : null);
    });
  }
});

// ---- the progress bar -------------------------------------------------------------------------------------------------------------------

describe.each(MODES)("a progress bar drawn for %s", (mode) => {
  const props = { value: 40, moveMs: 0, color: "#16a34a", trackColor: "#e5e7eb", rounded: true, label: "punkte" };
  const fillOf = (root: Element) => find(root, ".weft-progress-fill") as HTMLElement;

  it("is drawn with its colours and as full as it says, can be drawn again, and goes away", () => {
    const root = element();
    const instance = renderProgress(root, props, { mode });
    expect(fillOf(root).style.width).toBe("40%");
    expect(fillOf(root).style.background).toBe("#16a34a");
    expect(find(root, ".weft-progress-track")?.className).toContain("is-rounded");
    instance.update({ ...props, rounded: false });
    expect(find(root, ".weft-progress-track")?.className).not.toContain("is-rounded");
    instance.destroy();
    expect(root.childNodes.length).toBe(0);
  });

  it("jumps on the first drawing and moves to another value as long as it is told (0: it jumps)", () => {
    const root = element();
    const instance = renderProgress(root, { ...props, moveMs: 800 }, { mode });
    expect(fillOf(root).style.transition).toBe("none");
    instance.update({ ...props, value: 90, moveMs: 800 });
    expect(fillOf(root).style.width).toBe("90%");
    expect(fillOf(root).style.transition).toContain("800ms");
    instance.update({ ...props, value: 10, moveMs: 0 });
    expect(fillOf(root).style.width).toBe("10%");
    expect(fillOf(root).style.transition).toBe("none");
  });

  it(mode === "play" ? "is a progress bar for assistive technology, and says its value" : "is only a picture: it is not a progress bar to anything", () => {
    const root = element();
    const instance = renderProgress(root, props, { mode });
    instance.update({ ...props, value: 62.4 });
    expect(root.getAttribute("role")).toBe(mode === "play" ? "progressbar" : null);
    expect(root.getAttribute("aria-valuenow")).toBe(mode === "play" ? "62" : null);
    expect(root.getAttribute("aria-label")).toBe(mode === "play" ? "punkte" : null);
  });

  it("has the colours the player gives a bar that has none", () => {
    const root = element();
    renderProgress(root, { ...props, color: "", trackColor: "", rounded: undefined as unknown as boolean }, { mode });
    expect(fillOf(root).style.background).toBe("#3b82f6");
    expect(find(root, ".weft-progress-track")?.className).toContain("is-rounded");
  });
});

// ---- the language switch ----------------------------------------------------------------------------------------------------------------

describe.each(MODES)("a language switch drawn for %s", (mode) => {
  const props = { languages: ["de_DE", "en_GB", "fr_FR"], labels: { de_DE: "Deutsch", en_GB: "English", fr_FR: "Français" }, current: "en_GB" };
  const context = () => ({ mode, text, setLanguage: vi.fn() });

  if (mode === "play" || mode === "edit") {
    it("is a drop-down of the languages, each by its own name, showing the one in use", () => {
      const root = element();
      renderLanguage(root, props, context());
      const select = find(root, ".weft-language-select") as HTMLSelectElement;
      expect([...select.querySelectorAll("option")].map((option) => option.textContent)).toEqual(["Deutsch", "English", "Français"]);
      expect(select.value).toBe("en_GB");
      expect(select.getAttribute("aria-label")).toBe("Sprache");
    });

    it("shows the new language when it is told, and is named in it", () => {
      const root = element();
      const instance = renderLanguage(root, props, context());
      WORDS.language = "Language";
      instance.update({ ...props, current: "fr_FR" });
      expect((find(root, ".weft-language-select") as HTMLSelectElement).value).toBe("fr_FR");
      expect(find(root, ".weft-language-select")?.getAttribute("aria-label")).toBe("Language");
      WORDS.language = "Sprache";
      instance.destroy();
      expect(root.childNodes.length).toBe(0);
    });

    it("has a globe where the module has no languages any more", () => {
      const root = element();
      renderLanguage(root, { languages: [], labels: {}, current: "" }, context());
      expect(find(root, "option")?.textContent).toBe("\uD83C\uDF10");
    });

    it(mode === "play" ? "picks a language: what is picked is the place's to do" : "is only a picture: nothing can be picked", () => {
      const root = element();
      const ctx = context();
      renderLanguage(root, props, ctx);
      const select = find(root, ".weft-language-select") as HTMLSelectElement;
      select.value = "fr_FR";
      fire(select, "change");
      if (mode === "play") expect(ctx.setLanguage).toHaveBeenCalledWith("fr_FR");
      else expect(ctx.setLanguage).not.toHaveBeenCalled();
    });
  } else {
    it("is a grey box with a globe: a drop-down means nothing here", () => {
      const root = element();
      const instance = renderLanguage(root, props, context());
      expect(find(root, "select")).toBeNull();
      expect(find(root, ".weft-language-placeholder")?.textContent).toBe("\uD83C\uDF10");
      instance.update({ ...props, current: "de_DE" });
      instance.destroy();
      expect(root.childNodes.length).toBe(0);
    });
  }
});
