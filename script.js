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

})();
