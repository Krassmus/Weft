// Stand-alone player for an exported Weft module. No imports, no build step: this file is
// inlined verbatim into the exported index.html (and into the editor's live-preview iframe)
// by core/runtime/buildRuntimeHtml.ts, so it has to run as plain ES2017 in a sandboxed iframe
// with nothing but the DOM. Keep the message shapes in sync with core/lms/protocol.ts by hand.
(function () {
  "use strict";

  var dataEl = document.getElementById("weft-data");
  var module = JSON.parse(dataEl.textContent);

  var assetUrlOverridesEl = document.getElementById("weft-asset-urls");
  var assetUrlOverrides = assetUrlOverridesEl ? JSON.parse(assetUrlOverridesEl.textContent || "{}") : {};
  // Keeps the ids inside the SVG of a masked picture apart when the same block is drawn again (see imageSvgMarkup).
  var imageInstanceCounter = 0;

  var qrCodeSvgsEl = document.getElementById("weft-qr-codes");
  var qrCodeSvgs = qrCodeSvgsEl ? JSON.parse(qrCodeSvgsEl.textContent || "{}") : {};
  // TeX blocks arrive already typeset to HTML (buildRuntimeHtml.ts), keyed by block id - the player
  // itself needs no KaTeX script, just the (conditionally embedded) KaTeX stylesheet.
  // Code blocks likewise arrive highlighted (highlight.js ran at export time), keyed by block id.
  // Formulas of "computed" variables, already parsed to syntax trees (buildRuntimeHtml.ts), keyed by
  // variable id - see evalExpression.
  var computedEl = document.getElementById("weft-computed");
  var computed = computedEl ? JSON.parse(computedEl.textContent || "{}") : {};
  // The module's languages (locales like "de_DE", the first being the default), how each is labelled in
  // the language switch (its own name and flag, made at export - buildRuntimeHtml.ts), and - in the
  // editor's preview only - the language to start in.
  var languages = module.languages || [];
  var languageLabelsEl = document.getElementById("weft-languages");
  var languageLabels = languageLabelsEl ? JSON.parse(languageLabelsEl.textContent || "{}") : {};
  // The player's own fixed texts per language (see core/i18n/playerStrings.ts) - made at export for
  // exactly the module's languages ("" = no languages: German).
  var uiStringsEl = document.getElementById("weft-ui-strings");
  var uiStrings = uiStringsEl ? JSON.parse(uiStringsEl.textContent || "{}") : {};
  var startLanguageEl = document.getElementById("weft-start-language");
  var startLanguage = startLanguageEl ? JSON.parse(startLanguageEl.textContent || "null") : null;
  var codeHtmlEl = document.getElementById("weft-code-html");
  var codeHtml = codeHtmlEl ? JSON.parse(codeHtmlEl.textContent || "{}") : {};
  var texHtmlEl = document.getElementById("weft-tex-html");
  var texHtml = texHtmlEl ? JSON.parse(texHtmlEl.textContent || "{}") : {};
  // The kinds of block nothing of which is seen (a logic block): their descriptors say (core/blocks/registry.ts isInvisibleKind).
  var invisibleKindsEl = document.getElementById("weft-invisible-kinds");
  var invisibleKinds = invisibleKindsEl ? JSON.parse(invisibleKindsEl.textContent || "[]") : [];

  // A picture of a page for somebody who does not play it (cli/render.ts: weft render, the MCP tool weft_render): { all: true } shows
  // the page with everything on it - no Aufbau/Abbau waits for its event - and keeps it from going on by itself.
  var renderModeEl = document.getElementById("weft-render-mode");
  var renderMode = renderModeEl ? JSON.parse(renderModeEl.textContent || "null") : null;
  var renderAll = !!(renderMode && renderMode.all);

  // The presenter view (features/presenter/) shows the module on the presenter's own screen in instances that only follow: no sound,
  // no animations, no navigation of their own.
  var followerEl = document.getElementById("weft-follower");
  var follower = !!(followerEl && JSON.parse(followerEl.textContent || "false"));

  var startPageIdEl = document.getElementById("weft-start-page");
  var startPageId = startPageIdEl ? JSON.parse(startPageIdEl.textContent || "null") : null;

  // ---- variable state (runtime-only; never written back into the document) ----
  var variables = {};
  module.variables.forEach(function (v) {
    variables[v.id] = v.initialValue;
  });

  function variableByName(name) {
    return module.variables.filter(function (v) {
      return v.name === name;
    })[0];
  }

  function applyEffect(effect) {
    var target = module.variables.filter(function (v) {
      return v.id === effect.variableId;
    })[0];
    // A computed variable has no stored value to change.
    if (target && isComputedDef(target)) return;
    var before = variables[effect.variableId];
    if (effect.op === "set") variables[effect.variableId] = effect.value;
    else if (effect.op === "add") variables[effect.variableId] = (Number(before) || 0) + effect.value;
    else if (effect.op === "append") variables[effect.variableId] = String(before || "") + effect.value;
    if (variables[effect.variableId] !== before) {
      var def = module.variables.filter(function (v) {
        return v.id === effect.variableId;
      })[0];
      refreshVariableDisplays();
      syncLms();
      checkConditions();
    }
  }

  // ---- computed variables ----
  // A computed variable (the "Berechnet" type, or the built-in `success` with a formula) is never
  // stored: its value is worked out from its syntax tree every time it's read, so it always reflects
  // the variables it depends on. Reading one that is currently being worked out (a circle of
  // formulas) gives false rather than looping.
  var evaluating = {};

  function isComputedDef(def) {
    return Object.prototype.hasOwnProperty.call(computed, def.id);
  }

  function variableValue(def) {
    if (!isComputedDef(def)) return variables[def.id];
    var tree = computed[def.id];
    if (!tree || evaluating[def.id]) return false;
    evaluating[def.id] = true;
    try {
      var result = evalExpression(tree);
    } finally {
      delete evaluating[def.id];
    }
    // The built-in `success` is a Ja/Nein even when computed; any other "Berechnet" variable is whatever its formula yields.
    return def.fixed ? truthy(result) : result;
  }

  function truthy(x) {
    if (typeof x === "boolean") return x;
    if (typeof x === "number") return x !== 0 && !isNaN(x);
    if (typeof x === "string") {
      var s = x.trim().toLowerCase();
      return s !== "" && s !== "false" && s !== "nein" && s !== "0";
    }
    return false;
  }

  // The number a value stands for, or null if it has none (a non-numeric text).
  function numericOrNull(x) {
    if (typeof x === "number") return x;
    if (typeof x === "boolean") return x ? 1 : 0;
    if (typeof x === "string" && x.trim() !== "" && !isNaN(Number(x))) return Number(x);
    return null;
  }

  function toNumber(x) {
    var n = numericOrNull(x);
    return n === null ? 0 : n;
  }

  function looseEquals(a, b) {
    if (typeof a === typeof b) return a === b;
    if (typeof a === "boolean" || typeof b === "boolean") return truthy(a) === truthy(b);
    var na = numericOrNull(a);
    var nb = numericOrNull(b);
    if (na !== null && nb !== null) return na === nb;
    return String(a) === String(b);
  }

  // Negative / zero / positive: numerically when both sides are numbers (or numeric texts), else as text.
  function compareValues(a, b) {
    var na = numericOrNull(a);
    var nb = numericOrNull(b);
    if (na !== null && nb !== null) return na - nb;
    var sa = String(a);
    var sb = String(b);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }

  // Evaluates a syntax tree made by core/document/expressions.ts (see its header for the language).
  function evalExpression(node) {
    switch (node.t) {
      case "num":
      case "str":
      case "bool":
        return node.v;
      case "var": {
        var current = variableValueByName(node.n);
        return current ? current.value : false;
      }
      case "not":
        return !truthy(evalExpression(node.a));
      case "neg":
        return -toNumber(evalExpression(node.a));
      case "bin": {
        // Like JavaScript's && and ||: the result is one of the two operands, not necessarily a boolean.
        if (node.op === "and") {
          var left = evalExpression(node.a);
          return truthy(left) ? evalExpression(node.b) : left;
        }
        if (node.op === "or") {
          var first = evalExpression(node.a);
          return truthy(first) ? first : evalExpression(node.b);
        }
        var a = evalExpression(node.a);
        var b = evalExpression(node.b);
        switch (node.op) {
          case "==":
            return looseEquals(a, b);
          case "!=":
            return !looseEquals(a, b);
          // === and !== need the same type as well as the same value, as in JavaScript.
          case "===":
            return a === b;
          case "!==":
            return a !== b;
          case "<":
            return compareValues(a, b) < 0;
          case "<=":
            return compareValues(a, b) <= 0;
          case ">":
            return compareValues(a, b) > 0;
          case ">=":
            return compareValues(a, b) >= 0;
          case "+":
            return typeof a === "string" || typeof b === "string" ? String(a) + String(b) : toNumber(a) + toNumber(b);
          case "-":
            return toNumber(a) - toNumber(b);
          case "*":
            return toNumber(a) * toNumber(b);
          case "/":
            return toNumber(b) === 0 ? 0 : toNumber(a) / toNumber(b);
          case "%":
            return toNumber(b) === 0 ? 0 : toNumber(a) % toNumber(b);
          case "**": {
            var power = Math.pow(toNumber(a), toNumber(b));
            return isFinite(power) ? power : 0;
          }
        }
        return false;
      }
      case "cond":
        return truthy(evalExpression(node.c)) ? evalExpression(node.a) : evalExpression(node.b);
      case "call": {
        if (node.f === "if") return truthy(evalExpression(node.args[0])) ? evalExpression(node.args[1]) : evalExpression(node.args[2]);
        var numbers = node.args.map(function (arg) {
          return toNumber(evalExpression(arg));
        });
        if (node.f === "min") return Math.min.apply(null, numbers);
        if (node.f === "max") return Math.max.apply(null, numbers);
        if (node.f === "round") return Math.round(numbers[0]);
        if (node.f === "floor") return Math.floor(numbers[0]);
        if (node.f === "ceil") return Math.ceil(numbers[0]);
        if (node.f === "abs") return Math.abs(numbers[0]);
        return false;
      }
    }
    return false;
  }

  // ---- languages ----
  // A multilingual module (module.languages non-empty) shows each text in `currentLanguage`: the first
  // language's wording IS the block's own fields, every other one's is in block.translations[locale]
  // (only the fields that were translated - the rest falls back to the default wording). Mirrors
  // core/document/translations.ts, kept in sync by hand. `userlanguage` is the current language as a
  // virtual variable; a language switch block changes it - texts are refilled in place (see
  // languageRefreshers), so nothing else on the slide (a half-answered quiz, revealed builds) is lost.
  function pickInitialLanguage() {
    if (languages.length === 0) return null;
    if (startLanguage && languages.indexOf(startLanguage) !== -1) return startLanguage;
    var preferred = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
    for (var i = 0; i < preferred.length; i++) {
      var wanted = String(preferred[i]).replace("-", "_");
      if (languages.indexOf(wanted) !== -1) return wanted;
      var base = wanted.split("_")[0];
      for (var j = 0; j < languages.length; j++) {
        if (languages[j].split("_")[0] === base) return languages[j];
      }
    }
    return languages[0];
  }

  var currentLanguage = pickInitialLanguage();
  if (currentLanguage) document.documentElement.setAttribute("lang", currentLanguage.split("_")[0]);

  // The block's wording in a non-default language, if the current one is such and has any.
  function currentTranslation(block) {
    if (!currentLanguage || currentLanguage === languages[0] || !block.translations) return undefined;
    return block.translations[currentLanguage];
  }

  function blockHtml(block) {
    var t = currentTranslation(block);
    return t && t.html !== undefined ? t.html : block.html;
  }

  function listItemHtml(block, item) {
    var t = currentTranslation(block);
    return t && t.items && t.items[item.id] !== undefined ? t.items[item.id] : item.html;
  }

  function quizQuestionHtml(block) {
    var t = currentTranslation(block);
    return t && t.questionHtml !== undefined ? t.questionHtml : block.questionHtml;
  }

  function quizExplanationText(block) {
    var t = currentTranslation(block);
    return t && t.explanation !== undefined ? t.explanation : block.explanation || "";
  }

  function quizOptionHtml(block, option) {
    var t = currentTranslation(block);
    return t && t.options && t.options[option.id] !== undefined ? t.options[option.id] : option.html;
  }

  function buttonLabel(block) {
    var t = currentTranslation(block);
    return (t && t.text !== undefined ? t.text : block.text) || uiString("next");
  }

  // The label of a button with its formatting (core/document/translations.ts's buttonHtml): a label that was never formatted is
  // its plain text.
  function buttonLabelHtml(block) {
    var t = currentTranslation(block);
    if (t && t.html !== undefined) return t.html;
    if (t && t.text !== undefined) return escapeText(t.text);
    if (block.html !== undefined) return block.html;
    return escapeText(block.text || "");
  }

  function escapeText(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Blur what is behind a block (core/document/backdropBlur.ts: keep them in step).
  function backdropBlurStyle() {
    return "-webkit-backdrop-filter:blur(2cqw);backdrop-filter:blur(2cqw);";
  }

  // The corners of a rectangle's blur, as the shape draws them (backdropBlur.ts's shapeCornerCss).
  function shapeBlurCorners(block) {
    if (block.shapeKind === "ellipse") return "50%";
    var shorter = Math.min(block.position.width, block.position.height / slideAspectNumeric());
    var r = block.cornerRadii || {};
    return [r.topLeft, r.topRight, r.bottomRight, r.bottomLeft]
      .map(function (percent) {
        return Math.round(((percent || 0) / 100) * shorter * 1000) / 1000 + "cqw";
      })
      .join(" ");
  }

  // One of the player's own fixed texts in the current language.
  function uiString(key) {
    var strings = uiStrings[currentLanguage || ""] || uiStrings[""] || {};
    return strings[key] || "";
  }

  // Same, with {n}, {total} ... filled in.
  function uiStringWith(key, values) {
    return uiString(key).replace(/\{(\w+)\}/g, function (all, name) {
      return values && values[name] !== undefined ? String(values[name]) : all;
    });
  }

  // ---- accessibility ----
  // Learners who ask their system for less motion get no animation: slide transitions and the Aufbau/Abbau of blocks are
  // instant cuts (the events still happen in the same order). Looked up each time - the setting can change while the module runs.
  function prefersReducedMotion() {
    if (follower) return true;
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  // A polite live region for screen readers (visually hidden): what appears on Weiter, a quiz's result, the new slide. Each message is its
  // own element - one that is added is read, also when it is the same text as the one before - and goes again after a while.
  var liveRegion = null;
  function announce(text) {
    if (!liveRegion || !text) return;
    var message = document.createElement("div");
    message.textContent = text;
    liveRegion.appendChild(message);
    setTimeout(function () {
      if (message.parentNode) message.parentNode.removeChild(message);
    }, 6000);
  }

  // What a block says, for the announcement of an element that has just appeared: its words (an image: its alternative text; a
  // formula: its MathML text; nothing for what has no words - a shape, a video).
  function speechOfBlock(wrap, block) {
    var text = "";
    if (block.kind === "image") text = block.alt || "";
    else if (block.kind === "tex") {
      var mathml = wrap.querySelector(".katex-mathml");
      text = mathml ? mathml.textContent : block.tex || "";
    } else if (block.kind === "text" || block.kind === "list" || block.kind === "quiz" || block.kind === "cloze" || block.kind === "button" || block.kind === "link" || block.kind === "checker" || block.kind === "matching" || block.kind === "sort" || block.kind === "code") {
      text = wrap.textContent || "";
    }
    text = String(text).replace(/\s+/g, " ").trim();
    return text.length > 400 ? text.slice(0, 399) + "\u2026" : text;
  }
  // True while Weiter is being delivered: an element that appears then is announced (the learner asked for it and cannot see it).
  var announceAppearing = false;

  // The navigation for people who cannot use Space and the arrow keys: a screen reader keeps those for itself in its reading mode, and a
  // keyboard user may not know them. Real buttons, visually hidden until they have the focus (like a skip link); the same as Space and ←.
  var navElement = null;
  var navPrev = null;
  var navNext = null;
  function buildNavigation() {
    if (renderAll || follower) return;
    navPrev = el("button", { type: "button", class: "weft-sr-nav-button" }, []);
    navNext = el("button", { type: "button", class: "weft-sr-nav-button" }, []);
    navPrev.addEventListener("click", goPrev);
    navNext.addEventListener("click", function () {
      if (pos >= history.length) restart();
      else weiter();
    });
    navElement = el("nav", { class: "weft-sr-nav" }, [navPrev, navNext]);
    document.body.appendChild(navElement);
    liveRegion = el("div", { class: "weft-sr-live", "aria-live": "polite", "aria-atomic": "false", role: "status" }, []);
    document.body.appendChild(liveRegion);
  }
  function updateNavigation() {
    if (!navElement) return;
    // A module whose keyboard navigation is switched off may only be left by its own buttons: no Weiter for anyone.
    navElement.hidden = module.keyboardNavigationEnabled === false;
    navElement.setAttribute("aria-label", uiString("navigation"));
    navPrev.textContent = uiString("previous");
    navPrev.disabled = pos <= 0;
    navNext.textContent = uiString(pos >= history.length ? "restart" : "next");
  }
  var baseTitle = document.title;
  var firstRender = true;
  // After every slide: the navigation is up to date, the title says where we are, and a screen reader is told about the new slide - by
  // moving the focus to it when the focus was on something that is gone (a button of the old slide), else by announcing it.
  function announceSlide(wrap) {
    updateNavigation();
    var label = pos >= history.length ? uiString("done") : uiStringWith("slide", { n: pos + 1 });
    document.title = baseTitle ? baseTitle + " \u2013 " + label : label;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", label);
    // (A follower must not take the keyboard focus from the window around it.)
    if (follower) return;
    if (firstRender) {
      firstRender = false;
      return;
    }
    var active = document.activeElement;
    var focusKept = active && active !== document.body && active !== document.documentElement && document.body.contains(active) && !wrap.contains(active);
    if (focusKept) {
      announce(label);
    } else {
      wrap.setAttribute("tabindex", "-1");
      wrap.focus({ preventScroll: true });
    }
  }

  // Functions that refill the texts of the blocks on the page being shown, and the language
  // switches on it - both reset with every page (see renderStage), like every other page-scoped list.
  var languageRefreshers = [];
  // The blocks of the slide on show (the layout's and the page's), for getBlock in a logic block's code; and, by the id of a quiz, what a script can do with it.
  var stageBlocks = [];
  var quizHandles = {};
  var languageSwitches = [];

  // What a language switch says (renderLanguage, blocks/language/render.js, inlined ahead of this file): the module's languages, their names, the one in use.
  function languageProps() {
    return { languages: languages, labels: languageLabels, current: currentLanguage };
  }

  function setLanguage(locale) {
    if (locale === currentLanguage || languages.indexOf(locale) === -1) return;
    currentLanguage = locale;
    document.documentElement.setAttribute("lang", locale.split("_")[0]);
    languageRefreshers.forEach(function (refill) {
      refill();
    });
    languageSwitches.forEach(function (languageSwitch) {
      languageSwitch.update(languageProps());
    });
    refreshVariableDisplays();
    updateNavigation();
    syncLms();
  }

  // ---- {{variable}} placeholders in texts ----
  // Matched per TEXT NODE, never across element boundaries: a name with formatting in the middle
  // ({{meine<b>variable</b>}}) is split over several nodes and so simply isn't recognised - it
  // stays as literal text (the editor warns about it, see core/document/variablePlaceholders.ts,
  // which has to stay in sync with this pattern). Formatting around the WHOLE placeholder works,
  // since the replacement span lands inside whatever formatting wrapped the original text.
  // Unknown names are left as they are, so a typo is visible in the preview rather than blank.
  // ---- virtual variables ----
  // Always available in {{placeholders}}, never stored or declared (see
  // core/document/virtualVariables.ts for the list the editor shows - keep the names in sync). A
  // variable the author declared under the same name wins, so an older module that already uses
  // e.g. "progress" for its own purposes keeps working unchanged.
  //
  // progress = round up(visited / (visited + remaining) * 100): "visited" is the pages on the path
  // taken up to and including the one showing (so the last page reads 100), "remaining" the most
  // pages that can still follow it - along the rest of its own branch, then the longest branch of
  // every logic block still ahead. (core/document/pageProgress.ts works the same sum out without playing, for the PDF and the editor:
  // keep the two in step.)
  function isJumpPage(pageId) {
    return !!(module.pages[pageId] && module.pages[pageId].jump);
  }

  function remainingPages() {
    var pageId = history[pos];
    var location = pageId ? findStartCursor(pageId) : null;
    if (!location) return 0;
    var remaining = 0;
    if (location.branch) {
      for (var r = location.branch.pos + 1; r < location.branch.pages.length; r++) if (!isJumpPage(location.branch.pages[r])) remaining++;
    }
    for (var i = location.topIndex + 1; i < module.sequence.length; i++) {
      var node = module.sequence[i];
      if (node.kind === "page") {
        if (!isJumpPage(node.pageId)) remaining++;
        continue;
      }
      var longest = 0;
      module.logicBlocks[node.logicBlockId].branches.forEach(function (branch) {
        longest = Math.max(longest, branch.pageIds.filter(function (id) { return !isJumpPage(id); }).length);
      });
      remaining += longest;
    }
    return remaining;
  }

  function progressValue() {
    var visited = Math.min(pos + 1, history.length);
    if (visited <= 0) return 0;
    return Math.ceil((visited * 100) / (visited + remainingPages()));
  }

  // The current value of a variable by name (declared, else virtual), or null if there is none.
  function variableValueByName(name) {
    var def = variableByName(name);
    if (def) return { value: variableValue(def) };
    if (name === "progress") return { value: progressValue() };
    if (name === "userlanguage" && languages.length > 0) return { value: currentLanguage };
    return null;
  }

  var VARIABLE_PLACEHOLDER = /\{\{([^{}<>]*)\}\}/g;

  function formatVariableValue(value) {
    return String(value);
  }

  function applyVariablesToNode(root) {
    // A picture behind letters (the dialog "Schrift" of the editor): the text stores its asset's id.
    var behindLetters = root.querySelectorAll ? root.querySelectorAll("[data-weft-bg-asset]") : [];
    for (var b = 0; b < behindLetters.length; b++) {
      behindLetters[b].style.backgroundImage = 'url("' + assetSrc(behindLetters[b].getAttribute("data-weft-bg-asset")) + '")';
    }
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(function (textNode) {
      var text = textNode.nodeValue;
      VARIABLE_PLACEHOLDER.lastIndex = 0;
      if (!VARIABLE_PLACEHOLDER.test(text)) return;
      var fragment = document.createDocumentFragment();
      var last = 0;
      VARIABLE_PLACEHOLDER.lastIndex = 0;
      var match;
      while ((match = VARIABLE_PLACEHOLDER.exec(text))) {
        var name = match[1].trim();
        var current = variableValueByName(name);
        if (!current) continue;
        if (match.index > last) fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
        var span = document.createElement("span");
        span.className = "weft-var";
        span.setAttribute("data-weft-var", name);
        span.textContent = formatVariableValue(current.value);
        fragment.appendChild(span);
        last = match.index + match[0].length;
      }
      if (last === 0) return;
      if (last < text.length) fragment.appendChild(document.createTextNode(text.slice(last)));
      textNode.parentNode.replaceChild(fragment, textNode);
    });
  }

  // A variable can change while a page is showing (a quiz answer, a logic effect) - every
  // placeholder currently on screen follows.
  function refreshVariableDisplays() {
    var spans = document.querySelectorAll("[data-weft-var]");
    for (var i = 0; i < spans.length; i++) {
      var current = variableValueByName(spans[i].getAttribute("data-weft-var"));
      if (current) spans[i].textContent = formatVariableValue(current.value);
    }
    settleProgressBars();
  }

  // ---- sequence / branch traversal ----
  // Once a logic block is resolved to a branch, that choice is cached in `history` and stays
  // fixed while the learner pages back and forth through it - re-evaluating on every visit
  // would let an earlier answer retroactively change a branch already shown.
  var cursor = { topIndex: 0, branch: null };
  var history = [];
  var pos = -1;
  // The variables - and the place in the sequence/branches - as they were when each page of `history` was entered (same
  // indices): going back to a page takes back what it and everything after it did. An answer given again isn't added on top of
  // the one given before, a score can't be raised by going back and answering again and again, and a logic block after the
  // page is decided anew by the new answer (the pages after it are forgotten until they are visited again).
  var variablesAtEntry = [];
  var cursorAtEntry = [];
  // What the graded elements (quizzes, gap texts) gave, by the place in `history` where they were answered - for the table on the finished
  // screen (see doneSummary). It is taken back with the variables: going back to a page forgets its answers and the ones after it.
  var gradedAtPos = [];

  // Finds where a page lives in the top-level sequence/branch structure - a page inside a branch
  // is pointed at directly (not by evaluating that branch's own condition, which would need
  // variable state nothing has produced yet at startup) so "Abspielen" opens on exactly the
  // slide that was selected, not whichever branch the module would naturally have taken.
  function findStartCursor(pageId) {
    for (var i = 0; i < module.sequence.length; i++) {
      var node = module.sequence[i];
      if (node.kind === "page") {
        if (node.pageId === pageId) return { topIndex: i, branch: null };
        continue;
      }
      var logicBlock = module.logicBlocks[node.logicBlockId];
      for (var b = 0; b < logicBlock.branches.length; b++) {
        var branch = logicBlock.branches[b];
        var branchPos = branch.pageIds.indexOf(pageId);
        if (branchPos !== -1) {
          return { topIndex: i, branch: { logicBlockId: logicBlock.id, branchId: branch.id, pages: branch.pageIds, pos: branchPos } };
        }
      }
    }
    return null;
  }

  if (startPageId) {
    var startCursor = findStartCursor(startPageId);
    if (startCursor) cursor = startCursor;
  }

  // The condition's value is typed into a text field in the editor, so it often arrives as text
  // ("10", "true") for a number or Ja/Nein variable - looseEquals/compareValues compare by what
  // the values mean, not by their JavaScript type.
  function evalCondition(cond) {
    var def = module.variables.filter(function (v) {
      return v.id === cond.variableId;
    })[0];
    if (!def) return false;
    var v = variableValue(def);
    switch (cond.comparator) {
      case "eq":
        return looseEquals(v, cond.value);
      case "neq":
        return !looseEquals(v, cond.value);
      case "gt":
        return compareValues(v, cond.value) > 0;
      case "gte":
        return compareValues(v, cond.value) >= 0;
      case "lt":
        return compareValues(v, cond.value) < 0;
      case "lte":
        return compareValues(v, cond.value) <= 0;
      default:
        return false;
    }
  }

  // if/else-if/else over the branches in order: every branch but the last needs its condition
  // to match; the last branch is always the unconditional "sonst" fallback.
  function pickBranch(logicBlock) {
    var branches = logicBlock.branches;
    for (var i = 0; i < branches.length - 1; i++) {
      if (branches[i].condition && evalCondition(branches[i].condition)) return branches[i];
    }
    return branches[branches.length - 1] || null;
  }

  function resolveCurrentNode() {
    if (cursor.branch) {
      return { type: "page", pageId: cursor.branch.pages[cursor.branch.pos] };
    }
    if (cursor.topIndex >= module.sequence.length) return { type: "end" };
    var node = module.sequence[cursor.topIndex];
    if (node.kind === "page") return { type: "page", pageId: node.pageId };
    var logicBlock = module.logicBlocks[node.logicBlockId];
    var branch = pickBranch(logicBlock);
    if (!branch || branch.pageIds.length === 0) {
      cursor.topIndex++;
      return resolveCurrentNode();
    }
    cursor.branch = { logicBlockId: logicBlock.id, branchId: branch.id, pages: branch.pageIds, pos: 0 };
    return { type: "page", pageId: cursor.branch.pages[0] };
  }

  function advanceCursor() {
    if (cursor.branch) {
      if (cursor.branch.pos + 1 < cursor.branch.pages.length) {
        cursor.branch.pos++;
        return;
      }
      cursor.branch = null;
      cursor.topIndex++;
      return;
    }
    cursor.topIndex++;
  }

  function pageEndTransition(page) {
    var events = (page && page.graph && page.graph.events) || [];
    for (var i = 0; i < events.length; i++) {
      if (events[i].id === "end") return events[i].transition;
    }
    return null;
  }

  function pageTransition(pageId) {
    var page = pageId && module.pages[pageId];
    // A "Nächste Folie" that was reached brings its own transition (see goNext); anything else that goes on (a button block, the
    // keyboard on a finished page) uses the one of the page's own "end".
    var transition = nextTransition || pageEndTransition(page) || { type: "none", durationMs: 500 };
    nextTransition = null;
    // Carries which page is being left, so a transition can look at it (Move's "content only" needs
    // to know whether the next page shares its layout).
    return Object.assign({}, transition, { fromPageId: pageId });
  }

  // A jump page (see PageJump in core/types.ts) is never shown: the learner is sent on at once, to the first of its ways out whose
  // condition holds, else to its default. The page it names has to be part of the module; a way out that leads nowhere any more
  // (the page was deleted) is skipped.
  function jumpTarget(page) {
    var targets = page.jump.targets || [];
    for (var i = 0; i < targets.length; i++) {
      if (findStartCursor(targets[i].pageId) && evalCondition(targets[i].condition)) return targets[i].pageId;
    }
    var fallback = page.jump.defaultPageId;
    return fallback && findStartCursor(fallback) ? fallback : null;
  }

  // Follows jump pages from `node` to the page that is really shown (or the end). The cursor moves along: the sequence goes on
  // after the page that was jumped to. A jump page with nowhere to go is passed over; so is one after too many jumps in a row (a
  // loop the author made), so that such a module ends instead of hanging.
  function resolveJumps(node) {
    var jumps = 0;
    while (node.type === "page" && module.pages[node.pageId] && module.pages[node.pageId].jump) {
      var destination = jumps < 25 ? jumpTarget(module.pages[node.pageId]) : null;
      jumps++;
      var place = destination ? findStartCursor(destination) : null;
      if (place) {
        cursor = place;
        node = { type: "page", pageId: destination };
      } else {
        advanceCursor();
        node = resolveCurrentNode();
      }
    }
    return node;
  }

  // Next page; `transition` (the one of the "Nächste Folie" event that was reached) overrides the transition of the page.
  // Event listeners must not pass their event as that argument - see goNextPage for those.
  function goNext(transition) {
    if (transition && typeof transition === "object" && typeof transition.durationMs === "number") nextTransition = transition;
    goNextPage();
  }
  var nextTransition = null;

  function goNextPage() {
    // (A picture of the page: it stays where it is.)
    if (renderAll && pos >= 0) return;
    // Captured before `pos` moves - this is the page being left, whose own transition (see
    // TransitionPanel.tsx) animates the swap to whatever renders next, in every branch below.
    // Still correct for pos === -1 (no page shown yet, e.g. the very first goNext() call at
    // startup) - pageTransition(null) falls back to "none", and render() only ever animates when
    // there's also already a rendered stage to animate away from (see animateTransition).
    var outgoing = pos >= 0 && pos < history.length ? history[pos] : null;
    if (pos < history.length - 1) {
      pos++;
      render(pageTransition(outgoing));
      return;
    }
    if (history.length > 0) advanceCursor();
    var node = resolveJumps(resolveCurrentNode());
    if (node.type === "end") {
      pos = history.length; // one past the last page: the "finished" state
      render(pageTransition(outgoing));
      return;
    }
    variablesAtEntry[history.length] = Object.assign({}, variables);
    cursorAtEntry[history.length] = JSON.parse(JSON.stringify(cursor));
    history.push(node.pageId);
    pos = history.length - 1;
    render(pageTransition(outgoing));
  }

  // The page `pageId`, wherever it is in the module (a button whose action is "goto"): the way on from there is the one after that
  // page, as with a jump page (see resolveJumps). Pages that were shown after the current one on a way back are forgotten. A page
  // that is not part of the module (it was deleted) leaves everything as it is.
  function goToPage(pageId, transition) {
    var place = pageId ? findStartCursor(pageId) : null;
    if (!place) return;
    var outgoing = pos >= 0 && pos < history.length ? history[pos] : null;
    // A jump of a logic block names the transition itself (see jump in runScript); otherwise it is the one of the page being left.
    var leaving = function () {
      if (!transition) return pageTransition(outgoing);
      nextTransition = null;
      return Object.assign({}, transition, { fromPageId: outgoing });
    };
    var keep = Math.min(pos + 1, history.length);
    history.length = keep;
    variablesAtEntry.length = keep;
    cursorAtEntry.length = keep;
    gradedAtPos.length = Math.min(gradedAtPos.length, keep);
    cursor = place;
    var node = resolveJumps({ type: "page", pageId: pageId });
    if (node.type === "end") {
      pos = history.length;
      render(leaving());
      return;
    }
    variablesAtEntry[history.length] = Object.assign({}, variables);
    cursorAtEntry[history.length] = JSON.parse(JSON.stringify(cursor));
    history.push(node.pageId);
    pos = history.length - 1;
    render(leaving());
  }

  function goPrev() {
    if (pos <= 0) return;
    pos--;
    if (variablesAtEntry[pos]) {
      variables = Object.assign({}, variablesAtEntry[pos]);
      cursor = JSON.parse(JSON.stringify(cursorAtEntry[pos]));
      history.length = pos + 1;
      variablesAtEntry.length = pos + 1;
      cursorAtEntry.length = pos + 1;
      gradedAtPos.length = Math.min(gradedAtPos.length, pos);
    }
    render();
  }

  function restart() {
    variables = {};
    module.variables.forEach(function (v) {
      variables[v.id] = v.initialValue;
    });
    cursor = { topIndex: 0, branch: null };
    history = [];
    variablesAtEntry = [];
    cursorAtEntry = [];
    gradedAtPos = [];
    pos = -1;
    goNext();
  }

  // ---- what the graded elements gave (the table of the finished screen) ----
  // A quiz or a gap text "gives points" when its effects change a number variable. What it gave is what the variables changed by while its
  // answer was being worked out - measured, not read off the effects, so a "set" counts as the change it made.

  function scoringVariableIds(block) {
    var lists = [block.onCorrect, block.onIncorrect, block.onEachCorrect, block.onEachWrong, block.onChecked, block.onUnchecked, block.onEachError, block.onSubmit];
    Object.keys(block.answerEffects || {}).forEach(function (key) {
      lists.push(block.answerEffects[key]);
    });
    (block.options || []).forEach(function (option) {
      lists.push(option.onRight, option.onWrong);
    });
    var ids = [];
    lists.forEach(function (list) {
      (list || []).forEach(function (effect) {
        var def = module.variables.filter(function (v) {
          return v.id === effect.variableId;
        })[0];
        if (def && def.type === "number" && !isComputedDef(def) && ids.indexOf(def.id) === -1) ids.push(def.id);
      });
    });
    return ids;
  }

  // Taken before the effects of an answer are applied, and handed to scoreRecord after them with the outcome ("right", "wrong", or "answered"
  // for an open question).
  function scoreMark(block) {
    var ids = scoringVariableIds(block);
    return {
      ids: ids,
      before: ids.map(function (id) {
        return Number(variables[id]) || 0;
      }),
    };
  }

  function scoreRecord(block, mark, outcome) {
    if (mark.ids.length === 0) return;
    var deltas = {};
    mark.ids.forEach(function (id, i) {
      deltas[id] = Math.round(((Number(variables[id]) || 0) - mark.before[i]) * 1e6) / 1e6;
    });
    (gradedAtPos[pos] = gradedAtPos[pos] || []).push({ block: block, outcome: outcome, deltas: deltas });
  }

  // The words of a graded element for the table: its name if it has one, else the beginning of the question (of the text, with the gaps as "...").
  function gradedTitle(block) {
    if (block.name) return String(block.name);
    var holder = document.createElement("div");
    if (block.kind === "sort") holder.textContent = block.items.filter(function (item) { return item.kind === "text"; }).map(function (item) { return sortItemLabel(block, item); }).join(" / ");
    else if (block.kind === "matching") holder.textContent = block.sources.concat(block.targets).filter(function (item) { return item.kind === "text"; }).map(function (item) { return matchingLabel(block, item); }).join(" / ");
    else if (block.kind === "checker") holder.textContent = checkerLabel(block);
    else if (block.kind === "solution") holder.textContent = solutionPlaceholder(block);
    else holder.innerHTML = block.kind === "quiz" ? quizQuestionHtml(block) : blockHtml(block);
    var text = (holder.textContent || "").replace(/\[\[[^\]]*\]\]/g, "\u2026").replace(/\s+/g, " ").trim();
    return text.length > 80 ? text.slice(0, 79) + "\u2026" : text;
  }

  // The rows of the table, in the order of the pages the learner was on: every graded element there that gives points - answered, or
  // "not answered" - and the number variables they change, which are its columns. null when there is nothing to list.
  function doneSummary() {
    var rows = [];
    var columns = [];
    history.forEach(function (pageId, index) {
      var page = module.pages[pageId];
      if (!page) return;
      page.blocks.forEach(function (block) {
        if (block.kind !== "quiz" && block.kind !== "cloze" && block.kind !== "checker" && block.kind !== "solution" && block.kind !== "matching" && block.kind !== "sort") return;
        var ids = scoringVariableIds(block);
        if (ids.length === 0) return;
        var result = (gradedAtPos[index] || []).filter(function (r) {
          return r.block.id === block.id;
        })[0];
        var deltas = {};
        ids.forEach(function (id) {
          deltas[id] = result ? result.deltas[id] || 0 : 0;
          if (columns.indexOf(id) === -1) columns.push(id);
        });
        rows.push({ title: gradedTitle(block), outcome: result ? result.outcome : "open", deltas: deltas });
      });
    });
    if (rows.length === 0) return null;
    return { rows: rows, columns: columns };
  }

  function formatPoints(value) {
    return String(Math.round(value * 100) / 100);
  }

  // The table of the finished screen as data - the head, the rows (what the graded elements gave, and the changes that no element accounts for) and
  // the sum -, every cell {text, cls}: renderDoneSummary draws it as HTML, the certificate as a PDF. null when there is nothing to list.
  function doneTableData() {
    var summary = doneSummary();
    if (!summary) return null;
    var names = summary.columns.map(function (id) {
      // (One number is "the points"; with several, each is named by its variable.)
      return summary.columns.length === 1
        ? uiString("resultsPoints")
        : module.variables.filter(function (v) {
            return v.id === id;
          })[0].name;
    });
    var head = [{ text: uiString("resultsElement"), cls: "" }, { text: uiString("resultsResult"), cls: "" }];
    names.forEach(function (name) {
      head.push({ text: name, cls: "weft-done-number" });
    });
    var rows = [];
    var totals = summary.columns.map(function () {
      return 0;
    });
    summary.rows.forEach(function (row) {
      var cells = [
        { text: row.title, cls: "" },
        { text: uiString({ right: "resultsRight", wrong: "resultsWrong", answered: "resultsAnswered", open: "resultsOpen", ticked: "resultsTicked", unticked: "resultsUnticked" }[row.outcome]), cls: "weft-done-" + row.outcome },
      ];
      summary.columns.forEach(function (id, i) {
        var has = Object.prototype.hasOwnProperty.call(row.deltas, id);
        if (has) totals[i] += row.deltas[id];
        cells.push({ text: has ? formatPoints(row.deltas[id]) : "", cls: "weft-done-number" });
      });
      rows.push({ cells: cells, cls: "", outcome: row.outcome });
    });
    // What the variables really are at the end (what they gained since the start - which is what the LMS has been told): the elements above
    // cannot account for what else changed them - a logic block, a button's effect -, so the difference is a row of its own, and the sum
    // is the real one, not the sum of the elements.
    var gained = summary.columns.map(function (id) {
      var def = module.variables.filter(function (v) {
        return v.id === id;
      })[0];
      return Math.round(((Number(variables[id]) || 0) - (Number(def && def.initialValue) || 0)) * 1e6) / 1e6;
    });
    var differences = gained.map(function (value, i) {
      return Math.round((value - totals[i]) * 1e6) / 1e6;
    });
    if (
      differences.some(function (difference) {
        return difference !== 0;
      })
    ) {
      var adjustment = [{ text: uiString("resultsAdjustment"), cls: "" }, { text: "", cls: "" }];
      differences.forEach(function (difference) {
        adjustment.push({ text: difference !== 0 ? formatPoints(difference) : "", cls: "weft-done-number" });
      });
      rows.push({ cells: adjustment, cls: "weft-done-adjustment", outcome: "adjustment" });
    }
    var foot = [{ text: uiString("resultsTotal"), cls: "" }, { text: "", cls: "" }];
    gained.forEach(function (total) {
      foot.push({ text: formatPoints(total), cls: "weft-done-number" });
    });
    return { head: head, rows: rows, foot: foot };
  }

  function renderDoneSummary() {
    var data = doneTableData();
    if (!data) return null;
    var row = function (tag, cells, className) {
      return el(
        "tr",
        className ? { class: className } : {},
        cells.map(function (c) {
          var cell = el(tag, c.cls ? { class: c.cls } : {}, []);
          cell.textContent = c.text;
          return cell;
        }),
      );
    };
    var body = el(
      "tbody",
      {},
      data.rows.map(function (r) {
        return row("td", r.cells, r.cls);
      }),
    );
    return el("div", { class: "weft-done-summary" }, [el("table", {}, [el("thead", {}, [row("th", data.head)]), body, el("tfoot", {}, [row("th", data.foot)])])]);
  }

  // ---- the certificate ----
  // A PDF - A4, with as many pages as the table needs - of the finished screen's table, under the heading "Weft-Zertifikat" and the name of the
  // module, offered for download on the finished screen. Made here, without a library: the pages are drawn on a canvas - which brings the writing of
  // every language with it, the right-to-left ones too, in the fonts of the system or of the module - and put into the PDF as pictures (JPEG), the
  // way the editor's PDF export does it (core/io/pdfWriter.ts); the text on them cannot be selected.
  var CERT_W = 595.28; // A4 in points
  var CERT_H = 841.89;
  var CERT_SCALE = 200 / 72; // pixels per point: 200 dpi

  // The lines a text breaks into within `width` (the measuring context has its font set): at the words - where a language has none the browser
  // knows where to (Intl.Segmenter) -, and a word that is too long for a line breaks anywhere.
  function certificateWrap(ctx, text, width) {
    var lines = [];
    String(text)
      .split("\n")
      .forEach(function (paragraph) {
        var pieces;
        if (typeof Intl !== "undefined" && Intl.Segmenter) {
          pieces = Array.from(new Intl.Segmenter(currentLanguage ? currentLanguage.replace("_", "-") : "de", { granularity: "word" }).segment(paragraph)).map(function (part) {
            return part.segment;
          });
        } else pieces = paragraph.split(/(\s+)/);
        var line = "";
        pieces.forEach(function (piece) {
          if (ctx.measureText(line + piece).width <= width) {
            line += piece;
            return;
          }
          if (line.trim() !== "") {
            lines.push(line.replace(/\s+$/, ""));
            line = "";
          }
          piece = piece.replace(/^\s+/, "");
          if (ctx.measureText(piece).width <= width) {
            line = piece;
            return;
          }
          Array.from(piece).forEach(function (ch) {
            if (line !== "" && ctx.measureText(line + ch).width > width) {
              lines.push(line);
              line = "";
            }
            line += ch;
          });
        });
        lines.push(line.replace(/\s+$/, ""));
      });
    return lines;
  }

  // The date and the time the certificate is made, as the learner's language writes them ("27. Oktober 2026 um 14:35").
  function certificateDate() {
    var now = new Date();
    try {
      return now.toLocaleString((currentLanguage || "de").replace("_", "-"), { dateStyle: "long", timeStyle: "short" });
    } catch (e) {
      return now.toLocaleString();
    }
  }

  // The pages as canvases (A4 at CERT_SCALE): the heading and the module's name, then the table - the head again on every page, a row never
  // split between two pages, the sum under the last row.
  function certificateCanvases(data) {
    var MARGIN = 56.7; // 2 cm
    var PAD = 5;
    var LINE = 14;
    var FS = 10.5;
    var rtl = /^(ar|he)(_|$)/.test(currentLanguage || "");
    var stageEl = document.querySelector(".weft-stage-done") || document.body;
    var computed = getComputedStyle(stageEl);
    var family = computed.fontFamily || "sans-serif";
    var accent = computed.getPropertyValue("--slide-accent-color").trim() || "#2563eb";
    var INK = "#1f2328";
    var MUTED = "#6b7280";
    var font = function (size, weight, italic) {
      return (italic ? "italic " : "") + weight + " " + size + "px " + family;
    };
    var measure = document.createElement("canvas").getContext("2d");
    var widthOf = function (text, size, weight, italic) {
      measure.font = font(size, weight, italic);
      return measure.measureText(text).width;
    };
    var wrapped = function (text, width, size, weight, italic) {
      measure.font = font(size, weight, italic);
      return certificateWrap(measure, text, width);
    };

    var contentW = CERT_W - 2 * MARGIN;
    var cols = data.head.length;
    // The number columns are as wide as their widest cell, the result column as its widest result (at most 120 pt: then it breaks lines), the
    // first one takes what is left.
    var widths = [0, 0];
    var widest = function (c) {
      var w = widthOf(data.head[c].text, FS, 600);
      w = Math.max(w, widthOf(data.foot[c].text, FS, 700));
      data.rows.forEach(function (r) {
        w = Math.max(w, widthOf(r.cells[c].text, FS, 400, r.outcome === "adjustment"));
      });
      return w;
    };
    widths[1] = Math.min(120, Math.max(60, widest(1) + 2 * PAD));
    var fixed = widths[1];
    for (var c = 2; c < cols; c++) {
      widths[c] = Math.max(40, widest(c) + 2 * PAD);
      fixed += widths[c];
    }
    if (contentW - fixed < 120) {
      var shrink = (contentW - 120) / fixed;
      for (var k = 1; k < cols; k++) widths[k] *= shrink;
      fixed *= shrink;
    }
    widths[0] = contentW - fixed;
    var colX = [];
    var at = MARGIN;
    widths.forEach(function (w) {
      colX.push(at);
      at += w;
    });

    // The rows: what each cell says, broken into lines, and how high the row is.
    var layoutRow = function (cells, weight, italic) {
      var lines = cells.map(function (cell, i) {
        return i < 2 ? wrapped(cell.text, widths[i] - 2 * PAD, FS, weight, italic) : [cell.text];
      });
      var most = Math.max.apply(null, lines.map(function (l) {
        return l.length;
      }));
      return { lines: lines, height: most * LINE + 10 };
    };
    var head = layoutRow(data.head, 600, false);
    var foot = layoutRow(data.foot, 700, false);
    var rows = data.rows.map(function (r) {
      var laid = layoutRow(r.cells, 400, r.outcome === "adjustment");
      laid.row = r;
      return laid;
    });

    // The heading block on the first page.
    var TITLE = 26;
    var NAME = 15;
    var titleLines = wrapped(uiString("certificateTitle"), contentW, TITLE, 700);
    var nameLines = module.title ? wrapped(module.title, contentW, NAME, 400) : [];
    var dateText = certificateDate();
    var headingH = titleLines.length * 32 + 10 + 3 + 16 + nameLines.length * 21 + (nameLines.length ? 4 : 0) + 16 + 24;

    // Which rows go on which page.
    var BOTTOM = CERT_H - 50;
    var pages = [[]];
    var y = MARGIN + headingH + head.height;
    rows.forEach(function (r) {
      var current = pages[pages.length - 1];
      if (y + r.height > BOTTOM && current.length > 0) {
        pages.push([]);
        y = MARGIN + head.height;
      }
      pages[pages.length - 1].push(r);
      y += r.height;
    });
    if (y + foot.height > BOTTOM) {
      // (The sum does not stand alone under the head of a page: the last row comes along.)
      var last = pages[pages.length - 1];
      pages.push(last.length > 1 ? [last.pop()] : []);
    }

    var canvases = pages.map(function (pageRows, pageIndex) {
      var canvas = document.createElement("canvas");
      canvas.width = Math.round(CERT_W * CERT_SCALE);
      canvas.height = Math.round(CERT_H * CERT_SCALE);
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(CERT_SCALE, CERT_SCALE);
      ctx.textBaseline = "middle";
      // x of a box that is `x`, `w` wide from the left edge in a left-to-right page; mirrored on a right-to-left one.
      var boxX = function (x, w) {
        return rtl ? CERT_W - x - w : x;
      };
      var text = function (value, size, weight, italic, color, x, w, align, centerY) {
        // (align "start" is the left edge in a left-to-right page, the right edge in a right-to-left one; "end" the other way round.)
        var left = (align === "start") !== rtl;
        ctx.font = font(size, weight, italic);
        ctx.fillStyle = color;
        // (The direction of the text itself, not of the page: a Latin word with a full stop after it, on a right-to-left page, keeps it behind.)
        ctx.direction = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/.test(value) ? "rtl" : "ltr";
        ctx.textAlign = left ? "left" : "right";
        var bx = boxX(x, w);
        ctx.fillText(value, left ? bx : bx + w, centerY);
      };
      var line = function (yy, thickness, color) {
        ctx.fillStyle = color;
        ctx.fillRect(MARGIN, yy - thickness / 2, contentW, thickness);
      };
      var cursor = MARGIN;
      if (pageIndex === 0) {
        titleLines.forEach(function (t, i) {
          text(t, TITLE, 700, false, INK, MARGIN, contentW, "start", cursor + i * 32 + 16);
        });
        cursor += titleLines.length * 32 + 10;
        ctx.fillStyle = accent;
        ctx.fillRect(boxX(MARGIN, 64), cursor, 64, 3);
        cursor += 3 + 16;
        nameLines.forEach(function (t, i) {
          text(t, NAME, 400, false, INK, MARGIN, contentW, "start", cursor + i * 21 + 10.5);
        });
        cursor += nameLines.length * 21 + (nameLines.length ? 4 : 0);
        text(dateText, 11, 400, false, MUTED, MARGIN, contentW, "start", cursor + 8);
        cursor += 16 + 24;
      }
      var drawRow = function (laid, weight, italic, colorOf) {
        laid.lines.forEach(function (cellLines, c) {
          cellLines.forEach(function (t, i) {
            text(t, FS, weight, italic, colorOf(c), colX[c], widths[c], c < 2 ? "start" : "end", cursor + 5 + i * LINE + LINE / 2);
          });
        });
        cursor += laid.height;
      };
      // Runs `fn` with the text boxes narrowed by PAD on both sides (the padding of the cells).
      var padded = function (fn) {
        var saved = { x: colX.slice(), w: widths.slice() };
        for (var i = 0; i < colX.length; i++) {
          colX[i] += PAD;
          widths[i] -= 2 * PAD;
        }
        fn();
        colX = saved.x;
        widths = saved.w;
      };
      padded(function () {
        drawRow(head, 600, false, function () {
          return MUTED;
        });
      });
      line(cursor, 1, "#8c959f");
      pageRows.forEach(function (laid) {
        var outcome = laid.row.outcome;
        var tone = outcome === "right" || outcome === "ticked" ? "#1a7f37" : outcome === "wrong" ? "#c62828" : outcome === "open" || outcome === "unticked" ? MUTED : INK;
        padded(function () {
          drawRow(laid, 400, outcome === "adjustment", function (c) {
            return outcome === "adjustment" ? MUTED : c === 1 ? tone : INK;
          });
        });
        line(cursor, 0.5, "#d0d7de");
      });
      if (pageIndex === pages.length - 1) {
        line(cursor, 1.5, "#57606a");
        padded(function () {
          drawRow(foot, 700, false, function () {
            return INK;
          });
        });
      }
      if (pages.length > 1) {
        ctx.direction = "ltr";
        ctx.textAlign = "center";
        ctx.font = font(9, 400);
        ctx.fillStyle = MUTED;
        ctx.fillText(pageIndex + 1 + " / " + pages.length, CERT_W / 2, CERT_H - 28);
      }
      return canvas;
    });
    return canvases;
  }

  // The bytes of a PDF with one A4 page per picture (JPEG): catalog, page tree, info and for every page the page, its content and the image.
  function certificatePdf(canvases, title) {
    var encoder = new TextEncoder();
    var parts = [];
    var offsets = [];
    var length = 0;
    var push = function (data) {
      var bytes = typeof data === "string" ? encoder.encode(data) : data;
      parts.push(bytes);
      length += bytes.length;
    };
    var object = function (id, body) {
      offsets[id] = length;
      push(id + " 0 obj\n");
      if (typeof body === "string") push(body);
      else body.forEach(push);
      push("\nendobj\n");
    };
    // A PDF text string: the plain characters if they are ASCII, else UTF-16BE with a byte order mark (as a hex string).
    var pdfString = function (text) {
      if (/^[\x20-\x7e]*$/.test(text)) return "(" + text.replace(/[\\()]/g, "\\$&") + ")";
      var hex = "FEFF";
      for (var i = 0; i < text.length; i++) hex += ("0000" + text.charCodeAt(i).toString(16)).slice(-4).toUpperCase();
      return "<" + hex + ">";
    };
    var jpegs = canvases.map(function (canvas) {
      var binary = atob(canvas.toDataURL("image/jpeg", 0.92).split(",")[1]);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return { bytes: bytes, width: canvas.width, height: canvas.height };
    });
    var pageObject = function (i) {
      return 4 + i * 3;
    };
    push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    object(1, "<< /Type /Catalog /Pages 2 0 R >>");
    object(2, "<< /Type /Pages /Count " + jpegs.length + " /Kids [" + jpegs.map(function (_, i) { return pageObject(i) + " 0 R"; }).join(" ") + "] >>");
    object(3, "<< /Title " + pdfString(title) + " /Producer (Weft) >>");
    jpegs.forEach(function (jpeg, i) {
      var id = pageObject(i);
      object(id, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + CERT_W + " " + CERT_H + "] /Resources << /XObject << /Im0 " + (id + 2) + " 0 R >> >> /Contents " + (id + 1) + " 0 R >>");
      var content = "q " + CERT_W + " 0 0 " + CERT_H + " 0 0 cm /Im0 Do Q";
      object(id + 1, "<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream");
      object(id + 2, [
        "<< /Type /XObject /Subtype /Image /Width " + jpeg.width + " /Height " + jpeg.height + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.bytes.length + " >>\nstream\n",
        jpeg.bytes,
        "\nendstream",
      ]);
    });
    var count = 4 + jpegs.length * 3;
    var xrefAt = length;
    var xref = "xref\n0 " + count + "\n0000000000 65535 f \n";
    for (var id = 1; id < count; id++) xref += ("0000000000" + offsets[id]).slice(-10) + " 00000 n \n";
    push(xref);
    push("trailer\n<< /Size " + count + " /Root 1 0 R /Info 3 0 R >>\nstartxref\n" + xrefAt + "\n%%EOF\n");
    var out = new Uint8Array(length);
    var written = 0;
    parts.forEach(function (part) {
      out.set(part, written);
      written += part.length;
    });
    return out;
  }

  // Offers the certificate for download (as a file of a files block is: the page around the editor's preview saves it there).
  function downloadCertificate(button) {
    button.disabled = true;
    Promise.resolve(document.fonts && document.fonts.ready)
      .then(function () {
        var data = doneTableData();
        if (!data) return;
        var heading = uiString("certificateTitle");
        var name = (heading + (module.title ? " - " + module.title : "")).replace(/[\\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
        filesSave(certificatePdf(certificateCanvases(data), heading + (module.title ? " - " + module.title : "")), { name: name + ".pdf", mimeType: "application/pdf" });
      })
      .catch(function (error) {
        console.error(error);
      })
      .then(function () {
        button.disabled = false;
      });
  }

  // ---- logic blocks (see ScriptBlock in core/types.ts) ----
  // A logic block's event (`script-run:<blockId>`) runs its JavaScript when it is reached, and has happened once the script is done.
  // The code gets `vars` (the module's variables by name: read, and write), `debug(...)`, `trigger(name)`, `jump(slide, type, options)`,
  // `VanillaLM` and `getBlock(name)` (a block of the slide: see scriptBlock) - what it does with them is up to its author: nothing here checks it.
  var SCRIPT_DEFAULT_TRANSITION_MS = { none: 500, fade: 500, move: 500, iris: 900, cube: 900, blur: 1200, wheel: 1600, horror: 2000 };
  var debugBox = null;
  var debugList = null;

  function scriptRunEventId(blockId) {
    return "script-run:" + blockId;
  }

  // debug(...): a small window over the page (kept across pages) that lists what the scripts say.
  function debugShow(args) {
    var text = Array.prototype.map
      .call(args, function (value) {
        if (typeof value === "string") return value;
        try {
          var json = JSON.stringify(value);
          return json === undefined ? String(value) : json;
        } catch (error) {
          return String(value);
        }
      })
      .join(" ");
    if (!debugBox) {
      debugList = el("div", { class: "weft-debug-list" }, []);
      var closeButton = el("button", { type: "button", class: "weft-debug-close", "aria-label": "Close" }, [document.createTextNode("\u00d7")]);
      closeButton.addEventListener("click", function () {
        if (debugBox && debugBox.parentNode) debugBox.parentNode.removeChild(debugBox);
        debugBox = null;
        debugList = null;
      });
      debugBox = el("div", { class: "weft-debug" }, [el("div", { class: "weft-debug-head" }, [document.createTextNode("Debug"), closeButton]), debugList]);
      document.body.appendChild(debugBox);
    }
    debugList.appendChild(el("div", { class: "weft-debug-line" }, [document.createTextNode(text)]));
    debugList.scrollTop = debugList.scrollHeight;
  }

  function setScriptVariable(name, value) {
    var def = variableByName(name);
    if (!def) {
      debugShow(["vars: there is no variable called", name]);
      return;
    }
    if (isComputedDef(def)) {
      debugShow(["vars:", name, "is computed and cannot be set"]);
      return;
    }
    applyEffect({ variableId: def.id, op: "set", value: value });
  }

  function scriptVariables() {
    return new Proxy(
      {},
      {
        get: function (target, name) {
          var entry = typeof name === "string" ? variableValueByName(name) : null;
          return entry ? entry.value : undefined;
        },
        set: function (target, name, value) {
          if (typeof name === "string") setScriptVariable(name, value);
          return true;
        },
        has: function (target, name) {
          return typeof name === "string" && variableValueByName(name) !== null;
        },
        ownKeys: function () {
          return module.variables.map(function (v) {
            return v.name;
          });
        },
        getOwnPropertyDescriptor: function (target, name) {
          var entry = typeof name === "string" ? variableValueByName(name) : null;
          return entry ? { value: entry.value, writable: true, enumerable: true, configurable: true } : undefined;
        },
      }
    );
  }

  // The event of this page called `name`: by its id, or by the title it has in the graph (case does not matter).
  function eventNamed(name) {
    if (graphEvents[name]) return name;
    var wanted = String(name).trim().toLowerCase();
    var found = null;
    Object.keys(graphEvents).forEach(function (id) {
      var title = graphEvents[id].title;
      if (!found && title && String(title).trim().toLowerCase() === wanted) found = id;
    });
    return found;
  }

  // The slide that goes by `label` ("3", "2.a.1") in the editor's numbering.
  function pageIdForLabel(label) {
    var labels = module.pageLabels || {};
    var wanted = String(label).trim().toLowerCase();
    var found = null;
    Object.keys(labels).forEach(function (pageId) {
      if (!found && String(labels[pageId]).toLowerCase() === wanted) found = pageId;
    });
    return found;
  }

  // The module's JavaScript libraries (WeftModule.scriptLibraries): each one is run once, when the module starts, in the order of the list, as a
  // classic script of the page - so that what it defines (also a top-level const) is global and the code of every logic block can use it. An error
  // in one is shown in the debug window and the others still run.
  function loadScriptLibraries() {
    (module.scriptLibraries || []).forEach(function (library) {
      var message = null;
      var previous = window.onerror;
      window.onerror = function (text, source, line, column, error) {
        message = (error && error.message) || String(text);
        return true;
      };
      try {
        var script = document.createElement("script");
        script.text = String(library.code || "") + "\n//# sourceURL=weft-library-" + String(library.fileName || "library.js").replace(/[^\w.-]+/g, "_");
        document.head.appendChild(script);
      } catch (error) {
        message = error && error.message ? error.message : String(error);
      }
      window.onerror = previous;
      if (message !== null) debugShow(["Library " + library.fileName + ":", message]);
    });
  }

  // The words of some html, as plain text (what getBlock tells a script).
  function plainTextOfHtml(html) {
    var box = document.createElement("div");
    box.innerHTML = html || "";
    return (box.textContent || "").replace(/\s+/g, " ").trim();
  }

  // getBlock(name) in a logic block's code: the block of this slide (the layout's too) that is called `name` in the editor - what a script can know of it and do
  // with it. A quiz: its question and answers in the language that is shown (`options`: { id, index, text, correct }; `correctOptions`, `wrongOptions`),
  // and `hideOptions(which)` / `showOptions()` to take answers away and bring them back (the 50:50 of a quiz game). `which` is a list of answers from
  // `options`, or their ids or their places. Any other block: its id, kind and name. null (and a note in the debug window) if there is no such block.
  function quizScriptView(view, block) {
    var handle = quizHandles[block.id];
    var options = block.options.map(function (option, index) {
      return { id: option.id, index: index, text: plainTextOfHtml(quizOptionHtml(block, option)), correct: block.correctOptionIds.indexOf(option.id) !== -1 };
    });
    view.question = plainTextOfHtml(quizQuestionHtml(block));
    view.options = options;
    view.correctOptions = options.filter(function (option) {
      return block.open === true || option.correct;
    });
    view.wrongOptions = options.filter(function (option) {
      return block.open !== true && !option.correct;
    });
    view.hideOptions = function (which) {
      if (!handle) return 0;
      (Array.isArray(which) ? which : [which]).forEach(function (item) {
        var id = typeof item === "number" ? (options[item] || {}).id : item && typeof item === "object" ? item.id : item;
        var known = options.some(function (option) {
          return option.id === id;
        });
        if (known && handle.hidden.indexOf(id) === -1) handle.hidden.push(id);
      });
      handle.refresh();
      return handle.hidden.length;
    };
    view.showOptions = function () {
      if (handle) {
        handle.hidden.length = 0;
        handle.refresh();
      }
      return 0;
    };
  }

  function scriptBlock(name) {
    var wanted = String(name).trim().toLowerCase();
    var block = null;
    stageBlocks.forEach(function (candidate) {
      if (!block && candidate.name && String(candidate.name).trim().toLowerCase() === wanted) block = candidate;
    });
    if (!block) {
      debugShow(["getBlock: this slide has no block called", name]);
      return null;
    }
    var view = { id: block.id, kind: block.kind, name: block.name };
    if (block.kind === "quiz") quizScriptView(view, block);
    return view;
  }

  function runScript(block) {
    var generation = graphGeneration;
    // What was asked for happens right after the script, not in the middle of it - and not at all if the page is gone by then.
    var later = function (action) {
      setTimeout(function () {
        if (generation === graphGeneration) action();
      }, 0);
    };
    var debug = function () {
      debugShow(arguments);
    };
    var trigger = function (name) {
      var id = eventNamed(name);
      if (!id) {
        debugShow(["trigger: this slide has no event called", name]);
        return false;
      }
      deliver({ id: "script", from: "script", to: id, delayMs: 0, weiter: false }, false);
      return true;
    };
    var jump = function (slide, type, options) {
      var pageId = pageIdForLabel(slide);
      if (!pageId) {
        debugShow(["jump: there is no slide", slide]);
        return false;
      }
      var kind = type || "none";
      var transition = Object.assign({}, options || {}, { type: kind });
      if (!(transition.durationMs > 0)) transition.durationMs = SCRIPT_DEFAULT_TRANSITION_MS[kind] || 500;
      later(function () {
        goToPage(pageId, transition);
      });
      return true;
    };
    try {
      var run = new Function("vars", "debug", "trigger", "jump", "VanillaLM", "getBlock", block.code || "");
      run(scriptVariables(), debug, trigger, jump, window.VanillaLM, scriptBlock);
    } catch (error) {
      debugShow(["Logic block:", error && error.message ? error.message : String(error)]);
    }
    return generation === graphGeneration;
  }

  // ---- LMS (VanillaLM) ----
  // VanillaLM (embedded ahead of this script - see buildRuntimeHtml.ts) collects points, attributes
  // and the success flag and posts them to the page around the module (Stud.IP). It is always
  // active: with no such page, there's simply nobody listening. What reaches it:
  //  - a stored NUMBER variable: addPoints(name, change) - the points follow the variable (a restart
  //    takes them back down), starting from its initial value, so points already earned in an earlier
  //    session aren't overwritten;
  //  - every other variable (text, Ja/Nein, computed ones) and the virtual `progress`:
  //    setAttribute(name, value);
  //  - `success` turning true: markSuccess() (the library has no way back, so it stays marked).
  // syncLms() runs after every change of a variable and after every slide; it only calls into the
  // library for what actually changed, and sends (VanillaLM.send) right away for success and in the
  // same tick for anything else. Every call is guarded: the module keeps working even if the library
  // were missing or one of its methods threw.
  var lmsSnapshot = {};
  var lmsSuccessMarked = false;
  var lmsSendQueued = false;

  function lmsCall(fn) {
    try {
      fn();
      return true;
    } catch (error) {
      if (window.console) console.warn("VanillaLM:", error);
      return false;
    }
  }

  function lmsSend() {
    lmsCall(function () {
      VanillaLM.send();
    });
  }

  function lmsAddPoints(name, change) {
    var done = lmsCall(function () {
      VanillaLM.addPoints(name, change);
    });
    if (done) return;
    // addPoints looks the old value up in the saved session first, which fails while nothing has been
    // saved yet - setPoints doesn't need that.
    lmsCall(function () {
      VanillaLM.setPoints(name, ((VanillaLM.state.points && VanillaLM.state.points[name]) || 0) + change);
    });
  }

  function syncLms() {
    if (typeof VanillaLM === "undefined") return;
    var changed = false;
    var successNow = false;
    module.variables.forEach(function (def) {
      var value = variableValue(def);
      if (def.fixed && def.name === "success") {
        if (truthy(value) && !lmsSuccessMarked) {
          lmsSuccessMarked = true;
          successNow = true;
          lmsCall(function () {
            VanillaLM.markSuccess();
          });
        }
      } else if (def.type === "number") {
        var current = Number(value) || 0;
        var before = def.id in lmsSnapshot ? lmsSnapshot[def.id] : Number(def.initialValue) || 0;
        lmsSnapshot[def.id] = current;
        if (current !== before) {
          lmsAddPoints(def.name, current - before);
          changed = true;
        }
      } else if (lmsSnapshot[def.id] !== value) {
        lmsSnapshot[def.id] = value;
        lmsCall(function () {
          VanillaLM.setAttribute(def.name, value);
        });
        changed = true;
      }
    });
    // The virtual `progress` - unless the author declared a variable of that name, which wins (and
    // was just handled above like any other).
    if (!variableByName("progress")) {
      var progress = progressValue();
      if (lmsSnapshot.__progress !== progress) {
        lmsSnapshot.__progress = progress;
        lmsCall(function () {
          VanillaLM.setAttribute("progress", progress);
        });
        changed = true;
      }
    }
    // Likewise the virtual `userlanguage` (only a multilingual module has it).
    if (languages.length > 0 && !variableByName("userlanguage") && lmsSnapshot.__userlanguage !== currentLanguage) {
      lmsSnapshot.__userlanguage = currentLanguage;
      lmsCall(function () {
        VanillaLM.setAttribute("userlanguage", currentLanguage);
      });
      changed = true;
    }
    if (successNow) {
      lmsSend();
    } else if (changed && !lmsSendQueued) {
      // Several changes in the same moment (a quiz applying all its effects) go out as one message.
      lmsSendQueued = true;
      setTimeout(function () {
        lmsSendQueued = false;
        lmsSend();
      }, 0);
    }
  }

  // ---- keyboard navigation ----
  // Space/→ advance (restarting instead once the module has ended, exactly like the built-in
  // "Weiter" button block); ← goes back (goPrev() already no-ops safely on the first page).
  // Skipped for whatever a focused element would otherwise do with that same key natively - a
  // focused button or checkbox already reacts to Space itself, and firing our own handler too
  // would advance/restart a second time on top of that.
  function blocksGlobalKeyNav(el, isSpace) {
    if (!el) return false;
    var tag = el.tagName;
    if (tag === "BUTTON") return isSpace;
    if (tag === "INPUT") {
      var type = (el.getAttribute("type") || "text").toLowerCase();
      if (type === "checkbox" || type === "radio") return isSpace;
      return true; // a text/number/... input: leave both space and arrow keys to it
    }
    return tag === "TEXTAREA" || tag === "SELECT" || tag === "A";
  }

  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      // This only fires when actually embedded in an iframe, which is exactly when some host
      // (the editor's own Vorschau, or an LMS) needs telling that the learner wants out.
      if (window.parent !== window) window.parent.postMessage({ source: "weft-module", type: "exit-presentation" }, "*");
      return;
    }
    var isSpace = e.key === " " || e.key === "Spacebar";
    var isRight = e.key === "ArrowRight";
    var isLeft = e.key === "ArrowLeft";
    if (!isSpace && !isRight && !isLeft) return;
    // Explicit === false (not just falsy) so a module exported before this setting existed -
    // its embedded JSON simply won't have the field at all, and can't be migrated after the
    // fact like a re-opened .weft file can - keeps behaving exactly as it always did instead of
    // suddenly losing keyboard navigation nobody asked to turn off.
    if (module.keyboardNavigationEnabled === false) return;
    if (blocksGlobalKeyNav(document.activeElement, isSpace)) return;
    e.preventDefault();
    // The "done" screen isn't a real page (see buildStageWrap) - nothing wired its own Weiter
    // queue for it, so Weiter here always means "start over", exactly like the "Neu starten"
    // button it shows, same as the ternary every other Weiter-ish control (the button block,
    // quiz auto-advance) already uses.
    if (isLeft) goPrev();
    else if (pos >= history.length) restart();
    else weiter();
  });

  // ---- tap / click navigation ----
  // A tablet has no Space or arrow keys (and on a computer a click is just as natural): a tap or click on the page means "Weiter",
  // exactly like Space - and one in the left fifth of the screen means "Zurück" (like the left arrow) - unless it lands on something
  // that does something of its own. That is everything a person operates (a link,
  // a button, a field, a video's controls), and whole blocks whose parts are: a quiz (a tap beside an answer must not skip the
  // question), the files of a files block (password field, downloads), the language switch and an embedded page. It is not
  // a "Weiter" either when the person is selecting text (a drag ends in a click), and not on the finished screen (that has its own
  // button - a stray tap shouldn't start the module over). Follows the setting of the keyboard navigation: a module that
  // may only be left by its own buttons can't be tapped through either.
  var TAP_INTERACTIVE =
    "a, button, input, select, textarea, label, summary, video, audio, iframe, [contenteditable], [role='button']," +
    ".weft-block-quiz, .weft-block-matching, .weft-block-sort, .weft-block-gallery, .weft-matching-lightbox, .weft-block-revealer, .weft-files, .weft-block-language, .weft-block-iframe, .weft-debug";
  var lastTapAdvanceAt = 0;
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || module.keyboardNavigationEnabled === false) return;
    var target = e.target;
    if (target && target.closest && target.closest(TAP_INTERACTIVE)) return;
    var selection = window.getSelection ? window.getSelection() : null;
    if (selection && String(selection).length > 0) return;
    var goBack = e.clientX < window.innerWidth * 0.2;
    if (!goBack && pos >= history.length) return;
    // Two taps in a quick row (a double tap) are one.
    var now = Date.now();
    if (now - lastTapAdvanceAt < 300) return;
    lastTapAdvanceAt = now;
    if (goBack) goPrev();
    else weiter();
  });

  // ---- rendering ----
  // Numeric [width, height] ratios (not a CSS aspect-ratio string) - stageStyle() below turns
  // these into --ar-w/--ar-h custom properties, which the CSS uses in a calc() to size the
  // stage to the largest box of that ratio that still fits the viewport (see player.runtime.css).
  // "W:H" (any pair of positive numbers - see core/aspectRatio.ts's parseAspectRatio, kept in sync by
  // hand); 16:9 for anything unreadable.
  function parseAspectRatio() {
    var parts = String(module.aspectRatio || "").split(":");
    var width = Number(parts[0]);
    var height = Number(parts[1]);
    return width > 0 && height > 0 && isFinite(width) && isFinite(height) ? [width, height] : [16, 9];
  }

  // Numeric width/height - same value core/aspectRatio.ts's aspectRatioNumeric gives, used by
  // renderShape to correct a rounded rectangle's corners (see shapeRoundedRectPath in blocks/shape/render.js).
  function slideAspectNumeric() {
    var ratio = parseAspectRatio();
    return ratio[0] / ratio[1];
  }

  function stageStyle() {
    var ratio = parseAspectRatio();
    var css = "--ar-w:" + ratio[0] + ";--ar-h:" + ratio[1] + ";";
    // The module's look (see stageTheme.css): the accent colour and the colour of what stands on it; the rest is worked out there.
    if (module.accentColor) {
      // (And the accent colour as it is drawn on the slide itself, in a colour that stands out from the slide - see accentContrast.js.)
      var back = module.brightness === "dark" ? "#18181b" : "#ffffff";
      css += "--slide-accent:" + module.accentColor + ";--slide-accent-fg:" + revealerSignColor(module.accentColor) + ";";
      css += "--slide-accent-ink:" + accentInk(module.accentColor, back, 3) + ";--slide-accent-ink-text:" + accentInk(module.accentColor, back, 4.5) + ";";
      // (And on the dark grey of a link, which is the same on every slide: #1c2230, see .weft-link in player.runtime.css.)
      css += "--slide-accent-on-dark:" + accentInk(module.accentColor, "#1c2230", 3) + ";";
    }
    return css;
  }

  // Light or dark slides (WeftModule.brightness).
  function stageTheme() {
    return module.brightness === "dark" ? "dark" : "light";
  }

  // How buttons and answers look (WeftModule.interactiveStyle): "plain", "elegant", "round" or "futuristic".
  function stageUiStyle() {
    return module.interactiveStyle || "plain";
  }

  function assetSrc(assetId) {
    if (assetUrlOverrides[assetId]) return assetUrlOverrides[assetId];
    var meta = module.assets.filter(function (a) {
      return a.id === assetId;
    })[0];
    if (!meta) return "";
    return "assets/" + meta.id + "_" + meta.fileName;
  }

  // A function that runs its body only the first time it is called - for completions that more than
  // one thing (an animation's end, a timer) may try to trigger.
  function once(fn) {
    var called = false;
    return function () {
      if (called) return;
      called = true;
      fn();
    };
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (attrs[key] === undefined || attrs[key] === null) return;
        if (key === "class") node.className = attrs[key];
        else node.setAttribute(key, attrs[key]);
      });
    }
    (children || []).forEach(function (child) {
      node.appendChild(child);
    });
    return node;
  }

  // ---- the page's event graph (see core/eventGraph and docs/event-graph.md) ----
  // page.graph is made by the editor when the module is exported: events (what can happen on the page) and triggers (what makes
  // what happen). Nothing here knows about defaults, chains or queues - it only runs them.
  //
  // An event HAPPENS (see happened) and then sends all its outgoing triggers: a trigger either arrives after its delay or, if it
  // waits for Weiter, once the learner presses Weiter. What arrives at an event makes its action run (see `performers`: an element
  // appears, a video starts, the page is left); an event without an action just happens. An action tells that it is done by
  // calling happened() itself - an element that fades in has appeared when the animation is over.
  var graphGeneration = 0; // a new page shows a new graph: what is still on its way for the old one is dropped
  var graphEvents = {}; // by id
  // The conditions of the page ("Ausgelöst durch: Variable"): { id, expr (the syntax tree of the formula), was (whether it held when it was last looked at) }.
  var conditions = [];
  var outgoingTriggers = {}; // event id -> [trigger]
  var performers = {}; // event id -> function that runs the event's action
  // Required tasks (QuizBlock.required / ClozeBlock.required): the ones on the page being shown that have not been submitted yet, by block
  // id. While there is one, a Weiter that would leave the page is held back (see weiter) - the builds before it still go on - and the
  // buttons whose action is "Weiter" are greyed out when their next press would be such a one (advanceButtons).
  var requiredPending = {};
  var advanceButtons = [];
  function hasRequiredPending() {
    return Object.keys(requiredPending).length > 0;
  }
  function weiterIsHeld() {
    return hasRequiredPending() && !hasPendingBuild();
  }
  function updateAdvanceButtons() {
    var held = weiterIsHeld();
    advanceButtons.forEach(function (button) {
      button.disabled = held;
    });
  }
  function requiredDone(blockId) {
    if (!requiredPending[blockId]) return;
    delete requiredPending[blockId];
    updateAdvanceButtons();
  }

  var waitingForWeiter = {}; // trigger id -> trigger, for the triggers whose source has happened and that wait for Weiter
  var triggersDelivered = [];
  // A loop of triggers without delay or Weiter would never let the page breathe: every delivery is asynchronous, and there is a cap
  // on how many go out per second.
  var MAX_DELIVERIES_PER_SECOND = 600;

  // How many of the page's Weiter presses that build something (an element that appears, ...) the learner has pressed, and how many there
  // are (for the presenter view: "Aufbau 2 von 4"). The press that leaves the page is not one of them.
  var buildsDone = 0;
  var buildsTotal = 0;
  function isBuildTrigger(trigger) {
    var target = graphEvents[trigger.to];
    return !!trigger.weiter && !!target && target.kind !== "end";
  }
  function setUpGraph(page) {
    graphGeneration++;
    buildsDone = 0;
    graphEvents = {};
    outgoingTriggers = {};
    performers = {};
    waitingForWeiter = {};
    triggersDelivered = [];
    var graph = page.graph || { events: [], triggers: [] };
    conditions = [];
    graph.events.forEach(function (event) {
      graphEvents[event.id] = event;
      // "Ausgelöst durch: Variable": its formula is looked at whenever a variable changes (see checkConditions).
      if (event.kind === "condition") conditions.push({ id: event.id, expr: event.expr || null, was: false });
      // "Nächste Folie": the page is left, with this event's own transition. Whichever of them is reached first wins - the
      // page is gone, and what is still on its way for it is dropped (see graphGeneration).
      if (event.kind === "end") {
        performers[event.id] = function () {
          goNext(event.transition);
        };
      }
    });
    graph.triggers.forEach(function (trigger) {
      (outgoingTriggers[trigger.from] = outgoingTriggers[trigger.from] || []).push(trigger);
    });
    buildsTotal = graph.triggers.filter(isBuildTrigger).length;
  }

  function overDeliveryCap() {
    var now = Date.now();
    triggersDelivered = triggersDelivered.filter(function (at) {
      return now - at < 1000;
    });
    if (triggersDelivered.length >= MAX_DELIVERIES_PER_SECOND) return true;
    triggersDelivered.push(now);
    return false;
  }

  // The formulas of the page's conditions are looked at: one that holds now and did not before has happened (and its trigger goes out) - at
  // the start of the page, and after every change of a variable. One that does not hold (or does not parse) is false; and when it turns true
  // again it happens again (the Aufbau/Abbau it triggers does nothing twice, see applyBlockEffects).
  function checkConditions() {
    if (renderAll) return;
    conditions.forEach(function (condition) {
      var holds = false;
      if (condition.expr) {
        try {
          holds = truthy(evalExpression(condition.expr));
        } catch (error) {
          holds = false;
        }
      }
      var turned = holds && !condition.was;
      condition.was = holds;
      if (turned) happened(condition.id);
    });
  }

  // The event has happened: its outgoing triggers go out.
  function happened(eventId) {
    var triggers = outgoingTriggers[eventId];
    if (!triggers) return;
    triggers.forEach(function (trigger) {
      if (trigger.weiter) waitingForWeiter[trigger.id] = trigger;
      else deliver(trigger, false);
    });
    updateAdvanceButtons();
  }

  // Lets a trigger arrive: after its delay, at its target. `now` runs a trigger without delay right here instead of on the next
  // turn of the event loop - for the press of Weiter, which the learner is waiting on.
  function deliver(trigger, now) {
    var generation = graphGeneration;
    var arrive = function () {
      if (generation !== graphGeneration) return;
      if (overDeliveryCap()) {
        if (window.console) console.warn("Weft: too many triggers at once - a loop of events without delay?");
        return;
      }
      trigger_(trigger.to);
    };
    if (now && !trigger.delayMs) arrive();
    else setTimeout(arrive, trigger.delayMs || 0);
  }

  // Something reached the event: its action runs (and says itself when the event has happened), or - no action - it happens.
  function trigger_(eventId) {
    var perform = performers[eventId];
    if (perform) perform();
    else happened(eventId);
  }

  // The learner pressed Weiter (Space, →, a tap, a button): every trigger that is waiting for it arrives.
  function weiter() {
    var waiting = waitingForWeiter;
    // With a required task still open, what would leave the page waits (and stays waiting), and only the builds arrive.
    var held = {};
    if (hasRequiredPending()) {
      Object.keys(waiting).forEach(function (id) {
        if (!isBuildTrigger(waiting[id])) {
          held[id] = waiting[id];
          delete waiting[id];
        }
      });
      if (Object.keys(waiting).length === 0) {
        // (Nothing is there to arrive: the press is turned down, and a learner who cannot see the button is told.)
        waitingForWeiter = held;
        if (Object.keys(held).length > 0) announce(uiString("requiredFirst"));
        updateAdvanceButtons();
        return;
      }
    }
    waitingForWeiter = held;
    if (Object.keys(waiting).some(function (id) { return isBuildTrigger(waiting[id]); })) buildsDone++;
    announceAppearing = true;
    try {
      Object.keys(waiting).forEach(function (id) {
        deliver(waiting[id], true);
      });
    } finally {
      announceAppearing = false;
    }
    updateAdvanceButtons();
    reportState();
  }

  // The keyframes of one block animation as an Aufbau (hidden -> shown); an Abbau plays them
  // backwards (effectFrames with phase "exit"), except where the opposite isn't simply the reverse.
  // translate/clip-path/filter (not transform): composes with a block's own rotate().
  var WIPE_HIDDEN = {
    right: "inset(0 100% 0 0)", // uncovered from the left edge towards the right one
    left: "inset(0 0 0 100%)",
    down: "inset(0 0 100% 0)",
    up: "inset(100% 0 0 0)",
  };
  var MOVE_SIDE_ANGLES = { right: 0, down: 90, left: 180, up: 270 };

  // The angle of the side a "move" comes from / goes to, in degrees (see BlockEffect.moveDirection and moveAngle).
  function moveSideAngle(effect) {
    if (effect.moveDirection === "angle") return Number(effect.moveAngle) || 0;
    var angle = MOVE_SIDE_ANGLES[effect.moveDirection];
    return angle === undefined ? 0 : angle;
  }

  function effectFrames(wrap, effect, phase) {
    // No animation for someone who asks for less motion: the block just appears / goes.
    if (prefersReducedMotion()) return null;
    var type = effect.type;
    var frames = null;
    if (type === "fade") {
      // A small movement along with it (core/types.ts, BlockEffect.motion): a little way - 2.5% of the slide's width - or a little smaller.
      if (effect.motion === "up") frames = [{ opacity: 0, translate: "0 -2.5cqw" }, { opacity: 1, translate: "0 0" }];
      else if (effect.motion === "down") frames = [{ opacity: 0, translate: "0 2.5cqw" }, { opacity: 1, translate: "0 0" }];
      else if (effect.motion === "scale") frames = [{ opacity: 0, scale: "0.92" }, { opacity: 1, scale: "1" }];
      else frames = [{ opacity: 0 }, { opacity: 1 }];
    } else if (type === "move") {
      // From the side the effect names, one length of the block away (its own width and height: that is what the percentages of
      // `translate` are of) - an angle is counted like that of a gradient: 0 is the right, 90 the bottom.
      var side = moveSideAngle(effect) * Math.PI / 180;
      frames = [{ translate: (Math.cos(side) * 100).toFixed(2) + "% " + (Math.sin(side) * 100).toFixed(2) + "%" }, { translate: "0 0" }];
    } else if (type === "iris") {
      // 75% of the circle's reference length (the diagonal / sqrt 2) is past every corner.
      frames = [{ clipPath: "circle(0% at 50% 50%)" }, { clipPath: "circle(75% at 50% 50%)" }];
    } else if (type === "wipe") {
      var hidden = WIPE_HIDDEN[effect.direction || "right"] || WIPE_HIDDEN.right;
      frames = [{ clipPath: hidden }, { clipPath: "inset(0 0 0 0)" }];
      // Abbau: covered up the way the wipe travels, i.e. from the edge the Aufbau started at.
      if (phase === "exit") {
        var covered = { right: "inset(0 0 0 100%)", left: "inset(0 100% 0 0)", down: "inset(100% 0 0 0)", up: "inset(0 0 100% 0)" };
        return [{ clipPath: "inset(0 0 0 0)" }, { clipPath: covered[effect.direction || "right"] || covered.right }];
      }
    } else if (type === "blur") {
      frames = [{ opacity: 0, filter: "blur(24px)" }, { opacity: 1, filter: "blur(0px)" }];
    } else if (type === "anvil") {
      // Falls in from above the slide (down to the block's own bottom edge, however low it sits),
      // lands hard and settles with a small bounce. The Abbau is the opposite: it shoots upwards.
      var rise = "0 -" + (wrap.offsetTop + wrap.offsetHeight + 8) + "px";
      if (phase === "exit") return [{ translate: "0 0", easing: "cubic-bezier(.5,0,1,.6)" }, { translate: rise }];
      return [
        { translate: rise, offset: 0, easing: "cubic-bezier(.5,0,1,.5)" },
        { translate: "0 0", offset: 0.7, easing: "ease-out" },
        { translate: "0 -3%", offset: 0.82, easing: "ease-in" },
        { translate: "0 0", offset: 1 },
      ];
    }
    if (frames && phase === "exit") frames.reverse();
    return frames;
  }

  // The ids of the events a block makes - in the same shape the editor's graph uses (document/pageTimeline.ts's *NodeId functions);
  // kept in sync by hand, this file can't import them.
  function blockEffectEventId(blockId, phase) {
    return "block-" + phase + ":" + blockId;
  }
  function blockActionEventId(blockId, effectId) {
    return "block-action:" + blockId + ":" + effectId;
  }
  function quizFillEventId(blockId) {
    return "quiz-fill:" + blockId;
  }
  function quizSubmitEventId(blockId, outcome) {
    return outcome ? "quiz-submit:" + blockId + ":" + outcome : "quiz-submit:" + blockId;
  }
  function listItemEventId(blockId, itemId) {
    return "list-item:" + blockId + ":" + itemId;
  }
  function videoStartEventId(blockId) {
    return "video-start:" + blockId;
  }
  function videoStopEventId(blockId, stopPointId) {
    return "video-stop:" + blockId + ":" + stopPointId;
  }
  function videoEndEventId(blockId) {
    return "video-end:" + blockId;
  }
  function videoResumeEventId(blockId, stopPointId) {
    return "video-resume:" + blockId + ":" + stopPointId;
  }

  /**
   * Shows `target` (hidden inline until now) with an Aufbau `effect`, then calls `done`.
   *
   * The element stays visibility:hidden inline until the effect is over, and the animation itself says "visible" (visibility is
   * animatable, and fill: "both" keeps both ends in force): so it is already shown - at its starting state - from the very first
   * frame of the animation (no flash of the finished element before it begins), and stays shown at its end state however late
   * the "finish" event is delivered. That event comes with a rendered frame, which a page in a throttled or hidden iframe can
   * hold back for a long time, or never get - so the effect is completed by the animation's end OR a timer just after its
   * duration, whichever is first (once()): inline state cleaned up, and `done` called - the event that the next build in the
   * Weiter chain is waiting for.
   */
  function revealWithEffect(target, effect, done) {
    var frames = effectFrames(target, effect, "entrance");
    if (frames) {
      var duration = effect.durationMs || 500;
      var visible = frames.map(function (frame) {
        return Object.assign({ visibility: "visible" }, frame);
      });
      // Anvil lands on its own timing curves; the others ease as a whole.
      var animation = target.animate(visible, { duration: duration, easing: effect.type === "anvil" ? "linear" : "ease", fill: "both" });
      var complete = once(function () {
        target.style.visibility = "";
        animation.cancel();
        done();
      });
      animation.onfinish = complete;
      setTimeout(complete, duration + 100);
    } else {
      target.style.visibility = "";
      done();
    }
  }

  /**
   * The items of a list whose Aufbau is each item's (ListBlock.itemEntrance): the item events are in the page's graph; every item
   * is hidden until its event happens and then appears with the list's effect, and the event goes on to its outgoing triggers
   * (usually the next item, on Weiter).
   */
  function applyListItemEffects(block, itemElements) {
    var effect = block.entranceEffect || { type: "none", durationMs: 500 };
    block.items.forEach(function (item) {
      var id = listItemEventId(block.id, item.id);
      var itemEl = itemElements[item.id];
      if (!graphEvents[id] || !itemEl) return;
      itemEl.style.visibility = "hidden";
      var shown = false;
      performers[id] = function () {
        if (shown) return;
        shown = true;
        if (announceAppearing) announce(String(itemEl.textContent || "").replace(/\s+/g, " ").trim());
        revealWithEffect(itemEl, effect, function () {
          happened(id);
        });
      };
    });
  }

  /**
   * Wires up one block's own Aufbau/Abbau (see BaseBlock.entranceEffect/exitEffect in core/types.ts): the block's events are in the
   * page's graph (page.graph.events) when the effect is configured - an Aufbau means the block is hidden until its event
   * happens, which it does when a trigger reaches it (see performers) and the animation (or its absence: "none" reveals instantly)
   * has run. With no Aufbau at all (entranceEffect.type "off", the default) the block is simply there from the start. An Abbau
   * likewise. Once either has happened, the event goes on to its own outgoing triggers - another Aufbau on Weiter, a video that
   * starts, the page that is left.
   */
  function applyBlockEffects(wrap, block, page) {
    // (A picture of the page: every block just stands there.)
    if (renderAll) return;
    var entrance = block.entranceEffect || { type: "none", durationMs: 500 };
    var exit = block.exitEffect || { type: "none", durationMs: 500 };
    var entranceId = blockEffectEventId(block.id, "entrance");
    var exitId = blockEffectEventId(block.id, "exit");

    // An Aufbau that is configured (any type but "off") means the block is not there until the Aufbau event happens.
    // Whether the block is there now (after its Aufbau, until its Abbau) - an Aufbau of a block that is there does nothing, and
    // nothing happens again (so a loop through an Aufbau settles); one that has gone again can come back (a time mark of a video
    // that is reached once more).
    var shown = false;
    var gone = false;
    // The animation of an Abbau stays in force (fill forwards) until the block comes back - then it must go.
    var exitAnimation = null;
    if (graphEvents[entranceId]) {
      wrap.style.visibility = "hidden";
      performers[entranceId] = function () {
        if (shown) return;
        shown = true;
        gone = false;
        // What appears because the learner pressed Weiter is told to a screen reader (what is there to see is not there to hear).
        if (announceAppearing) announce(speechOfBlock(wrap, block));
        if (exitAnimation) {
          exitAnimation.cancel();
          exitAnimation = null;
        }
        revealWithEffect(wrap, entrance, function () {
          happened(entranceId);
        });
      };
    }
    // else: no Aufbau at all ("off") - stays at its natural visibility (visible), no event for it.

    if (graphEvents[exitId]) {
      // Idempotent, and also run by a timer shortly after the animation's duration - see the Aufbau above for why a
      // "finish" event alone can't be relied on.
      var hideExit = once(function () {
        wrap.style.visibility = "hidden";
        shown = false;
        happened(exitId);
      });
      performers[exitId] = function () {
        if (gone) return;
        gone = true;
        // (A fresh `once` for a block that comes back and goes again.)
        hideExit = once(function () {
          wrap.style.visibility = "hidden";
          shown = false;
          happened(exitId);
        });
        var duration = exit.durationMs || 500;
        // fill: "forwards" keeps the end state until hideExit hides the block - no frame at the
        // original state in between.
        var animation = null;
        var frames = effectFrames(wrap, exit, "exit");
        if (frames) {
          animation = wrap.animate(frames, { duration: duration, easing: exit.type === "anvil" ? "linear" : "ease", fill: "forwards" });
          exitAnimation = animation;
        }
        if (animation) {
          animation.onfinish = hideExit;
          setTimeout(hideExit, duration + 100);
        } else {
          hideExit();
        }
      };
    }
  }

  /**
   * The Aktionseffekte of a block (ActionEffect in core/types.ts): each is an event of the page's graph; when it is made to happen the
   * block moves (and turns), shakes or blinks, and the event has happened once that is over. They use the CSS properties `translate`
   * and `rotate` - which do not meet the `transform` of the block's own rotation or of its Aufbau/Abbau - and a move leaves the block
   * where it went: the next effect starts from there (`state`, in units of the slide's width: cqw).
   */
  function applyActionEffects(wrap, block) {
    if (renderAll) return;
    var effects = block.actionEffects || [];
    if (!effects.length) return;
    var state = { x: 0, y: 0, rotation: 0 };
    var aspect = slideAspectNumeric();
    function settle() {
      wrap.style.translate = state.x || state.y ? state.x + "cqw " + state.y + "cqw" : "";
      wrap.style.rotate = state.rotation ? state.rotation + "deg" : "";
    }
    function translation(x, y) {
      return x + "cqw " + y + "cqw";
    }
    effects.forEach(function (effect) {
      var id = blockActionEventId(block.id, effect.id);
      if (!graphEvents[id]) return;
      performers[id] = function () {
        var duration = Math.max(50, effect.durationMs || 500);
        var reduced = prefersReducedMotion();
        var frames = null;
        var onDone = settle;
        if (effect.type === "move") {
          // The way: percent of the slide's width and height from where the block is now, as a curve through the points (the units of
          // its height turned into those of its width, so the curve is not stretched).
          var way = [{ x: 0, y: 0 }].concat(
            (effect.path || []).map(function (point) {
              return { x: Number(point.x) || 0, y: (Number(point.y) || 0) / aspect };
            }),
          );
          var steps = 48;
          var points = way.length > 1 ? arrowEvenPoints(way, steps) : [way[0]];
          var end = points[points.length - 1];
          var turn = Number(effect.rotation) || 0;
          var fromX = state.x;
          var fromY = state.y;
          var fromRotation = state.rotation;
          state.x = fromX + end.x;
          state.y = fromY + end.y;
          state.rotation = fromRotation + turn;
          if (!reduced) {
            frames = (points.length > 1 ? points : [points[0], points[0]]).map(function (point, i, all) {
              return { translate: translation(fromX + point.x, fromY + point.y), rotate: fromRotation + (turn * i) / (all.length - 1) + "deg" };
            });
          }
        } else if (!reduced && effect.type === "shake") {
          // Once to and fro, fading out, in the block's own place.
          var amounts = [0, -1, 1, -0.8, 0.8, -0.5, 0.5, -0.2, 0];
          frames = amounts.map(function (amount) {
            return { translate: translation(state.x + amount * 1.1, state.y), rotate: state.rotation + amount * 2 + "deg" };
          });
        } else if (!reduced && effect.type === "blink") {
          frames = [1, 0.15, 1, 0.15, 1].map(function (opacity) {
            return { opacity: opacity };
          });
        }
        var finish = once(function () {
          settle();
          happened(id);
        });
        if (!frames) {
          finish();
          return;
        }
        var animation = wrap.animate(frames, {
          duration: duration,
          easing: effect.type === "move" ? effect.easing || "ease-in-out" : effect.type === "shake" ? "linear" : "ease-in-out",
          fill: "none",
        });
        // A move is settled first, so that there is no frame at the old place when the animation ends.
        if (effect.type === "move") settle();
        animation.onfinish = finish;
        setTimeout(finish, duration + 100);
      };
    });
  }

  // Same icon set as the editor canvas's video2 watermark (see BlockView.tsx) - play, not video2,
  // because unlike there, clicking this genuinely starts playback. Inlined rather than fetched:
  // this file has to keep working as a single self-contained script once exported (see the file
  // header), with no separate icon file shipped alongside it.
  var PLAY_ICON_SVG = '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 54"><path fill="#28497c" d="m14.99 44.91 27.01-18-27-18z"/></svg>';

  function positionStyle(position) {
    return (
      "position:absolute;left:" +
      position.x +
      "%;top:" +
      position.y +
      "%;width:" +
      position.width +
      "%;height:" +
      position.height +
      "%;" +
      (position.rotation ? "transform:rotate(" + position.rotation + "deg);" : "")
    );
  }

  // What an embedded page says, as renderIframe (blocks/iframe/render.js, inlined ahead of this file) draws it. `heightOverWidth` is the block's shape
  // on the slide, from which the height of the frame the page sees is derived (see renderIframe).
  function iframeProps(block) {
    var ratio = parseAspectRatio();
    return {
      id: block.id,
      url: block.url,
      sandbox: block.sandbox || [],
      allow: block.allow,
      qrCode: !!block.qrCode,
      presentationUrl: block.presentationUrl,
      forcedViewportWidth: block.forcedViewportWidth,
      heightOverWidth: (ratio[1] / ratio[0]) * (block.position.height / block.position.width),
      qrSvg: qrCodeSvgs[block.id] || null,
    };
  }

  function renderStaticBlock(block, page) {
    var wrap = el("div", { class: "weft-block weft-block-" + block.kind, "data-weft-block": block.id, style: positionStyle(block.position) });
    if (block.kind === "text") {
      // The words, the scrolling and the box are what renderText (blocks/text/render.js, inlined ahead of this file) draws.
      var textProps = function () {
        return { html: blockHtml(block), scrollable: !!block.scrollable, box: block.box };
      };
      var textInstance = renderText(wrap, textProps(), { mode: "play", applyVariables: applyVariablesToNode });
      languageRefreshers.push(function () {
        textInstance.update(textProps());
      });
    } else if (block.kind === "list") {
      // The points and their marks are what renderList (blocks/list/render.js, inlined ahead of this file) draws; the player hides and shows the points
      // one by one where the Aufbau is each point's (applyListItemEffects).
      var listProps = function () {
        return {
          items: block.items.map(function (item) {
            return { id: item.id, html: listItemHtml(block, item) };
          }),
          marker: block.marker,
          markerColor: block.markerColor,
          markerSrc: block.markerAssetId ? assetSrc(block.markerAssetId) : null,
          markerSize: block.markerSize,
          spacing: block.spacing,
        };
      };
      var listInstance = renderList(wrap, listProps(), { mode: "play", applyVariables: applyVariablesToNode });
      languageRefreshers.push(function () {
        listInstance.update(listProps());
      });
      wrap.weftListItems = listInstance.rows;
    } else if (block.kind === "language") {
      languageSwitches.push(renderLanguage(wrap, languageProps(), { mode: "play", text: uiString, setLanguage: setLanguage }));
    } else if (block.kind === "code") {
      // The box and the highlighted text (the page is built with the HTML of every code block) are what renderCode (blocks/code/render.js, inlined ahead of
      // this file) draws: the very code the editor draws it with.
      renderCode(wrap, { html: codeHtml[block.id] || "", theme: block.theme, fontSize: block.fontSize, transparentBackground: !!block.transparentBackground }, { mode: "play" });
    } else if (block.kind === "tex") {
      // The formula (typeset when the page is built) scaled to its box, and its colour: renderTex (blocks/tex/render.js, inlined ahead of this file).
      renderTex(wrap, { html: texHtml[block.id] || "", color: block.color || "" }, { mode: "play" });
    } else if (block.kind === "image") {
      if (block.mask || block.effect) {
        // imageSvgMarkup is core/runtime/imageGeometry.js, embedded ahead of this script (buildRuntimeHtml.ts) - the very code
        // the editor draws the picture with. boxAspect: the block's real width : height on the slide.
        var imageBoxAspect = block.position.height > 0 ? (block.position.width / block.position.height) * slideAspectNumeric() : 1;
        imageInstanceCounter += 1;
        wrap.classList.add("weft-block-image-masked");
        wrap.innerHTML = imageSvgMarkup(block, imageBoxAspect, assetSrc(block.assetId), block.id + "-" + imageInstanceCounter);
      } else {
        wrap.appendChild(el("img", { src: assetSrc(block.assetId), alt: block.alt, style: "display:block;width:100%;height:100%;object-fit:contain;" }, []));
      }
    } else if (block.kind === "video" || block.kind === "audio") {
      // A sound works like a video, only without a picture (and without the big play button): it has the same events, time marks and
      // performers - and either a player of its own or nothing to see at all.
      var isAudio = block.kind === "audio";
      var videoWrap = el("div", { class: isAudio ? "weft-audio-wrap" : "weft-video-wrap" }, []);
      var videoEl = el(isAudio ? "audio" : "video", {
        src: assetSrc(block.assetId),
        class: isAudio ? "weft-audio-el" : "weft-video-el",
        playsinline: "",
        controls: (isAudio ? block.appearance === "player" : block.controls) ? "" : undefined,
        loop: block.loop ? "" : undefined,
      }, []);
      if (isAudio && block.appearance !== "player") videoWrap.style.display = "none";
      // Set as live properties, not just attributes: the `muted` content attribute only seeds
      // defaultMuted, not the actual playback-affecting `muted` property, and browsers only
      // honor autoplay at all when that live property is already true at play() time - so
      // setting the attribute alone (as el()'s other boolean attrs do above) would silently
      // leave audible autoplay blocked.
      videoEl.muted = follower || (!isAudio && !!block.muted);
      // Never natively: a video that starts by itself does so because a trigger of the graph (from the start of the page, in the
      // simplest case) tells it to - see its performer below. Native autoplay would start it a second way.
      videoEl.autoplay = false;

      // Fires each stop point's own event (see videoStopEventId - a block elsewhere can use it as
      // an Aufbau/Abbau trigger, see BlockEffectEditor) the moment playback reaches it, and pauses
      // too if any of the ones crossed this tick has stopsVideo true (see VideoStopPointDialog in
      // BlockPanel.tsx) - detected as "crossed since the last tick" rather than "currentTime ===
      // timeSeconds" (timeupdate doesn't fire every frame, so an exact match could easily be
      // skipped over). lastStopCheckTime starts at -1, not 0, so a stop point placed at the very
      // start (time 0) still fires on the first tick instead of being treated as already-passed.
      // Doesn't force currentTime back to the stop point itself on pause - it only pauses wherever
      // playback happens to be when the check catches it, so scrubbing past one on purpose doesn't
      // get yanked back.
      // The stop point that has paused the video, until it goes on: that is an event of its own ("video-resume").
      var pausedAtStopPoint = null;
      if (block.stopPoints && block.stopPoints.length > 0) {
        var lastStopCheckTime = -1;
        videoEl.addEventListener("timeupdate", function () {
          var current = videoEl.currentTime;
          var shouldPause = false;
          var pausedHere = null;
          for (var i = 0; i < block.stopPoints.length; i++) {
            var stopPoint = block.stopPoints[i];
            if (lastStopCheckTime < stopPoint.timeSeconds && current >= stopPoint.timeSeconds) {
              happened(videoStopEventId(block.id, stopPoint.id));
              if (stopPoint.stopsVideo) {
                shouldPause = true;
                pausedHere = stopPoint.id;
              }
            }
          }
          if (shouldPause) {
            pausedAtStopPoint = pausedHere;
            videoEl.pause();
          }
          lastStopCheckTime = current;
        });
      }

      // A big, obviously-clickable play button over the video - shown until playback actually
      // starts (by a click here or, once it lands, a successful autoplay), then hidden again on
      // pause/end so it doesn't sit on top of the video's own controls bar (if block.controls
      // enabled one) fighting over the same "play" affordance while it's already playing.
      var playButton = el("button", { type: "button", class: "weft-video-play", "aria-label": uiString("play") }, []);
      languageRefreshers.push(function () {
        if (playButton) playButton.setAttribute("aria-label", uiString("play"));
      });
      playButton.innerHTML = PLAY_ICON_SVG;
      if (isAudio) playButton = null;
      if (playButton) playButton.addEventListener("click", function (ev) {
        ev.stopPropagation();
        // play() rejects if the element is torn down (slide navigation) before it resolves -
        // nothing to recover from there, just avoid an unhandled-rejection console error over it.
        videoEl.play().catch(function () {});
      });
      // hasFiredStart guards against "video-start" happening again on every resume-after-pause - native <video> fires "play" each
      // time playback (re)starts, but the event only means the *first* time, matching what "Video startet" shows in the
      // editor's graph. Whatever made the video start - a trigger or the learner's own press of play - ends up here.
      var hasFiredStart = false;
      videoEl.addEventListener("play", function () {
        if (playButton) playButton.classList.add("is-hidden");
        if (pausedAtStopPoint !== null) {
          var resumedAt = pausedAtStopPoint;
          pausedAtStopPoint = null;
          happened(videoResumeEventId(block.id, resumedAt));
        }
        if (!hasFiredStart) {
          hasFiredStart = true;
          happened(videoStartEventId(block.id));
        }
      });
      // What arrives at "Video startet": play. (The event itself happens in the listener above.)
      performers[videoStartEventId(block.id)] = function () {
        videoEl.play().catch(function () {});
      };
      // Never fires at all for a looping video (the loop attribute pre-empts "ended" natively) -
      // matches "video-end-loop"/the ∞ icon's own meaning of "doesn't really end" exactly.
      videoEl.addEventListener("ended", function () {
        happened(videoEndEventId(block.id));
      });
      videoEl.addEventListener("pause", function () {
        if (playButton) playButton.classList.remove("is-hidden");
      });

      videoWrap.appendChild(videoEl);
      if (playButton) videoWrap.appendChild(playButton);
      wrap.appendChild(videoWrap);
    } else if (block.kind === "iframe") {
      var iframeInstance = renderIframe(wrap, iframeProps(block), { mode: "play", text: uiString });
      languageRefreshers.push(function () {
        iframeInstance.update(iframeProps(block));
      });
    } else if (block.kind === "shape") {
      // renderShape (blocks/shape/render.js, inlined ahead of this file) draws the shape: the very code the editor draws it with.
      renderShape(wrap, { block: block, slideAspect: slideAspectNumeric() }, { mode: "play" });
      if (block.blurBehind && (block.shapeKind === "rectangle" || block.shapeKind === "ellipse")) {
        // On the block itself (not a child of it): a fade-in of the block then does not cut off what is behind it.
        wrap.style.cssText += backdropBlurStyle() + "border-radius:" + shapeBlurCorners(block) + ";";
      }
    } else if (block.kind === "files") {
      wrap.appendChild(filesBoxElement(block));
    } else if (block.kind === "arrow") {
      // renderArrow (blocks/arrow/render.js, inlined ahead of this file) draws the arrow: the very code the editor draws it with. boxAspect: the block's
      // real width : height on the slide.
      var arrowBoxAspect = block.position.height > 0 ? (block.position.width / block.position.height) * slideAspectNumeric() : 1;
      renderArrow(wrap, { block: block, boxAspect: arrowBoxAspect }, { mode: "play" });
    }
    return wrap;
  }

  // ---- FilesBlock: files to download, optionally behind a password ----
  // filesCheckPassword / filesDecrypt (core/runtime/filesCrypto.js) are embedded ahead of this script, the very code
  // the editor encrypted with. Files of a protected block are encrypted (AES-GCM) in the archive: the list shows
  // only once the right password was entered, and each download is fetched, decrypted here and saved from memory.
  // (Fetching needs the module to be served - an LMS, a web server - not opened from a folder.)
  function filesSizeText(bytes) {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1).replace(".", ",") + " MB";
    return Math.max(1, Math.round(bytes / 1024)) + " KB";
  }

  // In the editor's preview the page around the module saves the file (see PreviewFrame.tsx): a sandboxed frame may not
  // download, and a desktop window has no download of its own.
  var savesViaHostEl = document.getElementById("weft-save-via-host");
  var savesViaHost = savesViaHostEl ? JSON.parse(savesViaHostEl.textContent || "false") === true : false;

  // The bytes of an encrypted file. An export keeps them as a script next to the page that calls weftEncryptedFile
  // (a page opened from a folder may not fetch() them, but may load a script); the editor's preview has them as a
  // data: URL, and a module that was saved rather than exported has them raw - those are fetched.
  var encryptedFiles = {};
  window.weftEncryptedFile = function (id, base64) {
    encryptedFiles[id] = base64;
  };

  function fetchBytes(url) {
    return fetch(url)
      .then(function (response) {
        if (!response.ok) throw new Error("download");
        return response.arrayBuffer();
      })
      .then(function (buffer) {
        return new Uint8Array(buffer);
      });
  }

  function loadEncryptedBytes(file) {
    if (assetUrlOverrides[file.id]) return fetchBytes(assetUrlOverrides[file.id]);
    return new Promise(function (resolve, reject) {
      if (encryptedFiles[file.id]) return resolve(filesFromBase64(encryptedFiles[file.id]));
      var script = document.createElement("script");
      script.src = assetSrc(file.id) + ".js";
      script.onload = function () {
        if (encryptedFiles[file.id]) resolve(filesFromBase64(encryptedFiles[file.id]));
        else reject(new Error("download"));
      };
      script.onerror = function () {
        fetchBytes(assetSrc(file.id)).then(resolve, reject);
      };
      document.head.appendChild(script);
    });
  }

  function filesSave(bytes, file) {
    if (savesViaHost && window.parent !== window) {
      window.parent.postMessage({ source: "weft-module", type: "save-file", name: file.name, mimeType: file.mimeType || "application/octet-stream", bytes: bytes }, "*");
      return;
    }
    var url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType || "application/octet-stream" }));
    var link = el("a", { href: url, download: file.name }, []);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 10000);
  }

  function filesBoxElement(block) {
    var box = el("div", { class: "weft-files" }, []);
    var heading = el("div", { class: "weft-files-title" }, []);
    heading.textContent = block.title || uiString("filesTitle");
    var message = el("div", { class: "weft-files-message", role: "status" }, []);
    var list = el("ul", { class: "weft-files-list" }, []);
    box.appendChild(heading);

    function showList(key) {
      list.innerHTML = "";
      (block.files || []).forEach(function (file) {
        var row = el("li", { class: "weft-files-row" }, []);
        var name = el("span", { class: "weft-files-name" }, []);
        name.textContent = file.name;
        var size = el("span", { class: "weft-files-size" }, []);
        size.textContent = filesSizeText(file.size);
        var action;
        if (key || savesViaHost) {
          action = el("button", { type: "button", class: "weft-files-download" }, []);
          action.addEventListener("click", function () {
            message.textContent = "";
            action.disabled = true;
            (key ? loadEncryptedBytes(file).then(function (stored) {
              return filesDecrypt(key, stored);
            }) : fetchBytes(assetSrc(file.id)))
              .then(function (bytes) {
                filesSave(bytes, file);
              })
              .catch(function () {
                message.textContent = uiString("filesFailed");
              })
              .then(function () {
                action.disabled = false;
              });
          });
        } else {
          action = el("a", { class: "weft-files-download", href: assetSrc(file.id), download: file.name }, []);
        }
        action.textContent = uiString("filesDownload");
        row.appendChild(name);
        row.appendChild(size);
        row.appendChild(action);
        list.appendChild(row);
      });
      box.appendChild(list);
    }

    box.appendChild(message);
    if (!block.protection) {
      showList(null);
    } else {
      // Not a <form>: a module may run in an iframe without allow-forms, where a form never fires "submit".
      var form = el("div", { class: "weft-files-form" }, []);
      var input = el("input", { type: "password", class: "weft-files-password", autocomplete: "off", "aria-label": uiString("filesPassword"), placeholder: uiString("filesPassword") }, []);
      var unlock = el("button", { type: "button", class: "weft-files-unlock" }, []);
      unlock.textContent = uiString("filesUnlock");
      form.appendChild(input);
      form.appendChild(unlock);
      var tryPassword = function () {
        if (unlock.disabled) return;
        message.textContent = "";
        unlock.disabled = true;
        filesCheckPassword(block.protection, input.value).then(function (key) {
          unlock.disabled = false;
          if (!key) {
            message.textContent = uiString("filesWrongPassword");
            return;
          }
          box.removeChild(form);
          showList(key);
        });
      };
      unlock.addEventListener("click", tryPassword);
      input.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") tryPassword();
      });
      // Keys that move the learner on through the module (Space, arrows) must not do that while typing a password.
      form.addEventListener("keydown", function (ev) {
        ev.stopPropagation();
      });
      box.appendChild(form);
    }
    return box;
  }

  // ---- ProgressBlock: a bar as long as the value of a variable (0 to 100) says ----
  // The variable is `progress` (the virtual one) unless the author chose another. The fill is always made to show where the bar
  // stood last (a bar of a layout is made anew with every slide - it starts where it was), and moved to the variable's value only once
  // that is settled: a slide first changes, then the value is what it is on the new slide, and then the fill moves (see settleProgressBars,
  // called when a transition is over and when a variable changes). Without `animate` it simply shows the value.
  var PROGRESS_MOVE_MS = 800;
  var shownProgress = {}; // block id -> what its bar showed last
  var progressBars = []; // the bars of the slide that is showing (reset with every slide)

  function progressTarget(block) {
    var current = variableValueByName(block.variable || "progress");
    var value = current ? Number(current.value) : 0;
    if (!isFinite(value)) value = 0;
    return Math.min(100, Math.max(0, value));
  }

  // What a progress bar says, as renderProgress (blocks/progress/render.js, inlined ahead of this file) draws it: how full it is and how long the fill
  // takes to get there (0: it jumps).
  function progressProps(block, value, moveMs) {
    return {
      value: value,
      moveMs: moveMs,
      color: block.color,
      trackColor: block.trackColor,
      rounded: block.rounded !== false,
      label: block.variable || "progress",
    };
  }

  function renderProgressBlock(block) {
    var wrap = el("div", { class: "weft-block weft-block-progress", "data-weft-block": block.id, style: positionStyle(block.position) });
    var target = progressTarget(block);
    var animated = !!block.animate && !renderAll;
    // Where the bar starts: where it stood (a first showing: empty), or - without animation, or in a picture of the slide - the value itself.
    var start = animated ? (shownProgress[block.id] !== undefined ? shownProgress[block.id] : 0) : target;
    if (!animated) shownProgress[block.id] = target;
    var instance = renderProgress(wrap, progressProps(block, start, 0), { mode: "play" });
    progressBars.push({ block: block, instance: instance, shown: start, animated: animated });
    return wrap;
  }

  // Moves every bar of the slide to the value of its variable. Not while a slide transition is running (it is called again when that is over).
  function settleProgressBars() {
    if (finishActiveTransition) return;
    progressBars.forEach(function (bar) {
      var target = progressTarget(bar.block);
      if (target === bar.shown) return;
      bar.shown = target;
      shownProgress[bar.block.id] = target;
      bar.instance.update(progressProps(bar.block, target, bar.animated && !prefersReducedMotion() ? PROGRESS_MOVE_MS : 0));
    });
  }

  // ---- RevealerBlock: an icon that opens a window around itself ----
  // The window opens with a click on the icon or with a trigger to its event (`revealer-open:<id>`), and closes with its x or Escape. Its button is an
  // event of its own (`revealer-button:<id>`) that does what a button block does. The icon, the window and its placing are what renderRevealer
  // (blocks/revealer/render.js, inlined ahead of this file) draws; the icon's picture is revealerIconSvg (revealerGeometry.js).
  function revealerProps(block) {
    var t = currentTranslation(block) || {};
    return {
      id: block.id,
      // The icon is a square as large as fits in the block's box.
      size: Math.min(block.position.width, block.position.height / slideAspectNumeric()),
      x: block.position.x,
      iconSvg: revealerIconSvg(block.icon, block.color),
      signColor: revealerSignColor(block.color),
      color: block.color,
      title: t.title !== undefined ? t.title : block.title,
      body: t.body !== undefined ? t.body : block.body,
      imageSrc: block.imageAssetId ? assetSrc(block.imageAssetId) : null,
      imageAlt: t.alt !== undefined ? t.alt : block.imageAlt,
      windowStyle: block.windowStyle === "light" ? "light" : "dark",
      button: block.button ? { text: t.text !== undefined ? t.text : block.button.text } : null,
    };
  }

  function renderRevealerBlock(block) {
    var wrap = el("div", { class: "weft-block weft-block-revealer", "data-weft-block": block.id, style: positionStyle(block.position) });
    var openEventId = "revealer-open:" + block.id;
    var buttonEventId = "revealer-button:" + block.id;
    var instance = renderRevealer(wrap, revealerProps(block), {
      mode: "play",
      text: uiString,
      // A click on the icon that opened the window is the event as well.
      opened: function () {
        happened(openEventId);
      },
      announce: announce,
    });
    languageRefreshers.push(function () {
      instance.update(revealerProps(block));
    });
    // A trigger to the event opens the window.
    performers[openEventId] = function () {
      instance.open();
      happened(openEventId);
    };
    var action = instance.button;
    if (action) {
      var buttonSpec = block.button;
      action.addEventListener("click", function () {
        if (pos >= history.length) {
          restart();
          return;
        }
        (buttonSpec.onClick || []).forEach(applyEffect);
        if (buttonSpec.action === "goto") {
          var shownBefore = pos;
          var lengthBefore = history.length;
          happened(buttonEventId);
          if (pos === shownBefore && history.length === lengthBefore) goToPage(buttonSpec.targetPageId);
        } else {
          happened(buttonEventId);
          if (buttonSpec.action === "prev") goPrev();
          else if (buttonSpec.action === "advance") weiter();
        }
      });
    }
    return wrap;
  }

  // ---- LinkBlock: a link to a page (opens in a new tab) ----

  // What a link says, in the language the learner works in: where it leads (linkHref, blocks/link/render.js, inlined ahead of this file, which
  // is also what renderLink draws it with) and its words.
  function linkProps(block) {
    var t = currentTranslation(block);
    return { href: linkHref(block.url), label: (t && t.text !== undefined ? t.text : block.text) || "" };
  }

  function renderLinkBlock(block) {
    var wrap = el("div", { class: "weft-block weft-block-link", "data-weft-block": block.id, style: positionStyle(block.position) });
    var instance = renderLink(wrap, linkProps(block), {
      mode: "play",
      icon: typeof linkIconSvg === "function" ? linkIconSvg() : "",
      // In the editor's preview and the player of a player file the page lives in a sandboxed frame that cannot open a tab: the window around it
      // does that for it (see ModuleFrame.tsx).
      open:
        savesViaHost && window.parent !== window
          ? function (url) {
              window.parent.postMessage({ source: "weft-module", type: "open-url", url: url }, "*");
            }
          : null,
    });
    languageRefreshers.push(function () {
      instance.update(linkProps(block));
    });
    return wrap;
  }

  // What a button says, in the language the learner works in: its label as HTML ("" with no words: the player's own "Weiter") and its look.
  function buttonProps(block) {
    var t = currentTranslation(block);
    var words = t && t.text !== undefined ? t.text : block.text;
    return { html: String(words || "").trim() ? buttonLabelHtml(block) : "", look: buttonLookStyle(block.appearance) };
  }

  function renderButtonBlock(block) {
    var wrap = el("div", { class: "weft-block weft-block-button", "data-weft-block": block.id, style: positionStyle(block.position) });
    // The label and the look are what renderButton (blocks/button/render.js, inlined ahead of this file) draws; what a click does is below.
    var instance = renderButton(wrap, buttonProps(block), { mode: "play", text: uiString, applyVariables: applyVariablesToNode });
    var button = instance.button;
    languageRefreshers.push(function () {
      instance.update(buttonProps(block));
    });
    // The click is an event of the page's graph (see core/eventGraph): whatever the author connected to it happens - by default
    // "Nächste Folie". Besides that:
    var clickEventId = "button-click:" + block.id;
    if (block.action === "prev") {
      button.disabled = pos <= 0;
      button.addEventListener("click", function () {
        (block.onClick || []).forEach(applyEffect);
        happened(clickEventId);
        goPrev();
      });
    } else if (block.action === "goto") {
      button.addEventListener("click", function () {
        if (pos >= history.length) {
          restart();
          return;
        }
        var shownBefore = pos;
        var lengthBefore = history.length;
        (block.onClick || []).forEach(applyEffect);
        happened(clickEventId);
        // Whatever the click triggered may have left the page already (a trigger to "Nächste Folie"): then that is where it went.
        if (pos === shownBefore && history.length === lengthBefore) goToPage(block.targetPageId);
      });
    } else {
      // "Weiter" (action "advance") is the same Weiter Space/→ is (see weiter): everything that waits for it arrives - the next
      // build, or the page that is left. "event" does nothing besides the event. Once the module has ended, either restarts it.
      // (Greyed out while its next press would leave a page that has a required task open, see weiterIsHeld.)
      if (block.action === "advance") advanceButtons.push(button);
      button.addEventListener("click", function () {
        if (pos >= history.length) {
          restart();
          return;
        }
        (block.onClick || []).forEach(applyEffect);
        happened(clickEventId);
        if (block.action === "advance") weiter();
      });
    }
    wrap.appendChild(button);
    return wrap;
  }

  // Same icon set as the editor canvas's own quiz preview (see BlockView.tsx) - accept for the
  // submit button, check-circle/remove-circle-full for the two feedback states, and the same
  // checkbox-checked/checkbox-unchecked pair the editor uses too, so the checkbox itself looks
  // pixel-identical here as there instead of falling back to whatever the OS/browser draws for a
  // native checkbox (see the option-row markup below for how the real, still-functional
  // <input type="checkbox"> is kept but visually replaced by these two icons).
  var QUIZ_SUBMIT_ICON_SVG =
    '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 54"><path fill="#28497c" d="m50.98 16.77-8.41-8.42L22.12 28.8 11.41 18.1l-8.4 8.41 19.12 19.12z"/></svg>';
  var QUIZ_CORRECT_ICON_SVG =
    '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 54"><path d="M40.84 21.11 36 16.25 24.18 28 18 21.87l-4.84 4.85 11 11ZM27 8A19 19 0 1 1 8 27 19 19 0 0 1 27 8m0-5a24 24 0 1 0 24 24A24 24 0 0 0 27 3" fill="#28497c"/></svg>';
  var QUIZ_INCORRECT_ICON_SVG =
    '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 54"><path d="M40.63 30.41v-6.82H13.24v6.82ZM27 8A19 19 0 1 1 8 27 19 19 0 0 1 27 8m0-5a24 24 0 1 0 24 24A24 24 0 0 0 27 3" fill="#28497c"/></svg>';
  var QUIZ_CHECKBOX_UNCHECKED_SVG =
    '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="geometricPrecision" fill="#28497c"><path d="M14.5 1.5v13h-13v-13zM16 0H0v16h16z"/></svg>';
  var QUIZ_CHECKBOX_CHECKED_SVG =
    '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="geometricPrecision" fill="#28497c"><path d="M13.055 5.848 11.28 4.073 6.972 8.379 4.715 6.127 2.946 7.899l4.027 4.026z"/><path d="M14.5 1.5v13h-13v-13zM16 0H0v16h16z"/></svg>';

  // The round buttons of a quiz where only one answer can be picked (see QuizBlock.single).
  var QUIZ_RADIO_UNCHECKED_SVG =
    '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="geometricPrecision" fill="#28497c"><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0m0 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z"/></svg>';
  var QUIZ_RADIO_CHECKED_SVG =
    '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="geometricPrecision" fill="#28497c"><path d="M8 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/><path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0m0 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z"/></svg>';

  // What a quiz says, in the language the learner works in - what renderQuiz (blocks/quiz/render.js, inlined ahead of this file) draws it with.
  function quizProps(block) {
    return {
      id: block.id,
      question: quizQuestionHtml(block),
      options: block.options.map(function (option) {
        return { id: option.id, html: quizOptionHtml(block, option) };
      }),
      correctOptionIds: block.correctOptionIds,
      open: block.open === true,
      single: block.single === true,
      hiddenOptionIds: quizHandles[block.id] ? quizHandles[block.id].hidden : [],
      explanation: quizExplanationText(block),
    };
  }

  function renderQuizBlock(block) {
    var wrap = el("div", { class: "weft-block weft-block-quiz", "data-weft-block": block.id, style: positionStyle(block.position) });
    if (block.required) requiredPending[block.id] = true;
    var open = block.open === true; // an open question: nothing is right or wrong
    // What a script can do with the quiz (getBlock in a logic block's code): take answers away - see quizScriptView.
    var handle = (quizHandles[block.id] = { hidden: [], refresh: function () {} });
    var instance = renderQuiz(wrap, quizProps(block), {
      mode: "play",
      text: uiString,
      icons: {
        submit: QUIZ_SUBMIT_ICON_SVG,
        correct: QUIZ_CORRECT_ICON_SVG,
        incorrect: QUIZ_INCORRECT_ICON_SVG,
        unchecked: QUIZ_CHECKBOX_UNCHECKED_SVG,
        checked: QUIZ_CHECKBOX_CHECKED_SVG,
        radioUnchecked: QUIZ_RADIO_UNCHECKED_SVG,
        radioChecked: QUIZ_RADIO_CHECKED_SVG,
      },
      applyVariables: applyVariablesToNode,
      // Fires once, the moment the learner picks a first option - matches "Ausfüllen" in the editor's own graph exactly (see quizFillNodeId in
      // pageTimeline.ts), which is likewise about the first pick, not every subsequent one.
      fill: function () {
        happened(quizFillEventId(block.id));
      },
      submit: function (result) {
        var mark = scoreMark(block);
        (result.correct ? block.onCorrect : block.onIncorrect).forEach(applyEffect);
        // Each answer on its own: handled right (ticked if it is a correct one, left alone if it isn't) or wrong.
        block.options.forEach(function (option) {
          var ticked = result.ticked.indexOf(option.id) !== -1;
          var right = open ? ticked : ticked === (block.correctOptionIds.indexOf(option.id) !== -1);
          ((right ? option.onRight : option.onWrong) || []).forEach(applyEffect);
        });
        scoreRecord(block, mark, open ? "answered" : result.correct ? "right" : "wrong");
        requiredDone(block.id);
        // Fires both the plain, outcome-agnostic event (for a trigger configured against the generic "Quiz abgeschickt" node - see quizSubmitNodeId in
        // pageTimeline.ts, built when neither advanceOnCorrect nor advanceOnIncorrect is on) AND the one matching this particular submission's own
        // actual outcome (for a trigger configured against the "richtig"/"falsch"-specific node, built once that outcome has its own lane) - whichever of
        // the two an author could actually have picked in the editor has a real listener here; the other is just an id nothing happens to be registered
        // against, same as any other no-op happened() call. Going on to the next page after the feedback is a trigger of the graph (see
        // core/eventGraph/buildEventGraph.ts) - nothing to do for it here.
        happened(quizSubmitEventId(block.id));
        happened(quizSubmitEventId(block.id, result.correct ? "richtig" : "falsch"));
      },
      announce: announce,
    });
    handle.refresh = function () {
      instance.update(quizProps(block));
    };
    languageRefreshers.push(handle.refresh);
    return wrap;
  }

  // ---- CheckerBlock: a checkbox with a text, and "Abschicken" under it ----
  // It is built of the markup of a quiz with one answer (and so has the look of the module's style - the corners, the typeface, the
  // colours of an answer and of the button - from the same stylesheet), and has the events of a quiz: the first click on the box
  // (quiz-fill), submitted (quiz-submit) and, with it, "richtig" for a ticked box and "falsch" for one that is not.

  function checkerLabel(block) {
    var t = currentTranslation(block);
    return (t && t.text !== undefined ? t.text : block.text) || "";
  }

  // What a checker says, as renderChecker (blocks/checker/render.js, inlined ahead of this file) draws it.
  function checkerProps(block) {
    return { id: block.id, text: checkerLabel(block) };
  }

  function renderCheckerBlock(block) {
    var wrap = el("div", { class: "weft-block weft-block-checker", "data-weft-block": block.id, style: positionStyle(block.position) });
    if (block.required) requiredPending[block.id] = true;
    var instance = renderChecker(wrap, checkerProps(block), {
      mode: "play",
      text: uiString,
      icons: { submit: QUIZ_SUBMIT_ICON_SVG, thanks: QUIZ_CORRECT_ICON_SVG, unchecked: QUIZ_CHECKBOX_UNCHECKED_SVG, checked: QUIZ_CHECKBOX_CHECKED_SVG },
      applyVariables: applyVariablesToNode,
      // The first click on the box is the quiz's "first answer" (see quizFillEventId).
      fill: function () {
        happened(quizFillEventId(block.id));
      },
      submit: function (result) {
        var mark = scoreMark(block);
        ((result.ticked ? block.onChecked : block.onUnchecked) || []).forEach(applyEffect);
        scoreRecord(block, mark, result.ticked ? "ticked" : "unticked");
        requiredDone(block.id);
        happened(quizSubmitEventId(block.id));
        happened(quizSubmitEventId(block.id, result.ticked ? "richtig" : "falsch"));
      },
      announce: announce,
    });
    languageRefreshers.push(function () {
      instance.update(checkerProps(block));
    });
    return wrap;
  }

  // ---- SolutionBlock ("Lösungswort"): a field for a word, and "Abschicken" ----
  // The field has the look of an answer of a quiz (the module's style: corners, typeface), the button is the quiz's. It has the events of a quiz: the
  // first letter typed (quiz-fill), submitted (quiz-submit) and, with it, "richtig" for the solution and "falsch" for any other word - for every
  // try. It is locked once the word was right or the last try was wrong; with no limit it is only locked by the right word.

  // What a solution word says, in the language the learner works in (the first language's is the block's own; one that has none takes it) - what
  // renderSolution (blocks/solution/render.js, inlined ahead of this file) draws.
  function solutionProps(block) {
    var t = currentTranslation(block);
    return {
      id: block.id,
      solution: (t && t.solution !== undefined ? t.solution : block.solution) || "",
      placeholder: (t && t.text !== undefined ? t.text : block.placeholder) || "",
      caseSensitive: block.caseSensitive === true,
      attempts: block.attempts,
    };
  }

  // The words in the empty field - or, with none, the player's own.
  function solutionPlaceholder(block) {
    return solutionProps(block).placeholder.trim() || uiString("solutionWord");
  }

  function renderSolutionBlock(block) {
    var wrap = el("div", { class: "weft-block weft-block-solution", "data-weft-block": block.id, style: positionStyle(block.position) });
    if (block.required) requiredPending[block.id] = true;
    var mark = null;
    var instance = renderSolution(wrap, solutionProps(block), {
      mode: "play",
      text: uiString,
      textWith: uiStringWith,
      icons: { submit: QUIZ_SUBMIT_ICON_SVG, correct: QUIZ_CORRECT_ICON_SVG, incorrect: QUIZ_INCORRECT_ICON_SVG },
      fill: function () {
        happened(quizFillEventId(block.id));
      },
      // The same events as a quiz (see quizSubmitNodeId in pageTimeline.ts): the plain one and the one of the outcome - for every try.
      attempt: function (result) {
        if (!mark) mark = scoreMark(block);
        ((result.right ? block.onCorrect : block.onIncorrect) || []).forEach(applyEffect);
        if (result.finished) {
          scoreRecord(block, mark, result.right ? "right" : "wrong");
          requiredDone(block.id);
        }
        happened(quizSubmitEventId(block.id));
        happened(quizSubmitEventId(block.id, result.right ? "richtig" : "falsch"));
      },
      announce: announce,
    });
    languageRefreshers.push(function () {
      instance.update(solutionProps(block));
    });
    return wrap;
  }

  // ---- MatchingBlock ("Zuordnung"): objects dragged onto targets ----
  // Two lists of cards on an area: the learner drags the cards of the first (sources) onto those of the second (targets) - or picks one (a
  // click, Enter) and then a target - and presses "Abschicken": what was right and what was not is marked, and the effects of the block happen
  // (see MatchingBlock in core/types.ts). A source that is put on a target stands in it (in its dock) and leaves a dashed place where it stood.
  // Pictures are enlarged by a click. It has the events of a quiz: the first assignment, submitted, and "richtig" / "falsch" for everything / not
  // everything right.

  function matchingLabel(block, item) {
    var t = currentTranslation(block);
    return (t && t.items && t.items[item.id] !== undefined ? t.items[item.id] : item.text) || "";
  }

  // A picture shown large, over the slide, until a click, a key or Escape closes it.
  // `gallery` (a gallery's pictures): { index, total, get(i) -> { src, alt, caption }, changed(i) } - the window then has an arrow to each side (and
  // the arrow keys, and a swipe) to go on through the pictures; `changed` tells the carousel behind it which picture was reached.
  function openMatchingLightbox(from, src, alt, caption, gallery) {
    var stage = from.closest ? from.closest(".weft-stage") : null;
    var overlay = el("div", { class: "weft-matching-lightbox" + (caption || gallery ? " has-caption" : ""), role: "dialog", "aria-modal": "true", "aria-label": alt || "" }, []);
    var image = el("img", { src: src, alt: alt || "" }, []);
    var close = el("button", { type: "button", class: "weft-matching-lightbox-close", "aria-label": uiString("revealerClose") }, []);
    close.textContent = "\u00d7";
    overlay.appendChild(image);
    // (A gallery's caption stands under the picture - its place stays when a picture has none, so that the pictures do not jump.)
    var words = null;
    if (caption || gallery) {
      words = el("p", { class: "weft-matching-lightbox-caption" }, []);
      words.textContent = caption || "";
      applyVariablesToNode(words);
      overlay.appendChild(words);
    }
    overlay.appendChild(close);
    var current = gallery ? gallery.index : 0;
    // The picture changes with a short move: the old one slides out the way the move goes and the new one slides in from the other side, the caption
    // fading with it. Clicks that come in the meantime are collected - the last picture asked for is the one that is shown (no motion for those
    // who asked for less).
    var latest = null;
    var latestDirection = 1;
    var shownNow = null;
    var changing = false;
    var apply = function (shown) {
      shownNow = shown;
      image.src = shown.src;
      image.alt = shown.alt || "";
      overlay.setAttribute("aria-label", shown.alt || "");
      words.textContent = shown.caption || "";
      applyVariablesToNode(words);
    };
    var swap = function () {
      if (changing || !latest || latest === shownNow) return;
      if (prefersReducedMotion() || !image.animate) {
        apply(latest);
        return;
      }
      changing = true;
      var dir = latestDirection;
      var away = { fill: "forwards", duration: 130, easing: "ease-in" };
      var outs = [image.animate([{ opacity: 1, transform: "translateX(0)" }, { opacity: 0, transform: "translateX(" + -dir * 64 + "px)" }], away), words.animate([{ opacity: 1 }, { opacity: 0 }], away)];
      outs[0].onfinish = function () {
        apply(latest);
        var ready = function () {
          var toward = latestDirection;
          outs.forEach(function (animation) {
            animation.cancel();
          });
          var arrive = { duration: 260, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" };
          image.animate([{ opacity: 0, transform: "translateX(" + toward * 64 + "px)" }, { opacity: 1, transform: "translateX(0)" }], arrive);
          words.animate([{ opacity: 0 }, { opacity: 1 }], arrive);
          changing = false;
          swap();
        };
        // (Once the picture can be drawn: it does not come in empty.)
        if (image.decode) image.decode().then(ready, ready);
        else ready();
      };
    };
    var go = function (to) {
      if (!gallery) return;
      to = Math.max(0, Math.min(gallery.total - 1, to));
      if (to === current) return;
      latestDirection = to > current ? 1 : -1;
      current = to;
      latest = gallery.get(to);
      gallery.changed(to);
      if (previous) previous.disabled = to === 0;
      if (following) following.disabled = to === gallery.total - 1;
      swap();
      // (The neighbours are loaded already when the next step comes.)
      [to - 1, to + 1].forEach(function (n) {
        if (n >= 0 && n < gallery.total) new Image().src = gallery.get(n).src;
      });
    };
    var previous = null;
    var following = null;
    if (gallery && gallery.total > 1) {
      var chevron = function (d) {
        return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      };
      previous = el("button", { type: "button", class: "weft-gallery-arrow is-prev", "aria-label": uiString("galleryPrevious") }, []);
      following = el("button", { type: "button", class: "weft-gallery-arrow is-next", "aria-label": uiString("galleryNext") }, []);
      previous.innerHTML = chevron("M15 5l-7 7 7 7");
      following.innerHTML = chevron("M9 5l7 7-7 7");
      previous.disabled = current === 0;
      following.disabled = current === gallery.total - 1;
      // (A click on an arrow goes on; it does not close the window.)
      previous.addEventListener("click", function (e) {
        e.stopPropagation();
        go(current - 1);
      });
      following.addEventListener("click", function (e) {
        e.stopPropagation();
        go(current + 1);
      });
      overlay.appendChild(previous);
      overlay.appendChild(following);
      // A swipe sideways goes on, too (the click that ends it does not close the window).
      var start = null;
      var swiped = false;
      overlay.style.touchAction = "pan-y";
      overlay.addEventListener("pointerdown", function (e) {
        if (e.target.closest && e.target.closest("button")) return;
        start = { x: e.clientX, y: e.clientY };
      });
      overlay.addEventListener("pointerup", function (e) {
        if (!start) return;
        var dx = e.clientX - start.x;
        var dy = e.clientY - start.y;
        start = null;
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        swiped = true;
        setTimeout(function () {
          swiped = false;
        }, 0);
        go(current + (dx < 0 ? 1 : -1));
      });
      overlay.addEventListener(
        "click",
        function (e) {
          if (swiped) {
            e.stopPropagation();
            e.preventDefault();
          }
        },
        true,
      );
    }
    var done = function () {
      window.removeEventListener("keydown", onKey, true);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };
    var onKey = function (e) {
      if (gallery && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        // (The arrow keys would otherwise turn the page.)
        e.stopPropagation();
        e.preventDefault();
        go(current + (e.key === "ArrowRight" ? 1 : -1));
        return;
      }
      // (Enter and Space on an arrow of the window press that arrow, they do not close the window.)
      if ((e.key === "Enter" || e.key === " ") && e.target && e.target.closest && e.target.closest(".weft-gallery-arrow")) return;
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        // (Escape would otherwise leave the presentation, Space would turn the page.)
        e.stopPropagation();
        e.preventDefault();
        done();
      }
    };
    overlay.addEventListener("click", done);
    window.addEventListener("keydown", onKey, true);
    (stage || document.body).appendChild(overlay);
    close.focus({ preventScroll: true });
    return done;
  }

  // ---- gallery ----
  // Pictures in a carousel: one at a time, each shown whole, an arrow to each side (or a swipe, or the arrow keys when it has the focus); a click on the picture
  // opens it large, with its caption, in the window of the matching's pictures. No events, nothing to answer. A picture that has none chosen
  // yet is left out.
  function galleryCaption(block, item) {
    var t = currentTranslation(block);
    return (t && t.items && t.items[item.id] !== undefined ? t.items[item.id] : item.caption) || "";
  }

  function renderGalleryBlock(block) {
    var wrap = el("div", { class: "weft-block weft-block-gallery", "data-weft-block": block.id, style: positionStyle(block.position) });
    var items = block.items.filter(function (item) {
      return item.assetId;
    });
    if (items.length === 0) return wrap;
    var box = el("div", { class: "weft-gallery", role: "group", "aria-roledescription": "carousel" }, []);
    var viewport = el("div", { class: "weft-gallery-viewport" }, []);
    var track = el("div", { class: "weft-gallery-track" }, []);
    viewport.appendChild(track);
    box.appendChild(viewport);
    var chevron = function (d) {
      return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    };
    var prev = el("button", { type: "button", class: "weft-gallery-arrow is-prev" }, []);
    var next = el("button", { type: "button", class: "weft-gallery-arrow is-next" }, []);
    prev.innerHTML = chevron("M15 5l-7 7 7 7");
    next.innerHTML = chevron("M9 5l7 7-7 7");
    var dotsBox = el("div", { class: "weft-gallery-dots" }, []);
    var slides = [];
    var dots = [];
    var index = 0;
    var open = function (i) {
      var item = items[i];
      openMatchingLightbox(wrap, assetSrc(item.assetId), galleryCaption(block, item), galleryCaption(block, item), {
        index: i,
        total: items.length,
        get: function (n) {
          return { src: assetSrc(items[n].assetId), alt: galleryCaption(block, items[n]), caption: galleryCaption(block, items[n]) };
        },
        // (The carousel behind the window follows, so that closing it leaves the picture that was seen last.)
        changed: function (n) {
          show(n);
        },
      });
    };
    items.forEach(function (item, i) {
      var slide = el("button", { type: "button", class: "weft-gallery-slide", "data-weft-picture": item.id }, []);
      // The picture is shown whole, in a frame of its own shape (the corners of the module's style are the frame's): the frame takes the share of the
      // slide that the picture's ratio - known once it has loaded - allows.
      var frame = el("span", { class: "weft-gallery-frame" }, []);
      var image = el("img", { class: "weft-gallery-image", src: assetSrc(item.assetId), alt: "", draggable: "false" }, []);
      frame.appendChild(image);
      slide.appendChild(frame);
      var measured = function () {
        if (image.naturalWidth && image.naturalHeight) frame.style.setProperty("--ratio", String(image.naturalWidth / image.naturalHeight));
      };
      if (image.complete) measured();
      else image.addEventListener("load", measured);
      slide.addEventListener("click", function () {
        open(i);
      });
      track.appendChild(slide);
      slides.push(slide);
      var dot = el("button", { type: "button", class: "weft-gallery-dot" }, []);
      dot.addEventListener("click", function () {
        show(i);
      });
      dotsBox.appendChild(dot);
      dots.push(dot);
    });

    function label(i) {
      var caption = galleryCaption(block, items[i]);
      var position = uiStringWith("galleryPicture", { n: i + 1, total: items.length });
      return caption ? position + ": " + caption : position;
    }
    function show(i, announceIt) {
      i = Math.max(0, Math.min(items.length - 1, i));
      var changed = i !== index;
      index = i;
      track.style.transition = prefersReducedMotion() ? "none" : "";
      track.style.transform = "translateX(" + -index * 100 + "%)";
      slides.forEach(function (slide, k) {
        // (Only the picture that is shown can be reached by Tab.)
        slide.tabIndex = k === index ? 0 : -1;
        slide.setAttribute("aria-hidden", k === index ? "false" : "true");
        if (dots[k]) {
          dots[k].classList.toggle("is-current", k === index);
          if (k === index) dots[k].setAttribute("aria-current", "true");
          else dots[k].removeAttribute("aria-current");
        }
      });
      prev.disabled = index === 0;
      next.disabled = index === items.length - 1;
      if (changed || announceIt) announce(label(index));
    }
    function refresh() {
      prev.setAttribute("aria-label", uiString("galleryPrevious"));
      next.setAttribute("aria-label", uiString("galleryNext"));
      slides.forEach(function (slide, k) {
        slide.setAttribute("role", "group");
        slide.setAttribute("aria-roledescription", "slide");
        slide.setAttribute("aria-label", label(k));
        dots[k].setAttribute("aria-label", uiStringWith("galleryPicture", { n: k + 1, total: items.length }));
      });
    }
    refresh();
    show(0);
    languageRefreshers.push(refresh);

    if (items.length > 1) {
      prev.addEventListener("click", function () {
        show(index - 1);
      });
      next.addEventListener("click", function () {
        show(index + 1);
      });
      box.appendChild(prev);
      box.appendChild(next);
      box.appendChild(dotsBox);
      // The arrow keys go through the pictures while the carousel has the focus (not through the slides).
      wrap.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.stopPropagation();
        e.preventDefault();
        show(index + (e.key === "ArrowRight" ? 1 : -1));
      });

      // A swipe (or a drag with the mouse): the pictures follow the pointer, and the one that is more than a third in view stays.
      var start = null;
      var swiping = false;
      var swiped = false;
      viewport.addEventListener("pointerdown", function (e) {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        start = { x: e.clientX, y: e.clientY, id: e.pointerId };
        swiping = false;
      });
      viewport.addEventListener("pointermove", function (e) {
        if (!start || e.pointerId !== start.id) return;
        var dx = e.clientX - start.x;
        var dy = e.clientY - start.y;
        if (!swiping) {
          if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
          swiping = true;
          try {
            viewport.setPointerCapture(e.pointerId);
          } catch (error) {
            /* (a pointer that is gone) */
          }
          track.style.transition = "none";
        }
        var width = viewport.getBoundingClientRect().width || 1;
        // (At the ends the pictures give way less.)
        var edge = (index === 0 && dx > 0) || (index === items.length - 1 && dx < 0);
        track.style.transform = "translateX(calc(" + -index * 100 + "% + " + (edge ? dx / 3 : dx) + "px))";
        start.width = width;
      });
      var end = function (e) {
        if (!start || e.pointerId !== start.id) return;
        var dx = e.clientX - start.x;
        var width = start.width || viewport.getBoundingClientRect().width || 1;
        var wasSwiping = swiping;
        start = null;
        swiping = false;
        if (!wasSwiping) return;
        // (The click that ends a swipe is not a click on the picture.)
        swiped = true;
        setTimeout(function () {
          swiped = false;
        }, 0);
        if (Math.abs(dx) > Math.min(60, width / 3)) show(index + (dx < 0 ? 1 : -1));
        else show(index);
      };
      viewport.addEventListener("pointerup", end);
      viewport.addEventListener("pointercancel", end);
      viewport.addEventListener(
        "click",
        function (e) {
          if (swiped) {
            e.stopPropagation();
            e.preventDefault();
          }
        },
        true,
      );
    }
    wrap.appendChild(box);
    return wrap;
  }

  // What a matching says, in the language the learner works in - what renderMatching (blocks/matching/render.js, inlined ahead of this file) draws it with,
  // and what the learner does with it (picking up, dragging, putting down, the keyboard) and how an answer is judged.
  function matchingProps(block) {
    var card = function (item) {
      return { id: item.id, kind: item.kind, text: matchingLabel(block, item), src: item.assetId ? assetSrc(item.assetId) : "", x: item.x, y: item.y };
    };
    return {
      id: block.id,
      sources: block.sources.map(card),
      targets: block.targets.map(card),
      pairs: block.pairs,
      sourceSize: block.sourceSize,
      targetSize: block.targetSize,
      shuffle: block.shuffle === true,
    };
  }

  function renderMatchingBlock(block) {
    var wrap = el("div", { class: "weft-block weft-block-matching", "data-weft-block": block.id, style: positionStyle(block.position) });
    if (block.required) requiredPending[block.id] = true;
    var instance = renderMatching(wrap, matchingProps(block), {
      mode: "play",
      text: uiString,
      icons: { submit: QUIZ_SUBMIT_ICON_SVG, correct: QUIZ_CORRECT_ICON_SVG, incorrect: QUIZ_INCORRECT_ICON_SVG },
      applyVariables: applyVariablesToNode,
      // The first card put on a target is the quiz's "first answer" (see quizFillEventId).
      fill: function () {
        happened(quizFillEventId(block.id));
      },
      submit: function (result) {
        var mark = scoreMark(block);
        result.results.forEach(function (one) {
          if (one.status === "correct") (block.onEachCorrect || []).forEach(applyEffect);
          else if (one.status === "wrong") (block.onEachWrong || []).forEach(applyEffect);
        });
        ((result.allRight ? block.onCorrect : block.onIncorrect) || []).forEach(applyEffect);
        scoreRecord(block, mark, result.allRight ? "right" : "wrong");
        requiredDone(block.id);
        // The same events as a quiz (see quizSubmitNodeId in pageTimeline.ts): the plain one and the one of this outcome.
        happened(quizSubmitEventId(block.id));
        happened(quizSubmitEventId(block.id, result.allRight ? "richtig" : "falsch"));
      },
      announce: announce,
      enlarge: function (src, alt) {
        openMatchingLightbox(wrap, src, alt);
      },
    });
    languageRefreshers.push(function () {
      instance.update(matchingProps(block));
    });
    return wrap;
  }

  // ---- SortBlock ("Sortierrätsel"): objects put into the right order ----
  // Texts or pictures strung on a thin line (it runs behind them, so a text covers it): the learner drags them into the right order - or picks
  // one up with a key (Enter, Space), moves it with the arrow keys and puts it down - and presses "Abschicken". block.items is the RIGHT order;
  // the learner sees them mixed up (never in the right order). What counts as a mistake is the fewest moves (take one object and put it
  // somewhere else) that make the order right: the objects that need no move are marked right, the others wrong, and the effects of the block
  // happen (see SortBlock in core/types.ts). It has the events of a quiz: the first move, submitted, and "richtig" / "falsch".

  function sortItemLabel(block, item) {
    var t = currentTranslation(block);
    return (t && t.items && t.items[item.id] !== undefined ? t.items[item.id] : item.text) || "";
  }

  function sortEndLabel(block, which) {
    var t = currentTranslation(block);
    var key = which + "Label";
    return (t && t[key] !== undefined ? t[key] : block[key]) || "";
  }

  // What a sorting puzzle says, in the language the learner works in - what renderSort (blocks/sort/render.js, inlined ahead of this file) draws it with,
  // and what the learner does with it (picking up, dragging, moving with the keys, putting down) and how the order is judged.
  function sortProps(block) {
    return {
      id: block.id,
      items: block.items.map(function (item) {
        return { id: item.id, kind: item.kind, text: sortItemLabel(block, item), src: item.assetId ? assetSrc(item.assetId) : "" };
      }),
      orientation: block.orientation,
      itemSize: block.itemSize,
      startLabel: sortEndLabel(block, "start"),
      endLabel: sortEndLabel(block, "end"),
    };
  }

  function renderSortBlock(block) {
    var wrap = el("div", { class: "weft-block weft-block-sort", "data-weft-block": block.id, style: positionStyle(block.position) });
    if (block.required) requiredPending[block.id] = true;
    var instance = renderSort(wrap, sortProps(block), {
      mode: "play",
      text: uiString,
      textWith: uiStringWith,
      icons: { submit: QUIZ_SUBMIT_ICON_SVG, correct: QUIZ_CORRECT_ICON_SVG, incorrect: QUIZ_INCORRECT_ICON_SVG },
      applyVariables: applyVariablesToNode,
      reducedMotion: prefersReducedMotion,
      // The first move is the quiz's "first answer" (see quizFillEventId).
      fill: function () {
        happened(quizFillEventId(block.id));
      },
      submit: function (result) {
        var mark = scoreMark(block);
        (block.onSubmit || []).forEach(applyEffect);
        for (var m = 0; m < result.moves; m++) (block.onEachError || []).forEach(applyEffect);
        ((result.allRight ? block.onCorrect : block.onIncorrect) || []).forEach(applyEffect);
        scoreRecord(block, mark, result.allRight ? "right" : "wrong");
        requiredDone(block.id);
        // The same events as a quiz (see quizSubmitNodeId in pageTimeline.ts): the plain one and the one of this outcome.
        happened(quizSubmitEventId(block.id));
        happened(quizSubmitEventId(block.id, result.allRight ? "richtig" : "falsch"));
      },
      announce: announce,
      enlarge: function (src, alt) {
        openMatchingLightbox(wrap, src, alt);
      },
    });
    languageRefreshers.push(function () {
      instance.update(sortProps(block));
    });
    return wrap;
  }

  // ---- ClozeBlock ("Lückentext") ----
  // The text with its blanks as input fields, the button and the feedback are what renderCloze (blocks/cloze/render.js, inlined ahead of this file, which
  // also judges the answers) draws; what a submit does is below.

  function clozeProps(block) {
    return { html: blockHtml(block), caseSensitive: block.caseSensitive === true, tolerance: block.tolerance || 0 };
  }

  function renderClozeBlock(block) {
    var wrap = el("div", { class: "weft-block weft-block-cloze", "data-weft-block": block.id, style: positionStyle(block.position) });
    if (block.required) requiredPending[block.id] = true;
    var instance = renderCloze(wrap, clozeProps(block), {
      mode: "play",
      text: uiString,
      textWith: uiStringWith,
      icons: { submit: QUIZ_SUBMIT_ICON_SVG, correct: QUIZ_CORRECT_ICON_SVG, incorrect: QUIZ_INCORRECT_ICON_SVG },
      applyVariables: applyVariablesToNode,
      fill: function () {
        happened(quizFillEventId(block.id));
      },
      submit: function (result) {
        var mark = scoreMark(block);
        result.blanks.forEach(function (blank) {
          if (!blank.right) return;
          (block.onEachCorrect || []).forEach(applyEffect);
          ((block.answerEffects || {})[blank.key] || []).forEach(applyEffect);
        });
        ((result.allRight ? block.onCorrect : block.onIncorrect) || []).forEach(applyEffect);
        scoreRecord(block, mark, result.allRight ? "right" : "wrong");
        requiredDone(block.id);
        // The same events as a quiz (see quizSubmitNodeId in pageTimeline.ts): the plain one and the one of this outcome.
        happened(quizSubmitEventId(block.id));
        happened(quizSubmitEventId(block.id, result.allRight ? "richtig" : "falsch"));
      },
      announce: announce,
    });
    languageRefreshers.push(function () {
      instance.update(clozeProps(block));
    });
    return wrap;
  }

  function renderBlock(block, page) {
    if (block.kind === "script") {
      // Nothing to see: its event is where it runs.
      var scriptEventId = scriptRunEventId(block.id);
      if (graphEvents[scriptEventId]) {
        performers[scriptEventId] = function () {
          // (A script that sent the learner to another slide has no event to go on from.)
          if (runScript(block)) happened(scriptEventId);
        };
      }
      return el("div", { class: "weft-block weft-block-script", style: "display:none;" }, []);
    }
    var wrap = block.kind === "progress" ? renderProgressBlock(block) : block.kind === "cloze" ? renderClozeBlock(block) : block.kind === "checker" ? renderCheckerBlock(block) : block.kind === "solution" ? renderSolutionBlock(block) : block.kind === "matching" ? renderMatchingBlock(block) : block.kind === "sort" ? renderSortBlock(block) : block.kind === "gallery" ? renderGalleryBlock(block) : block.kind === "quiz" ? renderQuizBlock(block) : block.kind === "button" ? renderButtonBlock(block) : block.kind === "link" ? renderLinkBlock(block) : block.kind === "revealer" ? renderRevealerBlock(block) : renderStaticBlock(block, page);
    applyBlockEffects(wrap, block, page);
    applyActionEffects(wrap, block);
    if (block.kind === "list" && wrap.weftListItems) applyListItemEffects(block, wrap.weftListItems);
    return wrap;
  }

  // When each event of the page happens at the earliest, counted as [presses of Weiter, milliseconds after the last of them] - from the
  // triggers of the page's graph (setUpGraph). Events that nothing leads to from the start of the page (they wait for a quiz, say) have none.
  function eventTimes() {
    var best = { start: [0, 0] };
    var queue = ["start"];
    var steps = 0;
    while (queue.length > 0 && steps++ < 5000) {
      var id = queue.shift();
      var at = best[id];
      (outgoingTriggers[id] || []).forEach(function (trigger) {
        var delay = trigger.delayMs || 0;
        var time = trigger.weiter ? [at[0] + 1, delay] : [at[0], at[1] + delay];
        var known = best[trigger.to];
        if (!known || time[0] < known[0] || (time[0] === known[0] && time[1] < known[1])) {
          best[trigger.to] = time;
          queue.push(trigger.to);
        }
      });
    }
    return best;
  }

  /**
   * The order the blocks of a page are put into the document in - the order a screen reader reads them and the Tab key goes through them.
   * Their place on the slide decides: row by row from the top, within a row from left to right (blocks belong to a row when their centre
   * lies in the height of the first block of it - a tall picture on the left with two texts beside it is one row). The blocks that
   * appear one after the other (an Aufbau after a press of Weiter or a delay) keep the order of their appearance among themselves: they take
   * the places that the sorting by position gave to them, in that order - what is there from the start stays where it is.
   * `items`: { block, wrap, stack } of the blocks of the stage; a logic block (nothing to see) comes last.
   */
  function readingOrder(items) {
    var visible = items.filter(function (item) {
      return invisibleKinds.indexOf(item.block.kind) === -1 && item.block.position;
    });
    var hidden = items.filter(function (item) {
      return visible.indexOf(item) === -1;
    });
    var byTop = visible.slice().sort(function (a, b) {
      return a.block.position.y - b.block.position.y || a.block.position.x - b.block.position.x;
    });
    var rows = [];
    byTop.forEach(function (item) {
      var p = item.block.position;
      var middle = p.y + p.height / 2;
      var row = rows.length > 0 ? rows[rows.length - 1] : null;
      if (row && middle >= row.top && middle <= row.bottom) row.items.push(item);
      else rows.push({ top: p.y, bottom: p.y + p.height, items: [item] });
    });
    var ordered = [];
    rows.forEach(function (row) {
      row.items.sort(function (a, b) {
        return a.block.position.x - b.block.position.x || a.block.position.y - b.block.position.y;
      });
      ordered = ordered.concat(row.items);
    });
    // The ones that appear later, in the order they appear.
    var times = eventTimes();
    var slots = [];
    var built = [];
    ordered.forEach(function (item, index) {
      var time = item.fromLayout ? null : times[blockEffectEventId(item.block.id, "entrance")];
      if (!time || (time[0] === 0 && time[1] === 0)) return;
      slots.push(index);
      built.push({ item: item, time: time, index: index });
    });
    built.sort(function (a, b) {
      return a.time[0] - b.time[0] || a.time[1] - b.time[1] || a.index - b.index;
    });
    built.forEach(function (entry, n) {
      ordered[slots[n]] = entry.item;
    });
    return ordered.concat(hidden);
  }

  function renderStage(pageId) {
    // A fresh graph for a fresh page (see setUpGraph): what is still on its way for the page that was showing is dropped. In
    // particular every page's own Weiter-build progress restarts from the top on a fresh render of it - including navigating
    // back to a page you'd already stepped through once.
    languageRefreshers = [];
    stageBlocks = [];
    quizHandles = {};
    languageSwitches = [];
    progressBars = [];
    requiredPending = {};
    advanceButtons = [];
    var page = module.pages[pageId];
    setUpGraph(page);
    var stage = el("div", { class: "weft-stage", "data-weft-page": pageId, style: stageStyle(), "data-weft-theme": stageTheme(), "data-weft-style": stageUiStyle() }, []);
    var layout = page.layoutId ? module.layouts[page.layoutId] : null;
    // Every block of the stage with its place in the stacking order (the layout's blocks lie under the page's own): the blocks are put
    // into the page in reading order (see readingOrder), and the stacking is kept by z-index.
    var stageItems = [];
    // Layout blocks are marked so a "content only" Move can leave them standing while the page's own
    // blocks slide (see animateTransition).
    if (layout) {
      layout.blocks.forEach(function (b) {
        // A placeholder (see PlaceholderBlock) is only a place and a style for the page's own text: nothing to show.
        if (b.kind === "placeholder") return;
        stageBlocks.push(b);
        var layoutBlock = renderBlock(b, page);
        layoutBlock.classList.add("weft-block-from-layout");
        stageItems.push({ block: b, wrap: layoutBlock, stack: stageItems.length, fromLayout: true });
      });
    }
    page.blocks.forEach(function (b) {
      stageBlocks.push(b);
      stageItems.push({ block: b, wrap: renderBlock(b, page), stack: stageItems.length, fromLayout: false });
    });
    readingOrder(stageItems).forEach(function (item) {
      item.wrap.style.zIndex = String(item.stack + 1);
      stage.appendChild(item.wrap);
    });
    // Every block's own actions are registered synchronously above, by the time renderBlock returns for it - so the start of
    // the page happens here, still before this stage is even returned to be appended to the DOM; what it triggers arrives
    // right after (see deliver), when the blocks are on the page.
    happened("start");
    // (A condition that is true when the page is entered happens at once.)
    checkConditions();
    // (Whether Weiter is held back is known now: the required tasks of the page are registered and the first builds wait.)
    updateAdvanceButtons();
    return stage;
  }

  // No Zurück/Weiter bar any more - navigation lives on the slides themselves as button
  // blocks (see renderButtonBlock). The one dead end that leaves is the synthetic "done" screen,
  // which isn't a real page and so can't carry an author-placed button - it gets its own restart
  // button for exactly that reason (when the module allows navigating), and the table of what the graded elements gave.
  function buildStageWrap() {
    var wrap = el("div", { class: "weft-stage-wrap" }, []);

    if (pos >= history.length) {
      var doneParts = [el("div", { class: "weft-done-message" }, [document.createTextNode(uiString("done"))])];
      // What the graded elements gave, if there are any that give points.
      var doneSummaryTable = renderDoneSummary();
      if (doneSummaryTable) doneParts.push(doneSummaryTable);
      var doneButtons = [];
      // With a table there is the certificate to take along: the same as a PDF.
      if (doneSummaryTable) {
        var certificateBtn = el("button", { type: "button", class: "weft-block-button-el weft-done-restart weft-done-certificate" }, [
          document.createTextNode(uiString("certificateDownload")),
        ]);
        certificateBtn.addEventListener("click", function () {
          downloadCertificate(certificateBtn);
        });
        doneButtons.push(certificateBtn);
      }
      // Starting over is a way to move through the module like the others: where the learner may not (the setting "Navigation durch Weiter
      // erlauben"), the module is not to be played again from here either.
      if (module.keyboardNavigationEnabled !== false) {
        var restartBtn = el("button", { type: "button", class: "weft-block-button-el weft-done-restart" }, [
          document.createTextNode(uiString("restart")),
        ]);
        restartBtn.addEventListener("click", restart);
        doneButtons.push(restartBtn);
      }
      if (doneButtons.length > 0) doneParts.push(el("div", { class: "weft-done-actions" }, doneButtons));
      var doneStage = el("div", { class: "weft-stage weft-stage-done", style: stageStyle(), "data-weft-theme": stageTheme(), "data-weft-style": stageUiStyle() }, doneParts);
      wrap.appendChild(doneStage);
    } else {
      wrap.appendChild(renderStage(history[pos]));
      // The editor's preview wants to know which slide is on: "Esc" there goes back to this one in the editor (see PresentationView.tsx).
      if (savesViaHost && window.parent !== window) {
        window.parent.postMessage({ source: "weft-module", type: "page-shown", pageId: history[pos] }, "*");
      }
    }
    return wrap;
  }

  // ---- page transitions ----
  // animateTransition animates the outgoing .weft-stage-wrap out and/or the incoming one in, per
  // `transition.type` (see Transition in core/types.ts - option names and defaults are mirrored by
  // hand from core/document/transitions.ts - and the matching .is-transition-* rules in
  // player.runtime.css), then swaps them for real once it's done. The two wraps are stacked exactly
  // on top of each other for the duration (outgoing = oldWrap, incoming = newWrap):
  //  - fade: the outgoing one fades out, revealing the incoming one underneath.
  //  - move: both slide along `direction` (the outgoing one goes that way, the incoming one arrives
  //    from the opposite side) - or, "content only" and the next page shares the layout, just the
  //    pages' own blocks slide while background and layout blocks stay put. Otherwise the whole
  //    slide moves and the content trails it by CONTENT_LAG_MS.
  //  - iris: the incoming one opens as a growing circle (soft or hard edged) from `irisCenter`.
  //  - cube: both are faces of a cube that turns towards `direction`.
  //  - blur: the outgoing one blurs, then dissolves into the (also blurred) incoming one, which
  //    sharpens.
  //  - wheel: the slides hang on a wheel whose hub is above the slide: the outgoing one swings away to the left (or right), the next one
  //    swings in from the other side. The page's own blocks (not the layout's) are fixed at their middle and wobble by their inertia -
  //    small ones more, large ones hardly - and come to rest before the end (see wheelTransition).
  //  - horror: the outgoing one flickers between grayscale and color four times, then the incoming
  //    one appears - in grayscale first, then color.
  var CONTENT_LAG_MS = 50;
  var TRANSITION_EASE = "ease";
  var finishActiveTransition = null;

  function transitionDirectionOf(transition) {
    return transition.direction || (transition.type === "cube" ? "right" : "left");
  }

  function directionVector(direction) {
    if (direction === "right") return [1, 0];
    if (direction === "up") return [0, -1];
    if (direction === "down") return [0, 1];
    return [-1, 0];
  }

  // CSS's cubic-bezier(.25, .1, .25, 1) ("ease") as a function of linear progress, for the one place
  // the position along a slide's path has to be known at an arbitrary moment (Move's trailing content).
  function easeProgress(x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var x1 = 0.25, y1 = 0.1, x2 = 0.25, y2 = 1;
    function bezier(t, a, b) {
      return 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
    }
    var lo = 0, hi = 1, t = x;
    for (var i = 0; i < 30; i++) {
      t = (lo + hi) / 2;
      if (bezier(t, x1, x2) < x) lo = t;
      else hi = t;
    }
    return bezier(t, y1, y2);
  }

  function layoutIdOf(pageId) {
    var page = pageId && module.pages[pageId];
    return page ? page.layoutId || null : undefined;
  }

  // ---- wheel ----
  // The wheel turns over the first WHEEL_TURN_SHARE of the duration (smoothly: smootherstep, whose acceleration is continuous), the rest
  // is for the blocks to settle. Every block of the page is a damped spring in rotation, driven by the wheel's angular acceleration - the
  // inertia that pushes it against the turn when the wheel starts, and again when it stops: it swings, and calms down. Its largest swing is
  // WHEEL_MAX_WOBBLE_DEG for a tiny block and falls off with the share of the slide the block covers: a large block hardly moves.
  var WHEEL_TURN_SHARE = 0.7;
  var WHEEL_MAX_WOBBLE_DEG = 20;
  var WHEEL_MIN_WOBBLE_DEG = 0.4;
  var WHEEL_SETTLE_SHARE = 0.18;
  // How far above the slide the hub is, in slide heights (above its top edge).
  var WHEEL_HUB_DISTANCE = 1.5;

  function smootherstep(x) {
    x = Math.min(1, Math.max(0, x));
    return x * x * x * (x * (x * 6 - 15) + 10);
  }

  // Its second derivative: the angular acceleration of the wheel, in units of 1 / (turn time)^2.
  function smootherstepAcceleration(x) {
    if (x <= 0 || x >= 1) return 0;
    return 60 * x * (2 * x - 1) * (x - 1);
  }

  /** How the rotation of one block moves, in degrees: a sampled series for `frames` + 1 moments of the transition. */
  function wheelWobble(peakDeg, durationMs, frames) {
    var seconds = durationMs / 1000;
    var turnSeconds = seconds * WHEEL_TURN_SHARE;
    // Smaller blocks swing faster, too (a short pendulum).
    var frequency = 1.6 + 1.6 * (peakDeg / WHEEL_MAX_WOBBLE_DEG);
    var omega = 2 * Math.PI * frequency;
    var damping = 5;
    var steps = frames * 8;
    var dt = seconds / steps;
    var position = 0;
    var velocity = 0;
    var samples = [];
    var peak = 0;
    for (var i = 0; i <= steps; i++) {
      var t = i * dt;
      var drive = smootherstepAcceleration(t / turnSeconds) / (turnSeconds * turnSeconds);
      velocity += (drive - 2 * damping * velocity - omega * omega * position) * dt;
      position += velocity * dt;
      if (i % 8 === 0) {
        samples.push(position);
        peak = Math.max(peak, Math.abs(position));
      }
    }
    // Against the turn (negative), at most peakDeg - and none at all at the very end.
    return samples.map(function (value, index) {
      var rest = Math.min(1, (1 - index / frames) / WHEEL_SETTLE_SHARE);
      return peak > 0 ? (-value / peak) * peakDeg * smootherstep(rest) : 0;
    });
  }

  function animateTransition(root, oldWrap, newWrap, transition, whenOver) {
    var duration = transition.durationMs || 500;
    var type = transition.type;
    var width = root.clientWidth;
    var height = root.clientHeight;
    var cancelled = false;
    // The picture or colour behind a wheel (made below), taken away with the transition.
    var wheelBackdrop = null;
    oldWrap.classList.add("is-transition-old");
    // The slide that is on its way out is not there any more for a screen reader or the keyboard.
    oldWrap.setAttribute("aria-hidden", "true");
    oldWrap.setAttribute("inert", "");
    newWrap.classList.add("is-transition-new");
    root.appendChild(newWrap);

    function finish() {
      if (cancelled) return;
      cancelled = true;
      finishActiveTransition = null;
      if (oldWrap.parentNode === root) root.removeChild(oldWrap);
      newWrap.classList.remove("is-transition-new");
      newWrap.getAnimations({ subtree: true }).forEach(function (animation) {
        animation.cancel();
      });
      ["zIndex", "maskImage", "webkitMaskImage", "clipPath"].forEach(function (property) {
        newWrap.style[property] = "";
      });
      root.style.perspective = "";
      root.style.transformStyle = "";
      root.style.overflow = "";
      newWrap.style.background = "";
      if (wheelBackdrop && wheelBackdrop.parentNode) wheelBackdrop.parentNode.removeChild(wheelBackdrop);
      if (whenOver) whenOver();
    }
    // A new page change during a running transition completes it on the spot (see render()).
    finishActiveTransition = finish;
    // Animations end on their own clock, but their "finish" event is only delivered with a rendered
    // frame - which a throttled or hidden page may hold back for a long time, leaving the old slide
    // lying under the new one. This guarantees the swap happens shortly after the time is up either
    // way (finish is idempotent).
    setTimeout(finish, duration + CONTENT_LAG_MS + 150);

    function run(element, keyframes, options) {
      return element.animate(keyframes, Object.assign({ duration: duration, easing: TRANSITION_EASE, fill: "both" }, options));
    }

    if (type === "fade") {
      run(oldWrap, [{ opacity: 1 }, { opacity: 0 }]).onfinish = finish;
    } else if (type === "move") {
      var vector = directionVector(transitionDirectionOf(transition));
      var dx = vector[0] * width;
      var dy = vector[1] * height;
      var sameLayout =
        layoutIdOf(transition.fromPageId) !== undefined &&
        layoutIdOf(transition.fromPageId) === layoutIdOf(pos < history.length ? history[pos] : null);
      var oldContent = Array.prototype.slice.call(oldWrap.querySelectorAll(".weft-block:not(.weft-block-from-layout)"));
      var newContent = Array.prototype.slice.call(newWrap.querySelectorAll(".weft-block:not(.weft-block-from-layout)"));
      // translate (not transform): composes with a block's own rotate() instead of replacing it.
      if (transition.contentOnly && sameLayout) {
        // The slide itself stays: the outgoing wrap loses its own background and layout blocks (it
        // would otherwise cover the incoming layout, which is identical anyway), keeps only its
        // content, and sits above the incoming one while that content slides out and the new one in.
        oldWrap.classList.add("is-content-only-old");
        var last = null;
        oldContent.forEach(function (block) {
          last = run(block, [{ translate: "0 0" }, { translate: dx + "px " + dy + "px" }]);
        });
        newContent.forEach(function (block) {
          last = run(block, [{ translate: -dx + "px " + -dy + "px" }, { translate: "0 0" }]);
        });
        if (last) last.onfinish = finish;
        else setTimeout(finish, duration);
      } else {
        run(oldWrap, [{ transform: "translate(0, 0)" }, { transform: "translate(" + dx + "px, " + dy + "px)" }]);
        run(newWrap, [{ transform: "translate(" + -dx + "px, " + -dy + "px)" }, { transform: "translate(0, 0)" }]);
        // The content trails its slide: at every moment it sits where the slide was CONTENT_LAG_MS
        // earlier, i.e. offset from the slide by (position then - position now) - sampled into
        // keyframes, since that offset isn't expressible with a single easing curve.
        var total = duration + CONTENT_LAG_MS;
        var steps = 30;
        function offsetKeyframes(slideAt, content) {
          var frames = [];
          for (var i = 0; i <= steps; i++) {
            var t = (i / steps) * total;
            var rel = slideAt(t - CONTENT_LAG_MS) - slideAt(t);
            frames.push({ translate: rel * dx + "px " + rel * dy + "px", offset: i / steps });
          }
          return frames;
        }
        // outgoing slide travels 0 -> +1 (of dx/dy), incoming one -1 -> 0
        var outAt = function (t) {
          return easeProgress(t / duration);
        };
        var inAt = function (t) {
          return easeProgress(t / duration) - 1;
        };
        var lastContent = null;
        oldContent.forEach(function (block) {
          lastContent = run(block, offsetKeyframes(outAt), { duration: total, easing: "linear" });
        });
        newContent.forEach(function (block) {
          lastContent = run(block, offsetKeyframes(inAt), { duration: total, easing: "linear" });
        });
        // Wait for the trailing content too, not just for the slides themselves.
        if (lastContent) lastContent.onfinish = finish;
        else setTimeout(finish, duration);
      }
    } else if (type === "iris") {
      oldWrap.style.zIndex = "1";
      newWrap.style.zIndex = "2";
      var stageRect = newWrap.querySelector(".weft-stage").getBoundingClientRect();
      var rootRect = root.getBoundingClientRect();
      var center = transition.irisCenter || { x: 50, y: 50 };
      var cx = stageRect.left - rootRect.left + (center.x / 100) * stageRect.width;
      var cy = stageRect.top - rootRect.top + (center.y / 100) * stageRect.height;
      // Far enough to cover the whole viewport (the letterbox too) from wherever the centre is.
      var maxRadius = Math.max(
        Math.hypot(cx, cy),
        Math.hypot(width - cx, cy),
        Math.hypot(cx, height - cy),
        Math.hypot(width - cx, height - cy)
      );
      var feather = transition.hardEdge ? 0 : Math.min(width, height) * 0.2;
      var started = null;
      var frame = function (now) {
        if (cancelled) return;
        if (started === null) started = now;
        var progress = Math.min(1, (now - started) / duration);
        var radius = easeProgress(progress) * (maxRadius + feather);
        if (feather === 0) {
          newWrap.style.clipPath = "circle(" + radius + "px at " + cx + "px " + cy + "px)";
        } else {
          var mask =
            "radial-gradient(circle at " + cx + "px " + cy + "px, #000 " + Math.max(0, radius - feather) + "px, transparent " + radius + "px)";
          newWrap.style.webkitMaskImage = mask;
          newWrap.style.maskImage = mask;
        }
        if (progress < 1) requestAnimationFrame(frame);
        else finish();
      };
      // Fully masked from the very first paint, before the first frame callback runs.
      if (feather === 0) newWrap.style.clipPath = "circle(0px at " + cx + "px " + cy + "px)";
      else {
        newWrap.style.webkitMaskImage = "linear-gradient(transparent, transparent)";
        newWrap.style.maskImage = "linear-gradient(transparent, transparent)";
      }
      requestAnimationFrame(frame);
    } else if (type === "cube") {
      var cubeDirection = transitionDirectionOf(transition);
      var horizontal = cubeDirection === "left" || cubeDirection === "right";
      var axis = horizontal ? "rotateY" : "rotateX";
      var size = horizontal ? width : height;
      // rotateY(+) carries a face's front to the right, rotateX(+) carries it up (see the matrix
      // for a point at z = size/2) - so "right" and "up" turn the cube by +90deg, the others by -90.
      var sign = cubeDirection === "right" || cubeDirection === "up" ? 1 : -1;
      var face = function (angle) {
        return "translateZ(" + -size / 2 + "px) " + axis + "(" + angle + "deg) translateZ(" + size / 2 + "px)";
      };
      root.style.perspective = Math.round(size * 2.5) + "px";
      // overflow other than visible would flatten the 3D scene; the page itself clips instead.
      root.style.overflow = "visible";
      root.style.transformStyle = "preserve-3d";
      oldWrap.style.zIndex = "auto";
      newWrap.style.zIndex = "auto";
      run(oldWrap, [{ transform: face(0) }, { transform: face(sign * 90) }], { easing: "ease-in-out" });
      run(newWrap, [{ transform: face(-sign * 90) }, { transform: face(0) }], { easing: "ease-in-out" }).onfinish = finish;
    } else if (type === "blur") {
      var blurPx = Math.max(8, Math.round(Math.min(width, height) * 0.03));
      var blurred = "blur(" + blurPx + "px)";
      oldWrap.style.zIndex = "1";
      newWrap.style.zIndex = "0";
      run(
        oldWrap,
        [
          { filter: "blur(0px)", opacity: 1, offset: 0 },
          { filter: blurred, opacity: 1, offset: 0.35 },
          { filter: blurred, opacity: 0, offset: 0.65 },
          { filter: blurred, opacity: 0, offset: 1 },
        ],
        { easing: "linear" }
      );
      run(
        newWrap,
        [
          { filter: blurred, offset: 0 },
          { filter: blurred, offset: 0.5 },
          { filter: "blur(0px)", offset: 1 },
        ],
        { easing: "linear" }
      ).onfinish = finish;
    } else if (type === "horror") {
      oldWrap.style.zIndex = "1";
      newWrap.style.zIndex = "2";
      // Four cycles of gray -> color -> gray, each with a brief flicker (a dip in opacity, letting
      // the black behind show) in every phase; together they fill the first HORROR_OLD_SHARE of the
      // duration, then the next slide takes over.
      var HORROR_OLD_SHARE = 0.72;
      var cycle = [
        [0, 1, 1],
        [0.08, 1, 0.25],
        [0.14, 1, 1],
        [0.3, 0, 1],
        [0.38, 0, 0.3],
        [0.44, 0, 1],
        [0.6, 1, 1],
        [0.68, 1, 0.4],
        [0.74, 1, 1],
        [1, 1, 1],
      ];
      var flicker = [];
      for (var c = 0; c < 4; c++) {
        cycle.forEach(function (point, index) {
          if (c > 0 && index === 0) return; // the previous cycle already ends on this exact state
          flicker.push({
            filter: "grayscale(" + point[1] + ")",
            opacity: point[2],
            offset: ((c + point[0]) / 4) * HORROR_OLD_SHARE,
          });
        });
      }
      flicker.push({ filter: "grayscale(1)", opacity: 1, offset: 1 });
      run(oldWrap, flicker, { easing: "linear" });
      run(
        newWrap,
        [
          { opacity: 0, filter: "grayscale(1)", offset: 0 },
          { opacity: 0, filter: "grayscale(1)", offset: HORROR_OLD_SHARE - 0.001 },
          { opacity: 1, filter: "grayscale(1)", offset: HORROR_OLD_SHARE },
          { opacity: 1, filter: "grayscale(1)", offset: HORROR_OLD_SHARE + 0.08 },
          { opacity: 1, filter: "grayscale(0)", offset: 1 },
        ],
        { easing: "linear" }
      ).onfinish = finish;
    } else if (type === "wheel") {
      // The wraps are transparent for the turn: it is the slides that turn, not the black around them.
      oldWrap.style.background = "transparent";
      newWrap.style.background = "transparent";
      oldWrap.style.zIndex = "1";
      newWrap.style.zIndex = "2";
      var oldStage = oldWrap.querySelector(".weft-stage");
      var newStage = newWrap.querySelector(".weft-stage");
      if (!oldStage || !newStage) {
        finish();
        return;
      }
      var wheelSign = transitionDirectionOf(transition) === "right" ? -1 : 1;
      var stageBox = newStage.getBoundingClientRect();
      var wheelRoot = root.getBoundingClientRect();
      var stageLeft = stageBox.left - wheelRoot.left;
      var stageTop = stageBox.top - wheelRoot.top;
      var stageW = stageBox.width;
      var stageH = stageBox.height;
      // The hub: above the middle of the slide.
      var hubX = stageLeft + stageW / 2;
      var hubDistance = stageH * WHEEL_HUB_DISTANCE;
      var hubY = stageTop - hubDistance;
      var corners = [
        [stageLeft, stageTop],
        [stageLeft + stageW, stageTop],
        [stageLeft, stageTop + stageH],
        [stageLeft + stageW, stageTop + stageH],
      ];
      // How far the wheel has to turn before the slide is out of the window, on the way out to one side and (the same turn) in from the other.
      var turnDeg = 100;
      for (var deg = 10; deg <= 100; deg += 1) {
        var rad = (deg * Math.PI) / 180;
        var farthest = -Infinity;
        var nearest = Infinity;
        corners.forEach(function (corner) {
          var vx = corner[0] - hubX;
          var vy = corner[1] - hubY;
          var x = hubX + vx * Math.cos(rad) - vy * Math.sin(rad);
          var mirrored = hubX + vx * Math.cos(rad) + vy * Math.sin(rad);
          farthest = Math.max(farthest, x); // clockwise: carries the slide to the left
          nearest = Math.min(nearest, mirrored); // counter-clockwise: to the right
        });
        if (farthest <= 0 && nearest >= wheelRoot.width) {
          turnDeg = deg;
          break;
        }
      }
      // What is behind the slides: a colour or a picture - taken away softly at the end (the plain background comes back).
      var wheelBackground = transition.background;
      if (wheelBackground && ((wheelBackground.kind === "color" && wheelBackground.color) || (wheelBackground.kind === "image" && wheelBackground.assetId))) {
        wheelBackdrop = document.createElement("div");
        wheelBackdrop.style.cssText = "position:absolute;inset:0;z-index:0;";
        if (wheelBackground.kind === "color") wheelBackdrop.style.background = wheelBackground.color;
        else {
          wheelBackdrop.style.backgroundImage = 'url("' + assetSrc(wheelBackground.assetId) + '")';
          wheelBackdrop.style.backgroundSize = "cover";
          wheelBackdrop.style.backgroundPosition = "center";
        }
        root.insertBefore(wheelBackdrop, root.firstChild);
        wheelBackdrop.animate(
          [
            { opacity: 1, offset: 0 },
            { opacity: 1, offset: 0.8 },
            { opacity: 0, offset: 1 },
          ],
          { duration: duration, easing: "linear", fill: "both" }
        );
      }
      var frames = Math.max(30, Math.ceil(duration / 16));
      var turnFrames = function (angleAt) {
        var list = [];
        for (var f = 0; f <= frames; f++) {
          var progress = smootherstep(f / frames / WHEEL_TURN_SHARE);
          list.push({ rotate: wheelSign * angleAt(progress) + "deg", offset: f / frames });
        }
        return list;
      };
      var hubOrigin = "50% " + -hubDistance + "px";
      oldStage.style.transformOrigin = hubOrigin;
      newStage.style.transformOrigin = hubOrigin;
      run(oldStage, turnFrames(function (progress) { return turnDeg * progress; }), { easing: "linear" });
      run(newStage, turnFrames(function (progress) { return turnDeg * (progress - 1); }), { easing: "linear" }).onfinish = finish;
      // The blocks of the page (the layout's belong to the slide and just turn with it) wobble by their inertia, in the direction against the turn.
      [oldStage, newStage].forEach(function (stageElement) {
        var stageArea = stageElement.offsetWidth * stageElement.offsetHeight;
        Array.prototype.slice.call(stageElement.querySelectorAll(".weft-block:not(.weft-block-from-layout)")).forEach(function (block) {
          var share = stageArea > 0 ? (block.offsetWidth * block.offsetHeight) / stageArea : 1;
          var peakDeg = WHEEL_MAX_WOBBLE_DEG * Math.exp(-share / 0.12);
          if (peakDeg < WHEEL_MIN_WOBBLE_DEG) return;
          var wobble = wheelWobble(peakDeg, duration, frames);
          run(
            block,
            wobble.map(function (degrees, index) {
              return { rotate: wheelSign * degrees + "deg", offset: index / frames };
            }),
            { easing: "linear" }
          );
        });
      });
    } else {
      finish(); // an unrecognized/future type - fall back to an instant cut rather than getting stuck mid-transition
    }
  }

  function render(outgoingTransition) {
    var root = document.getElementById("weft-root");
    // A page change while a transition is still running completes that one first, so exactly one
    // wrap (the one now showing) is ever left to animate away from.
    if (finishActiveTransition) finishActiveTransition();
    var oldWrap = root.firstElementChild;
    var newWrap = buildStageWrap();

    if (oldWrap && outgoingTransition && outgoingTransition.type !== "none" && !prefersReducedMotion()) {
      // The slide changes first; only then does a progress bar move (see settleProgressBars).
      animateTransition(root, oldWrap, newWrap, outgoingTransition, settleProgressBars);
    } else {
      root.innerHTML = "";
      root.appendChild(newWrap);
      // (Two frames later, so that the bars have been shown where they stood before they move.)
      requestAnimationFrame(function () {
        requestAnimationFrame(settleProgressBars);
      });
    }
    announceSlide(newWrap);
    reportState();

    // After every slide (the finished screen included): progress has moved, and so may anything a
    // formula reads from it.
    syncLms();
  }

  // ---- the presenter view (features/presenter/) ----
  // The window around the module (the presenter's remote control, or the screen of the audience) can ask for the state of the module -
  // which slide, how many builds, which slide is next - and send it commands: the same as Space and ← do, a jump to a slide, and "sync"
  // (a follower catches up with the state that was reported: the slide and its builds).
  var reportingState = false;
  // The slide after this one (without going there), or null.
  function peekNextPageId() {
    if (pos >= history.length) return null;
    if (pos < history.length - 1) return history[pos + 1];
    var savedCursor = JSON.parse(JSON.stringify(cursor));
    var result = null;
    try {
      advanceCursor();
      var node = resolveJumps(resolveCurrentNode());
      result = node.type === "page" ? node.pageId : null;
    } catch (e) {
      result = null;
    }
    cursor = savedCursor;
    return result;
  }
  function reportState() {
    if (!reportingState || window.parent === window) return;
    var finished = pos >= history.length;
    var pageId = !finished && pos >= 0 ? history[pos] : null;
    window.parent.postMessage(
      {
        source: "weft-module",
        type: "presenter-state",
        pageId: pageId,
        pageLabel: pageId && module.pageLabels ? module.pageLabels[pageId] || "" : "",
        finished: finished,
        nextPageId: peekNextPageId(),
        buildsDone: buildsDone,
        buildsTotal: buildsTotal,
      },
      "*"
    );
  }
  function hasPendingBuild() {
    return Object.keys(waitingForWeiter).some(function (id) {
      return isBuildTrigger(waitingForWeiter[id]);
    });
  }
  window.addEventListener("message", function (e) {
    var data = e.data;
    if (!data || data.source !== "weft-host" || e.source !== window.parent) return;
    if (data.type === "report-state") {
      reportingState = data.on !== false;
      reportState();
    } else if (data.type === "control") {
      var instantly = { type: "none", durationMs: 0 };
      if (data.action === "weiter") {
        if (pos >= history.length) restart();
        else weiter();
      } else if (data.action === "prev") goPrev();
      else if (data.action === "restart") restart();
      else if (data.action === "goto") goToPage(data.pageId, instantly);
      else if (data.action === "sync") {
        var current = pos >= 0 && pos < history.length ? history[pos] : null;
        if (!data.finished && data.pageId && current !== data.pageId) goToPage(data.pageId, instantly);
        var guard = 0;
        while (!data.finished && buildsDone < (data.buildsDone || 0) && hasPendingBuild() && guard++ < 100) weiter();
      }
    }
  });

  loadScriptLibraries();
  buildNavigation();
  goNext();
})();
