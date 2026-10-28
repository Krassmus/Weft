import { renderSolution } from "../../../core/blocks/solution/render.js";
import type { SolutionRenderContext, SolutionRenderProps } from "../../../core/blocks/solution/render.js";
import { fieldWording } from "../../../core/document/translations";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import type { SolutionBlock } from "../../../core/types";
import acceptSvg from "../../../../mockups/icons/accept.svg?raw";
import { RenderHost } from "./RenderHost";

/**
 * A solution word as it is drawn - the canvas, the thumbnails and the PDF: by the function the player draws it with (blocks/solution/render.js), as the
 * empty field with the words that stand in it, as a learner meets it. Nothing here can be used.
 */
export function SolutionView({ block, lang, defaultLang, mode }: { block: SolutionBlock; lang: string | null; defaultLang: string | null; mode: SolutionRenderContext["mode"] }) {
  const strings = playerStringsFor(lang) as unknown as Record<string, string>;
  const props: SolutionRenderProps = {
    id: block.id,
    solution: fieldWording(block, "solution", lang, defaultLang),
    placeholder: fieldWording(block, "placeholder", lang, defaultLang),
    caseSensitive: block.caseSensitive,
    attempts: block.attempts,
  };
  const ctx: SolutionRenderContext = {
    mode,
    text: (key) => strings[key] ?? "",
    textWith: (key, values) => (strings[key] ?? "").replace(/\{(\w+)\}/g, (all, name: string) => (values[name] !== undefined ? String(values[name]) : all)),
    icons: { submit: acceptSvg, correct: "", incorrect: "" },
    fill: () => {},
    attempt: () => {},
    announce: () => {},
  };
  return <RenderHost render={renderSolution} props={props} ctx={ctx} />;
}
