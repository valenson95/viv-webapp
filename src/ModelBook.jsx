import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";
import { getGrade } from "./grades.js";

// ══════════════════════════════════════════════════════════════════
// VIV MODEL BOOK — curated database of the best winning setups, for
// pattern-recognition study. Each entry = before/after charts + the full
// setup-grade scorecard + the ELITE-factor layer that separates a
// "7-star trade on a 5-star scale" from an ordinary 4★ setup.
// Admin curates; members study PUBLISHED entries. Run supabase/modelbook.sql.
// ══════════════════════════════════════════════════════════════════

export const PATTERNS = ["Breakout", "EP", "Pullback", "U&R", "HTF", "Parabolic"];

// The elite layer — confluences that upgrade a maxed 5★ into a 6★/7★.
// Grounded in the VIV screening method (tightness, volume signature, leadership, R-math).
export const ELITE = [
  { k: "dead-volume",  c: "Volume completely dead at the apex",      s: "Not just lower — flat-lined. Sellers are gone." },
  { k: "inside-days",  c: "Extreme tightness — inside/NR days cluster", s: "Final days trade well under ½ the normal daily range." },
  { k: "ema-pinch",    c: "9/21/50 EMAs converged under price",       s: "All the moving averages pinch into one coiled line." },
  { k: "tiny-stop",    c: "Stop under ½ ADR → 15–20R math",           s: "The trigger bar structure allows an unusually tight stop." },
  { k: "the-leader",   c: "THE leader of the #1 theme",               s: "Not a follower in a hot group — the name defining it." },
  { k: "fresh-base",   c: "1st or 2nd base — fresh cycle",            s: "Early in its run, not a late-stage 4th base." },
  { k: "catalyst",     c: "Real catalyst under the base (EP layer)",  s: "Earnings/news power confirms the technical setup." },
  { k: "linear-move",  c: "Linear, clean prior advance",              s: "The run-up was orderly (30–45°+), not wild and overlapping." },
  { k: "tennis-ball",  c: "Tennis-ball action on market dips",       s: "It fell least and snapped back first when the market pulled back." },
  { k: "regime",       c: "Full regime tailwind",                     s: "Market trend up, breadth expanding, leaders working everywhere." },
];

// base stars (0-5) + elite count → the "N★ on a 5★ scale" label
export function effectiveStars(stars, eliteCount) {
  if (stars >= 5 && eliteCount >= 6) return { n: 7, label: "7★ · Generational" };
  if (stars >= 5 && eliteCount >= 3) return { n: 6, label: "6★ · Elite" };
  return { n: Math.max(0, Math.min(5, stars)), label: `${Math.max(0, Math.min(5, stars))}★` };
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
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null); // null | {} (new) | row (edit)
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error } = await supabase.from("model_book").select("*").order("created_at", { ascending: false });
    if (error) setError(/relation|does not exist|schema cache|not find/i.test(String(error.message)) ? "setup" : String(error.message));
    else setRows(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const visible = rows.filter(r => {
    if (fPattern !== "All" && r.pattern !== fPattern) return false;
    const eff = effectiveStars(r.stars, (r.elite || []).length).n;
    if (fTier !== "All" && eff !== +fTier) return false;
    return true;
  });

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
      created_by: uid, ticker: (row.ticker || "").toUpperCase().trim(), pattern: row.pattern || "Breakout",
      theme: row.theme || null, entry_date: row.entry_date || null, exit_date: row.exit_date || null,
      before_img: row.before_img || null, after_img: row.after_img || null,
      stars: +row.stars || 0, elite: row.elite || [], ticked: row.ticked || [],
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
    const [row, setRow] = useState(() => ({
      ticker: "", pattern: "Breakout", theme: "", entry_date: "", exit_date: "", before_img: "", after_img: "",
      stars: 5, elite: [], ticked: [], run_pct: "", run_up_pct: "", angle: "", characteristics: [],
      days_held: "", r_mult: "", thesis: "", lesson: "", is_published: false,
      ...(initial || {}),
    }));
    const eff = effectiveStars(+row.stars || 0, (row.elite || []).length);
    const toggleElite = (k) => setRow(r => ({ ...r, elite: r.elite.includes(k) ? r.elite.filter(x => x !== k) : [...r.elite, k] }));
    const pullGrade = () => {
      const g = getGrade(row.ticker);
      if (g) setRow(r => ({ ...r, stars: g.stars, ticked: g.ticked || [] }));
    };
    return (
      <div style={{ fontFamily: font, background: C.glass, border: `1px solid ${C.borderGold}`, borderRadius: 18, padding: "20px 22px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 800, color: C.white }}>{row.id ? `Edit ${row.ticker}` : "Add to the Model Book"}</div>
          <div style={{ marginLeft: "auto" }}><Stars C={C} n={eff.n} /></div>
          <span style={{ fontSize: "0.78rem", fontWeight: 800, color: eff.n >= 6 ? "#7ef0a0" : C.goldBright }}>{eff.label}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
          <div><span style={lbl}>Ticker</span><input style={inputS} value={row.ticker} onChange={e => setRow(r => ({ ...r, ticker: e.target.value.toUpperCase() }))} placeholder="NVDA" /></div>
          <div><span style={lbl}>Pattern</span><select style={{ ...inputS, cursor: "pointer" }} value={row.pattern} onChange={e => setRow(r => ({ ...r, pattern: e.target.value }))}>{PATTERNS.map(p => <option key={p}>{p}</option>)}</select></div>
          <div><span style={lbl}>Theme</span><input style={inputS} value={row.theme || ""} onChange={e => setRow(r => ({ ...r, theme: e.target.value }))} placeholder="Semiconductors" /></div>
          <div><span style={lbl}>Entry date</span><input type="date" style={inputS} value={row.entry_date || ""} onChange={e => setRow(r => ({ ...r, entry_date: e.target.value }))} /></div>
          <div><span style={lbl}>Exit date</span><input type="date" style={inputS} value={row.exit_date || ""} onChange={e => setRow(r => ({ ...r, exit_date: e.target.value }))} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 14 }}>
          <div><span style={lbl}>Rally % (result)</span><input style={inputS} value={row.run_pct ?? ""} onChange={e => setRow(r => ({ ...r, run_pct: e.target.value }))} placeholder="+38" /></div>
          <div><span style={lbl}>Run-up % (the pole)</span><input style={inputS} value={row.run_up_pct ?? ""} onChange={e => setRow(r => ({ ...r, run_up_pct: e.target.value }))} placeholder="+31" /></div>
          <div><span style={lbl}>Slope ° (info-line)</span><input style={inputS} value={row.angle ?? ""} onChange={e => setRow(r => ({ ...r, angle: e.target.value }))} placeholder="62.5" /></div>
          <div><span style={lbl}>Days held</span><input style={inputS} value={row.days_held ?? ""} onChange={e => setRow(r => ({ ...r, days_held: e.target.value }))} placeholder="12" /></div>
          <div><span style={lbl}>R multiple</span><input style={inputS} value={row.r_mult ?? ""} onChange={e => setRow(r => ({ ...r, r_mult: e.target.value }))} placeholder="8.5" /></div>
          <div><span style={lbl}>Base grade (0–5★)</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select style={{ ...inputS, cursor: "pointer" }} value={row.stars} onChange={e => setRow(r => ({ ...r, stars: +e.target.value }))}>{[5, 4, 3, 2, 1, 0].map(n => <option key={n} value={n}>{n}★</option>)}</select>
              <button onClick={pullGrade} title="Pull this ticker's saved Setup Grader score" style={{ ...chip(false), whiteSpace: "nowrap" }}>Pull grade</button>
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <span style={lbl}>Objective characteristics (comma-separated — measurable traits only)</span>
          <input style={inputS} value={Array.isArray(row.characteristics) ? row.characteristics.join(", ") : (row.characteristics || "")}
            onChange={e => setRow(r => ({ ...r, characteristics: e.target.value }))}
            placeholder="3 tight days, ADR 6.1%, vol dry-up −60%, EMA9>21>50, RS 96" />
        </div>
        <span style={lbl}>Elite factors — the 6★/7★ layer (tick what was TRUE at entry)</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 6, marginBottom: 14 }}>
          {ELITE.map(f => {
            const on = row.elite.includes(f.k);
            return (
              <div key={f.k} onClick={() => toggleElite(f.k)} style={{ display: "flex", gap: 10, padding: "8px 11px", borderRadius: 10, cursor: "pointer", background: on ? "rgba(126,240,160,0.07)" : "rgba(255,255,255,0.02)", border: `1px solid ${on ? "rgba(126,240,160,0.35)" : C.border}` }}>
                <span style={{ color: on ? "#7ef0a0" : "rgba(255,255,255,0.25)", fontWeight: 800 }}>{on ? "✓" : "○"}</span>
                <div><div style={{ fontSize: "0.8rem", fontWeight: 700, color: on ? "#7ef0a0" : C.text }}>{f.c}</div><div style={{ fontSize: "0.7rem", color: C.muted }}>{f.s}</div></div>
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
          <div><span style={lbl}>The thesis (why it was A+ BEFORE the move)</span><textarea rows={3} style={{ ...inputS, resize: "vertical" }} value={row.thesis || ""} onChange={e => setRow(r => ({ ...r, thesis: e.target.value }))} /></div>
          <div><span style={lbl}>The lesson (what to internalize)</span><textarea rows={3} style={{ ...inputS, resize: "vertical" }} value={row.lesson || ""} onChange={e => setRow(r => ({ ...r, lesson: e.target.value }))} /></div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button disabled={busy || !row.ticker} onClick={() => save(row)} style={{ background: `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})`, color: "#08080e", border: "none", fontFamily: font, fontWeight: 800, fontSize: "0.82rem", padding: "11px 24px", borderRadius: 99, cursor: "pointer", opacity: busy || !row.ticker ? 0.6 : 1 }}>{busy ? "Saving…" : row.id ? "Save changes" : "Add entry"}</button>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: "0.78rem", color: row.is_published ? C.green : C.muted, cursor: "pointer", fontFamily: font, fontWeight: 700 }}>
            <input type="checkbox" checked={!!row.is_published} onChange={e => setRow(r => ({ ...r, is_published: e.target.checked }))} /> Published to members
          </label>
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
          onMouseEnter={guideEnter ? guideEnter("modelbook", "Model Book", "A curated library of the best real setups — study the before chart, the exact factors that made it elite, then the outcome. Pattern recognition is built by reps: same patterns, hundreds of examples.", undefined) : undefined}
          onMouseLeave={guideLeave ? guideLeave("modelbook") : undefined}>Model Book</h2>
        <span style={{ fontSize: "0.74rem", color: C.muted }}>study the best — before → factors → after</span>
        {isAdmin && !editing && <button onClick={() => setEditing({})} style={{ marginLeft: "auto", background: `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})`, color: "#08080e", border: "none", fontFamily: font, fontWeight: 800, fontSize: "0.78rem", padding: "10px 20px", borderRadius: 99, cursor: "pointer" }}>+ Add entry</button>}
      </div>

      {editing !== null && isAdmin && <Editor initial={editing.id ? editing : null} />}

      {/* filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "6px 0 18px" }}>
        {["All", ...PATTERNS].map(p => <button key={p} onClick={() => setFPattern(p)} style={chip(fPattern === p)}>{p}</button>)}
        <span style={{ width: 1, background: C.border, margin: "0 4px" }} />
        {["All", "7", "6", "5"].map(t => <button key={t} onClick={() => setFTier(t)} style={chip(fTier === t)}>{t === "All" ? "Any grade" : `${t}★`}</button>)}
      </div>

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
                  {!r.is_published && isAdmin && <span style={{ fontSize: "0.58rem", fontWeight: 800, color: C.muted, border: `1px solid ${C.border}`, padding: "2px 8px", borderRadius: 99 }}>DRAFT</span>}
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
                  <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, marginBottom: 7 }}>◀ Before — the setup</div>
                  {r.before_img ? <img src={r.before_img} alt="before" style={{ width: "100%", borderRadius: 12, border: `1px solid ${C.borderGold}` }} /> : <div style={{ height: 180, display: "grid", placeItems: "center", color: C.muted, fontSize: "0.76rem", border: `1px dashed ${C.border}`, borderRadius: 12 }}>before chart pending</div>}
                </div>
                <div>
                  <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.green, marginBottom: 7 }}>After — the outcome ▶</div>
                  {r.after_img ? <img src={r.after_img} alt="after" style={{ width: "100%", borderRadius: 12, border: "1px solid rgba(34,197,94,0.35)" }} /> : <div style={{ height: 180, display: "grid", placeItems: "center", color: C.muted, fontSize: "0.76rem", border: `1px dashed ${C.border}`, borderRadius: 12 }}>after chart pending</div>}
                </div>
              </div>
              {/* Objective metric strip */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {[["Rally", r.run_pct != null ? `${r.run_pct > 0 ? "+" : ""}${r.run_pct}%` : null, C.green],
                  ["Run-up (pole)", r.run_up_pct != null ? `+${r.run_up_pct}%` : null, C.goldBright],
                  ["Slope", r.angle != null ? `${r.angle}°` : null, C.goldBright],
                  ["Held", r.days_held != null ? `${r.days_held}d` : null, C.text],
                  ["R", r.r_mult != null ? `${r.r_mult}R` : null, C.green]]
                  .filter(([, v]) => v != null)
                  .map(([k, v, col]) => (
                    <span key={k} style={{ display: "inline-flex", gap: 7, alignItems: "baseline", padding: "6px 13px", borderRadius: 10, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}` }}>
                      <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>{k}</span>
                      <span style={{ fontSize: "0.9rem", fontWeight: 800, color: col }}>{v}</span>
                    </span>
                  ))}
              </div>
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
                  <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#7ef0a0", marginBottom: 8 }}>Elite factors present ({(r.elite || []).length}/10)</div>
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
              {isAdmin && (
                <div style={{ display: "flex", gap: 10, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
                  <button onClick={() => { setEditing(r); setDetail(null); }} style={{ background: C.goldDim, border: `1px solid ${C.borderGold}`, color: C.goldBright, fontFamily: font, fontWeight: 700, fontSize: "0.74rem", padding: "8px 16px", borderRadius: 99, cursor: "pointer" }}>Edit</button>
                  <button onClick={() => remove(r)} style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.red, fontFamily: font, fontWeight: 700, fontSize: "0.74rem", padding: "8px 16px", borderRadius: 99, cursor: "pointer" }}>Delete</button>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
