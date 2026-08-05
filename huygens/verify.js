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
  // 설계 §9-1 실측 창(gridW=360 → gridH=113, gridW=240 → gridH=75)을 그대로 재현한다.
  const NODE_DEFAULT_ENV = {
    label: "Node 기본 기하 (설계 §9-1 실측 창 재현)",
    aspect: 113 / 360,
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

  // ── 항목 0. 환경 기록 (항상 출력, 판정 없음) ───────────────────────
  function check0(env) {
    const g0 = P.gridGeom(P.GRID_W_INF, env.aspect);
    const g1 = P.gridGeom(P.GRID_W_FINITE, env.aspect);
    // 기본 조건(λ=12.2 cm, d=10 mm, a=0.5 mm)의 화면 렌더용 표본 수
    const a_m = P.aEffMm(0.5, 10) / 1000;
    const nS0 = P.nSampleFor(a_m, 0.122, g0.dx_m);
    const nS1 = P.nSampleFor(a_m, 0.122, g1.dx_m);
    const css = (env.cssW && env.cssH)
      ? env.cssW.toFixed(0) + "×" + env.cssH.toFixed(0) + " px"
      : "(브라우저 아님 — " + env.label + ")";
    return {
      no: 0, name: "환경 기록",
      pass: true,
      detail: "캔버스 CSS " + css + "\n" +
        "        Tab0  gridW=" + g0.gridW + " gridH=" + g0.gridH +
        " Δx=" + (g0.dx_m * 1000).toFixed(4) + "mm nS=" + nS0 +
        " Δ'=" + (2 * a_m * 1000 / nS0).toFixed(4) + "mm\n" +
        "        Tab1  gridW=" + g1.gridW + " gridH=" + g1.gridH +
        " Δx=" + (g1.dx_m * 1000).toFixed(4) + "mm nS=" + nS1 +
        " Δ'=" + (2 * a_m * 1000 / nS1).toFixed(4) + "mm",
    };
  }

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

  // ── 항목 2. a = 0 이면 차이장이 전 격자에서 0 ──────────────────────
  function check2(env) {
    const s0 = setup(env, P.GRID_W_INF, 12.2, 10, 0, 30);
    const A = P.analyticDiffGrid(s0.g, s0.k, s0.d_m, 0);
    const s1 = setup(env, P.GRID_W_FINITE, 12.2, 10, 0, 30);
    const R = P.rsDiffGrid(s1.g, s1.k, s1.wiresY, 0, s1.nS, P.USE_Y_SYMMETRY);
    let wa = 0, wr = 0;
    for (let i = 0; i < A.re.length; i++) wa = Math.max(wa, Math.hypot(A.re[i], A.im[i]));
    for (let i = 0; i < R.re.length; i++) wr = Math.max(wr, Math.hypot(R.re[i], R.im[i]));
    const worst = Math.max(wa, wr);
    return {
      no: 2, name: "a=0 → |③−①| = 0",
      pass: worst < 1e-3,
      detail: "해석급수 " + fmt(wa) + " / RS적분 " + fmt(wr) + " (기준 <1e-3·A)",
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

  // Tab 1 격자의 x>0 열 목록 × |y| ≤ 22.5 mm 행 목록
  function region4(g) {
    const xs = [], ys = [];
    for (let gi = 0; gi < g.gridW; gi++) {
      const wx = -g.Xw + (gi + 0.5) * g.dx_m;
      if (wx > 0) xs.push(wx);
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

    COND4.forEach(function (c) {
      const lam_cm = c[1], d_mm = c[2], a_mm = c[3];
      const k = P.TWO_PI / (lam_cm / 100);
      const d_m = d_mm / 1000;
      const a_m = P.aEffMm(a_mm, d_mm) / 1000;
      const nS = P.nSampleFor(a_m, lam_cm / 100, gT.dx_m);
      const wires401 = P.wireYs(P.VERIFY_N_ODD, d_m);

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
      notes.push(c[0] + " 영역 rel=" + fmt(relR) + " 배증(401↔801) rel=" + fmt(relD) +
        " nS=" + nS);
    });

    return {
      no: 4, name: "수치 ↔ 해석급수 대조 (N=" + P.VERIFY_N_ODD + ", 홀수)",
      pass: worstPoint < 1e-3 && worstRegion < 1e-3 && worstDouble < 1e-3,
      detail: "점 " + fmt(worstPoint) + " · 영역 " + fmt(worstRegion) +
        " · 배증 " + fmt(worstDouble) + " (기준 <1e-3)\n        " + notes.join("\n        "),
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
  const TABLE11 = [
    [12.2, 10, 0.5, 81.0], [25, 10, 0.5, 81.0], [5, 10, 0.5, 81.0], [2, 10, 0.5, 81.0],
    [12.2, 10, 3, 16.0], [12.2, 30, 1, 87.1], [1, 30, 1, 88.6], [12.2, 3, 0.5, 44.4],
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

  // ── 항목 10. 최악 조건 소요시간 < 300 ms ───────────────────────────
  // 최악 조건: λ=1 cm, d=10 mm, a=3 mm(=0.3·d 상한), N=60, Tab 1
  function check10(env) {
    let ms, src;
    if (env.recomputeMs !== null && env.recomputeMs !== undefined) {
      ms = Math.round(env.recomputeMs);
      src = "브라우저 recompute() 실측";
    } else {
      const g = P.gridGeom(P.GRID_W_FINITE, env.aspect);
      const k = P.TWO_PI / 0.01;
      const a_m = P.aEffMm(3, 10) / 1000;
      const nS = P.nSampleFor(a_m, 0.01, g.dx_m);
      const wires = P.wireYs(60, 0.010);
      const t0 = Date.now();
      P.rsDiffGrid(g, k, wires, a_m, nS, P.USE_Y_SYMMETRY);
      ms = Date.now() - t0;
      src = env.perfOnly
        ? "Node 격리 프로세스 측정 (권위 있는 값)"
        : "Node 같은 프로세스 측정 — 참고값 (V8 최적화 해제로 최대 3배 왜곡 가능)";
    }
    return {
      no: 10, name: "최악 조건 소요시간 (λ=1cm d=10mm a=3mm N=60)",
      pass: ms < 300,
      detail: ms + " ms · " + src + " (기준 <300 ms)",
    };
  }

  const CHECKS = [check0, check1, check2, check3, check4, check5,
                  check6, check7, check8, check9, check10];

  function run(env) {
    const e = env || NODE_DEFAULT_ENV;
    const list = e.perfOnly ? [check0, check10] : CHECKS;
    const lines = [];
    const results = [];
    let allPass = true;
    for (let i = 0; i < list.length; i++) {
      const r = list[i](e);
      results.push(r);
      if (!r.pass) allPass = false;
      lines.push("[검증] " + r.no + ". " + r.name + " … " +
        (r.pass ? "PASS" : "FAIL") + "\n        " + r.detail);
    }
    return { pass: allPass, lines: lines, results: results };
  }

  return { run: run, NODE_DEFAULT_ENV: NODE_DEFAULT_ENV };
});

// Node 직접 실행: node huygens/verify.js  [--perf]
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const V = module.exports;
  const perf = process.argv.indexOf("--perf") !== -1;
  const env = Object.assign({}, V.NODE_DEFAULT_ENV, { perfOnly: perf });
  if (perf) console.log("[검증] --perf 모드: 항목 0·10 만 실행 (조건별 프로세스 격리)");
  const out = V.run(env);
  out.lines.forEach(function (l) { console.log(l); });
  console.log(out.pass ? "[검증] 전 항목 PASS" : "[검증] FAIL 항목 있음");
  process.exit(out.pass ? 0 : 1);
}
