// 원본 Faraday/script.js 의 **유한 배열 MoM** 경로를 복사, 원본 무수정.
// 복사 시점 커밋(Faraday) = 0cf9519  (브랜치 feature/huygens-obstacle 의 생성 시점 HEAD)
//   원본 script.js 를 마지막으로 바꾼 커밋 = f40a3b2
// 설계 문서 = docs/superpowers/specs/2026-08-05-huygens-obstacle-design.md
// 설계 문서 커밋(바깥 저장소) = 0e42430  (§6-2 가 이 파일의 규율을 정한 커밋)
//
// 두 저장소가 분리되어 있으므로 이 주석이 복사본 ↔ 원본 ↔ 설계 문서를 잇는 유일한
// 추적 고리다. 원본 script.js 가 나중에 바뀌면 이 해시로 어느 시점의 복사본인지 판별한다.
//
// ── 왜 이 파일이 필요한가 (설계 §6-2) ──────────────────────────────────
// 비교 페이지의 하단 정량 패널은 **iframe 통신에 의존하지 않고 직접 계산한다**(§8-2).
// 그런데 `T_fin_grid`(유한 배열 MoM)는 원본 script.js 의 IIFE 안에만 있어 밖에서 부를 수
// 없다. 다른 경로는 전부 설계가 막아 두었다:
//   · iframe `#infoBox` 파싱 → §8-2 위반. §15-6 이 이미 삭제한 방식
//   · bridge.js 가 T 를 보고 → §7 이 "T 는 보고하지 않는다"로 명시
//   · 원본 script.js 리팩터링 → §2-1 원본 3파일 무수정 위반
// 그래서 shared/floquet-ref.js 와 **같은 규율**로 복사본을 하나만 둔다.
//
// ── besselJ0 / besselY0 / solveComplex 가 floquet-ref.js 와 중복된다 ────
// **공통 모듈로 합치지 않는다.** 합치면 "원본에서 글자 그대로 옮긴다"는 규율이 깨지고,
// 두 복사본이 서로 다른 시점의 원본을 참조하게 될 때 어느 쪽이 어긋났는지 추적할 수
// 없게 된다. 각 복사본은 자기 파일 안에서 원본 한 시점과 1:1 로 대응해야 한다.
// 중복은 비용이 아니라 추적 가능성의 대가다.
//
// ── 개선하지 않는다 ────────────────────────────────────────────────────
// 아래 코드는 원본에서 글자 그대로 옮긴 것이다. 더 빠르거나 더 정확한 방법이 있어도
// 바꾸지 않는다. 이 파일의 존재 이유는 **원본과 같은 값을 내는 것**이기 때문이다.
// 어긋남은 §10-2 게이트 10(원본 앱 #infoBox 와 소수점 1자리 대조)이 잡는다.
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MomRef = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TWO_PI = Math.PI * 2;
  const A_RATIO_MAX = 0.30;      // 원본 script.js 와 동일
  const FLOQUET_YW = 0.090;      // 반높이 [m] — 원본과 동일

  // 유한 배열 T 측정 레시피 (원본 computeTransmittance 의 유한 분기와 동일)
  const T_MEAS_X = 0.030;                  // 측정 x 거리 30 mm 고정
  const T_MEAS_YHALF = FLOQUET_YW * 0.25;  // 측정창 반높이 22.5 mm 고정
  const T_MEAS_SAMPLES = 41;

  // ── 원본 script.js 의 besselJ0 / besselY0 / hankel0 을 그대로 옮긴 것 ──
  // (Abramowitz & Stegun 9.4 다항 근사)
  function besselJ0(x) {
    const ax = Math.abs(x);
    if (ax < 3) {
      const y = (x / 3) * (x / 3);
      return 1 + y * (-2.2499997 + y * (1.2656208 + y * (-0.3163866 +
        y * (0.0444479 + y * (-0.0039444 + y * 0.0002100)))));
    }
    const z = 3 / ax;
    const f = 0.79788456 + z * (-0.00000077 + z * (-0.00552740 + z * (-0.00009512 +
      z * (0.00137237 + z * (-0.00072805 + z * 0.00014476)))));
    const t = ax - 0.78539816 + z * (-0.04166397 + z * (-0.00003954 + z * (0.00262573 +
      z * (-0.00054125 + z * (-0.00029333 + z * 0.00013558)))));
    return f / Math.sqrt(ax) * Math.cos(t);
  }

  function besselY0(x) {
    if (x < 3) {
      const y = (x / 3) * (x / 3);
      const poly = 0.36746691 + y * (0.60559366 + y * (-0.74350384 + y * (0.25300117 +
        y * (-0.04261214 + y * (0.00427916 + y * (-0.00024846))))));
      return (2 / Math.PI) * Math.log(x / 2) * besselJ0(x) + poly;
    }
    const z = 3 / x;
    const f = 0.79788456 + z * (-0.00000077 + z * (-0.00552740 + z * (-0.00009512 +
      z * (0.00137237 + z * (-0.00072805 + z * 0.00014476)))));
    const t = x - 0.78539816 + z * (-0.04166397 + z * (-0.00003954 + z * (0.00262573 +
      z * (-0.00054125 + z * (-0.00029333 + z * 0.00013558)))));
    return f / Math.sqrt(x) * Math.sin(t);
  }

  function hankel0(x) { return { re: besselJ0(x), im: besselY0(x) }; }

  // ── 원본 script.js 의 solveComplex 를 그대로 옮긴 것 ──────────────────
  // 복소 선형계 Z c = b (N×N, 부분 피벗 가우스 소거)
  function solveComplex(N, Z, b) {
    const M = Z.slice();
    const x = b.slice();
    for (let col = 0; col < N; col++) {
      let piv = col, best = -1;
      for (let r = col; r < N; r++) {
        const re = M[(r * N + col) * 2], im = M[(r * N + col) * 2 + 1];
        const mag = re * re + im * im;
        if (mag > best) { best = mag; piv = r; }
      }
      if (piv !== col) {
        for (let k = 0; k < N; k++) {
          const i1 = (col * N + k) * 2, i2 = (piv * N + k) * 2;
          let t = M[i1]; M[i1] = M[i2]; M[i2] = t;
          t = M[i1 + 1]; M[i1 + 1] = M[i2 + 1]; M[i2 + 1] = t;
        }
        let t = x[col * 2]; x[col * 2] = x[piv * 2]; x[piv * 2] = t;
        t = x[col * 2 + 1]; x[col * 2 + 1] = x[piv * 2 + 1]; x[piv * 2 + 1] = t;
      }
      const pr = M[(col * N + col) * 2], pi = M[(col * N + col) * 2 + 1];
      const pden = pr * pr + pi * pi;
      for (let r = 0; r < N; r++) {
        if (r === col) continue;
        const fr0 = M[(r * N + col) * 2], fi0 = M[(r * N + col) * 2 + 1];
        const fr = (fr0 * pr + fi0 * pi) / pden;
        const fi = (fi0 * pr - fr0 * pi) / pden;
        if (fr === 0 && fi === 0) continue;
        for (let k = col; k < N; k++) {
          const ar = M[(col * N + k) * 2], ai = M[(col * N + k) * 2 + 1];
          M[(r * N + k) * 2]     -= fr * ar - fi * ai;
          M[(r * N + k) * 2 + 1] -= fr * ai + fi * ar;
        }
        const br = x[col * 2], bi = x[col * 2 + 1];
        x[r * 2]     -= fr * br - fi * bi;
        x[r * 2 + 1] -= fr * bi + fi * br;
      }
    }
    for (let i = 0; i < N; i++) {
      const dr = M[(i * N + i) * 2], di = M[(i * N + i) * 2 + 1];
      const den = dr * dr + di * di;
      const xr = x[i * 2], xi = x[i * 2 + 1];
      x[i * 2]     = (xr * dr + xi * di) / den;
      x[i * 2 + 1] = (xi * dr - xr * di) / den;
    }
    return x;
  }

  // ── 원본 recompute() 의 유한 배열 MoM 조립을 그대로 옮긴 것 ───────────
  //   Z_mn = H₀(k·ρ_mn),  ρ_mn = |y_m − y_n|  (자기항은 ρ = a)
  //   b_m  = −1  (입사파 −1, E∥ 경계조건)
  function solveCurrents(k, aEff_m, wiresY) {
    const N = wiresY.length;
    const ZM = new Float64Array(N * N * 2);
    const b  = new Float64Array(N * 2);
    const Hself = hankel0(k * aEff_m);
    for (let m = 0; m < N; m++) {
      b[m * 2] = -1; b[m * 2 + 1] = 0;
      for (let n = 0; n < N; n++) {
        const h = (m === n) ? Hself : hankel0(k * Math.abs(wiresY[m] - wiresY[n]));
        ZM[(m * N + n) * 2] = h.re;
        ZM[(m * N + n) * 2 + 1] = h.im;
      }
    }
    const c = solveComplex(N, ZM, b);
    const cRe = new Float64Array(N), cIm = new Float64Array(N);
    for (let n = 0; n < N; n++) { cRe[n] = c[n * 2]; cIm[n] = c[n * 2 + 1]; }
    return { cRe: cRe, cIm: cIm };
  }

  // 원본 script.js 와 동일한 도선 배치 (y=0 중심)
  function wireYs(N, d_m) {
    const w = new Float64Array(N);
    for (let n = 0; n < N; n++) w[n] = (n - (N - 1) / 2) * d_m;
    return w;
  }

  // ── 원본 computeTransmittance() 의 유한 분기를 그대로 옮긴 것 ─────────
  //   x = 30 mm, 측정창 반높이 22.5 mm, 41 표본 평균 |E|²
  //   tau = 1 (E∥). 비교는 E∥ 조건에서만 정의된다 (설계 §8-1).
  function T_fin_grid(lam_cm, d_mm, a_mm, N) {
    const lam_m = lam_cm / 100;
    const d_m = d_mm / 1000;
    const aEff_m = Math.min(a_mm, A_RATIO_MAX * d_mm) / 1000;
    const k = TWO_PI / lam_m;
    const tau = 1;

    const wiresY = wireYs(N, d_m);
    const cur = solveCurrents(k, aEff_m, wiresY);
    const cRe = cur.cRe, cIm = cur.cIm;

    const xMeas = T_MEAS_X;
    const yHalf = T_MEAS_YHALF;
    const samples = T_MEAS_SAMPLES;
    let sum = 0;
    for (let s = 0; s < samples; s++) {
      const wy = -yHalf + (s / (samples - 1)) * 2 * yHalf;
      let tr = Math.cos(k * xMeas), ti = Math.sin(k * xMeas);
      let sr = 0, si = 0;
      for (let n = 0; n < N; n++) {
        const dy = wy - wiresY[n];
        let r = Math.sqrt(xMeas * xMeas + dy * dy);
        if (r < aEff_m) r = aEff_m;
        const x = k * r;
        const jr = besselJ0(x), yi = besselY0(x);
        sr += cRe[n] * jr - cIm[n] * yi;
        si += cRe[n] * yi + cIm[n] * jr;
      }
      tr += tau * sr; ti += tau * si;
      sum += tr * tr + ti * ti;
    }
    return sum / samples;
  }

  return {
    besselJ0: besselJ0, besselY0: besselY0, hankel0: hankel0,
    solveComplex: solveComplex, solveCurrents: solveCurrents, wireYs: wireYs,
    T_fin_grid: T_fin_grid,
    T_MEAS_X: T_MEAS_X, T_MEAS_YHALF: T_MEAS_YHALF, T_MEAS_SAMPLES: T_MEAS_SAMPLES,
  };
});
