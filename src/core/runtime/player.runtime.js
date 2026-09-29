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

  var startPageIdEl = document.getElementById("weft-start-page");
  var startPageId = startPageIdEl ? JSON.parse(startPageIdEl.textContent || "null") : null;

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

  function pageTransition(pageId) {
    var page = pageId && module.pages[pageId];
    return (page && page.transition) || { type: "none", durationMs: 500 };
  }

  function goNext() {
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
    var node = resolveCurrentNode();
    if (node.type === "end") {
      pos = history.length; // one past the last page: the "finished" state
      render(pageTransition(outgoing));
      sendCompleted();
      return;
    }
    history.push(node.pageId);
    pos = history.length - 1;
    render(pageTransition(outgoing));
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
    // Explicit === false (not just falsy) so a module exported before this setting existed -
    // its embedded JSON simply won't have the field at all, and can't be migrated after the
    // fact like a re-opened .weft.zip can - keeps behaving exactly as it always did instead of
    // suddenly losing keyboard navigation nobody asked to turn off.
    if (module.keyboardNavigationEnabled === false) return;
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

  // ---- page-timeline event bus (drives BlockEffect.triggerEventId - see BlockEffectEditor in
  // panels/BlockPanel.tsx) ----
  // A block's own Aufbau/Abbau is triggered by one of these ids, in exactly the same string shape
  // the editor's own graph (see pageTimeline.ts's *NodeId functions) uses to name them - kept in
  // sync by hand across the two files, the same way DEFAULT_VIEWPORT_WIDTH etc. already are,
  // since this file can't import from there (see the file header: no imports, no build step).
  // Reset per renderStage() call (a fresh page's blocks need fresh listeners, and any stale ones
  // left over from the previous page's now-detached elements should never fire again).
  var eventListeners = {};
  function onGraphEvent(eventId, callback) {
    if (!eventId) return;
    (eventListeners[eventId] = eventListeners[eventId] || []).push(callback);
  }
  function fireGraphEvent(eventId) {
    (eventListeners[eventId] || []).forEach(function (callback) {
      callback();
    });
  }
  function quizFillEventId(blockId) {
    return "quiz-fill:" + blockId;
  }
  function quizSubmitEventId(blockId) {
    return "quiz-submit:" + blockId;
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
   * Wires up one block's own Aufbau/Abbau (see BaseBlock.entranceEffect/exitEffect in
   * core/types.ts) - called once per block, right after it's built, from renderBlock. The block
   * starts hidden (visibility, not display: none, so it never needs a reflow to reveal) and is
   * only ever shown once its entrance's trigger event actually fires, after its own delay -
   * "none" as the effect type still means exactly that, it just reveals instantly instead of
   * animating; the default entrance (trigger "start", 0ms delay, type "none") reveals in the same
   * synchronous pass that builds the stage, before the browser ever paints, so a block with no
   * effects configured looks exactly like it always did: just there from the start. Abbau mirrors
   * this the other way, and simply never runs at all when its own triggerEventId is null (the
   * default - see defaultExitEffect in document/blockEffects.ts).
   */
  function applyBlockEffects(wrap, block) {
    var entrance = block.entranceEffect || { type: "none", triggerEventId: "start", durationMs: 500, delayMs: 0 };
    var exit = block.exitEffect || { type: "none", triggerEventId: null, durationMs: 500, delayMs: 0 };

    wrap.style.visibility = "hidden";
    onGraphEvent(entrance.triggerEventId, function () {
      setTimeout(function () {
        wrap.style.visibility = "";
        if (entrance.type === "fade") {
          wrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: entrance.durationMs || 500, easing: "ease" });
        } else if (entrance.type === "move") {
          wrap.animate([{ transform: "translateX(100%)" }, { transform: "translateX(0)" }], {
            duration: entrance.durationMs || 500,
            easing: "ease",
          });
        }
      }, entrance.delayMs || 0);
    });

    if (exit.triggerEventId) {
      onGraphEvent(exit.triggerEventId, function () {
        setTimeout(function () {
          function hide() {
            wrap.style.visibility = "hidden";
          }
          if (exit.type === "fade") {
            wrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: exit.durationMs || 500, easing: "ease" }).onfinish = hide;
          } else if (exit.type === "move") {
            wrap.animate([{ transform: "translateX(0)" }, { transform: "translateX(100%)" }], {
              duration: exit.durationMs || 500,
              easing: "ease",
            }).onfinish = hide;
          } else {
            hide();
          }
        }, exit.delayMs || 0);
      });
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
    var ratio = ASPECT_MAP[module.aspectRatio] || ASPECT_MAP["16:9"];
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

  function renderStaticBlock(block) {
    var wrap = el("div", { class: "weft-block weft-block-" + block.kind, style: positionStyle(block.position) });
    if (block.kind === "text") {
      wrap.innerHTML = block.html;
    } else if (block.kind === "image") {
      wrap.appendChild(el("img", { src: assetSrc(block.assetId), alt: block.alt, style: "width:100%;height:100%;object-fit:contain;" }, []));
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
      videoEl.autoplay = !!block.autoplay;

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
              fireGraphEvent(videoStopEventId(block.id, stopPoint.id));
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
      var playButton = el("button", { type: "button", class: "weft-video-play", "aria-label": "Abspielen" }, []);
      playButton.innerHTML = PLAY_ICON_SVG;
      playButton.addEventListener("click", function (ev) {
        ev.stopPropagation();
        // play() rejects if the element is torn down (slide navigation) before it resolves -
        // nothing to recover from there, just avoid an unhandled-rejection console error over it.
        videoEl.play().catch(function () {});
      });
      // hasFiredStart guards against "video-start" refiring on every resume-after-pause - native
      // <video> fires "play" each time playback (re)starts, but the event should only mean the
      // *first* time, matching what "Start des Videos" actually shows in the editor's own graph.
      var hasFiredStart = false;
      videoEl.addEventListener("play", function () {
        playButton.classList.add("is-hidden");
        if (!hasFiredStart) {
          hasFiredStart = true;
          fireGraphEvent(videoStartEventId(block.id));
        }
      });
      // Never fires at all for a looping video (the loop attribute pre-empts "ended" natively) -
      // matches "video-end-loop"/the ∞ icon's own meaning of "doesn't really end" exactly.
      videoEl.addEventListener("ended", function () {
        fireGraphEvent(videoEndEventId(block.id));
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
    question.innerHTML = block.questionHtml;
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
      text.innerHTML = opt.html;
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
      fireGraphEvent(quizFillEventId(block.id));
    });

    var submit = el("button", { type: "submit", class: "weft-quiz-submit" }, []);
    var submitIcon = el("span", { class: "weft-quiz-submit-icon" }, []);
    submitIcon.innerHTML = QUIZ_SUBMIT_ICON_SVG;
    submit.appendChild(submitIcon);
    submit.appendChild(document.createTextNode("Abschicken"));
    form.appendChild(submit);

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
      // One shared event regardless of correct/incorrect - matches quizSubmitNodeId in
      // pageTimeline.ts, which is likewise the same id for both outcome lanes (only the label/icon
      // shown for it differ there, not the underlying event).
      fireGraphEvent(quizSubmitEventId(block.id));

      // Replaces the submit button rather than joining it (see the feedback element above), and
      // locks the options in place - both so a learner can't submit twice, and so the answer
      // shown as "correct"/"incorrect" can't silently change after the fact by re-checking boxes.
      submit.hidden = true;
      Array.prototype.slice.call(form.querySelectorAll(".weft-quiz-option-input")).forEach(function (input) {
        input.disabled = true;
      });
      feedbackIcon.innerHTML = correct ? QUIZ_CORRECT_ICON_SVG : QUIZ_INCORRECT_ICON_SVG;
      feedbackTitle.textContent = correct ? "Das war richtig!" : "Das war leider nicht richtig.";
      feedback.className = "weft-quiz-feedback " + (correct ? "is-correct" : "is-incorrect");
      feedback.hidden = false;

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
    var wrap = block.kind === "quiz" ? renderQuizBlock(block) : block.kind === "button" ? renderButtonBlock(block) : renderStaticBlock(block);
    applyBlockEffects(wrap, block);
    return wrap;
  }

  function renderStage(pageId) {
    // Fresh listeners for a fresh page - see eventListeners's own comment above for why stale
    // ones from whatever page was showing before must never carry over.
    eventListeners = {};
    var page = module.pages[pageId];
    var stage = el("div", { class: "weft-stage", style: stageStyle() }, []);
    var layout = page.layoutId ? module.layouts[page.layoutId] : null;
    if (layout) layout.blocks.forEach(function (b) { stage.appendChild(renderBlock(b)); });
    page.blocks.forEach(function (b) { stage.appendChild(renderBlock(b)); });
    // Every block's own entrance/exit listener is registered synchronously above, by the time
    // renderBlock returns for it - so firing "start" here, still before this stage is even
    // returned to be appended to the DOM, reaches all of them before the browser ever paints.
    fireGraphEvent("start");
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
    return wrap;
  }

  // Animates the outgoing .weft-stage-wrap out and/or the incoming one in, per `transition.type`
  // (see Transition in core/types.ts and the matching .is-transition-old/-new rules in
  // player.runtime.css), then swaps them for real once the animation finishes. "fade": only the
  // outgoing one animates (opacity 1 -> 0), revealing the incoming one underneath, already at
  // full opacity - matches how it was designed in the editor's Timeline/TransitionPanel. "move":
  // the outgoing one slides a full width to the left while the incoming one slides in from a full
  // width to the right, in lockstep.
  function animateTransition(root, oldWrap, newWrap, transition) {
    var duration = transition.durationMs || 500;
    oldWrap.classList.add("is-transition-old");
    newWrap.classList.add("is-transition-new");
    root.appendChild(newWrap);

    function finish() {
      if (oldWrap.parentNode === root) root.removeChild(oldWrap);
      newWrap.classList.remove("is-transition-new");
    }

    if (transition.type === "fade") {
      oldWrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: duration, easing: "ease" }).onfinish = finish;
    } else if (transition.type === "move") {
      oldWrap.animate([{ transform: "translateX(0)" }, { transform: "translateX(-100%)" }], { duration: duration, easing: "ease" });
      newWrap.animate([{ transform: "translateX(100%)" }, { transform: "translateX(0)" }], { duration: duration, easing: "ease" }).onfinish = finish;
    } else {
      finish(); // an unrecognized/future type - fall back to an instant cut rather than getting stuck mid-transition
    }
  }

  function render(outgoingTransition) {
    var root = document.getElementById("weft-root");
    var oldWrap = root.firstElementChild;
    var newWrap = buildStageWrap();

    if (oldWrap && outgoingTransition && outgoingTransition.type !== "none") {
      animateTransition(root, oldWrap, newWrap, outgoingTransition);
    } else {
      root.innerHTML = "";
      root.appendChild(newWrap);
    }

    sendProgress();
    if (lmsEnabled) postToLms({ type: "resize", height: document.documentElement.scrollHeight });
  }

  postToLms({ type: "ready" });
  goNext();
})();
