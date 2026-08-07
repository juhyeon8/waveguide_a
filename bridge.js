// 이 파일은 두 역할을 겸한다. 실행 시점에 프레임을 보고 둘 중 하나만 수행한다.
//   1) iframe 안일 때  — 비교 페이지(부모)와 앱 사이의 다리. postMessage 로 슬라이더·탭을
//                        조작하고 상태를 회신한다. `?embed=1` 이면 패널도 숨긴다.
//   2) 최상위 프레임일 때 — 원본 앱 패널에 비교 페이지로 가는 버튼 한 개만 삽입한다.
//                        다리 쪽 동작(리스너·패널 숨김)은 일절 하지 않는다.
//
// **파일을 나누지 않는다.** 2)를 별도 파일로 두면 index.html 에 <script> 태그를 하나 더
// 넣어야 하는데, 설계 §2-1 이 허용하는 원본 수정은 bridge.js 태그 **한 줄**뿐이다.
// bridge.js 는 이미 실려 있으므로 여기에 얹는 것이 원본 무수정 원칙을 지키는 유일한 길이다.
// (이름이 역할과 어긋나게 된 것은 그 대가다.)
//
// 두 경로는 아래 setupBridge() / setupCompareLaunch() 로 완전히 분리되어 있고
// 서로의 코드를 호출하지 않는다.
//
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

  // data-app 은 이 <script> 가 실행되는 동안에만 읽을 수 있으므로 먼저 잡아 둔다.
  const APP = (document.currentScript && document.currentScript.dataset.app) || "grid";
  const SETTLE_MS = 120;   // 기존 script.js 의 60 ms 디바운스보다 넉넉하게

  // ── 진입점 ──────────────────────────────────────────────────────────────
  // 프레임에 따라 두 역할 중 **정확히 하나만** 실행한다.
  // 최상위 프레임에서 다리 코드(리스너·패널 숨김)가 도는 일도, iframe 안에서
  // 비교 버튼이 삽입되는 일도 없다. 비교 페이지 좌측 iframe 에 버튼이 뜨지 않는 근거다.
  if (window.top === window) {
    setupCompareLaunch();   // 역할 2 — 원본 앱 단독 로드
  } else {
    setupBridge();          // 역할 1 — 비교 페이지 안의 iframe
  }

  // 두 역할이 공유하는 것은 이 한 줄짜리 도우미뿐이다.
  function $(id) { return document.getElementById(id); }

  // ══════════════════════════════════════════════════════════════════════
  // 역할 1 — 부모↔iframe 다리. iframe 안에서만 호출된다.
  // ══════════════════════════════════════════════════════════════════════
  function setupBridge() {
    window.addEventListener("message", onMessage);

    // ?embed=1 : 패널을 숨겨 캔버스만 보이게 한다. CSS 파일은 건드리지 않는다.
    if (/[?&]embed=1(&|$)/.test(location.search)) {
      const st = document.createElement("style");
      st.textContent = "#panel { display:none !important; }";
      document.head.appendChild(st);
      // 기존 resize() 는 window.resize 로만 불린다. 이 줄이 없으면 캔버스 내부 해상도가
      // 패널이 있던 시절 크기로 남는다.
      window.dispatchEvent(new Event("resize"));
    }
  }

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

  function onMessage(ev) {
    const m = ev.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "setParams") {
      applyParams(m);
      // 기존 코드에 60 ms 디바운스가 있으므로 상태 회신 전 기다린다.
      setTimeout(function () { reply(ev.source, ev.origin); }, SETTLE_MS);
    } else if (m.type === "requestState") {
      reply(ev.source, ev.origin);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 역할 2 — 비교 페이지 열기 버튼. 최상위 프레임에서만 호출된다.
  //
  // #mechanismWrap **바로 아래**(형제)에 노드를 정확히 하나 넣는다. 안에 넣으면
  // script.js 의 syncMechanismVisibility() 가 유한 배열 탭에서 통째로 숨긴다.
  // 스타일은 style.css 를 고치지 않고 <head> 에 주입한다 (설계 §2-1).
  // ══════════════════════════════════════════════════════════════════════
  function setupCompareLaunch() {
    // DOM 이 아직 없으면 기다린다. 원본 index.html 은 </body> 직전에 이 파일을 싣지만
    // huygens/index.html 은 맨 앞에 싣는다 (설계 §15-17).
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", insertCompareLaunch);
    } else {
      insertCompareLaunch();
    }
  }

  function insertCompareLaunch() {
    // 원본 격자 모형 앱에만 넣는다. 다른 앱(huygens 등)에는 이 앵커가 없고,
    // 상대 경로 "compare/" 도 그쪽에서는 맞지 않는다.
    const anchor = $("mechanismWrap");
    if (!anchor || !anchor.parentNode) return;

    const style = document.createElement("style");
    style.textContent = compareLaunchCss();
    document.head.appendChild(style);

    // file:// 은 unique origin 이라 비교 페이지의 iframe 통신이 막힌다 (설계 §15-11).
    // 열리지 않을 버튼을 보여 주지 않고, 같은 자리에 안내 문구만 남긴다.
    const local = location.protocol === "file:";
    const el = local ? document.createElement("p") : document.createElement("a");
    if (local) {
      el.className = "compareNote";
      el.textContent = "비교 페이지는 로컬 서버에서만 동작합니다";
    } else {
      el.className = "mechBtn compareBtn";
      // 디렉터리 URL 이어야 한다. serve 의 clean-URL 301 이 쿼리를 버린다 (설계 §15-18).
      el.href = "compare/";
      // 새 창이냐 새 탭이냐는 브라우저에 맡긴다. window.open 으로 크기를 지정하면
      // 화면 해상도에 따라 잘린다.
      el.target = "_blank";
      el.rel = "noopener";
      el.innerHTML = "도선 격자 모형과 하위헌스-프레넬 모형의 비교 <span class=\"arrow\">↗</span>";
    }
    anchor.parentNode.insertBefore(el, anchor.nextSibling);
  }

  // 기존 .mechBtn 의 크기·위치 감각은 그대로 두고 **채움만 뺀다**(테두리형).
  // 채움 = 이 패널의 주 동작(메커니즘 보기), 테두리 = 부차 동작(다른 페이지로 나감)이라는
  // 위계가 드러나고, 새 색을 들이지 않아 앱의 2색 팔레트(accent + 회색)도 유지된다.
  // 채움 유무는 색각과 무관하게 구별되므로 색에만 기대지 않는다.
  // 함수 선언으로 둔다 — 위 진입점이 파일 앞머리에서 곧바로 삽입을 실행할 수도 있어,
  // const 로 두면 아직 초기화 전(TDZ)이 될 수 있다.
  function compareLaunchCss() { return [
    ".compareBtn {",
    "  color: var(--accent);",
    "  background: #fff;",
    "  border: 1px solid var(--accent);",
    "  text-decoration: none;",
    "  margin-top: 4px;",
    "}",
    ".compareBtn:hover  { background: #eef3fe; }",
    ".compareNote {",
    "  font-size: 11px; color: var(--muted); line-height: 1.6;",
    "  margin: 10px 0 4px;",
    "}",
  ].join("\n"); }
})();
