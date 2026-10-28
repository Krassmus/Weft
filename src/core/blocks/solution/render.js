// How a solution word (SolutionBlock) is drawn - for the player, the editor's canvas, the thumbnails and the PDF alike: one function, so that all of
// them show the same thing. Plain JavaScript without imports: this file is inlined verbatim (its "export" taken away) into the exported page ahead of
// the player (core/runtime/buildRuntimeHtml.ts) and imported as a module by the editor (blocks/solution/render.d.ts says what it is).
//
//   renderSolution(root, props, ctx) draws into `root` (an empty element that has the block's size) and returns { update(props), destroy() }.
//
//   props   what the block says, in the language that is shown: { id, solution, placeholder, caseSensitive, attempts }.
//   ctx     what the place it is drawn in provides:
//     mode        "play" (the learner uses it) | "edit" (the editor's canvas) | "thumbnail" | "print" - outside "play" it is only a picture of the
//                 empty field, nothing in it can be used.
//     text(key), textWith(key, values)   the player's own words in the language that is shown ("submit", "correct", "incorrect", "solutionWord",
//                 "solutionAttemptsLeft" - see playerStrings.ts).
//     icons       { submit, correct, incorrect }: the SVG of the button's tick and of the feedback.
//     fill()      the first letter was typed.
//     attempt({ right, finished })   a try was made (finished: the word was right, or it was the last try) - what follows from it (the effects, the
//                 events of the page's graph, the score, the required task) is the place's to do.
//     announce(text)   say the feedback to those who cannot see it.
//
// The markup and the class names are those of the card of a quiz's answer (core/runtime/quizCard.css).

// The words are the same when only spaces around them or between their words differ - and capital letters, unless they count (and the same
// letters written composed or taken apart, as a Mac does).
export function solutionNormal(text, caseSensitive) {
  var t = String(text).replace(/\s+/g, " ").trim();
  if (t.normalize) t = t.normalize("NFC");
  return caseSensitive ? t : t.toLowerCase();
}

export function solutionIsRight(solution, typed, caseSensitive) {
  var right = solutionNormal(solution, caseSensitive === true);
  return right !== "" && solutionNormal(typed, caseSensitive === true) === right;
}

export function renderSolution(root, props, ctx) {
  var live = ctx.mode === "play";
  var data = props;

  var form = document.createElement("form");
  form.className = "weft-quiz weft-solution";
  form.addEventListener("submit", function (event) {
    event.preventDefault();
  });

  var field = document.createElement("label");
  field.className = "weft-quiz-option weft-solution-field";
  var input = document.createElement("input");
  input.type = "text";
  input.className = "weft-solution-input";
  input.name = "solution-" + data.id;
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("spellcheck", "false");
  field.appendChild(input);
  form.appendChild(field);

  var submit = document.createElement("button");
  submit.type = "button";
  submit.className = "weft-quiz-submit";
  var submitIcon = document.createElement("span");
  submitIcon.className = "weft-quiz-submit-icon";
  submitIcon.setAttribute("aria-hidden", "true");
  submitIcon.innerHTML = ctx.icons.submit;
  submit.appendChild(submitIcon);
  var submitLabel = document.createTextNode(ctx.text("submit"));
  submit.appendChild(submitLabel);
  form.appendChild(submit);

  var feedback = document.createElement("div");
  feedback.className = "weft-quiz-feedback";
  feedback.hidden = true;
  var feedbackIcon = document.createElement("span");
  feedbackIcon.className = "weft-quiz-feedback-icon";
  feedbackIcon.setAttribute("aria-hidden", "true");
  var feedbackTitle = document.createElement("strong");
  feedbackTitle.className = "weft-quiz-feedback-title";
  feedback.appendChild(feedbackIcon);
  feedback.appendChild(feedbackTitle);
  form.appendChild(feedback);

  var tries = 0;
  var finished = false; // the word was right, or the last try was used
  var lastRight = null; // how the last try went (null: no try yet)
  var hasFiredFill = false;

  var maxTries = function () {
    return data.attempts > 0 ? Math.floor(data.attempts) : Infinity;
  };
  var triesLeft = function () {
    return maxTries() === Infinity ? null : maxTries() - tries;
  };
  // The words of the feedback: right / wrong, and for a wrong word with tries left how many there are.
  var showFeedbackTitle = function () {
    if (lastRight === null) return;
    var left = triesLeft();
    feedbackTitle.textContent = ctx.text(lastRight ? "correct" : "incorrect");
    if (!lastRight && !finished && left !== null) {
      feedbackTitle.appendChild(document.createTextNode(" "));
      var more = document.createElement("span");
      more.className = "weft-solution-tries";
      more.textContent = ctx.textWith("solutionAttemptsLeft", { n: left });
      feedbackTitle.appendChild(more);
    }
  };
  var fillTexts = function () {
    var placeholder = (data.placeholder || "").trim() || ctx.text("solutionWord");
    input.setAttribute("placeholder", placeholder);
    input.setAttribute("aria-label", placeholder);
  };
  fillTexts();

  if (!live) {
    // A picture of the empty field: nothing can be written or pressed.
    input.readOnly = true;
    input.tabIndex = -1;
    submit.tabIndex = -1;
  } else {
    // The first letter typed is the quiz's "first answer".
    input.addEventListener("input", function () {
      // (A word that was wrong is not marked as wrong any more once it is being changed.)
      field.classList.remove("is-incorrect");
      input.removeAttribute("aria-invalid");
      if (hasFiredFill) return;
      hasFiredFill = true;
      ctx.fill();
    });

    var attempt = function () {
      if (finished) return;
      var typed = input.value;
      // (Nothing written is not a try.)
      if (typed.trim() === "") {
        input.focus();
        return;
      }
      var right = solutionIsRight(data.solution, typed, data.caseSensitive);
      tries++;
      lastRight = right;
      finished = right || tries >= maxTries();
      ctx.attempt({ right: right, finished: finished });
      field.classList.toggle("is-correct", right);
      field.classList.toggle("is-incorrect", !right);
      if (!right) input.setAttribute("aria-invalid", "true");
      feedbackIcon.innerHTML = right ? ctx.icons.correct : ctx.icons.incorrect;
      feedback.className = "weft-quiz-feedback " + (right ? "is-correct" : "is-incorrect");
      feedback.hidden = false;
      if (finished) {
        input.disabled = true;
        submit.hidden = true;
      } else {
        // (Another try: the word is selected, to be written over.)
        input.focus();
        input.select();
      }
      showFeedbackTitle();
      ctx.announce(feedbackTitle.textContent);
    };
    submit.addEventListener("click", attempt);
    // Enter in the field is "Abschicken".
    input.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      attempt();
    });
  }

  root.appendChild(form);

  return {
    // The language (or the words) changed: the texts are drawn again, what has been typed and tried stays.
    update: function (next) {
      data = next;
      fillTexts();
      submitLabel.nodeValue = ctx.text("submit");
      showFeedbackTitle();
    },
    destroy: function () {
      if (form.parentNode) form.parentNode.removeChild(form);
    },
  };
}
