// How a quiz (QuizBlock) is drawn - for the player, the editor's thumbnails and the PDF alike: one function, told where it draws. Plain JavaScript
// without imports: this file is inlined verbatim (its "export" taken away) into the exported page ahead of the player (core/runtime/buildRuntimeHtml.ts)
// and imported as a module by the editor (render.d.ts). (On the editor's canvas the question and the answers are written in place and the right ones
// are marked: that is the editor's own, QuizBlockCanvas in BlockView.)
//
//   renderQuiz(root, props, ctx) draws into `root` (an empty element that has the block's size) and returns { update(props), destroy() }.
//
//   props   what the block says, in the language that is shown: { id, question, options: [{ id, html }], correctOptionIds, open, explanation, marked } -
//           the question and the answers as HTML, which answers are the right ones (a test: the quiz is right when exactly those are ticked), whether it
//           is an open question (nothing is right or wrong: it is thanked), what is told after the submit (plain text, its lines kept), and - for a
//           picture - the answers that stand ticked in it (the thumbnails show the right ones, a PDF none: it does not give the answers away).
//   ctx     what the place it is drawn in provides:
//     mode        "play" (the learner uses it) | "edit" | "thumbnail" | "print" - outside "play" it is only a picture, nothing in it can be used.
//     text(key)   the player's own words in the language that is shown ("submit", "correct", "incorrect", "thanks").
//     icons       { submit, correct, incorrect, unchecked, checked }: the SVG of the button's tick, of the feedback and of the boxes.
//     applyVariables(node)   puts the values of variables in for the placeholders (only the player has them: absent in the editor).
//     fill()      the first answer was ticked.
//     submit({ ticked, correct })   it was submitted: the ids of the ticked answers, and whether that was right - what follows from it (the changes to
//                 variables, the score, the required task, the events of the page's graph) is the place's to do.
//     announce(text)   say the feedback to those who cannot see it.
//
// The markup and the class names are those of the card of a quiz's answer (core/runtime/quizCard.css).

export function renderQuiz(root, props, ctx) {
  var live = ctx.mode === "play";
  var data = props;

  var form = document.createElement("form");
  form.className = "weft-quiz";

  var question = document.createElement("div");
  question.className = "weft-quiz-question";
  question.id = "weft-question-" + data.id;
  form.appendChild(question);

  var optionsWrap = document.createElement("div");
  optionsWrap.className = "weft-quiz-options";
  optionsWrap.setAttribute("role", "group");
  optionsWrap.setAttribute("aria-labelledby", "weft-question-" + data.id);
  var optionTexts = []; // { element, id }
  var inputs = [];
  data.options.forEach(function (opt) {
    // The whole card is the <label> (not just a small checkbox) so clicking anywhere on an option selects it, and .weft-quiz-option:has(input:checked)
    // in the stylesheet picks up both the card highlight and which of the two icons below shows - no separate "selected" class to keep in sync. The
    // checkbox itself stays a real, focusable/keyboard-operable <input> - it is just visually hidden (opacity:0, sized/positioned exactly over the icon
    // pair) rather than removed, so clicking or tabbing to it still works exactly like a native checkbox, it just never shows the OS's own chrome.
    var optionLabel = document.createElement("label");
    optionLabel.className = "weft-quiz-option";
    var checkboxWrap = document.createElement("span");
    checkboxWrap.className = "weft-quiz-option-checkbox";
    var input = document.createElement("input");
    input.setAttribute("type", "checkbox");
    input.setAttribute("name", "opt-" + data.id);
    input.setAttribute("value", opt.id);
    input.className = "weft-quiz-option-input";
    var uncheckedIcon = document.createElement("span");
    uncheckedIcon.className = "weft-quiz-option-checkbox-icon weft-quiz-option-checkbox-icon-unchecked";
    uncheckedIcon.setAttribute("aria-hidden", "true");
    uncheckedIcon.innerHTML = ctx.icons.unchecked;
    var checkedIcon = document.createElement("span");
    checkedIcon.className = "weft-quiz-option-checkbox-icon weft-quiz-option-checkbox-icon-checked";
    checkedIcon.setAttribute("aria-hidden", "true");
    checkedIcon.innerHTML = ctx.icons.checked;
    checkboxWrap.appendChild(input);
    checkboxWrap.appendChild(uncheckedIcon);
    checkboxWrap.appendChild(checkedIcon);
    var text = document.createElement("span");
    text.className = "weft-quiz-option-text";
    optionLabel.appendChild(checkboxWrap);
    optionLabel.appendChild(text);
    optionsWrap.appendChild(optionLabel);
    optionTexts.push({ element: text, id: opt.id });
    inputs.push(input);
    if (!live) {
      // A picture: nothing can be ticked; the answers that stand ticked in it are the ones it was told.
      input.tabIndex = -1;
      if ((data.marked || []).indexOf(opt.id) !== -1) input.setAttribute("checked", "");
    }
  });
  form.appendChild(optionsWrap);

  var optionHtml = function (id) {
    for (var i = 0; i < data.options.length; i++) if (data.options[i].id === id) return data.options[i].html;
    return "";
  };
  var fillTexts = function () {
    question.innerHTML = data.question;
    if (ctx.applyVariables) ctx.applyVariables(question);
    optionTexts.forEach(function (entry) {
      entry.element.innerHTML = optionHtml(entry.id);
      if (ctx.applyVariables) ctx.applyVariables(entry.element);
    });
  };
  fillTexts();

  // A plain button, not a form's submit: a module may run in an iframe without allow-forms (the editor's preview, a player file), where a form never
  // fires "submit".
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
  form.appendChild(submit);

  // answered: null until the quiz was submitted, then whether it was right - so the feedback text follows a language change made afterwards, too.
  var answered = null;
  var showFeedbackTitle = function () {
    feedbackTitle.textContent = ctx.text(data.open ? "thanks" : answered ? "correct" : "incorrect");
  };

  // Hidden until submitted, and takes the submit button's place rather than sitting next to it (see the submit handler) - there is nothing left to
  // submit once it is showing.
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
  form.appendChild(feedback);
  // What is told about the answer, under the feedback (the text is there from the start, shown with the feedback).
  var explanation = document.createElement("div");
  explanation.className = "weft-quiz-explanation";
  explanation.setAttribute("hidden", "");
  explanation.textContent = data.explanation || "";
  form.appendChild(explanation);

  form.addEventListener("submit", function (event) {
    event.preventDefault();
  });

  if (!live) submit.tabIndex = -1;
  else {
    // Fires once, the moment the learner picks a first answer - matches "Ausfüllen" in the editor's own graph exactly (see quizFillNodeId in
    // pageTimeline.ts), which is likewise about the first pick, not every subsequent one.
    var hasFiredFill = false;
    optionsWrap.addEventListener("change", function () {
      if (hasFiredFill) return;
      hasFiredFill = true;
      ctx.fill();
    });

    submit.addEventListener("click", function () {
      var ticked = inputs
        .filter(function (input) {
          return input.checked;
        })
        .map(function (input) {
          return input.value;
        });
      var correctIds = data.correctOptionIds || [];
      var correct =
        data.open === true ||
        (ticked.length === correctIds.length &&
          ticked.every(function (id) {
            return correctIds.indexOf(id) !== -1;
          }));
      ctx.submit({ ticked: ticked, correct: correct });

      // Replaces the submit button rather than joining it (see the feedback element above), and locks the options in place - both so a learner can't
      // submit twice, and so the answer shown as "correct"/"incorrect" can't silently change after the fact by re-checking boxes.
      submit.hidden = true;
      inputs.forEach(function (input) {
        input.disabled = true;
      });
      feedbackIcon.innerHTML = correct ? ctx.icons.correct : ctx.icons.incorrect;
      answered = correct;
      showFeedbackTitle();
      feedback.className = "weft-quiz-feedback " + (data.open === true ? "is-thanks" : correct ? "is-correct" : "is-incorrect");
      feedback.hidden = false;
      explanation.hidden = !explanation.textContent;
      ctx.announce(feedbackTitle.textContent);
    });
  }

  root.appendChild(form);

  return {
    // The language (or the words) changed: the texts are drawn again, what was ticked and submitted stays.
    update: function (next) {
      data = next;
      fillTexts();
      submitLabel.nodeValue = ctx.text("submit");
      explanation.textContent = data.explanation || "";
      if (answered !== null) {
        showFeedbackTitle();
        explanation.hidden = !explanation.textContent;
      }
    },
    destroy: function () {
      if (form.parentNode) form.parentNode.removeChild(form);
    },
  };
}
