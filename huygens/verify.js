// 하위헌스-장애물 모형 — 순수 판정 모음 (설계 문서 §10-1)
// physics.js 에만 의존한다. DOM 을 만지지 않는다.
// 브라우저와 Node 가 같은 코드를 실행한다 (이중 가드). 판정을 두 번 구현하지 않기 위함이다.
(function (root, factory) {
  "use strict";
  const P = (typeof module !== "undefined" && module.exports)
    ? require("./physics.js")
    : root.HuygensPhysics;
  const api = factory(P);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HuygensVerify = api;
})(typeof self !== "undefined" ? self : this, function (P) {
  "use strict";

  // 브라우저 창이 없을 때(Node) 쓸 기본 기하.
  // 설계 §9-1 기준 기하(gridW=360 → gridH=113, gridW=240 → gridH=75)를 그대로 쓴다.
  const NODE_DEFAULT_ENV = {
    label: "Node 기본 기하 (설계 §9-1 실측 창 재현)",
    aspect: P.DESIGN_ASPECT,
    cssW: null, cssH: null,
    recomputeMs: null,
  };

  function fmt(x, n) { return Number(x).toExponential(n === undefined ? 2 : n); }

  // 조건에서 격자·파수·도선 배열을 만드는 공용 헬퍼
  function setup(env, gridW, lam_cm, d_mm, a_mm, N) {
    const g = P.gridGeom(gridW, env.aspect);
    const k = P.TWO_PI / (lam_cm / 100);
    const d_m = d_mm / 1000;
    const a_m = P.aEffMm(a_mm, d_mm) / 1000;
    const nS = P.nSampleFor(a_m, lam_cm / 100, g.dx_m);
    return { g: g, k: k, d_m: d_m, a_m: a_m, nS: nS, wiresY: P.wireYs(N, d_m) };
  }

  // 항목 0(환경 기록)과 항목 10(recompute 실측)은 여기에 없다.
  // 둘 다 브라우저에서만 얻는 값이고 DOM(캔버스 크기·recompute 호출)에 의존하므로
  // script.js 쪽에 있다. 이 파일은 DOM 을 만지지 않는다 (설계 §12 파일 경계 원칙).

  // ── 항목 1. 베셀 J₁/Y₁ 기준값 ──────────────────────────────────────
  function check1() {
    const cases = [
      ["J₁(1)", P.besselJ1(1), 0.440051],
      ["Y₁(1)", P.besselY1(1), -0.781213],
      ["J₁(5)", P.besselJ1(5), -0.327579],
    ];
    let worst = 0;
    const detail = cases.map(function (c) {
      const err = Math.abs(c[1] - c[2]);
      if (err > worst) worst = err;
      return c[0] + "=" + c[1].toFixed(6) + "(기대 " + c[2].toFixed(6) + ")";
    }).join("  ");
    return {
      no: 1, name: "베셀 J₁/Y₁ 기준값",
      pass: worst < 1e-5,
      detail: detail + "  최대 절대오차 " + fmt(worst) + " (기준 <1e-5)",
    };
  }

  // ── 항목 2. a → 0 이면 차이장이 0 ──────────────────────────────────
  // a = 0 을 그대로 쓰면 자명하게 통과한다 — Tab 0 은 t_m = δ_{m0} 이라 급수가 통째로
  // 사라지고, Tab 1 은 적분 폭이 0 이라 조기 반환된다. 즉 적분 경로가 한 번도 안 돈다.
  // a = 0.001 mm 로 두어 두 경로가 실제로 돌게 한다.
  //
  // 판정 영역은 Δx < x ≤ 30 mm (최근접 열을 뺀 측정면까지)다.
  // 최근접 열 x = Δx/2 는 창 크기에 따라 도선 평면에 얼마나 가까워지는지가 달라져
  // (실측 aspect 0.167/0.314/0.440 → 1.50/0.80/0.57 mm) 소멸파 합이 그만큼 커진다.
  // 그 열로 판정하면 판정 정밀도가 창 크기에 좌우된다 — §10-1 4번에서 x 범위와 nS 를
  // 창과 무관하게 만든 것과 같은 이유다. x ≤ 30 mm 상한만으로는 부족하다: 최댓값이
  // 언제나 최근접 열에서 나오므로 상한을 걸어도 값이 바뀌지 않는다.
  //
  // 다만 여기서 잘라내는 것은 오차가 아니라 물리다. a = 0.001 mm 에서도 도선 평면
  // 바로 뒤에는 소멸파에 의한 국소 교란이 실제로 존재한다. 판정에서 뺄 뿐 사라지게
  // 하지 않는다 — 최근접 열을 포함한 편차를 [기록]으로 함께 출력한다.
  const A_TINY_MM = 0.001;
  function check2(env) {
    const out = [];
    let worstJudged = 0, worstAll = 0;

    [["Tab0 해석급수", P.GRID_W_INF], ["Tab1 RS적분", P.GRID_W_FINITE]].forEach(function (t) {
      const s = setup(env, t[1], 12.2, 10, A_TINY_MM, 30);
      const F = (t[1] === P.GRID_W_INF)
        ? P.analyticDiffGrid(s.g, s.k, s.d_m, s.a_m)
        : P.rsDiffGrid(s.g, s.k, s.wiresY, s.a_m, s.nS, P.USE_Y_SYMMETRY);
      let judged = 0, all = 0;
      for (let gj = 0; gj < s.g.gridH; gj++) {
        for (let gi = 0; gi < s.g.gridW; gi++) {
          const wx = P.cellX(gi, s.g);
          if (wx <= 0 || wx > P.T_MEAS_X) continue;
          const v = Math.hypot(F.re[gj * s.g.gridW + gi], F.im[gj * s.g.gridW + gi]);
          if (v > all) all = v;
          if (wx > s.g.dx_m && v > judged) judged = v;   // 최근접 열 제외
        }
      }
      if (judged > worstJudged) worstJudged = judged;
      if (all > worstAll) worstAll = all;
      out.push(t[0] + " 판정 " + fmt(judged) + " · 최근접 열(x=" +
        (s.g.dx_m / 2 * 1000).toFixed(2) + "mm) 포함 " + fmt(all));
    });

    return {
      no: 2, name: "a→0 (a=" + A_TINY_MM + "mm) → |③−①| ≈ 0",
      pass: worstJudged < 1e-3,
      detail: "판정 " + fmt(worstJudged) + " (기준 <1e-3·A)\n" +
        "        판정 영역 Δx < x ≤ " + (P.T_MEAS_X * 1000).toFixed(0) +
        "mm(최근접 열을 뺀 측정면까지) · 적분 경로가 실제로 도는 조건\n        " +
        out.join("\n        ") +
        "\n        [기록·판정 아님] 최근접 열까지 포함하면 " + fmt(worstAll) + ".\n" +
        "        이는 구현 오차가 아니라 도선 평면 바로 뒤 소멸파의 실재를 반영한 값이다.",
    };
  }

  // ── 항목 3. t₀ = 1 − 2a/d ──────────────────────────────────────────
  function check3() {
    const cases = [[10, 0.5], [10, 3], [30, 1], [3, 0.5], [60, 3]];
    let worst = 0;
    cases.forEach(function (c) {
      const d_mm = c[0], a_mm = c[1];
      const aEff = P.aEffMm(a_mm, d_mm);
      const got = P.tOrder(0, d_mm / 1000, aEff / 1000);
      const want = 1 - 2 * (aEff / 1000) / (d_mm / 1000);
      const err = Math.abs(got - want);
      if (err > worst) worst = err;
    });
    return {
      no: 3, name: "t₀ = 1 − 2a/d",
      pass: worst < 1e-9,
      detail: "5조건 최대 절대오차 " + fmt(worst) + " (기준 <1e-9)",
    };
  }

  // ── 항목 4. 수치 필드 vs 해석급수 대조 ─────────────────────────────
  // 조건: [라벨, λ cm, d mm, a mm]
  // 다차수 조건은 λ=1.2 cm 다. λ=1 cm·d=30 mm 는 d/λ=3.000 인 Rayleigh 특이점이라
  // 유한 배열이 무한 배열로 원리적으로 수렴하지 않는다 (설계 §14-7).
  const COND4 = [
    ["단일차수 λ=12.2cm d=10mm a=0.5mm", 12.2, 10, 0.5],
    ["다차수5개 λ=1.2cm d=30mm a=1mm", 1.2, 30, 1],
  ];

  // Tab 1 격자의 0 < x ≤ 30 mm 열 목록 × |y| ≤ 22.5 mm 행 목록.
  //
  // x 를 측정면 30 mm 까지로 한정한다 (설계 §10-1 4번, 2026-08-05 갱신). x 를 격자 끝까지
  // 넓히면 판정이 브라우저 창 크기에 좌우되어 검증으로서 결함이 된다 — 창이 넓으면
  // Xw = Yw/aspect 가 커져(실측 287 mm → 540 mm) 최원 열이 멀어지고, 그 거리에서 유한
  // 배열이 무한 배열에 수렴하려면 N 이 비례해 늘어난다(N=401 에서 4.2e-3 → 1.29e-2).
  // 이 어긋남은 구현 오류가 아니라 유한/무한의 물리적 차이다. x 가 커질수록 필요한 N 이
  // 늘어난다는 사실 자체는 --converge 모드로 따로 측정해 HANDOFF.md 에 남긴다.
  function region4(g) {
    const xs = [], ys = [];
    for (let gi = 0; gi < g.gridW; gi++) {
      const wx = -g.Xw + (gi + 0.5) * g.dx_m;
      if (wx > 0 && wx <= P.T_MEAS_X) xs.push(wx);
    }
    for (let gj = 0; gj < g.gridH; gj++) {
      const wy = g.Yw - (gj + 0.5) * g.dy_m;
      if (Math.abs(wy) <= P.T_MEAS_YHALF) ys.push(wy);
    }
    return { xs: xs, ys: ys };
  }

  // 영역 위 RS 필드. |y| 가 같은 행은 대칭이므로 한 번만 계산하고 복사한다(근사 아님).
  function rsRegion(reg, k, wiresY, a_m, nS) {
    const nx = reg.xs.length, ny = reg.ys.length;
    const re = new Float64Array(nx * ny), im = new Float64Array(nx * ny);
    const cache = {};
    for (let j = 0; j < ny; j++) {
      const key = Math.abs(reg.ys[j]).toExponential(12);
      const hit = cache[key];
      for (let i = 0; i < nx; i++) {
        if (hit !== undefined) {
          re[j * nx + i] = re[hit * nx + i]; im[j * nx + i] = im[hit * nx + i];
        } else {
          const v = P.rsDiffAt(reg.xs[i], reg.ys[j], k, wiresY, a_m, nS);
          re[j * nx + i] = v.re; im[j * nx + i] = v.im;
        }
      }
      if (hit === undefined) cache[key] = j;
    }
    return { re: re, im: im, nx: nx, ny: ny };
  }

  function check4(env) {
    const gT = P.gridGeom(P.GRID_W_FINITE, env.aspect);
    const xNear = gT.dx_m / 2;      // Tab 1 최근접 열
    let worstPoint = 0, worstRegion = 0, worstDouble = 0;
    const notes = [];
    const renderNotes = [];
    const renderNS = [];

    COND4.forEach(function (c) {
      const lam_cm = c[1], d_mm = c[2], a_mm = c[3];
      const k = P.TWO_PI / (lam_cm / 100);
      const d_m = d_mm / 1000;
      const a_m = P.aEffMm(a_mm, d_mm) / 1000;
      // 판정은 nS = T_NS_FIXED (64) 고정으로 한다 (설계 §10-1 4번, 2026-08-05 갱신).
      // 화면 렌더의 nS 는 Δx 에 묶여 있어 창 크기에 따라 6까지 내려간다. 그것으로 판정하면
      // 판정 정밀도가 창 크기에 좌우된다 — x 범위를 측정면까지로 한정한 것과 같은 이유이고,
      // §8-3 이 T 에 이미 적용한 원칙("화면 해상도와 무관하게 고정된 최대 정밀도")과도 같다.
      const nS = P.T_NS_FIXED;
      // 화면 렌더의 실효 nS. 판정에는 쓰지 않고 아래 [기록] 항에만 쓴다 (§15-5).
      const nSRender = P.nSampleFor(a_m, lam_cm / 100, gT.dx_m);
      renderNS.push(nSRender);
      const wires401 = P.wireYs(P.VERIFY_N_ODD, d_m);

      // [기록] 화면 렌더 nS 로 계산했을 때의 최근접 열 편차 — 판정이 아니다.
      // §15-5 의 "근거리 표본 간격 적정성 확인"을 판정에서 기록으로 강등한 것이며,
      // 논문 그림의 수치 정확도 근거는 판정값(nS=64)이 아니라 이 값이다.
      {
        const nr = P.rsDiffAt(xNear, 0, k, wires401, a_m, nSRender);
        const ar = P.analyticDiffAt(xNear, 0, k, d_m, a_m);
        let mx = 0;
        const reg0 = region4(gT);
        for (let j = 0; j < reg0.ys.length; j++) {
          for (let i = 0; i < reg0.xs.length; i++) {
            const a = P.analyticDiffAt(reg0.xs[i], reg0.ys[j], k, d_m, a_m);
            mx = Math.max(mx, Math.hypot(a.re, a.im));
          }
        }
        let dmax = 0;
        for (let j = 0; j < reg0.ys.length; j++) {
          const v = P.rsDiffAt(xNear, reg0.ys[j], k, wires401, a_m, nSRender);
          const a = P.analyticDiffAt(xNear, reg0.ys[j], k, d_m, a_m);
          dmax = Math.max(dmax, Math.hypot(v.re - a.re, v.im - a.im));
        }
        renderNotes.push(c[0] + " nS=" + nSRender + " → 최근접 열 편차 " +
          fmt(mx > 0 ? dmax / mx : 0) +
          " (y=0 단독 " + fmt(Math.hypot(nr.re - ar.re, nr.im - ar.im) / (mx || 1)) + ")");
      }

      // (a) 점 대조 — x = 30 mm 와 최근접 열, y = 0
      [P.T_MEAS_X, xNear].forEach(function (wx) {
        const num = P.rsDiffAt(wx, 0, k, wires401, a_m, nS);
        const ana = P.analyticDiffAt(wx, 0, k, d_m, a_m);
        // 전체장끼리 비교한다 (차이장은 마디 근처에서 분모가 0 이 될 수 있다)
        const tn = { re: num.re + Math.cos(k * wx), im: num.im + Math.sin(k * wx) };
        const ta = { re: ana.re + Math.cos(k * wx), im: ana.im + Math.sin(k * wx) };
        const rel = Math.hypot(tn.re - ta.re, tn.im - ta.im) / Math.hypot(ta.re, ta.im);
        if (rel > worstPoint) worstPoint = rel;
        notes.push(c[0] + " x=" + (wx * 1000).toFixed(2) + "mm rel=" + fmt(rel));
      });

      // (b) 영역 대조 — Tab 1 격자 x>0 전체 × |y| ≤ 22.5 mm
      // 상대오차는 max|E_해석| 으로 정규화한다. 점별로 나누면 마디에서 발산하고,
      // 설계 §10-1 4번의 배증 시험도 같은 정규화를 쓴다.
      const reg = region4(gT);
      const num = rsRegion(reg, k, wires401, a_m, nS);
      let mx = 0, dmax = 0;
      for (let j = 0; j < reg.ys.length; j++) {
        for (let i = 0; i < reg.xs.length; i++) {
          const a = P.analyticDiffAt(reg.xs[i], reg.ys[j], k, d_m, a_m);
          const p = j * reg.xs.length + i;
          mx = Math.max(mx, Math.hypot(a.re, a.im));
          dmax = Math.max(dmax, Math.hypot(num.re[p] - a.re, num.im[p] - a.im));
        }
      }
      const relR = mx > 0 ? dmax / mx : 0;
      if (relR > worstRegion) worstRegion = relR;

      // (c) 401 ↔ 801 배증 시험 (둘 다 홀수)
      const num801 = rsRegion(reg, k, P.wireYs(2 * P.VERIFY_N_ODD - 1, d_m), a_m, nS);
      let mx401 = 0, dd = 0;
      for (let p = 0; p < num.re.length; p++) {
        mx401 = Math.max(mx401, Math.hypot(num.re[p], num.im[p]));
        dd = Math.max(dd, Math.hypot(num801.re[p] - num.re[p], num801.im[p] - num.im[p]));
      }
      const relD = mx401 > 0 ? dd / mx401 : 0;
      if (relD > worstDouble) worstDouble = relD;
      notes.push(c[0] + " 영역 rel=" + fmt(relR) + " 배증(" + P.VERIFY_N_ODD + "↔" +
        (2 * P.VERIFY_N_ODD - 1) + ") rel=" + fmt(relD) +
        " nS=" + nS);
    });

    return {
      no: 4, name: "수치 ↔ 해석급수 대조 (N=" + P.VERIFY_N_ODD + ", 홀수)",
      pass: worstPoint < 1e-3 && worstRegion < 1e-3 && worstDouble < 1e-3,
      detail: "점 " + fmt(worstPoint) + " · 영역 " + fmt(worstRegion) +
        " · 배증 " + fmt(worstDouble) + " (기준 <1e-3)\n" +
        "        영역 0 < x ≤ " + (P.T_MEAS_X * 1000).toFixed(0) + "mm(측정면) × |y| ≤ " +
        (P.T_MEAS_YHALF * 1000).toFixed(1) + "mm\n" +
        "        판정 적분 표본 nS = " + P.T_NS_FIXED + " 고정  ·  화면 렌더 실효 nS = " +
        renderNS.join("/") + " (Δx 에 묶여 창 크기에 따라 달라짐)\n        " +
        notes.join("\n        ") +
        "\n        [기록·판정 아님] 화면 렌더 nS 로 계산한 근거리 편차 (§15-5):\n        " +
        renderNotes.join("\n        ") +
        "\n        → 논문 그림의 수치 정확도 근거는 이 [기록] 값이다. 판정값(nS=" +
        P.T_NS_FIXED + ")이 아니다.",
    };
  }

  // ── 항목 5. x < 0 전 영역에서 차이장이 정확히 0 ────────────────────
  function check5(env) {
    const s0 = setup(env, P.GRID_W_INF, 12.2, 10, 0.5, 30);
    const A = P.analyticDiffGrid(s0.g, s0.k, s0.d_m, s0.a_m);
    const s1 = setup(env, P.GRID_W_FINITE, 12.2, 10, 0.5, 30);
    const R = P.rsDiffGrid(s1.g, s1.k, s1.wiresY, s1.a_m, s1.nS, P.USE_Y_SYMMETRY);
    let bad = 0, cells = 0;
    function scan(g, F) {
      for (let gj = 0; gj < g.gridH; gj++) {
        for (let gi = 0; gi < g.gridW; gi++) {
          if (-g.Xw + (gi + 0.5) * g.dx_m >= 0) continue;
          cells++;
          const i = gj * g.gridW + gi;
          if (F.re[i] !== 0 || F.im[i] !== 0) bad++;
        }
      }
    }
    scan(s0.g, A); scan(s1.g, R);
    return {
      no: 5, name: "x<0 차이장 ≡ 0 (정확히)",
      pass: bad === 0,
      detail: "x<0 셀 " + cells + "개 중 0 이 아닌 셀 " + bad + "개",
    };
  }

  // ── 항목 6. λ 무관성 시그니처 ──────────────────────────────────────
  function check6() {
    const t15 = P.T_inf_huygens(15, 10, 0.5).T;
    const t25 = P.T_inf_huygens(25, 10, 0.5).T;
    const diff = Math.abs(t15 - t25);
    return {
      no: 6, name: "λ 무관성 (d=10 mm)",
      pass: diff < 1e-6,
      detail: "T(15cm)=" + (t15 * 100).toFixed(4) + "%  T(25cm)=" + (t25 * 100).toFixed(4) +
        "%  차이 " + fmt(diff) + " (기준 <1e-6)",
    };
  }

  // ── 항목 7. §11 참고 수치표 T_하위헌스 8조건 ────────────────────────
  // [λ cm, d mm, a mm, 기대 T %]
  // 기대값은 설계 §11 표를 소수 둘째 자리로 적은 것이다 (2026-08-06).
  // 한 자리로 적으면 편차가 실제 오차가 아니라 표의 반올림에서 생긴다 —
  // 44.4 % 로 적으면 정확값 44.4444 % 와의 차이 0.0444 %p 가 기준 0.05 %p 를 거의 다 먹는다.
  const TABLE11 = [
    [12.2, 10, 0.5, 81.00], [25, 10, 0.5, 81.00], [5, 10, 0.5, 81.00], [2, 10, 0.5, 81.00],
    [12.2, 10, 3, 16.00], [12.2, 30, 1, 87.11], [1, 30, 1, 88.56], [12.2, 3, 0.5, 44.44],
  ];
  function check7() {
    let worst = 0, worstLabel = "";
    const parts = TABLE11.map(function (c) {
      const got = P.T_inf_huygens(c[0], c[1], c[2]).T * 100;
      const err = Math.abs(got - c[3]);
      if (err > worst) { worst = err; worstLabel = "λ" + c[0] + "/d" + c[1] + "/a" + c[2]; }
      return "λ" + c[0] + "/d" + c[1] + "/a" + c[2] + "→" + got.toFixed(2) + "%";
    });
    return {
      no: 7, name: "§11 표 T_하위헌스 8조건",
      pass: worst < 0.05,
      detail: parts.join("  ") + "\n        최대 편차 " + worst.toFixed(4) + " %p (" +
        worstLabel + ", 기준 <0.05 %p)",
    };
  }

  // ── 항목 8. USE_Y_SYMMETRY on/off 일치 ─────────────────────────────
  function check8(env) {
    const s = setup(env, P.GRID_W_FINITE, 12.2, 10, 0.5, 30);
    const on = P.rsDiffGrid(s.g, s.k, s.wiresY, s.a_m, s.nS, true);
    const off = P.rsDiffGrid(s.g, s.k, s.wiresY, s.a_m, s.nS, false);
    let mx = 0, worst = 0;
    for (let i = 0; i < on.re.length; i++) mx = Math.max(mx, Math.hypot(off.re[i], off.im[i]));
    for (let i = 0; i < on.re.length; i++) {
      worst = Math.max(worst, Math.hypot(on.re[i] - off.re[i], on.im[i] - off.im[i]));
    }
    const rel = mx > 0 ? worst / mx : 0;
    return {
      no: 8, name: "USE_Y_SYMMETRY on/off 일치",
      pass: rel < 1e-9,
      detail: "상대오차 " + fmt(rel) + " (기준 <1e-9)",
    };
  }

  // ── 항목 9. 편광을 뒤집어도 결과 비트 동일 (스칼라 이론) ───────────
  function check9(env) {
    const tPar = P.TAU_FOR_POL(true), tPerp = P.TAU_FOR_POL(false);
    const s = setup(env, P.GRID_W_FINITE, 12.2, 10, 0.5, 30);
    const F = P.rsDiffGrid(s.g, s.k, s.wiresY, s.a_m, s.nS, P.USE_Y_SYMMETRY);
    let identical = true;
    for (let i = 0; i < F.re.length; i++) {
      // script.js 의 렌더 경로와 동일하게 τ 를 곱한 값끼리 비교한다.
      if (F.re[i] * tPar !== F.re[i] * tPerp || F.im[i] * tPar !== F.im[i] * tPerp) {
        identical = false; break;
      }
    }
    return {
      no: 9, name: "편광 무관 (스칼라 이론)",
      pass: tPar === 1 && tPerp === 1 && identical,
      detail: "τ(E∥)=" + tPar + " τ(E⊥)=" + tPerp + " · 전 격자 비트 동일=" + identical,
    };
  }

  // ── Node 물리 벤치마크 (--perf) ─────────────────────────────────
  // 항목 10(브라우저 recompute() 실측)이 아니다. 그건 DOM 에 의존하므로 script.js 에 있다.
  // 이것은 같은 최악 조건의 물리 계산만 Node 에서 재는 것으로, 브라우저 값과 나란히
  // 놓고 보기 위한 참고치다. 판정하지 않는다.
  //
  // 반드시 조건마다 프로세스를 격리해 부를 것 (설계 §9-4). 한 프로세스에서 여러 조건을
  // 연달아 재면 V8 최적화 해제로 같은 코드가 3배까지 느려진다 (실측 328 → 1206 ms).
  // 최악 조건(λ=1cm, d=10mm, a=3mm, N=60, Tab 1)의 물리 계산 소요시간.
  // 항목 10 의 판정은 이것을 P.DESIGN_ASPECT 로 불러서 쓴다 — 창에서 읽은 aspect 로
  // 판정하면 판정이 창 종횡비에 좌우되기 때문이다 (physics.js 의 DESIGN_ASPECT 주석).
  function benchMs(aspect) {
    const g = P.gridGeom(P.GRID_W_FINITE, aspect);
    const k = P.TWO_PI / 0.01;
    const a_m = P.aEffMm(3, 10) / 1000;
    const nS = P.nSampleFor(a_m, 0.01, g.dx_m);
    const wires = P.wireYs(60, 0.010);
    // 설계 §9-1 과 같은 방법: 7회 중 최소. 첫 회는 JIT 예열 전이다.
    // recompute() 의 지배적 두 부분(격자 RS 적분 + T_fin)을 함께 잰다.
    let ms = Infinity;
    for (let i = 0; i < 7; i++) {
      const t0 = Date.now();
      P.rsDiffGrid(g, k, wires, a_m, nS, P.USE_Y_SYMMETRY);
      P.T_fin_huygens(1, 10, 3, 60);
      const e = Date.now() - t0;
      if (e < ms) ms = e;
    }
    return { ms: ms, gridW: g.gridW, gridH: g.gridH, nS: nS };
  }

  function benchReport(aspect) {
    const r = benchMs(aspect);
    return [
      "[벤치] Node 물리 벤치마크 — 최악 조건 λ=1cm d=10mm a=3mm N=60, Tab 1",
      "[벤치] gridW=" + r.gridW + " gridH=" + r.gridH + " nS=" + r.nS +
        "  ·  7회 중 최소 " + r.ms + " ms  (예산 300 ms)",
      "[벤치] 항목 10(브라우저 recompute 실측)과 다른 값이다. 판정하지 않는다.",
    ];
  }

  // ── Node 전용 수렴 시험 (--converge) ───────────────────────────────
  // 판정이 아니라 측정이다. 항목 4의 영역을 측정면까지로 한정한 근거를 남기기 위한 것으로,
  // 결과는 HANDOFF.md 에 기록한다. 페이지 로드에서는 돌리지 않는다.
  //
  // 창 크기와 무관하게 재려고 격자를 쓰지 않는다:
  //   x = 물리 좌표 고정 (30 mm 가 본 시험 지점, 나머지는 추세 근거용)
  //   y = T 측정창과 같은 41 표본 (|y| ≤ 22.5 mm)
  //   nS = T_NS_FIXED (64) 고정 — N 축만 분리해 보기 위함
  const CONVERGE_X_MM = [30, 100, 300, 540];
  const CONVERGE_N = [401, 801, 1601];
  const CONVERGE_COND = [
    ["λ=12.2cm d=10mm a=0.5mm  (d/λ=0.082)", 12.2, 10, 0.5],
    ["λ=1.2cm  d=30mm a=1mm    (d/λ=2.500, 설계 검증 조건)", 1.2, 30, 1],
    ["λ=1.2cm  d=60mm a=1mm    (d/λ=5.000, Rayleigh 특이점)", 1.2, 60, 1],
  ];

  function convergeReport() {
    const lines = [];
    lines.push("[수렴] x = 물리 좌표 고정 · y = |y| ≤ 22.5 mm 의 41 표본 · nS = " +
      P.T_NS_FIXED + " 고정");
    lines.push("[수렴] 상대오차 = max|E_RS − E_해석| / max|E_해석|  (같은 41 표본 위에서)");
    CONVERGE_COND.forEach(function (c) {
      const lam_cm = c[1], d_mm = c[2], a_mm = c[3];
      const k = P.TWO_PI / (lam_cm / 100);
      const d_m = d_mm / 1000;
      const a_m = P.aEffMm(a_mm, d_mm) / 1000;
      lines.push("[수렴] " + c[0]);
      let head = "         x [mm] │";
      CONVERGE_N.forEach(function (N) { head += ("  N=" + N).padStart(11); });
      lines.push(head);
      CONVERGE_X_MM.forEach(function (xmm) {
        const wx = xmm / 1000;
        const ana = [];
        let mx = 0;
        for (let s = 0; s < P.T_MEAS_SAMPLES; s++) {
          const wy = -P.T_MEAS_YHALF + (s / (P.T_MEAS_SAMPLES - 1)) * 2 * P.T_MEAS_YHALF;
          const a = P.analyticDiffAt(wx, wy, k, d_m, a_m);
          ana.push({ y: wy, re: a.re, im: a.im });
          mx = Math.max(mx, Math.hypot(a.re, a.im));
        }
        let row = ("  " + xmm + (xmm === 30 ? " *" : "  ")).padStart(16) + "│";
        CONVERGE_N.forEach(function (N) {
          const wires = P.wireYs(N, d_m);
          let dmax = 0;
          for (let s = 0; s < ana.length; s++) {
            const v = P.rsDiffAt(wx, ana[s].y, k, wires, a_m, P.T_NS_FIXED);
            dmax = Math.max(dmax, Math.hypot(v.re - ana[s].re, v.im - ana[s].im));
          }
          row += ("  " + (mx > 0 ? dmax / mx : 0).toExponential(2)).padStart(11);
        });
        lines.push(row);
      });
    });
    lines.push("[수렴] * = 측정면 30 mm (항목 4의 영역 상한). 나머지 x 는 추세 근거용.");
    lines.push("[수렴] 판정: x 가 커질수록 같은 N 의 오차가 커진다 → 수렴에 필요한 N 이");
    lines.push("       x 에 따라 늘어난다. 항목 4의 영역을 측정면까지로 한정하는 근거다.");
    return lines;
  }

  // ── 항목 11. 스크래치 인자의 참조 투명성 ───────────────────────────
  // physics.js 는 모듈 전역 상태를 두지 않는 것이 원칙이고, rsDiffAt 의 scratch 인자가
  // 유일한 예외다 (설계 §3-1). "호출자 소유라 순수하다"는 주장의 근거를 여기서 만든다.
  function check11(env) {
    const s = setup(env, P.GRID_W_FINITE, 12.2, 10, 0.5, 30);
    const pts = [];
    for (let i = 1; i <= 12; i++) {
      pts.push([s.g.dx_m * i * 0.7, s.g.dy_m * (i - 6) * 1.3]);
    }

    // (a) 스크래치 유무가 결과를 바꾸지 않는가
    let mismatchA = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = P.rsDiffAt(pts[i][0], pts[i][1], s.k, s.wiresY, s.a_m, s.nS);
      const b = P.rsDiffAt(pts[i][0], pts[i][1], s.k, s.wiresY, s.a_m, s.nS,
        new Float64Array(2));
      if (a.re !== b.re || a.im !== b.im) mismatchA++;
    }

    // (b) 같은 스크래치를 재사용해도 첫 호출과 같은가 (잔여 상태 누출 검사)
    // 사이사이에 다른 조건으로 호출해 스크래치를 일부러 더럽힌다.
    const shared = new Float64Array(2);
    let mismatchB = 0;
    const first = [];
    for (let i = 0; i < pts.length; i++) {
      first.push(P.rsDiffAt(pts[i][0], pts[i][1], s.k, s.wiresY, s.a_m, s.nS, shared));
    }
    for (let i = 0; i < pts.length; i++) {
      P.rsDiffAt(0.030, 0.001 * i, s.k, s.wiresY, s.a_m, 64, shared);   // 더럽히기
      const again = P.rsDiffAt(pts[i][0], pts[i][1], s.k, s.wiresY, s.a_m, s.nS, shared);
      if (again.re !== first[i].re || again.im !== first[i].im) mismatchB++;
    }

    return {
      no: 11, name: "스크래치 인자의 참조 투명성 (설계 §3-1 예외)",
      pass: mismatchA === 0 && mismatchB === 0,
      detail: "스크래치 유무 비트 동일: " + (pts.length - mismatchA) + "/" + pts.length +
        " · 스크래치 재사용 후에도 첫 호출과 동일: " + (pts.length - mismatchB) + "/" +
        pts.length + " (둘 다 전부 일치해야 함)",
    };
  }

  // 설계 §10-1 의 1~9·11 번. 항목 0·10 은 브라우저 전용이라 script.js 에 있다.
  const CHECKS = [check1, check2, check3, check4, check5,
                  check6, check7, check8, check9, check11];

  function run(env) {
    const e = env || NODE_DEFAULT_ENV;
    const lines = [];
    const results = [];
    let allPass = true;
    for (let i = 0; i < CHECKS.length; i++) {
      const r = CHECKS[i](e);
      results.push(r);
      if (!r.pass) allPass = false;
      lines.push("[검증] " + r.no + ". " + r.name + " … " +
        (r.pass ? "PASS" : "FAIL") + "\n        " + r.detail);
    }
    return { pass: allPass, lines: lines, results: results };
  }

  return {
    run: run, convergeReport: convergeReport,
    benchMs: benchMs, benchReport: benchReport,
    NODE_DEFAULT_ENV: NODE_DEFAULT_ENV,
  };
});

// Node 직접 실행: node huygens/verify.js  [--perf | --converge]
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const V = module.exports;
  if (process.argv.indexOf("--converge") !== -1) {
    V.convergeReport().forEach(function (l) { console.log(l); });
    process.exit(0);
  }
  if (process.argv.indexOf("--perf") !== -1) {
    // 이 모드는 판정을 돌리지 않는다. 같은 프로세스에서 항목 1~9 를 먼저 돌리면
    // V8 최적화 해제로 측정이 3배까지 왜곡되기 때문이다 (설계 §9-4).
    V.benchReport(V.NODE_DEFAULT_ENV.aspect).forEach(function (l) { console.log(l); });
    process.exit(0);
  }
  const out = V.run(V.NODE_DEFAULT_ENV);
  out.lines.forEach(function (l) { console.log(l); });
  console.log(out.pass ? "[검증] 전 항목 PASS" : "[검증] FAIL 항목 있음");
  process.exit(out.pass ? 0 : 1);
}
