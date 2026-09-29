import { setPageTransition, setPageTransitionDuration } from "../../../core/document/actions";
import type { Page, TransitionType } from "../../../core/types";
import { Collapsible } from "../Collapsible";

const TRANSITION_TYPES: TransitionType[] = ["none", "fade", "move"];

const TRANSITION_LABELS: Record<TransitionType, string> = {
  none: "Keine Animation",
  fade: "Fade",
  move: "Move",
};

/**
 * The "Nächste Folie" node at the right end of a page's timeline (see Timeline.tsx) selects into
 * this - how the page animates out on the way to whatever comes next (another page, a logic
 * block, or the module's end). "Fade"/"Move" are actually animated by the player (see
 * animateTransition in player.runtime.js); the duration field below only applies to those two,
 * so it's hidden for "none", which always cuts instantly regardless of any duration stored on it.
 */
export function TransitionPanel({ page }: { page: Page }) {
  const { type, durationMs } = page.transition;

  return (
    <Collapsible title="Übergang zur nächsten Folie">
      <p className="weft-hint">
        Legt fest, wie diese Folie beim Weiterblättern verschwindet - zur nächsten Folie, in einen Logikblock oder zum
        Ende des Lernmoduls.
      </p>
      {TRANSITION_TYPES.map((t) => (
        <label key={t} className="weft-field weft-field-inline">
          <input
            type="radio"
            name="weft-transition-type"
            checked={type === t}
            onChange={() => setPageTransition(page.id, t)}
          />
          <span>{TRANSITION_LABELS[t]}</span>
        </label>
      ))}
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
              setPageTransitionDuration(page.id, Math.round(seconds * 1000));
            }}
          />
        </label>
      )}
    </Collapsible>
  );
}
