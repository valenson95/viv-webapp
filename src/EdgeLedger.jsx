import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

// ── Edge Ledger (ADMIN ONLY) ─────────────────────────────────────────────────
// Probability-design read on Valen's own fills: is the system inside the
// profitability range, or off track? Data = claude_insights.payload.edge_ledger,
// written by scripts/edge-ledger.mjs (merge-write; never clobbers the coach keys).
// Members never see this — gated on the admin email AND on RLS (own-row read).

const ADMIN_EMAIL = "vc-lv@live.com";
const G = "#22c55e", R_ = "#ef4444", GOLD = "#f0c050", BLUE = "#60a5fa";

const fmt$ = (v) => v == null ? "—" : (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString();
const num = (v, d = 2) => v == null ? "—" : (+v).toFixed(d);

const STATUS = {
  "on-track":       { label: "ON TRACK",        color: G,    tip: "PF ≥ 1.3, payoff comfortably above the breakeven line for your win rate, positive expectancy, n ≥ 20." },
  "marginal":       { label: "MARGINAL",        color: GOLD, tip: "Realized numbers sit near the breakeven curve — alive, but the edge isn't proven yet. Runners still open aren't counted." },
  "off-track":      { label: "OFF TRACK",       color: R_,   tip: "Profit factor below 1 on a meaningful sample — the loss side is eating the win side. Fix avg loss first." },
  "early-positive": { label: "EARLY · POSITIVE", color: G,   tip: "Looks right, but the sample is too small to trust. Keep executing." },
  "early-neutral":  { label: "EARLY · NEUTRAL", color: GOLD, tip: "Too few closed campaigns to judge. Track adherence, not outcome." },
  "early-negative": { label: "EARLY · NEGATIVE", color: R_,  tip: "Small sample and negative — watch the loss cap closely." },
  "insufficient-n": { label: "COLLECTING DATA", color: BLUE, tip: "Not enough closed campaigns yet — judge process adherence, not P&L." },
};

function Info({ C, children }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ display: "inline" }}>
      <button onClick={() => setOpen(v => !v)} style={{ background: "transparent", border: "none", padding: "0 3px", color: C.muted, cursor: "pointer", fontSize: "0.62rem", borderBottom: "1px dotted rgba(201,152,42,0.45)" }}>{open ? "✕" : "ⓘ"}</button>
      {open && <div style={{ fontSize: "0.66rem", color: "var(--text,#eee)", lineHeight: 1.55, background: "rgba(96,165,250,0.07)", border: "1px solid rgba(96,165,250,0.3)", borderRadius: 9, padding: "8px 11px", margin: "6px 0" }}>{children}</div>}
    </span>
  );
}

function Stat({ C, label, value, color, sub, info }) {
  return (
    <div style={{ flex: "1 1 130px", minWidth: 130, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "9px 12px" }}>
      <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>{label}{info}</div>
      <div style={{ fontSize: "1.05rem", fontWeight: 800, color: color || "var(--text,#fff)", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: "0.6rem", color: C.muted, marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
}

// Breakeven map: x = win rate, y = payoff ratio. The curve W=(1−p)/p separates
// losing systems (below) from winning ones (above). Dots = his months + system.
function BellMap({ C, pts }) {
  const W = 560, H = 300, pl = 46, pr = 16, pt = 18, pb = 34;
  const X = (p) => pl + ((p - 10) / 60) * (W - pl - pr);          // 10%..70%
  const Y = (w) => pt + (1 - Math.min(w, 4) / 4) * (H - pt - pb); // 0..4×
  let curve = [];
  for (let p = 12; p <= 70; p += 1) { const w = (100 - p) / p; if (w <= 4.2) curve.push(`${X(p)},${Y(w)}`); }
  // shade profitable region (above curve)
  const shade = [`${X(70)},${Y((100 - 70) / 70)}`, ...curve.slice().reverse(), `${X(curve.length ? 12 + (curve.length - 1) * 0 : 12)},${pt}`, `${X(12)},${pt}`, `${X(70)},${pt}`];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} fontFamily="ui-monospace,monospace">
      <polygon points={curve.concat([`${W - pr},${pt}`, `${X(12)},${pt}`]).join(" ")} fill="rgba(34,197,94,0.07)" />
      <polygon points={curve.concat([`${W - pr},${H - pb}`, `${X(12)},${H - pb}`]).join(" ")} fill="rgba(239,68,68,0.06)" />
      <polyline points={curve.join(" ")} fill="none" stroke={GOLD} strokeWidth="1.8" strokeDasharray="7 4" />
      {[0, 1, 2, 3, 4].map(w => <g key={w}><line x1={pl} y1={Y(w)} x2={W - pr} y2={Y(w)} stroke="rgba(255,255,255,0.06)" /><text x={pl - 6} y={Y(w) + 3} fill="rgba(255,255,255,0.45)" fontSize="10" textAnchor="end">{w}×</text></g>)}
      {[20, 30, 40, 50, 60, 70].map(p => <text key={p} x={X(p)} y={H - pb + 14} fill="rgba(255,255,255,0.45)" fontSize="10" textAnchor="middle">{p}%</text>)}
      <text x={pl - 34} y={pt + 10} fill="rgba(255,255,255,0.5)" fontSize="9" transform={`rotate(-90 ${pl - 34} ${pt + 60})`}>payoff (avg win ÷ avg loss)</text>
      <text x={(pl + W - pr) / 2} y={H - 4} fill="rgba(255,255,255,0.5)" fontSize="9.5" textAnchor="middle">win rate → · gold dashed line = breakeven · green side = profitable, red side = losing</text>
      <text x={X(56)} y={Y(2.6)} fill="rgba(34,197,94,0.7)" fontSize="11" fontWeight="700">PROFITABLE SIDE</text>
      <text x={X(15)} y={Y(0.35)} fill="rgba(239,68,68,0.7)" fontSize="11" fontWeight="700">LOSING SIDE</text>
      {pts.filter(p => p.wr != null && p.payoff != null).map((p, i) => (
        <g key={i}>
          <circle cx={X(p.wr)} cy={Y(p.payoff)} r={p.big ? 8 : 5.5} fill="#0a0a10" stroke={p.color} strokeWidth="2.4" />
          <text x={X(p.wr) + 10} y={Y(p.payoff) + 4} fill={p.color} fontSize="11" fontWeight="800">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

function Hist({ C, hist }) {
  const entries = Object.entries(hist || {});
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 110, padding: "4px 2px 0" }}>
      {entries.map(([lab, v]) => {
        const red = lab.startsWith("−") || lab === "≤−2R";
        const scr = lab === "scratch";
        return (
          <div key={lab} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: "0.58rem", color: C.muted, fontVariantNumeric: "tabular-nums" }}>{v || ""}</span>
            <div style={{ width: "100%", height: Math.max(2, (v / max) * 74), borderRadius: 3, background: scr ? "rgba(148,163,184,0.5)" : red ? "rgba(239,68,68,0.65)" : "rgba(34,197,94,0.65)" }} />
            <span style={{ fontSize: "0.5rem", color: C.muted, whiteSpace: "nowrap", transform: "rotate(-28deg)", transformOrigin: "top center", marginTop: 2 }}>{lab}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function EdgeLedger({ C, font, session }) {
  const isAdmin = (session?.user?.email || "").toLowerCase() === ADMIN_EMAIL;
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(() => { try { return localStorage.getItem("viv-edge-open") === "1"; } catch { return false; } });
  const [showInfo, setShowInfo] = useState(false);
  const [tblOpen, setTblOpen] = useState(false);

  useEffect(() => {
    if (!isAdmin || !session?.user?.id) return;
    let alive = true;
    supabase.from("claude_insights").select("payload").eq("user_id", session.user.id).maybeSingle()
      .then(({ data: d }) => { if (alive && d?.payload?.edge_ledger) setData(d.payload.edge_ledger); });
    return () => { alive = false; };
  }, [isAdmin, session?.user?.id]);

  const pts = useMemo(() => {
    if (!data) return [];
    const b = data.buckets || {};
    return [
      { label: "May", wr: b.may?.wr, payoff: b.may?.payoff, color: "#94a3b8" },
      { label: "Jun", wr: b.june?.wr, payoff: b.june?.payoff, color: "#94a3b8" },
      { label: "Jul", wr: b.july?.wr, payoff: b.july?.payoff, color: BLUE },
      { label: "SYSTEM", wr: data.verdict?.wr, payoff: data.verdict?.payoff, color: GOLD, big: true },
    ];
  }, [data]);

  if (!isAdmin || !data) return null;
  const v = data.verdict || {}, st = STATUS[v.status] || STATUS["insufficient-n"];
  const b = data.buckets || {}, dk = data.derisk || {}, mc = data.monte?.system || {}, ob = data.openBook || {};
  const monthCard = (label, m) => m && (
    <div key={label} style={{ flex: "1 1 150px", minWidth: 150, background: "rgba(255,255,255,0.025)", border: `1px solid ${m.net > 0 ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.2)"}`, borderRadius: 10, padding: "9px 12px" }}>
      <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>{label}</div>
      <div style={{ fontSize: "1rem", fontWeight: 800, color: m.net > 0 ? G : R_, fontVariantNumeric: "tabular-nums" }}>{fmt$(m.net)}</div>
      <div style={{ fontSize: "0.62rem", color: C.muted, marginTop: 3, lineHeight: 1.5 }}>n {m.n} · WR {num(m.wr, 0)}% · PF {num(m.pf)}<br />avg win {fmt$(m.avgW)} / loss {fmt$(m.avgL)}</div>
    </div>
  );

  return (
    <div className="card" style={{ padding: "12px 16px", marginBottom: 12, border: `1px solid ${st.color}33` }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold }}>Edge Ledger · admin</span>
        <span title={st.tip} style={{ fontSize: "0.62rem", fontWeight: 800, padding: "3px 10px", borderRadius: 8, color: st.color, background: `${st.color}1a`, border: `1px solid ${st.color}55`, cursor: "help" }}>{st.label}</span>
        <button onClick={() => setShowInfo(x => !x)} style={{ background: "transparent", border: "none", padding: 0, fontFamily: font, fontSize: "0.6rem", color: C.muted, cursor: "pointer", borderBottom: "1px dotted rgba(201,152,42,0.4)" }}>{showInfo ? "hide ✕" : "what is this?"}</button>
        <span style={{ marginLeft: "auto", fontSize: "0.58rem", color: C.muted }}>as of {String(data.asof).slice(0, 16).replace("T", " ")} · <button onClick={() => { setOpen(x => { try { localStorage.setItem("viv-edge-open", x ? "0" : "1"); } catch {} return !x; }); }} style={{ background: "transparent", border: "none", color: C.gold, cursor: "pointer", fontSize: "0.6rem", fontWeight: 700 }}>{open ? "collapse ▲" : "expand ▼"}</button></span>
      </div>

      {showInfo && (
        <div style={{ fontSize: "0.68rem", color: "var(--text,#eee)", lineHeight: 1.6, background: "rgba(201,152,42,0.06)", border: "1px solid rgba(201,152,42,0.3)", borderRadius: 10, padding: "10px 12px", margin: "10px 0 4px" }}>
          The Edge Ledger answers one question with YOUR own fills: <b>is the trading system inside the profitability range, or off track?</b> It rebuilds every closed campaign since May (pipeline-verified rows only), computes the probability numbers a system designer watches (win rate × payoff vs the breakeven curve, expectancy, SQN), and scores the NEW derisk-trim system on its own cohort — including what the trims cost or saved vs never trimming (the "shadow" test). Refresh the numbers anytime: <b>node --env-file=.env.local scripts/edge-ledger.mjs</b>. Equities-focused estimate — TradeZella stays the P&L source of truth.
        </div>
      )}

      {/* verdict strip — always visible */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <Stat C={C} label="System expectancy" value={(v.expR > 0 ? "+" : "") + num(v.expR) + "R / trade"} color={v.expR > 0 ? G : R_}
          info={<Info C={C}>Average R made per closed campaign in the new system. Positive = each trade is, on average, paying you. This is THE scoreboard — win rate alone is not.</Info>}
          sub={`n=${v.n} closed campaigns`} />
        <Stat C={C} label="Profit factor" value={num(v.pf)} color={v.pf >= 1.3 ? G : v.pf >= 1 ? GOLD : R_}
          info={<Info C={C}>Gross wins ÷ gross losses. 1.0 = breakeven, 1.3+ = healthy, 2+ = strong. Your May was 0.19 and June 0.37 — the baseline you're escaping.</Info>}
          sub="target ≥ 1.3" />
        <Stat C={C} label="Edge vs breakeven" value={num(v.edgeRatio) + "×"} color={v.edgeRatio >= 1.2 ? G : v.edgeRatio >= 1 ? GOLD : R_}
          info={<Info C={C}>Your payoff ratio ({num(v.payoff)}) ÷ the payoff needed to break even at your win rate ({num(v.wBE)}). Above 1 = the profitable side of the bell-curve map below. 1.2+ = real margin of safety.</Info>}
          sub={`payoff ${num(v.payoff)} vs need ${num(v.wBE)}`} />
        <Stat C={C} label="SQN" value={num(v.sqn)} color={v.sqn >= 2 ? G : v.sqn >= 1.6 ? GOLD : BLUE}
          info={<Info C={C}>System Quality Number = mean(R) ÷ std(R) × √n. It rewards consistency, not home runs: 1.6–2 tradeable · 2–3 good · 3+ excellent. Below 1.6 the "edge" may still be noise.</Info>}
          sub="1.6 tradeable · 2+ good" />
        <Stat C={C} label="Sample size" value={`${v.n} / 30`} color={v.n >= 30 ? G : BLUE}
          info={<Info C={C}>Statistical honesty gate. Below ~30 closed campaigns, judge ADHERENCE (did you follow the rules), not P&L. At 50, the Monte Carlo becomes meaningful. Refine every ~100.</Info>}
          sub={v.n >= 30 ? "MC meaningful at 50" : `${v.nTarget30} more to judge outcome`} />
        <Stat C={C} label="Open book" value={`${ob.riskFree}/${ob.positions} risk-free`} color={ob.riskFree >= ob.positions * 0.6 ? G : GOLD}
          info={<Info C={C}>Positions whose stop/trail sits at or above cost — the derisk system's live state. "Naked" = a position with no stop recorded: fix immediately.</Info>}
          sub={`${fmt$(ob.openRiskUsd)} still at risk${ob.naked ? ` · ${ob.naked} NAKED ⚠️` : ""}`} />
      </div>

      {open && (
        <>
          {/* bell-curve map */}
          <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
            <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold }}>The profitability map — where you sit vs the breakeven curve
              <Info C={C}>Every trading system lives on this map: win rate (x) against payoff ratio (y). The gold dashed curve is mathematical breakeven — W = (1−p)/p. Anything above it makes money; below it loses, no matter how good the stock picks are. Watch the SYSTEM dot migrate as the sample grows: up (bigger winners via runners) or right (higher win rate via better entries) both work — May and June show where you came from.</Info>
            </div>
            <BellMap C={C} pts={pts} />
          </div>

          {/* month cards */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {monthCard("May (baseline)", b.may)}{monthCard("June (baseline)", b.june)}{monthCard("July (realized)", b.july)}
            <div style={{ flex: "2 1 240px", minWidth: 220, background: "rgba(96,165,250,0.05)", border: "1px solid rgba(96,165,250,0.25)", borderRadius: 10, padding: "9px 12px", fontSize: "0.64rem", color: "var(--text,#eee)", lineHeight: 1.55 }}>
              <b>Read:</b> months are REALIZED cash by exit month (campaign slices). The system cohort (gold dot) counts only campaigns entered since {data.systemEntry} — its runners are still open and NOT in these numbers yet. Equities-focused estimate; TradeZella owns truth.
            </div>
          </div>

          {/* derisk scorecard */}
          <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
            <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, marginBottom: 8 }}>Derisk-trim scorecard — is the NEW rule earning its keep?</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Stat C={C} label="Window validation" value={`day ${dk.medDayMFE ?? "—"}`} color={dk.medDayMFE >= 3 && dk.medDayMFE <= 5 ? G : GOLD}
                info={<Info C={C}>Median day the maximum profit (MFE) printed across system winners. If this sits inside 3–5, the T+3→T+5 trim window is aimed exactly where your trades peak. Yours: day {dk.medDayMFE} — the window is empirically RIGHT for your trading.</Info>}
                sub="median day of max profit · target 3–5" />
              <Stat C={C} label="Derisk cost" value={(dk.deriskCostR > 0 ? "+" : "") + num(dk.deriskCostR) + "R"} color={dk.deriskCostR <= 0 ? G : R_}
                info={<Info C={C}>THE decisive metric. For every campaign: (R if you had NEVER trimmed, full size to final exit) minus (R you actually banked). Negative = the trims SAVED money vs holding; positive = they cost you. Computed on {dk.deriskCostN} campaigns. This is the only honest way to separate "the system works" from "the market went up".</Info>}
                sub={dk.deriskCostR <= 0 ? "trims SAVED R vs never trimming" : "trims gave up R so far"} />
              <Stat C={C} label="Trim adherence" value={num(dk.adherencePct, 0) + "%"} color={dk.adherencePct >= 80 ? G : GOLD}
                info={<Info C={C}>% of first trims that happened inside the T+3→T+5 window. While the sample is small this is the metric that matters most — a system can only be judged if it was actually followed. Trim days so far: {(dk.trimDays || []).join(", ")}.</Info>}
                sub="first trim inside T+3→T+5" />
              <Stat C={C} label="MFE capture" value={num(dk.avgCapture)} color={dk.avgCapture >= 0.6 ? G : GOLD}
                info={<Info C={C}>On winners: R banked ÷ maximum R the trade offered. 1.0 = sold the exact top (impossible sustainably). 0.5–0.7 = healthy for a trim-into-strength style. Persistently below 0.4 = the right tail is being amputated — let runners breathe.</Info>}
                sub="share of the max move you banked" />
              <Stat C={C} label="Ext ≥5× exits" value={`${dk.ext5Exits?.winners}/${dk.ext5Exits?.n} wins`} color={G}
                info={<Info C={C}>Exits taken while the stock sat ≥5 daily ranges above its 50-MA — selling into statistical stretch. Your all-time tracker says this cohort wins 76% averaging +10.7%; the system continues it.</Info>}
                sub="selling into strength keeps working" />
              <Stat C={C} label="Rescues" value={String(dk.rescues ?? 0)} color={BLUE}
                info={<Info C={C}>Campaigns where the runner later died at breakeven but the early trim had already banked profit — trades the derisk rule single-handedly turned from scratch into green. Expect this number to grow; it's the system's defensive alpha made visible.</Info>}
                sub="trims that saved an otherwise-scratch trade" />
            </div>
          </div>

          {/* R distribution + Monte Carlo */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
            <div style={{ flex: "1 1 300px", minWidth: 280 }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold }}>System R-distribution
                <Info C={C}>Every closed system campaign in R units. The shape IS the system: a healthy trim-style shows a tall cluster of small losses/scratches on the left and a real right tail. If the right tail disappears, the runners aren't being allowed to run.</Info>
              </div>
              <Hist C={C} hist={b.system?.hist} />
            </div>
            <div style={{ flex: "1 1 300px", minWidth: 280 }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold }}>Monte Carlo — next 100 trades, resampled from YOUR R
                <Info C={C}>10,000 simulated 100-trade paths, each trade drawn randomly from your actual system R-distribution at {mc.riskPct}% risk. It answers: if these {mc.n} campaigns are representative, what does a year look like — and how deep can the drawdowns get while the system is still healthy? Treat with caution until n ≥ 50.</Info>
              </div>
              {mc.retP50 != null ? (
                <div style={{ fontSize: "0.68rem", color: "var(--text,#eee)", lineHeight: 1.7, marginTop: 6 }}>
                  Median path: <b style={{ color: G }}>+{num(mc.retP50, 1)}%</b> · pessimistic (5th pct): <b>{num(mc.retP5, 1) > 0 ? "+" : ""}{num(mc.retP5, 1)}%</b> · optimistic (95th): <b>+{num(mc.retP95, 1)}%</b><br />
                  Median max drawdown: <b style={{ color: GOLD }}>{num(mc.ddP50, 1)}%</b> · worst-case (95th pct): <b style={{ color: R_ }}>{num(mc.ddP95, 1)}%</b><br />
                  Chance a 100-trade path ends negative: <b>{num(mc.pNegative, 1)}%</b> · chance of a &gt;10% drawdown: <b>{num(mc.pDD10, 1)}%</b><br />
                  <span style={{ color: C.muted }}>Circuit-breaker calibration: a drawdown beyond the 95th-pct number above is NOT normal variance for this system — stop and diagnose.</span>
                </div>
              ) : <div style={{ fontSize: "0.66rem", color: C.muted, marginTop: 6 }}>Needs ≥8 closed campaigns with R.</div>}
            </div>
          </div>

          {/* campaign table */}
          <div style={{ marginTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
            <button onClick={() => setTblOpen(x => !x)} style={{ background: "transparent", border: "none", color: C.gold, cursor: "pointer", fontFamily: font, fontSize: "0.64rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", padding: 0 }}>
              {tblOpen ? "▾" : "▸"} System campaigns · audit every number ({(data.campaigns || []).length})
            </button>
            {tblOpen && (
              <div style={{ overflowX: "auto", marginTop: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.62rem", fontVariantNumeric: "tabular-nums" }}>
                  <thead><tr style={{ color: C.muted, textAlign: "left" }}>
                    {["Ticker", "P&L", "R", "MFE R", "Day of max", "Capture", "Shadow R", "Trim day", "Exit reasons"].map(h => <th key={h} style={{ padding: "4px 8px", borderBottom: "1px solid rgba(201,152,42,0.3)", fontSize: "0.54rem", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {(data.campaigns || []).map((c, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <td style={{ padding: "4px 8px", fontWeight: 700 }}>{c.ticker}{c.rescued ? " 🛟" : ""}</td>
                        <td style={{ padding: "4px 8px", color: c.pl > 0 ? G : R_, fontWeight: 700 }}>{fmt$(c.pl)}</td>
                        <td style={{ padding: "4px 8px" }}>{num(c.blendedR ?? c.rSum)}</td>
                        <td style={{ padding: "4px 8px" }}>{num(c.mfeR)}</td>
                        <td style={{ padding: "4px 8px" }}>{c.dayMFE ?? "—"}</td>
                        <td style={{ padding: "4px 8px" }}>{num(c.capture)}</td>
                        <td style={{ padding: "4px 8px", color: c.deriskCostR != null ? (c.deriskCostR <= 0 ? G : GOLD) : undefined }}>{num(c.shadowR)}{c.deriskCostR != null ? ` (${c.deriskCostR > 0 ? "+" : ""}${num(c.deriskCostR)})` : ""}</td>
                        <td style={{ padding: "4px 8px" }}>{c.trimDay ?? "—"}</td>
                        <td style={{ padding: "4px 8px", color: C.muted, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.reasons}>{c.reasons}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ fontSize: "0.58rem", color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
                  R = banked P&L vs initial risk (entry − first stop) · MFE R = best the trade ever offered · Shadow R = what NEVER trimming would have made (bracket = shadow − actual: green = trim saved, gold = trim cost) · 🛟 = rescue. Bars: EOD.
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
