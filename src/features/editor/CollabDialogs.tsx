import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { mergeDocumentFile } from "../../core/collab/merge";
import type { MergeResult } from "../../core/collab/merge";
import { joinSharedDocument } from "../../core/collab/session";
import { loadCollabOptions } from "../../core/collab/settings";
import { pickDocumentFile } from "../../core/io/fileIO";
import { presenceColor, usePresence } from "../../core/collab/presence";
import { SettingsWindow } from "../settings/SettingsWindow";
import { PersonAvatar } from "./PersonAvatar";
import { useCollabDialog } from "./collabDialogStore";
import { tr } from "../../core/i18n/tr";
import { useBackdropClose } from "./useBackdropClose";
import { useDialogA11y } from "./useDialogA11y";

/** The frame of the dialogs: a small window over the editor that closes with Esc or a click beside it.
 * `floating`: a window that does not dim or block what is behind it - the editor stays usable (and visible in its true colours, which is
 * what the colour scheme's dialog is for: picking colours off the slide), and it is moved by its heading. It closes with Esc or its x only.
 * `appear`: the dialog comes in with a short animation (the backdrop fades in, the window rises a little) - for the ones that open on the
 * start screen; the others stay as they are. */
export function DialogFrame({ title, onClose, children, floating = false, appear = false }: { title: string; onClose: () => void; children: ReactNode; floating?: boolean; appear?: boolean }) {
  const backdropClose = useBackdropClose(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Where a floating window stands (null until it is measured: at first at the right, under the toolbar).
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  // A dialog that blocks the rest holds the focus; the floating one (it stays beside the work) does not.
  useDialogA11y(floating ? windowRef : dialogRef, { modal: !floating });
  useLayoutEffect(() => {
    if (!floating || !windowRef.current) return;
    setPosition({ left: Math.max(8, window.innerWidth - windowRef.current.offsetWidth - 16), top: 64 });
  }, [floating]);

  function startMove(e: ReactPointerEvent) {
    if (!floating || !position || !windowRef.current || (e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const box = windowRef.current.getBoundingClientRect();
    const grabX = e.clientX - box.left;
    const grabY = e.clientY - box.top;
    const move = (ev: PointerEvent) =>
      setPosition({
        left: Math.min(Math.max(0, ev.clientX - grabX), window.innerWidth - 80),
        top: Math.min(Math.max(0, ev.clientY - grabY), window.innerHeight - 40),
      });
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  const header = (
    <div className="weft-modal-header" onPointerDown={startMove}>
      <h3>{title}</h3>
      <button type="button" className="weft-icon-button" title={tr("ui.close")} aria-label={tr("ui.close")} onClick={onClose}>
        ×
      </button>
    </div>
  );

  if (floating) {
    return createPortal(
      <div
        ref={windowRef}
        className="weft-modal weft-collab-dialog weft-floating-dialog"
        style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}
      >
        {header}
        {children}
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className={"weft-modal-backdrop" + (appear ? " is-appearing" : "")} {...backdropClose}>
      <div ref={dialogRef} className={"weft-modal weft-collab-dialog" + (appear ? " is-appearing" : "")} onClick={(e) => e.stopPropagation()}>
        {header}
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** File menu > "Einladung beitreten…": paste the invitation link (weft://…) and join. */
function JoinDialog({ onClose }: { onClose: () => void }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  async function join() {
    if (!link.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await joinSharedDocument(link, loadCollabOptions());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogFrame title={tr("ui.join_an_invitation")} onClose={onClose}>
      <p className="weft-hint">
        {tr("ui.if_somebody_has_invited_you_to")}
      </p>
      <p className="weft-hint">
        {tr("ui.the_learning_module_that_is_open")}
      </p>
      <label className="weft-field">
        <span>{tr("ui.invitation_link")}</span>
        <input
          ref={inputRef}
          value={link}
          placeholder="weft://…"
          spellCheck={false}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void join()}
        />
      </label>
      {error && <p className="weft-placeholder-warning">{error}</p>}
      <div className="weft-modal-actions">
        <button type="button" className="weft-ghost-button" onClick={onClose}>
          {tr("ui.cancel")}
        </button>
        <button type="button" className="weft-ghost-button" disabled={!link.trim() || busy} onClick={() => void join()}>
          {busy ? tr("ui.connecting") : tr("ui.join")}
        </button>
      </div>
    </DialogFrame>
  );
}

function describeMerge(result: MergeResult | { ok: false; reason: "no-history" }): { ok: boolean; text: string } {
  if (result.ok) {
    return {
      ok: true,
      text:
        result.newChanges > 0
          ? tr("ui.merged_n_changes", { count: result.newChanges, unit: tr(result.newChanges === 1 ? "ui.change_one" : "ui.change_many") })
          : tr("ui.this_file_contains_nothing_new_all"),
    };
  }
  return {
    ok: false,
    text: {
      unreadable: tr("ui.the_file_cannot_be_read"),
      "no-history":
        tr("ui.this_file_has_no_change_history"),
      "other-module": tr("ui.this_is_a_different_learning_module"),
      "no-common-origin":
        tr("ui.the_file_does_not_go_back"),
    }[result.reason],
  };
}

/** File menu > "Mit Datei zusammenführen…": explains what it does, then lets the person pick the other file. */
function MergeDialog({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function choose() {
    setMessage(null);
    const picked = await pickDocumentFile(tr("ui.choose_the_file_to_merge"));
    if (!picked) return;
    setMessage(describeMerge(mergeDocumentFile(picked.bytes)));
  }

  return (
    <DialogFrame title={tr("ui.merge_with_file")} onClose={onClose}>
      <p className="weft-hint">
        {tr("ui.merge_intro")}
      </p>
      <ol className="weft-collab-steps">
        <li>{tr("ui.you_choose_the_other_file")}</li>
        <li>
          {tr("ui.weft_adds_to_your_version_what")}
        </li>
        <li>{tr("ui.new_images_videos_and_fonts_from")}</li>
      </ol>
      <p className="weft-hint">
        {tr("ui.this_needs_neither_internet_nor_a")}
      </p>
      {message && <p className={message.ok ? "weft-hint" : "weft-placeholder-warning"}>{message.text}</p>}
      <div className="weft-modal-actions">
        <button type="button" className="weft-ghost-button" onClick={onClose}>
          {tr("ui.close")}
        </button>
        <button type="button" className="weft-ghost-button" onClick={() => void choose()}>
          {message ? tr("ui.choose_another_file") : tr("ui.choose_file")}
        </button>
      </div>
    </DialogFrame>
  );
}

/** The dialogs for working together that the File menu opens. */
/** The app's settings (language, profile, network) as a dialog - the desktop app has them in a window of their own. */
function SettingsDialog({ onClose }: { onClose: () => void }) {
  return (
    <DialogFrame title={tr("ui.settings")} onClose={onClose}>
      <div className="weft-settings-dialog">
        <SettingsWindow />
      </div>
    </DialogFrame>
  );
}

/** Who is working on the module right now: the other people with the names they chose. */
function PeopleDialog({ onClose }: { onClose: () => void }) {
  const peers = usePresence((s) => s.peers);
  const people = Object.values(peers).sort((a, b) => a.name.localeCompare(b.name, "de"));
  return (
    <DialogFrame title={tr("ui.who_is_working_on_it")} onClose={onClose}>
      {people.length === 0 ? (
        <p className="weft-hint">{tr("ui.nobody_else_is_connected_right_now")}</p>
      ) : (
        <ul className="weft-people-list">
          {people.map((person) => (
            <li key={person.peerId}>
              <PersonAvatar name={person.name} color={presenceColor(person.peerId)} avatar={person.avatar} size={36} />
              <span className="weft-people-name">{person.name}</span>
            </li>
          ))}
        </ul>
      )}
    </DialogFrame>
  );
}

export function CollabDialogs() {
  const open = useCollabDialog((s) => s.open);
  const close = useCollabDialog((s) => s.close);
  if (open === "join") return <JoinDialog onClose={close} />;
  if (open === "merge") return <MergeDialog onClose={close} />;
  if (open === "settings") return <SettingsDialog onClose={close} />;
  if (open === "people") return <PeopleDialog onClose={close} />;
  return null;
}
