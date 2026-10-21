// Progressive enhancement for the drawing set: contour survey, schedule filters, theme, copy, nav.
(function () {
  "use strict";
  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function css(name) { return getComputedStyle(root).getPropertyValue(name).trim(); }
  function isDark() {
    if (root.dataset.theme) return root.dataset.theme === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  function rgb(color) {
    var m = color.match(/^#([0-9a-f]{6})$/i);
    if (m) { var n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
    m = color.match(/(\d+)\D+(\d+)\D+(\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : [200, 80, 20];
  }

  /* ---------------- contour survey ---------------- */
  var canvas = document.getElementById("topo");
  var dataEl = document.getElementById("survey-data");
  var readout = document.getElementById("readout");
  if (canvas && dataEl) survey(JSON.parse(dataEl.textContent));

  function survey(data) {
    var days = data.days || [];
    if (!days.length) return;
    var stakes = data.stakes || [];
    var weeks = Math.ceil(days.length / 7);
    var restText = readout ? readout.textContent : "";
    var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // Elevation field: each day is a smoothed mound with height sqrt(count), so one huge day
    // does not flatten the rest of the year.
    var NX = 240, NY = 64, SX = 1.9, SY = 1.05;
    var field = new Float32Array(NX * NY), max = 0, peak = { i: 0, j: 0 };
    var heights = days.map(function (d) { return Math.sqrt(d[1]); });
    for (var j = 0; j < NY; j++) {
      var gy = -0.5 + (j / (NY - 1)) * 7;
      for (var i = 0; i < NX; i++) {
        var gx = -0.5 + (i / (NX - 1)) * weeks, v = 0;
        var w0 = Math.max(0, Math.floor(gx - 5)), w1 = Math.min(weeks - 1, Math.ceil(gx + 5));
        for (var w = w0; w <= w1; w++) {
          for (var d = 0; d < 7; d++) {
            var k = w * 7 + d;
            if (k >= heights.length || !heights[k]) continue;
            var dx = (gx - w) / SX, dy = (gy - d) / SY;
            v += heights[k] * Math.exp(-(dx * dx + dy * dy));
          }
        }
        field[j * NX + i] = v;
        if (v > max) { max = v; peak = { i: i, j: j }; }
      }
    }
    var LEVELS = 18, interval = max / (LEVELS + 1);

    // Marching squares, one segment list per contour level, in field-grid coordinates.
    var levels = [];
    for (var L = 1; L <= LEVELS; L++) levels.push(march(L * interval));
    function march(t) {
      var segs = [];
      for (var j = 0; j < NY - 1; j++) {
        for (var i = 0; i < NX - 1; i++) {
          var a = field[j * NX + i], b = field[j * NX + i + 1], c = field[(j + 1) * NX + i + 1], d = field[(j + 1) * NX + i];
          var idx = (a > t ? 8 : 0) | (b > t ? 4 : 0) | (c > t ? 2 : 0) | (d > t ? 1 : 0);
          if (idx === 0 || idx === 15) continue;
          var top = [i + (t - a) / (b - a), j], right = [i + 1, j + (t - b) / (c - b)];
          var bottom = [i + (t - d) / (c - d), j + 1], left = [i, j + (t - a) / (d - a)];
          switch (idx) {
            case 1: case 14: segs.push(left, bottom); break;
            case 2: case 13: segs.push(bottom, right); break;
            case 3: case 12: segs.push(left, right); break;
            case 4: case 11: segs.push(top, right); break;
            case 6: case 9: segs.push(top, bottom); break;
            case 7: case 8: segs.push(left, top); break;
            case 5: segs.push(left, top, bottom, right); break;
            case 10: segs.push(left, bottom, top, right); break;
          }
        }
      }
      return segs;
    }

    var ctx = canvas.getContext("2d");
    var base = document.createElement("canvas"), bctx = base.getContext("2d");
    var tint = document.createElement("canvas"); tint.width = NX; tint.height = NY;
    var W = 0, H = 0, dpr = 1, pad = { l: 34, r: 14, t: 14, b: 26 };
    var hover = null, revealed = reduceMotion ? LEVELS : 0;

    function fx(i) { return pad.l + (i / (NX - 1)) * (W - pad.l - pad.r); }
    function fy(j) { return pad.t + (j / (NY - 1)) * (H - pad.t - pad.b); }
    function wx(week) { return fx(((week + 0.5) / weeks) * (NX - 1)); }
    function dayY(day) { return fy(((day + 0.5) / 7) * (NY - 1)); }

    function paintTint() {
      var c = rgb(css("--flag")), img = bctx.createImageData(NX, NY);
      for (var k = 0; k < NX * NY; k++) {
        var e = field[k] / max;
        img.data[k * 4] = c[0]; img.data[k * 4 + 1] = c[1]; img.data[k * 4 + 2] = c[2];
        img.data[k * 4 + 3] = Math.round(Math.pow(e, 1.6) * (isDark() ? 120 : 92));
      }
      tint.getContext("2d").putImageData(img, 0, 0);
    }

    function render() {
      var ink = css("--ink"), ink2 = css("--ink-2"), hair = css("--hair"), flag = css("--flag"), sheet = css("--sheet");
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bctx.clearRect(0, 0, W, H);
      bctx.imageSmoothingEnabled = true;
      bctx.drawImage(tint, pad.l, pad.t, W - pad.l - pad.r, H - pad.t - pad.b);

      // survey grid: a line every four weeks, month labels, weekday labels
      bctx.font = "500 9.5px 'IBM Plex Mono', monospace";
      bctx.textBaseline = "middle";
      bctx.strokeStyle = hair; bctx.lineWidth = 1;
      var lastMonth = -1, lastLabel = -99, narrow = W < 600;
      for (var w = 0; w < weeks; w++) {
        var date = new Date(days[Math.min(w * 7, days.length - 1)][0] + "T00:00:00Z");
        var m = date.getUTCMonth();
        if (m !== lastMonth) {
          var x = Math.round(wx(w)) + 0.5;
          bctx.beginPath(); bctx.moveTo(x, pad.t); bctx.lineTo(x, H - pad.b); bctx.stroke();
          bctx.fillStyle = ink2; bctx.textAlign = "left";
          var name = date.toLocaleDateString("en-US", { month: narrow ? "narrow" : "short", timeZone: "UTC" }).toUpperCase();
          if (x < W - 20 && x - lastLabel > (narrow ? 12 : 30)) { bctx.fillText(name, x + 3, H - pad.b + 13); lastLabel = x; }
          lastMonth = m;
        }
      }
      bctx.textAlign = "right"; bctx.fillStyle = ink2;
      [1, 3, 5].forEach(function (d) { bctx.fillText(DOW[d].toUpperCase(), pad.l - 6, dayY(d)); });
      bctx.strokeStyle = ink; bctx.lineWidth = 1.2;
      bctx.strokeRect(pad.l + 0.5, pad.t + 0.5, W - pad.l - pad.r - 1, H - pad.t - pad.b - 1);

      // contours: every fourth is an index contour, heavier and labelled
      for (var L = 0; L < Math.min(revealed, LEVELS); L++) {
        var segs = levels[L], index = (L + 1) % 4 === 0;
        bctx.strokeStyle = index ? ink : ink2;
        bctx.globalAlpha = index ? 0.95 : 0.55;
        bctx.lineWidth = index ? 1.5 : 0.8;
        bctx.beginPath();
        for (var s = 0; s < segs.length; s += 2) {
          bctx.moveTo(fx(segs[s][0]), fy(segs[s][1]));
          bctx.lineTo(fx(segs[s + 1][0]), fy(segs[s + 1][1]));
        }
        bctx.stroke();
        if (index && segs.length > 40 && W >= 600) {
          var p = segs[Math.floor(segs.length * 0.37) & ~1];
          var label = String(Math.round(((L + 1) / (LEVELS + 1)) * 100));
          bctx.globalAlpha = 1;
          bctx.font = "600 9px 'IBM Plex Mono', monospace"; bctx.textAlign = "center";
          var lx = fx(p[0]), ly = fy(p[1]);
          bctx.fillStyle = sheet; bctx.fillRect(lx - 9, ly - 6, 18, 12);
          bctx.fillStyle = ink; bctx.fillText(label, lx, ly + 0.5);
        }
      }
      bctx.globalAlpha = 1;
      var narrow = W < 600;

      if (revealed >= LEVELS) {
        // summit benchmark
        var px = fx(peak.i), py = fy(peak.j);
        bctx.strokeStyle = ink; bctx.lineWidth = 1.3;
        bctx.beginPath(); bctx.moveTo(px - 6, py); bctx.lineTo(px + 6, py); bctx.moveTo(px, py - 6); bctx.lineTo(px, py + 6); bctx.stroke();
        bctx.beginPath(); bctx.arc(px, py, 3.5, 0, Math.PI * 2); bctx.stroke();
        bctx.font = "600 9.5px 'IBM Plex Mono', monospace"; bctx.textAlign = "left"; bctx.fillStyle = ink;
        if (!narrow) bctx.fillText("BM · SUMMIT EL. 100", Math.min(px + 9, W - 130), py - 9);

        // survey stakes, labels nudged upward until they stop colliding
        var placed = [];
        bctx.font = "700 11px 'Big Shoulders Display', sans-serif";
        stakes.forEach(function (st) {
          var x = wx(st.week), y = dayY(st.weekday);
          bctx.fillStyle = flag;
          bctx.beginPath(); bctx.moveTo(x, y - 9); bctx.lineTo(x + 5, y + 1); bctx.lineTo(x - 5, y + 1); bctx.closePath(); bctx.fill();
          if (narrow) return; // triangles only; the readout names each stake on touch
          var tw = bctx.measureText(st.mark).width + 6, ty = y - 15, tries = 0;
          while (tries++ < 8 && placed.some(function (r) { return Math.abs(r.x - x) < (r.w + tw) / 2 && Math.abs(r.y - ty) < 12; })) ty -= 12;
          if (ty < pad.t + 6) ty = y + 13;
          placed.push({ x: x, y: ty, w: tw });
          bctx.fillStyle = sheet; bctx.fillRect(x - tw / 2, ty - 6, tw, 12);
          bctx.fillStyle = flag; bctx.textAlign = "center"; bctx.fillText(st.mark, x, ty + 0.5);
        });
      }
      blit();
    }

    function blit() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0);
      if (!hover) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var x = wx(hover.week), y = dayY(hover.day);
      ctx.strokeStyle = css("--flag"); ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x + 0.5, pad.t); ctx.lineTo(x + 0.5, H - pad.b); ctx.moveTo(pad.l, y + 0.5); ctx.lineTo(W - pad.r, y + 0.5); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
    }

    function size() {
      var r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(280, r.width); H = Math.max(200, r.height);
      pad.l = W < 520 ? 28 : 34;
      canvas.width = base.width = Math.round(W * dpr);
      canvas.height = base.height = Math.round(H * dpr);
      var cap = canvas.closest("figure").querySelector("figcaption");
      if (cap) cap.style.setProperty("--scale-w", Math.round(wx(4) - wx(0)) + "px");
      paintTint(); render();
    }

    function pick(ev) {
      var r = canvas.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
      var week = Math.round(((x - pad.l) / (W - pad.l - pad.r)) * weeks - 0.5);
      var day = Math.round(((y - pad.t) / (H - pad.t - pad.b)) * 7 - 0.5);
      week = Math.max(0, Math.min(weeks - 1, week)); day = Math.max(0, Math.min(6, day));
      var k = Math.min(days.length - 1, week * 7 + day);
      hover = { week: Math.floor(k / 7), day: k % 7 };
      var entry = days[k], count = entry[1];
      var fi = Math.round(((hover.week + 0.5) / weeks) * (NX - 1)), fj = Math.round(((hover.day + 0.5) / 7) * (NY - 1));
      var el = Math.round((field[fj * NX + fi] / max) * 100);
      var text = DOW[hover.day] + " " + entry[0] + " · " + count.toLocaleString("en-US") + (count === 1 ? " contribution" : " contributions") + " · EL. " + el;
      var near = stakes.filter(function (s) { return Math.abs(s.week - hover.week) <= 1 && Math.abs(s.weekday - hover.day) <= 1; })[0];
      if (near) text += " · stake " + near.mark + ", " + near.title + " started " + near.date;
      if (readout) readout.textContent = text;
      blit();
    }
    canvas.addEventListener("pointermove", pick);
    canvas.addEventListener("pointerdown", pick);
    canvas.addEventListener("pointerleave", function () { hover = null; if (readout) readout.textContent = restText; blit(); });

    // One orchestrated moment: contours are surveyed in from the valley floor to the summit.
    function reveal() {
      if (reduceMotion) return;
      var t0 = null;
      function step(t) {
        if (t0 === null) t0 = t;
        var p = Math.min(1, (t - t0) / 1700), e = 1 - Math.pow(1 - p, 3);
        revealed = Math.ceil(e * LEVELS);
        render();
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    }

    var started = false;
    function start() {
      size();
      if (started) return;
      started = true;
      if ("IntersectionObserver" in window && !reduceMotion) {
        revealed = 0; render();
        var io = new IntersectionObserver(function (entries) {
          if (entries[0].isIntersecting) { io.disconnect(); reveal(); }
        }, { threshold: 0.25 });
        io.observe(canvas);
        // never leave the survey blank if the observer does not fire (thumbnails, print-like captures)
        setTimeout(function () { if (revealed === 0) { io.disconnect(); revealed = LEVELS; render(); } }, 2500);
      } else { revealed = LEVELS; render(); }
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(start); else start();
    if ("ResizeObserver" in window) new ResizeObserver(function () { if (started) size(); }).observe(canvas);
    survey.redraw = function () { if (started) { paintTint(); render(); } };
  }

  /* ---------------- theme ---------------- */
  var themeBtn = document.getElementById("theme");
  function syncThemeLabel() {
    if (!themeBtn) return;
    var dark = isDark();
    themeBtn.querySelector("span").textContent = dark ? "Vellum" : "Blueprint";
    themeBtn.setAttribute("aria-pressed", String(dark));
  }
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var next = isDark() ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (e) { /* storage blocked */ }
      syncThemeLabel();
      if (survey.redraw) survey.redraw();
    });
    syncThemeLabel();
  }
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
    syncThemeLabel();
    if (survey.redraw) survey.redraw();
  });

  /* ---------------- schedule filters ---------------- */
  var chips = document.querySelectorAll(".chip[data-f]");
  var rows = document.querySelectorAll("#sched-body tr");
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var f = chip.dataset.f;
      chips.forEach(function (c) { c.setAttribute("aria-pressed", String(c === chip)); });
      rows.forEach(function (r) { r.hidden = !(f === "all" || r.dataset.d === f); });
    });
  });

  /* ---------------- copy email ---------------- */
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var el = document.getElementById(btn.dataset.copy);
      var text = el.textContent.trim();
      function done(ok) { btn.textContent = ok ? "Copied" : "Selected"; setTimeout(function () { btn.textContent = "Copy"; }, 1600); }
      function selectIt() { var r = document.createRange(); r.selectNodeContents(el); var s = getSelection(); s.removeAllRanges(); s.addRange(r); done(false); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, selectIt);
      else selectIt();
    });
  });

  /* ---------------- current sheet in the set bar ---------------- */
  var links = {};
  document.querySelectorAll(".setbar nav a").forEach(function (a) { links[a.getAttribute("href").slice(1)] = a; });
  if ("IntersectionObserver" in window) {
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        Object.keys(links).forEach(function (id) { links[id].classList.toggle("on", id === e.target.id); });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    document.querySelectorAll(".sheet[id]").forEach(function (s) { seen.observe(s); });
  }
})();
