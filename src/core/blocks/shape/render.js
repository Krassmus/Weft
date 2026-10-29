// How a ShapeBlock (core/types.ts) is drawn - for the player, the editor's canvas, the thumbnails and the PDF alike: a rectangle, an ellipse, a regular
// polygon or a star, with a fill (nothing, a colour or a gradient), an outline and a shadow. One function, told where it draws. Plain JavaScript without
// imports: this file is inlined verbatim (its "export" taken away) into the exported page ahead of the player (core/runtime/buildRuntimeHtml.ts) and
// imported as a module by the editor (render.d.ts).
//
//   renderShape(root, props, ctx) draws into `root` (an empty element that has the block's size) and returns { update(props), destroy() }.
//
//   props   { block, slideAspect } - the shape (id, shapeKind, cornerRadii, sides, starPoints, starInnerRadius, fill, stroke, shadow, position) and the slide's
//           width : height (the block's own width and height are percent of the slide's, which are different lengths unless the slide is square).
//   ctx     { mode, pxPerCqw, bleedCqw } - `mode` is "play" | "edit" | "thumbnail" | "print": a shape is only a picture in all of them. `pxPerCqw`, where
//           the picture is drawn on its own (the PDF), where a "cqw" has no container to refer to and a CSS `filter` is not honoured by the tool that draws it:
//           lengths are written in px then (this many per cqw) and the shadow is an SVG filter - which needs room around the shape: `bleedCqw` is how far the
//           (larger) box that it is drawn into reaches past the block's own on each side.
//
// What is drawn is always a fixed 0-100 viewBox stretched with preserveAspectRatio="none" to fill the block's box: a polygon or a star distorts with it
// (exactly like a shape of PowerPoint or Keynote that is resized without holding the proportion), a rounded corner does not (see shapeRoundedRectPath).
// The element it is drawn into must not clip: a shadow reaches past the shape's own box (the block's own overflow is visible).
//
// The blur of what is behind a shape (`blurBehind`) is not drawn here: it is the block's own CSS (the player) or a pane of glass under it (the editor, the
// PDF, where the backdrop is a picture) - see core/document/backdropBlur.ts.

// Degrees, clockwise from straight up (matching a clock face) - not from the positive x axis (the usual math convention), so the first point of an n-gon or
// a star always lands at the top, as they are conventionally drawn (a 5-pointed star has one point up).
function shapePointOnCircle(angleDeg, radius) {
  var rad = (angleDeg * Math.PI) / 180;
  return [50 + radius * Math.sin(rad), 50 - radius * Math.cos(rad)];
}

export function shapePolygonPoints(sides) {
  var n = Math.max(3, Math.round(sides));
  var points = [];
  for (var i = 0; i < n; i++) points.push(shapePointOnCircle((360 / n) * i, 50));
  return points;
}

// `innerRadiusPercent` (0-100) is ShapeBlock.starInnerRadius: the percent of the outer radius (50) the inner vertices sit at.
export function shapeStarPoints(points, innerRadiusPercent) {
  var n = Math.max(3, Math.round(points));
  var innerRadius = (50 * Math.max(0, Math.min(100, innerRadiusPercent))) / 100;
  var result = [];
  for (var i = 0; i < n * 2; i++) {
    result.push(shapePointOnCircle((360 / (n * 2)) * i, i % 2 === 0 ? 50 : innerRadius));
  }
  return result;
}

function shapePointsAttr(points) {
  return points
    .map(function (p) {
      return p[0] + "," + p[1];
    })
    .join(" ");
}

// Corrects one corner's radius (0-50, percent of the block's own shorter *true* side - see ShapeCornerRadii in core/types.ts) into the (rx, ry) pair the
// 0-100 square needs so that, once stretched by `boxAspect` (the block's true on-slide width : height) to the block's actual shape, the corner traces a
// true circular arc rather than an elliptical one. Whichever axis is already the shorter *true* side keeps the corner's full radius; the other is scaled
// down by boxAspect (or its reciprocal) so both axes trace the same real-world distance from the corner.
function shapeCornerRadius(radius, boxAspect) {
  var r = Math.min(50, Math.max(0, radius));
  return boxAspect <= 1 ? [r, r * boxAspect] : [r / boxAspect, r];
}

// An SVG path for a rectangle (filling the 0-100 square) with one independently corrected radius per corner. Radii aren't clamped against each other (two
// 50s on the same edge exactly meet, which is how a pill is made).
export function shapeRoundedRectPath(radii, boxAspect) {
  var tl = shapeCornerRadius(radii.topLeft, boxAspect);
  var tr = shapeCornerRadius(radii.topRight, boxAspect);
  var br = shapeCornerRadius(radii.bottomRight, boxAspect);
  var bl = shapeCornerRadius(radii.bottomLeft, boxAspect);
  return (
    "M " + tl[0] + " 0 " +
    "L " + (100 - tr[0]) + " 0 " +
    "A " + tr[0] + " " + tr[1] + " 0 0 1 100 " + tr[1] + " " +
    "L 100 " + (100 - br[1]) + " " +
    "A " + br[0] + " " + br[1] + " 0 0 1 " + (100 - br[0]) + " 100 " +
    "L " + bl[0] + " 100 " +
    "A " + bl[0] + " " + bl[1] + " 0 0 1 0 " + (100 - bl[1]) + " " +
    "L 0 " + tl[1] + " " +
    "A " + tl[0] + " " + tl[1] + " 0 0 1 " + tl[0] + " 0 " +
    "Z"
  );
}

function shapeRgba(hex, opacity) {
  var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  return "rgba(" + parseInt(m[1], 16) + ", " + parseInt(m[2], 16) + ", " + parseInt(m[3], 16) + ", " + opacity + ")";
}

// One id per block, not per drawing: a gradient fill refers to it by `url(#...)`.
export function shapeGradientId(blockId) {
  return "weft-shape-fill-" + blockId;
}

// "dashed" and "dotted" are expressed relative to the stroke's own width (cqw) rather than as a fixed length, so a thicker stroke gets proportionally longer
// dashes and gaps - like a dash pattern of PowerPoint scales with the line weight. `length(cqw)` writes a length.
function shapeDashStyle(style, widthCqw, length) {
  if (style === "dashed") return "stroke-dasharray:" + length(widthCqw * 2.5) + " " + length(widthCqw * 1.5) + ";stroke-linecap:butt;";
  if (style === "dotted") return "stroke-dasharray:" + length(0.01) + " " + length(widthCqw * 2) + ";stroke-linecap:round;";
  return "";
}

// The shape as the markup of an SVG (see the header for `slideAspect`, `pxPerCqw`, `bleedCqw`).
export function shapeSvgMarkup(block, slideAspect, pxPerCqw, bleedCqw) {
  var fill = block.fill;
  var stroke = block.stroke;
  var shadow = block.shadow;
  var gradientId = shapeGradientId(block.id);
  var length = function (cqw) {
    return pxPerCqw ? Math.round(cqw * pxPerCqw * 1000) / 1000 + "px" : cqw + "cqw";
  };
  // (Drawn on its own the shadow is an SVG filter, which needs room around the shape.)
  var svgShadow = !!pxPerCqw && shadow.enabled;
  var shadowFilterId = "weft-shape-shadow-" + block.id;
  var widthCqw = block.position.width;
  var heightCqw = block.position.height / slideAspect;
  var unitsX = function (cqw) {
    return (cqw * 100) / Math.max(widthCqw, 0.01);
  };
  var unitsY = function (cqw) {
    return (cqw * 100) / Math.max(heightCqw, 0.01);
  };

  var fillValue = fill.type === "none" ? "none" : fill.type === "gradient" ? "url(#" + gradientId + ")" : fill.color;
  var fillOpacityAttr = fill.type === "solid" ? ' fill-opacity="' + fill.opacity + '"' : "";

  var strokeAttrs = "";
  if (stroke.enabled) {
    // vector-effect keeps the stroke's own weight tied to the slide's cqw instead of the shape's 0-100 viewBox, which would make it thicker or thinner (and,
    // on a box that is not square, thicker on one axis) purely from resizing the shape.
    strokeAttrs =
      ' stroke="' + stroke.color + '" stroke-opacity="' + stroke.opacity + '" style="stroke-width:' + length(stroke.width) + ";vector-effect:non-scaling-stroke;" +
      shapeDashStyle(stroke.style, stroke.width, length) + '"';
  }
  var shapeAttrs = ' fill="' + fillValue + '"' + fillOpacityAttr + strokeAttrs + (svgShadow ? ' filter="url(#' + shadowFilterId + ')"' : "") + "/>";

  var shapeMarkup;
  if (block.shapeKind === "rectangle") {
    // The block's own TRUE on-slide width:height ratio: a rounded corner needs it to stay circular instead of turning elliptical.
    var boxAspect = block.position.height > 0 ? (block.position.width / block.position.height) * slideAspect : 1;
    shapeMarkup = '<path d="' + shapeRoundedRectPath(block.cornerRadii, boxAspect) + '"' + shapeAttrs;
  } else if (block.shapeKind === "ellipse") {
    shapeMarkup = '<ellipse cx="50" cy="50" rx="50" ry="50"' + shapeAttrs;
  } else if (block.shapeKind === "polygon") {
    shapeMarkup = '<polygon points="' + shapePointsAttr(shapePolygonPoints(block.sides)) + '"' + shapeAttrs;
  } else {
    shapeMarkup = '<polygon points="' + shapePointsAttr(shapeStarPoints(block.starPoints, block.starInnerRadius)) + '"' + shapeAttrs;
  }

  var defsMarkup = "";
  if (fill.type === "gradient" || svgShadow) {
    defsMarkup = "<defs>";
    if (fill.type === "gradient") {
      var stops = fill.gradient.stops
        .map(function (s) {
          return '<stop offset="' + s.offset + '%" stop-color="' + s.color + '" stop-opacity="' + s.opacity + '"/>';
        })
        .join("");
      // (A linear gradient is turned around the shape's own centre: the default gradientUnits is a 0-1 space.)
      defsMarkup +=
        fill.gradient.kind === "radial"
          ? '<radialGradient id="' + gradientId + '" cx="50%" cy="50%" r="50%">' + stops + "</radialGradient>"
          : '<linearGradient id="' + gradientId + '" x1="0%" y1="0%" x2="100%" y2="0%" gradientTransform="rotate(' + fill.gradient.angle + ' 0.5 0.5)">' + stops + "</linearGradient>";
    }
    if (svgShadow) {
      defsMarkup +=
        '<filter id="' + shadowFilterId + '" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">' +
        '<feDropShadow dx="' + unitsX(shadow.offsetX) + '" dy="' + unitsY(shadow.offsetY) + '" stdDeviation="' + unitsX(shadow.blur / 2) + " " + unitsY(shadow.blur / 2) +
        '" flood-color="' + shadow.color + '" flood-opacity="' + shadow.opacity + '"/></filter>';
    }
    defsMarkup += "</defs>";
  }

  var filterStyle = shadow.enabled && !svgShadow ? "filter:drop-shadow(" + shadow.offsetX + "cqw " + shadow.offsetY + "cqw " + shadow.blur + "cqw " + shapeRgba(shadow.color, shadow.opacity) + ");" : "";
  // With room around the shape (the shadow's) the viewBox reaches past 0-100 by that much on each side.
  var bleedX = svgShadow ? unitsX(bleedCqw || 0) : 0;
  var bleedY = svgShadow ? unitsY(bleedCqw || 0) : 0;
  var viewBox = svgShadow ? -bleedX + " " + -bleedY + " " + (100 + 2 * bleedX) + " " + (100 + 2 * bleedY) : "0 0 100 100";
  return (
    '<svg viewBox="' + viewBox + '" preserveAspectRatio="none" aria-hidden="true" style="width:100%;height:100%;display:block;overflow:visible;' + filterStyle + '">' +
    defsMarkup + shapeMarkup + "</svg>"
  );
}

export function renderShape(root, props, ctx) {
  function draw(data) {
    root.innerHTML = shapeSvgMarkup(data.block, data.slideAspect, ctx.pxPerCqw, ctx.bleedCqw);
  }
  draw(props);
  return {
    update: draw,
    destroy: function () {
      root.innerHTML = "";
    },
  };
}
