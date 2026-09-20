import { ASPECT_RATIOS } from "../../../core/aspectRatio";
import {
  setAspectRatio,
  setLmsAllowedOrigins,
  setLmsEnabled,
  setModuleTitle,
} from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";

export function SettingsTab() {
  const content = useDocumentStore((s) => s.doc.content);

  return (
    <div className="weft-tab-panel">
      <label className="weft-field">
        <span>Titel</span>
        <input value={content.title} onChange={(e) => setModuleTitle(e.target.value)} />
      </label>

      <label className="weft-field">
        <span>Seitenverhältnis</span>
        <select value={content.aspectRatio} onChange={(e) => setAspectRatio(e.target.value as (typeof ASPECT_RATIOS)[number])}>
          {ASPECT_RATIOS.map((ratio) => (
            <option key={ratio} value={ratio}>
              {ratio}
            </option>
          ))}
        </select>
      </label>

      <label className="weft-field">
        <span>Modul-ID</span>
        <code className="weft-module-id">{content.id}</code>
      </label>

      <div className="weft-divider" />

      <label className="weft-field weft-field-inline">
        <input type="checkbox" checked={content.lms.enabled} onChange={(e) => setLmsEnabled(e.target.checked)} />
        <span>LMS-Anbindung (Stud.IP, postMessage)</span>
      </label>
      {content.lms.enabled && (
        <label className="weft-field">
          <span>Erlaubte Origins (eine pro Zeile)</span>
          <textarea
            rows={3}
            value={content.lms.allowedOrigins.join("\n")}
            onChange={(e) => setLmsAllowedOrigins(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
          />
        </label>
      )}
    </div>
  );
}
