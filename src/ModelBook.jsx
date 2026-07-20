import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabaseClient";
import { getGrade } from "./grades.js";
import { SECTIONS, sectionsFor, scoreTicked, versionOf, stampV2 } from "./SetupGrader.jsx";
import { sectorFor } from "./sectors.js";
import { isStudyRow, StudyEditor, StudyScoreboard, outcomeClass, studyQuality } from "./StudyBook.jsx";

// A study starred for the Model Book shows as a card; its star count comes from the study's
// auto quality grade (tick-%) rather than the 16-criteria Model Book ticks it doesn't have.
// Quality is computed LIVE from the current ticks (studyQuality), never read from a stored
// grade.letter — that stale-grade path drifted whenever ticks were edited outside the editor.
const STUDY_LETTER_N = { "A+": 5, A: 4, B: 3, C: 2 };
const inModelBook = (r) => isStudyRow(r) && !!r.metrics?.study?.in_model_book;
const cardStars = (r) => isStudyRow(r) ? (STUDY_LETTER_N[studyQuality(r.metrics.study).letter] || 0) : r.stars;
// Study rows map chart slots differently from card rows: after_img = BEFORE (the setup, right edge
// = trigger) and the AFTER outcome lives in metrics.study.outcome_img (virtual slot; before_img =
// optional HTF context). Cards + detail must present the study PAIR or the outcome never shows.
const displayImgs = (r) => isStudyRow(r)
  ? { before: r.after_img || r.before_img || "", after: r.metrics?.study?.outcome_img || "" }
  : { before: r.before_img || "", after: r.after_img || "" };

// tolerant date → ISO (journal trades carry ISO or M/D/YY)
const mbISO = (d) => {
  if (!d) return "";
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  return "";
};

// ── Card date range → "Feb 18 → Apr 30, 2025" (ISO in; tolerant of null / one-sided ranges)
const mbFmtDay = (iso) => {
  if (!iso) return "";
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00");
  return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const mbDateRange = (entry, exit) => {
  const e = mbFmtDay(entry), x = mbFmtDay(exit);
  const yr = String(exit || entry || "").slice(0, 4);
  const yTag = /^\d{4}$/.test(yr) ? `, ${yr}` : "";
  if (e && x) return `${e} → ${x}${yTag}`;
  const one = e || x;
  return one ? `${one}${yTag}` : "";
};

// ══════════════════════════════════════════════════════════════════
// VIV MODEL BOOK — curated database of the best winning setups, for
// pattern-recognition study. Each entry = before/after charts + the full
// setup-grade scorecard + the ELITE-factor layer that separates a
// "7-star trade on a 5-star scale" from an ordinary 4★ setup.
// Admin curates; members study PUBLISHED entries. Run supabase/modelbook.sql.
// ══════════════════════════════════════════════════════════════════

export const PATTERNS = ["Trendline Breakout", "Pullback Buy", "Episodic Pivot", "VCP"];
export const OUTCOMES = ["Huge Winner", "Winner", "Subpar", "Loser"];

// ── Objective star math — the EXACT Setup Grader checklist + formula (perfect mirror, zero bias).
// The stars are COMPUTED from the ticks; nothing is hand-assigned. VERSION-AWARE via scoreTicked:
// a legacy row is scored against the v1 list + denominator, a v2 row against v2 — a saved row is
// NEVER re-scored against the wrong checklist. Returns {stars,passed,starHit,pct,total,starmakers}.
// opts passes straight through to scoreTicked (default = admin/live behavior, ★-maker gated).
// Member Model Book editor passes { makerGate: false } → equal-weight ticks, no confluence gate.
export function starsFromTicked(ticked, opts) { return scoreTicked(ticked, opts); }

// ── My Book CSV export (member-requested: run your own entries through any analysis tool) ──
// One flat row per entry; every v2 checklist tick is its own named TRUE/FALSE column so
// commonalities are countable without parsing. Legacy-checklist (v1) rows keep tick columns
// BLANK (their ticks scored against a different list — blank = "not measured", never guessed).
const CSV_TICK_COLS = [ // fixed v2 si-ii order — stays in lockstep with SECTIONS in SetupGrader.jsx
  ["0-0", "prior_pole_30pct"], ["0-1", "pole_linear"], ["0-2", "young_trend"],
  ["1-0", "tightening_series"], ["1-1", "volume_dry_up"], ["1-2", "orderly_base"], ["1-3", "higher_lows"],
  ["1-4", "day_before_quiet"], ["1-5", "inside_bar_bonus"], ["1-6", "ma_convergence_bonus"], ["1-7", "surfing_ma"],
  ["2-0", "day1_range_expansion"], ["2-1", "max2_updays"], ["2-2", "closed_70pct_range"], ["2-3", "volume_expansion"], ["2-4", "gapped_up"],
];
const csvCell = (v) => { const s = v == null ? "" : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function buildMyBookCsv(rows, { makerGate } = {}) {
  const head = ["ticker", "entry_date", "exit_date", "pattern", "theme", "outcome", "stars", "score_pct", "checklist_version",
    ...CSV_TICK_COLS.map(([, name]) => name),
    "captured_pct", "run_up_pct", "days_held", "r_multiple", "characteristics", "thesis", "lesson", "chart_before_url", "chart_after_url"];
  const lines = [head.join(",")];
  for (const r of rows) {
    const v2 = versionOf(r.ticked) !== 1;
    const tset = new Set(r.ticked || []);
    const g = scoreTicked(r.ticked, makerGate === false ? { makerGate: false } : undefined);
    lines.push([
      r.ticker, r.entry_date, r.exit_date, r.pattern, r.theme, r.outcome, g.stars, g.pct != null ? Math.round(g.pct * 100) + "%" : "", v2 ? "v2" : "v1",
      ...CSV_TICK_COLS.map(([k]) => (v2 ? (tset.has(k) ? "TRUE" : "FALSE") : "")),
      r.run_pct, r.run_up_pct, r.days_held, r.r_mult, (r.characteristics || []).join(" | "), r.thesis, r.lesson, r.before_img, r.after_img,
    ].map(csvCell).join(","));
  }
  return lines.join("\r\n");
}
export function downloadMyBookCsv(rows, opts) {
  const blob = new Blob(["﻿" + buildMyBookCsv(rows, opts)], { type: "text/csv;charset=utf-8" }); // BOM: Excel opens UTF-8 cleanly
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `VIV-ModelBook-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ── My Book PDF export — a branded study book: one entry per page, BEFORE → AFTER charts,
// score + ticked factors + the member's own thesis/lesson. Opens a print view in a new tab;
// the browser's native "Save as PDF" does the rendering (no libraries, charts included).
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export function openMyBookPdf(rows, { makerGate } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = (r) => {
    const g = scoreTicked(r.ticked, makerGate === false ? { makerGate: false } : undefined);
    const tset = new Set(r.ticked || []);
    const ticks = sectionsFor(r.ticked).filter((s) => !s.reminder).flatMap((sec, si) =>
      sec.items.map((it, ii) => tset.has(si + "-" + ii) ? `<span class="tick">✓ ${esc(it.c)}</span>` : "").filter(Boolean));
    const stat = (k, v) => v || v === 0 ? `<div class="st"><div class="sk">${k}</div><div class="sv">${esc(v)}</div></div>` : "";
    return `<section class="entry">
      <div class="ehead">
        <div><span class="tk">${esc(r.ticker)}</span><span class="pat">${esc(r.pattern || "")}</span></div>
        <div class="emeta">${esc(r.entry_date || "")}${r.exit_date ? " → " + esc(r.exit_date) : ""} · <b class="${/win/i.test(r.outcome || "") ? "good" : /los/i.test(r.outcome || "") ? "bad" : ""}">${esc(r.outcome || "—")}</b> · ${"★".repeat(g.stars || 0)}${"☆".repeat(Math.max(0, 5 - (g.stars || 0)))} ${g.pct != null ? Math.round(g.pct * 100) + "%" : ""}</div>
      </div>
      <div class="charts">
        <figure><figcaption>BEFORE — the setup</figcaption>${r.before_img ? `<img src="${esc(r.before_img)}"/>` : '<div class="noimg">no chart</div>'}</figure>
        <figure><figcaption>AFTER — the outcome</figcaption>${r.after_img ? `<img src="${esc(r.after_img)}"/>` : '<div class="noimg">no chart</div>'}</figure>
      </div>
      <div class="stats">${stat("Captured %", r.run_pct)}${stat("Run-up % (peak)", r.run_up_pct)}${stat("Days held", r.days_held)}${stat("R multiple", r.r_mult)}${stat("Theme", r.theme)}</div>
      ${ticks.length ? `<div class="ticks">${ticks.join("")}</div>` : ""}
      ${r.thesis ? `<div class="note"><b>Thesis:</b> ${esc(r.thesis)}</div>` : ""}
      ${r.lesson ? `<div class="note"><b>Lesson:</b> ${esc(r.lesson)}</div>` : ""}
    </section>`;
  };
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>My Model Book — ${today}</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;margin:0}
      body{background:#08080e;color:#e8e6e0;font-family:'Plus Jakarta Sans',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      @page{size:A4;margin:0}
      .page,.entry{padding:34px 38px;page-break-after:always;min-height:96vh}
      .cover{display:flex;flex-direction:column;justify-content:center;min-height:96vh}
      .cover .brand{color:#c9982a;font-size:0.8rem;font-weight:800;letter-spacing:0.3em;text-transform:uppercase}
      .cover h1{font-size:2.6rem;font-weight:800;letter-spacing:-0.03em;margin:14px 0 8px}
      .cover .sub{color:#9a968c;font-size:0.95rem}
      .toolbar{position:fixed;top:14px;right:14px;display:flex;gap:8px;z-index:9}
      .toolbar button{background:linear-gradient(120deg,#c9982a,#f0c050);border:none;color:#08080e;font-family:inherit;font-weight:800;font-size:0.85rem;padding:10px 20px;border-radius:99px;cursor:pointer}
      @media print{.toolbar{display:none}}
      .ehead{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(201,152,42,0.35);padding-bottom:10px;margin-bottom:14px}
      .tk{font-size:1.7rem;font-weight:800;letter-spacing:-0.02em}
      .pat{margin-left:12px;color:#c9982a;font-weight:700;font-size:0.85rem}
      .emeta{color:#9a968c;font-size:0.8rem;font-weight:700}
      .good{color:#22c55e}.bad{color:#ef4444}
      .charts{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
      figure{min-width:0}
      figure img{width:100%;max-height:52vh;object-fit:contain;border:1px solid rgba(255,255,255,0.12);border-radius:10px;background:#000}
      figcaption{font-size:0.62rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#c9982a;margin-bottom:5px}
      .noimg{border:1px dashed rgba(255,255,255,0.2);border-radius:10px;padding:30px;text-align:center;color:#666;font-size:0.8rem}
      .stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
      .st{border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:7px 14px;background:rgba(255,255,255,0.03)}
      .sk{font-size:0.56rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#9a968c}
      .sv{font-size:0.95rem;font-weight:800;margin-top:1px}
      .ticks{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
      .tick{font-size:0.66rem;font-weight:700;color:#e8e6e0;border:1px solid rgba(201,152,42,0.4);background:rgba(201,152,42,0.08);border-radius:99px;padding:4px 10px}
      .note{font-size:0.8rem;line-height:1.55;color:#cfccc3;margin-bottom:8px}
      .note b{color:#c9982a}
      .foot{color:#66635b;font-size:0.6rem;margin-top:10px}
    </style></head><body>
    <div class="toolbar"><button onclick="window.print()">⬇ Save as PDF</button></div>
    <div class="page cover">
      <div class="brand">Valen Insiders Vault</div>
      <h1>My Model Book</h1>
      <div class="sub">${rows.length} ${rows.length === 1 ? "entry" : "entries"} · exported ${today}</div>
      <div class="sub" style="margin-top:26px;max-width:60ch;line-height:1.6">Your own pattern library — the setup, the factors that were present, and the outcome. Study the pairs; the commonalities are the edge. Educational, not advice.</div>
    </div>
    ${rows.map(entry).join("")}
    <script>window.onload=()=>{const imgs=[...document.images];Promise.all(imgs.map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r})))};</script>
    </body></html>`;
  // Blob URL instead of document.write into about:blank — Safari/strict browsers render the
  // latter as a blank page. A blob document is a first-class page in every browser.
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const w = window.open(url, "_blank");
  if (!w) { URL.revokeObjectURL(url); return alert("Pop-up blocked — allow pop-ups for this site to export the PDF."); }
  setTimeout(() => URL.revokeObjectURL(url), 60000); // long grace: the tab must finish loading images
}

// The elite layer — ONLY factors the Setup Grader checklist does NOT already score
// (no double-counting: dead volume / inside days / EMA pinch / freshness are grader ★-makers).
export const ELITE = [
  { k: "tiny-stop",   c: "Stop under ½ ADR → 15–20R math",     s: "The trigger structure allows an unusually tight stop." },
  { k: "the-leader",  c: "THE leader of the #1 theme",          s: "Not a follower in a hot group — the name defining it." },
  { k: "catalyst",    c: "Real catalyst under the base",        s: "Earnings/news power confirms the technical setup (EP layer)." },
  { k: "tennis-ball", c: "Tennis-ball action on market dips",   s: "Fell least and snapped back first when the market pulled back." },
  { k: "regime",      c: "Full regime tailwind",                s: "Market trending up, breadth expanding, leaders working everywhere." },
];

// computed base stars (0-5) + elite count → the "N★ on a 5★ scale" label
export function effectiveStars(stars, eliteCount) {
  if (stars >= 5 && eliteCount >= 4) return { n: 7, label: "7★ · Generational" };
  if (stars >= 5 && eliteCount >= 2) return { n: 6, label: "6★ · Elite" };
  return { n: Math.max(0, Math.min(5, stars)), label: `${Math.max(0, Math.min(5, stars))}★` };
}

// ── Outcome — auto-classified so the tag is consistent (no vibes). R first, captured-% fallback.
//    Huge Winner ≥5R · Winner 2–5R · Subpar −0.5R…2R (didn't pay for the risk taken) · Loser ≤−0.5R.
//    Study charts with no R: managed-capture % ≥30 → Huge, ≥10 → Winner, ≥0 → Subpar, <0 → Loser.
export function outcomeFromR(rMult, runPct) {
  const r = rMult === "" || rMult == null ? null : +rMult;
  if (r != null && !Number.isNaN(r)) return r >= 5 ? "Huge Winner" : r >= 2 ? "Winner" : r > -0.5 ? "Subpar" : "Loser";
  const p = runPct === "" || runPct == null ? null : +runPct;
  if (p != null && !Number.isNaN(p)) return p >= 30 ? "Huge Winner" : p >= 10 ? "Winner" : p >= 0 ? "Subpar" : "Loser";
  return null;
}

const Stars = ({ C, n, max, size = "0.95rem" }) => {
  const slots = max || (n >= 6 ? n : 5); // 5-star base scale; the 6th/7th (green) show only for elite
  return (
    <span style={{ letterSpacing: 1.5, fontSize: size, whiteSpace: "nowrap" }}>
      {Array.from({ length: slots }, (_, k) => (
        <span key={k} style={{ color: k < n ? (k >= 5 ? "#7ef0a0" : C.goldBright) : "rgba(255,255,255,0.13)", textShadow: k < n ? "0 0 10px rgba(240,192,80,0.4)" : "none" }}>★</span>
      ))}
    </span>
  );
};

// ── Entry editor — MODULE scope on purpose: defined inline it was recreated on every
// parent render (new component type → React unmounts/remounts → typed form wiped, prefill
// lost, uploads resolving against a dead instance). Do not move it back inside the page.
function MBEditor({ C, font, busy, isAdmin, initial, onSave, onCancel, onUpload, journaledTrades }) {
  const chipBtn = { fontSize: "0.72rem", fontWeight: 700, padding: "6px 14px", borderRadius: 99, cursor: "pointer", fontFamily: font, border: `1px solid ${C.border}`, color: C.muted, background: "rgba(255,255,255,0.03)" };
  const inputS = { background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 10, color: C.white, fontFamily: font, fontSize: "0.84rem", padding: "9px 12px", outline: "none", width: "100%", colorScheme: "dark" };
  const lbl = { fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 6, display: "block" };
    const [row, setRow] = useState(() => {
      let prefill = {};
      try { prefill = JSON.parse(sessionStorage.getItem("viv-mb-prefill") || "{}"); sessionStorage.removeItem("viv-mb-prefill"); } catch {}
      const base = {
        ticker: "", pattern: "Trendline Breakout", theme: "", entry_date: "", exit_date: "", before_img: "", after_img: "",
        elite: [], ticked: [], outcome: "", run_pct: "", run_up_pct: "", angle: "", characteristics: [],
        days_held: "", r_mult: "", thesis: "", lesson: "", is_published: false, metrics: {},
        ...prefill, ...(initial || {}),
      };
      // Stamp NEW / empty / already-v2 tick arrays with the v2 marker up front so versionOf stays
      // unambiguous as the admin ticks (a bare "0-0" would otherwise read as a legacy key). Genuine
      // legacy rows (real keys, no marker) are left untouched and keep scoring on the v1 list.
      if (versionOf(base.ticked) === 2) base.ticked = stampV2(base.ticked || []);
      return base;
    });
    // Members grade on a simpler, equal-weight rule: every scored tick counts the same and stars are
    // pure tick-proportion (no ★-maker confluence gate on the 5th star). Admin keeps the full gated
    // rule + Elite layer for his own books/studies. bonus ticks stay excluded from the score for both.
    const memberMode = !isAdmin;
    const graded = starsFromTicked(row.ticked, memberMode ? { makerGate: false } : undefined); // OBJECTIVE — version-aware (scoreTicked): never re-scores a legacy row against v2
    const eff = effectiveStars(graded.stars, (row.elite || []).length);
    // AUTO-FILL layer — metrics._auto lists every field/tick VIV pre-filled from the chart (shown as a
    // gold dot). A human edit on that field clears its dot: the value becomes Valen-confirmed.
    const auto = new Set((row.metrics && row.metrics._auto) || []);
    const clearAuto = (r, key) => { const m = r.metrics || {}; return { ...m, _auto: (m._auto || []).filter(x => x !== key) }; };
    const setField = (key, val) => setRow(r => ({ ...r, [key]: val, metrics: clearAuto(r, key) }));
    const AutoDot = ({ k }) => auto.has(k) ? <span title="Auto-filled from your chart by VIV — edit to correct (the dot clears)" style={{ display: "inline-block", width: 7, height: 7, borderRadius: 99, background: C.goldBright, boxShadow: "0 0 7px rgba(240,192,80,0.85)", marginLeft: 6, verticalAlign: "middle", flexShrink: 0 }} /> : null;
    const toggleElite = (k) => setRow(r => ({ ...r, elite: r.elite.includes(k) ? r.elite.filter(x => x !== k) : [...r.elite, k], metrics: clearAuto(r, "elite:" + k) }));
    const toggleTick = (key) => setRow(r => {
      const m2 = clearAuto(r, "tick:" + key);
      return { ...r, ticked: r.ticked.includes(key) ? r.ticked.filter(x => x !== key) : [...r.ticked, key],
        metrics: { ...m2, needs_eye: (m2.needs_eye || []).filter(x => x !== key) } }; // reviewing an item clears it from "needs your eye"
    });
    const suggestedOutcome = outcomeFromR(row.r_mult, row.run_pct);
    const pullGrade = () => {
      const g = getGrade(row.ticker);
      if (g && g.ticked) setRow(r => ({ ...r, ticked: g.ticked }));
    };
    // ⚡ SHADOW-FILL — type a ticker you've actually traded and the editor offers that
    // journal trade: one click imports dates/%/R/days/theme/outcome (gold-dotted).
    const shadow = (() => {
      if (row.id || !row.ticker || row.ticker.length < 2 || !journaledTrades?.length) return null;
      if (row.entry_date || row.exit_date || row.run_pct !== "" || row.r_mult !== "") return null; // already filled
      return journaledTrades
        .filter(t => t.exit && String(t.ticker).toUpperCase().trim() === row.ticker)
        .sort((a, b) => mbISO(b.exit).localeCompare(mbISO(a.exit)))[0] || null;
    })();
    const applyShadow = () => {
      if (!shadow) return;
      const eI = mbISO(shadow.entry), xI = mbISO(shadow.exit);
      const days = eI && xI ? Math.max(0, Math.round((new Date(xI) - new Date(eI)) / 86400000)) : "";
      const g = getGrade(row.ticker);
      const fills = {
        entry_date: eI, exit_date: xI,
        run_pct: shadow.plPct != null ? +Number(shadow.plPct).toFixed(1) : "",
        r_mult: shadow.rMult != null ? +Number(shadow.rMult).toFixed(2) : "",
        days_held: days, theme: sectorFor(row.ticker) || "",
        outcome: outcomeFromR(shadow.rMult, shadow.plPct) || "",
      };
      setRow(r => ({
        ...r, ...fills, ticked: (g && g.ticked && !r.ticked.length) ? g.ticked : r.ticked,
        metrics: { ...(r.metrics || {}), _auto: [...new Set([...((r.metrics || {})._auto || []), ...Object.keys(fills).filter(k => fills[k] !== "" && fills[k] != null)])].sort() },
      }));
    };
    // 📋 Paste-to-upload: copy a chart screenshot, hit ⌘V/Ctrl+V anywhere in the editor —
    // first paste fills the BEFORE slot, second fills AFTER (replace by clearing first).
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find(i => i.type && i.type.startsWith("image/"));
      if (!item) return;
      e.preventDefault();
      const file = item.getAsFile();
      if (!file) return;
      const slot = !row.before_img ? "before_img" : "after_img";
      onUpload(file, slot, setRow);
    };
    return (
      <div onPaste={onPaste} style={{ fontFamily: font, background: C.glass, border: `1px solid ${C.borderGold}`, borderRadius: 18, padding: "20px 22px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 800, color: C.white }}>{row.id ? `Edit ${row.ticker}` : "Add to the Model Book"}</div>
          <div style={{ marginLeft: "auto" }}><Stars C={C} n={eff.n} /></div>
          <span style={{ fontSize: "0.78rem", fontWeight: 800, color: eff.n >= 6 ? "#7ef0a0" : C.goldBright }}>{eff.label}</span>
        </div>
        {auto.size > 0 && (
          <div style={{ fontSize: "0.72rem", fontWeight: 600, color: C.goldBright, marginBottom: 12 }}>
            <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 99, background: C.goldBright, boxShadow: "0 0 7px rgba(240,192,80,0.85)", marginRight: 7, verticalAlign: "middle" }} />
            gold dot = auto-filled from your chart — cross-check and edit anything that's off (editing clears the dot)
          </div>
        )}
        {shadow && (
          <div onClick={applyShadow} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: "0.78rem", fontWeight: 700, color: C.goldBright, background: C.goldDim, border: `1px dashed ${C.borderGold}`, borderRadius: 12, padding: "10px 14px", marginBottom: 12, cursor: "pointer" }}>
            ⚡ Found your {row.ticker} trade ({mbISO(shadow.exit)}) in the journal — click to shadow-fill dates, %, R, days, theme &amp; outcome.
            <span style={{ marginLeft: "auto", fontSize: "0.68rem", color: C.muted, fontWeight: 600 }}>fills only what's empty</span>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
          <div><span style={lbl}>Ticker<AutoDot k="ticker" /></span><input style={inputS} value={row.ticker} onChange={e => setField("ticker", e.target.value.toUpperCase())} placeholder="NVDA" /></div>
          <div><span style={lbl}>Pattern<AutoDot k="pattern" /></span><select style={{ ...inputS, cursor: "pointer" }} value={row.pattern} onChange={e => setField("pattern", e.target.value)}>{PATTERNS.map(p => <option key={p}>{p}</option>)}</select></div>
          <div><span style={lbl}>Theme<AutoDot k="theme" /></span><input style={inputS} value={row.theme || ""} onChange={e => setField("theme", e.target.value)} placeholder="Semiconductors" /></div>
          <div><span style={lbl}>Entry date<AutoDot k="entry_date" /></span><input type="date" style={inputS} value={row.entry_date || ""} onChange={e => setField("entry_date", e.target.value)} /></div>
          <div><span style={lbl}>Exit date<AutoDot k="exit_date" /></span><input type="date" style={inputS} value={row.exit_date || ""} onChange={e => setField("exit_date", e.target.value)} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
          <div title="What the VIV management model captures: 50% trimmed at 3–5R, rest trailed to the EMA9-close exit (blended)."><span style={lbl}>Captured %<AutoDot k="run_pct" /></span><input style={inputS} value={row.run_pct ?? ""} onChange={e => setField("run_pct", e.target.value)} placeholder="+38" /></div>
          <div title="Max run-up of the move (peak of the pole) — the ceiling, not what management banks."><span style={lbl}>Run-up % (peak)<AutoDot k="run_up_pct" /></span><input style={inputS} value={row.run_up_pct ?? ""} onChange={e => setField("run_up_pct", e.target.value)} placeholder="+90" /></div>
          <div><span style={lbl}>Slope ° (info-line)<AutoDot k="angle" /></span><input style={inputS} value={row.angle ?? ""} onChange={e => setField("angle", e.target.value)} placeholder="62.5" /></div>
          <div title="Campaign length: entry → first DAILY close below the 9-EMA (the trail exit). The 3–5R trim does NOT end the trade."><span style={lbl}>Days held → EMA9 close<AutoDot k="days_held" /></span><input style={inputS} value={row.days_held ?? ""} onChange={e => setField("days_held", e.target.value)} placeholder="12" /></div>
          <div><span style={lbl}>R multiple<AutoDot k="r_mult" /></span><input style={inputS} value={row.r_mult ?? ""} onChange={e => setField("r_mult", e.target.value)} placeholder="8.5" /></div>
          <div title="Objective tags — auto from R when blank: ≥5R Huge Winner · 2–5R Winner · −0.5R…2R Subpar · ≤−0.5R Loser (no-R studies use captured %: ≥30 / ≥10 / ≥0 / <0)."><span style={lbl}>Outcome<AutoDot k="outcome" /></span><select style={{ ...inputS, cursor: "pointer" }} value={row.outcome || ""} onChange={e => setField("outcome", e.target.value)}><option value="">{suggestedOutcome ? `— auto: ${suggestedOutcome}` : "—"}</option>{OUTCOMES.map(o => <option key={o}>{o}</option>)}</select></div>
        </div>

        {/* SETUP GRADER CHECKLIST — the stars are COMPUTED from these ticks (objective, no bias) */}
        {(row.metrics?.needs_eye || []).length > 0 && (
          <div style={{ fontSize: "0.74rem", fontWeight: 600, color: "#f0b04f", background: "rgba(240,176,79,0.07)", border: "1px solid rgba(240,176,79,0.3)", borderRadius: 10, padding: "8px 13px", marginBottom: 10, lineHeight: 1.5 }}>
            👁 <b>Needs your eye</b> — not provable from the chart alone, tick below if true:{" "}
            {(row.metrics.needs_eye).map(k => { const [si, ii] = k.split("-").map(Number); return SECTIONS[si]?.items?.[ii]?.c; }).filter(Boolean).join(" · ")}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ ...lbl, marginBottom: 0 }}>{memberMode ? "Setup checklist — tick what the chart shows; stars come from how many boxes it ticks" : "Setup Grader checklist — stars compute from these ticks"}</span>
          <span style={{ fontSize: "0.74rem", fontWeight: 800, color: C.goldBright }}>{graded.stars}★ · {graded.passed}/{graded.total}{memberMode ? "" : ` · ${graded.starHit}/${graded.starmakers} ★-makers`}</span>
          <button onClick={pullGrade} title="Import this ticker's saved Setup Grader ticks" style={{ ...chipBtn, whiteSpace: "nowrap", marginLeft: "auto" }}>Pull from grader</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 10, marginBottom: 14 }}>
          {sectionsFor(row.ticked).filter(s => !s.reminder).map((sec, si) => (
            <div key={si} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", background: "rgba(255,255,255,0.015)" }}>
              <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.gold, marginBottom: 7 }}>{sec.title}</div>
              {sec.items.map((it, ii) => {
                const key = si + "-" + ii, on = row.ticked.includes(key);
                return (
                  <div key={ii} onClick={() => toggleTick(key)} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 2px", cursor: "pointer" }}>
                    <span style={{ color: on ? C.goldBright : "rgba(255,255,255,0.22)", fontWeight: 800, lineHeight: 1.3 }}>{on ? "✓" : "○"}</span>
                    <span style={{ fontSize: "0.76rem", fontWeight: 600, color: on ? C.goldBright : C.text, lineHeight: 1.35 }}>{it.c}{it.star && !memberMode && <span style={{ fontSize: "0.56rem", color: C.goldMid, marginLeft: 5 }}>★ maker</span>}{it.bonus && <span style={{ fontSize: "0.5rem", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: C.goldBright, border: `1px solid ${C.goldBright}`, padding: "0 5px", borderRadius: 99, marginLeft: 5 }}>Bonus</span>}<AutoDot k={"tick:" + key} /></span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 14 }}>
          <span style={lbl}>Objective characteristics (comma-separated — measurable traits only)<AutoDot k="characteristics" /></span>
          <input style={inputS} value={Array.isArray(row.characteristics) ? row.characteristics.join(", ") : (row.characteristics || "")}
            onChange={e => setField("characteristics", e.target.value)}
            placeholder="3 tight days, ADR 6.1%, vol dry-up −60%, EMA9>21>50, RS 96" />
        </div>
        {!memberMode && (<>
          <span style={lbl}>Elite factors — the 6★/7★ layer (tick what was TRUE at entry)</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 6, marginBottom: 14 }}>
            {ELITE.map(f => {
              const on = row.elite.includes(f.k);
              return (
                <div key={f.k} onClick={() => toggleElite(f.k)} style={{ display: "flex", gap: 10, padding: "8px 11px", borderRadius: 10, cursor: "pointer", background: on ? "rgba(126,240,160,0.07)" : "rgba(255,255,255,0.02)", border: `1px solid ${on ? "rgba(126,240,160,0.35)" : C.border}` }}>
                  <span style={{ color: on ? "#7ef0a0" : "rgba(255,255,255,0.25)", fontWeight: 800 }}>{on ? "✓" : "○"}</span>
                  <div><div style={{ fontSize: "0.8rem", fontWeight: 700, color: on ? "#7ef0a0" : C.text }}>{f.c}<AutoDot k={"elite:" + f.k} /></div><div style={{ fontSize: "0.7rem", color: C.muted }}>{f.s}</div></div>
                </div>
              );
            })}
          </div>
        </>)}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div style={{ gridColumn: "1 / -1", fontSize: "0.7rem", color: C.muted, marginBottom: -4 }}>📋 Tip: copy a chart screenshot and press <b style={{ color: C.goldBright }}>⌘V / Ctrl+V</b> right here — first paste fills Before, second fills After.</div>
          {[["before_img", "Before chart (the setup)", "⬆ Upload before chart"], ["after_img", "After chart (the outcome)", "⬆ Upload after chart"]].map(([slot, label, cta]) => (
            <div key={slot}>
              <span style={lbl}>{label}</span>
              {row[slot] && <img src={row[slot]} alt={slot} style={{ width: "100%", borderRadius: 10, marginBottom: 8, border: `1px solid ${C.border}` }} />}
              <label style={{ display: "inline-flex", alignItems: "center", gap: 7, background: C.goldDim, border: `1px solid ${C.borderGold}`, color: C.goldBright, fontFamily: font, fontWeight: 700, fontSize: "0.74rem", padding: "8px 16px", borderRadius: 99, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>
                {busy ? "Uploading…" : row[slot] ? "↻ Replace chart" : cta}
                <input type="file" accept="image/*" disabled={busy} onChange={e => onUpload(e.target.files?.[0], slot, setRow)} style={{ display: "none" }} />
              </label>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div><span style={lbl}>The thesis (why it was A+ BEFORE the move)<AutoDot k="thesis" /></span><textarea rows={3} style={{ ...inputS, resize: "vertical" }} value={row.thesis || ""} onChange={e => setField("thesis", e.target.value)} /></div>
          <div><span style={lbl}>The lesson (what to internalize)<AutoDot k="lesson" /></span><textarea rows={3} style={{ ...inputS, resize: "vertical" }} value={row.lesson || ""} onChange={e => setField("lesson", e.target.value)} /></div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button disabled={busy || !row.ticker} onClick={() => onSave(row)} style={{ background: `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})`, color: "#08080e", border: "none", fontFamily: font, fontWeight: 800, fontSize: "0.82rem", padding: "11px 24px", borderRadius: 99, cursor: "pointer", opacity: busy || !row.ticker ? 0.6 : 1 }}>{busy ? "Saving…" : row.id ? "Save changes" : "Add entry"}</button>
          {isAdmin ? (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.78rem", color: row.is_published ? C.green : C.muted, cursor: "pointer", fontFamily: font, fontWeight: 700 }}>
              <input type="checkbox" checked={!!row.is_published} onChange={e => setRow(r => ({ ...r, is_published: e.target.checked }))} /> Published to members
            </label>
          ) : (
            <span style={{ fontSize: "0.72rem", color: C.muted, fontFamily: font }}>🔒 Saves to your personal model book — only you can see it.</span>
          )}
          <button onClick={onCancel} style={{ marginLeft: "auto", background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.muted, fontFamily: font, fontWeight: 700, fontSize: "0.76rem", padding: "10px 18px", borderRadius: 99, cursor: "pointer" }}>Cancel</button>
        </div>
      </div>
    );
}

export default function ModelBookPage({ C, font, session, isAdmin, guideEnter, guideLeave, gactive, journaledTrades }) {
  const uid = session?.user?.id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fPattern, setFPattern] = useState("All");
  const [patternOpen, setPatternOpen] = useState(false); // pattern filter dropdown open/closed — presentation only, drives the same fPattern
  const [fTier, setFTier] = useState("All"); // All | 7 | 6 | 5
  // Deep link from the top nav ("Studies" admin link): viv-mb-view=studies opens My Book → 📚 Studies
  // directly. Read-and-clear synchronously so it only steers this mount, never a later visit.
  const mbDeepLink = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("viv-mb-view") : null;
  if (mbDeepLink) sessionStorage.removeItem("viv-mb-view");
  const [fScope, setFScope] = useState(mbDeepLink === "studies" ? "mine" : "All"); // All | official (VIV published) | mine (my personal book)
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} (new) | row (edit)
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(null); // lightbox: { imgs: {before, after}, slot: "before"|"after" }
  const [studyMode, setStudyMode] = useState(mbDeepLink === "studies"); // 📚 Studies view (admin, inside My Book)
  const [studyEditing, setStudyEditing] = useState(null); // null | {} (new) | row (edit)

  // Lightbox keyboard nav — ← → flips before/after, Esc closes (Esc also closes the detail overlay)
  useEffect(() => {
    if (!zoom && !detail) return;
    const onKey = (e) => {
      if (e.key === "Escape") { if (zoom) setZoom(null); else setDetail(null); }
      else if (zoom && e.key === "ArrowLeft") setZoom(z => (z && z.imgs.before ? { ...z, slot: "before" } : z));
      else if (zoom && e.key === "ArrowRight") setZoom(z => (z && z.imgs.after ? { ...z, slot: "after" } : z));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom, detail]);

  // Pattern dropdown — Esc closes it (outside-click is handled by an invisible backdrop under the menu)
  useEffect(() => {
    if (!patternOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setPatternOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [patternOpen]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error } = await supabase.from("model_book").select("*").order("created_at", { ascending: false });
    if (error) setError(/relation|does not exist|schema cache|not find/i.test(String(error.message)) ? "setup" : String(error.message));
    else setRows(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  // A trade/position sent a prefill (📖 Add to Model Book) → open the editor immediately
  useEffect(() => { try { if (sessionStorage.getItem("viv-mb-prefill")) setEditing({}); } catch {} }, []);

  const visible = rows.filter(r => {
    // studies live in their own 📚 view UNLESS starred for the Model Book (then they show as cards too)
    if (isStudyRow(r) && !inModelBook(r)) return false;
    if (fScope === "official" && !r.is_published) return false;
    if (fScope === "mine" && r.created_by !== uid) return false;
    if (fPattern !== "All" && r.pattern !== fPattern) return false;
    const eff = effectiveStars(cardStars(r), (r.elite || []).length).n;
    if (fTier !== "All" && eff !== +fTier) return false;
    return true;
  });
  const mineCount = rows.filter(r => r.created_by === uid && !isStudyRow(r)).length; // must match the fScope==='mine' predicate
  const studyRows = rows.filter(r => r.created_by === uid && isStudyRow(r));

  const uploadImg = async (file, slot, setRow) => {
    if (!file) return;
    setBusy(true);
    try {
      const path = `modelbook/${uid}/${Date.now()}-${slot}-${file.name}`.replace(/[^a-zA-Z0-9./_-]/g, "_");
      const { error: upErr } = await supabase.storage.from("trade-charts").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("trade-charts").getPublicUrl(path);
      setRow(r => ({ ...r, [slot]: urlData?.publicUrl || "" }));
    } catch (e) { setError(String(e.message || e)); }
    setBusy(false);
  };

  const save = async (row) => {
    setBusy(true); setError(null);
    const body = {
      ticker: (row.ticker || "").toUpperCase().trim(), pattern: row.pattern || "Trendline Breakout",
      stars: starsFromTicked(row.ticked, isAdmin ? undefined : { makerGate: false }).stars, // objective — from the grader ticks; members score equal-weight (no ★-maker gate). Only THIS save's row is (re)scored — existing rows untouched.
      outcome: row.outcome || outcomeFromR(row.r_mult, row.run_pct) || null, // blank → auto-classified from R
      theme: row.theme || null, entry_date: row.entry_date || null, exit_date: row.exit_date || null,
      before_img: row.before_img || null, after_img: row.after_img || null,
      elite: row.elite || [], ticked: row.ticked || [],
      metrics: row.metrics || {}, // chart-extracted deep data + the _auto (gold-dot) key list — must survive edits
      run_pct: row.run_pct === "" || row.run_pct == null ? null : +row.run_pct,
      run_up_pct: row.run_up_pct === "" || row.run_up_pct == null ? null : +row.run_up_pct,
      angle: row.angle === "" || row.angle == null ? null : +row.angle,
      characteristics: Array.isArray(row.characteristics) ? row.characteristics
        : String(row.characteristics || "").split(/[;,]/).map(s => s.trim()).filter(Boolean),
      days_held: row.days_held === "" || row.days_held == null ? null : +row.days_held,
      r_mult: row.r_mult === "" || row.r_mult == null ? null : +row.r_mult,
      thesis: row.thesis || null, lesson: row.lesson || null, is_published: !!row.is_published,
    };
    if (!row.id) body.created_by = uid; // ownership set once at insert — updating must never steal the row
    const q = row.id
      ? supabase.from("model_book").update(body).eq("id", row.id)
      : supabase.from("model_book").insert(body);
    const { error } = await q;
    setBusy(false);
    if (error) { setError(String(error.message)); return false; }
    setEditing(null); load();
    return true;
  };
  const remove = async (row) => {
    if (!window.confirm(`Delete ${row.ticker} from the Model Book? This cannot be undone.`)) return;
    const { error } = await supabase.from("model_book").delete().eq("id", row.id);
    if (error) setError(String(error.message)); else { setDetail(null); load(); }
  };
  // one-click star toggle on a study row: ★ = publish. The card and the study are ONE row —
  // starring flips in_model_book AND is_published together, so the study appears in ⭐ VIV Official
  // (member-visible) as a card while staying in 📚 Studies for the lift math. Unstar = unpublish.
  const toggleModelBook = async (row) => {
    const starring = !row.metrics?.study?.in_model_book;
    if (starring && !window.confirm(`Star ${row.ticker} ${row.entry_date}?\n\nThis publishes it to the ⭐ VIV Official book — members will see the card, charts, stats AND your thesis/lesson text. Check the notes read clean before starring.`)) return;
    const mt = { ...row.metrics, study: { ...row.metrics.study, in_model_book: starring } };
    setRows(rs => rs.map(x => x.id === row.id ? { ...x, metrics: mt, is_published: starring } : x)); // optimistic
    const { error } = await supabase.from("model_book").update({ metrics: mt, is_published: starring }).eq("id", row.id);
    if (error) { setError(String(error.message)); load(); }
  };

  const chip = (active) => ({
    display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
    fontSize: "0.72rem", fontWeight: 700, padding: "7px 15px", borderRadius: 99, cursor: "pointer", fontFamily: font, transition: "all .14s",
    border: `1px solid ${active ? C.goldBright : C.border}`, color: active ? "#08080e" : C.muted,
    background: active ? `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})` : "rgba(255,255,255,0.03)",
  });
  // Grade badge derived from the objective star tier (same source as the stars — no new data, no re-scoring)
  const gradeBadge = (n) => n >= 5 ? { l: "A+", fg: "#86efac", bg: "rgba(34,197,94,0.15)", bd: "rgba(34,197,94,0.3)" }
    : n === 4 ? { l: "A", fg: "#86efac", bg: "rgba(34,197,94,0.15)", bd: "rgba(34,197,94,0.3)" }
    : n === 3 ? { l: "B", fg: C.goldBright, bg: C.goldDim, bd: C.borderGold }
    : { l: "C", fg: "#fca5a5", bg: "rgba(239,68,68,0.12)", bd: "rgba(239,68,68,0.3)" };
  const outcomeChip = (o) => o === "Huge Winner" ? { fg: "#7ef0a0", bg: "rgba(126,240,160,0.08)", bd: "rgba(126,240,160,0.35)" }
    : o === "Winner" ? { fg: C.green, bg: "rgba(34,197,94,0.08)", bd: "rgba(34,197,94,0.3)" }
    : o === "Loser" ? { fg: C.red, bg: "rgba(239,68,68,0.08)", bd: "rgba(239,68,68,0.3)" }
    : { fg: C.muted, bg: "rgba(255,255,255,0.03)", bd: C.border };

  return (
    <div style={{ fontFamily: font }}>
      {/* command header */}
      <div className="toolbar" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: "0.64rem", fontWeight: 700, letterSpacing: "0.17em", textTransform: "uppercase", color: C.gold }}>Model Book</div>
          <h2 className={"sech guide" + (gactive ? gactive("modelbook") : "")}
            onMouseEnter={guideEnter ? guideEnter("modelbook", "Model Book", "Two books in one: the ⭐ VIV Official library — curated elite setups, read-only — and 🔒 My Book, your private collection only you can see. Study the before chart, the exact factors that made it elite, then the outcome. Stars are computed from the Setup Grader ticks (objective, no bias). Fields marked with a gold dot were auto-read off the chart by VIV — edit any that look off. Pattern recognition is built by reps: same patterns, hundreds of examples.", undefined) : undefined}
            onMouseLeave={guideLeave ? guideLeave("modelbook") : undefined}
            style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.03em", color: C.white, marginTop: 5 }}>The Pattern Library</h2>
          <div style={{ fontSize: "0.8rem", color: C.muted, marginTop: 6 }}>{visible.length} {visible.length === 1 ? "entry" : "entries"} · the best setups, kept for study — before → factors → after</div>
        </div>
        {!editing && !studyEditing && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {mineCount > 0 && (
              <>
                <button onClick={() => openMyBookPdf(rows.filter(r => r.created_by === uid && !isStudyRow(r)), isAdmin ? undefined : { makerGate: false })}
                  title="Your book as a branded PDF — one page per entry with the BEFORE and AFTER charts, score, factors and your notes. Opens a print view; use Save as PDF."
                  style={{ background: "rgba(255,255,255,0.04)", color: C.gold, border: `1px solid ${C.borderGold}`, fontFamily: font, fontWeight: 700, fontSize: "0.78rem", padding: "10px 18px", borderRadius: 99, cursor: "pointer" }}>⬇ Export PDF</button>
                <button onClick={() => downloadMyBookCsv(rows.filter(r => r.created_by === uid && !isStudyRow(r)), isAdmin ? undefined : { makerGate: false })}
                  title="Download YOUR entries as a CSV — every checklist tick as its own TRUE/FALSE column, plus outcomes, metrics and your notes. Feed it to any analysis tool to hunt commonalities."
                  style={{ background: "rgba(255,255,255,0.04)", color: C.gold, border: `1px solid ${C.borderGold}`, fontFamily: font, fontWeight: 700, fontSize: "0.78rem", padding: "10px 18px", borderRadius: 99, cursor: "pointer" }}>⬇ CSV</button>
              </>
            )}
            <button onClick={() => (studyMode && fScope === "mine" && isAdmin) ? setStudyEditing({}) : setEditing({})} style={{ background: `linear-gradient(120deg, ${C.goldMid}, ${C.goldBright}, ${C.goldDeep})`, color: "#0a0a0a", border: "none", fontFamily: font, fontWeight: 700, fontSize: "0.78rem", padding: "10px 20px", borderRadius: 99, cursor: "pointer", boxShadow: "0 6px 18px rgba(201,152,42,0.25)" }}>{(studyMode && fScope === "mine" && isAdmin) ? "＋ New study" : isAdmin ? "+ Add entry" : "+ Add to my book"}</button>
          </div>
        )}
      </div>

      {editing !== null && <MBEditor C={C} font={font} busy={busy} isAdmin={isAdmin} initial={editing.id ? editing : null} onSave={save} onCancel={() => setEditing(null)} onUpload={uploadImg} journaledTrades={journaledTrades} />}

      {/* filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "6px 0 18px", alignItems: "center" }}>
        {[["All", "All"], ["official", "⭐ VIV Official"], ["mine", `🔒 My Book${mineCount ? ` (${mineCount})` : ""}`]].map(([k, label]) => (
          <button key={k} onClick={() => { setFScope(k); if (k !== "mine") setStudyMode(false); }} style={chip(fScope === k)}>{label}</button>
        ))}
        {isAdmin && (
          <button onClick={() => { if (fScope !== "mine") { setFScope("mine"); setStudyMode(true); } else setStudyMode(m => !m); }}
            style={chip(studyMode && fScope === "mine")}>📚 Studies{studyRows.length ? ` (${studyRows.length})` : ""}</button>
        )}
        <span style={{ width: 1, alignSelf: "stretch", background: C.border, margin: "0 4px" }} />
        {/* pattern filter — click-down dropdown (drives the same fPattern state; scope/tier stay as chips) */}
        <div style={{ position: "relative" }}>
          <button onClick={() => setPatternOpen(o => !o)} aria-haspopup="menu" aria-expanded={patternOpen} style={{
            display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
            fontSize: "0.72rem", fontWeight: 700, padding: "7px 13px 7px 15px", borderRadius: 99, cursor: "pointer", fontFamily: font, transition: "all .14s",
            border: `1px solid ${(fPattern !== "All" || patternOpen) ? C.goldBright : C.border}`,
            color: fPattern !== "All" ? C.goldBright : C.muted,
            background: fPattern !== "All" ? C.goldDim : "rgba(255,255,255,0.03)",
          }}>
            <span>Pattern: {fPattern}</span>
            <span style={{ fontSize: "0.6rem", transform: patternOpen ? "rotate(180deg)" : "none", transition: "transform .14s", opacity: 0.8 }}>▾</span>
          </button>
          {patternOpen && (
            <>
              <div onClick={() => setPatternOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div role="menu" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50, minWidth: 210, background: "#13131c", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: 5, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
                {["All", ...PATTERNS].map(p => {
                  const n = p === "All" ? rows.length : rows.filter(r => r.pattern === p).length;
                  const on = fPattern === p;
                  return (
                    <button key={p} role="menuitem" onClick={() => { setFPattern(p); setPatternOpen(false); }} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%",
                      fontFamily: font, fontSize: "0.75rem", fontWeight: 700, textAlign: "left",
                      padding: "8px 11px", borderRadius: 7, cursor: "pointer", border: "none",
                      color: on ? C.goldBright : C.text, background: on ? C.goldDim : "transparent",
                    }}
                    onMouseEnter={e => { if (!on) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                    onMouseLeave={e => { if (!on) e.currentTarget.style.background = "transparent"; }}>
                      <span>{p === "All" ? "All patterns" : p}</span>
                      <span style={{ fontSize: "0.66rem", fontWeight: 700, color: on ? C.goldBright : C.muted }}>{n > 0 ? n : ""}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <span style={{ width: 1, alignSelf: "stretch", background: C.border, margin: "0 4px" }} />
        {["All", "7", "6", "5"].map(t => {
          const n = t === "All" ? 0 : rows.filter(r => effectiveStars(r.stars, (r.elite || []).length).n === +t).length;
          return <button key={t} onClick={() => setFTier(t)} style={chip(fTier === t)}>{t === "All" ? "Any grade" : `${t}★${n > 0 ? ` (${n})` : ""}`}</button>;
        })}
      </div>
      {fScope === "mine" && !isAdmin && (
        <div style={{ fontSize: "0.72rem", color: C.muted, margin: "-8px 0 16px" }}>🔒 Your personal model book — entries here are visible only to you. The ⭐ VIV Official book is curated by the team and is read-only.</div>
      )}

      {loading && (() => {
        const sk = { background: "linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(240,192,80,0.08) 50%, rgba(255,255,255,0.03) 75%)", backgroundSize: "800px 100%", animation: "mbshimmer 1.4s linear infinite" };
        return (
          <>
            <style>{"@keyframes mbshimmer{0%{background-position:-400px 0}100%{background-position:400px 0}}"}</style>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }} aria-label="Loading the Model Book">
              {Array.from({ length: 6 }, (_, k) => (
                <div key={k} style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
                  <div style={{ height: 160, borderBottom: `1px solid ${C.border}`, ...sk }} />
                  <div style={{ padding: "13px 15px" }}>
                    <div style={{ height: 14, width: "55%", borderRadius: 6, marginBottom: 10, ...sk }} />
                    <div style={{ height: 10, width: "82%", borderRadius: 6, ...sk }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        );
      })()}
      {error === "setup" && <div style={{ color: C.muted, fontSize: "0.86rem", padding: "30px 0", textAlign: "center" }}>📖 The Model Book is being set up — check back shortly.</div>}
      {error && error !== "setup" && <div style={{ color: C.red, fontSize: "0.8rem", padding: "12px 0" }}>{error}</div>}
      {!studyMode && !loading && !error && visible.length === 0 && <div style={{ color: C.muted, fontSize: "0.86rem", padding: "30px 0", textAlign: "center" }}>No entries match this filter yet.</div>}

      {/* 📚 STUDIES — private study wing of My Book (admin): study a bunch BEFORE posting.
          Rows are model_book rows with metrics.study; excluded from the card grid until promoted. */}
      {studyMode && fScope === "mine" && isAdmin && (
        <div style={{ marginBottom: 20 }}>
          <StudyScoreboard C={C} rows={studyRows} />
          {/* Editor opens as a blurred-backdrop POPUP (Valen 2026-07-17) — click a row anywhere in the
              list and edit right there, no scrolling back up. Backdrop click / Cancel closes; clicks
              inside never close (members are editing). Portaled to body so no card backdrop-filter
              becomes its containing block. No Esc-close here: the editor's chart lightbox owns Esc. */}
          {studyEditing !== null && createPortal(
            <div onClick={() => setStudyEditing(null)} style={{ position: "fixed", inset: 0, zIndex: 1250, background: "rgba(4,4,8,0.55)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", overflowY: "auto", padding: "4vh 3vw" }}>
              <div onClick={e => e.stopPropagation()} style={{ maxWidth: 1180, margin: "0 auto", background: "rgba(10,10,16,0.92)", borderRadius: 16 }}>
                <StudyEditor C={C} font={font} busy={busy} initial={studyEditing.id ? studyEditing : null}
                  onSave={async (r) => { if (await save(r)) setStudyEditing(null); }}
                  onCancel={() => setStudyEditing(null)} onUpload={uploadImg} />
              </div>
            </div>, document.body)}
          <button onClick={() => setStudyEditing({})} style={{ background: `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})`, color: "#08080e", border: "none", fontFamily: font, fontWeight: 800, fontSize: "0.78rem", padding: "10px 20px", borderRadius: 99, cursor: "pointer", marginBottom: 14 }}>＋ New study</button>
          {studyRows.length === 0 && studyEditing === null && (
            <div style={{ color: C.muted, fontSize: "0.82rem", padding: "18px 0" }}>No studies yet — hit ＋ New study. Grade blind (grade + prediction locked before the outcome opens), then record what happened. The scoreboard finds your winner DNA as the sample grows.</div>
          )}
          {/* grouped by ticker, dates in chronological order — one ticker can hold many
              studies (different trigger dates); the ticker prints once per group */}
          {[...studyRows].sort((a, b) => a.ticker === b.ticker
              ? String(a.entry_date || "").localeCompare(String(b.entry_date || ""))
              : (a.ticker < b.ticker ? -1 : 1))
            .map((r, i, arr) => {
            const s = r.metrics.study; const cls = outcomeClass(s);
            const firstOfGroup = i === 0 || arr[i - 1].ticker !== r.ticker;
            const groupN = arr.filter(x => x.ticker === r.ticker).length;
            return (
              <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: firstOfGroup && i > 0 ? 7 : 4, marginTop: firstOfGroup && i > 0 ? 12 : 0, fontSize: "0.78rem", cursor: "pointer" }}
                onClick={() => setStudyEditing(r)}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.borderGold} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                <b style={{ width: 64, color: firstOfGroup ? undefined : "transparent" }}>{r.ticker}{firstOfGroup && groupN > 1 ? <span style={{ color: C.muted, fontWeight: 400, fontSize: "0.64rem" }}> ×{groupN}</span> : null}</b>
                <span style={{ color: C.muted, width: 92 }}>{r.entry_date || "—"}</span>
                {/* BEFORE→AFTER flash-card strip — the pattern-recognition rep at a glance */}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, width: 148, flexShrink: 0 }}>
                  {r.after_img ? <img src={r.after_img} alt="before" title="BEFORE — the setup" style={{ width: 64, height: 40, objectFit: "cover", borderRadius: 5, border: `1px solid ${C.border}` }} /> : <span style={{ width: 64, height: 40, borderRadius: 5, border: `1px dashed ${C.border}`, display: "inline-block" }} />}
                  <span style={{ color: C.muted, fontSize: "0.7rem" }}>→</span>
                  {s.outcome_img ? <img src={s.outcome_img} alt="after" title="AFTER — the outcome" style={{ width: 64, height: 40, objectFit: "cover", borderRadius: 5, border: `1px solid ${C.borderGold}` }} /> : <span title="No AFTER chart yet — drop `TICKER DATE AFTER.png` in the study inbox" style={{ width: 64, height: 40, borderRadius: 5, border: `1px dashed ${C.border}`, display: "grid", placeItems: "center", color: C.muted, fontSize: "0.56rem" }}>after?</span>}
                </span>
                <span style={{ width: 150 }}>{r.pattern}</span>
                {(() => { const q = studyQuality(s); return <span style={{ width: 70, color: q.letter === "—" ? C.muted : q.letter === "A+" ? "#7ef0a0" : C.goldBright, fontWeight: 700 }} title={`${q.on}/${q.total} criteria ticked`}>{q.letter}</span>; })()}
                <span style={{ flex: 1, color: C.muted, fontSize: "0.7rem" }}>{s.regime_tag || ""}</span>
                {cls && <span style={{ fontWeight: 700, color: cls === "failure" ? C.red : "#7ef0a0" }}>{cls}</span>}
                <button title={inModelBook(r) ? "In the Model Book — click to remove" : "Add to the Model Book"} onClick={(e) => { e.stopPropagation(); toggleModelBook(r); }} style={{ background: "transparent", border: "none", color: inModelBook(r) ? C.goldBright : C.muted, cursor: "pointer", fontSize: "1rem" }}>{inModelBook(r) ? "★" : "☆"}</button>
                <button title="Delete study" onClick={(e) => { e.stopPropagation(); remove(r); }} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: "0.95rem" }}>×</button>
              </div>
            );
          })}
        </div>
      )}

      {/* card grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, marginTop: 4 }}>
        {(studyMode ? [] : visible).map(r => {
          const eff = effectiveStars(cardStars(r), (r.elite || []).length);
          const elite = eff.n >= 6;
          const di = displayImgs(r);
          const img = di.before || di.after;
          const gb = gradeBadge(eff.n);
          const dr = mbDateRange(r.entry_date, r.exit_date);
          const rTxt = r.r_mult != null ? `${r.r_mult > 0 ? "+" : ""}${r.r_mult}R` : (r.run_pct != null ? `${r.run_pct > 0 ? "+" : ""}${r.run_pct}%` : "");
          const rUp = (r.r_mult != null ? r.r_mult : r.run_pct || 0) >= 0;
          return (
            <div key={r.id} onClick={() => setDetail(r)} style={{ position: "relative", background: C.glass, border: `1px solid ${elite ? "rgba(126,240,160,0.32)" : C.border}`, borderRadius: 16, overflow: "hidden", cursor: "pointer", transition: "transform .15s ease, border-color .15s ease" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.borderColor = elite ? "rgba(126,240,160,0.55)" : C.borderGold; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = elite ? "rgba(126,240,160,0.32)" : C.border; }}>
              {/* chart area */}
              <div style={{ position: "relative", height: 160, overflow: "hidden", borderBottom: `1px solid ${C.border}` }}>
                {elite && <span style={{ position: "absolute", top: 12, right: 12, zIndex: 2, fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", padding: "5px 12px", borderRadius: 99, background: "rgba(126,240,160,0.16)", border: "1px solid rgba(126,240,160,0.45)", color: "#7ef0a0", boxShadow: "0 0 16px rgba(126,240,160,0.25)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}>⭐ Elite</span>}
                {img ? (
                  <img src={img} alt={r.ticker} style={{ width: "100%", height: 160, objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{ position: "relative", height: 160, background: "linear-gradient(180deg, rgba(201,152,42,0.10), rgba(201,152,42,0) 55%), repeating-linear-gradient(0deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 28px), repeating-linear-gradient(90deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 28px), #0d0d16" }}>
                    <span style={{ position: "absolute", left: 12, bottom: 4, fontSize: "2.6rem", fontWeight: 800, letterSpacing: "-0.02em", color: "rgba(255,255,255,0.05)", lineHeight: 1, userSelect: "none", pointerEvents: "none" }}>{r.ticker}</span>
                  </div>
                )}
              </div>
              {/* body */}
              <div style={{ padding: "14px 16px 16px" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: "1.05rem", fontWeight: 800, color: C.white, letterSpacing: "-0.01em" }}>{r.ticker}</span>
                  {dr && <span style={{ fontSize: "0.64rem", color: C.muted, whiteSpace: "nowrap" }}>{dr}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
                  <span style={{ fontSize: "0.62rem", fontWeight: 800, color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, padding: "2px 9px", borderRadius: 99 }}>{r.pattern}</span>
                  {inModelBook(r) && <span title="Starred from a 📚 Study" style={{ fontSize: "0.58rem", fontWeight: 800, color: C.goldBright, border: `1px solid ${C.borderGold}`, padding: "2px 9px", borderRadius: 99 }}>📚 study</span>}
                  {!r.is_published && !isStudyRow(r) && <span style={{ fontSize: "0.58rem", fontWeight: 800, color: isAdmin ? C.muted : "#8ab4f8", border: `1px solid ${isAdmin ? C.border : "rgba(138,180,248,0.35)"}`, padding: "2px 9px", borderRadius: 99 }}>{isAdmin ? "DRAFT" : "🔒 PERSONAL"}</span>}
                  {r.is_published && <span title="Curated by the VIV team" style={{ fontSize: "0.58rem", fontWeight: 800, color: C.goldBright, background: C.goldDim, border: `1px solid ${C.borderGold}`, padding: "2px 9px", borderRadius: 99 }}>⭐ VIV</span>}
                  {r.outcome && (() => { const oc = outcomeChip(r.outcome); return <span style={{ marginLeft: "auto", fontSize: "0.6rem", fontWeight: 800, color: oc.fg, background: oc.bg, border: `1px solid ${oc.bd}`, padding: "3px 10px", borderRadius: 99, whiteSpace: "nowrap" }}>{r.outcome}</span>; })()}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 11, paddingTop: 11, borderTop: `1px solid ${C.border}` }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 21, height: 21, padding: "0 5px", borderRadius: 6, fontWeight: 800, fontSize: "0.66rem", color: gb.fg, background: gb.bg, border: `1px solid ${gb.bd}` }}>{gb.l}</span>
                    <Stars C={C} n={eff.n} size="0.82rem" />
                  </span>
                  <span style={{ fontSize: "0.66rem", fontWeight: 800, color: elite ? "#7ef0a0" : C.muted }}>{eff.label}</span>
                  {rTxt && <span style={{ marginLeft: "auto", fontSize: "0.84rem", fontWeight: 800, color: rUp ? C.green : C.red }}>{rTxt}</span>}
                </div>
                {r.lesson && <div style={{ fontSize: "0.74rem", color: C.muted, lineHeight: 1.5, marginTop: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.lesson}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* detail overlay */}
      {detail && (() => {
        const r = detail, eff = effectiveStars(cardStars(r), (r.elite || []).length);
        return (
          <div onClick={e => { if (e.target === e.currentTarget) setDetail(null); }} style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(4,4,8,0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px 16px", overflowY: "auto" }}>
            <div style={{ width: "min(880px,100%)", background: "linear-gradient(180deg, rgba(18,18,26,0.95), rgba(8,8,14,0.98))", border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: "22px 24px", boxShadow: "0 40px 100px rgba(0,0,0,0.72)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: "1.4rem", fontWeight: 800, color: C.white }}>{r.ticker}</span>
                <span style={{ fontSize: "0.66rem", fontWeight: 800, color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, padding: "3px 11px", borderRadius: 99 }}>{r.pattern}</span>
                {r.theme && <span style={{ fontSize: "0.7rem", color: C.muted }}>{r.theme}</span>}
                <span style={{ marginLeft: "auto" }}><Stars C={C} n={eff.n} /></span>
                <span style={{ fontSize: "0.82rem", fontWeight: 800, color: eff.n >= 6 ? "#7ef0a0" : C.goldBright }}>{eff.label}</span>
                <button onClick={() => setDetail(null)} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.muted, width: 34, height: 34, borderRadius: 10, fontSize: "1.2rem", cursor: "pointer", lineHeight: 1 }} aria-label="Close">&times;</button>
              </div>
              <div style={{ fontSize: "0.74rem", color: C.muted, marginBottom: 16 }}>
                {r.entry_date || "—"} → {r.exit_date || "—"}{r.days_held != null ? ` · ${r.days_held}d` : ""}{r.run_pct != null ? ` · ${r.run_pct > 0 ? "+" : ""}${r.run_pct}%` : ""}{r.r_mult != null ? ` · ${r.r_mult}R` : ""}
              </div>
              {/* BEFORE | AFTER — always left/right, clearly compared (responsive, no innerWidth snapshot) */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 16 }}>
                <div style={{ position: "relative" }}>
                  {/* Point-in-time cap + ADR% badge — rides along when a ★-promoted study surfaces here (same row, same stats) */}
                  {(() => {
                    const sm = r.metrics?.study?.m; if (!sm) return null;
                    const cap = +(sm.mcap_t || 0), adr = sm.adr20;
                    const parts = [];
                    if (cap > 0) parts.push("≈" + (cap >= 1e9 ? "$" + (cap / 1e9).toFixed(1) + "B" : "$" + Math.round(cap / 1e6) + "M"));
                    if (adr != null && adr !== "" && !Number.isNaN(+adr)) parts.push("ADR " + (+adr).toFixed(1) + "%");
                    return parts.length ? <span title={`At the trigger date — cap from SEC shares outstanding (${sm.mcap_asof || "n/a"}), ADR20 from the 20 sessions before the trigger.`} style={{ position: "absolute", top: 26, right: 6, zIndex: 2, background: "rgba(8,8,14,0.82)", border: `1px solid ${C.borderGold}`, color: C.goldBright, fontFamily: font, fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.04em", padding: "3px 8px", borderRadius: 7, whiteSpace: "nowrap", cursor: "help", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}>{parts.join(" · ")}</span> : null;
                  })()}
                  <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, marginBottom: 7 }}>◀ Before — the setup <span style={{ color: C.muted, textTransform: "none", letterSpacing: 0 }}>· click to zoom</span></div>
                  {(() => { const di = displayImgs(r); return di.before ? <img src={di.before} alt="before" onClick={() => setZoom({ imgs: { before: di.before, after: di.after }, slot: "before" })} style={{ width: "100%", borderRadius: 12, border: `1px solid ${C.borderGold}`, cursor: "zoom-in" }} /> : <div style={{ height: 180, display: "grid", placeItems: "center", color: C.muted, fontSize: "0.76rem", border: `1px dashed ${C.border}`, borderRadius: 12 }}>before chart pending</div>; })()}
                </div>
                <div>
                  <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.green, marginBottom: 7 }}>After — the outcome ▶ <span style={{ color: C.muted, textTransform: "none", letterSpacing: 0 }}>· click to zoom</span></div>
                  {(() => { const di = displayImgs(r); return di.after ? <img src={di.after} alt="after" onClick={() => setZoom({ imgs: { before: di.before, after: di.after }, slot: "after" })} style={{ width: "100%", borderRadius: 12, border: "1px solid rgba(34,197,94,0.35)", cursor: "zoom-in" }} /> : <div style={{ height: 180, display: "grid", placeItems: "center", color: C.muted, fontSize: "0.76rem", border: `1px dashed ${C.border}`, borderRadius: 12 }}>after chart pending</div>; })()}
                </div>
              </div>
              {/* Objective metric strip — gold dot = auto-read off the chart by VIV */}
              {(() => {
                const dAuto = new Set((r.metrics && r.metrics._auto) || []);
                const strip = [["Captured", "run_pct", r.run_pct != null ? `${r.run_pct > 0 ? "+" : ""}${r.run_pct}%` : null, C.green, "What the management model banks: 50% at 3–5R + EMA9 trail"],
                  ["Run-up (peak)", "run_up_pct", r.run_up_pct != null ? `+${r.run_up_pct}%` : null, C.goldBright, "Max run-up of the move"],
                  ["Slope", "angle", r.angle != null ? `${r.angle}°` : null, C.goldBright, "Advance angle off the info-line"],
                  ["Held", "days_held", r.days_held != null ? `${r.days_held}d` : null, C.text, "Entry → first daily close below EMA9 (the trail exit)"],
                  ["R", "r_mult", r.r_mult != null ? `${r.r_mult}R` : null, C.green, "Reward vs the initial stop"]].filter(([, , v]) => v != null);
                return (
                  <>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: dAuto.size ? 7 : 14 }}>
                      {strip.map(([k, fk, v, col, tip]) => (
                        <span key={k} title={tip} style={{ display: "inline-flex", gap: 7, alignItems: "baseline", padding: "6px 13px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}` }}>
                          <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>{k}</span>
                          <span style={{ fontSize: "0.9rem", fontWeight: 800, color: col }}>{v}</span>
                          {dAuto.has(fk) && <span title="Auto-read from the chart by VIV" style={{ width: 6, height: 6, borderRadius: 99, background: C.goldBright, boxShadow: "0 0 6px rgba(240,192,80,0.85)", alignSelf: "center" }} />}
                        </span>
                      ))}
                    </div>
                    {dAuto.size > 0 && (
                      <div style={{ fontSize: "0.66rem", color: C.muted, marginBottom: 14 }}>
                        <span style={{ color: C.goldBright }}>●</span> auto-read from the chart by VIV — spot an error? hit Edit and correct it (the dot clears)
                        {(r.metrics?.needs_eye || []).length > 0 && <span style={{ color: "#f0b04f" }}> · 👁 {(r.metrics.needs_eye).length} item{r.metrics.needs_eye.length > 1 ? "s" : ""} awaiting your eye (open Edit)</span>}
                      </div>
                    )}
                  </>
                );
              })()}
              {(r.characteristics || []).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, marginBottom: 7 }}>Objective characteristics</div>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    {(r.characteristics || []).map((c, i) => <span key={i} style={{ fontSize: "0.72rem", fontWeight: 700, color: C.text, background: C.goldDim, border: `1px solid ${C.borderGold}`, padding: "4px 11px", borderRadius: 99 }}>{c}</span>)}
                  </div>
                </div>
              )}
              {(r.elite || []).length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7ef0a0", marginBottom: 8 }}>Elite factors present ({(r.elite || []).length}/{ELITE.length})</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 6 }}>
                    {ELITE.filter(f => (r.elite || []).includes(f.k)).map(f => (
                      <div key={f.k} style={{ display: "flex", gap: 9, padding: "8px 11px", borderRadius: 10, background: "rgba(126,240,160,0.06)", border: "1px solid rgba(126,240,160,0.25)" }}>
                        <span style={{ color: "#7ef0a0", fontWeight: 800 }}>✓</span>
                        <div><div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#c9f5d7" }}>{f.c}</div><div style={{ fontSize: "0.7rem", color: C.muted }}>{f.s}</div></div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {r.thesis && <div style={{ marginBottom: 12 }}><div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, marginBottom: 6 }}>The thesis</div><div style={{ fontSize: "0.88rem", color: C.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.thesis}</div></div>}
              {r.lesson && <div style={{ marginBottom: 14 }}><div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, marginBottom: 6 }}>The lesson</div><div style={{ fontSize: "0.88rem", color: C.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{r.lesson}</div></div>}
              {(isAdmin || (r.created_by === uid && !r.is_published)) && (
                <div style={{ display: "flex", gap: 10, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                  <button onClick={() => { if (isStudyRow(r)) { setStudyMode(true); setStudyEditing(r); } else setEditing(r); setDetail(null); }} style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, color: C.goldBright, fontFamily: font, fontWeight: 700, fontSize: "0.74rem", padding: "8px 16px", borderRadius: 99, cursor: "pointer" }}>{isStudyRow(r) ? "Edit study" : "Edit"}</button>
                  <button onClick={() => remove(r)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.red, fontFamily: font, fontWeight: 700, fontSize: "0.74rem", padding: "8px 16px", borderRadius: 99, cursor: "pointer" }}>Delete</button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
      {/* LIGHTBOX — full-screen chart zoom, ← → flips before/after */}
      {zoom && (() => {
        const url = zoom.imgs[zoom.slot];
        const isBefore = zoom.slot === "before";
        const hasBoth = !!(zoom.imgs.before && zoom.imgs.after);
        const navBtn = (side, slot, enabled) => enabled && (
          <button onClick={e => { e.stopPropagation(); setZoom(z => ({ ...z, slot })); }} aria-label={`Show ${slot} chart`}
            style={{ position: "fixed", [side]: 20, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.07)", backdropFilter: "blur(4px)", border: `1px solid ${C.border}`, color: C.white, width: 46, height: 64, borderRadius: 14, fontSize: "1.5rem", cursor: "pointer", lineHeight: 1 }}>{side === "left" ? "‹" : "›"}</button>
        );
        return (
          <div onClick={() => setZoom(null)} style={{ position: "fixed", inset: 0, zIndex: 1500, background: "rgba(2,2,6,0.93)", display: "grid", placeItems: "center", cursor: "zoom-out", padding: 18 }}>
            <img key={zoom.slot} src={url} alt={`${zoom.slot} chart zoom`} style={{ maxWidth: "96vw", maxHeight: "90vh", borderRadius: 12, border: `1px solid ${isBefore ? C.borderGold : "rgba(34,197,94,0.45)"}`, boxShadow: "0 30px 90px rgba(0,0,0,0.8)" }} />
            <span style={{ position: "fixed", top: 20, left: 20, fontSize: "0.7rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: isBefore ? C.goldBright : "#7ef0a0", background: "rgba(8,8,14,0.8)", border: `1px solid ${isBefore ? C.borderGold : "rgba(34,197,94,0.4)"}`, padding: "7px 15px", borderRadius: 99 }}>
              {isBefore ? "◀ Before — the setup" : "After — the outcome ▶"}
            </span>
            {navBtn("left", "before", hasBoth && !isBefore)}
            {navBtn("right", "after", hasBoth && isBefore)}
            {hasBoth && (
              <span style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", fontSize: "0.68rem", fontWeight: 600, color: C.muted, background: "rgba(8,8,14,0.8)", border: `1px solid ${C.border}`, padding: "6px 14px", borderRadius: 99, whiteSpace: "nowrap" }}>
                ← → flip before / after &nbsp;·&nbsp; Esc to close
              </span>
            )}
            <button onClick={() => setZoom(null)} aria-label="Close zoom" style={{ position: "fixed", top: 18, right: 20, background: "rgba(255,255,255,0.08)", border: `1px solid ${C.border}`, color: C.white, width: 40, height: 40, borderRadius: 12, fontSize: "1.3rem", cursor: "pointer", lineHeight: 1 }}>&times;</button>
          </div>
        );
      })()}
    </div>
  );
}
