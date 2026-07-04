import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabaseClient";

// ══════════════════════════════════════════════════════════════════
// VIV Community Feedback — Skool/Facebook-style feed. Members post
// feedback/suggestions, upvote, and comment; admin marks Resolved and
// replies (badged). Backed by Supabase (feedback / feedback_votes /
// feedback_comments) with RLS — run supabase/feedback.sql once.
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

  return createPortal(
    <>
      {/* Floating launcher */}
      <button onClick={() => setOpen(true)} title="Community feedback" style={{
        position: "fixed", right: isMobile ? 16 : 22, bottom: isMobile ? 78 : 22, zIndex: 1000, display: "inline-flex", alignItems: "center", gap: 9,
        background: `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})`, color: "#08080e", border: "none",
        fontFamily: font, fontWeight: 800, fontSize: "0.82rem", padding: "12px 18px", borderRadius: 99, cursor: "pointer",
        boxShadow: "0 12px 34px rgba(201,152,42,0.4)",
      }}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#08080e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        Feedback
      </button>

      {!open ? null : (
        <div onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }} style={{
          position: "fixed", inset: 0, zIndex: 1400, background: "rgba(4,4,8,0.66)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
          display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px 16px", overflowY: "auto", fontFamily: font,
        }}>
          <div style={{ width: "min(680px, 100%)", background: "linear-gradient(180deg,#0c0c14,#08080e)", border: `1px solid ${C.border}`, borderRadius: 20, boxShadow: "0 30px 80px rgba(0,0,0,0.6)", overflow: "hidden" }}>
            {/* header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 22px", borderBottom: `1px solid ${C.border}`, background: "rgba(201,152,42,0.05)" }}>
              <div>
                <div style={{ fontSize: "1.12rem", fontWeight: 800, color: C.white, letterSpacing: "-0.01em" }}>Community Feedback</div>
                <div style={{ fontSize: "0.72rem", color: C.muted, marginTop: 2 }}>Suggest, report, and vote — {openCount} open</div>
              </div>
              <button onClick={() => setOpen(false)} style={{ marginLeft: "auto", background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: C.muted, width: 34, height: 34, borderRadius: 9, fontSize: "1.2rem", cursor: "pointer", lineHeight: 1 }}>&times;</button>
            </div>

            {/* composer */}
            <div style={{ padding: "16px 22px", borderBottom: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => setCat(c)} style={{ fontSize: "0.7rem", fontWeight: 700, padding: "5px 12px", borderRadius: 99, cursor: "pointer", fontFamily: font,
                    border: `1px solid ${cat === c ? catColor(c) : C.border}`, background: cat === c ? `${catColor(c)}22` : "transparent", color: cat === c ? catColor(c) : C.muted }}>{c}</button>
                ))}
              </div>
              <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Share a suggestion, report a bug, or request a feature…" rows={3}
                style={{ width: "100%", resize: "vertical", background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 12, color: C.white, fontFamily: font, fontSize: "0.88rem", padding: "12px 14px", outline: "none", lineHeight: 1.5 }} />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <button onClick={post} disabled={!draft.trim() || busy} style={{ background: draft.trim() ? `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})` : "rgba(255,255,255,0.06)", color: draft.trim() ? "#08080e" : C.muted, border: "none", fontFamily: font, fontWeight: 800, fontSize: "0.8rem", padding: "10px 20px", borderRadius: 10, cursor: draft.trim() ? "pointer" : "default" }}>{busy ? "Posting…" : "Post"}</button>
              </div>
            </div>

            {/* filters */}
            <div style={{ display: "flex", gap: 8, padding: "12px 22px 0" }}>
              {[["all", "All"], ["open", "Open"], ["resolved", "Resolved"]].map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} style={{ fontSize: "0.72rem", fontWeight: 700, padding: "6px 13px", borderRadius: 99, cursor: "pointer", fontFamily: font,
                  border: `1px solid ${filter === k ? C.borderGold : C.border}`, background: filter === k ? C.goldDim : "transparent", color: filter === k ? C.gold : C.muted }}>{l}</button>
              ))}
            </div>

            {/* feed */}
            <div style={{ padding: "14px 22px 24px", maxHeight: "56vh", overflowY: "auto" }}>
              {loading && <div style={{ color: C.muted, fontSize: "0.84rem", padding: "20px 0", textAlign: "center" }}>Loading…</div>}
              {error === "setup" && <div style={{ color: C.muted, fontSize: "0.86rem", padding: "22px 4px", textAlign: "center", lineHeight: 1.6 }}>💬 Feedback is being set up — check back shortly.</div>}
              {error && error !== "setup" && <div style={{ color: C.red, fontSize: "0.8rem", padding: "16px 0" }}>{error}</div>}
              {!loading && !error && sorted.length === 0 && <div style={{ color: C.muted, fontSize: "0.86rem", padding: "22px 4px", textAlign: "center" }}>No feedback yet — be the first to post.</div>}

              {sorted.map(f => {
                const resolved = f.status === "resolved";
                const showComments = expanded[f.id];
                return (
                  <div key={f.id} style={{ border: `1px solid ${resolved ? "rgba(34,197,94,0.3)" : C.border}`, borderRadius: 14, padding: "14px 16px", marginBottom: 12, background: resolved ? "rgba(34,197,94,0.04)" : "rgba(255,255,255,0.02)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.goldDim, color: C.gold, display: "grid", placeItems: "center", fontWeight: 800, fontSize: "0.72rem", flex: "0 0 auto" }}>{initials(f.author_name)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "0.82rem", fontWeight: 700, color: C.white }}>{f.author_name || "Member"}</div>
                        <div style={{ fontSize: "0.68rem", color: C.muted }}>{timeAgo(f.created_at)}</div>
                      </div>
                      <span style={{ fontSize: "0.62rem", fontWeight: 800, color: catColor(f.category), background: `${catColor(f.category)}1a`, border: `1px solid ${catColor(f.category)}44`, padding: "3px 9px", borderRadius: 99, marginLeft: "auto" }}>{f.category || "Suggestion"}</span>
                      {resolved && <span style={{ fontSize: "0.62rem", fontWeight: 800, color: C.green, background: "rgba(34,197,94,0.14)", border: "1px solid rgba(34,197,94,0.4)", padding: "3px 9px", borderRadius: 99 }}>✓ Resolved</span>}
                    </div>
                    <div style={{ fontSize: "0.9rem", color: C.text, lineHeight: 1.55, whiteSpace: "pre-wrap", marginBottom: 12 }}>{f.body}</div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => toggleVote(f)} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.74rem", fontWeight: 700, padding: "6px 12px", borderRadius: 99, cursor: "pointer", fontFamily: font,
                        border: `1px solid ${f.myVote ? C.borderGold : C.border}`, background: f.myVote ? C.goldDim : "transparent", color: f.myVote ? C.gold : C.muted }}>
                        ▲ {f.votes} {f.votes === 1 ? "vote" : "votes"}
                      </button>
                      <button onClick={() => setExpanded(e => ({ ...e, [f.id]: !e[f.id] }))} style={{ fontSize: "0.74rem", fontWeight: 700, padding: "6px 12px", borderRadius: 99, cursor: "pointer", fontFamily: font, border: `1px solid ${C.border}`, background: "transparent", color: C.muted }}>
                        💬 {f.comments.length} {f.comments.length === 1 ? "comment" : "comments"}
                      </button>
                      {isAdmin && <button onClick={() => toggleResolved(f)} style={{ fontSize: "0.72rem", fontWeight: 800, padding: "6px 12px", borderRadius: 99, cursor: "pointer", fontFamily: font, border: `1px solid ${resolved ? C.border : "rgba(34,197,94,0.4)"}`, background: resolved ? "transparent" : "rgba(34,197,94,0.12)", color: resolved ? C.muted : C.green }}>{resolved ? "Reopen" : "Mark resolved"}</button>}
                      {(isAdmin || f.user_id === uid) && <button onClick={() => remove(f)} title="Delete" style={{ marginLeft: "auto", fontSize: "0.72rem", fontWeight: 700, padding: "6px 10px", borderRadius: 99, cursor: "pointer", fontFamily: font, border: `1px solid ${C.border}`, background: "transparent", color: C.muted }}>Delete</button>}
                    </div>

                    {showComments && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                        {f.comments.map(c => (
                          <div key={c.id} style={{ display: "flex", gap: 9, marginBottom: 10 }}>
                            <div style={{ width: 26, height: 26, borderRadius: "50%", flex: "0 0 auto", display: "grid", placeItems: "center", fontWeight: 800, fontSize: "0.62rem", background: c.is_admin ? "rgba(201,152,42,0.18)" : "rgba(255,255,255,0.06)", color: c.is_admin ? C.gold : C.muted }}>{initials(c.author_name)}</div>
                            <div style={{ background: c.is_admin ? "rgba(201,152,42,0.06)" : "rgba(255,255,255,0.03)", border: `1px solid ${c.is_admin ? C.borderGold : C.border}`, borderRadius: 10, padding: "8px 12px", flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                                <span style={{ fontSize: "0.74rem", fontWeight: 700, color: c.is_admin ? C.gold : C.text }}>{c.author_name || "Member"}</span>
                                {c.is_admin && <span style={{ fontSize: "0.56rem", fontWeight: 800, color: C.gold, background: C.goldDim, padding: "1px 6px", borderRadius: 99 }}>TEAM</span>}
                                <span style={{ fontSize: "0.64rem", color: C.muted, marginLeft: "auto" }}>{timeAgo(c.created_at)}</span>
                              </div>
                              <div style={{ fontSize: "0.82rem", color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{c.body}</div>
                            </div>
                          </div>
                        ))}
                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                          <input value={commentDraft[f.id] || ""} onChange={e => setCommentDraft(d => ({ ...d, [f.id]: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") addComment(f); }}
                            placeholder={isAdmin ? "Reply as team…" : "Add a comment…"} style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 9, color: C.white, fontFamily: font, fontSize: "0.82rem", padding: "9px 12px", outline: "none" }} />
                          <button onClick={() => addComment(f)} style={{ background: C.goldDim, color: C.gold, border: `1px solid ${C.borderGold}`, fontFamily: font, fontWeight: 700, fontSize: "0.76rem", padding: "9px 15px", borderRadius: 9, cursor: "pointer" }}>Send</button>
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
