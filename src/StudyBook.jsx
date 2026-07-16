import React, { useState, useEffect } from "react";

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
        ["tight", "Tightening series — ≥3 visibly narrow-range days pre-trigger"],
        ["vol_dry", "Volume drying up in the base (lower than usual)"],
        ["orderly", "Orderly base — no big red bars inside"],
        ["higher_lows", "Higher lows forming into the pivot"],
        ["prior_nr", "Day before trigger = narrow-range or negative day"],
        ["inside", "Inside bar(s) right before the trigger — coil tell", "bonus"],
        ["ma_conv", "SMA 10/20/50 converging at the pivot", "bonus"],
        ["ma_surf", "Surfing rising 10/20-day MA into the pivot"],
      ]},
      { title: "Trigger day", items: [
        ["re", "Day-1 range expansion ≥4% — bar visibly bigger than last 5–10"],
        ["up2", "≤2 up-days before the trigger (not buying day 3)"],
        ["closehi", "Closed ≥70% of the day's range"],
        ["vol_exp", "Volume expansion — trigger bar volume above prior day"],
        ["gapped", "Gapped up on the trigger day"], // sub-categorized by gap % (checks.gap_band) — Valen 2026-07-14
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
  ["day2_pct", "Day-2 % move (follow-through size)"], ["burst_days", "Burst length (up-closes AFTER trigger; +1 = Bonde count)"], ["burst_pct", "Burst magnitude % (from pre-trigger close)"],
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
  const box = { background: "rgba(0,0,0,0.25)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", flex: 1, minWidth: 130 };
  const small = n < 30;
  const bySetup = {};
  rows.forEach(r => { const s = r.metrics.study.setup; bySetup[s] = (bySetup[s] || 0) + 1; });
  return (
    <div style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: C.goldBright, marginBottom: 10 }}>Study scoreboard</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <div style={box}><b style={{ fontSize: "1.1rem" }}>{rows.length}</b><div style={{ fontSize: "0.6rem", color: C.muted }}>STUDIES</div></div>
        {Object.entries(bySetup).map(([k, v]) => (
          <div key={k} style={box}><b style={{ fontSize: "1.1rem" }}>{v}</b><div style={{ fontSize: "0.6rem", color: C.muted }}>{k.toUpperCase()}</div></div>
        ))}
        <div style={box}><b style={{ fontSize: "1.1rem" }}>{nWin}W / {nFail}F</b><div style={{ fontSize: "0.6rem", color: C.muted }}>RESOLVED CLASSES</div></div>
      </div>
      {/* Outcome-class glossary — the PRE-REGISTERED definitions (winner-dna.md); measured from
          the trigger day's 5-min-ORH entry, never re-defined after seeing data. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, fontSize: "0.62rem", color: C.muted }}>
        {[["🦖 Monster", "ran +20% or more within 20 sessions of the trigger — the campaign class the whole study hunts"],
          ["🏆 Big winner", "ran +8% or more within 5 sessions — a real burst (the 8–40% class)"],
          ["🌱 Works small", "only +4–8% in 5 sessions — the idea worked but paid little; partials matter here"],
          ["💀 Failure", "under +4% in 5 sessions, or broke the trigger-day low before ever reaching +4% — the control group that makes lift math possible"],
        ].map(([term, def]) => (
          <span key={term} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "3px 9px" }}>
            <b style={{ color: C.goldBright }}>{term}</b> — {def}
          </span>
        ))}
      </div>
      {lifts.length > 0 && (
        <>
          <div style={{ fontSize: "0.62rem", color: small ? "#e0a955" : C.muted, marginBottom: 6 }}>
            {small ? `⚠ n=${n} — early read, believe nothing before n≥30 per class (promote at n≥50). Add FAILURES too — without them lift can't be computed (winners-only = survivor bias).`
                   : `n=${n} resolved — lift = % of winners with the factor ÷ % of failures with it. ≥2 = edge candidate · ~1 = noise.`}
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {lifts.slice(0, 16).map((l, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.68rem", padding: "3px 0", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                <span style={{ width: 120, color: C.muted, flexShrink: 0 }}>{l.setup}</span>
                <span style={{ flex: 1 }}>{l.label}</span>
                <span style={{ color: C.muted }}>{Math.round(l.pW * 100)}%W · {Math.round(l.pF * 100)}%F</span>
                <b style={{ width: 52, textAlign: "right", color: l.lift >= 2 ? "#7ef0a0" : l.lift < 0.7 ? "#e05555" : C.muted }}>{l.lift === Infinity ? "∞" : l.lift.toFixed(2)}×</b>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function StudyEditor({ C, font, busy, initial, onSave, onCancel, onUpload }) {
  const [row, setRow] = useState(() => ({
    ticker: "", entry_date: "", before_img: "", after_img: "", thesis: "", lesson: "",
    ticked: [], elite: [], characteristics: [], is_published: false,
    ...(initial || {}),
    // outcome_img is a VIRTUAL slot (no DB column) — lives in metrics.study.outcome_img; lifted
    // to top level here so chartSlot/uploadImg/zoom treat all three charts identically.
    outcome_img: initial?.metrics?.study?.outcome_img || "",
    metrics: { ...(initial?.metrics || {}), study: initial?.metrics?.study || {
      setup: "Momentum Breakout", direction: "long", regime_tag: "",
      checks: {}, m: {}, grade: { letter: "" }, outcome: {}, refusal: "",
    } },
  }));
  const s = row.metrics.study;
  const setS = (patch) => setRow(r => ({ ...r, metrics: { ...r.metrics, study: { ...r.metrics.study, ...patch } } }));
  const def = STUDY_SETUPS[s.setup] || STUDY_SETUPS["Momentum Breakout"];
  const inputS = { background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 8, color: C.white, fontFamily: font, fontSize: "0.78rem", padding: "7px 10px", outline: "none", width: "100%", colorScheme: "dark" };
  const lbl = { fontSize: "0.58rem", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: C.muted, marginBottom: 4, display: "block" };
  const sect = { fontSize: "0.6rem", fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: C.goldBright, margin: "14px 0 8px" };
  const cls = outcomeClass(s);
  // ── click-to-zoom lightbox: click any chart to enlarge, ←/→ cycles Context→BEFORE→AFTER, Esc closes ──
  const [zoom, setZoom] = useState(null); // null | "before_img" | "after_img" | "outcome_img"
  const SLOT_TITLES = { before_img: "CONTEXT — HTF", after_img: "BEFORE — the setup", outcome_img: "AFTER — the outcome" };
  const zoomSlots = ["before_img", "after_img", "outcome_img"].filter(k => row[k]); // only attached charts
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
  const chartSlot = (slot, title, hint) => (
    <div style={{ flex: 1, minWidth: 240 }}>
      <label style={lbl}>{title}</label>
      <div style={{ fontSize: "0.62rem", color: C.muted, marginBottom: 6 }}>{hint}</div>
      <input type="file" accept="image/*" onChange={e => onUpload(e.target.files[0], slot, setRow)} style={{ fontSize: "0.7rem", color: C.muted }} />
      {row[slot] && <img src={row[slot]} alt="" onClick={() => setZoom(slot)} title="Click to zoom (← → cycles Context/BEFORE/AFTER · Esc closes)" style={{ display: "block", marginTop: 8, width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.3)", cursor: "zoom-in" }} />}
    </div>
  );
  const doSave = () => {
    if (!row.ticker.trim()) { alert("Ticker first."); return; }
    const q = studyQuality(s); // grade is derived from ticks at save time — stored for the grid + calibration
    const { outcome_img, ...bodyRow } = row; // virtual slot → folded back into metrics.study (no DB column)
    const body = { ...bodyRow,
      metrics: { ...row.metrics, study: { ...s, outcome_img: outcome_img || "", grade: { letter: q.letter === "—" ? "" : q.letter, auto: true, on: q.on, total: q.total } } },
      pattern: s.setup === "Parabolic" ? `Parabolic ${s.direction === "short" ? "Short" : "Long"}` : s.setup,
      outcome: cls ? MB_OUTCOME[cls] : null, thesis: row.thesis,
      lesson: [s.refusal && `REFUSE-IF: ${s.refusal}`, row.lesson].filter(Boolean).join("\n") || null };
    onSave(body);
  };
  return (
    <div style={{ background: C.glass, border: `1px solid ${C.goldBright}`, borderRadius: 14, padding: 18, marginBottom: 18, fontFamily: font }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
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

      <div style={sect}>Charts — two timeframes</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {chartSlot("before_img", "Context — HTF", "Weekly/monthly — the pole, the base in context, where it sits in the longer trend")}
        {chartSlot("after_img", "BEFORE — the setup", "Daily/intraday with the RIGHT EDGE = trigger day — exactly what your eyes saw at the decision moment")}
        {chartSlot("outcome_img", "AFTER — the outcome", "Same chart weeks later — what the setup became. BEFORE→AFTER is the pattern-recognition rep")}
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

      {/* 📊 Auto section — study-fill.mjs / Claude fills these; Valen only corrects. */}
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
      {cls && <div style={{ marginTop: 8, fontSize: "0.74rem" }}>Auto-class: <b style={{ color: cls === "failure" ? "#e05555" : "#7ef0a0" }}>{cls}</b></div>}

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
          <img src={row[zoom]} alt={zoom} style={{ maxWidth: "96vw", maxHeight: "82vh", objectFit: "contain", borderRadius: 10, border: `1px solid ${C.borderGold}`, cursor: "zoom-out" }} onClick={() => setZoom(null)} />
        </div>
      )}
    </div>
  );
}
