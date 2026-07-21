var assert = require("assert");
var h = require("./script.js");

// shownPairsFor: 논문 검증 3조건 — d=30mm·d=15mm 모두 N=5 그대로 나와야 한다
assert.strictEqual(h.shownPairsFor(5, 30), 5, "조건A(d=30mm,N=5) 좌측 5쌍이어야 함");
assert.strictEqual(h.shownPairsFor(5, 15), 5, "조건B/C(d=15mm,N=5) 좌측 5쌍이어야 함");
// 20 상한
assert.strictEqual(h.shownPairsFor(200, 3), 20, "N=200,d=3mm → 밴드에 20쌍 넘게 들어가도 상한 20");
// N이 상한보다 작으면 N 그대로
assert.strictEqual(h.shownPairsFor(3, 3), 3, "N=3 < 20이면 정확히 3쌍");

// buildFilename — 좌우 모두 항상 style 접미사 포함(2026-07-21 사용자 확정)
assert.strictEqual(
  h.buildFilename(60, 15, 1.00, 5, "left", "spiral", 2),
  "lam60_d15_L1p00_N5_left_spiral_x2.png"
);
assert.strictEqual(
  h.buildFilename(120, 3, 0.30, 200, "right", "B", 3),
  "lam120_d3_L0p30_N200_right_B_x3.png"
);

// needsLGuardConfirm: L < 5λ 일 때만 true
assert.strictEqual(h.needsLGuardConfirm(0.2, 0.06), true, "L=0.2m < 5*0.06m=0.3m → 경고 필요");
assert.strictEqual(h.needsLGuardConfirm(1.0, 0.06), false, "L=1.0m >= 0.3m → 경고 불필요");

console.log("PASS test-helpers.js — " + 8 + "건 통과");

// ==================== 게이트 4-3 / 4-4 (captureMode 라벨·그래픽 제거) ====================
var stub = require("./canvas-stub.js");

function freshState() {
  h.state.captureMode = false;
  h.state.lamMM = 60; h.state.dMM = 15; h.state.L = 1.00; h.state.N = 5;
  h.state.phasorStyle = "spiral";
}

function renderLeft(captureMode) {
  freshState();
  h.state.captureMode = captureMode;
  var cv = stub.createStubCanvas(620, 640);
  h.drawStep2Left(cv, 1);
  return cv._ctx;
}

function renderRight(captureMode) {
  freshState();
  h.state.captureMode = captureMode;
  var cv = stub.createStubCanvas(620, 640);
  h.drawStep2Right(cv, 1);
  return cv._ctx;
}

// --- 4-4: 그래픽 제거 확인 ---
var leftCap = renderLeft(true), leftNorm = renderLeft(false);
assert.strictEqual(
  stub.hasCall(leftCap, "moveTo", function (a) { return a[0] === 16 && a[1] === 76; }),
  false, "captureMode=true: 회색 '평면파 입사' 화살표가 그려지면 안 됨");
assert.strictEqual(
  stub.hasCall(leftNorm, "moveTo", function (a) { return a[0] === 16 && a[1] === 76; }),
  true, "captureMode=false: 회색 입사 화살표는 유지되어야 함(회귀 확인)");
assert.strictEqual(
  stub.hasCall(leftCap, "setLineDash", function (a) { return a[0] && a[0][0] === 3 && a[0][1] === 3; }),
  false, "captureMode=true: 빨간 P 안내 점선이 그려지면 안 됨");
assert.strictEqual(
  stub.hasCall(leftNorm, "setLineDash", function (a) { return a[0] && a[0][0] === 3 && a[0][1] === 3; }),
  true, "captureMode=false: 빨간 P 안내 점선은 유지되어야 함(회귀 확인)");
console.log("PASS 4-4 게이트(회색 입사 화살표·빨간 P 점선 제거 확인)");

// --- 4-3: 라벨 제거 완전성 ---
var ALLOWED = /^(-?[\d.]+(e[+-]?\d+)?|Re|Im|λ = \d+ mm)$/;
var capTexts = stub.fillTextCalls(leftCap).concat(stub.fillTextCalls(renderRight(true)));
capTexts.forEach(function (t) {
  assert.ok(ALLOWED.test(t), "captureMode=true에서 설명 라벨 누출: \"" + t + "\"");
});
assert.ok(capTexts.indexOf("Re") !== -1, "captureMode=true에서도 Re 라벨은 있어야 함");
assert.ok(capTexts.indexOf("Im") !== -1, "captureMode=true에서도 Im 라벨은 있어야 함");
assert.ok(capTexts.some(function (t) { return /^-?[\d.]+(e[+-]?\d+)?$/.test(t); }),
  "captureMode=true에서도 눈금 숫자는 있어야 함");
console.log("PASS 4-3 게이트(설명 라벨 완전 제거, 눈금/Re/Im 유지)");

// ==================== 버전 B(선분 화살촉) ====================
function renderRightWithStyle(style) {
  freshState();
  h.state.phasorStyle = style;
  var cv = stub.createStubCanvas(620, 640);
  h.drawStep2Right(cv, 1);
  return cv._ctx;
}
function lineToPoints(ctx) {
  // segment lineTo만 수집 (stroke() 바로 앞의 lineTo, 화살촉 lineTo는 제외)
  var points = [];
  for (var i = 0; i < ctx.calls.length; i++) {
    if (ctx.calls[i].name === "stroke") {
      for (var j = i - 1; j >= 0; j--) {
        if (ctx.calls[j].name === "lineTo") {
          points.push(ctx.calls[j].args);
          break;
        }
        if (ctx.calls[j].name === "beginPath") break;
      }
    }
  }
  return points;
}
function fillCount(ctx) {
  return ctx.calls.filter(function (c) { return c.name === "fill"; }).length;
}

var ctxSpiral = renderRightWithStyle("spiral");
var ctxB = renderRightWithStyle("B");
assert.deepStrictEqual(lineToPoints(ctxB), lineToPoints(ctxSpiral),
  "B 스타일도 spiral과 동일한 선분 좌표를 그려야 함(화살촉만 추가)");
assert.ok(fillCount(ctxB) > fillCount(ctxSpiral),
  "B 스타일은 화살촉(fill) 호출이 spiral보다 많아야 함");
console.log("PASS 버전 B(선분 화살촉): 좌표 동일·화살촉 fill 호출 증가 확인");
