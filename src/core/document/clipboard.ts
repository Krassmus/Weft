import type { Block, Page } from "../types";

export type ClipboardEntry = { kind: "page"; page: Page } | { kind: "block"; block: Block };

/**
 * An in-app clipboard, not the OS one: Cmd/Ctrl+C stores the copied page or block here, and
 * Cmd/Ctrl+V reads it back. Structured data (nested blocks, quiz options, ...) doesn't round-trip
 * reliably through the system clipboard's text/plain API, and Tauri's clipboard plugin would need
 * an extra capability grant for what is, in practice, always a paste back into the same session.
 */
let clipboard: ClipboardEntry | null = null;

export function setClipboard(entry: ClipboardEntry) {
  clipboard = entry;
}

export function getClipboard(): ClipboardEntry | null {
  return clipboard;
}
