import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { listSetups, deleteSetup, markTaken } from "./dailySetups.js";
import { SECTIONS } from "./SetupGrader.jsx";
import { themeFit } from "./themes.js";

// ══════════════════════════════════════════════════════════════════
// DAILY SETUPS — the members' daily-idea feed. Valen grades a chart in the
// Setup Grader and publishes; it lands here: chart + annotation + the exact
// grader scorecard (auditable — every star traces to its ticks; gold dot ● =
// auto-read from the chart). Read-only for members; admin can remove posts.
// ══════════════════════════════════════════════════════════════════

const Stars = ({ C, n, size = "1.05rem" }) => (
  <span style={{ letterSpacing: 2, fontSize: size, whiteSpace: "nowrap" }}>
    {[0, 1, 2, 3, 4].map(k => (
      <span key={k} style={{ color: k < n ? C.goldBright : "rgba(255,255,255,0.16)", textShadow: k < n ? "0 0 10px rgba(240,192,80,0.45)" : "none" }}>★</span>
    ))}
  </span>
);

const letterColor = (C, l) => l === "A+" ? C.green : l === "A" ? C.goldBright : l === "B" ? C.muted : C.red;

function dateLabel(iso) {
  if (!iso) return "Undated";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return String(iso); // new Date() doesn't throw — it yields Invalid Date
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

export default function DailySetupsTab({ C, font, session, isAdmin, setPage }) {
  const [rows, setRows] = useState(null); // null = loading
  const [tableMissing, setTableMissing] = useState(false);
  const [openId, setOpenId] = useState(null);   // expanded scorecard
  const [lightbox, setLightbox] = useState(null); // chart url
  const [sortBy, setSortBy] = useState("date");   // "date" | "grade"
  const [view, setView] = useState("all");        // "all" | "taken"

  const load = useCallback(async () => {
    const { rows: r, tableMissing: tm } = await listSetups();
    setRows(r); setTableMissing(tm);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const remove = async (r) => {
    if (!window.confirm(`Remove ${r.ticker} (${r.trade_date}) from the feed?`)) return;
    await deleteSetup(r.id); load();
  };
  const takenToggle = async (r) => {
    const res = await markTaken(r.id, !r.taken_at);
    if (!res.ok) window.alert(res.error);
    load();
  };

  // filter (All / Taken) then group: by date (default) or one ranked list (Top graded)
  const visRows = (rows || []).filter(r => view !== "taken" || r.taken_at);
  const groups = [];
  if (sortBy === "grade") {
    const ranked = [...visRows].sort((a, b) => (b.stars - a.stars) || ((b.pct || 0) - (a.pct || 0)) ||
      String(b.trade_date || "").localeCompare(String(a.trade_date || "")));
    if (ranked.length) groups.push({ date: "__ranked__", label: "Ranked by grade", items: ranked });
  } else {
    visRows.forEach(r => {
      const g = groups[groups.length - 1];
      if (g && g.date === r.trade_date) g.items.push(r);
      else groups.push({ date: r.trade_date, label: dateLabel(r.trade_date), items: [r] });
    });
  }

  return (
    <div id="panel-daily" style={{ fontFamily: font }}>
      {/* intro — inline-styled (self-contained: renders identically in any page CSS scope) */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px", marginBottom: 18 }}>
        <div style={{ flex: "0 0 40px", width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: "rgba(201,152,42,0.1)", border: `1px solid ${C.borderGold}`, color: C.gold }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "1rem", fontWeight: 800, color: C.white, marginBottom: 4 }}>Daily Setups</div>
          <p style={{ margin: 0, fontSize: "0.82rem", color: C.muted, lineHeight: 1.55 }}>The setups on VIV's radar, posted fresh each day — the chart, the read, and the <b style={{ color: C.text }}>full Setup-Grader scorecard</b> behind the stars. Click <b style={{ color: C.gold }}>See the scorecard</b> on any post to see exactly which criteria passed — every grade is auditable, nothing is hand-waved. A gold dot <span style={{ color: C.goldBright }}>●</span> marks a tick that was auto-read off the chart. <b style={{ color: C.text }}>Educational, not trade signals</b> — the entry, the stop, and the decision are always yours.</p>
        </div>
      </div>

      {rows && rows.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          {[["date", "Newest"], ["grade", "Top graded"]].map(([k, lbl]) => (
            <button key={k} onClick={() => setSortBy(k)}
              style={{ background: sortBy === k ? "rgba(201,152,42,0.14)" : "rgba(255,255,255,0.04)", color: sortBy === k ? C.goldBright : C.muted, border: `1px solid ${sortBy === k ? C.borderGold : C.border}`, fontFamily: font, fontSize: "0.7rem", fontWeight: 800, padding: "6px 14px", borderRadius: 99, cursor: "pointer" }}>{lbl}</button>
          ))}
          <span style={{ width: 1, height: 18, background: C.border }} />
          {[["all", "All"], ["taken", "✔ Taken"]].map(([k, lbl]) => (
            <button key={k} onClick={() => setView(k)}
              style={{ background: view === k ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)", color: view === k ? "#22c55e" : C.muted, border: `1px solid ${view === k ? "rgba(34,197,94,0.35)" : C.border}`, fontFamily: font, fontSize: "0.7rem", fontWeight: 800, padding: "6px 14px", borderRadius: 99, cursor: "pointer" }}>{lbl}</button>
          ))}
        </div>
      )}

      {isAdmin && tableMissing && (
        <div style={{ background: "rgba(201,152,42,0.07)", border: `1px solid ${C.borderGold}`, borderRadius: 12, padding: "10px 14px", fontSize: "0.78rem", color: C.gold, marginBottom: 16 }}>
          Table not found — run <b>supabase/daily-setups.sql</b> once in the Supabase SQL editor. Anything you publish meanwhile parks in this browser and shows below with a LOCAL badge.
        </div>
      )}

      {rows === null ? (
        <div style={{ color: C.muted, fontSize: "0.84rem", padding: "30px 8px" }}>Loading the feed…</div>
      ) : rows.length === 0 ? (
        <div style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 16, padding: "34px 20px", textAlign: "center", color: C.muted, fontSize: "0.86rem" }}>
          No setups published yet — the first daily post lands here.
        </div>
      ) : groups.length === 0 ? (
        <div style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 16, padding: "30px 20px", textAlign: "center", color: C.muted, fontSize: "0.85rem" }}>
          No taken setups yet — ✔ Mark taken on a post when the trade is executed.
        </div>
      ) : groups.map((g, gi) => (
        <div key={g.date + "-" + gi} style={{ marginBottom: 26 }}>
          <div style={{ fontSize: "0.64rem", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold, margin: "0 2px 10px" }}>{g.label}</div>
          {g.items.map(r => {
            const expanded = openId === r.id;
            const autoSet = new Set(r.auto || []);
            const tickedSet = new Set(r.ticked || []);
            // in/off-theme vs the weekly DeepVue tracker AT THE POST'S DATE (same rule as position tagging)
            const fit = themeFit(r.sector, r.trade_date);
            const fitCol = fit === "in" ? "#22c55e" : fit === "off" ? "#ef4444" : null;
            return (
              <div key={r.id} style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {/* chart thumb */}
                  {r.chart_img && (
                    <img src={r.chart_img} alt={`${r.ticker} chart`} onClick={() => setLightbox(r.chart_img)}
                      style={{ flex: "0 0 240px", width: 240, height: 135, objectFit: "cover", borderRadius: 12, border: `1px solid ${C.border}`, cursor: "zoom-in" }} />
                  )}
                  {/* headline */}
                  <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <span style={{ fontSize: "1.3rem", fontWeight: 800, color: C.white }}>{r.ticker}</span>
                      {r.setup_type && (
                        <span style={{ fontSize: "0.66rem", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#3b82f6", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.35)", padding: "3px 10px", borderRadius: 99 }}>{r.setup_type}</span>
                      )}
                      {r.sector && (
                        <span title={fit ? (fit === "in" ? "Sector is top-5 (1W or 1M) on the theme tracker at this date — flowing WITH the trend" : "Sector is NOT top-5 on the theme tracker at this date — fighting the rotation") : "No theme snapshot covers this date"}
                          style={{ fontSize: "0.7rem", fontWeight: 700, color: fitCol || C.muted, background: fit === "in" ? "rgba(34,197,94,0.1)" : fit === "off" ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.05)", border: `1px solid ${fitCol ? (fit === "in" ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)") : C.border}`, padding: "3px 10px", borderRadius: 99 }}>
                          {r.sector}{fit ? (fit === "in" ? " · in theme" : " · off theme") : ""}
                        </span>
                      )}
                      <Stars C={C} n={r.stars} />
                      <span style={{ fontSize: "0.92rem", fontWeight: 800, color: letterColor(C, r.letter) }}>{r.letter}</span>
                      {r.taken_at && <span title={"Executed " + String(r.taken_at).slice(0, 10) + " — this gameplan became a live trade"} style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.08em", color: "#22c55e", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.4)", padding: "3px 8px", borderRadius: 99 }}>✔ TAKEN</span>}
                      {r._local && <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.08em", color: C.gold, background: "rgba(201,152,42,0.12)", border: `1px solid ${C.borderGold}`, padding: "3px 8px", borderRadius: 99 }}>LOCAL</span>}
                      {isAdmin && (
                        <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
                          <button title={r.taken_at ? "Unmark — removes the executed flag" : "Mark as executed — syncs the gameplan to your live trade for the Friday review"}
                            onClick={() => takenToggle(r)}
                            style={{ background: r.taken_at ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.05)", border: `1px solid ${r.taken_at ? "rgba(34,197,94,0.4)" : C.border}`, color: r.taken_at ? "#22c55e" : C.muted, fontFamily: font, fontSize: "0.66rem", fontWeight: 800, padding: "4px 11px", borderRadius: 99, cursor: "pointer" }}>
                            {r.taken_at ? "✔ Taken" : "Mark taken"}</button>
                          <button title="Edit in the Setup Grader — republish replaces this post"
                            onClick={() => {
                              try {
                                sessionStorage.setItem("viv-ds-edit", JSON.stringify({
                                  ticker: r.ticker, trade_date: r.trade_date, ticked: r.ticked || [],
                                  auto: r.auto || [], note: r.note || "", chart_img: r.chart_img || "",
                                }));
                              } catch {}
                              setPage && setPage("tools");
                            }}
                            style={{ background: "rgba(201,152,42,0.1)", border: `1px solid ${C.borderGold}`, color: C.gold, fontFamily: font, fontSize: "0.66rem", fontWeight: 800, padding: "4px 11px", borderRadius: 99, cursor: "pointer" }}>✎ Edit</button>
                          <button onClick={() => remove(r)} title="Remove post" style={{ background: "transparent", border: "none", color: C.muted, fontSize: "1rem", cursor: "pointer", lineHeight: 1 }}>×</button>
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.74rem", color: C.muted, marginTop: 5 }}>
                      {r.pct != null ? `${Math.round(r.pct * 100)}% of criteria` : ""}{r.star_hit != null ? ` · ${r.star_hit}/${r.starmakers} ★-makers` : ""}
                    </div>
                    {r.note && <div style={{ fontSize: "0.86rem", color: C.text, lineHeight: 1.55, marginTop: 9 }}>{r.note}</div>}
                    <button onClick={() => setOpenId(expanded ? null : r.id)}
                      style={{ marginTop: 11, background: "rgba(201,152,42,0.08)", color: C.gold, border: `1px solid ${C.borderGold}`, fontFamily: font, fontSize: "0.7rem", fontWeight: 800, padding: "6px 13px", borderRadius: 99, cursor: "pointer" }}>
                      {expanded ? "Hide the scorecard ▴" : "See the scorecard ▾"}
                    </button>
                  </div>
                </div>

                {/* auditable scorecard: all 16 ticks flat, no subheaders (Valen's spec) */}
                {expanded && (
                  <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "3px 22px" }}>
                    {SECTIONS.flatMap((sec, si) => sec.reminder ? [] : sec.items.map((it, ii) => {
                      const k = si + "-" + ii, isOn = tickedSet.has(k);
                      return (
                        <div key={k} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "3px 0", fontSize: "0.8rem", lineHeight: 1.4, minWidth: 0 }}>
                          <span style={{ flex: "0 0 auto", fontWeight: 800, color: isOn ? C.green : "rgba(255,255,255,0.22)" }}>{isOn ? "✓" : "✗"}</span>
                          <span style={{ color: isOn ? C.text : "rgba(255,255,255,0.35)", minWidth: 0 }}>
                            {it.c}
                            {it.star && <span title="★-maker (confluence factor)" style={{ marginLeft: 6, fontSize: "0.62rem", color: isOn ? C.goldMid : "rgba(255,255,255,0.2)" }}>★</span>}
                            {isOn && autoSet.has(k) && <span title="Auto-read from the chart by VIV" style={{ marginLeft: 6, fontSize: "0.56rem", color: C.goldBright }}>●</span>}
                          </span>
                        </div>
                      );
                    }))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* lightbox — PORTALED to body: an ancestor with transform/filter/backdrop-filter re-anchors
          position:fixed and crops the chart (member-seen on RKLB). Body-level = true fullscreen. */}
      {lightbox && createPortal(
        <div onClick={() => setLightbox(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1500, background: "rgba(4,4,8,0.94)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out", padding: 24 }}>
          <img src={lightbox} alt="chart"
            style={{ maxWidth: "min(96vw, 1900px)", maxHeight: "92vh", width: "auto", height: "auto", objectFit: "contain", display: "block", borderRadius: 14, border: `1px solid ${C.borderGold}`, boxShadow: "0 30px 80px rgba(0,0,0,0.7)" }} />
          <div style={{ position: "fixed", top: 18, right: 26, color: "rgba(255,255,255,0.7)", fontSize: "0.8rem", fontFamily: font }}>Esc / click to close</div>
        </div>,
        document.body
      )}
    </div>
  );
}
