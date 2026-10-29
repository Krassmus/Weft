// How a CodeBlock (core/types.ts) is drawn - for the player, the editor's thumbnails and the PDF alike: the highlighted text in a box of its own colours
// (the theme), at a size that scales with the slide. One function, told where it draws. Plain JavaScript without imports: this file is inlined verbatim
// (its "export" taken away) into the exported page ahead of the player (core/runtime/buildRuntimeHtml.ts) and imported as a module by the editor
// (render.d.ts). (On the editor's canvas the code is typed straight into the block, over the highlighted copy: that is the editor's own, CodeView.)
//
//   renderCode(root, props, ctx) draws into `root` (an empty element that has the block's size) and returns { update(props), destroy() }.
//
//   props   what the block says: { html, theme, fontSize, transparentBackground } -
//           html          the code already highlighted (highlight.js, as HTML): the player never runs the highlighter - the page is built with the HTML
//                         of every code block (buildRuntimeHtml.ts), the editor makes it with the same function (core/code/highlight.ts)
//           theme         the id of one of the themes (core/code/codeThemes.ts): the colours are the theme's CSS, which is scoped to `.weft-code-theme-<id>`
//           fontSize      in px on a slide that is 960 px wide: written as a share of the slide's width (cqw), so it scales with the slide
//           transparentBackground   drops the theme's background colour (the text colours stay)
//   ctx     { mode, text } - `mode` is "play" | "edit" | "thumbnail" | "print": the code is the same in all of them (it scrolls where there is more of it
//           than the box holds, except in a thumbnail, where the stylesheet keeps it still). `text(key)`: the editor's own words, "enterCode" - what an
//           empty block says outside the player (the player shows nothing).
//
// The look is in blocks/code/render.css and the theme's CSS.

export function renderCode(root, props, ctx) {
  var box = document.createElement("div");
  var pre = document.createElement("pre");
  pre.className = "weft-code-pre";
  box.appendChild(pre);

  function draw(data) {
    box.className = "weft-code weft-code-theme-" + data.theme + (data.transparentBackground ? " weft-code-transparent" : "");
    box.setAttribute("style", "font-size:" + Math.round((data.fontSize / 9.6) * 1000) / 1000 + "cqw;");
    pre.innerHTML = data.html || "";
    if (!data.html && ctx.mode !== "play" && ctx.text) {
      var hint = document.createElement("span");
      hint.className = "weft-code-empty";
      hint.textContent = ctx.text("enterCode");
      pre.appendChild(hint);
    }
  }

  draw(props);
  root.appendChild(box);
  return {
    update: draw,
    destroy: function () {
      if (box.parentNode) box.parentNode.removeChild(box);
    },
  };
}
