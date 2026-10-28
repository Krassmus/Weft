// How a checker (CheckerBlock) is drawn - for the player, the thumbnails, the PDF and the editor's canvas alike: one function, told where it draws.
// Plain JavaScript without imports: this file is inlined verbatim (its "export" taken away) into the exported page ahead of the player
// (core/runtime/buildRuntimeHtml.ts) and imported as a module by the editor (render.d.ts).
//
//   renderChecker(root, props, ctx) draws into `root` (an empty element that has the block's size) and returns { update(props), destroy() }.
//
//   mode "play"   the box can be ticked and "Abschicken" pressed; once it was, the box is locked and a word of thanks stands in its place.
//        "edit", "thumbnail", "print"   a picture of the unticked box and the button: nothing in it can be used. (On the canvas of a selected block the
//                 words are written in place - that is the editor's own: blocks/CheckerCanvas.tsx.)
//
//   props   { id, text }: the words beside the box, in the language that is shown (plain text, its line breaks are kept).
//   ctx     { mode, text(key), icons, applyVariables(node), fill(), submit({ ticked }), announce(text) }:
//     text(key)    the player's own words ("submit", "thanks" - see playerStrings.ts);
//     icons        { submit, thanks, unchecked, checked }: the SVG of the button's tick, of the thanks and of the box;
//     applyVariables(node)   puts the values of variables in for the placeholders in `node` (only the player has them: absent in the editor);
//     fill()       the box was clicked for the first time;
//     submit({ ticked })   it was submitted, ticked or not - what follows from it (the effects, the events of the page's graph, the score, the
//                  required task) is the place's to do;
//     announce(text)   say the thanks to those who cannot see it.
//
// The markup and the class names are those of the card of a quiz's answer (core/runtime/quizCard.css); blocks/checker/render.css adds the words.

export function renderChecker(root, props, ctx) {
  var live = ctx.mode === "play";
  var data = props;

  var form = document.createElement("form");
  form.className = "weft-quiz weft-checker";
  form.addEventListener("submit", function (event) {
    event.preventDefault();
  });

  var optionsWrap = document.createElement("div");
  optionsWrap.className = "weft-quiz-options";
  optionsWrap.setAttribute("role", "group");
  var optionLabel = document.createElement("label");
  optionLabel.className = "weft-quiz-option";
  var checkboxWrap = document.createElement("span");
  checkboxWrap.className = "weft-quiz-option-checkbox";
  var input = document.createElement("input");
  input.type = "checkbox";
  input.name = "check-" + data.id;
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
  text.className = "weft-quiz-option-text weft-checker-text";
  var fillText = function () {
    text.textContent = data.text || "";
    if (ctx.applyVariables) ctx.applyVariables(text);
  };
  fillText();
  optionLabel.appendChild(checkboxWrap);
  optionLabel.appendChild(text);
  optionsWrap.appendChild(optionLabel);
  form.appendChild(optionsWrap);

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

  var submitted = false;
  var feedback = document.createElement("div");
  feedback.className = "weft-quiz-feedback is-thanks";
  feedback.hidden = true;
  var feedbackIcon = document.createElement("span");
  feedbackIcon.className = "weft-quiz-feedback-icon";
  feedbackIcon.setAttribute("aria-hidden", "true");
  feedbackIcon.innerHTML = ctx.icons.thanks;
  var feedbackTitle = document.createElement("strong");
  feedbackTitle.className = "weft-quiz-feedback-title";
  feedback.appendChild(feedbackIcon);
  feedback.appendChild(feedbackTitle);
  form.appendChild(feedback);
  var showFeedbackTitle = function () {
    feedbackTitle.textContent = ctx.text("thanks");
  };

  if (!live) {
    // A picture of the unticked box: nothing can be ticked or pressed.
    input.tabIndex = -1;
    submit.tabIndex = -1;
  } else {
    // The first click on the box is the quiz's "first answer".
    var hasFiredFill = false;
    input.addEventListener("change", function () {
      if (hasFiredFill) return;
      hasFiredFill = true;
      ctx.fill();
    });

    submit.addEventListener("click", function () {
      if (submitted) return;
      submitted = true;
      ctx.submit({ ticked: !!input.checked });
      // Replaces the button, and locks the box: what was submitted cannot be changed by ticking it again.
      submit.hidden = true;
      input.disabled = true;
      showFeedbackTitle();
      feedback.hidden = false;
      ctx.announce(feedbackTitle.textContent);
    });
  }

  root.appendChild(form);

  return {
    // The language changed: the words are drawn again (with the values of the variables), the button and the thanks are named in it.
    update: function (next) {
      data = next;
      fillText();
      submitLabel.nodeValue = ctx.text("submit");
      if (submitted) showFeedbackTitle();
    },
    destroy: function () {
      if (form.parentNode) form.parentNode.removeChild(form);
    },
  };
}
