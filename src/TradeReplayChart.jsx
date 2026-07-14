import React, { useEffect, useRef, useState, useCallback } from "react";

// ─────────────────────────────────────────────────────────────
// TradeReviewChart (formerly TradeReplayChart) — the static TradingView-style
// review chart: TradingView Lightweight-Charts engine, the trade's REAL fills
// as ▲ entry / ▼ exit arrows at the exact bars, the locked stop as a level
// line, EMA9/21, timeframes, and drawing tools whose annotations AUTO-SAVE
// per trade (localStorage, keyed by trade id) — drawings are never lost.
// Replay/scrub was removed 2026-07-11 (Valen: static chart for trade review).
// Candles from /api/candles (Polygon, unadjusted). Sample fallback in local dev.
// ─────────────────────────────────────────────────────────────

const TFS = [{ k: "1min", lbl: "1m" }, { k: "5min", lbl: "5m" }, { k: "15min", lbl: "15m" }, { k: "60min", lbl: "1h" }, { k: "1day", lbl: "D" }];
const iso = (d) => (d ? String(d).slice(0, 10) : "");
// ── US Eastern (market time) is the chart's baseline, whatever the viewer's clock ──
// Bars are shifted so the axis renders ET wall-clock; fill times (stored as ET, e.g. "09:36:56")
// parse onto the same shifted axis. Handles EDT/EST automatically via Intl.
const etOffsetSec = (epochSec) => {
  const d = new Date(epochSec * 1000);
  const et = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((et - utc) / 1000);
};
const toEt = (t) => t + etOffsetSec(t);
// Fill timestamp on the shifted axis: ET wall-clock parsed as if UTC.
const fillEpoch = (dateStr, timeStr, fallback) => {
  const d = iso(dateStr); if (!d) return null;
  const t = (timeStr || fallback || "").trim();
  const ms = Date.parse(`${d}T${t || "09:30:00"}Z`);
  return Number.isNaN(ms) ? null : ms / 1000;
};
const kfmt = (v) => { const a = Math.abs(v); return (v < 0 ? "-" : "+") + "$" + (a >= 1000 ? (a / 1000).toFixed(1) + "k" : a.toFixed(0)); };
function pickRes(entry, exit) { const days = Math.max(0, (new Date(iso(exit) || iso(entry)) - new Date(iso(entry))) / 86400000); return days <= 1 ? "5min" : days <= 5 ? "15min" : days <= 25 ? "60min" : "1day"; }
function ema(vals, p) { const k = 2 / (p + 1); let e = null; return vals.map(v => { e = e == null ? v : v * k + e * (1 - k); return e; }); }
function genSample(trade, tf) {
  const entryP = Number(trade.entryP) || 100, exitP = Number(trade.exitP) || entryP;
  const startT = Math.floor(new Date(iso(trade.entry)).getTime() / 1000); if (!startT) return [];
  const perDay = tf === "1day" ? 1 : tf === "60min" ? 7 : tf === "15min" ? 26 : tf === "5min" ? 78 : 100;
  const dayStep = 86400, barStep = tf === "1day" ? dayStep : Math.floor((6.5 * 3600) / perDay);
  const preN = Math.round(perDay * (tf === "1day" ? 20 : 1.5)), holdN = Math.max(perDay, Math.round(perDay * (tf === "1day" ? 3 : 1))), N = preN + holdN;
  const bars = []; let px = entryP * 0.94; const vol = entryP * 0.012; const t0 = startT - preN * barStep;
  for (let i = 0; i < N; i++) { const target = i < preN ? entryP : exitP; px += (target - px) * 0.06 + (Math.random() - 0.5) * vol; const o = px, c = px + (Math.random() - 0.5) * vol, h = Math.max(o, c) + Math.random() * vol, l = Math.min(o, c) - Math.random() * vol; bars.push({ time: t0 + i * (tf === "1day" ? dayStep : barStep), open: +o.toFixed(2), high: +h.toFixed(2), low: +l.toFixed(2), close: +c.toFixed(2) }); px = c; }
  return bars;
}

export default function TradeReplayChart({ trade, C, font }) {
  const wrapRef = useRef(null), chartRef = useRef(null), seriesRef = useRef(null), canvasRef = useRef(null);
  const barsRef = useRef([]), drawingsRef = useRef([]), draftRef = useRef(null), toolRef = useRef("cursor");
  const [tf, setTf] = useState(() => pickRes(trade.entry, trade.exit));
  const [tool, setTool] = useState("cursor");
  const [status, setStatus] = useState("loading");
  const [sample, setSample] = useState(false);
  const [savedTick, setSavedTick] = useState(0); // bumps when annotations persist → "saved ✓" flash
  useEffect(() => { toolRef.current = tool; }, [tool]);

  const GOLD = C.goldBright, GRN = "#22c55e", RED = "#ef4444", BLUE = "#6aa8ff";

  // ── annotation persistence: load per trade, save on every change, never lost ──
  const drawKey = `viv-chart-draw-${trade.id ?? (trade.ticker + "|" + iso(trade.entry))}-v1`;
  useEffect(() => {
    try { drawingsRef.current = JSON.parse(localStorage.getItem(drawKey) || "[]"); } catch { drawingsRef.current = []; }
    draftRef.current = null;
  }, [drawKey]);
  const persistDrawings = useCallback(() => {
    try { localStorage.setItem(drawKey, JSON.stringify(drawingsRef.current)); setSavedTick(t => t + 1); } catch { /* quota — drawing stays on screen this session */ }
  }, [drawKey]);

  const mouseRef = useRef(null); // cursor position while a trend draft is pending — dashed preview

  // Bar spacing in seconds (median of the first gaps) — lets clicks/renders extrapolate past the data.
  const barStep = () => { const b = barsRef.current; if (b.length < 2) return 300; const g = []; for (let i = 1; i < Math.min(b.length, 25); i++) g.push(b[i].time - b[i - 1].time); g.sort((x, y) => x - y); return g[Math.floor(g.length / 2)] || 300; };
  // x-coordinate → epoch time, valid ANYWHERE on the canvas. The native coordinateToTime()
  // returns null in the whitespace right of the last bar — which is exactly where rays get
  // drawn — so ray/trend clicks there saved t=null and never rendered (Mandy 2026-07-14).
  const xToTime = (x) => {
    const chart = chartRef.current, b = barsRef.current; if (!chart || !b.length) return null;
    const l = chart.timeScale().coordinateToLogical(x); if (l == null) return null;
    const last = b.length - 1;
    if (l <= 0) return b[0].time + l * barStep();
    if (l >= last) return b[last].time + (l - last) * barStep();
    const i = Math.floor(l); return b[i].time + (l - i) * (b[i + 1].time - b[i].time);
  };
  // epoch time → x-coordinate on the CURRENT timeframe's bars. The native timeToCoordinate()
  // returns null for any time that isn't exactly a bar time on this TF, so drawings made on 5m
  // vanished after switching to 15m/1h/D. Interpolates between surrounding bars instead.
  const timeToX = (tm) => {
    const chart = chartRef.current, b = barsRef.current; if (!chart || !b.length || tm == null || typeof tm !== "number") return null;
    const last = b.length - 1; let l;
    if (tm <= b[0].time) l = (tm - b[0].time) / barStep();
    else if (tm >= b[last].time) l = last + (tm - b[last].time) / barStep();
    else { let lo = 0, hi = last; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (b[m].time <= tm) lo = m; else hi = m; } l = lo + (tm - b[lo].time) / ((b[hi].time - b[lo].time) || 1); }
    return chart.timeScale().logicalToCoordinate(l);
  };

  const redraw = useCallback(() => {
    const cv = canvasRef.current, chart = chartRef.current, s = seriesRef.current; if (!cv || !chart || !s) return;
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr; // crisp lines on retina
    const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
    const Y = (p) => s.priceToCoordinate(p);
    const line = (x1, y1, x2, y2, color) => { ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    for (const d of drawingsRef.current) {
      const y = Y(d.p1.price); if (y == null) continue;
      if (d.type === "hline") { line(0, y, w, y, GOLD); ctx.fillStyle = GOLD; ctx.font = "10px " + font; ctx.fillText(d.p1.price.toFixed(2), 4, y - 4); }
      else if (d.type === "hray") { const x = timeToX(d.p1.t); if (x != null) { line(x, y, w, y, GOLD); ctx.fillStyle = GOLD; ctx.font = "10px " + font; ctx.fillText(d.p1.price.toFixed(2), x + 4, y - 4); } }
      else if (d.type === "trend" && d.p2) { const x1 = timeToX(d.p1.t), y1 = Y(d.p1.price), x2 = timeToX(d.p2.t), y2 = Y(d.p2.price); if (x1 != null && x2 != null && y1 != null && y2 != null) line(x1, y1, x2, y2, BLUE); }
    }
    // pending trend draft: anchor dot + dashed preview to the cursor (first click used to be
    // invisible, which read as "the tool doesn't work")
    const draft = draftRef.current;
    if (draft) {
      const x = timeToX(draft.t), y = Y(draft.price);
      if (x != null && y != null) {
        ctx.fillStyle = BLUE; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
        const mp = mouseRef.current;
        if (mp) { ctx.setLineDash([4, 4]); line(x, y, mp.x, mp.y, BLUE); ctx.setLineDash([]); }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [font, GOLD, BLUE]);

  useEffect(() => {
    let dead = false; setStatus("loading");
    const start = new Date(iso(trade.entry)); start.setDate(start.getDate() - (tf === "1day" ? 40 : 6));
    const end = new Date(iso(trade.exit) || iso(trade.entry)); end.setDate(end.getDate() + (tf === "1day" ? 12 : 3));
    // A trade with a blank/garbage date builds an Invalid Date, and .toISOString() THROWS
    // (RangeError: Invalid time value) — this crashed the whole app for a member whose manual
    // rows had entry_date "" (JH, 2026-07-12). No valid window → no fetch, show empty state.
    if (isNaN(start) || isNaN(end)) { setStatus("empty"); return; }
    const f = start.toISOString().slice(0, 10), t = end.toISOString().slice(0, 10);
    const useSample = () => { const c = genSample(trade, tf); if (!c.length) { setStatus("empty"); return; } barsRef.current = c; setSample(true); setStatus("ok"); };
    fetch(`/api/candles?symbol=${encodeURIComponent(trade.ticker)}&from=${f}&to=${t}&res=${tf}`)
      .then(r => r.json()).then(j => { if (dead) return; const candles = (j.candles || []).map(c => ({ time: toEt(c.time), open: c.open, high: c.high, low: c.low, close: c.close })); if (!candles.length) { useSample(); return; } barsRef.current = candles; setSample(false); setStatus("ok"); })
      .catch(() => { if (!dead) useSample(); });
    return () => { dead = true; };
  }, [trade.ticker, trade.entry, trade.exit, tf]);

  useEffect(() => {
    if (status !== "ok") return; const LWC = window.LightweightCharts; if (!LWC || !wrapRef.current) { setStatus("nolib"); return; }
    wrapRef.current.innerHTML = "";
    const chart = LWC.createChart(wrapRef.current, { layout: { background: { color: "#0e0e16" }, textColor: "rgba(255,255,255,0.62)", fontFamily: font }, grid: { vertLines: { color: "rgba(255,255,255,0.05)" }, horzLines: { color: "rgba(255,255,255,0.05)" } }, rightPriceScale: { borderColor: "rgba(255,255,255,0.12)" }, timeScale: { borderColor: "rgba(255,255,255,0.12)", timeVisible: tf !== "1day", secondsVisible: false }, crosshair: { mode: 0 }, height: wrapRef.current.clientHeight || 440 });
    chartRef.current = chart;
    const s = chart.addCandlestickSeries({ upColor: GRN, downColor: RED, wickUpColor: GRN, wickDownColor: RED, borderVisible: false }); seriesRef.current = s;
    const bars = barsRef.current; s.setData(bars);
    const closes = bars.map(b => b.close), e9 = ema(closes, 9), e21 = ema(closes, 21);
    const l9 = chart.addLineSeries({ color: GOLD, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const l21 = chart.addLineSeries({ color: BLUE, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    l9.setData(bars.map((b, i) => ({ time: b.time, value: e9[i] })));
    l21.setData(bars.map((b, i) => ({ time: b.time, value: e21[i] })));
    const isLong = (trade.tradeType || "Long") !== "Short";
    const entryP = Number(trade.entryP) || 0, exitP = Number(trade.exitP) || 0, stopP = Number(trade.stop) || 0, up = (Number(trade.plDollar) || 0) >= 0;
    // Events vs levels: entry/exit = arrow markers at the exact fill bars ONLY; the locked
    // stop is a standing LEVEL, so only the stop draws a horizontal line.
    if (stopP) s.createPriceLine({ price: stopP, color: RED, lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: "stop " + stopP });
    // Fills at their EXACT time bars (entry_time/exit_time stored as ET; date-only rows fall
    // back to 09:30 ET open). TradeZella-style arrows: BUY side = green ▲ below the bar,
    // SELL side = red ▼ above the bar — colored by SIDE, not by P&L.
    const nearestT = (target) => { let b = bars[0], best = 1e18; for (const c of bars) { const d = Math.abs(c.time - target); if (d < best) { best = d; b = c; } } return b; };
    const marks = [];
    const fills = (trade._fills && trade._fills.length > 1) ? trade._fills : [trade];
    for (const f of fills) {
      const eT = fillEpoch(f.entry, f.entryTime), xT = fillEpoch(f.exit, f.exitTime, "15:59:00");
      const eP = Number(f.entryP) || entryP, xP = Number(f.exitP) || exitP;
      if (eT != null) marks.push({ time: nearestT(eT).time, position: isLong ? "belowBar" : "aboveBar", color: isLong ? GRN : RED, shape: isLong ? "arrowUp" : "arrowDown", text: (fills.length > 1 ? "" : "ENTRY ") + eP.toFixed(2) });
      if (xT != null && f.exit) marks.push({ time: nearestT(xT).time, position: isLong ? "aboveBar" : "belowBar", color: isLong ? RED : GRN, shape: isLong ? "arrowDown" : "arrowUp", text: (fills.length > 1 ? "" : "EXIT ") + xP.toFixed(2) });
    }
    marks.sort((a, b) => a.time - b.time);
    s.setMarkers(marks);
    chart.timeScale().fitContent();
    const onRange = () => redraw(); chart.timeScale().subscribeVisibleTimeRangeChange(onRange);
    const ro = new ResizeObserver(() => { chart.applyOptions({ height: wrapRef.current.clientHeight }); redraw(); }); ro.observe(wrapRef.current); redraw();
    return () => { try { ro.disconnect(); chart.remove(); } catch (e) {} chartRef.current = null; seriesRef.current = null; };
  }, [status, tf, font, redraw, trade, GOLD, BLUE]);

  const onCanvasClick = (e) => {
    const chart = chartRef.current, s = seriesRef.current; if (!chart || !s) return; const T = toolRef.current; if (T === "cursor") return;
    const rect = canvasRef.current.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
    const price = s.coordinateToPrice(y), t = xToTime(x); if (price == null) return;
    if (T === "hline") drawingsRef.current.push({ type: "hline", p1: { price } });
    else if (T === "hray") { if (t == null) return; drawingsRef.current.push({ type: "hray", p1: { t, price } }); }
    else if (T === "trend") {
      if (t == null) return;
      if (!draftRef.current) { draftRef.current = { t, price }; redraw(); return; } // anchor dot appears immediately
      drawingsRef.current.push({ type: "trend", p1: draftRef.current, p2: { t, price } }); draftRef.current = null; mouseRef.current = null;
    }
    persistDrawings();
    redraw();
  };
  const onCanvasMove = (e) => { // dashed preview while a trend anchor is pending
    if (toolRef.current !== "trend" || !draftRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    redraw();
  };

  // ── pills from trade data ──
  const entryP = Number(trade.entryP) || 0, exitP = Number(trade.exitP) || 0, stopP = Number(trade.stop) || 0, pl = Number(trade.plDollar) || 0, r = trade.rMult, sh = Number(trade.shares) || 0, up = pl >= 0;
  const Pill = ({ label, children }) => <span style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 9, padding: "7px 12px", fontSize: "0.76rem", color: C.muted, fontWeight: 600 }}>{label} {children}</span>;
  const b = (t, c) => <b style={{ color: c || "#fff", fontWeight: 800 }}>{t}</b>;
  const tBtn = (k, label, title) => <button title={title} onClick={() => { setTool(k); if (k !== "trend") { draftRef.current = null; mouseRef.current = null; redraw(); } }} style={{ background: tool === k ? C.goldDim : "transparent", color: tool === k ? C.goldBright : C.muted, border: `1px solid ${tool === k ? C.borderGold : "transparent"}`, borderRadius: 7, padding: "5px 9px", fontFamily: font, fontSize: "0.7rem", fontWeight: 700, cursor: "pointer" }}>{label}</button>;

  return (
    <div style={{ fontFamily: font }}>
      {/* stat pills */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Pill label="Entry">{b("$" + entryP.toFixed(2))} · {sh.toLocaleString()} sh</Pill>
        {stopP ? <Pill label="Stop">{b("$" + stopP.toFixed(2), RED)}</Pill> : null}
        <Pill label="Exit">{b("$" + exitP.toFixed(2))}</Pill>
        <Pill label="P&L">{b(kfmt(pl), up ? GRN : RED)}</Pill>
        {r != null ? <Pill label="Realized R">{b((Number(r) >= 0 ? "+" : "") + Number(r).toFixed(2) + "R", Number(r) >= 0 ? GRN : RED)}</Pill> : null}
        <Pill label="TF">{b(TFS.find(x => x.k === tf)?.lbl || tf, C.goldBright)}</Pill>
      </div>
      {/* timeframe + drawing tools strip */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 8, padding: 2 }}>
          {TFS.map(x => <button key={x.k} onClick={() => setTf(x.k)} style={{ background: tf === x.k ? C.gold : "transparent", color: tf === x.k ? "#1a1206" : C.muted, border: "none", borderRadius: 6, padding: "5px 10px", fontFamily: font, fontSize: "0.72rem", fontWeight: 700, cursor: "pointer" }}>{x.lbl}</button>)}
        </div>
        <div style={{ display: "flex", gap: 2, marginLeft: 4 }}>
          {tBtn("cursor", "✛", "Cursor")}{tBtn("hline", "─ Line", "Horizontal line")}{tBtn("hray", "→ Ray", "Horizontal ray")}{tBtn("trend", "╱ Trend", "Trend line")}
          <button onClick={() => { drawingsRef.current = []; draftRef.current = null; persistDrawings(); redraw(); }} title="Clear drawings (also clears the saved annotations for this trade)" style={{ background: "transparent", color: C.muted, border: "none", borderRadius: 7, padding: "5px 8px", fontFamily: font, fontSize: "0.7rem", fontWeight: 700, cursor: "pointer" }}>✕ Clear</button>
        </div>
        {savedTick > 0 && <span style={{ fontSize: "0.62rem", color: GRN, fontWeight: 700 }}>annotations saved ✓</span>}
      </div>
      {/* chart */}
      <div style={{ position: "relative", height: 500, borderRadius: 14, overflow: "hidden", border: `1px solid ${C.border}`, background: "#0e0e16" }}>
        <div ref={wrapRef} style={{ position: "absolute", inset: 0 }} />
        <canvas ref={canvasRef} onClick={onCanvasClick} onMouseMove={onCanvasMove} onMouseLeave={() => { mouseRef.current = null; redraw(); }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: tool === "cursor" ? "none" : "auto", cursor: tool === "cursor" ? "default" : "crosshair" }} />
        {status !== "ok" && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: C.muted, fontSize: "0.82rem" }}>{status === "loading" ? "Loading candles…" : status === "empty" ? `No candle data for ${trade.ticker}` : status === "nolib" ? "Chart engine not loaded" : "Couldn't load candles (check POLYGON_API_KEY)"}</div>}
        {status === "ok" && sample && <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(201,152,42,0.18)", border: `1px solid ${C.borderGold}`, color: C.goldBright, fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.05em", padding: "3px 8px", borderRadius: 6, pointerEvents: "none" }}>SAMPLE · live candles on deploy</div>}
      </div>
      {/* legend */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, color: C.muted, fontSize: "0.72rem" }}>
        <span><i style={{ display: "inline-block", width: 10, height: 2, background: C.goldBright, verticalAlign: "middle", marginRight: 5 }} />EMA9</span>
        <span><i style={{ display: "inline-block", width: 10, height: 2, background: BLUE, verticalAlign: "middle", marginRight: 5 }} />EMA21</span>
        <span style={{ color: GRN, fontWeight: 700 }}>▲ buy fill</span>
        <span style={{ color: RED, fontWeight: 700 }}>▼ sell fill</span>
        <span style={{ marginLeft: "auto", fontStyle: "italic" }}>times in US Eastern (ET) · fills at their exact time bars · drawings auto-save per trade</span>
      </div>
    </div>
  );
}
