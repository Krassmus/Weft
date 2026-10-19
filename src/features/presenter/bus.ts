import { emit, listen } from "@tauri-apps/api/event";
import { isTauriRuntime } from "../../core/window/fullscreen";
import type { PresenterMessage } from "./protocol";

/**
 * The line between the presenter's window and the audience window: Tauri's events in the desktop app (they reach every window), a
 * BroadcastChannel between two tabs in a browser (only the development preview - the finished app is the desktop one). Everybody
 * hears everything, also what they sent themselves: the receivers pick the messages meant for them.
 */
const EVENT = "weft-presenter";
const CHANNEL = "weft-presenter";

let sender: BroadcastChannel | null = null;

export function sendPresenterMessage(message: PresenterMessage): void {
  if (isTauriRuntime()) {
    void emit(EVENT, message);
    return;
  }
  sender ??= new BroadcastChannel(CHANNEL);
  sender.postMessage(message);
}

export function onPresenterMessage(handler: (message: PresenterMessage) => void): () => void {
  if (isTauriRuntime()) {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen<PresenterMessage>(EVENT, (event) => handler(event.payload)).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event) => handler(event.data as PresenterMessage);
  return () => channel.close();
}
