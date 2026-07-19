import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { loadActiveGrades, getGrade, saveGrade, archiveGrade, letterFor, useGrades } from "./grades.js";
import { supabase } from "./supabaseClient";
import { publishSetup } from "./dailySetups.js";
import { renderShareCard, copyCard } from "./shareCard.js";
import { sectorFor } from "./sectors.js";
import { themeFit } from "./themes.js";

// ══════════════════════════════════════════════════════════════════
// SETUP GRADER — Premium Tools sub-tab. 5-star A+ breakout/continuation
// grader. Tick what's true → per-section pass counts + an overall ★ score.
// ★-maker = confluence factor: the 5th star (A+) only unlocks when they stack.
// Member-facing: no mentor/vendor brand names — VIV's own method.
// ══════════════════════════════════════════════════════════════════

// ── LEGACY (v1) checklist — FROZEN verbatim. Saved grades made before CHECKLIST_VERSION 2
// (no version marker in their `ticked`) are still rendered/scored against THIS list so history
// never silently re-scores. Do not edit — new work happens on SECTIONS (v2) below.
export const LEGACY_SECTIONS = [
  {
    title: "Leadership / Stock Selection",
    items: [
      { c: "Relative strength — top-tier", star: true,
        s: "The stock is beating the market. Confirm it with an IBD RS Score (90+ is strong) or its price % change vs SPY/QQQ over 1/3/6 months — and its moving averages are rising faster (steeper) than the index's. Leaders go up more, and fall less, than the market." },
      { c: "ADR% > 4%",
        s: "Average Daily Range (20-day) above 4%. Moves enough that a few good days pay multiple R — 47% of a year's top-100 winners run ADR > 5%." },
      { c: "In-theme leader", star: true,
        s: "It sits in a sector or group that's currently leading the market — money is actively rotating into its theme, not out of it." },
      { c: "Liquid enough — ≥ $50M / 20 days",
        s: "At least $50M average dollar volume over the last 20 days (dollar volume = price × shares traded). You can size in and out without moving the stock." },
      { c: "Above rising 10 & 20-day MA",
        s: "Price is above both the 10- and 20-day moving averages, and both are sloping up — the trend is clearly intact." },
    ],
  },
  {
    title: "Prior Move",
    items: [
      { c: "Big prior thrust", star: true,
        s: "A strong advance of 30–100%+ in the past 1–3 months — proof there's real institutional demand behind the stock, not a quiet drift." },
      { c: "Sharp, high-volume advance",
        s: "Watch the volume signature — the rally came on expanding, above-average volume, ideally a clean 30–45° angle climb: steady and powerful, not a vertical/climactic spike." },
      { c: "Fresh, not extended", star: true,
        s: "Two quick checks: ① extension ≤ 4× ATR from the 50-day MA — ((price − 50MA) ÷ price) ÷ ATR% — and ② a 1st or 2nd base, not a late-stage 3rd/4th. Under 4× = launchpad. Over = you're buying someone's exit." },
    ],
  },
  {
    title: "Base Quality",
    items: [
      { c: "Higher lows",
        s: "A rising base — buyers are stepping in earlier on each dip." },
      { c: "Tightening range (contraction)",
        s: "Volatility compresses toward a tight apex as the base matures." },
      { c: "Volume drying up into the apex", star: true,
        s: "Volume fades to nothing through the base — the clearest sign sellers are exhausted and supply is gone." },
      { c: "Inside bars / tight days at the pivot", star: true,
        s: "A cluster of narrow-range or inside days right before the breakout — the coil before the release." },
      { c: "Surfing the rising 10/20 (or 9/21 EMA)",
        s: "Price hugs the rising fast moving averages and never breaks down through them." },
      { c: "EMAs 9 / 21 / 50 converging", star: true,
        s: "The fast moving averages pinch together under price — a coiled spring, energy building for the move." },
      { c: "Orderly — no wild wicks / gaps against",
        s: "Calm, controlled digestion; no panic bars or gaps the wrong way." },
      { c: "Duration 2 weeks – 2 months",
        s: "Long enough to reset the prior move, not so long the base goes stale." },
    ],
  },
  {
    title: "Trigger & Stop",
    reminder: true,
    note: "Live-market checklist — run these at your entry. The grade above is decided pre-market; this is execution, so it's a reminder, not part of the star score.",
    items: [
      { c: "Range-expansion breakout on volume",
        s: "Judge volume by PACE, not totals: volume so far vs normal for this time of day. 40%+ of a full day inside the first 30 min = real demand. No pace = no trade — breakouts without volume are the ones that fade." },
      { c: "Opening-range confirmation",
        s: "Enter on the break of the opening range high (1-, 5-, or 60-minute depending on when it fires) — you let it prove itself, you don't guess ahead of the move." },
      { c: "Entry near the pivot, not extended",
        s: "You're buying right at the breakout pivot, not chasing 5–10% above it. A close entry keeps the stop tight and the reward-to-risk high." },
      { c: "Tight stop — under 1 ADR (ideally < ½)", key: true,
        s: "(entry − stop) ÷ ATR < 0.5. Then size from the math, before the order: shares = risk $ ÷ (entry − stop). Tight stop = explosive R:R; a stop a full ADR away means the day's fuel is already spent." },
      { c: "Tight candle at trigger — DCR ≤ ½ ATR", key: true,
        s: "Daily Candle Range (today's high − low) ÷ ATR(14). Under 50% means you're entering while the range is still coiled, not after it already expanded — the candle-level version of a tight stop. A wide range at trigger = the day's fuel is half-spent before you're even in." },
      { c: "Invalidation defined before entry",
        s: "Know your exact 'I'm wrong' price BEFORE you buy. Pro upgrade: three stops of ⅓ each at ⅓ / ⅔ / full distance — a straight-line failure costs ~0.67R instead of 1R, without moving the level." },
      { c: "Not the first 30 minutes (unless volume is extreme)",
        s: "The first 30 min is auction noise that hunts tight stops. If the setup is real, it's still valid at 10:00. Exception: truly extreme volume." },
      { c: "Clear calendar & clean session — no events, max 3 new positions",
        s: "No fresh entries before econ data or into earnings (≥5 days away). Max ~3 new positions per session — one bad day must never erase a good week." },
    ],
  },
];

// ── v2 checklist — Valen's STUDY checklist, mirrored VERBATIM from StudyBook.jsx
// STUDY_SETUPS["Momentum Breakout"].buckets (labels must match). 14 scored ticks + 2 BONUS
// (inside, ma_conv) that tick & save but are EXCLUDED from the score (same convention as
// StudyBook's studyQuality). `s` = hover help (no mentor names — VIV's own method).
export const SECTIONS = [
  {
    title: "Prior move / trend",
    items: [
      { c: "Prior pole — big move ≥30% into the base", star: true,
        s: "A big run-up first — strength before the rest, not a random pop." },
      { c: "Pole linear — clean advance, no whipsaw", star: true,
        s: "The advance was clean and controlled, not whipsaw." },
      { c: "Young trend — 1st–3rd breakout, not late/extended",
        s: "1st–3rd breakout of the trend — not the late, obvious one." },
    ],
  },
  {
    title: "Base quality",
    items: [
      { c: "Tightening series — ≥3 visibly narrow-range days pre-trigger", star: true,
        s: "Several small, quiet days in a row — the coil before the spring." },
      { c: "Volume drying up in the base (lower than usual)",
        s: "Volume fades inside the base — sellers running out." },
      { c: "Orderly base — no big red bars inside",
        s: "No ugly red bars inside the base." },
      { c: "Higher lows forming into the pivot", star: true,
        s: "Each dip holds higher than the last — buyers stepping up into the pivot." },
      { c: "Day before trigger = narrow-range or negative day", star: true,
        s: "A quiet or down day right before — nobody's chasing yet." },
      { c: "Inside bar(s) right before the trigger — coil tell", bonus: true,
        s: "The last bar(s) sit inside the prior bar's range — maximum coil." },
      { c: "SMA 10/20/50 converging at the pivot", bonus: true,
        s: "The 10/20/50-day MAs pinch together at the pivot — energy building." },
      { c: "Surfing rising 10/20/50-day MA into the pivot",
        s: "Riding a rising 10/20-day MA into the pivot." },
    ],
  },
  {
    title: "Trigger day",
    items: [
      { c: "Day-1 range expansion ≥4% — bar visibly bigger than last 5–10", star: true,
        s: "The breakout bar is visibly bigger than recent days — real range expansion." },
      { c: "≤2 up-days before the trigger (not buying day 3)",
        s: "Not already up 2 days in a row — buy the start of the swing, not day 3." },
      { c: "Closed ≥70% of the day's range", star: true,
        s: "Finishes near the top of its range — buyers held it into the close." },
      { c: "Volume expansion — trigger bar volume above prior day",
        s: "Breakout volume above the prior day — conviction behind the move." },
      { c: "Gapped up on the trigger day",
        s: "Opened above yesterday's close on trigger day." },
    ],
  },
  {
    title: "Trigger & Stop",
    reminder: true,
    note: "Live-market checklist — run these at your entry. The grade above is decided pre-market; this is execution, so it's a reminder, not part of the star score.",
    items: [
      { c: "Range-expansion breakout on volume",
        s: "Judge volume by PACE, not totals: volume so far vs normal for this time of day. 40%+ of a full day inside the first 30 min = real demand. No pace = no trade — breakouts without volume are the ones that fade." },
      { c: "Opening-range confirmation",
        s: "Enter on the break of the opening range high (1-, 5-, or 60-minute depending on when it fires) — you let it prove itself, you don't guess ahead of the move." },
      { c: "Entry near the pivot, not extended",
        s: "You're buying right at the breakout pivot, not chasing 5–10% above it. A close entry keeps the stop tight and the reward-to-risk high." },
      { c: "Tight stop — under 1 ADR (ideally < ½)", key: true,
        s: "(entry − stop) ÷ ATR < 0.5. Then size from the math, before the order: shares = risk $ ÷ (entry − stop). Tight stop = explosive R:R; a stop a full ADR away means the day's fuel is already spent." },
      { c: "Tight candle at trigger — DCR ≤ ½ ATR", key: true,
        s: "Daily Candle Range (today's high − low) ÷ ATR(14). Under 50% means you're entering while the range is still coiled, not after it already expanded — the candle-level version of a tight stop. A wide range at trigger = the day's fuel is half-spent before you're even in." },
      { c: "Invalidation defined before entry",
        s: "Know your exact 'I'm wrong' price BEFORE you buy. Pro upgrade: three stops of ⅓ each at ⅓ / ⅔ / full distance — a straight-line failure costs ~0.67R instead of 1R, without moving the level." },
      { c: "Not the first 30 minutes (unless volume is extreme)",
        s: "The first 30 min is auction noise that hunts tight stops. If the setup is real, it's still valid at 10:00. Exception: truly extreme volume." },
      { c: "Clear calendar & clean session — no events, max 3 new positions",
        s: "No fresh entries before econ data or into earnings (≥5 days away). Max ~3 new positions per session — one bad day must never erase a good week." },
    ],
  },
];

// Leadership / stock selection — NON-SCORED context strip (Valen 2026-07-17). Labels pulled
// verbatim from the v1 leadership block (now in LEGACY_SECTIONS). These are the top-down filters
// the member checks mentally with DeepVue open BEFORE the chart earns a grade — they are NOT
// tickable and NEVER enter pct/stars, so the scored denominator stays 14 (Study-Book-aligned).
export const LEADERSHIP_CONTEXT = {
  title: "Leadership / Stock Selection",
  note: "Check these top-down with DeepVue open before you grade the chart — a strong name in a strong group. Context only, not part of the star score.",
  items: [
    { c: "Relative strength — top-tier", s: "Beating the market — RS rank ~90+, or leading SPY/QQQ over 1/3/6 months." },
    { c: "In-theme leader", s: "Sits in a top-5 sector the market is actively rotating INTO." },
    { c: "Liquid enough — ≥ $50M / 20 days", s: "Enough dollar volume to size in and out cleanly." },
    { c: "ADR% > 4%", s: "Average daily range wide enough that a few good days pay multiple R." },
    { c: "Above rising 10 & 20-day MA", s: "Price over both, and both sloping up — trend intact." },
  ],
};

// ══ VERSION-AWARENESS ══════════════════════════════════════════════
// Saved grades persist their checklist version so history never silently re-scores under a
// new list. Chosen mechanism: a SENTINEL string appended to the `ticked` array — it rides the
// EXISTING save path unchanged (localStorage spreads the whole grade; Supabase's `ticked` text[]
// column round-trips it) with ZERO schema change and ZERO new write path. A `clv` column would
// have needed a migration + a best-effort second write that could 400 the whole upsert before
// the column exists; the sentinel avoids all of that. v1 rows (pre-2026-07) carry NO sentinel.
export const CHECKLIST_VERSION = 2;
export const V2_SENTINEL = "__v2";
// versionOf: sentinel present → 2 · real "si-ii" ticks but no sentinel → 1 (legacy) · empty → 2
// (nothing to mislabel, so new/blank authoring surfaces default to the current checklist).
export const versionOf = (ticked) => {
  const arr = Array.isArray(ticked) ? ticked : [];
  if (arr.includes(V2_SENTINEL)) return 2;
  return arr.some(k => /^\d+-\d+$/.test(k)) ? 1 : 2;
};
export const sectionsFor = (ticked) => versionOf(ticked) === 1 ? LEGACY_SECTIONS : SECTIONS;
// stampV2: strip any existing sentinel, keep only scored/bonus "si-ii" keys, append the marker once.
export const stampV2 = (ticked) => [...(ticked || []).filter(k => /^\d+-\d+$/.test(k)), V2_SENTINEL];

// Count scored (non-bonus) items + ★-makers for a given section list.
const tallyOf = (secs) => { let total = 0, sm = 0; secs.forEach(s => { if (s.reminder) return; s.items.forEach(i => { if (i.bonus) return; total++; if (i.star) sm++; }); }); return { total, sm }; };
const V2_TALLY = tallyOf(SECTIONS);
const V1_TALLY = tallyOf(LEGACY_SECTIONS);
export const LEGACY_STARMAKERS = V1_TALLY.sm; // old checklist ★-maker count (frozen alongside LEGACY_SECTIONS)
export const totalFor = (ticked) => (versionOf(ticked) === 1 ? V1_TALLY : V2_TALLY).total;
export const starmakersFor = (ticked) => (versionOf(ticked) === 1 ? V1_TALLY : V2_TALLY).sm;

// Version-aware scoring of a saved `ticked` array — picks the matching checklist + denominator,
// excludes bonus ticks from the score, and applies the SAME star/letter formula the live grader
// uses. Consumers that recompute a saved row (Model Book, scorecards) MUST use this so a legacy
// row is never scored against the v2 list.
export function scoreTicked(ticked, { makerGate = true } = {}) {
  // makerGate (default true) preserves the live grader / admin behavior EVERYWHERE. Pass
  // { makerGate: false } for the member Model Book editor, where all scored ticks weigh
  // equally and the 5th star is pure tick-proportion (no ★-maker confluence requirement).
  const secs = sectionsFor(ticked);
  const t = new Set(ticked || []);
  let passed = 0, starHit = 0, total = 0, sm = 0;
  secs.forEach((sec, si) => {
    if (sec.reminder) return;
    sec.items.forEach((it, ii) => {
      if (it.bonus) return;               // bonus ticks save + show but never grade
      total++; if (it.star) sm++;
      if (t.has(si + "-" + ii)) { passed++; if (it.star) starHit++; }
    });
  });
  const pct = total ? passed / total : 0;
  let stars = Math.round(pct * 5);
  if (makerGate && stars >= 5 && starHit < sm) stars = 4; // A+ requires full ★-maker confluence (admin/live grader only)
  if (passed === 0) stars = 0;
  return { passed, total, starHit, starmakers: sm, pct, stars, letter: letterFor(stars) };
}

const CHECK = (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: 13, height: 13 }}>
    <path d="M20 6L9 17l-5-5" stroke="#08080e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// v2 ★-makers = the 7 structure-critical ticks (pole, linear, tight, higher_lows, prior_nr, re,
// closehi) flagged `star:true` above. Provisional structure-core; re-tune when the Study Book lift
// table reaches n≥50 (pre-registration rule). Bonus ticks (inside, ma_conv) are never scored.
let TOTAL = 0, STARMAKERS = 0;
SECTIONS.forEach(s => { if (s.reminder) return; s.items.forEach(i => { if (i.bonus) return; TOTAL++; if (i.star) STARMAKERS++; }); });

const GRADES = {
  5: ["A+ · Table-pounder", "Everything agrees — full size, this is the trade."],
  4: ["A · Strong", "Excellent setup with minor gaps — size up with confidence."],
  3: ["B · Tradeable", "Decent but flawed — trade smaller or wait for it to tighten."],
  2: ["C · Marginal", "Too much missing — usually a pass."],
  1: ["C · Not a setup", "Wait for a real base to form."],
  0: ["—", "Tick what's true to grade the setup."],
};

const letterColor = (C, l) => l === "A+" ? C.green : l === "A" ? C.goldBright : l === "B" ? C.muted : (l === "—" ? C.muted : C.red);
// Device-LOCAL calendar date (Valen = MYT). toISOString() alone is UTC and stamps
// yesterday before 8am MYT — wrong feed grouping + wrong theme snapshot.
const localISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const MiniStars = ({ C, n, size = 0.72 }) => (
  <span style={{ letterSpacing: 1, fontSize: `${size}rem`, whiteSpace: "nowrap" }}>
    {[0, 1, 2, 3, 4].map(k => <span key={k} style={{ color: k < n ? C.goldBright : "rgba(255,255,255,0.16)" }}>★</span>)}
  </span>
);

export default function SetupGraderTab({ C, font, guideEnter, guideLeave, gactive, expert, positions = [], session, isAdmin }) {
  useGrades(); // re-render when a grade is saved/removed
  const uid = session?.user?.id || null;
  const [on, setOn] = useState(() => new Set());
  const [auto, setAuto] = useState(() => new Set()); // gold-dot: ticks auto-read by VIV, pending a human eye
  const [ticker, setTicker] = useState("");
  const [showSync, setShowSync] = useState(false);
  const [flash, setFlash] = useState("");
  const [chartImg, setChartImg] = useState(""); // chart for the daily post / share card
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(() => new Set()); // bulk-selected watchlist symbols
  const [rowSync, setRowSync] = useState(null); // { sym, x, y } — watchlist row whose "attach to position" menu is open (portaled: the table's overflow container would clip an absolute menu)
  const [openSym, setOpenSym] = useState(""); // watchlist row expanded inline via its Open button
  const [editOn, setEditOn] = useState(() => new Set());   // inline editor: ticked criteria for the open row
  const [editAuto, setEditAuto] = useState(() => new Set()); // inline editor: surviving auto-read dots
  const [rowMsg, setRowMsg] = useState("");                 // inline editor feedback (shows next to Save)
  const openRow = (g) => { setOpenSym(g.sym); setEditOn(new Set(g.ticked || [])); setEditAuto(new Set(g.auto || [])); setRowMsg(""); };
  const editToggle = (key) => {
    setEditAuto(prev => { if (!prev.has(key)) return prev; const n = new Set(prev); n.delete(key); return n; }); // human touch clears the dot
    setEditOn(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    setRowMsg("");
  };
  const loadSeq = useRef(""); // last loadTicker target — guards async prefill against ticker switches
  const [editDate, setEditDate] = useState(null); // set when editing an existing post — republish keeps its date
  const [legacyLoaded, setLegacyLoaded] = useState(null); // saved grade made on the PREVIOUS checklist — show its frozen score + a re-grade notice, start v2 unticked
  // Apply a saved/loaded grade to the live editor. v2 grades restore their ticks; a LEGACY (v1)
  // grade must NOT map its old ticks onto the new items (meanings differ) — start the v2 checklist
  // unticked and surface the frozen score via the notice instead.
  const applyLoadedTicks = (tickedArr, autoArr) => {
    if (versionOf(tickedArr) === 1) { setOn(new Set()); setAuto(new Set()); }
    else { setOn(new Set(tickedArr || [])); setAuto(new Set(autoArr || [])); }
  };

  // ✎ Edit from the Daily Setups feed → the full post loads here; republish REPLACES it (same ticker+date)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("viv-ds-edit");
      if (!raw) return;
      sessionStorage.removeItem("viv-ds-edit"); // consume once — never re-trigger on later visits
      const e = JSON.parse(raw);
      if (!e || !e.ticker) return;
      loadSeq.current = e.ticker; // block any in-flight prefill from overwriting this payload
      setTicker(e.ticker);
      applyLoadedTicks(e.ticked, e.auto);
      setLegacyLoaded(versionOf(e.ticked) === 1 ? { ...e, ...scoreTicked(e.ticked) } : null);
      setNote(e.note || "");
      setChartImg(e.chart_img || "");
      setEditDate(e.trade_date || null);
      flashMsg(`Editing the ${e.ticker} post (${e.trade_date}) — Publish replaces it`);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggle = (key) => {
    // any human touch clears the gold dot — same convention as the Model Book
    setAuto(prev => { if (!prev.has(key)) return prev; const n = new Set(prev); n.delete(key); return n; });
    setOn(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  };
  const reset = () => { setOn(new Set()); setAuto(new Set()); setLegacyLoaded(null); };

  let passed = 0, starHit = 0;
  const secCounts = SECTIONS.map((sec, si) => {
    let sc = 0;
    sec.items.forEach((it, ii) => {
      if (on.has(si + "-" + ii)) { sc++; if (!sec.reminder && !it.bonus) { passed++; if (it.star) starHit++; } } // bonus ticks count toward the bucket tally but never the score
    });
    return sc;
  });

  const pct = passed / TOTAL;
  let stars = Math.round(pct * 5);
  if (stars >= 5 && starHit < STARMAKERS) stars = 4; // A+ requires full confluence
  if (passed === 0) stars = 0;
  const [gLabel, gDesc] = GRADES[stars];
  const letter = letterFor(stars);

  // ── grade object + persistence ──
  const autoLive = [...auto].filter(k => on.has(k)); // dots only count while their tick is still on
  // chart_img persists with the grade so reopening a saved grade shows its chart again (JH bug
  // 2026-07-14). Only real storage URLs are kept — the data-URL fallback (storage unreachable)
  // would bloat localStorage past its quota and can't be shared across devices anyway.
  const grade = { stars, pct, passed, total: TOTAL, starHit, starmakers: STARMAKERS, letter, label: gLabel, ticked: stampV2([...on]), auto: autoLive,
    chart_img: /^https?:/.test(chartImg) ? chartImg : "", note: note.trim() };
  const posSyms = Array.from(new Set((positions || []).map(p => String(p.sym || p.symbol || "").toUpperCase().trim()).filter(Boolean)));
  const posSet = new Set(posSyms);
  const saved = loadActiveGrades();
  const savedRows = Object.values(saved).sort((a, b) => (b.stars - a.stars) || (a.sym < b.sym ? -1 : 1));

  const flashMsg = (m) => { setFlash(m); setTimeout(() => setFlash(""), 3400); };
  // ── Clear the watchlist in bulk — reuses the SAME per-row × path (archiveGrade): the row leaves
  // this list but the saved grade is KEPT everywhere it's read (Open Positions' Grade column, Model
  // Book, published Daily Setups). Selection-aware: ticked rows → "Clear selected", else all rows.
  // Confirm-gated (matches the row × copy). Stops and reports on the first failure — rest left intact.
  const clearWatchlist = () => {
    const syms = (sel.size > 0 ? savedRows.filter(g => sel.has(g.sym)) : savedRows).map(g => g.sym);
    const n = syms.length;
    if (!n) return;
    const scoped = sel.size > 0;
    if (!window.confirm(`Remove ${n} ${scoped ? "selected " : ""}ticker${n === 1 ? "" : "s"} from the screening watchlist?\n\nThe saved grade${n === 1 ? " is" : "s are"} KEPT everywhere ${n === 1 ? "it's" : "they're"} used — Open Positions' Grade column, the Model Book, and any published Daily Setups. This only clears ${n === 1 ? "it" : "them"} from this list; grade a name again anytime to bring it back.`)) return;
    let done = 0;
    try { for (const s of syms) { archiveGrade(s); done++; } }
    catch (e) { setSel(new Set()); setOpenSym(""); flashMsg(`Stopped after ${done} of ${n} — ${e?.message || "error"}. The rest were left intact.`); return; }
    setSel(new Set());
    setOpenSym("");
    flashMsg(`Cleared ${done} ✓`);
  };
  const loadTicker = (sym) => {
    const g = getGrade(sym);
    setTicker(sym); applyLoadedTicks(g && g.ticked, g && g.auto);
    setLegacyLoaded(g && versionOf(g.ticked) === 1 ? { ...g, ...scoreTicked(g.ticked) } : null);
    // the saved grade's own chart + annotation come back with it (JH bug 2026-07-14);
    // the daily_setups prefill below only fills whatever is still blank.
    setChartImg(g?.chart_img || ""); setNote(g?.note || ""); setEditDate(null); // switching tickers leaves post-edit mode
    loadSeq.current = sym; // stamp: only the LATEST loadTicker may prefill (kills the cross-ticker race)
    // If I already have a post for this ticker (e.g. published via "pull my daily ideas"),
    // pull its chart + annotation back into the kit so republish/share-card keeps them.
    if (uid) {
      supabase.from("daily_setups").select("chart_img,note,created_by")
        .eq("ticker", sym).eq("created_by", uid)
        .order("trade_date", { ascending: false }).order("created_at", { ascending: false }).limit(1)
        .then(({ data }) => {
          if (loadSeq.current !== sym) return; // user moved to another ticker while this was in flight
          const row = data && data[0];
          if (!row) return;
          setChartImg(c => c || row.chart_img || "");
          setNote(n => n || row.note || "");
        });
    }
  };
  const startTicker = () => { const s = ticker.toUpperCase().trim(); if (!s) return; loadTicker(s); };
  // Admin: mirror the current scorecard straight onto the published Daily Setups post (if one
  // exists for this ticker) so a grade edit shows to members IMMEDIATELY on Save — no republish.
  const syncPostScore = async (s) => {
    if (!isAdmin || !uid) return false;
    try {
      let q = supabase.from("daily_setups").select("id").eq("created_by", uid).eq("ticker", s);
      q = editDate
        ? q.eq("trade_date", editDate)
        : q.order("trade_date", { ascending: false }).order("created_at", { ascending: false }).limit(1);
      const { data } = await q;
      const row = data && data[0];
      if (!row) return false;
      const patch = { stars, letter, pct, star_hit: starHit, starmakers: STARMAKERS, ticked: stampV2([...on]), auto: autoLive };
      if (note.trim()) patch.note = note.trim();       // never blank an existing note/chart
      if (chartImg) patch.chart_img = chartImg;         // with an empty kit
      const { error } = await supabase.from("daily_setups").update(patch).eq("id", row.id);
      return !error;
    } catch { return false; }
  };

  const doSave = async (symArg) => {
    const s = (symArg || ticker || "").toUpperCase().trim();
    if (!s) { flashMsg("Enter a ticker first ↑"); return; }
    if (passed === 0) { flashMsg("Tick some criteria first"); return; }
    saveGrade(s, grade); setTicker(s); setLegacyLoaded(null); // this is now a fresh v2 grade
    const postSynced = await syncPostScore(s);
    flashMsg(postSynced
      ? `Saved ${s} — the live Daily Setups post updated instantly`
      : posSet.has(s) ? `Saved ${s} — synced to its Open Position row` : `Saved grade for ${s}`);
  };
  const syncTo = (sym) => {
    if (passed === 0) { flashMsg("Tick some criteria first, then sync"); return; }
    saveGrade(sym, grade); setTicker(sym); setShowSync(false);
    flashMsg(`Synced to ${sym} — shows on its Open Positions row & is kept if it closes`);
  };

  // ── watchlist bulk actions: select rows → copy text summary / download share cards ──
  const toggleSel = (sym) => setSel(prev => { const n = new Set(prev); n.has(sym) ? n.delete(sym) : n.add(sym); return n; });
  const copySummary = async () => {
    const rows = loadRowsSel();
    if (!rows.length) return;
    const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const text = `VIV Screening Watchlist — ${date}\n` + rows.map(g =>
      `${(g.letter || "—").padEnd(2)} ${"★".repeat(g.stars || 0)}${"☆".repeat(5 - (g.stars || 0))}  ${g.sym}  ${Math.round((g.pct || 0) * 100)}%`).join("\n");
    try { await navigator.clipboard.writeText(text); flashMsg(`Copied ${rows.length} name${rows.length > 1 ? "s" : ""} as text 📋`); }
    catch { flashMsg("Clipboard blocked by the browser"); }
  };
  const loadRowsSel = () => Object.values(loadActiveGrades()).filter(g => sel.has(g.sym)).sort((a, b) => (b.stars - a.stars) || (a.sym < b.sym ? -1 : 1));
  const downloadCards = async () => {
    const rows = loadRowsSel();
    if (!rows.length) return;
    setBusy(true);
    flashMsg(`Rendering ${rows.length} card${rows.length > 1 ? "s" : ""}… allow multiple downloads if the browser asks`);
    // one query: latest post per selected ticker → chart/note/sector for the cards
    const posts = {};
    if (uid) {
      try {
        const { data } = await supabase.from("daily_setups").select("ticker,chart_img,sector,trade_date")
          .in("ticker", rows.map(g => g.sym)).eq("created_by", uid)
          .order("trade_date", { ascending: false }).order("created_at", { ascending: false });
        (data || []).forEach(r => { if (!posts[r.ticker]) posts[r.ticker] = r; });
      } catch {}
    }
    const today = localISO();
    for (const g of rows) {
      const post = posts[g.sym] || {};
      const tset = new Set(g.ticked || []);
      const items = []; // version-aware: legacy grades render their OWN checklist labels
      sectionsFor(g.ticked).forEach((sec, si) => { if (sec.reminder) return; sec.items.forEach((it, ii) => { if (it.bonus) return; items.push({ label: it.c, on: tset.has(si + "-" + ii), star: !!it.star }); }); });
      const sc = scoreTicked(g.ticked); // frozen display prefers g.*, but counts come from the right list
      const sector = post.sector || sectorFor(g.sym);
      const cv = await renderShareCard({
        ticker: g.sym, sector, themeStatus: themeFit(sector, today),
        dateLabel: new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
        stars: g.stars || 0, letter: g.letter || "—", label: (GRADES[g.stars || 0] || GRADES[0])[0],
        passed: sc.passed, total: sc.total, starHit: g.starHit ?? sc.starHit, starmakers: g.starmakers ?? sc.starmakers,
        items, chartUrl: post.chart_img || null,
      });
      await new Promise(res => cv.toBlob(b => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(b); a.download = `VIV-${g.sym}-${today}.png`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000); res();
      }, "image/png"));
      await new Promise(r => setTimeout(r, 350)); // spread the downloads so the browser keeps them all
    }
    setBusy(false);
    flashMsg(`Downloaded ${rows.length} share card${rows.length > 1 ? "s" : ""} 📥`);
  };

  // ── daily-post kit: chart attach (paste/file) + publish + share card ──
  const uploadChart = async (file) => {
    if (!file || !String(file.type || "").startsWith("image/")) return;
    setBusy(true);
    try {
      const path = `daily-setups/${uid || "anon"}/${Date.now()}-${file.name || "chart.png"}`.replace(/[^a-zA-Z0-9./_-]/g, "_");
      const { error } = await supabase.storage.from("trade-charts").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("trade-charts").getPublicUrl(path);
      setChartImg(data?.publicUrl || "");
      flashMsg("Chart attached ✓ — it goes on the share card & the member post");
    } catch {
      // storage unreachable → keep a local data-URL so the share card still renders
      try {
        const r = new FileReader();
        r.onload = () => setChartImg(String(r.result));
        r.readAsDataURL(file);
        flashMsg("Chart attached (local only — storage unreachable)");
      } catch {}
    }
    setBusy(false);
  };
  const uploadRef = useRef(uploadChart);
  uploadRef.current = uploadChart;
  useEffect(() => { // paste a screenshot anywhere on this tab → it attaches
    const h = (e) => {
      const items = e.clipboardData?.items || [];
      for (const it of items) {
        if (String(it.type || "").startsWith("image/")) { e.preventDefault(); uploadRef.current(it.getAsFile()); return; }
      }
    };
    window.addEventListener("paste", h);
    return () => window.removeEventListener("paste", h);
  }, []);

  const doPublish = async () => {
    const s = (ticker || "").toUpperCase().trim();
    if (!s) { flashMsg("Enter a ticker first ↑"); return; }
    if (passed === 0) { flashMsg("Tick the criteria first"); return; }
    setBusy(true);
    saveGrade(s, grade); // publishing also keeps the grade in the watchlist
    const res = await publishSetup({
      created_by: uid, ticker: s, trade_date: editDate || localISO(),
      sector: sectorFor(s), stars, letter, pct, star_hit: starHit, starmakers: STARMAKERS,
      ticked: stampV2([...on]), auto: autoLive, note: note.trim(), chart_img: chartImg,
    });
    setBusy(false);
    flashMsg(!res.ok
      ? `Publish failed — ${res.error || "unknown error"}. Nothing was posted; try again.`
      : res.local
        ? "Parked in this browser — run supabase/daily-setups.sql once, then publish again"
        : `Published ${s} to the members' Daily Setups feed (replaces today's ${s} post if one existed)`);
  };

  const doCard = async () => {
    const s = (ticker || "").toUpperCase().trim();
    if (!s) { flashMsg("Enter a ticker first ↑"); return; }
    setBusy(true);
    try {
      const items = []; // the 14 SCORED criteria, flat, in checklist order (bonus ticks excluded)
      SECTIONS.forEach((sec, si) => {
        if (sec.reminder) return;
        sec.items.forEach((it, ii) => { if (it.bonus) return; items.push({ label: it.c, on: on.has(si + "-" + ii), star: !!it.star }); });
      });
      const today = localISO(); // same calendar day as the printed dateLabel + the published trade_date
      const cv = await renderShareCard({
        ticker: s, sector: sectorFor(s), themeStatus: themeFit(sectorFor(s), today),
        dateLabel: new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }),
        stars, letter, label: gLabel, passed, total: TOTAL, starHit, starmakers: STARMAKERS,
        items, chartUrl: chartImg || null,
      });
      const how = await copyCard(cv, `VIV-${s}-setup.png`);
      flashMsg(how === "copied" ? "Share card copied 📋 — paste it straight into Skool" : "Share card downloaded (clipboard blocked by the browser)");
    } catch (e) { flashMsg("Card failed: " + (e?.message || e)); }
    setBusy(false);
  };

  return (
    <div className="toolpanel on" id="panel-grader">
      {/* intro / guide */}
      <div className={"intro guide" + gactive("grader")} data-gtitle="Setup Grader"
        onMouseEnter={guideEnter("grader", "Setup Grader", "Use this while you're scanning and screening for the best stocks in the market — not during live trading. Tick every characteristic that's true of the chart, and it grades the setup out of five stars across three areas: the prior move, the base, and the trigger day. Leadership sits above as a context check. The fifth star — an A-plus — only unlocks when the highest-signal factors line up together.", undefined)}
        onMouseLeave={guideLeave("grader")}>
        <div className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg></div>
        <div>
          <h3>What is the Setup Grader?</h3>
          <p>Use it while <b>scanning and screening</b> for the best stocks — <b>not during live trading</b>. Tick every characteristic that's true and it scores the chart out of <b>5 stars</b> across three areas: the <b>prior move</b>, the <b>base</b>, and the <b>trigger day</b> ({TOTAL} scored ticks). <b style={{ color: C.gold }}>Leadership</b> sits above as a <b>context check</b> (not scored), and two <b style={{ color: C.goldBright }}>Bonus</b> ticks are tracked but left out of the score. A <b style={{ color: C.gold }}>★ maker</b> is a <b>confluence factor</b> — a high-signal criterion that independently raises the odds the breakout works. You can tick most boxes and still cap at 4★; the <b>fifth star (A+) only unlocks when the ★-makers stack</b> — because {STARMAKERS} unrelated signals agreeing is an edge, one alone is luck. When you're ready to enter, the <b style={{ color: C.blue }}>Trigger &amp; Stop</b> live-checklist at the bottom covers execution.</p>
        </div>
      </div>

      {/* SCREENING WATCHLIST — key in tickers, save grades */}
      <div style={{ fontFamily: font, background: C.glass, border: `1px solid ${C.border}`, borderRadius: 16, padding: "14px 16px 8px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold }}>Screening watchlist</span>
          <span style={{ fontSize: "0.72rem", color: C.muted }}>grade names as you scan — each saves with its ★ score</span>
          {isAdmin && savedRows.length > 0 && (
            <button onClick={clearWatchlist} disabled={busy}
              title="Clear these names from the watchlist. Their saved grades are kept everywhere else (positions, Model Book, Daily Setups)."
              style={{ background: "rgba(239,68,68,0.08)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.38)", fontFamily: font, fontSize: "0.7rem", fontWeight: 800, padding: "6px 12px", borderRadius: 99, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
              🗑 {sel.size > 0 ? `Clear selected (${sel.size})` : `Clear all (${savedRows.length})`}
            </button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === "Enter") startTicker(); }}
              placeholder="Ticker e.g. NVDA" maxLength={8}
              style={{ width: 130, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 10, color: C.white, fontFamily: font, fontWeight: 700, fontSize: "0.82rem", letterSpacing: "0.04em", padding: "8px 12px", outline: "none" }} />
            <button onClick={startTicker} style={{ background: C.goldDim, color: C.gold, border: `1px solid ${C.borderGold}`, fontFamily: font, fontWeight: 800, fontSize: "0.74rem", padding: "8px 14px", borderRadius: 10, cursor: "pointer", whiteSpace: "nowrap" }}>Grade this ↓</button>
          </div>
        </div>
        {isAdmin && sel.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "4px 2px 12px" }}>
            <span style={{ fontSize: "0.72rem", fontWeight: 800, color: C.gold }}>{sel.size} selected</span>
            <button disabled={busy} onClick={copySummary} style={{ background: "rgba(255,255,255,0.06)", color: C.text, border: `1px solid ${C.border}`, fontFamily: font, fontSize: "0.7rem", fontWeight: 800, padding: "6px 13px", borderRadius: 99, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>📋 Copy summary</button>
            <button disabled={busy} onClick={downloadCards} style={{ background: `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})`, color: "#08080e", border: "none", fontFamily: font, fontSize: "0.7rem", fontWeight: 800, padding: "6px 13px", borderRadius: 99, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>🖼 Download {sel.size} card{sel.size > 1 ? "s" : ""}</button>
            <button onClick={() => setSel(new Set())} style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, fontFamily: font, fontSize: "0.7rem", fontWeight: 700, padding: "6px 12px", borderRadius: 99, cursor: "pointer" }}>Clear</button>
          </div>
        )}
        {savedRows.length === 0 ? (
          <div style={{ fontSize: "0.8rem", color: C.muted, padding: "6px 2px 12px" }}>No graded names yet — type a ticker, tick the criteria below, then <b style={{ color: C.gold }}>Save grade</b>. It'll appear here.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 460 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  {isAdmin && <th style={{ padding: "6px 4px 6px 8px", borderBottom: `1px solid ${C.border}`, width: 30 }}>
                    <input type="checkbox" title="Select all"
                      checked={savedRows.length > 0 && savedRows.every(g => sel.has(g.sym))}
                      onChange={e => setSel(e.target.checked ? new Set(savedRows.map(g => g.sym)) : new Set())}
                      style={{ accentColor: "#c9982a", cursor: "pointer" }} />
                  </th>}
                  {["Ticker", "Grade", "Stars", "%", "", ""].map((h, i) => (
                    <th key={i} style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, padding: "6px 8px", borderBottom: `1px solid ${C.border}`, textAlign: i >= 3 ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {savedRows.map((g) => {
                  const active = g.sym === ticker.toUpperCase().trim();
                  const opened = openSym === g.sym;
                  return (
                    <React.Fragment key={g.sym}>
                    <tr onClick={() => loadTicker(g.sym)} style={{ cursor: "pointer", background: active ? "rgba(201,152,42,0.07)" : "transparent" }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = active ? "rgba(201,152,42,0.07)" : "transparent"; }}>
                      {isAdmin && <td onClick={e => e.stopPropagation()} style={{ padding: "9px 4px 9px 8px", borderBottom: `1px solid rgba(255,255,255,0.04)`, width: 30 }}>
                        <input type="checkbox" checked={sel.has(g.sym)} onChange={() => toggleSel(g.sym)} style={{ accentColor: "#c9982a", cursor: "pointer" }} />
                      </td>}
                      <td style={{ padding: "9px 8px", fontWeight: 800, fontSize: "0.86rem", color: C.white, borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                        {g.sym}
                        {posSet.has(g.sym) && <span title="Open position" style={{ marginLeft: 7, fontSize: "0.54rem", fontWeight: 800, letterSpacing: "0.06em", color: C.green, background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", padding: "2px 6px", borderRadius: 99, verticalAlign: "middle" }}>OPEN</span>}
                      </td>
                      <td style={{ padding: "9px 8px", borderBottom: `1px solid rgba(255,255,255,0.04)` }}><span style={{ fontWeight: 800, fontSize: "0.86rem", color: letterColor(C, g.letter) }}>{g.letter}</span></td>
                      <td style={{ padding: "9px 8px", borderBottom: `1px solid rgba(255,255,255,0.04)` }}><MiniStars C={C} n={g.stars} /></td>
                      <td style={{ padding: "9px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: "0.82rem", color: C.text, borderBottom: `1px solid rgba(255,255,255,0.04)` }}>{Math.round((g.pct || 0) * 100)}%</td>
                      <td onClick={e => e.stopPropagation()} style={{ padding: "9px 8px", textAlign: "right", borderBottom: `1px solid rgba(255,255,255,0.04)`, whiteSpace: "nowrap", position: "relative" }}>
                        <button onClick={(e) => { e.stopPropagation(); opened ? setOpenSym("") : openRow(g); }} style={{ background: opened ? C.goldDim : "transparent", border: `1px solid ${opened ? C.borderGold : C.border}`, color: opened ? C.goldBright : C.muted, fontFamily: font, fontSize: "0.68rem", fontWeight: 700, padding: "5px 11px", borderRadius: 8, cursor: "pointer" }}>{opened ? "Close" : "Open"}</button>
                        <button title={`Attach ${g.sym}'s saved grade to an open position of your choice`} onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setRowSync(p => p?.sym === g.sym ? null : { sym: g.sym, x: r.right, y: r.bottom }); }} style={{ marginLeft: 6, background: rowSync?.sym === g.sym ? "rgba(59,130,246,0.18)" : "rgba(59,130,246,0.10)", border: "1px solid rgba(59,130,246,0.3)", color: C.blue, fontFamily: font, fontSize: "0.68rem", fontWeight: 700, padding: "5px 9px", borderRadius: 8, cursor: "pointer" }}>⇄</button>
                      </td>
                      <td style={{ padding: "9px 8px", textAlign: "right", borderBottom: `1px solid rgba(255,255,255,0.04)` }}><button title="Remove from this list (grade is kept)" onClick={(e) => { e.stopPropagation(); if (window.confirm(`Remove ${g.sym} from the screening watchlist?\n\nThe saved grade is KEPT everywhere it's used — Open Positions' Grade column, the Model Book, and any published Daily Setups. This only clears ${g.sym} from this list; grade it again anytime to bring it back.`)) archiveGrade(g.sym); }} style={{ background: "transparent", border: "none", color: C.muted, fontSize: "1rem", cursor: "pointer", lineHeight: 1 }}>×</button></td>
                    </tr>
                    {opened && (() => {
                      // Inline editor — VERSION-AWARE: a legacy row keeps its own list, denominator
                      // and star-maker set; a v2 row uses v2. Bonus ticks save but never score.
                      const eSecs = sectionsFor(g.ticked);
                      const eTotal = totalFor(g.ticked), eSM = starmakersFor(g.ticked), eV = versionOf(g.ticked);
                      let ePassed = 0, eStarHit = 0;
                      eSecs.forEach((sec, si) => { if (sec.reminder) return; sec.items.forEach((it, ii) => { if (it.bonus) return; if (editOn.has(si + "-" + ii)) { ePassed++; if (it.star) eStarHit++; } }); });
                      const ePct = eTotal ? ePassed / eTotal : 0;
                      let eStars = Math.round(ePct * 5);
                      if (eStars >= 5 && eStarHit < eSM) eStars = 4;
                      if (ePassed === 0) eStars = 0;
                      const eLetter = letterFor(eStars);
                      const dirty = [...editOn].sort().join(",") !== [...(g.ticked || [])].sort().join(",");
                      const saveRow = () => {
                        if (ePassed === 0) { setRowMsg("Tick at least one criterion first"); return; }
                        saveGrade(g.sym, { stars: eStars, pct: ePct, passed: ePassed, total: eTotal, starHit: eStarHit, starmakers: eSM,
                          letter: eLetter, label: (GRADES[eStars] || GRADES[0])[0],
                          ticked: eV === 2 ? stampV2([...editOn]) : [...editOn], // preserve the row's checklist version
                          auto: [...editAuto].filter(k => editOn.has(k)),
                          chart_img: g.chart_img || "", note: g.note || "" });
                        setRowMsg(`Saved ${g.sym} ✓`);
                      };
                      const deleteRow = () => {
                        if (window.confirm(`Remove ${g.sym} from the screening watchlist?\n\nThe saved grade is KEPT everywhere it's used — Open Positions' Grade column, the Model Book, and any published Daily Setups. This only clears ${g.sym} from this list; grade it again anytime to bring it back.`)) { archiveGrade(g.sym); setOpenSym(""); }
                      };
                      return (
                      <tr>
                        <td colSpan={isAdmin ? 7 : 6} style={{ padding: "2px 8px 14px", borderBottom: `1px solid rgba(255,255,255,0.04)`, background: "rgba(201,152,42,0.03)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "10px 6px 4px" }}>
                            <MiniStars C={C} n={eStars} size={0.9} />
                            <span style={{ fontWeight: 800, fontSize: "0.9rem", color: letterColor(C, eLetter) }}>{eLetter}</span>
                            <span style={{ fontSize: "0.8rem", fontWeight: 700, color: C.white }}>{(GRADES[eStars] || GRADES[0])[0]}</span>
                            <span style={{ fontSize: "0.72rem", color: C.muted }}>{ePassed}/{eTotal} criteria · {eStarHit}/{eSM} ★-makers{eV === 1 ? " · previous checklist" : ""}{dirty ? " · unsaved edits" : ""}</span>
                            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              {rowMsg && <span style={{ fontSize: "0.72rem", fontWeight: 700, color: rowMsg.includes("✓") ? C.green : C.goldBright }}>{rowMsg}</span>}
                              <button onClick={saveRow} style={{ background: `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})`, color: "#08080e", border: "none", fontFamily: font, fontSize: "0.68rem", fontWeight: 800, padding: "6px 14px", borderRadius: 99, cursor: "pointer", whiteSpace: "nowrap" }}>Save grade</button>
                              <button onClick={deleteRow} style={{ background: "rgba(239,68,68,0.10)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.4)", fontFamily: font, fontSize: "0.68rem", fontWeight: 800, padding: "6px 14px", borderRadius: 99, cursor: "pointer", whiteSpace: "nowrap" }}>Delete</button>
                              <button onClick={() => loadTicker(g.sym)} title="Load into the full grader below for the chart, annotation and publishing" style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border}`, fontFamily: font, fontSize: "0.68rem", fontWeight: 700, padding: "6px 12px", borderRadius: 99, cursor: "pointer", whiteSpace: "nowrap" }}>Full kit ↓</button>
                            </div>
                          </div>
                          <div style={{ fontSize: "0.68rem", color: C.muted, padding: "0 6px 4px" }}>Click any criterion to tick / untick it, then Save — the grade updates right here, no scrolling.</div>
                          {(g.note || g.chart_img) && (
                            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap", padding: "6px 6px 2px" }}>
                              {g.chart_img && <img src={g.chart_img} alt={`${g.sym} chart`} style={{ width: 180, maxWidth: "100%", borderRadius: 10, border: `1px solid ${C.border}`, display: "block" }} />}
                              {g.note && <div style={{ flex: "1 1 220px", fontSize: "0.78rem", color: C.text, lineHeight: 1.5 }}>{g.note}</div>}
                            </div>
                          )}
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "8px 18px", padding: "8px 6px 0" }}>
                            {eSecs.map((sec, si) => {
                              if (sec.reminder) return null;
                              return (
                                <div key={si}>
                                  <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, margin: "4px 0 6px" }}>{sec.title}</div>
                                  {sec.items.map((it, ii) => {
                                    const key = si + "-" + ii, isOn = editOn.has(key);
                                    return (
                                      <div key={ii} onClick={() => editToggle(key)} title={it.s}
                                        style={{ display: "flex", gap: 7, alignItems: "baseline", fontSize: "0.74rem", lineHeight: 1.6, color: isOn ? C.text : "rgba(255,255,255,0.35)", cursor: "pointer", userSelect: "none", borderRadius: 6, padding: "1px 4px" }}
                                        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                        <span style={{ color: isOn ? C.goldBright : "rgba(255,255,255,0.22)", fontWeight: 800 }}>{isOn ? "✓" : "·"}</span>
                                        <span>{it.c}{it.star && <span style={{ color: C.goldMid, marginLeft: 5, fontSize: "0.62rem" }}>★</span>}{it.bonus && <span style={{ marginLeft: 5, fontSize: "0.5rem", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: C.goldBright, border: `1px solid ${C.goldBright}`, padding: "0 5px", borderRadius: 99 }}>Bonus</span>}{isOn && editAuto.has(key) && <span title="Auto-read from the chart by VIV" style={{ marginLeft: 5, fontSize: "0.6rem", color: C.goldBright }}>●</span>}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                      );
                    })()}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {/* Per-row "attach grade to position" menu — portaled to body: the table's overflow
            container (and the card's backdrop-filter) would clip/mis-anchor it otherwise. */}
        {rowSync && createPortal((() => {
          const g = getGrade(rowSync.sym);
          if (!g) return null;
          const targets = posSyms.filter(s => s !== rowSync.sym);
          return (
            <>
              <div onClick={() => setRowSync(null)} style={{ position: "fixed", inset: 0, zIndex: 1240 }} />
              <div style={{ position: "fixed", top: Math.min(rowSync.y + 6, window.innerHeight - 260), left: Math.max(10, rowSync.x - 230), zIndex: 1250, width: 230, maxHeight: 240, overflowY: "auto", background: "#0c0c14", border: `1px solid ${C.border}`, borderRadius: 12, padding: 6, boxShadow: "0 18px 44px rgba(0,0,0,0.6)", textAlign: "left", fontFamily: font }}>
                <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, padding: "7px 10px 6px" }}>Attach {rowSync.sym}&#39;s grade to…</div>
                {targets.length === 0 ? (
                  <div style={{ fontSize: "0.74rem", color: C.muted, padding: "8px 10px 12px" }}>{posSet.has(rowSync.sym) ? `${rowSync.sym} already shows on its own open position.` : "No open positions found. Grades show on a position automatically once you hold its ticker."}</div>
                ) : targets.map(s => {
                  const eg = getGrade(s);
                  return (
                    <div key={s} onClick={() => { if (eg && !window.confirm(`${s} already has a saved ${eg.letter} grade — overwrite it with ${rowSync.sym}'s ${g.letter}?`)) return; saveGrade(s, g); setRowSync(null); flashMsg(`${rowSync.sym} grade attached to ${s} — shows on its Open Positions row`); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 10px", borderRadius: 8, cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <span style={{ fontWeight: 800, fontSize: "0.82rem", color: C.white }}>{s}</span>
                      {eg ? <span style={{ fontSize: "0.66rem", fontWeight: 700, color: letterColor(C, eg.letter) }}>has {eg.letter}</span> : <span style={{ fontSize: "0.64rem", color: C.muted }}>ungraded</span>}
                    </div>
                  );
                })}
              </div>
            </>
          );
        })(), document.body)}
      </div>

      {/* SCORE PANEL */}
      <div style={{
        position: "sticky", top: 12, zIndex: 5, fontFamily: font, marginBottom: 20,
        background: `linear-gradient(135deg, rgba(201,152,42,0.10), rgba(255,255,255,0.02))`,
        border: `1px solid ${C.borderGold}`, borderRadius: 18, padding: "16px 20px",
        backdropFilter: "blur(24px) saturate(160%)", WebkitBackdropFilter: "blur(24px) saturate(160%)",
        display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap",
        boxShadow: "0 16px 44px rgba(0,0,0,0.5)",
      }}>
        <div>
          <div style={{ fontSize: "1.7rem", letterSpacing: 3, lineHeight: 1 }}>
            {[0, 1, 2, 3, 4].map(k => (
              <span key={k} style={{ color: k < stars ? C.goldBright : "rgba(255,255,255,0.14)", textShadow: k < stars ? "0 0 12px rgba(240,192,80,0.5)" : "none" }}>★</span>
            ))}
          </div>
          <div style={{ fontSize: "0.72rem", color: C.muted, marginTop: 6 }}>
            {passed ? `${starHit}/${STARMAKERS} ★-makers · ${Math.round(pct * 100)}% of criteria` : "Tick what's true to grade the setup"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "1.12rem", fontWeight: 800, color: C.white }}>{gLabel}</div>
          <div style={{ fontSize: "0.72rem", color: C.muted, marginTop: 3, maxWidth: 320 }}>{gDesc}</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: "1.7rem", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: C.white }}>
            {passed}<span style={{ color: C.muted, fontWeight: 600, fontSize: "1rem" }}>/{TOTAL}</span>
          </div>
          <div style={{ fontSize: "0.62rem", color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em" }}>criteria passed</div>
        </div>
        <div style={{ position: "relative", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => doSave()} style={{ background: `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})`, color: "#08080e", border: "none", fontFamily: font, fontSize: "0.74rem", fontWeight: 800, padding: "9px 16px", borderRadius: 99, cursor: "pointer", whiteSpace: "nowrap" }}>Save grade{ticker ? ` · ${ticker.toUpperCase().trim()}` : ""}</button>
          <button onClick={() => setShowSync(s => !s)} style={{ background: "rgba(59,130,246,0.12)", color: C.blue, border: "1px solid rgba(59,130,246,0.3)", fontFamily: font, fontSize: "0.74rem", fontWeight: 800, padding: "9px 14px", borderRadius: 99, cursor: "pointer", whiteSpace: "nowrap" }}>Sync to Open Position ▾</button>
          <button onClick={reset} style={{ background: "rgba(255,255,255,0.06)", color: C.muted, border: `1px solid ${C.border}`, fontFamily: font, fontSize: "0.72rem", fontWeight: 700, padding: "9px 16px", borderRadius: 99, cursor: "pointer" }}>Reset</button>
          {showSync && (
            <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 30, minWidth: 220, maxHeight: 260, overflowY: "auto", background: "#0c0c14", border: `1px solid ${C.border}`, borderRadius: 12, padding: 6, boxShadow: "0 18px 44px rgba(0,0,0,0.6)" }}>
              <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, padding: "7px 10px 6px" }}>Attach this grade to…</div>
              {posSyms.length === 0 ? (
                <div style={{ fontSize: "0.76rem", color: C.muted, padding: "8px 10px 12px" }}>No open positions found. Grade shows on a position once you hold it.</div>
              ) : posSyms.map(s => {
                const g = getGrade(s);
                return (
                  <div key={s} onClick={() => syncTo(s)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 10px", borderRadius: 8, cursor: "pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span style={{ fontWeight: 800, fontSize: "0.84rem", color: C.white }}>{s}</span>
                    {g ? <span style={{ fontSize: "0.68rem", fontWeight: 700, color: letterColor(C, g.letter) }}>{g.letter} · {g.stars}★</span> : <span style={{ fontSize: "0.66rem", color: C.muted }}>ungraded</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {autoLive.length > 0 && (
          <button onClick={() => { setAuto(new Set()); flashMsg("Auto-ticks confirmed — hit Save grade to keep it"); }}
            title="These ticks were auto-read off the chart by VIV (gold dot ●). Cross-check them, then confirm."
            style={{ background: "rgba(201,152,42,0.12)", color: C.goldBright, border: `1px solid ${C.borderGold}`, fontFamily: font, fontSize: "0.72rem", fontWeight: 800, padding: "9px 14px", borderRadius: 99, cursor: "pointer", whiteSpace: "nowrap" }}>
            ● Confirm {autoLive.length} auto-tick{autoLive.length > 1 ? "s" : ""}
          </button>
        )}
        {flash && <div style={{ flexBasis: "100%", fontSize: "0.74rem", color: C.green, fontWeight: 700, marginTop: 2 }}>✓ {flash}</div>}
      </div>

      {/* LEGACY-GRADE NOTICE — a saved grade made on the PREVIOUS checklist can't be mapped onto the
          new items (meanings differ). Show its frozen score, start the v2 checklist unticked. */}
      {legacyLoaded && (
        <div style={{ fontFamily: font, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.28)", borderRadius: 12, padding: "10px 14px", marginBottom: 16 }}>
          <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.blue, background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", padding: "3px 9px", borderRadius: 99 }}>Previous checklist</span>
          <span style={{ fontSize: "0.8rem", color: C.text }}>
            {ticker ? `${ticker.toUpperCase().trim()} was ` : "This name was "}
            graded <b style={{ color: letterColor(C, legacyLoaded.letter) }}>{legacyLoaded.letter} · {legacyLoaded.stars}★</b> ({legacyLoaded.passed}/{legacyLoaded.total}) on the previous checklist — <b style={{ color: C.goldBright }}>re-grade below to update</b>. The saved grade stays untouched until you Save.
          </span>
        </div>
      )}

      {/* DAILY POST KIT — attach the chart, annotate, publish to members / copy the Skool card */}
      <div style={{ fontFamily: font, background: C.glass, border: `1px solid ${C.border}`, borderRadius: 16, padding: "14px 16px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold }}>Daily post kit</span>
          <span style={{ fontSize: "0.72rem", color: C.muted }}>paste a chart screenshot (⌘V) anywhere on this tab — it attaches here</span>
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "stretch", flexWrap: "wrap" }}>
          {/* chart slot */}
          <label style={{ flex: "0 0 200px", minHeight: 96, borderRadius: 12, border: `1px dashed ${chartImg ? C.borderGold : C.border}`, background: "rgba(255,255,255,0.02)", display: "grid", placeItems: "center", cursor: "pointer", overflow: "hidden", position: "relative" }}>
            <input type="file" accept="image/*" disabled={busy} onChange={e => uploadChart(e.target.files?.[0])} style={{ display: "none" }} />
            {chartImg
              ? <img src={chartImg} alt="chart" style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }} />
              : <span style={{ fontSize: "0.7rem", color: C.muted, textAlign: "center", padding: "0 12px" }}>{busy ? "Uploading…" : "📈 Paste or click to attach the chart"}</span>}
          </label>
          {chartImg && (
            <button onClick={() => setChartImg("")} title="Remove chart" style={{ alignSelf: "flex-start", background: "transparent", border: `1px solid ${C.border}`, color: C.muted, fontFamily: font, fontSize: "0.66rem", fontWeight: 700, padding: "5px 10px", borderRadius: 8, cursor: "pointer" }}>×</button>
          )}
          {/* annotation */}
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={400}
            placeholder="Annotation for the post — the read, the level that matters, what you're waiting for…"
            style={{ flex: "1 1 260px", minWidth: 0, resize: "vertical", background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontFamily: font, fontSize: "0.82rem", lineHeight: 1.5, padding: "10px 12px", outline: "none" }} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
          {isAdmin && (
            <button disabled={busy} onClick={doPublish}
              style={{ background: `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})`, color: "#08080e", border: "none", fontFamily: font, fontSize: "0.74rem", fontWeight: 800, padding: "9px 16px", borderRadius: 99, cursor: "pointer", whiteSpace: "nowrap", opacity: busy ? 0.6 : 1 }}>
              📣 Publish to members{ticker ? ` · ${ticker.toUpperCase().trim()}` : ""}
            </button>
          )}
          <button disabled={busy} onClick={doCard}
            style={{ background: "rgba(255,255,255,0.06)", color: C.text, border: `1px solid ${C.border}`, fontFamily: font, fontSize: "0.74rem", fontWeight: 800, padding: "9px 16px", borderRadius: 99, cursor: "pointer", whiteSpace: "nowrap", opacity: busy ? 0.6 : 1 }}>
            🖼 Copy share card
          </button>
          <span style={{ fontSize: "0.7rem", color: C.muted }}>{isAdmin ? "Publish → members' Daily Setups feed · card → clipboard for Skool" : "The card is a branded image of this grade — share your setup in the community"}</span>
        </div>
      </div>

      {/* ═══ ONE-PAGE CHECKLIST — leadership context strip · 3 scored bucket cards · trigger strip ═══ */}

      {/* Leadership / Stock Selection — NON-SCORED context (dashed, not tickable, not in pct/stars) */}
      <div style={{ fontFamily: font, background: "rgba(201,152,42,0.04)", border: `1px dashed ${C.borderGold}`, borderRadius: 16, padding: "12px 16px", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold }}>{LEADERSHIP_CONTEXT.title}</span>
          <span style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, padding: "3px 9px", borderRadius: 99 }}>Not scored</span>
          <span style={{ fontSize: "0.72rem", color: C.muted, flex: "1 1 240px", lineHeight: 1.4 }}>{LEADERSHIP_CONTEXT.note}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "4px 18px" }}>
          {LEADERSHIP_CONTEXT.items.map((it, i) => (
            <div key={i} style={{ display: "flex", gap: 7, alignItems: "baseline", fontSize: "0.76rem", lineHeight: 1.4 }}>
              <span style={{ color: C.gold, flex: "0 0 auto" }}>▹</span>
              <span style={{ color: C.text }}><b style={{ fontWeight: 700 }}>{it.c}</b> <span style={{ color: C.muted }}>— {it.s}</span></span>
            </div>
          ))}
        </div>
      </div>

      {/* Three SCORED buckets — house-style glass cards, 3-across (1-col under ~900px via auto-fit) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(285px, 1fr))", gap: 14, marginBottom: 14 }}>
        {SECTIONS.map((sec, si) => {
          if (sec.reminder) return null;
          const full = secCounts[si] === sec.items.length;
          const scoredNum = SECTIONS.slice(0, si).filter(s => !s.reminder).length + 1;
          return (
            <div key={si} style={{ fontFamily: font, background: C.glass, border: `1px solid ${C.border}`, borderRadius: 16, padding: "12px 14px" }}>
              {/* header: number chip + uppercase micro-label + count, hairline divider */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 9, marginBottom: 8, borderBottom: `1px solid ${C.border}` }}>
                <span style={{ width: 20, height: 20, borderRadius: 6, display: "grid", placeItems: "center", background: C.goldDim, color: C.gold, fontWeight: 800, fontSize: "0.68rem", border: `1px solid ${C.borderGold}`, flex: "none" }}>{scoredNum}</span>
                <span style={{ fontSize: "0.64rem", fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: C.gold, flex: 1 }}>{sec.title}</span>
                <span style={{ fontSize: "0.68rem", fontWeight: 800, fontVariantNumeric: "tabular-nums", padding: "3px 9px", borderRadius: 99, border: `1px solid ${full ? "rgba(34,197,94,0.4)" : C.border}`, background: full ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.05)", color: full ? C.green : C.muted }}>{secCounts[si]}/{sec.items.length}</span>
              </div>
              {si === 2 && (
                <div style={{ fontSize: "0.68rem", color: C.muted, fontStyle: "italic", lineHeight: 1.4, margin: "0 0 8px" }}>Grading pre-market? Leave these unticked — come back after the open to finish the grade.</div>
              )}
              {sec.items.map((it, ii) => {
                const key = si + "-" + ii, isOn = on.has(key);
                return (
                  <div key={ii} onClick={() => toggle(key)} style={{
                    display: "flex", gap: 9, alignItems: "flex-start", padding: "5px 4px", borderRadius: 8,
                    cursor: "pointer", userSelect: "none", background: isOn ? "rgba(201,152,42,0.06)" : "transparent",
                  }}
                    onMouseEnter={e => { if (!isOn) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = isOn ? "rgba(201,152,42,0.06)" : "transparent"; }}>
                    <div style={{
                      flex: "0 0 18px", width: 18, height: 18, borderRadius: 5, marginTop: 1,
                      border: isOn ? `1.5px solid ${C.goldBright}` : "1.5px solid rgba(255,255,255,0.22)",
                      background: isOn ? `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})` : "rgba(255,255,255,0.03)",
                      display: "grid", placeItems: "center",
                    }}>{isOn && CHECK}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.8rem", fontWeight: 600, lineHeight: 1.25, color: isOn ? C.goldBright : C.text }}>
                        {it.c}
                        {it.star && <span style={{ marginLeft: 6, fontSize: "0.52rem", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: C.goldMid, background: "rgba(201,152,42,0.12)", border: `1px solid ${C.borderGold}`, padding: "1px 6px", borderRadius: 99, whiteSpace: "nowrap" }}>★ maker</span>}
                        {it.bonus && <span title="Bonus factor — tracked but excluded from the star score" style={{ marginLeft: 6, fontSize: "0.52rem", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: C.goldBright, border: `1px solid ${C.goldBright}`, padding: "1px 6px", borderRadius: 99, whiteSpace: "nowrap" }}>Bonus</span>}
                        {isOn && auto.has(key) && <span title="Auto-read from the chart by VIV — cross-check it; any click clears the dot" style={{ marginLeft: 6, fontSize: "0.58rem", color: C.goldBright, textShadow: "0 0 8px rgba(240,192,80,0.7)" }}>●</span>}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: C.muted, marginTop: 1, lineHeight: 1.35 }}>{it.s}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Trigger & Stop — slim NON-SCORED reminder strip (unchanged content; still tickable, never scored) */}
      {SECTIONS.map((sec, si) => {
        if (!sec.reminder) return null;
        return (
          <div key={si} style={{ fontFamily: font, background: "rgba(59,130,246,0.04)", border: "1px dashed rgba(59,130,246,0.28)", borderRadius: 16, padding: "12px 16px", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
              <span style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.blue }}>{sec.title}</span>
              <span style={{ fontSize: "0.56rem", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: C.blue, background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", padding: "3px 9px", borderRadius: 99 }}>Not scored</span>
              <span style={{ fontSize: "0.72rem", color: C.muted, flex: "1 1 240px", lineHeight: 1.4 }}>{sec.note}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "2px 16px" }}>
              {sec.items.map((it, ii) => {
                const key = si + "-" + ii, isOn = on.has(key);
                return (
                  <div key={ii} onClick={() => toggle(key)} title={it.s} style={{ display: "flex", gap: 7, alignItems: "baseline", fontSize: "0.74rem", lineHeight: 1.45, padding: "3px 2px", borderRadius: 6, cursor: "pointer", userSelect: "none", color: isOn ? C.text : "rgba(255,255,255,0.55)" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span style={{ color: isOn ? C.blue : "rgba(255,255,255,0.3)", fontWeight: 800, flex: "0 0 auto" }}>{isOn ? "✓" : "○"}</span>
                    <span>{it.c}{it.key && <span style={{ marginLeft: 5, fontSize: "0.52rem", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: C.blue }}>· R:R</span>}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* footnote */}
      <div style={{ fontFamily: font, fontSize: "0.76rem", color: C.muted, lineHeight: 1.6, padding: "4px 6px" }}>
        <b style={{ color: "rgba(255,255,255,0.75)" }}>One more thing to check (not scored):</b> the market regime — is the overall market trending up with leaders working? If it's in a downtrend, even a perfect chart usually fails, so grade the market before you grade the stock.
      </div>
    </div>
  );
}
