import React, { useState, useEffect, useCallback, useRef } from "react";
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

// Display-only date format: Date → "Aug 7th, 2026". keep in sync with fmtNice in App.jsx
const FN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtNice(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt)) return "—";
  const day = dt.getDate();
  const suffix = (day % 10 === 1 && day !== 11) ? "st" : (day % 10 === 2 && day !== 12) ? "nd" : (day % 10 === 3 && day !== 13) ? "rd" : "th";
  return `${FN_MONTHS[dt.getMonth()]} ${day}${suffix}, ${dt.getFullYear()}`;
}

function timeAgo(iso) {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  return fmtNice(new Date(iso));
}
const initials = (name) => (name || "M").trim().slice(0, 2).toUpperCase();

const FB_CSS = `
@keyframes vivfbFade{from{opacity:0}to{opacity:1}}
@keyframes vivfbUp{from{opacity:0;transform:translateY(18px) scale(0.99)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes vivfbPulse{0%,100%{box-shadow:0 0 0 0 var(--w55)}70%{box-shadow:0 0 0 6px rgba(255,255,255,0)}}
.vivfb-back{animation:vivfbFade .2s ease}
.vivfb-modal{animation:vivfbUp .3s cubic-bezier(0.22,1,0.36,1)}
.vivfb-dot{animation:vivfbPulse 2.2s infinite}
.vivfb-in::placeholder{color:var(--faint)}
.vivfb-in:focus{border-color:rgba(201,152,42,0.55) !important; box-shadow:0 0 0 3px rgba(201,152,42,0.12)}
.vivfb-card{transition:border-color .16s, box-shadow .16s}
.vivfb-card:hover{border-color:rgba(201,152,42,0.26)}
.vivfb-fab{transition:transform .14s, box-shadow .2s}
.vivfb-fab:hover{transform:translateY(-2px); box-shadow:0 16px 40px rgba(201,152,42,0.5)}
.vivfb-feed::-webkit-scrollbar{width:8px}
.vivfb-feed::-webkit-scrollbar-thumb{background:var(--w22); border-radius:999px}
@keyframes vivfbBadge{0%,100%{box-shadow:0 0 0 0 rgba(255,80,0,0.6)}70%{box-shadow:0 0 0 7px rgba(255,80,0,0)}}
.vivfb-badge{animation:vivfbBadge 2s infinite}
.vivfb-toast{animation:vivfbUp .32s cubic-bezier(0.22,1,0.36,1)}
@keyframes vivfbDrawerIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
.vivfb-drawer{animation:vivfbDrawerIn .32s cubic-bezier(0.22,1,0.36,1); height:100vh; height:100dvh;}
@media (max-width: 767px){ .vivfb-drawer{ width:100vw !important; border-radius:0 !important; } }
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

  // ── Notifications + full-page detail (100% client-side, no schema change) ──
  const ADMIN_LASTSEEN_KEY = "viv-feedback-admin-lastseen";   // ISO ts of the last time admin opened the panel
  const RESOLVED_SEEN_KEY = "viv-feedback-resolved-seen";     // Set<feedback_id> the member has already been toasted about
  const [allFeedback, setAllFeedback] = useState([]);         // lightweight always-on poll → drives badges + resolved detection
  const [detail, setDetail] = useState(null);                 // feedback id currently shown full-page (or null)
  const [toasts, setToasts] = useState([]);                   // [{id,msg}] self-dismissing
  const [memberPending, setMemberPending] = useState(() => new Set()); // own items just resolved — FAB badge until panel opened
  const [adminLastSeen, setAdminLastSeen] = useState(() => { try { return localStorage.getItem(ADMIN_LASTSEEN_KEY) || "1970-01-01T00:00:00.000Z"; } catch { return "1970-01-01T00:00:00.000Z"; } });
  const resolvedSeenRef = useRef(null);
  if (resolvedSeenRef.current === null) { try { resolvedSeenRef.current = new Set(JSON.parse(localStorage.getItem(RESOLVED_SEEN_KEY) || "[]")); } catch { resolvedSeenRef.current = new Set(); } }

  const pushToast = useCallback((msg) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 6500);
  }, []);

  // Always-on lightweight poll (runs whether or not the panel is open) so the admin's new-feedback
  // badge and members' "resolved" toasts fire even with the panel closed. Same 12s cadence.
  const pollMeta = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("feedback").select("id,user_id,status,body,created_at");
      if (error) return;
      setAllFeedback(data || []);
    } catch { /* offline / not set up yet — leave badges empty */ }
  }, []);
  useEffect(() => {
    pollMeta();
    const id = setInterval(pollMeta, 12000);
    return () => clearInterval(id);
  }, [pollMeta]);

  // Admin unread = feedback from OTHER members created after the admin last opened the panel.
  const adminUnread = isAdmin ? allFeedback.filter(f => f.user_id !== uid && new Date(f.created_at) > new Date(adminLastSeen)).length : 0;
  const markAdminSeen = useCallback(() => {
    const now = new Date().toISOString();
    try { localStorage.setItem(ADMIN_LASTSEEN_KEY, now); } catch {}
    setAdminLastSeen(now);
  }, []);

  // Member: detect their OWN feedback that just flipped to resolved → one-time toast + FAB badge.
  useEffect(() => {
    if (!uid || isAdmin || !allFeedback.length) return;
    const seen = resolvedSeenRef.current;
    const newly = allFeedback.filter(f => f.user_id === uid && f.status === "resolved" && !seen.has(f.id));
    if (!newly.length) return;
    newly.forEach((f, i) => {
      seen.add(f.id);
      const body = (f.body || "").trim();
      const snip = body.slice(0, 40) + (body.length > 40 ? "…" : "");
      setTimeout(() => pushToast(`✓ Your feedback was marked resolved: "${snip}"`), i * 500);
    });
    try { localStorage.setItem(RESOLVED_SEEN_KEY, JSON.stringify([...seen])); } catch {}
    setMemberPending(prev => { const n = new Set(prev); newly.forEach(f => n.add(f.id)); return n; });
  }, [allFeedback, uid, isAdmin, pushToast]);

  // Opening the panel clears whichever badge applies to this viewer.
  useEffect(() => {
    if (!open) return;
    if (isAdmin) markAdminSeen();
    else setMemberPending(new Set());
  }, [open, isAdmin, markAdminSeen]);
  // While the admin keeps the panel open, keep marking fresh arrivals seen so the badge stays cleared.
  useEffect(() => { if (open && isAdmin) markAdminSeen(); }, [allFeedback, open, isAdmin, markAdminSeen]);

  const badgeCount = isAdmin ? adminUnread : memberPending.size;

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

  // Esc closes the topmost layer: the full-page detail reader first, else the drawer itself.
  // The drawer never traps the rest of the page — there's no click-away close, only ✕ / Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (detail) setDetail(null); else setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, detail]);

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
  const detailItem = detail ? items.find(f => f.id === detail) : null;

  const catColor = (c) => c === "Bug" ? C.red : c === "Feature request" ? C.blue : c === "Question" ? C.purple : C.muted;
  const gold = `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})`;
  const glass = { background: "var(--w04)", backdropFilter: "blur(20px) saturate(150%)", WebkitBackdropFilter: "blur(20px) saturate(150%)" };

  // pill chip helper — neutral active state (filters act on data, not brand chrome)
  const chip = (active) => ({
    fontSize: "0.75rem", fontWeight: 500, padding: "7px 14px", borderRadius: 999, cursor: "pointer", fontFamily: font,
    border: `1px solid ${active ? "var(--w14)" : C.border}`, color: active ? "var(--white)" : C.muted,
    background: active ? "var(--w10)" : "var(--w03)",
    transition: "all .14s",
  });

  return createPortal(
    <>
      <style dangerouslySetInnerHTML={{ __html: FB_CSS }} />

      {/* Floating launcher */}
      <button className="vivfb-fab" onClick={() => setOpen(true)} title="Community feedback" style={{
        position: "fixed", right: isMobile ? 16 : 24, bottom: isMobile ? 78 : 24, zIndex: 1050, display: "inline-flex", alignItems: "center", gap: 9,
        background: gold, color: "var(--goldOn)", border: "none", fontFamily: font, fontWeight: 600, fontSize: "0.875rem", padding: "13px 20px", borderRadius: 999, cursor: "pointer",
        boxShadow: "0 12px 34px rgba(201,152,42,0.42)", letterSpacing: "-0.01em",
      }}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="var(--goldOn)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
        Feedback
        {badgeCount > 0 && (
          <span className="vivfb-badge" title={isAdmin ? `${badgeCount} new feedback` : `${badgeCount} of your items resolved`} style={{
            position: "absolute", top: -7, right: -7, minWidth: 21, height: 21, padding: "0 5px", borderRadius: 999,
            background: "var(--red)", color: "#fff", fontSize: "0.6875rem", fontWeight: 600, display: "grid", placeItems: "center",
            border: "2px solid var(--bg)", lineHeight: 1, boxSizing: "border-box",
          }}>{badgeCount > 9 ? "9+" : badgeCount}</span>
        )}
      </button>

      {!open ? null : (
        // Right-side slide-in drawer — NOT a full-page backdrop. There is deliberately no
        // inset:0 overlay: the site behind stays fully visible AND interactive (scrollable,
        // clickable) so members can reference it while writing feedback. Close = ✕ or Esc only.
        <div className="vivfb-drawer" style={{
          position: "fixed", top: 0, right: 0, zIndex: 1350,
          width: "min(440px, 92vw)", display: "flex", flexDirection: "column",
          background: "var(--sheet)",
          borderLeft: `1px solid ${C.borderGold}`, boxShadow: "var(--shadowOv)",
          backdropFilter: "blur(30px) saturate(160%)", WebkitBackdropFilter: "blur(30px) saturate(160%)",
          fontFamily: font,
        }}>
          {/* top gold hairline */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${C.gold}, ${C.goldBright}, ${C.gold}, transparent)`, opacity: 0.8 }} />

          {/* header */}
          <div style={{ position: "relative", flex: "0 0 auto", padding: "22px 22px 18px", borderBottom: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -60, right: -20, width: 220, height: 160, background: "radial-gradient(circle, var(--w06), transparent 70%)", pointerEvents: "none" }} />
            <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ fontSize: "1.25rem", fontWeight: 600, color: C.white, letterSpacing: "-0.02em", lineHeight: 1.1 }}>Community <span style={{ color: C.white }}>Feedback</span></div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 9, padding: "4px 11px 4px 9px", borderRadius: 999, border: `1px solid ${C.border}`, background: "var(--w06)" }}>
                  <span className="vivfb-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--w55)" }} />
                  <span style={{ fontSize: "0.6875rem", fontWeight: 500, color: C.muted, letterSpacing: "0.02em" }}>{openCount} open · shape what we build</span>
                </div>
              </div>
              <button onClick={() => setOpen(false)} title="Close (Esc)" style={{ marginLeft: "auto", ...glass, border: `1px solid ${C.border}`, color: C.muted, width: 36, height: 36, borderRadius: 11, fontSize: "1.25rem", cursor: "pointer", lineHeight: 1, flex: "0 0 auto" }}>&times;</button>
            </div>
          </div>

          {/* composer — matte card */}
          <div style={{ flex: "0 0 auto", padding: "16px 22px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {CATEGORIES.map(c => {
                const active = cat === c, ac = catColor(c);
                return <button key={c} onClick={() => setCat(c)} style={{ fontSize: "0.75rem", fontWeight: 500, padding: "6px 13px", borderRadius: 999, cursor: "pointer", fontFamily: font, transition: "all .14s",
                  border: `1px solid ${active ? ac : C.border}`, background: active ? `${ac}1f` : "var(--w03)", color: active ? ac : C.muted }}>{c}</button>;
              })}
            </div>
            <textarea className="vivfb-in" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Share a suggestion, report a bug, or request a feature…" rows={3}
              style={{ width: "100%", resize: "vertical", background: "var(--w08)", border: `1px solid ${C.border}`, borderRadius: 14, color: C.white, fontFamily: font, fontSize: "0.875rem", padding: "13px 15px", outline: "none", lineHeight: 1.55, transition: "border-color .14s, box-shadow .14s" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 11 }}>
              <button onClick={post} disabled={!draft.trim() || busy} style={{ background: draft.trim() ? gold : "var(--w06)", color: draft.trim() ? "var(--goldOn)" : C.muted, border: "none", fontFamily: font, fontWeight: 600, fontSize: "0.875rem", padding: "11px 24px", borderRadius: 999, cursor: draft.trim() ? "pointer" : "default", boxShadow: draft.trim() ? "0 8px 22px rgba(201,152,42,0.32)" : "none", transition: "all .14s" }}>{busy ? "Posting…" : "Post"}</button>
            </div>
          </div>

          {/* filters */}
          <div style={{ flex: "0 0 auto", display: "flex", gap: 8, padding: "14px 22px 2px" }}>
            {[["all", "All"], ["open", "Open"], ["resolved", "Resolved"]].map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} style={chip(filter === k)}>{l}</button>
            ))}
          </div>

          {/* feed — the drawer's own scroll region; header/composer/filters stay put */}
          <div className="vivfb-feed" style={{ flex: "1 1 auto", minHeight: 0, padding: "14px 22px 26px", overflowY: "auto" }}>
            {loading && (
              <div style={{ padding: "2px 0 6px" }}>
                {[0, 1, 2].map(i => (
                  <div key={i} className="sk-row" style={{ borderRadius: 16, marginBottom: 13, border: `1px solid ${C.border}`, padding: "15px 17px" }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", flex: "0 0 auto" }} className="sk" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="sk sk-line" style={{ width: "40%" }} />
                      <div className="sk sk-line" style={{ width: "85%" }} />
                      <div className="sk sk-line" style={{ width: "60%" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
              {error === "setup" && <div style={{ color: C.muted, fontSize: "0.875rem", padding: "24px 4px", textAlign: "center", lineHeight: 1.6 }}>💬 Feedback is being set up — check back shortly.</div>}
              {error && error !== "setup" && <div style={{ color: C.red, fontSize: "0.75rem", padding: "16px 0" }}>{error}</div>}
              {!loading && !error && sorted.length === 0 && <div style={{ color: C.muted, fontSize: "0.875rem", padding: "26px 4px", textAlign: "center" }}>No feedback yet — be the first to post.</div>}

              {sorted.map(f => {
                const resolved = f.status === "resolved";
                const showComments = expanded[f.id];
                return (
                  <div key={f.id} className="vivfb-card" onClick={() => setDetail(f.id)} title="Open full view" style={{
                    border: `1px solid ${resolved ? "rgba(0,200,5,0.32)" : C.border}`, borderRadius: 16, padding: "15px 17px", marginBottom: 13, cursor: "pointer",
                    background: resolved ? "rgba(0,200,5,0.05)" : "var(--w03)", boxShadow: "var(--shadowOv)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--w10)", color: C.white, display: "grid", placeItems: "center", fontWeight: 600, fontSize: "0.75rem", flex: "0 0 auto", boxShadow: "var(--shadow)" }}>{initials(f.author_name)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "0.875rem", fontWeight: 500, color: C.white }}>{f.author_name || "Member"}</div>
                        <div style={{ fontSize: "0.6875rem", color: C.muted }}>{timeAgo(f.created_at)}</div>
                      </div>
                      <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: catColor(f.category), background: `${catColor(f.category)}1a`, border: `1px solid ${catColor(f.category)}44`, padding: "3px 10px", borderRadius: 999, marginLeft: "auto" }}>{f.category || "Suggestion"}</span>
                      {resolved && <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: C.green, background: "rgba(0,200,5,0.14)", border: "1px solid rgba(0,200,5,0.4)", padding: "3px 10px", borderRadius: 999 }}>✓ Resolved</span>}
                    </div>
                    <div style={{ fontSize: "0.875rem", color: C.text, lineHeight: 1.58, whiteSpace: "pre-wrap", marginBottom: 13 }}>{f.body}</div>

                    <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => toggleVote(f)} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.75rem", fontWeight: 600, padding: "6px 13px", borderRadius: 999, cursor: "pointer", fontFamily: font, transition: "all .14s",
                        border: `1px solid ${f.myVote ? "var(--w22)" : C.border}`, background: f.myVote ? "var(--w08)" : "var(--w03)", color: f.myVote ? C.white : C.muted }}>
                        ▲ {f.votes}
                      </button>
                      <button onClick={() => setExpanded(e => ({ ...e, [f.id]: !e[f.id] }))} style={{ fontSize: "0.75rem", fontWeight: 500, padding: "6px 13px", borderRadius: 999, cursor: "pointer", fontFamily: font, border: `1px solid ${C.border}`, background: "var(--w03)", color: C.muted }}>
                        💬 {f.comments.length}
                      </button>
                      {isAdmin && <button onClick={() => toggleResolved(f)} style={{ fontSize: "0.75rem", fontWeight: 600, padding: "6px 13px", borderRadius: 999, cursor: "pointer", fontFamily: font, border: `1px solid ${resolved ? C.border : "rgba(0,200,5,0.42)"}`, background: resolved ? "var(--w03)" : "rgba(0,200,5,0.12)", color: resolved ? C.muted : C.green }}>{resolved ? "Reopen" : "Mark resolved"}</button>}
                      {(isAdmin || f.user_id === uid) && <button onClick={() => remove(f)} title="Delete" style={{ marginLeft: "auto", fontSize: "0.75rem", fontWeight: 500, padding: "6px 11px", borderRadius: 999, cursor: "pointer", fontFamily: font, border: `1px solid ${C.border}`, background: "transparent", color: C.muted }}>Delete</button>}
                    </div>

                    {showComments && (
                      <div onClick={e => e.stopPropagation()} style={{ marginTop: 13, paddingTop: 13, borderTop: `1px solid ${C.border}` }}>
                        {f.comments.map(c => (
                          <div key={c.id} style={{ display: "flex", gap: 9, marginBottom: 10 }}>
                            <div style={{ width: 27, height: 27, borderRadius: "50%", flex: "0 0 auto", display: "grid", placeItems: "center", fontWeight: 600, fontSize: "0.6875rem", background: c.is_admin ? "var(--w14)" : "var(--w08)", color: c.is_admin ? C.white : C.muted }}>{initials(c.author_name)}</div>
                            <div style={{ background: c.is_admin ? "var(--w06)" : "var(--w03)", border: `1px solid ${c.is_admin ? "var(--w22)" : C.border}`, borderRadius: 12, padding: "9px 13px", flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                                <span style={{ fontSize: "0.75rem", fontWeight: 500, color: c.is_admin ? C.white : C.text }}>{c.author_name || "Member"}</span>
                                {c.is_admin && <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: C.white, background: "var(--w14)", padding: "1px 7px", borderRadius: 999, letterSpacing: "0.04em" }}>TEAM</span>}
                                <span style={{ fontSize: "0.6875rem", color: C.muted, marginLeft: "auto" }}>{timeAgo(c.created_at)}</span>
                              </div>
                              <div style={{ fontSize: "0.875rem", color: C.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{c.body}</div>
                            </div>
                          </div>
                        ))}
                        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                          <input className="vivfb-in" value={commentDraft[f.id] || ""} onChange={e => setCommentDraft(d => ({ ...d, [f.id]: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") addComment(f); }}
                            placeholder={isAdmin ? "Reply as team…" : "Add a comment…"} style={{ flex: 1, background: "var(--w08)", border: `1px solid ${C.border}`, borderRadius: 10, color: C.white, fontFamily: font, fontSize: "0.875rem", padding: "10px 13px", outline: "none", transition: "border-color .14s, box-shadow .14s" }} />
                          <button onClick={() => addComment(f)} style={{ background: gold, color: "var(--goldOn)", border: "none", fontFamily: font, fontWeight: 600, fontSize: "0.75rem", padding: "10px 17px", borderRadius: 10, cursor: "pointer" }}>Send</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
        </div>
      )}

      {/* Full-page detail — a feedback item opened for easy reading. Sits ABOVE the feedback drawer
          (z 1350) at z 1360; reuses the same vote/comment/resolve/delete handlers (no duplicated logic).
          Ladder (app-wide, ascending): trade-details page 1300 < feedback drawer 1350 < full-page
          reader 1360 < edit-trade modal 1400 < toasts 1600 (transient, allowed on top of everything). */}
      {detailItem && (() => {
        const f = detailItem;
        const resolved = f.status === "resolved";
        const cc = catColor(f.category);
        return (
          <div className="vivfb-back" onClick={(e) => { if (e.target === e.currentTarget) setDetail(null); }} style={{
            position: "fixed", inset: 0, zIndex: 1360, background: "radial-gradient(1000px 600px at 70% -10%, var(--w04), transparent 60%), var(--scrim)",
            backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: isMobile ? "20px 12px 40px" : "48px 16px", overflowY: "auto", fontFamily: font,
          }}>
            <div className="vivfb-modal" style={{
              width: "min(760px, 100%)", position: "relative", borderRadius: 22, overflow: "hidden",
              background: "var(--sheet)",
              border: `1px solid ${C.border}`, boxShadow: "var(--shadowOv)",
              backdropFilter: "blur(30px) saturate(160%)", WebkitBackdropFilter: "blur(30px) saturate(160%)",
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent, var(--w22), var(--w55), var(--w22), transparent)", opacity: 0.85 }} />

              {/* header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 22px 16px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--w10)", color: C.white, display: "grid", placeItems: "center", fontWeight: 600, fontSize: "0.75rem", flex: "0 0 auto", boxShadow: "var(--shadow)" }}>{initials(f.author_name)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "1rem", fontWeight: 500, color: C.white }}>{f.author_name || "Member"}</div>
                  <div style={{ fontSize: "0.6875rem", color: C.muted }}>{timeAgo(f.created_at)}</div>
                </div>
                <span style={{ marginLeft: "auto", fontSize: "0.6875rem", fontWeight: 600, color: cc, background: `${cc}1a`, border: `1px solid ${cc}44`, padding: "4px 11px", borderRadius: 999 }}>{f.category || "Suggestion"}</span>
                {resolved && <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: C.green, background: "rgba(0,200,5,0.14)", border: "1px solid rgba(0,200,5,0.4)", padding: "4px 11px", borderRadius: 999 }}>✓ Resolved</span>}
                <button onClick={() => setDetail(null)} style={{ ...glass, border: `1px solid ${C.border}`, color: C.muted, width: 36, height: 36, borderRadius: 11, fontSize: "1.25rem", cursor: "pointer", lineHeight: 1, flex: "0 0 auto" }}>&times;</button>
              </div>

              {/* full body — no truncation, line breaks preserved */}
              <div style={{ padding: "20px 22px", maxHeight: isMobile ? "none" : "42vh", overflowY: "auto" }}>
                <div style={{ fontSize: "1rem", color: C.text, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{f.body}</div>
              </div>

              {/* actions — reuse the list handlers */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "0 22px 16px" }}>
                <button onClick={() => toggleVote(f)} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.75rem", fontWeight: 600, padding: "7px 15px", borderRadius: 999, cursor: "pointer", fontFamily: font, transition: "all .14s",
                  border: `1px solid ${f.myVote ? "var(--w22)" : C.border}`, background: f.myVote ? "var(--w08)" : "var(--w03)", color: f.myVote ? C.white : C.muted }}>▲ {f.votes}</button>
                <span style={{ fontSize: "0.75rem", fontWeight: 500, color: C.muted }}>💬 {f.comments.length} {f.comments.length === 1 ? "comment" : "comments"}</span>
                {isAdmin && <button onClick={() => toggleResolved(f)} style={{ fontSize: "0.75rem", fontWeight: 600, padding: "7px 15px", borderRadius: 999, cursor: "pointer", fontFamily: font, border: `1px solid ${resolved ? C.border : "rgba(0,200,5,0.42)"}`, background: resolved ? "var(--w03)" : "rgba(0,200,5,0.12)", color: resolved ? C.muted : C.green }}>{resolved ? "Reopen" : "Mark resolved"}</button>}
                {(isAdmin || f.user_id === uid) && <button onClick={() => { remove(f); setDetail(null); }} title="Delete" style={{ marginLeft: "auto", fontSize: "0.75rem", fontWeight: 500, padding: "7px 13px", borderRadius: 999, cursor: "pointer", fontFamily: font, border: `1px solid ${C.border}`, background: "transparent", color: C.muted }}>Delete</button>}
              </div>

              {/* comments — always open in the full view */}
              <div style={{ padding: "16px 22px 22px", borderTop: `1px solid ${C.border}` }}>
                {f.comments.length === 0 && <div style={{ fontSize: "0.75rem", color: C.muted, marginBottom: 12 }}>No comments yet.</div>}
                {f.comments.map(c => (
                  <div key={c.id} style={{ display: "flex", gap: 9, marginBottom: 10 }}>
                    <div style={{ width: 27, height: 27, borderRadius: "50%", flex: "0 0 auto", display: "grid", placeItems: "center", fontWeight: 600, fontSize: "0.6875rem", background: c.is_admin ? "var(--w14)" : "var(--w08)", color: c.is_admin ? C.white : C.muted }}>{initials(c.author_name)}</div>
                    <div style={{ background: c.is_admin ? "var(--w06)" : "var(--w03)", border: `1px solid ${c.is_admin ? "var(--w22)" : C.border}`, borderRadius: 12, padding: "9px 13px", flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                        <span style={{ fontSize: "0.75rem", fontWeight: 500, color: c.is_admin ? C.white : C.text }}>{c.author_name || "Member"}</span>
                        {c.is_admin && <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: C.white, background: "var(--w14)", padding: "1px 7px", borderRadius: 999, letterSpacing: "0.04em" }}>TEAM</span>}
                        <span style={{ fontSize: "0.6875rem", color: C.muted, marginLeft: "auto" }}>{timeAgo(c.created_at)}</span>
                      </div>
                      <div style={{ fontSize: "0.875rem", color: C.text, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{c.body}</div>
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input className="vivfb-in" value={commentDraft[f.id] || ""} onChange={e => setCommentDraft(d => ({ ...d, [f.id]: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") addComment(f); }}
                    placeholder={isAdmin ? "Reply as team…" : "Add a comment…"} style={{ flex: 1, background: "var(--w08)", border: `1px solid ${C.border}`, borderRadius: 10, color: C.white, fontFamily: font, fontSize: "0.875rem", padding: "11px 14px", outline: "none", transition: "border-color .14s, box-shadow .14s" }} />
                  <button onClick={() => addComment(f)} style={{ background: "var(--w10)", color: "var(--white)", border: "1px solid var(--w14)", fontFamily: font, fontWeight: 500, fontSize: "0.75rem", padding: "11px 18px", borderRadius: 999, cursor: "pointer" }}>Send</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Self-dismissing toasts (VIV-styled) — rendered whether or not the panel is open, so a member
          is notified the moment their feedback is resolved. Above every feedback overlay at z 1600. */}
      {toasts.length > 0 && (
        <div style={{ position: "fixed", left: "50%", bottom: isMobile ? 100 : 92, transform: "translateX(-50%)", zIndex: 1600, display: "flex", flexDirection: "column", gap: 8, alignItems: "center", pointerEvents: "none", fontFamily: font, width: "min(430px, calc(100vw - 32px))" }}>
          {toasts.map(t => (
            <div key={t.id} className="vivfb-toast" style={{ pointerEvents: "auto", width: "100%", boxSizing: "border-box", background: "var(--sheet)", border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 15px", color: C.text, fontSize: "0.875rem", fontWeight: 500, lineHeight: 1.5, boxShadow: "var(--shadowOv)", display: "flex", gap: 10, alignItems: "flex-start" }}>
              <span style={{ color: C.green, fontWeight: 600, flex: "0 0 auto" }}>✓</span>
              <span style={{ minWidth: 0 }}>{t.msg.replace(/^✓\s*/, "")}</span>
            </div>
          ))}
        </div>
      )}
    </>,
    document.body
  );
}
