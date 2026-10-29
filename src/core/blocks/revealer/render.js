// How a revealer (RevealerBlock) is drawn - for the player, the editor's canvas, the thumbnails and the PDF alike: one function, told where it draws.
// Plain JavaScript without imports: this file is inlined verbatim (its "export" taken away) into the exported page ahead of the player
// (core/runtime/buildRuntimeHtml.ts) and imported as a module by the editor (render.d.ts).
//
//   renderRevealer(root, props, ctx) makes `root` - the element that has the block's place - the revealer: an icon that is a square, and the window that
//   opens around it. It returns { button, open(), close(), update(props), destroy() }. `root` is given the size of the icon, and the window stands outside of
//   it (the window is placed by the icon: at its right unless it would leave the slide there, moved up as far as it needs to at the bottom).
//
//   props   what the block says, in the language that is shown: { id, size, x, iconSvg, signColor, color, title, body, imageSrc, imageAlt, windowStyle,
//           button, open } -
//           size            the side of the icon in cqw (as large as fits in the block's box: the place that knows the slide's shape works it out)
//           x               where the block stands, in percent of the slide's width (the window goes to the left of the icon near the right edge)
//           iconSvg, signColor   the picture of the icon, and the colour of the sign on it (core/runtime/revealerGeometry.js)
//           color           the colour of the icon: the button of the window has it too
//           title, body, imageSrc, imageAlt   the words of the window - the body is plain text (lines kept) - and its picture (null: none)
//           windowStyle     "dark" | "light"
//           button          { text } for the button of the window, null for none
//           open            a picture only: the window stands open in it (the canvas shows it while the block is selected)
//   ctx     { mode, text(key), opened(), announce(text) }: "revealerOpen" and "revealerClose" are the words the icon and the x are named by; `opened()` says the
//           icon was clicked to open the window (what follows - the event of the graph - is the place's); `announce` says what the window holds to those
//           who cannot see it.
//   button  the button of the window, if it has one: what a click on it does is the player's (it adds its own listener).
//
//   mode "play"   the icon is a real button that opens and closes the window; the window closes with its x and with Escape.
//        "edit", "thumbnail", "print"   a picture: the icon is drawn as a <div>, nothing can be used - and the window only where `open` is set.
//
// The look is in blocks/revealer/render.css.

// The width of the window as a share of the slide's width, and how far it reaches around the icon (kept in step with render.css).
var REVEALER_WINDOW_WIDTH_CQW = 28;
var REVEALER_PAD_CQW = 1.4;

export function renderRevealer(root, props, ctx) {
  var live = ctx.mode === "play";
  var data = props;
  var before = root.style.cssText;
  root.classList.add("weft-block-revealer");
  // The icon is a square as large as fits in the block's box - at its top left; the window opens around it.
  root.style.width = data.size + "cqw";
  root.style.height = data.size + "cqw";
  var panelId = "weft-revealer-" + data.id;
  var isOpen = false;

  var icon = document.createElement(live ? "button" : "div");
  icon.className = "weft-revealer-icon" + (live ? "" : " is-picture");
  if (live) {
    icon.setAttribute("type", "button");
    icon.setAttribute("aria-expanded", "false");
    icon.setAttribute("aria-controls", panelId);
  }
  icon.innerHTML = data.iconSvg;

  var panel = document.createElement("div");
  panel.className = "weft-revealer-panel is-" + (data.windowStyle === "light" ? "light" : "dark") + (live ? "" : " is-picture");
  panel.id = panelId;
  if (live) panel.setAttribute("role", "region");
  panel.setAttribute("hidden", "");
  var closeButton = document.createElement("button");
  closeButton.setAttribute("type", "button");
  closeButton.className = "weft-revealer-close";
  closeButton.appendChild(document.createTextNode("×"));
  var heading = document.createElement("h2");
  heading.className = "weft-revealer-title";
  var bodyText = document.createElement("p");
  bodyText.className = "weft-revealer-text";
  var picture = null;
  if (data.imageSrc !== null && data.imageSrc !== undefined) {
    picture = document.createElement("img");
    picture.className = "weft-revealer-image";
    picture.setAttribute("src", data.imageSrc);
    // (Once it is there the window may be taller than it was.)
    picture.addEventListener("load", function () {
      if (isOpen) place();
    });
  }
  var action = null;
  if (data.button) {
    action = document.createElement("button");
    action.setAttribute("type", "button");
    action.className = "weft-revealer-button";
    action.style.background = data.color;
    action.style.color = data.signColor;
  }
  panel.appendChild(closeButton);
  panel.appendChild(heading);
  panel.appendChild(bodyText);
  if (picture) panel.appendChild(picture);
  if (action) {
    var actions = document.createElement("div");
    actions.className = "weft-revealer-actions";
    actions.appendChild(action);
    panel.appendChild(actions);
  }
  if (!live) {
    // A picture: nothing in it can be focused or pressed.
    closeButton.tabIndex = -1;
    if (action) action.tabIndex = -1;
  }

  var fill = function () {
    heading.textContent = data.title;
    bodyText.textContent = data.body;
    bodyText.hidden = !String(data.body || "").trim();
    panel.setAttribute("aria-label", data.title);
    if (live) {
      icon.setAttribute("aria-label", ctx.text("revealerOpen") + (data.title ? ": " + data.title : ""));
      closeButton.setAttribute("aria-label", ctx.text("revealerClose"));
    }
    if (picture) picture.setAttribute("alt", data.imageAlt || "");
    if (action) action.textContent = data.button ? data.button.text : "";
  };
  fill();

  // On the side of the icon that has room: the window stands at the right of the icon unless it would leave the slide there (then at its left), and is
  // moved up as far as it needs to when it would leave the slide at the bottom.
  function place() {
    var overflowRight = data.x + REVEALER_WINDOW_WIDTH_CQW - REVEALER_PAD_CQW > 100;
    panel.classList.toggle("is-right", overflowRight);
    panel.style.top = "";
    // (The slide: where the player is, the block's own parent; on the canvas the slide around the block.)
    var stage = live ? root.parentNode : root.closest ? root.closest(".weft-stage-edit, .weft-stage") : null;
    if (!stage || !stage.getBoundingClientRect) return;
    var stageRect = stage.getBoundingClientRect();
    var panelRect = panel.getBoundingClientRect();
    var overflow = panelRect.bottom - stageRect.bottom;
    if (overflow > 0) panel.style.top = "calc(" + -REVEALER_PAD_CQW + "cqw - " + Math.round(overflow) + "px)";
  }
  function setOpen(next) {
    if (next === isOpen) return;
    isOpen = next;
    panel.hidden = !next;
    root.classList.toggle("is-open", next);
    if (live) icon.setAttribute("aria-expanded", next ? "true" : "false");
    if (next) {
      place();
      if (live) ctx.announce([heading.textContent, bodyText.textContent].filter(Boolean).join(". "));
    } else if (live && root.contains(document.activeElement) && document.activeElement !== icon) {
      icon.focus();
    }
  }

  if (live) {
    // A click on the icon opens the window (and is then the event of the graph as well: `opened()`), or closes it when it is open.
    icon.addEventListener("click", function () {
      if (isOpen) setOpen(false);
      else {
        setOpen(true);
        ctx.opened();
      }
    });
    closeButton.addEventListener("click", function () {
      setOpen(false);
    });
    root.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && isOpen) {
        ev.stopPropagation();
        setOpen(false);
        icon.focus();
      }
    });
  }

  root.appendChild(icon);
  root.appendChild(panel);
  if (!live && data.open) setOpen(true);

  return {
    button: action,
    // A trigger to its event opens the window.
    open: function () {
      setOpen(true);
    },
    close: function () {
      setOpen(false);
    },
    // The language changed (or the words did): the words are drawn again.
    update: function (next) {
      data = next;
      fill();
    },
    destroy: function () {
      root.classList.remove("weft-block-revealer", "is-open");
      root.style.cssText = before;
      root.replaceChildren();
    },
  };
}
