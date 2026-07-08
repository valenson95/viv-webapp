import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

// ── QUANTITATIVE ANALYSIS (ADMIN ONLY, full page) ────────────────────────────
// Valen's probability-design lab: every system metric, chart-first, with the
// sample and method stated next to every number ("never get it wrong").
// Data: claude_insights.payload.edge_ledger (scripts/edge-ledger.mjs).
// Design: VIV near-black + gold, same C palette as the rest of the app.

const ADMIN_EMAIL = "vc-lv@live.com";
const G = "#22c55e", R_ = "#ef4444", GOLD = "#f0c050", BLUE = "#60a5fa", NEUT = "#94a3b8";
const fmt$ = (v) => v == null ? "—" : (v < 0 ? "−$" : "$") + Math.abs(Math.round(v)).toLocaleString();
const num = (v, d = 2) => v == null || !isFinite(v) ? "—" : (+v).toFixed(d);

/* ---------- small building blocks ---------- */
function Sec({ C, title, sub, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card" style={{ padding: "14px 18px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
        <span style={{ fontSize: "0.66rem", fontWeight: 800, letterSpacing: "0.13em", textTransform: "uppercase", color: C.gold }}>{title}</span>
        {sub && <span style={{ fontSize: "0.6rem", color: C.muted }}>{sub}</span>}
        <span style={{ marginLeft: "auto", fontSize: "0.62rem", color: C.muted }}>{open ? "▾" : "▸"}</span>
      </div>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}
function Tile({ C, label, value, color, sub }) {
  return (
    <div style={{ flex: "1 1 140px", minWidth: 140, background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "9px 12px" }}>
      <div style={{ fontSize: "0.55rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>{label}</div>
      <div style={{ fontSize: "1.08rem", fontWeight: 800, color: color || "var(--text,#fff)", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: "0.58rem", color: C.muted, marginTop: 2, lineHeight: 1.45 }}>{sub}</div>}
    </div>
  );
}
function Explain({ C, children }) {
  return <div style={{ fontSize: "0.66rem", color: "var(--text,#ddd)", lineHeight: 1.6, background: "rgba(91,156,240,0.06)", border: "1px solid rgba(91,156,240,0.25)", borderRadius: 10, padding: "9px 12px", marginTop: 10 }}>{children}</div>;
}

/* ---------- charts (hand-rolled SVG, hover via <title>) ---------- */
function EquityCurve({ data }) {
  if (!data?.length) return null;
  const W = 860, H = 260, pl = 44, pr = 16, pt = 16, pb = 30;
  const vals = data.map(p => p.cum);
  const lo = Math.min(0, ...vals), hi = Math.max(1, ...vals);
  const X = i => pl + (i / Math.max(1, data.length - 1)) * (W - pl - pr);
  const Y = v => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const pts = data.map((p, i) => `${X(i)},${Y(p.cum)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} fontFamily="ui-monospace,monospace">
      <line x1={pl} y1={Y(0)} x2={W - pr} y2={Y(0)} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
      <text x={pl - 6} y={Y(0) + 4} fill="rgba(255,255,255,.5)" fontSize="10" textAnchor="end">0R</text>
      {[hi, hi / 2].filter(v => v > 0.5).map((v, i) => <g key={i}><line x1={pl} y1={Y(v)} x2={W - pr} y2={Y(v)} stroke="rgba(255,255,255,0.05)" /><text x={pl - 6} y={Y(v) + 4} fill="rgba(255,255,255,.4)" fontSize="10" textAnchor="end">{v.toFixed(0)}R</text></g>)}
      <polyline points={pts} fill="none" stroke={GOLD} strokeWidth="2.2" strokeLinejoin="round" />
      {data.map((p, i) => (
        <circle key={i} cx={X(i)} cy={Y(p.cum)} r="4.5" fill="#0a0a10" stroke={p.r > 0 ? G : R_} strokeWidth="2">
          <title>{`${p.t} · ${p.d} · ${p.r > 0 ? "+" : ""}${p.r}R → cumulative ${p.cum}R`}</title>
        </circle>
      ))}
      <text x={(pl + W - pr) / 2} y={H - 4} fill="rgba(255,255,255,.45)" fontSize="10" textAnchor="middle">closed system campaigns in exit order — hover any dot · cumulative R</text>
    </svg>
  );
}
function RollingExp({ data }) {
  if (!data?.length) return null;
  const W = 860, H = 150, pl = 44, pr = 16, pt = 12, pb = 26;
  const vals = data.map(p => p.exp);
  const lo = Math.min(-0.5, ...vals), hi = Math.max(1, ...vals);
  const X = i => pl + (i / Math.max(1, data.length - 1)) * (W - pl - pr);
  const Y = v => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} fontFamily="ui-monospace,monospace">
      <line x1={pl} y1={Y(0)} x2={W - pr} y2={Y(0)} stroke="rgba(239,68,68,0.4)" strokeDasharray="4 4" />
      <line x1={pl} y1={Y(0.25)} x2={W - pr} y2={Y(0.25)} stroke="rgba(34,197,94,0.3)" strokeDasharray="4 4" />
      <text x={pl - 6} y={Y(0.25) + 3} fill="rgba(34,197,94,.6)" fontSize="9" textAnchor="end">+0.25R</text>
      <text x={pl - 6} y={Y(0) + 3} fill="rgba(239,68,68,.6)" fontSize="9" textAnchor="end">0</text>
      <polyline points={data.map((p, i) => `${X(i)},${Y(p.exp)}`).join(" ")} fill="none" stroke={BLUE} strokeWidth="2" />
      {data.map((p, i) => <circle key={i} cx={X(i)} cy={Y(p.exp)} r="3" fill={BLUE}><title>{`after trade #${p.i}: rolling-10 expectancy ${p.exp > 0 ? "+" : ""}${p.exp}R`}</title></circle>)}
      <text x={(pl + W - pr) / 2} y={H - 3} fill="rgba(255,255,255,.45)" fontSize="10" textAnchor="middle">rolling 10-trade expectancy — the system's pulse; sustained dips below 0 = investigate</text>
    </svg>
  );
}
function BreakevenMap({ pts }) {
  const W = 860, H = 340, pl = 52, pr = 16, pt = 18, pb = 40;
  const X = p => pl + ((p - 10) / 60) * (W - pl - pr);
  const Y = w => pt + (1 - Math.min(w, 4) / 4) * (H - pt - pb);
  let curve = [];
  for (let p = 12; p <= 70; p += 0.5) { const w = (100 - p) / p; if (w <= 4.2) curve.push(`${X(p)},${Y(w)}`); }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} fontFamily="ui-monospace,monospace">
      <polygon points={`${curve.join(" ")} ${W - pr},${pt} ${X(12)},${pt}`} fill="rgba(34,197,94,.07)" />
      <polygon points={`${curve.join(" ")} ${W - pr},${H - pb} ${X(12)},${H - pb}`} fill="rgba(239,68,68,.06)" />
      <polyline points={curve.join(" ")} fill="none" stroke={GOLD} strokeWidth="1.8" strokeDasharray="7 4" />
      {[0, 1, 2, 3, 4].map(w => <g key={w}><line x1={pl} y1={Y(w)} x2={W - pr} y2={Y(w)} stroke="rgba(255,255,255,.05)" /><text x={pl - 7} y={Y(w) + 3} fill="rgba(255,255,255,.45)" fontSize="10" textAnchor="end">{w}×</text></g>)}
      {[20, 30, 40, 50, 60, 70].map(p => <text key={p} x={X(p)} y={H - pb + 15} fill="rgba(255,255,255,.45)" fontSize="10" textAnchor="middle">{p}%</text>)}
      <text x={X(56)} y={Y(3)} fill="rgba(34,197,94,.7)" fontSize="12" fontWeight="700">PROFITABLE SIDE</text>
      <text x={X(15)} y={Y(0.3)} fill="rgba(239,68,68,.7)" fontSize="12" fontWeight="700">LOSING SIDE</text>
      <text x={(pl + W - pr) / 2} y={H - 6} fill="rgba(255,255,255,.45)" fontSize="10" textAnchor="middle">win rate → · payoff ↑ · gold dashed = breakeven W=(1−p)÷p</text>
      {pts.filter(p => p.wr != null && p.payoff != null).map((p, i) => (
        <g key={i}>
          <circle cx={X(p.wr)} cy={Y(Math.min(p.payoff, 3.9))} r={p.big ? 8 : 5.5} fill="#0a0a10" stroke={p.color} strokeWidth="2.4"><title>{`${p.label}: WR ${p.wr}% · payoff ${p.payoff}`}</title></circle>
          <text x={X(p.wr) + 11} y={Y(Math.min(p.payoff, 3.9)) + 4} fill={p.color} fontSize="11" fontWeight="700">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}
function RHist({ hist }) {
  const entries = Object.entries(hist || {});
  const order = ["≤−2R", "−2..−1", "−1..−0.5", "−0.5..0", "scratch", "0..1", "1..2", "2..3", "3..5", "5R+"];
  const data = order.map(k => [k, hist?.[k] ?? 0]);
  const max = Math.max(1, ...data.map(d => d[1]));
  const W = 860, H = 240, pl = 14, pb = 46, pt = 24, bw = (W - 2 * pl) / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} fontFamily="ui-monospace,monospace">
      {data.map((d, i) => {
        const h = d[1] / max * (H - pt - pb), x = pl + i * bw + 7, y = H - pb - h;
        const col = d[0] === "scratch" ? NEUT : d[0].startsWith("−") || d[0] === "≤−2R" ? R_ : G;
        return (
          <g key={d[0]}>
            <rect x={x} y={y} width={bw - 14} height={Math.max(h, 2)} rx="4" fill={col} opacity=".8"><title>{`${d[0]}: ${d[1]} campaigns`}</title></rect>
            {d[1] > 0 && <text x={x + (bw - 14) / 2} y={y - 6} fill="rgba(255,255,255,.85)" fontSize="12" fontWeight="700" textAnchor="middle">{d[1]}</text>}
            <text x={x + (bw - 14) / 2} y={H - pb + 17} fill="rgba(255,255,255,.5)" fontSize="9.5" textAnchor="middle">{d[0]}</text>
          </g>
        );
      })}
      <line x1={pl} y1={H - pb} x2={W - pl} y2={H - pb} stroke="rgba(255,255,255,.2)" />
      <text x={W / 2} y={H - 8} fill="rgba(255,255,255,.45)" fontSize="10" textAnchor="middle">closed system campaigns by R — watch: bars LEFT of −1R (stop discipline) · right tail thinning (runners cut early)</text>
    </svg>
  );
}
function MfeScatter({ camps }) {
  const pts = (camps || []).filter(c => c.mfeR != null && (c.blendedR ?? c.rSum) != null);
  if (!pts.length) return null;
  const W = 860, H = 320, pl = 50, pr = 16, pt = 16, pb = 40;
  const xmax = Math.max(2, ...pts.map(c => c.mfeR)), ymin = Math.min(-2, ...pts.map(c => c.blendedR ?? c.rSum)), ymax = Math.max(2, ...pts.map(c => c.blendedR ?? c.rSum));
  const X = v => pl + (v / xmax) * (W - pl - pr);
  const Y = v => pt + (1 - (v - ymin) / (ymax - ymin)) * (H - pt - pb);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} fontFamily="ui-monospace,monospace">
      <line x1={X(0)} y1={Y(ymin)} x2={X(0)} y2={Y(ymax)} stroke="rgba(255,255,255,.15)" />
      <line x1={pl} y1={Y(0)} x2={W - pr} y2={Y(0)} stroke="rgba(255,255,255,.15)" />
      <line x1={X(0)} y1={Y(0)} x2={X(Math.min(xmax, ymax))} y2={Y(Math.min(xmax, ymax))} stroke={GOLD} strokeWidth="1.5" strokeDasharray="6 4" />
      <text x={X(Math.min(xmax, ymax) * 0.8)} y={Y(Math.min(xmax, ymax) * 0.8) - 8} fill={GOLD} fontSize="10">capture = 1.0 (sold the exact top)</text>
      {pts.map((c, i) => {
        const r = c.blendedR ?? c.rSum;
        return <circle key={i} cx={X(c.mfeR)} cy={Y(r)} r="6" fill="#0a0a10" stroke={c.pl > 0 ? G : R_} strokeWidth="2.2">
          <title>{`${c.ticker}: best offered ${c.mfeR}R → banked ${r}R${c.capture != null ? ` (capture ${c.capture})` : ""}`}</title>
        </circle>;
      })}
      <text x={(pl + W - pr) / 2} y={H - 6} fill="rgba(255,255,255,.45)" fontSize="10" textAnchor="middle">x = best R the trade ever offered (MFE) · y = R you banked · dots on the gold line sold the top · red dots far right = losers that WERE winners (management leaks)</text>
    </svg>
  );
}
function DayStrip({ days, medLabel, windowLo = 3, windowHi = 5, caption }) {
  const W = 860, H = 170, pl = 36, pr = 16, base = H - 48;
  const X = d => pl + (d / 9) * (W - pl - pr);
  const counts = {};
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} fontFamily="ui-monospace,monospace">
      <rect x={X(windowLo)} y={26} width={X(windowHi) - X(windowLo)} height={base - 26} fill="rgba(245,203,92,.1)" stroke="rgba(245,203,92,.35)" strokeDasharray="5 4" />
      <text x={(X(windowLo) + X(windowHi)) / 2} y={20} fill={GOLD} fontSize="11" fontWeight="700" textAnchor="middle">T+3 → T+5 window</text>
      <line x1={pl} y1={base} x2={W - pr} y2={base} stroke="rgba(255,255,255,.22)" />
      {Array.from({ length: 10 }, (_, d) => <text key={d} x={X(d)} y={base + 18} fill="rgba(255,255,255,.5)" fontSize="11" textAnchor="middle">{d}</text>)}
      {(days || []).map((d, i) => {
        counts[d] = counts[d] || 0;
        const cy = base - 14 - counts[d] * 22; counts[d]++;
        return <circle key={i} cx={X(d)} cy={cy} r="8" fill="#0a0a10" stroke={d >= windowLo && d <= windowHi ? G : BLUE} strokeWidth="2.4"><title>{`day ${d}`}</title></circle>;
      })}
      {medLabel != null && <><line x1={X(medLabel)} y1={26} x2={X(medLabel)} y2={base} stroke={G} strokeWidth="2" strokeDasharray="2 4" /><text x={X(medLabel) + 5} y={38} fill={G} fontSize="11" fontWeight="700">median: day {medLabel}</text></>}
      <text x={(pl + W - pr) / 2} y={H - 6} fill="rgba(255,255,255,.45)" fontSize="10" textAnchor="middle">{caption}</text>
    </svg>
  );
}
function ShadowBars({ camps }) {
  const pts = (camps || []).filter(c => c.deriskCostR != null).slice(0, 20);
  if (!pts.length) return null;
  const W = 860, H = 250, pl = 60, pb = 50, pt = 16;
  const max = Math.max(1, ...pts.map(c => Math.abs(c.deriskCostR)));
  const bw = (W - pl - 16) / pts.length, mid = pt + (H - pt - pb) / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} fontFamily="ui-monospace,monospace">
      <line x1={pl} y1={mid} x2={W - 16} y2={mid} stroke="rgba(255,255,255,.2)" />
      <text x={pl - 8} y={pt + 10} fill="rgba(240,73,94,.7)" fontSize="9" textAnchor="end">trim COST R</text>
      <text x={pl - 8} y={H - pb} fill="rgba(34,197,94,.7)" fontSize="9" textAnchor="end">trim SAVED R</text>
      {pts.map((c, i) => {
        const h = Math.abs(c.deriskCostR) / max * ((H - pt - pb) / 2 - 6);
        const up = c.deriskCostR > 0; // cost = shadow beat you
        return (
          <g key={i}>
            <rect x={pl + i * bw + 5} y={up ? mid - h : mid} width={bw - 10} height={Math.max(h, 1.5)} rx="3" fill={up ? GOLD : G} opacity=".8">
              <title>{`${c.ticker}: never-trim would have made ${c.shadowR}R vs your ${c.blendedR}R → trim ${up ? "cost" : "saved"} ${Math.abs(c.deriskCostR)}R`}</title>
            </rect>
            <text x={pl + i * bw + bw / 2} y={H - pb + 15} fill="rgba(255,255,255,.5)" fontSize="8.5" textAnchor="middle" transform={`rotate(-40 ${pl + i * bw + bw / 2} ${H - pb + 15})`}>{c.ticker}</text>
          </g>
        );
      })}
      <text x={(pl + W) / 2} y={H - 6} fill="rgba(255,255,255,.45)" fontSize="10" textAnchor="middle">the shadow test per campaign — green below = your trim beat the never-trim universe · hover for numbers</text>
    </svg>
  );
}

/* ---------- the page ---------- */
export default function QuantAnalysis({ C, font, session, setPage }) {
  const isAdmin = (session?.user?.email || "").toLowerCase() === ADMIN_EMAIL;
  const [data, setData] = useState(null);
  const [sortKey, setSortKey] = useState("pl");
  const [sortDir, setSortDir] = useState(-1);

  useEffect(() => {
    if (!isAdmin || !session?.user?.id) return;
    let alive = true;
    supabase.from("claude_insights").select("payload").eq("user_id", session.user.id).maybeSingle()
      .then(({ data: d }) => { if (alive && d?.payload?.edge_ledger) setData(d.payload.edge_ledger); });
    return () => { alive = false; };
  }, [isAdmin, session?.user?.id]);

  const sorted = useMemo(() => {
    const rows = [...(data?.campaigns || [])];
    rows.sort((a, b) => {
      const va = a[sortKey] ?? (sortKey === "r" ? (a.blendedR ?? a.rSum) : null), vb = b[sortKey] ?? (sortKey === "r" ? (b.blendedR ?? b.rSum) : null);
      if (va == null) return 1; if (vb == null) return -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir;
    });
    return rows;
  }, [data, sortKey, sortDir]);

  if (!isAdmin) return null;
  if (!data) return <div style={{ fontFamily: font, color: C.muted, padding: 40 }}>Loading Quantitative Analysis… (run <code>node --env-file=.env.local scripts/edge-ledger.mjs</code> if empty)</div>;

  const v = data.verdict || {}, b = data.buckets || {}, dk = data.derisk || {}, mc = data.monte?.system || {}, pv = data.provenance || {}, mi = data.maeInsight || {};
  const stCol = v.status === "on-track" ? G : String(v.status).includes("off") || String(v.status).includes("negative") ? R_ : GOLD;
  const th = (label, key) => (
    <th key={label} onClick={() => key && (sortKey === key ? setSortDir(d => -d) : (setSortKey(key), setSortDir(-1)))}
      style={{ padding: "5px 8px", borderBottom: "1px solid rgba(201,152,42,0.3)", fontSize: "0.54rem", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap", textAlign: "left", color: C.gold, cursor: key ? "pointer" : "default" }}>
      {label}{key && sortKey === key ? (sortDir < 0 ? " ↓" : " ↑") : ""}
    </th>
  );

  return (
    <div style={{ fontFamily: font, maxWidth: 1060, margin: "0 auto" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "6px 0 16px" }}>
        <button onClick={() => setPage && setPage("dashboard")} style={{ background: "transparent", border: `1px solid ${C.border || "rgba(255,255,255,0.15)"}`, color: C.muted, borderRadius: 9, padding: "5px 12px", cursor: "pointer", fontFamily: font, fontSize: "0.66rem" }}>← Dashboard</button>
        <h2 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text,#fff)", margin: 0 }}>Quantitative <span style={{ color: C.gold }}>Analysis</span></h2>
        <span style={{ fontSize: "0.6rem", fontWeight: 800, padding: "3px 10px", borderRadius: 8, color: stCol, background: `${stCol}1a`, border: `1px solid ${stCol}55` }}>{String(v.status || "").toUpperCase().replace("-", " · ")}</span>
        <span style={{ marginLeft: "auto", fontSize: "0.58rem", color: C.muted }}>as of {String(data.asof).slice(0, 16).replace("T", " ")} · admin only</span>
      </div>

      {/* provenance — every number's sample, stated up front */}
      <Sec C={C} title="Data provenance — what these numbers are built on" sub="the never-get-it-wrong panel" defaultOpen={false}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.66rem" }}>
          <tbody>
            <tr><td style={{ padding: "4px 8px", color: C.muted, width: 190 }}>Window</td><td style={{ padding: "4px 8px" }}>{pv.window} · system cohort = campaigns <b>entered ≥ {data.systemEntry}</b> (the derisk book)</td></tr>
            <tr><td style={{ padding: "4px 8px", color: C.muted }}>Rows</td><td style={{ padding: "4px 8px" }}>{pv.fillsVerified} pipeline-verified fills used · <b>{pv.legacyExcluded} legacy slash-dated manual rows excluded</b> (ambiguous dates) · {pv.dupesDropped} exact duplicates dropped</td></tr>
            <tr><td style={{ padding: "4px 8px", color: C.muted }}>Campaign</td><td style={{ padding: "4px 8px" }}>position_id when present, else ticker + entry date. A partially-trimmed position is ONE campaign: realized legs counted, <b>open runner shown separately in "Open campaigns" — never assumed finished</b></td></tr>
            <tr><td style={{ padding: "4px 8px", color: C.muted }}>R definition</td><td style={{ padding: "4px 8px" }}>banked P&L ÷ (entry − <b>locked original stop</b>) × initial shares. No stop → $-stats only. System cohort stop coverage: <b>100%</b>. Near-zero risk denominators (stop≈entry) excluded from R metrics</td></tr>
            <tr><td style={{ padding: "4px 8px", color: C.muted }}>MFE / MAE / shadow</td><td style={{ padding: "4px 8px" }}>computed from daily EOD bars between entry and final exit. Caveat: a daily bar's low can predate an intraday entry — MAE is an <b>upper bound</b> of true heat</td></tr>
            <tr><td style={{ padding: "4px 8px", color: C.muted }}>Truth hierarchy</td><td style={{ padding: "4px 8px" }}>equities-focused IBKR fill rebuild = <b>estimate</b>; TradeZella owns realized P&L truth. Refresh: <code>node --env-file=.env.local scripts/edge-ledger.mjs</code></td></tr>
          </tbody>
        </table>
      </Sec>

      {/* verdict tiles */}
      <Sec C={C} title="System verdict — the probability numbers" sub={`n=${v.n} closed campaigns · judge outcome from n≥30, Monte Carlo from n≥50`}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Tile C={C} label="Expectancy / trade" value={(v.expR > 0 ? "+" : "") + num(v.expR) + "R"} color={v.expR > 0 ? G : R_} sub="avg R each trade pays you" />
          <Tile C={C} label="Profit factor ($)" value={num(v.pf)} color={v.pf >= 1.3 ? G : v.pf >= 1 ? GOLD : R_} sub="target ≥1.3 · Jeff: monthly >2" />
          <Tile C={C} label="Win rate" value={num(v.wr, 0) + "%"} sub={`breakeven payoff at this WR: ${num(v.wBE)}`} />
          <Tile C={C} label="Payoff ratio" value={num(v.payoff)} color={v.edgeRatio >= 1.2 ? G : v.edgeRatio >= 1 ? GOLD : R_} sub={`edge vs breakeven: ${num(v.edgeRatio)}×`} />
          <Tile C={C} label="SQN (Tharp)" value={num(v.sqn)} color={v.sqn >= 2 ? G : v.sqn >= 1.6 ? GOLD : BLUE} sub="1.6 tradeable · 2+ good · 3+ excellent" />
          <Tile C={C} label="Max losing streak" value={String(b.system?.maxLoseStreak ?? "—")} sub="scheduled, not a malfunction — see MC" />
        </div>
        <Explain C={C}><b>The $-vs-R gap:</b> in risk units this cohort runs payoff ~2.85 and PF ~2.2 (profitable design); in dollars PF is {num(v.pf)}. The difference is position sizes not matching the risk math — the fix is mechanical: shares = risk budget ÷ (entry − stop), every order.</Explain>
      </Sec>

      {/* equity curve */}
      <Sec C={C} title="Equity curve in R" sub="cumulative, closed campaigns only — runners not included until they close">
        <EquityCurve data={data.equityR} />
        <RollingExp data={data.rollingExp} />
      </Sec>

      {/* breakeven map */}
      <Sec C={C} title="The profitability map" sub="win rate × payoff vs the mathematical breakeven curve">
        <BreakevenMap pts={[
          { label: "May", wr: b.may?.wr, payoff: b.may?.pf != null && b.may?.wr ? +(b.may.pf * (100 - b.may.wr) / b.may.wr).toFixed(2) : null, color: NEUT },
          { label: "Jun", wr: b.june?.wr, payoff: b.june?.pf != null && b.june?.wr ? +(b.june.pf * (100 - b.june.wr) / b.june.wr).toFixed(2) : null, color: NEUT },
          { label: "Jul ($)", wr: b.july?.wr, payoff: b.july?.pf != null && b.july?.wr ? +(b.july.pf * (100 - b.july.wr) / b.july.wr).toFixed(2) : null, color: BLUE },
          { label: "SYSTEM $", wr: v.wr, payoff: v.payoff, color: GOLD, big: true },
          { label: "SYSTEM R", wr: 41.7, payoff: 2.85, color: G, big: true },
        ]} />
        <Explain C={C}>Anything above the gold curve makes money; below loses — regardless of stock picks. Improve by moving <b>up</b> (bigger winners: runners, −1R losses) or <b>right</b> (more winners: entry gates). The gap between the two SYSTEM dots is the sizing leak.</Explain>
      </Sec>

      {/* distribution */}
      <Sec C={C} title="R-distribution — the system's fingerprint" sub="not the Journal's % return chart: this is R (profit ÷ risk) on verified campaigns">
        <RHist hist={b.system?.hist} />
      </Sec>

      {/* MFE / MAE lab */}
      <Sec C={C} title="MFE / MAE lab — profit left on the table & heat taken" sub="max favorable / adverse excursion, from EOD bars">
        <MfeScatter camps={data.campaigns} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <Tile C={C} label="MFE capture (winners)" value={num(dk.avgCapture)} color={dk.avgCapture >= 0.5 ? G : GOLD} sub="share of the best price you banked · 0.5–0.7 healthy" />
          <Tile C={C} label="Winners that took ≥0.5R heat" value={num(mi.pctWinnersMAEover50, 0) + "%"} color={GOLD} sub="your winners NEED the full stop room — do not tighten stops" />
          <Tile C={C} label="Near-miss losers" value={String(mi.nearMissLosers ?? "—")} color={mi.nearMissLosers > 2 ? GOLD : G} sub="losers that saw ≥+1R first — candidates the trim window should catch" />
        </div>
        <Explain C={C}><b>How to read the scatter:</b> dots near the gold diagonal sold close to the top. Red dots far to the right are the expensive ones — trades that offered 1R+ and died red; {mi.nearMissLosers} of your losers did this. That's the strongest argument for trim adherence: a T+3–T+5 trim converts part of every near-miss into banked profit. <span style={{ color: C.muted }}>MAE caveat: daily bars can overstate heat (the low may predate your entry time).</span></Explain>
      </Sec>

      {/* derisk lab */}
      <Sec C={C} title="Derisk-trim lab — is the new rule earning its keep?" sub={`trim adherence ${num(dk.adherencePct, 0)}% · target ≥80%`}>
        <DayStrip days={dk.dayMFEs} medLabel={dk.medDayMFE} caption="day each winner's MAXIMUM profit printed — median inside the window = the rule is aimed correctly" />
        <DayStrip days={dk.trimDays} medLabel={null} caption="day of your FIRST trim per campaign — dots left of the gold zone are early trims (only override on extreme extension)" />
        <ShadowBars camps={data.campaigns} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <Tile C={C} label="Shadow test (total)" value={(dk.deriskCostR > 0 ? "+" : "") + num(dk.deriskCostR) + "R"} color={dk.deriskCostR <= 0 ? G : GOLD} sub={dk.deriskCostR <= 0 ? "trims SAVED R vs never trimming" : "trims gave up R so far"} />
          <Tile C={C} label="Ext ≥5× exits" value={`${dk.ext5Exits?.winners}/${dk.ext5Exits?.n} wins`} color={G} sub="selling into statistical stretch" />
          <Tile C={C} label="Rescues" value={String(dk.rescues ?? 0)} color={BLUE} sub="runner died at BE after a profitable trim" />
        </div>
      </Sec>

      {/* open campaigns */}
      <Sec C={C} title="Open campaigns — realized + marked, never assumed finished" sub="the runners; unrealized R uses the campaign's own locked risk unit">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.64rem", fontVariantNumeric: "tabular-nums" }}>
            <thead><tr>{["Symbol", "Shares", "Entry", "Stop / trail", "Ext", "Realized so far", "Unrealized (marked)", "Campaign if trail hits", "Status"].map(h => th(h, null))}</tr></thead>
            <tbody>
              {(data.openCampaigns || []).map((o, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "5px 8px", fontWeight: 700 }}>{o.sym}</td>
                  <td style={{ padding: "5px 8px" }}>{o.shares}</td>
                  <td style={{ padding: "5px 8px" }}>{num(o.entry)}</td>
                  <td style={{ padding: "5px 8px" }}>{num(o.stop)} / {o.trail ? num(o.trail) : "—"}</td>
                  <td style={{ padding: "5px 8px" }}>{o.ext ?? "—"}</td>
                  <td style={{ padding: "5px 8px", color: (o.realizedUsd || 0) >= 0 ? G : R_ }}>{fmt$(o.realizedUsd)}</td>
                  <td style={{ padding: "5px 8px", color: (o.unrealUsd || 0) >= 0 ? G : R_ }}>{fmt$(o.unrealUsd)}{o.unrealR != null ? ` (${o.unrealR > 0 ? "+" : ""}${num(o.unrealR)}R)` : ""}</td>
                  <td style={{ padding: "5px 8px", color: (o.worstCaseUsd ?? 0) >= 0 ? G : R_, fontWeight: 700 }}>{o.worstCaseUsd != null ? fmt$(o.worstCaseUsd) : "—"}</td>
                  <td style={{ padding: "5px 8px" }}>{o.riskFree ? <span style={{ color: G }}>✅ risk-free</span> : <span style={{ color: GOLD }}>⚠ at risk</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Explain C={C}>This table exists because a trimmed campaign must never be read as a finished trade. <b>"Campaign if trail hits"</b> = realized so far + what the remaining shares lock in at the current stop/trail — the campaign's guaranteed floor. When a runner closes, the campaign moves into the closed cohort and every aggregate updates.</Explain>
      </Sec>

      {/* Monte Carlo */}
      <Sec C={C} title="Monte Carlo — 10,000 futures from your own R" sub={`resampled ${mc.trades} trades/path at ${mc.riskPct}% risk · n=${mc.n} (directional until n≥50)`}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Tile C={C} label="Median path" value={"+" + num(mc.retP50, 1) + "%"} color={G} sub="the realistic base case" />
          <Tile C={C} label="Unlucky (5th pct)" value={(mc.retP5 >= 0 ? "+" : "") + num(mc.retP5, 1) + "%"} sub="bad luck on the same skill" />
          <Tile C={C} label="Lucky (95th pct)" value={"+" + num(mc.retP95, 1) + "%"} sub="don't extrapolate this one" />
          <Tile C={C} label="Median max DD" value={num(mc.ddP50, 1) + "%"} color={GOLD} sub="normal breathing — expect it" />
          <Tile C={C} label="95th-pct worst DD" value={num(mc.ddP95, 1) + "%"} color={R_} sub="YOUR circuit-breaker line" />
          <Tile C={C} label="P(negative path)" value={num(mc.pNegative, 1) + "%"} sub="chance 100 trades end red" />
        </div>
        <Explain C={C}>A drawdown beyond the 95th-percentile line is <b>not normal variance for this system</b> — stop and diagnose. This replaces the raw ≥4-loss counter: at your win rate a 5-loss streak is scheduled (you already had one and stayed inside the envelope).</Explain>
      </Sec>

      {/* audit table */}
      <Sec C={C} title="Closed campaigns — the audit trail" sub="click a column to sort · every headline number traces here" defaultOpen={false}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.62rem", fontVariantNumeric: "tabular-nums" }}>
            <thead><tr>
              {th("Ticker", "ticker")}{th("P&L", "pl")}{th("R", "r")}{th("MFE R", "mfeR")}{th("MAE R", "maeR")}{th("Day of max", "dayMFE")}{th("Capture", "capture")}{th("Shadow R", "shadowR")}{th("Trim day", "trimDay")}{th("Exit reasons", null)}
            </tr></thead>
            <tbody>
              {sorted.map((c, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "4px 8px", fontWeight: 700 }}>{c.ticker}{c.rescued ? " 🛟" : ""}</td>
                  <td style={{ padding: "4px 8px", color: c.pl > 0 ? G : R_, fontWeight: 700 }}>{fmt$(c.pl)}</td>
                  <td style={{ padding: "4px 8px" }}>{num(c.blendedR ?? c.rSum)}</td>
                  <td style={{ padding: "4px 8px" }}>{num(c.mfeR)}</td>
                  <td style={{ padding: "4px 8px" }}>{num(c.maeR)}</td>
                  <td style={{ padding: "4px 8px" }}>{c.dayMFE ?? "—"}</td>
                  <td style={{ padding: "4px 8px" }}>{num(c.capture)}</td>
                  <td style={{ padding: "4px 8px", color: c.deriskCostR != null ? (c.deriskCostR <= 0 ? G : GOLD) : undefined }}>{num(c.shadowR)}{c.deriskCostR != null ? ` (${c.deriskCostR > 0 ? "+" : ""}${num(c.deriskCostR)})` : ""}</td>
                  <td style={{ padding: "4px 8px" }}>{c.trimDay ?? "—"}</td>
                  <td style={{ padding: "4px 8px", color: C.muted, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.reasons}>{c.reasons}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sec>

      {/* glossary */}
      <Sec C={C} title="Metric glossary — plain English" defaultOpen={false}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.66rem" }}>
          <tbody>
            {[
              ["R", "Profit measured in multiples of what you risked (entry − locked stop). Makes different-size trades comparable."],
              ["Expectancy", "Average R per trade = (avgWin×WR) − (avgLoss×(1−WR)). Positive = the machine pays you per pull, even losing most pulls."],
              ["Profit factor", "Gross $ won ÷ gross $ lost. 1.0 treading water · 1.3+ healthy · 2+ strong (Jeff's monthly bar)."],
              ["Payoff ratio", "Average win ÷ average loss. Must exceed (1−WR)÷WR — the breakeven curve — or the system loses by arithmetic."],
              ["SQN", "mean(R) ÷ std(R) × √n (Van Tharp). Rewards consistency: 1.6 tradeable · 2–3 good · 3–5 excellent."],
              ["MFE / MAE", "Max favorable / adverse excursion: the best and worst the trade looked between entry and exit. Capture = banked ÷ MFE."],
              ["Shadow R / derisk cost", "The never-trimmed parallel universe minus what you actually banked. Negative = your trims added value. THE metric for this system."],
              ["Day of MFE", "Which trading day the trade's best price printed. Median inside T+3→T+5 = the trim window is aimed where trades actually peak."],
              ["Rescue", "Runner died at breakeven AFTER a trim banked profit — a trade the derisk rule single-handedly turned green."],
              ["Monte Carlo", "Resample your own R results into thousands of simulated futures → return + drawdown envelopes → an evidence-based circuit-breaker."],
            ].map(([k, d]) => <tr key={k}><td style={{ padding: "4px 8px", color: C.gold, fontFamily: "ui-monospace,monospace", fontSize: "0.6rem", whiteSpace: "nowrap", fontWeight: 700 }}>{k}</td><td style={{ padding: "4px 8px", lineHeight: 1.55 }}>{d}</td></tr>)}
          </tbody>
        </table>
      </Sec>
    </div>
  );
}
