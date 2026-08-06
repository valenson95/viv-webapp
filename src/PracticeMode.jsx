import React, { useEffect, useMemo, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// PRACTICE MODE — a fully self-contained paper-trading sandbox.
//
// CRITICAL ISOLATION: every byte of practice data lives ONLY in localStorage under
// a per-user key. This component NEVER imports the Supabase client, never touches
// the real `trades` / `positions` tables, the journal, analytics, P&L or R stats.
// A member's hypothetical scribbles must be provably incapable of leaking into
// their real account — so there is deliberately no data layer here beyond the
// browser's localStorage. Do not add one.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_PREFIX = "viv-practice-v1-";
const storageKeyFor = (uid) => `${STORAGE_PREFIX}${uid || "anon"}`;

// Scoped mobile CSS (pattern mirrors Feedback.jsx's FB_CSS): the top row (log form + stats card)
// is a fixed 1.35fr/1fr grid that squeezes the form to ~195px on a 390px phone — stack it full-width
// below 760px instead. The Entry/Stop/Target 3-up grid is left alone once the outer column is full width.
const PM_CSS = `
@media (max-width: 760px){ .pm-toprow{ grid-template-columns: 1fr !important; } }
`;

// ── pure helpers (module scope, never components) ──
const toNum = (v) => {
  if (v === "" || v == null) return NaN;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const dirMult = (dir) => (dir === "short" ? -1 : 1);
const riskPerShare = (entry, stop) => Math.abs(entry - stop);
// direction-aware reward:risk from an optional target
const rrRatio = (dir, entry, stop, target) => {
  const rps = riskPerShare(entry, stop);
  if (!rps || !Number.isFinite(target)) return null;
  return (dirMult(dir) * (target - entry)) / rps;
};
// direction-aware realised R multiple at an exit price
const rMultiple = (dir, entry, stop, exit) => {
  const rps = riskPerShare(entry, stop);
  if (!rps) return null;
  return (dirMult(dir) * (exit - entry)) / rps;
};
// hypothetical P&L in dollars at an exit price
const pnlDollars = (dir, entry, exit, shares) => dirMult(dir) * (exit - entry) * shares;

const fmtUsd = (v) => {
  if (!Number.isFinite(v)) return "—";
  const s = v < 0 ? "-" : "";
  return `${s}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
};
const fmtR = (v) => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}R` : "—");
const fmtNum = (v, dp = 2) => (Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: dp }) : "—");
const uid8 = () => Math.random().toString(36).slice(2, 10);

function loadIdeas(uid) {
  try {
    const raw = localStorage.getItem(storageKeyFor(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function PracticeMode({ C, font, session }) {
  const uid = session?.user?.id || "anon";

  const [ideas, setIdeas] = useState(() => loadIdeas(uid));
  const firstRun = useRef(true);

  // reload when the signed-in user changes (each member has their own sandbox)
  useEffect(() => {
    setIdeas(loadIdeas(uid));
    firstRun.current = true;
  }, [uid]);

  // persist on every change (skip the initial mount write)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    try { localStorage.setItem(storageKeyFor(uid), JSON.stringify(ideas)); } catch { /* private mode / quota */ }
  }, [ideas, uid]);

  const open = useMemo(() => ideas.filter((i) => i.status !== "closed"), [ideas]);
  const closed = useMemo(() => ideas.filter((i) => i.status === "closed"), [ideas]);

  const stats = useMemo(() => {
    const n = closed.length;
    if (!n) return { n: 0, wins: 0, winRate: null, avgR: null, totalR: null, totalPnl: 0 };
    let wins = 0, totalR = 0, totalPnl = 0, rCount = 0;
    for (const t of closed) {
      const r = rMultiple(t.dir, t.entry, t.stop, t.exit);
      if (Number.isFinite(r)) { totalR += r; rCount += 1; }
      const p = pnlDollars(t.dir, t.entry, t.exit, t.shares);
      if (Number.isFinite(p)) { totalPnl += p; if (p > 0) wins += 1; }
    }
    return {
      n,
      wins,
      winRate: (wins / n) * 100,
      avgR: rCount ? totalR / rCount : null,
      totalR: rCount ? totalR : null,
      totalPnl,
    };
  }, [closed]);

  const addIdea = (idea) => setIdeas((prev) => [idea, ...prev]);
  const closeIdea = (id, exit, closedR, closedPnl) =>
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, status: "closed", exit, closedAt: Date.now(), closedR, closedPnl } : i)));
  const deleteIdea = (id) => setIdeas((prev) => prev.filter((i) => i.id !== id));
  const clearAll = () => {
    if (!window.confirm("Clear ALL practice data? This wipes your practice sandbox (open + closed). It does not touch your real journal or positions.")) return;
    setIdeas([]);
    try { localStorage.removeItem(storageKeyFor(uid)); } catch { /* ignore */ }
  };

  // ── shared inline styles ──
  const card = { background: C.glass, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 };
  const label = { fontSize: "0.6875rem", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, marginBottom: 6, display: "block" };
  const input = {
    width: "100%", boxSizing: "border-box", background: "var(--w04)",
    border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px",
    color: C.white, fontSize: "0.875rem", fontWeight: 600, fontFamily: font, outline: "none",
  };

  return (
    <div style={{ fontFamily: font, color: C.text, maxWidth: 1080, margin: "0 auto" }}>
      <style dangerouslySetInnerHTML={{ __html: PM_CSS }} />
      {/* header */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 500, letterSpacing: 0, color: "var(--muted)" }}>Sandbox</div>
        <div style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em", marginTop: 4 }}>🧪 Practice</div>
        <div style={{ color: C.muted, fontSize: "0.875rem", marginTop: 6, maxWidth: 640 }}>
          Paper-trade any setup when you're unsure — log a hypothetical idea, close it at any price, and see how it would have played out. Test the market without risking a cent.
        </div>
      </div>

      {/* loud NOT-REAL banner */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginTop: 14, marginBottom: 22,
        background: "var(--w06)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px",
      }}>
        <span style={{ fontSize: "1.125rem", lineHeight: 1 }}>⚠️</span>
        <span style={{ fontSize: "0.875rem", fontWeight: 500, color: C.white, lineHeight: 1.5 }}>
          Practice mode — hypothetical trades only. Nothing here touches your real journal, positions, or stats.
        </span>
      </div>

      {/* log form + stats side by side on wide screens; stacks full-width below 760px via .pm-toprow */}
      <div className="pm-toprow" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)", gap: 18, alignItems: "start" }}>
        <IdeaForm C={C} font={font} card={card} label={label} input={input} onAdd={addIdea} />
        <StatsCard C={C} card={card} stats={stats} closedCount={closed.length} />
      </div>

      {/* open practice trades */}
      <SectionTitle C={C} title="Open practice trades" count={open.length} />
      {open.length === 0 ? (
        <EmptyState C={C} text="No open practice trades. Log an idea above to start testing a setup." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {open.map((t) => (
            <OpenRow key={t.id} C={C} font={font} input={input} t={t} onClose={closeIdea} onDelete={deleteIdea} />
          ))}
        </div>
      )}

      {/* closed practice trades */}
      <SectionTitle C={C} title="Closed practice trades" count={closed.length} />
      {closed.length === 0 ? (
        <EmptyState C={C} text="No closed practice trades yet. Close an open idea to see its hypothetical result here." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {closed.map((t) => (
            <ClosedRow key={t.id} C={C} t={t} onDelete={deleteIdea} />
          ))}
        </div>
      )}

      {/* clear */}
      <div style={{ marginTop: 34, marginBottom: 40, display: "flex", justifyContent: "center" }}>
        <button
          type="button"
          onClick={clearAll}
          style={{
            background: "transparent", border: `1px solid ${C.border}`, color: C.muted,
            fontFamily: font, fontWeight: 500, fontSize: "0.75rem", padding: "9px 18px",
            borderRadius: 999, cursor: "pointer",
          }}
        >
          Clear practice data
        </button>
      </div>
    </div>
  );
}

// ── LOG-AN-IDEA form ──
function IdeaForm({ C, font, card, label, input, onAdd }) {
  const [ticker, setTicker] = useState("");
  const [dir, setDir] = useState("long");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [sizeMode, setSizeMode] = useState("shares"); // "shares" | "risk"
  const [shares, setShares] = useState("");
  const [riskUsd, setRiskUsd] = useState("");
  const [err, setErr] = useState("");

  const e = toNum(entry), s = toNum(stop), tg = toNum(target);
  const rps = Number.isFinite(e) && Number.isFinite(s) ? riskPerShare(e, s) : NaN;

  // shares from either a direct count or a $ risk budget
  const computedShares = useMemo(() => {
    if (sizeMode === "shares") return Math.floor(toNum(shares));
    const rk = toNum(riskUsd);
    if (!Number.isFinite(rk) || !Number.isFinite(rps) || rps <= 0) return NaN;
    return Math.floor(rk / rps);
  }, [sizeMode, shares, riskUsd, rps]);

  const rr = rrRatio(dir, e, s, tg);
  const dollarRisk = Number.isFinite(rps) && Number.isFinite(computedShares) ? rps * computedShares : NaN;

  const validStopSide =
    Number.isFinite(e) && Number.isFinite(s) &&
    (dir === "long" ? s < e : s > e);

  const submit = () => {
    setErr("");
    if (!ticker.trim()) return setErr("Enter a ticker.");
    if (!Number.isFinite(e)) return setErr("Enter a valid entry price.");
    if (!Number.isFinite(s)) return setErr("Enter a valid stop price.");
    if (!validStopSide) return setErr(dir === "long" ? "For a long, the stop must be BELOW entry." : "For a short, the stop must be ABOVE entry.");
    if (!Number.isFinite(computedShares) || computedShares <= 0) return setErr("Enter share count or a $ risk that computes at least 1 share.");
    onAdd({
      id: uid8(),
      ticker: ticker.trim().toUpperCase(),
      dir,
      entry: e,
      stop: s,
      target: Number.isFinite(tg) ? tg : null,
      shares: computedShares,
      rps,
      rr: Number.isFinite(rr) ? rr : null,
      dollarRisk: Number.isFinite(dollarRisk) ? dollarRisk : null,
      status: "open",
      createdAt: Date.now(),
    });
    // reset (keep direction + size mode as sticky preferences)
    setTicker(""); setEntry(""); setStop(""); setTarget(""); setShares(""); setRiskUsd("");
  };

  const seg = (active) => ({
    flex: 1, padding: "9px 0", borderRadius: 999, border: "none", cursor: "pointer",
    fontFamily: font, fontWeight: 500, fontSize: "0.75rem",
    background: active ? "var(--w10)" : "transparent",
    color: active ? "var(--white)" : C.muted,
  });

  return (
    <div style={card}>
      <div style={{ fontSize: "1.125rem", fontWeight: 600, letterSpacing: "-0.012em", marginBottom: 16 }}>Log a practice idea</div>

      {/* ticker + direction */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={label}>Ticker</label>
          <input style={input} value={ticker} placeholder="AAPL" onChange={(ev) => setTicker(ev.target.value)} />
        </div>
        <div>
          <label style={label}>Direction</label>
          <div style={{ display: "flex", gap: 6, background: "var(--w03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: 4 }}>
            <button type="button" style={seg(dir === "long")} onClick={() => setDir("long")}>Long</button>
            <button type="button" style={seg(dir === "short")} onClick={() => setDir("short")}>Short</button>
          </div>
        </div>
      </div>

      {/* entry / stop / target — stays 3-up even on mobile once .pm-toprow stacks the outer column full-width (~110px/input, fine) */}
      <div className="pm-eps" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={label}>Entry</label>
          <input style={input} value={entry} placeholder="100.00" inputMode="decimal" onChange={(ev) => setEntry(ev.target.value)} />
        </div>
        <div>
          <label style={label}>Stop</label>
          <input style={input} value={stop} placeholder="95.00" inputMode="decimal" onChange={(ev) => setStop(ev.target.value)} />
        </div>
        <div>
          <label style={label}>Target <span style={{ opacity: 0.6, fontWeight: 600 }}>(opt)</span></label>
          <input style={input} value={target} placeholder="115.00" inputMode="decimal" onChange={(ev) => setTarget(ev.target.value)} />
        </div>
      </div>

      {/* size mode */}
      <div style={{ marginBottom: 12 }}>
        <label style={label}>Size by</label>
        <div style={{ display: "flex", gap: 6, background: "var(--w03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: 4, marginBottom: 10 }}>
          <button type="button" style={seg(sizeMode === "shares")} onClick={() => setSizeMode("shares")}>Shares</button>
          <button type="button" style={seg(sizeMode === "risk")} onClick={() => setSizeMode("risk")}>$ risk</button>
        </div>
        {sizeMode === "shares" ? (
          <input style={input} value={shares} placeholder="100 shares" inputMode="numeric" onChange={(ev) => setShares(ev.target.value)} />
        ) : (
          <input style={input} value={riskUsd} placeholder="$500 risk → computes shares" inputMode="decimal" onChange={(ev) => setRiskUsd(ev.target.value)} />
        )}
      </div>

      {/* live math preview */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, padding: "12px 14px", background: "var(--w03)", border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 14 }}>
        <Metric C={C} k="Risk / share" v={Number.isFinite(rps) ? fmtUsd(rps) : "—"} />
        <Metric C={C} k="Shares" v={Number.isFinite(computedShares) && computedShares > 0 ? fmtNum(computedShares, 0) : "—"} />
        <Metric C={C} k="$ risk" v={Number.isFinite(dollarRisk) ? fmtUsd(dollarRisk) : "—"} />
        <Metric C={C} k="R:R" v={Number.isFinite(rr) ? `${rr.toFixed(2)} : 1` : "—"} accent />
      </div>

      {err && <div style={{ color: C.red, fontSize: "0.75rem", fontWeight: 500, marginBottom: 10 }}>{err}</div>}

      <button
        type="button"
        onClick={submit}
        style={{
          width: "100%", background: `linear-gradient(135deg, ${C.goldMid}, ${C.goldBright})`, color: "var(--goldOn)",
          fontFamily: font, fontWeight: 600, fontSize: "0.875rem", padding: "12px 0", borderRadius: 999,
          border: "none", cursor: "pointer",
        }}
      >
        Add practice idea
      </button>
    </div>
  );
}

// ── practice-only stats ──
function StatsCard({ C, card, stats, closedCount }) {
  const items = [
    { k: "Closed", v: fmtNum(stats.n, 0) },
    { k: "Win rate", v: stats.winRate == null ? "—" : `${stats.winRate.toFixed(0)}%` },
    { k: "Avg R", v: fmtR(stats.avgR), col: stats.avgR == null ? C.muted : stats.avgR >= 0 ? C.green : C.red },
    { k: "Total R", v: fmtR(stats.totalR), col: stats.totalR == null ? C.muted : stats.totalR >= 0 ? C.green : C.red },
  ];
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontSize: "1.125rem", fontWeight: 600, letterSpacing: "-0.012em" }}>Practice stats</div>
        <div style={{ fontSize: "0.6875rem", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, background: "var(--w06)", border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 8px" }}>Practice only</div>
      </div>
      <div style={{ color: C.muted, fontSize: "0.75rem", marginBottom: 16 }}>Across your closed practice trades — never mixed with your real performance.</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {items.map((it) => (
          <div key={it.k} style={{ background: "var(--w03)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 12px" }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>{it.k}</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 500, letterSpacing: "-0.025em", color: it.col || C.white }}>{it.v}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, fontSize: "0.75rem", color: C.muted }}>
        Total hypothetical P&L: <b style={{ color: closedCount && stats.totalPnl >= 0 ? C.green : closedCount ? C.red : C.muted }}>{closedCount ? fmtUsd(stats.totalPnl) : "—"}</b>
      </div>
    </div>
  );
}

// ── an open trade row, with an inline close-at-exit control ──
function OpenRow({ C, font, input, t, onClose, onDelete }) {
  const [exitVal, setExitVal] = useState("");
  const exit = toNum(exitVal);
  const liveR = Number.isFinite(exit) ? rMultiple(t.dir, t.entry, t.stop, exit) : null;
  const livePnl = Number.isFinite(exit) ? pnlDollars(t.dir, t.entry, exit, t.shares) : null;

  const doClose = () => {
    if (!Number.isFinite(exit)) return;
    onClose(t.id, exit, Number.isFinite(liveR) ? liveR : null, Number.isFinite(livePnl) ? livePnl : null);
  };

  const dirTag = t.dir === "short"
    ? { t: "SHORT", c: C.red, bg: "rgba(255,80,0,0.12)" }
    : { t: "LONG", c: C.green, bg: "rgba(0,200,5,0.12)" };

  return (
    <div style={{ background: C.glass, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: "1rem", fontWeight: 600, letterSpacing: "-0.01em" }}>{t.ticker}</span>
        <span style={{ fontSize: "0.6875rem", fontWeight: 500, letterSpacing: "0.06em", color: dirTag.c, background: dirTag.bg, borderRadius: 999, padding: "3px 9px" }}>{dirTag.t}</span>
        <span style={{ flex: 1 }} />
        <Metric C={C} k="Entry" v={fmtNum(t.entry)} />
        <Metric C={C} k="Stop" v={fmtNum(t.stop)} />
        <Metric C={C} k="Target" v={t.target == null ? "—" : fmtNum(t.target)} />
        <Metric C={C} k="Shares" v={fmtNum(t.shares, 0)} />
        <Metric C={C} k="R:R" v={t.rr == null ? "—" : `${t.rr.toFixed(2)} : 1`} accent />
        <Metric C={C} k="$ risk" v={t.dollarRisk == null ? "—" : fmtUsd(t.dollarRisk)} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 10, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
        <div style={{ width: 150 }}>
          <label style={{ fontSize: "0.6875rem", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, marginBottom: 6, display: "block" }}>Exit price</label>
          <input style={input} value={exitVal} placeholder="close at…" inputMode="decimal" onChange={(ev) => setExitVal(ev.target.value)} />
        </div>
        {Number.isFinite(exit) && (
          <div style={{ display: "flex", gap: 14, paddingBottom: 8 }}>
            <Metric C={C} k="Would be" v={fmtR(liveR)} col={liveR >= 0 ? C.green : C.red} />
            <Metric C={C} k="P&L" v={fmtUsd(livePnl)} col={livePnl >= 0 ? C.green : C.red} />
          </div>
        )}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={doClose}
          disabled={!Number.isFinite(exit)}
          style={{
            background: Number.isFinite(exit) ? C.goldDim : "transparent", border: `1px solid ${C.borderGold}`,
            color: Number.isFinite(exit) ? C.goldBright : C.muted, fontFamily: font, fontWeight: 600, fontSize: "0.75rem",
            padding: "9px 18px", borderRadius: 999, cursor: Number.isFinite(exit) ? "pointer" : "default",
          }}
        >
          Close
        </button>
        <button
          type="button"
          onClick={() => onDelete(t.id)}
          title="Discard this practice idea"
          style={{ background: "transparent", border: `1px solid ${C.border}`, color: C.muted, fontFamily: font, fontWeight: 500, fontSize: "0.75rem", padding: "9px 14px", borderRadius: 999, cursor: "pointer" }}
        >
          Discard
        </button>
      </div>
    </div>
  );
}

// ── a closed trade row (read-only result) ──
function ClosedRow({ C, t, onDelete }) {
  const r = Number.isFinite(t.closedR) ? t.closedR : rMultiple(t.dir, t.entry, t.stop, t.exit);
  const pnl = Number.isFinite(t.closedPnl) ? t.closedPnl : pnlDollars(t.dir, t.entry, t.exit, t.shares);
  const win = Number.isFinite(pnl) && pnl > 0;
  const dirTag = t.dir === "short" ? "SHORT" : "LONG";
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, background: "var(--w03)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", opacity: 0.94 }}>
      <span style={{ fontSize: "1rem", fontWeight: 600 }}>{t.ticker}</span>
      <span style={{ fontSize: "0.6875rem", fontWeight: 500, letterSpacing: "0.06em", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 8px" }}>{dirTag}</span>
      <span style={{ fontSize: "0.75rem", color: C.muted }}>{fmtNum(t.entry)} → {fmtNum(t.exit)} · {fmtNum(t.shares, 0)} sh</span>
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: "0.6875rem", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: win ? C.green : C.red, background: win ? "rgba(0,200,5,0.10)" : "rgba(255,80,0,0.10)", borderRadius: 999, padding: "3px 10px" }}>{win ? "Win" : "Loss"}</span>
      <Metric C={C} k="R" v={fmtR(r)} col={Number.isFinite(r) && r >= 0 ? C.green : C.red} />
      <Metric C={C} k="P&L" v={fmtUsd(pnl)} col={Number.isFinite(pnl) && pnl >= 0 ? C.green : C.red} />
      <button
        type="button"
        onClick={() => onDelete(t.id)}
        title="Remove from practice history"
        style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: "0 2px" }}
      >
        ✕
      </button>
    </div>
  );
}

// ── tiny presentational helpers ──
function Metric({ C, k, v, accent, col }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: "0.6875rem", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted }}>{k}</div>
      <div style={{ fontSize: "0.875rem", fontWeight: 500, letterSpacing: "-0.025em", color: col || C.white, fontVariantNumeric: "tabular-nums" }}>{v}</div>
    </div>
  );
}

function SectionTitle({ C, title, count }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 30, marginBottom: 14 }}>
      <div style={{ fontSize: "1.125rem", fontWeight: 600, letterSpacing: "-0.012em" }}>{title}</div>
      <div style={{ fontSize: "0.6875rem", fontWeight: 500, letterSpacing: "-0.025em", fontVariantNumeric: "tabular-nums", color: C.muted, background: "var(--w06)", border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 9px" }}>{count}</div>
    </div>
  );
}

function EmptyState({ C, text }) {
  return (
    <div style={{ border: `1px dashed ${C.border}`, borderRadius: 14, padding: "26px 20px", textAlign: "center", color: C.muted, fontSize: "0.875rem" }}>
      {text}
    </div>
  );
}
