import { create } from "zustand";
import { currentProProvider } from "./providers";
import type { ProFeature, ProProvider, ProStatus } from "./types";

/**
 * Whether this person has Weft Pro, as far as the app knows. It asks the provider of its platform (providers.ts) and keeps the last answer: a person who paid
 * must not lose what they paid for because the store cannot be reached for a moment - so a Pro answer that is not older than GRACE_DAYS is believed when the
 * provider fails (and a subscription that is known to have ended is not). Nothing in the app asks this yet: it is what the features of Weft Pro will ask
 * (`requirePro`) once there is a server for them.
 */
const CACHE_KEY = "weft:pro.cache";
export const GRACE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

interface Cached {
  status: ProStatus;
  checkedAt: number;
}

function readCache(): Cached | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as Cached | null;
    if (parsed && typeof parsed.checkedAt === "number" && parsed.status && typeof parsed.status.state === "string") return parsed;
  } catch {
    // none, or damaged
  }
  return null;
}

function writeCache(status: ProStatus, now: number): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ status, checkedAt: now } satisfies Cached));
  } catch {
    // not fatal: the answer just is not kept
  }
}

/** The last answer, when it still counts: Pro, checked within the grace time, and not known to have ended. */
export function cachedStatus(now = Date.now()): ProStatus | null {
  const cached = readCache();
  if (!cached || cached.status.state !== "pro") return null;
  if (now - cached.checkedAt > GRACE_DAYS * DAY_MS) return null;
  if (cached.status.expiresAt !== null && cached.status.expiresAt < now) return null;
  return cached.status;
}

/** Asks the provider; when it fails, the kept answer if it still counts, else "free". */
export async function resolveStatus(ask: (provider: ProProvider) => Promise<ProStatus>, now = Date.now()): Promise<ProStatus> {
  const provider = currentProProvider();
  try {
    const status = await ask(provider);
    writeCache(status, now);
    return status;
  } catch (error) {
    if (typeof console !== "undefined") console.warn("Weft Pro: the store did not answer:", error);
    return cachedStatus(now) ?? { state: "free" };
  }
}

interface ProState {
  status: ProStatus;
  /** A feature that was asked for while the person is not Pro (`requirePro`): what the page of Weft Pro should say it is needed for. Null when nothing is waiting. */
  needed: ProFeature | null;
  refresh: () => Promise<void>;
  purchase: () => Promise<void>;
  restore: () => Promise<void>;
  clearNeeded: () => void;
}

export const useProStore = create<ProState>((set) => ({
  status: { state: "unknown" },
  needed: null,
  refresh: async () => set({ status: await resolveStatus((provider) => provider.status()) }),
  purchase: async () => set({ status: await resolveStatus((provider) => provider.purchase()) }),
  restore: async () => set({ status: await resolveStatus((provider) => provider.restore()) }),
  clearNeeded: () => set({ needed: null }),
}));

/** Whether the person has Weft Pro right now. (Every subscription includes every feature: there is one plan.) */
export function isPro(): boolean {
  return useProStore.getState().status.state === "pro";
}

/**
 * For a feature of Weft Pro: true if it may be used. If not, the feature is noted in the store (`needed`) so that the page about Weft Pro can come up with the
 * reason - and false is returned, the feature then does not start.
 */
export function requirePro(feature: ProFeature): boolean {
  if (isPro()) return true;
  useProStore.setState({ needed: feature });
  return false;
}
