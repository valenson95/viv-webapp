import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { listSetups, deleteSetup, markTaken } from "./dailySetups.js";
import { SECTIONS } from "./SetupGrader.jsx";
import { themeFit, themeRanks } from "./themes.js";

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

function dateLabel(iso) {
  if (!iso) return "Undated";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return String(iso); // new Date() doesn't throw — it yields Invalid Date
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// "Jul 10" — the always-visible per-card date chip (member ask: repeat tickers were undatable)
function shortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return isNaN(d) ? String(iso) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function daysAgo(iso) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return null;
  return Math.round((new Date(todayISO() + "T00:00:00") - d) / 86400e3);
}

export default function DailySetupsTab({ C, font, session, isAdmin, setPage }) {
  const [rows, setRows] = useState(null); // null = loading
  const [tableMissing, setTableMissing] = useState(false);
  const [openId, setOpenId] = useState(null);   // expanded scorecard
  const [lightbox, setLightbox] = useState(null); // chart url
  const [sortBy, setSortBy] = useState("date");   // "date" | "grade"
  const [view, setView] = useState("all");        // "all" | "taken"
  const [q, setQ] = useState("");                 // ticker search — cross-reference all posts of one name
  const [statusF, setStatusF] = useState(null);   // funnel chip filter — "pivot" | "coiling" | "fresh" | "triggered" | "faded"
  const [boardSort, setBoardSort] = useState({ k: "stage", d: 1 }); // board column sort — key + direction
  const [boardOpen, setBoardOpen] = useState(false); // collapsed by default: top rows only
  const [openDays, setOpenDays] = useState(() => new Set()); // date groups the user expanded — ALL collapsed by default (member ask 2026-07-10)

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

  // ── Repeat-ticker context (member ask, 2026-07-10): one ticker can appear across many days,
  // so every card carries its own date + a NEW / DAY-N badge + the grade change vs its previous
  // mention. History is computed over ALL posts (not the filtered view) so the count is honest.
  const tickerHistory = {};
  (rows || []).forEach(r => { (tickerHistory[r.ticker] = tickerHistory[r.ticker] || []).push(r); });
  Object.values(tickerHistory).forEach(list => list.sort((a, b) => String(a.trade_date || "").localeCompare(String(b.trade_date || ""))));
  const mentionInfo = (r) => {
    const list = tickerHistory[r.ticker] || [];
    const idx = list.findIndex(x => x.id === r.id);
    const prev = idx > 0 ? list[idx - 1] : null;
    return { nth: idx + 1, total: list.length, prev, first: list[0] || null };
  };

  // ── THE FUNNEL — status is DERIVED from the scorecard, never hand-curated (honest by design).
  // Mirrors the method members are taught: fresh idea → coiling base → tight at the pivot → triggered.
  //   pivot    = tight days at the pivot ticked (2-3), or tightening + volume dry-up together (2-1 & 2-2)
  //   coiling  = base is developing (any contraction evidence, or a repeat mention)
  //   fresh    = first look, no contraction evidence yet
  //   triggered= Valen marked it taken · faded = >5 days old and never triggered
  const statusOf = (r) => {
    const t = new Set(r.ticked || []);
    if (r.taken_at) return "triggered";
    if ((daysAgo(r.trade_date) ?? 0) > 5) return "faded";
    if (t.has("2-3") || (t.has("2-1") && t.has("2-2"))) return "pivot";
    if (t.has("2-1") || t.has("2-2") || mentionInfo(r).nth > 1) return "coiling";
    return "fresh";
  };
  const STATUS_META = {
    pivot:     { label: "At the pivot", col: C.goldBright, bg: "rgba(240,192,80,0.1)",  bd: C.borderGold,             tip: "Tight and coiled right at the buy point — the watch-closely list" },
    coiling:   { label: "Coiling",      col: "#3b82f6",    bg: "rgba(59,130,246,0.1)",  bd: "rgba(59,130,246,0.35)",  tip: "Base is developing — contraction started but not pivot-tight yet" },
    fresh:     { label: "Fresh",        col: C.text,       bg: "rgba(255,255,255,0.05)", bd: C.border,                 tip: "First look — on the radar, base not built yet" },
    triggered: { label: "✔ Triggered",  col: "#22c55e",    bg: "rgba(34,197,94,0.1)",   bd: "rgba(34,197,94,0.35)",   tip: "The gameplan became a live trade" },
    faded:     { label: "Faded",        col: C.muted,      bg: "rgba(255,255,255,0.04)", bd: C.border,                 tip: "Idea aged out — over 5 days without triggering" },
  };
  // Board = the LATEST post per ticker (index/market-context posts excluded).
  // A ticker whose ANY post is ✔ taken counts as TRIGGERED on the board — the taken mark may live on an
  // earlier mention (AXSM taken Jul 6, re-posted Jul 10) and must NEVER look deleted. Data is never touched.
  const STAGE_ORDER = ["pivot", "coiling", "fresh", "triggered", "faded"]; // actionable first
  const latestByTicker = Object.values(tickerHistory).map(list => list[list.length - 1]).filter(r => r.sector !== "Index");
  const boardRows = latestByTicker.map(r => {
    const anyTaken = (tickerHistory[r.ticker] || []).some(x => x.taken_at);
    return { r, s: anyTaken ? "triggered" : statusOf(r), mi: mentionInfo(r) };
  });
  const statusCounts = boardRows.reduce((m, x) => { m[x.s] = (m[x.s] || 0) + 1; return m; }, {});
  // sortable headers — click cycles asc/desc; default = funnel order, best checklist first
  const rankOf = (r, k) => { const tr = themeRanks(r.sector, r.trade_date); return tr && tr[k] ? tr[k] : 999; }; // 999 = unranked, sorts last
  const cmp = {
    stage: (a, b) => STAGE_ORDER.indexOf(a.s) - STAGE_ORDER.indexOf(b.s) || (b.r.pct || 0) - (a.r.pct || 0),
    ticker: (a, b) => String(a.r.ticker).localeCompare(String(b.r.ticker)),
    grade: (a, b) => (b.r.stars - a.r.stars) || ((b.r.pct || 0) - (a.r.pct || 0)),
    checks: (a, b) => (b.r.pct || 0) - (a.r.pct || 0),
    first: (a, b) => String(b.mi.first?.trade_date || "").localeCompare(String(a.mi.first?.trade_date || "")),
    wk: (a, b) => rankOf(a.r, "week") - rankOf(b.r, "week"),
    mo: (a, b) => rankOf(a.r, "month") - rankOf(b.r, "month"),
    theme: (a, b) => String(a.r.sector || "~").localeCompare(String(b.r.sector || "~")),
  };
  const sortedBoard = [...boardRows].sort((a, b) => {
    const base = (cmp[boardSort.k] || cmp.stage)(a, b);
    return boardSort.d < 0 ? -base : base;
  });

  // filter (funnel status → ticker search → All/Taken) then group: by date (default) or one ranked list (Top graded)
  const visRows = (rows || [])
    .filter(r => !statusF || (r.sector !== "Index" && statusOf(r) === statusF))
    .filter(r => !q.trim() || String(r.ticker || "").toUpperCase().includes(q.trim().toUpperCase()))
    .filter(r => view !== "taken" || r.taken_at);
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

  // ── Restyle tokens (approved mockup: mockups/daily-setups.html) — uniform card chrome + chip
  //    language, all built on the C palette / font prop. Presentation only; no logic depends on these.
  const faint = "rgba(255,255,255,0.45)";
  const cardChrome = {
    position: "relative",
    background: `linear-gradient(135deg, rgba(255,255,255,0.05), transparent 55%), ${C.glass}`,
    border: `1px solid ${C.border}`,
    borderRadius: 16,
    backdropFilter: "blur(24px) saturate(150%)",
    WebkitBackdropFilter: "blur(24px) saturate(150%)",
  };
  const microLabel = { fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: C.muted };
  const cardHead = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingBottom: 11, marginBottom: 14, borderBottom: `1px solid ${C.border}` };
  const segWrap = { display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 980, padding: 3, gap: 2, background: "rgba(255,255,255,0.02)" };
  const gradeBadge = (letter) => {
    const fam = (letter === "A+" || letter === "A")
      ? { bg: "rgba(34,197,94,0.15)", col: "#86efac", bd: "rgba(34,197,94,0.3)" }
      : letter === "B"
        ? { bg: C.goldDim, col: C.goldBright, bd: C.borderGold }
        : { bg: "rgba(239,68,68,0.12)", col: "#fca5a5", bd: "rgba(239,68,68,0.3)" };
    return { display: "inline-flex", minWidth: 22, height: 22, padding: "0 4px", borderRadius: 6, alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "0.74rem", background: fam.bg, color: fam.col, border: `1px solid ${fam.bd}`, flex: "none" };
  };

  return (
    <div id="panel-daily" style={{ fontFamily: font }}>
      {/* command header — page top (approved mockup): eyebrow · h1 · muted meta */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: "0.64rem", fontWeight: 700, letterSpacing: "0.17em", textTransform: "uppercase", color: C.gold }}>Daily Setups</div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.03em", color: C.white, margin: "5px 0 0" }}>On the Radar</h1>
        <div style={{ fontSize: "0.8rem", color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
          Posted fresh each market day{rows && rows.length ? ` · ${rows.length} idea${rows.length !== 1 ? "s" : ""} on the radar` : ""} · the chart, the read, and the full auditable scorecard behind every star · educational, not trade signals
        </div>
      </div>

      {/* THE FUNNEL — status chips (derived from each post's own scorecard) + the at-a-glance board */}
      {rows && rows.length > 0 && boardRows.length > 0 && (
        <div style={{ ...cardChrome, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ ...cardHead, marginBottom: 12 }}>
            <span style={{ ...microLabel, flex: 1 }}>The Funnel</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {["pivot", "coiling", "fresh", "triggered", "faded"].map(s => {
              const m = STATUS_META[s], n = statusCounts[s] || 0, on = statusF === s;
              if (!n) return null;
              return (
                <button key={s} onClick={() => setStatusF(on ? null : s)} title={m.tip}
                  style={{ background: on ? m.bg : "rgba(255,255,255,0.03)", color: on ? m.col : C.muted, border: `1px solid ${on ? m.bd : C.border}`, fontFamily: font, fontSize: "0.7rem", fontWeight: 800, padding: "6px 13px", borderRadius: 99, cursor: "pointer" }}>
                  {m.label} ({n})
                </button>
              );
            })}
            {statusF && <button onClick={() => setStatusF(null)} style={{ background: "transparent", border: "none", color: C.muted, fontSize: "0.8rem", cursor: "pointer" }}>× clear</button>}
            <span style={{ marginLeft: "auto", fontSize: "0.62rem", color: C.muted }}>status is read off each post's scorecard — nothing is hand-picked</span>
          </div>
          {/* the board: latest post per ticker — sortable, table-layout FIXED (headers can never drift
              from their cells), collapsed to the top rows with a toggle at BOTH top and bottom.
              Color discipline (Valen): only A+ or a 16/16 sweep earns green/gold — the rest stay dark. */}
          {(() => {
            const filteredBoard = sortedBoard.filter(x => !statusF || x.s === statusF);
            const LIMIT = 8;
            const shown = boardOpen ? filteredBoard : filteredBoard.slice(0, LIMIT);
            const toggle = (pos) => filteredBoard.length > LIMIT && (
              <button key={pos} onClick={() => setBoardOpen(o => !o)}
                style={{ margin: pos === "top" ? "0 0 8px" : "8px 0 0", width: "100%", background: "rgba(255,255,255,0.03)", border: `1px dashed ${C.border}`, color: C.muted, fontFamily: font, fontSize: "0.68rem", fontWeight: 800, padding: "6px 0", borderRadius: 10, cursor: "pointer" }}>
                {boardOpen ? "Collapse ▴" : `Show all ${filteredBoard.length} ▾`}
              </button>
            );
            const th = (key, label, tip) => (
              <th key={key} onClick={() => setBoardSort(s => ({ k: key, d: s.k === key ? -s.d : 1 }))} title={tip || `Sort by ${label}`}
                style={{ textAlign: "left", padding: "4px 8px 6px", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", overflow: "hidden", cursor: "pointer", userSelect: "none", color: boardSort.k === key ? C.goldBright : C.muted, fontSize: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {label}{boardSort.k === key ? (boardSort.d > 0 ? " ▾" : " ▴") : ""}
              </th>
            );
            const td = (children, extra) => ({ children, style: { padding: "7px 8px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "left", ...extra } });
            const rankCell = (rank) => rank == null
              ? { txt: "—", col: "rgba(255,255,255,0.25)", bold: false }
              : rank <= 5
                ? { txt: `Top ${rank}`, col: "#22c55e", bold: true }
                : { txt: `#${rank}`, col: C.muted, bold: false };
            return (
              <>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", fontSize: "0.76rem", minWidth: 640 }}>
                    <colgroup>
                      <col style={{ width: "10%" }} />{/* ticker  */}
                      <col style={{ width: "13%" }} />{/* grade   */}
                      <col style={{ width: "13%" }} />{/* checks  */}
                      <col style={{ width: "11%" }} />{/* first   */}
                      <col style={{ width: "10%" }} />{/* top 1W  */}
                      <col style={{ width: "10%" }} />{/* top 1M  */}
                      <col style={{ width: "33%" }} />{/* theme   */}
                    </colgroup>
                    <thead>
                      <tr>
                        {th("ticker", "Ticker")}
                        {th("grade", "Grade")}
                        {th("checks", "Checklist", "Criteria passed out of 16 — sort by score")}
                        {th("first", "First seen", "The date the ticker first entered the focus list")}
                        {th("wk", "Top (1W)", "The sector's rank on the weekly theme tracker at the post's date")}
                        {th("mo", "Top (1M)", "The sector's rank on the monthly theme tracker at the post's date")}
                        {th("theme", "Theme")}
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map(({ r, s, mi }) => {
                        const m = STATUS_META[s];
                        const fit = themeFit(r.sector, r.trade_date);
                        const tr = themeRanks(r.sector, r.trade_date);
                        const wk = rankCell(tr && tr.week ? tr.week : null);
                        const mo = rankCell(tr && tr.month ? tr.month : null);
                        const passed = (r.ticked || []).length;
                        const hot = r.letter === "A+" || passed === 16; // ONLY these earn the highlight
                        const cells = [
                          td(<><span style={{ fontWeight: 800, color: C.white }}>{r.ticker}</span>{s === "triggered" && <span title="Marked taken — this gameplan became a live trade" style={{ color: "#22c55e", marginLeft: 5, fontWeight: 800 }}>✔</span>}</>),
                          td(<><span style={{ fontWeight: 800, color: hot ? C.green : C.text }}>{r.letter}</span> <span style={{ color: hot ? C.goldBright : "rgba(255,255,255,0.3)", fontSize: "0.66rem" }}>{"★".repeat(r.stars)}</span></>),
                          td(<><span style={{ fontWeight: 800, color: hot ? C.goldBright : C.text }}>{passed}/16</span><span style={{ color: C.muted, marginLeft: 6, fontSize: "0.68rem" }}>{r.pct != null ? `${Math.round(r.pct * 100)}%` : ""}</span></>),
                          td(<span style={{ color: C.text }}>{shortDate(mi.first?.trade_date || r.trade_date)}</span>),
                          td(<span style={{ color: wk.col, fontWeight: wk.bold ? 800 : 400 }}>{wk.txt}</span>),
                          td(<span style={{ color: mo.col, fontWeight: mo.bold ? 800 : 400 }}>{mo.txt}</span>),
                          td(<span style={{ color: fit === "in" ? "#22c55e" : fit === "off" ? "#ef4444" : C.muted }}>{r.sector || "—"}{fit === "in" ? " ✓" : ""}</span>),
                        ];
                        return (
                          <tr key={r.id} onClick={() => { setQ(r.ticker); setStatusF(null); }} title={`${m.label} — ${m.tip}. Click to show ${r.ticker}'s full history below.`}
                            style={{ cursor: "pointer", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                            {cells.map((c, i) => <td key={i} style={c.style}>{c.children}</td>)}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {toggle("bottom")}
              </>
            );
          })()}
        </div>
      )}

      {rows && rows.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
          {/* sort — pill segmented control */}
          <div style={segWrap}>
            {[["date", "Newest"], ["grade", "Top graded"]].map(([k, lbl]) => (
              <button key={k} onClick={() => setSortBy(k)}
                style={{ border: "none", background: sortBy === k ? C.goldDim : "transparent", color: sortBy === k ? C.goldBright : C.muted, fontFamily: font, fontSize: "0.74rem", fontWeight: 700, padding: "7px 16px", borderRadius: 980, letterSpacing: "0.02em", cursor: "pointer" }}>{lbl}</button>
            ))}
          </div>
          <span style={{ width: 1, height: 18, background: C.border }} />
          {/* view filter — All / ✔ Taken pill segmented control (taken = green) */}
          <div style={segWrap}>
            {[["all", "All"], ["taken", "✔ Taken"]].map(([k, lbl]) => (
              <button key={k} onClick={() => setView(k)}
                style={{ border: "none", background: view === k ? (k === "taken" ? "rgba(34,197,94,0.12)" : C.goldDim) : "transparent", color: view === k ? (k === "taken" ? "#22c55e" : C.goldBright) : C.muted, fontFamily: font, fontSize: "0.74rem", fontWeight: 700, padding: "7px 15px", borderRadius: 980, letterSpacing: "0.02em", cursor: "pointer" }}>{lbl}</button>
            ))}
          </div>
          <span style={{ width: 1, height: 18, background: C.border }} />
          {/* ticker search */}
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 ticker…" spellCheck={false}
              title="Type a ticker to see its full history in the feed — every post, oldest thesis to latest"
              style={{ background: "rgba(255,255,255,0.04)", color: C.white, border: `1px solid ${q.trim() ? C.borderGold : C.border}`, fontFamily: font, fontSize: "0.72rem", fontWeight: 700, padding: q.trim() ? "7px 26px 7px 14px" : "7px 14px", borderRadius: 980, width: 130, outline: "none", textTransform: "uppercase" }} />
            {q.trim() && (
              <button onClick={() => setQ("")} aria-label="Clear search" style={{ position: "absolute", right: 8, background: "transparent", border: "none", color: faint, fontSize: "0.9rem", cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>
            )}
          </div>
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
        <div style={{ ...cardChrome, padding: "34px 20px", textAlign: "center", color: C.muted, fontSize: "0.86rem" }}>
          No setups published yet — the first daily post lands here.
        </div>
      ) : groups.length === 0 ? (
        <div style={{ ...cardChrome, padding: "30px 20px", textAlign: "center", color: C.muted, fontSize: "0.85rem" }}>
          No taken setups yet — ✔ Mark taken on a post when the trade is executed.
        </div>
      ) : groups.map((g, gi) => {
        // Emphasized day dividers — TODAY in gold, YESTERDAY named, older dates plain (member ask)
        const dAgo = g.date === "__ranked__" ? null : daysAgo(g.date);
        const rel = dAgo === 0 ? "TODAY" : dAgo === 1 ? "YESTERDAY" : null;
        // COLLAPSED BY DEFAULT (member ask): the feed is a row of dates — click a date to open its
        // charts. Search / Top-graded / funnel-chip views auto-expand (a filtered feed must show hits).
        const forceOpen = g.date === "__ranked__" || !!q.trim() || !!statusF || view === "taken";
        const dayOpen = forceOpen || openDays.has(g.date);
        const toggleDay = () => { if (forceOpen) return; setOpenDays(prev => { const n = new Set(prev); n.has(g.date) ? n.delete(g.date) : n.add(g.date); return n; }); };
        return (
        <div key={g.date + "-" + gi} style={{ marginBottom: dayOpen ? 22 : 12 }}>
          <div onClick={toggleDay} title={forceOpen ? undefined : dayOpen ? "Collapse this day" : "Show this day's charts"}
            style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 2px 12px", cursor: forceOpen ? "default" : "pointer", padding: "10px 14px", borderRadius: 12, border: `1px solid ${rel === "TODAY" ? C.borderGold : C.border}`, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ fontSize: rel === "TODAY" ? "0.78rem" : "0.66rem", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: rel === "TODAY" ? C.goldBright : C.gold, whiteSpace: "nowrap" }}>
              {rel ? <>{rel} <span style={{ color: C.muted, fontWeight: 700 }}>· {g.label}</span></> : g.label}
            </div>
            {!dayOpen && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0, overflow: "hidden" }}>
                {g.items.slice(0, 8).map(r => (
                  <span key={r.id} style={{ fontSize: "0.6rem", fontWeight: 800, color: r.taken_at ? C.green : C.text, border: `1px solid ${r.taken_at ? "rgba(34,197,94,0.35)" : C.border}`, borderRadius: 8, padding: "2px 7px", whiteSpace: "nowrap" }}>{r.ticker}{r.letter ? <span style={{ color: C.muted, fontWeight: 700 }}> {r.letter}</span> : null}</span>
                ))}
                {g.items.length > 8 && <span style={{ fontSize: "0.6rem", color: C.muted }}>+{g.items.length - 8} more</span>}
              </div>
            )}
            <div style={{ flex: 1, height: 1, background: rel === "TODAY" ? "rgba(240,192,80,0.35)" : C.border }} />
            {g.date !== "__ranked__" && <span style={{ fontSize: "0.62rem", color: C.muted, fontWeight: 700, whiteSpace: "nowrap" }}>{g.items.length} idea{g.items.length !== 1 ? "s" : ""}</span>}
            {!forceOpen && <span style={{ fontSize: "0.7rem", color: dayOpen ? C.muted : C.goldBright }}>{dayOpen ? "▴" : "▾"}</span>}
          </div>
          {dayOpen && g.items.map(r => {
            const mi = mentionInfo(r);
            const gradeUp = mi.prev && r.stars > mi.prev.stars;
            const gradeDown = mi.prev && r.stars < mi.prev.stars;
            const isStale = (daysAgo(r.trade_date) ?? 0) > 5 && !r.taken_at;
            const st = r.sector !== "Index" ? statusOf(r) : null;
            const stM = st ? STATUS_META[st] : null;
            const expanded = openId === r.id;
            const autoSet = new Set(r.auto || []);
            const tickedSet = new Set(r.ticked || []);
            // in/off-theme vs the weekly DeepVue tracker AT THE POST'S DATE (same rule as position tagging)
            const fit = themeFit(r.sector, r.trade_date);
            const fitCol = fit === "in" ? "#22c55e" : fit === "off" ? "#ef4444" : null;
            return (
              <div key={r.id} style={{ ...cardChrome, padding: "16px 18px", marginBottom: 14, opacity: isStale ? 0.78 : 1 }}>
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
                      {/* release date — always on the card, so repeats are datable even in ranked view */}
                      <span title={`Posted ${dateLabel(r.trade_date)}`} style={{ fontSize: "0.66rem", fontWeight: 800, color: C.text, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.border}`, padding: "3px 9px", borderRadius: 99, whiteSpace: "nowrap" }}>
                        {shortDate(r.trade_date)}
                      </span>
                      {/* mention badge: today's first-ever calls get NEW; any repeat shows DAY N + grade direction */}
                      {mi.nth === 1 && daysAgo(r.trade_date) === 0 && (
                        <span title={mi.total > 1 ? `First call — updated ${mi.total - 1}× since` : "First time on the radar"}
                          style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.08em", color: C.goldBright, background: "rgba(240,192,80,0.1)", border: `1px solid ${C.borderGold}`, padding: "3px 8px", borderRadius: 99 }}>NEW</span>
                      )}
                      {stM && (
                        <span title={stM.tip} style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.04em", color: stM.col, background: stM.bg, border: `1px solid ${stM.bd}`, padding: "3px 8px", borderRadius: 99, whiteSpace: "nowrap" }}>{stM.label}</span>
                      )}
                      {mi.nth > 1 && (
                        <span title={`On the focus list since ${dateLabel(mi.first.trade_date)} (first call: ${mi.first.letter}) — mention ${mi.nth} of ${mi.total} · previous: ${shortDate(mi.prev.trade_date)} (${mi.prev.letter})${gradeUp ? " · setup improving" : gradeDown ? " · setup weakening" : ""}`}
                          style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.08em", color: gradeUp ? "#22c55e" : gradeDown ? "#ef4444" : C.muted, background: gradeUp ? "rgba(34,197,94,0.1)" : gradeDown ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.05)", border: `1px solid ${gradeUp ? "rgba(34,197,94,0.35)" : gradeDown ? "rgba(239,68,68,0.35)" : C.border}`, padding: "3px 8px", borderRadius: 99, whiteSpace: "nowrap" }}>
                          DAY {mi.nth} · since {shortDate(mi.first.trade_date)}{mi.prev ? ` · ${mi.prev.letter}→${r.letter}${gradeUp ? " ↑" : gradeDown ? " ↓" : ""}` : ""}
                        </span>
                      )}
                      {r.setup_type && (
                        <span style={{ fontSize: "0.66rem", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#3b82f6", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.35)", padding: "3px 10px", borderRadius: 99 }}>{r.setup_type}</span>
                      )}
                      {r.sector && (
                        <span title={fit ? (fit === "in" ? "Sector is top-5 (1W or 1M) on the theme tracker at this date — flowing WITH the trend" : "Sector is NOT top-5 on the theme tracker at this date — fighting the rotation") : "No theme snapshot covers this date"}
                          style={{ fontSize: "0.7rem", fontWeight: 700, color: fitCol || C.muted, background: fit === "in" ? "rgba(34,197,94,0.1)" : fit === "off" ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.05)", border: `1px solid ${fitCol ? (fit === "in" ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)") : C.border}`, padding: "3px 10px", borderRadius: 99 }}>
                          {r.sector}{fit ? (fit === "in" ? " · in theme" : " · off theme") : ""}
                        </span>
                      )}
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginLeft: isAdmin ? 0 : "auto" }}>
                        <span style={gradeBadge(r.letter)}>{r.letter}</span>
                        <Stars C={C} n={r.stars} size="0.72rem" />
                      </span>
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
                    {r.note && <div style={{ fontSize: "0.84rem", color: C.text, lineHeight: 1.58, marginTop: 11 }}>{r.note}</div>}
                    <button onClick={() => setOpenId(expanded ? null : r.id)}
                      style={{ marginTop: 11, background: "rgba(201,152,42,0.08)", color: C.gold, border: `1px solid ${C.borderGold}`, fontFamily: font, fontSize: "0.7rem", fontWeight: 800, padding: "6px 13px", borderRadius: 99, cursor: "pointer" }}>
                      {expanded ? "Hide the scorecard ▴" : "See the scorecard ▾"}
                    </button>
                  </div>
                </div>

                {/* auditable scorecard: all 16 ticks flat, no subheaders (Valen's spec) */}
                {expanded && (
                  <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                    <div style={{ ...cardHead, paddingBottom: 9, marginBottom: 11 }}>
                      <span style={{ ...microLabel }}>Setup-Grader Scorecard</span>
                      <span title="16 scored criteria — ★ marks a confluence factor (★-maker); a gold dot ● marks a tick VIV auto-read off the chart. Every grade is auditable: each star traces to its ticks." style={{ width: 15, height: 15, borderRadius: "50%", border: `1px solid ${C.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.6rem", fontWeight: 700, fontStyle: "italic", color: faint, cursor: "help", flex: "none" }}>i</span>
                      <span style={{ background: C.goldDim, color: C.goldBright, fontSize: "0.62rem", fontWeight: 800, padding: "2px 9px", borderRadius: 980, marginLeft: "auto" }}>{tickedSet.size}/16 criteria</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {SECTIONS.flatMap((sec, si) => sec.reminder ? [] : sec.items.map((it, ii) => {
                        const k = si + "-" + ii, isOn = tickedSet.has(k);
                        return (
                          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.72rem", fontWeight: 600, padding: "5px 11px", borderRadius: 980, border: `1px solid ${isOn ? "rgba(34,197,94,0.28)" : C.border}`, background: isOn ? "rgba(34,197,94,0.06)" : "rgba(255,255,255,0.03)", color: isOn ? C.text : faint }}>
                            <span style={{ fontWeight: 800, color: isOn ? C.green : "rgba(255,255,255,0.22)" }}>{isOn ? "✓" : "✗"}</span>
                            {it.c}
                            {it.star && <span title="★-maker (confluence factor)" style={{ fontSize: "0.62rem", color: isOn ? C.goldMid : "rgba(255,255,255,0.2)" }}>★</span>}
                            {isOn && autoSet.has(k) && <span title="Auto-read from the chart by VIV" style={{ fontSize: "0.56rem", color: C.goldBright }}>●</span>}
                          </span>
                        );
                      }))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        );
      })}

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
