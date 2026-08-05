// 비교 페이지 — Phase 2-1 (마스터 컨트롤바 전체 배선).
//
// 제어는 bridge.js 프로토콜(설계 §7)로만 한다:
//   부모 → iframe : { type:"setParams", lam_cm, a_mm, d_mm, N, tab, playing, phase_deg }
//   iframe → 부모 : { type:"state", app, lam_cm, d_mm, a_mm, N, tab }
// 원본 앱의 script.js 는 IIFE 라 내부 상태에 접근할 수 없다. DOM 이벤트로만 제어한다.
//
// 로컬 서버 전제다 (설계 §15-11). file:// 문서는 unique origin 이라 iframe 통신이 막힌다.
(function () {
  "use strict";

  const FRAMES = [
    { id: "left", app: "grid", label: "실제(격자)" },
    { id: "right", app: "huygens", label: "하위헌스" },
  ];

  // 원본·하위헌스 앱과 동일한 값 (설계 §5)
  const A_RATIO_MAX = 0.30;
  const D_MIN = [3, 1];        // 탭마다 간격 d 의 최솟값이 다르다

  function $(id) { return document.getElementById(id); }
  function frameEl(f) { return $(f.id); }

  // ── 상태 ────────────────────────────────────────────────────────────
  // 탭별 a·d·N 을 따로 든다. 원본·하위헌스 앱이 tabState[2] 구조를 쓰므로 마스터도
  // 같은 구조여야 한다 — 단일 a·d 만 들면 탭을 오갈 때 값이 뒤섞인다.
  const shared = { lam_cm: 12.2, amp: 1.0, playing: true, phase_deg: 0 };
  const tabState = [
    { d_mm: 10, a_mm: 0.5, N: 0 },    // 탭 0: 무한 (N 은 앱이 자동 결정, 표시 전용)
    { d_mm: 10, a_mm: 0.5, N: 30 },   // 탭 1: 유한
  ];
  // 탭은 마스터가 단일 소유한다. iframe 은 받기만 한다.
  let activeTab = 0;

  // ── 라벨 ────────────────────────────────────────────────────────────
  function aEffMm(a_mm, d_mm) { return Math.min(a_mm, A_RATIO_MAX * d_mm); }

  function syncLabels() {
    const ts = tabState[activeTab];
    const aMax = A_RATIO_MAX * ts.d_mm;
    const aEff = aEffMm(ts.a_mm, ts.d_mm);

    $("mA").max = Math.max(0.05, aMax).toFixed(2);
    $("mD").min = D_MIN[activeTab];
    $("mAVal").textContent = (ts.a_mm / 10).toFixed(3) + " cm" +
      (ts.a_mm > aMax + 1e-9 ? " →" + (aEff / 10).toFixed(3) : "");
    $("mDVal").textContent = (ts.d_mm / 10).toFixed(2) + " cm";
    $("mNVal").textContent = activeTab === 1 ? ts.N + " 개" : "자동";
    $("mLamVal").textContent = shared.lam_cm.toFixed(1) + " cm";
    $("mAmpVal").textContent = shared.amp.toFixed(2) + " V/m";
    $("mPhaseVal").textContent = shared.phase_deg + "°";

    $("rowN").hidden = activeTab !== 1;
    $("autoNNote").hidden = activeTab !== 0;
    $("rowPhase").classList.toggle("on", !shared.playing);
    $("mPlay").textContent = shared.playing ? "‖ 일시정지" : "▶ 재생";
  }

  // ── 부모 → iframe : 마스터 값을 양쪽에 동시 전파 ──────────────────
  // bridge.js 가 설계 §7 의 순서(탭 → 탭별 슬라이더 → 공유 슬라이더 → 재생/위상)로
  // 적용하므로, 여기서는 한 덩어리로 보내면 된다.
  function broadcast() {
    const ts = tabState[activeTab];
    const msg = {
      type: "setParams",
      tab: activeTab,
      a_mm: ts.a_mm,
      d_mm: ts.d_mm,
      N: activeTab === 1 ? ts.N : undefined,
      lam_cm: shared.lam_cm,
      playing: shared.playing,
      phase_deg: shared.phase_deg,
    };
    FRAMES.forEach(function (f) {
      const el = frameEl(f);
      if (el && el.contentWindow) el.contentWindow.postMessage(msg, "*");
    });
  }

  // 진폭은 bridge.js 프로토콜에 없다 (설계 §7). 렌더 전용이라 슬라이더를 직접 민다.
  function pushAmp() {
    FRAMES.forEach(function (f) {
      try {
        const d = frameEl(f).contentDocument;
        const el = d && d.getElementById("ampSlider");
        if (!el) return;
        el.value = String(shared.amp);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      } catch (e) { /* 교차출처면 무시 — 진단줄이 잡아낸다 */ }
    });
  }

  function apply() { syncLabels(); broadcast(); }

  // ── UI 바인딩 ───────────────────────────────────────────────────────
  document.querySelectorAll(".tabBtn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const t = parseInt(this.dataset.tab, 10);
      if (t === activeTab) return;
      activeTab = t;
      document.querySelectorAll(".tabBtn").forEach(function (b, i) {
        b.classList.toggle("active", i === t);
      });
      // 새 탭의 d 가 그 탭 최솟값보다 작으면 끌어올린다 (탭 0 은 d ≥ 3 mm).
      const ts = tabState[activeTab];
      if (ts.d_mm < D_MIN[activeTab]) ts.d_mm = D_MIN[activeTab];
      $("mA").value = String(ts.a_mm);
      $("mD").value = String(ts.d_mm);
      $("mN").value = String(ts.N || 30);
      apply();
    });
  });

  $("mA").addEventListener("input", function () {
    tabState[activeTab].a_mm = parseFloat(this.value); apply();
  });
  $("mD").addEventListener("input", function () {
    tabState[activeTab].d_mm = parseFloat(this.value); apply();
  });
  $("mN").addEventListener("input", function () {
    tabState[activeTab].N = parseInt(this.value, 10); apply();
  });
  $("mLam").addEventListener("input", function () {
    shared.lam_cm = parseFloat(this.value); apply();
  });
  $("mAmp").addEventListener("input", function () {
    shared.amp = parseFloat(this.value); syncLabels(); pushAmp();
  });
  $("mPlay").addEventListener("click", function () {
    shared.playing = !shared.playing; apply();
  });
  $("mPhase").addEventListener("input", function () {
    shared.phase_deg = parseInt(this.value, 10); syncLabels();
    if (!shared.playing) broadcast();
  });

  // ── 좌우 탭 일치 감시 ───────────────────────────────────────────────
  // 탭이 어긋나면 하단 [B] 블록의 표시 조건이 깨진다 (계획서 2-1). 조용히 넘어가지 않는다.
  //
  // 판정은 **iframe DOM 을 직접 읽어서** 한다. `state` 회신에 기대지 않는다 —
  // bridge.js 의 회신은 120 ms `setTimeout` 을 거치는데, 백그라운드 탭에서는 그 타이머가
  // 1초로 클램프되고 무거운 recompute() 뒤에 줄을 서므로 도착 시점이 믿을 수 없다.
  // 회신에만 의존하면 회신이 늦는 동안 불일치를 **놓친다** (조용한 구멍).
  // 같은 출처라 DOM 읽기는 동기적이고 타이머와 무관하다.
  const lastState = {};
  window.addEventListener("message", function (ev) {
    const m = ev.data;
    if (!m || m.type !== "state") return;
    lastState[m.app] = m;              // 기록용. 판정에는 쓰지 않는다.
  });

  function iframeTab(f) {
    try {
      const d = frameEl(f).contentDocument;
      const btns = d && d.querySelectorAll(".tabBtn");
      if (!btns || !btns.length) return null;
      for (let i = 0; i < btns.length; i++)
        if (btns[i].classList.contains("active")) return i;
      return null;
    } catch (e) { return null; }
  }

  function checkTabAgreement() {
    const bad = [];
    FRAMES.forEach(function (f) {
      const t = iframeTab(f);
      if (t !== null && t !== activeTab) bad.push(f.label + " 탭 " + t);
    });
    const el = $("tabWarn");
    if (bad.length) {
      const txt = "⚠ 좌우 앱의 탭이 마스터(" + activeTab + ")와 어긋났습니다 — " +
        bad.join(" · ") + ". 하단 정량 패널 [B] 의 표시 조건이 깨집니다.";
      el.textContent = txt; el.hidden = false;
      console.warn("[비교] " + txt);
      return false;
    }
    el.hidden = true;
    return true;
  }

  // ── 진단 (배선 확인용) ──────────────────────────────────────────────
  // 같은 출처이므로 부모가 iframe 문서를 직접 읽을 수 있다. 설계 §10-2 게이트 5 가
  // 보는 것과 같은 대상(표시값 텍스트)을 읽는다.
  function readText(f, id) {
    try {
      const d = frameEl(f).contentDocument;
      const v = d && d.getElementById(id);
      return v ? v.textContent.trim() : null;
    } catch (e) { return "(교차출처 차단: " + e.name + ")"; }
  }

  function readCanvas(f) {
    try {
      const d = frameEl(f).contentDocument;
      const c = d && d.getElementById("canvas");
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { cssW: Math.round(r.width), bufW: c.width, cssH: Math.round(r.height), bufH: c.height };
    } catch (e) { return null; }
  }

  // 게이트 5 가 보는 표시값 — 탭에 따라 어느 슬라이더 라벨이 살아 있는지가 다르다.
  function watchedIds() {
    return activeTab === 0
      ? ["lamVal", "a0Val", "d0Val"]
      : ["lamVal", "a1Val", "d1Val", "n1Val"];
  }

  function refreshProbe() {
    const ids = watchedIds();
    const lines = [];
    let ok = true;
    const rows = FRAMES.map(function (f) {
      const vals = ids.map(function (id) { return readText(f, id); });
      const cv = readCanvas(f);
      if (!cv || cv.bufW < cv.cssW) ok = false;
      return { f: f, vals: vals, cv: cv };
    });
    ids.forEach(function (id, i) {
      const a = rows[0].vals[i], b = rows[1].vals[i];
      if (a === null || a !== b) ok = false;
    });
    rows.forEach(function (r) {
      const cv = r.cv;
      lines.push(
        r.f.label.padEnd(10, " ") +
        ids.map(function (id, i) { return "#" + id + "=" + r.vals[i]; }).join("  ") +
        "   캔버스 " + (cv ? cv.cssW + "×" + cv.cssH + " · 내부 " + cv.bufW + "×" + cv.bufH +
          (cv.bufW >= cv.cssW ? " ✅" : " ❌") : "읽기 실패"));
    });
    const tabOk = checkTabAgreement();
    if (!tabOk) ok = false;
    lines.push("");
    lines.push("마스터 탭 " + activeTab +
      " · iframe 탭 " + FRAMES.map(iframeTab).join("/") + (tabOk ? " ✅" : " ❌") +
      " · λ " + shared.lam_cm.toFixed(1) + " cm · " +
      "양쪽 표시값 일치: " + (ok ? "예 ✅" : "아니오 ❌"));
    $("probe").textContent = lines.join("\n");
    $("probe").className = "note " + (ok ? "ok" : "bad");
    return ok;
  }

  // ── 시작 ────────────────────────────────────────────────────────────
  let pending = FRAMES.length;
  FRAMES.forEach(function (f) {
    frameEl(f).addEventListener("load", function () {
      if (--pending === 0) { apply(); pushAmp(); setTimeout(refreshProbe, 250); }
    });
  });

  syncLabels();
  window.addEventListener("resize", function () { setTimeout(refreshProbe, 250); });

  // 게이트 5·6·7 확인을 콘솔/자동화에서 직접 부를 수 있게 노출한다.
  window.CompareProbe = {
    refresh: refreshProbe,
    broadcast: broadcast,
    watchedIds: watchedIds,
    iframeTabs: function () { return FRAMES.map(iframeTab); },
    checkTabAgreement: checkTabAgreement,
    state: function () {
      return { activeTab: activeTab, shared: shared, tabState: tabState, lastState: lastState };
    },
  };
})();
