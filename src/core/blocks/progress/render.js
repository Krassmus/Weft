// How a progress bar (ProgressBlock) is drawn - for the player, the editor's canvas, the thumbnails and the PDF alike: one function. Plain JavaScript
// without imports: this file is inlined verbatim (its "export" taken away) into the exported page ahead of the player
// (core/runtime/buildRuntimeHtml.ts) and imported as a module by the editor (render.d.ts).
//
//   renderProgress(root, props, ctx) draws into `root` (an empty element that has the block's size) and returns { update(props), destroy() }.
//
//   props   { value, moveMs, color, trackColor, rounded, label }: how full the bar is (0 to 100), how long it takes to get there when `update` gives it
//           another value (0: it jumps), the colours of the fill and the track, whether its ends are round, and what it shows (for whoever cannot see).
//   ctx     { mode }: in "play" the root is a progress bar for assistive technology (role, value); the editor's modes draw the picture only.
//
// Which value a bar has is the place's to find out: the player's is the variable's (and it moves the fill when the variable changes), the editor's
// is the one it starts with, where nothing moves. The look is in blocks/progress/render.css.

export function renderProgress(root, props, ctx) {
  var fill = document.createElement("div");
  fill.className = "weft-progress-fill";
  var track = document.createElement("div");
  track.appendChild(fill);

  function apply(next, first) {
    track.className = "weft-progress-track" + (next.rounded === false ? "" : " is-rounded");
    track.style.background = next.trackColor || "#dbe4f5";
    fill.style.background = next.color || "#3b82f6";
    // (The first drawing never moves: it shows where the bar is.)
    fill.style.transition = !first && next.moveMs > 0 ? "width " + next.moveMs + "ms ease" : "none";
    fill.style.width = next.value + "%";
    if (ctx.mode === "play") {
      root.setAttribute("role", "progressbar");
      root.setAttribute("aria-valuemin", "0");
      root.setAttribute("aria-valuemax", "100");
      root.setAttribute("aria-valuenow", String(Math.round(next.value)));
      root.setAttribute("aria-label", next.label || "");
    }
  }
  apply(props, true);
  root.appendChild(track);

  return {
    // Another value: the fill moves to it (as long as `moveMs` says); other colours are taken over.
    update: function (next) {
      apply(next, false);
    },
    destroy: function () {
      if (track.parentNode) track.parentNode.removeChild(track);
    },
  };
}
