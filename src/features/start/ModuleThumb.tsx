import type { ModuleSummary } from "./moduleSummary";

/**
 * The top of a module's first slide, as the picture of a tile: the module's own page in a frame that has the slide's shape
 * (cut off at the bottom by the tile), so that it looks as it does when played. It can't be clicked into - the tile is what is clicked.
 */
export function ModuleThumb({ summary }: { summary: ModuleSummary | null | undefined }) {
  return (
    <div className="weft-start-thumb" aria-hidden="true">
      {summary?.html ? (
        <iframe
          className="weft-start-thumb-frame"
          title={summary.title}
          srcDoc={summary.html}
          sandbox="allow-scripts"
          tabIndex={-1}
          style={{ aspectRatio: String(summary.aspect) }}
        />
      ) : (
        <div className="weft-start-thumb-empty" />
      )}
    </div>
  );
}
