import React, { useEffect, useRef, useState, useCallback } from "react";

// ─────────────────────────────────────────────────────────────
// TradeReplayChart — the alab-replay.html experience, in-app.
// Clean layout: stat pills → big chart → Play/Reset/scrub/speed → legend.
// TradingView's Lightweight-Charts engine + candle-by-candle replay +
// your executions plotted + a subtle drawing-tools strip (H-line/ray/trend).
// Candles from /api/candles (Polygon, unadjusted). Sample fallback in local dev.
// ─────────────────────────────────────────────────────────────

const TFS = [{ k: "1min", lbl: "1m" }, { k: "5min", lbl: "5m" }, { k: "15min", lbl: "15m" }, { k: "60min", lbl: "1h" }, { k: "1day", lbl: "D" }];
const iso = (d) => (d ? String(d).slice(0, 10) : "");
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
  const barsRef = useRef([]), drawingsRef = useRef([]), draftRef = useRef(null), toolRef = useRef("cursor"), scrubRef = useRef(1), timerRef = useRef(null);
  const [tf, setTf] = useState(() => pickRes(trade.entry, trade.exit));
  const [tool, setTool] = useState("cursor");
  const [status, setStatus] = useState("loading");
  const [sample, setSample] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [scrub, setScrub] = useState(1);
  const [speed, setSpeed] = useState(180);
  const [curDate, setCurDate] = useState("");
  useEffect(() => { toolRef.current = tool; }, [tool]);

  const GOLD = C.goldBright, GRN = "#22c55e", RED = "#ef4444", BLUE = "#6aa8ff";

  const redraw = useCallback(() => {
    const cv = canvasRef.current, chart = chartRef.current, s = seriesRef.current; if (!cv || !chart || !s) return;
    const ctx = cv.getContext("2d"); const w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight; ctx.clearRect(0, 0, w, h);
    const ts = chart.timeScale(); const X = (t) => ts.timeToCoordinate(t), Y = (p) => s.priceToCoordinate(p);
    const line = (x1, y1, x2, y2, color) => { ctx.strokeStyle = color; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    for (const d of drawingsRef.current) {
      const y = Y(d.p1.price); if (y == null) continue;
      if (d.type === "hline") { line(0, y, w, y, GOLD); ctx.fillStyle = GOLD; ctx.font = "10px " + font; ctx.fillText(d.p1.price.toFixed(2), 4, y - 4); }
      else if (d.type === "hray") { const x = X(d.p1.t); if (x != null) { line(x, y, w, y, GOLD); ctx.fillStyle = GOLD; ctx.font = "10px " + font; ctx.fillText(d.p1.price.toFixed(2), x + 4, y - 4); } }
      else if (d.type === "trend" && d.p2) { const x1 = X(d.p1.t), y1 = Y(d.p1.price), x2 = X(d.p2.t), y2 = Y(d.p2.price); if (x1 != null && x2 != null && y1 != null && y2 != null) line(x1, y1, x2, y2, BLUE); }
    }
  }, [font, GOLD, BLUE]);

  useEffect(() => {
    let dead = false; setStatus("loading");
    const start = new Date(iso(trade.entry)); start.setDate(start.getDate() - (tf === "1day" ? 40 : 6));
    const end = new Date(iso(trade.exit) || iso(trade.entry)); end.setDate(end.getDate() + (tf === "1day" ? 12 : 3));
    const f = start.toISOString().slice(0, 10), t = end.toISOString().slice(0, 10);
    const useSample = () => { const c = genSample(trade, tf); if (!c.length) { setStatus("empty"); return; } barsRef.current = c; setScrub(c.length); scrubRef.current = c.length; setSample(true); setStatus("ok"); };
    fetch(`/api/candles?symbol=${encodeURIComponent(trade.ticker)}&from=${f}&to=${t}&res=${tf}`)
      .then(r => r.json()).then(j => { if (dead) return; const candles = (j.candles || []).map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })); if (!candles.length) { useSample(); return; } barsRef.current = candles; setSample(false); setScrub(candles.length); scrubRef.current = candles.length; setStatus("ok"); })
      .catch(() => { if (!dead) useSample(); });
    return () => { dead = true; };
  }, [trade.ticker, trade.entry, trade.exit, tf]);

  useEffect(() => {
    if (status !== "ok") return; const LWC = window.LightweightCharts; if (!LWC || !wrapRef.current) { setStatus("nolib"); return; }
    wrapRef.current.innerHTML = "";
    const chart = LWC.createChart(wrapRef.current, { layout: { background: { color: "#0e0e16" }, textColor: "rgba(255,255,255,0.62)", fontFamily: font }, grid: { vertLines: { color: "rgba(255,255,255,0.05)" }, horzLines: { color: "rgba(255,255,255,0.05)" } }, rightPriceScale: { borderColor: "rgba(255,255,255,0.12)" }, timeScale: { borderColor: "rgba(255,255,255,0.12)", timeVisible: tf !== "1day", secondsVisible: false }, crosshair: { mode: 0 }, height: wrapRef.current.clientHeight || 440 });
    chartRef.current = chart;
    const s = chart.addCandlestickSeries({ upColor: GRN, downColor: RED, wickUpColor: GRN, wickDownColor: RED, borderVisible: false }); seriesRef.current = s;
    const bars = barsRef.current; s.setData(bars.slice(0, scrubRef.current));
    const closes = bars.map(b => b.close), e9 = ema(closes, 9), e21 = ema(closes, 21);
    const l9 = chart.addLineSeries({ color: GOLD, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    const l21 = chart.addLineSeries({ color: BLUE, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
    l9.setData(bars.map((b, i) => ({ time: b.time, value: e9[i] })).slice(0, scrubRef.current));
    l21.setData(bars.map((b, i) => ({ time: b.time, value: e21[i] })).slice(0, scrubRef.current));
    chart._l9 = l9; chart._l21 = l21; chart._e9 = e9; chart._e21 = e21;
    const isLong = (trade.tradeType || "Long") !== "Short";
    const entryP = Number(trade.entryP) || 0, exitP = Number(trade.exitP) || 0, stopP = Number(trade.stop) || 0, up = (Number(trade.plDollar) || 0) >= 0;
    // Events vs levels: entry/exit are point-in-time EVENTS → arrow markers at the fill bar ONLY.
    // Drawing them ALSO as full-width pricelines doubled every fill visually (member-reported —
    // a breakeven trade looked like "two entries and two exits"). Only the STOP is a standing
    // LEVEL, so only the stop keeps a horizontal line.
    if (stopP) s.createPriceLine({ price: stopP, color: RED, lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: "stop " + stopP });
    const nearest = (dstr) => { const target = new Date(iso(dstr)).getTime() / 1000; let b = bars[0], best = 1e18; for (const c of bars) { const d = Math.abs(c.time - target); if (d < best) { best = d; b = c; } } return b; };
    const marks = [];
    if (trade.entry) marks.push({ time: nearest(trade.entry).time, position: isLong ? "belowBar" : "aboveBar", color: GOLD, shape: isLong ? "arrowUp" : "arrowDown", text: "ENTRY " + entryP.toFixed(2) });
    if (trade.exit) marks.push({ time: nearest(trade.exit).time, position: isLong ? "aboveBar" : "belowBar", color: up ? GRN : RED, shape: isLong ? "arrowDown" : "arrowUp", text: "EXIT " + exitP.toFixed(2) });
    marks.sort((a, b) => a.time - b.time); s._marks = marks;
    s.setMarkers(scrubRef.current >= bars.length ? marks : marks.filter(m => bars.findIndex(b => b.time === m.time) < scrubRef.current));
    chart.timeScale().fitContent();
    const onRange = () => redraw(); chart.timeScale().subscribeVisibleTimeRangeChange(onRange);
    const ro = new ResizeObserver(() => { chart.applyOptions({ height: wrapRef.current.clientHeight }); redraw(); }); ro.observe(wrapRef.current); redraw();
    return () => { try { ro.disconnect(); chart.remove(); } catch (e) {} chartRef.current = null; seriesRef.current = null; };
  }, [status, tf, font, redraw, trade, GOLD, BLUE]);

  useEffect(() => {
    const s = seriesRef.current, chart = chartRef.current; if (!s || !chart) return; const bars = barsRef.current, n = scrub;
    s.setData(bars.slice(0, n));
    if (chart._l9) chart._l9.setData(bars.map((b, i) => ({ time: b.time, value: chart._e9[i] })).slice(0, n));
    if (chart._l21) chart._l21.setData(bars.map((b, i) => ({ time: b.time, value: chart._e21[i] })).slice(0, n));
    if (s._marks) { const upto = bars[n - 1] ? bars[n - 1].time : 0; s.setMarkers(s._marks.filter(m => m.time <= upto)); }
    const lb = bars[n - 1]; if (lb) { const dt = new Date(lb.time * 1000); setCurDate(tf === "1day" ? dt.toISOString().slice(0, 10) : dt.toISOString().slice(0, 16).replace("T", " ")); }
    redraw();
  }, [scrub, redraw, tf]);

  useEffect(() => {
    if (!playing) { if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; return; }
    timerRef.current = setInterval(() => { setScrub(prev => { const n = prev + 1; scrubRef.current = n; if (n >= barsRef.current.length) { setPlaying(false); return barsRef.current.length; } return n; }); }, speed);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, speed]);

  const onCanvasClick = (e) => {
    const chart = chartRef.current, s = seriesRef.current; if (!chart || !s) return; const T = toolRef.current; if (T === "cursor") return;
    const rect = canvasRef.current.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
    const price = s.coordinateToPrice(y), t = chart.timeScale().coordinateToTime(x); if (price == null) return;
    if (T === "hline") drawingsRef.current.push({ type: "hline", p1: { price } });
    else if (T === "hray") drawingsRef.current.push({ type: "hray", p1: { t, price } });
    else if (T === "trend") { if (!draftRef.current) { draftRef.current = { t, price }; return; } drawingsRef.current.push({ type: "trend", p1: draftRef.current, p2: { t, price } }); draftRef.current = null; }
    redraw();
  };

  // ── pills from trade data ──
  const entryP = Number(trade.entryP) || 0, exitP = Number(trade.exitP) || 0, stopP = Number(trade.stop) || 0, pl = Number(trade.plDollar) || 0, r = trade.rMult, sh = Number(trade.shares) || 0, up = pl >= 0;
  const Pill = ({ label, children }) => <span style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 9, padding: "7px 12px", fontSize: "0.76rem", color: C.muted, fontWeight: 600 }}>{label} {children}</span>;
  const b = (t, c) => <b style={{ color: c || "#fff", fontWeight: 800 }}>{t}</b>;
  const tBtn = (k, label, title) => <button title={title} onClick={() => setTool(k)} style={{ background: tool === k ? C.goldDim : "transparent", color: tool === k ? C.goldBright : C.muted, border: `1px solid ${tool === k ? C.borderGold : "transparent"}`, borderRadius: 7, padding: "5px 9px", fontFamily: font, fontSize: "0.7rem", fontWeight: 700, cursor: "pointer" }}>{label}</button>;

  return (
    <div style={{ fontFamily: font }}>
      {/* stat pills (alab-replay style) */}
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
          <button onClick={() => { drawingsRef.current = []; draftRef.current = null; redraw(); }} title="Clear drawings" style={{ background: "transparent", color: C.muted, border: "none", borderRadius: 7, padding: "5px 8px", fontFamily: font, fontSize: "0.7rem", fontWeight: 700, cursor: "pointer" }}>✕ Clear</button>
        </div>
      </div>
      {/* chart */}
      <div style={{ position: "relative", height: 440, borderRadius: 14, overflow: "hidden", border: `1px solid ${C.border}`, background: "#0e0e16" }}>
        <div ref={wrapRef} style={{ position: "absolute", inset: 0 }} />
        <canvas ref={canvasRef} onClick={onCanvasClick} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: tool === "cursor" ? "none" : "auto", cursor: tool === "cursor" ? "default" : "crosshair" }} />
        {status !== "ok" && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: C.muted, fontSize: "0.82rem" }}>{status === "loading" ? "Loading candles…" : status === "empty" ? `No candle data for ${trade.ticker}` : status === "nolib" ? "Chart engine not loaded" : "Couldn't load candles (check POLYGON_API_KEY)"}</div>}
        {status === "ok" && sample && <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(201,152,42,0.18)", border: `1px solid ${C.borderGold}`, color: C.goldBright, fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.05em", padding: "3px 8px", borderRadius: 6, pointerEvents: "none" }}>SAMPLE · live candles on deploy</div>}
      </div>
      {/* control bar (alab-replay style) */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", flexWrap: "wrap" }}>
        <button onClick={() => { if (scrub >= barsRef.current.length) { setScrub(1); scrubRef.current = 1; } setPlaying(p => !p); }} style={{ background: C.gold, color: "#1a1206", border: "none", borderRadius: 9, padding: "9px 18px", fontFamily: font, fontWeight: 800, fontSize: "0.86rem", cursor: "pointer" }}>{playing ? "⏸ Pause" : "▶ Play"}</button>
        <button onClick={() => { setPlaying(false); setScrub(1); scrubRef.current = 1; }} style={{ background: "rgba(255,255,255,0.06)", color: "#eee", border: "none", borderRadius: 9, padding: "9px 14px", fontFamily: font, fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" }}>⟲ Reset</button>
        <span style={{ fontWeight: 800, color: C.goldBright, minWidth: 118, fontSize: "0.82rem" }}>{curDate || "—"}</span>
        <input type="range" min={1} max={Math.max(1, barsRef.current.length)} value={scrub} onChange={e => { const n = +e.target.value; scrubRef.current = n; setScrub(n); }} style={{ flex: 1, minWidth: 160, accentColor: C.gold }} />
        <span style={{ display: "flex", alignItems: "center", gap: 6, color: C.muted, fontSize: "0.76rem" }}>speed
          <select value={speed} onChange={e => setSpeed(+e.target.value)} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: "#eee", borderRadius: 7, padding: "5px 8px", fontFamily: font, fontWeight: 700, fontSize: "0.74rem" }}>
            <option value={360}>1×</option><option value={180}>2×</option><option value={80}>4×</option>
          </select>
        </span>
      </div>
      {/* legend */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 10, color: C.muted, fontSize: "0.72rem" }}>
        <span><i style={{ display: "inline-block", width: 10, height: 2, background: C.goldBright, verticalAlign: "middle", marginRight: 5 }} />EMA9</span>
        <span><i style={{ display: "inline-block", width: 10, height: 2, background: BLUE, verticalAlign: "middle", marginRight: 5 }} />EMA21</span>
        <span style={{ color: C.goldBright, fontWeight: 700 }}>▲ entry</span>
        <span style={{ color: up ? GRN : RED, fontWeight: 700 }}>▼ exit</span>
        <span style={{ marginLeft: "auto", fontStyle: "italic" }}>TradingView Lightweight-Charts · your fills plotted · ▶ replays candle-by-candle</span>
      </div>
    </div>
  );
}
