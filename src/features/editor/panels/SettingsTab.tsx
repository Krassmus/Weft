import { ASPECT_RATIOS } from "../../../core/aspectRatio";
import {
  addCustomFont,
  removeCustomFont,
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

      <div className="weft-field">
        {/* The file input's own <label> must wrap only the input itself - nesting the chip
            list's remove buttons inside it too would make clicking them also forward a click to
            the input (a label's default action activates whichever labelable control it wraps),
            popping the native file picker open on every removal. */}
        <label className="weft-field">
          <span>Eigene Schriftart hochladen</span>
          <input
            type="file"
            accept=".woff2,.woff,.ttf,.otf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) addCustomFont(file);
            }}
          />
        </label>
        <p className="weft-hint">
          Hochgeladene Schriften stehen im ganzen Lernmodul zur Verfügung, tauchen bei jedem Textelement in der
          Schriftarten-Auswahl auf und werden beim Export automatisch mit eingebettet.
        </p>
        {content.customFonts.length > 0 && (
          <div className="weft-custom-font-list">
            {content.customFonts.map((font) => (
              <span key={font.id} className="weft-custom-font-chip">
                {font.family}
                <button type="button" title="Entfernen" onClick={() => removeCustomFont(font.id)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

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
