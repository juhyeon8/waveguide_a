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
  // 5. 시작 — 자가 테스트 게이트 통과 후에만 렌더 (§1.6) — Task 1에서는 렌더 없음
  // ===================================================================
  var res = runSelfTest();
  console.log(res.text);
  document.getElementById("gateLog").textContent = res.text;
  var badge = document.getElementById("gateBadge");
  if (res.fail === 0) {
    badge.className = "badge pass";
    badge.textContent = "자가 테스트 PASS " + res.pass + " / FAIL 0 — 렌더 진행";
    // (렌더는 Task 2 이후)
  } else {
    badge.className = "badge fail";
    badge.textContent = "자가 테스트 FAIL " + res.fail + " — 렌더 중단";
    document.getElementById("gateDetails").open = true;
  }
})();
