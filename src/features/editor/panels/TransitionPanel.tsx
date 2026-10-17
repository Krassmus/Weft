import { setEndTransitionDuration, setEndTransitionType, updateEndTransition } from "../../../core/document/actions";
import {
  DEFAULT_IRIS_CENTER,
  DIRECTION_LABELS,
  TRANSITION_LABELS,
  TRANSITION_TYPES,
  transitionDirection,
} from "../../../core/document/transitions";
import type { Page, TransitionDirection, TransitionType } from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { SecondsControl } from "./SecondsControl";
import { tr } from "../../../core/i18n/tr";

const DIRECTIONS: TransitionDirection[] = ["left", "right", "up", "down"];

/**
 * The "Nächste Folie" node at the right end of a page's timeline (see Timeline.tsx) selects into
 * this - how the page animates out on the way to whatever comes next (another page, a logic
 * block, or the module's end). Every type but "none" is animated by the player (see
 * animateTransition in player.runtime.js). Below the type, each one shows only the options it
 * actually has: the duration (all but "none", which always cuts instantly), a direction (move,
 * cube), content-only (move), a hard edge and the opening point (iris - the point itself is set by
 * dragging the red circle on the slide, see IrisCenterHandle in Canvas.tsx).
 */
export function TransitionPanel({ page, endId }: { page: Page; endId: string }) {
  const transition = page.timeline.ends[endId]?.transition;
  if (!transition) return null;
  const { type, durationMs } = transition;
  const irisCenter = transition.irisCenter ?? DEFAULT_IRIS_CENTER;
  const irisCentered = irisCenter.x === DEFAULT_IRIS_CENTER.x && irisCenter.y === DEFAULT_IRIS_CENTER.y;

  return (
    <Collapsible title={tr("ui.transition_to_the_next_slide")}>
      <p className="weft-hint">
        {tr("ui.defines_how_this_slide_disappears_when")}
      </p>
      <label className="weft-field">
        <span>{tr("ui.type")}</span>
        <select value={type} onChange={(e) => setEndTransitionType(page.id, endId, e.target.value as TransitionType)}>
          {TRANSITION_TYPES.map((t) => (
            <option key={t} value={t}>
              {TRANSITION_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      {type !== "none" && (
        <div className="weft-field">
          <span>{tr("ui.duration_in_seconds")}</span>
          <SecondsControl
            label={tr("ui.duration_seconds")}
            minMs={100}
            valueMs={durationMs}
            onChange={(ms) => setEndTransitionDuration(page.id, endId, ms)}
          />
        </div>
      )}

      {(type === "move" || type === "cube" || type === "wheel") && (
        <label className="weft-field">
          <span>{tr("ui.direction")}</span>
          <select
            value={transitionDirection(transition)}
            onChange={(e) => updateEndTransition(page.id, endId, { direction: e.target.value as TransitionDirection })}
          >
            {DIRECTIONS.filter((direction) => type !== "wheel" || direction === "left" || direction === "right").map((direction) => (
              <option key={direction} value={direction}>
                {DIRECTION_LABELS[direction]}
              </option>
            ))}
          </select>
        </label>
      )}

      {type === "move" && (
        <>
          <label className="weft-field weft-field-inline">
            <input
              type="checkbox"
              checked={!!transition.contentOnly}
              onChange={(e) => updateEndTransition(page.id, endId, { contentOnly: e.target.checked })}
            />
            <span>{tr("ui.only_the_content_slides")}</span>
          </label>
          <p className="weft-hint">
            {tr("ui.the_slide_itself_stays_in_place")}
          </p>
        </>
      )}

      {type === "iris" && (
        <>
          <label className="weft-field weft-field-inline">
            <input
              type="checkbox"
              checked={!!transition.hardEdge}
              onChange={(e) => updateEndTransition(page.id, endId, { hardEdge: e.target.checked })}
            />
            <span>{tr("ui.hard_edge")}</span>
          </label>
          <p className="weft-hint">
            {tr("ui.centre_the_red_circle_on_the")}
          </p>
          <button
            type="button"
            className="weft-ghost-button weft-full-width"
            disabled={irisCentered}
            onClick={() => updateEndTransition(page.id, endId, { irisCenter: undefined })}
          >
            {tr("ui.reset_centre")}
          </button>
        </>
      )}
    </Collapsible>
  );
}
