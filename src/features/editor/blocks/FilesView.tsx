import { playerStringsFor } from "../../../core/i18n/playerStrings";
import type { FilesBlock } from "../../../core/types";

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * What a files block looks like on the canvas and in the thumbnails: the box a learner gets (the
 * player's own: filesBoxElement in player.runtime.js), but with the list shown whether or not there
 * is a password - the author sees what is in it - and a lock on the title if there is one.
 */
export function FilesView({ block }: { block: FilesBlock }) {
  const strings = playerStringsFor(null);
  return (
    <div className="weft-edit-files">
      <div className="weft-edit-files-title">
        {block.protection ? "🔒 " : ""}
        {block.title || strings.filesTitle}
      </div>
      {block.files.length === 0 ? (
        <div className="weft-edit-files-empty">Noch keine Dateien - rechts hinzufügen.</div>
      ) : (
        <ul className="weft-edit-files-list">
          {block.files.map((file) => (
            <li key={file.id} className="weft-edit-files-row">
              <span className="weft-edit-files-name">{file.name}</span>
              <span className="weft-edit-files-size">{formatFileSize(file.size)}</span>
              <span className="weft-edit-files-action">{strings.filesDownload}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
