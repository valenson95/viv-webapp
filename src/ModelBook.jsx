import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabaseClient";
import { getGrade } from "./grades.js";
import { SECTIONS, sectionsFor, scoreTicked, versionOf, stampV2 } from "./SetupGrader.jsx";
import { sectorFor } from "./sectors.js";
import { isStudyRow, StudyEditor, StudyScoreboard, StudyHypotheses, HypothesisRead, buildCampaigns, outcomeClass, studyQuality, STUDY_SETUPS, SUBCATS, HYPOTHESES, entryVerdict } from "./StudyBook.jsx";
import { ChartSeqEditor, buildChartList, deriveChartFields, chartFaces, sectionizeCharts } from "./ChartSeq.jsx";

// A study starred for the Model Book shows as a card; its star count comes from the study's
// auto quality grade (tick-%) rather than the 16-criteria Model Book ticks it doesn't have.
// Quality is computed LIVE from the current ticks (studyQuality), never read from a stored
// grade.letter — that stale-grade path drifted whenever ticks were edited outside the editor.
const STUDY_LETTER_N = { "A+": 5, A: 4, B: 3, C: 2 };
const inModelBook = (r) => isStudyRow(r) && !!r.metrics?.study?.in_model_book;
// Project "books" (Valen 2026-07-28): a study's metrics.study.project groups it into a named book in My Research.
// No project = the 📕 Winner DNA book. matchesBook filters a row against the active book chip ("__all__" = every
// row · "__none__" = Winner DNA / no project · else an exact project name). Plain (non-study) rows have no
// project, so they naturally fall into Winner DNA and are excluded from any specific project book.
const studyProject = (r) => (r?.metrics?.study?.project || "").trim();
const matchesBook = (r, book) => book === "__all__" ? true : book === "__none__" ? !studyProject(r) : studyProject(r) === book;
const cardStars = (r) => isStudyRow(r) ? (STUDY_LETTER_N[studyQuality(r.metrics.study).letter] || 0) : r.stars;
// Outcome-class chip (Valen 2026-07-26) — presentation of the PRE-REGISTERED outcomeClass(): emoji + word,
// colored by tier (green tiers / red / muted), never color alone. Keys mirror StudyBook.outcomeClass.
const OC_CHIP = {
  monster:       { emoji: "🦖", label: "Monster",      color: "#7ef0a0" },
  "big winner":  { emoji: "🏆", label: "Big winner",   color: "#6fd090" },
  "works small": { emoji: "🌱", label: "Works small",  color: "#b7d69a" },
  failure:       { emoji: "💀", label: "Failure",      color: "#e05555" },
};
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
// A CSV can't carry an explanatory comment line, so the first column is `row_type` (classic|study) —
// the sheet is self-explanatory. Classic (plain) rows export EXACTLY as before (every v2 tick its own
// TRUE/FALSE column). Study rows fill only the SHARED columns (ticker/date/pattern/theme/outcome/thesis/
// lesson/chart urls); the 16 grader tick columns + grader-only stars/score/version stay BLANK (studies
// carry a different, bucket-based checklist — blank = "not this checklist", never guessed).
export function buildMyBookCsv(rows, { makerGate } = {}) {
  const head = ["row_type", "ticker", "entry_date", "exit_date", "pattern", "theme", "outcome", "stars", "score_pct", "checklist_version",
    ...CSV_TICK_COLS.map(([, name]) => name),
    "captured_pct", "run_up_pct", "days_held", "r_multiple", "characteristics", "thesis", "lesson", "chart_before_url", "chart_after_url"];
  const lines = [head.join(",")];
  for (const r of rows) {
    if (isStudyRow(r)) {
      const s = r.metrics.study;
      lines.push([
        "study", r.ticker, r.entry_date, "", s.setup || r.pattern, r.theme, r.outcome, "", "", "",
        ...CSV_TICK_COLS.map(() => ""), // grader tick columns don't apply to studies
        "", "", "", "", (r.characteristics || []).join(" | "), r.thesis, r.lesson, r.before_img, r.after_img,
      ].map(csvCell).join(","));
      continue;
    }
    const v2 = versionOf(r.ticked) !== 1;
    const tset = new Set(r.ticked || []);
    const g = scoreTicked(r.ticked, makerGate === false ? { makerGate: false } : undefined);
    lines.push([
      "classic", r.ticker, r.entry_date, r.exit_date, r.pattern, r.theme, r.outcome, g.stars, g.pct != null ? Math.round(g.pct * 100) + "%" : "", v2 ? "v2" : "v1",
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
export function openMyBookPdf(rows, { makerGate, coverTitle } = {}) {
  // Chronicle order (Valen 2026-07-28): the book reads BY TICKER, each ticker chronological from
  // its first study — one ticker = one chapter of legs, like a single name's history album.
  rows = [...rows].sort((a, b) => String(a.ticker).localeCompare(String(b.ticker)) ||
    String(mbISO(a.entry_date) || a.entry_date || "").localeCompare(String(mbISO(b.entry_date) || b.entry_date || "")));
  const today = new Date().toISOString().slice(0, 10);
  const stat = (k, v) => v || v === 0 ? `<div class="st"><div class="sk">${k}</div><div class="sv">${esc(v)}</div></div>` : "";
  const CHART_ROLE_LABEL = { context: "Context (HTF)", before: "The setup", trigger: "The trigger — 5-min", after: "The outcome" };
  const figLabel = (c, j) => c.label || CHART_ROLE_LABEL[c.role] || `Chart ${j + 1}`; // shared by entry() + campaignUnit()
  // ── STUDY-ROW entry (presentation-contract: opened/printed = full timeline + full checklist).
  //   charts  = the FULL ordered list (buildChartList true) — each a full-width figure, its LABEL the
  //             figcaption + its caption text under it (not the fixed BEFORE/AFTER pair).
  //   checklist = the study buckets (STUDY_SETUPS / SUBCATS / studyQuality) — ticked items as .tick chips
  //             (chosen subcat value inline) + a "{on}/{total}" criteria line.
  //   stats   = study.outcome fields (mfe_d20 / burst_pct …) where the plain fields are absent — the
  //             stat() helper only renders what exists; "—" is never invented.
  // ── Per-row meta for the MENU (clickable TOC) — same star/score math as the cards, never re-derived.
  const rowMeta = (r, i) => {
    if (r.metrics?.study) {
      const s = r.metrics.study, q = studyQuality(s), cls = outcomeClass(s), o = s.outcome || {};
      return { anchor: "e" + i, stars: STUDY_LETTER_N[q.letter] || 0, ticker: r.ticker, date: r.entry_date || "",
        setup: s.setup || r.pattern || "", score: `${q.on}/${q.total} · ${q.letter}`,
        outcome: cls ? (OC_CHIP[cls]?.label || cls) : "Pending", good: cls === "monster" || cls === "big winner", bad: cls === "failure",
        move: o.mfe_d20 ?? o.burst_pct ?? "", r: r.r_mult ?? "" };
    }
    const g = scoreTicked(r.ticked, makerGate === false ? { makerGate: false } : undefined);
    return { anchor: "e" + i, stars: g.stars || 0, ticker: r.ticker, date: r.entry_date || "",
      setup: r.pattern || "", score: g.pct != null ? Math.round(g.pct * 100) + "%" : "—",
      outcome: r.outcome || "—", good: /win/i.test(r.outcome || ""), bad: /los/i.test(r.outcome || ""),
      move: r.run_up_pct ?? "", r: r.r_mult ?? "" };
  };
  const pct = (v) => (v === "" || v == null) ? "—" : (String(v).includes("%") ? esc(v) : esc(v) + "%");
  // MENU pages — Eric-model-book style: grouped by star tier, every row a link that jumps to the entry
  // (anchors survive Chrome/Safari Save-as-PDF, so the saved PDF keeps the clickable contents).
  const menuHtml = (() => {
    const metas = rows.map(rowMeta);
    const groups = [];
    metas.forEach((m) => { const g = groups[groups.length - 1]; if (g && g.t === m.ticker) g.list.push(m); else groups.push({ t: m.ticker, list: [m] }); });
    const tr = (m) => { const A = (inner) => `<a href="#${m.anchor}">${inner}</a>`; return `<tr>
      <td class="tkcell">${A(esc(m.ticker))}</td><td>${A(esc(m.date))}</td><td class="mut">${A(esc(m.setup))}</td>
      <td>${A(esc(m.score))}</td><td class="stcell">${A("★".repeat(m.stars) || "—")}</td><td class="${m.good ? "good" : m.bad ? "bad" : "mut"}">${A(esc(m.outcome))}</td>
      <td class="num">${A(pct(m.move))}</td><td class="num">${A(m.r === "" || m.r == null ? "—" : esc(m.r) + "R")}</td></tr>`; };
    const grp = (g) => (g.list.length > 1 ? `<tr class="tierh"><td colspan="8">${esc(g.t)} — ${g.list.length} entries, chronological</td></tr>` : "") + g.list.map(tr).join("");
    return `<div class="page menu">
      <div class="mhead"><div><span class="mtitle">MY MODEL BOOK</span><span class="msub">by ticker, chronological · ${rows.length} entries</span></div><div class="msub">menu · exported ${today}</div></div>
      <table class="mtab"><thead><tr><th>Ticker</th><th>Date</th><th>Setup</th><th>Score</th><th>Stars</th><th>Outcome</th><th>Peak move</th><th>R</th></tr></thead>
      <tbody>${groups.map(grp).join("")}</tbody></table>
      <div class="foot">Click any row to jump to that entry — links stay clickable in the saved PDF. Multi-entry tickers read top-to-bottom as the name's history.</div>
    </div>`;
  })();
  // 🧪 HYPOTHESIS SUMMARY — included only when the export carries study rows (the research wing).
  // Votes come from the SAME entryVerdict engine as the Lab strip — presentation reuse, no re-derivation.
  // Honest-stats laws hold here too: denominators shown, tri-state, per-leg counting disclosed,
  // zero-failure guard (lift engine blind until ~5 graded failures).
  const hypHtml = (() => {
    const studies = rows.filter((r) => r.metrics?.study);
    if (!studies.length) return "";
    const classes = studies.map((r) => outcomeClass(r.metrics.study));
    const nWin = classes.filter((c) => c === "monster" || c === "big winner").length;
    const nSmall = classes.filter((c) => c === "works small").length;
    const nFail = classes.filter((c) => c === "failure").length;
    const nPend = classes.filter((c) => c == null).length;
    const lines = HYPOTHESES.map((h) => {
      let sup = 0, chal = 0, data = 0;
      for (const r of studies) {
        const v = entryVerdict(h, r.metrics.study, { ticker: r.ticker, date: r.entry_date });
        if (!v) continue;
        if (v.bucket === "supports") sup++; else if (v.bucket === "challenges") chal++; else data++;
      }
      if (!sup && !chal && !data) return "";
      const read = (sup || chal)
        ? (sup === chal ? `<span class="hpill split">SPLIT</span>` : sup > chal ? `<span class="hpill sup">LEANS SUPPORTS</span>` : `<span class="hpill chal">LEANS AGAINST</span>`)
        : `<span class="hpill mutp">DATA ONLY</span>`;
      return `<tr><td class="hid">${esc(h.id)}</td><td><b>${esc(h.short || h.claim)}</b><div class="hclaim">${esc(h.prior || "")}</div></td>
        <td class="num">🟢 ${sup}&nbsp;&nbsp;🔴 ${chal}&nbsp;&nbsp;⚪ ${data}</td><td>${read}</td></tr>`;
    }).filter(Boolean);
    return `<div class="page hyp">
      <div class="mhead"><div><span class="mtitle">🧪 HYPOTHESES</span><span class="msub">what this research says so far</span></div><div class="msub">${studies.length} studies in this export</div></div>
      <div class="stats">${stat("Studies", studies.length)}${stat("Big winners", nWin)}${stat("Works small", nSmall)}${stat("Failures", nFail)}${stat("Pending", nPend)}</div>
      ${nFail < 5 ? `<div class="warn">⚠ Only ${nFail} graded failure${nFail === 1 ? "" : "s"} in this export — lift math needs ~5 failures to mean anything. Verdicts below are directional evidence counts, not lift.</div>` : ""}
      <table class="mtab htab"><thead><tr><th>ID</th><th>Hypothesis</th><th>Evidence</th><th>Read</th></tr></thead><tbody>${lines.join("")}</tbody></table>
      <div class="foot">Votes per study leg from the same verdict engine as the Lab (🟢 supports · 🔴 challenges · ⚪ adds data). The Lab view collapses multi-leg campaigns and applies the full evidence gates — it is the authority; this page is the summary.</div>
    </div>`;
  })();
  // ── ONE renderer for BOTH row types (Valen 2026-07-27: the export mixed two formats — classic
  // rows printed a side-by-side BEFORE/AFTER pair while studies printed the stacked timeline — and
  // the printer split tall entries mid-figure ("cropped"). Eric-book pagination now: every row
  // renders the SAME chronological timeline via buildChartList, ONE CHART PER PAGE (nothing can
  // crop), big header on page 1, slim running header on later pages, scorecard page last.
  const addedStamp = (r) => { const d = r.created_at ? new Date(r.created_at) : null;
    return d && !isNaN(d) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : ""; };
  const bigHead = (r, m) => `<div class="ehead">
      <div><span class="tk">${esc(r.ticker)}</span><span class="pat">${esc(m.setup)}</span></div>
      <div class="emeta">${esc(m.date)}${r.exit_date && !r.metrics?.study ? " → " + esc(r.exit_date) : ""} · <b class="${m.good ? "good" : m.bad ? "bad" : ""}">${esc(m.outcome)}</b> · ${esc(m.score)} · ${"★".repeat(m.stars)}${"☆".repeat(Math.max(0, 5 - m.stars))}${addedStamp(r) ? `<span class="added">added ${esc(addedStamp(r))}</span>` : ""}</div>
    </div>`;
  const slimHead = (r, m, label) => `<div class="shead"><span class="stk">${esc(r.ticker)}</span><span class="slab">${esc(label)}</span><span class="smeta">${esc(m.date)}</span></div>`;
  const entry = (r, idx) => {
    const isS = !!r.metrics?.study;
    const m = rowMeta(r, idx);
    const charts = buildChartList(r, isS).filter((c) => c && c.img);
    // Display inheritance (Valen 2026-07-28): a chartless leg whose campaign has a chart-bearing sibling in
    // THIS export prints a "shared with the root leg" line instead of "no charts" — the root's charts are NOT
    // re-printed per leg (book bloat); the ticker→date chronicle sort already places the root right above.
    const sharedWithRoot = isS && charts.length === 0 && !!r.metrics?.study?.campaign_id &&
      rows.some((o) => o !== r && o.metrics?.study?.campaign_id === r.metrics.study.campaign_id && buildChartList(o, true).some((c) => c && c.img));
    let statsHtml, chipsHtml = "", footLine = "";
    if (isS) {
      const study = r.metrics.study, q = studyQuality(study), o = study.outcome || {};
      const def = STUDY_SETUPS[study.setup] || STUDY_SETUPS["Momentum Breakout"];
      const chips = def.buckets.flatMap((b) => b.items.map(([k, itemLabel]) => {
        if (!study.checks?.[k]) return "";
        const sc = SUBCATS[k];
        const subRaw = sc && study.checks?.[sc.store];
        const subVal = sc && subRaw != null && subRaw !== "" ? (sc.options.find(([opt]) => opt === String(subRaw)) || [, String(subRaw)])[1] : null;
        return `<span class="tick">✓ ${esc(itemLabel)}${subVal ? ` · <b>${esc(subVal)}</b>` : ""}</span>`;
      })).filter(Boolean);
      chipsHtml = chips.length ? `<div class="ticks">${chips.join("")}</div>` : "";
      footLine = `${q.on}/${q.total} criteria ticked`;
      statsHtml = `<div class="stats">${stat("MFE d5 %", o.mfe_d5)}${stat("MFE d20 %", o.mfe_d20)}${stat("Burst %", o.burst_pct)}${stat("Captured %", r.run_pct)}${stat("R multiple", r.r_mult)}${stat("Theme", r.theme)}</div>`;
    } else {
      const tset = new Set(r.ticked || []);
      const ticks = sectionsFor(r.ticked).filter((sec) => !sec.reminder).flatMap((sec, si) =>
        sec.items.map((it, ii) => tset.has(si + "-" + ii) ? `<span class="tick">✓ ${esc(it.c)}</span>` : "").filter(Boolean));
      chipsHtml = ticks.length ? `<div class="ticks">${ticks.join("")}</div>` : "";
      statsHtml = `<div class="stats">${stat("Captured %", r.run_pct)}${stat("Run-up % (peak)", r.run_up_pct)}${stat("Days held", r.days_held)}${stat("R multiple", r.r_mult)}${stat("Theme", r.theme)}</div>`;
    }
    const figPages = charts.map((c, j) => `<section class="entry chartpg"${j === 0 ? ` id="e${idx}"` : ""}>
      ${j === 0 ? bigHead(r, m) : slimHead(r, m, figLabel(c, j))}
      <figure class="fullfig"><figcaption>${esc(figLabel(c, j))} · ${j + 1}/${charts.length}</figcaption><img src="${esc(c.img)}"/>${c.caption ? `<div class="fignote">${esc(c.caption)}</div>` : ""}</figure>
    </section>`);
    const scorecard = `<section class="entry"${charts.length ? "" : ` id="e${idx}"`}>
      ${charts.length ? slimHead(r, m, "Scorecard") : bigHead(r, m)}
      ${charts.length ? "" : sharedWithRoot ? '<div class="noimg">Chart set shared with the root leg — see this ticker\'s first entry.</div>' : '<div class="noimg">no charts</div>'}
      ${statsHtml}
      ${chipsHtml}
      ${footLine ? `<div class="foot">${footLine}</div>` : ""}
      ${r.thesis ? `<div class="note"><b>Thesis:</b> ${esc(r.thesis)}</div>` : ""}
      ${r.lesson ? `<div class="note"><b>Lesson:</b> ${esc(r.lesson)}</div>` : ""}
    </section>`;
    return figPages.join("") + scorecard;
  };
  // ── CAMPAIGN UNIT (Valen 2026-07-28): a multi-leg campaign (rows sharing metrics.study.campaign_id) renders as
  // ONE unit — the root's chart pages ONCE, then a single LEGS LEDGER (one row per leg + per-leg hypothesis votes),
  // then the root's notes once. Replaces the old N-1 near-empty "shared with the root leg" scorecards (bloat).
  // legs = [{ r, idx }] in export order (chronological). ANCHORS: the first campaign page carries the FIRST leg's
  // id (e{idx}); every OTHER leg's id is emitted as an empty <span> on that page so all menu links still resolve.
  const campaignUnit = (legs) => {
    const root = legs[0].r, rs = root.metrics.study;
    const first = legs[0].r.entry_date || "?", last = legs[legs.length - 1].r.entry_date || "?";
    const setupLabel = (rs.setup || root.pattern || "") + (rs.setup === "Parabolic" && rs.direction === "short" ? " · Short" : "");
    const anchorSpans = legs.slice(1).map((l) => `<span id="e${l.idx}"></span>`).join(""); // other legs' menu targets
    const campHead = `<div class="ehead">
      <div><span class="tk">${esc(root.ticker)}</span><span class="pat">${esc(setupLabel)}</span></div>
      <div class="emeta"><b>${legs.length} legs</b> · ${esc(first)} → ${esc(last)}${addedStamp(root) ? `<span class="added">added ${esc(addedStamp(root))}</span>` : ""}</div>
    </div>`;
    // Chart pages ONCE — the union of the campaign's chart-bearing rows (in practice the root's set).
    const chartLegs = legs.filter((l) => buildChartList(l.r, true).some((c) => c && c.img));
    const primary = chartLegs[0] || legs[0];
    const primaryCharts = buildChartList(primary.r, true).filter((c) => c && c.img);
    const pmeta = rowMeta(primary.r, legs[0].idx);
    const hasCharts = primaryCharts.length > 0;
    const chartPages = primaryCharts.map((c, j) => `<section class="entry chartpg"${j === 0 ? ` id="e${legs[0].idx}"` : ""}>
      ${j === 0 ? campHead + anchorSpans : slimHead(primary.r, pmeta, figLabel(c, j))}
      <figure class="fullfig"><figcaption>${esc(figLabel(c, j))} · ${j + 1}/${primaryCharts.length}</figcaption><img src="${esc(c.img)}"/>${c.caption ? `<div class="fignote">${esc(c.caption)}</div>` : ""}</figure>
    </section>`).join("");
    // Item 4 — a non-root leg with its OWN charts (rare): append after the campaign pages with its slim header; nothing dropped.
    const extraPages = chartLegs.filter((l) => l !== primary).map((l) => {
      const ec = buildChartList(l.r, true).filter((c) => c && c.img), em = rowMeta(l.r, l.idx), n = legs.indexOf(l) + 1;
      return ec.map((c, j) => `<section class="entry chartpg">
        ${slimHead(l.r, em, `Leg ${n} · ${figLabel(c, j)}`)}
        <figure class="fullfig"><figcaption>${esc(figLabel(c, j))} · ${j + 1}/${ec.length}</figcaption><img src="${esc(c.img)}"/>${c.caption ? `<div class="fignote">${esc(c.caption)}</div>` : ""}</figure>
      </section>`).join("");
    }).join("");
    // LEGS LEDGER — one row per leg, chronological. Blank cells print "—" (blank = not measured, never invented).
    const ledgerRows = legs.map((l, i) => {
      const s = l.r.metrics.study, q = studyQuality(s), cls = outcomeClass(s), oc = cls ? OC_CHIP[cls] : null;
      const o = s.outcome || {}, mm = s.m || {};
      const sl = (s.setup || l.r.pattern || "") + (s.direction === "short" ? " · Short" : "");
      const ocCell = oc ? `<b class="${cls === "failure" ? "bad" : (cls === "monster" || cls === "big winner") ? "good" : ""}">${esc(oc.label)}</b>` : `<span class="mut">Pending</span>`;
      const days10 = (mm.d_below_ma10 == null || mm.d_below_ma10 === "") ? "—" : esc(mm.d_below_ma10);
      const verdict = o.trade_verdict;
      return `<tr>
        <td class="hid">Leg ${i + 1}</td><td>${esc(l.r.entry_date || "—")}</td><td class="mut">${esc(sl)}</td>
        <td class="num">${q.on}/${q.total}</td><td>${ocCell}</td>
        <td class="num">${pct(o.mfe_d20)}</td><td class="num">${days10}</td><td class="num">${pct(o.peak_to_ma10_pct ?? mm.peak_to_ma10_pct)}</td>
        <td class="mut">${verdict ? esc(String(verdict).slice(0, 40)) : "—"}</td></tr>`;
    }).join("");
    // Per-leg hypothesis votes — the "do my legs support my hypotheses" payoff. One scannable line per leg
    // (wrap allowed): the verdicts from entryVerdict() for hypotheses that return non-null, as coloured chips.
    const voteLines = legs.map((l, i) => {
      const s = l.r.metrics.study;
      const chips = HYPOTHESES.map((h) => { const v = entryVerdict(h, s, { ticker: l.r.ticker, date: l.r.entry_date }); if (!v) return null;
        const dot = v.bucket === "supports" ? "🟢" : v.bucket === "challenges" ? "🔴" : "⚪"; return `${dot} ${esc(h.id)}`; }).filter(Boolean);
      return `<div class="hvline"><b>Leg ${i + 1}</b>${chips.length ? chips.join(" · ") : `<span class="mut">no votes</span>`}</div>`;
    }).join("");
    const ledgerPage = `<section class="entry"${hasCharts ? "" : ` id="e${legs[0].idx}"`}>
      ${hasCharts ? "" : anchorSpans}
      <div class="shead"><span class="stk">${esc(root.ticker)}</span><span class="slab">Legs ledger</span><span class="smeta">${legs.length} legs · ${esc(first)} → ${esc(last)}</span></div>
      <table class="mtab ledger"><thead><tr><th>Leg</th><th>Trigger date</th><th>Setup</th><th>Ticks</th><th>Outcome</th><th>MFE d20 %</th><th>Days&gt;10MA</th><th>Peak→10MA %</th><th>Sim verdict</th></tr></thead>
      <tbody>${ledgerRows}</tbody></table>
      <div class="hvtitle">Per-leg hypothesis votes — 🟢 supports · 🔴 challenges · ⚪ adds data</div>
      <div class="hvotes">${voteLines}</div>
      ${root.thesis ? `<div class="note"><b>Thesis:</b> ${esc(root.thesis)}</div>` : ""}
      ${root.lesson ? `<div class="note"><b>Lesson:</b> ${esc(root.lesson)}</div>` : ""}
    </section>`;
    return chartPages + extraPages + ledgerPage;
  };
  // Group consecutive same-campaign rows (post ticker→date sort) into ONE unit; solo studies + classic rows
  // render exactly as today via entry(). A campaign present as a single leg in THIS export also renders as-today.
  const bodyEntries = (() => {
    const out = [];
    for (let i = 0; i < rows.length; i++) {
      const cid = rows[i].metrics?.study?.campaign_id;
      if (cid) {
        const legs = [{ r: rows[i], idx: i }];
        while (i + 1 < rows.length && rows[i + 1].metrics?.study?.campaign_id === cid) { i++; legs.push({ r: rows[i], idx: i }); }
        out.push(legs.length > 1 ? campaignUnit(legs) : entry(legs[0].r, legs[0].idx));
      } else out.push(entry(rows[i], i));
    }
    return out.join("");
  })();
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>My Model Book — ${today}</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
    <style>
      *{box-sizing:border-box;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      body{background:#08080e;color:#e8e6e0;font-family:'Plus Jakarta Sans',sans-serif}
      /* Browsers drop the BODY background when printing (member-reported: white pages + light text).
         A position:fixed underlay repeats on EVERY printed page, so the dark theme survives Save-as-PDF
         even with "background graphics" unchecked — print-color-adjust:exact (on *) forces it painted. */
      body::before{content:"";position:fixed;inset:0;z-index:-1;background:#08080e}
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
      .added{display:block;text-align:right;font-size:0.6rem;font-weight:700;color:#66635b;margin-top:3px}
      body.light .added{color:#8a857a}
      .good{color:#22c55e}.bad{color:#ef4444}
      .charts{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
      figure{min-width:0}
      figure img{width:100%;max-height:52vh;object-fit:contain;border:1px solid rgba(255,255,255,0.12);border-radius:10px;background:#000}
      figcaption{font-size:0.62rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#c9982a;margin-bottom:5px}
      .noimg{border:1px dashed rgba(255,255,255,0.2);border-radius:10px;padding:30px;text-align:center;color:#666;font-size:0.8rem}
      /* Study rows print the FULL timeline: each chart a full-width figure (label = figcaption, caption below). */
      .charts.stack{grid-template-columns:1fr;gap:16px}
      .fullfig img{max-height:70vh}
      .fignote{font-size:0.72rem;color:#cfccc3;line-height:1.55;margin-top:6px}
      body.light .fignote{color:#2e2c25}
      .stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
      .st{border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:7px 14px;background:rgba(255,255,255,0.03)}
      .sk{font-size:0.56rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#9a968c}
      .sv{font-size:0.95rem;font-weight:800;margin-top:1px}
      .ticks{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
      .tick{font-size:0.66rem;font-weight:700;color:#e8e6e0;border:1px solid rgba(201,152,42,0.4);background:rgba(201,152,42,0.08);border-radius:99px;padding:4px 10px}
      .note{font-size:0.8rem;line-height:1.55;color:#cfccc3;margin-bottom:8px}
      .note b{color:#c9982a}
      .foot{color:#66635b;font-size:0.6rem;margin-top:10px}
      .toolbar .ghost{background:transparent;border:1px solid rgba(201,152,42,0.6);color:#c9982a}
      /* Crop-proofing: no block ever splits across a printed page boundary. */
      figure,.stats,.ticks,.note,.ehead,.shead,.st{break-inside:avoid;page-break-inside:avoid}
      .chartpg .fullfig img{max-height:76vh}
      .shead{display:flex;align-items:baseline;gap:12px;border-bottom:1px solid rgba(201,152,42,0.35);padding-bottom:8px;margin-bottom:12px}
      .stk{font-size:1.05rem;font-weight:800;letter-spacing:-0.01em}
      .slab{color:#c9982a;font-weight:800;font-size:0.62rem;letter-spacing:0.12em;text-transform:uppercase}
      .smeta{margin-left:auto;color:#9a968c;font-size:0.7rem;font-weight:700}
      body.light .shead{border-bottom-color:rgba(138,106,28,0.45)}
      body.light .slab{color:#8a6a1c}
      body.light .smeta{color:#6a675e}
      /* ── MENU (clickable contents) + hypothesis summary ── */
      .mhead{display:flex;align-items:baseline;justify-content:space-between;gap:12px;border-bottom:2px solid #c9982a;padding-bottom:10px;margin-bottom:14px}
      .mtitle{color:#c9982a;font-size:1.35rem;font-weight:800;letter-spacing:0.08em}
      .msub{color:#9a968c;font-size:0.72rem;font-weight:700;margin-left:12px}
      .mtab{width:100%;border-collapse:collapse}
      .mtab th{font-size:0.56rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#9a968c;text-align:left;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.16)}
      .mtab td{font-size:0.74rem;font-weight:600;padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.07);vertical-align:top}
      .mtab td.num,.mtab th:nth-last-child(-n+2){text-align:right}
      .mtab a{display:block;color:inherit;font-weight:inherit;text-decoration:none}
      .mtab .tkcell a{color:#f0c050;font-weight:800}
      .mtab .stcell a{color:#c9982a;letter-spacing:0.05em}
      body.light .mtab .stcell a{color:#8a6a1c}
      body.light .mtab .tkcell a{color:#8a6a1c}
      .mtab .mut{color:#9a968c}
      .tierh td{color:#c9982a;font-weight:800;font-size:0.7rem;letter-spacing:0.12em;padding-top:16px;border-bottom:1px solid rgba(201,152,42,0.5)}
      .hid{color:#c9982a;font-weight:800;white-space:nowrap}
      .hclaim{color:#9a968c;font-size:0.64rem;font-weight:500;line-height:1.45;margin-top:2px}
      .hpill{display:inline-block;font-size:0.56rem;font-weight:800;letter-spacing:0.06em;border-radius:99px;padding:2px 9px;border:1px solid;white-space:nowrap}
      .hpill.sup{color:#7ef0a0;border-color:#7ef0a0}.hpill.chal{color:#e05555;border-color:#e05555}
      .hpill.split{color:#f0c050;border-color:#f0c050}.hpill.mutp{color:#9a968c;border-color:#9a968c}
      .warn{border:1px solid rgba(224,85,85,0.55);background:rgba(224,85,85,0.08);color:#e8a0a0;border-radius:10px;padding:9px 13px;font-size:0.7rem;font-weight:700;line-height:1.5;margin-bottom:12px}
      /* ── Campaign LEGS LEDGER + per-leg hypothesis votes (Valen 2026-07-28): the campaign unit's single ledger page ── */
      .ledger tr{break-inside:avoid;page-break-inside:avoid}
      .hvtitle{font-size:0.58rem;font-weight:800;letter-spacing:0.1em;text-transform:uppercase;color:#9a968c;margin:16px 0 8px}
      .hvotes{display:grid;gap:6px;margin-bottom:12px}
      .hvline{font-size:0.74rem;color:#cfccc3;line-height:1.6;break-inside:avoid;page-break-inside:avoid}
      .hvline b{display:inline-block;min-width:52px;color:#c9982a;font-weight:800;margin-right:8px}
      .hvline .mut{color:#9a968c}
      body.light .hvtitle,body.light .hvline .mut{color:#6a675e}
      body.light .hvline{color:#2e2c25}
      body.light .hvline b{color:#8a6a1c}
      body.light .mtitle,body.light .tierh td,body.light .hid{color:#8a6a1c}
      body.light .msub,body.light .mtab .mut,body.light .mtab th,body.light .hclaim{color:#6a675e}
      body.light .mtab th{border-bottom-color:rgba(0,0,0,0.25)}
      body.light .mtab td{border-bottom-color:rgba(0,0,0,0.08)}
      body.light .tierh td{border-bottom-color:rgba(138,106,28,0.5)}
      body.light .hpill.sup{color:#15803d;border-color:#15803d}.light .hpill.chal{color:#b91c1c;border-color:#b91c1c}
      body.light .hpill.split{color:#8a6a1c;border-color:#8a6a1c}body.light .hpill.mutp{color:#6a675e;border-color:#6a675e}
      body.light .warn{color:#8a2626;border-color:rgba(185,28,28,0.5);background:rgba(185,28,28,0.06)}
      /* ── Light / ink-friendly theme (member picks in the toolbar; whichever shows is what prints) ── */
      body.light{background:#fdfcf9;color:#16150f}
      body.light::before{background:#fdfcf9}
      body.light .cover .brand,body.light .pat,body.light figcaption,body.light .note b{color:#8a6a1c}
      body.light .cover .sub,body.light .emeta,body.light .sk{color:#6a675e}
      body.light .ehead{border-bottom-color:rgba(138,106,28,0.45)}
      body.light figure img{border-color:rgba(0,0,0,0.18)}
      body.light .noimg{border-color:rgba(0,0,0,0.25);color:#8a857a}
      body.light .st{border-color:rgba(0,0,0,0.14);background:rgba(0,0,0,0.035)}
      body.light .tick{color:#43391d;border-color:rgba(138,106,28,0.45);background:rgba(201,152,42,0.10)}
      body.light .note{color:#2e2c25}
      body.light .good{color:#15803d}body.light .bad{color:#b91c1c}
      body.light .foot{color:#8a857a}
      body.light .toolbar .ghost{color:#8a6a1c;border-color:rgba(138,106,28,0.6)}
    </style></head><body>
    <div class="toolbar">
      <button class="ghost" onclick="const l=document.body.classList.toggle('light');this.textContent=l?'🌙 Dark theme':'☀ Light theme'">☀ Light theme</button>
      <button onclick="window.print()">⬇ Save as PDF</button>
    </div>
    <div class="page cover">
      <div class="brand">Valen Insiders Vault</div>
      <h1>${coverTitle ? esc(coverTitle) : "My Model Book"}</h1>
      <div class="sub">${coverTitle ? "VIV Model Book" : `${rows.length} ${rows.length === 1 ? "entry" : "entries"} · exported ${today}`}</div>
      ${coverTitle ? `<div class="sub">${rows.length} ${rows.length === 1 ? "entry" : "entries"} · exported ${today}</div>` : ""}
      <div class="sub" style="margin-top:26px;max-width:60ch;line-height:1.6">Your own pattern library — the setup, the factors that were present, and the outcome. Study the pairs; the commonalities are the edge. Educational, not advice.</div>
    </div>
    ${menuHtml}
    ${hypHtml}
    ${bodyEntries}
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

// ── "Your patterns" — a member-scoped, honest TALLY of which checklist factors recur across
// THEIR own entries, and separately across their best-graded ones. This is deliberately a plain
// count, NOT the admin H1–H13 lift engine (no lift %, no p-values, no fabricated statistics) —
// just "this factor appears in X of your Y best setups." Best tier = A/A+ = star tier ≥ 4,
// matching gradeBadge (n≥5 → A+, n===4 → A). Bonus/reminder items are excluded so the tally
// mirrors the scored checklist the member actually ticks.
// Tick → label: use each row's OWN sectionsFor(...) filtered index so v1/v2 rows resolve to the
// right human-readable factor; we tally by that label string (stable across checklist versions).
export function tallyMyPatterns(myRows) {
  const bestTier = (r) => effectiveStars(r.stars, (r.elite || []).length).n >= 4; // A / A+
  const labelsOf = (r) => {
    const tset = new Set(r.ticked || []);
    return sectionsFor(r.ticked).filter((s) => !s.reminder).flatMap((sec, si) =>
      sec.items.map((it, ii) => (!it.bonus && tset.has(si + "-" + ii)) ? it.c : null).filter(Boolean));
  };
  const best = myRows.filter(bestTier);
  const tally = new Map(); // label → { all, best }
  for (const r of myRows) {
    const isBest = bestTier(r);
    for (const label of new Set(labelsOf(r))) { // Set: a factor counts once per entry
      const t = tally.get(label) || { all: 0, best: 0 };
      t.all += 1; if (isBest) t.best += 1;
      tally.set(label, t);
    }
  }
  const factors = [...tally.entries()].map(([label, t]) => ({ label, ...t }))
    .sort((a, b) => (b.best - a.best) || (b.all - a.all) || a.label.localeCompare(b.label));
  return { factors, n: myRows.length, bestN: best.length };
}

function YourPatterns({ C, font, myRows }) {
  const { factors, n, bestN } = tallyMyPatterns(myRows);
  // Honest empty-state: nothing meaningful to say under ~3 entries with any ticked factors.
  const hasSignal = n >= 3 && factors.length > 0;
  const useBest = bestN > 0; // rank/show against best-graded when the member HAS best setups; else fall back to all
  const top = factors.filter((f) => (useBest ? f.best : f.all) > 0).slice(0, 6);
  const denom = useBest ? bestN : n;
  const scopeLabel = useBest ? `your A / A+ setups` : `your setups`;
  const bar = (num) => Math.max(6, Math.round((num / Math.max(1, denom)) * 100));
  return (
    <div style={{ fontFamily: font, background: C.glass, border: `1px solid ${C.borderGold}`, borderRadius: 16, padding: "16px 18px", marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: hasSignal ? 12 : 4 }}>
        <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: C.gold }}>Your patterns</div>
        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: C.white }}>The factors that recur in {scopeLabel}</div>
        <div style={{ marginLeft: "auto", fontSize: "0.68rem", fontWeight: 700, color: C.muted }}>n = {useBest ? `${bestN} best · ${n} total` : `${n}`} {n === 1 ? "study" : "studies"}</div>
      </div>
      {!hasSignal ? (
        <div style={{ fontSize: "0.78rem", color: C.muted, lineHeight: 1.55 }}>
          Add a few graded setups to your book{n > 0 ? ` (you have ${n} so far)` : ""} — once you have three or more with ticked factors, this card tallies which characteristics show up most in your best setups, so you can collate your own rules.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gap: 7 }}>
            {top.map((f) => {
              const num = useBest ? f.best : f.all;
              return (
                <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: "0.78rem", fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.label}</span>
                      <span style={{ fontSize: "0.74rem", fontWeight: 800, color: C.goldBright, whiteSpace: "nowrap" }}>{num}/{denom}{useBest && f.all > f.best ? <span style={{ color: C.muted, fontWeight: 600 }}> · {f.all}/{n} all</span> : null}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                      <div style={{ width: `${bar(num)}%`, height: "100%", borderRadius: 99, background: `linear-gradient(90deg, ${C.goldMid}, ${C.goldBright})` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: "0.68rem", color: C.muted, marginTop: 11, lineHeight: 1.5 }}>
            Honest counts — how often each ticked factor appears in {scopeLabel} (each factor counted once per setup). No lift statistics; just your own recurring commonalities. Export the CSV above to slice them any way you like.
          </div>
        </>
      )}
    </div>
  );
}

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
      // The ONE ordered chronological chart list (Valen 2026-07-26). Built from before_img/after_img on load
      // (plain rows: before→before_img, after→after_img); lives in metrics.charts; the legacy columns are
      // DERIVED from it on save so the card grid / flash-card strip / PDF / CSV keep reading before_img/after_img.
      base.metrics = { ...(base.metrics || {}), charts: buildChartList(base, false) };
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
    // 📋 Paste-to-upload: copy a chart screenshot, hit ⌘V/Ctrl+V anywhere in the editor — the image is
    // appended (untagged, oldest-last) to the chart list. ChartSeqEditor's own paste target stops propagation
    // so a paste inside it never double-adds here.
    const setCharts = (fn) => setRow(r => ({ ...r, metrics: { ...(r.metrics || {}), charts: fn((r.metrics && r.metrics.charts) || []) } }));
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find(i => i.type && i.type.startsWith("image/"));
      if (!item) return;
      e.preventDefault();
      const file = item.getAsFile();
      if (!file) return;
      const slot = "seq_" + Date.now();
      onUpload(file, slot, (updater) => { const url = updater({})[slot]; if (url) setCharts(list => [...list, { img: url, label: "", caption: "", role: null }]); });
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
        {/* Charts — the ONE ordered, chronological, self-labeled list (metrics.charts). Paste or upload any
            number, reorder them, caption each. The Before/After flash-card faces are derived from the list on
            save (first = Before, last = After) so the card grid and study strip keep working. */}
        <div style={{ marginBottom: 14 }}>
          <span style={lbl}>Charts — oldest to newest</span>
          <div style={{ fontSize: "0.7rem", color: C.muted, margin: "0 0 10px" }}>Add as many as you like. The <b style={{ color: C.goldBright }}>first</b> chart becomes the Before face and the <b style={{ color: C.goldBright }}>last</b> the After face automatically — or tag any chart's role yourself.</div>
          <ChartSeqEditor C={C} font={font} busy={busy} list={(row.metrics && row.metrics.charts) || []} compact
            onChange={(nl) => setRow(r => ({ ...r, metrics: { ...(r.metrics || {}), charts: nl } }))}
            onUpload={onUpload} />
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

// ── EXPORT PICKER (Valen 2026-07-27) — one dialog behind BOTH toolbar buttons. Multi-select, filter by
// ticker (comma-list = exact set · single = substring), date range on entry_date, and (admin, when studies
// are in the population) a type chip (All / Studies / Classic). Footer PDF/CSV act on the SELECTED rows.
// Population: members → their own plain rows (byte-identical to before); admin → plain + study rows (the
// unified My Research set). Portaled to body; z 1100 — above the card grid, below the detail overlay ladder
// (detail 1200 · study editor 1250 · lightbox 1500). Palette C; near-black text on gold chips.
function ExportDialog({ C, font, isAdmin, pop, gradeBadge, onClose, coverTitle }) {
  const opts = isAdmin ? undefined : { makerGate: false };
  const hasStudies = isAdmin && pop.some(isStudyRow);
  const [tickerRaw, setTickerRaw] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [typeF, setTypeF] = useState("all"); // all | studies | classic
  const filtered = pop.filter((r) => {
    if (hasStudies && typeF === "studies" && !isStudyRow(r)) return false;
    if (hasStudies && typeF === "classic" && isStudyRow(r)) return false;
    const t = String(r.ticker || "").toUpperCase();
    const raw = tickerRaw.trim().toUpperCase();
    if (raw) {
      if (raw.includes(",")) { // comma-separated list → exact-ticker set
        const toks = raw.split(",").map((x) => x.trim()).filter(Boolean);
        if (!toks.includes(t)) return false;
      } else if (!t.includes(raw)) return false; // single term → substring/contains
    }
    const iso = mbISO(r.entry_date); // date range on entry_date (blank bound = open-ended)
    if (from && (!iso || iso < from)) return false;
    if (to && (!iso || iso > to)) return false;
    return true;
  });
  // Selection: default ALL of the filtered set; re-select-all whenever a filter changes (state stays simple).
  const [selected, setSelected] = useState(() => new Set(pop.map((r) => r.id)));
  useEffect(() => { setSelected(new Set(filtered.map((r) => r.id))); /* eslint-disable-next-line */ }, [tickerRaw, from, to, typeF]);
  const selectedRows = filtered.filter((r) => selected.has(r.id));
  const N = selectedRows.length, M = filtered.length;
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const chipS = (active) => ({
    display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontSize: "0.7rem", fontWeight: 700,
    padding: "6px 13px", borderRadius: 99, cursor: "pointer", fontFamily: font, transition: "all .14s",
    border: `1px solid ${active ? C.goldBright : C.border}`, color: active ? "#08080e" : C.muted,
    background: active ? `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})` : "rgba(255,255,255,0.03)",
  });
  const inputS = { background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 10, color: C.white, fontFamily: font, fontSize: "0.8rem", padding: "8px 11px", outline: "none", colorScheme: "dark" };
  const smallBtn = { background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.muted, fontFamily: font, fontWeight: 700, fontSize: "0.7rem", padding: "6px 13px", borderRadius: 99, cursor: "pointer" };
  const footBtn = (disabled) => ({ background: disabled ? "rgba(255,255,255,0.05)" : `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})`, color: disabled ? C.muted : "#08080e", border: disabled ? `1px solid ${C.border}` : "none", fontFamily: font, fontWeight: 800, fontSize: "0.8rem", padding: "11px 22px", borderRadius: 99, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.65 : 1 });

  // outcome chip (label + color) — study rows use the pre-registered class; plain rows the outcome column/derivation.
  const outcomeChip = (r) => {
    if (isStudyRow(r)) {
      const cls = outcomeClass(r.metrics.study), oc = cls ? OC_CHIP[cls] : null;
      return oc ? { label: `${oc.emoji} ${oc.label}`, color: oc.color } : { label: "— pending", color: C.muted };
    }
    const eo = r.outcome || outcomeFromR(r.r_mult, r.run_pct);
    if (!eo) return { label: "— pending", color: C.muted };
    const win = /winner/i.test(eo), loss = /(loser|subpar)/i.test(eo);
    return { label: `${win ? "▲ " : loss ? "▼ " : ""}${eo}`, color: win ? C.goldBright : loss ? "#e05555" : C.muted };
  };
  const gradeLetter = (r) => isStudyRow(r) ? studyQuality(r.metrics.study).letter
    : gradeBadge(effectiveStars(cardStars(r), (r.elite || []).length).n).l;

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(4,4,8,0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(760px, 96%)", background: "linear-gradient(180deg, rgba(18,18,26,0.97), rgba(8,8,14,0.99))", border: `1px solid ${C.borderGold}`, borderRadius: 18, padding: "22px 24px", boxShadow: "0 40px 100px rgba(0,0,0,0.72)", fontFamily: font }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: C.gold }}>Export</div>
            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: C.white, marginTop: 3 }}>Export your book</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.muted, width: 34, height: 34, borderRadius: 10, fontSize: "1.2rem", cursor: "pointer", lineHeight: 1 }}>&times;</button>
        </div>
        <div style={{ fontSize: "0.74rem", color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>Pick what to export — filter, then tick the entries. PDF = a branded study book; CSV = a flat sheet for any analysis tool.</div>

        {/* (a) FILTERS */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 }}>
          <input value={tickerRaw} onChange={(e) => setTickerRaw(e.target.value)} placeholder="Ticker — MXL, PLTR or a substring"
            style={{ ...inputS, flex: "1 1 220px", minWidth: 0, fontWeight: 700, borderColor: tickerRaw ? C.goldBright : C.border }} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.68rem", fontWeight: 700, color: C.muted }}>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...inputS, cursor: "pointer" }} /></label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.68rem", fontWeight: 700, color: C.muted }}>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...inputS, cursor: "pointer" }} /></label>
        </div>
        {hasStudies && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            {[["all", "All"], ["studies", "Studies"], ["classic", "Classic entries"]].map(([k, label]) => (
              <button key={k} onClick={() => setTypeF(k)} style={chipS(typeF === k)}>{label}</button>
            ))}
          </div>
        )}

        {/* (b) SELECT-ALL / CLEAR + count */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <button onClick={() => setSelected(new Set(filtered.map((r) => r.id)))} style={smallBtn}>Select all</button>
          <button onClick={() => setSelected(new Set())} style={smallBtn}>Clear</button>
          <span style={{ marginLeft: "auto", fontSize: "0.72rem", fontWeight: 700, color: C.goldBright }}>{N} of {M} selected</span>
        </div>

        {/* (b) FILTERED LIST — scrolls internally */}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, maxHeight: "min(46vh, 380px)", overflowY: "auto", marginBottom: 16 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "34px 16px", textAlign: "center", color: C.muted, fontSize: "0.8rem" }}>No entries match these filters.</div>
          ) : filtered.map((r) => {
            const on = selected.has(r.id);
            const gl = gradeLetter(r);
            const pat = isStudyRow(r) ? (r.metrics.study.setup || r.pattern) : r.pattern;
            const ocp = outcomeChip(r);
            return (
              <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, cursor: "pointer", fontSize: "0.76rem" }}>
                <input type="checkbox" checked={on} onChange={() => toggle(r.id)} style={{ cursor: "pointer", accentColor: C.goldBright, flexShrink: 0 }} />
                <b style={{ width: 62, color: C.white, flexShrink: 0 }}>{r.ticker}</b>
                <span style={{ width: 82, color: C.muted, flexShrink: 0 }}>{r.entry_date || "—"}</span>
                <span style={{ flex: 1, minWidth: 0, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pat || "—"}</span>
                {gl === "—"
                  ? <span style={{ flexShrink: 0, minWidth: 24, textAlign: "center", padding: "1px 7px", borderRadius: 6, fontWeight: 800, fontSize: "0.66rem", color: C.muted, border: `1px solid ${C.border}` }}>—</span>
                  : <span style={{ flexShrink: 0, minWidth: 24, textAlign: "center", padding: "2px 7px", borderRadius: 6, fontWeight: 800, fontSize: "0.66rem", color: "#08080e", background: `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})` }}>{gl}</span>}
                <span style={{ width: 108, flexShrink: 0, textAlign: "right", fontWeight: 800, fontSize: "0.66rem", color: ocp.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ocp.label}</span>
              </label>
            );
          })}
        </div>

        {/* (c) FOOTER — act on the SELECTED rows */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button disabled={N === 0} onClick={() => N && openMyBookPdf(selectedRows, coverTitle ? { ...(opts || {}), coverTitle } : opts)} style={footBtn(N === 0)}>⬇ Export PDF ({N})</button>
          <button disabled={N === 0} onClick={() => N && downloadMyBookCsv(selectedRows, opts)} style={footBtn(N === 0)}>⬇ CSV ({N})</button>
        </div>
      </div>
    </div>, document.body);
}

export default function ModelBookPage({ C, font, session, isAdmin, guideEnter, guideLeave, gactive, journaledTrades }) {
  const uid = session?.user?.id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fPattern, setFPattern] = useState("All");
  // Gallery sub-filters (Valen 2026-07-26) — pattern chips + grade + outcome + ticker search, AND-combined.
  const [fGrade, setFGrade] = useState("All"); // All | A+ | A | B  (B = B & below)
  const [fOutcome, setFOutcome] = useState("All"); // All | winners | failures
  const [fTicker, setFTicker] = useState(""); // free-text ticker search
  // Deep link from the top nav ("Studies" admin link): viv-mb-view=studies opens My Book → 📚 Studies
  // directly. Read-and-clear synchronously so it only steers this mount, never a later visit.
  const mbDeepLink = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("viv-mb-view") : null;
  if (mbDeepLink) sessionStorage.removeItem("viv-mb-view");
  const [fScope, setFScope] = useState(mbDeepLink === "studies" ? "mine" : "All"); // All | official (VIV published) | mine (my personal book)
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} (new) | row (edit)
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false); // Export picker dialog (multi-select + filters)
  const [zoom, setZoom] = useState(null); // lightbox: { imgs: {before, after}, slot: "before"|"after" }
  const [studyMode, setStudyMode] = useState(mbDeepLink === "studies"); // 📚 Studies view (admin, inside My Book)
  const [book, setBook] = useState("__all__"); // active project book in My Research: "__all__" | "__none__" (Winner DNA) | project name
  // Studies-list column sort (Valen 2026-07-28): [{ key: "entry"|"trigger", dir: 1|-1 }, …] — index 0 = primary,
  // later entries = secondary (multi-sort: clicking a new column makes it primary, the old primary demotes).
  // Clicking the active primary toggles asc→desc→off. Empty array = the default ticker-chronicle order.
  const [listSort, setListSort] = useState([]);
  const [studyEditing, setStudyEditing] = useState(null); // null | {} (new) | row (edit)
  // StudyEditor sets this to a guard that returns true when it's safe to close (no unsaved changes, or the
  // user confirmed discarding). The backdrop click consults it; StudyEditor's own Cancel/nav guard themselves.
  const studyCloseGuard = useRef(() => true);

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

  // Grade badge derived from the objective star tier (same source as the stars — no new data, no re-scoring).
  // Defined BEFORE `visible` because the grade sub-filter reads it during the filter pass (avoid a TDZ crash).
  const gradeBadge = (n) => n >= 5 ? { l: "A+", fg: "#86efac", bg: "rgba(34,197,94,0.15)", bd: "rgba(34,197,94,0.3)" }
    : n === 4 ? { l: "A", fg: "#86efac", bg: "rgba(34,197,94,0.15)", bd: "rgba(34,197,94,0.3)" }
    : n === 3 ? { l: "B", fg: C.goldBright, bg: C.goldDim, bd: C.borderGold }
    : { l: "C", fg: "#fca5a5", bg: "rgba(239,68,68,0.12)", bd: "rgba(239,68,68,0.3)" };

  // Admin's 🎴 Gallery view over My Research shows the WHOLE personal dataset as cards — study rows +
  // plain rows together (the "same fills, VIV-Official format" view). Everywhere else, studies stay out
  // of the card grid unless starred for the Model Book (members are entirely unaffected — adminGallery is
  // false for them, so their card grid is byte-identical).
  const adminGallery = isAdmin && fScope === "mine";
  // A specific project book (not "All books" / "Winner DNA") is open — drives the year-grouped book gallery + scoped export.
  const isProjectBook = adminGallery && book !== "__all__" && book !== "__none__";
  const cardFilter = (r) => {
    // studies live in their own 📚 view UNLESS starred for the Model Book (then they show as cards too)
    if (isStudyRow(r) && !inModelBook(r) && !adminGallery) return false;
    if (fScope === "official" && !r.is_published) return false;
    if (fScope === "mine" && r.created_by !== uid) return false;
    if (adminGallery && !matchesBook(r, book)) return false; // active project book (My Research gallery)
    if (fPattern !== "All" && r.pattern !== fPattern) return false;
    if (fGrade !== "All") {
      const l = gradeBadge(effectiveStars(cardStars(r), (r.elite || []).length).n).l;
      if (fGrade === "B") { if (l !== "B" && l !== "C") return false; } // "B & below" bucket
      else if (l !== fGrade) return false;
    }
    // Effective outcome = SAME fallback the card hero uses (outcome column, else derived from
    // R/captured%) — filtering on the raw column alone hid cards that visibly render ▲/▼.
    const effOutcome = r.outcome || outcomeFromR(r.r_mult, r.run_pct) || "";
    if (fOutcome === "winners" && !/winner/i.test(effOutcome)) return false;
    if (fOutcome === "failures" && !/(loser|subpar)/i.test(effOutcome)) return false;
    if (fTicker.trim() && !String(r.ticker || "").toLowerCase().includes(fTicker.trim().toLowerCase())) return false;
    return true;
  };
  const visible = rows.filter(cardFilter);
  // Distinct patterns actually present among card-eligible rows → the chip set (All + those values).
  const cardEligible = rows.filter(r => !isStudyRow(r) || inModelBook(r));
  const patternsPresent = [...new Set(cardEligible.map(r => r.pattern).filter(Boolean))];
  const subFiltersActive = fPattern !== "All" || fGrade !== "All" || fOutcome !== "All" || !!fTicker.trim();
  const clearSubFilters = () => { setFPattern("All"); setFGrade("All"); setFOutcome("All"); setFTicker(""); };
  const myRows = rows.filter(r => r.created_by === uid && !isStudyRow(r)); // the member's OWN card entries — export + Your-patterns scope
  const mineCount = myRows.length; // must match the fScope==='mine' predicate
  const studyRows = rows.filter(r => r.created_by === uid && isStudyRow(r));
  // Project books (Valen 2026-07-28): distinct project names across the study rows + the count for each chip.
  const projectBooks = isAdmin ? [...new Set(studyRows.map(studyProject).filter(Boolean))].sort() : [];
  const dnaCount = studyRows.filter(r => !studyProject(r)).length; // 📕 Winner DNA = studies with no project
  // Lab (scoreboard / hypotheses / campaign list) is computed from the ACTIVE book's rows so each book's stats are its own.
  const bookStudyRows = studyRows.filter(r => matchesBook(r, book));
  // Export population: members export their own plain rows (byte-identical to before); admin exports the
  // unified My Research set (plain rows + study rows). A project book scopes the export to that book's rows
  // only (Change 7 — All books / Winner DNA keep the unified population). The dialog filters/selects within this.
  const exportPop = isAdmin
    ? (isProjectBook ? studyRows.filter(r => matchesBook(r, book)) : [...myRows, ...studyRows])
    : myRows;
  // ── My Research gallery (Change 6): collapse each multi-leg campaign into ONE card (root leg's charts), so a
  // 5-leg campaign is a single card with a "{n} legs" chip — never 4 chartless leg-cards. Solo studies + plain
  // rows pass through. buildCampaigns groups by metrics.study.campaign_id; the root is the earliest leg (the one
  // that carries the charts). Roots are re-run through cardFilter so grade/outcome/ticker chips still apply.
  const galleryCards = (() => {
    if (!adminGallery) return visible.map(r => ({ r, legs: 1 }));
    const studies = studyRows.filter(r => matchesBook(r, book));
    const campCards = buildCampaigns(studies).list.map(c => ({ r: c.root, legs: c.count })).filter(x => cardFilter(x.r));
    const plain = visible.filter(r => !isStudyRow(r)).map(r => ({ r, legs: 1 }));
    return [...campCards, ...plain];
  })();
  // Project-book gallery groups by YEAR of entry_date ascending, tickers sorted within each year.
  const bookYearGroups = (() => {
    if (!isProjectBook) return [];
    const by = {};
    galleryCards.forEach(item => { const y = String(item.r.entry_date || "").slice(0, 4) || "—"; (by[y] ||= []).push(item); });
    return Object.entries(by).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([y, items]) => [y, items.sort((a, b) => String(a.r.ticker || "").localeCompare(String(b.r.ticker || "")))]);
  })();

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
    // Chart list → legacy columns. Study rows arrive from StudyEditor with before_img/after_img ALREADY derived
    // (its own doSave), so leave those as-is. Plain member/card rows carry metrics.charts here → derive the two
    // flash-card faces (first=Before, last=After) so the grid/strip/PDF/CSV keep reading before_img/after_img.
    let derivedBefore = row.before_img, derivedAfter = row.after_img;
    if (!isStudyRow(row) && row.metrics?.charts) {
      const d = deriveChartFields(row.metrics.charts, false);
      derivedBefore = d.before_img; derivedAfter = d.after_img;
    }
    const body = {
      ticker: (row.ticker || "").toUpperCase().trim(), pattern: row.pattern || "Trendline Breakout",
      stars: starsFromTicked(row.ticked, isAdmin ? undefined : { makerGate: false }).stars, // objective — from the grader ticks; members score equal-weight (no ★-maker gate). Only THIS save's row is (re)scored — existing rows untouched.
      outcome: row.outcome || outcomeFromR(row.r_mult, row.run_pct) || null, // blank → auto-classified from R
      theme: row.theme || null, entry_date: row.entry_date || null, exit_date: row.exit_date || null,
      before_img: derivedBefore || null, after_img: derivedAfter || null,
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

  // "+ Add leg" (Valen 2026-07-24): link a new leg to a trend. If the clicked root has no campaign_id yet,
  // stamp it (`<TICKER>-<root trigger date>`, stable) on the existing row first, then open the editor for a
  // NEW child pre-filled with campaign_id/ticker/theme/setup and young_leg = previous leg's + 1 (capped at
  // the 3rd-leg bucket, overridable). We PRE-FILL the young_leg refinement value only — we never pre-tick
  // the `young` eyeball bucket (that stays his call). study-fill's upsert preserves campaign_id (spreads s0).
  const addLeg = async (rootRow, legs) => {
    const root = rootRow.metrics.study;
    let cid = root.campaign_id;
    if (!cid) {
      cid = `${rootRow.ticker}-${rootRow.entry_date}`;
      const mt = { ...rootRow.metrics, study: { ...root, campaign_id: cid } };
      setRows(rs => rs.map(x => x.id === rootRow.id ? { ...x, metrics: mt } : x)); // optimistic
      const { error } = await supabase.from("model_book").update({ metrics: mt }).eq("id", rootRow.id);
      if (error) { setError(String(error.message)); return; }
    }
    const chain = (legs && legs.length ? legs : [rootRow]);
    const prevYoung = parseInt(chain[chain.length - 1].metrics.study.checks?.young_leg || "0", 10);
    const nextYoung = prevYoung ? String(Math.min(prevYoung + 1, 3)) : ""; // pre-fill refinement, cap at 3rd+ bucket
    setStudyEditing({
      ticker: rootRow.ticker, entry_date: "", theme: rootRow.theme || "",
      metrics: { study: { setup: root.setup || "Momentum Breakout", direction: root.direction || "long", regime_tag: "",
        checks: nextYoung ? { young_leg: nextYoung } : {}, m: {}, grade: { letter: "" }, outcome: {}, refusal: "", campaign_id: cid } },
    });
  };

  // Leg-strip "+ Add leg" (Valen 2026-07-28): the in-editor strip INSERTS a sibling leg immediately and
  // switches the open editor to it (distinct from the list's addLeg, which stages an unsaved editor). Reads
  // the current leg fresh from the DB (the strip persists it first), derives the campaign root, and — if the
  // campaign has no id yet (a solo root) — stamps `<TICKER>-<root entry_date>` onto the root's FULL metrics
  // object (a partial update would wipe chart-extracted study data) before inserting. New leg: no charts,
  // checks:{}, created_by set on insert only.
  const insertLeg = async (currentId, date) => {
    setBusy(true); setError(null);
    const { data: cur, error: e1 } = await supabase.from("model_book").select("*").eq("id", currentId).single();
    if (e1 || !cur || !cur.metrics?.study) { setError(e1 ? String(e1.message) : "Leg not found."); setBusy(false); return; }
    const cs = cur.metrics.study;
    const ticker = (cur.ticker || "").toUpperCase().trim();
    let cid = cs.campaign_id;
    if (!cid) {
      cid = `${ticker}-${cur.entry_date}`;
      const mt = { ...cur.metrics, study: { ...cs, campaign_id: cid } }; // FULL metrics — partial wipes chart-extracted data
      const { error: e2 } = await supabase.from("model_book").update({ metrics: mt }).eq("id", cur.id);
      if (e2) { setError(String(e2.message)); setBusy(false); return; }
    }
    const body = {
      ticker, entry_date: date, is_published: false, created_by: uid, // created_by set once, on insert only
      metrics: { study: { setup: cs.setup || "Momentum Breakout", campaign_id: cid, checks: {} } }, // never pre-tick eyeball checks
    };
    const { data: created, error: e3 } = await supabase.from("model_book").insert(body).select().single();
    setBusy(false);
    if (e3) { setError(String(e3.message)); return; }
    await load();
    if (created) setStudyEditing(created); // switch the open editor to the new leg
  };

  // Format toggle (admin My Research): studyMode === true ⇔ 🧪 Lab view; false ⇔ 🎴 Gallery view.
  // Persist the last choice so re-entering the scope restores it (default "lab" when unset).
  const setFormat = (lab) => { setStudyMode(lab); try { localStorage.setItem("viv-mb-format", lab ? "lab" : "gallery"); } catch {} };

  const chip = (active) => ({
    display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
    fontSize: "0.72rem", fontWeight: 700, padding: "7px 15px", borderRadius: 99, cursor: "pointer", fontFamily: font, transition: "all .14s",
    border: `1px solid ${active ? C.goldBright : C.border}`, color: active ? "#08080e" : C.muted,
    background: active ? `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})` : "rgba(255,255,255,0.03)",
  });

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
            {exportPop.length > 0 && (
              <>
                {/* Both buttons now open the ONE Export picker (multi-select · filter by ticker · date range).
                    The actual PDF/CSV run on the SELECTED rows from inside the dialog. */}
                <button onClick={() => setExporting(true)}
                  title="Open the export picker — multi-select entries, filter by ticker and date range, then export as a branded PDF study book."
                  style={{ background: "rgba(255,255,255,0.04)", color: C.gold, border: `1px solid ${C.borderGold}`, fontFamily: font, fontWeight: 700, fontSize: "0.78rem", padding: "10px 18px", borderRadius: 99, cursor: "pointer" }}>⬇ Export PDF</button>
                <button onClick={() => setExporting(true)}
                  title="Open the export picker — multi-select entries, filter by ticker and date range, then export as a CSV for any analysis tool."
                  style={{ background: "rgba(255,255,255,0.04)", color: C.gold, border: `1px solid ${C.borderGold}`, fontFamily: font, fontWeight: 700, fontSize: "0.78rem", padding: "10px 18px", borderRadius: 99, cursor: "pointer" }}>⬇ CSV</button>
              </>
            )}
            {/* ONE INTAKE: for ADMIN in 🔒 My Research (fScope==="mine") "＋ New study" opens the STUDY editor
                (studyMode on → Lab view, its portal mounts). Members (never admin) keep their untouched draft
                flow → MBEditor. Admin in All/Official opens MBEditor for a curated card. Editing an EXISTING
                legacy row still uses MBEditor (via the detail overlay's Edit button). */}
            <button onClick={() => { if (isAdmin && fScope === "mine") { setStudyMode(true); setStudyEditing({}); } else setEditing({}); }} style={{ background: `linear-gradient(120deg, ${C.goldMid}, ${C.goldBright}, ${C.goldDeep})`, color: "#0a0a0a", border: "none", fontFamily: font, fontWeight: 700, fontSize: "0.78rem", padding: "10px 20px", borderRadius: 99, cursor: "pointer", boxShadow: "0 6px 18px rgba(201,152,42,0.25)" }}>{(isAdmin && fScope === "mine") ? "＋ New study" : isAdmin ? "+ Add entry" : "+ Add to my book"}</button>
          </div>
        )}
      </div>

      {exporting && <ExportDialog C={C} font={font} isAdmin={isAdmin} pop={exportPop} gradeBadge={gradeBadge} coverTitle={isProjectBook ? book : null} onClose={() => setExporting(false)} />}

      {editing !== null && <MBEditor C={C} font={font} busy={busy} isAdmin={isAdmin} initial={editing.id ? editing : null} onSave={save} onCancel={() => setEditing(null)} onUpload={uploadImg} journaledTrades={journaledTrades} />}

      {/* filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "6px 0 18px", alignItems: "center" }}>
        {/* ONE personal dataset (Valen 2026-07-27): the admin's plain rows + study rows are the SAME
            collection viewed two ways — so his personal scope is ONE chip "🔒 My Research (N)" (N = plain +
            study rows), NOT the old split 📖 Legacy / 📚 Studies chips. Members keep their untouched single
            "🔒 My Book (N)" chip (N = their plain rows). Format (lab vs gallery) lives in the toggle below. */}
        {[["All", "All"], ["official", "⭐ VIV Official"],
          ["mine", isAdmin ? `🔒 My Research${(mineCount + studyRows.length) ? ` (${mineCount + studyRows.length})` : ""}` : `🔒 My Book${mineCount ? ` (${mineCount})` : ""}`]].map(([k, label]) => (
          <button key={k} onClick={() => {
            if (k === "mine") { if (isAdmin) { let f = "lab"; try { f = localStorage.getItem("viv-mb-format") || "lab"; } catch {} setStudyMode(f === "lab"); } }
            else setStudyMode(false);
            setFScope(k);
          }} style={chip(fScope === k)}>{label}</button>
        ))}
        {/* FORMAT toggle — admin only, only in My Research scope. Lab = the studies row/stats view
            (studyMode === true); Gallery = the VIV-Official card grid over the SAME rows. Last choice
            persists in localStorage "viv-mb-format" (default "lab"). */}
        {isAdmin && fScope === "mine" && (
          <>
            <button onClick={() => setFormat(true)} style={chip(studyMode)}>🧪 Lab view</button>
            <button onClick={() => setFormat(false)} style={chip(!studyMode)}>🎴 Gallery view</button>
          </>
        )}
      </div>

      {/* THE SHELF (Valen 2026-07-28) — project "books" within My Research. Filters BOTH Gallery and Lab.
          [All books] = current behaviour · [📕 Winner DNA] = studies with no project · one [📗 …] chip per
          named project. Shown only once at least one project book exists (else the row is noise). */}
      {isAdmin && fScope === "mine" && projectBooks.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "0 0 16px" }}>
          <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: C.muted, marginRight: 2 }}>Books</span>
          <button onClick={() => setBook("__all__")} style={chip(book === "__all__")}>All books</button>
          <button onClick={() => setBook("__none__")} style={chip(book === "__none__")}>📕 Winner DNA{dnaCount ? ` (${dnaCount})` : ""}</button>
          {projectBooks.map(p => {
            const n = studyRows.filter(r => studyProject(r) === p).length;
            return <button key={p} onClick={() => setBook(p)} style={chip(book === p)}>📗 {p}{n ? ` (${n})` : ""}</button>;
          })}
        </div>
      )}

      {/* gallery sub-filter bar (Valen 2026-07-26) — pattern · grade · outcome · ticker search, AND-combined.
          Hidden in 📚 Studies mode (the studies list has its own layout). Styled with the app's toolbar chips. */}
      {!studyMode && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "0 0 18px" }}>
          {["All", ...patternsPresent].map(p => (
            <button key={p} onClick={() => setFPattern(p)} style={chip(fPattern === p)}>{p === "All" ? "All patterns" : p}</button>
          ))}
          <span style={{ width: 1, alignSelf: "stretch", background: C.border, margin: "0 4px" }} />
          {[["All", "Any grade"], ["A+", "A+"], ["A", "A"], ["B", "B & below"]].map(([k, label]) => (
            <button key={k} onClick={() => setFGrade(k)} style={chip(fGrade === k)}>{label}</button>
          ))}
          <span style={{ width: 1, alignSelf: "stretch", background: C.border, margin: "0 4px" }} />
          {[["All", "All"], ["winners", "▲ Winners"], ["failures", "▼ Failures"]].map(([k, label]) => (
            <button key={k} onClick={() => setFOutcome(k)} style={chip(fOutcome === k)}>{label}</button>
          ))}
          <span style={{ width: 1, alignSelf: "stretch", background: C.border, margin: "0 4px" }} />
          <input value={fTicker} onChange={e => setFTicker(e.target.value.toUpperCase())} placeholder="Search ticker…"
            style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${fTicker ? C.goldBright : C.border}`, borderRadius: 99, color: C.white, fontFamily: font, fontSize: "0.72rem", fontWeight: 700, padding: "7px 14px", outline: "none", width: 140, maxWidth: "100%", colorScheme: "dark" }} />
          {subFiltersActive && (
            <button onClick={clearSubFilters} title="Reset pattern / grade / outcome / ticker filters"
              style={{ ...chip(false), color: C.goldBright, borderColor: C.borderGold }}>✕ Clear</button>
          )}
        </div>
      )}
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
      {!studyMode && !loading && !error && visible.length === 0 && (
        <div style={{ color: C.muted, fontSize: "0.86rem", padding: "34px 16px", textAlign: "center", lineHeight: 1.6 }}>
          {subFiltersActive
            ? <>No entries match these filters. <button onClick={clearSubFilters} style={{ background: "none", border: "none", color: C.goldBright, fontFamily: font, fontWeight: 800, fontSize: "0.86rem", cursor: "pointer", textDecoration: "underline", padding: 0 }}>Clear filters</button> to see the full book.</>
            : fScope === "mine" ? "Your book is empty — save a setup to start building your own pattern library."
            : fScope === "official" ? "No published setups yet — the VIV team is curating the library. Check back soon."
            : "No entries yet — curated VIV setups and your own saved studies will appear here as cards."}
        </div>
      )}

      {/* 📚 STUDIES — private study wing of My Book (admin): study a bunch BEFORE posting.
          Rows are model_book rows with metrics.study; excluded from the card grid until promoted. */}
      {studyMode && fScope === "mine" && isAdmin && (
        <div style={{ marginBottom: 20 }}>
          {/* Order (Valen 2026-07-26): 🧪 hypothesis tally FIRST, then the scoreboard (stats → outcome-class
              glossary → factor lift). The tally is the headline read; lift sits last behind the zero-F guard. */}
          <StudyHypotheses C={C} rows={bookStudyRows} />
          <StudyScoreboard C={C} rows={bookStudyRows} />
          {/* Editor opens as a blurred-backdrop POPUP (Valen 2026-07-17) — click a row anywhere in the
              list and edit right there, no scrolling back up. Backdrop click / Cancel closes; clicks
              inside never close (members are editing). Portaled to body so no card backdrop-filter
              becomes its containing block. No Esc-close here: the editor's chart lightbox owns Esc. */}
          {studyEditing !== null && createPortal(
            <div onClick={() => { if (studyCloseGuard.current()) setStudyEditing(null); }} style={{ position: "fixed", inset: 0, zIndex: 1250, background: "rgba(4,4,8,0.55)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", overflowY: "auto", padding: "4vh 3vw" }}>
              <div onClick={e => e.stopPropagation()} style={{ maxWidth: 1180, margin: "0 auto", background: "rgba(10,10,16,0.92)", borderRadius: 16 }}>
                <StudyEditor key={studyEditing.id || (studyEditing.metrics ? "child" : "new")} C={C} font={font} busy={busy} campaignRows={studyRows}
                  initial={studyEditing && (studyEditing.id || studyEditing.metrics) ? studyEditing : null}
                  closeGuard={studyCloseGuard} onNavigate={(t) => setStudyEditing(t)}
                  onSave={async (r) => { if (await save(r)) setStudyEditing(null); }}
                  onSaveStay={save} onAddLeg={insertLeg}
                  onCancel={() => setStudyEditing(null)} onUpload={uploadImg} />
              </div>
            </div>, document.body)}
          <button onClick={() => setStudyEditing({})} style={{ background: `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})`, color: "#08080e", border: "none", fontFamily: font, fontWeight: 800, fontSize: "0.78rem", padding: "10px 20px", borderRadius: 99, cursor: "pointer", marginBottom: 14 }}>＋ New study</button>
          {bookStudyRows.length === 0 && studyEditing === null && (
            <div style={{ color: C.muted, fontSize: "0.82rem", padding: "18px 0" }}>{isProjectBook ? "No studies in this book yet — hit ＋ New study and set its Project to this book." : "No studies yet — hit ＋ New study. Grade blind (grade + prediction locked before the outcome opens), then record what happened. The scoreboard finds your winner DNA as the sample grows."}</div>
          )}
          {/* Grouped by CAMPAIGN (Valen 2026-07-24): legs of one trend nest under a header (ticker · span ·
              N legs · shared BEFORE→AFTER). Solo studies (no campaign_id) render as a single row exactly as
              before — a campaign of one. "+ Add leg" links a new leg to the trend. */}
          {/* Sortable column headers (Valen 2026-07-28): Entry date + Trigger date, multi-sort — the last
              clicked column is primary (¹), the previous one secondary (²). Blank dates always sort last.
              Widths mirror the legRow columns below so headers sit over their data. */}
          {(() => {
            const th = (key, label, width) => {
              const idx = listSort.findIndex(s => s.key === key);
              const st = idx >= 0 ? listSort[idx] : null;
              const cyc = () => setListSort(prev => {
                const i = prev.findIndex(s => s.key === key);
                if (i === 0) return prev[0].dir === 1 ? [{ key, dir: -1 }, ...prev.slice(1)] : prev.slice(1); // asc→desc→off
                const rest = prev.filter(s => s.key !== key);
                return [{ key, dir: 1 }, ...rest]; // new/secondary click → primary asc
              });
              return (
                <button onClick={cyc} title="Click to sort — asc → desc → off. The other date column stays as a secondary sort."
                  style={{ width, textAlign: "left", background: "transparent", border: "none", cursor: "pointer", padding: 0, fontFamily: font, fontSize: "0.6rem", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: st ? C.goldBright : C.muted, whiteSpace: "nowrap" }}>
                  {label}{st ? (st.dir === 1 ? " ↑" : " ↓") : " ⇅"}{listSort.length > 1 && idx >= 0 ? <sup>{idx + 1}</sup> : null}
                </button>
              );
            };
            return (
              <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "2px 12px 6px" }}>
                <span style={{ width: 64, fontSize: "0.6rem", fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: C.muted }}>Ticker</span>
                {th("entry", "Entry date", 92)}
                {th("trigger", "Trigger date", 92)}
              </div>
            );
          })()}
          {buildCampaigns(bookStudyRows).list
            .sort((a, b) => {
              const trig = (c) => c.root.metrics?.study?.m?.trigger_date || "";
              for (const s of listSort) {
                const va = s.key === "entry" ? String(a.span[0] || "") : trig(a);
                const vb = s.key === "entry" ? String(b.span[0] || "") : trig(b);
                if (!va && vb) return 1; if (va && !vb) return -1; // blanks last, whatever the direction
                if (va !== vb) return va.localeCompare(vb) * s.dir;
              }
              return a.root.ticker === b.root.ticker
                ? String(a.span[0] || "").localeCompare(String(b.span[0] || ""))
                : (a.root.ticker < b.root.ticker ? -1 : 1);
            })
            .map((camp) => {
              // Plain render helper (invoked directly → inline elements, not a nested component).
              const legRow = (r, legIndex, indent, showAddLeg) => {
                const s = r.metrics.study; const cls = outcomeClass(s);
                const oc = OC_CHIP[cls]; // outcome-class chip (undefined when pending)
                const hctx = { ticker: r.ticker, date: r.entry_date }; // ctx for the per-hypothesis vote strip
                // chartFaces (Valen 2026-07-26) — reads the unified list (converts legacy rows), so a study whose
                // charts aren't slot-shaped still shows thumbs. Nested legs share the trend's outcome = the root's back face.
                // Display inheritance (Valen 2026-07-28): a leg with NO charts of its own shows the campaign ROOT's
                // chart set (presentation-only — nothing is copied into the leg row). Marked "↩ shared"; the "after?"
                // upload invite is suppressed so a chart never gets attached to the wrong leg.
                const ownFaces = chartFaces(r, true);
                const rootFacesInh = indent ? chartFaces(camp.root, true) : null;
                const rootHasCharts = !!rootFacesInh && (!!(rootFacesInh.front && rootFacesInh.front.img) || !!(rootFacesInh.back && rootFacesInh.back.img) || rootFacesInh.count > 0);
                const inheritCharts = indent && !(ownFaces.front && ownFaces.front.img) && rootHasCharts;
                const faces = inheritCharts ? rootFacesInh : ownFaces;
                const frontImg = faces.front && faces.front.img;
                const backImg = indent ? ((rootFacesInh && rootFacesInh.back) ? rootFacesInh.back.img : null) : (faces.back && faces.back.img);
                return (
                  <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 4, marginLeft: indent ? 22 : 0, fontSize: "0.78rem", cursor: "pointer" }}
                    onClick={() => setStudyEditing(r)}
                    onMouseEnter={e => e.currentTarget.style.borderColor = C.borderGold} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                    {indent
                      ? <span style={{ width: 64, color: C.muted, fontSize: "0.66rem", fontWeight: 700 }}>leg {legIndex}</span>
                      : <b style={{ width: 64 }}>{r.ticker}</b>}
                    <span style={{ color: C.muted, width: 92 }}>{r.entry_date || "—"}</span>
                    {/* Trigger date (Valen 2026-07-28) — his picked trigger (metrics.study.m.trigger_date), distinct
                        from the entry/anchor date (e.g. Market Bottom rows anchor on the LOW; the trigger comes later). */}
                    <span title="Trigger date — fill it in the editor's metrics grid" style={{ color: s.m?.trigger_date ? C.goldBright : C.muted, width: 92, fontSize: "0.74rem" }}>{s.m?.trigger_date || "—"}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, width: 148, flexShrink: 0 }}>
                      {frontImg
                        ? <span style={{ position: "relative", display: "inline-block", width: 64, height: 40, flexShrink: 0 }}>
                            <img src={frontImg} alt="setup" title={inheritCharts ? "Chart set shared from Leg 1 — charts live on the root leg" : "The setup (this leg)"} style={{ width: 64, height: 40, objectFit: "cover", borderRadius: 5, border: `1px solid ${C.border}`, display: "block" }} />
                            {inheritCharts && <span title="Chart set shared from Leg 1 — charts live on the root leg" style={{ position: "absolute", top: -5, left: -5, background: "rgba(8,8,14,0.92)", border: `1px solid ${C.borderGold}`, color: C.goldBright, fontSize: "0.48rem", fontWeight: 800, letterSpacing: ".02em", borderRadius: 99, padding: "0 4px", lineHeight: 1.6, whiteSpace: "nowrap" }}>↩ shared</span>}
                          </span>
                        : <span style={{ width: 64, height: 40, borderRadius: 5, border: `1px dashed ${C.border}`, display: "inline-block" }} />}
                      <span style={{ color: C.muted, fontSize: "0.7rem" }}>→</span>
                      {backImg
                        ? <img src={backImg} alt="outcome" title={indent ? "The shared trend outcome" : "The outcome"} style={{ width: 64, height: 40, objectFit: "cover", borderRadius: 5, border: `1px solid ${C.borderGold}` }} />
                        : faces.count > 1
                          ? <span title={`${faces.count} charts in this study`} style={{ width: 64, height: 40, borderRadius: 5, border: `1px solid ${C.borderGold}`, display: "grid", placeItems: "center", color: C.goldBright, fontSize: "0.62rem", fontWeight: 800 }}>+{faces.count - 1}</span>
                          : inheritCharts
                            ? <span style={{ width: 64, height: 40, borderRadius: 5, border: `1px dashed ${C.border}`, display: "inline-block" }} />
                            : <span title="No outcome chart yet — drop `TICKER DATE AFTER.png` in the study inbox" style={{ width: 64, height: 40, borderRadius: 5, border: `1px dashed ${C.border}`, display: "grid", placeItems: "center", color: C.muted, fontSize: "0.56rem" }}>after?</span>}
                    </span>
                    {/* setup comes from the STUDY payload (the pattern column is the legacy Model-Book field —
                        rows seeded by script showed the DB-default "Trendline Breakout", Valen bug report 2026-07-28) */}
                    <span style={{ width: 150 }}>{(s.setup || r.pattern || "") + (s.direction === "short" ? " · Short" : "")}</span>
                    {(() => { const q = studyQuality(s); return <span style={{ width: 70, color: q.letter === "—" ? C.muted : q.letter === "A+" ? "#7ef0a0" : C.goldBright, fontWeight: 700 }} title={`${q.on}/${q.total} criteria ticked`}>{q.letter}</span>; })()}
                    {/* (a) OUTCOME-CLASS chip — emoji + word, colored by tier (never color alone) */}
                    <span title={oc ? `Outcome class: ${oc.label}` : "Outcome pending — grade the result to classify"} style={{ display: "inline-flex", alignItems: "center", gap: 4, width: 108, flexShrink: 0, whiteSpace: "nowrap", fontSize: "0.66rem", fontWeight: 800, color: oc ? oc.color : C.muted }}>{oc ? `${oc.emoji} ${oc.label}` : "— pending"}</span>
                    <span style={{ flex: 1, minWidth: 0, color: C.muted, fontSize: "0.7rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.regime_tag || ""}</span>
                    {/* (b) H-VOTE DOT STRIP — 14 hypotheses in order; read-only reuse of entryVerdict. green=supports ·
                        red=challenges · grey=adds-data · hollow=no vote. Wraps gracefully on narrow screens. */}
                    <span style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center", flex: "none", maxWidth: 130, justifyContent: "flex-end" }}>
                      {HYPOTHESES.map(h => { const v = entryVerdict(h, s, hctx); const b = v ? v.bucket : null;
                        const col = b === "supports" ? "#7ef0a0" : b === "challenges" ? "#e05555" : b === "data" ? "rgba(255,255,255,0.4)" : "transparent";
                        return <span key={h.id} title={`${h.id} · ${b === "data" ? "adds data" : b || "no vote"}`} style={{ width: 7, height: 7, borderRadius: "50%", background: col, border: b ? "none" : `1px solid ${C.border}`, boxSizing: "border-box", flex: "none" }} />; })}
                    </span>
                    {showAddLeg && <button title="Add a linked leg to this trend" onClick={(e) => { e.stopPropagation(); addLeg(camp.root, camp.legs); }} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: "0.6rem", fontWeight: 800, borderRadius: 99, padding: "2px 8px", whiteSpace: "nowrap" }}>+ leg</button>}
                    <button title={inModelBook(r) ? "In the Model Book — click to remove" : "Add to the Model Book"} onClick={(e) => { e.stopPropagation(); toggleModelBook(r); }} style={{ background: "transparent", border: "none", color: inModelBook(r) ? C.goldBright : C.muted, cursor: "pointer", fontSize: "1rem" }}>{inModelBook(r) ? "★" : "☆"}</button>
                    <button title="Delete study" onClick={(e) => { e.stopPropagation(); remove(r); }} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: "0.95rem" }}>×</button>
                  </div>
                );
              };
              if (camp.solo) return <div key={camp.cid} style={{ marginTop: 8 }}>{legRow(camp.root, 1, false, true)}</div>;
              const rootFaces = chartFaces(camp.root, true);
              const rootFront = rootFaces.front && rootFaces.front.img;
              const rootBack = rootFaces.back && rootFaces.back.img;
              return (
                <div key={camp.cid} style={{ marginTop: 14, marginBottom: 4, border: `1px solid ${C.borderGold}`, borderRadius: 12, padding: "8px 10px", background: "rgba(201,152,42,0.04)" }}>
                  {/* Campaign header — ticker · trend span · N legs · shared BEFORE→AFTER · + Add leg */}
                  <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "4px 4px 8px", fontSize: "0.78rem", cursor: "pointer" }} onClick={() => setStudyEditing(camp.root)}
                    onMouseEnter={e => e.currentTarget.style.opacity = 0.85} onMouseLeave={e => e.currentTarget.style.opacity = 1}>
                    <b style={{ width: 64, color: C.goldBright }}>{camp.root.ticker}</b>
                    <span style={{ color: C.muted, width: 150, fontSize: "0.7rem" }}>{camp.span[0] || "?"} → {camp.span[1] || "?"}</span>
                    <span style={{ fontSize: "0.62rem", fontWeight: 800, color: C.goldBright, border: `1px solid ${C.borderGold}`, borderRadius: 99, padding: "2px 9px" }}>{camp.count} legs</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, width: 148, flexShrink: 0 }}>
                      {rootFront ? <img src={rootFront} alt="setup" title="The setup — root leg" style={{ width: 64, height: 40, objectFit: "cover", borderRadius: 5, border: `1px solid ${C.border}` }} /> : <span style={{ width: 64, height: 40, borderRadius: 5, border: `1px dashed ${C.border}`, display: "inline-block" }} />}
                      <span style={{ color: C.muted, fontSize: "0.7rem" }}>→</span>
                      {rootBack
                        ? <img src={rootBack} alt="outcome" title="The shared trend outcome" style={{ width: 64, height: 40, objectFit: "cover", borderRadius: 5, border: `1px solid ${C.borderGold}` }} />
                        : rootFaces.count > 1
                          ? <span title={`${rootFaces.count} charts in the root leg`} style={{ width: 64, height: 40, borderRadius: 5, border: `1px solid ${C.borderGold}`, display: "grid", placeItems: "center", color: C.goldBright, fontSize: "0.62rem", fontWeight: 800 }}>+{rootFaces.count - 1}</span>
                          : <span style={{ width: 64, height: 40, borderRadius: 5, border: `1px dashed ${C.border}`, display: "grid", placeItems: "center", color: C.muted, fontSize: "0.56rem" }}>after?</span>}
                    </span>
                    <span style={{ flex: 1 }} />
                    <button title="Add a linked leg to this trend" onClick={(e) => { e.stopPropagation(); addLeg(camp.root, camp.legs); }} style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, color: C.goldBright, cursor: "pointer", fontSize: "0.66rem", fontWeight: 800, borderRadius: 99, padding: "4px 12px", whiteSpace: "nowrap" }}>+ Add leg</button>
                  </div>
                  {camp.legs.map((r, i) => legRow(r, i + 1, true, false))}
                </div>
              );
            })}

          {/* 📖 Legacy entries — the admin's pre-studies plain personal rows, shown in the SAME dense row
              format below the studies so Lab view is the whole personal dataset. These are NOT studies:
              they carry no hypothesis votes (14 hollow dots) and never enter the scoreboard stats above.
              Clicking a row opens the normal card detail overlay (whose Edit routes to MBEditor), not the
              study editor. Admin-only block → plain "Legacy" copy is fine. */}
          {myRows.length > 0 && !isProjectBook && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, borderTop: `1px solid ${C.border}`, paddingTop: 14, marginBottom: 10 }}>
                📖 Legacy entries — pre-studies era <span style={{ color: C.gold }}>({myRows.length})</span>
              </div>
              {myRows.map((r) => {
                const faces = chartFaces(r, false); // plain rows: derives from before_img/after_img
                const frontImg = faces.front && faces.front.img;
                const backImg = faces.back && faces.back.img;
                const gl = gradeBadge(effectiveStars(cardStars(r), (r.elite || []).length).n).l;
                const eo = r.outcome || outcomeFromR(r.r_mult, r.run_pct);
                const win = eo ? /winner/i.test(eo) : null;
                const loss = eo ? /(loser|subpar)/i.test(eo) : null;
                const oc = win ? "#7ef0a0" : loss ? "#e05555" : C.muted;
                return (
                  <div key={r.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 4, fontSize: "0.78rem", cursor: "pointer" }}
                    onClick={() => setDetail(r)}
                    onMouseEnter={e => e.currentTarget.style.borderColor = C.borderGold} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
                    <b style={{ width: 64 }}>{r.ticker}</b>
                    <span style={{ color: C.muted, width: 92 }}>{r.entry_date || "—"}</span>
                    <span style={{ color: C.muted, width: 92 }}>—</span>{/* trigger-column spacer — legacy rows have no study payload */}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, width: 148, flexShrink: 0 }}>
                      {frontImg ? <img src={frontImg} alt="setup" title="The setup" style={{ width: 64, height: 40, objectFit: "cover", borderRadius: 5, border: `1px solid ${C.border}` }} /> : <span style={{ width: 64, height: 40, borderRadius: 5, border: `1px dashed ${C.border}`, display: "inline-block" }} />}
                      <span style={{ color: C.muted, fontSize: "0.7rem" }}>→</span>
                      {backImg
                        ? <img src={backImg} alt="outcome" title="The outcome" style={{ width: 64, height: 40, objectFit: "cover", borderRadius: 5, border: `1px solid ${C.borderGold}` }} />
                        : <span title="No after chart" style={{ width: 64, height: 40, borderRadius: 5, border: `1px dashed ${C.border}`, display: "grid", placeItems: "center", color: C.muted, fontSize: "0.56rem" }}>after?</span>}
                    </span>
                    <span style={{ width: 150 }}>{r.pattern}</span>
                    <span style={{ width: 70, color: gl === "A+" ? "#7ef0a0" : gl === "C" ? "#e05555" : C.goldBright, fontWeight: 700 }} title="Grade from the Setup Grader stars">{gl}</span>
                    <span title={eo ? `Outcome: ${eo}` : "Outcome pending"} style={{ display: "inline-flex", alignItems: "center", gap: 4, width: 108, flexShrink: 0, whiteSpace: "nowrap", fontSize: "0.66rem", fontWeight: 800, color: oc }}>{eo ? `${win ? "▲" : loss ? "▼" : ""} ${eo}` : "— pending"}</span>
                    <span style={{ flex: 1, minWidth: 0 }} />
                    {/* 14-dot alignment slot: hollow only — legacy rows are not part of the hypothesis dataset */}
                    <span title="legacy entry — not part of the hypothesis dataset" style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center", flex: "none", maxWidth: 130, justifyContent: "flex-end" }}>
                      {HYPOTHESES.map(h => <span key={h.id} style={{ width: 7, height: 7, borderRadius: "50%", background: "transparent", border: `1px solid ${C.border}`, boxSizing: "border-box", flex: "none" }} />)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MEMBERS keep "Your patterns" (their honest own-factor tally) in 🔒 My Book — UNCHANGED. For ADMIN
          the 🧪 hypothesis tally + scoreboard now live in 🧪 Lab view only (mounted in the studies block
          above), so 🎴 Gallery view here is a clean card grid — no stats panel above it. */}
      {fScope === "mine" && !studyMode && !loading && !error && !isAdmin && myRows.length > 0 && (
        <YourPatterns C={C} font={font} myRows={myRows} />
      )}

      {/* card grid — mobile-safe auto-fit (min() caps the track so a card never overflows a narrow screen).
          My Research collapses campaigns into ONE card each (Change 6); an open project book renders the
          year-grouped book gallery of two-chart cards (Change 5). renderCard/renderProjectCard are plain
          functions invoked directly (never mounted as <Component/>) — same pattern as legRow above. */}
      {(() => {
        if (studyMode) return null;
        const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 16, marginTop: 4 };
        const legsChip = { fontSize: "0.56rem", fontWeight: 800, color: C.goldBright, border: `1px solid ${C.borderGold}`, background: C.goldDim, borderRadius: 99, padding: "2px 8px", whiteSpace: "nowrap" };
        const renderCard = ({ r, legs }) => {
          const eff = effectiveStars(cardStars(r), (r.elite || []).length);
          const elite = eff.n >= 6;
          const faces = chartFaces(r, isStudyRow(r)); // unified front/back — fixes blank thumbs on non-slot rows
          const gb = gradeBadge(eff.n);
          const dr = mbDateRange(r.entry_date, r.exit_date);
          // HERO outcome line — his own numbers, never faked. Captured % first, peak run-up fallback; glyph + hue
          // from the outcome class (win ▲ gold / loss ▼ red / pending — muted). Days appended when known.
          const heroPct = r.run_pct != null ? r.run_pct : (r.run_up_pct != null ? r.run_up_pct : null);
          const oc = r.outcome || outcomeFromR(r.r_mult, r.run_pct);
          const win = oc ? /winner/i.test(oc) : (heroPct != null ? heroPct >= 0 : null);
          const loss = oc ? /(loser|subpar)/i.test(oc) : (heroPct != null ? heroPct < 0 : null);
          const heroColor = win ? C.goldBright : loss ? C.red : C.muted;
          const heroText = heroPct != null
            ? `${heroPct > 0 ? "+" : ""}${heroPct}%${win ? " ▲" : loss ? " ▼" : ""}${r.days_held != null ? ` · ${r.days_held}d` : ""}`
            : "—";
          // One-line hook — HIS OWN words: first sentence of the lesson (fallback thesis), never generated.
          const hookSrc = (r.lesson || r.thesis || "").trim();
          const hook = hookSrc ? ((hookSrc.match(/^[^.!?]*[.!?]?/) || [hookSrc])[0]).trim() : "";
          return (
            <div key={r.id} onClick={() => setDetail(r)} style={{ position: "relative", background: C.glass, border: `1px solid ${elite ? "rgba(126,240,160,0.32)" : C.border}`, borderRadius: 16, overflow: "hidden", cursor: "pointer", transition: "transform .15s ease, border-color .15s ease" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = elite ? "rgba(126,240,160,0.55)" : C.borderGold; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = elite ? "rgba(126,240,160,0.32)" : C.border; }}>
              {/* cover — front image fills; when a back exists it takes the right half (the before → after pair) */}
              <div style={{ position: "relative", height: 160, overflow: "hidden", borderBottom: `1px solid ${C.border}`, display: "flex" }}>
                {elite && <span style={{ position: "absolute", top: 12, right: 12, zIndex: 2, fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", padding: "5px 12px", borderRadius: 99, background: "rgba(126,240,160,0.16)", border: "1px solid rgba(126,240,160,0.45)", color: "#7ef0a0", boxShadow: "0 0 16px rgba(126,240,160,0.25)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}>⭐ Elite</span>}
                {faces.front ? (
                  <>
                    <img src={faces.front.img} alt={r.ticker} style={{ width: faces.back ? "50%" : "100%", height: 160, objectFit: "cover", display: "block" }} />
                    {faces.back && <img src={faces.back.img} alt={`${r.ticker} outcome`} style={{ width: "50%", height: 160, objectFit: "cover", display: "block", borderLeft: `1px solid ${C.border}` }} />}
                  </>
                ) : (
                  <div style={{ position: "relative", flex: 1, height: 160, background: "linear-gradient(180deg, rgba(201,152,42,0.10), rgba(201,152,42,0) 55%), repeating-linear-gradient(0deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 28px), repeating-linear-gradient(90deg, rgba(255,255,255,0.045) 0 1px, transparent 1px 28px), #0d0d16" }}>
                    <span style={{ position: "absolute", left: 12, bottom: 4, fontSize: "2.6rem", fontWeight: 800, letterSpacing: "-0.02em", color: "rgba(255,255,255,0.05)", lineHeight: 1, userSelect: "none", pointerEvents: "none" }}>{r.ticker}</span>
                  </div>
                )}
              </div>
              {/* body */}
              <div style={{ padding: "14px 16px 16px" }}>
                {/* row 1 — ticker + pattern, grade badge (near-black on gold) top-right */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "1.05rem", fontWeight: 800, color: C.white, letterSpacing: "-0.01em" }}>{r.ticker}</span>
                  <span style={{ fontSize: "0.62rem", fontWeight: 800, color: C.gold, whiteSpace: "nowrap" }}>{r.pattern}</span>
                  {legs > 1 && <span title={`${legs} legs in this campaign`} style={legsChip}>{legs} legs</span>}
                  <span title={eff.label} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 26, height: 22, padding: "0 8px", borderRadius: 7, fontWeight: 800, fontSize: "0.72rem", color: "#08080e", background: `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})`, flexShrink: 0 }}>{gb.l}</span>
                </div>
                {/* status badges + date */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {inModelBook(r) && <span title="Starred from a 📚 Study" style={{ fontSize: "0.56rem", fontWeight: 800, color: C.goldBright, border: `1px solid ${C.borderGold}`, padding: "2px 8px", borderRadius: 99 }}>📚 study</span>}
                  {!r.is_published && !isStudyRow(r) && <span style={{ fontSize: "0.56rem", fontWeight: 800, color: isAdmin ? C.muted : "#8ab4f8", border: `1px solid ${isAdmin ? C.border : "rgba(138,180,248,0.35)"}`, padding: "2px 8px", borderRadius: 99 }}>{isAdmin ? "DRAFT" : "🔒 PERSONAL"}</span>}
                  {r.is_published && <span title="Curated by the VIV team" style={{ fontSize: "0.56rem", fontWeight: 800, color: C.goldBright, background: C.goldDim, border: `1px solid ${C.borderGold}`, padding: "2px 8px", borderRadius: 99 }}>⭐ VIV</span>}
                  {dr && <span style={{ marginLeft: "auto", fontSize: "0.62rem", color: C.muted, whiteSpace: "nowrap" }}>{dr}</span>}
                </div>
                {/* row 2 — the loud hero outcome line */}
                <div style={{ fontSize: "1.05rem", fontWeight: 800, color: heroColor, marginTop: 11, letterSpacing: "-0.01em" }}>{heroText}</div>
                {/* row 3 — his own one-line hook */}
                {hook && <div style={{ fontSize: "0.7rem", color: C.muted, lineHeight: 1.45, marginTop: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{hook}</div>}
              </div>
            </div>
          );
        };
        // Project-book card (Change 5): BOTH charts side by side (before = "vs QQQ", after = "daily"), ticker +
        // date, and up to 3 stat chips off metrics.study.m (sessions_vs_index / ret_3m / theme) — shown only when set.
        const renderProjectCard = ({ r, legs }) => {
          const m = r.metrics?.study?.m || {};
          const chips = [];
          if (m.sessions_vs_index != null && m.sessions_vs_index !== "") chips.push(`${m.sessions_vs_index} sess vs index`);
          if (m.ret_3m != null && m.ret_3m !== "") chips.push(`${+m.ret_3m > 0 ? "+" : ""}${m.ret_3m}% 3M`);
          if (m.theme) chips.push(String(m.theme));
          const pane = (img, label, divider) => (
            <div style={{ position: "relative", flex: 1, minWidth: 0, height: 120, background: "#0d0d16", borderRight: divider ? `1px solid ${C.border}` : "none" }}>
              {img
                ? <img src={img} alt={label} style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }} />
                : <div style={{ width: "100%", height: 120, display: "grid", placeItems: "center", color: C.muted, fontSize: "0.6rem" }}>—</div>}
              <span style={{ position: "absolute", left: 6, bottom: 5, fontSize: "0.52rem", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, background: "rgba(8,8,14,0.72)", borderRadius: 5, padding: "1px 6px" }}>{label}</span>
            </div>
          );
          return (
            <div key={r.id} onClick={() => setDetail(r)} style={{ position: "relative", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", cursor: "pointer", transition: "transform .15s ease, border-color .15s ease" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = C.borderGold; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = C.border; }}>
              <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
                {pane(r.before_img, "vs QQQ", true)}
                {pane(r.after_img, "daily", false)}
              </div>
              <div style={{ padding: "12px 14px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "1rem", fontWeight: 800, color: C.white }}>{r.ticker}</span>
                  {legs > 1 && <span title={`${legs} legs in this campaign`} style={legsChip}>{legs} legs</span>}
                  <span style={{ marginLeft: "auto", fontSize: "0.62rem", color: C.muted, whiteSpace: "nowrap" }}>{r.entry_date || "—"}</span>
                </div>
                {chips.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 9 }}>
                    {chips.map((c, i) => <span key={i} style={{ fontSize: "0.6rem", fontWeight: 700, color: C.goldBright, border: `1px solid ${C.borderGold}`, background: C.goldDim, borderRadius: 99, padding: "2px 9px", whiteSpace: "nowrap" }}>{c}</span>)}
                  </div>
                )}
              </div>
            </div>
          );
        };
        if (isProjectBook) return (
          <div style={{ marginTop: 4 }}>
            {bookYearGroups.map(([year, items]) => (
              <div key={year} style={{ marginBottom: 26 }}>
                <div style={{ fontSize: "0.66rem", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: C.goldBright, margin: "0 0 12px", paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>{year} · {items.length} {items.length === 1 ? "ticker" : "tickers"}</div>
                <div style={gridStyle}>{items.map(renderProjectCard)}</div>
              </div>
            ))}
          </div>
        );
        return <div style={gridStyle}>{galleryCards.map(renderCard)}</div>;
      })()}

      {/* detail overlay */}
      {detail && (() => {
        const r = detail, eff = effectiveStars(cardStars(r), (r.elite || []).length);
        return (
          <div onClick={e => { if (e.target === e.currentTarget) setDetail(null); }} style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(4,4,8,0.72)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px 16px", overflowY: "auto" }}>
            <div style={{ width: "min(1280px,96%)", background: "linear-gradient(180deg, rgba(18,18,26,0.95), rgba(8,8,14,0.98))", border: `1px solid ${C.borderGold}`, borderRadius: 20, padding: "22px 26px", boxShadow: "0 40px 100px rgba(0,0,0,0.72)" }}>
              {/* Rail scrollbar: thin, gold-tinted, with an 8px gutter so the thumb never sits ON the
                  card content (Valen 2026-07-27: "the scroll shouldn't overlap the card"). */}
              <style dangerouslySetInnerHTML={{ __html: ".mbdt-grid{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:24px;align-items:start}.mbdt-rail{position:sticky;top:0;max-height:calc(100vh - 96px);overflow-y:auto;padding-right:8px;scrollbar-width:thin;scrollbar-color:rgba(201,152,42,0.35) transparent}.mbdt-rail::-webkit-scrollbar{width:6px}.mbdt-rail::-webkit-scrollbar-thumb{background:rgba(201,152,42,0.3);border-radius:3px}.mbdt-rail::-webkit-scrollbar-track{background:transparent}@media (max-width:760px){.mbdt-grid{grid-template-columns:1fr}.mbdt-rail{position:static;max-height:none;overflow:visible;order:-1;padding-right:0}}" }} />
              {/* header — full width above the two columns */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: "1.4rem", fontWeight: 800, color: C.white }}>{r.ticker}</span>
                <span style={{ fontSize: "0.66rem", fontWeight: 800, color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, padding: "3px 11px", borderRadius: 99 }}>{r.pattern}</span>
                {r.theme && <span style={{ fontSize: "0.7rem", color: C.muted }}>{r.theme}</span>}
                <span style={{ marginLeft: "auto" }}><Stars C={C} n={eff.n} /></span>
                <span style={{ fontSize: "0.82rem", fontWeight: 800, color: eff.n >= 6 ? "#7ef0a0" : C.goldBright }}>{eff.label}</span>
                <button onClick={() => setDetail(null)} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.muted, width: 34, height: 34, borderRadius: 10, fontSize: "1.2rem", cursor: "pointer", lineHeight: 1 }} aria-label="Close">&times;</button>
              </div>
              <div style={{ fontSize: "0.74rem", color: C.muted, marginBottom: 16 }}>
                {r.entry_date || "—"} → {r.exit_date || "—"}{r.days_held != null ? ` · ${r.days_held}d` : ""}
              </div>

              {(() => {
                // ── shared computations for both columns ──
                const gb = gradeBadge(eff.n);
                const heroVal = r.run_pct != null ? `${r.run_pct > 0 ? "+" : ""}${r.run_pct}%` : (r.run_up_pct != null ? `+${r.run_up_pct}%` : null);
                const heroLabel = r.run_pct != null ? "Captured" : (r.run_up_pct != null ? "Peak run-up" : null);
                const oc = r.outcome || outcomeFromR(r.r_mult, r.run_pct);
                const win = oc ? /winner/i.test(oc) : null;
                const loss = oc ? /(loser|subpar)/i.test(oc) : null;
                const oColor = win ? "#7ef0a0" : loss ? C.red : C.muted;
                const oGlyph = win ? "▲" : loss ? "▼" : "—";
                // cap / ADR quiet stat (study-promoted rows only; plain rows show —)
                const sm = r.metrics?.study?.m;
                let capAdr = "—", capTip = "";
                if (sm) {
                  const cap = +(sm.mcap_t || 0), adr = sm.adr20, parts = [];
                  if (cap > 0) parts.push("≈" + (cap >= 1e9 ? "$" + (cap / 1e9).toFixed(1) + "B" : "$" + Math.round(cap / 1e6) + "M"));
                  if (adr != null && adr !== "" && !Number.isNaN(+adr)) parts.push("ADR " + (+adr).toFixed(1) + "%");
                  if (parts.length) { capAdr = parts.join(" · "); capTip = `At the trigger date — cap from SEC shares outstanding (${sm.mcap_asof || "n/a"}), ADR20 from the 20 sessions before the trigger.`; }
                }
                const quiet = [
                  ["R multiple", r.r_mult != null ? `${r.r_mult}R` : "—", "Reward vs the initial stop"],
                  ["Days held", r.days_held != null ? `${r.days_held}d` : "—", "Entry → first daily close below EMA9 (the trail exit)"],
                  ["Theme", r.theme || "—", ""],
                  ["Cap / ADR", capAdr, capTip],
                ];
                const sections = sectionizeCharts(buildChartList(r, isStudyRow(r)));

                // checklist block (unchanged logic — every factor, ticked & unticked, read-only)
                const checklistBlock = (() => {
                  const bucketStyle = { border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", background: "rgba(255,255,255,0.015)", minWidth: 0, marginBottom: 8 };
                  const bucketTitle = { fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginBottom: 7 };
                  const rowStyle = { display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 2px" };
                  const mark = (on) => ({ color: on ? C.goldBright : "rgba(255,255,255,0.35)", opacity: on ? 1 : 0.5, fontWeight: 800, lineHeight: 1.3, flexShrink: 0 });
                  const labelStyle = (on) => ({ fontSize: "0.74rem", fontWeight: 600, color: on ? C.goldBright : C.text, lineHeight: 1.35 });
                  const bonusTag = <span style={{ fontSize: "0.5rem", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: C.goldBright, border: `1px solid ${C.goldBright}`, padding: "0 5px", borderRadius: 99, marginLeft: 5 }}>Bonus</span>;
                  if (isStudyRow(r)) {
                    const study = r.metrics.study;
                    const def = STUDY_SETUPS[study.setup] || STUDY_SETUPS["Momentum Breakout"];
                    const q = studyQuality(study);
                    return (<>
                      <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, marginBottom: 8 }}>👁 Checklist — {q.on}/{q.total}</div>
                      {def.buckets.map((b, bi) => (
                        <div key={bi} style={bucketStyle}>
                          <div style={bucketTitle}>{b.title}</div>
                          {b.items.map(([k, itemLabel, bonus]) => {
                            const on = !!study.checks?.[k];
                            const sc = SUBCATS[k];
                            const subRaw = sc && study.checks?.[sc.store];
                            const subVal = subRaw != null && subRaw !== "" ? (sc.options.find(([o]) => o === String(subRaw)) || [, String(subRaw)])[1] : null;
                            return (
                              <div key={k} style={rowStyle}>
                                <span style={mark(on)}>{on ? "✓" : "○"}</span>
                                <span style={labelStyle(on)}>{itemLabel}{subVal && <b style={{ color: C.goldBright, marginLeft: 5 }}>{subVal}</b>}{bonus && bonusTag}</span>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </>);
                  }
                  const graded = starsFromTicked(r.ticked, isAdmin ? undefined : { makerGate: false });
                  const tset = new Set(r.ticked || []);
                  const secs = sectionsFor(r.ticked).filter(sec => !sec.reminder);
                  return (<>
                    <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, marginBottom: 8 }}>Setup checklist — {graded.passed}/{graded.total}</div>
                    {secs.map((sec, si) => (
                      <div key={si} style={bucketStyle}>
                        <div style={bucketTitle}>{sec.title}</div>
                        {sec.items.map((it, ii) => {
                          const on = tset.has(si + "-" + ii);
                          return (
                            <div key={ii} style={rowStyle}>
                              <span style={mark(on)}>{on ? "✓" : "○"}</span>
                              <span style={labelStyle(on)}>{it.c}{it.bonus && bonusTag}</span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </>);
                })();

                return (
                  <div className="mbdt-grid">
                    {/* ── LEFT: the story — sectionized charts → ⑤ the lesson → elite factors ── */}
                    <div style={{ minWidth: 0, position: "relative" }}>
                      {sections.length === 0 ? (
                        <div style={{ height: 180, display: "grid", placeItems: "center", color: C.muted, fontSize: "0.76rem", border: `1px dashed ${C.border}`, borderRadius: 12 }}>Charts pending — they'll appear here as this setup is documented.</div>
                      ) : (
                        <div style={{ display: "grid", gap: 20 }}>
                          {sections.map((sec, si) => (
                            <div key={si} style={{ minWidth: 0 }}>
                              <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, marginBottom: 9 }}>{sec.title}</div>
                              <div style={{ display: "grid", gap: 16 }}>
                                {sec.charts.map((c, ci) => {
                                  const label = c.label || sec.title;
                                  return (
                                    <div key={ci} style={{ minWidth: 0 }}>
                                      <img src={c.img} alt={label} onClick={() => setZoom({ imgs: { before: c.img, after: "" }, slot: "before", title: label })} style={{ display: "block", width: "100%", maxWidth: "100%", borderRadius: 12, border: `1px solid ${C.borderGold}`, cursor: "zoom-in" }} />
                                      {c.caption && <div style={{ fontSize: "0.78rem", color: C.muted, lineHeight: 1.55, marginTop: 7, maxWidth: "66ch" }}>{c.caption}</div>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {r.lesson && (
                        <div style={{ marginTop: 22 }}>
                          <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, marginBottom: 9 }}>⑤ The lesson</div>
                          <div style={{ fontSize: "0.82rem", color: "#e8e8ec", lineHeight: 1.6, maxWidth: "66ch", whiteSpace: "pre-wrap" }}>{r.lesson}</div>
                        </div>
                      )}
                      {(r.elite || []).length > 0 && (
                        <div style={{ marginTop: 22 }}>
                          <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7ef0a0", marginBottom: 9 }}>Elite factors present ({(r.elite || []).length}/{ELITE.length})</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px,100%), 1fr))", gap: 6 }}>
                            {ELITE.filter(f => (r.elite || []).includes(f.k)).map(f => (
                              <div key={f.k} style={{ display: "flex", gap: 9, padding: "8px 11px", borderRadius: 10, background: "rgba(126,240,160,0.06)", border: "1px solid rgba(126,240,160,0.25)" }}>
                                <span style={{ color: "#7ef0a0", fontWeight: 800 }}>✓</span>
                                <div><div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#c9f5d7" }}>{f.c}</div><div style={{ fontSize: "0.7rem", color: C.muted }}>{f.s}</div></div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── RIGHT: sticky verdict rail ── */}
                    <div className="mbdt-rail">
                      {/* (1) HERO stat — the single loudest element */}
                      <div style={{ border: `1px solid ${C.borderGold}`, borderRadius: 14, padding: "16px 18px", background: C.glass, marginBottom: 12 }}>
                        {heroVal ? (
                          <>
                            <div title={capTip || undefined} style={{ fontSize: "1.7rem", fontWeight: 800, color: "#f0c050", letterSpacing: "-0.02em", lineHeight: 1.05 }}>{heroVal}</div>
                            <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, marginTop: 3 }}>{heroLabel}</div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: "1.7rem", fontWeight: 800, color: "#f0c050", lineHeight: 1.05 }}>{gb.l}</div>
                            <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, marginTop: 3 }}>Grade · no outcome yet</div>
                          </>
                        )}
                        {/* (2) verdict row — outcome chip WITH glyph + grade chip (near-black on gold) */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.68rem", fontWeight: 800, color: oColor, border: `1px solid ${oColor}`, borderRadius: 99, padding: "3px 11px", whiteSpace: "nowrap" }}>{oGlyph} {oc || "Pending"}</span>
                          <span title={eff.label} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 26, height: 22, padding: "0 9px", borderRadius: 7, fontWeight: 800, fontSize: "0.72rem", color: "#08080e", background: `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})` }}>{gb.l}</span>
                        </div>
                      </div>

                      {/* (3) quiet secondary stats — simple label:value rows */}
                      <div style={{ display: "grid", gap: 2, marginBottom: 14 }}>
                        {quiet.map(([k, v, tip]) => (
                          <div key={k} title={tip || undefined} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontSize: "0.72rem", color: C.muted, whiteSpace: "nowrap" }}>{k}</span>
                            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: (v == null || v === "—") ? C.muted : "#e8e8ec", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</span>
                          </div>
                        ))}
                      </div>

                      {/* (4) full ✓/○ checklist */}
                      <div style={{ marginBottom: 14 }}>{checklistBlock}</div>

                      {/* measured traits */}
                      {(r.characteristics || []).length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 7 }}>Measured traits</div>
                          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                            {(r.characteristics || []).map((c, i) => <span key={i} style={{ fontSize: "0.7rem", fontWeight: 700, color: C.text, background: C.goldDim, border: `1px solid ${C.borderGold}`, padding: "4px 10px", borderRadius: 99 }}>{c}</span>)}
                          </div>
                        </div>
                      )}

                      {/* (5) thesis block */}
                      {r.thesis && (
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, marginBottom: 6 }}>The thesis</div>
                          <div style={{ fontSize: "0.82rem", color: C.text, lineHeight: 1.6, maxWidth: "66ch", whiteSpace: "pre-wrap" }}>{r.thesis}</div>
                        </div>
                      )}

                      {/* (6) admin-gated hypothesis read — unchanged */}
                      {isStudyRow(r) && isAdmin && <HypothesisRead C={C} study={r.metrics.study} ticker={r.ticker} date={r.entry_date} />}
                    </div>
                  </div>
                );
              })()}

              {(isAdmin || (r.created_by === uid && !r.is_published)) && (
                <div style={{ display: "flex", gap: 10, borderTop: `1px solid ${C.border}`, paddingTop: 14, marginTop: 18 }}>
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
              {zoom.title ? zoom.title : (isBefore ? "◀ Before — the setup" : "After — the outcome ▶")}
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
