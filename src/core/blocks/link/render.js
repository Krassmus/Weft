// How a link (LinkBlock) is drawn - for the player, the editor's canvas, the thumbnails and the PDF alike: one function, told where it draws. Plain
// JavaScript without imports: this file is inlined verbatim (its "export" taken away) into the exported page ahead of the player
// (core/runtime/buildRuntimeHtml.ts) and imported as a module by the editor (render.d.ts).
//
//   renderLink(root, props, ctx) draws into `root` (an empty element that has the block's size) and returns { update(props), destroy() }.
//
//   mode "play"   a link (an <a>, if the address leads somewhere a link may lead): a click opens it.
//        "edit", "thumbnail"   a picture of one - nothing in it can be used.
//        "print"   the PDF: a picture of one, and where it stands the address is a link (data-pdf-link, see exportPdf.tsx).
//
//   props   { href, label }: where it leads ("": nowhere - see linkHref) and its words in the language that is shown ("": the symbol alone).
//   ctx     { mode, icon, open }: `icon` the SVG of the globe; `open(href)`, where a click cannot open the address itself (the page lives in a
//           sandboxed frame that cannot open a tab: the window around it does that), else absent.
//
// The look is in blocks/link/render.css.

// Where a link leads, or "" when it leads nowhere: only a page (http, https), a mail address or a phone number. Mirrors core/document/linkUrl.ts
// (safeLinkUrl), kept in step by hand - a module is not trusted to hold a safe address.
export function linkHref(url) {
  var text = String(url || "").trim();
  return /^(https?:\/\/|mailto:|tel:)\S/i.test(text) ? text : "";
}

export function renderLink(root, props, ctx) {
  var data = props;
  var live = ctx.mode === "play" && !!data.href;
  var link = document.createElement(live ? "a" : "span");
  link.className = "weft-link";
  var icon = document.createElement("span");
  icon.className = "weft-link-icon";
  icon.innerHTML = ctx.icon || "";
  link.appendChild(icon);
  var text = document.createElement("span");
  text.className = "weft-link-text";
  link.appendChild(text);

  var fill = function () {
    text.textContent = data.label || "";
    text.hidden = !data.label;
    // A link that is only a symbol still needs a name for whoever cannot see it.
    if (live) {
      if (data.label) link.removeAttribute("aria-label");
      else link.setAttribute("aria-label", data.href);
    }
  };
  fill();

  if (live) {
    link.setAttribute("href", data.href);
    // (A page opens in a new tab; a mail or phone link hands over to the program that does it, without an empty tab.)
    if (/^https?:/i.test(data.href)) link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
    if (ctx.open) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        ctx.open(data.href);
      });
    }
  } else if (ctx.mode === "print" && data.href) {
    link.setAttribute("data-pdf-link", data.href);
  }

  root.appendChild(link);
  return {
    // The language changed: the words are drawn again.
    update: function (next) {
      data = next;
      fill();
    },
    destroy: function () {
      if (link.parentNode) link.parentNode.removeChild(link);
    },
  };
}
