// How a TexBlock (core/types.ts) is drawn - for the player, the editor's canvas, the thumbnails and the PDF alike: the typeset formula, scaled to fit
// (contain, centred) whatever box it is put in, like a picture. One function, told where it draws. Plain JavaScript without imports: this file is inlined
// verbatim (its "export" taken away) into the exported page ahead of the player (core/runtime/buildRuntimeHtml.ts) and imported as a module by the editor
// (render.d.ts).
//
//   renderTex(root, props, ctx) draws into `root` (an empty element that has the block's size) and returns { update(props), destroy() }.
//
//   props   what the block says: { html, color } -
//           html    the formula already typeset (KaTeX, as HTML): the player never runs KaTeX - the page is built with the HTML of every formula
//                   (buildRuntimeHtml.ts) and KaTeX's stylesheet, the editor makes it with the same function (core/tex/renderTex.ts)
//           color   the colour of the whole formula; "" is the colour the block inherits (the slide's text colour). It is the colour of `root`.
//   ctx     { mode, text } - `mode` is "play" | "edit" | "thumbnail" | "print": the formula is the same in all of them. `text(key)`: the editor's own
//           words, "enterFormula" - what an empty block says outside the player (the player shows nothing).
//
// The formula is laid out once at its natural size (.weft-tex-inner, see blocks/tex/render.css) and then only transformed, never typeset again: it is
// scaled to the box as soon as the box is laid out, whenever the box (the stage) is resized and when KaTeX's fonts, which load lazily and change the
// formula's natural size once they have arrived, are there. Until the first fit it is hidden.

export function renderTex(root, props, ctx) {
  var observer = null;
  var onResize = null;
  var built = null;

  function clear() {
    if (observer) observer.disconnect();
    observer = null;
    if (onResize) window.removeEventListener("resize", onResize);
    onResize = null;
    if (built && built.parentNode) built.parentNode.removeChild(built);
    built = null;
  }

  function fitTo(box, inner) {
    function fit() {
      var boxWidth = box.clientWidth;
      var boxHeight = box.clientHeight;
      var width = inner.offsetWidth;
      var height = inner.offsetHeight;
      if (!width || !height || !boxWidth || !boxHeight) return;
      var scale = Math.min(boxWidth / width, boxHeight / height);
      var x = (boxWidth - width * scale) / 2;
      var y = (boxHeight - height * scale) / 2;
      inner.style.transform = "translate(" + x + "px, " + y + "px) scale(" + scale + ")";
      inner.style.visibility = "inherit";
    }
    // At once where the box is laid out already (the editor draws into one that is attached); where it is not yet (the player builds the block first and
    // puts it on the page after), the observer's first callback is the first fit.
    fit();
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(fit);
      observer.observe(box);
      observer.observe(inner);
    } else {
      onResize = fit;
      window.addEventListener("resize", fit);
    }
  }

  function draw(data) {
    clear();
    if (data.color) root.style.color = data.color;
    else if (root.style.color) root.style.color = "";
    if (!data.html && ctx.mode !== "play" && ctx.text) {
      built = document.createElement("div");
      built.className = "weft-edit-block-placeholder";
      built.textContent = ctx.text("enterFormula");
      root.appendChild(built);
      return;
    }
    var box = document.createElement("div");
    box.className = "weft-tex";
    var inner = document.createElement("div");
    inner.className = "weft-tex-inner";
    inner.innerHTML = data.html || "";
    box.appendChild(inner);
    root.appendChild(box);
    built = box;
    fitTo(box, inner);
  }

  draw(props);
  return {
    update: draw,
    destroy: clear,
  };
}
