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

  function buildFilename(lamMM, dMM, Lm, N, side, style, scale) {
    return "lam" + Math.round(lamMM) + "_d" + Math.round(dMM) + "_L" + fmtLForFilename(Lm) +
      "_N" + Math.round(N) + "_" + side + "_" + style + "_x" + scale + ".png";
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

  // ===================================================================
  // 10. 좌측 — 실공간 경로선 (phasor-steps drawStep2Left 이식)
  //     차이점: (a) 인자로 canvas 엘리먼트·forceScale을 받는다(캡처용) (b) 실척 유지 +
  //     min(N,20,rankMax) 상한 + "⋮" 글리프로 통일(원본의 "옅어지는 점 2개" 대신)
  //     (c) state.captureMode일 때 설명 텍스트를 생략한다.
  // ===================================================================
  function drawStep2Left(cv, forceScale) {
    var c = prep(cv, forceScale);
    var ctx = c.ctx, W = c.W, H = c.H;
    var captureMode = state.captureMode;

    if (!captureMode) {
      panelTitle(ctx, W, "2단계 (좌) 실공간 — 정면 관측점 P까지 경로",
        "왼쪽: 평면파 입사(파면 간격 = λ, 치수 참조) · 오른쪽: P까지 경로(압축, 실척 아님)");
    }

    var plotTop = PLOT_TOP, plotBottom = PLOT_BOTTOM;
    var cyA = (plotTop + plotBottom) / 2;
    var wireX = 200;
    var Lm = state.L, dm = dM(), lam = lamM();
    var guardL = L_GUARD_LAMBDAS * lam;

    var noteRows = null;
    if (!captureMode) {
      noteRows = [["● 도선(가운데 A 굵은 검정, 이웃 진한→옅은 주황)", C_INK]];
      if (Lm >= guardL) {
        noteRows.push(["경로선 색 = 오른쪽 나선과 동일 색 문법(거리→색)", "rgba(230,126,34,0.85)"]);
        noteRows.push(["바깥 도선일수록 P까지 경로가 길다 (R_n 수치 참조)", "#555"]);
      } else {
        noteRows.push(["L이 너무 가까워 경로선·P·R_n 표시를 생략함", "#555"]);
      }
      noteRows.push(["회색 점선 = 입사 평면파의 파면 (간격 = 파장 λ)", C_GREY]);
    }

    var spacing = state.dMM * PX_PER_MM;
    var nShownActual = shownPairsFor(state.N, state.dMM);
    var dotR = Math.min(5, 0.42 * spacing);

    var WAVE_PX = 40, WAVE_COUNT = 3;
    var waveXs = [];
    for (var wi = 0; wi < WAVE_COUNT; wi++) waveXs.push(wireX - 40 - wi * WAVE_PX);
    ctx.save();
    ctx.strokeStyle = "#C3C9CF"; ctx.lineWidth = 1.4; ctx.setLineDash([2, 5]);
    waveXs.forEach(function (wx) {
      ctx.beginPath(); ctx.moveTo(wx, plotTop); ctx.lineTo(wx, plotBottom); ctx.stroke();
    });
    ctx.setLineDash([]);
    ctx.restore();

    // λ 치수선 — 화살표(그래픽)와 숫자 라벨 모두 유지(축 스케일 정보로 간주, captureMode에서도 유지)
    var dimX1 = waveXs[0], dimX2 = waveXs[1], dimY = cyA + 60, dimMidX = (dimX1 + dimX2) / 2;
    arrow(ctx, dimMidX, dimY, dimX1, dimY, C_INK, 1.4, 7);
    arrow(ctx, dimMidX, dimY, dimX2, dimY, C_INK, 1.4, 7);
    ctx.save();
    ctx.font = "bold 16px system-ui, sans-serif";
    var lamLabel = "λ = " + state.lamMM + " mm";
    var lamLabelW = ctx.measureText(lamLabel).width;
    backdrop(ctx, dimMidX - lamLabelW / 2 - 4, dimY - 24, lamLabelW + 8, 18);
    ctx.fillStyle = C_INK; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText(lamLabel, dimMidX, dimY - 8);
    ctx.restore();

    if (!captureMode) {
      arrow(ctx, 16, plotTop + 16, 155, plotTop + 16, C_GREY, 3, 10);
      ctx.save();
      ctx.font = "bold 16px system-ui, sans-serif"; ctx.fillStyle = C_GREY;
      ctx.textAlign = "left"; ctx.textBaseline = "bottom";
      ctx.fillText("평면파 입사", 16, plotTop + 6);
      ctx.restore();
    }

    if (Lm >= guardL) {
      var pixelL = 260 + (Lm - 0.3) / (3 - 0.3) * 120;
      var Px = wireX + pixelL, Py = cyA;

      ctx.save();
      ctx.lineWidth = 1.3;
      for (var rank = nShownActual; rank >= 0; rank--) {
        ctx.strokeStyle = wireColor(rank, WIRE_PAIRS_SHOWN);
        if (rank === 0) {
          ctx.beginPath(); ctx.moveTo(wireX, cyA); ctx.lineTo(Px, Py); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.moveTo(wireX, cyA - rank * spacing); ctx.lineTo(Px, Py); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(wireX, cyA + rank * spacing); ctx.lineTo(Px, Py); ctx.stroke();
        }
      }
      ctx.restore();

      ctx.save();
      ctx.fillStyle = C_RED;
      ctx.beginPath(); ctx.arc(Px, Py, 6, 0, TWO_PI); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(Px, Py, 6, 0, TWO_PI); ctx.stroke();
      ctx.restore();

      var pLabelText = "P (정면 관측점)";
      var pLabelX = 520;
      var pLabelY = plotBottom + 23;
      if (!captureMode) {
        ctx.save();
        ctx.font = "bold 16px system-ui, sans-serif";
        var pLabelW = ctx.measureText(pLabelText).width;
        backdrop(ctx, pLabelX - pLabelW / 2 - 6, pLabelY - 9, pLabelW + 12, 16);
        ctx.fillStyle = C_RED; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(pLabelText, pLabelX, pLabelY);
        ctx.restore();
      }

      if (!captureMode) {
        // 빨간 안내 점선 — captureMode에서는 제거(2026-07-21 지시서 §2-1 항목3)
        ctx.save();
        ctx.strokeStyle = C_RED; ctx.lineWidth = 1; ctx.globalAlpha = 0.55; ctx.setLineDash([3, 3]);
        var dropY = pLabelY - 8;
        ctx.beginPath();
        ctx.moveTo(Px, Py + 7);
        ctx.lineTo(Px, dropY);
        ctx.lineTo(pLabelX, dropY);
        ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
        ctx.restore();
      }

      if (!captureMode) {
        var rnRanks = [];
        [0, Math.round(nShownActual / 2), nShownActual].forEach(function (rk) {
          if (rnRanks.indexOf(rk) === -1) rnRanks.push(rk);
        });
        rnRanks.forEach(function (rk) {
          var Rn = Math.hypot(Lm, rk * dm);
          var yPix = cyA - rk * spacing;
          arrowLabel(ctx, W, wireX + 26, yPix, "R_" + rk + " = " + Rn.toFixed(3) + " m", C_INK);
        });
      }

      if (!captureMode) {
        var breakX = (wireX + Px) / 2;
        ctx.save();
        ctx.font = "bold 16px system-ui, sans-serif"; ctx.fillStyle = C_INK;
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        var legendTop = H - noteRows.length * 18 - 8 - 3;
        var captionY = legendTop - 8;
        ctx.fillText("⫽  L = " + Lm.toFixed(2) + " m  (" + (Lm / lam).toFixed(1) + " λ)", breakX, captionY);
        ctx.restore();
      }
    } else if (!captureMode) {
      ctx.save();
      ctx.font = "bold 18px system-ui, sans-serif";
      var msg = "너무 가까움: 이 그림 부적용";
      var mw = ctx.measureText(msg).width;
      backdrop(ctx, W / 2 - mw / 2 - 8, cyA - 26, mw + 16, 30);
      ctx.fillStyle = C_RED; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(msg, W / 2, cyA - 11);
      ctx.font = "13px system-ui, sans-serif";
      var sub = "(L = " + Lm.toFixed(2) + " m < " + L_GUARD_LAMBDAS + "λ = " + guardL.toFixed(2) + " m)";
      var sw = ctx.measureText(sub).width;
      backdrop(ctx, W / 2 - sw / 2 - 6, cyA + 4, sw + 12, 18);
      ctx.fillStyle = "#8A9199";
      ctx.fillText(sub, W / 2, cyA + 13);
      ctx.restore();
    }

    // 도선 점 — 이웃(색) + 가운데 A(굵은 검정)
    for (var n = 1; n <= nShownActual; n++) {
      ctx.fillStyle = wireColor(n, WIRE_PAIRS_SHOWN);
      ctx.beginPath(); ctx.arc(wireX, cyA - n * spacing, dotR, 0, TWO_PI); ctx.fill();
      ctx.beginPath(); ctx.arc(wireX, cyA + n * spacing, dotR, 0, TWO_PI); ctx.fill();
    }
    ctx.fillStyle = C_INK;
    ctx.beginPath(); ctx.arc(wireX, cyA, 7.5, 0, TWO_PI); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(wireX, cyA, 7.5, 0, TWO_PI); ctx.stroke();

    // "⋮" — 표시가 N에 못 미칠 때(20 상한이든 밴드 물리 한계든) 배열이 계속됨을 표시. captureMode에서도 유지.
    if (nShownActual < state.N) {
      ctx.save();
      ctx.font = "16px system-ui, sans-serif"; ctx.fillStyle = "#9AA3AB";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("⋮", wireX, plotTop + 8);
      ctx.fillText("⋮", wireX, plotBottom - 8);
      ctx.restore();
    }

    if (!captureMode) {
      notes(ctx, W, H, noteRows);
    }
  }

  // ===================================================================
  // 9. 상태 + 조작부 바인딩
  // ===================================================================
  var state = { lamMM: 60, dMM: 15, L: 1.00, N: 5, scale: 2, captureMode: false, phasorStyle: "spiral" };
  function lamM() { return state.lamMM / 1000; }
  function dM() { return state.dMM / 1000; }

  function syncLabels() {
    document.getElementById("lamVal").textContent = state.lamMM.toFixed(0) + " mm";
    document.getElementById("dVal").textContent = state.dMM.toFixed(0) + " mm";
    document.getElementById("lVal").textContent = state.L.toFixed(2) + " m";
    document.getElementById("nVal").textContent = state.N;
  }

  // ===================================================================
  // 11. 우측 — 위상자 나선 (phasor-steps drawStep2Right 이식)
  //     차이점: (a) 인자로 canvas 엘리먼트·forceScale (b) nMax = CORNU_HALF(3000, 원본 고정값)
  //     대신 state.N — 나선이 정확히 N항까지만 더해진다 (c) captureMode 텍스트 생략,
  //     수렴점 라벨은 dottedTarget에 null을 넘겨 마커만 남긴다.
  // ===================================================================
  function drawStep2Right(cv, forceScale) {
    var c = prep(cv, forceScale);
    var ctx = c.ctx, W = c.W, H = c.H;
    var captureMode = state.captureMode;
    var kk = k(lamM()), d = dM(), dl = state.dMM / state.lamMM;
    var nMax = state.N;
    var pts = cornuPartials(kk, A_WIRE, d, state.L, nMax);
    var end = pts[pts.length - 1];
    var target = forwardExact(kk, A_WIRE, d, state.L);
    var s0 = s0Exact(kk, A_WIRE, d);
    var open = nOpenOrders(dl);

    if (!captureMode) {
      panelTitle(ctx, W, "정면 관측점 P에서의 산란파 합", "복소평면 (S0_VIEW=" + S0_VIEW + " 전역 고정) · 정면 진행파 기준 위상");
    }
    var map = complexPlane(ctx, W, H, 50, 126, S0_VIEW);
    var O = map({ re: 0, im: 0 });
    clipToPlot(ctx, map);

    ctx.save();
    ctx.lineWidth = 1.5; ctx.lineJoin = "round";
    function farBatch(iStart, iEnd) {
      if (iEnd <= iStart) return;
      ctx.strokeStyle = wireColor(WIRE_PAIRS_SHOWN + 1, WIRE_PAIRS_SHOWN);
      ctx.beginPath();
      for (var i = iStart; i <= iEnd; i++) {
        var p = map(pts[i]);
        if (i === iStart) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke();
    }
    farBatch(0, nMax - WIRE_PAIRS_SHOWN);
    farBatch(nMax + WIRE_PAIRS_SHOWN + 1, 2 * nMax + 1);
    var style = state.phasorStyle;
    for (var i2 = Math.max(0, nMax - WIRE_PAIRS_SHOWN); i2 <= Math.min(2 * nMax, nMax + WIRE_PAIRS_SHOWN); i2++) {
      var n2 = i2 - nMax, rank2 = Math.abs(n2);
      var p0 = map(pts[i2]), p1 = map(pts[i2 + 1]);
      var col2 = wireColor(rank2, WIRE_PAIRS_SHOWN);
      if (style === "B") {
        arrow(ctx, p0[0], p0[1], p1[0], p1[1], col2, 1.5, 6);
      } else {
        ctx.strokeStyle = col2;
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
      }
    }
    ctx.restore();
    ctx.restore();

    var pe = map(end);
    arrow(ctx, O[0], O[1], pe[0], pe[1], C_INK, 2.4, 9);
    dottedTarget(ctx, W, map(target), C_RED, captureMode ? null : (open > 1 ? "수렴점 G∞ (≠ s₀)" : "수렴점 = s₀"));

    var ux = 100, uy = 96, unit = 62;
    if (!captureMode) {
      ctx.save();
      ctx.font = "bold 16px system-ui, sans-serif";
      var headTxt = "인셋: 입사파(회색·=1)  vs  s₀(빨강)";
      var hw = ctx.measureText(headTxt).width;
      backdrop(ctx, ux - 16, uy - 40, hw + 10, 18);
      ctx.fillStyle = C_INK; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(headTxt, ux - 11, uy - 38);
      ctx.restore();
    }
    arrow(ctx, ux, uy, ux + unit, uy, C_GREY, 3, 9);
    if (!captureMode) {
      arrowLabel(ctx, W, ux + unit + 8, uy, "=1", C_GREY);
    }
    var sAng = Math.atan2(s0.im, s0.re), sLen = unit * mag(s0);
    var sx = ux + sLen * Math.cos(sAng), sy = uy - sLen * Math.sin(sAng);
    arrow(ctx, ux, uy, sx, sy, C_RED, 3, 9);

    if (!captureMode) {
      var err = relErr(end, target);
      var rows = [["L =", state.L.toFixed(2) + " m  (" + (state.L / lamM()).toFixed(1) + " λ)", C_BLUE]];
      if (open > 1) rows.push(["|G∞| =", mag(target).toFixed(4), C_INK]);
      rows.push(["|s₀| =", mag(s0).toFixed(4), C_RED]);
      rows.push(["전파 차수 =", String(open)]);
      rows.push(["나선 오차 =", (err * 100).toFixed(2) + " %"]);
      readout(ctx, W, 52, rows);

      var s0DefRow = ["s₀ = 모든 도선의 산란 전기장을 P에서 더한 값 (입사파 = 1 기준)", C_INK];
      if (open > 1) {
        notes(ctx, W, H, [
          s0DefRow,
          ["전파 차수 " + open + "개 — 수렴점이 s₀ 하나로 안 읽힌다", C_RED],
          ["L을 바꾸면 도착점이 움직인다 (층 2 이음매)", "#555"]
        ]);
      } else {
        notes(ctx, W, H, [
          s0DefRow,
          ["전파 차수 1개 (λ > d) — 수렴점 = s₀", "#555"],
          ["L을 바꿔도 도착점은 제자리 (s₀는 L에 무관)", C_BLUE]
        ]);
      }
    }
  }

  function render() {
    drawStep2Left(document.getElementById("canvas2L"));
    drawStep2Right(document.getElementById("canvas2R"));
    syncLabels();
  }

  function bind() {
    document.getElementById("lamSlider").addEventListener("input", function () { state.lamMM = +this.value; render(); });
    document.getElementById("dSlider").addEventListener("input", function () { state.dMM = +this.value; render(); });
    document.getElementById("lSlider").addEventListener("input", function () { state.L = +this.value; render(); });
    document.getElementById("nSlider").addEventListener("input", function () { state.N = +this.value; render(); });

    var scaleBtns = document.querySelectorAll("#scaleBtns button");
    scaleBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        state.scale = +b.dataset.scale;
        scaleBtns.forEach(function (x) { x.classList.toggle("active", x === b); });
      });
    });

    var styleBtns = document.querySelectorAll("#styleBtns button");
    styleBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        state.phasorStyle = b.dataset.style;
        styleBtns.forEach(function (x) { x.classList.toggle("active", x === b); });
        render();
      });
    });

    document.getElementById("captureBtn").addEventListener("click", doCapture);
  }

  // ===================================================================
  // 12. 캡처 — L 유효성 confirm → 오프스크린 고해상도 렌더 → PNG 2장 저장
  // ===================================================================
  function saveCanvas(cv, filename) {
    cv.toBlob(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }, "image/png");
  }

  function doCapture() {
    if (needsLGuardConfirm(state.L, lamM())) {
      var msg = "현재 관측 거리 L(" + state.L.toFixed(2) + "m)이 파장 λ(" + state.lamMM +
        "mm)의 5배보다 짧습니다. 이 조건에서는 2단계(좌) 경로 그림이 물리적으로 부적용이며, " +
        "논문 그림으로 부적절할 수 있습니다. 그래도 캡처할까요?";
      if (!window.confirm(msg)) return;
    }

    state.captureMode = true;
    var offL = document.createElement("canvas"); offL.width = STAGE_W; offL.height = STAGE_H;
    var offR = document.createElement("canvas"); offR.width = STAGE_W; offR.height = STAGE_H;
    drawStep2Left(offL, state.scale);
    drawStep2Right(offR, state.scale);
    state.captureMode = false;
    render();   // 화면 캔버스를 정상(텍스트 포함) 상태로 재렌더

    saveCanvas(offL, buildFilename(state.lamMM, state.dMM, state.L, state.N, "left", state.phasorStyle, state.scale));
    saveCanvas(offR, buildFilename(state.lamMM, state.dMM, state.L, state.N, "right", state.phasorStyle, state.scale));
  }

  if (typeof document !== "undefined") {
    bind();
    render();
    if (!runPaperConditionsGate()) {
      console.warn("phasor-figure: 논문 검증 3조건 중 일부가 좌측 상한(N)을 못 채웁니다 — PX_PER_MM 또는 밴드 높이 조정 필요");
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      shownPairsFor: shownPairsFor,
      buildFilename: buildFilename,
      needsLGuardConfirm: needsLGuardConfirm,
      runPaperConditionsGate: runPaperConditionsGate,
      drawStep2Left: drawStep2Left,
      drawStep2Right: drawStep2Right,
      state: state
    };
  }

})();
