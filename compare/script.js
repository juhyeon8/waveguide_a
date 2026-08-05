// 비교 페이지 — Phase 2-0 (배선 확인) 골격.
//
// 이 단계에서 확인하려는 것은 물리가 아니라 iframe 동기화다 (설계 §8-2).
// 그래서 마스터 컨트롤은 λ 하나만 배선하고, 하단 정량 패널·T(λ) 곡선·CSV 는 만들지 않는다.
//
// 제어는 bridge.js 프로토콜(설계 §7)로만 한다:
//   부모 → iframe : { type:"setParams", lam_cm, ... }
//   iframe → 부모 : { type:"state", app, lam_cm, ... }
// 원본 앱의 script.js 는 IIFE 라 내부 상태에 접근할 수 없다. DOM 이벤트로만 제어한다.
//
// 로컬 서버 전제다 (설계 §15-11). file:// 문서는 unique origin 이라 iframe 통신이 막힌다.
(function () {
  "use strict";

  const FRAMES = [
    { id: "left", app: "grid", label: "실제(격자)" },
    { id: "right", app: "huygens", label: "하위헌스" },
  ];

  function $(id) { return document.getElementById(id); }

  const master = $("mLam");
  const masterVal = $("mLamVal");
  const probe = $("probe");

  function frameEl(f) { return $(f.id); }

  // ── 부모 → iframe : 마스터 값을 양쪽에 동시 전파 ──────────────────
  function broadcast() {
    const lam_cm = parseFloat(master.value);
    masterVal.textContent = lam_cm.toFixed(1) + " cm";
    FRAMES.forEach(function (f) {
      const el = frameEl(f);
      if (el && el.contentWindow) {
        el.contentWindow.postMessage({ type: "setParams", lam_cm: lam_cm }, "*");
      }
    });
  }

  master.addEventListener("input", broadcast);

  // ── 진단 (Phase 2-0 전용) ─────────────────────────────────────────
  // 같은 출처이므로 부모가 iframe 문서를 직접 읽을 수 있다. 설계 §10-2 게이트 5 가
  // 보는 것과 같은 대상(#lamVal 텍스트)을 읽는다.
  function readLamVal(f) {
    const el = frameEl(f);
    try {
      const d = el && el.contentDocument;
      const v = d && d.getElementById("lamVal");
      return v ? v.textContent.trim() : null;
    } catch (e) {
      return "(교차출처 차단: " + e.name + ")";
    }
  }

  // 캔버스가 패널 숨김 뒤 resize 를 반영했는지. 반영되지 않으면 내부 해상도가
  // 패널이 있던 시절(좁은) 폭으로 남는다 (설계 §7 의 embed 주의).
  function readCanvas(f) {
    const el = frameEl(f);
    try {
      const d = el && el.contentDocument;
      const c = d && d.getElementById("canvas");
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { cssW: Math.round(r.width), cssH: Math.round(r.height), bufW: c.width, bufH: c.height };
    } catch (e) {
      return null;
    }
  }

  function refreshProbe() {
    const lines = [];
    let ok = true;
    const vals = [];
    FRAMES.forEach(function (f) {
      const lam = readLamVal(f);
      const cv = readCanvas(f);
      vals.push(lam);
      const res = cv
        ? "캔버스 CSS " + cv.cssW + "×" + cv.cssH + " · 내부 " + cv.bufW + "×" + cv.bufH +
          (cv.bufW >= cv.cssW ? "  ✅" : "  ❌ 내부 해상도가 CSS 폭보다 작음")
        : "캔버스 읽기 실패";
      if (!cv || cv.bufW < cv.cssW) ok = false;
      lines.push(f.label.padEnd(10, " ") + " #lamVal=" + (lam === null ? "(없음)" : lam) +
        "   " + res);
    });
    const same = vals[0] !== null && vals[0] === vals[1];
    if (!same) ok = false;
    lines.push("");
    lines.push("마스터 λ = " + parseFloat(master.value).toFixed(1) + " cm" +
      "   ·   양쪽 #lamVal 일치: " + (same ? "예 ✅" : "아니오 ❌"));
    probe.textContent = lines.join("\n");
    probe.className = "note " + (ok ? "ok" : "bad");
    return ok && same;
  }

  // 부모가 받는 state 회신은 지금 쓰지 않지만, 프로토콜이 살아 있는지 콘솔에 남긴다.
  window.addEventListener("message", function (ev) {
    const m = ev.data;
    if (m && m.type === "state") {
      console.log("[비교] state 회신 ←", m.app, "λ =", m.lam_cm, "cm");
    }
  });

  // ── 시작 ──────────────────────────────────────────────────────────
  // 두 iframe 이 모두 로드된 뒤에 초기값을 밀어 넣는다.
  let pending = FRAMES.length;
  FRAMES.forEach(function (f) {
    frameEl(f).addEventListener("load", function () {
      if (--pending === 0) {
        broadcast();
        // bridge.js 의 120 ms 대기(설계 §7)보다 넉넉히 준 뒤 읽는다.
        setTimeout(refreshProbe, 250);
      }
    });
  });

  // 슬라이더 조작 뒤에도 진단줄을 갱신한다.
  master.addEventListener("input", function () { setTimeout(refreshProbe, 250); });

  // 창 크기가 바뀌면 iframe 안 캔버스도 다시 잡히는지 보기 위해 갱신한다.
  window.addEventListener("resize", function () { setTimeout(refreshProbe, 250); });

  // 게이트 5·캔버스 확인을 콘솔/자동화에서 직접 부를 수 있게 노출한다.
  window.CompareProbe = { refresh: refreshProbe, broadcast: broadcast };
})();
