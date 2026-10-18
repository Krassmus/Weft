import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addPaletteColor } from "../../core/document/actions";
import { useDocumentStore } from "../../core/document/store";
import { pickScreenColor, screenColorRoute } from "../../core/colors/screenColor";
import type { ScreenColorRoute } from "../../core/colors/screenColor";
import { tr } from "../../core/i18n/tr";
import { ColorWheel } from "./ColorWheel";

/** "#rrggbb" from what was typed: with or without the "#", three or six digits - or null. */
function parseHex(text: string): string | null {
  const digits = text.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(digits)) return "#" + digits.replace(/./g, (c) => c + c);
  if (/^[0-9a-f]{6}$/.test(digits)) return "#" + digits;
  return null;
}

/** At most this often a colour dragged in the system's picker becomes an edit. */
const NATIVE_INTERVAL_MS = 150;
const POPOVER_WIDTH = 224;
const GAP = 6;
const MARGIN = 8;

/**
 * The colour picker of every colour in Weft (it replaces the browsers' own `<input type="color">`): a swatch that opens a small
 * panel with
 *  - the module's colour scheme (WeftModule.colorPalette, managed in the module's settings): a click on one is the colour,
 *  - "Add to color scheme" for the colour that is set now,
 *  - the eyedropper - a colour from anywhere on the screen, with the system's magnifier (see core/colors/screenColor.ts) -
 *    where the platform has one,
 *  - "Other color…": the system's full picker, as before.
 * `value` is always "#rrggbb". The panel never takes the focus away from what the person is editing (a text selection stays
 * a selection), same as the format bar's other controls.
 */
export function ColorField({
  value,
  onChange,
  title,
  ariaLabel,
  hideScheme = false,
}: {
  value: string;
  onChange: (color: string) => void;
  title?: string;
  ariaLabel?: string;
  /** Without the colour scheme (and "Add to color scheme"): for the one place that edits the scheme itself. */
  hideScheme?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [route, setRoute] = useState<ScreenColorRoute>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const palette = useDocumentStore((s) => s.doc.content.colorPalette) ?? [];
  const hex = value.toLowerCase();
  // What is typed in the hex field while it is being typed (null: it shows the colour as it is).
  const [draft, setDraft] = useState<string | null>(null);
  const inPalette = palette.some((c) => c.color.toLowerCase() === hex);

  // The colour wheel reports every step of a drag - dozens a second, and each of them would be an edit of the whole module. What the
  // person sees at once is the wheel's own (`nativeShown`); the module gets at most one colour per NATIVE_INTERVAL_MS, and the last
  // one when the pointer is let go.
  const [nativeShown, setNativeShown] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const sentAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  function flushNative() {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    const color = pendingRef.current;
    pendingRef.current = null;
    if (color !== null) {
      sentAtRef.current = performance.now();
      onChangeRef.current(color);
    }
  }

  function pushNative(color: string) {
    setNativeShown(color);
    pendingRef.current = color;
    if (timerRef.current === null) {
      timerRef.current = setTimeout(flushNative, Math.max(0, NATIVE_INTERVAL_MS - (performance.now() - sentAtRef.current)));
    }
  }

  useEffect(() => () => flushNative(), []);

  useEffect(() => {
    if (!open) setDraft(null);
  }, [open]);

  useEffect(() => {
    let alive = true;
    void screenColorRoute().then((r) => alive && setRoute(r));
    return () => {
      alive = false;
    };
  }, []);

  // Below the swatch, or above it when there is no room, and never out of the window.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !popoverRef.current) return;
    const anchor = buttonRef.current.getBoundingClientRect();
    const height = popoverRef.current.offsetHeight;
    const left = Math.max(MARGIN, Math.min(anchor.left, window.innerWidth - POPOVER_WIDTH - MARGIN));
    const below = anchor.bottom + GAP;
    const above = anchor.top - GAP - height;
    // Below the swatch if it fits, else above, else (a tall panel in a low window) as far down as the window allows.
    const top =
      below + height + MARGIN <= window.innerHeight ? below : above >= MARGIN ? above : Math.max(MARGIN, window.innerHeight - height - MARGIN);
    setPosition({ left, top });
  }, [open, palette.length]);

  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("keydown", key);
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  /** Takes what is in the hex field as the colour - or, if it is no colour, goes back to showing the current one. */
  function commitDraft() {
    const parsed = draft === null ? null : parseHex(draft);
    if (parsed && parsed !== hex) onChange(parsed);
    setDraft(null);
    if (parsed) setOpen(false);
  }

  async function eyedrop() {
    const picked = await pickScreenColor();
    if (picked) {
      onChange(picked);
      setOpen(false);
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="weft-color-swatch"
        title={title ?? ariaLabel ?? tr("ui.choose_colour")}
        aria-label={ariaLabel ?? title ?? tr("ui.choose_colour")}
        aria-expanded={open}
        style={{ ["--swatch" as string]: value }}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setPosition(null);
          setOpen((o) => !o);
        }}
      />
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="weft-color-popover"
            // (Not for the row or window it was opened from: a press in here is not a press on them - e.g. the start of a drag.)
            onPointerDown={(e) => e.stopPropagation()}
            style={{ left: position?.left ?? 0, top: position?.top ?? 0, width: POPOVER_WIDTH, visibility: position ? "visible" : "hidden" }}
            // A click on a button here must not take the focus from the text being edited; the system's picker needs its own.
            onMouseDown={(e) => {
              if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
            }}
          >
            {!hideScheme && <span className="weft-color-popover-label">{tr("ui.colour_scheme")}</span>}
            {hideScheme ? null : palette.length === 0 ? (
              <p className="weft-hint">{tr("ui.colour_scheme_empty")}</p>
            ) : (
              <div className="weft-color-grid">
                {palette.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={"weft-color-cell" + (entry.color.toLowerCase() === hex ? " is-current" : "")}
                    style={{ ["--swatch" as string]: entry.color }}
                    title={entry.color}
                    aria-label={entry.color}
                    onClick={() => {
                      onChange(entry.color);
                      setOpen(false);
                    }}
                  />
                ))}
              </div>
            )}
            <ColorWheel
              value={nativeShown ?? value}
              onLive={pushNative}
              onDone={() => {
                flushNative();
                setNativeShown(null);
              }}
            />
            <div className="weft-color-row">
              <span className="weft-color-preview" style={{ ["--swatch" as string]: nativeShown ?? value }} aria-hidden="true" />
              {route && (
                <button type="button" className="weft-ghost-button weft-color-eyedropper" title={tr("ui.pick_colour_from_screen")} aria-label={tr("ui.pick_colour_from_screen")} onClick={() => void eyedrop()}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m2 22 1-1h3l9-9" />
                    <path d="M3 21v-3l9-9" />
                    <path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" />
                  </svg>
                </button>
              )}
              <input
                className="weft-color-hex"
                type="text"
                spellCheck={false}
                autoComplete="off"
                maxLength={7}
                placeholder="#rrggbb"
                aria-label={tr("ui.hex_colour_value")}
                title={tr("ui.hex_colour_value")}
                value={draft ?? (nativeShown ?? hex)}
                onChange={(e) => {
                  setDraft(e.target.value);
                  // A complete value counts right away (shorthand like "abc" only when the field is left: "abcdef" may follow).
                  const digits = e.target.value.trim().replace(/^#/, "");
                  const parsed = digits.length === 6 ? parseHex(e.target.value) : null;
                  if (parsed) {
                    if (parsed !== hex) onChange(parsed);
                    setOpen(false);
                  }
                }}
                onBlur={commitDraft}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitDraft();
                  }
                }}
              />
            </div>
            {!hideScheme && (
              <button
                type="button"
                className="weft-ghost-button weft-full-width"
                disabled={inPalette}
                title={inPalette ? tr("ui.already_in_colour_scheme") : undefined}
                onClick={() => addPaletteColor(value)}
              >
                {tr("ui.add_to_colour_scheme")}
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
