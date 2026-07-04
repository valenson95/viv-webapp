import React, { useState, useMemo } from "react";

// ─────────────────────────────────────────────────────────────
// VIV Trade Calendar — monthly + yearly, TradeZella layout in VIV brand.
// Books each closed trade's P&L on its EXIT date (same as TradeZella).
// Pass `trades` (each with .exit / .exit_date + .plDollar / .pl_dollar),
// plus the app's `C` palette and `font`. Zero external deps.
// ─────────────────────────────────────────────────────────────

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function fmtK(v) {
  const a = Math.abs(v);
  if (a >= 1000) return (v < 0 ? "-" : "") + "$" + (a / 1000).toFixed(a >= 100000 ? 0 : 1) + "K";
  return (v < 0 ? "-" : "") + "$" + a.toFixed(0);
}

// Robust date → "YYYY-MM-DD". Handles ISO, ISO timestamps, and M/D/YY(YY).
function toISO(s) {
  if (!s) return null;
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { let y = m[3]; if (y.length === 2) y = "20" + y; return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  return null;
}

// Aggregate closed trades → { "YYYY-MM-DD": {net, n, w} } by EXIT date.
function useDailyMap(trades) {
  return useMemo(() => {
    const m = {};
    for (const t of (trades || [])) {
      const pl = t.plDollar == null ? (t.pl_dollar == null ? null : Number(t.pl_dollar)) : Number(t.plDollar);
      const iso = toISO(t.exit || t.exit_date);
      if (pl == null || isNaN(pl) || !iso) continue;
      if (!m[iso]) m[iso] = { net: 0, n: 0, w: 0 };
      m[iso].net += pl; m[iso].n += 1; if (pl > 0) m[iso].w += 1;
    }
    return m;
  }, [trades]);
}

function nowYM() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }

function navBtn(C) {
  return { width: 34, height: 34, borderRadius: 9, background: C.glass, border: `1px solid ${C.border}`, color: C.white, fontSize: "1.1rem", cursor: "pointer", lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center" };
}
function dowStyle(C) {
  return { fontSize: "0.62rem", letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, fontWeight: 700, textAlign: "center", padding: "6px 0" };
}

// ─── Monthly view ───
function Monthly({ daily, C, font, ym, setYm }) {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startDow = first.getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  let monthNet = 0, monthDays = 0, monthTrades = 0;
  for (let d = 1; d <= days; d++) {
    const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const info = daily[key];
    cells.push({ d, info });
    if (info) { monthNet += info.net; monthDays += 1; monthTrades += info.n; }
  }
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const nav = (delta) => {
    let ny = y, nm = m + delta;
    if (nm < 1) { nm = 12; ny--; } if (nm > 12) { nm = 1; ny++; }
    setYm(`${ny}-${String(nm).padStart(2, "0")}`);
  };

  const cellStyle = (info) => {
    let bg = "rgba(255,255,255,0.02)", bd = C.border;
    if (info) {
      if (info.net > 0) { bg = "rgba(34,197,94,0.13)"; bd = "rgba(34,197,94,0.34)"; }
      else if (info.net < 0) { bg = "rgba(239,68,68,0.12)"; bd = "rgba(239,68,68,0.30)"; }
      else { bg = "rgba(255,255,255,0.05)"; }
    }
    return { background: bg, border: `1px solid ${bd}`, borderRadius: 12, minHeight: 96, padding: "8px 11px", display: "flex", flexDirection: "column" };
  };

  return (
    <div style={{ fontFamily: font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => nav(-1)} style={navBtn(C)}>‹</button>
        <div style={{ fontSize: "1.15rem", fontWeight: 800, color: C.white, minWidth: 150 }}>{MONTHS[m - 1]} {y}</div>
        <button onClick={() => nav(1)} style={navBtn(C)}>›</button>
        <button onClick={() => setYm(nowYM())} style={{ ...navBtn(C), width: "auto", padding: "0 14px", fontSize: "0.72rem", fontWeight: 700 }}>This month</button>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, fontWeight: 700 }}>Monthly stats</span>
          <span style={{ fontSize: "0.94rem", fontWeight: 800, padding: "5px 11px", borderRadius: 9, background: monthNet > 0 ? "rgba(34,197,94,0.12)" : monthNet < 0 ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.05)", color: monthNet > 0 ? C.green : monthNet < 0 ? C.red : C.muted }}>{monthNet ? fmtK(monthNet) : "$0"}</span>
          <span style={{ fontSize: "0.78rem", fontWeight: 700, padding: "5px 11px", borderRadius: 9, background: C.goldDim, color: C.gold }}>{monthDays} day{monthDays !== 1 ? "s" : ""}</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr) 130px", gap: 7 }}>
        {DOW.map(d => <div key={d} style={dowStyle(C)}>{d}</div>)}
        <div style={dowStyle(C)}>Week</div>
        {weeks.map((wk, wi) => {
          let wnet = 0, wdays = 0;
          wk.forEach(c => { if (c && c.info) { wnet += c.info.net; wdays++; } });
          return (
            <React.Fragment key={wi}>
              {wk.map((c, ci) => {
                if (!c) return <div key={ci} style={{ background: "rgba(255,255,255,0.012)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: 12, minHeight: 96 }} />;
                return (
                  <div key={ci} style={cellStyle(c.info)}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: c.info ? C.white : C.muted, textAlign: "right" }}>{c.d}</div>
                    {c.info && <div style={{ marginTop: "auto" }}>
                      <div style={{ fontWeight: 800, fontSize: "0.98rem", color: c.info.net > 0 ? C.green : c.info.net < 0 ? C.red : C.muted }}>{fmtK(c.info.net)}</div>
                      <div style={{ fontSize: "0.6rem", color: C.muted, marginTop: 2 }}>{c.info.n} trade{c.info.n > 1 ? "s" : ""} · {Math.round(100 * c.info.w / c.info.n)}%</div>
                    </div>}
                  </div>
                );
              })}
              <div style={{ background: "rgba(201,152,42,0.05)", border: `1px solid ${C.borderGold}`, borderRadius: 12, padding: 10, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ fontSize: "0.58rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.gold, fontWeight: 800 }}>Week {wi + 1}</div>
                <div style={{ fontWeight: 800, fontSize: "1rem", marginTop: 3, color: wnet > 0 ? C.green : wnet < 0 ? C.red : C.muted }}>{wdays ? fmtK(wnet) : "—"}</div>
                <div style={{ fontSize: "0.56rem", color: C.muted }}>{wdays} day{wdays !== 1 ? "s" : ""}</div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Yearly view — year × month matrix (TradeZella layout, VIV brand) ───
function Yearly({ daily, C, font, onPickMonth }) {
  const [metric, setMetric] = useState("pnl"); // pnl | winrate | trades

  const { monthly, years, maxAbsNet, maxN } = useMemo(() => {
    const monthly = {}; // "YYYY-MM" -> {net,n,w}
    Object.entries(daily).forEach(([d, v]) => {
      const k = d.slice(0, 7);
      if (!monthly[k]) monthly[k] = { net: 0, n: 0, w: 0 };
      monthly[k].net += v.net; monthly[k].n += v.n; monthly[k].w += v.w;
    });
    const ys = new Set(Object.keys(monthly).map(k => k.slice(0, 4)));
    ys.add(String(new Date().getFullYear()));
    const years = [...ys].map(Number).sort((a, b) => b - a);
    let maxAbsNet = 1, maxN = 1;
    Object.values(monthly).forEach(v => { maxAbsNet = Math.max(maxAbsNet, Math.abs(v.net)); maxN = Math.max(maxN, v.n); });
    return { monthly, years, maxAbsNet, maxN };
  }, [daily]);

  const cellBg = (info) => {
    if (!info) return "rgba(255,255,255,0.02)";
    if (metric === "winrate") {
      const wr = info.n ? info.w / info.n : 0; const mag = Math.min(1, Math.abs(wr - 0.5) * 2);
      return wr >= 0.5 ? `rgba(34,197,94,${0.14 + mag * 0.5})` : `rgba(239,68,68,${0.12 + mag * 0.5})`;
    }
    if (metric === "trades") { const mag = Math.min(1, info.n / maxN); return `rgba(201,152,42,${0.10 + mag * 0.45})`; }
    const mag = Math.min(1, Math.abs(info.net) / maxAbsNet);
    return info.net > 0 ? `rgba(34,197,94,${0.14 + mag * 0.52})` : info.net < 0 ? `rgba(239,68,68,${0.12 + mag * 0.52})` : "rgba(255,255,255,0.06)";
  };
  const cellMain = (info) => {
    if (!info) return "--";
    if (metric === "winrate") return `${Math.round(100 * info.w / info.n)}%`;
    if (metric === "trades") return `${info.n}`;
    return fmtK(info.net);
  };
  const yearTotal = (yr) => {
    let net = 0, n = 0, w = 0;
    for (let mi = 0; mi < 12; mi++) { const v = monthly[`${yr}-${String(mi + 1).padStart(2, "0")}`]; if (v) { net += v.net; n += v.n; w += v.w; } }
    return { net, n, w };
  };

  const HEAD = ["Year", ...MONTHS_SHORT, "Total"];
  const TOGGLES = [["winrate", "Win rate"], ["pnl", "P&L"], ["trades", "Trades"]];

  return (
    <div style={{ fontFamily: font }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <div style={{ display: "flex", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          {TOGGLES.map(([k, lbl]) => (
            <button key={k} onClick={() => setMetric(k)} style={{ background: metric === k ? C.gold : "transparent", color: metric === k ? "#1a1206" : C.muted, border: "none", padding: "7px 15px", fontFamily: font, fontWeight: 700, fontSize: "0.76rem", cursor: "pointer" }}>{lbl}</button>
          ))}
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 900 }}>
          <div style={{ display: "grid", gridTemplateColumns: "62px repeat(12, 1fr) 84px", gap: 7, marginBottom: 7 }}>
            {HEAD.map((h, i) => <div key={i} style={{ ...dowStyle(C), textAlign: i === 0 ? "left" : "center", paddingLeft: i === 0 ? 4 : 0 }}>{h}</div>)}
          </div>
          {years.map(yr => {
            const tot = yearTotal(yr);
            return (
              <div key={yr} style={{ display: "grid", gridTemplateColumns: "62px repeat(12, 1fr) 84px", gap: 7, marginBottom: 7 }}>
                <div style={{ display: "flex", alignItems: "center", fontWeight: 800, fontSize: "0.9rem", color: C.white, paddingLeft: 4 }}>{yr}</div>
                {MONTHS_SHORT.map((_, mi) => {
                  const info = monthly[`${yr}-${String(mi + 1).padStart(2, "0")}`];
                  return (
                    <div key={mi} onClick={() => info && onPickMonth(`${yr}-${String(mi + 1).padStart(2, "0")}`)} title={info ? `${MONTHS_SHORT[mi]} ${yr}` : ""}
                      style={{ background: cellBg(info), border: `1px solid ${info ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)"}`, borderRadius: 10, minHeight: 60, padding: "8px 6px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", cursor: info ? "pointer" : "default", textAlign: "center" }}>
                      <div style={{ fontWeight: 800, fontSize: "0.82rem", color: info ? C.white : C.muted }}>{cellMain(info)}</div>
                      {info && <div style={{ fontSize: "0.58rem", color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{info.n} trade{info.n > 1 ? "s" : ""}</div>}
                    </div>
                  );
                })}
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 4px", textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: "0.82rem", color: metric === "pnl" ? (tot.net > 0 ? C.green : tot.net < 0 ? C.red : C.muted) : C.white }}>
                    {tot.n === 0 ? "--" : metric === "winrate" ? `${Math.round(100 * tot.w / tot.n)}%` : metric === "trades" ? `${tot.n}` : fmtK(tot.net)}
                  </div>
                  {tot.n > 0 && <div style={{ fontSize: "0.58rem", color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{tot.n} trades</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Public component: month/year toggle wrapper ───
export default function TradeCalendar({ trades, C, font }) {
  const daily = useDailyMap(trades);
  const keys = useMemo(() => [...new Set(Object.keys(daily).map(d => d.slice(0, 7)))].sort(), [daily]);
  const latest = keys.length ? keys[keys.length - 1] : nowYM();
  const [mode, setMode] = useState("month");
  const [ym, setYm] = useState(latest);

  const toggle = (m) => ({ background: mode === m ? C.gold : "transparent", color: mode === m ? "#1a1206" : C.muted, border: "none", padding: "7px 15px", fontFamily: font, fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <div style={{ display: "flex", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <button onClick={() => setMode("month")} style={toggle("month")}>Monthly</button>
          <button onClick={() => setMode("year")} style={toggle("year")}>Yearly</button>
        </div>
      </div>
      {mode === "month"
        ? <Monthly daily={daily} C={C} font={font} ym={ym} setYm={setYm} />
        : <Yearly daily={daily} C={C} font={font} onPickMonth={(k) => { setYm(k); setMode("month"); }} />}
    </div>
  );
}
