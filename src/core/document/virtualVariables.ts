/** Variables that always exist and compute themselves - usable in {{placeholders}} in texts and in
 * formulas, but never declared in the module's own variable list (so they can't be set, removed or
 * branched on). The values themselves are computed by player.runtime.js (variableValueByName) -
 * keep the names in sync with it. A variable the author declares under the same name takes
 * precedence there. */
export interface VirtualVariable {
  name: string;
  /** What is shown where a real variable shows its type. */
  range: string;
  description: string;
}

const PROGRESS: VirtualVariable = {
  name: "progress",
  range: "0–100",
  description:
    "Fortschritt in Prozent (0–100): besuchte Folien im Verhältnis zu besuchten plus maximal noch folgenden Folien, bei Verzweigungen über den längsten Zweig. Auf der letzten Folie 100.",
};

const USERLANGUAGE: VirtualVariable = {
  name: "userlanguage",
  range: "en_US",
  description:
    "Die Sprache, in der das Lernmodul gerade angezeigt wird, als Code wie en_US oder de_DE. Der Sprachschalter ändert sie. Gibt es nur, solange im Lernmodul Sprachen ausgewählt sind.",
};

/** The virtual variables a module has: `progress` always, `userlanguage` only while the module
 * offers at least one language. */
export function virtualVariablesFor(languages: readonly string[]): VirtualVariable[] {
  return languages.length > 0 ? [PROGRESS, USERLANGUAGE] : [PROGRESS];
}

export function virtualVariableNamesFor(languages: readonly string[]): string[] {
  return virtualVariablesFor(languages).map((v) => v.name);
}
