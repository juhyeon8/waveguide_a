var assert = require("assert");
var h = require("./script.js");

// shownPairsFor: 논문 검증 3조건 — d=30mm·d=15mm 모두 N=5 그대로 나와야 한다
assert.strictEqual(h.shownPairsFor(5, 30), 5, "조건A(d=30mm,N=5) 좌측 5쌍이어야 함");
assert.strictEqual(h.shownPairsFor(5, 15), 5, "조건B/C(d=15mm,N=5) 좌측 5쌍이어야 함");
// 20 상한
assert.strictEqual(h.shownPairsFor(200, 3), 20, "N=200,d=3mm → 밴드에 20쌍 넘게 들어가도 상한 20");
// N이 상한보다 작으면 N 그대로
assert.strictEqual(h.shownPairsFor(3, 3), 3, "N=3 < 20이면 정확히 3쌍");

// buildFilename
assert.strictEqual(
  h.buildFilename(60, 15, 1.00, 5, "left", 2),
  "lam60_d15_L1p00_N5_left_x2.png"
);
assert.strictEqual(
  h.buildFilename(120, 3, 0.30, 200, "right", 3),
  "lam120_d3_L0p30_N200_right_x3.png"
);

// needsLGuardConfirm: L < 5λ 일 때만 true
assert.strictEqual(h.needsLGuardConfirm(0.2, 0.06), true, "L=0.2m < 5*0.06m=0.3m → 경고 필요");
assert.strictEqual(h.needsLGuardConfirm(1.0, 0.06), false, "L=1.0m >= 0.3m → 경고 불필요");

console.log("PASS test-helpers.js — " + 7 + "건 통과");
