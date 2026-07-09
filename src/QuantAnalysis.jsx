import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, AreaChart, Area, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, ScatterChart, Scatter, ZAxis, LabelList,
} from "recharts";
import { supabase } from "./supabaseClient";

// ── QUANTITATIVE ANALYSIS (ADMIN ONLY) ───────────────────────────────────────
// Institutional-grade read on the system: recharts, hairline borders, tabular
// numerals, restrained color. Data: claude_insights.payload.edge_ledger
// (scripts/edge-ledger.mjs). Members never see this page.

const ADMIN_EMAIL = "vc-lv@live.com";
const T = {
  card: "rgba(255,255,255,0.016)", border: "rgba(255,255,255,0.07)", borderSoft: "rgba(255,255,255,0.05)",
  text: "#E7E9EE", muted: "#8A90A2", faint: "#5A6072",
  gold: "#C9982A", goldSoft: "rgba(201,152,42,0.55)",
  green: "#34D399", red: "#F87171", blue: "#7AA2F7", grey: "#7C8496",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
  grid: "rgba(255,255,255,0.045)",
};
const fmt$ = (v) => v == null ? "—" : (v < 0 ? "−$" : "$") + Math.abs(Math.round(v)).toLocaleString();
const num = (v, d = 2) => v == null || !isFinite(v) ? "—" : (+v).toFixed(d);

/* ─── primitives ─────────────────────────────────────────────────────────── */
const Panel = ({ title, meta, children, footnote, collapsed = false }) => {
  const [open, setOpen] = useState(!collapsed);
  return (
    <section style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 22px", marginBottom: 16 }}>
      <header onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "baseline", gap: 12, cursor: "pointer", userSelect: "none" }}>
        <span style={{ fontFamily: T.mono, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: T.muted }}>{title}</span>
        <span style={{ flex: 1, borderBottom: `1px solid ${T.borderSoft}`, transform: "translateY(-3px)" }} />
        {meta && <span style={{ fontFamily: T.mono, fontSize: 10, color: T.faint }}>{meta}</span>}
        <span style={{ fontSize: 10, color: T.faint }}>{open ? "—" : "+"}</span>
      </header>
      {open && <div style={{ marginTop: 16 }}>{children}</div>}
      {open && footnote && <p style={{ margin: "12px 0 0", fontSize: 11.5, lineHeight: 1.6, color: T.muted, maxWidth: "88ch" }}>{footnote}</p>}
    </section>
  );
};
const Kpi = ({ label, value, tone, sub, wide }) => (
  <div style={{ flex: wide ? "1.6 1 200px" : "1 1 138px", minWidth: 138, padding: "2px 18px 2px 0", borderRight: `1px solid ${T.borderSoft}` }}>
    <div style={{ fontFamily: T.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", color: T.faint }}>{label}</div>
    <div style={{ fontSize: 21, fontWeight: 700, color: tone || T.text, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em", marginTop: 3 }}>{value}</div>
    {sub && <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2, lineHeight: 1.45 }}>{sub}</div>}
  </div>
);
const Dot = ({ c }) => <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 99, background: c, marginRight: 7, transform: "translateY(-1px)" }} />;
const TT = ({ active, payload, render }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#13141B", border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 12px", boxShadow: "0 8px 28px rgba(0,0,0,0.55)", fontFamily: T.mono, fontSize: 11, color: T.text, lineHeight: 1.7 }}>
      {render(payload)}
    </div>
  );
};
const axis = { tick: { fill: T.faint, fontSize: 10, fontFamily: T.mono }, axisLine: false, tickLine: false };
const thBase = { padding: "7px 10px", fontFamily: T.mono, fontSize: 9.5, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: T.muted, borderBottom: `1px solid ${T.border}`, textAlign: "left", whiteSpace: "nowrap" };
const tdBase = { padding: "8px 10px", borderBottom: `1px solid ${T.borderSoft}`, fontSize: 12, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

/* ─── breakeven map (custom, refined) ────────────────────────────────────── */
function BreakevenMap({ pts }) {
  const W = 920, H = 330, pl = 46, pr = 150, pt = 14, pb = 36;
  const X = p => pl + ((p - 10) / 60) * (W - pl - pr);
  const Y = w => pt + (1 - Math.min(w, 4) / 4) * (H - pt - pb);
  let curve = [];
  for (let p = 12; p <= 70; p += 0.5) { const w = (100 - p) / p; if (w <= 4.15) curve.push(`${X(p)},${Y(w)}`); }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} fontFamily={T.mono}>
      <polygon points={`${curve.join(" ")} ${W - pr},${pt} ${X(12)},${pt}`} fill="rgba(52,211,153,0.04)" />
      {[1, 2, 3, 4].map(w => <g key={w}><line x1={pl} y1={Y(w)} x2={W - pr} y2={Y(w)} stroke={T.grid} /><text x={pl - 8} y={Y(w) + 3} fill={T.faint} fontSize="10" textAnchor="end">{w}.0</text></g>)}
      {[20, 30, 40, 50, 60, 70].map(p => <text key={p} x={X(p)} y={H - pb + 16} fill={T.faint} fontSize="10" textAnchor="middle">{p}%</text>)}
      <polyline points={curve.join(" ")} fill="none" stroke={T.goldSoft} strokeWidth="1.4" strokeDasharray="5 4" />
      <text x={X(63)} y={Y((100 - 63) / 63) - 8} fill={T.goldSoft} fontSize="10">breakeven</text>
      <text x={pl} y={H - 4} fill={T.faint} fontSize="10">win rate</text>
      <text x={pl - 34} y={pt + 8} fill={T.faint} fontSize="10">payoff</text>
      {pts.filter(p => p.wr != null && p.payoff != null).map((p, i) => (
        <g key={i}>
          <circle cx={X(p.wr)} cy={Y(Math.min(p.payoff, 3.9))} r={p.big ? 5 : 3.5} fill={p.color} fillOpacity={p.big ? 1 : 0.55} stroke="#0B0C11" strokeWidth="1.5">
            <title>{`${p.label} — WR ${p.wr}% · payoff ${p.payoff}`}</title>
          </circle>
          <text x={X(p.wr) + 10} y={Y(Math.min(p.payoff, 3.9)) + 3.5} fill={p.big ? p.color : T.muted} fontSize="10.5" fontWeight={p.big ? 700 : 400}>{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

/* ─── page ───────────────────────────────────────────────────────────────── */
export default function QuantAnalysis({ C, font, session, setPage }) {
  const isAdmin = (session?.user?.email || "").toLowerCase() === ADMIN_EMAIL;
  const [data, setData] = useState(null);
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

  const eq = useMemo(() => (data?.equityR || []).map((p, i) => ({ ...p, i: i + 1 })), [data]);
  // Equity-curve MA (Jeff Sun risk-throttle): trade the system's own equity like a stock —
  // trailing SMA of cumulative R; cum below its MA = system in drawdown → derisk.
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
    let crosses = 0; for (let i = 1; i < eqMA.length; i++) if (on(eqMA[i]) !== on(eqMA[i - 1])) crosses++;
    const belowN = eqMA.filter(p => !on(p)).length;
    return { above, gap: +(last.cum - last.ma).toFixed(2), cum: last.cum, ma: last.ma, streak, crosses, belowPct: Math.round(100 * belowN / eqMA.length) };
  }, [eqMA]);
  const roll = useMemo(() => (data?.rollingExp || []).map(p => ({ ...p })), [data]);
  const hist = useMemo(() => {
    const h = data?.buckets?.system?.hist || {};
    const order = ["≤−2R", "−2..−1", "−1..−0.5", "−0.5..0", "scratch", "0..1", "1..2", "2..3", "3..5", "5R+"];
    return order.map(k => ({ bucket: k, n: h[k] ?? 0, tone: k === "scratch" ? T.grey : k.startsWith("−") || k === "≤−2R" ? T.red : T.green }));
  }, [data]);
  const scat = useMemo(() => {
    const cs = (data?.campaigns || []).filter(c => c.mfeR != null && (c.blendedR ?? c.rSum) != null);
    return {
      w: cs.filter(c => c.pl > 0).map(c => ({ x: c.mfeR, y: c.blendedR ?? c.rSum, t: c.ticker, cap: c.capture })),
      l: cs.filter(c => c.pl <= 0).map(c => ({ x: c.mfeR, y: c.blendedR ?? c.rSum, t: c.ticker, cap: c.capture })),
      max: Math.max(2, ...cs.map(c => c.mfeR)),
    };
  }, [data]);
  const shadow = useMemo(() => (data?.campaigns || []).filter(c => c.deriskCostR != null)
    .map(c => ({ t: c.ticker, v: +(-c.deriskCostR).toFixed(2), shadowR: c.shadowR, actual: c.blendedR })), [data]);
  const strip = (arr) => {
    const counts = {}; return (arr || []).map(d => { counts[d] = (counts[d] || 0) + 1; return { x: d, y: counts[d] }; });
  };
  const mfeDots = useMemo(() => strip(data?.derisk?.dayMFEs), [data]);
  const trimDots = useMemo(() => strip(data?.derisk?.trimDays), [data]);
  const sorted = useMemo(() => {
    const rows = [...(data?.campaigns || [])];
    rows.sort((a, b) => {
      const g = (r) => sortKey === "r" ? (r.blendedR ?? r.rSum) : r[sortKey];
      const va = g(a), vb = g(b);
      if (va == null) return 1; if (vb == null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir;
    });
    return rows;
  }, [data, sortKey, sortDir]);
  // Sample constituents, oldest-entry first — the top row's entry date IS the day the calc starts.
  const sample = useMemo(() => {
    const rows = (data?.campaigns || []).filter(c => c.ticker);
    return rows.sort((a, b) =>
      (a.entryDate || "9999").localeCompare(b.entryDate || "9999") ||
      (a.lastExit || "").localeCompare(b.lastExit || ""));
  }, [data]);
  const span = useMemo(() => {
    const ins = (data?.campaigns || []).map(c => c.entryDate).filter(Boolean).sort();
    const outs = (data?.campaigns || []).map(c => c.lastExit).filter(Boolean).sort();
    return { first: ins[0] || null, last: outs[outs.length - 1] || null };
  }, [data]);

  if (!isAdmin) return null;
  if (!data) return <div style={{ fontFamily: font, color: T.muted, padding: 48, fontSize: 13 }}>Loading… (if empty, run <code style={{ fontFamily: T.mono }}>node --env-file=.env.local scripts/edge-ledger.mjs</code>)</div>;

  const v = data.verdict || {}, b = data.buckets || {}, dk = data.derisk || {}, mc = data.monte?.system || {}, pv = data.provenance || {}, mi = data.maeInsight || {};
  const stTone = v.status === "on-track" ? T.green : String(v.status).includes("off") || String(v.status).includes("negative") ? T.red : T.gold;
  const payoffOf = (m) => m?.pf != null && m?.wr ? +(m.pf * (100 - m.wr) / m.wr).toFixed(2) : null;
  const th = (label, key, right) => (
    <th key={label} onClick={() => key && (sortKey === key ? setSortDir(d => -d) : (setSortKey(key), setSortDir(-1)))}
      style={{ ...thBase, textAlign: right ? "right" : "left", cursor: key ? "pointer" : "default" }}>
      {label}{key && sortKey === key ? (sortDir < 0 ? " ↓" : " ↑") : ""}
    </th>
  );

  return (
    <div style={{ fontFamily: font, maxWidth: 1120, margin: "0 auto", color: T.text }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "4px 0 20px", flexWrap: "wrap" }}>
        <button onClick={() => setPage && setPage("dashboard")} style={{ background: "transparent", border: `1px solid ${T.border}`, color: T.muted, borderRadius: 8, padding: "5px 13px", cursor: "pointer", fontFamily: font, fontSize: 11.5 }}>← Dashboard</button>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" }}>Quantitative Analysis</div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.faint, marginTop: 1 }}>SYSTEM COHORT · ENTERED ≥ {data.systemEntry} · N={v.n} CLOSED</div>
        </div>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", fontFamily: T.mono, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em", color: stTone, border: `1px solid ${stTone}44`, borderRadius: 99, padding: "4px 13px" }}>
          <Dot c={stTone} />{String(v.status || "").toUpperCase().replace(/-/g, " ")}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 10, color: T.faint }}>{String(data.asof).slice(0, 16).replace("T", " ")} UTC</span>
      </div>

      {/* KPI strip */}
      <section style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: "16px 22px", marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "14px 18px" }}>
          <Kpi label="Expectancy / trade" value={(v.expR > 0 ? "+" : "") + num(v.expR) + "R"} tone={v.expR > 0 ? T.green : T.red} sub="mean R per closed campaign" />
          <Kpi label="Profit factor · $" value={num(v.pf)} tone={v.pf >= 1.3 ? T.green : v.pf >= 1 ? T.gold : T.red} sub="gross won ÷ gross lost" />
          <Kpi label="Profit factor · R" value={num((data.rBasis || {}).pf)} tone={T.green} sub="risk-adjusted — the sizing gap" />
          <Kpi label="Win rate" value={num(v.wr, 0) + "%"} sub={`breakeven payoff ${num(v.wBE)}`} />
          <Kpi label="Payoff" value={num(v.payoff)} tone={v.edgeRatio >= 1.2 ? T.green : v.edgeRatio >= 1 ? T.gold : T.red} sub={`edge ratio ${num(v.edgeRatio)}×`} />
          <Kpi label="SQN" value={num(v.sqn)} tone={v.sqn >= 2 ? T.green : v.sqn >= 1.6 ? T.gold : T.blue} sub="Tharp scale · 2+ good" />
          <Kpi label="Sample" value={`${v.n} / 50`} tone={T.blue} sub={span.first ? `since ${span.first} · ${v.n >= 30 ? "outcome readable" : "building to 30"}` : (v.n >= 30 ? "outcome readable · MC at 50" : "judge adherence until 30")} />
        </div>
      </section>

      {/* sample & provenance — what exactly is in the N, and from which day */}
      <Panel title="Sample & Provenance — What's Counted" meta={span.first ? `${v.n} campaigns · ${span.first} → ${span.last}` : `${v.n} campaigns`} collapsed
        footnote={`Data starts ${span.first || "—"} — the entry date of the oldest campaign in the cohort (first row below). Every metric on this page is computed from exactly these ${sample.length} campaigns (system cohort = entered ≥ ${data.systemEntry}). Baseline for the month cards reaches back to ${pv.window || "May"}. From ${pv.fillsVerified ?? "—"} pipeline-verified fills; ${pv.legacyExcluded ?? 0} legacy ambiguous-date rows and ${pv.dupesDropped ?? 0} exact-duplicate fills excluded.`}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 26px", marginBottom: 14 }}>
          {[
            ["Data starts", span.first || "—"],
            ["Last exit", span.last || "—"],
            ["Campaigns in N", sample.length],
            ["Fills verified", pv.fillsVerified ?? "—"],
            ["Legacy excluded", pv.legacyExcluded ?? 0],
            ["Dupes dropped", pv.dupesDropped ?? 0],
          ].map(([k, val]) => (
            <div key={k}>
              <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: T.faint }}>{k}</div>
              <div style={{ fontFamily: T.mono, fontSize: 14, color: T.text, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {th("#")}{th("Ticker")}{th("Entry date", null, 1)}{th("Last exit", null, 1)}{th("Legs", null, 1)}{th("P&L", null, 1)}{th("R", null, 1)}{th("Exit reasons")}
            </tr></thead>
            <tbody>
              {sample.map((c, i) => (
                <tr key={i} style={i === 0 ? { background: "rgba(201,152,42,0.05)" } : undefined}>
                  <td style={{ ...tdBase, color: T.faint }}>{i + 1}</td>
                  <td style={{ ...tdBase, fontWeight: 600 }}>{c.ticker}{i === 0 && <span style={{ color: T.gold, fontFamily: T.mono, fontSize: 9, marginLeft: 6 }}>◂ start</span>}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: c.entryDate ? T.muted : T.faint }}>{c.entryDate || "no date"}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{c.lastExit || "—"}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{c.legs}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: c.pl > 0 ? T.green : T.red }}>{fmt$(c.pl)}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{num(c.blendedR ?? c.rSum)}</td>
                  <td style={{ ...tdBase, color: T.faint, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }} title={c.reasons}>{c.reasons}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* equity */}
      <Panel title="Equity Curve — Cumulative R" meta="closed campaigns, exit order"
        footnote={`The gold curve is cumulative R in exit order; the blue dashed line is its ${eqMaP}-trade moving average — you trade your OWN equity like a stock. Rule (Jeff Sun): while equity holds ABOVE its MA the system is in gear → press at full unit risk. When equity closes BELOW its MA the system is in a real drawdown, not noise → halve new-position risk (or paper-trade) until it reclaims the line, then step size back up. It is a mechanical throttle that forces you smallest exactly when you're cold and largest when you're hot — the opposite of the revenge-sizing instinct. Red dots mark trades taken while below the MA. Runners are excluded until they close. Lower panel = rolling-10 expectancy (the pulse); sustained sub-zero warrants investigation before the month forces it.`}>
        {eqState && (
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px 16px", marginBottom: 14 }}>
            <span style={{ display: "inline-flex", alignItems: "center", fontFamily: T.mono, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.12em", color: eqState.above ? T.green : T.red, border: `1px solid ${(eqState.above ? T.green : T.red)}44`, borderRadius: 99, padding: "4px 13px" }}>
              <Dot c={eqState.above ? T.green : T.red} />{eqState.above ? "IN GEAR · FULL RISK" : "BELOW EQUITY-MA · HALF RISK"}
            </span>
            <span style={{ fontSize: 11.5, color: T.muted }}>
              Equity <b style={{ color: T.text }}>{eqState.cum}R</b> is <b style={{ color: eqState.above ? T.green : T.red }}>{eqState.gap > 0 ? "+" : ""}{eqState.gap}R</b> {eqState.above ? "above" : "below"} its {eqMaP}-MA (<b style={{ color: T.text }}>{eqState.ma}R</b>) · {eqState.streak} trades on this side · {eqState.crosses} crossings · {eqState.belowPct}% of trades below-line
            </span>
            <span style={{ marginLeft: "auto", display: "inline-flex", gap: 4 }}>
              {[5, 10, 20].map(p => (
                <button key={p} onClick={() => setEqMaP(p)} style={{ background: p === eqMaP ? `${T.blue}22` : "transparent", border: `1px solid ${p === eqMaP ? T.blue : T.border}`, color: p === eqMaP ? T.blue : T.faint, borderRadius: 7, padding: "3px 9px", cursor: "pointer", fontFamily: T.mono, fontSize: 10 }}>{p}-MA</button>
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
            <Line type="monotone" dataKey="ma" stroke={T.blue} strokeWidth={1.3} strokeDasharray="5 4" dot={false} activeDot={{ r: 3, fill: T.blue }} />
          </ComposedChart>
        </ResponsiveContainer>
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={roll} margin={{ left: 0, right: 8, top: 10 }}>
            <XAxis dataKey="i" {...axis} hide />
            <YAxis {...axis} width={38} domain={["auto", "auto"]} tickFormatter={(t) => t + "R"} />
            <Tooltip content={<TT render={(p) => <>rolling-10 expectancy after #{p[0]?.payload?.i}: <b>{p[0]?.payload?.exp > 0 ? "+" : ""}{p[0]?.payload?.exp}R</b></>} />} />
            <ReferenceLine y={0} stroke={`${T.red}55`} strokeDasharray="4 4" />
            <ReferenceLine y={0.25} stroke={`${T.green}45`} strokeDasharray="4 4" label={{ value: "+0.25R", position: "right", fill: T.faint, fontSize: 9, fontFamily: T.mono }} />
            <Line type="monotone" dataKey="exp" stroke={T.blue} strokeWidth={1.5} dot={false} activeDot={{ r: 3.5, fill: T.blue }} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      {/* map */}
      <Panel title="Profitability Map — Win Rate × Payoff" meta="breakeven: W = (1−p) / p"
        footnote={`Positions above the dashed curve are structurally profitable regardless of stock selection. The distance between SYSTEM ($) and SYSTEM (R) is the position-sizing inconsistency — in risk units the book clears breakeven by ${num(((data.rBasis || {}).payoff || 0) / (v.wBE || 1), 1)}× (payoff ${num((data.rBasis || {}).payoff)} vs ${num(v.wBE)} required); in dollars it does not (${num(v.payoff)}). Convergence of these two marks is the primary objective of the next ${v.nTarget50 ?? 25} trades.`}>
        <BreakevenMap pts={[
          { label: "May", wr: b.may?.wr, payoff: payoffOf(b.may), color: T.grey },
          { label: "Jun", wr: b.june?.wr, payoff: payoffOf(b.june), color: T.grey },
          { label: "Jul ($)", wr: b.july?.wr, payoff: payoffOf(b.july), color: T.blue },
          { label: "SYSTEM ($)", wr: v.wr, payoff: v.payoff, color: T.gold, big: true },
          { label: "SYSTEM (R)", wr: (data.rBasis || {}).wr, payoff: (data.rBasis || {}).payoff, color: T.green, big: true },
        ]} />
      </Panel>

      {/* distribution + MFE lab, side by side on wide */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(430px, 1fr))", gap: 16 }}>
        <Panel title="R Distribution" meta={`n=${b.system?.nR ?? "—"} scored campaigns`}
          footnote="Healthy shape for a trim system: losses walled at −1R, a genuine 3–5R right tail, no single-outlier dependence. Watch for mass left of −1R (stop discipline) or a thinning right tail (runners cut early).">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={hist} margin={{ left: 0, right: 8, top: 18 }}>
              <CartesianGrid vertical={false} stroke={T.grid} strokeDasharray="3 5" />
              <XAxis dataKey="bucket" {...axis} interval={0} angle={-32} textAnchor="end" height={46} />
              <YAxis {...axis} width={26} allowDecimals={false} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<TT render={(p) => <>{p[0]?.payload?.bucket}: <b>{p[0]?.payload?.n}</b> campaigns</>} />} />
              <Bar dataKey="n" radius={[3, 3, 0, 0]} maxBarSize={34}>
                {hist.map((d, i) => <Cell key={i} fill={d.tone} fillOpacity={0.75} />)}
                <LabelList dataKey="n" position="top" style={{ fill: T.muted, fontSize: 10, fontFamily: T.mono }} formatter={(x) => x || ""} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="MFE Capture — Banked vs Best Offered" meta="maximum favorable excursion, EOD bars"
          footnote={`Marks on the dashed line sold the exact top. Red marks to the right are losers that were once winners — ${mi.nearMissLosers ?? 0} losers saw ≥ +1R before closing red; the trim window exists to convert these. Winners' MAE indicates full-stop heat is normal for this style (${num(mi.pctWinnersMAEover50, 0)}% of winners traded ≤ −0.5R first) — stop tightening is contraindicated. MAE from daily bars is an upper bound.`}>
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
      </div>

      {/* derisk lab */}
      <Panel title="Derisk Protocol — T+3 → T+5 Trim" meta={`adherence ${num(dk.adherencePct, 0)}% · target ≥ 80%`}
        footnote={`Left: the day each winner's maximum profit printed — median day ${dk.medDayMFE}, inside the window: the rule is aimed where trades actually peak. Center: first-trim timing; marks left of the band are early trims (acceptable only on extreme extension). Right: the shadow test per campaign — bars above zero indicate the trim outperformed the never-trim counterfactual; the running total is ${num(-dk.deriskCostR)}R of value added across ${dk.deriskCostN} campaigns.`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
          {[{ d: mfeDots, t: "DAY OF MAX PROFIT" }, { d: trimDots, t: "DAY OF FIRST TRIM" }].map((cfg, k) => (
            <div key={k}>
              <div style={{ fontFamily: T.mono, fontSize: 9.5, letterSpacing: "0.14em", color: T.faint, marginBottom: 4 }}>{cfg.t}</div>
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
            <div style={{ fontFamily: T.mono, fontSize: 9.5, letterSpacing: "0.14em", color: T.faint, marginBottom: 4 }}>TRIM VALUE ADDED VS NEVER-TRIM (R)</div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={shadow} margin={{ left: 0, right: 8, top: 8 }}>
                <XAxis dataKey="t" {...axis} interval={0} angle={-38} textAnchor="end" height={40} tick={{ ...axis.tick, fontSize: 8.5 }} />
                <YAxis {...axis} width={30} tickFormatter={(t) => t + "R"} />
                <ReferenceLine y={0} stroke={T.border} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<TT render={(p) => {
                  const d = p[0]?.payload; if (!d) return null;
                  return <><b>{d.t}</b><div>never-trim: {num(d.shadowR)}R · actual: {num(d.actual)}R</div><div>trim {d.v >= 0 ? "added" : "cost"} <b>{num(Math.abs(d.v))}R</b></div></>;
                }} />} />
                <Bar dataKey="v" radius={[2, 2, 0, 0]} maxBarSize={18}>
                  {shadow.map((d, i) => <Cell key={i} fill={d.v >= 0 ? T.green : T.gold} fillOpacity={0.75} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Panel>

      {/* open campaigns */}
      <Panel title="Open Campaigns — Realized + Marked" meta="a trimmed campaign is never read as finished"
        footnote="Floor = realized to date plus what the remaining shares lock in at the current stop or trail — the campaign's guaranteed outcome. Unrealized R uses the campaign's own locked risk unit. On close, each campaign migrates to the audit table and all aggregates update.">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {th("Symbol")}{th("Shares", null, 1)}{th("Entry", null, 1)}{th("Stop / Trail", null, 1)}{th("Ext", null, 1)}{th("Realized", null, 1)}{th("Unrealized", null, 1)}{th("Floor", null, 1)}{th("Status")}
            </tr></thead>
            <tbody>
              {(data.openCampaigns || []).map((o, i) => (
                <tr key={i}>
                  <td style={{ ...tdBase, fontWeight: 600 }}>{o.sym}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{o.shares}</td>
                  <td style={{ ...tdBase, textAlign: "right" }}>{num(o.entry)}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{num(o.stop)} / {o.trail ? num(o.trail) : "—"}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: o.ext >= 5 ? T.gold : T.muted }}>{o.ext != null ? num(o.ext, 1) + "×" : "—"}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: (o.realizedUsd || 0) >= 0 ? T.green : T.red }}>{fmt$(o.realizedUsd)}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: (o.unrealUsd || 0) >= 0 ? T.green : T.red }}>{fmt$(o.unrealUsd)}{o.unrealR != null ? <span style={{ color: T.faint }}>{`  ${o.unrealR > 0 ? "+" : ""}${num(o.unrealR, 1)}R`}</span> : null}</td>
                  <td style={{ ...tdBase, textAlign: "right", fontWeight: 700, color: (o.worstCaseUsd ?? 0) >= 0 ? T.green : T.red }}>{o.worstCaseUsd != null ? fmt$(o.worstCaseUsd) : "—"}</td>
                  <td style={tdBase}>{o.riskFree ? <span style={{ color: T.green }}><Dot c={T.green} />Risk-free</span> : <span style={{ color: T.gold }}><Dot c={T.gold} />At risk</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Monte Carlo */}
      <Panel title="Monte Carlo — 10,000 Paths × 100 Trades" meta={`resampled from own R · ${mc.riskPct}% risk · n=${mc.n}`}
        footnote="Each path draws 100 trades from the realized system R-distribution. The 95th-percentile drawdown is the calibrated circuit-breaker: an excursion beyond it is not normal variance for this system — halt and diagnose. Directional until n ≥ 50.">
        <div style={{ display: "flex", flexWrap: "wrap", gap: "14px 18px" }}>
          <Kpi label="Median path" value={"+" + num(mc.retP50, 1) + "%"} tone={T.green} sub="realistic base case" />
          <Kpi label="5th percentile" value={(mc.retP5 >= 0 ? "+" : "") + num(mc.retP5, 1) + "%"} sub="unlucky, same skill" />
          <Kpi label="95th percentile" value={"+" + num(mc.retP95, 1) + "%"} sub="do not extrapolate" />
          <Kpi label="Median max DD" value={num(mc.ddP50, 1) + "%"} tone={T.gold} sub="expected breathing" />
          <Kpi label="95th pct max DD" value={num(mc.ddP95, 1) + "%"} tone={T.red} sub="circuit-breaker line" />
          <Kpi label="P(negative path)" value={num(mc.pNegative, 1) + "%"} sub="100-trade sequence ends red" />
        </div>
      </Panel>

      {/* audit */}
      <Panel title="Closed Campaigns — Audit" meta="click a column to sort" collapsed>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {th("Ticker", "ticker")}{th("P&L", "pl", 1)}{th("R", "r", 1)}{th("MFE", "mfeR", 1)}{th("MAE", "maeR", 1)}{th("Day of max", "dayMFE", 1)}{th("Capture", "capture", 1)}{th("Shadow", "shadowR", 1)}{th("Trim day", "trimDay", 1)}{th("Exit reasons")}
            </tr></thead>
            <tbody>
              {sorted.map((c, i) => (
                <tr key={i}>
                  <td style={{ ...tdBase, fontWeight: 600 }}>{c.ticker}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: c.pl > 0 ? T.green : T.red }}>{fmt$(c.pl)}</td>
                  <td style={{ ...tdBase, textAlign: "right" }}>{num(c.blendedR ?? c.rSum)}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{num(c.mfeR)}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{num(c.maeR)}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{c.dayMFE ?? "—"}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{num(c.capture)}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: c.deriskCostR != null ? (c.deriskCostR <= 0 ? T.green : T.gold) : T.muted }}>{num(c.shadowR)}</td>
                  <td style={{ ...tdBase, textAlign: "right", color: T.muted }}>{c.trimDay ?? "—"}</td>
                  <td style={{ ...tdBase, color: T.faint, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis" }} title={c.reasons}>{c.reasons}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* methodology */}
      <Panel title="Methodology & Definitions" collapsed>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {[
              ["Universe", `${pv.window} · ${pv.fillsVerified} pipeline-verified fills; ${pv.legacyExcluded} legacy ambiguous-date rows excluded; ${pv.dupesDropped} duplicates dropped. System cohort = campaigns entered ≥ ${data.systemEntry}.`],
              ["Campaign", "position_id when present, else ticker + entry date. Partially-trimmed positions appear in Open Campaigns until the runner closes — never treated as finished."],
              ["R", "Banked P&L ÷ (entry − locked original stop) × initial shares. No stop → excluded from R metrics (system stop coverage 100%). Near-zero denominators excluded."],
              ["MFE / MAE / Shadow", "From daily EOD bars, entry → final exit. Shadow = never-trimmed full position to final exit close. MAE is an upper bound (a bar's low can predate an intraday entry)."],
              ["Expectancy", "(avg win × WR) − (avg loss × (1−WR)), in R. SQN = mean(R)/σ(R)·√n — Van Tharp scale: 1.6 tradeable · 2–3 good · 3–5 excellent."],
              ["Truth hierarchy", "Equities-focused IBKR fill rebuild — an estimate. TradeZella remains realized-P&L source of truth. Refresh: node --env-file=.env.local scripts/edge-ledger.mjs"],
            ].map(([k, d]) => <tr key={k}><td style={{ ...tdBase, fontFamily: T.mono, fontSize: 10, color: T.gold, whiteSpace: "nowrap", verticalAlign: "top" }}>{k}</td><td style={{ ...tdBase, whiteSpace: "normal", lineHeight: 1.6, color: T.muted }}>{d}</td></tr>)}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
