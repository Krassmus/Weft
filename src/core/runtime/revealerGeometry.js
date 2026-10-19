// The picture of a Revealer's icon (see RevealerBlock in core/types.ts) and the colour of its sign, shared by the editor and the player: this file is
// embedded into the exported page ahead of player.runtime.js (buildRuntimeHtml.ts), so it has to be plain script with nothing to import.

/** The colour of a sign on `fill` that stands out most from it: black or white, whichever has the higher contrast (WCAG's relative luminance). */
export function revealerSignColor(fill) {
  var hex = String(fill || "").replace("#", "");
  if (hex.length === 3) hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
  var number = parseInt(hex, 16);
  if (!isFinite(number) || hex.length !== 6) return "#ffffff";
  var channels = [(number >> 16) & 255, (number >> 8) & 255, number & 255].map(function (value) {
    var c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  var luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  // Contrast with white is 1.05 / (L + 0.05), with black (L + 0.05) / 0.05: white wins up to the point where they are equal.
  return luminance > 0.1791 ? "#000000" : "#ffffff";
}

/**
 * The SVG of the icon: a shape in `fill` (a circle, for the warning a rounded triangle) with a sign on it in the colour that stands out most.
 * "info": an i, "warning": an exclamation mark in a triangle, "exclamation": an exclamation mark in a circle, "question": a question mark.
 */
export function revealerIconSvg(icon, fill) {
  var sign = revealerSignColor(fill);
  var shape;
  var mark;
  if (icon === "warning") {
    shape = '<path d="M50 8 C53 8 55.5 9.6 57 12.3 L94 76 C97 81.2 93.2 88 87 88 L13 88 C6.8 88 3 81.2 6 76 L43 12.3 C44.5 9.6 47 8 50 8 Z" fill="' + fill + '"/>';
    mark = '<rect x="46.5" y="34" width="7" height="30" rx="3.5" fill="' + sign + '"/><circle cx="50" cy="75" r="4.5" fill="' + sign + '"/>';
  } else {
    shape = '<circle cx="50" cy="50" r="46" fill="' + fill + '"/>';
    if (icon === "exclamation") {
      mark = '<rect x="46" y="23" width="8" height="35" rx="4" fill="' + sign + '"/><circle cx="50" cy="72" r="5.5" fill="' + sign + '"/>';
    } else if (icon === "question") {
      mark =
        '<path d="M37 39 C37 30 43 25 51 25 C59 25 65 30 65 38 C65 45 60 48 56 51 C53 53 52 55 52 59" fill="none" stroke="' + sign + '" stroke-width="8" stroke-linecap="round"/>' +
        '<circle cx="52" cy="73" r="5.5" fill="' + sign + '"/>';
    } else {
      mark = '<circle cx="50" cy="29" r="5.5" fill="' + sign + '"/><rect x="46" y="41" width="8" height="35" rx="4" fill="' + sign + '"/>';
    }
  }
  return '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="display:block;width:100%;height:100%;overflow:visible">' + shape + mark + "</svg>";
}
