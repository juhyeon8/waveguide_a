/* =====================================================================
 * Faraday/phasor-figure — 논문 그림 전용 2단계 캡처 페이지 (phasor-steps와 완전 독립)
 * 물리 코어는 Faraday/phasor-steps/script.js 12~141행에서 그대로 복사(PRESET_PAIRS 제외 — 이 페이지엔
 * 프리셋 버튼이 없다). drawStep2Left/drawStep2Right도 같은 파일에서 복사해 캔버스 인자를 받도록
 * 리팩터링한다. phasor-steps 원본은 미수정.
 * ===================================================================== */
(function () {
  "use strict";

  // ===================================================================
  // 0. 상수 (v6: λ 고정 제거 — k(lam)을 인자로 받는다)
  // ===================================================================
  var TWO_PI = Math.PI * 2;
  var FLOQUET_M = 200;
  var A_WIRE = 0.0005;           // 0.5 mm 고정
  var CORNU_HALF = 3000;         // 이 페이지에서는 우측 나선 항 수를 N으로 대체하므로 미사용(Task 7)
  var PX_PER_MM = 3;             // TODO(Task 3): 1.3으로 재정의 — 검증 게이트 통과용
  var C_RED = "#C0392B", C_BLUE = "#2471A3", C_INK = "#111111", C_GREY = "#8A9199", C_ORANGE = "#E67E22";
  function k(lam) { return TWO_PI / lam; }

  // ===================================================================
  // 1. 베셀/한켈 — Faraday/script.js 그대로 (A&S 9.4 다항 근사)
  // ===================================================================
  function besselJ0(x) {
    var ax = Math.abs(x), y, z, f, t;
    if (ax < 3) {
      y = (x / 3) * (x / 3);
      return 1 + y * (-2.2499997 + y * (1.2656208 + y * (-0.3163866 +
        y * (0.0444479 + y * (-0.0039444 + y * 0.0002100)))));
    }
    z = 3 / ax;
    f = 0.79788456 + z * (-0.00000077 + z * (-0.00552740 + z * (-0.00009512 +
      z * (0.00137237 + z * (-0.00072805 + z * 0.00014476)))));
    t = ax - 0.78539816 + z * (-0.04166397 + z * (-0.00003954 + z * (0.00262573 +
      z * (-0.00054125 + z * (-0.00029333 + z * 0.00013558)))));
    return f / Math.sqrt(ax) * Math.cos(t);
  }
  function besselY0(x) {
    var y, z, f, t, poly;
    if (x < 3) {
      y = (x / 3) * (x / 3);
      poly = 0.36746691 + y * (0.60559366 + y * (-0.74350384 + y * (0.25300117 +
        y * (-0.04261214 + y * (0.00427916 + y * (-0.00024846))))));
      return (2 / Math.PI) * Math.log(x / 2) * besselJ0(x) + poly;
    }
    z = 3 / x;
    f = 0.79788456 + z * (-0.00000077 + z * (-0.00552740 + z * (-0.00009512 +
      z * (0.00137237 + z * (-0.00072805 + z * 0.00014476)))));
    t = x - 0.78539816 + z * (-0.04166397 + z * (-0.00003954 + z * (0.00262573 +
      z * (-0.00054125 + z * (-0.00029333 + z * 0.00013558)))));
    return f / Math.sqrt(x) * Math.sin(t);
  }
  function hankel0(x) { return { re: besselJ0(x), im: besselY0(x) }; }

  // ===================================================================
  // 2. 복소 도우미
  // ===================================================================
  function cAdd(u, v) { return { re: u.re + v.re, im: u.im + v.im }; }
  function cMul(u, v) { return { re: u.re * v.re - u.im * v.im, im: u.re * v.im + u.im * v.re }; }
  function cScale(u, s) { return { re: u.re * s, im: u.im * s }; }
  function cInv(u) { var g = u.re * u.re + u.im * u.im; return { re: u.re / g, im: -u.im / g }; }
  function cExp(t) { return { re: Math.cos(t), im: Math.sin(t) }; }
  function mag(u) { return Math.hypot(u.re, u.im); }
  function relErr(u, v) { return Math.hypot(u.re - v.re, u.im - v.im) / mag(v); }

  // ===================================================================
  // 3. 물리
  // ===================================================================
  function denomPartials(k, a, d, N) {
    var pts = new Array(N + 1);
    var D = hankel0(k * a);
    pts[0] = D;
    for (var n = 1; n <= N; n++) {
      var h = hankel0(k * n * d);
      D = cAdd(D, { re: 2 * h.re, im: 2 * h.im });
      pts[n] = D;
    }
    return pts;
  }

  function floquetZ(k, a, d) {
    var tpd = TWO_PI / d, sRe = 0, sIm = 0;
    for (var m = -FLOQUET_M; m <= FLOQUET_M; m++) {
      var al = m * tpd, kk = k * k - al * al, krRe, krIm;
      if (kk >= 0) { krRe = Math.sqrt(kk); krIm = 0; } else { krRe = 0; krIm = Math.sqrt(-kk); }
      var g = krRe * krRe + krIm * krIm;
      if (g < 1e-30) continue;
      var ikRe = krRe / g, ikIm = -krIm / g;
      var ex = Math.exp(-krIm * a);
      var eRe = ex * Math.cos(krRe * a), eIm = ex * Math.sin(krRe * a);
      sRe += ikRe * eRe - ikIm * eIm;
      sIm += ikRe * eIm + ikIm * eRe;
    }
    var f = 2 / d;
    return { re: -f * sIm, im: f * sRe };
  }

  function denomExact(k, a, d) { return cMul({ re: 0, im: -1 }, floquetZ(k, a, d)); }
  function currentExact(k, a, d) { return cMul({ re: 0, im: -1 }, cInv(floquetZ(k, a, d))); }
  function s0Exact(k, a, d) { return cScale(currentExact(k, a, d), 2 / (d * k)); }

  function cornuPartials(k, a, d, L, nMax) {
    var I = currentExact(k, a, d);
    var rot = cExp(-k * L);
    var pts = new Array(2 * nMax + 2);
    var s = { re: 0, im: 0 };
    pts[0] = { re: 0, im: 0 };
    for (var i = 0, n = -nMax; n <= nMax; n++, i++) {
      s = cAdd(s, cMul(I, hankel0(k * Math.hypot(L, n * d))));
      pts[i + 1] = cMul(s, rot);
    }
    return pts;
  }

  function forwardExact(k, a, d, L) {
    var I = currentExact(k, a, d), tpd = TWO_PI / d;
    var s = { re: 0, im: 0 };
    for (var m = -FLOQUET_M; m <= FLOQUET_M; m++) {
      var al = m * tpd, kk = k * k - al * al, kr, ki;
      if (kk >= 0) { kr = Math.sqrt(kk); ki = 0; } else { kr = 0; ki = Math.sqrt(-kk); }
      var g = kr * kr + ki * ki; if (g < 1e-30) continue;
      var ex = Math.exp(-ki * L);
      s = cAdd(s, cMul({ re: kr / g, im: -ki / g },
        { re: ex * Math.cos(kr * L), im: ex * Math.sin(kr * L) }));
    }
    return cMul(cMul(I, cScale(s, 2 / d)), cExp(-k * L));
  }

  function nOpenOrders(dOverLam) { return 2 * Math.floor(dOverLam + 1e-9) + 1; }

  // ===================================================================
  // 6. 캔버스 도우미 (phasor-steps script.js 그대로 — prep()만 forceScale 인자 추가:
  //    캡처 시 오프스크린 캔버스를 devicePixelRatio가 아니라 선택한 배율로 그리기 위함)
  // ===================================================================
  function prep(cv, forceScale) {
    var dpr = forceScale || window.devicePixelRatio || 1;
    if (cv.dataset.ready !== "1") {
      cv.style.width = cv.width + "px";
      cv.dataset.logicalW = cv.width; cv.dataset.logicalH = cv.height;
      cv.dataset.ready = "1";
    }
    var W = +cv.dataset.logicalW, H = +cv.dataset.logicalH;
    var needW = Math.round(W * dpr), needH = Math.round(H * dpr);
    if (cv.width !== needW || cv.height !== needH) {
      cv.width = needW;
      cv.height = needH;
    }
    var ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, W, H);
    return { ctx: ctx, W: W, H: H };
  }

  function niceStep(range, target) {
    var raw = range / target;
    var m = Math.pow(10, Math.floor(Math.log10(raw)));
    var n = raw / m;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * m;
  }

  function arrow(ctx, x1, y1, x2, y2, color, width, head) {
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    if (len < head * 1.2) return;
    var a = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(a - 0.42), y2 - head * Math.sin(a - 0.42));
    ctx.lineTo(x2 - head * Math.cos(a + 0.42), y2 - head * Math.sin(a + 0.42));
    ctx.closePath(); ctx.fill();
  }

  function complexPlane(ctx, W, H, top, bottomReserve, R) {
    var padX = 34;
    var size = Math.min(W - padX * 2, H - top - bottomReserve);
    var cx = W / 2, cy = top + size / 2;
    var sc = (size / 2) / R;
    var step = niceStep(R * 2, 5);
    var t;

    ctx.save();
    ctx.strokeStyle = "#EDF0F3"; ctx.lineWidth = 1;
    for (var g = -Math.floor(R / step) * step; g <= R + 1e-9; g += step) {
      var gx = cx + g * sc, gy = cy - g * sc;
      ctx.beginPath(); ctx.moveTo(gx, cy - size / 2); ctx.lineTo(gx, cy + size / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - size / 2, gy); ctx.lineTo(cx + size / 2, gy); ctx.stroke();
    }
    ctx.strokeStyle = "#9AA3AB"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(cx - size / 2, cy); ctx.lineTo(cx + size / 2, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - size / 2); ctx.lineTo(cx, cy + size / 2); ctx.stroke();
    ctx.font = "13px system-ui, sans-serif"; ctx.fillStyle = "#666";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (t = -Math.floor(R / step) * step; t <= R + 1e-9; t += step) {
      if (Math.abs(t) < 1e-9) continue;
      ctx.fillText(fmtTick(t), cx + t * sc, cy + 5);
    }
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    for (t = -Math.floor(R / step) * step; t <= R + 1e-9; t += step) {
      if (Math.abs(t) < 1e-9) continue;
      ctx.fillText(fmtTick(t), cx - 5, cy - t * sc);
    }
    ctx.fillStyle = C_INK; ctx.font = "bold 15px system-ui, sans-serif";
    ctx.textAlign = "right"; ctx.textBaseline = "bottom";
    ctx.fillText("Re", cx + size / 2, cy - 5);
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("Im", cx + 6, cy - size / 2);
    ctx.fillStyle = "#666";
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, TWO_PI); ctx.fill();
    ctx.restore();

    var map = function (z) { return [cx + z.re * sc, cy - z.im * sc]; };
    map.box = { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
    return map;
  }

  function clipToPlot(ctx, map) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(map.box.x, map.box.y, map.box.w, map.box.h);
    ctx.clip();
  }

  function backdrop(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  function fmtTick(t) {
    var a = Math.abs(t);
    if (a >= 1000 || (a < 0.01 && a > 0)) return t.toExponential(0);
    return String(Math.round(t * 1000) / 1000);
  }

  function dottedTarget(ctx, W, p, color, label) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, TWO_PI); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(p[0] - 13, p[1]); ctx.lineTo(p[0] + 13, p[1]);
    ctx.moveTo(p[0], p[1] - 13); ctx.lineTo(p[0], p[1] + 13);
    ctx.stroke();
    if (label) {
      ctx.font = "bold 16px system-ui, sans-serif";
      var w = ctx.measureText(label).width;
      var lx = Math.min(Math.max(p[0], w / 2 + 6), W - w / 2 - 6);
      backdrop(ctx, lx - w / 2 - 3, p[1] - 32, w + 6, 17);
      ctx.fillStyle = color; ctx.textBaseline = "bottom"; ctx.textAlign = "center";
      ctx.fillText(label, lx, p[1] - 16);
    }
    ctx.restore();
  }

  function panelTitle(ctx, W, text, sub) {
    ctx.save();
    ctx.font = "bold 17px system-ui, sans-serif";
    ctx.fillStyle = C_INK; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(text, 10, 8);
    if (sub) {
      ctx.font = "13px system-ui, sans-serif"; ctx.fillStyle = "#666";
      ctx.fillText(sub, 10, 29);
    }
    ctx.restore();
  }

  function readout(ctx, W, y, rows) {
    ctx.save();
    ctx.font = "bold 16px system-ui, sans-serif";
    var wmax = 0;
    rows.forEach(function (r) { wmax = Math.max(wmax, ctx.measureText(r[0] + " " + r[1]).width); });
    backdrop(ctx, W - 14 - wmax, y - 3, wmax + 10, rows.length * 20 + 4);
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    rows.forEach(function (r, i) {
      ctx.fillStyle = r[2] || C_INK;
      ctx.fillText(r[0] + " " + r[1], W - 8, y + i * 20);
    });
    ctx.restore();
  }

  function notes(ctx, W, H, rows) {
    ctx.save();
    ctx.font = "bold 16px system-ui, sans-serif";
    var wmax = 0;
    rows.forEach(function (r) { wmax = Math.max(wmax, ctx.measureText(r[0]).width); });
    var y0 = H - rows.length * 18 - 8;
    backdrop(ctx, 6, y0 - 3, wmax + 10, rows.length * 18 + 6);
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    rows.forEach(function (r, i) {
      ctx.fillStyle = r[1] || "#555";
      ctx.fillText(r[0], 10, y0 + i * 18);
    });
    ctx.restore();
  }

  // ===================================================================
  // 7. 색 문법 — 1단계와 동일 램프. WIRE_PAIRS_SHOWN(색 정규화용, =10)은
  //    좌측 표시 쌍 수 상한(LEFT_PAIR_CAP=20, Task 3)과 별개 상수다.
  // ===================================================================
  var WIRE_PAIRS_SHOWN = 10;
  function wireColor(rank, total) {
    var t = Math.min(1, rank / Math.max(1, total));
    var r = Math.round(123 + (245 - 123) * t);
    var g = Math.round(45 + (197 - 45) * t);
    var b = Math.round(0 + (66 - 0) * t);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  function arrowLabel(ctx, W, x, y, text, color) {
    ctx.save();
    ctx.font = "bold 16px system-ui, sans-serif";
    var w = ctx.measureText(text).width;
    var lx = Math.min(Math.max(x, 4), W - w - 4);
    backdrop(ctx, lx - 3, y - 9, w + 6, 16);
    ctx.fillStyle = color; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    ctx.fillText(text, lx, y);
    ctx.restore();
  }

  // ===================================================================
  // 8. 레이아웃 상수 + 순수 헬퍼 (Node로 단위 테스트 가능 — DOM 의존 없음)
  // ===================================================================
  var STAGE_W = 620, STAGE_H = 640;
  var PLOT_TOP = 60, PLOT_BOTTOM = STAGE_H - 90;
  var LEFT_PAIR_CAP = 20;
  var L_GUARD_LAMBDAS = 5;
  var S0_VIEW = 1.152;
  PX_PER_MM = 1.3;   // Task 1에서 3으로 임시 선언했던 것을 재정의 — 검증 3조건 게이트 통과용(아래 주석 참조)
  // PX_PER_MM=1.3 근거: 좌측 밴드 halfBand=(PLOT_BOTTOM-PLOT_TOP)/2=245px. 논문 검증조건 A(d=30mm)에서
  // rankMax=floor(245/(30*PX_PER_MM))가 5 이상이어야 한다. PX_PER_MM=3이면 rankMax=2로 미달, 1.3이면
  // rankMax=6으로 통과(runPaperConditionsGate가 이 값들을 렌더 전에 콘솔로 재확인한다).

  function shownPairsFor(N, dMM) {
    var spacing = dMM * PX_PER_MM;
    var halfBand = (PLOT_BOTTOM - PLOT_TOP) / 2;
    var rankMax = Math.max(0, Math.floor(halfBand / spacing));
    return Math.min(N, LEFT_PAIR_CAP, rankMax);
  }

  function fmtLForFilename(Lm) {
    return Lm.toFixed(2).replace(".", "p");
  }

  function buildFilename(lamMM, dMM, Lm, N, side, scale) {
    return "lam" + Math.round(lamMM) + "_d" + Math.round(dMM) + "_L" + fmtLForFilename(Lm) +
      "_N" + Math.round(N) + "_" + side + "_x" + scale + ".png";
  }

  function needsLGuardConfirm(Lm, lam) {
    return Lm < L_GUARD_LAMBDAS * lam;
  }

  function runPaperConditionsGate() {
    var conditions = [
      { lam: 60, d: 30, N: 5, label: "조건A (λ/d=2)" },
      { lam: 60, d: 15, N: 5, label: "조건B (λ/d=4)" },
      { lam: 120, d: 15, N: 5, label: "조건C (λ/d=8)" }
    ];
    var allOk = true;
    conditions.forEach(function (c) {
      var shown = shownPairsFor(c.N, c.d);
      var ok = shown === c.N;
      if (!ok) allOk = false;
      console.log((ok ? "PASS " : "FAIL ") + c.label + " N=" + c.N + " d=" + c.d + "mm → 좌측 표시 " +
        shown + "쌍" + (ok ? "" : " (기대 " + c.N + "쌍, rankMax 부족 — PX_PER_MM 또는 밴드 높이 조정 필요)"));
    });
    return allOk;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      shownPairsFor: shownPairsFor,
      buildFilename: buildFilename,
      needsLGuardConfirm: needsLGuardConfirm,
      runPaperConditionsGate: runPaperConditionsGate
    };
  }

})();
