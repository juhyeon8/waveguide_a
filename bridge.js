// 두 앱(원본 격자 모형 · 하위헌스 대조군)이 공유하는 부모↔iframe 다리.
// 기존 script.js 는 IIFE 라 내부 상태에 접근할 수 없으므로 DOM 이벤트로만 제어한다.
// 이 방식이면 script.js 를 0줄 수정한다.
//
// 프로토콜
//   부모 → iframe : { type:"setParams", lam_cm, a_mm, d_mm, N, tab, playing, phase_deg }
//                   { type:"requestState" }
//   iframe → 부모 : { type:"state", app:"grid"|"huygens", lam_cm, d_mm, a_mm, N, tab }
//
// T 는 보고하지 않는다. 비교 페이지의 하단 정량 패널이 iframe 값을 쓰지 않기 때문이다
// (설계 §8-2). 따라서 #infoBox 를 MutationObserver + 정규식으로 파싱하지 않는다.
(function () {
  "use strict";

  const APP = (document.currentScript && document.currentScript.dataset.app) || "grid";
  const SETTLE_MS = 120;   // 기존 script.js 의 60 ms 디바운스보다 넉넉하게

  function $(id) { return document.getElementById(id); }

  function fire(el, type) {
    if (!el) return;
    el.dispatchEvent(new Event(type, { bubbles: true }));
  }

  function setSlider(id, value) {
    const el = $(id);
    if (!el || value === undefined || value === null) return;
    el.value = String(value);
    fire(el, "input");
  }

  function currentTab() {
    const btns = document.querySelectorAll(".tabBtn");
    for (let i = 0; i < btns.length; i++) if (btns[i].classList.contains("active")) return i;
    return 0;
  }

  function setTab(tab) {
    if (tab === undefined || tab === null) return;
    const btn = document.querySelectorAll(".tabBtn")[tab];
    if (btn && !btn.classList.contains("active")) btn.click();
  }

  function applyParams(m) {
    // 순서가 중요하다: 탭 전환 → 탭별 슬라이더 → 공유 슬라이더 → 재생/위상
    setTab(m.tab);
    const t = (m.tab === undefined || m.tab === null) ? currentTab() : m.tab;
    if (t === 0) {
      setSlider("a0Slider", m.a_mm);
      setSlider("d0Slider", m.d_mm);
    } else {
      setSlider("a1Slider", m.a_mm);
      setSlider("d1Slider", m.d_mm);
      setSlider("n1Slider", m.N);
    }
    setSlider("lamSlider", m.lam_cm);

    // 편광은 매번 명시적으로 E∥ 로 고정한다 (기본값에 의존하지 않는다).
    // 하위헌스 앱에서는 disabled 라 click() 이 무시된다 — 편광 개념이 없기 때문이다.
    const par = $("polPar");
    if (par && !par.disabled && !par.classList.contains("active")) par.click();

    if (m.playing !== undefined && m.playing !== null) {
      const btn = $("playBtn");
      const nowPlaying = !!(btn && btn.textContent.indexOf("일시정지") !== -1);
      if (btn && nowPlaying !== m.playing) btn.click();
    }
    if (m.phase_deg !== undefined && m.phase_deg !== null) {
      setSlider("phaseSlider", m.phase_deg);
    }
  }

  function readState() {
    const t = currentTab();
    const a = $(t === 0 ? "a0Slider" : "a1Slider");
    const d = $(t === 0 ? "d0Slider" : "d1Slider");
    const n = $("n1Slider");
    const lam = $("lamSlider");
    return {
      type: "state", app: APP,
      lam_cm: lam ? parseFloat(lam.value) : null,
      d_mm: d ? parseFloat(d.value) : null,
      a_mm: a ? parseFloat(a.value) : null,
      N: (t === 1 && n) ? parseInt(n.value, 10) : null,
      tab: t,
    };
  }

  function reply(src, origin) {
    if (!src) return;
    src.postMessage(readState(), origin || "*");
  }

  window.addEventListener("message", function (ev) {
    const m = ev.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "setParams") {
      applyParams(m);
      // 기존 코드에 60 ms 디바운스가 있으므로 상태 회신 전 기다린다.
      setTimeout(function () { reply(ev.source, ev.origin); }, SETTLE_MS);
    } else if (m.type === "requestState") {
      reply(ev.source, ev.origin);
    }
  });

  // ?embed=1 : 패널을 숨겨 캔버스만 보이게 한다. CSS 파일은 건드리지 않는다.
  if (/[?&]embed=1(&|$)/.test(location.search)) {
    const st = document.createElement("style");
    st.textContent = "#panel { display:none !important; }";
    document.head.appendChild(st);
    // 기존 resize() 는 window.resize 로만 불린다. 이 줄이 없으면 캔버스 내부 해상도가
    // 패널이 있던 시절 크기로 남는다.
    window.dispatchEvent(new Event("resize"));
  }
})();
