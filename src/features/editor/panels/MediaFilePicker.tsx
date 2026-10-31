import { useEffect, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import { useAssetStore } from "../../../core/assets/assetStore";
import { useDocumentStore } from "../../../core/document/store";
import { tr } from "../../../core/i18n/tr";
import { BlockKindIcon } from "../BlockKindIcon";

/** A size in bytes as people read it ("24,8 MB"). */
export function formatFileSize(bytes: number): string {
  const unit = bytes >= 1024 ** 3 ? { size: 1024 ** 3, name: "GB" } : bytes >= 1024 ** 2 ? { size: 1024 ** 2, name: "MB" } : { size: 1024, name: "KB" };
  return `${(bytes / unit.size).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit.name}`;
}

/** A length in seconds as a clock ("00:01:42"). */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const part = (n: number) => String(n).padStart(2, "0");
  return `${part(Math.floor(whole / 3600))}:${part(Math.floor((whole % 3600) / 60))}:${part(whole % 60)}`;
}

/**
 * What can be told of a video or sound file without playing it: how long it is and, for a video, a still of it (a small picture, made from the first frame on
 * a canvas - not the video element itself, which would offer the system's own menu for a picture of a video on a tablet, see the shield in BlockView).
 */
function useMediaFacts(url: string | null, isVideo: boolean): { duration: number | null; poster: string | null } {
  const [facts, setFacts] = useState<{ duration: number | null; poster: string | null }>({ duration: null, poster: null });
  useEffect(() => {
    setFacts({ duration: null, poster: null });
    if (!url) return;
    let alive = true;
    const element: HTMLMediaElement = document.createElement(isVideo ? "video" : "audio");
    element.preload = "auto";
    element.muted = true;
    const onMetadata = () => {
      if (!alive) return;
      const duration = Number.isFinite(element.duration) ? element.duration : null;
      setFacts((f) => ({ ...f, duration }));
      if (isVideo) element.currentTime = Math.min(0.1, (element.duration || 0) / 2);
    };
    const onFrame = () => {
      if (!alive || !(element instanceof HTMLVideoElement) || !element.videoWidth) return;
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 160 / element.videoWidth);
      canvas.width = Math.round(element.videoWidth * scale);
      canvas.height = Math.round(element.videoHeight * scale);
      canvas.getContext("2d")?.drawImage(element, 0, 0, canvas.width, canvas.height);
      try {
        setFacts((f) => ({ ...f, poster: canvas.toDataURL("image/jpeg", 0.7) }));
      } catch {
        // (A picture that cannot be read back: the tile has no still.)
      }
    };
    element.addEventListener("loadedmetadata", onMetadata);
    element.addEventListener("seeked", onFrame);
    element.src = url;
    return () => {
      alive = false;
      element.removeEventListener("loadedmetadata", onMetadata);
      element.removeEventListener("seeked", onFrame);
      element.removeAttribute("src");
      element.load();
    };
  }, [url, isVideo]);
  return facts;
}

/** The line of the file a block has now: a still (video), its name, its size and length, and a button that takes it away. */
function CurrentFile({ assetId, kind, onRemove }: { assetId: string; kind: "video" | "audio"; onRemove: () => void }) {
  const meta = useDocumentStore((s) => s.doc.content.assets.find((asset) => asset.id === assetId));
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  const size = useAssetStore((s) => s.blobs.get(assetId)?.size ?? null);
  const url = getObjectUrl(assetId) ?? null;
  const { duration, poster } = useMediaFacts(url, kind === "video");
  const name = meta?.fileName.replace(/^[0-9a-f-]{36}_/, "") ?? "";
  const details = [size !== null ? formatFileSize(size) : null, duration !== null ? formatDuration(duration) : null].filter(Boolean).join("  •  ");
  return (
    <div className="weft-filepicker-current">
      <div className="weft-filepicker-still" aria-hidden="true">
        {poster ? <img src={poster} alt="" draggable={false} /> : <BlockKindIcon kind={kind} size={20} />}
        {kind === "video" && poster && (
          <span className="weft-filepicker-play">
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M2 1l7 4-7 4z" fill="currentColor" />
            </svg>
          </span>
        )}
      </div>
      <div className="weft-filepicker-info">
        <span className="weft-filepicker-name" title={name}>
          {name}
        </span>
        {details && <span className="weft-filepicker-details">{details}</span>}
      </div>
      <button type="button" className="weft-filepicker-remove" title={tr("ui.remove")} aria-label={`${tr("ui.remove")}: ${name}`} onClick={onRemove}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 2l8 8M10 2l-8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/**
 * The field for the file of a video, a sound or a picture: a dashed area to click or to drop a file on (instead of the browser's own file field, which looks like
 * nothing else in Weft), with the file the block has now below it. The real `<input type="file">` is inside, hidden - the label opens it, the keyboard focuses it.
 */
export function MediaFilePicker({
  label,
  kind,
  accept,
  title,
  formats,
  disabled,
  acceptsFile,
  onFile,
  current,
}: {
  label: string;
  kind: "video" | "audio" | "image";
  /** The `accept` of the file field (none on a tablet for a video, where it greys out what the system does not know). */
  accept?: string;
  title: string;
  /** What kinds of files go ("MP3, M4A (AAC), WAV, OGG"), shown small below the title. */
  formats?: string;
  disabled?: boolean;
  /** Whether a dropped file is one this field takes (a file that is chosen is checked by the browser, a dropped one is not). */
  acceptsFile?: (file: File) => boolean;
  onFile: (file: File) => void;
  /** The file the block has now, if it has one (a video or a sound): shown below, with a button to take it away. */
  current?: { assetId: string; onRemove: () => void } | null;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function onDrop(event: ReactDragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setOver(false);
    if (disabled) return;
    const file = Array.from(event.dataTransfer.files).find((candidate) => !acceptsFile || acceptsFile(candidate));
    if (file) onFile(file);
  }

  return (
    <div className="weft-field">
      <span>{label}</span>
      <label
        className={"weft-filepicker" + (over ? " is-over" : "") + (disabled ? " is-disabled" : "")}
        onDragOver={(event) => {
          if (disabled || !event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          type="file"
          className="weft-filepicker-input"
          accept={accept}
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // (Chosen again later, the same file must count: the field is emptied.)
            event.target.value = "";
            if (file) onFile(file);
          }}
        />
        <span className="weft-filepicker-icon">
          <BlockKindIcon kind={kind} size={30} />
        </span>
        <span className="weft-filepicker-text">
          <span className="weft-filepicker-title">{title}</span>
          <span className="weft-filepicker-or">{tr("ui.or_drag_and_drop_here")}</span>
        </span>
        {formats && <span className="weft-filepicker-formats">{formats}</span>}
      </label>
      {current && <CurrentFile assetId={current.assetId} kind={kind === "audio" ? "audio" : "video"} onRemove={current.onRemove} />}
    </div>
  );
}
