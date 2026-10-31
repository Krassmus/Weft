import { tr } from "../i18n/tr";
import type { ModuleLicense, WeftModule } from "../types";

/**
 * The licences of a module (the module's settings, "Lizenz"): four that Weft knows - three of Creative Commons and "all rights reserved" - and the ones the
 * author makes in the settings of the app (licenseStore.ts), each with a text of their own. The module keeps which one it is under as a ModuleLicense.
 */

/** What a new module is under (and what one is read as that says nothing). */
export const DEFAULT_LICENSE_ID = "cc-by-4.0";

type BuiltInId = "cc0" | "cc-by-4.0" | "cc-by-sa-4.0" | "all-rights-reserved";

interface BuiltInLicense {
  id: BuiltInId;
  /** The identifier of the licence in the SPDX list, what other programs know it by ("CC-BY-4.0"). */
  spdx: string;
  /** The text of the licence on the web, none for "all rights reserved" (it has no text of its own). */
  url: string | null;
}

export const BUILT_IN_LICENSES: readonly BuiltInLicense[] = [
  { id: "cc0", spdx: "CC0-1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/legalcode.de" },
  { id: "cc-by-4.0", spdx: "CC-BY-4.0", url: "https://creativecommons.org/licenses/by/4.0/legalcode.de" },
  { id: "cc-by-sa-4.0", spdx: "CC-BY-SA-4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/legalcode.de" },
  { id: "all-rights-reserved", spdx: "All rights reserved", url: null },
];

/** What the licence is called and says, ready to show. */
export interface LicenseDescription {
  id: string;
  /** For a list and a heading. */
  name: string;
  /** Whether it is one Weft knows (otherwise one of the author's own). */
  builtIn: boolean;
  /** One or two sentences on what the licence allows (a built-in one), or the whole text of one of the author's own. */
  text: string;
  /** Where the licence text is on the web (a built-in Creative Commons one). */
  url: string | null;
  /** The identifier for programs ("CC-BY-4.0"); for one of the author's own its name. */
  spdx: string;
}

export function isBuiltInLicense(id: string): id is BuiltInId {
  return BUILT_IN_LICENSES.some((license) => license.id === id);
}

/** The licence a module is under: the one it names, or the default for one that says nothing. */
export function licenseOfModule(content: Pick<WeftModule, "license">): ModuleLicense {
  return content.license ?? { id: DEFAULT_LICENSE_ID };
}

const NAME_KEYS = {
  cc0: "ui.license_cc0_name",
  "cc-by-4.0": "ui.license_cc_by_name",
  "cc-by-sa-4.0": "ui.license_cc_by_sa_name",
  "all-rights-reserved": "ui.license_all_rights_reserved_name",
} as const;

const TEXT_KEYS = {
  cc0: "ui.license_cc0_text",
  "cc-by-4.0": "ui.license_cc_by_text",
  "cc-by-sa-4.0": "ui.license_cc_by_sa_text",
  "all-rights-reserved": "ui.license_all_rights_reserved_text",
} as const;

/** The name of a built-in licence in the language of the app. */
export function builtInLicenseName(id: BuiltInId): string {
  return tr(NAME_KEYS[id]);
}

/** A licence as it is shown: for a built-in one name and explanation in the language of the app, for the author's own what it brings (name and text). */
export function describeLicense(license: ModuleLicense): LicenseDescription {
  if (isBuiltInLicense(license.id)) {
    const known = BUILT_IN_LICENSES.find((entry) => entry.id === license.id)!;
    return { id: known.id, name: tr(NAME_KEYS[known.id]), builtIn: true, text: tr(TEXT_KEYS[known.id]), url: known.url, spdx: known.spdx };
  }
  const name = license.name?.trim() || tr("ui.license_unnamed");
  return { id: license.id, name, builtIn: false, text: license.text ?? "", url: null, spdx: name };
}
