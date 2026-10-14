// The drawing of an ImageBlock (core/types.ts) that has a mask and/or an effect: the picture cut to the shape of its mask (a
// closed curve through points), with a border, a shadow, a reflection, a paper edge or a glow.
//
// ONE source for the editor and the player: the editor imports it like any module (see imageGeometry.d.ts); the exported player
// (which can't import anything, see player.runtime.js) gets this very file embedded - buildRuntimeHtml.ts strips the `export`s and
// wraps it. So: plain top-level function declarations only, no imports, no syntax newer than the player's own.
//
// Everything is worked out in a space that is as true to the slide as the block's own box: the box is 100 units wide and
// 100 / boxAspect high (boxAspect = the box's real width : height on the slide), so a circle stays a circle and a rounded
// corner stays round however the box is stretched; the SVG is then stretched to the box evenly. Lengths of an effect arrive in cqw
// (percent of the slide's width, like every size in a module); the box is `block.position.width` cqw wide, which turns them into
// units. The SVG reaches past the box on every side by what the effect needs (a shadow, a reflection), so nothing is written in
// cqw into the SVG - it can be drawn as a picture of its own (the PDF) as well.

function imgNum(value) {
  return (Math.round(value * 100) / 100).toString();
}

function imgColor(value, fallback) {
  return typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : fallback;
}

function imgClamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function imgEscape(text) {
  return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * The outline of a mask worked out for a box of the given shape: for every point (percent of the block's box) where the curve
 * arrives (`pre`) and leaves (`post`; they differ where a corner is rounded, with `arc` as the two control points between), and the
 * control points of the stretch that leads on to the next point (`next`). All in true space (see above).
 */
export function imageMaskOutline(points, boxAspect) {
  var n = points.length;
  var aspect = boxAspect > 0 ? boxAspect : 1;
  var a = points.map(function (p) {
    return { x: p.x, y: p.y / aspect };
  });
  var out = [];
  for (var i = 0; i < n; i++) {
    var p = a[i];
    var prev = a[(i + n - 1) % n];
    var next = a[(i + 1) % n];
    var entry = { pre: { x: p.x, y: p.y }, post: { x: p.x, y: p.y }, arc: null, tangent: null };
    var source = points[i];
    if (source.smooth) {
      // Catmull-Rom: the curve runs through the point parallel to the line between its neighbours.
      entry.tangent = { x: (next.x - prev.x) / 6, y: (next.y - prev.y) / 6 };
    } else if (source.radius > 0) {
      var v1x = prev.x - p.x;
      var v1y = prev.y - p.y;
      var v2x = next.x - p.x;
      var v2y = next.y - p.y;
      var len1 = Math.hypot(v1x, v1y);
      var len2 = Math.hypot(v2x, v2y);
      if (len1 > 0.0001 && len2 > 0.0001) {
        var u1x = v1x / len1;
        var u1y = v1y / len1;
        var u2x = v2x / len2;
        var u2y = v2y / len2;
        var cos = imgClamp(u1x * u2x + u1y * u2y, -1, 1);
        var theta = Math.acos(cos);
        if (theta > 0.02 && theta < Math.PI - 0.02) {
          var tanHalf = Math.tan(theta / 2);
          // How far from the corner the arc begins - never beyond the middle of an edge.
          var d = Math.min(source.radius / tanHalf, len1 / 2, len2 / 2);
          var r = d * tanHalf;
          var h = (4 / 3) * Math.tan((Math.PI - theta) / 4) * r;
          entry.pre = { x: p.x + u1x * d, y: p.y + u1y * d };
          entry.post = { x: p.x + u2x * d, y: p.y + u2y * d };
          entry.arc = [
            { x: entry.pre.x - u1x * h, y: entry.pre.y - u1y * h },
            { x: entry.post.x - u2x * h, y: entry.post.y - u2y * h },
          ];
        }
      }
    }
    out.push(entry);
  }
  for (var j = 0; j < n; j++) {
    var from = out[j];
    var to = out[(j + 1) % n];
    from.next = [
      from.tangent ? { x: from.post.x + from.tangent.x, y: from.post.y + from.tangent.y } : { x: from.post.x, y: from.post.y },
      to.tangent ? { x: to.pre.x - to.tangent.x, y: to.pre.y - to.tangent.y } : { x: to.pre.x, y: to.pre.y },
    ];
  }
  return out;
}

/** The mask as an SVG path (`d`) in true space. */
export function imageMaskPathD(points, boxAspect) {
  if (!points || points.length < 3) return "";
  var outline = imageMaskOutline(points, boxAspect);
  var n = outline.length;
  var d = "M" + imgNum(outline[0].pre.x) + " " + imgNum(outline[0].pre.y);
  for (var i = 0; i < n; i++) {
    var entry = outline[i];
    var following = outline[(i + 1) % n];
    if (entry.arc) {
      d +=
        "C" + imgNum(entry.arc[0].x) + " " + imgNum(entry.arc[0].y) + " " +
        imgNum(entry.arc[1].x) + " " + imgNum(entry.arc[1].y) + " " +
        imgNum(entry.post.x) + " " + imgNum(entry.post.y);
    }
    d +=
      "C" + imgNum(entry.next[0].x) + " " + imgNum(entry.next[0].y) + " " +
      imgNum(entry.next[1].x) + " " + imgNum(entry.next[1].y) + " " +
      imgNum(following.pre.x) + " " + imgNum(following.pre.y);
  }
  return d + "Z";
}

/** The curve's middle on the stretch after each point (in the block's own percent). */
export function imageMaskSegmentMiddles(points, boxAspect) {
  if (!points || points.length < 3) return [];
  var aspect = boxAspect > 0 ? boxAspect : 1;
  var outline = imageMaskOutline(points, boxAspect);
  var n = outline.length;
  var middles = [];
  for (var i = 0; i < n; i++) {
    var p0 = outline[i].post;
    var p3 = outline[(i + 1) % n].pre;
    var c1 = outline[i].next[0];
    var c2 = outline[i].next[1];
    // A cubic at t = 1/2.
    var x = (p0.x + 3 * c1.x + 3 * c2.x + p3.x) / 8;
    var y = (p0.y + 3 * c1.y + 3 * c2.y + p3.y) / 8;
    middles.push({ x: x, y: y * aspect });
  }
  return middles;
}

/** How far the drawing of an effect reaches past the block's box, in units: { l, r, t, b }. */
export function imageEffectBleed(block, boxAspect) {
  var none = { l: 0, r: 0, t: 0, b: 0 };
  var effect = block.effect;
  if (!effect) return none;
  var width = block.position && block.position.width > 0 ? block.position.width : 100;
  var unit = 100 / width;
  var height = 100 / (boxAspect > 0 ? boxAspect : 1);
  if (effect.kind === "shadow") {
    var spread = (effect.blur || 0) * unit * 1.5;
    var dx = (effect.offsetX || 0) * unit;
    var dy = (effect.offsetY || 0) * unit;
    return { l: Math.max(0, spread - dx), r: Math.max(0, spread + dx), t: Math.max(0, spread - dy), b: Math.max(0, spread + dy) };
  }
  if (effect.kind === "glow") {
    var around = (effect.size || 0) * unit * 1.5;
    return { l: around, r: around, t: around, b: around };
  }
  if (effect.kind === "paper") {
    var rough = ((effect.roughness || 0) / 100) * 1.5 * unit + 2 * unit;
    return { l: rough, r: rough, t: rough, b: rough };
  }
  if (effect.kind === "reflection") {
    var scale = imgClamp((effect.squash === undefined ? 100 : effect.squash) / 100, 0.2, 1);
    var shear = Math.abs(Math.tan(((effect.skew || 0) * Math.PI) / 180)) * height * scale;
    return { l: shear, r: shear, t: 0, b: (effect.gap || 0) * unit + height * scale };
  }
  return none;
}

/**
 * The picture of an ImageBlock with a mask and/or an effect, as HTML: a box that fills the block with an SVG in it that reaches past
 * the box where the effect needs room. `src` is where the picture can be had (a URL the SVG may use); `uid` makes the ids inside
 * unique (the same block may be on the page twice: the canvas and a thumbnail).
 */
export function imageSvgMarkup(block, boxAspect, src, uid) {
  var aspect = boxAspect > 0 ? boxAspect : 1;
  var height = 100 / aspect;
  var width = block.position && block.position.width > 0 ? block.position.width : 100;
  var unit = 100 / width;
  var effect = block.effect || null;
  var id = "weft-img-" + String(uid || block.id).replace(/[^a-zA-Z0-9_-]/g, "");
  var bleed = imageEffectBleed(block, aspect);

  var clipD =
    block.mask && block.mask.points && block.mask.points.length >= 3
      ? imageMaskPathD(block.mask.points, aspect)
      : "M0 0H100V" + imgNum(height) + "H0Z";
  var defs = '<clipPath id="' + id + '-clip"><path d="' + clipD + '"/></clipPath>';

  var inner =
    '<image href="' + imgEscape(src || "") + '" x="0" y="0" width="100" height="' + imgNum(height) + '" preserveAspectRatio="xMidYMid meet"/>';
  if (effect && effect.kind === "border" && effect.width > 0) {
    // The border lies inside the shape: a stroke twice as wide as asked for, of which the outer half is cut off by the clip.
    inner +=
      '<path d="' + clipD + '" fill="none" stroke="' + imgColor(effect.color, "#ffffff") + '" stroke-width="' + imgNum(effect.width * unit * 2) +
      '" stroke-opacity="' + imgNum(imgClamp(effect.opacity === undefined ? 1 : effect.opacity, 0, 1)) + '" stroke-linejoin="round"/>';
  }
  if (effect && effect.kind === "paper") {
    inner +=
      '<path d="' + clipD + '" fill="none" stroke="' + imgColor(effect.color, "#fbf8f1") + '" stroke-width="' +
      imgNum(Math.max(0.1, effect.width) * unit * 2) + '" stroke-linejoin="round"/>';
  }
  var art = '<g clip-path="url(#' + id + '-clip)">' + inner + "</g>";

  var shown = art;
  if (effect && effect.kind === "shadow") {
    defs +=
      '<filter id="' + id + '-fx" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">' +
      '<feDropShadow dx="' + imgNum((effect.offsetX || 0) * unit) + '" dy="' + imgNum((effect.offsetY || 0) * unit) +
      '" stdDeviation="' + imgNum(Math.max(0, (effect.blur || 0) * unit) / 2) + '" flood-color="' + imgColor(effect.color, "#000000") +
      '" flood-opacity="' + imgNum(imgClamp(effect.opacity === undefined ? 0.5 : effect.opacity, 0, 1)) + '"/></filter>';
    shown = '<g filter="url(#' + id + '-fx)">' + art + "</g>";
  } else if (effect && effect.kind === "glow") {
    var strength = imgClamp((effect.strength === undefined ? 60 : effect.strength) / 100, 0, 1);
    defs +=
      '<filter id="' + id + '-fx" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">' +
      '<feGaussianBlur in="SourceAlpha" stdDeviation="' + imgNum(Math.max(0.01, (effect.size || 0) * unit) / 2) + '" result="blur"/>' +
      '<feFlood flood-color="' + imgColor(effect.color, "#fde047") + '" result="flood"/>' +
      '<feComposite in="flood" in2="blur" operator="in" result="glow"/>' +
      '<feComponentTransfer in="glow" result="glow2"><feFuncA type="linear" slope="' + imgNum(0.6 + strength * 3.4) + '"/></feComponentTransfer>' +
      '<feMerge><feMergeNode in="glow2"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    shown = '<g filter="url(#' + id + '-fx)">' + art + "</g>";
  } else if (effect && effect.kind === "paper") {
    var displacement = ((effect.roughness || 0) / 100) * 1.5 * unit;
    defs +=
      '<filter id="' + id + '-fx" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="7" result="noise"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="noise" scale="' + imgNum(displacement) + '" xChannelSelector="R" yChannelSelector="G" result="rough"/>' +
      '<feDropShadow in="rough" dx="0" dy="' + imgNum(0.35 * unit) + '" stdDeviation="' + imgNum(0.5 * unit) +
      '" flood-color="#000000" flood-opacity="0.35"/></filter>';
    shown = '<g filter="url(#' + id + '-fx)">' + art + "</g>";
  } else if (effect && effect.kind === "reflection") {
    var scale = imgClamp((effect.squash === undefined ? 100 : effect.squash) / 100, 0.2, 1);
    var gap = (effect.gap || 0) * unit;
    var fadeEnd = imgClamp((effect.height === undefined ? 60 : effect.height) / 100, 0.05, 1);
    var opacity = imgClamp(effect.opacity === undefined ? 0.5 : effect.opacity, 0, 1);
    var shear = Math.tan(((effect.skew || 0) * Math.PI) / 180);
    // The copy is turned over at the picture's lower edge (and squashed by `scale`); the shear leaves that edge where it is.
    var matrix =
      "matrix(1 0 " + imgNum(-shear * scale) + " " + imgNum(-scale) + " " + imgNum(shear * scale * height) + " " +
      imgNum(height + gap + scale * height) + ")";
    var top = height + gap;
    var reach = bleed.l + bleed.r + 100;
    defs +=
      '<linearGradient id="' + id + '-fade" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#ffffff" stop-opacity="' + imgNum(opacity) + '"/>' +
      '<stop offset="' + imgNum(fadeEnd) + '" stop-color="#ffffff" stop-opacity="0"/>' +
      '<stop offset="1" stop-color="#ffffff" stop-opacity="0"/></linearGradient>' +
      '<mask id="' + id + '-mask" maskUnits="userSpaceOnUse" x="' + imgNum(-bleed.l) + '" y="' + imgNum(top) + '" width="' + imgNum(reach) +
      '" height="' + imgNum(scale * height) + '"><rect x="' + imgNum(-bleed.l) + '" y="' + imgNum(top) + '" width="' + imgNum(reach) +
      '" height="' + imgNum(scale * height) + '" fill="url(#' + id + '-fade)"/></mask>';
    shown = art + '<g mask="url(#' + id + '-mask)"><g transform="' + matrix + '">' + art + "</g></g>";
  }

  var boxW = 100 + bleed.l + bleed.r;
  var boxH = height + bleed.t + bleed.b;
  var style =
    "position:absolute;display:block;overflow:visible;" +
    "left:" + imgNum((-bleed.l / 100) * 100) + "%;top:" + imgNum((-bleed.t / height) * 100) + "%;" +
    "width:" + imgNum((boxW / 100) * 100) + "%;height:" + imgNum((boxH / height) * 100) + "%;";
  var label = block.alt ? ' role="img" aria-label="' + imgEscape(block.alt) + '"' : ' aria-hidden="true"';
  return (
    '<div style="position:relative;width:100%;height:100%;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
    imgNum(-bleed.l) + " " + imgNum(-bleed.t) + " " + imgNum(boxW) + " " + imgNum(boxH) +
    '" preserveAspectRatio="none" style="' + style + '"' + label + "><defs>" + defs + "</defs>" + shown + "</svg></div>"
  );
}
