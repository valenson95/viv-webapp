import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabaseClient";

// ══════════════════════════════════════════════════════════════════
// VIV Community Feedback — Skool/Facebook-style feed, VIV brand system
// (near-black + gold ramp, frosted glass, matte cards, pill chips).
// Members post feedback/suggestions, upvote, and comment; admin marks
// Resolved and replies (badged). Backed by Supabase (feedback /
// feedback_votes / feedback_comments) with RLS — run supabase/feedback.sql.
// ══════════════════════════════════════════════════════════════════

const CATEGORIES = ["Suggestion", "Bug", "Feature request", "Question"];

function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
const initials = (name) => (name || "M").trim().slice(0, 2).toUpperCase();

const FB_CSS = `
@keyframes vivfbFade{from{opacity:0}to{opacity:1}}
@keyframes vivfbUp{from{opacity:0;transform:translateY(18px) scale(0.99)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes vivfbPulse{0%,100%{box-shadow:0 0 0 0 rgba(240,192,80,0.55)}70%{box-shadow:0 0 0 6px rgba(240,192,80,0)}}
.vivfb-back{animation:vivfbFade .2s ease}
.vivfb-modal{animation:vivfbUp .3s cubic-bezier(0.22,1,0.36,1)}
.vivfb-dot{animation:vivfbPulse 2.2s infinite}
.vivfb-in::placeholder{color:rgba(255,255,255,0.38)}
.vivfb-in:focus{border-color:rgba(201,152,42,0.55) !important; box-shadow:0 0 0 3px rgba(201,152,42,0.12)}
.vivfb-card{transition:border-color .16s, box-shadow .16s}
.vivfb-card:hover{border-color:rgba(201,152,42,0.26)}
.vivfb-fab{transition:transform .14s, box-shadow .2s}
.vivfb-fab:hover{transform:translateY(-2px); box-shadow:0 16px 40px rgba(201,152,42,0.5)}
.vivfb-feed::-webkit-scrollbar{width:8px}
.vivfb-feed::-webkit-scrollbar-thumb{background:rgba(201,152,42,0.22); border-radius:99px}
`;

export default function FeedbackWidget({ session, isAdmin, displayName, C, font, isMobile }) {
  const uid = session?.user?.id;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all"); // all | open | resolved
  const [draft, setDraft] = useState("");
  const [cat, setCat] = useState("Suggestion");
  const [busy, setBusy] = useState(false);
  const [commentDraft, setCommentDraft] = useState({});
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async (silent) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [fb, votes, comments] = await Promise.all([
        supabase.from("feedback").select("*").order("created_at", { ascending: false }),
        supabase.from("feedback_votes").select("feedback_id,user_id"),
        supabase.from("feedback_comments").select("*").order("created_at", { ascending: true }),
      ]);
      if (fb.error) throw fb.error;
      const vc = {}, mine = new Set();
      (votes.data || []).forEach(v => { vc[v.feedback_id] = (vc[v.feedback_id] || 0) + 1; if (v.user_id === uid) mine.add(v.feedback_id); });
      const cm = {};
      (comments.data || []).forEach(c => { (cm[c.feedback_id] = cm[c.feedback_id] || []).push(c); });
      setItems((fb.data || []).map(f => ({ ...f, votes: vc[f.id] || 0, myVote: mine.has(f.id), comments: cm[f.id] || [] })));
    } catch (err) {
      const msg = String(err?.message || err);
      setError(/relation|does not exist|schema cache|not find/i.test(msg) ? "setup" : msg);
    }
    if (!silent) setLoading(false);
  }, [uid]);

  // Load on open + poll every 12s while open so other members' posts/votes/comments sync in live.
  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(() => load(true), 12000);
    return () => clearInterval(id);
  }, [open, load]);

  const post = async () => {
    const body = draft.trim(); if (!body || busy) return;
    setBusy(true);
    const { error } = await supabase.from("feedback").insert({ user_id: uid, author_name: displayName || "Member", category: cat, body });
    setBusy(false);
    if (!error) { setDraft(""); load(true); } else setError(String(error.message));
  };
  const toggleVote = async (f) => {
    const res = f.myVote
      ? await supabase.from("feedback_votes").delete().eq("feedback_id", f.id).eq("user_id", uid)
      : await supabase.from("feedback_votes").insert({ feedback_id: f.id, user_id: uid });
    if (res.error) { setError(String(res.error.message)); return; }
    load(true);
  };
  const addComment = async (f) => {
    const body = (commentDraft[f.id] || "").trim(); if (!body) return;
    const { error } = await supabase.from("feedback_comments").insert({ feedback_id: f.id, user_id: uid, author_name: displayName || "Member", body, is_admin: !!isAdmin });
    if (!error) { setCommentDraft(d => ({ ...d, [f.id]: "" })); load(true); } else setError(String(error.message));
  };
  const toggleResolved = async (f) => {
    if (!isAdmin) return;
    const { error } = await supabase.from("feedback").update({ status: f.status === "resolved" ? "open" : "resolved", resolved_at: f.status === "resolved" ? null : new Date().toISOString() }).eq("id", f.id);
    if (error) { setError(String(error.message)); return; }
    load(true);
  };
  const remove = async (f) => {
    const { error } = await supabase.from("feedback").delete().eq("id", f.id);
    if (error) { setError(String(error.message)); return; }
    load(true);
  };

  const sorted = [...items]
    .filter(f => filter === "all" ? true : filter === "open" ? f.status !== "resolved" : f.status === "resolved")
    .sort((a, b) => (a.status === "resolved" ? 1 : 0) - (b.status === "resolved" ? 1 : 0) || b.votes - a.votes || new Date(b.created_at) - new Date(a.created_at));
  const openCount = items.filter(f => f.status !== "resolved").length;

  const catColor = (c) => c === "Bug" ? C.red : c === "Feature request" ? C.blue : c === "Question" ? C.purple : C.gold;
  const gold = `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})`;
  const glass = { background: "rgba(255,255,255,0.04)", backdropFilter: "blur(20px) saturate(150%)", WebkitBackdropFilter: "blur(20px) saturate(150%)" };

  // pill chip helper
  const chip = (active, accent) => ({
    fontSize: "0.72rem", fontWeight: 700, padding: "7px 14px", borderRadius: 99, cursor: "pointer", fontFamily: font,
    border: `1px solid ${active ? accent : C.border}`, color: active ? "#08080e" : C.muted,
    background: active ? `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})` : "rgba(255,255,255,0.03)",
    transition: "all .14s",
  });

  return createPortal(
    <>
      <style dangerouslySetInnerHTML={{ __html: FB_CSS }} />

      {/* Floating launcher */}
      <button className="vivfb-fab" onClick={() => setOpen(true)} title="Community feedback" style={{
        position: "fixed", right: isMobile ? 16 : 24, bottom: isMobile ? 78 : 24, zIndex: 1000, display: "inline-flex", alignItems: "center", gap: 9,
        background: gold, color: "#08080e", border: "none", fontFamily: font, fontWeight: 800, fontSize: "0.82rem", padding: "13px 20px", borderRadius: 99, cursor: "pointer",
        boxShadow: "0 12px 34px rgba(201,152,42,0.42)", letterSpacing: "-0.01em",
      }}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#08080e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        Feedback
      </button>

      {!open ? null : (
        <div className="vivfb-back" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }} style={{
          position: "fixed", inset: 0, zIndex: 1400, background: "radial-gradient(1000px 600px at 70% -10%, rgba(201,152,42,0.08), transparent 60%), rgba(4,4,8,0.72)",
          backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "44px 16px", overflowY: "auto", fontFamily: font,
        }}>
          <div className="vivfb-modal" style={{
            width: "min(680px, 100%)", position: "relative", borderRadius: 22, overflow: "hidden",
            background: "linear-gradient(180deg, rgba(18,18,26,0.92), rgba(8,8,14,0.97))",
            border: `1px solid ${C.borderGold}`, boxShadow: "0 40px 100px rgba(0,0,0,0.72)",
            backdropFilter: "blur(30px) saturate(160%)", WebkitBackdropFilter: "blur(30px) saturate(160%)",
          }}>
            {/* top gold hairline */}
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${C.gold}, ${C.goldBright}, ${C.gold}, transparent)`, opacity: 0.8 }} />

            {/* header */}
            <div style={{ position: "relative", padding: "22px 24px 20px", borderBottom: `1px solid ${C.border}`, overflow: "hidden" }}>
              <div style={{ position: "absolute", top: -60, right: -20, width: 220, height: 160, background: "radial-gradient(circle, rgba(201,152,42,0.16), transparent 70%)", pointerEvents: "none" }} />
              <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ fontSize: "1.28rem", fontWeight: 800, color: C.white, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Community <span style={{ color: C.gold }}>Feedback</span></div>
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 9, padding: "4px 11px 4px 9px", borderRadius: 99, border: `1px solid ${C.borderGold}`, background: C.goldDim }}>
                    <span className="vivfb-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: C.goldBright }} />
                    <span style={{ fontSize: "0.68rem", fontWeight: 700, color: C.goldBright, letterSpacing: "0.02em" }}>{openCount} open · shape what we build</span>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} style={{ marginLeft: "auto", ...glass, border: `1px solid ${C.border}`, color: C.muted, width: 36, height: 36, borderRadius: 11, fontSize: "1.25rem", cursor: "pointer", lineHeight: 1 }}>&times;</button>
              </div>
            </div>

            {/* composer — matte card */}
            <div style={{ padding: "18px 24px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                {CATEGORIES.map(c => {
                  const active = cat === c, ac = catColor(c);
                  return <button key={c} onClick={() => setCat(c)} style={{ fontSize: "0.72rem", fontWeight: 700, padding: "6px 13px", borderRadius: 99, cursor: "pointer", fontFamily: font, transition: "all .14s",
                    border: `1px solid ${active ? ac : C.border}`, background: active ? `${ac}1f` : "rgba(255,255,255,0.03)", color: active ? ac : C.muted }}>{c}</button>;
                })}
              </div>
              <textarea className="vivfb-in" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Share a suggestion, report a bug, or request a feature…" rows={3}
                style={{ width: "100%", resize: "vertical", background: "rgba(0,0,0,0.35)", border: `1px solid ${C.border}`, borderRadius: 14, color: C.white, fontFamily: font, fontSize: "0.9rem", padding: "13px 15px", outline: "none", lineHeight: 1.55, transition: "border-color .14s, box-shadow .14s" }} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 11 }}>
                <button onClick={post} disabled={!draft.trim() || busy} style={{ background: draft.trim() ? gold : "rgba(255,255,255,0.06)", color: draft.trim() ? "#08080e" : C.muted, border: "none", fontFamily: font, fontWeight: 800, fontSize: "0.82rem", padding: "11px 24px", borderRadius: 99, cursor: draft.trim() ? "pointer" : "default", boxShadow: draft.trim() ? "0 8px 22px rgba(201,152,42,0.32)" : "none", transition: "all .14s" }}>{busy ? "Posting…" : "Post"}</button>
              </div>
            </div>

            {/* filters */}
            <div style={{ display: "flex", gap: 8, padding: "14px 24px 2px" }}>
              {[["all", "All"], ["open", "Open"], ["resolved", "Resolved"]].map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} style={chip(filter === k, C.goldBright)}>{l}</button>
              ))}
            </div>

            {/* feed */}
            <div className="vivfb-feed" style={{ padding: "14px 24px 26px", maxHeight: "54vh", overflowY: "auto" }}>
              {loading && <div style={{ color: C.muted, fontSize: "0.84rem", padding: "24px 0", textAlign: "center" }}>Loading…</div>}
              {error === "setup" && <div style={{ color: C.muted, fontSize: "0.86rem", padding: "24px 4px", textAlign: "center", lineHeight: 1.6 }}>💬 Feedback is being set up — check back shortly.</div>}
              {error && error !== "setup" && <div style={{ color: C.red, fontSize: "0.8rem", padding: "16px 0" }}>{error}</div>}
              {!loading && !error && sorted.length === 0 && <div style={{ color: C.muted, fontSize: "0.86rem", padding: "26px 4px", textAlign: "center" }}>No feedback yet — be the first to post.</div>}

              {sorted.map(f => {
                const resolved = f.status === "resolved";
                const showComments = expanded[f.id];
                return (
                  <div key={f.id} className="vivfb-card" style={{
                    border: `1px solid ${resolved ? "rgba(34,197,94,0.32)" : C.border}`, borderRadius: 16, padding: "15px 17px", marginBottom: 13,
                    background: resolved ? "rgba(34,197,94,0.05)" : "rgba(255,255,255,0.025)", boxShadow: "0 8px 26px rgba(0,0,0,0.28)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: gold, color: "#08080e", display: "grid", placeItems: "center", fontWeight: 800, fontSize: "0.72rem", flex: "0 0 auto", boxShadow: "0 4px 12px rgba(201,152,42,0.35)" }}>{initials(f.author_name)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "0.84rem", fontWeight: 700, color: C.white }}>{f.author_name || "Member"}</div>
                        <div style={{ fontSize: "0.68rem", color: C.muted }}>{timeAgo(f.created_at)}</div>
                      </div>
                      <span style={{ fontSize: "0.62rem", fontWeight: 800, color: catColor(f.category), background: `${catColor(f.category)}1a`, border: `1px solid ${catColor(f.category)}44`, padding: "3px 10px", borderRadius: 99, marginLeft: "auto" }}>{f.category || "Suggestion"}</span>
                      {resolved && <span style={{ fontSize: "0.62rem", fontWeight: 800, color: C.green, background: "rgba(34,197,94,0.14)", border: "1px solid rgba(34,197,94,0.4)", padding: "3px 10px", borderRadius: 99 }}>✓ Resolved</span>}
                    </div>
                    <div style={{ fontSize: "0.9rem", color: C.text, lineHeight: 1.58, whiteSpace: "pre-wrap", marginBottom: 13 }}>{f.body}</div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => toggleVote(f)} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.74rem", fontWeight: 800, padding: "6px 13px", borderRadius: 99, cursor: "pointer", fontFamily: font, transition: "all .14s",
                        border: `1px solid ${f.myVote ? C.borderGold : C.border}`, background: f.myVote ? C.goldDim : "rgba(255,255,255,0.03)", color: f.myVote ? C.goldBright : C.muted }}>
                        ▲ {f.votes}
                      </button>
                      <button onClick={() => setExpanded(e => ({ ...e, [f.id]: !e[f.id] }))} style={{ fontSize: "0.74rem", fontWeight: 700, padding: "6px 13px", borderRadius: 99, cursor: "pointer", fontFamily: font, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.03)", color: C.muted }}>
                        💬 {f.comments.length}
                      </button>
                      {isAdmin && <button onClick={() => toggleResolved(f)} style={{ fontSize: "0.72rem", fontWeight: 800, padding: "6px 13px", borderRadius: 99, cursor: "pointer", fontFamily: font, border: `1px solid ${resolved ? C.border : "rgba(34,197,94,0.42)"}`, background: resolved ? "rgba(255,255,255,0.03)" : "rgba(34,197,94,0.12)", color: resolved ? C.muted : C.green }}>{resolved ? "Reopen" : "Mark resolved"}</button>}
                      {(isAdmin || f.user_id === uid) && <button onClick={() => remove(f)} title="Delete" style={{ marginLeft: "auto", fontSize: "0.72rem", fontWeight: 700, padding: "6px 11px", borderRadius: 99, cursor: "pointer", fontFamily: font, border: `1px solid ${C.border}`, background: "transparent", color: C.muted }}>Delete</button>}
                    </div>

                    {showComments && (
                      <div style={{ marginTop: 13, paddingTop: 13, borderTop: `1px solid ${C.border}` }}>
                        {f.comments.map(c => (
                          <div key={c.id} style={{ display: "flex", gap: 9, marginBottom: 10 }}>
                            <div style={{ width: 27, height: 27, borderRadius: "50%", flex: "0 0 auto", display: "grid", placeItems: "center", fontWeight: 800, fontSize: "0.62rem", background: c.is_admin ? gold : "rgba(255,255,255,0.07)", color: c.is_admin ? "#08080e" : C.muted }}>{initials(c.author_name)}</div>
                            <div style={{ background: c.is_admin ? "rgba(201,152,42,0.07)" : "rgba(255,255,255,0.03)", border: `1px solid ${c.is_admin ? C.borderGold : C.border}`, borderRadius: 12, padding: "9px 13px", flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                                <span style={{ fontSize: "0.74rem", fontWeight: 700, color: c.is_admin ? C.gold : C.text }}>{c.author_name || "Member"}</span>
                                {c.is_admin && <span style={{ fontSize: "0.54rem", fontWeight: 800, color: "#08080e", background: `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})`, padding: "1px 7px", borderRadius: 99, letterSpacing: "0.04em" }}>TEAM</span>}
                                <span style={{ fontSize: "0.64rem", color: C.muted, marginLeft: "auto" }}>{timeAgo(c.created_at)}</span>
                              </div>
                              <div style={{ fontSize: "0.82rem", color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{c.body}</div>
                            </div>
                          </div>
                        ))}
                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                          <input className="vivfb-in" value={commentDraft[f.id] || ""} onChange={e => setCommentDraft(d => ({ ...d, [f.id]: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") addComment(f); }}
                            placeholder={isAdmin ? "Reply as team…" : "Add a comment…"} style={{ flex: 1, background: "rgba(0,0,0,0.35)", border: `1px solid ${C.border}`, borderRadius: 10, color: C.white, fontFamily: font, fontSize: "0.82rem", padding: "10px 13px", outline: "none", transition: "border-color .14s, box-shadow .14s" }} />
                          <button onClick={() => addComment(f)} style={{ background: gold, color: "#08080e", border: "none", fontFamily: font, fontWeight: 800, fontSize: "0.76rem", padding: "10px 17px", borderRadius: 10, cursor: "pointer" }}>Send</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
