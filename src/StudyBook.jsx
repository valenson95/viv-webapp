import React, { useState } from "react";

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

// Every metric either system flags as worth recording — same keys every time.
export const STUDY_SETUPS = {
  "Momentum Breakout": {
    checks: [
      ["tight", "Tightening series — ≥3 days with range < 0.6×ATR14 (RMV≈0)"],
      ["orderly", "Orderly base — zero −4% days inside, ascending swing lows"],
      ["pole", "Prior pole ≥30% in 1–3 months"],
      ["linear", "Pole linear — no whipsaw chart"],
      ["young", "Young trend — ≤3rd breakout, not extended/late"],
      ["prior_nr", "Day before trigger = narrow-range or negative day"],
      ["leader", "Leader — top-2% momentum rank (AS ≥98 any of 1M/3M/6M)"],
      ["adr", "ADR20 ≥ 4%"],
      ["theme", "Theme cluster — ≥3 group-mates on the leaderboard"],
      ["re", "Day-1 range expansion ≥4% AND ≤2 up-days before trigger"],
      ["vol", "Volume > prior day · entry pace ≥1.3× run rate"],
      ["closehi", "Closed ≥70% of the day's range"],
      ["ma_surf", "Surfing rising 10/20-day MA into the pivot"],
      ["regime", "Regime ON — index 10SMA > 20SMA, no fast-selling phase"],
    ],
    metrics: [
      ["rs", "AS/RS rank"], ["adr20", "ADR20 %"], ["dolvol_m", "DolVol $M (20d)"],
      ["tight_days", "Tight days (NR streak)"], ["base_days", "Base length (days)"],
      ["pole_pct", "Pole run-up %"], ["pole_days", "Pole length (days)"],
      ["ext_50ma", "Ext from 50MA (×ATR%)"], ["from_high_pct", "% below 52wk high"],
      ["breakout_num", "Breakout # in trend (1st/2nd/3rd…)"], ["up_days_before", "Up-days in a row before trigger"],
      ["re_pct", "Trigger day % move"], ["vol_ratio", "Volume ÷ prior day"],
      ["rvol_eod", "RVol 50d EOD"], ["run_rate", "Run rate at entry (×)"],
      ["closing_range", "Closing range % (C−L)/(H−L)"], ["stop_width_adr", "LOD stop width (×ADR)"],
    ],
  },
  "Episodic Pivot": {
    checks: [
      ["gap", "Gap up ≥10% (or 4%+ earnings day on ≥3× avg volume)"],
      ["volpace", "Massive open volume — full ADV inside 15–20 min"],
      ["premkt", "Huge volume already in pre-market / after-hours"],
      ["growth", "Big YoY EPS/revenue growth + beat + guidance up"],
      ["neglect", "Neglected — <20% run in prior 3 months"],
      ["first", "FIRST big surprise (not a recent 2nd EP)"],
      ["coverage", "Little/no analyst coverage (undiscovered)"],
      ["liquid", "Liquid enough for intended size"],
      ["stopw", "Stop ≤1–1.5× ADR from entry"],
      ["regime", "Regime ON — index 10SMA > 20SMA"],
    ],
    metrics: [
      ["gap_pct", "Gap %"], ["rvol_eod", "RVol 50d EOD (≥3× gate)"], ["run_rate", "Run rate at entry (×)"],
      ["premkt_vol_k", "Pre-market volume (k sh)"], ["yoy_eps", "YoY EPS growth %"], ["yoy_rev", "YoY revenue growth %"],
      ["neglect_3m", "3-mo return before EP %"], ["surprise_num", "Surprise # (1st / 2nd…)"],
      ["analysts", "Analyst count"], ["adr20", "ADR20 %"], ["dolvol_m", "DolVol $M (20d)"],
      ["stop_width_adr", "Stop width (×ADR)"],
    ],
  },
  "Parabolic": {
    checks: [
      ["stretch", "Stretched — +50–100% (large) / +300–1000% (small) in days–weeks"],
      ["updays", "3–5+ consecutive up days into the move"],
      ["ext", "Extension ≥7× ATR% from the 50MA (climax band)"],
      ["trigger", "Trigger — first red 5-min / opening-range break in trade direction"],
      ["vwap", "VWAP fail (short) / reclaim (long) confirmed"],
      ["stopw", "Stop at day-extreme ≤1 ADR"],
      ["target", "Target = 10/20-day MA (cover/exit zone, not a trail)"],
    ],
    metrics: [
      ["run_pct", "Run % into climax"], ["run_days", "Run length (days)"], ["consec_updays", "Consecutive up days"],
      ["ext_50ma", "Ext from 50MA (×ATR%)"], ["dist_10ma_pct", "Distance to 10MA %"], ["dist_20ma_pct", "Distance to 20MA %"],
      ["adr20", "ADR20 %"], ["dolvol_m", "DolVol $M (20d)"], ["rvol_eod", "RVol 50d on climax day"],
    ],
  },
};

// Outcome anatomy — burst shape + campaign shape, shared by all setups.
const OUTCOME_METRICS = [
  ["mfe_d1", "MFE % day 1"], ["mfe_d3", "MFE % day 3"], ["mfe_d5", "MFE % day 5"], ["mfe_d20", "MFE % day 20"],
  ["day2_pct", "Day-2 % move (follow-through size)"], ["burst_days", "Burst length (days)"], ["burst_pct", "Burst magnitude %"],
  ["mae", "MAE % (before MFE)"], ["giveback_pct", "Giveback after burst %"],
  ["days_above_10ma", "Days above 10MA (campaign length)"], ["trail_r", "Trail-exit total R (10/20MA sim)"],
];

const GRADES = ["C", "B", "A", "A+"];

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

// factor lift across resolved studies: P(factor | winner) / P(factor | failure)
export function liftTable(rows) {
  const entries = rows.map(r => r.metrics.study).filter(s => s && outcomeClass(s));
  const win = entries.filter(s => ["big winner", "monster"].includes(outcomeClass(s)));
  const fail = entries.filter(s => outcomeClass(s) === "failure");
  const keys = new Set();
  entries.forEach(s => Object.keys(s.checks || {}).forEach(k => keys.add(`${s.setup}|${k}`)));
  const out = [];
  keys.forEach(sk => {
    const [setup, k] = sk.split("|");
    const label = (STUDY_SETUPS[setup]?.checks.find(c => c[0] === k) || [])[1] || k;
    const pW = win.length ? win.filter(s => s.setup === setup && s.checks?.[k]).length / win.length : 0;
    const pF = fail.length ? fail.filter(s => s.setup === setup && s.checks?.[k]).length / fail.length : 0;
    out.push({ setup, k, label, pW, pF, lift: pF > 0 ? pW / pF : (pW > 0 ? Infinity : 0) });
  });
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
  const chartSlot = (slot, title, hint) => (
    <div style={{ flex: 1, minWidth: 240 }}>
      <label style={lbl}>{title}</label>
      <div style={{ fontSize: "0.62rem", color: C.muted, marginBottom: 6 }}>{hint}</div>
      <input type="file" accept="image/*" onChange={e => onUpload(e.target.files[0], slot, setRow)} style={{ fontSize: "0.7rem", color: C.muted }} />
      {row[slot] && <img src={row[slot]} alt="" style={{ display: "block", marginTop: 8, width: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(0,0,0,0.3)" }} />}
    </div>
  );
  const doSave = () => {
    if (!row.ticker.trim()) { alert("Ticker first."); return; }
    const body = { ...row, pattern: s.setup === "Parabolic" ? `Parabolic ${s.direction === "short" ? "Short" : "Long"}` : s.setup,
      outcome: cls ? MB_OUTCOME[cls] : null, thesis: row.thesis,
      lesson: [s.refusal && `REFUSE-IF: ${s.refusal}`, row.lesson].filter(Boolean).join("\n") || null };
    onSave(body);
  };
  return (
    <div style={{ background: C.glass, border: `1px solid ${C.goldBright}`, borderRadius: 14, padding: 18, marginBottom: 18, fontFamily: font }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ width: 110 }}><label style={lbl}>Ticker</label><input style={inputS} value={row.ticker} onChange={e => setRow(r => ({ ...r, ticker: e.target.value.toUpperCase() }))} /></div>
        <div style={{ width: 150 }}><label style={lbl}>Trigger date</label><input type="date" style={inputS} value={row.entry_date || ""} onChange={e => setRow(r => ({ ...r, entry_date: e.target.value }))} /></div>
        <div style={{ width: 180 }}><label style={lbl}>Setup</label>
          <select style={inputS} value={s.setup} onChange={e => setS({ setup: e.target.value, checks: {}, m: {} })}>
            {Object.keys(STUDY_SETUPS).map(k => <option key={k}>{k}</option>)}
          </select></div>
        {s.setup === "Parabolic" && <div style={{ width: 110 }}><label style={lbl}>Direction</label>
          <select style={inputS} value={s.direction} onChange={e => setS({ direction: e.target.value })}><option>short</option><option>long</option></select></div>}
        <div style={{ width: 170 }}><label style={lbl}>Market condition</label><input style={inputS} placeholder="uptrend / chop / …" value={s.regime_tag} onChange={e => setS({ regime_tag: e.target.value })} /></div>
        <div style={{ width: 130 }}><label style={lbl}>Quality (optional)</label>
          <select style={inputS} value={s.grade?.letter || ""} onChange={e => setS({ grade: { letter: e.target.value } })}><option value="">—</option>{GRADES.map(g => <option key={g}>{g}</option>)}</select></div>
      </div>

      <div style={sect}>Charts — two timeframes</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {chartSlot("before_img", "HTF chart", "Weekly/monthly — the pole, the base in context, where it sits in the longer trend")}
        {chartSlot("after_img", "LTF chart", "Daily/intraday — the tightening, the trigger bar, the stop structure")}
      </div>

      <div style={sect}>Factor card ({s.setup})</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: "2px 18px" }}>
        {def.checks.map(([k, t]) => (
          <label key={k} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "0.76rem", padding: "3px 0", cursor: "pointer" }}>
            <input type="checkbox" style={{ accentColor: C.goldBright, marginTop: 3 }} checked={!!s.checks[k]} onChange={e => setS({ checks: { ...s.checks, [k]: e.target.checked } })} />{t}
          </label>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(190px,1fr))", gap: 8, marginTop: 10 }}>
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
    </div>
  );
}
