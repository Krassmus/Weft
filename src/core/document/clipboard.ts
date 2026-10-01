import type { Block, Page } from "../types";

export type ClipboardEntry = { kind: "page"; page: Page } | { kind: "block"; block: Block };

/**
 * An in-app clipboard, not the OS one - a same-session fallback for when the real OS clipboard
 * (see WEFT_CLIPBOARD_MARKER below) isn't reachable at all, e.g. navigator.clipboard.read() being
 * unsupported/denied in a particular webview. Cmd/Ctrl+C stores the copied page or block here as
 * well as writing the OS clipboard; Cmd/Ctrl+V (see useCopyPaste.ts) only ever reads this when
 * the OS clipboard read itself failed, never merely because the OS clipboard held something else -
 * see useCopyPaste.ts's own header comment for why that distinction matters.
 */
let clipboard: ClipboardEntry | null = null;

export function setClipboard(entry: ClipboardEntry) {
  clipboard = entry;
}

export function getClipboard(): ClipboardEntry | null {
  return clipboard;
}

/** Tagged prefix a page/block copy is also written to the real OS clipboard under (as plain
 * text - see useCopyPaste.ts), so a paste can tell "this is Weft's own structured data" apart
 * from ordinary text/HTML/images copied from any other application, and so it keeps working
 * across windows/launches, not just within one in-memory session. Versioned so a future format
 * change can add a "v2:" variant without either version misreading the other's payload - an
 * unrecognized version (or anything not starting with this prefix at all) is just ordinary
 * clipboard text as far as parseClipboardText is concerned. */
const WEFT_CLIPBOARD_MARKER = "weft-clipboard-v1:";

export function serializeClipboardEntry(entry: ClipboardEntry): string {
  return WEFT_CLIPBOARD_MARKER + JSON.stringify(entry);
}

/** The inverse of serializeClipboardEntry - null for anything that isn't recognizably Weft's own
 * tagged payload (plain text/HTML from another app, a differently-versioned/corrupted marker,
 * ...), which the caller treats exactly like any other non-Weft clipboard content. Only checks
 * the shape shallowly (a valid `kind` plus a present, object-typed payload) rather than fully
 * validating every field - pasteBlockInto/pastePageAfter already tolerate whatever they're
 * handed the same way they always have for the in-app clipboard above, which was never any more
 * strictly validated than this either. */
export function parseClipboardText(text: string): ClipboardEntry | null {
  if (!text.startsWith(WEFT_CLIPBOARD_MARKER)) return null;
  try {
    const parsed: unknown = JSON.parse(text.slice(WEFT_CLIPBOARD_MARKER.length));
    if (typeof parsed !== "object" || parsed === null) return null;
    const entry = parsed as Record<string, unknown>;
    if (entry.kind === "page" && typeof entry.page === "object" && entry.page !== null) return entry as ClipboardEntry;
    if (entry.kind === "block" && typeof entry.block === "object" && entry.block !== null) return entry as ClipboardEntry;
    return null;
  } catch {
    return null;
  }
}
