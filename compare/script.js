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

  // ── 하단 정량 패널 (설계 §8-3) ──────────────────────────────────────
  // iframe 통신에 의존하지 않고 직접 계산한다 (§8-2). 그래서 동기화가 실패해도
  // 정량 결과는 살아남는다.
  //   T_inf_grid      ← shared/floquet-ref.js
  //   T_fin_grid      ← shared/mom-ref.js   (원본 script.js 의 MoM 복사본, §6-2)
  //   T_inf/fin_huygens ← huygens/physics.js
  const REF = window.FloquetRef;
  const MOM = window.MomRef;
  const HP = window.HuygensPhysics;

  function pct(x) { return (x * 100).toFixed(1) + " %"; }
  function ratio(a, b) { return b > 0 ? (a / b).toFixed(2) + " 배" : "—"; }

  function updateQuant() {
    const ts = tabState[activeTab];
    const lam = shared.lam_cm, d = ts.d_mm, a = ts.a_mm;

    // [A] 무한 주기 격자 — 탭과 무관하게 항상 표시
    const ag = REF.T_inf_grid(lam, d, a).T;
    const ah = HP.T_inf_huygens(lam, d, a).T;
    $("aGrid").textContent = pct(ag);
    $("aHuy").textContent = pct(ah);
    $("aRatio").textContent = ratio(ah, ag);

    // [B] 유한 배열 — 유한 배열 탭일 때만. 마스터 N 을 쓴다.
    const showB = activeTab === 1;
    $("blockB").hidden = !showB;
    $("blockBHidden").hidden = showB;
    if (!showB) return;

    const N = ts.N;
    const bg = MOM.T_fin_grid(lam, d, a, N);
    const bh = HP.T_fin_huygens(lam, d, a, N);
    $("bGrid").textContent = pct(bg);
    $("bHuy").textContent = pct(bh);
    $("bRatio").textContent = ratio(bh, bg);
    // 게이트 7 — λ > d 구간에서 T_fin_huygens 가 T_inf_huygens 와 10 %p 이내여야 한다.
    // 판정값만 남기지 않고 실제 편차도 함께 기록한다.
    const dev = Math.abs(bh - ah) * 100;
    const lamGtD = (lam / 10) > (d / 10);
    $("bNote").textContent =
      "N = " + N + " · 도선당 적분 표본 " + HP.T_NS_FIXED + " 고정 (화면 렌더와 별개)" +
      (lamGtD ? " · [기록] |T_유한 − T_무한|(하위헌스) = " + dev.toFixed(2) + " %p" : "");
  }

  // ── T(λ) 곡선 (설계 §8-4 · 그리기 규칙 §8-4-1) ─────────────────────
  // 하단 정량 패널과 같이 iframe 통신에 의존하지 않고 직접 계산한다 (§8-2).

  // 논문 그림 캡처 모드. DRAW_BAND_TITLES 와 같은 방식이다 (§8-4-1 (6), §15-16).
  let LEGEND_IN_CANVAS = false;
  const Y_MAX_PCT = 120;        // y 상한 고정 (§8-4-1 (2))
  const FIN_DEBOUNCE_MS = 250;  // 유한 곡선 전용 디바운스 (§8-4-2)

  const LAM_INF = [];   // 0.1 cm 간격 · 291점 — 해석식이라 즉시
  for (let i = 0; i < 291; i++) LAM_INF.push(+(1 + i * 0.1).toFixed(1));
  const LAM_FIN = [];   // 0.5 cm 간격 · 59점 — 수치
  for (let i = 0; i < 59; i++) LAM_FIN.push(+(1 + i * 0.5).toFixed(1));

  // 색은 모형으로, 선 종류는 무한/유한으로 가른다. 점선 틈을 넓게 잡아 아래 실선이
  // 보이게 한다 — λ>d 에서 두 하위헌스 곡선은 겹친다 (게이트 7 최대 편차 1.4 %p).
  const CV = {
    infGrid: { color: "#12508f", dash: [],     w: 2.2, label: "무한·실제 (Floquet)" },
    infHuy:  { color: "#b3400e", dash: [],     w: 2.2, label: "무한·하위헌스" },
    finGrid: { color: "#5b9de8", dash: [7, 5], w: 2.6, label: "유한·실제 (MoM)" },
    finHuy:  { color: "#f0a15e", dash: [7, 5], w: 2.6, label: "유한·하위헌스 (RS)" },
  };
  const CV_ORDER = ["infGrid", "infHuy", "finGrid", "finHuy"];
  const CM = { l: 78, r: 18, t: 20, b: 62 };

  // gap 판정 — **무한·실제(Floquet) 곡선에만.** 무손실 격자의 전력 투과율은 1 을 넘을 수
  // 없다. λ<d 의 다중 전파차수 구간에서 floquetZ 의 1/κ 가 커져 T>1 이 나오는데 물리가
  // 아니라 수치 인공물이다. 값은 버리지 않는다 (CSV 원값·화면 진단).
  //
  // **유한 곡선에는 적용하지 않는다.** 유한 T 는 전력 유속이 아니라 측정창 평균 |E|²
  // 이므로 간섭으로 1 을 넘는 것이 물리다 (§8-3 의 정의 분리).
  const GAP_KEY = "infGrid";
  function isGap(p) { return p.T > 1; }

  // 유한 곡선이 쓰는 N — §8-4 의 "마스터 컨트롤바의 현재 N 값".
  // 언제나 tabState[1].N 이다. 탭 0 의 N 은 0(앱이 자동 결정, 표시 전용)이라 쓸 수 없고,
  // 마스터 N 슬라이더가 실제로 들고 있는 값이 탭 1 의 값이기 때문이다. 탭 0 에서도
  // 유한 곡선을 그리므로 (곡선은 탭과 무관하다) 이 값이 필요하다.
  function curveN() { return tabState[1].N; }

  // d/λ 가 정수인 λ (스캔 범위 안). Rayleigh 파장.
  function rayleighLams(d_mm) {
    const out = [];
    for (let n = 1; n <= 60; n++) {
      const lam = (d_mm / 10) / n;
      if (lam >= 1 && lam <= 30) out.push({ n: n, lam: lam });
    }
    return out;
  }

  const curve = { d: null, a: null, N: null, inf: null, fin: null, rec: "" };
  let finToken = { cancelled: false };
  let finTimer = 0;

  function computeInfinite(d, a) {
    const infGrid = LAM_INF.map(function (lam) {
      const r = REF.T_inf_grid(lam, d, a);
      return { lam: lam, T: r.T, R: r.R, TR: r.T + r.R };
    });
    const infHuy = LAM_INF.map((lam) => ({ lam: lam, T: HP.T_inf_huygens(lam, d, a).T }));
    // [기록] T+R 이탈. **판정이 아니고 임계를 두지 않는다.** Rayleigh 지표가 아니라
    // floquetZ 임피던스 시트 근사의 충실도 지표다 (설계 §14-7-1).
    let mx = 0, mxLam = 0, lo5 = Infinity, hi5 = 0;
    for (const p of infGrid) {
      const dev = Math.abs(p.TR - 1);
      if (dev > mx) { mx = dev; mxLam = p.lam; }
      if (p.lam >= 5) { lo5 = Math.min(lo5, dev); hi5 = Math.max(hi5, dev); }
    }
    return { infGrid: infGrid, infHuy: infHuy, gapped: infGrid.filter(isGap),
             tr: { max: mx, maxLam: mxLam, lo5: lo5, hi5: hi5 } };
  }

  // 표시가 실제로 그려지도록 페인트를 한 번 양보한다. rAF 는 백그라운드 탭에서 멈추므로
  // setTimeout 대비를 함께 건다 — yieldToPaint 와 같은 이유다 (설계 §10-2 5-2).
  function yieldPaint() {
    return new Promise(function (r) {
      let done = false;
      const run = () => { if (!done) { done = true; r(); } };
      requestAnimationFrame(function () { requestAnimationFrame(run); });
      setTimeout(run, 250);
    });
  }

  // 최악 545 ms 다 (§9-4). 16 ms 마다 페인트를 양보해 진행 표시가 갱신되게 하고,
  // 청크 경계마다 취소 토큰을 확인해 폐기된 계산의 결과를 화면에 쓰지 않는다 (§8-4-2).
  async function computeFinite(d, a, N, token) {
    const finGrid = [], finHuy = [];
    let slice = performance.now();
    for (let i = 0; i < LAM_FIN.length; i++) {
      if (token.cancelled) return null;
      const lam = LAM_FIN[i];
      finGrid.push({ lam: lam, T: MOM.T_fin_grid(lam, d, a, N) });
      finHuy.push({ lam: lam, T: HP.T_fin_huygens(lam, d, a, N) });
      if (performance.now() - slice > 16) {
        $("curveBar").style.width = ((i + 1) / LAM_FIN.length * 100).toFixed(0) + "%";
        $("curvePct").textContent = (i + 1) + " / " + LAM_FIN.length;
        await yieldPaint();
        slice = performance.now();
        if (token.cancelled) return null;
      }
    }
    return { finGrid: finGrid, finHuy: finHuy, N: N };
  }

  function finBusy() { return finTimer !== 0 || curve.fin === null; }

  function scheduleFinite(d, a, N) {
    clearTimeout(finTimer);
    finToken.cancelled = true;            // 진행 중이던 계산을 버린다
    curve.fin = null;                     // 낡은 곡선을 화면에 남기지 않는다
    $("curveProg").hidden = true;
    finTimer = setTimeout(async function () {
      finTimer = 0;
      const my = finToken = { cancelled: false };
      $("curveProg").hidden = false;
      $("curveBar").style.width = "0%";
      $("curvePct").textContent = "0 / " + LAM_FIN.length;
      await yieldPaint();
      const r = await computeFinite(d, a, N, my);
      if (my.cancelled || !r) return;     // 폐기된 계산의 결과는 쓰지 않는다
      curve.fin = r;                      // 이 시점부터 finBusy() 가 false 가 된다
      $("curveProg").hidden = true;
      drawCurve();
      renderCurveLegend();
    }, FIN_DEBOUNCE_MS);
  }

  function drawCurve() {
    const cv = $("curve");
    if (!cv || !curve.inf) return;
    const dpr = window.devicePixelRatio || 1;
    // 범례를 캔버스에 넣을 때는 캔버스를 아래로 늘려 축 밑에 띠를 만든다.
    // 플롯 영역은 두 모드에서 완전히 같다 — 곡선이 범례에 가려지지 않는다 (§8-4-1 (6)).
    const PLOT_H = 430;
    const legendH = LEGEND_IN_CANVAS ? 128 : 0;
    const W = cv.clientWidth, H = PLOT_H + legendH;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.height = H + "px";
    const g = cv.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);

    const x0 = CM.l, x1 = W - CM.r, y0 = CM.t, y1 = PLOT_H - CM.b;
    // Y_MAX_PCT 는 **퍼센트**, 곡선 T 는 **분수**다. py 에서 단위를 맞춘다.
    const px = (lam) => x0 + (lam - 1) / 29 * (x1 - x0);
    const py = (T) => y1 - (T * 100 / Y_MAX_PCT) * (y1 - y0);

    // 현재 λ 세로 표시선 — **곡선보다 먼저** 그린다. 위에 그리면 곡선을 가린다.
    const mx = px(shared.lam_cm);
    g.save();
    g.strokeStyle = "#b9c2cc"; g.lineWidth = 1; g.setLineDash([4, 3]);
    g.beginPath(); g.moveTo(mx, y0); g.lineTo(mx, y1); g.stroke();
    g.restore();

    g.save();
    g.strokeStyle = "#e8ecf1"; g.lineWidth = 1;
    g.fillStyle = "#6b6b72"; g.font = "12px 'Malgun Gothic', sans-serif";
    for (let t = 0; t <= Y_MAX_PCT + 1e-9; t += 20) {
      const y = py(t / 100);
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      g.textAlign = "right"; g.textBaseline = "middle";
      g.fillText(t + " %", x0 - 8, y);
    }
    g.textAlign = "center"; g.textBaseline = "top";
    for (const lam of [1, 5, 10, 15, 20, 25, 30]) {
      const x = px(lam);
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke();
      g.fillText(String(lam), x, y1 + 7);
    }
    g.strokeStyle = "#9aa5b1"; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y1); g.lineTo(x1, y1); g.stroke();
    g.restore();

    // d/λ 정수 눈금 (Rayleigh 파장) — 축 아래 ▾ 와 정수값
    g.save();
    g.fillStyle = "#8a6a2a"; g.font = "11px 'Malgun Gothic', sans-serif";
    g.textAlign = "center"; g.textBaseline = "top";
    rayleighLams(curve.d).forEach(function (r) {
      const x = px(r.lam);
      g.beginPath(); g.moveTo(x - 4, y1 + 20); g.lineTo(x + 4, y1 + 20); g.lineTo(x, y1 + 26);
      g.closePath(); g.fill();
      g.fillText(String(r.n), x, y1 + 27);
    });
    g.restore();

    g.save();
    g.fillStyle = "#10193a"; g.font = "13px 'Malgun Gothic', sans-serif";
    g.textAlign = "center"; g.textBaseline = "top";
    g.fillText("파장 λ [cm]", (x0 + x1) / 2, y1 + 42);
    g.translate(16, (y0 + y1) / 2); g.rotate(-Math.PI / 2);
    g.fillText("투과율 T [%]", 0, 0);
    g.restore();

    const data = {
      infGrid: curve.inf.infGrid, infHuy: curve.inf.infHuy,
      finGrid: curve.fin && curve.fin.finGrid, finHuy: curve.fin && curve.fin.finHuy,
    };
    for (const key of CV_ORDER) {
      const pts = data[key];
      if (!pts || !pts.length) continue;
      const s = CV[key];
      g.save();
      g.strokeStyle = s.color; g.lineWidth = s.w; g.setLineDash(s.dash);
      g.lineJoin = "round"; g.lineCap = "round";
      g.beginPath();
      let pen = false;
      for (const p of pts) {
        if (key === GAP_KEY && isGap(p)) { pen = false; continue; }   // 끊는다
        const X = px(p.lam), Y = py(p.T);
        if (!pen) { g.moveTo(X, Y); pen = true; } else g.lineTo(X, Y);
      }
      g.stroke();
      g.restore();
    }

    g.save();
    g.fillStyle = "#6b6b72"; g.font = "12px 'Malgun Gothic', sans-serif";
    g.textBaseline = "top";
    g.textAlign = mx > (x0 + x1) / 2 ? "right" : "left";
    g.fillText("현재 λ = " + shared.lam_cm.toFixed(1) + " cm",
      mx + (mx > (x0 + x1) / 2 ? -6 : 6), y0 + 2);
    g.restore();

    if (LEGEND_IN_CANVAS) drawCurveLegendCanvas(g, x0, x1, PLOT_H);
  }

  // 캔버스 안 범례 — x 축 라벨 아래 별도 띠. 플롯 안에 넣으면 하위헌스 곡선이나 실제
  // 곡선의 감쇠 꼬리가 걸린다 (§8-4-1 (6) 실측).
  function drawCurveLegendCanvas(g, x0, x1, top) {
    const N = curve.fin ? curve.fin.N : curveN();
    const lines = [
      { k: "infGrid" }, { k: "infHuy" },
      { d: "무한 곡선 정의 — 전파 회절차수 전력합  T = Σ(κ_m/k)|t_m|²" },
      { k: "finGrid", s: " · N = " + N }, { k: "finHuy", s: " · N = " + N },
      { d: "유한 곡선 정의 — x = 30 mm · 반높이 22.5 mm · 41 표본 평균 |E|²" },
      { w: "두 정의는 서로 다릅니다 — 직접 비교하지 마십시오" },
    ];
    const lh = 16, padX = 10, padY = 8;
    g.save();
    g.strokeStyle = "#d8d8de"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, top - 4); g.lineTo(x1, top - 4); g.stroke();
    g.textBaseline = "middle";
    lines.forEach(function (ln, i) {
      const y = top - 4 + padY + i * lh + lh / 2;
      if (ln.k) {
        const s = CV[ln.k];
        g.save();
        g.strokeStyle = s.color; g.lineWidth = s.w; g.setLineDash(s.dash);
        g.beginPath(); g.moveTo(x0 + padX, y); g.lineTo(x0 + padX + 30, y); g.stroke();
        g.restore();
        g.fillStyle = "#10193a"; g.font = "12px 'Malgun Gothic', sans-serif";
        g.textAlign = "left"; g.fillText(s.label + (ln.s || ""), x0 + padX + 38, y);
      } else if (ln.d) {
        g.fillStyle = "#6b6b72"; g.font = "11px 'Malgun Gothic', sans-serif";
        g.textAlign = "left"; g.fillText(ln.d, x0 + padX + 4, y);
      } else {
        g.fillStyle = "#8a4512"; g.font = "bold 11.5px 'Malgun Gothic', sans-serif";
        g.textAlign = "left"; g.fillText(ln.w, x0 + padX + 4, y);
      }
    });
    g.restore();
  }

  function renderCurveLegend() {
    const N = curve.fin ? curve.fin.N : curveN();
    const row = (k, extra) => '<div class="lg"><span class="swatch" style="border-top:' +
      CV[k].w + 'px ' + (CV[k].dash.length ? 'dashed' : 'solid') + ' ' + CV[k].color +
      '"></span><span>' + CV[k].label + (extra || '') + '</span></div>';
    $("curveLegend").innerHTML =
      row('infGrid') + row('infHuy') +
      '<div class="lgdef">무한 곡선 정의 — 전파 회절차수 전력합 ' +
        '<code>T = Σ(κ_m/k)|t_m|²</code></div>' +
      row('finGrid', ' · N = ' + N) + row('finHuy', ' · N = ' + N) +
      '<div class="lgdef">유한 곡선 정의 — <code>x = 30 mm</code>, 측정창 반높이 ' +
        '<code>22.5 mm</code>, <code>41</code> 표본 평균 <code>|E|²</code> · ' +
        '도선당 적분 표본 <code>' + HP.T_NS_FIXED + '</code> 고정</div>' +
      '<p class="caution">두 정의는 서로 다릅니다 — 무한 곡선과 유한 곡선을 직접 ' +
        '비교하지 마십시오</p>';
    $("curveLegend").hidden = LEGEND_IN_CANVAS;

    const tr = curve.inf.tr, gp = curve.inf.gapped;
    $("curveRec").innerHTML =
      '<b>[기록] 판정 아님 — 임계 없음.</b> <code>|T+R−1|</code> 전 구간 최대 <b>' +
        tr.max.toFixed(4) + '</b> (λ=' + tr.maxLam.toFixed(1) + ' cm) · λ ≥ 5 cm 구간 ' +
        tr.lo5.toFixed(4) + ' ~ ' + tr.hi5.toFixed(4) + '. 이 값은 <b>Rayleigh 지표가 ' +
        '아니라</b> <code>floquetZ</code> 임피던스 시트 근사의 충실도 지표이며 ' +
        '<code>a/d</code> 에 계통적으로 의존합니다 (설계 §14-7-1). 현재 <code>a/d</code> = ' +
        (aEffMm(curve.a, curve.d) / curve.d).toFixed(3) + '.<br>' +
      '<b>끊은 점 (T &gt; 100 %):</b> ' +
      (gp.length
        ? gp.map((p) => 'λ=' + p.lam.toFixed(1) + ' → ' + (p.T * 100).toFixed(1) + ' %')
            .join(' · ') + ' <b>(' + gp.length + '점)</b>'
        : '<b>없음 (0점)</b>');
  }

  function updateCurve() {
    const ts = tabState[activeTab];
    const N = curveN();
    const geomChanged = curve.d !== ts.d_mm || curve.a !== ts.a_mm;
    if (geomChanged || !curve.inf) {
      curve.d = ts.d_mm; curve.a = ts.a_mm;
      curve.inf = computeInfinite(curve.d, curve.a);   // 291점 해석식 — 5 ms 미만
    }
    if (geomChanged || curve.N !== N) {
      curve.N = N;
      scheduleFinite(curve.d, curve.a, N);
    } else if (finBusy()) {
      // 유한 곡선에 영향이 없는 조작(λ 등)이라도, **계산이 진행 중이면 미룬다.**
      // §8-4-2 2번("계산 중 재요청이 오면 이전 계산을 폐기")은 마스터 조작 전체에
      // 걸린다. 이걸 빠뜨리면 계산 중 λ 를 움직일 때 메인 스레드 경합으로 iframe
      // 전파가 늦어져 **게이트 5 가 최대 471 ms 로 FAIL 한다**(실측).
      // 조작을 멈추면 디바운스가 끝나 곧바로 계산이 시작된다.
      scheduleFinite(curve.d, curve.a, N);
    }
    drawCurve();
    renderCurveLegend();
  }

  // ── CSV 내보내기 (설계 §8-5) ────────────────────────────────────────
  // 논문에 들어가는 숫자가 파일로 나가는 마지막 관문이다. 정의가 섞이면 앞의 작업이
  // 전부 무의미해지므로 주석에 두 정의와 경고를 모두 적는다.
  //
  // **값은 반올림하지 않는다.** String(v) 는 왕복 정확 표현(round-trip)을 준다.
  // 표시용 반올림은 §11 표에서 이미 한 번 문제를 만들었다.
  function num(v) { return v === null || v === undefined ? "" : String(v); }

  // d/λ 가 정수면 1 (스치는 회절차수, κ→0). 부동소수점 여유를 둔다.
  function rayleighFlag(lam_cm, d_mm) {
    const r = (d_mm / 10) / lam_cm;
    return (r >= 1 && Math.abs(r - Math.round(r)) < 1e-9) ? 1 : 0;
  }

  function buildCSV() {
    const d = curve.d, a = curve.a, N = curve.fin ? curve.fin.N : curveN();
    const aEff = aEffMm(a, d);
    const ratio = aEff / d;
    // 유한 값은 0.5 cm 격자에서만 계산된다. λ 로 찾아 쓴다 (LAM_FIN ⊂ LAM_INF).
    const finG = {}, finH = {};
    if (curve.fin) {
      curve.fin.finGrid.forEach(function (p) { finG[p.lam] = p.T; });
      curve.fin.finHuy.forEach(function (p) { finH[p.lam] = p.T; });
    }
    // **현재 λ 는 0.5 cm 격자에 없어도 반드시 채운다.** 기본 조건 λ=12.2 cm 가 그렇다 —
    // 화면 [B] 패널이 보여 주는 값(논문에 싣는 숫자)을 CSV 가 재현하지 못하면 "논문
    // 숫자가 나가는 마지막 관문"이라는 이 파일의 목적이 무너진다. 2점만 더 계산한다.
    const lamNow = shared.lam_cm;
    let extraLam = null;
    if (!Object.prototype.hasOwnProperty.call(finG, lamNow)) {
      finG[lamNow] = MOM.T_fin_grid(lamNow, d, a, N);
      finH[lamNow] = HP.T_fin_huygens(lamNow, d, a, N);
      extraLam = lamNow;
    }

    const L = [];
    L.push("# 비교 페이지 T(λ) 내보내기 — 실제 격자 모형 ↔ 하위헌스-장애물 모형");
    L.push("# 내보낸 시각: " + new Date().toISOString() + "  (로컬 " + new Date().toLocaleString("ko-KR") + ")");
    L.push("# 조건: d = " + d + " mm · a = " + a + " mm (유효 " + aEff + " mm) · N = " + N +
           " · a/d = " + ratio.toFixed(3));
    L.push("#");
    L.push("# [무한 열] T_inf_grid · T_inf_huygens");
    L.push("#   정의: 전파 회절차수 전력합  T = Σ(κ_m/k)|t_m|²");
    L.push("# [유한 열] T_fin_grid · T_fin_huygens");
    L.push("#   정의: x = 30 mm, 측정창 반높이 22.5 mm, 41 표본 평균 |E|²");
    L.push("#   (도선당 적분 표본 " + HP.T_NS_FIXED + " 고정 — 화면 렌더의 nS 와 별개)");
    L.push("# ** 두 값은 정의가 다르므로 직접 비교하지 마십시오 **");
    L.push("#");
    L.push("# N 은 유한 열에만 적용됩니다. 무한 열과는 무관합니다 —");
    L.push("#   무한 배열은 도선이 무한히 많다는 전제라 N 이라는 개념 자체가 없습니다.");
    L.push("# T_fin_* 는 전력 유속이 아니라 측정창 평균 |E|² 이므로 1 을 넘을 수 있습니다.");
    L.push("#   이는 간섭에 의한 것이며 물리입니다. gap 처리하지 않습니다.");
    L.push("# T_inf_grid > 1 인 행은 화면 곡선에서 gap(끊김) 처리된 점입니다.");
    L.push("#   무손실 격자의 전력 투과율은 1 을 넘을 수 없으므로 **물리값이 아니라");
    L.push("#   수치 인공물**입니다 (λ < d 의 다중 전파차수 구간, floquetZ 의 1/κ).");
    L.push("#   원값을 그대로 남기니 검산에 쓰십시오.");
    L.push("# T_plus_R 은 Floquet 의 T+R 입니다. **판정이 아니라 기록이며 임계가 없습니다.**");
    L.push("#   1 에서 벗어나는 정도는 Rayleigh 지표가 아니라 floquetZ 임피던스 시트 근사의");
    L.push("#   충실도 지표이고, 무차원 d/λ 와 a/d 만의 함수입니다.");
    L.push("# rayleigh_flag: d/λ 가 정수(스치는 회절차수, κ→0)이면 1.");
    L.push("#");
    L.push("# [경고] a/d 유효 범위 — 현재 a/d = " + ratio.toFixed(3) +
           (ratio <= 0.05 ? "  (권장 범위 안)" : "  (권장 0.05 초과!)"));
    L.push("#   a/d ≤ 0.05  : λ≫d 에서 |T+R−1| 0.3 % 이내 — 안전");
    L.push("#   a/d = 0.10  : λ≫d 9 % · λ<d 최대 84 % — 오차를 명시하면 사용 가능");
    L.push("#   a/d = 0.30  : λ<d 최대 21594 % — **논문 사용 불가** (A_RATIO_MAX 상한)");
    L.push("#");
    L.push("# 행 격자: λ 1~30 cm 를 0.1 cm 간격 291행. T_fin_* 는 0.5 cm 격자(59점)에서만");
    L.push("#   계산하므로 **나머지 행은 빈 칸**입니다. 이는 격자 차이일 뿐이며");
    L.push("#   화면에 보이는 탭과는 무관합니다 — 유한 값은 탭과 상관없이 항상 채웁니다.");
    if (extraLam !== null) {
      L.push("#   단, **현재 λ = " + extraLam + " cm 는 0.5 cm 격자에 없지만 채웠습니다** —");
      L.push("#   화면 하단 [B] 패널이 보여 주는 값(논문에 싣는 숫자)이 이 행입니다.");
      L.push("#   유한 값이 들어간 행은 59 + 1 = 60 개입니다.");
    }
    L.push("# 값은 반올림하지 않았습니다 (왕복 정확 표현).");
    L.push("lam_cm,d_mm,a_mm,N,T_inf_grid,T_inf_huygens,T_fin_grid,T_fin_huygens,T_plus_R,rayleigh_flag");

    curve.inf.infGrid.forEach(function (p, i) {
      const lam = p.lam;
      const hasFin = Object.prototype.hasOwnProperty.call(finG, lam);
      L.push([
        num(lam), num(d), num(a), num(N),
        num(p.T),                                   // T_inf_grid (원값 — gap 점도 그대로)
        num(curve.inf.infHuy[i].T),                 // T_inf_huygens
        hasFin ? num(finG[lam]) : "",               // T_fin_grid
        hasFin ? num(finH[lam]) : "",               // T_fin_huygens
        num(p.TR),                                  // T_plus_R  [기록]
        num(rayleighFlag(lam, d)),
      ].join(","));
    });
    return L.join("\r\n") + "\r\n";
  }

  function exportCSV() {
    if (!curve.inf) return;
    // BOM 을 붙인다 — 엑셀이 UTF-8 을 못 알아보고 주석의 한글이 깨진다.
    const blob = new Blob(["﻿" + buildCSV()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Tlambda_d" + curve.d + "mm_a" + curve.a + "mm_N" +
                 (curve.fin ? curve.fin.N : curveN()) + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function apply() { syncLabels(); broadcast(); updateQuant(); updateCurve(); }

  // ── UI 바인딩 ───────────────────────────────────────────────────────
  // 전환 중 표시. 탭 전환은 좌우 앱의 recompute()+drawFrame() 을 동기로 돌리는데,
  // 동일 출처 iframe 이 부모와 메인 스레드를 공유하므로 그 동안 화면 전체가 멈춘다
  // (실측 983~2245 ms, 백그라운드 3배 포함). 아무 표시가 없으면 고장으로 보인다.
  function setTabBusy(on) {
    document.querySelectorAll(".tabBtn").forEach(function (b) { b.disabled = on; });
    $("tabBusy").hidden = !on;
  }

  // 표시가 실제로 그려지도록 페인트를 한 번 양보한 뒤 계산에 들어간다.
  // rAF 는 백그라운드 탭에서 멈추므로 setTimeout 대비를 함께 건다 (둘 중 먼저 오는 것).
  function yieldToPaint(fn) {
    let done = false;
    function run() { if (done) return; done = true; fn(); }
    requestAnimationFrame(function () { requestAnimationFrame(run); });
    setTimeout(run, 250);
  }

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
      syncLabels();
      setTabBusy(true);
      yieldToPaint(function () {
        broadcast();
        updateQuant();
        updateCurve();   // 탭마다 d·a 가 다르므로 곡선도 따라가야 한다 (§8-4)
        setTabBusy(false);
        // 진단줄과 탭 경고는 refreshProbe() 안에서만 갱신된다. 탭 전환 뒤에 부르지 않으면
        // 마스터 탭 번호만 바뀌고 iframe 탭 번호는 낡은 값이 남아 **거짓 불일치 ❌** 가
        // 뜬다. 탭 일치 감시는 게이트이므로 거짓 경보를 두지 않는다.
        //
        // 다만 **여기서 바로 부르면 안 된다** — broadcast() 는 postMessage 라 비동기이고,
        // iframe 은 아직 탭을 적용하지 않았다. 같은 태스크에서 읽으면 100 % 거짓 ❌ 다
        // (실측). iframe 이 반영될 때까지 기다린 뒤 부른다.
        refreshProbeWhenSettled();
      });
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

  // 양쪽 iframe 이 마스터 탭을 반영할 때까지 기다린 뒤 진단줄을 갱신한다.
  // **대기에 타이머를 쓰지 않는다** — 백그라운드 탭에서 setTimeout 은 1초로 클램프되고
  // 5분 뒤에는 1분 정렬까지 간다 (설계 §15-20). MessageChannel 태스크 틱으로 돈다.
  function refreshProbeWhenSettled(budgetMs) {
    const t0 = performance.now();
    const want = activeTab;
    (function step() {
      if (want !== activeTab) return;          // 그 사이 또 바뀌었다 — 새 호출에 넘긴다
      const settled = FRAMES.map(iframeTab).every(function (t) { return t === want; });
      if (settled || performance.now() - t0 > (budgetMs || 4000)) { refreshProbe(); return; }
      const c = new MessageChannel();
      c.port1.onmessage = step;
      c.port2.postMessage(0);
    })();
  }

  // ── 시작 ────────────────────────────────────────────────────────────
  let pending = FRAMES.length;
  FRAMES.forEach(function (f) {
    frameEl(f).addEventListener("load", function () {
      // 진단줄은 iframe 이 마스터 탭을 반영한 뒤에 읽어야 한다 — 그 전에 읽으면 거짓
      // 불일치 ❌ 가 뜬다. 로드 직후에 탭을 바꾸면 250 ms 로는 부족하다(실측).
      if (--pending === 0) { apply(); pushAmp(); refreshProbeWhenSettled(); }
    });
  });

  // 곡선은 iframe 과 무관하게 직접 계산하므로 (§8-2) 로드를 기다리지 않는다.
  syncLabels();
  updateCurve();

  $("legendInCanvas").addEventListener("change", function () {
    LEGEND_IN_CANVAS = this.checked;
    drawCurve(); renderCurveLegend();
  });
  $("csvBtn").addEventListener("click", exportCSV);

  window.addEventListener("resize", function () {
    refreshProbeWhenSettled();
    drawCurve();                       // 캔버스 폭이 CSS 로 바뀌므로 다시 그린다
  });

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
    // 게이트 11(디바운스·취소) 과 미리보기 대조용
    curve: function () {
      return {
        d: curve.d, a: curve.a, N: curve.N,
        finN: curve.fin ? curve.fin.N : null,
        finReady: !!curve.fin,
        gapped: curve.inf ? curve.inf.gapped.map((p) => ({ lam: p.lam, T: p.T })) : null,
        tr: curve.inf ? curve.inf.tr : null,
        maxFinGrid: curve.fin ? Math.max.apply(null, curve.fin.finGrid.map((p) => p.T)) : null,
        maxFinHuy: curve.fin ? Math.max.apply(null, curve.fin.finHuy.map((p) => p.T)) : null,
        maxInfGrid: curve.inf ? Math.max.apply(null, curve.inf.infGrid.map((p) => p.T)) : null,
        maxInfHuy: curve.inf ? Math.max.apply(null, curve.inf.infHuy.map((p) => p.T)) : null,
      };
    },
    setN: function (n) { $("mN").value = String(n); $("mN").dispatchEvent(new Event("input")); },
    csv: buildCSV,          // 게이트 8 — 다운로드하지 않고 내용만 확인할 수 있게
  };
})();
