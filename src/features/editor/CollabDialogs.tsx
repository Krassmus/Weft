import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { mergeDocumentFile } from "../../core/collab/merge";
import type { MergeResult } from "../../core/collab/merge";
import { joinSharedDocument } from "../../core/collab/session";
import { loadCollabOptions } from "../../core/collab/settings";
import { pickDocumentFile } from "../../core/io/fileIO";
import { SettingsWindow } from "../settings/SettingsWindow";
import { useCollabDialog } from "./collabDialogStore";

/** The frame of both dialogs: a small window over the editor that closes with Esc or a click beside it. */
export function DialogFrame({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="weft-modal-backdrop" onClick={onClose}>
      <div className="weft-modal weft-collab-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="weft-modal-header">
          <h3>{title}</h3>
          <button type="button" className="weft-icon-button" title="Schließen" onClick={onClose}>
            ×
          </button>
        </div>
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
    <DialogFrame title="Einladung beitreten" onClose={onClose}>
      <p className="weft-hint">
        Hat dich jemand zu einem Lernmodul eingeladen, bekommst du dafür einen Link, der mit „weft://“ beginnt. Füge
        ihn hier ein: Weft verbindet sich dann direkt mit den anderen, und ihr arbeitet live am selben Lernmodul.
      </p>
      <p className="weft-hint">
        Das gerade geöffnete Lernmodul wird dafür geschlossen. Ist es eine Kopie desselben Lernmoduls, bleiben deine
        Änderungen daran erhalten und werden mit denen der anderen verbunden.
      </p>
      <label className="weft-field">
        <span>Einladungslink</span>
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
          Abbrechen
        </button>
        <button type="button" className="weft-ghost-button" disabled={!link.trim() || busy} onClick={() => void join()}>
          {busy ? "Verbinde …" : "Beitreten"}
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
          ? `Zusammengeführt: ${result.newChanges} ${result.newChanges === 1 ? "Änderung" : "Änderungen"} aus der Datei übernommen.`
          : "Diese Datei enthält nichts Neues - alle ihre Änderungen sind schon da.",
    };
  }
  return {
    ok: false,
    text: {
      unreadable: "Die Datei lässt sich nicht lesen.",
      "no-history":
        "Diese Datei hat keinen Änderungsverlauf (sie stammt aus einer älteren Weft-Version oder ist ein Export). Sie lässt sich nur öffnen, nicht zusammenführen.",
      "other-module": "Das ist ein anderes Lernmodul.",
      "no-common-origin":
        "Die Datei geht nicht auf dieselbe Ausgangsdatei zurück. Zusammenführen geht nur mit Kopien einer Datei, die mit dieser Weft-Version gespeichert wurde - und nicht, wenn eine der beiden danach mit „Verlauf verkleinern“ bearbeitet wurde.",
    }[result.reason],
  };
}

/** File menu > "Mit Datei zusammenführen…": explains what it does, then lets the person pick the other file. */
function MergeDialog({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function choose() {
    setMessage(null);
    const picked = await pickDocumentFile("Datei zum Zusammenführen auswählen");
    if (!picked) return;
    setMessage(describeMerge(mergeDocumentFile(picked.bytes)));
  }

  return (
    <DialogFrame title="Mit Datei zusammenführen" onClose={onClose}>
      <p className="weft-hint">
        Hat jemand eine Kopie dieser .weft-Datei weiterbearbeitet und dir geschickt, kannst du ihre Änderungen hier
        in das geöffnete Lernmodul übernehmen:
      </p>
      <ol className="weft-collab-steps">
        <li>Du wählst die andere Datei aus.</li>
        <li>
          Weft fügt zu deinem Stand hinzu, was dort geändert wurde. Deine eigenen Änderungen bleiben erhalten. Haben
          beide dasselbe geändert (zum Beispiel denselben Text), bleibt eine der beiden Fassungen - bei allen, die
          zusammenführen, dieselbe.
        </li>
        <li>Neue Bilder, Videos und Schriften aus der Datei kommen mit.</li>
      </ol>
      <p className="weft-hint">
        Dafür braucht es weder Internet noch Server, und ihr müsst nicht gleichzeitig arbeiten. Voraussetzung: Beide
        Dateien gehen auf dieselbe, mit dieser Weft-Version gespeicherte Ausgangsdatei zurück.
      </p>
      {message && <p className={message.ok ? "weft-hint" : "weft-placeholder-warning"}>{message.text}</p>}
      <div className="weft-modal-actions">
        <button type="button" className="weft-ghost-button" onClick={onClose}>
          Schließen
        </button>
        <button type="button" className="weft-ghost-button" onClick={() => void choose()}>
          {message ? "Weitere Datei auswählen …" : "Datei auswählen …"}
        </button>
      </div>
    </DialogFrame>
  );
}

/** The dialogs for working together that the File menu opens. */
/** The app's settings (language, profile, network) as a dialog - the desktop app has them in a window of their own. */
function SettingsDialog({ onClose }: { onClose: () => void }) {
  return (
    <DialogFrame title="Einstellungen" onClose={onClose}>
      <div className="weft-settings-dialog">
        <SettingsWindow />
      </div>
    </DialogFrame>
  );
}

export function CollabDialogs() {
  const open = useCollabDialog((s) => s.open);
  const close = useCollabDialog((s) => s.close);
  if (open === "join") return <JoinDialog onClose={close} />;
  if (open === "merge") return <MergeDialog onClose={close} />;
  if (open === "settings") return <SettingsDialog onClose={close} />;
  return null;
}
