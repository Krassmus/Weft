// How an embedded page (IframeBlock) is drawn - for the player, the editor's canvas, the thumbnails and the PDF alike: one function, but the picture
// is not the same everywhere, and this is where that is decided. Plain JavaScript without imports: this file is inlined verbatim (its "export" taken
// away) into the exported page ahead of the player (core/runtime/buildRuntimeHtml.ts) and imported as a module by the editor (render.d.ts).
//
//   renderIframe(root, props, ctx) draws into `root` (an empty element that has the block's size) and returns { update(props), destroy() }.
//
//   mode "play"       the page itself - or, with a QR code, the gate: the code and the address, which a click on the address turns into the page.
//        "edit"       the editor's canvas: what "play" shows (the page is live there, so that the author sees it), but a picture - it cannot be used.
//        "thumbnail"  a grey box with an icon: a thumbnail loads no page.
//        "print"      the PDF: a page cannot be printed (it is live, and from another origin) - a card with the address as text and the QR code.
//
//   props   { id, url, sandbox, allow, qrCode, presentationUrl, forcedViewportWidth, heightOverWidth, qrSvg }: what the block says; `heightOverWidth` is
//           the block's shape on the slide (height : width), `qrSvg` the QR code for `url` (null: there is none).
//   ctx     { mode, text(key), icons }: "embedded" and "noAddress" are the words (playerStrings.ts; the editor has the second), `icons` the SVG of
//           the grey box in a thumbnail: { globe, qr }.
//
// The look is in blocks/iframe/render.css.

// A module saved before forcedViewportWidth existed has no value for it at all, and a virtual viewport is always in effect now, so this needs an
// actual width to fall back to rather than just meaning "off".
export var DEFAULT_VIEWPORT_WIDTH = 768;

export function renderIframe(root, props, ctx) {
  var live = ctx.mode === "play";
  var data = props;
  var observer = null;
  var frame = null;

  function iframeTitle(src) {
    var host = "";
    try {
      host = new URL(src, window.location.href).hostname;
    } catch (e) {
      host = "";
    }
    return ctx.text("embedded") + (host ? ": " + host : "");
  }

  // The embedded page is always given exactly this fixed CSS-pixel WIDTH (so it sees a constant "window" width no matter how large the module itself
  // is displayed, e.g. to force its mobile layout) - the height is DERIVED from the block's own shape times that width, so the virtual viewport
  // always has exactly the block's shape and the scaled result fills it edge to edge with no letterboxing. The scale that fits the fixed-width
  // frame into the block needs the rendered width, which is not known until layout, so it is measured (ResizeObserver) - not computed in CSS
  // (Firefox rejects a calc() that divides one length by another).
  function pageElement(src) {
    var w = data.forcedViewportWidth || DEFAULT_VIEWPORT_WIDTH;
    var h = w * data.heightOverWidth;
    frame = document.createElement("iframe");
    frame.src = src;
    frame.setAttribute("sandbox", (data.sandbox || []).join(" "));
    // (What a page asks the browser for - camera, autoplay - is only given where it is used.)
    if (live) frame.setAttribute("allow", data.allow || "");
    frame.title = iframeTitle(src);
    frame.style.cssText = "width:" + w + "px;height:" + h + "px;border:0;";
    var wrap = document.createElement("div");
    wrap.className = "weft-iframe-viewport-wrap";
    wrap.appendChild(frame);
    if (typeof ResizeObserver !== "undefined") {
      var shown = frame;
      observer = new ResizeObserver(function (entries) {
        var rect = entries[0] && entries[0].contentRect;
        if (rect) shown.style.transform = "scale(" + rect.width / w + ")";
      });
      observer.observe(wrap);
    }
    return wrap;
  }

  function showPage(src) {
    clear();
    root.appendChild(pageElement(src));
  }

  // The code and the address; the address, once it is clicked, is the page (the other address, if there is one: the code is for the phones, this
  // is what is shown on the screen).
  function gateElement() {
    var gate = document.createElement("div");
    gate.className = "weft-qr-gate";
    if (data.qrSvg) {
      var box = document.createElement("div");
      box.className = "weft-qr-code";
      box.innerHTML = data.qrSvg;
      gate.appendChild(box);
    } else if (!live) {
      // (Nothing to draw yet - no address, or one too long for a code: the place is marked.)
      var empty = document.createElement("div");
      empty.className = "weft-qr-code is-empty";
      gate.appendChild(empty);
    }
    var link = document.createElement("button");
    link.type = "button";
    link.className = "weft-qr-link";
    link.textContent = data.url || ctx.text("noAddress");
    if (live) {
      link.addEventListener("click", function () {
        showPage(data.presentationUrl || data.url);
      });
    } else {
      link.tabIndex = -1;
    }
    gate.appendChild(link);
    return gate;
  }

  // A grey box with the icon of what it is.
  function placeholderElement() {
    var box = document.createElement("div");
    box.className = "weft-iframe-placeholder";
    var icon = document.createElement("span");
    icon.className = "weft-iframe-placeholder-icon";
    icon.innerHTML = (ctx.icons && (data.qrCode ? ctx.icons.qr : ctx.icons.globe)) || "";
    box.appendChild(icon);
    return box;
  }

  // The PDF: the address as text and, if there is one, the QR code - and the address is a link there (data-pdf-link, see exportPdf.tsx).
  function cardElement() {
    var card = document.createElement("div");
    card.className = "weft-iframe-card";
    card.setAttribute("data-pdf-link", data.url);
    if (data.qrSvg) {
      var qr = document.createElement("div");
      qr.className = "weft-iframe-card-qr";
      qr.innerHTML = data.qrSvg;
      card.appendChild(qr);
    }
    var text = document.createElement("div");
    text.className = "weft-iframe-card-text";
    var label = document.createElement("span");
    label.className = "weft-iframe-card-label";
    label.textContent = ctx.text("embedded");
    var address = document.createElement("span");
    address.className = "weft-iframe-card-url";
    address.textContent = data.url;
    text.appendChild(label);
    text.appendChild(address);
    card.appendChild(text);
    return card;
  }

  function clear() {
    if (observer) observer.disconnect();
    observer = null;
    frame = null;
    root.textContent = "";
  }

  if (ctx.mode === "thumbnail") root.appendChild(placeholderElement());
  else if (ctx.mode === "print") root.appendChild(data.url ? cardElement() : placeholderElement());
  else if (data.qrCode) root.appendChild(gateElement());
  else root.appendChild(pageElement(data.url));

  return {
    // The language changed: the name of the page for a screen reader (what is shown - the page, the address - is the same).
    update: function (next) {
      data = next;
      if (frame) frame.title = iframeTitle(frame.src);
    },
    destroy: clear,
  };
}
