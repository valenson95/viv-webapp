import React, { useMemo, useRef } from "react";
import { MARKET_MONITOR } from "./marketMonitor-data.js";
import { InfoDot } from "./GroupRS.jsx";
import { readBreadth } from "./MarketMonitor.jsx";
import { LensCamera, XShare } from "./capture.jsx";

// ── MARKET TREND — the daily checklist card ──────────────────────────────────
// A short table of YES/NO trend signals on the S&P 500, ending in one regime verdict —
// the "check this first every day" panel (Valen 2026-08-02, modelled on the daily-plan
// sheet he studies). Every signal is MECHANICAL: computed from the S&P closes already
// shipped inside the breadth sheet snapshot (marketMonitor-data.js carries `sp` per
// session), so this card refreshes with the breadth push and can never disagree with it.
//
// Pre-registered rules (do not tune casually):
//   Daily buy signal    = close > SMA10 AND close > SMA20 AND SMA10 > SMA20
//   Rising 5-DMA        = close > SMA5 AND SMA5 > yesterday's SMA5
//   Weekly buy signal   = weekly close > 10-week MA AND > 20-week MA AND 10wk > 20wk
//   Breadth supportive  = both ±25% pairs green AND no heavy-selling extreme (readBreadth)
//   Regime              = UPTREND when daily AND weekly are YES · DOWNTREND when both are
//                         NO · CHOP otherwise.
//
const sma = (arr, k, end) => {
  if (end + 1 < k) return null;
  let s = 0;
  for (let i = end - k + 1; i <= end; i++) s += arr[i];
  return s / k;
};

// Monday of the ISO week for a YYYY-MM-DD string (pure-UTC math — never Intl-timeZone here).
const isoWeekMon = (iso) => {
  const d = new Date(iso + "T00:00:00Z");
  const wd = (d.getUTCDay() + 6) % 7; // Mon=0
  d.setUTCDate(d.getUTCDate() - wd);
  return d.toISOString().slice(0, 10);
};

export function computeTrend() {
  const rows = ((MARKET_MONITOR && MARKET_MONITOR.rows) || []).filter(r => r.sp != null && isFinite(r.sp));
  if (rows.length < 25) return null;
  const c = rows.map(r => r.sp);
  const n = c.length - 1;
  const P = c[n];

  const s5 = sma(c, 5, n), s5p = sma(c, 5, n - 1), s10 = sma(c, 10, n), s20 = sma(c, 20, n);
  const daily = s10 != null && s20 != null ? P > s10 && P > s20 && s10 > s20 : null;
  const rising5 = s5 != null && s5p != null ? P > s5 && s5 > s5p : null;

  // Weekly series: the LAST close of each ISO week (the current, possibly partial, week counts
  // as its own point — same as reading the weekly chart mid-week).
  const byWeek = new Map();
  rows.forEach(r => byWeek.set(isoWeekMon(r.date), r.sp));
  const w = [...byWeek.values()];
  const wn = w.length - 1;
  const w10 = sma(w, 10, wn), w20 = sma(w, 20, wn);
  const WP = w[wn];
  const weekly = w10 != null && w20 != null ? WP > w10 && WP > w20 && w10 > w20 : null;

  const b = readBreadth(rows[rows.length - 1] || {});
  const breadthOk = b.breakouts.more;

  const regime = daily == null || weekly == null ? null
    : daily && weekly ? "UPTREND"
    : !daily && !weekly ? "DOWNTREND"
    : "CHOP";

  return {
    asof: MARKET_MONITOR.asof, refreshed: MARKET_MONITOR.refreshed,
    signals: [
      { k: "daily", label: "Daily buy signal", sub: "S&P above its 10 & 20-day lines, 10 above 20", v: daily },
      { k: "weekly", label: "Weekly buy signal", sub: "S&P above its 10 & 20-week lines, 10 above 20", v: weekly },
      { k: "r5", label: "Price above a rising 5-day line", sub: "short-term momentum still up", v: rising5 },
      { k: "breadth", label: "Breadth supportive", sub: "more stocks up 25% than down, month and quarter", v: breadthOk },
    ],
    regime,
  };
}

const REGIME = {
  UPTREND: { fg: "#7ef0a0", bg: "rgba(34,197,94,0.13)", bd: "rgba(34,197,94,0.38)" },
  CHOP: { fg: "#f0c050", bg: "rgba(201,152,42,0.14)", bd: "rgba(201,152,42,0.4)" },
  DOWNTREND: { fg: "#fca5a5", bg: "rgba(239,68,68,0.13)", bd: "rgba(239,68,68,0.38)" },
};

export default function MarketTrend({ C, font }) {
  const cardRef = useRef(null);
  const t = useMemo(computeTrend, []);
  if (!t) return null;
  // No per-card date stamp — the Daily Plan section header carries the ONE batch stamp.
  const rg = REGIME[t.regime] || REGIME.CHOP;
  return (
    <div ref={cardRef} className="card" style={{ fontFamily: font, display: "flex", flexDirection: "column" }}>
      <div className="cardhead">
        <span className="label">Market Trend</span>
        <InfoDot tip="The daily first-check: is the index in gear on the daily and the weekly, and is breadth backing it up? Every row is computed from S&P closes — nothing is opinion." />
        <LensCamera getEl={() => cardRef.current} name="market-trend" C={C} style={{ marginLeft: 6 }} />
        <XShare getEl={() => cardRef.current} C={C} text={`Market trend — ${t.asof}\n\nMarket regime: ${t.regime}\n\nvalensontrades.com`} />
      </div>
      {/* rows share the column height (flex:1 each) so the card fills its planrow slot with no void
          when the Situational card beside it runs taller */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
        {t.signals.map(s => (
          <div key={s.k} style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: `1px solid ${C.border}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: C.text, lineHeight: 1.35 }}>{s.label}</div>
              <div style={{ fontSize: "0.6rem", color: C.muted, lineHeight: 1.4 }}>{s.sub}</div>
            </div>
            <span style={{ flex: "none", minWidth: 40, textAlign: "center", fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.04em", padding: "3px 9px", borderRadius: 7, color: s.v == null ? C.muted : s.v ? "#7ef0a0" : "#fca5a5", background: s.v == null ? "rgba(255,255,255,0.04)" : s.v ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)", border: `1px solid ${s.v == null ? C.border : s.v ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}` }}>
              {s.v == null ? "—" : s.v ? "YES" : "NO"}
            </span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, background: rg.bg, border: `1px solid ${rg.bd}` }}>
        <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.13em", textTransform: "uppercase", color: C.muted }}>Market regime</span>
        <span style={{ marginLeft: "auto", fontSize: "0.82rem", fontWeight: 800, letterSpacing: "0.06em", color: rg.fg }}>{t.regime}</span>
      </div>
    </div>
  );
}
