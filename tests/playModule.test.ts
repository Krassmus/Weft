import { describe, expect, it } from "vitest";
import { startLocaleFor } from "../src/core/io/playModule";

describe("startLocaleFor (the language a bundled tutorial starts in)", () => {
  const all = ["de_DE", "en_US", "es_ES", "fr_FR", "pt_BR", "it_IT", "tr_TR", "pl_PL"];

  it("is the module's language that matches the language of the interface", () => {
    expect(startLocaleFor(all, "de")).toBe("de_DE");
    expect(startLocaleFor(all, "pt")).toBe("pt_BR");
    expect(startLocaleFor(all, "pl")).toBe("pl_PL");
  });

  it("is English when the module has no text in the language of the interface", () => {
    expect(startLocaleFor(["de_DE", "en_US"], "tr")).toBe("en_US");
  });

  it("is nothing (the player decides) when there is neither", () => {
    expect(startLocaleFor(["de_DE", "fr_FR"], "tr")).toBeNull();
    expect(startLocaleFor([], "en")).toBeNull();
  });
});
