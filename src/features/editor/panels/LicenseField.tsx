import { openUrl } from "@tauri-apps/plugin-opener";
import { setModuleLicense } from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";
import { tr } from "../../../core/i18n/tr";
import { BUILT_IN_LICENSES, builtInLicenseName, DEFAULT_LICENSE_ID, describeLicense, isBuiltInLicense, licenseOfModule } from "../../../core/license/licenses";
import { moduleLicenseOf, useLicenseStore } from "../../../core/license/licenseStore";
import { runsInTauri } from "../../../core/platform";

/** The licence of the module (the module's settings): a choice among the four Weft knows and the author's own (made in the settings of the app), with what
 * the chosen one says below. */
export function LicenseField() {
  const license = useDocumentStore((s) => licenseOfModule(s.doc.content));
  const own = useLicenseStore((s) => s.licenses);
  const described = describeLicense(license);
  // A licence the module carries that is not (any more) in the author's list - one that came with a module from somebody else: it stays a choice.
  const carried = !isBuiltInLicense(license.id) && !own.some((entry) => entry.id === license.id) ? license : null;

  function choose(id: string) {
    if (isBuiltInLicense(id)) setModuleLicense({ id });
    else {
      const picked = own.find((entry) => entry.id === id);
      if (picked) setModuleLicense(moduleLicenseOf(picked));
    }
  }

  return (
    <>
      <label className="weft-field">
        <span>{tr("ui.license_of_the_module")}</span>
        <select value={license.id} onChange={(e) => choose(e.target.value)}>
          {BUILT_IN_LICENSES.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {builtInLicenseName(entry.id)}
              {entry.id === DEFAULT_LICENSE_ID ? ` - ${tr("ui.license_default")}` : ""}
            </option>
          ))}
          {(own.length > 0 || carried) && (
            <optgroup label={tr("ui.license_own_group")}>
              {own.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name.trim() || tr("ui.license_unnamed")}
                </option>
              ))}
              {carried && (
                <option value={carried.id}>
                  {describeLicense(carried).name} ({tr("ui.license_from_the_module")})
                </option>
              )}
            </optgroup>
          )}
        </select>
      </label>
      {described.builtIn ? (
        <p className="weft-hint">{described.text}</p>
      ) : (
        <pre className="weft-license-text" tabIndex={0} aria-label={described.name}>
          {described.text.trim() || "-"}
        </pre>
      )}
      {described.url && (
        <a
          className="weft-license-link"
          href={described.url}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => {
            if (!runsInTauri()) return;
            e.preventDefault();
            void openUrl(described.url!).catch(() => undefined);
          }}
        >
          {tr("ui.license_full_text")}
        </a>
      )}
      <p className="weft-hint">{tr("ui.license_hint")}</p>
      <p className="weft-hint">{tr("ui.license_own_hint")}</p>
    </>
  );
}
