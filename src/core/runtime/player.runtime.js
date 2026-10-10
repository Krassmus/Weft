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

  function quizQuestionHtml(block) {
    var t = currentTranslation(block);
    return t && t.questionHtml !== undefined ? t.questionHtml : block.questionHtml;
  }

  function quizOptionHtml(block, option) {
    var t = currentTranslation(block);
    return t && t.options && t.options[option.id] !== undefined ? t.options[option.id] : option.html;
  }

  function buttonLabel(block) {
    var t = currentTranslation(block);
    return (t && t.text !== undefined ? t.text : block.text) || uiString("next");
  }

  // One of the player's own fixed texts in the current language.
  function uiString(key) {
    var strings = uiStrings[currentLanguage || ""] || uiStrings[""] || {};
    return strings[key] || "";
  }

  // Functions that refill the texts of the blocks on the page being shown, and the language
  // switches on it - both reset with every page (see renderStage), like every other page-scoped list.
  var languageRefreshers = [];
  var languageSwitches = [];

  function setLanguage(locale) {
    if (locale === currentLanguage || languages.indexOf(locale) === -1) return;
    currentLanguage = locale;
    document.documentElement.setAttribute("lang", locale.split("_")[0]);
    languageRefreshers.forEach(function (refill) {
      refill();
    });
    languageSwitches.forEach(function (select) {
      select.value = locale;
    });
    refreshVariableDisplays();
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
  // every logic block still ahead.
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

  function goPrev() {
    if (pos <= 0) return;
    pos--;
    if (variablesAtEntry[pos]) {
      variables = Object.assign({}, variablesAtEntry[pos]);
      cursor = JSON.parse(JSON.stringify(cursorAtEntry[pos]));
      history.length = pos + 1;
      variablesAtEntry.length = pos + 1;
      cursorAtEntry.length = pos + 1;
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
    pos = -1;
    goNext();
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
    ".weft-block-quiz, .weft-files, .weft-block-language, .weft-block-iframe";
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
  // shapeSvgMarkup below to correct a rounded rectangle's corners (see roundedRectPath).
  function slideAspectNumeric() {
    var ratio = parseAspectRatio();
    return ratio[0] / ratio[1];
  }

  function stageStyle() {
    var ratio = parseAspectRatio();
    return "--ar-w:" + ratio[0] + ";--ar-h:" + ratio[1] + ";";
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
  var outgoingTriggers = {}; // event id -> [trigger]
  var performers = {}; // event id -> function that runs the event's action
  var waitingForWeiter = {}; // trigger id -> trigger, for the triggers whose source has happened and that wait for Weiter
  var triggersDelivered = [];
  // A loop of triggers without delay or Weiter would never let the page breathe: every delivery is asynchronous, and there is a cap
  // on how many go out per second.
  var MAX_DELIVERIES_PER_SECOND = 600;

  function setUpGraph(page) {
    graphGeneration++;
    graphEvents = {};
    outgoingTriggers = {};
    performers = {};
    waitingForWeiter = {};
    triggersDelivered = [];
    var graph = page.graph || { events: [], triggers: [] };
    graph.events.forEach(function (event) {
      graphEvents[event.id] = event;
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

  // The event has happened: its outgoing triggers go out.
  function happened(eventId) {
    var triggers = outgoingTriggers[eventId];
    if (!triggers) return;
    triggers.forEach(function (trigger) {
      if (trigger.weiter) waitingForWeiter[trigger.id] = trigger;
      else deliver(trigger, false);
    });
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
    waitingForWeiter = {};
    Object.keys(waiting).forEach(function (id) {
      deliver(waiting[id], true);
    });
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
  function effectFrames(wrap, effect, phase) {
    var type = effect.type;
    var frames = null;
    if (type === "fade") {
      frames = [{ opacity: 0 }, { opacity: 1 }];
    } else if (type === "move") {
      frames = [{ translate: "100% 0" }, { translate: "0 0" }];
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
  function quizFillEventId(blockId) {
    return "quiz-fill:" + blockId;
  }
  function quizSubmitEventId(blockId, outcome) {
    return outcome ? "quiz-submit:" + blockId + ":" + outcome : "quiz-submit:" + blockId;
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

  /**
   * Wires up one block's own Aufbau/Abbau (see BaseBlock.entranceEffect/exitEffect in core/types.ts): the block's events are in the
   * page's graph (page.graph.events) when the effect is configured - an Aufbau means the block is hidden until its event
   * happens, which it does when a trigger reaches it (see performers) and the animation (or its absence: "none" reveals instantly)
   * has run. With no Aufbau at all (entranceEffect.type "off", the default) the block is simply there from the start. An Abbau
   * likewise. Once either has happened, the event goes on to its own outgoing triggers - another Aufbau on Weiter, a video that
   * starts, the page that is left.
   */
  function applyBlockEffects(wrap, block, page) {
    var entrance = block.entranceEffect || { type: "none", durationMs: 500 };
    var exit = block.exitEffect || { type: "none", durationMs: 500 };
    var entranceId = blockEffectEventId(block.id, "entrance");
    var exitId = blockEffectEventId(block.id, "exit");

    // An Aufbau that is configured (any type but "off") means the block is not there until the Aufbau event happens.
    if (graphEvents[entranceId]) {
      wrap.style.visibility = "hidden";
      var shown = false;
      performers[entranceId] = function () {
        // Already there: nothing to do, and nothing happens again (so a loop through an Aufbau settles).
        if (shown) return;
        shown = true;
        var done = function () {
          happened(entranceId);
        };
        // The block stays visibility:hidden inline until the effect is over, and the animation itself
        // says "visible" (visibility is animatable, and fill: "both" keeps both ends in force): so the
        // block is already shown - at its starting state - from the very first frame of the animation
        // (no flash of the finished block before it begins), and stays shown at its end state however
        // late the "finish" event is delivered.
        // That event comes with a rendered frame, which a page in a throttled or hidden iframe can hold
        // back for a long time, or never get - so the effect is completed by the animation's end OR a
        // timer just after its duration, whichever is first (once()): inline state cleaned up, and the
        // entrance event fired that the next build in the Weiter chain is waiting for.
        var frames = effectFrames(wrap, entrance, "entrance");
        if (frames) {
          var duration = entrance.durationMs || 500;
          var visible = frames.map(function (frame) {
            return Object.assign({ visibility: "visible" }, frame);
          });
          // Anvil lands on its own timing curves; the others ease as a whole.
          var animation = wrap.animate(visible, { duration: duration, easing: entrance.type === "anvil" ? "linear" : "ease", fill: "both" });
          var complete = once(function () {
            wrap.style.visibility = "";
            animation.cancel();
            done();
          });
          animation.onfinish = complete;
          setTimeout(complete, duration + 100);
        } else {
          wrap.style.visibility = "";
          done();
        }
      };
    }
    // else: no Aufbau at all ("off") - stays at its natural visibility (visible), no event for it.

    if (graphEvents[exitId]) {
      var gone = false;
      // Idempotent, and also run by a timer shortly after the animation's duration - see the Aufbau above for why a
      // "finish" event alone can't be relied on.
      var hideExit = once(function () {
        wrap.style.visibility = "hidden";
        happened(exitId);
      });
      performers[exitId] = function () {
        if (gone) return;
        gone = true;
        var duration = exit.durationMs || 500;
        // fill: "forwards" keeps the end state until hideExit hides the block - no frame at the
        // original state in between.
        var animation = null;
        var frames = effectFrames(wrap, exit, "exit");
        if (frames) {
          animation = wrap.animate(frames, { duration: duration, easing: exit.type === "anvil" ? "linear" : "ease", fill: "forwards" });
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

  // ---- ShapeBlock rendering - hand-duplicated from features/editor/blocks/shapeGeometry.ts and
  // ShapeSvg.tsx (this file can't import from there, see the file header) - keep both in sync by
  // hand for any change here. ----

  // Degrees, clockwise from straight up - see shapeGeometry.ts's own comment for why (so a
  // polygon/star's first point always lands at the top, matching how they're conventionally
  // drawn).
  function pointOnCircle(angleDeg, radius) {
    var rad = (angleDeg * Math.PI) / 180;
    return [50 + radius * Math.sin(rad), 50 - radius * Math.cos(rad)];
  }

  function regularPolygonPoints(sides) {
    var n = Math.max(3, Math.round(sides));
    var points = [];
    for (var i = 0; i < n; i++) points.push(pointOnCircle((360 / n) * i, 50));
    return points;
  }

  function starOutlinePoints(points, innerRadiusPercent) {
    var n = Math.max(3, Math.round(points));
    var innerRadius = (50 * Math.max(0, Math.min(100, innerRadiusPercent))) / 100;
    var result = [];
    for (var i = 0; i < n * 2; i++) {
      result.push(pointOnCircle((360 / (n * 2)) * i, i % 2 === 0 ? 50 : innerRadius));
    }
    return result;
  }

  function pointsAttr(points) {
    return points
      .map(function (p) {
        return p[0] + "," + p[1];
      })
      .join(" ");
  }

  // Corrects one corner's radius (0-50, percent of the block's own shorter *true* side - see
  // ShapeCornerRadii's own doc comment in core/types.ts) into the (rx, ry) pair the 0-100 square
  // needs so that, once stretched by `boxAspect` (the block's true on-slide width:height ratio)
  // to the block's actual shape, the corner traces a true circular arc rather than an elliptical
  // one - see shapeGeometry.ts's own correctedCornerRadius.
  function correctedCornerRadius(radius, boxAspect) {
    var r = Math.min(50, Math.max(0, radius));
    return boxAspect <= 1 ? [r, r * boxAspect] : [r / boxAspect, r];
  }

  // See shapeGeometry.ts's own roundedRectPath.
  function roundedRectPath(radii, boxAspect) {
    var tl = correctedCornerRadius(radii.topLeft, boxAspect);
    var tr = correctedCornerRadius(radii.topRight, boxAspect);
    var br = correctedCornerRadius(radii.bottomRight, boxAspect);
    var bl = correctedCornerRadius(radii.bottomLeft, boxAspect);
    return (
      "M " + tl[0] + " 0 " +
      "L " + (100 - tr[0]) + " 0 " +
      "A " + tr[0] + " " + tr[1] + " 0 0 1 100 " + tr[1] + " " +
      "L 100 " + (100 - br[1]) + " " +
      "A " + br[0] + " " + br[1] + " 0 0 1 " + (100 - br[0]) + " 100 " +
      "L " + bl[0] + " 100 " +
      "A " + bl[0] + " " + bl[1] + " 0 0 1 0 " + (100 - bl[1]) + " " +
      "L 0 " + tl[1] + " " +
      "A " + tl[0] + " " + tl[1] + " 0 0 1 " + tl[0] + " 0 " +
      "Z"
    );
  }

  function hexToRgba(hex, opacity) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return hex;
    return "rgba(" + parseInt(m[1], 16) + ", " + parseInt(m[2], 16) + ", " + parseInt(m[3], 16) + ", " + opacity + ")";
  }

  function shapeGradientId(blockId) {
    return "weft-shape-fill-" + blockId;
  }

  // "dashed"/"dotted" scale with the stroke's own width (cqw), same reasoning as ShapeSvg.tsx's
  // strokeDashStyle: a thicker stroke gets proportionally longer dashes/gaps.
  function strokeDashStyle(style, widthCqw) {
    if (style === "dashed") return "stroke-dasharray:" + widthCqw * 2.5 + "cqw " + widthCqw * 1.5 + "cqw;stroke-linecap:butt;";
    if (style === "dotted") return "stroke-dasharray:0.01cqw " + widthCqw * 2 + "cqw;stroke-linecap:round;";
    return "";
  }

  function shapeSvgMarkup(block) {
    var fill = block.fill;
    var stroke = block.stroke;
    var shadow = block.shadow;
    var gradientId = shapeGradientId(block.id);

    var fillValue = fill.type === "none" ? "none" : fill.type === "gradient" ? "url(#" + gradientId + ")" : fill.color;
    var fillOpacityAttr = fill.type === "solid" ? ' fill-opacity="' + fill.opacity + '"' : "";

    var strokeAttrs = "";
    if (stroke.enabled) {
      strokeAttrs =
        ' stroke="' +
        stroke.color +
        '" stroke-opacity="' +
        stroke.opacity +
        '" style="stroke-width:' +
        stroke.width +
        "cqw;vector-effect:non-scaling-stroke;" +
        strokeDashStyle(stroke.style, stroke.width) +
        '"';
    }

    var shapeMarkup;
    if (block.shapeKind === "rectangle") {
      // The block's own TRUE on-slide width:height ratio - see roundedRectPath's own comment for
      // why a rounded rectangle's corners need this to stay circular instead of elliptical.
      var boxAspect = block.position.height > 0 ? (block.position.width / block.position.height) * slideAspectNumeric() : 1;
      shapeMarkup = '<path d="' + roundedRectPath(block.cornerRadii, boxAspect) + '" fill="' + fillValue + '"' + fillOpacityAttr + strokeAttrs + "/>";
    } else if (block.shapeKind === "ellipse") {
      shapeMarkup = '<ellipse cx="50" cy="50" rx="50" ry="50" fill="' + fillValue + '"' + fillOpacityAttr + strokeAttrs + "/>";
    } else if (block.shapeKind === "polygon") {
      shapeMarkup =
        '<polygon points="' + pointsAttr(regularPolygonPoints(block.sides)) + '" fill="' + fillValue + '"' + fillOpacityAttr + strokeAttrs + "/>";
    } else {
      shapeMarkup =
        '<polygon points="' +
        pointsAttr(starOutlinePoints(block.starPoints, block.starInnerRadius)) +
        '" fill="' +
        fillValue +
        '"' +
        fillOpacityAttr +
        strokeAttrs +
        "/>";
    }

    var defsMarkup = "";
    if (fill.type === "gradient") {
      var stops = fill.gradient.stops
        .map(function (s) {
          return '<stop offset="' + s.offset + '%" stop-color="' + s.color + '" stop-opacity="' + s.opacity + '"/>';
        })
        .join("");
      defsMarkup =
        fill.gradient.kind === "radial"
          ? '<defs><radialGradient id="' + gradientId + '" cx="50%" cy="50%" r="50%">' + stops + "</radialGradient></defs>"
          : '<defs><linearGradient id="' +
            gradientId +
            '" x1="0%" y1="0%" x2="100%" y2="0%" gradientTransform="rotate(' +
            fill.gradient.angle +
            ' 0.5 0.5)">' +
            stops +
            "</linearGradient></defs>";
    }

    var filterStyle = shadow.enabled
      ? "filter:drop-shadow(" +
        shadow.offsetX +
        "cqw " +
        shadow.offsetY +
        "cqw " +
        shadow.blur +
        "cqw " +
        hexToRgba(shadow.color, shadow.opacity) +
        ");"
      : "";

    return (
      '<svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:100%;display:block;overflow:visible;' +
      filterStyle +
      '">' +
      defsMarkup +
      shapeMarkup +
      "</svg>"
    );
  }

  // Kept in sync by hand with BlockPanel.tsx's DEFAULT_VIEWPORT_WIDTH and BlockView.tsx's own
  // copy - a module saved before forcedViewportWidth existed has no value for it at all, and a
  // virtual viewport is always in effect now (see IframeEditor's comment for why), so this needs
  // an actual width to fall back to rather than just meaning "off".
  var DEFAULT_VIEWPORT_WIDTH = 768;

  // The embedded page is always given exactly this fixed CSS-pixel WIDTH (so it sees a constant
  // "window" width no matter how large the module itself is displayed, e.g. to force its mobile
  // layout) - height is DERIVED from the wrap's own aspect ratio times that width, so the virtual
  // viewport always has exactly the block's own shape and the scaled result fills it edge to edge
  // with no letterboxing.
  //
  // Both that derived height AND the scale factor that fits the fixed-width iframe into the wrap
  // used to be computed live in CSS via container query units (100cqh / 100cqw for the height,
  // 100cqw / <width> for the scale) - that worked in Chromium/WebKit but isn't portable: Firefox
  // rejects a calc() that divides one length by another as an invalid value outright, for *both*
  // of those, silently dropping the whole declaration - width, a plain literal, still applied, so
  // the iframe rendered at exactly the right width but fell back to the browser's default ~150px
  // height and a 1:1 (unscaled) transform. The height is derived in JS now instead (block.position
  // and module.aspectRatio are already known data here, no container query needed for it at all);
  // the scale factor still genuinely needs the wrap's own rendered pixel width, which isn't known
  // until layout, so that's measured via ResizeObserver instead of computed via calc(). Matches
  // BlockView.tsx's IframeFrame in the editor exactly.
  function iframeEl(block, src) {
    var w = block.forcedViewportWidth || DEFAULT_VIEWPORT_WIDTH;
    var ratio = parseAspectRatio();
    var stageHeightOverWidth = ratio[1] / ratio[0];
    var wrapHeightOverWidth = stageHeightOverWidth * (block.position.height / block.position.width);
    var h = w * wrapHeightOverWidth;
    var frame = el("iframe", {
      src: src,
      sandbox: (block.sandbox || []).join(" "),
      allow: block.allow || "",
      style: "width:" + w + "px;height:" + h + "px;border:0;",
    }, []);
    var wrap = el("div", { class: "weft-iframe-viewport-wrap" }, [frame]);
    var observer = new ResizeObserver(function (entries) {
      var rect = entries[0] && entries[0].contentRect;
      if (rect) frame.style.transform = "scale(" + rect.width / w + ")";
    });
    observer.observe(wrap);
    return wrap;
  }

  function fillWithIframe(wrap, block, src) {
    wrap.innerHTML = "";
    wrap.appendChild(iframeEl(block, src));
  }

  function renderIframeGate(wrap, block) {
    var gate = el("div", { class: "weft-qr-gate" }, []);
    var svg = qrCodeSvgs[block.id];
    if (svg) {
      var qrBox = el("div", { class: "weft-qr-code" }, []);
      qrBox.innerHTML = svg;
      gate.appendChild(qrBox);
    }
    var link = el("button", { type: "button", class: "weft-qr-link" }, [document.createTextNode(block.url)]);
    link.addEventListener("click", function () {
      fillWithIframe(wrap, block, block.presentationUrl || block.url);
    });
    gate.appendChild(link);
    wrap.appendChild(gate);
  }

  // Scales the once-typeset formula to fit (contain, centered) its box - mirrors TexView.tsx. The
  // observer's first callback runs as soon as the box is attached and laid out, and again whenever
  // the stage is resized.
  function fitTexBlock(box, inner) {
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
    if (typeof ResizeObserver === "function") {
      var observer = new ResizeObserver(fit);
      observer.observe(box);
      // KaTeX's fonts load lazily and change the formula's natural size once they arrive.
      observer.observe(inner);
    } else window.addEventListener("resize", fit);
  }

  function renderStaticBlock(block, page) {
    var wrap = el("div", { class: "weft-block weft-block-" + block.kind, style: positionStyle(block.position) });
    if (block.kind === "text") {
      if (block.scrollable) wrap.classList.add("is-scrollable");
      var fillText = function () {
        wrap.innerHTML = blockHtml(block);
        applyVariablesToNode(wrap);
      };
      fillText();
      languageRefreshers.push(fillText);
    } else if (block.kind === "language") {
      var languageSelect = el("select", { class: "weft-language-select", "aria-label": uiString("language") }, []);
      languageRefreshers.push(function () {
        languageSelect.setAttribute("aria-label", uiString("language"));
      });
      languages.forEach(function (locale) {
        languageSelect.appendChild(el("option", { value: locale }, [document.createTextNode(languageLabels[locale] || locale)]));
      });
      languageSelect.value = currentLanguage;
      languageSelect.addEventListener("change", function () {
        setLanguage(languageSelect.value);
      });
      languageSwitches.push(languageSelect);
      wrap.appendChild(languageSelect);
    } else if (block.kind === "code") {
      // Same markup and font-size math as the editor's CodeView.tsx.
      var codeBox = el("div", {
        class: "weft-code weft-code-theme-" + block.theme + (block.transparentBackground ? " weft-code-transparent" : ""),
        style: "font-size:" + Math.round((block.fontSize / 9.6) * 1000) / 1000 + "cqw;",
      }, []);
      var codePre = el("pre", { class: "weft-code-pre" }, []);
      codePre.innerHTML = codeHtml[block.id] || "";
      codeBox.appendChild(codePre);
      wrap.appendChild(codeBox);
    } else if (block.kind === "tex") {
      var texBox = el("div", { class: "weft-tex" }, []);
      var texInner = el("div", { class: "weft-tex-inner" }, []);
      texInner.innerHTML = texHtml[block.id] || "";
      texBox.appendChild(texInner);
      wrap.appendChild(texBox);
      if (block.color) wrap.style.color = block.color;
      fitTexBlock(texBox, texInner);
    } else if (block.kind === "image") {
      wrap.appendChild(el("img", { src: assetSrc(block.assetId), alt: block.alt, style: "display:block;width:100%;height:100%;object-fit:contain;" }, []));
    } else if (block.kind === "video") {
      var videoWrap = el("div", { class: "weft-video-wrap" }, []);
      var videoEl = el("video", {
        src: assetSrc(block.assetId),
        class: "weft-video-el",
        playsinline: "",
        controls: block.controls ? "" : undefined,
        loop: block.loop ? "" : undefined,
      }, []);
      // Set as live properties, not just attributes: the `muted` content attribute only seeds
      // defaultMuted, not the actual playback-affecting `muted` property, and browsers only
      // honor autoplay at all when that live property is already true at play() time - so
      // setting the attribute alone (as el()'s other boolean attrs do above) would silently
      // leave audible autoplay blocked.
      videoEl.muted = !!block.muted;
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
      if (block.stopPoints && block.stopPoints.length > 0) {
        var lastStopCheckTime = -1;
        videoEl.addEventListener("timeupdate", function () {
          var current = videoEl.currentTime;
          var shouldPause = false;
          for (var i = 0; i < block.stopPoints.length; i++) {
            var stopPoint = block.stopPoints[i];
            if (lastStopCheckTime < stopPoint.timeSeconds && current >= stopPoint.timeSeconds) {
              happened(videoStopEventId(block.id, stopPoint.id));
              if (stopPoint.stopsVideo) shouldPause = true;
            }
          }
          if (shouldPause) videoEl.pause();
          lastStopCheckTime = current;
        });
      }

      // A big, obviously-clickable play button over the video - shown until playback actually
      // starts (by a click here or, once it lands, a successful autoplay), then hidden again on
      // pause/end so it doesn't sit on top of the video's own controls bar (if block.controls
      // enabled one) fighting over the same "play" affordance while it's already playing.
      var playButton = el("button", { type: "button", class: "weft-video-play", "aria-label": uiString("play") }, []);
      languageRefreshers.push(function () {
        playButton.setAttribute("aria-label", uiString("play"));
      });
      playButton.innerHTML = PLAY_ICON_SVG;
      playButton.addEventListener("click", function (ev) {
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
        playButton.classList.add("is-hidden");
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
        playButton.classList.remove("is-hidden");
      });

      videoWrap.appendChild(videoEl);
      videoWrap.appendChild(playButton);
      wrap.appendChild(videoWrap);
    } else if (block.kind === "iframe") {
      if (block.qrCode) {
        renderIframeGate(wrap, block);
      } else {
        wrap.appendChild(iframeEl(block, block.url));
      }
    } else if (block.kind === "shape") {
      wrap.innerHTML = shapeSvgMarkup(block);
    } else if (block.kind === "files") {
      wrap.appendChild(filesBoxElement(block));
    } else if (block.kind === "arrow") {
      // arrowSvgMarkup is core/runtime/arrowGeometry.js, embedded ahead of this script (buildRuntimeHtml.ts) -
      // the very code the editor draws the arrow with. boxAspect: the block's real width : height on the slide.
      var arrowBoxAspect = block.position.height > 0 ? (block.position.width / block.position.height) * slideAspectNumeric() : 1;
      wrap.innerHTML = arrowSvgMarkup(block, arrowBoxAspect);
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

  function renderButtonBlock(block) {
    var wrap = el("div", { class: "weft-block weft-block-button", style: positionStyle(block.position) });
    var button = el("button", { type: "button", class: "weft-block-button-el" }, []);
    var fillButton = function () {
      button.textContent = buttonLabel(block);
      applyVariablesToNode(button);
    };
    fillButton();
    languageRefreshers.push(fillButton);
    // The click is an event of the page's graph (see core/eventGraph): whatever the author connected to it happens - by default
    // "Nächste Folie". Besides that:
    var clickEventId = "button-click:" + block.id;
    if (block.action === "prev") {
      button.disabled = pos <= 0;
      button.addEventListener("click", function () {
        happened(clickEventId);
        goPrev();
      });
    } else {
      // "Weiter" (action "advance") is the same Weiter Space/→ is (see weiter): everything that waits for it arrives - the next
      // build, or the page that is left. "event" does nothing besides the event. Once the module has ended, either restarts it.
      button.addEventListener("click", function () {
        if (pos >= history.length) {
          restart();
          return;
        }
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

  function renderQuizBlock(block) {
    var wrap = el("div", { class: "weft-block weft-block-quiz", style: positionStyle(block.position) });
    var form = el("form", { class: "weft-quiz" }, []);

    var question = el("div", { class: "weft-quiz-question" }, []);
    var optionTexts = [];
    var fillQuiz = function () {
      question.innerHTML = quizQuestionHtml(block);
      applyVariablesToNode(question);
      optionTexts.forEach(function (entry) {
        entry.element.innerHTML = quizOptionHtml(block, entry.option);
        applyVariablesToNode(entry.element);
      });
    };
    question.innerHTML = quizQuestionHtml(block);
    applyVariablesToNode(question);
    languageRefreshers.push(fillQuiz);
    form.appendChild(question);

    var optionsWrap = el("div", { class: "weft-quiz-options" }, []);
    block.options.forEach(function (opt) {
      // The whole card is the <label> (not just a small checkbox) so clicking anywhere on an
      // option selects it, and .weft-quiz-option:has(input:checked) in the stylesheet picks up
      // both the card highlight and which of the two icons below shows - no separate "selected"
      // class to keep in sync. The checkbox itself stays a real, focusable/keyboard-operable
      // <input> - it's just visually hidden (opacity:0, sized/positioned exactly over the icon
      // pair) rather than removed, so clicking or tabbing to it still works exactly like a native
      // checkbox, it just never shows the OS's own checkbox chrome.
      var optionLabel = el("label", { class: "weft-quiz-option" }, []);
      var checkboxWrap = el("span", { class: "weft-quiz-option-checkbox" }, []);
      var input = el("input", { type: "checkbox", name: "opt-" + block.id, value: opt.id, class: "weft-quiz-option-input" }, []);
      var uncheckedIcon = el("span", { class: "weft-quiz-option-checkbox-icon weft-quiz-option-checkbox-icon-unchecked" }, []);
      uncheckedIcon.innerHTML = QUIZ_CHECKBOX_UNCHECKED_SVG;
      var checkedIcon = el("span", { class: "weft-quiz-option-checkbox-icon weft-quiz-option-checkbox-icon-checked" }, []);
      checkedIcon.innerHTML = QUIZ_CHECKBOX_CHECKED_SVG;
      checkboxWrap.appendChild(input);
      checkboxWrap.appendChild(uncheckedIcon);
      checkboxWrap.appendChild(checkedIcon);
      var text = el("span", { class: "weft-quiz-option-text" }, []);
      text.innerHTML = quizOptionHtml(block, opt);
      applyVariablesToNode(text);
      optionTexts.push({ element: text, option: opt });
      optionLabel.appendChild(checkboxWrap);
      optionLabel.appendChild(text);
      optionsWrap.appendChild(optionLabel);
    });
    form.appendChild(optionsWrap);

    // Fires once, the moment the learner picks a first option - matches "Ausfüllen" in the
    // editor's own graph exactly (see quizFillNodeId in pageTimeline.ts), which is likewise about
    // the first pick, not every subsequent one.
    var hasFiredFill = false;
    optionsWrap.addEventListener("change", function () {
      if (hasFiredFill) return;
      hasFiredFill = true;
      happened(quizFillEventId(block.id));
    });

    // A plain button, not a form's submit: a module may run in an iframe without allow-forms (the editor's preview, a player
    // file), where a form never fires "submit".
    var submit = el("button", { type: "button", class: "weft-quiz-submit" }, []);
    var submitIcon = el("span", { class: "weft-quiz-submit-icon" }, []);
    submitIcon.innerHTML = QUIZ_SUBMIT_ICON_SVG;
    submit.appendChild(submitIcon);
    var submitLabel = document.createTextNode(uiString("submit"));
    submit.appendChild(submitLabel);
    form.appendChild(submit);
    // answered: null until the quiz was submitted, then whether it was right - so the feedback text
    // follows a language change made afterwards, too.
    var answered = null;
    var open = block.open === true; // an open question: nothing is right or wrong
    var showFeedbackTitle = function () {
      feedbackTitle.textContent = uiString(open ? "thanks" : answered ? "correct" : "incorrect");
    };
    languageRefreshers.push(function () {
      submitLabel.nodeValue = uiString("submit");
      if (answered !== null) showFeedbackTitle();
    });

    // Hidden until submitted, and takes the submit button's place rather than sitting next to it
    // (see the submit handler) - there's nothing left to submit once it's showing.
    var feedback = el("div", { class: "weft-quiz-feedback", hidden: "" }, []);
    var feedbackIcon = el("span", { class: "weft-quiz-feedback-icon" }, []);
    var feedbackTitle = el("strong", { class: "weft-quiz-feedback-title" }, []);
    feedback.appendChild(feedbackIcon);
    feedback.appendChild(feedbackTitle);
    form.appendChild(feedback);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
    });
    submit.addEventListener("click", function () {
      var checked = Array.prototype.slice
        .call(form.querySelectorAll("input:checked"))
        .map(function (input) {
          return input.value;
        });
      var correct =
        open ||
        (checked.length === block.correctOptionIds.length &&
        checked.every(function (id) {
          return block.correctOptionIds.indexOf(id) !== -1;
        }));
      (correct ? block.onCorrect : block.onIncorrect).forEach(applyEffect);
      // Each answer on its own: handled right (ticked if it is a correct one, left alone if it isn't) or wrong.
      block.options.forEach(function (option) {
        var ticked = checked.indexOf(option.id) !== -1;
        var right = open ? ticked : ticked === (block.correctOptionIds.indexOf(option.id) !== -1);
        ((right ? option.onRight : option.onWrong) || []).forEach(applyEffect);
      });
      // Fires both the plain, outcome-agnostic event (for a trigger configured against the
      // generic "Quiz abgeschickt" node - see quizSubmitNodeId in pageTimeline.ts, built when
      // neither advanceOnCorrect nor advanceOnIncorrect is on) AND the one matching this
      // particular submission's own actual outcome (for a trigger configured against the
      // "richtig"/"falsch"-specific node, built once that outcome has its own lane) - whichever
      // of the two an author could actually have picked in the editor has a real listener here;
      // the other is just an id nothing happens to be registered against, same as any other
      // no-op happened() call. Going on to the next page after the feedback is a trigger of the graph (see
      // core/eventGraph/buildEventGraph.ts) - nothing to do for it here.
      happened(quizSubmitEventId(block.id));
      happened(quizSubmitEventId(block.id, correct ? "richtig" : "falsch"));

      // Replaces the submit button rather than joining it (see the feedback element above), and
      // locks the options in place - both so a learner can't submit twice, and so the answer
      // shown as "correct"/"incorrect" can't silently change after the fact by re-checking boxes.
      submit.hidden = true;
      Array.prototype.slice.call(form.querySelectorAll(".weft-quiz-option-input")).forEach(function (input) {
        input.disabled = true;
      });
      feedbackIcon.innerHTML = correct ? QUIZ_CORRECT_ICON_SVG : QUIZ_INCORRECT_ICON_SVG;
      answered = correct;
      showFeedbackTitle();
      feedback.className = "weft-quiz-feedback " + (open ? "is-thanks" : correct ? "is-correct" : "is-incorrect");
      feedback.hidden = false;
    });

    wrap.appendChild(form);
    return wrap;
  }

  function renderBlock(block, page) {
    var wrap = block.kind === "quiz" ? renderQuizBlock(block) : block.kind === "button" ? renderButtonBlock(block) : renderStaticBlock(block, page);
    applyBlockEffects(wrap, block, page);
    return wrap;
  }

  function renderStage(pageId) {
    // A fresh graph for a fresh page (see setUpGraph): what is still on its way for the page that was showing is dropped. In
    // particular every page's own Weiter-build progress restarts from the top on a fresh render of it - including navigating
    // back to a page you'd already stepped through once.
    languageRefreshers = [];
    languageSwitches = [];
    var page = module.pages[pageId];
    setUpGraph(page);
    var stage = el("div", { class: "weft-stage", style: stageStyle() }, []);
    var layout = page.layoutId ? module.layouts[page.layoutId] : null;
    // Layout blocks are marked so a "content only" Move can leave them standing while the page's own
    // blocks slide (see animateTransition).
    if (layout) {
      layout.blocks.forEach(function (b) {
        var layoutBlock = renderBlock(b, page);
        layoutBlock.classList.add("weft-block-from-layout");
        stage.appendChild(layoutBlock);
      });
    }
    page.blocks.forEach(function (b) { stage.appendChild(renderBlock(b, page)); });
    // Every block's own actions are registered synchronously above, by the time renderBlock returns for it - so the start of
    // the page happens here, still before this stage is even returned to be appended to the DOM; what it triggers arrives
    // right after (see deliver), when the blocks are on the page.
    happened("start");
    return stage;
  }

  // No Zurück/Weiter bar any more - navigation lives on the slides themselves as button
  // blocks (see renderButtonBlock). The one dead end that leaves is the synthetic "done" screen,
  // which isn't a real page and so can't carry an author-placed button - it gets its own restart
  // button for exactly that reason.
  function buildStageWrap() {
    var wrap = el("div", { class: "weft-stage-wrap" }, []);

    if (pos >= history.length) {
      var restartBtn = el("button", { type: "button", class: "weft-block-button-el weft-done-restart" }, [
        document.createTextNode(uiString("restart")),
      ]);
      restartBtn.addEventListener("click", restart);
      var doneStage = el("div", { class: "weft-stage weft-stage-done", style: stageStyle() }, [
        el("div", { class: "weft-done-message" }, [document.createTextNode(uiString("done"))]),
        restartBtn,
      ]);
      wrap.appendChild(doneStage);
    } else {
      wrap.appendChild(renderStage(history[pos]));
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

  function animateTransition(root, oldWrap, newWrap, transition) {
    var duration = transition.durationMs || 500;
    var type = transition.type;
    var width = root.clientWidth;
    var height = root.clientHeight;
    var cancelled = false;
    oldWrap.classList.add("is-transition-old");
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

    if (oldWrap && outgoingTransition && outgoingTransition.type !== "none") {
      animateTransition(root, oldWrap, newWrap, outgoingTransition);
    } else {
      root.innerHTML = "";
      root.appendChild(newWrap);
    }

    // After every slide (the finished screen included): progress has moved, and so may anything a
    // formula reads from it.
    syncLms();
  }

  goNext();
})();
