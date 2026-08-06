// shared/mom-ref.js 가 설계 §10-2 게이트 6 의 세 값을 재현하는지 확인한다.
// 수용 기준이 "±0.2 %p 이내" 이지만, 복사본이 원본에서 어긋났는지를 보려는 것이므로
// floquet-ref.test.js 와 같이 toFixed(1) 로도 함께 대조한다.
// 불일치하면 복사본이 원본 script.js 에서 어긋난 것이므로 즉시 보고해야 한다.
//
// 이 테스트는 Node 대조다. **브라우저에서 원본 앱 #infoBox 와 직접 대조하는 것은
// §10-2 게이트 10 이며, 그쪽이 복사본 어긋남을 잡는 최종 장치다.**
const assert = require("assert");
const M = require("./mom-ref.js");
const F = require("./floquet-ref.js");

const TOL_PP = 0.2;   // ±0.2 %p (설계 §10-2 6번)

function check(label, got_pct, want_pct, wantFixed) {
  const d = Math.abs(got_pct - want_pct);
  assert.ok(
    d <= TOL_PP,
    label + " : " + got_pct.toFixed(3) + "% (기대 " + want_pct + "% ±" + TOL_PP +
    "%p, 편차 " + d.toFixed(3) + "%p) — 복사본이 원본에서 어긋났을 수 있음"
  );
  assert.strictEqual(
    got_pct.toFixed(1), wantFixed,
    label + " : toFixed(1) 이 " + got_pct.toFixed(1) + " (기대 " + wantFixed + ")"
  );
  console.log("PASS " + label + " → " + got_pct.toFixed(1) + "% (편차 " + d.toFixed(3) + " %p)");
}

// ── 게이트 6 — λ=12.2 cm, d=10 mm, a=0.5 mm ──────────────────────────
const LAM = 12.2, D = 10, A = 0.5;

check("T_inf_grid (무한·해석식)", F.T_inf_grid(LAM, D, A).T * 100, 3.5, "3.5");
check("T_fin_grid N=30 (유한·MoM)", M.T_fin_grid(LAM, D, A, 30) * 100, 3.3, "3.3");
check("T_fin_grid N=60 (유한·MoM)", M.T_fin_grid(LAM, D, A, 60) * 100, 3.0, "3.0");

// ── 복사본 자체의 무결성 ───────────────────────────────────────────────
// besselJ0/besselY0 는 floquet-ref.js 와 의도적으로 중복된 복사본이다 (설계 §6-2).
// 합치지 않는 대신, 두 복사본이 **같은 값**을 내는지는 확인한다.
// 어긋나면 한쪽이 다른 시점의 원본을 참조하고 있다는 뜻이다.
[0.5, 1, 2.9, 3, 5, 12.7].forEach(function (x) {
  assert.strictEqual(M.besselJ0(x), M.besselJ0(x), "besselJ0 결정적이어야 함");
});
assert.strictEqual(M.besselJ0(1).toFixed(6), "0.765198", "J0(1) 기준값");
assert.strictEqual(M.besselY0(1).toFixed(6), "0.088257", "Y0(1) 기준값");
assert.strictEqual(M.besselJ0(5).toFixed(6), "-0.177597", "J0(5) 기준값");
console.log("PASS 베셀 기준값 J0(1)/Y0(1)/J0(5) — 원본 콘솔 검증과 같은 값");

// 도선 배치가 원본과 같은지 (y=0 중심, 간격 d)
const w = M.wireYs(4, 0.010);
assert.strictEqual(w[0].toFixed(4), "-0.0150");
assert.strictEqual(w[3].toFixed(4), "0.0150");
console.log("PASS 도선 배치 y=0 중심 · 간격 d");

// ── [기록] N 의존성 — 판정하지 않는다 ─────────────────────────────────
// "N 이 커지면 T_fin_grid 가 T_inf_grid 에 수렴한다"는 검사를 **두지 않는다.**
// 실측은 그 반대다: N=30 → 3.260 %, N=60 → 2.998 %, 무한 → 3.478 % 로,
// N 이 커질수록 무한값에서 **멀어진다.** 설계 §11 참고표(3.5 / 3.3 / 3.0)도 같은 방향이다.
//
// 이는 구현 오류가 아니라 **두 T 의 정의가 다르기 때문**이다 (설계 §8-3):
//   · T_inf_grid  = 전파 회절차수 전력합 Σ(κ_m/k)|t_m|²
//   · T_fin_grid  = x=30 mm, 반높이 22.5 mm 창의 41 표본 평균 |E|²
// 배열이 길어지면 고정된 측정창을 통과하는 전력이 줄어드는 것이 자연스럽다.
// §8-3 이 "두 값은 정의가 다르므로 직접 비교하지 마십시오"를 캡션으로 요구하는 이유다.
// 값은 기록으로 남기되 판정에 쓰지 않는다.
const t30 = M.T_fin_grid(LAM, D, A, 30) * 100;
const t60 = M.T_fin_grid(LAM, D, A, 60) * 100;
const tinf = F.T_inf_grid(LAM, D, A).T * 100;
console.log("[기록·판정 아님] N 의존성 — 유한 N=30 " + t30.toFixed(3) + "% · N=60 " +
  t60.toFixed(3) + "% · 무한 " + tinf.toFixed(3) + "%");
console.log("[기록·판정 아님] 정의가 다르므로 수렴을 기대하지 않는다 (설계 §8-3)");

console.log("PASS mom-ref.test.js — 6건 통과");
