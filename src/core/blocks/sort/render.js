// How a sorting puzzle (SortBlock) is drawn and used - for the player, the editor's thumbnails and the PDF alike: one function, told where it draws. Plain
// JavaScript without imports: this file is inlined verbatim (its "export" taken away) into the exported page ahead of the player
// (core/runtime/buildRuntimeHtml.ts) and imported as a module by the editor (render.d.ts). (On the editor's canvas the objects are put in order by
// dragging, their words written in place and their pictures changed: that is the editor's own, SortCanvas, drawn by SortView.)
//
//   renderSort(root, props, ctx) draws into `root` (an empty element that has the block's size) and returns { update(props), destroy() }.
//
//   props   what the block says, in the language that is shown: { id, items, orientation, itemSize, startLabel, endLabel } -
//           items         the objects in their RIGHT order: { id, kind: "text" | "image", text, src } - a text's words (a picture's description) and the
//                         address of a picture ("": none yet)
//           orientation   "vertical" (the default) | "horizontal": which way the line runs
//           itemSize      the size of an object in percent of the block's area (along the line the share of it an object takes)
//           startLabel, endLabel   the words at the two ends of the line ("" for none)
//   ctx     what the place it is drawn in provides:
//     mode        "play" (the learner uses it) | "edit" | "thumbnail" | "print" - outside "play" it is only a picture: the objects stand in their right
//                 order and nothing in it can be used.
//     text(key), textWith(key, values)   the player's own words in the language that is shown ("submit", "correct", "incorrect", "sortPicked",
//                 "sortMoved" with {n} and {total}).
//     icons       { submit, correct, incorrect }: the SVG of the button's tick, of the feedback and of the marks on the objects.
//     applyVariables(node)   puts the values of variables in for the placeholders in a text (only the player has them: absent in the editor).
//     reducedMotion()   whether the objects may not glide to their new places (absent: they glide).
//     fill()      the order was changed for the first time.
//     submit({ moves, allRight })   the order was submitted and judged: `moves` is the fewest moves (take one object and put it somewhere else) that make
//                 it right - the mistakes - and `allRight` whether there were none; what follows from it (the changes to variables, the score, the
//                 required task, the events of the page's graph) is the place's to do.
//     announce(text)   say what happens to those who cannot see it.
//     enlarge(src, alt)   show a picture large (a click on a picture).
//
// The learner starts with the objects mixed up - never in the right order. A drag takes an object and the others make room where it would be put; a key
// (Enter, Space) picks it up, the arrow keys move it - along the line, or across the lines - and the key puts it down; Escape puts it back where it was.
// The look is in blocks/sort/render.css (the pictures' frames and the mark are those of the matching: blocks/matching/render.css).

// The objects in the order the learner starts with: shuffled (Fisher-Yates), and not the right one.
export function sortShuffled(ids) {
  var order = ids.slice();
  if (order.length < 2) return order;
  var same = function () {
    return order.every(function (id, i) {
      return id === ids[i];
    });
  };
  for (var tries = 0; tries < 20 && (tries === 0 || same()); tries++) {
    for (var i = order.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var swap = order[i];
      order[i] = order[j];
      order[j] = swap;
    }
  }
  if (same()) order.push(order.shift());
  return order;
}

// The fewest moves that make a row right, given the right place of each object in the order they stand in: all but the longest increasing run. Returns
// the number of moves and which objects stay (those of one longest run).
export function sortMistakes(places) {
  var n = places.length;
  var length = [];
  var previous = [];
  var best = -1;
  for (var i = 0; i < n; i++) {
    length[i] = 1;
    previous[i] = -1;
    for (var j = 0; j < i; j++) {
      if (places[j] < places[i] && length[j] + 1 > length[i]) {
        length[i] = length[j] + 1;
        previous[i] = j;
      }
    }
    if (best < 0 || length[i] > length[best]) best = i;
  }
  var stays = {};
  for (var k = best; k >= 0; k = previous[k]) stays[k] = true;
  return { moves: n - (best < 0 ? 0 : length[best]), stays: stays };
}

// How the objects share the room: on one line, or - when they do not fit on one at the size the author gave them - on several, each with a line of its own;
// the right order reads like text, a row (a column) after the other. The size along the line is the share of the whole line an object takes: as many of
// them as fit in 100 percent stand on a line; with more objects than that the lines are filled evenly (nine on two lines: five and four).
export function sortLayout(block) {
  var count = block.items.length;
  var along = block.orientation === "horizontal" ? block.itemSize.width : block.itemSize.height;
  var fit = Math.max(1, Math.floor(100 / Math.max(1, along) + 0.001));
  if (count <= fit) return { lines: 1, per: Math.max(1, count) };
  var per = Math.ceil(count / Math.ceil(count / fit));
  return { lines: Math.ceil(count / per), per: per };
}

// Where a dragged object goes: its place among the others (the number of the others it comes after). `boxes` are all the objects in their order on the
// lines - the dragged one too, which still holds its place - with the middle of each along its line and across it; the pointer is given the same way. It
// goes onto the line whose middle is nearest across, and there after every object whose middle the pointer has passed.
export function sortDropIndex(per, boxes, dragged, along, cross) {
  var lanes = Math.ceil(boxes.length / per);
  var lane = 0;
  var nearest = Infinity;
  for (var l = 0; l < lanes; l++) {
    var distance = Math.abs(boxes[l * per].cross - cross);
    if (distance < nearest) {
      nearest = distance;
      lane = l;
    }
  }
  var index = 0;
  var others = 0;
  boxes.forEach(function (box, i) {
    if (i === dragged) return;
    others++;
    var boxLane = Math.floor(i / per);
    if (boxLane < lane || (boxLane === lane && along > box.along)) index = others;
  });
  return index;
}

export function renderSort(root, props, ctx) {
  var live = ctx.mode === "play";
  var data = props;
  var vertical = data.orientation !== "horizontal";
  var layout = sortLayout(data);
  var multi = layout.lines > 1;

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

  var box = element("div", "weft-sort " + (vertical ? "is-vertical" : "is-horizontal") + (multi ? " is-multi" : ""));
  box.style.setProperty("--sort-item-h", String(data.itemSize.height));
  box.style.setProperty("--sort-lines", String(layout.lines));
  box.style.setProperty("--sort-per", String(layout.per));
  var body = element("div", "weft-sort-body");
  var list = element("div", "weft-sort-list");
  var bar = element("div", "weft-sort-bar");
  var startLabel = element("span", "weft-sort-end is-start");
  var endLabel = element("span", "weft-sort-end is-end");
  body.appendChild(startLabel);
  if (multi) {
    // The lines of the lanes (the list's own line is for a single one): one behind each row (column).
    var lanes = element("div", "weft-sort-lanes", { "aria-hidden": "true" });
    for (var lane = 0; lane < layout.lines; lane++) lanes.appendChild(element("span", "weft-sort-lane"));
    body.appendChild(lanes);
  }
  body.appendChild(list);
  body.appendChild(endLabel);
  box.appendChild(body);
  box.appendChild(bar);
  var showLabels = function () {
    startLabel.textContent = data.startLabel || "";
    endLabel.textContent = data.endLabel || "";
    startLabel.hidden = !startLabel.textContent;
    endLabel.hidden = !endLabel.textContent;
    box.classList.toggle("has-start", !!startLabel.textContent);
    box.classList.toggle("has-end", !!endLabel.textContent);
    if (ctx.applyVariables) {
      ctx.applyVariables(startLabel);
      ctx.applyVariables(endLabel);
    }
  };
  showLabels();

  // Under a horizontal line the words stand just under the lowest of the objects (a picture: of its frame, which can be smaller than the room the object
  // takes) - measured, since the room says nothing about it. Again whenever the line's size or a picture's shape changes.
  var placeLabelsLater = null;
  var gone = false;
  function placeLabels() {
    placeLabelsLater = null;
    if (vertical || gone) return;
    var top = body.getBoundingClientRect().top;
    var lowest = 0;
    var lowestFirst = 0; // (under several rows: the first row's words stand under the first row, the last row's under the last)
    [].forEach.call(list.children, function (card, i) {
      var shown = card.querySelector(".weft-matching-frame") || card;
      var rect = shown.getBoundingClientRect();
      if (rect.height <= 0) return;
      var bottom = rect.bottom - top;
      if (Math.floor(i / layout.per) === 0) lowestFirst = Math.max(lowestFirst, bottom);
      if (Math.floor(i / layout.per) === layout.lines - 1) lowest = Math.max(lowest, bottom);
    });
    if (lowest <= 0) return;
    body.style.setProperty("--sort-labels-top", Math.round(lowest) + "px");
    if (lowestFirst > 0) body.style.setProperty("--sort-start-top", Math.round(lowestFirst) + "px");
    // The button and the message under it move up under the objects and their words (a shift, not a change of the room: that would make the objects
    // larger again), so that they belong to the line; what is left free is left at the bottom of the block.
    var used = lowest;
    [startLabel, endLabel].forEach(function (label) {
      if (!label.hidden) used = Math.max(used, label.getBoundingClientRect().bottom - top);
    });
    var free = body.getBoundingClientRect().height - used;
    bar.style.transform = free > 0 ? "translateY(" + -Math.round(free) + "px)" : "";
  }
  function placeLabelsSoon() {
    if (vertical || placeLabelsLater !== null || gone) return;
    placeLabelsLater = window.requestAnimationFrame ? window.requestAnimationFrame(placeLabels) : setTimeout(placeLabels, 0);
  }
  var observer = null;
  if (!vertical && typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(placeLabelsSoon);
    observer.observe(list);
  }

  var cards = {}; // item id -> its button
  var rightPlace = {}; // item id -> its place in the right order
  var itemById = {};
  var remember = function () {
    itemById = {};
    data.items.forEach(function (item, index) {
      rightPlace[item.id] = index;
      itemById[item.id] = item;
    });
  };
  remember();
  var picked = null; // the object that was picked up by a key
  var pickedFrom = null; // the order it was picked up in (Escape puts it back)
  var locked = false;
  var hasFiredFill = false;
  var suppressClick = false;
  var ratios = {};
  var fills = []; // what draws the content of every object again

  // The shape of a picture, once it has loaded: its frame takes exactly that shape.
  function fillItem(card, item) {
    card.innerHTML = "";
    var now = itemById[item.id] || item;
    var label = now.text || "";
    if (item.kind === "image") {
      var image = element("img", "weft-matching-image", { src: now.src || "", alt: label, draggable: "false" });
      var frame = element("span", "weft-matching-frame");
      frame.appendChild(image);
      var measured = function () {
        if (image.naturalWidth && image.naturalHeight) {
          ratios[item.id] = image.naturalWidth / image.naturalHeight;
          frame.style.setProperty("--ratio", String(ratios[item.id]));
          placeLabelsSoon();
        }
      };
      if (ratios[item.id]) frame.style.setProperty("--ratio", String(ratios[item.id]));
      if (image.complete) measured();
      else image.addEventListener("load", measured);
      var pic = element("span", "weft-matching-pic");
      pic.appendChild(frame);
      card.appendChild(pic);
      card.setAttribute("aria-label", label);
    } else {
      var text = element("span", "weft-sort-text");
      text.textContent = label;
      if (ctx.applyVariables) ctx.applyVariables(text);
      card.appendChild(text);
    }
  }

  function enlarge(item) {
    var now = itemById[item.id] || item;
    if (item.kind !== "image" || !now.src) return;
    ctx.enlarge(now.src, now.text || "");
  }

  function currentOrder() {
    return [].slice.call(list.children).map(function (card) {
      return card.getAttribute("data-weft-item");
    });
  }

  // The cards that moved glide to their new places (the FLIP way: put them back where they were, then let go).
  function reorder(change) {
    var kids = [].slice.call(list.children);
    var before = kids.map(function (card) {
      return card.getBoundingClientRect();
    });
    change();
    if (ctx.reducedMotion && ctx.reducedMotion()) return;
    kids.forEach(function (card, i) {
      var after = card.getBoundingClientRect();
      var dx = before[i].left - after.left;
      var dy = before[i].top - after.top;
      if (!dx && !dy) return;
      card.style.transition = "none";
      card.style.transform = "translate(" + dx + "px," + dy + "px)";
      void card.offsetWidth;
      card.style.transition = "transform 0.18s ease";
      card.style.transform = "";
    });
  }

  var lastOrder = null;
  function moved() {
    var now = currentOrder().join(",");
    if (now === lastOrder) return;
    lastOrder = now;
    if (!hasFiredFill) {
      hasFiredFill = true;
      ctx.fill();
    }
  }

  function pick(id) {
    if (picked && cards[picked]) cards[picked].classList.remove("is-picked");
    picked = id;
    pickedFrom = id ? currentOrder() : null;
    if (id) {
      cards[id].classList.add("is-picked");
      ctx.announce(ctx.text("sortPicked"));
    }
  }

  function moveBy(id, step) {
    var order = currentOrder();
    var at = order.indexOf(id);
    var to = Math.max(0, Math.min(order.length - 1, at + step));
    if (to === at) return;
    var card = cards[id];
    reorder(function () {
      var others = [].slice.call(list.children).filter(function (c) {
        return c !== card;
      });
      list.insertBefore(card, others[to] || null);
    });
    card.focus({ preventScroll: true });
    ctx.announce(ctx.textWith("sortMoved", { n: to + 1, total: order.length }));
    moved();
  }

  // The order to start with: the learner's is mixed up; a picture shows the objects in their right order.
  var startOrder = live
    ? sortShuffled(
        data.items.map(function (item) {
          return item.id;
        }),
      )
    : data.items.map(function (item) {
        return item.id;
      });
  startOrder.forEach(function (id) {
    var item = itemById[id];
    var card = element(live ? "button" : "div", "weft-sort-item" + (item.kind === "image" ? " is-image" : ""), { "data-weft-item": id });
    if (live) card.setAttribute("type", "button");
    // (Alone on its line an object takes that share of the room; on one of several lines the room is that of its place.)
    // (Along a horizontal line a picture has the room for twice the height; the words under the line move down with the lowest object.)
    var itemWidth = data.itemSize.width;
    var itemHeight = data.itemSize.height;
    if (vertical) {
      if (multi) itemHeight = Math.min(100, itemHeight * layout.per);
    } else {
      if (multi) itemWidth = Math.min(100, itemWidth * layout.per);
      if (item.kind === "image") itemHeight = Math.min(100, itemHeight * 2);
    }
    card.style.width = itemWidth + "%";
    card.style.height = itemHeight + "%";
    var fill = function () {
      fillItem(card, item);
    };
    fill();
    fills.push(fill);
    if (live) {
      card.addEventListener("pointerdown", function (event) {
        startDrag(event, id);
      });
      card.addEventListener("click", function (event) {
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        // A click of the mouse on a picture enlarges it (also after submitting); on a text it does nothing (it drags). A key picks the card up, and puts it
        // down again.
        if (item.kind === "image" && event.detail > 0) {
          enlarge(item);
          return;
        }
        if (locked || event.detail > 0) return;
        pick(picked === id ? null : id);
      });
      card.addEventListener("keydown", function (event) {
        if ((event.key === "z" || event.key === "+") && item.kind === "image") {
          event.preventDefault();
          enlarge(item);
          return;
        }
        if (locked || picked !== id) return;
        var earlier = event.key === "ArrowUp" || event.key === "ArrowLeft";
        var later = event.key === "ArrowDown" || event.key === "ArrowRight";
        if (earlier || later) {
          // (The arrow keys would otherwise turn the page.) Across the lines (up or down along a horizontal one) it is a line further.
          event.preventDefault();
          event.stopPropagation();
          var across = vertical ? event.key === "ArrowLeft" || event.key === "ArrowRight" : event.key === "ArrowUp" || event.key === "ArrowDown";
          moveBy(id, (earlier ? -1 : 1) * (multi && across ? layout.per : 1));
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          var back = pickedFrom;
          reorder(function () {
            back.forEach(function (backId) {
              list.appendChild(cards[backId]);
            });
          });
          pick(null);
          card.focus({ preventScroll: true });
          moved();
        }
      });
    }
    cards[id] = card;
    list.appendChild(card);
  });
  lastOrder = currentOrder().join(",");

  // ---- dragging: a picture of the card follows the pointer; the others make room where it would be put ----
  function startDrag(event, id) {
    if (locked || event.button !== 0) return;
    var card = cards[id];
    var startX = event.clientX;
    var startY = event.clientY;
    var started = false;
    var ghost = null;
    var grab = { x: 0, y: 0 };
    var bodyRect = null;
    function move(e) {
      if (!started) {
        if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) < 6) return;
        started = true;
        bodyRect = body.getBoundingClientRect();
        var rect = card.getBoundingClientRect();
        grab = { x: startX - rect.left, y: startY - rect.top };
        ghost = card.cloneNode(true);
        ghost.classList.add("is-ghost");
        ghost.classList.remove("is-picked");
        ghost.style.width = rect.width + "px";
        ghost.style.height = rect.height + "px";
        body.appendChild(ghost);
        card.classList.add("is-dragging");
      }
      ghost.style.left = e.clientX - bodyRect.left - grab.x + "px";
      ghost.style.top = e.clientY - bodyRect.top - grab.y + "px";
      // It goes after every other card whose middle the pointer has passed (measured from the layout, not from where a gliding card is).
      // (On several lines: on the line whose middle is nearest, after every object of it that the pointer has passed.)
      var listRect = list.getBoundingClientRect();
      var pointerX = e.clientX - listRect.left;
      var pointerY = e.clientY - listRect.top;
      var kids = [].slice.call(list.children);
      var others = kids.filter(function (c) {
        return c !== card;
      });
      var index = sortDropIndex(
        layout.per,
        kids.map(function (c) {
          var x = c.offsetLeft + c.offsetWidth / 2;
          var y = c.offsetTop + c.offsetHeight / 2;
          return vertical ? { along: y, cross: x } : { along: x, cross: y };
        }),
        kids.indexOf(card),
        vertical ? pointerY : pointerX,
        vertical ? pointerX : pointerY,
      );
      if (index !== kids.indexOf(card)) {
        reorder(function () {
          list.insertBefore(card, others[index] || null);
        });
      }
    }
    function end() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (!started) return;
      // A click follows the let-go pointer on a card; this was a drag.
      suppressClick = true;
      setTimeout(function () {
        suppressClick = false;
      }, 0);
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      card.classList.remove("is-dragging");
      moved();
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
  var answered = null; // null until submitted, then whether the order was right
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
      var order = currentOrder();
      var result = sortMistakes(
        order.map(function (id) {
          return rightPlace[id];
        }),
      );
      var allRight = result.moves === 0;
      order.forEach(function (id, index) {
        var card = cards[id];
        var right = !!result.stays[index];
        card.classList.add(right ? "is-correct" : "is-wrong");
        var markIcon = element("span", "weft-matching-mark", { "aria-hidden": "true" });
        markIcon.innerHTML = right ? ctx.icons.correct : ctx.icons.incorrect;
        (card.querySelector(".weft-matching-frame") || card).appendChild(markIcon);
      });
      ctx.submit({ moves: result.moves, allRight: allRight });
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
    // The language (or the words) changed: the objects and the words at the ends of the line are drawn again; the order stays.
    update: function (next) {
      data = next;
      remember();
      showLabels();
      fills.forEach(function (fill) {
        fill();
      });
      submitLabel.nodeValue = ctx.text("submit");
      if (answered !== null) showFeedbackTitle();
    },
    destroy: function () {
      gone = true;
      if (observer) observer.disconnect();
      if (placeLabelsLater !== null) {
        if (window.cancelAnimationFrame) window.cancelAnimationFrame(placeLabelsLater);
        clearTimeout(placeLabelsLater);
      }
      if (box.parentNode) box.parentNode.removeChild(box);
    },
  };
}
