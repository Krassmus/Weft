import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { joinSharedDocument, parseInvitation } from "./collab/session";
import { loadCollabOptions } from "./collab/settings";
import { confirmDestructive, showWarning } from "./io/fileIO";

/**
 * A click on an invitation link ("weft:...") anywhere - a mail, a chat, a web page - hands the link to
 * the operating system, which starts Weft with it (or, if Weft is running, passes it on). The Tauri
 * deep-link plugin delivers it here, and Weft joins: after asking, since a link from outside is not
 * something that should replace the module being worked on without a word.
 */
const SCHEME = /^weft:/i;
// The same link can arrive twice (as the one that started the app, and as an event).
const recentlyHandled = new Map<string, number>();
const REPEAT_WINDOW_MS = 5000;

/** The first invitation link among `urls`, or null. */
export function invitationAmong(urls: string[] | null | undefined): string | null {
  return urls?.find((url) => SCHEME.test(url.trim()))?.trim() ?? null;
}

export async function handleInvitationLink(link: string): Promise<void> {
  const now = Date.now();
  if (now - (recentlyHandled.get(link) ?? 0) < REPEAT_WINDOW_MS) return;
  recentlyHandled.set(link, now);

  if (!parseInvitation(link).url.replace(/^automerge:/, "")) {
    await showWarning("Das ist kein gültiger Einladungslink.", "Einladung");
    return;
  }
  const accepted = await confirmDestructive(
    "Du wurdest zu einem Lernmodul eingeladen. Beitreten? Das gerade geöffnete Lernmodul wird dafür geschlossen (seine Änderungen werden vorher automatisch gespeichert), und du arbeitest dann live mit den anderen am eingeladenen Lernmodul.",
    "Einladung",
  );
  if (!accepted) return;
  try {
    await joinSharedDocument(link, loadCollabOptions());
  } catch (error) {
    await showWarning(error instanceof Error ? error.message : String(error), "Einladung");
  }
}

/**
 * Listens for invitation links - the one that started the app, and any that arrive while it is running.
 * `ready` is waited for before the first one is handled: at launch the app first reopens what was open
 * last, and a join before that would be replaced by it. Returns a function that stops listening.
 */
export function startDeepLinks(ready: Promise<unknown>): () => void {
  let stopped = false;
  let unlisten: (() => void) | null = null;

  void (async () => {
    await ready;
    if (stopped) return;
    const launchedWith = invitationAmong(await getCurrent().catch(() => null));
    if (launchedWith) void handleInvitationLink(launchedWith);
    const off = await onOpenUrl((urls) => {
      const link = invitationAmong(urls);
      if (link) void handleInvitationLink(link);
    });
    if (stopped) off();
    else unlisten = off;
  })();

  return () => {
    stopped = true;
    unlisten?.();
  };
}
