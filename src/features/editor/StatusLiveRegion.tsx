import { useStatusStore } from "../../core/accessibility/statusAnnouncer";

/** The live region the messages of announceStatus are read from - invisible, always there. */
export function StatusLiveRegion() {
  const messages = useStatusStore((s) => s.messages);
  return (
    <div className="weft-sr-only" role="status" aria-live="polite" aria-atomic="false">
      {messages.map((message) => (
        <div key={message.id}>{message.text}</div>
      ))}
    </div>
  );
}
