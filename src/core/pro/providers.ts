import type { ProProvider, ProStatus } from "./types";

/**
 * The places a subscription can come from. A store registers its provider for its platform (`registerProProvider`, from the code of that platform); until
 * one does there is none - and nobody is Pro. The `preview` provider is for trying the whole thing without a store: it is only there when a value was put into
 * `localStorage["weft:pro.preview"]` by hand ("free", "pro", or JSON like {"state":"pro","expiresAt":1790000000000}), and its "subscribe" button makes
 * 30 days of Pro. It is also what makes the "Weft Pro" card of the settings visible (see proUiVisible): nothing of Weft Pro shows up for anyone else.
 */
export const PRO_PREVIEW_KEY = "weft:pro.preview";
const PREVIEW_DAYS = 30;

function readPreview(): string | null {
  try {
    return localStorage.getItem(PRO_PREVIEW_KEY);
  } catch {
    return null;
  }
}

function writePreview(value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(PRO_PREVIEW_KEY);
    else localStorage.setItem(PRO_PREVIEW_KEY, value);
  } catch {
    // no storage: nothing to try with
  }
}

/** Whether the "Weft Pro" card is shown in the settings: only when the preview is switched on by hand. */
export function proUiVisible(): boolean {
  return readPreview() !== null;
}

function parsePreview(raw: string | null): ProStatus {
  if (raw === "pro") return { state: "pro", store: "preview", expiresAt: null };
  if (raw === null || raw === "free") return { state: "free" };
  try {
    const parsed = JSON.parse(raw) as { state?: string; expiresAt?: unknown };
    if (parsed.state === "pro") return { state: "pro", store: "preview", expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : null };
  } catch {
    // not JSON: free
  }
  return { state: "free" };
}

/** No store behind it: nobody is Pro and nothing can be bought. */
export const noProvider: ProProvider = {
  id: "none",
  canPurchase: false,
  status: async () => ({ state: "free" }),
  purchase: async () => ({ state: "free" }),
  restore: async () => ({ state: "free" }),
};

export const previewProvider: ProProvider = {
  id: "preview",
  canPurchase: true,
  status: async () => parsePreview(readPreview()),
  purchase: async () => {
    writePreview(JSON.stringify({ state: "pro", expiresAt: Date.now() + PREVIEW_DAYS * 24 * 60 * 60 * 1000 }));
    return parsePreview(readPreview());
  },
  restore: async () => parsePreview(readPreview()),
  // (the end of the "subscription": back to free, but the card stays visible)
  manage: async () => writePreview("free"),
};

let registered: ProProvider | null = null;

/** A store's provider for this platform. */
export function registerProProvider(provider: ProProvider): void {
  registered = provider;
}

/** The provider this app uses now: the preview when it was switched on by hand, else the one a store registered, else none. */
export function currentProProvider(): ProProvider {
  if (readPreview() !== null) return previewProvider;
  return registered ?? noProvider;
}

/** Only for tests. */
export function resetProProviders(): void {
  registered = null;
}
