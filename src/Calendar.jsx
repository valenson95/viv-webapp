import React, { useState, useMemo } from "react";

// ─────────────────────────────────────────────────────────────
// VIV Trade Calendar — TradeZella-style monthly + yearly views
// Self-contained: pass `trades` (each with .exit date + .plDollar),
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

// Aggregate closed trades → { "YYYY-MM-DD": {net, n, w} } by exit date
function useDailyMap(trades) {
  return useMemo(() => {
    const m = {};
    for (const t of (trades || [])) {
      const pl = t.plDollar == null ? (t.pl_dollar == null ? null : Number(t.pl_dollar)) : Number(t.plDollar);
      const ex = t.exit || t.exit_date;
      if (pl == null || isNaN(pl) || !ex) continue;
      const d = String(ex).slice(0, 10);
      if (!m[d]) m[d] = { net: 0, n: 0, w: 0 };
      m[d].net += pl; m[d].n += 1; if (pl > 0) m[d].w += 1;
    }
    return m;
  }, [trades]);
}

function monthKeyList(daily) {
  const s = new Set();
  Object.keys(daily).forEach(d => s.add(d.slice(0, 7)));
  return [...s].sort();
}

// ─── Monthly view ───
function Monthly({ daily, C, font, ym, setYm }) {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startDow = first.getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  let monthNet = 0, monthDays = 0;
  for (let d = 1; d <= days; d++) {
    const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const info = daily[key];
    cells.push({ d, info });
    if (info) { monthNet += info.net; monthDays += 1; }
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
    let bg = C.glass, bd = C.border, tint = "";
    if (info) {
      if (info.net > 0) { bg = "rgba(34,197,94,0.14)"; bd = "rgba(34,197,94,0.30)"; }
      else if (info.net < 0) { bg = "rgba(239,68,68,0.13)"; bd = "rgba(239,68,68,0.28)"; }
      else { bg = "rgba(255,255,255,0.05)"; }
    }
    return { background: bg, border: `1px solid ${bd}`, borderRadius: 12, minHeight: 84, padding: "9px 10px", position: "relative", transition: "transform .12s", cursor: info ? "default" : "default" };
  };

  return (
    <div style={{ fontFamily: font }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={() => nav(-1)} style={navBtn(C)}>‹</button>
        <div style={{ fontSize: "1.15rem", fontWeight: 800, color: C.white, minWidth: 168 }}>{MONTHS[m - 1]} {y}</div>
        <button onClick={() => nav(1)} style={navBtn(C)}>›</button>
        <button onClick={() => { const now = new Date(); setYm(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`); }} style={{ ...navBtn(C), width: "auto", padding: "0 14px", fontSize: "0.72rem", fontWeight: 700 }}>This month</button>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, fontWeight: 700 }}>Monthly net · {monthDays} days</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 800, color: monthNet > 0 ? C.green : monthNet < 0 ? C.red : C.muted }}>{monthNet ? fmtK(monthNet) : "$0"}</div>
        </div>
      </div>
      {/* grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr) 126px", gap: 7 }}>
        {DOW.map(d => <div key={d} style={dowStyle(C)}>{d}</div>)}
        <div style={dowStyle(C)}>Week</div>
        {weeks.map((wk, wi) => {
          let wnet = 0, wdays = 0;
          wk.forEach(c => { if (c && c.info) { wnet += c.info.net; wdays++; } });
          return (
            <React.Fragment key={wi}>
              {wk.map((c, ci) => {
                if (!c) return <div key={ci} style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 12, minHeight: 84 }} />;
                return (
                  <div key={ci} style={cellStyle(c.info)}>
                    <div style={{ fontSize: "0.68rem", fontWeight: 700, color: C.muted }}>{c.d}</div>
                    {c.info && <>
                      <div style={{ fontWeight: 800, fontSize: "0.92rem", marginTop: 8, color: c.info.net > 0 ? C.green : c.info.net < 0 ? C.red : C.muted }}>{fmtK(c.info.net)}</div>
                      <div style={{ fontSize: "0.6rem", color: C.muted, marginTop: 1 }}>{c.info.n} trade{c.info.n > 1 ? "s" : ""} · {Math.round(100 * c.info.w / c.info.n)}%</div>
                    </>}
                  </div>
                );
              })}
              <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 12, padding: 9, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ fontSize: "0.58rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, fontWeight: 700 }}>Week {wi + 1}</div>
                <div style={{ fontWeight: 800, fontSize: "0.95rem", marginTop: 3, color: wnet > 0 ? C.green : wnet < 0 ? C.red : C.muted }}>{wdays ? fmtK(wnet) : "—"}</div>
                <div style={{ fontSize: "0.56rem", color: C.muted }}>{wdays} day{wdays !== 1 ? "s" : ""}</div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─── Yearly view (12 mini-month heatmaps) ───
function Yearly({ daily, C, font, year, setYear, onPickMonth }) {
  const miniCell = (info) => {
    let bg = "rgba(255,255,255,0.04)";
    if (info) {
      const mag = Math.min(1, Math.abs(info.net) / 8000);
      bg = info.net > 0 ? `rgba(34,197,94,${0.22 + mag * 0.5})` : info.net < 0 ? `rgba(239,68,68,${0.20 + mag * 0.5})` : "rgba(255,255,255,0.10)";
    }
    return { width: "100%", aspectRatio: "1", borderRadius: 3, background: bg };
  };
  let yearNet = 0;
  Object.entries(daily).forEach(([d, v]) => { if (d.slice(0, 4) === String(year)) yearNet += v.net; });

  return (
    <div style={{ fontFamily: font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <button onClick={() => setYear(year - 1)} style={navBtn(C)}>‹</button>
        <div style={{ fontSize: "1.2rem", fontWeight: 800, color: C.white }}>{year}</div>
        <button onClick={() => setYear(year + 1)} style={navBtn(C)}>›</button>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, fontWeight: 700 }}>Year net</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 800, color: yearNet > 0 ? C.green : yearNet < 0 ? C.red : C.muted }}>{yearNet ? fmtK(yearNet) : "$0"}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
        {MONTHS.map((mn, mi) => {
          const first = new Date(Date.UTC(year, mi, 1));
          const startDow = first.getUTCDay();
          const days = new Date(Date.UTC(year, mi + 1, 0)).getUTCDate();
          const cells = [];
          for (let i = 0; i < startDow; i++) cells.push(null);
          let mNet = 0, hasData = false;
          for (let d = 1; d <= days; d++) {
            const key = `${year}-${String(mi + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const info = daily[key];
            cells.push(info || undefined);
            if (info) { mNet += info.net; hasData = true; }
          }
          while (cells.length % 7) cells.push(null);
          return (
            <div key={mi} onClick={() => onPickMonth(`${year}-${String(mi + 1).padStart(2, "0")}`)} style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 13px", cursor: "pointer", transition: "border-color .15s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = C.borderGold} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 9 }}>
                <div style={{ fontWeight: 800, fontSize: "0.82rem", color: C.white }}>{MONTHS_SHORT[mi]}</div>
                <div style={{ fontWeight: 800, fontSize: "0.76rem", color: !hasData ? C.muted : mNet > 0 ? C.green : mNet < 0 ? C.red : C.muted }}>{hasData ? fmtK(mNet) : "—"}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
                {cells.map((c, ci) => c === null ? <div key={ci} /> : <div key={ci} title={c ? fmtK(c.net) : ""} style={miniCell(c)} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function navBtn(C) {
  return { width: 34, height: 34, borderRadius: 9, background: C.glass, border: `1px solid ${C.border}`, color: C.white, fontSize: "1.1rem", cursor: "pointer", lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center" };
}
function dowStyle(C) {
  return { fontSize: "0.62rem", letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, fontWeight: 700, textAlign: "center", paddingBottom: 2 };
}

// ─── Public component: month/year toggle wrapper ───
export default function TradeCalendar({ trades, C, font }) {
  const daily = useDailyMap(trades);
  const keys = monthKeyList(daily);
  const latest = keys.length ? keys[keys.length - 1] : `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
  const [mode, setMode] = useState("month");
  const [ym, setYm] = useState(latest);
  const [year, setYear] = useState(Number(latest.slice(0, 4)));

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
        : <Yearly daily={daily} C={C} font={font} year={year} setYear={setYear} onPickMonth={(k) => { setYm(k); setMode("month"); }} />}
    </div>
  );
}
