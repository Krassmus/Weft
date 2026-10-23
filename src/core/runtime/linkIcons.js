// The pictures of a LinkBlock's icon (see core/types.ts), shared by the editor and the player: this file is embedded into the exported page ahead of
// player.runtime.js (buildRuntimeHtml.ts), so it has to be plain script with nothing to import. Drawn with lines in the colour of the text.

var LINK_ICON_SHAPES = {
  link: '<rect x="2.5" y="8.5" width="12" height="7" rx="3.5" transform="rotate(-45 8.5 12)"/><rect x="9.5" y="8.5" width="12" height="7" rx="3.5" transform="rotate(-45 15.5 12)"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5"/><path d="M5 20h14"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  file: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
};

/** The icons there are, in the order they are offered. */
export var LINK_ICONS = ["link", "external", "download", "arrow", "globe", "file", "mail"];

/** The SVG of an icon ("" for "none" or a name that is not known): one em square, in the colour of the text around it. */
export function linkIconSvg(icon) {
  var shape = LINK_ICON_SHAPES[icon];
  if (!shape) return "";
  return '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + shape + "</svg>";
}
