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
      return React.createElement("div", { style: { padding: 40, background: "#08080e", minHeight: "100vh", color: "#fff", fontFamily: "'Manrope', sans-serif" } },
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
  bg: "#08080e", bg2: "#0c0c14", white: "#ffffff", text: "rgba(255,255,255,0.90)",
  muted: "rgba(255,255,255,0.58)", gold: "#c9982a", goldBright: "#f0c050",
  goldMid: "#b8820a", goldDeep: "#7a4f00",
  goldDim: "rgba(201,152,42,0.15)", borderGold: "rgba(201,152,42,0.22)",
  glass: "rgba(255,255,255,0.042)", border: "rgba(255,255,255,0.09)",
  green: "#22c55e", greenDim: "rgba(34,197,94,0.10)", red: "#ef4444", redDim: "rgba(239,68,68,0.08)",
  blue: "#3b82f6", blueDim: "rgba(59,130,246,0.10)",
  purple: "#a78bfa", purpleDim: "rgba(167,139,250,0.10)",
};
const font = "'Manrope', -apple-system, sans-serif";
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
function multiSort(arr, sorts) {
  if (!sorts || sorts.length === 0) return arr;
  return [...arr].sort((a, b) => {
    for (const { key, dir } of sorts) {
      let av = a[key], bv = b[key];
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

// Reorderable table row — reorders direct <td> children by index array
function DragTr({ order, hiddenSet, children, ...props }) {
  if (!order) return <tr {...props}>{children}</tr>;
  const arr = React.Children.toArray(children);
  const indices = hiddenSet ? order.filter(i => !hiddenSet.has(i)) : order;
  return <tr {...props}>{indices.map(i => arr[i]).filter(Boolean)}</tr>;
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
    <GlassCard small style={{ padding: big ? "22px 24px" : "18px 20px", minHeight: big ? 118 : 98, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", boxSizing: "border-box" }}>
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
  return (
    <button onClick={onClick} style={{ background: `linear-gradient(135deg, ${C.goldMid}, ${C.goldBright}, ${C.goldDeep})`, color: "#000", fontWeight: 800, fontSize: small ? "0.72rem" : "0.82rem", padding: small ? "8px 16px" : "12px 28px", borderRadius: 980, border: "none", cursor: "pointer", fontFamily: font, boxShadow: `0 0 12px rgba(201,152,42,0.25), 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 1px rgba(255,255,255,0.3)`, transition: "all 0.2s ease", position: "relative", overflow: "hidden" }}
    onMouseEnter={e => { e.target.style.boxShadow = "0 0 20px rgba(201,152,42,0.4), 0 4px 12px rgba(0,0,0,0.25), inset 0 1px 1px rgba(255,255,255,0.4)"; e.target.style.transform = "translateY(-1px)"; }}
    onMouseLeave={e => { e.target.style.boxShadow = "0 0 12px rgba(201,152,42,0.25), 0 2px 8px rgba(0,0,0,0.2), inset 0 1px 1px rgba(255,255,255,0.3)"; e.target.style.transform = "translateY(0)"; }}
    >{children}</button>
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
// Normalize a trade date to ISO YYYY-MM-DD (handles "M/D/YY" manual/dashboard entries and "YYYY-MM-DD" IBKR rows).
// Used both by the IBKR reconcile-matcher and the trade-review chart.
const tradeDateISO = (d) => {
  if (!d) return "";
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`; }
  return s;
};

// Reconstruct closed round-trips (flat-to-flat per symbol) + open positions, then diff against current data.
function buildIbkrPreview(data, positions, journaledTrades) {
  // Closed trades — group executions per symbol, close out a round-trip each time net position returns to flat
  const bySym = {};
  (data.trades || []).forEach(t => { (bySym[t.symbol] = bySym[t.symbol] || []).push(t); });
  const closed = [];
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
        if (first.date >= IBKR_SYNC_FLOOR && qty > 0) {
          closed.push({ ticker: sym, entry: first.date, entryTime: first.time, exit: last.date, exitTime: last.time,
            entryP: +entryP.toFixed(4), exitP: +exitP.toFixed(4), shares: qty, plPct: +plPct.toFixed(2),
            plDollar: +plDollar.toFixed(2), commission: +commission.toFixed(2), execId: last.execID, tradeId: last.tradeID,
            tradeType: isLong ? "Long" : "Short" });
        }
        cycle = [];
      }
    });
  });

  // Open positions — these are current holdings, so show them unless they have a KNOWN open date before the floor.
  // (IBKR Summary-level positions often omit the open date; a blank date must NOT hide a live holding.)
  const openPos = (data.positions || [])
    .filter(p => !p.openDate || p.openDate >= IBKR_SYNC_FLOOR)
    .map(p => ({ sym: p.symbol, conid: p.conid, shares: String(Math.abs(Number(p.shares))), ep: String(p.avgCost),
      cp: p.markPrice ? String(p.markPrice) : "", entry: p.openDate, entryTime: p.openTime,
      tradeType: Number(p.shares) < 0 ? "Short" : "Long" }));

  // Diff against current data → classify each row + attach the matched existing row id (for surgical writes)
  const isIbkr = s => s === "ibkr" || s === "reconciled";
  const tradeRows = closed.map(c => {
    const synced = (journaledTrades || []).find(t => t.ibExecId && t.ibExecId === c.execId);
    if (synced) return { ...c, action: "synced", matchId: synced.id };
    const cands = (journaledTrades || []).filter(t => !isIbkr(t.source) && (t.ticker || "").toUpperCase() === c.ticker.toUpperCase() && tradeDateISO(t.entry) === tradeDateISO(c.entry));
    if (cands.length === 1) {
      const m = cands[0];
      const sharesOk = Math.abs((Number(m.shares) || 0) - c.shares) <= Math.max(1, c.shares * 0.02);
      return { ...c, action: sharesOk ? "reconcile" : "review", matchId: m.id, matchStop: Number(m.stop) || 0 };
    }
    if (cands.length > 1) return { ...c, action: "review", matchId: null };
    return { ...c, action: "new", matchId: null };
  });
  const posRows = openPos.map(p => {
    const synced = (positions || []).find(x => x.ibConid && x.ibConid === p.conid);
    if (synced) return { ...p, action: "synced", matchId: synced.id };
    const cands = (positions || []).filter(x => !isIbkr(x.source) && (x.sym || "").toUpperCase() === p.sym.toUpperCase());
    if (cands.length === 1) {
      const m = cands[0];
      const sharesOk = Math.abs((Number(m.shares) || 0) - Number(p.shares)) <= Math.max(1, Number(p.shares) * 0.05);
      return { ...p, action: sharesOk ? "reconcile" : "review", matchId: m.id };
    }
    if (cands.length > 1) return { ...p, action: "review", matchId: null };
    return { ...p, action: "new", matchId: null };
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
        linkExecId: link ? link.execId : null, exit: link ? link.exit : "", action: "close" };
    });

  return { account: data.account, fetchedAt: data.fetchedAt, posRows, tradeRows, closeRows };
}

// Interactive sync modal — preview + per-row decisions + confirm. Writes happen via onConfirm (App), surgically.
const ibkrDefaultChoice = (action) => action === "review" ? "skip" : action === "reconcile" ? "reconcile" : action === "synced" ? "update" : action === "close" ? "close" : "new";
function ibkrChoiceOpts(r) {
  if (r.action === "synced") return [["update", "Update"], ["skip", "Skip"]];
  if (r.action === "reconcile") return [["reconcile", "Reconcile"], ["new", "Keep both"], ["skip", "Skip"]];
  if (r.action === "review") return r.matchId ? [["reconcile", "Reconcile"], ["new", "Import as new"], ["skip", "Skip"]] : [["new", "Import as new"], ["skip", "Skip"]];
  if (r.action === "close") return [["close", "Close out"], ["skip", "Keep open"]];
  return [["new", "Import"], ["skip", "Skip"]];
}
function IbkrSyncModal({ open, onClose, status, data, error, result, onRetry, onConfirm }) {
  const [choices, setChoices] = useState({ pos: {}, trade: {}, close: {} });
  useEffect(() => {
    if (data) {
      const def = rows => (rows || []).reduce((m, r, i) => { m[i] = ibkrDefaultChoice(r.action); return m; }, {});
      setChoices({ pos: def(data.posRows), trade: def(data.tradeRows), close: def(data.closeRows) });
    }
  }, [data]);
  if (!open) return null;

  const chip = (action) => {
    const map = { new: { c: C.green, t: "New" }, synced: { c: C.muted, t: "Already synced" }, reconcile: { c: C.gold, t: "Matches manual" }, review: { c: C.red, t: "Needs review" }, close: { c: C.goldBright, t: "Closed at IBKR" } };
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
    onConfirm(resolve(data.posRows, choices.pos), resolve(data.tradeRows, choices.trade), resolve(data.closeRows, choices.close));
  };
  const willWrite = data ? [...Object.values(choices.pos), ...Object.values(choices.trade), ...Object.values(choices.close)].filter(c => c && c !== "skip").length : 0;

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
              </div>
              {result.errors && result.errors.length > 0 && <div style={{ marginTop: 12, fontSize: "0.66rem", color: C.red }}>{result.errors.length} row(s) failed and were skipped: {result.errors.slice(0, 3).join("; ")}{result.errors.length > 3 ? "…" : ""}</div>}
              <button onClick={onClose} style={{ marginTop: 18, padding: "9px 22px", borderRadius: 980, border: `1px solid ${C.borderGold}`, background: C.goldDim, color: C.gold, fontWeight: 800, fontSize: "0.74rem", cursor: "pointer", fontFamily: font }}>Done</button>
            </div>
          )}
          {(status === "preview" || status === "writing") && data && (
            <>
              <div style={{ padding: "10px 14px", background: "rgba(201,152,42,0.08)", border: `1px solid ${C.borderGold}`, borderRadius: 10, fontSize: "0.7rem", color: C.text, lineHeight: 1.6, marginBottom: 18 }}>
                <strong style={{ color: C.goldBright }}>Review before importing.</strong> Entry date on/after {IBKR_SYNC_FLOOR}. <strong style={{ color: C.white }}>Reconcile</strong> updates a manual entry with IBKR's exact figures and keeps your notes/tags. Nothing is ever deleted; manual rows you don't reconcile are untouched.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 10, marginBottom: 18 }}>
                <StatTile label="Account" value={data.account || "—"} />
                <StatTile label="Open Positions" value={String(data.posRows.length)} />
                <StatTile label="Closed Trades" value={String(data.tradeRows.length)} />
              </div>
              {[{ kind: "pos", title: "Open Positions", rows: data.posRows, cols: ["sym", "shares", "ep", "entry"], head: ["Symbol", "Shares", "Avg Cost", "Opened"] },
                { kind: "trade", title: "Closed Trades (round-trips)", rows: data.tradeRows, cols: ["ticker", "shares", "entryP", "exitP", "plDollar", "entry"], head: ["Symbol", "Shares", "Entry", "Exit", "P/L $", "In"] },
                ...(data.closeRows && data.closeRows.length ? [{ kind: "close", title: "Closed at IBKR — remove from Open Positions", rows: data.closeRows, cols: ["sym", "shares", "entry", "exit"], head: ["Symbol", "Shares", "Opened", "Closed"] }] : [])].map(sec => (
                <div key={sec.title} style={{ marginBottom: 18 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: sec.kind === "close" ? C.goldBright : C.gold, marginBottom: 8 }}>{sec.title} ({sec.rows.length})</div>
                  {sec.kind === "close" && <div style={{ fontSize: "0.64rem", color: C.muted, marginBottom: 8, lineHeight: 1.5 }}>These came in from IBKR and are now fully closed there. <strong style={{ color: C.text }}>Close out</strong> files the closed trade into your Journal and removes it from Open Positions (the record is archived, never destroyed, and recoverable). Choose <strong style={{ color: C.text }}>Keep open</strong> to leave it on the Dashboard.</div>}
                  {sec.rows.length === 0 ? <div style={{ fontSize: "0.72rem", color: C.muted, padding: "8px 0" }}>None from {IBKR_SYNC_FLOOR} onward.</div> : (
                    <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: 10 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem" }}>
                        <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>{sec.head.map(h => <th key={h} style={{ padding: "8px 8px", textAlign: "left", fontWeight: 700, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, whiteSpace: "nowrap" }}>{h}</th>)}<th style={{ padding: "8px 8px", textAlign: "center", fontWeight: 700, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>Status</th><th style={{ padding: "8px 8px", textAlign: "right", fontWeight: 700, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted }}>Action</th></tr></thead>
                        <tbody>{sec.rows.map((r, i) => (
                          <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.04)`, opacity: (choices[sec.kind][i] === "skip") ? 0.45 : 1 }}>
                            {sec.cols.map(col => <td key={col} style={{ padding: "7px 8px", color: col === "plDollar" ? (r[col] >= 0 ? C.green : C.red) : C.text, fontWeight: col === sec.cols[0] ? 700 : 400, whiteSpace: "nowrap" }}>{col === "ep" || col === "entryP" || col === "exitP" ? (r[col] !== undefined && r[col] !== "" ? Number(r[col]).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—") : col === "plDollar" ? `${r[col] >= 0 ? "+" : ""}${Number(r[col]).toLocaleString()}` : (r[col] ?? "—")}</td>)}
                            <td style={{ padding: "7px 8px", textAlign: "center" }}>{chip(r.action)}</td>
                            <td style={{ padding: "7px 8px", textAlign: "right" }}>{sel(sec.kind, i, r)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
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
function RiskTab({ demo }) {
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
  return (
    <div style={{ display:"flex",gap:28,padding:"24px 28px 32px",flexWrap:"wrap" }}>
      <div style={{ flex:"1 1 300px",display:"flex",flexDirection:"column",gap:16 }}>
        <TextInput label="Symbol" value={sym} onChange={setSym} placeholder="AAPL" />
        <div><label style={{fontWeight:700,fontSize:"0.60rem",letterSpacing:"0.12em",textTransform:"uppercase",color:C.muted,marginBottom:6,display:"block"}}>Type</label>
          <div style={{display:"flex",borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`}}>
            {["$","%"].map(m=>(<button key={m} onClick={()=>{setMode(m);setStopVal("")}} style={{padding:"10px 20px",background:mode===m?C.goldDim:"rgba(255,255,255,0.03)",border:"none",color:mode===m?C.gold:C.muted,fontWeight:700,fontSize:"0.78rem",cursor:"pointer",fontFamily:font}}>{m}</button>))}
          </div></div>
        <div style={{display:"flex",gap:12}}><CalcInput label="Share Price" value={sharePrice} onChange={setSharePrice} /><CalcInput label="Position Size" value={posSizePct} onChange={setPosSizePct} suffix="%" /></div>
        <CalcInput label="Portfolio Size" value={portfolio} onChange={setPortfolio} />
        <CalcInput label={mode === "%" ? "% Stop" : "$ Stop"} value={stopVal} onChange={setStopVal} suffix={mode === "%" ? "%" : "$"} />
      </div>
      <div style={{ flex:"1 1 300px",display:"flex",flexDirection:"column" }}>
        {!r?(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",minHeight:200,color:C.muted,fontSize:"0.82rem",textAlign:"center",lineHeight:1.6}}>
          <div style={{marginBottom:10}}>Fill in all fields to see your results.</div>
          <div style={{fontSize:"0.66rem",color:"rgba(255,255,255,0.28)",lineHeight:2}}>
            {!+sharePrice && <div style={{color:"rgba(239,68,68,0.6)"}}>&#x2717; Share Price</div>}
            {!+posSizePct && <div style={{color:"rgba(239,68,68,0.6)"}}>&#x2717; Position Size %</div>}
            {!+portfolio && <div style={{color:"rgba(239,68,68,0.6)"}}>&#x2717; Portfolio Size</div>}
            {!+stopVal && <div style={{color:"rgba(239,68,68,0.6)"}}>&#x2717; {mode === "%" ? "% Stop" : "$ Stop"}</div>}
            {+sharePrice > 0 && +stopVal > 0 && mode === "$" && +stopVal >= +sharePrice && <div style={{color:"rgba(239,68,68,0.6)"}}>$ Stop must be less than Share Price</div>}
            {+stopVal > 0 && mode === "%" && +stopVal >= 100 && <div style={{color:"rgba(239,68,68,0.6)"}}>% Stop must be under 100%</div>}
          </div>
        </div>):(<>
          <div style={{display:"flex",gap:12,marginBottom:16}}>
            <div style={{flex:1,padding:"14px 16px",borderRadius:12,background:C.goldDim,border:`1px solid ${C.borderGold}`,textAlign:"center"}}>
              <div style={{fontSize:"0.56rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.10em",color:C.muted,marginBottom:4}}># of Shares to Buy</div>
              <div style={{fontSize:"1.15rem",fontWeight:800,color:C.goldBright}}>{r.shares.toLocaleString()}</div>
            </div>
            <div style={{flex:1,padding:"14px 16px",borderRadius:12,background:"rgba(255,255,255,0.02)",border:`1px solid ${C.border}`,textAlign:"center"}}>
              <div style={{fontSize:"0.56rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.10em",color:C.muted,marginBottom:4}}>Risk as % of Equity</div>
              <div style={{fontSize:"1.15rem",fontWeight:800,color:r.riskPctEquity>2?C.red:r.riskPctEquity>1.5?C.gold:C.white}}>{r.riskPctEquity.toFixed(2)}%</div>
            </div>
          </div>
          <div style={{display:"flex",gap:0,marginBottom:16,borderRadius:10,overflow:"hidden",border:`1px solid ${C.border}`}}>
            {[{l:"$ Stop Amount",v:`$${r.totalRisk.toLocaleString(undefined,{minimumFractionDigits:2})}`},{l:"Stop Price",v:`$${r.stopPrice.toFixed(2)}`},{l:"$ Amt Position",v:`$${r.posValue.toLocaleString(undefined,{minimumFractionDigits:2})}`}].map((item,i)=>(
              <div key={i} style={{flex:1,padding:"12px 10px",textAlign:"center",background:"rgba(255,255,255,0.015)",borderRight:i<2?`1px solid ${C.border}`:"none"}}>
                <div style={{fontSize:"0.52rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.10em",color:C.muted,marginBottom:4}}>{item.l}</div>
                <div style={{fontSize:"0.88rem",fontWeight:700,color:C.white}}>{item.v}</div>
              </div>
            ))}
          </div>
          <div style={{borderRadius:10,overflow:"hidden",border:`1px solid ${C.border}`}}>
            <div style={{display:"flex",background:"rgba(255,255,255,0.03)",borderBottom:`1px solid ${C.border}`}}>
              {["1-R (Risk)","2R","3R","4R","5R","6R"].map((h,i)=>(<div key={i} style={{flex:1,padding:"8px 4px",textAlign:"center",fontSize:"0.56rem",fontWeight:700,color:i===0?C.muted:C.gold,textTransform:"uppercase",letterSpacing:"0.06em"}}>{h}</div>))}
            </div>
            <div style={{display:"flex",borderBottom:`1px solid rgba(255,255,255,0.03)`}}>
              {r.rTargets.map((t,i)=>(<div key={i} style={{flex:1,padding:"8px 4px",textAlign:"center",fontSize:"0.74rem",fontWeight:600,color:C.white}}>${(t.dollarR).toLocaleString(undefined,{minimumFractionDigits:2})}</div>))}
            </div>
            <div style={{display:"flex",borderBottom:`1px solid rgba(255,255,255,0.03)`}}>
              <div style={{flex:1,padding:"6px 4px",textAlign:"center",fontSize:"0.50rem",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em"}}>Upside target</div>
              {r.rTargets.slice(1).map((t,i)=>(<div key={i} style={{flex:1,padding:"6px 4px",textAlign:"center",fontSize:"0.72rem",fontWeight:600,color:C.green}}>${t.target.toFixed(2)}</div>))}
            </div>
            <div style={{display:"flex"}}>
              <div style={{flex:1,padding:"6px 4px",textAlign:"center",fontSize:"0.50rem",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em"}}>% Gain</div>
              {r.rTargets.slice(1).map((t,i)=>(<div key={i} style={{flex:1,padding:"6px 4px",textAlign:"center",fontSize:"0.72rem",fontWeight:600,color:C.green}}>{t.pctGain.toFixed(2)}%</div>))}
            </div>
          </div>
          {r.stopPct>10&&<Alert type="red">Stop exceeds 10%. Consider a tighter entry.</Alert>}
          {r.riskPctEquity>2&&<Alert type="red">Risk exceeds 2% of equity.</Alert>}
        </>)}
      </div>
    </div>
  );
}
function ExpectancyTab({ demo }) {
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
  return (
    <div style={{display:"flex",gap:28,padding:"24px 28px 32px",flexWrap:"wrap"}}>
      <div style={{flex:"1 1 300px",display:"flex",flexDirection:"column",gap:16}}>
        <CalcInput label="Portfolio Size" value={port} onChange={setPort} />
        <div style={{display:"flex",gap:12}}><CalcInput label="Position Size" value={posSize} onChange={setPosSize} suffix="%" /><CalcInput label="Desired Return" value={desRet} onChange={setDesRet} suffix="%" /></div>
        <div style={{display:"flex",gap:12}}><CalcInput label="Average Gain" value={avgGain} onChange={setAvgGain} suffix="%" /><CalcInput label="Average Loss" value={avgLoss} onChange={setAvgLoss} suffix="%" /></div>
        <CalcInput label="% of Winning Trades" value={winRate} onChange={setWinRate} suffix="%" />
      </div>
      <div style={{flex:"1 1 300px",display:"flex",flexDirection:"column"}}>
        {!r?(<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",minHeight:200,color:C.muted,fontSize:"0.82rem",textAlign:"center",lineHeight:1.6}}>Fill in all fields to<br/>see your results.</div>):(<>
          <ResultRow label="Avg $ Gain on Winning Trades" value={fmtD(r.avgDollarGain)} color={C.green} />
          <ResultRow label="# of Winning Trades" value={`${r.winningTrades}`} color={r.winningTrades<0?C.red:C.white} />
          <ResultRow label="Avg $ Loss on Losing Trades" value={fmtD(r.avgDollarLoss)} color={C.red} />
          <ResultRow label="# of Losing Trades" value={`${r.losingTrades}`} color={r.losingTrades<0?C.red:C.white} />
          <ResultRow label="Gain/Loss Ratio (Non-Adjusted)" value={r.glRatio.toFixed(2)} color={r.glRatio>=2?C.green:r.glRatio>=1?C.gold:C.red} highlight />
          <ResultRow label="$ Position Size" value={fmtD(r.dollarPosSize)} />
          <ResultRow label="Expected Net Return per Trade" value={`${r.ev>=0?"+":""}${r.ev.toFixed(2)}%`} color={r.ev>=0?C.green:C.red} />
          <ResultRow label="Expected $ Return per Trade" value={`${r.expectedDollarReturn>=0?"+":"-"}${fmtD(r.expectedDollarReturn)}`} color={r.expectedDollarReturn>=0?C.green:C.red} />
          <ResultRow label="$ Goal" value={fmtD(r.dollarGoal)} />
          <ResultRow label="Number of Trades to Reach Goal" value={r.tradesToGoal>0?`${r.tradesToGoal}`:"0"} color={r.tradesToGoal>0?C.goldBright:C.red} highlight />
          <ResultRow label="Gain/Loss Ratio (Adjusted)" value={r.glAdjusted.toFixed(2)} color={r.glAdjusted>=1?C.green:C.red} highlight />
          <ResultRow label="Optimal f" value={`${r.optimalF.toFixed(2)}%`} color={r.optimalF>0?C.green:C.red} />
          <ResultRow label="Breakeven Win Rate" value={`${r.beWinRate.toFixed(1)}%`} />
          <div style={{marginTop:14,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <Badge positive={r.ev>=0}>{r.ev>=0?"Positive Expectancy":"Negative Expectancy"}</Badge>
          </div>
          {r.glRatio<2&&<Alert type={r.glRatio<1?"red":"gold"}>{r.glRatio<1?"Cut losses faster.":"G/L below 2:1. Aim for 3:1."}</Alert>}
        </>)}
      </div>
    </div>
  );
}
function RiskFinanceTab({ demo }) {
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
      return { ...row, sharesToSell: x, effStop: Math.abs(effStopPct) };
    });
    const sbe = canFinance && profitPerShare > 0 ? sh * riskPerShare / (cp - st) : null;
    const sbePct = sbe !== null && sh > 0 ? (sbe / sh) * 100 : null;
    return{initRiskPct,plPct,rMult,plDollar,action,profitIfStopped:(sugStop-bp)*sh,sbe,sbePct,financeRows,canFinance,stopPctVal:initRiskPct};
  },[buyPrice,shares,stopPrice,curPrice]);
  return (
    <div style={{display:"flex",gap:28,padding:"24px 28px 32px",flexWrap:"wrap"}}>
      <div style={{flex:"1 1 300px",display:"flex",flexDirection:"column",gap:16}}>
        <CalcInput label="Buy Price" value={buyPrice} onChange={setBuyPrice} />
        <CalcInput label="# of Shares" value={shares} onChange={setShares} suffix="" placeholder="0" />
        <div style={{display:"flex",gap:12}}><CalcInput label="Stop Price" value={stopPrice} onChange={handleSP} /><CalcInput label="Percentage" value={stopPct} onChange={handleSPct} suffix="%" /></div>
        <CalcInput label="Current Price" value={curPrice} onChange={setCurPrice} />
      </div>
      <div style={{flex:"1 1 300px",display:"flex",flexDirection:"column"}}>
        {!r?(<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",minHeight:200,color:C.muted,fontSize:"0.82rem",textAlign:"center",lineHeight:1.6}}>Fill in all fields to<br/>see your results.</div>):(<>
          <div style={{display:"flex",gap:12,marginBottom:14}}>
            <div style={{flex:1,padding:"12px 14px",borderRadius:10,background:"rgba(255,255,255,0.02)",border:`1px solid ${C.border}`,textAlign:"center"}}>
              <div style={{fontSize:"0.50rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.10em",color:C.muted,marginBottom:2}}>Stop</div>
              <div style={{fontSize:"1.0rem",fontWeight:800,color:C.white}}>{r.stopPctVal.toFixed(2)}%</div>
            </div>
            <div style={{flex:1,padding:"12px 14px",borderRadius:10,background:r.plPct>=0?C.greenDim:"rgba(239,68,68,0.06)",border:`1px solid ${r.plPct>=0?"rgba(34,197,94,0.15)":"rgba(239,68,68,0.15)"}`,textAlign:"center"}}>
              <div style={{fontSize:"0.50rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.10em",color:C.muted,marginBottom:2}}>Current P/L</div>
              <div style={{fontSize:"1.0rem",fontWeight:800,color:r.plPct>=0?C.green:C.red}}>{r.plPct>=0?"+":""}{r.plPct.toFixed(2)}%</div>
            </div>
            <div style={{flex:1,padding:"12px 14px",borderRadius:10,background:r.rMult>=2?C.goldDim:"rgba(255,255,255,0.02)",border:`1px solid ${r.rMult>=2?C.borderGold:C.border}`,textAlign:"center"}}>
              <div style={{fontSize:"0.50rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.10em",color:C.muted,marginBottom:2}}>R-Multiple</div>
              <div style={{fontSize:"1.0rem",fontWeight:800,color:r.rMult>=3?C.green:r.rMult>=1?C.goldBright:r.rMult>=0?C.white:C.red}}>{r.rMult.toFixed(2)}R</div>
            </div>
          </div>
          {r.canFinance && r.plPct > 0 ? (
            <div style={{borderRadius:10,overflow:"hidden",border:`1px solid ${C.border}`,marginBottom:14}}>
              <div style={{display:"flex",background:"rgba(255,255,255,0.03)",borderBottom:`1px solid ${C.border}`,padding:"10px 0"}}>
                <div style={{flex:2,paddingLeft:14,fontSize:"0.54rem",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.10em"}}>Risk Financed</div>
                <div style={{flex:1,textAlign:"center",fontSize:"0.54rem",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.10em"}}># Shares to Sell</div>
                <div style={{flex:1,textAlign:"center",fontSize:"0.54rem",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.10em"}}>Effective Stop</div>
              </div>
              {r.financeRows.map((row, i) => (
                <div key={i} style={{display:"flex",padding:"10px 0",borderBottom:i<r.financeRows.length-1?`1px solid rgba(255,255,255,0.03)`:"none",background:i%2===0?"rgba(255,255,255,0.01)":"transparent",alignItems:"center"}}>
                  <div style={{flex:2,paddingLeft:14,fontSize:"0.78rem",fontWeight:row.pct===100?700:600,color:row.pct===100?C.goldBright:C.text}}>
                    {row.pct === 100 ? `Breakeven ${row.pct.toFixed(2)}%` : `${row.pct.toFixed(2)}%`}
                  </div>
                  <div style={{flex:1,textAlign:"center",fontSize:"0.78rem",fontWeight:600,color:C.white}}>
                    {row.sharesToSell !== null ? row.sharesToSell % 1 === 0 ? row.sharesToSell.toFixed(0) : row.sharesToSell.toFixed(1) : "—"}
                  </div>
                  <div style={{flex:1,textAlign:"center",fontSize:"0.78rem",fontWeight:600,color:row.pct===100?C.green:C.text}}>
                    {row.effStop !== null ? `${row.effStop.toFixed(2)}%` : "—"}
                  </div>
                </div>
              ))}
            </div>
          ) : r.plPct <= 0 ? (
            <Alert type="red">Position is underwater. Risk financing requires the current price to be above your entry.</Alert>
          ) : null}
          <div style={{marginTop:4,padding:"14px 16px",borderRadius:12,background:r.rMult>=3?C.greenDim:r.rMult>=2?C.goldDim:"rgba(255,255,255,0.02)",border:`1px solid ${r.rMult>=3?"rgba(34,197,94,0.18)":r.rMult>=2?C.borderGold:C.border}`}}>
            <div style={{fontSize:"0.58rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.12em",color:C.muted,marginBottom:6}}>Suggested Action</div>
            <div style={{fontSize:"0.82rem",fontWeight:600,color:r.rMult>=3?C.green:r.rMult>=2?C.goldBright:C.text,lineHeight:1.5}}>{r.action}</div>
          </div>
        </>)}
      </div>
    </div>
  );
}
// ─── Expected Move Calculator ───
function ExpectedMoveTab({ demo }) {
  const DEMO = { sym: "CRWD", stockPrice: "34.11", callPrice: "2.30", putPrice: "2.20" };
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

  return (
    <div style={{ padding: "24px 28px 32px" }}>
      {/* How-to guide toggle */}
      <div style={{ marginBottom: 20 }}>
        <button onClick={() => setShowGuide(!showGuide)} style={{
          padding: "10px 18px", borderRadius: 10, border: `1px solid ${C.borderGold}`,
          background: C.goldDim, color: C.goldBright, fontWeight: 700, fontSize: "0.72rem",
          cursor: "pointer", fontFamily: font, display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ fontSize: "0.9rem" }}>{showGuide ? "▾" : "▸"}</span>
          How to Find the Straddle Price
        </button>

        {showGuide && (
          <div style={{ marginTop: 12, padding: "20px 22px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`, lineHeight: 1.8 }}>
            <div style={{ fontWeight: 800, fontSize: "0.88rem", color: C.white, marginBottom: 12 }}>Step-by-Step: Finding the Straddle Price</div>

            <div style={{ fontWeight: 700, fontSize: "0.74rem", color: C.gold, marginBottom: 4 }}>What is a straddle?</div>
            <div style={{ fontSize: "0.74rem", color: C.text, marginBottom: 14 }}>
              A straddle is the combined cost of buying the at-the-money (ATM) call and ATM put at the same strike price, at the nearest expiration after earnings. It tells you how much the market expects the stock to move.
            </div>

            <div style={{ fontWeight: 700, fontSize: "0.74rem", color: C.gold, marginBottom: 4 }}>Step 1: Open your broker's options chain</div>
            <div style={{ fontSize: "0.74rem", color: C.text, marginBottom: 14 }}>
              Go to the stock's option chain in your broker (IBKR, Webull, Schwab, etc.) or a free site like Yahoo Finance → Options.
            </div>

            <div style={{ fontWeight: 700, fontSize: "0.74rem", color: C.gold, marginBottom: 4 }}>Step 2: Select the expiration date right after earnings</div>
            <div style={{ fontSize: "0.74rem", color: C.text, marginBottom: 14 }}>
              If earnings are on May 6th, pick the nearest expiration after that date (e.g., May 9th). This captures the earnings event.
            </div>

            <div style={{ fontWeight: 700, fontSize: "0.74rem", color: C.gold, marginBottom: 4 }}>Step 3: Find the at-the-money (ATM) strike</div>
            <div style={{ fontSize: "0.74rem", color: C.text, marginBottom: 14 }}>
              The ATM strike is the one closest to the current stock price. If the stock is at $34.11, the ATM strike is $34 or $34.50 — whichever is closest.
            </div>

            <div style={{ fontWeight: 700, fontSize: "0.74rem", color: C.gold, marginBottom: 4 }}>Step 4: Get the call and put prices</div>
            <div style={{ fontSize: "0.74rem", color: C.text, marginBottom: 14 }}>
              Look at the mid price (halfway between bid and ask) for the ATM call and ATM put. Enter both below. The calculator adds them to get the straddle price.
            </div>

            <div style={{ fontWeight: 700, fontSize: "0.74rem", color: C.gold, marginBottom: 4 }}>Why this matters for swing traders</div>
            <div style={{ fontSize: "0.74rem", color: C.text, marginBottom: 0 }}>
              If you're holding a position into earnings, the expected move tells you the range the stock is likely to land in. If your unrealized gain is less than the expected move, you're gambling — the stock could easily wipe your profit. Consider selling before earnings or at least reducing your size.
            </div>
          </div>
        )}
      </div>

      {/* Calculator inputs + results */}
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column", gap: 16 }}>
          <TextInput label="Symbol" value={sym} onChange={setSym} placeholder="AAPL" />
          <CalcInput label="Current Stock Price" value={stockPrice} onChange={setStockPrice} />
          <div style={{ display: "flex", gap: 12 }}>
            <CalcInput label="ATM Call Price (Mid)" value={callPrice} onChange={setCallPrice} />
            <CalcInput label="ATM Put Price (Mid)" value={putPrice} onChange={setPutPrice} />
          </div>
          {r && (
            <div style={{ padding: "14px 18px", borderRadius: 12, background: C.goldDim, border: `1px solid ${C.borderGold}` }}>
              <div style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.10em", color: C.muted, marginBottom: 4 }}>Straddle Price (Call + Put)</div>
              <div style={{ fontSize: "1.15rem", fontWeight: 800, color: C.goldBright }}>${r.straddle.toFixed(2)}</div>
            </div>
          )}
        </div>

        <div style={{ flex: "1 1 300px", display: "flex", flexDirection: "column" }}>
          {!r ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", minHeight: 200, color: C.muted, fontSize: "0.82rem", textAlign: "center", lineHeight: 1.6 }}>
              Enter stock price and at least<br />one option price to see results.
            </div>
          ) : (
            <>
              {/* Expected Move headline */}
              <div style={{ textAlign: "center", padding: "20px 0 18px" }}>
                <div style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: C.muted, marginBottom: 8 }}>Expected Move</div>
                <div style={{ fontSize: "2.2rem", fontWeight: 900, letterSpacing: "-0.04em", color: C.goldBright }}>±{r.expectedMovePct.toFixed(2)}%</div>
                <div style={{ fontSize: "0.76rem", fontWeight: 500, color: C.muted, marginTop: 4 }}>±${r.straddle.toFixed(2)} per share</div>
              </div>

              {/* Visual range bar */}
              <div style={{ padding: "18px 16px", borderRadius: 14, background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}`, marginBottom: 16 }}>
                <div style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.10em", color: C.muted, marginBottom: 14, textAlign: "center" }}>Expected Price Range After Earnings</div>
                {/* Bar visualization */}
                <div style={{ position: "relative", height: 44, marginBottom: 10 }}>
                  {/* Full bar background */}
                  <div style={{ position: "absolute", left: "10%", right: "10%", top: 14, height: 16, borderRadius: 8, background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}` }} />
                  {/* Expected range fill */}
                  <div style={{ position: "absolute", left: "20%", right: "20%", top: 14, height: 16, borderRadius: 8, background: `linear-gradient(90deg, ${C.redDim}, rgba(201,152,42,0.15), ${C.greenDim})`, border: `1px solid rgba(201,152,42,0.25)` }} />
                  {/* Current price marker */}
                  <div style={{ position: "absolute", left: "50%", top: 8, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ width: 2, height: 28, background: C.gold, borderRadius: 1 }} />
                  </div>
                  {/* Lower label */}
                  <div style={{ position: "absolute", left: "20%", top: 0, transform: "translateX(-50%)" }}>
                    <div style={{ fontSize: "0.64rem", fontWeight: 700, color: C.red, textAlign: "center" }}>${r.lowerTarget.toFixed(2)}</div>
                  </div>
                  {/* Upper label */}
                  <div style={{ position: "absolute", right: "20%", top: 0, transform: "translateX(50%)" }}>
                    <div style={{ fontSize: "0.64rem", fontWeight: 700, color: C.green, textAlign: "center" }}>${r.upperTarget.toFixed(2)}</div>
                  </div>
                </div>
                {/* Current price label below bar */}
                <div style={{ textAlign: "center", fontSize: "0.68rem", fontWeight: 600, color: C.gold }}>
                  Current: ${(+stockPrice).toFixed(2)}
                </div>
              </div>

              {/* Result rows */}
              <ResultRow label="Upper Target (bullish)" value={`$${r.upperTarget.toFixed(2)}`} color={C.green} />
              <ResultRow label="Lower Target (bearish)" value={`$${r.lowerTarget.toFixed(2)}`} color={C.red} />
              <ResultRow label="Expected Move ($)" value={`±$${r.straddle.toFixed(2)}`} color={C.goldBright} highlight />
              <ResultRow label="Expected Move (%)" value={`±${r.expectedMovePct.toFixed(2)}%`} color={C.goldBright} highlight />

              {/* Decision framework */}
              <div style={{ marginTop: 16, padding: "16px 18px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: "0.58rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.10em", color: C.muted, marginBottom: 10 }}>Earnings Decision Framework</div>
                <div style={{ fontSize: "0.74rem", color: C.text, lineHeight: 1.8 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <span style={{ color: C.green, fontWeight: 800, flexShrink: 0 }}>Hold</span>
                    <span>— Your unrealized P/L exceeds the expected move AND your stop is above entry (risk-free). You can afford the swing.</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <span style={{ color: C.gold, fontWeight: 800, flexShrink: 0 }}>Trim</span>
                    <span>— Sell enough shares to finance your risk (SBE) before earnings. Keep a free position and let the rest ride.</span>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span style={{ color: C.red, fontWeight: 800, flexShrink: 0 }}>Exit</span>
                    <span>— Your unrealized P/L is less than the expected move and your stop is below entry. You're gambling, not trading.</span>
                  </div>
                </div>
              </div>
            </>
          )}
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
function ReturnSimulatorTab({ portfolioSize, currentCapital }) {
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

  return (
    <div style={{ padding: "24px 28px 32px" }}>
      <p style={{ fontSize: "0.8rem", color: C.muted, margin: "0 0 20px", lineHeight: 1.6 }}>Model how the <strong style={{ color: C.text }}>size of your biggest winners</strong> and your average loss drive total compounded return. Same win rate can give wildly different outcomes — letting winners run is what moves the needle. Each trade compounds at <span style={{ color: C.text }}>equity × (1 + position size × trade return)</span>.</p>

      {/* Capital + sizing inputs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 10 }}>
        <CalcInput label="Start Capital" value={simStart} onChange={setSimStart} placeholder={baseStart ? Math.round(baseStart).toString() : "100000"} />
        <CalcInput label="Current Capital" value={simCurrent} onChange={setSimCurrent} placeholder={baseCurrent ? Math.round(baseCurrent).toString() : "100000"} />
        <CalcInput label="Position Size" value={simPosSize} onChange={setSimPosSize} suffix="%" placeholder="12" />
        <CalcInput label="Avg Loss" value={simAvgLoss} onChange={setSimAvgLoss} suffix="%" placeholder="5" />
      </div>
      <div style={{ fontSize: "0.6rem", color: C.muted, margin: "0 0 20px" }}>Current Capital = initial + realized profits (auto-filled from your journal). The simulation compounds from this — edit either field to override.</div>

      {/* Win/Loss input — by count OR by win rate */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.gold }}>Losing Trades</div>
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${C.border}` }}>
            {[{ k: "count", label: "By count #" }, { k: "rate", label: "By win rate %" }].map(({ k, label }) => (
              <button key={k} onClick={() => setSimLossMode(k)} style={{ padding: "6px 14px", background: simLossMode === k ? C.goldDim : "rgba(255,255,255,0.03)", border: "none", color: simLossMode === k ? C.gold : C.muted, fontWeight: 700, fontSize: "0.6rem", cursor: "pointer", fontFamily: font }}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14 }}>
          {simLossMode === "count"
            ? <CalcInput label="Losing Trades" value={simLosers} onChange={setSimLosers} suffix="#" placeholder="150" />
            : <CalcInput label="Win Rate" value={simWinRate} onChange={setSimWinRate} suffix="%" placeholder="40" />}
        </div>
      </div>

      {/* Winner tiers */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontWeight: 700, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.gold }}>Winning Trades <span style={{ color: C.muted, fontWeight: 400, textTransform: "none", letterSpacing: "normal" }}>— group your winners by size ({winnersCount} total)</span></div>
          <button onClick={() => setSimTiers(t => [...t, { count: "5", gain: "30" }])} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.borderGold}`, background: C.goldDim, color: C.gold, fontSize: "0.58rem", fontWeight: 700, cursor: "pointer", fontFamily: font }}>+ Add tier</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {simTiers.map((row, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, alignItems: "center" }}>
              <div style={{ position: "relative" }}>
                <input type="number" min="0" step="1" value={row.count} onChange={e => setSimTiers(t => t.map((r, idx) => idx === i ? { ...r, count: e.target.value } : r))} placeholder="count" style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 56px 10px 14px", color: C.white, fontSize: "0.82rem", fontFamily: font, outline: "none" }} onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: "0.62rem" }}>trades</span>
              </div>
              <div style={{ position: "relative" }}>
                <input type="number" step="any" value={row.gain} onChange={e => setSimTiers(t => t.map((r, idx) => idx === i ? { ...r, gain: e.target.value } : r))} placeholder="gain" style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 30px 10px 14px", color: C.white, fontSize: "0.82rem", fontFamily: font, outline: "none" }} onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.muted, fontSize: "0.74rem", fontWeight: 600 }}>%</span>
              </div>
              <button onClick={() => setSimTiers(t => t.filter((_, idx) => idx !== i))} disabled={simTiers.length <= 1} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: simTiers.length <= 1 ? "rgba(255,255,255,0.2)" : C.muted, fontSize: "0.7rem", cursor: simTiers.length <= 1 ? "not-allowed" : "pointer", fontFamily: font }}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {sim ? (<>
        {/* Result tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))", gap: 12, marginBottom: 16 }}>
          <StatTile big label="Total Return" value={`${sim.totalReturn >= 0 ? "+" : ""}${sim.totalReturn.toFixed(2)}%`} color={sim.totalReturn >= 0 ? C.green : C.red} sub={`${sim.total} trades · from ${fmt$(sim.base)}`} />
          <StatTile big label="Ending Balance" value={fmt$(sim.endEq)} color={C.gold} sub={sim.startCap && Math.round(sim.startCap) !== Math.round(sim.base) ? `${sim.fromStartReturn >= 0 ? "+" : ""}${sim.fromStartReturn.toFixed(0)}% from start` : "compounded"} />
          <StatTile label="Win Rate" value={`${sim.winRate.toFixed(1)}%`} sub={`${sim.winners}W / ${sim.losers}L`} />
          <StatTile label="Loss Drag" value={`×${sim.lossDrag.toFixed(2)}`} color={C.red} sub={`${sim.losers} losers @ ${(sim.avgLoss * 100).toFixed(1)}%`} />
        </div>

        {/* Per-tier contribution */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 13, padding: "6px 14px", marginBottom: 16, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem" }}>
            <thead><tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {["Winner Size", "Count", "Per-Trade", "Tier Multiple", "Share of Upside"].map((h, hi) => <th key={hi} style={{ padding: "9px 6px", textAlign: hi === 0 ? "left" : "right", fontWeight: 700, fontSize: "0.5rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, whiteSpace: "nowrap" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {(() => {
                const winLogSum = sim.tierStats.reduce((s, t) => s + t.logContrib, 0);
                return sim.tierStats.map((t, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                    <td style={{ padding: "8px 6px", color: C.green, fontWeight: 700 }}>+{(t.gain * 100).toFixed((t.gain * 100) % 1 === 0 ? 0 : 1)}%</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", color: C.text }}>{t.count}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", color: C.muted }}>×{t.perTrade.toFixed(3)}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", color: C.white, fontWeight: 700 }}>×{t.tierMult.toFixed(2)}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", color: C.goldBright, fontWeight: 700 }}>{winLogSum > 0 ? ((t.logContrib / winLogSum) * 100).toFixed(1) : "0.0"}%</td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>

        {/* Equity curve */}
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={sim.curve} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
            <defs><linearGradient id="gradSimTool" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.gold} stopOpacity={0.28} /><stop offset="100%" stopColor={C.gold} stopOpacity={0.02} /></linearGradient></defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="trade" stroke={C.muted} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis stroke={C.muted} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
            <Tooltip content={<ChartTip fmt={v => `$${Number(v).toLocaleString()}`} />} cursor={{ stroke: C.borderGold, strokeWidth: 1, strokeDasharray: "4 4" }} />
            <Area type="monotone" dataKey="equity" stroke={C.gold} strokeWidth={2.5} fill="url(#gradSimTool)" dot={false} name="Equity" />
            <ReferenceLine y={sim.base} stroke={C.muted} strokeDasharray="3 3" label={{ value: "Start", fill: C.muted, fontSize: 10 }} />
          </AreaChart>
        </ResponsiveContainer>

        {/* Scenario compare */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button onClick={() => setSimScenarios(s => [...s, { id: Date.now(), posSize: +simPosSize || 0, losers: sim.losers, avgLoss: +simAvgLoss || 0, winRate: sim.winRate, totalReturn: sim.totalReturn, endEq: sim.endEq, total: sim.total, tiers: sim.tierStats.map(t => ({ count: t.count, gain: t.gain * 100 })) }].slice(-6))} style={{ padding: "9px 16px", borderRadius: 980, border: `1px solid ${C.borderGold}`, background: C.goldDim, color: C.gold, fontSize: "0.64rem", fontWeight: 800, cursor: "pointer", fontFamily: font }}>＋ Save as scenario</button>
          {simScenarios.length > 0 && <button onClick={() => setSimScenarios([])} style={{ padding: "9px 16px", borderRadius: 980, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: "0.64rem", fontWeight: 700, cursor: "pointer", fontFamily: font }}>Clear all</button>}
          <span style={{ fontSize: "0.58rem", color: C.muted }}>Snapshot the current setup, change a tier, and compare side by side.</span>
        </div>

        {simScenarios.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 14 }}>
            {simScenarios.map((sc, si) => (
              <div key={sc.id} style={{ position: "relative", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 13, padding: "14px 16px" }}>
                <button onClick={() => setSimScenarios(s => s.filter(x => x.id !== sc.id))} style={{ position: "absolute", top: 8, right: 10, background: "transparent", border: "none", color: C.muted, fontSize: "0.7rem", cursor: "pointer", fontFamily: font }}>✕</button>
                <div style={{ fontSize: "0.56rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>Scenario {si + 1}</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: sc.totalReturn >= 0 ? C.green : C.red, letterSpacing: "-0.03em", marginBottom: 2 }}>{sc.totalReturn >= 0 ? "+" : ""}{sc.totalReturn.toFixed(0)}%</div>
                <div style={{ fontSize: "0.62rem", color: C.gold, fontWeight: 700, marginBottom: 10 }}>{fmt$(sc.endEq)}</div>
                <div style={{ fontSize: "0.56rem", color: C.muted, lineHeight: 1.7 }}>
                  <div>Pos size {sc.posSize}% · Avg loss {sc.avgLoss}%</div>
                  <div>Win rate {sc.winRate.toFixed(0)}% · {sc.total} trades</div>
                  <div style={{ marginTop: 6, color: C.text }}>{sc.tiers.map(t => `${t.count}×${t.gain}%`).join(" · ")}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </>) : (
        <div style={{ padding: "24px", textAlign: "center", color: C.muted, fontSize: "0.82rem" }}>Enter a position size and at least one winner tier to simulate.</div>
      )}
    </div>
  );
}

function PremiumToolsPage({ demo, portfolioSize, journaledTrades }) {
  const[tab,setTab]=useState(0);const tabs=["Return Simulator","Risk","Expectancy","Risk Finance","Expected Move"];
  const realizedPL = useMemo(() => (journaledTrades || []).reduce((s, t) => s + (t.plDollar || 0), 0), [journaledTrades]);
  const currentCapital = (+portfolioSize || 0) + realizedPL;
  return (<div>
    <Eyebrow>Premium Tools</Eyebrow>
    <h1 style={{fontWeight:800,fontSize:"clamp(1.5rem, 4vw, 2rem)",letterSpacing:"-0.04em",color:C.white,margin:"0 0 4px"}}>Optimise & Manage Risk</h1>
    <p style={{fontWeight:300,fontSize:"0.84rem",color:C.muted,margin:"0 0 24px",lineHeight:1.6}}>Simulate and optimise your returns, then define your risk before you enter. Calculate your edge. Protect your capital.</p>
    <GlassCard><div style={{display:"flex",borderBottom:`1px solid ${C.border}`,flexWrap:"wrap"}}>
      {tabs.map((t,i)=>(<button key={t} onClick={()=>setTab(i)} style={{flex:"1 1 120px",padding:"14px 0",textAlign:"center",fontWeight:tab===i?700:500,fontSize:"0.80rem",color:tab===i?C.white:C.muted,cursor:"pointer",background:"transparent",border:"none",fontFamily:font,borderBottom:tab===i?`2px solid ${C.gold}`:"2px solid transparent"}}>{t}</button>))}
    </div>
      {tab===0&&<ReturnSimulatorTab portfolioSize={portfolioSize} currentCapital={currentCapital}/>}{tab===1&&<RiskTab demo={demo}/>}{tab===2&&<ExpectancyTab demo={demo}/>}{tab===3&&<RiskFinanceTab demo={demo}/>}{tab===4&&<ExpectedMoveTab demo={demo}/>}
    </GlassCard>
    <LossRecoveryTable />
  </div>);
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
          const cd = candlesRef.current;
          let time = null;
          if (param.logical != null && cd.length) { const i = Math.max(0, Math.min(cd.length - 1, Math.round(param.logical))); time = cd[i] ? cd[i].time : null; }
          else if (param.time != null) time = param.time;
          if (placeRef.current) placeRef.current({ price, time, x: param.point.x, y: param.point.y });
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
  const timeToIndex = (time) => {
    const cd = candlesRef.current; if (!cd.length) return 0;
    if (time <= cd[0].time) return 0;
    if (time >= cd[cd.length - 1].time) return cd.length - 1;
    let lo = 0, hi = cd.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cd[mid].time < time) lo = mid + 1; else hi = mid; }
    return (lo > 0 && Math.abs(cd[lo - 1].time - time) <= Math.abs(cd[lo].time - time)) ? lo - 1 : lo;
  };
  const timeToX = (time) => { const ts = tsApi(); if (!ts) return null; const x = ts.logicalToCoordinate(timeToIndex(time)); return x == null ? null : x; };
  const priceToY = (price) => { const s = candleSeriesRef.current; if (!s) return null; const y = s.priceToCoordinate(price); return y == null ? null : y; };
  const xToTime = (x) => { const ts = tsApi(); if (!ts) return null; const lg = ts.coordinateToLogical(x); if (lg == null) return null; const cd = candlesRef.current; const i = Math.max(0, Math.min(cd.length - 1, Math.round(lg))); return cd[i] ? cd[i].time : null; };
  const yToPrice = (y) => { const s = candleSeriesRef.current; if (!s) return null; const p = s.coordinateToPrice(y); return p == null ? null : p; };

  const addDrawing = (d) => setDrawings(ds => [...ds, { id: `d${Date.now()}${Math.random().toString(36).slice(2, 6)}`, ...d }]);
  // Place the active tool's drawing. Coordinates come from Lightweight Charts itself (param.point /
  // param.logical via the chart's subscribeClick) — exact pane coordinates, so there's no offset/misalignment.
  const doPlace = ({ price, time, x, y }) => {
    if (price == null) return;
    if (tool === "hline") { addDrawing({ type: "hline", a: { time: time || 0, price } }); setTool("cursor"); }
    else if (tool === "trend" || tool === "rect") {
      if (time == null) return;
      if (!draft) setDraft({ time, price });
      else { addDrawing({ type: tool, a: draft, b: { time, price } }); setDraft(null); setTool("cursor"); }
    } else if (tool === "text") {
      setEditingText({ id: `d${Date.now()}${Math.random().toString(36).slice(2, 6)}`, x, y, value: "", a: { time: time || 0, price } });
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
            <span style={{ marginLeft: "auto" }}>{trade.entry}{trade.entryTime ? ` ${trade.entryTime}` : ""} → {trade.exit}{trade.exitTime ? ` ${trade.exitTime}` : ""}</span>
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

function TradeJournalPage({ journaledTrades, setJournaledTrades, setupTypes, tags: allTags, exitReasons, session, onManualSave, saveStatus, positions, setPositions, positionsRef, portfolioSize }) {
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
  const distRef = useRef(null); // scroll target for full Distribution section
  const [distMode, setDistMode] = useState("actual"); // "actual" | "cap" | "cleared"
  const [distCapVal, setDistCapVal] = useState(""); // Cap Losses at X%
  const [distTableEdits, setDistTableEdits] = useState({}); // {bucketIdx: {gains, losses}} manual overrides
  const [distGainMax, setDistGainMax] = useState(""); // extend fine 2% gain buckets up to this % (blank = auto from data, clamped to 100)
  const [distCustomTiers, setDistCustomTiers] = useState([]); // extra high-value point buckets for simulating monster winners, e.g. [150, 500]
  const [distTierInput, setDistTierInput] = useState(""); // input box for adding a custom tier
  const [drmaExplainerOpen, setDrmaExplainerOpen] = useState(false);
  // Drag reorder hooks — stat tiles, trade journal columns, open positions columns
  const statDrag = useDragReorder(12); // 12 stat tiles
  const tradeDrag = useDragReorder(17); // 17 trade journal columns
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
  const buildCanvasFromRef = useCallback(async (ref) => {
    const el = ref.current;
    if (!el) return null;
    const brandEl = el.querySelector(".viv-screenshot-brand");
    if (brandEl) brandEl.style.display = "block";
    // Hide share buttons and filter bar during capture
    const hideEls = el.querySelectorAll(".viv-share-btn, .viv-filter-bar, .viv-hide-screenshot");
    hideEls.forEach(e => e.style.display = "none");
    const canvas = await html2canvas(el, { backgroundColor: "#08080e", scale: 2, useCORS: true, logging: false });
    if (brandEl) brandEl.style.display = "none";
    hideEls.forEach(e => e.style.display = "");
    const ctx = canvas.getContext("2d");
    const wmHeight = 48 * 2;
    ctx.fillStyle = "rgba(8,8,14,0.85)";
    ctx.fillRect(0, canvas.height - wmHeight, canvas.width, wmHeight);
    ctx.fillStyle = C.gold;
    ctx.font = "bold 28px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("www.valensontrades.com  |  VIV Swing Trading", canvas.width / 2, canvas.height - wmHeight / 2 + 10);
    return canvas;
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

  // Scroll to full Distribution section when expanded
  useEffect(() => {
    if (distExpanded && distRef.current) {
      distRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
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
  const openReview = (t) => {
    if (expandedTrade === t.id) { setExpandedTrade(null); return; }
    const n = parseNotes(t.notes);
    setReviewDraft({ right: n.right || "", wrong: n.wrong || "", lessons: n.lessons || n._plain || "" });
    setReviewSavedId(null);
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
      const initRisk = ep > 0 && st > 0 ? (ep - st) / ep : 0;
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
  const deleteTrade = (id) => {
    const trade = journaledTrades.find(t => t.id === id);
    if (!window.confirm(`Delete ${trade?.ticker || "this"} trade from journal? This cannot be undone.`)) return;
    setDeletedTradeIds(prev => [...prev, id]);
    setJournaledTrades(prev => prev.filter(t => t.id !== id));
    if (editingId === id) setEditingId(null);
    // Immediately delete from Supabase (don't wait for debounced auto-save)
    supabase.from("trades").update({ is_deleted: true }).eq("id", id).then(({ error }) => {
      if (error) console.error("Trade delete error:", error.message);
    });
  };

  const activeFilterLabel = filterSetup !== "All" || filterTag !== "All" ? ` (filtered: ${filtered.length}/${allTrades.length})` : "";

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow>Trade Journal</Eyebrow>
          <h1 style={{ fontWeight: 800, fontSize: "clamp(1.5rem, 4vw, 2rem)", letterSpacing: "-0.04em", color: C.white, margin: 0 }}>Performance Tracker{activeFilterLabel && <span style={{ fontSize: "0.6em", color: C.muted, fontWeight: 400 }}>{activeFilterLabel}</span>}</h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <ShareDropdown menuOpen={shareMenuOpen} setMenuOpen={setShareMenuOpen} status={shareStatus} captureFn={captureStats} label="Stats" />
          <button onClick={onManualSave} disabled={saveStatus === "saving"} style={{ padding:"8px 16px",borderRadius:980,border:`1px solid ${saveStatus === "saved" ? "rgba(34,197,94,0.4)" : saveStatus === "error" ? "rgba(239,68,68,0.4)" : C.borderGold}`,background:saveStatus === "saved" ? "rgba(34,197,94,0.12)" : saveStatus === "error" ? "rgba(239,68,68,0.12)" : C.goldDim,color:saveStatus === "saved" ? C.green : saveStatus === "error" ? C.red : C.gold,fontWeight:700,fontSize:"0.72rem",cursor:saveStatus === "saving" ? "wait" : "pointer",fontFamily:font,transition:"all 0.2s",display:"flex",alignItems:"center",gap:6 }}>
            {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved ✓" : saveStatus === "error" ? "Save Failed" : "Save"}
          </button>
          <GoldBtn onClick={() => exportMasterCSV(positions, filtered)} small>Export CSV</GoldBtn>
          <label style={{ padding: "8px 16px", borderRadius: 980, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.05)", color: C.white, fontWeight: 700, fontSize: "0.72rem", cursor: "pointer", fontFamily: font }}>
            Import CSV
            <input type="file" accept=".csv" onChange={handleImport} style={{ display: "none" }} />
          </label>
          <button onClick={() => setShowImportGuide(!showImportGuide)} style={{ padding: "8px 12px", borderRadius: 980, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontWeight: 600, fontSize: "0.66rem", cursor: "pointer", fontFamily: font }}>
            {showImportGuide ? "Hide Guide" : "Import Guide"}
          </button>
        </div>
      </div>

      {/* Import result toast */}
      {importResult && (
        <Alert type={importResult.success ? "gold" : "red"}>
          {importResult.success
            ? importResult.master
              ? `Master import: ${importResult.posCount} position${importResult.posCount !== 1 ? "s" : ""} + ${importResult.tradeCount} trade${importResult.tradeCount !== 1 ? "s" : ""} imported. Remember to Save on both Dashboard and Journal.`
              : `Successfully imported ${importResult.count} trade${importResult.count > 1 ? "s" : ""}. They now appear in your closed trades below.`
            : "Import failed — could not parse any trades. Check that your CSV has a header row with recognizable column names."}
        </Alert>
      )}

      {/* Import Guide */}
      {showImportGuide && (
        <GlassCard style={{ padding: "22px 26px", marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: "0.92rem", color: C.white, marginBottom: 12 }}>How to Import Your Trades</div>
          <div style={{ fontSize: "0.74rem", color: C.text, lineHeight: 1.8 }}>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontWeight: 700, color: C.gold }}>Step 1:</span> Export your trades from the old webapp as CSV (or create a CSV in Excel/Google Sheets).
            </div>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontWeight: 700, color: C.gold }}>Step 2:</span> Make sure your CSV has a <span style={{ fontWeight: 700, color: C.white }}>header row</span> as the first line. Column names are auto-matched — we recognize common variations:
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: "14px 16px", marginBottom: 14, border: `1px solid ${C.border}`, overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: "0.66rem", width: "100%" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, color: C.gold, fontSize: "0.56rem", letterSpacing: "0.10em", textTransform: "uppercase" }}>Field</th>
                    <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, color: C.gold, fontSize: "0.56rem", letterSpacing: "0.10em", textTransform: "uppercase" }}>Accepted Headers</th>
                    <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, color: C.gold, fontSize: "0.56rem", letterSpacing: "0.10em", textTransform: "uppercase" }}>Required?</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Symbol", "Symbol, Ticker, Sym, Stock", "Yes"],
                    ["Entry Date", "Entry Date, Entry, Open Date", "No"],
                    ["Entry Time", "Entry Time, Time In (HH:MM)", "No"],
                    ["Exit Date", "Exit Date, Exit, Close Date", "No"],
                    ["Exit Time", "Exit Time, Time Out (HH:MM)", "No"],
                    ["Entry Price", "Entry Price, Buy Price, Avg Cost", "Recommended"],
                    ["Exit Price", "Exit Price, Sell Price, Close Price", "Recommended"],
                    ["Shares", "Shares, Qty, Quantity, Size", "Recommended"],
                    ["Stop", "Stop, Stop Price, Stop Loss", "No"],
                    ["Setup", "Setup, Setup Type, Strategy", "No"],
                    ["Tags", "Tags, Tag, Labels (semicolon-separated)", "No"],
                    ["P/L %", "P/L %, PL%, Return %", "Auto-calc if missing"],
                    ["P/L $", "P/L $, PL$, Profit", "Auto-calc if missing"],
                    ["R-Multiple", "R-Multiple, R-Mult, R", "Auto-calc if missing"],
                    ["Exit Reason", "Exit Reason, Reason", "No"],
                    ["Notes", "Notes, Note, Comments", "No"],
                  ].map(([field, headers, req], i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                      <td style={{ padding: "5px 10px", fontWeight: 600, color: C.white }}>{field}</td>
                      <td style={{ padding: "5px 10px", color: C.muted }}>{headers}</td>
                      <td style={{ padding: "5px 10px", color: req === "Yes" ? C.gold : req === "Recommended" ? C.text : C.muted, fontWeight: req === "Yes" ? 700 : 400 }}>{req}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontWeight: 700, color: C.gold }}>Step 3:</span> Click <span style={{ fontWeight: 700, color: C.white }}>Import CSV</span> and select your file. Trades are added instantly.
            </div>
            <div style={{ padding: "10px 14px", borderRadius: 10, background: C.goldDim, border: `1px solid ${C.borderGold}`, fontSize: "0.68rem", color: C.goldBright, lineHeight: 1.6 }}>
              <span style={{ fontWeight: 700 }}>Tips:</span> P/L %, P/L $, and R-Multiple are auto-calculated from entry/exit/shares/stop if not present. Tags should be semicolon-separated within one column (e.g. "Breakout; Momentum"). Unrecognized columns are ignored — your file can have extra columns with no issues.
            </div>
          </div>
        </GlassCard>
      )}

      {/* Filter Bar */}
      <GlassCard small style={{ padding: "12px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: "0.56rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>Filter</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "0.66rem", color: C.muted }}>Setup:</span>
            <MiniSelect value={filterSetup} onChange={setFilterSetup} options={["All", ...setupTypes]} width={120} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: "0.66rem", color: C.muted }}>Tag:</span>
            <MiniSelect value={filterTag} onChange={setFilterTag} options={["All", ...allTags]} width={130} />
          </div>
          {(filterSetup !== "All" || filterTag !== "All") && (
            <button onClick={() => { setFilterSetup("All"); setFilterTag("All"); }} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: "0.62rem", cursor: "pointer", fontFamily: font }}>Clear</button>
          )}
        </div>
      </GlassCard>

      <div ref={screenshotRef} style={{ background: C.bg }}>
      {/* Branding header — visible only in screenshot */}
      <div className="viv-screenshot-brand" style={{ display:"none",padding:"20px 24px 12px",marginBottom:8 }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <div style={{ display:"flex",alignItems:"center",gap:14 }}>
            <img src="/logo-mark.png" alt="VIV" style={{ width:34,height:"auto" }} />
            <div>
              <div style={{ fontWeight:800,fontSize:"1.1rem",color:C.white,letterSpacing:"-0.03em" }}>VIV Swing Trading</div>
              <div style={{ fontWeight:500,fontSize:"0.58rem",color:C.muted,letterSpacing:"0.04em" }}>www.valensontrades.com</div>
            </div>
          </div>
          <div style={{ fontWeight:600,fontSize:"0.58rem",color:C.muted }}>{new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
        </div>
      </div>

      {/* Stats — draggable tiles, recalculate based on filter */}
      {(() => {
        const tiles = [
          { label:"Total P/L", value:`$${Math.abs(stats.totalPL).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`, color:stats.totalPL>=0?C.green:C.red, prefix:stats.totalPL>=0?"+":"-", tip:"Total profit/loss in dollars across all closed trades in the current filter." },
          { label:"Win Rate", value:`${stats.ba.toFixed(2)}%`, color:stats.ba>=50?C.green:C.red, tip:"Percentage of closed trades that finished profitable." },
          { label:"Avg Gain", value:`${stats.avgGain.toFixed(2)}%`, color:C.green, prefix:"+", tip:"Average percentage return across winning trades only." },
          { label:"Avg Loss", value:`${stats.avgLoss.toFixed(2)}%`, color:C.red, prefix:"-", tip:"Average percentage loss across losing trades only." },
          { label:"Win/Loss Ratio", value:stats.glRatio.toFixed(2), color:stats.glRatio>=2?C.green:stats.glRatio>=1?C.gold:C.red, tip:"Average % win ÷ average % loss — how much bigger a typical winner is than a typical loser. Ignores win rate and each trade's risk." },
          { label:"Adj. W/L Ratio", value:stats.adjustedGL.toFixed(2), color:stats.adjustedGL>=1?C.green:C.red, sub:stats.adjustedGL>=1?"Net profitable":"Net unprofitable", tip:"Win/Loss ratio weighted by your win rate. Above 1.0 means the system is net profitable." },
          { label:"Largest Win", value:`${stats.largestWin.toFixed(2)}%`, color:C.green, prefix:"+", tip:"Biggest single winning trade by percentage return." },
          { label:"Largest Loss", value:`${stats.largestLoss.toFixed(2)}%`, color:C.red, tip:"Biggest single losing trade by percentage return." },
          { label:"Avg R-Mult", value:`${stats.avgR.toFixed(2)}R`, color:stats.avgR>=0?C.green:C.red, tip:"Average outcome per trade in units of risk taken (R = entry-to-stop distance). Your true per-trade expectancy — blends win rate and size, normalized by each trade's own risk." },
          { label:"Avg Hold (Win)", value:`${stats.avgHoldWin.toFixed(1)}d`, color:C.green, sub:"days", tip:"Average number of days winning trades were held." },
          { label:"Avg Hold (Loss)", value:`${stats.avgHoldLoss.toFixed(1)}d`, color:C.red, sub:"days", tip:"Average number of days losing trades were held." },
          { label:"Hold Ratio (W/L)", value:stats.holdRatio.toFixed(2), color:stats.holdRatio>=2?C.green:stats.holdRatio>=1?C.gold:C.red, sub:stats.holdRatio>=2?"Holding winners longer":stats.holdRatio>=1?"Acceptable":"Cutting winners too early", tip:"Avg win hold ÷ avg loss hold. Above 1.0 means you hold winners longer than losers — below 1.0 means you cut winners too early." },
        ];
        return (
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(168px, 1fr))",gap:12,marginBottom:20 }}>
            {statDrag.order.map((di, vi) => {
              const t = tiles[di];
              if (!t) return null;
              return <div key={di} {...statDrag.dragProps(vi)}><StatTile label={t.label} value={t.value} color={t.color} prefix={t.prefix} sub={t.sub} tip={t.tip} /></div>;
            })}
          </div>
        );
      })()}

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginBottom: 20 }}>
        <GlassCard style={{ padding: "18px 22px" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
            <div style={{ fontWeight: 700, fontSize: "0.76rem", color: C.white }}>Equity Curve</div>
            <div style={{ display:"flex",gap:6 }}>
              <div style={{display:"flex",borderRadius:6,overflow:"hidden",border:`1px solid ${C.border}`}}>
                {["$","%"].map(v=>(<button key={v} onClick={()=>setEqYAxis(v)} style={{padding:"3px 10px",background:eqYAxis===v?C.goldDim:"transparent",border:"none",color:eqYAxis===v?C.gold:C.muted,fontWeight:700,fontSize:"0.56rem",cursor:"pointer",fontFamily:font}}>{v}</button>))}
              </div>
              <div style={{display:"flex",borderRadius:6,overflow:"hidden",border:`1px solid ${C.border}`}}>
                {[["trades","By Date"],["months","By Month"]].map(([k,l])=>(<button key={k} onClick={()=>setEqXAxis(k)} style={{padding:"3px 10px",background:eqXAxis===k?C.goldDim:"transparent",border:"none",color:eqXAxis===k?C.gold:C.muted,fontWeight:700,fontSize:"0.56rem",cursor:"pointer",fontFamily:font}}>{l}</button>))}
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={170}>
            {(() => {
              const dataKey = eqYAxis === "$" ? "equity" : "equityPct";
              const baseline = eqYAxis === "$" ? +(portfolioSize || 0) : 0;
              const vals = equityData.map(d => d[dataKey]).filter(v => v != null);
              const maxVal = Math.max(...vals), minVal = Math.min(...vals);
              const range = maxVal - minVal;
              // Gradient offset: where baseline sits in the 0-1 range of the chart area
              const gradientOffset = range > 0 ? Math.max(0, Math.min(1, (maxVal - baseline) / range)) : 0;
              const allAbove = minVal >= baseline;
              const allBelow = maxVal <= baseline;
              return (
                <AreaChart data={equityData}>
                  <defs>
                    <linearGradient id="eqGradientFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.green} stopOpacity={allBelow ? 0 : 0.25} />
                      <stop offset={`${(gradientOffset * 100).toFixed(1)}%`} stopColor={allBelow ? "rgba(239,68,68,0.08)" : allAbove ? C.green : C.green} stopOpacity={allBelow ? 0.05 : allAbove ? 0.08 : 0.05} />
                      <stop offset={`${(gradientOffset * 100).toFixed(1)}%`} stopColor={allAbove ? C.green : C.red} stopOpacity={allAbove ? 0.08 : 0.05} />
                      <stop offset="100%" stopColor={C.red} stopOpacity={allAbove ? 0 : 0.25} />
                    </linearGradient>
                    <linearGradient id="eqGradientStroke" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.green} />
                      <stop offset={`${(gradientOffset * 100).toFixed(1)}%`} stopColor={C.green} />
                      <stop offset={`${(gradientOffset * 100).toFixed(1)}%`} stopColor={C.red} />
                      <stop offset="100%" stopColor={C.red} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="trade" tick={{fill:C.muted,fontSize:10}} tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tick={{fill:C.muted,fontSize:10}} tickLine={false} axisLine={false} tickFormatter={eqYAxis==="$" ? (v=>v>=1e6?`$${(v/1e6).toFixed(1)}M`:v>=1e3?`$${(v/1000).toFixed(0)}k`:`$${v}`) : (v=>`${v.toFixed(1)}%`)} domain={eqYAxis==="$"?['auto','auto']:undefined} />
                  <Tooltip content={<ChartTip fmt={eqYAxis==="$" ? (v=>`$${Number(v).toLocaleString()}`) : (v=>`${Number(v).toFixed(2)}%`)} />} cursor={{stroke:C.borderGold,strokeWidth:1,strokeDasharray:"4 4"}} />
                  {eqYAxis==="%"&&<ReferenceLine y={0} stroke={C.border} />}
                  {eqYAxis==="$"&&<ReferenceLine y={+(portfolioSize||0)} stroke={C.border} strokeDasharray="3 3" />}
                  <Area type="natural" name={eqYAxis==="$"?"Portfolio":"Cumulative"} dataKey={dataKey} stroke="url(#eqGradientStroke)" strokeWidth={2} fill="url(#eqGradientFill)" dot={false} activeDot={(props) => { const val = props.payload[dataKey]; const below = val < baseline; return <circle cx={props.cx} cy={props.cy} r={5} fill={below ? C.red : C.green} stroke={C.bg} strokeWidth={2} />; }} />
                </AreaChart>
              );
            })()}
          </ResponsiveContainer>
        </GlassCard>
        {/* ─── Distribution Analysis Preview ─── */}
        <GlassCard style={{ padding: "18px 22px", cursor:"pointer" }} onClick={() => setDistExpanded(true)}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
            <div style={{ fontWeight: 800, fontSize: "0.88rem", color: C.white, letterSpacing:"-0.02em" }}>Distribution Return</div>
            <div style={{ display:"flex",alignItems:"center",gap:12 }}>
              {distAnalysis.returnPerTrade !== undefined && <span style={{ fontSize:"0.82rem",fontWeight:700,background:"rgba(255,255,255,0.06)",border:`1px solid ${C.border}`,borderRadius:8,padding:"4px 12px",letterSpacing:"-0.02em" }}>Return/Trade: <span style={{ color: distAnalysis.returnPerTrade >= 0 ? C.green : C.red, fontWeight:800 }}>{distAnalysis.returnPerTrade.toFixed(2)}%</span></span>}
              <span style={{ color:C.muted,fontSize:"0.70rem" }}>▼</span>
            </div>
          </div>
          {/* Mini preview — losses LEFT, gains RIGHT (M360 distribution) */}
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={distAnalysis.butterflyData} barCategoryGap="12%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="range" tick={{fill:C.muted,fontSize:8}} axisLine={{stroke:C.border}} interval={2} />
              <YAxis tick={{fill:C.muted,fontSize:10}} axisLine={{stroke:C.border}} allowDecimals={false} />
              <Tooltip contentStyle={{background:"rgba(12,12,20,0.95)",border:`1px solid ${C.borderGold}`,borderRadius:10,fontSize:13,fontFamily:font,padding:"10px 14px",boxShadow:"0 8px 32px rgba(0,0,0,0.6)"}} labelStyle={{color:C.gold,fontWeight:700,fontSize:12,marginBottom:4}} itemStyle={{color:C.white,fontWeight:600}} formatter={(v,name,props)=>[v, props.payload.type==="loss"?"Losses":"Wins"]} />
              <Bar dataKey="count" radius={[2,2,0,0]} barSize={5}>
                {distAnalysis.butterflyData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.type === "loss" ? C.red : C.green} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>

      {/* Monthly Performance Table */}
      {monthlyPerf.length > 0 && (() => {
        const mTh = (text) => <th style={{ padding:"9px 6px",textAlign:"right",fontWeight:700,fontSize:"0.48rem",letterSpacing:"0.08em",textTransform:"uppercase",color:C.muted,whiteSpace:"nowrap" }}>{text}</th>;
        const mTd = (val, opts = {}) => {
          const { color, fw = 600, align = "right" } = opts;
          return <td style={{ padding:"7px 6px",textAlign:align,fontWeight:fw,fontSize:"0.68rem",color:color||C.text,whiteSpace:"nowrap" }}>{val}</td>;
        };
        const pf = (v, dp = 2) => `${v.toFixed(dp)}%`;
        const clr = (v, inv) => inv ? (v > 0 ? C.red : v < 0 ? C.green : C.text) : (v > 0 ? C.green : v < 0 ? C.red : C.text);
        // Aggregate totals
        const allTr = filtered;
        const allWins = allTr.filter(t => t.plPct > 0), allLosses = allTr.filter(t => t.plPct <= 0);
        const totAvgGain = allWins.length > 0 ? allWins.reduce((s,t) => s + t.plPct, 0) / allWins.length : 0;
        const totAvgLoss = allLosses.length > 0 ? Math.abs(allLosses.reduce((s,t) => s + t.plPct, 0) / allLosses.length) : 0;
        const totNet = totAvgGain - totAvgLoss;
        const totRatio = totAvgLoss > 0 ? totAvgGain / totAvgLoss : 0;
        const totCount = allTr.length, totWins = allWins.length, totLosses = allLosses.length;
        const totWinPct = totCount > 0 ? (totWins/totCount)*100 : 0;
        const totLossPct = totCount > 0 ? (totLosses/totCount)*100 : 0;
        const totBe = allTr.filter(t => t.plPct === 0).length;
        const totLgGain = allWins.length > 0 ? Math.max(...allWins.map(t => t.plPct)) : 0;
        const totLgLoss = allLosses.length > 0 ? Math.min(...allLosses.map(t => t.plPct)) : 0;
        const totLgNet = totLgGain + totLgLoss;
        const totLgRatio = Math.abs(totLgLoss) > 0 ? totLgGain / Math.abs(totLgLoss) : 0;
        const totComm = monthlyPerf.reduce((s,m) => s + m.comm, 0);
        return (
        <GlassCard style={{ marginBottom: 20 }}>
          <div style={{ padding: "18px 22px 6px" }}>
            <div style={{ fontWeight: 700, fontSize: "0.76rem", color: C.white }}>Tracker</div>
          </div>
          <div style={{ overflowX: "auto", padding: "0 22px 18px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.68rem" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {(() => { const defs = ["Date","Avg Gain","Avg Loss","Net","Ratio","Win %","Loss %","Wins","Losses","BE","# Trades","LG Gain","LG Loss","LG Net","Ratio","Avg Days Win","Avg Days Loss","Comm"]; return monthDrag.order.map((ci, vi) => <th key={`mh-${ci}`} {...monthDrag.dragProps(vi)} style={{padding:"9px 6px",textAlign:ci===0?"left":"right",fontWeight:700,fontSize:"0.48rem",letterSpacing:"0.08em",textTransform:"uppercase",color:C.muted,whiteSpace:"nowrap",cursor:"grab",userSelect:"none"}}>{defs[ci]}</th>); })()}
                </tr>
              </thead>
              <tbody>
                {monthlyPerf.map(m => {
                  const bgColor = m.net >= 0 ? "rgba(34,197,94,0.04)" : "rgba(239,68,68,0.04)";
                  return (
                    <DragTr key={m.month} order={monthDrag.order} style={{ borderBottom: `1px solid rgba(255,255,255,0.04)`, background: bgColor }}>
                      <td style={{ padding:"7px 6px",fontWeight:600,color:C.white,whiteSpace:"nowrap",fontSize:"0.68rem" }}>{m.label}</td>
                      {mTd(pf(m.avgGain), { color: C.green })}
                      {mTd(`-${pf(m.avgLoss)}`, { color: C.red })}
                      {mTd(pf(m.net), { color: clr(m.net), fw: 700 })}
                      {mTd(m.ratio.toFixed(2))}
                      {mTd(pf(m.winPct))}
                      {mTd(pf(m.lossPct))}
                      {mTd(m.wins, { color: C.green })}
                      {mTd(m.losses, { color: C.red })}
                      {mTd(m.be)}
                      {mTd(m.count, { fw: 700 })}
                      {mTd(pf(m.lgGain), { color: C.green })}
                      {mTd(pf(m.lgLoss), { color: C.red })}
                      {mTd(pf(m.lgNet), { color: clr(m.lgNet) })}
                      {mTd(m.lgRatio.toFixed(2))}
                      {mTd(m.avgDaysWin > 0 ? m.avgDaysWin.toFixed(0) : "0")}
                      {mTd(m.avgDaysLoss > 0 ? m.avgDaysLoss.toFixed(0) : "0")}
                      {mTd(`$${m.comm.toFixed(2)}`)}
                    </DragTr>
                  );
                })}
                {/* Totals row */}
                <DragTr order={monthDrag.order} style={{ borderTop: `2px solid ${C.border}`, background: "rgba(255,255,255,0.02)" }}>
                  <td style={{ padding:"8px 6px",fontWeight:800,color:C.white,textTransform:"uppercase",fontSize:"0.60rem",letterSpacing:"0.06em" }}>Total</td>
                  {mTd(pf(totAvgGain), { color: C.green, fw: 800 })}
                  {mTd(`-${pf(totAvgLoss)}`, { color: C.red, fw: 800 })}
                  {mTd(pf(totNet), { color: clr(totNet), fw: 800 })}
                  {mTd(totRatio.toFixed(2), { fw: 800 })}
                  {mTd(pf(totWinPct), { fw: 800 })}
                  {mTd(pf(totLossPct), { fw: 800 })}
                  {mTd(totWins, { color: C.green, fw: 800 })}
                  {mTd(totLosses, { color: C.red, fw: 800 })}
                  {mTd(totBe, { fw: 800 })}
                  {mTd(totCount, { fw: 800 })}
                  {mTd(pf(totLgGain), { color: C.green, fw: 800 })}
                  {mTd(pf(totLgLoss), { color: C.red, fw: 800 })}
                  {mTd(pf(totLgNet), { color: clr(totLgNet), fw: 800 })}
                  {mTd(totLgRatio.toFixed(2), { fw: 800 })}
                  {mTd("", { fw: 800 })}
                  {mTd("", { fw: 800 })}
                  {mTd(`$${totComm.toFixed(2)}`, { fw: 800 })}
                </DragTr>
              </tbody>
            </table>
          </div>
        </GlassCard>
        );
      })()}
      </div>{/* end screenshotRef */}

      {/* ═══════════════════════════════════════════════════════════════
          FULL DISTRIBUTION SECTION — scrolls here when preview clicked
          ═══════════════════════════════════════════════════════════════ */}
      {distExpanded && (
        <div ref={distRef} style={{ scrollMarginTop: 20 }}>
          <div ref={distScreenRef} style={{ background: C.bg }}>
          <div className="viv-screenshot-brand" style={{ display:"none",padding:"20px 24px 12px",marginBottom:8 }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
              <div style={{ display:"flex",alignItems:"center",gap:14 }}>
                <img src="/logo-mark.png" alt="VIV" style={{ width:34,height:"auto" }} />
                <div>
                  <div style={{ fontWeight:800,fontSize:"1.1rem",color:C.white,letterSpacing:"-0.03em" }}>VIV Swing Trading</div>
                  <div style={{ fontWeight:500,fontSize:"0.58rem",color:C.muted,letterSpacing:"0.04em" }}>www.valensontrades.com</div>
                </div>
              </div>
              <div style={{ fontWeight:600,fontSize:"0.58rem",color:C.muted }}>{new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
            </div>
          </div>
          <GlassCard style={{ marginBottom: 20 }}>
            <div style={{ padding: "18px 22px 6px" }}>
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6 }}>
                <div style={{ fontWeight: 800, fontSize: "0.88rem", color: C.white, letterSpacing:"-0.02em" }}>Distribution Return</div>
                <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                  <ShareDropdown menuOpen={distShareOpen} setMenuOpen={setDistShareOpen} status={distShareStatus} captureFn={captureDist} label="Distribution" />
                  {activeDistData.returnPerTrade !== undefined && <span style={{ fontSize:"0.82rem",fontWeight:700,background:"rgba(255,255,255,0.06)",border:`1px solid ${C.border}`,borderRadius:8,padding:"4px 12px",letterSpacing:"-0.02em" }}>Return/Trade: <span style={{ color: activeDistData.returnPerTrade >= 0 ? C.green : C.red, fontWeight:800 }}>{activeDistData.returnPerTrade.toFixed(2)}%</span></span>}
                  <span style={{ color:C.muted,fontSize:"0.70rem",cursor:"pointer",transition:"transform 0.2s",transform:"rotate(180deg)" }} onClick={()=>setDistExpanded(false)}>▼</span>
                </div>
              </div>

              {/* ── Toolbar — Refill Data | Clear | Cap Losses ── */}
              <div className="viv-hide-screenshot" style={{ display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:20 }}>
                <button onClick={() => { setDistMode("actual"); setDistCapVal(""); setDistTableEdits({}); }} style={{ padding:"8px 16px",borderRadius:8,border:`1px solid ${distMode==="actual"&&Object.keys(distTableEdits).length===0?C.gold:C.border}`,background:distMode==="actual"&&Object.keys(distTableEdits).length===0?"rgba(201,152,42,0.15)":"rgba(255,255,255,0.04)",color:distMode==="actual"&&Object.keys(distTableEdits).length===0?C.gold:C.muted,fontSize:"0.58rem",fontWeight:700,cursor:"pointer",fontFamily:font }}>Refill Data</button>
                <button onClick={() => { setDistMode("cleared"); setDistCapVal(""); setDistTableEdits({}); }} style={{ padding:"8px 16px",borderRadius:8,border:`1px solid ${distMode==="cleared"?C.gold:C.border}`,background:distMode==="cleared"?"rgba(201,152,42,0.15)":"rgba(255,255,255,0.04)",color:distMode==="cleared"?C.gold:C.muted,fontSize:"0.58rem",fontWeight:700,cursor:"pointer",fontFamily:font }}>Clear</button>
                <button onClick={() => setDistMode(distMode==="cap"?"actual":"cap")} style={{ padding:"8px 16px",borderRadius:8,border:`1px solid ${distMode==="cap"?C.gold:C.border}`,background:distMode==="cap"?"rgba(201,152,42,0.15)":"rgba(255,255,255,0.04)",color:distMode==="cap"?C.gold:C.muted,fontSize:"0.58rem",fontWeight:700,cursor:"pointer",fontFamily:font }}>Cap Losses</button>
                {distMode === "cap" && (
                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <input type="number" step="0.5" min="0.5" placeholder={stats.avgLoss.toFixed(1)} value={distCapVal} onChange={e => setDistCapVal(e.target.value)} style={{ width:90,padding:"7px 10px",background:"rgba(255,255,255,0.05)",border:`1px solid ${C.gold}`,borderRadius:8,color:C.white,fontSize:"0.72rem",fontFamily:font,outline:"none" }} />
                    <span style={{ fontSize:"0.52rem",color:C.muted }}>max %</span>
                    {distCapVal !== "" && activeDistData.cappedCount > 0 && <span style={{ fontSize:"0.52rem",color:C.gold,fontWeight:700 }}>{activeDistData.cappedCount} capped</span>}
                  </div>
                )}
                {/* Extend gain range — fine buckets up to N%, plus custom high tiers for simulating monster winners */}
                <div style={{ display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",borderLeft:`1px solid ${C.border}`,paddingLeft:12,marginLeft:2 }}>
                  <span style={{ fontSize:"0.52rem",color:C.muted,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase" }}>Simulate gains to</span>
                  <input type="number" step="2" min="20" max="100" placeholder="auto" value={distGainMax} onChange={e => setDistGainMax(e.target.value)} style={{ width:62,padding:"7px 8px",background:"rgba(255,255,255,0.05)",border:`1px solid ${distGainMax!==""?C.gold:C.border}`,borderRadius:8,color:C.white,fontSize:"0.72rem",fontFamily:font,outline:"none",textAlign:"center" }} />
                  <span style={{ fontSize:"0.52rem",color:C.muted }}>% fine</span>
                  <input type="number" step="any" min="1" placeholder="+ tier %" value={distTierInput} onChange={e => setDistTierInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { const v = parseFloat(distTierInput); if (v > 0 && !distCustomTiers.includes(v)) { setDistCustomTiers(t => [...t, v]); setDistTierInput(""); } } }} style={{ width:72,padding:"7px 8px",background:"rgba(255,255,255,0.05)",border:`1px solid ${C.border}`,borderRadius:8,color:C.white,fontSize:"0.72rem",fontFamily:font,outline:"none",textAlign:"center" }} />
                  <button onClick={() => { const v = parseFloat(distTierInput); if (v > 0 && !distCustomTiers.includes(v)) { setDistCustomTiers(t => [...t, v]); setDistTierInput(""); } }} style={{ padding:"7px 12px",borderRadius:8,border:`1px solid ${C.borderGold}`,background:C.goldDim,color:C.gold,fontSize:"0.58rem",fontWeight:700,cursor:"pointer",fontFamily:font }}>Add tier</button>
                  {[...distCustomTiers].sort((a,b)=>a-b).map(v => (
                    <span key={v} onClick={() => setDistCustomTiers(t => t.filter(x => x !== v))} title="Remove tier" style={{ display:"inline-flex",alignItems:"center",gap:5,padding:"5px 9px",borderRadius:980,border:`1px solid ${C.borderGold}`,background:"rgba(201,152,42,0.10)",color:C.goldBright,fontSize:"0.56rem",fontWeight:700,cursor:"pointer",fontFamily:font }}>{v}% ✕</span>
                  ))}
                </div>
              </div>

              {/* ── Summary Card ── */}
              {activeDistData.stats && (
                <div style={{ background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:13,padding:"16px 22px",marginBottom:24 }}>
                  <div style={{ fontSize:"0.62rem",fontWeight:700,color:C.white,marginBottom:12 }}>Summary{distMode==="cap"&&distCapVal!==""?" (Capped)":""}</div>
                  <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px 32px" }}>
                    {[
                      { label:"Total # of Trades:", val: activeDistData.stats.total },
                      { label:"Average Gain:", val: `${activeDistData.stats.avgGain.toFixed(2)}%` },
                      { label:"# of Wins:", val: activeDistData.stats.wins },
                      { label:"Win Rate:", val: `${activeDistData.stats.ba.toFixed(2)}%` },
                      { label:"Average Loss:", val: `${activeDistData.stats.avgLoss.toFixed(2)}%` },
                      { label:"# of Losses:", val: activeDistData.stats.losses },
                      { label:"Return Per Trade:", val: `${activeDistData.returnPerTrade.toFixed(2)}%`, color: activeDistData.returnPerTrade >= 0 ? C.green : C.red },
                      { label:"Win/Loss Ratio:", val: activeDistData.stats.glRatio.toFixed(2) },
                      { label:"Adjusted Win/Loss Ratio:", val: activeDistData.stats.adjustedGL.toFixed(2) },
                    ].map((s,i) => (
                      <div key={i} style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                        <span style={{ fontSize:"0.62rem",color:C.muted }}>{s.label}</span>
                        <span style={{ fontSize:"0.68rem",fontWeight:700,color:s.color||C.white }}>{s.val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Two-column layout: Charts (left) + Table (right) ── */}
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,marginBottom:24 }}>
                {/* LEFT COLUMN — Charts */}
                <div>
                  {/* Gains and Losses — Losses LEFT, Gains RIGHT (M360 layout) */}
                  <div style={{ background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:13,padding:"14px 16px",marginBottom:16 }}>
                    <div style={{ fontSize:"0.64rem",fontWeight:700,color:C.white,marginBottom:10 }}>Gains and Losses</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={activeDistData.butterflyData} barCategoryGap="12%">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="range" tick={{fill:C.muted,fontSize:8}} axisLine={{stroke:C.border}} interval={1} />
                        <YAxis tick={{fill:C.muted,fontSize:10}} axisLine={{stroke:C.border}} allowDecimals={false} />
                        <Tooltip contentStyle={{background:"rgba(12,12,20,0.95)",border:`1px solid ${C.borderGold}`,borderRadius:10,fontSize:13,fontFamily:font,padding:"10px 14px",boxShadow:"0 8px 32px rgba(0,0,0,0.6)"}} labelStyle={{color:C.gold,fontWeight:700,fontSize:12,marginBottom:4}} itemStyle={{color:C.white,fontWeight:600}} formatter={(v,name,props)=>[v, props.payload.type==="loss"?"Losses":"Wins"]} />
                        <Bar dataKey="count" radius={[2,2,0,0]} barSize={5}>
                          {(activeDistData.butterflyData||[]).map((entry, idx) => (
                            <Cell key={idx} fill={entry.type === "loss" ? C.red : C.green} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* DRMA Curve — butterfly: losses left, gains right */}
                  <div style={{ background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:13,padding:"14px 16px",marginBottom:16 }}>
                    <div style={{ fontSize:"0.64rem",fontWeight:700,color:C.white,marginBottom:2 }}>DRMA Curve <span style={{ fontWeight:400,fontSize:"0.52rem",color:C.muted }}>(Distribution Return Moving Average)</span></div>
                    <div style={{ fontSize:"0.48rem",color:C.muted,marginBottom:10 }}>Losses on the left, gains on the right. Per-bucket return contribution shows where your system bleeds or generates returns.</div>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={activeDistData.butterflyDrma}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="range" tick={{fill:C.muted,fontSize:8}} axisLine={{stroke:C.border}} interval={0} angle={-35} textAnchor="end" height={40} />
                        <YAxis tick={{fill:C.muted,fontSize:10}} axisLine={{stroke:C.border}} tickFormatter={v=>v.toFixed(1)} />
                        <Tooltip contentStyle={{background:"rgba(12,12,20,0.95)",border:`1px solid ${C.borderGold}`,borderRadius:10,fontSize:13,fontFamily:font,padding:"10px 14px",boxShadow:"0 8px 32px rgba(0,0,0,0.6)"}} labelStyle={{color:C.gold,fontWeight:700,fontSize:12,marginBottom:4}} itemStyle={{color:C.white,fontWeight:600}} formatter={(v,name,props)=>[Number(v).toFixed(3), props.payload.type === "loss" ? "Loss Contribution" : "Gain Contribution"]} />
                        <ReferenceLine y={0} stroke={C.border} strokeDasharray="3 3" />
                        <Bar dataKey="contribution" radius={[2,2,0,0]} barSize={5}>
                          {(activeDistData.butterflyDrma||[]).map((entry, idx) => (
                            <Cell key={idx} fill={entry.type === "loss" ? C.red : C.green} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* DRMA Explainer — collapsible */}
                  <div style={{ background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",marginBottom:16 }}>
                    <div onClick={() => setDrmaExplainerOpen(p => !p)} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer" }}>
                      <span style={{ fontSize:"0.58rem",fontWeight:700,color:C.gold }}>How to Use DRMA Effectively</span>
                      <span style={{ fontSize:"0.52rem",color:C.muted,transform:drmaExplainerOpen?"rotate(180deg)":"none",transition:"transform 0.2s" }}>▼</span>
                    </div>
                    {drmaExplainerOpen && (
                      <div style={{ marginTop:12,fontSize:"0.60rem",color:C.text,lineHeight:1.7 }}>
                        <p style={{ marginBottom:10 }}><strong style={{ color:C.white }}>What DRMA shows:</strong> Each bar represents how much return a specific loss/gain bucket contributes to your overall Return Per Trade. Tall green bars = where your system prints money. Tall red bars = where it bleeds.</p>
                        <p style={{ marginBottom:10 }}><strong style={{ color:C.white }}>Reading the chart:</strong> The left side shows loss contributions (negative ranges), the right side shows gain contributions. The further right a green bar is, the bigger winner it represents. The further left a red bar is, the bigger loser.</p>
                        <p style={{ marginBottom:10 }}><strong style={{ color:C.white }}>Example:</strong> If your 0-2% loss bucket has a -0.30% bar, and your 12-14% gain bucket has a +1.50% bar, your big winners in the 12-14% range are contributing 5x more to your return than your small losses are taking away. That's excellent edge asymmetry.</p>
                        <p style={{ marginBottom:10 }}><strong style={{ color:C.white }}>What to look for:</strong></p>
                        <p style={{ marginBottom:6,paddingLeft:12 }}>1. <strong style={{ color:C.green }}>Right-skewed green bars</strong> — your biggest returns come from larger winners. This means you're letting winners run.</p>
                        <p style={{ marginBottom:6,paddingLeft:12 }}>2. <strong style={{ color:C.red }}>Left-side red bars should be small</strong> — small red bars on the loss side mean you're cutting losses quickly. If your -6% to -8% bucket has a large red bar, you're holding losers too long.</p>
                        <p style={{ marginBottom:6,paddingLeft:12 }}>3. <strong style={{ color:C.white }}>Net positive sum</strong> — all bars combined should sum to your Return Per Trade. If the green outweighs the red, your system has edge.</p>
                        <p style={{ marginBottom:10 }}><strong style={{ color:C.white }}>Action steps:</strong> Use "Cap Losses" to simulate what happens if you cut your biggest losers earlier. If capping losses at your average loss % dramatically improves Return Per Trade, your loss management is the problem. If it barely moves, your win rate or win size is the issue.</p>
                        <p style={{ marginBottom:0,color:C.muted,fontStyle:"italic" }}>DRMA turns your distribution from a static picture into a diagnostic tool. Every bar tells you where to tighten or where to let ride.</p>
                      </div>
                    )}
                  </div>

                  {/* Gain & Loss Magnitude side by side */}
                  <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                    <div style={{ background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:13,padding:"14px 14px" }}>
                      <div style={{ fontSize:"0.60rem",fontWeight:700,color:C.white,marginBottom:2 }}>Gain Magnitude</div>
                      <div style={{ fontSize:"0.42rem",color:C.muted,marginBottom:8 }}>How your winning trades cluster by size.</div>
                      <ResponsiveContainer width="100%" height={150}>
                        <BarChart data={activeDistData.gainMag}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" /><XAxis dataKey="range" tick={{fill:C.muted,fontSize:8}} axisLine={{stroke:C.border}} interval={1} /><YAxis tick={{fill:C.muted,fontSize:9}} axisLine={{stroke:C.border}} allowDecimals={false} /><Tooltip contentStyle={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:10,fontSize:11,fontFamily:font}} formatter={(v)=>[v,"Wins"]} /><Bar dataKey="count" fill={C.green} radius={[2,2,0,0]} barSize={4} /></BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:13,padding:"14px 14px" }}>
                      <div style={{ fontSize:"0.60rem",fontWeight:700,color:C.white,marginBottom:2 }}>Loss Magnitude</div>
                      <div style={{ fontSize:"0.42rem",color:C.muted,marginBottom:8 }}>How your losing trades cluster by size.</div>
                      <ResponsiveContainer width="100%" height={150}>
                        <BarChart data={activeDistData.lossMag}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" /><XAxis dataKey="range" tick={{fill:C.muted,fontSize:8}} axisLine={{stroke:C.border}} interval={1} /><YAxis tick={{fill:C.muted,fontSize:9}} axisLine={{stroke:C.border}} allowDecimals={false} /><Tooltip contentStyle={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:10,fontSize:11,fontFamily:font}} formatter={(v)=>[v,"Losses"]} /><Bar dataKey="count" fill={C.red} radius={[2,2,0,0]} barSize={4} /></BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN — Distribution Table */}
                <div>
                  <div style={{ background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:13,padding:"14px 16px",height:"100%",overflowY:"auto" }}>
                    <table style={{ width:"100%",borderCollapse:"collapse",fontSize:"0.68rem" }}>
                      <thead>
                        <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                          {(() => { const defs = ["Range","# Gains","# Losses","↑ %","↓ %","Net","DRMA"]; return distDrag.order.map((ci, vi) => <th key={`dh-${ci}`} {...distDrag.dragProps(vi)} style={{ padding:"8px 6px",textAlign:defs[ci]==="Range"?"left":"center",fontWeight:700,fontSize:"0.54rem",color:C.white,whiteSpace:"nowrap",borderBottom:`2px solid ${C.border}`,cursor:"grab",userSelect:"none" }}>{defs[ci]}</th>); })()}
                        </tr>
                      </thead>
                      <tbody>
                        {activeDistData.tableData.map((r, i) => {
                          const hasData = r.gains > 0 || r.losses > 0;
                          const editCell = (field, val) => {
                            const num = parseInt(val);
                            if (isNaN(num) || num < 0) return;
                            setDistTableEdits(prev => ({ ...prev, [i]: { ...prev[i], [field]: num } }));
                          };
                          const cellInput = (field, value) => (
                            <input type="number" min="0" step="1" value={distTableEdits[i]?.[field] !== undefined ? distTableEdits[i][field] : value}
                              onChange={e => editCell(field, e.target.value)}
                              style={{ width:42,padding:"3px 4px",background:"rgba(255,255,255,0.05)",border:`1px solid ${distTableEdits[i]?.[field] !== undefined ? C.gold : "rgba(255,255,255,0.08)"}`,borderRadius:4,color:C.white,fontSize:"0.66rem",fontFamily:font,textAlign:"center",outline:"none" }}
                            />
                          );
                          return (
                            <DragTr key={i} order={distDrag.order} style={{ borderBottom:`1px solid rgba(255,255,255,0.04)` }}>
                              <td style={{ padding:"6px 6px",color:C.white,fontWeight:600,fontSize:"0.66rem" }}>{r.range}</td>
                              <td style={{ padding:"4px 4px",textAlign:"center" }}>{cellInput("gains", r.gains)}</td>
                              <td style={{ padding:"4px 4px",textAlign:"center" }}>{cellInput("losses", r.losses)}</td>
                              {hasData ? <td style={{ padding:"6px 6px",textAlign:"center",color:C.muted }}>{Math.round(r.gPct)}%</td> : <td style={{ padding:"6px 6px",textAlign:"center" }}></td>}
                              {hasData ? <td style={{ padding:"6px 6px",textAlign:"center",color:C.muted }}>{Math.round(r.lPct)}%</td> : <td style={{ padding:"6px 6px",textAlign:"center" }}></td>}
                              {hasData ? <td style={{ padding:"6px 6px",textAlign:"center",color:r.netPct>0?C.green:r.netPct<0?C.red:C.text,fontWeight:700 }}>{r.netPct.toFixed(2)}%</td> : <td style={{ padding:"6px 6px",textAlign:"center" }}></td>}
                              {hasData ? <td style={{ padding:"6px 6px",textAlign:"center",color:r.bucketRetContrib>=0?C.green:C.red,fontWeight:700 }}>{r.bucketRetContrib.toFixed(2)}</td> : <td style={{ padding:"6px 6px",textAlign:"center" }}></td>}
                            </DragTr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
          </div>{/* end distScreenRef */}
        </div>
      )}

      {/* Closed Trades Table — editable */}
      <div ref={closedTradesRef} style={{ background: C.bg }}>
      <div className="viv-screenshot-brand" style={{ display:"none",padding:"20px 24px 12px",marginBottom:8 }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between" }}>
          <div style={{ display:"flex",alignItems:"center",gap:14 }}>
            <img src="/logo-mark.png" alt="VIV" style={{ width:34,height:"auto" }} />
            <div>
              <div style={{ fontWeight:800,fontSize:"1.1rem",color:C.white,letterSpacing:"-0.03em" }}>VIV Swing Trading</div>
              <div style={{ fontWeight:500,fontSize:"0.58rem",color:C.muted,letterSpacing:"0.04em" }}>www.valensontrades.com</div>
            </div>
          </div>
          <div style={{ fontWeight:600,fontSize:"0.58rem",color:C.muted }}>{new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
        </div>
      </div>
      <GlassCard>
        <div style={{ padding: "18px 22px 6px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontWeight: 700, fontSize: "0.76rem", color: C.white }}>Closed Trades</div>
          <ShareDropdown menuOpen={closedShareOpen} setMenuOpen={setClosedShareOpen} status={closedShareStatus} captureFn={captureClosedTrades} label="Trades" />
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}>
            <thead>
              {(() => {
                const tradeHeaderDefs = [["Symbol","ticker"],["Entry","entry"],["Time","entryTime"],["Exit","exit"],["Time","exitTime"],["Entry $","entryP"],["Exit $","exitP"],["Shares","shares"],["Setup","setup"],["Tags",null],["P/L %","plPct"],["P/L $","plDollar"],["R-Mult","rMult"],["Reason","reason"],["Notes",null],["Chart",null],["",null]];
                return (
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {tradeDrag.order.map((ci, vi) => {
                      const [h, k] = tradeHeaderDefs[ci] || ["",""];
                      return <th key={`${h}-${ci}`} {...tradeDrag.dragProps(vi)} onClick={k ? (e) => { e.stopPropagation(); setTradeSorts(s => toggleSort(s, k, e.shiftKey)); } : undefined} style={{ padding:"9px 8px",textAlign:"left",fontWeight:700,fontSize:"0.52rem",letterSpacing:"0.10em",textTransform:"uppercase",color:tradeSorts.find(s=>s.key===k)?C.gold:C.muted,whiteSpace:"nowrap",cursor:"grab",userSelect:"none" }}>{h}{k ? sortArrow(tradeSorts, k) : ""}</th>;
                    })}
                  </tr>
                );
              })()}
            </thead>
            <tbody>
              {(() => {
                // Group trades by position: same ticker + entry price + entry date = same position
                const sorted = tradeSorts.length > 0 ? multiSort(filtered, tradeSorts) : filtered;
                const groupMap = new Map();
                sorted.forEach(t => {
                  const key = `${t.ticker}|${t.entryP}|${t.entry}`;
                  if (!groupMap.has(key)) groupMap.set(key, []);
                  groupMap.get(key).push(t);
                });
                // Flatten back but track group membership
                const rows = [];
                groupMap.forEach((trades, key) => {
                  const isGroup = trades.length > 1;
                  trades.forEach((t, gi) => rows.push({ t, isGroup, groupIdx: gi, groupSize: trades.length, groupKey: key, groupTrades: trades }));
                });
                return rows.map(({ t, isGroup, groupIdx, groupSize, groupKey, groupTrades }) => {
                const isEditing = editingId === t.id;
                const isFirstInGroup = groupIdx === 0;
                const isLastInGroup = groupIdx === groupSize - 1;
                // Group accent bar color
                const groupBorder = isGroup ? `3px solid ${C.gold}44` : "none";
                if (isEditing) {
                  return (<React.Fragment key={t.id}>
                    <tr style={{ background: "rgba(201,152,42,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "6px 6px" }}><TickerInput value={editRow.ticker} onChange={v => setEditRow(r => ({...r, ticker: v}))} /></td>
                      <td style={{ padding: "6px 6px" }}><input type="text" value={editRow.entry} onChange={e => setEditRow(r => ({...r, entry: e.target.value}))} style={{width:70,background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:5,padding:"5px 7px",color:C.white,fontSize:"0.72rem",fontFamily:font,outline:"none"}} /></td>
                      <td style={{ padding: "6px 6px" }}><input type="text" value={editRow.entryTime||""} onChange={e => setEditRow(r => ({...r, entryTime: e.target.value}))} placeholder="HH:MM" style={{width:50,background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:5,padding:"5px 5px",color:C.white,fontSize:"0.66rem",fontFamily:font,outline:"none",textAlign:"center"}} /></td>
                      <td style={{ padding: "6px 6px" }}><input type="text" value={editRow.exit} onChange={e => setEditRow(r => ({...r, exit: e.target.value}))} style={{width:70,background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:5,padding:"5px 7px",color:C.white,fontSize:"0.72rem",fontFamily:font,outline:"none"}} /></td>
                      <td style={{ padding: "6px 6px" }}><input type="text" value={editRow.exitTime||""} onChange={e => setEditRow(r => ({...r, exitTime: e.target.value}))} placeholder="HH:MM" style={{width:50,background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:5,padding:"5px 5px",color:C.white,fontSize:"0.66rem",fontFamily:font,outline:"none",textAlign:"center"}} /></td>
                      <td style={{ padding: "6px 6px" }}><CellInput value={editRow.entryP} onChange={v => setEditRow(r => ({...r, entryP: +v}))} width={72} /></td>
                      <td style={{ padding: "6px 6px" }}><CellInput value={editRow.exitP} onChange={v => setEditRow(r => ({...r, exitP: +v}))} width={72} /></td>
                      <td style={{ padding: "6px 6px" }}><CellInput value={editRow.shares} onChange={v => setEditRow(r => ({...r, shares: +v}))} width={60} /></td>
                      <td style={{ padding: "6px 6px" }}><MiniSelect value={editRow.setup} onChange={v => setEditRow(r => ({...r, setup: v}))} options={setupTypes} width={90} /></td>
                      <td style={{ padding: "6px 6px" }}><TagSelector selected={editRow.tags || []} allTags={allTags} onChange={v => setEditRow(r => ({...r, tags: v}))} small /></td>
                      <td colSpan={3} style={{ fontSize:"0.54rem",color:C.muted,textAlign:"center" }} />
                      <td style={{ padding: "6px 6px" }}><MiniSelect value={editRow.reason} onChange={v => setEditRow(r => ({...r, reason: v}))} options={exitReasons} width={110} /></td>
                      <td style={{ padding: "6px 6px", fontSize: "0.58rem", color: C.muted }}>see below</td>
                      <td style={{ padding: "6px 6px", fontSize: "0.58rem", color: C.muted }}>see below</td>
                      <td style={{ padding: "6px 6px", whiteSpace: "nowrap" }}>
                        <button onClick={saveEdit} style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${C.green}33`,background:C.greenDim,color:C.green,fontSize:"0.58rem",fontWeight:700,cursor:"pointer",fontFamily:font,marginRight:4}}>Save</button>
                        <button onClick={cancelEdit} style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontSize:"0.58rem",cursor:"pointer",fontFamily:font,marginRight:4}}>Cancel</button>
                      </td>
                    </tr>
                    {/* Expanded edit area: structured notes + chart URL + image upload */}
                    <tr style={{ background: "rgba(201,152,42,0.03)", borderBottom: `2px solid ${C.borderGold}` }}>
                      <td colSpan={17} style={{ padding: "14px 16px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                          {/* Left: Structured Notes */}
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "0.60rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.gold, marginBottom: 10 }}>Trade Review</div>
                            {editNotes._plain && (
                              <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}` }}>
                                <div style={{ fontSize: "0.56rem", fontWeight: 700, color: C.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Previous Notes</div>
                                <div style={{ fontSize: "0.70rem", color: C.text }}>{editNotes._plain}</div>
                              </div>
                            )}
                            {[{key:"right",label:"What Went Right",color:C.green},{key:"wrong",label:"What Went Wrong",color:C.red},{key:"lessons",label:"Lessons Learned",color:C.gold}].map(({key,label,color}) => (
                              <div key={key} style={{ marginBottom: 8 }}>
                                <label style={{ display: "block", fontWeight: 700, fontSize: "0.56rem", letterSpacing: "0.08em", textTransform: "uppercase", color, marginBottom: 4 }}>{label}</label>
                                <textarea value={editNotes[key]} onChange={e => setEditNotes(n => ({...n, [key]: e.target.value}))} placeholder={`${label}...`} rows={2}
                                  style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.white, fontSize: "0.72rem", fontFamily: font, outline: "none", resize: "vertical" }}
                                  onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
                              </div>
                            ))}
                          </div>
                          {/* Right: Chart Link + Image Upload */}
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "0.60rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.gold, marginBottom: 10 }}>Chart Reference</div>
                            <div style={{ marginBottom: 10 }}>
                              <label style={{ display: "block", fontWeight: 700, fontSize: "0.56rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>TradingView Link</label>
                              <input type="url" value={editRow.chartUrl||""} onChange={e => setEditRow(r => ({...r, chartUrl: e.target.value}))} placeholder="https://www.tradingview.com/chart/..."
                                style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.blue, fontSize: "0.72rem", fontFamily: font, outline: "none" }}
                                onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <label style={{ display: "block", fontWeight: 700, fontSize: "0.56rem", letterSpacing: "0.08em", textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>Chart Screenshot</label>
                              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <label style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.04)", color: C.white, fontWeight: 700, fontSize: "0.66rem", cursor: uploadingImage ? "wait" : "pointer", fontFamily: font, opacity: uploadingImage ? 0.5 : 1 }}>
                                  {uploadingImage ? "Uploading..." : "Upload Image"}
                                  <input type="file" accept="image/*" style={{ display: "none" }} disabled={uploadingImage}
                                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadChartImage(editRow.id, f); e.target.value = ""; }} />
                                </label>
                                {editRow.chartImage && <span style={{ fontSize: "0.62rem", color: C.green, fontWeight: 600 }}>✓ Image attached</span>}
                                {editRow.chartImage && <button onClick={() => setEditRow(r => ({...r, chartImage: ""}))} style={{ padding: "2px 6px", borderRadius: 4, border: `1px solid ${C.border}`, background: "transparent", color: C.red, fontSize: "0.54rem", cursor: "pointer", fontFamily: font }}>Remove</button>}
                              </div>
                            </div>
                            {/* Preview */}
                            {editRow.chartImage && (
                              <div style={{ marginTop: 8, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}` }}>
                                <img src={editRow.chartImage} alt="Chart" style={{ width: "100%", maxHeight: 200, objectFit: "contain", background: "#111" }} />
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>);
                }
                return (<React.Fragment key={t.id}>
                  <DragTr order={tradeDrag.order} style={{ borderBottom: isGroup && !isLastInGroup ? "1px dashed rgba(201,152,42,0.20)" : "1px solid rgba(255,255,255,0.03)", cursor: "pointer", borderLeft: groupBorder }} onDoubleClick={() => startEdit(t)}>
                    <td style={{ padding: "11px 8px", fontWeight: 700, color: C.gold }}>{isGroup && !isFirstInGroup ? <span style={{color:C.muted,fontSize:"0.56rem"}}>↳</span> : null} <SourceDot source={t.source} />{t.ticker}{isGroup && isFirstInGroup ? <span style={{marginLeft:4,fontSize:"0.48rem",fontWeight:600,color:C.muted,verticalAlign:"middle"}}>({groupSize})</span> : null}</td>
                    <td style={{ padding: "11px 8px", color: C.text }}>{t.entry}</td>
                    <td style={{ padding: "11px 6px", color: C.muted, fontSize: "0.62rem" }}>{t.entryTime||"—"}</td>
                    <td style={{ padding: "11px 8px", color: C.text }}>{t.exit||"—"}</td>
                    <td style={{ padding: "11px 6px", color: C.muted, fontSize: "0.62rem" }}>{t.exitTime||"—"}</td>
                    <td style={{ padding: "11px 8px", color: C.text }}>${(Number(t.entryP) || 0).toFixed(2)}</td>
                    <td style={{ padding: "11px 8px", color: C.text }}>${(Number(t.exitP) || 0).toFixed(2)}</td>
                    <td style={{ padding: "11px 8px", color: C.text }}>{(Number(t.shares) || 0).toLocaleString()}</td>
                    <td style={{ padding: "11px 8px" }}><TagChip label={t.setup} color={C.gold} small /></td>
                    <td style={{ padding: "11px 8px" }}><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{(t.tags||[]).map(tag => <TagChip key={tag} label={tag} color={C.blue} small />)}</div></td>
                    <td style={{ padding: "11px 8px", fontWeight: 700, color: (Number(t.plPct) || 0) >= 0 ? C.green : C.red }}>{(Number(t.plPct) || 0) >= 0 ? "+" : ""}{(Number(t.plPct) || 0).toFixed(2)}%</td>
                    <td style={{ padding: "11px 8px", fontWeight: 700, color: (Number(t.plDollar) || 0) >= 0 ? C.green : C.red }}>{(Number(t.plDollar) || 0) >= 0 ? "+" : "-"}${Math.abs(Number(t.plDollar) || 0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                    <td style={{ padding: "11px 8px", fontWeight: 700, color: (t.rMult == null) ? C.muted : (t.rMult >= 0 ? C.green : C.red) }}>{t.rMult == null ? "—" : `${Number(t.rMult).toFixed(2)}R`}</td>
                    <td style={{ padding: "11px 8px", color: C.muted, fontSize: "0.66rem", whiteSpace: "nowrap" }}>{t.reason}</td>
                    <td style={{ padding: "11px 8px", color: C.muted, fontSize: "0.64rem", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }} onClick={() => openReview(t)} title="Click to open chart + trade review">{notesPreview(t.notes) || "—"}</td>
                    <td style={{ padding: "11px 8px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: "0.72rem", cursor: "pointer" }} onClick={() => openReview(t)} title="Open chart + trade review">📈</span>
                        {t.chartUrl && <a href={t.chartUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.62rem", color: C.blue, textDecoration: "none", fontWeight: 600 }} title="Open TradingView chart">TV</a>}
                        {t.chartImage && <span style={{ fontSize: "0.62rem", color: C.green, fontWeight: 700, cursor: "pointer" }} onClick={() => openReview(t)} title="View chart image">📷</span>}
                      </div>
                    </td>
                    <td style={{ padding: "11px 8px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => openReview(t)} title="Open chart + trade review" style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${expandedTrade===t.id?C.borderGold:C.border}`,background:expandedTrade===t.id?C.goldDim:"transparent",color:expandedTrade===t.id?C.gold:C.muted,fontSize:"0.54rem",cursor:"pointer",fontFamily:font}}>Edit</button>
                        <button onClick={() => deleteTrade(t.id)} title="Delete trade" style={{padding:"3px 6px",borderRadius:6,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontWeight:700,fontSize:"0.58rem",cursor:"pointer",fontFamily:font}}>×</button>
                      </div>
                    </td>
                  </DragTr>
                  {/* Unified Chart + Review panel — live chart on top, editable trade review below */}
                  {expandedTrade === t.id && (
                    <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: `1px solid ${C.border}` }}>
                      <td colSpan={17} style={{ padding: "14px 20px" }}>
                        {/* Live candlestick chart — timeframes · MAs · volume · drawing tools · stats panel */}
                        <TradeChart trade={t} />
                        {/* Editable Trade Review */}
                        <div style={{ marginTop: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                            <div style={{ fontWeight: 700, fontSize: "0.62rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.gold }}>Trade Review</div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <button onClick={() => startEdit(t)} title="Edit the trade's factual details (dates, prices, shares, setup, tags)" style={{ padding: "5px 12px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontWeight: 700, fontSize: "0.6rem", cursor: "pointer", fontFamily: font }}>Edit details</button>
                              <button onClick={() => saveReview(t.id)} style={{ padding: "5px 16px", borderRadius: 7, border: `1px solid ${C.green}44`, background: C.greenDim, color: C.green, fontWeight: 700, fontSize: "0.6rem", cursor: "pointer", fontFamily: font }}>{reviewSavedId === t.id ? "Saved ✓" : "Save Review"}</button>
                              <button onClick={() => setExpandedTrade(null)} title="Close" style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontWeight: 700, fontSize: "0.6rem", cursor: "pointer", fontFamily: font }}>Close</button>
                            </div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                            {[{ key: "right", label: "What Went Right", color: C.green }, { key: "wrong", label: "What Went Wrong", color: C.red }, { key: "lessons", label: "Lessons Learned", color: C.gold }].map(({ key, label, color }) => (
                              <div key={key}>
                                <label style={{ display: "block", fontWeight: 700, fontSize: "0.56rem", letterSpacing: "0.08em", textTransform: "uppercase", color, marginBottom: 4 }}>{label}</label>
                                <textarea value={reviewDraft[key]} onChange={e => setReviewDraft(r => ({ ...r, [key]: e.target.value }))} placeholder={`${label}...`} rows={3}
                                  style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.white, fontSize: "0.72rem", fontFamily: font, outline: "none", resize: "vertical", lineHeight: 1.5 }}
                                  onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
                              </div>
                            ))}
                          </div>
                          {t.chartImage && (
                            <div style={{ marginTop: 12, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}`, maxWidth: 520 }}>
                              <img src={t.chartImage} alt={`${t.ticker} chart`} style={{ width: "100%", maxHeight: 280, objectFit: "contain", background: "#111" }} />
                            </div>
                          )}
                          {t.chartUrl && <div style={{ marginTop: 10 }}><a href={t.chartUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.70rem", color: C.blue, textDecoration: "underline" }}>Open TradingView Chart →</a></div>}
                        </div>
                      </td>
                    </tr>
                  )}
                  {/* Group summary row — after last trade in a multi-trade group */}
                  {isGroup && isLastInGroup && (() => {
                    const gTrades = groupTrades;
                    const totalShares = gTrades.reduce((s,tr) => s + (tr.shares || 0), 0);
                    const totalPLD = gTrades.reduce((s,tr) => s + (tr.plDollar || 0), 0);
                    const totalCost = gTrades.reduce((s,tr) => s + (tr.entryP * tr.shares), 0);
                    const weightedPct = totalCost > 0 ? (totalPLD / totalCost) * 100 : 0;
                    const avgR = gTrades.reduce((s,tr) => s + (tr.rMult || 0), 0) / gTrades.length;
                    return (
                      <tr style={{ borderBottom:`2px solid ${C.gold}22`, borderLeft: groupBorder, background:"rgba(201,152,42,0.04)" }}>
                        <td style={{ padding:"6px 8px", fontWeight:800, fontSize:"0.58rem", color:C.gold, letterSpacing:"0.06em" }}>COMBINED</td>
                        <td colSpan={6} />
                        <td style={{ padding:"6px 8px", fontWeight:700, fontSize:"0.68rem", color:C.text }}>{totalShares.toLocaleString()}</td>
                        <td colSpan={2} />
                        <td style={{ padding:"6px 8px", fontWeight:800, fontSize:"0.68rem", color:weightedPct>=0?C.green:C.red }}>{weightedPct>=0?"+":""}{weightedPct.toFixed(2)}%</td>
                        <td style={{ padding:"6px 8px", fontWeight:800, fontSize:"0.68rem", color:totalPLD>=0?C.green:C.red }}>{totalPLD>=0?"+":"-"}${Math.abs(totalPLD).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
                        <td style={{ padding:"6px 8px", fontWeight:700, fontSize:"0.68rem", color:avgR>=0?C.green:C.red }}>{avgR.toFixed(2)}R</td>
                        <td colSpan={4} style={{ padding:"6px 8px", fontSize:"0.54rem", color:C.muted }}>{gTrades.length} partial exits</td>
                      </tr>
                    );
                  })()}
                </React.Fragment>);
              });
              })()}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 22px 14px", fontSize: "0.62rem", color: C.muted }}>Double-click any row to edit. Changes auto-save.</div>
      </GlassCard>
      </div>{/* end closedTradesRef */}
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

function DashboardPage({ onJournalTrade, setupTypes, tags: allTags, exitReasons, positions, setPositions, portfolioSize, setPortfolioSize, fullSizePct, setFullSizePct, numStocks, setNumStocks, lastLoadedCountRef, lastSaveIdMapRef, session, targetRote, setTargetRote, journaledTrades, setJournaledTrades, onManualSave, saveStatus, positionsRef, saveErrorMsg, onIbkrSync }) {
  const [compactTable, setCompactTable] = useState(false);
  // Open Positions zoom — scales the whole table (5 steps each way, 70%–130%, 6% per step). Persisted as a UI-only pref.
  const [posZoom, setPosZoom] = useState(() => { const s = parseFloat(localStorage.getItem("viv-pos-zoom")); return Number.isFinite(s) ? Math.min(1.3, Math.max(0.7, s)) : 1; });
  const stepZoom = (dir) => setPosZoom(z => { const v = Math.min(1.3, Math.max(0.7, +(z + dir * 0.06).toFixed(2))); localStorage.setItem("viv-pos-zoom", String(v)); return v; });
  const resetZoom = () => { localStorage.setItem("viv-pos-zoom", "1"); setPosZoom(1); };
  const [riskBreakdownOpen, setRiskBreakdownOpen] = useState(false);
  const [sizerMode, setSizerMode] = useState("R"); // "R" = risk-based (default), "%" = position size
  const [rNumStocks, setRNumStocks] = useState(4);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [posSorts, setPosSorts] = useState([]); // [{key, dir}] multi-sort for positions
  const [posColWidths, setPosColWidths] = useState({}); // {colKey: width} for resizable columns
  const posDrag = useDragReorder(24); // ~24 open positions columns

  // Ref to always hold the latest onManualSave — fixes stale closure when
  // setTimeout fires after setPositions (state update hasn't rendered yet)
  const onManualSaveRef = useRef(onManualSave);
  useEffect(() => { onManualSaveRef.current = onManualSave; }, [onManualSave]);

  // fullSizePct is now the TARGET POSITION SIZE PER TRADE (%). perStock = $ at full size; fullSizeAmt = implied total if fully loaded.
  const sizer = useMemo(() => {
    const ps = +portfolioSize;
    if (!ps || ps <= 0) return null;
    const perTradePct = +fullSizePct || 0;
    const perStock = ps * (perTradePct / 100);
    const fullSizeAmt = perStock * numStocks;
    return { perTradePct, fullSizeAmt, impliedTotalPct: perTradePct * numStocks, full: perStock, half: perStock / 2, quarter: perStock / 4, pilot: perStock / 8 };
  }, [portfolioSize, fullSizePct, numStocks]);
  const targetPosPct = +fullSizePct || 0; // benchmark for Open Positions Exp % colour coding

  // R-based sizer: Account × ROTE% = total risk budget, ÷ max positions = R$ per trade
  const rSizer = useMemo(() => {
    const ps = +portfolioSize;
    if (!ps || ps <= 0) return null;
    const rotePct = +(targetRote || 0);
    const totalBudget = ps * (rotePct / 100);
    const n = rNumStocks || 1;
    const fullR = totalBudget / n;
    return { totalBudget, fullR, halfR: fullR / 2, quarterR: fullR / 4, pilotR: fullR / 8, rotePct, n };
  }, [portfolioSize, targetRote, rNumStocks]);
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
      if (!window.confirm(`Remove ${pos?.sym || "this"} position? This will delete it from your open positions.`)) return;
    }
    setPositions(prev => {
      const next = prev.filter(p => p.id !== id);
      if (lastLoadedCountRef) lastLoadedCountRef.current = next.length; // update so autosave safety check doesn't block intentional removal
      positionsRef.current = next; // Eagerly sync ref for emergencySave
      return next;
    });
  }, [lastLoadedCountRef]);

  // Remap sellId when autosave replaces position IDs
  useEffect(() => {
    if (!sellId || !lastSaveIdMapRef || lastSaveIdMapRef.current.size === 0) return;
    const newId = lastSaveIdMapRef.current.get(sellId);
    if (newId && newId !== sellId) {
      setSellId(newId);
    }
  }, [positions]); // fires after setPositions syncs IDs from savePositionsNow

  // Sell flow
  const startSell = (p) => { setSellId(p.id); setSellQty(p.shares); setSellPrice(p.cp); setSellReason(exitReasons[0] || "Sold Into Strength"); setSellTags([]); setSellAddJournal(true); setSellNotes(""); setSellComm(""); setSellChartUrl(p.chartUrl || ""); const posNotes = parseNotes(p.notes); setSellNotesStruct({ right: posNotes.right || "", wrong: posNotes.wrong || "", lessons: posNotes.lessons || "" }); };
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
        reason: sellReason, notes: finalNotes, chartUrl: sellChartUrl || pos.chartUrl || "", chartImage: pos.chartImage || "", _fromDashboard: true,
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
        };
        const { data: inserted, error } = await supabase.from("trades").insert([dbRow]).select("id");
        if (!error && inserted && inserted.length > 0) {
          // Use real DB id so it won't be re-inserted on next trade save
          onJournalTrade({ ...tradeObj, id: inserted[0].id });
        } else {
          console.error("Sell trade insert failed:", error?.message);
          // Fallback: add to state with temp id — manual save will pick it up
          onJournalTrade({ ...tradeObj, id: Date.now() });
        }
      } else {
        onJournalTrade({ ...tradeObj, id: Date.now() });
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

  // Compute compEquity BEFORE enriched so expPct can be sorted
  const compRealizedPL = useMemo(() => {
    if (!journaledTrades || journaledTrades.length === 0) return 0;
    return journaledTrades.reduce((sum, t) => sum + (t.plDollar || 0), 0);
  }, [journaledTrades]);
  const compPs = +portfolioSize || 0;
  const compEquity = compPs + compRealizedPL;

  // Parse date string (M/D/YY, M/D/YYYY, YYYY-MM-DD) to ms timestamp for comparison
  const parseDateMs = useCallback((d) => {
    if (!d) return 0;
    const s = d.trim();
    // M/D/YY or M/D/YYYY
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m) { const y = m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]); return new Date(y, parseInt(m[1])-1, parseInt(m[2])).getTime(); }
    // YYYY-MM-DD
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2])-1, parseInt(iso[3])).getTime();
    return 0;
  }, []);

  // Realized P/L per position — ONLY counts journal trades that are partial sells of the SAME lot.
  // Match: same ticker AND the SAME entry date (a partial sell keeps the position's entry date).
  // A separate round-trip in the same ticker (different entry date) is a distinct trade and is NOT
  // attributed here — that previously inflated/confused the open position's "Realized" figure.
  const realizedByPosition = useMemo(() => {
    const map = {};
    if (!journaledTrades || !positions) return map;
    positions.forEach(p => {
      if (!p.sym) return;
      const posEntryMs = parseDateMs(p.entry);
      if (!posEntryMs) { map[p.id] = 0; return; } // no valid entry date → can't attribute
      const realized = journaledTrades
        .filter(t => t.ticker === p.sym && parseDateMs(t.entry) === posEntryMs)
        .reduce((sum, t) => sum + (t.plDollar || 0), 0);
      // Use position id as key (not ticker) to handle multiple positions of same ticker
      map[p.id] = realized;
    });
    return map;
  }, [journaledTrades, positions, parseDateMs]);

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
    // Realized P/L from partial sells of THIS position (not all trades of same ticker)
    const realizedPL = realizedByPosition[p.id] || 0;
    // Cost financed = realized profits >= initial risk (playing with house money)
    const costFinanced = realizedPL > 0 && initRiskD > 0 && realizedPL >= initRiskD;
    return { ...p, epN, cpN, commN, stop1, stop2, tsN, hasTS, sharesN, h1, h2, posValue, expPct, realizedPL, costFinanced, tier, isDual, activeStop, dtsD, dtsPct, dtsTotalD, rtsD, sbe, sbePct, plPct, plD, rMult, riskStatus, roteD, rotePct, currentRoteD, currentRotePct, riskFreePct, riskExposurePct, rPerShare, currentRLevel, rAchieved, rSuggestedStop, rLockedProfit, rNextTarget, dtsR, rtsR };
  } catch (err) { console.error("Enrichment error for position:", p.id, err); return { ...p, epN:0, cpN:0, commN:0, stop1:0, stop2:0, tsN:0, hasTS:false, sharesN:0, h1:0, h2:0, posValue:0, expPct:0, realizedPL:0, costFinanced:false, tier:"Pilot", isDual:false, activeStop:0, dtsD:0, dtsPct:0, dtsTotalD:0, rtsD:0, sbe:0, sbePct:0, plPct:0, plD:0, rMult:0, riskStatus:"—", roteD:0, rotePct:0, currentRoteD:0, currentRotePct:0, riskFreePct:0, riskExposurePct:0, rPerShare:0, currentRLevel:0, rAchieved:0, rSuggestedStop:0, rLockedProfit:0, rNextTarget:0, dtsR:0, rtsR:0 }; }
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


  const compTh = (text, align = "right") => <th style={{padding:"10px 8px",textAlign:align,fontWeight:700,fontSize:"0.50rem",letterSpacing:"0.10em",textTransform:"uppercase",color:C.muted,whiteSpace:"nowrap"}}>{text}</th>;

  const th = (text, align = "right", sortKey = null) => <th onClick={sortKey ? (e) => setPosSorts(s => toggleSort(s, sortKey, e.shiftKey)) : undefined} style={{ padding:"10px 6px",textAlign:align,fontWeight:700,fontSize:"0.50rem",letterSpacing:"0.10em",textTransform:"uppercase",color:posSorts.find(s=>s.key===sortKey)?C.gold:C.muted,whiteSpace:"nowrap",cursor:sortKey?"pointer":"default",userSelect:"none" }}>{text}{sortKey ? sortArrow(posSorts, sortKey) : ""}</th>;

  return (
    <div>
      <Eyebrow>Dashboard</Eyebrow>
      <h1 style={{ fontWeight:800,fontSize:"clamp(1.5rem, 4vw, 2rem)",letterSpacing:"-0.04em",color:C.white,margin:"0 0 24px" }}>Trading Dashboard</h1>

      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:14,marginBottom:24 }}>
        <StatTile big label="Portfolio" value={fmt$(+portfolioSize)} sub="Starting capital" />
        <StatTile big label="Deployed" value={fmt$(totals.totalValue)} sub={`${totals.count} positions`} />
        <StatTile big label="Open P/L" value={`${Math.abs(totals.totalPL).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`} color={totals.totalPL>=0?C.green:C.red} prefix={totals.totalPL>=0?"+$":"-$"} />
        <StatTile big label="Total RTS" value={totals.totalRTS<=0?"FREE":fmt$(Math.abs(totals.totalRTS))} color={totals.totalRTS<=0?C.green:C.red} sub="Goal: $0 (FREE)" />
      </div>

      {/* Position Sizer */}
      <GlassCard style={{ padding: "28px", marginBottom: 20 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10 }}>
          <div>
            <Eyebrow>Position Sizer</Eyebrow>
            <div style={{ fontWeight:800,fontSize:"1.05rem",letterSpacing:"-0.03em",color:C.white }}>{sizerMode === "R" ? "Risk-Based Sizing (R)" : "Percent-Based Sizing (%)"}</div>
          </div>
          <div style={{ display:"flex",borderRadius:10,overflow:"hidden",border:`1px solid ${C.border}` }}>
            {[{k:"R",label:"R Mode"},{k:"%",label:"% Mode"}].map(({k,label})=>(
              <button key={k} onClick={()=>setSizerMode(k)} style={{padding:"8px 18px",background:sizerMode===k?C.goldDim:"rgba(255,255,255,0.03)",border:"none",color:sizerMode===k?C.gold:C.muted,fontWeight:800,fontSize:"0.72rem",cursor:"pointer",fontFamily:font,transition:"all 0.15s"}}>{label}</button>
            ))}
          </div>
        </div>

        <CalcInput label="Account Size" value={portfolioSize} onChange={setPortfolioSize} style={{ maxWidth:300,marginBottom:24 }} />

        {sizerMode === "%" ? (
          <>
            <div style={{ display:"flex",gap:20,alignItems:"flex-end",flexWrap:"wrap",marginBottom:20 }}>
              <div style={{ flex:"0 0 auto" }}>
                <div style={{ fontWeight:700,fontSize:"0.56rem",letterSpacing:"0.10em",textTransform:"uppercase",color:C.muted,marginBottom:6 }}>Target Size / Trade</div>
                <div style={{ position:"relative",width:160 }}>
                  <input type="number" step="1" min="0" value={fullSizePct} onChange={e=>setFullSizePct(+e.target.value||0)} style={{ width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 32px 11px 14px",color:C.white,fontSize:"0.95rem",fontWeight:600,fontFamily:font,outline:"none" }} onFocus={e=>e.target.style.borderColor=C.gold} onBlur={e=>e.target.style.borderColor=C.border} />
                  <span style={{ position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",color:C.muted,fontSize:"0.78rem",fontWeight:600 }}>%</span>
                </div>
              </div>
              <div style={{ flex:"0 0 auto" }}>
                <div style={{ fontWeight:700,fontSize:"0.56rem",letterSpacing:"0.10em",textTransform:"uppercase",color:C.muted,marginBottom:6 }}>Max Positions</div>
                <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                  <button onClick={()=>setNumStocks(Math.max(1,numStocks-1))} style={{width:32,height:32,borderRadius:8,border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.04)",color:C.white,fontWeight:800,fontSize:"1rem",cursor:"pointer",fontFamily:font,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                  <span style={{ fontWeight:800,fontSize:"1.1rem",color:C.white,minWidth:28,textAlign:"center" }}>{numStocks}</span>
                  <button onClick={()=>setNumStocks(Math.min(20,numStocks+1))} style={{width:32,height:32,borderRadius:8,border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.04)",color:C.white,fontWeight:800,fontSize:"1rem",cursor:"pointer",fontFamily:font,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                </div>
              </div>
            </div>
            {sizer && (
              <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:14,marginBottom:16 }}>
                <StatTile big label="Position Size / Trade" value={`${sizer.perTradePct.toFixed(2)}%`} color={C.goldBright} sub={`${fmt$(sizer.full)} per trade`} />
                <StatTile big label="Implied Full Exposure" value={`${sizer.impliedTotalPct.toFixed(0)}%`} color={sizer.impliedTotalPct>100?C.red:C.green} sub={`${fmt$(sizer.fullSizeAmt)} across ${numStocks} positions`} />
              </div>
            )}
            <div style={{ fontSize:"0.6rem",color:C.muted,marginBottom:10 }}>Scale in from Pilot → Full. Your target of {sizer?sizer.perTradePct.toFixed(0):0}% per trade colour-codes the <strong style={{color:C.text}}>Exp %</strong> column below (green = on size, red = oversized, blue = undersized).</div>
            <TierStrip sizer={sizer} />
          </>
        ) : (
          <>
            <div style={{ display:"flex",gap:16,alignItems:"flex-end",flexWrap:"wrap",marginBottom:20 }}>
              <CalcInput label="Target ROTE" value={targetRote} onChange={setTargetRote} suffix="%" placeholder="2" style={{maxWidth:140}} />
              <div style={{ flex:"0 0 auto" }}>
                <div style={{ fontWeight:700,fontSize:"0.56rem",letterSpacing:"0.10em",textTransform:"uppercase",color:C.muted,marginBottom:6 }}>Max Positions</div>
                <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                  <button onClick={()=>setRNumStocks(Math.max(1,rNumStocks-1))} style={{width:32,height:32,borderRadius:8,border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.04)",color:C.white,fontWeight:800,fontSize:"1rem",cursor:"pointer",fontFamily:font,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                  <span style={{ fontWeight:800,fontSize:"1.1rem",color:C.white,minWidth:28,textAlign:"center" }}>{rNumStocks}</span>
                  <button onClick={()=>setRNumStocks(Math.min(20,rNumStocks+1))} style={{width:32,height:32,borderRadius:8,border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.04)",color:C.white,fontWeight:800,fontSize:"1rem",cursor:"pointer",fontFamily:font,display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                </div>
              </div>
            </div>

            {rSizer && (
              <>
                <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(240px, 1fr))",gap:14,marginBottom:16 }}>
                  <StatTile big label="Total Risk Budget" value={fmt$(rSizer.totalBudget)} color={C.goldBright} sub={`${rSizer.rotePct}% of ${fmt$(+portfolioSize)}`} />
                  <StatTile big label="R per Trade (Full)" value={fmt$(rSizer.fullR)} color={C.green} sub={`${(rSizer.rotePct / rSizer.n).toFixed(2)}% ROTE each`} />
                </div>
              </>
            )}
          </>
        )}
      </GlassCard>

      {/* Open Positions */}
      <GlassCard style={{ marginBottom: 14 }}>
        <div style={{ padding:"20px 24px 8px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10 }}>
          <div>
            <div style={{ fontWeight:700,fontSize:"0.78rem",color:C.white }}>Open Positions</div>
            <div style={{ fontWeight:400,fontSize:"0.64rem",color:C.muted,marginTop:2 }}>Edit any white cell. Gold = current price. Grey = auto-calculated.</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={fetchLivePrices} disabled={priceLoading} style={{
              padding:"8px 14px",borderRadius:980,border:`1px solid ${C.border}`,
              background:priceLoading?"rgba(255,255,255,0.04)":"rgba(255,255,255,0.04)",
              color:priceLoading?C.muted:C.white,fontWeight:700,fontSize:"0.68rem",
              cursor:priceLoading?"wait":"pointer",fontFamily:font,display:"flex",alignItems:"center",gap:6,
            }}>
              <span style={{ display:"inline-block",transition:"transform 0.3s",transform:priceLoading?"rotate(180deg)":"none" }}>{"↻"}</span>
              {priceLoading?"Fetching...":"Refresh Prices"}
            </button>
            <div style={{display:"flex",borderRadius:10,overflow:"hidden",border:`1px solid ${displayMode==="R"?C.borderGold:C.border}`,transition:"border-color 0.2s"}}>
              {[{k:"%",label:"% Mode"},{k:"$",label:"$ Mode"},{k:"R",label:"R Mode"}].map(({k,label})=>(<button key={k} onClick={()=>setDisplayMode(k)} style={{padding:"8px 16px",background:displayMode===k?(k==="R"?C.goldDim:C.goldDim):"rgba(255,255,255,0.03)",border:"none",color:displayMode===k?C.gold:C.muted,fontWeight:800,fontSize:"0.72rem",cursor:"pointer",fontFamily:font,letterSpacing:k==="R"?"0.04em":"0",transition:"all 0.15s"}}>{label}</button>))}
            </div>
            <button onClick={() => setCompactTable(c => !c)} style={{padding:"8px 14px",borderRadius:980,border:`1px solid ${compactTable?C.borderGold:C.border}`,background:compactTable?C.goldDim:"rgba(255,255,255,0.04)",color:compactTable?C.gold:C.muted,fontWeight:700,fontSize:"0.62rem",cursor:"pointer",fontFamily:font,transition:"all 0.15s"}}>{compactTable?"Full View":"Compact"}</button>
            <div style={{display:"flex",alignItems:"center",borderRadius:980,overflow:"hidden",border:`1px solid ${posZoom!==1?C.borderGold:C.border}`,background:"rgba(255,255,255,0.04)",transition:"border-color 0.15s"}}>
              <button onClick={() => stepZoom(-1)} disabled={posZoom<=0.7} title="Zoom table out" style={{padding:"6px 11px",border:"none",background:"transparent",color:posZoom<=0.7?C.muted:C.gold,fontWeight:800,fontSize:"0.95rem",lineHeight:1,cursor:posZoom<=0.7?"default":"pointer",opacity:posZoom<=0.7?0.4:1,fontFamily:font}}>−</button>
              <button onClick={resetZoom} title="Reset zoom to 100%" style={{padding:"6px 2px",minWidth:44,textAlign:"center",border:"none",borderLeft:`1px solid ${C.border}`,borderRight:`1px solid ${C.border}`,background:"transparent",color:posZoom!==1?C.gold:C.muted,fontWeight:700,fontSize:"0.62rem",cursor:"pointer",fontFamily:font}}>{Math.round(posZoom*100)}%</button>
              <button onClick={() => stepZoom(1)} disabled={posZoom>=1.3} title="Zoom table in" style={{padding:"6px 11px",border:"none",background:"transparent",color:posZoom>=1.3?C.muted:C.gold,fontWeight:800,fontSize:"0.95rem",lineHeight:1,cursor:posZoom>=1.3?"default":"pointer",opacity:posZoom>=1.3?0.4:1,fontFamily:font}}>+</button>
            </div>
            <GoldBtn onClick={addPosition} small>+ Add Position</GoldBtn>
            <button onClick={() => { if (saveStatus === "error" && saveErrorMsg) { alert("Save error: " + saveErrorMsg); } else { onManualSave(); } }} disabled={saveStatus === "saving"} title={saveStatus === "error" && saveErrorMsg ? "Error: " + saveErrorMsg : "Save all positions to database"} style={{ padding:"8px 16px",borderRadius:980,border:`1px solid ${saveStatus === "saved" ? "rgba(34,197,94,0.4)" : saveStatus === "error" ? "rgba(239,68,68,0.4)" : C.borderGold}`,background:saveStatus === "saved" ? "rgba(34,197,94,0.12)" : saveStatus === "error" ? "rgba(239,68,68,0.12)" : C.goldDim,color:saveStatus === "saved" ? C.green : saveStatus === "error" ? C.red : C.gold,fontWeight:700,fontSize:"0.72rem",cursor:saveStatus === "saving" ? "wait" : "pointer",fontFamily:font,transition:"all 0.2s",display:"flex",alignItems:"center",gap:6 }}>
              {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved ✓" : saveStatus === "error" ? "Save Failed ⓘ" : "Save"}
            </button>
            {onIbkrSync && <button onClick={onIbkrSync} title="Pull positions & trades from Interactive Brokers" style={{ padding:"8px 14px",borderRadius:980,border:`1px solid ${C.borderGold}`,background:"rgba(255,255,255,0.04)",color:C.gold,fontWeight:700,fontSize:"0.72rem",cursor:"pointer",fontFamily:font,display:"flex",alignItems:"center",gap:6 }}>⟳ Sync IBKR</button>}
            <button onClick={() => exportMasterCSV(positions.filter(p => p.sym), journaledTrades)} style={{ padding:"8px 12px",borderRadius:980,border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.04)",color:C.muted,fontWeight:700,fontSize:"0.62rem",cursor:"pointer",fontFamily:font }}>Export CSV</button>
            <label style={{ padding:"8px 12px",borderRadius:980,border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.04)",color:C.muted,fontWeight:700,fontSize:"0.62rem",cursor:"pointer",fontFamily:font }}>
              Import
              <input type="file" accept=".csv" style={{ display:"none" }} onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  try {
                    const text = ev.target.result;
                    // Detect master export format
                    const master = parseMasterCSV(text);
                    if (master) {
                      if (master.positions.length > 0) {
                        // Assign _lid for each position
                        master.positions.forEach(p => { p._lid = _lid++; });
                        setPositions(prev => { const next = [...prev, ...master.positions]; if (lastLoadedCountRef) lastLoadedCountRef.current = next.length; positionsRef.current = next; return next; });
                      }
                      if (master.trades.length > 0) {
                        setJournaledTrades(prev => [...prev, ...master.trades]);
                      }
                      const parts = [];
                      if (master.positions.length > 0) parts.push(`${master.positions.length} position${master.positions.length !== 1 ? "s" : ""}`);
                      if (master.trades.length > 0) parts.push(`${master.trades.length} trade${master.trades.length !== 1 ? "s" : ""}`);
                      if (parts.length > 0) {
                        alert(`Master import: ${parts.join(" + ")} imported. Remember to Save.`);
                      } else {
                        alert("No valid data found in master export");
                      }
                    } else {
                      // Standard single-section CSV (positions only)
                      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
                      if (lines.length < 2) return;
                      const hdr = lines[0].split(",").map(h => h.replace(/"/g,"").trim().toLowerCase());
                      const symIdx = hdr.findIndex(h => /symbol|ticker/i.test(h));
                      const entryIdx = hdr.findIndex(h => /entry.?date|date/i.test(h));
                      const sharesIdx = hdr.findIndex(h => /shares|qty|quantity/i.test(h));
                      const epIdx = hdr.findIndex(h => /entry.?price|avg.?cost|cost/i.test(h));
                      const cpIdx = hdr.findIndex(h => /^current|^last|^market|^price$/i.test(h));
                      const s1Idx = hdr.findIndex(h => /stop.?1|stop.?price|orig.?stop|stop$/i.test(h));
                      const s2Idx = hdr.findIndex(h => /stop.?2/i.test(h));
                      const tsIdx = hdr.findIndex(h => /trail/i.test(h));
                      const setupIdx = hdr.findIndex(h => /setup/i.test(h));
                      const tagsIdx = hdr.findIndex(h => /tags/i.test(h));
                      const commIdx = hdr.findIndex(h => /commission|comm/i.test(h));
                      const entryTimeIdx = hdr.findIndex(h => /entry.?time|time.?in/i.test(h));
                      if (symIdx < 0) { alert("CSV must have a Symbol column"); return; }
                      const imported = [];
                      for (let i = 1; i < lines.length; i++) {
                        const vals = lines[i].match(/("(?:[^"]|"")*"|[^,]*)/g)?.map(v => v.replace(/^"|"$/g,"").replace(/""/g,'"').trim()) || [];
                        const sym = vals[symIdx] || "";
                        if (!sym) continue;
                        imported.push({
                          id: Date.now() + i, _lid: _lid++, sym: sym.toUpperCase(),
                          entry: vals[entryIdx] || new Date().toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"}),
                          shares: vals[sharesIdx] || "", ep: vals[epIdx] || "", cp: vals[cpIdx] || "",
                          stop: vals[s1Idx] || "", stop2: s2Idx >= 0 ? vals[s2Idx] || "" : "",
                          trailStop: tsIdx >= 0 ? vals[tsIdx] || "" : "",
                          setup: vals[setupIdx] || setupTypes[0] || "VCP",
                          tags: tagsIdx >= 0 && vals[tagsIdx] ? vals[tagsIdx].split(";").map(t => t.trim()).filter(Boolean) : [],
                          comm: commIdx >= 0 ? vals[commIdx] || "" : "",
                          entryTime: entryTimeIdx >= 0 ? vals[entryTimeIdx] || "" : "",
                        });
                      }
                      if (imported.length > 0) {
                        setPositions(prev => { const next = [...prev, ...imported]; if (lastLoadedCountRef) lastLoadedCountRef.current = next.length; positionsRef.current = next; return next; });
                        alert(`Imported ${imported.length} position${imported.length > 1 ? "s" : ""}`);
                      } else {
                        alert("No valid positions found in CSV");
                      }
                    }
                  } catch (err) { alert("Import error: " + err.message); }
                  e.target.value = "";
                };
                reader.readAsText(file);
              }} />
            </label>
          </div>
        </div>
        {/* 15-min delay notice */}
        <div style={{ padding:"0 24px 8px",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap" }}>
          <div style={{ display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:980,background:"rgba(59,130,246,0.08)",border:"1px solid rgba(59,130,246,0.20)" }}>
            <span style={{ fontSize:"0.60rem",fontWeight:700,color:C.blue,letterSpacing:"0.06em",textTransform:"uppercase" }}>Live Prices</span>
            <span style={{ fontSize:"0.58rem",fontWeight:500,color:C.muted }}>~15 min delay from real-time</span>
          </div>
          {lastPriceRefresh && (
            <span style={{ fontSize:"0.58rem",color:C.muted }}>
              Last updated: {lastPriceRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {displayMode==="R" && (
            <div style={{ display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:980,background:C.goldDim,border:`1px solid ${C.borderGold}` }}>
              <span style={{ fontSize:"0.60rem",fontWeight:700,color:C.gold,letterSpacing:"0.06em",textTransform:"uppercase" }}>R Mode</span>
              <span style={{ fontSize:"0.58rem",fontWeight:500,color:C.muted }}>R = original stop risk · DTS/RTS use trail stop · R Suggest = mechanical trail levels</span>
            </div>
          )}
        </div>
        <div style={{ overflowX:"auto",padding:"0 0 4px",zoom:posZoom }}>
          <table style={{ width:"100%",borderCollapse:"collapse",fontSize:"0.71rem" }}>
            <thead><tr style={{ borderBottom:`1px solid ${C.border}` }}>
              {(() => { const defs = [["Status","left","riskStatus","Risk status of this position"],["Symbol","left","sym","Ticker symbol"],["L/S","center",null,"Long or Short position"],["Shares","right","sharesN","Shares held"],["Avg. Cost","right","epN","Average entry price per share"],["Comm","right","commN","Commission"],["Pos. Size","right","posValue","Position Size — shares × avg cost (commission shown beneath)"],["Exp %","right","expPct","Exposure — position size as a percent of current equity"],["Realized","right","realizedPL","Realized P/L from partial sells"],["Orig Stop","right","stop1","Original stop price"],["Stop 2","right","stop2","Secondary stop price"],["Stops","right","tsN","Stop levels — Original, 2nd and Trail stop"],["Current","right","cpN","Current market price"],["Setup / Tags","left","setup","Trade setup type and tags"],["Tags","left",null,"Tags"],["DTS","right","dtsPct","DTS — Distance To Stop"],["RTS","right","rtsD","RTS — Risk To Stop (dollars at risk if stopped out)"],["ROTE","right","rotePct","ROTE — Risk On Total Equity"],displayMode==="R"?["R Suggest","right","rSuggestedStop","Suggested mechanical trail-stop level"]:["SBE","right","sbe","SBE — Sell-to-BreakEven share count"],displayMode==="R"?["Locked","right","rLockedProfit","Profit locked in per share"]:["SBE %","right","sbePct","SBE % — portion of the position to sell for breakeven"],["P/L","right","plPct","Profit / Loss — unrealized (realized shown beneath)"],["R","right","rMult","R-multiple — P/L in units of initial risk"],["","center",null,""],["","center",null,""]]; const alwaysHide = new Set([5,8,9,10,14]); const compactHide = new Set([2,9,18,19]); const hideSet = new Set([...alwaysHide, ...(compactTable ? compactHide : [])]); return posDrag.order.filter(ci => !hideSet.has(ci)).map((ci, vi) => { const [text, align, sortKey, tip] = defs[ci]; return <th key={`ph-${ci}`} {...posDrag.dragProps(vi)} onClick={sortKey ? (e) => { e.stopPropagation(); setPosSorts(s => toggleSort(s, sortKey, e.shiftKey)); } : undefined} style={{padding:"10px 7px",textAlign:align,fontWeight:700,fontSize:"0.56rem",letterSpacing:"0.09em",textTransform:"uppercase",color:posSorts.find(s=>s.key===sortKey)?C.gold:C.muted,whiteSpace:"nowrap",cursor:sortKey?"pointer":"grab",userSelect:"none"}}>{tip ? <Abbr tip={tip} underline={false}>{text}</Abbr> : text}{sortKey ? sortArrow(posSorts, sortKey) : ""}</th>; }); })()}
            </tr></thead>
            <tbody>
              {(posSorts.length > 0 ? multiSort(enriched, posSorts) : enriched).map((p, idx) => {
                const isSelling = sellId === p.id;
                const RISK_BADGE = { "At Risk":{bg:C.redDim,color:C.red,border:"rgba(239,68,68,0.25)"}, "Risk-Free":{bg:C.greenDim,color:C.green,border:"rgba(34,197,94,0.25)"}, "Profit Locked":{bg:C.blueDim,color:C.blue,border:"rgba(59,130,246,0.25)"}, "—":{bg:"transparent",color:C.muted,border:C.border} };
                const rb = RISK_BADGE[p.riskStatus] || RISK_BADGE["—"];
                const isDollar = displayMode === "$";
                const isR = displayMode === "R";
                const dtsDisplay = !p.cpN ? "—" : isR ? `${p.dtsR.toFixed(2)}R` : isDollar ? `$${Math.abs(p.dtsD).toFixed(2)}` : `${Math.abs(p.dtsPct).toFixed(2)}%`;
                const rtsDisplay = !p.cpN ? "—" : isR ? `${p.rtsR.toFixed(2)}R` : isDollar ? `$${Math.abs(p.rtsD).toLocaleString(undefined,{maximumFractionDigits:0})}` : `${(p.sharesN>0?(p.rtsD/(p.cpN*p.sharesN)*100):0).toFixed(2)}%`;
                const plDisplay = !p.epN ? "—" : isR ? `${p.rMult>=0?"+":""}${p.rMult.toFixed(2)}R` : isDollar ? `${p.plD>=0?"+":"-"}${fmt$(Math.abs(p.plD),2)}` : `${p.plPct>=0?"+":""}${p.plPct.toFixed(2)}%`;
                const hasNotes = p.notes || p.chartUrl || p.chartImage;
                const isExpanded = expandedPosId === p.id;
                return (
                  <React.Fragment key={p._lid || p.id}>
                  <DragTr order={posDrag.order} hiddenSet={(() => { const s = new Set([5,8,9,10,14]); if (compactTable) [2,18,19].forEach(c => s.add(c)); return s; })()} style={{ borderBottom: isExpanded ? "none" : "1px solid rgba(255,255,255,0.04)",background:isSelling?"rgba(239,68,68,0.04)":idx%2?"rgba(255,255,255,0.01)":"transparent" }}>
                    <td style={{padding:"8px 6px"}}><span style={{padding:"3px 8px",borderRadius:980,fontSize:"0.50rem",fontWeight:700,background:rb.bg,color:rb.color,border:`1px solid ${rb.border}`,whiteSpace:"nowrap"}}>{p.riskStatus}</span></td>
                    <td style={{padding:"6px 4px"}}><div style={{display:"flex",alignItems:"center",gap:4}}><SourceDot source={p.source} />{p.sym && getTickerLogo(p.sym) && <img src={getTickerLogo(p.sym)} alt="" style={{width:18,height:18,borderRadius:4,flexShrink:0}} onError={e=>{e.target.style.display="none"}} />}<TickerInput value={p.sym} onChange={v=>updateField(p.id,"sym",v)} /></div></td>
                    <td style={{padding:"6px 2px",textAlign:"center"}}><select value={p.tradeType||"Long"} onChange={e=>updateField(p.id,"tradeType",e.target.value)} style={{padding:"3px 4px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,color:(p.tradeType||"Long")==="Short"?C.red:C.green,fontSize:"0.52rem",fontWeight:700,fontFamily:font,cursor:"pointer",outline:"none"}}><option value="Long">L</option><option value="Short">S</option></select></td>
                    <td style={{padding:"6px 4px",textAlign:"right"}}><CellInput value={p.shares} onChange={v=>updateField(p.id,"shares",v)} width={62} /></td>
                    <td style={{padding:"6px 4px",textAlign:"right"}}><CellInput value={p.ep} onChange={v=>updateField(p.id,"ep",v)} /></td>
                    <td style={{padding:"6px 4px",textAlign:"right"}}><CellInput value={p.comm||""} onChange={v=>updateField(p.id,"comm",v)} width={62} /></td>
                    <td style={{padding:"6px 4px",textAlign:"right",whiteSpace:"nowrap"}}>{p.posValue>0?<div style={{fontWeight:700,fontSize:"0.72rem",color:C.white}}>{fmt$(p.posValue)}</div>:<div style={{color:C.muted}}>—</div>}<div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4,marginTop:3}}><span style={{fontSize:"0.46rem",color:C.muted,letterSpacing:"0.06em",textTransform:"uppercase"}}>Comm</span><CellInput value={p.comm||""} onChange={v=>updateField(p.id,"comm",v)} width={52} /></div></td>
                    <td style={{padding:"8px 4px",textAlign:"right",whiteSpace:"nowrap"}}>{p.posValue>0&&compEquity>0?(()=>{let col=C.white,note=null;if(targetPosPct>0){const lo=targetPosPct*0.8,hi=targetPosPct*1.2;if(p.expPct>hi){col=C.red;note="Oversized";}else if(p.expPct<lo){col=C.blue;note="Undersized";}else{col=C.green;note="On Size";}}else if(p.expPct>100){col=C.red;}return<div><div style={{fontWeight:600,fontSize:"0.70rem",color:col}}>{p.expPct.toFixed(2)}%</div>{note&&<div style={{fontSize:"0.5rem",fontWeight:700,color:col,letterSpacing:"0.05em",textTransform:"uppercase",marginTop:1}}>{note}</div>}</div>;})():"—"}</td>
                    <td style={{padding:"8px 4px",textAlign:"right",whiteSpace:"nowrap"}}>{p.realizedPL!==0?<><div style={{fontWeight:700,fontSize:"0.70rem",color:p.realizedPL>=0?C.green:C.red}}>{p.realizedPL>=0?"+":"-"}{fmt$(Math.abs(p.realizedPL))}</div>{p.costFinanced&&<div style={{fontSize:"0.50rem",fontWeight:700,color:C.green,letterSpacing:"0.04em"}}>FINANCED</div>}</>:"—"}</td>
                    <td style={{padding:"6px 4px",textAlign:"right"}}><LockableCellInput value={p.stop} onChange={v=>updateField(p.id,"stop",v)} width={72} /></td>
                    <td style={{padding:"6px 4px",textAlign:"right"}}><LockableCellInput value={p.stop2||""} onChange={v=>updateField(p.id,"stop2",v)} width={72} /></td>
                    <td style={{padding:"6px 4px"}}><div style={{display:"flex",flexDirection:"column",gap:3,alignItems:"flex-end"}}>
                      <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:"0.46rem",color:C.muted,letterSpacing:"0.05em",textTransform:"uppercase",width:30,textAlign:"right"}}>Orig</span><LockableCellInput value={p.stop} onChange={v=>updateField(p.id,"stop",v)} width={66} /></div>
                      <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:"0.46rem",color:C.muted,letterSpacing:"0.05em",textTransform:"uppercase",width:30,textAlign:"right"}}>2nd</span><LockableCellInput value={p.stop2||""} onChange={v=>updateField(p.id,"stop2",v)} width={66} /></div>
                      <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:"0.46rem",color:C.gold,letterSpacing:"0.05em",textTransform:"uppercase",width:30,textAlign:"right"}}>Trail</span><CellInput value={p.trailStop||""} onChange={v=>updateField(p.id,"trailStop",v)} width={66} gold /></div>
                      <button onClick={() => { if (saveStatus === "error" && saveErrorMsg) { alert("Save error: " + saveErrorMsg); } else { onManualSave(); } }} disabled={saveStatus === "saving"} title={saveStatus === "error" && saveErrorMsg ? "Error: " + saveErrorMsg : "Save all positions to database"} style={{marginTop:4,padding:"4px 12px",borderRadius:980,border:`1px solid ${saveStatus==="saved"?"rgba(34,197,94,0.4)":saveStatus==="error"?"rgba(239,68,68,0.4)":C.borderGold}`,background:saveStatus==="saved"?"rgba(34,197,94,0.12)":saveStatus==="error"?"rgba(239,68,68,0.12)":C.goldDim,color:saveStatus==="saved"?C.green:saveStatus==="error"?C.red:C.gold,fontWeight:700,fontSize:"0.54rem",cursor:saveStatus==="saving"?"wait":"pointer",fontFamily:font,transition:"all 0.2s",whiteSpace:"nowrap"}}>{saveStatus==="saving"?"Saving…":saveStatus==="saved"?"Saved ✓":saveStatus==="error"?"Save Failed ⓘ":"Save"}</button>
                    </div></td>
                    <td style={{padding:"6px 4px",textAlign:"right"}}><CellInput value={p.cp} onChange={v=>updateField(p.id,"cp",v)} gold width={82} /></td>
                    <td style={{padding:"6px 4px"}}><div style={{display:"flex",flexDirection:"column",gap:5}}><MiniSelect value={p.setup} onChange={v=>updateField(p.id,"setup",v)} options={setupTypes} width={118} /><TagSelector selected={p.tags||[]} allTags={allTags} onChange={v=>updateField(p.id,"tags",v)} small /></div></td>
                    <td style={{padding:"6px 4px"}}><TagSelector selected={p.tags||[]} allTags={allTags} onChange={v=>updateField(p.id,"tags",v)} small /></td>
                    <td style={{padding:"8px 6px",textAlign:"right",fontWeight:600,color:p.dtsD<=0?C.green:C.text,fontSize:"0.70rem"}}>{dtsDisplay}</td>
                    <td style={{padding:"8px 6px",textAlign:"right",fontWeight:700,color:p.rtsD<=0?C.green:C.red,fontSize:"0.72rem",animation:p.cpN&&(p.stop1||p.stop2)?(p.rtsD>0?"rtsGlow 2.5s ease-in-out infinite":"rtsGlowGreen 3s ease-in-out infinite"):"none"}}>{rtsDisplay}</td>
                    <td style={{padding:"8px 6px",textAlign:"right",fontWeight:700,fontSize:"0.70rem",whiteSpace:"nowrap"}}>{p.epN&&(p.stop1||p.stop2)?<><div style={{color:p.currentRotePct>0?C.red:C.green}}>{p.currentRotePct.toFixed(2)}%</div>{p.currentRotePct!==p.rotePct&&<div style={{fontSize:"0.50rem",color:C.muted,fontWeight:500}}>Init: {p.rotePct.toFixed(2)}%</div>}</>:"—"}</td>
                    {isR ? <td style={{padding:"8px 6px",textAlign:"right",fontWeight:700,fontSize:"0.70rem",color:p.rSuggestedStop>p.epN?C.green:p.rSuggestedStop===p.epN?C.goldBright:C.muted}}>{p.rPerShare>0?(p.rSuggestedStop>=p.epN&&p.currentRLevel>=1?`$${p.rSuggestedStop.toFixed(2)} (${p.currentRLevel-1===0?"BE":(p.currentRLevel-1)+"R"})`:`$${p.rSuggestedStop.toFixed(2)}`):"—"}</td> : <td style={{padding:"8px 6px",textAlign:"right",color:p.sbe>0?C.text:C.muted,fontSize:"0.70rem"}}>{p.sbe>0?p.sbe.toLocaleString():"—"}</td>}
                    {isR ? <td style={{padding:"8px 6px",textAlign:"right",fontWeight:700,fontSize:"0.70rem",color:p.rLockedProfit>0?C.green:C.muted}}>{p.rLockedProfit>0?`$${p.rLockedProfit.toFixed(2)}/sh`:"$0"}</td> : <td style={{padding:"8px 6px",textAlign:"right",fontWeight:600,color:!p.sbe?C.muted:p.sbePct>100?C.red:p.sbePct>80?C.gold:C.green,fontSize:"0.70rem"}}>{p.sbe>0?`${p.sbePct.toFixed(2)}%`:"—"}</td>}
                    <td style={{padding:"8px 6px",textAlign:"right",whiteSpace:"nowrap"}}><div style={{fontWeight:700,color:p.plPct>=0?C.green:C.red,fontSize:"0.72rem"}}>{plDisplay}</div>{p.realizedPL!==0&&<div style={{fontSize:"0.52rem",fontWeight:700,color:p.realizedPL>=0?C.green:C.red,marginTop:2}}>Rlzd {p.realizedPL>=0?"+":"-"}{fmt$(Math.abs(p.realizedPL),2)}{p.costFinanced&&<span style={{marginLeft:3,color:C.green}}>FIN</span>}</div>}</td>
                    <td style={{padding:"8px 6px",textAlign:"right",fontWeight:700,fontSize:"0.70rem",color:p.rMult>=2?C.green:p.rMult>=1?C.goldBright:p.rMult>=0?C.white:C.red}}>{p.epN&&(p.stop1||p.stop2)?`${p.rMult.toFixed(2)}R`:"—"}</td>
                    <td style={{padding:"6px 4px",textAlign:"center",whiteSpace:"nowrap"}}>
                      <div style={{display:"flex",gap:3,alignItems:"center",justifyContent:"center"}}>
                        <button onClick={()=>togglePosExpand(p.id)} title={isExpanded?"Collapse":"Additional Data"} style={{padding:"3px 7px",borderRadius:6,border:`1px solid ${isExpanded?C.borderGold:C.border}`,background:isExpanded?C.goldDim:"transparent",color:isExpanded?C.gold:hasNotes?C.gold:C.muted,fontWeight:700,fontSize:"0.54rem",cursor:"pointer",fontFamily:font}}>{isExpanded?"▲ Less":"▼ More"}</button>
                        {p.chartUrl && <a href={p.chartUrl} target="_blank" rel="noopener noreferrer" style={{fontSize:"0.58rem",color:C.blue,fontWeight:600,textDecoration:"none"}} title="TradingView chart">TV</a>}
                        {p.chartImage && <span style={{fontSize:"0.58rem",color:C.green,fontWeight:700}} title="Chart attached">📷</span>}
                      </div>
                    </td>
                    <td style={{padding:"6px 4px",textAlign:"center",whiteSpace:"nowrap"}}>
                      <div style={{display:"flex",gap:4,justifyContent:"center"}}>
                        <button onClick={()=>startSell(p)} title="Sell shares" style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${C.red}33`,background:"transparent",color:C.red,fontWeight:700,fontSize:"0.58rem",cursor:"pointer",fontFamily:font}}>Sell</button>
                        <button onClick={()=>removeRow(p.id)} title="Remove" style={{padding:"4px 6px",borderRadius:6,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontWeight:700,fontSize:"0.58rem",cursor:"pointer",fontFamily:font}}>×</button>
                      </div>
                    </td>
                  </DragTr>
                  {/* Expanded additional data + notes/chart area */}
                  {isExpanded && (
                    <tr style={{ background:"rgba(201,152,42,0.03)",borderBottom:`1px solid ${C.borderGold}` }}>
                      <td colSpan={26} style={{ padding:"14px 16px" }}>
                        {/* Secondary data (commission, stops, setup, tags, realized) now lives on the main row */}
                        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
                          {/* Left: Notes */}
                          <div>
                            <div style={{ fontWeight:700,fontSize:"0.60rem",letterSpacing:"0.12em",textTransform:"uppercase",color:C.gold,marginBottom:10 }}>Position Notes</div>
                            {posEditNotes._plain && (
                              <div style={{ marginBottom:10,padding:"8px 12px",borderRadius:8,background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}` }}>
                                <div style={{ fontSize:"0.56rem",fontWeight:700,color:C.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.08em" }}>Previous Notes</div>
                                <div style={{ fontSize:"0.70rem",color:C.text }}>{posEditNotes._plain}</div>
                              </div>
                            )}
                            {[{key:"right",label:"What's Going Right",color:C.green},{key:"wrong",label:"What's Going Wrong",color:C.red},{key:"lessons",label:"Trade Plan / Notes",color:C.gold}].map(({key,label,color}) => (
                              <div key={key} style={{ marginBottom:8 }}>
                                <label style={{ display:"block",fontWeight:700,fontSize:"0.56rem",letterSpacing:"0.08em",textTransform:"uppercase",color,marginBottom:4 }}>{label}</label>
                                <textarea value={posEditNotes[key]} onChange={e => { const v = e.target.value; setPosEditNotes(n => ({...n, [key]: v})); }} onBlur={() => savePosNotes(p.id)} placeholder={`${label}...`} rows={2}
                                  style={{ width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.white,fontSize:"0.72rem",fontFamily:font,outline:"none",resize:"vertical" }}
                                  onFocus={e => e.target.style.borderColor = C.gold} />
                              </div>
                            ))}
                          </div>
                          {/* Right: Chart Link + Image */}
                          <div>
                            <div style={{ fontWeight:700,fontSize:"0.60rem",letterSpacing:"0.12em",textTransform:"uppercase",color:C.gold,marginBottom:10 }}>Chart Reference</div>
                            <div style={{ marginBottom:10 }}>
                              <label style={{ display:"block",fontWeight:700,fontSize:"0.56rem",letterSpacing:"0.08em",textTransform:"uppercase",color:C.muted,marginBottom:4 }}>TradingView Link</label>
                              <input type="url" value={p.chartUrl||""} onChange={e=>updateField(p.id,"chartUrl",e.target.value)} placeholder="https://www.tradingview.com/chart/..."
                                style={{ width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px",color:C.blue,fontSize:"0.72rem",fontFamily:font,outline:"none" }}
                                onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
                            </div>
                            <div style={{ marginBottom:10 }}>
                              <label style={{ display:"block",fontWeight:700,fontSize:"0.56rem",letterSpacing:"0.08em",textTransform:"uppercase",color:C.muted,marginBottom:4 }}>Chart Screenshot</label>
                              <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                                <label style={{ padding:"6px 14px",borderRadius:8,border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.04)",color:C.white,fontWeight:700,fontSize:"0.66rem",cursor:posUploadingImage?"wait":"pointer",fontFamily:font,opacity:posUploadingImage?0.5:1 }}>
                                  {posUploadingImage?"Uploading...":"Upload Image"}
                                  <input type="file" accept="image/*" style={{ display:"none" }} disabled={posUploadingImage}
                                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadPosChartImage(p.id, f); e.target.value = ""; }} />
                                </label>
                                {p.chartImage && <span style={{ fontSize:"0.62rem",color:C.green,fontWeight:600 }}>✓ Image attached</span>}
                                {p.chartImage && <button onClick={() => updateField(p.id,"chartImage","")} style={{ padding:"2px 6px",borderRadius:4,border:`1px solid ${C.border}`,background:"transparent",color:C.red,fontSize:"0.54rem",cursor:"pointer",fontFamily:font }}>Remove</button>}
                              </div>
                            </div>
                            {p.chartImage && (
                              <div style={{ marginTop:8,borderRadius:10,overflow:"hidden",border:`1px solid ${C.border}` }}>
                                <img src={p.chartImage} alt="Chart" style={{ width:"100%",maxHeight:200,objectFit:"contain",background:"#111" }} />
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              })}

              {/* Sell inline form */}
              {sellId && (() => {
                const pos = findSellPos();
                if (!pos) return null;
                const totalShares = parseFloat(pos.shares) || 0;
                const qty = parseFloat(sellQty) || 0;
                const isPartial = qty < totalShares && qty > 0;
                return (
                  <tr style={{ background:"rgba(239,68,68,0.06)",borderBottom:`2px solid ${C.red}33` }}>
                    <td colSpan={26} style={{ padding:"14px 16px" }}>
                      {/* Row 1: Core sell fields */}
                      <div style={{ display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:10 }}>
                        <span style={{ fontWeight:700,fontSize:"0.68rem",color:C.red,letterSpacing:"0.08em",textTransform:"uppercase" }}>Sell {pos.sym}</span>
                        <div style={{display:"flex",alignItems:"center",gap:5}}>
                          <span style={{fontSize:"0.62rem",color:C.muted,fontWeight:600}}>Qty</span>
                          <CellInput value={sellQty} onChange={setSellQty} width={60} />
                          <span style={{fontSize:"0.58rem",color:C.muted}}>of {totalShares}</span>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:5}}>
                          <span style={{fontSize:"0.62rem",color:C.muted,fontWeight:600}}>Exit $</span>
                          <CellInput value={sellPrice} onChange={setSellPrice} gold width={82} />
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:5}}>
                          <span style={{fontSize:"0.62rem",color:C.muted,fontWeight:600}}>Comm</span>
                          <CellInput value={sellComm} onChange={setSellComm} width={62} />
                        </div>
                        <MiniSelect value={sellReason} onChange={setSellReason} options={exitReasons} width={130} />
                        <div style={{display:"flex",alignItems:"center",gap:5}}>
                          <span style={{fontSize:"0.62rem",color:C.muted,fontWeight:600}}>Tags</span>
                          <TagSelector selected={sellTags} allTags={allTags} onChange={setSellTags} small />
                        </div>
                        <label style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",fontSize:"0.62rem",color:C.muted}}>
                          <input type="checkbox" checked={sellAddJournal} onChange={e=>setSellAddJournal(e.target.checked)} style={{accentColor:C.gold}} />
                          Add to Journal
                        </label>
                        <button onClick={confirmSell} style={{padding:"6px 14px",borderRadius:8,border:`1px solid rgba(239,68,68,0.3)`,background:C.redDim,color:C.red,fontWeight:700,fontSize:"0.66rem",cursor:"pointer",fontFamily:font}}>
                          {isPartial ? `Sell ${qty} shares` : "Close Position"}
                        </button>
                        <button onClick={cancelSell} style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontSize:"0.62rem",cursor:"pointer",fontFamily:font}}>Cancel</button>
                      </div>
                      {/* Row 2: Notes + TV link (collapsible via Journal checkbox) */}
                      {sellAddJournal && (
                        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr auto",gap:10,alignItems:"start" }}>
                          {[{key:"right",label:"What Went Right",color:C.green},{key:"wrong",label:"What Went Wrong",color:C.red},{key:"lessons",label:"What I Learned",color:C.gold}].map(({key,label,color}) => (
                            <div key={key}>
                              <label style={{ display:"block",fontWeight:700,fontSize:"0.52rem",letterSpacing:"0.08em",textTransform:"uppercase",color,marginBottom:3 }}>{label}</label>
                              <textarea value={sellNotesStruct[key]} onChange={e => { const v = e.target.value; setSellNotesStruct(n => ({...n, [key]: v})); }} placeholder={`${label}...`} rows={2}
                                style={{ width:"100%",boxSizing:"border-box",background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 8px",color:C.white,fontSize:"0.68rem",fontFamily:font,outline:"none",resize:"vertical" }}
                                onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
                            </div>
                          ))}
                          <div>
                            <label style={{ display:"block",fontWeight:700,fontSize:"0.52rem",letterSpacing:"0.08em",textTransform:"uppercase",color:C.blue,marginBottom:3 }}>TV Link</label>
                            <input type="url" value={sellChartUrl} onChange={e=>setSellChartUrl(e.target.value)} placeholder="tradingview.com/..."
                              style={{ width:140,boxSizing:"border-box",background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 8px",color:C.blue,fontSize:"0.68rem",fontFamily:font,outline:"none" }}
                              onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })()}

              {/* Totals — 24 cols via DragTr for drag-reorder alignment: Status(0),Symbol(1),L/S(2),Shares(3),AvgCost(4),Comm(5),PosSize(6),Exp%(7),Realized(8),OrigStop(9),Stop2(10),TrailStop(11),Current(12),Setup(13),Tags(14),DTS(15),RTS(16),ROTE(17),SBE/RSuggest(18),SBE%/Locked(19),P/L(20),R(21),Notes(22),Actions(23) */}
              <DragTr order={posDrag.order} hiddenSet={(() => { const s = new Set([5,8,9,10,14]); if (compactTable) [2,18,19].forEach(c => s.add(c)); return s; })()} style={{ borderTop:`2px solid ${C.border}`,background:"rgba(255,255,255,0.02)" }}>
                {/* 0: Status */}
                <td style={{padding:"12px 6px",fontWeight:800,fontSize:"0.64rem",color:C.white,letterSpacing:"0.06em",textTransform:"uppercase"}}>Totals</td>
                {/* 1: Symbol */}
                <td />
                {/* 2: L/S */}
                <td />
                {/* 3: Shares */}
                <td style={{padding:"12px 6px",textAlign:"right",fontWeight:700,color:C.text,fontSize:"0.70rem"}}>{enriched.reduce((s,p)=>s+p.sharesN,0).toLocaleString()}</td>
                {/* 4: Avg Cost */}
                <td />
                {/* 5: Comm */}
                <td style={{padding:"12px 6px",textAlign:"right",fontWeight:700,color:C.muted,fontSize:"0.70rem"}}>{fmt$(enriched.reduce((s,p)=>s+p.commN,0))}</td>
                {/* 6: Pos Size */}
                <td style={{padding:"12px 4px",textAlign:"right",whiteSpace:"nowrap"}}><div style={{fontWeight:800,fontSize:"0.72rem",color:C.goldBright}}>{fmt$(enriched.reduce((s,p)=>s+p.posValue,0))}</div></td>
                {/* 7: Exp % */}
                <td style={{padding:"12px 4px",textAlign:"right",whiteSpace:"nowrap"}}>{(()=>{const tv=enriched.reduce((s,p)=>s+p.posValue,0);const expPct=compEquity>0?(tv/compEquity)*100:0;return<div style={{fontWeight:800,fontSize:"0.72rem",color:expPct>100?C.red:expPct>80?C.gold:C.green}}>{expPct.toFixed(2)}%{expPct>100&&<span style={{marginLeft:3,fontSize:"0.64rem"}}>{(expPct/100).toFixed(1)}x</span>}</div>})()}</td>
                {/* 8: Realized */}
                <td style={{padding:"12px 4px",textAlign:"right",whiteSpace:"nowrap"}}>{(()=>{const tr=enriched.reduce((s,p)=>s+p.realizedPL,0);return tr!==0?<div style={{fontWeight:800,fontSize:"0.72rem",color:tr>=0?C.green:C.red}}>{tr>=0?"+":"-"}{fmt$(Math.abs(tr))}</div>:<span style={{color:C.muted}}>—</span>})()}</td>
                {/* 9: Orig Stop */}
                <td />
                {/* 10: Stop 2 */}
                <td />
                {/* 11: Trail Stop */}
                <td />
                {/* 12: Current */}
                <td />
                {/* 13: Setup */}
                <td />
                {/* 14: Tags */}
                <td />
                {/* 15: DTS */}
                <td style={{padding:"12px 6px",textAlign:"right",fontWeight:800,fontSize:"0.72rem",color:totals.totalDtsD<=0?C.green:C.text}}>{displayMode==="R"?"—":displayMode==="$"?`$${Math.abs(totals.totalDtsD).toLocaleString(undefined,{maximumFractionDigits:0})}`:`${Math.abs(totals.avgDtsPct).toFixed(2)}%`}</td>
                {/* 16: RTS — always show both % and $ */}
                <td style={{padding:"8px 6px",textAlign:"right",whiteSpace:"nowrap",animation:totals.totalRTS>0?"rtsGlow 2.5s ease-in-out infinite":"rtsGlowGreen 3s ease-in-out infinite"}}>
                  {displayMode==="R"?"—":<>
                    <div style={{fontWeight:800,fontSize:"0.74rem",color:totals.totalRTS<=0?C.green:C.red}}>{totals.totalValue>0?((totals.totalRTS/totals.totalValue)*100).toFixed(2):"0.00"}%</div>
                    <div style={{fontSize:"0.58rem",color:totals.totalRTS<=0?C.green:C.red,marginTop:1,fontWeight:700}}>{totals.totalRTS<=0?"FREE":fmt$(totals.totalRTS)}</div>
                  </>}
                </td>
                {/* 17: ROTE */}
                <td style={{padding:"8px 6px",textAlign:"right",whiteSpace:"nowrap"}}>
                  <div style={{fontWeight:800,fontSize:"0.72rem",color:totals.currentRotePct>totals.tgtRotePct?C.red:totals.currentRotePct>(totals.tgtRotePct*0.8)?C.gold:C.green}}>{totals.currentRotePct.toFixed(2)}%{totals.currentRotePct>totals.tgtRotePct&&<span style={{marginLeft:3,fontSize:"0.64rem"}}>⚠</span>}</div>
                  <div style={{fontSize:"0.58rem",color:C.muted,marginTop:1}}>Init: {totals.totalRotePct.toFixed(2)}%</div>
                </td>
                {/* 18: SBE / R Suggest */}
                <td style={{padding:"12px 6px",textAlign:"right",fontWeight:700,fontSize:"0.68rem",color:C.muted}}>{displayMode==="R"?"—":""}</td>
                {/* 19: SBE% / Locked */}
                <td />
                {/* 20: P/L */}
                <td style={{padding:"12px 6px",textAlign:"right",whiteSpace:"nowrap"}}><div style={{fontWeight:800,fontSize:"0.72rem",color:totals.totalPL>=0?C.green:C.red}}>{`${totals.totalPL>=0?"+":"-"}${fmt$(Math.abs(totals.totalPL),2)}`}</div>{(()=>{const tr=enriched.reduce((s,p)=>s+p.realizedPL,0);return tr!==0?<div style={{fontSize:"0.54rem",fontWeight:700,color:tr>=0?C.green:C.red,marginTop:2}}>Rlzd {tr>=0?"+":"-"}{fmt$(Math.abs(tr),2)}</div>:null;})()}</td>
                {/* 21: R */}
                <td />
                {/* 22: Notes */}
                <td />
                {/* 23: Actions */}
                <td />
              </DragTr>
            </tbody>
          </table>
        </div>
        {/* RTS Bar — green=free, red=at risk. Bar fills green as RTS approaches $0 */}
        <div style={{ padding:"14px 24px 18px",borderTop:`1px solid ${C.border}` }}>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <div style={{ fontWeight:700,fontSize:"0.60rem",letterSpacing:"0.12em",textTransform:"uppercase",color:C.muted }}>RTS</div>
            {(() => {
              const isFree = totals.totalRTS <= 0;
              const ps = +portfolioSize || 1;
              // Bar: 100% green when free, shrinks as RTS grows relative to 2% of portfolio
              const greenPct = isFree ? 100 : Math.max(0, 100 - (totals.totalRTS / (ps * 0.02)) * 100);
              const barColor = isFree ? C.green : totals.totalRTS < (ps * 0.005) ? C.gold : C.red;
              const valueColor = isFree ? C.green : C.red;
              return (
                <>
                  <div style={{ flex:1,height:6,borderRadius:3,background:"rgba(255,255,255,0.05)",position:"relative",overflow:"hidden" }}>
                    <div style={{ position:"absolute",left:0,top:0,bottom:0,borderRadius:3,width:`${Math.max(2, Math.min(100, greenPct))}%`,background:barColor,transition:"width 0.3s, background 0.3s" }} />
                  </div>
                  <div style={{ fontWeight:800,fontSize:"0.72rem",color:valueColor,minWidth:60,textAlign:"right" }}>{isFree ? "FREE" : fmt$(totals.totalRTS)}</div>
                </>
              );
            })()}
          </div>
          {/* ROTE Warning — triggers when current ROTE exceeds target, or initial exceeds 1.5x target */}
          {(totals.currentRotePct > totals.tgtRotePct || totals.totalRotePct > totals.tgtRotePct * 1.5) && (
            <div style={{ display:"flex",alignItems:"flex-start",gap:8,padding:"10px 0 0",marginTop:8,borderTop:`1px solid rgba(239,68,68,0.15)` }}>
              <span style={{ fontSize:"1rem" }}>⚠</span>
              <div>
                {totals.currentRotePct > totals.tgtRotePct && (
                  <div style={{ fontWeight:700,fontSize:"0.68rem",color:C.red }}>Current ROTE: {totals.currentRotePct.toFixed(2)}% exceeds your {totals.tgtRotePct.toFixed(2)}% target</div>
                )}
                {totals.currentRotePct <= totals.tgtRotePct && totals.totalRotePct > totals.tgtRotePct * 1.5 && (
                  <div style={{ fontWeight:700,fontSize:"0.68rem",color:C.gold }}>Initial ROTE: {totals.totalRotePct.toFixed(2)}% — trail stops have reduced current to {totals.currentRotePct.toFixed(2)}%</div>
                )}
                <div style={{ fontSize:"0.62rem",color:C.muted,marginTop:2 }}>Target: {totals.tgtRotePct.toFixed(2)}% (set in Compounder). Current uses active stops. Initial uses original stops.</div>
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      {/* Glossary — collapsible */}
      <GlassCard style={{ padding: glossaryOpen ? "22px 26px" : "14px 26px", cursor:"pointer" }}>
        <div onClick={() => setGlossaryOpen(g => !g)} style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
          <Eyebrow>Glossary</Eyebrow>
          <span style={{ fontSize:"0.72rem",color:C.muted,transform:glossaryOpen?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s" }}>▼</span>
        </div>
        {glossaryOpen && (
          <table style={{ width:"100%",borderCollapse:"collapse",fontSize:"0.72rem",marginTop:10 }}>
            <tbody>
              {GLOSSARY.map(([abbr,full,desc],i)=>(
                <tr key={i} style={{borderBottom:"1px solid rgba(255,255,255,0.03)"}}>
                  <td style={{padding:"9px 10px",fontWeight:700,color:C.gold,fontSize:"0.72rem",width:60,whiteSpace:"nowrap"}}>{abbr}</td>
                  <td style={{padding:"9px 10px",color:C.text,width:150}}>{full}</td>
                  <td style={{padding:"9px 10px",color:C.muted,lineHeight:1.5}}>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassCard>

      {/* ═══════════════════════════════════════ */}
      {/* ─── LIVE RISK BUDGET (Compounder) ─── */}
      {/* ═══════════════════════════════════════ */}

      <div style={{ marginTop: 32, borderTop: `1px solid ${C.border}`, paddingTop: 28 }}>
        <Eyebrow>Compounder</Eyebrow>
        <h2 style={{ fontWeight:800,fontSize:"clamp(1.2rem, 3vw, 1.6rem)",letterSpacing:"-0.04em",color:C.white,margin:"0 0 8px" }}>Live Risk Budget</h2>
        <p style={{ fontSize:"0.74rem",color:C.muted,margin:"0 0 24px",lineHeight:1.6 }}>Your real-time compounding command center. When positions become risk-free (stop at breakeven or above), that ROTE frees up for new trades. Closed trade profits compound into your equity — new trades risk more dollars at the same %.</p>

        {/* Equity Overview */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:14,marginBottom:20 }}>
          <StatTile big label="Portfolio Size" value={fmt$(compPs)} sub="Starting capital" />
          <StatTile big label="Realized P/L" value={`${compRealizedPL>=0?"+":"-"}${fmt$(Math.abs(compRealizedPL),2)}`} color={compRealizedPL>=0?C.green:C.red} sub="From closed trades" />
          <StatTile big label="Current Equity" value={fmt$(compEquity)} color={C.goldBright} sub="Portfolio + Realized" />
          <StatTile big label="Unrealized P/L" value={`${budget.totalUnrealized>=0?"+":"-"}${fmt$(Math.abs(budget.totalUnrealized),2)}`} color={budget.totalUnrealized>=0?C.green:C.red} sub="Open positions" />
        </div>

        {/* Risk Budget Panel */}
        <GlassCard style={{ padding:"24px 28px",marginBottom:20 }}>
          <Eyebrow>ROTE Risk Budget</Eyebrow>
          <div style={{ display:"flex",alignItems:"center",gap:16,marginBottom:20,flexWrap:"wrap" }}>
            <CalcInput label="Target Max ROTE" value={targetRote} onChange={setTargetRote} suffix="%" placeholder="2" style={{maxWidth:140}} />
            <div style={{ padding:"10px 18px",borderRadius:12,background:C.goldDim,border:`1px solid ${C.borderGold}` }}>
              <span style={{ fontSize:"0.56rem",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em",display:"block" }}>Total Risk Budget</span>
              <span style={{ fontSize:"1.1rem",fontWeight:800,color:C.goldBright }}>{fmt$(budget.totalBudget)}</span>
            </div>
          </div>

          {/* ROTE breakdown — prominent stat tiles */}
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",gap:12,marginBottom:16 }}>
            <div style={{ padding:"12px 16px",borderRadius:12,background:budget.deployedPct>(+targetRote||0)?"rgba(239,68,68,0.08)":"rgba(255,255,255,0.03)",border:`1px solid ${budget.deployedPct>(+targetRote||0)?"rgba(239,68,68,0.30)":C.border}` }}>
              <div style={{ fontSize:"0.60rem",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4 }}>Current ROTE</div>
              <div style={{ fontSize:"1.15rem",fontWeight:800,color:budget.deployedPct>(+targetRote||0)?C.red:C.green }}>{budget.deployedPct.toFixed(2)}%</div>
              <div style={{ fontSize:"0.62rem",color:C.muted,marginTop:2 }}>Target: {(+targetRote||0).toFixed(2)}% max</div>
            </div>
            {budget.initialRotePct !== budget.deployedPct && (
              <div style={{ padding:"12px 16px",borderRadius:12,background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}` }}>
                <div style={{ fontSize:"0.60rem",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4 }}>Initial ROTE</div>
                <div style={{ fontSize:"1.15rem",fontWeight:800,color:C.gold }}>{budget.initialRotePct.toFixed(2)}%</div>
                <div style={{ fontSize:"0.62rem",color:C.muted,marginTop:2 }}>Before trail stops</div>
              </div>
            )}
            <div style={{ padding:"12px 16px",borderRadius:12,background:"rgba(34,197,94,0.05)",border:"1px solid rgba(34,197,94,0.15)" }}>
              <div style={{ fontSize:"0.60rem",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4 }}>Available</div>
              <div style={{ fontSize:"1.15rem",fontWeight:800,color:C.green }}>{fmt$(budget.available)}</div>
              <div style={{ fontSize:"0.62rem",color:C.muted,marginTop:2 }}>{budget.availablePct.toFixed(2)}% remaining</div>
            </div>
          </div>

          {/* Risk allocation bar */}
          <div style={{ marginBottom:16 }}>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}>
              <span style={{ fontSize:"0.62rem",fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em" }}>Risk Allocation</span>
            </div>
            <div style={{ height:14,borderRadius:7,background:"rgba(255,255,255,0.05)",position:"relative",overflow:"hidden" }}>
              <div style={{ position:"absolute",left:0,top:0,bottom:0,borderRadius:7,width:`${Math.min(100, budget.totalBudget > 0 ? (budget.deployedRisk / budget.totalBudget) * 100 : 0)}%`,background:C.red,transition:"width 0.3s",zIndex:2 }} />
              <div style={{ position:"absolute",left:`${budget.totalBudget > 0 ? (budget.deployedRisk / budget.totalBudget) * 100 : 0}%`,top:0,bottom:0,borderRadius:"0 7px 7px 0",width:`${Math.min(100, budget.totalBudget > 0 ? (budget.available / budget.totalBudget) * 100 : 0)}%`,background:C.green,opacity:0.6,transition:"all 0.3s",zIndex:1 }} />
            </div>
            <div style={{ display:"flex",gap:16,marginTop:8,flexWrap:"wrap" }}>
              <span style={{ fontSize:"0.68rem",fontWeight:600,color:C.red }}><span style={{display:"inline-block",width:10,height:10,borderRadius:3,background:C.red,marginRight:5,verticalAlign:"middle"}} />At Risk: {fmt$(budget.deployedRisk)} ({budget.atRiskCount})</span>
              <span style={{ fontSize:"0.68rem",fontWeight:600,color:C.green }}><span style={{display:"inline-block",width:10,height:10,borderRadius:3,background:C.green,opacity:0.6,marginRight:5,verticalAlign:"middle"}} />Available: {fmt$(budget.available)}</span>
              {budget.freeCount > 0 && <span style={{ fontSize:"0.68rem",fontWeight:600,color:C.blue }}><span style={{display:"inline-block",width:10,height:10,borderRadius:3,background:C.blue,marginRight:5,verticalAlign:"middle"}} />Risk-Free: {budget.freeCount} (freed {fmt$(budget.freedRisk)})</span>}
            </div>
          </div>

          {/* Key action */}
          {budget.available > 0 && (
            <div style={{ padding:"14px 18px",borderRadius:12,background:"rgba(34,197,94,0.06)",border:"1px solid rgba(34,197,94,0.20)",marginBottom:8 }}>
              <div style={{ fontWeight:800,fontSize:"0.76rem",color:C.green,marginBottom:4 }}>You can deploy {fmt$(budget.available)} more risk</div>
              <div style={{ fontSize:"0.68rem",color:C.text,lineHeight:1.6 }}>
                {(() => {
                  const n = rNumStocks || 4;
                  const fullR = budget.totalBudget / n;
                  const halfR = fullR / 2;
                  const fullCount = fullR > 0 ? Math.floor(budget.available / fullR) : 0;
                  const halfCount = halfR > 0 ? Math.floor(budget.available / halfR) : 0;
                  const fullPct = compEquity > 0 ? (fullR / compEquity * 100).toFixed(2) : "0.00";
                  const halfPct = compEquity > 0 ? (halfR / compEquity * 100).toFixed(2) : "0.00";
                  return <>That's {budget.availablePct.toFixed(2)}% ROTE available. You could enter{" "}
                    <strong style={{color:C.white}}>{fullCount} full-R {fullCount === 1 ? "trade" : "trades"}</strong>{" "}
                    at {fmt$(fullR)} (~{fullPct}% each), or{" "}
                    <strong style={{color:C.white}}>{halfCount} half-R {halfCount === 1 ? "trade" : "trades"}</strong>{" "}
                    at {fmt$(halfR)} (~{halfPct}% each).</>;
                })()}
              </div>
            </div>
          )}
          {budget.available <= 0 && budget.totalCount > 0 && (
            <div style={{ padding:"14px 18px",borderRadius:12,background:C.redDim,border:"1px solid rgba(239,68,68,0.20)" }}>
              <div style={{ fontWeight:800,fontSize:"0.76rem",color:C.red,marginBottom:4 }}>ROTE Fully Deployed</div>
              <div style={{ fontSize:"0.68rem",color:C.text,lineHeight:1.6 }}>
                All {(+targetRote||2)}% ROTE is in use. To enter new trades, move stops to breakeven on existing positions to free up risk, or wait for positions to close.
              </div>
            </div>
          )}
        </GlassCard>

        {/* Position Risk Breakdown — collapsible */}
        {posAnalysis.length > 0 && (
          <GlassCard style={{ marginBottom:20 }}>
            <div onClick={() => setRiskBreakdownOpen(o => !o)} style={{ padding:"20px 24px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",userSelect:"none" }}>
              <div>
                <div style={{ fontWeight:700,fontSize:"0.78rem",color:C.white }}>Position Risk Breakdown</div>
                <div style={{ fontWeight:400,fontSize:"0.64rem",color:C.muted,marginTop:2 }}>How each open position contributes to your ROTE. Green = risk-free (stop at/above entry).</div>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                <span style={{ fontSize:"0.62rem",fontWeight:700,color:C.muted }}>{posAnalysis.length} positions</span>
                <span style={{ fontSize:"0.9rem",color:C.gold,transform:riskBreakdownOpen?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s",display:"inline-block" }}>▼</span>
              </div>
            </div>
            {riskBreakdownOpen && (
              <div style={{ overflowX:"auto",padding:"0 0 4px",borderTop:`1px solid ${C.border}` }}>
                <table style={{ width:"100%",borderCollapse:"collapse",fontSize:"0.71rem" }}>
                  <thead><tr style={{ borderBottom:`1px solid ${C.border}` }}>
                    {compTh("Symbol","left")}{compTh("Entry")}{compTh("Current")}{compTh("Stop")}{compTh("Shares")}{compTh("Initial Risk $")}{compTh("Initial ROTE")}{compTh("Current Risk $")}{compTh("Current ROTE")}{compTh("Status","left")}{compTh("Unrealized P/L")}
                  </tr></thead>
                  <tbody>
                    {posAnalysis.map((p, i) => (
                      <tr key={i} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)",background:p.isRiskFree?"rgba(34,197,94,0.03)":i%2?"rgba(255,255,255,0.01)":"transparent" }}>
                        <td style={{padding:"10px 8px",fontWeight:700,color:C.gold}}>{p.sym}</td>
                        <td style={{padding:"10px 8px",textAlign:"right",color:C.text}}>${p.epN.toFixed(2)}</td>
                        <td style={{padding:"10px 8px",textAlign:"right",color:C.white,fontWeight:700}}>${p.cpN.toFixed(2)}</td>
                        <td style={{padding:"10px 8px",textAlign:"right",color:C.muted}}>${p.activeStop.toFixed(2)}</td>
                        <td style={{padding:"10px 8px",textAlign:"right",color:C.text}}>{p.sharesN.toLocaleString()}</td>
                        <td style={{padding:"10px 8px",textAlign:"right",color:C.red,fontWeight:600}}>{fmt$(p.initRiskD)}</td>
                        <td style={{padding:"10px 8px",textAlign:"right",color:p.initRotePct>1.5?C.red:p.initRotePct>1?C.gold:C.text,fontWeight:600}}>{p.initRotePct.toFixed(2)}%</td>
                        <td style={{padding:"10px 8px",textAlign:"right",fontWeight:700,color:p.isRiskFree?C.green:C.red}}>{p.isRiskFree?"$0 (FREE)":fmt$(p.currentRiskD)}</td>
                        <td style={{padding:"10px 8px",textAlign:"right",fontWeight:700,color:p.isRiskFree?C.green:p.currentRotePct>1.5?C.red:C.text}}>{p.isRiskFree?"0.00%":`${p.currentRotePct.toFixed(2)}%`}</td>
                        <td style={{padding:"10px 8px"}}><span style={{padding:"3px 8px",borderRadius:980,fontSize:"0.50rem",fontWeight:700,background:p.isRiskFree?C.greenDim:C.redDim,color:p.isRiskFree?C.green:C.red,border:`1px solid ${p.isRiskFree?"rgba(34,197,94,0.25)":"rgba(239,68,68,0.25)"}`}}>{p.isRiskFree?"FREE":"AT RISK"}</span></td>
                        <td style={{padding:"10px 8px",textAlign:"right",fontWeight:700,color:p.unrealizedPL>=0?C.green:C.red}}>{p.unrealizedPL>=0?"+":"-"}{fmt$(Math.abs(p.unrealizedPL),2)}</td>
                      </tr>
                    ))}
                    {/* Total row */}
                    <tr style={{ borderTop:`2px solid ${C.border}`,background:"rgba(255,255,255,0.02)" }}>
                      <td style={{padding:"12px 8px",fontWeight:800,fontSize:"0.64rem",color:C.white,textTransform:"uppercase",letterSpacing:"0.06em"}}>Total</td>
                      <td colSpan={4} />
                      <td style={{padding:"12px 8px",textAlign:"right",fontWeight:800,color:C.red}}>{fmt$(posAnalysis.reduce((s,p)=>s+p.initRiskD,0))}</td>
                      <td style={{padding:"12px 8px",textAlign:"right",fontWeight:800,color:C.muted}}>{compEquity>0?(posAnalysis.reduce((s,p)=>s+p.initRiskD,0)/compEquity*100).toFixed(2):0}%</td>
                      <td style={{padding:"12px 8px",textAlign:"right",fontWeight:800,color:budget.deployedRisk>0?C.red:C.green}}>{budget.deployedRisk>0?fmt$(budget.deployedRisk):"$0 (ALL FREE)"}</td>
                      <td style={{padding:"12px 8px",textAlign:"right",fontWeight:800,color:C.muted}}>{budget.deployedPct.toFixed(2)}%</td>
                      <td />
                      <td style={{padding:"12px 8px",textAlign:"right",fontWeight:800,color:budget.totalUnrealized>=0?C.green:C.red}}>{budget.totalUnrealized>=0?"+":"-"}{fmt$(Math.abs(budget.totalUnrealized),2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        )}

        {/* How It Works */}
        <GlassCard style={{ padding:"22px 26px" }}>
          <Eyebrow>How It Works</Eyebrow>
          <div style={{ fontSize:"0.72rem",color:C.text,lineHeight:1.7 }}>
            <p style={{margin:"0 0 10px"}}><strong style={{color:C.goldBright}}>Current Equity</strong> = your Portfolio Size + total realized P/L from all closed trades in your Journal. This is your true compounded capital — it grows when you take profits and shrinks when you take losses.</p>
            <p style={{margin:"0 0 10px"}}><strong style={{color:C.white}}>Risk Budget</strong> = Current Equity x your target ROTE %. This is the maximum dollar amount you should have at risk across all open positions combined.</p>
            <p style={{margin:"0 0 10px"}}><strong style={{color:C.green}}>Freeing Up Risk</strong> — when you move a position's stop to breakeven (or above entry), its risk becomes $0. That ROTE allocation is now available for new trades. You don't need to close the position — just make it risk-free.</p>
            <p style={{margin:"0"}}><strong style={{color:C.white}}>Compounding</strong> — when you close a winning trade, the profit adds to your equity. Your next risk budget is bigger (same % of a larger number). Over time, each trade risks more dollars while keeping the same % discipline.</p>
          </div>
        </GlassCard>
      </div>

    </div>
  );
}

// ═══════════════════════════════════════
// ─── SETTINGS PAGE ───
// ═══════════════════════════════════════
function SettingsPage({ setupTypes, setSetupTypes, tags, setTags, exitReasons, setExitReasons, fontSize, setFontSize, userEmail, displayName, onDisplayNameChange, session, onIbkrSync }) {
  const isAdmin = userEmail && userEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const [ibkrTutOpen, setIbkrTutOpen] = useState(false);
  const [ibkrQueryId, setIbkrQueryId] = useState("");
  const [ibkrToken, setIbkrToken] = useState("");
  const [ibkrConnStatus, setIbkrConnStatus] = useState("");
  const [ibkrLoaded, setIbkrLoaded] = useState(false);
  const [newSetup, setNewSetup] = useState("");
  const [newTag, setNewTag] = useState("");
  const [newReason, setNewReason] = useState("");
  const [accessCodes, setAccessCodes] = useState([]);
  const [newCode, setNewCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [allMembers, setAllMembers] = useState([]);
  const [backupStatus, setBackupStatus] = useState("");

  // Load this member's own IBKR connection (their RLS-protected settings)
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    supabase.from("user_settings").select("setting_key,setting_value").eq("user_id", uid).in("setting_key", ["ibkr_token", "ibkr_query_id"]).then(({ data }) => {
      (data || []).forEach(s => {
        if (s.setting_key === "ibkr_token") setIbkrToken(s.setting_value == null ? "" : String(s.setting_value));
        if (s.setting_key === "ibkr_query_id") setIbkrQueryId(s.setting_value == null ? "" : String(s.setting_value));
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

  return (
    <div>
      <Eyebrow>Settings</Eyebrow>
      <h1 style={{ fontWeight: 800, fontSize: "2rem", letterSpacing: "-0.04em", color: C.white, marginBottom: 24 }}>Account Settings</h1>

      {/* Interactive Brokers Sync */}
      <GlassCard style={{ padding: "24px 28px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div style={{ flex: "1 1 280px" }}>
            <div style={{ fontWeight: 700, fontSize: "0.84rem", color: C.white, marginBottom: 4 }}>Interactive Brokers Sync</div>
            <div style={{ fontSize: "0.70rem", color: C.muted, lineHeight: 1.6 }}>Pull your open positions and closed trades straight from IBKR (entered on/after {IBKR_SYNC_FLOOR}). You'll always see a preview before anything saves — manual entries are never overwritten.</div>
          </div>
          {onIbkrSync
            ? <button onClick={onIbkrSync} style={{ padding: "10px 20px", borderRadius: 980, border: `1px solid ${C.borderGold}`, background: C.goldDim, color: C.gold, fontWeight: 800, fontSize: "0.74rem", cursor: "pointer", fontFamily: font, display: "flex", alignItems: "center", gap: 7, alignSelf: "center" }}>⟳ Sync from IBKR</button>
            : <span style={{ fontSize: "0.6rem", color: C.muted, alignSelf: "center", textAlign: "right", maxWidth: 160 }}>Syncing rolls out soon — connect your account below so you're ready.</span>}
        </div>

        {/* Per-member connection — your own IBKR Query ID + Token (stored only on your account) */}
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: "0.62rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>Your IBKR Connection</span>
            {ibkrLoaded && <span style={{ fontSize: "0.56rem", fontWeight: 700, color: ibkrConnected ? C.green : C.muted, border: `1px solid ${ibkrConnected ? C.green : C.border}55`, borderRadius: 980, padding: "2px 9px" }}>{ibkrConnected ? "Connected ✓" : "Not connected"}</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, alignItems: "end" }}>
            <div>
              <label style={{ fontWeight: 700, fontSize: "0.56rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 6, display: "block" }}>Flex Query ID</label>
              <input type="text" value={ibkrQueryId} onChange={e => setIbkrQueryId(e.target.value)} placeholder="e.g. 1519726" style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", color: C.white, fontSize: "0.82rem", fontFamily: font, outline: "none" }} onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
            </div>
            <div>
              <label style={{ fontWeight: 700, fontSize: "0.56rem", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 6, display: "block" }}>Flex Web Service Token</label>
              <input type="password" value={ibkrToken} onChange={e => setIbkrToken(e.target.value)} placeholder="paste your token" autoComplete="off" style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", color: C.white, fontSize: "0.82rem", fontFamily: font, outline: "none" }} onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
            </div>
            <button onClick={saveIbkrConn} disabled={ibkrConnStatus === "saving"} style={{ padding: "10px 18px", borderRadius: 980, border: `1px solid ${ibkrConnStatus === "saved" ? "rgba(34,197,94,0.4)" : C.borderGold}`, background: ibkrConnStatus === "saved" ? "rgba(34,197,94,0.12)" : C.goldDim, color: ibkrConnStatus === "saved" ? C.green : C.gold, fontWeight: 800, fontSize: "0.72rem", cursor: "pointer", fontFamily: font, height: 40, whiteSpace: "nowrap" }}>{ibkrConnStatus === "saving" ? "Saving…" : ibkrConnStatus === "saved" ? "Saved ✓" : ibkrConnStatus === "error" ? "Failed" : "Save connection"}</button>
          </div>
          <div style={{ fontSize: "0.58rem", color: C.muted, marginTop: 8, lineHeight: 1.6 }}>Stored only on your own account (private). The token is read-only — it can pull your statements but can't trade or move money. Don't have these yet? Follow the steps below.</div>
        </div>

        {/* Expandable setup tutorial */}
        <div style={{ marginTop: 18, borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
          <div onClick={() => setIbkrTutOpen(o => !o)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
            <span style={{ fontSize: "0.66rem", fontWeight: 700, color: C.gold, letterSpacing: "0.04em" }}>📘 First time? How to connect Interactive Brokers (step by step)</span>
            <span style={{ fontSize: "0.6rem", color: C.muted, transform: ibkrTutOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
          </div>
          {ibkrTutOpen && (
            <div style={{ marginTop: 14, fontSize: "0.72rem", color: C.text, lineHeight: 1.7 }}>
              <p style={{ margin: "0 0 14px", color: C.muted }}>This is a one-time setup. It lets the app read (never change) your IBKR account statements. Takes about 5 minutes. Follow each step exactly.</p>

              {[
                { h: "Step 1 · Log in to IBKR on a computer", b: <>Go to <strong style={{ color: C.white }}>interactivebrokers.com</strong> and log in to <strong style={{ color: C.white }}>Client Portal</strong> (the web version, not the mobile app). At the top menu, click <strong style={{ color: C.white }}>Performance &amp; Reports → Flex Queries</strong>.</> },
                { h: "Step 2 · Create an Activity Flex Query", b: <>Next to <strong style={{ color: C.white }}>“Activity Flex Query”</strong>, click the blue <strong style={{ color: C.white }}>+</strong> button. In <strong style={{ color: C.white }}>Query Name</strong>, type anything, e.g. <strong style={{ color: C.white }}>VIV</strong>.</> },
                { h: "Step 3 · Tick TWO sections", b: <>Under <strong style={{ color: C.white }}>Sections</strong>, click <strong style={{ color: C.white }}>Open Positions</strong> — when its field list appears, click <strong style={{ color: C.white }}>Select All</strong>, then leave its option as <strong style={{ color: C.white }}>Summary</strong>. Then scroll down, click <strong style={{ color: C.white }}>Trades</strong> — again click <strong style={{ color: C.white }}>Select All</strong>, and leave its option as <strong style={{ color: C.white }}>Execution</strong>. Don't tick anything else.</> },
                { h: "Step 4 · Delivery settings", b: <>Scroll to <strong style={{ color: C.white }}>Delivery Configuration</strong>. Set <strong style={{ color: C.white }}>Format = XML</strong> and <strong style={{ color: C.white }}>Period = Last 365 Calendar Days</strong>. (The app itself only keeps trades from {IBKR_SYNC_FLOOR} onward — this just makes sure nothing recent is missed.)</> },
                { h: "Step 5 · General settings — leave the defaults", b: <>Date Format <strong style={{ color: C.white }}>yyyyMMdd</strong>, Time Format <strong style={{ color: C.white }}>HHmmss</strong>, separator <strong style={{ color: C.white }}>; (semi-colon)</strong>, and all the Yes/No toggles set to <strong style={{ color: C.white }}>No</strong>. Click <strong style={{ color: C.white }}>Continue</strong>, review, then <strong style={{ color: C.white }}>Create</strong>.</> },
                { h: "Step 6 · Copy your Query ID", b: <>Back on the Flex Queries list, your new query shows a <strong style={{ color: C.white }}>Query ID</strong> (a number). Write it down.</> },
                { h: "Step 7 · Turn on the Flex Web Service & get a token", b: <>On the same page, find <strong style={{ color: C.white }}>Flex Web Service Configuration</strong>. Switch its <strong style={{ color: C.white }}>Status</strong> to <strong style={{ color: C.white }}>on</strong>, click <strong style={{ color: C.white }}>Generate New Token</strong>, set the longest expiry, and copy the long number it gives you. <span style={{ color: C.gold }}>Treat this token like a password — it's read-only, but don't share it publicly.</span></> },
                { h: "Step 8 · Paste them into the fields above", b: <>Copy your <strong style={{ color: C.white }}>Query ID</strong> and <strong style={{ color: C.white }}>Token</strong> into <strong style={{ color: C.white }}>Your IBKR Connection</strong> above and click <strong style={{ color: C.white }}>Save connection</strong>. That's it — your account is linked (privately, only to you). The <strong style={{ color: C.gold }}>“Sync from IBKR”</strong> button pulls <em>your</em> data.</> },
              ].map((s, i) => (
                <div key={i} style={{ marginBottom: 12, paddingLeft: 14, borderLeft: `2px solid ${C.borderGold}` }}>
                  <div style={{ fontWeight: 700, color: C.white, fontSize: "0.72rem", marginBottom: 3 }}>{s.h}</div>
                  <div style={{ color: C.text }}>{s.b}</div>
                </div>
              ))}

              <div style={{ marginTop: 14, padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: "0.68rem", color: C.muted, lineHeight: 1.7 }}>
                <strong style={{ color: C.white }}>Good to know:</strong>
                <div style={{ marginTop: 6 }}>• <strong style={{ color: C.text }}>There's a 1-day lag.</strong> Trades you make today appear in the sync the next business day (after IBKR settles overnight). For day-of tracking, key the trade in manually — when the sync catches up you'll be able to reconcile it.</div>
                <div style={{ marginTop: 4 }}>• <strong style={{ color: C.text }}>The dot next to each ticker</strong> shows where it came from: <SourceDot source="manual" /> manual · <SourceDot source="ibkr" /> auto-synced from IBKR.</div>
                <div style={{ marginTop: 4 }}>• <strong style={{ color: C.text }}>Your data is safe.</strong> Every sync shows a preview first, and it only ever adds or updates IBKR rows — it never edits or deletes anything you typed by hand.</div>
              </div>
            </div>
          )}
        </div>
      </GlassCard>

      {/* Font Size */}
      <GlassCard style={{ padding: "24px 28px", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: "0.84rem", color: C.white, marginBottom: 4 }}>Font Size</div>
        <div style={{ fontSize: "0.70rem", color: C.muted, marginBottom: 16 }}>Choose your preferred reading size. Applies everywhere.</div>
        <div style={{ display: "flex", gap: 0, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}`, width: "fit-content" }}>
          {[{ key: "small", label: "Small" }, { key: "standard", label: "Standard" }, { key: "large", label: "Large" }, { key: "huge", label: "Huge" }].map((opt, idx, arr) => (
            <button key={opt.key} onClick={() => setFontSize(opt.key)} style={{
              padding: "10px 22px", border: "none", cursor: "pointer", fontFamily: font,
              fontWeight: fontSize === opt.key ? 800 : 500,
              fontSize: "0.78rem",
              background: fontSize === opt.key ? C.goldDim : "rgba(255,255,255,0.02)",
              color: fontSize === opt.key ? C.gold : C.muted,
              borderRight: idx < arr.length - 1 ? `1px solid ${C.border}` : "none",
              transition: "all 0.15s",
            }}>{opt.label}</button>
          ))}
        </div>
      </GlassCard>

      {/* Profile */}
      <GlassCard style={{ padding: "24px 28px", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: "0.84rem", color: C.white, marginBottom: 16 }}>Profile</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <TextInput label="Display Name" value={displayName || ""} onChange={onDisplayNameChange} placeholder="Your name" upper={false} style={{ flex: "1 1 200px" }} />
          <TextInput label="Email" value={userEmail || ""} onChange={() => {}} placeholder="email@example.com" upper={false} style={{ flex: "1 1 280px" }} />
        </div>
      </GlassCard>

      {/* Setup Types */}
      {renderListManager(
        "Setup Types",
        "Entry strategies used in your open positions and trade journal. These appear as dropdown options everywhere.",
        setupTypes,
        () => addItem(setupTypes, setSetupTypes, newSetup, setNewSetup),
        v => removeItem(setupTypes, setSetupTypes, v),
        newSetup, setNewSetup, "e.g. Flag Breakout"
      )}

      {/* Tags */}
      {renderListManager(
        "Tags",
        "Custom labels you can attach to any trade. Use for filtering your journal by theme, catalyst, or strategy nuance.",
        tags,
        () => addItem(tags, setTags, newTag, setNewTag),
        v => removeItem(tags, setTags, v),
        newTag, setNewTag, "e.g. Pre-Earnings"
      )}

      {/* Exit Reasons */}
      {renderListManager(
        "Exit Reasons",
        "Reasons for closing a position. Shown when you sell shares from the dashboard.",
        exitReasons,
        () => addItem(exitReasons, setExitReasons, newReason, setNewReason),
        v => removeItem(exitReasons, setExitReasons, v),
        newReason, setNewReason, "e.g. Gap Down"
      )}

      {/* Admin Panel — only visible to admin */}
      {isAdmin && (
        <>
          <div style={{ marginTop: 32, marginBottom: 16, borderTop: `1px solid ${C.border}`, paddingTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.red }}>Admin Only</span>
              <span style={{ fontSize: "0.62rem", padding: "2px 8px", borderRadius: 6, background: C.redDim, border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5", fontWeight: 600 }}>Owner</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: "1.3rem", letterSpacing: "-0.03em", color: C.white, marginBottom: 4 }}>Access Management</div>
            <div style={{ fontSize: "0.74rem", color: C.muted, lineHeight: 1.5, marginBottom: 16 }}>Manage the registration code that members need to create an account.</div>
          </div>

          {/* Current Active Code */}
          <GlassCard style={{ padding: "24px 28px", marginBottom: 16, borderColor: "rgba(239,68,68,0.15)" }}>
            <div style={{ fontWeight: 700, fontSize: "0.84rem", color: C.white, marginBottom: 4 }}>Active Registration Code</div>
            <div style={{ fontSize: "0.70rem", color: C.muted, marginBottom: 16 }}>Members need this code to create a new account. Share it in your Skool community.</div>
            {activeCode ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderRadius: 12, background: "rgba(201,152,42,0.06)", border: `1px solid ${C.borderGold}`, marginBottom: 12 }}>
                <span style={{ fontWeight: 900, fontSize: "1.4rem", letterSpacing: "0.10em", color: C.goldBright, fontFamily: "monospace" }}>{activeCode.code}</span>
                <button onClick={() => { navigator.clipboard.writeText(activeCode.code); }} style={{
                  marginLeft: "auto", padding: "6px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
                  background: "rgba(255,255,255,0.04)", color: C.muted, fontSize: "0.70rem", fontWeight: 600,
                  cursor: "pointer", fontFamily: font,
                }}>Copy</button>
                <button onClick={() => handleDeactivateCode(activeCode.id)} style={{
                  padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)",
                  background: C.redDim, color: "#fca5a5", fontSize: "0.70rem", fontWeight: 600,
                  cursor: "pointer", fontFamily: font,
                }}>Deactivate</button>
              </div>
            ) : (
              <div style={{ padding: "14px 18px", borderRadius: 12, background: C.redDim, border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5", fontSize: "0.78rem", fontWeight: 600, marginBottom: 12 }}>
                No active code — new members cannot register right now.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="text" placeholder="NEW CODE (e.g. VIV-MAY-2026)" value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === "Enter") handleCreateCode(); }}
                style={{ flex: 1, maxWidth: 280, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", color: C.white, fontSize: "0.82rem", fontFamily: "monospace", fontWeight: 700, letterSpacing: "0.06em", outline: "none", textTransform: "uppercase" }}
                onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
              <GoldBtn onClick={handleCreateCode} small disabled={codeLoading}>{codeLoading ? "Saving..." : "Set New Code"}</GoldBtn>
            </div>
          </GlassCard>

          {/* Code History */}
          {accessCodes.length > 1 && (
            <GlassCard style={{ padding: "24px 28px", marginBottom: 16, borderColor: "rgba(239,68,68,0.15)" }}>
              <div style={{ fontWeight: 700, fontSize: "0.84rem", color: C.white, marginBottom: 12 }}>Code History</div>
              {accessCodes.filter(c => !c.is_active).slice(0, 10).map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid rgba(255,255,255,0.04)`, fontSize: "0.74rem" }}>
                  <span style={{ fontFamily: "monospace", color: C.muted, fontWeight: 600, letterSpacing: "0.04em" }}>{c.code}</span>
                  <span style={{ marginLeft: "auto", color: "rgba(255,255,255,0.25)", fontSize: "0.64rem" }}>{new Date(c.created_at).toLocaleDateString()}</span>
                  <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.25)", fontSize: "0.58rem", fontWeight: 600 }}>Expired</span>
                </div>
              ))}
            </GlassCard>
          )}

          {/* Members List */}
          <GlassCard style={{ padding: "24px 28px", marginBottom: 16, borderColor: "rgba(239,68,68,0.15)" }}>
            <div style={{ fontWeight: 700, fontSize: "0.84rem", color: C.white, marginBottom: 4 }}>Registered Members</div>
            <div style={{ fontSize: "0.70rem", color: C.muted, marginBottom: 16 }}>{allMembers.length} total member{allMembers.length !== 1 ? "s" : ""}</div>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              {allMembers.map(m => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid rgba(255,255,255,0.04)`, fontSize: "0.74rem" }}>
                  <div>
                    <div style={{ fontWeight: 600, color: C.white }}>{m.display_name || m.email.split("@")[0]}</div>
                    <div style={{ fontSize: "0.64rem", color: C.muted }}>{m.email}</div>
                  </div>
                  {m.is_admin && <span style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: 6, background: C.goldDim, border: `1px solid ${C.borderGold}`, color: C.gold, fontSize: "0.58rem", fontWeight: 700 }}>Admin</span>}
                  <span style={{ marginLeft: m.is_admin ? 0 : "auto", color: "rgba(255,255,255,0.25)", fontSize: "0.62rem" }}>Joined {new Date(m.created_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* ═══ Data Backup & Restore ═══ */}
          <div style={{ marginTop: 24, marginBottom: 16, borderTop: `1px solid ${C.border}`, paddingTop: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.green }}>Data Protection</span>
              <span style={{ fontSize: "0.62rem", padding: "2px 8px", borderRadius: 6, background: C.greenDim, border: "1px solid rgba(34,197,94,0.25)", color: C.green, fontWeight: 600 }}>Backup</span>
            </div>
            <div style={{ fontWeight: 800, fontSize: "1.3rem", letterSpacing: "-0.03em", color: C.white, marginBottom: 4 }}>Backup & Restore</div>
            <div style={{ fontSize: "0.74rem", color: C.muted, lineHeight: 1.5, marginBottom: 16 }}>Export all member data (positions, trades, profiles, settings) as a JSON file. Run this before every deploy.</div>
          </div>

          <GlassCard style={{ padding: "24px 28px", marginBottom: 16, borderColor: "rgba(34,197,94,0.15)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <button onClick={async () => {
                try {
                  setBackupStatus("Exporting...");
                  // Fetch ALL data from ALL tables
                  const [posRes, tradeRes, profRes, settRes] = await Promise.all([
                    supabase.from("positions").select("*"),
                    supabase.from("trades").select("*").eq("is_deleted", false),
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
              }} style={{
                padding: "10px 20px", borderRadius: 10, border: `1px solid rgba(34,197,94,0.3)`,
                background: C.greenDim, color: C.green, fontWeight: 700, fontSize: "0.78rem",
                cursor: "pointer", fontFamily: font, letterSpacing: "0.02em",
              }}>Export Full Backup</button>

              <button onClick={async () => {
                try {
                  setBackupStatus("Exporting CSV...");
                  const [posRes, tradeRes] = await Promise.all([
                    supabase.from("positions").select("*"),
                    supabase.from("trades").select("*").eq("is_deleted", false),
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
              }} style={{
                padding: "10px 20px", borderRadius: 10, border: `1px solid ${C.borderGold}`,
                background: C.goldDim, color: C.gold, fontWeight: 700, fontSize: "0.78rem",
                cursor: "pointer", fontFamily: font, letterSpacing: "0.02em",
              }}>Export CSV (Excel)</button>

              <label style={{
                padding: "10px 20px", borderRadius: 10, border: `1px solid ${C.borderGold}`,
                background: C.goldDim, color: C.gold, fontWeight: 700, fontSize: "0.78rem",
                cursor: "pointer", fontFamily: font, letterSpacing: "0.02em",
              }}>
                Restore from Backup
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
            {backupStatus && (
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, fontSize: "0.74rem", fontWeight: 500, lineHeight: 1.5, background: backupStatus.includes("fail") || backupStatus.includes("error") || backupStatus.includes("Invalid") ? C.redDim : C.greenDim, border: `1px solid ${backupStatus.includes("fail") || backupStatus.includes("error") || backupStatus.includes("Invalid") ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.25)"}`, color: backupStatus.includes("fail") || backupStatus.includes("error") || backupStatus.includes("Invalid") ? "#fca5a5" : C.green }}>
                {backupStatus}
              </div>
            )}
            <div style={{ marginTop: 12, fontSize: "0.64rem", color: C.muted, lineHeight: 1.5 }}>
              Run Export before every deploy. Restore is non-destructive — it only adds/updates, never deletes.
            </div>
          </GlassCard>
        </>
      )}
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

// ─── Animated app background — calm grid + drifting particles + cursor glow ───
const appBgCSS = `
.viv-bg-particle{position:absolute;border-radius:50%;background:rgba(240,192,80,0.6);animation-name:vivFloat;animation-timing-function:ease-in-out;animation-iteration-count:infinite;will-change:transform,opacity;}
@keyframes vivFloat{0%,100%{transform:translateY(0) translateX(0);opacity:0.12;}25%{transform:translateY(-16px) translateX(7px);opacity:0.45;}50%{transform:translateY(-8px) translateX(-5px);opacity:0.26;}75%{transform:translateY(-22px) translateX(9px);opacity:0.6;}}
.viv-bg-pulse{position:absolute;border-radius:50%;animation:vivPulse 8s ease-in-out infinite;will-change:opacity,transform;}
@keyframes vivPulse{0%,100%{opacity:0.05;transform:translate(-50%,-50%) scale(0.85);}50%{opacity:0.15;transform:translate(-50%,-50%) scale(1.12);}}
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
  const screenW = useScreenWidth();
  const isMobile = screenW < 768;
  const isTablet = screenW >= 768 && screenW < 1024;

  // ─── Auth State ───
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
  const runIbkrSync = useCallback(async () => {
    setIbkrOpen(true); setIbkrStatus("loading"); setIbkrError(null); setIbkrData(null); setIbkrResult(null);
    try {
      const res = await fetch("/api/ibkr-sync", { headers: { Authorization: `Bearer ${session?.access_token || ""}` } });
      const json = await res.json();
      if (!json.ok) { setIbkrStatus("error"); setIbkrError(json.error || "Sync failed."); return; }
      setIbkrData(buildIbkrPreview(json, positions, journaledTrades));
      setIbkrStatus("preview");
    } catch (e) {
      setIbkrStatus("error");
      setIbkrError("Couldn't reach the sync service. Note: the /api function only runs on the deployed site (valensontrades.com), not in local dev.");
    }
  }, [positions, journaledTrades, session]);

  // Phase 2 — surgical writes from the confirmed preview. INSERT new IBKR rows, UPDATE matched rows by id only.
  // Never deletes; reconcile updates only the factual columns so notes/tags/setup/stops are preserved.
  const confirmIbkrSync = useCallback(async (posRows, tradeRows, closeRows = []) => {
    const uid = session?.user?.id;
    if (!uid) { setIbkrStatus("error"); setIbkrError("Not signed in."); return; }
    setIbkrStatus("writing");
    const nowIso = new Date().toISOString();
    const res = { tInserted: 0, tReconciled: 0, tUpdated: 0, pInserted: 0, pReconciled: 0, pUpdated: 0, pClosed: 0, errors: [] };
    // execIds of closing round-trips that actually land in the Journal this sync — the gate for auto-close.
    const journaledExecIds = new Set();

    // ── TRADES ── updates first (by id), then bulk insert new
    const tradeInserts = [];
    for (const r of tradeRows) {
      if (r.action === "synced" && r.execId) journaledExecIds.add(r.execId); // already journaled by a prior sync
      if (r.choice === "skip") continue;
      if (r.choice === "new") {
        tradeInserts.push({ user_id: uid, ticker: r.ticker, entry_date: r.entry, entry_time: r.entryTime || "", exit_date: r.exit, exit_time: r.exitTime || "", entry_price: r.entryP, exit_price: r.exitP, shares: r.shares, commission: r.commission, pl_pct: r.plPct, pl_dollar: r.plDollar, r_mult: null, setup: "", tags: [], exit_reason: "", notes: "", trade_type: r.tradeType, source: "ibkr", ib_exec_id: r.execId, ib_trade_id: r.tradeId, ib_synced_at: nowIso });
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
          setJournaledTrades(prev => prev.map(t => t.id === r.matchId ? { ...t, entry: r.entry, entryTime: r.entryTime || "", exit: r.exit, exitTime: r.exitTime || "", entryP: r.entryP, exitP: r.exitP, shares: r.shares, commission: r.commission, plPct: r.plPct, plDollar: r.plDollar, ...(rMult !== undefined ? { rMult } : {}), tradeType: r.tradeType, source: r.choice === "reconcile" ? "reconciled" : t.source, ibExecId: r.execId, ibTradeId: r.tradeId } : t));
        }
      }
    }
    if (tradeInserts.length) {
      const { data: ins, error } = await supabase.from("trades").insert(tradeInserts).select("*");
      if (error) { res.errors.push(`new trades: ${error.message}`); }
      else if (ins) {
        res.tInserted = ins.length;
        ins.forEach(t => { if (t.ib_exec_id) journaledExecIds.add(t.ib_exec_id); });
        const mapped = ins.map(t => ({ id: t.id, ticker: t.ticker, entry: t.entry_date, entryTime: t.entry_time || "", exit: t.exit_date, exitTime: t.exit_time || "", entryP: t.entry_price, exitP: t.exit_price, shares: t.shares, stop: t.stop_price, setup: t.setup, tags: t.tags || [], plPct: t.pl_pct, plDollar: t.pl_dollar, rMult: t.r_mult, reason: t.exit_reason, commission: t.commission != null ? t.commission : 0, notes: t.notes || "", chartUrl: t.chart_url || "", chartImage: t.chart_image || "", tradeType: t.trade_type || "Long", source: t.source || "ibkr", ibExecId: t.ib_exec_id || null, ibTradeId: t.ib_trade_id || null }));
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
          setPositions(prev => prev.map(p => p.id === r.matchId ? { ...p, sym: r.sym, entry: r.entry, entryTime: r.entryTime || "", shares: String(r.shares), ep: String(r.ep), tradeType: r.tradeType, source: r.choice === "reconcile" ? "reconciled" : p.source, ibConid: r.conid } : p));
        }
      }
    }
    if (posInserts.length) {
      const { data: ins, error } = await supabase.from("positions").insert(posInserts).select("*");
      if (error) { res.errors.push(`new positions: ${error.message}`); }
      else if (ins) {
        res.pInserted = ins.length;
        const mapped = ins.map(p => ({ id: p.id, _lid: 1e9 + (p.id || 0), sym: p.symbol, entry: p.entry_date, entryTime: p.entry_time || "", shares: p.shares, ep: p.entry_price, cp: p.current_price, stop: p.stop_price, stop2: p.stop_price_2, trailStop: p.trailing_stop || "", setup: p.setup, tags: p.tags || [], comm: p.commission != null ? String(p.commission) : "", notes: p.notes || "", chartUrl: p.chart_url || "", chartImage: p.chart_image || "", tradeType: p.trade_type || "Long", source: p.source || "ibkr", ibConid: p.ib_conid || null, ibSyncedAt: p.ib_synced_at || null }));
        setPositions(prev => [...prev, ...mapped]);
        lastLoadedCount.current = (lastLoadedCount.current || 0) + mapped.length;
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
      else { res.pClosed++; archivedPosIds.add(r.posId); }
    }
    if (archivedPosIds.size) {
      setPositions(prev => { const next = prev.filter(p => !archivedPosIds.has(p.id)); positionsRef.current = next; return next; });
      lastLoadedCount.current = Math.max(0, (lastLoadedCount.current || 0) - archivedPosIds.size);
    }

    setIbkrResult(res);
    setIbkrStatus("done");
  }, [session]);
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
      const rows = posArr.map(p => ({
        user_id: uid, symbol: p.sym || "", entry_date: p.entry || "", entry_time: p.entryTime || "", shares: p.shares || "",
        entry_price: p.ep || "", current_price: p.cp || "", stop_price: p.stop || "",
        stop_price_2: p.stop2 || "", trailing_stop: p.trailStop || "", setup: p.setup || "VCP", tags: p.tags || [],
        commission: p.comm != null && p.comm !== "" ? Number(p.comm) : null, notes: p.notes || "", chart_url: p.chartUrl || "", chart_image: p.chartImage || "",
        trade_type: p.tradeType || "Long",
        source: p.source || "manual", ib_conid: p.ibConid || null, ib_synced_at: p.ibSyncedAt || null, // preserve IBKR identity through bulk Save
        is_closed: false, // bulk Save only ever holds OPEN positions; archived (closed) rows live untouched in the DB
      }));

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
        // Build snapshot of loaded data for corruption detection before future saves
        const snap = new Map();
        clean.forEach(p => { if (p.symbol) snap.set(p.id, { sym: p.symbol, ep: p.entry_price || "", shares: p.shares || "" }); });
        loadedSnapshot.current = snap;
        setPositions(clean.map(p => ({ id: p.id, _lid: _lid++, sym: p.symbol, entry: p.entry_date, entryTime: p.entry_time || "", shares: p.shares, ep: p.entry_price, cp: p.current_price, stop: p.stop_price, stop2: p.stop_price_2, trailStop: p.trailing_stop || "", setup: p.setup, tags: p.tags || [], comm: p.commission != null ? String(p.commission) : "", notes: p.notes || "", chartUrl: p.chart_url || "", chartImage: p.chart_image || "", tradeType: p.trade_type || "Long", source: p.source || "manual", ibConid: p.ib_conid || null, ibSyncedAt: p.ib_synced_at || null })));
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
              setPositions(seeded.map(p => ({ id: p.id, _lid: _lid++, sym: p.symbol, entry: p.entry_date, entryTime: p.entry_time || "", shares: p.shares, ep: p.entry_price, cp: p.current_price, stop: p.stop_price, stop2: p.stop_price_2, trailStop: p.trailing_stop || "", setup: p.setup, tags: p.tags || [], comm: p.commission != null ? String(p.commission) : "", notes: p.notes || "", chartUrl: p.chart_url || "", chartImage: p.chart_image || "", tradeType: p.trade_type || "Long" })));
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
      const { data: trades, error: tradesErr } = await supabase.from("trades").select("*").eq("user_id", uid).eq("is_deleted", false).order("created_at", { ascending: false });
      if (tradesErr) { console.error("Trades load failed:", tradesErr.message); }
      if (trades && trades.length > 0) {
        setJournaledTrades(trades.map(t => ({ id: t.id, ticker: t.ticker, entry: t.entry_date, entryTime: t.entry_time || "", exit: t.exit_date, exitTime: t.exit_time || "", entryP: t.entry_price, exitP: t.exit_price, shares: t.shares, stop: t.stop_price, setup: t.setup, tags: t.tags || [], plPct: t.pl_pct, plDollar: t.pl_dollar, rMult: t.r_mult, reason: t.exit_reason, commission: t.commission != null ? t.commission : 0, notes: t.notes || "", chartUrl: t.chart_url || "", chartImage: t.chart_image || "", tradeType: t.trade_type || "Long", source: t.source || "manual", ibExecId: t.ib_exec_id || null, ibTradeId: t.ib_trade_id || null })));
        lastLoadedTradeCount.current = trades.length;
      }

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
                const next = refreshed.map(p => ({ id: p.id, _lid: _lid++, sym: p.symbol, entry: p.entry_date, entryTime: p.entry_time || "", shares: p.shares, ep: p.entry_price, cp: p.current_price, stop: p.stop_price, stop2: p.stop_price_2, trailStop: p.trailing_stop || "", setup: p.setup, tags: p.tags || [], comm: p.commission != null ? String(p.commission) : "", notes: p.notes || "", chartUrl: p.chart_url || "", chartImage: p.chart_image || "", tradeType: p.trade_type || "Long" }));
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
      const { data: existing } = await supabase.from("trades").select("id").eq("user_id", uid).eq("is_deleted", false);
      const existingIds = new Set((existing || []).map(t => t.id));
      const currentIds = new Set(journaledTrades.filter(t => existingIds.has(t.id)).map(t => t.id));
      const tradeRow = t => ({
        user_id: uid, ticker: t.ticker || "", entry_date: t.entry || "", entry_time: t.entryTime || "", exit_date: t.exit || "", exit_time: t.exitTime || "",
        entry_price: t.entryP || 0, exit_price: t.exitP || 0, shares: t.shares || 0,
        stop_price: t.stop || 0, setup: t.setup || "", tags: t.tags || [],
        pl_pct: t.plPct || 0, pl_dollar: t.plDollar || 0, r_mult: t.rMult || 0,
        exit_reason: t.reason || "", commission: t.commission != null ? Number(t.commission) : null, notes: t.notes || "",
        chart_url: t.chartUrl || "", chart_image: t.chartImage || "", trade_type: t.tradeType || "Long",
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

  const appZoom = fontSize === "huge" ? 1.30 : fontSize === "large" ? 1.15 : fontSize === "small" ? 0.88 : 1.0;

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
      {page === "dashboard" && <DashboardPage onJournalTrade={handleJournalTrade} setupTypes={setupTypes} tags={tags} exitReasons={exitReasons} positions={positions} setPositions={setPositions} portfolioSize={portfolioSize} setPortfolioSize={setPortfolioSize} fullSizePct={fullSizePct} setFullSizePct={setFullSizePct} numStocks={numStocks} setNumStocks={setNumStocks} lastLoadedCountRef={lastLoadedCount} lastSaveIdMapRef={lastSaveIdMap} session={session} targetRote={targetRote} setTargetRote={setTargetRote} journaledTrades={journaledTrades} setJournaledTrades={setJournaledTrades} onManualSave={handleManualSave} saveStatus={positionSaveStatus} positionsRef={positionsRef} saveErrorMsg={saveErrorMsg} onIbkrSync={runIbkrSync} />}
      {page === "tools" && <PremiumToolsPage demo={false} portfolioSize={portfolioSize} journaledTrades={journaledTrades} />}
      {page === "journal" && <TradeJournalPage journaledTrades={journaledTrades} setJournaledTrades={setJournaledTrades} setupTypes={setupTypes} tags={tags} exitReasons={exitReasons} session={session} onManualSave={handleManualTradeSave} saveStatus={tradeSaveStatus} positions={positions} setPositions={setPositions} positionsRef={positionsRef} portfolioSize={portfolioSize} />}
      {page === "settings" && <SettingsPage setupTypes={setupTypes} setSetupTypes={setSetupTypes} tags={tags} setTags={setTags} exitReasons={exitReasons} setExitReasons={setExitReasons} fontSize={fontSize} setFontSize={setFontSize} userEmail={userEmail} displayName={displayName} onDisplayNameChange={handleDisplayNameChange} session={session} onIbkrSync={runIbkrSync} />}
      <IbkrSyncModal open={ibkrOpen} onClose={() => setIbkrOpen(false)} status={ibkrStatus} data={ibkrData} error={ibkrError} result={ibkrResult} onRetry={runIbkrSync} onConfirm={confirmIbkrSync} />
    </>
  );

  // ─── MOBILE LAYOUT ───
  if (isMobile) {
    return (
      <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh", WebkitFontSmoothing: "antialiased", color: C.text, display: "flex", flexDirection: "column", zoom: appZoom }}>
        <div style={{ padding: "12px 16px", background: "rgba(8,8,14,0.95)", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, position: "sticky", top: 0, zIndex: 100 }}>
          <Wordmark size="0.88rem" style={{ lineHeight: 1 }} />
          <button onClick={handleLogout} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: "0.58rem", fontWeight: 600, cursor: "pointer", fontFamily: font }}>Sign Out</button>
        </div>
        <AppBackground />
        <div style={{ flex: 1, overflowY: "auto", padding: `${contentPadV}px ${contentPadH}px`, paddingBottom: 80, position: "relative", zIndex: 1 }}>{pageContent}</div>
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
      <div onMouseEnter={() => setSidebarOpen(true)} onMouseLeave={() => setSidebarOpen(false)} style={{ width: sidebarW, minHeight: "100vh", padding: sidebarOpen ? "24px 14px" : "24px 8px", background: "rgba(8,8,14,0.95)", borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0, alignSelf: "flex-start", transition: "width 0.2s ease, padding 0.2s ease", overflow: "hidden", position: "relative", zIndex: 50 }}>
        {sidebarOpen
          ? <Wordmark size="0.95rem" style={{ marginBottom: 24, padding: "0 4px", whiteSpace: "nowrap", overflow: "hidden" }} />
          : <div style={{ marginBottom: 24, textAlign: "center" }}><img src="/logo-mark.png" alt="VIV" style={{ width: 30, height: "auto", filter: "drop-shadow(0 0 8px rgba(201,152,42,0.45))" }} /></div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map(item => {
            const active = page === item.id;
            return (
              <button key={item.id} onClick={() => setPage(item.id)} style={{
                display: "flex", alignItems: "center", gap: 11, padding: sidebarOpen ? "11px 13px" : "11px 0", borderRadius: 12,
                border: active ? `1px solid ${C.borderGold}` : "1px solid transparent",
                cursor: "pointer", fontFamily: font, width: "100%", textAlign: "left",
                justifyContent: sidebarOpen ? "flex-start" : "center",
                background: active ? "linear-gradient(135deg, rgba(201,152,42,0.22), rgba(201,152,42,0.06))" : "transparent",
                boxShadow: active ? "inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 14px rgba(201,152,42,0.13)" : "none",
                backdropFilter: active ? "blur(8px)" : "none", WebkitBackdropFilter: active ? "blur(8px)" : "none",
                color: active ? C.goldBright : C.muted,
                fontWeight: active ? 700 : 500, fontSize: "0.82rem", letterSpacing: "0.01em", transition: "all 0.18s ease",
                whiteSpace: "nowrap", overflow: "hidden",
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = C.text; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.color = C.muted; }}
              ><span style={{ display: "flex", flexShrink: 0 }}><NavIcon name={item.id} size={17} /></span>{sidebarOpen && <span>{item.label}</span>}</button>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        {sidebarOpen ? (
          <div style={{ padding: "10px 12px", borderRadius: 10, background: C.glass, border: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 700, fontSize: "0.72rem", color: C.white, marginBottom: 2 }}>{displayName}</div>
            <div style={{ fontSize: "0.56rem", color: C.muted, marginBottom: 6, wordBreak: "break-all" }}>{userEmail}</div>
            <button onClick={handleLogout} style={{ width: "100%", padding: "5px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: "0.58rem", fontWeight: 600, cursor: "pointer", fontFamily: font }}>Sign Out</button>
          </div>
        ) : (
          <button onClick={handleLogout} title="Sign Out" style={{ padding: "8px 0", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: "0.70rem", cursor: "pointer", fontFamily: font, width: "100%", textAlign: "center" }}>↩</button>
        )}
      </div>
      <div style={{ flex: 1, padding: `${contentPadV}px ${contentPadH}px`, overflowY: "auto", minWidth: 0, position: "relative" }}>
        {/* Animated background */}
        <AppBackground />
        <div style={{ position:"relative",zIndex:1 }}>{pageContent}</div>
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
