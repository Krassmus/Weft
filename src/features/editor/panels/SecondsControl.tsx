/** The longest value the slider of a SecondsControl reaches (seconds); longer ones can be typed. */
const SLIDER_MAX_SECONDS = 2;

/**
 * A time in seconds, for the delay of a trigger and the duration of an animation: the number (any value, typed), "−" / "+" that change
 * it by 0,1 s and a small slider from the smallest value to 2 s - for the iPad, where typing a number is the slow way. A longer time
 * than the slider reaches is shown with the slider at its end. `minMs` is the smallest value (0 for a delay, which may be none; a
 * duration is at least 0,1 s).
 */
export function SecondsControl({
  valueMs,
  onChange,
  minMs = 0,
  label,
}: {
  valueMs: number;
  onChange: (valueMs: number) => void;
  minMs?: number;
  /** For assistive technology: what the number is. */
  label: string;
}) {
  const seconds = valueMs / 1000;
  // Tenths of a second: 0.1 + 0.2 is not 0.3.
  const setSeconds = (value: number) => onChange(Math.max(minMs, Math.round(value * 10) * 100));
  return (
    <span className="weft-delay-control">
      <button type="button" className="weft-delay-step" aria-label="0,1 Sekunden weniger" disabled={valueMs <= minMs} onClick={() => setSeconds(seconds - 0.1)}>
        −
      </button>
      <input
        type="number"
        min={minMs / 1000}
        step={0.1}
        value={seconds}
        aria-label={label}
        onChange={(e) => {
          const value = Number(e.target.value);
          if (Number.isFinite(value) && (minMs === 0 ? value >= 0 : value > 0)) onChange(Math.round(value * 1000));
        }}
      />
      <button type="button" className="weft-delay-step" aria-label="0,1 Sekunden mehr" onClick={() => setSeconds(seconds + 0.1)}>
        +
      </button>
      <input
        type="range"
        className="weft-delay-slider"
        min={minMs / 1000}
        max={SLIDER_MAX_SECONDS}
        step={0.1}
        value={Math.min(Math.max(seconds, minMs / 1000), SLIDER_MAX_SECONDS)}
        aria-label={`${label} einstellen`}
        onChange={(e) => setSeconds(Number(e.target.value))}
      />
    </span>
  );
}
