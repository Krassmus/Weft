import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

/**
 * A free colour picker as in Affinity and Photoshop: a ring for the hue and, inside it, a triangle - its corners are the pure hue, white and
 * black, so every other point is a mix of the three: saturation and brightness in one go. The triangle turns with the hue, the pure
 * hue's corner always on the ring where the hue is.
 *
 * `value` is "#rrggbb". `onLive` is told about every step of a drag (what is shown at once is this component's own), `onDone` when the
 * pointer is let go - what the owner makes of the steps (an edit of the module for each of them would be too much, see ColorField) is its
 * business.
 */
const SIZE = 196;
const RING = 20;
const OUTER = SIZE / 2 - 1;
const INNER = OUTER - RING;
/** The triangle's corners are this far from the middle. */
const TRIANGLE = INNER - 5;

interface Hsv {
  /** degrees, 0-360 */
  h: number;
  /** 0-1 */
  s: number;
  v: number;
}

function hsvToRgb({ h, s, v }: Hsv): [number, number, number] {
  const k = (n: number) => (n + h / 60) % 6;
  const f = (n: number) => v * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
  return [f(5), f(3), f(1)].map((x) => Math.round(x * 255)) as [number, number, number];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function hsvToHex(hsv: Hsv): string {
  return rgbToHex(hsvToRgb(hsv));
}

/** The hue is kept when the colour has none (grey, black, white). */
function hexToHsv(hex: string, previousHue: number): Hsv {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return { h: previousHue, s: 0, v: 0 };
  const [r, g, b] = match.slice(1).map((part) => parseInt(part, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = previousHue;
  if (d > 0) {
    if (max === r) h = 60 * (((g - b) / d + 6) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

type Point = { x: number; y: number };

/** The corners of the triangle for a hue: the pure colour, white, black - 120 degrees apart. */
function corners(hue: number): { hue: Point; white: Point; black: Point } {
  const at = (degrees: number): Point => {
    const radians = (degrees * Math.PI) / 180;
    return { x: SIZE / 2 + TRIANGLE * Math.cos(radians), y: SIZE / 2 + TRIANGLE * Math.sin(radians) };
  };
  return { hue: at(hue), white: at(hue + 120), black: at(hue + 240) };
}

/** The weights of the three corners for a point (they add up to 1; negative outside the triangle). */
function weights(p: Point, c: ReturnType<typeof corners>): [number, number, number] {
  const d = (c.white.y - c.black.y) * (c.hue.x - c.black.x) + (c.black.x - c.white.x) * (c.hue.y - c.black.y);
  const a = ((c.white.y - c.black.y) * (p.x - c.black.x) + (c.black.x - c.white.x) * (p.y - c.black.y)) / d;
  const b = ((c.black.y - c.hue.y) * (p.x - c.black.x) + (c.hue.x - c.black.x) * (p.y - c.black.y)) / d;
  return [a, b, 1 - a - b];
}

/** The point of the triangle nearest to `p` (inside it, `p` itself). */
function clampToTriangle(p: Point, c: ReturnType<typeof corners>): [number, number, number] {
  let [a, b, k] = weights(p, c);
  if (a >= 0 && b >= 0 && k >= 0) return [a, b, k];
  // Outside: the nearest point on the edge - the candidates are the projections on the three edges and the corners.
  const segments: [Point, Point, [number, number, number], [number, number, number]][] = [
    [c.hue, c.white, [1, 0, 0], [0, 1, 0]],
    [c.white, c.black, [0, 1, 0], [0, 0, 1]],
    [c.black, c.hue, [0, 0, 1], [1, 0, 0]],
  ];
  let best: [number, number, number] = [1, 0, 0];
  let bestDistance = Infinity;
  for (const [from, to, weightFrom, weightTo] of segments) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const t = Math.max(0, Math.min(1, ((p.x - from.x) * dx + (p.y - from.y) * dy) / (dx * dx + dy * dy)));
    const distance = Math.hypot(from.x + dx * t - p.x, from.y + dy * t - p.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = [weightFrom[0] * (1 - t) + weightTo[0] * t, weightFrom[1] * (1 - t) + weightTo[1] * t, weightFrom[2] * (1 - t) + weightTo[2] * t];
    }
  }
  [a, b, k] = best;
  return [a, b, k];
}

export function ColorWheel({ value, onLive, onDone }: { value: string; onLive: (hex: string) => void; onDone: () => void }) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value, 0));
  const triangleRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<"hue" | "triangle" | null>(null);
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  // The colour was set from outside (a swatch, the hex field, the eyedropper): the wheel follows - unless it is what set it.
  useEffect(() => {
    if (hsvToHex(hsvRef.current).toLowerCase() !== value.toLowerCase()) setHsv(hexToHsv(value, hsvRef.current.h));
  }, [value]);

  // The triangle is drawn pixel by pixel, again whenever the hue changes.
  useEffect(() => {
    const canvas = triangleRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const scale = window.devicePixelRatio || 1;
    const size = Math.round(SIZE * scale);
    canvas.width = size;
    canvas.height = size;
    const image = context.createImageData(size, size);
    const c = corners(hsv.h);
    const hueRgb = hsvToRgb({ h: hsv.h, s: 1, v: 1 });
    const edge = TRIANGLE * Math.sqrt(3);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const [a, b, k] = weights({ x: (x + 0.5) / scale, y: (y + 0.5) / scale }, c);
        // (A soft edge: how far inside - in pixels - the point is.)
        const inside = Math.min(a, b, k) * edge * 0.5 * scale + 0.5;
        if (inside <= 0) continue;
        const i = (y * size + x) * 4;
        image.data[i] = a * hueRgb[0] + b * 255;
        image.data[i + 1] = a * hueRgb[1] + b * 255;
        image.data[i + 2] = a * hueRgb[2] + b * 255;
        image.data[i + 3] = Math.min(1, inside) * 255;
      }
    }
    context.putImageData(image, 0, 0);
  }, [hsv.h]);

  function pointOf(e: ReactPointerEvent): Point {
    const rect = boxRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * SIZE, y: ((e.clientY - rect.top) / rect.height) * SIZE };
  }

  function apply(next: Hsv) {
    setHsv(next);
    onLive(hsvToHex(next));
  }

  function drag(e: ReactPointerEvent) {
    const p = pointOf(e);
    if (modeRef.current === "hue") {
      const degrees = (Math.atan2(p.y - SIZE / 2, p.x - SIZE / 2) * 180) / Math.PI;
      apply({ ...hsvRef.current, h: (degrees + 360) % 360 });
    } else if (modeRef.current === "triangle") {
      const [a, b] = clampToTriangle(p, corners(hsvRef.current.h));
      const v = a + b;
      apply({ ...hsvRef.current, s: v > 0 ? a / v : 0, v: Math.min(1, Math.max(0, v)) });
    }
  }

  function down(e: ReactPointerEvent) {
    if (e.button !== 0) return;
    const p = pointOf(e);
    const distance = Math.hypot(p.x - SIZE / 2, p.y - SIZE / 2);
    if (distance >= INNER - 1 && distance <= OUTER + 2) modeRef.current = "hue";
    else if (distance < INNER - 1) modeRef.current = "triangle";
    else return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag(e);
  }

  function up(e: ReactPointerEvent) {
    if (!modeRef.current) return;
    modeRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // not captured any more
    }
    onDone();
  }

  const c = corners(hsv.h);
  const a = hsv.s * hsv.v;
  const b = hsv.v * (1 - hsv.s);
  const k = 1 - hsv.v;
  const handle: Point = {
    x: a * c.hue.x + b * c.white.x + k * c.black.x,
    y: a * c.hue.y + b * c.white.y + k * c.black.y,
  };
  const ringRadius = (INNER + OUTER) / 2;
  const hueRadians = (hsv.h * Math.PI) / 180;
  const ringHandle: Point = { x: SIZE / 2 + ringRadius * Math.cos(hueRadians), y: SIZE / 2 + ringRadius * Math.sin(hueRadians) };

  return (
    <div
      ref={boxRef}
      className="weft-color-wheel"
      style={{ width: SIZE, height: SIZE }}
      onPointerDown={down}
      onPointerMove={(e) => modeRef.current && drag(e)}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <div className="weft-color-wheel-ring" style={{ ["--ring" as string]: `${INNER}px` }} />
      <canvas ref={triangleRef} className="weft-color-wheel-triangle" style={{ width: SIZE, height: SIZE }} />
      <span className="weft-color-wheel-handle" style={{ left: ringHandle.x, top: ringHandle.y, background: hsvToHex({ h: hsv.h, s: 1, v: 1 }) }} />
      <span className="weft-color-wheel-handle" style={{ left: handle.x, top: handle.y, background: hsvToHex(hsv) }} />
    </div>
  );
}
