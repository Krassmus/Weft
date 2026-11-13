/**
 * Weft Pro: the optional subscription for what cannot work without a server of Weft's own (the plan is in docs/pro-plan.md). Everything else in Weft is free
 * and stays free. This folder is the app's side of it - what a subscription is, where it is asked and kept - and has nothing to do with any server or any store
 * yet: the providers (providers.ts) are what a store will plug into.
 */

/** What Weft Pro is for. */
export type ProFeature =
  /** A TURN server of Weft's, so that people can work together through strict firewalls. */
  | "turn"
  /** Documents of the collaboration that are online all the time, also when nobody has them open. */
  | "cloudDocuments"
  /** Interactive blocks with a memory they share (polls, writing together, discussions with votes), embedded as frames in the module. */
  | "cloudBlocks";

export const PRO_FEATURES: readonly ProFeature[] = ["turn", "cloudDocuments", "cloudBlocks"];

/** The store a subscription was bought in - each platform has its own. */
export type ProStore = "apple" | "microsoft" | "google";

export type ProStatus =
  /** Not asked yet, or being asked. */
  | { state: "unknown" }
  | { state: "free" }
  /** `expiresAt`: ms since 1970 when the paid time ends (the store renews it), null when the provider does not tell. `preview`: made by hand, see providers.ts. */
  | { state: "pro"; store: ProStore | "preview"; expiresAt: number | null };

/**
 * The way one platform buys and asks for the subscription: the App Store on the Mac and the iPad (StoreKit), the Microsoft Store on Windows, Google Play
 * on Android. None of them exists yet; what is here is the shape they will have.
 */
export interface ProProvider {
  id: ProStore | "preview" | "none";
  /** Whether the subscription can be bought through this provider in this app. False: there is no store behind it (yet). */
  canPurchase: boolean;
  /** What the store says now. May throw (no network, the store does not answer): the caller falls back on the last answer (proStore.ts). */
  status(): Promise<ProStatus>;
  purchase(): Promise<ProStatus>;
  /** "Restore purchases" (a new device, a reinstalled app). */
  restore(): Promise<ProStatus>;
  /** Opens the place where the store lets the person change or end the subscription. */
  manage?(): Promise<void>;
}
