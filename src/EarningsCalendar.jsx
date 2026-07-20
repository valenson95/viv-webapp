import React, { useMemo, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { EARNINGS } from "./earnings-data.js";
import { GROUP_RS } from "./groupRS-data.js";
import { InfoDot } from "./GroupRS.jsx";
import { LensCamera } from "./capture.jsx";

// ── EARNINGS CALENDAR — V4 "est→actual lifecycle + surprise radar" ────────────
// Top → bottom: header+filters · ON YOUR RADAR (leaders-only day strip) · SURPRISE RADAR
// (last week's biggest surprises + real reactions) · DAY NAVIGATOR (past-7 + forward pills +
// ONE day panel; past days render REPORTED mode) · chip → detail popup (lifecycle-aware) ·
// view toggle [Compact · Week grid].
//
// Base data = the committed src/earnings-data.js snapshot; on the live domain it tries
// /api/earnings for freshness and MERGES (keeps snapshot rx). Every data surface carries its
// refresh date. No logos — hierarchy = market cap + Liquid Leaders. Educational, not advice.

const ADMIN_EMAIL = "vc-lv@live.com";

const LIQUID_LEADERS = new Set((GROUP_RS?.ll || []).map((r) => r.t));
const LL_BY_T = Object.fromEntries((GROUP_RS?.ll || []).map((r) => [r.t, r]));
const isLeader = (t) => LIQUID_LEADERS.has(t);

// ── formatters ───────────────────────────────────────────────────────────────
const abbrev = (v) => {
  if (v == null || !isFinite(v)) return null;
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};
const eps = (v) => (v == null || !isFinite(v) ? null : (v < 0 ? "−$" : "$") + Math.abs(v).toFixed(2));
const sgnPct = (v, d = 1) => (v == null || !isFinite(v) ? "—" : (v > 0 ? "+" : "") + v.toFixed(d) + "%");
const pctCol = (v) => (v == null || !isFinite(v) ? "rgba(255,255,255,0.55)" : v > 0 ? "#86efac" : v < 0 ? "#fca5a5" : "rgba(255,255,255,0.6)");
// actual-vs-estimate color: green on a beat, red on a miss, neutral when equal/unknown.
// Prefer the reported surprise% (keeps the Actual color in lockstep with the ✓/✗ chip beside it),
// falling back to a direct actual-vs-estimate compare when surprise% isn't published.
const NEUTRAL = "rgba(255,255,255,0.6)";
const GREEN = "#7ef0a0", RED = "#fca5a5";
const beatCol = (r) => {
  const p = r.surprisePct;
  if (p != null && isFinite(p)) return p > 0 ? GREEN : p < 0 ? RED : NEUTRAL;
  const e = r.epsEst, a = r.epsActual;
  if (e == null || a == null || !isFinite(e) || !isFinite(a) || a === e) return NEUTRAL;
  return a > e ? GREEN : RED;
};

// date helpers — UTC-noon parse so weekday/label never drift by timezone.
const D = (s) => new Date(s + "T12:00:00Z");
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WDL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// English ordinal: 1st 2nd 3rd 4th … 11th 12th 13th … 21st 22nd 23rd … 31st.
const ordinal = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const monDay = (s) => { const d = D(s); return `${MO[d.getUTCMonth()]} ${d.getUTCDate()}`; };
const wdNum = (s) => { const d = D(s); return `${WD[d.getUTCDay()].toUpperCase()} ${d.getUTCDate()}`; };
// "20th Jul (Monday)" — ordinal day + short month + full weekday.
const ordDay = (s) => { const d = D(s); return `${ordinal(d.getUTCDate())} ${MO[d.getUTCMonth()]} (${WDL[d.getUTCDay()]})`; };
const longDay = (s) => { const d = D(s); return `${WD[d.getUTCDay()]} ${MO[d.getUTCMonth()]} ${d.getUTCDate()}`; };
// "today" = the US-EASTERN trading date (members are mostly UTC+8 — after their midnight the US
// session is still the prior calendar day). en-CA formats as YYYY-MM-DD directly.
const todayISO = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const weekStart = (s) => { const d = D(s); const g = d.getUTCDay(); const back = g === 0 ? 6 : g - 1; d.setUTCDate(d.getUTCDate() - back); return d.toISOString().slice(0, 10); };
const addISO = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayDiff = (a, b) => Math.round((D(a) - D(b)) / 86400000);

const STACKS = [
  { key: "bmo", label: "Before Open", icon: "☀", fg: "#93c5fd" },
  { key: "amc", label: "After Close", icon: "🌙", fg: "#c4b5fd" },
  { key: "tbc", label: "Time TBC", icon: "—", fg: "rgba(255,255,255,0.5)" },
];
const timeGlyph = (t) => (t === "bmo" ? "☀" : t === "amc" ? "🌙" : "");
const timeWord = (t) => (t === "bmo" ? "☀ Before open" : t === "amc" ? "🌙 After close" : "Time not confirmed");
const isReported = (r) => r.epsActual != null;

// ── timing markers — BMO/AMC rendered as unmistakable labeled chips (blue = before open,
// purple = after close) plus a compact dot+glyph badge where a full label won't fit. TBC muted.
const TIMING = {
  bmo: { glyph: "☀", word: "Before open", fg: "#93c5fd", bg: "rgba(59,130,246,0.15)", bd: "rgba(59,130,246,0.4)", disc: "rgba(59,130,246,0.85)" },
  amc: { glyph: "🌙", word: "After close", fg: "#c4b5fd", bg: "rgba(168,130,255,0.15)", bd: "rgba(168,130,255,0.4)", disc: "rgba(124,92,255,0.85)" },
  tbc: { glyph: "", word: "Time TBC", fg: "rgba(255,255,255,0.5)", bg: "rgba(255,255,255,0.05)", bd: "rgba(255,255,255,0.12)", disc: "rgba(255,255,255,0.2)" },
};
// labeled pill — "☀ BEFORE OPEN" / "🌙 AFTER CLOSE" / muted "TIME TBC" (parent CSS uppercases).
function TimingChip({ time }) {
  const m = TIMING[time] || TIMING.tbc;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 980, background: m.bg, border: `1px solid ${m.bd}`, color: m.fg, fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.05em", whiteSpace: "nowrap", lineHeight: 1.5 }}>
      {m.glyph && <span style={{ fontSize: "0.9rem", lineHeight: 1 }}>{m.glyph}</span>}
      <span>{time === "tbc" ? "Time TBC" : m.word}</span>
    </span>
  );
}

const howLines = [
  ["On your radar", "the leaders you already track (gold), laid out day by day, with the day's biggest other reporters filling in quietly — a fast scan for who reports soon."],
  ["Surprise radar", "the last week's biggest beats and misses and how the stock actually reacted — big surprise + strong reaction is where fresh momentum is born."],
  ["☀ Before Open / 🌙 After Close", "when a report is expected. Anything without a published time sits in the small \"Time TBC\" block."],
  ["Beat / miss", "for days already reported, the chip shows the actual EPS vs estimate — ✓ a beat (green) or ✗ a miss (red)."],
  ["The earnings window", "a stock reporting within about 5 days is inside its earnings window — a fresh breakout entry there has no cushion before a report that can gap the stock either way. Awareness, not a rule."],
];

// split a day entry's rows into timing stacks; order = leaders first, then market-cap rank.
function buildDay(entry, filter) {
  let rows = entry?.rows || [];
  if (filter === "leaders") rows = rows.filter((r) => isLeader(r.t));
  const totalCount = entry?.totalCount || (entry?.rows ? entry.rows.length : 0);
  const stacks = { bmo: [], amc: [], tbc: [] };
  for (const r of rows) (stacks[r.time] || stacks.tbc).push(r);
  for (const k of Object.keys(stacks)) {
    stacks[k].sort((a, b) => (isLeader(b.t) ? 1 : 0) - (isLeader(a.t) ? 1 : 0) || (a.rank ?? 1e9) - (b.rank ?? 1e9));
  }
  return { rows, stacks, shown: rows.length, totalCount };
}

// build the radar model: per trading day, ALL liquid leaders (never dropped) + a top-up of the
// largest-market-cap NON-leader reporters to reach `fillTo` chips/day. Leaders sort first (by cap
// rank); fillers follow (by market cap desc). Each row keeps its own fields so the strip can paint
// leaders as gold chips, fillers as quiet neutral chips, and past-day rows in their reported state.
// Pure + module-scope so the full page AND the dashboard mini share ONE derivation.
function buildRadar(daysMap, days, fillTo = 5) {
  return days.map((d) => {
    const all = daysMap[d]?.rows || [];
    const leaders = all.filter((r) => isLeader(r.t)).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
    const need = Math.max(0, fillTo - leaders.length);
    const fillers = need
      ? all.filter((r) => !isLeader(r.t)).sort((a, b) => (b.mcap ?? -1) - (a.mcap ?? -1)).slice(0, need)
      : [];
    return { d, rows: [...leaders, ...fillers] };
  });
}

// ── RADAR STRIP — the "on your radar" leaders-by-day earnings timeline. ONE self-contained
// implementation (owns its own scoped CSS, so it renders identically inside the full page and
// inside the dashboard mini card without depending on the page's .earn stylesheet).
//
// Layout: each DAY is a full-flex column (flex:1 → the strip fills the whole card width, no dead
// space on the right; min-width keeps it readable and triggers horizontal scroll when too many
// days), separated by a shallow dotted divider (none on the last). Inside a day, TWO sub-columns —
// ☀ Morning (BMO, blue) | 🌙 Night (AMC, purple) — chips stacked under each. Liquid leaders paint
// gold; the day's biggest other reporters fill in as quiet neutral chips (never a star).
//
// FUTURE days: unknown-timing rows drop into a slim "— TBC" mini-stack with a "?" (time not yet
// confirmed). PAST days: the nasdaq schema supplies no time, so those rows are already REPORTED —
// they render in a single muted "Reported" stack (NO "?" markers) and each chip shows its actual
// EPS (colored green/red vs estimate), falling back to the estimate. Past columns are dimmed.
//
// `autoScrollToday` (mini): on mount, scroll the strip so TODAY's column (or the next trading day
// if today isn't one) sits at the LEFT edge — the mini spans prior + this + next week, so it opens
// looking forward while still letting you scroll back into last week.
// `interactive`: chips open the detail popup; the mini passes interactive={false} so chips are
// pointer-events:none and the whole card stays the single click target.
function RadarStrip({ radar, today, onChipClick, interactive = true, C, autoScrollToday = false }) {
  const scrollRef = useRef(null);
  const anchorRef = useRef(null);
  // anchor = today's column, else the first future day in range (handles weekends/holidays).
  const anchorIdx = radar.findIndex(({ d }) => d >= today);
  useEffect(() => {
    if (!autoScrollToday || !scrollRef.current || !anchorRef.current) return;
    // rect-based (not offsetLeft) so a positioned card ancestor can't skew the offset; instant/auto.
    const c = scrollRef.current, a = anchorRef.current;
    c.scrollLeft += a.getBoundingClientRect().left - c.getBoundingClientRect().left;
  }, [autoScrollToday]);

  // showQ = render the "?" (only ever true on FUTURE days for unknown-timing rows).
  // past = the day is already behind us → chip shows its reported EPS (actual, else estimate).
  const chip = (r, d, showQ, past) => {
    const leader = isLeader(r.t);
    const reported = past && r.epsActual != null;
    const valTxt = reported ? eps(r.epsActual) : (past ? eps(r.epsEst) : null);
    return (
      <div key={r.t} className={"radar-chip" + (leader ? "" : " nlr") + (interactive ? "" : " ni")}
        onClick={interactive && onChipClick ? () => onChipClick(r, d) : undefined}
        title={reported ? `${r.t} — reported ${valTxt}` : `${r.t} — ${timeWord(r.time)}`}>
        <span className="tk">{r.t}</span>
        {past && valTxt && <span className="ra" style={{ color: reported ? beatCol(r) : "rgba(255,255,255,0.45)" }}>{valTxt}</span>}
        {showQ && <span className="q" title="time not confirmed">?</span>}
      </div>
    );
  };
  const subCol = (time, list, d, past) => {
    const m = TIMING[time];
    return (
      <div className="radar-sub">
        <div className="sub-h" style={{ background: m.bg, border: `1px solid ${m.bd}`, color: m.fg }}>{m.glyph} {time === "bmo" ? "Morning" : "Night"}</div>
        {list.length ? list.map((r) => chip(r, d, false, past)) : <div className="radar-dim">·</div>}
      </div>
    );
  };

  return (
    <div className="radarstrip">
      <style>{`
        .radarstrip .hscroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
        .radarstrip .hscroll::-webkit-scrollbar{height:6px}
        .radarstrip .hscroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:3px}
        .radarstrip .radar{display:flex;gap:8px;width:100%;padding-bottom:4px;align-items:stretch}
        .radarstrip .radar-day{flex:1 1 0;min-width:150px;display:flex;flex-direction:column;padding-right:8px;border-right:1px dotted rgba(255,255,255,0.10)}
        .radarstrip .radar-day.last{border-right:none;padding-right:0}
        .radarstrip .radar-day.past{opacity:0.5}
        .radarstrip .radar-hd{font-size:0.72rem;font-weight:800;letter-spacing:0.005em;color:${C.white};text-align:center;padding:0 2px 7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:8px}
        .radarstrip .radar-hd.today{color:${C.goldBright}}
        .radarstrip .radar-cols{display:flex;gap:6px}
        .radarstrip .radar-sub{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:5px}
        .radarstrip .sub-h{display:flex;align-items:center;gap:4px;font-size:0.54rem;font-weight:800;letter-spacing:0.03em;text-transform:uppercase;padding:2px 6px;border-radius:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .radarstrip .radar-chip{display:flex;align-items:center;gap:3px;background:rgba(201,152,42,0.10);border:1px solid ${C.borderGold};border-radius:7px;padding:4px 7px;cursor:pointer;overflow:hidden}
        .radarstrip .radar-chip .tk{font-size:0.82rem;font-weight:800;color:${C.white};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .radarstrip .radar-chip .q{flex:none;font-size:0.62rem;font-weight:800;color:${C.muted}}
        .radarstrip .radar-chip .ra{flex:none;font-size:0.6rem;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
        .radarstrip .radar-chip.nlr{background:rgba(255,255,255,0.05);border-color:${C.border}}
        .radarstrip .radar-chip.ni{cursor:inherit;pointer-events:none}
        .radarstrip .radar-reported{display:flex;flex-direction:column;gap:5px}
        .radarstrip .radar-reported .rep-h{font-size:0.5rem;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:${C.muted};text-align:center;margin-bottom:2px}
        .radarstrip .radar-dim{color:rgba(255,255,255,0.22);font-size:0.85rem;text-align:center;padding:3px 0}
        .radarstrip .radar-tbc{margin-top:8px;padding-top:7px;border-top:1px solid rgba(255,255,255,0.06)}
        .radarstrip .radar-tbc .tbc-h{font-size:0.5rem;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:${C.muted};margin-bottom:5px;text-align:center}
        .radarstrip .radar-tbc-chips{display:flex;flex-wrap:wrap;gap:5px;justify-content:center}
        @media (max-width:760px){
          .radarstrip .radar{width:max-content}
          .radarstrip .radar-day{flex:0 0 150px;width:150px}
        }
      `}</style>
      <div className="hscroll" ref={scrollRef}><div className="radar">
        {radar.map(({ d, rows }, i) => {
          const bmo = rows.filter((r) => r.time === "bmo");
          const amc = rows.filter((r) => r.time === "amc");
          const unknown = rows.filter((r) => r.time !== "bmo" && r.time !== "amc");
          const past = d < today;
          const isLast = i === radar.length - 1;
          return (
            <div key={d} ref={i === anchorIdx ? anchorRef : undefined} className={"radar-day" + (past ? " past" : "") + (isLast ? " last" : "")}>
              <div className={"radar-hd" + (d === today ? " today" : "")}>{ordDay(d)}</div>
              {past ? (
                rows.length === 0 ? (
                  <div className="radar-dim">·</div>
                ) : (
                  <>
                    {(bmo.length > 0 || amc.length > 0) && (
                      <div className="radar-cols">
                        {bmo.length > 0 && subCol("bmo", bmo, d, true)}
                        {amc.length > 0 && subCol("amc", amc, d, true)}
                      </div>
                    )}
                    {unknown.length > 0 && (
                      <div className="radar-reported">
                        <div className="rep-h">Reported</div>
                        {unknown.map((r) => chip(r, d, false, true))}
                      </div>
                    )}
                  </>
                )
              ) : (
                <>
                  <div className="radar-cols">
                    {subCol("bmo", bmo, d, false)}
                    {subCol("amc", amc, d, false)}
                  </div>
                  {unknown.length > 0 && (
                    <div className="radar-tbc">
                      <div className="tbc-h">— TBC</div>
                      <div className="radar-tbc-chips">{unknown.map((r) => chip(r, d, true, false))}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div></div>
    </div>
  );
}

// ── module-scope components ───────────────────────────────────────────────────

// beat/miss chip from a reported row.
function SurpriseChip({ r, big }) {
  const fs = big ? "0.66rem" : "0.58rem";
  if (r.epsActual == null || r.surprisePct == null) {
    return <span style={{ fontSize: fs, fontWeight: 800, color: "rgba(255,255,255,0.45)" }}>—</span>;
  }
  const p = r.surprisePct, beat = p >= 0;
  const fg = p > 0 ? "#7ef0a0" : p < 0 ? "#fca5a5" : "rgba(255,255,255,0.6)";
  const bg = p > 0 ? "rgba(34,197,94,0.12)" : p < 0 ? "rgba(239,68,68,0.10)" : "rgba(255,255,255,0.05)";
  const bd = p > 0 ? "rgba(34,197,94,0.35)" : p < 0 ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.12)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: fs, fontWeight: 800, padding: "1px 7px", borderRadius: 980, background: bg, border: `1px solid ${bd}`, color: fg, whiteSpace: "nowrap" }}>
      {p === 0 ? "0%" : `${beat ? "✓" : "✗"} ${sgnPct(p, 1)}`}
    </span>
  );
}

// one ticker chip. `large` (top-3 by cap) → bigger; `leader` → gold + ★. `reported` → beat/miss + reaction.
function TickerChip({ r, large, leader, reported, C, onClick }) {
  const revA = abbrev(r.revEst);
  const epsA = eps(r.epsEst);
  const actA = eps(r.epsActual);
  const estVal = revA || epsA;
  return (
    <div className={"ec-chip" + (large ? " lg" : "") + (leader ? " ldr" : "")} onClick={() => onClick && onClick(r)} title="View details">
      <div className="ec-chip-top">
        <span className="ec-tk">{r.t}{leader && <span className="ec-star" title="One of the liquid leaders"> ★</span>}</span>
        {reported ? <SurpriseChip r={r} big={large} /> : (estVal && <span className="ec-val">{estVal}</span>)}
      </div>
      {r.name && <div className="ec-name">{r.name}</div>}
      {reported && (r.rx || actA) && (
        <div className="ec-rx">
          {actA && <span><span style={{ color: "rgba(255,255,255,0.5)" }}>A </span><span style={{ color: beatCol(r), fontWeight: 800 }}>{actA}</span></span>}
          {r.rx && r.rx.totalPct != null && <span style={{ color: pctCol(r.rx.totalPct), fontWeight: 700 }}>Tot {sgnPct(r.rx.totalPct)}</span>}
        </div>
      )}
    </div>
  );
}

// uppercase gold lev-ETF chips (mirrors the rotation tab's levCell).
function LevChips({ arr, C }) {
  if (!arr || !arr.length) return <span style={{ color: C.muted, fontSize: "0.72rem" }}>—</span>;
  return (
    <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
      {arr.map((e) => (
        <span key={e} style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.66rem", fontWeight: 800, color: C.goldBright, letterSpacing: "0.03em", background: "rgba(201,152,42,0.10)", border: "1px solid rgba(201,152,42,0.3)", borderRadius: 6, padding: "2px 7px" }}>{e.toUpperCase()}</span>
      ))}
    </span>
  );
}

// detail popup — lifecycle-aware, glass, portal to body, z 1320, backdrop-click close.
function EarningsDetailPopup({ target, C, font, onClose }) {
  if (!target) return null;
  const { r, day } = target;
  const leader = isLeader(r.t);
  const ll = LL_BY_T[r.t];
  const reported = isReported(r);
  const revA = abbrev(r.revEst), mcapA = abbrev(r.mcap), epsA = eps(r.epsEst), actA = eps(r.epsActual), yaA = eps(r.yearAgoEps);
  const diff = dayDiff(day, todayISO());
  const windowLine =
    diff === 0 ? "Reports today — inside the ~5-day earnings window, a fresh breakout has no cushion before a report that can gap the stock."
    : diff > 0 ? `Reports in ${diff} ${diff === 1 ? "day" : "days"}` + (diff <= 5 ? " — inside the ~5-day earnings window, a fresh breakout has no cushion before a report that can gap the stock." : ". Outside the ~5-day earnings window for now.")
    : `Reported ${Math.abs(diff)} ${Math.abs(diff) === 1 ? "day" : "days"} ago.`;

  const label = { fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.11em", textTransform: "uppercase", color: C.gold };
  const statBox = { padding: "9px 11px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}` };
  const statVal = { fontSize: "0.86rem", fontWeight: 800, color: C.white, fontVariantNumeric: "tabular-nums", marginTop: 3 };
  const rxBox = (lbl, v) => (
    <div style={{ flex: 1, textAlign: "center", padding: "7px 6px", borderRadius: 9, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: "0.5rem", fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: C.muted }}>{lbl}</div>
      <div style={{ fontSize: "0.82rem", fontWeight: 800, marginTop: 2, color: pctCol(v), fontVariantNumeric: "tabular-nums" }}>{sgnPct(v)}</div>
    </div>
  );

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1320, background: "rgba(4,4,8,0.6)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", overflowY: "auto", padding: "40px 16px", fontFamily: font }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, margin: "0 auto", background: "rgba(255,255,255,0.042)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, backdropFilter: "blur(24px) saturate(150%)", WebkitBackdropFilter: "blur(24px) saturate(150%)", boxShadow: "0 24px 70px rgba(0,0,0,0.6)", overflow: "hidden" }}>
        {/* header */}
        <div style={{ padding: "16px 18px 14px", borderBottom: `1px solid ${C.border}`, background: "linear-gradient(135deg,rgba(255,255,255,0.05),transparent 60%)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9, minWidth: 0 }}>
              <span style={{ fontSize: "1.15rem", fontWeight: 800, color: C.white, letterSpacing: "-0.01em" }}>{r.t}</span>
              {leader && <span title="One of the liquid leaders" style={{ fontSize: "0.62rem", fontWeight: 800, color: "#08080e", background: `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})`, borderRadius: 980, padding: "2px 8px" }}>★ Liquid leader</span>}
            </div>
            <button onClick={onClose} title="Close" style={{ flex: "none", width: 26, height: 26, borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.03)", color: C.muted, fontSize: "0.9rem", cursor: "pointer", lineHeight: 1, fontFamily: font }}>×</button>
          </div>
          {r.name && <div style={{ marginTop: 4, fontSize: "0.76rem", fontWeight: 600, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>}
        </div>
        {/* body */}
        <div style={{ padding: "16px 18px 18px", display: "grid", gap: 14 }}>
          {/* scheduled / reported line */}
          <div>
            <div style={label}>{reported ? "Reported" : "Scheduled report"}</div>
            <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.86rem", fontWeight: 700, color: C.white }}>{longDay(day)}</span>
              <TimingChip time={r.time} />
            </div>
            <div style={{ marginTop: 5, fontSize: "0.66rem", lineHeight: 1.5, color: "rgba(255,255,255,0.45)" }}>Scheduled — dates can shift until the company confirms.</div>
          </div>

          {/* PRE-REPORT stats */}
          {!reported && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div style={statBox}><div style={label}>EPS est</div><div style={statVal}>{epsA || "—"}</div></div>
                <div style={statBox}><div style={label}>Year-ago EPS</div><div style={statVal}>{yaA || "—"}</div></div>
                <div style={statBox}><div style={label}>Market cap</div><div style={statVal}>{mcapA || "—"}</div></div>
                <div style={{ ...statBox, gridColumn: "1 / -1" }}>
                  <div style={label}>Revenue est</div>
                  <div style={{ ...statVal, fontSize: revA ? "0.86rem" : "0.68rem", fontWeight: revA ? 800 : 500, color: revA ? C.white : C.muted, lineHeight: 1.45 }}>{revA || "— not published by the current data source; fills on the live site."}</div>
                </div>
              </div>
              {r.noEsts != null && <div style={{ fontSize: "0.64rem", color: "rgba(255,255,255,0.45)" }}>Consensus drawn from {r.noEsts} analyst estimate{r.noEsts === 1 ? "" : "s"}.</div>}
            </>
          )}

          {/* POST-REPORT stats */}
          {reported && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <div style={statBox}><div style={label}>EPS est</div><div style={statVal}>{epsA || "—"}</div></div>
                {(() => { const bc = beatCol(r); const beat = bc === GREEN, miss = bc === RED; return (
                  <div style={{ ...statBox, border: `1px solid ${beat ? "rgba(34,197,94,0.35)" : miss ? "rgba(239,68,68,0.3)" : C.border}`, background: beat ? "rgba(34,197,94,0.07)" : miss ? "rgba(239,68,68,0.06)" : statBox.background }}>
                    <div style={label}>Actual EPS</div><div style={{ ...statVal, color: bc === NEUTRAL ? C.white : bc }}>{actA || "—"}</div>
                  </div>
                ); })()}
                <div style={statBox}><div style={label}>Surprise</div><div style={{ ...statVal, color: pctCol(r.surprisePct) }}>{sgnPct(r.surprisePct)}</div></div>
              </div>
              {r.rx && (
                <div>
                  <div style={{ ...label, marginBottom: 6 }}>Price reaction</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {rxBox("Gap", r.rx.gapPct)}{rxBox("Session", r.rx.dayPct)}{rxBox("Total", r.rx.totalPct)}
                  </div>
                </div>
              )}
              <div style={{ padding: "10px 13px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: "0.7rem", lineHeight: 1.55, color: C.muted, fontWeight: 500 }}>After a report, moves tend to resolve one of three ways: an immediate breakout, a quiet range that breaks later, or a reversal when the surprise was already priced in.</div>
              </div>
            </>
          )}

          {/* earnings window (pre-report only, forward-looking) */}
          {!reported && (
            <div style={{ padding: "10px 13px", borderRadius: 10, background: diff >= 0 && diff <= 5 ? "rgba(201,152,42,0.09)" : "rgba(255,255,255,0.03)", border: `1px solid ${diff >= 0 && diff <= 5 ? C.borderGold : C.border}` }}>
              <div style={{ fontSize: "0.72rem", lineHeight: 1.55, color: diff >= 0 && diff <= 5 ? C.goldBright : C.muted, fontWeight: 500 }}>{windowLine}</div>
            </div>
          )}

          {/* leader lev-ETFs */}
          {leader && (
            <div style={{ display: "grid", gap: 9 }}>
              <div><div style={label}>Long ETF</div><div style={{ marginTop: 6 }}><LevChips arr={ll?.long} C={C} /></div></div>
              <div><div style={label}>Short / inverse ETF</div><div style={{ marginTop: 6 }}><LevChips arr={ll?.short} C={C} /></div></div>
              <div style={{ fontSize: "0.62rem", lineHeight: 1.5, color: "rgba(255,255,255,0.4)" }}>Leveraged/inverse funds — liquidity varies, always check the fund before using it. Educational, not advice.</div>
            </div>
          )}
        </div>
      </div>
    </div>, document.body);
}

// v2 WEEK GRID — kept intact as a subcomponent for the "Week grid" toggle.
function WeekGridView({ daysMap, filter, C, today, curWeek, onChipClick }) {
  const weeks = useMemo(() => {
    const starts = new Set(Object.keys(daysMap).map(weekStart));
    starts.add(curWeek); starts.add(addISO(curWeek, 7));
    const weekStarts = [...starts].filter((w) => w >= curWeek).sort(); // leading-empty-week trim
    return weekStarts.map((ws) => {
      const cols = []; let weekRowCount = 0;
      for (let i = 0; i < 5; i++) {
        const d = addISO(ws, i);
        const dd = buildDay(daysMap[d], filter);
        weekRowCount += dd.shown;
        cols.push({ d, weekday: WD[D(d).getUTCDay()], isToday: d === today, ...dd });
      }
      return { ws, label: `Week of ${monDay(ws)}`, cols, weekRowCount };
    });
  }, [daysMap, filter, curWeek, today]);

  const cardLabel = { fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: C.gold };
  return (
    <>
      {weeks.map((w) => (
        <section key={w.ws} className="earn-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={cardLabel}>{w.label}</span>
            <span style={{ fontSize: "0.62rem", fontWeight: 700, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{w.weekRowCount} {w.weekRowCount === 1 ? "report" : "reports"}</span>
          </div>
          {w.weekRowCount === 0 ? (
            <div className="ec-empty" style={{ fontSize: "0.74rem", padding: "18px 10px" }}>No scheduled reports this week in the current data.</div>
          ) : (
            <div className="ec-gridwrap"><div className="ec-grid">
              {w.cols.map((col) => (
                <div key={col.d} className={"ec-col" + (col.isToday ? " today" : "")}>
                  <div className="ec-colhead"><span className="ec-wd">{col.weekday}</span><span className="ec-dt">{monDay(col.d)}</span>{col.isToday && <span className="ec-todaytag">TODAY</span>}</div>
                  <div className="ec-colbody">
                    {col.shown === 0 ? <div className="ec-empty">—</div> : STACKS.map((s) => {
                      const list = col.stacks[s.key] || [];
                      if (!list.length) return null;
                      return (
                        <div key={s.key} className="ec-stack">
                          <div className="ec-stack-label"><TimingChip time={s.key} /><span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>· {list.length}</span></div>
                          <div className="ec-chips">{list.map((r, i) => <TickerChip key={r.t} r={r} large={i < 3} leader={isLeader(r.t)} reported={col.d < today && isReported(r)} C={C} onClick={() => onChipClick(r, col.d)} />)}</div>
                        </div>
                      );
                    })}
                  </div>
                  {col.totalCount > col.shown && filter !== "leaders" && <div className="ec-colfoot">top {col.shown} of {col.totalCount} by market cap</div>}
                </div>
              ))}
            </div></div>
          )}
        </section>
      ))}
    </>
  );
}

export default function EarningsCalendar({ C, font, session }) {
  const isAdmin = (session?.user?.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("compact");
  const [howOpen, setHowOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [popup, setPopup] = useState(null);
  const rootRef = useRef(null);

  // Base = committed snapshot. On the live domain ONLY, try /api/earnings and MERGE (keep snapshot rx).
  const [live, setLive] = useState(null);
  useEffect(() => {
    if (typeof window === "undefined" || window.location.hostname !== "valensontrades.com") return;
    let cancelled = false;
    fetch("/api/earnings").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (cancelled || !j || !j.ok || !j.days || !Object.keys(j.days).length) return;
      // keep snapshot rx where the api row lacks it (candles aren't computed server-side)
      const snap = EARNINGS?.days || {};
      for (const d of Object.keys(j.days)) {
        const snapRows = Object.fromEntries((snap[d]?.rows || []).map((x) => [x.t, x]));
        for (const row of j.days[d].rows || []) { if (row.rx == null && snapRows[row.t]?.rx) row.rx = snapRows[row.t].rx; }
        if (snap[d]?.reactionsComputedFor != null && j.days[d].reactionsComputedFor == null) j.days[d].reactionsComputedFor = snap[d].reactionsComputedFor;
      }
      setLive(j);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const base = live || EARNINGS || {};
  const asof = base.asof || "—", refreshed = base.refreshed || "—", source = base.source || "—";
  const daysMap = base.days || {}, note = base.note || null;
  const stamp = `updated ${refreshed} · covers through ${asof}`;

  const today = todayISO();
  const curWeek = weekStart(today);
  const tradingDays = useMemo(() => Object.keys(daysMap).sort(), [daysMap]);

  // radar = per-day leader-only chips (always leaders, ignores the All/leaders filter). Full page
  // keeps past+forward days; the mini reuses buildRadar with forward-only days.
  const radar = useMemo(() => buildRadar(daysMap, tradingDays), [tradingDays, daysMap]);
  // count TRUE leaders only (radar rows now also carry non-leader fill-ins); drives the "in range"
  // label + the ★ filter-chip count. radarHasRows = does the strip have anything to draw at all.
  const radarLeaderTotal = useMemo(() => tradingDays.reduce((s, d) => s + (daysMap[d]?.rows || []).filter((r) => isLeader(r.t)).length, 0), [tradingDays, daysMap]);
  const radarHasRows = useMemo(() => radar.some((x) => x.rows.length > 0), [radar]);

  // SURPRISE RADAR — past-7 reporters with rx or surprise, ranked by |surprise| desc (leaders pin on ties).
  const surpriseRows = useMemo(() => {
    const out = [];
    for (const d of tradingDays) {
      if (d >= today) continue;
      for (const r of (daysMap[d]?.rows || [])) {
        if (r.rx || r.surprisePct != null) out.push({ ...r, day: d });
      }
    }
    out.sort((a, b) => {
      const sa = Math.abs(a.surprisePct ?? -1), sb = Math.abs(b.surprisePct ?? -1);
      if (sb !== sa) return sb - sa;
      return (isLeader(b.t) ? 1 : 0) - (isLeader(a.t) ? 1 : 0);
    });
    return out.slice(0, 15);
  }, [tradingDays, daysMap, today]);
  const reactionsTotal = useMemo(() => tradingDays.reduce((s, d) => s + (daysMap[d]?.reactionsComputedFor || 0), 0), [tradingDays, daysMap]);

  // day-navigator meta (respects the filter).
  const navDays = useMemo(() => tradingDays.map((d) => {
    const dd = buildDay(daysMap[d], filter);
    const leaders = (daysMap[d]?.rows || []).filter((r) => isLeader(r.t)).length;
    return { d, shown: dd.shown, leaders, past: d < today };
  }), [tradingDays, daysMap, filter, today]);
  const firstFutureIdx = useMemo(() => navDays.findIndex((n) => !n.past), [navDays]);

  // DEFAULT selected day = today if a trading day with data, else the next day with data.
  const defaultDay = useMemo(() => {
    if (daysMap[today] && (daysMap[today].rows || []).length) return today;
    const future = tradingDays.filter((d) => d >= today);
    return future[0] || tradingDays[0] || null;
  }, [tradingDays, daysMap, today]);
  const [selDay, setSelDay] = useState(defaultDay);
  useEffect(() => { if (!selDay && defaultDay) setSelDay(defaultDay); }, [defaultDay, selDay]);
  const activeDay = selDay && daysMap[selDay] ? selDay : defaultDay;
  const panel = activeDay ? buildDay(daysMap[activeDay], filter) : null;
  const panelReported = activeDay && activeDay < today;

  const totalRows = useMemo(() => Object.values(daysMap).reduce((s, d) => s + (d.rows || []).length, 0), [daysMap]);
  const filterChips = [["all", `All (${totalRows})`], ["leaders", `★ Liquid leaders only (${radarLeaderTotal})`]];

  // ── style primitives ──
  const cardLabel = { fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: C.gold };
  const asofStyle = { fontSize: "0.62rem", fontWeight: 700, color: C.goldBright, fontVariantNumeric: "tabular-nums", textAlign: "right" };
  const chipStyle = (active) => ({
    display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
    fontSize: "0.72rem", fontWeight: 700, padding: "7px 15px", borderRadius: 99, cursor: "pointer", fontFamily: font, transition: "all .14s",
    border: `1px solid ${active ? C.goldBright : C.border}`, color: active ? "#08080e" : C.muted,
    background: active ? `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})` : "rgba(255,255,255,0.03)",
  });
  const openChip = (r, d) => setPopup({ r, day: d });

  return (
    <div ref={rootRef} className="earn" style={{ fontFamily: font, maxWidth: 1180, margin: "0 auto", color: C.text }}>
      <style>{`
        .earn .earn-card{position:relative;background:rgba(255,255,255,0.042);border:1px solid rgba(255,255,255,0.09);border-radius:16px;backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);padding:16px 18px;margin-bottom:12px}
        .earn .earn-card::before{content:'';position:absolute;inset:0;pointer-events:none;border-radius:inherit;background:linear-gradient(135deg,rgba(255,255,255,0.05),transparent 55%)}
        .earn .hscroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
        .earn .hscroll::-webkit-scrollbar{height:6px}
        .earn .hscroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:3px}
        /* the "on your radar" strip is a self-contained module with its own scoped CSS */
        /* surprise radar */
        .earn .sr-rows{display:flex;flex-direction:column;gap:5px;width:max-content;min-width:100%}
        .earn .sr-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:9px;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.06);cursor:pointer}
        .earn .sr-row:hover{background:rgba(255,255,255,0.05)}
        .earn .sr-day{flex:0 0 52px;font-size:0.58rem;font-weight:800;color:${C.muted};white-space:nowrap}
        .earn .sr-tk{flex:0 0 64px;font-size:0.74rem;font-weight:800;color:${C.white};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .earn .sr-ea{flex:0 0 108px;font-size:0.62rem;font-weight:700;color:${C.muted};white-space:nowrap;font-variant-numeric:tabular-nums}
        .earn .sr-sp{flex:0 0 74px}
        .earn .sr-pct{flex:0 0 56px;text-align:right;font-size:0.66rem;font-weight:800;font-variant-numeric:tabular-nums}
        .earn .sr-h{font-size:0.5rem;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.4)}
        /* surprise radar + day navigator side by side; collapse to one column on narrow screens */
        .earn .earn-duo{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start;margin-bottom:12px}
        .earn .earn-duo>.earn-card{margin-bottom:0}
        @media (max-width:1100px){.earn .earn-duo{grid-template-columns:1fr}}
        /* compressed surprise table inside the half-width duo column (hscroll handles overflow) */
        .earn .sr-card .sr-row{padding:5px 6px;gap:6px}
        .earn .sr-card .sr-day{flex-basis:44px}
        .earn .sr-card .sr-tk{flex-basis:52px;font-size:0.68rem}
        .earn .sr-card .sr-ea{flex-basis:86px;font-size:0.56rem}
        .earn .sr-card .sr-sp{flex-basis:60px}
        .earn .sr-card .sr-pct{flex-basis:46px;font-size:0.6rem}
        /* day pills */
        .earn .pills{display:flex;gap:7px;width:max-content;padding-bottom:4px;align-items:stretch}
        .earn .pill{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:1px;padding:6px 12px;border-radius:12px;cursor:pointer;font-family:inherit;border:1px solid ${C.border};background:rgba(255,255,255,0.03);transition:all .14s}
        .earn .pill.past{opacity:0.6}
        .earn .pill .p-wd{font-size:0.68rem;font-weight:800;color:${C.white};white-space:nowrap}
        .earn .pill .p-meta{font-size:0.54rem;font-weight:700;color:${C.muted};white-space:nowrap}
        .earn .pill.on{border-color:${C.goldBright};background:linear-gradient(135deg,${C.goldBright},${C.goldMid});opacity:1}
        .earn .pill.on .p-wd,.earn .pill.on .p-meta{color:#08080e}
        .earn .pill-div{flex:0 0 auto;width:1px;align-self:stretch;background:rgba(255,255,255,0.14);margin:2px 3px}
        /* day panel */
        .earn .paneln{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .earn .pcol{border-radius:12px;background:rgba(255,255,255,0.018);border:1px solid rgba(255,255,255,0.06);overflow:hidden}
        .earn .pcolhd{padding:9px 12px;border-bottom:1px solid rgba(255,255,255,0.06);font-size:0.6rem;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;display:flex;align-items:center;gap:6px}
        .earn .pcolbody{padding:9px;display:flex;flex-direction:column;gap:5px}
        .earn .pcolfoot{padding:6px 12px;border-top:1px solid rgba(255,255,255,0.05);font-size:0.54rem;font-weight:700;color:rgba(255,255,255,0.4);font-variant-numeric:tabular-nums}
        .earn .tbc-block{margin-top:10px}
        /* chip */
        .earn .ec-chip{padding:5px 9px;border-radius:9px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);cursor:pointer;transition:background .12s,border-color .12s}
        .earn .ec-chip:hover{background:rgba(255,255,255,0.075)}
        .earn .ec-chip.lg{padding:7px 10px;background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.16)}
        .earn .ec-chip.ldr{border-color:${C.borderGold};background:rgba(201,152,42,0.09)}
        .earn .ec-chip.lg.ldr{border-color:${C.goldBright}}
        .earn .ec-chip-top{display:flex;align-items:baseline;justify-content:space-between;gap:6px}
        .earn .ec-tk{font-size:0.74rem;font-weight:800;color:${C.white};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .earn .ec-chip.lg .ec-tk{font-size:0.88rem}
        .earn .ec-star{color:${C.goldBright};font-size:0.62rem}
        .earn .ec-val{flex:none;font-size:0.58rem;font-weight:700;color:${C.muted};font-variant-numeric:tabular-nums}
        .earn .ec-name{margin-top:1px;font-size:0.56rem;font-weight:500;color:rgba(255,255,255,0.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .earn .ec-chip.lg .ec-name{font-size:0.6rem}
        .earn .ec-rx{margin-top:3px;display:flex;gap:7px;font-size:0.56rem;font-weight:600;font-variant-numeric:tabular-nums}
        /* week grid */
        .earn .ec-grid{position:relative;display:flex;gap:10px}
        .earn .ec-col{flex:1 1 0;min-width:0;display:flex;flex-direction:column;border-radius:12px;background:rgba(255,255,255,0.018);border:1px solid rgba(255,255,255,0.06);overflow:hidden}
        .earn .ec-col.today{border-left:3px solid ${C.gold};background:rgba(201,152,42,0.05)}
        .earn .ec-colhead{padding:9px 10px 8px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:baseline;gap:6px}
        .earn .ec-wd{font-size:0.74rem;font-weight:800;color:${C.white};letter-spacing:-0.01em}
        .earn .ec-dt{font-size:0.62rem;font-weight:700;color:${C.muted};font-variant-numeric:tabular-nums}
        .earn .ec-todaytag{margin-left:auto;font-size:0.5rem;font-weight:900;letter-spacing:0.06em;padding:2px 6px;border-radius:980px;background:linear-gradient(135deg,${C.goldBright},${C.goldMid});color:#08080e}
        .earn .ec-colbody{padding:8px;display:flex;flex-direction:column;gap:9px;flex:1}
        .earn .ec-stack-label{display:flex;align-items:center;gap:5px;font-size:0.52rem;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;margin-bottom:6px}
        .earn .ec-stack+.ec-stack{margin-top:2px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.05)}
        .earn .ec-chips{display:flex;flex-direction:column;gap:5px}
        .earn .ec-colfoot{padding:6px 10px;border-top:1px solid rgba(255,255,255,0.05);font-size:0.52rem;font-weight:700;color:rgba(255,255,255,0.4);font-variant-numeric:tabular-nums}
        .earn .ec-empty{padding:14px 10px;font-size:0.6rem;color:rgba(255,255,255,0.35);text-align:center}
        @media (max-width:760px){
          .earn .ec-gridwrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:0 -6px;padding:0 6px 6px}
          .earn .ec-grid{width:max-content}
          .earn .ec-col{flex:0 0 168px;width:168px}
          .earn .paneln{grid-template-columns:1fr}
        }
        @media (max-width:560px){.earn .earn-card{padding:13px 12px}}
      `}</style>

      {/* 1 — HEADER + FILTERS */}
      <section className="earn-card" style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...cardLabel, marginBottom: 5 }}>Earnings</div>
          <h1 style={{ margin: "0 0 5px", fontSize: "1.4rem", fontWeight: 800, letterSpacing: "-0.02em", color: C.white }}>Earnings calendar</h1>
          <p style={{ margin: 0, fontSize: "0.78rem", lineHeight: 1.55, color: C.muted, maxWidth: "70ch" }}>
            Who reports and when — and how last week's reports actually landed — so you know which of your names has a report that can gap the stock. Educational, not advice.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div style={asofStyle}>{stamp}</div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {filterChips.map(([k, label]) => <button key={k} onClick={() => setFilter(k)} style={chipStyle(filter === k)}>{label}</button>)}
          </div>
        </div>
      </section>

      {note && (
        <section className="earn-card" style={{ padding: "11px 15px", fontSize: "0.72rem", lineHeight: 1.55, color: C.muted }}>
          <b style={{ color: C.text }}>Note:</b> {note}
        </section>
      )}

      {/* 2 — ON YOUR RADAR */}
      <section className="earn-card">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
          <span style={cardLabel}>On your radar</span>
          <span style={{ fontSize: "0.6rem", fontWeight: 700, color: C.muted }}>leaders in gold · the day's biggest others fill in</span>
          <span style={{ marginLeft: "auto", fontSize: "0.6rem", fontWeight: 700, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{radarLeaderTotal} leaders in range</span>
        </div>
        {!radarHasRows ? (
          <div className="ec-empty" style={{ fontSize: "0.74rem", padding: "14px 10px" }}>No reporters in this window.</div>
        ) : (
          <RadarStrip radar={radar} today={today} onChipClick={openChip} C={C} />
        )}
      </section>

      {/* 3+4 — SURPRISE RADAR + DAY NAVIGATOR share one 1fr/1fr row (collapses ≤1100px) */}
      <div className={surpriseRows.length > 0 ? "earn-duo" : undefined}>
      {/* 3 — SURPRISE RADAR */}
      {surpriseRows.length > 0 && (
        <section className="earn-card sr-card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11, flexWrap: "wrap" }}>
            <span style={cardLabel}>Reported — surprise radar</span>
            <InfoDot tip="The biggest earnings surprises of the last week and how the stock actually reacted — big surprise + strong reaction is where new momentum is born. Educational, not advice." />
            <span style={{ marginLeft: "auto", fontSize: "0.6rem", fontWeight: 700, color: C.muted }}>ranked by size of surprise</span>
          </div>
          <div className="hscroll">
            <div className="sr-rows">
              <div className="sr-row" style={{ cursor: "default", background: "transparent", border: "none", padding: "0 8px 2px" }}>
                <span className="sr-day sr-h">Day</span><span className="sr-tk sr-h">Ticker</span>
                <span className="sr-ea sr-h">Est → Actual</span><span className="sr-sp sr-h">Surprise</span>
                <span className="sr-pct sr-h" title="Open gap = first trade vs the prior close — the overnight reaction">Open gap</span><span className="sr-pct sr-h" title="Session = open to close on reaction day — did buyers or sellers win the day">Session</span><span className="sr-pct sr-h" title="Total move = close vs the prior close — the whole reaction">Total move</span>
              </div>
              {surpriseRows.map((r) => (
                <div key={r.day + r.t} className="sr-row" onClick={() => openChip(r, r.day)}>
                  <span className="sr-day">{wdNum(r.day)}</span>
                  <span className="sr-tk">{r.t}{isLeader(r.t) && <span style={{ color: C.goldBright, fontSize: "0.6rem" }}> ★</span>}</span>
                  <span className="sr-ea">{eps(r.epsEst) || "—"} → <span style={{ color: beatCol(r), fontWeight: 800 }}>{eps(r.epsActual) || "—"}</span></span>
                  <span className="sr-sp"><SurpriseChip r={r} /></span>
                  <span className="sr-pct" style={{ color: pctCol(r.rx?.gapPct) }}>{r.rx ? sgnPct(r.rx.gapPct) : "—"}</span>
                  <span className="sr-pct" style={{ color: pctCol(r.rx?.dayPct) }}>{r.rx ? sgnPct(r.rx.dayPct) : "—"}</span>
                  <span className="sr-pct" style={{ color: pctCol(r.rx?.totalPct) }}>{r.rx ? sgnPct(r.rx.totalPct) : "—"}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 9, fontSize: "0.6rem", lineHeight: 1.5, color: "rgba(255,255,255,0.4)" }}>
            Reactions computed for each day's largest reporters (top 25) + all liquid leaders ({reactionsTotal} in range) — smaller names show estimates only. Educational, not advice.
          </div>
        </section>
      )}

      {/* 4 — DAY NAVIGATOR + view toggle + one day panel / week grid */}
      <section className="earn-card">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11, flexWrap: "wrap" }}>
          <span style={cardLabel}>{view === "compact" ? "Day navigator" : "Week grid"}</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {[["compact", "Compact"], ["grid", "Week grid"]].map(([k, l]) => <button key={k} onClick={() => setView(k)} style={chipStyle(view === k)}>{l}</button>)}
          </div>
        </div>

        {view === "compact" ? (
          tradingDays.length === 0 ? (
            <div className="ec-empty" style={{ fontSize: "0.74rem", padding: "16px 10px" }}>No scheduled reports in the current data window.</div>
          ) : (
            <>
              <div className="hscroll" style={{ marginBottom: 12 }}>
                <div className="pills">
                  {navDays.map(({ d, shown, leaders, past }, i) => (
                    <React.Fragment key={d}>
                      {i === firstFutureIdx && firstFutureIdx > 0 && <span className="pill-div" />}
                      <button onClick={() => setSelDay(d)} className={"pill" + (past ? " past" : "") + (d === activeDay ? " on" : "")}>
                        <span className="p-wd">{wdNum(d)}{d === today ? " ·" : ""}</span>
                        <span className="p-meta">{shown} rpt{leaders ? ` · ★${leaders}` : ""}</span>
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {panel && (
                <>
                  <div className="paneln">
                    {[STACKS[0], STACKS[1]].map((s) => {
                      const list = panel.stacks[s.key] || [];
                      return (
                        <div key={s.key} className="pcol">
                          <div className="pcolhd"><TimingChip time={s.key} /><span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>· {list.length}</span></div>
                          <div className="pcolbody">
                            {list.length ? list.map((r, i) => <TickerChip key={r.t} r={r} large={i < 3} leader={isLeader(r.t)} reported={panelReported && isReported(r)} C={C} onClick={() => openChip(r, activeDay)} />) : <div className="ec-empty">— none</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {(panel.stacks.tbc || []).length > 0 && (
                    <div className="pcol tbc-block">
                      <div className="pcolhd"><TimingChip time="tbc" /><span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>· {panel.stacks.tbc.length}</span></div>
                      <div className="pcolbody" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))" }}>
                        {panel.stacks.tbc.map((r, i) => <TickerChip key={r.t} r={r} large={i < 3} leader={isLeader(r.t)} reported={panelReported && isReported(r)} C={C} onClick={() => openChip(r, activeDay)} />)}
                      </div>
                    </div>
                  )}
                  {panel.totalCount > panel.shown && filter !== "leaders" && (
                    <div className="pcolfoot" style={{ borderTop: "none", paddingLeft: 2 }}>Showing top {panel.shown} of {panel.totalCount} by market cap for {longDay(activeDay)}.</div>
                  )}
                  {panel.shown === 0 && <div className="ec-empty" style={{ fontSize: "0.74rem", padding: "14px 10px" }}>No reports match this filter on {longDay(activeDay)}.</div>}
                </>
              )}
            </>
          )
        ) : (
          <WeekGridView daysMap={daysMap} filter={filter} C={C} today={today} curWeek={curWeek} onChipClick={openChip} />
        )}
      </section>
      </div>

      {/* 5 — HOW TO READ THIS */}
      <section className="earn-card">
        <div onClick={() => setHowOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
          <span style={{ ...cardLabel, flex: 1 }}>How to read this</span>
          <span style={{ fontSize: "0.7rem", color: C.muted }}>{howOpen ? "▴" : "▾"}</span>
        </div>
        {howOpen && (
          <div style={{ marginTop: 12, display: "grid", gap: 7 }}>
            {howLines.map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: "0.76rem", lineHeight: 1.5 }}>
                <span style={{ color: C.goldBright, fontWeight: 800, flex: "none", minWidth: 156 }}>{k}</span>
                <span style={{ color: C.muted }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 6 — METHOD (admin only) */}
      {isAdmin && (
        <section className="earn-card">
          <div onClick={() => setMethodOpen((o) => !o)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
            <span style={{ ...cardLabel, flex: 1 }}>Method / source (admin)</span>
            <span style={{ fontSize: "0.7rem", color: C.muted }}>{methodOpen ? "▴" : "▾"}</span>
          </div>
          {methodOpen && (
            <div style={{ marginTop: 12, display: "grid", gap: 10, maxWidth: "92ch" }}>
              <p style={{ margin: 0, fontSize: "0.72rem", lineHeight: 1.7, color: C.muted }}>
                <b style={{ color: C.text }}>Source: {source}.</b> Snapshot base = <code style={{ color: C.text }}>src/earnings-data.js</code>; on the live domain only it merges a fresher <code style={{ color: C.text }}>/api/earnings</code> pull (keeping snapshot reactions). Nasdaq returns <b style={{ color: C.text }}>two schemas</b>: future dates carry the estimate + last-year EPS; past dates carry the <b style={{ color: C.text }}>actual EPS + % surprise</b>. Finnhub (if a key is set) adds a revenue estimate; otherwise revenue stays blank — never fabricated.
              </p>
              <p style={{ margin: 0, fontSize: "0.72rem", lineHeight: 1.7, color: C.muted }}>
                <b style={{ color: C.text }}>Reactions</b> are computed from daily candles for past-day reporters only, bounded to each day's top 25 by market cap ∪ all liquid leaders. Reaction day = the report day for a before-open report, else the next trading day. Gap = open vs prior close · Session = close vs open · Total = close vs prior close. Below cap / bars missing → shown as "—". Chip prominence scales by market cap; leaders pin gold. Refresh: <code style={{ color: C.text }}>node --env-file=.env.local scripts/earnings-fetch.mjs</code>. Educational, not advice.
              </p>
            </div>
          )}
        </section>
      )}

      <EarningsDetailPopup target={popup} C={C} font={font} onClose={() => setPopup(null)} />
    </div>
  );
}

// ── EARNINGS RADAR MINI — the dashboard "on your radar" strip as a glass card. Shows the
// forward days only (today onward) to stay tight; the whole card is one click target that opens
// the FULL <EarningsCalendar> in a blur popup (z 1250, portal, backdrop-click-only close), exactly
// like the Rotation/Breadth minis. Chips inside the strip are non-interactive (pointer-events:none)
// so a stray chip tap can't open BOTH the section popup and a detail popup. Inside the section
// popup, the full page's own detail popup is z 1320 (> 1250) so it correctly stacks above.
export function EarningsRadarMini({ C, font, session }) {
  const [open, setOpen] = useState(false);
  const cardRef = useRef(null);
  const base = EARNINGS || {};
  const asof = base.asof || "—", refreshed = base.refreshed || "—";
  const daysMap = base.days || {};
  const today = todayISO();
  const tradingDays = Object.keys(daysMap).sort();
  // Window = prior week + this week + next week (Mon of last week → Sun of next week). The strip
  // scrolls both directions; it auto-scrolls today to the left edge on mount. Days beyond this
  // window live only in the full view.
  const winStart = addISO(weekStart(today), -7);
  const winEnd = addISO(weekStart(today), 13);
  const winDays = tradingDays.filter((d) => d >= winStart && d <= winEnd);
  const radar = buildRadar(daysMap, winDays);
  const hasAny = radar.some((x) => x.rows.length);
  const stamp = `as of ${asof} · updated ${refreshed}`;
  return (
    <>
      <div ref={cardRef} className="card lensmini" onClick={() => setOpen(true)} style={{ fontFamily: font, cursor: "pointer" }}>
        <div className="cardhead">
          <span className="label">Earnings — On Your Radar</span>
          <InfoDot tip="Which names report soon, day by day — before the open or after the close. Your liquid leaders in gold; the day's biggest other reporters fill in quietly. Tap for the full calendar." />
          <LensCamera getEl={() => cardRef.current} name="earnings-radar" C={C} style={{ marginLeft: 6 }} />
          <span style={{ marginLeft: "auto", fontSize: "0.62rem", fontWeight: 700, color: C.goldBright, fontVariantNumeric: "tabular-nums" }}>{stamp}</span>
        </div>
        {hasAny ? (
          <RadarStrip radar={radar} today={today} interactive={false} C={C} autoScrollToday />
        ) : (
          <div style={{ padding: "12px 4px", fontSize: "0.7rem", color: C.muted }}>No reporters in the three-week window.</div>
        )}
      </div>
      {open && createPortal(
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1250, background: "rgba(4,4,8,0.55)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", overflowY: "auto", padding: "32px 16px" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1220, margin: "0 auto" }}>
            <EarningsCalendar C={C} font={font} session={session} />
          </div>
        </div>, document.body)}
    </>
  );
}
