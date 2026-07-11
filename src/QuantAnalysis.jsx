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
const Panel = ({ title, meta, children, footnote, collapsed = false }) => {
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
      {open && footnote && <p style={{ margin: "12px 0 0", fontSize: "0.68rem", lineHeight: 1.6, color: T.muted, maxWidth: "92ch" }}>{footnote}</p>}
    </section>
  );
};
const Kpi = ({ label, value, tone, sub }) => (
  <div style={{ flex: "1 1 138px", minWidth: 138, padding: "2px 18px 2px 0", borderRight: `1px solid ${T.borderSoft}` }}>
    <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: T.faint }}>{label}</div>
    <div style={{ fontSize: "1.35rem", fontWeight: 800, color: tone || T.text, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", marginTop: 3 }}>{value}</div>
    {sub && <div style={{ fontSize: "0.62rem", color: T.muted, marginTop: 2, lineHeight: 1.45 }}>{sub}</div>}
  </div>
);
const dot = (c) => <i style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: c, marginRight: 7, verticalAlign: "middle" }} />;
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
const HB = [[-99, -2, "≤−2R"], [-2, -1, "−2..−1"], [-1, -0.5, "−1..−0.5"], [-0.5, -0.05, "−0.5..0"], [-0.05, 0.05, "scratch"], [0.05, 1, "0..1"], [1, 2, "1..2"], [2, 3, "2..3"], [3, 5, "3..5"], [5, 99, "5R+"]];

/* ─── page ───────────────────────────────────────────────────────────────── */
export default function QuantAnalysis({ C, font, session, setPage }) {
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
    let cum = 0;
    return ordered.map((c, i) => { cum += (c.blendedR ?? c.rSum); return { i: i + 1, d: c.lastExit, t: c.ticker, r: +(c.blendedR ?? c.rSum).toFixed(2), cum: +cum.toFixed(2) }; });
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
  const lab = useMemo(() => {
    const W = rows.filter(c => c.pl > 0), L = rows.filter(c => c.pl <= 0);
    const wMAE = W.map(c => c.maeR).filter(v => v != null);
    const rung = (lvl) => wMAE.length ? Math.round(100 * wMAE.filter(v => v <= lvl).length / wMAE.length) : null;
    const lR = L.map(c => c.blendedR ?? c.rSum).filter(v => v != null && isFinite(v));
    const breaches = L.filter(c => { const r = c.blendedR ?? c.rSum; return r != null && r <= -0.85; });
    const lMFE = L.map(c => c.mfeR).filter(v => v != null);
    const nearMiss = L.filter(c => c.mfeR != null && c.mfeR >= 1);
    const caps = W.map(c => c.capture).filter(v => v != null);
    const cutEarly = W.filter(c => c.capture != null && c.capture < 0.4);
    const bigLeftOnTable = W.filter(c => c.mfeR != null && c.blendedR != null && c.mfeR - c.blendedR >= 1.5);
    // Extension-at-entry gate slice (≤4× is the gate)
    const extKnown = rows.filter(c => c.extEntry != null);
    const extOK = extKnown.filter(c => c.extEntry <= 4), extHot = extKnown.filter(c => c.extEntry > 4);
    // Grade slice
    const gA = rows.filter(c => /^A/.test(c.grade || "")), gB = rows.filter(c => /^B/.test(c.grade || "")), gU = rows.filter(c => !c.grade);
    // Gate JSON coverage
    const gated = rows.filter(c => c.gates && Object.keys(c.gates).length);
    const gateSlice = (key, pass) => {
      const have = gated.filter(c => c.gates[key] !== undefined);
      const p = have.filter(c => pass(c.gates[key])), f = have.filter(c => !pass(c.gates[key]));
      return { n: have.length, pass: aggOf(p), fail: aggOf(f) };
    };
    return {
      wMAEn: wMAE.length, rung33: rung(-0.33), rung67: rung(-0.67), rung100: rung(-1.0),
      avgLossR: mean(lR), worstR: lR.length ? Math.min(...lR) : null,
      breaches, breachPct: L.length ? Math.round(100 * breaches.length / L.length) : null,
      nearMiss, nearMissPct: lMFE.length ? Math.round(100 * nearMiss.length / lMFE.length) : null,
      capMed: median(caps), capN: caps.length, cutEarly, bigLeftOnTable,
      extOK: aggOf(extOK), extHot: aggOf(extHot), extUnknown: rows.length - extKnown.length,
      gA: aggOf(gA), gB: aggOf(gB), gU: aggOf(gU),
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
      { label: "Average loss (R)", live: sgnR(lab.avgLossR), bench: "≥ −0.75R", ok: lab.avgLossR == null ? null : lab.avgLossR >= -0.75, tip: "The 3-stop structure's designed worst case is −0.67R. Average loser worse than −0.75R = slippage, sizing-anchor mismatch (the SOFI lesson) or discipline leak." },
      { label: "Deep losses (< −0.85R)", live: lab.breachPct == null ? "—" : lab.breaches.length + " (" + lab.breachPct + "% of losers)", bench: "≤ 10%", ok: lab.breachPct == null ? null : lab.breachPct <= 10, tip: "Losses beyond −0.85R breach the 3-stop design cap + slippage allowance. Each one has a name — see the Entry Refinement Lab." },
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
  const sliceRow = (label, s, tip) => (
    <div key={label} style={{ display: "grid", gridTemplateColumns: "minmax(150px,1.4fr) 70px 90px 110px 110px", gap: "2px 10px", alignItems: "center", padding: "7px 4px", borderTop: `1px solid ${T.borderSoft}`, fontSize: "0.74rem", minWidth: 0 }}>
      <span className="term" data-tip={tip} style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <span style={{ color: T.muted, fontVariantNumeric: "tabular-nums" }}>{s.n} trade{s.n === 1 ? "" : "s"}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{s.wr == null ? "—" : Math.round(s.wr) + "% win"}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>PF {s.pf == null ? "—" : s.pf === Infinity ? "∞" : num(s.pf)}</span>
      <b style={{ fontVariantNumeric: "tabular-nums", color: s.expR == null ? T.muted : s.expR >= 0 ? T.green : T.red }}>{sgnR(s.expR)}</b>
    </div>
  );

  return (
    <div style={{ fontFamily: font, maxWidth: 1120, margin: "0 auto", color: T.text }}>
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

      {/* reconciliation — why this N vs the journal's N */}
      <Panel title="Reconciliation — this page vs the journal" meta={`${rec.fillsVerified ?? "—"} fills → ${rec.campaignsAll ?? allCamps.length} campaigns → ${rec.campaignsSystem ?? "—"} system`}
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

      {/* BENCHMARK SCOREBOARD — the religious tracker */}
      <section style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
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

      {/* ENTRY REFINEMENT LAB */}
      <Panel title="Entry Refinement Lab — stops, gates & entry quality" meta={`winners with MAE data: ${lab.wMAEn}`}
        footnote="Reading order: (1) the rung table validates the 3-stop structure against how deep eventual WINNERS actually dip — if most winners survive rung 1, the first stop is earning its keep at ⅓ size; many winners through rung 2 = entries are loose against the LoD or triggers fire early. (2) Deep losses list every breach of the −0.67R design cap (+ slippage allowance) BY NAME — each is slippage, a sizing-anchor mismatch (size with the SAME D as the stops — the SOFI lesson) or discipline. (3) Gate slices prove each entry gate with your own money: a gate that doesn't separate expectancy is theatre; a gate you keep violating profitably is mis-calibrated. MAE/MFE from EOD bars — intraday depth can be worse; treat rung percentages as lower bounds.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
          {/* 3-stop rung validation */}
          <div>
            <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: T.muted, marginBottom: 6 }}>3-stop structure — how deep do winners dip?</div>
            {[
              { lvl: "through rung 1 (−0.33R)", v: lab.rung33, note: "expected to be common — that's why only ⅓ of size sits there", warnAt: null },
              { lvl: "through rung 2 (−0.67R)", v: lab.rung67, note: "should be rare — high = loose entries vs LoD or early triggers", warnAt: 25 },
              { lvl: "through full stop (−1.00R)", v: lab.rung100, note: "anomaly — a winner shouldn't survive the full sweep (EOD approximation)", warnAt: 5 },
            ].map(r => (
              <div key={r.lvl} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "7px 2px", borderTop: `1px solid ${T.borderSoft}`, fontSize: "0.74rem" }}>
                <span style={{ flex: "0 0 190px", fontWeight: 700 }}>{r.lvl}</span>
                <b style={{ fontVariantNumeric: "tabular-nums", color: r.warnAt != null && r.v != null && r.v > r.warnAt ? T.red : T.text }}>{r.v == null ? "—" : r.v + "% of winners"}</b>
                <span style={{ fontSize: "0.62rem", color: T.faint, lineHeight: 1.4 }}>{r.note}</span>
              </div>
            ))}
            <div style={{ marginTop: 10, fontSize: "0.74rem", display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
              <span>avg loss <b style={{ color: (lab.avgLossR ?? 0) >= -0.75 ? T.text : T.red, fontVariantNumeric: "tabular-nums" }}>{sgnR(lab.avgLossR)}</b> <span style={{ color: T.faint, fontSize: "0.62rem" }}>design cap −0.67R</span></span>
              <span>worst <b style={{ fontVariantNumeric: "tabular-nums" }}>{sgnR(lab.worstR)}</b></span>
            </div>
            {lab.breaches.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: T.muted, marginBottom: 4 }}>Deep-loss breaches (&lt; −0.85R) — every one has a name</div>
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
          {/* gate slices */}
          <div>
            <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: T.muted, marginBottom: 6 }}>Entry gates — expectancy each side of the gate</div>
            {sliceRow("Extension ≤ 4× at entry", lab.extOK, "Campaigns entered with ATR%-multiple from the 50MA at or under 4× — the freshness gate. Expectancy here vs the hot side IS the gate's proof.")}
            {sliceRow("Extension > 4× at entry", lab.extHot, "Chased entries — extension above 4× when the trigger fired. If this side's expectancy is negative, every violation has a known price.")}
            {lab.extUnknown > 0 && <div style={{ fontSize: "0.62rem", color: T.faint, padding: "5px 4px" }}>{lab.extUnknown} campaigns predate extension capture — excluded, not guessed.</div>}
            <div style={{ height: 10 }} />
            {sliceRow("A-grade setups", lab.gA, "Campaigns whose ticker carried an A/A+ setup grade (frozen at entry).")}
            {sliceRow("B-grade setups", lab.gB, "Campaigns graded B at entry.")}
            {sliceRow("Ungraded", lab.gU, "No grade recorded at entry — the pre-grader era or skipped grading.")}
            <div style={{ marginTop: 12, border: `1px solid ${T.borderSoft}`, borderRadius: 10, padding: "9px 12px", background: "rgba(255,255,255,0.012)" }}>
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
        </div>
      </Panel>

      {/* EXIT / WINNER MANAGEMENT LAB */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(430px, 1fr))", gap: 16 }}>
        <Panel title="Winner management — banked vs best offered" meta={`median capture ${num(lab.capMed)} · n=${lab.capN}`}
          footnote={`Marks on the dashed line sold the exact top. ${lab.cutEarly.length} winners banked under 40% of what they offered (cut early); ${lab.bigLeftOnTable.length} left ≥ 1.5R on the table. Red marks right of zero are the near-miss losers — ${lab.nearMiss.length} losers saw ≥ +1R before dying red; the T+3 trim window exists to convert exactly these.`}>
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ left: 0, right: 12, top: 12 }}>
              <CartesianGrid stroke={T.grid} strokeDasharray="3 5" />
              <XAxis type="number" dataKey="x" name="MFE" {...axis} domain={[0, Math.ceil(scat.max)]} tickFormatter={(t) => t + "R"} />
              <YAxis type="number" dataKey="y" name="banked" {...axis} width={38} tickFormatter={(t) => t + "R"} />
              <ZAxis range={[46, 46]} />
              <ReferenceLine segment={[{ x: 0, y: 0 }, { x: Math.ceil(scat.max), y: Math.ceil(scat.max) }]} stroke={T.goldSoft} strokeDasharray="5 4" />
              <ReferenceLine y={0} stroke={T.border} />
              <Tooltip cursor={{ stroke: T.border }} content={<TT render={(p) => {
                const d = p[0]?.payload; if (!d) return null;
                return <><b>{d.t}</b><div>offered {num(d.x)}R → banked {num(d.y)}R</div>{d.cap != null && <div style={{ color: T.muted }}>capture {num(d.cap)}</div>}</>;
              }} />} />
              <Scatter data={scat.w} fill={T.green} fillOpacity={0.85} />
              <Scatter data={scat.l} fill={T.red} fillOpacity={0.85} />
            </ScatterChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="R distribution" meta={`n=${A.nR} scored campaigns`}
          footnote="Healthy shape for a trim system: losses walled at −1R, a genuine 3–5R right tail, no single-outlier dependence. Mass left of −1R = stop discipline; a thinning right tail = runners cut early (cross-check the capture panel).">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={hist} margin={{ left: 0, right: 8, top: 18 }}>
              <CartesianGrid vertical={false} stroke={T.grid} strokeDasharray="3 5" />
              <XAxis dataKey="bucket" {...axis} interval={0} angle={-32} textAnchor="end" height={46} />
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
      <Panel title="Derisk protocol — T+3 → T+5 trim (system cohort)" meta={`adherence ${num(dk.adherencePct, 0)}% · target ≥ 80%`}
        footnote={`Left: the day each winner's maximum profit printed — median day ${dk.medDayMFE}, inside the window: the rule is aimed where trades actually peak. Center: first-trim timing; marks left of the band are early trims (acceptable only on extreme extension). Right: the shadow test per campaign — bars above zero indicate the trim beat the never-trim counterfactual; running total ${num(-dk.deriskCostR)}R of value added across ${dk.deriskCostN} campaigns. This panel always reads the system cohort — the protocol didn't exist before ${data.systemEntry}.`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
          {[{ d: mfeDots, t: "DAY OF MAX PROFIT" }, { d: trimDots, t: "DAY OF FIRST TRIM" }].map((cfg, k) => (
            <div key={k}>
              <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", color: T.faint, marginBottom: 4 }}>{cfg.t}</div>
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
            <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.1em", color: T.faint, marginBottom: 4 }}>TRIM VALUE ADDED VS NEVER-TRIM (R)</div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={rows.filter(c => c.deriskCostR != null).map(c => ({ t: c.ticker, v: +(-c.deriskCostR).toFixed(2), shadowR: c.shadowR, actual: c.blendedR }))} margin={{ left: 0, right: 8, top: 8 }}>
                <XAxis dataKey="t" {...axis} interval={0} angle={-38} textAnchor="end" height={40} tick={{ ...axis.tick, fontSize: 8.5 }} />
                <YAxis {...axis} width={30} tickFormatter={(t) => t + "R"} />
                <ReferenceLine y={0} stroke={T.border} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<TT render={(p) => {
                  const d = p[0]?.payload; if (!d) return null;
                  return <><b>{d.t}</b><div>never-trim: {num(d.shadowR)}R · actual: {num(d.actual)}R</div><div>trim {d.v >= 0 ? "added" : "cost"} <b>{num(Math.abs(d.v))}R</b></div></>;
                }} />} />
                <Bar dataKey="v" radius={[2, 2, 0, 0]} maxBarSize={18}>
                  {rows.filter(c => c.deriskCostR != null).map((c, i) => <Cell key={i} fill={-c.deriskCostR >= 0 ? T.green : T.red} fillOpacity={0.7} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Panel>

      {/* equity + throttle */}
      <Panel title="Equity curve — cumulative R" meta={`${mode === "sys" ? "system cohort" : "full journal"} · exit order`}
        footnote={`Gold = cumulative R in exit order; dashed = its ${eqMaP}-trade moving average. Trade your OWN equity like a stock: above the MA = in gear, full unit risk; below = real drawdown → halve new-position risk until it reclaims the line. Red dots mark trades taken below the line. Lower panel = rolling-10 expectancy; sustained sub-+0.25R warrants investigation before the month forces it.`}>
        {eqState && (
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px 16px", marginBottom: 14 }}>
            <span style={{ display: "inline-flex", alignItems: "center", fontSize: "0.64rem", fontWeight: 800, letterSpacing: "0.1em", color: eqState.above ? T.green : T.red, border: `1px solid ${(eqState.above ? T.green : T.red)}44`, borderRadius: 99, padding: "4px 13px" }}>
              {dot(eqState.above ? T.green : T.red)}{eqState.above ? "IN GEAR · FULL RISK" : "BELOW EQUITY-MA · HALF RISK"}
            </span>
            <span style={{ fontSize: "0.7rem", color: T.muted }}>
              Equity <b style={{ color: T.text }}>{eqState.cum}R</b> is <b style={{ color: eqState.above ? T.green : T.red }}>{eqState.gap > 0 ? "+" : ""}{eqState.gap}R</b> {eqState.above ? "above" : "below"} its {eqMaP}-MA (<b style={{ color: T.text }}>{eqState.ma}R</b>) · {eqState.streak} trades this side
            </span>
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
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
            <YAxis {...axis} width={38} tickFormatter={(t) => t + "R"} />
            <Tooltip cursor={{ stroke: T.border }} content={<TT render={(p) => {
              const d = p[0]?.payload; if (!d) return null;
              return <><div style={{ color: T.muted }}>{d.d} · trade #{d.i}</div><div><b>{d.t}</b> {d.r > 0 ? "+" : ""}{d.r}R</div><div>cumulative <b>{d.cum}R</b> · {eqMaP}-MA <b>{d.ma}R</b></div><div style={{ color: d.below ? T.red : T.green }}>{d.below ? "below MA — derisk" : "above MA — full size"}</div></>;
            }} />} />
            <ReferenceLine y={0} stroke={T.border} />
            <Area type="monotone" dataKey="cum" stroke={T.gold} strokeWidth={1.6} fill="url(#eqFill)"
              dot={(pr) => <circle key={pr.index} cx={pr.cx} cy={pr.cy} r={2.2} fill={pr.payload?.below ? T.red : T.gold} />}
              activeDot={{ r: 4, fill: T.gold }} />
            <Line type="monotone" dataKey="ma" stroke="rgba(255,255,255,0.55)" strokeWidth={1.3} strokeDasharray="5 4" dot={false} activeDot={{ r: 3, fill: "#fff" }} />
          </ComposedChart>
        </ResponsiveContainer>
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
      <Panel title="Monte Carlo — 10,000 paths × 100 trades" meta={`resampled from ${mode === "sys" ? "system" : "full-journal"} R · ${mc.riskPct}% risk · n=${mc.n}`}
        footnote="Each path draws 100 trades from the realized R-distribution of the SELECTED cohort. The 95th-percentile drawdown is the calibrated circuit-breaker: an excursion beyond it is not normal variance for this system — halt and diagnose. Directional until n ≥ 50.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "14px 18px" }}>
          <Kpi label="Median path" value={(mc.retP50 >= 0 ? "+" : "") + num(mc.retP50, 1) + "%"} tone={(mc.retP50 ?? 0) >= 0 ? T.green : T.red} sub="realistic base case" />
          <Kpi label="5th percentile" value={(mc.retP5 >= 0 ? "+" : "") + num(mc.retP5, 1) + "%"} sub="unlucky, same skill" />
          <Kpi label="95th percentile" value={(mc.retP95 >= 0 ? "+" : "") + num(mc.retP95, 1) + "%"} sub="do not extrapolate" />
          <Kpi label="Median max DD" value={num(mc.ddP50, 1) + "%"} sub="expected breathing" />
          <Kpi label="95th pct max DD" value={num(mc.ddP95, 1) + "%"} tone={T.red} sub="circuit-breaker line" />
          <Kpi label="P(negative path)" value={num(mc.pNegative, 1) + "%"} sub="100-trade sequence ends red" />
        </div>
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
                  <td style={{ ...tdBase, color: T.muted }}>{c.grade || "—"}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{c.extEntry != null ? num(c.extEntry, 1) + "×" : "—"}</td>
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
