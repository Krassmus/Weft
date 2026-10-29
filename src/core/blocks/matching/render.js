// How a matching (MatchingBlock) is drawn and used - for the player, the editor's thumbnails and the PDF alike: one function, told where it draws. Plain
// JavaScript without imports: this file is inlined verbatim (its "export" taken away) into the exported page ahead of the player
// (core/runtime/buildRuntimeHtml.ts) and imported as a module by the editor (render.d.ts). (On the editor's canvas the cards are moved, their words
// written in place and their pictures changed: that is the editor's own, MatchingCanvas, drawn by MatchingView.)
//
//   renderMatching(root, props, ctx) draws into `root` (an empty element that has the block's size) and returns { update(props), destroy() }.
//
//   props   what the block says, in the language that is shown: { id, sources, targets, pairs, sourceSize, targetSize, shuffle } -
//           sources, targets   the cards of both lists: { id, kind: "text" | "image", text, src, x, y } - a text card's words (a picture's description),
//                              the address of a picture ("": none yet), and where the card's top left corner stands on the area, in percent of the area
//           pairs              the right assignment: source id -> target id; a source without one is a decoy
//           sourceSize, targetSize   the size of every card of a list, in percent of the area
//           shuffle            in play the cards of each list take each other's places at random
//   ctx     what the place it is drawn in provides:
//     mode        "play" (the learner uses it) | "edit" | "thumbnail" | "print" - outside "play" it is only a picture of the cards where they stand and
//                 the button, nothing in it can be used.
//     text(key)   the player's own words in the language that is shown ("submit", "correct", "incorrect", "matchingPicked", "matchingAssigned").
//     icons       { submit, correct, incorrect }: the SVG of the button's tick, of the feedback and of the marks on the cards.
//     applyVariables(node)   puts the values of variables in for the placeholders in a text card (only the player has them: absent in the editor).
//     fill()      the first card was put on a target.
//     submit({ results: [{ id, status, rightId }], allRight })   the answer was submitted and judged: for every source its status - "correct" (on its
//                 target), "wrong" (on another, or a decoy put anywhere), "missed" (not put anywhere, but it belongs somewhere), "ok" (a decoy left
//                 alone) - and the target it belongs to; what follows from it (the changes to variables, the score, the required task, the events of
//                 the page's graph) is the place's to do.
//     announce(text)   say what happens to those who cannot see it.
//     enlarge(src, alt)   show a picture large (a click on a picture card).
//
// The learner picks up a card with a click (or Enter) and puts it on a target with another, or drags it; a card that was put on a target stands in its
// dock and leaves a dashed place where it stood; Delete takes it out again, Escape puts a picked card down, and z (or +) enlarges a picture. The look is
// in blocks/matching/render.css.

export function renderMatching(root, props, ctx) {
  var live = ctx.mode === "play";
  var data = props;

  function element(tag, className, attrs) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (attrs) {
      Object.keys(attrs).forEach(function (name) {
        if (attrs[name] === undefined || attrs[name] === null) return;
        node.setAttribute(name, attrs[name]);
      });
    }
    return node;
  }

  var box = element("div", "weft-matching");
  var area = element("div", "weft-matching-area");
  var bar = element("div", "weft-matching-bar");
  box.appendChild(area);
  box.appendChild(bar);

  var assigned = {}; // source id -> target id
  var cards = {}; // item id -> its button
  var homes = {}; // source id -> its dashed place (shown while it stands in a target)
  var docks = {}; // target id -> where its sources stand
  var picked = null; // the source that was picked by a click or Enter
  var locked = false;
  var hasFiredFill = false;
  var fills = []; // what draws the content of every card again
  var itemById = {};
  var remember = function () {
    itemById = {};
    data.sources.concat(data.targets).forEach(function (item) {
      itemById[item.id] = item;
    });
  };
  remember();
  // (The words and the picture of a card as they are now - in the language that is shown.)
  var current = function (item) {
    return itemById[item.id] || item;
  };

  // Which of the places of a list's cards each card takes: the cards of the list swap places at random (Fisher-Yates), if the block says so - and only
  // where it is played.
  function placesOf(items) {
    var places = items.map(function (item) {
      return { x: item.x, y: item.y };
    });
    if (live && data.shuffle) {
      for (var i = places.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var swap = places[i];
        places[i] = places[j];
        places[j] = swap;
      }
    }
    return places;
  }

  function place(node, size, spot, minimum) {
    node.style.left = spot.x + "%";
    node.style.top = spot.y + "%";
    node.style.width = size.width + "%";
    node.style[minimum ? "minHeight" : "height"] = size.height + "%";
  }

  // The shape of a picture (width / height), once it has loaded: the frame - and the place it leaves - take exactly that shape.
  var ratios = {}; // item id -> ratio
  var frames = {}; // item id -> the frames drawn for it (the card's, the place's)
  function setRatio(id, ratio) {
    ratios[id] = ratio;
    (frames[id] || []).forEach(function (frame) {
      frame.style.setProperty("--ratio", String(ratio));
    });
  }
  function pictureFrame(item) {
    var frame = element("span", "weft-matching-frame");
    (frames[item.id] = frames[item.id] || []).push(frame);
    if (ratios[item.id]) frame.style.setProperty("--ratio", String(ratios[item.id]));
    var pic = element("span", "weft-matching-pic");
    pic.appendChild(frame);
    return { pic: pic, frame: frame };
  }

  // The content of a card: its words, or its picture (with the way to enlarge it).
  function fillCard(card, item) {
    card.innerHTML = "";
    var now = current(item);
    var label = now.text || "";
    if (item.kind === "image") {
      var image = element("img", "weft-matching-image", { src: now.src || "", alt: label, draggable: "false" });
      var made = pictureFrame(item);
      made.frame.appendChild(image);
      var measured = function () {
        if (image.naturalWidth && image.naturalHeight) setRatio(item.id, image.naturalWidth / image.naturalHeight);
      };
      if (image.complete) measured();
      else image.addEventListener("load", measured);
      card.appendChild(made.pic);
      card.setAttribute("aria-label", label);
    } else {
      var text = element("span", "weft-matching-text");
      text.textContent = label;
      if (ctx.applyVariables) ctx.applyVariables(text);
      card.appendChild(text);
    }
  }

  function enlarge(item) {
    var now = current(item);
    if (item.kind !== "image" || !now.src) return;
    ctx.enlarge(now.src, now.text || "");
  }

  var cardTag = live ? "button" : "div";
  function cardOf(side, item) {
    var card = element(cardTag, "weft-matching-card weft-matching-" + side + (item.kind === "image" ? " is-image" : ""), { "data-weft-target": side === "target" ? item.id : null, "data-weft-source": side === "source" ? item.id : null });
    if (live) card.setAttribute("type", "button");
    return card;
  }

  // ---- the cards ----
  var targetPlaces = placesOf(data.targets);
  data.targets.forEach(function (item, index) {
    var card = cardOf("target", item);
    // (A target grows with the cards put on it - except a picture, which is shown as large as the card allows: the cards then stand below it.)
    place(card, data.targetSize, targetPlaces[index], item.kind !== "image");
    var body = element("span", "weft-matching-body");
    var dock = element("span", "weft-matching-dock");
    card.appendChild(body);
    card.appendChild(dock);
    docks[item.id] = dock;
    var fill = function () {
      fillCard(body, item);
      // (the body is a span in a button: its own aria-label is the card's)
      if (item.kind === "image") card.setAttribute("aria-label", current(item).text || "");
    };
    fill();
    fills.push(fill);
    if (live) {
      card.addEventListener("click", function (event) {
        if (!locked && picked) {
          assign(picked, item.id);
          return;
        }
        // A click of the mouse on a picture enlarges it - also after submitting (a key does not: Enter drops what was picked).
        if (event.detail > 0) enlarge(item);
      });
      card.addEventListener("keydown", function (event) {
        if ((event.key === "z" || event.key === "+") && item.kind === "image") {
          event.preventDefault();
          enlarge(item);
        }
      });
    }
    cards[item.id] = card;
    area.appendChild(card);
  });

  var sourcePlaces = placesOf(data.sources);
  data.sources.forEach(function (item, index) {
    var card = cardOf("source", item);
    place(card, data.sourceSize, sourcePlaces[index], false);
    var fill = function () {
      fillCard(card, item);
    };
    fill();
    fills.push(fill);
    // Its dashed place, where it stood, for as long as it stands in a target.
    var home = element("span", "weft-matching-slot" + (item.kind === "image" ? " is-image" : ""), { hidden: "" });
    // (A picture leaves the silhouette of its frame: the same shape, dashed and empty.)
    if (item.kind === "image") home.appendChild(pictureFrame(item).pic);
    place(home, data.sourceSize, sourcePlaces[index], false);
    homes[item.id] = home;
    area.appendChild(home);
    if (live) {
      card.addEventListener("pointerdown", function (event) {
        startDrag(event, item.id);
      });
      card.addEventListener("click", function (event) {
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        // The mouse on a picture enlarges it (also after submitting); a key (or the click on a text) picks the card up, and picks it down again.
        if (item.kind === "image" && event.detail > 0 && (!picked || locked)) {
          enlarge(item);
          return;
        }
        if (locked) return;
        pick(picked === item.id ? null : item.id);
      });
      card.addEventListener("keydown", function (event) {
        if ((event.key === "z" || event.key === "+") && item.kind === "image") {
          event.preventDefault();
          enlarge(item);
        } else if ((event.key === "Delete" || event.key === "Backspace") && assigned[item.id] && !locked) {
          event.preventDefault();
          unassign(item.id);
        } else if (event.key === "Escape" && picked) {
          event.preventDefault();
          event.stopPropagation();
          pick(null);
        }
      });
    }
    cards[item.id] = card;
    area.appendChild(card);
  });

  function pick(sourceId) {
    if (picked && cards[picked]) cards[picked].classList.remove("is-picked");
    picked = sourceId;
    area.classList.toggle("has-picked", !!sourceId);
    if (sourceId) {
      cards[sourceId].classList.add("is-picked");
      ctx.announce(ctx.text("matchingPicked"));
    }
  }

  function assign(sourceId, targetId) {
    pick(null);
    assigned[sourceId] = targetId;
    var card = cards[sourceId];
    card.classList.add("is-docked");
    card.style.left = card.style.top = card.style.width = card.style.height = "";
    docks[targetId].appendChild(card);
    homes[sourceId].hidden = false;
    ctx.announce(ctx.text("matchingAssigned"));
    if (!hasFiredFill) {
      hasFiredFill = true;
      ctx.fill();
    }
  }

  function unassign(sourceId) {
    delete assigned[sourceId];
    var card = cards[sourceId];
    var index = -1;
    data.sources.forEach(function (item, i) {
      if (item.id === sourceId) index = i;
    });
    card.classList.remove("is-docked");
    place(card, data.sourceSize, sourcePlaces[index], false);
    homes[sourceId].hidden = true;
    area.appendChild(card);
  }

  // ---- dragging: a picture of the card follows the pointer; where it is let go, it is put - on a target, or (a card that stood in one) back ----
  var suppressClick = false;
  function startDrag(event, sourceId) {
    if (locked || event.button !== 0) return;
    var card = cards[sourceId];
    var startX = event.clientX;
    var startY = event.clientY;
    var started = false;
    var ghost = null;
    var grab = { x: 0, y: 0 };
    var areaRect = null;
    var lastTarget = null;
    function targetAt(x, y) {
      var found = document.elementFromPoint(x, y);
      var target = found && found.closest ? found.closest(".weft-matching-target") : null;
      return target && area.contains(target) ? target : null;
    }
    function move(e) {
      if (!started) {
        if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) < 6) return;
        started = true;
        areaRect = area.getBoundingClientRect();
        var rect = card.getBoundingClientRect();
        grab = { x: startX - rect.left, y: startY - rect.top };
        ghost = card.cloneNode(true);
        ghost.classList.add("is-ghost");
        ghost.classList.remove("is-docked", "is-picked");
        ghost.style.width = rect.width + "px";
        ghost.style.height = rect.height + "px";
        area.appendChild(ghost);
        card.classList.add("is-dragging");
      }
      ghost.style.left = e.clientX - areaRect.left - grab.x + "px";
      ghost.style.top = e.clientY - areaRect.top - grab.y + "px";
      var over = targetAt(e.clientX, e.clientY);
      if (over !== lastTarget) {
        if (lastTarget) lastTarget.classList.remove("is-over");
        if (over) over.classList.add("is-over");
        lastTarget = over;
      }
    }
    function end(e) {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (!started) return;
      // A click follows the let-go pointer on a card; this was a drag.
      suppressClick = true;
      setTimeout(function () {
        suppressClick = false;
      }, 0);
      if (lastTarget) lastTarget.classList.remove("is-over");
      var target = e.type === "pointercancel" ? null : targetAt(e.clientX, e.clientY);
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      card.classList.remove("is-dragging");
      if (target) assign(sourceId, target.getAttribute("data-weft-target"));
      else if (assigned[sourceId]) unassign(sourceId);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  // ---- submitting ----
  var submit = element("button", "weft-quiz-submit", { type: "button" });
  var submitIcon = element("span", "weft-quiz-submit-icon", { "aria-hidden": "true" });
  submitIcon.innerHTML = ctx.icons.submit;
  submit.appendChild(submitIcon);
  var submitLabel = document.createTextNode(ctx.text("submit"));
  submit.appendChild(submitLabel);
  bar.appendChild(submit);
  var answered = null; // null until submitted, then whether everything was right
  var feedback = element("div", "weft-quiz-feedback", { hidden: "" });
  var feedbackIcon = element("span", "weft-quiz-feedback-icon", { "aria-hidden": "true" });
  var feedbackTitle = element("strong", "weft-quiz-feedback-title");
  feedback.appendChild(feedbackIcon);
  feedback.appendChild(feedbackTitle);
  bar.appendChild(feedback);
  var showFeedbackTitle = function () {
    feedbackTitle.textContent = ctx.text(answered ? "correct" : "incorrect");
  };

  if (!live) submit.tabIndex = -1;
  else {
    submit.addEventListener("click", function () {
      if (locked) return;
      locked = true;
      pick(null);
      var allRight = true;
      var results = [];
      data.sources.forEach(function (source) {
        var target = assigned[source.id];
        var right = data.pairs ? data.pairs[source.id] : undefined;
        var status;
        if (right) {
          if (target === right) status = "correct";
          else if (target) {
            status = "wrong";
            allRight = false;
          } else {
            status = "missed";
            allRight = false;
          }
        } else if (target) {
          // A decoy put somewhere: wrong.
          status = "wrong";
          allRight = false;
        } else {
          status = "ok";
        }
        results.push({ id: source.id, status: status, rightId: right });
        var card = cards[source.id];
        card.classList.add("is-" + status);
        if (status === "correct" || status === "wrong") {
          var markIcon = element("span", "weft-matching-mark", { "aria-hidden": "true" });
          markIcon.innerHTML = status === "correct" ? ctx.icons.correct : ctx.icons.incorrect;
          // On a picture the mark sits on the picture's corner (its frame), not the card's.
          (card.querySelector(".weft-matching-frame") || card).appendChild(markIcon);
        }
        // Where it belonged, for whoever could not see the colours.
        if (right && status !== "correct") card.setAttribute("title", (itemById[right] || {}).text || "");
      });
      ctx.submit({ results: results, allRight: allRight });
      box.classList.add("is-locked");
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
    // The language (or the words) changed: the cards are drawn again, where they stand and what was assigned stays; the marks of a submitted answer
    // go with the cards' content, as they did.
    update: function (next) {
      data = next;
      remember();
      submitLabel.nodeValue = ctx.text("submit");
      if (answered !== null) showFeedbackTitle();
      fills.forEach(function (fill) {
        fill();
      });
    },
    destroy: function () {
      if (box.parentNode) box.parentNode.removeChild(box);
    },
  };
}
