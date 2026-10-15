import { presenceColor, usePresence } from "../../core/collab/presence";
import { PersonAvatar } from "./PersonAvatar";
import { useCollabDialog } from "./collabDialogStore";
import { tr } from "../../core/i18n/tr";

/**
 * The other people connected to this module, as avatars at the right end of the canvas toolbar. A click on them opens the list of
 * the people with the names they chose (PeopleDialog in CollabDialogs.tsx).
 */
export function PresenceBar() {
  const peers = usePresence((s) => s.peers);
  const people = Object.values(peers);
  if (people.length === 0) return null;

  return (
    <button type="button" className="weft-presence-bar" title={tr("ui.who_is_working_on_it")} onClick={() => useCollabDialog.getState().show("people")}>
      {people.map((person) => (
        <span key={person.peerId} className="weft-presence-avatar">
          <PersonAvatar name={person.name} color={presenceColor(person.peerId)} avatar={person.avatar} />
        </span>
      ))}
    </button>
  );
}
