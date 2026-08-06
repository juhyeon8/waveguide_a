// 원본 Faraday/script.js 에서 복사, 원본 무수정.
// 복사 시점 커밋(Faraday) = 0cf9519  (브랜치 feature/huygens-obstacle 의 생성 시점 HEAD)
// 설계 문서 = docs/superpowers/specs/2026-08-05-huygens-obstacle-design.md
// 설계 문서 커밋(바깥 저장소) = 5f5c564 → bd0f660  (2026-08-05 Phase 1 실측 반영본)
//   5f5c564 는 이 파일을 복사할 당시의 기준이라 지우지 않고 병기한다.
//
// 두 저장소가 분리되어 있으므로 이 주석이 복사본 ↔ 원본 ↔ 설계 문서를 잇는 유일한
// 추적 고리다. 원본 script.js 가 나중에 바뀌면 이 해시로 어느 시점의 복사본인지 판별한다.
//
// Floquet 해석식 복사본은 프로젝트 전체에서 단 하나만 둔다 (설계 §6).
// huygens/ 와 compare/ 가 같은 파일을 <script src> 로 공유한다.
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FloquetRef = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TWO_PI = Math.PI * 2;
  const FLOQUET_M = 50;      // 원본 script.js 와 동일
  const A_RATIO_MAX = 0.30;  // 원본 script.js 와 동일

  // 원본 script.js 의 floquetZ 를 그대로 옮긴 것 (개선하지 않는다)
  //   Z = (2i/d) · Σ_{m=−M}^{M} (1/κ_m) · exp(i·κ_m·a)
  function floquetZ(k, a_m, d_m) {
    const tpd = TWO_PI / d_m;
    let sRe = 0, sIm = 0;
    for (let m = -FLOQUET_M; m <= FLOQUET_M; m++) {
      const al = m * tpd;
      const kk = k * k - al * al;
      let krRe, krIm;
      if (kk >= 0) { krRe = Math.sqrt(kk); krIm = 0; }
      else { krRe = 0; krIm = Math.sqrt(-kk); }
      const mag2 = krRe * krRe + krIm * krIm;
      if (mag2 < 1e-30) continue;
      const ikRe = krRe / mag2, ikIm = -krIm / mag2;   // 1/κ_m
      const ex = Math.exp(-krIm * a_m);
      const eRe = ex * Math.cos(krRe * a_m);           // exp(i·κ·a)
      const eIm = ex * Math.sin(krRe * a_m);
      sRe += ikRe * eRe - ikIm * eIm;
      sIm += ikRe * eIm + ikIm * eRe;
    }
    const f = 2 / d_m;                                 // ×(2i/d)
    return { re: -f * sIm, im: f * sRe };
  }

  // 원본 computeTransmittance 의 Floquet 분기를 그대로 옮긴 것
  //   c = −1/Z,  s_m = c·(2i)/(d·κ_m),  t_m = δ_{m0} + s_m,  r_m = s_m
  //   T = Σ (κ_m/k)|t_m|²,  R = Σ (κ_m/k)|r_m|²   (전파차수만)
  function T_inf_grid(lam_cm, d_mm, a_mm) {
    const lam_m = lam_cm / 100;
    const d_m = d_mm / 1000;
    const a_m = Math.min(a_mm, A_RATIO_MAX * d_mm) / 1000;
    const k = TWO_PI / lam_m;

    const Zf = floquetZ(k, a_m, d_m);
    const Zden = Zf.re * Zf.re + Zf.im * Zf.im;
    const cRe = -Zf.re / Zden;
    const cIm = Zf.im / Zden;

    const tpd = TWO_PI / d_m;
    const thr = 1e-9 * k * k;      // κ_m≈0 (Rayleigh 특이점) 상대 임계
    let T = 0, R = 0;
    const orders = [];
    for (let m = -FLOQUET_M; m <= FLOQUET_M; m++) {
      const al = m * tpd;
      const kk = k * k - al * al;
      if (kk <= thr) continue;     // evanescent(|m|>d/λ) + κ≈0 특이점 제외
      const kappa = Math.sqrt(kk);
      const pref = 2 / (d_m * kappa);
      const sRe = pref * (-cIm);
      const sIm = pref * (cRe);
      let tRe = sRe, tIm = sIm;
      if (m === 0) tRe += 1;       // 0차에만 입사파 1
      const w = kappa / k;         // 진행방향 전력 가중
      const Tm = w * (tRe * tRe + tIm * tIm);
      T += Tm;
      R += w * (sRe * sRe + sIm * sIm);
      orders.push({ m: m, Tm: Tm });
    }
    return { T: T, R: R, orders: orders };
  }

  return { T_inf_grid: T_inf_grid };
});
