import React, { useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { GROUP_RS } from "./groupRS-data.js";
import { ETF_HOLDINGS } from "./etfHoldings-data.js";
import { LensCamera } from "./capture.jsx";

// ── ROTATION — group RS table + Plan & Focus ─────────────────────────────────
// Group-level rotation lens computed from ETF daily closes vs the equal-weight
// benchmark (RSP). Percentile metrics are own-trailing-window PERCENTRANK. Every
// number is bar-derived; a value that can't be computed shows blank with a reason.
// DeepVue stays the source of truth for single-stock RS and sector grouping.
//
// Member-safe: the whole page renders for any logged-in user; the collapsible
// "Method / formulas" card is ADMIN-ONLY (holds provenance). Educational, not advice.
//
// DESIGN = the webapp Pro system: near-black, palette C, Plus Jakarta (font prop),
// rounded-16 glass cards, uppercase gold section labels, gold-gradient active chips.

const ADMIN_EMAIL = "vc-lv@live.com";

const num = (v, d = 1) => v == null || !isFinite(v) ? "—" : (+v).toFixed(d);
const sgn = (v, d = 1) => v == null || !isFinite(v) ? "—" : (v > 0 ? "+" : "") + (+v).toFixed(d);
const SUP = ["¹", "²", "³"];

// PRIMARY-state chip metadata — NEUTRAL, no trade-advice wording. `label` = full
// (how-to / filters), `short` = compact table chip.
const STATE = {
  buy:     { emoji: "🟢", label: "Leading + accelerating", short: "Leading",     fg: "#7ef0a0", bg: "rgba(34,197,94,0.12)",  bd: "rgba(34,197,94,0.35)" },
  fresh:   { emoji: "🟡", label: "Fresh week surge",        short: "Fresh surge",  fg: "#f0c050", bg: "rgba(201,152,42,0.14)", bd: "rgba(201,152,42,0.4)" },
  resting: { emoji: "😴", label: "Strong month, cool week", short: "Cooling",      fg: "#93c5fd", bg: "rgba(59,130,246,0.12)", bd: "rgba(59,130,246,0.35)" },
};
const WARN = {
  artifact: { emoji: "⚠️", label: "Percentile illusion", short: "Illusion",  fg: "#fca5a5", bg: "rgba(239,68,68,0.10)", bd: "rgba(239,68,68,0.3)" },
  trap:     { emoji: "🪤", label: "Off the floor",       short: "Off floor", fg: "#fca5a5", bg: "rgba(239,68,68,0.10)", bd: "rgba(239,68,68,0.3)" },
};

// EW ↔ cap-weighted sector pairs for the pairing strip.
const SECTOR_PAIRS = [
  ["Financials", "RSPF", "XLF"], ["Energy", "RSPG", "XLE"], ["Staples", "RSPS", "XLP"],
  ["Real Estate", "RSPR", "XLRE"], ["Health", "RSPH", "XLV"], ["Communication", "RSPC", "XLC"],
  ["Materials", "RSPM", "XLB"], ["Discretionary", "RSPD", "XLY"], ["Industrials", "RSPN", "XLI"],
  ["Utilities", "RSPU", "XLU"], ["Technology", "RSPT", "XLK"],
];
const BLOCK_ORDER = ["Index", "Segment", "EW Sector", "SPDR Sector"];

// ── reusable multi-sort chain (up to 3 keys). Click = new primary + previous
// demoted; click the active primary again flips its direction. Shared by the
// Sector Groups table AND each Top-Down block (one hook call per instance —
// fixed count, never in a loop/condition, so React's hook-order rule holds).
function useSortChain(defaultChain) {
  const [chain, setChain] = useState(defaultChain);
  const clickSort = (key) => {
    if (!key) return;
    setChain(prev => {
      if (prev[0] && prev[0].key === key) { const n = [...prev]; n[0] = { key, dir: n[0].dir === "desc" ? "asc" : "desc" }; return n; }
      const rest = prev.filter(c => c.key !== key);
      return [{ key, dir: "desc" }, ...rest].slice(0, 3);
    });
  };
  const isDefault = chain.length === defaultChain.length && chain.every((c, i) => c.key === defaultChain[i].key && c.dir === defaultChain[i].dir);
  return { chain, clickSort, isDefault, reset: () => setChain(defaultChain) };
}

// ── generic multi-key comparator over a sort chain. null/undefined metrics
// (e.g. the RSP benchmark row) always sort last and never throw — no NaN math.
function chainComparator(chain) {
  return (a, b) => {
    for (const { key, dir } of chain) {
      const s = dir === "desc" ? 1 : -1;
      const va = a[key], vb = b[key];
      if (va == null && vb == null) continue;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = (typeof va === "string" || typeof vb === "string") ? (va < vb ? -1 : va > vb ? 1 : 0) : (va - vb);
      if (cmp !== 0) return -cmp * s;
    }
    return 0;
  };
}

// ── InfoDot — viewport-aware tooltip (portal to body, fixed from getBoundingClientRect).
// Left-edge dots open right, right-edge dots open left; flips above near the viewport
// bottom. Never clips inside a table's overflow-x container. House pattern (SetupGrader).
export function InfoDot({ tip, size = 14 }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const show = () => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, m = 8;
    const p = {};
    if (r.left < 170) p.left = Math.max(m, r.left);
    else if (vw - r.right < 170) p.right = Math.max(m, vw - r.right);
    else { p.left = r.left + r.width / 2; p.cx = true; }
    if (r.bottom + 150 < vh || r.top < 150) { p.top = r.bottom + 8; p.up = false; }
    else { p.top = r.top - 8; p.up = true; }
    setPos(p);
  };
  return (
    <span ref={ref} onMouseEnter={show} onMouseLeave={() => setPos(null)} onClick={e => e.stopPropagation()}
      style={{ width: size, height: size, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.16)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.56rem", fontWeight: 700, fontStyle: "italic", color: "rgba(255,255,255,0.5)", cursor: "help", flex: "none", verticalAlign: "middle" }}>
      i
      {pos && createPortal(
        <div style={{ position: "fixed", top: pos.top, left: pos.left, right: pos.right,
          transform: (pos.cx ? "translateX(-50%)" : "") + (pos.up ? " translateY(-100%)" : ""),
          zIndex: 1300, maxWidth: Math.min(300, window.innerWidth - 16), width: "max-content",
          background: "#13131c", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "9px 12px",
          fontSize: "0.66rem", fontWeight: 500, lineHeight: 1.55, color: "#E7E9EE", textTransform: "none", letterSpacing: 0,
          whiteSpace: "normal", textAlign: "left", boxShadow: "0 10px 30px rgba(0,0,0,0.55)", pointerEvents: "none", fontVariantNumeric: "normal" }}>
          {tip}
        </div>, document.body)}
    </span>
  );
}

// green heat 0..1 (deepest green = highest value)
const greenHeat = (frac) => frac == null ? "rgba(255,255,255,0.03)" : `rgba(34,197,94,${(0.06 + 0.42 * Math.max(0, Math.min(1, frac))).toFixed(3)})`;
// off-52W-high heat is RED and tracks MAGNITUDE: 0% ≈ neutral, −60% ≈ strong red.
// mag = how far below the high (|v|/60); deeper red = further below.
const off52Mag = (v) => v == null || !isFinite(v) || v >= 0 ? 0 : Math.min(1, Math.abs(v) / 60);
const redHeat = (mag) => !mag || mag <= 0.02 ? "rgba(255,255,255,0.03)" : `rgba(239,68,68,${(0.05 + 0.45 * Math.max(0, Math.min(1, mag))).toFixed(3)})`;

// ── HOLDINGS POPUP — nested ABOVE the rotation popup (z 1250) at z 1320, below
// modals (1400). Reads the committed ETF_HOLDINGS snapshot statically — never a
// runtime fetch. Clicking a ticker cell (Industry Groups + all four Top-Down blocks)
// opens it: top-N holdings, weight-sorted, TradingView-style (rank · ticker · name ·
// weight % · slim gold bar). NOT sortable, NOT interactive beyond scroll + close;
// closes on backdrop click. A ticker with no verifiable basket shows an honest note.
function HoldingsPopup({ target, onClose, C, font }) {
  if (!target) return null;
  const data = ETF_HOLDINGS?.byTicker?.[target.t];
  const asof = ETF_HOLDINGS?.asof || "—";
  const holdings = Array.isArray(data) ? data : null;
  const note = holdings ? null : (data?.note || "Holdings aren't published for this fund.");
  const weightsUnpublished = holdings && holdings.every(h => h.w == null);
  const maxW = holdings ? Math.max(0.0001, ...holdings.map(h => (h.w == null || !isFinite(h.w) ? 0 : h.w))) : 1;

  const label = { fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: C.gold };
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1320, background: "rgba(4,4,8,0.6)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", overflowY: "auto", padding: "40px 16px", fontFamily: font }}>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: 460, margin: "0 auto", background: "rgba(255,255,255,0.042)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, backdropFilter: "blur(24px) saturate(150%)", WebkitBackdropFilter: "blur(24px) saturate(150%)", boxShadow: "0 24px 70px rgba(0,0,0,0.6)", overflow: "hidden" }}>
        {/* header */}
        <div style={{ padding: "16px 18px 13px", borderBottom: `1px solid ${C.border}`, background: "linear-gradient(135deg,rgba(255,255,255,0.05),transparent 60%)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9, minWidth: 0 }}>
              <span style={{ fontSize: "1.05rem", fontWeight: 800, color: C.white, letterSpacing: "-0.01em" }}>{target.t}</span>
              <span style={{ fontSize: "0.72rem", fontWeight: 600, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{target.name || ""}</span>
            </div>
            <button onClick={onClose} title="Close" style={{ flex: "none", width: 26, height: 26, borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.03)", color: C.muted, fontSize: "0.9rem", cursor: "pointer", lineHeight: 1, fontFamily: font }}>×</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 7 }}>
            <span style={label}>{holdings ? `Top ${holdings.length} holdings · weighted` : "Holdings"}</span>
            <span style={{ fontSize: "0.6rem", fontWeight: 700, color: C.goldBright, fontVariantNumeric: "tabular-nums" }}>as of {asof}</span>
          </div>
          <div style={{ marginTop: 5, fontSize: "0.6rem", color: "rgba(255,255,255,0.42)", lineHeight: 1.5 }}>
            Holdings change slowly — refreshed periodically. Educational, not advice.
          </div>
        </div>
        {/* body */}
        {note ? (
          <div style={{ padding: "22px 20px", fontSize: "0.76rem", lineHeight: 1.6, color: C.muted }}>{note}</div>
        ) : (
          <div style={{ padding: "6px 0 8px", maxHeight: "62vh", overflowY: "auto" }}>
            {weightsUnpublished && (
              <div style={{ padding: "8px 18px 10px", fontSize: "0.62rem", lineHeight: 1.5, color: "rgba(255,255,255,0.42)" }}>
                Per-holding weights aren't published for this fund — showing the top names in the fund's own weight order.
              </div>
            )}
            {holdings.map((h, i) => {
              const frac = h.w == null || !isFinite(h.w) ? 0 : Math.max(0, Math.min(1, h.w / maxW));
              return (
                <div key={h.t + i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 18px", borderBottom: i < holdings.length - 1 ? `1px solid rgba(255,255,255,0.045)` : "none" }}>
                  <span style={{ flex: "none", width: 20, textAlign: "right", fontSize: "0.62rem", fontWeight: 700, color: "rgba(255,255,255,0.35)", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                  <span style={{ flex: "none", width: 58, fontSize: "0.74rem", fontWeight: 800, color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.t || "—"}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: "0.68rem", color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.n || ""}</span>
                  <span style={{ flex: "none", width: 74, display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                    {frac > 0 && <span style={{ flex: "none", display: "inline-block", width: Math.round(frac * 34) + 6, height: 7, borderRadius: 3, background: `linear-gradient(90deg, ${C.gold}, ${C.goldBright})` }} />}
                    <span style={{ flex: "none", width: 42, textAlign: "right", fontSize: "0.7rem", fontWeight: 700, color: h.w == null ? C.muted : C.text, fontVariantNumeric: "tabular-nums" }}>{h.w == null ? "—" : h.w.toFixed(2) + "%"}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>, document.body);
}

export default function GroupRS({ C, font, session }) {
  const isAdmin = (session?.user?.email || "").toLowerCase() === ADMIN_EMAIL;
  const [filter, setFilter] = useState("all"); // all | buy | fresh | resting | warn
  const [tab, setTab] = useState("groups");     // groups | planfocus
  const [howOpen, setHowOpen] = useState(true);
  const [methodOpen, setMethodOpen] = useState(false);
  const [holdingsFor, setHoldingsFor] = useState(null); // {t, name} of the ticker whose holdings popup is open
  const rootRef = useRef(null);

  // ── multi-sort chain (up to 3). Default = thrust desc → rs1m desc → off52 desc.
  const DEFAULT_CHAIN = [{ key: "thrust", dir: "desc" }, { key: "rs1m", dir: "desc" }, { key: "off52", dir: "desc" }];
  const groupSort = useSortChain(DEFAULT_CHAIN);
  const { chain, clickSort, isDefault: isDefaultChain, reset: resetGroupSort } = groupSort;

  // Top-Down View: PER-BLOCK independent sort state (preferred over one shared
  // spec — sorting "Segment" by Thrust shouldn't reorder "Index" underneath it).
  // Default chain = [] → falls back to the fixed rs1m-desc order below.
  const blockSortIndex = useSortChain([]);
  const blockSortSegment = useSortChain([]);
  const blockSortEW = useSortChain([]);
  const blockSortSPDR = useSortChain([]);
  const blockSorts = { "Index": blockSortIndex, "Segment": blockSortSegment, "EW Sector": blockSortEW, "SPDR Sector": blockSortSPDR };

  const asof = GROUP_RS?.asof || "—";
  const refreshed = GROUP_RS?.refreshed;
  const stamp = refreshed && refreshed !== asof ? `as of ${asof} · updated ${refreshed}` : `as of ${asof} close`;
  const allRows = GROUP_RS?.rows || [];
  const pf = GROUP_RS?.pf; // Plan & Focus rows — may be undefined while regenerating

  const cmpChain = chainComparator(chain);

  const view = useMemo(() => {
    let r = allRows.filter(row => {
      if (filter === "all") return true;
      if (filter === "warn") return (row.warns || []).length > 0;
      return row.state === filter;
    });
    return [...r].sort(cmpChain);
  }, [allRows, filter, chain]);

  const counts = useMemo(() => ({
    buy: allRows.filter(r => r.state === "buy").length,
    fresh: allRows.filter(r => r.state === "fresh").length,
    resting: allRows.filter(r => r.state === "resting").length,
    warn: allRows.filter(r => (r.warns || []).length > 0).length,
  }), [allRows]);

  // ── style primitives ──────────────────────────────────────────────────────
  const cardLabel = { fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: C.gold };
  const asofStyle = { fontSize: "0.62rem", fontWeight: 700, color: C.goldBright, fontVariantNumeric: "tabular-nums", textAlign: "right" };
  const chip = (active) => ({
    display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
    fontSize: "0.72rem", fontWeight: 700, padding: "7px 15px", borderRadius: 99, cursor: "pointer", fontFamily: font, transition: "all .14s",
    border: `1px solid ${active ? C.goldBright : C.border}`, color: active ? "#08080e" : C.muted,
    background: active ? `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})` : "rgba(255,255,255,0.03)",
  });
  const heat = (v) => v == null ? "transparent" : `rgba(34,197,94,${(0.06 + 0.4 * (v / 100)).toFixed(3)})`;
  const toneCol = (v) => v == null ? C.muted : v > 0 ? "#86efac" : v < 0 ? "#fca5a5" : C.muted;

  const Spark = ({ pts, stroke = C.goldBright }) => {
    if (!pts || pts.length < 2) return <span style={{ color: C.muted, fontSize: "0.7rem" }}>—</span>;
    const W = 90, H = 26, n = pts.length;
    const d = pts.map((v, i) => `${(i / (n - 1) * (W - 2) + 1).toFixed(1)},${((1 - v) * (H - 4) + 2).toFixed(1)}`).join(" ");
    return (<svg width={W} height={H} style={{ display: "block", margin: "0 auto" }}><polyline points={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" /></svg>);
  };
  const RsStrip = ({ pts }) => {
    if (!pts || !pts.length) return <span style={{ color: C.muted, fontSize: "0.7rem" }}>—</span>;
    const H = 26, bw = 2.6, gap = 1, W = pts.length * (bw + gap);
    return (<svg width={W} height={H} style={{ display: "block", margin: "0 auto" }}>{pts.map((v, i) => {
      const h = Math.max(1.5, (v ?? 0) * (H - 2));
      return <rect key={i} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={0.6} fill={`rgba(34,197,94,${(0.35 + 0.55 * (v ?? 0)).toFixed(2)})`} />;
    })}</svg>);
  };
  const StateChips = ({ row }) => (
    <span style={{ display: "inline-flex", gap: 5, flexWrap: "wrap" }}>
      {row.state && (() => { const s = STATE[row.state]; return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.6rem", fontWeight: 800, padding: "2px 8px", borderRadius: 980, background: s.bg, border: `1px solid ${s.bd}`, color: s.fg, whiteSpace: "nowrap" }}>{s.emoji} {s.short}</span>
      ); })()}
      {(row.warns || []).map(w => { const g = WARN[w]; return (
        <span key={w} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.6rem", fontWeight: 800, padding: "2px 8px", borderRadius: 980, background: g.bg, border: `1px solid ${g.bd}`, color: g.fg, whiteSpace: "nowrap" }}>{g.emoji} {g.short}</span>
      ); })}
      {!row.state && !(row.warns || []).length && <span style={{ color: C.muted, fontSize: "0.7rem" }}>—</span>}
    </span>
  );

  const td = { padding: "7px 9px", borderBottom: `1px solid ${C.border}`, fontSize: "0.74rem", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: C.text };

  const jc = (align) => align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start";
  // sortable header cell (multi-sort aware) — takes the chain/onSort to sort BY so the
  // same header can drive either the shared groups chain or one block's own chain.
  // Header alignment MUST match its cell content.
  const th = (chainSpec, onSort, label, tip, key, align = "left") => {
    const ci = chainSpec.findIndex(c => c.key === key);
    const active = ci >= 0;
    return (
      <th onClick={() => onSort(key)} style={{ padding: "8px 9px", fontSize: "0.55rem", fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: active ? C.goldBright : C.muted, borderBottom: `1px solid ${C.border}`, textAlign: align, whiteSpace: "nowrap", cursor: key ? "pointer" : "default", userSelect: "none" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: jc(align) }}>
          {label}{active ? (chainSpec[ci].dir === "desc" ? " ▾" : " ▴") + SUP[ci] : ""}{tip && <InfoDot tip={tip} />}
        </span>
      </th>
    );
  };
  // static (non-sortable) header cell — Group, the two sparkline columns, and State.
  const sth = (label, tip, align = "left") => (
    <th style={{ padding: "8px 9px", fontSize: "0.55rem", fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: C.muted, borderBottom: `1px solid ${C.border}`, textAlign: align, whiteSpace: "nowrap" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, justifyContent: jc(align) }}>{label}{tip && <InfoDot tip={tip} />}</span>
    </th>
  );

  // one shared data row (used by Groups table AND Plan & Focus blocks). No ★ column.
  const DataRow = ({ row }) => {
    const blank = row.err || null;
    const bench = !!row.benchmark;
    const spy = row.t === "SPY";
    const benchCell = <span style={{ color: C.muted, fontStyle: "italic" }}>benchmark</span>;
    return (
      <tr style={spy ? { boxShadow: `inset 3px 0 0 ${C.gold}` } : undefined}>
        <td style={{ ...td, fontWeight: 800, color: C.white }}>
          <span className="grs-tk" title="View top holdings" onClick={() => setHoldingsFor({ t: row.t, name: row.name })}>{row.t}</span>
        </td>
        <td style={{ ...td, color: C.muted, whiteSpace: "normal", minWidth: 130, maxWidth: 200 }}>{row.name}</td>
        <td style={{ ...td, textAlign: "right", background: bench ? "transparent" : heat(row.thrust) }}>
          {bench ? benchCell : (row.thrust == null ? <span title={blank || "not computed"} style={{ color: C.muted }}>—</span> : <span title={`exact ${row.thrust}`} style={{ fontWeight: 700 }}>{row.thrust_snap}</span>)}
        </td>
        <td style={{ ...td, textAlign: "right", background: bench ? "transparent" : heat(row.rs1m) }}>
          {bench ? benchCell : (row.rs1m == null ? <span title={blank || "not computed"} style={{ color: C.muted }}>—</span> : <span title={`exact ${row.rs1m}`} style={{ fontWeight: 700 }}>{row.rs1m_snap}</span>)}
        </td>
        <td style={{ ...td, textAlign: "center" }}>{row.spark?.length ? <Spark pts={row.spark} /> : <span style={{ color: C.muted }}>—</span>}</td>
        <td style={{ ...td, textAlign: "center" }}>{row.rsSpark?.length ? <RsStrip pts={row.rsSpark} /> : <span style={{ color: C.muted }}>—</span>}</td>
        <td style={{ ...td, textAlign: "right", color: toneCol(row.pctIntraday) }}>{row.pctIntraday == null ? "—" : sgn(row.pctIntraday) + "%"}</td>
        <td style={{ ...td, textAlign: "right", color: toneCol(row.pct1d) }}>{row.pct1d == null ? "—" : sgn(row.pct1d) + "%"}</td>
        <td style={{ ...td, textAlign: "right", color: toneCol(row.pct1m), position: "relative", overflow: "hidden" }}>
          {row.pct1m != null && isFinite(row.pct1m) && row.pct1m !== 0 && (
            <div style={{ position: "absolute", top: 4, bottom: 4, right: 0, width: `${(Math.min(1, Math.abs(row.pct1m) / 15) * 100).toFixed(1)}%`, background: row.pct1m > 0 ? "rgba(34,197,94,0.16)" : "rgba(239,68,68,0.16)", borderRadius: 3, pointerEvents: "none" }} />
          )}
          <span style={{ position: "relative" }}>{row.pct1m == null ? "—" : sgn(row.pct1m) + "%"}</span>
        </td>
        <td style={{ ...td, textAlign: "right", background: bench ? "transparent" : redHeat(off52Mag(row.off52)), color: row.off52 == null ? C.muted : row.off52 >= -0.05 ? "#86efac" : "#fca5a5" }}>
          {row.off52 == null ? "—" : (row.off52 >= -0.05 ? "0%" : sgn(row.off52) + "%")}
        </td>
        <td style={{ ...td, textAlign: "center" }}>{bench ? <span style={{ color: C.muted }}>—</span> : <StateChips row={row} />}</td>
      </tr>
    );
  };

  // shared by the Sector Groups table (global chain) AND each Top-Down block
  // (its own chain) — caller supplies which sort chain/handler this header drives.
  const HeadRow = ({ chain: hChain, onSort }) => (
    <tr>
      {th(hChain, onSort, "Ticker", "The ETF that tracks this group.", "t")}
      {sth("Group", "What kind of stocks this ETF holds.")}
      {th(hChain, onSort, "Thrust %", "This week's momentum, ranked 0–100. Higher = money rushing in right now.", "thrust", "right")}
      {th(hChain, onSort, "1-Month RS %", "This month's strength, ranked 0–100 vs its own history. 100 = its strongest in a month.", "rs1m", "right")}
      {sth("1-Month price", "The group's price shape over the last month.", "center")}
      {sth("1-Month RS", "Is the group beating the market lately? Rising bars = yes.", "center")}
      {th(hChain, onSort, "% Intraday", "Today's move from the open — ignoring the overnight gap.", "pctIntraday", "right")}
      {th(hChain, onSort, "% 1-Day", "Today's change vs yesterday's close.", "pct1d", "right")}
      {th(hChain, onSort, "% 1-Month", "Plain price change over the last month.", "pct1m", "right")}
      {th(hChain, onSort, "% off 52W H", "How far below its 1-year high it sits. 0% = right at highs.", "off52", "right")}
      {sth("State", "🟢 leading · 🟡 fresh surge · 😴 cooling · ⚠️ illusion · 🪤 off the floor.", "center")}
    </tr>
  );

  const filterChips = [
    ["all", `All (${allRows.length})`],
    ["buy", `🟢 Leading + accelerating (${counts.buy})`],
    ["fresh", `🟡 Fresh week surge (${counts.fresh})`],
    ["resting", `😴 Strong month, cool week (${counts.resting})`],
    ["warn", `⚠️🪤 Flags (${counts.warn})`],
  ];

  const howLines = [
    ["1M RS%", "where today sits in THIS GROUP'S OWN last month of market-relative strength. 100 = its strongest day of the month."],
    ["Thrust%", "the same read for the last WEEK, with today weighted heaviest. Speed, not position."],
    ["🟢 Leading + accelerating", "strong month AND strong week — near the top on both reads."],
    ["🟡 Fresh week surge", "week far ahead of its month — new interest, unproven."],
    ["😴 Strong month, cool week", "a leader taking a breather — strong month, quiet week."],
    ["⚠️ Percentile illusion", "RS% high but the actual month is NEGATIVE."],
    ["🪤 Off the floor", "big thrust but ≥15% below its 52-week high — a bounce, not a breakout."],
  ];

  // ── Plan & Focus (only when GROUP_RS.pf is present) ────────────────────────
  const PlanFocus = () => {
    const rows = pf || [];
    const byTicker = Object.fromEntries(rows.map(r => [r.t, r]));
    const blocks = BLOCK_ORDER.map(b => {
      let br = rows.filter(r => r.block === b);
      const bench = br.filter(r => r.benchmark);
      const restRaw = br.filter(r => !r.benchmark);
      const bChain = blockSorts[b].chain;
      // no sort active → fixed default order (rs1m desc, same as before this was sortable).
      // sort active → the chain comparator (nulls always sort last, never crashes).
      const rest = bChain.length
        ? [...restRaw].sort(chainComparator(bChain))
        : [...restRaw].sort((a, x) => (x.rs1m ?? -1) - (a.rs1m ?? -1));
      return { block: b, rows: [...bench, ...rest] }; // benchmark (RSP) pinned first, never sorted
    }).filter(b => b.rows.length);

    const miniChip = (lbl, v, frac) => (
      <span title={lbl} style={{ minWidth: 26, textAlign: "center", fontSize: "0.6rem", fontWeight: 800, padding: "2px 6px", borderRadius: 6, background: greenHeat(frac), border: `1px solid ${C.border}`, color: C.text, fontVariantNumeric: "tabular-nums" }}>{v == null ? "—" : Math.round(v)}</span>
    );

    const pairTag = (rsp, xl) => {
      const a = rsp?.rs1m, b = xl?.rs1m;
      if (a == null || b == null) return { t: "No data", fg: C.muted, bg: "rgba(255,255,255,0.04)", bd: C.border, tip: "No reading for one side today." };
      if (a >= 70 && b >= 70 && Math.abs(b - a) <= 20) return { t: "Broad", fg: "#7ef0a0", bg: "rgba(34,197,94,0.12)", bd: "rgba(34,197,94,0.35)", tip: "The whole sector is moving together — healthy." };
      if (b - a >= 25) return { t: "Narrow", fg: "#f0c050", bg: "rgba(201,152,42,0.14)", bd: "rgba(201,152,42,0.4)", tip: "Just a few giant stocks are carrying it." };
      if (a < 40 && b < 40) return { t: "Weak", fg: "#fca5a5", bg: "rgba(239,68,68,0.12)", bd: "rgba(239,68,68,0.35)", tip: "Both sides are lagging the market." };
      return { t: "Mixed", fg: C.muted, bg: "rgba(255,255,255,0.04)", bd: C.border, tip: "In between — not clearly broad or narrow." };
    };

    return (
      <>
        {blocks.map(b => {
          const bs = blockSorts[b.block];
          return (
            <section key={b.block} className="grs-card" style={{ padding: "6px 8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 10px 4px" }}>
                <span style={cardLabel}>{b.block}</span>
                {!bs.isDefault && (
                  <button onClick={bs.reset} title="Restore the default order"
                    style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.62rem", fontWeight: 700, padding: "4px 10px", borderRadius: 99, cursor: "pointer", fontFamily: font, border: `1px solid ${C.border}`, color: C.muted, background: "rgba(255,255,255,0.03)" }}>
                    × reset sort
                  </button>
                )}
              </div>
              <div style={{ overflowX: "auto" }}>
                <table><thead><HeadRow chain={bs.chain} onSort={bs.clickSort} /></thead><tbody>{b.rows.map(r => <DataRow key={r.t} row={r} />)}</tbody></table>
              </div>
            </section>
          );
        })}

        {/* EW ↔ CW pairing strip */}
        <section className="grs-card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={cardLabel}>Equal-weight ↔ cap-weighted</span>
            <InfoDot tip="Equal-weight (RSP-) beside cap-weighted (XL-). Broad = the whole sector is moving; Narrow = just a few giant stocks." />
          </div>
          <p style={{ margin: "0 0 12px", fontSize: "0.74rem", lineHeight: 1.55, color: C.muted, maxWidth: "92ch" }}>
            Equal-weight vs cap-weighted: when both are strong and close, the WHOLE sector is working — when only the cap-weighted side is strong, a few megacaps are carrying it.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px,1fr))", gap: 10 }}>
            {SECTOR_PAIRS.map(([name, rspT, xlT]) => {
              const rsp = byTicker[rspT], xl = byTicker[xlT];
              const tag = pairTag(rsp, xl);
              return (
                <div key={name} style={{ padding: "11px 13px", borderRadius: 11, background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 9 }}>
                    <span style={{ fontSize: "0.76rem", fontWeight: 800, color: C.white }}>{name}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.58rem", fontWeight: 800, padding: "2px 8px", borderRadius: 980, background: tag.bg, border: `1px solid ${tag.bd}`, color: tag.fg }}>{tag.t}<InfoDot tip={tag.tip} size={12} /></span>
                  </div>
                  {[[rspT, rsp], [xlT, xl]].map(([tk, r]) => (
                    <div key={tk} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.68rem", marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, color: C.muted, width: 46, flex: "none" }}>{tk}</span>
                      <span style={{ color: C.muted, fontSize: "0.56rem", width: 34, flex: "none" }}>thr</span>
                      {miniChip("Thrust", r?.thrust, r?.thrust == null ? null : r.thrust / 100)}
                      <span style={{ color: C.muted, fontSize: "0.56rem", width: 18, flex: "none", textAlign: "right" }}>rs</span>
                      {miniChip("1M RS", r?.rs1m, r?.rs1m == null ? null : r.rs1m / 100)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      </>
    );
  };

  return (
    <div ref={rootRef} className="grs" style={{ fontFamily: font, maxWidth: 1440, margin: "0 auto", color: C.text }}>
      <style>{`
        .grs .grs-card{position:relative;background:rgba(255,255,255,0.042);border:1px solid rgba(255,255,255,0.09);border-radius:16px;backdrop-filter:blur(24px) saturate(150%);-webkit-backdrop-filter:blur(24px) saturate(150%);padding:18px 20px;margin-bottom:14px}
        .grs .grs-card::before{content:'';position:absolute;inset:0;pointer-events:none;border-radius:inherit;background:linear-gradient(135deg,rgba(255,255,255,0.05),transparent 55%)}
        .grs table{border-collapse:collapse;width:100%}
        .grs thead th{position:sticky;top:0;background:#0c0c14;z-index:2}
        .grs tbody tr{transition:background .12s}
        .grs tbody tr:hover{background:rgba(255,255,255,0.028)}
        .grs .grs-tk{cursor:pointer;text-decoration:underline;text-decoration-color:rgba(201,152,42,0.4);text-underline-offset:3px;text-decoration-thickness:1px;transition:color .12s}
        .grs .grs-tk:hover{color:${C.goldBright}}
      `}</style>

      {/* 1 — HEADER */}
      <section className="grs-card" style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...cardLabel, marginBottom: 6 }}>Rotation</div>
          <h1 style={{ margin: "0 0 6px", fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.02em", color: C.white }}>Rotation — sector groups & top-down view</h1>
          <p style={{ margin: 0, fontSize: "0.8rem", lineHeight: 1.6, color: C.muted, maxWidth: "72ch" }}>
            Which groups are accelerating, which are resting, which are traps — computed daily from ETF closes vs the equal-weight benchmark. Educational, not advice.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LensCamera getEl={() => rootRef.current} name="rotation-full" C={C} />
          <div style={asofStyle}>{stamp}</div>
        </div>
      </section>

      {/* 2 — HOW TO READ THIS */}
      <section className="grs-card">
        <div onClick={() => setHowOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
          <span style={{ ...cardLabel, flex: 1 }}>How to read this</span>
          <span style={{ fontSize: "0.7rem", color: C.muted }}>{howOpen ? "▴" : "▾"}</span>
        </div>
        {howOpen && (
          <div style={{ marginTop: 12, display: "grid", gap: 7 }}>
            {howLines.map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: "0.76rem", lineHeight: 1.5 }}>
                <span style={{ color: C.goldBright, fontWeight: 800, flex: "none", minWidth: 148 }}>{k}</span>
                <span style={{ color: C.muted }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3 — TAB SWITCHER (only when Plan & Focus data is available) */}
      {pf && pf.length > 0 && (
        <section className="grs-card" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {[["groups", "Industry Groups"], ["planfocus", "Top-Down View"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={chip(tab === k)}>{l}</button>
          ))}
        </section>
      )}

      {tab === "groups" || !pf ? (
        <>
          {/* FILTER (sort lives on the column headers) */}
          <section className="grs-card" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginRight: 2 }}>Preset auto-filters</span>
            {filterChips.map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} style={chip(filter === k)}>{label}</button>
            ))}
            {!isDefaultChain && (
              <button onClick={resetGroupSort} title="Restore the default sort chain"
                style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: "0.66rem", fontWeight: 700, padding: "6px 12px", borderRadius: 99, cursor: "pointer", fontFamily: font, border: `1px solid ${C.border}`, color: C.muted, background: "rgba(255,255,255,0.03)" }}>
                × reset sort
              </button>
            )}
          </section>

          {/* THE TABLE */}
          <section className="grs-card" style={{ padding: "6px 8px" }}>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead><HeadRow chain={chain} onSort={clickSort} /></thead>
                <tbody>
                  {view.map(row => <DataRow key={row.t} row={row} />)}
                  {!view.length && (<tr><td colSpan={11} style={{ ...td, textAlign: "center", color: C.muted, padding: 24 }}>No groups match this filter.</td></tr>)}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <PlanFocus />
      )}

      {/* METHOD — ADMIN ONLY (formulas / provenance) */}
      {isAdmin && (
        <section className="grs-card">
          <div onClick={() => setMethodOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
            <span style={{ ...cardLabel, flex: 1 }}>Method — exact formulas (admin)</span>
            <span style={{ fontSize: "0.7rem", color: C.muted }}>{methodOpen ? "▴" : "▾"}</span>
          </div>
          {methodOpen && (
            <div style={{ marginTop: 12 }}>
              <pre style={{ margin: 0, padding: "14px 16px", background: "rgba(0,0,0,0.35)", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: "0.68rem", lineHeight: 1.7, color: C.text, overflowX: "auto", whiteSpace: "pre", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{
`rel[i]        = close_ETF[i] / close_RSP[i]        (aligned by date, both must have a bar)
rs1m          = PERCENTRANK of today's rel within its OWN trailing 21 sessions, 0–100
w5            = Σ k=0..4  weight[k] × (rel[last-k]/rel[last-k-1] - 1),
                weights [5,4,3,2,1] (k=0 = most recent) ÷ 15
thrust        = PERCENTRANK of w5 within its OWN trailing 25 sessions · snap-5
pctIntraday   = (close - open)/open × 100 of the LAST bar (ex-gap move of the session)
pct1d         = close[last]/close[last-1] - 1, ×100
pct1m         = close[last]/close[last-21] - 1, ×100     (ABSOLUTE, not relative)
off52         = close[last]/max(high over last 252 bars) - 1, ×100   (≤ 0)

decode (pre-registered thresholds):
  PRIMARY (first match):  buy (thrust≥90 & rs1m≥90) → fresh (thrust≥75 & thrust-rs1m≥25)
                          → resting (rs1m≥70 & rs1m-thrust≥25) → none
  WARNINGS (coexist):     artifact (rs1m≥60 & pct1m<0)   ·   trap (thrust≥75 & off52≤-15)`
              }</pre>
              <div style={{ margin: "12px 0 0", display: "grid", gap: 10, maxWidth: "92ch" }}>
                <p style={{ margin: 0, fontSize: "0.72rem", lineHeight: 1.7, color: C.muted }}>
                  <b style={{ color: C.text }}>1-Mth RS % — formula-identical to the source sheet, verified.</b> PERCENTRANK of today's RS ratio (close ÷ RSP) within its own trailing 21 sessions. Cross-checked against the source's posted table for the 2026-07-17 close: <b style={{ color: "#86efac" }}>51/51 overlapping tickers matched exactly.</b>
                </p>
                <p style={{ margin: 0, fontSize: "0.72rem", lineHeight: 1.7, color: C.muted }}>
                  <b style={{ color: C.text }}>Thrust — our stand-in</b> (weighted 5-day relative return, PERCENTRANK within its own trailing 25). The source's published metric adds unpublished weighting/bonus scoring (prints −8…106); rank correlation vs their printed values <b style={{ color: C.text }}>≈0.78</b>. Read the STATE chips, not the decimals.
                </p>
                <p style={{ margin: 0, fontSize: "0.72rem", lineHeight: 1.7, color: C.muted }}>
                  % columns use <b style={{ color: C.text }}>unadjusted closes</b> (matches real fills); distribution-paying ETFs can drift ±1–3% vs adjusted-data vendors.
                </p>
                <p style={{ margin: 0, fontSize: "0.72rem", lineHeight: 1.7, color: "rgba(255,255,255,0.5)" }}>
                  DeepVue remains the source of truth for single-stock RS and sector grouping. Refresh: <code style={{ color: C.text }}>node scripts/group-rs.mjs</code>. Educational, not advice.
                </p>
              </div>
            </div>
          )}
        </section>
      )}

      <HoldingsPopup target={holdingsFor} onClose={() => setHoldingsFor(null)} C={C} font={font} />
    </div>
  );
}

// ── ROTATION MINI — focal highlight (top 10), clicks to open the full table popup.
export function RotationMini({ C, font, session }) {
  const [open, setOpen] = useState(false);
  const cardRef = useRef(null);
  const rows = GROUP_RS?.rows || [];
  const asof = GROUP_RS?.asof || "—";
  const refreshed = GROUP_RS?.refreshed;
  const stamp = refreshed && refreshed !== asof ? `as of ${asof} · updated ${refreshed}` : `as of ${asof}`;
  const top = [...rows]
    .sort((a, b) => (b.rs1m ?? -1) - (a.rs1m ?? -1) || (b.thrust ?? -1) - (a.thrust ?? -1) || (b.off52 ?? -999) - (a.off52 ?? -999))
    .slice(0, 10);
  const counts = {
    buy: rows.filter(r => r.state === "buy").length,
    fresh: rows.filter(r => r.state === "fresh").length,
    resting: rows.filter(r => r.state === "resting").length,
    trap: rows.filter(r => (r.warns || []).includes("trap")).length,
  };
  const cellChip = (bg) => ({ display: "inline-block", minWidth: 30, textAlign: "right", fontSize: "0.62rem", fontWeight: 800, padding: "3px 6px", borderRadius: 6, background: bg, border: `1px solid ${C.border}`, color: C.text, fontVariantNumeric: "tabular-nums" });
  const hcell = { fontSize: "0.5rem", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: C.muted, padding: "0 4px 6px", whiteSpace: "nowrap" };
  return (
    <>
      <div ref={cardRef} className="card lensmini" onClick={() => setOpen(true)} style={{ fontFamily: font, cursor: "pointer" }}>
        <div className="cardhead">
          <span className="label">Sector Group Rotation</span>
          <InfoDot tip="Which sector groups are heating up and which are cooling. Tap for the full table." />
          <LensCamera getEl={() => cardRef.current} name="rotation" C={C} style={{ marginLeft: 6 }} />
          <span style={{ marginLeft: "auto", fontSize: "0.62rem", fontWeight: 700, color: C.goldBright, fontVariantNumeric: "tabular-nums" }}>{stamp}</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={{ ...hcell, textAlign: "left" }}>Ticker</th>
            <th style={{ ...hcell, textAlign: "left", width: "40%" }}>Group</th>
            <th style={{ ...hcell, textAlign: "right" }}>Thrust %</th>
            <th style={{ ...hcell, textAlign: "right" }}>1M RS %</th>
            <th style={{ ...hcell, textAlign: "right" }}>% off 52W H</th>
          </tr></thead>
          <tbody>
            {top.map(r => (
              <tr key={r.t}>
                <td style={{ fontSize: "0.72rem", fontWeight: 800, color: C.white, padding: "3px 4px", textAlign: "left" }}>{r.t}</td>
                <td style={{ fontSize: "0.66rem", color: C.muted, padding: "3px 4px", textAlign: "left", maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</td>
                <td style={{ padding: "3px 4px", textAlign: "right" }}><span style={cellChip(greenHeat(r.thrust == null ? null : r.thrust / 100))}>{r.thrust == null ? "—" : Math.round(r.thrust)}</span></td>
                <td style={{ padding: "3px 4px", textAlign: "right" }}><span style={cellChip(greenHeat(r.rs1m == null ? null : r.rs1m / 100))}>{r.rs1m == null ? "—" : Math.round(r.rs1m)}</span></td>
                <td style={{ padding: "3px 4px", textAlign: "right", whiteSpace: "nowrap" }}>
                  {/* Valen 2026-07-19: OFF-FLOOR flag = plain ⚠️ to the LEFT of the value so the
                      right-aligned % column stays a clean edge. No separate column. */}
                  {(r.warns || []).includes("trap") && <span title="Far below its 52-week high — strength here is a bounce, not a breakout." style={{ marginRight: 4, fontSize: "0.66rem", cursor: "help", verticalAlign: "middle" }}>⚠️</span>}
                  {(r.warns || []).includes("artifact") && <span title="Percentile illusion — RS% looks high but the actual month is negative." style={{ marginRight: 3, fontSize: "0.66rem", cursor: "help", verticalAlign: "middle" }}>⚠️</span>}
                  <span style={cellChip(redHeat(off52Mag(r.off52)))}>{r.off52 == null ? "—" : (r.off52 >= -0.05 ? "0%" : Math.round(r.off52) + "%")}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 10, paddingTop: 9, borderTop: `1px solid ${C.border}`, fontSize: "0.64rem", color: C.muted, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {counts.buy} leading+accelerating · {counts.fresh} fresh surge · {counts.resting} cooling · {counts.trap} off-floor flags
        </div>
      </div>
      {open && createPortal(
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1250, background: "rgba(4,4,8,0.55)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", overflowY: "auto", padding: "32px 16px" }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: 1480, margin: "0 auto" }}>
            <GroupRS C={C} font={font} session={session} />
          </div>
        </div>, document.body)}
    </>
  );
}
