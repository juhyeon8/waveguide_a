// 하위헌스-프레넬 장애물 모형 (대조군) — DOM · 렌더 · UI.
// 물리는 전부 physics.js 에, 판정은 전부 verify.js 에 있다. 이 파일에는 둘 다 없다.
// 구조는 원본 Faraday/script.js 를 따른다.
(function () {
  "use strict";

  const P = window.HuygensPhysics;
  const V = window.HuygensVerify;
  const REF = window.FloquetRef;

  // =====================================================================
  // 0. 상수
  // =====================================================================
  const C_LIGHT = 2.99792458e8;
  const TWO_PI = Math.PI * 2;
  const VMAX = 1.5;           // 색 포화 기준 [V/m] — 원본과 동일

  // =====================================================================
  // 1. 상태
  // =====================================================================
  const shared = { lam_cm: 12.2, amp: 1.0, playing: true, phase: 0 };
  const tabState = [
    { d_mm: 10, a_mm: 0.5, N: 0 },   // Tab 0: 무한 배열 (N 표시 전용)
    { d_mm: 10, a_mm: 0.5, N: 30 },  // Tab 1: 유한 배열
  ];
  let activeTab = 0;

  // =====================================================================
  // 2. 솔버 출력
  // =====================================================================
  const solver = {
    k: 0, aEff_m: 0, wiresY: [], nS: 0,
    gridW: 0, gridH: 0, Xw: 0, Yw: 0,
    incRe: null, incIm: null, diffRe: null, diffIm: null,
    tau: 1, lastRecomputeMs: 0,
  };
  let transmittance = 0;
  let tInfo = null;           // Tab 0 정보란 부가 정보 (차수 분해 · 참고 Floquet T)

  // =====================================================================
  // 3. 레이아웃 / 캔버스
  // =====================================================================
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  const offscreen = document.createElement("canvas");
  const offctx = offscreen.getContext("2d");

  const layout = {
    cssW: 0, cssH: 0, marginL: 12, marginR: 12, marginT: 10, marginB: 10,
    gap: 14, bandX: 0, bandW: 0, bandH: 0, bandY: [0, 0, 0],
  };

  const BAND_TITLES = ["① 입사파", "② 차이장 (전체 − 입사)", "③ 전체장"];
  const DIFF_CAPTION =
    "실제 모형의 '산란파'에 대응하는 자리. 이 모형에서는 장애물이 제거한 " +
    "하위헌스 자파(子波)들의 합이며, 도선 왼쪽에는 아무것도 없습니다.";
  const WIRE_CAPTION =
    "도선 굵기는 표시상 " + P.WIRE_DRAW_EXAGGERATION + "배 과장 (계산은 실제 a)";

  // =====================================================================
  // 4. 물리 계산 — 전부 physics.js 에 위임한다
  // =====================================================================
  function recompute() {
    if (!layout.bandW || !layout.bandH) return;
    const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());

    const ts = tabState[activeTab];
    const lam_m = shared.lam_cm / 100;
    const d_m = ts.d_mm / 1000;
    const aEff_m = P.aEffMm(ts.a_mm, ts.d_mm) / 1000;
    const k = TWO_PI / lam_m;
    const aspect = layout.bandH / layout.bandW;
    const gridW = activeTab === 0 ? P.GRID_W_INF : P.GRID_W_FINITE;
    const g = P.gridGeom(gridW, aspect);

    let N;
    if (activeTab === 0) {
      // 표시 전용 — 계산에 N 이 들어가지 않는다 (설계 §4-2)
      N = Math.min(P.N_MAX_INF, Math.max(4, Math.floor(2 * g.Yw / d_m)));
      ts.N = N;
      const el = document.getElementById("autoNVal");
      if (el) el.textContent = N;
    } else {
      N = ts.N;
    }
    const wiresY = P.wireYs(N, d_m);
    const nS = P.nSampleFor(aEff_m, lam_m, g.dx_m);

    const n = g.gridW * g.gridH;
    const incRe = new Float32Array(n), incIm = new Float32Array(n);
    for (let gj = 0; gj < g.gridH; gj++) {
      const base = gj * g.gridW;
      for (let gi = 0; gi < g.gridW; gi++) {
        const ph = k * P.cellX(gi, g);
        incRe[base + gi] = Math.cos(ph);
        incIm[base + gi] = Math.sin(ph);
      }
    }

    const D = activeTab === 0
      ? P.analyticDiffGrid(g, k, d_m, aEff_m)
      : P.rsDiffGrid(g, k, wiresY, aEff_m, nS, P.USE_Y_SYMMETRY);

    Object.assign(solver, {
      k: k, aEff_m: aEff_m, wiresY: wiresY, nS: nS,
      gridW: g.gridW, gridH: g.gridH, Xw: g.Xw, Yw: g.Yw,
      incRe: incRe, incIm: incIm, diffRe: D.re, diffIm: D.im,
      // 하위헌스 모형은 스칼라 이론이라 편광을 구별하지 못한다. 항상 1.
      tau: P.TAU_FOR_POL(true),
    });

    if (activeTab === 0) {
      const r = P.T_inf_huygens(shared.lam_cm, ts.d_mm, ts.a_mm);
      transmittance = r.T;
      tInfo = { orders: r.orders, ref: REF.T_inf_grid(shared.lam_cm, ts.d_mm, ts.a_mm).T };
    } else {
      transmittance = P.T_fin_huygens(shared.lam_cm, ts.d_mm, ts.a_mm, N);
      tInfo = null;
    }

    solver.lastRecomputeMs =
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
    updateInfo();
  }

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    layout.cssW = rect.width; layout.cssH = rect.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(layout.cssW * dpr);
    canvas.height = Math.round(layout.cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    layout.bandX = layout.marginL;
    layout.bandW = layout.cssW - layout.marginL - layout.marginR;
    const totalH = layout.cssH - layout.marginT - layout.marginB - 2 * layout.gap;
    layout.bandH = totalH / 3;
    for (let i = 0; i < 3; i++)
      layout.bandY[i] = layout.marginT + i * (layout.bandH + layout.gap);

    recompute();
    drawFrame();
  }

  // =====================================================================
  // 5. 색 매핑 + 프레임 렌더  (①+②=③ 관계 유지 — 원본과 같은 색 스케일)
  // =====================================================================
  function colorFor(v, out, o) {
    let t = v; if (t > 1) t = 1; else if (t < -1) t = -1;
    let r, g, bl;
    if (t >= 0) { r = 255; g = 255 - t * 205; bl = 255 - t * 215; }
    else { const u = -t; r = 255 - u * 215; g = 255 - u * 165; bl = 255 - u * 35; }
    out[o] = r; out[o + 1] = g; out[o + 2] = bl; out[o + 3] = 255;
  }

  function drawFrame() {
    ctx.clearRect(0, 0, layout.cssW, layout.cssH);
    const gw = solver.gridW, gh = solver.gridH;
    if (!gw || !gh) return;
    const A = shared.amp, tau = solver.tau;
    const cosP = Math.cos(shared.phase), sinP = Math.sin(shared.phase);

    if (offscreen.width !== gw || offscreen.height !== gh) {
      offscreen.width = gw; offscreen.height = gh;
    }
    const img = offctx.createImageData(gw, gh);
    const data = img.data;

    for (let band = 0; band < 3; band++) {
      for (let p = 0; p < gw * gh; p++) {
        let fr, fi;
        if (band === 0) { fr = solver.incRe[p]; fi = solver.incIm[p]; }
        else if (band === 1) { fr = solver.diffRe[p] * tau; fi = solver.diffIm[p] * tau; }
        else {
          fr = solver.incRe[p] + solver.diffRe[p] * tau;
          fi = solver.incIm[p] + solver.diffIm[p] * tau;
        }
        const val = (fr * cosP + fi * sinP) * A;
        colorFor(val / VMAX, data, p * 4);
      }
      offctx.putImageData(img, 0, 0);
      const by = layout.bandY[band];
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(offscreen, layout.bandX, by, layout.bandW, layout.bandH);
      drawOverlay(band, by);
    }
  }

  function worldToBand(wx, wy, by) {
    const sx = layout.bandX + (wx + solver.Xw) / (2 * solver.Xw) * layout.bandW;
    const sy = by + (solver.Yw - wy) / (2 * solver.Yw) * layout.bandH;
    return { x: sx, y: sy };
  }

  function drawOverlay(band, by) {
    const bx = layout.bandX, bw = layout.bandW, bh = layout.bandH;
    ctx.strokeStyle = "#c8c8ce"; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

    const ts = tabState[activeTab];
    const sPx = layout.bandW / (2 * solver.Xw);
    const dPx = ts.d_mm / 1000 * sPx;
    const aRatio = solver.aEff_m / (ts.d_mm / 1000);
    // 표시 반지름은 과장한다. 물리 계산은 aEff_m 으로 정확히 수행한다.
    const rPx = Math.min(dPx * 0.48,
      Math.max(2.5, dPx * aRatio * P.WIRE_DRAW_EXAGGERATION));

    // 중심선 (도선 배열 위치)
    const top = worldToBand(0, solver.Yw, by), bot = worldToBand(0, -solver.Yw, by);
    ctx.save();
    ctx.strokeStyle = band === 0 ? "#e4e4e8" : "#9aa0aa";
    ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bot.x, bot.y); ctx.stroke();
    ctx.restore();

    // 도선
    const N = ts.N;
    for (let n = 0; n < N; n++) {
      const p = worldToBand(0, solver.wiresY[n], by);
      if (p.y < by - 4 || p.y > by + bh + 4) continue;
      ctx.beginPath(); ctx.arc(p.x, p.y, rPx, 0, TWO_PI);
      if (band !== 0) {
        ctx.fillStyle = "#3a3a40"; ctx.fill();
        ctx.lineWidth = 1; ctx.strokeStyle = "#1c1c1f"; ctx.stroke();
      } else {
        ctx.fillStyle = "rgba(120,120,128,0.45)"; ctx.fill();
      }
    }

    // 진행방향 화살표 (입사 칸, 왼→오른). 편광 표시기는 없다 — 이 모형에 편광이 없다.
    if (band === 0) {
      const ay = by + 16, ax = bx + 16;
      ctx.fillStyle = "#444"; ctx.strokeStyle = "#444"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + 34, ay); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ax + 34, ay); ctx.lineTo(ax + 27, ay - 4);
      ctx.lineTo(ax + 27, ay + 4); ctx.closePath(); ctx.fill();
      ctx.font = "11px sans-serif"; ctx.textAlign = "left"; ctx.fillStyle = "#444";
      ctx.fillText("입사파 진행 →", ax, ay - 8);
    }

    // 밴드 제목 (좌측 하단)
    ctx.font = "bold 13px sans-serif"; ctx.textAlign = "left";
    ctx.fillStyle = "#10193a";
    ctx.fillText(BAND_TITLES[band], bx + 10, by + bh - 10);

    // 밴드 하단 캡션 (제목 위 줄로 쌓는다). 폭이 모자라면 그리지 않는다.
    const caps = [];
    if (band === 1) caps.push(DIFF_CAPTION);
    if (band !== 0) caps.push(WIRE_CAPTION);
    ctx.font = "10px sans-serif"; ctx.fillStyle = "#6b6b72";
    for (let ci = 0; ci < caps.length; ci++) {
      const txt = caps[caps.length - 1 - ci];
      if (ctx.measureText(txt).width > bw - 20) continue;
      ctx.fillText(txt, bx + 10, by + bh - 26 - ci * 13);
    }
  }

  // =====================================================================
  // 6. 정보 표시
  // =====================================================================
  function updateInfo() {
    const ts = tabState[activeTab];
    const lam_m = shared.lam_cm / 100;
    const dlam = (ts.d_mm / 1000) / lam_m;
    const f_GHz = C_LIGHT / lam_m / 1e9;
    const aEff = P.aEffMm(ts.a_mm, ts.d_mm);

    const head =
      `[${activeTab === 0 ? "무한 배열" : "유한 배열"}] &nbsp;N = <b>${ts.N}` +
      `${activeTab === 0 ? " (표시 전용)" : ""}</b><br>` +
      `파장 λ = <b>${shared.lam_cm.toFixed(1)} cm</b> &nbsp;(f ≈ <b>${f_GHz.toFixed(2)} GHz</b>)<br>` +
      `간격 d = <b>${(ts.d_mm / 10).toFixed(2)} cm</b> · 반지름 a = <b>${(aEff / 10).toFixed(3)} cm</b><br>` +
      `<b>d/λ = ${dlam.toFixed(3)}</b><br>`;

    let body;
    if (activeTab === 0) {
      const byAbs = {};
      (tInfo.orders || []).forEach(function (o) {
        const am = Math.abs(o.m);
        if (byAbs[am] === undefined) byAbs[am] = o.Tm;   // ± 쌍은 동일 전력
      });
      const parts = Object.keys(byAbs).map(Number).sort(function (x, y) { return x - y; })
        .map(function (am) {
          const p = (byAbs[am] * 100).toFixed(1);
          return am === 0 ? `m=0: ${p}%` : `m=±${am}: 각 ${p}%`;
        });
      body =
        `전력 투과율 <b>T = ${(transmittance * 100).toFixed(1)} %</b>` +
        `<br>전파차수 <b>${(tInfo.orders || []).length}개</b> &nbsp;· &nbsp;${parts.join(", ")}` +
        `<br><span class="warn">R = 0 % (이 모형에는 반사가 없음) → T + R ≠ 1 : 에너지 비보존</span>` +
        `<br>참고 — 동일 조건 실제 모형(Floquet) T = <b>${(tInfo.ref * 100).toFixed(1)} %</b>`;
    } else {
      body =
        `전력 투과율 <b>T = ${(transmittance * 100).toFixed(1)} %</b>` +
        `<br><span style="font-size:11px">측정 정의: x = 30 mm, 측정창 반높이 22.5 mm, ` +
        `41 표본 평균 |E|², 도선당 적분 표본 ${P.T_NS_FIXED} 고정</span>`;
    }
    document.getElementById("infoBox").innerHTML = head + body;
  }

  function syncLabels() {
    const ts0 = tabState[0];
    const aMax0 = P.A_RATIO_MAX * ts0.d_mm;
    const aEff0 = P.aEffMm(ts0.a_mm, ts0.d_mm);
    document.getElementById("a0Val").textContent =
      (ts0.a_mm / 10).toFixed(3) + " cm" +
      (ts0.a_mm > aMax0 + 1e-9 ? " →" + (aEff0 / 10).toFixed(3) : "");
    document.getElementById("d0Val").textContent = (ts0.d_mm / 10).toFixed(2) + " cm";
    document.getElementById("a0Slider").max = Math.max(0.05, aMax0).toFixed(2);

    const ts1 = tabState[1];
    const aMax1 = P.A_RATIO_MAX * ts1.d_mm;
    const aEff1 = P.aEffMm(ts1.a_mm, ts1.d_mm);
    document.getElementById("a1Val").textContent =
      (ts1.a_mm / 10).toFixed(3) + " cm" +
      (ts1.a_mm > aMax1 + 1e-9 ? " →" + (aEff1 / 10).toFixed(3) : "");
    document.getElementById("d1Val").textContent = (ts1.d_mm / 10).toFixed(2) + " cm";
    document.getElementById("n1Val").textContent = ts1.N + " 개";
    document.getElementById("a1Slider").max = Math.max(0.05, aMax1).toFixed(2);

    document.getElementById("lamVal").textContent = shared.lam_cm.toFixed(1) + " cm";
    document.getElementById("ampVal").textContent = shared.amp.toFixed(2) + " V/m";
  }

  // =====================================================================
  // 7. UI 바인딩  (편광 버튼은 disabled 이므로 리스너를 달지 않는다)
  // =====================================================================
  let recomputeTimer = null;
  function scheduleRecompute() {
    if (recomputeTimer) clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(function () { recompute(); drawFrame(); }, 60);
  }

  function bindTabSlider(id, tabIdx, key, parse) {
    document.getElementById(id).addEventListener("input", function () {
      tabState[tabIdx][key] = parse(this.value);
      syncLabels();
      if (activeTab === tabIdx) scheduleRecompute();
    });
  }
  bindTabSlider("a0Slider", 0, "a_mm", parseFloat);
  bindTabSlider("d0Slider", 0, "d_mm", parseFloat);
  bindTabSlider("a1Slider", 1, "a_mm", parseFloat);
  bindTabSlider("d1Slider", 1, "d_mm", parseFloat);
  bindTabSlider("n1Slider", 1, "N", function (v) { return parseInt(v, 10); });

  document.getElementById("lamSlider").addEventListener("input", function () {
    shared.lam_cm = parseFloat(this.value);
    syncLabels(); scheduleRecompute();
  });
  document.getElementById("ampSlider").addEventListener("input", function () {
    shared.amp = parseFloat(this.value);
    syncLabels(); drawFrame();
  });

  document.querySelectorAll(".tabBtn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const newTab = parseInt(this.dataset.tab, 10);
      if (newTab === activeTab) return;
      activeTab = newTab;
      document.querySelectorAll(".tabBtn").forEach(function (b, i) {
        b.classList.toggle("active", i === newTab);
      });
      document.querySelectorAll(".tabPane").forEach(function (p, i) {
        p.classList.toggle("active", i === newTab);
      });
      recompute(); drawFrame();
    });
  });

  const playBtn = document.getElementById("playBtn");
  const phaseWrap = document.getElementById("phaseWrap");
  const phaseSlider = document.getElementById("phaseSlider");
  playBtn.addEventListener("click", function () {
    shared.playing = !shared.playing;
    playBtn.textContent = shared.playing ? "‖ 일시정지" : "▶ 재생";
    phaseWrap.classList.toggle("on", !shared.playing);
    document.getElementById("phaseHint").style.display = shared.playing ? "none" : "block";
  });
  phaseSlider.addEventListener("input", function () {
    shared.phase = parseFloat(phaseSlider.value) * Math.PI / 180;
    document.getElementById("phaseVal").textContent = phaseSlider.value + "°";
    if (!shared.playing) drawFrame();
  });

  // =====================================================================
  // 8. 애니메이션 루프
  // =====================================================================
  function loop() {
    if (shared.playing) {
      shared.phase = (shared.phase + 0.06) % TWO_PI;
      drawFrame();
    }
    requestAnimationFrame(loop);
  }

  // =====================================================================
  // 9. 콘솔 자가검증
  //    판정은 verify.js 한 곳에만 있다. 여기서는 실측 env 를 넣어 부르기만 한다.
  // =====================================================================
  function runVerification() {
    const saved = {
      tab: activeTab, lam: shared.lam_cm,
      d: tabState[1].d_mm, a: tabState[1].a_mm, N: tabState[1].N,
    };
    // 항목 10 용 최악 조건 recompute() 실측 — λ=1cm, d=10mm, a=3mm, N=60, Tab 1
    // 설계 §9-1 의 Node 측정과 방법을 맞춘다: 여러 번 재고 최소값을 쓴다.
    // 첫 호출은 JIT 예열 전이라 3배까지 느리게 나온다.
    activeTab = 1;
    shared.lam_cm = 1; tabState[1].d_mm = 10; tabState[1].a_mm = 3; tabState[1].N = 60;
    let worstMs = Infinity;
    for (let i = 0; i < 7; i++) {
      recompute();
      if (solver.lastRecomputeMs < worstMs) worstMs = solver.lastRecomputeMs;
    }
    activeTab = saved.tab; shared.lam_cm = saved.lam;
    tabState[1].d_mm = saved.d; tabState[1].a_mm = saved.a; tabState[1].N = saved.N;

    const out = V.run({
      label: "브라우저 실측",
      aspect: layout.bandH / layout.bandW,
      cssW: layout.cssW, cssH: layout.cssH,
      recomputeMs: worstMs,
      perfOnly: false,
    });
    out.lines.forEach(function (l) { console.log(l); });
    console.log(out.pass ? "[검증] 전 항목 PASS" : "[검증] FAIL 항목 있음");
  }

  // =====================================================================
  // 시작
  // =====================================================================
  syncLabels();
  window.addEventListener("resize", resize);
  resize();          // layout 확정 + recompute + drawFrame
  runVerification(); // 같은 verify.js 를 브라우저에서 실행
  recompute();       // 검증이 상태를 건드렸을 수 있으므로 복원
  drawFrame();
  requestAnimationFrame(loop);
})();
