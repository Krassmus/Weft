// How a language switch (LanguageBlock) is drawn - for the player, the editor's canvas, the thumbnails and the PDF alike: one function, told where it
// draws. Plain JavaScript without imports: this file is inlined verbatim (its "export" taken away) into the exported page ahead of the player
// (core/runtime/buildRuntimeHtml.ts) and imported as a module by the editor (render.d.ts).
//
//   renderLanguage(root, props, ctx) draws into `root` (an empty element that has the block's size) and returns { update(props), destroy() }.
//
//   mode "play"   a drop-down of the module's languages, each by its own name: picking one is `ctx.setLanguage`.
//        "edit"   the same, showing the language the editor shows - a picture of it: nothing in it can be used.
//        "thumbnail", "print"   a grey box with a globe: a drop-down means nothing there.
//
//   props   { languages, labels, current }: the module's languages (locales like "de_DE"), how each is called (its name and flag) and the one that
//           is shown now.
//   ctx     { mode, text(key), setLanguage(locale) }: "language" is the word the drop-down is named by (playerStrings.ts) - for whoever cannot see it.
//
// The look is in blocks/language/render.css.

export function renderLanguage(root, props, ctx) {
  var data = props;

  if (ctx.mode === "thumbnail" || ctx.mode === "print") {
    var box = document.createElement("div");
    box.className = "weft-language-placeholder";
    box.textContent = "🌐";
    root.appendChild(box);
    return {
      update: function () {},
      destroy: function () {
        if (box.parentNode) box.parentNode.removeChild(box);
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
  // (A module that has no languages any more still has the block: a globe says what it was for.)
  if (data.languages.length === 0) {
    var none = document.createElement("option");
    none.textContent = "🌐";
    select.appendChild(none);
  }
  select.value = data.current;
  if (ctx.mode === "play") {
    select.addEventListener("change", function () {
      ctx.setLanguage(select.value);
    });
  } else {
    select.tabIndex = -1;
  }
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
