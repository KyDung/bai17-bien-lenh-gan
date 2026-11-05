"use strict";
/* =====================================================================
   Câu chuyện: từ công tắc đến Python
   Tranh minh họa tối giản vẽ bằng SVG + JS thuần (không cần thư viện).
   Mỗi "cảnh" là một hàm async: vẽ hình, rồi chạy hoạt cảnh lặp lại.
   ===================================================================== */
(() => {
  const NS = "http://www.w3.org/2000/svg";
  const MONO = 'Consolas,"Courier New",monospace';
  const INK = "#26304a";

  /* ---------- tiện ích vẽ SVG ---------- */
  const S = (tag, a = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in a) e.setAttribute(k, a[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const G = (parent, a) => S("g", a, parent);
  const T = (parent, x, y, str, a = {}) => {
    const t = S("text", Object.assign({ x, y }, a), parent);
    t.textContent = str;
    return t;
  };
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lin = t => t;
  const ease = t => (t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const place = (g, x, y, r = 0, s = 1) => {
    g._p = [x, y, r, s];
    g.setAttribute("transform", `translate(${x} ${y}) rotate(${r}) scale(${Math.max(s, 0.001)})`);
    return g;
  };
  const rnd = (a, b) => a + Math.random() * (b - a);

  /* ---------- bối cảnh chạy một cảnh (hủy được khi chuyển cảnh) ---------- */
  class Cancel { }
  function makeCtx(svg) {
    const c = { svg, dead: false };
    // Promise bị hủy khi chuyển cảnh: gắn sẵn catch rỗng để không báo "Uncaught (in promise)"
    // khi hoạt cảnh nền không được await (await vẫn nhận được lỗi Cancel như bình thường).
    const quiet = p => { p.catch(() => { }); return p; };
    c.wait = ms => quiet(new Promise((res, rej) => setTimeout(() => (c.dead ? rej(new Cancel()) : res()), ms)));
    c.tween = (ms, fn, ez = ease) => quiet(new Promise((res, rej) => {
      const t0 = performance.now();
      const f = now => {
        if (c.dead) return rej(new Cancel());
        const t = ms <= 0 ? 1 : Math.min(1, (now - t0) / ms);
        fn(ez(t), t);
        t < 1 ? requestAnimationFrame(f) : res();
      };
      f(t0);
    }));
    c.mv = (g, x, y, ms, r, s, ez) => {
      const [x0, y0, r0, s0] = g._p || [0, 0, 0, 1];
      const r1 = r ?? r0, s1 = s ?? s0;
      return c.tween(ms, t => place(g, lerp(x0, x, t), lerp(y0, y, t), lerp(r0, r1, t), lerp(s0, s1, t)), ez);
    };
    c.fade = (el, from, to, ms) => c.tween(ms, t => el.setAttribute("opacity", lerp(from, to, t)));
    c.bg = fn => { Promise.resolve().then(fn).catch(e => { if (!(e instanceof Cancel)) console.error(e); }); };
    return c;
  }

  /* ---------- nhân vật ---------- */
  const MOODS = {
    smile: { d: "M-8 -118 Q0 -110 8 -118" },
    grin: { d: "M-10 -119 Q0 -101 10 -119 Z", f: "#8a2b3a" },
    flat: { d: "M-6 -115 L6 -115" },
    worry: { d: "M-8 -111 Q0 -119 8 -111", b: [-141, -146], drop: 1 },
    oh: { d: "M-4 -116 a4 5.5 0 1 0 8 0 a4 5.5 0 1 0 -8 0 Z", f: "#8a2b3a", b: [-145, -145] },
    think: { d: "M-6 -114 Q2 -117 8 -114", b: [-142, -145] }
  };

  function person(parent, opt = {}) {
    const o = Object.assign({
      x: 0, y: 0, s: 1, skin: "#f3c6a1", shirt: "#5b5bd6", pants: "#33415c", hair: "#2b2d42",
      style: "short", glasses: false, bust: false, beard: false, coat: false, arm: 78
    }, opt);
    const root = G(parent), body = G(root);
    place(root, o.x, o.y, 0, o.s);
    const P = { root, body, o, hand: { l: [0, 0], r: [0, 0] }, legs: [], fx: 1 };
    const add = (tag, a) => S(tag, a, body);

    if (o.style === "long" || o.style === "pony") add("path", { d: "M-27 -132 Q-34 -84 -22 -78 L22 -78 Q34 -84 27 -132Z", fill: o.hair });
    if (o.style === "pony") add("path", { d: "M22 -150 Q58 -142 46 -96 Q42 -122 20 -128Z", fill: o.hair });
    if (!o.bust) [-1, 1].forEach(sg => {
      const g = G(body), px = sg * 11, py = -46;
      S("rect", { x: px - 8, y: py, width: 16, height: 44, rx: 8, fill: o.pants }, g);
      S("ellipse", { cx: px + 3, cy: -3, rx: 12, ry: 5.5, fill: "#2a2a3a" }, g);
      P.legs.push({ g, px, py });
    });
    add("rect", { x: -27, y: -106, width: 54, height: o.bust ? 92 : 68, rx: 18, fill: o.coat ? "#fff" : o.shirt });
    if (o.coat) {
      add("path", { d: "M-9 -106 L0 -86 L9 -106Z", fill: o.shirt });
      add("line", { x1: 0, y1: -86, x2: 0, y2: -42, stroke: "#d6dbee", "stroke-width": 2 });
    }
    add("rect", { x: -7, y: -114, width: 14, height: 14, fill: o.skin });
    add("circle", { cx: -25, cy: -128, r: 5, fill: o.skin });
    add("circle", { cx: 25, cy: -128, r: 5, fill: o.skin });
    add("circle", { cx: 0, cy: -130, r: 25, fill: o.skin });

    const capHair = "M-26 -130 Q-30 -161 0 -161 Q30 -161 26 -130 Q18 -146 0 -146 Q-18 -146 -26 -130Z";
    if (o.style === "bald") {
      add("circle", { cx: -25, cy: -134, r: 6, fill: o.hair });
      add("circle", { cx: 25, cy: -134, r: 6, fill: o.hair });
    } else add("path", { d: capHair, fill: o.hair });
    if (o.style === "bun") add("circle", { cx: 0, cy: -166, r: 11, fill: o.hair });
    if (o.beard) add("path", { d: "M-24 -126 Q-26 -98 0 -98 Q26 -98 24 -126 Q16 -110 0 -110 Q-16 -110 -24 -126Z", fill: o.hair, opacity: .6 });
    add("circle", { cx: -14, cy: -120, r: 5, fill: "#ff8aa0", opacity: .35 });
    add("circle", { cx: 14, cy: -120, r: 5, fill: "#ff8aa0", opacity: .35 });

    const eyes = add("g", { style: "transform-box:fill-box;transform-origin:center;transition:transform .05s" });
    S("circle", { cx: -9, cy: -130, r: 3.2, fill: "#1c1c2b" }, eyes);
    S("circle", { cx: 9, cy: -130, r: 3.2, fill: "#1c1c2b" }, eyes);
    if (o.glasses) {
      add("circle", { cx: -10, cy: -130, r: 9, fill: "#ffffff55", stroke: INK, "stroke-width": 2.4 });
      add("circle", { cx: 10, cy: -130, r: 9, fill: "#ffffff55", stroke: INK, "stroke-width": 2.4 });
      add("line", { x1: -1, y1: -130, x2: 1, y2: -130, stroke: INK, "stroke-width": 2.4 });
    }
    const brows = add("g", { stroke: o.hair === "#f5f5f5" ? "#888" : o.hair, "stroke-width": 2.6, "stroke-linecap": "round" });
    const bl = S("line", {}, brows), br = S("line", {}, brows);
    const mouth = add("path", { stroke: "#7a2336", "stroke-width": 2.8, "stroke-linecap": "round", "stroke-linejoin": "round", fill: "none" });
    const drop = add("path", { d: "M29 -142 q-7 10 0 14 q7 -4 0 -14z", fill: "#7dd3fc" });

    P.mood = m => {
      const d = MOODS[m] || MOODS.smile;
      mouth.setAttribute("d", d.d);
      mouth.setAttribute("fill", d.f || "none");
      drop.style.display = d.drop ? "" : "none";
      brows.style.display = d.b ? "" : "none";
      if (d.b) {
        bl.setAttribute("x1", -16); bl.setAttribute("y1", d.b[0]); bl.setAttribute("x2", -4); bl.setAttribute("y2", d.b[1]);
        br.setAttribute("x1", 16); br.setAttribute("y1", d.b[0]); br.setAttribute("x2", 4); br.setAttribute("y2", d.b[1]);
      }
    };
    P.autoBlink = c => c.bg(async () => {
      for (; ;) {
        await c.wait(rnd(1800, 4200));
        eyes.style.transform = "scaleY(.1)";
        await c.wait(110);
        eyes.style.transform = "";
      }
    });

    const arms = {};
    ["l", "r"].forEach(sd => {
      const sx = (sd === "l" ? -1 : 1) * 25, sy = -92;
      const line = add("line", { x1: sx, y1: sy, x2: sx, y2: sy, stroke: o.coat ? "#e3e7f6" : o.shirt, "stroke-width": 12, "stroke-linecap": "round" });
      const hand = add("circle", { r: 7, fill: o.skin });
      arms[sd] = { line, hand, sx, sy };
    });
    P.armTo = (sd, x, y) => {
      const a = arms[sd];
      const dx = x - a.sx, dy = y - a.sy, d = Math.hypot(dx, dy) || 1, L = Math.min(d, o.arm);
      const ex = a.sx + dx / d * L, ey = a.sy + dy / d * L;
      a.line.setAttribute("x2", ex); a.line.setAttribute("y2", ey);
      a.hand.setAttribute("cx", ex); a.hand.setAttribute("cy", ey);
      P.hand[sd] = [ex, ey];
    };
    P.rest = sd => { if (!sd) { P.rest("l"); P.rest("r"); return; } P.armTo(sd, (sd === "l" ? -1 : 1) * 34, -20); };
    P.armMove = (c, sd, x, y, ms) => {
      const [x0, y0] = P.hand[sd];
      return c.tween(ms, t => P.armTo(sd, lerp(x0, x, t), lerp(y0, y, t)));
    };
    P.toLocal = (wx, wy) => { const [x, y, , s] = root._p; return [(wx - x) / s * P.fx, (wy - y) / s]; };
    P.reach = (c, sd, wx, wy, ms) => { const [lx, ly] = P.toLocal(wx, wy); return P.armMove(c, sd, lx, ly, ms); };
    P.face = dir => { P.fx = dir; body.setAttribute("transform", `scale(${dir} 1)`); };
    const setLeg = (i, a) => { const l = P.legs[i]; if (l) l.g.setAttribute("transform", `rotate(${a} ${l.px} ${l.py})`); };
    P.walk = (c, x, ms) => {
      const [x0, y0, r, s] = root._p;
      const n = Math.max(2, Math.round(ms / 330));
      return c.tween(ms, t => {
        const w = Math.sin(t * n * Math.PI);
        place(root, lerp(x0, x, t), y0 - Math.abs(w) * 5, r, s);
        setLeg(0, w * 24); setLeg(1, -w * 24);
      }, lin).then(() => { place(root, x, y0, r, s); setLeg(0, 0); setLeg(1, 0); });
    };
    P.hop = (c, x, y, ms) => {
      const [x0, y0, r, s] = root._p;
      return c.tween(ms, t => place(root, lerp(x0, x, t), lerp(y0, y, t) - Math.sin(t * Math.PI) * 46, r, s));
    };
    P.mood("smile");
    P.rest();
    return P;
  }

  /* ---------- bóng nói ---------- */
  function bubble(c, parent, x, y, lines, o = {}) {
    lines = [].concat(lines);
    const fs = o.fs || 17, lh = fs * 1.35;
    const w = Math.max(...lines.map(l => [...l].length)) * fs * (o.mono ? .6 : .52) + 30;
    const h = lines.length * lh + 16;
    let dx = o.dx || 0;
    let cx = clamp(x + dx, 8 + w / 2, 792 - w / 2);
    dx = clamp(cx - x, -(w / 2 - 20), w / 2 - 20);
    const g = G(parent);
    S("rect", { x: dx - w / 2, y: -h - 16, width: w, height: h, rx: 14, fill: "#fff", stroke: INK, "stroke-width": 2.5 }, g);
    S("path", { d: "M-9 -17 L0 0 L9 -17", fill: "#fff", stroke: INK, "stroke-width": 2.5, "stroke-linejoin": "round" }, g);
    S("line", { x1: -7, y1: -16.5, x2: 7, y2: -16.5, stroke: "#fff", "stroke-width": 4 }, g);
    lines.forEach((l, i) => T(g, dx, -h - 16 + 8 + fs + i * lh - 2, l, {
      "text-anchor": "middle", "font-size": fs, "font-weight": 700, fill: INK, "font-family": o.mono ? MONO : "inherit"
    }));
    place(g, x, y, 0, .01);
    c.bg(() => c.tween(240, t => place(g, x, y, 0, t), easeBack));
    return g;
  }

  /* ---------- màn hình dòng lệnh ---------- */
  function term(c, parent, o) {
    const { x, y, w, h } = o;
    const fs = o.fs || 16, lh = o.lh || fs * 1.45, pad = o.pad ?? 12, fg = o.fg || "#7dffb0";
    const g = G(parent);
    S("rect", { x, y, width: w, height: h, rx: o.rx ?? 8, fill: o.bg || "#0e1426" }, g);
    const maxRows = Math.max(1, Math.floor((h - pad * 2) / lh));
    let rows = [], cur = null;
    const cursor = S("rect", { width: fs * .55, height: fs * 1.1, fill: fg }, g);
    S("animate", { attributeName: "opacity", values: "1;1;0;0", dur: "1s", repeatCount: "indefinite" }, cursor);
    const base = i => y + pad + fs + i * lh;
    const textLen = el => { try { return el.textContent ? el.getComputedTextLength() : 0; } catch (e) { return el.textContent.length * fs * .55; } };
    const curPos = () => {
      const i = cur ? rows.indexOf(cur) : 0;
      cursor.setAttribute("x", x + pad + (cur ? textLen(cur) : 0) + 1);
      cursor.setAttribute("y", base(Math.max(0, i)) - fs * .95);
    };
    const layout = () => rows.forEach((r, i) => r.setAttribute("y", base(i)));
    const nl = fill => {
      cur = T(g, x + pad, 0, "", { fill: fill || fg, "font-size": fs, "font-family": MONO, style: "white-space:pre" });
      rows.push(cur);
      if (rows.length > maxRows) rows.shift().remove();
      layout(); curPos();
    };
    const api = {
      g,
      clear() { rows.forEach(r => r.remove()); rows = []; cur = null; curPos(); },
      async type(str, ms = 60, onKey) {
        if (!cur) nl();
        for (const ch of str) { cur.textContent += ch; curPos(); onKey && onKey(ch); await c.wait(ms); }
      },
      async line(str, ms = 60, onKey, fill) { nl(fill); await api.type(str, ms, onKey); },
      print(str, fill) { nl(fill); cur.textContent = str; curPos(); },
      async erase(n, ms = 50) { for (let i = 0; i < n && cur && cur.textContent; i++) { cur.textContent = cur.textContent.slice(0, -1); curPos(); await c.wait(ms); } }
    };
    curPos();
    return api;
  }

  /* ---------- phòng / nền ---------- */
  function room(svg, wall, floor, fy = 355) {
    S("rect", { width: 800, height: 450, fill: wall }, svg);
    S("rect", { y: fy, width: 800, height: 450 - fy, fill: floor }, svg);
    S("rect", { y: fy, width: 800, height: 6, fill: "#000", opacity: .06 }, svg);
  }
  function desk(svg, x, y, w, topH = 16, color = "#b98355", front = "#9c6b43") {
    S("rect", { x, y: y + topH, width: w, height: 450 - y - topH, fill: front }, svg);
    S("rect", { x, y, width: w, height: topH, rx: 4, fill: color }, svg);
  }
  const lamp = (parent, cx, cy, r, color, dur) => {
    const l = S("circle", { cx, cy, r, fill: color }, parent);
    S("animate", { attributeName: "opacity", values: "1;.25;1", dur: dur + "s", begin: "-" + rnd(0, dur).toFixed(2) + "s", repeatCount: "indefinite" }, l);
    return l;
  };

  /* =====================================================================
     CẢNH 1 · Công tắc
     ===================================================================== */
  async function s1(c) {
    const svg = c.svg;
    room(svg, "#e8ecf9", "#c9d1ec", 352);

    // tủ máy tính khổng lồ
    const m = G(svg);
    S("rect", { x: 596, y: 50, width: 190, height: 310, rx: 14, fill: "#7f8bbd" }, m);
    S("rect", { x: 608, y: 62, width: 166, height: 286, rx: 9, fill: "#a9b3da" }, m);
    const lamps = [];
    for (let r = 0; r < 5; r++) for (let k = 0; k < 6; k++) lamps.push(S("circle", { cx: 632 + k * 25, cy: 92 + r * 24, r: 7, fill: "#3b4476" }, m));
    [[656, 275], [728, 275]].forEach(([cx, cy]) => {
      S("circle", { cx, cy, r: 30, fill: "#2e355f" }, m);
      const sp = G(m);
      for (let a = 0; a < 3; a++) S("line", { x1: cx, y1: cy - 24, x2: cx, y2: cy + 24, stroke: "#c9d1ec", "stroke-width": 5, "stroke-linecap": "round", transform: `rotate(${a * 60} ${cx} ${cy})` }, sp);
      S("animateTransform", { attributeName: "transform", type: "rotate", from: `0 ${cx} ${cy}`, to: `360 ${cx} ${cy}`, dur: "5s", repeatCount: "indefinite" }, sp);
      S("circle", { cx, cy, r: 6, fill: "#ffd43b" }, m);
    });
    S("path", { d: "M598 330 C570 372 560 300 540 340", fill: "none", stroke: "#4a5486", "stroke-width": 8, "stroke-linecap": "round" }, svg);
    S("path", { d: "M598 300 C575 330 566 280 540 310", fill: "none", stroke: "#e0605a", "stroke-width": 6, "stroke-linecap": "round" }, svg);
    c.bg(async () => { for (; ;) { await c.wait(300); lamps.forEach(l => l.setAttribute("fill", Math.random() < .35 ? "#ffd43b" : "#3b4476")); } });

    // bảng hiển thị
    S("rect", { x: 160, y: 14, width: 240, height: 92, rx: 14, fill: "#1a2040" }, svg);
    T(svg, 280, 34, "MÁY ĐỌC ĐƯỢC", { "text-anchor": "middle", "font-size": 12, "font-weight": 700, fill: "#8890bd", "letter-spacing": 2 });
    const binTxt = T(svg, 280, 70, "00000000", { "text-anchor": "middle", "font-size": 36, "font-family": MONO, "font-weight": 700, fill: "#7dffb0", "letter-spacing": 3 });
    const decTxt = T(svg, 280, 97, "= 0", { "text-anchor": "middle", "font-size": 20, "font-weight": 700, fill: "#ffd43b" });

    // nhân viên (ngồi sau bàn điều khiển)
    const P = person(svg, { x: 349, y: 322, s: 1.3, bust: true, coat: true, glasses: true, arm: 80 });
    P.mood("worry"); P.autoBlink(c);

    // bàn điều khiển
    S("rect", { x: 140, y: 258, width: 420, height: 142, rx: 12, fill: "#46507f" }, svg);
    S("rect", { x: 140, y: 258, width: 420, height: 34, rx: 12, fill: "#6f7ab5" }, svg);
    const xs = Array.from({ length: 8 }, (_, i) => 195 + i * 44);
    const bits = Array(8).fill(0);
    const sw = xs.map((x, i) => {
      const lp = S("circle", { cx: x, cy: 275, r: 8, fill: "#3a4270", stroke: "#2a3158", "stroke-width": 2 }, svg);
      S("rect", { x: x - 15, y: 304, width: 30, height: 56, rx: 13, fill: "#2a3158" }, svg);
      const lever = S("rect", { x: x - 11, y: 330, width: 22, height: 26, rx: 9, fill: "#8f9ac9" }, svg);
      const txt = T(svg, x, 386, "0", { "text-anchor": "middle", "font-size": 20, "font-family": MONO, "font-weight": 700, fill: "#c9d1ec" });
      const hit = S("rect", { x: x - 22, y: 262, width: 44, height: 130, fill: "transparent", style: "cursor:pointer" }, svg);
      return { lp, lever, txt, hit };
    });
    const setLever = (i, t) => sw[i].lever.setAttribute("y", lerp(330, 308, t));
    const render = () => {
      const s = bits.join("");
      binTxt.textContent = s;
      decTxt.textContent = "= " + parseInt(s, 2);
      bits.forEach((b, i) => {
        sw[i].lp.setAttribute("fill", b ? "#ffd43b" : "#3a4270");
        sw[i].lever.setAttribute("fill", b ? "#ffd43b" : "#8f9ac9");
        sw[i].txt.textContent = b;
        sw[i].txt.setAttribute("fill", b ? "#ffd43b" : "#c9d1ec");
      });
    };
    const hint = T(svg, 350, 432, "👆 Bấm vào công tắc để thử bật / tắt", { "text-anchor": "middle", "font-size": 18, "font-weight": 700, fill: INK, opacity: 0 });

    async function flip(i) {
      const x = xs[i], sd = x >= P.root._p[0] ? "r" : "l";
      await c.mv(P.root, x, 322, 300);
      await P.reach(c, sd, x, 316, 150);
      bits[i] ^= 1;
      await c.tween(130, t => setLever(i, bits[i] ? t : 1 - t));
      render();
      await P.armMove(c, sd, (sd === "l" ? -1 : 1) * 34, -20, 150);
    }
    let q = Promise.resolve();
    const enqueue = fn => { q = q.then(fn).catch(e => { if (!(e instanceof Cancel)) console.error(e); }); };
    sw.forEach((s, i) => s.hit.addEventListener("click", () => enqueue(() => flip(i))));
    render();

    await c.wait(500);
    for (const i of [1, 4, 5, 7]) { await flip(i); await c.wait(120); }
    P.mood("worry");
    const b1 = bubble(c, svg, P.root._p[0], 108, ["Phù… mới xong MỘT lệnh bé xíu.", "Còn cả nghìn lệnh nữa!"], { dx: 40 });
    await c.wait(3800);
    b1.remove();
    P.mood("smile");
    await c.fade(hint, 0, 1, 400);
    for (; ;) { await c.tween(900, t => hint.setAttribute("opacity", .55 + .45 * Math.sin(t * Math.PI)), lin); }
  }

  /* =====================================================================
     CẢNH 2 · Trình dịch đầu tiên
     ===================================================================== */
  async function s2(c) {
    const svg = c.svg;
    room(svg, "#fdf0e0", "#efd9bd", 360);

    // bánh răng sau lưng "máy dịch"
    const gear = (cx, cy, r, dir) => {
      const g = G(svg);
      S("circle", { cx, cy, r, fill: "#f2b134", stroke: "#f2b134", "stroke-width": 9, "stroke-dasharray": "7 6" }, g);
      S("circle", { cx, cy, r: r - 2, fill: "#f9cc66" }, g);
      S("circle", { cx, cy, r: 6, fill: "#fdf0e0" }, g);
      S("animateTransform", { attributeName: "transform", type: "rotate", from: `0 ${cx} ${cy}`, to: `${dir * 360} ${cx} ${cy}`, dur: "6s", repeatCount: "indefinite" }, g);
    };
    gear(396, 144, 24, 1); gear(452, 134, 18, -1);
    S("line", { x1: 425, y1: 156, x2: 425, y2: 124, stroke: "#4a5486", "stroke-width": 4 }, svg);
    lamp(svg, 425, 120, 7, "#e0443c", 1.2);

    // bàn + Grace
    desk(svg, 20, 320, 270);
    const P = person(svg, { x: 105, y: 342, s: 1.3, bust: true, style: "bun", glasses: true, hair: "#5a4034", shirt: "#2f5d9e", arm: 84 });
    P.autoBlink(c);
    // tờ giấy trên bàn
    const paper = G(svg); place(paper, 168, 262, -3);
    S("rect", { width: 112, height: 56, rx: 4, fill: "#fff", stroke: "#d8d0c4", "stroke-width": 2 }, paper);
    const pl = [T(paper, 10, 24, "", { "font-size": 16, "font-family": MONO, "font-weight": 700, fill: INK }), T(paper, 10, 46, "", { "font-size": 16, "font-family": MONO, "font-weight": 700, fill: INK })];

    // khay kết quả bên phải
    desk(svg, 520, 330, 280, 12);
    S("rect", { x: 540, y: 168, width: 232, height: 150, rx: 10, fill: "#fff", stroke: "#d8d0c4", "stroke-width": 2 }, svg);
    T(svg, 656, 190, "KẾT QUẢ: chỉ có 0 và 1", { "text-anchor": "middle", "font-size": 14, "font-weight": 700, fill: "#8a7f6c" });
    const tags = G(svg);

    // robot trình dịch
    const R = G(svg);
    S("rect", { x: 350, y: 150, width: 150, height: 190, rx: 22, fill: "#6f8cf7" }, R);
    S("rect", { x: 342, y: 266, width: 16, height: 40, rx: 4, fill: INK }, R);
    S("rect", { x: 492, y: 266, width: 16, height: 40, rx: 4, fill: INK }, R);
    const eyeL = S("circle", { cx: 395, cy: 205, r: 15, fill: "#fff" }, R), eyeR = S("circle", { cx: 455, cy: 205, r: 15, fill: "#fff" }, R);
    const pl1 = S("circle", { cx: 395, cy: 205, r: 7, fill: INK }, R), pl2 = S("circle", { cx: 455, cy: 205, r: 7, fill: INK }, R);
    const mouth = S("rect", { x: 395, y: 240, width: 60, height: 10, rx: 5, fill: INK }, R);
    S("rect", { x: 368, y: 298, width: 114, height: 28, rx: 7, fill: "#fff" }, R);
    T(R, 425, 318, "TRÌNH DỊCH", { "text-anchor": "middle", "font-size": 15, "font-weight": 800, fill: INK });
    const look = d => { pl1.setAttribute("cx", 395 + d); pl2.setAttribute("cx", 455 + d); };
    const setMouth = h => { mouth.setAttribute("height", h); mouth.setAttribute("y", 245 - h / 2); };
    c.bg(async () => { for (; ;) { await c.wait(rnd(2000, 4000)); eyeL.setAttribute("ry", 2); eyeR.setAttribute("ry", 2); await c.wait(110); eyeL.removeAttribute("ry"); eyeR.removeAttribute("ry"); } });

    const mkTag = (txt, x, y, fill) => {
      const w = txt.length * 9.4 + 20, g = G(tags);
      S("rect", { x: -w / 2, y: -15, width: w, height: 30, rx: 9, fill, stroke: INK, "stroke-width": 2 }, g);
      T(g, 0, 6, txt, { "text-anchor": "middle", "font-family": MONO, "font-size": 15, "font-weight": 700, fill: INK });
      return place(g, x, y);
    };
    const pairs = [["MOV AL, 5", "10110000 00000101", 24, 218], ["ADD AL, 3", "00000100 00000011", 46, 256]];
    let bub = null;

    for (; ;) {
      tags.innerHTML = ""; pl.forEach(t => (t.textContent = "")); bub && bub.remove();
      P.mood("think"); setMouth(10); look(0);
      await c.wait(500);
      // Grace viết lệnh bằng chữ dễ nhớ
      for (let i = 0; i < 2; i++) {
        let k = 0;
        for (const ch of pairs[i][0]) {
          pl[i].textContent += ch;
          P.reach(c, "r", 178 + k * 6, 296 + (k % 2) * 4, 60);
          k++; await c.wait(70);
        }
      }
      P.mood("smile"); P.armMove(c, "r", 34, -20, 300);
      await c.wait(400);
      for (const [src, out, , rowY] of pairs) {
        const t = mkTag(src, 226, src.startsWith("MOV") ? 278 : 300, "#fff2b8");
        look(-6);
        await c.mv(t, 322, 286, 650);
        await c.mv(t, 392, 286, 260);
        t.remove();
        look(0); setMouth(24);
        await c.wait(650);
        setMouth(10);
        const o = mkTag(out, 430, 286, "#c6f6d9");
        look(6);
        await c.mv(o, 656, rowY, 800);
        look(0);
      }
      P.mood("grin"); setMouth(20);
      P.armMove(c, "l", -50, -170, 300); P.armMove(c, "r", 50, -170, 300);
      bub = bubble(c, svg, 105, 112, ["Giờ mình viết bằng chữ,", "máy tự dịch ra 0 và 1!"], { dx: 120 });
      await c.wait(4200);
      P.rest();
    }
  }

  /* =====================================================================
     CẢNH 3 · Thẻ đục lỗ
     ===================================================================== */
  function makeCard(parent) {
    const g = G(parent);
    S("polygon", { points: "-23,-16 33,-16 33,16 -33,16 -33,-6", fill: "#fbf3d3", stroke: "#cdbd84", "stroke-width": 1.5 }, g);
    for (let j = 0; j < 14; j++) for (let r = 0; r < 3; r++) if (Math.random() < .45) S("rect", { x: -29 + j * 4.2, y: -10 + r * 8, width: 2.4, height: 5, fill: "#5b4a2a" }, g);
    return g;
  }
  async function s3(c) {
    const svg = c.svg;
    room(svg, "#f7edd8", "#e5d3b0", 372);

    const clock = G(svg); place(clock, 230, 100); clock.setAttribute("opacity", 0);
    S("circle", { r: 36, fill: "#fff", stroke: INK, "stroke-width": 4 }, clock);
    for (let k = 0; k < 12; k++) S("line", { y1: -30, y2: -26, stroke: INK, "stroke-width": 2, transform: `rotate(${k * 30})` }, clock);
    const hh = S("line", { y2: -18, stroke: INK, "stroke-width": 4, "stroke-linecap": "round" }, clock);
    const mh = S("line", { y2: -28, stroke: "#e0443c", "stroke-width": 3, "stroke-linecap": "round" }, clock);
    const clockTxt = T(svg, 230, 162, "…3 giờ sau…", { "text-anchor": "middle", "font-size": 19, "font-weight": 800, fill: INK, opacity: 0 });

    // giấy in kết quả (ló ra từ đỉnh máy)
    const paper = G(svg); place(paper, 654, 215);
    S("rect", { width: 100, height: 126, rx: 4, fill: "#fff", stroke: "#cfc6b0", "stroke-width": 2 }, paper);
    T(paper, 10, 24, "KẾT QUẢ:", { "font-size": 13, "font-weight": 700, fill: "#8a7f6c" });
    T(paper, 10, 52, "• • • • • •", { "font-size": 15, fill: "#b9b09c" });
    T(paper, 10, 82, "LỖI!", { "font-size": 22, "font-weight": 800, fill: "#e0443c" });
    T(paper, 10, 104, "dòng 3", { "font-size": 15, "font-weight": 700, fill: "#e0443c" });

    const P = person(svg, { x: 90, y: 395, s: 1.35, coat: true, glasses: true });
    P.autoBlink(c);
    const deck = G(svg);

    // máy đọc thẻ
    const M = G(svg);
    S("rect", { x: 560, y: 215, width: 220, height: 175, rx: 14, fill: "#8fa3d8" }, M);
    S("rect", { x: 574, y: 232, width: 192, height: 96, rx: 8, fill: "#b3c1ea" }, M);
    for (let k = 0; k < 8; k++) lamp(M, 596 + k * 22, 256, 6, k % 3 ? "#ffd43b" : "#7dffb0", 0.9 + k * .2);
    T(M, 670, 306, "ĐỌC THẺ", { "text-anchor": "middle", "font-size": 17, "font-weight": 800, fill: INK });
    S("rect", { x: 552, y: 284, width: 18, height: 44, rx: 4, fill: INK }, M);
    S("rect", { x: 640, y: 210, width: 120, height: 8, rx: 3, fill: INK }, M);
    T(M, 670, 366, "Máy tính thập niên 1960", { "text-anchor": "middle", "font-size": 12, "font-weight": 700, fill: "#fff", opacity: .85 });

    let cards = [], bub = null, zz = null;
    const reset = () => {
      bub && bub.remove(); zz && zz.remove();
      clock.setAttribute("opacity", 0); clockTxt.setAttribute("opacity", 0);
      place(paper, 654, 215);
      place(P.root, 90, 395, 0, 1.35); P.face(1); P.mood("smile"); P.rest();
      deck.innerHTML = ""; place(deck, 142, 304);
      cards = Array.from({ length: 6 }, (_, i) => place(makeCard(deck), i * 3, -i * 3));
    };

    for (; ;) {
      reset();
      await c.wait(600);
      P.armTo("l", 30, -64); P.armTo("r", 46, -64);
      await Promise.all([P.walk(c, 440, 1700), c.tween(1700, () => place(deck, P.root._p[0] + 52, 304), lin)]);
      // nhét từng thẻ vào khe
      for (let i = 5; i >= 0; i--) {
        await c.mv(cards[i], 596 - deck._p[0], 306 - deck._p[1], 260, 0, 1, lin);
        cards[i].remove();
      }
      P.rest(); P.mood("flat");
      // chờ… chờ…
      c.fade(clock, 0, 1, 300); c.fade(clockTxt, 0, 1, 300);
      const z = zz = T(svg, 470, 200, "z Z z", { "font-size": 26, "font-weight": 800, fill: "#7a89d6", opacity: 0 });
      await c.tween(3200, t => {
        mh.setAttribute("transform", `rotate(${t * 1800})`); hh.setAttribute("transform", `rotate(${t * 150})`);
        z.setAttribute("opacity", Math.sin(t * Math.PI)); z.setAttribute("y", 200 - t * 50);
      }, lin);
      z.remove(); zz = null;
      // máy in ra: LỖI
      await c.mv(paper, 654, 92, 900);
      P.mood("oh");
      await c.wait(500);
      P.mood("worry");
      P.armMove(c, "l", -17, -150, 350); await P.armMove(c, "r", 17, -150, 350);
      bub = bubble(c, svg, 470, 170, ["Sai MỘT lỗ đục thôi mà…", "là phải làm lại từ đầu!"], { dx: -30 });
      await c.wait(4200);
    }
  }

  /* =====================================================================
     CẢNH 4 · Màn hình + bàn phím
     ===================================================================== */
  async function s4(c) {
    const svg = c.svg;
    room(svg, "#e7f1f8", "#c8dcea", 380);
    desk(svg, 0, 318, 800, 16);
    // màn hình
    S("rect", { x: 500, y: 296, width: 50, height: 24, fill: "#bdb6a3" }, svg);
    S("rect", { x: 470, y: 308, width: 110, height: 12, rx: 5, fill: "#cfc8b5" }, svg);
    S("rect", { x: 350, y: 56, width: 350, height: 242, rx: 20, fill: "#d9d2c0" }, svg);
    const T1 = term(c, svg, { x: 370, y: 76, w: 310, h: 202, fs: 16, lh: 24, rx: 10 });
    S("path", { d: "M380 86 L600 86", stroke: "#fff", opacity: .06, "stroke-width": 1 }, svg);
    // bàn phím
    S("rect", { x: 272, y: 303, width: 140, height: 16, rx: 5, fill: "#c9c2b0" }, svg);
    for (let k = 0; k < 12; k++) S("rect", { x: 278 + k * 11, y: 306, width: 8, height: 4, rx: 1.5, fill: "#9e978a" }, svg);

    const P = person(svg, { x: 232, y: 346, s: 1.3, bust: true, glasses: true, arm: 84 });
    P.autoBlink(c);
    // vẽ người sau bàn: bàn đã vẽ trước nên vẽ lại mặt bàn đè lên thân dưới
    desk(svg, 0, 318, 270, 16);
    S("rect", { x: 272, y: 303, width: 140, height: 16, rx: 5, fill: "#c9c2b0" }, svg);
    for (let k = 0; k < 12; k++) S("rect", { x: 278 + k * 11, y: 306, width: 8, height: 4, rx: 1.5, fill: "#9e978a" }, svg);

    let kk = 0;
    const tap = () => {
      kk++;
      P.armTo("r", 128 + (kk % 2) * 6, -26 - (kk % 2 ? 10 : 0));
      P.armTo("l", 90 + ((kk + 1) % 2) * 6, -26 - ((kk + 1) % 2 ? 10 : 0));
    };
    const toKeys = () => { P.reach(c, "r", 352, 306, 200); return P.reach(c, "l", 308, 306, 200); };
    let bub = null;
    for (; ;) {
      T1.clear(); bub && bub.remove(); P.mood("think");
      await c.wait(500);
      await toKeys();
      await T1.line('> 10 PRNT "XIN CHAO"', 70, tap);
      await c.wait(250);
      await T1.line("> RUN", 120, tap);
      await c.wait(350);
      T1.print("?SYNTAX ERROR IN 10", "#ff9aa8");
      P.mood("oh");
      bub = bubble(c, svg, 232, 170, "Ồ, gõ sai chữ PRINT!", { dx: -70 });
      await c.wait(1500);
      bub.remove();
      P.mood("think");
      await T1.line('> 10 PRINT "XIN CHAO"', 55, tap);
      await c.wait(200);
      await T1.line("> RUN", 100, tap);
      await c.wait(250);
      T1.print("XIN CHAO", "#ffd43b");
      P.mood("grin");
      bub = bubble(c, svg, 232, 170, ["Sửa lỗi, chạy lại:", "chỉ mất vài giây!"], { dx: -70 });
      await c.wait(4200);
    }
  }

  /* =====================================================================
     CẢNH 5 · Cửa sổ + chuột (giao diện đồ họa)
     ===================================================================== */
  async function s5(c) {
    const svg = c.svg;
    room(svg, "#efe6fb", "#d9cdf0", 390);
    const defs = S("defs", {}, svg);
    const lg = S("linearGradient", { id: "wp", x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
    S("stop", { offset: 0, "stop-color": "#7fd1ff" }, lg); S("stop", { offset: 1, "stop-color": "#c3a6ff" }, lg);
    desk(svg, 0, 332, 800, 16);
    // màn hình phẳng
    S("rect", { x: 496, y: 300, width: 50, height: 34, fill: "#3b3f5c" }, svg);
    S("rect", { x: 440, y: 322, width: 160, height: 12, rx: 6, fill: "#4a4f74" }, svg);
    S("rect", { x: 240, y: 22, width: 510, height: 282, rx: 18, fill: "#3b3f5c" }, svg);
    S("rect", { x: 254, y: 36, width: 482, height: 254, rx: 8, fill: "url(#wp)" }, svg);
    S("rect", { x: 254, y: 266, width: 482, height: 24, fill: "#2b2f4e" }, svg);
    S("circle", { cx: 270, cy: 278, r: 8, fill: "#ffd43b" }, svg);
    // biểu tượng
    const ico = G(svg); place(ico, 296, 76);
    const sel = S("rect", { x: -28, y: -34, width: 56, height: 74, rx: 8, fill: "#ffffff", opacity: 0 }, ico);
    S("rect", { x: -22, y: -16, width: 44, height: 30, rx: 5, fill: "#ffcf4a" }, ico);
    S("rect", { x: -22, y: -22, width: 20, height: 10, rx: 4, fill: "#ffcf4a" }, ico);
    T(ico, 0, 34, "Ảnh", { "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: "#fff" });
    const ico2 = G(svg); place(ico2, 296, 168);
    S("rect", { x: -18, y: -24, width: 36, height: 44, rx: 5, fill: "#fff" }, ico2);
    for (let k = 0; k < 4; k++) S("rect", { x: -11, y: -14 + k * 9, width: 22, height: 3, rx: 1.5, fill: "#b9b0e0" }, ico2);
    T(ico2, 0, 38, "Bài tập", { "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: "#fff" });
    // cửa sổ (mở / đóng)
    const win = G(svg); place(win, 524, 150, 0, .01);
    S("rect", { x: -150, y: -85, width: 300, height: 170, rx: 10, fill: "#fff", stroke: "#2b2f4e", "stroke-width": 2 }, win);
    S("path", { d: "M-150 -75 a10 10 0 0 1 10 -10 h280 a10 10 0 0 1 10 10 v10 h-300z", fill: "#5b5bd6" }, win);
    T(win, -138, -68, "Ảnh.png", { "font-size": 13, "font-weight": 700, fill: "#fff" });
    S("circle", { cx: 134, cy: -75, r: 7, fill: "#ff5d5d" }, win);
    S("rect", { x: -140, y: -55, width: 280, height: 130, rx: 4, fill: "#bfe3ff" }, win);
    S("circle", { cx: 70, cy: -20, r: 20, fill: "#ffd43b" }, win);
    S("path", { d: "M-140 75 L-140 20 Q-90 -20 -40 25 Q20 -5 60 30 Q100 5 140 25 L140 75Z", fill: "#59c07a" }, win);
    // chuột + con trỏ
    const mouse = G(svg); const mx0 = 205, my0 = 322;
    S("rect", { x: -15, y: -22, width: 30, height: 42, rx: 14, fill: "#fff", stroke: "#8a84ad", "stroke-width": 2 }, mouse);
    S("line", { x1: 0, y1: -22, x2: 0, y2: -6, stroke: "#8a84ad", "stroke-width": 2 }, mouse);
    place(mouse, mx0, my0);
    const P = person(svg, { x: 118, y: 358, s: 1.3, bust: true, style: "long", hair: "#3b2a2a", shirt: "#18b8c9", arm: 84 });
    P.autoBlink(c);
    desk(svg, 0, 332, 240, 16);
    mouse.parentNode.appendChild(mouse);
    const cur = G(svg);
    S("polygon", { points: "0,0 0,22 6,17 11,28 16,26 11,15 19,15", fill: "#fff", stroke: "#111", "stroke-width": 1.6, "stroke-linejoin": "round" }, cur);
    place(cur, 640, 236);
    const moveCur = (x, y, ms) => {
      const [x0, y0] = cur._p;
      return c.tween(ms, t => {
        const cx = lerp(x0, x, t), cy = lerp(y0, y, t);
        place(cur, cx, cy);
        place(mouse, mx0 + (cx - 640) * .08, my0 + (cy - 236) * .08);
        const [lx, ly] = P.toLocal(mouse._p[0], mouse._p[1] - 6);
        P.armTo("r", lx, ly);
      });
    };
    const click = async () => {
      const [x, y] = cur._p;
      const r = S("circle", { cx: x, cy: y, r: 3, fill: "none", stroke: "#fff", "stroke-width": 3 }, svg);
      await c.tween(300, t => { r.setAttribute("r", 3 + t * 22); r.setAttribute("opacity", 1 - t); }, lin);
      r.remove();
    };
    let bub = null;
    for (; ;) {
      bub && bub.remove(); P.mood("smile");
      await c.wait(600);
      await moveCur(300, 100, 1000);
      sel.setAttribute("opacity", .4);
      await click(); await c.wait(120); await click();
      await c.mv(win, 524, 150, 420, 0, 1, easeBack);
      P.mood("grin");
      bub = bubble(c, svg, 118, 148, ["Bấm đúp là mở ra!", "Không cần gõ lệnh nữa."], { dx: 60 });
      await c.wait(2400);
      bub.remove();
      await moveCur(660, 76, 1000);
      await click();
      await c.mv(win, 524, 150, 300, 0, .01, ease);
      sel.setAttribute("opacity", 0);
      P.mood("smile");
      await moveCur(640, 236, 800);
      await c.wait(900);
    }
  }

  /* =====================================================================
     CẢNH 6 · Leo thang ngôn ngữ
     ===================================================================== */
  async function s6(c) {
    const svg = c.svg;
    room(svg, "#e8f4ee", "#cfe6d9", 420);
    const steps = [
      { n: "Mã máy", y: "1940s", say: ["10110000 00000101"], col: "#8d9bd6" },
      { n: "Assembly", y: "1950s", say: ["MOV AL, 5"], col: "#7686cc" },
      { n: "FORTRAN · BASIC", y: "1957–1964", say: ['PRINT "XIN CHAO"'], col: "#6070c2" },
      { n: "C", y: "1972", say: ['printf("Xin chao");'], col: "#4d5cb5" },
      { n: "C++", y: "1985", say: ['std::cout << "Xin chao";', "Ui, nhiều ký hiệu quá!"], col: "#3e4ba3" }
    ];
    const topOf = k => 370 - 34 * k, xOf = k => 30 + k * 125;
    steps.forEach((s, k) => {
      S("rect", { x: xOf(k), y: topOf(k), width: 125, height: 450 - topOf(k), fill: s.col }, svg);
      S("rect", { x: xOf(k), y: topOf(k), width: 125, height: 8, fill: "#fff", opacity: .25 }, svg);
      T(svg, xOf(k) + 62, topOf(k) + 30, s.n, { "text-anchor": "middle", "font-size": s.n.length > 10 ? 13 : 16, "font-weight": 800, fill: "#fff" });
      T(svg, xOf(k) + 62, topOf(k) + 48, s.y, { "text-anchor": "middle", "font-size": 13, "font-weight": 700, fill: "#fff", opacity: .85 });
    });
    // bậc bí ẩn
    const q = G(svg);
    S("rect", { x: xOf(5), y: topOf(5), width: 125, height: 450 - topOf(5), fill: "#5b5bd614", stroke: "#5b5bd6", "stroke-width": 3, "stroke-dasharray": "9 7" }, q);
    const qt = T(q, xOf(5) + 62, topOf(5) + 60, "?", { "text-anchor": "middle", "font-size": 52, "font-weight": 800, fill: "#5b5bd6" });
    T(svg, 400, 30, "Càng lên cao, ngôn ngữ càng giống chữ viết của con người", { "text-anchor": "middle", "font-size": 18, "font-weight": 800, fill: INK });
    const P = person(svg, { x: xOf(0) + 62, y: topOf(0), s: .85, glasses: true, shirt: "#ff9f1c" });
    P.autoBlink(c);
    // balô nặng cho C++
    const pack = S("g", { opacity: 0 }, P.body);
    S("rect", { x: -48, y: -104, width: 30, height: 52, rx: 8, fill: "#8b5e3c" }, pack);
    T(pack, -33, -75, "{ }", { "text-anchor": "middle", "font-size": 12, "font-weight": 800, fill: "#fff" });
    T(pack, -33, -61, "; &", { "text-anchor": "middle", "font-size": 12, "font-weight": 800, fill: "#fff" });
    let bub = null;
    for (; ;) {
      pack.setAttribute("opacity", 0); P.mood("smile"); qt.setAttribute("opacity", 1);
      place(P.root, xOf(0) + 62, topOf(0), 0, .85); P.rest();
      for (let k = 0; k < steps.length; k++) {
        if (k > 0) { bub && bub.remove(); P.face(1); await P.hop(c, xOf(k) + 62, topOf(k), 650); }
        if (k === 4) { P.mood("worry"); pack.setAttribute("opacity", 1); } else P.mood(k === 3 ? "think" : "smile");
        bub = bubble(c, svg, xOf(k) + 62, topOf(k) - 138 + (k === 4 ? 0 : 0), steps[k].say, { mono: true, fs: 15, dx: k >= 3 ? -30 : 0 });
        await c.wait(k === 4 ? 3200 : 1900);
      }
      bub.remove();
      for (let i = 0; i < 4; i++) { await c.tween(300, t => qt.setAttribute("opacity", .3 + .7 * Math.abs(Math.sin(t * Math.PI))), lin); }
      await c.wait(1200);
    }
  }

  /* =====================================================================
     CẢNH 7 · Guido và kỳ nghỉ Giáng sinh 1989
     ===================================================================== */
  async function s7(c) {
    const svg = c.svg;
    room(svg, "#243255", "#16203f", 372);
    // cửa sổ có tuyết rơi
    const defs = S("defs", {}, svg), cp = S("clipPath", { id: "wc" }, defs);
    S("rect", { x: 34, y: 44, width: 192, height: 192 }, cp);
    S("rect", { x: 34, y: 44, width: 192, height: 192, fill: "#0f1733" }, svg);
    const snow = G(svg, { "clip-path": "url(#wc)" });
    for (let i = 0; i < 24; i++) {
      const d = rnd(4, 8);
      const f = S("circle", { cx: rnd(36, 224), cy: -6, r: rnd(1.5, 3.4), fill: "#fff", opacity: .9 }, snow);
      S("animate", { attributeName: "cy", from: 40, to: 240, dur: d.toFixed(1) + "s", begin: "-" + rnd(0, d).toFixed(1) + "s", repeatCount: "indefinite" }, f);
    }
    S("rect", { x: 30, y: 40, width: 200, height: 200, rx: 4, fill: "none", stroke: "#c9b38a", "stroke-width": 8 }, svg);
    S("line", { x1: 130, y1: 44, x2: 130, y2: 236, stroke: "#c9b38a", "stroke-width": 6 }, svg);
    S("line", { x1: 34, y1: 140, x2: 226, y2: 140, stroke: "#c9b38a", "stroke-width": 6 }, svg);
    // lịch
    S("rect", { x: 630, y: 36, width: 120, height: 92, rx: 10, fill: "#fff" }, svg);
    S("path", { d: "M630 46 a10 10 0 0 1 10 -10 h100 a10 10 0 0 1 10 10 v22 h-120z", fill: "#e0443c" }, svg);
    T(svg, 690, 60, "THÁNG 12", { "text-anchor": "middle", "font-size": 15, "font-weight": 800, fill: "#fff" });
    T(svg, 690, 107, "1989", { "text-anchor": "middle", "font-size": 34, "font-weight": 800, fill: INK });
    // cây thông
    const tree = G(svg);
    S("polygon", { points: "690,196 650,276 730,276", fill: "#2f9e5b" }, tree);
    S("polygon", { points: "690,236 640,326 740,326", fill: "#278a4e" }, tree);
    S("polygon", { points: "690,280 628,378 752,378", fill: "#1f7a43" }, tree);
    S("polygon", { points: "690,176 695,190 710,190 698,199 703,214 690,205 677,214 682,199 670,190 685,190", fill: "#ffd43b" }, tree);
    [[672, 250, "#e0443c"], [708, 262, "#ffd43b"], [660, 312, "#ffd43b"], [700, 322, "#e0443c"], [680, 358, "#7dd3fc"], [726, 360, "#ffd43b"]].forEach(([x, y, col], i) => lamp(tree, x, y, 6, col, 1.1 + i * .25));

    // bàn + máy tính cổ
    desk(svg, 250, 332, 550, 16, "#8a5a38", "#6e4528");
    S("rect", { x: 480, y: 304, width: 60, height: 30, fill: "#cfc6ae" }, svg);
    S("rect", { x: 400, y: 150, width: 220, height: 160, rx: 18, fill: "#e0d8c0" }, svg);
    const T7 = term(c, svg, { x: 416, y: 166, w: 188, h: 116, fs: 15, lh: 22, rx: 8 });
    S("rect", { x: 300, y: 318, width: 100, height: 14, rx: 5, fill: "#d2caB4".toLowerCase() }, svg);

    const P = person(svg, { x: 312, y: 360, s: 1.35, bust: true, beard: true, hair: "#9aa0ad", shirt: "#e05a47", arm: 80 });
    P.autoBlink(c);
    desk(svg, 250, 332, 150, 16, "#8a5a38", "#6e4528");
    S("rect", { x: 330, y: 320, width: 90, height: 13, rx: 5, fill: "#d2c9b0" }, svg);
    let kk = 0;
    const tap = () => { kk++; P.armTo("r", 80 + (kk % 2) * 5, -22 - (kk % 2) * 8); P.armTo("l", 48 + ((kk + 1) % 2) * 5, -22 - ((kk + 1) % 2) * 8); };

    let bub = null, bulb = null, thought = null, snake = null, ribbon = null;
    const clean = () => { [bub, bulb, thought, snake, ribbon].forEach(e => e && e.remove()); bub = bulb = thought = snake = ribbon = null; };
    const HEAD = 360 - 160 * 1.35 - 10;   // đỉnh đầu

    for (; ;) {
      clean(); T7.clear(); P.mood("flat"); P.rest();
      await c.wait(700);
      bub = bubble(c, svg, 312, HEAD, ["Nghỉ lễ rồi. Mình muốn có một", "ngôn ngữ ngắn gọn, dễ đọc hơn C…"], { dx: 60, fs: 16 });
      await c.wait(3200); bub.remove();
      // bóng đèn
      bulb = G(svg); place(bulb, 360, 90, 0, .01);
      S("circle", { r: 20, fill: "#ffe066", stroke: "#e0a800", "stroke-width": 3 }, bulb);
      S("rect", { x: -9, y: 18, width: 18, height: 10, rx: 3, fill: "#9aa0ad" }, bulb);
      for (let a = 0; a < 7; a++) S("line", { y1: -30, y2: -40, stroke: "#ffe066", "stroke-width": 4, "stroke-linecap": "round", transform: `rotate(${a * 360 / 7 + 10})` }, bulb);
      await c.mv(bulb, 360, 90, 350, 0, 1, easeBack);
      P.mood("grin");
      await c.wait(500);
      bub = bubble(c, svg, 312, HEAD, ["Làm ngôn ngữ mới nào:", "dễ đọc, dễ viết!"], { dx: -20, fs: 16 });
      await c.wait(2400); bub.remove(); bulb.remove(); bulb = null;
      // gõ code
      P.reach(c, "r", 380, 322, 200); await P.reach(c, "l", 350, 322, 200);
      P.mood("think");
      await T7.line('print("Xin chào")', 85, tap);
      await c.wait(300);
      T7.print("Xin chào", "#ffd43b");
      P.mood("grin"); P.rest();
      await c.wait(1200);
      // tên Python
      thought = G(svg);
      S("circle", { cx: 300, cy: 142, r: 6, fill: "#fff", stroke: INK, "stroke-width": 2 }, thought);
      S("circle", { cx: 292, cy: 128, r: 9, fill: "#fff", stroke: INK, "stroke-width": 2 }, thought);
      S("rect", { x: 150, y: 14, width: 270, height: 104, rx: 22, fill: "#fff", stroke: INK, "stroke-width": 2.5 }, thought);
      S("rect", { x: 166, y: 34, width: 76, height: 60, rx: 9, fill: "#9b7a55" }, thought);
      S("rect", { x: 172, y: 40, width: 52, height: 42, rx: 6, fill: "#bfe3ff" }, thought);
      T(thought, 198, 70, "😂", { "text-anchor": "middle", "font-size": 24 });
      S("circle", { cx: 233, cy: 52, r: 3.5, fill: "#3a2a18" }, thought); S("circle", { cx: 233, cy: 66, r: 3.5, fill: "#3a2a18" }, thought);
      T(thought, 254, 54, "Monty Python’s", { "font-size": 16, "font-weight": 800, fill: INK });
      T(thought, 254, 76, "Flying Circus", { "font-size": 16, "font-weight": 800, fill: INK });
      T(thought, 254, 100, "chương trình hài ông thích", { "font-size": 11.5, "font-weight": 600, fill: "#66708a" });
      place(thought, 0, 0);
      await c.wait(3600);
      thought.remove(); thought = null;
      bub = bubble(c, svg, 312, HEAD, ["Đặt tên là PYTHON nhé!"], { dx: 30 });
      // con rắn lè lưỡi hiện lên đỉnh màn hình
      snake = G(svg);
      const body = S("path", { d: "M424 142 q14 -26 28 0 t28 0 t28 0 t28 0 t28 0 t28 0", pathLength: 1, fill: "none", stroke: "#4b8bbe", "stroke-width": 13, "stroke-linecap": "round", "stroke-dasharray": 1, "stroke-dashoffset": 1 }, snake);
      const head = G(snake); place(head, 592, 142, 0, .01);
      S("circle", { r: 13, fill: "#4b8bbe" }, head); S("circle", { cx: 4, cy: -4, r: 4, fill: "#fff" }, head); S("circle", { cx: 5, cy: -4, r: 2, fill: INK }, head);
      S("path", { d: "M12 4 l10 0 l5 -4 m-5 4 l5 4", fill: "none", stroke: "#e0443c", "stroke-width": 2.2, "stroke-linecap": "round" }, head);
      await c.tween(1100, t => body.setAttribute("stroke-dashoffset", 1 - t), lin);
      await c.mv(head, 592, 142, 200, 0, 1, easeBack);
      await c.wait(1300);
      bub.remove();
      bub = bubble(c, svg, 592, 118, ["Ơ, mình là rắn thật,", "nhưng đâu phải lí do…"], { fs: 14, dx: 0 });
      await c.wait(2500);
      bub.remove();
      ribbon = G(svg);
      S("rect", { x: 270, y: 392, width: 260, height: 40, rx: 20, fill: "#ffd43b" }, ribbon);
      T(ribbon, 400, 420, "🎉 Python ra mắt năm 1991", { "text-anchor": "middle", "font-size": 19, "font-weight": 800, fill: INK });
      await c.wait(4200);
    }
  }

  /* =====================================================================
     CẢNH 8 · Cùng một việc: in "Xin chào"
     ===================================================================== */
  async function s8(c) {
    const svg = c.svg;
    room(svg, "#f3eefb", "#e1d7f3", 440);
    const panel = (x, label, col) => {
      S("rect", { x, y: 18, width: 372, height: 300, rx: 18, fill: "#fff", stroke: col, "stroke-width": 4 }, svg);
      S("path", { d: `M${x} 36 a18 18 0 0 1 18 -18 h336 a18 18 0 0 1 18 18 v22 h-372z`, fill: col }, svg);
      T(svg, x + 18, 46, label, { "font-size": 22, "font-weight": 800, fill: "#fff" });
    };
    panel(24, "C++", "#e0605a"); panel(404, "Python", "#22b573");
    const A = term(c, svg, { x: 40, y: 74, w: 340, h: 226, fs: 15, lh: 23, rx: 10 });
    const B = term(c, svg, { x: 420, y: 74, w: 340, h: 226, fs: 17, lh: 25, rx: 10 });
    const chipA = T(svg, 388, 46, "", { "text-anchor": "end", "font-size": 19, "font-weight": 800, fill: "#fff" });
    const chipB = T(svg, 768, 46, "", { "text-anchor": "end", "font-size": 19, "font-weight": 800, fill: "#fff" });
    const Pa = person(svg, { x: 210, y: 448, s: .72, bust: true, style: "pony", hair: "#4a2c2a", shirt: "#ff5d8f" });
    const Pb = person(svg, { x: 590, y: 448, s: .72, bust: true, style: "pony", hair: "#4a2c2a", shirt: "#ff5d8f" });
    Pa.autoBlink(c); Pb.autoBlink(c);
    let ba = null, bb = null;
    for (; ;) {
      A.clear(); B.clear(); chipA.textContent = chipB.textContent = "";
      ba && ba.remove(); bb && bb.remove();
      Pa.mood("think"); Pb.mood("think");
      await c.wait(700);
      const codeA = ["#include <iostream>", "int main() {", '  std::cout << "Xin chao";', "  return 0;", "}"];
      await Promise.all([
        (async () => { for (const l of codeA) await A.line(l, 38); })(),
        B.line('print("Xin chào")', 90)
      ]);
      await c.wait(400);
      A.print("", "#fff"); A.print("→ Xin chao", "#ffd43b");
      B.print("Xin chào", "#ffd43b");
      chipA.textContent = "5 dòng"; chipB.textContent = "1 dòng";
      Pa.mood("worry"); Pb.mood("grin");
      await c.wait(600);
      ba = bubble(c, svg, 210, 306, ["Nhiều ký hiệu quá!"], { fs: 16 });
      bb = bubble(c, svg, 590, 306, ["Dễ đọc quá!"], { fs: 16 });
      await c.wait(5200);
    }
  }

  /* =====================================================================
     CẢNH 9 · Đến lượt em
     ===================================================================== */
  async function s9(c) {
    const svg = c.svg;
    room(svg, "#fff3d9", "#ffe0a8", 390);
    // pháo giấy
    const cols = ["#ff5d8f", "#5b5bd6", "#22b573", "#ffd43b", "#18b8c9"];
    for (let i = 0; i < 26; i++) {
      const d = rnd(4, 8);
      const r = S("rect", { x: rnd(10, 780), y: -12, width: 8, height: 12, rx: 2, fill: cols[i % 5], transform: `rotate(${rnd(0, 90)} 400 200)`, opacity: .9 }, svg);
      S("animate", { attributeName: "y", from: -20, to: 460, dur: d.toFixed(1) + "s", begin: "-" + rnd(0, d).toFixed(1) + "s", repeatCount: "indefinite" }, r);
    }
    // biển print
    S("rect", { x: 270, y: 14, width: 260, height: 44, rx: 22, fill: "#26304a" }, svg);
    T(svg, 400, 44, 'print("Xin chào, Python!")', { "text-anchor": "middle", "font-size": 17, "font-family": MONO, "font-weight": 700, fill: "#c3f26b" });
    // các biểu tượng quanh em
    [[110, 190, "🌐", "Trang web", "#3b82f6"], [215, 110, "🤖", "Trí tuệ nhân tạo", "#a14be0"], [585, 110, "🎮", "Trò chơi", "#ff5d8f"], [690, 190, "📊", "Dữ liệu", "#22b573"], [140, 320, "🦾", "Robot", "#f2674a"], [660, 320, "🔬", "Khoa học", "#18b8c9"]].forEach(([x, y, em, lb, col], i) => {
      const g = G(svg);
      place(g, x, y);
      const inner = G(g);
      S("circle", { r: 36, fill: "#fff", stroke: col, "stroke-width": 4 }, inner);
      T(inner, 0, 12, em, { "text-anchor": "middle", "font-size": 34 });
      T(inner, 0, 58, lb, { "text-anchor": "middle", "font-size": 14, "font-weight": 800, fill: INK });
      S("animateTransform", { attributeName: "transform", type: "translate", values: "0 0;0 -9;0 0", dur: (2 + i * .3).toFixed(1) + "s", begin: "-" + (i * .5) + "s", repeatCount: "indefinite" }, inner);
    });
    const P = person(svg, { x: 400, y: 408, s: 1.5, style: "pony", hair: "#4a2c2a", shirt: "#ff5d8f", skin: "#f6d1b0", arm: 80 });
    P.autoBlink(c);
    P.mood("grin");
    await c.wait(500);
    P.armMove(c, "l", -52, -178, 450); P.armMove(c, "r", 52, -178, 450);
    await c.wait(500);
    bubble(c, svg, 400, 400 - 160 * 1.5 - 12, ["Python dễ đọc, dễ viết.", "Mình bắt đầu thôi!"], { dx: 0, fs: 17 });
    for (; ;) {
      await c.tween(500, t => { const w = Math.sin(t * Math.PI); P.armTo("l", -52 - w * 6, -178 + w * 12); P.armTo("r", 52 + w * 6, -178 + w * 12); }, lin);
    }
  }

  /* =====================================================================
     Nội dung chữ của từng chặng
     ===================================================================== */
  const DATA = [
    {
      year: "Ngày xưa", title: "Máy chỉ biết bật và tắt",
      text: "Máy tính đời đầu to bằng cả một căn phòng. Nó chỉ hiểu <b>công tắc</b>: <b>bật là 1, tắt là 0</b>. Muốn máy làm việc, người ta phải đứng gạt từng công tắc. Gạt nhầm một cái là sai hết!",
    },
    {
      year: "Những năm 1940 – 1970", title: "Lưu chương trình vào thẻ giấy",
      text: "Người ta đục các lỗ nhỏ lên <b>thẻ giấy</b>. Các lỗ này là mã để máy hiểu. Một thẻ là một dòng lệnh, cả chồng thẻ là cả chương trình. Đưa chồng thẻ cho máy đọc là xong, không cần gạt công tắc nữa. Nhưng phải <b>chờ rất lâu</b> mới có kết quả, và sai một lỗ đục là phải làm lại.",
    },
    {
      year: "Những năm 1950", title: "Nhờ máy tính dịch giúp",
      text: "Có người nghĩ: <i>“Sao không bắt máy tính dịch giúp mình?”</i> Thế là người ta viết lệnh bằng <b>chữ dễ nhớ</b> như <code>ADD</code> (cộng), đục lên thẻ. Một <b>chương trình dịch</b> đọc thẻ và đổi chữ đó thành 0 và 1 cho máy hiểu. Bà Grace Hopper làm ra một trong những chương trình dịch đầu tiên (năm 1952). Các lệnh như <code>MOV</code>, <code>ADD</code> trong tranh chỉ là ví dụ minh họa.",
    },
    {
      year: "Những năm 1960 – 1970", title: "Gõ lệnh và thấy kết quả ngay",
      text: "Rồi máy tính có <b>bàn phím</b> và <b>màn hình</b>. Em gõ lệnh, nhấn Enter, máy trả lời liền. Gõ sai thì sửa ngay, không phải chờ cả ngày. Lập trình nhanh và vui hơn nhiều.",
    },
    {
      year: "Những năm 1980", title: "Máy tính cho mọi người",
      text: "Máy tính có <b>cửa sổ</b>, <b>biểu tượng</b> và <b>chuột</b>: chỉ cần bấm, không cần nhớ lệnh. Ai cũng dùng được! Nhưng mỗi nút bấm, mỗi cửa sổ đều do <b>lập trình viên</b> viết ra. Họ cần những ngôn ngữ mạnh để làm phần mềm lớn.",
    },
    {
      year: "Nhìn lại 1950 → 1985", title: "Ngôn ngữ ngày càng dễ đọc, nhưng…",
      text: "Qua nhiều năm, người ta tạo ra nhiều <b>ngôn ngữ lập trình</b>, mỗi ngôn ngữ giống chữ viết của con người hơn cái trước: FORTRAN, BASIC, rồi <b>C</b> (1972) và <b>C++</b> (1985). C và C++ chạy rất nhanh, dùng làm hệ điều hành và game lớn. Nhưng chúng có <b>rất nhiều quy tắc</b>: ngoặc nhọn, dấu chấm phẩy… Quên một dấu là máy báo lỗi.",
    },
    {
      year: "Cuối năm 1989", title: "Guido tạo ra Python",
      text: "Guido van Rossum là kỹ sư người Hà Lan. Ông thấy viết việc nhỏ bằng C quá dài dòng. Dịp nghỉ Giáng sinh năm 1989, ông tự làm một ngôn ngữ mới: <b>dễ đọc như tiếng Anh, ít ký hiệu rối</b>. Ông đặt tên là <b>Python</b>, lấy từ chương trình hài <i>Monty Python’s Flying Circus</i>, không phải từ con rắn! Bản đầu tiên ra mắt năm 1991. Dòng <code>print(\"Xin chào\")</code> trong tranh là cách viết của Python ngày nay, bản đầu tiên viết hơi khác một chút.",
    },
    {
      year: "Cùng một việc", title: "So sánh: in chữ “Xin chào”",
      text: "Cùng một việc: <b>in chữ Xin chào ra màn hình</b>. C++ cần khoảng 5 dòng với nhiều ký hiệu lạ. Python chỉ cần <b>1 dòng</b>, đọc là hiểu: <code>print</code> nghĩa là “in”. Vì vậy Python rất hợp cho người mới học.",
    },
    {
      year: "Ngày nay", title: "Đến lượt em",
      text: "Ngày nay Python được dùng để làm trang web, trí tuệ nhân tạo, trò chơi, điều khiển robot… Còn hôm nay, em sẽ bắt đầu bằng việc quen nhất: bảo máy tính nói “Xin chào”. Chuyến đi từ những chiếc công tắc đến Python đã mất hơn bốn mươi năm, còn chuyến đi của em bắt đầu <b>ngay bây giờ</b>!",
    }
  ];
  const SCENES = [s1, s3, s2, s4, s5, s6, s7, s8, s9];

  /* ---------- điều khiển trang ---------- */
  const root = document.getElementById("story");
  if (!root) return;
  const stage = document.getElementById("storyStage");
  const el = id => document.getElementById(id);
  const btnPrev = el("storyPrev"), btnNext = el("storyNext"), dotsBox = el("storyDots");
  let idx = 0, ctx = null, visible = false;
  const seen = new Set([0]);

  const dots = DATA.map((d, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", `Chặng ${i + 1}: ${d.title}`);
    b.addEventListener("click", () => go(i));
    dotsBox.appendChild(b);
    return b;
  });

  function stop() { if (ctx) { ctx.dead = true; ctx = null; } }
  function start() {
    stop();
    if (!visible) return;
    stage.innerHTML = "";
    const svg = S("svg", { viewBox: "0 0 800 450", role: "img", "aria-label": DATA[idx].title, preserveAspectRatio: "xMidYMid meet" });
    stage.appendChild(svg);
    ctx = makeCtx(svg);
    SCENES[idx](ctx).catch(e => { if (!(e instanceof Cancel)) console.error(e); });
  }
  function caption() {
    const d = DATA[idx];
    el("storyYear").textContent = d.year;
    el("storyCount").textContent = `Chặng ${idx + 1}/${DATA.length}`;
    el("storyTitle").textContent = d.title;
    el("storyText").innerHTML = d.text;
    dots.forEach((b, i) => { b.classList.toggle("on", i === idx); b.classList.toggle("seen", seen.has(i) && i !== idx); });
    btnPrev.disabled = idx === 0;
    const last = idx === DATA.length - 1;
    btnNext.textContent = last ? "Bắt đầu học ▶" : "Tiếp ▶";
    btnNext.classList.toggle("big", last);
    btnNext.classList.toggle("pulse", last);
  }
  function go(i) {
    idx = clamp(i, 0, DATA.length - 1);
    seen.add(idx);
    caption();
    start();
  }
  btnPrev.addEventListener("click", () => go(idx - 1));
  btnNext.addEventListener("click", () => {
    if (idx === DATA.length - 1) {
      const t = document.getElementById("muctieu");
      t && t.scrollIntoView({ behavior: "smooth", block: "start" });
    } else go(idx + 1);
  });
  root.addEventListener("keydown", e => {
    if (e.key === "ArrowRight") { e.preventDefault(); btnNext.click(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); btnPrev.click(); }
  });
  // phóng to toàn màn hình (Fullscreen API; nếu trình duyệt không cho thì dùng lớp phủ kín màn hình)
  const btnFull = el("storyFull");
  const isFull = () => document.fullscreenElement === root;
  function setMax(on) {
    root.classList.toggle("is-max", on);
    document.body.classList.toggle("story-lock", on);
    btnFull.textContent = on ? "✕ Thu nhỏ" : "⛶ Toàn màn hình";
    if (on) root.focus({ preventScroll: true });
  }
  btnFull.addEventListener("click", async () => {
    if (root.classList.contains("is-max")) {
      if (isFull()) { try { await document.exitFullscreen(); } catch (e) { } }
      setMax(false);
      return;
    }
    setMax(true);
    try { await root.requestFullscreen(); } catch (e) { /* vẫn dùng lớp phủ */ }
  });
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement) setMax(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && root.classList.contains("is-max") && !isFull()) setMax(false); });

  // chỉ chạy hoạt cảnh khi khung truyện đang hiện trên màn hình
  new IntersectionObserver(es => {
    const v = es[0].isIntersecting;
    if (v === visible) return;
    visible = v;
    v ? start() : stop();
  }, { threshold: 0.15 }).observe(root);

  caption();
  // trạng thái ban đầu (phòng khi trình duyệt chưa kịp báo IntersectionObserver)
  const r0 = root.getBoundingClientRect();
  if (r0.top < innerHeight * .85 && r0.bottom > innerHeight * .15) { visible = true; start(); }
})();
