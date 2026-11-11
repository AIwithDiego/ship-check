/* The bout: the glove against the slop monster. start() rings the bell and spars
   while the check runs; finish(ship) ends it. A pass knocks the monster out, a
   fail leaves it standing. With reduced motion the bout is skipped. */
(function () {
  var REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var WORDS = ["seamless", "elevate", "delve", "unlock", "game-changer", "robust", "synergy", "next level", "journey", "it's not X, it's Y"];
  var MIN_SPAR_MS = 1700;

  var MONSTER =
    '<svg viewBox="0 0 240 232" aria-hidden="true" focusable="false">' +
    '<defs><linearGradient id="slopg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#667eea"/><stop offset=".55" stop-color="#a855f7"/><stop offset="1" stop-color="#ec4899"/></linearGradient></defs>' +
    '<path d="M28 128c-18-4-26 14-14 24 8 7 20 2 24-8z" fill="#8b5cf6" stroke="#3b1a78" stroke-width="5" stroke-linejoin="round"/>' +
    '<path d="M214 122c18-8 30 8 20 20-8 9-20 6-26-4z" fill="#d946ef" stroke="#3b1a78" stroke-width="5" stroke-linejoin="round"/>' +
    '<path d="M40 200C10 190 14 120 34 84 50 40 96 18 124 22c46-6 90 30 90 82 18 46 12 92-18 100-26 10-46-8-70 2-26 10-56 6-86-6z" fill="url(#slopg)" stroke="#3b1a78" stroke-width="6" stroke-linejoin="round"/>' +
    '<ellipse cx="86" cy="60" rx="27" ry="11" transform="rotate(-27 86 60)" fill="#fff" opacity=".35"/>' +
    '<circle cx="62" cy="212" r="9" fill="#a855f7" stroke="#3b1a78" stroke-width="5"/><circle cx="152" cy="218" r="7" fill="#d946ef" stroke="#3b1a78" stroke-width="5"/>' +
    '<circle cx="98" cy="100" r="21" fill="#fff" stroke="#3b1a78" stroke-width="5"/><circle cx="152" cy="94" r="25" fill="#fff" stroke="#3b1a78" stroke-width="5"/>' +
    '<g class="bout-pupils"><circle cx="104" cy="103" r="8" fill="#1b0b3a"/><circle cx="160" cy="98" r="9" fill="#1b0b3a"/></g>' +
    '<g class="bout-x" fill="none" stroke="#1b0b3a" stroke-width="7" stroke-linecap="round"><path d="M88 90l20 20M108 90l-20 20M140 82l24 24M164 82l-24 24"/></g>' +
    '<path d="M74 72l34 10M178 62l-36 12" fill="none" stroke="#3b1a78" stroke-width="7" stroke-linecap="round"/>' +
    '<path d="M76 146q50 46 102-6-52 16-102 6z" fill="#2a0f55" stroke="#3b1a78" stroke-width="5" stroke-linejoin="round"/>' +
    '<path d="M96 151l14 2-2 13-13-3zM118 154h14l-1 13h-13zM140 153l14-3 1 13-13 3z" fill="#fff"/>' +
    '<g class="bout-sparks" fill="#ffe86b" stroke="#b98a00" stroke-width="2.5" stroke-linejoin="round"><path d="M34 34l5 13 13 5-13 5-5 13-5-13-13-5 13-5z"/><path d="M206 30l4 10 10 4-10 4-4 10-4-10-10-4 10-4z"/><path d="M222 170l3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/></g>' +
    "</svg>";

  var GLOVE =
    '<svg viewBox="0 0 236 172" aria-hidden="true" focusable="false">' +
    '<rect x="168" y="44" width="62" height="84" rx="13" fill="#eef5ff" stroke="#06162b" stroke-width="6"/>' +
    '<path d="M186 47v78M204 47v78" stroke="#b9cbe6" stroke-width="6"/>' +
    '<path d="M178 30C124 8 42 18 22 70 6 112 40 152 100 152c40 2 66-5 78-12z" fill="#ff8f1f" stroke="#06162b" stroke-width="6" stroke-linejoin="round"/>' +
    '<path d="M30 104c14 30 46 42 76 42 34 1 58-4 70-10l-1-16c-40 14-110 16-145-16z" fill="#c9570a" opacity=".75"/>' +
    '<path d="M48 48c26-22 72-26 112-14" fill="none" stroke="#ffd9a0" stroke-width="9" stroke-linecap="round" opacity=".8"/>' +
    '<ellipse cx="112" cy="116" rx="50" ry="24" transform="rotate(-7 112 116)" fill="#ffab45" stroke="#06162b" stroke-width="6"/>' +
    "</svg>";

  function burst() {
    var pts = [], n = 14, i, r, a;
    for (i = 0; i < n * 2; i++) { r = i % 2 ? 58 : 100; a = (Math.PI * i) / n; pts.push((100 + r * Math.cos(a)).toFixed(1) + "," + (100 + r * Math.sin(a)).toFixed(1)); }
    return '<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false"><polygon points="' + pts.join(" ") + '" fill="#ffd84a" stroke="#06162b" stroke-width="6" stroke-linejoin="round"/></svg>';
  }

  /* sound: made on the spot, no files */
  var ctx = null;
  function audio() {
    if (ctx) return ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
    return ctx;
  }
  function muted() { try { return localStorage.getItem("shipcheck-mute") === "1"; } catch (e) { return false; } }
  function tone(freq, at, len, type, vol, to) {
    var c = audio(); if (!c || muted()) return;
    var o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + len);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + len + 0.05);
  }
  function noise(at, len, vol) {
    var c = audio(); if (!c || muted()) return;
    var b = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate), d = b.getChannelData(0), i;
    for (i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    var s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 900; g.gain.value = vol;
    s.buffer = b; s.connect(f); f.connect(g); g.connect(c.destination); s.start(c.currentTime + at);
  }
  var sfx = {
    bell: function () { [0, 0.28].forEach(function (t) { tone(1320, t, 0.9, "sine", 0.22); tone(1980, t, 0.6, "sine", 0.1); tone(2640, t, 0.35, "sine", 0.05); }); },
    jab: function () { noise(0, 0.07, 0.18); },
    smash: function () { noise(0, 0.22, 0.7); tone(150, 0, 0.35, "sine", 0.6, 40); tone(880, 0.3, 0.12, "square", 0.08); tone(1175, 0.42, 0.12, "square", 0.08); tone(1568, 0.54, 0.4, "square", 0.08); },
    lost: function () { tone(392, 0, 0.3, "sawtooth", 0.12, 370); tone(370, 0.32, 0.3, "sawtooth", 0.12, 349); tone(349, 0.64, 0.3, "sawtooth", 0.12, 330); tone(330, 0.96, 0.9, "sawtooth", 0.12, 196); },
  };

  function build(el) {
    if (el.dataset.built) return;
    el.dataset.built = "1";
    el.innerHTML =
      '<div class="arena__floor"></div>' +
      '<div class="arena__monster">' + MONSTER + "</div>" +
      '<div class="arena__pow">' + burst() + '<span class="block">POW</span></div>' +
      '<div class="arena__glove">' + GLOVE + "</div>" +
      '<div class="arena__banner block"></div>' +
      '<div class="arena__words"></div>';
  }
  function banner(el, text, kind) {
    var b = el.querySelector(".arena__banner");
    b.className = "arena__banner block" + (kind ? " block--" + kind : "");
    b.textContent = text;
    b.style.animation = "none"; void b.offsetWidth; b.style.animation = "";
  }
  function spit(el) {
    var w = document.createElement("span");
    w.className = "arena__word";
    w.textContent = WORDS[Math.floor(Math.random() * WORDS.length)];
    w.style.setProperty("--dx", (Math.random() * 30 - 6).toFixed(0) + "%");
    w.style.setProperty("--tilt", (Math.random() * 16 - 8).toFixed(0) + "deg");
    el.querySelector(".arena__words").append(w);
    setTimeout(function () { w.remove(); }, 1500);
  }
  function clear(el) {
    clearInterval(el._spit); clearInterval(el._jab); clearTimeout(el._t1); clearTimeout(el._t2);
  }

  function start(el) {
    if (REDUCED) return;
    build(el); clear(el);
    el.hidden = false;
    el._started = Date.now();
    el.dataset.state = "bell";
    banner(el, "DING DING", "");
    sfx.bell();
    el._t1 = setTimeout(function () {
      el.dataset.state = "spar";
      banner(el, "", "");
      spit(el);
      el._spit = setInterval(function () { spit(el); }, 620);
      el._jab = setInterval(function () { sfx.jab(); }, 700);
    }, 800);
  }

  /** Resolves when the ending has played. ship true: the glove wins. */
  function finish(el, ship) {
    if (REDUCED || !el._started) return Promise.resolve();
    var wait = Math.max(0, MIN_SPAR_MS - (Date.now() - el._started));
    return new Promise(function (resolve) {
      el._t2 = setTimeout(function () {
        clear(el);
        if (ship) {
          el.dataset.state = "ko";
          setTimeout(function () { sfx.smash(); banner(el, "K.O.", "win"); }, 300);
          setTimeout(resolve, 1500);
        } else {
          el.dataset.state = "lost";
          banner(el, "SLOP WINS", "lose");
          sfx.lost();
          spit(el);
          el._spit = setInterval(function () { spit(el); }, 900);
          setTimeout(resolve, 1500);
        }
      }, wait);
    });
  }
  function stop(el) { clear(el); el.hidden = true; el.dataset.state = ""; el._started = 0; }

  window.Bout = {
    start: start, finish: finish, stop: stop,
    muted: muted,
    /** Browsers keep sound off until the page is touched once. */
    unlock: function () { var c = audio(); if (c && c.state === "suspended") c.resume(); },
    toggleMute: function () { try { localStorage.setItem("shipcheck-mute", muted() ? "0" : "1"); } catch (e) {} return muted(); },
  };
})();
