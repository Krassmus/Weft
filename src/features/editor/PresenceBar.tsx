import { presenceColor, usePresence } from "../../core/collab/presence";
import { useDocumentStore } from "../../core/document/store";
import { PersonAvatar } from "./PersonAvatar";

/**
 * The other people connected to this module, as coloured avatars at the right end of the canvas
 * toolbar. Clicking one jumps to the slide that person is on.
 */
export function PresenceBar() {
  const peers = usePresence((s) => s.peers);
  const select = useDocumentStore((s) => s.select);
  const pages = useDocumentStore((s) => s.doc.content.pages);
  const people = Object.values(peers);
  if (people.length === 0) return null;

  return (
    <div className="weft-presence-bar">
      {people.map((person) => {
        const canJump = !!person.pageId && !!pages[person.pageId];
        return (
          <button
            key={person.peerId}
            type="button"
            className="weft-presence-avatar"
            title={canJump ? `${person.name} - zur Folie springen` : person.name}
            onClick={() => canJump && select({ type: "page", pageId: person.pageId as string })}
          >
            <PersonAvatar name={person.name} color={presenceColor(person.peerId)} avatar={person.avatar} />
          </button>
        );
      })}
    </div>
  );
}
