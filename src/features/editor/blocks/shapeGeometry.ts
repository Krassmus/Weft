/**
 * Point/path math for ShapeBlock's kinds - shared by ShapeSvg.tsx (the editor canvas and
 * SlideThumbnail.tsx both render through it) and hand-duplicated in player.runtime.js (which
 * can't import from here, see that file's own header comment for why).
 *
 * Every shape is built in one fixed 0-100 unit square, centered on (50,50) with an outer radius
 * of 50 (so it just touches the square's own edges) - the SVG viewBox this draws into always
 * stretches non-uniformly to fill the block's actual on-slide width/height (see ShapeSvg.tsx's
 * preserveAspectRatio="none"), exactly like a PowerPoint/Keynote shape distorts when resized
 * without holding a proportion-lock key. A polygon/star's own points don't need to know or care
 * about that stretch - distorting along with it is exactly the intended look. A rounded
 * rectangle's corners are the one exception (see roundedRectPath): a plain radius in this same
 * 0-100 space would distort into an ellipse right along with everything else, which is NOT the
 * intended look for a rounded corner, so it takes the block's own true aspect ratio as a
 * parameter specifically to correct for that.
 */

/** Degrees, clockwise from straight up (matching a clock face) - not from the positive x axis
 * (the usual math convention), so the first point of an n-gon/star always lands at the top,
 * matching how these shapes are conventionally drawn (e.g. a 5-pointed star has one point up). */
function pointOnCircle(angleDeg: number, radius: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [50 + radius * Math.sin(rad), 50 - radius * Math.cos(rad)];
}

export function regularPolygonPoints(sides: number): [number, number][] {
  const n = Math.max(3, Math.round(sides));
  const points: [number, number][] = [];
  for (let i = 0; i < n; i++) points.push(pointOnCircle((360 / n) * i, 50));
  return points;
}

/** `innerRadiusPercent` (0-100) is ShapeBlock.starInnerRadius - percent of the outer radius (50)
 * the star's inner vertices sit at. */
export function starOutlinePoints(points: number, innerRadiusPercent: number): [number, number][] {
  const n = Math.max(3, Math.round(points));
  const innerRadius = (50 * Math.max(0, Math.min(100, innerRadiusPercent))) / 100;
  const result: [number, number][] = [];
  for (let i = 0; i < n * 2; i++) {
    result.push(pointOnCircle((360 / (n * 2)) * i, i % 2 === 0 ? 50 : innerRadius));
  }
  return result;
}

export function pointsAttr(points: [number, number][]): string {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

/** Corrects one corner's radius (0-50, percent of the block's own shorter *true* side - see
 * ShapeCornerRadii's own doc comment in core/types.ts) into the (rx, ry) pair this 0-100 square
 * needs so that, once stretched by `boxAspect` (the block's true on-slide width/height ratio,
 * width:height - see ShapeSvg.tsx) to the block's actual shape, the corner traces a true circular
 * arc rather than an elliptical one. A plain SVG rx/ry on a <rect> can't do this on its own -
 * it's defined in this same 0-100 space, so it stretches right along with everything else and
 * still comes out elliptical on a non-square block. Whichever axis is already the shorter *true*
 * side keeps the corner's full radius; the other is scaled down by boxAspect (or its reciprocal)
 * so both axes trace the same real-world distance from the corner. */
function correctedCornerRadius(radius: number, boxAspect: number): [number, number] {
  const r = Math.min(50, Math.max(0, radius));
  return boxAspect <= 1 ? [r, r * boxAspect] : [r / boxAspect, r];
}

/** An SVG path `d` string for a rectangle (filling the same 0-100 square every shape is drawn in)
 * with one independently-corrected radius per corner - see correctedCornerRadius and
 * ShapeCornerRadii's own doc comment in core/types.ts. Radii aren't clamped against each other
 * (e.g. two 50s on the same edge exactly meet, which is intentional - that's how a pill shape is
 * made - but two *unequal* large radii on the same edge could in principle overlap; left
 * unclamped like PowerPoint/Keynote's own rounded rectangle, which has the same limitation). */
export function roundedRectPath(radii: { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number }, boxAspect: number): string {
  const [tlX, tlY] = correctedCornerRadius(radii.topLeft, boxAspect);
  const [trX, trY] = correctedCornerRadius(radii.topRight, boxAspect);
  const [brX, brY] = correctedCornerRadius(radii.bottomRight, boxAspect);
  const [blX, blY] = correctedCornerRadius(radii.bottomLeft, boxAspect);
  return (
    `M ${tlX} 0 ` +
    `L ${100 - trX} 0 ` +
    `A ${trX} ${trY} 0 0 1 100 ${trY} ` +
    `L 100 ${100 - brY} ` +
    `A ${brX} ${brY} 0 0 1 ${100 - brX} 100 ` +
    `L ${blX} 100 ` +
    `A ${blX} ${blY} 0 0 1 0 ${100 - blY} ` +
    `L 0 ${tlY} ` +
    `A ${tlX} ${tlY} 0 0 1 ${tlX} 0 ` +
    "Z"
  );
}
