import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";
import { getGrade } from "./grades.js";
import { SECTIONS } from "./SetupGrader.jsx";

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
// The stars are COMPUTED from the same 16 ticks; nothing is hand-assigned.
let MB_TOTAL = 0, MB_STARMAKERS = 0;
SECTIONS.forEach(s => { if (s.reminder) return; s.items.forEach(i => { MB_TOTAL++; if (i.star) MB_STARMAKERS++; }); });
export function starsFromTicked(ticked) {
  const t = ticked || [];
  let passed = 0, starHit = 0;
  SECTIONS.forEach((sec, si) => {
    if (sec.reminder) return;
    sec.items.forEach((it, ii) => { if (t.includes(si + "-" + ii)) { passed++; if (it.star) starHit++; } });
  });
  const pct = MB_TOTAL ? passed / MB_TOTAL : 0;
  let stars = Math.round(pct * 5);
  if (stars >= 5 && starHit < MB_STARMAKERS) stars = 4; // A+ requires full ★-maker confluence — same gate as the grader
  if (passed === 0) stars = 0;
  return { stars, passed, starHit, pct };
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

const Stars = ({ C, n, max = 7, size = "0.95rem" }) => (
  <span style={{ letterSpacing: 1.5, fontSize: size, whiteSpace: "nowrap" }}>
    {Array.from({ length: max }, (_, k) => (
      <span key={k} style={{ color: k < n ? (k >= 5 ? "#7ef0a0" : C.goldBright) : "rgba(255,255,255,0.13)", textShadow: k < n ? "0 0 10px rgba(240,192,80,0.4)" : "none" }}>★</span>
    ))}
  </span>
);

export default function ModelBookPage({ C, font, session, isAdmin, guideEnter, guideLeave, gactive }) {
  const uid = session?.user?.id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fPattern, setFPattern] = useState("All");
  const [fTier, setFTier] = useState("All"); // All | 7 | 6 | 5
  const [fScope, setFScope] = useState("All"); // All | official (VIV published) | mine (my personal book)
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} (new) | row (edit)
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(null); // lightbox: { imgs: {before, after}, slot: "before"|"after" }

  // Lightbox keyboard nav — ← → flips before/after, Esc closes
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e) => {
      if (e.key === "Escape") setZoom(null);
      else if (e.key === "ArrowLeft") setZoom(z => (z && z.imgs.before ? { ...z, slot: "before" } : z));
      else if (e.key === "ArrowRight") setZoom(z => (z && z.imgs.after ? { ...z, slot: "after" } : z));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

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
    if (fScope === "official" && !r.is_published) return false;
    if (fScope === "mine" && r.created_by !== uid) return false;
    if (fPattern !== "All" && r.pattern !== fPattern) return false;
    const eff = effectiveStars(r.stars, (r.elite || []).length).n;
    if (fTier !== "All" && eff !== +fTier) return false;
    return true;
  });
  const mineCount = rows.filter(r => r.created_by === uid && !r.is_published).length;

  const uploadImg = async (file, slot, row, setRow) => {
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
      created_by: uid, ticker: (row.ticker || "").toUpperCase().trim(), pattern: row.pattern || "Trendline Breakout",
      stars: starsFromTicked(row.ticked).stars, // objective — derived from the grader ticks, never hand-set
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
    const q = row.id
      ? supabase.from("model_book").update(body).eq("id", row.id)
      : supabase.from("model_book").insert(body);
    const { error } = await q;
    setBusy(false);
    if (error) { setError(String(error.message)); return; }
    setEditing(null); load();
  };
  const remove = async (row) => {
    const { error } = await supabase.from("model_book").delete().eq("id", row.id);
    if (error) setError(String(error.message)); else { setDetail(null); load(); }
  };

  const chip = (active) => ({
    fontSize: "0.72rem", fontWeight: 700, padding: "6px 14px", borderRadius: 99, cursor: "pointer", fontFamily: font, transition: "all .14s",
    border: `1px solid ${active ? C.goldBright : C.border}`, color: active ? "#08080e" : C.muted,
    background: active ? `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})` : "rgba(255,255,255,0.03)",
  });
  const inputS = { background: "rgba(0,0,0,0.35)", border: `1px solid ${C.border}`, borderRadius: 10, color: C.white, fontFamily: font, fontSize: "0.84rem", padding: "9px 12px", outline: "none", width: "100%" };
  const lbl = { fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 6, display: "block" };

  // ── Entry editor (admin) ──
  const Editor = ({ initial }) => {
    const [row, setRow] = useState(() => {
      let prefill = {};
      try { prefill = JSON.parse(sessionStorage.getItem("viv-mb-prefill") || "{}"); sessionStorage.removeItem("viv-mb-prefill"); } catch {}
      return {
        ticker: "", pattern: "Trendline Breakout", theme: "", entry_date: "", exit_date: "", before_img: "", after_img: "",
        elite: [], ticked: [], outcome: "", run_pct: "", run_up_pct: "", angle: "", characteristics: [],
        days_held: "", r_mult: "", thesis: "", lesson: "", is_published: false, metrics: {},
        ...prefill, ...(initial || {}),
      };
    });
    const graded = starsFromTicked(row.ticked); // OBJECTIVE — same 16 ticks + formula as the Setup Grader
    const eff = effectiveStars(graded.stars, (row.elite || []).length);
    // AUTO-FILL layer — metrics._auto lists every field/tick VIV pre-filled from the chart (shown as a
    // gold dot). A human edit on that field clears its dot: the value becomes Valen-confirmed.
    const auto = new Set((row.metrics && row.metrics._auto) || []);
    const clearAuto = (r, key) => { const m = r.metrics || {}; return { ...m, _auto: (m._auto || []).filter(x => x !== key) }; };
    const setField = (key, val) => setRow(r => ({ ...r, [key]: val, metrics: clearAuto(r, key) }));
    const AutoDot = ({ k }) => auto.has(k) ? <span title="Auto-filled from your chart by VIV — edit to correct (the dot clears)" style={{ display: "inline-block", width: 7, height: 7, borderRadius: 99, background: C.goldBright, boxShadow: "0 0 7px rgba(240,192,80,0.85)", marginLeft: 6, verticalAlign: "middle", flexShrink: 0 }} /> : null;
    const toggleElite = (k) => setRow(r => ({ ...r, elite: r.elite.includes(k) ? r.elite.filter(x => x !== k) : [...r.elite, k], metrics: clearAuto(r, "elite:" + k) }));
    const toggleTick = (key) => setRow(r => ({ ...r, ticked: r.ticked.includes(key) ? r.ticked.filter(x => x !== key) : [...r.ticked, key], metrics: clearAuto(r, "tick:" + key) }));
    const suggestedOutcome = outcomeFromR(row.r_mult, row.run_pct);
    const pullGrade = () => {
      const g = getGrade(row.ticker);
      if (g && g.ticked) setRow(r => ({ ...r, ticked: g.ticked }));
    };
    return (
      <div style={{ fontFamily: font, background: C.glass, border: `1px solid ${C.borderGold}`, borderRadius: 18, padding: "20px 22px", marginBottom: 20 }}>
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
          <span style={{ ...lbl, marginBottom: 0 }}>Setup Grader checklist — stars compute from these ticks</span>
          <span style={{ fontSize: "0.74rem", fontWeight: 800, color: C.goldBright }}>{graded.stars}★ · {graded.passed}/{MB_TOTAL} · {graded.starHit}/{MB_STARMAKERS} ★-makers</span>
          <button onClick={pullGrade} title="Import this ticker's saved Setup Grader ticks" style={{ ...chip(false), whiteSpace: "nowrap", marginLeft: "auto" }}>Pull from grader</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 10, marginBottom: 14 }}>
          {SECTIONS.filter(s => !s.reminder).map((sec, si) => (
            <div key={si} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", background: "rgba(255,255,255,0.015)" }}>
              <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.gold, marginBottom: 7 }}>{sec.title}</div>
              {sec.items.map((it, ii) => {
                const key = si + "-" + ii, on = row.ticked.includes(key);
                return (
                  <div key={ii} onClick={() => toggleTick(key)} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "4px 2px", cursor: "pointer" }}>
                    <span style={{ color: on ? C.goldBright : "rgba(255,255,255,0.22)", fontWeight: 800, lineHeight: 1.3 }}>{on ? "✓" : "○"}</span>
                    <span style={{ fontSize: "0.76rem", fontWeight: 600, color: on ? C.goldBright : C.text, lineHeight: 1.35 }}>{it.c}{it.star && <span style={{ fontSize: "0.56rem", color: C.goldMid, marginLeft: 5 }}>★ maker</span>}<AutoDot k={"tick:" + key} /></span>
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <span style={lbl}>Before chart (the setup)</span>
            {row.before_img && <img src={row.before_img} alt="before" style={{ width: "100%", borderRadius: 10, marginBottom: 6, border: `1px solid ${C.border}` }} />}
            <input type="file" accept="image/*" onChange={e => uploadImg(e.target.files?.[0], "before_img", row, setRow)} style={{ color: C.muted, fontSize: "0.74rem" }} />
          </div>
          <div>
            <span style={lbl}>After chart (the outcome)</span>
            {row.after_img && <img src={row.after_img} alt="after" style={{ width: "100%", borderRadius: 10, marginBottom: 6, border: `1px solid ${C.border}` }} />}
            <input type="file" accept="image/*" onChange={e => uploadImg(e.target.files?.[0], "after_img", row, setRow)} style={{ color: C.muted, fontSize: "0.74rem" }} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div><span style={lbl}>The thesis (why it was A+ BEFORE the move)<AutoDot k="thesis" /></span><textarea rows={3} style={{ ...inputS, resize: "vertical" }} value={row.thesis || ""} onChange={e => setField("thesis", e.target.value)} /></div>
          <div><span style={lbl}>The lesson (what to internalize)<AutoDot k="lesson" /></span><textarea rows={3} style={{ ...inputS, resize: "vertical" }} value={row.lesson || ""} onChange={e => setField("lesson", e.target.value)} /></div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button disabled={busy || !row.ticker} onClick={() => save(row)} style={{ background: `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})`, color: "#08080e", border: "none", fontFamily: font, fontWeight: 800, fontSize: "0.82rem", padding: "11px 24px", borderRadius: 99, cursor: "pointer", opacity: busy || !row.ticker ? 0.6 : 1 }}>{busy ? "Saving…" : row.id ? "Save changes" : "Add entry"}</button>
          {isAdmin ? (
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.78rem", color: row.is_published ? C.green : C.muted, cursor: "pointer", fontFamily: font, fontWeight: 700 }}>
              <input type="checkbox" checked={!!row.is_published} onChange={e => setRow(r => ({ ...r, is_published: e.target.checked }))} /> Published to members
            </label>
          ) : (
            <span style={{ fontSize: "0.72rem", color: C.muted, fontFamily: font }}>🔒 Saves to your personal model book — only you can see it.</span>
          )}
          <button onClick={() => setEditing(null)} style={{ marginLeft: "auto", background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.muted, fontFamily: font, fontWeight: 700, fontSize: "0.76rem", padding: "10px 18px", borderRadius: 99, cursor: "pointer" }}>Cancel</button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ fontFamily: font }}>
      {/* header */}
      <div className="toolbar" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 className={"sech guide" + (gactive ? gactive("modelbook") : "")}
          onMouseEnter={guideEnter ? guideEnter("modelbook", "Model Book", "Two books in one: the ⭐ VIV Official library — curated elite setups, read-only — and 🔒 My Book, your private collection only you can see. Study the before chart, the exact factors that made it elite, then the outcome. Stars are computed from the Setup Grader ticks (objective, no bias). Fields marked with a gold dot were auto-read off the chart by VIV — edit any that look off. Pattern recognition is built by reps: same patterns, hundreds of examples.", undefined) : undefined}
          onMouseLeave={guideLeave ? guideLeave("modelbook") : undefined}>Model Book</h2>
        <span style={{ fontSize: "0.74rem", color: C.muted }}>study the best — before → factors → after</span>
        {!editing && <button onClick={() => setEditing({})} style={{ marginLeft: "auto", background: `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})`, color: "#08080e", border: "none", fontFamily: font, fontWeight: 800, fontSize: "0.78rem", padding: "10px 20px", borderRadius: 99, cursor: "pointer" }}>{isAdmin ? "+ Add entry" : "+ Add to my book"}</button>}
      </div>

      {editing !== null && <Editor initial={editing.id ? editing : null} />}

      {/* filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "6px 0 18px", alignItems: "center" }}>
        {[["All", "All"], ["official", "⭐ VIV Official"], ["mine", `🔒 My Book${mineCount ? ` (${mineCount})` : ""}`]].map(([k, label]) => (
          <button key={k} onClick={() => setFScope(k)} style={chip(fScope === k)}>{label}</button>
        ))}
        <span style={{ width: 1, alignSelf: "stretch", background: C.border, margin: "0 4px" }} />
        {["All", ...PATTERNS].map(p => <button key={p} onClick={() => setFPattern(p)} style={chip(fPattern === p)}>{p}</button>)}
        <span style={{ width: 1, alignSelf: "stretch", background: C.border, margin: "0 4px" }} />
        {["All", "7", "6", "5"].map(t => <button key={t} onClick={() => setFTier(t)} style={chip(fTier === t)}>{t === "All" ? "Any grade" : `${t}★`}</button>)}
      </div>
      {fScope === "mine" && !isAdmin && (
        <div style={{ fontSize: "0.72rem", color: C.muted, margin: "-8px 0 16px" }}>🔒 Your personal model book — entries here are visible only to you. The ⭐ VIV Official book is curated by the team and is read-only.</div>
      )}

      {loading && <div style={{ color: C.muted, fontSize: "0.84rem", padding: "30px 0", textAlign: "center" }}>Loading the Model Book…</div>}
      {error === "setup" && <div style={{ color: C.muted, fontSize: "0.86rem", padding: "30px 0", textAlign: "center" }}>📖 The Model Book is being set up — check back shortly.</div>}
      {error && error !== "setup" && <div style={{ color: C.red, fontSize: "0.8rem", padding: "12px 0" }}>{error}</div>}
      {!loading && !error && visible.length === 0 && <div style={{ color: C.muted, fontSize: "0.86rem", padding: "30px 0", textAlign: "center" }}>No entries match this filter yet.</div>}

      {/* card grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
        {visible.map(r => {
          const eff = effectiveStars(r.stars, (r.elite || []).length);
          return (
            <div key={r.id} onClick={() => setDetail(r)} style={{ background: C.glass, border: `1px solid ${eff.n >= 6 ? "rgba(126,240,160,0.3)" : C.border}`, borderRadius: 16, overflow: "hidden", cursor: "pointer", transition: "transform .15s, border-color .15s" }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.borderColor = C.borderGold; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = eff.n >= 6 ? "rgba(126,240,160,0.3)" : C.border; }}>
              {r.after_img || r.before_img ? (
                <img src={r.after_img || r.before_img} alt={r.ticker} style={{ width: "100%", height: 160, objectFit: "cover", display: "block", borderBottom: `1px solid ${C.border}` }} />
              ) : (
                <div style={{ height: 160, display: "grid", placeItems: "center", color: C.muted, fontSize: "0.8rem", borderBottom: `1px solid ${C.border}` }}>chart pending</div>
              )}
              <div style={{ padding: "13px 15px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ fontWeight: 800, fontSize: "1.02rem", color: C.white }}>{r.ticker}</span>
                  <span style={{ fontSize: "0.62rem", fontWeight: 800, color: C.gold, background: C.goldDim, border: `1px solid ${C.borderGold}`, padding: "2px 9px", borderRadius: 99 }}>{r.pattern}</span>
                  {!r.is_published && <span style={{ fontSize: "0.58rem", fontWeight: 800, color: isAdmin ? C.muted : "#8ab4f8", border: `1px solid ${isAdmin ? C.border : "rgba(138,180,248,0.35)"}`, padding: "2px 8px", borderRadius: 99 }}>{isAdmin ? "DRAFT" : "🔒 PERSONAL"}</span>}
                  {r.is_published && <span title="Curated by the VIV team" style={{ fontSize: "0.58rem", fontWeight: 800, color: C.goldBright, background: C.goldDim, border: `1px solid ${C.borderGold}`, padding: "2px 8px", borderRadius: 99 }}>⭐ VIV</span>}
                  {r.outcome && <span style={{ fontSize: "0.58rem", fontWeight: 800, color: r.outcome === "Huge Winner" ? "#7ef0a0" : r.outcome === "Winner" ? C.green : r.outcome === "Loser" ? C.red : C.muted, border: `1px solid ${C.border}`, padding: "2px 8px", borderRadius: 99 }}>{r.outcome}</span>}
                  <span style={{ marginLeft: "auto", fontSize: "0.8rem", fontWeight: 800, color: (r.run_pct || 0) >= 0 ? C.green : C.red }}>{r.run_pct != null ? `${r.run_pct > 0 ? "+" : ""}${r.run_pct}%` : ""}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
                  <Stars C={C} n={eff.n} size="0.8rem" />
                  <span style={{ fontSize: "0.68rem", fontWeight: 800, color: eff.n >= 6 ? "#7ef0a0" : C.muted }}>{eff.label}</span>
                  <span style={{ marginLeft: "auto", fontSize: "0.66rem", color: C.muted }}>{r.days_held != null ? `${r.days_held}d` : ""}{r.r_mult != null ? ` · ${r.r_mult}R` : ""}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* detail overlay */}
      {detail && (() => {
        const r = detail, eff = effectiveStars(r.stars, (r.elite || []).length);
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
              {/* BEFORE | AFTER — always left/right, clearly compared */}
              <div style={{ display: "grid", gridTemplateColumns: window.innerWidth < 700 ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, marginBottom: 7 }}>◀ Before — the setup <span style={{ color: C.muted, textTransform: "none", letterSpacing: 0 }}>· click to zoom</span></div>
                  {r.before_img ? <img src={r.before_img} alt="before" onClick={() => setZoom({ imgs: { before: r.before_img, after: r.after_img }, slot: "before" })} style={{ width: "100%", borderRadius: 12, border: `1px solid ${C.borderGold}`, cursor: "zoom-in" }} /> : <div style={{ height: 180, display: "grid", placeItems: "center", color: C.muted, fontSize: "0.76rem", border: `1px dashed ${C.border}`, borderRadius: 12 }}>before chart pending</div>}
                </div>
                <div>
                  <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.green, marginBottom: 7 }}>After — the outcome ▶ <span style={{ color: C.muted, textTransform: "none", letterSpacing: 0 }}>· click to zoom</span></div>
                  {r.after_img ? <img src={r.after_img} alt="after" onClick={() => setZoom({ imgs: { before: r.before_img, after: r.after_img }, slot: "after" })} style={{ width: "100%", borderRadius: 12, border: "1px solid rgba(34,197,94,0.35)", cursor: "zoom-in" }} /> : <div style={{ height: 180, display: "grid", placeItems: "center", color: C.muted, fontSize: "0.76rem", border: `1px dashed ${C.border}`, borderRadius: 12 }}>after chart pending</div>}
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
              {(isAdmin || r.created_by === uid) && (
                <div style={{ display: "flex", gap: 10, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                  <button onClick={() => { setEditing(r); setDetail(null); }} style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, color: C.goldBright, fontFamily: font, fontWeight: 700, fontSize: "0.74rem", padding: "8px 16px", borderRadius: 99, cursor: "pointer" }}>Edit</button>
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
