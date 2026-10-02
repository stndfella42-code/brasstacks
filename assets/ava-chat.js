/* Ava web-chat widget — Brass Tacks
 * Install: <script src="/assets/ava-chat.js" defer></script>
 * Optional config via data attributes on the script tag:
 *   data-api-url="/api/chat"  data-greeting="..."  data-phone="(720) 719-9794"
 * No dependencies. Streams replies via SSE. Supports the [[GO]] take-me-there
 * action: the server emits { go: { url, label } } and the widget renders a
 * button that navigates (page URLs) or smooth-scrolls (#anchors).
 */
(function () {
  "use strict";
  var script = document.currentScript;
  var API_URL = (script && script.getAttribute("data-api-url")) || "/api/chat";
  var GREETING = (script && script.getAttribute("data-greeting")) ||
    "Hi! I'm Ava, Brass Tacks' virtual receptionist. Ask me about our services, pricing, or the work. I can walk you right to it.";
  var PHONE = (script && script.getAttribute("data-phone")) || "(720) 719-9794";

  var sessionId = "web-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  var history = []; // {role, content}
  var opened = false;
  var sending = false;

  // Auto-load the stylesheet next to this script so install is a single tag.
  (function loadCss() {
    try {
      var src = script && script.src ? script.src : "";
      var cssHref = src ? src.replace(/ava-chat\.js(\?.*)?$/, "ava-chat.css") : "/assets/ava-chat.css";
      if (!document.querySelector('link[href="' + cssHref + '"]')) {
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = cssHref;
        document.head.appendChild(link);
      }
    } catch (e) { /* non-fatal */ }
  })();

  var WAVEFORM_SVG = '<svg viewBox="0 0 32 32" width="26" height="26" fill="none" aria-hidden="true">' +
    '<path d="M6 16h2l2-6 3 12 3-16 3 14 2-8 2 4h3" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function renderText(s) {
    // Strip any machine-readable blocks (server also strips; belt and suspenders).
    s = s.replace(/\[\[(LEAD|GO)\b[^\]]*\]\]/g, "").trim();
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
  }

  // --- build DOM -----------------------------------------------------------
  var fab = el("button", "ava-fab", WAVEFORM_SVG);
  fab.setAttribute("aria-label", "Chat with Ava");
  fab.type = "button";

  var panel = el("div", "ava-panel ava-hidden");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Chat with Ava");
  panel.innerHTML =
    '<div class="ava-head">' +
      '<div class="ava-head-mark">' + WAVEFORM_SVG + "</div>" +
      '<div class="ava-head-text"><strong>Ava</strong><span>Brass Tacks&rsquo; virtual receptionist</span></div>' +
      '<button class="ava-close" type="button" aria-label="Close chat">&times;</button>' +
    "</div>" +
    '<div class="ava-msgs"></div>' +
    '<form class="ava-form">' +
      '<input class="ava-input" type="text" placeholder="Ask about services, pricing, the work&hellip;" autocomplete="off" maxlength="500" aria-label="Type your message">' +
      '<button class="ava-send" type="submit" aria-label="Send">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M4 12l16-7-7 16-2.5-6.5z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>' +
      "</button>" +
    "</form>";

  var msgs = panel.querySelector(".ava-msgs");
  var form = panel.querySelector(".ava-form");
  var input = panel.querySelector(".ava-input");

  function mount() {
    if (!document.body.contains(fab)) document.body.appendChild(fab);
    if (!document.body.contains(panel)) document.body.appendChild(panel);
  }
  document.addEventListener("DOMContentLoaded", mount);
  if (document.readyState !== "loading") mount();

  function addMsg(role, html) {
    var wrap = el("div", "ava-msg ava-" + role);
    var bubble = el("div", "ava-bubble", html);
    wrap.appendChild(bubble);
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
    return { wrap: wrap, bubble: bubble };
  }

  function addGoButton(wrap, go) {
    var btn = el("button", "ava-go", esc(go.label) + " &rarr;");
    btn.type = "button";
    btn.addEventListener("click", function () {
      var url = go.url;
      if (url.charAt(0) === "#") {
        var target = document.querySelector(url);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          target.classList.add("ava-flash");
          setTimeout(function () { target.classList.remove("ava-flash"); }, 2200);
        }
      } else {
        window.location.href = url;
      }
    });
    wrap.appendChild(btn);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function toggle(open) {
    opened = open === undefined ? !opened : open;
    panel.classList.toggle("ava-hidden", !opened);
    fab.classList.toggle("ava-open", opened);
    if (opened && !history.length) {
      addMsg("assistant", renderText(GREETING));
      input.focus();
    }
  }
  fab.addEventListener("click", function () { toggle(); });
  panel.querySelector(".ava-close").addEventListener("click", function () { toggle(false); });

  async function send(text) {
    if (sending || !text.trim()) return;
    sending = true;
    addMsg("user", renderText(text.trim()));
    history.push({ role: "user", content: text.trim().slice(0, 2000) });
    input.value = "";

    var parts = addMsg("assistant", '<span class="ava-typing"><i></i><i></i><i></i></span>');
    var bubble = parts.bubble, wrap = parts.wrap;
    var full = "";
    var goAction = null;

    try {
      var res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionId, messages: history.slice(-20) }),
      });
      if (!res.ok || !res.body) throw new Error("bad response " + res.status);

      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buf = "";
      var first = true;
      while (true) {
        var step = await reader.read();
        if (step.done) break;
        buf += decoder.decode(step.value, { stream: true });
        var chunks = buf.split("\n\n");
        buf = chunks.pop();
        for (var i = 0; i < chunks.length; i++) {
          var line = chunks[i].trim();
          if (line.indexOf("data:") !== 0) continue;
          var payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          var obj;
          try { obj = JSON.parse(payload); } catch (e) { continue; }
          if (obj.token) {
            if (first) { bubble.innerHTML = ""; first = false; }
            full += obj.token;
            bubble.innerHTML = renderText(full);
            msgs.scrollTop = msgs.scrollHeight;
          } else if (obj.go) {
            goAction = obj.go;
          } else if (obj.error) {
            bubble.innerHTML = renderText(obj.error);
          }
        }
      }
      if (!full) {
        bubble.innerHTML = renderText("Hmm, I didn't catch that. Try asking again, or call us at " + PHONE + ", I answer around the clock!");
      } else {
        history.push({ role: "assistant", content: full.slice(0, 2000) });
        if (goAction && goAction.url && goAction.label) addGoButton(wrap, goAction);
      }
    } catch (e) {
      bubble.innerHTML = renderText("I'm having trouble connecting right now. You can always call us at " + PHONE + ", I answer around the clock!");
    } finally {
      sending = false;
      msgs.scrollTop = msgs.scrollHeight;
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    send(input.value);
  });
})();
