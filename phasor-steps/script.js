/* =====================================================================
 * phasor_steps_spec_v6 — 층 1+다리 3단계 UI (물리 코어는 phasor_cornu_spec_v5 그대로 재사용)
 *
 * 규약 (스펙 §1-1, 실공간 기준):
 *   D = Z_self + S = H₀(ka) + Σ 2·H₀(k·n·d),   I = −1/D
 *   Z_floquet = i·D        ← 기존 Faraday/script.js의 floquetZ는 여분의 i를 가짐
 *   s₀ = I·2/(d·k) = I·λ/(πd)     (정면 진행파 기준 = e^{−ikL} 프레임)
 * ===================================================================== */
(function () {
  "use strict";

  // ===================================================================
  // 0. 상수 (v6: λ 고정 제거 — k(lam)을 인자로 받는다)
  // ===================================================================
  var TWO_PI = Math.PI * 2;
  var FLOQUET_M = 200;
  var A_WIRE = 0.0005;           // 0.5 mm 고정
  var CORNU_HALF = 3000;
  // 고정 실척(px/mm) — 1단계(좌, R5)·2단계(좌, R6) 공유. 슬라이더가 바뀌면 "간격"만 바뀌고
  // 그림 전체가 다시 맞춰지지(auto-fit) 않는다 — λ/d를 그림에서 직접 읽을 수 있게 하기 위함.
  var PX_PER_MM = 3;
  var C_RED = "#C0392B", C_BLUE = "#2471A3", C_INK = "#111111", C_GREY = "#8A9199", C_ORANGE = "#E67E22";
  function k(lam) { return TWO_PI / lam; }
  var PRESET_PAIRS = [[60,3],[60,14],[60,26],[60,46],[48,60],[18,60]];  // [λ,d] mm

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

  // 합 A: 분모의 부분합 궤적 [Z_self, Z_self+c_1, …, D_N]  (§1-1)
  function denomPartials(k, a, d, N) {
    var pts = new Array(N + 1);
    var D = hankel0(k * a);                        // 자기항
    pts[0] = D;
    for (var n = 1; n <= N; n++) {
      var h = hankel0(k * n * d);
      D = cAdd(D, { re: 2 * h.re, im: 2 * h.im }); // 이웃 쌍 c_n = 2·H₀(k·n·d)
      pts[n] = D;
    }
    return pts;
  }

  // 기존 코드의 floquetZ (M만 200). §4의 mag2<1e-30 함정은 의도적으로 보존.
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

  // 실공간 규약: D = Z_floquet/i,  I = −1/D = −i/Z_floquet
  function denomExact(k, a, d) { return cMul({ re: 0, im: -1 }, floquetZ(k, a, d)); }
  function currentExact(k, a, d) { return cMul({ re: 0, im: -1 }, cInv(floquetZ(k, a, d))); }
  function s0Exact(k, a, d) { return cScale(currentExact(k, a, d), 2 / (d * k)); }

  // 합 B: 코르누 부분합 (정면 진행파 기준 프레임 ×e^{−ikL}), n = −M … +M 누적
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

  // 나선의 해석적 수렴점 (모든 차수): Σ_n I·H₀(kR_n)·e^{−ikL} = I·(2/d)·Σ_m e^{i(κ_m−k)L}/κ_m
  // λ>d(전파 차수 1개)면 이 값 = s₀ 이고 L에 무관. λ<d면 여러 차수가 섞여 L에 따라 출렁인다.
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

  // T·R 분해 (기존 computeTransmittance의 Floquet 분기와 동일한 식)
  function powers(k, a, d) {
    var I = currentExact(k, a, d);
    var tpd = TWO_PI / d, thr = 1e-9 * k * k;
    var T = 0, R = 0, open = 0, s0 = { re: 0, im: 0 };
    for (var m = -FLOQUET_M; m <= FLOQUET_M; m++) {
      var al = m * tpd, kk = k * k - al * al;
      if (kk <= thr) continue;
      open++;
      var kap = Math.sqrt(kk), pref = 2 / (d * kap);
      var s = cScale(I, pref);                       // s_m = I·2/(d·κ_m)
      if (m === 0) s0 = s;
      var tr = s.re + (m === 0 ? 1 : 0), ti = s.im;  // t_0 = 1 + s_0
      T += (kap / k) * (tr * tr + ti * ti);
      R += (kap / k) * (s.re * s.re + s.im * s.im);
    }
    return { T: T, R: R, open: open, s0: s0 };
  }

  // ===================================================================
  // 4. 자가 테스트 — 렌더 전 게이트 (v5 §1을 λ 독립판으로 포팅 + v6 §8-6 다각형 닫힘 신규)
  // ===================================================================
  function runSelfTest() {
    var lines = [], pass = 0, fail = 0;
    function say(s) { lines.push(s); }
    function ok(c, msg) { if (c) { pass++; say("   PASS  " + msg); } else { fail++; say("   FAIL  " + msg); } }

    var LAM_T = 0.060;
    var KT = k(LAM_T);
    var PRESETS_LD = [20, 4.3, 2.3, 1.3, 0.8, 0.3];

    var ka = KT * A_WIRE, KA2 = ka * ka;

    say("phasor_steps_spec_v6 §1 자가 테스트 (렌더 전 게이트)");
    say("규약: a=" + (A_WIRE * 1000) + "mm, λ=" + (LAM_T * 1000) + "mm(테스트 기준) 고정, ka=" + ka.toFixed(4) + ", FLOQUET_M=" + FLOQUET_M);

    // [0] 표 4 목표값 선산정 — 논문 본문 표와 같은 소스 (§11 단계 0)
    say("");
    say("[0] 표 4 목표값 선산정 (a=0.5mm — v4의 75/17/0.7%(a=1mm)는 폐기)");
    say("      d      λ     λ/d     a/d      ka        T         R");
    [[30, 60], [15, 60], [15, 300]].forEach(function (c) {
      var kk = TWO_PI / (c[1] / 1000), d = c[0] / 1000, p = powers(kk, A_WIRE, d);
      say("   " + pad(c[0], 4) + "mm " + pad(c[1], 4) + "mm  " + pad((c[1] / c[0]).toFixed(2), 5) +
        "  " + (A_WIRE / d).toFixed(3) + "  " + (kk * A_WIRE).toFixed(4) + "  " +
        pad((p.T * 100).toFixed(2), 6) + "%  " + pad((p.R * 100).toFixed(2), 6) + "%");
    });
    say("      λ/d      d       d/λ    정수거리    |I|      |s₀|       T");
    var okDist = true, okAd = true;
    PRESETS_LD.forEach(function (ld) {
      var dl = 1 / ld, d = dl * LAM_T;
      var I = mag(currentExact(KT, A_WIRE, d)), s0 = mag(s0Exact(KT, A_WIRE, d)), p = powers(KT, A_WIRE, d);
      var dist = Math.min(Math.abs(dl - 1), Math.abs(dl - 2), Math.abs(dl - 3), Math.abs(dl - 4));
      if (dist < 0.1) okDist = false;
      if (A_WIRE / d > 0.30) okAd = false;
      say("   " + pad(ld, 5) + " " + pad((d * 1000).toFixed(1), 6) + "mm  " + dl.toFixed(3) +
        "    " + dist.toFixed(3) + "    " + I.toFixed(4) + "   " + s0.toFixed(4) + "   " +
        pad((p.T * 100).toFixed(2), 6) + "%");
    });
    ok(okDist, "§7 프리셋 전부 정수 d/λ에서 0.1 이상 이격");
    ok(okAd, "§6 프리셋 전부 a/d ≤ 0.30");
    ok(ka < 0.3, "§6 가는 도선 ka=" + ka.toFixed(4) + " ≪ 1");

    // [0b] 프리셋 6종 실제 |s₀| 분포 — Task 5의 S0_VIEW(2단계 고정축 반경)를 이 값으로 정한다.
    //      임의값(1.2) 금지: 관측된 최대 |s₀|에 여유를 곱해 확정한다.
    say(""); say("[0b] 프리셋 6종 |s₀| 분포 (S0_VIEW 확정 근거)");
    say("      λ(mm)  d(mm)   λ/d     |s₀|");
    var s0max = 0;
    PRESET_PAIRS.forEach(function (pr) {
      var lam = pr[0] / 1000, d = pr[1] / 1000, kk = k(lam);
      var s0 = mag(s0Exact(kk, A_WIRE, d));
      s0max = Math.max(s0max, s0);
      say("   " + pad(pr[0], 5) + "  " + pad(pr[1], 5) + "   " + pad((pr[0]/pr[1]).toFixed(2), 5) + "   " + s0.toFixed(4));
    });
    say("   → max|s₀| = " + s0max.toFixed(4) + "  ⇒ 권장 S0_VIEW ≈ " + (s0max * 1.15).toFixed(3) + " (max×1.15)");

    // [1] 교차검증: 실공간 D_N ↔ 스펙트럼 Z_floquet (인수 i 포함)
    say("");
    say("[1] 교차검증  i·D_N ≈ Z_floquet   (N=4000, 허용 2%)");
    say("     d/λ     사슬길이     오차");
    [0.3, 0.8, 1.7, 3.3].forEach(function (dl) {
      var d = dl * LAM_T;
      var P = denomPartials(KT, A_WIRE, d, 4000);
      var iD = cMul({ re: 0, im: 1 }, P[4000]);
      var e = relErr(iD, floquetZ(KT, A_WIRE, d));
      say("    " + pad(dl.toFixed(2), 5) + "   " + pad(Math.round(4000 * d / LAM_T), 6) + "λ   " + pad((e * 100).toFixed(2), 5) + "%");
      ok(e <= 0.02, "d/λ=" + dl + "  오차 " + (e * 100).toFixed(2) + "% ≤ 2%");
    });

    // [2] 광학 정리 Re(s₀) = −R (독립 검증)
    // T = 1 + 2Re(s₀) + R 이 항등식이므로 에너지 보존 ⟺ 광학 정리.
    // 가는 도선 모형은 이를 O((ka)²)까지만 만족한다(자기항 H₀(ka)의 실부가 J₀(ka)=1−(ka)²/4).
    say("");
    say("[2] 광학 정리  Re(s₀) = −R   (독립 검증 · 잔차 ≤ (ka)²=" + KA2.toExponential(2) + ")");
    say("      λ/d   차수     Re(s₀)        −R          잔차");
    PRESETS_LD.forEach(function (ld) {
      var d = LAM_T / ld, p = powers(KT, A_WIRE, d);
      var res = p.s0.re + p.R;
      var idErr = Math.abs(p.T - (1 + 2 * p.s0.re + p.R));
      say("   " + pad(ld, 5) + "    " + pad(p.open, 2) + "   " + pad(p.s0.re.toFixed(6), 10) +
        "  " + pad((-p.R).toFixed(6), 10) + "   " + res.toExponential(2));
      ok(idErr <= 1e-12, "λ/d=" + ld + "  항등식 T=1+2Re(s₀)+R 기계 정밀도");
      ok(Math.abs(res) <= KA2, "λ/d=" + ld + "  광학 정리 잔차 " + res.toExponential(2) + " ≤ (ka)²");
    });

    // [3] 역설 재현 (핵심)
    say("");
    say("[3] 역설 재현 — 전류가 더 작은데 차폐가 더 강함");
    var px = [20, 0.3].map(function (ld) {
      var d = LAM_T / ld;
      return { ld: ld, I: mag(currentExact(KT, A_WIRE, d)), s0: mag(s0Exact(KT, A_WIRE, d)), T: powers(KT, A_WIRE, d).T };
    });
    px.forEach(function (r) {
      say("     λ/d=" + pad(r.ld, 5) + "   |I|=" + r.I.toFixed(4) + "   |s₀|=" + r.s0.toFixed(4) + "   T=" + pad((r.T * 100).toFixed(2), 6) + "%");
    });
    say("   → λ/d=20 은 전류가 " + (px[1].I / px[0].I).toFixed(2) + "배 작은데(" + px[0].I.toFixed(3) + " < " + px[1].I.toFixed(3) + "),");
    say("     차폐는 훨씬 강하다 (T " + (px[0].T * 100).toFixed(2) + "% < " + (px[1].T * 100).toFixed(1) + "%).");
    say("     이유는 정면 합: |s₀| " + px[0].s0.toFixed(3) + " ≫ " + px[1].s0.toFixed(3));
    ok(px[0].I < px[1].I && px[0].T < px[1].T, "전류 작음 ∧ 차폐 강함");

    // [4] 곱 항등식 |s₀| = |I|·(λ/d)/π
    say("");
    say("[4] 곱 항등식  |s₀| = |I|·(λ/d)/π   (허용 1e-6)");
    PRESETS_LD.forEach(function (ld) {
      var d = LAM_T / ld;
      var I = mag(currentExact(KT, A_WIRE, d)), s0 = mag(s0Exact(KT, A_WIRE, d));
      var e = Math.abs(I * ld / Math.PI - s0) / s0;
      ok(e <= 1e-6, "λ/d=" + ld + "  오차 " + e.toExponential(1));
    });

    // [5] L-불변성
    say("");
    say("[5] L-불변성 — 코르누 수렴점 (정면 진행파 기준 프레임)");
    say("    ● λ>d (전파 차수 1개): 수렴점 = s₀, L에 무관");
    [20, 2.3].forEach(function (ld) {
      var d = LAM_T / ld, s0 = s0Exact(KT, A_WIRE, d), worst = 0;
      [0.3, 1.0, 3.0].forEach(function (L) { worst = Math.max(worst, relErr(forwardExact(KT, A_WIRE, d, L), s0)); });
      ok(worst <= 0.01, "λ/d=" + ld + "  L∈{0.3,1,3}m 수렴점 편차 " + (worst * 100).toFixed(3) + "% ≤ 1%");
    });
    say("    ● λ<d (전파 차수 여러 개): 수렴점이 L에 따라 출렁임 — 층 2 이음매");
    [0.8, 0.3].forEach(function (ld) {
      var d = LAM_T / ld;
      var v = [0.3, 1.0, 3.0].map(function (L) { return mag(forwardExact(KT, A_WIRE, d, L)); });
      var spread = (Math.max.apply(null, v) - Math.min.apply(null, v)) / ((v[0] + v[1] + v[2]) / 3);
      say("      λ/d=" + pad(ld, 5) + "  차수 " + nOpenOrders(1 / ld) + "개  |G∞| = " +
        v.map(function (x) { return x.toFixed(3); }).join(" / ") + "   편차 " + (spread * 100).toFixed(1) + "%");
      ok(spread > 0.05, "λ/d=" + ld + "  차수 " + nOpenOrders(1 / ld) + "개 → L 의존 " + (spread * 100).toFixed(1) + "% (예상된 거동)");
    });

    // [6] 다각형 닫힘 — 실제 전기장 합이 원점으로 닫힘 (v6 §8-6)
    // 입사(+1) + I·Z_self + Σ_{n≤N} I·2H₀(knd) + I·(D_exact − D_N) = 1 + I·D_exact = 0
    say(""); say("[6] 다각형 닫힘 — 실제 전기장 합 = 0 (기계 정밀도)");
    [[0.060,0.017],[0.060,0.026],[0.048,0.060]].forEach(function (c) {   // [λ,d] m, 비정수 d/λ
      var kk = k(c[0]), d = c[1];
      var I = currentExact(kk, A_WIRE, d);
      var N = 300;
      var Dn = denomPartials(kk, A_WIRE, d, N)[N];         // Z_self + Σ_{n≤N} 2H₀
      var Dex = denomExact(kk, A_WIRE, d);
      var residual = { re: Dex.re - Dn.re, im: Dex.im - Dn.im };
      // 누적: 입사 + I·(Dn + residual)
      var z = cAdd({ re: 1, im: 0 }, cMul(I, cAdd(Dn, residual)));
      var closeErr = mag(z);
      say("   λ/d=" + (c[0]/c[1]).toFixed(2) + "  닫힘오차 |Σ| = " + closeErr.toExponential(2));
      ok(closeErr <= 1e-12, "λ/d=" + (c[0]/c[1]).toFixed(2) + "  다각형 닫힘 " + closeErr.toExponential(1) + " ≤ 1e-12");
    });

    say("");
    say("결과:  PASS " + pass + "   FAIL " + fail);
    return { pass: pass, fail: fail, text: lines.join("\n") };
  }

  function pad(v, n) { var s = String(v); while (s.length < n) s = " " + s; return s; }

  // ===================================================================
  // 5. 상태 + 라우터 + 조작부 바인딩
  // ===================================================================
  var state = { lamMM: 60, dMM: 3, N: 200, L: 1.0, step: 1, showTotalSum: false };
  function lamM() { return state.lamMM / 1000; }
  function dM()   { return state.dMM / 1000; }
  function ld()   { return state.lamMM / state.dMM; }

  function syncLabels() {
    document.getElementById("lamVal").textContent = state.lamMM.toFixed(0) + " mm";
    document.getElementById("dVal").textContent   = state.dMM.toFixed(0) + " mm";
    document.getElementById("ldBig").textContent  = "λ/d = " + ld().toFixed(1);
    document.getElementById("nVal").textContent   = state.N;
    document.getElementById("lVal").textContent   = state.L.toFixed(2) + " m";
    document.getElementById("stepVal").textContent = state.step + "/3";
  }
  function gotoStep(n) {
    state.step = Math.min(3, Math.max(1, n));
    ["panel1","panel2","panel3"].forEach(function (id, i) {
      document.getElementById(id).hidden = (i + 1 !== state.step);
    });
    document.getElementById("nWrap").hidden = state.step !== 1;
    document.getElementById("lWrap").hidden = state.step !== 2;
    document.getElementById("step1Caption").hidden = state.step !== 1;
    document.getElementById("detail1").hidden = state.step !== 1;
    document.getElementById("detail2").hidden = state.step !== 2;
    render();
  }
  function render() {
    if (state.step === 1) drawStep1();
    else if (state.step === 2) drawStep2();
    else drawStep3();
    syncLabels();
    warnBadges();
  }

  // ===================================================================
  // 경고 배지 3종 (v6 §5) — ka>0.3 / a/d>0.3 / 정수 d/λ 우드 문턱. 위험 시 .readnum 회색 처리.
  // ===================================================================
  function warnBadges() {
    var kk=k(lamM()), d=dM(), dl=state.dMM/state.lamMM;   // dl = d/λ
    var ka = kk*A_WIRE, ad = A_WIRE/d;
    var nearInt = Math.abs(dl - Math.round(dl));
    var W = [];
    if (ka > 0.3)  W.push("⚠ 가는 도선 근사를 벗어남 — 이 영역의 수치는 부정확합니다");
    if (ad > 0.3)  W.push("⚠ 간격에 비해 도선이 굵음 — 모형 적용 한계");
    // 우드 이상은 '정수 d/λ'(1,2,3,…)에서만 발생(핸드오프 §4-2). 정수 문턱만 방어하는 것이 의도.
    // Math.round(dl)>=1 은 d/λ→0(λ≫d, 우드 없음)을 배제 — 본진 차폐 구간을 오검출하지 않기 위함.
    if (Math.round(dl) >= 1 && nearInt < 0.02)
      W.push("⚠ λ=d 문턱 부근 — 모든 이웃의 산란 전기장이 같은 위상으로 도착해 되먹임 합이 한없이 커지는 구간입니다. 전류가 0으로 눌리는 경계라 수치가 불안정합니다 (Wood anomaly)");
    var bar = document.getElementById("warnBar");
    bar.innerHTML = W.map(function(t){return "<div class='warn'>"+t+"</div>";}).join("");
    document.body.classList.toggle("risky", W.length > 0);   // .risky 시 수치 회색
    return W.length;
  }

  function bind() {
    document.getElementById("lamSlider").addEventListener("input", function(){ state.lamMM = +this.value; render(); });
    document.getElementById("dSlider").addEventListener("input", function(){ state.dMM = +this.value; render(); });
    document.getElementById("nSlider").addEventListener("input", function(){ state.N = +this.value; render(); });
    document.getElementById("lSlider").addEventListener("input", function(){ state.L = +this.value; render(); });
    document.getElementById("prevBtn").addEventListener("click", function(){ gotoStep(state.step - 1); });
    document.getElementById("nextBtn").addEventListener("click", function(){ gotoStep(state.step + 1); });
    document.getElementById("detail1").addEventListener("toggle", drawDetail);
    document.getElementById("detail2").addEventListener("toggle", drawDetail2);
    document.getElementById("totalSumChk").addEventListener("change", function(){ state.showTotalSum = this.checked; render(); });
    var cv3 = document.getElementById("canvas3");
    cv3.addEventListener("mousemove", function(e){ if (woodHitTest(e)) showWoodTip(e.clientX, e.clientY); else hideWoodTip(); });
    cv3.addEventListener("mouseleave", hideWoodTip);
    cv3.addEventListener("click", function(e){ if (woodHitTest(e)) showWoodTip(e.clientX, e.clientY); else hideWoodTip(); });

    var box = document.getElementById("presetBtns");
    PRESET_PAIRS.forEach(function (pr) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = "λ" + pr[0] + "/d" + pr[1];
      b.addEventListener("click", function () {
        state.lamMM = pr[0]; state.dMM = pr[1];
        document.getElementById("lamSlider").value = pr[0];
        document.getElementById("dSlider").value = pr[1];
        render();
      });
      box.appendChild(b);
    });
  }

  // ===================================================================
  // 6. 캔버스 도우미 (v5 phasor/script.js L291–473 그대로 복사)
  // ===================================================================
  var view = {};                // 영역별 축 반경 (히스테리시스용) — fitRadius가 키별로 채움

  function prep(cv) {
    var dpr = window.devicePixelRatio || 1;
    if (cv.dataset.ready !== "1") {
      // 최초 호출: cv.width/height는 아직 HTML 속성값(=논리 크기) 그대로다
      cv.style.width = cv.width + "px";
      cv.dataset.logicalW = cv.width; cv.dataset.logicalH = cv.height;
      cv.dataset.ready = "1";
    }
    var W = +cv.dataset.logicalW, H = +cv.dataset.logicalH;
    // DPR이 바뀌면(줌·모니터 이동) 백킹 스토어를 다시 만든다 — 재대입만으로 자동으로 비워진다
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

  // 축 반경 히스테리시스: 필요 반경이 창을 넘거나 절반 아래로 내려가면 갱신
  function fitRadius(key, need) {
    var cur = view[key];
    if (!cur || need > cur * 0.98 || need < cur * 0.5) {
      var step = niceStep(need * 2.3, 5);
      view[key] = Math.ceil(need * 1.15 / step) * step;
    }
    return view[key];
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

  // 이웃 도선 → A 로 향하는 가는 활 모양 화살선(1단계 왼쪽 전용). bow만큼 왼쪽으로 휘어
  // 같은 세로줄 위의 여러 화살이 서로 겹치지 않고 A로 모여드는 모습을 만든다.
  // 화살촉은 A(끝점)가 아니라 곡선의 중간점(t=0.5)에 하나만 찍는다 — 끝점에 다 몰아 찍으면
  // 여러 화살이 A 한 점에 겹쳐 안 보이기 때문(v6 R5). 이차 베지어는 t=0.5에서 접선이 정확히
  // (끝점−시작점) 방향과 같으므로, 화살촉 각도는 직선 (x1,y1)→(x2,y2) 방향을 쓰면 된다.
  function curvedArrow(ctx, x1, y1, x2, y2, bow, color, width) {
    var ccx = x1 - bow, ccy = (y1 + y2) / 2, head = 6;
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(ccx, ccy, x2, y2); ctx.stroke();
    var mx = 0.25 * x1 + 0.5 * ccx + 0.25 * x2;
    var my = 0.25 * y1 + 0.5 * ccy + 0.25 * y2;
    var a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(mx - head * Math.cos(a - 0.4), my - head * Math.sin(a - 0.4));
    ctx.lineTo(mx - head * Math.cos(a + 0.4), my - head * Math.sin(a + 0.4));
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // 복소평면 격자·눈금·라벨. 반환: 복소수 → 화면좌표 매퍼
  // top = 평면 시작 y, bottomReserve = 아래쪽에 비워둘 높이
  function complexPlane(ctx, W, H, top, bottomReserve, R) {
    var padX = 34;
    var size = Math.min(W - padX * 2, H - top - bottomReserve);
    var cx = W / 2, cy = top + size / 2;
    var sc = (size / 2) / R;
    var step = niceStep(R * 2, 5);
    var t;

    ctx.save();
    // 격자
    ctx.strokeStyle = "#EDF0F3"; ctx.lineWidth = 1;
    for (var g = -Math.floor(R / step) * step; g <= R + 1e-9; g += step) {
      var gx = cx + g * sc, gy = cy - g * sc;
      ctx.beginPath(); ctx.moveTo(gx, cy - size / 2); ctx.lineTo(gx, cy + size / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - size / 2, gy); ctx.lineTo(cx + size / 2, gy); ctx.stroke();
    }
    // 축
    ctx.strokeStyle = "#9AA3AB"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(cx - size / 2, cy); ctx.lineTo(cx + size / 2, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - size / 2); ctx.lineTo(cx, cy + size / 2); ctx.stroke();
    // 눈금 숫자 — 가로는 축 아래, 세로는 축 왼쪽
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
    // 축 라벨 — 평면 안쪽에 배치해 잘리지 않게
    ctx.fillStyle = C_INK; ctx.font = "bold 15px system-ui, sans-serif";
    ctx.textAlign = "right"; ctx.textBaseline = "bottom";
    ctx.fillText("Re", cx + size / 2, cy - 5);
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("Im", cx + 6, cy - size / 2);
    // 원점
    ctx.fillStyle = "#666";
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, TWO_PI); ctx.fill();
    ctx.restore();

    var map = function (z) { return [cx + z.re * sc, cy - z.im * sc]; };
    map.box = { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
    return map;
  }

  // 그림 영역 밖으로 나가는 궤적이 범례·수치를 덮지 않게 자른다
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
      // 표적 바로 위 가운데. 그림과 겹쳐도 읽히도록 흰 배경을 깐다.
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

  // 패널 안 상시 표기값 (§7: 정지 캡처가 완결되게). 배경을 깔아 그림과 겹쳐도 읽히게.
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

  // 왼쪽 아래 범례/주석 (배경 포함)
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
  // 7. 색 문법 (v6 §1-6) — 1단계·2단계 공유. rank 0=중앙(진함) → 멀수록 옅은 주황.
  //    실공간 도선색 = 복소평면 화살표색.
  // ===================================================================
  // 왼쪽 실공간에 표시하는 이웃 쌍 개수. 오른쪽 다각형도 이웃 사슬 색을 고를 때
  // 같은 값을 total로 넘겨써야 rank별 색이 두 패널에서 정확히 일치한다
  // (오른쪽은 N개까지 이어지지만 rank>WIRE_PAIRS_SHOWN 구간은 가장 옅은 색 하나로 포화됨 — 의도된 단순화).
  var WIRE_PAIRS_SHOWN = 10;
  function wireColor(rank, total) {
    // rank 0(가장 가까운 이웃) = 진한 적갈색 #7B2D00, rank가 커질수록(멀어질수록) 밝은 노랑 #F5C542로
    // 밝기가 단조 증가하는 램프. RGB 선형보간(각 채널이 모두 증가하므로 밝기도 단조 증가).
    var t = Math.min(1, rank / Math.max(1, total));
    var r = Math.round(123 + (245 - 123) * t);
    var g = Math.round(45 + (197 - 45) * t);
    var b = Math.round(0 + (66 - 0) * t);
    return "rgb(" + r + "," + g + "," + b + ")";
  }

  // 화살표 옆에 흰 배경을 깐 라벨 (겹쳐도 읽히게). 캔버스 폭 안으로 x를 clamp.
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
  // 8. 1단계 — 왼쪽: 실공간 세로 도선 배열 + 입사파 + A로 향하는 화살선 (v6 §2 왼쪽)
  // ===================================================================
  function drawStep1Left() {
    var c = prep(document.getElementById("canvas1L"));
    var ctx = c.ctx, W = c.W, H = c.H;
    panelTitle(ctx, W, "1단계 (좌) 실공간 — 세로 도선 배열", "가운데 도선 A 표면에 이웃들의 전기장이 도착한다");

    var plotTop = 60, plotBottom = H - 90;
    var cyA = (plotTop + plotBottom) / 2;
    var wireX = 480;

    // 고정 실척(v6 R5): 세로 간격(px) = d(mm) × PX_PER_MM, 가로 파면 간격(px) = λ(mm) × PX_PER_MM.
    // 슬라이더를 움직이면 "간격"만 바뀔 뿐 그림 전체를 다시 맞추지(auto-fit) 않는다 — λ/d를 그림에서
    // 직접 읽게 하기 위함. 그 결과 d가 작으면 밴드 안에 훨씬 많은 이웃이 실제로 들어찬다(조밀한 벽).
    var spacing = state.dMM * PX_PER_MM;
    var halfBand = (plotBottom - plotTop) / 2;
    var rankMax = Math.max(0, Math.floor(halfBand / spacing));      // 밴드 안에 실제로 들어가는 이웃 쌍 수
    var curveCount = Math.min(rankMax, WIRE_PAIRS_SHOWN);           // 화살곡선(설명용)은 가까운 최대 10쌍만
    var dotR = Math.min(5, 0.42 * spacing);                         // 조밀할 때 점이 뭉개지지 않게 축소

    // 평면파 입사 (회색 파면 + 화살표 + 라벨). 파면은 A로부터 λ·PX_PER_MM 간격으로 왼쪽으로 늘어놓되,
    // A 왼쪽 460px 밴드 밖으로는 그리지 않는다 — λ가 크면 밴드 안에 파면이 0~2개만 들어가는 것도 그대로 둔다.
    ctx.save();
    ctx.strokeStyle = "#C3C9CF"; ctx.lineWidth = 1.4; ctx.setLineDash([2, 5]);
    var waveSpacing = state.lamMM * PX_PER_MM;
    var waveBandLeft = wireX - 460;
    for (var wx = wireX - waveSpacing; wx >= waveBandLeft; wx -= waveSpacing) {
      ctx.beginPath(); ctx.moveTo(wx, plotTop); ctx.lineTo(wx, plotBottom); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
    arrow(ctx, 40, plotTop + 16, 205, plotTop + 16, C_GREY, 3, 10);
    ctx.save();
    ctx.font = "bold 16px system-ui, sans-serif"; ctx.fillStyle = C_GREY;
    ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillText("평면파 입사", 40, plotTop + 6);
    ctx.restore();

    // 이웃 → A 화살곡선 (뒤쪽부터 그려 앞쪽 진한 색이 위에 오게). 화살촉은 curvedArrow 내부에서
    // 곡선 중간점에 하나만 찍힌다(A 쪽 끝점에는 안 찍음 — 여러 화살이 A 한 점에 겹쳐 안 보이던 문제 수정).
    for (var rank = curveCount; rank >= 1; rank--) {
      var col = wireColor(rank, WIRE_PAIRS_SHOWN);
      var bow = 18 + rank * 14;
      curvedArrow(ctx, wireX, cyA - rank * spacing, wireX, cyA, bow, col, 1.4);
      curvedArrow(ctx, wireX, cyA + rank * spacing, wireX, cyA, bow, col, 1.4);
    }

    // 밴드 가장자리 — 도선 배열이 화면 밖으로도 계속됨을 암시
    ctx.save();
    ctx.font = "16px system-ui, sans-serif"; ctx.fillStyle = "#9AA3AB";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("⋮", wireX, plotTop + 8);
    ctx.fillText("⋮", wireX, plotBottom - 8);
    ctx.restore();

    // 도선 점 — 밴드 안에 실제로 들어가는 이웃 전부(조밀한 d에서는 rankMax가 10을 훌쩍 넘는다) + 가운데 A(굵은 검정)
    for (var n = 1; n <= rankMax; n++) {
      var col2 = wireColor(n, WIRE_PAIRS_SHOWN);
      ctx.fillStyle = col2;
      ctx.beginPath(); ctx.arc(wireX, cyA - n * spacing, dotR, 0, TWO_PI); ctx.fill();
      ctx.beginPath(); ctx.arc(wireX, cyA + n * spacing, dotR, 0, TWO_PI); ctx.fill();
    }
    ctx.fillStyle = C_INK;
    ctx.beginPath(); ctx.arc(wireX, cyA, 7.5, 0, TWO_PI); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(wireX, cyA, 7.5, 0, TWO_PI); ctx.stroke();
    ctx.save();
    ctx.font = "bold 16px system-ui, sans-serif"; ctx.fillStyle = C_INK;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText("A", wireX + 14, cyA);
    ctx.restore();

    // 좌하단: 간격 d + 스케일 바 (도선 간 픽셀 간격 = d × PX_PER_MM, 그 자체를 눈금으로 삼는다)
    var sbX = 14, sbY = plotBottom + 16;
    ctx.save();
    ctx.strokeStyle = "#333"; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(sbX, sbY - 5); ctx.lineTo(sbX, sbY + 5);
    ctx.moveTo(sbX, sbY); ctx.lineTo(sbX + spacing, sbY);
    ctx.moveTo(sbX + spacing, sbY - 5); ctx.lineTo(sbX + spacing, sbY + 5);
    ctx.stroke();
    ctx.font = "bold 16px system-ui, sans-serif"; ctx.fillStyle = "#333";
    ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillText("간격 d = " + state.dMM.toFixed(0) + " mm", sbX, sbY - 8);
    ctx.restore();

    var rampSwatch = wireColor(Math.round(WIRE_PAIRS_SHOWN / 2), WIRE_PAIRS_SHOWN);
    notes(ctx, W, H, [
      ["● 도선 A (가운데, 굵은 검정)", C_INK],
      ["● 이웃 도선 (가까울수록 진한 적갈 → 멀수록 노랑)", rampSwatch],
      ["곡선 = 이웃 도선이 A 표면에 보내는 산란 전기장 (곡선 모양 자체는 개략 표현)"],
      ["회색 점선 파면 = 평면파 입사 (왼쪽 → 오른쪽)", "#8A9199"]
    ]);
  }

  // ===================================================================
  // 9. 1단계 — 오른쪽: 실제 전기장의 닫힌 다각형 (v6 §2 오른쪽, 본 그림)
  // ===================================================================
  function drawStep1Right() {
    var c = prep(document.getElementById("canvas1R"));
    var ctx = c.ctx, W = c.W, H = c.H;
    var kk = k(lamM()), d = dM(), N = state.N;
    var I = currentExact(kk, A_WIRE, d);
    var P = denomPartials(kk, A_WIRE, d, N);   // P[0]=Z_self, …, P[N]=D_N
    var Dex = denomExact(kk, A_WIRE, d);

    // 실제 전기장 누적점: 입사(1,0) → 자기항 → 이웃 사슬 → 잔여 → 원점(닫힘)
    var pts = [{ re: 1, im: 0 }];
    for (var n = 0; n <= N; n++) pts.push(cAdd({ re: 1, im: 0 }, cMul(I, P[n])));
    var residual = { re: Dex.re - P[N].re, im: Dex.im - P[N].im };
    pts.push(cAdd({ re: 1, im: 0 }, cMul(I, cAdd(P[N], residual))));   // = 원점(0,0), 기계 정밀도로 닫힘

    panelTitle(ctx, W, "1단계 (우) 실제 전기장의 닫힌 다각형", "복소평면 (무차원, 축 거의 고정) · 입사파 = 1 기준");

    // 상시 표기값(§7)은 위쪽 여백 안에 그린다 — 그래프 격자와 겹치지 않게.
    readout(ctx, W, 34, [
      ["λ/d =", ld().toFixed(2), C_RED],
      ["N =", String(N)],
      ["|I| =", mag(I).toFixed(4), C_RED]
    ]);

    // 근고정 프레임 (critical fact #4: fitRadius 금지·view={} 버그 회피).
    // 프리셋 6종 전부 maxpt=1.000(입사점이 지배) → R=1.6이면 여유 있게 담고도 다각형이 더 크게 보인다.
    // top을 105로 밀어 위쪽 readout과 그리드가 겹치지 않게 한다.
    var R = 1.6;
    var map = complexPlane(ctx, W, H, 105, 110, R);
    var O = map({ re: 0, im: 0 });
    clipToPlot(ctx, map);

    // 이웃 사슬 (pts[1]→pts[2]→…→pts[N+1]) — rank n은 왼쪽 도선과 동일한 wireColor
    ctx.save();
    ctx.lineWidth = 1.6; ctx.lineJoin = "round";
    for (var seg = 1; seg <= N; seg++) {
      var s0 = map(pts[seg]), s1 = map(pts[seg + 1]);
      ctx.strokeStyle = wireColor(seg, WIRE_PAIRS_SHOWN);
      ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.stroke();
    }
    ctx.restore();
    // 앞쪽 몇 개만 화살촉 (v5 drawA 방식 — N이 클 때 다 그리면 뭉갬)
    for (var h = 1; h <= Math.min(6, N); h++) {
      var q0 = map(pts[h]), q1 = map(pts[h + 1]);
      arrow(ctx, q0[0], q0[1], q1[0], q1[1], wireColor(h, WIRE_PAIRS_SHOWN), 1.8, 7);
    }

    // 입사파 (회색, 원점→(1,0))
    var pInc = map(pts[0]);
    arrow(ctx, O[0], O[1], pInc[0], pInc[1], C_GREY, 3.6, 11);

    // 자기항 (파랑, (1,0)→pts[1])
    var pSelf = map(pts[1]);
    arrow(ctx, pInc[0], pInc[1], pSelf[0], pSelf[1], C_BLUE, 3, 10);

    // 잔여 (옅은 회색, pts[N+1]→원점) — 문턱 부근이면 커진 채로 그대로 드러낸다.
    // 체크박스와 무관하게 항상 그린다 — N 슬라이더 반응·문턱-정직성의 핵심이라 가리지 않는다.
    var pLast = map(pts[N + 1]);
    var pClose = map(pts[N + 2]);
    var residualMag = mag(cMul(I, residual));
    arrow(ctx, pLast[0], pLast[1], pClose[0], pClose[1], "rgba(138,145,153,0.65)", 2.6, 9);

    // 이웃 전체 합 오버레이 (체크박스 ON일 때만) — 자기항 끝점(pts[1]) → 원점, 점선 진회색.
    // = I·(D_exact − Z_self). 입사(1) + I·Z_self + 이 값 = 1 + I·D_exact = 0 이므로,
    // 사슬을 하나하나 안 보고도 "이웃 전체가 만드는 몫"을 화살표 하나로 보여준다.
    // 기존 사슬 위에 겹쳐 그리되(그리기 순서상 위) 사슬 자체는 지우지 않는다.
    if (state.showTotalSum) {
      ctx.save();
      ctx.setLineDash([6, 4]);
      arrow(ctx, pSelf[0], pSelf[1], O[0], O[1], "#444444", 2.6, 9);
      ctx.restore();
    }

    ctx.restore();   // 클리핑 해제 — 아래 범례는 잘리면 안 된다

    // 좌하단 범례 — 색 스와치 + 텍스트. 그래프 안 화살표 옆 라벨은 여기로 옮겼다
    // (색-램프 라운드가 지적한 옛 주황 하드코딩 범례를 실제 wireColor 값으로 갱신).
    var rampSwatch = wireColor(Math.round(WIRE_PAIRS_SHOWN / 2), WIRE_PAIRS_SHOWN);
    notes(ctx, W, H, [
      ["■ 입사파 (=1)", C_GREY],
      ["■ 도선 자신이 만든 전기장 (I × self term)", C_BLUE],
      ["■ 이웃 사슬 (rank별, 가까울수록 진한 적갈 → 멀수록 노랑)", rampSwatch],
      ["■ 먼 이웃들의 나머지  |Δ| = " + residualMag.toFixed(4), "rgba(138,145,153,0.65)"]
    ]);
  }

  function drawStep1() { drawStep1Left(); drawStep1Right(); drawDetail(); }

  // ===================================================================
  // 9b. 1단계 접이식 상세 — 전류 1단위당 분모 D 조립 + Floquet 정확값 표적 (v6 §7)
  //     v5 phasor/script.js drawA(L478–550)의 복소평면 조립도를 자동 스케일로 이식.
  // ===================================================================
  function drawDetail() {
    var det = document.getElementById("detail1");
    if (!det || det.open !== true) return;   // 닫혀 있으면 그리지 않는다
    var c = prep(document.getElementById("canvasDetail"));
    var ctx = c.ctx, W = c.W, H = c.H;
    var kk = k(lamM()), d = dM(), N = state.N;
    var P = denomPartials(kk, A_WIRE, d, N), D = P[N], Dex = denomExact(kk, A_WIRE, d);

    var need = 0;
    for (var i = 0; i <= N; i++) need = Math.max(need, mag(P[i]));
    need = Math.max(need, mag(Dex));
    var R = fitRadius("detail", need);   // 자동 스케일(v6) — v5의 고정축 VIEW_A와 달리 매 렌더 재계산

    panelTitle(ctx, W, "전류 1단위당 분모 D 조립", "복소평면 (자동 스케일) · D = Z_self + Σ 2H₀(k·n·d) → Floquet 정확값에 수렴");
    var map = complexPlane(ctx, W, H, 50, 64, R);
    var O = map({ re: 0, im: 0 });
    clipToPlot(ctx, map);

    // 이웃 사슬 (n 커질수록 옅게) — v5 drawA 이식
    ctx.save();
    ctx.lineWidth = 1.6; ctx.lineJoin = "round";
    for (var n = 1; n <= N; n++) {
      var p0 = map(P[n - 1]), p1 = map(P[n]);
      var f = 1 - 0.75 * Math.min(1, (n - 1) / Math.max(1, N - 1));
      ctx.strokeStyle = "rgba(192,57,43," + (0.25 + 0.75 * f).toFixed(3) + ")";
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    }
    ctx.restore();
    // 앞쪽 몇 개만 화살촉 (N이 클 때 다 그리면 뭉갬)
    for (var m2 = 1; m2 <= Math.min(6, N); m2++) {
      var q0 = map(P[m2 - 1]), q1 = map(P[m2]);
      arrow(ctx, q0[0], q0[1], q1[0], q1[1], C_RED, 1.8, 7);
    }

    // 자체 산란(self term) (파랑) — 전류 1단위당 자기 표면 전기장
    var pz = map(P[0]);
    arrow(ctx, O[0], O[1], pz[0], pz[1], C_BLUE, 4, 11);

    // Floquet 정확 분모 표적 — N↑ 시 빨간 사슬 끝이 여기로 감겨든다
    dottedTarget(ctx, W, map(Dex), C_BLUE, "Floquet 정확값");

    // 분모 D (검정 굵게)
    var pd = map(D);
    arrow(ctx, O[0], O[1], pd[0], pd[1], C_INK, 3.4, 12);
    ctx.restore();   // 클리핑 해제 — 아래 라벨·수치·범례는 잘리면 안 된다

    arrowLabel(ctx, W, pz[0] + 8, pz[1] - 14, "자체 산란(self term): 전류 1단위당 자기 표면 전기장", C_BLUE);
    arrowLabel(ctx, W, pd[0] + 8, pd[1] + 16, "D = Z_self + Σ 2H₀(k·n·d)", C_INK);

    var absD = mag(D), absI = 1 / mag(Dex);
    readout(ctx, W, 57, [
      ["λ/d =", ld().toFixed(2), C_RED],
      ["N =", String(N)],
      ["|D_N| =", absD.toFixed(3)],
      ["|I| = 1/|D| =", absI.toFixed(4), C_RED]
    ]);

    notes(ctx, W, H, [
      ["■ 자체 산란(self term) Z_self = H₀(ka)  (전류 1단위당)", C_BLUE],
      ["■ 이웃 쌍 2·H₀(k·n·d)  (n 커질수록 옅게)", C_RED],
      ["■ D = Z_self + S      ⊕ Floquet 정확값 (점선)", C_INK]
    ]);
  }
  // ===================================================================
  // 10. 2단계 — 왼쪽: 실공간 경로선 (정면 관측점 P까지 도선별 경로) (v6 §3 왼쪽)
  // ===================================================================
  var L_GUARD_LAMBDAS = 5;   // "정면 원거리 관측점" 그림이 성립하는 하한 — a few λ

  function drawStep2Left() {
    var c = prep(document.getElementById("canvas2L"));
    var ctx = c.ctx, W = c.W, H = c.H;
    panelTitle(ctx, W, "2단계 (좌) 실공간 — 정면 관측점 P까지 경로",
      "왼쪽: 평면파 입사(파면 간격 = λ, 치수 참조) · 오른쪽: P까지 경로(압축, 실척 아님)");

    var plotTop = 60, plotBottom = H - 90;
    var cyA = (plotTop + plotBottom) / 2;
    var wireX = 200, nShown = WIRE_PAIRS_SHOWN;
    var Lm = state.L, dm = dM(), lam = lamM();
    var guardL = L_GUARD_LAMBDAS * lam;

    // 왼쪽 아래 범례 행 구성 — notes()에서 실제로 그리기 전에 먼저 만들어 둔다. 아래 "⫽ L=..."
    // 캡션이 이 범례의 배경 상단(y = H - noteRows.length*18 - 8 - 3)을 안전 여백을 두고 피해가려면
    // 캡션을 그리는 시점에 이미 최종 행 수를 알아야 하기 때문(R10). 실제 그리기(notes 호출)는
    // z-order를 유지하기 위해 기존 위치(맨 아래)에 그대로 둔다 — 여기서는 배열만 만든다.
    var noteRows = [["● 도선(가운데 A 굵은 검정, 이웃 진한→옅은 주황)", C_INK]];
    if (Lm >= guardL) {
      noteRows.push(["경로선 색 = 오른쪽 나선과 동일 색 문법(거리→색)", "rgba(230,126,34,0.85)"]);
      noteRows.push(["바깥 도선일수록 P까지 경로가 길다 (R_n 수치 참조)", "#555"]);
    } else {
      noteRows.push(["L이 너무 가까워 경로선·P·R_n 표시를 생략함", "#555"]);
    }
    noteRows.push(["회색 점선 = 입사 평면파의 파면 (간격 = 파장 λ)", C_GREY]);

    // 세로축 고정 실척(v6 R6): 1단계(좌)와 동일한 PX_PER_MM·공식 재사용 — 같은 d면 두 패널의
    // 도선 간격이 픽셀 단위로 똑같이 보인다. 가로(P까지 거리)는 L(m)·d(mm) 단위가 달라 한 그림에
    // 같은 축척으로 못 담으므로 압축한 채 유지하고, 아래 ⫽ 표기로 "실척 아님"을 명시한다.
    var spacing = state.dMM * PX_PER_MM;
    var halfBand = (plotBottom - plotTop) / 2;
    var rankMax = Math.max(0, Math.floor(halfBand / spacing));
    var nShownActual = Math.min(nShown, rankMax);              // 밴드 안에 실제로 들어가는 이웃 쌍 수
    var dotR = Math.min(5, 0.42 * spacing);                    // 1단계와 동일한 조밀 축소 규칙

    // 평면파 입사 (v9 격하): 이 패널은 오른쪽에 경로선 영역을 내줘야 해서 입사 밴드가 1단계보다
    // 훨씬 좁다 — λ 실척으로 그리면(이전 버전) 슬라이더 범위의 상당 부분에서 "파장이 화면보다 김"
    // 안내 문구만 뜨는 문제가 있었다. 이 패널의 파면은 "입사파가 평면파"라는 사실만 상기시키면
    // 충분하므로, λ·d와 무관하게 화면상 고정 위치·고정 간격(WAVE_PX)으로 정확히 3개만 그린다.
    // 실제 λ 값은 파면 사이 치수선(↔)+숫자 라벨로 병기한다 — 선 길이는 항상 WAVE_PX 그대로 고정,
    // 숫자만 state.lamMM을 그대로 읽어 갱신된다(좁은 패널에서 실척을 포기한 대신 값은 명시).
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

    // λ 치수선 — 파면 3개 중 가운데·오른쪽(=waveXs[0], waveXs[1]) 사이에 그린다. 화살표 두 개를
    // 가운데 점에서 양 끝으로 쏘아 double-headed 치수선을 만든다(arrow() 재사용).
    var dimX1 = waveXs[0], dimX2 = waveXs[1], dimY = cyA + 60, dimMidX = (dimX1 + dimX2) / 2;
    ctx.save();
    arrow(ctx, dimMidX, dimY, dimX1, dimY, C_INK, 1.4, 7);
    arrow(ctx, dimMidX, dimY, dimX2, dimY, C_INK, 1.4, 7);
    ctx.restore();
    ctx.save();
    ctx.font = "bold 16px system-ui, sans-serif";
    var lamLabel = "λ = " + state.lamMM + " mm";
    var lamLabelW = ctx.measureText(lamLabel).width;
    backdrop(ctx, dimMidX - lamLabelW / 2 - 4, dimY - 24, lamLabelW + 8, 18);
    ctx.fillStyle = C_INK; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.fillText(lamLabel, dimMidX, dimY - 8);
    ctx.restore();

    arrow(ctx, 16, plotTop + 16, 155, plotTop + 16, C_GREY, 3, 10);
    ctx.save();
    ctx.font = "bold 16px system-ui, sans-serif"; ctx.fillStyle = C_GREY;
    ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillText("평면파 입사", 16, plotTop + 6);
    ctx.restore();

    if (Lm >= guardL) {
      // P까지 픽셀거리 — 실제 축척 아님(L은 m, d는 mm 단위라 한 그림에 동시에 맞출 수 없다).
      // 슬라이더 범위를 화면폭에 눌러 담아 "L이 커질수록 경로선이 나란해진다"는 정성적 느낌만 준다.
      // 실제 길이값은 아래 R_n 수치로 병기한다.
      var pixelL = 260 + (Lm - 0.3) / (3 - 0.3) * 120;
      var Px = wireX + pixelL, Py = cyA;

      // 경로선 (먼 것부터 그려 가까운(진한) 색이 위에 오게) — 색 램프 정규화 total은 1단계와
      // 동일하게 WIRE_PAIRS_SHOWN 고정(= nShown)이라, rank번호가 같으면 두 패널에서 색이 일치한다.
      ctx.save();
      ctx.lineWidth = 1.3;
      for (var rank = nShownActual; rank >= 0; rank--) {
        ctx.strokeStyle = wireColor(rank, nShown);
        if (rank === 0) {
          ctx.beginPath(); ctx.moveTo(wireX, cyA); ctx.lineTo(Px, Py); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.moveTo(wireX, cyA - rank * spacing); ctx.lineTo(Px, Py); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(wireX, cyA + rank * spacing); ctx.lineTo(Px, Py); ctx.stroke();
        }
      }
      ctx.restore();

      // 관측점 P
      ctx.save();
      ctx.fillStyle = C_RED;
      ctx.beginPath(); ctx.arc(Px, Py, 6, 0, TWO_PI); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(Px, Py, 6, 0, TWO_PI); ctx.stroke();
      ctx.restore();
      // P 라벨은 Px를 따라가지 않는 고정 위치(우측 상단, plotTop 위쪽 여백)에 둔다.
      // 예전엔 Px 기준 상대 위치(Px+6, Py+26)였는데, arrowLabel의 가장자리 clamp가 Px가 커져
      // 캔버스 폭에 가까워질 때 라벨을 왼쪽(팬 라인 다발 쪽)으로 끌어당겨, 넓은 L·d 조합에서
      // 라벨 배경이 P로 모이는 경로선과 겹치는 문제가 있었다(R6 리뷰). 이 오른쪽 경로 영역은 가로축이
      // 이미 압축돼 있어(부제 "오른쪽 경로 영역: 압축" 참고) 라벨이 P의 실제 x를 따라갈 이유가 없다.
      // plotTop(=60)보다 위쪽은 halfBand 제한상 어떤 슬라이더 조합에서도 경로선이 닿지 않는
      // 영역이므로, 여기 고정하면 항상 안전하다. 라벨이 더 이상 P를 따라가지 않으므로 어떤 점을
      // 가리키는지 짧은 점선 안내선으로 이어준다.
      var pLabelText = "P (정면 관측점)", pLabelX = W - 10, pLabelY = plotTop - 12;
      ctx.save();
      ctx.font = "bold 16px system-ui, sans-serif";
      var pLabelW = ctx.measureText(pLabelText).width;
      backdrop(ctx, pLabelX - pLabelW - 9, pLabelY - 9, pLabelW + 12, 16);
      ctx.fillStyle = C_RED; ctx.textAlign = "right"; ctx.textBaseline = "middle";
      ctx.fillText(pLabelText, pLabelX, pLabelY);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = C_RED; ctx.lineWidth = 1; ctx.globalAlpha = 0.55; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(pLabelX - pLabelW / 2, pLabelY + 8); ctx.lineTo(Px, Py - 7); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.restore();

      // 경로 길이 수치 2~3개 병기 — 실제 L·d로 계산한 R_n (도선별 색과 무관하게 검정 굵게)
      var rnRanks = [];
      [0, Math.round(nShownActual / 2), nShownActual].forEach(function (rk) {
        if (rnRanks.indexOf(rk) === -1) rnRanks.push(rk);
      });
      rnRanks.forEach(function (rk) {
        var Rn = Math.hypot(Lm, rk * dm);
        var yPix = cyA - rk * spacing;
        arrowLabel(ctx, W, wireX + 26, yPix, "R_" + rk + " = " + Rn.toFixed(3) + " m", C_INK);
      });

      var breakX = (wireX + Px) / 2;
      // 가로축 단절(⫽) 독립 표기 — 아래 L= 캡션의 접두사만으로는 "너무 은근하다"는 리뷰 지적이
      // 있어(R6), 축 중앙선 부근에 회색 기호를 하나 더 찍어 캡션 글자를 안 읽어도 "여기서 가로축이
      // 압축/단절됐다"는 게 그림만 보고 읽히게 한다(캡션의 접두사는 그대로 유지 — 둘 다 표시).
      // y를 cyA에서 살짝 내려(+22) 두는 이유: R_n 라벨들은 전부 y = cyA − rk·spacing(rk≥0)이라
      // cyA 이상(위쪽)에만 있으므로, cyA 아래쪽에 두면 어떤 슬라이더 조합에서도 R_n 라벨과 겹치지 않는다.
      ctx.save();
      ctx.font = "16px system-ui, sans-serif"; ctx.fillStyle = C_GREY;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      backdrop(ctx, breakX - 9, cyA + 22 - 10, 18, 20);
      ctx.fillText("⫽", breakX, cyA + 22);
      ctx.restore();

      // L 표기 + 가로축 단절(⫽) — 세로는 실척이지만 가로(L)는 압축했다는 표시를 같은 줄에 병기.
      // y는 plotBottom 기준 고정값이 아니라 왼쪽 아래 범례(notes(), noteRows 참조) 배경 상단에서
      // 역산한다 — 범례 행 수(noteRows.length)가 늘어나 배경이 위로 자랄 때도 이 캡션이 항상
      // 범례 위에 여백을 두고 떠 있도록(R10; 범례가 커지며 이 캡션을 가리던 문제 수정).
      // baseline="bottom"으로 텍스트 "아래쪽" 끝을 이 y에 고정하면 글자가 항상 그 위쪽에 그려져
      // 범례 배경 상단(legendTop)과의 간격이 폰트 크기와 무관하게 보장된다.
      ctx.save();
      ctx.font = "bold 16px system-ui, sans-serif"; ctx.fillStyle = C_INK;
      ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      var legendTop = H - noteRows.length * 18 - 8 - 3;   // notes()의 backdrop(6, y0-3, ...) 상단과 동일 계산
      var captionY = legendTop - 8;                        // 범례 배경 위 8px 여백
      ctx.fillText("⫽  L = " + Lm.toFixed(2) + " m  (" + (Lm / lam).toFixed(1) + " λ)", breakX, captionY);
      ctx.restore();
    } else {
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

    // 표시 범위 밖 이웃 — 점점이 암시 (밴드 밖으로 나가면 제목 글자와 겹치므로 생략)
    ctx.save();
    ctx.fillStyle = "#B9BEC4";
    [1, 2].forEach(function (j) {
      var r = nShownActual + j, al = 0.5 - j * 0.18;
      ctx.globalAlpha = Math.max(0.12, al);
      [-1, 1].forEach(function (s) {
        var yy = cyA + s * r * spacing;
        if (yy >= plotTop && yy <= plotBottom) {
          ctx.beginPath(); ctx.arc(wireX, yy, 3, 0, TWO_PI); ctx.fill();
        }
      });
    });
    ctx.globalAlpha = 1;
    ctx.restore();

    // 도선 점 — 이웃(색) + 가운데 A(굵은 검정) — 경로선/경고 위에 그려 항상 보이게
    for (var n = 1; n <= nShownActual; n++) {
      ctx.fillStyle = wireColor(n, nShown);
      ctx.beginPath(); ctx.arc(wireX, cyA - n * spacing, dotR, 0, TWO_PI); ctx.fill();
      ctx.beginPath(); ctx.arc(wireX, cyA + n * spacing, dotR, 0, TWO_PI); ctx.fill();
    }
    ctx.fillStyle = C_INK;
    ctx.beginPath(); ctx.arc(wireX, cyA, 7.5, 0, TWO_PI); ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(wireX, cyA, 7.5, 0, TWO_PI); ctx.stroke();

    notes(ctx, W, H, noteRows);
  }

  // ===================================================================
  // 11. 2단계 — 오른쪽: 고정축 색깔 나선 + 수렴점 + 인셋 + π배 대비 (v6 §3 오른쪽)
  // ===================================================================
  var S0_VIEW = 1.152;   // 전역 고정 축 반경(설계 결정) — [0b] 프리셋 6종 max|s₀|=1.0013 × 1.15 (사용자 확정)

  function drawStep2Right() {
    var c = prep(document.getElementById("canvas2R"));
    var ctx = c.ctx, W = c.W, H = c.H;
    var kk = k(lamM()), d = dM(), dl = state.dMM / state.lamMM;   // dl = d/λ (★ λ/d 아님 — 라벨 뒤집힘 함정)
    var nMax = CORNU_HALF;
    var pts = cornuPartials(kk, A_WIRE, d, state.L, nMax);
    var end = pts[pts.length - 1];
    var target = forwardExact(kk, A_WIRE, d, state.L);
    var s0 = s0Exact(kk, A_WIRE, d);
    var open = nOpenOrders(dl);

    panelTitle(ctx, W, "정면 관측점 P에서의 산란파 합", "복소평면 (S0_VIEW=" + S0_VIEW + " 전역 고정) · 정면 진행파 기준 위상");
    var map = complexPlane(ctx, W, H, 50, 126, S0_VIEW);
    var O = map({ re: 0, im: 0 });
    clipToPlot(ctx, map);

    // 나선 — 가운데(랭크0)부터 바깥일수록 옅은 색. 근거리(±WIRE_PAIRS_SHOWN)는 낱개, 원거리는 배치 경로(성능).
    ctx.save();
    ctx.lineWidth = 1.5; ctx.lineJoin = "round";
    function farBatch(iStart, iEnd) {
      if (iEnd <= iStart) return;
      ctx.strokeStyle = wireColor(WIRE_PAIRS_SHOWN + 1, WIRE_PAIRS_SHOWN);   // rank>WIRE_PAIRS_SHOWN은 색이 포화되어 전부 동일
      ctx.beginPath();
      for (var i = iStart; i <= iEnd; i++) {
        var p = map(pts[i]);
        if (i === iStart) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke();
    }
    farBatch(0, nMax - WIRE_PAIRS_SHOWN);
    farBatch(nMax + WIRE_PAIRS_SHOWN + 1, 2 * nMax + 1);
    for (var i2 = nMax - WIRE_PAIRS_SHOWN; i2 <= nMax + WIRE_PAIRS_SHOWN; i2++) {
      var n2 = i2 - nMax, rank2 = Math.abs(n2);
      var p0 = map(pts[i2]), p1 = map(pts[i2 + 1]);
      ctx.strokeStyle = wireColor(rank2, WIRE_PAIRS_SHOWN);
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    }
    ctx.restore();   // 나선 스타일 save 해제 (아직 clipToPlot의 클립은 살아있음)
    ctx.restore();   // 클리핑 해제 — 표적 라벨이 박스 경계 근처여도 잘리지 않게 여기서 미리 푼다

    // 결과 벡터(원점→나선 끝점, 검정) + 수렴점 표적
    // λ>d면 수렴점 = s₀. λ<d면 여러 차수가 섞인 G∞이고 s₀가 아니다 (혼동 금지).
    var pe = map(end);
    arrow(ctx, O[0], O[1], pe[0], pe[1], C_INK, 2.4, 9);
    dottedTarget(ctx, W, map(target), C_RED, open > 1 ? "수렴점 G∞ (≠ s₀)" : "수렴점 = s₀");

    // 인셋 — 입사파(회색, 길이=1 고정눈금) vs s₀(빨강) 나란히. λ≫d에서 s₀가 입사파와
    // 크기 비슷·방향 반대에 가까워짐을 보여준다.
    var ux = 100, uy = 96, unit = 62;
    ctx.save();
    ctx.font = "bold 16px system-ui, sans-serif";
    var headTxt = "인셋: 입사파(회색·=1)  vs  s₀(빨강)";
    var hw = ctx.measureText(headTxt).width;
    backdrop(ctx, ux - 16, uy - 40, hw + 10, 18);
    ctx.fillStyle = C_INK; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(headTxt, ux - 11, uy - 38);
    ctx.restore();
    arrow(ctx, ux, uy, ux + unit, uy, C_GREY, 3, 9);
    arrowLabel(ctx, W, ux + unit + 8, uy, "=1", C_GREY);
    var sAng = Math.atan2(s0.im, s0.re), sLen = unit * mag(s0);
    var sx = ux + sLen * Math.cos(sAng), sy = uy - sLen * Math.sin(sAng);
    arrow(ctx, ux, uy, sx, sy, C_RED, 3, 9);

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

  // ===================================================================
  // 11b. 2단계 접이식 상세 — π배 항등식 |I|·(λ/d) = π·|s₀| (본 화면 메시지와 분리, spec §5)
  // ===================================================================
  function drawDetail2() {
    var det = document.getElementById("detail2");
    if (!det || det.open !== true) return;   // 닫혀 있으면 그리지 않는다
    var c = prep(document.getElementById("canvasDetail2"));
    var ctx = c.ctx, W = c.W, H = c.H;
    var kk = k(lamM()), d = dM();
    var absI = mag(currentExact(kk, A_WIRE, d));
    var ghostLen = absI * ld();
    var s0len = mag(s0Exact(kk, A_WIRE, d));

    panelTitle(ctx, W, "π배 항등식  |I|·(λ/d) = π·|s₀|", "참고용 — 본 화면(정면 관측점 P의 산란파 합)의 메시지와는 별개");

    var by = 66, bx = 190, bw = W - bx - 54, bh = 15, rowGap = 28;
    var vmax = ghostLen * 1.02;
    ctx.save();
    ctx.font = "bold 16px system-ui, sans-serif"; ctx.textBaseline = "middle";
    ctx.textAlign = "right"; ctx.fillStyle = "#8A8A8A";
    ctx.fillText("다 동위상이라면 |I|·(λ/d)", bx - 6, by + bh / 2);
    ctx.fillStyle = "#D8D8D8"; ctx.fillRect(bx, by, bw * (ghostLen / vmax), bh);
    ctx.textAlign = "left"; ctx.fillStyle = "#8A8A8A";
    ctx.fillText(ghostLen.toFixed(3), bx + bw * (ghostLen / vmax) + 5, by + bh / 2);

    ctx.textAlign = "right"; ctx.fillStyle = C_RED;
    ctx.fillText("실제 정면 진폭 |s₀|", bx - 6, by + rowGap + bh / 2);
    ctx.fillStyle = C_RED; ctx.fillRect(bx, by + rowGap, bw * (s0len / vmax), bh);
    ctx.textAlign = "left";
    ctx.fillText(s0len.toFixed(3), bx + bw * (s0len / vmax) + 5, by + rowGap + bh / 2);

    ctx.textAlign = "right"; ctx.font = "bold 16px system-ui, sans-serif"; ctx.fillStyle = C_INK;
    ctx.fillText("← " + (ghostLen / s0len).toFixed(2) + "배 (= π)", W - 8, by + rowGap + 30);
    ctx.restore();
  }

  function drawStep2() { drawStep2Left(); drawStep2Right(); drawDetail2(); }

  // ===================================================================
  // 12. 3단계 — λ/d에 따른 |I|·|s₀|·T 곡선 + 우드 문턱 (v6 §4, v5 buildCurves/drawT/plotCurve 이식)
  // ===================================================================
  var CURVE_LAM = 0.060;                 // 곡선 "형태" 계산용 고정 기준 λ (v5 L17 이식) — a 고정이므로 λ/d축 모양이 대표적
  var CURVE_LD_MIN = 0.3, CURVE_LD_MAX = 20;
  var curves = null;                     // λ/d 축 곡선 — 최초 1회만 계산
  var woodCols = [];                     // 우드 세로선 호버/클릭 히트박스 — drawStep3마다 재계산

  var WOOD_SHORT = "λ=d 문턱 — 모든 이웃이 같은 위상으로 도착, 전류가 0으로 눌림 (Wood anomaly)";
  var WOOD_FULL = "파장이 도선 간격과 정확히 같아지면(λ=d), 이웃 도선에서 도선 A까지의 거리가 파장의 정수배가 되어, 모든 이웃의 산란 전기장이 A 표면에 같은 위상으로 도착한다. 이웃 기여의 진폭은 거리에 따라 천천히만 줄어들므로(원통파의 1/√거리 감쇠), 같은 위상으로 쌓이는 합은 이웃 수를 늘릴수록 한없이 커진다. 그런데 도선 표면의 전기장은 0이어야 하므로, 유한한 전류가 조금이라도 흐르면 이 무한히 큰 되먹임 전기장을 상쇄할 방법이 없다. 결국 경계조건을 만족하는 전류는 0뿐이다. 전류가 0이면 산란파도 없고, 격자는 마치 없는 것처럼 파동을 통과시킨다 (Wood anomaly).";

  function buildCurves() {
    var kk = k(CURVE_LAM);
    var n = 420, out = { ld: [], I: [], s0: [], T: [] };
    for (var i = 0; i < n; i++) {
      var ldv = Math.exp(Math.log(CURVE_LD_MIN) + (Math.log(CURVE_LD_MAX) - Math.log(CURVE_LD_MIN)) * i / (n - 1));
      var dl = 1 / ldv;
      // 정수 d/λ 정확점은 항 탈락 함정 → 표본을 살짝 비켜 놓는다 (v5 이식)
      var near = Math.round(dl);
      if (near >= 1 && Math.abs(dl - near) < 0.004) { dl = near + (dl >= near ? 0.004 : -0.004); ldv = 1 / dl; }
      var d = dl * CURVE_LAM;
      out.ld.push(ldv);
      out.I.push(mag(currentExact(kk, A_WIRE, d)));
      out.s0.push(mag(s0Exact(kk, A_WIRE, d)));
      out.T.push(powers(kk, A_WIRE, d).T);
    }
    return out;
  }

  // withT: 아래(s₀) 그래프에 T(투과율) 점선을 겹쳐 그린다. 현재 (λ,d) 위치는 곡선의 근사값이 아니라
  // 실제 λ,d로 다시 계산한 값으로 찍는다 (곡선은 CURVE_LAM 고정 기준 "형태"일 뿐).
  function plotCurve(ctx, W, x, y, w, h, data, title, color, withT, yLabel) {
    var lo = Math.log(CURVE_LD_MIN), hi = Math.log(CURVE_LD_MAX);
    var X = function (ldv) { return x + w * (Math.log(ldv) - lo) / (hi - lo); };
    var ymax = 1.15;
    var Y = function (v) { return y + h - h * Math.min(v, ymax) / ymax; };

    ctx.save();
    ctx.font = "bold 16px system-ui, sans-serif";
    ctx.fillStyle = color; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillText(title, x, y - 6);
    if (withT) {
      ctx.font = "bold 16px system-ui, sans-serif"; ctx.fillStyle = C_BLUE; ctx.textAlign = "right";
      ctx.fillText("- - - T (투과율)", x + w, y - 6);
    }

    // 틀
    ctx.strokeStyle = "#C9D0D6"; ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    // 우드 이상(정수 d/λ = 1,2,3) 세로 점선 — 도메인 안에 드는 것만
    ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2;
    [1, 2, 3].forEach(function (nInt) {
      var ldv = 1 / nInt;
      if (ldv < CURVE_LD_MIN || ldv > CURVE_LD_MAX) return;
      var lx = X(ldv);
      ctx.strokeStyle = nInt === 1 ? "#7D3C98" : "#C6B0D4";
      ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx, y + h); ctx.stroke();
      woodCols.push({ x: lx, yTop: y, yBot: y + h });
    });
    ctx.setLineDash([]);

    // 눈금
    ctx.font = "13px system-ui, sans-serif"; ctx.fillStyle = "#666";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    [0.3, 0.5, 1, 2, 5, 10, 20].forEach(function (t) {
      if (t < CURVE_LD_MIN || t > CURVE_LD_MAX) return;
      ctx.fillText(String(t), X(t), y + h + 4);
      ctx.strokeStyle = "#C9D0D6"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(t), y + h); ctx.lineTo(X(t), y + h + 3); ctx.stroke();
    });
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    [0, 0.5, 1].forEach(function (v) {
      ctx.fillText(v.toFixed(1), x - 5, Y(v));
      ctx.strokeStyle = "#EDF0F3";
      ctx.beginPath(); ctx.moveTo(x, Y(v)); ctx.lineTo(x + w, Y(v)); ctx.stroke();
    });

    // y축 물리량 라벨 — 세로(90° 회전), 숫자 눈금(0/0.5/1.0) 왼쪽에 겹치지 않게
    if (yLabel) {
      ctx.save();
      ctx.translate(x - 52, y + h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.font = "bold 14px system-ui, sans-serif"; ctx.fillStyle = "#444";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(yLabel, 0, 0);
      ctx.restore();
    }

    ctx.font = "bold 16px system-ui, sans-serif"; ctx.fillStyle = "#444";
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText("λ/d  (로그축)", x + w / 2, y + h + 20);

    // T 곡선 겹치기
    if (withT) {
      ctx.strokeStyle = "rgba(36,113,163,0.85)"; ctx.lineWidth = 2.4; ctx.setLineDash([6, 4]);
      ctx.beginPath();
      curves.ld.forEach(function (ldv, i) {
        var px = X(ldv), py = Y(curves.T[i]);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke(); ctx.setLineDash([]);
    }

    // 본 곡선
    ctx.strokeStyle = color; ctx.lineWidth = 2.6;
    ctx.beginPath();
    curves.ld.forEach(function (ldv, i) {
      var px = X(ldv), py = Y(data[i]);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // 현재 (λ,d) 위치 마커 — x는 곡선축(ld, 도메인 밖이면 clamp), y값은 실제 λ,d로 재계산
    var cur = ld();
    var curClamped = Math.min(CURVE_LD_MAX, Math.max(CURVE_LD_MIN, cur));
    var realVal = data === curves.I ? mag(currentExact(k(lamM()), A_WIRE, dM())) : mag(s0Exact(k(lamM()), A_WIRE, dM()));
    var mx = X(curClamped), my = Y(realVal);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(mx, my, 6, 0, TWO_PI); ctx.fill();
    ctx.strokeStyle = "#FFF"; ctx.lineWidth = 1.8; ctx.stroke();
    arrowLabel(ctx, W, mx + 10, my - 12, (data === curves.I ? "|I| = " : "|s₀| = ") + realVal.toFixed(4), color);

    // s₀ 그래프에서는 같은 x에 실제 T값도 함께 찍어 "반대로 간다"를 바로 대조할 수 있게 한다
    if (withT) {
      var Treal = powers(k(lamM()), A_WIRE, dM()).T;
      var ty = Y(Treal);
      ctx.fillStyle = C_BLUE;
      ctx.beginPath(); ctx.arc(mx, ty, 5, 0, TWO_PI); ctx.fill();
      ctx.strokeStyle = "#FFF"; ctx.lineWidth = 1.6; ctx.stroke();
      arrowLabel(ctx, W, mx + 10, ty + 14, "T = " + (Treal * 100).toFixed(2) + " %", C_BLUE);
    }

    ctx.restore();
  }

  function drawStep3() {
    var c = prep(document.getElementById("canvas3"));
    var ctx = c.ctx, W = c.W, H = c.H;
    if (!curves) curves = buildCurves();
    woodCols = [];

    panelTitle(ctx, W, "3단계 — 그래서 차폐 곡선",
      "λ/d에 따른 |I|·|s₀|·T (곡선 형태는 λ=" + (CURVE_LAM * 1000).toFixed(0) + "mm 고정 기준 · 현재 (λ,d) 위치는 실제값)");

    var gx = 80, gw = W - gx - 40;
    plotCurve(ctx, W, gx, 90, gw, 200, curves.I, "도선 하나의 전류 — 오르내려 차폐를 못 읽음 (|I| vs λ/d)", C_INK, false, "|I| (전류 진폭, 입사파 = 1 규격화)");
    plotCurve(ctx, W, gx, 380, gw, 200, curves.s0, "합쳐진 산란 — 투과율과 정확히 반대 (|s₀| vs λ/d)", C_RED, true, "|s₀|, T (입사파 = 1 규격화 / T는 투과율 0~1)");

    arrowLabel(ctx, W, gx, 644, "보라 점선 = " + WOOD_SHORT, "#7D3C98");
    notes(ctx, W, H, [
      ["점선(보라·연보라) = 정수 d/λ = 1,2,3 지점 — 클릭/마우스오버 시 전문 표시", "#7D3C98"]
    ]);
  }

  // ── 우드 세로선 호버/클릭 툴팁 (HTML #woodTip, 캔버스 위 절대좌표) ──
  function canvasEventXY(cv, e) {
    var r = cv.getBoundingClientRect();
    var lw = +cv.dataset.logicalW || cv.width, lh = +cv.dataset.logicalH || cv.height;
    return [(e.clientX - r.left) * (lw / r.width), (e.clientY - r.top) * (lh / r.height)];
  }
  function woodHitTest(e) {
    var cv = document.getElementById("canvas3");
    var xy = canvasEventXY(cv, e);
    for (var i = 0; i < woodCols.length; i++) {
      var c2 = woodCols[i];
      if (Math.abs(xy[0] - c2.x) <= 8 && xy[1] >= c2.yTop - 4 && xy[1] <= c2.yBot + 4) return true;
    }
    return false;
  }
  function showWoodTip(clientX, clientY) {
    var tip = document.getElementById("woodTip");
    if (!tip) return;
    tip.textContent = WOOD_FULL;
    tip.style.left = Math.min(clientX + 14, window.innerWidth - 380) + "px";
    tip.style.top = (clientY + 14) + "px";
    tip.hidden = false;
  }
  function hideWoodTip() {
    var tip = document.getElementById("woodTip");
    if (tip) tip.hidden = true;
  }

  // ===================================================================
  // 10. 시작 — 자가 테스트 게이트 통과 후에만 렌더 (§1.6)
  // ===================================================================
  var res = runSelfTest();
  console.log(res.text);
  document.getElementById("gateLog").textContent = res.text;
  var badge = document.getElementById("gateBadge");
  if (res.fail === 0) {
    badge.className = "badge pass";
    badge.textContent = "자가 테스트 PASS " + res.pass + " / FAIL 0 — 렌더 진행";
    bind(); gotoStep(1);
  } else {
    badge.className = "badge fail";
    badge.textContent = "자가 테스트 FAIL " + res.fail + " — 렌더 중단";
    document.getElementById("gateDetails").open = true;
  }
})();
