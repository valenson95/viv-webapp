import React, { useEffect, useState } from "react";

// ── Market Context card ───────────────────────────────────────────────────────
// SPY + QQQ read directly below the Theme Tracker strip: where each index trades
// vs its 10/20/50/200-day MAs, plus the ATR%-Multiple-from-50MA (same extension
// math as the position badges: ((P − SMA50)/SMA50) ÷ (ATR14/P), Wilder ATR).
// Data: /api/candles (Polygon daily, 10-min server cache) — always current, the
// "as of" label shows members exactly how fresh the read is. Commentary is
// generated deterministically from the numbers so it can never drift from them.

const BANDS = [
  { min: 4, label: "No new risk", color: "#ef4444", dim: "rgba(239,68,68,0.14)", border: "rgba(239,68,68,0.38)", tip: "Very stretched — 4+ daily ranges above the 50-day line. Markets usually snap back from around 5×. Not the time to open new positions." },
  { min: 2, label: "Selective", color: "#f0c050", dim: "rgba(240,192,80,0.12)", border: "rgba(240,192,80,0.35)", tip: "Stretched. New buys need extra-strong setups and smaller size." },
  { min: 0, label: "Fresh", color: "#22c55e", dim: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.32)", tip: "A healthy distance above the 50-day line — normal conditions for new buys." },
  { min: -Infinity, label: "Repair zone", color: "#60a5fa", dim: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.35)", tip: "At or under the 50-day line. The strongest buy days often come when the index bounces off a rising 50-day line." },
];
const bandFor = (ext) => BANDS.find(b => ext >= b.min) || BANDS[BANDS.length - 1];

function computeCtx(sym, candles) {
  const c = candles.map(b => b.close), h = candles.map(b => b.high), l = candles.map(b => b.low);
  const n = c.length;
  const P = c[n - 1];
  const sma = (k) => c.slice(n - k).reduce((s, v) => s + v, 0) / k;
  const trs = [];
  for (let i = 1; i < n; i++) trs.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  let atr = trs.slice(0, 14).reduce((s, v) => s + v, 0) / 14;
  for (let i = 14; i < trs.length; i++) atr = (atr * 13 + trs[i]) / 14;
  const s50 = sma(50);
  const ext = ((P - s50) / s50) / (atr / P);
  const mas = [10, 20, 50, 200].map(k => ({ k, v: sma(k), above: P > sma(k) }));
  // Market condition vs the 21-day EMA (Valen's definition, 2026-07-10):
  //   TRENDING  = closed ABOVE the EMA21 for 10+ straight sessions
  //   DOWNTREND = closed BELOW the EMA21 for 10+ straight sessions
  //   CHOPPY    = neither — price crossing the EMA21 within the last 10 sessions
  const k21 = 2 / 22; let e21 = null; const above21 = [];
  for (let i = 0; i < n; i++) {
    if (i < 20) continue;
    e21 = i === 20 ? c.slice(0, 21).reduce((s, x) => s + x, 0) / 21 : c[i] * k21 + e21 * (1 - k21);
    above21.push(c[i] > e21);
  }
  let streak = 0; const side = above21[above21.length - 1];
  for (let i = above21.length - 1; i >= 0 && above21[i] === side; i--) streak++;
  const regime = streak >= 10 ? (side ? "trend" : "down") : "chop";
  const asof = new Date(candles[n - 1].time * 1000).toISOString().slice(0, 10);
  return { sym, price: P, mas, ext, asof, regime, streak, side, ema21: e21 };
}

const REGIME_META = {
  trend: { icon: "📈", label: "Trending", color: "#22c55e", dim: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.3)" },
  chop: { icon: "🌊", label: "Choppy", color: "#f0c050", dim: "rgba(240,192,80,0.10)", border: "rgba(240,192,80,0.3)" },
  down: { icon: "📉", label: "Downtrend", color: "#ef4444", dim: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.28)" },
};
const regimeTip = (r) => {
  const now = r.regime === "chop"
    ? `Right now: price has crossed the EMA21 within the last 10 sessions (current streak: ${r.streak} ${r.side ? "above" : "below"}).`
    : `Right now: ${r.streak} straight sessions ${r.side ? "ABOVE" : "BELOW"} the EMA21${r.ema21 ? ` (${r.ema21.toFixed(2)})` : ""}.`;
  return `Market condition, anchored to the 21-day EMA over the past 10 trading sessions — Trending: closed above the EMA21 for 10+ straight sessions. Downtrend: closed below it for 10+ straight sessions. Choppy: neither — hovering up and down through the line. ${now} Breakouts carry the best odds in a Trending tape; a Choppy tape fades them; a Downtrend is swimming upstream.`;
};

const SAMPLE = [
  { sym: "SPY", price: 747.71, ext: 0.91, asof: "2026-07-07", mas: [{ k: 10, v: 740.74, above: true }, { k: 20, v: 741.29, above: true }, { k: 50, v: 739.01, above: true }, { k: 200, v: 693.19, above: true }] },
  { sym: "QQQ", price: 709.43, ext: -0.14, asof: "2026-07-07", mas: [{ k: 10, v: 717.77, above: false }, { k: 20, v: 720.43, above: false }, { k: 50, v: 711.66, above: false }, { k: 200, v: 636.18, above: true }] },
];

export default function MarketContext({ C, font, defaultExpanded = false }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  // Collapsed by default; a call site can flip the default with defaultExpanded. A member's own
  // toggle (persisted) always wins over either default.
  const [collapsed, setCollapsed] = useState(() => { try { const s = localStorage.getItem("viv-mktctx-collapsed"); return s != null ? s !== "0" : !defaultExpanded; } catch { return !defaultExpanded; } });
  const toggleCollapsed = () => setCollapsed(c => { const n = !c; try { localStorage.setItem("viv-mktctx-collapsed", n ? "1" : "0"); } catch {} return n; });
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const to = new Date().toISOString().slice(0, 10);
        const from = new Date(Date.now() - 420 * 86400000).toISOString().slice(0, 10);
        const out = [];
        for (const sym of ["SPY", "QQQ"]) {
          const r = await fetch(`/api/candles?symbol=${sym}&from=${from}&to=${to}&res=1day`);
          const j = await r.json();
          if (!j.ok || !j.candles || j.candles.length < 210) throw new Error(j.error || `${sym}: insufficient data`);
          out.push(computeCtx(sym, j.candles));
        }
        if (!dead) setRows(out);
      } catch (e) {
        // Local dev has no /api — render the labeled sample so the layout is checkable.
        if (!dead) { if (import.meta.env.DEV) { setRows(SAMPLE); setErr("sample"); } else setErr(String(e.message || e)); }
      }
    })();
    return () => { dead = true; };
  }, []);

  if (err && err !== "sample" && !rows) return null; // quiet fail — never break the dashboard
  const chip = (m) => (
    <span key={m.k} className="term" data-tip={`${m.k}-day moving average: ${m.v.toFixed(2)}. Price is ${m.above ? "above" : "below"} it.`} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 7px", borderRadius: 7, fontSize: "0.62rem", fontWeight: 700, whiteSpace: "nowrap", cursor: "help", background: m.above ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)", border: `1px solid ${m.above ? "rgba(34,197,94,0.28)" : "rgba(239,68,68,0.26)"}`, color: m.above ? "var(--green, #22c55e)" : "var(--red, #ef4444)" }}>
      {m.k}d {m.above ? "▲" : "▼"}
    </span>
  );
  return (
    <div className="card" style={{ padding: "12px 16px", marginBottom: 12 }}>
      <div onClick={toggleCollapsed} title={collapsed ? "Expand Market Context" : "Collapse Market Context"} aria-expanded={!collapsed}
        style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: collapsed ? 0 : 10, flexWrap: "wrap", cursor: "pointer", userSelect: "none" }}>
        <span style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold }}>Market Context</span>
        <span className="infodot" onClick={(e) => e.stopPropagation()} data-tip="Is the market at a good buy spot, or stretched? Green chips = the index is above that moving average. The ×-multiple is how far it's run above its 50-day line — under 2× there's room, 4×+ is stretched, go easy on new buys. SPY is the broad market; QQQ is the growth tape where breakouts live — trade smaller when it's below its short-term MAs.">i</span>
        <span style={{ marginLeft: "auto", fontSize: "0.58rem", color: C.faint || C.muted }}>
          {rows ? (err === "sample" ? "sample data (dev)" : `as of ${rows[0].asof} close`) : "loading…"}
        </span>
        <span aria-hidden style={{ color: C.gold, fontSize: "1.05rem", lineHeight: 1, alignSelf: "center", transition: "transform .2s", transform: collapsed ? "rotate(-90deg)" : "none" }}>▾</span>
      </div>
      {/* collapsed = the simple read: price · market condition · extension per index, one line */}
      {collapsed && rows && (
        <div onClick={toggleCollapsed} style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", paddingTop: 8, cursor: "pointer" }}>
          {rows.map(r => {
            const b = bandFor(r.ext), g = REGIME_META[r.regime];
            return (
              <span key={r.sym} style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <b style={{ fontSize: "0.76rem", color: "var(--text, #fff)" }}>{r.sym}</b>
                <span style={{ fontSize: "0.72rem", color: "var(--text, #fff)", fontVariantNumeric: "tabular-nums" }}>{r.price.toFixed(2)}</span>
                {g && <span style={{ fontSize: "0.64rem", fontWeight: 700, color: g.color, whiteSpace: "nowrap" }}>{g.icon} {g.label}</span>}
                <span style={{ fontSize: "0.64rem", fontWeight: 800, color: b.color, whiteSpace: "nowrap" }}>{(r.ext >= 0 ? "" : "−") + Math.abs(r.ext).toFixed(1)}× · {b.label}</span>
              </span>
            );
          })}
          <span style={{ fontSize: "0.6rem", color: C.muted, marginLeft: "auto" }}>expand for the full read ▸</span>
        </div>
      )}
      {collapsed ? null : !rows ? (
        <div style={{ fontSize: "0.68rem", color: C.muted, padding: "6px 0" }}>Loading index data…</div>
      ) : (
        <>
          {rows.map(r => {
            const b = bandFor(r.ext);
            return (
              <div key={r.sym} style={{ padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <b style={{ fontSize: "0.84rem", color: "var(--text, #fff)" }}>{r.sym}</b>
                  <span style={{ fontSize: "0.76rem", color: "var(--text, #fff)", fontVariantNumeric: "tabular-nums" }}>{r.price.toFixed(2)}</span>
                  {r.regime && (() => { const g = REGIME_META[r.regime]; return (
                    <span className="term" data-tip={regimeTip(r)} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 9, fontSize: "0.66rem", fontWeight: 800, cursor: "help", background: g.dim, border: `1px solid ${g.border}`, color: g.color, whiteSpace: "nowrap" }}>
                      {g.icon} {g.label} Market <span style={{ fontWeight: 700, opacity: 0.75, fontSize: "0.58rem" }}>· {r.streak} trading session{r.streak === 1 ? "" : "s"} {r.side ? "above" : "below"} EMA21{r.regime === "chop" ? " (needs 10 to trend)" : ""}</span>
                    </span>
                  ); })()}
                  <span className="term tipright" data-tip={b.tip} style={{ marginLeft: "auto", display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 1, padding: "4px 10px", borderRadius: 9, cursor: "help", background: b.dim, border: `1px solid ${b.border}`, color: b.color }}>
                    <span style={{ fontSize: "0.68rem", fontWeight: 800, whiteSpace: "nowrap" }}>{(r.ext >= 0 ? "" : "−") + Math.abs(r.ext).toFixed(1)}× · {b.label}</span>
                    <span style={{ fontSize: "0.5rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.75, whiteSpace: "nowrap" }}>ATR% Mult from 50-MA</span>
                  </span>
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>{r.mas.map(chip)}</div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
