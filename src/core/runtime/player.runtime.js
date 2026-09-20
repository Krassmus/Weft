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

  var lmsEnabled = !!(module.lms && module.lms.enabled) && window.parent !== window;

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
    var before = variables[effect.variableId];
    if (effect.op === "set") variables[effect.variableId] = effect.value;
    else if (effect.op === "add") variables[effect.variableId] = (Number(before) || 0) + effect.value;
    else if (effect.op === "append") variables[effect.variableId] = String(before || "") + effect.value;
    if (variables[effect.variableId] !== before) {
      var def = module.variables.filter(function (v) {
        return v.id === effect.variableId;
      })[0];
      if (def) postToLms({ type: "variable-changed", name: def.name, value: variables[effect.variableId] });
    }
  }

  // ---- sequence / branch traversal ----
  // Once a logic block is resolved to a branch, that choice is cached in `history` and stays
  // fixed while the learner pages back and forth through it - re-evaluating on every visit
  // would let an earlier answer retroactively change a branch already shown.
  var cursor = { topIndex: 0, branch: null };
  var history = [];
  var pos = -1;

  function evalCondition(cond) {
    var v = variables[cond.variableId];
    switch (cond.comparator) {
      case "eq":
        return v === cond.value;
      case "neq":
        return v !== cond.value;
      case "gt":
        return v > cond.value;
      case "gte":
        return v >= cond.value;
      case "lt":
        return v < cond.value;
      case "lte":
        return v <= cond.value;
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

  function goNext() {
    if (pos < history.length - 1) {
      pos++;
      render();
      return;
    }
    if (history.length > 0) advanceCursor();
    var node = resolveCurrentNode();
    if (node.type === "end") {
      pos = history.length; // one past the last page: the "finished" state
      render();
      sendCompleted();
      return;
    }
    history.push(node.pageId);
    pos = history.length - 1;
    render();
  }

  function goPrev() {
    if (pos <= 0) return;
    pos--;
    render();
  }

  function restart() {
    variables = {};
    module.variables.forEach(function (v) {
      variables[v.id] = v.initialValue;
    });
    cursor = { topIndex: 0, branch: null };
    history = [];
    pos = -1;
    goNext();
  }

  // ---- LMS bridge (postMessage) ----
  function postToLms(msg) {
    if (!lmsEnabled) return;
    var origins = module.lms.allowedOrigins && module.lms.allowedOrigins.length ? module.lms.allowedOrigins : ["*"];
    var payload = Object.assign({ source: "weft-module", version: 1, moduleId: module.id }, msg);
    origins.forEach(function (origin) {
      window.parent.postMessage(payload, origin);
    });
  }

  function namedVariables() {
    var out = {};
    module.variables.forEach(function (v) {
      out[v.name] = variables[v.id];
    });
    return out;
  }

  function sendProgress() {
    postToLms({ type: "progress", nodeIndex: pos, nodeCount: module.sequence.length });
  }

  function sendCompleted() {
    postToLms({ type: "completed", variables: namedVariables() });
  }

  if (lmsEnabled) {
    window.addEventListener("message", function (event) {
      var data = event.data;
      if (!data || data.source !== "weft-lms-host") return;
      if (data.type === "init" && data.variables) {
        Object.keys(data.variables).forEach(function (name) {
          var def = variableByName(name);
          if (def) variables[def.id] = data.variables[name];
        });
        render();
      } else if (data.type === "request-state") {
        sendProgress();
      }
    });
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
      // Not gated behind lmsEnabled (that flag is for the separate, optional LMS protocol) -
      // this only fires when actually embedded in an iframe, which is exactly when some host
      // (the editor's own Vorschau, or an LMS) needs telling that the learner wants out.
      if (window.parent !== window) window.parent.postMessage({ source: "weft-module", type: "exit-presentation" }, "*");
      return;
    }
    var isSpace = e.key === " " || e.key === "Spacebar";
    var isRight = e.key === "ArrowRight";
    var isLeft = e.key === "ArrowLeft";
    if (!isSpace && !isRight && !isLeft) return;
    if (blocksGlobalKeyNav(document.activeElement, isSpace)) return;
    e.preventDefault();
    if (isLeft) goPrev();
    else (pos >= history.length ? restart : goNext)();
  });

  // ---- rendering ----
  // Numeric [width, height] ratios (not a CSS aspect-ratio string) - stageStyle() below turns
  // these into --ar-w/--ar-h custom properties, which the CSS uses in a calc() to size the
  // stage to the largest box of that ratio that still fits the viewport (see player.runtime.css).
  var ASPECT_MAP = { "16:9": [16, 9], "4:3": [4, 3], "1:1": [1, 1], "3:2": [3, 2] };

  function stageStyle() {
    var ratio = ASPECT_MAP[module.aspectRatio] || ASPECT_MAP["16:9"];
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
      "%;"
    );
  }

  function iframeEl(block, src) {
    return el("iframe", {
      src: src,
      sandbox: (block.sandbox || []).join(" "),
      allow: block.allow || "",
      style: "width:100%;height:100%;border:0;",
    }, []);
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

  function renderStaticBlock(block) {
    var wrap = el("div", { class: "weft-block weft-block-" + block.kind, style: positionStyle(block.position) });
    if (block.kind === "text") {
      wrap.innerHTML = block.html;
    } else if (block.kind === "image") {
      wrap.appendChild(el("img", { src: assetSrc(block.assetId), alt: block.alt, style: "width:100%;height:100%;object-fit:contain;" }, []));
    } else if (block.kind === "iframe") {
      if (block.qrCode) {
        renderIframeGate(wrap, block);
      } else {
        wrap.appendChild(iframeEl(block, block.url));
      }
    }
    return wrap;
  }

  function renderButtonBlock(block) {
    var wrap = el("div", { class: "weft-block weft-block-button", style: positionStyle(block.position) });
    var button = el("button", { type: "button", class: "weft-block-button-el" }, [
      document.createTextNode(block.text || "Weiter"),
    ]);
    if (block.action === "prev") {
      button.disabled = pos <= 0;
      button.addEventListener("click", goPrev);
    } else {
      // Mirrors the built-in "Weiter" control exactly: once the module has ended, the same
      // action restarts it instead of doing nothing.
      button.addEventListener("click", pos >= history.length ? restart : goNext);
    }
    wrap.appendChild(button);
    return wrap;
  }

  function renderQuizBlock(block) {
    var wrap = el("div", { class: "weft-block weft-block-quiz", style: positionStyle(block.position) });
    var form = el("form", { class: "weft-quiz" }, []);
    form.appendChild(el("p", { class: "weft-quiz-question" }, [document.createTextNode(block.question)]));
    var feedback = el("p", { class: "weft-quiz-feedback" }, []);

    block.options.forEach(function (opt) {
      var label = el("label", { class: "weft-quiz-option" }, []);
      var input = el("input", { type: "checkbox", name: "opt-" + block.id, value: opt.id }, []);
      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + opt.text));
      form.appendChild(label);
    });

    var submit = el("button", { type: "submit" }, [document.createTextNode("Antworten")]);
    form.appendChild(submit);
    form.appendChild(feedback);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var checked = Array.prototype.slice
        .call(form.querySelectorAll("input:checked"))
        .map(function (input) {
          return input.value;
        });
      var correct =
        checked.length === block.correctOptionIds.length &&
        checked.every(function (id) {
          return block.correctOptionIds.indexOf(id) !== -1;
        });
      (correct ? block.onCorrect : block.onIncorrect).forEach(applyEffect);
      feedback.textContent = correct ? "Richtig!" : "Leider nicht richtig.";
      feedback.className = "weft-quiz-feedback " + (correct ? "is-correct" : "is-incorrect");

      if (correct ? block.advanceOnCorrect : block.advanceOnIncorrect) {
        var posAtAnswer = pos;
        // Delayed so the feedback text is still readable for a moment, and guarded by
        // posAtAnswer so a learner who's already navigated away during that delay (Zurück, a
        // button block, keyboard) doesn't get pulled forward again out from under them.
        setTimeout(function () {
          if (pos !== posAtAnswer) return;
          (pos >= history.length ? restart : goNext)();
        }, 1500);
      }
    });

    wrap.appendChild(form);
    return wrap;
  }

  function renderBlock(block) {
    if (block.kind === "quiz") return renderQuizBlock(block);
    if (block.kind === "button") return renderButtonBlock(block);
    return renderStaticBlock(block);
  }

  function renderStage(pageId) {
    var page = module.pages[pageId];
    var stage = el("div", { class: "weft-stage", style: stageStyle() }, []);
    var layout = page.layoutId ? module.layouts[page.layoutId] : null;
    if (layout) layout.blocks.forEach(function (b) { stage.appendChild(renderBlock(b)); });
    page.blocks.forEach(function (b) { stage.appendChild(renderBlock(b)); });
    return stage;
  }

  // No Zurück/Weiter bar any more - navigation lives on the slides themselves as button
  // blocks (see renderButtonBlock). The one dead end that leaves is the synthetic "done" screen,
  // which isn't a real page and so can't carry an author-placed button - it gets its own restart
  // button for exactly that reason.
  function render() {
    var root = document.getElementById("weft-root");
    root.innerHTML = "";

    var wrap = el("div", { class: "weft-stage-wrap" }, []);

    if (pos >= history.length) {
      var restartBtn = el("button", { type: "button", class: "weft-block-button-el weft-done-restart" }, [
        document.createTextNode("Neu starten"),
      ]);
      restartBtn.addEventListener("click", restart);
      var doneStage = el("div", { class: "weft-stage weft-stage-done", style: stageStyle() }, [
        el("div", { class: "weft-done-message" }, [document.createTextNode("Lernmodul abgeschlossen.")]),
        restartBtn,
      ]);
      wrap.appendChild(doneStage);
    } else {
      wrap.appendChild(renderStage(history[pos]));
    }

    root.appendChild(wrap);

    sendProgress();
    if (lmsEnabled) postToLms({ type: "resize", height: document.documentElement.scrollHeight });
  }

  postToLms({ type: "ready" });
  goNext();
})();
