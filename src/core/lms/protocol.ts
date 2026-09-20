import type { VariableValue } from "../types";

/**
 * Wire protocol between an exported Weft module (running inside a sandboxed iframe) and
 * the host LMS page around it (e.g. Stud.IP). Both sides talk exclusively via postMessage;
 * the module never assumes direct DOM/JS access to its host, and vice versa. This file is
 * the single source of truth for the message shapes - the vanilla-JS runtime in
 * `core/runtime/player.runtime.js` implements the module side by hand (it ships with no
 * bundler), so keep that file's message literals in sync with this one if you change it.
 */
export const WEFT_MESSAGE_SOURCE = "weft-module";
export const LMS_MESSAGE_SOURCE = "weft-lms-host";
export const WEFT_PROTOCOL_VERSION = 1;

interface WeftMessageBase {
  source: typeof WEFT_MESSAGE_SOURCE;
  version: number;
  moduleId: string;
}

export type WeftToLmsMessage =
  | (WeftMessageBase & { type: "ready" })
  | (WeftMessageBase & { type: "progress"; nodeIndex: number; nodeCount: number })
  | (WeftMessageBase & { type: "variable-changed"; name: string; value: VariableValue })
  | (WeftMessageBase & { type: "completed"; variables: Record<string, VariableValue> })
  | (WeftMessageBase & { type: "resize"; height: number });

interface LmsMessageBase {
  source: typeof LMS_MESSAGE_SOURCE;
  version: number;
}

export type LmsToWeftMessage =
  | (LmsMessageBase & { type: "init"; variables?: Record<string, VariableValue> })
  | (LmsMessageBase & { type: "request-state" });

export function isWeftToLmsMessage(data: unknown): data is WeftToLmsMessage {
  return !!data && typeof data === "object" && (data as { source?: unknown }).source === WEFT_MESSAGE_SOURCE;
}

export function isLmsToWeftMessage(data: unknown): data is LmsToWeftMessage {
  return !!data && typeof data === "object" && (data as { source?: unknown }).source === LMS_MESSAGE_SOURCE;
}
