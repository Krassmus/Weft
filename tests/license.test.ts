import { beforeEach, describe, expect, it } from "vitest";
import { setCurrentModule } from "../cli/storeStub";
import { createEmptyDocument } from "../src/core/document/createEmptyDocument";
import { setModuleLicense } from "../src/core/document/actions";
import { BUILT_IN_LICENSES, DEFAULT_LICENSE_ID, describeLicense, isBuiltInLicense, licenseOfModule } from "../src/core/license/licenses";
import { buildRuntimeHtml } from "../src/core/runtime/buildRuntimeHtml";
import type { WeftModule } from "../src/core/types";

/**
 * The licence of a module (core/license/): the four that Weft knows, the author's own that a module carries with its name and text, the default for
 * a module that says nothing, and what the exported page tells programs about it.
 */
let module: WeftModule;

beforeEach(() => {
  module = createEmptyDocument().content;
  setCurrentModule(module);
});

describe("the licence of a module", () => {
  it("is CC BY 4.0 for a new module and for one that says nothing", () => {
    expect(DEFAULT_LICENSE_ID).toBe("cc-by-4.0");
    expect(module.license).toEqual({ id: "cc-by-4.0" });
    const old = { ...module };
    delete old.license;
    expect(licenseOfModule(old)).toEqual({ id: "cc-by-4.0" });
  });

  it("knows four licences, each with a name and an explanation, and a text on the web for the Creative Commons ones", () => {
    expect(BUILT_IN_LICENSES.map((license) => license.id)).toEqual(["cc0", "cc-by-4.0", "cc-by-sa-4.0", "all-rights-reserved"]);
    for (const { id } of BUILT_IN_LICENSES) {
      const described = describeLicense({ id });
      expect(described.builtIn).toBe(true);
      expect(described.name.length).toBeGreaterThan(3);
      expect(described.text.length).toBeGreaterThan(20);
    }
    expect(describeLicense({ id: "cc-by-4.0" }).url).toContain("creativecommons.org/licenses/by/4.0");
    expect(describeLicense({ id: "all-rights-reserved" }).url).toBeNull();
    expect(isBuiltInLicense("cc0")).toBe(true);
    expect(isBuiltInLicense("custom-1")).toBe(false);
  });

  it("is changed to a built-in one by its id alone, and to one of the author's own with its name and text", () => {
    setModuleLicense({ id: "cc-by-sa-4.0", name: "ignored", text: "ignored" });
    expect(module.license).toEqual({ id: "cc-by-sa-4.0" });
    setModuleLicense({ id: "custom-1", name: "Nur intern", text: "Nicht weitergeben." });
    expect(module.license).toEqual({ id: "custom-1", name: "Nur intern", text: "Nicht weitergeben." });
    const described = describeLicense(licenseOfModule(module));
    expect(described).toMatchObject({ builtIn: false, name: "Nur intern", text: "Nicht weitergeben.", url: null });
    // (A licence of the author's own without a name still has one to show.)
    expect(describeLicense({ id: "custom-2", name: " ", text: "x" }).name.length).toBeGreaterThan(3);
  });

  it("is told by the exported page: the identifier, and for Creative Commons a link to the text", async () => {
    let html = await buildRuntimeHtml(module);
    expect(html).toContain('<meta name="license" content="CC-BY-4.0" />');
    expect(html).toContain('<link rel="license" href="https://creativecommons.org/licenses/by/4.0/legalcode.de" />');
    setModuleLicense({ id: "all-rights-reserved" });
    html = await buildRuntimeHtml(module);
    expect(html).toContain('<meta name="license" content="All rights reserved" />');
    expect(html).not.toContain('rel="license"');
    // (The name of one of the author's own goes into an attribute: nothing it says can leave it.)
    setModuleLicense({ id: "custom-3", name: 'Meine "Lizenz" <b>', text: "t" });
    html = await buildRuntimeHtml(module);
    expect(html).toContain('<meta name="license" content="Meine &quot;Lizenz&quot; &lt;b&gt;" />');
  });
});
