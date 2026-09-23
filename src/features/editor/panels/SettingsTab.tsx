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
import { confirmDestructive, pickFontFile } from "../../../core/io/fileIO";

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

      <div className="weft-divider" />

      <div className="weft-field">
        <span>Eigene Schriften</span>
        <p className="weft-hint">
          Hochgeladene Schriften stehen im ganzen Lernmodul zur Verfügung, tauchen bei jedem Textelement in der
          Schriftarten-Auswahl auf und werden beim Export automatisch mit eingebettet.
        </p>
        {content.customFonts.length > 0 && (
          <div className="weft-custom-font-list">
            {content.customFonts.map((font) => (
              <div key={font.id} className="weft-custom-font-row">
                <span className="weft-custom-font-row-label">{font.family}</span>
                <span className="weft-custom-font-row-preview" style={{ fontFamily: font.family }}>
                  Abc
                </span>
                <button
                  type="button"
                  title="Entfernen"
                  onClick={() => {
                    void confirmDestructive(`Schriftart „${font.family}“ wirklich entfernen?`, "Schriftart entfernen").then(
                      (ok) => {
                        if (ok) removeCustomFont(font.id);
                      },
                    );
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          className="weft-ghost-button weft-full-width"
          onClick={() => {
            void pickFontFile().then((file) => {
              if (file) addCustomFont(file);
            });
          }}
        >
          + Eigene Schriftart hochladen
        </button>
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
