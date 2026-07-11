import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Area, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, ScatterChart, Scatter, ZAxis, LabelList,
} from "recharts";
import { supabase } from "./supabaseClient";

// ── QUANTITATIVE ANALYSIS (ADMIN ONLY) ───────────────────────────────────────
// The research bench: campaign-level R analytics, counterfactuals, entry/exit
// refinement and Monte Carlo. Data: claude_insights.payload.edge_ledger
// (scripts/edge-ledger.mjs). Members never see this page.
//
// DESIGN (realigned to the webapp system, Valen 2026-07-11):
// – Same visual language as the journal: Plus Jakarta, gold section headers,
//   card surfaces, hairline dividers.
// – Colour doctrine: numbers NEUTRAL by default; green/red reserved for P&L/R
//   outcomes and verdicts; ✓/✕ chips; small dots for categories; no emoji.
// – Same population as the journal via the cohort toggle + reconciliation
//   ladder (fills → campaigns → cohort), so every N can be cross-checked.

const ADMIN_EMAIL = "vc-lv@live.com";
const T = {
  card: "rgba(255,255,255,0.016)", border: "rgba(255,255,255,0.07)", borderSoft: "rgba(255,255,255,0.05)",
  text: "#E7E9EE", muted: "#9AA0B0", faint: "#5A6072",
  gold: "#c9982a", goldBright: "#f0c050", goldSoft: "rgba(201,152,42,0.55)",
  green: "#22c55e", red: "#ef4444", blue: "#7AA2F7", grey: "#7C8496",
  grid: "rgba(255,255,255,0.045)",
};
const fmt$ = (v) => v == null ? "—" : (v < 0 ? "−$" : "$") + Math.abs(Math.round(v)).toLocaleString();
const num = (v, d = 2) => v == null || !isFinite(v) ? "—" : (+v).toFixed(d);
const sgnR = (v, d = 2) => v == null || !isFinite(v) ? "—" : (v >= 0 ? "+" : "") + (+v).toFixed(d) + "R";
const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/* ─── primitives (webapp visual language) ────────────────────────────────── */
const SecHead = ({ children }) => (
  <span style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: T.gold }}>{children}</span>
);
const Panel = ({ title, meta, children, footnote, howto, collapsed = false }) => {
  const [open, setOpen] = useState(!collapsed);
  return (
    <section style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
      <header onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "baseline", gap: 12, cursor: "pointer", userSelect: "none" }}>
        <SecHead>{title}</SecHead>
        <span style={{ flex: 1, borderBottom: `1px solid ${T.borderSoft}`, transform: "translateY(-3px)" }} />
        {meta && <span style={{ fontSize: "0.64rem", color: T.faint, fontVariantNumeric: "tabular-nums" }}>{meta}</span>}
        <span style={{ fontSize: "0.7rem", color: T.faint }}>{open ? "▴" : "▾"}</span>
      </header>
      {open && <div style={{ marginTop: 14 }}>{children}</div>}
      {/* "How to read" as scannable ROWS, one pointer each — never a wall of prose (Valen) */}
      {open && howto && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${T.borderSoft}`, paddingTop: 10 }}>
          <div style={{ fontSize: "0.54rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: T.faint, marginBottom: 6 }}>How to read</div>
          {howto.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 9, padding: "3px 0", fontSize: "0.7rem", lineHeight: 1.55, color: T.muted }}>
              <span style={{ color: T.gold, flex: "none" }}>·</span><span>{h}</span>
            </div>
          ))}
        </div>
      )}
      {open && footnote && <p style={{ margin: "12px 0 0", fontSize: "0.68rem", lineHeight: 1.6, color: T.muted, maxWidth: "92ch" }}>{footnote}</p>}
    </section>
  );
};
const Kpi = ({ label, value, tone, sub, tip }) => (
  <div style={{ flex: "1 1 138px", minWidth: 138, padding: "2px 18px 2px 0", borderRight: `1px solid ${T.borderSoft}` }}>
    <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>
      {tip ? <span className="term" data-tip={tip}>{label}</span> : label}
    </div>
    <div style={{ fontSize: "1.35rem", fontWeight: 800, color: tone || T.text, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", marginTop: 3 }}>{value}</div>
    {sub && <div style={{ fontSize: "0.62rem", color: T.muted, marginTop: 2, lineHeight: 1.45 }}>{sub}</div>}
  </div>
);
const dot = (c) => <i style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: c, marginRight: 7, verticalAlign: "middle" }} />;
// "WHAT IT SAYS NOW" — one plain-English sentence per panel, computed from the live data.
// The chart is evidence; this line is the finding. (TradeZella-style narrative insight.)
const Say = ({ children }) => (
  <div style={{ margin: "0 0 12px", padding: "10px 14px", borderLeft: `3px solid ${T.gold}`, background: "rgba(201,152,42,0.05)", borderRadius: "0 10px 10px 0", fontSize: "0.76rem", lineHeight: 1.7, color: T.text }}>
    <span style={{ fontSize: "0.54rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: T.gold, display: "block", marginBottom: 2 }}>What it says now</span>
    {children}
  </div>
);
const Chip = ({ ok, children }) => (
  <span style={{ fontWeight: 800, fontSize: "0.62rem", whiteSpace: "nowrap", color: ok == null ? T.muted : ok ? T.green : T.red }}>
    {ok == null ? "—" : (ok ? "✓ " : "✕ ")}{children}
  </span>
);
const TT = ({ active, payload, render }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#13141B", border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 12px", boxShadow: "0 8px 28px rgba(0,0,0,0.55)", fontSize: "0.7rem", color: T.text, lineHeight: 1.7, fontVariantNumeric: "tabular-nums" }}>
      {render(payload)}
    </div>
  );
};
const axis = { tick: { fill: T.faint, fontSize: 10 }, axisLine: false, tickLine: false };
const thBase = { padding: "7px 10px", fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: T.muted, borderBottom: `1px solid ${T.border}`, textAlign: "left", whiteSpace: "nowrap" };
const tdBase = { padding: "8px 10px", borderBottom: `1px solid ${T.borderSoft}`, fontSize: "0.74rem", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

/* ─── cohort aggregation (same math as edge-ledger.mjs, client-side) ─────── */
function aggOf(list) {
  const W = list.filter(c => c.pl > 0), L = list.filter(c => c.pl <= 0);
  const gw = W.reduce((s, c) => s + c.pl, 0), gl = L.reduce((s, c) => s + c.pl, 0);
  const rlist = list.map(c => c.blendedR ?? c.rSum).filter(v => v != null && isFinite(v));
  const rL = rlist.filter(v => v <= 0), rW = rlist.filter(v => v > 0);
  const expR = mean(rlist);
  const sd = rlist.length > 1 ? Math.sqrt(rlist.reduce((s, x) => s + (x - expR) ** 2, 0) / (rlist.length - 1)) : null;
  const wr = list.length ? 100 * W.length / list.length : null;
  const avgW$ = W.length ? gw / W.length : null, avgL$ = L.length ? Math.abs(gl) / L.length : null;
  const payoff = avgW$ && avgL$ ? avgW$ / avgL$ : null;
  const wBE = wr ? (100 - wr) / wr : null;
  return {
    n: list.length, nW: W.length, nL: L.length, net: gw + gl,
    wr, pf: gl < 0 ? gw / -gl : (gw > 0 ? Infinity : null),
    payoff, wBE, edgeRatio: payoff && wBE ? payoff / wBE : null,
    expR, sqn: expR != null && sd ? (expR / sd) * Math.sqrt(rlist.length) : null,
    nR: rlist.length, avgLossR: mean(rL), avgWinR: mean(rW),
    rlist,
  };
}
const HB = [[-99, -2, "≤ −2R"], [-2, -1, "−2 to −1"], [-1, -0.5, "−1 to −0.5"], [-0.5, -0.05, "−0.5 to 0"], [-0.05, 0.05, "scratch"], [0.05, 1, "0 to 1"], [1, 2, "1 to 2"], [2, 3, "2 to 3"], [3, 5, "3 to 5"], [5, 99, "5R+"]];

/* ─── error boundary: a bad payload row must show a message, never a dead page ── */
class QABoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(e) { return { err: e }; }
  render() {
    if (this.state.err) return (
      <div style={{ padding: 40, color: T.text, fontSize: "0.8rem", lineHeight: 1.7 }}>
        <b style={{ color: T.red }}>The Quant page hit a rendering error.</b>
        <div style={{ color: T.muted, marginTop: 6 }}>{String(this.state.err?.message || this.state.err)}</div>
        <div style={{ color: T.faint, marginTop: 6 }}>Usually a stale payload — rerun <code>node --env-file=.env.local scripts/edge-ledger.mjs</code> and refresh.</div>
      </div>
    );
    return this.props.children;
  }
}
export default function QuantAnalysis(props) { return <QABoundary><QuantAnalysisInner {...props} /></QABoundary>; }

/* ─── page ───────────────────────────────────────────────────────────────── */
function QuantAnalysisInner({ C, font, session, setPage }) {
  const isAdmin = (session?.user?.email || "").toLowerCase() === ADMIN_EMAIL;
  const [data, setData] = useState(null);
  const [mode, setMode] = useState("sys"); // "sys" = system cohort · "all" = full journal since May
  const [sortKey, setSortKey] = useState("pl");
  const [sortDir, setSortDir] = useState(-1);
  const [eqMaP, setEqMaP] = useState(10);

  useEffect(() => {
    if (!isAdmin || !session?.user?.id) return;
    let alive = true;
    supabase.from("claude_insights").select("payload").eq("user_id", session.user.id).maybeSingle()
      .then(({ data: d }) => { if (alive && d?.payload?.edge_ledger) setData(d.payload.edge_ledger); });
    return () => { alive = false; };
  }, [isAdmin, session?.user?.id]);
  // No cursor glow on the research bench (Valen) — body class scopes the CSS kill-switch.
  useEffect(() => {
    document.body.classList.add("qa-open");
    return () => document.body.classList.remove("qa-open");
  }, []);
  const [ovl, setOvl] = useState(false); // overlay the $-equity curve on system health

  // ── cohort selection: same list, two populations — the toggle IS the reconciliation
  const allCamps = useMemo(() => data?.campaigns || [], [data]);
  const isSys = useMemo(() => {
    const flagged = allCamps.some(c => c.sys !== undefined);
    const cut = data?.systemEntry || "2026-06-26";
    return (c) => flagged ? !!c.sys : (c.entryDate && c.entryDate >= cut);
  }, [allCamps, data]);
  const rows = useMemo(() => mode === "sys" ? allCamps.filter(isSys) : allCamps, [allCamps, isSys, mode]);
  const A = useMemo(() => aggOf(rows), [rows]);

  // ── verdict for the SELECTED cohort (same thresholds as the ledger script)
  const verdict = useMemo(() => {
    let status = "insufficient-n";
    if (A.n >= 20) {
      if ((A.pf ?? 0) >= 1.3 && (A.edgeRatio ?? 0) >= 1.2 && (A.expR ?? 0) > 0.1) status = "on-track";
      else if ((A.pf ?? 0) >= 1.0) status = "marginal";
      else status = "off-track";
    } else if (A.n >= 8) {
      status = (A.pf ?? 0) >= 1.2 ? "early-positive" : (A.pf ?? 0) >= 0.9 ? "early-neutral" : "early-negative";
    }
    return status;
  }, [A]);

  // ── equity curve + rolling expectancy for the selected cohort
  const eq = useMemo(() => {
    const ordered = rows.filter(c => (c.blendedR ?? c.rSum) != null).sort((a, b) => (a.lastExit || "").localeCompare(b.lastExit || ""));
    let cum = 0, cumUsd = 0;
    return ordered.map((c, i) => { cum += (c.blendedR ?? c.rSum); cumUsd += (c.pl || 0); return { i: i + 1, d: c.lastExit, t: c.ticker, r: +(c.blendedR ?? c.rSum).toFixed(2), cum: +cum.toFixed(2), cumUsd: Math.round(cumUsd) }; });
  }, [rows]);
  const eqMA = useMemo(() => eq.map((p, i) => {
    const win = eq.slice(Math.max(0, i - eqMaP + 1), i + 1);
    const ma = win.reduce((s, x) => s + x.cum, 0) / win.length;
    return { ...p, ma: +ma.toFixed(2), below: p.cum < ma };
  }), [eq, eqMaP]);
  const eqState = useMemo(() => {
    if (eqMA.length < 2) return null;
    const on = (x) => x.cum >= x.ma;
    const last = eqMA[eqMA.length - 1], above = on(last);
    let streak = 0; for (let i = eqMA.length - 1; i >= 0; i--) { if (on(eqMA[i]) === above) streak++; else break; }
    return { above, gap: +(last.cum - last.ma).toFixed(2), cum: last.cum, ma: last.ma, streak };
  }, [eqMA]);
  const roll = useMemo(() => eq.map((_, i) => {
    const w = eq.slice(Math.max(0, i - 9), i + 1).map(p => p.r);
    return { i: i + 1, exp: +(w.reduce((s, x) => s + x, 0) / w.length).toFixed(2) };
  }), [eq]);

  const hist = useMemo(() => HB.map(([lo, hi, lab]) => ({
    bucket: lab, n: A.rlist.filter(r => r >= lo && r < hi).length,
    tone: lab === "scratch" ? T.grey : lo < 0 ? T.red : T.green,
  })), [A]);

  // ── ENTRY REFINEMENT LAB ───────────────────────────────────────────────────
  // ERA-AWARE loss discipline (Valen 2026-07-11): the 3-stop rule went live with SOFI on
  // 2026-07-10. Before that, a loser's DESIGN cap was the full stop (−1R); only from Jul 10
  // is the cap −0.67R. Judging June losers against the 3-stop cap would manufacture breaches.
  const THREE_STOP_START = "2026-07-10";
  const lab = useMemo(() => {
    const W = rows.filter(c => c.pl > 0), L = rows.filter(c => c.pl <= 0);
    // Rungs measured from the day AFTER entry (maeR1) — day-0 lows mostly print BEFORE an ORB
    // entry and the stop IS that LoD, so including them made "63% of winners through full stop"
    // (impossible for a real post-entry sweep — Valen caught it, 2026-07-11).
    const wMAE = W.map(c => c.maeR1).filter(v => v != null);
    const rung = (lvl) => wMAE.length ? Math.round(100 * wMAE.filter(v => v <= lvl).length / wMAE.length) : null;
    // 3-stop vs 1-stop counterfactual, aggregated — the money answer to "would the 3-stop
    // structure hurt me?"
    const simPairs = rows.filter(c => c.sim3stop != null && c.sim1stop != null);
    const sim3 = mean(simPairs.map(c => c.sim3stop)), sim1 = mean(simPairs.map(c => c.sim1stop));
    const lR = L.map(c => c.blendedR ?? c.rSum).filter(v => v != null && isFinite(v));
    const is3s = (c) => c.entryDate && c.entryDate >= THREE_STOP_START;
    // breach = loss beyond THAT trade's design cap + slippage allowance:
    // 3-stop era → cap 0.67R (breach < −0.85R) · before → full stop 1R (breach < −1.15R)
    const breaches = L.filter(c => { const r = c.blendedR ?? c.rSum; return r != null && r <= (is3s(c) ? -0.85 : -1.15); });
    const L3 = L.filter(is3s);
    const l3R = L3.map(c => c.blendedR ?? c.rSum).filter(v => v != null && isFinite(v));
    const lMFE = L.map(c => c.mfeR).filter(v => v != null);
    const nearMiss = L.filter(c => c.mfeR != null && c.mfeR >= 1);
    const caps = W.map(c => c.capture).filter(v => v != null);
    const cutEarly = W.filter(c => c.capture != null && c.capture < 0.4);
    const bigLeftOnTable = W.filter(c => c.mfeR != null && c.blendedR != null && c.mfeR - c.blendedR >= 1.5);
    // Extension-at-entry gate slice (≤4× is the gate) — recorded value first, bar-computed fallback
    const extOf = (c) => c.extEntry ?? c.extEntryCalc ?? null;
    const extKnown = rows.filter(c => extOf(c) != null);
    const extOK = extKnown.filter(c => extOf(c) <= 4), extHot = extKnown.filter(c => extOf(c) > 4);
    // LoD-distance gate (≤0.60 ATR): captured entry_gates first, EOD approximation fallback
    const lodOf = (c) => (c.gates && c.gates.lod_dist_atr != null) ? +c.gates.lod_dist_atr : (c.lodDistAtr ?? null);
    const lodKnown = rows.filter(c => lodOf(c) != null);
    const lodOK = lodKnown.filter(c => lodOf(c) <= 0.6), lodHot = lodKnown.filter(c => lodOf(c) > 0.6);
    // Grade slice — grade may be a letter string (new payloads) or a legacy snapshot object
    const gradeStr = (c) => typeof c.grade === "string" ? c.grade : (c.grade && c.grade.letter) || null;
    const gA = rows.filter(c => /^A/.test(gradeStr(c) || "")), gB = rows.filter(c => /^B/.test(gradeStr(c) || "")), gU = rows.filter(c => !gradeStr(c));
    // Trim tournament — the four counterfactuals vs never-trim, same EOD price basis
    const tRows = rows.filter(c => c.vT3_25 != null && c.shadowR != null);
    const variant = (key, label) => {
      const vals = tRows.map(c => c[key]).filter(v => v != null && isFinite(v));
      const beat = tRows.filter(c => c[key] != null && c.shadowR != null && c[key] >= c.shadowR).length;
      return { key, label, n: vals.length, meanR: mean(vals), medR: median(vals), totR: vals.reduce((s, v) => s + v, 0), beatPct: tRows.length ? Math.round(100 * beat / tRows.length) : null };
    };
    const tourney = tRows.length >= 5 ? [
      variant("vT3_25", "T+3 · trim 25%"), variant("vT3_33", "T+3 · trim 33%"),
      variant("vT5_25", "T+5 · trim 25%"), variant("vT5_33", "T+5 · trim 33%"),
      variant("shadowR", "Never trim (hold all)"),
    ] : null;
    // Gate JSON coverage
    const gated = rows.filter(c => c.gates && Object.keys(c.gates).length);
    const gateSlice = (key, pass) => {
      const have = gated.filter(c => c.gates[key] !== undefined);
      const p = have.filter(c => pass(c.gates[key])), f = have.filter(c => !pass(c.gates[key]));
      return { n: have.length, pass: aggOf(p), fail: aggOf(f) };
    };
    return {
      sim3, sim1, simN: simPairs.length, simDelta: sim3 != null && sim1 != null ? sim3 - sim1 : null,
      wMAEn: wMAE.length, rung33: rung(-0.33), rung67: rung(-0.67), rung100: rung(-1.0),
      avgLossR: mean(lR), worstR: lR.length ? Math.min(...lR) : null,
      n3sLosers: L3.length, avgLoss3s: mean(l3R), // 3-stop era only (entered ≥ 2026-07-10)
      breaches, breachPct: L.length ? Math.round(100 * breaches.length / L.length) : null,
      nearMiss, nearMissPct: lMFE.length ? Math.round(100 * nearMiss.length / lMFE.length) : null,
      capMed: median(caps), capN: caps.length, cutEarly, bigLeftOnTable,
      extOK: aggOf(extOK), extHot: aggOf(extHot), extUnknown: rows.length - extKnown.length,
      lodOK: aggOf(lodOK), lodHot: aggOf(lodHot), lodUnknown: rows.length - lodKnown.length,
      gA: aggOf(gA), gB: aggOf(gB), gU: aggOf(gU), gradeStr, tourney, tourneyN: tRows.length,
      gatedN: gated.length,
      gates: gated.length ? {
        lod: gateSlice("lod_dist_atr", v => +v <= 0.6),
        rvol: gateSlice("rvol_tm", v => +v >= 1.3),
        orb: gateSlice("orb_wait", v => !!v),
        sized: gateSlice("sized_same_d", v => !!v),
      } : null,
    };
  }, [rows]);

  // ── BENCHMARK SCOREBOARD — the numbers to track religiously, with pass/fail
  const dk = data?.derisk || {};
  const board = useMemo(() => {
    const rowsB = [
      { label: "Expectancy / trade", live: sgnR(A.expR), bench: "≥ +0.25R", ok: A.expR == null ? null : A.expR >= 0.25, tip: "Mean R per closed campaign. +0.25R is the rolling line the system must hold — below it for 10+ trades, investigate before the month forces you to." },
      { label: "Profit factor ($)", live: num(A.pf), bench: "≥ 1.30", ok: A.pf == null ? null : A.pf >= 1.3, tip: "Gross $ won ÷ gross $ lost. 1.3 = every dollar lost buys $1.30 back — the minimum for a system worth sizing up." },
      { label: "Edge ratio", live: num(A.edgeRatio), bench: "≥ 1.20", ok: A.edgeRatio == null ? null : A.edgeRatio >= 1.2, tip: "Actual payoff ÷ the payoff your win rate REQUIRES to break even. 1.2 = 20% margin of safety over breakeven." },
      { label: "SQN (Tharp)", live: num(A.sqn), bench: "≥ 1.6", ok: A.sqn == null ? null : A.sqn >= 1.6, tip: "System Quality Number = mean(R)/σ(R)·√n. 1.6 = tradeable, 2–3 = good, 3+ = excellent. Punishes inconsistency, not just low returns." },
      { label: "Avg loss — 3-stop era", live: lab.avgLoss3s == null ? "no closed losers yet" : sgnR(lab.avgLoss3s) + ` (n=${lab.n3sLosers})`, bench: "≥ −0.75R", ok: lab.n3sLosers >= 3 ? lab.avgLoss3s >= -0.75 : null, tip: "The 3-stop rule went live with SOFI on 2026-07-10 — only losers entered from that date are judged against its −0.67R design cap (+ slippage). Earlier trades ran a full −1R stop by design and are NOT graded here. Verdict activates at 3 losers." },
      { label: "Deep losses (beyond design cap)", live: lab.breachPct == null ? "—" : lab.breaches.length + " (" + lab.breachPct + "% of losers)", bench: "≤ 10%", ok: lab.breachPct == null ? null : lab.breachPct <= 10, tip: "Era-aware: a breach means the loss exceeded THAT trade's own design cap + slippage — beyond −0.85R for 3-stop-era trades (entered ≥ 2026-07-10), beyond −1.15R for the full-stop era before it. Each breach has a name — see the Entries section." },
      { label: "Winner capture (median)", live: num(lab.capMed), bench: "≥ 0.50", ok: lab.capMed == null ? null : lab.capMed >= 0.5, tip: "Banked R ÷ best R offered (MFE), winners only. Below 0.5 = the exits give back more than half of what the trades offer — cutting winners too early." },
      { label: "Near-miss losers", live: lab.nearMissPct == null ? "—" : lab.nearMiss.length + " (" + lab.nearMissPct + "% of losers)", bench: "≤ 15%", ok: lab.nearMissPct == null ? null : lab.nearMissPct <= 15, tip: "Losers that saw ≥ +1R open profit before dying red. The T+3 trim window exists precisely to convert these — each one is a missed protocol application." },
      { label: "T+3–5 trim adherence", live: dk.adherencePct != null ? num(dk.adherencePct, 0) + "%" : "—", bench: "≥ 80%", ok: dk.adherencePct == null ? null : dk.adherencePct >= 80, tip: "Share of trimmed system campaigns whose FIRST trim landed on day 3–5 — the derisk protocol executed as designed. (System cohort only.)" },
      { label: "Equity vs its " + eqMaP + "-MA", live: eqState ? (eqState.above ? "above " : "below ") + sgnR(eqState.gap) : "—", bench: "above", ok: eqState ? eqState.above : null, tip: "Trade your own equity curve like a stock: below its MA = real drawdown, not noise → halve new-position risk until it reclaims the line." },
    ];
    const fails = rowsB.filter(r => r.ok === false);
    const level = fails.length === 0 ? "on" : fails.length === 1 ? "drift" : "off";
    return { rows: rowsB, fails, level };
  }, [A, lab, dk, eqState, eqMaP]);
  const bd = board.level === "on"
    ? { word: "ON TRACK", col: T.green, bd: "rgba(34,197,94,0.35)", bg: "rgba(34,197,94,0.07)" }
    : board.level === "drift"
      ? { word: "DRIFTING", col: T.goldBright, bd: "rgba(240,192,80,0.35)", bg: "rgba(201,152,42,0.07)" }
      : { word: "OFF TRACK", col: T.red, bd: "rgba(239,68,68,0.35)", bg: "rgba(239,68,68,0.07)" };

  const scat = useMemo(() => {
    const cs = rows.filter(c => c.mfeR != null && (c.blendedR ?? c.rSum) != null);
    return {
      w: cs.filter(c => c.pl > 0).map(c => ({ x: c.mfeR, y: c.blendedR ?? c.rSum, t: c.ticker, cap: c.capture })),
      l: cs.filter(c => c.pl <= 0).map(c => ({ x: c.mfeR, y: c.blendedR ?? c.rSum, t: c.ticker, cap: c.capture })),
      max: Math.max(2, ...cs.map(c => c.mfeR)),
    };
  }, [rows]);
  const strip = (arr) => { const counts = {}; return (arr || []).map(d => { counts[d] = (counts[d] || 0) + 1; return { x: d, y: counts[d] }; }); };
  const mfeDots = useMemo(() => strip(data?.derisk?.dayMFEs), [data]);
  const trimDots = useMemo(() => strip(data?.derisk?.trimDays), [data]);
  const sorted = useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      const g = (r) => sortKey === "r" ? (r.blendedR ?? r.rSum) : r[sortKey];
      const va = g(a), vb = g(b);
      if (va == null) return 1; if (vb == null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir;
    });
    return list;
  }, [rows, sortKey, sortDir]);
  const span = useMemo(() => {
    const ins = rows.map(c => c.entryDate).filter(Boolean).sort();
    const outs = rows.map(c => c.lastExit).filter(Boolean).sort();
    return { first: ins[0] || null, last: outs[outs.length - 1] || null };
  }, [rows]);

  if (!isAdmin) return null;
  if (!data) return <div style={{ fontFamily: font, color: T.muted, padding: 48, fontSize: "0.8rem" }}>Loading… (if empty, run <code>node --env-file=.env.local scripts/edge-ledger.mjs</code>)</div>;

  const rec = data.reconcile || {};
  const mc = (mode === "sys" ? data.monte?.system : data.monte?.all) || data.monte?.system || {};
  const stTone = verdict === "on-track" || verdict === "early-positive" ? T.green : String(verdict).includes("off") || String(verdict).includes("negative") ? T.red : T.goldBright;
  const th = (label, key, right) => (
    <th key={label} onClick={() => key && (sortKey === key ? setSortDir(d => -d) : (setSortKey(key), setSortDir(-1)))}
      style={{ ...thBase, textAlign: right ? "right" : "left", cursor: key ? "pointer" : "default" }}>
      {label}{key && sortKey === key ? (sortDir < 0 ? " ↓" : " ↑") : ""}
    </th>
  );
  // Two-line slice row — CANNOT overflow a narrow card (the 5-column grid version bled columns
  // into each other inside the rule cards, Valen screenshot 2026-07-11).
  const sliceRow = (label, s, tip) => (
    <div key={label} style={{ padding: "8px 4px", borderTop: `1px solid ${T.borderSoft}`, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span className="term" data-tip={tip} style={{ fontWeight: 700, fontSize: "0.76rem" }}>{label}</span>
        <b style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", fontSize: "0.8rem", color: s.expR == null ? T.muted : s.expR >= 0 ? T.green : T.red }}>{sgnR(s.expR)}</b>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: "0.66rem", color: T.muted, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
        <span>{s.n} trade{s.n === 1 ? "" : "s"}</span>
        <span>{s.wr == null ? "—" : Math.round(s.wr) + "% win"}</span>
        <span>PF {s.pf == null ? "—" : s.pf === Infinity ? "∞" : num(s.pf)}</span>
      </div>
    </div>
  );

  return (
    <div className="qa" style={{ fontFamily: font, maxWidth: 1440, margin: "0 auto", color: T.text }}>
      {/* .term tooltips are scoped to .vj/.vp in App.jsx — this page needs its own scope or every
          data-tip is silently dead (Valen found the definitions never showed, 2026-07-11). */}
      <style>{`
        .qa .term{border-bottom:1px dotted rgba(201,152,42,0.5); cursor:help; position:relative}
        .qa .term:hover::after{content:attr(data-tip); position:absolute; left:0; top:150%; width:300px;
          background:#11111b; border:1px solid rgba(255,255,255,0.14); border-radius:10px; padding:10px 13px;
          font-size:0.68rem; line-height:1.65; color:#E7E9EE; z-index:60; white-space:normal; font-weight:500;
          text-transform:none; letter-spacing:0; box-shadow:0 10px 30px rgba(0,0,0,0.6)}
        .qa .term.tipright:hover::after{left:auto; right:0}
        body.qa-open .viv-cursor-glow{display:none !important}
      `}</style>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "4px 0 18px", flexWrap: "wrap" }}>
        <button onClick={() => setPage && setPage("dashboard")} style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.muted, borderRadius: 8, padding: "5px 13px", cursor: "pointer", fontFamily: font, fontSize: "0.72rem" }}>← Dashboard</button>
        <div>
          <div style={{ fontSize: "1.05rem", fontWeight: 800, letterSpacing: "-0.01em" }}>Quant Analysis</div>
          <div style={{ fontSize: "0.62rem", color: T.faint, marginTop: 1 }}>{mode === "sys" ? `SYSTEM COHORT · ENTERED ≥ ${data.systemEntry}` : `FULL JOURNAL · SINCE ${data.since || "2026-05-01"}`} · N={A.n} CLOSED CAMPAIGNS</div>
        </div>
        <span style={{ display: "inline-flex", gap: 4, marginLeft: 6 }}>
          {[["sys", "System cohort"], ["all", "Full journal"]].map(([k, lab2]) => (
            <button key={k} onClick={() => setMode(k)} title={k === "sys" ? `Campaigns entered on/after ${data.systemEntry} — the 3-stop / derisk-trim book` : `Every verified campaign since ${data.since || "May"} — the same population the journal page shows, campaign-merged`}
              style={{ background: mode === k ? "rgba(201,152,42,0.12)" : "transparent", border: `1px solid ${mode === k ? T.gold : T.border}`, color: mode === k ? T.goldBright : T.faint, borderRadius: 8, padding: "4px 11px", cursor: "pointer", fontFamily: font, fontSize: "0.68rem", fontWeight: 700 }}>{lab2}</button>
          ))}
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", fontSize: "0.64rem", fontWeight: 800, letterSpacing: "0.1em", color: stTone, border: `1px solid ${stTone}44`, borderRadius: 99, padding: "4px 13px" }}>
          {dot(stTone)}{String(verdict).toUpperCase().replace(/-/g, " ")}
        </span>
        <span style={{ fontSize: "0.62rem", color: T.faint }}>{String(data.asof).slice(0, 16).replace("T", " ")} UTC</span>
      </div>

      {/* how to read this page — the 30-second orientation */}
      <section style={{ background: "rgba(201,152,42,0.04)", border: `1px solid var(--borderGold, rgba(201,152,42,0.3))`, borderRadius: 14, padding: "14px 20px", marginBottom: 16 }}>
        <SecHead>How to read this page</SecHead>
        <div style={{ fontSize: "0.74rem", lineHeight: 1.75, color: T.muted, marginTop: 8, maxWidth: "100ch" }}>
          The journal records your trades; <b style={{ color: T.text }}>this page judges the SYSTEM behind them</b>. It answers five questions, one section each:
          is the system doing its job (<b style={{ color: T.text }}>scoreboard</b> — 10 numbers with fixed targets; every MISS names the section that explains it) ·
          do my <b style={{ color: T.text }}>entry rules</b> make money · how much of each winner do my <b style={{ color: T.text }}>exits</b> keep ·
          am I following the <b style={{ color: T.text }}>trim rule</b> and does it pay · and what can the <b style={{ color: T.text }}>next 100 trades</b> look like.
          Read the gold "WHAT IT SAYS NOW" line first in every section — the chart below it is just the evidence. Hover any dotted term for its definition.
        </div>
      </section>

      {/* reconciliation — why this N vs the journal's N */}
      <Panel title="What's counted here (vs the journal)" meta={`${rec.fillsVerified ?? "—"} fills → ${rec.campaignsAll ?? allCamps.length} campaigns → ${rec.campaignsSystem ?? "—"} system`}
        footnote="The journal page counts campaign rows across its date filter; this page counts the SAME campaigns, chosen by the toggle above. Full journal here ≈ the journal page with no date filter (minus the exclusions listed). Every number on this page is computed from exactly the cohort named in the header — nothing is inherited from a different population.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 26px" }}>
          {[
            ["Fills since " + (rec.since || "May"), rec.fillsAll],
            ["Pipeline-verified", rec.fillsVerified],
            ["Legacy excluded", rec.legacyExcluded],
            ["Dupes dropped", rec.dupesDropped],
            ["→ Campaigns (full journal)", rec.campaignsAll ?? allCamps.length],
            ["→ System cohort (≥ " + (rec.systemEntry || data.systemEntry) + ")", rec.campaignsSystem],
            ["Option campaigns", rec.optionCampaigns ?? 0],
            ["Open runners (not counted)", rec.openRunners],
          ].map(([k, val]) => (
            <div key={k}>
              <div style={{ fontSize: "0.54rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: T.faint }}>{k}</div>
              <div style={{ fontSize: "0.9rem", fontWeight: 700, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{val ?? "—"}</div>
            </div>
          ))}
        </div>
      </Panel>

      {/* DATA COVERAGE — every exclusion NAMED. An unnamed exclusion is how "is AMD missing?"
          happens; this panel makes silent data loss structurally impossible to hide. */}
      {data.coverage && (
        <Panel title="Data coverage — every exclusion has a name" meta={`${data.coverage.scored} of ${allCamps.length} campaigns fully scored · ${data.coverage.intraday0} with intraday day-0`} collapsed
          footnote="Scored = has bar-derived metrics (MFE/MAE, sims). A campaign can still count in win rate and $ P&L while excluded here — exclusion reasons are about the R/bar math only. If a name you traded is missing from BOTH the scored set and this list, that IS a bug: flag it immediately.">
          {(data.coverage.excluded || []).length === 0
            ? <div style={{ fontSize: "0.72rem", color: T.muted }}>Nothing excluded — every campaign carries full metrics.</div>
            : (data.coverage.excluded || []).map((x, i) => (
              <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", padding: "6px 4px", borderTop: i ? `1px solid ${T.borderSoft}` : "none", fontSize: "0.72rem" }}>
                <b style={{ minWidth: 56 }}>{x.t}</b>
                <span style={{ color: T.muted, minWidth: 84, fontVariantNumeric: "tabular-nums" }}>{x.d || "no date"}</span>
                <span style={{ color: T.faint, fontSize: "0.66rem" }}>{x.sys ? "system cohort" : "full journal"}</span>
                <span style={{ color: T.muted, flex: "1 1 240px" }}>{x.why}</span>
              </div>
            ))}
          {(data.coverage.barsMissing || []).length > 0 && <div style={{ fontSize: "0.66rem", color: T.red, marginTop: 8 }}>Price-feed gaps (rerun the ledger; if persistent, the ticker may be delisted/renamed): {data.coverage.barsMissing.join(" · ")}</div>}
        </Panel>
      )}

      {/* BENCHMARK SCOREBOARD — the religious tracker */}
      <section style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
        <div style={{ marginBottom: 10 }}>
          <SecHead>System scoreboard — is the system doing its job?</SecHead>
          <div style={{ fontSize: "0.68rem", color: T.muted, marginTop: 4, lineHeight: 1.6 }}>Ten numbers, each with a FIXED target the system was designed to. This is the whole page in one table — everything below only explains the misses.</div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "4px 12px", padding: "12px 16px", borderRadius: 12, background: bd.bg, border: `1px solid ${bd.bd}`, marginBottom: 12 }}>
          <b style={{ color: bd.col, fontSize: "0.95rem", fontWeight: 800, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{bd.word}</b>
          <span style={{ fontSize: "0.7rem", color: T.muted, lineHeight: 1.5, flex: "1 1 220px", minWidth: 0 }}>
            {board.fails.length === 0 ? `all ${board.rows.filter(r => r.ok != null).length} benchmarks passing` : `${board.fails.length} of ${board.rows.filter(r => r.ok != null).length} benchmarks failing — ${board.fails.map(f => f.label.toLowerCase()).join(" · ")}`}
          </span>
          <span style={{ fontSize: "0.64rem", color: T.faint, whiteSpace: "nowrap" }}>{A.n} campaigns · {span.first || "—"} → {span.last || "—"}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(170px,1.5fr) minmax(120px,1fr) 90px 90px", gap: "0 10px", alignItems: "center", padding: "2px 6px 6px", fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: T.muted }}>
          <span>Benchmark metric</span><span>Live</span><span>Target</span><span style={{ textAlign: "right" }}>Verdict</span>
        </div>
        {board.rows.map(r => (
          <div key={r.label} style={{ display: "grid", gridTemplateColumns: "minmax(170px,1.5fr) minmax(120px,1fr) 90px 90px", gap: "2px 10px", alignItems: "center", padding: "8px 6px", borderTop: `1px solid ${T.borderSoft}`, fontSize: "0.76rem", minWidth: 0 }}>
            <span className="term" data-tip={r.tip} style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
            <b style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{r.live}</b>
            <span style={{ color: T.muted, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{r.bench}</span>
            <span style={{ textAlign: "right" }}><Chip ok={r.ok}>{r.ok == null ? "no data" : r.ok ? "PASS" : "MISS"}</Chip></span>
          </div>
        ))}
        <div style={{ fontSize: "0.62rem", color: T.muted, marginTop: 8, lineHeight: 1.5 }}>Benchmarks are fixed system targets, not aspirations — a MISS names the exact lab section below that explains it. Judge adherence (not outcome) until n ≥ 30; outcome readable at 30; Monte Carlo calibrated at 50.</div>
      </section>

      {/* KPI strip */}
      <section style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "14px 20px", marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "14px 18px" }}>
          <Kpi label="Net P&L" value={fmt$(A.net)} tone={A.net >= 0 ? T.green : T.red} sub="this cohort, closed only" />
          <Kpi label="Expectancy" value={sgnR(A.expR)} tone={(A.expR ?? 0) >= 0 ? T.green : T.red} sub="mean R / campaign" />
          <Kpi label="Win rate" value={A.wr == null ? "—" : Math.round(A.wr) + "%"} sub={`${A.nW}W / ${A.nL}L`} />
          <Kpi label="Payoff ($)" value={num(A.payoff)} sub={`breakeven needs ${num(A.wBE)}`} />
          <Kpi label="Profit factor" value={A.pf === Infinity ? "∞" : num(A.pf)} sub="gross won ÷ gross lost" />
          <Kpi label="SQN" value={num(A.sqn)} sub="Tharp scale · 2+ good" />
          <Kpi label="Sample" value={`${A.n} / 50`} sub={A.n >= 30 ? "outcome readable" : "building to 30 — judge adherence"} />
        </div>
      </section>

      {/* ENTRY REFINEMENTS */}
      <Panel title="Entry Refinements — do your entry rules make money?" meta={`${lab.wMAEn} winners have MAE (worst-dip) data`}
        howto={[
          "Each box below is ONE rule, tested on its own.",
          "3-stop rungs: how deep eventual WINNERS dipped. Most surviving rung 1 = the first stop earns its keep at ⅓ size. Many through rung 2 = entries are loose against the LoD, or triggers fire early.",
          "Deep losses: every loss that beat its own era's cap, BY NAME — slippage, a sizing-anchor mismatch (size with the SAME D as the stops), or discipline.",
          "Gate boxes: expectancy on each side of the gate. A gate that doesn't separate expectancy is theatre; a gate you violate profitably is mis-calibrated.",
          "Rung caveat: MAE uses DAILY bars, and the entry-day low usually prints BEFORE an ORB entry — the bar can't see the clock. Rung percentages are OVERSTATED (upper bounds) until entry-time capture builds up.",
        ]}>
        <Say>
          {lab.avgLossR != null && <>Your average loser costs <b>{sgnR(lab.avgLossR)}</b> across this cohort. The 3-stop rule only exists from <b>2026-07-10 (SOFI)</b> — {lab.n3sLosers >= 1 ? <>its own losers so far average <b>{sgnR(lab.avgLoss3s)}</b> (n={lab.n3sLosers}) against the −0.67R design cap</> : <>no 3-stop-era loser has closed yet, so its −0.67R cap has nothing to grade</>}; earlier trades ran a full −1R stop by design and are judged against THAT. </>}
          {lab.breaches.length > 0 && <><b style={{ color: T.red }}>{lab.breaches.length} loser{lab.breaches.length === 1 ? "" : "s"}</b> exceeded their own era's cap (chips below). </>}
          {lab.extOK.n >= 3 && lab.extHot.n >= 3 ? <>Entries taken fresh (≤4× extended) run <b>{sgnR(lab.extOK.expR)}</b>/trade vs <b>{sgnR(lab.extHot.expR)}</b> when chased — that difference is what the extension gate is worth in your own money.</> : <>Not enough campaigns on both sides of the extension gate yet to price it — keep logging.</>}
        </Say>
        {/* one rule per ROW — full-width cards, never a cramped mosaic (Valen 2026-07-11) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          {/* ── RULE CARD: 3-stop structure ── */}
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", background: "rgba(255,255,255,0.015)" }}>
            <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: T.gold, marginBottom: 6 }}>Rule · 3-stop structure — how deep do winners dip?</div>
            {/* VERDICT — the money answer: every campaign replayed with the 3 rungs vs one full stop */}
            {lab.simN >= 5 && lab.simDelta != null && (
              <div style={{ padding: "8px 12px", borderRadius: 10, marginBottom: 8, background: lab.simDelta >= 0 ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)", border: `1px solid ${lab.simDelta >= 0 ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, fontSize: "0.72rem", lineHeight: 1.6 }}>
                <Chip ok={lab.simDelta >= 0}>{lab.simDelta >= 0 ? "3-STOP WOULD HAVE HELPED" : "3-STOP WOULD HAVE COST YOU"}</Chip>
                <div style={{ marginTop: 3, color: T.muted }}>Replaying your {lab.simN} campaigns: 3-stop <b style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{sgnR(lab.sim3)}</b>/trade vs one full stop <b style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{sgnR(lab.sim1)}</b>/trade → difference <b style={{ color: lab.simDelta >= 0 ? T.green : T.red, fontVariantNumeric: "tabular-nums" }}>{sgnR(lab.simDelta)}</b> per trade. EOD replay from the day after entry; both arms share the same assumptions, so the DIFFERENCE is the honest read.</div>
              </div>
            )}
            <div style={{ fontSize: "0.62rem", color: T.faint, lineHeight: 1.5, marginBottom: 4 }}>Dips measured from your ENTRY TIME onward: entry-day heat comes from 5-minute bars where your entry time is recorded ({(data.coverage?.intraday0 ?? 0)} campaigns covered); trades without a time skip day 0 (that low usually prints before an ORB entry). Later days use daily lows.</div>
            {[
              { lvl: "through rung 1 (−0.33R)", v: lab.rung33, note: "expected to be common — that's why only ⅓ of size sits there", warnAt: null },
              { lvl: "through rung 2 (−0.67R)", v: lab.rung67, note: "should be rare — high = loose entries vs LoD or early triggers", warnAt: 25 },
              { lvl: "through full stop (−1.00R)", v: lab.rung100, note: "a winner surviving a REAL post-entry sweep is near-impossible — residual % here is gap noise in the daily bars", warnAt: 10 },
            ].map(r => (
              <div key={r.lvl} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "7px 2px", borderTop: `1px solid ${T.borderSoft}`, fontSize: "0.74rem" }}>
                <span style={{ flex: "0 0 190px", fontWeight: 700 }}>{r.lvl}</span>
                <b style={{ fontVariantNumeric: "tabular-nums", color: r.warnAt != null && r.v != null && r.v > r.warnAt ? T.red : T.text }}>{r.v == null ? "—" : r.v + "% of winners"}</b>
                <span style={{ fontSize: "0.62rem", color: T.faint, lineHeight: 1.4 }}>{r.note}</span>
              </div>
            ))}
            <div style={{ marginTop: 10, fontSize: "0.74rem", display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
              <span>avg loss <b style={{ fontVariantNumeric: "tabular-nums" }}>{sgnR(lab.avgLossR)}</b> <span style={{ color: T.faint, fontSize: "0.62rem" }}>cohort · cap −1R before 07-10, −0.67R after</span></span>
              <span>worst <b style={{ fontVariantNumeric: "tabular-nums" }}>{sgnR(lab.worstR)}</b></span>
            </div>
            {lab.breaches.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: T.muted, marginBottom: 4 }}>Losses beyond their own era's design cap — every one has a name</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {lab.breaches.map((c, i) => (
                    <span key={i} title={`${c.ticker} · ${c.lastExit || ""} · ${sgnR(c.blendedR ?? c.rSum)} · ${c.reasons || ""}`}
                      style={{ fontSize: "0.66rem", fontWeight: 700, border: `1px solid rgba(239,68,68,0.35)`, color: T.red, borderRadius: 99, padding: "2px 9px", fontVariantNumeric: "tabular-nums" }}>
                      {c.ticker} {sgnR(c.blendedR ?? c.rSum, 2)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* ── RULE CARD: extension gate ── */}
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", background: "rgba(255,255,255,0.015)" }}>
            <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: T.gold, marginBottom: 6 }}>Rule · Extension ≤ 4× from the 50MA</div>
            <div style={{ marginBottom: 4 }}>{lab.extOK.n >= 5 && lab.extHot.n >= 4
              ? <Chip ok={(lab.extOK.expR ?? -9) > (lab.extHot.expR ?? -9)}>{(lab.extOK.expR ?? -9) > (lab.extHot.expR ?? -9) ? "GATE EARNS ITS KEEP — fresh entries make more" : "NOT SEPARATING — chased entries did as well; keep watching"}</Chip>
              : <Chip ok={null}>BUILDING SAMPLE</Chip>}</div>
            {sliceRow("Extension ≤ 4× at entry", lab.extOK, "Campaigns entered with ATR%-multiple from the 50MA at or under 4× — the freshness gate. Uses your recorded value when present, else computed from daily bars (SMA50 + ATR14 as of entry). Expectancy here vs the hot side IS the gate's proof.")}
            {sliceRow("Extension > 4× at entry", lab.extHot, "Chased entries — extension above 4× when the trigger fired. If this side's expectancy is negative, every violation has a known price.")}
            {lab.extUnknown > 0 && <div style={{ fontSize: "0.62rem", color: T.faint, padding: "5px 4px" }}>{lab.extUnknown} campaigns lack bar history for the calc — excluded, not guessed.</div>}
          </div>
          {/* ── RULE CARD: LoD-distance gate ── */}
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", background: "rgba(255,255,255,0.015)" }}>
            <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: T.gold, marginBottom: 6 }}>Rule · LoD-distance ≤ 60% of ATR</div>
            <div style={{ marginBottom: 4 }}>{lab.lodOK.n >= 5 && lab.lodHot.n >= 5
              ? <Chip ok={(lab.lodOK.expR ?? -9) > (lab.lodHot.expR ?? -9)}>{(lab.lodOK.expR ?? -9) > (lab.lodHot.expR ?? -9) ? "GATE EARNS ITS KEEP — tight entries make more" : "NOT SEPARATING — loose entries did as well; keep watching"}</Chip>
              : <Chip ok={null}>BUILDING SAMPLE</Chip>}</div>
            {sliceRow("LoD-dist ≤ 0.6 ATR", lab.lodOK, "Entries where the low-of-day sat within 60% of one ATR of the entry price — the tight-stop gate. Until the trade-log's live capture builds up, this uses the ENTRY DAY's final low from EOD bars — an upper bound of the true at-entry distance (the low can print after you entered).")}
            {sliceRow("LoD-dist > 0.6 ATR", lab.lodHot, "Gate violations — the stop anchor sat too far below the entry, making D wide and the R math expensive.")}
            {lab.lodUnknown > 0 && <div style={{ fontSize: "0.62rem", color: T.faint, padding: "5px 4px" }}>{lab.lodUnknown} campaigns lack an entry-day bar match — excluded, not guessed.</div>}
          </div>
          {/* ── RULE CARD: 30-min wait gate (simulated with real 5-min bars) ── */}
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", background: "rgba(255,255,255,0.015)" }}>
            <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: T.gold, marginBottom: 6 }}>Rule · 30-min wait gate — enter after 10:00 ET</div>
            {(() => {
              const wg = data.waitGate;
              if (!wg || !wg.simmed) return <div style={{ fontSize: "0.68rem", color: T.muted, lineHeight: 1.6 }}>No eligible campaigns simulated yet — needs a recorded pre-10:00 entry time and 5-minute bar history (≈60 days). Grows automatically as entries are logged with times.</div>;
              return (
                <div style={{ fontSize: "0.74rem", lineHeight: 1.8 }}>
                  <div>Your pre-10:00 entries, replayed as if you'd waited for the 10:00 ET bar (same stop, same exit day):</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 18px", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                    <span>as traded <b style={{ color: (wg.actMeanR ?? 0) >= 0 ? T.green : T.red }}>{sgnR(wg.actMeanR)}</b>/trade</span>
                    <span>with the wait <b style={{ color: (wg.waitMeanR ?? 0) >= 0 ? T.green : T.red }}>{sgnR(wg.waitMeanR)}</b>/trade</span>
                    <span style={{ color: T.muted }}>n={wg.simmed} of {wg.eligible} eligible</span>
                  </div>
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {(wg.pairs || []).map((p, i) => (
                      <span key={i} title={`${p.t} ${p.d}: as traded ${sgnR(p.act)} · waited ${sgnR(p.wait)}`}
                        style={{ fontSize: "0.64rem", border: `1px solid ${T.borderSoft}`, borderRadius: 99, padding: "2px 9px", color: p.wait >= p.act ? T.green : T.muted, fontVariantNumeric: "tabular-nums" }}>
                        {p.t} {sgnR(p.act, 1)} → {sgnR(p.wait, 1)}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: "0.62rem", color: T.faint, marginTop: 6, lineHeight: 1.5 }}>Shadow basis (entry → final day's close, EOD). {wg.noTime} campaigns have no recorded entry time — excluded, not guessed. The ORB study found the wait's edge is fewer stop-outs; judge at n ≥ 15.</div>
                </div>
              );
            })()}
          </div>
          {/* ── RULE CARD: setup grade ── */}
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", background: "rgba(255,255,255,0.015)" }}>
            <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: T.gold, marginBottom: 6 }}>Context · setup grade at entry</div>
            <div style={{ marginBottom: 4 }}>{lab.gA.n >= 5
              ? <Chip ok={(lab.gA.expR ?? -9) > (lab.gU.expR ?? -9)}>{(lab.gA.expR ?? -9) > (lab.gU.expR ?? -9) ? "A-GRADES OUTPERFORM — the grader is predictive" : "A-GRADES UNDERPERFORMING — grading and outcomes disagree; review what the grader rewards"}</Chip>
              : <Chip ok={null}>BUILDING SAMPLE</Chip>}</div>
            {sliceRow("A-grade setups", lab.gA, "Campaigns whose ticker carried an A/A+ setup grade (frozen at entry).")}
            {sliceRow("B-grade setups", lab.gB, "Campaigns graded B at entry.")}
            {sliceRow("Ungraded", lab.gU, "No grade recorded at entry — the pre-grader era or skipped grading.")}
          </div>
          {/* ── RULE CARD: playbook gates awaiting live capture ── */}
          <div style={{ border: `1px solid ${T.borderSoft}`, borderRadius: 12, padding: "12px 14px", background: "rgba(255,255,255,0.012)" }}>
              <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: T.muted, marginBottom: 4 }}>Playbook gates — LoD-dist ≤ 60% ATR · time-matched RVOL · ORB wait · sized-same-D</div>
              {lab.gatedN === 0 ? (
                <div style={{ fontSize: "0.68rem", color: T.muted, lineHeight: 1.6 }}>
                  <b style={{ color: T.text }}>0 of {A.n}</b> campaigns carry gate data — capture starts with the next logged entry (the trade-log now records <code style={{ fontSize: "0.62rem" }}>entry_gates</code> at entry time: LoD-distance %ATR, RVOL, ORB wait-gate, DCR, sized-same-D). These rows will populate automatically; nothing is backfilled by guessing.
                </div>
              ) : (<>
                {sliceRow("LoD-dist ≤ 60% ATR (pass)", lab.gates.lod.pass, "Entries taken with the low-of-day within 60% of ATR — the tight-stop gate.")}
                {sliceRow("LoD-dist > 60% ATR (fail)", lab.gates.lod.fail, "Gate violations — stop too far from entry.")}
                {sliceRow("RVOL ≥ 1.3 at entry", lab.gates.rvol.pass, "Time-matched relative volume confirmed demand at the trigger.")}
                {sliceRow("RVOL < 1.3 at entry", lab.gates.rvol.fail, "Triggered without volume confirmation.")}
                {sliceRow("ORB wait-gate respected", lab.gates.orb.pass, "Waited the 30-minute gate before the 5-min ORB trigger — the delay that cut stopouts 41→28% in the study.")}
                {sliceRow("Sized with same D as stops", lab.gates.sized.pass, "Shares computed from the SAME distance the stops use — the SOFI sizing-anchor lesson.")}
              </>)}
          </div>
        </div>
      </Panel>

      {/* EXIT / WINNER MANAGEMENT LAB */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(430px, 1fr))", gap: 16 }}>
        <Panel title="Exits — how much of each winner do you keep?" meta={`median: 61% of max profit captured · n=${lab.capN}`}
          howto={[
            "Every dot is ONE trade.",
            "Across = the BEST profit it ever offered (its peak, in R). Up = what you actually BANKED.",
            "A dot ON the gold dashed line sold the exact top. The further below the line, the more was given back.",
            "Red dots to the right of 0R are losers that were winners first — the trim window exists to bank those.",
            "The measure behind this is MFE (maximum favorable excursion), from daily bars.",
          ]}>
          <Say>
            {lab.capMed != null ? <>You keep <b>{Math.round(lab.capMed * 100)}%</b> of what your average winner offers (target ≥ 50%){lab.capMed >= 0.5 ? " — exits are doing their job" : " — winners are being cut early"}. </> : <>No capture data yet. </>}
            {lab.nearMiss.length > 0 ? <><b style={{ color: T.red }}>{lab.nearMiss.length} loser{lab.nearMiss.length === 1 ? "" : "s"}</b> had ≥ +1R of open profit and still died red — those are the trades the T+3 trim exists to bank. That's the single most fixable leak on this chart.</> : <>No loser died red after showing +1R — the trim window is catching them.</>}
          </Say>
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ left: 0, right: 12, top: 12 }}>
              <CartesianGrid stroke={T.grid} strokeDasharray="3 5" />
              <XAxis type="number" dataKey="x" name="MFE" {...axis} domain={[0, Math.ceil(scat.max)]} tickFormatter={(t) => t + "R"} />
              <YAxis type="number" dataKey="y" name="banked" {...axis} width={38} tickFormatter={(t) => t + "R"} />
              <ZAxis range={[46, 46]} />
              {/* the "kept everything it offered" 45° line — ifOverflow keeps it VISIBLE even though
                  its top end exceeds the y-domain (recharts silently discarded it before; Valen
                  reported "I don't see any gold line") */}
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: Math.ceil(scat.max), y: Math.ceil(scat.max) }]} stroke={T.goldSoft} strokeWidth={1.5} strokeDasharray="5 4" ifOverflow="hidden" />
              <ReferenceLine y={0} stroke={T.border} />
              <Tooltip cursor={{ stroke: T.border }} content={<TT render={(p) => {
                const d = p[0]?.payload; if (!d) return null;
                return <><b>{d.t}</b><div>offered {num(d.x)}R → banked {num(d.y)}R</div>{d.cap != null && <div style={{ color: T.muted }}>captured {Math.round(d.cap * 100)}% of max profit</div>}</>;
              }} />} />
              <Scatter data={scat.w} fill={T.green} fillOpacity={0.85} />
              <Scatter data={scat.l} fill={T.red} fillOpacity={0.85} />
            </ScatterChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Result shape — where do your trades finish?" meta={`n=${A.nR} scored campaigns`}
          howto={[
            "Each bar counts trades that finished at that R.",
            "R = profit in units of what you risked: risk $1,000, make $3,000 = +3R; lose the full stop = −1R.",
            "Healthy shape: losses WALLED at −1R (nothing further left) and a real tail of +3R/+5R winners on the right.",
            "The right tail pays for everything — protect it before optimizing anything else.",
          ]}>
          <Say>
            {(() => {
              const beyond = A.rlist.filter(r => r < -1.05).length, losers = A.rlist.filter(r => r <= 0).length;
              const tail = A.rlist.filter(r => r >= 2).length;
              return <>
                {losers ? <>The loss wall: <b>{beyond === 0 ? "holding — no loser finished beyond −1R" : <span style={{ color: T.red }}>{beyond} of {losers} losers finished beyond −1R</span>}</b>. </> : null}
                Right tail: <b>{tail}</b> trade{tail === 1 ? "" : "s"} at +2R or better{tail ? " — the tail exists; protect it" : " — no big winners yet, which is what the expectancy math is waiting on"}.
              </>;
            })()}
          </Say>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={hist} margin={{ left: 0, right: 8, top: 18 }}>
              <CartesianGrid vertical={false} stroke={T.grid} strokeDasharray="3 5" />
              {/* horizontal labels, upright — the slanted version was unreadable (Valen 2026-07-11) */}
              <XAxis dataKey="bucket" {...axis} interval={0} angle={0} textAnchor="middle" height={28} tick={{ fill: T.muted, fontSize: 10, fontWeight: 600 }} />
              <YAxis {...axis} width={26} allowDecimals={false} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<TT render={(p) => <>{p[0]?.payload?.bucket}: <b>{p[0]?.payload?.n}</b> campaigns</>} />} />
              <Bar dataKey="n" radius={[3, 3, 0, 0]} maxBarSize={34}>
                {hist.map((d, i) => <Cell key={i} fill={d.tone} fillOpacity={0.7} />)}
                <LabelList dataKey="n" position="top" style={{ fill: T.muted, fontSize: 10 }} formatter={(x) => x || ""} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      {/* derisk protocol — system cohort by definition */}
      <Panel title="The T+3–5 trim rule — are you doing it, and does it pay?" meta={`adherence ${num(dk.adherencePct, 0)}% · target ≥ 80%`}
        howto={[
          "LEFT — one dot per WINNER: the day (after entry) it hit maximum profit. The shaded band is day 3–5; dots inside it = the rule is aimed exactly where your trades peak.",
          "CENTER — one dot per trimmed trade: the day you actually took the first trim. Dots left of the band = trimmed early.",
          "RIGHT — one bar per trade, SORTED biggest help → biggest cost: what trimming added vs never trimming. Green = the trim beat holding everything to the end.",
          `This panel always reads the system cohort — the protocol didn't exist before ${data.systemEntry}.`,
        ]}>
        <Say>
          You executed the trim inside day 3–5 on <b style={{ color: (dk.adherencePct ?? 0) >= 80 ? T.text : T.red }}>{num(dk.adherencePct, 0)}%</b> of trimmed trades (target 80%).
          {dk.medDayMFE != null && <> Your winners peak on day <b>{dk.medDayMFE}</b> — inside the window, so the rule FITS your trading; the gap is execution, not design.</>}
          {dk.deriskCostR != null && <> Net effect so far: trimming has {-dk.deriskCostR >= 0 ? <>ADDED <b style={{ color: T.green }}>{num(-dk.deriskCostR)}R</b></> : <>cost <b style={{ color: T.red }}>{num(dk.deriskCostR)}R</b></>} vs never trimming, across {dk.deriskCostN} trades.</>}
        </Say>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
          {[{ d: mfeDots, t: "DAY OF MAX PROFIT" }, { d: trimDots, t: "DAY OF FIRST TRIM" }].map((cfg, k) => (
            <div key={k}>
              <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", color: T.faint, marginBottom: 2 }}>{cfg.t}</div>
              <div style={{ marginBottom: 4 }}>
                {k === 0
                  ? (dk.medDayMFE != null ? <Chip ok={dk.medDayMFE >= 3 && dk.medDayMFE <= 5}>{dk.medDayMFE >= 3 && dk.medDayMFE <= 5 ? `MEDIAN DAY ${dk.medDayMFE} — RULE AIMED RIGHT` : `MEDIAN DAY ${dk.medDayMFE} — OUTSIDE THE WINDOW, RE-AIM`}</Chip> : <Chip ok={null}>NO DATA</Chip>)
                  : (dk.adherencePct != null ? <Chip ok={dk.adherencePct >= 80}>{dk.adherencePct >= 80 ? `${num(dk.adherencePct, 0)}% IN WINDOW — EXECUTING` : `${num(dk.adherencePct, 0)}% IN WINDOW — EXECUTION GAP (target 80%)`}</Chip> : <Chip ok={null}>NO DATA</Chip>)}
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <ScatterChart margin={{ left: 0, right: 8, top: 8 }}>
                  <XAxis type="number" dataKey="x" {...axis} domain={[0, 9]} tickCount={10} />
                  <YAxis type="number" dataKey="y" hide domain={[0, 4]} />
                  <ZAxis range={[42, 42]} />
                  <ReferenceArea x1={2.5} x2={5.5} fill={T.gold} fillOpacity={0.06} stroke={T.goldSoft} strokeOpacity={0.35} strokeDasharray="4 4" />
                  <Tooltip content={<TT render={(p) => <>day {p[0]?.payload?.x}</>} />} />
                  <Scatter data={cfg.d} fill={k === 0 ? T.green : T.blue} fillOpacity={0.85} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          ))}
          <div>
            {(() => {
              // SORTED by value (best → worst), scalable: ticker labels drop past 20 bars, the
              // tooltip keeps them. Headline = the % of trades where trimming helped.
              const tv = rows.filter(c => c.deriskCostR != null)
                .map(c => ({ t: c.ticker, v: +(-c.deriskCostR).toFixed(2), shadowR: c.shadowR, actual: c.blendedR }))
                .sort((a, b) => b.v - a.v);
              const helped = tv.filter(x => x.v >= 0).length;
              const excluded = rows.filter(c => c.deriskCostR == null);
              return (<>
                <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", color: T.faint, marginBottom: 2 }}>
                  TRIM VALUE ADDED VS NEVER-TRIM (R) <span style={{ color: T.muted, letterSpacing: 0, textTransform: "none", fontWeight: 600 }}>· one bar per trade, sorted</span>
                </div>
                <div style={{ marginBottom: 4 }}><Chip ok={(-dk.deriskCostR ?? 0) >= 0}>{`HELPED ON ${helped} OF ${tv.length} · NET ${sgnR(-dk.deriskCostR, 1)}`}</Chip></div>
                {/* every bar keeps its ticker — scroll sideways when the sample grows (AMD went
                    "missing" when labels were hidden; named bars are non-negotiable for audit) */}
                <div style={{ overflowX: "auto" }}>
                  <div style={{ minWidth: Math.max(280, tv.length * 34) }}>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={tv} margin={{ left: 0, right: 8, top: 8 }}>
                        <XAxis dataKey="t" {...axis} interval={0} angle={-38} textAnchor="end" height={42} tick={{ ...axis.tick, fontSize: 8.5 }} />
                        <YAxis {...axis} width={30} tickFormatter={(t) => t + "R"} />
                        <ReferenceLine y={0} stroke={T.border} />
                        <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<TT render={(p) => {
                          const d = p[0]?.payload; if (!d) return null;
                          return <><b>{d.t}</b><div>never-trim: {num(d.shadowR)}R · actual: {num(d.actual)}R</div><div>trim {d.v >= 0 ? "added" : "cost"} <b>{num(Math.abs(d.v))}R</b></div></>;
                        }} />} />
                        <Bar dataKey="v" radius={[2, 2, 0, 0]} maxBarSize={18}>
                          {tv.map((d, i) => <Cell key={i} fill={d.v >= 0 ? T.green : T.red} fillOpacity={0.7} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                {excluded.length > 0 && <div style={{ fontSize: "0.62rem", color: T.faint, marginTop: 4, lineHeight: 1.5 }}>Not shown ({excluded.length}, no original stop → no R math): {excluded.map(c => c.ticker).join(" · ")}.</div>}
              </>);
            })()}
          </div>
        </div>
      </Panel>

      {/* TRIM TOURNAMENT — T+3 vs T+5, 25% vs 33%, vs never trimming */}
      {lab.tourney && (
        <Panel title="Trim tournament — T+3 or T+5? 25% or 33%?" meta={`${lab.tourneyN} campaigns · same EOD price basis`}
          howto={[
            "Every closed campaign is REPLAYED four ways: first trim of 25% or 33% at the day-3 or day-5 close, runner held to the final exit day's close — plus a fifth row: never trimming.",
            "All five use the same end-of-day closes, so the comparison is apples-to-apples. (Your ACTUAL result used real intraday fills — not directly comparable.)",
            "Campaigns that ended before the trim day count unchanged — the rule simply never fired.",
            "Caveats: EOD closes only, and the runner ignores your trailing stop — this measures the TRIM-TIMING choice, not the whole exit system.",
            "Re-judge every ~20 new campaigns; small samples move.",
          ]}>
          <Say>
            {(() => {
              const best = lab.tourney.slice().sort((a, b) => (b.meanR ?? -99) - (a.meanR ?? -99))[0];
              const never = lab.tourney.find(v => v.key === "shadowR");
              return <>Across these {lab.tourneyN} campaigns, <b style={{ color: T.goldBright }}>{best.label}</b> comes out best at <b>{sgnR(best.meanR)}</b> per trade{never && best.key !== "shadowR" ? <> vs <b>{sgnR(never.meanR)}</b> for never trimming — the trim earns its keep</> : never && best.key === "shadowR" ? <> — right now HOLDING beats every trim variant; sample is small, treat as direction</> : null}. Small samples move — the verdict firms up as campaigns accumulate.</>;
            })()}
          </Say>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 560 }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(150px,1.4fr) 50px 85px 85px 85px 100px", gap: "0 10px", alignItems: "center", padding: "2px 4px 6px", fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: T.muted }}>
                <span>Strategy</span><span>n</span><span style={{ textAlign: "right" }}>Mean R</span><span style={{ textAlign: "right" }}>Median R</span><span style={{ textAlign: "right" }}>Total R</span><span style={{ textAlign: "right" }}>≥ never-trim</span>
              </div>
              {lab.tourney.map(v => {
                const best = lab.tourney.slice().sort((a, b) => (b.meanR ?? -99) - (a.meanR ?? -99))[0];
                const isBest = v.key === best.key;
                return (
                  <div key={v.key} style={{ display: "grid", gridTemplateColumns: "minmax(150px,1.4fr) 50px 85px 85px 85px 100px", gap: "0 10px", alignItems: "center", padding: "8px 4px", borderTop: `1px solid ${T.borderSoft}`, fontSize: "0.76rem", background: isBest ? "rgba(201,152,42,0.05)" : "transparent" }}>
                    <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{v.label}{isBest && <span style={{ color: T.goldBright, fontSize: "0.6rem", fontWeight: 800, marginLeft: 8 }}>◂ BEST</span>}</span>
                    <span style={{ color: T.muted, fontVariantNumeric: "tabular-nums" }}>{v.n}</span>
                    <b style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: (v.meanR ?? 0) >= 0 ? T.green : T.red }}>{sgnR(v.meanR)}</b>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{sgnR(v.medR)}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{sgnR(v.totR, 1)}</span>
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.muted }}>{v.key === "shadowR" ? "—" : v.beatPct + "%"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>
      )}

      {/* equity + throttle */}
      <Panel title="System health — your equity, traded like a stock" meta={`${mode === "sys" ? "system cohort" : "full journal"} · exit order`}
        howto={[
          "Gold line = cumulative R, one step per closed campaign in exit order. Dashed = its own " + eqMaP + "-trade moving average.",
          "NOT the same as the journal's equity curve: that one is your ACCOUNT in dollars over calendar days (sizing included); this one is the SYSTEM in risk units per trade — it strips out position size and asks only 'is the edge itself trending?'",
          "Above the MA = in gear → full unit risk allowed. Below = the system itself is in a downtrend → halve new-position risk until the line is reclaimed.",
          "Red dots mark trades taken while below the line. Lower panel = rolling-10 expectancy vs the +0.25R line — the system's pulse.",
        ]}>
        {eqState && (
          <Say>
            The system is <b style={{ color: eqState.above ? T.green : T.red }}>{eqState.above ? "IN GEAR" : "IN A REAL DRAWDOWN"}</b> — equity sits {eqState.gap > 0 ? "+" : ""}{eqState.gap}R {eqState.above ? "above" : "below"} its own {eqMaP}-trade average.
            {eqState.above ? " Rule: full unit risk is allowed." : " Rule: halve new-position risk until the line is reclaimed — the throttle forces you smallest when cold."}
            {roll.length > 0 && <> The last-10-trades expectancy is <b>{(roll[roll.length - 1].exp >= 0 ? "+" : "") + roll[roll.length - 1].exp}R</b> per trade{roll[roll.length - 1].exp >= 0.25 ? " — above the +0.25R line." : " — below the +0.25R line; watch it."}</>}
          </Say>
        )}
        {eqState && (
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px 16px", marginBottom: 14 }}>
            <span style={{ display: "inline-flex", alignItems: "center", fontSize: "0.64rem", fontWeight: 800, letterSpacing: "0.1em", color: eqState.above ? T.green : T.red, border: `1px solid ${(eqState.above ? T.green : T.red)}44`, borderRadius: 99, padding: "4px 13px" }}>
              {dot(eqState.above ? T.green : T.red)}{eqState.above ? "IN GEAR · FULL RISK" : "BELOW EQUITY-MA · HALF RISK"}
            </span>
            <span style={{ fontSize: "0.7rem", color: T.muted }}>
              Equity <b style={{ color: T.text }}>{eqState.cum}R</b> is <b style={{ color: eqState.above ? T.green : T.red }}>{eqState.gap > 0 ? "+" : ""}{eqState.gap}R</b> {eqState.above ? "above" : "below"} its {eqMaP}-MA (<b style={{ color: T.text }}>{eqState.ma}R</b>) · {eqState.streak} trades this side
            </span>
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
              <button onClick={() => setOvl(o => !o)} title="Overlay the same trades' cumulative $ P&L (right axis). Where the two lines diverge, position sizing — not the edge — did the work."
                style={{ background: ovl ? "rgba(122,162,247,0.12)" : "transparent", border: `1px solid ${ovl ? T.blue : T.border}`, color: ovl ? T.blue : T.faint, borderRadius: 7, padding: "3px 9px", cursor: "pointer", fontSize: "0.64rem", fontFamily: font }}>$ overlay</button>
              {[5, 10, 20].map(p => (
                <button key={p} onClick={() => setEqMaP(p)} style={{ background: p === eqMaP ? "rgba(201,152,42,0.12)" : "transparent", border: `1px solid ${p === eqMaP ? T.gold : T.border}`, color: p === eqMaP ? T.goldBright : T.faint, borderRadius: 7, padding: "3px 9px", cursor: "pointer", fontSize: "0.64rem", fontFamily: font }}>{p}-MA</button>
              ))}
            </span>
          </div>
        )}
        <ResponsiveContainer width="100%" height={230}>
          <ComposedChart data={eqMA} margin={{ left: 0, right: 8, top: 6 }}>
            <defs>
              <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.gold} stopOpacity={0.22} />
                <stop offset="100%" stopColor={T.gold} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={T.grid} strokeDasharray="3 5" />
            <XAxis dataKey="i" {...axis} tickMargin={8} />
            <YAxis yAxisId="r" {...axis} width={38} tickFormatter={(t) => t + "R"} />
            {ovl && <YAxis yAxisId="usd" orientation="right" {...axis} width={52} tickFormatter={(t) => "$" + (Math.abs(t) >= 1000 ? (t / 1000).toFixed(0) + "k" : t)} />}
            <Tooltip cursor={{ stroke: T.border }} content={<TT render={(p) => {
              const d = p[0]?.payload; if (!d) return null;
              return <><div style={{ color: T.muted }}>{d.d} · trade #{d.i}</div><div><b>{d.t}</b> {d.r > 0 ? "+" : ""}{d.r}R</div><div>cumulative <b>{d.cum}R</b> · {eqMaP}-MA <b>{d.ma}R</b></div>{ovl && <div style={{ color: T.blue }}>cumulative $ {d.cumUsd?.toLocaleString()}</div>}<div style={{ color: d.below ? T.red : T.green }}>{d.below ? "below MA — derisk" : "above MA — full size"}</div></>;
            }} />} />
            <ReferenceLine yAxisId="r" y={0} stroke={T.border} />
            <Area yAxisId="r" type="monotone" dataKey="cum" stroke={T.gold} strokeWidth={1.6} fill="url(#eqFill)"
              dot={(pr) => <circle key={pr.index} cx={pr.cx} cy={pr.cy} r={2.2} fill={pr.payload?.below ? T.red : T.gold} />}
              activeDot={{ r: 4, fill: T.gold }} />
            <Line yAxisId="r" type="monotone" dataKey="ma" stroke="rgba(255,255,255,0.55)" strokeWidth={1.3} strokeDasharray="5 4" dot={false} activeDot={{ r: 3, fill: "#fff" }} />
            {ovl && <Line yAxisId="usd" type="monotone" dataKey="cumUsd" stroke={T.blue} strokeWidth={1.4} dot={false} activeDot={{ r: 3, fill: T.blue }} />}
          </ComposedChart>
        </ResponsiveContainer>
        {ovl && <div style={{ fontSize: "0.64rem", color: T.muted, margin: "2px 0 6px" }}><i style={{ display: "inline-block", width: 12, height: 2, background: T.blue, verticalAlign: "middle", marginRight: 5 }} />same trades in DOLLARS (right axis) — where blue and gold diverge, position sizing did the work, not the edge.</div>}
        <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: T.faint, margin: "10px 0 2px" }}>Rolling 10-trade expectancy — the pulse (white line, vs the +0.25R target)</div>
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={roll} margin={{ left: 0, right: 8, top: 10 }}>
            <XAxis dataKey="i" {...axis} hide />
            <YAxis {...axis} width={38} domain={["auto", "auto"]} tickFormatter={(t) => t + "R"} />
            <Tooltip content={<TT render={(p) => <>rolling-10 expectancy after #{p[0]?.payload?.i}: <b>{p[0]?.payload?.exp > 0 ? "+" : ""}{p[0]?.payload?.exp}R</b></>} />} />
            <ReferenceLine y={0} stroke={`${T.red}55`} strokeDasharray="4 4" />
            <ReferenceLine y={0.25} stroke={`${T.green}45`} strokeDasharray="4 4" label={{ value: "+0.25R", position: "right", fill: T.faint, fontSize: 9 }} />
            <Line type="monotone" dataKey="exp" stroke="rgba(255,255,255,0.65)" strokeWidth={1.5} dot={false} activeDot={{ r: 3.5, fill: "#fff" }} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      {/* open campaigns */}
      <Panel title="Open campaigns — realized + marked" meta="a trimmed campaign is never read as finished"
        footnote="Floor = realized to date plus what the remaining shares lock in at the current stop or trail — the campaign's guaranteed outcome. Unrealized R uses the campaign's own locked risk unit. On close, each campaign migrates into the cohort and every aggregate on this page updates.">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {th("Symbol")}{th("Shares", null, 1)}{th("Entry", null, 1)}{th("Stop / Trail", null, 1)}{th("Ext", null, 1)}{th("Realized", null, 1)}{th("Unrealized", null, 1)}{th("Floor", null, 1)}{th("Status")}
            </tr></thead>
            <tbody>
              {(data.openCampaigns || []).map((o, i) => (
                <tr key={i}>
                  <td style={{ ...tdBase, fontWeight: 700 }}>{o.sym}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{o.shares}</td>
                  <td style={{ ...tdBase, textAlign: "right" }}>{num(o.entry)}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{num(o.stop)} / {o.trail ? num(o.trail) : "—"}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{o.ext != null ? num(o.ext, 1) + "×" : "—"}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: (o.realizedUsd || 0) >= 0 ? T.green : T.red }}>{fmt$(o.realizedUsd)}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: (o.unrealUsd || 0) >= 0 ? T.green : T.red }}>{fmt$(o.unrealUsd)}{o.unrealR != null ? <span style={{ color: T.faint }}>{`  ${o.unrealR > 0 ? "+" : ""}${num(o.unrealR, 1)}R`}</span> : null}</td>
                  <td style={{ ...tdBase, textAlign: "right", fontWeight: 700, color: (o.worstCaseUsd ?? 0) >= 0 ? T.green : T.red }}>{o.worstCaseUsd != null ? fmt$(o.worstCaseUsd) : "—"}</td>
                  <td style={tdBase}>{o.riskFree ? <span>{dot(T.green)}Risk-free</span> : <span>{dot(T.gold)}At risk</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Monte Carlo */}
      <Panel title="What can the next 100 trades look like?" meta={`10,000 simulated paths · resampled from ${mode === "sys" ? "system" : "full-journal"} R · ${mc.riskPct}% risk · n=${mc.n}`}
        howto={[
          "Think of a marble bag: each of your real trade results is a marble. Draw 100 marbles (with replacement), write down where the account ends, put them back. Do that 10,000 times.",
          "The curve counts the endings: the taller the curve at a number, the more of the 10,000 futures ended there. Thin edges = rare luck, good or bad.",
          "The shaded band holds 9 out of 10 futures — anything inside it is NORMAL for your system. Only results outside it mean something actually changed.",
          "Median = the realistic base case. The left line = an unlucky ordering of the SAME skill — if even that is positive, the edge survives bad luck.",
          "The 95th-percentile drawdown is your circuit-breaker: a real drawdown deeper than that is NOT normal variance — halt and diagnose.",
          "Directional until n ≥ 50 closed campaigns.",
        ]}>
        <Say>
          {mc.retP50 != null ? <>Same trading, shuffled 10,000 ways: the middle path makes <b>{(mc.retP50 >= 0 ? "+" : "") + num(mc.retP50, 1)}%</b> per 100 trades, and <b>9 in 10 futures land between {(mc.retP5 >= 0 ? "+" : "") + num(mc.retP5, 1)}% and {(mc.retP95 >= 0 ? "+" : "") + num(mc.retP95, 1)}%</b> (the shaded band below). Your circuit-breaker: a drawdown beyond <b style={{ color: T.red }}>{num(mc.ddP95, 1)}%</b> means something CHANGED — stop and diagnose, don't push through.</> : <>Not enough scored trades to simulate yet.</>}
        </Say>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "14px 18px" }}>
          <Kpi label="Median path" value={(mc.retP50 >= 0 ? "+" : "") + num(mc.retP50, 1) + "%"} tone={(mc.retP50 ?? 0) >= 0 ? T.green : T.red} sub="realistic base case"
            tip="If you took 100 more trades exactly like your past ones, half the simulated futures make MORE than this and half make less — the honest 'what to expect' number. Improve it by raising expectancy: cut the deep losses and let the big winners finish (see the Entries and Exits sections)." />
          <Kpi label="5th percentile" value={(mc.retP5 >= 0 ? "+" : "") + num(mc.retP5, 1) + "%"} sub="unlucky, same skill"
            tip="The bottom 5% of simulated futures — SAME skill, worst luck in trade ORDER. If this number is still positive, even an unlucky streak doesn't sink the system. Improve it by making results more consistent (smaller loss tail), not by trading more." />
          <Kpi label="95th percentile" value={(mc.retP95 >= 0 ? "+" : "") + num(mc.retP95, 1) + "%"} sub="do not extrapolate"
            tip="The luckiest 5% of futures. It exists to STOP you extrapolating a hot streak — if your live results ever track this line, that's luck, not a new normal. Nothing to improve; it's a guardrail against overconfidence." />
          <Kpi label="Median max DD" value={num(mc.ddP50, 1) + "%"} sub="expected breathing"
            tip="The typical worst peak-to-trough dip inside 100 trades. This much drawdown is NORMAL for your system — feeling pain here is not a signal to change anything. Shrinks if you cut risk per trade or tighten the loss tail." />
          <Kpi label="95th pct max DD" value={num(mc.ddP95, 1) + "%"} tone={T.red} sub="circuit-breaker line"
            tip="Only 5% of simulated futures ever dip deeper than this. So if your REAL drawdown exceeds it, something changed (market, execution, or you) — halt new risk and diagnose; don't push through. This is your pre-agreed stop-trading line." />
          <Kpi label="P(negative path)" value={num(mc.pNegative, 1) + "%"} sub="100-trade sequence ends red"
            tip="The share of simulated 100-trade futures that end below breakeven. Near zero = the edge is robust to bad ordering. If this creeps up, expectancy is thinning — check the scoreboard's failing rows first." />
        </div>
        {/* the distribution itself — all 10,000 endings as a bell curve, percentiles marked */}
        {mc.histo && mc.histo.counts && (() => {
          const { lo, hi, counts } = mc.histo;
          const w = (hi - lo) / counts.length;
          const dataH = counts.map((n2, i) => ({ x: +(lo + w * (i + 0.5)).toFixed(1), n: n2 }));
          return (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", color: T.faint, marginBottom: 4 }}>DISTRIBUTION OF THE 10,000 ENDINGS (% RETURN AFTER 100 TRADES)</div>
              <ResponsiveContainer width="100%" height={150}>
                <ComposedChart data={dataH} margin={{ left: 0, right: 8, top: 6 }}>
                  <defs>
                    <linearGradient id="mcFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.gold} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={T.gold} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="x" {...axis} tickFormatter={(t) => t + "%"} />
                  <YAxis hide />
                  <Tooltip content={<TT render={(p) => <>{p[0]?.payload?.n} of 10,000 futures end near <b>{p[0]?.payload?.x}%</b></>} />} />
                  <ReferenceArea x1={mc.retP5} x2={mc.retP95} fill={T.gold} fillOpacity={0.05} ifOverflow="hidden" />
                  <ReferenceLine x={mc.retP5} stroke={T.red} strokeDasharray="4 4" label={{ value: "unlucky 5%", position: "top", fill: T.red, fontSize: 9 }} ifOverflow="hidden" />
                  <ReferenceLine x={mc.retP50} stroke={T.goldBright} strokeDasharray="4 4" label={{ value: "median", position: "top", fill: T.goldBright, fontSize: 9 }} ifOverflow="hidden" />
                  <ReferenceLine x={mc.retP95} stroke={T.muted} strokeDasharray="4 4" label={{ value: "P95", position: "top", fill: T.muted, fontSize: 9 }} ifOverflow="hidden" />
                  <Area type="monotone" dataKey="n" stroke={T.gold} strokeWidth={1.6} fill="url(#mcFill)" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          );
        })()}
      </Panel>

      {/* audit */}
      <Panel title="Closed campaigns — audit" meta={`${sorted.length} rows · click a column to sort`} collapsed>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {th("Ticker", "ticker")}{th("Entry", "entryDate", 1)}{th("Grade", "grade")}{th("Ext@E", "extEntry", 1)}{th("P&L", "pl", 1)}{th("R", "r", 1)}{th("MFE", "mfeR", 1)}{th("MAE", "maeR", 1)}{th("Capture", "capture", 1)}{th("Shadow", "shadowR", 1)}{th("Trim day", "trimDay", 1)}{th("Exit reasons")}
            </tr></thead>
            <tbody>
              {sorted.map((c, i) => (
                <tr key={i}>
                  <td style={{ ...tdBase, fontWeight: 700 }}>{c.ticker}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{c.entryDate || "—"}</td>
                  {/* grade may be a legacy snapshot OBJECT — render the letter only (raw object = React crash) */}
                  <td style={{ ...tdBase, color: T.muted }}>{lab.gradeStr(c) || "—"}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{(c.extEntry ?? c.extEntryCalc) != null ? num(c.extEntry ?? c.extEntryCalc, 1) + "×" : "—"}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: c.pl > 0 ? T.green : T.red }}>{fmt$(c.pl)}</td>
                  <td style={{ ...tdBase, textAlign: "right" }}>{num(c.blendedR ?? c.rSum)}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{num(c.mfeR)}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{num(c.maeR)}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{num(c.capture)}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{num(c.shadowR)}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{c.trimDay ?? "—"}</td>
                  <td style={{ ...tdBase, color: T.faint, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }} title={c.reasons}>{c.reasons}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* methodology */}
      <Panel title="Methodology & definitions" collapsed>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.74rem" }}>
          <tbody>
            {[
              ["Populations", `Full journal = every pipeline-verified campaign since ${data.since || "2026-05-01"} (the journal page's population, campaign-merged). System cohort = campaigns entered ≥ ${data.systemEntry} — the 3-stop / derisk-trim book. The toggle recomputes every panel client-side from the same list.`],
              ["Campaign", "position_id when present, else ticker + entry date. Partially-trimmed positions appear in Open Campaigns until the runner closes — never treated as finished."],
              ["R", "Banked P&L ÷ (entry − locked original stop) × initial shares. No stop → excluded from R metrics. Near-zero denominators excluded."],
              ["MFE / MAE / Shadow", "From daily EOD bars, entry → final exit. Shadow = never-trimmed full position to final exit close. MAE is an upper bound (a bar's low can predate an intraday entry) — rung percentages are lower bounds."],
              ["Entry gates", "entry_gates JSON captured at entry by the trade-log (LoD-dist %ATR ≤0.60 · time-matched RVOL ≥1.3 · ORB 30-min wait · ext ≤4× · sized-same-D). Old rows without capture are excluded from gate slices, never guessed."],
              ["Expectancy / SQN", "(avg win × WR) − (avg loss × (1−WR)), in R. SQN = mean(R)/σ(R)·√n — Van Tharp scale: 1.6 tradeable · 2–3 good · 3–5 excellent."],
              ["Truth hierarchy", "Equities-focused IBKR fill rebuild — an estimate. TradeZella remains realized-P&L source of truth. Refresh: node --env-file=.env.local scripts/edge-ledger.mjs"],
            ].map(([k, d]) => <tr key={k}><td style={{ ...tdBase, fontSize: "0.62rem", fontWeight: 800, color: T.gold, whiteSpace: "nowrap", verticalAlign: "top", textTransform: "uppercase", letterSpacing: "0.06em" }}>{k}</td><td style={{ ...tdBase, whiteSpace: "normal", lineHeight: 1.6, color: T.muted }}>{d}</td></tr>)}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
