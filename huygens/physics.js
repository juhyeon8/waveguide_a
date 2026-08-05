// 하위헌스-프레넬 장애물 모형 — 순수 물리.
// DOM 을 만지지 않는다. 브라우저(window.HuygensPhysics)와 Node(module.exports) 공용.
// 설계 문서: docs/superpowers/specs/2026-08-05-huygens-obstacle-design.md (커밋 01e5b5e)
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.HuygensPhysics = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TWO_PI = Math.PI * 2;

  // ── 상수·토글 (설계 §12) ────────────────────────────────────────────
  // HUYGENS_SIGN 은 토글이 아니라 고정 상수다. 유도:
  //   2차원 각스펙트럼 임펄스 응답  K = −2·∂G/∂x,  G = (i/4)H₀⁽¹⁾(kr)
  //   (H₀)' = −H₁  ⇒  K = +(ik/2)·H₁⁽¹⁾(kr)·(x/r)
  //   열린 부분 투과함수 τ = 1 − B (B = 막힘 지시함수) 를 대입하면
  //   전 평면 항이 e^{ikx} 를 주고, 막힌 항에 − 가 붙는다.
  // 경사인자 x/r 도 토글로 만들지 않는다. 키르히호프 경사인자 (1+cosθ)/2 로 바꾸면
  // 해석해 t_m 대조(검증의 핵심 축)가 성립하지 않기 때문이다. RS-1종 경사인자가
  // 해석해 대조의 전제다.
  const HUYGENS_SIGN = -1;
  const HUYGENS_M = 200;      // 해석급수 모드 수 (원본 FLOQUET_M=50 과 분리)
  const GRID_W_INF = 360;     // Tab 0 격자 폭
  const GRID_W_FINITE = 200;  // Tab 1 격자 폭 (설계 §9-3 절차로 확정 — 240 은 기준 기하에서 예산 초과)
  const USE_Y_SYMMETRY = true;
  const WIRE_DRAW_EXAGGERATION = 5;
  // 캔버스에 밴드 제목을 그릴지. false 면 캔버스에 글자가 하나도 남지 않는다.
  // 두 곳에서 false 로 쓴다:
  //   (1) §10-2 게이트 2 — ② 칸 x<0 을 예외 없이 편차 0 으로 검사하기 위해.
  //       글자 상자를 예외로 빼는 방식은 폰트 메트릭에 의존해 판정이 환경에
  //       좌우된다 (§15-16). 항목 4의 x 범위·nS, 항목 10의 판정 기하와 같은 결함이다.
  //   (2) 논문 그림 캡처 — 캡션을 패널로 옮긴 것과 같은 이유로 제목도 없는 편이 깔끔하다.
  const DRAW_BAND_TITLES = true;
  const VERIFY_N_ODD = 801;   // 검증 전용 배열 크기 — 반드시 홀수. 401 은 여유 부족(§15-14)
  // 열별 소멸파 조기종료 임계. HUYGENS_M 보다 먼저 급수를 자르면 안 된다.
  // 1e-7 이면 최근접 열에서 λ=12.2cm·d=10mm 는 m=28, λ=1cm·d=60mm 는 m=166 에서
  // 잘려 M=200 에 닿지도 못하고, 실오차가 §9-1 표(1e-10 수준)보다 3~10⁴배 커진다.
  // 1e-10 이면 절단이 각각 m=42 / 249 로 밀려 M 이 다시 구속 조건이 된다.
  const EVANESCENT_EPS = 1e-10;

  // 성능 판정 전용 기준 기하 (설계 §9-1). aspect = bandH/bandW.
  // gridW=360 → gridH=113, gridW=200(=GRID_W_FINITE) → gridH=63 이 되는 값이다.
  // 항목 10 을 창에서 읽은 aspect 로 판정하면 판정이 창 종횡비에 좌우된다 —
  // 넓은 창(aspect 0.167)은 gridH 가 40 까지 내려가 셀 수가 절반이라 통과하지만,
  // 같은 코드가 세로로 긴 창에서는 예산을 넘는다. 판정은 이 기하로 고정한다.
  const DESIGN_ASPECT = 113 / 360;

  // 원본 앱과 동일해야 하는 값
  const A_RATIO_MAX = 0.30;
  const FLOQUET_YW = 0.090;   // 반높이 [m]
  const N_MAX_INF = 80;

  // 유한 배열 T 측정 레시피 (원본 computeTransmittance 와 동일)
  const T_MEAS_X = 0.030;                   // 측정 x [m]
  const T_MEAS_YHALF = FLOQUET_YW * 0.25;   // 22.5 mm
  const T_MEAS_SAMPLES = 41;
  const T_NS_FIXED = 64;      // T 전용 고정 표본 수 (화면 렌더와 별개 — §8-3)

  // ── 베셀 1차 (Abramowitz & Stegun 9.4.4–9.4.6) ─────────────────────
  // 원본 script.js 의 besselJ0/besselY0 과 같은 스타일.
  function besselJ1(x) {
    const ax = Math.abs(x);
    if (ax < 3) {
      const y = (x / 3) * (x / 3);
      return x * (0.5 + y * (-0.56249985 + y * (0.21093573 + y * (-0.03954289 +
        y * (0.00443319 + y * (-0.00031761 + y * 0.00001109))))));
    }
    const z = 3 / ax;
    const f = 0.79788456 + z * (0.00000156 + z * (0.01659667 + z * (0.00017105 +
      z * (-0.00249511 + z * (0.00113653 + z * (-0.00020033))))));
    const t = ax - 2.35619449 + z * (0.12499612 + z * (0.00005650 + z * (-0.00637879 +
      z * (0.00074348 + z * (0.00079824 + z * (-0.00029166))))));
    const r = f / Math.sqrt(ax) * Math.cos(t);
    return x < 0 ? -r : r;
  }

  function besselY1(x) {
    if (x < 3) {
      const y = (x / 3) * (x / 3);
      const poly = -0.6366198 + y * (0.2212091 + y * (2.1682709 + y * (-1.3164827 +
        y * (0.3123951 + y * (-0.0400976 + y * 0.0027873)))));
      return (2 / Math.PI) * Math.log(x / 2) * besselJ1(x) + poly / x;
    }
    const z = 3 / x;
    const f = 0.79788456 + z * (0.00000156 + z * (0.01659667 + z * (0.00017105 +
      z * (-0.00249511 + z * (0.00113653 + z * (-0.00020033))))));
    const t = x - 2.35619449 + z * (0.12499612 + z * (0.00005650 + z * (-0.00637879 +
      z * (0.00074348 + z * (0.00079824 + z * (-0.00029166))))));
    return f / Math.sqrt(x) * Math.sin(t);
  }

  // H₁⁽¹⁾(x) = J₁(x) + i·Y₁(x).
  // x ≥ 3 구간에서 f·t·sqrt 를 J₁·Y₁ 이 공유한다 (설계 §4-3 커널).
  //
  // 결과를 out[0], out[1] 에 쓴다. 객체를 새로 만들지 않는 이유: 최악 조건에서 이 함수가
  // 190만 번 불리는데, Chrome 은 Node 와 달리 반환 객체를 탈출 분석으로 없애 주지
  // 못해 그대로 두면 브라우저에서만 3배 넘게 느려진다 (실측 579 ms → 아래 §9-3 보고).
  function hankel1Into(x, out) {
    if (x < 3) { out[0] = besselJ1(x); out[1] = besselY1(x); return; }
    const z = 3 / x;
    const f = 0.79788456 + z * (0.00000156 + z * (0.01659667 + z * (0.00017105 +
      z * (-0.00249511 + z * (0.00113653 + z * (-0.00020033))))));
    const t = x - 2.35619449 + z * (0.12499612 + z * (0.00005650 + z * (-0.00637879 +
      z * (0.00074348 + z * (0.00079824 + z * (-0.00029166))))));
    const s = f / Math.sqrt(x);
    out[0] = s * Math.cos(t); out[1] = s * Math.sin(t);
  }
  // 모듈 전역 상태를 두지 않는다 (파일 경계 원칙 — 설계 §12). 스크래치는 호출마다 만든다.
  // 안쪽 루프가 아니라 함수 진입부에서만 만들므로 비용은 무시할 수준이다.
  function hankel1(x) {
    const out = new Float64Array(2);
    hankel1Into(x, out);
    return { re: out[0], im: out[1] };
  }

  function sinc(u) { return u === 0 ? 1 : Math.sin(u) / u; }

  // ── 기하 ───────────────────────────────────────────────────────────
  // aspect = bandH / bandW (원본 script.js 의 layout 과 동일 의미)
  function gridGeom(gridW, aspect) {
    const Yw = FLOQUET_YW;
    const gridH = Math.max(40, Math.round(gridW * aspect));
    const Xw = Yw / aspect;
    return {
      gridW: gridW, gridH: gridH, Xw: Xw, Yw: Yw,
      dx_m: 2 * Xw / gridW, dy_m: 2 * Yw / gridH,
    };
  }
  // 격자 셀 중심 좌표 (원본과 동일 규약). gridW 가 짝수라 x=0 은 표본되지 않는다.
  function cellX(gi, g) { return -g.Xw + (gi + 0.5) * g.dx_m; }
  function cellY(gj, g) { return g.Yw - (gj + 0.5) * g.dy_m; }

  function aEffMm(a_mm, d_mm) { return Math.min(a_mm, A_RATIO_MAX * d_mm); }

  function wireYs(N, d_m) {
    const ys = new Float64Array(N);
    for (let n = 0; n < N; n++) ys[n] = (n - (N - 1) / 2) * d_m;
    return ys;
  }

  // 도선당 적분 표본 수 (설계 §4-3). 화면 렌더 전용.
  // T 는 이것을 쓰지 않고 T_NS_FIXED = 64 를 쓴다 (§8-3).
  function nSampleFor(a_m, lam_m, dx_m) {
    const step = Math.min(lam_m / 20, dx_m / 4);
    const n = Math.ceil(2 * a_m / step);
    return Math.max(6, Math.min(64, n));
  }

  // ── 회절차수 ───────────────────────────────────────────────────────
  // t_m = δ_{m0} − (2a/d)·sinc(α_m a)
  function tOrder(m, d_m, a_m) {
    const alpha = TWO_PI * m / d_m;
    return (m === 0 ? 1 : 0) - (2 * a_m / d_m) * sinc(alpha * a_m);
  }
  // κ_m = sqrt(k²−α_m²) (전파) / i·g_m (소멸)
  function kappaOf(m, k, d_m) {
    const alpha = TWO_PI * m / d_m;
    const kk = k * k - alpha * alpha;
    if (kk > 0) return { alpha: alpha, kappa: Math.sqrt(kk), g: 0, prop: true };
    return { alpha: alpha, kappa: 0, g: Math.sqrt(-kk), prop: false };
  }

  // ── 무한 배열 투과율 (해석식) ──────────────────────────────────────
  // T = Σ_전파차수 (κ_m/k)·|t_m|²,  R = 0
  // κ_m ≈ 0 인 스치는 차수(Rayleigh anomaly)는 원본 computeTransmittance 와 같은
  // 상대 임계 1e-9·k² 로 제외한다.
  function T_inf_huygens(lam_cm, d_mm, a_mm) {
    const lam_m = lam_cm / 100;
    const d_m = d_mm / 1000;
    const a_m = aEffMm(a_mm, d_mm) / 1000;
    const k = TWO_PI / lam_m;
    const thr = 1e-9 * k * k;
    const mMax = Math.ceil(d_m / lam_m) + 1;
    let T = 0;
    const orders = [];
    for (let m = -mMax; m <= mMax; m++) {
      const alpha = TWO_PI * m / d_m;
      const kk = k * k - alpha * alpha;
      if (kk <= thr) continue;
      const kappa = Math.sqrt(kk);
      const t = tOrder(m, d_m, a_m);
      const Tm = (kappa / k) * t * t;
      T += Tm;
      orders.push({ m: m, Tm: Tm });
    }
    return { T: T, R: 0, orders: orders };
  }

  // ── Tab 0: 해석급수 (무한 배열) ────────────────────────────────────
  // E_total(x>0) = Σ_{m=−M}^{M} t_m·e^{i(α_m y + κ_m x)}
  // t_m 과 κ_m 은 m 의 우함수이고 α_{−m} = −α_m 이므로 ± 쌍을 묶으면
  //   E_diff = (t₀−1)·e^{ikx} + Σ_{m=1}^{M} 2·t_m·cos(α_m y)·e^{iκ_m x}
  // 계산량이 절반이고 y → −y 대칭이 부동소수점 수준에서 정확해진다.
  // x ≤ 0 에서는 정확히 0 (이 모형에는 반사가 없다 — 본질적 한계).
  function analyticDiffAt(wx, wy, k, d_m, a_m) {
    if (wx <= 0) return { re: 0, im: 0 };
    let re = 0, im = 0;
    const t0 = tOrder(0, d_m, a_m) - 1;
    re += t0 * Math.cos(k * wx);
    im += t0 * Math.sin(k * wx);
    // |t_m| (m≥1) 의 상계. 개별 t_m 은 sinc 영점에서 0 이 되므로 종료 판정에 쓸 수 없다.
    const tEnv = 2 * a_m / d_m;
    for (let m = 1; m <= HUYGENS_M; m++) {
      const t = tOrder(m, d_m, a_m);
      const kp = kappaOf(m, k, d_m);
      let cr, ci;
      if (kp.prop) {
        cr = Math.cos(kp.kappa * wx); ci = Math.sin(kp.kappa * wx);
      } else {
        const amp = Math.exp(-kp.g * wx);
        // 소멸차수 조기종료 (설계 §4-2). 물리적 감쇠를 그대로 따르므로 인위적 오차가 아니다.
        // 종료(break)는 반드시 포락선 tEnv 로 판정한다. |t_m| 으로 끊으면 sinc 영점
        // (α_m a = π, 예: d=30mm·a=1mm 의 m=15)에서 아직 살아 있는 뒤쪽 소멸파를
        // 통째로 버려 근거리에서 6.5e-4 짜리 순실수 오차가 생긴다.
        if (tEnv * amp < EVANESCENT_EPS) break;
        if (Math.abs(t) * amp < EVANESCENT_EPS) continue;
        cr = amp; ci = 0;
      }
      const w = 2 * t * Math.cos(kp.alpha * wy);
      re += w * cr; im += w * ci;
    }
    return { re: re, im: im };
  }

  // 격자 전체. 행방향 인자 2·t_m·cos(α_m y) 와 열방향 인자 e^{iκ_m x} 로 분리해
  // 외적으로 누산한다 (설계 §4-2 분리가능 계산).
  function analyticDiffGrid(g, k, d_m, a_m) {
    const n = g.gridW * g.gridH;
    const outRe = new Float32Array(n), outIm = new Float32Array(n);
    const colRe = new Float64Array(g.gridW), colIm = new Float64Array(g.gridW);
    const rowW = new Float64Array(g.gridH);

    // 살아 있는 열 중 가장 작은 x (= 최근접 열). 소멸차수 종료 판정의 기준점이다.
    let xMinPos = Infinity;
    for (let gi = 0; gi < g.gridW; gi++) {
      const wx = cellX(gi, g);
      if (wx > 0 && wx < xMinPos) xMinPos = wx;
    }
    // |t_m| (m≥1) 의 상계. 개별 t_m 은 sinc 영점에서 0 이 되므로 종료 판정에 쓸 수 없다.
    const tEnv = 2 * a_m / d_m;

    for (let m = 0; m <= HUYGENS_M; m++) {
      const kp = (m === 0)
        ? { alpha: 0, kappa: k, g: 0, prop: true }
        : kappaOf(m, k, d_m);

      // 소멸차수 종료는 포락선으로 판정한다. |t_m| 으로 끊으면 sinc 영점에서
      // 아직 살아 있는 뒤쪽 소멸파를 통째로 버린다 (analyticDiffAt 의 같은 주석 참조).
      if (!kp.prop && tEnv * Math.exp(-kp.g * xMinPos) < EVANESCENT_EPS) break;

      const t = (m === 0) ? (tOrder(0, d_m, a_m) - 1) : tOrder(m, d_m, a_m);
      if (t === 0) continue;

      let anyAlive = false;
      for (let gi = 0; gi < g.gridW; gi++) {
        const wx = cellX(gi, g);
        if (wx <= 0) { colRe[gi] = 0; colIm[gi] = 0; continue; }
        if (kp.prop) {
          colRe[gi] = Math.cos(kp.kappa * wx);
          colIm[gi] = Math.sin(kp.kappa * wx);
          anyAlive = true;
        } else {
          // 열별 조기종료 (설계 §4-2)
          const amp = Math.exp(-kp.g * wx);
          if (Math.abs(t) * amp < EVANESCENT_EPS) { colRe[gi] = 0; colIm[gi] = 0; continue; }
          colRe[gi] = amp; colIm[gi] = 0;
          anyAlive = true;
        }
      }
      if (!anyAlive) continue;

      for (let gj = 0; gj < g.gridH; gj++) {
        rowW[gj] = (m === 0) ? t : 2 * t * Math.cos(kp.alpha * cellY(gj, g));
      }

      for (let gj = 0; gj < g.gridH; gj++) {
        const w = rowW[gj];
        if (w === 0) continue;
        const base = gj * g.gridW;
        for (let gi = 0; gi < g.gridW; gi++) {
          const cr = colRe[gi];
          if (cr === 0 && colIm[gi] === 0) continue;
          outRe[base + gi] += w * cr;
          outIm[base + gi] += w * colIm[gi];
        }
      }
    }
    return { re: outRe, im: outIm };
  }

  // ── Tab 1: RS-1종 수치 적분 (유한 배열) ────────────────────────────
  //   E_diff(x>0,y) = HUYGENS_SIGN·(ik/2)·Σ_n Σ_s H₁⁽¹⁾(k r)·(x/r)·Δ'
  //   r = sqrt(x² + (y − y')²),  y' = y_n − a + (s+0.5)·Δ',  Δ' = 2a/nS
  // 복소 전개 (HUYGENS_SIGN = −1):
  //   Δre = +(k/2)(x/r)Δ'·H₁ᵢ ,  Δim = −(k/2)(x/r)Δ'·H₁ᵣ
  // 막힌 부분만 적분하는 바비네 뒤집기이므로 a = 0 이면 기여가 정확히 0 이다.
  // (Δ' = 0 이면 r 클램프도 0 이 되어 H₁(0) 이 발산하므로 반드시 먼저 걸러야 한다.)
  // scratch 는 선택 인자다. Float64Array(2) 를 넘기면 그것을 작업 공간으로 쓴다.
  // 모듈 전역 스크래치를 두지 않으면서(설계 §12 파일 경계 원칙) 안쪽 루프의 할당도
  // 없애기 위한 것이다. 호출자 소유이므로 함수는 여전히 순수하다 —
  // 같은 입력에 같은 출력이고, scratch 의 잔여 내용은 결과에 영향을 주지 않는다.
  // 안쪽 루프에서 객체를 만들면 Chrome 이 탈출 분석으로 없애 주지 못해 3.7배,
  // 점마다 새 배열을 만들면 Node 가 25 % 느려진다 (HANDOFF §8).
  function rsDiffAt(wx, wy, k, wiresY, a_m, nS, scratch) {
    if (wx <= 0 || a_m <= 0) return { re: 0, im: 0 };
    const dPrime = 2 * a_m / nS;
    const rMin = dPrime / 2;
    const pref = 0.5 * k * dPrime;
    const h = scratch || new Float64Array(2);
    let sr = 0, si = 0;
    for (let n = 0; n < wiresY.length; n++) {
      const y0 = wiresY[n] - a_m;
      for (let s = 0; s < nS; s++) {
        const dy = wy - (y0 + (s + 0.5) * dPrime);
        let r = Math.sqrt(wx * wx + dy * dy);
        if (r < rMin) r = rMin;          // 특이점 가드
        hankel1Into(k * r, h);
        const w = pref * (wx / r);
        sr += w * h[1];
        si -= w * h[0];
      }
    }
    return { re: sr, im: si };
  }

  // 격자 전체. USE_Y_SYMMETRY 는 근사가 아니다:
  // 도선 배열 y_n = (n−(N−1)/2)·d 와 표본 오프셋이 둘 다 y=0 대칭이므로
  // E(x,−y) = E(x,y) 가 정확히 성립한다.
  function rsDiffGrid(g, k, wiresY, a_m, nS, useSymmetry) {
    const n = g.gridW * g.gridH;
    const outRe = new Float32Array(n), outIm = new Float32Array(n);
    if (a_m <= 0) return { re: outRe, im: outIm };
    const scratch = new Float64Array(2);   // 격자 전체에 하나. rsDiffAt 주석 참조
    const half = useSymmetry ? Math.ceil(g.gridH / 2) : g.gridH;
    for (let gj = 0; gj < half; gj++) {
      const wy = cellY(gj, g);
      const base = gj * g.gridW;
      const mirror = g.gridH - 1 - gj;
      const mbase = mirror * g.gridW;
      for (let gi = 0; gi < g.gridW; gi++) {
        const wx = cellX(gi, g);
        if (wx <= 0) continue;
        const v = rsDiffAt(wx, wy, k, wiresY, a_m, nS, scratch);
        outRe[base + gi] = v.re; outIm[base + gi] = v.im;
        if (useSymmetry && mirror !== gj) {
          outRe[mbase + gi] = v.re; outIm[mbase + gi] = v.im;
        }
      }
    }
    return { re: outRe, im: outIm };
  }

  // 하위헌스-장애물 모형은 스칼라 이론이라 편광을 구별하지 못한다.
  // 원본 앱의 τ 자리를 대체하되 항상 1 을 준다.
  function TAU_FOR_POL(polParallel) { return 1; }

  // ── 유한 배열 투과율 (수치) ────────────────────────────────────────
  // 원본 computeTransmittance 와 동일한 측정 레시피:
  //   x = 30 mm, 측정창 반높이 22.5 mm, 41 표본, 평균 |E|²
  // 도선당 적분 표본은 화면 렌더용 nS 와 별개로 T_NS_FIXED = 64 고정 (§8-3).
  // 이유: 화면 렌더의 nS 는 격자 Δx 가 표현할 수 있는 해상도에 맞춘 값이라 창 크기에 따라
  // 6까지 내려가지만, T 는 논문에 싣는 수치이므로 화면 해상도와 무관하게 고정된
  // 최대 정밀도로 계산해야 한다. 즉 T 쪽이 언제나 화면 렌더보다 정확하다.
  function T_fin_huygens(lam_cm, d_mm, a_mm, N) {
    const k = TWO_PI / (lam_cm / 100);
    const d_m = d_mm / 1000;
    const a_m = aEffMm(a_mm, d_mm) / 1000;
    const wires = wireYs(N, d_m);
    const scratch = new Float64Array(2);   // rsDiffAt 주석 참조
    let sum = 0;
    for (let s = 0; s < T_MEAS_SAMPLES; s++) {
      const wy = -T_MEAS_YHALF + (s / (T_MEAS_SAMPLES - 1)) * 2 * T_MEAS_YHALF;
      const dv = rsDiffAt(T_MEAS_X, wy, k, wires, a_m, T_NS_FIXED, scratch);
      const tr = Math.cos(k * T_MEAS_X) + dv.re;
      const ti = Math.sin(k * T_MEAS_X) + dv.im;
      sum += tr * tr + ti * ti;
    }
    return sum / T_MEAS_SAMPLES;
  }

  return {
    TWO_PI: TWO_PI,
    HUYGENS_SIGN: HUYGENS_SIGN, HUYGENS_M: HUYGENS_M,
    GRID_W_INF: GRID_W_INF, GRID_W_FINITE: GRID_W_FINITE,
    USE_Y_SYMMETRY: USE_Y_SYMMETRY,
    WIRE_DRAW_EXAGGERATION: WIRE_DRAW_EXAGGERATION,
    DRAW_BAND_TITLES: DRAW_BAND_TITLES,
    VERIFY_N_ODD: VERIFY_N_ODD, EVANESCENT_EPS: EVANESCENT_EPS,
    DESIGN_ASPECT: DESIGN_ASPECT,
    A_RATIO_MAX: A_RATIO_MAX, FLOQUET_YW: FLOQUET_YW, N_MAX_INF: N_MAX_INF,
    T_MEAS_X: T_MEAS_X, T_MEAS_YHALF: T_MEAS_YHALF,
    T_MEAS_SAMPLES: T_MEAS_SAMPLES, T_NS_FIXED: T_NS_FIXED,
    besselJ1: besselJ1, besselY1: besselY1, hankel1: hankel1, sinc: sinc,
    gridGeom: gridGeom, cellX: cellX, cellY: cellY,
    aEffMm: aEffMm, wireYs: wireYs, nSampleFor: nSampleFor,
    tOrder: tOrder, kappaOf: kappaOf,
    T_inf_huygens: T_inf_huygens, T_fin_huygens: T_fin_huygens,
    analyticDiffAt: analyticDiffAt, analyticDiffGrid: analyticDiffGrid,
    rsDiffAt: rsDiffAt, rsDiffGrid: rsDiffGrid,
    TAU_FOR_POL: TAU_FOR_POL,
  };
});
