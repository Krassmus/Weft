// The drawing of an ArrowBlock (core/types.ts): a line through any number of waypoints, smoothed into one
// curve, with an arrowhead at either end, in one of three styles ("plain", "sketch" = hand-drawn, "ornate" =
// Art Nouveau).
//
// ONE source for the editor and the player: the editor imports it like any module (see arrowGeometry.d.ts);
// the exported player (which can't import anything, see player.runtime.js) gets this very file embedded -
// buildRuntimeHtml.ts strips the `export`s and wraps it. So: plain top-level function declarations only, no
// imports, no syntax newer than the player's own.
//
// Everything is worked out in a space that is as true to the slide as the block's own box: the box is 100
// units wide and 100 / boxAspect high (boxAspect = the box's real width : height on the slide), so a circle
// stays a circle and an arrowhead keeps its angles however the box is stretched; the SVG is then stretched to
// the box evenly. Line thickness arrives in cqw (percent of the slide's width, like every size in a module)
// and is converted: the box is `block.position.width` cqw wide.

function arrowNumber(value) {
  return (Math.round(value * 100) / 100).toString();
}

function arrowColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : "#18181b";
}

// A small seeded random generator (mulberry32): the hand-drawn wobble has to be the same in the editor, the
// preview and the export - and the same every time the slide is shown - so it comes from the block's id.
function arrowRandom(seedText) {
  var h = 1779033703;
  for (var i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  var a = h >>> 0;
  return function () {
    a = (a + 1831565813) >>> 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function arrowLength(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function arrowUnit(from, to) {
  var length = arrowLength(from, to);
  return length > 1e-9 ? { x: (to.x - from.x) / length, y: (to.y - from.y) / length } : { x: 1, y: 0 };
}

// The cubic Bezier segments of the curve through the waypoints: at each waypoint the curve runs in the
// direction from the waypoint before to the one after it, with handles of a third of the segment's own
// length - so it passes through every waypoint, turns smoothly there, and doesn't loop or overshoot where
// waypoints are spaced unevenly.
function arrowSegments(points) {
  var directions = points.map(function (point, i) {
    var before = points[i - 1] || point;
    var after = points[i + 1] || point;
    return arrowUnit(before, after);
  });
  var segments = [];
  for (var i = 0; i + 1 < points.length; i++) {
    var p0 = points[i];
    var p3 = points[i + 1];
    var reach = arrowLength(p0, p3) / 3;
    segments.push({
      p0: p0,
      p1: { x: p0.x + directions[i].x * reach, y: p0.y + directions[i].y * reach },
      p2: { x: p3.x - directions[i + 1].x * reach, y: p3.y - directions[i + 1].y * reach },
      p3: p3,
    });
  }
  return segments;
}

function arrowBezierAt(segment, t) {
  var u = 1 - t;
  var a = u * u * u;
  var b = 3 * u * u * t;
  var c = 3 * u * t * t;
  var d = t * t * t;
  return {
    x: a * segment.p0.x + b * segment.p1.x + c * segment.p2.x + d * segment.p3.x,
    y: a * segment.p0.y + b * segment.p1.y + c * segment.p2.y + d * segment.p3.y,
  };
}

// The curve as a dense polyline, with the distance from its start at every sample.
function arrowSample(points) {
  var samples = [];
  var segments = arrowSegments(points);
  for (var i = 0; i < segments.length; i++) {
    var steps = Math.max(8, Math.min(60, Math.round(arrowLength(points[i], points[i + 1]) / 1.5)));
    for (var step = i === 0 ? 0 : 1; step <= steps; step++) samples.push(arrowBezierAt(segments[i], step / steps));
  }
  var along = [0];
  for (var j = 1; j < samples.length; j++) along.push(along[j - 1] + arrowLength(samples[j - 1], samples[j]));
  return { samples: samples, along: along, total: along[along.length - 1] };
}

function arrowReverse(curve) {
  var samples = curve.samples.slice().reverse();
  var along = curve.along
    .map(function (distance) {
      return curve.total - distance;
    })
    .reverse();
  return { samples: samples, along: along, total: curve.total };
}

// The point `distance` along the curve.
function arrowPointAt(curve, distance) {
  if (distance <= 0) return curve.samples[0];
  if (distance >= curve.total) return curve.samples[curve.samples.length - 1];
  var i = 1;
  while (curve.along[i] < distance) i++;
  var span = curve.along[i] - curve.along[i - 1];
  var f = span > 0 ? (distance - curve.along[i - 1]) / span : 0;
  var a = curve.samples[i - 1];
  var b = curve.samples[i];
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

// The curve without its last `amount` (where a head sits).
function arrowTrimEnd(curve, amount) {
  var keep = Math.max(curve.total - amount, curve.total * 0.05);
  var end = arrowPointAt(curve, keep);
  var samples = [];
  var along = [];
  for (var i = 0; i < curve.samples.length && curve.along[i] < keep; i++) {
    samples.push(curve.samples[i]);
    along.push(curve.along[i]);
  }
  samples.push(end);
  along.push(keep);
  return { samples: samples, along: along, total: keep };
}

// The direction in which the curve arrives at its end (over the last `reach`, so a bend right at the end
// doesn't swing the head around), as a unit vector.
function arrowEndDirection(curve, reach) {
  var tip = curve.samples[curve.samples.length - 1];
  return arrowUnit(arrowPointAt(curve, curve.total - Math.min(reach, curve.total * 0.9)), tip);
}

function arrowPathOf(samples) {
  return "M" + samples.map(function (p) {
    return arrowNumber(p.x) + " " + arrowNumber(p.y);
  }).join("L");
}

function arrowRotate(vector, angle) {
  var c = Math.cos(angle);
  var s = Math.sin(angle);
  return { x: vector.x * c - vector.y * s, y: vector.x * s + vector.y * c };
}

// ---- plain -----------------------------------------------------------------------------------------------

function arrowPlain(stem, heads, w, color) {
  var out = '<path d="' + arrowPathOf(stem.samples) + '" fill="none" stroke="' + color + '" stroke-width="' + arrowNumber(w) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  heads.forEach(function (head) {
    var length = 4.5 * w;
    var half = 2.2 * w;
    var normal = { x: -head.direction.y, y: head.direction.x };
    var base = { x: head.tip.x - head.direction.x * length, y: head.tip.y - head.direction.y * length };
    out +=
      '<path d="M' + arrowNumber(head.tip.x) + " " + arrowNumber(head.tip.y) +
      "L" + arrowNumber(base.x + normal.x * half) + " " + arrowNumber(base.y + normal.y * half) +
      "L" + arrowNumber(base.x - normal.x * half) + " " + arrowNumber(base.y - normal.y * half) +
      'Z" fill="' + color + '" stroke="' + color + '" stroke-width="' + arrowNumber(w * 0.3) + '" stroke-linejoin="round"/>';
  });
  return out;
}

// ---- sketch (hand-drawn) -----------------------------------------------------------------------------------

// The curve, re-sampled evenly and pushed sideways by a slow random wobble; drawn through its points with
// quadratic curves, so it reads as one hand-drawn stroke and not a zigzag.
function arrowWobble(curve, spacing, amplitude, random) {
  var count = Math.max(2, Math.round(curve.total / spacing));
  var phase1 = random() * 6.28;
  var phase2 = random() * 6.28;
  var wave1 = spacing * (3.2 + random() * 2);
  var wave2 = spacing * (1.3 + random());
  var points = [];
  for (var i = 0; i <= count; i++) {
    var distance = (curve.total * i) / count;
    var here = arrowPointAt(curve, distance);
    var ahead = arrowPointAt(curve, Math.min(curve.total, distance + spacing * 0.5));
    var behind = arrowPointAt(curve, Math.max(0, distance - spacing * 0.5));
    var direction = arrowUnit(behind, ahead);
    var push = amplitude * (0.7 * Math.sin(distance / wave1 + phase1) + 0.3 * Math.sin(distance / wave2 + phase2));
    points.push({ x: here.x - direction.y * push, y: here.y + direction.x * push });
  }
  return points;
}

function arrowSmoothPath(points) {
  if (points.length < 3) return arrowPathOf(points);
  var d = "M" + arrowNumber(points[0].x) + " " + arrowNumber(points[0].y);
  for (var i = 1; i + 1 < points.length; i++) {
    var mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
    d += "Q" + arrowNumber(points[i].x) + " " + arrowNumber(points[i].y) + " " + arrowNumber(mid.x) + " " + arrowNumber(mid.y);
  }
  var last = points[points.length - 1];
  return d + "L" + arrowNumber(last.x) + " " + arrowNumber(last.y);
}

function arrowSketch(stem, heads, w, color, random) {
  var spacing = Math.max(w * 3, 1.5);
  var out = "";
  // Two passes of the pen, the second thinner and fainter and not quite on the first.
  out += '<path d="' + arrowSmoothPath(arrowWobble(stem, spacing, w * 0.7, random)) + '" fill="none" stroke="' + color + '" stroke-width="' + arrowNumber(w * (0.9 + random() * 0.2)) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  out += '<path d="' + arrowSmoothPath(arrowWobble(stem, spacing * 1.2, w * 0.8, random)) + '" fill="none" stroke="' + color + '" stroke-opacity="0.55" stroke-width="' + arrowNumber(w * 0.5) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  heads.forEach(function (head) {
    // An open V of two quick strokes that overshoot the tip a little.
    [-1, 1].forEach(function (side) {
      var angle = side * (0.45 + random() * 0.18);
      var arm = arrowRotate({ x: -head.direction.x, y: -head.direction.y }, angle);
      var reach = w * (4.6 + random() * 1.4);
      var start = { x: head.tip.x + head.direction.x * w * random() * 0.6, y: head.tip.y + head.direction.y * w * random() * 0.6 };
      var end = { x: start.x + arm.x * reach, y: start.y + arm.y * reach };
      var bend = (random() - 0.5) * w * 1.2;
      var control = { x: (start.x + end.x) / 2 - arm.y * bend, y: (start.y + end.y) / 2 + arm.x * bend };
      out += '<path d="M' + arrowNumber(start.x) + " " + arrowNumber(start.y) + "Q" + arrowNumber(control.x) + " " + arrowNumber(control.y) + " " + arrowNumber(end.x) + " " + arrowNumber(end.y) + '" fill="none" stroke="' + color + '" stroke-width="' + arrowNumber(w * (0.85 + random() * 0.25)) + '" stroke-linecap="round"/>';
    });
  });
  return out;
}

// ---- ornate (Art Nouveau) ----------------------------------------------------------------------------------

// A filled band along a curve whose thickness `thickness(t)` (t = 0..1 along it) varies: the calligraphic
// swell and taper of a whiplash line.
function arrowRibbon(curve, thickness) {
  var left = [];
  var right = [];
  for (var i = 0; i < curve.samples.length; i++) {
    var before = curve.samples[Math.max(0, i - 1)];
    var after = curve.samples[Math.min(curve.samples.length - 1, i + 1)];
    var direction = arrowUnit(before, after);
    var half = thickness(curve.total > 0 ? curve.along[i] / curve.total : 0) / 2;
    left.push({ x: curve.samples[i].x - direction.y * half, y: curve.samples[i].y + direction.x * half });
    right.push({ x: curve.samples[i].x + direction.y * half, y: curve.samples[i].y - direction.x * half });
  }
  return arrowPathOf(left.concat(right.reverse())) + "Z";
}

// A volute: a short spiral that leaves `from` along `direction`, curling to `side` (+1 or -1), tightening as
// it goes.
function arrowCurl(from, direction, side, w) {
  var start = 3.4 * w;
  var normal = { x: -direction.y * side, y: direction.x * side };
  var center = { x: from.x + normal.x * start, y: from.y + normal.y * start };
  var toStart = { x: -normal.x, y: -normal.y };
  var turns = 1.25;
  var samples = [];
  var along = [];
  for (var i = 0; i <= 40; i++) {
    var f = i / 40;
    var angle = f * turns * 6.2832;
    var radius = start * (1 - 0.82 * f);
    samples.push({
      x: center.x + radius * (toStart.x * Math.cos(angle) + direction.x * Math.sin(angle)),
      y: center.y + radius * (toStart.y * Math.cos(angle) + direction.y * Math.sin(angle)),
    });
    along.push(i === 0 ? 0 : along[i - 1] + arrowLength(samples[i - 1], samples[i]));
  }
  return { samples: samples, along: along, total: along[along.length - 1] };
}

// The head: a swallow-tailed leaf with curved sides, drawn in a frame where it points along +x with its tip
// at x = length.
function arrowOrnateHead(head, w, color) {
  var length = 7 * w;
  var half = 3.1 * w;
  var normal = { x: -head.direction.y, y: head.direction.x };
  function at(lx, ly) {
    return arrowNumber(head.tip.x + head.direction.x * (lx - length) + normal.x * ly) + " " + arrowNumber(head.tip.y + head.direction.y * (lx - length) + normal.y * ly);
  }
  return (
    '<path d="M' + at(length, 0) +
    "C" + at(length * 0.8, -half * 0.12) + " " + at(length * 0.5, -half * 1.0) + " " + at(length * 0.02, -half * 1.05) +
    "Q" + at(length * 0.36, -half * 0.3) + " " + at(length * 0.26, 0) +
    "Q" + at(length * 0.36, half * 0.3) + " " + at(length * 0.02, half * 1.05) +
    "C" + at(length * 0.5, half * 1.0) + " " + at(length * 0.8, half * 0.12) + " " + at(length, 0) +
    'Z" fill="' + color + '"/>'
  );
}

function arrowOrnate(curve, hasHead, w, color) {
  var out = "";
  var ends = [
    { at: 0, head: hasHead.start },
    { at: 1, head: hasHead.end },
  ];
  var stem = curve.stem;
  out += '<path d="' + arrowRibbon(stem, function (t) {
    return w * (0.3 + 1.0 * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, t))), 0.55));
  }) + '" fill="' + color + '"/>';
  ends.forEach(function (end) {
    var forward = end.at === 1 ? stem : arrowReverse(stem);
    var tip = forward.samples[forward.samples.length - 1];
    var direction = arrowEndDirection(forward, w * 6);
    if (end.head) {
      out += arrowOrnateHead({ tip: curve.tips[end.at], direction: curve.directions[end.at] }, w, color);
    } else {
      // Which way the curve is bending near this end decides which way the curl turns.
      var back = arrowPointAt(forward, forward.total - Math.min(forward.total * 0.5, w * 14));
      var side = (tip.x - back.x) * (direction.y) - (tip.y - back.y) * (direction.x) >= 0 ? 1 : -1;
      var curl = arrowCurl(tip, direction, -side, w);
      out += '<path d="' + arrowRibbon(curl, function (t) {
        return w * 0.3 * (1 - 0.75 * t);
      }) + '" fill="' + color + '"/>';
      var last = curl.samples[curl.samples.length - 1];
      out += '<circle cx="' + arrowNumber(last.x) + '" cy="' + arrowNumber(last.y) + '" r="' + arrowNumber(w * 0.42) + '" fill="' + color + '"/>';
    }
  });
  return out;
}

// ---- entry points ------------------------------------------------------------------------------------------

function arrowWaypoints(block, boxAspect) {
  var height = 100 / (boxAspect > 0 ? boxAspect : 1);
  return (block.points || []).map(function (point) {
    return { x: point.x, y: (point.y * height) / 100 };
  });
}

// The SVG of an arrow, as a string - to be put in a box that is the block's own.
export function arrowSvgMarkup(block, boxAspect) {
  var height = 100 / (boxAspect > 0 ? boxAspect : 1);
  var points = arrowWaypoints(block, boxAspect);
  var open = '<svg viewBox="0 0 100 ' + arrowNumber(height) + '" preserveAspectRatio="none" style="width:100%;height:100%;display:block;overflow:visible">';
  if (points.length < 2) return open + "</svg>";
  var color = arrowColor(block.color);
  var w = Math.max(0.05, block.width || 0.8) * (100 / Math.max(block.position.width, 0.01));
  var style = block.arrowStyle === "sketch" || block.arrowStyle === "ornate" ? block.arrowStyle : "plain";
  var curve = arrowSample(points);
  var headLength = style === "ornate" ? 7 * w : 4.5 * w;
  var heads = [];
  var stem = curve;
  var tips = [curve.samples[0], curve.samples[curve.samples.length - 1]];
  var directions = [null, null];
  if (block.endHead) {
    directions[1] = arrowEndDirection(curve, headLength);
    heads.push({ tip: tips[1], direction: directions[1] });
    stem = arrowTrimEnd(stem, headLength * (style === "ornate" ? 0.7 : 0.8));
  }
  if (block.startHead) {
    var reversed = arrowReverse(curve);
    directions[0] = arrowEndDirection(reversed, headLength);
    heads.push({ tip: tips[0], direction: directions[0] });
    stem = arrowReverse(arrowTrimEnd(arrowReverse(stem), headLength * (style === "ornate" ? 0.7 : 0.8)));
  }
  var body;
  if (style === "sketch") body = arrowSketch(stem, heads, w, color, arrowRandom(String(block.id)));
  else if (style === "ornate") body = arrowOrnate({ stem: stem, tips: tips, directions: directions }, { start: !!block.startHead, end: !!block.endHead }, w, color);
  else body = arrowPlain(stem, heads, w, color);
  return open + body + "</svg>";
}

// Where the "add a waypoint" handles of the editor sit: on the curve, halfway between two waypoints - in the
// block's own percent (like the waypoints themselves).
export function arrowSegmentMiddles(block, boxAspect) {
  var height = 100 / (boxAspect > 0 ? boxAspect : 1);
  return arrowSegments(arrowWaypoints(block, boxAspect)).map(function (segment) {
    var middle = arrowBezierAt(segment, 0.5);
    return { x: middle.x, y: (middle.y * 100) / height };
  });
}
