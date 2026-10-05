import type { VariableDef } from "../types";
import { parseExpression, referencedNames } from "./expressions";

export const SUCCESS_VARIABLE_NAME = "success";

/** A variable whose value comes from a formula rather than being stored - the "Berechnet" type
 * (which the built-in `success` can be switched to as well). */
export function isComputedVariable(variable: VariableDef): boolean {
  return variable.type === "computed";
}

/** A variable that is a Ja/Nein: the "Ja/Nein" type, or the built-in `success` whichever of its two
 * types it is currently set to (a computed `success` still yields Ja/Nein). */
export function isBooleanVariable(variable: VariableDef): boolean {
  return variable.type === "boolean" || variable.fixed === true;
}

/** Every variable that quiz effects can change, i.e. all that aren't computed. */
export function isSettableVariable(variable: VariableDef): boolean {
  return !isComputedVariable(variable);
}

export function defaultInitialValue(type: VariableDef["type"]): VariableDef["initialValue"] {
  return type === "number" ? 0 : type === "string" ? "" : false;
}

function uniqueName(base: string, taken: Set<string>): string {
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}${n}`;
  return name;
}

/**
 * Makes sure the built-in `success` variable exists (a Ja/Nein, `fixed`), at the top of the list.
 * Safe to run on any module, any number of times: one that already has it is left alone (apart from
 * an older "Ja/Nein with a formula" being recognised as the computed kind it now is), an older module that had already made a boolean variable named
 * "success" of its own simply has it adopted as the built-in one, and any OTHER kind of variable
 * that happens to carry the name is renamed out of the way. Run when a document is opened
 * (io/unpack.ts) and when a new one is created.
 */
export function ensureBuiltinVariables(variables: VariableDef[]): void {
  const existing = variables.find((v) => v.fixed && v.name === SUCCESS_VARIABLE_NAME);
  if (existing) {
    // Saved while `success` was still always a Ja/Nein with an optional formula: a formula means it was computed.
    if (existing.type === "boolean" && existing.expression?.trim()) existing.type = "computed";
    // Whatever else it might hold, it is only ever a Ja/Nein or a computed one.
    else if (existing.type !== "boolean" && existing.type !== "computed") existing.type = "boolean";
    return;
  }
  const sameName = variables.find((v) => v.name === SUCCESS_VARIABLE_NAME);
  if (sameName?.type === "boolean") {
    sameName.fixed = true;
    return;
  }
  if (sameName) {
    sameName.name = uniqueName(`${SUCCESS_VARIABLE_NAME}_alt`, new Set(variables.map((v) => v.name)));
  }
  variables.unshift({ id: "builtin:success", name: SUCCESS_VARIABLE_NAME, type: "boolean", initialValue: false, fixed: true });
}

/**
 * What is wrong with each computed variable's formula, by variable id (variables without a problem
 * aren't in the map): a syntax error, a name that isn't a variable, a formula that refers to its
 * own variable, or a circle of computed variables that read each other. `virtualNames` are the
 * always-present variables like `progress` that formulas may use too.
 */
export function computedVariableProblems(variables: VariableDef[], virtualNames: readonly string[]): Map<string, string> {
  const problems = new Map<string, string>();
  const byName = new Map(variables.map((v) => [v.name, v]));
  const references = new Map<string, Set<string>>();

  for (const variable of variables) {
    if (!isComputedVariable(variable)) continue;
    const parsed = parseExpression(variable.expression ?? "");
    if (!parsed.ok) {
      problems.set(variable.id, parsed.error);
      continue;
    }
    const names = referencedNames(parsed.expr);
    if (names.has(variable.name)) {
      problems.set(variable.id, `Die Berechnung bezieht sich auf „${variable.name}" selbst.`);
      continue;
    }
    const unknown = [...names].find((name) => !byName.has(name) && !virtualNames.includes(name));
    if (unknown) {
      problems.set(variable.id, `Die Variable „${unknown}" gibt es nicht.`);
      continue;
    }
    references.set(variable.name, names);
  }

  // A circle: following computed variables' references from one leads back to it.
  for (const start of references.keys()) {
    const seen = new Set<string>();
    const stack = [...(references.get(start) ?? [])];
    while (stack.length > 0) {
      const name = stack.pop()!;
      if (name === start) {
        const variable = byName.get(start)!;
        problems.set(variable.id, `Zirkelbezug: „${start}" hängt über andere berechnete Variablen von sich selbst ab.`);
        break;
      }
      if (seen.has(name)) continue;
      seen.add(name);
      stack.push(...(references.get(name) ?? []));
    }
  }
  return problems;
}
