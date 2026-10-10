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
    <Collapsible title="Übergang zur nächsten Folie">
      <p className="weft-hint">
        Legt fest, wie diese Folie beim Weiterblättern verschwindet - zur nächsten Folie, in einen Logikblock oder zum
        Ende des Lernmoduls.
      </p>
      <label className="weft-field">
        <span>Art</span>
        <select value={type} onChange={(e) => setEndTransitionType(page.id, endId, e.target.value as TransitionType)}>
          {TRANSITION_TYPES.map((t) => (
            <option key={t} value={t}>
              {TRANSITION_LABELS[t]}
            </option>
          ))}
        </select>
      </label>

      {type !== "none" && (
        <label className="weft-field">
          <span>Dauer (Sekunden)</span>
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={durationMs / 1000}
            onChange={(e) => {
              const seconds = Number(e.target.value);
              if (!Number.isFinite(seconds) || seconds <= 0) return;
              setEndTransitionDuration(page.id, endId, Math.round(seconds * 1000));
            }}
          />
        </label>
      )}

      {(type === "move" || type === "cube") && (
        <label className="weft-field">
          <span>Richtung</span>
          <select
            value={transitionDirection(transition)}
            onChange={(e) => updateEndTransition(page.id, endId, { direction: e.target.value as TransitionDirection })}
          >
            {DIRECTIONS.map((direction) => (
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
            <span>Nur der Inhalt rutscht</span>
          </label>
          <p className="weft-hint">
            Die Folie selbst bleibt stehen, nur ihr Inhalt rutscht. Das geht nur, wenn beide Folien dasselbe Layout
            haben - sonst rutscht die ganze Folie, und der Inhalt folgt ihr ein kleines bisschen später.
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
            <span>Harter Rand</span>
          </label>
          <p className="weft-hint">
            Mittelpunkt: Der rote Kreis auf der Folie lässt sich verschieben - dort öffnet sich die Blende.
          </p>
          <button
            type="button"
            className="weft-ghost-button weft-full-width"
            disabled={irisCentered}
            onClick={() => updateEndTransition(page.id, endId, { irisCenter: undefined })}
          >
            Mittelpunkt zurücksetzen
          </button>
        </>
      )}
    </Collapsible>
  );
}
