import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import TradeReplayChart from "./TradeReplayChart.jsx";

// ══════════════════════════════════════════════════════════════════
// MENTOR MODE — ADMIN-ONLY PREVIEW (members never see this page).
// Mentor↔mentee workflow: roster of members with headline performance,
// drill into any member (stats · trades · replay chart), annotate a
// specific trade or the member overall. Notes stay hidden from members
// (visible_to_member=false) until mentorship officially launches.
// Requires supabase/mentor.sql (admin read-all on trades + mentor_notes).
// ══════════════════════════════════════════════════════════════════

const fmt$ = (v) => (v < 0 ? "-" : "+") + "$" + Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 });

function aggStats(trades) {
  const closed = trades.filter(t => t.exit_date);
  const n = closed.length;
  const wins = closed.filter(t => (Number(t.pl_pct) || 0) > 0);
  const net = closed.reduce((s, t) => s + (Number(t.pl_dollar) || 0), 0);
  const rr = closed.filter(t => t.r_mult != null);
  const avgR = rr.length ? rr.reduce((s, t) => s + Number(t.r_mult), 0) / rr.length : null;
  const avgWin = wins.length ? wins.reduce((s, t) => s + Number(t.pl_pct), 0) / wins.length : 0;
  const losses = closed.filter(t => (Number(t.pl_pct) || 0) <= 0);
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + Number(t.pl_pct), 0) / losses.length) : 0;
  // current streak (by exit date, most recent first)
  const sorted = [...closed].sort((a, b) => String(b.exit_date).localeCompare(String(a.exit_date)));
  let streak = 0;
  for (const t of sorted) { const w = (Number(t.pl_pct) || 0) > 0; if (streak === 0) streak = w ? 1 : -1; else if (w === streak > 0) streak += w ? 1 : -1; else break; }
  const last = sorted[0]?.exit_date || null;
  return { n, winPct: n ? Math.round(100 * wins.length / n) : 0, net, avgR, avgWin, avgLoss, streak, last };
}

export default function MentorModePage({ C, font, session }) {
  const uid = session?.user?.id;
  const [members, setMembers] = useState(null); // profiles
  const [trades, setTrades] = useState(null);   // ALL trades (admin RLS)
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState(null);
  const [sel, setSel] = useState(null);         // member id
  const [selTrade, setSelTrade] = useState(null);
  const [draft, setDraft] = useState("");
  const [visDraft, setVisDraft] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: prof, error: e1 }, { data: tr, error: e2 }, { data: nt }] = await Promise.all([
        supabase.from("profiles").select("id, email, display_name, created_at"),
        supabase.from("trades").select("id, user_id, ticker, entry_date, exit_date, entry_price, exit_price, shares, stop_price, pl_pct, pl_dollar, r_mult, setup, exit_reason, trade_type, entry_time, exit_time").order("exit_date", { ascending: false }).limit(3000),
        supabase.from("mentor_notes").select("*").order("created_at", { ascending: false }),
      ]);
      if (e1 || e2) { setError("setup"); return; } // mentor.sql not run yet
      setMembers(prof || []); setTrades(tr || []); setNotes(nt || []);
    })();
  }, []);

  const roster = useMemo(() => {
    if (!members || !trades) return [];
    return members.map(m => ({ ...m, stats: aggStats(trades.filter(t => t.user_id === m.id)) }))
      .sort((a, b) => b.stats.n - a.stats.n);
  }, [members, trades]);

  const member = roster.find(m => m.id === sel) || null;
  const mTrades = useMemo(() => (trades || []).filter(t => t.user_id === sel), [trades, sel]);
  const mNotes = notes.filter(n => n.member_id === sel);

  const addNote = async () => {
    if (!draft.trim() || !sel) return;
    setBusy(true);
    const body = { mentor_id: uid, member_id: sel, trade_id: selTrade ? String(selTrade.id) : null, body: draft.trim(), visible_to_member: visDraft };
    const { data, error } = await supabase.from("mentor_notes").insert(body).select().single();
    setBusy(false);
    if (error) { setError(String(error.message)); return; }
    setNotes(n => [data, ...n]); setDraft("");
  };
  const delNote = async (id) => { await supabase.from("mentor_notes").delete().eq("id", id); setNotes(n => n.filter(x => x.id !== id)); };

  const card = { background: C.glass, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 18px" };
  const tile = (label, val, col) => (
    <div key={label} style={{ ...card, padding: "12px 16px" }}>
      <div style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>{label}</div>
      <div style={{ fontSize: "1.15rem", fontWeight: 800, color: col || C.white, marginTop: 3 }}>{val}</div>
    </div>
  );

  if (error === "setup") return (
    <div style={{ fontFamily: font, textAlign: "center", padding: "60px 0", color: C.muted }}>
      🎓 Mentor Mode needs a one-time setup — run <b style={{ color: C.goldBright }}>supabase/mentor.sql</b> in the SQL Editor, then reload.
    </div>
  );

  // replay-chart shape from a raw trade row
  const replayShape = (t) => ({ ticker: t.ticker, entry: t.entry_date, exit: t.exit_date, entryP: t.entry_price, exitP: t.exit_price, stop: t.stop_price, shares: t.shares, plDollar: t.pl_dollar, plPct: t.pl_pct, rMult: t.r_mult, tradeType: t.trade_type || "Long", entryTime: t.entry_time, exitTime: t.exit_time, id: t.id });

  return (
    <div style={{ fontFamily: font }}>
      <div className="toolbar" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 className="sech">Mentor Mode</h2>
        <span style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.08em", color: "#8ab4f8", border: "1px solid rgba(138,180,248,0.35)", padding: "3px 10px", borderRadius: 99 }}>🔒 ADMIN PREVIEW — members can't see this</span>
        {sel && <button onClick={() => { setSel(null); setSelTrade(null); }} style={{ marginLeft: "auto", background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.muted, fontFamily: font, fontWeight: 700, fontSize: "0.76rem", padding: "9px 18px", borderRadius: 99, cursor: "pointer" }}>‹ All members</button>}
      </div>

      {!members && !error && <div style={{ color: C.muted, padding: "30px 0", textAlign: "center" }}>Loading roster…</div>}

      {/* ── ROSTER ── */}
      {members && !sel && (
        <div style={{ ...card, padding: 0, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
            <thead><tr style={{ textAlign: "left" }}>
              {["Member", "Trades", "Win rate", "Net P&L", "Avg R", "Streak", "Last trade", ""].map(h => <th key={h} style={{ padding: "12px 16px", fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, borderBottom: `1px solid ${C.border}` }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {roster.map(m => (
                <tr key={m.id} onClick={() => setSel(m.id)} style={{ cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.03)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding: "11px 16px", borderBottom: `1px solid rgba(255,255,255,0.05)` }}>
                    <b style={{ color: C.white }}>{m.display_name || m.email || m.id.slice(0, 8)}</b>
                    <div style={{ fontSize: "0.66rem", color: C.muted }}>{m.email}</div>
                  </td>
                  <td style={{ padding: "11px 16px", borderBottom: `1px solid rgba(255,255,255,0.05)` }}>{m.stats.n}</td>
                  <td style={{ padding: "11px 16px", borderBottom: `1px solid rgba(255,255,255,0.05)`, color: m.stats.winPct >= 50 ? C.green : C.red, fontWeight: 700 }}>{m.stats.n ? m.stats.winPct + "%" : "—"}</td>
                  <td style={{ padding: "11px 16px", borderBottom: `1px solid rgba(255,255,255,0.05)`, color: m.stats.net >= 0 ? C.green : C.red, fontWeight: 700 }}>{m.stats.n ? fmt$(m.stats.net) : "—"}</td>
                  <td style={{ padding: "11px 16px", borderBottom: `1px solid rgba(255,255,255,0.05)` }}>{m.stats.avgR != null ? m.stats.avgR.toFixed(2) + "R" : "—"}</td>
                  <td style={{ padding: "11px 16px", borderBottom: `1px solid rgba(255,255,255,0.05)`, color: m.stats.streak > 0 ? C.green : m.stats.streak < 0 ? C.red : C.muted, fontWeight: 700 }}>{m.stats.streak > 0 ? `W${m.stats.streak}` : m.stats.streak < 0 ? `L${-m.stats.streak}` : "—"}</td>
                  <td style={{ padding: "11px 16px", borderBottom: `1px solid rgba(255,255,255,0.05)`, color: C.muted }}>{m.stats.last || "—"}</td>
                  <td style={{ padding: "11px 16px", borderBottom: `1px solid rgba(255,255,255,0.05)`, color: C.goldBright }}>Review ›</td>
                </tr>
              ))}
              {roster.length === 0 && <tr><td colSpan={8} style={{ padding: 24, textAlign: "center", color: C.muted }}>No members yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MEMBER DRILL-IN ── */}
      {member && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
            {tile("Net P&L", member.stats.n ? fmt$(member.stats.net) : "—", member.stats.net >= 0 ? C.green : C.red)}
            {tile("Win rate", member.stats.winPct + "%", member.stats.winPct >= 50 ? C.green : C.red)}
            {tile("Avg R", member.stats.avgR != null ? member.stats.avgR.toFixed(2) + "R" : "—")}
            {tile("Avg win / loss", `+${member.stats.avgWin.toFixed(1)}% / −${member.stats.avgLoss.toFixed(1)}%`)}
            {tile("Trades", member.stats.n)}
            {tile("Streak", member.stats.streak > 0 ? `W${member.stats.streak}` : member.stats.streak < 0 ? `L${-member.stats.streak}` : "—", member.stats.streak > 0 ? C.green : C.red)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 340px", gap: 16, alignItems: "start" }}>
            <div>
              {/* trades table */}
              <div style={{ ...card, padding: 0, overflow: "auto", maxHeight: 340, marginBottom: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead><tr style={{ textAlign: "left" }}>{["Ticker", "Exit", "P&L", "%", "R", "Setup", ""].map(h => <th key={h} style={{ padding: "9px 13px", fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, borderBottom: `1px solid ${C.border}`, position: "sticky", top: 0, background: "#0c0c14" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {mTrades.slice(0, 100).map(t => {
                      const on = selTrade && selTrade.id === t.id;
                      return (
                        <tr key={t.id} onClick={() => setSelTrade(on ? null : t)} style={{ cursor: "pointer", background: on ? "rgba(240,192,80,0.07)" : "transparent" }}>
                          <td style={{ padding: "8px 13px", fontWeight: 800, color: C.white, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{t.ticker}</td>
                          <td style={{ padding: "8px 13px", color: C.muted, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{t.exit_date || "open"}</td>
                          <td style={{ padding: "8px 13px", fontWeight: 700, color: (Number(t.pl_dollar) || 0) >= 0 ? C.green : C.red, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{t.pl_dollar != null ? fmt$(Number(t.pl_dollar)) : "—"}</td>
                          <td style={{ padding: "8px 13px", color: (Number(t.pl_pct) || 0) >= 0 ? C.green : C.red, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{t.pl_pct != null ? Number(t.pl_pct).toFixed(1) + "%" : "—"}</td>
                          <td style={{ padding: "8px 13px", color: C.muted, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{t.r_mult != null ? Number(t.r_mult).toFixed(2) + "R" : "—"}</td>
                          <td style={{ padding: "8px 13px", color: C.muted, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{t.setup || "—"}</td>
                          <td style={{ padding: "8px 13px", color: C.goldBright, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>{on ? "▾ replay below" : "Replay ›"}</td>
                        </tr>
                      );
                    })}
                    {mTrades.length === 0 && <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: C.muted }}>No trades synced.</td></tr>}
                  </tbody>
                </table>
              </div>
              {/* replay + annotate the selected trade */}
              {selTrade && selTrade.exit_date && (
                <div style={{ ...card, marginBottom: 16 }}>
                  <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, marginBottom: 8 }}>Replay — {selTrade.ticker} · {selTrade.exit_date} <span style={{ color: C.muted, textTransform: "none", letterSpacing: 0 }}>· your note below attaches to THIS trade</span></div>
                  <TradeReplayChart trade={replayShape(selTrade)} C={C} font={font} />
                </div>
              )}
            </div>

            {/* notes column */}
            <div style={{ ...card, position: "sticky", top: 14 }}>
              <div style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, marginBottom: 8 }}>Mentor notes {selTrade ? `· on ${selTrade.ticker}` : "· on the member"}</div>
              <textarea rows={4} value={draft} onChange={e => setDraft(e.target.value)} placeholder={selTrade ? `Coaching note on the ${selTrade.ticker} trade…` : "Overall coaching note for this member…"}
                style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 10, color: C.white, fontFamily: font, fontSize: "0.82rem", padding: "9px 12px", outline: "none", resize: "vertical" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 14px" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: "0.72rem", color: visDraft ? C.green : C.muted, cursor: "pointer", fontWeight: 700 }}>
                  <input type="checkbox" checked={visDraft} onChange={e => setVisDraft(e.target.checked)} /> Visible to member
                </label>
                <button disabled={busy || !draft.trim()} onClick={addNote} style={{ marginLeft: "auto", background: `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})`, color: "#08080e", border: "none", fontFamily: font, fontWeight: 800, fontSize: "0.76rem", padding: "9px 18px", borderRadius: 99, cursor: "pointer", opacity: busy || !draft.trim() ? 0.5 : 1 }}>{busy ? "Saving…" : "Add note"}</button>
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                {mNotes.map(n => (
                  <div key={n.id} style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 12px" }}>
                    <div style={{ fontSize: "0.62rem", color: C.muted, display: "flex", gap: 8, marginBottom: 4, alignItems: "center" }}>
                      <span>{String(n.created_at).slice(0, 10)}</span>
                      {n.trade_id && <span style={{ color: C.goldBright }}>· trade #{String(n.trade_id).slice(0, 8)}</span>}
                      <span style={{ color: n.visible_to_member ? C.green : C.muted }}>{n.visible_to_member ? "· 👁 member-visible" : "· 🔒 private"}</span>
                      <button onClick={() => delNote(n.id)} style={{ marginLeft: "auto", background: "transparent", border: "none", color: C.red, cursor: "pointer", fontSize: "0.72rem" }}>✕</button>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{n.body}</div>
                  </div>
                ))}
                {mNotes.length === 0 && <div style={{ fontSize: "0.74rem", color: C.muted }}>No notes yet — select a trade to annotate its replay, or write an overall note.</div>}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
