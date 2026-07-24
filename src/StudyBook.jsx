import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { GROUP_RS } from "./groupRS-data.js";
import { sectorFor } from "./sectors.js";

// ══════════════════════════════════════════════════════════════════
// STUDY BOOK — private study wing of My Book (admin). Historical EXERCISE
// mode: go back in time through big winners and extract their characteristics
// on a FIXED factor + metric card (same fields every chart → commonality/lift
// emerges from the counts, never from memory). Two charts per study: HTF
// (weekly/monthly context) + LTF (daily/intraday trigger). Rows are normal
// model_book rows with the payload under metrics.study — is_published stays
// false until promoted through the normal editor. Definitions mirror
// AI-OS/trading/context/winner-dna.md (quantified thresholds, pre-registered
// outcome classes, lift math).
// ══════════════════════════════════════════════════════════════════

export const isStudyRow = (r) => !!(r && r.metrics && r.metrics.study);

// ── Campaigns (Valen 2026-07-24): a trending name prints multiple setups across its legs. Legs of one
// trend share a `campaign_id` (root = `<TICKER>-<root trigger date>`, children copy it). `leg_index` is
// STRUCTURAL — recomputed here from the trigger-date sort, never hard-stored. A study with NO campaign_id
// is a solo campaign of one (leg 1) and behaves exactly as before (backward-compat). Returns a grouped
// list + a byId map ({campaign_id, legIndex, isRoot, count}) so list, editor and stats agree on structure.
export function buildCampaigns(rows) {
  const studies = (rows || []).filter(r => r.metrics?.study);
  const groups = {};
  studies.forEach(r => { const cid = r.metrics.study.campaign_id || `solo:${r.id}`; (groups[cid] ||= []).push(r); });
  const byId = {};
  const list = Object.entries(groups).map(([cid, legs]) => {
    const sorted = [...legs].sort((a, b) => String(a.entry_date || "").localeCompare(String(b.entry_date || "")) || String(a.id).localeCompare(String(b.id)));
    sorted.forEach((r, i) => { byId[r.id] = { campaign_id: r.metrics.study.campaign_id || null, legIndex: i + 1, isRoot: i === 0, count: sorted.length }; });
    return { cid, solo: sorted.length === 1, count: sorted.length, legs: sorted, root: sorted[0],
      span: [sorted[0].entry_date, sorted[sorted.length - 1].entry_date] };
  });
  return { list, byId };
}

// TWO LAYERS PER SETUP (Valen 2026-07-14):
//   buckets = HIS tickable checklist — only what eyes can verify on a historical chart,
//             organized grader-style in 3 buckets per setup. No data-context items here
//             (no theme/liquidity/ADR/rank — backtesting can't see those on the chart).
//   metrics = the AUTO-PULLED data section — filled by study-fill.mjs / Claude; he only
//             corrects, never sources. Data-threshold factors (ADR≥4, RVol>1, ext≤4…) are
//             derived from these values at analysis time, so they need no tick at all.
export const STUDY_SETUPS = {
  "Momentum Breakout": {
    buckets: [
      { title: "Prior move / trend", items: [
        ["pole", "Prior pole — big move ≥30% into the base"],
        ["linear", "Pole linear — clean advance, no whipsaw"],
        ["young", "Young trend — 1st–3rd breakout, not late/extended"], // sub-categorized by leg (checks.young_leg: "1"|"2"|"3") — Valen 2026-07-14
      ]},
      { title: "Base quality", items: [
        // Eyeball layer stays QUALITATIVE (mentor verbatim) — the 0.6×ATR quantification is a
        // winner-dna.md ⚠️-knob and lives in metrics.tight_days (study-fill.mjs), not in his ticks.
        // 3rd element "bonus" = tracked in the lift table but excluded from the quality score.
        ["tight", "Tightening series — ≥3 visibly narrow-range days pre-trigger"], // sub-categorized by coil length (checks.coil_len) — Valen 2026-07-24
        ["vol_dry", "Volume drying up in the base (lower than usual)"],
        ["orderly", "Orderly base — no big red bars inside"],
        ["higher_lows", "Higher lows forming into the pivot"],
        ["prior_nr", "Day before trigger = narrow-range or negative day"],
        ["inside", "Inside bar(s) right before the trigger — coil tell", "bonus"],
        ["ma_conv", "SMA 10/20/50 converging at the pivot", "bonus"],
        ["shallow_retrace", "Pullback held the 10MA (never closed below)", "bonus"], // sub-categorized by how deep it cut (checks.retrace_ma) — Valen 2026-07-24
        ["ma_surf", "Surfing rising 10/20/50-day MA into the pivot"],
      ]},
      { title: "Trigger day", items: [
        ["re", "Day-1 range expansion ≥4% — bar visibly bigger than last 5–10"],
        ["up2", "≤2 up-days before the trigger (not buying day 3)"],
        ["closehi", "Closed ≥70% of the day's range"],
        ["vol_exp", "Volume expansion — trigger bar volume above prior day"],
        ["gapped", "Gapped up on the trigger day"], // sub-categorized by gap % (checks.gap_band) — Valen 2026-07-14
        ["catalyst", "Catalyst present (news/earnings ≤2d before trigger)", "bonus"], // Valen 2026-07-24
      ]},
    ],
    metrics: [
      ["rs", "AS/RS rank"], ["adr20", "ADR20 %"], ["dolvol_m", "DolVol $M (20d)"],
      ["tight_days", "Tight days (NR streak)"], ["base_days", "Base length (days)"],
      ["pole_pct", "Pole run-up %"], ["pole_days", "Pole length (days)"],
      ["ext_50ma", "Ext from 50MA (×ATR%)"], ["from_high_pct", "% below 52wk high"],
      ["breakout_num", "Breakout # in trend (1st/2nd/3rd…)"], ["up_days_before", "Up-days in a row before trigger"],
      ["re_pct", "Trigger day % move"], ["gap_pct", "Gap % (open vs prior close)"], ["vol_ratio", "Volume ÷ prior day"],
      ["rvol_eod", "RVol 50d EOD"], ["rvol_30m", "RVOL 1st 30min (vs same window, 20d)"], ["vol30_adv_pct", "1st-30min vol as % of ADV"], ["run_rate", "Run rate at entry (×)"],
      ["closing_range", "Closing range % (C−L)/(H−L)"], ["entry_px", "Entry (5-min ORH — standing rule)"], ["pivot_px", "Pivot (annotated) $ — gates the sim"], ["stop_width_adr", "LoD stop width from entry (×ADR)"],
      // Task-2 computed characteristics (study-fill.mjs) — cap/liquidity, neglect, burst-shape tells.
      ["adv_dollar", "ADV $ (20d avg vol × trigger close)"], ["turnover_pct", "Turnover % ($ADV ÷ cap)"], ["dormant_days", "Dormant days (since last ≥20%/5d burst)"],
      ["invaded_half", "Invaded day-1 half? (low d2–5 < midpoint)"], ["d3_moved", "Follow-through by D3? (new high by d2/d3)"],
      ["d_below_ma10", "Sessions to 1st close below 10MA"], ["d_below_ma20", "Sessions to 1st close below 20MA"],
      ["drop_after_peak_5", "Drop after ext peak, 5d (%)"], ["drop_after_peak_10", "Drop after ext peak, 10d (%)"],
      ["theme", "Theme / group (if known)"], ["regime", "Regime (SPY 10>20) Y/N"],
      ["spy_10d20", "SPY condition (10 sessions vs 20SMA)"],
    ],
  },
  // Momentum Burst — the short 3–5 day mover (Valen 2026-07-24). Reuses the EXACT same tick keys as
  // Momentum Breakout so hypothesis readouts aggregate the field across both setup types.
  "Momentum Burst": {
    buckets: [
      { title: "Coil", items: [
        ["tight", "Tightening series — ≥3 visibly narrow-range days pre-trigger"], // sub-cat coil_len
        ["orderly", "Orderly base — no big red bars inside"],
        ["higher_lows", "Higher lows forming into the pivot"],
        ["up2", "≤2 up-days before the trigger (not buying day 3)"],
        ["prior_nr", "Day before trigger = narrow-range or negative day"],
        ["shallow_retrace", "Pullback held the 10MA (never closed below)", "bonus"], // sub-cat retrace_ma
      ]},
      { title: "Trigger", items: [
        ["re", "Day-1 range expansion ≥4% — bar visibly bigger than last 5–10"],
        ["closehi", "Closed ≥70% of the day's range"],
        ["gapped", "Gapped up on the trigger day"], // sub-cat gap_band
      ]},
      { title: "Context", items: [
        ["young", "Young trend — 1st–3rd burst, not late/extended"], // sub-cat young_leg
        ["linear", "Prior advance linear — clean, no whipsaw"],
        ["catalyst", "Catalyst present (news/earnings ≤2d before trigger)", "bonus"],
      ]},
    ],
    metrics: [
      ["rs", "AS/RS rank"], ["adr20", "ADR20 %"], ["dolvol_m", "DolVol $M (20d)"],
      ["tight_days", "Tight days (NR streak)"], ["pole_pct", "Pole run-up %"], ["ext_50ma", "Ext from 50MA (×ATR%)"],
      ["from_high_pct", "% below 52wk high"], ["up_days_before", "Up-days in a row before trigger"],
      ["re_pct", "Trigger day % move"], ["gap_pct", "Gap % (open vs prior close)"], ["vol_ratio", "Volume ÷ prior day"],
      ["rvol_eod", "RVol 50d EOD"], ["rvol_30m", "RVOL 1st 30min (vs same window, 20d)"], ["vol30_adv_pct", "1st-30min vol as % of ADV"],
      ["closing_range", "Closing range % (C−L)/(H−L)"], ["entry_px", "Entry (5-min ORH — standing rule)"], ["pivot_px", "Pivot (annotated) $ — gates the sim"], ["stop_width_adr", "LoD stop width from entry (×ADR)"],
      ["adv_dollar", "ADV $ (20d avg vol × trigger close)"], ["turnover_pct", "Turnover % ($ADV ÷ cap)"], ["dormant_days", "Dormant days (since last ≥20%/5d burst)"],
      ["invaded_half", "Invaded day-1 half? (low d2–5 < midpoint)"], ["d3_moved", "Follow-through by D3? (new high by d2/d3)"],
      ["d_below_ma10", "Sessions to 1st close below 10MA"], ["d_below_ma20", "Sessions to 1st close below 20MA"],
      ["drop_after_peak_5", "Drop after ext peak, 5d (%)"], ["drop_after_peak_10", "Drop after ext peak, 10d (%)"],
      ["theme", "Theme / group (if known)"], ["regime", "Regime (SPY 10>20) Y/N"],
      ["spy_10d20", "SPY condition (10 sessions vs 20SMA)"],
    ],
  },
  "Episodic Pivot": {
    buckets: [
      { title: "Before the gap", items: [
        ["neglect", "Neglected — flat/basing, no big run in prior months"],
        ["first", "FIRST big surprise (no recent prior EP gap on the chart)"],
        ["base_ok", "Coming out of an orderly base, not a downtrend knife"],
      ]},
      { title: "Gap day", items: [
        ["gap", "Gap up ≥10% visible (or 4%+ earnings-day range expansion)"],
        ["vol_huge", "Huge volume bar — dwarfs recent bars"],
        ["closehi", "Held the gap — closed in the upper part of the day's range"],
      ]},
      { title: "Structure", items: [
        ["stopw", "Stop ≤1–1.5× ADR from entry (tight structure available)"],
        ["cont", "No overhead resistance nearby (blue sky / clears the base)"],
      ]},
    ],
    metrics: [
      ["gap_pct", "Gap %"], ["rvol_eod", "RVol 50d EOD (≥3× gate)"], ["run_rate", "Run rate at entry (×)"],
      ["premkt_vol_k", "Pre-market volume (k sh)"], ["rvol_30m", "RVOL 1st 30min (vs same window, 20d)"], ["vol30_adv_pct", "1st-30min vol as % of ADV"],
      ["yoy_eps", "YoY EPS growth %"], ["yoy_rev", "YoY revenue growth %"],
      ["neglect_3m", "3-mo return before EP %"], ["surprise_num", "Surprise # (1st / 2nd…)"],
      ["analysts", "Analyst count"], ["adr20", "ADR20 %"], ["dolvol_m", "DolVol $M (20d)"],
      ["entry_px", "Entry (5-min ORH — standing rule)"], ["stop_width_adr", "LoD stop width from entry (×ADR)"], ["regime", "Regime (SPY 10>20) Y/N"],
      ["spy_10d20", "SPY condition (10 sessions vs 20SMA)"],
    ],
  },
  "Parabolic": {
    buckets: [
      { title: "The stretch", items: [
        ["stretch", "Vertical — +50–100% (large) / +300%+ (small) in days–weeks"],
        ["updays", "3–5+ consecutive up days into the climax"],
        ["ext_vis", "Far above all rising MAs — visibly climactic"],
      ]},
      { title: "Trigger", items: [
        ["trigger", "First crack — big red bar / break of opening range in trade direction"],
        ["vwap", "VWAP fail (short) / reclaim (long) — if intraday visible"],
      ]},
      { title: "Structure", items: [
        ["stopw", "Stop at day-extreme ≤1 ADR"],
        ["target", "Room to the 10/20-day MA — target zone far enough to pay"],
      ]},
    ],
    metrics: [
      ["run_pct", "Run % into climax"], ["run_days", "Run length (days)"], ["consec_updays", "Consecutive up days"],
      ["ext_50ma", "Ext from 50MA (×ATR%)"], ["dist_10ma_pct", "Distance to 10MA %"], ["dist_20ma_pct", "Distance to 20MA %"],
      ["adr20", "ADR20 %"], ["dolvol_m", "DolVol $M (20d)"], ["rvol_eod", "RVol 50d on climax day"],
      ["spy_10d20", "SPY condition (10 sessions vs 20SMA)"],
    ],
  },
};

// Data-derived factor flags — computed from the AUTO metrics at analysis time (no tick needed).
// Thresholds per winner-dna.md; blank metric = "not measured" (excluded), never "failed".
export const DATA_FLAGS = [
  ["adr4", "ADR20 ≥ 4% (data)", (m) => m.adr20 == null || m.adr20 === "" ? null : +m.adr20 >= 4],
  ["vol_gt_prior", "Volume > prior day (data)", (m) => m.vol_ratio == null || m.vol_ratio === "" ? null : +m.vol_ratio > 1],
  ["rvol_hot", "RVol 50d ≥ 1.5 (data)", (m) => m.rvol_eod == null || m.rvol_eod === "" ? null : +m.rvol_eod >= 1.5],
  // Jeff's documented gate: ~40% of a full day's volume by the first 30 min (time-matched pace)
  ["jeff40", "1st-30min vol ≥ 40% of ADV (data)", (m) => m.vol30_adv_pct == null || m.vol30_adv_pct === "" ? null : +m.vol30_adv_pct >= 40],
  ["ext_ok", "Ext from 50MA ≤ 4× (data)", (m) => m.ext_50ma == null || m.ext_50ma === "" ? null : +m.ext_50ma <= 4],
  ["pole30", "3-mo return ≥ +30% (data)", (m) => { const v = m.pole_pct ?? m.ret_3m; return v == null || v === "" ? null : +v >= 30; }],
  ["stop_tight", "Stop ≤ 1× ADR (data)", (m) => m.stop_width_adr == null || m.stop_width_adr === "" ? null : +m.stop_width_adr <= 1],
  ["leader98", "AS ≥ 98 (data)", (m) => { const v = parseFloat(m.rs); return Number.isNaN(v) ? null : v >= 98; }],
];

// Outcome anatomy — burst shape + campaign shape, shared by all setups.
const OUTCOME_METRICS = [
  ["mfe_d1", "MFE % day 1"], ["mfe_d3", "MFE % day 3"], ["mfe_d5", "MFE % day 5"], ["mfe_d20", "MFE % day 20"],
  ["day2_pct", "Day-2 % move (follow-through size)"], ["burst_days", "Burst length (up-closes AFTER trigger; +1 = doctrine burst count)"], ["burst_pct", "Burst magnitude % (from pre-trigger close)"],
  ["mae", "MAE % (before MFE)"], ["giveback_pct", "Giveback after burst %"],
  ["days_above_10ma", "Days above 10MA (campaign length)"], ["trail_r", "Trail-exit total R (10/20MA sim)"],
  ["ext_at_peak", "Ext from 50MA at burst peak (×ATR%)"],
  ["rr_est", "Est. R:R (20d MFE ÷ risk)"], ["sim_r", "Sim R (trim-into-strength + SMA10 trail)"],
  ["sim_mgmt", "Best management (which trim variant won)"], ["trade_verdict", "Trade verdict (win/loss sim)"],
];

// Tick sub-categories (Valen 2026-07-14): a ticked parent factor can carry one refinement,
// stored beside the ticks in study.checks[store]. Each option becomes its own lift row, so the
// commonality read can say "monsters come off the 1st leg" / "the 2–5% gaps outperform".
// Un-ticking the parent clears the sub-choice. Sub-choice is optional (blank = not measured).
export const SUBCATS = {
  young: { store: "young_leg", options: [["1", "1st leg"], ["2", "2nd leg"], ["3", "3rd leg"]] },
  gapped: { store: "gap_band", options: [["<2", "<2%"], ["2-5", "2–5%"], ["5-10", "5–10%"], [">10", ">10%"]] },
  // Valen 2026-07-24: coil duration band on the tightening tick; retrace depth on the shallow-retrace bonus tick.
  tight: { store: "coil_len", options: [["<10", "<10d"], ["10-20", "10–20d"], [">20", ">20d"]] },
  shallow_retrace: { store: "retrace_ma", options: [["10ma", "10MA"], ["20ma", "20MA"], ["50ma", "50MA"], ["deeper", "deeper"], ["none", "no touch"]] },
};

// Quality is AUTO-COMPUTED from how many checklist criteria are ticked (Valen 2026-07-14) —
// same shape as the Setup Grader: tick-% → stars → letter. No manual grade input.
export function studyQuality(study) {
  const def = STUDY_SETUPS[study.setup] || STUDY_SETUPS["Momentum Breakout"];
  const scored = def.buckets.flatMap(b => b.items).filter(it => !it[2]); // bonus ticks don't grade
  const total = scored.length;
  const on = scored.filter(([k]) => study.checks?.[k]).length;
  const stars = on ? Math.round(on / total * 5) : 0;
  return { on, total, letter: on === 0 ? "—" : ({ 5: "A+", 4: "A", 3: "B" }[stars] || "C") };
}

const MARKET_CONDITIONS = ["Uptrend", "Chop", "Downtrend"];

// Pre-registered outcome classes (winner-dna.md) — direction-aware, never re-defined after data.
export function outcomeClass(study) {
  const o = study.outcome || {};
  const sgn = study.direction === "short" ? -1 : 1;
  const m5 = o.mfe_d5 === "" || o.mfe_d5 == null ? null : sgn * +o.mfe_d5;
  const m20 = o.mfe_d20 === "" || o.mfe_d20 == null ? null : sgn * +o.mfe_d20;
  if (m20 != null && m20 >= 20) return "monster";
  if (m5 == null) return null;
  if (m5 >= 8) return "big winner";
  if (m5 >= 4) return "works small";
  return "failure";
}
const MB_OUTCOME = { monster: "Huge Winner", "big winner": "Winner", "works small": "Subpar", failure: "Loser" };

// factor lift across resolved studies: P(factor | winner) / P(factor | failure).
// TWO factor classes: 👁 Valen's chart-readable ticks (study.checks, from the buckets) and
// 📊 data-derived flags computed from the auto metrics (DATA_FLAGS — no tick needed; a blank
// metric = "not measured" and that study is excluded from THAT flag, never counted as failed).
export function liftTable(rows) {
  const entries = rows.filter(r => r.metrics?.study && outcomeClass(r.metrics.study)).map(r => r.metrics.study);
  const isWin = (s) => ["big winner", "monster"].includes(outcomeClass(s));
  const win = entries.filter(isWin), fail = entries.filter(s => outcomeClass(s) === "failure");
  const out = [];
  const push = (group, label, val /* s -> true|false|null */) => {
    const w = win.map(val).filter(x => x !== null), f = fail.map(val).filter(x => x !== null);
    if (!w.length && !f.length) return;
    const pW = w.length ? w.filter(Boolean).length / w.length : 0;
    const pF = f.length ? f.filter(Boolean).length / f.length : 0;
    out.push({ setup: group, label, pW, pF, lift: pF > 0 ? pW / pF : (pW > 0 ? Infinity : 0) });
  };
  const seen = new Set();
  entries.forEach(s => (STUDY_SETUPS[s.setup]?.buckets || []).forEach(b => b.items.forEach(([k, label]) => {
    const id = `${s.setup}|${k}`;
    if (seen.has(id)) return; seen.add(id);
    push(`👁 ${s.setup}`, label, (e) => e.setup === s.setup ? !!e.checks?.[k] : null);
  })));
  // Sub-category lift rows (young-trend legs, gap-% bands): parent not ticked = false
  // (didn't have the factor); parent ticked but sub-choice blank = null (not measured).
  Object.entries(SUBCATS).forEach(([parent, sub]) => {
    const parentSetups = new Set();
    Object.entries(STUDY_SETUPS).forEach(([name, d]) =>
      d.buckets.some(b => b.items.some(([k]) => k === parent)) && parentSetups.add(name));
    entries.forEach(s => { if (!parentSetups.has(s.setup) || seen.has(`${s.setup}|${parent}|sub`)) return;
      seen.add(`${s.setup}|${parent}|sub`);
      const parentLabel = STUDY_SETUPS[s.setup].buckets.flatMap(b => b.items).find(([k]) => k === parent)?.[1].split(" — ")[0];
      sub.options.forEach(([val, optLabel]) => push(`👁 ${s.setup}`, `${parentLabel} — ${optLabel}`, (e) => {
        if (e.setup !== s.setup) return null;
        if (!e.checks?.[parent]) return false;
        return e.checks[sub.store] ? String(e.checks[sub.store]) === val : null;
      }));
    });
  });
  DATA_FLAGS.forEach(([k, label, fn]) => push("📊 Data", label, (e) => fn(e.m || {})));
  return { rows: out.sort((a, b) => b.lift - a.lift), nWin: win.length, nFail: fail.length, n: entries.length };
}

export function StudyScoreboard({ C, rows }) {
  const { rows: lifts, nWin, nFail, n } = liftTable(rows);
  const small = n < 30;
  const bySetup = {};
  rows.forEach(r => { const s = r.metrics.study.setup; bySetup[s] = (bySetup[s] || 0) + 1; });
  // Uniform card chrome — 16px radius, glass, top-left sheen, uppercase micro-label + divider head.
  const sheen = { position: "absolute", inset: 0, pointerEvents: "none", borderRadius: 16, background: "linear-gradient(135deg, rgba(255,255,255,0.05), transparent 55%)" };
  const box = { background: "rgba(0,0,0,0.25)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", flex: 1, minWidth: 140 };
  const boxNum = { display: "block", fontSize: "1.3rem", fontWeight: 800, color: C.white, lineHeight: 1.1 };
  const boxLbl = { fontSize: "0.6rem", color: C.muted, textTransform: "uppercase", letterSpacing: ".08em" };
  const subhead = { fontSize: "0.6rem", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: C.goldBright, margin: "16px 0 10px" };
  const gloss = { border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 12px", fontSize: "0.72rem", color: C.muted, lineHeight: 1.5 };
  const glossTerm = { display: "block", marginBottom: 3, fontSize: "0.76rem", color: C.goldBright };
  return (
    <div style={{ position: "relative", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 16, padding: "18px 20px", marginBottom: 16, backdropFilter: "blur(24px) saturate(150%)", WebkitBackdropFilter: "blur(24px) saturate(150%)" }}>
      <div style={sheen} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 11, marginBottom: 14, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ flex: 1, fontSize: "0.62rem", fontWeight: 700, letterSpacing: ".13em", textTransform: "uppercase", color: C.muted }}>Study Scoreboard</span>
        <span title="Historical EXERCISE mode: fixed factor + metric cards on past winners so commonality emerges from the counts, never from memory." style={{ flex: "none", width: 15, height: 15, borderRadius: "50%", border: `1px solid ${C.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem", fontWeight: 700, fontStyle: "italic", color: C.muted, cursor: "help" }}>i</span>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={box}><b style={boxNum}>{rows.length}</b><span style={boxLbl}>Studies</span></div>
        {Object.entries(bySetup).map(([k, v]) => (
          <div key={k} style={box}><b style={boxNum}>{v}</b><span style={boxLbl}>{k}</span></div>
        ))}
        <div style={box}><b style={boxNum}>{nWin}W / {nFail}F</b><span style={boxLbl}>Resolved Classes</span></div>
      </div>
      {/* Outcome-class glossary — the PRE-REGISTERED definitions (winner-dna.md); measured from
          the trigger day's 5-min-ORH entry, never re-defined after seeing data. */}
      <div style={subhead}>Outcome-class glossary</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 8, marginBottom: 6 }}>
        {[["🦖 Monster", "ran +20% or more within 20 sessions of the trigger — the campaign class the whole study hunts"],
          ["🏆 Big winner", "ran +8% or more within 5 sessions — a real burst (the 8–40% class)"],
          ["🌱 Works small", "only +4–8% in 5 sessions — the idea worked but paid little; partials matter here"],
          ["💀 Failure", "under +4% in 5 sessions, or broke the trigger-day low before ever reaching +4% — the control group that makes lift math possible"],
        ].map(([term, def]) => (
          <div key={term} style={gloss}>
            <b style={glossTerm}>{term}</b>{def}
          </div>
        ))}
      </div>
      {lifts.length > 0 && (
        <>
          <div style={subhead}>Factor lift</div>
          <div style={small
            ? { fontSize: "0.72rem", color: "#e0a955", margin: "0 0 10px", padding: "9px 12px", background: "rgba(224,169,85,0.08)", border: "1px solid rgba(224,169,85,0.25)", borderRadius: 8, lineHeight: 1.5 }
            : { fontSize: "0.72rem", color: C.muted, margin: "0 0 10px", lineHeight: 1.5 }}>
            {small ? `⚠ n=${n} — early read, believe nothing before n≥30 per class (promote at n≥50). Add FAILURES too — without them lift can't be computed (winners-only = survivor bias).`
                   : `n=${n} resolved — lift = % of winners with the factor ÷ % of failures with it. ≥2 = edge candidate · ~1 = noise.`}
          </div>
          <div style={{ maxHeight: 280, overflowY: "auto", paddingTop: 2 }}>
            {lifts.slice(0, 16).map((l, i, arr) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 2px", borderBottom: i === arr.length - 1 ? "none" : "1px solid rgba(255,255,255,0.05)", fontSize: "0.74rem" }}>
                <span style={{ width: 170, flex: "none", color: C.muted, fontSize: "0.66rem" }}>{l.setup}</span>
                <span style={{ flex: 1, color: C.text }}>{l.label}</span>
                <span style={{ width: 118, flex: "none", textAlign: "right", whiteSpace: "nowrap", color: C.muted, fontSize: "0.68rem" }}>{Math.round(l.pW * 100)}%W · {Math.round(l.pF * 100)}%F</span>
                <b style={{ width: 56, flex: "none", textAlign: "right", fontWeight: 800, color: l.lift >= 2 ? "#7ef0a0" : l.lift < 0.7 ? "#e05555" : C.muted }}>{l.lift === Infinity ? "∞" : l.lift.toFixed(2)}×</b>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// 🧪 HYPOTHESES (Valen 2026-07-24) — the pre-registered claims the whole study wing exists to
// resolve. Each card states a claim + its source (DOCTRINE = an observed prior from the corpus /
// MINE = Valen's own observation), the data points that test it (with a one-line meaning each),
// and a LIVE readout over the loaded studies: winners (big winner ∪ monster) vs failures, counts,
// a lift ratio once both classes clear 5, and an always-on SampleTag. Believe nothing before
// n≥30 per class; promote at 50. Fields are read straight off study.checks / study.m — no ticks
// are ever written here. Full definitions + thresholds mirror AI-OS/trading/context/winner-dna.md.
// ══════════════════════════════════════════════════════════════════
const _num = (v) => (v == null || v === "" || Number.isNaN(+v)) ? null : +v;
const _mnum = (s, k) => _num(s.m?.[k]);
const _mbool = (s, k) => { const v = s.m?.[k]; if (v === true || v === "true") return true; if (v === false || v === "false") return false; return null; };
const _setupHasTick = (s, k) => !!(STUDY_SETUPS[s.setup]?.buckets.some(b => b.items.some(([kk]) => kk === k)));
const _tick = (s, k) => _setupHasTick(s, k) ? !!s.checks?.[k] : null; // null = the study's setup doesn't carry this tick
const _fmt$B = (v) => v == null ? "—" : v >= 1e9 ? "$" + (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? "$" + Math.round(v / 1e6) + "M" : "$" + Math.round(v / 1e3) + "k";

export const HYPOTHESES = [
  { id: "H1", claim: "Tight coil ignites", source: "DOCTRINE", kind: "binary",
    prior: "The narrower the pre-breakout range, the more explosive the move.",
    points: [["tight_days", "how many narrow-range days in the last 10 — the stored energy"], ["tightening tick", "your eyeball read of the coil"], ["inside-bar tell", "coil RMV state — the tightest read, if ticked"]],
    test: (s) => _tick(s, "tight"), value: (s) => { const d = _mnum(s, "tight_days"); return d == null ? "—" : d + " tight-days"; } },
  { id: "H2", claim: "Short coils beat long bases", source: "DOCTRINE", kind: "subcat", parent: "tight",
    prior: "Breakouts from <10-day coils work; 1–2 month bases fail more.",
    points: [["coil_len subcat", "which duration band the base fell in"]] },
  { id: "H3", claim: "Young legs win (cougar rule)", source: "DOCTRINE", kind: "subcat", parent: "young",
    prior: "70% of trends die after 2 legs; 20% get a 3rd; 5% a 4th.",
    points: [["young_leg subcat", "which leg the entry caught — 1st/2nd cheap, 3rd+ borrowed time"]] },
  { id: "H4", claim: "Shallow retrace = strength", source: "MINE", kind: "subcat", parent: "shallow_retrace",
    prior: "My own observation, no corpus prior: 2nd legs that only retrace to the 10MA (not the 20) tend to launch again.",
    points: [["shallow_retrace tick", "the pullback never closed below the 10MA"], ["retrace_ma subcat", "how deep the pullback cut before the push"]] },
  { id: "H5", claim: "Small cap + real liquidity = explosive AND tradeable", source: "DOCTRINE", kind: "bandmove", distOnly: true,
    prior: "Capitalization is the most important magnitude factor; most 20% movers are <$1B — but it still has to be liquid enough to trade. Does a smaller cap band print a bigger % move?",
    points: [["mcap_t", "size of the company at trigger — smaller moves further"], ["adv_dollar", "my $20M execution floor"], ["turnover_pct", "$ traded vs cap — high turnover = violent mover profile"]],
    bands: ["<$500M", "$500M–$1B", "$1–2B", "$2–10B", ">$10B"],
    bandOf: (s) => { const c = _mnum(s, "mcap_t"); return c == null ? null : c < 5e8 ? "<$500M" : c < 1e9 ? "$500M–$1B" : c < 2e9 ? "$1–2B" : c < 1e10 ? "$2–10B" : ">$10B"; },
    cols: [["median burst %", (s) => _outNum(s, "burst_pct"), true], ["median MFE d20 %", (s) => _outNum(s, "mfe_d20"), false], ["median turnover %", (s) => _mnum(s, "turnover_pct"), false]],
    fmts: [(v) => _pct(v), (v) => _pct(v), (v) => v == null ? "—" : v.toFixed(1) + "%"],
    expand: (s) => `${_fmt$B(_mnum(s, "mcap_t"))} cap · burst ${_pct(_outNum(s, "burst_pct"))} · MFE20 ${_pct(_outNum(s, "mfe_d20"))}`,
    excludedLabel: "no mcap_t" },
  { id: "H6", claim: "Winners never invade half of day 1", source: "DOCTRINE", kind: "binary",
    prior: "Real movers don't give back half the breakout day's gain.",
    points: [["invaded_half", "did price dip below day-1 midpoint in days 2–5 — if yes and it still won, the rule weakens"]],
    test: (s) => { const v = _mbool(s, "invaded_half"); return v == null ? null : !v; }, // factor = HELD above half
    value: (s) => { const v = _mbool(s, "invaded_half"); return v == null ? "—" : v ? "invaded" : "held" } },
  { id: "H7", claim: "Follow-through by day 3 or dead", source: "DOCTRINE", kind: "binary",
    prior: "Winners go bang-bang-bang; at most one pause day.",
    points: [["d3_moved", "new high above day-1 high by D3"]],
    test: (s) => _mbool(s, "d3_moved"), value: (s) => { const v = _mbool(s, "d3_moved"); return v == null ? "—" : v ? "moved by D3" : "stalled" } },
  { id: "H8", claim: "Neglect precedes the monster", source: "DOCTRINE", kind: "binary",
    prior: "The more ignored the name, the bigger the move (dormancy ≥ ~20 sessions = neglected).",
    points: [["dormant_days", "sessions since its last 20%/5d burst — dormancy"], ["off_52wk (from_high_pct)", "how far under the 52-week high it ignited"]],
    test: (s) => { const d = _mnum(s, "dormant_days"); return d == null ? null : d >= 20; },
    value: (s) => { const d = _mnum(s, "dormant_days"), h = _mnum(s, "from_high_pct"); return `${d == null ? "—" : d + "d dormant"}${h == null ? "" : ` · ${h.toFixed(0)}% off high`}` } },
  { id: "H9", claim: "Range breakouts need a catalyst", source: "DOCTRINE", kind: "binary",
    prior: "Consolidation breakouts without a catalyst tend to fail; continuation legs don't need one.",
    points: [["catalyst tick", "was there fuel — news/earnings ≤2d before the trigger"], ["rvol_30m / volume", "the volume signature confirming the fuel"]],
    test: (s) => _tick(s, "catalyst"), value: (s) => { const r = _mnum(s, "rvol_30m"); return r == null ? "—" : `RVOL30 ${r.toFixed(1)}×` } },
  { id: "H10", claim: "Trend lifespan in legs", source: "MINE", kind: "distribution",
    prior: "How many legs a trend prints — from its FIRST leg — before its first daily close below the 10MA vs the 20MA. Doubles as the direct test of the leg-count distribution prior (≈70% of trends die after 2 legs · 20% get a 3rd · 5% a 4th · 1% a 5th).",
    points: [["legs_ma10 / legs_ma20", "total legs from the first leg of the trend to the first daily close below the 10MA / 20MA — counted off the AFTER chart, blank until set"], ["d_below_ma10 / d_below_ma20", "sessions from trigger to that first close below the MA (computed companion; censored when the trend never breaks inside the post-trigger window — censored ≠ a short trend)"]],
    bands: ["1", "2", "3", "4", "5+"],
    stores: [["legs_ma10", "10MA"], ["legs_ma20", "20MA"]],
    priorDist: { "1": null, "2": 70, "3": 20, "4": 5, "5+": 1 } },
  { id: "H11", claim: "Extension from the 50MA — fresh entries win, stretched peaks die", source: "MINE", kind: "extension",
    prior: "Breakouts triggered at a low ATR%-multiple from the 50MA outperform extended ones, and burst peaks cluster in a trim band. My own extension-tracker measurement: ≥7× multiples mark the trim-into-strength zone — strength faded from there ~76% of the time.",
    points: [["ext-at-trigger (ext_50ma)", "how stretched the entry already was — ≤4× = fresh, >4× = chasing"], ["ext-at-peak (ext_at_peak)", "where the burst topped — the trim-band calibration"]],
    bands: ["<2×", "2–4×", "4–7×", "≥7×"], entryKey: "ext_50ma", peakKey: "ext_at_peak" },
  { id: "H12a", claim: "In-theme by thrust", source: "MINE", kind: "binary",
    prior: "Does entering a setup whose GROUP is in-theme (top-5 by rotation thrust at the trigger) improve the odds it plays out?",
    caption: "Tagged by the rotation engine's own ranking (thrust/rs1m), not a theme name — coverage limited to dated snapshots; older studies blank until reconstructed.",
    points: [["group thrust rank", "where the ticker's rotation group sits by thrust — top-5 = money rushing in"], ["in-theme (top-5 thrust)", "the predicted-good state for this lens"]],
    test: (s, ctx) => { const r = rotationAt(ctx?.ticker, ctx?.date); return r ? !!r.inThemeThrust : null; },
    value: (s, ctx) => { const r = rotationAt(ctx?.ticker, ctx?.date); return r ? `${r.groupName} #${r.rank} thrust${r.inThemeThrust ? " · in-theme" : ""}` : "—"; } },
  { id: "H12b", claim: "Leader by RS", source: "MINE", kind: "binary",
    prior: "Does entering a setup whose GROUP is a relative-strength leader (rotation RS 1M ≥ 80) improve the odds? The a-vs-b comparison is the point — which better separates winners from failures.",
    caption: "Rotation-RANKING lens (his rs1m), NOT DeepVue's Since-Open theme tags (not historically reconstructable). Coverage = dated snapshots only.",
    points: [["group RS 1M", "the group's 1-month relative strength, 0–100"], ["leader (RS ≥ 80)", "the predicted-good state for this lens"]],
    test: (s, ctx) => { const r = rotationAt(ctx?.ticker, ctx?.date); return r ? !!r.leaderRS : null; },
    value: (s, ctx) => { const r = rotationAt(ctx?.ticker, ctx?.date); return r ? `group RS 1M ${r.rs1m == null ? "—" : r.rs1m}${r.leaderRS ? " · leader" : ""}` : "—"; } },
  { id: "H13", claim: "Extreme extension → reversion (breakdown short)", source: "MINE", kind: "bandmove", distOnly: true,
    prior: "The short-side mirror of the extension lens: when ext-from-50MA reaches an extreme at the burst peak, how much does price give back? More extended peak ⇒ bigger reversion?",
    caption: "The give-back after extreme extension — sizes the breakdown-short opportunity; short ENTRY timing lives in the Parabolic Short setup.",
    points: [["ext_at_peak", "how stretched the burst got (×ATR% from 50MA)"], ["drop_after_peak_5 / _10", "max % decline from the peak close over the next 5 / 10 sessions (≤0; censored when too few bars)"]],
    bands: ["<7×", "7–8×", "8–10×", "10–12×", "≥12×"],
    bandOf: (s) => { const e = _outNum(s, "ext_at_peak"); return e == null ? null : e < 7 ? "<7×" : e < 8 ? "7–8×" : e < 10 ? "8–10×" : e < 12 ? "10–12×" : "≥12×"; },
    cols: [["median 5d drop %", (s) => _mnum(s, "drop_after_peak_5"), true], ["median 10d drop %", (s) => _mnum(s, "drop_after_peak_10"), false]],
    fmts: [(v) => _pct(v), (v) => _pct(v)],
    expand: (s) => `peak ${_x(_outNum(s, "ext_at_peak"))} · 5d ${_pct(_mnum(s, "drop_after_peak_5"))} · 10d ${_pct(_mnum(s, "drop_after_peak_10"))}`,
    excludedLabel: "no ext_at_peak" },
];

// H11 extension helpers — band an ATR%-multiple, split ENTRY-extension winners/failures per band,
// and distribute PEAK-extension across winners only (the trim-band calibration). Blank = excluded.
function extBand(v) { if (v == null || v === "" || Number.isNaN(+v)) return null; const x = +v; return x < 2 ? "<2×" : x < 4 ? "2–4×" : x < 7 ? "4–7×" : "≥7×"; }
function extEntry(bands, key, winners, fails) {
  const b = (x) => extBand(x.s.m?.[key]);
  const mWin = winners.filter(x => b(x) != null), mFail = fails.filter(x => b(x) != null);
  const rows = bands.map(band => {
    const w = mWin.filter(x => b(x) === band), f = mFail.filter(x => b(x) === band);
    const pW = mWin.length ? w.length / mWin.length : 0, pF = mFail.length ? f.length / mFail.length : 0;
    return { band, list: [...w, ...f], wc: w.length, fc: f.length, lift: pF > 0 ? pW / pF : (pW > 0 ? Infinity : 0) };
  });
  return { rows, W: mWin.length, F: mFail.length, E: (winners.length - mWin.length) + (fails.length - mFail.length), enough: mWin.length >= 5 && mFail.length >= 5 };
}
function extPeakDist(bands, key, winners) {
  const set = winners.filter(x => { const v = x.s.outcome?.[key]; return v != null && v !== "" && !Number.isNaN(+v); });
  const counts = {}; bands.forEach(band => (counts[band] = 0));
  set.forEach(x => { const band = extBand(x.s.outcome[key]); if (counts[band] != null) counts[band]++; });
  const vals = set.map(x => +x.s.outcome[key]).sort((a, b) => a - b);
  const med = vals.length ? (vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2) : null;
  return { set, counts, n: set.length, blank: winners.length - set.length, med };
}

// H10 distribution helpers — leg-count histogram (all loaded studies, blank excluded) and the
// censored-aware median of the computed days-to-first-close-below-MA companion.
function legDist(store, bands, all) {
  const set = all.filter(x => x.s.checks?.[store] != null && x.s.checks?.[store] !== "");
  const counts = {}; bands.forEach(b => (counts[b] = 0));
  set.forEach(x => { const v = String(x.s.checks[store]); if (counts[v] != null) counts[v]++; });
  return { set, counts, n: set.length, blank: all.length - set.length };
}
function medianCompanion(all, key, censKey) {
  const vals = all.map(x => x.s.m?.[key]).filter(v => v != null && v !== "" && !Number.isNaN(+v)).map(Number).sort((a, b) => a - b);
  const cens = all.filter(x => x.s.m?.[censKey] === true || x.s.m?.[censKey] === "true").length;
  const med = vals.length ? (vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2) : null;
  return { med, n: vals.length, cens };
}

// Hypothesis era — new eyeball fields / computed metrics land from here; older studies simply lack them
// and their blanks never vote. The panel toggle can restrict to this era for a purist read (Valen 2026-07-24).
const H_ERA_START = "2026-07-24";
const _subLabel = (parent, v) => (SUBCATS[parent].options.find(([o]) => o === String(v)) || [, String(v)])[1];
const _outNum = (s, k) => { const v = s.outcome?.[k]; return (v == null || v === "" || Number.isNaN(+v)) ? null : +v; };
const _median = (arr) => { const a = arr.filter(v => v != null && !Number.isNaN(+v)).map(Number).sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2) : null; };
const _pct = (v) => v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const _x = (v) => v == null ? "—" : `${v.toFixed(1)}×`;

// H5/H13 band×move-size distribution stats: bucket a point-list by hyp.bandOf(s), and per band take the
// median of each hyp.cols getter. Blank-exclude points whose band is null. Returns per-band medians + the
// bar-column scale so the "smaller cap → bigger move" / "more extended → bigger drop" shape reads at a glance.
function bandStats(list, hyp) {
  const set = list.filter(x => hyp.bandOf(x.s) != null);
  const perBand = hyp.bands.map(b => {
    const items = set.filter(x => hyp.bandOf(x.s) === b);
    const meds = hyp.cols.map(([, get]) => _median(items.map(x => get(x.s))));
    return { band: b, n: items.length, meds, items };
  });
  const barCol = Math.max(0, hyp.cols.findIndex(c => c[2]));
  const maxBar = Math.max(1e-9, ...perBand.map(pb => Math.abs(pb.meds[barCol] ?? 0)));
  return { perBand, set, excluded: list.length - set.length, barCol, maxBar };
}

// ── H12 rotation lens (Valen 2026-07-24). rotationAt(ticker, triggerDate) resolves the ticker's rotation
// GROUP and that group's thrust/rs1m from the IN-APP rotation engine (GROUP_RS). COVERAGE IS BOUNDED: the
// bundled GROUP_RS is a SINGLE snapshot (one asof date), NOT a time series — so a study is only honestly
// taggable when its trigger date IS that snapshot's date. Any other date ⇒ null (blank, never "off-theme").
// This is the rotation-RANKING lens (his thrust/rs1m), explicitly NOT DeepVue's proprietary Since-Open
// theme tags. Grouping/RS is DeepVue-owned — we never fabricate a group or an RS number (hard rule).
function rotationAt(ticker, triggerDate) {
  const g = GROUP_RS;
  if (!g || !g.rows || !ticker || !triggerDate) return null;
  if (String(triggerDate) !== String(g.asof)) return null; // single snapshot only — no historical coverage yet
  const rows = g.rows.filter(r => r.thrust != null);
  const sec = sectorFor(ticker);
  let group = null;
  if (sec) { const low = String(sec).toLowerCase(); group = rows.find(r => r.name && r.name.toLowerCase() === low) || rows.find(r => r.name && (r.name.toLowerCase().includes(low) || low.includes(r.name.toLowerCase()))); }
  let thrust, rs1m, groupName, pool;
  if (group) { thrust = group.thrust; rs1m = group.rs1m; groupName = group.name; pool = rows; }
  else { const s = (g.ll || []).find(r => r.t === ticker && r.thrust != null); if (!s) return null; thrust = s.thrust; rs1m = s.rs1m; groupName = s.industry || ticker; pool = (g.ll || []).filter(r => r.thrust != null); }
  if (thrust == null) return null;
  const rank = pool.filter(r => (r.thrust || 0) > thrust).length + 1; // 1-based thrust rank
  return { groupName, thrust, rs1m, rank, inThemeThrust: rank <= 5, leaderRS: rs1m != null && rs1m >= 80 };
}

// Per-entry hypothesis read (Valen 2026-07-24) — for ONE study, what does it say about each hypothesis?
// `short` = label · `read(s)` → { answer, state } | null (null ⇒ this entry carries no data for it ⇒ omit).
// `state` classifies the FACTOR before outcome: good / bad / neutral / adds (distribution or magnitude —
// no per-entry pass/fail). `distOnly` = a distribution hypothesis (never a supports/challenges verdict).
const HYP_READS = {
  H1: { short: "Tight coil", read: (s) => { const t = _tick(s, "tight"), d = _mnum(s, "tight_days"); if (!t && d == null) return null;
    return { answer: `${d != null ? d + " NR days in the last 10" : "coil read"}${t ? " · ticked tight" : ""}`, state: t ? "good" : (d != null && d >= 3 ? "good" : "bad") }; } },
  H2: { short: "Coil age", read: (s) => { const v = s.checks?.coil_len; if (!v) return null;
    return { answer: `${_subLabel("tight", v)} band`, state: v === "<10" ? "good" : v === ">20" ? "bad" : "neutral" }; } },
  H3: { short: "Leg caught", read: (s) => { const v = s.checks?.young_leg; if (!v) return null;
    return { answer: _subLabel("young", v), state: (v === "1" || v === "2") ? "good" : "bad" }; } },
  H4: { short: "Retrace depth", read: (s) => { const v = s.checks?.retrace_ma, t = _tick(s, "shallow_retrace"); if (!v && !t) return null;
    const nice = { "10ma": "held the 10MA", "20ma": "cut to the 20MA", "50ma": "cut to the 50MA", deeper: "deeper than the 50MA", none: "never touched an MA" };
    return { answer: v ? (nice[v] || v) : "held the 10MA", state: v ? (v === "10ma" || v === "none" ? "good" : v === "20ma" ? "neutral" : "bad") : (t ? "good" : "bad") }; } },
  H5: { short: "Cap/liquidity", distOnly: true, read: (s) => { const cap = _mnum(s, "mcap_t"), adv = _mnum(s, "adv_dollar"), trn = _mnum(s, "turnover_pct"); if (cap == null && adv == null) return null;
    return { answer: `${cap != null ? _fmt$B(cap) + " cap" : ""}${adv != null ? `${cap != null ? " · " : ""}${_fmt$B(adv)}/day` : ""}${trn != null ? ` · ${trn.toFixed(1)}% turnover` : ""}`, state: "adds" }; } },
  H6: { short: "Half-day rule", read: (s) => { const v = _mbool(s, "invaded_half"); if (v == null) return null;
    return { answer: v ? "invaded day-1 half" : "never invaded half", state: v ? "bad" : "good" }; } },
  H7: { short: "D3 follow-through", read: (s) => { const v = _mbool(s, "d3_moved"); if (v == null) return null;
    return { answer: v ? "new high by day 3" : "stalled past day 3", state: v ? "good" : "bad" }; } },
  H8: { short: "Neglect", level: "campaign", read: (s) => { const d = _mnum(s, "dormant_days"), h = _mnum(s, "from_high_pct"); if (d == null && h == null) return null;
    const cls = outcomeClass(s);
    return { answer: `${d != null ? d + " sessions dormant" : ""}${d != null && h != null ? " · " : ""}${h != null ? Math.abs(h).toFixed(0) + "% under 52wk high" : ""}`,
      state: (cls === "monster" && d != null) ? (d >= 20 ? "good" : "bad") : "adds" }; } },
  H9: { short: "Catalyst", read: (s) => { const t = _tick(s, "catalyst"); if (!t) return null; const leg = s.checks?.young_leg;
    return { answer: "catalyst present", state: (leg === "2" || leg === "3") ? "adds" : "good" }; } },
  H10: { short: "Trend lifespan", distOnly: true, level: "campaign", read: (s) => { const a = s.checks?.legs_ma10, b = s.checks?.legs_ma20; if (!a && !b) return null;
    const nice = (v) => v === "5+" ? "5+ legs" : `${v} legs`;
    return { answer: `${a ? `${nice(a)} to the 10MA break` : ""}${a && b ? " · " : ""}${b ? `${nice(b)} to the 20MA` : ""}`, state: "adds" }; } },
  H11: { short: "Extension", read: (s) => { const e = _mnum(s, "ext_50ma"), p = _outNum(s, "ext_at_peak"); if (e == null && p == null) return null;
    return { answer: `${e != null ? `entered at ${e.toFixed(1)}×` : ""}${e != null && p != null ? " · " : ""}${p != null ? `peaked at ${p.toFixed(1)}×` : ""}`, state: e != null ? (e <= 4 ? "good" : "bad") : "adds" }; } },
  H12a: { short: "In-theme (thrust)", read: (s, ctx) => { const r = rotationAt(ctx?.ticker, ctx?.date); if (!r) return null;
    return { answer: `${r.groupName} #${r.rank} by thrust · in-theme ${r.inThemeThrust ? "✓" : "✗"}`, state: r.inThemeThrust ? "good" : "bad" }; } },
  H12b: { short: "Leader (RS)", read: (s, ctx) => { const r = rotationAt(ctx?.ticker, ctx?.date); if (!r) return null;
    return { answer: `group RS 1M = ${r.rs1m == null ? "—" : r.rs1m} · leader ${r.leaderRS ? "✓" : "✗"}`, state: r.leaderRS ? "good" : "bad" }; } },
  H13: { short: "Reversion (short)", distOnly: true, read: (s) => { const p = _outNum(s, "ext_at_peak"), d = _mnum(s, "drop_after_peak_5"); if (p == null && d == null) return null;
    return { answer: `${p != null ? `peaked at ${p.toFixed(1)}×` : ""}${p != null && d != null ? " · " : ""}${d != null ? `dropped ${d.toFixed(1)}% in 5d` : ""}`, state: "adds" }; } },
};
// Display metadata (Valen 2026-07-24): `title` = the one punchy plain-English sentence shown as BOTH the
// heat-table row text and the deep-dive modal title. `howTracked` / `verdictLine` = the modal's "how it's
// tracked" + "verdict logic" lines. No mentor names — doctrine/observed-prior wording only.
const HYP_META = {
  H1: { title: "The tighter a stock coils before it breaks out, the more explosive the move.",
    howTracked: "Eyeball 'tight' tick + the computed tight-days count (narrow-range days in the last 10). Per leg — read off the setup (BEFORE) chart.",
    verdictLine: "Supports when a tight-coil entry becomes a winner (or a loose one fails); challenges when a tight coil fails (or a loose one wins)." },
  H2: { title: "Breakouts from short coils (under ~10 days) work; long month-plus bases tend to fail.",
    howTracked: "Sub-tag on the tight tick — coil-length band (<10d / 10–20d / >20d). Per leg — off the BEFORE chart.",
    verdictLine: "Per-band win/loss split — the <10-day band should carry the higher winner share." },
  H3: { title: "Catch a trend early — the 1st and 2nd legs pay; by the 3rd leg you're on borrowed time.",
    howTracked: "Manual eyeball leg tag (1st / 2nd / 3rd). Per leg — judged off the chart, never auto-set.",
    verdictLine: "Per-band split — the 1st/2nd-leg bands should out-win the 3rd+." },
  H4: { title: "A second leg that only pulls back to the 10-day line, never the 20, is about to launch again.",
    howTracked: "Eyeball shallow-retrace tick + a depth sub-tag (10MA / 20MA / 50MA / deeper / no touch). Per leg — off the BEFORE chart.",
    verdictLine: "Per-band split — the 10MA-hold band should carry the higher winner share." },
  H5: { title: "The smaller the company, the bigger the % move — as long as it's still liquid enough to trade.",
    howTracked: "Computed: market cap at trigger, average $ volume, turnover %. Per leg — no chart needed.",
    verdictLine: "Descriptive distribution — per cap band, the median % move (smaller bands should show bigger moves). No pass/fail verdict." },
  H6: { title: "A real winner never gives back even half of its breakout day's gain.",
    howTracked: "Computed: did any low in days 2–5 dip below the day-1 midpoint. Per leg — no chart needed.",
    verdictLine: "Supports when a held-above-half entry wins (or an invaded one fails); challenges the reverse." },
  H7: { title: "If it hasn't followed through by day 3, it's dead — winners go bang-bang-bang.",
    howTracked: "Computed: new high above the day-1 high by day 2 or 3. Per leg — no chart needed.",
    verdictLine: "Supports when a follow-through entry wins (or a stall fails); challenges the reverse." },
  H8: { title: "The more ignored a stock is before it moves, the bigger the move tends to be.",
    howTracked: "Computed: sessions since the last 20%/5-day burst + how far under the 52-week high. Campaign-level (root leg only) — no chart needed.",
    verdictLine: "Among monsters, a long-dormant name supports; a monster with no dormancy challenges. Non-monsters just add data." },
  H9: { title: "A breakout from a range needs a catalyst to hold; without one it usually fails.",
    howTracked: "Eyeball catalyst tick (news/earnings ≤2 days before). Per leg — from the chart / notes.",
    verdictLine: "For range breakouts (1st legs): supports when a catalyst entry wins; continuation legs just add data." },
  H10: { title: "How many legs a trend prints before it finally closes below the 10- vs the 20-day line.",
    howTracked: "Whole-trend leg counts (10MA / 20MA) set on the root leg off the shared AFTER chart, plus computed sessions-to-first-close-below. Campaign-level.",
    verdictLine: "Descriptive distribution vs the leg-count prior — no pass/fail verdict." },
  H11: { title: "Enter fresh near the 50-day line; once a move stretches far past it, it's late — trim, don't chase.",
    howTracked: "Computed: extension-from-50MA at entry and at the burst peak (×ATR%). Per leg — no chart needed.",
    verdictLine: "Descriptive — entry bands split winners vs losers (fresh ≤4× should out-win); peak bands show where winners top out." },
  H12a: { title: "A setup whose sector is getting the money right now (top-5 by thrust) has better odds of working.",
    howTracked: "Computed at view time from the rotation engine — the group's thrust rank at the trigger. Per leg. Coverage limited to dated snapshots.",
    verdictLine: "Supports when an in-theme (top-5 thrust) entry wins (or an off-theme one fails); challenges the reverse." },
  H12b: { title: "A setup in a relative-strength-leader sector (RS 1-month ≥ 80) has better odds of working.",
    howTracked: "Computed at view time from the rotation engine — the group's 1-month RS at the trigger. Per leg. Coverage limited to dated snapshots.",
    verdictLine: "Supports when a leader-RS entry wins (or a laggard fails); challenges the reverse." },
  H13: { title: "When a move stretches to an extreme above the 50-day line, measure how hard it snaps back — that's the short.",
    howTracked: "Computed: peak extension (×ATR%) + max give-back over the next 5 / 10 sessions. Per leg — no chart needed.",
    verdictLine: "Descriptive distribution — per peak-extension band, the median snap-back. No pass/fail verdict." },
};
HYPOTHESES.forEach(h => Object.assign(h, HYP_READS[h.id] || {}, HYP_META[h.id] || {}));

// SINGLE SOURCE OF TRUTH — the per-entry verdict used by BOTH the strip and the tally table, so they
// can never disagree. Truth table: predicted-good state + winner ⇒ supports · good + failure ⇒ challenges
// · bad + failure ⇒ supports (failed as predicted) · bad + winner ⇒ challenges (won despite it). No
// resolved big-win/failure outcome, or a neutral/adds factor state ⇒ ⚪ (adds a data point / pending).
function entryVerdict(hyp, s, ctx) {
  if (!hyp.read) return null;
  const r = hyp.read(s, ctx); if (!r) return null; // ctx = {ticker, date} — only H12 uses it; others ignore
  const cls = outcomeClass(s), win = cls === "big winner" || cls === "monster", fail = cls === "failure";
  if (r.state === "adds" || r.state === "neutral")
    return { answer: r.answer, chip: "⚪", tone: "data", verb: r.state === "neutral" ? "neutral band — adds data" : "adds a data point", bucket: "data" };
  if (!win && !fail)
    return { answer: r.answer, chip: "⚪", tone: "data", verb: cls == null ? "outcome pending" : "neutral outcome — adds data", bucket: "data" };
  const supports = (r.state === "good" && win) || (r.state === "bad" && fail);
  return { answer: r.answer, chip: supports ? "🟢" : "🔴", tone: supports ? "supports" : "challenges", verb: supports ? "supports" : "challenges", bucket: supports ? "supports" : "challenges" };
}

// Per-entry strip — ADMIN-SIDE ONLY (📚 Studies + his personal 🔒 My Book rows). Hypothesis-first: what
// THIS ticker does to each hypothesis (proving or challenging). Source chips shown (admin — provenance).
export function HypothesisRead({ C, study, ticker, date }) {
  if (!study) return null;
  const ctx = { ticker, date }; // enables the H12 rotation lens (per-entry) where date matches a snapshot
  const lines = HYPOTHESES.map(h => { const v = entryVerdict(h, study, ctx); return v ? { h, ...v } : null; }).filter(Boolean);
  if (!lines.length) return null;
  const toneColor = (t) => t === "supports" ? "#7ef0a0" : t === "challenges" ? "#e05555" : C.muted;
  const chip = (source) => { const gold = source === "DOCTRINE"; return { border: `1px solid ${gold ? C.goldBright : C.blue}`, color: gold ? C.goldBright : C.blue, background: gold ? C.goldDim : C.blueDim, borderRadius: 99, fontSize: "0.5rem", fontWeight: 800, letterSpacing: ".06em", padding: "1px 6px", whiteSpace: "nowrap" }; };
  return (
    <div style={{ border: `1px solid ${C.borderGold}`, borderRadius: 12, padding: "11px 13px", background: "rgba(0,0,0,0.22)", marginBottom: 12 }}>
      <div style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.goldBright, marginBottom: 9 }}>🧪 What this study says about the hypotheses</div>
      <div style={{ display: "grid", gap: 6 }}>
        {lines.map(({ h, answer, chip: ch, tone, verb }) => (
          <div key={h.id} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: "0.73rem", lineHeight: 1.4, flexWrap: "wrap" }}>
            <span style={{ flex: "none", fontSize: "0.82rem" }}>{ch}</span>
            <b style={{ flex: "none", color: C.white }}>{h.short}</b>
            <span style={{ flex: 1, color: C.text, minWidth: 130 }}>{answer}</span>
            <span style={chip(h.source)}>{h.source}</span>
            <span style={{ flex: "none", fontWeight: 700, color: toneColor(tone) }}>→ {verb}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Live readout for a binary-predicate hypothesis over resolved winners/failures.
function hypBinary(hyp, winners, fails) {
  // pass the whole point (x = {s, ticker, date, …}) as ctx so H12's rotation test can read ticker/date.
  const mWin = winners.filter(x => hyp.test(x.s, x) !== null), mFail = fails.filter(x => hyp.test(x.s, x) !== null);
  const wT = mWin.filter(x => hyp.test(x.s, x) === true), fT = mFail.filter(x => hyp.test(x.s, x) === true);
  const pW = mWin.length ? wT.length / mWin.length : 0, pF = mFail.length ? fT.length / mFail.length : 0;
  const E = (winners.length - mWin.length) + (fails.length - mFail.length);
  return { mWin, mFail, wT: wT.length, fT: fT.length, pW, pF, lift: pF > 0 ? pW / pF : (pW > 0 ? Infinity : 0),
    enough: mWin.length >= 5 && mFail.length >= 5, W: mWin.length, F: mFail.length, E, list: [...mWin, ...mFail] };
}
// Per-option readout for a subcat hypothesis (pool = studies whose setup carries the parent tick,
// the parent is ticked, and the sub-band is set). Un-set band among ticked parents = excluded blank.
function hypSubcat(hyp, winners, fails) {
  const sub = SUBCATS[hyp.parent];
  const inPool = (x) => { const s = x.s; return _setupHasTick(s, hyp.parent) && !!s.checks?.[hyp.parent] && s.checks?.[sub.store] != null && s.checks?.[sub.store] !== ""; };
  const blank = (x) => { const s = x.s; return _setupHasTick(s, hyp.parent) && !!s.checks?.[hyp.parent] && (s.checks?.[sub.store] == null || s.checks?.[sub.store] === ""); };
  const pWin = winners.filter(inPool), pFail = fails.filter(inPool);
  const enough = pWin.length >= 5 && pFail.length >= 5;
  const rows = sub.options.map(([val, label]) => {
    const w = pWin.filter(x => String(x.s.checks[sub.store]) === val), f = pFail.filter(x => String(x.s.checks[sub.store]) === val);
    const pW = pWin.length ? w.length / pWin.length : 0, pF = pFail.length ? f.length / pFail.length : 0;
    return { val, label, wc: w.length, fc: f.length, lift: pF > 0 ? pW / pF : (pW > 0 ? Infinity : 0) };
  });
  const E = winners.filter(blank).length + fails.filter(blank).length;
  return { sub, rows, enough, W: pWin.length, F: pFail.length, E, list: [...pWin, ...pFail] };
}

// Campaign dedup helpers (module scope so both the panel table AND the deep-dive modal share them).
const hypForLevel = (list, hyp) => hyp.level === "campaign" ? list.filter(x => x.root) : list;
const hypCampCount = (list) => new Set(list.map(x => x.cid)).size;
// Row heat (mirrors the rotation-breadth heat convention): color by support ratio, GATED on sample size so
// a 2-vote row never reads green. <8 usable votes ⇒ muted "collecting"; else opacity scales with distance
// from 0.5. Distribution-only hypotheses are handled by the caller (neutral slate, never a green/red verdict).
function hypHeat(supports, challenges, C) {
  const usable = supports + challenges;
  if (usable < 8) return { bg: "transparent", fg: C.muted, verdict: `collecting — ${usable}/30`, weak: true };
  const r = supports / usable, d = Math.abs(r - 0.5) * 2, op = (0.12 + d * 0.30).toFixed(2), pct = Math.round(r * 100);
  if (r >= 0.70) return { bg: `rgba(34,197,94,${op})`, fg: "#7ef0a0", verdict: `supports · ${pct}%` };
  if (r >= 0.55) return { bg: `rgba(34,197,94,${op})`, fg: "#7ef0a0", verdict: `leans support · ${pct}%` };
  if (r > 0.45) return { bg: "rgba(224,169,85,0.12)", fg: "#e0a955", verdict: `contested · ${pct}%` };
  if (r > 0.30) return { bg: `rgba(239,68,68,${op})`, fg: "#e05555", verdict: `leans against · ${pct}%` };
  return { bg: `rgba(239,68,68,${op})`, fg: "#e05555", verdict: `against · ${pct}%` };
}

// ── The FULL live readout for ONE hypothesis (Valen 2026-07-24) — relocated from the old always-visible
// cards into the deep-dive modal. Header (title/thesis/points) is rendered by the modal shell; this is the
// readout only. Module scope + own expand state (never a component nested in a component). ──
export function HypReadout({ C, hyp, winners, fails, allStudies }) {
  const [open, setOpen] = useState(null);
  const liftColor = (l) => l >= 2 ? "#7ef0a0" : l < 0.7 ? "#e05555" : C.muted;
  const outLabel = (s) => MB_OUTCOME[outcomeClass(s)] || outcomeClass(s);
  const outColor = (s) => outcomeClass(s) === "failure" ? "#e05555" : "#7ef0a0";
  const expandList = (list, valFn) => (
    <div style={{ marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8, maxHeight: 240, overflowY: "auto" }}>
      {list.length === 0 ? <div style={{ fontSize: "0.66rem", color: C.muted }}>No studies counted yet.</div> :
        [...list].sort((a, b) => (["big winner", "monster"].includes(outcomeClass(b.s)) ? 1 : 0) - (["big winner", "monster"].includes(outcomeClass(a.s)) ? 1 : 0)).map((x, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: "0.68rem", borderBottom: i === list.length - 1 ? "none" : "1px solid rgba(255,255,255,0.04)" }}>
            <span style={{ width: 56, flex: "none", fontWeight: 800, color: C.white }}>{x.ticker}</span>
            <span style={{ width: 88, flex: "none", color: C.muted, fontSize: "0.62rem" }}>{x.date}</span>
            <span style={{ flex: 1, color: C.text }}>{valFn(x.s, x)}</span>
            <span style={{ flex: "none", fontWeight: 700, color: outColor(x.s), fontSize: "0.62rem" }}>{outLabel(x.s)}</span>
          </div>
        ))}
    </div>
  );
  // ── H10 distribution — leg-count histogram vs prior, MA10 & MA20 side by side ──
  if (hyp.kind === "distribution") {
    const base = hypForLevel(allStudies, hyp);
    const dists = hyp.stores.map(([store, maLabel]) => ({ store, maLabel, ...legDist(store, hyp.bands, base) }));
    const med10 = medianCompanion(base, "d_below_ma10", "ma10_censored");
    const med20 = medianCompanion(base, "d_below_ma20", "ma20_censored");
    const distBox = { flex: "1 1 240px", minWidth: 220, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", background: "rgba(0,0,0,0.25)" };
    return (
      <div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {dists.map(d => (
            <div key={d.store} style={distBox}>
              <div style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.goldBright, marginBottom: 7 }}>Legs to first close below {d.maLabel} · n={d.n}</div>
              {hyp.bands.map(b => {
                const c = d.counts[b], pct = d.n ? Math.round(c / d.n * 100) : 0, prior = hyp.priorDist[b];
                return (
                  <div key={b} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.7rem", padding: "2px 0" }}>
                    <span style={{ width: 26, flex: "none", color: C.text, fontWeight: 700 }}>{b}</span>
                    <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: C.goldBright }} /></div>
                    <span style={{ width: 66, flex: "none", textAlign: "right", color: C.muted, fontSize: "0.64rem" }}>{c} · {pct}%</span>
                    <span style={{ width: 58, flex: "none", textAlign: "right", color: "rgba(255,255,255,0.32)", fontSize: "0.6rem" }} title="Doctrine prior — the reference distribution, not measured data">{prior == null ? "prior —" : `prior ${prior}%`}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ fontSize: "0.66rem", color: C.text, marginTop: 9 }}>
          Median sessions to first close below MA — <b style={{ color: C.goldBright }}>10MA {med10.med == null ? "—" : med10.med}</b> (n={med10.n}, {med10.cens} censored) · <b style={{ color: C.goldBright }}>20MA {med20.med == null ? "—" : med20.med}</b> (n={med20.n}, {med20.cens} censored)
        </div>
        <div style={{ fontSize: "0.6rem", color: C.muted, marginTop: 6, letterSpacing: ".01em" }}>
          n={hypCampCount(base)} campaigns (leg-lifespan is whole-trend — counted once per campaign, root leg) · {dists[0].n}/{dists[1].n} measured (10MA/20MA) · {dists[0].blank}/{dists[1].blank} blank · censored shown separately — believe nothing &lt;30, promote at 50
        </div>
        <div onClick={() => setOpen(open === hyp.id ? null : hyp.id)} style={{ cursor: "pointer", fontSize: "0.64rem", color: C.goldBright, marginTop: 6 }}>{open === hyp.id ? "▴ hide the studies counted" : "▾ show the studies counted"}</div>
        {open === hyp.id && (() => {
          const withLegs = base.filter(x => (x.s.checks?.legs_ma10 ?? "") !== "" || (x.s.checks?.legs_ma20 ?? "") !== "");
          return (
            <div style={{ marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8, maxHeight: 240, overflowY: "auto" }}>
              {withLegs.length === 0 ? <div style={{ fontSize: "0.66rem", color: C.muted }}>No leg counts recorded yet.</div> :
                withLegs.map((x, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: "0.68rem", borderBottom: i === withLegs.length - 1 ? "none" : "1px solid rgba(255,255,255,0.04)" }}>
                    <span style={{ width: 56, flex: "none", fontWeight: 800, color: C.white }}>{x.ticker}</span>
                    <span style={{ width: 88, flex: "none", color: C.muted, fontSize: "0.62rem" }}>{x.date}</span>
                    <span style={{ flex: 1, color: C.text }}>10MA: <b style={{ color: C.goldBright }}>{x.s.checks?.legs_ma10 || "—"}</b> legs · 20MA: <b style={{ color: C.goldBright }}>{x.s.checks?.legs_ma20 || "—"}</b> legs</span>
                  </div>
                ))}
            </div>
          );
        })()}
      </div>
    );
  }
  // ── H11 extension — ENTRY winners/failures per band + EXIT peak distribution ──
  if (hyp.kind === "extension") {
    const en = extEntry(hyp.bands, hyp.entryKey, hypForLevel(winners, hyp), hypForLevel(fails, hyp));
    const px = extPeakDist(hyp.bands, hyp.peakKey, hypForLevel(winners, hyp));
    const half = { flex: "1 1 260px", minWidth: 240, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", background: "rgba(0,0,0,0.25)" };
    const exitOpen = open === `${hyp.id}-x`;
    return (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={half}>
          <div style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.goldBright, marginBottom: 7 }}>Entry ext (×ATR% from 50MA) — winners vs losers</div>
          {en.rows.map(row => {
            const rowOpen = open === `${hyp.id}-e-${row.band}`;
            return (
              <div key={row.band}>
                <div onClick={() => setOpen(rowOpen ? null : `${hyp.id}-e-${row.band}`)} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: "0.7rem", padding: "3px 0" }}>
                  <span style={{ width: 44, flex: "none", color: C.text, fontWeight: 700 }}>{row.band}</span>
                  <span style={{ flex: 1, color: C.muted, fontSize: "0.66rem" }}>{row.wc}W · {row.fc}F</span>
                  <b style={{ width: 52, flex: "none", textAlign: "right", fontWeight: 800, color: en.enough ? liftColor(row.lift) : C.muted }}>{en.enough ? (row.lift === Infinity ? "∞" : row.lift.toFixed(2) + "×") : "·"}</b>
                  <span style={{ flex: "none", color: C.muted, fontSize: "0.62rem" }}>{rowOpen ? "▴" : "▾"}</span>
                </div>
                {rowOpen && expandList(row.list, s => { const v = s.m?.[hyp.entryKey]; return v == null || v === "" ? "—" : `${(+v).toFixed(2)}× at entry`; })}
              </div>
            );
          })}
          {!en.enough && <div style={{ fontSize: "0.66rem", color: "#e0a955", marginTop: 6 }}>collecting — n={en.W + en.F} of 30</div>}
          <div style={{ fontSize: "0.6rem", color: C.muted, marginTop: 6 }}>n={en.W} winners / {en.F} losers / {en.E} excluded blank across {hypCampCount(en.rows.flatMap(r => r.list))} campaigns — believe nothing &lt;30, promote at 50</div>
        </div>
        <div style={half}>
          <div style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.goldBright, marginBottom: 7 }}>Where winners topped — the trim band · n={px.n}</div>
          {hyp.bands.map(band => { const c = px.counts[band], pct = px.n ? Math.round(c / px.n * 100) : 0;
            return (
              <div key={band} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.7rem", padding: "2px 0" }}>
                <span style={{ width: 44, flex: "none", color: C.text, fontWeight: 700 }}>{band}</span>
                <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: band === "≥7×" ? "#7ef0a0" : C.goldBright }} /></div>
                <span style={{ width: 66, flex: "none", textAlign: "right", color: C.muted, fontSize: "0.64rem" }}>{c} · {pct}%</span>
              </div>
            ); })}
          <div style={{ fontSize: "0.66rem", color: C.text, marginTop: 7 }}>Median winner peak ext — <b style={{ color: C.goldBright }}>{px.med == null ? "—" : px.med.toFixed(2) + "×"}</b></div>
          <div style={{ fontSize: "0.6rem", color: C.muted, marginTop: 4 }}>n={px.n} winners with peak ext / {px.blank} excluded blank across {hypCampCount(px.set)} campaigns — believe nothing &lt;30, promote at 50</div>
          <div onClick={() => setOpen(exitOpen ? null : `${hyp.id}-x`)} style={{ cursor: "pointer", fontSize: "0.64rem", color: C.goldBright, marginTop: 6 }}>{exitOpen ? "▴ hide the winners counted" : "▾ show the winners counted"}</div>
          {exitOpen && expandList(px.set, s => { const v = s.outcome?.[hyp.peakKey]; return v == null || v === "" ? "—" : `${(+v).toFixed(2)}× at peak`; })}
        </div>
      </div>
    );
  }
  // ── H5 / H13 band × move-size distribution ──
  if (hyp.kind === "bandmove") {
    const base = hypForLevel(allStudies, hyp);
    const bs = bandStats(base, hyp);
    const fmts = hyp.fmts || hyp.cols.map(() => _pct);
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.54rem", fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: C.muted, padding: "2px 0 5px" }}>
          <span style={{ width: 78, flex: "none" }}>Band</span>
          <span style={{ width: 30, flex: "none", textAlign: "right" }}>n</span>
          <div style={{ flex: 1 }} />
          {hyp.cols.map(([lab], ci) => <span key={ci} style={{ width: 92, flex: "none", textAlign: "right" }}>{lab}</span>)}
          <span style={{ width: 14, flex: "none" }} />
        </div>
        {bs.perBand.map(pb => {
          const barVal = pb.meds[bs.barCol], pct = Math.round(Math.abs(barVal ?? 0) / bs.maxBar * 100), bandOpen = open === `${hyp.id}-b-${pb.band}`;
          return (
            <div key={pb.band}>
              <div onClick={() => pb.n && setOpen(bandOpen ? null : `${hyp.id}-b-${pb.band}`)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.7rem", padding: "3px 0", cursor: pb.n ? "pointer" : "default" }}>
                <span style={{ width: 78, flex: "none", color: C.text, fontWeight: 700 }}>{pb.band}</span>
                <span style={{ width: 30, flex: "none", textAlign: "right", color: C.muted, fontSize: "0.64rem" }}>{pb.n}</span>
                <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: (barVal ?? 0) < 0 ? "#e05555" : C.goldBright }} /></div>
                {pb.meds.map((m, ci) => <span key={ci} style={{ width: 92, flex: "none", textAlign: "right", color: ci === bs.barCol ? C.white : C.muted, fontWeight: ci === bs.barCol ? 700 : 400, fontSize: "0.66rem" }}>{fmts[ci](m)}</span>)}
                <span style={{ width: 14, flex: "none", color: C.muted, fontSize: "0.6rem" }}>{pb.n ? (bandOpen ? "▴" : "▾") : ""}</span>
              </div>
              {bandOpen && expandList(pb.items, hyp.expand)}
            </div>
          );
        })}
        <div style={{ fontSize: "0.6rem", color: C.muted, marginTop: 7, letterSpacing: ".01em" }}>
          n={bs.set.length} measured across {hypCampCount(bs.set)} campaigns · {bs.excluded} excluded ({hyp.excludedLabel || "blank"}) — believe nothing &lt;30, promote at 50
        </div>
      </div>
    );
  }
  // ── H1/H3/H4… binary lift + subcat split ──
  const isSub = hyp.kind === "subcat";
  const lw = hypForLevel(winners, hyp), lf = hypForLevel(fails, hyp);
  const r = isSub ? hypSubcat(hyp, lw, lf) : hypBinary(hyp, lw, lf);
  const measured = r.W + r.F, cardCamps = hypCampCount(r.list);
  return (
    <div>
      {isSub ? (
        <div>
          <div style={{ display: "grid", gap: 2 }}>
            {r.rows.map(row => (
              <div key={row.val} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.7rem", padding: "3px 0" }}>
                <span style={{ width: 92, flex: "none", color: C.text }}>{row.label}</span>
                <span style={{ flex: 1, color: C.muted, fontSize: "0.66rem" }}>{row.wc}W · {row.fc}F</span>
                <b style={{ width: 52, flex: "none", textAlign: "right", fontWeight: 800, color: r.enough ? liftColor(row.lift) : C.muted }}>{r.enough ? (row.lift === Infinity ? "∞" : row.lift.toFixed(2) + "×") : "·"}</b>
              </div>
            ))}
          </div>
          {!r.enough && <div style={{ fontSize: "0.66rem", color: "#e0a955", marginTop: 6 }}>collecting — n={measured} of 30</div>}
        </div>
      ) : (
        <div onClick={() => setOpen(open === hyp.id ? null : hyp.id)} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: "0.72rem", padding: "4px 0" }}>
          <span style={{ flex: 1, color: C.text }}>Winners <b style={{ color: C.white }}>{r.wT}/{r.W}</b> have it · Losers <b style={{ color: C.white }}>{r.fT}/{r.F}</b> have it</span>
          {r.enough
            ? <b style={{ flex: "none", fontWeight: 800, color: liftColor(r.lift) }}>{r.lift === Infinity ? "∞" : r.lift.toFixed(2)}× lift</b>
            : <span style={{ flex: "none", color: "#e0a955", fontSize: "0.68rem" }}>collecting — n={measured} of 30</span>}
          <span style={{ flex: "none", color: C.muted, fontSize: "0.7rem" }}>{open === hyp.id ? "▴" : "▾"}</span>
        </div>
      )}
      <div style={{ fontSize: "0.6rem", color: C.muted, marginTop: 6, letterSpacing: ".01em" }}>
        {hyp.level === "campaign"
          ? `n=${cardCamps} campaigns (deduped to root leg) · ${r.W}W / ${r.F}F / ${r.E} blank — believe nothing <30, promote at 50`
          : `n=${r.W} winners / ${r.F} losers / ${r.E} excluded blank across ${cardCamps} campaigns — believe nothing <30, promote at 50`}
      </div>
      {isSub
        ? <div onClick={() => setOpen(open === hyp.id ? null : hyp.id)} style={{ cursor: "pointer", fontSize: "0.64rem", color: C.goldBright, marginTop: 6 }}>{open === hyp.id ? "▴ hide the studies counted" : "▾ show the studies counted"}</div>
        : null}
      {open === hyp.id && expandList(r.list, isSub ? (s => (SUBCATS[hyp.parent].options.find(([v]) => String(s.checks?.[SUBCATS[hyp.parent].store]) === v)?.[1]) || "—") : hyp.value)}
    </div>
  );
}

export function StudyHypotheses({ C, rows }) {
  const [era, setEra] = React.useState("all"); // "all" | "new" — one filter applied at the top of the data flow
  const [modalId, setModalId] = React.useState(null); // hypothesis id whose deep-dive modal is open
  // ONE era filter feeds the entire panel (table + modal readout). Trigger date = row.entry_date.
  const inEra = (r) => era === "all" || String(r.entry_date || "") >= H_ERA_START;
  const eraRows = (rows || []).filter(inEra);
  // Campaign structure from ALL rows (era-stable) so root identity never flips with the filter.
  const campById = buildCampaigns(rows).byId;
  const mapPt = (r) => { const c = campById[r.id] || {}; return { s: r.metrics.study, ticker: r.ticker, date: r.entry_date, cid: c.campaign_id || `solo:${r.id}`, root: c.isRoot !== false }; };
  const resolved = eraRows.filter(r => r.metrics?.study && outcomeClass(r.metrics.study)).map(mapPt);
  const winners = resolved.filter(x => ["big winner", "monster"].includes(outcomeClass(x.s)));
  const fails = resolved.filter(x => outcomeClass(x.s) === "failure");
  const allStudies = eraRows.filter(r => r.metrics?.study).map(mapPt);
  const totalCamps = hypCampCount(allStudies);
  const srcChip = (source) => { const gold = source === "DOCTRINE";
    return { border: `1px solid ${gold ? C.goldBright : C.blue}`, color: gold ? C.goldBright : C.blue,
      background: gold ? C.goldDim : C.blueDim, borderRadius: 99, fontSize: "0.52rem", fontWeight: 800, letterSpacing: ".08em", padding: "1px 7px", whiteSpace: "nowrap", flex: "none" }; };
  const sheen = { position: "absolute", inset: 0, pointerEvents: "none", borderRadius: 16, background: "linear-gradient(135deg, rgba(255,255,255,0.05), transparent 55%)" };
  // Per-hypothesis verdict counts — the SAME shared entryVerdict + campaign dedup used everywhere.
  const rowsData = HYPOTHESES.map(h => {
    let supports = 0, challenges = 0, data = 0; const camps = new Set();
    hypForLevel(allStudies, h).forEach(x => { const v = entryVerdict(h, x.s, x); if (!v) return; camps.add(x.cid);
      if (v.bucket === "supports") supports++; else if (v.bucket === "challenges") challenges++; else data++; });
    return { h, supports, challenges, data, camps: camps.size, n: supports + challenges };
  });
  const modalHyp = modalId ? HYPOTHESES.find(h => h.id === modalId) : null;
  return (
    <div style={{ position: "relative", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 16, padding: "18px 20px", marginBottom: 16, backdropFilter: "blur(24px) saturate(150%)", WebkitBackdropFilter: "blur(24px) saturate(150%)" }}>
      <div style={sheen} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 11, marginBottom: 12, borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <span style={{ flex: 1, fontSize: "0.62rem", fontWeight: 700, letterSpacing: ".13em", textTransform: "uppercase", color: C.muted }}>🧪 Hypotheses</span>
        <span style={{ fontSize: "0.6rem", color: C.muted }}>{resolved.length} resolved · {winners.length}W / {fails.length}F · {totalCamps} campaign{totalCamps === 1 ? "" : "s"}</span>
        <div style={{ display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 99, overflow: "hidden" }}>
          {[["all", "All studies"], ["new", `From ${H_ERA_START}`]].map(([val, label]) => (
            <button key={val} type="button" onClick={() => setEra(val)}
              style={{ background: era === val ? `linear-gradient(135deg,${C.goldBright},${C.goldMid})` : "transparent", color: era === val ? "#08080e" : C.muted, border: "none", fontFamily: "inherit", fontSize: "0.58rem", fontWeight: 800, letterSpacing: ".04em", padding: "4px 11px", cursor: "pointer" }}>{label}</button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: "0.6rem", color: C.muted, marginBottom: 12 }}>Blank fields never vote — old studies only count where the data is real. Click any row for the deep dive.</div>
      {/* ── Clean heat table — one row per hypothesis, colored by support-vs-against ratio (gated on sample
          size so a thin sample never reads green). Click a row → the full deep-dive modal. ── */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: "rgba(255,255,255,0.03)", fontSize: "0.52rem", fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: C.muted }}>
          <span style={{ flex: 1, minWidth: 0 }}>Hypothesis</span>
          <span style={{ width: 34, flex: "none", textAlign: "center" }}>🟢</span>
          <span style={{ width: 34, flex: "none", textAlign: "center" }}>🔴</span>
          <span style={{ width: 34, flex: "none", textAlign: "center" }}>⚪</span>
          <span style={{ width: 28, flex: "none", textAlign: "center" }}>n</span>
          <span style={{ width: 116, flex: "none", textAlign: "right" }}>Verdict</span>
        </div>
        {rowsData.map(t => {
          const dist = !!t.h.distOnly;
          const heat = dist ? null : hypHeat(t.supports, t.challenges, C);
          const rowBg = dist ? "rgba(148,163,184,0.06)" : (heat.weak ? "transparent" : heat.bg);
          const verdictTxt = dist ? "distribution — open to view" : heat.verdict;
          const verdictCol = dist ? "#94a3b8" : heat.fg;
          return (
            <div key={t.h.id} onClick={() => setModalId(t.h.id)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderTop: `1px solid ${C.border}`, background: rowBg, fontSize: "0.72rem", cursor: "pointer", transition: "filter .12s" }}
              onMouseEnter={e => e.currentTarget.style.filter = "brightness(1.28)"} onMouseLeave={e => e.currentTarget.style.filter = "none"}>
              <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap", color: C.text, lineHeight: 1.35 }}>
                <span style={{ fontSize: "0.5rem", fontWeight: 800, color: C.muted, letterSpacing: ".04em" }}>{t.h.id}</span>
                <span style={{ fontWeight: 600, color: C.white }}>{t.h.title || t.h.claim}</span>
                <span style={srcChip(t.h.source)}>{t.h.source}</span>
              </span>
              <span style={{ width: 34, flex: "none", textAlign: "center", fontWeight: 800, color: dist ? C.muted : (t.supports ? "#7ef0a0" : "rgba(255,255,255,0.25)") }}>{dist ? "—" : t.supports}</span>
              <span style={{ width: 34, flex: "none", textAlign: "center", fontWeight: 800, color: dist ? C.muted : (t.challenges ? "#e05555" : "rgba(255,255,255,0.25)") }}>{dist ? "—" : t.challenges}</span>
              <span style={{ width: 34, flex: "none", textAlign: "center", fontWeight: 800, color: t.data ? C.muted : "rgba(255,255,255,0.25)" }}>{t.data}</span>
              <span title={`${t.h.level === "campaign" ? "campaign-level — deduped to root leg · " : ""}${t.camps} campaign${t.camps === 1 ? "" : "s"} in the sample`} style={{ width: 28, flex: "none", textAlign: "center", color: C.muted, fontSize: "0.66rem", cursor: "help" }}>{dist ? t.data : t.n}</span>
              <span style={{ width: 116, flex: "none", textAlign: "right", fontWeight: 700, color: verdictCol, fontSize: "0.62rem" }}>{verdictTxt}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: "0.58rem", color: C.muted, marginTop: 8 }}><b style={{ color: C.goldBright }}>DOCTRINE</b> = an observed prior · <b style={{ color: C.blue }}>MINE</b> = Valen's own read · green = supports, red = challenges (colored only past 8 resolved votes), slate = descriptive distribution.</div>

      {/* ── Deep-dive modal (blurred backdrop; closes on backdrop click only; inside clicks don't). Portaled
          to body to escape the panel's backdrop-filter stacking context. z 1300 (above editor 1250, below
          the chart lightbox 1400). Esc is left to the lightbox — not bound here. ── */}
      {modalHyp && createPortal(
        <div onClick={e => { if (e.target === e.currentTarget) setModalId(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 1300, background: "rgba(4,4,8,0.6)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", overflowY: "auto", padding: "5vh 4vw", display: "flex", justifyContent: "center", alignItems: "flex-start" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: "min(840px,100%)", background: "linear-gradient(180deg, rgba(18,18,26,0.96), rgba(8,8,14,0.98))", border: `1px solid ${C.borderGold}`, borderRadius: 18, padding: "20px 22px", boxShadow: "0 40px 100px rgba(0,0,0,0.72)" }}>
            {(() => {
              const h = modalHyp, mine = h.source === "MINE";
              return (<>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: "0.56rem", fontWeight: 800, color: C.muted, letterSpacing: ".06em", marginTop: 6 }}>{h.id}</span>
                  <span style={{ flex: 1, fontSize: "1.02rem", fontWeight: 800, color: C.white, lineHeight: 1.35 }}>{h.title || h.claim}</span>
                  <span style={srcChip(h.source)}>{h.source}</span>
                  <button onClick={() => setModalId(null)} style={{ flex: "none", background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.muted, width: 30, height: 30, borderRadius: 9, fontSize: "1.05rem", cursor: "pointer", lineHeight: 1 }} aria-label="Close">×</button>
                </div>
                <div style={{ fontSize: "0.62rem", color: mine ? C.blue : C.goldBright, fontWeight: 700, marginBottom: 14 }}>{mine ? "MINE — Valen's own observed prior" : "DOCTRINE — an observed prior from the corpus"}</div>

                <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.goldBright, marginBottom: 6 }}>The thesis</div>
                <div style={{ fontSize: "0.82rem", color: C.text, lineHeight: 1.55, marginBottom: h.caption ? 6 : 16 }}>{h.prior}</div>
                {h.caption && <div style={{ fontSize: "0.66rem", color: "rgba(255,255,255,0.5)", fontStyle: "italic", marginBottom: 16 }}>{h.caption}</div>}

                <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.goldBright, marginBottom: 6 }}>How it's tracked</div>
                <div style={{ display: "grid", gap: 3, marginBottom: 6 }}>
                  {h.points.map(([lab, meaning], i) => (
                    <div key={i} style={{ fontSize: "0.72rem", color: C.text, lineHeight: 1.4 }}><b style={{ color: C.goldBright }}>{lab}</b> <span style={{ color: C.muted }}>— {meaning}</span></div>
                  ))}
                </div>
                {h.howTracked && <div style={{ fontSize: "0.68rem", color: C.muted, lineHeight: 1.5, marginBottom: 16 }}>{h.howTracked}</div>}

                <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.goldBright, marginBottom: 6 }}>Verdict logic</div>
                <div style={{ fontSize: "0.72rem", color: C.text, lineHeight: 1.5, marginBottom: 16 }}>{h.verdictLine || "Supports when the predicted-good state coincides with a winner; challenges when it doesn't."}</div>

                <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.goldBright, marginBottom: 8 }}>The live readout</div>
                <HypReadout C={C} hyp={h} winners={winners} fails={fails} allStudies={allStudies} />
              </>);
            })()}
          </div>
        </div>, document.body)}
    </div>
  );
}

export function StudyEditor({ C, font, busy, initial, onSave, onCancel, onUpload, campaignRows }) {
  const [row, setRow] = useState(() => ({
    ticker: "", entry_date: "", before_img: "", after_img: "", thesis: "", lesson: "",
    ticked: [], elite: [], characteristics: [], is_published: false,
    ...(initial || {}),
    // outcome_img is a VIRTUAL slot (no DB column) — lives in metrics.study.outcome_img; lifted
    // to top level here so chartSlot/uploadImg/zoom treat all three charts identically.
    outcome_img: initial?.metrics?.study?.outcome_img || "",
    trigger_ltf_img: initial?.metrics?.study?.trigger_ltf_img || "", // 4th virtual slot: trigger-day 5-min entry detail (Valen 2026-07-17)
    metrics: { ...(initial?.metrics || {}), study: initial?.metrics?.study || {
      setup: "Momentum Breakout", direction: "long", regime_tag: "",
      checks: {}, m: {}, grade: { letter: "" }, outcome: {}, refusal: "",
    } },
  }));
  const s = row.metrics.study;
  const setS = (patch) => setRow(r => ({ ...r, metrics: { ...r.metrics, study: { ...r.metrics.study, ...patch } } }));
  const def = STUDY_SETUPS[s.setup] || STUDY_SETUPS["Momentum Breakout"];
  // ── Campaign context (Valen 2026-07-24): legs of one trend share campaign_id. leg_index is STRUCTURAL
  // (recomputed from the sorted siblings, never stored). campaign-level fields (leg lifespan + shared AFTER
  // chart) are editable on the ROOT leg only; other legs show them read-only. Solo (no campaign_id) = root. */
  const cid = s.campaign_id || null;
  const sibs = cid ? (campaignRows || []).filter(r => r.metrics?.study?.campaign_id === cid)
    .sort((a, b) => String(a.entry_date || "").localeCompare(String(b.entry_date || "")) || String(a.id).localeCompare(String(b.id))) : [];
  const idxInSibs = sibs.findIndex(r => r.id === row.id);
  const legIdx = !cid ? 1 : (idxInSibs >= 0 ? idxInSibs + 1 : sibs.length + 1); // new child appends
  const isRoot = !cid || (sibs.length ? idxInSibs === 0 : true);
  const rootStudy = (cid && sibs.length) ? sibs[0].metrics.study : s;
  const multiLeg = !!cid && sibs.length > 1;
  const inputS = { background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, fontFamily: font, fontSize: "0.78rem", padding: "7px 10px", outline: "none", width: "100%", colorScheme: "dark" };
  const lbl = { fontSize: "0.58rem", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: C.muted, marginBottom: 4, display: "block" };
  const sect = { fontSize: "0.6rem", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: C.goldBright, margin: "14px 0 8px" };
  const cls = outcomeClass(s);
  // ── click-to-zoom lightbox: click any chart to enlarge, ←/→ cycles Context→BEFORE→AFTER, Esc closes ──
  const [zoom, setZoom] = useState(null); // null | "before_img" | "after_img" | "outcome_img"
  const [showAll, setShowAll] = useState(false); // raw computed-metrics grid folded by default (Valen 2026-07-24) — key strip stays
  const SLOT_TITLES = { before_img: "CONTEXT — HTF", after_img: "BEFORE — the setup", outcome_img: "AFTER — the outcome", trigger_ltf_img: "TRIGGER — 5-min entry detail" };
  const zoomSlots = ["before_img", "after_img", "trigger_ltf_img", "outcome_img"].filter(k => row[k]); // only attached charts
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e) => {
      if (e.key === "Escape") { setZoom(null); return; }
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && zoomSlots.length > 1) {
        e.preventDefault();
        setZoom(z => { const i = zoomSlots.indexOf(z); return zoomSlots[(i + (e.key === "ArrowRight" ? 1 : -1) + zoomSlots.length) % zoomSlots.length]; });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, zoomSlots.length]);
  // ── Point-in-time cap + ADR% badge (Valen 2026-07-17): top-right of every study chart.
  // mcap_t = SEC shares (newest filing ≤ trigger) × trigger close, computed by study-fill;
  // blank = not measured, never guessed. "≈" marks the cap as filing-interval approximate.
  const capBadge = (() => {
    const cap = +(s.m?.mcap_t || 0), adr = s.m?.adr20;
    const parts = [];
    if (cap > 0) parts.push("≈" + (cap >= 1e9 ? "$" + (cap / 1e9).toFixed(1) + "B" : "$" + Math.round(cap / 1e6) + "M"));
    if (adr != null && adr !== "" && !Number.isNaN(+adr)) parts.push("ADR " + (+adr).toFixed(1) + "%");
    return parts.length ? { text: parts.join(" · "), tip: `At the trigger date — cap from SEC shares outstanding (${s.m?.mcap_asof || "n/a"}), ADR20 from the 20 sessions before the trigger.` } : null;
  })();
  const badgeStyle = { position: "absolute", top: 6, right: 6, zIndex: 2, background: "rgba(8,8,14,0.82)", border: `1px solid ${C.borderGold}`, color: C.goldBright, fontFamily: font, fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.04em", padding: "3px 8px", borderRadius: 7, whiteSpace: "nowrap", cursor: "help", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" };
  const chartSlot = (slot, title, hint) => (
    <div style={{ flex: 1, minWidth: 240 }}>
      <label style={lbl}>{title}</label>
      <div style={{ fontSize: "0.62rem", color: C.muted, marginBottom: 6 }}>{hint}</div>
      <input type="file" accept="image/*" onChange={e => onUpload(e.target.files[0], slot, setRow)} style={{ fontSize: "0.7rem", color: C.muted }} />
      {row[slot] && (
        <div style={{ position: "relative", marginTop: 8 }}>
          {capBadge && <span title={capBadge.tip} style={badgeStyle}>{capBadge.text}</span>}
          <img src={row[slot]} alt="" onClick={() => setZoom(slot)} title="Click to zoom (← → cycles Context/BEFORE/AFTER · Esc closes)" style={{ display: "block", width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.3)", cursor: "zoom-in" }} />
        </div>
      )}
    </div>
  );
  const doSave = () => {
    if (!row.ticker.trim()) { alert("Ticker first."); return; }
    const q = studyQuality(s); // grade is derived from ticks at save time — stored for the grid + calibration
    const { outcome_img, trigger_ltf_img, ...bodyRow } = row; // virtual slots → folded back into metrics.study (no DB columns)
    const body = { ...bodyRow,
      metrics: { ...row.metrics, study: { ...s, outcome_img: outcome_img || "", trigger_ltf_img: trigger_ltf_img || "", grade: { letter: q.letter === "—" ? "" : q.letter, auto: true, on: q.on, total: q.total } } },
      pattern: s.setup === "Parabolic" ? `Parabolic ${s.direction === "short" ? "Short" : "Long"}` : s.setup,
      outcome: cls ? MB_OUTCOME[cls] : null, thesis: row.thesis,
      lesson: [s.refusal && `REFUSE-IF: ${s.refusal}`, row.lesson].filter(Boolean).join("\n") || null };
    onSave(body);
  };
  return (
    <div style={{ position: "relative", background: C.glass, border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: 18, marginBottom: 18, fontFamily: font, backdropFilter: "blur(24px) saturate(150%)", WebkitBackdropFilter: "blur(24px) saturate(150%)" }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", borderRadius: 16, background: "linear-gradient(135deg, rgba(255,255,255,0.05), transparent 55%)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 11, marginBottom: 14, borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: C.goldBright }}>📚 Study {row.ticker ? `· ${row.ticker}` : "· new"}</span>
        {/* Star toggle = "show this study in the Model Book too". No duplication — the study stays
            in 📚 for the lift stats; when starred it ALSO appears as a Model Book card. Saved with the study. */}
        <button title={s.in_model_book ? "In the Model Book — click to remove" : "Add to the Model Book (the winners' textbook). Saved when you save the study."}
          onClick={() => setS({ in_model_book: !s.in_model_book })}
          style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${s.in_model_book ? C.borderGold : C.border}`, color: s.in_model_book ? C.goldBright : C.muted, borderRadius: 8, fontFamily: font, fontSize: "0.78rem", fontWeight: 700, padding: "4px 12px", cursor: "pointer" }}>
          {s.in_model_book ? "★" : "☆"} Model Book</button>
        <button title="Collapse (changes not saved)" onClick={onCancel} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, fontFamily: font, fontSize: "0.72rem", padding: "4px 12px", cursor: "pointer" }}>✕ collapse</button>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ width: 110 }}><label style={lbl}>Ticker</label><input style={inputS} value={row.ticker} onChange={e => setRow(r => ({ ...r, ticker: e.target.value.toUpperCase() }))} /></div>
        <div style={{ width: 150 }}><label style={lbl}>Trigger date</label><input type="date" style={inputS} value={row.entry_date || ""} onChange={e => setRow(r => ({ ...r, entry_date: e.target.value }))} /></div>
        <div style={{ width: 180 }}><label style={lbl}>Setup</label>
          <select style={inputS} value={s.setup} onChange={e => setS({ setup: e.target.value, checks: {}, m: {} })}>
            {Object.keys(STUDY_SETUPS).map(k => <option key={k}>{k}</option>)}
          </select></div>
        {s.setup === "Parabolic" && <div style={{ width: 110 }}><label style={lbl}>Direction</label>
          <select style={inputS} value={s.direction} onChange={e => setS({ direction: e.target.value })}><option>short</option><option>long</option></select></div>}
        <div style={{ width: 150 }}><label style={lbl}>Market condition</label>
          <select style={inputS} value={s.regime_tag || ""} onChange={e => setS({ regime_tag: e.target.value })}>
            <option value="">—</option>
            {MARKET_CONDITIONS.map(o => <option key={o}>{o}</option>)}
            {s.regime_tag && !MARKET_CONDITIONS.includes(s.regime_tag) && <option>{s.regime_tag}</option>}
          </select></div>
        {(() => { const q = studyQuality(s); // quality = tick count, computed live — never typed
          return <div style={{ width: 130 }}><label style={lbl}>Quality (auto)</label>
            <div style={{ ...inputS, display: "flex", justifyContent: "space-between", alignItems: "center" }} title="Auto-graded from your ticks — tick-% → letter, same scale as the Setup Grader">
              <b style={{ color: q.letter === "A+" ? "#7ef0a0" : q.letter === "A" ? C.goldBright : C.muted }}>{q.letter}</b>
              <span style={{ fontSize: "0.62rem", color: C.muted }}>{q.on}/{q.total}</span>
            </div></div>; })()}
      </div>

      <div style={sect}>This leg — charts{multiLeg ? ` · leg ${legIdx} of ${sibs.length}` : ""}</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {chartSlot("before_img", "Context — HTF", "Weekly/monthly — the pole, the base in context, where it sits in the longer trend")}
        {chartSlot("after_img", "BEFORE — the setup", "Daily/intraday with the RIGHT EDGE = trigger day — exactly what your eyes saw at the decision moment")}
        {chartSlot("trigger_ltf_img", "TRIGGER — 5-min entry detail", "Optional: the trigger day on 5-min — ORH, the reclaim, how the entry actually traded")}
      </div>

      {/* 👁 HIS ticks — only chart-readable factors, grader-style 3 buckets per setup.
          Data-context items (theme/liquidity/ADR/rank) are NOT here: backtested charts
          can't show them, so they live below as auto-pulled values + DATA_FLAGS. */}
      <div style={sect}>👁 My ticks — what the chart shows ({s.setup})</div>
      {(() => { const scored = def.buckets.flatMap(b => b.items).filter(it => !it[2]);
        const on = scored.filter(([k]) => s.checks[k]).length;
        return <div style={{ fontSize: "0.66rem", color: C.muted, marginBottom: 8 }}>{on}/{scored.length} ticked — eyeball reps; tick only what the chart actually shows (bonus ticks tracked, not graded)</div>; })()}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {def.buckets.map((b, bi) => (
          <div key={bi} style={{ flex: 1, minWidth: 250, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>{b.title}</div>
            {b.items.map(([k, t, bonus]) => { const sub = SUBCATS[k];
              return <div key={k} style={{ padding: "3px 0" }}>
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "0.74rem", cursor: "pointer" }}>
                  <input type="checkbox" style={{ accentColor: C.goldBright, marginTop: 3 }} checked={!!s.checks[k]}
                    onChange={e => setS({ checks: { ...s.checks, [k]: e.target.checked, ...(sub && !e.target.checked ? { [sub.store]: "" } : {}) } })} />
                  <span>{t}{bonus && <span style={{ marginLeft: 6, border: `1px solid ${C.goldBright}`, color: C.goldBright, borderRadius: 99, fontSize: "0.56rem", fontWeight: 800, letterSpacing: ".06em", padding: "1px 7px", verticalAlign: "1px" }}>BONUS</span>}</span>
                </label>
                {sub && s.checks[k] && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "5px 0 2px 24px" }}>
                    {sub.options.map(([val, optLabel]) => { const onOpt = String(s.checks[sub.store] || "") === val;
                      return <button key={val} type="button"
                        onClick={() => setS({ checks: { ...s.checks, [sub.store]: onOpt ? "" : val } })}
                        style={{ background: onOpt ? "rgba(212,175,55,0.18)" : "transparent", border: `1px solid ${onOpt ? C.goldBright : C.border}`, color: onOpt ? C.goldBright : C.muted, borderRadius: 99, fontFamily: font, fontSize: "0.64rem", fontWeight: 700, padding: "3px 10px", cursor: "pointer" }}>
                        {optLabel}</button>; })}
                  </div>
                )}
              </div>; })}
          </div>
        ))}
      </div>

      {/* Hypothesis-first summary (Valen 2026-07-24): what THIS study says about each hypothesis is the
          DEFAULT view; the key strip + full computed grids fold behind "Show all computed". Admin-side
          (📚 Studies is admin-only). The cap/ADR badge stays on the chart. */}
      <HypothesisRead C={C} study={s} ticker={row.ticker} date={row.entry_date} />
      {cls && <div style={{ marginTop: 6, marginBottom: 6, fontSize: "0.74rem" }}>Auto-class: <b style={{ color: cls === "failure" ? "#e05555" : "#7ef0a0" }}>{cls}</b></div>}

      {/* Campaign — whole trend (Valen 2026-07-24): H10 leg-lifespan + the shared AFTER-outcome chart are
          recorded ONCE, on the ROOT leg (counted off the shared AFTER chart). Non-root legs show them
          read-only with an "edit on leg 1" hint. Solo studies (no campaign_id) = root ⇒ editable inline
          as before. legs_ma10/20 live in checks but are NOT setup ticks — they never grade. */}
      <div style={sect}>{cid ? `Campaign — whole trend · leg ${legIdx} of ${sibs.length || 1}` : "Whole-trend outcome & lifespan"}</div>
      {cid && <div style={{ fontSize: "0.62rem", color: C.muted, marginBottom: 8 }}>Campaign <b style={{ color: C.goldBright }}>{cid}</b>{multiLeg ? ` · ${sibs[0]?.entry_date || "?"} → ${sibs[sibs.length - 1]?.entry_date || "?"}` : ""}{!isRoot ? " · shared fields edit on leg 1" : ""}</div>}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ minWidth: 230 }}>
          <label style={lbl}>Legs before first close below the MA (whole trend, off the AFTER chart)</label>
          {isRoot ? (
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 4 }}>
              {[["legs_ma10", "→ 10MA"], ["legs_ma20", "→ 20MA"]].map(([store, label]) => (
                <div key={store}>
                  <div style={{ fontSize: "0.58rem", color: C.muted, marginBottom: 3 }}>{label}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {["1", "2", "3", "4", "5+"].map(opt => { const on = String(s.checks[store] || "") === opt;
                      return <button key={opt} type="button" onClick={() => setS({ checks: { ...s.checks, [store]: on ? "" : opt } })}
                        style={{ background: on ? "rgba(212,175,55,0.18)" : "transparent", border: `1px solid ${on ? C.goldBright : C.border}`, color: on ? C.goldBright : C.muted, borderRadius: 99, fontFamily: font, fontSize: "0.7rem", fontWeight: 700, padding: "5px 13px", cursor: "pointer", minWidth: 34 }}>
                        {opt}</button>; })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: "0.74rem", color: C.text, marginTop: 6 }}>10MA: <b style={{ color: C.goldBright }}>{rootStudy.checks?.legs_ma10 || "—"}</b> legs · 20MA: <b style={{ color: C.goldBright }}>{rootStudy.checks?.legs_ma20 || "—"}</b> legs <span style={{ color: C.muted, fontSize: "0.62rem" }}>· edit on leg 1</span></div>
          )}
        </div>
        <div style={{ flex: "1 1 240px", minWidth: 240 }}>
          {isRoot ? chartSlot("outcome_img", "AFTER — the shared outcome", "Same chart weeks later — the whole trend's outcome. Shared across every leg of the campaign.")
            : (<div>
                <label style={lbl}>AFTER — the shared outcome</label>
                <div style={{ fontSize: "0.62rem", color: C.muted, marginBottom: 6 }}>Shared across the campaign — edit on leg 1</div>
                {rootStudy.outcome_img
                  ? <img src={rootStudy.outcome_img} alt="shared after" style={{ display: "block", width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.3)" }} />
                  : <div style={{ fontSize: "0.7rem", color: C.muted, border: `1px dashed ${C.border}`, borderRadius: 8, padding: "18px 12px", textAlign: "center" }}>No AFTER chart yet — add it on leg 1</div>}
              </div>)}
        </div>
      </div>

      {/* 📊 Computed metrics — the raw numbers (key strip + full grids) live behind this toggle now that
          the hypothesis read above is the default summary (Valen 2026-07-24). */}
      <div style={{ ...sect, display: "flex", alignItems: "center", gap: 10 }}>
        <span>📊 Computed metrics</span>
        <button type="button" onClick={() => setShowAll(v => !v)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 99, fontFamily: font, fontSize: "0.58rem", fontWeight: 800, letterSpacing: ".06em", padding: "3px 11px", cursor: "pointer", textTransform: "uppercase" }}>
          {showAll ? "Hide computed ▴" : "Show all computed ▾"}</button>
      </div>
      {showAll && (<>
        {/* Key strip — the load-bearing numbers, folded in with everything else. Cap/ADR rides the chart badge too. */}
        {(() => {
          const strip = [
            ["Burst %", s.outcome?.burst_pct], ["MFE d5 %", s.outcome?.mfe_d5], ["MFE d20 %", s.outcome?.mfe_d20],
            ["Entry", s.m?.entry_px], ["Stop width ×ADR", s.m?.stop_width_adr],
          ];
          const cap = +(s.m?.mcap_t || 0);
          return <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {strip.map(([lab, v]) => (
              <div key={lab} style={{ flex: "1 1 130px", minWidth: 120, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 10px", background: "rgba(0,0,0,0.25)" }}>
                <div style={{ fontSize: "0.54rem", fontWeight: 800, letterSpacing: ".07em", textTransform: "uppercase", color: C.muted, marginBottom: 3 }}>{lab}</div>
                <div style={{ fontSize: "0.8rem", fontWeight: 700, color: (v == null || v === "") ? C.muted : C.white }}>{(v == null || v === "") ? "—" : String(v)}</div>
              </div>
            ))}
            <div style={{ flex: "1 1 130px", minWidth: 120, border: `1px solid ${C.borderGold}`, borderRadius: 8, padding: "7px 10px", background: C.goldDim }}>
              <div style={{ fontSize: "0.54rem", fontWeight: 800, letterSpacing: ".07em", textTransform: "uppercase", color: C.muted, marginBottom: 3 }}>Cap / ADR</div>
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: C.goldBright }}>{cap > 0 ? (cap >= 1e9 ? "$" + (cap / 1e9).toFixed(1) + "B" : "$" + Math.round(cap / 1e6) + "M") : "—"}{s.m?.adr20 != null && s.m?.adr20 !== "" ? ` · ADR ${(+s.m.adr20).toFixed(1)}%` : ""}</div>
            </div>
          </div>;
        })()}
        <div style={sect}>📊 Auto-pulled data — filled by VIV, correct anything that looks wrong</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 8 }}>
          {def.metrics.map(([k, t]) => (
            <div key={k}><label style={lbl}>{t}</label><input style={inputS} value={s.m[k] ?? ""} onChange={e => setS({ m: { ...s.m, [k]: e.target.value } })} /></div>
          ))}
        </div>

        <div style={sect}>Outcome anatomy — the burst & the campaign</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 8 }}>
          {OUTCOME_METRICS.map(([k, t]) => (
            <div key={k}><label style={lbl}>{t}</label><input style={inputS} value={s.outcome[k] ?? ""} onChange={e => setS({ outcome: { ...s.outcome, [k]: e.target.value } })} /></div>
          ))}
          <div><label style={lbl}>Follow-through d2</label>
            <select style={inputS} value={s.outcome.followthru ?? ""} onChange={e => setS({ outcome: { ...s.outcome, followthru: e.target.value } })}><option value="">—</option><option>yes</option><option>no</option></select></div>
          <div><label style={lbl}>Failure mode (if failed)</label>
            <select style={inputS} value={s.outcome.failure_mode ?? "none"} onChange={e => setS({ outcome: { ...s.outcome, failure_mode: e.target.value } })}>
              {["none", "no-follow-through", "late-trend/extended", "market-phase", "bad-base", "liquidity/gap", "other"].map(f => <option key={f}>{f}</option>)}</select></div>
        </div>
      </>)}

      <div style={sect}>Lesson</div>
      <label style={lbl}>What would have made me refuse this? (one sentence — the highest-value note)</label>
      <input style={inputS} value={s.refusal} onChange={e => setS({ refusal: e.target.value })} />
      <div style={{ marginTop: 8 }}>
        <label style={lbl}>Observation / what made this one work</label>
        <textarea style={{ ...inputS, minHeight: 50, resize: "vertical" }} value={row.lesson || ""} onChange={e => setRow(r => ({ ...r, lesson: e.target.value }))} />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button disabled={busy} onClick={doSave} style={{ background: `linear-gradient(135deg,${C.goldBright},${C.goldMid})`, color: "#08080e", border: "none", fontFamily: font, fontWeight: 800, fontSize: "0.78rem", padding: "10px 22px", borderRadius: 99, cursor: "pointer" }}>{busy ? "Saving…" : "Save study"}</button>
        <button onClick={onCancel} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, fontFamily: font, fontSize: "0.78rem", padding: "10px 18px", borderRadius: 99, cursor: "pointer" }}>Cancel</button>
      </div>

      {/* click-to-zoom lightbox — ← → toggles HTF↔LTF, click backdrop or Esc to close */}
      {zoom && row[zoom] && (
        <div onClick={e => { if (e.target === e.currentTarget) setZoom(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 1400, background: "rgba(4,4,8,0.9)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10, color: C.white, fontFamily: font }}>
            {zoomSlots.length > 1 && <button onClick={() => setZoom(zoomSlots[(zoomSlots.indexOf(zoom) - 1 + zoomSlots.length) % zoomSlots.length])} style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${C.border}`, color: C.white, width: 40, height: 40, borderRadius: 10, fontSize: "1.3rem", cursor: "pointer" }} aria-label="Previous">‹</button>}
            <span style={{ fontSize: "0.72rem", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: C.goldBright }}>{SLOT_TITLES[zoom] || zoom}{zoomSlots.length > 1 ? " · ← → to cycle" : ""}</span>
            {zoomSlots.length > 1 && <button onClick={() => setZoom(zoomSlots[(zoomSlots.indexOf(zoom) + 1) % zoomSlots.length])} style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${C.border}`, color: C.white, width: 40, height: 40, borderRadius: 10, fontSize: "1.3rem", cursor: "pointer" }} aria-label="Next">›</button>}
            <button onClick={() => setZoom(null)} style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${C.border}`, color: C.muted, width: 40, height: 40, borderRadius: 10, fontSize: "1.1rem", cursor: "pointer", marginLeft: 8 }} aria-label="Close">✕</button>
          </div>
          <div style={{ position: "relative" }}>
            {capBadge && <span title={capBadge.tip} style={{ ...badgeStyle, top: 10, right: 10, fontSize: "0.72rem", padding: "5px 11px" }}>{capBadge.text}</span>}
            <img src={row[zoom]} alt={zoom} style={{ maxWidth: "96vw", maxHeight: "82vh", objectFit: "contain", borderRadius: 10, border: `1px solid ${C.borderGold}`, cursor: "zoom-out", display: "block" }} onClick={() => setZoom(null)} />
          </div>
        </div>
      )}
    </div>
  );
}
