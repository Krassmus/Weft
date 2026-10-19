import { create } from "zustand";

/**
 * Short messages for people who use a screen reader ("Gespeichert", "Exportiert", ...): what the others see happen, and what is shown
 * only for a moment or not at all. They go into the polite live region that App.tsx shows (see StatusLiveRegion).
 */
interface StatusState {
  /** The messages that are in the live region now, each with its own id (a message that is added is read, also when it is the one before). */
  messages: { id: number; text: string }[];
}

let nextId = 1;

export const useStatusStore = create<StatusState>(() => ({ messages: [] }));

export function announceStatus(text: string): void {
  if (!text) return;
  const id = nextId++;
  useStatusStore.setState((state) => ({ messages: [...state.messages, { id, text }] }));
  setTimeout(() => useStatusStore.setState((state) => ({ messages: state.messages.filter((message) => message.id !== id) })), 6000);
}
