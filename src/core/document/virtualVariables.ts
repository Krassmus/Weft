/** Variables that always exist and compute themselves - usable in {{placeholders}} in texts, but
 * never declared in the module's own variable list (so they can't be set, removed or branched on).
 * The values themselves are computed by player.runtime.js (variableValueByName) - keep the names
 * in sync with it. A variable the author declares under the same name takes precedence there. */
export const VIRTUAL_VARIABLES: { name: string; range: string; description: string }[] = [
  {
    name: "progress",
    range: "0–100",
    description:
      "Fortschritt in Prozent (0–100): besuchte Folien im Verhältnis zu besuchten plus maximal noch folgenden Folien, bei Verzweigungen über den längsten Zweig. Auf der letzten Folie 100.",
  },
];

export const VIRTUAL_VARIABLE_NAMES: readonly string[] = VIRTUAL_VARIABLES.map((v) => v.name);
