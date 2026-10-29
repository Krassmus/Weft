import { readdirSync, readFileSync } from "node:fs";
import { parseHTML } from "linkedom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { buttonLookStyle, renderButton } from "../src/core/blocks/button/render.js";
import { renderChecker } from "../src/core/blocks/checker/render.js";
import { clozeIsRight, renderCloze } from "../src/core/blocks/cloze/render.js";
import { renderIframe } from "../src/core/blocks/iframe/render.js";
import { renderLanguage } from "../src/core/blocks/language/render.js";
import { renderProgress } from "../src/core/blocks/progress/render.js";
import { linkHref, renderLink } from "../src/core/blocks/link/render.js";
import { renderList } from "../src/core/blocks/list/render.js";
import { renderSolution } from "../src/core/blocks/solution/render.js";
import { renderText, textBoxStyle } from "../src/core/blocks/text/render.js";

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
  Object.assign(globalThis, { window, document, NodeFilter: (window as unknown as { NodeFilter?: unknown }).NodeFilter ?? { SHOW_TEXT: 4 } });
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
  blank: "Lücke {n} von {total}",
  embedded: "Eingebettete Seite",
  thanks: "Danke!",
  next: "Weiter",
  noAddress: "(keine Adresse)",
};
const text = (key: string) => WORDS[key] ?? "";
const textWith = (key: string, values: Record<string, string | number>) => text(key).replace(/\{(\w+)\}/g, (all, name: string) => String(values[name] ?? all));
const ICONS = {
  submit: "<svg id='submit'></svg>",
  correct: "<svg id='ok'></svg>",
  incorrect: "<svg id='no'></svg>",
  globe: "<svg id='globe'></svg>",
  qr: "<svg id='qr'></svg>",
  thanks: "<svg id='thanks'></svg>",
  unchecked: "<svg id='unchecked'></svg>",
  checked: "<svg id='checked'></svg>",
};

/** Every render.js there is must be run here: this is the list of what is run (a new one fails the test below until it is added). */
const RENDERERS = ["solution", "iframe", "link", "progress", "language", "checker", "button", "text", "list", "cloze"];

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
    const name = { solution: "renderSolution", iframe: "renderIframe", link: "renderLink", progress: "renderProgress", language: "renderLanguage", checker: "renderChecker", button: "renderButton", text: "renderText", list: "renderList", cloze: "renderCloze" }[kind];
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

  if (mode === "play") {
    it("is a drop-down of the languages, each by its own name, showing the one in use", () => {
      const root = element();
      renderLanguage(root, props, context());
      const select = find(root, ".weft-language-select") as HTMLSelectElement;
      expect(select.tagName).toBe("SELECT");
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

    it("picks a language: what is picked is the place's to do", () => {
      const root = element();
      const ctx = context();
      renderLanguage(root, props, ctx);
      const select = find(root, ".weft-language-select") as HTMLSelectElement;
      select.value = "fr_FR";
      fire(select, "change");
      expect(ctx.setLanguage).toHaveBeenCalledWith("fr_FR");
    });

    it("has no options where the module has no languages", () => {
      const root = element();
      renderLanguage(root, { languages: [], labels: {}, current: "" }, context());
      expect(find(root, "option")).toBeNull();
    });
  } else if (mode === "edit") {
    it("is a picture of a drop-down - no native one, which does not scale with the slide - with the name of the language shown and an arrow", () => {
      const root = element();
      const ctx = context();
      const instance = renderLanguage(root, props, ctx);
      expect(find(root, "select")).toBeNull();
      expect(find(root, "option")).toBeNull();
      expect(find(root, ".weft-language-select.is-picture")).not.toBeNull();
      expect(find(root, ".weft-language-select-name")?.textContent).toBe("English");
      expect(find(root, ".weft-language-select-arrow")?.getAttribute("aria-hidden")).toBe("true");
      instance.update({ ...props, current: "fr_FR" });
      expect(find(root, ".weft-language-select-name")?.textContent).toBe("Français");
      instance.destroy();
      expect(root.childNodes.length).toBe(0);
      expect(ctx.setLanguage).not.toHaveBeenCalled();
    });

    it("has a globe where the module has no languages any more", () => {
      const root = element();
      renderLanguage(root, { languages: [], labels: {}, current: "" }, context());
      expect(find(root, ".weft-language-select-name")?.textContent).toBe("\uD83C\uDF10");
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

// ---- the checker ------------------------------------------------------------------------------------------------------------------------

describe.each(MODES)("a checker drawn for %s", (mode) => {
  const props = { id: "c1", text: "Ich bin einverstanden.\nWirklich." };
  const context = () => ({ mode, text, icons: ICONS, applyVariables: vi.fn(), fill: vi.fn(), submit: vi.fn(), announce: vi.fn() });

  it("is drawn with its words (their line breaks are kept), can be drawn again with other words, and goes away", () => {
    const root = element();
    const ctx = context();
    const instance = renderChecker(root, props, ctx);
    expect(find(root, ".weft-checker-text")?.textContent).toBe("Ich bin einverstanden.\nWirklich.");
    expect(find(root, ".weft-quiz-option-checkbox-icon-unchecked")?.innerHTML).toContain("unchecked");
    expect(find(root, ".weft-quiz-submit")?.textContent).toBe("Abschicken");
    // (The values of variables are put in where they exist: in the player.)
    expect(ctx.applyVariables).toHaveBeenCalledTimes(1);
    instance.update({ ...props, text: "Anderes" });
    expect(find(root, ".weft-checker-text")?.textContent).toBe("Anderes");
    expect(ctx.applyVariables).toHaveBeenCalledTimes(2);
    instance.destroy();
    expect(root.childNodes.length).toBe(0);
  });

  it("is drawn in a place that has no variables", () => {
    const root = element();
    renderChecker(root, props, { mode, text, icons: ICONS, fill: vi.fn(), submit: vi.fn(), announce: vi.fn() });
    expect(find(root, ".weft-checker-text")?.textContent).toBe("Ich bin einverstanden.\nWirklich.");
  });

  if (mode === "play") {
    it("is ticked and submitted: what follows is the place's to do, the box is locked and the thanks stand in the place of the button", () => {
      const root = element();
      const ctx = context();
      renderChecker(root, props, ctx);
      const input = find(root, ".weft-quiz-option-input") as HTMLInputElement;
      const button = find(root, ".weft-quiz-submit") as HTMLButtonElement;
      const feedback = find(root, ".weft-quiz-feedback") as HTMLElement;
      expect(feedback.hidden).toBe(true);
      input.checked = true;
      fire(input, "change");
      fire(input, "change");
      expect(ctx.fill).toHaveBeenCalledTimes(1);
      fire(button, "click");
      expect(ctx.submit).toHaveBeenCalledWith({ ticked: true });
      expect(ctx.announce).toHaveBeenCalledWith("Danke!");
      expect(feedback.hidden).toBe(false);
      expect(button.hidden).toBe(true);
      expect(input.disabled).toBe(true);
      // (Once is enough.)
      fire(button, "click");
      expect(ctx.submit).toHaveBeenCalledTimes(1);
    });

    it("can be submitted without the tick - that is the other outcome", () => {
      const root = element();
      const ctx = context();
      renderChecker(root, props, ctx);
      fire(find(root, ".weft-quiz-submit") as Element, "click");
      expect(ctx.submit).toHaveBeenCalledWith({ ticked: false });
    });

    it("is thanked in the language that is shown, after it was changed", () => {
      const root = element();
      const instance = renderChecker(root, props, context());
      fire(find(root, ".weft-quiz-submit") as Element, "click");
      WORDS.thanks = "Thanks!";
      WORDS.submit = "Submit";
      instance.update(props);
      expect(find(root, ".weft-quiz-feedback-title")?.textContent).toBe("Thanks!");
      expect(find(root, ".weft-quiz-submit")?.textContent).toBe("Submit");
      WORDS.thanks = "Danke!";
      WORDS.submit = "Abschicken";
    });
  } else {
    it("is only a picture: nothing can be ticked or submitted", () => {
      const root = element();
      const ctx = context();
      renderChecker(root, props, ctx);
      const input = find(root, ".weft-quiz-option-input") as HTMLInputElement;
      const button = find(root, ".weft-quiz-submit") as HTMLButtonElement;
      expect(input.tabIndex).toBe(-1);
      expect(button.tabIndex).toBe(-1);
      fire(input, "change");
      fire(button, "click");
      expect(ctx.fill).not.toHaveBeenCalled();
      expect(ctx.submit).not.toHaveBeenCalled();
      expect((find(root, ".weft-quiz-feedback") as HTMLElement).hidden).toBe(true);
    });
  }
});

// ---- the button -------------------------------------------------------------------------------------------------------------------------

describe("the look of a button", () => {
  it("is written as CSS only for what the author set - the stylesheet has the rest", () => {
    expect(buttonLookStyle(undefined)).toBe("");
    expect(buttonLookStyle({})).toBe("");
    expect(buttonLookStyle({ background: "#ff0000" })).toBe("background:#ff0000;");
    expect(buttonLookStyle({ background: null as unknown as string })).toBe("background:transparent;");
    expect(buttonLookStyle({ radius: 1.5 })).toBe("border-radius:1.5cqw;");
    expect(buttonLookStyle({ borderWidth: 0 })).toBe("border:none;");
    expect(buttonLookStyle({ borderWidth: 0.4, borderColor: "#00f" })).toBe("border:0.4cqw solid #00f;--slide-cut-line:#00f;--slide-cut-line-width:0.4cqw;");
    // (A border width without a colour has the button's own colour; a colour alone has no width: none.)
    expect(buttonLookStyle({ borderWidth: 0.2 })).toContain("solid var(--slide-button-bg)");
    expect(buttonLookStyle({ borderColor: "#00f" })).toBe("border:none;");
  });
});

describe.each(MODES)("a button drawn for %s", (mode) => {
  const props = { html: "<p>Los <b>geht's</b></p>", look: "background:#ff0000;" };
  const context = () => ({ mode, text, applyVariables: vi.fn() });

  it("is drawn with its formatted label and its look, can be drawn again, and goes away", () => {
    const root = element();
    const ctx = context();
    const instance = renderButton(root, props, ctx);
    expect(instance.button.className).toContain("weft-block-button-el");
    expect(instance.button.innerHTML).toBe("<p>Los <b>geht's</b></p>");
    expect(instance.button.getAttribute("style")).toContain("background");
    expect(ctx.applyVariables).toHaveBeenCalledTimes(1);
    instance.update({ ...props, html: "<p>Go</p>", look: "" });
    expect(instance.button.innerHTML).toBe("<p>Go</p>");
    expect(ctx.applyVariables).toHaveBeenCalledTimes(2);
    instance.destroy();
    expect(root.childNodes.length).toBe(0);
  });

  it("says the player's own word where the label has no words", () => {
    const root = element();
    const instance = renderButton(root, { html: "", look: "" }, context());
    expect(instance.button.textContent).toBe("Weiter");
    WORDS.next = "Next";
    instance.update({ html: "", look: "" });
    expect(instance.button.textContent).toBe("Next");
    WORDS.next = "Weiter";
  });

  it("is drawn in a place that has no variables", () => {
    const root = element();
    const instance = renderButton(root, props, { mode, text });
    expect(instance.button.textContent).toBe("Los geht's");
  });

  it(mode === "play" ? "is a real button, which the player adds its listeners to" : "is only a picture, drawn as a div: nothing to focus or press (and html2canvas draws its words)", () => {
    const root = element();
    const instance = renderButton(root, props, context());
    expect(instance.button.tagName).toBe(mode === "play" ? "BUTTON" : "DIV");
    expect(instance.button.getAttribute("type")).toBe(mode === "play" ? "button" : null);
    expect(instance.button.className).toBe(mode === "play" ? "weft-block-button-el" : "weft-block-button-el is-picture");
  });
});

// ---- the text ---------------------------------------------------------------------------------------------------------------------------

describe.each(MODES)("a text drawn for %s", (mode) => {
  const props = { html: "<p>Hallo <b>Welt</b></p>", scrollable: true, box: undefined as undefined | Record<string, unknown> };
  const BOX = { fill: "#ffffff", fillOpacity: 0.5, borderColor: "#000000", borderOpacity: 1, borderWidth: 0.2, radius: 1, padding: 2, blur: true };
  const context = () => ({ mode, applyVariables: vi.fn() });

  it("makes the element it is given the text (its words, no box), can be drawn again, and gives it back", () => {
    const root = element();
    root.setAttribute("style", "left:10%;");
    const ctx = context();
    const instance = renderText(root, props as never, ctx);
    expect(root.className).toContain("weft-block-text");
    expect(root.innerHTML).toBe("<p>Hallo <b>Welt</b></p>");
    expect(root.getAttribute("style")).toContain("left:10%");
    expect(ctx.applyVariables).toHaveBeenCalledTimes(1);
    instance.update({ ...props, html: "<p>Hi</p>" } as never);
    expect(root.innerHTML).toBe("<p>Hi</p>");
    expect(ctx.applyVariables).toHaveBeenCalledTimes(2);
    instance.destroy();
    expect(root.childNodes.length).toBe(0);
    expect(root.className).toBe("");
    expect(root.getAttribute("style")).toContain("left:10%");
  });

  it("is drawn in a place that has no variables", () => {
    const root = element();
    renderText(root, props as never, { mode });
    expect(root.textContent).toBe("Hallo Welt");
  });

  it(mode === "play" ? "scrolls where the author wanted it" : "does not scroll: it is only a picture", () => {
    const scrolling = element();
    renderText(scrolling, props as never, context());
    expect(scrolling.classList.contains("is-scrollable")).toBe(mode === "play");
    const fixed = element();
    renderText(fixed, { ...props, scrollable: false } as never, context());
    expect(fixed.classList.contains("is-scrollable")).toBe(false);
  });

  it("has its box on the element itself, with the blur of what is behind it", () => {
    const root = element();
    root.setAttribute("style", "left:10%;");
    renderText(root, { ...props, box: BOX } as never, context());
    const style = root.getAttribute("style") ?? "";
    expect(style).toContain("left:10%");
    expect(style).toContain("color-mix(in srgb,#ffffff 50%,transparent)");
    expect(style).toContain("border-radius:1cqw");
    expect(style).toContain("backdrop-filter:blur(2cqw)");
    expect(style.endsWith(textBoxStyle(BOX as never))).toBe(true);
  });

  it(mode === "play" ? "takes no clicks where it has no words (and no box)" : "is a picture, which takes no clicks anyway", () => {
    const empty = element();
    renderText(empty, { ...props, html: "<p><br></p>" } as never, context());
    expect(empty.classList.contains("is-empty")).toBe(mode === "play");
    const boxed = element();
    renderText(boxed, { ...props, html: "", box: BOX } as never, context());
    expect(boxed.classList.contains("is-empty")).toBe(false);
    const pictured = element();
    renderText(pictured, { ...props, html: '<img src="x.png">' } as never, context());
    expect(pictured.classList.contains("is-empty")).toBe(false);
  });
});

describe("the box of a text", () => {
  it("is nothing without one, and only what is set", () => {
    expect(textBoxStyle(undefined)).toBe("");
    const css = textBoxStyle({ fillOpacity: 0, borderOpacity: 0, borderWidth: 0, radius: 0, padding: 0 } as never);
    expect(css).toBe("box-sizing:border-box;border-radius:0cqw;padding:0cqw;");
  });
});

// ---- the list ---------------------------------------------------------------------------------------------------------------------------

describe.each(MODES)("a list drawn for %s", (mode) => {
  const props = {
    items: [
      { id: "a", html: "<p>Eins</p>" },
      { id: "b", html: "<p>Zwei <b>fett</b></p>" },
      { id: "c", html: "<p>Drei</p>" },
    ],
    marker: "dot",
    markerColor: "#ff0000",
    markerSrc: null as string | null,
    markerSize: undefined as number | undefined,
    spacing: 1.5,
  };
  const context = () => ({ mode, applyVariables: vi.fn() });
  const markers = (root: Element) => [...root.querySelectorAll(".weft-list-marker")];

  it("is drawn with its points, each with its mark, the space between them, and can be drawn again and go away", () => {
    const root = element();
    const ctx = context();
    const instance = renderList(root, props as never, ctx);
    const list = find(root, ".weft-list") as HTMLElement;
    expect(list.getAttribute("role")).toBe("list");
    expect(list.getAttribute("style")).toContain("gap:1.5cqw");
    expect([...root.querySelectorAll(".weft-list-item-text")].map((node) => node.innerHTML)).toEqual(["<p>Eins</p>", "<p>Zwei <b>fett</b></p>", "<p>Drei</p>"]);
    expect(markers(root).map((marker) => marker.className)).toEqual(["weft-list-marker is-dot", "weft-list-marker is-dot", "weft-list-marker is-dot"]);
    expect(ctx.applyVariables).toHaveBeenCalledTimes(3);
    expect(Object.keys(instance.rows)).toEqual(["a", "b", "c"]);
    expect(instance.rows.b.getAttribute("role")).toBe("listitem");
    instance.update({ ...props, items: props.items.map((item) => ({ ...item, html: `<p>${item.id}!</p>` })) } as never);
    expect([...root.querySelectorAll(".weft-list-item-text")].map((node) => node.textContent)).toEqual(["a!", "b!", "c!"]);
    expect(ctx.applyVariables).toHaveBeenCalledTimes(6);
    instance.destroy();
    expect(root.childNodes.length).toBe(0);
  });

  it("is drawn in a place that has no variables", () => {
    const root = element();
    renderList(root, props as never, { mode });
    expect(root.textContent).toBe("EinsZwei fettDrei");
  });

  it("has the colour of a dot, a dash and a number only where it looks like a colour", () => {
    const colour = (marker: string, markerColor: string | null) => {
      const root = element();
      renderList(root, { ...props, marker, markerColor } as never, context());
      return (markers(root)[0] as HTMLElement).getAttribute("style");
    };
    expect(colour("dot", "#ff0000")).toContain("color");
    expect(colour("dash", "#f00")).toContain("color");
    expect(colour("number", "red; background: url(x)")).toBeNull();
    expect(colour("dot", null)).toBeNull();
    expect(colour("image", "#ff0000")).toBeNull();
  });

  it("numbers its points, and draws the author's picture at the size they chose", () => {
    const numbered = element();
    renderList(numbered, { ...props, marker: "number" } as never, context());
    expect(markers(numbered).map((marker) => marker.textContent)).toEqual(["1.", "2.", "3."]);
    const pictured = element();
    renderList(pictured, { ...props, marker: "image", markerSrc: "data:image/png;base64,AAAA", markerSize: 2 } as never, context());
    const picture = find(pictured, ".weft-list-marker.is-image img") as HTMLElement;
    expect(picture.getAttribute("src")).toBe("data:image/png;base64,AAAA");
    expect(picture.getAttribute("style")).toBe("height:2em;vertical-align:-0.680em;");
    // (Without a file there is no picture - nor a dot.)
    const empty = element();
    renderList(empty, { ...props, marker: "image", markerSrc: null } as never, context());
    expect(empty.querySelectorAll("img").length).toBe(0);
  });

  it("is drawn with no space where it has none set, and as an empty list where it has no points", () => {
    const root = element();
    renderList(root, { ...props, spacing: undefined, items: [] } as never, context());
    expect((find(root, ".weft-list") as HTMLElement).getAttribute("style")).toContain("gap:0cqw");
    expect(root.querySelectorAll(".weft-list-item").length).toBe(0);
  });
});

describe("the marks of a list's points", () => {
  // (There is no layout here: the size of a letter is told by the element it stands in - a heading is twice the size of a paragraph.)
  const sizes = { current: { H1: 22, P: 11, SPAN: 11, DIV: 11 } as Record<string, number> };
  const stubbed = () => {
    vi.stubGlobal("getComputedStyle", (node: Element) => ({ fontSize: `${sizes.current[node.tagName] ?? 11}px` }));
    if (!("NodeFilter" in globalThis)) vi.stubGlobal("NodeFilter", { SHOW_TEXT: 4 });
  };
  const props = (marker: string, firstHtml: string) => ({
    items: [
      { id: "a", html: firstHtml },
      { id: "b", html: "<p>Zwei</p>" },
    ],
    marker,
    markerSrc: marker === "image" ? "data:image/png;base64,AAAA" : null,
    spacing: 1,
  });
  const sizeOfMarks = (root: Element) => [...root.querySelectorAll(".weft-list-marker")].map((marker) => (marker as HTMLElement).style.fontSize);
  const attached = () => {
    const root = element();
    document.body.appendChild(root);
    return root;
  };

  it("is as large as the first character of its point - at once where the list is on the page", () => {
    stubbed();
    const root = attached();
    renderList(root, props("dot", "<h1>Gross</h1>") as never, { mode: "play" });
    expect(sizeOfMarks(root)).toEqual(["2em", ""]);
    root.remove();
    vi.unstubAllGlobals();
  });

  it("is made again when the words change", () => {
    stubbed();
    const root = attached();
    const instance = renderList(root, props("number", "<h1>Gross</h1>") as never, { mode: "play" });
    instance.update(props("number", "<p>Klein</p>") as never);
    expect(sizeOfMarks(root)).toEqual(["", ""]);
    instance.update(props("number", "<h1>Gross</h1>") as never);
    expect(sizeOfMarks(root)).toEqual(["2em", ""]);
    root.remove();
    vi.unstubAllGlobals();
  });

  it("is the same size for every picture, whatever the first character looks like", () => {
    stubbed();
    const root = attached();
    renderList(root, props("image", "<h1>Gross</h1>") as never, { mode: "play" });
    expect(sizeOfMarks(root)).toEqual(["", ""]);
    root.remove();
    vi.unstubAllGlobals();
  });

  it("is fitted again once the fonts have come (the page is put on the screen right after the list is drawn) - and no more once it is gone", () => {
    vi.useFakeTimers();
    stubbed();
    const root = attached();
    // (Drawn while the heading still has the size of a paragraph: the font is not there yet.)
    sizes.current = { H1: 11, P: 11, SPAN: 11, DIV: 11 };
    const instance = renderList(root, props("dot", "<h1>Gross</h1>") as never, { mode: "play" });
    expect(sizeOfMarks(root)).toEqual(["", ""]);
    sizes.current = { H1: 22, P: 11, SPAN: 11, DIV: 11 };
    vi.advanceTimersByTime(400);
    expect(sizeOfMarks(root)).toEqual(["2em", ""]);
    // A list that has gone is not looked at again.
    const gone = renderList(attached(), props("dot", "<h1>Gross</h1>") as never, { mode: "play" });
    const calls = vi.fn(() => ({ fontSize: "11px" }));
    vi.stubGlobal("getComputedStyle", calls);
    gone.destroy();
    vi.advanceTimersByTime(400);
    expect(calls).not.toHaveBeenCalled();
    instance.destroy();
    root.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    sizes.current = { H1: 22, P: 11, SPAN: 11, DIV: 11 };
  });
});

// ---- the gap text -----------------------------------------------------------------------------------------------------------------------

describe("how an answer of a gap text is judged", () => {
  it("is right when it is one of the answers - spaces never count, capital letters only when asked for", () => {
    expect(clozeIsRight("berlin", ["Berlin"], false, 0)).toBe(true);
    expect(clozeIsRight("berlin", ["Berlin"], true, 0)).toBe(false);
    expect(clozeIsRight(" New  York ", ["NewYork"], false, 0)).toBe(true);
    expect(clozeIsRight("Pariz", ["Paris", "Pariz"], true, 0)).toBe(true);
    expect(clozeIsRight("", ["Berlin"], false, 0)).toBe(false);
  });

  it("puts up with as many wrong characters as the tolerance says - and with none in a very short answer", () => {
    expect(clozeIsRight("Berlim", ["Berlin"], false, 1)).toBe(true);
    expect(clozeIsRight("Berlmm", ["Berlin"], false, 1)).toBe(false);
    expect(clozeIsRight("Berlmm", ["Berlin"], false, 2)).toBe(true);
    // (An answer of two characters with one allowed slip: "Ra" is another word, not a typo of "Ro" - one of three is.)
    expect(clozeIsRight("Ra", ["Ro"], false, 1)).toBe(false);
    expect(clozeIsRight("Ram", ["Rom"], false, 1)).toBe(true);
    expect(clozeIsRight("Ro ", ["Ro"], false, 1)).toBe(true);
  });
});

describe.each(MODES)("a gap text drawn for %s", (mode) => {
  const props = { html: "<p>Die Hauptstadt ist [[Berlin]] und [[Paris|Pariz]].</p>", caseSensitive: false, tolerance: 0 };
  const context = () => ({ mode, text, textWith, icons: ICONS, applyVariables: vi.fn(), fill: vi.fn(), submit: vi.fn(), announce: vi.fn() });
  const inputs = (root: Element) => [...root.querySelectorAll(".weft-cloze-input")] as HTMLInputElement[];
  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    fire(input, "input");
  };

  it("is drawn with a field for every blank (as wide as its longest answer, named for whoever cannot see it), the button, can be drawn again, and goes away", () => {
    const root = element();
    const ctx = context();
    const instance = renderCloze(root, props, ctx);
    expect(root.textContent).toContain("Die Hauptstadt ist ");
    expect(root.textContent).not.toContain("[[");
    expect(inputs(root).map((input) => input.getAttribute("aria-label"))).toEqual(["Lücke 1 von 2", "Lücke 2 von 2"]);
    expect(inputs(root).map((input) => input.getAttribute("style"))).toEqual(["width:8ch;", "width:7ch;"]);
    expect(find(root, ".weft-quiz-submit")?.textContent).toBe("Abschicken");
    expect((find(root, ".weft-quiz-feedback") as HTMLElement).hidden).toBe(true);
    expect(ctx.applyVariables).toHaveBeenCalledTimes(1);
    instance.update({ ...props, html: "<p>[[eins]] Neu</p>" });
    expect(inputs(root).length).toBe(1);
    expect(root.textContent).toContain("Neu");
    expect(ctx.applyVariables).toHaveBeenCalledTimes(2);
    instance.destroy();
    expect(root.childNodes.length).toBe(0);
  });

  it("is drawn in a place that has no variables, and without blanks it is just its words", () => {
    const root = element();
    renderCloze(root, { ...props, html: "<p>Nichts</p>" }, { mode, text, textWith, icons: ICONS, fill: vi.fn(), submit: vi.fn(), announce: vi.fn() });
    expect(inputs(root).length).toBe(0);
    expect(root.textContent).toContain("Nichts");
  });

  it("does not take a marker with formatting in the middle of it for a blank", () => {
    const root = element();
    renderCloze(root, { ...props, html: "<p>[[Ber<b>lin</b>]] und [[ok]]</p>" }, context());
    expect(inputs(root).length).toBe(1);
  });

  if (mode === "play") {
    it("tells the first letter typed once, and keeps what was typed when the language changes", () => {
      const root = element();
      const ctx = context();
      const instance = renderCloze(root, props, ctx);
      type(inputs(root)[0], "Ber");
      type(inputs(root)[0], "Berl");
      expect(ctx.fill).toHaveBeenCalledTimes(1);
      instance.update({ ...props, html: "<p>Anders [[Berlin]] und [[Paris]]</p>" });
      expect(inputs(root)[0].value).toBe("Berl");
    });

    it("judges every blank when it is submitted, marks them, tells the place what was right, and thanks the right answer", () => {
      const root = element();
      const ctx = context();
      renderCloze(root, props, ctx);
      type(inputs(root)[0], "berlin");
      type(inputs(root)[1], "Pariz");
      fire(find(root, ".weft-quiz-submit") as Element, "click");
      expect(ctx.submit).toHaveBeenCalledWith({ blanks: [{ key: "Berlin", right: true }, { key: "Paris|Pariz", right: true }], allRight: true });
      expect(inputs(root).map((input) => input.className)).toEqual(["weft-cloze-input is-correct", "weft-cloze-input is-correct"]);
      expect(inputs(root).every((input) => input.disabled)).toBe(true);
      expect([...root.querySelectorAll(".weft-cloze-mark")].map((mark) => mark.textContent)).toEqual(["✓", "✓"]);
      const feedback = find(root, ".weft-quiz-feedback") as HTMLElement;
      expect(feedback.hidden).toBe(false);
      expect(feedback.className).toBe("weft-quiz-feedback is-correct");
      expect(feedback.textContent).toBe("Richtig");
      expect(find(root, ".weft-quiz-feedback-icon")?.innerHTML).toContain("ok");
      expect((find(root, ".weft-quiz-submit") as HTMLButtonElement).hidden).toBe(true);
      expect(ctx.announce).toHaveBeenCalledWith("Richtig");
    });

    it("is wrong when one blank is - and says which", () => {
      const root = element();
      const ctx = context();
      renderCloze(root, props, ctx);
      type(inputs(root)[0], "Berlin");
      type(inputs(root)[1], "Rom");
      fire(find(root, ".weft-quiz-submit") as Element, "click");
      expect(ctx.submit).toHaveBeenCalledWith({ blanks: [{ key: "Berlin", right: true }, { key: "Paris|Pariz", right: false }], allRight: false });
      expect(inputs(root)[1].getAttribute("aria-invalid")).toBe("true");
      expect(inputs(root)[1].className).toBe("weft-cloze-input is-incorrect");
      expect((find(root, ".weft-quiz-feedback") as HTMLElement).className).toBe("weft-quiz-feedback is-incorrect");
      expect(find(root, ".weft-quiz-feedback")?.textContent).toBe("Falsch");
    });

    it("holds an empty answer wrong, and judges by the case and the tolerance it is given", () => {
      const strict = element();
      const ctx = context();
      renderCloze(strict, { ...props, caseSensitive: true }, ctx);
      type(inputs(strict)[0], "berlin");
      fire(find(strict, ".weft-quiz-submit") as Element, "click");
      expect(ctx.submit).toHaveBeenCalledWith({ blanks: [{ key: "Berlin", right: false }, { key: "Paris|Pariz", right: false }], allRight: false });
      const loose = element();
      const ctx2 = context();
      renderCloze(loose, { ...props, tolerance: 1 }, ctx2);
      type(inputs(loose)[0], "Berlim");
      type(inputs(loose)[1], "Parix");
      fire(find(loose, ".weft-quiz-submit") as Element, "click");
      expect(ctx2.submit).toHaveBeenCalledWith({ blanks: [{ key: "Berlin", right: true }, { key: "Paris|Pariz", right: true }], allRight: true });
    });

    it("is not changed by another language once it was submitted - only the word of the feedback is", () => {
      const root = element();
      const instance = renderCloze(root, props, context());
      type(inputs(root)[0], "Berlin");
      type(inputs(root)[1], "Paris");
      fire(find(root, ".weft-quiz-submit") as Element, "click");
      WORDS.correct = "Correct";
      instance.update({ ...props, html: "<p>Andere Wörter [[x]]</p>" });
      expect(find(root, ".weft-quiz-feedback")?.textContent).toBe("Correct");
      expect(inputs(root).length).toBe(2);
      expect(inputs(root)[0].value).toBe("Berlin");
      WORDS.correct = "Richtig";
    });
  } else {
    it("is only a picture of the empty fields and the button: nothing to write in or press", () => {
      const root = element();
      const ctx = context();
      renderCloze(root, props, ctx);
      expect(inputs(root).every((input) => input.readOnly && input.tabIndex === -1)).toBe(true);
      const button = find(root, ".weft-quiz-submit") as HTMLButtonElement;
      expect(button.tabIndex).toBe(-1);
      type(inputs(root)[0], "x");
      fire(button, "click");
      expect(ctx.fill).not.toHaveBeenCalled();
      expect(ctx.submit).not.toHaveBeenCalled();
      expect((find(root, ".weft-cloze") as HTMLElement).className).toBe("weft-cloze is-picture");
    });
  }
});
