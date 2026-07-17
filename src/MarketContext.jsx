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

// Plain-English one-liner per index, built from the numbers only.
function readFor(r) {
  const above = r.mas.filter(m => m.above).map(m => m.k + "d");
  const below = r.mas.filter(m => !m.above).map(m => m.k + "d");
  const stack = above.length === 4 ? "above its full 10/20/50/200-day MA stack"
    : below.length === 4 ? "below all of its 10/20/50/200-day MAs"
    : `above the ${above.join("/")} MA${above.length > 1 ? "s" : ""}, below the ${below.join("/")}`;
  const b = bandFor(r.ext);
  const extTxt = `${r.ext >= 0 ? "" : "−"}${Math.abs(r.ext).toFixed(1)}× ATR from the 50-day`;
  const tail = b.label === "No new risk" ? " — very stretched; go easy on new buys."
    : b.label === "Selective" ? " — stretched; be picky with fresh buys."
    : b.label === "Fresh" ? " — room to work."
    : " — recovery zone; watch for it to climb back above its short-term averages.";
  return `${r.sym} trades ${stack} at ${extTxt}${tail}`;
}

const SAMPLE = [
  { sym: "SPY", price: 747.71, ext: 0.91, asof: "2026-07-07", mas: [{ k: 10, v: 740.74, above: true }, { k: 20, v: 741.29, above: true }, { k: 50, v: 739.01, above: true }, { k: 200, v: 693.19, above: true }] },
  { sym: "QQQ", price: 709.43, ext: -0.14, asof: "2026-07-07", mas: [{ k: 10, v: 717.77, above: false }, { k: 20, v: 720.43, above: false }, { k: 50, v: 711.66, above: false }, { k: 200, v: 636.18, above: true }] },
];

export default function MarketContext({ C, font }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("viv-mktctx-collapsed") === "1"; } catch { return false; } });
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
        {!collapsed && <button onClick={(e) => { e.stopPropagation(); setShowInfo(v => !v); }} style={{ background: "transparent", border: "none", padding: 0, fontFamily: font, fontSize: "0.6rem", color: C.muted, cursor: "pointer", borderBottom: "1px dotted var(--borderGold, rgba(201,152,42,0.4))" }}>{showInfo ? "hide ✕" : "what is this?"}</button>}
        <span style={{ marginLeft: "auto", fontSize: "0.58rem", color: C.faint || C.muted }}>
          {rows ? (err === "sample" ? "sample data (dev)" : `as of ${rows[0].asof} close`) : "loading…"}
        </span>
        <span aria-hidden style={{ color: C.gold, fontSize: "1.05rem", lineHeight: 1, alignSelf: "center", transition: "transform .2s", transform: collapsed ? "rotate(-90deg)" : "none" }}>▾</span>
      </div>
      {!collapsed && showInfo && (
        <div style={{ fontSize: "0.68rem", color: "var(--text, #eee)", lineHeight: 1.6, background: "rgba(201,152,42,0.06)", border: "1px solid var(--borderGold, rgba(201,152,42,0.3))", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
          This card tells you one thing: <b>are you buying stocks while the market is stretched, or at a good spot?</b><br />
          The arrows show whether SPY and QQQ are above (🟢) or below (🔴) each of their key moving averages.
          The badge shows how far the index has run above its 50-day line, measured in daily ranges — the <b>ATR% Multiple from the 50-MA</b>, the same number as the extension badges on your positions.
          A low number means the market has room. A high number (4×+) means it's stretched — historically pullbacks start around 5×, so go easy on new buys there.<br />
          The <b>condition badge</b> anchors to the <b>21-day EMA over the past 10 trading sessions</b>: <b style={{ color: "#22c55e" }}>Trending</b> = closed above the EMA21 for 10+ straight sessions · <b style={{ color: "#ef4444" }}>Downtrend</b> = below it for 10+ straight sessions · <b style={{ color: "#f0c050" }}>Choppy</b> = neither, price hovering through the line. It's the same definition your Objective Edge "market context" dimension uses — so the dashboard read and your stats speak one language.<br />
          <span style={{ color: C.muted }}>Tip: toggle on <b>Guided</b> mode (top of the page) and hover anything on the dashboard for more plain-English explanations.</span>
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
          <div style={{ fontSize: "0.66rem", color: C.muted, lineHeight: 1.55, paddingTop: 9, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            {rows.map(r => readFor(r)).join(" ")}
          </div>
        </>
      )}
    </div>
  );
}
