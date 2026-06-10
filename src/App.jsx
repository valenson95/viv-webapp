import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from "recharts";
import { supabase, supabaseUrl, supabaseAnonKey } from "./supabaseClient";
import html2canvas from "html2canvas";

// ─── Error Boundary — catches rendering crashes so the page doesn't go blank ───
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null, errorInfo: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { this.setState({ errorInfo }); console.error("ErrorBoundary caught:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return React.createElement("div", { style: { padding: 40, background: "#08080e", minHeight: "100vh", color: "#fff", fontFamily: "'Plus Jakarta Sans', sans-serif" } },
        React.createElement("h2", { style: { color: "#ef4444", marginBottom: 16 } }, "Something went wrong"),
        React.createElement("p", { style: { color: "rgba(255,255,255,0.6)", marginBottom: 16 } }, "The app hit an error. Your data is safe — refresh to try again."),
        React.createElement("pre", { style: { background: "rgba(255,255,255,0.05)", padding: 16, borderRadius: 10, overflow: "auto", fontSize: "0.72rem", color: "#f0c050", maxHeight: 300 } },
          String(this.state.error) + "\n\n" + (this.state.errorInfo?.componentStack || "")
        ),
        React.createElement("button", { onClick: () => window.location.reload(), style: { marginTop: 16, padding: "10px 24px", borderRadius: 980, border: "1px solid rgba(201,152,42,0.3)", background: "rgba(201,152,42,0.15)", color: "#c9982a", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer" } }, "Reload App")
      );
    }
    return this.props.children;
  }
}

// ─── Responsive Hook ───
function useScreenWidth() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

// ─── VIV Design Tokens ───
const C = {
  bg: "#08080e", bg2: "#0c0c14", white: "#ffffff", text: "rgba(255,255,255,0.92)",
  muted: "rgba(255,255,255,0.70)", gold: "#c9982a", goldBright: "#f0c050",
  goldMid: "#b8820a", goldDeep: "#7a4f00",
  goldDim: "rgba(201,152,42,0.15)", borderGold: "rgba(201,152,42,0.22)",
  glass: "rgba(255,255,255,0.042)", border: "rgba(255,255,255,0.09)",
  green: "#22c55e", greenDim: "rgba(34,197,94,0.10)", red: "#ef4444", redDim: "rgba(239,68,68,0.08)",
  blue: "#3b82f6", blueDim: "rgba(59,130,246,0.10)",
  purple: "#a78bfa", purpleDim: "rgba(167,139,250,0.10)",
};
const font = "'Plus Jakarta Sans', -apple-system, sans-serif";
const fmt$ = (v, dec = 0) => `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;

// ─── Brand wordmark — tri-color lockup (Valen / Insiders / Vault) ───
function Wordmark({ size, style }) {
  return (
    <div style={{ fontFamily: font, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.2, fontSize: size, ...style }}>
      <span style={{ color: C.white }}>Valen</span>
      <span style={{ color: C.gold }}> Insiders </span>
      <span style={{ color: C.white }}>Vault</span>
    </div>
  );
}

// ─── Multi-sort helper ───
// sorts = [{key, dir}] where dir is "asc" or "desc"
// Date-typed sort keys — values are normalized to ISO YYYY-MM-DD before string compare so manual entries
// (e.g. "5/28/26") and IBKR imports (e.g. "2026-05-28") sort chronologically together. Without this,
// localeCompare treats "5/28/26" > "2026-05-18" because "5" > "2" in lexicographic order.
const SORT_DATE_KEYS = new Set(["entry", "exit"]);
function multiSort(arr, sorts) {
  if (!sorts || sorts.length === 0) return arr;
  return [...arr].sort((a, b) => {
    for (const { key, dir } of sorts) {
      let av = a[key], bv = b[key];
      if (SORT_DATE_KEYS.has(key)) {
        av = tradeDateISO(av) || ""; // empty string sorts before any real date
        bv = tradeDateISO(bv) || "";
      }
      // Normalize: treat null/undefined/"" as -Infinity for numbers
      if (typeof av === "string" && typeof bv === "string") {
        const cmp = av.localeCompare(bv, undefined, { sensitivity: "base" });
        if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
      } else {
        av = av == null || av === "" ? -Infinity : Number(av) || 0;
        bv = bv == null || bv === "" ? -Infinity : Number(bv) || 0;
        if (av !== bv) return dir === "asc" ? av - bv : bv - av;
      }
    }
    return 0;
  });
}
// Toggle sort: click = set single sort, shift+click = add/toggle multi-sort
function toggleSort(sorts, key, shiftKey) {
  const existing = sorts.findIndex(s => s.key === key);
  if (shiftKey) {
    const next = [...sorts];
    if (existing >= 0) {
      if (next[existing].dir === "asc") next[existing] = { key, dir: "desc" };
      else next.splice(existing, 1);
    } else { next.push({ key, dir: "asc" }); }
    return next;
  }
  if (existing >= 0 && sorts.length === 1) {
    return sorts[0].dir === "asc" ? [{ key, dir: "desc" }] : [];
  }
  return [{ key, dir: "asc" }];
}
// Sort indicator arrow
function sortArrow(sorts, key) {
  const s = sorts.find(s => s.key === key);
  if (!s) return "";
  const idx = sorts.length > 1 ? sorts.indexOf(s) + 1 : "";
  return s.dir === "asc" ? ` ▲${idx}` : ` ▼${idx}`;
}

// ─── Slider CSS ───
const sliderCSS = `
input[type=range].viv-slider{-webkit-appearance:none;appearance:none;height:4px;border-radius:2px;outline:none;cursor:pointer}
input[type=range].viv-slider::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:${C.goldBright};border:3px solid #08080e;box-shadow:0 0 10px rgba(201,152,42,0.45),0 0 0 1px rgba(201,152,42,0.3);cursor:pointer;margin-top:-8px}
input[type=range].viv-slider::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:${C.goldBright};border:3px solid #08080e;box-shadow:0 0 10px rgba(201,152,42,0.45);cursor:pointer}
input[type=range].viv-slider::-webkit-slider-runnable-track{height:4px;border-radius:2px}
@keyframes rtsGlow{0%,100%{text-shadow:0 0 6px rgba(239,68,68,0.6),0 0 12px rgba(239,68,68,0.3)}50%{text-shadow:0 0 10px rgba(239,68,68,0.9),0 0 20px rgba(239,68,68,0.5)}}
@keyframes rtsGlowGreen{0%,100%{text-shadow:0 0 6px rgba(34,197,94,0.5),0 0 12px rgba(34,197,94,0.25)}50%{text-shadow:0 0 10px rgba(34,197,94,0.8),0 0 20px rgba(34,197,94,0.4)}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes intradayPulse{0%,100%{box-shadow:0 0 0 0 rgba(201,152,42,0.4)}50%{box-shadow:0 0 0 4px rgba(201,152,42,0)}}
`;

// ─── Default Data ───
const DEFAULT_SETUP_TYPES = ["VCP", "Pivot", "Power Play", "Low-Risk Entry", "Base Breakout"];
const DEFAULT_TAGS = ["Breakout", "Earnings", "Momentum", "Sector Leader", "High Volume", "Gap Up", "Follow-Through Day"];
const DEFAULT_EXIT_REASONS = ["Sold Into Strength", "Hit Initial Stop", "Hit Trailing Stop", "Time Stop", "Risk Reduction", "Changed Thesis"];

const DEMO_RISK = { sym: "NVDA", sharePrice: "142.50", posSizePct: "20", portfolio: "500000", stopVal: "6.11" };
const DEMO_EXPECT = { port: "500000", posSize: "20", desRet: "15", avgGain: "12.5", avgLoss: "5.8", winRate: "52" };
const DEMO_FINANCE = { buyPrice: "142.50", shares: "575", stopPrice: "133.80", stopPct: "6.11", curPrice: "168.30" };

// ═══════════════════════════════════════
// ─── Shared UI Components ───
// ═══════════════════════════════════════
function GlassCard({ children, style, small, onClick, className }) {
  return (
    <div onClick={onClick} className={className} style={{ background: C.glass, backdropFilter: "blur(28px) saturate(160%)", WebkitBackdropFilter: "blur(28px) saturate(160%)", border: `1px solid ${C.border}`, borderRadius: small ? 13 : 22, position: "relative", overflow: "hidden", ...style }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: small ? 13 : 22, background: "linear-gradient(135deg, rgba(255,255,255,0.055) 0%, transparent 50%, rgba(255,255,255,0.02) 100%)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}
function Eyebrow({ children }) { return <div style={{ fontWeight: 700, fontSize: "0.62rem", letterSpacing: "0.17em", textTransform: "uppercase", color: C.gold, marginBottom: 6 }}>{children}</div>; }

function CalcInput({ label, value, onChange, suffix = "$", placeholder = "0.00", style }) {
  return (
    <div style={{ flex: 1, ...style }}>
      {label && <label style={{ fontWeight: 700, fontSize: "0.60rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 6, display: "block" }}>{label}</label>}
      <div style={{ position: "relative" }}>
        <input type="number" step="any" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: suffix ? "11px 36px 11px 14px" : "11px 14px", color: C.white, fontSize: "0.88rem", fontWeight: 500, fontFamily: font, outline: "none" }}
          onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
        {suffix && <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: "0.74rem", fontWeight: 600 }}>{suffix}</span>}
      </div>
    </div>
  );
}
function TextInput({ label, value, onChange, placeholder, style, upper = true }) {
  return (
    <div style={{ flex: 1, ...style }}>
      {label && <label style={{ fontWeight: 700, fontSize: "0.60rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 6, display: "block" }}>{label}</label>}
      <input type="text" placeholder={placeholder} value={value} onChange={e => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
        style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 14px", color: C.white, fontSize: "0.88rem", fontWeight: 500, fontFamily: font, outline: "none", ...(upper ? { textTransform: "uppercase" } : {}) }}
        onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
    </div>
  );
}
function ResultRow({ label, value, color, highlight }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 8px", marginLeft: -8, marginRight: -8, borderBottom: "1px solid rgba(255,255,255,0.04)", background: highlight ? "rgba(255,255,255,0.03)" : "transparent", borderRadius: highlight ? 6 : 0 }}>
      <span style={{ fontWeight: 400, fontSize: "0.78rem", color: C.muted }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: "0.88rem", color: color || C.white, textAlign: "right" }}>{value}</span>
    </div>
  );
}
function Badge({ positive, children }) {
  return <span style={{ display: "inline-block", padding: "4px 14px", borderRadius: 980, fontSize: "0.64rem", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", background: positive ? C.greenDim : C.redDim, color: positive ? C.green : C.red, border: `1px solid ${positive ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}` }}>{children}</span>;
}
function Alert({ type, children }) {
  const isRed = type === "red";
  return <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: "0.74rem", fontWeight: 500, lineHeight: 1.5, marginTop: 8, background: isRed ? C.redDim : C.goldDim, border: `1px solid ${isRed ? "rgba(239,68,68,0.2)" : C.borderGold}`, color: isRed ? "#fca5a5" : C.goldBright }}>{children}</div>;
}
// ─── Drag Reorder Utility ───
// Makes any list of elements reorderable via HTML5 drag-and-drop.
// Usage: spread dragProps(visualIndex) on each draggable element, render items via order array.
function useDragReorder(length) {
  const [order, setOrder] = useState(() => Array.from({ length }, (_, i) => i));
  const dragFrom = useRef(null);
  // Reset if length changes
  useEffect(() => { setOrder(prev => prev.length === length ? prev : Array.from({ length }, (_, i) => i)); }, [length]);
  const dragProps = (vi) => ({
    draggable: true,
    onDragStart: (e) => { dragFrom.current = vi; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", ""); },
    onDragOver: (e) => e.preventDefault(),
    onDrop: (e) => {
      e.preventDefault();
      const from = dragFrom.current;
      if (from === null || from === vi) return;
      setOrder(prev => { const n = [...prev]; const [r] = n.splice(from, 1); n.splice(vi, 0, r); return n; });
      dragFrom.current = null;
    },
    style: { cursor: "grab" }
  });
  return { order, dragProps, setOrder };
}

// ─── What's New — changelog the user can refer to (button in the top nav, modal of update notes).
// Add new entries to the TOP of WHATS_NEW as features ship.
const WHATS_NEW = [
  {
    tag: "Fixed",
    date: "June 2026",
    title: "Closed trades now save reliably",
    items: [
      "Fixed a bug where a trade created by closing a position could disappear after you left and re-opened the app — even though it showed in your Journal and you'd hit Save. Closing a position now logs the trade reliably and it stays put.",
      "Your realized P/L and the link between a closed trade and the position it came from are fully preserved — only the disappearing-on-refresh problem was fixed.",
      "Note: any closed trades lost to this before today were never actually stored, so they'll need to be re-entered. Everything from here on is safe.",
    ],
  },
  {
    tag: "New",
    date: "June 2026",
    title: "A brand-new look — and a Guided mode",
    items: [
      "Completely redesigned interface across Dashboard, Journal, Premium Tools and Settings — cleaner, calmer, and easier to read.",
      "New Guided / Pro toggle (top-right). Guided explains every card in plain English — out loud — as you hover; Pro strips the teaching layer for experienced traders. Your choice is remembered.",
      "Top-tab navigation replaces the old sidebar — switch pages from the bar up top.",
      "Dashboard: one dominant Open P/L number with a live equity trend, a clearer Live Risk Budget & Sizing console, and a plain-English risk-allocation guide.",
      "Open Positions: status pills (At Risk / Risk-Free / Profit Locked), size-health bars, and a per-row Manage panel. The Setup is now an editable dropdown, and Add Position opens a panel to fill in ticker, shares, cost, stops and setup.",
      "Key Metrics in the Journal are now drag-to-reorder — arrange them however you like.",
      "Premium Tools: a 1-minute narrated tour, plus the five calculators (Return Simulator, Position Risk, Expectancy, Risk Finance, Expected Move) in a cleaner layout.",
      "Journal: a track-record hero, your edge & expectancy, an equity curve, return distribution, and a new VIV Analytics section (best/worst trades, insights, recap).",
      "Settings: redesigned preferences (mode, privacy, text size), your IBKR connection, and a read-only data-integrity scan.",
      "Subtle entrance animations and a count-up roll on the headline numbers.",
    ],
  },
];
function WhatsNew() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} title="What's New" style={{ marginLeft: 10, display: "inline-flex", alignItems: "center", gap: 6, background: C.goldDim, border: `1px solid ${C.borderGold}`, color: C.goldBright, fontFamily: font, fontSize: "0.72rem", fontWeight: 700, padding: "7px 14px", borderRadius: 980, cursor: "pointer", whiteSpace: "nowrap" }}>✦ What's New</button>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", overflowY: "auto" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 580, maxWidth: "100%", background: C.bg2, border: `1px solid ${C.borderGold}`, borderRadius: 18, padding: "24px 28px 28px", boxShadow: "0 30px 80px rgba(0,0,0,0.6)", fontFamily: font }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.17em", textTransform: "uppercase", color: C.gold, marginBottom: 6 }}>What's New</div>
                <div style={{ fontSize: "1.25rem", fontWeight: 800, letterSpacing: "-0.02em", color: C.white }}>Product updates</div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: "transparent", border: "none", color: C.muted, fontSize: "1.5rem", lineHeight: 1, cursor: "pointer", padding: 2 }}>&times;</button>
            </div>
            {WHATS_NEW.map((e, i) => (
              <div key={i} style={{ paddingTop: i ? 18 : 0, marginTop: i ? 18 : 0, borderTop: i ? `1px solid ${C.border}` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.goldBright, background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 980, padding: "2px 9px" }}>{e.tag}</span>
                  <span style={{ fontSize: "0.7rem", color: C.muted, fontWeight: 600 }}>{e.date}</span>
                </div>
                <div style={{ fontSize: "1rem", fontWeight: 800, color: C.white, letterSpacing: "-0.01em", marginBottom: 12 }}>{e.title}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {e.items.map((it, j) => (
                    <div key={j} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.goldBright, marginTop: 7, flex: "none", boxShadow: `0 0 8px ${C.goldBright}` }} />
                      <span style={{ fontSize: "0.82rem", color: C.text, lineHeight: 1.55 }}>{it}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// Reorderable table row — reorders direct <td> children by index array
function DragTr({ order, hiddenSet, prefix, children, ...props }) {
  // `prefix` renders as a non-draggable cell at the start of the row — used for selection checkboxes
  // in tables that support bulk operations. Pass any number of <td> nodes (or a fragment).
  if (!order) return <tr {...props}>{prefix}{children}</tr>;
  const arr = React.Children.toArray(children);
  const indices = hiddenSet ? order.filter(i => !hiddenSet.has(i)) : order;
  return <tr {...props}>{prefix}{indices.map(i => arr[i]).filter(Boolean)}</tr>;
}

// ─── Count-Up Animation Hook ───
const zeroLike = (t) => String(t).replace(/[\d,]+\.?\d*/, m => (0).toFixed((m.split(".")[1] || "").length));
function useCountUp(target, duration = 900) {
  // Starts at a zeroed version of the target so every mount (incl. tab switches) animates up.
  const [display, setDisplay] = useState(() => zeroLike(target));
  const prevRef = useRef(null);
  const rafRef = useRef(null);
  useEffect(() => {
    const from = prevRef.current === null ? "0" : prevRef.current;
    const to = target;
    prevRef.current = to;
    // Only animate if both are finite numbers
    const fromN = parseFloat(String(from).replace(/[^0-9.\-]/g, ""));
    const toN = parseFloat(String(to).replace(/[^0-9.\-]/g, ""));
    if (!isFinite(fromN) || !isFinite(toN) || fromN === toN) { setDisplay(to); return; }
    // Detect decimal places from target string
    const decMatch = String(to).match(/\.(\d+)/);
    const decimals = decMatch ? decMatch[1].length : 0;
    const startTime = performance.now();
    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = fromN + (toN - fromN) * eased;
      // Reconstruct string format: preserve prefix/suffix from target
      // Use magnitude only — any sign is already part of the target template (prefix or value)
      const numStr = Math.abs(current).toFixed(decimals);
      // Replace the numeric part in target string
      const formatted = String(to).replace(/[\d,]+\.?\d*/, numStr.replace(/\B(?=(\d{3})+(?!\d))/g, ","));
      setDisplay(formatted);
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);
  return display;
}

function StatTile({ label, value, color, prefix, sub, big, tip }) {
  const display = `${prefix || ""}${value}`;
  const animated = useCountUp(display);
  const len = display.length;
  const fs = big
    ? (len > 15 ? "1.2rem" : len > 12 ? "1.45rem" : len > 8 ? "1.72rem" : "1.95rem")
    : (len > 14 ? "0.94rem" : len > 11 ? "1.08rem" : len > 8 ? "1.2rem" : "1.34rem");
  return (
    <GlassCard small className="viv-tile-enter viv-lift" style={{ padding: big ? "22px 24px" : "18px 20px", minHeight: big ? 118 : 98, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", boxSizing: "border-box" }}>
      <div style={{ fontWeight: 700, fontSize: big ? "0.62rem" : "0.57rem", letterSpacing: "0.13em", textTransform: "uppercase", color: C.muted, marginBottom: big ? 10 : 8 }}>{tip ? <Abbr tip={tip} underline={false}>{label}</Abbr> : label}</div>
      <div style={{ fontWeight: 800, fontSize: fs, letterSpacing: "-0.035em", color: color || C.white, whiteSpace: "nowrap", transition: "color 0.3s" }}>{animated}</div>
      {sub && <div style={{ fontWeight: 500, fontSize: big ? "0.68rem" : "0.64rem", color: C.muted, marginTop: 7 }}>{sub}</div>}
    </GlassCard>
  );
}
// ─── Polished chart tooltip — styled card with colour dots ───
function ChartTip({ active, payload, label, fmt }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: "rgba(12,12,20,0.97)", border: `1px solid ${C.borderGold}`, borderRadius: 10, padding: "9px 12px", boxShadow: "0 10px 34px rgba(0,0,0,0.65)", fontFamily: font, minWidth: 132 }}>
      <div style={{ fontSize: "0.58rem", fontWeight: 700, color: C.gold, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: i ? 5 : 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: p.color || p.stroke || C.gold, flexShrink: 0 }} />
          <span style={{ fontSize: "0.66rem", color: C.muted, flex: 1, whiteSpace: "nowrap" }}>{p.name}</span>
          <span style={{ fontSize: "0.74rem", color: C.white, fontWeight: 700 }}>{fmt ? fmt(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}
// ─── Abbreviation tooltip — hover shows a styled card with the full term ───
function Abbr({ children, tip, underline = true }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef(null);
  const enter = () => {
    const r = ref.current && ref.current.getBoundingClientRect();
    if (r) setPos({ x: r.left + r.width / 2, y: r.top });
    setShow(true);
  };
  if (!tip) return <span>{children}</span>;
  return (
    <>
      <span ref={ref} onMouseEnter={enter} onMouseLeave={() => setShow(false)}
        style={{ borderBottom: underline ? "1px dotted rgba(255,255,255,0.32)" : "none", cursor: "help" }}>
        {children}
      </span>
      {show && createPortal(
        <div style={{ position: "fixed", left: pos.x, top: pos.y, transform: "translate(-50%,-100%) translateY(-9px)", background: "rgba(12,12,20,0.98)", border: `1px solid ${C.borderGold}`, borderRadius: 8, padding: "8px 12px", fontSize: "0.68rem", fontWeight: 500, color: C.text, fontFamily: font, maxWidth: 252, lineHeight: 1.55, boxShadow: "0 12px 34px rgba(0,0,0,0.7)", zIndex: 99999, pointerEvents: "none", textTransform: "none", letterSpacing: "normal" }}>
          {tip}
        </div>,
        document.body
      )}
    </>
  );
}
function SliderRow({ label, min, max, step, value, onChange, suffix = "", calcText }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 20 }}>
      <style>{sliderCSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: "0.60rem", letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted }}>{label}</div>
        {calcText && <div style={{ fontWeight: 600, fontSize: "0.76rem", color: C.goldBright }}>{calcText}</div>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ flex: 1 }}>
          <input type="range" className="viv-slider" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)}
            style={{ width: "100%", background: `linear-gradient(to right, ${C.gold} 0%, ${C.gold} ${pct}%, rgba(255,255,255,0.06) ${pct}%, rgba(255,255,255,0.06) 100%)` }} />
        </div>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <input type="number" min={min} max={max} step={step} value={value}
            onChange={e => { let v = +e.target.value; if (v >= min && v <= max) onChange(v); }}
            style={{ width: 58, boxSizing: "border-box", textAlign: "center", background: C.goldDim, border: `1px solid ${C.borderGold}`, borderRadius: 10, padding: "9px 4px", color: C.goldBright, fontSize: "0.88rem", fontWeight: 800, fontFamily: font, outline: "none" }}
            onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.borderGold} />
          {suffix && <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: C.gold, fontSize: "0.62rem", fontWeight: 700, pointerEvents: "none" }}>{suffix}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Tag Chip + Tag Selector ───
function TagChip({ label, color, onRemove, small }) {
  const c = color || C.gold;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: small ? "2px 7px" : "3px 10px", borderRadius: 980, fontSize: small ? "0.52rem" : "0.58rem", fontWeight: 600, background: `${c}18`, color: c, border: `1px solid ${c}33`, whiteSpace: "nowrap" }}>
      {label}
      {onRemove && <span onClick={onRemove} style={{ cursor: "pointer", opacity: 0.6, fontSize: "0.7rem", lineHeight: 1 }}>&times;</span>}
    </span>
  );
}
function TagSelector({ selected, allTags, onChange, small }) {
  const [open, setOpen] = useState(false);
  const available = allTags.filter(t => !selected.includes(t));
  return (
    <div style={{ position: "relative", display: "inline-flex", flexWrap: "wrap", gap: 3, alignItems: "center" }}>
      {selected.map(t => <TagChip key={t} label={t} small={small} onRemove={() => onChange(selected.filter(s => s !== t))} />)}
      {available.length > 0 && (
        <button onClick={() => setOpen(!open)} style={{ padding: "2px 6px", borderRadius: 6, border: `1px dashed ${C.border}`, background: "transparent", color: C.muted, fontSize: "0.56rem", cursor: "pointer", fontFamily: font }}>+</button>
      )}
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, marginTop: 4, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10, padding: 6, display: "flex", flexDirection: "column", gap: 2, minWidth: 120, maxHeight: 200, overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.6)" }}>
          {available.map(t => (
            <button key={t} onClick={() => { onChange([...selected, t]); setOpen(false); }}
              style={{ padding: "6px 10px", borderRadius: 6, border: "none", background: "transparent", color: C.text, fontSize: "0.70rem", fontWeight: 500, cursor: "pointer", fontFamily: font, textAlign: "left" }}
              onMouseEnter={e => e.target.style.background = "rgba(255,255,255,0.06)"} onMouseLeave={e => e.target.style.background = "transparent"}>{t}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Select Dropdown ───
function MiniSelect({ value, onChange, options, width = 100 }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ width, boxSizing: "border-box", background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px", color: C.white, fontSize: "0.70rem", fontFamily: font, outline: "none" }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ─── Cell Input ───
function CellInput({ value, onChange, width = 76, gold, placeholder = "0" }) {
  return (
    <input type="number" step="any" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
      style={{ width, boxSizing: "border-box", textAlign: "right", background: gold ? "rgba(201,152,42,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${gold ? C.borderGold : "rgba(255,255,255,0.06)"}`, borderRadius: 5, padding: "5px 7px", color: gold ? C.goldBright : C.white, fontSize: "0.73rem", fontWeight: 600, fontFamily: font, outline: "none" }}
      onFocus={e => { e.target.style.borderColor = C.gold; }} onBlur={e => { e.target.style.borderColor = gold ? C.borderGold : "rgba(255,255,255,0.06)"; }}
    />
  );
}
// Ticker → company domain for logo lookup (Clearbit)
const TICKER_DOMAINS = {AAPL:"apple.com",MSFT:"microsoft.com",GOOGL:"google.com",GOOG:"google.com",AMZN:"amazon.com",NVDA:"nvidia.com",META:"meta.com",TSLA:"tesla.com",AVGO:"broadcom.com",TSM:"tsmc.com",CRWD:"crowdstrike.com",KLAC:"kla.com",ASML:"asml.com",GLW:"corning.com",S:"sentinelone.com",MS:"morganstanley.com",FN:"fabrinet.com",GEV:"ge.com",IREN:"irenergy.com",DDOG:"datadoghq.com",FSLR:"firstsolar.com",CRCL:"circle.com",CAT:"caterpillar.com",AKAM:"akamai.com",NBIS:"nebius.com",MRVL:"marvell.com",ARM:"arm.com",FORM:"formfactor.com",CRDO:"credo.ai",AEHR:"aehr.com",AZZ:"azz.com",AMD:"amd.com",INTC:"intel.com",QCOM:"qualcomm.com",CRM:"salesforce.com",ORCL:"oracle.com",ADBE:"adobe.com",NFLX:"netflix.com",DIS:"disney.com",PYPL:"paypal.com",SQ:"squareup.com",SHOP:"shopify.com",SNOW:"snowflake.com",NET:"cloudflare.com",PLTR:"palantir.com",COIN:"coinbase.com",SOFI:"sofi.com",HOOD:"robinhood.com",ROKU:"roku.com",ZS:"zscaler.com",PANW:"paloaltonetworks.com",FTNT:"fortinet.com",ABNB:"airbnb.com",UBER:"uber.com",LYFT:"lyft.com",SNAP:"snap.com",PINS:"pinterest.com",TTD:"thetradedesk.com",RBLX:"roblox.com",U:"unity.com",SE:"sea.com",BABA:"alibaba.com",JD:"jd.com",PDD:"pinduoduo.com",NIO:"nio.com",LI:"li-auto.com",XPEV:"xpeng.com",RIVN:"rivian.com",LCID:"lucidmotors.com",F:"ford.com",GM:"gm.com",TM:"toyota.com",BA:"boeing.com",LMT:"lockheedmartin.com",RTX:"rtx.com",NOC:"northropgrumman.com",GD:"gd.com",JPM:"jpmorgan.com",BAC:"bankofamerica.com",WFC:"wellsfargo.com",C:"citigroup.com",GS:"goldmansachs.com",V:"visa.com",MA:"mastercard.com",AXP:"americanexpress.com",BLK:"blackrock.com",SCHW:"schwab.com",CME:"cmegroup.com",ICE:"ice.com",SPGI:"spglobal.com",MCO:"moodys.com",MSCI:"msci.com",NDAQ:"nasdaq.com"};
function getTickerLogo(ticker) { const d = TICKER_DOMAINS[ticker]; return d ? `https://logo.clearbit.com/${d}` : null; }

function TickerInput({ value, onChange, width = 64 }) {
  return (
    <input type="text" placeholder="SYM" value={value} onChange={e => onChange(e.target.value.toUpperCase())}
      style={{ width, boxSizing: "border-box", textAlign: "left", background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 5, padding: "5px 7px", textTransform: "uppercase", color: C.gold, fontSize: "0.73rem", fontWeight: 800, fontFamily: font, outline: "none", letterSpacing: "-0.01em" }}
      onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.06)"} />
  );
}

// ─── Lockable Cell Input (two-step edit: click lock to unlock, edit, click lock to re-lock) ───
function LockableCellInput({ value, onChange, width = 72, placeholder = "0" }) {
  const [unlocked, setUnlocked] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, justifyContent: "flex-end" }}>
      <input type="number" step="any" placeholder={placeholder} value={value}
        readOnly={!unlocked}
        onChange={e => onChange(e.target.value)}
        style={{ width: unlocked ? width : Math.min(width, 58), boxSizing: "border-box", textAlign: "right",
          background: unlocked ? "rgba(239,68,68,0.08)" : "transparent",
          border: unlocked ? "1px solid rgba(239,68,68,0.4)" : "1px solid transparent",
          borderRadius: 5, padding: "5px 5px", color: C.white, fontSize: "0.73rem", fontWeight: 600, fontFamily: font, outline: "none",
          cursor: unlocked ? "text" : "default", pointerEvents: unlocked ? "auto" : "none" }} />
      <button onClick={() => setUnlocked(u => !u)}
        title={unlocked ? "Lock stop value" : "Unlock to edit stop"}
        style={{ padding: "2px 4px", borderRadius: 4, border: `1px solid ${unlocked ? "rgba(239,68,68,0.4)" : C.border}`,
          background: unlocked ? "rgba(239,68,68,0.1)" : "transparent",
          color: unlocked ? C.red : C.muted, fontSize: "0.50rem", cursor: "pointer", fontFamily: font, lineHeight: 1, flexShrink: 0 }}>{unlocked ? "🔓" : "🔒"}</button>
    </div>
  );
}

// ─── Tier logic ───
const TIER_STYLES = {
  Full: { bg: C.greenDim, color: C.green, border: "rgba(34,197,94,0.25)" },
  Half: { bg: C.goldDim, color: C.gold, border: C.borderGold },
  Quarter: { bg: C.blueDim, color: C.blue, border: "rgba(59,130,246,0.25)" },
  Pilot: { bg: C.purpleDim, color: C.purple, border: "rgba(167,139,250,0.25)" },
};
function autoTier(posValue, sizer) {
  if (!sizer || !posValue || posValue <= 0) return "Pilot";
  const buf = 0.88;
  if (posValue >= sizer.full * buf) return "Full";
  if (posValue >= sizer.half * buf) return "Half";
  if (posValue >= sizer.quarter * buf) return "Quarter";
  return "Pilot";
}

function TierStrip({ sizer }) {
  if (!sizer) return null;
  const tiers = [
    { label: "Full", amount: sizer.full, color: C.green, bg: C.greenDim },
    { label: "Half", amount: sizer.half, color: C.gold, bg: C.goldDim },
    { label: "Quarter", amount: sizer.quarter, color: C.blue, bg: C.blueDim },
    { label: "Pilot", amount: sizer.pilot, color: C.purple, bg: C.purpleDim },
  ];
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
      {tiers.map(t => (
        <div key={t.label} style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: t.bg, borderLeft: `3px solid ${t.color}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: "0.56rem", letterSpacing: "0.10em", textTransform: "uppercase", color: t.color }}>{t.label}</span>
          <span style={{ fontWeight: 800, fontSize: "0.82rem", letterSpacing: "-0.03em", color: C.white }}>{fmt$(t.amount)}</span>
        </div>
      ))}
    </div>
  );
}

// ExposureGrid removed — Compounder now embedded in DashboardPage
// ─── Gold CTA Button ───
function GoldBtn({ children, onClick, small }) {
  const rest = "0 0 12px rgba(201,152,42,0.25), 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 1px rgba(255,255,255,0.3)";
  const lift = "0 0 20px rgba(201,152,42,0.4), 0 4px 12px rgba(0,0,0,0.25), inset 0 1px 1px rgba(255,255,255,0.4)";
  return (
    <button onClick={onClick} className="viv-sheen" style={{ background: `linear-gradient(135deg, ${C.goldMid}, ${C.goldBright}, ${C.goldDeep})`, color: "#000", fontWeight: 800, fontSize: small ? "0.72rem" : "0.82rem", padding: small ? "8px 16px" : "12px 28px", borderRadius: 980, border: "none", cursor: "pointer", fontFamily: font, boxShadow: rest, transition: "box-shadow 0.2s ease, transform 0.12s cubic-bezier(0.22,1,0.36,1)", position: "relative", overflow: "hidden" }}
    onMouseEnter={e => { e.currentTarget.style.boxShadow = lift; e.currentTarget.style.transform = "translateY(-1px)"; }}
    onMouseLeave={e => { e.currentTarget.style.boxShadow = rest; e.currentTarget.style.transform = "translateY(0)"; }}
    onMouseDown={e => { e.currentTarget.style.transform = "translateY(0) scale(0.97)"; }}
    onMouseUp={e => { e.currentTarget.style.transform = "translateY(-1px) scale(1)"; }}
    ><span style={{ position: "relative", zIndex: 1 }}>{children}</span><span className="viv-btn-sheen" /></button>
  );
}

// Source indicator — tiny dot: faint grey = manual · solid gold = IBKR auto-synced · hollow gold ring = reconciled (IBKR figures + your notes)
function SourceDot({ source }) {
  const ibkr = source === "ibkr";
  const rec = source === "reconciled";
  const tip = ibkr
    ? <><strong style={{ color: C.gold }}>Auto-synced from IBKR.</strong><br />Pulled straight from your broker — exact prices, shares, commission and times.</>
    : rec
    ? <><strong style={{ color: C.gold }}>Reconciled.</strong><br />IBKR's exact figures merged into your manual entry, keeping your own notes, tags and stop.</>
    : <><strong style={{ color: C.white }}>Manual entry.</strong><br />You keyed this in yourself — not from IBKR.</>;
  return (
    <Abbr tip={tip} underline={false}>
      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginRight: 6, verticalAlign: "middle", cursor: "help", background: rec ? "transparent" : (ibkr ? C.gold : "rgba(255,255,255,0.28)"), border: rec ? `2px solid ${C.gold}` : "none", boxShadow: ibkr ? `0 0 5px ${C.gold}` : "none" }} />
    </Abbr>
  );
}

// ─── IBKR Sync: entry-date floor + preview reconstruction (pure, no DB writes) ───
const IBKR_SYNC_FLOOR = "2026-05-01"; // only system trades ENTERED on/after this date are pulled

// ─── Intraday Activity Log ─── per-position JSON column. Default shape always returned by the load mapper
// so downstream code never has to null-check. Events are immutable once added; only `reconciledExecId` and
// `reconciledAt` mutate (set by IBKR sync when it confirms an event). `lastClearedAt` records the last time
// the user dismissed reconciled events.
const INTRADAY_LOG_VERSION = 1;
const DEFAULT_INTRADAY_LOG = Object.freeze({ version: INTRADAY_LOG_VERSION, events: [], lastReconciledAt: null, lastClearedAt: null });
const normalizeIntradayLog = (raw) => {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_INTRADAY_LOG };
  return {
    version: typeof raw.version === "number" ? raw.version : INTRADAY_LOG_VERSION,
    events: Array.isArray(raw.events) ? raw.events : [],
    lastReconciledAt: raw.lastReconciledAt || null,
    lastClearedAt: raw.lastClearedAt || null,
  };
};
// Per-browser feature flag — read once at module load for the initial value, but the App component
// keeps a reactive state copy (intradayFeatureEnabled) so the Settings toggle can flip it live.
const INTRADAY_FEATURE_DEFAULT = (typeof window !== "undefined" && window.localStorage && localStorage.getItem("viv-intraday-enabled") === "1");
// Normalize a trade date to ISO YYYY-MM-DD (handles "M/D/YY" manual/dashboard entries and "YYYY-MM-DD" IBKR rows).
// Used both by the IBKR reconcile-matcher and the trade-review chart.
// Normalize any date string to a YYYY-MM-DD day key. Handles M/D/YY · M/D/YYYY · ISO (with - or /) and
// strips any trailing time component (e.g. "2026-05-01 14:30" or "2026-05-01T09:17" → "2026-05-01"),
// so same-day comparisons line up regardless of whether a time was stored.
const tradeDateISO = (d) => {
  if (!d) return "";
  const s = String(d).trim().split(/[ T]/)[0];
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; }
  return s;
};

// ── Trade-link mirror (localStorage) ──────────────────────────────────────────
// The DB column `trades.position_id` is the canonical store, but if the schema migration hasn't
// landed (or RLS/type-mismatch silently drops the UPDATE) the link is lost on refresh. To make the
// linkage refresh-proof regardless of DB state, every write the Link Trades wizard makes is also
// mirrored to localStorage. On every load we backfill `positionId` from this mirror when the DB
// value is missing — so the user's linking work persists even when the DB write fails silently.
//
// Shape: { [tradeId]: positionId | "past" }  ("past" = explicitly excluded; null/missing = unlinked)
const TRADE_LINKS_KEY = "viv-trade-links";
const loadTradeLinks = () => {
  try { return JSON.parse(localStorage.getItem(TRADE_LINKS_KEY) || "{}") || {}; }
  catch { return {}; }
};
const saveTradeLinks = (updates) => {
  // updates = [{ tradeId, positionId: <id|null|"past"> }]
  try {
    const cur = loadTradeLinks();
    updates.forEach(u => {
      const key = String(u.tradeId);
      if (u.positionId == null) delete cur[key]; // null means "clear the link"
      else cur[key] = u.positionId; // id or "past"
    });
    localStorage.setItem(TRADE_LINKS_KEY, JSON.stringify(cur));
  } catch {}
};
// Push the FULL localStorage mirror to user_settings.trade_links (durable cross-device store).
// Async, best-effort, never throws. Call this after any saveTradeLinks() write so the server copy
// stays current — without it, links die when localStorage gets evicted (Safari ITP) or the user
// signs in on a different device.
const syncTradeLinksToSupabase = (supabaseClient, userId) => {
  if (!supabaseClient || !userId) return;
  try {
    const full = loadTradeLinks();
    supabaseClient.from("user_settings").upsert(
      { user_id: userId, setting_key: "trade_links", setting_value: full, updated_at: new Date().toISOString() },
      { onConflict: "user_id,setting_key" }
    ).then(({ error }) => { if (error) console.error("trade_links sync failed:", error.message); });
  } catch {}
};
// Apply the localStorage mirror to a freshly-loaded trades array. DB value wins when present;
// otherwise the mirror fills in. "past" in the mirror becomes a sentinel string so the matcher's
// `if (t.positionId)` check treats it as truthy (excluding the trade from the heuristic pool).
const applyTradeLinks = (trades) => {
  const links = loadTradeLinks();
  if (!trades || trades.length === 0) return trades;
  return trades.map(t => {
    if (t.positionId != null) return t; // DB already has a value — trust it
    const mirrored = links[String(t.id)];
    if (mirrored == null) return t;
    return { ...t, positionId: mirrored };
  });
};

// Reconstruct closed round-trips (flat-to-flat per symbol) + open positions, then diff against current data.
function buildIbkrPreview(data, positions, journaledTrades, softDeletedExecIds, ignoreTickers) {
  // Per-user ignore list — tickers the user has marked default-skip in Settings. Rows still get
  // built and classified normally (so the user can override on a one-off basis); we just set
  // `ignored: true` and the modal defaults their action to "skip".
  const _ignoreSet = ignoreTickers instanceof Set ? ignoreTickers : new Set(ignoreTickers || []);
  const isIgnored = sym => _ignoreSet.has(String(sym || "").toUpperCase());
  // execIds the user previously soft-deleted as duplicates — these physical rows still exist in the trades
  // table (just with is_deleted=true), so re-inserting would hit the unique constraint trades_user_ib_exec.
  // Treat them as "synced" (no-op) so the user doesn't see ugly DB errors on every subsequent sync.
  const _deletedExecIds = softDeletedExecIds instanceof Set ? softDeletedExecIds : new Set(softDeletedExecIds || []);
  // Closed trades — group executions per symbol, close out a round-trip each time net position returns to flat.
  // Also emit "partial" entries for sells that REDUCED an open lot's shares without flattening it (so they
  // show up as realized P/L on the still-open position in the dashboard). When a lot eventually flattens,
  // the closed round-trip captures the whole story and partials for that completed cycle are NOT emitted —
  // so no double-counting.
  const bySym = {};
  (data.trades || []).forEach(t => { (bySym[t.symbol] = bySym[t.symbol] || []).push(t); });
  const closed = [];
  const partials = [];
  // Lookup of IBKR position by symbol (case-insensitive) — gives us the lot's TRUE open date even when
  // the Flex query window cuts off the original BUY execution. We anchor partials to this date so
  // partial.entry always matches position.entry (= openDate) and the dashboard matcher finds the link.
  const posBySym = {};
  (data.positions || []).forEach(p => { if (p.symbol) posBySym[String(p.symbol).toUpperCase()] = p; });
  Object.entries(bySym).forEach(([sym, execs]) => {
    execs.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    let pos = 0, cycle = [];
    execs.forEach(e => {
      pos += e.signedQty;
      cycle.push(e);
      if (pos === 0 && cycle.length) {
        const buys = cycle.filter(c => c.signedQty > 0);
        const sells = cycle.filter(c => c.signedQty < 0);
        const isLong = (buys[0] ? buys[0].date + buys[0].time : "z") <= (sells[0] ? sells[0].date + sells[0].time : "z");
        const entryLegs = isLong ? buys : sells, exitLegs = isLong ? sells : buys;
        const qty = entryLegs.reduce((s, c) => s + c.quantity, 0);
        const entryP = qty ? entryLegs.reduce((s, c) => s + c.price * c.quantity, 0) / qty : 0;
        const exitQty = exitLegs.reduce((s, c) => s + c.quantity, 0);
        const exitP = exitQty ? exitLegs.reduce((s, c) => s + c.price * c.quantity, 0) / exitQty : 0;
        const first = cycle[0], last = cycle[cycle.length - 1];
        const commission = cycle.reduce((s, c) => s + c.commission, 0);
        const realized = cycle.reduce((s, c) => s + c.realizedPnl, 0);
        const plDollar = realized || ((exitP - entryP) * qty - commission);
        const plPct = entryP > 0 ? (plDollar / (entryP * qty)) * 100 : 0;
        // Gate on EXIT date, not entry date — a pre-floor open that closes post-floor is a post-floor
        // realized event (P/L hits this month's books) and belongs in the journal. Earlier this filter
        // used first.date and silently dropped legit close-outs (e.g. April open → May close).
        if (last.date >= IBKR_SYNC_FLOOR && qty > 0) {
          closed.push({ ticker: sym, entry: first.date, entryTime: first.time, exit: last.date, exitTime: last.time,
            entryP: +entryP.toFixed(4), exitP: +exitP.toFixed(4), shares: qty, plPct: +plPct.toFixed(2),
            plDollar: +plDollar.toFixed(2), commission: +commission.toFixed(2), execId: last.execID, tradeId: last.tradeID,
            tradeType: isLong ? "Long" : "Short" });
        }
        cycle = [];
      }
    });
    // After processing all execs for this symbol: if cycle is non-empty, the lot is STILL OPEN.
    // Walk the cycle and emit a partial entry for each "close direction" exec — these are partial
    // take-profits / stop-trims that reduced shares but didn't flatten the lot. The trade's entry
    // = lot's first opening exec date (matches the position's openDate), so realizedByPosition matches.
    if (cycle.length > 0) {
      const firstExec = cycle[0];
      // Lot's TRUE open date — prefer the IBKR position's openDate (survives query-window truncation),
      // fall back to the first exec in our cycle when openDate isn't provided.
      const ibkrPos = posBySym[sym.toUpperCase()];
      const lotEntry = (ibkrPos && ibkrPos.openDate) || firstExec.date;
      const lotEntryTime = (ibkrPos && ibkrPos.openTime) || firstExec.time;
      // Gate is per-close-event (c.date), NOT lotEntry — a pre-floor lot can still emit post-floor
      // partial trims, because each trim is a post-floor realized event. We still walk the full cycle
      // (including pre-floor opens) so the running avg cost is correct; we only SKIP THE EMIT for
      // closes that fall before the floor.
      {
        const isLong = firstExec.signedQty > 0;
        // Running volume-weighted avg cost of opening legs preceding each close
        let openShares = 0, openCost = 0;
        cycle.forEach(c => {
          const isOpening = (isLong && c.signedQty > 0) || (!isLong && c.signedQty < 0);
          const isClosing = (isLong && c.signedQty < 0) || (!isLong && c.signedQty > 0);
          if (isOpening) {
            openShares += c.quantity;
            openCost += c.price * c.quantity;
          } else if (isClosing && openShares > 0) {
            const avgEntryP = openCost / openShares;
            const closedQty = c.quantity;
            if (c.date >= IBKR_SYNC_FLOOR) {
              // P/L from WEIGHTED-AVG cost basis (NOT IBKR's fifoPnlRealized). FIFO assigns each
              // partial share to its earliest-bought lot, which can differ wildly from weighted avg
              // when a position was built in multiple tranches at different prices — e.g. MDB built
              // at $400 then $300, sold partial at $382.29: FIFO marks it −$5.6k (vs the $400 lot),
              // weighted-avg marks it +$4.9k (vs the $366.67 blended cost). The dashboard's avg cost
              // IS weighted avg (matches IBKR's costBasisPrice on OpenPosition), so partial P/L must
              // use the same convention to stay self-consistent and match user expectations.
              const plDollar = (isLong ? (c.price - avgEntryP) : (avgEntryP - c.price)) * closedQty - c.commission;
              const plPct = avgEntryP > 0 ? (plDollar / (avgEntryP * closedQty)) * 100 : 0;
              partials.push({
                ticker: sym, entry: lotEntry, entryTime: lotEntryTime, exit: c.date, exitTime: c.time,
                entryP: +avgEntryP.toFixed(4), exitP: +c.price.toFixed(4), shares: closedQty,
                plPct: +plPct.toFixed(2), plDollar: +plDollar.toFixed(2), commission: +c.commission.toFixed(2),
                execId: c.execID, tradeId: c.tradeID, tradeType: isLong ? "Long" : "Short", isPartial: true,
              });
            }
            // Reduce the lot's running open shares by what we just closed (proportionally), whether or
            // not we emitted — avg cost must stay correct for any later post-floor closes in the cycle.
            const ratio = (openShares - closedQty) / openShares;
            openCost *= Math.max(0, ratio);
            openShares -= closedQty;
          }
        });
      }
    }
  });

  // Open positions — these are current holdings, so show them unless they have a KNOWN open date before the floor.
  // (IBKR Summary-level positions often omit the open date; a blank date must NOT hide a live holding.)
  const openPos = (data.positions || [])
    .filter(p => !p.openDate || p.openDate >= IBKR_SYNC_FLOOR)
    .map(p => ({ sym: p.symbol, conid: p.conid, shares: String(Math.abs(Number(p.shares))), ep: String(p.avgCost),
      cp: p.markPrice ? String(p.markPrice) : "", entry: p.openDate, entryTime: p.openTime,
      tradeType: Number(p.shares) < 0 ? "Short" : "Long" }));

  // Diff against current data → classify each row + attach the matched existing row id (for surgical writes).
  // Matching helpers — used by both closed-trade and partial-sell classifiers.
  const isIbkr = s => s === "ibkr" || s === "reconciled";
  const dayDiff = (a, b) => {
    if (!a || !b) return Infinity;
    const am = Date.parse(tradeDateISO(a));
    const bm = Date.parse(tradeDateISO(b));
    if (isNaN(am) || isNaN(bm)) return Infinity;
    return Math.abs(am - bm) / 86400000;
  };
  const sharesClose = (a, b, pct = 0.05) => {
    const aN = Number(a) || 0, bN = Number(b) || 0;
    return Math.abs(aN - bN) <= Math.max(1, Math.max(aN, bN) * pct);
  };
  // CLOSED ROUND-TRIPS — match by ticker + (entry day exact OR exit day exact). Fallback: entry within ±3 days
  // AND shares within 5% — handles the common case where the manual entry date drifts by a day from IBKR's
  // first BUY exec (timezone, manual-typing error, split-day fill). This is what stops the "Sync re-imports
  // everything I already closed manually" duplicate cycle.
  const tradeRows = closed.map(c => {
    const ignored = isIgnored(c.ticker);
    const synced = (journaledTrades || []).find(t => t.ibExecId && t.ibExecId === c.execId);
    if (synced) return { ...c, action: "synced", matchId: synced.id, ignored };
    if (c.execId && _deletedExecIds.has(c.execId)) return { ...c, action: "synced", matchId: null, prevDeleted: true, ignored };
    const tickerHits = (journaledTrades || []).filter(t => !isIbkr(t.source) && (t.ticker || "").toUpperCase() === c.ticker.toUpperCase());
    let cands = tickerHits.filter(t => tradeDateISO(t.entry) === tradeDateISO(c.entry) || tradeDateISO(t.exit) === tradeDateISO(c.exit));
    if (cands.length === 0) cands = tickerHits.filter(t => dayDiff(t.entry, c.entry) <= 3 && sharesClose(t.shares, c.shares, 0.05));
    if (cands.length === 1) {
      const m = cands[0];
      const sharesOk = sharesClose(m.shares, c.shares, 0.05);
      return { ...c, action: sharesOk ? "reconcile" : "review", matchId: m.id, matchStop: Number(m.stop) || 0, ignored };
    }
    if (cands.length > 1) return { ...c, action: "review", matchId: null, ignored };
    return { ...c, action: "new", matchId: null, ignored };
  });
  // PARTIAL SELLS from still-open lots — execId match first (re-sync of an already-imported partial = no-op).
  // Otherwise try to reconcile against a manual Sell-button partial for the same lot: ticker + lot entry day
  // within ±3d + exit day within ±1d + shares within 5%. Prevents duplicate trims from inflating trim % on
  // the open position.
  const partialRows = partials.map(c => {
    const ignored = isIgnored(c.ticker);
    const synced = (journaledTrades || []).find(t => t.ibExecId && t.ibExecId === c.execId);
    if (synced) return { ...c, action: "synced", matchId: synced.id, ignored };
    if (c.execId && _deletedExecIds.has(c.execId)) return { ...c, action: "synced", matchId: null, prevDeleted: true, ignored };
    const cands = (journaledTrades || []).filter(t =>
      !isIbkr(t.source) &&
      (t.ticker || "").toUpperCase() === c.ticker.toUpperCase() &&
      dayDiff(t.entry, c.entry) <= 3 &&
      dayDiff(t.exit, c.exit) <= 1 &&
      sharesClose(t.shares, c.shares, 0.05)
    );
    if (cands.length === 1) return { ...c, action: "reconcile", matchId: cands[0].id, matchStop: Number(cands[0].stop) || 0, ignored };
    if (cands.length > 1) return { ...c, action: "review", matchId: null, ignored };
    return { ...c, action: "new", matchId: null, ignored };
  });
  // ── INTRADAY LOG RECONCILIATION ── for each open position's intraday log, find IBKR partials whose
  // ticker + same exit day + shares within 5% match a logged trim event. On confirm these events get a
  // reconciledExecId + reconciledAt stamp so the dashboard's Today panel shows "IBKR ✓" beside them.
  // MVP only matches trim events (sells from a still-open lot — what the partials array carries). Add
  // events stay unreconciled and the user dismisses them once the next sync brings in the new round-trip.
  const intradayMatches = [];
  const intradayClaimedExecIds = new Set();
  (positions || []).forEach(pos => {
    const log = pos && pos.intradayLog;
    if (!log || !Array.isArray(log.events)) return;
    const sym = (pos.sym || "").toUpperCase();
    if (!sym) return;
    log.events.forEach(ev => {
      if (!ev || ev.reconciledExecId) return; // already reconciled
      if (ev.type !== "trim") return;          // MVP: only trims auto-reconcile
      const eventDay = tradeDateISO(ev.ts);
      const eventShares = Number(ev.shares) || 0;
      if (eventShares <= 0) return;
      const candidate = partialRows.find(par =>
        par.execId && par.action !== "review" &&
        !intradayClaimedExecIds.has(par.execId) &&
        (par.ticker || "").toUpperCase() === sym &&
        tradeDateISO(par.exit) === eventDay &&
        Math.abs((Number(par.shares) || 0) - eventShares) <= Math.max(1, eventShares * 0.05)
      );
      if (candidate) {
        intradayClaimedExecIds.add(candidate.execId);
        intradayMatches.push({
          positionId: pos.id,
          eventId: ev.id,
          execId: candidate.execId,
          ticker: sym,
          eventShares,
          eventPrice: Number(ev.price) || 0,
          eventTime: ev.ts,
          ibkrShares: Number(candidate.shares) || 0,
          ibkrPrice: Number(candidate.exitP) || 0,
          ibkrTime: `${candidate.exit}${candidate.exitTime ? " " + candidate.exitTime : ""}`,
        });
      }
    });
  });

  // ── AGGREGATE N-TO-1 MATCHING ── catch the case where ONE manual journal trade (the user's
  // hand-keyed aggregate) represents the SUM of multiple IBKR rows for the same ticker/lot.
  // Without this, IBKR's per-fill rows all classify as "new" individually (none match the manual's
  // total share count 1:1) and get imported as duplicates of the manual aggregate.
  // Subset-sum approach: for each unclaimed manual, find any subset of unmatched IBKR rows
  // (same ticker, entry within ±5 days) whose shares sum to the manual's total within 5%.
  // Marks the matched rows with action="duplicate", default choice "skip" in the modal.
  const claimedManualIds = new Set();
  [...tradeRows, ...partialRows].forEach(r => { if (r.matchId && r.action !== "new") claimedManualIds.add(r.matchId); });
  const subsetSum = (rows, target, tolPct = 0.05) => {
    const n = rows.length;
    if (n === 0 || n > 14) return null; // 2^14 = 16384 — fast; bail above
    const tol = Math.max(1, target * tolPct);
    for (let mask = 1; mask < (1 << n); mask++) {
      let sum = 0;
      const idx = [];
      for (let i = 0; i < n; i++) {
        if (mask & (1 << i)) { sum += Number(rows[i].shares) || 0; idx.push(i); }
      }
      if (Math.abs(sum - target) <= tol) return idx;
    }
    return null;
  };
  (journaledTrades || []).forEach(manual => {
    if (isIbkr(manual.source) || claimedManualIds.has(manual.id)) return;
    const sym = (manual.ticker || "").toUpperCase();
    if (!sym) return;
    const manualShares = Number(manual.shares) || 0;
    if (manualShares <= 0) return;
    // Eligible IBKR rows: action="new", same ticker, entry within ±5d of manual entry.
    const elig = [];
    tradeRows.forEach((r, i) => {
      if (r.action !== "new") return;
      if ((r.ticker || "").toUpperCase() !== sym) return;
      if (dayDiff(r.entry, manual.entry) > 5) return;
      elig.push({ r, i, kind: "trade" });
    });
    partialRows.forEach((r, i) => {
      if (r.action !== "new") return;
      if ((r.ticker || "").toUpperCase() !== sym) return;
      if (dayDiff(r.entry, manual.entry) > 5) return;
      elig.push({ r, i, kind: "partial" });
    });
    if (elig.length === 0) return;
    // First try the full set (most common: all eligible rows sum to the manual). Only fall back to
    // subset-sum if the total overshoots — avoids picking a wrong subset when the totals already line up.
    const total = elig.reduce((s, e) => s + (Number(e.r.shares) || 0), 0);
    let pickedIdx;
    if (Math.abs(total - manualShares) <= Math.max(1, manualShares * 0.05)) {
      pickedIdx = elig.map((_, i) => i);
    } else {
      pickedIdx = subsetSum(elig.map(e => e.r), manualShares, 0.05);
    }
    if (!pickedIdx) return;
    claimedManualIds.add(manual.id);
    pickedIdx.forEach(k => {
      const e = elig[k];
      const patch = { action: "duplicate", matchId: manual.id, dupAggregate: true, dupManualShares: manualShares };
      if (e.kind === "trade") tradeRows[e.i] = { ...e.r, ...patch };
      else partialRows[e.i] = { ...e.r, ...patch };
    });
  });
  const posRows = openPos.map(p => {
    const ignored = isIgnored(p.sym);
    const synced = (positions || []).find(x => x.ibConid && x.ibConid === p.conid);
    if (synced) return { ...p, action: "synced", matchId: synced.id, ignored };
    const cands = (positions || []).filter(x => !isIbkr(x.source) && (x.sym || "").toUpperCase() === p.sym.toUpperCase());
    if (cands.length === 1) {
      const m = cands[0];
      const sharesOk = Math.abs((Number(m.shares) || 0) - Number(p.shares)) <= Math.max(1, Number(p.shares) * 0.05);
      return { ...p, action: sharesOk ? "reconcile" : "review", matchId: m.id, ignored };
    }
    if (cands.length > 1) return { ...p, action: "review", matchId: null, ignored };
    return { ...p, action: "new", matchId: null, ignored };
  });
  // ── Auto-close candidates ── positions IBKR no longer holds, whose closing round-trip is in THIS sync.
  // SAFETY GATE (all must hold): (1) IBKR-owned only — a manual position is NEVER eligible; (2) IBKR's statement
  // actually returned trade data (an empty/partial statement disqualifies everything — can't confirm a close
  // without executions); (3) IBKR no longer reports the conid as open (checked against RAW positions, ignoring the
  // floor, so an out-of-scope-but-still-open lot is never mistaken for closed) — this also makes a PARTIAL sell
  // ineligible, since the conid is still listed with its reduced size; (4) a reconstructed closed round-trip for
  // that symbol exists in this sync. The journal-first rule (only remove once the close is actually written to the
  // Journal) is enforced at write time in confirmIbkrSync, not here.
  const haveTradeData = Array.isArray(data.trades) && data.trades.length > 0;
  const ibkrOpenConids = new Set((data.positions || []).filter(p => Number(p.shares) !== 0).map(p => String(p.conid)));
  const closedBySym = {};
  closed.forEach(c => { const k = (c.ticker || "").toUpperCase(); (closedBySym[k] = closedBySym[k] || []).push(c); });
  // Net signed quantity per symbol across ALL executions — independent proof of "fully flat" that doesn't rely on
  // the Open Positions section being present. A reopened or partially-sold symbol nets to non-zero and is excluded.
  const netBySym = {};
  (data.trades || []).forEach(t => { const k = (t.symbol || "").toUpperCase(); netBySym[k] = (netBySym[k] || 0) + (Number(t.signedQty) || 0); });
  const closeRows = !haveTradeData ? [] : (positions || [])
    .filter(p => isIbkr(p.source) && p.ibConid                       // (1) IBKR-owned only
      && !ibkrOpenConids.has(String(p.ibConid))                      // (3a) IBKR no longer lists it open
      && Math.round(netBySym[(p.sym || "").toUpperCase()] || 0) === 0 // (3b) executions net to flat (catches reopen/partial)
      && closedBySym[(p.sym || "").toUpperCase()])                   // (4) a closing round-trip exists this sync
    .map(p => {
      const rt = closedBySym[(p.sym || "").toUpperCase()];
      const link = rt[rt.length - 1];                                // most recent round-trip for this symbol
      return { posId: p.id, sym: p.sym, shares: p.shares, ep: p.ep, entry: p.entry, conid: p.ibConid,
        linkExecId: link ? link.execId : null, exit: link ? link.exit : "", action: "close", ignored: isIgnored(p.sym) };
    });

  // ── EXISTING DUPLICATES IN JOURNAL ── catches the case where the user already imported IBKR partials
  // in a PRIOR sync, then later (or earlier) keyed a manual aggregate trade representing the same fills.
  // These don't appear in this sync's tradeRows/partialRows (they're stuck in the journal), so we scan
  // directly. Each group = one manual aggregate + the IBKR-sourced journal rows that sum to it.
  const dupeJournalGroups = [];
  const ibkrJournalRows = (journaledTrades || []).filter(t => isIbkr(t.source));
  const claimedIbkrJournalIds = new Set();
  (journaledTrades || []).forEach(manual => {
    if (isIbkr(manual.source) || claimedManualIds.has(manual.id)) return;
    const sym = (manual.ticker || "").toUpperCase();
    if (!sym) return;
    const manualShares = Number(manual.shares) || 0;
    if (manualShares <= 0) return;
    const elig = ibkrJournalRows.filter(t =>
      !claimedIbkrJournalIds.has(t.id) &&
      (t.ticker || "").toUpperCase() === sym &&
      dayDiff(t.entry, manual.entry) <= 5
    );
    if (elig.length === 0) return;
    const total = elig.reduce((s, t) => s + (Number(t.shares) || 0), 0);
    let pickedIdx;
    if (Math.abs(total - manualShares) <= Math.max(1, manualShares * 0.05)) {
      pickedIdx = elig.map((_, i) => i);
    } else {
      pickedIdx = subsetSum(elig, manualShares, 0.05);
    }
    if (!pickedIdx) return;
    claimedManualIds.add(manual.id);
    const ibkrPicks = pickedIdx.map(i => elig[i]);
    ibkrPicks.forEach(t => claimedIbkrJournalIds.add(t.id));
    dupeJournalGroups.push({
      manualId: manual.id, ticker: manual.ticker, manualEntry: manual.entry, manualExit: manual.exit,
      manualShares, manualPL: Number(manual.plDollar) || 0, manualRMult: manual.rMult,
      ibkrRows: ibkrPicks.map(t => ({ id: t.id, entry: t.entry, exit: t.exit, shares: Number(t.shares) || 0, plDollar: Number(t.plDollar) || 0, reason: t.reason, source: t.source })),
      ibkrTotalShares: ibkrPicks.reduce((s, t) => s + (Number(t.shares) || 0), 0),
      ibkrTotalPL: ibkrPicks.reduce((s, t) => s + (Number(t.plDollar) || 0), 0),
    });
  });

  // ── SYMBOL REPORT ── per-symbol diagnostic showing what IBKR returned for each ticker and exactly
  // which output bucket(s) it ended up in (or why nothing was emitted). Surfaced in the sync modal so
  // silent failures ("I closed it but nothing showed up") can be self-diagnosed without code dives.
  const allSymbols = new Set();
  Object.keys(bySym).forEach(s => allSymbols.add((s || "").toUpperCase()));
  (data.positions || []).forEach(p => p.symbol && allSymbols.add(String(p.symbol).toUpperCase()));
  // Also include any of the user's open positions / journal entries that AREN'T in IBKR's data — those
  // are the loudest silent failures ("I have it open / closed manually but IBKR returned nothing for it").
  (positions || []).forEach(p => p.sym && allSymbols.add(String(p.sym).toUpperCase()));
  const symbolReport = Array.from(allSymbols).sort().map(SYM => {
    const execs = bySym[SYM] || bySym[Object.keys(bySym).find(k => k.toUpperCase() === SYM)] || [];
    const ibkrPos = (data.positions || []).find(p => String(p.symbol || "").toUpperCase() === SYM);
    const userPos = (positions || []).find(p => String(p.sym || "").toUpperCase() === SYM);
    const tradeRow = tradeRows.find(r => String(r.ticker || "").toUpperCase() === SYM);
    const partialRow = partialRows.find(r => String(r.ticker || "").toUpperCase() === SYM);
    const closeRow = closeRows.find(r => String(r.sym || "").toUpperCase() === SYM);
    const posRow = posRows.find(r => String(r.sym || "").toUpperCase() === SYM);
    const netQty = Math.round(netBySym[SYM] || 0);
    const closedThisSym = closed.filter(c => String(c.ticker || "").toUpperCase() === SYM);
    const partialsThisSym = partials.filter(p => String(p.ticker || "").toUpperCase() === SYM);
    const reasons = [];
    if (execs.length === 0) reasons.push("no executions in this statement");
    if (execs.length > 0 && closedThisSym.length === 0 && partialsThisSym.length === 0) {
      // Walk execs to see if any cycle closed pre-floor — that's the most common "vanished" cause now
      const lastExec = execs[execs.length - 1];
      if (lastExec && lastExec.date < IBKR_SYNC_FLOOR) reasons.push(`all closes before floor (${IBKR_SYNC_FLOOR})`);
    }
    if (execs.length > 0 && netQty !== 0 && closedThisSym.length === 0) reasons.push(`still open at IBKR (net ${netQty} sh)`);
    if (userPos && !ibkrPos && !closeRow && execs.length === 0) reasons.push("on your dashboard, NOT in IBKR statement — check Flex query period");
    if (userPos && userPos.source === "manual" && closedThisSym.length > 0 && !tradeRow) reasons.push("manual position — auto-close blocked (reconcile first)");
    return {
      sym: SYM,
      execs: execs.length,
      netQty,
      ibkrHasOpen: !!ibkrPos,
      userHasOpen: !!userPos,
      userSource: userPos ? userPos.source : null,
      closedBuilt: closedThisSym.length,
      partialsBuilt: partialsThisSym.length,
      tradeAction: tradeRow ? tradeRow.action : null,
      partialAction: partialRow ? partialRow.action : null,
      closeAction: closeRow ? closeRow.action : null,
      posAction: posRow ? posRow.action : null,
      notes: reasons,
    };
  });
  const diagnostics = {
    tradesReturned: (data.trades || []).length,
    positionsReturned: (data.positions || []).length,
    closedBuilt: closed.length,
    partialsBuilt: partials.length,
    haveTradeData,
    sinceFloor: IBKR_SYNC_FLOOR,
    symbolReport,
  };
  return { account: data.account, fetchedAt: data.fetchedAt, posRows, tradeRows, closeRows, partialRows, dupeJournalGroups, intradayMatches, diagnostics };
}

// ─── INTEGRITY CHECKER ─── pure function. Walks already-loaded journal + positions + softDeletedExecIds
// and emits a categorized list of findings. ZERO writes — read-only scan. Re-uses the same matching
// helpers as buildIbkrPreview so findings stay consistent between the live sync preview and the standalone
// integrity scan. Severity: "critical" → must review · "warn" → should review · "info" → background context.
function runIntegrityChecks({ journaledTrades = [], positions = [], softDeletedExecIds = new Set() } = {}) {
  const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
  const dayMs = 86400000;
  const dayDiffLocal = (a, b) => {
    if (!a || !b) return Infinity;
    const am = Date.parse(tradeDateISO(a));
    const bm = Date.parse(tradeDateISO(b));
    if (isNaN(am) || isNaN(bm)) return Infinity;
    return Math.abs(am - bm) / dayMs;
  };
  const sharesCloseLocal = (a, b, pct = 0.05) => {
    const aN = Number(a) || 0, bN = Number(b) || 0;
    return Math.abs(aN - bN) <= Math.max(1, Math.max(aN, bN) * pct);
  };
  const isIbkrLocal = s => s === "ibkr" || s === "reconciled";
  const subsetSumLocal = (rows, target, tolPct = 0.05) => {
    const n = rows.length;
    if (n === 0 || n > 14) return null;
    const tol = Math.max(1, target * tolPct);
    for (let mask = 1; mask < (1 << n); mask++) {
      let sum = 0; const idx = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) { sum += Number(rows[i].shares) || 0; idx.push(i); }
      if (Math.abs(sum - target) <= tol) return idx;
    }
    return null;
  };
  const findings = [];
  let nextId = 0;
  const add = (severity, category, name, description, details, suggestedAction) =>
    findings.push({ id: `f-${++nextId}`, severity, category, name, description, details: details || [], suggestedAction: suggestedAction || null });

  // ── DUPLICATES ──
  // 1) Exact-key duplicate trades
  const exactKey = t => `${(t.ticker || "").toUpperCase()}|${tradeDateISO(t.entry)}|${tradeDateISO(t.exit)}|${Number(t.shares) || 0}|${(Number(t.plDollar) || 0).toFixed(2)}`;
  const byKey = {};
  journaledTrades.forEach(t => { if (!t.ticker) return; const k = exactKey(t); (byKey[k] = byKey[k] || []).push(t); });
  Object.entries(byKey).forEach(([k, group]) => {
    if (group.length < 2) return;
    add("critical", "duplicates", "The same trade appears twice",
      `You have ${group.length} trades with the same ticker, entry, exit, share count, and P/L. This usually means you saved or imported the same trade twice, which inflates your stats and skews your win rate.`,
      group.map(t => `${t.ticker} · ${tradeDateISO(t.entry)} → ${tradeDateISO(t.exit)} · ${t.shares} sh · ${(Number(t.plDollar) || 0) >= 0 ? "+" : ""}$${(Number(t.plDollar) || 0).toFixed(2)} · source: ${t.source || "manual"}`),
      "Go to Trade Journal, find the duplicate rows, and delete the extra one — or open Settings → IBKR Sync and use the one-click duplicate-cleanup at the top of the modal."
    );
  });

  // 2) Soft-deleted exec_id leak — a live trade whose execId is also in the soft-deleted set
  const deletedSet = softDeletedExecIds instanceof Set ? softDeletedExecIds : new Set(softDeletedExecIds || []);
  journaledTrades.forEach(t => {
    if (t.ibExecId && deletedSet.has(t.ibExecId)) {
      add("critical", "duplicates", "A deleted IBKR trade came back",
        `A ${t.ticker} trade you previously deleted has reappeared in your live Journal. This usually happens when an edit accidentally un-deleted it, and leaving it as-is will mess up your performance metrics.`,
        [`${t.ticker} · ${tradeDateISO(t.entry)} · ${t.shares} sh · source: ${t.source || "manual"}`],
        "Open Trade Journal, search the ticker, and delete the trade again — or, if you actually want to keep it, note that the next IBKR sync will skip importing it."
      );
    }
  });

  // 3) Duplicate ib_conid on open positions
  const byConid = {};
  positions.forEach(p => { if (p.ibConid) (byConid[p.ibConid] = byConid[p.ibConid] || []).push(p); });
  Object.values(byConid).forEach(group => {
    if (group.length < 2) return;
    add("critical", "duplicates", "Same IBKR position listed twice",
      `${group.length} open positions in your Dashboard point to the same underlying IBKR position. The next sync will try to update both rows, which can double-count your exposure and risk.`,
      group.map(p => `${p.sym} · entry ${tradeDateISO(p.entry)} · ${p.shares} sh · source: ${p.source || "manual"}`),
      "Go to the Open Positions table, decide which row is the real one, and archive the duplicate via Settings → IBKR Sync (auto-close flow) — or contact support if you're unsure which to keep."
    );
  });

  // 4) Aggregate dupe: 1 manual = N IBKR (matches the Sync modal's existing detection — re-surfaced)
  const ibkrJournalRows = journaledTrades.filter(t => isIbkrLocal(t.source));
  const claimedIds = new Set();
  journaledTrades.filter(m => !isIbkrLocal(m.source)).forEach(manual => {
    if (claimedIds.has(manual.id)) return;
    const sym = (manual.ticker || "").toUpperCase();
    if (!sym) return;
    const manualShares = Number(manual.shares) || 0;
    if (manualShares <= 0) return;
    const elig = ibkrJournalRows.filter(t => !claimedIds.has(t.id) && (t.ticker || "").toUpperCase() === sym && dayDiffLocal(t.entry, manual.entry) <= 5);
    if (!elig.length) return;
    const total = elig.reduce((s, t) => s + (Number(t.shares) || 0), 0);
    const picked = Math.abs(total - manualShares) <= Math.max(1, manualShares * 0.05)
      ? elig.map((_, i) => i)
      : subsetSumLocal(elig, manualShares, 0.05);
    if (!picked) return;
    claimedIds.add(manual.id);
    picked.forEach(i => claimedIds.add(elig[i].id));
    add("warn", "duplicates", "One manual trade matches several IBKR fills",
      `A ${manual.ticker} trade you logged by hand (${manualShares} sh) adds up to the same shares as ${picked.length} IBKR-synced fill${picked.length === 1 ? "" : "s"} for the same ticker within a few days. The same trade is being counted twice — once manually, once from IBKR.`,
      [`Manual: ${manual.ticker} · ${tradeDateISO(manual.entry)} → ${tradeDateISO(manual.exit)} · ${manualShares} sh · ${(Number(manual.plDollar) || 0) >= 0 ? "+" : ""}$${(Number(manual.plDollar) || 0).toFixed(2)}${manual.rMult != null ? ` · ${Number(manual.rMult).toFixed(2)}R` : ""}`,
       ...picked.map(i => { const t = elig[i]; return `IBKR: ${t.ticker} · ${tradeDateISO(t.entry)} → ${tradeDateISO(t.exit)} · ${Number(t.shares) || 0} sh · ${(Number(t.plDollar) || 0) >= 0 ? "+" : ""}$${(Number(t.plDollar) || 0).toFixed(2)}`; })],
      "Open Settings → IBKR Sync — the duplicate-cleanup section has a one-click \"Keep manual, delete IBKR copies\" button for this exact case."
    );
  });

  // 5) Inverse aggregate: 1 IBKR round-trip = N manual partial trims
  const claimedIbkrIds = new Set();
  journaledTrades.filter(t => isIbkrLocal(t.source) && t.reason !== "Partial Trim").forEach(ibkr => {
    if (claimedIbkrIds.has(ibkr.id)) return;
    const sym = (ibkr.ticker || "").toUpperCase();
    if (!sym) return;
    const ibkrShares = Number(ibkr.shares) || 0;
    if (ibkrShares <= 0) return;
    const elig = journaledTrades.filter(t => !isIbkrLocal(t.source) && !claimedIds.has(t.id) && (t.ticker || "").toUpperCase() === sym && dayDiffLocal(t.entry, ibkr.entry) <= 5);
    if (elig.length < 2) return;
    const picked = subsetSumLocal(elig, ibkrShares, 0.05);
    if (!picked || picked.length < 2) return;
    claimedIbkrIds.add(ibkr.id);
    picked.forEach(i => claimedIds.add(elig[i].id));
    add("warn", "duplicates", "One IBKR trade matches several manual trims",
      `A single IBKR round-trip on ${ibkr.ticker} (${ibkrShares} sh) lines up with ${picked.length} smaller trades you logged manually (likely from using the Sell button). The same trade is being counted on both sides, distorting your trim history and totals.`,
      [`IBKR: ${ibkr.ticker} · ${tradeDateISO(ibkr.entry)} → ${tradeDateISO(ibkr.exit)} · ${ibkrShares} sh · ${(Number(ibkr.plDollar) || 0) >= 0 ? "+" : ""}$${(Number(ibkr.plDollar) || 0).toFixed(2)}`,
       ...picked.map(i => { const t = elig[i]; return `Manual: ${t.ticker} · ${tradeDateISO(t.entry)} → ${tradeDateISO(t.exit)} · ${Number(t.shares) || 0} sh · ${(Number(t.plDollar) || 0) >= 0 ? "+" : ""}$${(Number(t.plDollar) || 0).toFixed(2)}`; })],
      "Open Trade Journal, compare the two sets side-by-side, and delete whichever set is missing your notes, R-multiple, and setup — keep the one with your judgment."
    );
  });

  // ── ORPHANS ──
  // 6) Open position missing critical fields
  positions.forEach(p => {
    const shares = Number(p.shares);
    const ep = Number(p.ep);
    const missing = [];
    if (!p.sym) missing.push("ticker");
    if (!Number.isFinite(shares) || shares <= 0) missing.push(`shares (${p.shares == null ? "null" : p.shares})`);
    if (!Number.isFinite(ep) || ep <= 0) missing.push(`entry price (${p.ep == null ? "null" : p.ep})`);
    if (missing.length) add("critical", "orphans", "This open position is missing key info",
      `An open position is missing its ${missing.join(", ")}. Without these, the Position Sizer, exposure %, and risk numbers on your Dashboard can't be calculated correctly.`,
      [`${p.sym || "(no ticker)"} · entry ${tradeDateISO(p.entry) || "?"} · source: ${p.source || "manual"}`],
      "Go to the Dashboard, click the row in the Open Positions table, fill in the blank field, and press Save."
    );
  });

  // ── FORMULAS ──
  // 7) P/L sign disagreement (dollars vs percent vs derived)
  journaledTrades.forEach(t => {
    const d = Number(t.plDollar) || 0;
    const pct = Number(t.plPct) || 0;
    if (d && pct && Math.sign(d) !== Math.sign(pct)) {
      add("warn", "formulas", "Your dollar and percent P/L disagree",
        `Your ${t.ticker} trade shows a ${d >= 0 ? "profit" : "loss"} in dollars but a ${pct >= 0 ? "profit" : "loss"} in percent. It's almost always a typo on one of the two fields and will throw off your win rate and equity curve.`,
        [`${t.ticker} · ${tradeDateISO(t.entry)} → ${tradeDateISO(t.exit)} · $${d.toFixed(2)} · ${pct.toFixed(2)}%`],
        "Open the trade in Trade Journal, re-enter the correct number, and press Save — Save will recalculate everything from entry, exit, and shares."
      );
    }
    if (t.tradeType && Number(t.entryP) && Number(t.exitP) && d) {
      const derived = t.tradeType === "Short" ? (Number(t.entryP) - Number(t.exitP)) : (Number(t.exitP) - Number(t.entryP));
      if (derived && Math.sign(d) !== Math.sign(derived)) {
        add("warn", "formulas", "Your P/L doesn't match the entry and exit",
          `The profit or loss on your ${t.ticker} ${t.tradeType} trade doesn't match what the entry and exit prices say it should be. The most common cause is a long trade mislabeled as a short (or vice versa).`,
          [`${t.ticker} ${t.tradeType} · entry $${Number(t.entryP).toFixed(2)} → exit $${Number(t.exitP).toFixed(2)} · $${d.toFixed(2)}`],
          "Open the trade in Trade Journal, check the direction (long or short), correct it, and press Save."
        );
      }
    }
  });

  // 8) r_mult set without stop
  journaledTrades.forEach(t => {
    if (t.rMult != null && Number(t.rMult) !== 0 && (!t.stop || Number(t.stop) <= 0)) {
      add("info", "formulas", "This trade has an R-multiple but no stop loss",
        `Your ${t.ticker} trade shows ${Number(t.rMult).toFixed(2)}R but no stop loss is recorded, so the R-multiple can't be verified. It's usually old data from before stops were tracked.`,
        [`${t.ticker} · ${tradeDateISO(t.entry)} · ${Number(t.rMult).toFixed(2)}R · stop: ${t.stop || "not set"}`],
        "Open the trade in Trade Journal and either enter the stop loss you used at entry, or clear the R-multiple field — then Save."
      );
    }
  });

  // 9) Trim % > 100% on open positions
  positions.forEach(p => {
    const sym = (p.sym || "").toUpperCase();
    if (!sym) return;
    const matches = journaledTrades.filter(t => (t.ticker || "").toUpperCase() === sym && tradeDateISO(t.entry) === tradeDateISO(p.entry));
    if (!matches.length) return;
    const trimmed = matches.reduce((s, t) => s + (Number(t.shares) || 0), 0);
    const remaining = Number(p.shares) || 0;
    const original = trimmed + remaining;
    if (original > 0 && trimmed > original * 1.001) {
      add("critical", "formulas", "You sold more shares than you owned",
        `Your partial sells on ${p.sym} add up to ${trimmed} sh but you only have ${remaining} sh remaining. This almost always means one of your trims was logged twice.`,
        [`${p.sym} · entry ${tradeDateISO(p.entry)} · ${matches.length} matching trim${matches.length === 1 ? "" : "s"} · sold ${trimmed} sh · remaining ${remaining} sh`],
        "Go to Trade Journal, search for the ticker, find two partial sells with the same entry day, and delete the duplicate."
      );
    }
  });

  // ── IBKR identity ──
  // 10) IBKR trade missing ib_exec_id
  journaledTrades.forEach(t => {
    if ((t.source === "ibkr" || t.source === "reconciled") && !t.ibExecId) {
      add("critical", "ibkr", "IBKR trade is missing its fill ID",
        `Your ${t.ticker} trade is marked as coming from IBKR but has no IBKR fill ID attached. The next sync won't recognize it and will import it again as a brand-new trade — creating a duplicate.`,
        [`${t.ticker} · ${tradeDateISO(t.entry)} → ${tradeDateISO(t.exit)} · ${t.shares} sh · source: ${t.source}`],
        "Open the trade in Trade Journal and change its source to Manual — this gives up IBKR linking but prevents the duplicate on your next sync."
      );
    }
  });

  // 11) IBKR position missing ib_conid
  positions.forEach(p => {
    if ((p.source === "ibkr" || p.source === "reconciled") && !p.ibConid) {
      add("critical", "ibkr", "IBKR position is missing its position ID",
        `Your ${p.sym} open position is marked as coming from IBKR but has no IBKR position ID attached. The next sync won't be able to match it and will likely add a second copy.`,
        [`${p.sym} · entry ${tradeDateISO(p.entry)} · ${p.shares} sh · source: ${p.source}`],
        "Go to Settings → IBKR Sync and run a fresh sync to re-link the position — or open the row in the Open Positions table and change its source to Manual."
      );
    }
  });

  // 12) Stale IBKR sync (>30 days old)
  const cutoff = Date.now() - 30 * dayMs;
  let staleCount = 0;
  journaledTrades.concat(positions).forEach(r => {
    const src = r.source;
    const ts = r.ibSyncedAt || r.ib_synced_at;
    if ((src === "ibkr" || src === "reconciled") && (!ts || Date.parse(ts) < cutoff)) staleCount++;
  });
  if (staleCount) {
    add("info", "ibkr", "IBKR data hasn't refreshed recently",
      `${staleCount} IBKR-linked row${staleCount === 1 ? " hasn't" : "s haven't"} been refreshed in over 30 days. Your prices, fills, and commissions may be out of date.`,
      [], "Click the Sync button on the Dashboard or in Settings → IBKR Sync to pull the latest data from IBKR."
    );
  }

  // 14) Manual open position likely closed by IBKR same-day — catches the scenario where a member opens
  // a position in IBKR, keys it manually on the dashboard, then has it stopped out (or fully closed) the
  // same day by IBKR. The closed round-trip is in the journal but the manual open position is still on
  // the dashboard, looking like an open trade that no longer exists in reality.
  positions.forEach(p => {
    if (p.source !== "manual") return; // only manual positions can be orphaned this way (IBKR positions auto-close)
    const sym = (p.sym || "").toUpperCase();
    if (!sym || !p.entry) return;
    const posEntryDay = tradeDateISO(p.entry);
    if (!posEntryDay) return;
    const matchingClosed = journaledTrades.find(t =>
      (t.ticker || "").toUpperCase() === sym &&
      t.reason !== "Partial Trim" && // ignore partial trims — those don't fully close
      tradeDateISO(t.entry) === posEntryDay
    );
    if (matchingClosed) {
      add("warn", "orphans", `Your ${p.sym} position may already be closed`,
        `You have ${p.sym} open on the Dashboard, but your Trade Journal shows a completed ${p.sym} round-trip starting the same day. IBKR probably closed this position (stop hit, target hit, or full sell) but the manual row is still showing on your Dashboard.`,
        [`Open on Dashboard: ${p.sym} · entry ${posEntryDay} · ${p.shares} sh${p.notes ? ` · has notes` : ""}`,
         `Closed in Journal: ${matchingClosed.ticker} · ${tradeDateISO(matchingClosed.entry)} → ${tradeDateISO(matchingClosed.exit)} · ${matchingClosed.shares} sh · ${(Number(matchingClosed.plDollar) || 0) >= 0 ? "+" : ""}$${(Number(matchingClosed.plDollar) || 0).toFixed(2)}`],
        "Go to Open Positions, click ✕ on the manual row to remove it — your Trade Journal already has the real closed trade with the correct numbers from IBKR. Copy any notes you want to keep into the journal trade before removing."
      );
    }
  });

  const elapsedMs = (typeof performance !== "undefined" && performance.now) ? Math.round(performance.now() - t0) : 0;
  return {
    findings,
    counts: {
      critical: findings.filter(f => f.severity === "critical").length,
      warn: findings.filter(f => f.severity === "warn").length,
      info: findings.filter(f => f.severity === "info").length,
    },
    stats: { trades: journaledTrades.length, positions: positions.length, elapsedMs },
  };
}

// Integrity report modal — purely presentational; receives the report object and renders categorised findings.
const INTEGRITY_CATS = [
  { key: "duplicates", label: "Duplicates" },
  { key: "orphans", label: "Orphans" },
  { key: "formulas", label: "Formulas" },
  { key: "ibkr", label: "IBKR" },
];
function IntegrityReportModal({ open, onClose, report, onReRun, running }) {
  const [activeCat, setActiveCat] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  useEffect(() => {
    if (!report) return;
    const firstWithCritical = INTEGRITY_CATS.find(c => report.findings.some(f => f.category === c.key && f.severity === "critical"));
    const firstWithAny = INTEGRITY_CATS.find(c => report.findings.some(f => f.category === c.key));
    setActiveCat((firstWithCritical || firstWithAny || INTEGRITY_CATS[0]).key);
    setExpandedId(null);
  }, [report]);
  if (!open || !report) return null;
  const sevColor = s => s === "critical" ? C.red : s === "warn" ? C.gold : C.muted;
  const sevLabel = s => s === "critical" ? "Critical" : s === "warn" ? "Warn" : "Info";
  const catMaxSev = key => {
    const inCat = report.findings.filter(f => f.category === key);
    if (inCat.some(f => f.severity === "critical")) return "critical";
    if (inCat.some(f => f.severity === "warn")) return "warn";
    if (inCat.length) return "info";
    return null;
  };
  const visible = report.findings.filter(f => f.category === activeCat);
  const totalFindings = report.findings.length;
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(0,0,0,0.66)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(940px, 96vw)", maxHeight: "88vh", overflowY: "auto", background: C.bg2, border: `1px solid ${C.borderGold}`, borderRadius: 18, boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
        <div style={{ position: "sticky", top: 0, background: C.bg2, borderBottom: `1px solid ${C.border}`, padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 1, gap: 12, flexWrap: "wrap" }}>
          <div>
            <Eyebrow>Data Integrity</Eyebrow>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: C.white }}>Integrity Report</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={onReRun} disabled={running} style={{ padding: "7px 14px", borderRadius: 980, border: `1px solid ${C.borderGold}`, background: C.goldDim, color: C.gold, fontWeight: 700, fontSize: "0.66rem", cursor: running ? "default" : "pointer", fontFamily: font, opacity: running ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}>{running ? <><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 999, border: `2px solid ${C.gold}`, borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />Scanning…</> : "↻ Re-run"}</button>
            <button onClick={onClose} style={{ background: "transparent", border: "none", color: C.muted, fontSize: "1.1rem", cursor: "pointer", fontFamily: font }}>✕</button>
          </div>
        </div>
        <div style={{ padding: "20px 24px" }}>
          {/* Summary tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 10, marginBottom: 18 }}>
            <div style={{ padding: "12px 14px", borderRadius: 12, background: report.counts.critical > 0 ? "rgba(239,68,68,0.10)" : "rgba(34,197,94,0.08)", border: `1px solid ${report.counts.critical > 0 ? "rgba(239,68,68,0.30)" : "rgba(34,197,94,0.22)"}` }}>
              <div style={{ fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>Critical</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 800, color: report.counts.critical > 0 ? C.red : C.green }}>{report.counts.critical}</div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: 12, background: report.counts.warn > 0 ? "rgba(201,152,42,0.10)" : "rgba(255,255,255,0.03)", border: `1px solid ${report.counts.warn > 0 ? C.borderGold : C.border}` }}>
              <div style={{ fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>Warn</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 800, color: report.counts.warn > 0 ? C.goldBright : C.muted }}>{report.counts.warn}</div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>Info</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 800, color: C.text }}>{report.counts.info}</div>
            </div>
            <div style={{ padding: "12px 14px", borderRadius: 12, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>Scanned</div>
              <div style={{ fontSize: "0.84rem", fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{report.stats.trades} trades<br />{report.stats.positions} positions</div>
            </div>
          </div>
          {/* All-clean state */}
          {totalFindings === 0 ? (
            <div style={{ padding: "40px 16px", textAlign: "center", borderRadius: 12, background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.22)" }}>
              <div style={{ fontSize: "2.4rem", marginBottom: 8 }}>✓</div>
              <div style={{ fontWeight: 800, fontSize: "1rem", color: C.green, marginBottom: 6 }}>All clean</div>
              <div style={{ fontSize: "0.72rem", color: C.muted, lineHeight: 1.6 }}>Zero duplicates, zero orphans, zero formula glitches. Scan took {report.stats.elapsedMs}ms.</div>
            </div>
          ) : (
            <>
              {/* Category tabs */}
              <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                {INTEGRITY_CATS.map(c => {
                  const inCat = report.findings.filter(f => f.category === c.key);
                  if (!inCat.length) return null;
                  const sev = catMaxSev(c.key);
                  const isActive = activeCat === c.key;
                  return (
                    <button key={c.key} onClick={() => { setActiveCat(c.key); setExpandedId(null); }} style={{ padding: "7px 14px", borderRadius: 980, border: `1px solid ${isActive ? sevColor(sev) : C.border}`, background: isActive ? `${sevColor(sev)}1a` : "transparent", color: isActive ? sevColor(sev) : C.muted, fontWeight: 700, fontSize: "0.66rem", cursor: "pointer", fontFamily: font, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: sevColor(sev), display: "inline-block" }} />
                      {c.label}
                      <span style={{ fontSize: "0.6rem", padding: "1px 7px", borderRadius: 980, background: isActive ? `${sevColor(sev)}33` : "rgba(255,255,255,0.06)", color: isActive ? sevColor(sev) : C.muted }}>{inCat.length}</span>
                    </button>
                  );
                })}
              </div>
              {/* Findings list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {visible.map(f => {
                  const isOpen = expandedId === f.id;
                  return (
                    <div key={f.id} style={{ border: `1px solid ${isOpen ? sevColor(f.severity) + "55" : C.border}`, borderRadius: 12, background: isOpen ? `${sevColor(f.severity)}0d` : "rgba(255,255,255,0.02)", overflow: "hidden", transition: "border 120ms" }}>
                      <button onClick={() => setExpandedId(isOpen ? null : f.id)} style={{ width: "100%", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, background: "transparent", border: "none", cursor: "pointer", fontFamily: font, textAlign: "left", color: C.text }}>
                        <span style={{ width: 9, height: 9, borderRadius: 999, background: sevColor(f.severity), flexShrink: 0 }} />
                        <span style={{ fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase", color: sevColor(f.severity), minWidth: 56 }}>{sevLabel(f.severity)}</span>
                        <span style={{ fontWeight: 700, fontSize: "0.74rem", color: C.white, flex: 1 }}>{f.name}</span>
                        <span style={{ color: C.muted, fontSize: "0.66rem" }}>{isOpen ? "▴" : "▾"}</span>
                      </button>
                      {isOpen && (
                        <div style={{ padding: "0 14px 14px 14px" }}>
                          <div style={{ fontSize: "0.72rem", color: C.text, lineHeight: 1.6, marginBottom: 10 }}>{f.description}</div>
                          {f.details.length > 0 && (
                            <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(0,0,0,0.30)", border: `1px solid ${C.border}`, marginBottom: 10 }}>
                              {f.details.map((d, i) => (
                                <div key={i} style={{ fontSize: "0.66rem", color: C.text, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{d}</div>
                              ))}
                            </div>
                          )}
                          {f.suggestedAction && (
                            <div style={{ fontSize: "0.66rem", color: C.muted, lineHeight: 1.5, fontStyle: "italic" }}>
                              <strong style={{ color: C.goldBright, fontStyle: "normal" }}>Suggested next step: </strong>{f.suggestedAction}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {/* Footer */}
          <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div style={{ fontSize: "0.62rem", color: C.muted }}>Scan ran in {report.stats.elapsedMs}ms over {report.stats.trades} trades and {report.stats.positions} positions · read-only (no data changed)</div>
            <button onClick={onClose} style={{ padding: "9px 22px", borderRadius: 980, border: `1px solid ${C.borderGold}`, background: C.goldDim, color: C.gold, fontWeight: 800, fontSize: "0.74rem", cursor: "pointer", fontFamily: font }}>Close</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Interactive sync modal — preview + per-row decisions + confirm. Writes happen via onConfirm (App), surgically.
// Rows flagged `ignored` (ticker on the user's Settings → Ignore list) always default to "skip" regardless
// of action — overrides every other rule. User can still toggle to import/reconcile in the modal.
const ibkrDefaultChoice = (r) => {
  const action = typeof r === "string" ? r : r && r.action;
  const ignored = typeof r === "object" && r && r.ignored;
  if (ignored) return "skip";
  return action === "review" ? "skip" : action === "reconcile" ? "reconcile" : action === "synced" ? "update" : action === "close" ? "close" : action === "duplicate" ? "skip" : "new";
};
function ibkrChoiceOpts(r) {
  if (r.action === "synced") return [["update", "Update"], ["skip", "Skip"]];
  if (r.action === "reconcile") return [["reconcile", "Reconcile"], ["new", "Keep both"], ["skip", "Skip"]];
  if (r.action === "review") return r.matchId ? [["reconcile", "Reconcile"], ["new", "Import as new"], ["skip", "Skip"]] : [["new", "Import as new"], ["skip", "Skip"]];
  if (r.action === "close") return [["close", "Close out"], ["skip", "Keep open"]];
  if (r.action === "duplicate") return [["skip", "Skip (already in journal)"], ["new", "Import anyway"]];
  return [["new", "Import"], ["skip", "Skip"]];
}
function IbkrSyncModal({ open, onClose, status, data, error, result, onRetry, onConfirm, lastSync, onUndo, undoStatus }) {
  const [choices, setChoices] = useState({ pos: {}, trade: {}, close: {}, partial: {}, dupes: {} });
  useEffect(() => {
    if (data) {
      const def = rows => (rows || []).reduce((m, r, i) => { m[i] = ibkrDefaultChoice(r); return m; }, {});
      // Existing-duplicate groups default to "delete-ibkr": keep your manual aggregate (with R-mult, notes,
      // setup, tags), soft-delete the IBKR partial rows that double-counted it. Recoverable via is_deleted=false.
      const dupeDef = (data.dupeJournalGroups || []).reduce((m, _g, i) => { m[i] = "delete-ibkr"; return m; }, {});
      setChoices({ pos: def(data.posRows), trade: def(data.tradeRows), close: def(data.closeRows), partial: def(data.partialRows), dupes: dupeDef });
    }
  }, [data]);
  if (!open) return null;

  const chip = (action) => {
    const map = { new: { c: C.green, t: "New" }, synced: { c: C.muted, t: "Already synced" }, reconcile: { c: C.gold, t: "Matches manual" }, review: { c: C.red, t: "Needs review" }, close: { c: C.goldBright, t: "Closed at IBKR" }, duplicate: { c: C.goldBright, t: "Already in journal" } };
    const m = map[action] || map.new;
    return <span style={{ fontSize: "0.5rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: m.c, border: `1px solid ${m.c}55`, borderRadius: 980, padding: "2px 7px", whiteSpace: "nowrap" }}>{m.t}</span>;
  };
  const setChoice = (kind, i, v) => setChoices(prev => ({ ...prev, [kind]: { ...prev[kind], [i]: v } }));
  const sel = (kind, i, r) => (
    <select value={choices[kind][i] || "skip"} onChange={e => setChoice(kind, i, e.target.value)} disabled={status === "writing"}
      style={{ background: "rgba(255,255,255,0.05)", color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 6px", fontSize: "0.62rem", fontFamily: font, outline: "none" }}>
      {ibkrChoiceOpts(r).map(([v, label]) => <option key={v} value={v} style={{ background: C.bg2 }}>{label}</option>)}
    </select>
  );
  const confirm = () => {
    const resolve = (rows, ch) => (rows || []).map((r, i) => ({ ...r, choice: ch[i] || "skip" }));
    const dupes = (data.dupeJournalGroups || []).map((g, i) => ({ ...g, choice: choices.dupes[i] || "skip" }));
    const intradayMatches = data.intradayMatches || [];
    onConfirm(resolve(data.posRows, choices.pos), resolve(data.tradeRows, choices.trade), resolve(data.closeRows, choices.close), resolve(data.partialRows, choices.partial), dupes, intradayMatches);
  };
  const willWrite = data ? [...Object.values(choices.pos), ...Object.values(choices.trade), ...Object.values(choices.close), ...Object.values(choices.partial), ...Object.values(choices.dupes)].filter(c => c && c !== "skip").length : 0;

  return createPortal(
    <div onClick={status === "writing" ? undefined : onClose} style={{ position: "fixed", inset: 0, zIndex: 4000, background: "rgba(0,0,0,0.66)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(900px, 96vw)", maxHeight: "88vh", overflowY: "auto", background: C.bg2, border: `1px solid ${C.borderGold}`, borderRadius: 18, boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
        <div style={{ position: "sticky", top: 0, background: C.bg2, borderBottom: `1px solid ${C.border}`, padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 1 }}>
          <div>
            <Eyebrow>Interactive Brokers</Eyebrow>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: C.white }}>Sync from IBKR</div>
          </div>
          <button onClick={onClose} disabled={status === "writing"} style={{ background: "transparent", border: "none", color: C.muted, fontSize: "1.1rem", cursor: status === "writing" ? "default" : "pointer", fontFamily: font }}>✕</button>
        </div>
        <div style={{ padding: "20px 24px" }}>
          {status === "loading" && <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontSize: "0.84rem" }}>Pulling your latest statement from IBKR… <span style={{ display: "block", marginTop: 6, fontSize: "0.66rem" }}>(generation can take a few seconds)</span></div>}
          {status === "error" && (
            <div style={{ padding: "16px 18px", background: "rgba(239,68,68,0.08)", border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 12, color: C.text, fontSize: "0.76rem", lineHeight: 1.6 }}>
              <strong style={{ color: C.red }}>Couldn't sync.</strong><div style={{ marginTop: 6 }}>{error}</div>
              <button onClick={onRetry} style={{ marginTop: 14, padding: "8px 16px", borderRadius: 980, border: `1px solid ${C.borderGold}`, background: C.goldDim, color: C.gold, fontWeight: 700, fontSize: "0.7rem", cursor: "pointer", fontFamily: font }}>Try again</button>
            </div>
          )}
          {status === "done" && result && (
            <div style={{ textAlign: "center", padding: "30px 10px" }}>
              <div style={{ fontSize: "2rem", marginBottom: 8 }}>✓</div>
              <div style={{ fontWeight: 800, fontSize: "1rem", color: C.green, marginBottom: 10 }}>Sync complete</div>
              <div style={{ fontSize: "0.76rem", color: C.text, lineHeight: 1.8 }}>
                Trades: <strong style={{ color: C.white }}>{result.tInserted}</strong> new · <strong style={{ color: C.white }}>{result.tReconciled}</strong> reconciled · <strong style={{ color: C.white }}>{result.tUpdated}</strong> refreshed<br />
                Positions: <strong style={{ color: C.white }}>{result.pInserted}</strong> new · <strong style={{ color: C.white }}>{result.pReconciled}</strong> reconciled · <strong style={{ color: C.white }}>{result.pUpdated}</strong> refreshed · <strong style={{ color: C.white }}>{result.pClosed || 0}</strong> closed out
                {(result.partialsInserted || 0) > 0 && <><br />Partial sells: <strong style={{ color: C.white }}>{result.partialsInserted}</strong> imported</>}
                {(result.dupesResolved || 0) > 0 && <><br />Cleanup: <strong style={{ color: C.white }}>{result.dupesResolved}</strong> duplicate group{result.dupesResolved === 1 ? "" : "s"} resolved · <strong style={{ color: C.white }}>{result.dupesDeleted}</strong> row{result.dupesDeleted === 1 ? "" : "s"} soft-deleted</>}
                {(result.intradayReconciled || 0) > 0 && <><br />Intraday: <strong style={{ color: C.white }}>{result.intradayReconciled}</strong> event{result.intradayReconciled === 1 ? "" : "s"} confirmed by IBKR</>}
              </div>
              {result.errors && result.errors.length > 0 && <div style={{ marginTop: 12, fontSize: "0.66rem", color: C.red }}>{result.errors.length} row(s) failed and were skipped: {result.errors.slice(0, 3).join("; ")}{result.errors.length > 3 ? "…" : ""}</div>}
              <div style={{ marginTop: 18, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                {lastSync && result.syncId && lastSync.syncId === result.syncId && (
                  <button
                    onClick={() => { if (window.confirm("Undo this sync? All new rows will be soft-deleted, all reconciled rows will be restored to their pre-sync values, all auto-closed positions will be re-opened, and all cleanup-deleted duplicates will be restored. Notes/tags/setup/stops you've added since the sync are preserved.")) onUndo(); }}
                    disabled={undoStatus === "running"}
                    style={{ padding: "9px 18px", borderRadius: 980, border: `1px solid rgba(239,68,68,0.30)`, background: "rgba(239,68,68,0.08)", color: C.red, fontWeight: 700, fontSize: "0.72rem", cursor: undoStatus === "running" ? "default" : "pointer", fontFamily: font }}>
                    {undoStatus === "running" ? "Undoing…" : "↶ Undo this sync"}
                  </button>
                )}
                <button onClick={onClose} style={{ padding: "9px 22px", borderRadius: 980, border: `1px solid ${C.borderGold}`, background: C.goldDim, color: C.gold, fontWeight: 800, fontSize: "0.74rem", cursor: "pointer", fontFamily: font }}>Done</button>
              </div>
            </div>
          )}
          {(status === "preview" || status === "writing") && data && (
            <>
              {lastSync && lastSync.expiresAt && Date.parse(lastSync.expiresAt) > Date.now() && (
                <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.06)", border: `1px solid rgba(239,68,68,0.25)`, borderRadius: 10, fontSize: "0.66rem", color: C.text, lineHeight: 1.5, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span><strong style={{ color: C.red }}>↶ Previous sync recoverable</strong> · {lastSync.label || lastSync.syncedAt} · expires {new Date(lastSync.expiresAt).toLocaleString()}</span>
                  <button onClick={() => { if (window.confirm("Undo the PREVIOUS sync (not this preview)? All rows that sync inserted will be soft-deleted, reconciled rows restored to prior values, auto-closed positions re-opened, and cleanup-deleted duplicates restored.")) onUndo(); }} disabled={undoStatus === "running" || status === "writing"} style={{ padding: "6px 12px", borderRadius: 980, border: `1px solid rgba(239,68,68,0.30)`, background: "rgba(239,68,68,0.10)", color: C.red, fontWeight: 700, fontSize: "0.64rem", cursor: undoStatus === "running" ? "default" : "pointer", fontFamily: font, whiteSpace: "nowrap" }}>{undoStatus === "running" ? "Undoing…" : "Undo previous sync"}</button>
                </div>
              )}
              <div style={{ padding: "10px 14px", background: "rgba(201,152,42,0.08)", border: `1px solid ${C.borderGold}`, borderRadius: 10, fontSize: "0.7rem", color: C.text, lineHeight: 1.6, marginBottom: 18 }}>
                <strong style={{ color: C.goldBright }}>Review before importing.</strong> Closed on/after {IBKR_SYNC_FLOOR} (trades that closed before this date stay out of the journal even if their entry was earlier). <strong style={{ color: C.white }}>Reconcile</strong> updates a manual entry with IBKR's exact figures and keeps your notes/tags. Nothing is ever deleted; manual rows you don't reconcile are untouched.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 10, marginBottom: 18 }}>
                <StatTile label="Account" value={data.account || "—"} />
                <StatTile label="Open Positions" value={String(data.posRows.length)} />
                <StatTile label="Closed Trades" value={String(data.tradeRows.length)} />
                <StatTile label="Partial Sells" value={String((data.partialRows || []).length)} />
                {(data.dupeJournalGroups || []).length > 0 && <StatTile label="Dupes Found" value={String(data.dupeJournalGroups.length)} />}
              </div>
              {/* ─── LOUD BANNERS ─── catch silent statement failures that previously slipped past unnoticed. */}
              {data.diagnostics && !data.diagnostics.haveTradeData && data.diagnostics.positionsReturned === 0 && (
                <div style={{ padding: "12px 14px", background: "rgba(239,68,68,0.10)", border: `1px solid rgba(239,68,68,0.45)`, borderRadius: 10, fontSize: "0.74rem", color: C.text, lineHeight: 1.55, marginBottom: 14 }}>
                  <strong style={{ color: C.red }}>⚠ IBKR returned no data.</strong> Statement is empty — your Flex Query may still be regenerating, or the period setting excludes recent days. Check Settings → IBKR Connection (Period = "Last 365 Calendar Days") and retry in a few minutes.
                </div>
              )}
              {data.diagnostics && !data.diagnostics.haveTradeData && data.diagnostics.positionsReturned > 0 && (
                <div style={{ padding: "12px 14px", background: "rgba(255,200,40,0.10)", border: `1px solid rgba(255,200,40,0.40)`, borderRadius: 10, fontSize: "0.74rem", color: C.text, lineHeight: 1.55, marginBottom: 14 }}>
                  <strong style={{ color: C.goldBright }}>⚠ No trade executions in this statement.</strong> IBKR returned your open positions but zero executions, so close-detection, partial-sell import, and reconcile are OFF for this sync. If you traded recently, the statement likely hasn't refreshed yet — retry later.
                </div>
              )}
              {/* ─── DIAGNOSTICS PANEL ─── per-symbol gate trace. Collapsed by default; expand to see exactly
                   what IBKR returned for each ticker and which output bucket it landed in (or why it didn't). */}
              {data.diagnostics && (data.diagnostics.symbolReport || []).length > 0 && (
                <details style={{ marginBottom: 18, border: `1px solid ${C.border}`, borderRadius: 10, background: "rgba(255,255,255,0.02)" }}>
                  <summary style={{ padding: "10px 14px", cursor: "pointer", fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, listStyle: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>🔍 Diagnostics · per-symbol gate trace</span>
                    <span style={{ fontSize: "0.58rem", color: C.muted, fontWeight: 600, letterSpacing: 0, textTransform: "none" }}>
                      {data.diagnostics.tradesReturned} execs · {data.diagnostics.closedBuilt} round-trips · {data.diagnostics.partialsBuilt} partials · floor {data.diagnostics.sinceFloor}
                    </span>
                  </summary>
                  <div style={{ padding: "0 14px 12px 14px" }}>
                    <div style={{ fontSize: "0.62rem", color: C.muted, marginBottom: 10, lineHeight: 1.55 }}>
                      For every ticker either on your dashboard or in this IBKR statement, here's what was emitted (or why nothing was). If you expected an action that's missing, the <strong style={{ color: C.text }}>Notes</strong> column tells you the gate that blocked it.
                    </div>
                    <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 8 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.66rem" }}>
                        <thead><tr style={{ borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
                          {["Symbol", "IBKR Execs", "Net Qty", "IBKR Open?", "On Dashboard?", "Round-Trips Built", "Partials Built", "Action", "Notes"].map(h => (
                            <th key={h} style={{ padding: "7px 8px", textAlign: "left", fontSize: "0.48rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {data.diagnostics.symbolReport.map((r, i) => {
                            const action = r.tradeAction || r.partialAction || r.closeAction || r.posAction || null;
                            const actionColor = action === "new" ? C.green : action === "reconcile" ? C.gold : action === "close" ? C.goldBright : action === "review" ? C.red : action === "synced" ? C.muted : C.muted;
                            const hasIssue = r.notes.length > 0;
                            return (
                              <tr key={r.sym} style={{ borderBottom: `1px solid rgba(255,255,255,0.04)`, background: hasIssue ? "rgba(239,68,68,0.04)" : "transparent" }}>
                                <td style={{ padding: "6px 8px", color: C.white, fontWeight: 700 }}>{r.sym}</td>
                                <td style={{ padding: "6px 8px", color: r.execs > 0 ? C.text : C.muted }}>{r.execs}</td>
                                <td style={{ padding: "6px 8px", color: r.netQty === 0 ? C.muted : (r.netQty > 0 ? C.green : C.red) }}>{r.netQty}</td>
                                <td style={{ padding: "6px 8px", color: C.text }}>{r.ibkrHasOpen ? "✓" : "—"}</td>
                                <td style={{ padding: "6px 8px", color: C.text }}>{r.userHasOpen ? (r.userSource === "manual" ? "✓ manual" : `✓ ${r.userSource}`) : "—"}</td>
                                <td style={{ padding: "6px 8px", color: r.closedBuilt > 0 ? C.gold : C.muted, fontWeight: r.closedBuilt > 0 ? 700 : 400 }}>{r.closedBuilt}</td>
                                <td style={{ padding: "6px 8px", color: r.partialsBuilt > 0 ? C.gold : C.muted, fontWeight: r.partialsBuilt > 0 ? 700 : 400 }}>{r.partialsBuilt}</td>
                                <td style={{ padding: "6px 8px", color: actionColor, fontWeight: action ? 700 : 400, textTransform: "uppercase", fontSize: "0.56rem", letterSpacing: "0.06em" }}>{action || "—"}</td>
                                <td style={{ padding: "6px 8px", color: hasIssue ? C.red : C.muted, fontSize: "0.60rem", lineHeight: 1.45 }}>{r.notes.length ? r.notes.join(" · ") : "ok"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </details>
              )}
              {[{ kind: "pos", title: "Open Positions", rows: data.posRows, cols: ["sym", "shares", "ep", "entry"], head: ["Symbol", "Shares", "Avg Cost", "Opened"] },
                { kind: "trade", title: "Closed Trades (round-trips)", rows: data.tradeRows, cols: ["ticker", "shares", "entryP", "exitP", "plDollar", "entry"], head: ["Symbol", "Shares", "Entry", "Exit", "P/L $", "In"] },
                ...(data.partialRows && data.partialRows.length ? [{ kind: "partial", title: "Partial Sells (from still-open positions)", rows: data.partialRows, cols: ["ticker", "shares", "entryP", "exitP", "plDollar", "exit"], head: ["Symbol", "Shares", "Avg Cost", "Exit", "P/L $", "Sold"] }] : []),
                ...(data.closeRows && data.closeRows.length ? [{ kind: "close", title: "Closed at IBKR — remove from Open Positions", rows: data.closeRows, cols: ["sym", "shares", "entry", "exit"], head: ["Symbol", "Shares", "Opened", "Closed"] }] : [])].map(sec => (
                <div key={sec.title} style={{ marginBottom: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: sec.kind === "close" ? C.goldBright : C.gold, marginBottom: 8 }}>{sec.title} ({sec.rows.length})</div>
                  {sec.kind === "close" && <div style={{ fontSize: "0.64rem", color: C.muted, marginBottom: 8, lineHeight: 1.5 }}>These came in from IBKR and are now fully closed there. <strong style={{ color: C.text }}>Close out</strong> files the closed trade into your Journal and removes it from Open Positions (the record is archived, never destroyed, and recoverable). Choose <strong style={{ color: C.text }}>Keep open</strong> to leave it on the Dashboard.</div>}
                  {sec.kind === "partial" && <div style={{ fontSize: "0.64rem", color: C.muted, marginBottom: 8, lineHeight: 1.5 }}>Trims you took in IBKR that did <strong style={{ color: C.text }}>not</strong> fully close the position. Importing each one logs it to your Journal and surfaces it on the still-open position as realized P/L + "% Trimmed" in the Dashboard. Dedup is by IBKR execution id, so re-syncs are safe.</div>}
                  {sec.rows.length === 0 ? <div style={{ fontSize: "0.72rem", color: C.muted, padding: "8px 0" }}>None closed on/after {IBKR_SYNC_FLOOR}. (Expand <strong style={{ color: C.text }}>Diagnostics</strong> above to see why a specific symbol isn't here.)</div> : (
                    <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem" }}>
                        <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>{sec.head.map(h => <th key={h} style={{ padding: "8px 8px", textAlign: "left", fontWeight: 700, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, whiteSpace: "nowrap" }}>{h}</th>)}<th style={{ padding: "8px 8px", textAlign: "center", fontWeight: 700, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>Status</th><th style={{ padding: "8px 8px", textAlign: "right", fontWeight: 700, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>Action</th></tr></thead>
                        <tbody>{sec.rows.map((r, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.04)`, opacity: (choices[sec.kind][i] === "skip") ? 0.45 : 1 }}>
                            {sec.cols.map(col => <td key={col} style={{ padding: "7px 8px", color: col === "plDollar" ? (r[col] >= 0 ? C.green : C.red) : C.text, fontWeight: col === sec.cols[0] ? 700 : 400, whiteSpace: "nowrap" }}>{col === "ep" || col === "entryP" || col === "exitP" ? (r[col] !== undefined && r[col] !== "" ? Number(r[col]).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—") : col === "plDollar" ? `${r[col] >= 0 ? "+" : ""}${Number(r[col]).toLocaleString()}` : (col === "entry" || col === "exit") ? (tradeDateISO(r[col]) || r[col] || "—") : (r[col] ?? "—")}</td>)}
                            <td style={{ padding: "7px 8px", textAlign: "center" }}>
                              <div style={{ display: "inline-flex", flexDirection: "column", gap: 3, alignItems: "center" }}>
                                {chip(r.action)}
                                {r.ignored && (
                                  <span title="On your Ignore list — defaulted to Skip. Toggle the Action dropdown to import this one." style={{ fontSize: "0.46rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 980, padding: "2px 6px", background: "rgba(255,255,255,0.03)", whiteSpace: "nowrap" }}>⊘ Ignored</span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: "7px 8px", textAlign: "right" }}>{sel(sec.kind, i, r)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
              {/* ─── Intraday events confirmed by IBKR ─── auto-matched from each position's Today log against
                   incoming IBKR partials. On confirm, the matched events are marked reconciledExecId so they
                   show "IBKR ✓" in the dashboard's Today panel. No new journal rows; the IBKR partial itself
                   is the journal record (which gets imported by the Partial Sells section above). */}
              {data.intradayMatches && data.intradayMatches.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.goldBright, marginBottom: 8 }}>✓ Intraday events confirmed by IBKR ({data.intradayMatches.length})</div>
                  <div style={{ fontSize: "0.64rem", color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>
                    These are events you logged in the dashboard's <strong style={{ color: C.text }}>Today</strong> panel that match an incoming IBKR partial. On confirm they'll be marked <strong style={{ color: C.green }}>IBKR ✓</strong> in your timeline. No new trade rows are created here — IBKR's actual fill is imported by the <strong style={{ color: C.text }}>Partial Sells</strong> section above (that's the canonical journal record).
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {data.intradayMatches.map((m, i) => (
                      <div key={`${m.positionId}-${m.eventId}-${i}`} style={{ display: "grid", gridTemplateColumns: "min-content 1fr 1fr min-content", gap: 12, alignItems: "center", padding: "8px 12px", borderRadius: 8, background: "rgba(201,152,42,0.05)", border: `1px solid ${C.borderGold}` }}>
                        <span style={{ fontSize: "0.78rem", color: C.goldBright, fontWeight: 800 }}>{m.ticker}</span>
                        <div style={{ fontSize: "0.64rem", color: C.text, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                          <div style={{ color: C.muted, fontSize: "0.52rem", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>You logged</div>
                          {m.eventShares} sh{m.eventPrice > 0 ? ` @ $${m.eventPrice.toFixed(2)}` : ""}
                        </div>
                        <div style={{ fontSize: "0.64rem", color: C.text, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                          <div style={{ color: C.muted, fontSize: "0.52rem", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>IBKR confirmed</div>
                          {m.ibkrShares} sh @ ${m.ibkrPrice.toFixed(2)}
                        </div>
                        <span style={{ fontSize: "0.52rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.green, padding: "3px 9px", borderRadius: 980, background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.32)" }}>Match</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {data.dupeJournalGroups && data.dupeJournalGroups.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.red, marginBottom: 8 }}>⚠ Existing duplicates in your journal ({data.dupeJournalGroups.length})</div>
                  <div style={{ fontSize: "0.64rem", color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>
                    Each group below is one manual aggregate trade + a set of IBKR-imported rows whose shares <strong style={{ color: C.text }}>sum to the same total</strong> — so they're double-counting the same fills. Default is to <strong style={{ color: C.text }}>keep your manual entry (with R-multiple, notes, tags)</strong> and soft-delete the IBKR rows. Nothing is hard-deleted — every removal sets <code style={{ color: C.gold }}>is_deleted=true</code> and is recoverable from the DB.
                  </div>
                  {data.dupeJournalGroups.map((g, i) => {
                    const ch = choices.dupes[i] || "skip";
                    const sharesMatch = Math.abs(g.ibkrTotalShares - g.manualShares) <= Math.max(1, g.manualShares * 0.05);
                    return (
                      <div key={i} style={{ marginBottom: 12, padding: 12, borderRadius: 10, border: `1px solid ${ch === "skip" ? C.border : C.borderGold}`, background: ch === "skip" ? "rgba(255,255,255,0.02)" : "rgba(201,152,42,0.05)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 800, fontSize: "0.78rem", color: C.goldBright }}>{g.ticker} <span style={{ color: C.muted, fontWeight: 500, fontSize: "0.66rem" }}>· {sharesMatch ? "shares match exactly" : "shares within 5%"}</span></div>
                          <select value={ch} onChange={e => setChoice("dupes", i, e.target.value)} disabled={status === "writing"} style={{ background: "rgba(255,255,255,0.05)", color: C.white, border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 8px", fontSize: "0.66rem", fontFamily: font, outline: "none", minWidth: 220 }}>
                            <option value="delete-ibkr" style={{ background: C.bg2 }}>Keep manual · delete {g.ibkrRows.length} IBKR row{g.ibkrRows.length === 1 ? "" : "s"}</option>
                            <option value="delete-manual" style={{ background: C.bg2 }}>Keep IBKR · delete manual aggregate</option>
                            <option value="skip" style={{ background: C.bg2 }}>Skip (keep both)</option>
                          </select>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: "0.66rem" }}>
                          <div style={{ padding: 10, borderRadius: 8, background: ch === "delete-manual" ? "rgba(239,68,68,0.10)" : "rgba(255,255,255,0.03)", border: `1px solid ${ch === "delete-manual" ? "rgba(239,68,68,0.30)" : C.border}`, opacity: ch === "delete-manual" ? 0.7 : 1 }}>
                            <div style={{ fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>Your manual {ch === "delete-manual" && "· will be deleted"}</div>
                            <div style={{ color: C.text, lineHeight: 1.5 }}>
                              {tradeDateISO(g.manualEntry) || g.manualEntry} → {tradeDateISO(g.manualExit) || g.manualExit} · {Number(g.manualShares).toLocaleString()} sh · <strong style={{ color: g.manualPL >= 0 ? C.green : C.red }}>{g.manualPL >= 0 ? "+" : ""}{fmt$(Math.abs(g.manualPL), 2)}</strong>{g.manualRMult != null && <> · {Number(g.manualRMult).toFixed(2)}R</>}
                            </div>
                          </div>
                          <div style={{ padding: 10, borderRadius: 8, background: ch === "delete-ibkr" ? "rgba(239,68,68,0.10)" : "rgba(255,255,255,0.03)", border: `1px solid ${ch === "delete-ibkr" ? "rgba(239,68,68,0.30)" : C.border}`, opacity: ch === "delete-ibkr" ? 0.7 : 1 }}>
                            <div style={{ fontSize: "0.52rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>IBKR rows ({g.ibkrRows.length}) {ch === "delete-ibkr" && "· will be deleted"}</div>
                            {g.ibkrRows.map(r => (
                              <div key={r.id} style={{ color: C.text, lineHeight: 1.5 }}>
                                {tradeDateISO(r.entry) || r.entry} → {tradeDateISO(r.exit) || r.exit} · {Number(r.shares).toLocaleString()} sh · <strong style={{ color: r.plDollar >= 0 ? C.green : C.red }}>{r.plDollar >= 0 ? "+" : ""}{fmt$(Math.abs(r.plDollar), 2)}</strong>
                              </div>
                            ))}
                            <div style={{ marginTop: 4, paddingTop: 4, borderTop: `1px dashed ${C.border}`, color: C.muted, fontSize: "0.62rem" }}>Total: {Number(g.ibkrTotalShares).toLocaleString()} sh · {g.ibkrTotalPL >= 0 ? "+" : ""}{fmt$(Math.abs(g.ibkrTotalPL), 2)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.64rem", color: C.muted }}>{willWrite} row{willWrite === 1 ? "" : "s"} will be written · the rest skipped.</span>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={onClose} disabled={status === "writing"} style={{ padding: "10px 20px", borderRadius: 980, border: `1px solid ${C.border}`, background: "transparent", color: C.text, fontWeight: 700, fontSize: "0.74rem", cursor: status === "writing" ? "default" : "pointer", fontFamily: font }}>Cancel</button>
                  <button onClick={confirm} disabled={status === "writing" || willWrite === 0} style={{ padding: "10px 22px", borderRadius: 980, border: "none", background: willWrite === 0 ? "rgba(255,255,255,0.1)" : `linear-gradient(135deg, ${C.goldMid}, ${C.goldBright})`, color: willWrite === 0 ? C.muted : "#000", fontWeight: 800, fontSize: "0.74rem", cursor: (status === "writing" || willWrite === 0) ? "default" : "pointer", fontFamily: font }}>{status === "writing" ? "Importing…" : `Import ${willWrite}`}</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>, document.body);
}

// ═══════════════════════════════════════
// ─── CALCULATOR TABS (unchanged logic) ───
// ═══════════════════════════════════════
function RiskTab({ guideEnter, guideLeave, gactive, expert, demo }) {
  const [exampleMode, setExampleMode] = useState(demo);
  const [sym, setSym] = useState(demo ? DEMO_RISK.sym : "");
  const [mode, setMode] = useState("%");
  const [sharePrice, setSharePrice] = useState(demo ? DEMO_RISK.sharePrice : "");
  const [posSizePct, setPosSizePct] = useState(demo ? DEMO_RISK.posSizePct : "");
  const [portfolio, setPortfolio] = useState(demo ? DEMO_RISK.portfolio : "");
  const [stopVal, setStopVal] = useState(demo ? DEMO_RISK.stopVal : "");
  useEffect(() => { if (demo) { setSym(DEMO_RISK.sym); setSharePrice(DEMO_RISK.sharePrice); setPosSizePct(DEMO_RISK.posSizePct); setPortfolio(DEMO_RISK.portfolio); setStopVal(DEMO_RISK.stopVal); } else { setSym(""); setSharePrice(""); setPosSizePct(""); setPortfolio(""); setStopVal(""); } }, [demo]);
  const r = useMemo(() => {
    const sp = +sharePrice, psPct = +posSizePct, p = +portfolio, sv = +stopVal;
    if (!sp || !psPct || !p || !sv || sp <= 0 || psPct <= 0 || p <= 0 || sv <= 0) return null;
    const stopPct = mode === "%" ? sv : (sv / sp) * 100;
    if (stopPct <= 0 || stopPct >= 100) return null;
    const stopPrice = mode === "%" ? sp * (1 - sv / 100) : sp - sv;
    if (stopPrice <= 0 || stopPrice >= sp) return null;
    const posValue = p * (psPct / 100);
    const shares = Math.floor(posValue / sp);
    if (shares <= 0) return null;
    const riskPerShare = sp - stopPrice;
    const totalRisk = shares * riskPerShare;
    const riskPctEquity = (totalRisk / p) * 100;
    const rTargets = [1,2,3,4,5,6].map(n => {
      const dollarR = riskPerShare * n;
      const target = sp + dollarR;
      const pctGain = (dollarR / sp) * 100;
      return { n, dollarR: dollarR * shares, target, pctGain };
    });
    return { shares, riskPctEquity, totalRisk, stopPrice, stopPct, posValue, riskPerShare, rTargets };
  }, [sharePrice, posSizePct, portfolio, stopVal, mode]);
// ════════════════════════════════════════════════════════════════════════
// POSITION RISK — new render block for RiskTab
// Replaces its existing `return ( … );`. KEEPS the existing `r` memo + state
// (sym, mode, sharePrice, posSizePct, portfolio, stopVal) verbatim. Markup
// matches the mockup's #panel-risk. Receives guide props.
//
// SIGNATURE CHANGE: function RiskTab({ demo, guideEnter, guideLeave, gactive, expert })
//
// NEW HELPER (just above the return):
// ════════════════════════════════════════════════════════════════════════

const f2 = (n) => (isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f0 = (n) => Math.round(isFinite(n) ? n : 0).toLocaleString("en-US");
const money = (n) => (n < 0 ? "−$" : "$") + Math.abs(isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── RETURN ───
return (
  <div className={"toolpanel on" + (exampleMode ? " example" : "")} id="panel-risk" onInput={() => exampleMode && setExampleMode(false)}>
    <div className={"intro guide" + gactive("risk")} data-gtitle="Position Risk" onMouseEnter={guideEnter("risk", "Position Risk", "Before you buy, this tells you exactly how many shares to take so that hitting your stop only costs a small, planned slice of your account — usually one to two percent. It also maps out your profit targets in R, your unit of risk.", "/audio/premium-risk.mp3")} onMouseLeave={guideLeave("risk")}>
      <div className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg></div>
      <div><h3>What is Position Risk?</h3><p>The #1 rule is to never lose much on one trade. Enter a stock's price, where you'd sell if wrong (your <b>stop</b>), and how much of your account to commit — and it tells you <b>exactly how many shares to buy</b> so a stop-out only costs a small, planned amount.</p></div>
    </div>
    <div className="card">
      <div className="io">
        <div>
          <div className="panelhead">Your trade</div>
          <div className="iogrid">
            <div className="field"><label>Symbol</label><input className="in" value={sym} onChange={e => setSym(e.target.value)} placeholder="NVDA" /><div className="hint">Just a label.</div></div>
            <div className="field"><label><span className="term" data-tip="The price you'd pay per share right now.">Share price $</span></label><input className="in" value={sharePrice} onChange={e => setSharePrice(e.target.value)} placeholder="142.50" /><div className="hint">Price per share.</div></div>
            <div className="field"><label><span className="term" data-tip="How much of your whole account to put into this one position, as a percent.">Position size %</span></label><input className="in" value={posSizePct} onChange={e => setPosSizePct(e.target.value)} placeholder="20" /><div className="hint">% of account in this trade.</div></div>
            <div className="field"><label><span className="term" data-tip="Your total trading capital.">Portfolio $</span></label><input className="in" value={portfolio} onChange={e => setPortfolio(e.target.value)} placeholder="500000" /><div className="hint">Total account size.</div></div>
            <div className="field full"><label><span className="term" data-tip="Your stop is where you'll sell if the trade goes against you. Enter it as a percent below entry, or as a dollar amount below entry.">Stop</span> — how it's measured</label>
              <div className="miniseg">
                <button className={mode === "%" ? "on" : ""} onClick={() => { setMode("%"); setStopVal(""); }}>% below entry</button>
                <button className={mode === "$" ? "on" : ""} onClick={() => { setMode("$"); setStopVal(""); }}>$ below entry</button>
              </div>
            </div>
            <div className="field full"><label><span>{mode === "%" ? "Stop (% below entry)" : "Stop ($ below entry)"}</span></label><input className="in" value={stopVal} onChange={e => setStopVal(e.target.value)} placeholder={mode === "%" ? "6.11" : "8.70"} /><div className="hint">How far you'll let it drop before selling.</div></div>
          </div>
        </div>
        <div>
          <div className="panelhead">Your plan</div>
          {r ? (<>
            <div className="results">
              <div className="tile big-emph"><div className="label"><span className="term" data-tip="How many shares to buy so the position equals your chosen % of the account.">Shares to buy</span></div><div className="v gold">{f0(r.shares)}</div><div className="vsub">{money(r.posValue)} position</div></div>
              <div className="tile big-emph"><div className="label"><span className="term" data-tip="If your stop is hit, this is the loss as a percent of your whole account. Keep it at or under 2%.">Account risk</span></div><div className={"v " + (r.riskPctEquity > 2 ? "red" : r.riskPctEquity > 1.5 ? "gold" : "")}>{r.riskPctEquity.toFixed(2)}%</div><div className="vsub">= {money(r.totalRisk)} at risk</div></div>
              <div className="tile"><div className="label"><span className="term" data-tip="The price your stop sits at.">Stop price</span></div><div className="v">${f2(r.stopPrice)}</div><div className="vsub">sell-if-wrong level</div></div>
            </div>
            <div className="label" style={{ marginTop: 18 }}><span className="term" data-tip="R is your risk on the trade — one unit of what you'd lose if stopped. A 3R winner makes three times what you risked. Pros think in R, not dollars.">Profit targets in R (your unit of risk)</span></div>
            <div className="tbl-scroll">
            <table className="rtable">
              <thead><tr><th>Target</th><th>Price</th><th>% gain</th><th>$ profit</th></tr></thead>
              <tbody>
                {r.rTargets.map(t => (
                  <tr key={t.n}>
                    <td>{t.n === 1 ? "1R (your risk)" : t.n + "R"}</td>
                    <td>${f2(t.target)}</td>
                    <td className="green">+{t.pctGain.toFixed(2)}%</td>
                    <td className={t.n === 1 ? "red" : "green"}>{(t.n === 1 ? "−" : "+") + "$" + f0(Math.abs(t.dollarR))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="interp"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
              <div>Buy <b>{f0(r.shares)} shares</b> ({money(r.posValue)}). If your stop at <b>${f2(r.stopPrice)}</b> is hit you lose <b className="red">{money(r.totalRisk)}</b> — just <b>{r.riskPctEquity.toFixed(2)}%</b> of your account. A <b>3R</b> winner would make <b className="green">+${f0(r.riskPerShare * 3 * r.shares)}</b>.</div>
            </div>
            {r.stopPct > 10 && (
              <div className="alert warn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg><div>Your stop is <b>{r.stopPct.toFixed(1)}%</b> wide — over 10%. Consider a tighter entry or a closer stop.</div></div>
            )}
            {r.riskPctEquity > 2 && (
              <div className="alert warn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg><div>This risks <b>{r.riskPctEquity.toFixed(2)}%</b> of your account — above the 2% safety rule. Buy fewer shares or tighten the stop.</div></div>
            )}
            {r.stopPct <= 10 && r.riskPctEquity <= 2 && r.riskPctEquity > 0 && (
              <div className="alert ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg><div>Risk is within the safe zone (≤2% of account). Good to go.</div></div>
            )}
          </>) : (
            <div className="interp"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg><div>Fill in share price, position size, portfolio, and a valid stop to see your plan.</div></div>
          )}
        </div>
      </div>
    </div>
  </div>
);
}
function ExpectancyTab({ guideEnter, guideLeave, gactive, expert, demo }) {
  const [exampleMode, setExampleMode] = useState(demo);
  const [port,setPort]=useState(demo?DEMO_EXPECT.port:"");const[posSize,setPosSize]=useState(demo?DEMO_EXPECT.posSize:"");const[desRet,setDesRet]=useState(demo?DEMO_EXPECT.desRet:"");const[avgGain,setAvgGain]=useState(demo?DEMO_EXPECT.avgGain:"");const[avgLoss,setAvgLoss]=useState(demo?DEMO_EXPECT.avgLoss:"");const[winRate,setWinRate]=useState(demo?DEMO_EXPECT.winRate:"");
  useEffect(()=>{if(demo){setPort(DEMO_EXPECT.port);setPosSize(DEMO_EXPECT.posSize);setDesRet(DEMO_EXPECT.desRet);setAvgGain(DEMO_EXPECT.avgGain);setAvgLoss(DEMO_EXPECT.avgLoss);setWinRate(DEMO_EXPECT.winRate)}else{setPort("");setPosSize("");setDesRet("");setAvgGain("");setAvgLoss("");setWinRate("")}},[demo]);
  const r=useMemo(()=>{
    const ag=+avgGain,al=+avgLoss,wr=+winRate,ps=+posSize,dr=+desRet,pf=+port;
    if(!ag||!al||!wr||ag<=0||al<=0||wr<=0||wr>100||!pf||pf<=0||!ps||ps<=0)return null;
    const wrd=wr/100,lrd=1-wrd;
    const glRatio=ag/al;
    const ev=wrd*ag-lrd*al; // Expected net return per trade (%)
    const dollarPosSize=pf*(ps/100);
    const avgDollarGain=dollarPosSize*(ag/100);
    const avgDollarLoss=dollarPosSize*(al/100);
    const expectedDollarReturn=dollarPosSize*(ev/100);
    const dollarGoal=pf*(dr/100);
    // Trades to goal: how many trades at expectedDollarReturn per trade to reach dollarGoal
    let tradesToGoal=0,winningTrades=0,losingTrades=0;
    if(ev>0&&dr>0){
      tradesToGoal=Math.ceil(dollarGoal/expectedDollarReturn);
      winningTrades=Math.round(tradesToGoal*wrd);
      losingTrades=Math.round(tradesToGoal*lrd);
    } else if(ev<=0&&dr>0){
      // With negative EV, show how many trades until you LOSE your goal amount
      const absReturn=Math.abs(expectedDollarReturn);
      if(absReturn>0){
        const negTrades=Math.ceil(dollarGoal/absReturn);
        winningTrades=-Math.round(negTrades*wrd);
        losingTrades=-Math.round(negTrades*lrd);
      }
      tradesToGoal=0;
    }
    // Gain/Loss Ratio Adjusted: adjusted for win rate (edge-weighted)
    const glAdjusted=glRatio*wrd/lrd;
    // Breakeven win rate
    const beWinRate=(al/(ag+al))*100;
    // Optimal f (Kelly Criterion): f* = W - (1-W)/(G/L) = wrd - lrd/glRatio
    const kellyRaw=wrd-lrd/glRatio;
    const optimalF=Math.max(0,kellyRaw)*100;
    return{glRatio,ev,dollarPosSize,avgDollarGain,avgDollarLoss,expectedDollarReturn,dollarGoal,tradesToGoal,winningTrades,losingTrades,glAdjusted,beWinRate,optimalF};
  },[avgGain,avgLoss,winRate,posSize,desRet,port]);
  const fmtD=v=>`$${Math.abs(v).toLocaleString(undefined,{minimumFractionDigits:2})}`;
// ════════════════════════════════════════════════════════════════════════
// EXPECTANCY — new render block for ExpectancyTab
// Replaces its existing `return ( … );`. KEEPS the existing `r` memo + the fmtD
// helper + state (port, posSize, desRet, avgGain, avgLoss, winRate) verbatim.
// Markup matches the mockup's #panel-exp. Receives guide props.
//
// SIGNATURE CHANGE: function ExpectancyTab({ demo, guideEnter, guideLeave, gactive, expert })
// (fmtD already exists in this component — reused. No new helpers needed beyond
//  the local money() below for the per-trade $ line.)
// ════════════════════════════════════════════════════════════════════════

const money = (n) => (n < 0 ? "−$" : "$") + Math.abs(isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f0 = (n) => Math.round(isFinite(n) ? n : 0).toLocaleString("en-US");

// ─── RETURN ───
return (
  <div className={"toolpanel on" + (exampleMode ? " example" : "")} id="panel-exp" onInput={() => exampleMode && setExampleMode(false)}>
    <div className={"intro guide" + gactive("exp")} data-gtitle="Expectancy" onMouseEnter={guideEnter("exp", "Expectancy", "This answers the most important question: does your system make money over time? It combines your win rate with your average win and loss into an edge per trade, and estimates how many trades it takes to reach your goal.", "/audio/premium-expectancy.mp3")} onMouseLeave={guideLeave("exp")}>
      <div className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><rect x="7" y="10" width="3" height="7" /><rect x="14" y="6" width="3" height="11" /></svg></div>
      <div><h3>What is Expectancy?</h3><p>Does your strategy actually make money? This blends your <b>win rate</b> with your <b>average win and loss</b> to give your <b>edge per trade</b>. Above zero means you make money over time. It also shows how many trades it takes to hit your goal.</p></div>
    </div>
    <div className="card">
      <div className="io">
        <div>
          <div className="panelhead">Your numbers</div>
          <div className="iogrid">
            <div className="field"><label><span className="term" data-tip="Your total trading capital.">Portfolio $</span></label><input className="in" value={port} onChange={e => setPort(e.target.value)} placeholder="500000" /></div>
            <div className="field"><label><span className="term" data-tip="How much of the account goes into each trade, as a percent.">Position size %</span></label><input className="in" value={posSize} onChange={e => setPosSize(e.target.value)} placeholder="20" /></div>
            <div className="field"><label><span className="term" data-tip="The total percent gain you're aiming for on the account.">Desired return %</span></label><input className="in" value={desRet} onChange={e => setDesRet(e.target.value)} placeholder="15" /></div>
            <div className="field"><label><span className="term" data-tip="Your average percent gain on a winning trade.">Avg gain %</span></label><input className="in" value={avgGain} onChange={e => setAvgGain(e.target.value)} placeholder="12.5" /></div>
            <div className="field"><label><span className="term" data-tip="Your average percent loss on a losing trade (positive number).">Avg loss %</span></label><input className="in" value={avgLoss} onChange={e => setAvgLoss(e.target.value)} placeholder="5.8" /></div>
            <div className="field"><label><span className="term" data-tip="The percent of your trades that finish profitable.">Win rate %</span></label><input className="in" value={winRate} onChange={e => setWinRate(e.target.value)} placeholder="52" /></div>
          </div>
          {r && (
            <div style={{ marginTop: 16 }}>
              <span className={"badge " + (r.ev >= 0 ? "pos" : "neg")}><span className="d"></span>{r.ev >= 0 ? "Positive expectancy — this makes money over time" : "Negative expectancy — this loses money over time"}</span>
            </div>
          )}
        </div>
        <div>
          <div className="panelhead">Your edge</div>
          {r ? (<>
            <div className="results">
              <div className="tile big-emph"><div className="label"><span className="term" data-tip="Your average result per trade as a percent of the position — win rate × avg gain minus loss rate × avg loss. Above 0 = a real edge.">Edge per trade</span></div><div className={"v " + (r.ev >= 0 ? "green" : "red")}>{(r.ev >= 0 ? "+" : "−") + Math.abs(r.ev).toFixed(2) + "%"}</div><div className="vsub">{(r.expectedDollarReturn >= 0 ? "+" : "−") + money(Math.abs(r.expectedDollarReturn)) + " per trade"}</div></div>
              <div className="tile"><div className="label"><span className="term" data-tip="Average win ÷ average loss. 2 means winners are twice the size of losers. Aim for 2 or more.">Gain/Loss ratio</span></div><div className={"v " + (r.glRatio >= 2 ? "green" : r.glRatio >= 1 ? "gold" : "red")}>{r.glRatio.toFixed(2)}</div><div className="vsub">winners vs losers</div></div>
              <div className="tile"><div className="label"><span className="term" data-tip="Estimated number of trades to reach your desired return, at this edge.">Trades to goal</span></div><div className="v gold">{r.tradesToGoal > 0 ? f0(r.tradesToGoal) : "—"}</div><div className="vsub">{r.tradesToGoal > 0 ? f0(r.winningTrades) + " W / " + f0(r.losingTrades) + " L" : "need positive edge"}</div></div>
            </div>
            <div className="tbl-scroll">
            <table className="rtable">
              <tbody>
                <tr><td><span className="term" data-tip="The win rate that adjusts your gain/loss ratio for how often you win. Above 1 = profitable.">Adjusted G/L ratio</span></td><td className={r.glAdjusted >= 1 ? "gold" : "red"}>{r.glAdjusted.toFixed(2)}</td></tr>
                <tr><td><span className="term" data-tip="The lowest win rate you could have and still break even, given your average win and loss.">Breakeven win rate</span></td><td>{r.beWinRate.toFixed(1)}%</td></tr>
                <tr><td><span className="term" data-tip="The Kelly criterion — the mathematically 'optimal' fraction of capital to bet for fastest growth. Most traders use a fraction of this; treat it as a ceiling, not a target.">Optimal position size (Kelly)</span></td><td>{r.optimalF.toFixed(1)}%</td></tr>
                <tr><td><span className="term" data-tip="The dollar amount of one position at your size.">$ per position</span></td><td>{money(r.dollarPosSize)}</td></tr>
              </tbody>
            </table>
            </div>
            <div className="interp"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
              {r.ev >= 0
                ? <div>You make about <b className="green">{money(r.expectedDollarReturn)}</b> on an average trade. At this rate it takes roughly <b>{f0(r.tradesToGoal)} trades</b> to grow the account <b>{(+desRet || 0).toFixed(0)}%</b> ({money(r.dollarGoal)}). Your winners are <b>{r.glRatio.toFixed(1)}×</b> your losers.</div>
                : <div>This setup <b className="red">loses money</b> over time — the average trade returns {money(r.expectedDollarReturn)}. Raise your win rate above <b>{r.beWinRate.toFixed(0)}%</b>, or make winners bigger vs losers.</div>}
            </div>
            {r.glRatio < 1 && (
              <div className="alert warn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg><div>Your winners are smaller than your losers. Cut losses faster or let winners run longer.</div></div>
            )}
            {r.glRatio >= 1 && r.glRatio < 2 && (
              <div className="alert caution"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16h.01" /></svg><div>Gain/Loss is below 2:1. Aim for winners around 3× your losers for a sturdier edge.</div></div>
            )}
          </>) : (
            <div className="interp"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg><div>Fill in your portfolio, position size, average gain/loss, and win rate to see your edge.</div></div>
          )}
        </div>
      </div>
    </div>
  </div>
);
}
function RiskFinanceTab({ guideEnter, guideLeave, gactive, expert, demo }) {
  const [exampleMode, setExampleMode] = useState(demo);
  const[buyPrice,setBuyPrice]=useState(demo?DEMO_FINANCE.buyPrice:"");const[shares,setShares]=useState(demo?DEMO_FINANCE.shares:"");const[stopPrice,setStopPrice]=useState(demo?DEMO_FINANCE.stopPrice:"");const[stopPct,setStopPct]=useState(demo?DEMO_FINANCE.stopPct:"");const[curPrice,setCurPrice]=useState(demo?DEMO_FINANCE.curPrice:"");
  useEffect(()=>{if(demo){setBuyPrice(DEMO_FINANCE.buyPrice);setShares(DEMO_FINANCE.shares);setStopPrice(DEMO_FINANCE.stopPrice);setStopPct(DEMO_FINANCE.stopPct);setCurPrice(DEMO_FINANCE.curPrice)}else{setBuyPrice("");setShares("");setStopPrice("");setStopPct("");setCurPrice("")}},[demo]);
  const handleSP=v=>{setStopPrice(v);const bp=+buyPrice;if(bp&&+v)setStopPct(((bp-+v)/bp*100).toFixed(2))};
  const handleSPct=v=>{setStopPct(v);const bp=+buyPrice;if(bp&&+v)setStopPrice((bp*(1-+v/100)).toFixed(2))};
  const r=useMemo(()=>{
    const bp=+buyPrice,sh=+shares,st=+stopPrice,cp=+curPrice;
    if(!bp||!sh||!st||!cp||bp<=0||st<=0||st>=bp||cp<=0)return null;
    const initRiskPct=(bp-st)/bp*100;
    const plPct=(cp-bp)/bp*100;
    const rMult=initRiskPct>0?plPct/initRiskPct:0;
    const plDollar=(cp-bp)*sh;
    const riskPerShare=bp-st;
    const profitPerShare=cp-bp;
    const sugStop=rMult>=2?bp:st;
    let action=rMult<1?`Hold stop at $${st.toFixed(2)}`:rMult<2?"Approaching 2R. Monitor.":rMult<3?`Move stop to breakeven ($${bp.toFixed(2)})`:"Protect capital. Stop at breakeven minimum.";
    // Risk financing table: at each level, how many shares to sell so net P/L = (level × original risk)
    // SBE (breakeven): X × (CP-EP) = (N-X) × (EP-Stop) → X = N × (EP-Stop) / (CP-Stop)
    const canFinance = cp > st; // current price must be above stop for any financing to work
    const financeRows = [
      { label: "Breakeven", pct: 100 },
      { label: "75%", pct: 75 },
      { label: "50%", pct: 50 },
      { label: "25%", pct: 25 },
    ].map(row => {
      if (!canFinance || profitPerShare <= 0) return { ...row, sharesToSell: null, effStop: null };
      // For partial financing: sell X shares so that if stopped, net loss = (1 - row.pct/100) × totalRisk
      // X × profitPerShare - (N-X) × riskPerShare = -(1 - row.pct/100) × totalRisk
      // X × (profitPerShare + riskPerShare) = N × riskPerShare - (1 - row.pct/100) × N × riskPerShare
      // X × (CP - Stop) = N × riskPerShare × (row.pct/100)
      // X = N × riskPerShare × (row.pct/100) / (CP - Stop)
      const x = sh * riskPerShare * (row.pct / 100) / (cp - st);
      // Effective stop = worst-case loss as % of original position value
      // If stopped after selling x: net P/L = x × (cp-bp) + (sh-x) × (st-bp)
      const netPL = x * profitPerShare + (sh - x) * (st - bp);
      const effStopPct = (netPL / (bp * sh)) * 100; // as % of cost basis (negative = loss)
      return { ...row, sharesToSell: x, effStop: effStopPct }; // keep the sign — worst case can be + or −
    });
    const sbe = canFinance && profitPerShare > 0 ? sh * riskPerShare / (cp - st) : null;
    const sbePct = sbe !== null && sh > 0 ? (sbe / sh) * 100 : null;
    return{initRiskPct,plPct,rMult,plDollar,action,profitIfStopped:(sugStop-bp)*sh,sbe,sbePct,financeRows,canFinance,stopPctVal:initRiskPct};
  },[buyPrice,shares,stopPrice,curPrice]);
// ════════════════════════════════════════════════════════════════════════
// RISK FINANCE — new render block for RiskFinanceTab
// Replaces its existing `return ( … );`. KEEPS the existing `r` memo, the
// two-way stop handlers handleSP/handleSPct, and state (buyPrice, shares,
// stopPrice, stopPct, curPrice) verbatim. Markup matches mockup's #panel-fin.
//
// SIGNATURE CHANGE: function RiskFinanceTab({ demo, guideEnter, guideLeave, gactive, expert })
//
// NEW HELPERS (just above the return):
// ════════════════════════════════════════════════════════════════════════

const f2 = (n) => (isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f0 = (n) => Math.round(isFinite(n) ? n : 0).toLocaleString("en-US");
const money = (n) => (n < 0 ? "−$" : "$") + Math.abs(isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sgnPct = (n) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";

// breakeven shares-to-sell (SBE), mirrors the mockup interp line
const sbe = r && r.canFinance && r.plPct > 0 && r.financeRows[0] ? r.financeRows[0].sharesToSell : 0;

// ─── RETURN ───
return (
  <div className={"toolpanel on" + (exampleMode ? " example" : "")} id="panel-fin" onInput={() => exampleMode && setExampleMode(false)}>
    <div className={"intro guide" + gactive("fin")} data-gtitle="Risk Finance" onMouseEnter={guideEnter("fin", "Risk Finance", "Once a trade is in profit, this shows how many shares to sell to make the rest of the position risk-free — so a pullback can't turn a winner into a loser. Selling to break-even lets your remaining shares run on house money.", "/audio/premium-finance.mp3")} onMouseLeave={guideLeave("fin")}>
      <div className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg></div>
      <div><h3>What is Risk Finance?</h3><p>You're up on a trade — now protect it. This shows how many shares to <b>sell</b> so that even if the rest gets stopped out, you can't lose money. Selling to break-even means the shares you keep are riding on <b>house money</b>.</p></div>
    </div>
    <div className="card">
      <div className="io">
        <div>
          <div className="panelhead">Your open position</div>
          <div className="iogrid">
            <div className="field"><label><span className="term" data-tip="The price you bought at.">Buy price $</span></label><input className="in" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder="142.50" /></div>
            <div className="field"><label><span className="term" data-tip="How many shares you hold.">Shares held</span></label><input className="in" value={shares} onChange={e => setShares(e.target.value)} placeholder="575" /></div>
            <div className="field"><label><span className="term" data-tip="Where you'll sell if it turns against you. Linked to the percent field.">Stop price $</span></label><input className="in" value={stopPrice} onChange={e => handleSP(e.target.value)} placeholder="133.80" /></div>
            <div className="field"><label><span className="term" data-tip="Your stop as a percent below the buy price. Linked to the stop price field.">Stop %</span></label><input className="in" value={stopPct} onChange={e => handleSPct(e.target.value)} placeholder="6.11" /></div>
            <div className="field full"><label><span className="term" data-tip="The stock's price right now. Risk financing only works when this is above your buy price.">Current price $</span></label><input className="in" value={curPrice} onChange={e => setCurPrice(e.target.value)} placeholder="168.30" /></div>
          </div>
        </div>
        <div>
          <div className="panelhead">Where you stand</div>
          {r ? (<>
            <div className="results">
              <div className="tile"><div className="label">Stop</div><div className="v">{r.stopPctVal.toFixed(2)}%</div><div className="vsub">below entry</div></div>
              <div className="tile"><div className="label"><span className="term" data-tip="Your unrealized gain or loss right now, as a percent of entry.">Current P/L</span></div><div className={"v " + (r.plPct >= 0 ? "green" : "red")}>{sgnPct(r.plPct)}</div><div className="vsub">{(r.plDollar >= 0 ? "+" : "−") + money(Math.abs(r.plDollar))} unrealized</div></div>
              <div className="tile big-emph"><div className="label"><span className="term" data-tip="How many times your initial risk you're now up. 2R means you've made twice what you put at risk.">R-multiple</span></div><div className={"v " + (r.rMult >= 3 ? "green" : r.rMult >= 1 ? "gold" : r.rMult < 0 ? "red" : "")}>{r.rMult.toFixed(2)}R</div><div className="vsub">profit ÷ risk</div></div>
            </div>
            <div className="label" style={{ marginTop: 18 }}><span className="term" data-tip="Sell this many shares now and, even if the rest is stopped out, your net result is the 'effective stop' shown — at 100% you're fully break-even (risk-free).">Sell shares to lock in safety</span></div>
            <div className="tbl-scroll">
            <table className="rtable">
              <thead><tr><th>Protect</th><th>Shares to sell</th><th>Worst case now</th></tr></thead>
              <tbody>
                {r.financeRows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.pct === 100 ? "Fully (break-even)" : row.pct + "% of risk"}</td>
                    <td className="gold">{row.sharesToSell !== null ? f0(row.sharesToSell) + " sh" : "—"}</td>
                    <td className={row.effStop != null && row.effStop >= 0 ? "green" : ""}>{row.effStop !== null ? (row.effStop >= 0 ? "+" : "−") + Math.abs(row.effStop).toFixed(2) + "%" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {r.canFinance && r.plPct > 0 && (
              <div className="alert ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg><div><b>Suggested action:</b> {r.action}</div></div>
            )}
            <div className="interp"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
              {r.canFinance && r.plPct > 0
                ? <div>You're up <b className="green">{sgnPct(r.plPct)}</b> ({r.rMult.toFixed(1)}R). Sell about <b>{f0(sbe)} shares</b> now and the rest of the position becomes <b>risk-free</b> — even a full stop-out can't lose you money. The shares you keep ride on house money.</div>
                : <div>Risk financing needs the position to be in profit (current price above your buy price).</div>}
            </div>
            {!(r.canFinance && r.plPct > 0) && (
              <div className="alert warn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg><div>This position is at or below your entry — there's no profit to finance yet. Manage it with your stop.</div></div>
            )}
          </>) : (
            <div className="interp"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg><div>Fill in buy price, shares, a valid stop, and current price to see where you stand.</div></div>
          )}
        </div>
      </div>
    </div>
  </div>
);
}
// ─── Expected Move Calculator ───
function ExpectedMoveTab({ guideEnter, guideLeave, gactive, expert, demo }) {
  const DEMO = { sym: "CRWD", stockPrice: "34.11", callPrice: "2.30", putPrice: "2.20" };
  const [exampleMode, setExampleMode] = useState(demo);
  const [sym, setSym] = useState(demo ? DEMO.sym : "");
  const [stockPrice, setStockPrice] = useState(demo ? DEMO.stockPrice : "");
  const [callPrice, setCallPrice] = useState(demo ? DEMO.callPrice : "");
  const [putPrice, setPutPrice] = useState(demo ? DEMO.putPrice : "");
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (demo) { setSym(DEMO.sym); setStockPrice(DEMO.stockPrice); setCallPrice(DEMO.callPrice); setPutPrice(DEMO.putPrice); }
    else { setSym(""); setStockPrice(""); setCallPrice(""); setPutPrice(""); }
  }, [demo]);

  const r = useMemo(() => {
    const sp = +stockPrice, cp = +callPrice, pp = +putPrice;
    if (!sp || sp <= 0 || (!cp && !pp)) return null;
    const straddle = (cp || 0) + (pp || 0);
    if (straddle <= 0) return null;
    const expectedMovePct = (straddle / sp) * 100;
    const upperTarget = sp + straddle;
    const lowerTarget = sp - straddle;
    // Range as zone: ±expected move from current
    const upperPct = ((upperTarget - sp) / sp) * 100;
    const lowerPct = ((sp - lowerTarget) / sp) * 100;
    return { straddle, expectedMovePct, upperTarget, lowerTarget, upperPct, lowerPct };
  }, [stockPrice, callPrice, putPrice]);

// ════════════════════════════════════════════════════════════════════════
// EXPECTED MOVE — new render block for ExpectedMoveTab
// Replaces its existing `return ( … );`. KEEPS the existing `r` memo + state
// (sym, stockPrice, callPrice, putPrice). Markup matches mockup's #panel-move.
//
// SIGNATURE CHANGE: function ExpectedMoveTab({ demo, guideEnter, guideLeave, gactive, expert })
//
// ⚠️ ORPHANS: the mockup has NO how-to toggle, so the existing `showGuide` /
//   `setShowGuide` state in this component becomes unused after this swap.
//   DELETE that one useState line (`const [showGuide, setShowGuide] = useState(false);`)
//   when pasting — it's the only state the new render orphans. (Flagged in report.)
//
// NEW HELPER (just above the return):
// ════════════════════════════════════════════════════════════════════════

const f2 = (n) => (isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── RETURN ───
return (
  <div className={"toolpanel on" + (exampleMode ? " example" : "")} id="panel-move" onInput={() => exampleMode && setExampleMode(false)}>
    <div className={"intro guide" + gactive("move")} data-gtitle="Expected Move" onMouseEnter={guideEnter("move", "Expected Move", "Before an earnings report, the options market prices in how far the stock is expected to swing. Add the at-the-money call and put prices, and this shows that expected range, so you can decide whether to hold through, trim, or step aside.", "/audio/premium-move.mp3")} onMouseLeave={guideLeave("move")}>
      <div className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h4l3 8 4-16 3 8h4" /></svg></div>
      <div><h3>What is Expected Move?</h3><p>Before earnings, the options market is basically betting on how far a stock will jump. This reads that bet: add the <b>call</b> and <b>put</b> prices at the current price, and it shows the <b>expected swing</b> — so you can decide whether to hold through the report, trim, or step aside.</p></div>
    </div>
    <div className="card">
      <div className="io">
        <div>
          <div className="panelhead">From your broker's option chain</div>
          <div className="iogrid">
            <div className="field"><label>Symbol</label><input className="in" value={sym} onChange={e => setSym(e.target.value)} placeholder="CRWD" /><div className="hint">Just a label.</div></div>
            <div className="field"><label><span className="term" data-tip="The stock's current price.">Stock price $</span></label><input className="in" value={stockPrice} onChange={e => setStockPrice(e.target.value)} placeholder="34.11" /><div className="hint">Price now.</div></div>
            <div className="field"><label><span className="term" data-tip="Mid price of the call option at the strike closest to the current price (at-the-money), for the expiration just after earnings.">ATM call $</span></label><input className="in" value={callPrice} onChange={e => setCallPrice(e.target.value)} placeholder="2.30" /><div className="hint">At-the-money call (mid).</div></div>
            <div className="field"><label><span className="term" data-tip="Mid price of the put option at the strike closest to the current price (at-the-money), for the expiration just after earnings.">ATM put $</span></label><input className="in" value={putPrice} onChange={e => setPutPrice(e.target.value)} placeholder="2.20" /><div className="hint">At-the-money put (mid).</div></div>
          </div>
          <div className="alert caution" style={{ marginTop: 16 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16h.01" /></svg><div><b>Where to find these:</b> open the option chain in your broker, pick the expiration just after the earnings date, find the strike nearest the current price, and read the call &amp; put mid prices.</div></div>
        </div>
        <div>
          <div className="panelhead">The expected swing</div>
          {r ? (<>
            <div className="results">
              <div className="tile big-emph"><div className="label"><span className="term" data-tip="How far the market expects the stock to move, up OR down, by the expiration — as a percent of the price.">Expected move</span></div><div className="v gold">±{r.expectedMovePct.toFixed(2)}%</div><div className="vsub">±${f2(r.straddle)} per share</div></div>
              <div className="tile"><div className="label"><span className="term" data-tip="Call price + put price. This dollar amount is the expected move per share.">Straddle price</span></div><div className="v">${f2(r.straddle)}</div><div className="vsub">call + put</div></div>
            </div>
            <div className="rangebar">
              <div className="cap" style={{ left: "8%", color: "#fda4a4" }}>${f2(r.lowerTarget)}</div>
              <div className="mid"></div>
              <div className="cap" style={{ left: "92%", color: "#86efac" }}>${f2(r.upperTarget)}</div>
            </div>
            <div className="rangelabels">
              <span style={{ color: "#fda4a4" }}>${f2(r.lowerTarget)} (−{r.expectedMovePct.toFixed(1)}%)</span>
              <span style={{ color: "var(--muted)" }}>${f2(+stockPrice)} now</span>
              <span style={{ color: "#86efac" }}>${f2(r.upperTarget)} (+{r.expectedMovePct.toFixed(1)}%)</span>
            </div>
            <div className="interp"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
              <div>The market expects <b>{sym || "this stock"}</b> to swing about <b>±{r.expectedMovePct.toFixed(1)}%</b> — roughly between <b className="red">${f2(r.lowerTarget)}</b> and <b className="green">${f2(r.upperTarget)}</b> — by expiration. Only hold through earnings if your cushion is bigger than this move.</div>
            </div>
            <div className="label" style={{ marginTop: 20 }}><span className="term" data-tip="A simple rule of thumb for whether to hold a position through an earnings report, based on how your unrealized profit compares to the expected move.">Earnings decision — hold, trim, or exit?</span></div>
            <div className="framebox">
              <div className="framerow"><div className="frametag hold">HOLD</div><div>Your unrealized profit is <b>bigger than the expected move</b> and your stop is above entry (risk-free). You can afford the swing — hold through.</div></div>
              <div className="framerow"><div className="frametag trim">TRIM</div><div>Sell enough shares to make the position risk-free (see Risk Finance), then let the rest ride through earnings on house money.</div></div>
              <div className="framerow"><div className="frametag exit">EXIT</div><div>Your profit is <b>smaller than the expected move</b> and your stop is below entry. You'd be gambling on the report — step aside.</div></div>
            </div>
          </>) : (
            <div className="interp"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg><div>Enter a stock price and at least one option price to see the expected move.</div></div>
          )}
        </div>
      </div>
    </div>
  </div>
);
}

function LossRecoveryTable() {
  const data=[[5,5.26],[10,11.11],[15,17.65],[20,25],[25,33.33],[30,42.86],[40,66.67],[50,100],[60,150],[75,300]];
  return (<GlassCard style={{marginTop:20}}><div style={{padding:"24px 28px"}}>
    <Eyebrow>Loss Recovery</Eyebrow>
    <div style={{fontWeight:800,fontSize:"1.05rem",letterSpacing:"-0.03em",color:C.white,marginBottom:18}}>The deeper the hole, the harder the climb.</div>
    <div style={{display:"flex",borderBottom:`1px solid ${C.border}`,padding:"10px 0"}}>
      <div style={{flex:1,fontWeight:700,fontSize:"0.58rem",letterSpacing:"0.12em",textTransform:"uppercase",color:C.muted}}>Loss</div>
      <div style={{flex:1,fontWeight:700,fontSize:"0.58rem",letterSpacing:"0.12em",textTransform:"uppercase",color:C.muted,textAlign:"right"}}>Gain Needed</div>
    </div>
    {data.map(([loss,gain],i)=>(<div key={i} style={{display:"flex",padding:"11px 0",borderBottom:i<data.length-1?"1px solid rgba(255,255,255,0.03)":"none",background:i%2===0?"rgba(255,255,255,0.012)":"transparent"}}>
      <div style={{flex:1,fontWeight:600,fontSize:"0.84rem",color:C.text}}>{loss}%</div>
      <div style={{flex:1,fontWeight:800,fontSize:"0.88rem",textAlign:"right",color:gain>=100?C.red:gain>=40?C.gold:C.white}}>{gain}%</div>
    </div>))}
  </div></GlassCard>);
}
// ─── Return Simulator (Sitting Simulator) — winner-size distribution → compounded return ───
// Model (verified against reference simulations): each trade compounds equity ×= (1 + positionSize × tradeReturn)
function ReturnSimulatorTab({ guideEnter, guideLeave, gactive, expert, portfolioSize, currentCapital }) {
  const [exampleMode, setExampleMode] = useState(true);
  const baseStart = +portfolioSize || 0;
  const baseCurrent = (currentCapital != null && currentCapital > 0) ? currentCapital : baseStart;
  const [simStart, setSimStart] = useState("");
  const [simCurrent, setSimCurrent] = useState("");
  const [simPosSize, setSimPosSize] = useState("12");
  const [simLossMode, setSimLossMode] = useState("count"); // "count" | "rate"
  const [simLosers, setSimLosers] = useState("150");
  const [simWinRate, setSimWinRate] = useState("40");
  const [simAvgLoss, setSimAvgLoss] = useState("5");
  const [simTiers, setSimTiers] = useState([{ count: "80", gain: "5" }, { count: "10", gain: "50" }, { count: "10", gain: "100" }]);
  const [simScenarios, setSimScenarios] = useState([]);

  const sim = useMemo(() => {
    const startCap = (+simStart > 0) ? +simStart : baseStart;
    const base = (+simCurrent > 0) ? +simCurrent : (baseCurrent > 0 ? baseCurrent : startCap); // projection compounds from current capital
    const ps = (+simPosSize || 0) / 100;
    const avgLoss = (+simAvgLoss || 0) / 100;
    const tiers = simTiers
      .map(t => ({ count: Math.max(0, Math.floor(+t.count || 0)), gain: (+t.gain || 0) / 100 }))
      .filter(t => t.count > 0);
    const winners = tiers.reduce((s, t) => s + t.count, 0);
    let losers;
    if (simLossMode === "rate") {
      const r = (+simWinRate || 0) / 100; // win rate → derive losing-trade count from winner count
      losers = (r > 0 && r < 1 && winners > 0) ? Math.round(winners * (1 - r) / r) : 0;
    } else {
      losers = Math.max(0, Math.floor(+simLosers || 0));
    }
    const total = winners + losers;
    if (base <= 0 || ps <= 0 || total === 0) return null;
    const lossMult = 1 - ps * avgLoss;
    const tierStats = tiers.map(t => {
      const perTrade = 1 + ps * t.gain;
      const tierMult = Math.pow(perTrade, t.count);
      const logContrib = t.count * Math.log(perTrade > 0 ? perTrade : 1e-9);
      return { ...t, perTrade, tierMult, logContrib };
    });
    const lossDrag = Math.pow(Math.max(lossMult, 0), losers);
    const winMult = tierStats.reduce((m, t) => m * t.tierMult, 1);
    const endEq = base * lossDrag * winMult;
    const totalReturn = (endEq / base - 1) * 100;
    const winRate = (winners / total) * 100;
    const fromStartReturn = startCap > 0 ? (endEq / startCap - 1) * 100 : totalReturn;
    // Equity curve — interleave winners & losers proportionally for a representative compounding path
    const winArr = [];
    tierStats.forEach(t => { for (let i = 0; i < t.count; i++) winArr.push(t.gain); });
    const seq = [];
    let wi = 0, li = 0;
    for (let k = 0; k < total; k++) {
      const pullWin = li >= losers ? true : wi >= winArr.length ? false : ((wi + 1) / Math.max(1, winArr.length)) <= ((li + 1) / Math.max(1, losers));
      if (pullWin) seq.push(winArr[wi++]); else { seq.push(-avgLoss); li++; }
    }
    let eq = base;
    const curve = [{ trade: 0, equity: Math.round(base) }];
    const step = total > 600 ? Math.ceil(total / 600) : 1; // sample for very large counts
    seq.forEach((rr, idx) => {
      eq *= (1 + ps * rr);
      if ((idx + 1) % step === 0 || idx === seq.length - 1) curve.push({ trade: idx + 1, equity: Math.round(eq) });
    });
    return { startCap, base, ps, losers, avgLoss, winners, total, winRate, lossDrag, winMult, endEq, totalReturn, fromStartReturn, tierStats, curve };
  }, [simStart, simCurrent, simPosSize, simLossMode, simLosers, simWinRate, simAvgLoss, simTiers, baseStart, baseCurrent]);

  const winnersCount = simTiers.reduce((s, t) => s + Math.max(0, Math.floor(+t.count || 0)), 0);

// ════════════════════════════════════════════════════════════════════════
// RETURN SIMULATOR — new render block for ReturnSimulatorTab
// Replaces its existing `return ( … );`. KEEPS the existing `sim` memo + all
// state (simStart, simCurrent, simPosSize, simAvgLoss, simLossMode, simLosers,
// simWinRate, simTiers, simScenarios) verbatim. Only the markup changes to the
// mockup's #panel-sim. The equity curve is rendered as the mockup SVG from
// sim.curve. Receives guide props { guideEnter, guideLeave, gactive, expert }.
//
// SIGNATURE CHANGE: function ReturnSimulatorTab({ portfolioSize, currentCapital,
//   guideEnter, guideLeave, gactive, expert })
//
// NEW HELPERS (add just above the return, inside the component):
// ════════════════════════════════════════════════════════════════════════

// number formatters matching the mockup
const f0 = (n) => Math.round(isFinite(n) ? n : 0).toLocaleString("en-US");
const sgnPct = (n) => (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(2) + "%";
const money = (n) => (n < 0 ? "−$" : "$") + Math.abs(isFinite(n) ? n : 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Compounding can blow these numbers far past the tile width — abbreviate big magnitudes (K/M/B/T)
// so the headline tiles never overflow the card. Full value stays available via the tile's title.
const moneyCompact = (n) => {
  const a = Math.abs(isFinite(n) ? n : 0), s = n < 0 ? "−$" : "$";
  if (a >= 1e12) return s + (a / 1e12).toFixed(2) + "T";
  if (a >= 1e9) return s + (a / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + "M";
  if (a >= 1e5) return s + (a / 1e3).toFixed(0) + "K";
  return money(n);
};
const pctCompact = (n) => {
  const a = Math.abs(isFinite(n) ? n : 0), sign = n >= 0 ? "+" : "−";
  if (a >= 1e6) return sign + (a / 1e6).toFixed(2) + "M%";
  if (a >= 1e4) return sign + Math.round(a).toLocaleString("en-US") + "%";
  return sgnPct(n);
};

// equity-curve SVG path from sim.curve (600×180 viewBox, matching the mockup)
const eqPath = useMemo(() => {
  if (!sim || !sim.curve || sim.curve.length < 2) return null;
  const pts = sim.curve.map(c => c.equity);
  const lo = Math.min(...pts), hiRaw = Math.max(...pts);
  const hi = hiRaw === lo ? lo + 1 : hiRaw;
  const W = 600, H = 180, pad = 10, h = H - 2 * pad;
  const line = "M" + pts.map((v, i) => {
    const x = pts.length > 1 ? (i / (pts.length - 1)) * W : 0;
    const y = pad + (1 - (v - lo) / (hi - lo)) * h;
    return x.toFixed(1) + "," + y.toFixed(1);
  }).join(" L");
  return { line, area: line + " L600,180 L0,180 Z", lo, hi };
}, [sim]);

// biggest-contribution winner tier for the interpretation line
const bigTier = sim ? sim.tierStats.slice().sort((a, b) => b.logContrib - a.logContrib)[0] : null;

// ─── RETURN ───
return (
  <div className={"toolpanel on" + (exampleMode ? " example" : "")} id="panel-sim" onInput={() => exampleMode && setExampleMode(false)}>
    <div className={"intro guide" + gactive("sim")} data-gtitle="Return Simulator" onMouseEnter={guideEnter("sim", "Return Simulator", "This shows the power of compounding. Tell it your typical win rate, your average loss, and how big your winners are, and it projects what your account could grow to over many trades.", "/audio/premium-sim.mp3")} onMouseLeave={guideLeave("sim")}>
      <div className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M19 9l-5 5-4-4-3 3" /></svg></div>
      <div><h3>What is the Return Simulator?</h3><p>It plays your trading style forward over many trades to show how your account could <b>compound</b>. You set how often you win, how big the losers and winners are — and it projects your ending balance. Great for seeing why a few big winners matter so much.</p></div>
    </div>
    <div className="card">
      <div className="io">
        <div>
          <div className="panelhead">Your assumptions</div>
          <div className="iogrid">
            <div className="field"><label><span className="term" data-tip="The money you started the account with. Your total return is measured against this.">Starting capital</span></label><input className="in" value={simStart} onChange={e => setSimStart(e.target.value)} placeholder={baseStart ? Math.round(baseStart).toString() : "100000"} /><div className="hint">What you began with.</div></div>
            <div className="field"><label><span className="term" data-tip="The money you have now. Compounding starts from here.">Current capital</span></label><input className="in" value={simCurrent} onChange={e => setSimCurrent(e.target.value)} placeholder={baseCurrent ? Math.round(baseCurrent).toString() : "100000"} /><div className="hint">What you have today.</div></div>
            <div className="field"><label><span className="term" data-tip="How much of your account goes into each trade, as a percent. Bigger size compounds faster but loses faster too.">Position size %</span></label><input className="in" value={simPosSize} onChange={e => setSimPosSize(e.target.value)} placeholder="12" /><div className="hint">% of account per trade.</div></div>
            <div className="field"><label><span className="term" data-tip="The typical percent you lose on a losing trade (a positive number, e.g. 5 means −5%).">Avg loss %</span></label><input className="in" value={simAvgLoss} onChange={e => setSimAvgLoss(e.target.value)} placeholder="5" /><div className="hint">Typical losing trade.</div></div>
            <div className="field"><label><span className="term" data-tip="How you describe your losers: enter a raw count of losing trades, or a win rate % and we work out the losers for you.">Losers</span></label>
              <div className="miniseg">
                <button className={simLossMode === "count" ? "on" : ""} onClick={() => setSimLossMode("count")}>By count</button>
                <button className={simLossMode === "rate" ? "on" : ""} onClick={() => setSimLossMode("rate")}>By win rate</button>
              </div>
            </div>
            {simLossMode === "count"
              ? <div className="field"><label><span className="term" data-tip="Total number of losing trades over the run.">Losing trades</span></label><input className="in" value={simLosers} onChange={e => setSimLosers(e.target.value)} placeholder="150" /><div className="hint">How many losers.</div></div>
              : <div className="field"><label><span className="term" data-tip="The percent of your trades that win. We derive the number of losers from this and your winners.">Win rate %</span></label><input className="in" value={simWinRate} onChange={e => setSimWinRate(e.target.value)} placeholder="40" /><div className="hint">% of trades that win.</div></div>}
          </div>
          <div className="panelhead" style={{ marginTop: 18 }}>Your winners <span style={{ color: "var(--faint)", textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>— group them by size</span></div>
          <div className="tbl-scroll">
          <table className="rtable" style={{ marginTop: 6 }}>
            <thead><tr><th>Winner size %</th><th>How many</th></tr></thead>
            <tbody>
              {simTiers.map((row, i) => (
                <tr key={i}>
                  <td style={{ textAlign: "left" }}><input className="in" style={{ maxWidth: 120 }} value={row.gain} onChange={e => setSimTiers(t => t.map((r, idx) => idx === i ? { ...r, gain: e.target.value } : r))} /></td>
                  <td><input className="in" style={{ maxWidth: 120, marginLeft: "auto" }} value={row.count} onChange={e => setSimTiers(t => t.map((r, idx) => idx === i ? { ...r, count: e.target.value } : r))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>Most wins are small; a few are huge. That mix is what drives compounding.</div>
          <button className="btn" style={{ marginTop: 14 }} onClick={() => sim && setSimScenarios(s => [...s, { id: Date.now(), posSize: +simPosSize || 0, avgLoss: +simAvgLoss || 0, winRate: sim.winRate, totalReturn: sim.totalReturn, endEq: sim.endEq, total: sim.total }].slice(-3))}>＋ Save as scenario to compare</button>
        </div>
        <div>
          <div className="panelhead">What you'd end up with</div>
          {sim ? (<>
            <div className="results">
              <div className="tile big-emph"><div className="label"><span className="term" data-tip="Your percent gain from current capital to the projected ending balance, after all the wins and losses compound.">Total return</span></div><div className={"v " + (sim.totalReturn >= 0 ? "gold" : "red")} title={sgnPct(sim.totalReturn)} style={{ whiteSpace: "nowrap" }}>{pctCompact(sim.totalReturn)}</div><div className="vsub">from current capital</div></div>
              <div className="tile big-emph"><div className="label"><span className="term" data-tip="The projected size of your account after the full run of trades.">Ending balance</span></div><div className="v gold" title={money(sim.endEq)} style={{ whiteSpace: "nowrap" }}>{moneyCompact(sim.endEq)}</div><div className="vsub">{(sim.fromStartReturn >= 0 ? "+" : "−") + Math.abs(sim.fromStartReturn).toFixed(1) + "% from start"}</div></div>
              <div className="tile"><div className="label"><span className="term" data-tip="Share of trades that win, given your winners and losers.">Win rate</span></div><div className="v">{sim.winRate.toFixed(1)}%</div><div className="vsub">{f0(sim.winners) + " W / " + f0(sim.losers) + " L"}</div></div>
              <div className="tile"><div className="label"><span className="term" data-tip="How much your losing trades shrink the account before winners are applied. Closer to ×1.00 is better.">Loss drag</span></div><div className="v red">×{sim.lossDrag.toFixed(2)}</div><div className="vsub">from all losers</div></div>
            </div>
            <div className="eqbox">
              <div className="label" style={{ marginBottom: 10 }}>Projected equity curve</div>
              <div className="eqwrap">
                <div className="eqy">
                  {eqPath && [eqPath.hi, eqPath.lo + (eqPath.hi - eqPath.lo) * 0.5, eqPath.lo].map((v, i) => <span key={i}>${f0(v / 1000)}k</span>)}
                </div>
                <div className="eqplot"><svg viewBox="0 0 600 180" preserveAspectRatio="none" className="eqsvg">
                  <defs><linearGradient id="sgPrem" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(201,152,42,0.30)" /><stop offset="100%" stopColor="rgba(201,152,42,0)" /></linearGradient></defs>
                  <line x1="0" y1="45" x2="600" y2="45" className="grid" /><line x1="0" y1="90" x2="600" y2="90" className="grid" /><line x1="0" y1="135" x2="600" y2="135" className="grid" />
                  {eqPath && <path d={eqPath.area} fill="url(#sgPrem)" />}
                  {eqPath && <path d={eqPath.line} fill="none" stroke="var(--goldBright)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
                </svg></div>
              </div>
            </div>
            <div className="interp"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
              <div>Across <b>{f0(sim.total)} trades</b> at a <b>{sim.winRate.toFixed(0)}% win rate</b>, your {money(sim.base)} could become <b>{money(sim.endEq)}</b> — a <b className={sim.totalReturn >= 0 ? "green" : "red"}>{sgnPct(sim.totalReturn)}</b> change. {bigTier ? <>Most of the growth comes from the <b>+{(bigTier.gain * 100).toFixed(0)}%</b> winners.</> : null}</div>
            </div>
          </>) : (
            <div className="interp"><svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg><div>Add at least one winner tier to run the projection.</div></div>
          )}
          {simScenarios.length > 0 && (<>
            <div className="label" style={{ marginTop: 18, marginBottom: 4 }}>Saved scenarios</div>
            <div className="scencompare">
              {simScenarios.slice().reverse().map((s, i) => (
                <div className="scencard" key={s.id}>
                  <span style={{ position: "absolute", top: 8, right: 11, color: "var(--faint)", cursor: "pointer", fontSize: "0.8rem" }} onClick={() => setSimScenarios(prev => prev.filter(x => x.id !== s.id))}>✕</span>
                  <div className="n">Scenario {simScenarios.length - i}</div>
                  <div className="v gold" style={{ fontSize: "1.25rem", fontWeight: 800, margin: "4px 0" }}>{sgnPct(s.totalReturn)}</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{money(s.endEq)}</div>
                  <div style={{ fontSize: "0.7rem", color: "var(--faint)", marginTop: 4 }}>size {s.posSize}% · {s.winRate.toFixed(1)}% win</div>
                </div>
              ))}
            </div>
          </>)}
        </div>
      </div>
    </div>
  </div>
);
}

const PREM_CSS = `:root{--bg:#08080e; --bg2:#0c0c14; --white:#ffffff;
    --text:rgba(255,255,255,0.92); --muted:rgba(255,255,255,0.70); --faint:rgba(255,255,255,0.45);
    --gold:#c9982a; --goldBright:#f0c050; --goldMid:#b8820a; --goldDeep:#7a4f00;
    --goldDim:rgba(201,152,42,0.15); --borderGold:rgba(201,152,42,0.22);
    --glass:rgba(255,255,255,0.042); --border:rgba(255,255,255,0.09);
    --green:#22c55e; --red:#ef4444; --blue:#3b82f6;
    --font:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif;}
.vp *{box-sizing:border-box;margin:0;padding:0}
.vp{background:radial-gradient(1200px 700px at 70% -10%, rgba(201,152,42,0.06), transparent 60%), var(--bg);
    color:var(--text); font-family:var(--font); line-height:1.58; font-size:16px; -webkit-font-smoothing:antialiased; min-height:100vh}
.vp .shell{width:100%; max-width:1240px; margin:0 auto; padding:22px clamp(18px,2.4vw,40px) 90px}
@media(min-width:1500px){
.vp .shell{max-width:1400px} }
@media(min-width:2000px){
.vp .shell{max-width:1680px} }
.vp .tabnum,.vp .v,.vp .outval,.vp .rtable td,.vp .tile .v{font-variant-numeric:tabular-nums}
.vp .card{position:relative; background:var(--glass); border:1px solid var(--border); border-radius:22px;
    backdrop-filter:blur(28px) saturate(160%); -webkit-backdrop-filter:blur(28px) saturate(160%); padding:24px 26px; overflow:hidden}
.vp .card::before{content:''; position:absolute; inset:0; pointer-events:none; background:linear-gradient(135deg, rgba(255,255,255,0.05), transparent 55%)}
.vp .eyebrow{font-size:0.64rem; font-weight:700; letter-spacing:0.17em; text-transform:uppercase; color:var(--gold)}
.vp .h1{font-size:clamp(1.55rem,3vw,2.05rem); font-weight:800; letter-spacing:-0.04em; color:var(--white)}
.vp .goldname{color:var(--goldBright)}
.vp .sub{font-size:0.82rem; color:var(--muted); max-width:640px; margin-top:6px}
.vp .reveal .h1{opacity:0; transform:translateY(14px)}
.vp .reveal .sub{opacity:0}
.vp .reveal.in-view .h1{animation:hRise 0.42s cubic-bezier(0.22,1,0.36,1) both}
.vp .reveal.in-view .sub{animation:hFade 0.48s ease-out 0.2s both}
@keyframes hRise{from{opacity:0; transform:translateY(14px)}to{opacity:1; transform:translateY(0)}}
@keyframes hFade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion: reduce){
.vp .reveal .h1,.vp .reveal .sub{animation:none !important; opacity:1; transform:none}
  }
.vp .label{font-size:0.62rem; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:var(--muted)}
.vp .sech{font-size:0.95rem; font-weight:800; letter-spacing:-0.02em; color:var(--white)}
.vp .row{display:flex; align-items:center; gap:14px; flex-wrap:wrap}
.vp .spacer{flex:1}
.vp .navbar{display:flex; align-items:center; gap:16px; margin-bottom:26px; flex-wrap:wrap}
.vp .brand{display:flex; align-items:center; gap:9px; font-weight:800; color:var(--white); font-size:0.95rem}
.vp .brand .vmark{width:24px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,var(--goldMid),var(--goldBright)); color:#0a0a0a; font-weight:800; font-size:0.8rem}
.vp .tabs{display:inline-flex; gap:4px; background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:980px; padding:4px}
.vp .tabs a{text-decoration:none; color:var(--muted); font-size:0.78rem; font-weight:700; padding:7px 18px; border-radius:980px}
.vp .tabs a.on{background:var(--goldDim); color:var(--goldBright)}
.vp .tabs a:hover:not(.on){color:var(--text)}
.vp .term{border-bottom:1px dotted var(--borderGold); cursor:help; position:relative}
.vp .term:hover::after{content:attr(data-tip); position:absolute; left:0; top:150%; width:250px; background:#11111b;
    border:1px solid var(--borderGold); border-radius:12px; padding:10px 12px; font-size:0.72rem; font-weight:400;
    letter-spacing:0; text-transform:none; color:var(--text); z-index:60; box-shadow:0 14px 40px rgba(0,0,0,0.55); line-height:1.45; white-space:pre-line}
.vp .term.tipright:hover::after{left:auto; right:0}
.vp .seg{display:inline-flex; border:1px solid var(--border); border-radius:980px; padding:3px; gap:2px; background:rgba(255,255,255,0.02)}
.vp .seg button{border:none; background:transparent; color:var(--muted); cursor:pointer; font-family:var(--font); font-size:0.74rem;
    font-weight:700; padding:7px 16px; border-radius:980px; transition:all .15s}
.vp .seg button.on{background:var(--goldDim); color:var(--goldBright)}
.vp .btn{border:1px solid var(--border); background:rgba(255,255,255,0.03); color:var(--text); font-family:var(--font);
    font-size:0.74rem; font-weight:700; padding:8px 16px; border-radius:980px; cursor:pointer}
.vp .btn.gold{background:linear-gradient(120deg,var(--goldMid),var(--goldBright),var(--goldDeep)); color:#0a0a0a; border:none; box-shadow:0 6px 18px rgba(201,152,42,0.25)}
.vp .welcome{display:flex; gap:14px; align-items:flex-start; margin-top:20px; background:var(--goldDim);
    border:1px solid var(--borderGold); border-radius:16px; padding:15px 18px}
.vp .welcome .wd{width:8px;height:8px;border-radius:50%;background:var(--goldBright);box-shadow:0 0 12px var(--goldBright);margin-top:6px;flex:none}
.vp .welcome b{color:var(--white)}
.vp .welcome .x{margin-left:auto; color:var(--faint); cursor:pointer; font-size:1.1rem; line-height:1}
.vp.expert .welcome{display:none}
.vp .tourwrap{margin-top:20px}
.vp.expert .tourwrap{display:none}
.vp .tour{position:relative; border:1px solid var(--borderGold); border-radius:20px; overflow:hidden; background:#0a0a12; aspect-ratio:16/6.5; min-height:230px}
.vp .tourbg{position:absolute; inset:0; background:radial-gradient(680px 320px at 50% -10%, rgba(201,152,42,0.14), transparent 70%)}
.vp .tourstage{position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:34px 40px 56px; gap:12px}
.vp .tourchip{font-size:0.6rem; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; color:var(--gold)}
.vp .tourtitle{font-size:clamp(1.3rem,3.2vw,1.9rem); font-weight:800; letter-spacing:-0.03em; color:var(--white)}
.vp .tourcap{font-size:0.9rem; color:var(--muted); max-width:560px; line-height:1.55}
.vp .tourdots{display:flex; gap:7px; margin-top:6px}
.vp .tourdots i{width:8px; height:8px; border-radius:50%; background:rgba(255,255,255,0.18); transition:all .25s}
.vp .tourdots i.on{background:var(--goldBright); width:22px; border-radius:5px}
.vp .tourposter{position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px;
    background:rgba(8,8,14,0.55); backdrop-filter:blur(2px); cursor:pointer; z-index:3}
.vp .tourposter.hidden{display:none}
.vp .playbig{width:74px; height:74px; border-radius:50%; background:linear-gradient(135deg,var(--goldBright),var(--goldMid));
    display:flex; align-items:center; justify-content:center; box-shadow:0 12px 40px rgba(201,152,42,0.4); transition:transform .15s}
.vp .tourposter:hover .playbig{transform:scale(1.07)}
.vp .playbig svg{width:30px; height:30px; color:#0a0a0a; margin-left:4px}
.vp .postertitle{font-size:1.05rem; font-weight:800; color:var(--white)}
.vp .postersub{font-size:0.78rem; color:var(--muted)}
.vp .tourbar{position:absolute; left:0; right:0; bottom:0; display:flex; align-items:center; gap:12px; padding:12px 16px;
    background:linear-gradient(0deg, rgba(8,8,14,0.92), transparent); z-index:4}
.vp .tourbtn{background:rgba(255,255,255,0.1); border:none; width:34px; height:34px; border-radius:50%; cursor:pointer;
    display:flex; align-items:center; justify-content:center; color:var(--white); flex:none}
.vp .tourbtn:hover{background:rgba(255,255,255,0.18)}
.vp .tourbtn svg{width:15px; height:15px}
.vp .tourprog{flex:1; height:5px; background:rgba(255,255,255,0.14); border-radius:980px; overflow:hidden; cursor:default}
.vp .tourprog .fill{height:100%; width:0%; background:linear-gradient(90deg,var(--goldMid),var(--goldBright)); transition:width .2s linear}
.vp .tourtime{font-size:0.68rem; color:var(--muted); font-variant-numeric:tabular-nums; flex:none; min-width:34px; text-align:right}
.vp .tooltabs{display:flex; gap:4px; flex-wrap:wrap; margin:26px 0 20px; border-bottom:1px solid var(--border)}
.vp .tooltab{background:transparent; border:none; border-bottom:2px solid transparent; color:var(--muted); font-family:var(--font);
    font-size:0.85rem; font-weight:700; padding:11px 15px; cursor:pointer; margin-bottom:-1px; white-space:nowrap}
.vp .tooltab.on{color:var(--goldBright); border-bottom-color:var(--goldBright)}
.vp .tooltab:hover:not(.on){color:var(--text)}
.vp .toolpanel{display:none}
.vp .toolpanel.on{display:block}
.vp .intro{display:flex; gap:13px; align-items:flex-start; margin-bottom:18px; background:rgba(255,255,255,0.025);
    border:1px solid var(--border); border-radius:16px; padding:15px 18px}
.vp .intro .ico{flex:none; width:38px; height:38px; border-radius:11px; background:var(--goldDim); border:1px solid var(--borderGold);
    display:flex; align-items:center; justify-content:center; color:var(--goldBright)}
.vp .intro .ico svg{width:19px; height:19px}
.vp .intro h3{font-size:0.98rem; font-weight:800; color:var(--white); letter-spacing:-0.02em; margin-bottom:3px}
.vp .intro p{font-size:0.82rem; color:var(--muted); line-height:1.55}
.vp:not(.expert) .guide{transition:box-shadow .2s; border-radius:16px}
.vp:not(.expert) .guide.guide-active{box-shadow:0 0 0 1px var(--borderGold), 0 0 50px rgba(201,152,42,0.13)}
.vp .io{display:grid; grid-template-columns:0.92fr 1.08fr; gap:20px; align-items:start}
.vp .panelhead{font-size:0.6rem; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--gold); margin-bottom:14px}
.vp .iogrid{display:grid; grid-template-columns:1fr 1fr; gap:14px}
.vp .field{display:flex; flex-direction:column; gap:6px}
.vp .field.full{grid-column:1/-1}
.vp .field label{font-size:0.64rem; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; color:var(--muted)}
.vp .in{background:rgba(255,255,255,0.05); border:1px solid var(--border); border-radius:10px; color:var(--text);
    font-family:var(--font); font-size:0.95rem; font-weight:600; padding:10px 12px; outline:none; width:100%; font-variant-numeric:tabular-nums}
.vp .in:focus{border-color:var(--gold)}
/* Example mode — pre-filled demo numbers render greyed (like a placeholder) so the diagram shows
   beside them; the moment the user types anywhere in the panel they switch back to normal text. */
.vp .toolpanel.example .in{color:var(--faint)}
.vp .field .hint{font-size:0.7rem; color:var(--faint); line-height:1.4}
.vp.expert .field .hint{display:none}
.vp .miniseg{display:inline-flex; border:1px solid var(--border); border-radius:9px; overflow:hidden}
.vp .miniseg button{border:none; background:transparent; color:var(--muted); font-family:var(--font); font-size:0.78rem; font-weight:700; padding:9px 14px; cursor:pointer}
.vp .miniseg button.on{background:var(--goldDim); color:var(--goldBright)}
.vp .results{display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px}
.vp .tile{background:var(--glass); border:1px solid var(--border); border-radius:14px; padding:14px 16px}
.vp .tile .label{margin-bottom:8px}
.vp .tile .v{font-size:1.5rem; font-weight:800; letter-spacing:-0.03em}
.vp .tile .v.green{color:var(--green)}
.vp .tile .v.red{color:var(--red)}
.vp .tile .v.gold{color:var(--goldBright)}
.vp .tile .vsub{font-size:0.68rem; color:var(--faint); margin-top:4px}
.vp .big-emph{border-color:var(--borderGold); background:linear-gradient(140deg, rgba(201,152,42,0.10), transparent 75%)}
.vp .interp{display:flex; gap:11px; align-items:flex-start; margin-top:16px; background:var(--goldDim); border:1px solid var(--borderGold);
    border-radius:14px; padding:13px 16px; font-size:0.82rem; color:var(--text); line-height:1.55}
.vp .interp b{color:var(--goldBright)}
.vp .interp .green{color:#86efac}
.vp .interp .red{color:#fda4a4}
.vp .interp .ic{flex:none; width:17px;height:17px; color:var(--goldBright); margin-top:2px}
.vp.expert .interp{display:none}
.vp .alert{display:flex; gap:9px; align-items:flex-start; margin-top:14px; border-radius:12px; padding:11px 14px; font-size:0.78rem; line-height:1.45}
.vp .alert svg{width:15px;height:15px;flex:none;margin-top:1px}
.vp .alert.warn{background:rgba(239,68,68,0.10); border:1px solid rgba(239,68,68,0.3); color:#fda4a4}
.vp .alert.caution{background:rgba(201,152,42,0.12); border:1px solid var(--borderGold); color:var(--goldBright)}
.vp .alert.ok{background:rgba(34,197,94,0.10); border:1px solid rgba(34,197,94,0.3); color:#86efac}
.vp .tbl-scroll{overflow-x:auto}
.vp .rtable{width:100%; border-collapse:collapse; margin-top:16px}
.vp .rtable th{font-size:0.58rem; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--muted); text-align:right; padding:8px 9px; border-bottom:1px solid var(--border)}
.vp .rtable th:first-child,.vp .rtable td:first-child{text-align:left}
.vp .rtable td{font-size:0.81rem; padding:9px 9px; border-bottom:1px solid rgba(255,255,255,0.05); text-align:right; font-variant-numeric:tabular-nums}
.vp .rtable td.green{color:#86efac}
.vp .rtable td.red{color:#fda4a4}
.vp .rtable td.gold{color:var(--goldBright)}
.vp .rtable .rhead td{color:var(--gold); font-weight:700; font-size:0.6rem; text-transform:uppercase; letter-spacing:0.06em}
.vp .badge{display:inline-flex; align-items:center; gap:7px; font-size:0.7rem; font-weight:700; padding:6px 13px; border-radius:980px}
.vp .badge .d{width:7px;height:7px;border-radius:50%}
.vp .badge.pos{background:rgba(34,197,94,0.12); color:#86efac; border:1px solid rgba(34,197,94,0.3)}
.vp .badge.pos .d{background:var(--green)}
.vp .badge.neg{background:rgba(239,68,68,0.12); color:#fda4a4; border:1px solid rgba(239,68,68,0.3)}
.vp .badge.neg .d{background:var(--red)}
.vp .eqbox{margin-top:18px}
.vp .eqwrap{display:flex; gap:12px}
.vp .eqy{display:flex; flex-direction:column; justify-content:space-between; font-size:0.62rem; color:var(--faint); min-width:46px; text-align:right; padding:2px 0; font-variant-numeric:tabular-nums}
.vp .eqplot{flex:1; position:relative; height:180px}
.vp .eqsvg{width:100%; height:100%; display:block}
.vp .eqsvg .grid{stroke:rgba(255,255,255,0.06); stroke-width:1}
.vp .rangebar{position:relative; height:46px; margin:26px 0 8px; border-radius:980px;
    background:linear-gradient(90deg, rgba(239,68,68,0.5), rgba(201,152,42,0.5) 50%, rgba(34,197,94,0.5)); border:1px solid var(--border)}
.vp .rangebar .mid{position:absolute; left:50%; top:-7px; bottom:-7px; width:2px; background:var(--goldBright); transform:translateX(-50%)}
.vp .rangebar .cap{position:absolute; top:-22px; font-size:0.66rem; font-weight:700; transform:translateX(-50%); white-space:nowrap}
.vp .rangelabels{display:flex; justify-content:space-between; font-size:0.72rem; margin-top:6px}
.vp .framebox{margin-top:18px; border:1px solid var(--border); border-radius:14px; overflow:hidden}
.vp .framerow{display:grid; grid-template-columns:88px 1fr; gap:0; border-bottom:1px solid var(--border); font-size:0.8rem}
.vp .framerow:last-child{border-bottom:none}
.vp .frametag{padding:13px 14px; font-weight:800; display:flex; align-items:center; justify-content:center; font-size:0.78rem; letter-spacing:0.04em}
.vp .frametag.hold{background:rgba(34,197,94,0.12); color:#86efac}
.vp .frametag.trim{background:var(--goldDim); color:var(--goldBright)}
.vp .frametag.exit{background:rgba(239,68,68,0.12); color:#fda4a4}
.vp .framerow div:last-child{padding:13px 16px; color:var(--muted); line-height:1.5}
.vp.expert .framebox,.vp.expert .lossrec{display:none}
.vp .lossrec{margin-top:16px}
.vp .scencompare{display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-top:16px}
.vp .scencard{border:1px solid var(--borderGold); border-radius:14px; padding:13px 15px; background:rgba(201,152,42,0.05)}
.vp .scencard .n{font-size:0.6rem; font-weight:800; text-transform:uppercase; letter-spacing:0.1em; color:var(--gold)}
.vp .guidepanel{position:fixed; right:24px; bottom:24px; width:330px; max-width:calc(100vw - 40px); z-index:200;
    background:#11111b; border:1px solid var(--borderGold); border-radius:16px; padding:15px 17px; box-shadow:0 22px 60px rgba(0,0,0,0.6); display:none}
.vp:not(.expert) .guidepanel{display:block}
.vp .guidepanel.speaking{border-color:var(--goldBright); box-shadow:0 0 0 1px var(--goldBright), 0 22px 60px rgba(0,0,0,0.6)}
.vp .gp-head{display:flex; align-items:center; gap:9px; margin-bottom:7px}
.vp .gp-dot{width:8px; height:8px; border-radius:50%; background:var(--goldBright); flex:none}
.vp .guidepanel.speaking .gp-dot{animation:gppulse 1s ease-in-out infinite}
@keyframes gppulse{0%,100%{opacity:1; transform:scale(1)}50%{opacity:0.35; transform:scale(1.6)}}
.vp .gp-title{font-size:0.82rem; font-weight:800; color:var(--goldBright); flex:1}
.vp .gp-mute{background:transparent; border:none; cursor:pointer; color:var(--muted); padding:3px; line-height:0; display:flex}
.vp .gp-mute:hover{color:var(--text)}
.vp .gp-mute svg{width:18px; height:18px}
.vp .gp-body{font-size:0.78rem; color:var(--text); line-height:1.55}
.vp .gp-body b{color:var(--goldBright)}
.vp.expert .term{border-bottom:none; cursor:default}
.vp.expert .term:hover::after{content:none}
@media(max-width:820px){
.vp .io{grid-template-columns:1fr}
.vp .iogrid{grid-template-columns:1fr 1fr}
.vp .navbar{flex-wrap:wrap} }
@media(max-width:520px){
.vp .iogrid{grid-template-columns:1fr} }
@media(max-width:600px){
.vp .navbar{flex-wrap:wrap; gap:10px}
.vp .navbar .spacer{display:none}
.vp .tabs{overflow-x:auto; max-width:100%; scrollbar-width:none}
.vp .tabs::-webkit-scrollbar{display:none}
.vp .tabs a{white-space:nowrap}
.vp .tour{aspect-ratio:auto; height:300px; min-height:0}
.vp .tourstage{padding:20px 16px 54px}
.vp .tourtitle{font-size:1.1rem}
.vp .tourcap{font-size:0.8rem}
.vp .tooltabs{flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none}
.vp .tooltabs::-webkit-scrollbar{display:none}
.vp .tooltab{white-space:nowrap; padding:11px 12px}
.vp .results{grid-template-columns:1fr 1fr}
.vp .card{padding:18px 16px}
.vp .intro{flex-direction:column}
.vp .rtable th,.vp .rtable td{padding:8px 5px; font-size:0.74rem}
  }`;

// ─── Count-up ("accelerometer" roll) — ports the mockup countUp; rolls a number's
// text from 0 to its value once, on mount. Live updates after mount show instantly.
function rollNumber(el, dur) {
  if (!el || el.__rolling) return;
  const t = String(el.textContent).trim();
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const sign = /^[−-]/.test(t) ? -1 : 1;
  const dollar = t.indexOf("$") >= 0;
  const pct = /%\s*$/.test(t);
  const explicitSign = /^[−+-]/.test(t);
  const numStr = t.replace(/[^\d.]/g, "");
  if (!numStr) return;
  const dot = numStr.indexOf(".");
  const dec = dot >= 0 ? numStr.length - dot - 1 : 0;
  const val = (parseFloat(numStr) || 0) * sign;
  const finalText = t;
  el.__rolling = true;
  dur = dur || 1100;
  let start = null;
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  const fmt = (v) => (sign < 0 ? "−" : explicitSign ? "+" : "") + (dollar ? "$" : "") +
    Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (pct ? "%" : "");
  function frame(now) {
    if (start === null) start = now;
    const k = Math.min(1, (now - start) / dur);
    el.textContent = fmt(val * ease(k));
    if (k < 1) requestAnimationFrame(frame);
    else { el.textContent = finalText; el.__rolling = false; }
  }
  el.textContent = fmt(0);
  requestAnimationFrame(frame);
}
function Cu({ children, dur }) {
  const ref = useRef(null);
  useEffect(() => { rollNumber(ref.current, dur); /* once on mount */ }, []);
  return <span ref={ref}>{children}</span>;
}

// ─── Premium tutorial "video" — narrated 6-chapter tour (ports the mockup #tour player).
// Poster → click/play runs chapters with audio (public/audio/premium-tour-*.mp3); progress
// bar + dots + auto-advance. Hidden in Pro via CSS (.vp.expert .tourwrap).
const PREMIUM_TOUR = [
  { chip: "Guided tour · 1 of 6", t: "Welcome to Premium Tools", c: "Five calculators that answer the big money questions before you trade. Each one explains itself — let's take a quick tour.", a: "/audio/premium-tour-0.mp3" },
  { chip: "Tool 1 · Return Simulator", t: "Return Simulator", c: "See what your account could grow to from your win rate, average loss, and winner sizes. Compounding, made visual.", a: "/audio/premium-tour-1.mp3" },
  { chip: "Tool 2 · Position Risk", t: "Position Risk", c: "Get the exact number of shares to buy so a stop-out only costs a small, planned amount of your account.", a: "/audio/premium-tour-2.mp3" },
  { chip: "Tool 3 · Expectancy", t: "Expectancy", c: "Find out whether your system actually makes money — your edge per trade, and the trades needed to hit your goal.", a: "/audio/premium-tour-3.mp3" },
  { chip: "Tool 4 · Risk Finance", t: "Risk Finance", c: "Once a trade is up, see how many shares to sell to make it risk-free and let the rest run on house money.", a: "/audio/premium-tour-4.mp3" },
  { chip: "Tool 5 · Expected Move", t: "Expected Move", c: "Before earnings, estimate how far a stock could swing so you can decide to hold, trim, or step aside.", a: "/audio/premium-tour-5.mp3" },
];
function PremiumTour({ onPlayStateChange }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [fill, setFill] = useState(0);
  const audioRef = useRef(null);
  const fbRef = useRef(null);
  const iRef = useRef(0);
  const N = PREMIUM_TOUR.length;
  // The tutorial video owns the audio while it plays — signal the parent so it can mute the
  // hover guide voiceover (matches the mockup's stopGuide()/__tourPlaying() coordination).
  useEffect(() => { if (onPlayStateChange) onPlayStateChange(playing); }, [playing]);
  const clearFb = () => { if (fbRef.current) { clearTimeout(fbRef.current); fbRef.current = null; } };
  const playChapter = (idx) => {
    iRef.current = idx; setI(idx); setStarted(true); setPlaying(true);
    const a = audioRef.current; if (!a) return;
    try { a.pause(); a.src = PREMIUM_TOUR[idx].a; a.currentTime = 0; a.play().catch(() => {}); } catch {}
    clearFb(); fbRef.current = setTimeout(() => { advance(); }, 14000);
  };
  const advance = () => {
    clearFb();
    const cur = iRef.current;
    if (cur < N - 1) playChapter(cur + 1);
    else { setPlaying(false); setFill(100); try { audioRef.current && audioRef.current.pause(); } catch {} }
  };
  const pause = () => { setPlaying(false); clearFb(); try { audioRef.current && audioRef.current.pause(); } catch {} };
  const resumeOrStart = () => {
    if (!started) { setFill(0); playChapter(0); return; }
    const a = audioRef.current;
    if (a && a.src) { setPlaying(true); a.play().catch(() => {}); clearFb(); fbRef.current = setTimeout(() => advance(), 14000); }
    else playChapter(iRef.current);
  };
  useEffect(() => () => clearFb(), []);
  return (
    <div className="tourwrap">
      <audio ref={audioRef} preload="auto" onEnded={advance}
        onTimeUpdate={(e) => { const d = e.target.duration || 0; const fr = d ? e.target.currentTime / d : 0; setFill(Math.min(100, (iRef.current + fr) / N * 100)); }} />
      <div className="tour">
        <div className="tourbg"></div>
        <div className="tourstage">
          <div className="tourchip">{PREMIUM_TOUR[i].chip}</div>
          <div className="tourtitle">{PREMIUM_TOUR[i].t}</div>
          <div className="tourcap">{PREMIUM_TOUR[i].c}</div>
          <div className="tourdots">{PREMIUM_TOUR.map((_, k) => <i key={k} className={k === i ? "on" : ""} />)}</div>
        </div>
        <div className={"tourposter" + (started ? " hidden" : "")} onClick={() => { setFill(0); playChapter(0); }}>
          <div className="playbig"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></div>
          <div className="postertitle">Watch the 1-minute tour</div>
          <div className="postersub">What this page is, and what each tool does</div>
        </div>
        <div className="tourbar">
          <button className="tourbtn" aria-label="Play / pause" onClick={() => playing ? pause() : resumeOrStart()}>
            {playing
              ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>}
          </button>
          <div className="tourprog"><div className="fill" style={{ width: fill + "%" }} /></div>
          <div className="tourtime">{i + 1} / {N}</div>
          <button className="tourbtn" aria-label="Replay" title="Replay" onClick={() => { setFill(0); playChapter(0); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
function PremiumToolsPage({ setPage, onLogout, session, demo, portfolioSize, journaledTrades, displayName }) {
  const[tab,setTab]=useState(0);const tabs=["Return Simulator","Risk","Expectancy","Risk Finance","Expected Move"];
  const realizedPL = useMemo(() => (journaledTrades || []).reduce((s, t) => s + (t.plDollar || 0), 0), [journaledTrades]);
  const currentCapital = (+portfolioSize || 0) + realizedPL;
// ════════════════════════════════════════════════════════════════════════
// PREMIUM TOOLS — page wrapper render block (replaces PremiumToolsPage's return)
// Mirrors the Dashboard MOCKUP-UI RENDER: scoped CSS (PREM_CSS) injected under
// `.vp`, the mockup's exact navbar / mode-seg / header / welcome / tool-tab bar,
// + the floating guide assistant. The sub-tab components render plain `.toolpanel`
// markup (no own wrapper/style).
//
// PLACEMENT: paste the helper block + PREM_CSS module const ABOVE the function,
// and put everything inside `return ( … );` as the new PremiumToolsPage return.
// The existing tab state (`tab`/`setTab`), `realizedPL`, `currentCapital`,
// `tabs`, `demo`, `portfolioSize`, `journaledTrades`, `setPage`, `onLogout`
// props are reused unchanged.
// ════════════════════════════════════════════════════════════════════════

// ─── NEW HELPERS (add inside PremiumToolsPage, before the return) ───
// Guided/Pro + guide-assistant + scroll-reveal — identical pattern to DashboardPage.
const [uiMode, setUiMode] = useState(() => { try { return localStorage.getItem("viv-mode") === "pro" ? "pro" : "guided"; } catch { return "guided"; } });
useEffect(() => { try { localStorage.setItem("viv-mode", uiMode); } catch {} }, [uiMode]);
const expert = uiMode === "pro";
const [welcomeDismissed, setWelcomeDismissed] = useState(() => { try { return localStorage.getItem("viv-welcome-prem-x") === "1"; } catch { return false; } });
const [activeGuide, setActiveGuide] = useState(null);
const [guide, setGuide] = useState(null);
const [guideMuted, setGuideMuted] = useState(false);
const [speaking, setSpeaking] = useState(false);
const audioRef = useRef(null);
const rootRef = useRef(null);
const tourPlayingRef = useRef(false); // true while the tutorial video plays — suppresses hover voiceover
const onTourPlayState = useCallback((playing) => {
  tourPlayingRef.current = playing;
  if (playing) { try { audioRef.current && audioRef.current.pause(); } catch {} } // video wins: silence the guide voice
}, []);

useEffect(() => {
  const root = rootRef.current; if (!root) return;
  const els = root.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("in-view")); return; }
  const io = new IntersectionObserver((ents) => { ents.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in-view"); io.unobserve(en.target); } }); }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
  els.forEach(e => io.observe(e));
  return () => io.disconnect();
}, [tab]);

const applyMode = (m) => { setUiMode(m); if (m === "pro") { try { audioRef.current && audioRef.current.pause(); } catch {} setGuide(null); setActiveGuide(null); } };
const narrate = (audio) => { if (guideMuted || tourPlayingRef.current || !audio || !audioRef.current) return; try { audioRef.current.pause(); audioRef.current.src = audio; audioRef.current.currentTime = 0; audioRef.current.play().catch(() => {}); } catch {} };
// guide handlers shared with sub-tabs via props (guideEnter / guideLeave / gactive)
const guideEnter = (key, title, body, audio) => () => { if (expert) return; setActiveGuide(key); setGuide({ title, body }); narrate(audio); };
const guideLeave = (key) => () => { setActiveGuide(g => (g === key ? null : g)); };
const gactive = (key) => (!expert && activeGuide === key ? " guide-active" : "");
const guideProps = { guideEnter, guideLeave, gactive, expert };

const TOOLTABS = [
  { k: "sim", label: "Return Simulator" },
  { k: "risk", label: "Position Risk" },
  { k: "exp", label: "Expectancy" },
  { k: "fin", label: "Risk Finance" },
  { k: "move", label: "Expected Move" },
];

// ─── RETURN ───
return (
  <div className={"vp" + (expert ? " expert" : "")} ref={rootRef}>
    <style dangerouslySetInnerHTML={{ __html: PREM_CSS }} />
    <audio ref={audioRef} preload="auto" onPlaying={() => { if (tourPlayingRef.current) { try { audioRef.current.pause(); } catch {} return; } setSpeaking(true); }} onEnded={() => setSpeaking(false)} onPause={() => setSpeaking(false)} />
    <div className="shell">

      {/* NAV */}
      <div className="navbar">
        <div className="brand"><img src="/logo-mark.png" alt="Valen Insiders Vault" style={{ width: 24, height: 24, objectFit: "contain", display: "block" }} /> Valen Insiders Vault</div>
        <div className="tabs">
          <a style={{ cursor: "pointer" }} onClick={() => setPage && setPage("dashboard")}>Dashboard</a>
          <a style={{ cursor: "pointer" }} onClick={() => setPage && setPage("journal")}>Journal</a>
          <a className="on" style={{ cursor: "pointer" }} onClick={() => setPage && setPage("tools")}>Premium tools</a>
          <a style={{ cursor: "pointer" }} onClick={() => setPage && setPage("settings")}>Settings</a>
        </div>
        <div className="spacer"></div>
        <div className="seg" id="modeSeg" title="Guided explains everything; Pro strips it back for experts">
          <button className={uiMode === "guided" ? "on" : ""} onClick={() => applyMode("guided")}>Guided</button>
          <button className={uiMode === "pro" ? "on" : ""} onClick={() => applyMode("pro")}>Pro</button>
        </div>
        <button onClick={() => onLogout && onLogout()} title="Sign out" style={{ marginLeft: 14, background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", fontFamily: "var(--font)", fontSize: "0.72rem", fontWeight: 700, padding: "7px 14px", borderRadius: 980, cursor: "pointer" }}>Sign out</button>
      </div>

      {/* HEADER */}
      <div className="reveal">
        <div className="eyebrow">Premium tools</div>
        <div className="h1" style={{ marginTop: 6 }}>Your trading toolkit, <span className="goldname">{(displayName && displayName.trim()) || (session?.user?.email ? session.user.email.split("@")[0] : "trader")}</span></div>
        <div className={"sub guide" + gactive("intro")} data-gtitle="Premium tools" onMouseEnter={guideEnter("intro", "Premium tools", "Welcome to your Premium Tools — five calculators that turn trading questions into clear numbers. Hover anything for a plain-English explanation.", "/audio/premium-intro.mp3")} onMouseLeave={guideLeave("intro")}>Five calculators that answer the big money questions <i>before</i> you place a trade. Hover any underlined word for a plain-English definition.</div>
      </div>

      {/* WELCOME (guided) */}
      {!welcomeDismissed && (
        <div className="welcome">
          <span className="wd"></span>
          <div><b>New to these tools?</b> Hover any field and the guide in the corner explains it <b>out loud</b>. Switch to <b>Pro</b> (top-right) once you know your way around.</div>
          <span className="x" onClick={() => { setWelcomeDismissed(true); try { localStorage.setItem("viv-welcome-prem-x", "1"); } catch {} }}>&times;</span>
        </div>
      )}

      {/* TUTORIAL TOUR ("video") — narrated 6-chapter walkthrough (hidden in Pro via CSS) */}
      <PremiumTour onPlayStateChange={onTourPlayState} />

      {/* TOOL TABS */}
      <div className="tooltabs" id="toolTabs">
        {TOOLTABS.map((t, i) => (
          <button key={t.k} className={"tooltab" + (tab === i ? " on" : "")} onClick={() => setTab(i)}>{t.label}</button>
        ))}
      </div>

      {/* ACTIVE PANEL */}
      {tab === 0 && <ReturnSimulatorTab portfolioSize={portfolioSize} currentCapital={currentCapital} {...guideProps} />}
      {tab === 1 && <RiskTab demo={demo} {...guideProps} />}
      {tab === 2 && <ExpectancyTab demo={demo} {...guideProps} />}
      {tab === 3 && <RiskFinanceTab demo={demo} {...guideProps} />}
      {tab === 4 && <ExpectedMoveTab demo={demo} {...guideProps} />}

      {/* Guided assistant */}
      <div className={"guidepanel" + (speaking ? " speaking" : "")} aria-live="polite">
        <div className="gp-head">
          <span className="gp-dot"></span>
          <span className="gp-title">{guide ? guide.title : "Guided walkthrough"}</span>
          <button className="gp-mute" title={guideMuted ? "Unmute voiceover" : "Mute voiceover"} aria-label="Toggle voiceover" onClick={() => setGuideMuted(m => { const nm = !m; if (nm) { try { audioRef.current && audioRef.current.pause(); } catch {} } return nm; })}>
            {guideMuted
              ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></svg>
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a9 9 0 0 1 0 14" /></svg>}
          </button>
        </div>
        <div className="gp-body">{guide ? guide.body : "Hover any tool or field and I'll explain it — out loud. Switch to Pro (top-right) to turn this off."}</div>
      </div>

    </div>
  </div>
);
}

// ═══════════════════════════════════════
// ─── TRADE JOURNAL PAGE ───
// ═══════════════════════════════════════
const SAMPLE_TRADES = [
  { id:1,ticker:"NVDA",entry:"3/10/26",exit:"3/21/26",entryP:142.50,exitP:168.30,shares:575,stop:133.80,setup:"VCP",tags:["Breakout","Momentum"],plPct:18.11,plDollar:14835,rMult:2.96,reason:"Sold Into Strength",notes:"" },
  { id:2,ticker:"PLTR",entry:"3/12/26",exit:"3/19/26",entryP:98.20,exitP:112.40,shares:310,stop:92.50,setup:"Pivot",tags:["Sector Leader"],plPct:14.46,plDollar:4402,rMult:2.49,reason:"Sold Into Strength",notes:"" },
  { id:3,ticker:"SIF",entry:"3/19/26",exit:"3/24/26",entryP:15.00,exitP:12.94,shares:3277,stop:14.10,setup:"VCP",tags:["Breakout"],plPct:-13.73,plDollar:-6750,rMult:-2.29,reason:"Hit Initial Stop",notes:"Too wide stop" },
  { id:4,ticker:"KLIC",entry:"3/25/26",exit:"3/27/26",entryP:69.04,exitP:63.67,shares:1087,stop:65.00,setup:"VCP",tags:[],plPct:-7.78,plDollar:-5837,rMult:-1.33,reason:"Hit Initial Stop",notes:"" },
  { id:5,ticker:"LHX",entry:"3/16/26",exit:"3/23/26",entryP:366.39,exitP:349.80,shares:341,stop:348.00,setup:"Power Play",tags:["Momentum"],plPct:-4.53,plDollar:-5656,rMult:-0.90,reason:"Hit Trailing Stop",notes:"" },
  { id:6,ticker:"LYFT",entry:"3/31/26",exit:"4/1/26",entryP:12.80,exitP:13.47,shares:3900,stop:12.10,setup:"Low-Risk Entry",tags:["High Volume"],plPct:5.23,plDollar:2613,rMult:0.96,reason:"Time Stop",notes:"" },
  { id:7,ticker:"CRWD",entry:"3/14/26",exit:"3/28/26",entryP:385.00,exitP:418.25,shares:180,stop:365.00,setup:"VCP",tags:["Breakout","Sector Leader"],plPct:8.64,plDollar:5985,rMult:1.66,reason:"Sold Into Strength",notes:"" },
  { id:8,ticker:"JAZZ",entry:"3/25/26",exit:"3/27/26",entryP:186.70,exitP:186.49,shares:803,stop:178.00,setup:"VCP",tags:[],plPct:-0.11,plDollar:-169,rMult:-0.02,reason:"Time Stop",notes:"Scratch trade" },
];

// ─── CSV Helpers ───
const CSV_HEADERS = ["Symbol","Entry Date","Entry Time","Exit Date","Exit Time","Entry Price","Exit Price","Shares","Stop","Setup","Tags","P/L %","P/L $","R-Multiple","Exit Reason","Commission","Notes"];
const HEADER_ALIASES = {
  "symbol":"ticker","ticker":"ticker","sym":"ticker","stock":"ticker",
  "entry date":"entry","entry":"entry","open date":"entry","date opened":"entry","entrydate":"entry",
  "entry time":"entryTime","entrytime":"entryTime","time in":"entryTime",
  "exit date":"exit","exit":"exit","close date":"exit","date closed":"exit","exitdate":"exit",
  "exit time":"exitTime","exittime":"exitTime","time out":"exitTime",
  "entry price":"entryP","entryprice":"entryP","entry $":"entryP","buy price":"entryP","avg cost":"entryP","avgcost":"entryP",
  "exit price":"exitP","exitprice":"exitP","exit $":"exitP","sell price":"exitP","close price":"exitP",
  "shares":"shares","qty":"shares","quantity":"shares","size":"shares",
  "stop":"stop","stop price":"stop","stopprice":"stop","stop loss":"stop",
  "setup":"setup","setup type":"setup","setuptype":"setup","entry type":"setup","strategy":"setup",
  "tags":"tags","tag":"tags","labels":"tags",
  "p/l %":"plPct","pl%":"plPct","pl %":"plPct","return %":"plPct","return":"plPct","pnl%":"plPct","pnl %":"plPct",
  "p/l $":"plDollar","pl$":"plDollar","pl $":"plDollar","p/l":"plDollar","pnl$":"plDollar","pnl $":"plDollar","profit":"plDollar","profit/loss":"plDollar",
  "r-multiple":"rMult","r-mult":"rMult","rmult":"rMult","r multiple":"rMult","r":"rMult",
  "exit reason":"reason","reason":"reason","exitreason":"reason","close reason":"reason",
  "commission":"commission","comm":"commission",
  "notes":"notes","note":"notes","comment":"notes","comments":"notes",
};

function exportTradesCSV(trades) {
  const rows = [CSV_HEADERS.join(",")];
  trades.forEach(t => {
    rows.push([
      t.ticker, t.entry, t.entryTime || "", t.exit || "", t.exitTime || "", t.entryP, t.exitP, t.shares, t.stop || "",
      `"${t.setup || ""}"`, `"${(t.tags || []).join("; ")}"`,
      t.plPct?.toFixed(2) || "", t.plDollar?.toFixed(2) || "", t.rMult?.toFixed(2) || "",
      `"${t.reason || ""}"`, t.commission != null && t.commission !== "" ? t.commission : "",
      `"${(t.notes || "").replace(/"/g, '""')}"`
    ].join(","));
  });
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `VIV_Trades_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function exportPositionsCSV(positions) {
  const headers = ["Symbol","Entry Date","Entry Time","Shares","Entry Price","Current Price","Stop","Trailing Stop","Setup","Tags","Commission","Notes","Chart URL"];
  const rows = [headers.join(",")];
  positions.forEach(p => {
    rows.push([
      p.sym || "", p.entry || "", p.entryTime || "", p.shares || "", p.ep || "", p.cp || "",
      p.stop || "", p.trailStop || "", `"${p.setup || ""}"`,
      `"${(p.tags || []).join("; ")}"`, p.comm || "",
      `"${(p.notes || "").replace(/"/g, '""')}"`, `"${p.chartUrl || ""}"`
    ].join(","));
  });
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `VIV_Positions_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// Master CSV export — downloads both positions and trades in a single file
function exportMasterCSV(positions, trades) {
  const lines = [];
  // Section 1: Open Positions
  lines.push("=== OPEN POSITIONS ===");
  const posHeaders = ["Symbol","Entry Date","Entry Time","Shares","Entry Price","Current Price","Stop","Trailing Stop","Setup","Tags","Commission","Notes","Chart URL"];
  lines.push(posHeaders.join(","));
  (positions || []).filter(p => p.sym).forEach(p => {
    lines.push([
      p.sym || "", p.entry || "", p.entryTime || "", p.shares || "", p.ep || "", p.cp || "",
      p.stop || "", p.trailStop || "", `"${p.setup || ""}"`,
      `"${(p.tags || []).join("; ")}"`, p.comm || "",
      `"${(p.notes || "").replace(/"/g, '""')}"`, `"${p.chartUrl || ""}"`
    ].join(","));
  });
  lines.push(""); // blank separator
  // Section 2: Closed Trades
  lines.push("=== CLOSED TRADES ===");
  lines.push(CSV_HEADERS.join(","));
  (trades || []).forEach(t => {
    lines.push([
      t.ticker, t.entry, t.entryTime || "", t.exit || "", t.exitTime || "", t.entryP, t.exitP, t.shares, t.stop || "",
      `"${t.setup || ""}"`, `"${(t.tags || []).join("; ")}"`,
      t.plPct?.toFixed(2) || "", t.plDollar?.toFixed(2) || "", t.rMult?.toFixed(2) || "",
      `"${t.reason || ""}"`, t.commission != null && t.commission !== "" ? t.commission : "",
      `"${(t.notes || "").replace(/"/g, '""')}"`
    ].join(","));
  });
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `VIV_Master_Export_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ─── Master CSV import — detects section markers and parses both positions + trades ───
// Returns { positions: [...], trades: [...] } or null if not a master export
function parseMasterCSV(text) {
  const lines = text.split(/\r?\n/);
  const posMarker = lines.findIndex(l => /^=== OPEN POSITIONS ===$/.test(l.trim()));
  const tradeMarker = lines.findIndex(l => /^=== CLOSED TRADES ===$/.test(l.trim()));
  if (posMarker < 0 && tradeMarker < 0) return null; // not a master export

  const positions = [];
  const trades = [];

  // Parse positions section (between posMarker and tradeMarker)
  if (posMarker >= 0) {
    const posEnd = tradeMarker >= 0 ? tradeMarker : lines.length;
    const posLines = lines.slice(posMarker + 1, posEnd).filter(l => l.trim());
    if (posLines.length >= 2) {
      const hdr = posLines[0].split(",").map(h => h.replace(/"/g, "").trim().toLowerCase());
      const symIdx = hdr.findIndex(h => /symbol|ticker/i.test(h));
      const entryIdx = hdr.findIndex(h => /entry.?date|date/i.test(h));
      const sharesIdx = hdr.findIndex(h => /shares|qty|quantity/i.test(h));
      const epIdx = hdr.findIndex(h => /entry.?price|avg.?cost|cost/i.test(h));
      const cpIdx = hdr.findIndex(h => /^current|^last|^market|^price$/i.test(h));
      const s1Idx = hdr.findIndex(h => /^stop$|stop.?price|orig.?stop/i.test(h));
      const tsIdx = hdr.findIndex(h => /trail/i.test(h));
      const setupIdx = hdr.findIndex(h => /setup/i.test(h));
      const tagsIdx = hdr.findIndex(h => /tags/i.test(h));
      const commIdx = hdr.findIndex(h => /commission|comm/i.test(h));
      const entryTimeIdx = hdr.findIndex(h => /entry.?time|time.?in/i.test(h));
      const notesIdx = hdr.findIndex(h => /notes/i.test(h));
      const chartIdx = hdr.findIndex(h => /chart.?url/i.test(h));
      for (let i = 1; i < posLines.length; i++) {
        const vals = posLines[i].match(/("(?:[^"]|"")*"|[^,]*)/g)?.map(v => v.replace(/^"|"$/g, "").replace(/""/g, '"').trim()) || [];
        const sym = symIdx >= 0 ? (vals[symIdx] || "").toUpperCase() : "";
        if (!sym) continue;
        positions.push({
          id: Date.now() + i, _lid: Date.now() + i, sym,
          entry: entryIdx >= 0 ? vals[entryIdx] || "" : "",
          entryTime: entryTimeIdx >= 0 ? vals[entryTimeIdx] || "" : "",
          shares: sharesIdx >= 0 ? vals[sharesIdx] || "" : "",
          ep: epIdx >= 0 ? vals[epIdx] || "" : "",
          cp: cpIdx >= 0 ? vals[cpIdx] || "" : "",
          stop: s1Idx >= 0 ? vals[s1Idx] || "" : "",
          stop2: "", trailStop: tsIdx >= 0 ? vals[tsIdx] || "" : "",
          setup: setupIdx >= 0 ? vals[setupIdx] || "VCP" : "VCP",
          tags: tagsIdx >= 0 && vals[tagsIdx] ? vals[tagsIdx].split(/[;,]/).map(t => t.trim()).filter(Boolean) : [],
          comm: commIdx >= 0 ? vals[commIdx] || "" : "",
          notes: notesIdx >= 0 ? vals[notesIdx] || "" : "",
          chartUrl: chartIdx >= 0 ? vals[chartIdx] || "" : "",
        });
      }
    }
  }

  // Parse trades section (after tradeMarker)
  if (tradeMarker >= 0) {
    const tradeLines = lines.slice(tradeMarker + 1).filter(l => l.trim());
    // Join and re-parse using the existing parseCSV function (it expects header + data lines)
    if (tradeLines.length >= 2) {
      const parsed = parseCSV(tradeLines.join("\n"));
      trades.push(...parsed);
    }
  }

  return { positions, trades };
}

// Normalize dates: detect DD/MM/YYYY or D/MM/YYYY and convert to YYYY-MM-DD
function normalizeDate(raw) {
  if (!raw || !raw.trim()) return "";
  const s = raw.trim();
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY or D/MM/YYYY (day > 12 confirms DD/MM, otherwise assume DD/MM for consistency)
  const slashMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slashMatch) {
    const a = parseInt(slashMatch[1]), b = parseInt(slashMatch[2]), y = slashMatch[3];
    // If first number > 12, it must be day (DD/MM/YYYY)
    // If second number > 12, it must be day (MM/DD/YYYY)
    // Otherwise default to DD/MM/YYYY (non-US format, common in SEA)
    let day, month;
    if (a > 12) { day = a; month = b; }
    else if (b > 12) { day = b; month = a; }
    else { day = a; month = b; } // default DD/MM
    return `${y}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  }
  return s; // return as-is if unrecognized
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  // Parse header
  const rawHeaders = lines[0].split(",").map(h => h.replace(/^["']|["']$/g, "").trim());
  const colMap = rawHeaders.map(h => HEADER_ALIASES[h.toLowerCase()] || null);
  // Parse rows
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = []; let cur = ""; let inQ = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { vals.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    vals.push(cur.trim());
    const row = {};
    colMap.forEach((field, idx) => { if (field && vals[idx] !== undefined) row[field] = vals[idx]; });
    // Skip rows without a ticker
    if (!row.ticker) continue;
    // Skip open positions (no exit price = not a closed trade)
    const exitP = parseFloat(row.exitP) || 0;
    if (exitP <= 0) continue;
    // Convert numerics
    const entryP = parseFloat(row.entryP) || 0;
    const shares = parseFloat(row.shares) || 0;
    const stop = parseFloat(row.stop) || 0;
    // Calculate P/L % — use CSV value if present, otherwise derive from prices
    const plPct = row.plPct !== undefined && row.plPct !== "" ? parseFloat(row.plPct) : (entryP > 0 ? ((exitP - entryP) / entryP) * 100 : 0);
    // Calculate P/L $ — use CSV value if present, otherwise derive from prices × shares
    const plDollar = row.plDollar !== undefined && row.plDollar !== "" ? parseFloat(row.plDollar) : (exitP - entryP) * shares;
    // If we have plDollar but no entry price, back-calculate entry from exit and P/L
    const effectiveEntryP = entryP > 0 ? entryP : (shares > 0 && row.plDollar ? exitP - (parseFloat(row.plDollar) / shares) : 0);
    const effectivePlPct = plPct !== 0 ? plPct : (effectiveEntryP > 0 ? ((exitP - effectiveEntryP) / effectiveEntryP) * 100 : 0);
    const initRisk = effectiveEntryP > 0 && stop > 0 ? (effectiveEntryP - stop) / effectiveEntryP : 0;
    const rMult = row.rMult !== undefined && row.rMult !== "" ? parseFloat(row.rMult) : (initRisk > 0 ? (effectivePlPct / 100) / initRisk : 0);
    // Normalize dates
    const entryDate = normalizeDate(row.entry);
    const exitDate = normalizeDate(row.exit);
    results.push({
      id: Date.now() + i,
      ticker: row.ticker.toUpperCase(),
      entry: entryDate, entryTime: row.entryTime || "",
      exit: exitDate, exitTime: row.exitTime || "",
      entryP: effectiveEntryP, exitP, shares, stop,
      setup: row.setup || "VCP",
      tags: row.tags ? row.tags.split(/[;,]/).map(t => t.trim()).filter(Boolean) : [],
      plPct: effectivePlPct, plDollar, rMult,
      reason: row.reason || "",
      commission: row.commission !== undefined && row.commission !== "" ? parseFloat(row.commission) : null,
      notes: row.notes || "",
      chartUrl: "", chartImage: "",
      _imported: true,
    });
  }
  return results;
}

// ─── Notes helpers: backward-compat structured notes ───
// New trades store JSON: {"right":"...","wrong":"...","lessons":"..."}
// Old trades store plain string. parseNotes handles both.
function parseNotes(raw) {
  if (!raw) return { right: "", wrong: "", lessons: "", _plain: "" };
  if (typeof raw === "object") return { right: raw.right || "", wrong: raw.wrong || "", lessons: raw.lessons || "", _plain: "" };
  try { const parsed = JSON.parse(raw); return { right: parsed.right || "", wrong: parsed.wrong || "", lessons: parsed.lessons || "", _plain: "" }; }
  catch { return { right: "", wrong: "", lessons: "", _plain: raw }; }
}
function serializeNotes(obj) {
  // If only _plain has content (migrating from old format), keep it in "right" field
  if (obj._plain && !obj.right && !obj.wrong && !obj.lessons) return obj._plain;
  const has = obj.right || obj.wrong || obj.lessons;
  if (!has && obj._plain) return obj._plain; // still old format, user hasn't used structured yet
  if (!has && !obj._plain) return "";
  return JSON.stringify({ right: obj.right || "", wrong: obj.wrong || "", lessons: obj.lessons || "" });
}
function notesPreview(raw) {
  const n = parseNotes(raw);
  if (n._plain) return n._plain;
  const parts = [n.right && `✓ ${n.right}`, n.wrong && `✗ ${n.wrong}`, n.lessons && `💡 ${n.lessons}`].filter(Boolean);
  return parts.join(" | ") || "";
}

// Trade-review candlestick chart (TradingView Lightweight Charts via CDN). TradingView-style chrome:
// switchable timeframes; volume pane + 50-period volume average; MA10/20/50 (SMA or EMA, toggleable);
// log/fit controls; click-to-place drawing tools (horizontal line + 2-click trendline); a crosshair
// OHLC+MA legend; dotted thin entry/exit price lines + labelled arrows; a peak-favorable-excursion
// ("best exit") marker; and a stats panel. Daily charts load ~600d of history (default view focused on the
// trade; scroll back for more). Marker placement matches the known fill PRICE within the bar — timezone-proof.
// Read-only; data via /api/candles.
const CHART_TFS = [["1m", "1min"], ["3m", "3min"], ["5m", "5min"], ["15m", "15min"], ["30m", "30min"], ["1h", "60min"], ["4h", "4h"], ["D", "1day"]];
const MA_COLORS = { 10: "#3b82f6", 20: "#f0c050", 50: "#a78bfa" }; // MA10 blue · MA20 gold · MA50 violet — functional chart overlays
// Moving-average series data ([{time,value}]). SMA = rolling mean; EMA = exponential (seeded on first close).
function maData(candles, period, type) {
  const out = [];
  if (type === "EMA") {
    const k = 2 / (period + 1);
    let prev = null;
    for (let i = 0; i < candles.length; i++) {
      const px = candles[i].close;
      prev = prev == null ? px : px * k + prev * (1 - k);
      if (i >= period - 1) out.push({ time: candles[i].time, value: +prev.toFixed(4) });
    }
  } else {
    let sum = 0;
    for (let i = 0; i < candles.length; i++) {
      sum += candles[i].close;
      if (i >= period) sum -= candles[i - period].close;
      if (i >= period - 1) out.push({ time: candles[i].time, value: +(sum / period).toFixed(4) });
    }
  }
  return out;
}
// Rolling average of volume ([{time,value}]) — the 50-period volume line drawn over the volume pane.
function volAvgData(candles, period) {
  const out = []; let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += (candles[i].volume || 0);
    if (i >= period) sum -= (candles[i - period].volume || 0);
    if (i >= period - 1) out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}
function TradeChart({ trade }) {
  const elRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);      // candlestick series — for coordinate↔price projection
  const candlesRef = useRef([]);             // current candles (for time↔logical-index mapping)
  const toolRef = useRef("cursor");          // live mirror of `tool` for chart-level subscriptions
  const placeRef = useRef(null);             // freshest placement handler (called from chart.subscribeClick)
  const draftRef = useRef(null);             // freshest in-progress trendline endpoint (for the rubber-band preview)
  const cacheRef = useRef({ id: null, data: {} });            // fetched candles per timeframe — avoids refetch on toggle
  const [status, setStatus] = useState("loading"); // loading | ok | empty | error | nolib
  const [msg, setMsg] = useState("");
  const [tf, setTf] = useState(null);        // null = auto-pick by trade span
  const [logScale, setLogScale] = useState(false);
  const [maOn, setMaOn] = useState(true);    // show MA10/20/50
  const [maType, setMaType] = useState("SMA"); // "SMA" | "EMA"
  const [volOn, setVolOn] = useState(true);  // show volume pane + 50-period volume average
  const [legend, setLegend] = useState(null); // crosshair OHLC + MA readout
  const [best, setBest] = useState(null);    // peak favorable price between entry & exit (from candles)
  const [chartW, setChartW] = useState(600); // live chart pixel width (for full-width horizontal-line drawings)
  // ── Drawing layer (SVG overlay) ──
  const [tool, setTool] = useState("cursor"); // "cursor" | "trend" | "hline" | "text"
  const [drawings, setDrawings] = useState([]); // [{id,type:'trend'|'hline'|'text', a:{time,price}, b?:{time,price}, text?}]
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);  // first endpoint of an in-progress trendline {time,price}
  const [hoverPt, setHoverPt] = useState(null); // live cursor {x,y} for the trendline rubber-band preview
  const [editingText, setEditingText] = useState(null); // {id,x,y,value} text being typed
  const [overlayTick, setOverlayTick] = useState(0); // bumped on pan/zoom/resize to re-project the overlay
  const drawKey = `viv-draw-${trade.id}`;
  // Load this trade's saved drawings (localStorage — survives reload, never touches the DB)
  useEffect(() => {
    try { const raw = localStorage.getItem(drawKey); setDrawings(raw ? JSON.parse(raw) : []); }
    catch { setDrawings([]); }
    setSelectedId(null); setDraft(null); setEditingText(null); setTool("cursor");
  }, [trade.id]);
  // Persist on change
  useEffect(() => { try { localStorage.setItem(drawKey, JSON.stringify(drawings)); } catch { } }, [drawings, drawKey]);
  useEffect(() => { toolRef.current = tool; if (tool !== "trend") setDraft(null); }, [tool]);
  // Delete / Backspace removes the selected drawing (ignored while typing in a field)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const ae = document.activeElement, tag = ae && ae.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (ae && ae.isContentEditable)) return;
      if (selectedId != null) { e.preventDefault(); setDrawings(ds => ds.filter(d => d.id !== selectedId)); setSelectedId(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const entryISO = tradeDateISO(trade.entry), exitISO = tradeDateISO(trade.exit || trade.entry);
  const spanDays = Math.max(0, (Date.parse(exitISO) - Date.parse(entryISO)) / 86400000);
  const autoRes = spanDays <= 1 ? "5min" : spanDays <= 5 ? "15min" : spanDays <= 25 ? "60min" : "1day";
  const activeRes = tf || autoRes;
  const isShort = (trade.tradeType || "Long") === "Short";

  // Toggle log/linear price scale on the live chart without re-fetching candles
  useEffect(() => { if (chartRef.current) chartRef.current.priceScale("right").applyOptions({ mode: logScale ? 1 : 0 }); }, [logScale]);

  useEffect(() => {
    const LWC = window.LightweightCharts;
    if (!LWC) { setStatus("nolib"); return; }
    let disposed = false, onResize = null;
    setBest(null);

    // Render the chart from a candle array (runs after fetch or straight from cache)
    const build = (candles) => {
      setStatus("ok");
      // build on next tick so the container is in the DOM
      setTimeout(() => {
        if (disposed || !elRef.current) return;
        const w = elRef.current.clientWidth || 600;
        const chart = LWC.createChart(elRef.current, {
          width: w, height: 480, layout: { background: { color: "transparent" }, textColor: "rgba(255,255,255,0.6)", fontFamily: font },
          grid: { vertLines: { color: "rgba(255,255,255,0.05)" }, horzLines: { color: "rgba(255,255,255,0.05)" } },
          timeScale: { timeVisible: activeRes !== "1day", borderColor: "rgba(255,255,255,0.1)", rightOffset: 6 },
          rightPriceScale: { borderColor: "rgba(255,255,255,0.1)", scaleMargins: volOn ? { top: 0.08, bottom: 0.26 } : { top: 0.12, bottom: 0.12 }, mode: logScale ? 1 : 0 }, crosshair: { mode: 0 },
        });
        chartRef.current = chart;
        setChartW(w);
        const s = chart.addCandlestickSeries({ upColor: C.green, downColor: C.red, borderUpColor: C.green, borderDownColor: C.red, wickUpColor: C.green, wickDownColor: C.red });
        s.setData(candles);
        candleSeriesRef.current = s;
        candlesRef.current = candles;

        // ── Volume pane (own scale, bottom ~18%) + 50-period volume average ──
        if (volOn) {
          const vol = chart.addHistogramSeries({ priceScaleId: "vol", priceFormat: { type: "volume" } });
          chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
          vol.setData(candles.map(c => ({ time: c.time, value: c.volume || 0, color: c.close >= c.open ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.45)" })));
          const va = volAvgData(candles, 50);
          if (va.length) { const vma = chart.addLineSeries({ priceScaleId: "vol", color: "rgba(240,192,80,0.9)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }); vma.setData(va); }
        }

        // ── Moving averages (MA10/20/50, SMA or EMA) ──
        const maObjs = {}, maLast = {};
        if (maOn) {
          [10, 20, 50].forEach(p => {
            const d = maData(candles, p, maType);
            if (!d.length) return;
            const ls = chart.addLineSeries({ color: MA_COLORS[p], lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
            ls.setData(d);
            maObjs[p] = ls; maLast[p] = d[d.length - 1].value;
          });
        }

        // ── Entry / exit / peak markers (price-matched within the bar — timezone-proof) ──
        const entryP = +trade.entryP, exitP = +trade.exitP;
        const inBar = (c, p) => c.low <= p && p <= c.high;
        const nearest = (p) => candles.reduce((b, c) => Math.abs(c.close - p) < Math.abs((b ? b.close : 1e18) - p) ? c : b, null);
        const entryBar = candles.find(c => inBar(c, entryP)) || nearest(entryP);
        let exitBar = null; for (let i = candles.length - 1; i >= 0; i--) { if (inBar(candles[i], exitP)) { exitBar = candles[i]; break; } }
        if (!exitBar) exitBar = nearest(exitP);
        let peak = null;
        if (entryBar && exitBar) {
          const lo = Math.min(entryBar.time, exitBar.time), hi = Math.max(entryBar.time, exitBar.time);
          candles.forEach(c => { if (c.time >= lo && c.time <= hi && (!peak || (isShort ? c.low < peak.low : c.high > peak.high))) peak = c; });
          if (peak) setBest({ price: isShort ? peak.low : peak.high, time: peak.time });
        }
        const markers = [];
        if (entryBar) markers.push({ time: entryBar.time, position: "belowBar", color: C.green, shape: "arrowUp", size: 2, text: `ENTRY $${entryP}` });
        if (peak && entryBar && exitBar && peak.time !== exitBar.time && peak.time !== entryBar.time) markers.push({ time: peak.time, position: isShort ? "belowBar" : "aboveBar", color: C.goldBright, shape: "circle", size: 1, text: "Peak" });
        if (exitBar) markers.push({ time: exitBar.time, position: "aboveBar", color: C.red, shape: "arrowDown", size: 2, text: `EXIT $${exitP}` });
        markers.sort((a, b) => a.time - b.time);
        s.setMarkers(markers);
        // Entry/exit are shown by the on-candle arrows only (no full-width lines — they were distracting).
        // Stop stays as a subtle dashed reference line when set.
        if (+trade.stop > 0) s.createPriceLine({ price: +trade.stop, color: C.gold, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Stop" });

        // ── Default view: focus on the trade; the deep history stays scrollable ──
        const tsc = chart.timeScale();
        if (activeRes === "1day" && entryISO && exitISO) {
          try {
            const viewPad = 75 * 86400; // ~2.5 months of context each side
            tsc.setVisibleRange({ from: Math.floor(Date.parse(entryISO) / 1000) - viewPad, to: Math.floor(Date.parse(exitISO) / 1000) + viewPad });
          } catch { tsc.fitContent(); }
        } else { tsc.fitContent(); }

        // ── Drawing overlay: re-project on every pan / zoom (rAF-throttled). Placement + selection use the
        //    chart's OWN click coordinates (param.point / param.logical) so there's never any offset. ──
        let rafPending = false;
        const bumpOverlay = () => { if (rafPending) return; rafPending = true; requestAnimationFrame(() => { rafPending = false; setOverlayTick(t => (t + 1) % 1e9); }); };
        chart.timeScale().subscribeVisibleLogicalRangeChange(bumpOverlay);
        chart.subscribeClick((param) => {
          if (!param.point) return;
          if (toolRef.current === "cursor") { setSelectedId(null); return; } // empty-space click deselects
          const price = s.coordinateToPrice(param.point.y);
          if (price == null) return;
          if (placeRef.current) placeRef.current({ price, x: param.point.x, y: param.point.y });
        });
        bumpOverlay(); // initial projection once the scale is settled

        // ── Crosshair OHLC + MA legend (+ trendline rubber-band) ──
        const lastBar = candles[candles.length - 1];
        const legendFor = (bar, param) => ({
          o: bar.open, h: bar.high, l: bar.low, c: bar.close,
          up: bar.close >= bar.open,
          ma: maOn ? {
            10: maObjs[10] ? (param?.seriesData?.get(maObjs[10])?.value ?? maLast[10]) : null,
            20: maObjs[20] ? (param?.seriesData?.get(maObjs[20])?.value ?? maLast[20]) : null,
            50: maObjs[50] ? (param?.seriesData?.get(maObjs[50])?.value ?? maLast[50]) : null,
          } : null,
        });
        setLegend(legendFor(lastBar, null));
        chart.subscribeCrosshairMove((param) => {
          const bar = (param && param.time && param.seriesData) ? param.seriesData.get(s) : null;
          setLegend(legendFor(bar || lastBar, param));
          if ((toolRef.current === "trend" || toolRef.current === "rect") && draftRef.current && param.point) setHoverPt({ x: param.point.x, y: param.point.y });
        });

        onResize = () => { if (elRef.current && chart) { const cw = elRef.current.clientWidth; chart.applyOptions({ width: cw }); setChartW(cw); setOverlayTick(t => (t + 1) % 1e9); } };
        window.addEventListener("resize", onResize);
      }, 30);
    };

    (async () => {
      try {
        if (!trade.ticker || !entryISO) { setStatus("empty"); return; }
        // Cache hit — rebuild from already-fetched candles (toggling MA/Vol never refetches)
        const cached = cacheRef.current.data[activeRes];
        if (cached) { if (!cached.length) { setStatus("empty"); return; } build(cached); return; }
        setStatus("loading");
        // History window widens with the timeframe — daily pulls ~600d (≈20 months) so you can scroll back a year+
        const padDays = (r) => r === "1day" ? 45 : r === "4h" ? 60 : (r === "60min" || r === "30min") ? 12 : r === "15min" ? 5 : 2;
        const beforeDays = activeRes === "1day" ? 600 : padDays(activeRes);
        const afterDays = padDays(activeRes);
        const pad = (d, days) => { const t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + days); return t.toISOString().slice(0, 10); };
        const from = pad(entryISO, -beforeDays);
        let to = pad(exitISO, afterDays);
        const today = new Date().toISOString().slice(0, 10);
        if (to > today) to = today;
        const r = await fetch(`/api/candles?symbol=${encodeURIComponent(trade.ticker)}&from=${from}&to=${to}&res=${activeRes}`);
        const j = await r.json();
        if (disposed) return;
        if (!j.ok) { setStatus("error"); setMsg(j.error || "Could not load candles."); return; }
        const candles = j.candles || [];
        cacheRef.current.data[activeRes] = candles;
        if (!candles.length) { setStatus("empty"); return; }
        build(candles);
      } catch (e) { if (!disposed) { setStatus("error"); setMsg("Chart only loads on the deployed site (the data API isn't available in local dev)."); } }
    })();
    return () => { disposed = true; if (onResize) window.removeEventListener("resize", onResize); if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; } candleSeriesRef.current = null; };
  }, [trade.id, activeRes, maOn, maType, volOn]);

  // ─── Trade stats (panel) ───
  const entryP = +trade.entryP || 0, exitP = +trade.exitP || 0, shares = +trade.shares || 0, stop = +trade.stop || 0;
  const plD = Number(trade.plDollar) || 0, plP = Number(trade.plPct) || 0, comm = Number(trade.commission) || 0;
  const tradeRisk = stop > 0 && entryP > 0 ? Math.abs(entryP - stop) * shares : null;
  const money = (v) => `$${Math.abs(Number(v)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtT = (sec) => { const d = new Date(sec * 1000); return activeRes === "1day" ? d.toLocaleDateString() : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); };
  const duration = (() => {
    if (!entryISO || !exitISO) return "—";
    const d1 = new Date(entryISO + "T00:00:00"), d2 = new Date(exitISO + "T00:00:00");
    if (trade.entryTime) { const [h, m] = trade.entryTime.split(":").map(Number); if (!isNaN(h)) d1.setHours(h, m || 0); }
    if (trade.exitTime) { const [h, m] = trade.exitTime.split(":").map(Number); if (!isNaN(h)) d2.setHours(h, m || 0); }
    const ms = Math.max(0, d2 - d1), dd = Math.floor(ms / 86400000), hh = Math.floor((ms % 86400000) / 3600000), mm = Math.floor((ms % 3600000) / 60000);
    return dd > 0 ? `${dd}d ${hh}h` : hh > 0 ? `${hh}h ${mm}m` : `${mm}m`;
  })();
  const statRows = [
    ["Direction", isShort ? "Short" : "Long", isShort ? C.red : C.green],
    ["Average Entry", entryP ? `$${entryP.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : "—", C.white],
    ["Average Exit", exitP ? `$${exitP.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : "—", C.white],
    ["Shares", shares ? shares.toLocaleString() : "—", C.white],
    ["Duration", duration, C.white],
    ["P/L", `${plD >= 0 ? "+" : "-"}${money(plD)}`, plD >= 0 ? C.green : C.red],
    ["Return", `${plP >= 0 ? "+" : ""}${plP.toFixed(2)}%`, plP >= 0 ? C.green : C.red],
    ["Realized R", trade.rMult == null ? "—" : `${Number(trade.rMult).toFixed(2)}R`, trade.rMult == null ? C.muted : (trade.rMult >= 0 ? C.green : C.red)],
    ["Trade Risk", tradeRisk != null ? money(tradeRisk) : "—", C.text],
    ["Stop", stop > 0 ? `$${stop.toFixed(2)}` : "—", C.text],
    ["Commission & Fees", money(comm), C.text],
    ["Best Exit Price", best ? `$${best.price.toFixed(2)}` : "—", C.goldBright],
    ["Best Exit Time", best ? fmtT(best.time) : "—", C.text],
  ];
  // Toolbar / drawing button style (gold when active)
  const tb = (active) => ({ padding: "4px 10px", borderRadius: 7, border: `1px solid ${active ? C.borderGold : C.border}`, background: active ? C.goldDim : "transparent", color: active ? C.gold : C.muted, fontWeight: 700, fontSize: "0.6rem", cursor: "pointer", fontFamily: font, whiteSpace: "nowrap" });
  const fmtMA = (v) => v == null ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Vertical drawing-rail icon button (TradingView-style left rail)
  const railBtn = (id, icon, label) => (
    <button key={id} onClick={() => { setTool(id); setDraft(null); }} title={label}
      style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: `1px solid ${tool === id ? C.borderGold : "transparent"}`, background: tool === id ? C.goldDim : "transparent", color: tool === id ? C.gold : C.muted, fontWeight: 700, fontSize: "0.95rem", lineHeight: 1, cursor: "pointer", fontFamily: font }}>{icon}</button>
  );

  // ── Drawing projection (logical-index based so lines stay pinned and extend off-screen) ──
  const CHART_H = 480;
  const tsApi = () => chartRef.current && chartRef.current.timeScale();
  const paneW = () => { const ts = tsApi(); try { return ts ? ts.width() : chartW; } catch { return chartW; } };
  // Sub-candle-exact anchoring: drawings store an INTERPOLATED timestamp (timeframe-stable) and project via a
  // FRACTIONAL logical index, so a point lands exactly under the cursor — no snapping-to-candle that tilted lines.
  const logicalToTime = (logical) => {
    const cd = candlesRef.current; const n = cd.length; if (!n) return 0;
    if (logical <= 0) { const step = n > 1 ? cd[1].time - cd[0].time : 86400; return cd[0].time + logical * step; }
    if (logical >= n - 1) { const step = n > 1 ? cd[n - 1].time - cd[n - 2].time : 86400; return cd[n - 1].time + (logical - (n - 1)) * step; }
    const i = Math.floor(logical), frac = logical - i;
    return cd[i].time + frac * (cd[i + 1].time - cd[i].time);
  };
  const timeToLogical = (time) => {
    const cd = candlesRef.current; const n = cd.length; if (!n) return 0;
    if (time <= cd[0].time) { const step = n > 1 ? cd[1].time - cd[0].time : 86400; return step ? (time - cd[0].time) / step : 0; }
    if (time >= cd[n - 1].time) { const step = n > 1 ? cd[n - 1].time - cd[n - 2].time : 86400; return step ? (n - 1) + (time - cd[n - 1].time) / step : n - 1; }
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cd[mid].time <= time) lo = mid; else hi = mid; }
    const span = cd[hi].time - cd[lo].time;
    return lo + (span ? (time - cd[lo].time) / span : 0);
  };
  const timeToX = (time) => { const ts = tsApi(); if (!ts) return null; const x = ts.logicalToCoordinate(timeToLogical(time)); return x == null ? null : x; };
  const priceToY = (price) => { const s = candleSeriesRef.current; if (!s) return null; const y = s.priceToCoordinate(price); return y == null ? null : y; };

  const addDrawing = (d) => setDrawings(ds => [...ds, { id: `d${Date.now()}${Math.random().toString(36).slice(2, 6)}`, ...d }]);
  // Place the active tool's drawing. Coordinates come from Lightweight Charts itself (param.point /
  // param.logical via the chart's subscribeClick) — exact pane coordinates, so there's no offset/misalignment.
  const doPlace = ({ price, x, y }) => {
    if (price == null) return;
    const ts = chartRef.current && chartRef.current.timeScale();
    const fl = ts ? ts.coordinateToLogical(x) : null;        // fractional logical → exact sub-candle position
    const time = (fl != null) ? logicalToTime(fl) : 0;
    if (tool === "hline") { addDrawing({ type: "hline", a: { time, price } }); setTool("cursor"); }
    else if (tool === "trend" || tool === "rect") {
      if (!draft) setDraft({ time, price });
      else { addDrawing({ type: tool, a: draft, b: { time, price } }); setDraft(null); setTool("cursor"); }
    } else if (tool === "text") {
      setEditingText({ id: `d${Date.now()}${Math.random().toString(36).slice(2, 6)}`, x, y, value: "", a: { time, price } });
    }
  };
  // Keep chart-level subscriptions (created once in the build effect) pointed at the freshest closures
  useEffect(() => { placeRef.current = doPlace; });
  useEffect(() => { draftRef.current = draft; }, [draft]);
  const commitText = () => {
    if (!editingText) return;
    const v = (editingText.value || "").trim();
    if (v) setDrawings(ds => [...ds, { id: editingText.id, type: "text", a: editingText.a, text: v }]);
    setEditingText(null); setTool("cursor");
  };
  const selectDrawing = (e, id) => { e.stopPropagation(); if (tool === "cursor") setSelectedId(id); };
  // Render one persisted drawing as SVG
  const renderDrawing = (d) => {
    const sel = d.id === selectedId;
    const stroke = sel ? C.goldBright : "rgba(240,192,80,0.85)";
    const pw = paneW();
    if (d.type === "hline") {
      const y = priceToY(d.a.price); if (y == null) return null;
      return (<g key={d.id} style={{ pointerEvents: tool === "cursor" ? "auto" : "none", cursor: "pointer" }} onClick={(e) => selectDrawing(e, d.id)}>
        <line x1={0} y1={y} x2={pw} y2={y} stroke="transparent" strokeWidth={10} />
        <line x1={0} y1={y} x2={pw} y2={y} stroke={stroke} strokeWidth={sel ? 2 : 1.5} />
        <rect x={pw - 56} y={y - 8} width={52} height={15} rx={3} fill={stroke} />
        <text x={pw - 30} y={y + 3} fill="#08080e" fontSize={9} fontWeight={700} textAnchor="middle" fontFamily={font}>{d.a.price.toFixed(2)}</text>
      </g>);
    }
    if (d.type === "trend") {
      const x1 = timeToX(d.a.time), y1 = priceToY(d.a.price), x2 = timeToX(d.b.time), y2 = priceToY(d.b.price);
      if ([x1, y1, x2, y2].some(v => v == null)) return null;
      return (<g key={d.id} style={{ pointerEvents: tool === "cursor" ? "auto" : "none", cursor: "pointer" }} onClick={(e) => selectDrawing(e, d.id)}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={10} />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={sel ? 2.5 : 2} />
        {sel && <><circle cx={x1} cy={y1} r={4} fill={C.goldBright} stroke="#08080e" strokeWidth={1} /><circle cx={x2} cy={y2} r={4} fill={C.goldBright} stroke="#08080e" strokeWidth={1} /></>}
      </g>);
    }
    if (d.type === "rect") {
      const x1 = timeToX(d.a.time), y1 = priceToY(d.a.price), x2 = timeToX(d.b.time), y2 = priceToY(d.b.price);
      if ([x1, y1, x2, y2].some(v => v == null)) return null;
      const rx = Math.min(x1, x2), ry = Math.min(y1, y2), rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
      return (<g key={d.id} style={{ pointerEvents: tool === "cursor" ? "auto" : "none", cursor: "pointer" }} onClick={(e) => selectDrawing(e, d.id)}>
        <rect x={rx} y={ry} width={rw} height={rh} fill="rgba(240,192,80,0.10)" stroke={stroke} strokeWidth={sel ? 2 : 1.5} />
      </g>);
    }
    if (d.type === "text") {
      const x = timeToX(d.a.time), y = priceToY(d.a.price); if (x == null || y == null) return null;
      return (<g key={d.id} style={{ pointerEvents: tool === "cursor" ? "auto" : "none", cursor: "pointer" }} onClick={(e) => selectDrawing(e, d.id)}
        onDoubleClick={(e) => { e.stopPropagation(); setEditingText({ id: d.id, x, y, value: d.text, a: d.a }); setDrawings(ds => ds.filter(z => z.id !== d.id)); setTool("text"); }}>
        <text x={x} y={y} fill={sel ? C.goldBright : C.white} stroke="#08080e" strokeWidth={3} style={{ paintOrder: "stroke" }} fontSize={12} fontWeight={700} fontFamily={font}>{d.text}</text>
      </g>);
    }
    return null;
  };

  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
      {/* Toolbar — symbol · timeframe switcher · chart controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: "0.7rem", color: C.white }}>{trade.ticker}</span>
          <span style={{ fontSize: "0.5rem", fontWeight: 700, padding: "2px 7px", borderRadius: 980, background: isShort ? C.redDim : C.greenDim, color: isShort ? C.red : C.green, border: `1px solid ${isShort ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.3)"}` }}>{isShort ? "SHORT" : "LONG"}</span>
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
            {CHART_TFS.map(([label, res]) => (
              <button key={res} onClick={() => setTf(res)} title={`Switch to ${label} candles`} style={{ padding: "4px 9px", background: activeRes === res ? C.goldDim : "transparent", border: "none", borderRight: `1px solid ${C.border}`, color: activeRes === res ? C.gold : C.muted, fontWeight: 700, fontSize: "0.6rem", cursor: "pointer", fontFamily: font }}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => setMaOn(v => !v)} title="Toggle moving averages (10 / 20 / 50)" style={tb(maOn)}>MA</button>
          <button onClick={() => setMaType(t => t === "SMA" ? "EMA" : "SMA")} title="Switch between simple and exponential moving averages" style={tb(false)}>{maType}</button>
          <button onClick={() => setVolOn(v => !v)} title="Toggle volume + 50-period volume average" style={tb(volOn)}>Vol</button>
          <button onClick={() => setLogScale(l => !l)} title="Toggle logarithmic price scale" style={tb(logScale)}>Log</button>
          <button onClick={() => chartRef.current && chartRef.current.timeScale().fitContent()} title="Fit chart to data" style={tb(false)}>Fit</button>
        </div>
      </div>
      {/* Contextual drawing hint */}
      <div style={{ minHeight: 16, marginBottom: 6, fontSize: "0.55rem", color: C.gold, fontWeight: 600 }}>
        {tool === "trend" && (draft ? "Trendline — click the second point" : "Trendline — click the first point")}
        {tool === "rect" && (draft ? "Rectangle — click the opposite corner" : "Rectangle — click the first corner")}
        {tool === "hline" && "Horizontal line — click to drop a level"}
        {tool === "text" && "Text — click where you want the label, then type"}
        {tool === "cursor" && selectedId != null && <span style={{ color: C.muted }}>Selected — press Delete to remove, or click empty space to deselect</span>}
      </div>
      {/* Drawing rail (left) + chart + stats panel */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {/* TradingView-style vertical drawing rail */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "6px 4px", border: `1px solid ${C.border}`, borderRadius: 9, background: "rgba(255,255,255,0.02)", alignSelf: "flex-start" }}>
          {railBtn("cursor", "↖", "Cursor — pan, zoom, select a drawing")}
          {railBtn("trend", "╱", "Trendline — click two points")}
          {railBtn("hline", "─", "Horizontal line — click to place a level")}
          {railBtn("rect", "▭", "Rectangle / zone — click two corners")}
          {railBtn("text", "T", "Text — click to place a label, then type")}
          <div style={{ height: 1, background: C.border, margin: "3px 2px" }} />
          {selectedId != null
            ? <button onClick={() => { setDrawings(ds => ds.filter(d => d.id !== selectedId)); setSelectedId(null); }} title="Delete selected drawing (or press Delete)" style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: `1px solid rgba(239,68,68,0.4)`, background: "transparent", color: C.red, fontSize: "0.95rem", cursor: "pointer", fontFamily: font }}>🗑</button>
            : <button onClick={() => { setDrawings([]); setSelectedId(null); }} title="Clear all drawings" style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: `1px solid transparent`, background: "transparent", color: C.muted, fontSize: "0.95rem", cursor: "pointer", fontFamily: font }}>✕</button>}
        </div>
        <div style={{ flex: "1 1 420px", minWidth: 0 }}>
          <div style={{ position: "relative" }}>
            <div ref={elRef} style={{ width: "100%", minHeight: 480, cursor: tool === "cursor" ? "default" : "crosshair" }}>
              {status !== "ok" && (
                <div style={{ height: 480, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: "0.74rem", textAlign: "center", padding: "0 20px" }}>
                  {status === "loading" && "Loading chart…"}
                  {status === "empty" && "No candle data for this period."}
                  {status === "nolib" && "Chart library didn't load — refresh the page."}
                  {status === "error" && (msg || "Couldn't load the chart.")}
                </div>
              )}
            </div>
            {/* TradingView-style crosshair legend (OHLC + MA values) */}
            {status === "ok" && legend && (
              <div style={{ position: "absolute", top: 8, left: 10, pointerEvents: "none", fontFamily: font, fontSize: "0.6rem", fontWeight: 700, lineHeight: 1.5, textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}>
                <div style={{ color: C.white }}>{trade.ticker} · {CHART_TFS.find(([, r]) => r === activeRes)?.[0] || activeRes}</div>
                <div style={{ color: legend.up ? C.green : C.red }}>
                  O {fmtMA(legend.o)}  H {fmtMA(legend.h)}  L {fmtMA(legend.l)}  C {fmtMA(legend.c)}
                </div>
                {maOn && legend.ma && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ color: MA_COLORS[10] }}>{maType}10 {fmtMA(legend.ma[10])}</span>
                    <span style={{ color: MA_COLORS[20] }}>{maType}20 {fmtMA(legend.ma[20])}</span>
                    <span style={{ color: MA_COLORS[50] }}>{maType}50 {fmtMA(legend.ma[50])}</span>
                  </div>
                )}
              </div>
            )}
            {/* Drawing overlay — render-only SVG pinned to the chart (re-projected on pan/zoom via overlayTick).
                The chart underneath stays fully interactive; clicks/placement come from the chart's own
                subscribeClick, and only drawing shapes (in cursor mode) capture clicks for selection. */}
            {status === "ok" && (
              <svg data-tick={overlayTick} width={chartW} height={CHART_H} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
                {drawings.map(renderDrawing)}
                {draft && hoverPt && (tool === "trend" || tool === "rect") && (() => {
                  const x1 = timeToX(draft.time), y1 = priceToY(draft.price); if (x1 == null || y1 == null) return null;
                  if (tool === "rect") { const rx = Math.min(x1, hoverPt.x), ry = Math.min(y1, hoverPt.y), rw = Math.abs(hoverPt.x - x1), rh = Math.abs(hoverPt.y - y1); return <rect x={rx} y={ry} width={rw} height={rh} fill="rgba(240,192,80,0.08)" stroke={C.goldBright} strokeWidth={1} strokeDasharray="4 4" />; }
                  return <line x1={x1} y1={y1} x2={hoverPt.x} y2={hoverPt.y} stroke={C.goldBright} strokeWidth={1} strokeDasharray="4 4" />;
                })()}
              </svg>
            )}
            {/* Inline text editor */}
            {status === "ok" && editingText && (
              <input autoFocus value={editingText.value} onChange={(e) => setEditingText(t => ({ ...t, value: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") commitText(); else if (e.key === "Escape") { setEditingText(null); setTool("cursor"); } }} onBlur={commitText}
                placeholder="type…" style={{ position: "absolute", left: editingText.x, top: editingText.y - 12, background: "rgba(8,8,14,0.92)", border: `1px solid ${C.borderGold}`, color: C.white, fontFamily: font, fontSize: "0.72rem", fontWeight: 700, padding: "2px 6px", borderRadius: 4, outline: "none", zIndex: 5, minWidth: 90 }} />
            )}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: "0.56rem", color: C.muted, marginTop: 6, flexWrap: "wrap" }}>
            <span>▲ <span style={{ color: C.green }}>Entry</span></span>
            <span>▼ <span style={{ color: C.red }}>Exit</span></span>
            {best && <span>● <span style={{ color: C.goldBright }}>Peak</span></span>}
            {+trade.stop > 0 && <span>— <span style={{ color: C.gold }}>Stop</span></span>}
            {maOn && <span style={{ color: MA_COLORS[10] }}>━ {maType}10/20/50</span>}
            <span style={{ marginLeft: "auto" }}>{tradeDateISO(trade.entry) || trade.entry}{trade.entryTime ? ` ${trade.entryTime}` : ""} → {tradeDateISO(trade.exit) || trade.exit}{trade.exitTime ? ` ${trade.exitTime}` : ""}</span>
          </div>
        </div>
        <div style={{ flex: "1 1 210px", background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", alignSelf: "flex-start" }}>
          <div style={{ fontSize: "0.54rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, marginBottom: 8 }}>Trade Stats</div>
          {statRows.map(([label, val, col], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "5px 0", borderBottom: i < statRows.length - 1 ? `1px solid rgba(255,255,255,0.04)` : "none" }}>
              <span style={{ fontSize: "0.6rem", color: C.muted, whiteSpace: "nowrap" }}>{label}</span>
              <span style={{ fontSize: "0.66rem", fontWeight: 700, color: col || C.white, textAlign: "right" }}>{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const JOUR_CSS = `:root{--bg:#08080e; --bg2:#0c0c14; --white:#ffffff;
    --text:rgba(255,255,255,0.92);
    --muted:rgba(255,255,255,0.70);
    --faint:rgba(255,255,255,0.45);
    --gold:#c9982a; --goldBright:#f0c050; --goldMid:#b8820a; --goldDeep:#7a4f00;
    --goldDim:rgba(201,152,42,0.15); --borderGold:rgba(201,152,42,0.22);
    --glass:rgba(255,255,255,0.042); --border:rgba(255,255,255,0.09);
    --green:#22c55e; --red:#ef4444; --blue:#3b82f6;
    --font:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif;}
.vj *{box-sizing:border-box;margin:0;padding:0}
.vj{background:radial-gradient(1200px 700px at 70% -10%, rgba(201,152,42,0.06), transparent 60%), var(--bg);
    color:var(--text); font-family:var(--font); line-height:1.58; font-size:16px;
    -webkit-font-smoothing:antialiased; min-height:100vh;}
.vj .big,.vj .north .big,.vj .mini .val,.vj .val,.vj .outval,.vj .metricval,.vj .pl,.vj tbody td,.vj .mgr b,.vj .charthint,.vj .edgeval{font-variant-numeric:tabular-nums}
.vj .shell{width:100%; max-width:1240px; margin:0 auto; padding:22px clamp(18px,2.4vw,40px) 80px}
@media(min-width:1500px){
.vj .shell{max-width:1400px} }
@media(min-width:2000px){
.vj .shell{max-width:1680px} }
.vj .card{position:relative; background:var(--glass); border:1px solid var(--border); border-radius:22px;
    backdrop-filter:blur(28px) saturate(160%); -webkit-backdrop-filter:blur(28px) saturate(160%); padding:26px 28px; overflow:hidden}
.vj .card::before{content:''; position:absolute; inset:0; pointer-events:none; background:linear-gradient(135deg, rgba(255,255,255,0.05), transparent 55%)}
.vj .eyebrow{font-size:0.64rem; font-weight:700; letter-spacing:0.17em; text-transform:uppercase; color:var(--gold)}
.vj .h1{font-size:clamp(1.55rem,3vw,2.05rem); font-weight:800; letter-spacing:-0.04em; color:var(--white)}
.vj .goldname{color:var(--goldBright)}
.vj .sub{font-size:0.82rem; color:var(--muted); max-width:600px; margin-top:6px}
.vj .reveal .h1{opacity:0; transform:translateY(14px)}
.vj .reveal .sub{opacity:0}
.vj .reveal.in-view .h1{animation:hRise 0.42s cubic-bezier(0.22,1,0.36,1) both}
.vj .reveal.in-view .sub{animation:hFade 0.48s ease-out 0.2s both}
@keyframes hRise{from{opacity:0; transform:translateY(14px)}to{opacity:1; transform:translateY(0)}}
@keyframes hFade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion: reduce){
.vj .reveal .h1,.vj .reveal .sub{animation:none !important; opacity:1; transform:none}
  }
.vj .label{font-size:0.62rem; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:var(--muted)}
.vj .sech{font-size:0.95rem; font-weight:800; letter-spacing:-0.02em; color:var(--white)}
.vj .row{display:flex; align-items:center; gap:14px; flex-wrap:wrap}
.vj .spacer{flex:1}
.vj .navbar{display:flex; align-items:center; gap:16px; margin-bottom:26px}
.vj .brand{display:flex; align-items:center; gap:9px; font-weight:800; letter-spacing:-0.01em; color:var(--white); font-size:0.95rem}
.vj .brand .vmark{width:24px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,var(--goldMid),var(--goldBright)); color:#0a0a0a; font-weight:800; font-size:0.8rem}
.vj .tabs{display:inline-flex; gap:4px; background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:980px; padding:4px}
.vj .tabs a{text-decoration:none; color:var(--muted); font-size:0.78rem; font-weight:700; padding:7px 18px; border-radius:980px}
.vj .tabs a.on{background:var(--goldDim); color:var(--goldBright)}
.vj .tabs a:hover:not(.on){color:var(--text)}
.vj .term{border-bottom:1px dotted var(--borderGold); cursor:help; position:relative}
.vj .term .plain{color:var(--faint); font-weight:500}
.vj .term:hover::after{content:attr(data-tip); position:absolute; left:0; top:140%; width:240px; background:#11111b;
    border:1px solid var(--borderGold); border-radius:12px; padding:10px 12px; font-size:0.72rem; font-weight:400;
    letter-spacing:0; text-transform:none; color:var(--text); z-index:30; box-shadow:0 14px 40px rgba(0,0,0,0.55); line-height:1.45; white-space:pre-line}
.vj .term.tipright:hover::after{left:auto; right:0}
.vj .seg{display:inline-flex; border:1px solid var(--border); border-radius:980px; padding:3px; gap:2px; background:rgba(255,255,255,0.02)}
.vj .seg button{border:none; background:transparent; color:var(--muted); cursor:pointer; font-family:var(--font); font-size:0.74rem;
    font-weight:700; padding:7px 16px; border-radius:980px; letter-spacing:0.02em; transition:all .15s}
.vj .seg button.on{background:var(--goldDim); color:var(--goldBright)}
.vj .seg button.locked{opacity:0.4; cursor:not-allowed}
.vj .seg button.locked::before{content:"🔒 "; font-size:0.7em}
.vj .filterbar{display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-bottom:20px;
    border:1px solid var(--border); border-radius:16px; padding:12px 16px; background:rgba(255,255,255,0.025)}
.vj .filterbar .flabel{display:inline-flex; align-items:center; gap:7px; color:var(--goldBright); font-weight:800;
    font-size:0.74rem; text-transform:uppercase; letter-spacing:0.09em}
.vj .fctl{display:inline-flex; align-items:center; gap:8px; color:var(--muted); font-size:0.72rem;
    text-transform:uppercase; letter-spacing:0.06em; font-weight:700}
.vj .filtsel{font-family:var(--font); font-size:0.82rem; font-weight:700; color:var(--text); text-transform:none;
    letter-spacing:0; background:rgba(255,255,255,0.04); border:1px solid var(--border); border-radius:980px;
    padding:7px 13px; cursor:pointer; transition:all .15s}
.vj .filtsel:hover{border-color:var(--borderGold)}
.vj .filtsel.active{border-color:var(--borderGold); color:var(--goldBright); background:var(--goldDim)}
.vj .fcount{color:var(--muted); font-size:0.78rem; font-weight:600; font-variant-numeric:tabular-nums}
.vj .filterbar .btn{padding:7px 14px; font-size:0.74rem}
.vj .nodata{padding:26px; text-align:center; color:var(--muted); font-size:0.86rem}
.vj .btn{border:1px solid var(--border); background:rgba(255,255,255,0.03); color:var(--text); font-family:var(--font);
    font-size:0.74rem; font-weight:700; padding:8px 16px; border-radius:980px; cursor:pointer}
.vj .btn.gold{background:linear-gradient(120deg,var(--goldMid),var(--goldBright),var(--goldDeep)); color:#0a0a0a; border:none; box-shadow:0 6px 18px rgba(201,152,42,0.25)}
.vj .status{display:inline-flex; align-items:center; gap:7px; font-size:0.7rem; font-weight:700; padding:6px 12px; border-radius:980px; letter-spacing:0.02em}
.vj .status .d{width:7px;height:7px;border-radius:50%}
.vj .st-win{background:rgba(34,197,94,0.12); color:#86efac; border:1px solid rgba(34,197,94,0.3)}
.vj .st-win .d{background:var(--green)}
.vj .st-loss{background:rgba(239,68,68,0.12); color:#fda4a4; border:1px solid rgba(239,68,68,0.3)}
.vj .st-loss .d{background:var(--red)}
.vj .tag{display:inline-block; font-size:0.68rem; font-weight:600; color:var(--muted); background:rgba(255,255,255,0.05); border:1px solid var(--border); border-radius:7px; padding:3px 9px}
.vj .jhero{display:grid; grid-template-columns:1.4fr 1fr; gap:18px; margin-top:8px; align-items:start}
.vj .north{display:flex; flex-direction:column; justify-content:center;
    background:linear-gradient(140deg, rgba(34,197,94,0.10), transparent 70%); border:1px solid rgba(34,197,94,0.22)}
.vj .north .big{font-size:clamp(2.4rem,6vw,3.6rem); font-weight:800; letter-spacing:-0.045em; color:var(--green); line-height:1; margin-top:8px;
    align-self:flex-start; min-width:8ch}
.vj .north .meta{font-size:0.78rem; color:var(--muted); margin-top:10px}
.vj .spark{width:100%; height:50px; margin-top:16px; display:block}
.vj .sparklabel{font-size:0.64rem; color:var(--faint); margin-top:5px; text-transform:uppercase; letter-spacing:0.1em; font-weight:600}
.vj .edge{display:flex; flex-direction:column; justify-content:center}
.vj .edgehead{display:flex; align-items:center; gap:9px; margin-bottom:10px}
.vj .edgedot{width:8px;height:8px;border-radius:50%;background:var(--green);box-shadow:0 0 10px var(--green)}
.vj .reveal.in-view .edgedot{animation:edgeBlink 1.7s ease-in-out infinite}
@keyframes edgeBlink{0%,100%{opacity:1; box-shadow:0 0 10px var(--green)}50%{opacity:0.2; box-shadow:0 0 4px rgba(34,197,94,0.35)}}
.vj .edgetitle{font-size:0.72rem; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:var(--muted)}
.vj .edgebody{font-size:0.92rem; line-height:1.5; color:var(--text)}
.vj .edgebody b{color:var(--goldBright); font-weight:700}
.vj .edgerow{display:flex; gap:22px; margin-top:14px; flex-wrap:wrap}
.vj .edgestat .edgeval{font-size:1.35rem; font-weight:800; letter-spacing:-0.03em}
.vj .edgestat .edgek{font-size:0.62rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--muted); margin-top:2px}
.vj .edgeproj{margin-top:16px; padding-top:15px; border-top:1px dashed var(--borderGold)}
.vj .projlabel{font-size:0.72rem; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:var(--muted)}
.vj .projlabel b{color:var(--goldBright); font-weight:800}
.vj .projrow{display:flex; gap:22px; margin-top:10px; flex-wrap:wrap}
.vj .projstat .projval{font-size:1.5rem; font-weight:800; letter-spacing:-0.03em}
.vj .projstat .projval.green{color:var(--green)}
.vj .projstat .projval.red{color:var(--red)}
.vj .projnote{font-size:0.72rem; color:var(--muted); margin-top:10px; line-height:1.45}
.vj.expert .projnote{display:none}
/* small-sample "early read" caveat — gold/caution tone (not red error). Stays visible in expert mode. */
.vj .projprovis{display:flex; align-items:center; gap:9px; margin-top:12px; padding:9px 12px; border-radius:11px; background:var(--goldDim); border:1px solid var(--borderGold); font-size:0.72rem; color:var(--text); line-height:1.45}
.vj .provischip{flex:none; font-size:0.56rem; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; padding:3px 9px; border-radius:980px; background:var(--goldMid); color:#1a1205; white-space:nowrap}
.vj .projprovis b{color:var(--goldBright); font-weight:800}
.vj .filterbar .daterange{display:inline-flex; align-items:center; gap:8px}
.vj .filterbar input[type=date].filtsel{padding:6px 9px; color-scheme:dark}
.vj .vachip{font-size:0.66rem; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:var(--goldBright);
    border:1px solid var(--borderGold); background:var(--goldDim); padding:6px 12px; border-radius:980px}
.vj .vagrid{display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; margin-top:6px}
@media (max-width:880px){
.vj .vagrid{grid-template-columns:1fr} }
.vj .vacard{padding:22px 22px}
.vj .varecap{display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-top:14px}
.vj .vastat{background:rgba(255,255,255,0.035); border:1px solid var(--border); border-radius:13px; padding:13px 14px}
.vj .vak{font-size:0.6rem; text-transform:uppercase; letter-spacing:0.12em; color:var(--muted); font-weight:700}
.vj .vav{font-size:1.32rem; font-weight:800; letter-spacing:-0.03em; margin-top:6px}
.vj .vav.green{color:var(--green)}
.vj .vav.red{color:var(--red)}
.vj .vav.gold{color:var(--goldBright)}
.vj .vasub{font-size:0.66rem; color:var(--muted); margin-top:3px}
.vj .vacommentary{font-size:0.9rem; line-height:1.55; color:var(--text); margin-top:16px; padding:13px 15px;
    background:rgba(201,152,42,0.06); border-left:2px solid var(--gold); border-radius:0 10px 10px 0}
.vj .vacommentary b{color:var(--goldBright); font-weight:700}
.vj .vatagline{margin-top:16px}
.vj .vatags{display:flex; flex-wrap:wrap; gap:7px; margin-top:8px}
.vj .vatag{font-size:0.7rem; font-weight:700; color:var(--text); background:rgba(255,255,255,0.05);
    border:1px solid var(--border); border-radius:980px; padding:4px 11px}
.vj .vatag b{color:var(--goldBright); font-weight:800; margin-left:5px}
.vj .valist{list-style:none; margin:14px 0 0; padding:0; display:flex; flex-direction:column; gap:12px}
.vj .valist li{display:flex; gap:11px; font-size:0.88rem; line-height:1.5; color:var(--text)}
.vj .valist li .ic{flex:none; width:22px; height:22px; border-radius:7px; display:flex; align-items:center; justify-content:center;
    font-size:0.78rem; font-weight:800; margin-top:1px}
.vj .valist li .ic.pos{background:rgba(34,197,94,0.16); color:#86efac}
.vj .valist li .ic.neg{background:rgba(239,68,68,0.16); color:#fca5a5}
.vj .valist li .ic.tip{background:var(--goldDim); color:var(--goldBright)}
.vj .valist li b{color:var(--goldBright); font-weight:700}
.vj .vatrades{display:flex; flex-direction:column; gap:9px; margin-top:14px}
.vj .varow{display:flex; align-items:center; gap:12px; padding:11px 13px; border-radius:11px;
    background:rgba(255,255,255,0.035); border:1px solid var(--border)}
.vj .varow .vtk{font-weight:800; font-size:0.92rem; min-width:54px}
.vj .varow .vsetup{font-size:0.72rem; color:var(--muted); flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.vj .varow .vret{font-weight:800; font-size:0.86rem; text-align:right; min-width:62px}
.vj .varow .vpl{font-weight:800; font-size:0.86rem; text-align:right; min-width:78px}
.vj .varow.win{border-left:3px solid var(--green)}
.vj .varow.loss{border-left:3px solid var(--red)}
.vj .varow .green{color:var(--green)}
.vj .varow .red{color:var(--red)}
.vj .vaempty{font-size:0.82rem; color:var(--muted); padding:14px 4px}
.vj .vaseg button{font-size:0.66rem; padding:6px 12px}
.vj .edgediag{margin-top:16px; padding:14px 16px; background:rgba(239,68,68,0.07); border:1px solid rgba(239,68,68,0.28); border-radius:13px}
.vj .edgediag .dq{font-size:0.88rem; line-height:1.55; color:var(--text); font-weight:600}
.vj .edgediag .dq b{color:#fca5a5; font-weight:800}
.vj .edgelevers{display:flex; flex-direction:column; gap:8px; margin-top:13px}
.vj .edgelever{display:flex; gap:11px; align-items:flex-start; font-size:0.8rem; line-height:1.45; color:var(--muted);
    padding:9px 11px; border-radius:10px; background:rgba(255,255,255,0.03); border:1px solid var(--border)}
.vj .edgelever.focus{border-color:var(--borderGold); background:var(--goldDim); color:var(--text)}
.vj .edgelever .lk{flex:none; font-weight:800; font-size:0.6rem; text-transform:uppercase; letter-spacing:0.07em; color:var(--goldBright); min-width:86px; margin-top:1px}
.vj .edgelever.focus .lk{color:var(--goldBright)}
.vj .edgelever b{color:var(--text); font-weight:700}
.vj .edgeadmin{margin-top:12px; padding:12px 14px; border-radius:11px; background:var(--goldDim); border:1px solid var(--borderGold);
    font-size:0.82rem; line-height:1.5; color:var(--text)}
.vj .edgeadmin b{color:var(--goldBright); font-weight:800}
.vj .herocol{display:flex; flex-direction:column; gap:18px; min-width:0}
.vj .supportcard{position:relative; padding:18px 20px; border-radius:16px; border:1px solid var(--borderGold);
    background:linear-gradient(150deg, rgba(201,152,42,0.09), rgba(255,255,255,0.02) 60%)}
.vj .supportgrid{display:grid; grid-template-columns:1fr; gap:16px}
.vj .supportblock{display:flex; gap:14px; align-items:flex-start}
.vj .supicon{flex:none; width:42px; height:42px; border-radius:12px; display:flex; align-items:center; justify-content:center;
    font-size:1.25rem; background:var(--goldDim); border:1px solid var(--borderGold)}
.vj .suptitle{font-size:0.92rem; font-weight:800; letter-spacing:-0.01em; color:var(--white); padding-right:26px}
.vj .supbody{font-size:0.82rem; line-height:1.6; color:var(--muted); margin-top:6px}
.vj .supbody b{color:var(--goldBright); font-weight:700}
.vj .supbtn{display:inline-block; margin-top:11px; font-size:0.74rem; font-weight:800; color:var(--goldBright);
    background:var(--goldDim); border:1px solid var(--borderGold); border-radius:980px; padding:8px 16px;
    text-decoration:none; transition:background .15s}
.vj .supbtn:hover{background:rgba(201,152,42,0.2)}
.vj .winsharecard{position:relative; padding:18px 20px; border-radius:16px; border:1px solid rgba(34,197,94,0.34);
    background:linear-gradient(150deg, rgba(34,197,94,0.13), rgba(255,255,255,0.02) 60%); animation:winRise 0.5s cubic-bezier(0.22,1,0.36,1) both}
@keyframes winRise{from{opacity:0; transform:translateY(10px)} to{opacity:1; transform:none}}
.vj .winshareblock{display:flex; gap:14px; align-items:flex-start}
.vj .winshareicon{flex:none; width:42px; height:42px; border-radius:12px; display:flex; align-items:center; justify-content:center;
    font-size:1.25rem; background:rgba(34,197,94,0.15); border:1px solid rgba(34,197,94,0.34); overflow:visible}
.vj .winemoji{display:inline-block; transform-origin:70% 70%; animation:winCheer 1.6s ease-in-out infinite}
@keyframes winCheer{0%,100%{transform:rotate(0deg) scale(1)}15%{transform:rotate(-16deg) scale(1.12)}30%{transform:rotate(14deg) scale(1.12)}45%{transform:rotate(-10deg) scale(1.06)}60%{transform:rotate(8deg) scale(1.06)}75%{transform:rotate(-4deg) scale(1.02)}}
@media (prefers-reduced-motion: reduce){ .vj .winemoji{animation:none} }
.vj .winsharetitle{font-size:0.92rem; font-weight:800; letter-spacing:-0.01em; color:var(--white); padding-right:26px}
.vj .winsharebody{font-size:0.82rem; line-height:1.6; color:var(--muted); margin-top:6px}
.vj .winsharebody b{color:#86efac; font-weight:700}
.vj .winsharebtn{display:inline-block; margin-top:12px; font-size:0.74rem; font-weight:800; color:#08080e;
    background:var(--green); border:1px solid rgba(34,197,94,0.5); border-radius:980px; padding:8px 16px;
    text-decoration:none; cursor:pointer; font-family:var(--font); transition:filter .15s}
.vj .winsharebtn:hover{filter:brightness(1.08)}
.vj .winsharebtn:disabled{cursor:wait; filter:none; opacity:0.7}
.vj .seemore{color:var(--goldBright); font-weight:700; cursor:pointer; white-space:nowrap}
.vj .seemore:hover{text-decoration:underline}
.vj .winshare-x{position:absolute; top:12px; right:12px; width:26px; height:26px; border-radius:8px; cursor:pointer;
    display:flex; align-items:center; justify-content:center; background:transparent; border:1px solid var(--border);
    color:var(--muted); font-size:0.82rem; line-height:1; font-family:var(--font); transition:background .15s,color .15s,border-color .15s}
.vj .winshare-x:hover{background:rgba(255,255,255,0.06); color:var(--white); border-color:var(--muted)}
.vj .disthead{display:flex; align-items:center; gap:10px; cursor:pointer; user-select:none}
.vj .disthead .chev2{margin-left:auto; color:var(--muted); font-size:0.72rem; transition:transform .2s}
.vj .disthead.open .chev2{transform:rotate(180deg)}
.vj .disthint2{font-size:0.62rem; color:var(--goldBright); font-weight:700}
.vj .distpanel{display:grid; grid-template-rows:0fr; opacity:0; margin-top:0; padding-top:0; border-top:1px solid transparent;
    transition:grid-template-rows .8s cubic-bezier(0.22,1,0.36,1), opacity .6s ease, margin-top .8s ease, padding-top .8s ease, border-top-color .8s ease}
.vj .distpanel.open{grid-template-rows:1fr; opacity:1; margin-top:16px; padding-top:16px; border-top-color:var(--border);
    transition:grid-template-rows 1.2s cubic-bezier(0.22,1,0.36,1), opacity .85s ease, margin-top 1.2s ease, padding-top 1.2s ease, border-top-color 1.2s ease}
.vj .distpanel .distpanel-inner{overflow:hidden; min-height:0}
.vj .disttoolbar{display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; align-items:center}
.vj .distbtn{font-family:var(--font); font-size:0.62rem; font-weight:700; color:var(--muted); cursor:pointer;
    background:rgba(255,255,255,0.04); border:1px solid var(--border); border-radius:8px; padding:7px 13px}
.vj .distbtn.on,.vj .distbtn:hover{color:var(--gold); border-color:var(--borderGold); background:var(--goldDim)}
.vj .distsum{display:grid; grid-template-columns:repeat(auto-fit,minmax(118px,1fr)); gap:11px; margin-bottom:16px}
.vj .distsum .ds{background:rgba(255,255,255,0.035); border:1px solid var(--border); border-radius:11px; padding:11px 13px}
.vj .distsum .dsk{font-size:0.56rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--muted); font-weight:700}
.vj .distsum .dsv{font-size:1.12rem; font-weight:800; margin-top:4px; letter-spacing:-0.02em}
.vj .distsum .dsv.green{color:var(--green)}
.vj .distsum .dsv.red{color:var(--red)}
.vj .disttable{width:100%; border-collapse:collapse; font-size:0.72rem}
.vj .disttable th{text-align:right; padding:7px 8px; font-size:0.54rem; text-transform:uppercase; letter-spacing:0.07em;
    color:var(--muted); font-weight:700; border-bottom:1px solid var(--border)}
.vj .disttable th:first-child{text-align:left}
.vj .disttable td{padding:5px 8px; text-align:right; border-bottom:1px solid rgba(255,255,255,0.04)}
.vj .disttable td:first-child{text-align:left; color:var(--text); font-weight:600}
.vj .disttable td.g{color:var(--green); font-weight:700}
.vj .disttable td.r{color:var(--red); font-weight:700}
.vj .distin{width:46px; padding:4px 5px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
    border-radius:6px; color:var(--white); font-size:0.72rem; font-family:var(--font); text-align:center; outline:none}
.vj .distin:focus{border-color:var(--goldBright)}
.vj .distin.edited{border-color:var(--gold); background:rgba(201,152,42,0.12)}
.vj .distnote{font-size:0.7rem; color:var(--muted); margin-top:12px; line-height:1.45}
.vj .distopenlink{color:var(--goldBright); font-weight:700; cursor:pointer; text-decoration:underline;
    text-decoration-color:var(--borderGold); text-underline-offset:3px; transition:text-decoration-color .15s}
.vj .distopenlink:hover{text-decoration-color:var(--goldBright)}
.vj .streak{display:inline-flex; align-items:center; gap:7px; font-size:0.72rem; font-weight:700; color:#86efac;
    background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.28); border-radius:980px; padding:5px 12px;
    opacity:0; transform:translateY(12px)}
.vj .reveal.in-view .streak{animation:streakRise 0.5s cubic-bezier(0.22,1,0.36,1) both, streakGlow 2.4s ease-in-out 0.5s infinite}
@keyframes streakRise{from{opacity:0; transform:translateY(12px)}to{opacity:1; transform:translateY(0)}}
@keyframes streakGlow{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}50%{box-shadow:0 0 14px 1px rgba(34,197,94,0.45)}}
.vj .metrics{display:grid; grid-template-columns:repeat(auto-fit,minmax(155px,1fr)); gap:14px; margin-top:18px}
.vj .mtile{background:var(--glass); border:1px solid var(--border); border-radius:16px; padding:16px 17px;
    cursor:grab; transition:box-shadow .15s, border-color .15s, opacity .12s; position:relative}
.vj .mtile:hover{border-color:var(--borderGold)}
.vj .mtile::after{content:"⠿"; position:absolute; top:11px; right:13px; color:var(--muted); font-size:0.78rem;
    opacity:0; transition:opacity .15s; pointer-events:none; letter-spacing:-1px}
.vj .mtile:hover::after{opacity:0.45}
.vj .mtile.dragging{opacity:0.4; cursor:grabbing; border-color:var(--borderGold)}
.vj .mtile.dragging *{pointer-events:none}
.vj .mtile .label{margin-bottom:9px}
.vj .metricval{font-size:1.5rem; font-weight:800; letter-spacing:-0.035em; color:var(--white)}
.vj .metricval.green{color:var(--green)}
.vj .metricval.red{color:var(--red)}
.vj .metricval.gold{color:var(--goldBright)}
.vj .msub{font-size:0.68rem; color:var(--faint); margin-top:5px}
.vj .perfhdr{display:flex; align-items:center; gap:14px; width:100%; background:transparent; border:none; cursor:pointer;
    font-family:var(--font); padding:0; margin:34px 0 14px; text-align:left}
.vj .perfhdr .chev{margin-left:auto; color:var(--gold); font-size:1.35rem; line-height:1; transition:transform .2s}
.vj .perfhdr[aria-expanded="false"] .chev{transform:rotate(-90deg)}
.vj .collapsible.is-collapsed{display:none}
/* No-wrap flex so the half→full expansion animates smoothly: collapsing the equity column
   (flex-grow 1→0 + fade) lets the distribution column grow from 50% to full width with no wrap jump. */
.vj .chartrow{display:flex; gap:30px; margin-top:34px; align-items:flex-start; transition:gap .7s cubic-bezier(0.22,1,0.36,1)}
.vj .chartrow .chartcol{flex:1 1 0; min-width:0; transition:flex-grow .7s cubic-bezier(0.22,1,0.36,1), opacity .45s ease}
.vj .chartrow.dist-open{gap:0}
.vj .chartrow.dist-open .eqcol{flex-grow:0; opacity:0; overflow:hidden}
.vj .chartrow .perfhdr{margin-top:0}
@media (max-width:860px){
.vj .chartrow{flex-wrap:wrap}
.vj .chartrow .chartcol{flex-basis:100%; flex-grow:1}
.vj .chartrow.dist-open .eqcol{flex-grow:1; opacity:1; overflow:visible} }
.vj .chartwrap{display:flex; gap:14px; margin-top:8px}
.vj .yaxis{display:flex; flex-direction:column; justify-content:space-between; font-size:0.64rem; color:var(--faint);
    font-variant-numeric:tabular-nums; min-width:44px; text-align:right; padding:2px 0}
.vj .plot{flex:1; position:relative; height:256px}
.vj .eqsvg{width:100%; height:100%; display:block}
.vj .eqcross{position:absolute; top:0; bottom:0; width:0; border-left:1px dashed var(--borderGold); pointer-events:none; display:none; z-index:2}
.vj .eqdot{position:absolute; width:11px; height:11px; border-radius:50%; background:var(--goldBright); border:2px solid var(--bg2);
    transform:translate(-50%,-50%); pointer-events:none; display:none; z-index:3; box-shadow:0 0 10px rgba(240,192,80,0.7)}
.vj .eqtip{position:absolute; transform:translate(-50%,-118%); background:rgba(12,12,20,0.96); border:1px solid var(--borderGold);
    border-radius:9px; padding:7px 11px; pointer-events:none; white-space:nowrap; display:none; z-index:4;
    box-shadow:0 10px 30px rgba(0,0,0,0.55)}
.vj .eqtip .tt{font-size:0.58rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted)}
.vj .eqtip .tv{font-size:0.86rem; font-weight:800; letter-spacing:-0.02em; margin-top:2px; font-variant-numeric:tabular-nums}
.vj .eqtip .td{font-size:0.62rem; margin-top:2px; font-variant-numeric:tabular-nums}
.vj .eqtip .td.g{color:var(--green)}
.vj .eqtip .td.r{color:var(--red)}
.vj .grid{stroke:rgba(255,255,255,0.06); stroke-width:1}
.vj .xaxis{display:flex; justify-content:space-between; font-size:0.62rem; color:var(--faint); margin-top:9px; padding-left:52px}
.vj .xaxis.nopad{padding-left:0}
.vj .charthint{font-size:0.74rem; color:var(--muted); margin-top:13px; line-height:1.5}
.vj .charthint .g{color:var(--goldBright); font-weight:700}
.vj .charthint .rd{color:var(--red); font-weight:700}
.vj .bars{position:relative; display:flex; gap:10px; height:230px; margin-top:8px; align-items:stretch}
.vj .zeroline{position:absolute; left:0; right:0; top:50%; border-top:1px dashed var(--border)}
.vj .barcol{flex:1; display:flex; flex-direction:column}
.vj .barcol .up{flex:1; display:flex; align-items:flex-end; justify-content:center}
.vj .barcol .down{flex:1; display:flex; align-items:flex-start; justify-content:center}
.vj .bar{width:64%; min-width:8px; max-width:44px; transition:opacity .15s; will-change:transform}
.vj .barcol:hover .bar{opacity:0.8}
.vj .bar.pos{background:linear-gradient(180deg,var(--green),rgba(34,197,94,0.45)); border-radius:5px 5px 0 0;
    transform-origin:bottom; transform:scaleY(0); opacity:0}
.vj .bar.neg{background:linear-gradient(180deg,rgba(239,68,68,0.45),var(--red)); border-radius:0 0 5px 5px;
    transform-origin:top; transform:scaleY(0); opacity:0}
.vj .reveal.in-view .bar.pos,.vj .reveal.in-view .bar.neg{animation:barRise 0.55s cubic-bezier(0.22,1,0.36,1) both}
@keyframes barRise{from{transform:scaleY(0); opacity:0}to{transform:scaleY(1); opacity:1}}
.vj #eqRise,.vj #heroRise{transform-box:fill-box; transform-origin:bottom}
.vj .reveal.in-view #eqRise{animation:eqRise 1.05s cubic-bezier(0.22,1,0.36,1) both}
.vj .reveal.in-view #heroRise{animation:eqRise 0.95s cubic-bezier(0.22,1,0.36,1) both}
@keyframes eqRise{from{transform:scaleY(0); opacity:0.35}to{transform:scaleY(1); opacity:1}}
@media (prefers-reduced-motion: reduce){
.vj .edgedot,.vj .streak,.vj .bar.pos,.vj .bar.neg,.vj #eqRise,.vj #heroRise{animation:none !important}
.vj .streak{opacity:1; transform:none}
.vj .bar.pos,.vj .bar.neg{transform:none; opacity:1}
.vj #eqRise,.vj #heroRise{transform:none; opacity:1}
  }
.vj .distx{display:flex; justify-content:space-between; font-size:0.6rem; color:var(--faint); margin-top:8px}
.vj .toolbar{display:flex; align-items:center; gap:10px; margin:6px 0 14px; flex-wrap:wrap}
.vj table{width:100%; border-collapse:collapse}
.vj thead th{font-size:0.6rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:var(--muted);
    text-align:right; padding:12px 14px; border-bottom:1px solid var(--border)}
.vj thead th:first-child,.vj thead th:nth-child(2){text-align:left}
.vj tbody td{padding:14px 14px; text-align:right; border-bottom:1px solid rgba(255,255,255,0.06); font-size:0.84rem}
.vj tbody td:first-child,.vj tbody td:nth-child(2){text-align:left}
.vj tbody tr.traderow:hover{background:rgba(255,255,255,0.025)}
.vj .tick{font-weight:800; letter-spacing:-0.01em; font-size:0.92rem; display:flex; align-items:center; gap:9px}
.vj .srcdot{width:7px;height:7px;border-radius:50%}
.vj .srcdot.ibkr{background:var(--goldBright); box-shadow:0 0 8px var(--goldBright)}
.vj .srcdot.man{background:rgba(255,255,255,0.28)}
.vj .pl.up{color:var(--green); font-weight:700}
.vj .pl.dn{color:var(--red); font-weight:700}
.vj .pro-only{display:none}
.vj.pro .pro-only{display:table-cell}
/* Freeze the Review (action) column to the right edge so it's never cropped when the table is wider
   than the card — happens in Pro view and especially at Text Size = Large (zoom 1.15). */
.vj .revcell{text-align:right; white-space:nowrap; position:sticky; right:0; z-index:2; background:#0c0c14; box-shadow:-12px 0 14px -10px rgba(0,0,0,0.65)}
.vj thead th:last-child{position:sticky; right:0; z-index:2; background:#0c0c14}
.vj .revbtn{background:rgba(255,255,255,0.04); border:1px solid var(--border); color:var(--muted); font-family:var(--font);
    font-size:0.68rem; font-weight:700; padding:6px 13px; border-radius:980px; cursor:pointer}
.vj .revbtn:hover{color:var(--text); border-color:var(--borderGold)}
.vj .traderow.rev-open .revbtn{background:var(--goldDim); color:var(--goldBright); border-color:var(--borderGold)}
.vj .revrow > td{padding:0 !important; border-bottom:1px solid rgba(255,255,255,0.06)}
/* Wide trades table scrolls horizontally inside the card instead of being clipped by overflow:hidden
   (matters most at Text Size = Large, where zoom:1.15 widens everything). container-type lets the
   expanded review panel size to the VISIBLE width (100cqw) so nothing is cropped off the side. */
.vj .tbl-scroll{overflow-x:auto; container-type:inline-size}
.vj .revpanel{margin:2px 0 14px; width:100cqw; box-sizing:border-box; background:rgba(201,152,42,0.045); border:1px solid var(--borderGold); border-radius:16px; padding:18px 20px; overflow:hidden; animation:revExpand 0.23s cubic-bezier(0.22,1,0.36,1)}
.vj .revpanel.closing{animation:revCollapse 0.23s cubic-bezier(0.4,0,1,1) forwards}
@keyframes revExpand{from{opacity:0; max-height:0; transform:translateY(-8px); margin-top:0; margin-bottom:0; padding-top:0; padding-bottom:0} to{opacity:1; max-height:1600px; transform:translateY(0)}}
@keyframes revCollapse{from{opacity:1; max-height:1600px; transform:translateY(0)} to{opacity:0; max-height:0; transform:translateY(-8px); margin-top:0; margin-bottom:0; padding-top:0; padding-bottom:0}}
.vj .revfoot{display:flex; align-items:center; flex-wrap:wrap; gap:10px; margin-top:16px; padding-top:16px; border-top:1px solid var(--border)}
.vj .revdelconfirm{display:flex; align-items:center; flex-wrap:wrap; gap:10px; transform-origin:left center; animation:revConfirmIn 220ms cubic-bezier(0.16,1,0.3,1) both}
/* step 2 (final confirm) escalates with a brief shake after sliding in — signals "this is permanent" */
.vj .revdelconfirm.final{animation:revConfirmIn 220ms cubic-bezier(0.16,1,0.3,1) both, revConfirmShake 360ms ease-in-out 220ms forwards}
.vj .revdelmsg{font-size:0.76rem; font-weight:600; color:#fca5a5; animation:revMsgGlow 1.8s ease-in-out infinite}
@keyframes revConfirmIn{from{opacity:0; transform:translateX(10px) scale(0.97)} to{opacity:1; transform:none}}
@keyframes revConfirmShake{0%,100%{transform:translateX(0)} 20%{transform:translateX(-5px)} 40%{transform:translateX(5px)} 60%{transform:translateX(-3px)} 80%{transform:translateX(2px)}}
@keyframes revMsgGlow{0%,100%{text-shadow:0 0 6px rgba(239,68,68,0.25)} 50%{text-shadow:0 0 12px rgba(239,68,68,0.6)}}
@media(prefers-reduced-motion:reduce){.vj .revdelconfirm,.vj .revdelconfirm.final{animation:revConfirmIn 1ms both} .vj .revdelmsg{animation:none}}
.vj .revdelbtn{font-family:var(--font); font-size:0.74rem; font-weight:700; padding:8px 16px; border-radius:980px; cursor:pointer;
  background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.5); color:#fca5a5; box-shadow:0 0 16px rgba(239,68,68,0.35)}
.vj .revdelbtn:hover{background:rgba(239,68,68,0.2); box-shadow:0 0 22px rgba(239,68,68,0.5)}
.vj .revhead{display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding-bottom:15px; margin-bottom:16px; border-bottom:1px solid var(--border)}
.vj .revtick{font-size:1.05rem; font-weight:800; color:var(--white)}
.vj .revmeta{font-size:0.74rem; color:var(--muted)}
.vj .revmeta b{color:var(--text); font-weight:700}
.vj .revclose{margin-left:auto; background:transparent; border:none; color:var(--faint); font-size:1.4rem; line-height:1; cursor:pointer}
.vj .revclose:hover{color:var(--text)}
.vj .revgrid{display:grid; grid-template-columns:1fr 1fr; gap:0}
.vj .revchart{margin-top:16px; padding-top:16px; border-top:1px solid var(--border)}
.vj .revchart-head{display:flex; align-items:center; gap:12px; margin-bottom:10px; flex-wrap:wrap}
.vj .simcanvas{width:100%; height:200px; display:block; border:1px solid var(--borderGold); border-radius:13px;
    background:linear-gradient(180deg,#0a0a12,#0b0b14)}
.vj .simbtn{font-family:var(--font); font-size:0.72rem; font-weight:700; color:var(--goldBright); cursor:pointer;
    background:var(--goldDim); border:1px solid var(--borderGold); border-radius:980px; padding:6px 14px}
.vj .simbtn:hover{background:rgba(201,152,42,0.22)}
.vj .simlegend{display:inline-flex; align-items:center; gap:6px; font-size:0.66rem; color:var(--muted); flex-wrap:wrap}
.vj .simlegend .dot{width:8px; height:8px; border-radius:50%; margin-left:6px}
.vj .simlegend .dot.e{background:#3b82f6}
.vj .simlegend .dot.p{background:var(--goldBright)}
.vj .simlegend .dot.x{background:var(--gold)}
.vj .simlegend .dot.s{background:rgba(201,152,42,0.6)}
.vj .simnote{font-size:0.7rem; color:var(--muted); margin-top:9px; line-height:1.45}
.vj.expert .simnote{display:none}
.vj .revcol{padding:0 22px; border-left:1px solid var(--border)}
.vj .revcol:first-child{padding-left:0; border-left:none}
.vj .revcol:last-child{padding-right:0}
.vj .revcoltitle{font-size:0.6rem; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--gold); margin-bottom:14px}
.vj .mgr{display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.78rem}
.vj .mgr span{color:var(--muted)}
.vj .mgr b{color:var(--text); font-weight:700; font-variant-numeric:tabular-nums}
.vj .mgr b.green{color:var(--green)}
.vj .mgr b.red{color:var(--red)}
.vj .mgr b.gold{color:var(--goldBright)}
.vj .chartph{position:relative; height:150px; border:1px dashed var(--borderGold); border-radius:12px; overflow:hidden;
    display:flex; align-items:flex-end; justify-content:center; background:rgba(255,255,255,0.02)}
.vj .chartph .phnote{position:absolute; inset:0; display:flex; align-items:center; justify-content:center; text-align:center;
    font-size:0.72rem; color:var(--faint); padding:0 24px; line-height:1.5}
.vj .revnotes{margin-top:16px; padding-top:16px; border-top:1px solid var(--border)}
.vj .notesgrid{display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-top:10px}
.vj .nlabel{font-size:0.62rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px}
.vj .nlabel.r{color:#86efac}
.vj .nlabel.w{color:#fda4a4}
.vj .nlabel.l{color:var(--goldBright)}
.vj .mgta{width:100%; background:rgba(255,255,255,0.05); border:1px solid var(--border); border-radius:8px; color:var(--text);
    font-family:var(--font); font-size:0.78rem; padding:8px 10px; outline:none; resize:vertical; min-height:64px; line-height:1.5}
.vj .mgta:focus{border-color:var(--gold)}
.vj .guidepanel{position:fixed; right:24px; bottom:24px; width:330px; max-width:calc(100vw - 40px); z-index:200;
    background:#11111b; border:1px solid var(--borderGold); border-radius:16px; padding:15px 17px; box-shadow:0 22px 60px rgba(0,0,0,0.6); display:none}
.vj:not(.expert) .guidepanel{display:block}
.vj .guidepanel.speaking{border-color:var(--goldBright); box-shadow:0 0 0 1px var(--goldBright), 0 22px 60px rgba(0,0,0,0.6)}
.vj .gp-head{display:flex; align-items:center; gap:9px; margin-bottom:7px}
.vj .gp-dot{width:8px; height:8px; border-radius:50%; background:var(--goldBright); flex:none}
.vj .guidepanel.speaking .gp-dot{animation:gppulse 1s ease-in-out infinite}
@keyframes gppulse{0%,100%{opacity:1; transform:scale(1)}50%{opacity:0.35; transform:scale(1.6)}}
.vj .gp-title{font-size:0.82rem; font-weight:800; color:var(--goldBright); flex:1}
.vj .gp-mute{background:transparent; border:none; cursor:pointer; color:var(--muted); padding:3px; line-height:0; display:flex}
.vj .gp-mute:hover{color:var(--text)}
.vj .gp-mute svg{width:18px; height:18px}
.vj .gp-body{font-size:0.78rem; color:var(--text); line-height:1.55}
.vj .gp-body b{color:var(--goldBright)}
.vj:not(.expert) .guide{transition:box-shadow .2s}
.vj:not(.expert) .guide.guide-active{box-shadow:0 0 0 1px var(--borderGold), 0 0 50px rgba(201,152,42,0.13)}
.vj.expert .welcome{display:none}
.vj.expert .term{border-bottom:none; cursor:default}
.vj.expert .term:hover::after{content:none}
.vj.expert .charthint,.vj.expert .msub{display:none}
.vj .jtoolbar{display:flex; gap:9px; flex-wrap:wrap; margin-top:16px}
.vj .jtoolbar .btn{display:inline-flex; align-items:center; gap:7px}
.vj .jtoolbar .ti{width:14px; height:14px}
.vj #privacyBtn.on{background:var(--goldDim); border-color:var(--borderGold); color:var(--goldBright)}
.vj .ddwrap{position:relative}
.vj .dd{display:none; position:absolute; top:calc(100% + 6px); left:0; z-index:50; background:#11111b; border:1px solid var(--borderGold);
    border-radius:12px; padding:6px; min-width:210px; box-shadow:0 14px 40px rgba(0,0,0,0.55)}
.vj .dd.open{display:block}
.vj .dd button{display:block; width:100%; text-align:left; background:transparent; border:none; color:var(--text); font-family:var(--font);
    font-size:0.78rem; font-weight:600; padding:9px 11px; border-radius:8px; cursor:pointer}
.vj .dd button:hover{background:rgba(255,255,255,0.05)}
.vj .metricbar{display:flex; align-items:center; gap:10px; margin-bottom:14px}
.vj .metricbar .btn{padding:7px 13px; font-size:0.74rem}
.vj .metricsdd{min-width:212px; max-height:340px; overflow:auto; padding:6px}
.vj .metricsdd .ddhdr{display:flex; align-items:center; justify-content:space-between; padding:6px 10px 8px;
    border-bottom:1px solid var(--border); margin-bottom:4px}
.vj .metricsdd .ddhdr span{font-size:0.64rem; text-transform:uppercase; letter-spacing:0.09em; color:var(--muted); font-weight:800}
.vj .metricsdd .ddreset{background:none; border:none; color:var(--goldBright); font-family:var(--font); font-size:0.7rem;
    font-weight:700; cursor:pointer; padding:0}
.vj .metricopt{display:flex; align-items:center; gap:9px; padding:7px 10px; border-radius:8px; cursor:pointer;
    font-size:0.8rem; color:var(--text); font-weight:600}
.vj .metricopt:hover{background:rgba(255,255,255,0.05)}
.vj .metricopt input{accent-color:var(--gold); width:14px; height:14px; cursor:pointer; flex:none}
.vj .modal{display:none; position:fixed; inset:0; z-index:300; background:rgba(8,8,14,0.72); backdrop-filter:blur(4px); align-items:center; justify-content:center; padding:24px}
.vj .modal.open{display:flex}
.vj .modalcard{background:#0c0c14; border:1px solid var(--borderGold); border-radius:20px; width:100%; max-width:780px; max-height:86vh; overflow:auto; padding:24px 26px}
.vj .modalhead{display:flex; align-items:flex-start; gap:16px; margin-bottom:18px}
.vj .modalhead .sub{max-width:560px}
.vj .linktable{width:100%; border-collapse:collapse}
.vj .linktable th{font-size:0.6rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); text-align:left; padding:8px 10px; border-bottom:1px solid var(--border)}
.vj .linktable td{font-size:0.8rem; padding:11px 10px; border-bottom:1px solid rgba(255,255,255,0.05); vertical-align:middle; font-variant-numeric:tabular-nums}
.vj .lk{font-size:0.6rem; font-weight:700; padding:3px 9px; border-radius:980px; white-space:nowrap}
.vj .lk-linked{background:rgba(34,197,94,0.12); color:#86efac}
.vj .lk-orphan{background:rgba(239,68,68,0.12); color:#fda4a4}
.vj .lk-past{background:rgba(255,255,255,0.06); color:var(--muted)}
.vj .lk-unlinked{background:var(--goldDim); color:var(--goldBright)}
.vj .linksel{background:rgba(255,255,255,0.05); border:1px solid var(--border); border-radius:8px; color:var(--text); font-family:var(--font); font-size:0.74rem; padding:6px 9px; outline:none; cursor:pointer; max-width:200px}
.vj .linksel:focus{border-color:var(--gold)}
.vj .modalfoot{display:flex; align-items:center; gap:10px; margin-top:18px; padding-top:16px; border-top:1px solid var(--border)}
.vj .toast{position:fixed; left:50%; bottom:28px; transform:translateX(-50%) translateY(20px); z-index:400; background:#11111b;
    border:1px solid var(--borderGold); border-radius:12px; padding:12px 18px; font-size:0.8rem; color:var(--text);
    box-shadow:0 14px 40px rgba(0,0,0,0.6); opacity:0; pointer-events:none; transition:opacity .2s, transform .2s; max-width:90vw}
.vj .toast.show{opacity:1; transform:translateX(-50%) translateY(0)}
.vj .welcome{display:flex; gap:14px; align-items:flex-start; margin-top:20px; background:var(--goldDim);
    border:1px solid var(--borderGold); border-radius:16px; padding:15px 18px}
.vj .welcome .wd{width:8px;height:8px;border-radius:50%;background:var(--goldBright);box-shadow:0 0 12px var(--goldBright);margin-top:6px;flex:none}
.vj .welcome b{color:var(--white)}
.vj .welcome .x{margin-left:auto; color:var(--faint); cursor:pointer; font-size:1.1rem; line-height:1}
@media(max-width:760px){
.vj .jhero{grid-template-columns:1fr}
.vj .revgrid,.vj .notesgrid{grid-template-columns:1fr}
.vj .revcol{padding:18px 0 0; border-left:none; border-top:1px solid var(--border)}
.vj .revcol:first-child{padding-top:0}
.vj table thead{display:none}
.vj table,.vj tbody,.vj tr,.vj td{display:block; width:100%}
.vj tbody tr.traderow{border:1px solid var(--border); border-radius:16px; padding:8px 4px; margin-bottom:12px}
.vj tbody tr.traderow td{display:flex; justify-content:space-between; align-items:center; text-align:right; border:none; padding:8px 14px}
.vj tbody tr.traderow td::before{content:attr(data-l); color:var(--muted); font-size:0.66rem; text-transform:uppercase; letter-spacing:0.08em; font-weight:700}
.vj tbody tr.traderow td.pro-only{display:none}
.vj.pro tbody tr.traderow td.pro-only{display:flex}
.vj tbody tr.traderow td.revcell{position:static; background:transparent; box-shadow:none}
.vj .navbar{flex-wrap:wrap}
  }
@media(max-width:600px){
.vj .navbar{flex-wrap:wrap; gap:10px}
.vj .navbar .spacer{display:none}
.vj .tabs{overflow-x:auto; max-width:100%; scrollbar-width:none}
.vj .tabs::-webkit-scrollbar{display:none}
.vj .tabs a{white-space:nowrap}
.vj .jtoolbar .btn{flex:1 1 auto}
  }`;

function TradeJournalPage({ setPage, onLogout, journaledTrades, setJournaledTrades, setupTypes, tags: allTags, exitReasons, session, onManualSave, saveStatus, positions, setPositions, positionsRef, portfolioSize, displayName }) {
  const [filterSetup, setFilterSetup] = useState("All");
  const [filterTag, setFilterTag] = useState("All");
  const [editingId, setEditingId] = useState(null);
  const [editRow, setEditRow] = useState({});
  const [editNotes, setEditNotes] = useState({ right: "", wrong: "", lessons: "", _plain: "" });
  const [showImportGuide, setShowImportGuide] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [deletedTradeIds, setDeletedTradeIds] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [expandedTrade, setExpandedTrade] = useState(null); // for expanded view with chart + notes
  const [tradeSorts, setTradeSorts] = useState([]); // [{key, dir}] multi-sort for trades
  const [eqYAxis, setEqYAxis] = useState("$"); // "$" or "%"
  const [eqXAxis, setEqXAxis] = useState("trades"); // "trades" or "months"
  const [distExpanded, setDistExpanded] = useState(false); // expand/collapse distribution analysis
  // Smooth expand/collapse animation state for the full Distribution section:
  // distMounted = node is in the DOM · distOpen = grid-rows 0fr→1fr target · distSettled = overflow released after the transition
  const [distMounted, setDistMounted] = useState(false);
  const [distOpen, setDistOpen] = useState(false);
  const [distSettled, setDistSettled] = useState(false);
  const distRef = useRef(null); // scroll target for full Distribution section
  const [distMode, setDistMode] = useState("actual"); // "actual" | "cap" | "cleared"
  const [distCapVal, setDistCapVal] = useState(""); // Cap Losses at X%
  const [distTableEdits, setDistTableEdits] = useState({}); // {bucketIdx: {gains, losses}} manual overrides
  const [distGainMax, setDistGainMax] = useState(""); // extend fine 2% gain buckets up to this % (blank = auto from data, clamped to 100)
  const [distCustomTiers, setDistCustomTiers] = useState([]); // extra high-value point buckets for simulating monster winners, e.g. [150, 500]
  const [distTierInput, setDistTierInput] = useState(""); // input box for adding a custom tier
  const [drmaExplainerOpen, setDrmaExplainerOpen] = useState(false);
  // Drag reorder hooks — stat tiles, trade journal columns, open positions columns
  const statDrag = useDragReorder(13); // 13 Key Metrics tiles — drag-to-reorder
  // Persist the user's metric order across sessions (seed once, then save on every reorder).
  const metricsFirstRef = useRef(true);
  useEffect(() => {
    if (metricsFirstRef.current) {
      metricsFirstRef.current = false;
      try { const s = JSON.parse(localStorage.getItem("viv-metrics-order")); if (Array.isArray(s) && s.length === 13) statDrag.setOrder(s); } catch {}
      return;
    }
    try { localStorage.setItem("viv-metrics-order", JSON.stringify(statDrag.order)); } catch {}
  }, [statDrag.order]);
  const tradeDrag = useDragReorder(17); // 17 trade journal columns
  // Privacy mode — hides absolute dollar amounts and converts surface metrics to relative (% / R / ratios).
  // Affects Total P/L tile, Equity Curve Y-axis, Tracker monthly Comm column, and Closed Trades P/L $ column.
  // Persists in localStorage so the user can leave it on while screenshotting/sharing without re-toggling.
  const [privacyMode, setPrivacyMode] = useState(() => {
    try { return localStorage.getItem("viv-privacy-mode") === "1"; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem("viv-privacy-mode", privacyMode ? "1" : "0"); } catch {} }, [privacyMode]);
  // Link Historical Trades wizard — backfill `positionId` on legacy/unlinked journal trades.
  // Opens a preview modal with auto-suggested links; user confirms or overrides before any write.
  const [linkWizardOpen, setLinkWizardOpen] = useState(false);
  const [linkChoices, setLinkChoices] = useState({}); // { tradeId: positionId | "past" | "skip" }
  const [linkStatus, setLinkStatus] = useState("");
  const [linkError, setLinkError] = useState(""); // surfaced error so silent DB failures (column missing, RLS, FK) don't make the wizard appear to succeed
  // Bulk-edit state — selection survives sort/filter changes (lives on trade id, not row index).
  const [selectedTradeIds, setSelectedTradeIds] = useState(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkDraft, setBulkDraft] = useState({ stop: "", tradeType: "", setup: "", reason: "" });
  const toggleSelectTrade = useCallback((id) => setSelectedTradeIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  const clearTradeSelection = useCallback(() => setSelectedTradeIds(new Set()), []);
  const monthDrag = useDragReorder(18); // 18 monthly performance columns
  const distDrag = useDragReorder(7); // 7 distribution table columns
  const screenshotRef = useRef(null);
  const closedTradesRef = useRef(null);
  const distScreenRef = useRef(null);
  const [screenshotting, setScreenshotting] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState(null); // "copied" | "downloaded" | null
  const [closedShareOpen, setClosedShareOpen] = useState(false);
  const [closedShareStatus, setClosedShareStatus] = useState(null);
  const [distShareOpen, setDistShareOpen] = useState(false);
  const [distShareStatus, setDistShareStatus] = useState(null);
  const [winDismissed, setWinDismissed] = useState(false);          // X-close the win commentary card
  const [supportDismissed, setSupportDismissed] = useState(false);  // X-close the support commentary card
  const [outliersExpanded, setOutliersExpanded] = useState(false);  // "see more" on outlier trade examples
  const [winShareBusy, setWinShareBusy] = useState(false);          // Share-your-win: privacy → screenshot → Skool
  const jheroRef = useRef(null);                                    // capture target for the win screenshot
  const buildCanvasFromRef = useCallback(async (ref) => {
    const el = ref.current;
    if (!el) return null;
    const brandEl = el.querySelector(".viv-screenshot-brand");
    if (brandEl) brandEl.style.display = "block";
    // Hide share buttons and filter bar during capture
    const hideEls = el.querySelectorAll(".viv-share-btn, .viv-filter-bar, .viv-hide-screenshot");
    hideEls.forEach(e => e.style.display = "none");
    const content = await html2canvas(el, { backgroundColor: "#08080e", scale: 2, useCORS: true, logging: false });
    if (brandEl) brandEl.style.display = "none";
    hideEls.forEach(e => e.style.display = "");

    // Compose onto a larger canvas: generous padding so no card is cropped or crowded, plus a
    // dedicated footer band for the brand logo watermark (the watermark NEVER overlaps the cards).
    const S = 2; // must match the html2canvas scale above
    const pad = 30 * S;
    const footer = 128 * S;
    const out = document.createElement("canvas");
    out.width = content.width + pad * 2;
    out.height = content.height + pad + footer;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#08080e";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(content, pad, pad);

    const bandTop = content.height + pad;
    // hairline divider above the footer band
    ctx.fillStyle = "rgba(201,152,42,0.22)";
    ctx.fillRect(pad, bandTop + 1, out.width - pad * 2, 1);

    // brand logo watermark, centered in the footer band
    try {
      const logo = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = "/VIV-Transparent.png";
      });
      const logoH = 56 * S;
      const logoW = logoH * (logo.width / logo.height || 1);
      ctx.globalAlpha = 0.92;
      ctx.drawImage(logo, (out.width - logoW) / 2, bandTop + 24 * S, logoW, logoH);
      ctx.globalAlpha = 1;
    } catch (err) { console.warn("Watermark logo failed to load:", err); }

    // brand URL beneath the logo
    ctx.fillStyle = "rgba(201,152,42,0.85)";
    ctx.font = "600 24px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("www.valensontrades.com", out.width / 2, bandTop + footer - 26 * S);
    return out;
  }, []);
  const captureSection = useCallback(async (mode, ref, setMenu, setStatus, filename) => {
    if (!ref.current || screenshotting) return;
    setScreenshotting(true);
    setMenu(false);
    try {
      const canvas = await buildCanvasFromRef(ref);
      if (!canvas) throw new Error("Canvas failed");
      const fname = `VIV-${filename}-${new Date().toISOString().slice(0,10)}.png`;
      if (mode === "copy") {
        canvas.toBlob(async (blob) => {
          if (blob && navigator.clipboard && navigator.clipboard.write) {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
            setStatus("copied");
          } else {
            const link = document.createElement("a");
            link.download = fname;
            link.href = canvas.toDataURL("image/png");
            link.click();
            setStatus("downloaded");
          }
          setTimeout(() => setStatus(null), 2500);
        }, "image/png");
      } else {
        const link = document.createElement("a");
        link.download = fname;
        link.href = canvas.toDataURL("image/png");
        link.click();
        setStatus("downloaded");
        setTimeout(() => setStatus(null), 2500);
      }
    } catch (e) { console.error("Screenshot failed:", e); }
    setScreenshotting(false);
  }, [screenshotting, buildCanvasFromRef]);
  const captureStats = useCallback(async (mode) => captureSection(mode, screenshotRef, setShareMenuOpen, setShareStatus, "Performance"), [captureSection]);
  const captureClosedTrades = useCallback(async (mode) => captureSection(mode, closedTradesRef, setClosedShareOpen, setClosedShareStatus, "ClosedTrades"), [captureSection]);
  const captureDist = useCallback(async (mode) => captureSection(mode, distScreenRef, setDistShareOpen, setDistShareStatus, "Distribution"), [captureSection]);
  // Share-your-win flow: flip privacy mode ON (hide $), screenshot the hero, copy the image, then open Skool.
  const SKOOL_URL = "https://www.skool.com/valensontrades";
  const shareWin = useCallback(async () => {
    if (winShareBusy) return;
    setWinShareBusy(true);
    setPrivacyMode(true);                                   // 1. privacy on so dollar amounts are hidden
    await new Promise(r => setTimeout(r, 400));             // let React re-render the % values
    try {
      const canvas = await buildCanvasFromRef(jheroRef);   // 2. screenshot the win hero
      if (canvas) {
        await new Promise(res => canvas.toBlob(async (blob) => {
          let copied = false;
          try {
            if (blob && navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
              await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
              copied = true;
            }
          } catch {}
          if (!copied && blob) {   // clipboard unavailable or lost user-activation → download instead
            const link = document.createElement("a");
            link.download = `VIV-Win-${new Date().toISOString().slice(0, 10)}.png`;
            link.href = URL.createObjectURL(blob);
            link.click();
          }
          res();
        }, "image/png"));
      }
    } catch (e) { console.error("Win share failed:", e); }
    setWinShareBusy(false);
    window.open(SKOOL_URL, "_blank", "noopener,noreferrer");  // 3. open Skool to paste the image
  }, [winShareBusy, buildCanvasFromRef]);
  // perfToggle removed — monthly tracker now shows all stats inline

  // Reusable Share dropdown button
  const ShareDropdown = useCallback(({ menuOpen, setMenuOpen, status, captureFn, label }) => (
    <div className="viv-share-btn" style={{ position:"relative" }}>
      <button onClick={() => setMenuOpen(p => !p)} disabled={screenshotting} title={`Screenshot ${label}`} style={{ padding:"8px 12px",borderRadius:980,border:`1px solid ${C.borderGold}`,background:C.goldDim,color:C.gold,fontWeight:700,fontSize:"0.72rem",cursor:screenshotting?"wait":"pointer",fontFamily:font,display:"flex",alignItems:"center",gap:5 }}>
        {screenshotting ? "Capturing..." : status === "copied" ? "Copied ✓" : status === "downloaded" ? "Downloaded ✓" : `📸 Share ${label}`}
      </button>
      {menuOpen && !screenshotting && (
        <div style={{ position:"absolute",top:"calc(100% + 6px)",right:0,background:"rgba(12,12,20,0.97)",border:`1px solid ${C.borderGold}`,borderRadius:10,padding:6,zIndex:100,minWidth:180,boxShadow:"0 8px 32px rgba(0,0,0,0.6)" }}>
          <button onClick={() => captureFn("copy")} style={{ display:"flex",alignItems:"center",gap:8,width:"100%",padding:"10px 14px",border:"none",background:"transparent",color:C.white,fontSize:"0.72rem",fontWeight:600,cursor:"pointer",fontFamily:font,borderRadius:8,textAlign:"left" }} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.06)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            📋 Copy to Clipboard
          </button>
          <button onClick={() => captureFn("download")} style={{ display:"flex",alignItems:"center",gap:8,width:"100%",padding:"10px 14px",border:"none",background:"transparent",color:C.white,fontSize:"0.72rem",fontWeight:600,cursor:"pointer",fontFamily:font,borderRadius:8,textAlign:"left" }} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.06)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            💾 Download PNG
          </button>
        </div>
      )}
    </div>
  ), [screenshotting]);

  // Ref to always hold the latest onManualSave — fixes stale closure when
  // setTimeout fires after setJournaledTrades (state update hasn't rendered yet)
  const onManualSaveRef = useRef(onManualSave);
  useEffect(() => { onManualSaveRef.current = onManualSave; }, [onManualSave]);

  // Smoothly expand/collapse + scroll the full Distribution section.
  // Open: mount → next frame flip to 1fr (so the height transition has a 0fr starting frame) → smooth-scroll into view.
  // Close: collapse to 0fr, then unmount once the transition has finished. distSettled releases overflow:hidden after the
  // open transition so chart tooltips / dropdowns aren't clipped once it's fully open.
  useEffect(() => {
    if (distExpanded) {
      setDistMounted(true);
      const raf = requestAnimationFrame(() => requestAnimationFrame(() => {
        setDistOpen(true);
        if (distRef.current) distRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      }));
      return () => cancelAnimationFrame(raf);
    } else {
      setDistSettled(false);
      setDistOpen(false);
      const t = setTimeout(() => setDistMounted(false), 480);
      return () => clearTimeout(t);
    }
  }, [distExpanded]);

  const allTrades = useMemo(() => journaledTrades.filter(t => !deletedTradeIds.includes(t.id)), [journaledTrades, deletedTradeIds]);

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      // Detect master export format (has section markers)
      const master = parseMasterCSV(text);
      if (master) {
        let count = 0;
        if (master.trades.length > 0) {
          setJournaledTrades(prev => [...prev, ...master.trades]);
          count += master.trades.length;
        }
        if (master.positions.length > 0) {
          setPositions(prev => { const next = [...prev, ...master.positions]; positionsRef.current = next; return next; });
          count += master.positions.length;
        }
        if (count > 0) {
          setImportResult({ success: true, count, master: true, posCount: master.positions.length, tradeCount: master.trades.length });
        } else {
          setImportResult({ success: false, count: 0 });
        }
      } else {
        // Standard single-section CSV (trades only)
        const parsed = parseCSV(text);
        if (parsed.length > 0) {
          setJournaledTrades(prev => [...prev, ...parsed]);
          setImportResult({ success: true, count: parsed.length });
        } else {
          setImportResult({ success: false, count: 0 });
        }
      }
      setTimeout(() => setImportResult(null), 5000);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const filtered = useMemo(() => {
    return allTrades.filter(t => {
      if (filterSetup !== "All" && t.setup !== filterSetup) return false;
      if (filterTag !== "All" && !(t.tags || []).includes(filterTag)) return false;
      return true;
    });
  }, [allTrades, filterSetup, filterTag]);

  const stats = useMemo(() => {
    const trades = filtered;
    if (trades.length === 0) return { ba:0,avgGain:0,avgLoss:0,glRatio:0,adjustedGL:0,ev:0,avgR:0,largestLoss:0,largestWin:0,totalPL:0,total:0,avgHoldWin:0,avgHoldLoss:0,holdRatio:0 };
    const wins = trades.filter(t => t.plPct > 0), losses = trades.filter(t => t.plPct <= 0);
    const ba = (wins.length / trades.length) * 100;
    // Equal-weighted avg gain/loss: simple average of trade percentages
    const avgGain = wins.length > 0 ? wins.reduce((s, t) => s + t.plPct, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.plPct, 0) / losses.length) : 0;
    const glRatio = avgLoss > 0 ? avgGain / avgLoss : 0;
    // Adjusted G/L Ratio: factors in win rate — above 1.0 = net profitable
    const adjustedGL = avgLoss > 0 ? ((ba / 100) * avgGain) / (((100 - ba) / 100) * avgLoss) : 0;
    const ev = (ba / 100) * avgGain - ((100 - ba) / 100) * avgLoss;
    const rTrades = trades.filter(t => t.rMult != null); // imported trades have no stop → no R; don't dilute the average
    const avgR = rTrades.length ? rTrades.reduce((s, t) => s + t.rMult, 0) / rTrades.length : 0;
    // Holding duration (days) — uses time fields for fractional-day accuracy when available
    const holdDays = (t) => {
      if (!t.entry || !t.exit) return null;
      const d1 = new Date(t.entry), d2 = new Date(t.exit);
      if (isNaN(d1) || isNaN(d2)) return null;
      if (t.entryTime && t.exitTime) {
        const [eh, em] = t.entryTime.split(":").map(Number);
        const [xh, xm] = t.exitTime.split(":").map(Number);
        if (!isNaN(eh) && !isNaN(em)) { d1.setHours(eh, em, 0, 0); }
        if (!isNaN(xh) && !isNaN(xm)) { d2.setHours(xh, xm, 0, 0); }
        const diffMs = Math.max(0, d2 - d1);
        return +(diffMs / 86400000).toFixed(1);
      }
      return Math.max(0, Math.round((d2 - d1) / 86400000));
    };
    const winDays = wins.map(holdDays).filter(d => d !== null);
    const lossDays = losses.map(holdDays).filter(d => d !== null);
    const avgHoldWin = winDays.length > 0 ? winDays.reduce((s,d) => s + d, 0) / winDays.length : 0;
    const avgHoldLoss = lossDays.length > 0 ? lossDays.reduce((s,d) => s + d, 0) / lossDays.length : 0;
    const holdRatio = avgHoldLoss > 0 ? avgHoldWin / avgHoldLoss : 0;
    const totalComm = trades.reduce((s, t) => s + (parseFloat(t.commission) || 0), 0);
    return { ba, avgGain, avgLoss, glRatio, adjustedGL, ev, avgR, largestLoss: Math.min(...trades.map(t => t.plPct)), largestWin: Math.max(...trades.map(t => t.plPct)), totalPL: trades.reduce((s, t) => s + t.plDollar, 0), total: trades.length, avgHoldWin, avgHoldLoss, holdRatio, totalComm };
  }, [filtered]);

  // ─── Distribution Analysis Data ───
  // Uses ABSOLUTE VALUE buckets (0-2%, 2-4%, etc.) matching M360 methodology.
  // Gains and losses are placed in the same magnitude bucket.
  const distAnalysis = useMemo(() => {
    const trades = filtered;
    const total = trades.length;
    if (total === 0) return { barData: [], tableData: [], butterflyData: [], butterflyDrma: [], gainMag: [], lossMag: [], returnPerTrade: 0 };

    // Find max absolute P&L% to determine bucket range
    const maxAbsPct = Math.max(...trades.map(t => Math.abs(t.plPct)));
    const bucketHi = Math.max(Math.ceil(maxAbsPct / 2) * 2, 20); // at least 0-20%

    // Build absolute-value buckets: 0-2%, 2-4%, ..., up to bucketHi
    const buckets = [];
    for (let i = 0; i < bucketHi; i += 2) buckets.push({ lo: i, hi: i + 2, range: `${i} - ${i+2}%`, gains: 0, losses: 0, gainPcts: [], lossPcts: [] });

    trades.forEach(t => {
      const absPct = Math.abs(t.plPct);
      const idx = Math.max(0, Math.min(buckets.length - 1, Math.floor(absPct / 2)));
      if (t.plPct > 0) { buckets[idx].gains++; buckets[idx].gainPcts.push(t.plPct); }
      else { buckets[idx].losses++; buckets[idx].lossPcts.push(t.plPct); }
    });

    // Bar chart data — gains and losses per magnitude bucket (for table)
    const barData = buckets.map(b => ({ range: `${b.lo}%`, gains: b.gains, losses: b.losses }));

    // Distribution table with Net%, DRMA, G↑%, L↓%
    let cumDRMA = 0;
    const tableData = buckets.map(b => {
      const gPct = total > 0 ? (b.gains / total) * 100 : 0;
      const lPct = total > 0 ? (b.losses / total) * 100 : 0;
      const netPct = total > 0 ? ((b.gains - b.losses) / total) * 100 : 0;
      const bucketRetContrib = [...b.gainPcts, ...b.lossPcts].reduce((s, v) => s + v, 0) / (total || 1);
      cumDRMA += bucketRetContrib;
      return { range: b.range, lo: b.lo, hi: b.hi, gains: b.gains, losses: b.losses, gPct, lPct, netPct, drma: cumDRMA, bucketRetContrib };
    });

    // Butterfly chart data — ALL buckets: losses on LEFT (negative ranges), gains on RIGHT (positive ranges)
    const butterflyData = [
      ...buckets.slice().reverse().map(b => ({ range: `-${b.hi}%`, count: b.losses, type: "loss" })),
      ...buckets.map(b => ({ range: `${b.lo}%`, count: b.gains, type: "gain" }))
    ];

    // DRMA butterfly — ALL buckets: losses left (reversed), gains right, range labels
    const butterflyDrma = [
      ...buckets.slice().reverse().map(b => {
        const c = b.lossPcts.length > 0 ? b.lossPcts.reduce((s, v) => s + v, 0) / (total || 1) : 0;
        return { range: `${b.lo}-${b.hi}%`, contribution: c, type: "loss" };
      }),
      ...buckets.map(b => {
        const c = b.gainPcts.length > 0 ? b.gainPcts.reduce((s, v) => s + v, 0) / (total || 1) : 0;
        return { range: `${b.lo}-${b.hi}%`, contribution: c, type: "gain" };
      })
    ];

    // Gain Magnitude: per-bucket count of gains
    const gainMag = buckets.map(b => ({ range: `${b.lo}%`, count: b.gains }));
    const lossMag = buckets.map(b => ({ range: `${b.lo}%`, count: b.losses }));

    return { barData, tableData, butterflyData, butterflyDrma, gainMag, lossMag, returnPerTrade: cumDRMA };
  }, [filtered]);

  // Active distribution data — handles actual, cap losses, cleared modes, and table edits
  const activeDistData = useMemo(() => {
    if (distMode === "cleared") return { barData: [], tableData: [], butterflyData: [], butterflyDrma: [], gainMag: [], lossMag: [], returnPerTrade: 0, stats: null };
    let trades = filtered;
    if (distMode === "cap") {
      const capVal = parseFloat(distCapVal);
      if (!isNaN(capVal) && capVal > 0) {
        trades = trades.map(t => t.plPct <= 0 && Math.abs(t.plPct) > capVal ? { ...t, plPct: -capVal } : t);
      }
    }
    const total = trades.length;
    if (total === 0) return { barData: [], tableData: [], butterflyData: [], butterflyDrma: [], gainMag: [], lossMag: [], returnPerTrade: 0, stats: null };

    const maxAbsPct = Math.max(...trades.map(t => Math.abs(t.plPct)));
    // Fine 2%-wide buckets — extend up to distGainMax (clamped to 100%) so big winners can be simulated, not just your personal max
    const gainMaxInput = parseFloat(distGainMax);
    const fineTarget = Number.isFinite(gainMaxInput) && gainMaxInput > 0 ? Math.ceil(gainMaxInput / 2) * 2 : 0;
    const bucketHi = Math.min(Math.max(Math.ceil(maxAbsPct / 2) * 2, fineTarget, 20), 100);
    const buckets = [];
    for (let i = 0; i < bucketHi; i += 2) buckets.push({ lo: i, hi: i + 2, range: `${i} - ${i+2}%`, gains: 0, losses: 0, gainPcts: [], lossPcts: [] });
    const fineCount = buckets.length;
    // Custom high-value tiers (point buckets) above the fine range — for simulating monster winners (e.g. 150%, 500%)
    [...distCustomTiers].filter(v => v > bucketHi).sort((a, b) => a - b).forEach(v => {
      buckets.push({ lo: v, hi: v, range: `${v}%`, custom: true, gains: 0, losses: 0, gainPcts: [], lossPcts: [] });
    });
    trades.forEach(t => {
      const absPct = Math.abs(t.plPct);
      const idx = Math.max(0, Math.min(fineCount - 1, Math.floor(absPct / 2))); // real trades land only in fine buckets
      if (t.plPct > 0) { buckets[idx].gains++; buckets[idx].gainPcts.push(t.plPct); }
      else { buckets[idx].losses++; buckets[idx].lossPcts.push(t.plPct); }
    });

    // Apply manual table edits — override gains/losses counts with synthetic midpoint trades
    const hasEdits = Object.keys(distTableEdits).length > 0;
    if (hasEdits) {
      Object.entries(distTableEdits).forEach(([idx, ov]) => {
        const i = parseInt(idx);
        if (i < 0 || i >= buckets.length) return;
        const mid = (buckets[i].lo + buckets[i].hi) / 2;
        if (ov.gains !== undefined && ov.gains !== buckets[i].gains) {
          buckets[i].gains = Math.max(0, ov.gains);
          buckets[i].gainPcts = Array(buckets[i].gains).fill(mid);
        }
        if (ov.losses !== undefined && ov.losses !== buckets[i].losses) {
          buckets[i].losses = Math.max(0, ov.losses);
          buckets[i].lossPcts = Array(buckets[i].losses).fill(-mid);
        }
      });
    }

    // Recalculate stats from (possibly edited) buckets
    const allGainPcts = buckets.flatMap(b => b.gainPcts);
    const allLossPcts = buckets.flatMap(b => b.lossPcts);
    const editedTotal = allGainPcts.length + allLossPcts.length;
    const ba = editedTotal > 0 ? (allGainPcts.length / editedTotal) * 100 : 0;
    const avgGain = allGainPcts.length > 0 ? allGainPcts.reduce((s, v) => s + v, 0) / allGainPcts.length : 0;
    const avgLoss = allLossPcts.length > 0 ? Math.abs(allLossPcts.reduce((s, v) => s + v, 0) / allLossPcts.length) : 0;
    const glRatio = avgLoss > 0 ? avgGain / avgLoss : 0;
    const adjustedGL = avgLoss > 0 ? ((ba / 100) * avgGain) / (((100 - ba) / 100) * avgLoss) : 0;

    const barData = buckets.map(b => ({ range: `${b.lo}%`, gains: b.gains, losses: b.losses }));
    let cumDRMA = 0;
    const tableData = buckets.map(b => {
      const gPct = editedTotal > 0 ? (b.gains / editedTotal) * 100 : 0;
      const lPct = editedTotal > 0 ? (b.losses / editedTotal) * 100 : 0;
      const netPct = editedTotal > 0 ? ((b.gains - b.losses) / editedTotal) * 100 : 0;
      const bucketRetContrib = [...b.gainPcts, ...b.lossPcts].reduce((s, v) => s + v, 0) / (editedTotal || 1);
      cumDRMA += bucketRetContrib;
      return { range: b.range, lo: b.lo, hi: b.hi, gains: b.gains, losses: b.losses, gPct, lPct, netPct, drma: cumDRMA, bucketRetContrib };
    });

    // Butterfly chart data — ALL buckets: losses LEFT, gains RIGHT
    const butterflyData = [
      ...buckets.slice().reverse().map(b => ({ range: `-${b.hi}%`, count: b.losses, type: "loss" })),
      ...buckets.map(b => ({ range: `${b.lo}%`, count: b.gains, type: "gain" }))
    ];
    const butterflyDrma = [
      ...buckets.slice().reverse().map(b => {
        const c = b.lossPcts.length > 0 ? b.lossPcts.reduce((s, v) => s + v, 0) / (editedTotal || 1) : 0;
        return { range: `${b.lo}-${b.hi}%`, contribution: c, type: "loss" };
      }),
      ...buckets.map(b => {
        const c = b.gainPcts.length > 0 ? b.gainPcts.reduce((s, v) => s + v, 0) / (editedTotal || 1) : 0;
        return { range: `${b.lo}-${b.hi}%`, contribution: c, type: "gain" };
      })
    ];

    const gainMag = buckets.map(b => ({ range: `${b.lo}%`, count: b.gains }));
    const lossMag = buckets.map(b => ({ range: `${b.lo}%`, count: b.losses }));
    const cappedCount = distMode === "cap" && distCapVal !== "" ? filtered.filter(t => t.plPct <= 0 && Math.abs(t.plPct) > parseFloat(distCapVal || 999)).length : 0;
    return {
      barData, tableData, butterflyData, butterflyDrma, gainMag, lossMag, returnPerTrade: cumDRMA, cappedCount,
      stats: { ba, avgGain, avgLoss, glRatio, adjustedGL: isFinite(adjustedGL) ? adjustedGL : 999.99, total: editedTotal, wins: allGainPcts.length, losses: allLossPcts.length }
    };
  }, [filtered, distMode, distCapVal, distTableEdits, distGainMax, distCustomTiers]);

  // Equity curve data — supports $ vs % and trades vs months
  const equityData = useMemo(() => {
    const startingCapital = +(portfolioSize || 0);
    // Sort trades chronologically by exit date
    const sorted = [...filtered].sort((a, b) => {
      const da = new Date(a.exit || a.entry || 0), db = new Date(b.exit || b.entry || 0);
      return da - db;
    });
    if (eqXAxis === "months") {
      // Group by exit month, chronological
      const monthMap = {};
      sorted.forEach(t => {
        const m = (t.exit || t.entry || "").replace(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/, (_, mo, d, y) => `${y.length===2?"20"+y:y}-${mo.padStart(2,"0")}`).slice(0, 7) || "Unknown";
        if (!monthMap[m]) monthMap[m] = { dollar: 0, count: 0 };
        monthMap[m].dollar += t.plDollar;
        monthMap[m].count++;
      });
      let cumEquity = startingCapital;
      const points = [{ trade: "Start", equity: startingCapital, equityPct: 0 }];
      Object.keys(monthMap).sort().forEach(m => {
        cumEquity += monthMap[m].dollar;
        points.push({ trade: m, equity: cumEquity, equityPct: startingCapital > 0 ? ((cumEquity - startingCapital) / startingCapital) * 100 : 0 });
      });
      return points;
    }
    // By trade — chronological by exit date
    let cumEquity = startingCapital;
    const points = [{ trade: "Start", equity: startingCapital, equityPct: 0 }];
    sorted.forEach(t => {
      cumEquity += t.plDollar;
      // Format exit date for x-axis label
      const dateStr = (t.exit || t.entry || "").replace(/\/\d{2}$/, m => m); // keep short date
      points.push({ trade: dateStr || t.ticker, equity: cumEquity, equityPct: startingCapital > 0 ? ((cumEquity - startingCapital) / startingCapital) * 100 : 0 });
    });
    return points;
  }, [filtered, eqXAxis, portfolioSize]);

  // Monthly performance table data — P/L % = dollar P/L ÷ portfolio size (portfolio-weighted return)
  const monthlyPerf = useMemo(() => {
    const holdDaysCalc = (t) => {
      if (!t.entry || !t.exit) return null;
      const d1 = new Date(t.entry), d2 = new Date(t.exit);
      if (isNaN(d1) || isNaN(d2)) return null;
      if (t.entryTime && t.exitTime) {
        const [eh, em] = t.entryTime.split(":").map(Number);
        const [xh, xm] = t.exitTime.split(":").map(Number);
        if (!isNaN(eh) && !isNaN(em)) d1.setHours(eh, em, 0, 0);
        if (!isNaN(xh) && !isNaN(xm)) d2.setHours(xh, xm, 0, 0);
        return +(Math.max(0, d2 - d1) / 86400000).toFixed(1);
      }
      return Math.max(0, Math.round((d2 - d1) / 86400000));
    };
    const months = {};
    filtered.forEach(t => {
      // Normalize first so BOTH manual "M/D/YY" and IBKR ISO "YYYY-MM-DD" dates group correctly
      // (the old slash-only regex silently dropped every IBKR-synced trade from the monthly tracker).
      const iso = tradeDateISO(t.exit || t.entry || "");
      const match = iso.match(/^(\d{4})-(\d{2})/);
      if (!match) return;
      const key = `${match[1]}-${match[2]}`;
      if (!months[key]) months[key] = [];
      months[key].push(t);
    });
    return Object.keys(months).sort().map(k => {
      const trades = months[k];
      const wins = trades.filter(t => t.plPct > 0);
      const losses = trades.filter(t => t.plPct <= 0);
      const be = trades.filter(t => t.plPct === 0);
      const count = trades.length;
      const dollar = trades.reduce((s, t) => s + t.plDollar, 0);
      const avgGain = wins.length > 0 ? wins.reduce((s, t) => s + t.plPct, 0) / wins.length : 0;
      const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.plPct, 0) / losses.length) : 0;
      const net = avgGain - avgLoss;
      const ratio = avgLoss > 0 ? avgGain / avgLoss : 0;
      const winPct = count > 0 ? (wins.length / count) * 100 : 0;
      const lossPct = count > 0 ? (losses.length / count) * 100 : 0;
      const lgGain = wins.length > 0 ? Math.max(...wins.map(t => t.plPct)) : 0;
      const lgLoss = losses.length > 0 ? Math.min(...losses.map(t => t.plPct)) : 0;
      const lgNet = lgGain + lgLoss;
      const lgRatio = Math.abs(lgLoss) > 0 ? lgGain / Math.abs(lgLoss) : 0;
      const winDays = wins.map(holdDaysCalc).filter(d => d !== null);
      const lossDays = losses.map(holdDaysCalc).filter(d => d !== null);
      const avgDaysWin = winDays.length > 0 ? winDays.reduce((s, d) => s + d, 0) / winDays.length : 0;
      const avgDaysLoss = lossDays.length > 0 ? lossDays.reduce((s, d) => s + d, 0) / lossDays.length : 0;
      const comm = trades.reduce((s, t) => s + (parseFloat(t.commission) || 0), 0);
      return {
        month: k, label: new Date(k + "-15").toLocaleString("default", { month: "short", year: "numeric" }),
        dollar, count, wins: wins.length, losses: losses.length, be: be.length,
        avgGain, avgLoss, net, ratio, winPct, lossPct,
        lgGain, lgLoss, lgNet, lgRatio, avgDaysWin, avgDaysLoss, comm
      };
    });
  }, [filtered]);

  const startEdit = (t) => { setEditingId(t.id); setEditRow({ ...t }); setEditNotes(parseNotes(t.notes)); };
  // Unified Chart+Review panel: clicking the chart icon OR Edit opens the same expandable panel
  // (live chart on top, editable trade review below). Legacy plain notes seed the Lessons field so nothing is lost.
  const [reviewDraft, setReviewDraft] = useState({ right: "", wrong: "", lessons: "" });
  const [reviewSavedId, setReviewSavedId] = useState(null);
  const [closingReview, setClosingReview] = useState(false); // plays the collapse animation before unmount
  const [deleteStep, setDeleteStep] = useState(0); // 0 = none, 1 = first confirm, 2 = second (double) confirm
  const closeReview = () => {
    setDeleteStep(0);
    setClosingReview(true);
    setTimeout(() => { setExpandedTrade(null); setClosingReview(false); }, 230); // matches the collapse keyframe duration
  };
  const openReview = (t) => {
    if (expandedTrade === t.id) { closeReview(); return; }
    const n = parseNotes(t.notes);
    setReviewDraft({ right: n.right || "", wrong: n.wrong || "", lessons: n.lessons || n._plain || "" });
    setReviewSavedId(null);
    setDeleteStep(0);
    setClosingReview(false);
    setExpandedTrade(t.id);
  };
  const saveReview = (id) => {
    const serialized = serializeNotes({ right: reviewDraft.right, wrong: reviewDraft.wrong, lessons: reviewDraft.lessons });
    setJournaledTrades(prev => prev.map(t => t.id === id ? { ...t, notes: serialized } : t));
    setReviewSavedId(id);
    setTimeout(() => onManualSaveRef.current(), 50);
    setTimeout(() => setReviewSavedId(cur => cur === id ? null : cur), 2200);
  };
  const saveEdit = () => {
    if (!editingId) return;
    const serializedNotes = serializeNotes(editNotes);
    setJournaledTrades(prev => prev.map(t => {
      if (t.id !== editingId) return t;
      const ep = parseFloat(editRow.entryP) || 0, xp = parseFloat(editRow.exitP) || 0, sh = parseFloat(editRow.shares) || 0, st = parseFloat(editRow.stop) || 0;
      const isShort = (editRow.tradeType || t.tradeType || "Long") === "Short";
      const plPct = ep > 0 ? (isShort ? ((ep - xp) / ep) * 100 : ((xp - ep) / ep) * 100) : 0;
      const plDollar = isShort ? (ep - xp) * sh : (xp - ep) * sh;
      const initRisk = ep > 0 && st > 0 ? (isShort ? (st - ep) / ep : (ep - st) / ep) : 0;
      const rMult = initRisk > 0 ? (plPct / 100) / initRisk : 0;
      return { ...editRow, notes: serializedNotes, plPct, plDollar, rMult };
    }));
    setEditingId(null);
    // Trigger immediate save via ref — avoids stale closure from pre-setState render
    setTimeout(() => onManualSaveRef.current(), 50);
  };
  const cancelEdit = () => { setEditingId(null); setEditNotes({ right: "", wrong: "", lessons: "", _plain: "" }); };

  // Upload chart image to Supabase Storage
  const uploadChartImage = async (tradeId, file) => {
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `charts/${tradeId}_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("trade-charts").upload(path, file, { upsert: true });
      if (uploadErr) { console.error("Upload error:", uploadErr.message); alert("Upload failed: " + uploadErr.message); return; }
      const { data: urlData } = supabase.storage.from("trade-charts").getPublicUrl(path);
      const publicUrl = urlData?.publicUrl || "";
      // Update the trade with the image path
      setEditRow(r => ({ ...r, chartImage: publicUrl }));
    } catch (err) { console.error("Upload failed:", err); alert("Upload failed"); }
    setUploadingImage(false);
  };
  const deleteTrade = (id, skipConfirm) => {
    const trade = journaledTrades.find(t => t.id === id);
    if (!skipConfirm && !window.confirm(`Delete ${trade?.ticker || "this"} trade from journal? This cannot be undone.`)) return;
    setDeletedTradeIds(prev => [...prev, id]);
    setJournaledTrades(prev => prev.filter(t => t.id !== id));
    if (editingId === id) setEditingId(null);
    // Immediately delete from Supabase (don't wait for debounced auto-save)
    supabase.from("trades").update({ is_deleted: true }).eq("id", id).then(({ error }) => {
      if (error) console.error("Trade delete error:", error.message);
    });
  };

  // ── BULK EDIT / DELETE ── operates on selectedTradeIds. Bulk apply updates only the fields the user
  // explicitly filled in the modal (empty = skip that field). When stop or tradeType change we recompute
  // rMult per-trade using each trade's own entry/exit/shares — same formula as saveEdit (App.jsx:3543+).
  const bulkApply = useCallback(() => {
    if (selectedTradeIds.size === 0) return;
    const draft = bulkDraft;
    const hasStop = String(draft.stop).trim() !== "";
    const hasType = !!draft.tradeType;
    const hasSetup = !!draft.setup;
    const hasReason = !!draft.reason;
    if (!hasStop && !hasType && !hasSetup && !hasReason) { setBulkOpen(false); return; }
    setJournaledTrades(prev => prev.map(t => {
      if (!selectedTradeIds.has(t.id)) return t;
      const nextStop = hasStop ? Number(draft.stop) : (Number(t.stop) || 0);
      const nextType = hasType ? draft.tradeType : (t.tradeType || "Long");
      const nextSetup = hasSetup ? draft.setup : t.setup;
      const nextReason = hasReason ? draft.reason : t.reason;
      // Recompute rMult only if stop or tradeType changed (otherwise t.rMult is already correct)
      let rMult = t.rMult;
      if (hasStop || hasType) {
        const ep = parseFloat(t.entryP) || 0, xp = parseFloat(t.exitP) || 0;
        const isShort = nextType === "Short";
        const plPct = ep > 0 ? (isShort ? ((ep - xp) / ep) * 100 : ((xp - ep) / ep) * 100) : 0;
        const initRisk = ep > 0 && nextStop > 0 ? (isShort ? (nextStop - ep) / ep : (ep - nextStop) / ep) : 0;
        rMult = initRisk > 0 ? (plPct / 100) / initRisk : null;
      }
      return { ...t, stop: hasStop ? nextStop : t.stop, tradeType: nextType, setup: nextSetup, reason: nextReason, rMult };
    }));
    setBulkOpen(false);
    setBulkDraft({ stop: "", tradeType: "", setup: "", reason: "" });
    // Trigger immediate save via ref — avoids stale closure
    setTimeout(() => onManualSaveRef.current(), 50);
  }, [selectedTradeIds, bulkDraft]);

  const bulkDelete = useCallback(() => {
    if (selectedTradeIds.size === 0) return;
    const ids = Array.from(selectedTradeIds);
    if (!window.confirm(`Delete ${ids.length} trade${ids.length === 1 ? "" : "s"} from your journal? This soft-deletes them (recoverable from the database) but they will disappear from your journal immediately.`)) return;
    setDeletedTradeIds(prev => [...prev, ...ids]);
    setJournaledTrades(prev => prev.filter(t => !selectedTradeIds.has(t.id)));
    if (editingId && selectedTradeIds.has(editingId)) setEditingId(null);
    clearTradeSelection();
    // Soft-delete in Supabase right away (per-row try/catch — one row failing shouldn't abort the others)
    ids.forEach(id => {
      supabase.from("trades").update({ is_deleted: true }).eq("id", id).then(({ error }) => {
        if (error) console.error("Bulk trade delete error:", id, error.message);
      });
    });
  }, [selectedTradeIds, editingId, clearTradeSelection]);

  const selectAllVisible = useCallback(() => {
    setSelectedTradeIds(prev => {
      const next = new Set(prev);
      filtered.forEach(t => next.add(t.id));
      return next;
    });
  }, [filtered]);

  const visibleAllSelected = filtered.length > 0 && filtered.every(t => selectedTradeIds.has(t.id));

  // ── LINK HISTORICAL TRADES — auto-suggest engine ──
  // Shows EVERY closed trade for tickers you currently hold open, plus any unlinked trades whose
  // ticker doesn't match a current lot. The previous version only showed `!t.positionId` trades,
  // which hid:
  //   - trades that earlier wizard runs marked "past" (couldn't reverse the decision)
  //   - trades linked to a now-deleted position id (orphaned, no Realized credit)
  //   - trades the localStorage mirror set to a stale id
  // The user couldn't find or fix these via the wizard. Now we show ALL trades for live tickers
  // with their current link state visible and editable.
  const linkWizardData = useMemo(() => {
    if (!linkWizardOpen || !journaledTrades) return null;
    const openByTicker = {};
    const liveTickers = new Set();
    const livePosIds = new Set();
    (positions || []).forEach(p => {
      const sym = String(p.sym || "").toUpperCase();
      if (!sym) return;
      liveTickers.add(sym);
      livePosIds.add(String(p.id));
      (openByTicker[sym] = openByTicker[sym] || []).push(p);
    });
    // Eligible rows:
    //   (a) ticker has an open lot — always show so user can review/fix every closed trade on a held ticker
    //   (b) ticker has NO open lot AND the trade is unlinked — show so user can mark them past explicitly
    // We hide closed trades on tickers without open lots that are already linked (positionId truthy)
    // because there's nothing actionable to do.
    const eligible = journaledTrades.filter(t => {
      const sym = String(t.ticker || "").toUpperCase();
      if (liveTickers.has(sym)) return true;
      return !t.positionId;
    });
    const rows = eligible.map(t => {
      const sym = String(t.ticker || "").toUpperCase();
      const lots = openByTicker[sym] || [];
      // Determine current state:
      //   "unlinked" — positionId null/missing
      //   "past"     — explicitly excluded (sentinel string)
      //   "linked"   — points to a position that still exists
      //   "orphan"   — points to a position that's gone (closed/deleted)
      let state = "unlinked";
      if (t.positionId === "past") state = "past";
      else if (t.positionId != null && t.positionId !== "") {
        state = livePosIds.has(String(t.positionId)) ? "linked" : "orphan";
      }
      // Auto-suggest: keep current link if it's valid; otherwise propose
      let suggestion;
      if (state === "linked") suggestion = t.positionId;
      else if (state === "past") suggestion = "past";
      else {
        // Propose based on tickers/dates
        suggestion = "past"; // safe default
        if (lots.length === 1) {
          const p = lots[0];
          const sameDay = tradeDateISO(t.entry) === tradeDateISO(p.entry);
          const isPartialTrim = t.reason === "Partial Trim";
          // Date-rule match: trade exit >= position entry → this trade is provably a partial of
          // the current open lot (you'd have to be flat to re-open, so exit-before-entry = past cycle).
          const exitAfterPosEntry = (() => {
            const tExit = tradeDateISO(t.exit);
            const pEntry = tradeDateISO(p.entry);
            return tExit && pEntry && tExit >= pEntry;
          })();
          if (isPartialTrim || sameDay || exitAfterPosEntry) suggestion = p.id;
        } else if (lots.length > 1) {
          const matches = lots.filter(p => tradeDateISO(t.entry) === tradeDateISO(p.entry));
          if (matches.length === 1) suggestion = matches[0].id;
        }
      }
      return { t, lots, suggestion, state };
    });
    // Sort: orphans first (need fixing), then unlinked actionable rows, then everything else by ticker.
    rows.sort((a, b) => {
      const rank = r => r.state === "orphan" ? 0 : r.state === "unlinked" && r.lots.length > 0 ? 1 : r.state === "linked" ? 2 : r.state === "past" ? 3 : 4;
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      return String(a.t.ticker || "").localeCompare(String(b.t.ticker || ""));
    });
    return rows;
  }, [linkWizardOpen, journaledTrades, positions]);

  // Initialize choices when wizard opens
  useEffect(() => {
    if (!linkWizardOpen || !linkWizardData) return;
    const init = {};
    linkWizardData.forEach(r => { init[r.t.id] = r.suggestion; });
    setLinkChoices(init);
  }, [linkWizardOpen, linkWizardData]);

  const linkApply = useCallback(async () => {
    if (!linkWizardData) return;
    setLinkError("");
    setLinkStatus("applying");
    // Build write plan first. Choices: a positionId (id), "past" (mirror sentinel — explicit exclude),
    // or "skip" (no change). For DB writes we collapse "past" → null (we don't add an explicit
    // past_cycle column); the localStorage mirror records "past" so the matcher honors the exclusion.
    const updates = linkWizardData.map(r => {
      const choice = linkChoices[r.t.id] ?? r.suggestion;
      let mirroredValue, dbValue, skip = false;
      if (choice === "skip") { skip = true; mirroredValue = undefined; dbValue = undefined; }
      else if (choice === "past") { mirroredValue = "past"; dbValue = null; }
      else { mirroredValue = choice; dbValue = choice; }
      return { tradeId: r.t.id, mirroredValue, dbValue, skip };
    });
    const writes = updates.filter(u => !u.skip);
    // STEP 1 — mirror to localStorage IMMEDIATELY. This is the safety net: even if the DB write
    // silently fails (missing column, RLS, type mismatch), this mirror survives refresh and the
    // load mapper backfills `positionId` from it. Refresh-proof, no schema migration required.
    saveTradeLinks(writes.map(u => ({ tradeId: u.tradeId, positionId: u.mirroredValue })));
    // STEP 1b — durable cross-device store via user_settings.trade_links (JSON blob). The full
    // localStorage object is upserted so this row IS the source of truth on a fresh device / cleared
    // browser. Async — doesn't block the wizard. No schema migration: user_settings already exists.
    if (session) syncTradeLinksToSupabase(supabase, session.user.id);
    // STEP 2 — update local state from the mirror values (so the matcher sees the link this render).
    setJournaledTrades(prev => prev.map(t => {
      const u = writes.find(x => x.tradeId === t.id);
      return u ? { ...t, positionId: u.mirroredValue } : t;
    }));
    // STEP 3 — best-effort DB write. Surfaced errors are informational, not blocking — the link is
    // already persisted via the mirror. If DB writes succeed, the canonical store stays in sync.
    let failures = [];
    if (session) {
      await Promise.all(writes.map(async u => {
        try {
          const { data, error } = await supabase
            .from("trades")
            .update({ position_id: u.dbValue })
            .eq("id", u.tradeId)
            .select("id, position_id");
          if (error) { failures.push({ tradeId: u.tradeId, reason: error.message }); return; }
          if (!data || data.length === 0) { failures.push({ tradeId: u.tradeId, reason: "row not found / RLS blocked" }); return; }
          const stored = data[0].position_id;
          const want = u.dbValue == null ? null : String(u.dbValue);
          const got = stored == null ? null : String(stored);
          if (want !== got) failures.push({ tradeId: u.tradeId, reason: `wrote ${want}, DB returned ${got}` });
        } catch (err) {
          failures.push({ tradeId: u.tradeId, reason: err.message || "unknown error" });
        }
      }));
    }
    if (failures.length > 0) {
      // Informational — the local mirror has the link, so the wizard still completes successfully.
      const sample = failures[0];
      setLinkError(`Links saved locally on this device (${writes.length - failures.length}/${writes.length} also saved to your account). To sync the rest across devices, run this in Supabase SQL: alter table trades add column if not exists position_id bigint references positions(id) on delete set null; create index if not exists trades_position_id_idx on trades(position_id);  First DB error: ${sample.reason}`);
    }
    setLinkStatus("done");
    setTimeout(() => { setLinkWizardOpen(false); setLinkStatus(""); setLinkError(""); }, failures.length > 0 ? 2200 : 1100);
  }, [linkWizardData, linkChoices, session, setJournaledTrades]);

  const activeFilterLabel = filterSetup !== "All" || filterTag !== "All" ? ` (filtered: ${filtered.length}/${allTrades.length})` : "";

  // ─── MOCKUP-UI RENDER (journal-recommended.html) ───
  // Exact port of the mockup: its real CSS (injected scoped under `.vj`, see JOUR_CSS)
  // + its exact markup as JSX, wired to the live memos/handlers above. Mirrors the
  // Dashboard port (DASH_CSS / `.vd`) for navbar, Guided/Pro mode, Simple/Pro table
  // view (localStorage "viv-mode"/"viv-view"), scroll-reveal and the guide assistant.
  // ════════════════════════════════════════════════════════════════════════════
  const [uiMode, setUiMode] = useState(() => { try { return localStorage.getItem("viv-mode") === "pro" ? "pro" : "guided"; } catch { return "guided"; } });
  const [tableView, setTableView] = useState(() => { try { return localStorage.getItem("viv-view") === "pro" ? "pro" : "simple"; } catch { return "simple"; } });
  useEffect(() => { try { localStorage.setItem("viv-mode", uiMode); } catch {} }, [uiMode]);
  useEffect(() => { try { localStorage.setItem("viv-view", tableView); } catch {} }, [tableView]);
  const expert = uiMode === "pro";
  const showPro = expert || tableView === "pro";
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => { try { return localStorage.getItem("viv-jwelcome-x") === "1"; } catch { return false; } });

  // guide assistant (hover → narrate), mirrors DashboardPage
  const [activeGuide, setActiveGuide] = useState(null);
  const [guide, setGuide] = useState(null);
  const [guideMuted, setGuideMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef(null);
  const rootRef = useRef(null);

  // scroll-reveal: add in-view so gated content (h1/sub/spark/bars/streak) becomes visible + animates
  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    const els = root.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("in-view")); return; }
    const io = new IntersectionObserver((ents) => { ents.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in-view"); io.unobserve(en.target); } }); }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
    els.forEach(e => io.observe(e));
    // The one-shot observer can latch a stale "not intersecting" state during the initial
    // data-load/layout settle and never re-fire (a short page doesn't scroll), which leaves gated
    // content stuck hidden (e.g. the risk-allocation bar at width 0). After things settle, reveal
    // anything that's actually on-screen so it can't get stuck.
    const settle = setTimeout(() => {
      els.forEach(e => {
        if (e.classList.contains("in-view")) return;
        const r = e.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) { e.classList.add("in-view"); io.unobserve(e); }
      });
    }, 600);
    return () => { io.disconnect(); clearTimeout(settle); };
  }, []);

  const applyMode = (m) => { setUiMode(m); if (m === "pro") { try { audioRef.current && audioRef.current.pause(); } catch {} setGuide(null); setActiveGuide(null); } };
  const narrate = (audio) => { if (guideMuted || !audio || !audioRef.current) return; try { audioRef.current.pause(); audioRef.current.src = audio; audioRef.current.currentTime = 0; audioRef.current.play().catch(() => {}); } catch {} };
  const guideEnter = (key, title, body, audio) => () => { if (expert) return; setActiveGuide(key); setGuide({ title, body }); narrate(audio); };
  const guideLeave = (key) => () => { setActiveGuide(g => (g === key ? null : g)); };
  const gactive = (key) => (!expert && activeGuide === key ? " guide-active" : "");

  // ── formatters (match the mockup's sgn* helpers) ──
  const startCap = +(portfolioSize || 0);
  const sgnMoney = (n) => (n >= 0 ? "+" : "−") + "$" + Math.abs(Math.round(n || 0)).toLocaleString("en-US");
  const sgnPct = (n) => (n >= 0 ? "+" : "−") + Math.abs(n || 0).toFixed(2) + "%";
  const sgnR = (n) => (n >= 0 ? "+" : "−") + Math.abs(n || 0).toFixed(2) + "R";

  // ── NEW: date-range filter (mockup adds All time / This month / Quarter / YTD / Last 30 / 90 / Custom) ──
  const [dateRange, setDateRange] = useState("all");   // all | mtd | qtd | ytd | 30 | 90 | custom
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const dateFiltered = useMemo(() => {
    if (dateRange === "all") return filtered;
    const now = new Date();
    return filtered.filter(t => {
      const iso = tradeDateISO(t.exit || t.entry || "");
      if (!iso) return false;
      const d = new Date(iso + "T00:00:00");
      if (isNaN(d)) return false;
      if (dateRange === "custom") {
        if (dateFrom && d < new Date(dateFrom + "T00:00:00")) return false;
        if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
        return true;
      }
      if (dateRange === "mtd") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (dateRange === "qtd") return Math.floor(d.getMonth() / 3) === Math.floor(now.getMonth() / 3) && d.getFullYear() === now.getFullYear();
      if (dateRange === "ytd") return d.getFullYear() === now.getFullYear();
      const days = parseInt(dateRange, 10);
      if (days) { const cut = new Date(now); cut.setDate(cut.getDate() - days); return d >= cut && d <= now; }
      return true;
    });
  }, [filtered, dateRange, dateFrom, dateTo]);

  const dfActive = filterSetup !== "All" || filterTag !== "All" || dateRange !== "all";

  // ── NEW: edge / projection figures computed from `stats` over the date-filtered slice ──
  // stats is memoized off `filtered`; the hero/edge/metrics here use `dateFiltered` so the
  // date predicate flows through. Recompute the headline numbers locally on dateFiltered.
  const dstats = useMemo(() => {
    const tr = dateFiltered;
    const wins = tr.filter(t => (Number(t.plPct) || 0) > 0);
    const losses = tr.filter(t => (Number(t.plPct) || 0) <= 0);
    const n = tr.length;
    const totalPL = tr.reduce((a, t) => a + (Number(t.plDollar) || 0), 0);
    const avgGain = wins.length ? wins.reduce((a, t) => a + (Number(t.plPct) || 0), 0) / wins.length : 0;
    const avgLoss = losses.length ? Math.abs(losses.reduce((a, t) => a + (Number(t.plPct) || 0), 0) / losses.length) : 0;
    const grossWin = wins.reduce((a, t) => a + (Number(t.plDollar) || 0), 0);
    const grossLoss = Math.abs(losses.reduce((a, t) => a + (Number(t.plDollar) || 0), 0));
    const rTrades = tr.filter(t => t.rMult != null);
    const expectancy = rTrades.length ? rTrades.reduce((a, t) => a + Number(t.rMult), 0) / rTrades.length : 0;
    let lw = null, ll = null;
    wins.forEach(t => { if (!lw || (Number(t.plPct) || 0) > (Number(lw.plPct) || 0)) lw = t; });
    losses.forEach(t => { if (!ll || (Number(t.plPct) || 0) < (Number(ll.plPct) || 0)) ll = t; });
    const winFrac = n ? wins.length / n : 0, lossFrac = n ? losses.length / n : 0;
    const adjWL = (avgLoss && lossFrac) ? Math.abs((avgGain * winFrac) / (avgLoss * lossFrac)) : 0;
    // hold days (same formula as `stats`)
    const holdDays = (t) => {
      if (!t.entry || !t.exit) return null;
      const d1 = new Date(t.entry), d2 = new Date(t.exit);
      if (isNaN(d1) || isNaN(d2)) return null;
      if (t.entryTime && t.exitTime) {
        const [eh, em] = String(t.entryTime).split(":").map(Number);
        const [xh, xm] = String(t.exitTime).split(":").map(Number);
        if (!isNaN(eh) && !isNaN(em)) d1.setHours(eh, em, 0, 0);
        if (!isNaN(xh) && !isNaN(xm)) d2.setHours(xh, xm, 0, 0);
        return +(Math.max(0, d2 - d1) / 86400000).toFixed(1);
      }
      return Math.max(0, Math.round((d2 - d1) / 86400000));
    };
    const winDays = wins.map(holdDays).filter(d => d !== null);
    const lossDays = losses.map(holdDays).filter(d => d !== null);
    const avgHoldWin = winDays.length ? winDays.reduce((a, d) => a + d, 0) / winDays.length : 0;
    const avgHoldLoss = lossDays.length ? lossDays.reduce((a, d) => a + d, 0) / lossDays.length : 0;
    const holdRatio = avgHoldLoss ? avgHoldWin / avgHoldLoss : 0;
    // win streak (most-recent run by exit date)
    const sorted = tr.slice().sort((a, b) => Date.parse(tradeDateISO(a.exit) || 0) - Date.parse(tradeDateISO(b.exit) || 0));
    let streakN = 0, streakWin = true;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const w = (Number(sorted[i].plPct) || 0) > 0;
      if (i === sorted.length - 1) { streakWin = w; streakN = 1; }
      else if (w === streakWin) streakN++; else break;
    }
    if (!sorted.length) streakN = 0;
    const totalRet = startCap > 0 ? (totalPL / startCap) * 100 : 0;
    return {
      n, wins: wins.length, losses: losses.length, totalPL, totalRet,
      winRate: n ? wins.length / n * 100 : 0, avgGain, avgLoss,
      wlr: avgLoss ? Math.abs(avgGain / avgLoss) : 0, expectancy,
      pf: grossLoss ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0),
      lw, ll, streakN, streakWin, adjWL, avgHoldWin, avgHoldLoss, holdRatio, totalComm: tr.reduce((a, t) => a + (parseFloat(t.commission) || 0), 0),
    };
  }, [dateFiltered, startCap]);

  const edgePos = dstats.expectancy >= 0;
  const per$ = dstats.n ? dstats.totalPL / dstats.n : 0;
  const proj100R = dstats.expectancy * 100;
  const proj100$ = per$ * 100;
  // Small-sample guard: projecting 100 trades from a thin sample (e.g. 20 trades → ×5) amplifies any
  // edge and can show an inflated, promise-like number. Below this count we flag the projection as a
  // provisional "early read" rather than a forecast. Math is unchanged — display caveat only.
  const PROJ_MIN_TRADES = 30;
  const projProvisional = dstats.n > 0 && dstats.n < PROJ_MIN_TRADES;

  // ── hero realized-P/L sparkline (cumulative, green up / red down) over dateFiltered ──
  const heroSpark = useMemo(() => {
    const sorted = dateFiltered.slice().sort((a, b) => Date.parse(tradeDateISO(a.exit) || 0) - Date.parse(tradeDateISO(b.exit) || 0));
    const eq = [0]; sorted.forEach(t => eq.push(eq[eq.length - 1] + (Number(t.plDollar) || 0)));
    const lo = Math.min(...eq), hi = Math.max(...eq), range = (hi - lo) || 1;
    const Xs = (i) => eq.length > 1 ? (i / (eq.length - 1)) * 320 : 0;
    const Ys = (v) => 6 + (1 - (v - lo) / range) * 38;
    const line = eq.length > 1 ? "M" + eq.map((v, i) => Xs(i).toFixed(1) + "," + Ys(v).toFixed(1)).join(" L") : "M0," + Ys(0).toFixed(1) + " L320," + Ys(0).toFixed(1);
    const up = eq[eq.length - 1] >= 0;
    return { line, area: line + " L320,50 L0,50 Z", up };
  }, [dateFiltered]);

  // ── equity-curve SVG (green-above / red-below split, $/% Y-axis, by trade / by month X) ──
  const eqMode = (privacyMode ? "%" : eqYAxis);          // "$" | "%" (privacy forces %)
  const eqSvg = useMemo(() => {
    const sorted = dateFiltered.slice().sort((a, b) => Date.parse(tradeDateISO(a.exit) || 0) - Date.parse(tradeDateISO(b.exit) || 0));
    // Cumulative equity series — one node per calendar DAY (By Date) or per month (By Month).
    // Trades that fall on the same date/month are summed into a single node, so the X axis shows
    // dates (never times) and same-day trades total together rather than each getting its own point.
    const groupKeys = [];
    const eq = [startCap];
    {
      const sums = {};
      sorted.forEach(t => {
        const iso = tradeDateISO(t.exit || t.entry) || "Unknown";
        const k = eqXAxis === "months" ? (iso.slice(0, 7) || "Unknown") : iso; // YYYY-MM or YYYY-MM-DD
        if (!(k in sums)) { sums[k] = 0; groupKeys.push(k); }
        sums[k] += (Number(t.plDollar) || 0);
      });
      groupKeys.sort();
      groupKeys.forEach(k => eq.push(eq[eq.length - 1] + sums[k]));
    }
    let lo = Math.min(...eq), hi = Math.max(...eq); if (hi === lo) hi = lo + 1;
    const pad = 12, W = 600, H = 210, h = H - 2 * pad;
    const X = (i) => eq.length > 1 ? (i / (eq.length - 1)) * W : 0;
    const Y = (v) => pad + (1 - (v - lo) / (hi - lo)) * h;
    const yb = Y(startCap);
    const pts = eq.map((v, i) => ({ x: X(i), y: Y(v), v }));
    const posSegs = [], negSegs = []; let cur = [], curSign = null;
    const flush = () => { if (cur.length > 1) (curSign >= 0 ? posSegs : negSegs).push(cur); cur = []; };
    for (let pi = 0; pi < pts.length; pi++) {
      const p = pts[pi], sign = p.v >= startCap ? 1 : -1;
      if (pi === 0) { curSign = sign; cur = [{ x: p.x, y: p.y }]; continue; }
      const prev = pts[pi - 1], prevSign = prev.v >= startCap ? 1 : -1;
      if (sign !== prevSign && (p.v - prev.v) !== 0) {
        const f = (startCap - prev.v) / (p.v - prev.v), cx = prev.x + (p.x - prev.x) * f;
        cur.push({ x: cx, y: yb }); flush(); curSign = sign; cur = [{ x: cx, y: yb }, { x: p.x, y: p.y }];
      } else cur.push({ x: p.x, y: p.y });
    }
    flush();
    const linePath = (segs) => segs.map(s => "M" + s.map(q => q.x.toFixed(1) + "," + q.y.toFixed(1)).join(" L")).join(" ");
    const areaPath = (segs) => segs.map(s => "M" + s[0].x.toFixed(1) + "," + yb.toFixed(1) + " L" + s.map(q => q.x.toFixed(1) + "," + q.y.toFixed(1)).join(" L") + " L" + s[s.length - 1].x.toFixed(1) + "," + yb.toFixed(1) + " Z").join(" ");
    const pct = eqMode === "%";
    const ylab = (v) => { if (pct) { const p = startCap > 0 ? (v - startCap) / startCap * 100 : 0; return Math.round(p) === 0 ? "0%" : (p > 0 ? "+" : "−") + Math.abs(Math.round(p)) + "%"; } return "$" + Math.round(v / 1000) + "k"; };
    const yLabels = [hi, lo + (hi - lo) * 2 / 3, lo + (hi - lo) / 3, lo].map(ylab);
    let xs;
    if (eqXAxis === "months") { xs = groupKeys.map(m => { const d = new Date(m + "-15"); return isNaN(d) ? m : d.toLocaleString("default", { month: "short", year: "2-digit" }); }); }
    else {
      const ds = groupKeys.map(k => { const p = k.split("-"); return p.length === 3 ? (+p[1]) + "/" + (+p[2]) : k; }); // one label per day (M/D)
      if (ds.length <= 8) xs = ds;
      else { const step = (ds.length - 1) / 7; xs = Array.from({ length: 8 }, (_, k) => ds[Math.round(k * step)]); }
    }
    const totalPL = eq[eq.length - 1] - startCap, totalRet = startCap > 0 ? totalPL / startCap * 100 : 0, n = sorted.length;
    return { yb, linePos: linePath(posSegs), lineNeg: linePath(negSegs), areaPos: areaPath(posSegs), areaNeg: areaPath(negSegs), yLabels, xs, totalPL, totalRet, n, pct };
  }, [dateFiltered, startCap, eqMode, eqXAxis]);

  // ── NEW: return-distribution buckets (mockup's fixed 10 buckets, editable what-if) ──
  const DIST_BUCKETS = useMemo(() => ([
    { lo: -Infinity, hi: -6, side: "neg", lab: "−6% or worse", mid: -8 }, { lo: -6, hi: -4, side: "neg", lab: "−6% to −4%", mid: -5 },
    { lo: -4, hi: -2, side: "neg", lab: "−4% to −2%", mid: -3 }, { lo: -2, hi: 0, side: "neg", lab: "−2% to 0%", mid: -1 },
    { lo: 0, hi: 4, side: "pos", lab: "0% to +4%", mid: 2 }, { lo: 4, hi: 8, side: "pos", lab: "+4% to +8%", mid: 6 },
    { lo: 8, hi: 12, side: "pos", lab: "+8% to +12%", mid: 10 }, { lo: 12, hi: 16, side: "pos", lab: "+12% to +16%", mid: 14 },
    { lo: 16, hi: 20, side: "pos", lab: "+16% to +20%", mid: 18 }, { lo: 20, hi: Infinity, side: "pos", lab: "+20% or more", mid: 24 },
  ]), []);
  const [distPanelOpen, setDistPanelOpen] = useState(false);
  const [distEdits, setDistEdits] = useState({});        // {bucketIdx: count} what-if overrides
  const distBase = useMemo(() => DIST_BUCKETS.map(b => dateFiltered.filter(t => { const r = Number(t.plPct) || 0; return r >= b.lo && r < b.hi; }).length), [DIST_BUCKETS, dateFiltered]);
  useEffect(() => { setDistEdits({}); }, [dateFiltered]);   // a new slice clears the what-if edits
  const distCounts = DIST_BUCKETS.map((_, i) => distEdits[i] !== undefined ? distEdits[i] : (distBase[i] || 0));
  const distTotal = distCounts.reduce((a, c) => a + c, 0);
  const distWins = DIST_BUCKETS.reduce((a, b, i) => a + (b.side === "pos" ? distCounts[i] : 0), 0);
  const distLosses = distTotal - distWins;
  const distRpt = distTotal ? distCounts.reduce((a, c, i) => a + c * DIST_BUCKETS[i].mid, 0) / distTotal : 0;
  const distFmtPct = (v) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) + "%";

  // ── NEW: VIV Analytics — scoped by ALL / MONTH / WEEK / DAY (off dateFiltered) ──
  const [vaPeriod, setVaPeriod] = useState("all");
  const vaScoped = useMemo(() => {
    if (vaPeriod === "all") return dateFiltered;
    // anchor "now" to the latest exit in the slice so MONTH/WEEK/DAY stay lively
    let anchor = null;
    dateFiltered.forEach(t => { const iso = tradeDateISO(t.exit || t.entry); if (iso) { const d = new Date(iso + "T00:00:00"); if (!anchor || d > anchor) anchor = d; } });
    if (!anchor) return [];
    return dateFiltered.filter(t => {
      const iso = tradeDateISO(t.exit || t.entry); if (!iso) return false;
      const d = new Date(iso + "T00:00:00");
      if (vaPeriod === "day") return d.getTime() === anchor.getTime();
      if (vaPeriod === "week") { const c = new Date(anchor); c.setDate(c.getDate() - 6); return d >= c && d <= anchor; }
      if (vaPeriod === "month") return d.getMonth() === anchor.getMonth() && d.getFullYear() === anchor.getFullYear();
      return true;
    });
  }, [dateFiltered, vaPeriod]);
  const va = useMemo(() => {
    const tr = vaScoped;
    const wins = tr.filter(t => (Number(t.plPct) || 0) > 0), losses = tr.filter(t => (Number(t.plPct) || 0) <= 0);
    const n = tr.length, net = tr.reduce((a, t) => a + (Number(t.plDollar) || 0), 0);
    const winRate = n ? wins.length / n * 100 : 0;
    const rT = tr.filter(t => t.rMult != null);
    const expectancy = rT.length ? rT.reduce((a, t) => a + Number(t.rMult), 0) / rT.length : 0;
    const outliers = tr.filter(t => Math.abs(Number(t.rMult) || 0) >= 2.5);
    const tagCount = {}; tr.forEach(t => (t.tags || []).forEach(g => { tagCount[g] = (tagCount[g] || 0) + 1; }));
    const tags = Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a]).slice(0, 5).map(g => ({ g, c: tagCount[g] }));
    const winners = wins.slice().sort((a, b) => (Number(b.plDollar) || 0) - (Number(a.plDollar) || 0)).slice(0, 3);
    const losersArr = losses.slice().sort((a, b) => (Number(a.plDollar) || 0) - (Number(b.plDollar) || 0)).slice(0, 3);
    const best = winners[0];
    // setup-level avg R for the insights
    const bySetup = {}; tr.forEach(t => { (bySetup[t.setup] = bySetup[t.setup] || []).push(t); });
    const setupNames = Object.keys(bySetup).filter(Boolean);
    const avgR = (arr) => arr.reduce((a, t) => a + (Number(t.rMult) || 0), 0) / arr.length;
    setupNames.sort((a, b) => avgR(bySetup[b]) - avgR(bySetup[a]));
    const bestS = setupNames[0], worstS = setupNames[setupNames.length - 1];
    const avgHoldWin = (() => { const ds = wins.map(t => { if (!t.entry || !t.exit) return null; const a = new Date(t.entry), b = new Date(t.exit); return isNaN(a) || isNaN(b) ? null : Math.max(0, Math.round((b - a) / 86400000)); }).filter(d => d !== null); return ds.length ? ds.reduce((a, d) => a + d, 0) / ds.length : 0; })();
    const avgHoldLose = (() => { const ds = losses.map(t => { if (!t.entry || !t.exit) return null; const a = new Date(t.entry), b = new Date(t.exit); return isNaN(a) || isNaN(b) ? null : Math.max(0, Math.round((b - a) / 86400000)); }).filter(d => d !== null); return ds.length ? ds.reduce((a, d) => a + d, 0) / ds.length : 0; })();
    const holdRatio = avgHoldLose ? avgHoldWin / avgHoldLose : 0;
    return { n, wins: wins.length, losses: losses.length, net, winRate, expectancy, outliers, tags, winners, losers: losersArr, best, bySetup, bestS, worstS, avgHoldWin, avgHoldLose, holdRatio };
  }, [vaScoped]);
  const vaInsights = useMemo(() => {
    const ins = [];
    const sgn = (n) => (n >= 0 ? "+" : "−") + Math.abs(n || 0).toFixed(2) + "R";
    if (va.bestS) { const a = va.bySetup[va.bestS], r = a.reduce((s, t) => s + (Number(t.rMult) || 0), 0) / a.length; ins.push({ k: "pos", ic: "▲", t: <>Strongest setup is <b>{va.bestS}</b> at <b>{sgn(r)}</b> avg over {a.length} trade{a.length === 1 ? "" : "s"}.</> }); }
    if (va.worstS && va.worstS !== va.bestS) { const a = va.bySetup[va.worstS], r = a.reduce((s, t) => s + (Number(t.rMult) || 0), 0) / a.length; ins.push({ k: "neg", ic: "▼", t: <><b>{va.worstS}</b> is lagging at <b>{sgn(r)}</b> avg — review entries or size it down.</> }); }
    if (va.wins && va.losses) ins.push({ k: "tip", ic: "◆", t: <>Winners are held <b>{va.avgHoldWin.toFixed(0)}d</b> vs <b>{va.avgHoldLose.toFixed(0)}d</b> for losers — you {va.holdRatio >= 1.3 ? "let winners run" : "cut winners a touch early"}.</> });
    if (va.outliers.length) ins.push({ k: "pos", ic: "★", t: <><b>{va.outliers.length}</b> outlier trade{va.outliers.length === 1 ? "" : "s"} (|R| ≥ 2.5) carried most of the result — concentration is doing the work.</> });
    if (!ins.length) ins.push({ k: "tip", ic: "◆", t: "Log a few more trades to unlock setup-level insights." });
    return ins;
  }, [va]);
  const PERIOD_NET_LABEL = { all: "Net P/L · all time", month: "Net P/L · this month", week: "Net P/L · this week", day: "Net P/L · today" };

  // ── per-trade derived helpers for the table / review panel ──
  const holdLabel = (t) => {
    if (!t.entry || !t.exit) return "—";
    const a = new Date(t.entry), b = new Date(t.exit);
    if (isNaN(a) || isNaN(b)) return "—";
    return Math.max(0, Math.round((b - a) / 86400000)) + "d";
  };
  const firstName = (displayName && displayName.trim()) || (session?.user?.email ? session.user.email.split("@")[0] : "trader");

  return (
    <div className={"vj" + (expert ? " expert" : "") + (showPro ? " pro" : "")} ref={rootRef}>
      <style dangerouslySetInnerHTML={{ __html: JOUR_CSS }} />
      <audio ref={audioRef} preload="auto" onPlaying={() => setSpeaking(true)} onEnded={() => setSpeaking(false)} onPause={() => setSpeaking(false)} />
      <div className="shell">

        {/* NAV TABS — verbatim from Dashboard, Journal active */}
        <div className="navbar">
          <div className="brand"><img src="/logo-mark.png" alt="Valen Insiders Vault" style={{ width: 24, height: 24, objectFit: "contain", display: "block" }} /> Valen Insiders Vault</div>
          <div className="tabs">
            <a style={{ cursor: "pointer" }} onClick={() => setPage && setPage("dashboard")}>Dashboard</a>
            <a className="on" style={{ cursor: "pointer" }} onClick={() => setPage && setPage("journal")}>Journal</a>
            <a style={{ cursor: "pointer" }} onClick={() => setPage && setPage("tools")}>Premium tools</a>
            <a style={{ cursor: "pointer" }} onClick={() => setPage && setPage("settings")}>Settings</a>
          </div>
          <div className="spacer"></div>
          <div className="seg" id="modeSeg" title="Guided explains everything; Pro strips it back for experts">
            <button className={uiMode === "guided" ? "on" : ""} onClick={() => applyMode("guided")}>Guided</button>
            <button className={uiMode === "pro" ? "on" : ""} onClick={() => applyMode("pro")}>Pro</button>
          </div>
          <WhatsNew />
          <button onClick={() => onLogout && onLogout()} title="Sign out" style={{ marginLeft: 14, background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", fontFamily: "var(--font)", fontSize: "0.72rem", fontWeight: 700, padding: "7px 14px", borderRadius: 980, cursor: "pointer" }}>Sign out</button>
        </div>

        {/* HEADER */}
        <div className="reveal">
          <div className="eyebrow">Journal</div>
          <div className="h1" style={{ marginTop: 6 }}>Your track record, <span className="goldname">{firstName}</span></div>
          <div className="sub">Every closed trade, your performance, and whether your system actually has an edge.</div>
        </div>

        {/* TOOLBAR (Performance Tracker actions) */}
        <div className="jtoolbar">
          <button className={"btn" + (privacyMode ? " on" : "")} id="privacyBtn" onClick={() => setPrivacyMode(p => !p)} title="Show percentages instead of dollar amounts so you can screenshot without revealing your account size">
            <svg className="ti" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <span>{privacyMode ? "Privacy on" : "Privacy"}</span>
          </button>
          <div className="ddwrap">
            <button className="btn" onClick={(e) => { e.stopPropagation(); setShareMenuOpen(o => !o); }} title="Capture a branded image of your stats to share">{screenshotting ? "Capturing…" : shareStatus === "copied" ? "Copied ✓" : shareStatus === "downloaded" ? "Downloaded ✓" : "Share stats ▾"}</button>
            <div className={"dd" + (shareMenuOpen ? " open" : "")}>
              <button onClick={() => { setShareMenuOpen(false); captureStats("copy"); }}>Copy image to clipboard</button>
              <button onClick={() => { setShareMenuOpen(false); captureStats("download"); }}>Download PNG</button>
            </div>
          </div>
          <button className="btn" onClick={() => exportMasterCSV(positions, dateFiltered)} title="Download your closed trades as a CSV file">Export CSV</button>
          <label className="btn" title="Import trades from a CSV file" style={{ cursor: "pointer" }}>Import CSV<input type="file" accept=".csv" onChange={handleImport} style={{ display: "none" }} /></label>
          <button className="btn" onClick={() => setShowImportGuide(g => !g)} title="How to format your CSV">{showImportGuide ? "Hide guide" : "Import guide"}</button>
        </div>

        {/* Import result toast + guide (kept from the existing component) */}
        {importResult && (
          <div className="welcome" style={{ borderColor: importResult.success ? "var(--borderGold)" : "rgba(239,68,68,0.4)" }}>
            <span className="wd" style={{ background: importResult.success ? "var(--goldBright)" : "var(--red)" }}></span>
            <div>{importResult.success
              ? importResult.master
                ? `Master import: ${importResult.posCount} position${importResult.posCount !== 1 ? "s" : ""} + ${importResult.tradeCount} trade${importResult.tradeCount !== 1 ? "s" : ""} imported. Remember to Save on both Dashboard and Journal.`
                : `Successfully imported ${importResult.count} trade${importResult.count > 1 ? "s" : ""}. They now appear in your closed trades below.`
              : "Import failed — could not parse any trades. Check that your CSV has a header row with recognizable column names."}</div>
          </div>
        )}
        {showImportGuide && (
          <div className="card" style={{ marginTop: 14, padding: "20px 24px" }}>
            <div className="sech" style={{ marginBottom: 10 }}>How to Import Your Trades</div>
            <div style={{ fontSize: "0.78rem", color: "var(--text)", lineHeight: 1.7 }}>
              <p style={{ marginBottom: 8 }}>Export your trades as a CSV with a <b style={{ color: "var(--white)" }}>header row</b>. Recognized columns: Symbol/Ticker, Entry/Exit Date &amp; Time, Entry/Exit Price, Shares, Stop, Setup, Tags (semicolon-separated), P/L %, P/L $, R-Multiple, Exit Reason, Notes.</p>
              <p style={{ color: "var(--muted)" }}>P/L %, P/L $ and R-Multiple are auto-calculated from entry/exit/shares/stop if missing. Unrecognized columns are ignored.</p>
            </div>
          </div>
        )}

        {/* FILTER BAR */}
        <div className={"filterbar guide" + gactive("filter")} style={{ marginTop: 20 }} onMouseEnter={guideEnter("filter", "Filter your performance", "Slice your whole track record by setup, tag or date. Every number, chart and the trade list update instantly.", "/audio/journal-filter.mp3")} onMouseLeave={guideLeave("filter")}>
          <span className="flabel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
            Filter
          </span>
          <label className="fctl">Setup
            <select className={"filtsel" + (filterSetup !== "All" ? " active" : "")} value={filterSetup} onChange={e => setFilterSetup(e.target.value)}>
              {["All", ...setupTypes].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="fctl">Tag
            <select className={"filtsel" + (filterTag !== "All" ? " active" : "")} value={filterTag} onChange={e => setFilterTag(e.target.value)}>
              {["All", ...allTags].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="fctl">Dates
            <select className={"filtsel" + (dateRange !== "all" ? " active" : "")} value={dateRange} onChange={e => setDateRange(e.target.value)}>
              <option value="all">All time</option>
              <option value="mtd">This month</option>
              <option value="qtd">This quarter</option>
              <option value="ytd">Year to date</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="custom">Custom range…</option>
            </select>
          </label>
          {dateRange === "custom" && (
            <span className="fctl daterange">
              <input type="date" className="filtsel" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /><span style={{ color: "var(--muted)" }}>→</span><input type="date" className="filtsel" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </span>
          )}
          <span className="spacer"></span>
          <span className="fcount">{dfActive ? `${dateFiltered.length} of ${allTrades.length} trades` : `All ${allTrades.length} trades`}</span>
          {dfActive && <button className="btn" onClick={() => { setFilterSetup("All"); setFilterTag("All"); setDateRange("all"); setDateFrom(""); setDateTo(""); }}>Clear filters</button>}
        </div>

        {/* HERO */}
        <div className="jhero" ref={(el) => { jheroRef.current = el; screenshotRef.current = el; }}>
          <div className="herocol">
            <div className={"card north guide reveal" + gactive("track")} onMouseEnter={guideEnter("track", "Your track record", "Your complete trading history — total realized profit, win rate, and whether your system has a real edge.", "/audio/journal-track-record.mp3")} onMouseLeave={guideLeave("track")}>
              <div className="label">{dfActive ? "Realized P/L · filtered view" : "Total realized P/L · all closed trades"}</div>
              <div className="big" style={{ color: dstats.n ? (dstats.totalPL >= 0 ? "var(--green)" : "var(--red)") : "var(--muted)" }}><Cu>{!dstats.n ? "—" : privacyMode ? sgnPct(dstats.totalRet) : sgnMoney(dstats.totalPL)}</Cu></div>
              <div className="meta">{!dstats.n ? "No trades match this filter." : <>{sgnPct(dstats.totalRet)} on starting capital · {dstats.n} closed trade{dstats.n === 1 ? "" : "s"} · <span style={{ color: "var(--green)" }}>{dstats.wins} W</span> / <span style={{ color: "var(--red)" }}>{dstats.losses} L</span></>}</div>
              <svg className="spark" viewBox="0 0 320 50" preserveAspectRatio="none" role="img" aria-label="Cumulative P/L">
                <defs>
                  <linearGradient id="jsp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(34,197,94,0.34)" /><stop offset="100%" stopColor="rgba(34,197,94,0)" /></linearGradient>
                  <linearGradient id="jspr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(239,68,68,0.30)" /><stop offset="100%" stopColor="rgba(239,68,68,0)" /></linearGradient>
                </defs>
                <g id="heroRise">
                  <path d={heroSpark.area} fill={heroSpark.up ? "url(#jsp)" : "url(#jspr)"} />
                  <path d={heroSpark.line} fill="none" stroke={heroSpark.up ? "var(--green)" : "var(--red)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                </g>
              </svg>
              <div className="sparklabel">Cumulative P/L</div>
            </div>

            {/* WIN SHARE — only when green */}
            {dstats.n > 0 && dstats.totalPL > 0 && !winDismissed && (
              <div className="winsharecard viv-hide-screenshot" style={{ position: "relative" }}>
                <button className="winshare-x" aria-label="Dismiss" onClick={() => setWinDismissed(true)}>&times;</button>
                <div className="winshareblock">
                  <div className="winshareicon"><span className="winemoji">🎉</span></div>
                  <div>
                    <div className="winsharetitle">Your strategy is working — beautifully done.</div>
                    <div className="winsharebody">You're <b>green on your closed trades</b> — that's your edge showing up in real money. Share the win in the <b>Skool community</b>: your progress inspires others and the feedback keeps your momentum going. 🚀</div>
                    <button className="winsharebtn" type="button" onClick={shareWin} disabled={winShareBusy}>{winShareBusy ? "Preparing your win…" : "Share your win in the community →"}</button>
                  </div>
                </div>
              </div>
            )}

            {/* SUPPORT — only in the red/negative state */}
            {dstats.n > 0 && dstats.totalPL <= 0 && !supportDismissed && (
              <div className="supportcard" style={{ position: "relative" }}>
                <button className="winshare-x" aria-label="Dismiss" onClick={() => setSupportDismissed(true)}>&times;</button>
                <div className="supportgrid">
                  <div className="supportblock">
                    <div className="supicon">🤝</div>
                    <div>
                      <div className="suptitle">A rough patch isn't the end of the road.</div>
                      <div className="supbody">Stuck or not sure what's going wrong? Bring it to the <b>Skool community</b> — our people are in there every day and will gladly look at your trades. You don't have to figure this out alone.</div>
                      <a className="supbtn" href="https://www.skool.com/valensontrades" target="_blank" rel="noopener noreferrer">Ask the community →</a>
                    </div>
                  </div>
                  <div className="supportblock">
                    <div className="supicon">🧠</div>
                    <div>
                      <div className="suptitle">Protect your headspace first.</div>
                      <div className="supbody">Your mental health matters more than any single trade. If the screen is getting heavy, step away, take a breath, and come back clear. Drawdowns pass; your wellbeing comes first.</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>{/* /herocol */}

          {/* YOUR EDGE */}
          <div className={"card edge guide reveal" + gactive("edge")} onMouseEnter={guideEnter("edge", "Your edge", "Whether your trading works in plain words. A positive edge means your expectancy per trade is above zero.", "/audio/journal-metrics.mp3")} onMouseLeave={guideLeave("edge")}>
            <div className="edgehead"><span className="edgedot" style={{ background: edgePos ? "var(--green)" : "var(--red)", boxShadow: `0 0 10px ${edgePos ? "var(--green)" : "var(--red)"}` }}></span><span className="edgetitle">Your edge</span></div>
            <div className="edgebody">
              {!dstats.n ? "No trades match this filter — adjust the setup, tag or date above to see your edge."
                : <>You win <b>{Math.round(dstats.winRate)}%</b> of trades, and {dstats.wins && dstats.losses ? <>your winners average <b>{dstats.wlr.toFixed(2)}×</b> the size of your losers</> : dstats.wins ? "every trade in this slice was a winner" : "every trade in this slice was a loss"} — a <b>{edgePos ? "positive edge" : "negative edge"}</b> of <b>{sgnR(dstats.expectancy)}</b> per trade.</>}
            </div>
            <div className="edgerow">
              <div className="edgestat"><div className={"edgeval " + (edgePos ? "green" : "red")}>{dstats.n ? sgnR(dstats.expectancy) : "—"}</div><div className="edgek">Expectancy / trade</div></div>
              <div className="edgestat"><div className="edgeval gold">{dstats.n ? (isFinite(dstats.pf) ? dstats.pf.toFixed(2) : (dstats.wins ? "∞" : "—")) : "—"}</div><div className="edgek">Profit factor</div></div>
            </div>
            {dstats.n > 0 && <div style={{ marginTop: 14 }}><span className="streak" style={{ color: dstats.streakWin ? "#86efac" : "#fca5a5" }}>{(dstats.streakWin ? "▲ " : "▼ ") + dstats.streakN + "-trade " + (dstats.streakWin ? "win streak" : "losing streak")}</span></div>}
            {dstats.n > 0 && (
              <div className="edgeproj">
                <div className="projlabel">{edgePos ? <span className="term" data-tip={"How this is calculated\nYour average result per trade × 100 — what 100 trades at your current average would return. A projection from your logged trades, not a repeat of your all-time total."}>{projProvisional ? <>If this <b>early</b> edge holds — your next <b>100 trades</b></> : <>If this holds for your next <b>100 trades</b></>}</span> : <>Your next 100 trades — let's fix the edge first</>}</div>
                {edgePos ? (
                  <>
                    {projProvisional && (
                      <div className="projprovis">
                        <span className="provischip">Early read</span>
                        <span>Only <b>{dstats.n}</b> trade{dstats.n === 1 ? "" : "s"} logged — this scales a small sample up to 100, so it can run high. Treat it as provisional, not a forecast; it firms up past <b>{PROJ_MIN_TRADES} trades</b>.</span>
                      </div>
                    )}
                    <div className="projrow">
                      <div className="projstat"><div className="projval green">{sgnR(proj100R)}</div><div className="edgek">Expected return (R)</div></div>
                      <div className="projstat"><div className={"projval " + (proj100$ >= 0 ? "green" : "red")}>{privacyMode ? sgnPct(startCap > 0 ? proj100$ / startCap * 100 : 0) : sgnMoney(proj100$)}</div><div className="edgek">Expected P/L</div></div>
                      <div className="projstat"><div className={"projval " + (proj100$ >= 0 ? "green" : "red")}>{sgnPct(startCap > 0 ? proj100$ / startCap * 100 : 0)}</div><div className="edgek">Expected return (%)</div></div>
                    </div>
                    <div className="projnote">Based on your current <b>{sgnR(dstats.expectancy)}</b>/trade across <b>{dstats.n}</b> logged trade{dstats.n === 1 ? "" : "s"}. A projection, not a promise — the more you log, the more reliable it gets.</div>
                  </>
                ) : (
                  <div className="edgediag">
                    <div className="dq">{(() => {
                      const L = Math.abs(dstats.avgLoss), bits = [];
                      if (L > 10) bits.push(`your average loss is ${L.toFixed(1)}%, past the 10% guardrail`);
                      if (dstats.wlr > 0 && dstats.wlr < 1.5) bits.push(`your average gain is only ${dstats.wlr.toFixed(1)}× your average loss`);
                      if (dstats.winRate < 40) bits.push(`you win just ${Math.round(dstats.winRate)}% of the time`);
                      return bits.length ? <>Your edge is negative because {bits.join(", and ")}. Which lever do you want to pull?</> : "Your edge is slightly negative. Which lever do you want to pull?";
                    })()}</div>
                    <div className="edgelevers">
                      {(() => {
                        const wr = dstats.winRate / 100, lr = 1 - wr, g = dstats.avgGain, L = Math.abs(dstats.avgLoss), items = [];
                        if (g + L > 0) { const needWR = L / (g + L) * 100; if (needWR <= 100 && needWR > dstats.winRate) items.push({ k: "Win rate", frac: (needWR - dstats.winRate) / Math.max(dstats.winRate, 1), t: <>Lift your win rate from <b>{Math.round(dstats.winRate)}%</b> to about <b>{Math.round(needWR)}%</b> — win more often at the same sizes.</> }); }
                        if (lr > 0) { const needL = wr * g / lr; if (needL > 0 && needL < L) items.push({ k: "Smaller losses", frac: (L - needL) / L, t: <>Cut your average loss from <b>{L.toFixed(1)}%</b> to about <b>{needL.toFixed(1)}%</b> — tighter stops, exit faster when you're wrong.</> }); }
                        if (wr > 0) { const needG = lr * L / wr; if (needG > g) items.push({ k: "Bigger wins", frac: (needG - g) / Math.max(g, 0.1), t: <>Grow your average win from <b>{g.toFixed(1)}%</b> to about <b>{needG.toFixed(1)}%</b> — let winners run, trail instead of taking full size off early.</> }); }
                        if (!items.length) return <div className="edgeadmin">We couldn't pin this on a single lever. <b>Reach out to our admin</b> and we'll analyse your trades together. 🤝</div>;
                        const focus = items.reduce((a, b) => b.frac < a.frac ? b : a);
                        return items.map((it, i) => <div key={i} className={"edgelever" + (it === focus ? " focus" : "")}><span className="lk">{it.k}{it === focus ? " ★" : ""}</span><span>{it.t}</span></div>);
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* KEY METRICS */}
        <div className="toolbar" style={{ marginTop: 34 }}>
          <h2 className="sech guide" onMouseEnter={guideEnter("metrics", "Key metrics", "These numbers tell you whether your trading works. Win rate is how often you win; expectancy is your average result per trade in units of risk.", "/audio/journal-metrics.mp3")} onMouseLeave={guideLeave("metrics")}>Key metrics</h2>
        </div>
        <div className="metrics">
          {(() => {
            const m = dstats;
            const tiles = [
              { k: "winRate", label: "Win rate", val: m.n ? Math.round(m.winRate) + "%" : "—", cls: m.winRate >= 50 ? "green" : "red", sub: `${m.wins} of ${m.n} trades`, tip: "Percentage of your closed trades that finished profitable." },
              { k: "avgGain", label: "Avg gain", val: m.wins ? sgnPct(m.avgGain) : "—", cls: "green", sub: "winners only", tip: "Average % return across your winning trades only." },
              { k: "avgLoss", label: "Avg loss", val: m.losses ? "−" + Math.abs(m.avgLoss).toFixed(2) + "%" : "—", cls: "red", sub: "losers only", tip: "Average % loss across your losing trades only." },
              { k: "wlr", label: "Win/Loss ratio", val: (m.wins && m.losses) ? m.wlr.toFixed(2) : "—", cls: "gold", sub: "winners vs losers", tip: "Average win ÷ average loss — how much bigger a typical winner is than a typical loser." },
              { k: "exp", label: "Expectancy", val: m.n ? (privacyMode ? sgnR(m.expectancy) : sgnMoney(m.totalPL / m.n)) : "—", cls: m.expectancy >= 0 ? "green" : "red", sub: "avg $ per trade", tip: "Your average dollar result per trade — total realized P/L ÷ number of trades. Above zero = a positive edge. (Privacy shows it in R.)" },
              { k: "pf", label: "Profit factor", val: m.n ? (isFinite(m.pf) ? m.pf.toFixed(2) : (m.wins ? "∞" : "—")) : "—", cls: "gold", sub: "gross win ÷ loss", tip: "Total profit from winners ÷ total loss from losers. Above 1.0 means the system makes money." },
              { k: "lw", label: "Largest win", val: m.lw ? sgnPct(Number(m.lw.plPct)) : "—", cls: "green", sub: m.lw ? m.lw.ticker : "—", tip: "Your single biggest winning trade by % return." },
              { k: "ll", label: "Largest loss", val: m.ll ? "−" + Math.abs(Number(m.ll.plPct)).toFixed(2) + "%" : "—", cls: "red", sub: m.ll ? m.ll.ticker : "—", tip: "Your single biggest losing trade by % return." },
              { k: "adjwl", label: "Adj. W/L ratio", val: (m.wins && m.losses) ? m.adjWL.toFixed(2) : "—", cls: "gold", sub: "frequency-adjusted", tip: "Payoff ratio adjusted for how often you win: (avg gain × win rate) ÷ (avg loss × loss rate). Above 1.0 means your wins outweigh your losses." },
              { k: "avgr", label: "Avg R-mult", val: m.n ? sgnR(m.expectancy) : "—", cls: m.expectancy >= 0 ? "green" : "red", sub: "all trades", tip: "Average R-multiple — your mean result measured in units of risk. Above 0 is a positive edge." },
              { k: "holdwin", label: "Avg hold (win)", val: m.wins ? Math.round(m.avgHoldWin) + "d" : "—", cls: "green", sub: "winners only", tip: "Average number of days you hold winning trades." },
              { k: "holdlose", label: "Avg hold (lose)", val: m.losses ? Math.round(m.avgHoldLoss) + "d" : "—", cls: "red", sub: "losers only", tip: "Average number of days you hold losing trades." },
              { k: "holdratio", label: "Hold ratio (W/L)", val: (m.wins && m.losses) ? m.holdRatio.toFixed(2) : "—", cls: (m.wins && m.losses) ? (m.holdRatio >= 1 ? "green" : "red") : "gold", sub: "winners vs losers", tip: "Avg hold of winners ÷ avg hold of losers. Above 1.0 means you let winners run longer than you sit in losers." },
            ];
            return statDrag.order.map((ti, vi) => {
              const t = tiles[ti];
              return (
              <div key={t.k} className="mtile" data-metric={t.k} {...statDrag.dragProps(vi)} title="Drag to reorder">
                <div className="label"><span className="term" data-tip={t.tip}>{t.label}</span></div>
                <div className={"metricval " + t.cls}>{t.val}</div>
                <div className="msub">{t.sub}</div>
              </div>
              );
            });
          })()}
        </div>

        {/* EQUITY CURVE + RETURN DISTRIBUTION */}
        <div className={"chartrow" + (distPanelOpen ? " dist-open" : "")}>
          <div className="chartcol eqcol">
            <div className="toolbar"><h2 className="sech guide" onMouseEnter={guideEnter("eq", "Equity curve", "Your account value over time. A line climbing left to right means your account is growing. Toggle dollars / percent.", "/audio/equity-curve.mp3")} onMouseLeave={guideLeave("eq")}>Equity curve</h2></div>
            <div className="card reveal">
              <div className="row">
                <div className="label">Account value over time</div>
                <div className="spacer"></div>
                <div className="seg" id="eqSeg">
                  <button className={eqMode === "$" ? "on" : ""} disabled={privacyMode} onClick={() => !privacyMode && setEqYAxis("$")} title={privacyMode ? "Privacy mode is on — turn it off to view dollar amounts" : ""}>$</button>
                  <button className={eqMode === "%" ? "on" : ""} onClick={() => setEqYAxis("%")}>%</button>
                </div>
                <div className="seg" id="eqXSeg">
                  <button className={eqXAxis === "trades" ? "on" : ""} onClick={() => setEqXAxis("trades")}>By Date</button>
                  <button className={eqXAxis === "months" ? "on" : ""} onClick={() => setEqXAxis("months")}>By Month</button>
                </div>
              </div>
              <div className="chartwrap">
                <div className="yaxis">{eqSvg.yLabels.map((l, i) => <span key={i}>{l}</span>)}</div>
                <div className="plot">
                  <svg viewBox="0 0 600 210" preserveAspectRatio="none" className="eqsvg" role="img" aria-label="Equity curve">
                    <defs>
                      <linearGradient id="jeqgPos" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(34,197,94,0.32)" /><stop offset="100%" stopColor="rgba(34,197,94,0)" /></linearGradient>
                      <linearGradient id="jeqgNeg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="rgba(239,68,68,0.30)" /><stop offset="100%" stopColor="rgba(239,68,68,0)" /></linearGradient>
                    </defs>
                    <line x1="0" y1="52" x2="600" y2="52" className="grid" /><line x1="0" y1="105" x2="600" y2="105" className="grid" /><line x1="0" y1="158" x2="600" y2="158" className="grid" />
                    <line x1="0" y1={eqSvg.yb.toFixed(1)} x2="600" y2={eqSvg.yb.toFixed(1)} stroke="rgba(255,255,255,0.22)" strokeWidth="1" strokeDasharray="4 4" />
                    <g id="eqRise">
                      <path d={eqSvg.areaPos} fill="url(#jeqgPos)" />
                      <path d={eqSvg.areaNeg} fill="url(#jeqgNeg)" />
                      <path d={eqSvg.linePos} fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                      <path d={eqSvg.lineNeg} fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    </g>
                  </svg>
                </div>
              </div>
              <div className="xaxis">{eqSvg.xs.length ? eqSvg.xs.map((s, i) => <span key={i}>{s}</span>) : <span>—</span>}</div>
              <div className="charthint">{!eqSvg.n ? "No trades match this filter."
                : eqSvg.pct ? <>Account return <span className="g">{sgnPct(eqSvg.totalRet)}</span> across {eqSvg.n} closed trade{eqSvg.n === 1 ? "" : "s"}.</>
                  : <>Account {eqSvg.totalPL >= 0 ? "grew" : "fell"} <span className={eqSvg.totalPL >= 0 ? "g" : "rd"}>{sgnMoney(eqSvg.totalPL)} ({sgnPct(eqSvg.totalRet)})</span> across {eqSvg.n} closed trade{eqSvg.n === 1 ? "" : "s"}.</>}</div>
            </div>
          </div>{/* /chartcol */}

          <div className="chartcol distcol">
            <div className="toolbar"><h2 className="sech guide" onMouseEnter={guideEnter("dist", "Return distribution", "The size of your wins and losses. Losses sit left in red, wins right in green. Healthy trading keeps losses small.", "/audio/journal-distribution.mp3")} onMouseLeave={guideLeave("dist")}>Return distribution</h2></div>
            <div className="card reveal">
              <div className={"disthead" + (distPanelOpen ? " open" : "")} onClick={() => setDistPanelOpen(o => !o)}>
                <div className="label" style={{ margin: 0 }}>Trade outcomes by size — losses left, wins right</div>
                <span className="disthint2" style={{ marginLeft: "auto", color: distRpt >= 0 ? "var(--green)" : "var(--red)" }}>Return/trade {distFmtPct(distRpt)}</span>
                <button className={"distbtn" + (distPanelOpen ? " on" : "")} type="button" onClick={(e) => { e.stopPropagation(); setDistPanelOpen(o => !o); }}>{distPanelOpen ? "Hide data ▴" : "Open & edit data ▾"}</button>
                <span className="chev2" style={{ marginLeft: 6 }}>&#9662;</span>
              </div>
              <div className="bars" style={{ marginTop: 18 }}>
                <div className="zeroline"></div>
                {(() => { const maxC = Math.max(...distCounts, 1); return DIST_BUCKETS.map((b, i) => {
                  const c = distCounts[i], hPct = c ? Math.max(18, Math.round(c / maxC * 90)) : 0, title = `${b.lab}: ${c} trade${c === 1 ? "" : "s"}`;
                  return b.side === "neg"
                    ? <div key={i} className="barcol" title={title}><div className="up"></div><div className="down">{c ? <div className="bar neg" style={{ height: hPct + "%", animationDelay: (i * 0.045).toFixed(3) + "s" }}></div> : null}</div></div>
                    : <div key={i} className="barcol" title={title}><div className="up">{c ? <div className="bar pos" style={{ height: hPct + "%", animationDelay: (i * 0.045).toFixed(3) + "s" }}></div> : null}</div><div className="down"></div></div>;
                }); })()}
              </div>
              <div className="distx">{DIST_BUCKETS.map((b, i) => {
                const lab = b.lo === -Infinity ? "≤−6%" : b.hi === Infinity ? "+20%+" : (b.lo > 0 ? "+" : b.lo < 0 ? "−" : "") + Math.abs(b.lo) + "%";
                return <span key={i} style={{ flex: 1, textAlign: "center" }}>{lab}</span>;
              })}</div>
              <div className="charthint">{!dateFiltered.length ? "No trades match this filter."
                : dstats.wins ? <>Wins reach up to <span className="g">{dstats.lw ? sgnPct(Number(dstats.lw.plPct)) : "—"}</span>{dstats.losses ? <>, while losses stay contained (worst <span className="rd">−{Math.abs(Number(dstats.ll?.plPct) || 0).toFixed(2)}%</span>)</> : " with no losing trades in this slice"}. Small losses, larger wins is the shape of an edge.</>
                  : <>Every trade in this slice lost (worst <span className="rd">−{Math.abs(Number(dstats.ll?.plPct) || 0).toFixed(2)}%</span>). Tighten the setup or cut faster.</>}{" "}
                <span className="distopenlink" onClick={(e) => { e.stopPropagation(); setDistPanelOpen(o => !o); }}>{distPanelOpen ? "Hide the data sheet ↑" : "Click here to open & edit the data ↓"}</span></div>

              <div className={"distpanel" + (distPanelOpen ? " open" : "")}>
                  <div className="distpanel-inner">
                    <div className="disttoolbar">
                      <button className={"distbtn" + (Object.keys(distEdits).length === 0 ? " on" : "")} onClick={() => setDistEdits({})} title="Restore the actual counts from your trades">↺ Refill from trades</button>
                      <button className="distbtn" onClick={() => { const z = {}; DIST_BUCKETS.forEach((_, i) => z[i] = 0); setDistEdits(z); }} title="Zero every bucket to model from scratch">Clear all</button>
                      <span style={{ fontSize: "0.62rem", color: "var(--muted)" }}>Edit any count to model a different distribution — the chart and stats update live.</span>
                    </div>
                    <div className="distsum">
                      <div className="ds"><div className="dsk">Total trades</div><div className="dsv">{distTotal}</div></div>
                      <div className="ds"><div className="dsk">Wins / Losses</div><div className="dsv">{distWins} / {distLosses}</div></div>
                      <div className="ds"><div className="dsk">Win rate</div><div className="dsv">{distTotal ? Math.round(distWins / distTotal * 100) : 0}%</div></div>
                      <div className="ds"><div className="dsk">Return / trade</div><div className={"dsv " + (distRpt >= 0 ? "green" : "red")}>{distFmtPct(distRpt)}</div></div>
                    </div>
                    <table className="disttable">
                      <thead><tr><th>Return bucket</th><th>Side</th><th># Trades</th><th>Midpoint</th><th>Contribution</th></tr></thead>
                      <tbody>
                        {DIST_BUCKETS.map((b, i) => {
                          const contrib = distTotal ? distCounts[i] * b.mid / distTotal : 0;
                          const edited = distEdits[i] !== undefined && distEdits[i] !== (distBase[i] || 0);
                          return (
                            <tr key={i}>
                              <td>{b.lab}</td>
                              <td style={{ color: b.side === "pos" ? "var(--green)" : "var(--red)" }}>{b.side === "pos" ? "Win" : "Loss"}</td>
                              <td><input className={"distin" + (edited ? " edited" : "")} type="number" min="0" step="1" value={distCounts[i]} onChange={e => { let v = parseInt(e.target.value, 10); if (isNaN(v) || v < 0) v = 0; setDistEdits(p => ({ ...p, [i]: v })); }} /></td>
                              <td>{(b.mid >= 0 ? "+" : "−") + Math.abs(b.mid)}%</td>
                              <td className={contrib >= 0 ? "g" : "r"}>{distFmtPct(contrib)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="distnote">Contribution = midpoint × (count ÷ total). Editing here is a what-if model; it doesn't change your logged trades.</div>
                  </div>
                </div>
            </div>
          </div>{/* /chartcol */}
        </div>{/* /chartrow */}

        {/* VIV ANALYTICS */}
        <div className="toolbar" style={{ marginTop: 36 }}>
          <h2 className="sech guide" onMouseEnter={guideEnter("va", "VIV Analytics", "Your performance read back to you — recap, insights, best winners and worst losers, so you know what to do more of and what to cut.", "/audio/journal-analytics.mp3")} onMouseLeave={guideLeave("va")}>VIV Analytics</h2>
          <div className="spacer"></div>
          <div className="seg vaseg" title="Scope the analytics below to a time window">
            {[["all", "All time"], ["month", "Month"], ["week", "Week"], ["day", "Day"]].map(([k, l]) => <button key={k} className={vaPeriod === k ? "on" : ""} onClick={() => setVaPeriod(k)}>{l}</button>)}
          </div>
        </div>
        <div className="vagrid">
          {/* RECAP */}
          <div className={"card vacard reveal guide" + gactive("vaRecap")} onMouseEnter={guideEnter("vaRecap", "Recap", "A snapshot of how you traded in this window — net P/L, win rate, the outlier trades that drove results, and the tags you leaned on.", "/audio/journal-analytics-recap.mp3")} onMouseLeave={guideLeave("vaRecap")}>
            <div className="eyebrow">Recap</div>
            <div className="varecap">
              <div className="vastat"><div className="vak">{PERIOD_NET_LABEL[vaPeriod]}</div><div className={"vav " + (va.net >= 0 ? "green" : "red")}>{va.n ? (privacyMode ? sgnPct(startCap > 0 ? va.net / startCap * 100 : 0) : sgnMoney(va.net)) : "—"}</div><div className="vasub">{va.n ? `${va.n} ${va.n === 1 ? "trade" : "trades"}` : "no trades in this period"}</div></div>
              <div className="vastat"><div className="vak">Win rate</div><div className={"vav " + (va.winRate >= 50 ? "green" : (va.n ? "red" : ""))}>{va.n ? Math.round(va.winRate) + "%" : "—"}</div><div className="vasub">{va.n ? `${va.wins}W / ${va.losses}L` : "—"}</div></div>
              <div className="vastat"><div className="vak">Outlier trades</div><div className="vav gold">{va.outliers.length}</div><div className="vasub">{va.outliers.length
                ? <>{(outliersExpanded ? va.outliers : va.outliers.slice(0, 3)).map(t => t.ticker).join(" · ")}{va.outliers.length > 3 ? <> · <span className="seemore" onClick={() => setOutliersExpanded(e => !e)}>{outliersExpanded ? "see less" : `see more (+${va.outliers.length - 3})`}</span></> : ""}</>
                : "|R| ≥ 2.5 · none"}</div></div>
            </div>
            <div className="vacommentary">{va.n
              ? <>You closed <b>{va.n}</b> trade{va.n === 1 ? "" : "s"} in this view for <b>{sgnMoney(va.net)}</b> at a <b>{Math.round(va.winRate)}%</b> win rate{va.best ? <>, led by <b>{va.best.ticker}</b> ({sgnPct(Number(va.best.plPct))})</> : ""}. {va.expectancy >= 0 ? <>Expectancy held positive at <b>{sgnR(va.expectancy)}</b>/trade — keep doing more of the same.</> : <>Expectancy slipped to <b>{sgnR(va.expectancy)}</b>/trade — tighten entries and cut losers faster.</>}</>
              : "No trades in this view yet — adjust the filters above."}</div>
            <div className="vatagline"><span className="vak">Most-traded tags</span><div className="vatags">{va.tags.length ? va.tags.map(({ g, c }) => <span key={g} className="vatag">{g}<b>{c}</b></span>) : <span className="vasub">— no tags in this view</span>}</div></div>
          </div>

          {/* INSIGHTS */}
          <div className={"card vacard reveal guide" + gactive("vaIns")} onMouseEnter={guideEnter("vaIns", "Insights", "Plain-language takeaways pulled from your numbers — what's working, what's leaking money, and the one habit worth fixing next.", "/audio/journal-analytics-insights.mp3")} onMouseLeave={guideLeave("vaIns")}>
            <div className="eyebrow">Insights</div>
            <ul className="valist">{vaInsights.map((o, i) => <li key={i}><span className={"ic " + o.k}>{o.ic}</span><span>{o.t}</span></li>)}</ul>
          </div>

          {/* BEST WINNERS */}
          <div className={"card vacard reveal guide" + gactive("vaWin")} onMouseEnter={guideEnter("vaWin", "Best winners", "Your biggest winning trades in this window. Study what they had in common — these are the setups to size up.", "/audio/journal-analytics-winners.mp3")} onMouseLeave={guideLeave("vaWin")}>
            <div className="eyebrow" style={{ color: "var(--green)" }}>▲ Best winners</div>
            <div className="vatrades">{va.winners.length ? va.winners.map(t => (
              <div key={t.id} className="varow win"><span className="vtk">{t.ticker}</span><span className="vsetup">{t.setup || "—"}</span><span className="vret green">{sgnPct(Number(t.plPct))}</span><span className="vpl green">{privacyMode ? sgnPct(Number(t.plPct)) : sgnMoney(Number(t.plDollar))}</span></div>
            )) : <div className="vaempty">No winning trades in this view.</div>}</div>
          </div>

          {/* WORST LOSERS */}
          <div className={"card vacard reveal guide" + gactive("vaLose")} onMouseEnter={guideEnter("vaLose", "Worst losers", "Your biggest losing trades in this window. Look for the shared mistake — that's the leak to plug.", "/audio/journal-analytics-losers.mp3")} onMouseLeave={guideLeave("vaLose")}>
            <div className="eyebrow" style={{ color: "var(--red)" }}>▼ Worst losers</div>
            <div className="vatrades">{va.losers.length ? va.losers.map(t => (
              <div key={t.id} className="varow loss"><span className="vtk">{t.ticker}</span><span className="vsetup">{t.setup || "—"}</span><span className="vret red">{sgnPct(Number(t.plPct))}</span><span className="vpl red">{privacyMode ? sgnPct(Number(t.plPct)) : sgnMoney(Number(t.plDollar))}</span></div>
            )) : <div className="vaempty">No losing trades in this view — clean slate.</div>}</div>
          </div>
        </div>

        {/* RECENT / CLOSED TRADES */}
        <div className="toolbar">
          <h2 className="sech guide" onMouseEnter={guideEnter("trades", "Recent trades", "Every closed trade. Click Review on any trade to see its chart, key stats, and your notes on what went right, wrong, and the lesson learned.", "/audio/journal-trades.mp3")} onMouseLeave={guideLeave("trades")}>Recent trades</h2>
          <div className="spacer"></div>
          <div className="seg" id="viewSeg">
            <button className={!showPro ? "on" : ""} onClick={() => setTableView("simple")}>Simple</button>
            <button className={showPro ? "on" : ""} onClick={() => setTableView("pro")}>Pro · all columns</button>
          </div>
        </div>

        <div className="card" style={{ padding: "8px 6px" }}>
          <div className="tbl-scroll">
          <table>
            <thead>
              <tr>
                <th><span className="term" data-tip="Whether the trade finished a Win (green) or a Loss (red).">Result</span></th>
                <th><span className="term" data-tip="The ticker. The dot shows the source: gold = IBKR-synced, grey = manual.">Symbol</span></th>
                <th className="pro-only"><span className="term" data-tip="Average price you entered the trade at.">Entry $</span></th>
                <th className="pro-only"><span className="term" data-tip="Price you exited the trade at.">Exit $</span></th>
                <th className="pro-only"><span className="term" data-tip="Number of shares traded.">Shares</span></th>
                <th><span className="term" data-tip="The date you closed the trade.">Exit date</span></th>
                <th><span className="term" data-tip="The pattern or reason you took the trade.">Setup</span></th>
                <th className="pro-only"><span className="term tipright" data-tip="Your protective stop on this trade.">Stop</span></th>
                <th className="pro-only"><span className="term tipright" data-tip="Why you exited — kept for reviewing your decisions.">Exit reason</span></th>
                <th className="pro-only"><span className="term tipright" data-tip="How many days you held the trade.">Hold</span></th>
                <th><span className="term tipright" data-tip="Percentage gain or loss on the trade.">Return</span></th>
                <th><span className="term tipright" data-tip="Dollar profit or loss banked on the trade.">P/L</span></th>
                <th><span className="term tipright" data-tip="R-multiple — profit/loss in units of your initial risk.">R</span></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dateFiltered.length === 0 && (
                <tr><td colSpan={14} className="nodata">No trades match this filter. Clear the filters to see your full track record.</td></tr>
              )}
              {dateFiltered.map(t => {
                const up = (Number(t.plPct) || 0) > 0;
                const cls = up ? "st-win" : "st-loss", plc = up ? "pl up" : "pl dn";
                const ibkr = t.source === "ibkr" || t.source === "reconciled";
                const isOpen = expandedTrade === t.id;
                return (
                  <React.Fragment key={t.id}>
                    <tr className={"traderow" + (isOpen ? " rev-open" : "")} onDoubleClick={() => startEdit(t)}>
                      <td data-l="Result"><span className={"status " + cls}><span className="d"></span>{up ? "Win" : "Loss"}</span></td>
                      <td data-l="Symbol"><span className="tick"><span className={"srcdot " + (ibkr ? "ibkr" : "man")}></span>{t.ticker}</span></td>
                      <td className="pro-only" data-l="Entry $">${(Number(t.entryP) || 0).toFixed(2)}</td>
                      <td className="pro-only" data-l="Exit $">${(Number(t.exitP) || 0).toFixed(2)}</td>
                      <td className="pro-only" data-l="Shares">{(Number(t.shares) || 0).toLocaleString()}</td>
                      <td data-l="Exit date">{tradeDateISO(t.exit) || t.exit || "—"}</td>
                      <td data-l="Setup">{t.setup ? <span className="tag">{t.setup}</span> : "—"}</td>
                      <td className="pro-only" data-l="Stop">{t.stop ? "$" + Number(t.stop).toFixed(2) : "—"}</td>
                      <td className="pro-only" data-l="Exit reason">{t.reason || "—"}</td>
                      <td className="pro-only" data-l="Hold">{holdLabel(t)}</td>
                      <td data-l="Return"><span className={plc}>{sgnPct(Number(t.plPct))}</span></td>
                      <td data-l="P/L"><span className={plc}>{privacyMode ? sgnPct(Number(t.plPct)) : sgnMoney(Number(t.plDollar))}</span></td>
                      <td data-l="R"><span className={(Number(t.rMult) || 0) >= 0 ? "pl up" : "pl dn"}>{t.rMult == null ? "—" : sgnR(Number(t.rMult))}</span></td>
                      <td className="revcell" data-l=""><button className="revbtn" onClick={() => openReview(t)}>Review</button></td>
                    </tr>
                    {isOpen && (
                      <tr className="revrow"><td colSpan={14}>
                        <div className={"revpanel" + (closingReview ? " closing" : "")}>
                          <div className="revhead">
                            <span className={"status " + cls}><span className="d"></span>{up ? "Win" : "Loss"}</span>
                            <span className="revtick">{t.ticker}</span>
                            <span className="revmeta"><b>{(Number(t.shares) || 0).toLocaleString()}</b> sh · {(tradeDateISO(t.entry) || t.entry || "—")} → {(tradeDateISO(t.exit) || t.exit || "—")}</span>
                            <span className="revmeta">Setup <b>{t.setup || "—"}</b></span>
                            <button className="revclose" aria-label="Close" onClick={closeReview}>&times;</button>
                          </div>
                          <div className="revgrid">
                            <div className="revcol">
                              <div className="revcoltitle">Trade stats</div>
                              <div className="mgr"><span>Entry price</span><b>${(Number(t.entryP) || 0).toFixed(2)}</b></div>
                              <div className="mgr"><span>Exit price</span><b>${(Number(t.exitP) || 0).toFixed(2)}</b></div>
                              <div className="mgr"><span>Shares</span><b>{(Number(t.shares) || 0).toLocaleString()}</b></div>
                              <div className="mgr"><span>Hold time</span><b>{holdLabel(t)}</b></div>
                              <div className="mgr"><span>Stop</span><b>{t.stop ? "$" + Number(t.stop).toFixed(2) : "—"}</b></div>
                              <div className="mgr"><span>Commission</span><b>{privacyMode ? "••••" : "$" + (parseFloat(t.commission) || 0).toFixed(2)}</b></div>
                            </div>
                            <div className="revcol">
                              <div className="revcoltitle">Result</div>
                              <div className="mgr"><span>Return</span><b className={up ? "green" : "red"}>{sgnPct(Number(t.plPct))}</b></div>
                              <div className="mgr"><span>P/L</span><b className={(Number(t.plDollar) || 0) >= 0 ? "green" : "red"}>{privacyMode ? sgnPct(Number(t.plPct)) : sgnMoney(Number(t.plDollar))}</b></div>
                              <div className="mgr"><span>Realized R</span><b className={(Number(t.rMult) || 0) >= 0 ? "green" : "red"}>{t.rMult == null ? "—" : sgnR(Number(t.rMult))}</b></div>
                              <div className="mgr"><span>Setup</span><b>{t.setup || "—"}</b></div>
                              <div className="mgr"><span>Exit reason</span><b>{t.reason || "—"}</b></div>
                            </div>
                          </div>

                          {/* Live candlestick chart — real TradeChart (mockup canvas is a placeholder) */}
                          <div className="revchart">
                            <TradeChart trade={t} />
                          </div>

                          <div className="revnotes">
                            <div className="revchart-head" style={{ marginBottom: 0 }}>
                              <span className="revcoltitle" style={{ margin: 0 }}>Trade review</span>
                              <div className="spacer"></div>
                              <button className="simbtn" onClick={() => saveReview(t.id)}>{reviewSavedId === t.id ? "Saved ✓" : "Save review"}</button>
                            </div>
                            <div className="notesgrid">
                              <div><div className="nlabel r">What went right</div><textarea className="mgta" value={reviewDraft.right} onChange={e => setReviewDraft(r => ({ ...r, right: e.target.value }))} placeholder="What went right..." /></div>
                              <div><div className="nlabel w">What went wrong</div><textarea className="mgta" value={reviewDraft.wrong} onChange={e => setReviewDraft(r => ({ ...r, wrong: e.target.value }))} placeholder="What went wrong..." /></div>
                              <div><div className="nlabel l">Lesson learned</div><textarea className="mgta" value={reviewDraft.lessons} onChange={e => setReviewDraft(r => ({ ...r, lessons: e.target.value }))} placeholder="Lesson learned..." /></div>
                            </div>
                          </div>
                          <div className="revfoot">
                            {deleteStep === 0 && (
                              <>
                                <button className="revbtn" onClick={() => startEdit(t)} title="Edit this trade's information" style={{ background: "var(--goldDim)", color: "var(--goldBright)", borderColor: "var(--borderGold)", fontWeight: 700 }}>Edit trade</button>
                                <button className="revdelbtn" onClick={() => setDeleteStep(1)} title="Delete this trade from your journal">Delete trade</button>
                              </>
                            )}
                            {deleteStep === 1 && (
                              <div className="revdelconfirm">
                                <span className="revdelmsg">Delete this trade? This cannot be undone.</span>
                                <button className="revdelbtn" onClick={() => setDeleteStep(2)}>Confirm</button>
                                <button className="revbtn" onClick={() => setDeleteStep(0)}>Cancel</button>
                              </div>
                            )}
                            {deleteStep === 2 && (
                              <div className="revdelconfirm final">
                                <span className="revdelmsg">Are you absolutely sure? This permanently removes the trade.</span>
                                <button className="revdelbtn" onClick={() => { deleteTrade(t.id, true); setDeleteStep(0); }}>Yes, delete permanently</button>
                                <button className="revbtn" onClick={() => setDeleteStep(0)}>Cancel</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
        <div className="charthint">Showing the essentials. Switch to <b>Pro</b> above for entry/exit price, shares, stop, exit reason and hold time.</div>

        {/* INLINE FACTUAL EDITOR — opens over a modal when an inline Edit is triggered */}
        {editingId && createPortal(
          // Wrapped in .vj because the modal's CSS is scoped under `.vj`, but createPortal renders to
          // document.body (outside the page's .vj root). Without this the overlay loses all styling and
          // appears as an unstyled block at the bottom of the page. background/minHeight are neutralized
          // so the .vj{} full-page background + min-height:100vh don't add a stray block. Vars are global (:root).
          <div className="vj" style={{ background: "none", minHeight: 0 }}>
          <div onClick={() => cancelEdit()} className="modal open">
            <div onClick={e => e.stopPropagation()} className="modalcard" style={{ maxWidth: 640 }}>
              <div className="modalhead"><div><div className="sech">Edit trade · {editRow.ticker}</div><div className="sub" style={{ marginTop: 4 }}>Update the factual details. R-Multiple recomputes from entry/exit and your stop.</div></div><button className="revclose" onClick={cancelEdit}>&times;</button></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {[["ticker", "Ticker", "text"], ["entry", "Entry date", "text"], ["exit", "Exit date", "text"], ["entryP", "Entry $", "number"], ["exitP", "Exit $", "number"], ["shares", "Shares", "number"], ["stop", "Stop", "number"]].map(([k, label, type]) => (
                  <div key={k}>
                    <div className="label" style={{ marginBottom: 6 }}>{label}</div>
                    <input type={type} value={editRow[k] ?? ""} onChange={e => setEditRow(r => ({ ...r, [k]: type === "number" ? (e.target.value === "" ? "" : +e.target.value) : e.target.value }))} className="linksel" style={{ width: "100%", maxWidth: "none" }} />
                  </div>
                ))}
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>Setup</div>
                  <select value={editRow.setup || ""} onChange={e => setEditRow(r => ({ ...r, setup: e.target.value }))} className="linksel" style={{ width: "100%", maxWidth: "none" }}><option value="">—</option>{setupTypes.map(s => <option key={s} value={s}>{s}</option>)}</select>
                </div>
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>Exit reason</div>
                  <select value={editRow.reason || ""} onChange={e => setEditRow(r => ({ ...r, reason: e.target.value }))} className="linksel" style={{ width: "100%", maxWidth: "none" }}><option value="">—</option>{exitReasons.map(s => <option key={s} value={s}>{s}</option>)}</select>
                </div>
                <div>
                  <div className="label" style={{ marginBottom: 6 }}>Direction</div>
                  <select value={editRow.tradeType || "Long"} onChange={e => setEditRow(r => ({ ...r, tradeType: e.target.value }))} className="linksel" style={{ width: "100%", maxWidth: "none" }}><option value="Long">Long</option><option value="Short">Short</option></select>
                </div>
              </div>
              <div className="modalfoot"><button className="btn" onClick={() => deleteTrade(editingId)} style={{ color: "var(--red)", borderColor: "rgba(239,68,68,0.4)" }}>Delete trade</button><div className="spacer"></div><button className="btn" onClick={cancelEdit}>Cancel</button><button className="btn gold" onClick={saveEdit}>Save changes</button></div>
            </div>
          </div>
          </div>,
          document.body
        )}

        {/* welcome banner */}
        {!expert && !welcomeDismissed && (
          <div className="welcome">
            <span className="wd"></span>
            <div><b>New here?</b> Hover any card and the guide in the corner explains it — <b>out loud</b>. Click <b>Review</b> on a trade to study it. Switch to <span className="term" data-tip="Pro hides the guidance and shows the full columns.">Pro</span> (top-right) to turn the tutorial off.</div>
            <span className="x" onClick={() => { setWelcomeDismissed(true); try { localStorage.setItem("viv-jwelcome-x", "1"); } catch {} }}>&times;</span>
          </div>
        )}

        {/* LINK HISTORICAL TRADES MODAL */}
        {linkWizardOpen && linkWizardData && createPortal(
          <div onClick={() => linkStatus !== "applying" && setLinkWizardOpen(false)} className="modal open">
            <div onClick={e => e.stopPropagation()} className="modalcard">
              <div className="modalhead">
                <div>
                  <div className="sech">Link historical trades</div>
                  <div className="sub" style={{ marginTop: 4 }}>Connect each closed trade to the open position it came from, so your dashboard's <b>realized P/L</b> is accurate. Suggestions are matched by ticker and entry date. Nothing writes until you click <b>Apply</b>.</div>
                </div>
                <button className="revclose" onClick={() => setLinkWizardOpen(false)}>&times;</button>
              </div>
              {linkWizardData.length === 0 ? (
                <div className="nodata">All journal trades are already linked. 🎉 No backfill needed.</div>
              ) : (
                <table className="linktable">
                  <thead><tr><th>Ticker</th><th>Entry</th><th>Exit</th><th>Shares</th><th>P/L %</th><th>State</th><th>Set to</th></tr></thead>
                  <tbody>
                    {linkWizardData.map(({ t, lots, suggestion, state }) => {
                      const choice = linkChoices[t.id] ?? suggestion;
                      const lkClass = state === "linked" ? "lk-linked" : state === "orphan" ? "lk-orphan" : state === "past" ? "lk-past" : "lk-unlinked";
                      const lkLabel = state === "linked" ? "Linked" : state === "orphan" ? "Orphan" : state === "past" ? "Past" : "Unlinked";
                      const up = (Number(t.plPct) || 0) >= 0;
                      return (
                        <tr key={t.id}>
                          <td><b>{t.ticker}</b></td>
                          <td>{tradeDateISO(t.entry) || "—"}</td>
                          <td>{tradeDateISO(t.exit) || "—"}</td>
                          <td>{(Number(t.shares) || 0).toLocaleString()}</td>
                          <td><span className={up ? "pl up" : "pl dn"}>{sgnPct(Number(t.plPct))}</span></td>
                          <td><span className={"lk " + lkClass}>{lkLabel}</span></td>
                          <td>
                            <select className="linksel" value={choice} onChange={e => setLinkChoices(prev => ({ ...prev, [t.id]: e.target.value === "past" || e.target.value === "skip" ? e.target.value : (Number(e.target.value) || e.target.value) }))} disabled={linkStatus === "applying"}>
                              {lots.map(p => <option key={p.id} value={p.id}>→ {p.sym} (open · {tradeDateISO(p.entry) || "?"})</option>)}
                              <option value="past">Past cycle / unlinked</option>
                              <option value="skip">Skip (no change)</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {linkError && <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "var(--red)", fontSize: "0.72rem", lineHeight: 1.5, wordBreak: "break-word" }}><b>Database write failed</b><br />{linkError}</div>}
              <div className="modalfoot">
                <button className="btn" onClick={() => { const all = {}; linkWizardData.forEach(r => { all[r.t.id] = r.suggestion; }); setLinkChoices(all); }}>Accept all suggestions</button>
                <div className="spacer"></div>
                <button className="btn" onClick={() => { setLinkWizardOpen(false); setLinkError(""); }} disabled={linkStatus === "applying"}>Cancel</button>
                {linkWizardData.length > 0 && <button className="btn gold" onClick={linkApply} disabled={linkStatus === "applying"}>{linkStatus === "applying" ? "Applying…" : linkStatus === "done" ? "Done ✓" : (linkError ? "Retry" : "Apply links")}</button>}
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* guide assistant */}
        <div className={"guidepanel" + (speaking ? " speaking" : "")} aria-live="polite">
          <div className="gp-head"><span className="gp-dot"></span><span className="gp-title">{guide ? guide.title : "Guided walkthrough"}</span>
            <button className="gp-mute" onClick={() => { setGuideMuted(m => { const next = !m; if (next) { try { audioRef.current && audioRef.current.pause(); } catch {} } return next; }); }} title={guideMuted ? "Unmute voiceover" : "Mute voiceover"} aria-label="Toggle voiceover">
              {guideMuted
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></svg>
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a9 9 0 0 1 0 14" /></svg>}
            </button>
          </div>
          <div className="gp-body">{guide ? guide.body : <>Hover any card and I'll explain it — out loud. Switch to <b>Pro</b> (top-right) to turn this off.</>}</div>
        </div>

      </div>{/* /shell */}
    </div>
  );
}

// ═══════════════════════════════════════
// ─── DASHBOARD PAGE ───
// ═══════════════════════════════════════
const FULL_SIZE_OPTIONS = [10,15,20,25,30,35,40,45,50,55,60];
let _posId = 100;
let _lid = 1; // stable local ID counter — survives autosave ID replacement, used as React key
const mkPos = (sym, entry, shares, ep, cp, stop, stop2, setup, tags = [], trailStop = "", comm = "", tradeType = "Long") => ({ id: _posId++, _lid: _lid++, sym, entry, shares: String(shares), ep: String(ep), cp: String(cp), stop: String(stop), stop2: String(stop2 || ""), trailStop: String(trailStop || ""), setup, tags, comm: String(comm || ""), notes: "", chartUrl: "", chartImage: "", tradeType });
const INIT_POSITIONS = [
  mkPos("MSGS","4/1/26",612,328.25,302.90,302.90,0,"VCP",["Breakout"]),
  mkPos("DNTH","4/8/26",2100,87.58,81.75,81.75,0,"Pivot",["Momentum"]),
  mkPos("PSMT","4/7/26",322,154.81,143.10,143.10,0,"VCP",[]),
  mkPos("CWEN","4/1/26",1250,39.93,38.50,38.50,0,"VCP",["Sector Leader"]),
  mkPos("KYMR","4/8/26",574,87.00,81.91,81.91,0,"Pivot",[]),
  mkPos("DLX","4/8/26",1737,28.77,26.95,26.95,0,"Low-Risk Entry",["High Volume"]),
];

const GLOSSARY = [
  ["Orig Stop","Original Stop Loss","Your initial stop when the position was opened. Locked — used to calculate R (initial risk). Never changes even if you trail your stop up."],
  ["Stop 2","Dual Stop Loss","Each original stop covers 50% of your shares. Stop 1 = tighter (first half out), Stop 2 = wider (second half). If only one is filled, it covers 100%."],
  ["Trail Stop","Trailing Stop","Your current working stop. Update this as you trail up. DTS and RTS calculate from this value. Leave empty to use original stop."],
  ["DTS","Down To Stop","Distance from current price down to your trailing stop (or original stop if no trail set). How far stock drops before stop triggers."],
  ["RTS","Risk To Stop","Actual dollars at risk from entry to your trailing stop. When trail stop ≥ entry, RTS goes negative = locked profit. Goal: $0 or better."],
  ["ROTE","Risk of Total Equity","Initial risk (entry to stops) ÷ portfolio. Weighted across both halves. Keep under 1.5%."],
  ["Exposure","Risk-Free Exposure","Shows what % of the position is risk-free (stop above entry = locked profit). Green bar = free, red = at risk."],
  ["SBE","Shares to Break Even","Shares to sell at current price so if remaining shares hit the stop, net P/L = $0. Formula: N × (Entry − Stop) ÷ (Current − Stop)."],
  ["SBE %","SBE Percentage","SBE ÷ total shares. Lower = more profit locked in. Shows only when position is profitable and above stop."],
  ["R-Mult","R-Multiple","Return ÷ weighted initial risk. 2R = made 2× what you risked."],
  ["R Suggest","R-Based Suggested Stop","In R Mode: shows where the R system would place your stop based on current R-level. At 1R → stop to breakeven. At 2R → stop to 1R. At 3R → stop to 2R. Use this as a reference to update your Trail Stop."],
  ["Locked","Locked Profit","In R Mode: profit per share locked in at the R-suggested stop. If you set your Trail Stop to this value and get stopped out, this is your guaranteed gain."],
  ["Tier","Position Tier","Auto-assigned from position value vs sizer. 12% buffer for slippage."],
];

const DASH_CSS = `:root{--bg:#08080e; --bg2:#0c0c14; --white:#ffffff;
    --text:rgba(255,255,255,0.92);
    --muted:rgba(255,255,255,0.70);        
    --faint:rgba(255,255,255,0.45);        
    --gold:#c9982a; --goldBright:#f0c050; --goldMid:#b8820a; --goldDeep:#7a4f00;
    --goldDim:rgba(201,152,42,0.15); --borderGold:rgba(201,152,42,0.22);
    --glass:rgba(255,255,255,0.042); --border:rgba(255,255,255,0.09);
    --green:#22c55e; --red:#ef4444; --blue:#3b82f6;
    --font:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif;}
.vd *{box-sizing:border-box;margin:0;padding:0}
.vd{background:radial-gradient(1200px 700px at 70% -10%, rgba(201,152,42,0.06), transparent 60%), var(--bg);
    color:var(--text); font-family:var(--font); line-height:1.58; font-size:16px;
    -webkit-font-smoothing:antialiased; padding:0; min-height:100vh;}
.vd .big,.vd .north .big,.vd .mini .val,.vd .val,.vd .outval,.vd .outsub,.vd .pl,.vd .stepval,.vd .numfield,.vd .capinput,.vd tbody td,.vd .allocnote,.vd .alloclegend,.vd .breakdown,.vd .deployhead,.vd .deploysub{font-variant-numeric:tabular-nums}
.vd .shell{width:100%; max-width:1240px; margin:0 auto; padding:22px clamp(18px,2.4vw,40px) 80px}
@media(min-width:1500px){
.vd .shell{max-width:1400px} }
@media(min-width:2000px){
.vd .shell{max-width:1680px} }
.vd .navbar{display:flex; align-items:center; gap:16px; margin-bottom:26px; flex-wrap:wrap}
.vd .brand{display:flex; align-items:center; gap:9px; font-weight:800; letter-spacing:-0.01em; color:var(--white); font-size:0.95rem}
.vd .brand .vmark{width:24px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,var(--goldMid),var(--goldBright)); color:#0a0a0a; font-weight:800; font-size:0.8rem}
.vd .tabs{display:inline-flex; gap:4px; background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:980px; padding:4px}
.vd .tabs a{text-decoration:none; color:var(--muted); font-size:0.78rem; font-weight:700; padding:7px 18px; border-radius:980px}
.vd .tabs a.on{background:var(--goldDim); color:var(--goldBright)}
.vd .tabs a:hover:not(.on){color:var(--text)}
.vd .card{position:relative; background:var(--glass);
    border:1px solid var(--border); border-radius:22px;
    backdrop-filter:blur(28px) saturate(160%);
    -webkit-backdrop-filter:blur(28px) saturate(160%);
    padding:26px 28px; overflow:hidden;}
.vd .card::before{content:''; position:absolute; inset:0; pointer-events:none;
    background:linear-gradient(135deg, rgba(255,255,255,0.05), transparent 55%);}
.vd .eyebrow{font-size:0.64rem; font-weight:700; letter-spacing:0.17em; text-transform:uppercase; color:var(--gold)}
.vd .h1{font-size:clamp(1.55rem,3vw,2.05rem); font-weight:800; letter-spacing:-0.04em; color:var(--white); opacity:0; transform:translateY(14px)}
.vd .goldname{color:var(--goldBright)}
.vd .sub{font-size:0.82rem; color:var(--muted); max-width:560px; margin-top:6px; opacity:0}
.vd .riseup{opacity:0; transform:translateY(14px)}
.vd .reveal.in-view .h1{animation:hRise 0.42s cubic-bezier(0.22,1,0.36,1) both}
.vd .reveal.in-view .sub{animation:hFade 0.48s ease-out 0.2s both}
.vd .reveal.in-view .riseup{animation:hRise 0.42s cubic-bezier(0.22,1,0.36,1) 0.1s both}
@keyframes hRise{from{opacity:0; transform:translateY(14px)}to{opacity:1; transform:translateY(0)}}
@keyframes hFade{from{opacity:0}to{opacity:1}}
.vd .alloc .allocfill{transition:width 0.9s cubic-bezier(0.22,1,0.36,1)}
.vd #sparkRise{transform-box:fill-box; transform-origin:bottom}
.vd .reveal.in-view #sparkRise{animation:sparkRise 0.95s cubic-bezier(0.22,1,0.36,1) both}
@keyframes sparkRise{from{transform:scaleY(0); opacity:0.35}to{transform:scaleY(1); opacity:1}}
@media (prefers-reduced-motion: reduce){
.vd .h1,.vd .sub,.vd .riseup{animation:none !important; opacity:1; transform:none}
.vd .alloc .allocfill{transition:none !important}
.vd #sparkRise{animation:none !important; transform:none; opacity:1}
  }
.vd .label{font-size:0.62rem; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:var(--muted)}
.vd .term{border-bottom:1px dotted var(--borderGold); cursor:help; position:relative}
.vd .term .plain{color:var(--faint); font-weight:500}
.vd .term:hover::after{content:attr(data-tip); position:absolute; left:0; top:130%;
    width:240px; background:#11111b; border:1px solid var(--borderGold);
    border-radius:12px; padding:10px 12px; font-size:0.72rem; font-weight:400;
    letter-spacing:0; text-transform:none; color:var(--text); z-index:30;
    box-shadow:0 14px 40px rgba(0,0,0,0.55); line-height:1.45; white-space:pre-line;}
.vd .term.tipright:hover::after{left:auto; right:0}
.vd .row{display:flex; align-items:center; gap:14px; flex-wrap:wrap}
.vd .spacer{flex:1}
.vd .hero{display:grid; grid-template-columns:1.4fr 1fr; gap:18px; margin-top:22px;}
.vd .hero .equity{grid-column:1 / -1}
.vd .hero .north{grid-row:span 1; display:flex; flex-direction:column; justify-content:center;
    background:linear-gradient(140deg, rgba(34,197,94,0.10), transparent 70%);
    border:1px solid rgba(34,197,94,0.22);}
.vd .hero .north.north-neg{background:linear-gradient(140deg, rgba(239,68,68,0.10), transparent 70%);
    border:1px solid rgba(239,68,68,0.22);}
.vd .north .big{font-size:clamp(2.4rem,6vw,3.6rem); font-weight:800; letter-spacing:-0.045em;
    color:var(--green); line-height:1; margin-top:8px;}
.vd .north .meta{font-size:0.78rem; color:var(--muted); margin-top:10px}
.vd .spark{width:100%; height:52px; margin-top:16px; display:block}
.vd .sparklabel{font-size:0.64rem; color:var(--faint); margin-top:5px; text-transform:uppercase; letter-spacing:0.1em; font-weight:600}
.vd .mini{display:flex; flex-direction:column; justify-content:center}
.vd .mini .val{font-size:1.7rem; font-weight:800; letter-spacing:-0.035em; margin-top:6px}
.vd .mini .val.green{color:var(--green)}
.vd .mini .val.red{color:var(--red)}
.vd .mini .val.gold{color:var(--goldBright)}
.vd .mini .hint{font-size:0.72rem; color:var(--muted); margin-top:6px}
.vd .equity .val{margin-top:8px}
.vd .breakdown{font-size:0.8rem; color:var(--muted); margin-top:12px; line-height:1.75}
.vd .breakdown .op{margin-left:6px}
.vd .editcap{display:inline-flex; align-items:center; gap:5px; cursor:pointer; border-bottom:1px dotted var(--borderGold); padding-bottom:1px}
.vd .editcap .capval{color:var(--text); font-weight:700}
.vd .editcap .pencil{font-size:0.74rem; color:var(--gold)}
.vd .capinput{background:rgba(255,255,255,0.05); border:1px solid var(--gold); border-radius:7px; color:var(--white); font-family:var(--font); font-size:0.82rem; font-weight:700; padding:4px 9px; width:120px; outline:none}
.vd .tlrow{display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; margin-top:16px; padding-top:14px; border-top:1px solid var(--border)}
.vd .tllabel{display:flex; flex-direction:column; gap:3px}
.vd .tllabel .gtip{font-size:0.7rem; color:var(--faint); font-weight:500}
.vd .tlseg button[data-tl]{padding:6px 16px}
.vd .equity.off .tlseg button[data-tl=on]{color:var(--muted); background:transparent}
.vd .equity.off .tlseg button[data-tl=off]{color:var(--goldBright); background:var(--goldDim)}
.vd .card.equity{justify-content:flex-start}
.vd .collapsehdr{display:flex; align-items:center; gap:14px; width:100%; background:transparent; border:none;
               cursor:pointer; font-family:var(--font); color:var(--text); padding:0 0 18px; text-align:left}
.vd .collapsetitle{font-size:0.95rem; font-weight:800; letter-spacing:-0.02em; color:var(--white)}
.vd .collapsesummary{display:none; font-size:0.78rem; color:var(--muted); font-variant-numeric:tabular-nums}
.vd .chev{margin-left:auto; color:var(--gold); font-size:1.35rem; line-height:1; transition:transform .2s}
.vd .equity.collapsed .chev{transform:rotate(-90deg)}
.vd .equity.collapsed .equity-grid{display:none}
.vd .equity.collapsed .collapsesummary{display:inline}
.vd .equity.collapsed .collapsehdr{padding-bottom:0}
.vd .equity-grid{display:grid; grid-template-columns:1.4fr 0.95fr 1.35fr; gap:0; width:100%}
.vd .eq-left{padding-right:26px; display:flex; flex-direction:column}
.vd .eq-left .tlrow{margin-top:auto}
.vd .eq-col{padding-left:26px; border-left:1px solid var(--border); display:flex; flex-direction:column; justify-content:center}
.vd .eq-col .ctrl + .ctrl{margin-top:22px}
.vd .ctrl .label{margin-bottom:9px}
.vd .outgrid{display:grid; grid-template-columns:1fr 1fr; gap:18px 20px}
.vd .outlabel{font-size:0.58rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:var(--muted); margin-bottom:6px}
.vd .outval{font-size:1.3rem; font-weight:800; letter-spacing:-0.03em; color:var(--white)}
.vd .outval.green{color:var(--green)}
.vd .outval.red{color:var(--red)}
.vd .outval.gold{color:var(--goldBright)}
.vd .outsub{font-size:0.68rem; color:var(--muted); margin-top:5px}
.vd .outsub .g{color:var(--goldBright); font-weight:700}
.vd .richterm{position:relative; cursor:help; border-bottom:1px dotted var(--borderGold); padding-bottom:1px}
.vd .richterm .pop{display:none; position:absolute; left:0; top:150%; width:230px;
    background:#11111b; border:1px solid var(--borderGold); border-radius:12px;
    padding:10px 12px; font-size:0.72rem; font-weight:400; letter-spacing:0;
    text-transform:none; color:var(--text); z-index:30; line-height:1.5;
    box-shadow:0 14px 40px rgba(0,0,0,0.55);}
.vd .richterm:hover .pop{display:block}
.vd .richterm .pop.right{left:auto; right:0}
.vd .richterm .pop .g{color:var(--goldBright); font-weight:700}
.vd .alloc{margin-top:18px}
.vd .allocnote{font-size:0.76rem; color:var(--muted)}
.vd .allocbar{position:relative; height:12px; border-radius:980px; overflow:hidden; margin:15px 0 13px;
            background:rgba(34,197,94,0.18)}
.vd .allocfill{position:absolute; left:0; top:0; height:100%; border-radius:980px; transition:width .25s ease;
             background:linear-gradient(90deg, #dc4646, var(--red))}
.vd .allocbar.over .allocfill{background:linear-gradient(90deg, #991b1b, #dc2626)}
.vd .alloclegend{display:flex; gap:24px; flex-wrap:wrap; font-size:0.78rem; color:var(--muted)}
.vd .alloclegend b{color:var(--text); font-weight:700}
.vd .leg{display:inline-flex; align-items:center}
.vd .legdot{width:9px; height:9px; border-radius:50%; margin-right:8px}
.vd .legdot.risk{background:var(--red)}
.vd .legdot.avail{background:var(--green)}
.vd .legdot.free{background:var(--blue)}
.vd .deploy{margin-top:16px; padding:14px 16px; border-radius:14px; background:rgba(34,197,94,0.08); border:1px solid rgba(34,197,94,0.25)}
.vd .deploy.over{background:rgba(239,68,68,0.08); border-color:rgba(239,68,68,0.28)}
.vd .deployhead{font-size:0.86rem; font-weight:700; color:var(--green)}
.vd .deploy.over .deployhead{color:#fca5a5}
.vd .deployhead b{color:var(--white)}
.vd .deploysub{font-size:0.74rem; color:var(--muted); margin-top:5px}
.vd .deploysub b{color:var(--text); font-weight:700}
.vd .guidepanel{position:fixed; right:24px; bottom:24px; width:330px; max-width:calc(100vw - 40px); z-index:200;
    background:#11111b; border:1px solid var(--borderGold); border-radius:16px; padding:15px 17px;
    box-shadow:0 22px 60px rgba(0,0,0,0.6); display:none}
.vd:not(.expert) .guidepanel{display:block}
.vd .guidepanel.speaking{border-color:var(--goldBright); box-shadow:0 0 0 1px var(--goldBright), 0 22px 60px rgba(0,0,0,0.6)}
.vd .gp-head{display:flex; align-items:center; gap:9px; margin-bottom:7px}
.vd .gp-dot{width:8px; height:8px; border-radius:50%; background:var(--goldBright); flex:none}
.vd .guidepanel.speaking .gp-dot{animation:gppulse 1s ease-in-out infinite}
@keyframes gppulse{0%,100%{opacity:1; transform:scale(1)}50%{opacity:0.35; transform:scale(1.6)}}
.vd .gp-title{font-size:0.82rem; font-weight:800; color:var(--goldBright); flex:1}
.vd .gp-mute{background:transparent; border:none; cursor:pointer; color:var(--muted); padding:3px; line-height:0; display:flex}
.vd .gp-mute:hover{color:var(--text)}
.vd .gp-mute svg{width:18px; height:18px}
.vd .gp-body{font-size:0.78rem; color:var(--text); line-height:1.55}
.vd .gp-body b{color:var(--goldBright)}
.vd:not(.expert) .guide{transition:box-shadow .2s}
.vd:not(.expert) .guide.guide-active{box-shadow:0 0 0 1px var(--borderGold), 0 0 50px rgba(201,152,42,0.13)}
.vd .ctrlinput{display:inline-flex; align-items:center; gap:7px}
.vd .numfield{background:rgba(255,255,255,0.05); border:1px solid var(--borderGold); border-radius:9px; color:var(--white); font-family:var(--font); font-size:1.2rem; font-weight:800; letter-spacing:-0.02em; padding:8px 13px; width:100px; outline:none}
.vd .numfield:focus{border-color:var(--gold)}
.vd .ctrlinput .suffix{color:var(--muted); font-weight:700; font-size:1.05rem}
.vd .ctrlhint{font-size:0.7rem; color:var(--faint); margin-top:8px}
.vd .stepper{display:inline-flex; align-items:center; border:1px solid var(--borderGold); border-radius:980px; overflow:hidden; background:rgba(255,255,255,0.03)}
.vd .stepper button{border:none; background:transparent; color:var(--goldBright); font-family:var(--font); font-size:1.3rem; font-weight:700; width:44px; height:42px; cursor:pointer; line-height:1; transition:background .15s}
.vd .stepper button:hover:not(:disabled){background:var(--goldDim)}
.vd .stepper button:disabled{color:var(--faint); cursor:not-allowed}
.vd .stepper .stepval{min-width:54px; text-align:center; font-size:1.2rem; font-weight:800; color:var(--white)}
.vd .welcome{display:flex; gap:14px; align-items:flex-start; margin-top:22px;
    background:var(--goldDim); border:1px solid var(--borderGold);
    border-radius:16px; padding:16px 18px;}
.vd .welcome .dot{width:8px;height:8px;border-radius:50%;background:var(--goldBright);box-shadow:0 0 12px var(--goldBright);margin-top:6px;flex:none}
.vd .welcome b{color:var(--white)}
.vd .welcome .x{margin-left:auto; color:var(--faint); cursor:pointer; font-size:1.1rem; line-height:1}
.vd .toolbar{display:flex; align-items:center; gap:10px; margin:30px 0 14px; flex-wrap:wrap}
.vd .toolbar h2{font-size:0.95rem; font-weight:800; letter-spacing:-0.02em; color:var(--white)}
.vd .seg{display:inline-flex; border:1px solid var(--border); border-radius:980px; padding:3px; gap:2px; background:rgba(255,255,255,0.02)}
.vd .seg button{border:none; background:transparent; color:var(--muted); cursor:pointer;
    font-family:var(--font); font-size:0.74rem; font-weight:700; padding:7px 16px; border-radius:980px;
    letter-spacing:0.02em; transition:all .15s;}
.vd .seg button.on{background:var(--goldDim); color:var(--goldBright)}
.vd .btn{border:1px solid var(--border); background:rgba(255,255,255,0.03); color:var(--text);
    font-family:var(--font); font-size:0.74rem; font-weight:700; padding:8px 16px;
    border-radius:980px; cursor:pointer;}
.vd .btn.gold{background:linear-gradient(120deg,var(--goldMid),var(--goldBright),var(--goldDeep)); color:#0a0a0a; border:none; box-shadow:0 6px 18px rgba(201,152,42,0.25)}
.vd .addrow{display:flex; align-items:center; justify-content:center; gap:8px; width:100%; margin:10px 0 2px;
    padding:12px; border:1px dashed var(--borderGold,rgba(201,152,42,0.45)); border-radius:12px;
    background:transparent; color:var(--goldBright); font-family:var(--font); font-size:0.78rem; font-weight:700;
    letter-spacing:0.02em; cursor:pointer; transition:background .15s ease, border-color .15s ease}
.vd .addrow:hover{background:rgba(201,152,42,0.10); border-color:var(--goldBright)}
.vd table{width:100%; border-collapse:collapse}
.vd thead th{font-size:0.6rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase;
    color:var(--muted); text-align:right; padding:12px 14px; border-bottom:1px solid var(--border);}
.vd thead th:first-child,.vd thead th:nth-child(2){text-align:left}
.vd tbody td{padding:15px 14px; text-align:right; border-bottom:1px solid rgba(255,255,255,0.06); font-size:0.84rem}
.vd tbody td:first-child,.vd tbody td:nth-child(2){text-align:left}
.vd tbody tr:hover{background:rgba(255,255,255,0.025)}
.vd .tick{font-weight:800; letter-spacing:-0.01em; font-size:0.92rem; display:flex; align-items:center; gap:9px}
.vd .srcdot{width:7px;height:7px;border-radius:50%}
.vd .srcdot.ibkr{background:var(--goldBright); box-shadow:0 0 8px var(--goldBright)}
.vd .srcdot.man{background:rgba(255,255,255,0.28)}
.vd .tag{display:inline-block; font-size:0.68rem; font-weight:600; color:var(--muted); background:rgba(255,255,255,0.05); border:1px solid var(--border); border-radius:7px; padding:3px 9px}
.vd .pl.up{color:var(--green); font-weight:700}
.vd .pl.dn{color:var(--red); font-weight:700}
.vd .pl .pct{display:block; font-size:0.7rem; color:var(--muted); font-weight:500; margin-top:2px}
.vd .status{display:inline-flex; align-items:center; gap:7px; font-size:0.7rem; font-weight:700; padding:6px 12px; border-radius:980px; letter-spacing:0.02em}
.vd .status .d{width:7px;height:7px;border-radius:50%}
.vd .st-risk{background:rgba(239,68,68,0.12); color:#fda4a4; border:1px solid rgba(239,68,68,0.3)}
.vd .st-risk .d{background:var(--red)}
.vd .st-free{background:rgba(34,197,94,0.12); color:#86efac; border:1px solid rgba(34,197,94,0.3)}
.vd .st-free .d{background:var(--green)}
.vd .st-lock{background:rgba(59,130,246,0.12); color:#93c5fd; border:1px solid rgba(59,130,246,0.3)}
.vd .st-lock .d{background:var(--blue)}
.vd .sizebar{display:inline-flex; flex-direction:column; align-items:flex-end; gap:4px}
.vd .sizebar .track{width:70px;height:5px;border-radius:980px;background:rgba(255,255,255,0.1);overflow:hidden}
.vd .sizebar .fill{height:100%;border-radius:980px}
.vd .sizebar small{font-size:0.66rem; color:var(--muted)}
.vd .pro-only{display:none}
.vd.pro .pro-only{display:table-cell}
.vd.pro thead .pro-only{display:table-cell}
.vd.expert .welcome{display:none}
.vd.expert .term{border-bottom:none; cursor:default}
.vd.expert .term:hover::after{content:none}
.vd.expert .outsub{display:none}
.vd.expert .charthint{display:none}
.vd.expert .deploysub{display:none}
.vd .pro-note{font-size:0.72rem; color:var(--faint); margin-top:14px}
/* Freeze the Manage/Sell (action) column to the right edge so it's never cropped when the table is
   wider than the card — happens in Pro view and especially at Text Size = Large (zoom 1.15). */
.vd .mgcell{text-align:right; white-space:nowrap; position:sticky; right:0; z-index:2; background:#0c0c14; box-shadow:-12px 0 14px -10px rgba(0,0,0,0.65)}
.vd thead th:last-child{position:sticky; right:0; z-index:2; background:#0c0c14}
.vd .mgcell .mgbtn + .mgbtn{margin-left:6px}
.vd .mgbtn{background:rgba(255,255,255,0.04); border:1px solid var(--border); color:var(--muted); font-family:var(--font);
         font-size:0.68rem; font-weight:700; padding:6px 13px; border-radius:980px; cursor:pointer; white-space:nowrap}
.vd .mgbtn:hover{color:var(--text); border-color:var(--borderGold)}
.vd .mgbtn.sell{background:rgba(239,68,68,0.1); border-color:rgba(239,68,68,0.32); color:#fca5a5}
.vd .mgbtn.sell:hover{background:rgba(239,68,68,0.16); color:#fecaca}
.vd .posrow.mg-open .mgbtn{background:var(--goldDim); color:var(--goldBright); border-color:var(--borderGold)}
.vd .mgrow > td{padding:0 !important; border-bottom:1px solid rgba(255,255,255,0.06)}
/* Wide Pro-view table scrolls horizontally inside the card instead of being clipped by overflow:hidden.
   container-type lets the expanded Manage panel size to the VISIBLE width (100cqw) so its Risk & P/L
   column is always fully readable, even when the data row above it is wider and scrolls. */
.vd .pos-scroll{overflow-x:auto; container-type:inline-size}
.vd .mgpanel{margin:2px 0 14px; width:100cqw; box-sizing:border-box; background:rgba(201,152,42,0.045); border:1px solid var(--borderGold); border-radius:16px; padding:18px 20px}
.vd .mghead{display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding-bottom:15px; margin-bottom:16px; border-bottom:1px solid var(--border)}
.vd .mgtick{font-size:1.05rem; font-weight:800; color:var(--white); letter-spacing:-0.01em}
.vd .mgls{font-size:0.6rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:var(--green); border:1px solid rgba(34,197,94,0.3); border-radius:6px; padding:2px 7px}
.vd .mgmeta{font-size:0.74rem; color:var(--muted)}
.vd .mgmeta b{color:var(--text); font-weight:700; font-variant-numeric:tabular-nums}
.vd .mgclose{margin-left:auto; background:transparent; border:none; color:var(--faint); font-size:1.4rem; line-height:1; cursor:pointer}
.vd .mgclose:hover{color:var(--text)}
.vd .mggrid{display:grid; grid-template-columns:1fr 1fr 1fr; gap:0}
.vd .mgcol{padding:0 22px; border-left:1px solid var(--border)}
.vd .mgcol:first-child{padding-left:0; border-left:none}
.vd .mgcol:last-child{padding-right:0}
.vd .mgcoltitle{font-size:0.6rem; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:var(--gold); margin-bottom:14px}
.vd .mgfield{display:flex; align-items:center; gap:8px; margin-bottom:10px}
.vd .mgfield label{flex:1; font-size:0.76rem; color:var(--muted)}
.vd .mgin{width:98px; background:rgba(255,255,255,0.05); border:1px solid var(--border); border-radius:8px; color:var(--white);
        font-family:var(--font); font-size:0.82rem; font-weight:700; padding:6px 9px; text-align:right; outline:none; font-variant-numeric:tabular-nums}
.vd .mgin:focus{border-color:var(--gold)}
.vd .mgin.gold{border-color:var(--borderGold); color:var(--goldBright)}
.vd .mglock{background:transparent; border:none; color:var(--faint); cursor:pointer; font-size:0.78rem; padding:2px; line-height:0}
.vd .mglock:hover{color:var(--gold)}
.vd .mgsave{margin-top:8px}
.vd .mgacts{display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px}
.vd .mgact{font-size:0.7rem; padding:7px 13px}
.vd .mgactlist{font-size:0.76rem; color:var(--faint); padding:8px 0; min-height:36px}
.vd .mgnote{font-size:0.68rem; color:var(--faint); line-height:1.5; margin-top:6px}
.vd .mgreadout{display:flex; flex-direction:column}
.vd .mgr{display:flex; justify-content:space-between; align-items:center; padding:7px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.78rem}
.vd .mgr span{color:var(--muted)}
.vd .mgr b{color:var(--text); font-weight:700; font-variant-numeric:tabular-nums}
.vd .mgr b.green{color:var(--green)}
.vd .mgr b.red{color:var(--red)}
.vd .mgr b.gold{color:var(--goldBright)}
.vd .mgfoot{display:flex; align-items:center; gap:14px; flex-wrap:wrap; margin-top:18px; padding-top:16px; border-top:1px solid var(--border)}
.vd .mgfoot-hint{font-size:0.72rem; color:var(--faint)}
.vd .mgsell{background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.32); color:#fca5a5; font-weight:700}
.vd .mgsell:hover{background:rgba(239,68,68,0.16)}
.vd .mgsell.open{background:rgba(239,68,68,0.18); color:#fecaca}
.vd .mgsellform{margin-top:16px; padding-top:16px; border-top:1px dashed var(--borderGold)}
.vd .mgsellgrid{display:grid; grid-template-columns:1fr 1fr 1fr; gap:0}
.vd .mgsellcol{padding:0 22px; border-left:1px solid var(--border)}
.vd .mgsellcol:first-child{padding-left:0; border-left:none}
.vd .mgsellcol:last-child{padding-right:0}
.vd .quickrow{display:flex; align-items:center; gap:6px; margin:0 0 12px}
.vd .chipbtn{background:rgba(255,255,255,0.04); border:1px solid var(--border); color:var(--muted); font-family:var(--font);
           font-size:0.66rem; font-weight:700; padding:4px 10px; border-radius:980px; cursor:pointer}
.vd .chipbtn:hover{color:var(--text); border-color:var(--borderGold)}
.vd .mgof{font-size:0.7rem; color:var(--faint); margin-left:4px}
.vd .mgsel{background:rgba(255,255,255,0.05); border:1px solid var(--border); border-radius:8px; color:var(--white);
         font-family:var(--font); font-size:0.78rem; font-weight:600; padding:6px 9px; outline:none; cursor:pointer}
.vd .mgsel:focus{border-color:var(--gold)}
.vd .mgcheck{display:flex; align-items:center; gap:8px; font-size:0.76rem; color:var(--muted); margin-top:12px; cursor:pointer}
.vd .mgcheck input{accent-color:var(--gold); width:15px; height:15px}
.vd .mgoptional{color:var(--faint); font-weight:500; text-transform:none; letter-spacing:0}
.vd .mgjournal{display:flex; flex-direction:column; gap:8px}
.vd .mgta{background:rgba(255,255,255,0.05); border:1px solid var(--border); border-radius:8px; color:var(--text);
        font-family:var(--font); font-size:0.76rem; padding:8px 10px; outline:none; resize:vertical; min-height:38px}
.vd .mgta:focus{border-color:var(--gold)}
.vd .mgin.wide{width:100%; text-align:left; font-weight:500}
.vd .mgsellactions{display:flex; gap:10px; margin-top:14px}
.vd .mgsellmsg{font-size:0.74rem; color:var(--green); margin-top:10px; min-height:18px}
@media(max-width:760px){
.vd .hero{grid-template-columns:1fr 1fr;}
.vd .hero .north{grid-column:1 / -1}
.vd .equity-grid{grid-template-columns:1fr}
.vd .mggrid{grid-template-columns:1fr}
.vd .mgcol{padding:18px 0 0; border-left:none; border-top:1px solid var(--border)}
.vd .mgcol:first-child{padding-top:0}
.vd .mgsellgrid{grid-template-columns:1fr}
.vd .mgsellcol{padding:18px 0 0; border-left:none; border-top:1px solid var(--border)}
.vd .mgsellcol:first-child{padding-top:0}
.vd .eq-left{padding-right:0}
.vd .eq-col{padding-left:0; border-left:none; border-top:1px solid var(--border); padding-top:20px; margin-top:20px}
.vd table thead{display:none}
.vd table,.vd tbody,.vd tr,.vd td{display:block; width:100%}
.vd tbody tr{border:1px solid var(--border); border-radius:16px; padding:8px 4px; margin-bottom:12px}
.vd tbody td{display:flex; justify-content:space-between; align-items:center; text-align:right; border:none; padding:8px 14px}
.vd tbody td::before{content:attr(data-l); color:var(--muted); font-size:0.66rem; text-transform:uppercase; letter-spacing:0.08em; font-weight:700}
.vd .tick{font-size:1rem}

/* ── Open Positions mobile card: structured header + compact 2-col stat grid (replaces the flat label:value stack) ── */
.vd .posrow{display:grid; grid-template-columns:1fr 1fr; column-gap:14px; row-gap:0; align-content:start; padding:14px 16px 10px; background:var(--glass)}
/* secondary stats: quiet, left-aligned, value-over-label mini cells */
.vd .posrow td{display:flex; flex-direction:column; align-items:flex-start; justify-content:flex-start; gap:3px; text-align:left; padding:9px 0; order:0}
.vd .posrow td::before{font-size:0.56rem; opacity:0.5; font-weight:600; letter-spacing:0.07em; margin:0; order:2}
.vd .posrow td.pro-only{display:none}
.vd.pro .posrow td.pro-only{display:flex}
/* header band: ticker (left) + P/L (right) on one line, status pill beneath, divider under */
.vd .posrow td[data-l="Symbol"]{grid-column:1; order:-3; flex-direction:row; align-items:center; padding:0}
.vd .posrow td[data-l="Symbol"]::before{display:none}
.vd .posrow .tick{font-size:1.3rem; font-weight:800; letter-spacing:-0.02em}
.vd .posrow td[data-l="P/L"]{grid-column:2; order:-2; align-items:flex-end; justify-content:center; padding:0}
.vd .posrow td[data-l="P/L"]::before{display:none}
.vd .posrow td[data-l="P/L"] .pl{font-size:1.12rem; font-weight:800}
.vd .posrow td[data-l="P/L"] .pct{font-size:0.74rem; text-align:right}
.vd .posrow td[data-l="Status"]{grid-column:1 / -1; order:-1; padding:8px 0 12px; margin-bottom:6px; border-bottom:1px solid var(--border)}
.vd .posrow td[data-l="Status"]::before{display:none}
/* bars sit left and fill the cell width */
.vd .posrow .sizebar{align-items:flex-start; width:100%}
.vd .posrow .sizebar .track{width:100%}
/* actions: full-width footer with equal-width buttons */
.vd .posrow td.mgcell{grid-column:1 / -1; order:99; flex-direction:row; gap:8px; padding:12px 0 2px; margin-top:6px; border-top:1px solid var(--border); position:static; background:transparent; box-shadow:none}
.vd .posrow td.mgcell::before{display:none}
.vd .posrow td.mgcell .mgbtn{flex:1}
  }
@media(max-width:600px){
.vd .navbar{flex-wrap:wrap; gap:10px}
.vd .navbar .spacer{display:none}
.vd .tabs{overflow-x:auto; max-width:100%; scrollbar-width:none}
.vd .tabs::-webkit-scrollbar{display:none}
.vd .tabs a{white-space:nowrap}
.vd .hero{grid-template-columns:1fr}
  }`;

function DashboardPage({ setPage, onLogout, onJournalTrade, setupTypes, tags: allTags, exitReasons, positions, setPositions, portfolioSize, setPortfolioSize, fullSizePct, setFullSizePct, numStocks, setNumStocks, lastLoadedCountRef, lastSaveIdMapRef, session, targetRote, setTargetRote, journaledTrades, setJournaledTrades, onManualSave, saveStatus, positionsRef, saveErrorMsg, onIbkrSync, intradayColumnAvailable, intradayFeatureEnabled, onRunIntegrity, integrityReport, integrityRunning, displayName }) {
  // Alias so existing `INTRADAY_FEATURE_ENABLED` references inside this component keep reading as a single
  // flag without rewriting every callsite. Reactive — flipping the Settings toggle re-renders the table.
  const INTRADAY_FEATURE_ENABLED = intradayFeatureEnabled;
  const [compactTable, setCompactTable] = useState(false);
  // Open Positions zoom — scales the whole table (5 steps each way, 70%–130%, 6% per step). Persisted as a UI-only pref.
  const [posZoom, setPosZoom] = useState(() => { const s = parseFloat(localStorage.getItem("viv-pos-zoom")); return Number.isFinite(s) ? Math.min(1.3, Math.max(0.7, s)) : 1; });
  const stepZoom = (dir) => setPosZoom(z => { const v = Math.min(1.3, Math.max(0.7, +(z + dir * 0.06).toFixed(2))); localStorage.setItem("viv-pos-zoom", String(v)); return v; });
  const resetZoom = () => { localStorage.setItem("viv-pos-zoom", "1"); setPosZoom(1); };
  const [riskBreakdownOpen, setRiskBreakdownOpen] = useState(false);
  const [sizerMode, setSizerMode] = useState("R"); // "R" = risk-based (default), "%" = position size
  const [rNumStocks, setRNumStocks] = useState(4);
  // ─── Secured Profit toggle ───
  // When a trail stop sits ABOVE entry, (trail − entry) × shares is locked-in profit
  // that can't be lost (assuming the stop holds). Including it in the compounding base
  // lets sizing scale with profit you've already nailed down, not just realized P/L.
  // Default ON (aggressive); user can flip OFF from the Compounder header.
  const [useSecuredProfit, setUseSecuredProfit] = useState(() => {
    try { return localStorage.getItem("viv-secured-profit") !== "0"; } catch { return true; }
  });
  useEffect(() => { try { localStorage.setItem("viv-secured-profit", useSecuredProfit ? "1" : "0"); } catch {} }, [useSecuredProfit]);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [posSorts, setPosSorts] = useState([]); // [{key, dir}] multi-sort for positions
  const [posColWidths, setPosColWidths] = useState({}); // {colKey: width} for resizable columns
  const posDrag = useDragReorder(25); // 25 open positions columns (24 + "Today" intraday activity)

  // Ref to always hold the latest onManualSave — fixes stale closure when
  // setTimeout fires after setPositions (state update hasn't rendered yet)
  const onManualSaveRef = useRef(onManualSave);
  useEffect(() => { onManualSaveRef.current = onManualSave; }, [onManualSave]);

  // Compounded equity = starting capital + realized P/L from all closed journal trades.
  // This is the TRUE account size to size against — it grows as profits are realized,
  // so the sizer compounds. (Defined here so the sizers below can use it; also used by
  // enriched / posAnalysis / budget further down.)
  const compRealizedPL = useMemo(() => {
    if (!journaledTrades || journaledTrades.length === 0) return 0;
    return journaledTrades.reduce((sum, t) => sum + (t.plDollar || 0), 0);
  }, [journaledTrades]);
  const compPs = +portfolioSize || 0;
  const bookedEquity = compPs + compRealizedPL;
  // Secured Profit — sum of (activeStop − entry) × shares for every position whose
  // trail/active stop is ABOVE entry. Counts only LONG positions (epN > 0, shares > 0).
  // Recomputed on every positions change; cheap (one pass).
  const securedProfit = useMemo(() => {
    if (!positions || positions.length === 0) return 0;
    return positions.filter(p => p.sym).reduce((sum, p) => {
      const epN = parseFloat(p.ep) || 0;
      const sharesN = parseFloat(p.shares) || 0;
      if (!(epN > 0) || !(sharesN > 0)) return sum;
      const s1 = parseFloat(p.stop) || 0;
      const s2 = parseFloat(p.stop2) || 0;
      const tsN = parseFloat(p.trailStop) || 0;
      const isDual = s1 > 0 && s2 > 0;
      const h1 = isDual ? Math.ceil(sharesN / 2) : sharesN;
      const h2 = isDual ? sharesN - h1 : 0;
      const activeStop = tsN > 0 ? tsN : (isDual ? (s1 * h1 + s2 * h2) / (h1 + h2) : s1);
      if (activeStop > epN) return sum + (activeStop - epN) * sharesN;
      return sum;
    }, 0);
  }, [positions]);
  // Effective compounding base — base for all sizing math. When the toggle is on,
  // includes trail-locked profit; when off, identical to bookedEquity (conservative).
  const compEquity = bookedEquity + (useSecuredProfit ? securedProfit : 0);

  // fullSizePct is the TARGET POSITION SIZE PER TRADE (%). Sizing is on current (compounded)
  // equity, not starting capital — perStock = $ at full size; fullSizeAmt = implied total if fully loaded.
  const sizer = useMemo(() => {
    const ps = compEquity;
    if (!ps || ps <= 0) return null;
    const perTradePct = +fullSizePct || 0;
    const perStock = ps * (perTradePct / 100);
    const fullSizeAmt = perStock * numStocks;
    return { perTradePct, fullSizeAmt, impliedTotalPct: perTradePct * numStocks, full: perStock, half: perStock / 2, quarter: perStock / 4, pilot: perStock / 8 };
  }, [compEquity, fullSizePct, numStocks]);
  const targetPosPct = +fullSizePct || 0; // benchmark for Open Positions Exp % colour coding

  // R-based sizer: current equity × ROTE% = total risk budget, ÷ max positions = R$ per trade
  const rSizer = useMemo(() => {
    const ps = compEquity;
    if (!ps || ps <= 0) return null;
    const rotePct = +(targetRote || 0);
    const totalBudget = ps * (rotePct / 100);
    const n = rNumStocks || 1;
    const fullR = totalBudget / n;
    return { totalBudget, fullR, halfR: fullR / 2, quarterR: fullR / 4, pilotR: fullR / 8, rotePct, n };
  }, [compEquity, targetRote, rNumStocks]);
  const [sellId, setSellId] = useState(null);
  const [sellQty, setSellQty] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [sellReason, setSellReason] = useState("Sold Into Strength");
  const [sellTags, setSellTags] = useState([]);
  const [sellAddJournal, setSellAddJournal] = useState(true);
  const [sellNotes, setSellNotes] = useState("");
  const [sellComm, setSellComm] = useState("");
  const [sellChartUrl, setSellChartUrl] = useState("");
  const [sellNotesStruct, setSellNotesStruct] = useState({ right: "", wrong: "", lessons: "" });
  const [displayMode, setDisplayMode] = useState("%"); // "%", "$", or "R"
  const [priceLoading, setPriceLoading] = useState(false);
  const [lastPriceRefresh, setLastPriceRefresh] = useState(null);
  const [expandedPosId, setExpandedPosId] = useState(null);
  // ─── Intraday Activity panel state ─── inline timeline + Add Event form per open position.
  // Independent of expandedPosId (the More expander) so a user can have one open at a time per row
  // and the two don't fight for vertical space.
  const [expandedIntradayId, setExpandedIntradayId] = useState(null);
  const [intradayDraft, setIntradayDraft] = useState({ type: "trim", shares: "", price: "", stop: "", note: "" });
  const resetIntradayDraft = useCallback(() => setIntradayDraft({ type: "trim", shares: "", price: "", stop: "", note: "" }), []);
  const [posUploadingImage, setPosUploadingImage] = useState(false);
  const [posEditNotes, setPosEditNotes] = useState({ right: "", wrong: "", lessons: "", _plain: "" });

  // Fetch delayed prices from Finnhub via serverless proxy
  const fetchLivePrices = useCallback(async () => {
    const tickers = positions.filter(p => p.sym && p.sym.trim()).map(p => p.sym.trim().toUpperCase());
    const unique = [...new Set(tickers)];
    if (unique.length === 0) return;
    setPriceLoading(true);
    try {
      const res = await fetch(`/api/prices?symbols=${unique.join(",")}`);
      if (!res.ok) throw new Error("API error");
      const prices = await res.json();
      if (prices && typeof prices === "object" && !prices.error) {
        setPositions(prev => {
          const next = prev.map(p => {
            const sym = (p.sym || "").toUpperCase();
            if (sym && prices[sym] !== undefined) {
              return { ...p, cp: String(prices[sym]) };
            }
            return p;
          });
          positionsRef.current = next;
          return next;
        });
        setLastPriceRefresh(new Date());
      }
    } catch (err) {
      console.error("Price fetch failed:", err.message);
    }
    setPriceLoading(false);
  }, [positions, setPositions]);

  // Upload chart image for a position
  const uploadPosChartImage = async (posId, file) => {
    setPosUploadingImage(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `positions/${posId}_${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("trade-charts").upload(path, file, { upsert: true });
      if (uploadErr) { console.error("Upload error:", uploadErr.message); alert("Upload failed: " + uploadErr.message); setPosUploadingImage(false); return; }
      const { data: urlData } = supabase.storage.from("trade-charts").getPublicUrl(path);
      const publicUrl = urlData?.publicUrl || "";
      setPositions(prev => { const next = prev.map(p => p.id === posId ? { ...p, chartImage: publicUrl } : p); positionsRef.current = next; return next; });
    } catch (err) { console.error("Upload failed:", err); alert("Upload failed"); }
    setPosUploadingImage(false);
  };

  // Toggle expand/collapse for position notes/chart
  const togglePosExpand = useCallback((posId) => {
    setExpandedPosId(prev => {
      if (prev === posId) return null;
      const pos = positions.find(p => p.id === posId);
      if (pos) setPosEditNotes(parseNotes(pos.notes));
      return posId;
    });
  }, [positions]);

  // Save position notes from edit state
  const savePosNotes = useCallback((posId) => {
    const serialized = serializeNotes(posEditNotes);
    setPositions(prev => {
      const next = prev.map(p => p.id === posId ? { ...p, notes: serialized } : p);
      positionsRef.current = next;
      return next;
    });
  }, [posEditNotes]);

  const updateField = useCallback((id, field, val) => {
    setPositions(prev => {
      const next = prev.map(p => p.id === id ? { ...p, [field]: val } : p);
      positionsRef.current = next; // Eagerly sync ref so emergencySave always has latest data — fixes last-keystroke-lost-on-refresh
      return next;
    });
  }, []);

  // ─── Intraday Activity surgical update ─── runs a partial UPDATE on the single position row's
  // intraday_log JSON column. Bypasses the bulk Save's insert-all-delete-old pattern entirely — so even
  // if the user clicks Save mid-edit, the log update can't lose a race with the bulk write. Refuses to
  // run unless `intradayColumnAvailable` is true (migration confirmed). Mirrors React state so the UI
  // reflects the new log immediately. Errors are logged but never thrown — the local state has already
  // accepted the change, so the user sees their event; on next reload the DB is the truth.
  const updateIntradayLog = useCallback(async (posId, mutator) => {
    if (!intradayColumnAvailable) {
      console.warn("[intraday] schema migration not detected — refusing to update. Run the SQL ALTER TABLE first.");
      return null;
    }
    let nextLog = null;
    setPositions(prev => {
      const next = prev.map(p => {
        if (p.id !== posId) return p;
        const current = normalizeIntradayLog(p.intradayLog);
        nextLog = normalizeIntradayLog(mutator(current));
        return { ...p, intradayLog: nextLog };
      });
      positionsRef.current = next;
      return next;
    });
    if (!nextLog || !session?.user?.id) return nextLog;
    try {
      const { error } = await supabase.from("positions").update({ intraday_log: nextLog }).eq("id", posId).eq("user_id", session.user.id);
      if (error) console.error("[intraday] update failed:", error.message);
    } catch (e) { console.error("[intraday] update threw:", e); }
    return nextLog;
  }, [intradayColumnAvailable, session, setPositions, positionsRef]);
  const addPosition = useCallback(() => {
    setPositions(prev => {
      const maxId = prev.reduce((m, p) => Math.max(m, p.id || 0), 0);
      const now = new Date();
      const next = [...prev, { id: maxId + 1, _lid: _lid++, sym: "", entry: now.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }), entryTime: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }), shares: "", ep: "", cp: "", stop: "", stop2: "", trailStop: "", setup: setupTypes[0] || "VCP", tags: [], comm: "", notes: "", chartUrl: "", chartImage: "", tradeType: "Long" }];
      positionsRef.current = next;
      return next;
    });
  }, [setupTypes]);
  const removeRow = useCallback((id, skipConfirm) => {
    if (!skipConfirm) {
      const pos = positions.find(p => p.id === id);
      // Build extra warning copy when there are still-live intraday events that would vanish with the row.
      let intradayWarning = "";
      const liveEvents = (pos && pos.intradayLog && Array.isArray(pos.intradayLog.events))
        ? pos.intradayLog.events.filter(e => !e.reconciledExecId)
        : [];
      if (liveEvents.length > 0) {
        const lines = liveEvents.slice(0, 5).map(e => {
          if (e.type === "trim") return `  • Trim ${e.shares || "?"} sh${e.price ? ` @ $${Number(e.price).toFixed(2)}` : ""}`;
          if (e.type === "add") return `  • Add ${e.shares || "?"} sh${e.price ? ` @ $${Number(e.price).toFixed(2)}` : ""}`;
          if (e.type === "stop") return `  • Stop → $${Number(e.stop || 0).toFixed(2)}`;
          return `  • Note: ${(e.note || "").slice(0, 40)}`;
        });
        const extra = liveEvents.length > 5 ? `\n  …and ${liveEvents.length - 5} more` : "";
        intradayWarning = `\n\n⚠ This position has ${liveEvents.length} unreconciled intraday event${liveEvents.length === 1 ? "" : "s"} that will be lost:\n${lines.join("\n")}${extra}`;
      }
      if (!window.confirm(`Remove ${pos?.sym || "this"} position? This will delete it from your open positions.${intradayWarning}`)) return false;
    }
    setPositions(prev => {
      const next = prev.filter(p => p.id !== id);
      if (lastLoadedCountRef) lastLoadedCountRef.current = next.length; // update so autosave safety check doesn't block intentional removal
      positionsRef.current = next; // Eagerly sync ref for emergencySave
      return next;
    });
    return true;
  }, [lastLoadedCountRef, positions]);

  // Remap sellId when autosave replaces position IDs
  useEffect(() => {
    if (!sellId || !lastSaveIdMapRef || lastSaveIdMapRef.current.size === 0) return;
    const newId = lastSaveIdMapRef.current.get(sellId);
    if (newId && newId !== sellId) {
      setSellId(newId);
    }
  }, [positions]); // fires after setPositions syncs IDs from savePositionsNow

  // Sell flow
  const startSell = (p) => {
    // ─── Collision guard ─── if the user already logged a same-day trim event in the Today panel and
    // the IBKR sync hasn't reconciled it yet, prompt before opening the manual Sell flow. Catches the
    // common mistake "I logged this and forgot — am I about to double-log it via Sell?"
    if (INTRADAY_FEATURE_ENABLED && intradayColumnAvailable && p.intradayLog && Array.isArray(p.intradayLog.events)) {
      const todayKey = tradeDateISO(new Date().toISOString());
      const liveTrims = p.intradayLog.events.filter(e => e.type === "trim" && !e.reconciledExecId && tradeDateISO(e.ts) === todayKey);
      if (liveTrims.length > 0) {
        const totalLogged = liveTrims.reduce((s, e) => s + (Number(e.shares) || 0), 0);
        const summary = liveTrims.length === 1
          ? `${liveTrims[0].shares || "?"} sh${liveTrims[0].price ? ` @ $${Number(liveTrims[0].price).toFixed(2)}` : ""}`
          : `${liveTrims.length} trims totalling ${totalLogged} sh`;
        const ok = window.confirm(`You already logged a trim for ${p.sym} today (${summary}) in the Today panel. The Sell button creates a closed-trade journal row that will likely DUPLICATE tomorrow's IBKR partial.\n\nContinue with the Sell flow anyway?\n\n(Recommended: hit Cancel, let IBKR sync overnight fill the journal automatically.)`);
        if (!ok) return;
      }
    }
    setSellId(p.id); setSellQty(p.shares); setSellPrice(p.cp); setSellReason(exitReasons[0] || "Sold Into Strength"); setSellTags([]); setSellAddJournal(true); setSellNotes(""); setSellComm(""); setSellChartUrl(p.chartUrl || "");
    const posNotes = parseNotes(p.notes);
    setSellNotesStruct({ right: posNotes.right || "", wrong: posNotes.wrong || "", lessons: posNotes.lessons || "" });
  };
  const cancelSell = () => setSellId(null);
  // Helper: find position by sellId, with ID-map fallback to survive autosave ID sync
  const findSellPos = useCallback(() => {
    if (!sellId) return null;
    let pos = positions.find(p => p.id === sellId);
    if (!pos && lastSaveIdMapRef && lastSaveIdMapRef.current.size > 0) {
      const mappedId = lastSaveIdMapRef.current.get(sellId);
      if (mappedId) pos = positions.find(p => p.id === mappedId);
    }
    return pos;
  }, [sellId, positions, lastSaveIdMapRef]);

  const confirmSell = async () => {
    const pos = findSellPos();
    if (!pos) return;
    const epN = parseFloat(pos.ep) || 0, stopN = parseFloat(pos.stop) || 0;
    const stop2N = parseFloat(pos.stop2) || 0;
    const soldShares = parseFloat(sellQty) || 0;
    const exitP = parseFloat(sellPrice) || 0;
    const totalShares = parseFloat(pos.shares) || 0;
    const remaining = totalShares - soldShares;

    if (sellAddJournal && soldShares > 0 && exitP > 0) {
      // Commission: use sell-form commission if provided, otherwise pro-rate from position commission
      const sellCommN = parseFloat(sellComm) || 0;
      const posCommN = parseFloat(pos.comm) || 0;
      const commPortion = sellCommN > 0 ? sellCommN : (totalShares > 0 ? posCommN * (soldShares / totalShares) : posCommN);
      // P/L without commission — matches M360 methodology and edit flow. Short inverts direction.
      const isShort = (pos.tradeType || "Long") === "Short";
      const plDollar = isShort ? (epN - exitP) * soldShares : (exitP - epN) * soldShares;
      const plPct = epN > 0 ? (isShort ? ((epN - exitP) / epN) * 100 : ((exitP - epN) / epN) * 100) : 0;
      // Weighted initial risk — accounts for dual stops (same formula as enrichment)
      const isDual = stopN > 0 && stop2N > 0;
      const h1 = isDual ? Math.ceil(totalShares / 2) : totalShares;
      const h2 = isDual ? totalShares - h1 : 0;
      const initRiskD = epN > 0 ? (epN - stopN) * h1 + (isDual ? (epN - stop2N) * h2 : 0) : 0;
      const initRisk = epN > 0 && totalShares > 0 ? initRiskD / (epN * totalShares) : 0;
      const rMult = initRisk > 0 ? (plPct / 100) / initRisk : 0;
      // Build notes: use structured fields if any filled, fall back to plain sellNotes, then position notes
      const hasStruct = sellNotesStruct.right || sellNotesStruct.wrong || sellNotesStruct.lessons;
      const finalNotes = hasStruct ? serializeNotes({ ...sellNotesStruct, _plain: "" }) : (sellNotes || pos.notes || "");
      const nowSell = new Date();
      const tradeObj = {
        ticker: pos.sym, entry: pos.entry, entryTime: pos.entryTime || "",
        exit: nowSell.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }),
        exitTime: nowSell.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
        entryP: epN, exitP, shares: soldShares, stop: stopN, setup: pos.setup,
        tags: [...(pos.tags || []), ...sellTags], plPct, plDollar, rMult,
        commission: commPortion, tradeType: pos.tradeType || "Long",
        reason: sellReason, notes: finalNotes, chartUrl: sellChartUrl || pos.chartUrl || "", chartImage: pos.chartImage || "",
        positionId: pos.id,    // ← Option C: auto-link this trade to the open lot it came from
        _fromDashboard: true,
      };

      // ATOMIC: Write trade directly to Supabase so it survives refresh
      if (session) {
        const uid = session.user.id;
        const dbRow = {
          user_id: uid, ticker: tradeObj.ticker, entry_date: tradeObj.entry, entry_time: tradeObj.entryTime,
          exit_date: tradeObj.exit, exit_time: tradeObj.exitTime,
          entry_price: tradeObj.entryP, exit_price: tradeObj.exitP, shares: tradeObj.shares,
          stop_price: tradeObj.stop, setup: tradeObj.setup, tags: tradeObj.tags,
          pl_pct: tradeObj.plPct, pl_dollar: tradeObj.plDollar, r_mult: tradeObj.rMult,
          exit_reason: tradeObj.reason, notes: tradeObj.notes,
          chart_url: tradeObj.chartUrl, chart_image: tradeObj.chartImage, trade_type: tradeObj.tradeType,
          is_deleted: false, // explicit so a missing column default can't leave it NULL (the load drops NULLs)
          // position_id intentionally OMITTED (not even written as null): the trades.position_id column may
          // not exist on every member's DB, and writing the key — even as null — makes the INSERT reference a
          // missing column so the whole insert fails (and the trade silently falls back to state-only, then
          // vanishes on reload). Omitting the key lets the DB default it where the column exists. This mirrors
          // the manual trade-save path. The auto-link is preserved separately via saveTradeLinks()/trade_links.
        };
        const { data: inserted, error } = await supabase.from("trades").insert([dbRow]).select("id");
        if (!error && inserted && inserted.length > 0) {
          // Use real DB id so it won't be re-inserted on next trade save
          const realId = inserted[0].id;
          // Mirror the auto-link to localStorage so the partial's Realized attribution survives refresh
          // even if the DB doesn't actually have the position_id column yet.
          saveTradeLinks([{ tradeId: realId, positionId: pos.id }]);
          syncTradeLinksToSupabase(supabase, uid); // durable cross-device store
          onJournalTrade({ ...tradeObj, id: realId });
        } else {
          console.error("Sell trade insert failed:", error?.message);
          // Fallback: add to state with temp id — manual save will pick it up
          const tempId = Date.now();
          saveTradeLinks([{ tradeId: tempId, positionId: pos.id }]);
          syncTradeLinksToSupabase(supabase, uid);
          onJournalTrade({ ...tradeObj, id: tempId });
        }
      } else {
        const tempId = Date.now();
        saveTradeLinks([{ tradeId: tempId, positionId: pos.id }]);
        if (session) syncTradeLinksToSupabase(supabase, session.user.id);
        onJournalTrade({ ...tradeObj, id: tempId });
      }
    }

    if (remaining > 0) {
      setPositions(prev => { const next = prev.map(p => p.id === pos.id ? { ...p, shares: String(remaining) } : p); positionsRef.current = next; return next; });
    } else {
      removeRow(pos.id, true); // skip confirm — sell modal already confirmed
    }
    setSellId(null);
    // CRITICAL: trigger immediate save after sell — saves position changes to Supabase.
    // Trade is already saved atomically above, so only position state needs saving here.
    setTimeout(() => onManualSaveRef.current(), 50); // ref avoids stale closure
  };

  // Realized P/L per position — ONLY counts journal trades that are partial sells of the SAME lot.
  // Match: same ticker AND the SAME entry day (a partial sell, taken via the Sell button, inherits the
  // position's entry date — see confirmSell). Comparison uses `tradeDateISO` so it's robust to format/time
  // differences (e.g. manual "5/1/26" vs IBKR "2026-05-01" vs a stored timestamp all resolve to one day).
  // A separate round-trip in the same ticker (different entry day) is a distinct trade and is NOT attributed
  // here — that previously inflated/confused the open position's "Realized" figure (e.g. KLAC).
  // For each open position, attribute partial-sell journal trades:
  //   • Primary rule: same ticker AND trade entry day === position entry day (the Sell button
  //     stamps the position's entry day onto the partial trade, so a clean flow always matches here).
  //   • Fallback for IBKR-synced positions (the date drifts when IBKR reconciles or timezone shifts):
  //     when this is the ONLY open lot of that ticker, ANY closed trade of the same ticker whose
  //     entry day is on/after the position entry is treated as a partial of this lot. That's safe
  //     because a separate earlier round-trip would have an entry BEFORE this lot's entry (filtered
  //     out), and there can't be a separate later round-trip on the same ticker while we're still
  //     holding shares of it. When MULTIPLE open lots of the same ticker exist, we can't disambiguate,
  //     so we fall back to strict day-match only.
  // Returns { pl: $, shares: total sold, hasMatch: bool } per position id.
  const realizedByPosition = useMemo(() => {
    const map = {};
    if (!journaledTrades || !positions) return map;

    // ── OPTION C — EXPLICIT POSITION LINKAGE ──
    // First pass: any trade with `positionId` set is attributed STRICTLY to that position. No date,
    // no ticker, no reason — pure id match. This is the deterministic, bulletproof path.
    // Second pass (below, inside the per-position loop): for trades with NO positionId, fall back to
    // the heuristic match (ticker + reason + same-day). This keeps the app working during the
    // backfill window — once a user has linked all historical trades via the wizard, the heuristic
    // path becomes a no-op and every Realized number is provably correct.
    const linkedByPosId = {};
    journaledTrades.forEach(t => {
      if (!t.positionId) return;
      if (!linkedByPosId[t.positionId]) linkedByPosId[t.positionId] = [];
      linkedByPosId[t.positionId].push(t);
    });

    // Pre-bucket open lots by ticker once — we use the count to decide whether Stage 2 can safely fire
    // (only when there's exactly ONE open lot of a ticker, so attribution is unambiguous).
    const openCountByTicker = {};
    positions.forEach(p => {
      const s = String(p.sym || "").trim().toUpperCase();
      if (!s) return;
      openCountByTicker[s] = (openCountByTicker[s] || 0) + 1;
    });

    positions.forEach(p => {
      if (!p.sym) { map[p.id] = { pl: 0, shares: 0 }; return; }
      const posSym = String(p.sym).trim().toUpperCase();
      const posEntryISO = tradeDateISO(p.entry); // may be empty for IBKR Summary-level positions (openDate omitted)

      // STAGE 1 — explicitly linked trades for this position. Pure id match, no heuristics.
      // This is the deterministic gold path: Sell button, IBKR sync, and the Link Trades wizard all
      // write `position_id` here.
      const linkedMatches = linkedByPosId[p.id] || [];

      // STAGE 2 — date-anchored fallback for trades with NO positionId. The rule is provably safe:
      //
      //   match if: trade.ticker === position.ticker
      //        AND  trade.exit_date >= position.entry_date
      //        AND  exactly ONE open lot of this ticker exists (no ambiguity)
      //
      // Why "exit_date >= position.entry_date" is bulletproof: a *past cycle* of the same ticker
      // necessarily exited before you re-entered (you have to be flat to open a new lot), so its
      // exit_date is strictly less than the current position's entry_date — automatically excluded.
      // A *genuine partial* of the current lot was sold on or after the lot opened — automatically
      // included. No tags required, no wizard required. The INOD/TEAM "past loss leaking in" bug
      // and the MDB "same-day round-trip" bug both stay fixed.
      //
      // We also still honor the "Partial Trim" reason marker as an *override* — it forces inclusion
      // even when the date heuristic would skip (used by IBKR partial imports whose openDate FIFO-
      // drifts off the current position's entry day).
      //
      // If position.entry is missing, the date rule can't run safely — we only match explicit
      // "Partial Trim" trades in that case.
      const onlyOneLot = openCountByTicker[posSym] === 1;
      const heuristicMatches = onlyOneLot ? journaledTrades.filter(t => {
        if (t.positionId) return false; // already attributed via Stage 1 (this position OR another)
        if (String(t.ticker || "").trim().toUpperCase() !== posSym) return false;
        // Hard override: explicit "Partial Trim" marker is always a match for this lot
        if (t.reason === "Partial Trim") return true;
        // Date rule: trade's exit must be on/after this position's entry day
        if (!posEntryISO) return false;
        const tExitISO = tradeDateISO(t.exit);
        if (!tExitISO) return false;
        return tExitISO >= posEntryISO;
      }) : [];

      const matches = [...linkedMatches, ...heuristicMatches];
      const pl = matches.reduce((sum, t) => sum + (t.plDollar || 0), 0);
      const shares = matches.reduce((sum, t) => sum + (parseFloat(t.shares) || 0), 0);
      map[p.id] = { pl, shares };
    });
    return map;
  }, [journaledTrades, positions]);

  // Diagnostic counters — surfaced under the Open Positions header so the user can see exactly what's
  // matched vs unmatched. Helps distinguish "matcher is broken" from "no partials have actually been
  // imported into the Journal yet". Reads journal trades that LOOK like IBKR partial trims.
  const partialsDiag = useMemo(() => {
    if (!journaledTrades) return { totalRealized: 0, attributed: 0, unattributedTrades: 0, positionsWithPartials: 0 };
    const totalRealized = Object.values(realizedByPosition).reduce((s, v) => s + (v?.pl || 0), 0);
    const positionsWithPartials = Object.values(realizedByPosition).filter(v => v?.pl && v.pl !== 0).length;
    // Count IBKR-source partial-style entries (exit_reason "Partial Trim" or has ibExecId) in journal
    const partialJournalTrades = journaledTrades.filter(t =>
      (t.source === "ibkr" || t.source === "reconciled") && (t.reason === "Partial Trim" || t.ibExecId)
    );
    const attributedPlSum = positions ? positions.reduce((s, p) => {
      const v = realizedByPosition[p.id];
      return s + (v?.pl || 0);
    }, 0) : 0;
    // Trades that look like partials but didn't end up attributed (sum of their pl that's not in attributedPlSum)
    const journalPartialsTotal = partialJournalTrades.reduce((s, t) => s + (t.plDollar || 0), 0);
    const unattributedAmount = Math.round((journalPartialsTotal - attributedPlSum) * 100) / 100;
    return {
      totalRealized: Math.round(totalRealized * 100) / 100,
      attributed: positionsWithPartials,
      journalPartialTradeCount: partialJournalTrades.length,
      unattributedAmount,
    };
  }, [realizedByPosition, journaledTrades, positions]);

  // Enriched — dual stop loss: if stop2 is set, 50/50 split. Otherwise stop1 covers 100%.
  const enriched = useMemo(() => positions.map(p => { try {
    const epN = parseFloat(p.ep)||0, cpN = parseFloat(p.cp)||0, sharesN = parseFloat(p.shares)||0, commN = parseFloat(p.comm)||0;
    const s1 = parseFloat(p.stop)||0;
    const s2 = parseFloat(p.stop2)||0;
    const tsN = parseFloat(p.trailStop)||0; // trailing stop (member-editable)
    const hasS1 = s1 > 0, hasS2 = s2 > 0, hasTS = tsN > 0;
    const isDual = hasS1 && hasS2; // only split 50/50 when BOTH stops are filled

    // Original stops — locked, used for R calculations
    const stop1 = hasS1 ? s1 : 0;
    const stop2 = hasS2 ? s2 : 0;
    const h1 = isDual ? Math.ceil(sharesN / 2) : sharesN; // stop1 share count
    const h2 = isDual ? sharesN - h1 : 0;                  // stop2 share count

    // Active stop for DTS/RTS: trailing stop if set, otherwise original stops
    const activeStop = hasTS ? tsN : (isDual ? (stop1 * h1 + stop2 * h2) / (h1 + h2) : stop1);

    const posValue = epN * sharesN;
    const tier = autoTier(posValue, sizer);

    // DTS uses active stop (trail stop if set, otherwise weighted original)
    const dtsD = hasTS ? (cpN - tsN) : (sharesN > 0 ? ((cpN - stop1) * h1 + (isDual ? (cpN - stop2) * h2 : 0)) / sharesN : 0);
    const dtsPct = cpN > 0 ? (dtsD / cpN) * 100 : 0;

    // DTS total $ — uses active stop
    const dtsTotalD = hasTS ? (cpN - tsN) * sharesN : ((cpN - stop1) * h1 + (isDual ? (cpN - stop2) * h2 : 0));

    // RTS uses active stop: risk from entry to active stop. Goal: $0 when stop ≥ entry.
    const rtsD = hasTS ? (epN - tsN) * sharesN : ((epN - stop1) * h1 + (isDual ? (epN - stop2) * h2 : 0));

    // SBE = shares to sell at current price so if remaining shares get stopped, net P/L = $0
    // Formula: X = N × (EP - avgStop) / (CP - avgStop), where avgStop is weighted across halves
    const avgStop = sharesN > 0 ? (stop1 * h1 + stop2 * h2) / sharesN : 0;
    const canFinanceSBE = cpN > epN && cpN > avgStop && avgStop > 0;
    const sbe = canFinanceSBE ? Math.ceil(sharesN * (epN - avgStop) / (cpN - avgStop)) : 0;
    const sbePct = canFinanceSBE && sharesN > 0 ? (sbe / sharesN) * 100 : 0;

    // P/L (commission subtracted from dollar P/L) — Short inverts direction
    const isShort = (p.tradeType || "Long") === "Short";
    const rawPL = isShort ? (epN - cpN) * sharesN : (cpN - epN) * sharesN;
    const plD = rawPL - commN;
    const plPct = epN > 0 && sharesN > 0 ? (plD / (epN * sharesN)) * 100 : 0;

    // R-Multiple uses weighted initial risk
    const initRiskD = epN > 0 ? (epN - stop1) * h1 + (isDual ? (epN - stop2) * h2 : 0) : 0;
    const initRiskPct = epN > 0 && sharesN > 0 ? initRiskD / (epN * sharesN) : 0;
    const rMult = initRiskPct > 0 ? (plPct / 100) / initRiskPct : 0;

    // ROTE — initial (original stops) and current (active stop = trail if set)
    const ps = +portfolioSize || 0;
    const roteD = initRiskD > 0 ? initRiskD : 0;
    const rotePct = ps > 0 ? (roteD / ps) * 100 : 0;
    const currentRoteD = activeStop >= epN ? 0 : Math.max(0, (epN - activeStop) * sharesN);
    const currentRotePct = compEquity > 0 ? (currentRoteD / compEquity) * 100 : 0;

    // Risk-free exposure: use trail stop if set, otherwise original stops
    let riskFreePct = 0;
    if (epN > 0) {
      if (hasTS) {
        riskFreePct = tsN >= epN ? 100 : 0;
      } else if (isDual) {
        const s1Free = stop1 >= epN, s2Free = stop2 >= epN;
        riskFreePct = (s1Free && s2Free) ? 100 : (s1Free || s2Free) ? 50 : 0;
      } else if (hasS1) {
        riskFreePct = stop1 >= epN ? 100 : 0;
      }
    }
    const riskExposurePct = 100 - riskFreePct;

    // Risk Status
    const anyStop = hasS1 || hasS2;
    const riskStatus = !epN || !anyStop ? "—"
      : rtsD < 0 ? "Profit Locked"
      : rtsD === 0 ? "Risk-Free"
      : "At Risk";

    // R-based fields — ALWAYS use original stops for R calculation
    // R = initial risk per share (entry - weighted avg original stop)
    const rPerShare = epN > 0 && sharesN > 0 ? initRiskD / sharesN : 0;
    // Current R-level (how many R's the stock has moved from entry)
    const currentRLevel = rPerShare > 0 ? Math.floor((cpN - epN) / rPerShare) : 0;
    // R-multiple (continuous, not floored)
    const rAchieved = rPerShare > 0 ? (cpN - epN) / rPerShare : 0;
    // Suggested trailing stop: at each R-level, lock in (level - 1) R
    const rSuggestedStop = rPerShare > 0 && currentRLevel >= 1
      ? epN + (currentRLevel - 1) * rPerShare
      : (hasS1 ? stop1 : 0);
    // Locked profit per share at suggested stop
    const rLockedProfit = rSuggestedStop > epN ? rSuggestedStop - epN : 0;
    // Next R-target price
    const rNextTarget = rPerShare > 0 ? epN + (Math.max(0, currentRLevel) + 1) * rPerShare : 0;
    // DTS in R terms — uses active stop (trail stop if set)
    const dtsR = rPerShare > 0 ? dtsD / rPerShare : 0;
    // RTS in R terms
    const rtsR = rPerShare > 0 && sharesN > 0 ? (rtsD / sharesN) / rPerShare : 0;

    const expPct = compEquity > 0 ? (posValue / compEquity) * 100 : 0;
    // Realized P/L + shares trimmed from partial sells of THIS position
    const rb = realizedByPosition[p.id] || { pl: 0, shares: 0 };
    const realizedPL = rb.pl || 0;
    const realizedShares = rb.shares || 0;
    // Original total shares = currently-held + already-sold (for "% trimmed" display)
    const origShares = sharesN + realizedShares;
    const trimPct = origShares > 0 ? (realizedShares / origShares) * 100 : 0;
    // Cost financed = realized profits >= initial risk (playing with house money)
    const costFinanced = realizedPL > 0 && initRiskD > 0 && realizedPL >= initRiskD;
    // ─── Intraday projected fields ─── pure read of the intraday_log on this position. Adds projected
    // shares / trim % / realized $ for display alongside the confirmed (sharesN / trimPct / realizedPL)
    // values — NEVER replaces them. If the user hasn't logged anything today, every field is 0 and the
    // existing UI is unchanged. Reconciled events (matched to IBKR fills) are EXCLUDED from "projected"
    // because the journal will carry them once sync runs.
    const _log = (p.intradayLog && Array.isArray(p.intradayLog.events)) ? p.intradayLog.events : [];
    const _liveEvents = _log.filter(e => e && !e.reconciledExecId);
    const sumTrimsLogged = _liveEvents.filter(e => e.type === "trim").reduce((s, e) => s + (Number(e.shares) || 0), 0);
    const sumAddsLogged = _liveEvents.filter(e => e.type === "add").reduce((s, e) => s + (Number(e.shares) || 0), 0);
    const sharesNProj = sharesN - sumTrimsLogged + sumAddsLogged;
    const realizedProjAdd = _liveEvents.filter(e => e.type === "trim").reduce((s, e) => {
      const px = Number(e.price) || 0;
      if (px <= 0 || epN <= 0) return s;
      const qty = Number(e.shares) || 0;
      const dirSign = (p.tradeType === "Short") ? -1 : 1;
      return s + dirSign * (px - epN) * qty;
    }, 0);
    const trimProjPct = origShares > 0 ? ((realizedShares + sumTrimsLogged) / origShares) * 100 : 0;
    // Today's-only trim % — just the intraday log's contribution, separate from any historical realized trims.
    // Helps the user see "this session I trimmed 1.9%" vs "total trimmed is now 41.9%".
    const todayTrimPct = origShares > 0 ? (sumTrimsLogged / origShares) * 100 : 0;
    // Projected remaining % — what's left of the original after today's logged trim is booked.
    const remainingProjPct = origShares > 0 ? (sharesNProj / origShares) * 100 : 0;
    const intradayEventCount = _log.length;
    const intradayLiveCount = _liveEvents.length;
    const intradayAllReconciled = _log.length > 0 && _liveEvents.length === 0;

    return { ...p, epN, cpN, commN, stop1, stop2, tsN, hasTS, sharesN, h1, h2, posValue, expPct, realizedPL, realizedShares, origShares, trimPct, costFinanced, tier, isDual, activeStop, dtsD, dtsPct, dtsTotalD, rtsD, sbe, sbePct, plPct, plD, rMult, riskStatus, roteD, rotePct, currentRoteD, currentRotePct, riskFreePct, riskExposurePct, rPerShare, currentRLevel, rAchieved, rSuggestedStop, rLockedProfit, rNextTarget, dtsR, rtsR, sumTrimsLogged, sumAddsLogged, sharesNProj, realizedProjAdd, trimProjPct, todayTrimPct, remainingProjPct, intradayEventCount, intradayLiveCount, intradayAllReconciled };
  } catch (err) { console.error("Enrichment error for position:", p.id, err); return { ...p, epN:0, cpN:0, commN:0, stop1:0, stop2:0, tsN:0, hasTS:false, sharesN:0, h1:0, h2:0, posValue:0, expPct:0, realizedPL:0, realizedShares:0, origShares:0, trimPct:0, costFinanced:false, tier:"Pilot", isDual:false, activeStop:0, dtsD:0, dtsPct:0, dtsTotalD:0, rtsD:0, sbe:0, sbePct:0, plPct:0, plD:0, rMult:0, riskStatus:"—", roteD:0, rotePct:0, currentRoteD:0, currentRotePct:0, riskFreePct:0, riskExposurePct:0, rPerShare:0, currentRLevel:0, rAchieved:0, rSuggestedStop:0, rLockedProfit:0, rNextTarget:0, dtsR:0, rtsR:0, sumTrimsLogged:0, sumAddsLogged:0, sharesNProj:0, realizedProjAdd:0, trimProjPct:0, todayTrimPct:0, remainingProjPct:0, intradayEventCount:0, intradayLiveCount:0, intradayAllReconciled:false }; }
  }), [positions, sizer, portfolioSize, compEquity, realizedByPosition]);

  const totals = useMemo(() => {
    const active = enriched.filter(p => p.sym && p.cpN > 0);
    const totalValue = active.reduce((s,p) => s + p.cpN * p.sharesN, 0);
    // Total DTS in dollars (current-to-stop across all positions)
    const totalDtsD = active.reduce((s,p) => s + p.dtsTotalD, 0);
    const avgDtsPct = totalValue > 0 ? (totalDtsD / totalValue) * 100 : 0;
    const totalRoteD = enriched.reduce((s,p) => s + p.roteD, 0); // initial ROTE (original stops)
    const ps = +portfolioSize || 0;
    const totalRotePct = ps > 0 ? (totalRoteD / ps) * 100 : 0;
    // Current ROTE — uses active stops (trail stop if set). Only counts positions still at risk.
    const realizedPL = journaledTrades ? journaledTrades.reduce((s,t) => s + (t.plDollar || 0), 0) : 0;
    const currentEquity = ps + realizedPL;
    const currentRoteD = enriched.reduce((s,p) => {
      if (!p.epN || (!p.stop1 && !p.stop2)) return s;
      const isRiskFree = p.activeStop >= p.epN;
      if (isRiskFree) return s;
      const risk = (p.epN - p.activeStop) * p.sharesN;
      return s + Math.max(0, risk);
    }, 0);
    const currentRotePct = currentEquity > 0 ? (currentRoteD / currentEquity) * 100 : 0;
    const tgtRotePct = +(targetRote || 0);
    return {
      totalPL: enriched.reduce((s,p) => s + p.plD, 0),
      totalRTS: enriched.reduce((s,p) => s + p.rtsD, 0),
      totalDtsD,
      avgDtsPct,
      totalValue,
      count: enriched.filter(p => p.sym).length,
      totalRoteD,
      totalRotePct,
      currentRoteD,
      currentRotePct,
      currentEquity,
      tgtRotePct,
    };
  }, [enriched, journaledTrades, targetRote]);


  const posAnalysis = useMemo(() => {
    if (!positions || positions.length === 0) return [];
    return positions.filter(p => p.sym).map(p => {
      const epN = parseFloat(p.ep) || 0;
      const cpN = parseFloat(p.cp) || 0;
      const sharesN = parseFloat(p.shares) || 0;
      const commN = parseFloat(p.comm) || 0;
      const s1 = parseFloat(p.stop) || 0;
      const s2 = parseFloat(p.stop2) || 0;
      const tsN = parseFloat(p.trailStop) || 0;
      const isDual = s1 > 0 && s2 > 0;
      const h1 = isDual ? Math.ceil(sharesN / 2) : sharesN;
      const h2 = isDual ? sharesN - h1 : 0;
      const initRiskD = (epN - s1) * h1 + (isDual ? (epN - s2) * h2 : 0);
      const activeStop = tsN > 0 ? tsN : (isDual ? (s1 * h1 + s2 * h2) / (h1 + h2) : s1);
      const currentRiskD = (epN - activeStop) * sharesN;
      const isRiskFree = activeStop >= epN && epN > 0 && (s1 > 0 || s2 > 0);
      const roteD = initRiskD > 0 ? initRiskD : 0;
      const rotePct = compEquity > 0 ? (roteD / compEquity) * 100 : 0;
      const currentRoteD = isRiskFree ? 0 : Math.max(0, currentRiskD);
      const currentRotePct = compEquity > 0 ? (currentRoteD / compEquity) * 100 : 0;
      const unrealizedPL = (cpN - epN) * sharesN - commN;
      return { sym: p.sym, epN, cpN, sharesN, s1, s2, tsN, activeStop, initRiskD: roteD, initRotePct: rotePct, currentRiskD: currentRoteD, currentRotePct, isRiskFree, unrealizedPL, isDual };
    });
  }, [positions, compEquity]);

  const budget = useMemo(() => {
    const tgtRote = (+targetRote || 0) / 100;
    const totalBudget = compEquity * tgtRote;
    const deployedRisk = posAnalysis.reduce((s, p) => s + p.currentRiskD, 0);
    const initialRisk = posAnalysis.reduce((s, p) => s + p.initRiskD, 0);
    const freedRisk = initialRisk - deployedRisk;
    const available = Math.max(0, totalBudget - deployedRisk);
    const atRiskCount = posAnalysis.filter(p => !p.isRiskFree && p.initRiskD > 0).length;
    const freeCount = posAnalysis.filter(p => p.isRiskFree).length;
    const totalCount = posAnalysis.filter(p => p.initRiskD > 0 || p.isRiskFree).length;
    const totalUnrealized = posAnalysis.reduce((s, p) => s + p.unrealizedPL, 0);
    const deployedPct = compEquity > 0 ? (deployedRisk / compEquity) * 100 : 0;
    const availablePct = compEquity > 0 ? (available / compEquity) * 100 : 0;
    const initialRotePct = compEquity > 0 ? (initialRisk / compEquity) * 100 : 0;
    return { totalBudget, deployedRisk, initialRisk, freedRisk, available, atRiskCount, freeCount, totalCount, totalUnrealized, deployedPct, availablePct, initialRotePct, tgtRote };
  }, [posAnalysis, compEquity, targetRote]);


  const compTh = (text, align = "right") => <th style={{padding:"10px 8px",textAlign:align,fontWeight:700,fontSize:"0.56rem",letterSpacing:"0.10em",textTransform:"uppercase",color:C.muted,whiteSpace:"nowrap"}}>{text}</th>;

  const th = (text, align = "right", sortKey = null) => <th onClick={sortKey ? (e) => setPosSorts(s => toggleSort(s, sortKey, e.shiftKey)) : undefined} style={{ padding:"10px 6px",textAlign:align,fontWeight:700,fontSize:"0.56rem",letterSpacing:"0.10em",textTransform:"uppercase",color:posSorts.find(s=>s.key===sortKey)?C.gold:C.muted,whiteSpace:"nowrap",cursor:sortKey?"pointer":"default",userSelect:"none" }}>{text}{sortKey ? sortArrow(posSorts, sortKey) : ""}</th>;

  // ═══════════════════════════════════════════════════════════════════════
  // ─── MOCKUP-UI RENDER (dashboard-recommended.html) ───
  // Exact port of the mockup: its real CSS (injected scoped under `.vd`,
  // see DASH_CSS) + its exact markup as JSX, wired to the live memos/handlers
  // above. NOTE: Guided/Pro + table view persist to localStorage to match the
  // mockup; planned follow-up is user_settings per-account (project memory).
  // ═══════════════════════════════════════════════════════════════════════
  const [uiMode, setUiMode] = useState(() => { try { return localStorage.getItem("viv-mode") === "pro" ? "pro" : "guided"; } catch { return "guided"; } });
  const [tableView, setTableView] = useState(() => { try { return localStorage.getItem("viv-view") === "pro" ? "pro" : "simple"; } catch { return "simple"; } });
  useEffect(() => { try { localStorage.setItem("viv-mode", uiMode); } catch {} }, [uiMode]);
  useEffect(() => { try { localStorage.setItem("viv-view", tableView); } catch {} }, [tableView]);
  const expert = uiMode === "pro";
  const showPro = tableView === "pro"; // table columns are controlled ONLY by the Simple/Pro toggle, not by Guided/Pro mode (which now only governs guidance)
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => { try { return localStorage.getItem("viv-welcome-x") === "1"; } catch { return false; } });
  const [eqCollapsed, setEqCollapsed] = useState(false);
  const [manageId, setManageId] = useState(null);
  const [sellOpen, setSellOpen] = useState(false);
  const [capEditing, setCapEditing] = useState(false);
  const [capDraft, setCapDraft] = useState("");
  const [activeGuide, setActiveGuide] = useState(null);
  const [guide, setGuide] = useState(null);
  const [guideMuted, setGuideMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef(null);
  const rootRef = useRef(null);

  // scroll-reveal: add in-view so gated content (h1/sub/spark/alloc) becomes visible + animates
  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    const els = root.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("in-view")); return; }
    const io = new IntersectionObserver((ents) => { ents.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in-view"); io.unobserve(en.target); } }); }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
    els.forEach(e => io.observe(e));
    // The one-shot observer can latch a stale "not intersecting" state during the initial
    // data-load/layout settle and never re-fire (a short page doesn't scroll), which leaves gated
    // content stuck hidden (e.g. the risk-allocation bar at width 0). After things settle, reveal
    // anything that's actually on-screen so it can't get stuck.
    const settle = setTimeout(() => {
      els.forEach(e => {
        if (e.classList.contains("in-view")) return;
        const r = e.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) { e.classList.add("in-view"); io.unobserve(e); }
      });
    }, 600);
    return () => { io.disconnect(); clearTimeout(settle); };
  }, []);

  const applyMode = (m) => { setUiMode(m); if (m === "pro") { try { audioRef.current && audioRef.current.pause(); } catch {} setGuide(null); setActiveGuide(null); } };
  const narrate = (audio) => { if (guideMuted || !audio || !audioRef.current) return; try { audioRef.current.pause(); audioRef.current.src = audio; audioRef.current.currentTime = 0; audioRef.current.play().catch(() => {}); } catch {} };
  const guideEnter = (key, title, body, audio) => () => { if (expert) return; setActiveGuide(key); setGuide({ title, body }); narrate(audio); };
  const guideLeave = (key) => () => { setActiveGuide(g => (g === key ? null : g)); };
  const gactive = (key) => (!expert && activeGuide === key ? " guide-active" : "");

  const usd0 = (n) => "$" + Math.round(n || 0).toLocaleString("en-US");
  const usdSigned = (n) => (n >= 0 ? "+" : "−") + "$" + Math.abs(Math.round(n || 0)).toLocaleString("en-US");
  const pct2 = (n) => (n || 0).toFixed(2) + "%";
  const pctSigned = (n) => (n >= 0 ? "+" : "") + (n || 0).toFixed(2) + "%";
  const statusClass = (s) => s === "Profit Locked" ? "st-lock" : s === "Risk-Free" ? "st-free" : s === "At Risk" ? "st-risk" : "st-free";

  // hero figures
  const openCount = enriched.filter(p => p.sym && p.sharesN > 0).length;
  const heroCostBasis = enriched.filter(p => p.sym).reduce((s, p) => s + p.epN * p.sharesN, 0);
  const openPL = budget.totalUnrealized;
  const openPLpct = heroCostBasis > 0 ? (openPL / heroCostBasis) * 100 : 0;
  const rtsTotal = budget.deployedRisk;
  const rtsPct = compEquity > 0 ? (rtsTotal / compEquity) * 100 : 0;

  // sizing console outputs
  const rawAvail = budget.totalBudget - budget.deployedRisk;
  const over = rawAvail < 0;
  const rPerTrade = (rNumStocks || 0) > 0 ? budget.totalBudget / rNumStocks : 0;
  const fullTrades = rPerTrade > 0 ? Math.floor(Math.max(0, rawAvail) / rPerTrade) : 0;
  const halfTrades = rPerTrade > 0 ? Math.floor(Math.max(0, rawAvail) / (rPerTrade / 2)) : 0;
  const allocPct = budget.totalBudget > 0 ? Math.min(100, budget.deployedRisk / budget.totalBudget * 100) : 100;

  // realized-P/L sparkline (honest equity curve from closed trades; fall back to mockup curve)
  const spark = useMemo(() => {
    const tr = (journaledTrades || []).slice().reverse();
    if (tr.length < 2) return null;
    let cum = 0; const pts = tr.map(t => { cum += (t.plDollar || 0); return cum; });
    const min = Math.min(0, ...pts), max = Math.max(0, ...pts), range = (max - min) || 1;
    const W = 320, H = 56, step = W / (pts.length - 1);
    const xy = pts.map((v, i) => [+(i * step).toFixed(1), +(H - ((v - min) / range) * (H - 6) - 3).toFixed(1)]);
    const line = xy.map((p, i) => (i ? "L" : "M") + p[0] + "," + p[1]).join(" ");
    const area = "M" + xy[0][0] + "," + H + " " + xy.map(p => "L" + p[0] + "," + p[1]).join(" ") + " L" + xy[xy.length - 1][0] + "," + H + " Z";
    return { line, area, up: pts[pts.length - 1] >= 0 };
  }, [journaledTrades]);
  const sparkLine = spark ? spark.line : "M0,44 L32,46 L64,40 L96,42 L128,33 L160,36 L192,26 L224,30 L256,18 L288,22 L320,9";
  const sparkArea = spark ? spark.area : "M0,44 L32,46 L64,40 L96,42 L128,33 L160,36 L192,26 L224,30 L256,18 L288,22 L320,9 L320,56 L0,56 Z";

  // live "this sale" readout for the Manage sell form
  const manageRow = manageId != null ? enriched.find(p => p.id === manageId) : null;
  const sellPos = manageRow;
  const sQty = parseFloat(sellQty) || 0;
  const sExit = parseFloat(sellPrice) || 0;
  const sShares = sellPos ? sellPos.sharesN : 0;
  const sAvg = sellPos ? sellPos.epN : 0;
  const sStop = sellPos ? sellPos.stop1 : 0;
  const sIsShort = sellPos && (sellPos.tradeType || "Long") === "Short";
  const sSoldPct = sShares > 0 ? Math.min(100, (sQty / sShares) * 100) : 0;
  const sRemain = Math.max(0, sShares - sQty);
  const sPl = sIsShort ? (sAvg - sExit) * sQty : (sExit - sAvg) * sQty;
  const sPlPct = sAvg > 0 ? (sIsShort ? (sAvg - sExit) / sAvg : (sExit - sAvg) / sAvg) * 100 : 0;
  const sRiskFrac = sAvg > 0 ? (sIsShort ? (sStop - sAvg) : (sAvg - sStop)) / sAvg : 0;
  const sR = sRiskFrac > 0 ? (sPlPct / 100) / sRiskFrac : null;

  const openManage = (p) => { if (manageId === p.id) { setManageId(null); setSellOpen(false); return; } setManageId(p.id); setSellOpen(false); };
  const openSell = (p) => { setManageId(p.id); startSell(p); setSellOpen(true); };
  // Add a position, then open its Manage panel so the user can fill in ticker/shares/cost/stops.
  const addAndManage = () => { const newId = positions.reduce((m, p) => Math.max(m, p.id || 0), 0) + 1; addPosition(); setSellOpen(false); setManageId(newId); };
  const firstName = (displayName && displayName.trim()) || (session?.user?.email ? session.user.email.split("@")[0] : "trader");

  return (
    <div className={"vd" + (expert ? " expert" : "") + (showPro ? " pro" : "")} ref={rootRef}>
      <style dangerouslySetInnerHTML={{ __html: DASH_CSS }} />
      <audio ref={audioRef} preload="auto" onPlaying={() => setSpeaking(true)} onEnded={() => setSpeaking(false)} onPause={() => setSpeaking(false)} />
      <div className="shell">

        {/* NAV TABS */}
        <div className="navbar">
          <div className="brand"><img src="/logo-mark.png" alt="Valen Insiders Vault" style={{ width: 24, height: 24, objectFit: "contain", display: "block" }} /> Valen Insiders Vault</div>
          <div className="tabs">
            <a className="on" style={{ cursor: "pointer" }} onClick={() => setPage && setPage("dashboard")}>Dashboard</a>
            <a style={{ cursor: "pointer" }} onClick={() => setPage && setPage("journal")}>Journal</a>
            <a style={{ cursor: "pointer" }} onClick={() => setPage && setPage("tools")}>Premium tools</a>
            <a style={{ cursor: "pointer" }} onClick={() => setPage && setPage("settings")}>Settings</a>
          </div>
          <div className="spacer"></div>
          <div className="seg" id="modeSeg" title="Guided explains everything; Pro strips it back for experts">
            <button className={uiMode === "guided" ? "on" : ""} onClick={() => applyMode("guided")}>Guided</button>
            <button className={uiMode === "pro" ? "on" : ""} onClick={() => applyMode("pro")}>Pro</button>
          </div>
          <WhatsNew />
          <button onClick={() => onLogout && onLogout()} title="Sign out" style={{ marginLeft: 14, background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", fontFamily: "var(--font)", fontSize: "0.72rem", fontWeight: 700, padding: "7px 14px", borderRadius: 980, cursor: "pointer" }}>Sign out</button>
        </div>

        {/* HEADER */}
        <div className="reveal">
          <div className="eyebrow">Dashboard</div>
          <div className="row" style={{ marginTop: 6 }}>
            <div className="h1">Welcome back, <span className="goldname">{firstName}</span></div>
          </div>
          <div className="sub">Your trading compounding cockpit. Everything below updates live from your positions and closed trades.</div>
        </div>

        {/* 1. ONE DOMINANT NUMBER */}
        <div className="hero">
          <div className={"card north guide reveal" + (openPL < 0 ? " north-neg" : "") + gactive("pl")} onMouseEnter={guideEnter("pl", "Open profit and loss", "How much your open positions are up or down right now. Green means you're in profit; the line below is your realized equity trend.", "/audio/open-pl.mp3")} onMouseLeave={guideLeave("pl")}>
            <div className="label">Open P/L · this month's live result</div>
            <div className="big" style={{ color: openPL >= 0 ? "var(--green)" : "var(--red)" }}><Cu>{usdSigned(openPL)}</Cu></div>
            <div className="meta">{pctSigned(openPLpct)} across {openCount} open position{openCount === 1 ? "" : "s"} · you're {openPL >= 0 ? "green" : "red"} on open risk</div>
            <svg className="spark" viewBox="0 0 320 56" preserveAspectRatio="none" role="img" aria-label="Realized equity trend">
              <defs><linearGradient id="sparkg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={spark && !spark.up ? "rgba(239,68,68,0.30)" : "rgba(34,197,94,0.34)"} /><stop offset="100%" stopColor="rgba(34,197,94,0)" /></linearGradient></defs>
              <g id="sparkRise">
                <path d={sparkArea} fill="url(#sparkg)" />
                <path d={sparkLine} fill="none" stroke={spark && !spark.up ? "var(--red)" : "var(--green)"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              </g>
            </svg>
            <div className="sparklabel">{spark ? `Realized P/L trend · ${(journaledTrades || []).length} closed trades` : "Realized equity trend"}</div>
          </div>

          <div className={"card mini guide reveal" + gactive("rts")} onMouseEnter={guideEnter("rts", "Risk in the market", "The total you'd lose if every open position hit its stop at once. Keep it inside your risk rule.", "/audio/risk-market.mp3")} onMouseLeave={guideLeave("rts")}>
            <div className="label"><span className="term" data-tip="Risk To Stop: the total dollars you'd lose right now if every open position hit its stop. This is your real exposure.">Risk in the market <span className="plain">(RTS)</span></span></div>
            <div className={"val " + (rtsTotal > 0 ? "red" : "green")}><Cu>{usd0(rtsTotal)}</Cu></div>
            <div className="hint">{pct2(rtsPct)} of equity at risk{totals.tgtRotePct ? (rtsPct <= totals.tgtRotePct ? ` — well inside your ${pct2(totals.tgtRotePct)} rule` : ` — over your ${pct2(totals.tgtRotePct)} rule`) : ""}</div>
          </div>

          <div className={"card mini equity guide" + (eqCollapsed ? " collapsed" : "") + (useSecuredProfit ? "" : " off") + gactive("eq")} onMouseEnter={guideEnter("eq", "Live risk budget and sizing", "Set how much of your account you'll risk and across how many trades. The right side shows your budget and per-trade sizing.", "/audio/console.mp3")} onMouseLeave={guideLeave("eq")}>
            <button className="collapsehdr" onClick={() => setEqCollapsed(c => !c)} aria-expanded={!eqCollapsed}>
              <span className="collapsetitle">Live Risk Budget &amp; Sizing</span>
              <span className="collapsesummary">{`Equity ${usd0(compEquity)} · Budget ${usd0(budget.totalBudget)} · Available ${usd0(budget.available)}`}</span>
              <span className="chev" aria-hidden="true">&#9662;</span>
            </button>
            <div className="equity-grid">
              {/* LEFT: compounding equity */}
              <div className="eq-left">
                <div className="label"><span className="term" data-tip="Return On Total Equity base: the capital your position sizing is built on. Closed profits compound back into this number.">Compounding equity <span className="plain">(ROTE base)</span></span></div>
                <div className="val gold">{usd0(compEquity)}</div>
                <div className="breakdown">
                  Start{" "}
                  {capEditing ? (
                    <input className="capinput" autoFocus value={capDraft} onChange={e => setCapDraft(e.target.value)} onBlur={() => { const v = parseFloat(capDraft.replace(/[^0-9.]/g, "")) || 0; setPortfolioSize(v); setCapEditing(false); }} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} />
                  ) : (
                    <span className="editcap" onClick={() => { setCapDraft(String(+portfolioSize || 0)); setCapEditing(true); }}>
                      <span className="capval">{usd0(+portfolioSize || 0)}</span><span className="pencil">&#9998;</span>
                    </span>
                  )}
                  <span className="op">+ {usd0(compRealizedPL)} realized</span>
                  <span className="op tl">{useSecuredProfit ? `+ ${usd0(securedProfit)} trail-locked` : "trail-locked excluded"}</span>
                </div>
                <div className="tlrow">
                  <div className="tllabel">
                    <span className="term" data-tip="Trail-locked profit is calculated automatically: the sum of (stop − entry) × shares for every position whose stop sits above entry. You only choose whether it counts toward your sizing base.">Include trail-locked profit</span>
                    <small className="gtip">Auto-calculated from your stops · {usd0(securedProfit)} locked right now</small>
                  </div>
                  <div className="seg tlseg">
                    <button className={useSecuredProfit ? "on" : ""} onClick={() => setUseSecuredProfit(true)}>ON &#9679;</button>
                    <button className={!useSecuredProfit ? "on" : ""} onClick={() => setUseSecuredProfit(false)}>OFF</button>
                  </div>
                </div>
              </div>
              {/* INPUTS */}
              <div className="eq-col">
                <div className="ctrl">
                  <div className="label"><span className="term" data-tip="Target ROTE: the % of total equity you're willing to have at risk across ALL open trades at once. Your total risk budget = equity × this %.">Target ROTE <span className="plain">(risk budget %)</span></span></div>
                  <div className="ctrlinput">
                    <input className="numfield" value={targetRote} onChange={e => setTargetRote(e.target.value)} />
                    <span className="suffix">%</span>
                  </div>
                </div>
                <div className="ctrl">
                  <div className="label"><span className="term" data-tip="The most open positions you'll hold at once. Sizing divides your risk budget across this many trades so you don't over-concentrate.">Maximum positions</span></div>
                  <div className="stepper">
                    <button onClick={() => setRNumStocks(n => Math.max(0, (n || 0) - 1))} disabled={(rNumStocks || 0) <= 0} aria-label="decrease">&minus;</button>
                    <span className="stepval">{rNumStocks || 0}</span>
                    <button onClick={() => setRNumStocks(n => (n || 0) + 1)} aria-label="increase">+</button>
                  </div>
                </div>
              </div>
              {/* OUTPUTS */}
              <div className="eq-col">
                <div className="outgrid">
                  <div className="out">
                    <div className="outlabel">Total risk budget</div>
                    <div className="outval gold">{usd0(budget.totalBudget)}</div>
                    <div className="outsub"><span className="g">{pct2(budget.tgtRote * 100)}</span> of <span className="g">{usd0(compEquity)}</span></div>
                  </div>
                  <div className="out">
                    <div className="outlabel">R per trade <span className="plain">(full)</span></div>
                    <div className="outval">{(rNumStocks || 0) > 0 ? usd0(rPerTrade) : "—"}</div>
                    <div className="outsub"><span className="g">{(rNumStocks || 0) > 0 ? pct2(budget.tgtRote * 100 / rNumStocks) : "—"}</span> ROTE each</div>
                  </div>
                  <div className="out">
                    <div className="outlabel">Current ROTE</div>
                    <div className="outval">{pct2(totals.currentRotePct)}</div>
                    <div className="outsub">Target: <span className="g">{pct2(totals.tgtRotePct)}</span> max</div>
                  </div>
                  <div className="out">
                    <div className="outlabel">Available</div>
                    <div className={"outval " + (rawAvail >= 0 ? "green" : "red")}>{usd0(rawAvail)}</div>
                    <div className="outsub"><span className="g">{pct2(budget.availablePct)}</span> ROTE remaining</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RISK ALLOCATION */}
        <div className={"card alloc guide reveal" + gactive("alloc")} onMouseEnter={guideEnter("alloc", "Risk allocation", "A picture of your risk budget — red is risk already in the market, green is what's still free to deploy.", "/audio/allocation.mp3")} onMouseLeave={guideLeave("alloc")}>
          <div className="row">
            <div className="label">Risk allocation</div>
            <div className="spacer"></div>
            <div className="allocnote">{over ? `Over budget by ${usd0(-rawAvail)}` : `${usd0(budget.deployedRisk)} of ${usd0(budget.totalBudget)} budget deployed`}</div>
          </div>
          <div className={"allocbar" + (over ? " over" : "")}>
            <div className="allocfill" style={{ width: allocPct.toFixed(0) + "%" }}></div>
          </div>
          <div className="alloclegend">
            <span className="leg"><span className="legdot risk"></span>At Risk&nbsp;<b>{usd0(budget.deployedRisk)}</b>&nbsp;<span>({budget.atRiskCount})</span></span>
            <span className="leg"><span className="legdot avail"></span>Available&nbsp;<b>{usd0(budget.available)}</b>&nbsp;<span>({budget.totalBudget > 0 ? Math.round(budget.available / budget.totalBudget * 100) : 0}%)</span></span>
            <span className="leg"><span className="legdot free"></span>Risk-Free&nbsp;<b>{budget.freeCount}</b>&nbsp;<span>(freed {usd0(budget.freedRisk)})</span></span>
          </div>
          <div className={"deploy" + (over ? " over" : "")}>
            <div className="deployhead">{over ? <>You are <b>{usd0(-rawAvail)}</b> over your risk budget</> : <>You can deploy <b>{usd0(Math.max(0, rawAvail))}</b> more risk</>}</div>
            <div className="deploysub">
              {over ? "Close a position or tighten a stop before adding new risk — or raise Target ROTE if you mean to risk more."
                : (rNumStocks || 0) > 0 ? <>That's <b>{pct2(budget.availablePct)} ROTE</b> free. Room for <b>{fullTrades} full-R trade{fullTrades === 1 ? "" : "s"}</b> at {usd0(rPerTrade)} each, or <b>{halfTrades} half-R</b> at {usd0(rPerTrade / 2)} each.</>
                  : <>Set your Maximum positions above to see how that splits into per-trade sizing.</>}
            </div>
          </div>
        </div>

        {/* welcome banner */}
        {!expert && !welcomeDismissed && (
          <div className="welcome">
            <span className="dot"></span>
            <div><b>New here?</b> Hover any card and the guide in the corner will explain it — <b>out loud</b>. Mute the voiceover anytime, or switch to <span className="term" data-tip="Pro mode hides all the guidance and voiceover for experienced traders.">Pro</span> (top-right) to turn the whole tutorial off.</div>
            <span className="x" onClick={() => { setWelcomeDismissed(true); try { localStorage.setItem("viv-welcome-x", "1"); } catch {} }}>&times;</span>
          </div>
        )}

        {/* TABLE */}
        <div className="toolbar">
          <h2>Open Positions</h2>
          <div className="spacer"></div>
          <div className="seg" id="viewSeg">
            <button className={!showPro ? "on" : ""} onClick={() => setTableView("simple")}>Simple</button>
            <button className={showPro ? "on" : ""} onClick={() => setTableView("pro")}>Pro &middot; all columns</button>
          </div>
          <button className="btn" onClick={fetchLivePrices} disabled={priceLoading}>{priceLoading ? "Refreshing…" : "Refresh Prices"}</button>
          <button
            className="btn gold"
            onClick={() => onManualSave && onManualSave()}
            disabled={saveStatus === "saving"}
            title={saveStatus === "error" ? (saveErrorMsg || "Save failed — click to retry") : "Save all open positions"}
            style={saveStatus === "saved" ? { background: "rgba(34,197,94,0.18)", borderColor: "rgba(34,197,94,0.4)", color: "#86efac" } : saveStatus === "error" ? { background: "rgba(239,68,68,0.16)", borderColor: "rgba(239,68,68,0.4)", color: "#fca5a5" } : undefined}
          >{saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : saveStatus === "error" ? "Retry save" : "Save"}</button>
          <button className="btn gold" onClick={addAndManage}>+ Add Position</button>
        </div>

        <div className={"card guide" + gactive("pos")} style={{ padding: "8px 6px" }} onMouseEnter={guideEnter("pos", "Open positions", "Every trade you currently hold. The colored status shows which positions are at risk.", "/audio/positions.mp3")} onMouseLeave={guideLeave("pos")}>
          <div className="pos-scroll">
          <table>
            <thead>
              <tr>
                <th><span className="term" data-tip="Where this position sits on risk.&#10;At Risk = stop below entry.&#10;Risk-Free = stop at entry.&#10;Profit Locked = stop above entry.">Status</span></th>
                <th><span className="term" data-tip="The ticker symbol. The dot shows the source: gold = auto-synced from IBKR, grey = entered manually.">Symbol</span></th>
                <th className="pro-only"><span className="term" data-tip="How many shares you currently hold.">Shares</span></th>
                <th className="pro-only"><span className="term" data-tip="Your average entry price per share.">Avg Cost</span></th>
                <th className="pro-only"><span className="term" data-tip="Total broker fees paid on this position so far.">Commission</span></th>
                <th className="pro-only"><span className="term" data-tip="The pattern or reason you took the trade.">Setup</span></th>
                <th><span className="term" data-tip="Total dollars in this position — shares × average cost.">Position size</span></th>
                <th><span className="term" data-tip="Profit banked from partial sells of this position. The bar fills to the percentage of your original shares you've sold (trimmed).">Realized</span></th>
                <th className="pro-only"><span className="term tipright" data-tip="Your current protective stop price.">Stop</span></th>
                <th><span className="term tipright" data-tip="Dollars you'd lose if price falls to your stop from here.">Risk to stop</span></th>
                <th className="pro-only"><span className="term tipright" data-tip="R-multiple — profit/loss in units of your initial risk.">R</span></th>
                <th><span className="term tipright" data-tip="Open profit or loss on this position right now.">P/L</span></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {enriched.filter(p => p.sym || p.id === manageId).map(p => {
                const sc = statusClass(p.riskStatus);
                // Position-sizing health vs target (shown in the Manage panel readout).
                const sizeRatio = targetPosPct > 0 ? p.expPct / targetPosPct : 0;
                const sizeLabel = !targetPosPct ? "—" : sizeRatio > 1.2 ? "Oversized" : sizeRatio < 0.8 ? "Undersized" : "On size";
                const sizeColor = !targetPosPct ? "var(--muted)" : sizeRatio > 1.2 ? "var(--red)" : sizeRatio < 0.8 ? "var(--blue)" : "var(--green)";
                const isOpen = manageId === p.id;
                // Profit Locked → the active stop sits above entry, so show the locked-in profit ($)
                // instead of risk-to-stop (which is negative here). Locked profit = −rtsD = (stop − entry) × shares.
                const rtsTxt = p.riskStatus === "Profit Locked" ? "+" + usd0(Math.abs(p.rtsD)) : p.rtsD <= 0 ? "$0" : usd0(p.rtsD);
                const ibkr = p.source === "ibkr" || p.source === "reconciled";
                return (
                  <React.Fragment key={p.id}>
                    <tr className={"posrow" + (isOpen ? " mg-open" : "")}>
                      <td data-l="Status"><span className={"status " + sc}><span className="d"></span>{p.riskStatus === "—" ? "Risk-Free" : p.riskStatus}</span></td>
                      <td data-l="Symbol"><span className="tick"><span className={"srcdot " + (ibkr ? "ibkr" : "man")}></span>{p.sym}</span></td>
                      <td className="pro-only" data-l="Shares">{p.sharesN}</td>
                      <td className="pro-only" data-l="Avg Cost">${(p.epN || 0).toFixed(2)}</td>
                      <td className="pro-only" data-l="Commission">${(p.commN || 0).toFixed(2)}</td>
                      <td className="pro-only" data-l="Setup"><select value={p.setup || ""} onChange={e => updateField(p.id, "setup", e.target.value)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", borderRadius: 7, color: p.setup ? "var(--text)" : "var(--faint)", fontFamily: font, fontSize: "0.68rem", fontWeight: 600, padding: "4px 8px", outline: "none", cursor: "pointer", maxWidth: 130 }}><option value="">— Setup —</option>{(setupTypes || []).map(s => <option key={s} value={s}>{s}</option>)}</select></td>
                      <td data-l="Position size">{usd0(p.posValue)}</td>
                      <td data-l="Realized">
                        <span className="sizebar" title={p.realizedShares > 0 ? `${p.realizedShares} of ${p.origShares} shares sold (${p.trimPct.toFixed(0)}% trimmed)` : "Nothing sold yet — fully unrealized"}>
                          <span className="track"><span className="fill" style={{ width: (p.realizedShares > 0 ? Math.max(6, Math.min(100, p.trimPct)) : 0) + "%", background: p.realizedPL >= 0 ? "var(--green)" : "var(--red)" }}></span></span>
                          <small>{p.realizedShares > 0
                            ? <><span style={{ color: p.realizedPL >= 0 ? "var(--green)" : "var(--red)", fontWeight: 700 }}>{usdSigned(p.realizedPL)}</span> · {p.trimPct.toFixed(0)}% trimmed</>
                            : <span style={{ color: "var(--faint)" }}>Unrealized</span>}</small>
                        </span>
                      </td>
                      <td className="pro-only" data-l="Stop">{p.stop1 ? "$" + p.stop1.toFixed(2) : "—"}</td>
                      <td data-l="Risk to stop"><span className={"pl " + (p.rtsD > 0 ? "dn" : "up")}>{rtsTxt}</span></td>
                      <td className="pro-only" data-l="R"><span className={"pl " + (p.rMult >= 0 ? "up" : "dn")}>{(p.rMult >= 0 ? "+" : "") + p.rMult.toFixed(1)}R</span></td>
                      <td data-l="P/L"><span className={"pl " + (p.plD >= 0 ? "up" : "dn")}>{usdSigned(p.plD)}<span className="pct">{pctSigned(p.plPct)}</span></span></td>
                      <td className="mgcell" data-l="">
                        <button className="mgbtn" onClick={() => openManage(p)}>Manage</button>
                        <button className="mgbtn sell" title="Sell or close this position" onClick={() => openSell(p)}>Sell</button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="mgrow"><td colSpan={13}>
                        <div className="mgpanel">
                          <div className="mghead">
                            <span className={"status " + sc}><span className="d"></span>{p.riskStatus === "—" ? "Risk-Free" : p.riskStatus}</span>
                            <span className="mgtick">{p.sym}</span>
                            <span className="mgls">{p.tradeType || "Long"}</span>
                            <span className="mgmeta"><b>{p.sharesN}</b> sh @ <b>${(p.epN || 0).toFixed(2)}</b></span>
                            <span className="mgmeta">Position <b>{usd0(p.posValue)}</b></span>
                            {p.setup && <span className="mgmeta">Setup <b>{p.setup}</b></span>}
                            <button className="mgclose" aria-label="Close" onClick={() => { setManageId(null); setSellOpen(false); }}>&times;</button>
                          </div>
                          <div className="mggrid">
                            <div className="mgcol">
                              <div className="mgcoltitle">Position &amp; stops</div>
                              <div className="mgfield"><label><span className="term" data-tip="The ticker symbol for this position.">Ticker</span></label><input className="mgin" defaultValue={p.sym || ""} onBlur={e => updateField(p.id, "sym", e.target.value.toUpperCase())} placeholder="AAPL" /></div>
                              <div className="mgfield"><label><span className="term" data-tip="How many shares you hold.">Shares</span></label><input className="mgin" defaultValue={p.shares || ""} onBlur={e => updateField(p.id, "shares", e.target.value)} placeholder="0" /></div>
                              <div className="mgfield"><label><span className="term" data-tip="Your average entry (cost) price per share.">Avg cost</span></label><input className="mgin" defaultValue={p.ep || ""} onBlur={e => updateField(p.id, "ep", e.target.value)} placeholder="0.00" /></div>
                              <div className="mgfield"><label><span className="term" data-tip="The date you entered (M/D/YY).">Entry date</span></label><input className="mgin" defaultValue={p.entry || ""} onBlur={e => updateField(p.id, "entry", e.target.value)} placeholder="M/D/YY" /></div>
                              <div className="mgfield"><label><span className="term" data-tip="Whether this is a Long (betting price rises) or Short (betting price falls) position. Drives the direction of your P/L and risk.">Direction</span></label><select className="mgin" value={p.tradeType || "Long"} onChange={e => updateField(p.id, "tradeType", e.target.value)} style={{ cursor: "pointer", textAlign: "left", fontWeight: 600 }}><option value="Long">Long</option><option value="Short">Short</option></select></div>
                              <div className="mgfield"><label><span className="term" data-tip="The pattern or strategy for this trade — choose from your setup types.">Setup</span></label><select className="mgin" value={p.setup || ""} onChange={e => updateField(p.id, "setup", e.target.value)} style={{ cursor: "pointer", textAlign: "left", fontWeight: 600 }}><option value="">— none —</option>{(setupTypes || []).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                              <div className="mgfield"><label><span className="term" data-tip="The latest market price. Drives your live P/L and how far you are from your stop.">Current price</span></label><input className="mgin gold" defaultValue={p.cp || ""} onBlur={e => updateField(p.id, "cp", e.target.value)} /></div>
                              <div className="mgfield"><label><span className="term" data-tip="Your first protective stop, set when you entered.">Original stop</span></label><input className="mgin" defaultValue={p.stop || ""} onBlur={e => updateField(p.id, "stop", e.target.value)} /></div>
                              <div className="mgfield"><label><span className="term" data-tip="A raised stop after the trade moved your way.">2nd stop</span></label><input className="mgin" defaultValue={p.stop2 || ""} onBlur={e => updateField(p.id, "stop2", e.target.value)} /></div>
                              <div className="mgfield"><label><span className="term" data-tip="A stop that follows price upward to lock in more profit.">Trailing stop</span></label><input className="mgin" defaultValue={p.trailStop || ""} onBlur={e => updateField(p.id, "trailStop", e.target.value)} /></div>
                              <div className="mgfield"><label><span className="term" data-tip="Total broker fees paid on this position. Subtracted from your net P/L.">Commission</span></label><input className="mgin" defaultValue={p.comm || ""} onBlur={e => updateField(p.id, "comm", e.target.value)} placeholder="0.00" /></div>
                              <button className="btn gold mgsave" onClick={() => onManualSave && onManualSave()}>Save stops</button>
                            </div>
                            <div className="mgcol">
                              <div className="mgcoltitle">Activity today</div>
                              <div className="mgactlist">Logging happens automatically — IBKR sync fills the journal overnight.</div>
                              <div className="mgnote">Calculation only — editing stops here doesn't create a trade. Use Sell / Close below to book an exit to your journal.</div>
                            </div>
                            <div className="mgcol">
                              <div className="mgcoltitle">Risk &amp; P/L</div>
                              <div className="mgreadout">
                                <div className="mgr"><span className="term tipright" data-tip="Dollars you'd lose if price hits your stop from here.">Risk to stop</span><b className={p.rtsD > 0 ? "red" : "green"}>{p.rtsD <= 0 ? "Locked" : usd0(p.rtsD)}</b></div>
                                <div className="mgr"><span className="term tipright" data-tip="This position's risk as a % of your whole account.">Risk on equity</span><b>{pct2(p.currentRotePct)}</b></div>
                                <div className="mgr"><span className="term tipright" data-tip="Whether this position matches your target size. Undersized is below your target, Oversized is above.">Size health</span><b style={{ color: sizeColor }}>{sizeLabel}</b></div>
                                <div className="mgr"><span className="term tipright" data-tip="Profit or loss in units of your initial risk.">R-multiple</span><b className={p.rMult >= 0 ? "green" : "red"}>{(p.rMult >= 0 ? "+" : "") + p.rMult.toFixed(1)}R</b></div>
                                <div className="mgr"><span className="term tipright" data-tip="Profit secured because your stop sits above entry.">Locked profit</span><b className={p.rLockedProfit > 0 ? "green" : ""}>{usd0(p.rLockedProfit * p.sharesN)}</b></div>
                                <div className="mgr"><span className="term tipright" data-tip="Shares to sell at the current price to recover your full cost basis.">SBE · break-even</span><b>{p.sbe > 0 ? p.sbe + " sh" : "—"}</b></div>
                                <div className="mgr"><span className="term tipright" data-tip="Profit already banked from earlier partial sells.">Realized</span><b className={p.realizedPL >= 0 ? "green" : "red"}>{usdSigned(p.realizedPL)}</b></div>
                                <div className="mgr"><span className="term tipright" data-tip="Paper profit/loss still open.">Unrealized</span><b className={p.plD >= 0 ? "green" : "red"}>{usdSigned(p.plD)}</b></div>
                                <div className="mgr"><span className="term tipright" data-tip="Broker fees paid on this position so far.">Commission</span><b>${(p.commN || 0).toFixed(2)}</b></div>
                              </div>
                            </div>
                          </div>

                          <div className="mgfoot">
                            <button className={"btn mgsell" + (sellOpen ? " open" : "")} onClick={() => sellOpen ? setSellOpen(false) : openSell(p)}>Sell / Close position</button>
                            <span className="mgfoot-hint">Logs a closed trade to your journal and reduces (or closes) this position.</span>
                            <div className="spacer"></div>
                            <button className="btn" style={{ color: "var(--red)", borderColor: "rgba(239,68,68,0.4)" }} title="Delete this position entirely (no journal entry). Use for entries keyed in by mistake." onClick={() => { if (removeRow(p.id)) { setManageId(null); setSellOpen(false); setTimeout(() => onManualSaveRef.current && onManualSaveRef.current(), 50); } }}>Delete position</button>
                          </div>
                          {sellOpen && sellPos && sellPos.id === p.id && (
                            <div className="mgsellform">
                              <div className="mgsellgrid">
                                <div className="mgsellcol">
                                  <div className="mgcoltitle">Sell details</div>
                                  <div className="mgfield"><label><span className="term" data-tip="How many shares to sell now. Fewer than your total = partial sell; all = full close.">Shares to sell</span></label><input className="mgin" value={sellQty} onChange={e => setSellQty(e.target.value)} /></div>
                                  <div className="quickrow">
                                    {[25, 50, 75, 100].map(pc => <button key={pc} className="chipbtn" onClick={() => setSellQty(String(Math.round(sShares * pc / 100)))}>{pc === 100 ? "All" : pc + "%"}</button>)}
                                    <span className="mgof">of {sShares} shares</span>
                                  </div>
                                  <div className="mgfield"><label><span className="term" data-tip="The price you're selling at.">Exit price</span></label><input className="mgin gold" value={sellPrice} onChange={e => setSellPrice(e.target.value)} /></div>
                                  <div className="mgfield"><label><span className="term" data-tip="Broker fee for this sale. Leave blank to estimate from the position's commission.">Commission</span></label><input className="mgin" value={sellComm} onChange={e => setSellComm(e.target.value)} placeholder="0.00" /></div>
                                  <div className="mgfield"><label><span className="term" data-tip="Why you're selling — saved to your journal.">Exit reason</span></label>
                                    <select className="mgsel" value={sellReason} onChange={e => setSellReason(e.target.value)}>{(exitReasons || []).map(r => <option key={r}>{r}</option>)}</select>
                                  </div>
                                  <label className="mgcheck"><input type="checkbox" checked={sellAddJournal} onChange={e => setSellAddJournal(e.target.checked)} /> Add to journal</label>
                                </div>
                                <div className="mgsellcol">
                                  <div className="mgcoltitle">Trade review <span className="mgoptional">(optional)</span></div>
                                  <div className="mgjournal">
                                    <textarea className="mgta" value={sellNotesStruct.right} onChange={e => setSellNotesStruct(s => ({ ...s, right: e.target.value }))} placeholder="What went right?"></textarea>
                                    <textarea className="mgta" value={sellNotesStruct.wrong} onChange={e => setSellNotesStruct(s => ({ ...s, wrong: e.target.value }))} placeholder="What went wrong?"></textarea>
                                    <textarea className="mgta" value={sellNotesStruct.lessons} onChange={e => setSellNotesStruct(s => ({ ...s, lessons: e.target.value }))} placeholder="What I learned"></textarea>
                                    <input className="mgin wide" value={sellChartUrl} onChange={e => setSellChartUrl(e.target.value)} placeholder="tradingview.com/… (chart link)" />
                                  </div>
                                </div>
                                <div className="mgsellcol">
                                  <div className="mgcoltitle">This sale</div>
                                  <div className="mgreadout">
                                    <div className="mgr"><span className="term tipright" data-tip="What share of this position you're selling.">% of position</span><b>{sSoldPct.toFixed(0)}%</b></div>
                                    <div className="mgr"><span className="term tipright" data-tip="Shares left open after this sale.">Shares remaining</span><b>{sRemain}{sRemain <= 0 ? " — closes position" : ""}</b></div>
                                    <div className="mgr"><span className="term tipright" data-tip="Cash profit/loss on the shares sold.">Realized P/L</span><b className={sPl >= 0 ? "green" : "red"}>{usdSigned(sPl)}</b></div>
                                    <div className="mgr"><span className="term tipright" data-tip="The percentage gain or loss on the shares you're selling.">Return</span><b className={sPlPct >= 0 ? "green" : "red"}>{pctSigned(sPlPct)}</b></div>
                                    <div className="mgr"><span className="term tipright" data-tip="The realized profit measured in units of your initial risk (R).">Realized R</span><b className={sR === null ? "" : sR >= 0 ? "green" : "red"}>{sR === null ? "—" : (sR >= 0 ? "+" : "") + sR.toFixed(1) + "R"}</b></div>
                                  </div>
                                  <div className="mgsellactions">
                                    <button className="btn gold" onClick={confirmSell}>{sQty >= sShares ? "Close position" : sQty > 0 ? "Sell " + sQty + " shares" : "Sell"}</button>
                                    <button className="btn" onClick={() => { setSellOpen(false); cancelSell(); }}>Cancel</button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
              {enriched.filter(p => p.sym).length === 0 && (
                <tr><td colSpan={13} style={{ padding: "32px 14px", textAlign: "center", color: "var(--muted)" }}>No open positions yet. Click <b style={{ color: "var(--goldBright)" }}>+ Add Position</b> to start.</td></tr>
              )}
            </tbody>
          </table>
          </div>
          <button className="addrow" type="button" onClick={addAndManage}>+ Add Position</button>
        </div>
        <div className="pro-note">Showing the columns that drive a decision. Switch to <b>Pro</b> above for the full blotter (shares, avg cost, stops, commission, R-multiple…).</div>

        {/* Guided assistant */}
        <div className={"guidepanel" + (speaking ? " speaking" : "")} aria-live="polite">
          <div className="gp-head">
            <span className="gp-dot"></span>
            <span className="gp-title">{guide ? guide.title : "Guided walkthrough"}</span>
            <button className="gp-mute" title={guideMuted ? "Unmute voiceover" : "Mute voiceover"} aria-label="Toggle voiceover" onClick={() => setGuideMuted(m => { const nm = !m; if (nm) { try { audioRef.current && audioRef.current.pause(); } catch {} } return nm; })}>
              {guideMuted
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></svg>
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a9 9 0 0 1 0 14" /></svg>}
            </button>
          </div>
          <div className="gp-body">{guide ? guide.body : "Hover any card and I'll explain it — out loud. Switch to Pro (top-right) to turn this off."}</div>
        </div>

      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// ─── SETTINGS PAGE ───
// ═══════════════════════════════════════
const SET_CSS = `:root{--bg:#08080e; --bg2:#0c0c14; --white:#ffffff;
    --text:rgba(255,255,255,0.92); --muted:rgba(255,255,255,0.70); --faint:rgba(255,255,255,0.45);
    --gold:#c9982a; --goldBright:#f0c050; --goldMid:#b8820a; --goldDeep:#7a4f00;
    --goldDim:rgba(201,152,42,0.15); --borderGold:rgba(201,152,42,0.22);
    --glass:rgba(255,255,255,0.042); --border:rgba(255,255,255,0.09);
    --green:#22c55e; --red:#ef4444; --blue:#3b82f6;
    --font:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,sans-serif;}
.vs *{box-sizing:border-box;margin:0;padding:0}
.vs html{font-size:16px}
.vs{background:radial-gradient(1200px 700px at 70% -10%, rgba(201,152,42,0.06), transparent 60%), var(--bg);
    color:var(--text); font-family:var(--font); line-height:1.58; -webkit-font-smoothing:antialiased; min-height:100vh}
.vs .shell{width:100%; max-width:1240px; margin:0 auto; padding:22px clamp(18px,2.4vw,40px) 90px}
@media(min-width:1500px){
.vs .shell{max-width:1400px} }
@media(min-width:2000px){
.vs .shell{max-width:1680px} }
.vs .card{position:relative; background:var(--glass); border:1px solid var(--border); border-radius:20px;
    backdrop-filter:blur(28px) saturate(160%); -webkit-backdrop-filter:blur(28px) saturate(160%); padding:22px 24px; overflow:hidden; margin-top:18px}
.vs .card::before{content:''; position:absolute; inset:0; pointer-events:none; background:linear-gradient(135deg, rgba(255,255,255,0.05), transparent 55%)}
.vs .cardtitle{font-size:1.02rem; font-weight:800; color:var(--white); letter-spacing:-0.02em}
.vs .carddesc{font-size:0.8rem; color:var(--muted); margin-top:4px; line-height:1.5; max-width:640px}
.vs.expert .carddesc{display:none}
.vs .eyebrow{font-size:0.6rem; font-weight:700; letter-spacing:0.16em; text-transform:uppercase; color:var(--gold); margin-bottom:5px}
.vs .h1{font-size:clamp(1.55rem,3vw,2.05rem); font-weight:800; letter-spacing:-0.04em; color:var(--white)}
.vs .goldname{color:var(--goldBright)}
.vs .sub{font-size:0.82rem; color:var(--muted); max-width:640px; margin-top:6px}
.vs .reveal .h1{opacity:0; transform:translateY(14px)}
.vs .reveal .sub{opacity:0}
.vs .reveal.in-view .h1{animation:hRise 0.42s cubic-bezier(0.22,1,0.36,1) both}
.vs .reveal.in-view .sub{animation:hFade 0.48s ease-out 0.2s both}
@keyframes hRise{from{opacity:0; transform:translateY(14px)}to{opacity:1; transform:translateY(0)}}
@keyframes hFade{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion: reduce){
.vs .reveal .h1,.vs .reveal .sub{animation:none !important; opacity:1; transform:none}
  }
.vs .label{font-size:0.62rem; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:var(--muted)}
.vs .row{display:flex; align-items:center; gap:14px; flex-wrap:wrap}
.vs .spacer{flex:1}
.vs .navbar{display:flex; align-items:center; gap:16px; margin-bottom:26px; flex-wrap:wrap}
.vs .brand{display:flex; align-items:center; gap:9px; font-weight:800; color:var(--white); font-size:0.95rem}
.vs .brand .vmark{width:24px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,var(--goldMid),var(--goldBright)); color:#0a0a0a; font-weight:800; font-size:0.8rem}
.vs .tabs{display:inline-flex; gap:4px; background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:980px; padding:4px; flex-wrap:wrap}
.vs .tabs a{text-decoration:none; color:var(--muted); font-size:0.78rem; font-weight:700; padding:7px 16px; border-radius:980px}
.vs .tabs a.on{background:var(--goldDim); color:var(--goldBright)}
.vs .tabs a:hover:not(.on){color:var(--text)}
.vs .term{border-bottom:1px dotted var(--borderGold); cursor:help; position:relative}
.vs .term:hover::after{content:attr(data-tip); position:absolute; left:0; top:150%; width:250px; background:#11111b;
    border:1px solid var(--borderGold); border-radius:12px; padding:10px 12px; font-size:0.72rem; font-weight:400;
    letter-spacing:0; text-transform:none; color:var(--text); z-index:60; box-shadow:0 14px 40px rgba(0,0,0,0.55); line-height:1.45; white-space:pre-line}
.vs .term.tipright:hover::after{left:auto; right:0}
.vs.expert .term{border-bottom:none; cursor:default}
.vs.expert .term:hover::after{content:none}
.vs .seg{display:inline-flex; border:1px solid var(--border); border-radius:980px; padding:3px; gap:2px; background:rgba(255,255,255,0.02)}
.vs .seg button{border:none; background:transparent; color:var(--muted); cursor:pointer; font-family:var(--font); font-size:0.74rem;
    font-weight:700; padding:7px 16px; border-radius:980px; transition:all .15s}
.vs .seg button.on{background:var(--goldDim); color:var(--goldBright)}
.vs .btn{border:1px solid var(--border); background:rgba(255,255,255,0.03); color:var(--text); font-family:var(--font);
    font-size:0.76rem; font-weight:700; padding:9px 16px; border-radius:980px; cursor:pointer; transition:all .15s}
.vs .btn:hover{border-color:var(--borderGold)}
.vs .btn.gold{background:var(--goldDim); color:var(--goldBright); border-color:var(--borderGold)}
.vs .btn.green{background:rgba(34,197,94,0.12); color:#86efac; border-color:rgba(34,197,94,0.3)}
.vs .btn.red{background:rgba(239,68,68,0.12); color:#fda4a4; border-color:rgba(239,68,68,0.3)}
.vs .btn.ok{background:rgba(34,197,94,0.2)!important; color:#86efac!important; border-color:rgba(34,197,94,0.4)!important}
.vs .grid2{display:grid; grid-template-columns:1fr 1fr; gap:16px}
.vs .field{display:flex; flex-direction:column; gap:6px}
.vs .field label{font-size:0.62rem; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; color:var(--muted)}
.vs .in{background:rgba(255,255,255,0.05); border:1px solid var(--border); border-radius:10px; color:var(--text);
    font-family:var(--font); font-size:0.92rem; font-weight:600; padding:10px 12px; outline:none; width:100%}
.vs .in:focus{border-color:var(--gold)}
.vs .in:disabled{color:var(--faint); cursor:not-allowed}
.vs .field .hint{font-size:0.7rem; color:var(--faint); line-height:1.4}
.vs.expert .field .hint{display:none}
.vs .prefrow{display:flex; align-items:flex-start; justify-content:space-between; gap:16px; padding:14px 0; border-bottom:1px solid rgba(255,255,255,0.06); flex-wrap:wrap}
.vs .prefrow:last-child{border-bottom:none}
.vs .prefrow .pl{max-width:430px}
.vs .prefrow .pl .t{font-size:0.86rem; font-weight:700; color:var(--white)}
.vs .prefrow .pl .d{font-size:0.76rem; color:var(--muted); margin-top:2px; line-height:1.45}
.vs.expert .prefrow .pl .d{display:none}
.vs .alert{display:flex; gap:9px; align-items:flex-start; margin-top:14px; border-radius:12px; padding:11px 14px; font-size:0.78rem; line-height:1.45}
.vs .alert svg{width:15px;height:15px;flex:none;margin-top:1px}
.vs .alert.warn{background:rgba(239,68,68,0.10); border:1px solid rgba(239,68,68,0.3); color:#fda4a4}
.vs .alert.caution{background:rgba(201,152,42,0.12); border:1px solid var(--borderGold); color:var(--goldBright)}
.vs .alert.ok{background:rgba(34,197,94,0.10); border:1px solid rgba(34,197,94,0.3); color:#86efac}
.vs .conn{display:inline-flex; align-items:center; gap:6px; font-size:0.68rem; font-weight:700; padding:4px 11px; border-radius:980px}
.vs .conn.yes{background:rgba(34,197,94,0.12); color:#86efac}
.vs .conn.no{background:rgba(255,255,255,0.06); color:var(--muted)}
.vs .conn .d{width:6px;height:6px;border-radius:50%;background:currentColor}
.vs .welcome{display:flex; gap:14px; align-items:flex-start; margin-top:18px; background:var(--goldDim);
    border:1px solid var(--borderGold); border-radius:16px; padding:14px 18px}
.vs .welcome .wd{width:8px;height:8px;border-radius:50%;background:var(--goldBright);box-shadow:0 0 12px var(--goldBright);margin-top:6px;flex:none}
.vs .welcome b{color:var(--white)}
.vs .welcome .x{margin-left:auto; color:var(--faint); cursor:pointer; font-size:1.1rem; line-height:1}
.vs.expert .welcome{display:none}
.vs.expert .tourwrap{display:none}
.vs .tour{position:relative; border:1px solid var(--borderGold); border-radius:16px; overflow:hidden; background:#0a0a12; aspect-ratio:16/6; min-height:200px; margin-top:14px}
.vs .tourbg{position:absolute; inset:0; background:radial-gradient(560px 280px at 50% -10%, rgba(201,152,42,0.14), transparent 70%)}
.vs .tourstage{position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:26px 36px 52px; gap:10px}
.vs .tourchip{font-size:0.58rem; font-weight:800; letter-spacing:0.13em; text-transform:uppercase; color:var(--gold)}
.vs .tourtitle{font-size:clamp(1.1rem,2.6vw,1.5rem); font-weight:800; letter-spacing:-0.03em; color:var(--white)}
.vs .tourcap{font-size:0.86rem; color:var(--muted); max-width:520px; line-height:1.5}
.vs .tourdots{display:flex; gap:6px; margin-top:4px}
.vs .tourdots i{width:7px; height:7px; border-radius:50%; background:rgba(255,255,255,0.18); transition:all .25s}
.vs .tourdots i.on{background:var(--goldBright); width:20px; border-radius:5px}
.vs .tourposter{position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px;
    background:rgba(8,8,14,0.55); backdrop-filter:blur(2px); cursor:pointer; z-index:3}
.vs .tourposter.hidden{display:none}
.vs .playbig{width:64px; height:64px; border-radius:50%; background:linear-gradient(135deg,var(--goldBright),var(--goldMid));
    display:flex; align-items:center; justify-content:center; box-shadow:0 12px 40px rgba(201,152,42,0.4); transition:transform .15s}
.vs .tourposter:hover .playbig{transform:scale(1.07)}
.vs .playbig svg{width:26px; height:26px; color:#0a0a0a; margin-left:3px}
.vs .postertitle{font-size:0.98rem; font-weight:800; color:var(--white)}
.vs .postersub{font-size:0.76rem; color:var(--muted)}
.vs .tourbar{position:absolute; left:0; right:0; bottom:0; display:flex; align-items:center; gap:11px; padding:11px 15px;
    background:linear-gradient(0deg, rgba(8,8,14,0.92), transparent); z-index:4}
.vs .tourbtn{background:rgba(255,255,255,0.1); border:none; width:32px; height:32px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--white); flex:none}
.vs .tourbtn:hover{background:rgba(255,255,255,0.18)}
.vs .tourbtn svg{width:14px; height:14px}
.vs .tourprog{flex:1; height:5px; background:rgba(255,255,255,0.14); border-radius:980px; overflow:hidden}
.vs .tourprog .fill{height:100%; width:0%; background:linear-gradient(90deg,var(--goldMid),var(--goldBright)); transition:width .2s linear}
.vs .tourtime{font-size:0.66rem; color:var(--muted); flex:none; min-width:32px; text-align:right}
.vs .expander{margin-top:18px; border-top:1px solid var(--border); padding-top:15px}
.vs .exhead{display:flex; align-items:center; gap:8px; cursor:pointer; color:var(--goldBright); font-weight:700; font-size:0.85rem}
.vs .exhead .chev{margin-left:6px; transition:transform .2s}
.vs .exhead.open .chev{transform:rotate(180deg)}
.vs .exbody{display:none; margin-top:14px}
.vs .exbody.open{display:block}
.vs .steps{display:flex; flex-direction:column; gap:11px}
.vs .step{border-left:2px solid var(--borderGold); padding:1px 0 1px 14px}
.vs .step .sn{font-size:0.58rem; font-weight:800; color:var(--gold); text-transform:uppercase; letter-spacing:0.08em}
.vs .step b{display:block; color:var(--white); font-size:0.84rem; margin-top:2px}
.vs .step p{font-size:0.78rem; color:var(--muted); margin-top:3px; line-height:1.5}
.vs .step code{background:rgba(255,255,255,0.07); padding:1px 6px; border-radius:5px; font-size:0.85em; color:var(--goldBright)}
.vs .chips{display:flex; flex-wrap:wrap; gap:7px; margin-top:12px}
.vs .chip{display:inline-flex; align-items:center; gap:5px; font-size:0.72rem; font-weight:600; color:var(--muted);
    background:rgba(255,255,255,0.05); border:1px solid var(--border); border-radius:8px; padding:4px 10px}
.vs .ownerzone{border:1px solid rgba(239,68,68,0.3); border-radius:22px; padding:6px; margin-top:30px; background:rgba(239,68,68,0.035)}
.vs .ownerhead{display:flex; align-items:center; gap:12px; padding:14px 18px 8px; flex-wrap:wrap}
.vs .ownerbadge{font-size:0.58rem; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:#fda4a4; background:rgba(239,68,68,0.14); padding:4px 11px; border-radius:980px}
.vs .ownerzone .card{margin:12px}
.vs .codeshow{font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:1.35rem; color:var(--goldBright); letter-spacing:0.08em; font-weight:700}
.vs .memrow{display:flex; align-items:center; gap:10px; padding:10px 2px; border-bottom:1px solid rgba(255,255,255,0.05); font-size:0.82rem}
.vs .memrow:last-child{border-bottom:none}
.vs .memrow .mn{font-weight:700; color:var(--white)}
.vs .memrow .me{color:var(--muted); font-size:0.74rem}
.vs .memrow .adm{font-size:0.58rem; font-weight:700; color:var(--goldBright); background:var(--goldDim); padding:2px 8px; border-radius:980px}
.vs .memrow .jd{margin-left:auto; color:var(--faint); font-size:0.72rem}
.vs.member .ownerzone .card{display:none}
.vs .membernote{display:none; margin:12px; padding:16px 18px; border:1px dashed var(--border); border-radius:14px; color:var(--muted); font-size:0.82rem}
.vs.member .membernote{display:block}
.vs .guidepanel{position:fixed; right:24px; bottom:24px; width:330px; max-width:calc(100vw - 40px); z-index:200;
    background:#11111b; border:1px solid var(--borderGold); border-radius:16px; padding:15px 17px; box-shadow:0 22px 60px rgba(0,0,0,0.6); display:none}
.vs:not(.expert) .guidepanel{display:block}
.vs .guidepanel.speaking{border-color:var(--goldBright); box-shadow:0 0 0 1px var(--goldBright), 0 22px 60px rgba(0,0,0,0.6)}
.vs .gp-head{display:flex; align-items:center; gap:9px; margin-bottom:7px}
.vs .gp-dot{width:8px; height:8px; border-radius:50%; background:var(--goldBright); flex:none}
.vs .guidepanel.speaking .gp-dot{animation:gppulse 1s ease-in-out infinite}
@keyframes gppulse{0%,100%{opacity:1; transform:scale(1)}50%{opacity:0.35; transform:scale(1.6)}}
.vs .gp-title{font-size:0.82rem; font-weight:800; color:var(--goldBright); flex:1}
.vs .gp-mute{background:transparent; border:none; cursor:pointer; color:var(--muted); padding:3px; line-height:0; display:flex}
.vs .gp-mute:hover{color:var(--text)}
.vs .gp-mute svg{width:18px; height:18px}
.vs .gp-body{font-size:0.78rem; color:var(--text); line-height:1.55}
.vs .gp-body b{color:var(--goldBright)}
.vs:not(.expert) .guide{transition:box-shadow .2s; border-radius:20px}
.vs:not(.expert) .guide.guide-active{box-shadow:0 0 0 1px var(--borderGold), 0 0 50px rgba(201,152,42,0.13)}
.vs .toast{position:fixed; left:50%; bottom:28px; transform:translateX(-50%) translateY(20px); z-index:400; background:#11111b;
    border:1px solid var(--borderGold); border-radius:12px; padding:12px 18px; font-size:0.8rem; color:var(--text);
    box-shadow:0 14px 40px rgba(0,0,0,0.6); opacity:0; pointer-events:none; transition:opacity .2s, transform .2s; max-width:90vw}
.vs .toast.show{opacity:1; transform:translateX(-50%) translateY(0)}
@media(max-width:680px){
.vs .grid2{grid-template-columns:1fr}
.vs .navbar{flex-wrap:wrap} }
@media(max-width:600px){
.vs .navbar{flex-wrap:wrap; gap:10px}
.vs .navbar .spacer{display:none}
.vs .tabs{overflow-x:auto; max-width:100%; scrollbar-width:none}
.vs .tabs::-webkit-scrollbar{display:none}
.vs .tabs a{white-space:nowrap}
.vs .tour{aspect-ratio:auto; height:280px; min-height:0}
.vs .tourstage{padding:18px 16px 50px}
.vs .tourtitle{font-size:1.05rem}
.vs .tourcap{font-size:0.8rem}
.vs .card{padding:18px 16px}
.vs .prefrow{flex-direction:column; align-items:flex-start; gap:10px}
.vs .ownerhead{flex-direction:column; align-items:flex-start}
.vs .codeshow{font-size:1.15rem}
.vs .memrow{flex-wrap:wrap}
.vs .memrow .jd{margin-left:0; width:100%}
  }`;

function SettingsPage({ setPage, onLogout, setupTypes, setSetupTypes, tags, setTags, exitReasons, setExitReasons, fontSize, setFontSize, userEmail, displayName, onDisplayNameChange, session, onIbkrSync, onRunIntegrity, integrityReport, integrityRunning, intradayFeatureEnabled, onToggleIntradayFeature, intradayColumnAvailable, isMobile }) {
  const isAdmin = userEmail && userEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const [ibkrTutOpen, setIbkrTutOpen] = useState(false);
  const [ibkrQueryId, setIbkrQueryId] = useState("");
  const [ibkrToken, setIbkrToken] = useState("");
  const [ibkrConnStatus, setIbkrConnStatus] = useState("");
  const [ibkrLoaded, setIbkrLoaded] = useState(false);
  const [ibkrIgnoreText, setIbkrIgnoreText] = useState("");
  const [ibkrIgnoreStatus, setIbkrIgnoreStatus] = useState("");
  const [newSetup, setNewSetup] = useState("");
  const [newTag, setNewTag] = useState("");
  const [newReason, setNewReason] = useState("");
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [accessCodes, setAccessCodes] = useState([]);
  const [newCode, setNewCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [allMembers, setAllMembers] = useState([]);
  const [backupStatus, setBackupStatus] = useState("");

  // Load this member's own IBKR connection (their RLS-protected settings)
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    supabase.from("user_settings").select("setting_key,setting_value").eq("user_id", uid).in("setting_key", ["ibkr_token", "ibkr_query_id", "ibkr_ignore_tickers"]).then(({ data }) => {
      (data || []).forEach(s => {
        if (s.setting_key === "ibkr_token") setIbkrToken(s.setting_value == null ? "" : String(s.setting_value));
        if (s.setting_key === "ibkr_query_id") setIbkrQueryId(s.setting_value == null ? "" : String(s.setting_value));
        if (s.setting_key === "ibkr_ignore_tickers") setIbkrIgnoreText(s.setting_value == null ? "" : String(s.setting_value));
      });
      setIbkrLoaded(true);
    });
  }, [session]);

  const saveIbkrConn = async () => {
    const uid = session?.user?.id;
    if (!uid) return;
    setIbkrConnStatus("saving");
    const { error } = await supabase.from("user_settings").upsert([
      { user_id: uid, setting_key: "ibkr_query_id", setting_value: ibkrQueryId.trim(), updated_at: new Date().toISOString() },
      { user_id: uid, setting_key: "ibkr_token", setting_value: ibkrToken.trim(), updated_at: new Date().toISOString() },
    ], { onConflict: "user_id,setting_key" });
    setIbkrConnStatus(error ? "error" : "saved");
    setTimeout(() => setIbkrConnStatus(""), 2500);
  };
  const ibkrConnected = ibkrToken.trim() && ibkrQueryId.trim();

  const saveIbkrIgnore = async () => {
    const uid = session?.user?.id;
    if (!uid) return;
    // Normalize: uppercase, trim, dedupe, keep canonical form for display + storage.
    const clean = Array.from(new Set(
      ibkrIgnoreText.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
    )).join(", ");
    setIbkrIgnoreText(clean);
    setIbkrIgnoreStatus("saving");
    const { error } = await supabase.from("user_settings").upsert([
      { user_id: uid, setting_key: "ibkr_ignore_tickers", setting_value: clean, updated_at: new Date().toISOString() },
    ], { onConflict: "user_id,setting_key" });
    setIbkrIgnoreStatus(error ? "error" : "saved");
    setTimeout(() => setIbkrIgnoreStatus(""), 2500);
  };
  const ibkrIgnoreList = ibkrIgnoreText.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);

  // Load access codes and members for admin
  useEffect(() => {
    if (!isAdmin) return;
    const loadAdmin = async () => {
      const { data: codes } = await supabase.from("access_codes").select("*").order("created_at", { ascending: false });
      if (codes) setAccessCodes(codes);
      // Admin can read all profiles via service-level or we use a direct query
      const { data: members } = await supabase.from("profiles").select("id, email, display_name, created_at, is_admin");
      if (members) setAllMembers(members);
    };
    loadAdmin();
  }, [isAdmin]);

  const activeCode = accessCodes.find(c => c.is_active);

  const handleCreateCode = async () => {
    const code = newCode.trim().toUpperCase();
    if (!code) return;
    setCodeLoading(true);
    // Deactivate all existing codes
    await supabase.from("access_codes").update({ is_active: false }).eq("is_active", true);
    // Insert new active code
    const { data } = await supabase.from("access_codes").insert({ code, is_active: true }).select();
    if (data) setAccessCodes(prev => [data[0], ...prev.map(c => ({ ...c, is_active: false }))]);
    setNewCode("");
    setCodeLoading(false);
  };

  const handleDeactivateCode = async (id) => {
    await supabase.from("access_codes").update({ is_active: false }).eq("id", id);
    setAccessCodes(prev => prev.map(c => c.id === id ? { ...c, is_active: false } : c));
  };

  const addItem = (list, setter, val, clear) => {
    const v = val.trim();
    if (v && !list.includes(v)) { setter([...list, v]); clear(""); }
  };
  const removeItem = (list, setter, val) => { setter(list.filter(x => x !== val)); };

  const renderListManager = (title, description, items, onAdd, onRemove, newVal, setNewVal, placeholder) => (
    <GlassCard style={{ padding: "24px 28px", marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: "0.84rem", color: C.white, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: "0.70rem", color: C.muted, marginBottom: 16 }}>{description}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {items.map(item => (
          <span key={item} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 980, background: C.goldDim, border: `1px solid ${C.borderGold}`, color: C.gold, fontSize: "0.72rem", fontWeight: 600 }}>
            {item}
            <span onClick={() => onRemove(item)} style={{ cursor: "pointer", opacity: 0.5, fontSize: "0.82rem", lineHeight: 1 }}>&times;</span>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input type="text" placeholder={placeholder} value={newVal} onChange={e => setNewVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") onAdd(); }}
          style={{ flex: 1, maxWidth: 250, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", color: C.white, fontSize: "0.82rem", fontFamily: font, outline: "none" }}
          onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
        <GoldBtn onClick={onAdd} small>Add</GoldBtn>
      </div>
    </GlassCard>
  );

  // ─── MOCKUP-UI RENDER (settings-recommended.html) ───
  // Exact port of the mockup: its real CSS (injected scoped under `.vs`, see
  // SET_CSS) + its exact markup as JSX, wired to the live state/handlers above.
  // Guided/Pro + privacy/font persist to localStorage to match the mockup.
  // ═══════════════════════════════════════════════════════════════════════
  const [uiMode, setUiMode] = useState(() => { try { return localStorage.getItem("viv-mode") === "pro" ? "pro" : "guided"; } catch { return "guided"; } });
  useEffect(() => { try { localStorage.setItem("viv-mode", uiMode); } catch {} }, [uiMode]);
  const expert = uiMode === "pro";
  const [privacyMode, setPrivacyMode] = useState(() => { try { return localStorage.getItem("viv-privacy-mode") === "on" ? "on" : "off"; } catch { return "off"; } });
  const [welcomeDismissed, setWelcomeDismissed] = useState(() => { try { return localStorage.getItem("viv-welcome-x") === "1"; } catch { return false; } });
  const [snoozeReset, setSnoozeReset] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [ibkrTutOpenM, setIbkrTutOpenM] = useState(false);
  const [viewAsMember, setViewAsMember] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const [guide, setGuide] = useState(null);
  const [activeGuide, setActiveGuide] = useState(null);
  const [guideMuted, setGuideMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef(null);
  const rootRef = useRef(null);

  // scroll-reveal: add in-view so the gated header (h1/sub) becomes visible + animates
  useEffect(() => {
    const root = rootRef.current; if (!root) return;
    const els = root.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) { els.forEach(e => e.classList.add("in-view")); return; }
    const io = new IntersectionObserver((ents) => { ents.forEach(en => { if (en.isIntersecting) { en.target.classList.add("in-view"); io.unobserve(en.target); } }); }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
    els.forEach(e => io.observe(e));
    // The one-shot observer can latch a stale "not intersecting" state during the initial
    // data-load/layout settle and never re-fire (a short page doesn't scroll), which leaves gated
    // content stuck hidden (e.g. the risk-allocation bar at width 0). After things settle, reveal
    // anything that's actually on-screen so it can't get stuck.
    const settle = setTimeout(() => {
      els.forEach(e => {
        if (e.classList.contains("in-view")) return;
        const r = e.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) { e.classList.add("in-view"); io.unobserve(e); }
      });
    }, 600);
    return () => { io.disconnect(); clearTimeout(settle); };
  }, []);

  const applyMode = (m) => { setUiMode(m); if (m === "pro") { try { audioRef.current && audioRef.current.pause(); } catch {} setGuide(null); setActiveGuide(null); } };
  const narrate = (audio) => { if (guideMuted || !audio || !audioRef.current) return; try { audioRef.current.pause(); audioRef.current.src = audio; audioRef.current.currentTime = 0; audioRef.current.play().catch(() => {}); } catch {} };
  const guideEnter = (key, title, body, audio) => () => { if (expert) return; setActiveGuide(key); setGuide({ title, body }); narrate(audio); };
  const guideLeave = (key) => () => { setActiveGuide(g => (g === key ? null : g)); };
  const gactive = (key) => (!expert && activeGuide === key ? " guide-active" : "");

  const applyPrivacy = (v) => { setPrivacyMode(v); try { localStorage.setItem("viv-privacy-mode", v); } catch {} };
  const resetReminders = () => { try { localStorage.removeItem("viv-winshare-dismissed"); localStorage.removeItem("viv-support-dismissed"); } catch {} setSnoozeReset(true); setTimeout(() => setSnoozeReset(false), 1800); };
  const saveProfile = () => { setProfileSaved(true); setTimeout(() => setProfileSaved(false), 1800); };

  const FONT_OPTS = [{ key: "small", label: "Small" }, { key: "standard", label: "Standard" }, { key: "large", label: "Large" }];
  const firstName = (displayName && displayName.trim()) || (userEmail ? userEmail.split("@")[0] : "trader");
  const integ = integrityReport;

  return (
    <div className={"vs" + (expert ? " expert" : "") + (viewAsMember ? " member" : "")} ref={rootRef}>
      <style dangerouslySetInnerHTML={{ __html: SET_CSS }} />
      <audio ref={audioRef} preload="auto" onPlaying={() => setSpeaking(true)} onEnded={() => setSpeaking(false)} onPause={() => setSpeaking(false)} />
      <div className="shell">

        {/* NAV */}
        <div className="navbar">
          <div className="brand"><img src="/logo-mark.png" alt="Valen Insiders Vault" style={{ width: 24, height: 24, objectFit: "contain", display: "block" }} /> Valen Insiders Vault</div>
          <div className="tabs">
            <a style={{ cursor: "pointer" }} onClick={() => setPage && setPage("dashboard")}>Dashboard</a>
            <a style={{ cursor: "pointer" }} onClick={() => setPage && setPage("journal")}>Journal</a>
            <a style={{ cursor: "pointer" }} onClick={() => setPage && setPage("tools")}>Premium tools</a>
            <a className="on" style={{ cursor: "pointer" }} onClick={() => setPage && setPage("settings")}>Settings</a>
          </div>
          <div className="spacer"></div>
          <div className="seg" id="modeSeg" title="Guided explains everything; Pro strips it back for experts">
            <button className={uiMode === "guided" ? "on" : ""} onClick={() => applyMode("guided")}>Guided</button>
            <button className={uiMode === "pro" ? "on" : ""} onClick={() => applyMode("pro")}>Pro</button>
          </div>
          <WhatsNew />
          <button onClick={() => onLogout && onLogout()} title="Sign out" style={{ marginLeft: 14, background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", fontFamily: "var(--font)", fontSize: "0.72rem", fontWeight: 700, padding: "7px 14px", borderRadius: 980, cursor: "pointer" }}>Sign out</button>
        </div>

        {/* HEADER */}
        <div className="reveal">
          <div className="eyebrow">Settings</div>
          <div className="h1" style={{ marginTop: 2 }}>Account Settings</div>
          <div className={"sub guide" + gactive("intro")} onMouseEnter={guideEnter("intro", "Account settings", "This is your account hub. Set how the app looks and behaves, connect Interactive Brokers so your trades log themselves, and check that your data is healthy. Hover anything for a plain-English explanation.", "/audio/settings-intro.mp3")} onMouseLeave={guideLeave("intro")}>Set how the app looks and behaves, connect your broker, and keep your data healthy. Hover any underlined word for a plain-English definition.</div>
        </div>

        {/* WELCOME */}
        {!expert && !welcomeDismissed && (
          <div className="welcome">
            <span className="wd"></span>
            <div><b>First time here?</b> Set how the app looks and behaves below — your mode, privacy, text size, and the dropdown lists you use across the app. The guide in the corner explains everything <b>out loud</b>. Switch to <b>Pro</b> (top-right) for a clean view.</div>
            <span className="x" onClick={() => { setWelcomeDismissed(true); try { localStorage.setItem("viv-welcome-x", "1"); } catch {} }}>&times;</span>
          </div>
        )}

        {/* ===== PROFILE ===== */}
        <div className={"card guide" + gactive("profile")} onMouseEnter={guideEnter("profile", "Profile", "Your name and login email. Your display name is what shows on shared stats and in the members list. Your email is the address you signed in with and can't be changed here.", "/audio/settings-profile.mp3")} onMouseLeave={guideLeave("profile")}>
          <div className="eyebrow">You</div>
          <div className="cardtitle">Profile</div>
          <div className="carddesc">Your name and login. Your display name appears on shared stats and in the members list.</div>
          <div className="grid2" style={{ marginTop: 16 }}>
            <div className="field"><label><span className="term" data-tip="The name shown on your shared stat cards and in the members list. Change it any time.">Display name</span></label><input className="in" value={displayName || ""} onChange={e => onDisplayNameChange(e.target.value)} onBlur={e => onDisplayNameChange(e.target.value)} placeholder="Your name" /><div className="hint">What others see.</div></div>
            <div className="field"><label><span className="term" data-tip="The email you signed in with. To change it, contact support — it can't be edited here for security.">Email</span></label><input className="in" value={userEmail || ""} disabled /><div className="hint">Fixed — your login.</div></div>
          </div>
          <div className="row" style={{ marginTop: 16 }}><button className={"btn gold" + (profileSaved ? " ok" : "")} onClick={saveProfile}>{profileSaved ? "Saved ✓" : "Save profile"}</button></div>
        </div>

        {/* ===== PREFERENCES ===== */}
        <div className={"card guide" + gactive("prefs")} onMouseEnter={guideEnter("prefs", "Preferences", "Your preferences. Choose whether the app opens in Guided mode with explanations and voiceover, or Pro mode for a clean expert view. Decide whether dollar amounts are hidden behind percentages by default. And pick a comfortable text size. These stick across your devices.", "/audio/settings-prefs.mp3")} onMouseLeave={guideLeave("prefs")}>
          <div className="eyebrow">How the app behaves</div>
          <div className="cardtitle">Preferences</div>
          <div className="carddesc">These are remembered on your account, across pages and devices.</div>

          <div className="prefrow" style={{ marginTop: 8 }}>
            <div className="pl"><div className="t"><span className="term" data-tip="Guided shows explanations, hover definitions, and voiceover everywhere — best while you're learning. Pro hides all of that for a clean, fast expert view.">Default mode</span></div>
              <div className="d">Guided shows explanations and voiceover everywhere. Pro is a clean, fast expert view. This is the same toggle as the top-right — set your default here.</div></div>
            <div className="seg" id="prefMode"><button className={uiMode === "guided" ? "on" : ""} onClick={() => applyMode("guided")}>Guided</button><button className={uiMode === "pro" ? "on" : ""} onClick={() => applyMode("pro")}>Pro</button></div>
          </div>

          <div className="prefrow">
            <div className="pl"><div className="t"><span className="term" data-tip="When on, the app shows percentages instead of dollar amounts by default, so you can screenshot or screen-share without revealing your account size. You can flip it any time from the Journal.">Privacy by default</span></div>
              <div className="d">Hide dollar amounts behind percentages by default — handy for screenshots and screen-shares. You can still toggle it per page.</div></div>
            <div className="seg" id="prefPrivacy"><button className={privacyMode === "off" ? "on" : ""} onClick={() => applyPrivacy("off")}>Show $</button><button className={privacyMode === "on" ? "on" : ""} onClick={() => applyPrivacy("on")}>Show % only</button></div>
          </div>

          <div className="prefrow">
            <div className="pl"><div className="t"><span className="term" data-tip="Sets the text size across the whole app. Larger sizes are easier on the eyes; smaller fits more on screen.">Text size</span></div>
              <div className="d">Pick a comfortable reading size. Applies everywhere instantly.</div></div>
            <div className="seg" id="prefFont">
              {FONT_OPTS.map(o => (<button key={o.key} className={fontSize === o.key ? "on" : ""} onClick={() => setFontSize(o.key)}>{o.label}</button>))}
            </div>
          </div>

          <div className="prefrow">
            <div className="pl"><div className="t"><span className="term" data-tip="The celebration card when you're green, and the encouragement card when you're red, can each be dismissed on the Journal. After you close one it stays hidden for 3 days. Reset here to bring them back right away.">Community reminders</span></div>
              <div className="d">The “share your win” and “rough patch” cards on the Journal can be dismissed — each then snoozes for 3 days. Reset to show them again now.</div></div>
            <button className={"btn" + (snoozeReset ? " ok" : "")} onClick={resetReminders}>{snoozeReset ? "Reset ✓" : "Reset reminders"}</button>
          </div>
        </div>

        {/* ===== INTERACTIVE BROKERS ===== */}
        <div style={{ display: "none" }} className={"card guide" + gactive("ibkr")} onMouseEnter={guideEnter("ibkr", "Interactive Brokers", "Connect Interactive Brokers to pull your positions and closed trades automatically. You paste two things from your broker — a query ID and a read-only token. It can only read your statements, never trade or move money. Press play on the tutorial if it's your first time.", "/audio/settings-ibkr.mp3")} onMouseLeave={guideLeave("ibkr")}>
          <div className="eyebrow">Auto-log your trades</div>
          <div className="cardtitle">Interactive Brokers sync</div>
          <div className="carddesc">Connect your IBKR account and your real positions and closed trades flow in automatically — so you barely have to type anything. <b>It only ever reads your statements; it can never trade or move money.</b></div>

          <div className="alert caution" style={{ marginTop: 14 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v5M12 16h.01" /></svg><div><b>Do I need this?</b> It's optional but recommended. Without it you log trades by hand; with it, they appear automatically (about a day after they happen, closed on/after {IBKR_SYNC_FLOOR}). New to it? <b>Watch the 1-minute tutorial below.</b></div></div>

          {/* tutorial video — static placeholder (no backend); real walkthrough is the written steps + voiceover */}
          {!expert && (
            <div className="tourwrap">
              <div className="tour">
                <div className="tourbg"></div>
                <div className="tourstage">
                  <div className="tourchip">Setup tutorial · IBKR</div>
                  <div className="tourtitle">How to connect Interactive Brokers</div>
                  <div className="tourcap">A one-time, ~5-minute setup. Hover this card for the voiceover, or follow the written steps below — every step, in order.</div>
                  <div className="tourdots"><i className="on"></i><i></i><i></i><i></i><i></i><i></i></div>
                </div>
                <div className="tourbar">
                  <span className="tourbtn" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg></span>
                  <div className="tourprog"><div className="fill" style={{ width: "0%" }}></div></div>
                  <div className="tourtime">0 / 6</div>
                </div>
              </div>
            </div>
          )}

          {/* connection */}
          <div className="row" style={{ marginTop: 20 }}><span className="label">Your IBKR connection</span>
            {ibkrLoaded && <span className={"conn " + (ibkrConnected ? "yes" : "no")}><span className="d"></span>{ibkrConnected ? "Connected ✓" : "Not connected"}</span>}</div>
          <div className="grid2" style={{ marginTop: 12 }}>
            <div className="field"><label><span className="term" data-tip="A number that identifies the report (Flex Query) you created in IBKR. You'll copy it from the Flex Queries list.">Flex Query ID</span></label><input className="in" value={ibkrQueryId} onChange={e => setIbkrQueryId(e.target.value)} placeholder="e.g. 1519726" /><div className="hint">From your IBKR Flex Queries list.</div></div>
            <div className="field"><label><span className="term" data-tip="A long read-only key that lets the app fetch your statements. Treat it like a password. It cannot trade or move money.">Flex Web Service token</span></label><input className="in" type="password" autoComplete="off" value={ibkrToken} onChange={e => setIbkrToken(e.target.value)} placeholder="paste your token" /><div className="hint">Read-only — like a password.</div></div>
          </div>
          <div className="row" style={{ marginTop: 14 }}>
            <button className={"btn gold" + (ibkrConnStatus === "saved" ? " ok" : "")} onClick={saveIbkrConn} disabled={ibkrConnStatus === "saving"}>{ibkrConnStatus === "saving" ? "Saving…" : ibkrConnStatus === "saved" ? "Saved ✓" : ibkrConnStatus === "error" ? "Failed" : "Save connection"}</button>
            <span className="hint" style={{ maxWidth: 420 }}>Stored privately on your own account. The token is read-only — it can pull statements but can't trade or move money.</span>
          </div>

          {/* sync trigger */}
          {onIbkrSync && (
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn gold" onClick={onIbkrSync}>⟳ Sync from IBKR</button>
              <span className="hint" style={{ maxWidth: 420 }}>Pulls your positions and closed trades. You always see a preview first — manual entries are never overwritten.</span>
            </div>
          )}

          {/* ignore tickers */}
          <div className="row" style={{ marginTop: 22 }}><span className="label">Ignore tickers on sync</span>
            {ibkrIgnoreList.length > 0 && <span className="conn yes"><span className="d"></span>{ibkrIgnoreList.length} ignored</span>}</div>
          <div className="carddesc" style={{ marginTop: 6 }}>Tickers here are skipped automatically on every sync (they still show in the preview so you can override). Good for index hedges or account-only tickers you don't track in VIV.</div>
          <div className="row" style={{ marginTop: 10, alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1, minWidth: 240 }}><input className="in" value={ibkrIgnoreText} onChange={e => setIbkrIgnoreText(e.target.value)} placeholder="e.g. SPY, QQQ, VXX, SOXL" /></div>
            <button className={"btn" + (ibkrIgnoreStatus === "saved" ? " ok" : "")} onClick={saveIbkrIgnore} disabled={ibkrIgnoreStatus === "saving"}>{ibkrIgnoreStatus === "saving" ? "Saving…" : ibkrIgnoreStatus === "saved" ? "Saved ✓" : ibkrIgnoreStatus === "error" ? "Failed" : "Save list"}</button>
          </div>
          {ibkrIgnoreList.length > 0 && (
            <div className="chips">{ibkrIgnoreList.map(t => (<span key={t} className="chip">⊘ {t}</span>))}</div>
          )}

          {/* written steps */}
          <div className="expander">
            <div className={"exhead" + (ibkrTutOpenM ? " open" : "")} onClick={() => setIbkrTutOpenM(o => !o)}>📘 First time? Connect Interactive Brokers — step by step <span className="chev">▾</span></div>
            <div className={"exbody" + (ibkrTutOpenM ? " open" : "")}>
              <div className="carddesc" style={{ marginBottom: 6 }}>A one-time setup that lets the app <b>read (never change)</b> your IBKR statements. About 5 minutes — follow each step exactly.</div>
              <div className="steps">
                <div className="step"><span className="sn">Step 1 · Log in on a computer</span><b>Open the IBKR Client Portal</b><p>Go to interactivebrokers.com → Client Portal (web, not the app). Top menu: <b>Performance &amp; Reports → Flex Queries</b>.</p></div>
                <div className="step"><span className="sn">Step 2 · Create the query</span><b>New Activity Flex Query</b><p>Click the blue <b>+</b> next to "Activity Flex Query". In <b>Query Name</b> type <code>VIV</code>.</p></div>
                <div className="step"><span className="sn">Step 3 · Tick two sections</span><b>Open Positions &amp; Trades</b><p>Under <b>Open Positions</b> click <b>Select All</b>. Under <b>Trades</b> click <b>Select All</b>. Leave everything else unticked.</p></div>
                <div className="step"><span className="sn">Step 4 · Delivery settings</span><b>XML, last 365 days</b><p>Format = <code>XML</code>, Period = <b>Last 365 Calendar Days</b>. (We only keep trades from <b>{IBKR_SYNC_FLOOR}</b> on, so nothing recent is missed.)</p></div>
                <div className="step"><span className="sn">Step 5 · General settings</span><b>Leave the defaults</b><p>Date <code>yyyyMMdd</code>, Time <code>HHmmss</code>, Separator <code>;</code>, all Yes/No = No. Click <b>Continue → Create</b>.</p></div>
                <div className="step"><span className="sn">Step 6 · Copy the Query ID</span><b>Write down the number</b><p>The query now shows a <b>Query ID</b> on the list. Copy it.</p></div>
                <div className="step"><span className="sn">Step 7 · Get a token</span><b>Flex Web Service</b><p>Find <b>Flex Web Service Configuration</b>, switch <b>Status</b> to <b>on</b>, click <b>Generate New Token</b> (longest expiry), and copy it. <span style={{ color: "var(--goldBright)" }}>Treat it like a password.</span></p></div>
                <div className="step"><span className="sn">Step 8 · Paste &amp; save</span><b>Link your account</b><p>Paste the <b>Query ID</b> and <b>token</b> into the fields above and click <b>Save connection</b>. Done — privately linked to you. The <b>Sync</b> button now pulls your data.</p></div>
              </div>
              <div className="alert ok" style={{ marginTop: 14 }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5" /></svg><div><b>Good to know:</b> trades appear about <b>1 business day</b> after they happen (log manually for same-day, then reconcile). Every sync shows a <b>preview first</b> and only adds/updates IBKR rows — it never edits or deletes your manual entries. The dot next to each ticker shows where it came from: <SourceDot source="manual" /> manual · <SourceDot source="ibkr" /> auto-synced.</div></div>
            </div>
          </div>
        </div>

        {/* ===== DATA INTEGRITY ===== */}
        <div className={"card guide" + gactive("integrity")} onMouseEnter={guideEnter("integrity", "Data integrity check", "A health check for your records. It scans for duplicates, orphaned trades, and sign errors, and tells you whether everything is clean. It only reads your data — it never changes anything.", "/audio/settings-integrity.mp3")} onMouseLeave={guideLeave("integrity")}>
          <div className="eyebrow">Safety</div>
          <div className="cardtitle">Check my data</div>
          <div className="carddesc">Scan your trades and positions for duplicates, orphans, and sign errors. <b>Read-only — nothing is ever changed.</b> A good habit before and after a big import.</div>
          <div className="row" style={{ marginTop: 16 }}>
            <span className="conn yes"><span className="d"></span>Auto-checked on every sync</span>
            {integ && (
              <span className={"conn " + (integ.counts.critical > 0 ? "no" : "yes")} style={integ.counts.critical > 0 ? { background: "rgba(239,68,68,0.12)", color: "#fda4a4" } : undefined}><span className="d"></span>{integ.counts.critical > 0 ? `${integ.counts.critical} critical` : "All clean ✓"}{integ.counts.warn > 0 ? ` · ${integ.counts.warn} warn` : ""}</span>
            )}
            {onRunIntegrity && (
              <button className="btn" onClick={onRunIntegrity} disabled={integrityRunning}>{integrityRunning ? "Scanning…" : (integ ? "↻ Re-run check" : "✓ Run check")}</button>
            )}
            <span className="hint">Your records are scanned for duplicates, orphans, and sign errors automatically — or run it manually any time.</span>
          </div>
        </div>

        {/* ===== BETA FEATURES (preserved) ===== */}
        {onToggleIntradayFeature && (
          <div className="card">
            <div className="eyebrow">Beta features</div>
            <div className="cardtitle">Features in test</div>
            <div className="carddesc">Opt in to features that are still being validated. Toggles are per-browser — flipping them here doesn't affect other members or other devices.</div>
            <div className="prefrow" style={{ marginTop: 8 }}>
              <div className="pl">
                <div className="t">Intraday Activity <span style={{ fontSize: "0.5rem", fontWeight: 800, padding: "2px 7px", borderRadius: 980, background: "var(--goldDim)", color: "var(--gold)", border: "1px solid var(--borderGold)", letterSpacing: "0.08em", textTransform: "uppercase", marginLeft: 6 }}>Beta</span></div>
                <div className="d">Adds a “Today” column to Open Positions for logging intraday trims, adds, or notes. <b>Calculation only — does NOT change shares / stop / P/L.</b> IBKR sync overnight auto-matches logged trims to real fills.
                  {!intradayColumnAvailable && (<><br /><span style={{ color: "var(--red)" }}>⚠ Schema migration not detected — run the <code style={{ color: "var(--goldBright)" }}>positions.intraday_log</code> migration in Supabase before enabling.</span></>)}
                </div>
              </div>
              <button onClick={() => onToggleIntradayFeature(!intradayFeatureEnabled)} role="switch" aria-checked={intradayFeatureEnabled} disabled={!intradayColumnAvailable} title={intradayColumnAvailable ? (intradayFeatureEnabled ? "Click to disable" : "Click to enable") : "Run the SQL migration first"} style={{ width: 56, height: 30, borderRadius: 980, border: `1px solid ${intradayFeatureEnabled ? "var(--borderGold)" : "var(--border)"}`, background: intradayFeatureEnabled ? "var(--goldDim)" : "rgba(255,255,255,0.04)", position: "relative", cursor: intradayColumnAvailable ? "pointer" : "not-allowed", opacity: intradayColumnAvailable ? 1 : 0.5, transition: "all 0.2s", fontFamily: "var(--font)", padding: 0, flex: "none" }}>
                <span style={{ position: "absolute", top: 3, left: intradayFeatureEnabled ? 28 : 3, width: 22, height: 22, borderRadius: 999, background: intradayFeatureEnabled ? "var(--goldBright)" : "var(--muted)", transition: "left 0.18s ease-out, background 0.18s", boxShadow: intradayFeatureEnabled ? "0 0 8px rgba(240,192,80,0.5)" : "none" }} />
              </button>
            </div>
          </div>
        )}

        {/* ===== LIST MANAGERS (preserved) — Setup Types / Tags / Exit Reasons ===== */}
        <div className="card">
          <div className="eyebrow">Your dropdowns</div>
          <div className="cardtitle">Lists &amp; labels</div>
          <div className="carddesc">The options that appear in the Setup, Tags, and Exit Reason dropdowns across your positions and journal.</div>

          {[
            { title: "Setup Types", desc: "Entry strategies used in your open positions and trade journal. These appear as dropdown options everywhere.", items: setupTypes, onAdd: () => addItem(setupTypes, setSetupTypes, newSetup, setNewSetup), onRemove: v => removeItem(setupTypes, setSetupTypes, v), val: newSetup, setVal: setNewSetup, ph: "e.g. Flag Breakout" },
            { title: "Tags", desc: "Custom labels you can attach to any trade. Use for filtering your journal by theme, catalyst, or strategy nuance.", items: tags, onAdd: () => addItem(tags, setTags, newTag, setNewTag), onRemove: v => removeItem(tags, setTags, v), val: newTag, setVal: setNewTag, ph: "e.g. Pre-Earnings" },
            { title: "Exit Reasons", desc: "Reasons for closing a position. Shown when you sell shares from the dashboard.", items: exitReasons, onAdd: () => addItem(exitReasons, setExitReasons, newReason, setNewReason), onRemove: v => removeItem(exitReasons, setExitReasons, v), val: newReason, setVal: setNewReason, ph: "e.g. Gap Down" },
          ].map((lm, i) => (
            <div key={lm.title} className="prefrow" style={i === 0 ? { marginTop: 8 } : undefined}>
              <div className="pl" style={{ maxWidth: "none", width: "100%" }}>
                <div className="t">{lm.title}</div>
                <div className="d">{lm.desc}</div>
                <div className="chips">{lm.items.map(item => (
                  <span key={item} className="chip" style={{ background: "var(--goldDim)", borderColor: "var(--borderGold)", color: "var(--gold)" }}>{item}<span onClick={() => lm.onRemove(item)} style={{ cursor: "pointer", opacity: 0.55, fontSize: "0.9rem", lineHeight: 1 }}>&times;</span></span>
                ))}</div>
                <div className="row" style={{ marginTop: 10, alignItems: "flex-end" }}>
                  <input className="in" style={{ maxWidth: 260 }} value={lm.val} onChange={e => lm.setVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") lm.onAdd(); }} placeholder={lm.ph} />
                  <button className="btn gold" onClick={lm.onAdd}>Add</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ===== OWNER-ONLY ZONE ===== */}
        {isAdmin && (
          <div className="ownerzone">
            <div className="ownerhead">
              <span className="ownerbadge">● Owner only</span>
              <div style={{ flex: 1 }}><div className="cardtitle" style={{ fontSize: "0.98rem" }}>Access management &amp; data protection</div><div className="carddesc" style={{ marginTop: 2 }}>Members never see this section. Manage who can register and back up everyone's data.</div></div>
              <div className="seg" id="viewAs" title="Preview what a normal member sees"><button className={!viewAsMember ? "on" : ""} onClick={() => setViewAsMember(false)}>View as owner</button><button className={viewAsMember ? "on" : ""} onClick={() => setViewAsMember(true)}>View as member</button></div>
            </div>
            <div className="membernote">A regular member sees <b>none</b> of this — the entire owner zone is hidden for non-admins. Switch back to <b>View as owner</b> to manage codes, members, and backups.</div>

            {/* access code */}
            <div className={"card guide" + gactive("code")} onMouseEnter={guideEnter("code", "Registration code", "The code new members need to create an account. Share it in your community. Set a new one and the old code stops working immediately, so you can rotate it whenever you want.", "/audio/settings-code.mp3")} onMouseLeave={guideLeave("code")}>
              <div className="cardtitle" style={{ fontSize: "0.95rem" }}>Active registration code</div>
              <div className="carddesc">New members need this to sign up. Share it in your Skool community. Setting a new one deactivates the old one immediately.</div>
              <div className="row" style={{ marginTop: 14, gap: 14 }}><span className="codeshow">{activeCode ? activeCode.code : "— none —"}</span>
                <button className={"btn" + (codeCopied ? " ok" : "")} onClick={() => { if (activeCode) { try { navigator.clipboard.writeText(activeCode.code); } catch {} setCodeCopied(true); setTimeout(() => setCodeCopied(false), 1500); } }} disabled={!activeCode}>{codeCopied ? "Copied ✓" : "Copy"}</button>
                <button className="btn red" onClick={() => activeCode && handleDeactivateCode(activeCode.id)} disabled={!activeCode}>Deactivate</button></div>
              <div className="row" style={{ marginTop: 16, alignItems: "flex-end" }}>
                <div className="field" style={{ flex: 1, minWidth: 220 }}><label>Set a new code</label><input className="in" value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} onKeyDown={e => { if (e.key === "Enter") handleCreateCode(); }} placeholder="e.g. VIV-JUN-2026" style={{ fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", letterSpacing: "0.06em" }} /></div>
                <button className="btn gold" onClick={handleCreateCode} disabled={codeLoading}>{codeLoading ? "Saving…" : "Set new code"}</button>
              </div>
            </div>

            {/* members */}
            <div className="card">
              <div className="cardtitle" style={{ fontSize: "0.95rem" }}>Registered members <span style={{ color: "var(--faint)", fontWeight: 600, fontSize: "0.8rem" }}>· {allMembers.length} total</span></div>
              <div style={{ marginTop: 12, maxHeight: 340, overflowY: "auto" }}>
                {allMembers.map(m => (
                  <div className="memrow" key={m.id}>
                    <div><div className="mn">{m.display_name || (m.email ? m.email.split("@")[0] : "Member")}</div><div className="me">{m.email}</div></div>
                    {m.is_admin && <span className="adm">Admin</span>}
                    <span className="jd">Joined {m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* backup & restore — handlers copied verbatim from the existing render (write to Supabase) */}
            <div className="card">
              <div className="cardtitle" style={{ fontSize: "0.95rem" }}>Backup &amp; restore</div>
              <div className="carddesc">Export all member data (positions, trades, profiles, settings). <b>Run a backup before every deploy.</b> Restore is non-destructive — it only adds or updates, never deletes.</div>
              <div className="row" style={{ marginTop: 16, gap: 10 }}>
                <button className="btn green" onClick={async () => {
                  try {
                    setBackupStatus("Exporting...");
                    // Fetch ALL data from ALL tables
                    const [posRes, tradeRes, profRes, settRes] = await Promise.all([
                      supabase.from("positions").select("*"),
                      supabase.from("trades").select("*").or("is_deleted.is.null,is_deleted.eq.false"),
                      supabase.from("profiles").select("*"),
                      supabase.from("user_settings").select("*"),
                    ]);
                    const backup = {
                      exported_at: new Date().toISOString(),
                      version: "1.0",
                      counts: {
                        positions: (posRes.data || []).length,
                        trades: (tradeRes.data || []).length,
                        profiles: (profRes.data || []).length,
                        settings: (settRes.data || []).length,
                      },
                      positions: posRes.data || [],
                      trades: tradeRes.data || [],
                      profiles: profRes.data || [],
                      settings: settRes.data || [],
                    };
                    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `VIV_Backup_${new Date().toISOString().slice(0,10)}_${new Date().toISOString().slice(11,16).replace(":","")}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    setBackupStatus(`Exported: ${backup.counts.positions} positions, ${backup.counts.trades} trades, ${backup.counts.profiles} profiles`);
                  } catch (err) {
                    setBackupStatus("Export failed: " + err.message);
                  }
                }}>⤓ Export full backup (JSON)</button>

                <button className="btn gold" onClick={async () => {
                  try {
                    setBackupStatus("Exporting CSV...");
                    const [posRes, tradeRes] = await Promise.all([
                      supabase.from("positions").select("*"),
                      supabase.from("trades").select("*").or("is_deleted.is.null,is_deleted.eq.false"),
                    ]);
                    const pos = posRes.data || [];
                    const trades = tradeRes.data || [];
                    // Positions CSV
                    const posHeaders = ["Symbol","Entry Date","Entry Time","Shares","Entry Price","Current Price","Stop","Trailing Stop","Setup","Tags","Commission","Notes","Chart URL"];
                    const posRows = [posHeaders.join(",")];
                    pos.forEach(p => {
                      posRows.push([p.symbol, p.entry_date, p.entry_time||"", p.shares, p.entry_price, p.current_price, p.stop_price, p.trailing_stop||"", `"${p.setup||""}"`, `"${(p.tags||[]).join("; ")}"`, p.commission!=null?p.commission:"", `"${(p.notes||"").replace(/"/g,'""')}"`, `"${p.chart_url||""}"`].join(","));
                    });
                    const posBlob = new Blob([posRows.join("\n")], { type: "text/csv" });
                    const posUrl = URL.createObjectURL(posBlob);
                    const a1 = document.createElement("a"); a1.href = posUrl;
                    a1.download = `VIV_Positions_${new Date().toISOString().slice(0,10)}.csv`; a1.click();
                    URL.revokeObjectURL(posUrl);
                    // Trades CSV
                    const trHeaders = ["Symbol","Entry Date","Entry Time","Exit Date","Exit Time","Entry Price","Exit Price","Shares","Stop","Setup","Tags","P/L %","P/L $","R-Multiple","Exit Reason","Notes","Chart URL"];
                    const trRows = [trHeaders.join(",")];
                    trades.forEach(t => {
                      trRows.push([t.ticker, t.entry_date, t.entry_time||"", t.exit_date||"", t.exit_time||"", t.entry_price, t.exit_price, t.shares, t.stop_price||"", `"${t.setup||""}"`, `"${(t.tags||[]).join("; ")}"`, t.pl_pct!=null?Number(t.pl_pct).toFixed(2):"", t.pl_dollar!=null?Number(t.pl_dollar).toFixed(2):"", t.r_mult!=null?Number(t.r_mult).toFixed(2):"", `"${t.exit_reason||""}"`, `"${(t.notes||"").replace(/"/g,'""')}"`, `"${t.chart_url||""}"`].join(","));
                    });
                    // Small delay so browser doesn't block second download
                    await new Promise(r => setTimeout(r, 500));
                    const trBlob = new Blob([trRows.join("\n")], { type: "text/csv" });
                    const trUrl = URL.createObjectURL(trBlob);
                    const a2 = document.createElement("a"); a2.href = trUrl;
                    a2.download = `VIV_Trades_${new Date().toISOString().slice(0,10)}.csv`; a2.click();
                    URL.revokeObjectURL(trUrl);
                    setBackupStatus(`CSV exported: ${pos.length} positions + ${trades.length} trades (2 files downloaded)`);
                  } catch (err) {
                    setBackupStatus("CSV export failed: " + err.message);
                  }
                }}>⤓ Export CSV (Excel)</button>

                <label className="btn" style={{ cursor: "pointer" }}>
                  ⤒ Restore from backup
                  <input type="file" accept=".json" style={{ display: "none" }} onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      setBackupStatus("Restoring...");
                      const text = await file.text();
                      const backup = JSON.parse(text);
                      if (!backup.version || !backup.positions || !backup.trades) {
                        setBackupStatus("Invalid backup file — missing required fields.");
                        return;
                      }

                      let restored = { positions: 0, trades: 0 };

                      // Restore positions — try update by id first; if row doesn't exist, insert without id
                      // (upsert fails because id is GENERATED ALWAYS AS IDENTITY)
                      if (backup.positions.length > 0) {
                        const withId = backup.positions.filter(p => p.id);
                        const withoutId = backup.positions.filter(p => !p.id);
                        for (const p of withId) {
                          const { id, ...rest } = p;
                          const { data: updated, error } = await supabase.from("positions").update(rest).eq("id", id).select("id");
                          if (error && error.code !== 'PGRST116') { setBackupStatus("Position restore error: " + error.message); return; }
                          // If update found 0 rows (deleted since backup), insert as new row
                          if (!updated || updated.length === 0) {
                            const { error: insErr } = await supabase.from("positions").insert(rest);
                            if (insErr) { setBackupStatus("Position restore (re-insert) error: " + insErr.message); return; }
                          }
                        }
                        if (withoutId.length > 0) {
                          const inserts = withoutId.map(p => { const { id, ...rest } = p; return rest; });
                          const { error } = await supabase.from("positions").insert(inserts);
                          if (error) { setBackupStatus("Position restore error: " + error.message); return; }
                        }
                        restored.positions = backup.positions.length;
                      }

                      // Restore trades — try update by id first; if row doesn't exist, insert without id
                      if (backup.trades.length > 0) {
                        const withId = backup.trades.filter(t => t.id);
                        const withoutId = backup.trades.filter(t => !t.id);
                        for (const t of withId) {
                          const { id, ...rest } = t;
                          const { data: updated, error } = await supabase.from("trades").update(rest).eq("id", id).select("id");
                          if (error && error.code !== 'PGRST116') { setBackupStatus("Trade restore error: " + error.message); return; }
                          // If update found 0 rows (deleted since backup), insert as new row
                          if (!updated || updated.length === 0) {
                            const { error: insErr } = await supabase.from("trades").insert(rest);
                            if (insErr) { setBackupStatus("Trade restore (re-insert) error: " + insErr.message); return; }
                          }
                        }
                        if (withoutId.length > 0) {
                          const { error } = await supabase.from("trades").insert(withoutId);
                          if (error) { setBackupStatus("Trade restore error: " + error.message); return; }
                        }
                        restored.trades = backup.trades.length;
                      }

                      // Restore profiles — upsert by id (safe, non-destructive)
                      if (backup.profiles && backup.profiles.length > 0) {
                        const { error } = await supabase.from("profiles").upsert(backup.profiles, { onConflict: "id" });
                        if (error) console.error("Profile restore error:", error.message);
                      }

                      // Restore settings — upsert (safe, non-destructive)
                      if (backup.settings && backup.settings.length > 0) {
                        const { error } = await supabase.from("user_settings").upsert(backup.settings, { onConflict: "user_id,setting_key" });
                        if (error) console.error("Settings restore error:", error.message);
                      }

                      setBackupStatus(`Restored: ${restored.positions} positions, ${restored.trades} trades. Reload the page to see changes.`);
                    } catch (err) {
                      setBackupStatus("Restore failed: " + err.message);
                    }
                    e.target.value = ""; // reset file input
                  }} />
                </label>
              </div>
              <div id="backupStatus" style={{ marginTop: 12, fontSize: "0.76rem", color: backupStatus && (backupStatus.includes("fail") || backupStatus.includes("error") || backupStatus.includes("Invalid")) ? "#fda4a4" : "var(--faint)" }}>{backupStatus}</div>
            </div>
          </div>
        )}

        {/* Mobile-only sign out — the mobile top bar no longer carries it, so this is the phone logout path. Two-step Yes/No confirm. */}
        {isMobile && (
          confirmSignOut ? (
            <div style={{ marginTop: 20, padding: "16px", border: "1px solid var(--border)", borderRadius: 16, background: "var(--glass)" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text)", textAlign: "center", marginBottom: 12 }}>Are you sure you want to sign out?</div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => onLogout && onLogout()} style={{ flex: 1, padding: "12px", background: "rgba(239,68,68,0.14)", border: "1px solid rgba(239,68,68,0.4)", color: "#fca5a5", fontFamily: "var(--font)", fontSize: "0.82rem", fontWeight: 700, borderRadius: 980, cursor: "pointer" }}>Yes</button>
                <button onClick={() => setConfirmSignOut(false)} style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid var(--border)", color: "var(--muted)", fontFamily: "var(--font)", fontSize: "0.82rem", fontWeight: 700, borderRadius: 980, cursor: "pointer" }}>No</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmSignOut(true)} style={{ marginTop: 20, width: "100%", padding: "13px 16px", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.5)", color: "#fca5a5", fontFamily: "var(--font)", fontSize: "0.82rem", fontWeight: 700, borderRadius: 980, cursor: "pointer", boxShadow: "0 0 18px rgba(239,68,68,0.35)" }}>Sign out</button>
          )
        )}

        {/* guide assistant */}
        <div className={"guidepanel" + (speaking ? " speaking" : "")} aria-live="polite">
          <div className="gp-head"><span className="gp-dot"></span><span className="gp-title">{guide ? guide.title : "Guided walkthrough"}</span>
            <button className="gp-mute" title={guideMuted ? "Unmute voiceover" : "Mute voiceover"} aria-label="Toggle voiceover" onClick={() => setGuideMuted(m => { const nm = !m; if (nm) { try { audioRef.current && audioRef.current.pause(); } catch {} } return nm; })}>
              {guideMuted
                ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" /><line x1="22" y1="9" x2="16" y2="15" /><line x1="16" y1="9" x2="22" y2="15" /></svg>
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a9 9 0 0 1 0 14" /></svg>}
            </button>
          </div>
          <div className="gp-body">{guide ? guide.body : "Hover any card and I'll explain it — out loud. Or hover the IBKR card for the setup walkthrough. Switch to Pro (top-right) to turn this off."}</div>
        </div>

      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// ─── LOGIN PAGE ───
// ═══════════════════════════════════════
const ADMIN_EMAIL = "vc-lv@live.com";

// ═══════════════════════════════════════
// ─── AUTH PAGE (Login / Register / Forgot Password) ───
// ═══════════════════════════════════════
// ─── Smokey Particle Background for Login ───
function SmokeBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animId;
    let particles = [];
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    // Gold smoke particles
    class Particle {
      constructor() { this.reset(); }
      reset() {
        this.x = Math.random() * canvas.width;
        this.y = canvas.height + Math.random() * 100;
        this.vx = (Math.random() - 0.5) * 0.4;
        this.vy = -(Math.random() * 0.8 + 0.3);
        this.radius = Math.random() * 80 + 40;
        this.opacity = Math.random() * 0.08 + 0.02;
        this.fadeRate = Math.random() * 0.0003 + 0.0001;
        this.hue = Math.random() > 0.5 ? "201,152,42" : "240,192,80"; // gold tones
      }
      update() {
        this.x += this.vx + Math.sin(Date.now() * 0.0005 + this.y * 0.01) * 0.2;
        this.y += this.vy;
        this.opacity -= this.fadeRate;
        if (this.opacity <= 0 || this.y < -this.radius) this.reset();
      }
      draw() {
        const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius);
        g.addColorStop(0, `rgba(${this.hue},${this.opacity})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    for (let i = 0; i < 35; i++) { const p = new Particle(); p.y = Math.random() * canvas.height; particles.push(p); }
    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => { p.update(); p.draw(); });
      animId = requestAnimationFrame(loop);
    };
    loop();
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position:"absolute",inset:0,zIndex:0,pointerEvents:"none" }} />;
}

function AuthPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault(); setError(""); setSuccess("");
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email address."); return; }
    if (!password) { setError("Enter your password."); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) setError(err.message === "Invalid login credentials" ? "Wrong email or password." : err.message);
    setLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault(); setError(""); setSuccess("");
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email address."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    const isAdmin = email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
    if (!isAdmin) {
      if (!accessCode.trim()) { setError("Enter the access code from the Skool community."); return; }
      const { data: codes } = await supabase.from("access_codes").select("code").eq("is_active", true);
      const validCodes = (codes || []).map(c => c.code.toUpperCase());
      if (!validCodes.includes(accessCode.trim().toUpperCase())) { setError("Invalid access code. Get the current code from the Skool community."); return; }
    }
    setLoading(true);
    const { error: err } = await supabase.auth.signUp({ email: email.trim(), password });
    if (err) setError(err.message);
    else { setSuccess("Account created! You can now sign in."); setMode("login"); setPassword(""); }
    setLoading(false);
  };

  const handleForgot = async (e) => {
    e.preventDefault(); setError(""); setSuccess("");
    if (!email.trim() || !email.includes("@")) { setError("Enter your email address."); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (err) setError(err.message);
    else setSuccess("Password reset email sent! Check your inbox.");
    setLoading(false);
  };

  const inp = { width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "13px 16px", color: C.white, fontSize: "0.88rem", fontWeight: 500, fontFamily: font, outline: "none" };

  return (
    <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", WebkitFontSmoothing: "antialiased", color: C.text, position: "relative", overflow: "hidden" }}>
      <AppBackground intensity="serene" />
      {/* Radial vignette overlay */}
      <div style={{ position:"absolute",inset:0,zIndex:1,background:"radial-gradient(ellipse at center, transparent 30%, rgba(8,8,14,0.85) 100%)",pointerEvents:"none" }} />
      <div style={{ width: "100%", maxWidth: 420, padding: "0 24px", position: "relative", zIndex: 2 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          {/* VIV Logo mark */}
          <img src="/logo-mark.png" alt="Valen Insiders Vault" style={{ width:88,height:"auto",display:"block",margin:"0 auto 16px",filter:"drop-shadow(0 0 22px rgba(201,152,42,0.4))" }} />
          <Wordmark size="1.6rem" style={{ marginBottom: 8 }} />
          <div style={{ fontWeight: 400, fontSize: "0.82rem", color: C.muted, lineHeight: 1.6 }}>
            {mode === "login" ? "Members-only trading dashboard." : mode === "register" ? "Create your account to get started." : "Reset your password."}
          </div>
        </div>
        <GlassCard style={{ padding: "32px 28px" }}>
          <form onSubmit={mode === "login" ? handleLogin : mode === "register" ? handleRegister : handleForgot}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontWeight: 700, fontSize: "0.60rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 8, display: "block" }}>Email</label>
              <input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)} style={inp} onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
            </div>
            {mode !== "forgot" && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontWeight: 700, fontSize: "0.60rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 8, display: "block" }}>Password</label>
                <input type="password" placeholder={mode === "register" ? "Min 6 characters" : "Your password"} value={password} onChange={e => setPassword(e.target.value)} style={inp} onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
              </div>
            )}
            {mode === "register" && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontWeight: 700, fontSize: "0.60rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 8, display: "block" }}>Confirm Password</label>
                  <input type="password" placeholder="Repeat password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={inp} onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ fontWeight: 700, fontSize: "0.60rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 8, display: "block" }}>Access Code</label>
                  <input type="text" placeholder="Code from Skool community" value={accessCode} onChange={e => setAccessCode(e.target.value.toUpperCase())} style={{ ...inp, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace", fontWeight: 700 }} onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
                </div>
              </>
            )}
            {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: C.redDim, border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5", fontSize: "0.74rem", fontWeight: 500, marginBottom: 16 }}>{error}</div>}
            {success && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", color: C.green, fontSize: "0.74rem", fontWeight: 500, marginBottom: 16 }}>{success}</div>}
            <button type="submit" disabled={loading} style={{
              width: "100%", padding: "14px", borderRadius: 980, border: "none", cursor: loading ? "wait" : "pointer",
              background: `linear-gradient(135deg, ${C.goldMid}, ${C.goldBright}, ${C.goldDeep})`, color: "#000",
              fontWeight: 800, fontSize: "0.88rem", fontFamily: font, letterSpacing: "-0.01em",
              opacity: loading ? 0.7 : 1, transition: "opacity 0.2s",
            }}>{loading ? "Please wait..." : mode === "login" ? "Sign In" : mode === "register" ? "Create Account" : "Send Reset Email"}</button>
          </form>
          <div style={{ marginTop: 16, textAlign: "center", fontSize: "0.70rem", color: C.muted }}>
            {mode === "login" && (<>
              <span onClick={() => { setMode("forgot"); setError(""); setSuccess(""); }} style={{ color: C.gold, cursor: "pointer", fontWeight: 600 }}>Forgot password?</span>
              <span style={{ margin: "0 8px" }}>·</span>
              <span onClick={() => { setMode("register"); setError(""); setSuccess(""); }} style={{ color: C.gold, cursor: "pointer", fontWeight: 600 }}>Create account</span>
            </>)}
            {mode === "register" && <span>Already have an account? <span onClick={() => { setMode("login"); setError(""); setSuccess(""); }} style={{ color: C.gold, cursor: "pointer", fontWeight: 600 }}>Sign in</span></span>}
            {mode === "forgot" && <span>Remember your password? <span onClick={() => { setMode("login"); setError(""); setSuccess(""); }} style={{ color: C.gold, cursor: "pointer", fontWeight: 600 }}>Sign in</span></span>}
          </div>
        </GlassCard>
        <div style={{ textAlign: "center", marginTop: 20, fontSize: "0.68rem", color: C.muted, lineHeight: 1.6 }}>
          Need an access code?<br />
          <a href="https://www.skool.com/valensontrades/about" target="_blank" rel="noopener noreferrer" style={{ color: C.gold, fontWeight: 600, textDecoration: "none" }}>Join the Skool community</a> to get one.
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════
// ─── MAIN APP ───
// ═══════════════════════════════════════
// ─── Navigation line-icons (thin gold strokes — no emoji) ───
function NavIcon({ name, size = 17, color = "currentColor" }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
  if (name === "dashboard") return <svg {...p}><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>;
  if (name === "journal") return <svg {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>;
  if (name === "tools") return <svg {...p}><path d="M4 6h9M17 6h3M4 12h4M12 12h8M4 18h11M19 18h1" /><circle cx="14" cy="6" r="2.1" /><circle cx="10" cy="12" r="2.1" /><circle cx="16" cy="18" r="2.1" /></svg>;
  if (name === "settings") return <svg {...p}><circle cx="12" cy="12" r="3.4" /><path d="M12 2v3.2M12 18.8V22M2 12h3.2M18.8 12H22M4.9 4.9l2.3 2.3M16.8 16.8l2.3 2.3M19.1 4.9l-2.3 2.3M7.2 16.8l-2.3 2.3" /></svg>;
  return null;
}

// ─── Mobile responsiveness — single global stylesheet that scales down the most awkward inline-style
// patterns (oversized card padding, wide grid gaps, big headline fonts) on phone widths. Works via
// attribute selectors against the inline `style` strings the app emits — non-invasive (no className
// plumbing needed) and only kicks in below 640px. Anything still feeling chunky on phone is a candidate
// for a more targeted media-query rule here, NOT a state-tracked layout split (which would cost a re-render).
const mobileCSS = `
@media (max-width: 640px) {
  /* Global font baseline — slightly smaller body text on phones */
  body, .viv-mobile-root { font-size: 14px; }
  h1 { font-size: 1.35rem !important; line-height: 1.2 !important; letter-spacing: -0.03em !important; }
  h2 { font-size: 1rem !important; line-height: 1.25 !important; }

  /* Phone: hide the top page-nav tabs (Dashboard/Journal/Premium tools/Settings) and the Sign out button for a cleaner mobile header */
  .navbar .tabs { display: none !important; }
  .navbar button[title="Sign out"] { display: none !important; }

  /* Phone: hide the floating guide narrator panel (corner voiceover/explainer) — too distracting on small screens */
  .guidepanel { display: none !important; }

  /* Large card paddings → compact */
  [style*='padding: "32px 28px"'],
  [style*='padding: "30px 32px"'],
  [style*='padding: "28px 32px"'],
  [style*='padding: "24px 32px"'],
  [style*='padding: "24px 28px"'] { padding: 14px 14px !important; }
  [style*='padding: "22px 28px"'],
  [style*='padding: "20px 24px"'],
  [style*='padding: "18px 24px"'],
  [style*='padding: "18px 22px"'] { padding: 12px 14px !important; }
  [style*='padding: "16px 18px"'],
  [style*='padding: "14px 16px"'] { padding: 10px 12px !important; }

  /* Generous grid / flex gaps → tighter */
  [style*='gap: 24'] { gap: 10px !important; }
  [style*='gap: 22'],
  [style*='gap: 20'] { gap: 10px !important; }
  [style*='gap: 18'],
  [style*='gap: 16'] { gap: 8px !important; }
  [style*='gap: 14'] { gap: 8px !important; }

  /* Bottom margins between sections → tighter */
  [style*='marginBottom: 28'],
  [style*='marginBottom: 24'],
  [style*='marginBottom: 22'],
  [style*='marginBottom: 20'] { margin-bottom: 14px !important; }

  /* Tables: compact rows + smaller font (most tables already scroll horizontally) */
  table th, table td { padding: 5px 4px !important; font-size: 0.62rem !important; }

  /* StatTile cluster — minmax 168px is too tight for phone; let them stack 2-up */
  [style*='gridTemplateColumns: "repeat(auto-fit, minmax(168px'],
  [style*='gridTemplateColumns: "repeat(auto-fit, minmax(150px'],
  [style*='gridTemplateColumns: "repeat(auto-fit, minmax(160px'] {
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 8px !important;
  }

  /* Big hero numbers (1.5rem+, 2rem) → scale down */
  [style*='fontSize: "2rem"'] { font-size: 1.4rem !important; }
  [style*='fontSize: "1.8rem"'] { font-size: 1.3rem !important; }
  [style*='fontSize: "1.5rem"'] { font-size: 1.15rem !important; }
}
@media (max-width: 420px) {
  /* Tiniest phones — make stat tiles single-column so labels and big numbers stay readable */
  [style*='gridTemplateColumns: "repeat(auto-fit, minmax(168px'],
  [style*='gridTemplateColumns: "repeat(auto-fit, minmax(150px'],
  [style*='gridTemplateColumns: "repeat(auto-fit, minmax(160px'] {
    grid-template-columns: 1fr 1fr !important;
  }
}
`;

// ─── Animated app background — calm grid + drifting particles + cursor glow ───
const appBgCSS = `
.viv-bg-particle{position:absolute;border-radius:50%;background:rgba(240,192,80,0.6);animation-name:vivFloat;animation-timing-function:ease-in-out;animation-iteration-count:infinite;will-change:transform,opacity;}
@keyframes vivFloat{0%,100%{transform:translateY(0) translateX(0);opacity:0.12;}25%{transform:translateY(-16px) translateX(7px);opacity:0.45;}50%{transform:translateY(-8px) translateX(-5px);opacity:0.26;}75%{transform:translateY(-22px) translateX(9px);opacity:0.6;}}
.viv-bg-pulse{position:absolute;border-radius:50%;animation:vivPulse 8s ease-in-out infinite;will-change:opacity,transform;}
@keyframes vivPulse{0%,100%{opacity:0.05;transform:translate(-50%,-50%) scale(0.85);}50%{opacity:0.15;transform:translate(-50%,-50%) scale(1.12);}}

/* ─── Shared motion system — purposeful, ease-out, gold-native ─── */
@keyframes vivFadeUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
@keyframes vivFadeIn{from{opacity:0;}to{opacity:1;}}
@keyframes vivScaleIn{from{opacity:0;transform:scale(0.97);}to{opacity:1;transform:scale(1);}}
@keyframes vivSheen{0%{transform:translateX(-130%) skewX(-18deg);}100%{transform:translateX(240%) skewX(-18deg);}}
/* Page / tab transition — confident ease-out reveal (snappy) */
.viv-page-enter{animation:vivFadeUp 0.30s cubic-bezier(0.22,1,0.36,1) backwards;}
/* Stat-tile entrance — staggered so a grid reveals as a wave (pairs with the count-up) */
.viv-tile-enter{animation:vivFadeUp 0.38s cubic-bezier(0.22,1,0.36,1) both;will-change:transform,opacity;}
.viv-tile-enter:nth-child(1){animation-delay:0.00s}
.viv-tile-enter:nth-child(2){animation-delay:0.04s}
.viv-tile-enter:nth-child(3){animation-delay:0.08s}
.viv-tile-enter:nth-child(4){animation-delay:0.12s}
.viv-tile-enter:nth-child(5){animation-delay:0.16s}
.viv-tile-enter:nth-child(6){animation-delay:0.20s}
.viv-tile-enter:nth-child(7){animation-delay:0.24s}
.viv-tile-enter:nth-child(8){animation-delay:0.28s}
/* Gold sheen sweep — runs once on hover over the primary CTA */
.viv-sheen{position:relative;overflow:hidden;}
.viv-sheen .viv-btn-sheen{position:absolute;top:0;left:0;height:100%;width:42%;background:linear-gradient(100deg,transparent,rgba(255,255,255,0.45),transparent);transform:translateX(-130%) skewX(-18deg);pointer-events:none;opacity:0;}
.viv-sheen:hover .viv-btn-sheen{opacity:1;animation:vivSheen 0.6s cubic-bezier(0.22,1,0.36,1);}
/* Hover lift for interactive cards (stat tiles) */
.viv-lift{transition:transform 0.22s cubic-bezier(0.22,1,0.36,1), box-shadow 0.22s ease, border-color 0.22s ease;}
.viv-lift:hover{transform:translateY(-3px);box-shadow:0 12px 30px rgba(0,0,0,0.38), 0 0 0 1px rgba(201,152,42,0.20);border-color:rgba(201,152,42,0.28);}
/* a11y: visible keyboard focus ring (mouse/touch users unaffected — :focus-visible only fires for keyboard) */
:focus-visible{outline:2px solid rgba(240,192,80,0.85) !important;outline-offset:2px;border-radius:4px;}
/* Faster, cleaner taps: removes the 300ms mobile tap delay on interactive elements */
button,a,[role="button"],input[type="range"],summary{touch-action:manipulation;}

/* Accessibility — honor reduced-motion: kill decorative motion, keep instant state changes */
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{animation-duration:0.001ms !important;animation-iteration-count:1 !important;animation-delay:0ms !important;transition-duration:0.001ms !important;scroll-behavior:auto !important;}
  .viv-bg-particle,.viv-bg-pulse{animation:none !important;}
}
`;
function AppBackground({ intensity = "calm" }) {
  const serene = intensity === "serene";
  const glowRef = useRef(null);
  useEffect(() => {
    // Direct GPU-transform tracking via ref — no React re-render, no CSS transition lag.
    let raf = null, px = -800, py = -800;
    const onMove = (e) => {
      px = e.clientX; py = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        if (glowRef.current) glowRef.current.style.transform = `translate(${px}px,${py}px) translate(-50%,-50%)`;
        raf = null;
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => { window.removeEventListener("mousemove", onMove); if (raf) cancelAnimationFrame(raf); };
  }, []);
  const count = serene ? 40 : 20;
  const particles = useMemo(() => Array.from({ length: count }, (_, i) => ({
    left: `${(i * 39 + 7) % 100}%`, top: `${(i * 27 + 13) % 100}%`,
    delay: `${((i * 0.71) % 7).toFixed(2)}s`, dur: `${(serene ? 6 : 9) + (i % 6) * 2}s`,
    size: serene && i % 3 === 0 ? 3.5 : 2.5,
  })), [count, serene]);
  const pulses = serene ? [
    { left: "16%", top: "24%", size: 420, delay: "0s" },
    { left: "84%", top: "70%", size: 480, delay: "2.6s" },
    { left: "62%", top: "12%", size: 360, delay: "4.8s" },
  ] : [];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
      <style>{appBgCSS}</style>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(to right, rgba(255,255,255,0.022) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.022) 1px, transparent 1px)", backgroundSize: "44px 44px", maskImage: "radial-gradient(ellipse at center, rgba(0,0,0,0.55), transparent 82%)", WebkitMaskImage: "radial-gradient(ellipse at center, rgba(0,0,0,0.55), transparent 82%)" }} />
      {pulses.map((pl, i) => <div key={`pl${i}`} className="viv-bg-pulse" style={{ left: pl.left, top: pl.top, width: pl.size, height: pl.size, animationDelay: pl.delay, background: "radial-gradient(circle, rgba(201,152,42,0.5), transparent 70%)" }} />)}
      {particles.map((p, i) => <div key={i} className="viv-bg-particle" style={{ left: p.left, top: p.top, width: p.size, height: p.size, animationDelay: p.delay, animationDuration: p.dur }} />)}
      <div ref={glowRef} style={{ position: "absolute", left: 0, top: 0, width: serene ? 620 : 520, height: serene ? 620 : 520, borderRadius: "50%", background: `radial-gradient(circle, rgba(201,152,42,${serene ? 0.055 : 0.04}), rgba(201,152,42,0.016) 38%, transparent 70%)`, transform: "translate(-800px,-800px) translate(-50%,-50%)", willChange: "transform" }} />
    </div>
  );
}

const NAV = [
  { id: "dashboard", label: "Dashboard" },
  { id: "journal", label: "Journal" },
  { id: "tools", label: "Tools" },
  { id: "settings", label: "Settings" },
];


function AppInner() {
  // Inject the global mobile-responsive stylesheet once on mount. Lives in <head> for the lifetime of
  // the app (no cleanup — removing it would just bounce the UI for nothing).
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (document.getElementById("viv-mobile-css")) return;
    const tag = document.createElement("style");
    tag.id = "viv-mobile-css";
    tag.textContent = mobileCSS;
    document.head.appendChild(tag);
  }, []);
  const screenW = useScreenWidth();
  const isMobile = screenW < 768;
  const isTablet = screenW >= 768 && screenW < 1024;

  // ─── Auth State ───
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Always land at the top when switching tabs (Dashboard / Journal / Tools / Settings). The mobile and
  // desktop shells scroll at the window level, so a fresh page must reset the scroll position.
  useEffect(() => { try { window.scrollTo(0, 0); document.scrollingElement && (document.scrollingElement.scrollTop = 0); } catch {} }, [page]);

  // ─── Data State (starts with defaults, loaded from Supabase after auth) ───
  const [setupTypes, setSetupTypes] = useState(DEFAULT_SETUP_TYPES);
  const [tags, setTags] = useState(DEFAULT_TAGS);
  const [exitReasons, setExitReasons] = useState(DEFAULT_EXIT_REASONS);
  const [journaledTrades, setJournaledTrades] = useState([]);
  const [positions, setPositions] = useState([]);
  const [portfolioSize, setPortfolioSize] = useState("500000");

  // ─── IBKR sync (read-only preview — Phase 1) ───
  const [ibkrOpen, setIbkrOpen] = useState(false);
  const [ibkrStatus, setIbkrStatus] = useState("idle");
  const [ibkrData, setIbkrData] = useState(null);
  const [ibkrError, setIbkrError] = useState(null);
  const [ibkrResult, setIbkrResult] = useState(null);
  // Set of ib_exec_ids that exist in the trades table with is_deleted=true. The matcher uses this to skip
  // re-importing rows the user previously cleaned up — the unique constraint trades_user_ib_exec applies
  // to soft-deleted rows too (the physical row stays), so without this we'd hit the constraint and the
  // sync UI shows ugly "duplicate key" errors. Tracked here so the matcher can classify them as "synced".
  const [softDeletedExecIds, setSoftDeletedExecIds] = useState(() => new Set());
  // Whether the positions.intraday_log column has been added to the DB schema. Detected on first load
  // (by checking whether the field appears in a SELECT * result). If FALSE, the bulk Save and IBKR sync
  // writers MUST NOT include intraday_log in the row payload — Supabase would reject the whole insert
  // with "column does not exist" and the user would lose every position. This makes the code safe to
  // deploy BEFORE the SQL migration is run. State (not ref) so children re-render once detection flips.
  const [intradayColumnAvailable, setIntradayColumnAvailable] = useState(false);
  const intradayColumnAvailableRef = useRef(false); // mirror ref for the save mapper (synchronous reads)
  // Reactive feature flag (per browser, persisted in localStorage). Settings → Beta Features toggle
  // updates it. Replaces the DevTools `localStorage.setItem` flow — members can opt in via UI.
  const [intradayFeatureEnabled, setIntradayFeatureEnabled] = useState(INTRADAY_FEATURE_DEFAULT);
  const toggleIntradayFeature = useCallback((on) => {
    try {
      if (on) localStorage.setItem("viv-intraday-enabled", "1");
      else localStorage.removeItem("viv-intraday-enabled");
    } catch { /* private mode or quota — ignore */ }
    setIntradayFeatureEnabled(!!on);
  }, []);
  // ─── Integrity Checker (read-only scan) ───
  // Pure scan of already-loaded state — no DB writes, no network. Triggered on demand from Settings.
  // Even though the scan is sub-millisecond, we briefly flip `running` so the button shows a "Scanning…"
  // state — confirms the click registered and gives the user visual feedback.
  const [integrityReport, setIntegrityReport] = useState(null);
  const [integrityOpen, setIntegrityOpen] = useState(false);
  const [integrityRunning, setIntegrityRunning] = useState(false);
  const runIntegrityCheck = useCallback(() => {
    setIntegrityRunning(true);
    setTimeout(() => {
      const report = runIntegrityChecks({ journaledTrades, positions, softDeletedExecIds });
      setIntegrityReport(report);
      setIntegrityOpen(true);
      setIntegrityRunning(false);
    }, 200);
  }, [journaledTrades, positions, softDeletedExecIds]);
  // ─── Undo last sync ───
  // Single-deep stack. Persisted to localStorage keyed by userId; expires 24h after the sync.
  // Captures only the rows the sync touched (inserts by id, soft-deletes by id, closes with prior is_closed value).
  // Reverse: soft-delete inserts (recoverable), set is_deleted=false on softs, set is_closed=false on closes.
  const [lastSync, setLastSync] = useState(null);
  const undoStorageKey = useMemo(() => session?.user?.id ? `viv-ibkr-undo-${session.user.id}` : null, [session]);
  useEffect(() => {
    if (!undoStorageKey) { setLastSync(null); return; }
    try {
      const raw = localStorage.getItem(undoStorageKey);
      if (!raw) { setLastSync(null); return; }
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.userId !== session.user.id) { setLastSync(null); return; }
      if (parsed.expiresAt && Date.parse(parsed.expiresAt) < Date.now()) {
        localStorage.removeItem(undoStorageKey);
        setLastSync(null);
        return;
      }
      setLastSync(parsed);
    } catch { setLastSync(null); }
  }, [undoStorageKey, session]);
  const persistUndoLog = useCallback((audit) => {
    if (!undoStorageKey) return;
    try { localStorage.setItem(undoStorageKey, JSON.stringify(audit)); }
    catch { /* quota — drop silently rather than break the sync */ }
  }, [undoStorageKey]);
  const runIbkrSync = useCallback(async () => {
    setIbkrOpen(true); setIbkrStatus("loading"); setIbkrError(null); setIbkrData(null); setIbkrResult(null);
    try {
      const uid = session?.user?.id;
      // Pull the user's ignore list fresh each sync — no in-memory cache to go stale if Settings was just edited.
      let ignoreTickers = new Set();
      if (uid) {
        const { data: ig } = await supabase.from("user_settings").select("setting_value").eq("user_id", uid).eq("setting_key", "ibkr_ignore_tickers").maybeSingle();
        if (ig && ig.setting_value) {
          String(ig.setting_value).split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean).forEach(t => ignoreTickers.add(t));
        }
      }
      const res = await fetch("/api/ibkr-sync", { headers: { Authorization: `Bearer ${session?.access_token || ""}` } });
      const json = await res.json();
      if (!json.ok) { setIbkrStatus("error"); setIbkrError(json.error || "Sync failed."); return; }
      setIbkrData(buildIbkrPreview(json, positions, journaledTrades, softDeletedExecIds, ignoreTickers));
      setIbkrStatus("preview");
    } catch (e) {
      setIbkrStatus("error");
      setIbkrError("Couldn't reach the sync service. Note: the /api function only runs on the deployed site (valensontrades.com), not in local dev.");
    }
  }, [positions, journaledTrades, session, softDeletedExecIds]);

  // Phase 2 — surgical writes from the confirmed preview. INSERT new IBKR rows, UPDATE matched rows by id only.
  // Never deletes; reconcile updates only the factual columns so notes/tags/setup/stops are preserved.
  const confirmIbkrSync = useCallback(async (posRows, tradeRows, closeRows = [], partialRows = [], dupeGroups = [], intradayMatches = []) => {
    const uid = session?.user?.id;
    if (!uid) { setIbkrStatus("error"); setIbkrError("Not signed in."); return; }
    setIbkrStatus("writing");
    const nowIso = new Date().toISOString();
    const res = { tInserted: 0, tReconciled: 0, tUpdated: 0, pInserted: 0, pReconciled: 0, pUpdated: 0, pClosed: 0, partialsInserted: 0, dupesResolved: 0, dupesDeleted: 0, intradayReconciled: 0, errors: [] };
    // execIds of closing round-trips that actually land in the Journal this sync — the gate for auto-close.
    const journaledExecIds = new Set();

    // ─── UNDO AUDIT CAPTURE ─── snapshot every row this sync will UPDATE *before* we touch it, so Undo can
    // restore the exact prior values. Insert/close/soft-delete reverts only need the ids (Undo soft-deletes
    // inserts, re-opens closed positions, un-soft-deletes the duplicates). If the snapshot SELECT fails we
    // abort the sync rather than write something we can't reverse — Tier 4 safety.
    const updTradeIds = [
      ...tradeRows.filter(r => (r.choice === "reconcile" || r.choice === "update") && r.matchId).map(r => r.matchId),
      ...(partialRows || []).filter(r => r.choice === "reconcile" && r.matchId).map(r => r.matchId),
    ];
    const updPosIds = posRows.filter(r => (r.choice === "reconcile" || r.choice === "update") && r.matchId).map(r => r.matchId);
    const closePosIds = (closeRows || []).filter(r => r.choice === "close").map(r => r.posId);
    const dupeTradeIds = (dupeGroups || []).flatMap(g => g.choice === "delete-ibkr" ? g.ibkrRows.map(r => r.id) : g.choice === "delete-manual" ? [g.manualId] : []);
    const beforeTrades = {};
    const beforePositions = {};
    const allTradeIdsToSnapshot = [...new Set([...updTradeIds, ...dupeTradeIds])];
    const allPosIdsToSnapshot = [...new Set([...updPosIds, ...closePosIds])];
    if (allTradeIdsToSnapshot.length) {
      const { data: snap, error } = await supabase.from("trades").select("*").in("id", allTradeIdsToSnapshot).eq("user_id", uid);
      if (error) { setIbkrStatus("error"); setIbkrError("Couldn't snapshot before-state for Undo. Sync cancelled (no data changed)."); return; }
      (snap || []).forEach(t => { beforeTrades[t.id] = t; });
    }
    if (allPosIdsToSnapshot.length) {
      const { data: snap, error } = await supabase.from("positions").select("*").in("id", allPosIdsToSnapshot).eq("user_id", uid);
      if (error) { setIbkrStatus("error"); setIbkrError("Couldn't snapshot before-state for Undo. Sync cancelled (no data changed)."); return; }
      (snap || []).forEach(p => { beforePositions[p.id] = p; });
    }
    const audit = {
      syncId: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
      userId: uid,
      syncedAt: nowIso,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      tradesInserted: [],
      tradesUpdated: [],   // [{ id, before }]
      positionsInserted: [],
      positionsUpdated: [],
      positionsClosed: [], // [{ id, before }] — before.is_closed lets us restore exactly
      tradesSoftDeleted: [],
      intradayReconciled: [], // [{ positionId, eventId }] — Undo clears reconciledExecId on these
    };

    // ── TRADES ── updates first (by id), then bulk insert new
    const tradeInserts = [];
    for (const r of tradeRows) {
      if (r.action === "synced" && r.execId) journaledExecIds.add(r.execId); // already journaled by a prior sync
      if (r.choice === "skip") continue;
      if (r.choice === "new") {
        tradeInserts.push({ user_id: uid, ticker: r.ticker, entry_date: r.entry, entry_time: r.entryTime || "", exit_date: r.exit, exit_time: r.exitTime || "", entry_price: r.entryP, exit_price: r.exitP, shares: r.shares, commission: r.commission, pl_pct: r.plPct, pl_dollar: r.plDollar, r_mult: null, setup: "", tags: [], exit_reason: "", notes: "", trade_type: r.tradeType, source: "ibkr", ib_exec_id: r.execId, ib_trade_id: r.tradeId, ib_synced_at: nowIso, is_deleted: false });
      } else if ((r.choice === "reconcile" || r.choice === "update") && r.matchId) {
        let rMult; // undefined = leave the column as-is
        if (r.choice === "reconcile" && r.matchStop > 0) {
          const rps = r.tradeType === "Long" ? (r.entryP - r.matchStop) : (r.matchStop - r.entryP);
          if (rps > 0) { const pps = r.tradeType === "Long" ? (r.exitP - r.entryP) : (r.entryP - r.exitP); rMult = +(pps / rps).toFixed(2); }
        }
        const upd = { entry_date: r.entry, entry_time: r.entryTime || "", exit_date: r.exit, exit_time: r.exitTime || "", entry_price: r.entryP, exit_price: r.exitP, shares: r.shares, commission: r.commission, pl_pct: r.plPct, pl_dollar: r.plDollar, trade_type: r.tradeType, ib_exec_id: r.execId, ib_trade_id: r.tradeId, ib_synced_at: nowIso };
        if (r.choice === "reconcile") upd.source = "reconciled"; // "update" (re-sync) leaves source as-is
        if (rMult !== undefined) upd.r_mult = rMult;
        const { error } = await supabase.from("trades").update(upd).eq("id", r.matchId).eq("user_id", uid);
        if (error) { res.errors.push(`trade ${r.ticker}: ${error.message}`); }
        else {
          if (r.choice === "reconcile") res.tReconciled++; else res.tUpdated++;
          if (r.execId) journaledExecIds.add(r.execId);
          if (beforeTrades[r.matchId]) audit.tradesUpdated.push({ id: r.matchId, before: beforeTrades[r.matchId] });
          setJournaledTrades(prev => prev.map(t => t.id === r.matchId ? { ...t, entry: r.entry, entryTime: r.entryTime || "", exit: r.exit, exitTime: r.exitTime || "", entryP: r.entryP, exitP: r.exitP, shares: r.shares, commission: r.commission, plPct: r.plPct, plDollar: r.plDollar, ...(rMult !== undefined ? { rMult } : {}), tradeType: r.tradeType, source: r.choice === "reconcile" ? "reconciled" : t.source, ibExecId: r.execId, ibTradeId: r.tradeId } : t));
        }
      }
    }
    if (tradeInserts.length) {
      const { data: ins, error } = await supabase.from("trades").insert(tradeInserts).select("*");
      if (error) { res.errors.push(`new trades: ${error.message}`); }
      else if (ins) {
        res.tInserted = ins.length;
        ins.forEach(t => { if (t.ib_exec_id) journaledExecIds.add(t.ib_exec_id); audit.tradesInserted.push(t.id); });
        const mapped = ins.map(t => ({ id: t.id, ticker: t.ticker, entry: t.entry_date, entryTime: t.entry_time || "", exit: t.exit_date, exitTime: t.exit_time || "", entryP: t.entry_price, exitP: t.exit_price, shares: t.shares, stop: t.stop_price, setup: t.setup, tags: t.tags || [], plPct: t.pl_pct, plDollar: t.pl_dollar, rMult: t.r_mult, reason: t.exit_reason, commission: t.commission != null ? t.commission : 0, notes: t.notes || "", chartUrl: t.chart_url || "", chartImage: t.chart_image || "", tradeType: t.trade_type || "Long", source: t.source || "ibkr", ibExecId: t.ib_exec_id || null, ibTradeId: t.ib_trade_id || null, positionId: t.position_id || null }));
        setJournaledTrades(prev => [...mapped, ...prev]);
      }
    }

    // ── POSITIONS ──
    const posInserts = [];
    for (const r of posRows) {
      if (r.choice === "skip") continue;
      if (r.choice === "new") {
        posInserts.push({ user_id: uid, symbol: r.sym, entry_date: r.entry, entry_time: r.entryTime || "", shares: String(r.shares), entry_price: String(r.ep), current_price: r.cp || "", stop_price: "", stop_price_2: "", trailing_stop: "", setup: "", tags: [], commission: null, notes: "", chart_url: "", chart_image: "", trade_type: r.tradeType, source: "ibkr", ib_conid: r.conid, ib_synced_at: nowIso });
      } else if ((r.choice === "reconcile" || r.choice === "update") && r.matchId) {
        const upd = { symbol: r.sym, entry_date: r.entry, entry_time: r.entryTime || "", shares: String(r.shares), entry_price: String(r.ep), trade_type: r.tradeType, ib_conid: r.conid, ib_synced_at: nowIso };
        if (r.choice === "reconcile") upd.source = "reconciled"; // "update" (re-sync) leaves source as-is
        const { error } = await supabase.from("positions").update(upd).eq("id", r.matchId).eq("user_id", uid);
        if (error) { res.errors.push(`position ${r.sym}: ${error.message}`); }
        else {
          if (r.choice === "reconcile") res.pReconciled++; else res.pUpdated++;
          if (beforePositions[r.matchId]) audit.positionsUpdated.push({ id: r.matchId, before: beforePositions[r.matchId] });
          setPositions(prev => prev.map(p => p.id === r.matchId ? { ...p, sym: r.sym, entry: r.entry, entryTime: r.entryTime || "", shares: String(r.shares), ep: String(r.ep), tradeType: r.tradeType, source: r.choice === "reconcile" ? "reconciled" : p.source, ibConid: r.conid } : p));
        }
      }
    }
    if (posInserts.length) {
      const { data: ins, error } = await supabase.from("positions").insert(posInserts).select("*");
      if (error) { res.errors.push(`new positions: ${error.message}`); }
      else if (ins) {
        res.pInserted = ins.length;
        ins.forEach(p => audit.positionsInserted.push(p.id));
        const mapped = ins.map(p => ({ id: p.id, _lid: 1e9 + (p.id || 0), sym: p.symbol, entry: p.entry_date, entryTime: p.entry_time || "", shares: p.shares, ep: p.entry_price, cp: p.current_price, stop: p.stop_price, stop2: p.stop_price_2, trailStop: p.trailing_stop || "", setup: p.setup, tags: p.tags || [], comm: p.commission != null ? String(p.commission) : "", notes: p.notes || "", chartUrl: p.chart_url || "", chartImage: p.chart_image || "", tradeType: p.trade_type || "Long", source: p.source || "ibkr", ibConid: p.ib_conid || null, ibSyncedAt: p.ib_synced_at || null, intradayLog: normalizeIntradayLog(p.intraday_log) }));
        setPositions(prev => [...prev, ...mapped]);
        lastLoadedCount.current = (lastLoadedCount.current || 0) + mapped.length;
      }
    }

    // ── PARTIAL SELLS ── if matched to a manual Sell-button trim → UPDATE (reconcile, keep notes/tags,
    // stamp ib_exec_id so future syncs are no-ops). Otherwise → INSERT new. Dedup is by ib_exec_id once
    // imported. Each partial's entry_date = the lot's open date, so realizedByPosition on the dashboard
    // attributes it to the still-open position.
    const partialInserts = [];
    for (const r of (partialRows || [])) {
      if (r.choice === "skip" || r.action === "synced") continue;
      if (r.choice === "reconcile" && r.matchId) {
        let rMult;
        if (r.matchStop > 0) {
          const rps = r.tradeType === "Long" ? (r.entryP - r.matchStop) : (r.matchStop - r.entryP);
          if (rps > 0) { const pps = r.tradeType === "Long" ? (r.exitP - r.entryP) : (r.entryP - r.exitP); rMult = +(pps / rps).toFixed(2); }
        }
        const upd = { entry_date: r.entry, entry_time: r.entryTime || "", exit_date: r.exit, exit_time: r.exitTime || "", entry_price: r.entryP, exit_price: r.exitP, shares: r.shares, commission: r.commission, pl_pct: r.plPct, pl_dollar: r.plDollar, trade_type: r.tradeType, ib_exec_id: r.execId, ib_trade_id: r.tradeId, ib_synced_at: nowIso, source: "reconciled" };
        if (rMult !== undefined) upd.r_mult = rMult;
        const { error } = await supabase.from("trades").update(upd).eq("id", r.matchId).eq("user_id", uid);
        if (error) { res.errors.push(`partial ${r.ticker}: ${error.message}`); }
        else {
          res.tReconciled++;
          if (beforeTrades[r.matchId]) audit.tradesUpdated.push({ id: r.matchId, before: beforeTrades[r.matchId] });
          setJournaledTrades(prev => prev.map(t => t.id === r.matchId ? { ...t, entry: r.entry, entryTime: r.entryTime || "", exit: r.exit, exitTime: r.exitTime || "", entryP: r.entryP, exitP: r.exitP, shares: r.shares, commission: r.commission, plPct: r.plPct, plDollar: r.plDollar, ...(rMult !== undefined ? { rMult } : {}), tradeType: r.tradeType, source: "reconciled", ibExecId: r.execId, ibTradeId: r.tradeId } : t));
        }
        continue;
      }
      if (r.choice !== "new") continue;
      // Option C — auto-link this partial to the currently-open position of the same ticker, if any.
      // Partials by definition come from a still-open lot, so a matching open position MUST exist.
      // Falls back to null (legacy heuristic match) if the user closed the lot manually before the sync ran.
      const linkedPos = (positions || []).find(p => (p.sym || "").toUpperCase() === (r.ticker || "").toUpperCase());
      partialInserts.push({ user_id: uid, ticker: r.ticker, entry_date: r.entry, entry_time: r.entryTime || "", exit_date: r.exit, exit_time: r.exitTime || "", entry_price: r.entryP, exit_price: r.exitP, shares: r.shares, commission: r.commission, pl_pct: r.plPct, pl_dollar: r.plDollar, r_mult: null, setup: "", tags: [], exit_reason: "Partial Trim", notes: "", trade_type: r.tradeType, source: "ibkr", ib_exec_id: r.execId, ib_trade_id: r.tradeId, ib_synced_at: nowIso, is_deleted: false, position_id: linkedPos ? linkedPos.id : null });
    }
    if (partialInserts.length) {
      const { data: ins, error } = await supabase.from("trades").insert(partialInserts).select("*");
      if (error) { res.errors.push(`partial sells: ${error.message}`); }
      else if (ins) {
        res.partialsInserted = ins.length;
        ins.forEach(t => audit.tradesInserted.push(t.id));
        const mapped = ins.map(t => ({ id: t.id, ticker: t.ticker, entry: t.entry_date, entryTime: t.entry_time || "", exit: t.exit_date, exitTime: t.exit_time || "", entryP: t.entry_price, exitP: t.exit_price, shares: t.shares, stop: t.stop_price, setup: t.setup, tags: t.tags || [], plPct: t.pl_pct, plDollar: t.pl_dollar, rMult: t.r_mult, reason: t.exit_reason, commission: t.commission != null ? t.commission : 0, notes: t.notes || "", chartUrl: t.chart_url || "", chartImage: t.chart_image || "", tradeType: t.trade_type || "Long", source: t.source || "ibkr", ibExecId: t.ib_exec_id || null, ibTradeId: t.ib_trade_id || null, positionId: t.position_id || null }));
        setJournaledTrades(prev => [...mapped, ...prev]);
      }
    }

    // ── CLOSE-OUTS ── soft-archive (is_closed=true, NOT a delete) positions IBKR has closed.
    // JOURNAL-FIRST SAFETY: only archive once the closing round-trip is confirmed present in the Journal
    // (its execId is in journaledExecIds). If the user skipped that trade, the position is left open — never
    // orphaned. The update is surgical (by row id + user_id) and only ever targets IBKR-owned rows.
    const archivedPosIds = new Set();
    for (const r of (closeRows || [])) {
      if (r.choice !== "close") continue;                                    // user chose "Keep open"
      if (!r.linkExecId || !journaledExecIds.has(r.linkExecId)) continue;    // not in the Journal → leave it open
      const { error } = await supabase.from("positions").update({ is_closed: true, ib_synced_at: nowIso }).eq("id", r.posId).eq("user_id", uid);
      if (error) { res.errors.push(`close ${r.sym}: ${error.message}`); }
      else { res.pClosed++; archivedPosIds.add(r.posId); if (beforePositions[r.posId]) audit.positionsClosed.push({ id: r.posId, before: beforePositions[r.posId] }); }
    }
    if (archivedPosIds.size) {
      setPositions(prev => { const next = prev.filter(p => !archivedPosIds.has(p.id)); positionsRef.current = next; return next; });
      lastLoadedCount.current = Math.max(0, (lastLoadedCount.current || 0) - archivedPosIds.size);
    }

    // ── EXISTING-DUPLICATE CLEANUP ── soft-delete (is_deleted=true, recoverable) the rows the user marked
    // as duplicates. delete-ibkr → wipe the IBKR-side rows · delete-manual → wipe the manual aggregate · skip → no-op.
    // Surgical update by id + user_id; never touches anything the user didn't pick.
    const deletedTradeIds = new Set();
    for (const g of (dupeGroups || [])) {
      if (g.choice === "skip") continue;
      const ids = g.choice === "delete-ibkr" ? g.ibkrRows.map(r => r.id) : g.choice === "delete-manual" ? [g.manualId] : [];
      if (!ids.length) continue;
      const { error } = await supabase.from("trades").update({ is_deleted: true }).in("id", ids).eq("user_id", uid);
      if (error) { res.errors.push(`cleanup ${g.ticker}: ${error.message}`); }
      else { res.dupesResolved++; res.dupesDeleted += ids.length; ids.forEach(id => { deletedTradeIds.add(id); audit.tradesSoftDeleted.push(id); }); }
    }
    if (deletedTradeIds.size) {
      // Capture the ib_exec_ids of the rows we just soft-deleted, so the matcher won't try to re-import
      // them on the very next sync (which would hit the unique constraint and surface a DB error to the user).
      const newlyDeletedExecIds = new Set();
      setJournaledTrades(prev => {
        prev.forEach(t => { if (deletedTradeIds.has(t.id) && t.ibExecId) newlyDeletedExecIds.add(t.ibExecId); });
        return prev.filter(t => !deletedTradeIds.has(t.id));
      });
      if (newlyDeletedExecIds.size) setSoftDeletedExecIds(prev => { const next = new Set(prev); newlyDeletedExecIds.forEach(x => next.add(x)); return next; });
    }

    // ─── INTRADAY LOG RECONCILIATION ─── for each match, mark the event with reconciledExecId + reconciledAt.
    // We fetch each affected position's CURRENT intraday_log from the DB first (avoids racing the user's
    // in-memory edits and avoids losing concurrent additions on other devices). Then a single surgical
    // UPDATE per position writes the merged log. Failures push to res.errors but never abort the rest of
    // the sync — the journal partials have already been written above.
    if (Array.isArray(intradayMatches) && intradayMatches.length > 0 && intradayColumnAvailableRef.current) {
      const byPos = {};
      intradayMatches.forEach(m => { (byPos[m.positionId] = byPos[m.positionId] || []).push(m); });
      for (const [posIdStr, matches] of Object.entries(byPos)) {
        const posId = Number(posIdStr);
        const { data: row, error: fetchErr } = await supabase.from("positions").select("intraday_log").eq("id", posId).eq("user_id", uid).single();
        if (fetchErr || !row) { res.errors.push(`intraday fetch ${posId}: ${fetchErr ? fetchErr.message : "row not found"}`); continue; }
        const currentLog = normalizeIntradayLog(row.intraday_log);
        const recIso = new Date().toISOString();
        let touchedCount = 0;
        const updatedEvents = (currentLog.events || []).map(ev => {
          const m = matches.find(x => x.eventId === ev.id);
          if (m && !ev.reconciledExecId) { touchedCount++; return { ...ev, reconciledExecId: m.execId, reconciledAt: recIso }; }
          return ev;
        });
        if (touchedCount === 0) continue;
        const nextLog = { ...currentLog, events: updatedEvents, lastReconciledAt: recIso };
        const { error: updErr } = await supabase.from("positions").update({ intraday_log: nextLog }).eq("id", posId).eq("user_id", uid);
        if (updErr) { res.errors.push(`intraday update ${posId}: ${updErr.message}`); continue; }
        res.intradayReconciled += touchedCount;
        matches.forEach(m => audit.intradayReconciled.push({ positionId: posId, eventId: m.eventId }));
        setPositions(prev => prev.map(p => p.id === posId ? { ...p, intradayLog: nextLog } : p));
      }
    }

    // Persist audit log + result. Only persist if SOMETHING was actually written (avoids "Undo" appearing
    // after an all-skip preview).
    const wroteSomething = audit.tradesInserted.length || audit.tradesUpdated.length || audit.positionsInserted.length || audit.positionsUpdated.length || audit.positionsClosed.length || audit.tradesSoftDeleted.length || audit.intradayReconciled.length;
    if (wroteSomething) {
      audit.label = `Sync ${audit.syncedAt.slice(0, 16).replace("T", " ")} · ${res.tInserted + res.partialsInserted} new · ${res.tReconciled} reconciled · ${res.pClosed} closed · ${res.dupesDeleted} cleaned`;
      persistUndoLog(audit);
      setLastSync(audit);
      res.syncId = audit.syncId;
    }
    setIbkrResult(res);
    setIbkrStatus("done");
  }, [session, persistUndoLog]);

  // ─── Undo Last Sync ─── reverses the most recent confirmed sync. Soft-delete inserts (recoverable),
  // restore updated rows to their captured before-state, set is_deleted=false on auto-cleaned dupes,
  // set is_closed=false on auto-archived positions. All updates are scoped by user_id. Per-row try/catch
  // so one failure doesn't abort the whole undo. After success we clear the audit log; no double-undo.
  const [undoStatus, setUndoStatus] = useState("idle"); // idle | running | done
  const [undoResult, setUndoResult] = useState(null);
  const undoLastSync = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid || !lastSync || lastSync.userId !== uid) return;
    if (undoStatus === "running") return;
    setUndoStatus("running"); setUndoResult(null);
    const r = { tradesReinserted: 0, tradesRestored: 0, positionsReinserted: 0, positionsRestored: 0, positionsReopened: 0, tradesUndeleted: 0, errors: [] };
    // 1) Soft-delete the trades this sync INSERTed.
    if (lastSync.tradesInserted.length) {
      const { error } = await supabase.from("trades").update({ is_deleted: true }).in("id", lastSync.tradesInserted).eq("user_id", uid);
      if (error) r.errors.push(`undelete inserts: ${error.message}`); else r.tradesReinserted = lastSync.tradesInserted.length;
    }
    // 2) Restore the trades this sync UPDATEd to their captured before-state. Only restore the columns
    // the sync wrote — judgment columns (notes, tags, setup, stop, exit_reason) the user may have edited
    // SINCE the sync are left alone.
    for (const { id, before } of lastSync.tradesUpdated) {
      const upd = {
        entry_date: before.entry_date, entry_time: before.entry_time, exit_date: before.exit_date, exit_time: before.exit_time,
        entry_price: before.entry_price, exit_price: before.exit_price, shares: before.shares, commission: before.commission,
        pl_pct: before.pl_pct, pl_dollar: before.pl_dollar, r_mult: before.r_mult, trade_type: before.trade_type,
        source: before.source, ib_exec_id: before.ib_exec_id, ib_trade_id: before.ib_trade_id, ib_synced_at: before.ib_synced_at,
      };
      const { error } = await supabase.from("trades").update(upd).eq("id", id).eq("user_id", uid);
      if (error) r.errors.push(`restore trade ${id}: ${error.message}`); else r.tradesRestored++;
    }
    // 3) Soft-archive the positions this sync INSERTed (is_closed=true keeps the record, hides from dashboard).
    if (lastSync.positionsInserted.length) {
      const { error } = await supabase.from("positions").update({ is_closed: true }).in("id", lastSync.positionsInserted).eq("user_id", uid);
      if (error) r.errors.push(`archive inserts: ${error.message}`); else r.positionsReinserted = lastSync.positionsInserted.length;
    }
    // 4) Restore the positions this sync UPDATEd.
    for (const { id, before } of lastSync.positionsUpdated) {
      const upd = { symbol: before.symbol, entry_date: before.entry_date, entry_time: before.entry_time, shares: before.shares, entry_price: before.entry_price, trade_type: before.trade_type, source: before.source, ib_conid: before.ib_conid, ib_synced_at: before.ib_synced_at };
      const { error } = await supabase.from("positions").update(upd).eq("id", id).eq("user_id", uid);
      if (error) r.errors.push(`restore position ${id}: ${error.message}`); else r.positionsRestored++;
    }
    // 5) Re-open auto-closed positions (restore exact prior is_closed + ib_synced_at).
    for (const { id, before } of lastSync.positionsClosed) {
      const { error } = await supabase.from("positions").update({ is_closed: before.is_closed === undefined ? false : before.is_closed, ib_synced_at: before.ib_synced_at }).eq("id", id).eq("user_id", uid);
      if (error) r.errors.push(`reopen position ${id}: ${error.message}`); else r.positionsReopened++;
    }
    // 6) Restore soft-deleted duplicates.
    if (lastSync.tradesSoftDeleted.length) {
      const { error } = await supabase.from("trades").update({ is_deleted: false }).in("id", lastSync.tradesSoftDeleted).eq("user_id", uid);
      if (error) r.errors.push(`restore dupes: ${error.message}`); else r.tradesUndeleted = lastSync.tradesSoftDeleted.length;
    }
    // 6b) Un-reconcile intraday events: clear reconciledExecId / reconciledAt that the sync stamped.
    // Per-position fetch+merge so we don't trample other events the user added since the sync.
    if (Array.isArray(lastSync.intradayReconciled) && lastSync.intradayReconciled.length) {
      const byPos = {};
      lastSync.intradayReconciled.forEach(x => { (byPos[x.positionId] = byPos[x.positionId] || []).push(x.eventId); });
      let unreconciled = 0;
      for (const [posIdStr, eventIds] of Object.entries(byPos)) {
        const posId = Number(posIdStr);
        const { data: row, error: fetchErr } = await supabase.from("positions").select("intraday_log").eq("id", posId).eq("user_id", uid).single();
        if (fetchErr || !row) { r.errors.push(`undo intraday fetch ${posId}: ${fetchErr ? fetchErr.message : "missing"}`); continue; }
        const log = normalizeIntradayLog(row.intraday_log);
        const ids = new Set(eventIds);
        const nextEvents = (log.events || []).map(ev => ids.has(ev.id) ? { ...ev, reconciledExecId: null, reconciledAt: null } : ev);
        const nextLog = { ...log, events: nextEvents };
        const { error: updErr } = await supabase.from("positions").update({ intraday_log: nextLog }).eq("id", posId).eq("user_id", uid);
        if (updErr) { r.errors.push(`undo intraday update ${posId}: ${updErr.message}`); continue; }
        unreconciled += eventIds.length;
      }
      r.intradayUnreconciled = unreconciled;
    }
    // 7) Re-hydrate state from the DB (one source of truth — avoids drift from per-row in-memory patches).
    try {
      const [tradesRes, posRes, softDelsRes] = await Promise.all([
        supabase.from("trades").select("*").eq("user_id", uid).or("is_deleted.is.null,is_deleted.eq.false").order("created_at", { ascending: false }),
        supabase.from("positions").select("*").eq("user_id", uid).eq("is_closed", false),
        supabase.from("trades").select("ib_exec_id").eq("user_id", uid).eq("is_deleted", true).not("ib_exec_id", "is", null),
      ]);
      if (softDelsRes.data) setSoftDeletedExecIds(new Set(softDelsRes.data.map(r => r.ib_exec_id).filter(Boolean)));
      if (tradesRes.data) {
        setJournaledTrades(applyTradeLinks(tradesRes.data.map(t => ({ id: t.id, ticker: t.ticker, entry: t.entry_date, entryTime: t.entry_time || "", exit: t.exit_date, exitTime: t.exit_time || "", entryP: t.entry_price, exitP: t.exit_price, shares: t.shares, stop: t.stop_price, setup: t.setup, tags: t.tags || [], plPct: t.pl_pct, plDollar: t.pl_dollar, rMult: t.r_mult, reason: t.exit_reason, commission: t.commission != null ? t.commission : 0, notes: t.notes || "", chartUrl: t.chart_url || "", chartImage: t.chart_image || "", tradeType: t.trade_type || "Long", source: t.source || "manual", ibExecId: t.ib_exec_id || null, ibTradeId: t.ib_trade_id || null, positionId: t.position_id || null }))));
      }
      if (posRes.data) {
        const mapped = posRes.data.map(p => ({ id: p.id, _lid: 1e9 + (p.id || 0), sym: p.symbol, entry: p.entry_date, entryTime: p.entry_time || "", shares: p.shares, ep: p.entry_price, cp: p.current_price, stop: p.stop_price, stop2: p.stop_price_2, trailStop: p.trailing_stop || "", setup: p.setup, tags: p.tags || [], comm: p.commission != null ? String(p.commission) : "", notes: p.notes || "", chartUrl: p.chart_url || "", chartImage: p.chart_image || "", tradeType: p.trade_type || "Long", source: p.source || "manual", ibConid: p.ib_conid || null, ibSyncedAt: p.ib_synced_at || null, intradayLog: normalizeIntradayLog(p.intraday_log) }));
        setPositions(mapped);
        positionsRef.current = mapped;
        lastLoadedCount.current = mapped.length;
      }
    } catch (e) { r.errors.push(`reload: ${e.message}`); }
    // 8) Clear the audit log — undo is one-shot.
    if (undoStorageKey) localStorage.removeItem(undoStorageKey);
    setLastSync(null);
    setUndoResult(r);
    setUndoStatus("done");
  }, [session, lastSync, undoStatus, undoStorageKey]);
  const [fullSizePct, setFullSizePct] = useState(25);
  const [numStocks, setNumStocks] = useState(5);
  const [fontSize, setFontSize] = useState("standard");
  const [targetRote, setTargetRote] = useState("2");
  const dataLoaded = useRef(false);
  const loadFailed = useRef(false); // tracks if data load had errors — blocks autosave to prevent data loss

  // ─── Auth Listener ───
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (!s) setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) { setAuthLoading(false); dataLoaded.current = false; loadFailed.current = false; }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ─── Offline detection state ───
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const offlineQueue = useRef(null); // stores {uid, posArr} for retry when back online

  // ─── Save status indicators (SPLIT: positions and trades are independent) ───
  const [positionSaveStatus, setPositionSaveStatus] = useState(null); // null | "saving" | "saved" | "error"
  const [tradeSaveStatus, setTradeSaveStatus] = useState(null); // null | "saving" | "saved" | "error"
  const [saveErrorMsg, setSaveErrorMsg] = useState(""); // actual error message for debugging
  const [tradeSaveErrorMsg, setTradeSaveErrorMsg] = useState(""); // trade-specific error message
  const positionSaveTimer = useRef(null);
  const tradeSaveTimer = useRef(null);

  // ─── Dirty tracking: are there unsaved changes? ───
  // hasPendingChanges removed — replaced by posDirty/tradesDirty refs
  useEffect(() => {
    const goOffline = () => { setIsOffline(true); console.warn("OFFLINE: saves will queue until connection returns."); };
    const goOnline = () => {
      setIsOffline(false);
      console.log("ONLINE: connection restored. Flushing queued save...");
      // Retry queued save
      if (offlineQueue.current && session) {
        const { uid, posArr } = offlineQueue.current;
        offlineQueue.current = null;
        savePositionsNow(uid, posArr);
      }
    };
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, [session]);

  // ─── Helper: save positions to Supabase (insert-first, delete-after, ID-sync) ───
  const isSaving = useRef(false);
  const saveStartTime = useRef(0); // tracks when save started — used for mutex timeout
  const pendingSave = useRef(null); // queued save if one was attempted during in-flight save
  const skipNextAutosave = useRef(false); // flag to prevent autosave loop after ID sync
  const lastSaveIdMap = useRef(new Map()); // old→new ID mapping from last save, used by DashboardPage to remap sellId
  const savePositionsNow = useCallback(async (uid, posArr) => {
    // If offline, queue the save for when connection returns
    if (!navigator.onLine) {
      console.warn("OFFLINE: Queuing save for", posArr.length, "positions until connection returns.");
      offlineQueue.current = { uid, posArr };
      return;
    }

    // Prevent concurrent saves — reschedule instead of silently dropping
    // SAFETY: if mutex has been held for >15s, force-release it (prevents deadlock from hung requests)
    if (isSaving.current) {
      const elapsed = Date.now() - saveStartTime.current;
      if (elapsed > 15000) {
        console.error("MUTEX TIMEOUT: Save has been in-flight for", Math.round(elapsed / 1000), "seconds. Force-releasing mutex.");
        isSaving.current = false;
      } else {
        pendingSave.current = { uid, posArr };
        return;
      }
    }
    isSaving.current = true;
    saveStartTime.current = Date.now();
    setPositionSaveStatus("saving");
    try {
      const rows = posArr.map(p => {
        const row = {
          user_id: uid, symbol: p.sym || "", entry_date: p.entry || "", entry_time: p.entryTime || "", shares: p.shares || "",
          entry_price: p.ep || "", current_price: p.cp || "", stop_price: p.stop || "",
          stop_price_2: p.stop2 || "", trailing_stop: p.trailStop || "", setup: p.setup || "VCP", tags: p.tags || [],
          commission: p.comm != null && p.comm !== "" ? Number(p.comm) : null, notes: p.notes || "", chart_url: p.chartUrl || "", chart_image: p.chartImage || "",
          trade_type: p.tradeType || "Long",
          source: p.source || "manual", ib_conid: p.ibConid || null, ib_synced_at: p.ibSyncedAt || null, // preserve IBKR identity through bulk Save
          is_closed: false, // bulk Save only ever holds OPEN positions; archived (closed) rows live untouched in the DB
        };
        // CRITICAL: carries the intraday activity log through bulk Save unchanged. Only included when the
        // DB column actually exists (detected on load) — protects against deploying the code before the
        // migration is run, which would otherwise reject every Save and wipe positions.
        if (intradayColumnAvailableRef.current) row.intraday_log = p.intradayLog || null;
        return row;
      });

      if (rows.length === 0) {
        // Only delete if user genuinely has no positions — guard against accidental empty state
        if (lastLoadedCount.current > 0) {
          console.error("savePositionsNow called with 0 positions but lastLoadedCount was", lastLoadedCount.current, "— BLOCKING delete to prevent data loss.");
          isSaving.current = false;
          setPositionSaveStatus(null);
          return;
        }
        // User intentionally cleared all — safe to delete OPEN rows only (archived/closed history is preserved)
        await supabase.from("positions").delete().eq("user_id", uid).eq("is_closed", false);
        isSaving.current = false;
        setPositionSaveStatus("saved");
        if (positionSaveTimer.current) clearTimeout(positionSaveTimer.current);
        positionSaveTimer.current = setTimeout(() => setPositionSaveStatus(null), 2500);
        return;
      }

      // Step 1: INSERT all current positions as fresh rows (get back real DB IDs)
      const { data: inserted, error: insertErr } = await supabase.from("positions").insert(rows).select("id");
      if (insertErr || !inserted) {
        const errMsg = insertErr?.message || "Insert returned no data";
        console.error("Position save error:", errMsg, "| Full error:", JSON.stringify(insertErr));
        setSaveErrorMsg(errMsg);
        setPositionSaveStatus("error");
        if (positionSaveTimer.current) clearTimeout(positionSaveTimer.current);
        positionSaveTimer.current = setTimeout(() => setPositionSaveStatus(null), 8000);
        // Queue for retry if it was a network error
        if (!navigator.onLine || (insertErr && /network|fetch|timeout/i.test(errMsg))) {
          offlineQueue.current = { uid, posArr };
        }
        isSaving.current = false;
        return; // CRITICAL: if insert fails, don't touch existing data
      }

      // Step 2: Delete old OPEN rows — everything for this user EXCEPT what we just inserted.
      // SCOPED to is_closed=false so archived (auto-closed) positions are NEVER swept up by the bulk Save.
      const newIds = inserted.map(r => r.id);
      if (newIds.length > 0) {
        await supabase.from("positions").delete().eq("user_id", uid).eq("is_closed", false).not("id", "in", `(${newIds.join(",")})`);
      }

      // Step 3: Sync local state with real DB IDs so next save doesn't create duplicates
      // Build old→new ID map and expose it so DashboardPage can remap sellId
      const idMap = new Map();
      skipNextAutosave.current = true; // prevent ID sync from triggering another save cycle
      setPositions(prev => {
        if (prev.length !== inserted.length) return prev; // state changed during save, skip sync
        prev.forEach((p, i) => { if (inserted[i]) idMap.set(p.id, inserted[i].id); });
        const next = prev.map((p, i) => ({ ...p, id: inserted[i].id })); // _lid preserved via spread
        positionsRef.current = next;
        return next;
      });
      lastSaveIdMap.current = idMap;
      lastLoadedCount.current = inserted.length;
      // Show "saved" indicator briefly
      posDirty.current = false;
      setPositionSaveStatus("saved");
      if (positionSaveTimer.current) clearTimeout(positionSaveTimer.current);
      positionSaveTimer.current = setTimeout(() => setPositionSaveStatus(null), 2500);
    } catch (err) {
      console.error("Position save failed:", err.message, err);
      setSaveErrorMsg(err.message || "Unknown error");
      setPositionSaveStatus("error");
      if (positionSaveTimer.current) clearTimeout(positionSaveTimer.current);
      positionSaveTimer.current = setTimeout(() => setPositionSaveStatus(null), 8000);
      // Queue for retry on network errors
      if (!navigator.onLine) offlineQueue.current = { uid, posArr };
    }
    isSaving.current = false;
    // If a save was queued while this one was in-flight, run it now with fresh data
    if (pendingSave.current) {
      const { uid: pUid, posArr: pArr } = pendingSave.current;
      pendingSave.current = null;
      savePositionsNow(pUid, pArr);
    }
  }, []);

  // ─── Helper: save settings to Supabase ───
  const saveSettingNow = useCallback(async (uid, key, value) => {
    const { error } = await supabase.from("user_settings").upsert(
      { user_id: uid, setting_key: key, setting_value: value, updated_at: new Date().toISOString() },
      { onConflict: "user_id,setting_key" }
    );
    if (error) console.error("Setting save error:", key, error.message);
  }, []);

  // ─── Manual save handler (bypasses debounce) ───
  const handleManualSave = useCallback(() => {
    if (!session) return;
    savePositionsNow(session.user.id, positionsRef.current);
  }, [session, savePositionsNow]);

  // (saveTradesNow removed — was destructive delete-all-then-insert pattern. Trade saves use incremental insert below.)

  // ─── Load all data when session is available ───
  useEffect(() => {
    if (!session || dataLoaded.current) return;
    const load = async () => {
      const uid = session.user.id;

      // Profile — MUST check for errors to prevent overwriting with defaults
      const { data: prof, error: profErr } = await supabase.from("profiles").select("*").eq("id", uid).single();
      if (profErr) { console.error("Profile load failed:", profErr.message); loadFailed.current = true; }
      if (prof) {
        setProfile(prof);
        if (prof.portfolio_size) setPortfolioSize(String(prof.portfolio_size));
        if (prof.full_size_pct != null) setFullSizePct(prof.full_size_pct);
        if (prof.num_stocks != null) setNumStocks(prof.num_stocks);
        if (prof.font_size) setFontSize(prof.font_size);
      }

      // Settings — MUST check for errors. If query fails, do NOT overwrite with defaults.
      const { data: settings, error: settingsErr } = await supabase.from("user_settings").select("*").eq("user_id", uid);
      if (settingsErr) { console.error("Settings load failed:", settingsErr.message); loadFailed.current = true; }
      let hasSetup = false, hasTags = false, hasExit = false;
      if (settings) {
        settings.forEach(s => {
          if (s.setting_key === "setup_types" && Array.isArray(s.setting_value)) { setSetupTypes(s.setting_value); hasSetup = true; }
          if (s.setting_key === "tags" && Array.isArray(s.setting_value)) { setTags(s.setting_value); hasTags = true; }
          if (s.setting_key === "exit_reasons" && Array.isArray(s.setting_value)) { setExitReasons(s.setting_value); hasExit = true; }
          if (s.setting_key === "target_rote" && s.setting_value != null) setTargetRote(String(s.setting_value));
          // Trade-link mirror — durable cross-device store. The wizard writes both here and to
          // localStorage; on load we MERGE the server copy with whatever's already in localStorage
          // (rather than overwrite) so a device whose links never made it to the server isn't wiped
          // just because the server copy is older / smaller. Server values WIN per-key on conflict
          // because the server is the cross-device truth — but unique device-only keys are preserved.
          if (s.setting_key === "trade_links" && s.setting_value && typeof s.setting_value === "object") {
            try {
              const local = JSON.parse(localStorage.getItem(TRADE_LINKS_KEY) || "{}") || {};
              const merged = { ...local, ...s.setting_value }; // server wins per-key
              localStorage.setItem(TRADE_LINKS_KEY, JSON.stringify(merged));
              // If local had keys the server didn't, push the merged result back so the server catches up.
              const serverKeys = Object.keys(s.setting_value);
              const localOnly = Object.keys(local).filter(k => !serverKeys.includes(k));
              if (localOnly.length > 0) {
                supabase.from("user_settings").upsert(
                  { user_id: uid, setting_key: "trade_links", setting_value: merged, updated_at: new Date().toISOString() },
                  { onConflict: "user_id,setting_key" }
                ).then(({ error }) => { if (error) console.error("trade_links merge-back failed:", error.message); });
              }
            } catch {}
          }
        });
      }
      // First time? Save defaults to DB so they persist — ONLY if settings loaded successfully (no error)
      if (!settingsErr) {
        if (!hasSetup) await saveSettingNow(uid, "setup_types", DEFAULT_SETUP_TYPES);
        if (!hasTags) await saveSettingNow(uid, "tags", DEFAULT_TAGS);
        if (!hasExit) await saveSettingNow(uid, "exit_reasons", DEFAULT_EXIT_REASONS);
      }

      // Positions — CRITICAL: check for query errors. A failed query MUST NOT trigger position deletion.
      const { data: pos, error: posErr } = await supabase.from("positions").select("*").eq("user_id", uid).eq("is_closed", false).order("created_at");
      if (posErr) {
        // ABORT position loading — do NOT touch state, do NOT set lastLoadedCount to 0.
        // This prevents autosave from wiping the DB when a network blip returns null data.
        console.error("CRITICAL: Positions load failed:", posErr.message, "— keeping existing state to prevent data loss.");
        loadFailed.current = true; // block all autosaves until next successful load
      } else if (pos && pos.length > 0) {
        // Deduplicate: if same symbol+entry_date+entry_price+shares appears multiple times, keep only the latest (highest id)
        const seen = new Map();
        const dupIds = [];
        for (const p of pos) {
          const key = `${p.symbol}|${p.entry_date}|${p.entry_price}|${p.shares}|${p.stop_price}|${p.source || "manual"}`;
          if (seen.has(key)) {
            // Duplicate — mark the older one (lower id) for deletion
            const prev = seen.get(key);
            if (p.id > prev.id) { dupIds.push(prev.id); seen.set(key, p); }
            else { dupIds.push(p.id); }
          } else {
            seen.set(key, p);
          }
        }
        // Clean up duplicates from DB silently
        if (dupIds.length > 0) {
          console.log(`Cleaning ${dupIds.length} duplicate positions`);
          await supabase.from("positions").delete().in("id", dupIds);
        }
        const clean = pos.filter(p => !dupIds.includes(p.id));
        lastLoadedCount.current = clean.length;
        // Detect the intraday_log column. If present (even as null), the schema migration has been run
        // and the save mapper can safely include it. If absent, save must skip the field.
        if (clean.length > 0 && Object.prototype.hasOwnProperty.call(clean[0], "intraday_log")) {
          intradayColumnAvailableRef.current = true;
          setIntradayColumnAvailable(true);
        }
        // Build snapshot of loaded data for corruption detection before future saves
        const snap = new Map();
        clean.forEach(p => { if (p.symbol) snap.set(p.id, { sym: p.symbol, ep: p.entry_price || "", shares: p.shares || "" }); });
        loadedSnapshot.current = snap;
        setPositions(clean.map(p => ({ id: p.id, _lid: _lid++, sym: p.symbol, entry: p.entry_date, entryTime: p.entry_time || "", shares: p.shares, ep: p.entry_price, cp: p.current_price, stop: p.stop_price, stop2: p.stop_price_2, trailStop: p.trailing_stop || "", setup: p.setup, tags: p.tags || [], comm: p.commission != null ? String(p.commission) : "", notes: p.notes || "", chartUrl: p.chart_url || "", chartImage: p.chart_image || "", tradeType: p.trade_type || "Long", source: p.source || "manual", ibConid: p.ib_conid || null, ibSyncedAt: p.ib_synced_at || null, intradayLog: normalizeIntradayLog(p.intraday_log) })));
      } else if (!posErr) {
        // Query succeeded but returned empty — check if user has been initialized before
        const { data: initFlag } = await supabase.from("user_settings").select("setting_value").eq("user_id", uid).eq("setting_key", "initialized").single();
        if (!initFlag) {
          // Very first login — seed demo positions, save to DB, then load back with DB ids
          const { error: seedErr } = await supabase.from("positions").insert(INIT_POSITIONS.map(p => ({
            user_id: uid, symbol: p.sym || "", entry_date: p.entry || "", entry_time: p.entryTime || "", shares: p.shares || "",
            entry_price: p.ep || "", current_price: p.cp || "", stop_price: p.stop || "",
            stop_price_2: p.stop2 || "", trailing_stop: p.trailStop || "", setup: p.setup || "VCP", tags: p.tags || [],
            commission: p.comm != null && p.comm !== "" ? Number(p.comm) : null, trade_type: p.tradeType || "Long",
          })));
          if (!seedErr) {
            // Re-load from DB so positions have real DB ids
            const { data: seeded } = await supabase.from("positions").select("*").eq("user_id", uid).eq("is_closed", false).order("created_at");
            if (seeded && seeded.length > 0) {
              lastLoadedCount.current = seeded.length;
              setPositions(seeded.map(p => ({ id: p.id, _lid: _lid++, sym: p.symbol, entry: p.entry_date, entryTime: p.entry_time || "", shares: p.shares, ep: p.entry_price, cp: p.current_price, stop: p.stop_price, stop2: p.stop_price_2, trailStop: p.trailing_stop || "", setup: p.setup, tags: p.tags || [], comm: p.commission != null ? String(p.commission) : "", notes: p.notes || "", chartUrl: p.chart_url || "", chartImage: p.chart_image || "", tradeType: p.trade_type || "Long", intradayLog: normalizeIntradayLog(p.intraday_log) })));
            }
          }
          await saveSettingNow(uid, "initialized", true);
        } else {
          // User deleted all positions intentionally — keep empty
          lastLoadedCount.current = 0;
          setPositions([]);
        }
      }

      // Trades — check for errors, don't clear state on failure
      // Treat is_deleted NULL as "not deleted" — rows inserted before the column had a DEFAULT can be
      // NULL, and `.eq("is_deleted", false)` silently drops NULLs (NULL ≠ false in SQL), which made most
      // historical trades vanish from the journal even though they're still in the DB.
      const { data: trades, error: tradesErr } = await supabase.from("trades").select("*").eq("user_id", uid).or("is_deleted.is.null,is_deleted.eq.false").order("created_at", { ascending: false });
      if (tradesErr) { console.error("Trades load failed:", tradesErr.message); }
      console.log(`[load] trades fetched: ${(trades || []).length}`);
      if (trades && trades.length > 0) {
        setJournaledTrades(applyTradeLinks(trades.map(t => ({ id: t.id, ticker: t.ticker, entry: t.entry_date, entryTime: t.entry_time || "", exit: t.exit_date, exitTime: t.exit_time || "", entryP: t.entry_price, exitP: t.exit_price, shares: t.shares, stop: t.stop_price, setup: t.setup, tags: t.tags || [], plPct: t.pl_pct, plDollar: t.pl_dollar, rMult: t.r_mult, reason: t.exit_reason, commission: t.commission != null ? t.commission : 0, notes: t.notes || "", chartUrl: t.chart_url || "", chartImage: t.chart_image || "", tradeType: t.trade_type || "Long", source: t.source || "manual", ibExecId: t.ib_exec_id || null, ibTradeId: t.ib_trade_id || null, positionId: t.position_id || null }))));
        lastLoadedTradeCount.current = trades.length;
      }
      // Soft-deleted IBKR exec ids — small parallel query, just the column we need. Used by the matcher
      // to skip re-importing rows the unique constraint trades_user_ib_exec would block anyway.
      const { data: softDels } = await supabase.from("trades").select("ib_exec_id").eq("user_id", uid).eq("is_deleted", true).not("ib_exec_id", "is", null);
      if (softDels) setSoftDeletedExecIds(new Set(softDels.map(r => r.ib_exec_id).filter(Boolean)));

      // ─── Recover any emergency offline saves from localStorage ───
      try {
        const emergencyKey = `viv_emergency_positions_${uid}`;
        const saved = localStorage.getItem(emergencyKey);
        if (saved) {
          const emergencyPos = JSON.parse(saved);
          if (Array.isArray(emergencyPos) && emergencyPos.length > 0) {
            console.log(`RECOVERY: Found ${emergencyPos.length} positions saved offline. Merging with DB...`);
            // Merge: for each emergency position, if it doesn't exist in DB (by symbol+entry+shares), insert it
            const { data: currentPos } = await supabase.from("positions").select("*").eq("user_id", uid);
            const existingKeys = new Set((currentPos || []).map(p => `${p.symbol}|${p.entry_date}|${p.entry_price}|${p.shares}`));
            const toInsert = emergencyPos.filter(p => !existingKeys.has(`${p.sym}|${p.entry}|${p.ep}|${p.shares}`));
            if (toInsert.length > 0) {
              const rows = toInsert.map(p => ({
                user_id: uid, symbol: p.sym || "", entry_date: p.entry || "", entry_time: p.entryTime || "", shares: p.shares || "",
                entry_price: p.ep || "", current_price: p.cp || "", stop_price: p.stop || "",
                stop_price_2: p.stop2 || "", trailing_stop: p.trailStop || "", setup: p.setup || "VCP", tags: p.tags || [],
                commission: p.comm != null && p.comm !== "" ? Number(p.comm) : null, notes: p.notes || "", chart_url: p.chartUrl || "", chart_image: p.chartImage || "",
                trade_type: p.tradeType || "Long",
              }));
              await supabase.from("positions").insert(rows);
              console.log(`RECOVERY: Inserted ${toInsert.length} positions from offline save.`);
              // Re-load positions to get consistent state
              const { data: refreshed } = await supabase.from("positions").select("*").eq("user_id", uid).eq("is_closed", false).order("created_at");
              if (refreshed && refreshed.length > 0) {
                lastLoadedCount.current = refreshed.length;
                const snap2 = new Map();
                refreshed.forEach(p => { if (p.symbol) snap2.set(p.id, { sym: p.symbol, ep: p.entry_price || "", shares: p.shares || "" }); });
                loadedSnapshot.current = snap2;
                const next = refreshed.map(p => ({ id: p.id, _lid: _lid++, sym: p.symbol, entry: p.entry_date, entryTime: p.entry_time || "", shares: p.shares, ep: p.entry_price, cp: p.current_price, stop: p.stop_price, stop2: p.stop_price_2, trailStop: p.trailing_stop || "", setup: p.setup, tags: p.tags || [], comm: p.commission != null ? String(p.commission) : "", notes: p.notes || "", chartUrl: p.chart_url || "", chartImage: p.chart_image || "", tradeType: p.trade_type || "Long", intradayLog: normalizeIntradayLog(p.intraday_log) }));
                positionsRef.current = next;
                setPositions(next);
              }
            }
          }
          localStorage.removeItem(emergencyKey); // clean up after recovery
        }
      } catch (e) { console.error("Emergency recovery failed:", e); }

      dataLoaded.current = true;
      setAuthLoading(false);
    };
    load();
  }, [session]);

  // ─── Device sync: re-fetch positions when tab becomes visible again ───
  // This handles the phone/laptop sync issue — if member edits on laptop then switches to phone,
  // the phone re-fetches latest data from Supabase when the tab/browser becomes active again.
  const lastSyncTime = useRef(Date.now());
  useEffect(() => {
    if (!session) return;
    const handleVisSync = async () => {
      if (document.visibilityState !== "visible") return;
      if (!dataLoaded.current) return;
      // Only re-fetch if tab was hidden for >5 seconds (prevents re-fetch on quick tab switches)
      const elapsed = Date.now() - lastSyncTime.current;
      if (elapsed < 5000) return;
      // Don't re-fetch if there's an unsaved save in progress
      if (isSaving.current) return;
      // NEVER overwrite unsaved local edits — preserve in-progress work like a spreadsheet (data-loss guard).
      // Device-sync only runs when the current tab has no pending changes.
      if (posDirty.current || tradesDirty.current) return;
      lastSyncTime.current = Date.now();
      try {
        const uid = session.user.id;
        const { data: pos, error: posErr } = await supabase.from("positions").select("*").eq("user_id", uid).eq("is_closed", false).order("created_at");
        if (posErr || !pos) return; // silently skip — don't disrupt user
        // Deduplicate
        const seen = new Map();
        const dupIds = [];
        for (const p of pos) {
          const key = `${p.symbol}|${p.entry_date}|${p.entry_price}|${p.shares}|${p.stop_price}|${p.source || "manual"}`;
          if (seen.has(key)) {
            const prev = seen.get(key);
            if (p.id > prev.id) { dupIds.push(prev.id); seen.set(key, p); }
            else { dupIds.push(p.id); }
          } else { seen.set(key, p); }
        }
        if (dupIds.length > 0) {
          await supabase.from("positions").delete().in("id", dupIds);
        }
        const clean = pos.filter(p => !dupIds.includes(p.id));
        // Only update if DB has different data (compare position count and symbols)
        const dbKey = clean.map(p => `${p.symbol}|${p.entry_price}|${p.shares}`).sort().join("##");
        const localKey = positionsRef.current.map(p => `${p.sym}|${p.ep}|${p.shares}`).sort().join("##");
        if (dbKey !== localKey) {
          console.log("DEVICE SYNC: Positions changed on another device. Refreshing...");
          skipNextAutosave.current = true;
          lastLoadedCount.current = clean.length;
          const snap = new Map();
          clean.forEach(p => { if (p.symbol) snap.set(p.id, { sym: p.symbol, ep: p.entry_price || "", shares: p.shares || "" }); });
          loadedSnapshot.current = snap;
          const next = clean.map(p => ({ id: p.id, _lid: _lid++, sym: p.symbol, entry: p.entry_date, entryTime: p.entry_time || "", shares: p.shares, ep: p.entry_price, cp: p.current_price, stop: p.stop_price, stop2: p.stop_price_2, trailStop: p.trailing_stop || "", setup: p.setup, tags: p.tags || [], comm: p.commission != null ? String(p.commission) : "", notes: p.notes || "", chartUrl: p.chart_url || "", chartImage: p.chart_image || "", tradeType: p.trade_type || "Long" }));
          positionsRef.current = next;
          setPositions(next);
        }
      } catch (err) {
        console.error("Device sync failed:", err.message);
      }
    };
    document.addEventListener("visibilitychange", handleVisSync);
    // Also update lastSyncTime when tab is hidden (so elapsed calculation works)
    const trackHide = () => { if (document.visibilityState === "hidden") lastSyncTime.current = Date.now(); };
    document.addEventListener("visibilitychange", trackHide);
    return () => { document.removeEventListener("visibilitychange", handleVisSync); document.removeEventListener("visibilitychange", trackHide); };
  }, [session]);

  // ─── Auto-save profile fields to Supabase (debounced) ───
  const saveTimer = useRef({});
  const saveProfile = useCallback((field, val) => {
    if (!session) return;
    clearTimeout(saveTimer.current[field]);
    saveTimer.current[field] = setTimeout(() => {
      supabase.from("profiles").update({ [field]: val, updated_at: new Date().toISOString() }).eq("id", session.user.id).then(({ error }) => {
        if (error) console.error("Profile save error:", field, error.message);
      });
    }, 1000);
  }, [session]);

  useEffect(() => { if (dataLoaded.current && !loadFailed.current) saveProfile("portfolio_size", +portfolioSize || 0); }, [portfolioSize]);
  useEffect(() => { if (dataLoaded.current && !loadFailed.current) saveProfile("full_size_pct", fullSizePct); }, [fullSizePct]);
  useEffect(() => { if (dataLoaded.current && !loadFailed.current) saveProfile("num_stocks", numStocks); }, [numStocks]);
  useEffect(() => { if (dataLoaded.current && !loadFailed.current) saveProfile("font_size", fontSize); }, [fontSize]);

  // ─── Auto-save settings to Supabase — blocked if data load failed to prevent overwriting with defaults ───
  useEffect(() => { if (dataLoaded.current && !loadFailed.current && session) saveSettingNow(session.user.id, "setup_types", setupTypes); }, [setupTypes]);
  useEffect(() => { if (dataLoaded.current && !loadFailed.current && session) saveSettingNow(session.user.id, "tags", tags); }, [tags]);
  useEffect(() => { if (dataLoaded.current && !loadFailed.current && session) saveSettingNow(session.user.id, "exit_reasons", exitReasons); }, [exitReasons]);
  useEffect(() => { if (dataLoaded.current && !loadFailed.current && session) saveSettingNow(session.user.id, "target_rote", targetRote); }, [targetRote]);

  // ─── Auto-save positions to Supabase (debounced, with safety checks) ───
  // posTimer/tradeTimer removed — no more autosave debouncing
  const lastLoadedCount = useRef(0); // track how many positions were loaded from DB
  const lastLoadedTradeCount = useRef(0); // track how many trades were loaded from DB — guards against accidental mass soft-delete
  const loadedSnapshot = useRef(new Map()); // snapshot of loaded data: id → {sym, ep, shares} — used to detect corruption before save
  const positionsRef = useRef(positions); // always-current ref for unsaved-changes tracking
  positionsRef.current = positions; // sync on every render
  // Track dirty state — set true on any position/trade change, cleared on manual save
  const posDirty = useRef(false);
  const tradesDirty = useRef(false);
  useEffect(() => {
    if (!dataLoaded.current || !session) return;
    if (skipNextAutosave.current) { skipNextAutosave.current = false; return; }
    posDirty.current = true;
  }, [positions, session]);

  // ─── Warn user before leaving with unsaved changes (NO auto-save, NO emergency save) ───
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (posDirty.current || tradesDirty.current) {
        e.preventDefault();
        e.returnValue = "You have unsaved changes. Click Save before leaving!";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // ─── Trades dirty tracking (NO auto-save) ───
  useEffect(() => {
    if (!dataLoaded.current || !session) return;
    tradesDirty.current = true;
  }, [journaledTrades, session]);

  // ─── Manual trade save (bypasses debounce, reuses same logic) ───
  const handleManualTradeSave = useCallback(async () => {
    if (!session || !dataLoaded.current) return;
    const uid = session.user.id;
    setTradeSaveStatus("saving");
    try {
      const { data: existing } = await supabase.from("trades").select("id").eq("user_id", uid).or("is_deleted.is.null,is_deleted.eq.false");
      const existingIds = new Set((existing || []).map(t => t.id));
      const currentIds = new Set(journaledTrades.filter(t => existingIds.has(t.id)).map(t => t.id));
      const tradeRow = t => ({
        user_id: uid, ticker: t.ticker || "", entry_date: t.entry || "", entry_time: t.entryTime || "", exit_date: t.exit || "", exit_time: t.exitTime || "",
        entry_price: t.entryP || 0, exit_price: t.exitP || 0, shares: t.shares || 0,
        stop_price: t.stop || 0, setup: t.setup || "", tags: t.tags || [],
        pl_pct: t.plPct || 0, pl_dollar: t.plDollar || 0, r_mult: t.rMult || 0,
        exit_reason: t.reason || "", commission: t.commission != null ? Number(t.commission) : null, notes: t.notes || "",
        chart_url: t.chartUrl || "", chart_image: t.chartImage || "", trade_type: t.tradeType || "Long",
        is_deleted: false, // set explicitly so a missing column default can't leave it NULL (which the load drops)
        // position_id omitted on purpose: it has a FK to positions(id), and t.positionId can be a stale
        // local/old position id (positions get new ids on every Save) → writing it fails the FK (23503) and
        // loses the trade. Omitting it means INSERTs default to null and UPDATEs leave the existing DB value
        // untouched. The position↔trade link lives in trade_links and is restored by applyTradeLinks().
      });
      const newTrades = journaledTrades.filter(t => !existingIds.has(t.id));
      if (newTrades.length > 0) {
        const { data: inserted, error } = await supabase.from("trades").insert(newTrades.map(tradeRow)).select("id");
        if (!error && inserted && inserted.length === newTrades.length) {
          setJournaledTrades(prev => {
            const newIdMap = new Map();
            newTrades.forEach((t, i) => { if (inserted[i]) newIdMap.set(t.id, inserted[i].id); });
            return prev.map(t => newIdMap.has(t.id) ? { ...t, id: newIdMap.get(t.id) } : t);
          });
        }
      }
      const editedTrades = journaledTrades.filter(t => existingIds.has(t.id));
      if (editedTrades.length > 0) {
        // Use individual updates — upsert fails because trades.id is GENERATED ALWAYS
        const updateResults = await Promise.all(editedTrades.map(t =>
          supabase.from("trades").update(tradeRow(t)).eq("id", t.id)
        ));
        const firstErr = updateResults.find(r => r.error);
        if (firstErr?.error) {
          console.error("Trade update error:", firstErr.error.message);
          setTradeSaveErrorMsg(firstErr.error.message);
          setTradeSaveStatus("error");
          if (tradeSaveTimer.current) clearTimeout(tradeSaveTimer.current);
          tradeSaveTimer.current = setTimeout(() => setTradeSaveStatus(null), 8000);
          return;
        }
      }
      tradesDirty.current = false;
      setTradeSaveStatus("saved");
      if (tradeSaveTimer.current) clearTimeout(tradeSaveTimer.current);
      tradeSaveTimer.current = setTimeout(() => setTradeSaveStatus(null), 2500);
    } catch (err) {
      console.error("Manual trade save failed:", err.message);
      setTradeSaveErrorMsg(err.message || "Unknown error");
      setTradeSaveStatus("error");
      if (tradeSaveTimer.current) clearTimeout(tradeSaveTimer.current);
      tradeSaveTimer.current = setTimeout(() => setTradeSaveStatus(null), 8000);
    }
  }, [session, journaledTrades]);

  const appZoom = (fontSize === "large" || fontSize === "huge") ? 1.15 : fontSize === "small" ? 0.88 : 1.0;  // "huge" retired — folds into "large" so old saved values aren't stuck on the broken zoom

  const handleJournalTrade = useCallback((trade) => { setJournaledTrades(prev => [...prev, trade]); }, []);

  // ─── Display Name (editable, saved to Supabase) ───
  const [displayNameState, setDisplayNameState] = useState("");
  useEffect(() => { if (profile?.display_name) setDisplayNameState(profile.display_name); }, [profile]);
  const handleDisplayNameChange = useCallback((val) => {
    setDisplayNameState(val);
    if (!session) return;
    clearTimeout(saveTimer.current.display_name);
    saveTimer.current.display_name = setTimeout(() => {
      supabase.from("profiles").update({ display_name: val, updated_at: new Date().toISOString() }).eq("id", session.user.id).then(() => {});
    }, 1000);
  }, [session]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    dataLoaded.current = false;
    loadFailed.current = false;
    // Reset ALL data state to prevent bleed between users
    setPositions([]);
    setJournaledTrades([]);
    setSetupTypes(DEFAULT_SETUP_TYPES);
    setTags(DEFAULT_TAGS);
    setExitReasons(DEFAULT_EXIT_REASONS);
    setPortfolioSize("500000");
    setFullSizePct(25);
    setNumStocks(5);
    setFontSize("standard");
    setTargetRote("2");
    lastLoadedCount.current = 0;
    lastLoadedTradeCount.current = 0;
    setPage("dashboard");
  };

  // ─── Loading / Auth Gate ───
  if (authLoading) {
    return (
      <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", WebkitFontSmoothing: "antialiased" }}>
        <div style={{ textAlign: "center" }}>
          <Wordmark size="1.3rem" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: "0.78rem", color: C.muted }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (!session) return <AuthPage />;

  const userEmail = session.user.email;
  const displayName = displayNameState || profile?.display_name || userEmail.split("@")[0];
  const sidebarCollapsedW = 56;
  const sidebarExpandedW = isTablet ? 200 : 220;
  const sidebarW = sidebarOpen ? sidebarExpandedW : sidebarCollapsedW;
  const contentPadH = isMobile ? 16 : isTablet ? 24 : 36;
  const contentPadV = isMobile ? 16 : 28;

  // Interim: IBKR sync trigger is admin-only until per-user rollout is confirmed. Members can still enter their own creds in Settings.
  const isAdmin = (session?.user?.email || "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const pageContent = (
    <>
      {isOffline && (
        <div style={{ padding:"10px 16px",background:"rgba(239,68,68,0.12)",border:`1px solid rgba(239,68,68,0.25)`,borderRadius:10,marginBottom:12,display:"flex",alignItems:"center",gap:8 }}>
          <span style={{ fontSize:"0.74rem",fontWeight:700,color:"#ef4444" }}>OFFLINE</span>
          <span style={{ fontSize:"0.72rem",color:"rgba(255,255,255,0.6)" }}>Your changes are saved locally and will sync when your connection returns.</span>
        </div>
      )}
      {page === "dashboard" && <DashboardPage setPage={setPage} onLogout={handleLogout} onJournalTrade={handleJournalTrade} setupTypes={setupTypes} tags={tags} exitReasons={exitReasons} positions={positions} setPositions={setPositions} portfolioSize={portfolioSize} setPortfolioSize={setPortfolioSize} fullSizePct={fullSizePct} setFullSizePct={setFullSizePct} numStocks={numStocks} setNumStocks={setNumStocks} lastLoadedCountRef={lastLoadedCount} lastSaveIdMapRef={lastSaveIdMap} session={session} targetRote={targetRote} setTargetRote={setTargetRote} journaledTrades={journaledTrades} setJournaledTrades={setJournaledTrades} onManualSave={handleManualSave} saveStatus={positionSaveStatus} positionsRef={positionsRef} saveErrorMsg={saveErrorMsg} onIbkrSync={runIbkrSync} intradayColumnAvailable={intradayColumnAvailable} intradayFeatureEnabled={intradayFeatureEnabled} onRunIntegrity={runIntegrityCheck} integrityReport={integrityReport} integrityRunning={integrityRunning} displayName={displayName} />}
      {page === "tools" && <PremiumToolsPage setPage={setPage} onLogout={handleLogout} session={session} demo={true} portfolioSize={portfolioSize} journaledTrades={journaledTrades} displayName={displayName} />}
      {page === "journal" && <TradeJournalPage setPage={setPage} onLogout={handleLogout} journaledTrades={journaledTrades} setJournaledTrades={setJournaledTrades} setupTypes={setupTypes} tags={tags} exitReasons={exitReasons} session={session} onManualSave={handleManualTradeSave} saveStatus={tradeSaveStatus} positions={positions} setPositions={setPositions} positionsRef={positionsRef} portfolioSize={portfolioSize} displayName={displayName} />}
      {page === "settings" && <SettingsPage setPage={setPage} onLogout={handleLogout} setupTypes={setupTypes} setSetupTypes={setSetupTypes} tags={tags} setTags={setTags} exitReasons={exitReasons} setExitReasons={setExitReasons} fontSize={fontSize} setFontSize={setFontSize} userEmail={userEmail} displayName={displayName} onDisplayNameChange={handleDisplayNameChange} session={session} onIbkrSync={runIbkrSync} onRunIntegrity={runIntegrityCheck} integrityReport={integrityReport} integrityRunning={integrityRunning} intradayFeatureEnabled={intradayFeatureEnabled} onToggleIntradayFeature={toggleIntradayFeature} intradayColumnAvailable={intradayColumnAvailable} isMobile={isMobile} />}
      <IbkrSyncModal open={ibkrOpen} onClose={() => setIbkrOpen(false)} status={ibkrStatus} data={ibkrData} error={ibkrError} result={ibkrResult} onRetry={runIbkrSync} onConfirm={confirmIbkrSync} lastSync={lastSync} onUndo={undoLastSync} undoStatus={undoStatus} />
      <IntegrityReportModal open={integrityOpen} onClose={() => setIntegrityOpen(false)} report={integrityReport} onReRun={runIntegrityCheck} running={integrityRunning} />
    </>
  );

  // ─── MOBILE LAYOUT ───
  if (isMobile) {
    return (
      <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh", WebkitFontSmoothing: "antialiased", color: C.text, display: "flex", flexDirection: "column", zoom: appZoom }}>
        <div style={{ padding: "12px 16px", background: "rgba(8,8,14,0.95)", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, position: "sticky", top: 0, zIndex: 100 }}>
          <Wordmark size="0.88rem" style={{ lineHeight: 1 }} />
        </div>
        <AppBackground />
        <div key={page} className="viv-page-enter" style={{ flex: 1, overflowY: "auto", padding: `${contentPadV}px ${contentPadH}px`, paddingBottom: 80, position: "relative", zIndex: 1 }}>{pageContent}</div>
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(8,8,14,0.97)", borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 100, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
          {NAV.map(item => {
            const active = page === item.id;
            return (
              <button key={item.id} onClick={() => setPage(item.id)} style={{
                flex: 1, padding: "9px 0 11px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                border: "none", cursor: "pointer", fontFamily: font, position: "relative",
                background: active ? "linear-gradient(180deg, rgba(201,152,42,0.16), transparent)" : "transparent",
                color: active ? C.goldBright : C.muted, transition: "color 0.15s",
              }}>
                <NavIcon name={item.id} size={19} />
                <span style={{ fontSize: "0.56rem", fontWeight: active ? 700 : 500, letterSpacing: "0.04em" }}>{item.label}</span>
                {active && <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: 26, height: 2, borderRadius: 1, background: C.goldBright }} />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── DESKTOP / TABLET LAYOUT ───
  return (
    <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh", display: "flex", WebkitFontSmoothing: "antialiased", color: C.text, zoom: appZoom }}>
      <div style={{ flex: 1, padding: `${contentPadV}px ${contentPadH}px`, overflowY: "auto", minWidth: 0, position: "relative" }}>
        {/* Animated background */}
        <AppBackground />
        <div key={page} className="viv-page-enter" style={{ position:"relative",zIndex:1 }}>{pageContent}</div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}
