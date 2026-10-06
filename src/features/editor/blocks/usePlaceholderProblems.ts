import { useMemo } from "react";
import { findBlockPlaceholderProblems } from "../../../core/document/variablePlaceholders";
import { useDocumentStore } from "../../../core/document/store";
import { virtualVariableNamesFor } from "../../../core/document/virtualVariables";
import type { Block } from "../../../core/types";

/** Why a {{variable}} placeholder in `block`'s texts won't show its value when played (see
 * findPlaceholderProblems) - shared by the on-canvas warning badge and the sidebar's own note. */
export function usePlaceholderProblems(block: Block): string[] {
  const variables = useDocumentStore((s) => s.doc.content.variables);
  const languages = useDocumentStore((s) => s.doc.content.languages);
  return useMemo(
    () =>
      findBlockPlaceholderProblems(block, new Set([...variables.map((v) => v.name), ...virtualVariableNamesFor(languages)])),
    [block, variables, languages],
  );
}
