import { renderProgress } from "../../../core/blocks/progress/render.js";
import type { ProgressRenderContext, ProgressRenderProps } from "../../../core/blocks/progress/render.js";
import { useDocumentStore } from "../../../core/document/store";
import { pageProgress } from "../../../core/document/pageProgress";
import type { ProgressBlock } from "../../../core/types";
import { RenderHost } from "./RenderHost";
import { useStagePageId } from "./stagePage";

/**
 * A progress bar as it is drawn in the editor - the canvas, the thumbnails and the PDF: by the function the player draws it with (blocks/progress/
 * render.js). Nothing moves here: it shows the value its variable has to begin with - for `progress` the value it has on this page (see pageProgress:
 * on the canvas the stage's page, in a thumbnail the page it is the picture of, `progress`), else half.
 */
export function ProgressView({ block, mode, progress }: { block: ProgressBlock; mode: ProgressRenderContext["mode"]; progress?: number | null }) {
  const stagePageId = useStagePageId();
  const variables = useDocumentStore((s) => s.doc.content.variables);
  const name = block.variable || "progress";
  const declared = variables.find((v) => v.name === block.variable);
  const initial = declared && declared.type === "number" ? Number(declared.initialValue) : NaN;
  // (A declared variable of the name `progress` wins over the virtual one, as when played.)
  const ofCanvasPage = useDocumentStore((s) =>
    stagePageId && !Number.isFinite(initial) && name === "progress" && !declared ? pageProgress(s.doc.content, stagePageId) : null,
  );
  const ofPage = mode === "edit" ? ofCanvasPage : name === "progress" ? (progress ?? null) : null;
  const known = Number.isFinite(initial) ? initial : (ofPage ?? 50);
  const props: ProgressRenderProps = {
    value: Math.min(100, Math.max(0, known)),
    moveMs: 0,
    color: block.color,
    trackColor: block.trackColor,
    rounded: block.rounded,
    label: name,
  };
  return <RenderHost render={renderProgress} props={props} ctx={{ mode }} />;
}
