import { createContext, useContext } from "react";

/** The page whose stage is being edited (null while a layout is): for what depends on where in the module a page stands, like a progress
 * bar showing the value `progress` has there. */
export const StagePageContext = createContext<string | null>(null);

export function useStagePageId(): string | null {
  return useContext(StagePageContext);
}
