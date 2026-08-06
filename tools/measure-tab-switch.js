// 탭 전환 지연 구간 분해 계측 — 미결 (c) 규명에 쓴 스크립트 (2026-08-06)
//
// ⚠ 배포 대상이 아닙니다. compare/index.html 이 이 파일을 읽지 않으며, 읽어서도 안 됩니다.
//    비교 페이지의 동작에 전혀 관여하지 않는 **일회성 계측 도구**입니다.
//    쓰는 방법은 브라우저 콘솔에 이 파일 내용을 통째로 붙여넣는 것뿐입니다.
//
// ── 왜 이 파일이 있는가 ─────────────────────────────────────────────────
// 설계 §10-2 5-2 의 미결 (c)("탭 전환 중 표시가 역효과")를 규명할 때 쓴 계측입니다.
// 다음 세션이 같은 측정을 재현할 수 있도록 남깁니다. 결론은 설계 §10-2 5-2 에 있습니다.
//
// ── 쓰는 법 ────────────────────────────────────────────────────────────
//   1. Faraday/ 에서 `npx serve .` → http://localhost:3000/compare/ 를 연다
//   2. **브라우저 창을 앞으로 가져온다.** 이게 전부다 — 아래 참고를 보라
//   3. 콘솔에 이 파일을 붙여넣는다
//   4. `await TabSwitchMeasure.run()`        → 탭 전환 8회 구간 분해
//      `TabSwitchMeasure.throttleProbe()`    → 타이머 스로틀링 직접 관측 (백그라운드용)
//
// ── 참고: 반드시 표시 상태에서 재야 한다 ──────────────────────────────
// 숨은 탭에서는 rAF 가 아예 발화하지 않고 setTimeout 이 단계적으로 스로틀됩니다
// (1초 클램프 → 숨은 지 5분 후 1분 정렬). 실측: 250/1000/2000 ms 예약이 **한꺼번에
// ~67 초에** 발화. 그래서 숨은 탭 값은 상수배 보정으로 다룰 수 없습니다 (설계 §15-20).
// 자동화(CDP)로는 탭을 표시 상태로 만들 수 없었습니다 — 스크린샷은 숨은 탭에서도
// 찍히므로 표시 상태의 증거가 되지 못합니다. `document.visibilityState` 로 확인하십시오.
//
// ── 무엇을 재는가 ──────────────────────────────────────────────────────
//   ① 표시 갱신 : 클릭 → #tabBusy 가 켜질 때까지. setTabBusy() 의 DOM 쓰기 비용
//   ② 페인트 양보 : #tabBusy 켜짐 → yieldToPaint 콜백 진입까지
//   ③ 재계산   : yieldToPaint 콜백 진입 → 양쪽 iframe 작업이 끝날 때까지
//
// ③ 은 부모의 동기 구간이 아니다. broadcast() 는 postMessage(비동기)라 setTabBusy(false)
// 가 iframe 재계산 **전에** 꺼진다. 그래서 메인 스레드가 조용해질 때까지(400 ms 무활동)
// MessageChannel 틱으로 추적한다. 대기에 타이머를 쓰지 않는 이유는 설계 §10-2 5번과 같다.
(function () {
  "use strict";

  const origRAF = window.requestAnimationFrame.bind(window);
  const origST = window.setTimeout.bind(window);
  const marks = [];
  let recording = false;

  // yieldToPaint 가 rAF 와 setTimeout 중 어느 쪽으로 풀렸는지 알아야 한다.
  // 파일을 고치지 않고 알아내려면 전역 타이머를 감싸 발화 시각을 남기는 수밖에 없다.
  window.requestAnimationFrame = function (cb) {
    return origRAF(function (ts) {
      if (recording) marks.push({ k: "raf", t: performance.now() });
      return cb(ts);
    });
  };
  window.setTimeout = function (cb, ms) {
    const rest = Array.prototype.slice.call(arguments, 2);
    return origST(function () {
      if (recording) marks.push({ k: "t" + ms, t: performance.now() });
      return cb.apply(null, rest);
    }, ms);
  };

  const tick = () => new Promise(function (r) {
    const c = new MessageChannel();
    c.port1.onmessage = () => r(performance.now());
    c.port2.postMessage(0);
  });
  const gap = (ms) => new Promise((r) => origST(r, ms));
  const nextTab = () => (window.CompareProbe.state().activeTab === 0 ? 1 : 0);

  function once(toTab) {
    return new Promise(function (resolve) {
      marks.length = 0; recording = true;
      const busy = document.getElementById("tabBusy");
      const ev = [];
      let t0 = 0;
      const mo = new MutationObserver(function (recs) {
        for (let i = 0; i < recs.length; i++) ev.push(performance.now());
        if (ev.length < 2) return;          // [0] 표시 켜짐 · [1] 표시 꺼짐
        mo.disconnect(); recording = false;
        const before = marks.filter((m) => m.t < ev[1]);
        const last = before.length ? before[before.length - 1] : null;
        const workStart = last ? last.t : ev[0];
        (async function () {
          // 메인 스레드가 400 ms 조용해질 때까지 = 양쪽 iframe 작업 종료
          let prev = performance.now(), lastLong = workStart, longs = [];
          while (performance.now() - lastLong < 400 && performance.now() - t0 < 6000) {
            const now = await tick();
            const g = now - prev;
            if (g > 8) { lastLong = now; longs.push(+g.toFixed(0)); }
            prev = now;
          }
          resolve({
            탭: toTab, 표시상태: document.visibilityState,
            "①표시": +(ev[0] - t0).toFixed(1),
            "②양보": +(workStart - ev[0]).toFixed(1),
            "③재계산": +(lastLong - workStart).toFixed(1),
            총: +(lastLong - t0).toFixed(1),
            경로: last ? last.k : "(없음)",
            긴작업: longs.join("/"),
          });
        })();
      });
      mo.observe(busy, { attributes: true, attributeFilter: ["hidden"] });
      t0 = performance.now();
      document.querySelector('.tabBtn[data-tab="' + toTab + '"]').click();
    });
  }

  async function run(n) {
    n = n || 8;
    if (document.visibilityState !== "visible") {
      console.error("[계측] 표시 상태가 아닙니다 (visibilityState=" + document.visibilityState +
        "). 창을 앞으로 가져온 뒤 다시 부르십시오. 숨은 탭 값은 판정에 쓸 수 없습니다.");
      return null;
    }
    // 애니메이션을 멈춘다. 켜둔 채 재면 iframe 의 rAF 루프가 ③ 에 섞인다.
    if (document.getElementById("mPlay").textContent.indexOf("일시정지") !== -1)
      document.getElementById("mPlay").click();
    await gap(400);
    await once(nextTab()); await gap(600);      // 워밍업 1회 — 기록하지 않는다
    const rows = [];
    for (let i = 0; i < n; i++) {
      rows.push(await once(nextTab()));
      await gap(600);
    }
    console.table(rows);
    const col = (k) => rows.map((r) => r[k]).sort((x, y) => x - y);
    const stat = (k) => { const c = col(k); return { 최소: c[0], 중앙: c[c.length >> 1], 최대: c[c.length - 1] }; };
    console.log("① 표시 갱신", stat("①표시"), "\n② 페인트 양보", stat("②양보"), "\n③ 재계산", stat("③재계산"));
    console.log("탭 0(무한) ③:", rows.filter((r) => r.탭 === 0).map((r) => r["③재계산"]).join(" / "));
    console.log("탭 1(유한) ③:", rows.filter((r) => r.탭 === 1).map((r) => r["③재계산"]).join(" / "));
    return rows;
  }

  // 백그라운드 스로틀링을 직접 관측한다. 예약만 하고 즉시 돌아오므로, 숨긴 뒤
  // 한참 있다가 TabSwitchMeasure.throttleResult() 로 읽는다.
  function throttleProbe() {
    const s = window.__throttle = { t0: performance.now(), fired: [] };
    [0, 250, 1000, 2000].forEach(function (ms) {
      origST(function () { s.fired.push({ 예약: ms, 실제: +(performance.now() - s.t0).toFixed(0) }); }, ms);
    });
    origRAF(function () { s.fired.push({ 예약: "rAF", 실제: +(performance.now() - s.t0).toFixed(0) }); });
    console.log("[계측] 예약 완료. 탭을 숨긴 뒤 throttleResult() 로 읽으십시오.");
  }
  function throttleResult() {
    const s = window.__throttle;
    console.log("경과 " + (performance.now() - s.t0).toFixed(0) + " ms · visibilityState=" +
      document.visibilityState);
    console.table(s.fired);
    return s.fired;
  }

  window.TabSwitchMeasure = { run, once, throttleProbe, throttleResult };
  console.log("[계측] 설치 완료. `await TabSwitchMeasure.run()` 을 부르십시오. " +
    "현재 visibilityState=" + document.visibilityState);
})();
