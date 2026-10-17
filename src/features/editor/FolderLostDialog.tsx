import { useEffect, useState } from "react";
import { chooseSyncFolder, startFolderSync, stopFolderSync, useFolderSync } from "../../core/collab/folder/folderSession";
import type { FolderLost } from "../../core/collab/folder/folderSession";
import { tr } from "../../core/i18n/tr";
import { confirmDestructive } from "../../core/io/fileIO";
import { DialogFrame } from "./CollabDialogs";

/** What is wrong when the folder a module is synced with is not where it was (see FolderLost). */
export function folderLostText(lost: FolderLost): string {
  return tr(lost.reason === "folder" ? "ui.folder_lost_root" : "ui.folder_lost_dir", { path: lost.folder });
}

/**
 * Said when a module that is synced with a shared folder is opened and the folder is gone (a Nextcloud folder moved or renamed by
 * somebody, a drive that is not connected) - or goes while it is open: a way to choose the folder it is now in (or another), to cut the
 * connection, or to leave it for later (the settings of the module keep saying so).
 */
export function FolderLostDialog() {
  const lost = useFolderSync((s) => s.lost);
  // Asked once for each time it is found out; "later" closes it until the next time.
  const [shown, setShown] = useState<FolderLost | null>(null);
  useEffect(() => setShown(lost), [lost]);
  if (!lost || shown !== lost) return null;

  async function chooseNew() {
    const folder = await chooseSyncFolder();
    if (folder) await startFolderSync(folder);
  }

  function disconnect() {
    void confirmDestructive(tr("ui.really_stop_folder_sync"), tr("ui.disconnect_folder")).then((ok) => {
      if (ok) stopFolderSync(true);
    });
  }

  return (
    <DialogFrame title={tr("ui.folder_lost_title")} onClose={() => setShown(null)}>
      <p className="weft-placeholder-warning">{folderLostText(lost)}</p>
      <p className="weft-hint">{tr("ui.folder_lost_explain")}</p>
      <div className="weft-modal-actions">
        <button type="button" className="weft-ghost-button" onClick={() => setShown(null)}>
          {tr("ui.folder_lost_later")}
        </button>
        <button type="button" className="weft-ghost-button" onClick={disconnect}>
          {tr("ui.disconnect_folder")}
        </button>
        <button type="button" className="weft-ghost-button" onClick={() => void chooseNew()}>
          {tr("ui.folder_lost_choose")}
        </button>
      </div>
    </DialogFrame>
  );
}
