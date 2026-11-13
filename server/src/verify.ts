import { createHash } from "node:crypto";
import type { Config } from "./config.ts";

/**
 * Whether a purchase is real. One verifier for each store takes the proof the app sends (what the store gave it for the purchase) and says who is paying
 * (`subject`: a pseudonym - the store's own id is hashed here and never kept) and until when. The store verifiers are not built yet (they say 501): Apple's is
 * the signed transaction (JWS) checked with the App Store Server API, Microsoft's the Store ID key checked with the Microsoft Store collection API
 * (docs/pro-plan.md). Only the development store works - and only when the server is started for development.
 */
export interface Entitlement {
  subject: string;
  /** ms since 1970, null if the store does not say. */
  proUntil: number | null;
}

/** An answer to the app that is not a crash: the HTTP status and a short code. */
export class StoreError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export type Verifier = (proof: string, now: number) => Promise<Entitlement>;

/** The pseudonym of a subscriber: the same person always gets the same one, and nobody can get back to the store's id from it. */
export function pseudonym(store: string, id: string): string {
  return createHash("sha256").update(`${store}:${id}`).digest("hex").slice(0, 32);
}

const notYet: Verifier = async () => {
  throw new StoreError(501, "store_not_supported_yet");
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function createVerifiers(config: Config): Record<string, Verifier | undefined> {
  const verifiers: Record<string, Verifier | undefined> = { apple: notYet, microsoft: notYet, google: notYet };
  if (config.dev) {
    // `dev-pro:<name>`: a subscriber for 30 days; `dev-free:<name>`: someone without a subscription (so that the refusal can be tried too).
    verifiers.dev = async (proof, now) => {
      const match = /^(dev-pro|dev-free):(.{1,64})$/.exec(proof);
      if (!match) throw new StoreError(400, "bad_proof");
      if (match[1] === "dev-free") throw new StoreError(402, "no_subscription");
      return { subject: pseudonym("dev", match[2]), proUntil: now + 30 * DAY_MS };
    };
  }
  return verifiers;
}
