// How a text (TextBlock) is drawn - for the player, the thumbnails and the PDF alike: one function, told where it draws. Plain JavaScript without
// imports: this file is inlined verbatim (its "export" taken away) into the exported page ahead of the player (core/runtime/buildRuntimeHtml.ts) and
// imported as a module by the editor (render.d.ts). (On the editor's canvas the words of a selected text are written in place: that is the editor's
// own, BlockView.)
//
//   renderText(root, props, ctx) makes `root` - the element that has the block's size - the text, and returns { update(props), destroy() }. The text is
//   `root` itself, not something inside it: the block's box (background, border, a blur of what is behind it), its padding and its scrolling are those
//   of the element that is positioned and faded in, as a blur behind a child of a faded element would not see the slide.
//
//   props   { html, scrollable, box }: the words as HTML in the language that is shown, whether text longer than the block scrolls (read when it is
//           drawn), and the look of its box (TextBox; absent: none; read when it is drawn). `update` draws the words again.
//   ctx     { mode, applyVariables(node) }: `applyVariables` puts the values of variables in for the placeholders in the words (only the player has
//           them: absent in the editor).
//
//   mode "play"   scrolls where the author wanted it, and a text without words takes no clicks (is-empty).
//        "edit", "thumbnail", "print"   a picture: the words are cut off at the edge of the block.
//
// The look is in blocks/text/render.css.

// Blur what is behind a block (core/document/backdropBlur.ts: keep them in step).
var TEXT_BACKDROP_BLUR = "-webkit-backdrop-filter:blur(2cqw);backdrop-filter:blur(2cqw);";

// The background and border of a text block's box as CSS text (core/document/textBox.ts writes the same for the canvas: keep them in step).
export function textBoxStyle(box) {
  if (!box) return "";
  var mix = function (color, opacity) {
    return "color-mix(in srgb," + color + " " + Math.round(Math.max(0, Math.min(1, opacity)) * 100) + "%,transparent)";
  };
  var css = "box-sizing:border-box;";
  if (box.fill) css += "background:" + mix(box.fill, box.fillOpacity) + ";";
  if (box.borderColor && box.borderWidth > 0) css += "border:" + box.borderWidth + "cqw solid " + mix(box.borderColor, box.borderOpacity) + ";";
  css += "border-radius:" + box.radius + "cqw;padding:" + box.padding + "cqw;";
  return box.blur ? css + TEXT_BACKDROP_BLUR : css;
}

export function renderText(root, props, ctx) {
  var data = props;
  var before = root.style.cssText;
  root.classList.add("weft-block-text");
  if (data.scrollable && ctx.mode === "play") root.classList.add("is-scrollable");
  // (The semicolon first: the text of a style is not always given back with the one at its end.)
  if (data.box) root.style.cssText += ";" + textBoxStyle(data.box);

  var fill = function () {
    root.innerHTML = data.html;
    if (ctx.applyVariables) ctx.applyVariables(root);
    // A text without words (the empty text a page makes for a placeholder of its layout when its field is clicked, say) is a rectangle nobody sees:
    // it does not take the clicks of what lies under it (the arrow of a gallery, a button).
    var empty = ctx.mode === "play" && !data.box && (root.textContent || "").trim() === "" && !root.querySelector("img, a, svg, video, audio, iframe, canvas, input");
    root.classList.toggle("is-empty", empty);
  };
  fill();

  return {
    // The language changed (or the words did): the words are drawn again.
    update: function (next) {
      data = next;
      fill();
    },
    destroy: function () {
      root.classList.remove("weft-block-text", "is-scrollable", "is-empty");
      root.style.cssText = before;
      root.replaceChildren();
    },
  };
}
