import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { GROUP_RS } from "./groupRS-data.js";
import { sectorFor } from "./sectors.js";
import { ChartSeqEditor, buildChartList, deriveChartFields, chartFaces, sectionizeCharts } from "./ChartSeq.jsx";

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
  // Market Bottom — project study type (Valen 2026-07-28): how leaders behave around an index
  // correction low. Ticks drafted from his own chart annotations; data layer prefilled by script.
  "Market Bottom": {
    buckets: [
      { title: "Bottom tell (vs index)", items: [
        ["bb_early", "Bottomed before the index (own low printed first)"],
        ["bb_ma_hold", "Held a rising long-term MA (100/200d) at the low"],
        ["bb_higher_low", "Higher low while QQQ made lower lows"],
        ["bb_inpace", "Moved in-pace with index — only tell was MAs on pullbacks", "bonus"],
      ]},
      { title: "Recovery character", items: [
        ["rc_reclaim_fast", "Reclaimed highs in days while QQQ still repairing"],
        ["rc_ma_stack", "Key MAs stacked/reclaimed (10>20>50) before QQQ's were"],
        ["rc_higher_high", "Higher highs before QQQ confirmed its own"],
      ]},
      { title: "Theme & catalyst", items: [
        // Research tick (Valen 2026-07-29): NOT chart-visible — Claude fills it at ingest from era
        // leadership data per the pre-registered definition (research file § New theme cycle). He skips it.
        ["th_new_theme", "NEW cycle theme — research tick, auto-filled from era data"],
        ["th_catalyst", "Catalyst / EP at the launch", "bonus"],
      ]},
    ],
    metrics: [
      ["idx_low_date", "QQQ low date"], ["sessions_vs_index", "Own low vs index low (sessions)"],
      ["ret_3m", "+3M off low %"], ["ret_6m", "+6M off low %"], ["days_to_reclaim", "Sessions to reclaim pre-correction high"], ["vs_qqq_3m", "vs QQQ +3M (pp)"],
      ["trigger_date", "Trigger date (your pick)"], ["entry_px", "Trigger/entry price"],
      ["theme", "Theme / group"],
    ],
  },
  // High Tight Flag — project study type (Valen 2026-07-28). Criteria from the corpus (valid base shape,
  // qullamaggie-system.md §base-shapes) + the pattern's primary statistical source (pole ≥90% in ≤2 months;
  // tight-vs-loose flag; receding flag volume; entry above the PATTERN high; ½-pole measured move).
  "High Tight Flag": {
    buckets: [
      { title: "The pole", items: [
        ["pole_double", "Pole ≈ doubled — +90–100%+ in ≤ 8 weeks"],
        ["pole_linear", "Pole orderly ≈45° — strong closes, minimal overlap (not a one-day spike)"],
        ["pole_fresh", "Pole driven by a fresh catalyst / theme leadership", "bonus"],
      ]},
      { title: "The flag", items: [
        ["flag_shallow", "Flag depth ≤ 20–25% off the pole high"],
        ["flag_brief", "Flag 3–5 weeks (not stretching past ~8)"],
        ["flag_tightline", "TIGHT flag — clean drift, no trendline violations or jagged bars"],
        ["flag_voldry", "Volume recedes through the flag"],
        ["flag_nr", "Narrow-range days into the pivot"],
      ]},
      { title: "Trigger", items: [
        ["bo_above_high", "Trigger = break above the PATTERN HIGH (not an early flag-line poke)"],
        ["bo_vol", "Volume expansion on the breakout day"],
        ["first_flag", "1st–2nd flag of the campaign — not a late leg"],
      ]},
    ],
    metrics: [
      ["pole_pct", "Pole %"], ["pole_weeks", "Pole length (weeks)"],
      ["flag_depth_pct", "Flag depth %"], ["flag_weeks", "Flag length (weeks)"],
      ["rs", "AS/RS rank"], ["adr20", "ADR20 %"], ["dolvol_m", "DolVol $M (20d)"],
      ["gap_pct", "Gap % on trigger"], ["vol_ratio", "Volume ÷ prior day"], ["ext_50ma", "Ext from 50MA (×ATR%)"],
      ["entry_px", "Entry (5-min ORH — standing rule)"], ["stop_width_adr", "LoD stop width (×ADR)"],
      ["mm_target_px", "Measured-move target (½ pole above flag low)"], ["weeks_to_mm", "Weeks to measured move (post)"],
      ["theme", "Theme / group"], ["spy_10d20", "SPY condition (10 sessions vs 20SMA)"],
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
    // wc/fc = winners/failures WITH the factor · denW/denF = winners/failures where it was MEASURED
    // (non-null). These are the exact counts pW/pF already divide — surfaced only so the table can
    // show both denominators (the zero-failure guard). pW/pF/lift are byte-for-byte unchanged.
    const wc = w.filter(Boolean).length, fc = f.filter(Boolean).length;
    const pW = w.length ? wc / w.length : 0;
    const pF = f.length ? fc / f.length : 0;
    out.push({ setup: group, label, pW, pF, lift: pF > 0 ? pW / pF : (pW > 0 ? Infinity : 0), wc, denW: w.length, fc, denF: f.length });
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
  const campN = buildCampaigns(rows).list.length; // distinct campaigns (reuse the grouping machinery, don't re-derive)
  const guard = nFail < 5; // PRE-REGISTERED FLOOR: a zero/near-zero failure cell makes every ratio divide-by-~0
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
        <div style={box}><b style={boxNum}>{campN}</b><span style={boxLbl}>Campaigns</span></div>
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
          {/* THE ZERO-FAILURE GUARD (pre-registered law: a zero/near-zero cell ⇒ suppress the ratio).
              Under 5 resolved failures every ratio divides by ~0 and renders a fake "∞× / perfect" — so
              we replace it with a loud banner + raw fractions (both denominators, no %, no ∞), rows
              desaturated. At ≥5 failures the ratio returns, but ALWAYS with both denominators shown. */}
          {guard ? (
            <div style={{ fontSize: "0.72rem", color: C.goldBright, fontWeight: 600, margin: "0 0 10px", padding: "10px 13px", background: "rgba(201,152,42,0.06)", border: "1px solid rgba(201,152,42,0.35)", borderRadius: 8, lineHeight: 1.55 }}>
              🔒 Lift locked — {nWin} winners / {nFail} failures graded so far. Lift compares winners AGAINST failures, so it needs a graded failure control group (~1 failure per 2–3 winners). Raw tick counts are shown below in the meantime.
            </div>
          ) : (
            <div style={small
              ? { fontSize: "0.72rem", color: "#e0a955", margin: "0 0 10px", padding: "9px 12px", background: "rgba(224,169,85,0.08)", border: "1px solid rgba(224,169,85,0.25)", borderRadius: 8, lineHeight: 1.5 }
              : { fontSize: "0.72rem", color: C.muted, margin: "0 0 10px", lineHeight: 1.5 }}>
              {small ? `⚠ n=${n} resolved · ${campN} campaigns — early read, believe nothing before n≥30 per class (promote at n≥50). Add FAILURES too — without them lift can't be computed (winners-only = survivor bias).`
                     : `n=${n} resolved · ${campN} campaigns — lift = % of winners with the factor ÷ % of failures with it (both denominators shown). ≥2 = edge candidate · ~1 = noise.`}
            </div>
          )}
          <div style={{ maxHeight: 280, overflowY: "auto", paddingTop: 2 }}>
            {lifts.slice(0, 16).map((l, i, arr) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 2px", borderBottom: i === arr.length - 1 ? "none" : "1px solid rgba(255,255,255,0.05)", fontSize: "0.74rem", opacity: guard ? 0.55 : 1 }}>
                <span style={{ width: 170, flex: "none", color: C.muted, fontSize: "0.66rem" }}>{l.setup}</span>
                <span style={{ flex: 1, color: C.text }}>{l.label}</span>
                {guard ? (
                  <span style={{ flex: "none", textAlign: "right", whiteSpace: "nowrap", color: C.muted, fontSize: "0.66rem" }}>winners {l.wc}/{l.denW} · failures {l.fc}/{l.denF}</span>
                ) : (
                  <>
                    <span style={{ width: 150, flex: "none", textAlign: "right", whiteSpace: "nowrap", color: C.muted, fontSize: "0.66rem" }}>{Math.round(l.pW * 100)}%W ({l.wc}/{l.denW}) · {Math.round(l.pF * 100)}%F ({l.fc}/{l.denF})</span>
                    <b style={{ width: 56, flex: "none", textAlign: "right", fontWeight: 800, color: l.lift >= 2 ? "#7ef0a0" : l.lift < 0.7 ? "#e05555" : C.muted }}>{l.lift === Infinity ? "∞" : l.lift.toFixed(2)}×</b>
                  </>
                )}
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
    // bands = the preset base range; the card unions this with every leg number actually observed (incl.
    // custom values beyond 10) so a "12" gets its own row and nothing is bucket-collapsed. priorDist stays
    // keyed to the doctrine integers 2/3/4/5 — new/other rows show blank (no invented priors).
    bands: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
    stores: [["legs_ma10", "10MA"], ["legs_ma20", "20MA"]],
    priorDist: { "2": 70, "3": 20, "4": 5, "5": 1 } },
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
  { id: "H14", claim: "Big 1st leg (≥30%) → 2nd-leg pullback holds the 10MA", source: "MINE", kind: "cross",
    prior: "My own observation, no corpus prior: when leg 1 (the pole into the base) ran ≥30%, the pullback into leg 2 never closes below the 10MA; smaller first legs sink to the 20MA or deeper.",
    points: [["young_leg subcat", "gates this to 2nd-leg entries only — the pullback the claim is about"], ["pole tick", "did leg 1 (the pole into THIS base) run ≥30% — the eyeballed split; on a 2nd-leg study that pole IS leg 1"], ["retrace_ma subcat", "how deep the 2nd-leg pullback cut before the push — the claim's target"]] },
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

// H14 cross helper (Valen 2026-07-25): pole (leg1 ≥30% into the base) × retrace depth, gated to 2nd-leg
// pullbacks only (young_leg === "2") with both pole and retrace_ma actually recorded. "none" (never touched
// the 10MA at all) collapses into the SAME held-10MA column as "10ma" — the claim is "never closed below
// the 10MA" and no-touch satisfies that a fortiori. "50ma"/"deeper" collapse into one column too.
function h14Cross(all) {
  const eligible = all.filter(x => { const s = x.s; return s.checks?.young_leg === "2" && _tick(s, "pole") != null && !!s.checks?.retrace_ma; });
  const col = (rm) => (rm === "10ma" || rm === "none") ? "held10" : rm === "20ma" ? "cut20" : "deeper";
  const rows = [true, false].map(pole => {
    const set = eligible.filter(x => _tick(x.s, "pole") === pole);
    const counts = { held10: 0, cut20: 0, deeper: 0 };
    set.forEach(x => counts[col(x.s.checks.retrace_ma)]++);
    return { pole, n: set.length, counts, list: set };
  });
  return { rows, eligible, n: eligible.length };
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
// `state` can ALSO be the literal "supports" / "challenges" (H14, Valen 2026-07-25) — for a hypothesis whose
// claim is a relationship BETWEEN two observed fields (not a predictor of future trade outcome), the read
// decides the verdict itself and entryVerdict passes it straight through, bypassing the win/fail cross.
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
  H14: { short: "Leg1 size → pullback depth", read: (s) => { const leg = s.checks?.young_leg, rm = s.checks?.retrace_ma, pole = _tick(s, "pole");
    if (leg !== "2" || pole == null || !rm) return null; // not eligible — never vote (blank = not measured)
    const held = rm === "10ma" || rm === "none"; // "none" = never even touched the 10MA — a fortiori holds it
    const nice = { "10ma": "held 10MA", "20ma": "cut to 20MA", "50ma": "cut to 50MA", deeper: "cut deeper", none: "no touch (held)" };
    const label = nice[rm] || rm;
    return pole ? { answer: `leg1 ≥30% → ${label}`, state: held ? "supports" : "challenges" }
                : { answer: `leg1 <30% (control) → ${label}`, state: "adds" }; } },
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
  H14: { title: "When leg 1 runs ≥30% into the base, the leg-2 pullback holds the 10-day line; smaller first legs sink to the 20-day line or deeper.",
    howTracked: "Gated to 2nd-leg entries only (young_leg subcat). Eyeball pole tick — did leg 1 (the pole into THIS base) run ≥30% — crossed with the retrace-depth sub-tag (10MA / 20MA / 50MA / deeper / no touch). Per leg — off the BEFORE chart.",
    verdictLine: "Among 2nd-leg pullbacks with both fields recorded: pole ≥30% + held the 10MA supports — and \"no touch\" counts as held too (never closing below the 10MA is satisfied a fortiori by never touching it). Pole ≥30% + cut to the 20MA/50MA/deeper challenges. Pole <30% is the CONTROL arm — it's the contrast case, not the tested condition, so it only adds data and never votes supports/challenges." },
};
HYPOTHESES.forEach(h => Object.assign(h, HYP_READS[h.id] || {}, HYP_META[h.id] || {}));

// SINGLE SOURCE OF TRUTH — the per-entry verdict used by BOTH the strip and the tally table, so they
// can never disagree. Truth table: predicted-good state + winner ⇒ supports · good + failure ⇒ challenges
// · bad + failure ⇒ supports (failed as predicted) · bad + winner ⇒ challenges (won despite it). No
// resolved big-win/failure outcome, or a neutral/adds factor state ⇒ ⚪ (adds a data point / pending).
// H14 (Valen 2026-07-25) is a different SHAPE of claim — a relationship between two observed chart fields
// (leg-1 size vs leg-2 retrace depth), not a predictor of future win/loss — so its read() decides
// supports/challenges directly and entryVerdict just passes that verdict through, outcome untouched.
// EXPORTED (Valen 2026-07-26) read-only so the Studies list rows can render a per-hypothesis vote strip
// off the SAME verdict engine — presentation reuse, no recomputation.
export function entryVerdict(hyp, s, ctx) {
  if (!hyp.read) return null;
  const r = hyp.read(s, ctx); if (!r) return null; // ctx = {ticker, date} — only H12 uses it; others ignore
  if (r.state === "supports" || r.state === "challenges")
    return { answer: r.answer, chip: r.state === "supports" ? "🟢" : "🔴", tone: r.state, verb: r.state, bucket: r.state };
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
      {/* Strict 3-column grid (Valen 2026-07-26 — the old flex-wrap layout scattered chips/verdicts
          onto their own lines in narrow containers): [verdict dot] [name — answer, wraps] [chips, nowrap,
          right-aligned]. Verdict = a colored pill, always in the same place; verb nuance lives in the title. */}
      <div style={{ display: "grid", gap: 7 }}>
        {lines.map(({ h, answer, chip: ch, tone, verb }) => (
          <div key={h.id} style={{ display: "grid", gridTemplateColumns: "16px minmax(0,1fr) auto", alignItems: "start", columnGap: 8, fontSize: "0.73rem", lineHeight: 1.45 }}>
            <span style={{ fontSize: "0.8rem", lineHeight: 1.3 }}>{ch}</span>
            <span style={{ minWidth: 0 }}>
              <b style={{ color: C.white }}>{h.short}</b>
              <span style={{ color: C.text }}> · {answer}</span>
            </span>
            <span style={{ display: "flex", gap: 6, alignItems: "center", whiteSpace: "nowrap", justifySelf: "end", paddingTop: 1 }} title={verb}>
              <span style={chip(h.source)}>{h.source}</span>
              <span style={{ fontWeight: 800, fontSize: "0.56rem", letterSpacing: ".05em", textTransform: "uppercase", color: toneColor(tone), border: `1px solid ${toneColor(tone)}`, borderRadius: 99, padding: "1px 8px" }}>
                {tone === "supports" ? "Supports" : tone === "challenges" ? "Challenges" : "＋ Data"}
              </span>
            </span>
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

// Evidence-QUALITY chip (Valen 2026-07-26) — PRESENTATION over the EXISTING vote counts (never re-counts).
// filled dots 1–4 = INSUFFICIENT / LOW / MODERATE / HIGH. His pre-registered "believe nothing under 30"
// anchors HIGH; the 8-vote floor mirrors hypHeat's mute threshold. Distribution hyps carry no verdict,
// so they show a neutral slate n-chip off the data-point count instead of a supports/challenges split.
function evidenceChip(supports, challenges, dataCount, dist, C) {
  if (dist) {
    const nn = dataCount || 0;
    const filled = nn >= 30 ? 4 : nn >= 15 ? 3 : nn >= 8 ? 2 : 1;
    return { filled, label: nn >= 30 ? "HIGH" : nn >= 8 ? "BUILDING" : "THIN", color: "#94a3b8",
      reason: `${nn} data point${nn === 1 ? "" : "s"} — descriptive distribution, no supports/challenges verdict` };
  }
  const nn = supports + challenges, oneClass = supports === 0 || challenges === 0;
  if (nn >= 30) return { filled: 4, label: "HIGH", color: "#7ef0a0", reason: `${nn} resolved votes — past the believe-nothing-under-30 floor` };
  if ((nn >= 8 && supports >= 3 && challenges >= 3) || (nn >= 15 && oneClass))
    return { filled: 3, label: "MODERATE", color: "#e0a955", reason: (nn >= 15 && oneClass) ? `${nn} votes but all one-sided` : `${nn} votes with ${supports}–${challenges} both sides represented` };
  if (nn >= 8) return { filled: 2, label: "LOW", color: "#c99a5a", reason: oneClass ? `all ${nn} votes one-sided` : `only an ${supports}–${challenges} split` };
  return { filled: 1, label: "INSUFFICIENT", color: C.muted, reason: `only ${nn} resolved vote${nn === 1 ? "" : "s"}` };
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
    // Dynamic band set — union of the 1..10 presets with every leg number actually observed (incl. custom
    // values beyond 10), sorted numerically (any non-numeric legacy value sorts last). Nothing is dropped
    // or bucket-collapsed, so a custom "12" prints its own row.
    const stores = hyp.stores.map(([st]) => st);
    const observed = new Set();
    base.forEach(x => stores.forEach(st => { const v = x.s.checks?.[st]; if (v != null && v !== "") observed.add(String(v)); }));
    const dynBands = Array.from(new Set([...(hyp.bands || []), ...observed]))
      .sort((a, b) => ((parseInt(a, 10) || 1e9) - (parseInt(b, 10) || 1e9)) || (a < b ? -1 : 1));
    const dists = hyp.stores.map(([store, maLabel]) => ({ store, maLabel, ...legDist(store, dynBands, base) }));
    const med10 = medianCompanion(base, "d_below_ma10", "ma10_censored");
    const med20 = medianCompanion(base, "d_below_ma20", "ma20_censored");
    const distBox = { flex: "1 1 240px", minWidth: 220, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", background: "rgba(0,0,0,0.25)" };
    return (
      <div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {dists.map(d => (
            <div key={d.store} style={distBox}>
              <div style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.goldBright, marginBottom: 7 }}>Legs to first close below {d.maLabel} · n={d.n}</div>
              {dynBands.map(b => {
                const c = d.counts[b] || 0, pct = d.n ? Math.round(c / d.n * 100) : 0, prior = hyp.priorDist[b];
                return (
                  <div key={b} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.7rem", padding: "2px 0" }}>
                    <span style={{ width: 26, flex: "none", color: C.text, fontWeight: 700 }}>{b}</span>
                    <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: C.goldBright }} /></div>
                    <span style={{ width: 66, flex: "none", textAlign: "right", color: C.muted, fontSize: "0.64rem" }}>{c} · {pct}%</span>
                    <span style={{ width: 58, flex: "none", textAlign: "right", color: "rgba(255,255,255,0.32)", fontSize: "0.6rem" }} title="Doctrine prior — the reference distribution (only the doctrine legs 2–5 carry one); blank = no prior for this bucket">{prior == null ? "" : `prior ${prior}%`}</span>
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
  // ── H14 cross — pole (leg1 ≥30%) × retrace depth, gated to 2nd-leg pullbacks only. Not outcome-split
  // (this claim isn't about win/loss) — just eligible studies, rows = pole true/false. ──
  if (hyp.kind === "cross") {
    const base = hypForLevel(allStudies, hyp);
    const cr = h14Cross(base);
    const cols = [["10MA (incl. no touch)", "held10"], ["20MA", "cut20"], ["50MA / deeper", "deeper"]];
    const niceRM = { "10ma": "held 10MA", "20ma": "cut to 20MA", "50ma": "cut to 50MA", deeper: "cut deeper", none: "no touch" };
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.54rem", fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: C.muted, padding: "2px 0 5px" }}>
          <span style={{ width: 112, flex: "none" }}>Leg 1</span>
          <span style={{ width: 30, flex: "none", textAlign: "right" }}>n</span>
          {cols.map(([lab]) => <span key={lab} style={{ flex: 1, textAlign: "right" }}>{lab}</span>)}
        </div>
        {cr.rows.map(row => {
          const rowKey = `${hyp.id}-${row.pole}`, rowOpen = open === rowKey;
          return (
            <div key={rowKey}>
              <div onClick={() => row.n && setOpen(rowOpen ? null : rowKey)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.7rem", padding: "3px 0", cursor: row.n ? "pointer" : "default" }}>
                <span style={{ width: 112, flex: "none", color: C.text, fontWeight: 700 }}>{row.pole ? "leg1 ≥30%" : "leg1 <30% (control)"}</span>
                <span style={{ width: 30, flex: "none", textAlign: "right", color: C.muted, fontSize: "0.64rem" }}>{row.n}</span>
                {cols.map(([, key]) => { const c = row.counts[key], pct = row.n ? Math.round(c / row.n * 100) : 0;
                  return <span key={key} style={{ flex: 1, textAlign: "right", color: (key === "held10" && row.pole) ? "#7ef0a0" : C.muted, fontWeight: (key === "held10" && row.pole) ? 700 : 400, fontSize: "0.66rem" }}>{c} · {pct}%</span>; })}
              </div>
              {rowOpen && expandList(row.list, s => niceRM[s.checks?.retrace_ma] || s.checks?.retrace_ma || "—")}
            </div>
          );
        })}
        <div style={{ fontSize: "0.6rem", color: C.muted, marginTop: 7, letterSpacing: ".01em" }}>
          n={cr.n} 2nd-leg pullbacks with both pole + retrace depth recorded, across {hypCampCount(cr.eligible)} campaigns — "no touch" counts with 10MA-held · believe nothing &lt;30, promote at 50
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
          <span style={{ width: 124, flex: "none", textAlign: "right" }}>Verdict</span>
        </div>
        {rowsData.map(t => {
          const dist = !!t.h.distOnly;
          const heat = dist ? null : hypHeat(t.supports, t.challenges, C);
          const insufficient = !dist && (t.supports + t.challenges) < 8; // < the 8-vote mute floor
          const ev = evidenceChip(t.supports, t.challenges, t.data, dist, C); // presentation over existing counts
          // Tri-state (four-state) headline mapped from the SAME counts + mute logic — replaces the status word.
          let headline, headCol;
          if (dist) { headline = "distribution — open to view"; headCol = "#94a3b8"; }
          else if (insufficient) { headline = "INSUFFICIENT DATA"; headCol = C.muted; }
          else { const r = t.supports / (t.supports + t.challenges), pct = Math.round(r * 100);
            if (r >= 0.55) { headline = `SUPPORTED (leaning) · ${pct}%`; headCol = "#7ef0a0"; }
            else if (r > 0.45) { headline = `TESTED — UNDECIDED · ${pct}%`; headCol = "#e0a955"; }
            else { headline = `CHALLENGED (leaning) · ${pct}%`; headCol = "#e05555"; } }
          // Keep the existing HEAT background; only desaturate the genuinely-insufficient rows.
          const rowBg = dist ? "rgba(148,163,184,0.06)" : (heat.weak ? "transparent" : heat.bg);
          return (
            <div key={t.h.id} onClick={() => setModalId(t.h.id)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderTop: `1px solid ${C.border}`, background: rowBg, fontSize: "0.72rem", cursor: "pointer", transition: "filter .12s", opacity: insufficient ? 0.62 : 1 }}
              onMouseEnter={e => e.currentTarget.style.filter = "brightness(1.28)"} onMouseLeave={e => e.currentTarget.style.filter = "none"}>
              <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap", color: C.text, lineHeight: 1.35 }}>
                <span style={{ fontSize: "0.5rem", fontWeight: 800, color: C.muted, letterSpacing: ".04em" }}>{t.h.id}</span>
                <span style={{ fontWeight: 600, color: C.white }}>{t.h.title || t.h.claim}</span>
                <span style={srcChip(t.h.source)}>{t.h.source}</span>
                <span title={ev.reason} style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", cursor: "help" }}>
                  <span style={{ letterSpacing: "1px", fontSize: "0.5rem", lineHeight: 1 }}>{[0, 1, 2, 3].map(k => <span key={k} style={{ color: k < ev.filled ? ev.color : "rgba(255,255,255,0.18)" }}>●</span>)}</span>
                  <span style={{ fontSize: "0.48rem", fontWeight: 800, letterSpacing: ".06em", color: ev.color }}>{ev.label}</span>
                </span>
              </span>
              <span style={{ width: 34, flex: "none", textAlign: "center", fontWeight: 800, color: dist ? C.muted : (t.supports ? "#7ef0a0" : "rgba(255,255,255,0.25)") }}>{dist ? "—" : t.supports}</span>
              <span style={{ width: 34, flex: "none", textAlign: "center", fontWeight: 800, color: dist ? C.muted : (t.challenges ? "#e05555" : "rgba(255,255,255,0.25)") }}>{dist ? "—" : t.challenges}</span>
              <span style={{ width: 34, flex: "none", textAlign: "center", fontWeight: 800, color: t.data ? C.muted : "rgba(255,255,255,0.25)" }}>{t.data}</span>
              <span title={`${t.h.level === "campaign" ? "campaign-level — deduped to root leg · " : ""}${t.camps} campaign${t.camps === 1 ? "" : "s"} in the sample`} style={{ width: 28, flex: "none", textAlign: "center", color: C.muted, fontSize: "0.66rem", cursor: "help" }}>{dist ? t.data : t.n}</span>
              <span style={{ width: 124, flex: "none", textAlign: "right", fontWeight: 700, color: headCol, fontSize: "0.62rem", lineHeight: 1.3 }}>{headline}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: "0.58rem", color: C.muted, marginTop: 8 }}><b style={{ color: C.goldBright }}>DOCTRINE</b> = an observed prior · <b style={{ color: C.blue }}>MINE</b> = Valen's own read · green = supports, red = challenges (colored only past 8 resolved votes), slate = descriptive distribution.</div>

      {/* ── Deep-dive modal (blurred backdrop; closes on backdrop click only; inside clicks don't). Portaled
          to body to escape the panel's backdrop-filter stacking context. z 1300 (above editor 1250, below
          the chart lightbox 1550). Esc is left to the lightbox — not bound here. ── */}
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

// ══════════════════════════════════════════════════════════════════
//  🧪 PROJECT-LEVEL WORKING HYPOTHESES (Valen 2026-07-28) — for research BOOKS whose setup isn't in the
//  breakout hypothesis family (HYPOTHESES / entryVerdict are meaningless for e.g. Market Bottom ticks).
//  Keyed by metrics.study.project. These name the research questions a book is trying to answer — shown on
//  the Lab panel + the export summary page WITH the checklist tally. NO verdict engine yet: the `measure`
//  line names the fields that will decide each one; never render a fake verdict.
// ══════════════════════════════════════════════════════════════════
// Project-level working hypotheses (pre-registered; Valen 2026-07-28). Keyed by metrics.study.project.
// These are the research questions a project book is trying to answer — shown on the Lab panel and the
// book's export summary page WITH the checklist tally. No verdict engine yet: the measure line names the
// fields that will decide each one; never render a fake verdict.
export const PROJECT_HYPOTHESES = {
  "Finding the Market's Bottom": [
    { id: "MB-H1", short: "Slow corrections give early tells; fast flushes reward recovery speed.", text: "Slow, orderly correction → leaders show themselves EARLY (higher lows / bottoming before the index). Fast flush → everything drops together; leaders differentiate by RECOVERY SPEED off the shared low, not bottom timing.", measure: "sessions_vs_index + 'higher low' ticks split by episode type (2023/2024 orderly vs 2025 crash); recovery ticks carry the crash case" },
    { id: "MB-H2", short: "The real leaders bottom before the index does.", text: "In orderly corrections the eventual leaders bottom days-to-weeks before the index (the RS tell).", measure: "share of studies with sessions_vs_index < 0, per episode" },
    { id: "MB-H3", short: "Every market bottom crowns a new leadership theme.", text: "Each bottom launches a NEW leadership theme — the prior cycle's winner does not re-lead.", measure: "'NEW cycle theme' tick vs +3M return; count of prior-cycle leaders that re-led" },
    { id: "MB-H4", short: "Most of the move happens in the first three months.", text: "The leader's move is front-loaded: most of the 6-month return is made in the first 3 months off the low.", measure: "ret_3m vs (ret_6m − ret_3m) per study" },
    { id: "MB-H5", short: "Leaders hold their moving averages while the index breaks its own.", text: "MA structure is the tell: leaders hold/reclaim their key MAs (10>20>50 stack, 100/200d hold) before the index repairs its own.", measure: "'held long-term MA' + 'MAs stacked/reclaimed first' ticks vs +3M return" },
    { id: "MB-H6", short: "The biggest winners launch with a catalyst.", text: "A catalyst / episodic pivot at the launch marks the biggest winners off the bottom.", measure: "'Catalyst/EP at the launch' tick vs +3M / +6M return" },
  ],
  // High Tight Flag book (Valen 2026-07-28) — pre-registered from the corpus + the pattern's statistical source.
  "High Tight Flag": [
    { id: "HTF-H1", text: "TIGHT flags beat loose ones — clean drift with no trendline violations outperforms meandering/jagged flags.", measure: "'TIGHT flag' tick vs outcome class" },
    { id: "HTF-H2", text: "Flag depth ≤20–25% is the live/dead line — deeper corrections lose the measured-move odds.", measure: "flag_depth_pct bands vs MFE / measured-move hit" },
    { id: "HTF-H3", text: "Volume receding through the flag + expanding on the breakout day separates the real ones.", measure: "'volume recedes' + 'breakout volume' ticks vs outcome" },
    { id: "HTF-H4", text: "Only young flags pay — 1st–2nd flag of a campaign; 3rd+ decays hard (70/20/5/1 leg decay).", measure: "'1st–2nd flag' tick + leg index vs outcome" },
    { id: "HTF-H5", text: "An orderly ≈45° pole beats a vertical one-day-spike pole.", measure: "'pole orderly' tick vs MFE" },
    { id: "HTF-H6", text: "The ½-pole measured move (added to the flag low) is hit in the great majority of valid patterns — usable target math.", measure: "mm_target_px hit rate + weeks_to_mm" },
  ],
};

// ══════════════════════════════════════════════════════════════════
//  🧪 MARKET-BOTTOM EVIDENCE ENGINE (Valen 2026-07-29) — the FIRST project book to graduate from static
//  hypothesis text to a descriptive read of its own study rows. n is tiny; this is a pre-registered
//  DESCRIPTIVE ladder only — it NEVER implies statistical significance. Every number is auditable: the
//  `expand` array carries the per-study lines that produced it (blank fields = "not measured", excluded
//  from denominators, never counted as a failure).
// ══════════════════════════════════════════════════════════════════
// Episode character for MB-H1/H2 (pre-registered 2026-07-29): 2025 = the V-crash; 2023/2024/2026 = orderly-class
export const MB_EPISODE_CLASS = { "2023": "orderly", "2024": "orderly", "2025": "crash", "2026": "orderly" };
// Pre-registered verdict ladder (descriptive only — n is small; never imply significance):
// share ≥0.70 SUPPORTS · 0.55–0.70 LEANS FOR · 0.45–0.55 MIXED · 0.30–0.45 LEANS AGAINST · <0.30 AGAINST · n<5 INSUFFICIENT
// mbHypothesisEvidence — per-hypothesis descriptive read over the Market-Bottom study rows. Returns an object
// keyed "MB-H1"…"MB-H6", each { verdict, chip, headline, compare, n, expand }. compare = null OR the two-sided
// key comparison { a:{label,value,n}, b:{label,value,n} }; expand = per-study audit rows { ticker, year, line }.
export function mbHypothesisEvidence(rows) {
  const num = (v) => (v != null && v !== "") ? Number(v) : null;
  const median = (arr) => {
    const a = arr.filter((x) => x != null && !Number.isNaN(x)).slice().sort((x, y) => x - y);
    if (!a.length) return null;
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  };
  const pct = (x) => `${Math.round(x * 100)}%`;
  const r1 = (x) => (x == null || Number.isNaN(x)) ? null : Math.round(x * 10) / 10;
  const sgn = (x) => x == null ? "—" : (x > 0 ? `+${x}` : `${x}`); // signed display for session counts
  const yy = (y) => `'${String(y).slice(2)}`; // "2024" → "'24" for unit tooltips
  // ladder over a share (0–1) at sample n
  const ladder = (share, n) => {
    if (n < 5) return "INSUFFICIENT";
    if (share >= 0.70) return "SUPPORTS";
    if (share >= 0.55) return "LEANS FOR";
    if (share >= 0.45) return "MIXED";
    if (share >= 0.30) return "LEANS AGAINST";
    return "AGAINST";
  };
  const S = (rows || []).filter((r) => r && r.metrics && r.metrics.study).map((r) => ({
    ticker: r.ticker, year: (r.entry_date || "").slice(0, 4),
    m: r.metrics.study.m || {}, checks: r.metrics.study.checks || {},
  }));
  const out = {};

  // ── MB-H1 — orderly leaders lead the index; the crash differentiates by recovery, not timing ──
  {
    const orderly = S.filter((x) => MB_EPISODE_CLASS[x.year] === "orderly");
    const crash = S.filter((x) => MB_EPISODE_CLASS[x.year] === "crash");
    const nO = orderly.filter((x) => num(x.m.sessions_vs_index) != null).length;
    const nC = crash.filter((x) => num(x.m.sessions_vs_index) != null).length;
    const a = r1(median(orderly.map((x) => num(x.m.sessions_vs_index))));
    const b = r1(median(crash.map((x) => num(x.m.sessions_vs_index))));
    const crashRecov = crash.length ? crash.filter((x) => x.checks.rc_reclaim_fast).length / crash.length : 0;
    let verdict;
    if (nO < 5 || nC < 2) verdict = "INSUFFICIENT";
    else verdict = (a != null && a <= -4 && b != null && b >= -3) ? "SUPPORTS" : "MIXED";
    // units — every study votes on its OWN episode logic: orderly leads early, crash recovers fast (else against; unmeasured → na)
    const units = S.map((x) => {
      const cls = MB_EPISODE_CLASS[x.year], sv = num(x.m.sessions_vs_index);
      if (cls === "orderly") {
        if (sv == null) return { ticker: x.ticker, year: x.year, vote: "na", tip: `${x.ticker} ${yy(x.year)} · lead vs index not measured` };
        return sv < 0
          ? { ticker: x.ticker, year: x.year, vote: "for", tip: `${x.ticker} ${yy(x.year)} · led the index by ${Math.abs(sv)} sessions` }
          : { ticker: x.ticker, year: x.year, vote: "against", tip: `${x.ticker} ${yy(x.year)} · bottomed with/after the index` };
      }
      return x.checks.rc_reclaim_fast
        ? { ticker: x.ticker, year: x.year, vote: "for", tip: `${x.ticker} ${yy(x.year)} · crash — recovered fast off the shared low` }
        : { ticker: x.ticker, year: x.year, vote: "against", tip: `${x.ticker} ${yy(x.year)} · crash — no fast recovery off the low` };
    });
    out["MB-H1"] = {
      verdict, chip: verdict, n: nO + nC, units,
      headline: `Orderly corrections: leaders led the index by a median ${a == null ? "—" : Math.abs(a)} sessions (n=${nO}). The crash: median ${sgn(b)} — no timing edge, but ${pct(crashRecov)} out-recovered QQQ.`,
      compare: { a: { label: "orderly lead", value: `${sgn(a)} sess`, n: nO }, b: { label: "crash", value: `${sgn(b)} sess`, n: nC } },
      expand: S.map((x) => ({ ticker: x.ticker, year: x.year, line: `${MB_EPISODE_CLASS[x.year] || "—"} · vs index ${sgn(num(x.m.sessions_vs_index))} sess${x.checks.rc_reclaim_fast ? " · recovered fast" : ""}` })),
    };
  }

  // ── MB-H2 — in orderly corrections the eventual leaders bottom BEFORE the index ──
  {
    const orderly = S.filter((x) => MB_EPISODE_CLASS[x.year] === "orderly" && num(x.m.sessions_vs_index) != null);
    const n = orderly.length;
    const k = orderly.filter((x) => num(x.m.sessions_vs_index) < 0).length;
    const share = n ? k / n : 0;
    // units — orderly-with-a-measured-lead is the sample; crash / unmeasured fall out as na
    const units = S.map((x) => {
      const inSample = MB_EPISODE_CLASS[x.year] === "orderly" && num(x.m.sessions_vs_index) != null;
      if (!inSample) return { ticker: x.ticker, year: x.year, vote: "na", tip: `${x.ticker} ${yy(x.year)} · ${MB_EPISODE_CLASS[x.year] === "crash" ? "crash — not in the orderly sample" : "lead vs index not measured"}` };
      const sv = num(x.m.sessions_vs_index);
      return sv < 0
        ? { ticker: x.ticker, year: x.year, vote: "for", tip: `${x.ticker} ${yy(x.year)} · bottomed ${Math.abs(sv)} sessions before the index` }
        : { ticker: x.ticker, year: x.year, vote: "against", tip: `${x.ticker} ${yy(x.year)} · bottomed with/after the index` };
    });
    out["MB-H2"] = {
      verdict: ladder(share, n), chip: ladder(share, n), n, units,
      headline: `${k}/${n} orderly-episode leaders bottomed before the index.`,
      compare: { a: { label: "bottomed early", value: `${k}/${n}`, n }, b: { label: "share early", value: n ? pct(share) : "—", n } },
      expand: orderly.map((x) => ({ ticker: x.ticker, year: x.year, line: `vs index ${sgn(num(x.m.sessions_vs_index))} sess ${num(x.m.sessions_vs_index) < 0 ? "→ before" : "→ with/after"}` })),
    };
  }

  // ── MB-H3 — every bottom launches a NEW theme (REFINED — not universal) ──
  {
    const years = ["2023", "2024", "2025", "2026"];
    const fractions = years.map((y) => {
      const g = S.filter((x) => x.year === y);
      return g.length ? { year: yy(y), k: g.filter((x) => x.checks.th_new_theme).length, n: g.length } : null;
    }).filter(Boolean);
    const perYear = fractions.map((f) => `${f.year} ${f.k}/${f.n}`).join(" · ");
    const units = S.map((x) => x.checks.th_new_theme
      ? { ticker: x.ticker, year: x.year, vote: "for", tip: `${x.ticker} ${yy(x.year)} · crowned a NEW leadership theme` }
      : { ticker: x.ticker, year: x.year, vote: "against", tip: `${x.ticker} ${yy(x.year)} · re-led with a prior theme` });
    out["MB-H3"] = {
      verdict: "REFINED", chip: "REFINED", n: S.length, units, fractions,
      headline: `Not universal — rotation ruled the LATER bottoms (2024/2025) while the FIRST bottom of the secular theme (2023) and the 2026 picks re-led with prior themes. Per-episode new-theme ticks: ${perYear || "—"}. See the refined MB-H3 in the research file.`,
      compare: null,
      expand: S.map((x) => ({ ticker: x.ticker, year: x.year, line: x.checks.th_new_theme ? "NEW leadership theme ✓" : "re-led with a prior theme" })),
    };
  }

  // ── MB-H4 — the move is FRONT-LOADED (compounding-correct split, not naive pp-subtraction) ──
  {
    const both = S.filter((x) => num(x.m.ret_3m) != null && num(x.m.ret_6m) != null);
    const openWindow = S.filter((x) => num(x.m.ret_3m) != null && num(x.m.ret_6m) == null).length;
    const rowsF = both.map((x) => {
      const r3 = num(x.m.ret_3m), r6 = num(x.m.ret_6m);
      const second3m = ((1 + r6 / 100) / (1 + r3 / 100) - 1) * 100;
      return { x, r3, second3m: r1(second3m), front: r3 > second3m };
    });
    const n = rowsF.length;
    const k = rowsF.filter((f) => f.front).length;
    const share = n ? k / n : 0;
    // units — studies with BOTH windows vote front/back; those still open (or unmeasured) → na
    const byTicker = {};
    rowsF.forEach((f) => { byTicker[`${f.x.ticker}|${f.x.year}`] = f; });
    const units = S.map((x) => {
      const f = byTicker[`${x.ticker}|${x.year}`];
      if (!f) return { ticker: x.ticker, year: x.year, vote: "na", tip: `${x.ticker} ${yy(x.year)} · 6-month window still open` };
      return f.front
        ? { ticker: x.ticker, year: x.year, vote: "for", tip: `${x.ticker} ${yy(x.year)} · front-loaded (${sgn(f.r3)}% then ${sgn(f.second3m)}%)` }
        : { ticker: x.ticker, year: x.year, vote: "against", tip: `${x.ticker} ${yy(x.year)} · back-loaded (${sgn(f.r3)}% then ${sgn(f.second3m)}%)` };
    });
    out["MB-H4"] = {
      verdict: ladder(share, n), chip: ladder(share, n), n, units,
      headline: `${k}/${n} made more in months 0–3 than 3–6 (compounding-correct split — naive pp-subtraction flips several)${openWindow ? ` · ${openWindow} stud${openWindow === 1 ? "y" : "ies"} still in their 6M window` : ""}.`,
      compare: { a: { label: "front-loaded", value: `${k}/${n}`, n }, b: { label: "share front", value: n ? pct(share) : "—", n } },
      expand: rowsF.map((f) => ({ ticker: f.x.ticker, year: f.x.year, line: `${sgn(f.r3)}% then ${sgn(f.second3m)}%${f.front ? " · front-loaded" : ""}` })),
    };
  }

  // ── MB-H5 — MA structure is the tell: holders/reclaimers post a bigger +3M ──
  {
    const A = S.filter((x) => x.checks.bb_ma_hold || x.checks.rc_ma_stack);
    const B = S.filter((x) => !(x.checks.bb_ma_hold || x.checks.rc_ma_stack));
    const aVals = A.map((x) => num(x.m.ret_3m)).filter((v) => v != null);
    const bVals = B.map((x) => num(x.m.ret_3m)).filter((v) => v != null);
    const a = r1(median(aVals)), b = r1(median(bVals));
    let verdict;
    if (aVals.length < 4 || bVals.length < 4) verdict = "INSUFFICIENT";
    else if (a >= 1.2 * b) verdict = "SUPPORTS";
    else if (a >= 0.8 * b) verdict = "MIXED";
    else verdict = "LEANS AGAINST";
    out["MB-H5"] = {
      verdict, chip: verdict, n: aVals.length + bVals.length, units: null,
      headline: `MA-structure holders posted a median ${sgn(a)}% at 3M vs ${sgn(b)}% without it${(aVals.length < 4 || bVals.length < 4) ? " — too few in one arm to read yet" : ""}.`,
      compare: { a: { label: "MA held / stacked", value: `${sgn(a)}% 3M`, n: aVals.length }, b: { label: "did not", value: `${sgn(b)}% 3M`, n: bVals.length } },
      expand: S.map((x) => ({ ticker: x.ticker, year: x.year, line: `${(x.checks.bb_ma_hold || x.checks.rc_ma_stack) ? "MA held/stacked" : "no MA tell"} · +3M ${sgn(num(x.m.ret_3m))}%` })),
    };
  }

  // ── MB-H6 — a catalyst / EP marks the biggest winners (needs more ticks before it can speak) ──
  {
    const ticked = S.filter((x) => x.checks.th_catalyst);
    const nTick = ticked.length;
    // units — a catalyst tick votes FOR; the rest are na (insufficient data, not a challenge)
    const units = S.map((x) => x.checks.th_catalyst
      ? { ticker: x.ticker, year: x.year, vote: "for", tip: `${x.ticker} ${yy(x.year)} · carried a catalyst / EP at the launch` }
      : { ticker: x.ticker, year: x.year, vote: "na", tip: `${x.ticker} ${yy(x.year)} · no catalyst tick yet` });
    if (nTick < 5) {
      out["MB-H6"] = {
        verdict: "INSUFFICIENT", chip: "INSUFFICIENT", n: nTick, units,
        headline: `only ${nTick}/${S.length} carry the catalyst tick so far — tick or refute more before this one can speak.`,
        compare: null,
        expand: S.map((x) => ({ ticker: x.ticker, year: x.year, line: x.checks.th_catalyst ? "catalyst/EP at launch ✓" : "no catalyst tick" })),
      };
    } else {
      const noTick = S.filter((x) => !x.checks.th_catalyst);
      const aVals = ticked.map((x) => num(x.m.ret_3m)).filter((v) => v != null);
      const bVals = noTick.map((x) => num(x.m.ret_3m)).filter((v) => v != null);
      const a = r1(median(aVals)), b = r1(median(bVals));
      let verdict;
      if (aVals.length < 4 || bVals.length < 4) verdict = "INSUFFICIENT";
      else if (a >= 1.2 * b) verdict = "SUPPORTS";
      else if (a >= 0.8 * b) verdict = "MIXED";
      else verdict = "LEANS AGAINST";
      out["MB-H6"] = {
        verdict, chip: verdict, n: nTick, units,
        headline: `Catalyst-tagged launches posted a median ${sgn(a)}% at 3M vs ${sgn(b)}% without (${nTick}/${S.length} carry the tick).`,
        compare: { a: { label: "catalyst / EP", value: `${sgn(a)}% 3M`, n: aVals.length }, b: { label: "no catalyst", value: `${sgn(b)}% 3M`, n: bVals.length } },
        expand: S.map((x) => ({ ticker: x.ticker, year: x.year, line: `${x.checks.th_catalyst ? "catalyst/EP ✓" : "no catalyst"} · +3M ${sgn(num(x.m.ret_3m))}%` })),
      };
    }
  }

  return out;
}

// checklistTally — group study rows by setup; per setup return { setup, n (row count), items } where each
// item = { key, label, bonus, count } and count = rows of that setup with checks[key] truthy. Items follow
// STUDY_SETUPS bucket order (flatMap buckets). Setups with no STUDY_SETUPS entry are skipped.
export function checklistTally(rows) {
  const bySetup = {};
  (rows || []).forEach((r) => {
    const s = r && r.metrics && r.metrics.study;
    if (!s || !STUDY_SETUPS[s.setup]) return;
    (bySetup[s.setup] || (bySetup[s.setup] = [])).push(s);
  });
  return Object.entries(bySetup).map(([setup, studies]) => ({
    setup,
    n: studies.length,
    items: STUDY_SETUPS[setup].buckets.flatMap((b) => b.items).map(([key, label, bonus]) => ({
      key, label, bonus: !!bonus,
      count: studies.filter((s) => !!(s.checks && s.checks[key])).length,
    })),
  }));
}

// ChecklistTally — the Lab panel for non-breakout research books. Pure presentation (no state): the project's
// pre-registered working hypotheses (id chip + text + a muted `measure:` line, NO verdicts / vote dots) over
// a per-setup checklist tally (label + thin gold progress bar + count/n). An untick ≠ a failure — it may just
// mean "not studied yet"; the caption says so.
export function ChecklistTally({ C, rows, project }) {
  const groups = checklistTally(rows);
  const hyps = PROJECT_HYPOTHESES[project];
  // Evidence engine (Valen 2026-07-29): the Market-Bottom book graduates from static text to a descriptive
  // read of its own rows. Gate on the project key — every other project keeps the static rendering below.
  const mbEvidence = project === "Finding the Market's Bottom" ? mbHypothesisEvidence(rows) : null;
  const sheen = { position: "absolute", inset: 0, pointerEvents: "none", borderRadius: 16, background: "linear-gradient(135deg, rgba(255,255,255,0.05), transparent 55%)" };
  // Tiny gold-outline id chip.
  const idChip = { flex: "none", fontSize: "0.5rem", fontWeight: 800, letterSpacing: ".06em", color: C.gold, border: `1px solid ${C.gold}`, borderRadius: 99, padding: "2px 7px", whiteSpace: "nowrap" };
  // Verdict → {color, background}, following the pre-registered ladder (SUPPORTS green → AGAINST red).
  const VERDICT = {
    "SUPPORTS": ["#7ef0a0", "rgba(126,240,160,0.12)"],
    "LEANS FOR": ["#b6e8bf", "rgba(126,240,160,0.08)"],
    "MIXED": [C.gold, "rgba(201,152,42,0.12)"],
    "LEANS AGAINST": ["#e05555", "rgba(224,90,85,0.12)"],
    "AGAINST": ["#e05555", "rgba(224,90,85,0.12)"],
    "INSUFFICIENT": ["rgba(255,255,255,0.55)", "rgba(255,255,255,0.06)"],
    "REFINED": [C.goldBright, "rgba(240,192,80,0.12)"],
  };
  const verdictChip = (v) => { const [col, bg] = VERDICT[v] || VERDICT["INSUFFICIENT"]; return { flex: "none", fontSize: "0.6rem", fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: col, background: bg, borderRadius: 99, padding: "2px 9px", whiteSpace: "nowrap" }; };
  const segColor = (vote) => vote === "for" ? "#7ef0a0" : vote === "against" ? "rgba(224,90,85,0.85)" : "rgba(255,255,255,0.10)";
  // Row-2 evidence line — ONE line per hypothesis, chosen by shape (fraction chips · compare pills · unit bar · muted).
  const evidenceRow = (h, ev) => {
    // H3 — four year fraction chips
    if (h.id === "MB-H3" && ev.fractions) {
      return (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          {ev.fractions.map((f, i) => (
            <span key={i} style={{ fontSize: "0.74rem" }}>
              <span style={{ color: C.muted }}>{f.year} </span>
              <span style={{ color: "#fff", fontWeight: 700 }}>{f.k}/{f.n}</span>
            </span>
          ))}
        </div>
      );
    }
    // H1 / H5 — two inline text pills (no boxes), thin divider between
    if ((h.id === "MB-H1" || h.id === "MB-H5") && ev.compare) {
      const pill = (s, gold) => (
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5, paddingBottom: 3, borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: ".02em", color: gold ? C.gold : C.muted }}>
            <span style={{ textTransform: "uppercase", letterSpacing: ".05em" }}>{s.label}</span> {s.value}
          </span>
          <span style={{ fontSize: "0.5rem", fontWeight: 700, color: C.muted }}>n={s.n}</span>
        </span>
      );
      return (
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {pill(ev.compare.a, true)}
          <span style={{ width: 1, height: 13, background: C.border }} />
          {pill(ev.compare.b, false)}
        </div>
      );
    }
    // INSUFFICIENT — one muted line, no bar
    if (ev.verdict === "INSUFFICIENT") {
      const forC = ev.units ? ev.units.filter((u) => u.vote === "for").length : 0;
      const tot = ev.units ? ev.units.length : ev.n;
      return <div style={{ fontSize: "0.72rem", color: C.muted }}>{forC}/{tot} ticked so far · below the n ≥ 5 read threshold</div>;
    }
    // unit bar (H2, H4, and H6 once sufficient)
    if (ev.units && ev.units.length) {
      const forC = ev.units.filter((u) => u.vote === "for").length;
      const denom = forC + ev.units.filter((u) => u.vote === "against").length;
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative", display: "flex", flex: 1, maxWidth: 420, gap: 3, height: 10 }}>
            {ev.units.map((u, i) => (
              <div key={i} title={u.tip} style={{ flex: 1, height: 10, borderRadius: 3, background: segColor(u.vote) }} />
            ))}
            <div style={{ position: "absolute", left: "70%", top: -1, bottom: -1, width: 1, background: "rgba(255,255,255,0.25)", pointerEvents: "none" }} />
          </div>
          <span style={{ flex: "none", fontSize: "0.95rem", fontWeight: 800, color: C.goldBright }}>{forC}/{denom}</span>
        </div>
      );
    }
    return null;
  };
  return (
    <div style={{ position: "relative", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 16, padding: "18px 20px", marginBottom: 16, backdropFilter: "blur(24px) saturate(150%)", WebkitBackdropFilter: "blur(24px) saturate(150%)" }}>
      <div style={sheen} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 11, marginBottom: 12, borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <span style={{ flex: 1, fontSize: "0.62rem", fontWeight: 700, letterSpacing: ".13em", textTransform: "uppercase", color: C.muted }}>🧪 Working Hypotheses</span>
        <span style={{ fontSize: "0.6rem", color: C.muted }}>what this research says so far</span>
      </div>
      {/* Evidence CARD system (Market-Bottom book) — one card per hypothesis: id + punchy claim + verdict chip,
          then a single evidence line (unit bar · compare pills · fraction chips), then a one-line headline.
          The unit tooltips ARE the audit — no expander. Non-evidence books keep the static claim + measure list. */}
      {hyps && mbEvidence && (
        <div style={{ marginBottom: 16 }}>
          {hyps.map((h, idx) => {
            const ev = mbEvidence[h.id];
            return (
              <div key={h.id} style={{ padding: "12px 0", borderTop: idx > 0 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={idChip}>{h.id}</span>
                  <span title={`${h.text}\nmeasure: ${h.measure}`} style={{ flex: 1, minWidth: 0, fontSize: "0.88rem", fontWeight: 700, color: "#fff", lineHeight: 1.35, cursor: "help" }}>{h.short || h.text}</span>
                  {ev && <span style={verdictChip(ev.verdict)}>{ev.chip}</span>}
                </div>
                {ev && (
                  <>
                    <div style={{ marginTop: 10 }}>{evidenceRow(h, ev)}</div>
                    <div title={ev.headline} style={{ marginTop: 7, fontSize: "0.7rem", color: C.muted, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.headline}</div>
                  </>
                )}
              </div>
            );
          })}
          <div style={{ fontSize: "0.58rem", color: C.muted, lineHeight: 1.5, marginTop: 12 }}>
            n={rows.length} · descriptive only — pre-registered ladder, threshold notch at 70%.
          </div>
        </div>
      )}
      {hyps && !mbEvidence && (
        <div style={{ display: "grid", gap: 11, marginBottom: 16 }}>
          {hyps.map((h) => (
            <div key={h.id} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
              <span style={idChip}>{h.id}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.75rem", color: C.text, lineHeight: 1.45 }}>{h.short || h.text}</div>
                <div style={{ fontSize: "0.6rem", color: C.muted, lineHeight: 1.4, marginTop: 3 }}>measure: {h.measure}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {groups.map((g) => (
        <div key={g.setup} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.goldBright, marginBottom: 8 }}>
            Checklist tally — {g.n} stud{g.n === 1 ? "y" : "ies"}{groups.length > 1 ? ` · ${g.setup}` : ""}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {g.items.map((it) => {
              const p = g.n ? Math.round((it.count / g.n) * 100) : 0;
              return (
                <div key={it.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: "0.72rem", color: C.text, lineHeight: 1.35 }}>
                    {it.label}
                    {it.bonus && <span style={{ fontSize: "0.5rem", fontWeight: 800, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 99, padding: "0 5px", marginLeft: 5, verticalAlign: "1px" }}>BONUS</span>}
                  </span>
                  <div style={{ width: 96, flex: "none", height: 10, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{ width: `${p}%`, height: "100%", background: `linear-gradient(90deg,${C.goldMid},${C.goldBright})`, borderRadius: 3 }} />
                  </div>
                  <span style={{ width: 44, flex: "none", textAlign: "right", fontSize: "0.66rem", fontWeight: 700, color: C.goldBright }}>{it.count}/{g.n}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ fontSize: "0.58rem", color: C.muted, marginTop: 8, lineHeight: 1.5 }}>Counts are cards ticked so far — an untick may just mean "not studied yet", never "failed".</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
//  📖 Detailed study view (Valen 2026-07-25) — long-form scrollable page opened from the StudyEditor header.
//  Charts column (big canonical slots + unlimited extras) scrolls; the stats/hypothesis rail stays pinned.
//  Reads/writes the editor's own row via setRow (so it flips the SAME dirty flag) and saves via the SAME doSave.
// ══════════════════════════════════════════════════════════════════
// Scoped CSS (same embed pattern as Feedback.jsx): desktop = charts | 360px rail, rail sticky; ≤760px = single
// column with the rail rendered FIRST (order:-1) and un-pinned, so mobile leads with the stats read.
const DV_CSS = `
.sbdv-grid{ display:grid; grid-template-columns:minmax(0,1fr) 360px; gap:22px; align-items:start; }
.sbdv-rail{ position:sticky; top:0; max-height:100vh; overflow-y:auto; }
.sbdv-scroll::-webkit-scrollbar,.sbdv-rail::-webkit-scrollbar{ width:8px }
.sbdv-scroll::-webkit-scrollbar-thumb,.sbdv-rail::-webkit-scrollbar-thumb{ background:rgba(201,152,42,0.22); border-radius:99px }
@media (max-width:760px){
  .sbdv-grid{ grid-template-columns:1fr; }
  .sbdv-rail{ position:static; max-height:none; overflow:visible; order:-1; }
  .sbdv-charts{ order:0; }
}
`;
// Role → caption for the read-only INHERITED chart timeline (Valen 2026-07-28) — module scope so no component
// is defined inside another. Mirrors the editor's ROLE_LABEL; used only when a chartless leg shows the root's set.
// Role labels follow the workflow-v2 chart language (Valen 2026-07-29): HTF = weekly context ·
// LTF = daily setup (right edge = trigger). "BEFORE/AFTER" wording retired from the study surfaces;
// the shared campaign outcome keeps the AFTER name.
const DV_ROLE_LABEL = { context: "HTF — weekly context", before: "LTF — daily setup", trigger: "TRIGGER — 5-min entry", after: "AFTER — the outcome" };
// z-ladder (whole 📚 surface): ModelBook study backdrop 1250 · HypothesisRead deep-dive modal 1300 ·
// 📖 detailed view 1340 (above the editor + deep-dive, below the app edit modal 1400 and the lightbox 1550) ·
// app edit modal 1400 · chart lightbox 1550.
export function StudyDetailView({ C, font, busy, row, setRow, onUpload, onSave, onClose, capBadge, badgeStyle, inheritedCharts }) {
  const s = row.metrics.study;
  const cls = outcomeClass(s);
  const q = studyQuality(s);
  const def = STUDY_SETUPS[s.setup] || STUDY_SETUPS["Momentum Breakout"];
  const [lbox, setLbox] = useState(null); // { src, title } | null — the detailed view's own lightbox (z 1550)
  // Esc closes the LIGHTBOX only (never the overlay — the overlay has an explicit ✕ Back button, matching the
  // editor's rule that the lightbox owns Esc). Bound only while a lightbox image is open.
  useEffect(() => {
    if (!lbox) return;
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); setLbox(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lbox]);

  const inputS = { background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, fontFamily: font, fontSize: "0.78rem", padding: "7px 10px", outline: "none", width: "100%", colorScheme: "dark" };
  // Same study-merge updater as the quick editor — the rail checklist EDITS, it doesn't just display
  // (Valen 2026-07-26: two viewing formats of ONE editor; detailed is the default).
  const setS = (patch) => setRow(r => ({ ...r, metrics: { ...r.metrics, study: { ...r.metrics.study, ...patch } } }));

  const cap = +(s.m?.mcap_t || 0);
  const capText = cap > 0 ? (cap >= 1e9 ? "$" + (cap / 1e9).toFixed(1) + "B" : "$" + Math.round(cap / 1e6) + "M") : null;
  const adr = s.m?.adr20;

  const btn = { fontFamily: font, borderRadius: 99, cursor: "pointer", fontWeight: 800 };
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1340, background: "#0a0a10", fontFamily: font, display: "flex", flexDirection: "column" }}>
      <style dangerouslySetInnerHTML={{ __html: DV_CSS }} />
      {/* Header — Back + Save top-right. Sits OUTSIDE the one scroll container (below), so the rail's sticky
          top:0 pins right under it and Save stays reachable without scrolling. No Esc-close on the overlay. */}
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderBottom: `1px solid ${C.border}`, background: "rgba(8,8,14,0.9)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: C.goldBright }}>📖 Detailed study{row.ticker ? ` · ${row.ticker}` : ""}</span>
        <button disabled={busy} onClick={onSave} style={{ ...btn, marginLeft: "auto", background: `linear-gradient(135deg,${C.goldBright},${C.goldMid})`, color: "#08080e", border: "none", fontSize: "0.76rem", padding: "8px 18px" }}>{busy ? "Saving…" : "💾 Save"}</button>
        <button onClick={onClose} title="Drop to the quick editor — ticks, computed fields, the standard chart slots" style={{ ...btn, background: "transparent", border: `1px solid ${C.border}`, color: C.muted, fontWeight: 700, fontSize: "0.74rem", padding: "8px 14px" }}>✎ Ticks &amp; fields</button>
      </div>

      {/* THE one scroll container. Charts column scrolls; the rail (inside) is sticky top:0. */}
      <div className="sbdv-scroll" style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
        <div className="sbdv-grid">
          {/* ── charts column — the ONE ordered chronological list (metrics.study.charts, lifted to row.charts).
              Replaces the fixed canonical slots + extra_charts; the slots are derived from this list on save. ── */}
          <div className="sbdv-charts" style={{ minWidth: 0 }}>
            {/* Case-study order (Valen 2026-07-26) — a thin legend of how this list resolves into the SCR
                sections (same sectionizeCharts the member detail uses). The editor below stays the editing surface. */}
            {(() => {
              const secs = sectionizeCharts(row.charts || []);
              return secs.length > 1 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  <span style={{ fontSize: "0.54rem", fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.muted, alignSelf: "center" }}>Case-study order:</span>
                  {secs.map((sec, i) => (
                    <span key={i} style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", color: sec.num ? C.goldBright : C.muted, border: `1px solid ${sec.num ? C.borderGold : C.border}`, borderRadius: 99, padding: "3px 9px" }}>{sec.title}{sec.charts.length > 1 ? ` · ${sec.charts.length}` : ""}</span>
                  ))}
                </div>
              ) : null;
            })()}
            {/* Display inheritance (Valen 2026-07-28): a leg with NO charts of its own shows the campaign ROOT's
                chart set READ-ONLY (charts live on the root leg — nothing copied). Own charts (or no root set) ⇒
                the normal editable timeline, byte-identical to before (inheritedCharts undefined = today's behavior). */}
            {(() => {
              const ownList = (row.charts || []).filter((c) => c && c.img);
              const inherit = ownList.length === 0 && inheritedCharts && inheritedCharts.length > 0;
              if (!inherit) return (
                <ChartSeqEditor C={C} font={font} busy={busy} list={row.charts || []}
                  onChange={(nl) => setRow(r => ({ ...r, charts: nl }))}
                  onUpload={onUpload}
                  onZoom={({ src, title }) => setLbox({ src, title })} />
              );
              return (<>
                <div style={{ fontSize: "0.66rem", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", marginBottom: 14, background: "rgba(255,255,255,0.03)" }}>↩ Chart set shared from Leg 1 (root) — edit charts there.</div>
                <div style={{ display: "grid", gap: 14 }}>
                  {inheritedCharts.map((c, j) => (
                    <figure key={j} style={{ margin: 0, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", background: "rgba(0,0,0,0.3)" }}>
                      <figcaption style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: C.goldBright, padding: "8px 12px 0" }}>{c.label || DV_ROLE_LABEL[c.role] || `Chart ${j + 1}`}</figcaption>
                      <img src={c.img} alt={c.label || ""} onClick={() => setLbox({ src: c.img, title: c.label || DV_ROLE_LABEL[c.role] || "Shared chart" })} style={{ display: "block", width: "100%", maxHeight: 460, objectFit: "contain", cursor: "zoom-in", marginTop: 8 }} />
                      {c.caption && <div style={{ fontSize: "0.72rem", color: C.muted, padding: "0 12px 10px" }}>{c.caption}</div>}
                    </figure>
                  ))}
                </div>
              </>);
            })()}
          </div>

          {/* ── sticky stats + hypothesis rail ── */}
          <div className="sbdv-rail">
            <div style={{ border: `1px solid ${C.borderGold}`, borderRadius: 14, padding: 16, background: C.glass }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em", color: C.white }}>{row.ticker || "—"}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "6px 0 4px" }}>
                <span style={{ fontSize: "0.74rem", fontWeight: 700, color: C.goldBright }}>{s.setup}{s.setup === "Parabolic" && s.direction === "short" ? " · Short" : ""}</span>
                {row.entry_date && <span style={{ fontSize: "0.7rem", color: C.muted }}>· {row.entry_date}</span>}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 6 }}>
                {cls && <span style={{ fontSize: "0.68rem", fontWeight: 800, color: cls === "failure" ? "#e05555" : "#7ef0a0", border: `1px solid ${cls === "failure" ? "#e05555" : "#7ef0a0"}`, borderRadius: 99, padding: "2px 10px" }}>{cls === "failure" ? "▼ " : "▲ "}{MB_OUTCOME[cls] || cls}</span>}
                {q.letter !== "—" && <span style={{ fontSize: "0.68rem", fontWeight: 800, color: q.letter === "A+" ? "#7ef0a0" : C.goldBright, border: `1px solid ${C.borderGold}`, borderRadius: 99, padding: "2px 10px" }} title={`Auto-grade from ${q.on}/${q.total} ticks`}>Grade {q.letter}</span>}
              </div>
            </div>

            {/* HERO — Captured % (Valen 2026-07-26), the single loudest stat; the rest demote to quiet rows. */}
            <div style={{ marginTop: 12, border: `1px solid ${C.borderGold}`, borderRadius: 12, padding: "14px 16px", background: C.glass }}>
              <div style={{ fontSize: "1.7rem", fontWeight: 800, color: C.goldBright, lineHeight: 1.05 }}>{(row.run_pct == null || row.run_pct === "") ? "—" : `${+row.run_pct > 0 ? "+" : ""}${row.run_pct}%`}</div>
              <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: C.muted, marginTop: 3 }}>Captured</div>
            </div>
            <div style={{ display: "grid", gap: 2, marginTop: 10 }}>
              {[["Run-up %", row.run_up_pct], ["Days held", row.days_held], ["R multiple", row.r_mult], ["Theme", row.theme || s.m?.theme],
                ["Cap / ADR", (capText || (adr != null && adr !== "")) ? `${capText || "—"}${adr != null && adr !== "" && !Number.isNaN(+adr) ? ` · ADR ${(+adr).toFixed(1)}%` : ""}` : null]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: "0.72rem", color: C.muted, whiteSpace: "nowrap" }}>{k}</span>
                  <span style={{ fontSize: "0.78rem", fontWeight: 700, color: (v == null || v === "") ? C.muted : "#e8e8ec", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>{(v == null || v === "") ? "—" : String(v)}</span>
                </div>
              ))}
            </div>

            {/* Bucket-grouped EDITABLE checklist (Valen 2026-07-26): same three buckets + handlers as the
                quick editor, ALL items shown in one column — tick/untick + subcat pills right here.
                Unticked stay visible but muted. Two viewing formats, one editing surface. */}
            <div style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: C.goldBright, margin: "16px 0 4px" }}>👁 My ticks — {q.on}/{q.total}</div>
            {def.buckets.map((b) => (
              <div key={b.title} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: "0.55rem", fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.muted, margin: "8px 0 4px" }}>{b.title}</div>
                {b.items.map(([k, t, bonus]) => {
                  const on = !!s.checks?.[k];
                  const sub = SUBCATS[k];
                  return (
                    <div key={k} style={{ padding: "2px 0" }}>
                      <label style={{ display: "flex", alignItems: "flex-start", gap: 7, cursor: "pointer", opacity: on ? 1 : 0.5 }}>
                        <input type="checkbox" style={{ accentColor: C.goldBright, marginTop: 2, flexShrink: 0 }} checked={on}
                          onChange={e => setS({ checks: { ...s.checks, [k]: e.target.checked, ...(sub && !e.target.checked ? { [sub.store]: "" } : {}) } })} />
                        <span style={{ fontSize: "0.7rem", color: on ? C.text : C.muted, lineHeight: 1.45 }}>
                          {t}
                          {bonus ? <span style={{ fontSize: "0.5rem", fontWeight: 800, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 99, padding: "0 5px", marginLeft: 5, verticalAlign: "1px" }}>BONUS</span> : null}
                        </span>
                      </label>
                      {sub && on && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "4px 0 2px 22px" }}>
                          {sub.options.map(([val, optLabel]) => { const onOpt = String(s.checks?.[sub.store] || "") === val;
                            return <button key={val} type="button"
                              onClick={() => setS({ checks: { ...s.checks, [sub.store]: onOpt ? "" : val } })}
                              style={{ background: onOpt ? "rgba(212,175,55,0.18)" : "transparent", border: `1px solid ${onOpt ? C.goldBright : C.border}`, color: onOpt ? C.goldBright : C.muted, borderRadius: 99, fontFamily: font, fontSize: "0.6rem", fontWeight: 700, padding: "2px 8px", cursor: "pointer" }}>
                              {optLabel}</button>; })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {row.thesis && (<>
              <div style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: C.goldBright, margin: "16px 0 6px" }}>Thesis</div>
              <div style={{ fontSize: "0.78rem", color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{row.thesis}</div>
            </>)}
            {(row.lesson || s.refusal) && (<>
              <div style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: C.goldBright, margin: "16px 0 6px" }}>Lesson</div>
              <div style={{ fontSize: "0.78rem", color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{[s.refusal && `REFUSE-IF: ${s.refusal}`, row.lesson].filter(Boolean).join("\n")}</div>
            </>)}

            {/* 🧪 Hypothesis verdicts — the exact same component mounted in the quick editor (admin-gated surface). */}
            <div style={{ marginTop: 16 }}>
              <HypothesisRead C={C} study={s} ticker={row.ticker} date={row.entry_date} />
            </div>
          </div>
        </div>
      </div>

      {/* click-to-zoom lightbox (z 1550 — above this overlay, matching the editor's lightbox). Esc / backdrop / ✕ close. */}
      {lbox && (
        <div onClick={e => { if (e.target === e.currentTarget) setLbox(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 1550, background: "rgba(4,4,8,0.9)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10, color: C.white }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: C.goldBright }}>{lbox.title}</span>
            <button onClick={() => setLbox(null)} style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${C.border}`, color: C.muted, width: 40, height: 40, borderRadius: 10, fontSize: "1.1rem", cursor: "pointer" }} aria-label="Close">✕</button>
          </div>
          <div style={{ position: "relative" }}>
            {capBadge && <span title={capBadge.tip} style={{ ...badgeStyle, top: 10, right: 10, fontSize: "0.72rem", padding: "5px 11px" }}>{capBadge.text}</span>}
            <img src={lbox.src} alt={lbox.title} style={{ maxWidth: "96vw", maxHeight: "82vh", objectFit: "contain", borderRadius: 10, border: `1px solid ${C.borderGold}`, cursor: "zoom-out", display: "block" }} onClick={() => setLbox(null)} />
          </div>
        </div>
      )}
    </div>, document.body);
}

export function StudyEditor({ C, font, busy, initial, onSave, onCancel, onUpload, campaignRows, closeGuard, onNavigate, onSaveStay, onAddLeg }) {
  const [row, setRowRaw] = useState(() => ({
    ticker: "", entry_date: "", before_img: "", after_img: "", thesis: "", lesson: "",
    ticked: [], elite: [], characteristics: [], is_published: false,
    ...(initial || {}),
    // outcome_img is a VIRTUAL slot (no DB column) — lives in metrics.study.outcome_img; lifted
    // to top level here so chartSlot/uploadImg/zoom treat all three charts identically.
    outcome_img: initial?.metrics?.study?.outcome_img || "",
    trigger_ltf_img: initial?.metrics?.study?.trigger_ltf_img || "", // 4th virtual slot: trigger-day 5-min entry detail (Valen 2026-07-17)
    // Detailed-view virtuals (Valen 2026-07-25): unlimited extra charts + optional per-canonical-slot captions.
    // Same lift/fold pattern as outcome_img — held at top level while editing, folded into metrics.study on save.
    extra_charts: initial?.metrics?.study?.extra_charts || [], // [{ img, label, caption }] — LEGACY (superseded by charts; kept only for rollback)
    slot_captions: initial?.metrics?.study?.slot_captions || {}, // { context, before, trigger, after } — LEGACY (superseded by charts)
    // The ONE ordered chronological chart list (Valen 2026-07-26). Built from existing slot data on load;
    // folded into metrics.study.charts on save, with the legacy slot columns DERIVED from it.
    charts: buildChartList(initial, true),
    metrics: { ...(initial?.metrics || {}), study: initial?.metrics?.study || {
      setup: "Momentum Breakout", direction: "long", regime_tag: "", project: "",
      checks: {}, m: {}, grade: { letter: "" }, outcome: {}, refusal: "", annotation: "",
    } },
  }));
  // Unsaved-changes tracking (Valen 2026-07-24): EVERY working-state edit flows through setRow (ticks, subcats,
  // leg selectors, chart remove/upload via onUpload, grade-affecting ticks, refusal, notes) — so wrapping it
  // is the single point that flips `dirty`. Fresh open = a remount (keyed in ModelBook) ⇒ dirty starts false.
  const [dirty, setDirty] = useState(false);
  const setRow = (u) => { setDirty(true); setRowRaw(u); };
  const s = row.metrics.study;
  const setS = (patch) => setRow(r => ({ ...r, metrics: { ...r.metrics, study: { ...r.metrics.study, ...patch } } }));
  const def = STUDY_SETUPS[s.setup] || STUDY_SETUPS["Momentum Breakout"];
  // Distinct existing project names (Valen 2026-07-28) → the "Project" input's datalist. Derived from the
  // same rows the campaign nav already sees (campaignRows = all study rows), so the shelf and the editor agree.
  const projectNames = [...new Set((campaignRows || []).map(r => r.metrics?.study?.project).filter(Boolean))].sort();
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
  // Root chart list for the detailed view's display inheritance (Valen 2026-07-28): a NON-root leg surfaces the
  // ROOT's chart set read-only when it has none of its own. [] = no inheritance (solo / this-is-root / no charts).
  const inheritedCharts = (cid && sibs.length && sibs[0].id !== row.id) ? buildChartList(sibs[0], true).filter(c => c && c.img) : [];
  // Shared HTF preview (Valen 2026-07-29): a NON-root leg's weekly (HTF = before_img → role "context") is one
  // shared chart on the root. When this leg hasn't uploaded its own, the HTF slot shows the root's dimmed as a
  // "↩ shared" preview (upload here overrides for this leg only). Falls back to sibs[0].before_img if unroled.
  const sharedRootHTF = (cid && sibs.length && sibs[0].id !== row.id)
    ? ((buildChartList(sibs[0], true).find(c => c && c.role === "context" && c.img) || {}).img || sibs[0].before_img || null)
    : null;
  const inputS = { background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, fontFamily: font, fontSize: "0.78rem", padding: "7px 10px", outline: "none", width: "100%", colorScheme: "dark" };
  const lbl = { fontSize: "0.58rem", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: C.muted, marginBottom: 4, display: "block" };
  const sect = { fontSize: "0.6rem", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: C.goldBright, margin: "14px 0 8px" };
  const cls = outcomeClass(s);
  // ── click-to-zoom lightbox: click any chart to enlarge, ←/→ cycles Context→BEFORE→AFTER, Esc closes ──
  const [zoom, setZoom] = useState(null); // null | "before_img" | "after_img" | "outcome_img"
  const [showAll, setShowAll] = useState(false); // raw computed-metrics grid folded by default (Valen 2026-07-24) — key strip stays
  const [detailOpen, setDetailOpen] = useState(false); // Ticks & fields = the DEFAULT landing (Valen 2026-07-29, reverses 07-26): open a study → straight to the checklist for fast grading reps; 📖 Detailed view opens on demand for the chart page
  const [addingLeg, setAddingLeg] = useState(false), [newLegDate, setNewLegDate] = useState(""); // leg-strip inline "+ Add leg" date entry (Valen 2026-07-28)
  const SLOT_TITLES = { before_img: "HTF — weekly context", after_img: "LTF — daily setup", outcome_img: "AFTER — the shared outcome", trigger_ltf_img: "TRIGGER — 5-min entry detail" };
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
  // ── Unsaved-changes guard + leg/campaign navigation (Valen 2026-07-24) ──
  // guardedClose / go both run the dirty check first: clean ⇒ proceed; dirty ⇒ window.confirm, proceed only
  // if the user discards. onCancel/backdrop close, and every arrow/button navigation, route through it.
  const confirmDiscard = () => !dirty || window.confirm("You have unsaved changes — discard them?");
  const guardedCancel = () => { if (confirmDiscard()) onCancel && onCancel(); };
  // Expose the guard to the backdrop (in ModelBook) via the shared ref; reset to always-true on unmount so a
  // closed editor never prompts. Re-set whenever `dirty` flips so the backdrop always sees the live value.
  useEffect(() => {
    if (!closeGuard) return;
    closeGuard.current = () => confirmDiscard();
    return () => { closeGuard.current = () => true; };
  }, [dirty, closeGuard]);
  // Campaign map across ALL study rows — date-ordered campaigns, each with date-ordered legs. buildCampaigns
  // is the single source of structure (same as the list + stats). navPos = where THIS study sits.
  const navCampaigns = React.useMemo(() => buildCampaigns(campaignRows || []).list
    .sort((a, b) => String(a.span?.[0] || "").localeCompare(String(b.span?.[0] || "")) || String(a.cid).localeCompare(String(b.cid))), [campaignRows]);
  const navPos = (() => { if (row.id == null) return null;
    for (let ci = 0; ci < navCampaigns.length; ci++) { const li = navCampaigns[ci].legs.findIndex(l => l.id === row.id); if (li >= 0) return { ci, li }; }
    return null; })();
  const legTarget = (d) => navPos ? (navCampaigns[navPos.ci].legs[navPos.li + d] || null) : null;
  const campTarget = (d) => navPos ? (navCampaigns[navPos.ci + d] ? navCampaigns[navPos.ci + d].legs[0] : null) : null;
  const go = (target) => { if (target && confirmDiscard()) onNavigate && onNavigate(target); }; // switch the open editor in place
  // Arrow keys: ← / → = prev / next LEG in this campaign · ↓ / ↑ = first leg of next / prev CAMPAIGN.
  // HARD gates: fire ONLY when the chart lightbox is CLOSED (it owns ← → and Esc), and NEVER while typing in
  // an input/textarea/select (so leg numbers, notes and the thesis aren't hijacked).
  useEffect(() => {
    const onKey = (e) => {
      if (zoom || detailOpen) return; // lightbox owns the arrows while open; the 📖 detailed view owns them while open
      const el = e.target, tag = (el?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(legTarget(1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(legTarget(-1)); }
      else if (e.key === "ArrowDown") { e.preventDefault(); go(campTarget(1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); go(campTarget(-1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, detailOpen, dirty, navCampaigns, navPos && navPos.ci, navPos && navPos.li, row.id]);
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
  // ── Canonical slot ↔ list sync (Valen 2026-07-26). The quick-editor 3-slot row still fills the standard
  // slots, but the ONE list (row.charts) is the source of truth on save — so every quick-row upload/remove
  // is mirrored into the list by ROLE (and the slot field kept in sync for the zoom lightbox). This is how
  // "the quick row writes slot fields; conversion absorbs them" holds WITHIN a session, not just on reload.
  const SLOT_ROLE = { before_img: "context", after_img: "before", trigger_ltf_img: "trigger", outcome_img: "after" };
  const ROLE_LABEL = { context: "Context (HTF)", before: "BEFORE — the setup", trigger: "TRIGGER — 5-min entry", after: "AFTER — the outcome" };
  const CANON_ORDER = ["context", "before", "trigger", "after"]; // canonical entries sort ahead of untagged extras
  const slotFieldFor = (role) => Object.keys(SLOT_ROLE).find(k => SLOT_ROLE[k] === role);
  const upsertCanonical = (role, url) => setRow(r => {
    const list = [...(r.charts || [])];
    const idx = list.findIndex(c => c.role === role);
    if (idx >= 0) list[idx] = { ...list[idx], img: url };
    else {
      const myRank = CANON_ORDER.indexOf(role);
      let pos = list.length;
      for (let i = 0; i < list.length; i++) { const rr = CANON_ORDER.indexOf(list[i].role); if (rr === -1 || rr > myRank) { pos = i; break; } }
      list.splice(pos, 0, { img: url, role, label: ROLE_LABEL[role], caption: "" });
    }
    return { ...r, charts: list, [slotFieldFor(role)]: url };
  });
  const removeCanonical = (role) => setRow(r => ({ ...r, charts: (r.charts || []).filter(c => c.role !== role), [slotFieldFor(role)]: "" }));
  const chartSlot = (slot, title, hint) => {
    // NON-root leg, empty HTF slot, root has a weekly → show the root's HTF dimmed as a "↩ shared" preview.
    // Upload still writes THIS leg's own before_img (override); the LTF slot (after_img) has no such preview —
    // each leg uploads its own daily.
    const showSharedHTF = slot === "before_img" && !isRoot && !row[slot] && !!sharedRootHTF;
    return (
    <div style={{ flex: 1, minWidth: 240 }}>
      <label style={lbl}>{title}</label>
      <div style={{ fontSize: "0.62rem", color: C.muted, marginBottom: 6 }}>{hint}</div>
      <input type="file" accept="image/*" onChange={e => { const f = e.target.files[0]; if (!f) return; onUpload(f, slot, (updater) => { const url = updater({})[slot]; if (url) upsertCanonical(SLOT_ROLE[slot], url); }); }} style={{ fontSize: "0.7rem", color: C.muted }} />
      {showSharedHTF && (
        <div style={{ position: "relative", marginTop: 8 }}>
          <span title="This weekly is shared from leg 1 — the HTF lives on the root leg. Upload here only to override it for this leg."
            style={{ position: "absolute", top: 6, left: 6, zIndex: 2, background: "rgba(8,8,14,0.9)", border: `1px solid ${C.borderGold}`, color: C.goldBright, fontFamily: font, fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.03em", padding: "3px 8px", borderRadius: 7, backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}>↩ shared HTF — from leg 1</span>
          <img src={sharedRootHTF} alt="shared HTF" style={{ display: "block", width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 8, border: `1px dashed ${C.borderGold}`, background: "rgba(0,0,0,0.3)", opacity: 0.55 }} />
          <div style={{ fontSize: "0.62rem", color: C.muted, marginTop: 6, fontStyle: "italic" }}>upload here only to override for this leg</div>
        </div>
      )}
      {row[slot] && (
        <div style={{ position: "relative", marginTop: 8 }}>
          {capBadge && <span title={capBadge.tip} style={badgeStyle}>{capBadge.text}</span>}
          {/* Remove control — clears this slot AND its list entry so the correct chart can be re-attached
              (the image stays in storage). */}
          <button type="button" onClick={(e) => { e.stopPropagation(); removeCanonical(SLOT_ROLE[slot]); }}
            title="Remove this chart — the slot reopens for the correct one (the image stays in storage)"
            style={{ position: "absolute", top: 6, left: 6, zIndex: 2, background: "rgba(8,8,14,0.82)", border: `1px solid ${C.border}`, color: C.muted, fontFamily: font, fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.04em", padding: "3px 8px", borderRadius: 7, cursor: "pointer", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#e05555"; e.currentTarget.style.borderColor = "#e05555"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = C.muted; e.currentTarget.style.borderColor = C.border; }}>✕ Remove</button>
          <img src={row[slot]} alt="" onClick={() => setZoom(slot)} title="Click to zoom (← → cycles BEFORE/AFTER/TRIGGER · Esc closes)" style={{ display: "block", width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.3)", cursor: "zoom-in" }} />
        </div>
      )}
    </div>
  );
  };
  // buildBody = the exact DB body doSave ships (extracted Valen 2026-07-28 so the leg strip persists through
  // the SAME path). The ONE list (row.charts) is the source of truth. Derive the legacy slot columns from it
  // (study mapping: context→before_img · before→after_img · trigger→trigger_ltf_img · after→outcome_img;
  // first/last default the flash-card faces). Fold charts into metrics.study.charts. The old extra_charts/
  // slot_captions are LEFT as `...s` carried them — untouched for rollback safety, no longer written here.
  const buildBody = () => {
    const q = studyQuality(s); // grade is derived from ticks at save time — stored for the grid + calibration
    const { outcome_img, trigger_ltf_img, extra_charts, slot_captions, charts, ...bodyRow } = row; // strip non-DB working fields
    const derived = deriveChartFields(charts, true);
    // NOTE: `...s` (= row.metrics.study) spreads FIRST so any unknown study field survives (same guarantee study-fill.mjs
    // relies on for campaign_id); the folded values below then overwrite with the freshly-derived ones.
    return { ...bodyRow,
      before_img: derived.before_img || null,
      after_img: derived.after_img || null,
      metrics: { ...row.metrics, study: { ...s, charts: charts || [], trigger_ltf_img: derived.trigger_ltf_img || "", outcome_img: derived.outcome_img || "", grade: { letter: q.letter === "—" ? "" : q.letter, auto: true, on: q.on, total: q.total } } },
      pattern: s.setup === "Parabolic" ? `Parabolic ${s.direction === "short" ? "Short" : "Long"}` : s.setup,
      outcome: cls ? MB_OUTCOME[cls] : null, thesis: row.thesis,
      lesson: [s.refusal && `REFUSE-IF: ${s.refusal}`, row.lesson].filter(Boolean).join("\n") || null };
  };
  const doSave = async () => {
    if (!row.ticker.trim()) { alert("Ticker first."); return; }
    setDirty(false); // optimistic — restored below if the save FAILS, so the close-guard keeps protecting edits
    const ok = await onSave(buildBody());
    if (ok === false) setDirty(true); // failed save = still dirty (Valen 2026-07-29: silent first-save failures)
  };
  // ── Leg strip (Valen 2026-07-28): hop between the legs of this campaign without leaving the chart's editor.
  // Unlike the ‹ › arrows (which DISCARD on dirty), the strip SAVES the current leg first through the exact
  // doSave→onSave DB path (onSaveStay = the parent's save, minus the close). Blocked (validation) ⇒ surface why
  // and don't switch. Only shown once the study is persisted (navPos != null) — you can't add legs to an unsaved row.
  const saveCurrentFirst = async () => {
    if (!dirty) return true;
    if (!row.ticker.trim()) { alert("Add a ticker before leaving this leg (or ✕ collapse to discard)."); return false; }
    if (!onSaveStay) return false;
    const ok = await onSaveStay(buildBody());
    if (ok) setDirty(false);
    return !!ok;
  };
  const stripSwitch = async (leg) => {
    if (!leg || leg.id === row.id) return;
    if (!(await saveCurrentFirst())) return;
    onNavigate && onNavigate(leg);
  };
  const confirmAddLeg = async () => {
    const date = (newLegDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { alert("Date must be YYYY-MM-DD."); return; }
    if (!(await saveCurrentFirst())) return;
    setAddingLeg(false); setNewLegDate("");
    onAddLeg && onAddLeg(row.id, date); // parent inserts the sibling + switches the editor to it
  };
  return (
    <div style={{ position: "relative", background: C.glass, border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: 18, marginBottom: 18, fontFamily: font, backdropFilter: "blur(24px) saturate(150%)", WebkitBackdropFilter: "blur(24px) saturate(150%)" }}>
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", borderRadius: 16, background: "linear-gradient(135deg, rgba(255,255,255,0.05), transparent 55%)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 11, marginBottom: 14, borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: C.goldBright }}>📚 Study {row.ticker ? `· ${row.ticker}` : "· new"}</span>
        {/* Leg / campaign navigation (Valen 2026-07-24): ‹ › = prev/next leg in this campaign · ⌃ ⌄ = prev/next
            campaign (first leg). Arrow keys do the same when the lightbox is closed and you're not typing. Each
            hop runs the unsaved-changes guard first. Only shown once the study is saved (has a position). */}
        {navPos && (() => {
          const navBtn = (label, target, title) => (
            <button type="button" title={title} disabled={!target} onClick={() => go(target)}
              style={{ background: "transparent", border: `1px solid ${target ? C.border : "transparent"}`, color: target ? C.muted : "rgba(255,255,255,0.18)", borderRadius: 7, fontFamily: font, fontSize: "0.8rem", fontWeight: 800, padding: "2px 9px", cursor: target ? "pointer" : "default", lineHeight: 1 }}>{label}</button>
          );
          return <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            {navBtn("‹", legTarget(-1), "Previous leg (←)")}
            {navBtn("›", legTarget(1), "Next leg (→)")}
            <span style={{ fontSize: "0.6rem", color: C.muted, whiteSpace: "nowrap", margin: "0 4px" }}>Leg {navPos.li + 1} of {navCampaigns[navPos.ci].legs.length} · campaign {navPos.ci + 1} of {navCampaigns.length}</span>
            {navBtn("⌃", campTarget(-1), "Previous campaign (↑)")}
            {navBtn("⌄", campTarget(1), "Next campaign (↓)")}
          </span>;
        })()}
        {/* Star toggle = "show this study in the Model Book too". No duplication — the study stays
            in 📚 for the lift stats; when starred it ALSO appears as a Model Book card. Saved with the study. */}
        <button title={s.in_model_book ? "In the Model Book — click to remove" : "Add to the Model Book (the winners' textbook). Saved when you save the study."}
          onClick={() => setS({ in_model_book: !s.in_model_book })}
          style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${s.in_model_book ? C.borderGold : C.border}`, color: s.in_model_book ? C.goldBright : C.muted, borderRadius: 8, fontFamily: font, fontSize: "0.78rem", fontWeight: 700, padding: "4px 12px", cursor: "pointer" }}>
          {s.in_model_book ? "★" : "☆"} Model Book</button>
        {/* 📖 Detailed view (Valen 2026-07-25): long-form scrollable study page — big charts + unlimited extras +
            a sticky stats/hypothesis rail. The quick editor stays the default; this opens over it, state intact. */}
        <button title="Open the long-form detailed view — big charts, extra charts, captions, sticky stats rail" onClick={() => setDetailOpen(true)}
          style={{ background: "transparent", border: `1px solid ${C.borderGold}`, color: C.goldBright, borderRadius: 8, fontFamily: font, fontSize: "0.72rem", fontWeight: 700, padding: "4px 12px", cursor: "pointer" }}>📖 Detailed view</button>
        <button title="Collapse (asks first if you have unsaved changes)" onClick={guardedCancel} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, borderRadius: 8, fontFamily: font, fontSize: "0.72rem", padding: "4px 12px", cursor: "pointer" }}>✕ collapse</button>
      </div>

      {/* LEG STRIP (Valen 2026-07-28): one chip per leg of this campaign (structural order from buildCampaigns —
          same as the list + stats), current leg highlighted gold. Click a sibling → saves this leg, then switches.
          "＋ Add leg" → inline date → inserts a new leg (same ticker/setup/campaign, no charts) and switches to it.
          Only shown once the study is persisted (navPos). Solo studies show their single chip + the add button. */}
      {navPos && (() => {
        const legs = navCampaigns[navPos.ci].legs;
        const chipBase = { display: "inline-flex", alignItems: "center", gap: 6, fontFamily: font, fontSize: "0.7rem", fontWeight: 700, padding: "5px 12px", borderRadius: 99, cursor: "pointer", whiteSpace: "nowrap" };
        return (
          <div style={{ margin: "0 0 6px" }}>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.muted, marginRight: 2 }}>Legs</span>
              {legs.map((leg, i) => { const active = leg.id === row.id;
                return <button key={leg.id} type="button" disabled={busy} title={active ? "This leg" : "Switch to this leg (saves the current leg first)"} onClick={() => stripSwitch(leg)}
                  style={{ ...chipBase, border: `1px solid ${active ? C.goldBright : C.border}`, color: active ? C.goldBright : C.muted, background: active ? "rgba(212,175,55,0.18)" : "rgba(255,255,255,0.03)", cursor: busy ? "default" : "pointer" }}>
                  Leg {i + 1}{leg.entry_date ? ` · ${leg.entry_date}` : ""}</button>; })}
              {addingLeg ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input type="date" autoFocus value={newLegDate} onChange={e => setNewLegDate(e.target.value)} style={{ ...inputS, width: 150, padding: "4px 8px" }} />
                  <button type="button" disabled={busy || !newLegDate} onClick={confirmAddLeg} style={{ ...chipBase, border: `1px solid ${C.goldBright}`, color: "#08080e", background: `linear-gradient(135deg,${C.goldBright},${C.goldMid})`, opacity: (busy || !newLegDate) ? 0.5 : 1, cursor: (busy || !newLegDate) ? "default" : "pointer" }}>✓ Add</button>
                  <button type="button" onClick={() => { setAddingLeg(false); setNewLegDate(""); }} style={{ ...chipBase, border: `1px solid ${C.border}`, color: C.muted, background: "transparent" }}>✕</button>
                </span>
              ) : (
                <button type="button" title="Add another leg to this trend — same chart set serves them all" onClick={() => { setAddingLeg(true); setNewLegDate(""); }}
                  style={{ ...chipBase, border: `1px dashed ${C.border}`, color: C.muted, background: "transparent" }}>＋ Add leg</button>
              )}
            </div>
            <div style={{ fontSize: "0.62rem", color: C.muted, marginTop: 5 }}>One chart set serves every leg (charts live on the root leg). Computed metrics fill on the next study-fill run.</div>
          </div>
        );
      })()}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ width: 110 }}><label style={lbl}>Ticker</label><input style={inputS} value={row.ticker} onChange={e => setRow(r => ({ ...r, ticker: e.target.value.toUpperCase() }))} /></div>
        <div style={{ width: 150 }}><label style={lbl}>Trigger date</label><input type="date" style={inputS} value={row.entry_date || ""} onChange={e => setRow(r => ({ ...r, entry_date: e.target.value }))} /></div>
        <div style={{ width: 180 }}><label style={lbl}>Setup</label>
          <select style={inputS} value={s.setup} onChange={e => setS({ setup: e.target.value, checks: {}, m: {} })}>
            {Object.keys(STUDY_SETUPS).map(k => <option key={k}>{k}</option>)}
          </select></div>
        {/* Project (Valen 2026-07-28) — optional grouping so studies collect into named "books" (e.g. a market-bottom
            research push). Free-text with a datalist of existing names so reuse is one click; blank = the Winner-DNA book. */}
        <div style={{ width: 240, flex: "1 1 240px", minWidth: 200 }}><label style={lbl}>Project</label>
          <input style={inputS} list="study-project-names" value={s.project || ""} onChange={e => setS({ project: e.target.value })}
            placeholder="Project (optional) — e.g. Finding the Market's Bottom" />
          <datalist id="study-project-names">{projectNames.map(p => <option key={p} value={p} />)}</datalist></div>
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
        {/* Workflow-v2 slots (Valen 2026-07-29): the two standard charts are HTF (weekly context) and
            LTF (daily setup, right edge = the trigger). Field mapping unchanged — before_img = HTF,
            after_img = LTF — only the language follows his model. 5-min entry detail + extra charts
            live in the 📖 Detailed view; the shared campaign AFTER keeps its own slot below. */}
        {chartSlot("before_img", "HTF — weekly context", "The weekly — where this leg sits in the bigger trend (pole, prior base, era).")}
        {chartSlot("after_img", "LTF — daily setup", "The daily into the trigger — right edge = the trigger day. Grade the ticks off this chart.")}
      </div>
      <div style={{ fontSize: "0.66rem", color: C.muted, marginTop: 6 }}>5-min entry detail + extra charts live in the <b style={{ color: C.goldBright }}>📖 Detailed view</b> — this quick row fills the two standard slots.</div>

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
      {cls && <div style={{ marginTop: 6, marginBottom: 6, fontSize: "0.74rem" }}>Auto-class: <b style={{ color: cls === "failure" ? "#e05555" : "#7ef0a0" }}>{cls === "failure" ? "▼ " : "▲ "}{cls}</b></div>}

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
              {/* Twins: 1–10 preset chips + a custom-number field for any larger count (e.g. 12). ONE value per
                  MA — a chip and the custom field are mutually exclusive (both write checks[store]). Blank until
                  set; never auto-filled. Legacy non-numeric values (e.g. "5+") still display in the field. */}
              {[["legs_ma10", "→ 10MA"], ["legs_ma20", "→ 20MA"]].map(([store, label]) => {
                const presets = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
                const cur = String(s.checks[store] || ""), isPreset = presets.includes(cur), customOn = !!cur && !isPreset;
                return (
                  <div key={store} style={{ minWidth: 200 }}>
                    <div style={{ fontSize: "0.58rem", color: C.muted, marginBottom: 3 }}>{label}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {presets.map(opt => { const on = cur === opt;
                        return <button key={opt} type="button" onClick={() => setS({ checks: { ...s.checks, [store]: on ? "" : opt } })}
                          style={{ background: on ? "rgba(212,175,55,0.18)" : "transparent", border: `1px solid ${on ? C.goldBright : C.border}`, color: on ? C.goldBright : C.muted, borderRadius: 99, fontFamily: font, fontSize: "0.7rem", fontWeight: 700, padding: "5px 11px", cursor: "pointer", minWidth: 30 }}>
                          {opt}</button>; })}
                      <input type="text" inputMode="numeric" placeholder="or N" value={isPreset ? "" : cur}
                        onChange={e => { const raw = e.target.value.replace(/[^\d]/g, ""); const n = parseInt(raw, 10);
                          setS({ checks: { ...s.checks, [store]: raw && n >= 1 ? String(n) : "" } }); }}
                        title="Type any larger leg count (e.g. 12) — selecting a preset chip clears this, and vice-versa"
                        style={{ width: 58, background: customOn ? "rgba(212,175,55,0.18)" : "rgba(255,255,255,0.05)", border: `1px solid ${customOn ? C.goldBright : C.border}`, color: customOn ? C.goldBright : C.white, borderRadius: 99, fontFamily: font, fontSize: "0.7rem", fontWeight: 700, padding: "5px 10px", outline: "none", colorScheme: "dark" }} />
                      {customOn && <span style={{ fontSize: "0.62rem", color: C.goldBright, fontWeight: 700 }}>= {cur} legs</span>}
                    </div>
                  </div>
                );
              })}
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
      <div style={{ marginTop: 8 }}>
        <label style={lbl}>Book narration (prints under the chart in the book/dive — first-person, 40–90 words)</label>
        <textarea style={{ ...inputS, minHeight: 66, resize: "vertical" }} value={s.annotation || ""} onChange={e => setS({ annotation: e.target.value })} />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button disabled={busy} onClick={doSave} style={{ background: `linear-gradient(135deg,${C.goldBright},${C.goldMid})`, color: "#08080e", border: "none", fontFamily: font, fontWeight: 800, fontSize: "0.78rem", padding: "10px 22px", borderRadius: 99, cursor: "pointer" }}>{busy ? "Saving…" : "Save study"}</button>
        <button onClick={guardedCancel} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, fontFamily: font, fontSize: "0.78rem", padding: "10px 18px", borderRadius: 99, cursor: "pointer" }}>Cancel</button>
      </div>

      {/* click-to-zoom lightbox — ← → toggles HTF↔LTF, click backdrop or Esc to close. z 1550: the
          StudyEditor that hosts this opens from a ModelBook backdrop at z 1250, so the lightbox must
          paint above the editor — matches the app-wide "lightboxes above modals" convention (1500+). */}
      {zoom && row[zoom] && (
        <div onClick={e => { if (e.target === e.currentTarget) setZoom(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 1550, background: "rgba(4,4,8,0.9)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
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

      {/* 📖 Detailed view overlay — mounts only while open, over the (still-mounted) quick editor. Shares the
          editor's row/setRow so edits here flip the SAME dirty flag and save through the SAME doSave path. */}
      {detailOpen && <StudyDetailView C={C} font={font} busy={busy} row={row} setRow={setRow}
        onUpload={onUpload} onSave={doSave} onClose={() => setDetailOpen(false)} capBadge={capBadge} badgeStyle={badgeStyle} inheritedCharts={inheritedCharts} />}
    </div>
  );
}
