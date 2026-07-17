import React, { useState, useMemo, useRef, useEffect } from "react";
import { captureElement } from "./captureElement.js";

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

// ── $ / R / % display helpers. info = day/week/month/year bucket with {net, r, rN, pct}. ──
// R sums only trades WITH a recorded R (rN of them); % is the honest sum of per-trade %.
// A bucket with zero R-recorded trades shows "—" in R mode — an R is never invented.
function unitMain(info, unit) {
  if (!info) return "—";
  if (unit === "r") return info.rN ? (info.r >= 0 ? "+" : "") + info.r.toFixed(1) + "R" : "—";
  if (unit === "pct") return (info.pct >= 0 ? "+" : "") + info.pct.toFixed(2) + "%";
  return fmtK(info.net);
}
function unitVal(info, unit) { if (!info) return 0; return unit === "r" ? (info.rN ? info.r : 0) : unit === "pct" ? info.pct : info.net; }

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
// IMPORTANT: campaign rows arrive MERGED (partial trims rolled up, stamped with the LAST exit date —
// right for the trades list, wrong for daily booking: a Jul-1 trim must not book on Jul-6).
// So explode campaigns back to their fills (._fills), book each fill on its own exit day, then
// re-group same ticker+side+day so the day panel still reads one line per position.
function useDailyMap(trades) {
  return useMemo(() => {
    const fills = (trades || []).flatMap(t => (t._fills && t._fills.length > 1 ? t._fills : [t]));
    const byDayTicker = {};
    for (const f of fills) {
      const pl = f.plDollar == null ? (f.pl_dollar == null ? null : Number(f.pl_dollar)) : Number(f.plDollar);
      const iso = toISO(f.exit || f.exit_date);
      if (pl == null || isNaN(pl) || !iso) continue;
      const k = iso + "|" + (f.ticker || "") + "|" + (f.tradeType || f.trade_type || "Long");
      (byDayTicker[k] = byDayTicker[k] || { iso, rows: [] }).rows.push(f);
    }
    const m = {};
    for (const { iso, rows } of Object.values(byDayTicker)) {
      const pl = rows.reduce((s, f) => s + (Number(f.plDollar ?? f.pl_dollar) || 0), 0);
      const cost = rows.reduce((s, f) => s + (Number(f.entryP ?? f.entry_price) || 0) * (Number(f.shares) || 0), 0);
      const rep = { ...rows[0], plDollar: +pl.toFixed(2), plPct: cost ? +((pl / cost) * 100).toFixed(2) : (rows[0].plPct ?? rows[0].pl_pct ?? null), _dayFills: rows.length };
      if (!m[iso]) m[iso] = { net: 0, n: 0, w: 0, r: 0, rN: 0, noR: 0, pct: 0, trades: [] };
      m[iso].net += pl; m[iso].n += 1; if (pl > 0) m[iso].w += 1; m[iso].trades.push(rep);
      // Per-day R (recorded only) + per-day sum of trade %. R is never invented — no-R trades are counted.
      const rv = rep.rMult == null ? (rep.r_mult == null ? null : Number(rep.r_mult)) : Number(rep.rMult);
      if (rv != null && isFinite(rv)) { m[iso].r += rv; m[iso].rN += 1; } else { m[iso].noR += 1; }
      const pv = rep.plPct == null ? null : Number(rep.plPct);
      if (pv != null && isFinite(pv)) m[iso].pct += pv;
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
function Monthly({ daily, C, font, ym, setYm, onOpenTrade, unit }) {
  const [selDay, setSelDay] = useState(null); // "YYYY-MM-DD" — clicked day expands its trade list
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startDow = first.getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  let monthNet = 0, monthDays = 0, monthTrades = 0, monthR = 0, monthRN = 0, monthNoR = 0, monthPct = 0;
  for (let d = 1; d <= days; d++) {
    const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const info = daily[key];
    cells.push({ d, info });
    if (info) { monthNet += info.net; monthDays += 1; monthTrades += info.n; monthR += info.r; monthRN += info.rN; monthNoR += info.noR; monthPct += info.pct; }
  }
  const monthAgg = { net: monthNet, r: monthR, rN: monthRN, noR: monthNoR, pct: monthPct };
  const monthColVal = unitVal(monthAgg, unit);
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const nav = (delta) => {
    let ny = y, nm = m + delta;
    if (nm < 1) { nm = 12; ny--; } if (nm > 12) { nm = 1; ny++; }
    setSelDay(null);
    setYm(`${ny}-${String(nm).padStart(2, "0")}`);
  };

  const cellStyle = (info) => {
    let bg = "rgba(255,255,255,0.02)", bd = C.border;
    if (info) {
      const cv = unitVal(info, unit);
      if (cv > 0) { bg = "rgba(34,197,94,0.13)"; bd = "rgba(34,197,94,0.34)"; }
      else if (cv < 0) { bg = "rgba(239,68,68,0.12)"; bd = "rgba(239,68,68,0.30)"; }
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
          <span style={{ fontSize: "0.94rem", fontWeight: 800, padding: "5px 11px", borderRadius: 9, background: monthColVal > 0 ? "rgba(34,197,94,0.12)" : monthColVal < 0 ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.05)", color: monthColVal > 0 ? C.green : monthColVal < 0 ? C.red : C.muted }}>{monthDays ? unitMain(monthAgg, unit) : (unit === "$" ? "$0" : unit === "r" ? "—" : "0.00%")}</span>
          <span style={{ fontSize: "0.78rem", fontWeight: 700, padding: "5px 11px", borderRadius: 9, background: C.goldDim, color: C.gold }}>{monthDays} day{monthDays !== 1 ? "s" : ""}</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr) 130px", gap: 7 }}>
        {DOW.map(d => <div key={d} style={dowStyle(C)}>{d}</div>)}
        <div style={dowStyle(C)}>Week</div>
        {weeks.map((wk, wi) => {
          let wnet = 0, wdays = 0, wr = 0, wrN = 0, wpct = 0;
          wk.forEach(c => { if (c && c.info) { wnet += c.info.net; wdays++; wr += c.info.r; wrN += c.info.rN; wpct += c.info.pct; } });
          const wAgg = { net: wnet, r: wr, rN: wrN, pct: wpct }, wcv = unitVal(wAgg, unit);
          return (
            <React.Fragment key={wi}>
              {wk.map((c, ci) => {
                if (!c) return <div key={ci} style={{ background: "rgba(255,255,255,0.012)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: 12, minHeight: 96 }} />;
                const key = `${y}-${String(m).padStart(2, "0")}-${String(c.d).padStart(2, "0")}`;
                const sel = selDay === key;
                return (
                  <div key={ci} onClick={c.info ? () => setSelDay(sel ? null : key) : undefined}
                    title={c.info ? (sel ? "Hide the day's trades" : "Click to see the trades exited this day") : undefined}
                    style={{ ...cellStyle(c.info), cursor: c.info ? "pointer" : "default", ...(sel ? { border: `1px solid ${C.goldBright}`, boxShadow: "0 0 0 1px " + C.goldBright + ", 0 6px 18px rgba(240,192,80,0.15)" } : {}), transition: "border-color .12s, box-shadow .12s" }}>
                    <div style={{ fontSize: "0.72rem", fontWeight: 700, color: c.info ? C.white : C.muted, textAlign: "right" }}>{c.d}</div>
                    {c.info && (() => { const cv = unitVal(c.info, unit); return <div style={{ marginTop: "auto" }}>
                      <div style={{ fontWeight: 800, fontSize: "0.98rem", color: cv > 0 ? C.green : cv < 0 ? C.red : C.muted }}>{unitMain(c.info, unit)}</div>
                      <div style={{ fontSize: "0.6rem", color: C.muted, marginTop: 2 }}>{c.info.n} trade{c.info.n > 1 ? "s" : ""} · {Math.round(100 * c.info.w / c.info.n)}% {sel ? "▴" : "▾"}</div>
                    </div>; })()}
                  </div>
                );
              })}
              <div style={{ background: "rgba(201,152,42,0.05)", border: `1px solid ${C.borderGold}`, borderRadius: 12, padding: 10, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ fontSize: "0.58rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.gold, fontWeight: 800 }}>Week {wi + 1}</div>
                <div style={{ fontWeight: 800, fontSize: "1rem", marginTop: 3, color: wcv > 0 ? C.green : wcv < 0 ? C.red : C.muted }}>{wdays ? unitMain(wAgg, unit) : "—"}</div>
                <div style={{ fontSize: "0.56rem", color: C.muted }}>{wdays} day{wdays !== 1 ? "s" : ""}</div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      {unit === "r" && monthNoR > 0 && (
        <div style={{ marginTop: 10, fontSize: "0.64rem", color: C.muted }}>{monthNoR} trade{monthNoR === 1 ? "" : "s"} without a recorded R excluded — never guessed.</div>
      )}
      {/* DAY EXPANSION — the trades exited on the clicked day, each openable */}
      {selDay && daily[selDay] && (() => {
        const info = daily[selDay];
        const dt = new Date(selDay + "T00:00:00Z");
        const nice = `${DOW[dt.getUTCDay()]}, ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
        const plOf = (t) => t.plDollar == null ? Number(t.pl_dollar) : Number(t.plDollar);
        return (
          <div style={{ marginTop: 12, background: "rgba(255,255,255,0.02)", border: `1px solid ${C.borderGold}`, borderRadius: 14, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold }}>{nice}</span>
              <span style={{ fontSize: "0.8rem", fontWeight: 800, color: info.net > 0 ? C.green : info.net < 0 ? C.red : C.muted }}>{fmtK(info.net)}</span>
              <span style={{ fontSize: "0.68rem", color: C.muted }}>{info.n} trade{info.n > 1 ? "s" : ""} exited · {Math.round(100 * info.w / info.n)}% win</span>
              <button onClick={() => setSelDay(null)} aria-label="Collapse" style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, width: 26, height: 26, cursor: "pointer", lineHeight: 1 }}>×</button>
            </div>
            {(info.trades || []).slice().sort((a, b) => plOf(b) - plOf(a)).map((t, k) => {
              const pl = plOf(t), pct = t.plPct == null ? (t.pl_pct == null ? null : Number(t.pl_pct)) : Number(t.plPct);
              const r = t.rMult == null ? (t.r_mult == null ? null : Number(t.r_mult)) : Number(t.rMult);
              return (
                <div key={t.id || k} style={{ display: "flex", alignItems: "center", gap: 14, padding: "8px 4px", borderTop: k ? "1px solid rgba(255,255,255,0.05)" : "none", fontSize: "0.82rem", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 800, color: C.white, minWidth: 58 }}>{t.ticker}</span>
                  <span style={{ fontSize: "0.66rem", fontWeight: 700, color: C.muted, minWidth: 42 }}>{t.tradeType || t.trade_type || "Long"}</span>
                  <span style={{ fontWeight: 800, minWidth: 76, color: pl > 0 ? C.green : pl < 0 ? C.red : C.muted }}>{(pl >= 0 ? "+" : "-") + "$" + Math.abs(pl).toFixed(0)}</span>
                  <span style={{ minWidth: 62, color: (pct || 0) >= 0 ? C.green : C.red }}>{pct != null && !isNaN(pct) ? `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` : "—"}</span>
                  <span style={{ minWidth: 52, color: C.muted }}>{r != null && !isNaN(r) ? `${r >= 0 ? "+" : ""}${r.toFixed(2)}R` : "—"}</span>
                  {onOpenTrade && (
                    <button onClick={() => onOpenTrade(t)} style={{ marginLeft: "auto", background: C.goldDim, border: `1px solid ${C.borderGold}`, color: C.goldBright, fontFamily: font, fontWeight: 700, fontSize: "0.7rem", padding: "6px 14px", borderRadius: 99, cursor: "pointer", whiteSpace: "nowrap" }}>Go to trade details ›</button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Yearly view — year × month matrix (TradeZella layout, VIV brand) ───
function Yearly({ daily, C, font, onPickMonth, unit }) {
  const [metric, setMetric] = useState("pnl"); // pnl | winrate | trades

  const { monthly, years, maxAbsNet, maxN } = useMemo(() => {
    const monthly = {}; // "YYYY-MM" -> {net,n,w,r,rN,noR,pct}
    Object.entries(daily).forEach(([d, v]) => {
      const k = d.slice(0, 7);
      if (!monthly[k]) monthly[k] = { net: 0, n: 0, w: 0, r: 0, rN: 0, noR: 0, pct: 0 };
      monthly[k].net += v.net; monthly[k].n += v.n; monthly[k].w += v.w;
      monthly[k].r += v.r; monthly[k].rN += v.rN; monthly[k].noR += v.noR; monthly[k].pct += v.pct;
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
    return unitMain(info, unit);
  };
  const yearTotal = (yr) => {
    let net = 0, n = 0, w = 0, r = 0, rN = 0, noR = 0, pct = 0;
    for (let mi = 0; mi < 12; mi++) { const v = monthly[`${yr}-${String(mi + 1).padStart(2, "0")}`]; if (v) { net += v.net; n += v.n; w += v.w; r += v.r; rN += v.rN; noR += v.noR; pct += v.pct; } }
    return { net, n, w, r, rN, noR, pct };
  };
  const yearsNoR = years.reduce((s, yr) => s + yearTotal(yr).noR, 0);

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
                  <div style={{ fontWeight: 800, fontSize: "0.82rem", color: metric === "pnl" ? (unitVal(tot, unit) > 0 ? C.green : unitVal(tot, unit) < 0 ? C.red : C.muted) : C.white }}>
                    {tot.n === 0 ? "--" : metric === "winrate" ? `${Math.round(100 * tot.w / tot.n)}%` : metric === "trades" ? `${tot.n}` : unitMain(tot, unit)}
                  </div>
                  {tot.n > 0 && <div style={{ fontSize: "0.58rem", color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{tot.n} trades</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {unit === "r" && metric === "pnl" && yearsNoR > 0 && (
        <div style={{ marginTop: 10, fontSize: "0.64rem", color: C.muted }}>{yearsNoR} trade{yearsNoR === 1 ? "" : "s"} without a recorded R excluded — never guessed.</div>
      )}
    </div>
  );
}

// ─── Public component: month/year toggle wrapper ───
export default function TradeCalendar({ trades, C, font, onOpenTrade }) {
  const daily = useDailyMap(trades);
  const keys = useMemo(() => [...new Set(Object.keys(daily).map(d => d.slice(0, 7)))].sort(), [daily]);
  const latest = keys.length ? keys[keys.length - 1] : nowYM();
  const [mode, setMode] = useState("month");
  const [ym, setYm] = useState(latest);
  const [unit, setUnit] = useState(() => { try { return localStorage.getItem("viv-cal-mode") || "$"; } catch { return "$"; } });
  useEffect(() => { try { localStorage.setItem("viv-cal-mode", unit); } catch { /* private mode */ } }, [unit]);
  const rootRef = useRef(null);
  const trackRef = useRef(null);
  const [camOpen, setCamOpen] = useState(false);
  const [camStatus, setCamStatus] = useState(null);

  const toggle = (m) => ({ background: mode === m ? C.gold : "transparent", color: mode === m ? "#1a1206" : C.muted, border: "none", padding: "7px 15px", fontFamily: font, fontWeight: 700, fontSize: "0.78rem", cursor: "pointer" });

  // $ / R / % segmented control — a gold thumb slides between three options; click OR drag on the
  // track (pointer x → option) selects. Persisted per browser as "viv-cal-mode".
  const UNITS = [["$", "$"], ["r", "R"], ["pct", "%"]];
  const idx = Math.max(0, UNITS.findIndex(u => u[0] === unit));
  const pick = (clientX) => { const el = trackRef.current; if (!el) return; const r = el.getBoundingClientRect(); const f = (clientX - r.left) / Math.max(1, r.width); const i = Math.max(0, Math.min(2, Math.floor(f * 3))); setUnit(UNITS[i][0]); };
  const onTrackDown = (e) => { e.preventDefault(); pick(e.clientX); const move = (ev) => pick(ev.clientX); const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); }; window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); };

  const doCapture = async (m) => { setCamOpen(false); const st = await captureElement(rootRef.current, m, "VIV-Calendar"); if (st) { setCamStatus(st); setTimeout(() => setCamStatus(null), 2200); } };

  return (
    <div ref={rootRef}>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        {/* camera */}
        <div className="viv-hide-screenshot" style={{ position: "relative" }}>
          <button type="button" onClick={() => setCamOpen(o => !o)} title="Save this calendar as an image"
            style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 9, color: camStatus ? C.green : C.muted, cursor: "pointer", fontSize: "0.9rem", lineHeight: 1, padding: "6px 10px" }}>
            {camStatus === "copied" ? "Copied ✓" : camStatus === "downloaded" ? "Downloaded ✓" : "📷"}
          </button>
          {camOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 20, background: "#11111b", border: `1px solid ${C.border}`, borderRadius: 10, padding: 5, boxShadow: "0 12px 30px rgba(0,0,0,0.5)", whiteSpace: "nowrap" }}>
              <button type="button" onClick={() => doCapture("copy")} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", color: C.white, fontFamily: font, fontSize: "0.72rem", fontWeight: 600, padding: "6px 12px", borderRadius: 7, cursor: "pointer" }}>Copy image</button>
              <button type="button" onClick={() => doCapture("download")} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", color: C.white, fontFamily: font, fontSize: "0.72rem", fontWeight: 600, padding: "6px 12px", borderRadius: 7, cursor: "pointer" }}>Download PNG</button>
            </div>
          )}
        </div>
        {/* $ / R / % sliding toggle */}
        <div ref={trackRef} onPointerDown={onTrackDown} title="Show P&L as dollars, R-multiples, or percent"
          style={{ position: "relative", display: "flex", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", cursor: "pointer", userSelect: "none", touchAction: "none" }}>
          <div style={{ position: "absolute", top: 3, bottom: 3, left: 3, width: "calc((100% - 6px) / 3)", transform: `translateX(${idx * 100}%)`, background: C.gold, borderRadius: 8, transition: "transform .18s cubic-bezier(.22,1,.36,1)", pointerEvents: "none" }} />
          {UNITS.map(([k, lbl]) => (
            <span key={k} style={{ position: "relative", zIndex: 1, color: unit === k ? "#1a1206" : C.muted, padding: "7px 0", width: 40, textAlign: "center", fontFamily: font, fontWeight: 700, fontSize: "0.78rem", pointerEvents: "none" }}>{lbl}</span>
          ))}
        </div>
        {/* Monthly / Yearly */}
        <div style={{ display: "flex", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
          <button onClick={() => setMode("month")} style={toggle("month")}>Monthly</button>
          <button onClick={() => setMode("year")} style={toggle("year")}>Yearly</button>
        </div>
      </div>
      {mode === "month"
        ? <div style={{ overflowX: "auto" }}><div style={{ minWidth: 760 }}><Monthly daily={daily} C={C} font={font} ym={ym} setYm={setYm} onOpenTrade={onOpenTrade} unit={unit} /></div></div>
        : <Yearly daily={daily} C={C} font={font} onPickMonth={(k) => { setYm(k); setMode("month"); }} unit={unit} />}
    </div>
  );
}
