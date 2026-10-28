// How a list (ListBlock) is drawn - for the player, the thumbnails and the PDF alike: one function, told where it draws. Plain JavaScript without
// imports: this file is inlined verbatim (its "export" taken away) into the exported page ahead of the player (core/runtime/buildRuntimeHtml.ts) and
// imported as a module by the editor (render.d.ts). (On the editor's canvas the points are written in place - Enter, Backspace and the arrow keys
// go from one to the next: that is the editor's own, ListBlockCanvas in BlockView.)
//
//   renderList(root, props, ctx) draws into `root` (an empty element that has the block's size) and returns { rows, update(props), destroy() }.
//
//   props   { items: [{ id, html }], marker, markerColor, markerSrc, markerSize, spacing }: the points as HTML in the language that is shown, what stands
//           in front of them ("dot", "dash", "number", "image"), its colour ("": the colour of the text; not for a picture), the address of the
//           picture (marker "image"), its height in em of the text, and the space between two points in cqw. The points and the mark are those of the
//           moment it is drawn; `update` draws the words of the same points again.
//   ctx     { mode, applyVariables(node) }: `applyVariables` puts the values of variables in for the placeholders in a point (only the player has them:
//           absent in the editor). The mode makes no difference: a list looks the same everywhere (and is never used - the player only hides and
//           shows its points one by one, see `rows`).
//   rows    the element of every point by its id: what the player hides and shows when the Aufbau is made by each point on its own.
//
// The look is in blocks/list/render.css.

export function renderList(root, props, ctx) {
  var data = props;
  var timers = [];

  var box = document.createElement("div");
  box.className = "weft-list";
  box.setAttribute("role", "list");
  box.setAttribute("style", "gap:" + (data.spacing || 0) + "cqw;");

  var rows = {};
  var texts = [];
  data.items.forEach(function (item, index) {
    var row = document.createElement("div");
    row.className = "weft-list-item";
    row.setAttribute("role", "listitem");
    var marker = document.createElement("span");
    marker.className = "weft-list-marker is-" + data.marker;
    // (The colour of a dot, a dash or a number; a picture has its own. Only what looks like a colour is written into the style.)
    if (data.markerColor && data.marker !== "image" && /^#[0-9a-fA-F]{3,8}$/.test(data.markerColor)) marker.style.color = data.markerColor;
    if (data.marker === "image") {
      if (data.markerSrc) {
        var size = data.markerSize || 1.2;
        var picture = document.createElement("img");
        picture.setAttribute("src", data.markerSrc);
        picture.setAttribute("alt", "");
        // Centred on the middle of the lower case letters (0.32em above the baseline).
        picture.setAttribute("style", "height:" + size + "em;vertical-align:" + (0.32 - size / 2).toFixed(3) + "em;");
        marker.appendChild(picture);
      }
    } else if (data.marker === "number") {
      // (A dot and a dash are drawn by the stylesheet.)
      marker.textContent = index + 1 + ".";
    }
    var text = document.createElement("span");
    text.className = "weft-list-item-text";
    row.appendChild(marker);
    row.appendChild(text);
    box.appendChild(row);
    rows[item.id] = row;
    texts.push({ element: text, id: item.id });
  });

  var wordsOf = function (id) {
    for (var i = 0; i < data.items.length; i++) if (data.items[i].id === id) return data.items[i].html;
    return "";
  };
  var fill = function () {
    texts.forEach(function (entry) {
      entry.element.innerHTML = wordsOf(entry.id);
      if (ctx.applyVariables) ctx.applyVariables(entry.element);
    });
  };

  // The mark of every point is as large as the point's first character (known once the list is laid out in the page) - except the author's own
  // pictures: those are all the same size, whatever the first character of their point looks like. (The editor's canvas does the same: listCaret.ts.)
  var fit = function () {
    if (!box.isConnected || data.marker === "image") return;
    texts.forEach(function (entry) {
      var base = parseFloat(getComputedStyle(entry.element).fontSize);
      var walker = document.createTreeWalker(entry.element, NodeFilter.SHOW_TEXT);
      var scale = 1;
      for (var textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
        if (!(textNode.nodeValue || "").trim()) continue;
        var size = textNode.parentElement ? parseFloat(getComputedStyle(textNode.parentElement).fontSize) : 0;
        if (size && base) scale = Math.round((size / base) * 1000) / 1000;
        break;
      }
      var markerElement = entry.element.parentNode.querySelector(".weft-list-marker");
      if (markerElement) markerElement.style.fontSize = scale === 1 ? "" : scale + "em";
    });
  };

  fill();
  root.appendChild(box);
  fit();
  // (The page is put on the screen right after this; fonts may arrive a little later.)
  timers.push(setTimeout(fit, 0), setTimeout(fit, 300));

  return {
    rows: rows,
    // The language changed (or the words did): the words are drawn again, the marks fitted to them.
    update: function (next) {
      data = next;
      fill();
      fit();
    },
    destroy: function () {
      timers.forEach(clearTimeout);
      if (box.parentNode) box.parentNode.removeChild(box);
    },
  };
}
