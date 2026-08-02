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

// TRACTION — "are my own recent trades working?" (Valen 2026-08-02, his 5th signal; the daily-plan
// sheet he studies carries the same row). PRE-REGISTERED: net R across the LAST 5 CLOSED trades.
//   > 0  → YES (the market is paying this style right now)
//   ≤ 0  → NO
//   fewer than 5 closed trades with an R multiple → null ("not measured", never "failed")
// R is the right unit here — it never reveals account size, so this row is safe under stream
// privacy and means the same thing for every member reading their own journal.
const TRACTION_N = 5;
function parseExit(d) {
  if (!d) return 0;
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return Date.parse(s.slice(0, 10)) || 0;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);       // M/D/YY or M/D/YYYY
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return Date.UTC(y, +m[1] - 1, +m[2]); }
  return Date.parse(s) || 0;
}
export function computeTraction(trades) {
  const rows = (Array.isArray(trades) ? trades : [])
    .filter(t => t && !t.is_deleted && t.rMult != null && isFinite(Number(t.rMult)))
    .sort((a, b) => parseExit(b.exit) - parseExit(a.exit))
    .slice(0, TRACTION_N);
  if (rows.length < TRACTION_N) return { v: null, sub: `only ${rows.length} closed trade${rows.length === 1 ? "" : "s"} with an R so far`, n: rows.length };
  const netR = rows.reduce((s2, t) => s2 + Number(t.rMult), 0);
  const wins = rows.filter(t => Number(t.rMult) > 0).length;
  return {
    v: netR > 0,
    sub: `last ${TRACTION_N}: ${wins}W / ${TRACTION_N - wins}L · ${netR >= 0 ? "+" : ""}${netR.toFixed(1)}R`,
    n: rows.length, netR, wins,
  };
}

export function computeTrend(trades) {
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
  // Personal feedback loop — deliberately NOT part of the regime formula below. The regime
  // describes the market; this row describes how the market is treating YOU.
  const tr = computeTraction(trades);

  // REGIME = the three PRICE-TREND rows only (daily · weekly · rising 5-day).
  //   all three YES → UPTREND · all three NO → DOWNTREND · anything mixed → CHOP
  // Breadth is deliberately excluded (it has its own card and answers a different question), and
  // traction is personal — neither belongs in a description of the market's trend. Cross-checked
  // against the reference daily-plan sheet: its 07-31 print had all three NO and read DOWNTREND.
  const trendRows = [daily, weekly, rising5];
  const known = trendRows.filter(v => v != null);
  const regime = known.length < 3 ? null
    : known.every(v => v) ? "UPTREND"
    : known.every(v => !v) ? "DOWNTREND"
    : "CHOP";

  return {
    asof: MARKET_MONITOR.asof, refreshed: MARKET_MONITOR.refreshed,
    signals: [
      { k: "daily", label: "Daily buy signal", sub: "S&P above its 10 & 20-day lines, 10 above 20", v: daily, drives: true },
      { k: "weekly", label: "Weekly buy signal", sub: "S&P above its 10 & 20-week lines, 10 above 20", v: weekly, drives: true },
      { k: "r5", label: "Price above a rising 5-day line", sub: "short-term momentum still up", v: rising5, drives: true },
      { k: "breadth", label: "Breadth supportive", sub: "more stocks up 25% than down, month and quarter", v: breadthOk },
      { k: "traction", label: "My recent trades working", sub: tr.sub, v: tr.v, mine: true },
    ],
    regime,
  };
}

const REGIME = {
  UPTREND: { fg: "#7ef0a0", bg: "rgba(34,197,94,0.13)", bd: "rgba(34,197,94,0.38)" },
  CHOP: { fg: "#f0c050", bg: "rgba(201,152,42,0.14)", bd: "rgba(201,152,42,0.4)" },
  DOWNTREND: { fg: "#fca5a5", bg: "rgba(239,68,68,0.13)", bd: "rgba(239,68,68,0.38)" },
};

export default function MarketTrend({ C, font, trades }) {
  const cardRef = useRef(null);
  const t = useMemo(() => computeTrend(trades), [trades]);
  if (!t) return null;
  // No per-card date stamp — the Daily Plan section header carries the ONE batch stamp.
  const rg = REGIME[t.regime] || REGIME.CHOP;
  return (
    <div ref={cardRef} className="card" style={{ fontFamily: font, display: "flex", flexDirection: "column" }}>
      <div className="cardhead">
        <span className="label">Market Trend</span>
        <InfoDot tip={{ lead: "Check this first, every day.", points: [
          "Is the index in gear on the daily and the weekly?",
          "Is short-term momentum still up?",
          "Is breadth backing it up?",
          "Are your own recent trades working?",
          "Every row is computed from S&P closes and your journal. No opinion.",
        ] }} />
        <LensCamera getEl={() => cardRef.current} name="market-trend" C={C} style={{ marginLeft: 6 }} />
        <XShare getEl={() => cardRef.current} C={C} />
      </div>
      {/* rows share the column height (flex:1 each) so the card fills its planrow slot with no void
          when the Situational card beside it runs taller */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
        {t.signals.map(s => (
          <div key={s.k} style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 10, background: "rgba(255,255,255,0.025)", border: `1px solid ${C.border}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: C.text, lineHeight: 1.35 }}>
                {s.drives && <span style={{ color: C.goldBright || C.gold, marginRight: 5, fontSize: "0.7em" }}>▸</span>}{s.label}
              </div>
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
        <InfoDot tip={{ lead: "Set by the three price rows marked ▸.", points: [
          "All three YES → UPTREND",
          "All three NO → DOWNTREND",
          "Anything mixed → CHOP",
          "Breadth and your own trades are context — they do not set the regime.",
        ] }} />
        <span style={{ marginLeft: "auto", fontSize: "0.82rem", fontWeight: 800, letterSpacing: "0.06em", color: rg.fg }}>{t.regime}</span>
      </div>
    </div>
  );
}
