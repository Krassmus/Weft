// The accent colour as it is drawn straight on the slide (a ticked check box, the border of a chosen answer, the letters of a message), shared by the
// editor and the player: this file is embedded into the exported page ahead of player.runtime.js (buildRuntimeHtml.ts), so it has to be plain script
// with nothing to import.

function accentChannels(color) {
  var hex = String(color || "").replace("#", "");
  if (hex.length === 3) hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
  var number = parseInt(hex, 16);
  if (!isFinite(number) || hex.length !== 6) return null;
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function accentLuminance(channels) {
  var linear = channels.map(function (value) {
    var c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/** WCAG's contrast ratio of two colours ("#rrggbb"), 1 to 21. */
export function contrastRatio(a, b) {
  var ca = accentChannels(a);
  var cb = accentChannels(b);
  if (!ca || !cb) return 1;
  var la = accentLuminance(ca);
  var lb = accentLuminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The colour to draw `accent` in on `background` so that it stands out by at least `ratio` (3 for a drawn element, 4.5 for letters): the
 * accent colour itself when it does, else the nearest colour on the way from it to white (on a dark background) or to black (on a light one) that
 * does - the accent colour with as little of the other mixed in as it takes.
 */
export function accentInk(accent, background, ratio) {
  var channels = accentChannels(accent);
  var back = accentChannels(background);
  if (!channels || !back) return accent;
  if (contrastRatio(accent, background) >= ratio) return accent;
  var target = accentLuminance(back) < 0.5 ? [255, 255, 255] : [0, 0, 0];
  function mixed(t) {
    var parts = channels.map(function (value, i) {
      var part = Math.round(value + (target[i] - value) * t);
      return (part < 16 ? "0" : "") + part.toString(16);
    });
    return "#" + parts.join("");
  }
  var low = 0;
  var high = 1;
  for (var step = 0; step < 12; step++) {
    var middle = (low + high) / 2;
    if (contrastRatio(mixed(middle), background) >= ratio) high = middle;
    else low = middle;
  }
  return mixed(high);
}
