// How a button (ButtonBlock) is drawn - for the player, the thumbnails and the PDF: one function, told where it draws. Plain JavaScript without imports:
// this file is inlined verbatim (its "export" taken away) into the exported page ahead of the player (core/runtime/buildRuntimeHtml.ts) and imported as
// a module by the editor (render.d.ts). (On the editor's canvas the label of a selected button is written in place: that is the editor's own, BlockView.)
//
//   renderButton(root, props, ctx) draws into `root` (an empty element that has the block's size) and returns { button, update(props), destroy() }.
//
//   mode "play"   a button: what a click does is the player's (it adds its own listeners to `button`, and disables it where it cannot be used).
//        "edit", "thumbnail", "print"   a picture of one, drawn as a <div> that looks like it - nothing in it can be used, and html2canvas (which draws
//                 the PDF and the cover) leaves out the words that stand straight in a paragraph in a real <button>.
//
//   props   { html, look }: the label as HTML in the language that is shown ("": it has no words - the player's own "Weiter" stands there) and the
//           look the author gave it as CSS text (see buttonLookStyle).
//   ctx     { mode, text(key), applyVariables(node) }: "next" is the word of an empty label (playerStrings.ts); `applyVariables` puts the values of
//           variables in for the placeholders in the label (only the player has them: absent in the editor).
//
// The look is in blocks/button/render.css.

// The look of a button as CSS (core/document/buttonAppearance.ts has the same for the editor's canvas as an object): only what the author set is
// written, the stylesheet has the rest - the module's accent colour for the background, the corners and the typeface of the interactive elements.
export function buttonLookStyle(look) {
  if (!look) return "";
  var css = "";
  // (No background of its own: the stylesheet's, which is the module's accent colour - see stageTheme.css.)
  if (look.background !== undefined) css += "background:" + (look.background || "transparent") + ";";
  var width = look.borderWidth !== undefined ? look.borderWidth : 0;
  if (look.borderWidth !== undefined || look.borderColor !== undefined) {
    css += width > 0 ? "border:" + width + "cqw solid " + (look.borderColor || "var(--slide-button-bg)") + ";" : "border:none;";
    // (For the futuristic style, which draws the border again along its cut corners, see stageTheme.css.)
    if (width > 0) css += "--slide-cut-line:" + (look.borderColor || "var(--slide-button-bg)") + ";--slide-cut-line-width:" + width + "cqw;";
  }
  if (look.radius !== undefined) css += "border-radius:" + look.radius + "cqw;";
  return css;
}

export function renderButton(root, props, ctx) {
  var data = props;
  var picture = ctx.mode !== "play";
  var button = document.createElement(picture ? "div" : "button");
  if (!picture) button.type = "button";
  button.className = "weft-block-button-el" + (picture ? " is-picture" : "");

  var fill = function () {
    button.style.cssText = data.look || "";
    // A label with no words in it is the player's own "Weiter".
    if (!data.html) button.textContent = ctx.text("next");
    else button.innerHTML = data.html;
    if (ctx.applyVariables) ctx.applyVariables(button);
  };
  fill();
  root.appendChild(button);

  return {
    button: button,
    // The language changed (or the words did): the label is drawn again.
    update: function (next) {
      data = next;
      fill();
    },
    destroy: function () {
      if (button.parentNode) button.parentNode.removeChild(button);
    },
  };
}
