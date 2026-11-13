import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LANGUAGES, translations } from "../src/core/i18n/translations";
import { PRO_FEATURE_TEXT } from "../src/core/pro/featureTexts";
import { GRACE_DAYS, cachedStatus, isPro, requirePro, resolveStatus, useProStore } from "../src/core/pro/proStore";
import { PRO_PREVIEW_KEY, currentProProvider, noProvider, previewProvider, proUiVisible, registerProProvider, resetProProviders } from "../src/core/pro/providers";
import { PRO_FEATURES } from "../src/core/pro/types";
import type { ProProvider, ProStatus } from "../src/core/pro/types";

const DAY = 24 * 60 * 60 * 1000;

/** The tests run in Node, which has no localStorage: a small one. */
function fakeStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, String(value)),
    removeItem: (key: string) => void items.delete(key),
  };
}

const paying = (store: "apple" | "microsoft" = "apple", expiresAt: number | null = null): ProStatus => ({ state: "pro", store, expiresAt });
const storeThatSays = (status: ProStatus): ProProvider => ({ id: "apple", canPurchase: true, status: async () => status, purchase: async () => status, restore: async () => status });

beforeEach(() => {
  vi.stubGlobal("localStorage", fakeStorage());
  resetProProviders();
  useProStore.setState({ status: { state: "unknown" }, needed: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetProProviders();
});

describe("Weft Pro - who is Pro", () => {
  it("nobody is, as long as no store has registered", async () => {
    expect(currentProProvider()).toBe(noProvider);
    await useProStore.getState().refresh();
    expect(useProStore.getState().status).toEqual({ state: "free" });
    expect(isPro()).toBe(false);
    expect(noProvider.canPurchase).toBe(false);
  });

  it("a feature that needs Pro is refused, and noted for the page about Weft Pro", () => {
    expect(requirePro("turn")).toBe(false);
    expect(useProStore.getState().needed).toBe("turn");
    useProStore.getState().clearNeeded();
    expect(useProStore.getState().needed).toBeNull();
  });

  it("a store's provider is the one asked", async () => {
    registerProProvider(storeThatSays(paying("microsoft", Date.now() + DAY)));
    await useProStore.getState().refresh();
    expect(isPro()).toBe(true);
    expect(requirePro("cloudDocuments")).toBe(true);
    expect(useProStore.getState().needed).toBeNull();
  });
});

describe("Weft Pro - the preview (for trying without a store)", () => {
  it("is not there, and the card is hidden, until a value was put in by hand", () => {
    expect(proUiVisible()).toBe(false);
    localStorage.setItem(PRO_PREVIEW_KEY, "free");
    expect(proUiVisible()).toBe(true);
    expect(currentProProvider()).toBe(previewProvider);
  });

  it("understands free, pro and JSON, and makes thirty days when 'subscribe' is pressed", async () => {
    localStorage.setItem(PRO_PREVIEW_KEY, "free");
    expect(await previewProvider.status()).toEqual({ state: "free" });
    localStorage.setItem(PRO_PREVIEW_KEY, "pro");
    expect(await previewProvider.status()).toEqual({ state: "pro", store: "preview", expiresAt: null });
    localStorage.setItem(PRO_PREVIEW_KEY, JSON.stringify({ state: "pro", expiresAt: 1790000000000 }));
    expect(await previewProvider.status()).toEqual({ state: "pro", store: "preview", expiresAt: 1790000000000 });

    localStorage.setItem(PRO_PREVIEW_KEY, "free");
    const bought = await previewProvider.purchase();
    expect(bought.state).toBe("pro");
    const days = bought.state === "pro" && bought.expiresAt !== null ? (bought.expiresAt - Date.now()) / DAY : 0;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  it("is ended by 'manage' (back to free)", async () => {
    localStorage.setItem(PRO_PREVIEW_KEY, "pro");
    await previewProvider.manage?.();
    expect(await previewProvider.status()).toEqual({ state: "free" });
  });

  it("wins over a store's provider (it is only there when it was switched on)", () => {
    registerProProvider(storeThatSays(paying()));
    expect(currentProProvider().id).toBe("apple");
    localStorage.setItem(PRO_PREVIEW_KEY, "free");
    expect(currentProProvider().id).toBe("preview");
  });
});

describe("Weft Pro - the store cannot be reached", () => {
  const unreachable = async (): Promise<ProStatus> => {
    throw new Error("offline");
  };

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("a person who paid stays Pro for the grace time", async () => {
    const t0 = Date.UTC(2026, 10, 13);
    registerProProvider(storeThatSays(paying()));
    await resolveStatus((provider) => provider.status(), t0);
    expect(await resolveStatus(unreachable, t0 + 2 * DAY)).toEqual(paying());
    expect(await resolveStatus(unreachable, t0 + (GRACE_DAYS - 0.1) * DAY)).toEqual(paying());
  });

  it("but not longer than that", async () => {
    const t0 = Date.UTC(2026, 10, 13);
    registerProProvider(storeThatSays(paying()));
    await resolveStatus((provider) => provider.status(), t0);
    expect(await resolveStatus(unreachable, t0 + (GRACE_DAYS + 0.1) * DAY)).toEqual({ state: "free" });
  });

  it("and not when the subscription is known to have ended", async () => {
    const t0 = Date.UTC(2026, 10, 13);
    registerProProvider(storeThatSays(paying("apple", t0 + DAY)));
    await resolveStatus((provider) => provider.status(), t0);
    expect(cachedStatus(t0 + 0.5 * DAY)).toEqual(paying("apple", t0 + DAY));
    expect(await resolveStatus(unreachable, t0 + 2 * DAY)).toEqual({ state: "free" });
  });

  it("someone who was not Pro is not made Pro by an outage, and nothing kept means free", async () => {
    registerProProvider(storeThatSays({ state: "free" }));
    await resolveStatus((provider) => provider.status());
    expect(await resolveStatus(unreachable)).toEqual({ state: "free" });
    localStorage.removeItem("weft:pro.cache");
    expect(await resolveStatus(unreachable)).toEqual({ state: "free" });
  });
});

describe("Weft Pro - what the settings say", () => {
  it("has a line of text in every language for every feature", () => {
    for (const feature of PRO_FEATURES) {
      const key = PRO_FEATURE_TEXT[feature];
      for (const language of LANGUAGES) expect(translations[language][key].trim(), `${feature} in ${language}`).not.toBe("");
    }
  });
});
