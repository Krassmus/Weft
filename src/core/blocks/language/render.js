// How a language switch (LanguageBlock) is drawn - for the player, the editor's canvas, the thumbnails and the PDF alike: one function, told where it
// draws. Plain JavaScript without imports: this file is inlined verbatim (its "export" taken away) into the exported page ahead of the player
// (core/runtime/buildRuntimeHtml.ts) and imported as a module by the editor (render.d.ts).
//
//   renderLanguage(root, props, ctx) draws into `root` (an empty element that has the block's size) and returns { update(props), destroy() }.
//
//   mode "play"   a drop-down of the module's languages, each by its own name: picking one is `ctx.setLanguage`.
//        "edit"   a picture of one - a box with the name of the language the editor shows and an arrow - not a real one: a native drop-down does not
//                 scale with the slide (it keeps a least size of its own and cuts off its words in a small one) and is slow to draw while the slide is
//                 zoomed, and nothing in it could be used here anyway.
//        "thumbnail", "print"   a grey box with a globe: a drop-down means nothing there.
//
//   props   { languages, labels, current }: the module's languages (locales like "de_DE"), how each is called (its name and flag) and the one that
//           is shown now.
//   ctx     { mode, text(key), setLanguage(locale) }: "language" is the word the drop-down is named by (playerStrings.ts) - for whoever cannot see it.
//
// The look is in blocks/language/render.css.

var LANGUAGE_GLOBE = "🌐";

export function renderLanguage(root, props, ctx) {
  var data = props;

  if (ctx.mode === "thumbnail" || ctx.mode === "print") {
    var box = document.createElement("div");
    box.className = "weft-language-placeholder";
    box.textContent = LANGUAGE_GLOBE;
    root.appendChild(box);
    return {
      update: function () {},
      destroy: function () {
        if (box.parentNode) box.parentNode.removeChild(box);
      },
    };
  }

  if (ctx.mode === "edit") {
    var picture = document.createElement("div");
    picture.className = "weft-language-select is-picture";
    var name = document.createElement("span");
    name.className = "weft-language-select-name";
    var arrow = document.createElement("span");
    arrow.className = "weft-language-select-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "▾";
    picture.appendChild(name);
    picture.appendChild(arrow);
    // (A module that has no languages any more still has the block: a globe says what it was for.)
    var fillName = function () {
      name.textContent = data.labels[data.current] || (data.languages.length === 0 ? LANGUAGE_GLOBE : data.current);
    };
    fillName();
    root.appendChild(picture);
    return {
      update: function (next) {
        data = next;
        fillName();
      },
      destroy: function () {
        if (picture.parentNode) picture.parentNode.removeChild(picture);
      },
    };
  }

  var select = document.createElement("select");
  select.className = "weft-language-select";
  select.setAttribute("aria-label", ctx.text("language"));
  data.languages.forEach(function (locale) {
    var option = document.createElement("option");
    option.value = locale;
    option.textContent = data.labels[locale] || locale;
    select.appendChild(option);
  });
  select.value = data.current;
  select.addEventListener("change", function () {
    ctx.setLanguage(select.value);
  });
  root.appendChild(select);

  return {
    // The language was changed (by this switch or another): it shows the new one, and is named in it.
    update: function (next) {
      data = next;
      select.setAttribute("aria-label", ctx.text("language"));
      select.value = next.current;
    },
    destroy: function () {
      if (select.parentNode) select.parentNode.removeChild(select);
    },
  };
}
