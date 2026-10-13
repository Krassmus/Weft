/**
 * A number with "−" / "+" and a slider, for the tablet (see SecondsControl, which is the same for times). `value` may be outside
 * [min, max] if it was typed - the slider then stands at its end - but not below `min`.
 */
export function StepperSlider({
  value,
  onChange,
  min,
  max,
  step,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  /** For assistive technology: what the number is. */
  label: string;
}) {
  // Rounded to the step: 0.1 + 0.2 is not 0.3.
  const set = (next: number) => onChange(Math.max(min, Math.round(next / step) * step));
  return (
    <span className="weft-delay-control">
      <button type="button" className="weft-delay-step" aria-label={`${label} verringern`} disabled={value <= min} onClick={() => set(value - step)}>
        −
      </button>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => {
          const typed = Number(e.target.value);
          if (Number.isFinite(typed) && typed >= min) onChange(typed);
        }}
      />
      <button type="button" className="weft-delay-step" aria-label={`${label} erhöhen`} onClick={() => set(value + step)}>
        +
      </button>
      <input
        type="range"
        className="weft-delay-slider"
        min={min}
        max={max}
        step={step}
        value={Math.min(Math.max(value, min), max)}
        aria-label={`${label} einstellen`}
        onChange={(e) => set(Number(e.target.value))}
      />
    </span>
  );
}
