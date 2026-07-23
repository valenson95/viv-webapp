import React, { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MARKET_MONITOR } from "./marketMonitor-data.js";
import { InfoDot } from "./GroupRS.jsx";
import { LensCamera } from "./capture.jsx";

// ── BREADTH — market monitor ─────────────────────────────────────────────────
// A market-breadth "weather station": how many stocks moved 4%+ up vs down today,
// plus longer-horizon ±25% counts. It answers ONE question — are breakouts likely
// to work right now? — it never picks the stock. Member-safe: the page renders for
// any logged-in user; the citation/provenance ("Signal read" + "Method") cards are
// ADMIN-ONLY. Educational, not advice.
//
// THE FOUR COLUMNS (systematic read): documented in
//   trading/research/stockbee-sources/49-...md §4 —
//   "All 4 columns GREEN → good time to buy breakouts. Any one RED → choppy →
//    breakouts fail." Our data holds two ±25% pairs (month, quarter); we colour
//   each horizon GREEN when its up-count exceeds its down-count (buyers outnumber
//   sellers on that horizon) — our plain-arithmetic reading of the documented rule.
// OTHER CORPUS CITATIONS:
//   [A] 22-market-monitor-numbers.md:107 — "extreme breadth happens near turns".
//   [B] pradeep-bonde.md:512 (stockbee file 58) — "300+ down-4% days cut win rate".

const ADMIN_EMAIL = "vc-lv@live.com";

const num = (v, d = 0) => v == null || !isFinite(v) ? "—" : (+v).toFixed(d);
const rat = (v) => v == null || !isFinite(v) ? "—" : (+v).toFixed(2);

// ── systematic four-column read (shared by page + mini) ──────────────────────
const GREEN = { fg: "#7ef0a0", bg: "rgba(34,197,94,0.12)", bd: "rgba(34,197,94,0.35)" };
const AMBER = { fg: "#f0c050", bg: "rgba(201,152,42,0.14)", bd: "rgba(201,152,42,0.4)" };
const RED = { fg: "#fca5a5", bg: "rgba(239,68,68,0.12)", bd: "rgba(239,68,68,0.35)" };

// ── EXACT sheet-cell colouring — thresholds lifted verbatim from the source workbook's own
//    conditional-formatting rules (extracted 2026-07-23); hues adapted for the dark theme.
const CF = {
  gStrong: { background: "rgba(51,153,102,0.55)", color: "#eafff3", fontWeight: 800 },
  g:       { background: "rgba(34,197,94,0.26)",  color: "#b7f7c8" },
  olive:   { background: "rgba(106,168,79,0.62)", color: "#f2ffe9", fontWeight: 800 },
  rStrong: { background: "rgba(224,102,102,0.55)", color: "#ffecec", fontWeight: 800 },
  r:       { background: "rgba(224,102,102,0.26)", color: "#ffd9d9" },
  pink:    { background: "rgba(244,204,204,0.14)", color: "#eec9c9" },
  yellow:  { background: "rgba(255,255,0,0.18)",  color: "#fff3a8", fontWeight: 700 },
};
function sheetCF(row, key) {
  const v = row[key]; if (v == null) return null;
  const b = row.up4, c = row.down4, f = row.up25q, g = row.down25q,
        h = row.up25m, i = row.down25m, l = row.up13d34, m = row.down13d34;
  switch (key) {
    case "up4":     return c > b ? CF.pink : v >= 300 ? CF.gStrong : b > c ? CF.g : null;
    case "down4":   return v > 299 ? CF.rStrong : b > c ? CF.g : c > b ? CF.pink : null;
    case "r5":      return v > 2 ? CF.g : v < 0.5 ? CF.r : null;
    case "r10":     return v >= 2 ? CF.g : v < 0.5 ? CF.r : null;
    case "up25q":   return v <= 200 ? CF.olive : f > g ? CF.g : f < g ? CF.r : null;
    case "down25q": return v <= 200 ? CF.yellow : f > g ? CF.g : f < g ? CF.r : null;
    case "up25m": case "down25m":     return h > i ? CF.g : h < i ? CF.r : null;
    case "up50m":   return v >= 20 ? CF.rStrong : v < 2 ? CF.g : null;
    case "down50m": return v > 19 ? CF.g : null;
    case "up13d34": case "down13d34": return l > m ? CF.g : l < m ? CF.r : null;
    case "t2108":   return v < 20 ? CF.g : v > 79.99 ? CF.r : null;
    default: return null;
  }
}
function cellTip(row, key) {
  const v = row[key]; if (v == null) return undefined;
  if (key === "up25q" && v <= 200) return "≤200 stocks up 25% on the quarter = capitulation zone — contrarian, historically extremely bullish";
  if (key === "down25q" && v <= 200) return "≤200 decliners on the quarter = extended tape — caution";
  if (key === "up50m" && v >= 20) return "≥20 stocks up 50% in a month = froth / climax — contrarian warning";
  if (key === "down50m" && v > 19) return ">19 stocks down 50% in a month = capitulation — contrarian bullish";
  if (key === "down4" && v > 299) return "300+ stocks down 4% = selling extreme";
  if (key === "up4" && v >= 300) return "300+ stocks up 4% = breakout thrust day";
  if (key === "t2108") return v < 20 ? "T2108 under 20 = washed out — opportunity zone" : v > 79.99 ? "T2108 over 80 = overbought" : undefined;
  return undefined;
}

// ── Traffic-light calendar: each session GREEN (up-25%/qtr leaders outnumber decliners) or RED.
function TrafficCalendar({ C, rows }) {
  const days = rows.filter(r => r.date && r.up25q != null && r.down25q != null)
    .map(r => ({ date: r.date, v: r.up25q > r.down25q ? "g" : r.up25q < r.down25q ? "r" : "n", f: r.up25q, g: r.down25q }));
  if (!days.length) return null;
  const last = days[days.length - 1];
  let streak = 1;
  for (let i = days.length - 2; i >= 0 && days[i].v === last.v; i--) streak++;
  const months = {};
  days.forEach(d => { (months[d.date.slice(0, 7)] = months[d.date.slice(0, 7)] || []).push(d); });
  const mkeys = Object.keys(months).sort();
  { // pad with the not-yet-traded months through December of the latest data year
    const [ly, lm] = mkeys[mkeys.length - 1].split("-").map(Number);
    for (let m = lm + 1; m <= 12; m++) mkeys.push(`${ly}-${String(m).padStart(2, "0")}`);
  }
  const MN = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const green = last.v === "g";
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontSize: "0.85rem", fontWeight: 800, padding: "6px 14px", borderRadius: 99, color: green ? "#0a2413" : "#2a0c0c", background: green ? "#4ade80" : "#f87171" }}>
          {green ? "● GREEN" : "● RED"} · {streak} session{streak > 1 ? "s" : ""} and counting
        </span>
        <span style={{ fontSize: "0.68rem", color: C.muted }}>
          {green ? "Environment is paying longs — setups are allowed to work." : "Environment is against longs — protect first, anticipate nothing."}
        </span>
      </div>
      <div style={{ display: "flex", gap: 18, overflowX: "auto", paddingBottom: 4 }}>
        {mkeys.map(mk => {
          const [Y, M] = mk.split("-").map(Number);
          const first = new Date(Date.UTC(Y, M - 1, 1)).getUTCDay();
          const dim = new Date(Date.UTC(Y, M, 0)).getUTCDate();
          const byDate = {}; (months[mk] || []).forEach(d => { byDate[d.date] = d; });
          const cells = [];
          for (let dayN = 1; dayN <= dim; dayN++) {
            const dt = new Date(Date.UTC(Y, M - 1, dayN)); const wd = dt.getUTCDay();
            if (wd < 1 || wd > 5) continue;
            const iso = `${Y}-${String(M).padStart(2, "0")}-${String(dayN).padStart(2, "0")}`;
            const d = byDate[iso];
            const col = Math.floor((dayN + first - 1) / 7);
            cells.push(
              <div key={iso}
                title={d ? `${iso} — ${d.v === "g" ? "GREEN" : d.v === "r" ? "RED" : "flat"} · up 25%/qtr ${d.f} vs down ${d.g}` : `${iso} — no session data`}
                style={{
                  gridRow: wd, gridColumn: col + 1, width: 27, height: 23, borderRadius: 4,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.62rem", fontWeight: 700, fontVariantNumeric: "tabular-nums",
                  background: d ? (d.v === "g" ? "rgba(34,197,94,0.8)" : d.v === "r" ? "rgba(239,68,68,0.78)" : "rgba(255,255,255,0.16)") : "rgba(255,255,255,0.025)",
                  color: d ? "#08080e" : "rgba(255,255,255,0.28)",
                  border: d ? "none" : `1px solid ${C.border}`,
                  outline: d && d.date === last.date ? `2px solid ${C.goldBright}` : "none", outlineOffset: 1,
                }}>{dayN}</div>
            );
          }
          return (
            <div key={mk} style={{ flex: "none" }}>
              <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", color: C.text, marginBottom: 6, textAlign: "center" }}>{MN[M - 1]}<span style={{ color: C.muted, fontWeight: 700 }}> ’{String(Y).slice(2)}</span></div>
              <div style={{ display: "grid", gridTemplateRows: "repeat(5, 23px)", gridAutoColumns: "27px", gap: 3 }}>
                {cells}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: C.text }}>
          <span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: "rgba(34,197,94,0.8)", marginRight: 6, verticalAlign: "-1px" }} />
          Green = bullish — buyers in control, trade your setups
        </span>
        <span style={{ fontSize: "0.7rem", fontWeight: 700, color: C.text }}>
          <span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: "rgba(239,68,68,0.78)", marginRight: 6, verticalAlign: "-1px" }} />
          Red = bearish — sellers in control, protect capital
        </span>
        <span style={{ fontSize: "0.7rem", color: C.muted }}>
          Think of it as the market's weather report — <b style={{ color: C.goldBright }}>plan your trading accordingly</b>: press when it's been green, stay light when it's red.
        </span>
      </div>
    </>
  );
}

function readBreadth(L) {
  const mUp = L.up25m, mDn = L.down25m, qUp = L.up25q, qDn = L.down25q, up4 = L.up4, down4 = L.down4;
  const mGreen = mUp != null && mDn != null ? mUp > mDn : false;
  const qGreen = qUp != null && qDn != null ? qUp > qDn : false;
  const heavy = down4 != null && down4 >= 300;
  // page verdict chip (round-2 doctrine wording; down-4% ≥ 300 overrides to red)
  let verdict;
  if (heavy) verdict = { ...RED, txt: "Heavy selling — protect capital" };
  else if (mGreen && qGreen) verdict = { ...GREEN, txt: "Supportive — breakouts have a tailwind" };
  else verdict = { ...AMBER, txt: "Mixed / choppy — breakouts struggle" };
  // plain-English verdict — breadth-trader voice, descriptive only, never an instruction.
  // Phrase library keyed on the read; the heavy-liquidation line overrides everything.
  const nGreen = (mGreen ? 1 : 0) + (qGreen ? 1 : 0);
  let sentence;
  if (heavy) sentence = "Heavy liquidation day — 300+ stocks down 4%+. Extremes like this tend to show up near turns.";
  else if (nGreen === 2) sentence = "Buyers are in control — winners outnumber losers across the month and the quarter.";
  else if (nGreen === 0) sentence = "Selling pressure dominates — more stocks are getting hit hard than moving up. Breakouts have no tailwind.";
  else { const g = mGreen ? "month" : "quarter", r = mGreen ? "quarter" : "month"; sentence = `A split tape — strength on the ${g}, but the ${r} is still churning. Chop.`; }
  // breakout-conditions read — the master-switch doctrine (stockbee-sources/49 §4: "All 4 columns
  // GREEN → good time to buy breakouts. Any one RED → choppy → breakouts fail."). Plain binary
  // (Valen 2026-07-19): both horizons green AND no heavy-selling extreme → MORE likely; anything
  // else → LESS likely. The word MORE/LESS carries the colour; the rest stays neutral.
  const breakouts = { more: !heavy && mGreen && qGreen };
  return { mUp, mDn, qUp, qDn, mGreen, qGreen, heavy, verdict, sentence, breakouts };
}

// one horizon block: green/red by whether buyers outnumber sellers on that horizon.
function HorizonBlock({ C, title, up, dn, green }) {
  const tone = green ? GREEN : RED;
  return (
    <div style={{ padding: "12px 14px", borderRadius: 12, background: tone.bg, border: `1px solid ${tone.bd}` }}>
      <div style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: tone.fg, marginBottom: 9 }}>{title} · {green ? "buyers lead" : "sellers lead"}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ textAlign: "left" }}>
          <div style={{ fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: C.muted, marginBottom: 3 }}>Up 25%+</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#86efac", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{num(up)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "0.55rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: C.muted, marginBottom: 3 }}>Down 25%+</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#fca5a5", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{num(dn)}</div>
        </div>
      </div>
    </div>
  );
}

export default function MarketMonitor({ C, font, session }) {
  const isAdmin = (session?.user?.email || "").toLowerCase() === ADMIN_EMAIL;
  const [showAll, setShowAll] = useState(false);
  const [signalOpen, setSignalOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);

  // multi-sort chain (default: date desc)
  const DEFAULT_CHAIN = [{ key: "date", dir: "desc" }];
  const [chain, setChain] = useState(DEFAULT_CHAIN);
  const SUP = ["¹", "²", "³"];
  const clickSort = (key) => {
    setChain(prev => {
      if (prev[0] && prev[0].key === key) { const n = [...prev]; n[0] = { key, dir: n[0].dir === "desc" ? "asc" : "desc" }; return n; }
      const rest = prev.filter(c => c.key !== key);
      return [{ key, dir: "desc" }, ...rest].slice(0, 3);
    });
  };
  const isDefaultChain = chain.length === 1 && chain[0].key === "date" && chain[0].dir === "desc";

  const asof = MARKET_MONITOR?.asof || "—";
  const refreshedFull = MARKET_MONITOR?.refreshed;
  const asofStamp = refreshedFull && refreshedFull !== asof ? `as of ${asof} · updated ${refreshedFull}` : `as of ${asof}`;
  const source = MARKET_MONITOR?.source || "sheet";
  const cols = MARKET_MONITOR?.cols || [];
  const allRows = MARKET_MONITOR?.rows || [];
  const fc = MARKET_MONITOR?.formulaCheck || {};
  const latest = allRows[allRows.length - 1] || {};
  const read = readBreadth(latest);
  const rootRef = useRef(null);

  const cardLabel = { fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: C.gold };
  const asofStyle = { fontSize: "0.62rem", fontWeight: 700, color: C.goldBright, fontVariantNumeric: "tabular-nums", textAlign: "right" };

  const SHORT = {
    date: "Date", up4: "Up 4%", down4: "Down 4%", r5: "5d ratio", r10: "10d ratio",
    up25q: "Up 25%/Q", down25q: "Dn 25%/Q", up25m: "Up 25%/M", down25m: "Dn 25%/M",
    up50m: "Up 50%/M", down50m: "Dn 50%/M", up13d34: "Up 13%/34d", down13d34: "Dn 13%/34d",
    universe: "Universe", t2108: "T2108", sp: "S&P",
  };
  const isRatio = (k) => k === "r5" || k === "r10";

  const win = useMemo(() => allRows.slice(-60), [allRows]);
  const tableRows = useMemo(() => {
    const base = (showAll ? allRows : win).slice();
    base.sort((a, b) => {
      for (const { key, dir } of chain) {
        const s = dir === "desc" ? 1 : -1;
        if (key === "date") { const r = String(b.date || "").localeCompare(String(a.date || "")) * s; if (r) return r; continue; }
        const va = a[key], vb = b[key];
        if (va == null && vb == null) continue;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (vb !== va) return (vb - va) * s;
      }
      return 0;
    });
    return base;
  }, [allRows, win, showAll, chain]);

  const heatBounds = useMemo(() => {
    const ups = win.map(r => r.up4).filter(v => v != null);
    const dns = win.map(r => r.down4).filter(v => v != null);
    return { upMax: Math.max(1, ...ups), dnMax: Math.max(1, ...dns) };
  }, [win]);
  const upHeat = (v) => v == null ? "transparent" : `rgba(34,197,94,${(0.05 + 0.42 * (v / heatBounds.upMax)).toFixed(3)})`;
  const dnHeat = (v) => v == null ? "transparent" : `rgba(239,68,68,${(0.05 + 0.42 * (v / heatBounds.dnMax)).toFixed(3)})`;

  // admin-only corpus signals
  const signals = [
    {
      key: "sell", label: "Selling-pressure extreme (down-4% count)",
      cite: "pradeep-bonde.md:512 (stockbee file 58): “300+ down-4% days cut win rate.”",
      rule: "down-4% count ≥ 300", value: latest.down4, fired: latest.down4 != null && latest.down4 >= 300,
      firedText: "Down-4% ≥ 300 — a heavy-selling tape; per the corpus, breakout win-rate is historically cut here.",
      okText: "Down-4% below 300 — not in the documented heavy-selling zone.",
    },
    {
      key: "turn", label: "Extreme breadth (near-turn context)",
      cite: "22-market-monitor-numbers.md:107: “extreme breadth happens near turns.”",
      rule: "no fixed number is published — read magnitude, not a line", value: null, fired: null,
      note: `Today: ${num(latest.up4)} up-4% vs ${num(latest.down4)} down-4%. The corpus documents only that EXTREME readings cluster near market turns — no cut-off, so this is context, not a signal.`,
    },
  ];

  const kpis = [
    { k: "up4", label: "Stocks up 4%+ today", val: num(latest.up4), tip: "How many stocks jumped 4%+ today — raw buying pressure.", tone: C.green },
    { k: "down4", label: "Stocks down 4%+ today", val: num(latest.down4), tip: "How many stocks dropped 4%+ today — raw selling pressure.", tone: C.red },
    { k: "r5", label: "5-day ratio", val: rat(latest.r5_calc ?? latest.r5), tip: "Buyers vs sellers over the last 5 days. Above 1 = buyers led the week.", tone: C.goldBright },
    { k: "r10", label: "10-day ratio", val: rat(latest.r10_calc ?? latest.r10), tip: "Same balance over 10 days — a smoother read of who's winning.", tone: C.goldBright },
    { k: "t2108", label: "T2108", val: rat(latest.t2108), tip: "T2108 — the % of all stocks above their 40-day average. High = crowded and stretched. Low = washed out. Extremes show up near turns.", tone: C.blue },
  ];

  const DualSpark = ({ a, b, ca, cb, W = 260, H = 60 }) => {
    const vals = [...a, ...b].filter(v => v != null);
    if (vals.length < 2) return <span style={{ color: C.muted }}>—</span>;
    const max = Math.max(...vals), min = Math.min(...vals), rng = max - min || 1;
    const path = (arr) => arr.map((v, i) => `${(i / (arr.length - 1) * (W - 2) + 1).toFixed(1)},${((1 - (v - min) / rng) * (H - 6) + 3).toFixed(1)}`).join(" ");
    return (<svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", height: H }}>
      <polyline points={path(a)} fill="none" stroke={ca} strokeWidth="1.6" strokeLinejoin="round" />
      <polyline points={path(b)} fill="none" stroke={cb} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>);
  };
  const SingleSpark = ({ a, col, W = 260, H = 60, lo = 0, hi = 100 }) => {
    const arr = a.filter(v => v != null);
    if (arr.length < 2) return <span style={{ color: C.muted }}>—</span>;
    const rng = hi - lo || 1;
    const path = a.map((v, i) => v == null ? null : `${(i / (a.length - 1) * (W - 2) + 1).toFixed(1)},${((1 - (v - lo) / rng) * (H - 6) + 3).toFixed(1)}`).filter(Boolean).join(" ");
    return (<svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", height: H }}>
      <polyline points={path} fill="none" stroke={col} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>);
  };
  const up4Series = win.map(r => r.up4);
  const down4Series = win.map(r => r.down4);
  const t2108Series = win.map(r => r.t2108);

  const chip = (fg, bg, bd) => ({ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.62rem", fontWeight: 800, padding: "3px 10px", borderRadius: 980, background: bg, border: `1px solid ${bd}`, color: fg, whiteSpace: "nowrap" });
  const td = { padding: "6px 9px", borderBottom: `1px solid ${C.border}`, fontSize: "0.72rem", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: C.text, textAlign: "right" };

  return (
    <div ref={rootRef} className="mm" style={{ fontFamily: font, maxWidth: 1440, margin: "0 auto", color: C.text }}>
      <style>{`
        .mm .mm-card{position:relative;background:rgba(255,255,255,0.042);border:1px solid rgba(255,255,255,0.09);border-radius:16px;backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);padding:18px 20px;margin-bottom:14px}
        .mm .mm-card::before{content:'';position:absolute;inset:0;pointer-events:none;border-radius:inherit;background:linear-gradient(135deg,rgba(255,255,255,0.05),transparent 55%)}
        .mm table{border-collapse:collapse;width:100%}
        .mm tbody tr:hover{background:rgba(255,255,255,0.028)}
        .mm thead th{position:sticky;top:0;background:#0c0c14;z-index:2}
        .mm .mm-datecol{position:sticky;left:0;background:#0c0c14;z-index:1;text-align:left}
        .mm thead .mm-datecol{z-index:3}
      `}</style>

      {/* 1 — HEADER */}
      <section className="mm-card" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...cardLabel, marginBottom: 6 }}>Breadth</div>
          <h1 style={{ margin: "0 0 6px", fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em", color: C.white }}>Market Breadth</h1>
          <p style={{ margin: 0, fontSize: "0.8rem", lineHeight: 1.6, color: C.muted, maxWidth: "74ch" }}>
            How many stocks moved 4%+ up vs down today — the market's weather station. Sets the aggression dial, never picks the stock. Educational, not advice.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LensCamera getEl={() => rootRef.current} name="breadth-full" C={C} />
          <div style={asofStyle}>{asofStamp}</div>
        </div>
      </section>

      {/* 2 — THE ONE QUESTION (systematic read, member-facing) */}
      <section className="mm-card">
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <span style={{ ...cardLabel, color: C.white, fontSize: "0.72rem", letterSpacing: "0.08em" }}>The one question</span>
          <span style={{ fontSize: "0.82rem", color: C.muted }}>— are breakouts likely to work right now?</span>
          <InfoDot tip="Are big-money moves leaning up or down? Green on both timeframes = the tape supports breakouts." />
          <span style={{ marginLeft: "auto", ...chip(read.verdict.fg, read.verdict.bg, read.verdict.bd), fontSize: "0.68rem", padding: "5px 13px" }}>{read.verdict.txt}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 12 }}>
          <HorizonBlock C={C} title="25%+ in a month" up={read.mUp} dn={read.mDn} green={read.mGreen} />
          <HorizonBlock C={C} title="25%+ in a quarter" up={read.qUp} dn={read.qDn} green={read.qGreen} />
        </div>
        <div style={{ fontSize: "0.72rem", color: C.muted, lineHeight: 1.55, marginTop: 11 }}>{read.sentence}</div>
      </section>

      {/* 3 — TODAY TILES */}
      <section className="mm-card">
        <div style={{ ...cardLabel, marginBottom: 12 }}>Today · {asof}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {kpis.map(k => (
            <div key={k.k} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "13px 15px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted }}>{k.label}</span>
                <InfoDot tip={k.tip} />
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: 800, color: k.tone, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{k.val}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 4 — SIGNAL READ — ADMIN ONLY (corpus citations / provenance) */}
      {isAdmin && (
        <section className="mm-card">
          <div onClick={() => setSignalOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
            <span style={{ ...cardLabel, flex: 1 }}>Signal read — corpus-documented only (admin)</span>
            <span style={{ fontSize: "0.7rem", color: C.muted }}>{signalOpen ? "▴" : "▾"}</span>
          </div>
          {signalOpen && (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {signals.map(s => (
                <div key={s.key} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "11px 13px", borderRadius: 11, background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.8rem", fontWeight: 800, color: C.white }}>{s.label}</span>
                      <InfoDot tip={"Source: " + s.cite} />
                    </div>
                    <div style={{ fontSize: "0.7rem", color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
                      Rule: <span style={{ color: C.text }}>{s.rule}</span>
                      {s.note ? <> · {s.note}</> : null}
                      {s.fired === true ? <> · {s.firedText}</> : s.fired === false ? <> · {s.okText}</> : null}
                    </div>
                  </div>
                  <div style={{ flex: "none" }}>
                    {s.fired === true && <span style={chip("#fca5a5", "rgba(239,68,68,0.12)", "rgba(239,68,68,0.35)")}>⚠ FIRED · {num(s.value)}</span>}
                    {s.fired === false && <span style={chip("#7ef0a0", "rgba(34,197,94,0.12)", "rgba(34,197,94,0.35)")}>✓ clear · {num(s.value)}</span>}
                    {s.fired === null && <span style={chip(C.muted, "rgba(255,255,255,0.04)", C.border)}>context</span>}
                  </div>
                </div>
              ))}
              <div style={{ fontSize: "0.68rem", color: C.muted, lineHeight: 1.55 }}>
                Sheet-table cell colouring now uses the EXACT thresholds extracted from the source workbook's own conditional-formatting rules (2026-07-23 · corpus stockbee-sources/22): pair comparisons on 4%/25%q/25%m/13%-34d, 5d ratio &gt;2 / &lt;0.5, 10d ≥2 / &lt;0.5, up4 ≥300 thrust, down4 ≥300 extreme, up25q ≤200 capitulation (olive), down25q ≤200 extended (yellow), up50m ≥20 froth / &lt;2 quiet, down50m &gt;19 capitulation, T2108 &lt;20 / &gt;80. Traffic-light calendar = the primary pair (up25q vs down25q) per session.
              </div>
            </div>
          )}
        </section>
      )}

      {/* 4.5 — TRAFFIC-LIGHT CALENDAR (one glance: is the environment ON, and for how long) */}
      <section className="mm-card">
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <span style={cardLabel}>Market traffic light — the year at a glance</span>
          <InfoDot tip="Each square is one trading day. Green = more stocks up 25%+ over the quarter than down (the primary breadth read) — the environment pays longs. Red = the reverse — capital preservation mode. Streaks matter more than any single day." />
        </div>
        <TrafficCalendar C={C} rows={allRows} />
      </section>

      {/* 5 — TREND MINI-CHARTS */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px,1fr))", gap: 14, marginBottom: 14 }}>
        <div className="mm-card" style={{ marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <span style={cardLabel}>4%-up vs 4%-down · last {win.length}</span>
            <InfoDot tip="Green = stocks up 4%+, red = down 4%+. When green pulls ahead, buyers are winning." />
          </div>
          <DualSpark a={up4Series} b={down4Series} ca={C.green} cb={C.red} />
          <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
            <span style={{ fontSize: "0.64rem", color: C.green, fontWeight: 700 }}>● up 4%+</span>
            <span style={{ fontSize: "0.64rem", color: C.red, fontWeight: 700 }}>● down 4%+</span>
          </div>
        </div>
        <div className="mm-card" style={{ marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
            <span style={cardLabel}>T2108 · last {win.length}</span>
            <InfoDot tip="The share of stocks above their 40-day average. High = stretched, low = washed out." />
          </div>
          <SingleSpark a={t2108Series} col={C.blue} lo={0} hi={100} />
          <div style={{ fontSize: "0.64rem", color: C.muted, marginTop: 8 }}>0–100 scale · broad participation read</div>
        </div>
      </section>

      {/* 6 — THE TABLE (sheet verbatim) */}
      <section className="mm-card" style={{ padding: "6px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 10px 4px", flexWrap: "wrap" }}>
          <span style={cardLabel}>The sheet — {showAll ? `all ${allRows.length} sessions` : `latest ${win.length} sessions`}</span>
          <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            {!isDefaultChain && (
              <button onClick={() => setChain(DEFAULT_CHAIN)} title="Restore the default sort (date, newest first)" style={{ fontFamily: font, fontSize: "0.66rem", fontWeight: 700, color: C.muted, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 11px", cursor: "pointer" }}>× reset sort</button>
            )}
            <button onClick={() => setShowAll(s => !s)} style={{ fontFamily: font, fontSize: "0.68rem", fontWeight: 700, color: C.text, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 11px", cursor: "pointer" }}>
              {showAll ? "show latest 60" : "show all history"}
            </button>
          </div>
        </div>
        <div style={{ overflowX: "auto", maxHeight: 560, overflowY: "auto" }}>
          <table>
            <thead>
              <tr>
                <th className="mm-datecol" style={{ borderBottom: `1px solid ${C.border}` }} />
                <th colSpan={6} style={{ padding: "7px 9px", fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", textAlign: "center", color: "#9ad8f0", background: "rgba(56,170,220,0.12)", borderBottom: `1px solid rgba(56,170,220,0.35)` }}>Primary breadth indicators</th>
                <th colSpan={6} style={{ padding: "7px 9px", fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", textAlign: "center", color: "#f0dc8a", background: "rgba(240,200,80,0.10)", borderBottom: `1px solid rgba(240,200,80,0.35)` }}>Secondary breadth indicators</th>
                <th colSpan={3} style={{ padding: "7px 9px", fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", textAlign: "center", color: C.muted, background: "rgba(255,255,255,0.03)", borderBottom: `1px solid ${C.border}` }}>Context</th>
              </tr>
              <tr>
                {cols.map(col => {
                  const ci = chain.findIndex(c => c.key === col.key);
                  const active = ci >= 0;
                  const left = col.key === "date";
                  return (
                    <th key={col.key} className={left ? "mm-datecol" : ""} onClick={() => clickSort(col.key)}
                      style={{ padding: "8px 9px", fontSize: "0.54rem", fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: active ? C.goldBright : C.muted, borderBottom: `1px solid ${C.border}`, textAlign: left ? "left" : "right", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: left ? "flex-start" : "flex-end" }}>
                        {SHORT[col.key] || col.hdr}{active ? (chain[ci].dir === "desc" ? " ▾" : " ▴") + SUP[ci] : ""}<InfoDot tip={col.hdr.trim()} />
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, ri) => (
                <tr key={row.date + ri}>
                  {cols.map(col => {
                    const v = row[col.key];
                    if (col.key === "date")
                      return <td key={col.key} className="mm-datecol" style={{ ...td, textAlign: "left", fontWeight: 700, color: C.white }}>{v || "—"}</td>;
                    if (col.key === "sp")
                      return <td key={col.key} style={td}>{v == null ? "—" : (+v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>;
                    const cf = sheetCF(row, col.key);
                    const tip = cellTip(row, col.key);
                    if (isRatio(col.key) || col.key === "t2108")
                      return <td key={col.key} title={tip} style={{ ...td, ...(col.key === "t2108" && !cf ? { color: C.blue } : {}), ...(cf || {}) }}>{rat(v)}</td>;
                    return <td key={col.key} title={tip} style={{ ...td, ...(cf || {}), ...(col.key === "up4" || col.key === "down4" ? { fontWeight: 700 } : {}) }}>{num(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 7 — METHOD / PROVENANCE — ADMIN ONLY */}
      {isAdmin && (
        <section className="mm-card">
          <div onClick={() => setMethodOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
            <span style={{ ...cardLabel, flex: 1 }}>Method — provenance (admin)</span>
            <span style={{ fontSize: "0.7rem", color: C.muted }}>{methodOpen ? "▴" : "▾"}</span>
          </div>
          {methodOpen && (
            <div style={{ marginTop: 12 }}>
              <pre style={{ margin: 0, padding: "14px 16px", background: "rgba(0,0,0,0.35)", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: "0.68rem", lineHeight: 1.7, color: C.text, overflowX: "auto", whiteSpace: "pre", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{
`DATA        the source sheet itself — live public Google Sheet CSV, which the
            user's local "Stockbee Market Monitor 2026.xlsx" mirrors.
            source now = ${source === "sheet" ? "live sheet" : "local xlsx fallback"}   rows = ${allRows.length}   asof = ${asof}

FORMULAS    recomputed from the sheet's OWN formula cells (data_only=False):
              5 day ratio  (col D):  =(sum(B3:B7))/(sum(C3:C7))
              10 day ratio (col E):  =(sum(B3:B12))/(sum(C3:C12))

CROSS-CHECK recomputed ratios vs the sheet's own computed values:
              max |diff| = ${fc.maxDiff}      mismatches (>0.01) = ${fc.mismatches}

FOUR COLUMNS  49-...md §4 — "All 4 columns GREEN → buy breakouts; any RED → choppy".
              Our reading: a horizon is GREEN when its up-count > down-count. The
              source's EXACT colouring formula is not published → this is our
              plain-arithmetic interpretation of the documented rule.

THRESHOLDS  [A] file 22:107 — "extreme breadth happens near turns"
            [B] pradeep-bonde.md:512 — "300+ down-4% days cut win rate"

HONEST GAPS 5d/10d ratio bands · T2108 bands — undocumented, shown raw.`
              }</pre>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ── BREADTH MINI — the four-column master switch + one plain-English verdict.
// Everything else (dual bar, ratios, T2108, tiles, table) lives in the popup.
export function BreadthMini({ C, font, session }) {
  const [open, setOpen] = useState(false);
  const cardRef = useRef(null);
  const rows = MARKET_MONITOR?.rows || [];
  const asof = MARKET_MONITOR?.asof || "—";
  // HARD rule (Valen 2026-07-19): every data push must move the visible stamp. asof = the close
  // the numbers describe; refreshed = when the snapshot was last regenerated. Show both when they differ.
  const refreshed = MARKET_MONITOR?.refreshed;
  const stamp = refreshed && refreshed !== asof ? `as of ${asof} · updated ${refreshed}` : `as of ${asof}`;
  const latest = rows[rows.length - 1] || {};
  const read = readBreadth(latest);
  return (
    <>
      <div ref={cardRef} className="card lensmini" onClick={() => setOpen(true)} style={{ fontFamily: font, cursor: "pointer" }}>
        <div className="cardhead">
          <span className="label">Market Breadth</span>
          <InfoDot tip="Are breakouts likely to work right now? Tap for counts, ratios and the full sheet." />
          <LensCamera getEl={() => cardRef.current} name="breadth" C={C} style={{ marginLeft: 6 }} />
          <span style={{ marginLeft: "auto", fontSize: "0.62rem", fontWeight: 700, color: C.goldBright, fontVariantNumeric: "tabular-nums" }}>{stamp}</span>
        </div>
        {/* the four-column master switch */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <HorizonBlock C={C} title="25%+ in a month" up={read.mUp} dn={read.mDn} green={read.mGreen} />
          <HorizonBlock C={C} title="25%+ in a quarter" up={read.qUp} dn={read.qDn} green={read.qGreen} />
        </div>
        {/* one punchy verdict sentence */}
        <div style={{ marginTop: 11, fontSize: "0.72rem", lineHeight: 1.5, color: C.text }}>{read.sentence}</div>
        {/* breakout-conditions line — plain binary; MORE/LESS carries the colour */}
        <div style={{ marginTop: 7, fontSize: "0.72rem", fontWeight: 700, lineHeight: 1.45, color: C.text }}>
          Breakouts are <span style={{ color: read.breakouts.more ? C.green : C.red, fontWeight: 800 }}>{read.breakouts.more ? "MORE" : "LESS"}</span> likely to work
        </div>
      </div>
      {open && createPortal(
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1250, background: "rgba(4,4,8,0.55)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", overflowY: "auto", padding: "32px 16px" }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: 1480, margin: "0 auto" }}>
            <MarketMonitor C={C} font={font} session={session} />
          </div>
        </div>, document.body)}
    </>
  );
}
