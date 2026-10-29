// How a gap text (ClozeBlock) is drawn - for the player, the editor's thumbnails and the PDF alike: one function, told where it draws. Plain JavaScript
// without imports: this file is inlined verbatim (its "export" taken away) into the exported page ahead of the player (core/runtime/buildRuntimeHtml.ts)
// and imported as a module by the editor (render.d.ts). (On the editor's canvas the text is written in place, the blanks as `[[answer]]`: that is the
// editor's own, ClozeBlockCanvas in BlockView.)
//
//   renderCloze(root, props, ctx) draws into `root` (an empty element that has the block's size) and returns { update(props), destroy() }.
//
//   props   what the block says, in the language that is shown: { html, caseSensitive, tolerance } - the text with its blanks written as [[answer]]
//           (or [[answer|another answer]]: both are right), whether capital and small letters have to be as written, and how many characters of an
//           answer may be wrong (0-2).
//   ctx     what the place it is drawn in provides:
//     mode        "play" (the learner uses it) | "edit" | "thumbnail" | "print" - outside "play" it is only a picture of the empty fields and the
//                 button, nothing in it can be used.
//     text(key), textWith(key, values)   the player's own words in the language that is shown ("blank" - "Lücke {n} von {total}", the name of a field
//                 for whoever cannot see it -, "submit", "correct", "incorrect").
//     icons       { submit, correct, incorrect }: the SVG of the button's tick and of the feedback.
//     applyVariables(node)   puts the values of variables in for the placeholders in the text (only the player has them: absent in the editor).
//     fill()      the first letter was typed.
//     submit({ blanks: [{ key, right }], allRight })   the answers were submitted and judged (`key` is what stands in the brackets) - what follows from it
//                 (the changes to variables, the score, the required task, the events of the page's graph) is the place's to do.
//     announce(text)   say the feedback to those who cannot see it.
//
// A marker is recognised when it stands in ONE text node - formatting in the middle of it (`[[Ber<b>lin</b>]]`) splits it, like a {{variable}}; the
// panel lists what was recognised (core/document/cloze.ts, which uses what is exported here). The markup and the class names are those of the card of a
// quiz's answer (core/runtime/quizCard.css); the look of the fields is in blocks/cloze/render.css.

export var CLOZE_MARKER = /\[\[([^\[\]]+)\]\]/g;

// The number of single-character changes (insert, delete, replace) that turn `a` into `b`.
export function clozeLevenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  var previous = [];
  for (var j = 0; j <= b.length; j++) previous.push(j);
  for (var i = 1; i <= a.length; i++) {
    var current = [i];
    for (var k = 1; k <= b.length; k++) {
      var cost = a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1;
      current[k] = Math.min(previous[k] + 1, current[k - 1] + 1, previous[k - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

// What counts as the same: spaces do not count at all (1 714 is 1714, "New York" is "NewYork"), capital letters only if they are asked for.
export function clozeNormalise(text, caseSensitive) {
  var trimmed = String(text).replace(/\s+/g, "");
  return caseSensitive ? trimmed : trimmed.toLocaleLowerCase();
}

// How many wrong characters are put up with: the tolerance, and none for a very short answer (with "Rom" and one allowed slip, "Ram" is a different word
// as much as a typo).
export function clozeAllowedSlips(answerLength, tolerance) {
  if (!(tolerance > 0)) return 0;
  return answerLength > tolerance * 2 ? tolerance : 0;
}

// Whether `given` is one of the right `answers`.
export function clozeIsRight(given, answers, caseSensitive, tolerance) {
  var typed = clozeNormalise(given, caseSensitive);
  if (!typed.length) return false;
  return answers.some(function (answer) {
    var wanted = clozeNormalise(answer, caseSensitive);
    return clozeLevenshtein(typed, wanted) <= clozeAllowedSlips(wanted.length, tolerance);
  });
}

export function renderCloze(root, props, ctx) {
  var live = ctx.mode === "play";
  var data = props;

  var box = document.createElement("div");
  box.className = "weft-cloze" + (live ? "" : " is-picture");
  var text = document.createElement("div");
  text.className = "weft-cloze-text";
  box.appendChild(text);
  var blanks = []; // { input, mark, key, answers }
  var answered = null; // null until submitted, then whether everything was right
  var hasFiredFill = false;

  // The text with its markers turned into input fields.
  var fillText = function () {
    var kept = blanks.map(function (blank) {
      return blank.input.value;
    });
    text.innerHTML = data.html;
    if (ctx.applyVariables) ctx.applyVariables(text);
    blanks = [];
    // How many blanks there are (for "Lücke 2 von 5" as the name of a field).
    var totalBlanks = (String(text.textContent).match(CLOZE_MARKER) || []).length;
    var walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      var value = node.nodeValue;
      CLOZE_MARKER.lastIndex = 0;
      if (!CLOZE_MARKER.test(value)) return;
      var fragment = document.createDocumentFragment();
      var last = 0;
      var match;
      CLOZE_MARKER.lastIndex = 0;
      while ((match = CLOZE_MARKER.exec(value))) {
        var key = match[1].trim();
        var answers = key
          .split("|")
          .map(function (answer) {
            return answer.trim();
          })
          .filter(function (answer) {
            return answer.length > 0;
          });
        if (!answers.length) continue;
        if (match.index > last) fragment.appendChild(document.createTextNode(value.slice(last, match.index)));
        var longest = answers.reduce(function (most, answer) {
          return Math.max(most, answer.length);
        }, 4);
        var input = document.createElement("input");
        input.setAttribute("type", "text");
        input.className = "weft-cloze-input";
        input.setAttribute("autocomplete", "off");
        input.setAttribute("autocapitalize", "off");
        input.setAttribute("spellcheck", "false");
        input.setAttribute("aria-label", ctx.textWith("blank", { n: blanks.length + 1, total: totalBlanks }));
        input.setAttribute("style", "width:" + Math.min(longest + 2, 30) + "ch;");
        var index = blanks.length;
        if (kept[index] !== undefined) input.value = kept[index];
        if (answered !== null) input.disabled = true;
        if (!live) {
          // A picture of the empty field: nothing can be written in it.
          input.readOnly = true;
          input.tabIndex = -1;
        } else {
          input.addEventListener("input", function () {
            if (hasFiredFill) return;
            hasFiredFill = true;
            ctx.fill();
          });
        }
        var mark = document.createElement("span");
        mark.className = "weft-cloze-mark";
        mark.setAttribute("aria-hidden", "true");
        fragment.appendChild(input);
        fragment.appendChild(mark);
        blanks.push({ input: input, mark: mark, key: key, answers: answers });
        last = match.index + match[0].length;
      }
      if (last === 0) return;
      if (last < value.length) fragment.appendChild(document.createTextNode(value.slice(last)));
      node.parentNode.replaceChild(fragment, node);
    });
  };
  fillText();

  var submit = document.createElement("button");
  submit.setAttribute("type", "button");
  submit.className = "weft-quiz-submit";
  var submitIcon = document.createElement("span");
  submitIcon.className = "weft-quiz-submit-icon";
  submitIcon.setAttribute("aria-hidden", "true");
  submitIcon.innerHTML = ctx.icons.submit;
  submit.appendChild(submitIcon);
  var submitLabel = document.createTextNode(ctx.text("submit"));
  submit.appendChild(submitLabel);
  box.appendChild(submit);

  var feedback = document.createElement("div");
  feedback.className = "weft-quiz-feedback";
  feedback.setAttribute("hidden", "");
  var feedbackIcon = document.createElement("span");
  feedbackIcon.className = "weft-quiz-feedback-icon";
  feedbackIcon.setAttribute("aria-hidden", "true");
  var feedbackTitle = document.createElement("strong");
  feedbackTitle.className = "weft-quiz-feedback-title";
  feedback.appendChild(feedbackIcon);
  feedback.appendChild(feedbackTitle);
  box.appendChild(feedback);
  var showFeedbackTitle = function () {
    feedbackTitle.textContent = ctx.text(answered ? "correct" : "incorrect");
  };

  if (!live) submit.tabIndex = -1;
  else {
    submit.addEventListener("click", function () {
      var caseSensitive = data.caseSensitive === true;
      var tolerance = data.tolerance || 0;
      var allRight = blanks.length > 0;
      var results = blanks.map(function (blank) {
        var right = clozeIsRight(blank.input.value, blank.answers, caseSensitive, tolerance);
        if (!right) allRight = false;
        blank.input.disabled = true;
        if (!right) blank.input.setAttribute("aria-invalid", "true");
        blank.input.className = "weft-cloze-input " + (right ? "is-correct" : "is-incorrect");
        blank.mark.textContent = right ? "✓" : "✗";
        blank.mark.className = "weft-cloze-mark " + (right ? "is-correct" : "is-incorrect");
        return { key: blank.key, right: right };
      });
      ctx.submit({ blanks: results, allRight: allRight });
      submit.hidden = true;
      feedbackIcon.innerHTML = allRight ? ctx.icons.correct : ctx.icons.incorrect;
      answered = allRight;
      showFeedbackTitle();
      feedback.className = "weft-quiz-feedback " + (allRight ? "is-correct" : "is-incorrect");
      feedback.hidden = false;
      ctx.announce(feedbackTitle.textContent);
    });
  }

  root.appendChild(box);

  return {
    // The language (or the words) changed: the texts are drawn again. What was marked after the submit stays as it is: the text is not made again.
    update: function (next) {
      data = next;
      submitLabel.nodeValue = ctx.text("submit");
      if (answered !== null) showFeedbackTitle();
      else fillText();
    },
    destroy: function () {
      if (box.parentNode) box.parentNode.removeChild(box);
    },
  };
}
