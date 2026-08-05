// shared/floquet-ref.js 가 설계 문서 §11 표의 T(실제, Floquet) 를 재현하는지 확인한다.
// 설계 §10-2 4번의 수용 기준이 "소수점 1자리까지 일치" 이므로 toFixed(1) 로 비교한다.
// 불일치하면 복사본이 원본 script.js 에서 어긋난 것이므로 즉시 보고해야 한다.
const assert = require("assert");
const R = require("./floquet-ref.js");

// [λ cm, d mm, a mm, 기대 T %]
const TABLE11 = [
  [12.2, 10, 0.5, "3.5"], [25, 10, 0.5, "0.8"], [5, 10, 0.5, "18.2"], [2, 10, 0.5, "64.2"],
  [12.2, 10, 3, "1.6"], [12.2, 30, 1, "38.2"], [1, 30, 1, "83.3"], [12.2, 3, 0.5, "0.0"],
];

TABLE11.forEach(function (c) {
  const got = R.T_inf_grid(c[0], c[1], c[2]).T * 100;
  assert.strictEqual(
    got.toFixed(1), c[3],
    "λ=" + c[0] + "cm d=" + c[1] + "mm a=" + c[2] + "mm : " +
    got.toFixed(3) + "% (기대 " + c[3] + "%) — 복사본이 원본에서 어긋났을 수 있음"
  );
  console.log("PASS λ=" + c[0] + "cm d=" + c[1] + "mm a=" + c[2] + "mm → T=" + got.toFixed(1) + "%");
});

// λ=1cm d=30mm 는 d/λ=3.000 이라 m=±3 이 κ=0 으로 제외되어 전파차수가 5개여야 한다.
assert.strictEqual(R.T_inf_grid(1, 30, 1).orders.length, 5, "전파차수는 5개여야 함");
console.log("PASS 전파차수 5개 (m=±3 은 κ=0 제외)");

console.log("PASS floquet-ref.test.js — " + (TABLE11.length + 1) + "건 통과");
