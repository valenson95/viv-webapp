import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { supabase } from "./supabaseClient";

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
  bg: "#08080e", bg2: "#0c0c14", white: "#ffffff", text: "rgba(255,255,255,0.82)",
  muted: "rgba(255,255,255,0.40)", gold: "#c9982a", goldBright: "#f0c050",
  goldDim: "rgba(201,152,42,0.15)", borderGold: "rgba(201,152,42,0.22)",
  glass: "rgba(255,255,255,0.042)", border: "rgba(255,255,255,0.09)",
  green: "#22c55e", greenDim: "rgba(34,197,94,0.10)", red: "#ef4444", redDim: "rgba(239,68,68,0.08)",
  blue: "#3b82f6", blueDim: "rgba(59,130,246,0.10)",
  purple: "#a78bfa", purpleDim: "rgba(167,139,250,0.10)",
};
const font = "'Manrope', -apple-system, sans-serif";
const fmt$ = (v, dec = 0) => `$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;

// ─── Slider CSS ───
const sliderCSS = `
input[type=range].viv-slider{-webkit-appearance:none;appearance:none;height:4px;border-radius:2px;outline:none;cursor:pointer}
input[type=range].viv-slider::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:#f0c050;border:3px solid #08080e;box-shadow:0 0 10px rgba(201,152,42,0.45),0 0 0 1px rgba(201,152,42,0.3);cursor:pointer;margin-top:-8px}
input[type=range].viv-slider::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#f0c050;border:3px solid #08080e;box-shadow:0 0 10px rgba(201,152,42,0.45);cursor:pointer}
input[type=range].viv-slider::-webkit-slider-runnable-track{height:4px;border-radius:2px}
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
function GlassCard({ children, style, small }) {
  return (
    <div style={{ background: C.glass, backdropFilter: "blur(28px) saturate(160%)", WebkitBackdropFilter: "blur(28px) saturate(160%)", border: `1px solid ${C.border}`, borderRadius: small ? 13 : 22, position: "relative", overflow: "hidden", ...style }}>
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
function StatTile({ label, value, color, prefix, sub }) {
  return (
    <GlassCard small style={{ padding: "16px 18px" }}>
      <div style={{ fontWeight: 700, fontSize: "0.56rem", letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: "1.3rem", letterSpacing: "-0.04em", color: color || C.white }}>{prefix}{value}</div>
      {sub && <div style={{ fontWeight: 500, fontSize: "0.64rem", color: C.muted, marginTop: 4 }}>{sub}</div>}
    </GlassCard>
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
function TickerInput({ value, onChange, width = 64 }) {
  return (
    <input type="text" placeholder="SYM" value={value} onChange={e => onChange(e.target.value.toUpperCase())}
      style={{ width, boxSizing: "border-box", textAlign: "left", background: "rgba(255,255,255,0.03)", border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 5, padding: "5px 7px", textTransform: "uppercase", color: C.gold, fontSize: "0.73rem", fontWeight: 800, fontFamily: font, outline: "none", letterSpacing: "-0.01em" }}
      onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.06)"} />
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

// ─── Exposure Grid (Interactive Allocation Planner) ───
function ExposureGrid({ sizer, portfolioSize, numStocks, enrichedPositions }) {
  const sw = useScreenWidth();
  const isMobile = sw < 768;
  const [counts, setCounts] = useState({ Pilot: 0, Quarter: 0, Half: 0, Full: 0 });

  if (!sizer) return null;
  const ps = +portfolioSize || 0;
  if (ps <= 0) return null;

  const tiers = ["Pilot", "Quarter", "Half", "Full"];
  const tierAmts = { Pilot: sizer.pilot, Quarter: sizer.quarter, Half: sizer.half, Full: sizer.full };
  const tierCells = { Pilot: 0.5, Quarter: 1, Half: 2, Full: 4 };
  const tierMeta = {
    Pilot:   { color: C.purple, bg: C.purpleDim, border: "rgba(167,139,250,0.40)" },
    Quarter: { color: C.blue,   bg: C.blueDim,   border: "rgba(59,130,246,0.40)" },
    Half:    { color: C.gold,   bg: C.goldDim,    border: "rgba(201,152,42,0.40)" },
    Full:    { color: C.green,  bg: C.greenDim,   border: "rgba(34,197,94,0.40)" },
  };

  const maxPos = numStocks * 2; // generous cap
  const totalPicked = counts.Pilot + counts.Quarter + counts.Half + counts.Full;
  const deployed = tiers.reduce((s, t) => s + counts[t] * tierAmts[t], 0);
  const deployedPct = ps > 0 ? (deployed / ps) * 100 : 0;

  const adjust = (tier, delta) => {
    setCounts(prev => {
      const next = { ...prev, [tier]: Math.max(0, prev[tier] + delta) };
      const total = tiers.reduce((s, t) => s + next[t], 0);
      if (total > maxPos) return prev;
      return next;
    });
  };

  // ─── Actual positions from open positions table ───
  const activePositions = (enrichedPositions || []).filter(p => p.sym && p.epN > 0);
  const hasPositions = activePositions.length > 0;
  const actualCounts = { Pilot: 0, Quarter: 0, Half: 0, Full: 0 };
  activePositions.forEach(p => { if (actualCounts[p.tier] !== undefined) actualCounts[p.tier]++; });
  const actualDeployed = activePositions.reduce((s, p) => s + p.posValue, 0);
  const actualPct = ps > 0 ? (actualDeployed / ps) * 100 : 0;

  // ─── 2×2 Block renderer ───
  const cellSz = isMobile ? 28 : 38;
  const cellGap = 3;
  const blockSz = cellSz * 2 + cellGap;

  const renderBlock = (tier, key, ghost) => {
    const meta = tierMeta[tier];
    const filled = tierCells[tier];
    return (
      <div key={key} style={{
        display: "grid", gridTemplateColumns: `${cellSz}px ${cellSz}px`, gap: cellGap,
        opacity: ghost ? 0.35 : 1, transition: "all 0.25s ease",
      }}>
        {[0, 1, 2, 3].map(i => {
          const active = i < Math.floor(filled);
          const isPilot = tier === "Pilot" && i === 0;
          return (
            <div key={i} style={{
              width: cellSz, height: cellSz, borderRadius: Math.max(4, cellSz * 0.14),
              background: active ? meta.bg : "transparent",
              border: active ? `2px solid ${meta.border}` : `1.5px dashed rgba(255,255,255,0.06)`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {isPilot && <div style={{
                width: cellSz * 0.48, height: cellSz * 0.48, borderRadius: Math.max(2, cellSz * 0.10),
                background: meta.bg, border: `2px solid ${meta.border}`,
              }} />}
            </div>
          );
        })}
      </div>
    );
  };

  // ─── Stepper button ───
  const Stepper = ({ tier }) => {
    const meta = tierMeta[tier];
    const count = counts[tier];
    const amt = tierAmts[tier];
    const pctEach = ((amt / ps) * 100).toFixed(2);
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: isMobile ? 8 : 12,
        padding: "10px 14px", borderRadius: 12,
        background: count > 0 ? meta.bg : "rgba(255,255,255,0.015)",
        border: `1px solid ${count > 0 ? meta.border : C.border}`,
        transition: "all 0.2s",
      }}>
        {/* Mini block preview */}
        <div style={{ display: "grid", gridTemplateColumns: "11px 11px", gap: 1, flexShrink: 0 }}>
          {[0,1,2,3].map(i => {
            const on = i < Math.floor(tierCells[tier]);
            const isPlt = tier === "Pilot" && i === 0;
            return (
              <div key={i} style={{
                width: 11, height: 11, borderRadius: 2,
                background: on ? meta.bg : "transparent",
                border: on ? `1.5px solid ${meta.border}` : `1px dashed rgba(255,255,255,0.06)`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {isPlt && <div style={{ width: 5, height: 5, borderRadius: 1, background: meta.bg, border: `1.5px solid ${meta.border}` }} />}
              </div>
            );
          })}
        </div>
        {/* Tier info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: "0.84rem", color: meta.color }}>{tier}</div>
          <div style={{ fontWeight: 500, fontSize: "0.66rem", color: C.muted }}>{fmt$(amt)} · {pctEach}%</div>
        </div>
        {/* +/- buttons and count */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button onClick={() => adjust(tier, -1)} disabled={count === 0} style={{
            width: 28, height: 28, borderRadius: 8, border: `1px solid ${C.border}`,
            background: "rgba(255,255,255,0.04)", color: count === 0 ? "rgba(255,255,255,0.15)" : C.white,
            fontWeight: 800, fontSize: "1rem", cursor: count === 0 ? "default" : "pointer",
            fontFamily: font, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
          }}>{"\u2212"}</button>
          <div style={{ fontWeight: 900, fontSize: "1.1rem", color: count > 0 ? C.white : C.muted, minWidth: 22, textAlign: "center" }}>{count}</div>
          <button onClick={() => adjust(tier, 1)} style={{
            width: 28, height: 28, borderRadius: 8, border: `1px solid ${meta.border}`,
            background: meta.bg, color: meta.color,
            fontWeight: 800, fontSize: "1rem", cursor: "pointer",
            fontFamily: font, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
          }}>+</button>
        </div>
      </div>
    );
  };

  // ─── Build flat block list for visual ───
  const planBlocks = [];
  tiers.forEach(t => { for (let i = 0; i < counts[t]; i++) planBlocks.push(t); });
  // Sort: Full first (biggest visual), then Half, Quarter, Pilot
  planBlocks.sort((a, b) => tierCells[b] - tierCells[a]);

  const actualBlocks = [];
  tiers.forEach(t => { for (let i = 0; i < actualCounts[t]; i++) actualBlocks.push(t); });
  actualBlocks.sort((a, b) => tierCells[b] - tierCells[a]);

  // ─── Render a block grid ───
  const renderBlockGrid = (blocks, label, pct, amount, emptySlots) => (
    <div style={{
      flex: 1, padding: isMobile ? "16px" : "20px", borderRadius: 16,
      background: "rgba(255,255,255,0.015)", border: `1px solid ${C.border}`,
      display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0,
    }}>
      <div style={{ fontWeight: 700, fontSize: "0.62rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: "1.6rem", letterSpacing: "-0.04em", color: C.white }}>{pct.toFixed(1)}%</div>
      <div style={{ fontSize: "0.68rem", fontWeight: 500, color: C.muted, marginBottom: 14 }}>{fmt$(amount)} deployed</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center", minHeight: blockSz + 4 }}>
        {blocks.map((t, i) => renderBlock(t, `${label}-${i}`, false))}
        {emptySlots > 0 && Array(emptySlots).fill(0).map((_, i) => (
          <div key={`empty-${i}`} style={{
            width: blockSz, height: blockSz, borderRadius: 10,
            border: `1.5px dashed rgba(255,255,255,0.06)`, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: "0.52rem", color: "rgba(255,255,255,0.10)" }}>{"\u2014"}</span>
          </div>
        ))}
        {blocks.length === 0 && emptySlots === 0 && (
          <div style={{ padding: "20px 0", fontSize: "0.72rem", color: C.muted, textAlign: "center" }}>No positions</div>
        )}
      </div>
      {/* Tier count summary */}
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", justifyContent: "center" }}>
        {tiers.map(t => {
          const c = blocks.filter(b => b === t).length;
          if (c === 0) return null;
          const meta = tierMeta[t];
          return (
            <div key={t} style={{ padding: "3px 9px", borderRadius: 6, background: meta.bg, border: `1px solid ${meta.border}` }}>
              <span style={{ fontWeight: 700, fontSize: "0.64rem", color: meta.color }}>{c} {"\u00D7"} {t}</span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ marginTop: 24, borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
      {/* Header */}
      <div style={{ fontWeight: 700, fontSize: "0.68rem", letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold, marginBottom: 4 }}>Exposure Framework</div>
      <div style={{ fontWeight: 800, fontSize: "1.15rem", letterSpacing: "-0.03em", color: C.white, marginBottom: 4 }}>Plan Your Allocation</div>
      <div style={{ fontWeight: 300, fontSize: "0.80rem", color: C.muted, lineHeight: 1.5, marginBottom: 18 }}>
        Each block is a position. 4 filled cells = Full. 2 = Half. 1 = Quarter. {"\u00BD"} = Pilot. Pick how many of each.
      </div>

      {/* Tier steppers — always visible */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 20 }}>
        {tiers.map(t => <Stepper key={t} tier={t} />)}
      </div>

      {/* Deployed bar */}
      {totalPicked > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontWeight: 700, fontSize: "0.64rem", letterSpacing: "0.10em", textTransform: "uppercase", color: C.muted }}>Planned Deployment</span>
            <span style={{ fontWeight: 800, fontSize: "0.90rem", color: C.goldBright }}>
              {fmt$(deployed)} <span style={{ fontWeight: 500, fontSize: "0.76rem", color: C.muted }}>/ {fmt$(ps)} ({deployedPct.toFixed(1)}%)</span>
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: 3, width: `${Math.min(100, deployedPct)}%`, background: deployedPct > 60 ? `linear-gradient(90deg, ${C.gold}, ${C.green})` : `linear-gradient(90deg, ${C.purple}, ${C.blue})`, transition: "width 0.3s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: "0.62rem", color: C.muted }}>{totalPicked} of {maxPos} max positions</span>
            <span style={{ fontSize: "0.62rem", color: deployedPct > 100 ? C.red : C.muted }}>{deployedPct > 100 ? "Over-allocated!" : deployedPct > 50 ? "Aggressive" : "Conservative"}</span>
          </div>
        </div>
      )}

      {/* Visual comparison */}
      {totalPicked > 0 && hasPositions && (
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 12 }}>
          {renderBlockGrid(planBlocks, "Your Plan", deployedPct, deployed, Math.max(0, numStocks - totalPicked))}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: isMobile ? "6px 0" : "0 4px" }}>
            <span style={{ fontWeight: 900, fontSize: "1.2rem", color: C.gold, transform: isMobile ? "rotate(90deg)" : "none" }}>vs</span>
          </div>
          {renderBlockGrid(actualBlocks, "Current Positions", actualPct, actualDeployed, 0)}
        </div>
      )}
      {/* Plan only — no open positions */}
      {totalPicked > 0 && !hasPositions && (
        <div>{renderBlockGrid(planBlocks, "Planned Allocation", deployedPct, deployed, Math.max(0, numStocks - totalPicked))}</div>
      )}
      {/* Current positions only — no plan set */}
      {totalPicked === 0 && hasPositions && (
        <div>{renderBlockGrid(actualBlocks, "Current Positions", actualPct, actualDeployed, 0)}</div>
      )}

      {/* Risk Exposure Breakdown — under current positions */}
      {hasPositions && (() => {
        const withStops = activePositions.filter(p => p.stop1 > 0 || p.stop2 > 0);
        if (withStops.length === 0) return null;
        const totalVal = withStops.reduce((s,p) => s + p.posValue, 0);
        const freeVal = withStops.reduce((s,p) => s + p.posValue * (p.riskFreePct / 100), 0);
        const riskVal = totalVal - freeVal;
        const freePct = totalVal > 0 ? (freeVal / totalVal) * 100 : 0;
        const riskPct = 100 - freePct;
        return (
          <div style={{ marginTop: 14, padding: isMobile ? "14px" : "18px 22px", borderRadius: 14, background: "rgba(255,255,255,0.015)", border: `1px solid ${C.border}` }}>
            <div style={{ fontWeight: 700, fontSize: "0.62rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 10 }}>Position Exposure Breakdown</div>
            {/* Bar */}
            <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 22, marginBottom: 10 }}>
              {freePct > 0 && <div style={{ width: `${freePct}%`, background: `linear-gradient(90deg, ${C.green}, rgba(34,197,94,0.7))`, display: "flex", alignItems: "center", justifyContent: "center", transition: "width 0.3s" }}>
                <span style={{ fontWeight: 800, fontSize: "0.58rem", color: "#000" }}>{freePct.toFixed(0)}%</span>
              </div>}
              {riskPct > 0 && <div style={{ width: `${riskPct}%`, background: `linear-gradient(90deg, rgba(239,68,68,0.7), ${C.red})`, display: "flex", alignItems: "center", justifyContent: "center", transition: "width 0.3s" }}>
                <span style={{ fontWeight: 800, fontSize: "0.58rem", color: "#fff" }}>{riskPct.toFixed(0)}%</span>
              </div>}
            </div>
            {/* Labels */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: C.green }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.72rem", color: C.green }}>Risk-Free: {fmt$(freeVal)}</div>
                  <div style={{ fontSize: "0.60rem", color: C.muted }}>Stop above entry — profit locked in</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: C.red }} />
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.72rem", color: C.red }}>At Risk: {fmt$(riskVal)}</div>
                  <div style={{ fontSize: "0.60rem", color: C.muted }}>Stop below entry — capital exposed</div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Empty state — nothing picked, no positions */}
      {totalPicked === 0 && !hasPositions && (
        <div style={{
          padding: "28px 20px", borderRadius: 16, background: "rgba(255,255,255,0.015)",
          border: `1px solid ${C.border}`, textAlign: "center",
        }}>
          <div style={{ fontSize: "2rem", marginBottom: 8, opacity: 0.3 }}>{"\u{1F4CA}"}</div>
          <div style={{ fontWeight: 600, fontSize: "0.82rem", color: C.muted, marginBottom: 4 }}>Use the buttons above to plan your allocation</div>
          <div style={{ fontWeight: 400, fontSize: "0.68rem", color: "rgba(255,255,255,0.25)", lineHeight: 1.5 }}>
            Pick how many Pilot, Quarter, Half, and Full positions you want.<br />
            The visual below will show you exactly how your capital gets deployed.
          </div>
        </div>
      )}

      {/* Quick tips */}
      {totalPicked > 0 && (
        <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: C.goldDim, border: `1px solid ${C.borderGold}` }}>
          <div style={{ fontSize: "0.66rem", fontWeight: 600, color: C.goldBright, lineHeight: 1.7 }}>
            {deployedPct < 20 && "Cautious allocation. Good when the market is uncertain or you're building a new watchlist."}
            {deployedPct >= 20 && deployedPct < 50 && "Moderate exposure. A balanced approach — room to add if setups trigger, room to cut if they don't."}
            {deployedPct >= 50 && deployedPct < 80 && "Aggressive. You should be in a confirmed uptrend with multiple positions working before deploying this much."}
            {deployedPct >= 80 && "Full conviction. Only appropriate when your existing positions are profitable and stops are above entry. If not — scale back."}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Gold CTA Button ───
function GoldBtn({ children, onClick, small }) {
  return (
    <button onClick={onClick} style={{ background: `linear-gradient(135deg, #a06800, ${C.goldBright}, #a06800)`, color: "#000", fontWeight: 800, fontSize: small ? "0.72rem" : "0.82rem", padding: small ? "8px 16px" : "12px 28px", borderRadius: 980, border: "none", cursor: "pointer", fontFamily: font }}>{children}</button>
  );
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
        {!r?(<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",minHeight:200,color:C.muted,fontSize:"0.82rem",textAlign:"center",lineHeight:1.6}}>Fill in all fields to<br/>see your results.</div>):(<>
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
function PremiumToolsPage({ demo }) {
  const[tab,setTab]=useState(0);const tabs=["Risk","Expectancy","Risk Finance","Expected Move"];
  return (<div>
    <Eyebrow>Premium Tools</Eyebrow>
    <h1 style={{fontWeight:800,fontSize:"clamp(1.5rem, 4vw, 2rem)",letterSpacing:"-0.04em",color:C.white,margin:"0 0 4px"}}>Risk Management</h1>
    <p style={{fontWeight:300,fontSize:"0.84rem",color:C.muted,margin:"0 0 24px",lineHeight:1.6}}>Define your risk before you enter. Calculate your edge. Protect your capital.</p>
    <GlassCard><div style={{display:"flex",borderBottom:`1px solid ${C.border}`}}>
      {tabs.map((t,i)=>(<button key={t} onClick={()=>setTab(i)} style={{flex:1,padding:"14px 0",textAlign:"center",fontWeight:tab===i?700:500,fontSize:"0.80rem",color:tab===i?C.white:C.muted,cursor:"pointer",background:"transparent",border:"none",fontFamily:font,borderBottom:tab===i?`2px solid ${C.gold}`:"2px solid transparent"}}>{t}</button>))}
    </div>
      {tab===0&&<RiskTab demo={demo}/>}{tab===1&&<ExpectancyTab demo={demo}/>}{tab===2&&<RiskFinanceTab demo={demo}/>}{tab===3&&<ExpectedMoveTab demo={demo}/>}
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
const CSV_HEADERS = ["Symbol","Entry Date","Exit Date","Entry Price","Exit Price","Shares","Stop","Setup","Tags","P/L %","P/L $","R-Multiple","Exit Reason","Notes"];
const HEADER_ALIASES = {
  "symbol":"ticker","ticker":"ticker","sym":"ticker","stock":"ticker",
  "entry date":"entry","entry":"entry","open date":"entry","date opened":"entry","entrydate":"entry",
  "exit date":"exit","exit":"exit","close date":"exit","date closed":"exit","exitdate":"exit",
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
  "notes":"notes","note":"notes","comment":"notes","comments":"notes",
};

function exportTradesCSV(trades) {
  const rows = [CSV_HEADERS.join(",")];
  trades.forEach(t => {
    rows.push([
      t.ticker, t.entry, t.exit || "", t.entryP, t.exitP, t.shares, t.stop || "",
      `"${t.setup || ""}"`, `"${(t.tags || []).join("; ")}"`,
      t.plPct?.toFixed(2) || "", t.plDollar?.toFixed(2) || "", t.rMult?.toFixed(2) || "",
      `"${t.reason || ""}"`, `"${(t.notes || "").replace(/"/g, '""')}"`
    ].join(","));
  });
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `VIV_Trades_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
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
    const shares = parseInt(row.shares) || 0;
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
      entry: entryDate,
      exit: exitDate,
      entryP: effectiveEntryP, exitP, shares, stop,
      setup: row.setup || "VCP",
      tags: row.tags ? row.tags.split(/[;,]/).map(t => t.trim()).filter(Boolean) : [],
      plPct: effectivePlPct, plDollar, rMult,
      reason: row.reason || "",
      notes: row.notes || "",
      _imported: true,
    });
  }
  return results;
}

function TradeJournalPage({ journaledTrades, setJournaledTrades, setupTypes, tags: allTags, exitReasons }) {
  const [filterSetup, setFilterSetup] = useState("All");
  const [filterTag, setFilterTag] = useState("All");
  const [editingId, setEditingId] = useState(null);
  const [editRow, setEditRow] = useState({});
  const [showImportGuide, setShowImportGuide] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [deletedTradeIds, setDeletedTradeIds] = useState([]);

  const allTrades = useMemo(() => journaledTrades.filter(t => !deletedTradeIds.includes(t.id)), [journaledTrades, deletedTradeIds]);

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCSV(ev.target.result);
      if (parsed.length > 0) {
        setJournaledTrades(prev => [...prev, ...parsed]);
        setImportResult({ success: true, count: parsed.length });
      } else {
        setImportResult({ success: false, count: 0 });
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
    if (trades.length === 0) return { ba:0,avgGain:0,avgLoss:0,glRatio:0,ev:0,avgR:0,largestLoss:0,totalPL:0,total:0 };
    const wins = trades.filter(t => t.plPct > 0), losses = trades.filter(t => t.plPct <= 0);
    const ba = (wins.length / trades.length) * 100;
    const avgGain = wins.length ? wins.reduce((s, t) => s + t.plPct, 0) / wins.length : 0;
    const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.plPct, 0) / losses.length) : 0;
    const glRatio = avgLoss > 0 ? avgGain / avgLoss : 0;
    const ev = (ba / 100) * avgGain - ((100 - ba) / 100) * avgLoss;
    const avgR = trades.reduce((s, t) => s + t.rMult, 0) / trades.length;
    return { ba, avgGain, avgLoss, glRatio, ev, avgR, largestLoss: Math.min(...trades.map(t => t.plPct)), totalPL: trades.reduce((s, t) => s + t.plDollar, 0), total: trades.length };
  }, [filtered]);

  const distData = useMemo(() => {
    const buckets = []; for (let i = -16; i <= 20; i += 2) buckets.push({ range: `${i}%`, gains: 0, losses: 0 });
    filtered.forEach(t => { const idx = Math.max(0, Math.min(buckets.length - 1, Math.floor((t.plPct + 16) / 2))); if (buckets[idx]) t.plPct >= 0 ? buckets[idx].gains++ : buckets[idx].losses++; });
    return buckets;
  }, [filtered]);
  const equityData = useMemo(() => { let cum = 0; return filtered.map(t => { cum += t.plDollar; return { trade: t.ticker, equity: cum }; }); }, [filtered]);

  const startEdit = (t) => { setEditingId(t.id); setEditRow({ ...t }); };
  const cancelEdit = () => setEditingId(null);
  const deleteTrade = (id) => {
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
          <GoldBtn onClick={() => exportTradesCSV(filtered)} small>Export CSV</GoldBtn>
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
          {importResult.success ? `Successfully imported ${importResult.count} trade${importResult.count > 1 ? "s" : ""}. They now appear in your closed trades below.` : "Import failed — could not parse any trades. Check that your CSV has a header row with recognizable column names."}
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
                    ["Exit Date", "Exit Date, Exit, Close Date", "No"],
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

      {/* Stats — recalculate based on filter */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
        <StatTile label="Total P/L" value={`$${stats.totalPL.toLocaleString()}`} color={stats.totalPL >= 0 ? C.green : C.red} prefix={stats.totalPL >= 0 ? "+" : ""} />
        <StatTile label="Batting Avg" value={`${stats.ba.toFixed(0)}%`} color={stats.ba >= 50 ? C.green : C.red} />
        <StatTile label="Avg Gain" value={`${stats.avgGain.toFixed(1)}%`} color={C.green} prefix="+" />
        <StatTile label="Avg Loss" value={`${stats.avgLoss.toFixed(1)}%`} color={C.red} prefix="-" />
        <StatTile label="G/L Ratio" value={stats.glRatio.toFixed(2)} color={stats.glRatio >= 2 ? C.green : stats.glRatio >= 1 ? C.gold : C.red} />
        <StatTile label="Expectancy" value={`${stats.ev >= 0 ? "+" : ""}${stats.ev.toFixed(2)}%`} color={stats.ev >= 0 ? C.green : C.red} />
        <StatTile label="Avg R-Mult" value={`${stats.avgR.toFixed(2)}R`} color={stats.avgR >= 0 ? C.green : C.red} />
        <StatTile label="Largest Loss" value={`${stats.largestLoss.toFixed(1)}%`} color={stats.largestLoss < -10 ? C.red : C.gold} />
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginBottom: 20 }}>
        <GlassCard style={{ padding: "18px 22px" }}>
          <div style={{ fontWeight: 700, fontSize: "0.76rem", color: C.white, marginBottom: 14 }}>Equity Curve</div>
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={equityData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" /><XAxis dataKey="trade" tick={{fill:C.muted,fontSize:10}} axisLine={{stroke:C.border}} /><YAxis tick={{fill:C.muted,fontSize:10}} axisLine={{stroke:C.border}} tickFormatter={v=>`$${(v/1000).toFixed(0)}k`} /><Tooltip contentStyle={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:10,fontSize:12,fontFamily:font}} /><ReferenceLine y={0} stroke={C.border} /><Line type="monotone" dataKey="equity" stroke={C.gold} strokeWidth={2} dot={{fill:C.gold,r:3.5}} /></LineChart>
          </ResponsiveContainer>
        </GlassCard>
        <GlassCard style={{ padding: "18px 22px" }}>
          <div style={{ fontWeight: 700, fontSize: "0.76rem", color: C.white, marginBottom: 14 }}>Return Distribution</div>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={distData}><CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" /><XAxis dataKey="range" tick={{fill:C.muted,fontSize:9}} axisLine={{stroke:C.border}} interval={1} /><YAxis tick={{fill:C.muted,fontSize:10}} axisLine={{stroke:C.border}} /><Tooltip contentStyle={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:10,fontSize:12,fontFamily:font}} /><Bar dataKey="losses" fill={C.red} radius={[0,0,2,2]} /><Bar dataKey="gains" fill={C.green} radius={[2,2,0,0]} /></BarChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>

      {/* Closed Trades Table — editable */}
      <GlassCard>
        <div style={{ padding: "18px 22px 6px" }}><div style={{ fontWeight: 700, fontSize: "0.76rem", color: C.white }}>Closed Trades</div></div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Symbol","Entry","Exit","Entry $","Exit $","Shares","Setup","Tags","P/L %","P/L $","R-Mult","Reason","Notes",""].map(h => (
                  <th key={h} style={{ padding: "9px 8px", textAlign: "left", fontWeight: 700, fontSize: "0.52rem", letterSpacing: "0.10em", textTransform: "uppercase", color: C.muted, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const isEditing = editingId === t.id;
                if (isEditing) {
                  return (
                    <tr key={t.id} style={{ background: "rgba(201,152,42,0.04)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "6px 6px" }}><TickerInput value={editRow.ticker} onChange={v => setEditRow(r => ({...r, ticker: v}))} /></td>
                      <td style={{ padding: "6px 6px" }}><input type="text" value={editRow.entry} onChange={e => setEditRow(r => ({...r, entry: e.target.value}))} style={{width:70,background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:5,padding:"5px 7px",color:C.white,fontSize:"0.72rem",fontFamily:font,outline:"none"}} /></td>
                      <td style={{ padding: "6px 6px" }}><input type="text" value={editRow.exit} onChange={e => setEditRow(r => ({...r, exit: e.target.value}))} style={{width:70,background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:5,padding:"5px 7px",color:C.white,fontSize:"0.72rem",fontFamily:font,outline:"none"}} /></td>
                      <td style={{ padding: "6px 6px" }}><CellInput value={editRow.entryP} onChange={v => setEditRow(r => ({...r, entryP: +v}))} width={72} /></td>
                      <td style={{ padding: "6px 6px" }}><CellInput value={editRow.exitP} onChange={v => setEditRow(r => ({...r, exitP: +v}))} width={72} /></td>
                      <td style={{ padding: "6px 6px" }}><CellInput value={editRow.shares} onChange={v => setEditRow(r => ({...r, shares: +v}))} width={60} /></td>
                      <td style={{ padding: "6px 6px" }}><MiniSelect value={editRow.setup} onChange={v => setEditRow(r => ({...r, setup: v}))} options={setupTypes} width={90} /></td>
                      <td style={{ padding: "6px 6px" }}><TagSelector selected={editRow.tags || []} allTags={allTags} onChange={v => setEditRow(r => ({...r, tags: v}))} small /></td>
                      <td colSpan={3} />
                      <td style={{ padding: "6px 6px" }}><MiniSelect value={editRow.reason} onChange={v => setEditRow(r => ({...r, reason: v}))} options={exitReasons} width={110} /></td>
                      <td style={{ padding: "6px 6px" }}><input type="text" value={editRow.notes||""} onChange={e => setEditRow(r => ({...r, notes: e.target.value}))} placeholder="Notes..." style={{width:80,background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:5,padding:"5px 7px",color:C.white,fontSize:"0.68rem",fontFamily:font,outline:"none"}} /></td>
                      <td style={{ padding: "6px 6px", whiteSpace: "nowrap" }}>
                        <button onClick={cancelEdit} style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontSize:"0.58rem",cursor:"pointer",fontFamily:font,marginRight:4}}>Done</button>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={t.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", cursor: "pointer" }} onDoubleClick={() => startEdit(t)}>
                    <td style={{ padding: "11px 8px", fontWeight: 700, color: C.gold }}>{t.ticker}</td>
                    <td style={{ padding: "11px 8px", color: C.text }}>{t.entry}</td>
                    <td style={{ padding: "11px 8px", color: C.text }}>{t.exit||"—"}</td>
                    <td style={{ padding: "11px 8px", color: C.text }}>${t.entryP.toFixed(2)}</td>
                    <td style={{ padding: "11px 8px", color: C.text }}>${t.exitP.toFixed(2)}</td>
                    <td style={{ padding: "11px 8px", color: C.text }}>{t.shares.toLocaleString()}</td>
                    <td style={{ padding: "11px 8px" }}><TagChip label={t.setup} color={C.gold} small /></td>
                    <td style={{ padding: "11px 8px" }}><div style={{display:"flex",gap:3,flexWrap:"wrap"}}>{(t.tags||[]).map(tag => <TagChip key={tag} label={tag} color={C.blue} small />)}</div></td>
                    <td style={{ padding: "11px 8px", fontWeight: 700, color: t.plPct >= 0 ? C.green : C.red }}>{t.plPct >= 0 ? "+" : ""}{t.plPct.toFixed(2)}%</td>
                    <td style={{ padding: "11px 8px", fontWeight: 700, color: t.plDollar >= 0 ? C.green : C.red }}>{t.plDollar >= 0 ? "+" : ""}${t.plDollar.toLocaleString()}</td>
                    <td style={{ padding: "11px 8px", fontWeight: 700, color: t.rMult >= 0 ? C.green : C.red }}>{t.rMult.toFixed(2)}R</td>
                    <td style={{ padding: "11px 8px", color: C.muted, fontSize: "0.66rem", whiteSpace: "nowrap" }}>{t.reason}</td>
                    <td style={{ padding: "11px 8px", color: C.muted, fontSize: "0.64rem", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.notes}</td>
                    <td style={{ padding: "11px 8px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => startEdit(t)} style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontSize:"0.54rem",cursor:"pointer",fontFamily:font}}>Edit</button>
                        <button onClick={() => deleteTrade(t.id)} title="Delete trade" style={{padding:"3px 6px",borderRadius:6,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontWeight:700,fontSize:"0.58rem",cursor:"pointer",fontFamily:font}}>×</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 22px 14px", fontSize: "0.62rem", color: C.muted }}>Double-click any row to edit. Changes auto-save.</div>
      </GlassCard>
    </div>
  );
}

// ═══════════════════════════════════════
// ─── DASHBOARD PAGE ───
// ═══════════════════════════════════════
const FULL_SIZE_OPTIONS = [10,15,20,25,30,35,40,45,50,55,60];
let _posId = 100;
const mkPos = (sym, entry, shares, ep, cp, stop, stop2, setup, tags = [], trailStop = "") => ({ id: _posId++, sym, entry, shares: String(shares), ep: String(ep), cp: String(cp), stop: String(stop), stop2: String(stop2 || ""), trailStop: String(trailStop || ""), setup, tags });
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

function DashboardPage({ onJournalTrade, setupTypes, tags: allTags, exitReasons, positions, setPositions, portfolioSize, setPortfolioSize, fullSizePct, setFullSizePct, numStocks, setNumStocks }) {
  const sizer = useMemo(() => {
    const ps = +portfolioSize;
    if (!ps || ps <= 0) return null;
    const fullSizeAmt = ps * (fullSizePct / 100);
    const perStock = fullSizeAmt / numStocks;
    return { fullSizeAmt, full: perStock, half: perStock / 2, quarter: perStock / 4, pilot: perStock / 8 };
  }, [portfolioSize, fullSizePct, numStocks]);
  const [sellId, setSellId] = useState(null);
  const [sellQty, setSellQty] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [sellReason, setSellReason] = useState("Sold Into Strength");
  const [sellTags, setSellTags] = useState([]);
  const [sellAddJournal, setSellAddJournal] = useState(true);
  const [sellNotes, setSellNotes] = useState("");
  const [displayMode, setDisplayMode] = useState("%"); // "%", "$", or "R"
  const [priceLoading, setPriceLoading] = useState(false);
  const [lastPriceRefresh, setLastPriceRefresh] = useState(null);

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
        setPositions(prev => prev.map(p => {
          const sym = (p.sym || "").toUpperCase();
          if (sym && prices[sym] !== undefined) {
            return { ...p, cp: String(prices[sym]) };
          }
          return p;
        }));
        setLastPriceRefresh(new Date());
      }
    } catch (err) {
      console.error("Price fetch failed:", err.message);
    }
    setPriceLoading(false);
  }, [positions, setPositions]);

  const updateField = useCallback((id, field, val) => { setPositions(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p)); }, []);
  const addPosition = useCallback(() => {
    setPositions(prev => {
      const maxId = prev.reduce((m, p) => Math.max(m, p.id || 0), 0);
      return [...prev, { id: maxId + 1, sym: "", entry: new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }), shares: "", ep: "", cp: "", stop: "", stop2: "", trailStop: "", setup: setupTypes[0] || "VCP", tags: [] }];
    });
  }, [setupTypes]);
  const removeRow = useCallback((id) => {
    setPositions(prev => {
      const next = prev.filter(p => p.id !== id);
      lastLoadedCount.current = next.length; // update so autosave safety check doesn't block intentional removal
      return next;
    });
  }, []);

  // Sell flow
  const startSell = (p) => { setSellId(p.id); setSellQty(p.shares); setSellPrice(p.cp); setSellReason(exitReasons[0] || "Sold Into Strength"); setSellTags([]); setSellAddJournal(true); setSellNotes(""); };
  const cancelSell = () => setSellId(null);
  const confirmSell = () => {
    const pos = positions.find(p => p.id === sellId);
    if (!pos) return;
    const epN = parseFloat(pos.ep) || 0, stopN = parseFloat(pos.stop) || 0;
    const soldShares = parseInt(sellQty) || 0;
    const exitP = parseFloat(sellPrice) || 0;
    const totalShares = parseInt(pos.shares) || 0;
    const remaining = totalShares - soldShares;

    if (sellAddJournal && soldShares > 0 && exitP > 0) {
      const plPct = epN > 0 ? ((exitP - epN) / epN) * 100 : 0;
      const plDollar = (exitP - epN) * soldShares;
      const initRisk = epN > 0 ? (epN - stopN) / epN : 0;
      const rMult = initRisk > 0 ? (plPct / 100) / initRisk : 0;
      onJournalTrade({
        id: Date.now(), ticker: pos.sym, entry: pos.entry,
        exit: new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }),
        entryP: epN, exitP, shares: soldShares, stop: stopN, setup: pos.setup,
        tags: [...(pos.tags || []), ...sellTags], plPct, plDollar, rMult,
        reason: sellReason, notes: sellNotes, _fromDashboard: true,
      });
    }

    if (remaining > 0) {
      setPositions(prev => prev.map(p => p.id === sellId ? { ...p, shares: String(remaining) } : p));
    } else {
      removeRow(sellId);
    }
    setSellId(null);
  };

  // Enriched — dual stop loss: if stop2 is set, 50/50 split. Otherwise stop1 covers 100%.
  const enriched = useMemo(() => positions.map(p => {
    const epN = parseFloat(p.ep)||0, cpN = parseFloat(p.cp)||0, sharesN = parseInt(p.shares)||0;
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

    // P/L
    const plPct = epN > 0 ? ((cpN - epN) / epN) * 100 : 0;
    const plD = (cpN - epN) * sharesN;

    // R-Multiple uses weighted initial risk
    const initRiskD = epN > 0 ? (epN - stop1) * h1 + (isDual ? (epN - stop2) * h2 : 0) : 0;
    const initRiskPct = epN > 0 && sharesN > 0 ? initRiskD / (epN * sharesN) : 0;
    const rMult = initRiskPct > 0 ? (plPct / 100) / initRiskPct : 0;

    // ROTE
    const ps = +portfolioSize || 0;
    const roteD = initRiskD > 0 ? initRiskD : 0;
    const rotePct = ps > 0 ? (roteD / ps) * 100 : 0;

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
      : riskFreePct === 100 ? "Free"
      : riskFreePct === 50 ? "Profit"
      : plPct > 5 ? "Profit"
      : plPct >= -2 ? "Even"
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

    return { ...p, epN, cpN, stop1, stop2, tsN, hasTS, sharesN, h1, h2, posValue, tier, isDual, activeStop, dtsD, dtsPct, dtsTotalD, rtsD, sbe, sbePct, plPct, plD, rMult, riskStatus, roteD, rotePct, riskFreePct, riskExposurePct, rPerShare, currentRLevel, rAchieved, rSuggestedStop, rLockedProfit, rNextTarget, dtsR, rtsR };
  }), [positions, sizer, portfolioSize]);

  const totals = useMemo(() => {
    const active = enriched.filter(p => p.sym && p.cpN > 0);
    const totalValue = active.reduce((s,p) => s + p.cpN * p.sharesN, 0);
    // Total DTS in dollars (current-to-stop across all positions)
    const totalDtsD = active.reduce((s,p) => s + p.dtsTotalD, 0);
    const avgDtsPct = totalValue > 0 ? (totalDtsD / totalValue) * 100 : 0;
    const totalRoteD = enriched.reduce((s,p) => s + p.roteD, 0);
    const ps = +portfolioSize || 0;
    const totalRotePct = ps > 0 ? (totalRoteD / ps) * 100 : 0;
    return {
      totalPL: enriched.reduce((s,p) => s + p.plD, 0),
      totalRTS: enriched.reduce((s,p) => s + p.rtsD, 0),
      totalDtsD,
      avgDtsPct,
      totalValue,
      count: enriched.filter(p => p.sym).length,
      totalRoteD,
      totalRotePct,
    };
  }, [enriched]);

  const th = (text, align = "right") => <th style={{ padding:"10px 6px",textAlign:align,fontWeight:700,fontSize:"0.50rem",letterSpacing:"0.10em",textTransform:"uppercase",color:C.muted,whiteSpace:"nowrap" }}>{text}</th>;

  return (
    <div>
      <Eyebrow>Dashboard</Eyebrow>
      <h1 style={{ fontWeight:800,fontSize:"clamp(1.5rem, 4vw, 2rem)",letterSpacing:"-0.04em",color:C.white,margin:"0 0 24px" }}>Trading Dashboard</h1>

      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))",gap:12,marginBottom:24 }}>
        <StatTile label="Portfolio" value={fmt$(+portfolioSize)} />
        <StatTile label="Deployed" value={fmt$(totals.totalValue)} sub={`${totals.count} positions`} />
        <StatTile label="Open P/L" value={`${Math.abs(totals.totalPL).toLocaleString(undefined,{maximumFractionDigits:0})}`} color={totals.totalPL>=0?C.green:C.red} prefix={totals.totalPL>=0?"+$":"-$"} />
        <StatTile label="Total RTS" value={totals.totalRTS<=0?"FREE":fmt$(Math.abs(totals.totalRTS))} color={totals.totalRTS<=0?C.green:C.red} sub="Goal: $0 (FREE)" />
      </div>

      {/* Position Sizer */}
      <GlassCard style={{ padding: "28px", marginBottom: 20 }}>
        <Eyebrow>Position Sizer</Eyebrow>
        <div style={{ fontWeight:800,fontSize:"1.05rem",letterSpacing:"-0.03em",color:C.white,marginBottom:20 }}>Portfolio Allocation Framework</div>
        <CalcInput label="Account Size" value={portfolioSize} onChange={setPortfolioSize} style={{ maxWidth:300,marginBottom:24 }} />
        <SliderRow label="Full Allocation" min={10} max={60} step={5} value={fullSizePct} onChange={setFullSizePct} suffix="%" calcText={sizer?fmt$(sizer.fullSizeAmt):""} />
        <SliderRow label="Max Positions" min={1} max={12} step={1} value={numStocks} onChange={setNumStocks} calcText={sizer?`${fmt$(sizer.full)} / stock`:""} />
        <TierStrip sizer={sizer} />
        <ExposureGrid sizer={sizer} portfolioSize={portfolioSize} numStocks={numStocks} enrichedPositions={enriched} />
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
            <GoldBtn onClick={addPosition} small>+ Add Position</GoldBtn>
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
        <div style={{ overflowX:"auto",padding:"0 0 4px" }}>
          <table style={{ width:"100%",borderCollapse:"collapse",fontSize:"0.71rem" }}>
            <thead><tr style={{ borderBottom:`1px solid ${C.border}` }}>
              {th("Status","left")}{th("Tier","left")}{th("Symbol","left")}{th("Shares")}{th("Avg. Cost")}{th("Value")}{th("Orig Stop")}{th("Stop 2")}{th("Trail Stop")}{th("Current")}{th("Setup","left")}{th("Tags","left")}{th("DTS")}{th("RTS")}{th("ROTE")}{displayMode==="R"&&th("R Suggest")}{displayMode==="R"&&th("Locked")}{displayMode!=="R"&&th("SBE")}{displayMode!=="R"&&th("SBE %")}{th("P/L")}{th("R")}{th("","center")}
            </tr></thead>
            <tbody>
              {enriched.map((p, idx) => {
                const ts = TIER_STYLES[p.tier] || TIER_STYLES.Pilot;
                const isSelling = sellId === p.id;
                const RISK_BADGE = { Free:{bg:C.greenDim,color:C.green,border:"rgba(34,197,94,0.25)"}, Profit:{bg:C.blueDim,color:C.blue,border:"rgba(59,130,246,0.25)"}, Even:{bg:C.goldDim,color:C.gold,border:C.borderGold}, "At Risk":{bg:C.redDim,color:C.red,border:"rgba(239,68,68,0.25)"}, "—":{bg:"transparent",color:C.muted,border:C.border} };
                const rb = RISK_BADGE[p.riskStatus] || RISK_BADGE["—"];
                const isDollar = displayMode === "$";
                const isR = displayMode === "R";
                const dtsDisplay = !p.cpN ? "—" : isR ? `${p.dtsR.toFixed(1)}R` : isDollar ? `$${Math.abs(p.dtsD).toFixed(2)}` : `${Math.abs(p.dtsPct).toFixed(2)}%`;
                const rtsDisplay = !p.cpN ? "—" : isR ? `${p.rtsR.toFixed(1)}R` : isDollar ? `$${Math.abs(p.rtsD).toLocaleString(undefined,{maximumFractionDigits:0})}` : `${(p.sharesN>0?(p.rtsD/(p.cpN*p.sharesN)*100):0).toFixed(2)}%`;
                const plDisplay = !p.epN ? "—" : isR ? `${p.rMult>=0?"+":""}${p.rMult.toFixed(2)}R` : isDollar ? `${p.plD>=0?"+":"-"}${fmt$(Math.abs(p.plD))}` : `${p.plPct>=0?"+":""}${p.plPct.toFixed(2)}%`;
                return (
                  <tr key={p.id} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)",background:isSelling?"rgba(239,68,68,0.04)":idx%2?"rgba(255,255,255,0.01)":"transparent" }}>
                    {/* Risk Status */}
                    <td style={{padding:"8px 4px"}}><span style={{padding:"3px 8px",borderRadius:980,fontSize:"0.50rem",fontWeight:700,background:rb.bg,color:rb.color,border:`1px solid ${rb.border}`,whiteSpace:"nowrap"}}>{p.riskStatus}</span></td>
                    <td style={{padding:"8px 6px"}}><span style={{padding:"3px 8px",borderRadius:980,fontSize:"0.54rem",fontWeight:700,background:ts.bg,color:ts.color,border:`1px solid ${ts.border}`}}>{p.tier}</span></td>
                    <td style={{padding:"6px 4px"}}><TickerInput value={p.sym} onChange={v=>updateField(p.id,"sym",v)} /></td>
                    <td style={{padding:"6px 4px",textAlign:"right"}}><CellInput value={p.shares} onChange={v=>updateField(p.id,"shares",v)} width={62} /></td>
                    <td style={{padding:"6px 4px",textAlign:"right"}}><CellInput value={p.ep} onChange={v=>updateField(p.id,"ep",v)} /></td>
                    <td style={{padding:"8px 6px",textAlign:"right",fontWeight:700,fontSize:"0.70rem",color:C.white,whiteSpace:"nowrap"}}>{p.posValue>0?fmt$(p.posValue):"—"}</td>
                    <td style={{padding:"6px 4px",textAlign:"right"}}><CellInput value={p.stop} onChange={v=>updateField(p.id,"stop",v)} width={72} /></td>
                    <td style={{padding:"6px 4px",textAlign:"right"}}><CellInput value={p.stop2||""} onChange={v=>updateField(p.id,"stop2",v)} width={72} /></td>
                    <td style={{padding:"6px 4px",textAlign:"right"}}><CellInput value={p.trailStop||""} onChange={v=>updateField(p.id,"trailStop",v)} width={78} gold /></td>
                    <td style={{padding:"6px 4px",textAlign:"right"}}><CellInput value={p.cp} onChange={v=>updateField(p.id,"cp",v)} gold width={82} /></td>
                    <td style={{padding:"6px 4px"}}><MiniSelect value={p.setup} onChange={v=>updateField(p.id,"setup",v)} options={setupTypes} width={85} /></td>
                    <td style={{padding:"6px 4px"}}><TagSelector selected={p.tags||[]} allTags={allTags} onChange={v=>updateField(p.id,"tags",v)} small /></td>
                    {/* DTS — respects $ / % toggle */}
                    <td style={{padding:"8px 6px",textAlign:"right",fontWeight:600,color:p.dtsD<=0?C.green:C.text,fontSize:"0.70rem"}}>{dtsDisplay}</td>
                    {/* RTS — respects $ / % toggle. >0 = risk, <=0 = free */}
                    <td style={{padding:"8px 6px",textAlign:"right",fontWeight:700,color:p.rtsD<=0?C.green:C.red,fontSize:"0.70rem"}}>{rtsDisplay}</td>
                    {/* ROTE — Risk of Total Equity. Warning if >1.5% */}
                    <td style={{padding:"8px 6px",textAlign:"right",fontWeight:700,fontSize:"0.70rem",color:p.rotePct>1.5?C.red:p.rotePct>1.0?C.gold:C.green,whiteSpace:"nowrap"}}>{p.epN&&(p.stop1||p.stop2)?<>{p.rotePct.toFixed(2)}%{p.rotePct>1.5&&<span title="ROTE exceeds 1.5% — consider reducing size" style={{marginLeft:3,fontSize:"0.64rem"}}>⚠</span>}</>:"—"}</td>
                    {isR ? (
                      <>
                        <td style={{padding:"8px 6px",textAlign:"right",fontWeight:700,fontSize:"0.70rem",color:p.rSuggestedStop>p.epN?C.green:p.rSuggestedStop===p.epN?C.goldBright:C.muted}}>{p.rPerShare>0?(p.rSuggestedStop>=p.epN&&p.currentRLevel>=1?`$${p.rSuggestedStop.toFixed(2)} (${p.currentRLevel-1===0?"BE":(p.currentRLevel-1)+"R"})`:`$${p.rSuggestedStop.toFixed(2)}`):"—"}</td>
                        <td style={{padding:"8px 6px",textAlign:"right",fontWeight:700,fontSize:"0.70rem",color:p.rLockedProfit>0?C.green:C.muted}}>{p.rLockedProfit>0?`$${p.rLockedProfit.toFixed(2)}/sh`:"$0"}</td>
                      </>
                    ) : (
                      <>
                        <td style={{padding:"8px 6px",textAlign:"right",color:p.sbe>0?C.text:C.muted,fontSize:"0.70rem"}}>{p.sbe>0?p.sbe.toLocaleString():"—"}</td>
                        <td style={{padding:"8px 6px",textAlign:"right",fontWeight:600,color:!p.sbe?C.muted:p.sbePct>100?C.red:p.sbePct>80?C.gold:C.green,fontSize:"0.70rem"}}>{p.sbe>0?`${p.sbePct.toFixed(1)}%`:"—"}</td>
                      </>
                    )}
                    {/* P/L — respects $ / % toggle */}
                    <td style={{padding:"8px 6px",textAlign:"right",fontWeight:700,color:p.plPct>=0?C.green:C.red,fontSize:"0.70rem"}}>{plDisplay}</td>
                    <td style={{padding:"8px 6px",textAlign:"right",fontWeight:700,fontSize:"0.70rem",color:p.rMult>=2?C.green:p.rMult>=1?C.goldBright:p.rMult>=0?C.white:C.red}}>{p.epN&&(p.stop1||p.stop2)?`${p.rMult.toFixed(2)}R`:"—"}</td>
                    <td style={{padding:"6px 4px",textAlign:"center",whiteSpace:"nowrap"}}>
                      <div style={{display:"flex",gap:4,justifyContent:"center"}}>
                        <button onClick={()=>startSell(p)} title="Sell shares" style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${C.red}33`,background:"transparent",color:C.red,fontWeight:700,fontSize:"0.58rem",cursor:"pointer",fontFamily:font}}>Sell</button>
                        <button onClick={()=>removeRow(p.id)} title="Remove" style={{padding:"4px 6px",borderRadius:6,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontWeight:700,fontSize:"0.58rem",cursor:"pointer",fontFamily:font}}>×</button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Sell inline form */}
              {sellId && (() => {
                const pos = positions.find(p => p.id === sellId);
                if (!pos) return null;
                const totalShares = parseInt(pos.shares) || 0;
                const qty = parseInt(sellQty) || 0;
                const isPartial = qty < totalShares && qty > 0;
                return (
                  <tr style={{ background:"rgba(239,68,68,0.06)",borderBottom:`2px solid ${C.red}33` }}>
                    <td colSpan={22} style={{ padding:"14px 16px" }}>
                      <div style={{ display:"flex",alignItems:"center",gap:12,flexWrap:"wrap" }}>
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
                        <MiniSelect value={sellReason} onChange={setSellReason} options={exitReasons} width={130} />
                        <div style={{display:"flex",alignItems:"center",gap:5}}>
                          <span style={{fontSize:"0.62rem",color:C.muted,fontWeight:600}}>Tags</span>
                          <TagSelector selected={sellTags} allTags={allTags} onChange={setSellTags} small />
                        </div>
                        <input type="text" placeholder="Notes..." value={sellNotes} onChange={e=>setSellNotes(e.target.value)} style={{width:100,background:"rgba(255,255,255,0.03)",border:`1px solid ${C.border}`,borderRadius:6,padding:"5px 8px",color:C.white,fontSize:"0.68rem",fontFamily:font,outline:"none"}} />
                        <label style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer",fontSize:"0.62rem",color:C.muted}}>
                          <input type="checkbox" checked={sellAddJournal} onChange={e=>setSellAddJournal(e.target.checked)} style={{accentColor:C.gold}} />
                          Add to Journal
                        </label>
                        <button onClick={confirmSell} style={{padding:"6px 14px",borderRadius:8,border:`1px solid rgba(239,68,68,0.3)`,background:C.redDim,color:C.red,fontWeight:700,fontSize:"0.66rem",cursor:"pointer",fontFamily:font}}>
                          {isPartial ? `Sell ${qty} shares` : "Close Position"}
                        </button>
                        <button onClick={cancelSell} style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontSize:"0.62rem",cursor:"pointer",fontFamily:font}}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                );
              })()}

              {/* Totals — 21 cols: Status,Tier,Symbol,Shares,AvgCost,Value,OrigStop,Stop2,TrailStop,Current,Setup,Tags,DTS,RTS,ROTE,[RSuggest+Locked|SBE+SBE%],P/L,R,Actions */}
              <tr style={{ borderTop:`2px solid ${C.border}`,background:"rgba(255,255,255,0.02)" }}>
                <td colSpan={3} style={{padding:"12px 6px",fontWeight:800,fontSize:"0.64rem",color:C.white,letterSpacing:"0.06em",textTransform:"uppercase"}}>Totals</td>
                <td style={{padding:"12px 6px",textAlign:"right",fontWeight:700,color:C.text,fontSize:"0.70rem"}}>{enriched.reduce((s,p)=>s+p.sharesN,0).toLocaleString()}</td>
                <td />
                <td style={{padding:"12px 6px",textAlign:"right",fontWeight:800,fontSize:"0.72rem",color:C.goldBright}}>{fmt$(enriched.reduce((s,p)=>s+p.posValue,0))}</td>
                <td colSpan={6} />
                <td style={{padding:"12px 6px",textAlign:"right",fontWeight:800,fontSize:"0.72rem",color:totals.totalDtsD<=0?C.green:C.text}}>{displayMode==="R"?"—":displayMode==="$"?`$${Math.abs(totals.totalDtsD).toLocaleString(undefined,{maximumFractionDigits:0})}`:`${Math.abs(totals.avgDtsPct).toFixed(2)}%`}</td>
                <td style={{padding:"12px 6px",textAlign:"right",fontWeight:800,fontSize:"0.72rem",color:totals.totalRTS<=0?C.green:C.red}}>{displayMode==="R"?"—":displayMode==="$"?`$${Math.abs(totals.totalRTS).toLocaleString(undefined,{maximumFractionDigits:0})}`:`${totals.totalValue>0?((totals.totalRTS/totals.totalValue)*100).toFixed(2):"0.00"}%`}</td>
                <td style={{padding:"12px 6px",textAlign:"right",fontWeight:800,fontSize:"0.72rem",color:totals.totalRotePct>1.5?C.red:totals.totalRotePct>1.0?C.gold:C.green,whiteSpace:"nowrap"}}>{totals.totalRotePct.toFixed(2)}%{totals.totalRotePct>1.5&&<span style={{marginLeft:3,fontSize:"0.64rem"}}>⚠</span>}</td>
                {displayMode==="R" ? <><td style={{padding:"12px 6px",textAlign:"right",fontWeight:700,fontSize:"0.68rem",color:C.muted}}>—</td><td /></> : <td colSpan={2} />}
                <td style={{padding:"12px 6px",textAlign:"right",fontWeight:800,fontSize:"0.72rem",color:totals.totalPL>=0?C.green:C.red}}>{displayMode==="R"?`${totals.totalPL>=0?"+":""}${fmt$(Math.abs(totals.totalPL))}`:`${totals.totalPL>=0?"+":"-"}${fmt$(Math.abs(totals.totalPL))}`}</td>
                <td />
                <td />
              </tr>
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
          {/* ROTE Warning */}
          {totals.totalRotePct > 1.5 && (
            <div style={{ display:"flex",alignItems:"center",gap:8,padding:"10px 0 0",marginTop:8,borderTop:`1px solid rgba(239,68,68,0.15)` }}>
              <span style={{ fontSize:"1rem" }}>⚠</span>
              <span style={{ fontWeight:700,fontSize:"0.68rem",color:C.red }}>ROTE Warning: {totals.totalRotePct.toFixed(2)}% of total equity at risk</span>
              <span style={{ fontSize:"0.62rem",color:C.muted,marginLeft:4 }}>Ideal: keep total ROTE under 1.5%. Consider reducing position sizes or tightening stops.</span>
            </div>
          )}
        </div>
      </GlassCard>

      {/* Glossary */}
      <GlassCard style={{ padding:"22px 26px" }}>
        <Eyebrow>Glossary</Eyebrow>
        <table style={{ width:"100%",borderCollapse:"collapse",fontSize:"0.72rem" }}>
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
      </GlassCard>
    </div>
  );
}

// ═══════════════════════════════════════
// ─── SETTINGS PAGE ───
// ═══════════════════════════════════════
function SettingsPage({ setupTypes, setSetupTypes, tags, setTags, exitReasons, setExitReasons, fontSize, setFontSize, userEmail, displayName, onDisplayNameChange, session }) {
  const isAdmin = userEmail && userEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const [newSetup, setNewSetup] = useState("");
  const [newTag, setNewTag] = useState("");
  const [newReason, setNewReason] = useState("");
  const [accessCodes, setAccessCodes] = useState([]);
  const [newCode, setNewCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [allMembers, setAllMembers] = useState([]);
  const [backupStatus, setBackupStatus] = useState("");

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

                    // Restore positions — upsert by id (safe, non-destructive)
                    if (backup.positions.length > 0) {
                      const { error } = await supabase.from("positions").upsert(backup.positions, { onConflict: "id" });
                      if (error) { setBackupStatus("Position restore error: " + error.message); return; }
                      restored.positions = backup.positions.length;
                    }

                    // Restore trades — upsert by id (safe, non-destructive)
                    if (backup.trades.length > 0) {
                      const { error } = await supabase.from("trades").upsert(backup.trades, { onConflict: "id" });
                      if (error) { setBackupStatus("Trade restore error: " + error.message); return; }
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
    <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", WebkitFontSmoothing: "antialiased", color: C.text }}>
      <div style={{ width: "100%", maxWidth: 420, padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontWeight: 800, fontSize: "1.6rem", letterSpacing: "-0.03em", color: C.gold, marginBottom: 8, textShadow: `0 0 12px rgba(201,152,42,0.4), 0 0 28px rgba(201,152,42,0.2)`, lineHeight: 1.2 }}>Valen Insiders Vault</div>
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
              background: `linear-gradient(135deg, #a06800, ${C.goldBright}, #a06800)`, color: "#000",
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
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "\u{1F4C8}" },
  { id: "tools", label: "Tools", icon: "\u{26A1}" },
  { id: "journal", label: "Journal", icon: "\u{1F4CA}" },
  { id: "settings", label: "Settings", icon: "\u{2699}" },
];

// Debounce helper — saves to Supabase after user stops typing
function useSupabaseSave(table, userId, field, value, mapFn) {
  const timeout = useRef(null);
  useEffect(() => {
    if (!userId) return;
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => { mapFn(value); }, 800);
    return () => clearTimeout(timeout.current);
  }, [value, userId]);
}

export default function App() {
  const screenW = useScreenWidth();
  const isMobile = screenW < 768;
  const isTablet = screenW >= 768 && screenW < 1024;

  // ─── Auth State ───
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [page, setPage] = useState("dashboard");

  // ─── Data State (starts with defaults, loaded from Supabase after auth) ───
  const [setupTypes, setSetupTypes] = useState(DEFAULT_SETUP_TYPES);
  const [tags, setTags] = useState(DEFAULT_TAGS);
  const [exitReasons, setExitReasons] = useState(DEFAULT_EXIT_REASONS);
  const [journaledTrades, setJournaledTrades] = useState([]);
  const [positions, setPositions] = useState([]);
  const [portfolioSize, setPortfolioSize] = useState("500000");
  const [fullSizePct, setFullSizePct] = useState(25);
  const [numStocks, setNumStocks] = useState(5);
  const [fontSize, setFontSize] = useState("standard");
  const dataLoaded = useRef(false);

  // ─── Auth Listener ───
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (!s) setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (!s) { setAuthLoading(false); dataLoaded.current = false; }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ─── Helper: save positions to Supabase (safe sync — never deletes without confirmed insert) ───
  const savePositionsNow = useCallback(async (uid, posArr) => {
    try {
      // Step 1: Get existing DB positions to know what to update vs insert vs delete
      const { data: existing, error: fetchErr } = await supabase.from("positions").select("id").eq("user_id", uid);
      if (fetchErr) { console.error("Position fetch error:", fetchErr.message); return; }

      const existingIds = new Set((existing || []).map(r => r.id));
      const currentIds = new Set(posArr.filter(p => typeof p.id === "number" && existingIds.has(p.id)).map(p => p.id));

      // Step 2: Upsert all current positions (update existing, insert new)
      const toUpsert = posArr.map(p => {
        const row = {
          user_id: uid, symbol: p.sym || "", entry_date: p.entry || "", shares: p.shares || "",
          entry_price: p.ep || "", current_price: p.cp || "", stop_price: p.stop || "",
          stop_price_2: p.stop2 || "", trailing_stop: p.trailStop || "", setup: p.setup || "VCP", tags: p.tags || [],
        };
        // If this position came from DB, include its id for upsert
        if (typeof p.id === "number" && existingIds.has(p.id)) row.id = p.id;
        return row;
      });

      if (toUpsert.length > 0) {
        // Split: rows WITH id → upsert (update), rows WITHOUT id → insert (new)
        const updates = toUpsert.filter(r => r.id);
        const inserts = toUpsert.filter(r => !r.id);

        if (updates.length > 0) {
          const { error } = await supabase.from("positions").upsert(updates, { onConflict: "id" });
          if (error) { console.error("Position upsert error:", error.message); return; }
        }
        if (inserts.length > 0) {
          const { error } = await supabase.from("positions").insert(inserts);
          if (error) { console.error("Position insert error:", error.message); return; }
        }
      }

      // Step 3: Only delete positions that were in DB but are no longer in state (user removed them)
      const toDelete = [...existingIds].filter(id => !currentIds.has(id));
      if (toDelete.length > 0) {
        const { error } = await supabase.from("positions").delete().eq("user_id", uid).in("id", toDelete);
        if (error) console.error("Position delete error:", error.message);
      }
    } catch (err) {
      console.error("Position save failed:", err.message);
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

  // ─── Helper: save trades to Supabase (full replace) ───
  const saveTradesNow = useCallback(async (uid, tradeArr) => {
    // Mark all existing as deleted, then insert fresh
    await supabase.from("trades").update({ is_deleted: true }).eq("user_id", uid);
    if (tradeArr.length > 0) {
      const { error } = await supabase.from("trades").insert(tradeArr.map(t => ({
        user_id: uid, ticker: t.ticker || "", entry_date: t.entry || "", exit_date: t.exit || "",
        entry_price: t.entryP || 0, exit_price: t.exitP || 0, shares: t.shares || 0,
        stop_price: t.stop || 0, setup: t.setup || "", tags: t.tags || [],
        pl_pct: t.plPct || 0, pl_dollar: t.plDollar || 0, r_mult: t.rMult || 0,
        exit_reason: t.reason || "", notes: t.notes || "",
      })));
      if (error) console.error("Trade save error:", error.message);
    }
  }, []);

  // ─── Load all data when session is available ───
  useEffect(() => {
    if (!session || dataLoaded.current) return;
    const load = async () => {
      const uid = session.user.id;

      // Profile
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", uid).single();
      if (prof) {
        setProfile(prof);
        if (prof.portfolio_size) setPortfolioSize(String(prof.portfolio_size));
        if (prof.full_size_pct != null) setFullSizePct(prof.full_size_pct);
        if (prof.num_stocks != null) setNumStocks(prof.num_stocks);
        if (prof.font_size) setFontSize(prof.font_size);
      }

      // Settings — load or seed defaults
      const { data: settings } = await supabase.from("user_settings").select("*").eq("user_id", uid);
      let hasSetup = false, hasTags = false, hasExit = false;
      if (settings) {
        settings.forEach(s => {
          if (s.setting_key === "setup_types" && Array.isArray(s.setting_value)) { setSetupTypes(s.setting_value); hasSetup = true; }
          if (s.setting_key === "tags" && Array.isArray(s.setting_value)) { setTags(s.setting_value); hasTags = true; }
          if (s.setting_key === "exit_reasons" && Array.isArray(s.setting_value)) { setExitReasons(s.setting_value); hasExit = true; }
        });
      }
      // First time? Save defaults to DB so they persist
      if (!hasSetup) await saveSettingNow(uid, "setup_types", DEFAULT_SETUP_TYPES);
      if (!hasTags) await saveSettingNow(uid, "tags", DEFAULT_TAGS);
      if (!hasExit) await saveSettingNow(uid, "exit_reasons", DEFAULT_EXIT_REASONS);

      // Positions — load from DB, seed only on very first login
      const { data: pos } = await supabase.from("positions").select("*").eq("user_id", uid).order("created_at");
      if (pos && pos.length > 0) {
        lastLoadedCount.current = pos.length;
        setPositions(pos.map(p => ({ id: p.id, sym: p.symbol, entry: p.entry_date, shares: p.shares, ep: p.entry_price, cp: p.current_price, stop: p.stop_price, stop2: p.stop_price_2, trailStop: p.trailing_stop || "", setup: p.setup, tags: p.tags || [] })));
      } else {
        // Check if user has been initialized before
        const { data: initFlag } = await supabase.from("user_settings").select("setting_value").eq("user_id", uid).eq("setting_key", "initialized").single();
        if (!initFlag) {
          // Very first login — seed demo positions, save to DB, then load back with DB ids
          const { error: seedErr } = await supabase.from("positions").insert(INIT_POSITIONS.map(p => ({
            user_id: uid, symbol: p.sym || "", entry_date: p.entry || "", shares: p.shares || "",
            entry_price: p.ep || "", current_price: p.cp || "", stop_price: p.stop || "",
            stop_price_2: p.stop2 || "", trailing_stop: p.trailStop || "", setup: p.setup || "VCP", tags: p.tags || [],
          })));
          if (!seedErr) {
            // Re-load from DB so positions have real DB ids
            const { data: seeded } = await supabase.from("positions").select("*").eq("user_id", uid).order("created_at");
            if (seeded && seeded.length > 0) {
              lastLoadedCount.current = seeded.length;
              setPositions(seeded.map(p => ({ id: p.id, sym: p.symbol, entry: p.entry_date, shares: p.shares, ep: p.entry_price, cp: p.current_price, stop: p.stop_price, stop2: p.stop_price_2, trailStop: p.trailing_stop || "", setup: p.setup, tags: p.tags || [] })));
            }
          }
          await saveSettingNow(uid, "initialized", true);
        } else {
          // User deleted all positions intentionally — keep empty
          lastLoadedCount.current = 0;
          setPositions([]);
        }
      }

      // Trades — load (no seeding, journal starts empty)
      const { data: trades } = await supabase.from("trades").select("*").eq("user_id", uid).eq("is_deleted", false).order("created_at", { ascending: false });
      if (trades && trades.length > 0) {
        setJournaledTrades(trades.map(t => ({ id: t.id, ticker: t.ticker, entry: t.entry_date, exit: t.exit_date, entryP: t.entry_price, exitP: t.exit_price, shares: t.shares, stop: t.stop_price, setup: t.setup, tags: t.tags || [], plPct: t.pl_pct, plDollar: t.pl_dollar, rMult: t.r_mult, reason: t.exit_reason, notes: t.notes })));
      }

      dataLoaded.current = true;
      setAuthLoading(false);
    };
    load();
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

  useEffect(() => { if (dataLoaded.current) saveProfile("portfolio_size", +portfolioSize || 0); }, [portfolioSize]);
  useEffect(() => { if (dataLoaded.current) saveProfile("full_size_pct", fullSizePct); }, [fullSizePct]);
  useEffect(() => { if (dataLoaded.current) saveProfile("num_stocks", numStocks); }, [numStocks]);
  useEffect(() => { if (dataLoaded.current) saveProfile("font_size", fontSize); }, [fontSize]);

  // ─── Auto-save settings to Supabase ───
  useEffect(() => { if (dataLoaded.current && session) saveSettingNow(session.user.id, "setup_types", setupTypes); }, [setupTypes]);
  useEffect(() => { if (dataLoaded.current && session) saveSettingNow(session.user.id, "tags", tags); }, [tags]);
  useEffect(() => { if (dataLoaded.current && session) saveSettingNow(session.user.id, "exit_reasons", exitReasons); }, [exitReasons]);

  // ─── Auto-save positions to Supabase (debounced, with safety checks) ───
  const posTimer = useRef(null);
  const lastLoadedCount = useRef(0); // track how many positions were loaded from DB
  useEffect(() => {
    if (!dataLoaded.current || !session) return;
    // Safety: if we loaded N positions from DB but state is now empty, don't auto-delete everything.
    // This prevents accidental wipe from race conditions or re-renders with stale state.
    if (positions.length === 0 && lastLoadedCount.current > 0) {
      console.warn("Positions autosave blocked: state is empty but DB had", lastLoadedCount.current, "positions. Skipping to prevent data loss.");
      return;
    }
    clearTimeout(posTimer.current);
    posTimer.current = setTimeout(() => savePositionsNow(session.user.id, positions), 2000);
  }, [positions, session]);

  // ─── Auto-save journaled trades to Supabase (only insert NEW trades) ───
  const tradeTimer = useRef(null);
  const prevTradeCount = useRef(0);
  useEffect(() => {
    if (!dataLoaded.current || !session) return;
    // Only save when trades are ADDED (count increased), not when deleted
    if (journaledTrades.length > prevTradeCount.current && prevTradeCount.current > 0) {
      clearTimeout(tradeTimer.current);
      tradeTimer.current = setTimeout(async () => {
        const uid = session.user.id;
        // Get what's already in DB
        const { data: existing } = await supabase.from("trades").select("id").eq("user_id", uid).eq("is_deleted", false);
        const existingIds = new Set((existing || []).map(t => t.id));
        // Only insert trades not already in DB (new ones won't have a DB id)
        const newTrades = journaledTrades.filter(t => !existingIds.has(t.id));
        if (newTrades.length > 0) {
          const { error } = await supabase.from("trades").insert(newTrades.map(t => ({
            user_id: uid, ticker: t.ticker || "", entry_date: t.entry || "", exit_date: t.exit || "",
            entry_price: t.entryP || 0, exit_price: t.exitP || 0, shares: t.shares || 0,
            stop_price: t.stop || 0, setup: t.setup || "", tags: t.tags || [],
            pl_pct: t.plPct || 0, pl_dollar: t.plDollar || 0, r_mult: t.rMult || 0,
            exit_reason: t.reason || "", notes: t.notes || "",
          })));
          if (error) console.error("Trade insert error:", error.message);
        }
      }, 1500);
    }
    prevTradeCount.current = journaledTrades.length;
  }, [journaledTrades, session]);

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
  };

  // ─── Loading / Auth Gate ───
  if (authLoading) {
    return (
      <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", WebkitFontSmoothing: "antialiased" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: "1.3rem", color: C.gold, marginBottom: 12, textShadow: `0 0 12px rgba(201,152,42,0.4)` }}>Valen Insiders Vault</div>
          <div style={{ fontSize: "0.78rem", color: C.muted }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (!session) return <AuthPage />;

  const userEmail = session.user.email;
  const displayName = displayNameState || profile?.display_name || userEmail.split("@")[0];
  const sidebarW = isTablet ? 200 : 220;
  const contentPadH = isMobile ? 16 : isTablet ? 24 : 36;
  const contentPadV = isMobile ? 16 : 28;

  const pageContent = (
    <>
      {page === "dashboard" && <DashboardPage onJournalTrade={handleJournalTrade} setupTypes={setupTypes} tags={tags} exitReasons={exitReasons} positions={positions} setPositions={setPositions} portfolioSize={portfolioSize} setPortfolioSize={setPortfolioSize} fullSizePct={fullSizePct} setFullSizePct={setFullSizePct} numStocks={numStocks} setNumStocks={setNumStocks} />}
      {page === "tools" && <PremiumToolsPage demo={false} />}
      {page === "journal" && <TradeJournalPage journaledTrades={journaledTrades} setJournaledTrades={setJournaledTrades} setupTypes={setupTypes} tags={tags} exitReasons={exitReasons} />}
      {page === "settings" && <SettingsPage setupTypes={setupTypes} setSetupTypes={setSetupTypes} tags={tags} setTags={setTags} exitReasons={exitReasons} setExitReasons={setExitReasons} fontSize={fontSize} setFontSize={setFontSize} userEmail={userEmail} displayName={displayName} onDisplayNameChange={handleDisplayNameChange} session={session} />}
    </>
  );

  // ─── MOBILE LAYOUT ───
  if (isMobile) {
    return (
      <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh", WebkitFontSmoothing: "antialiased", color: C.text, display: "flex", flexDirection: "column", zoom: appZoom }}>
        <div style={{ padding: "12px 16px", background: "rgba(8,8,14,0.95)", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ fontWeight: 800, fontSize: "0.88rem", letterSpacing: "-0.02em", color: C.gold, lineHeight: 1, textShadow: `0 0 6px rgba(201,152,42,0.35), 0 0 14px rgba(201,152,42,0.15)` }}>Valen Insiders Vault</div>
          <button onClick={handleLogout} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: "0.58rem", fontWeight: 600, cursor: "pointer", fontFamily: font }}>Sign Out</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: `${contentPadV}px ${contentPadH}px`, paddingBottom: 80 }}>{pageContent}</div>
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "rgba(8,8,14,0.97)", borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 100, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
          {NAV.map(item => (
            <button key={item.id} onClick={() => setPage(item.id)} style={{
              flex: 1, padding: "10px 0 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              border: "none", cursor: "pointer", fontFamily: font, background: "transparent",
              color: page === item.id ? C.gold : C.muted, transition: "color 0.15s",
            }}>
              <span style={{ fontSize: "1.1rem" }}>{item.icon}</span>
              <span style={{ fontSize: "0.54rem", fontWeight: page === item.id ? 700 : 500, letterSpacing: "0.04em" }}>{item.label}</span>
              {page === item.id && <div style={{ position: "absolute", top: 0, width: 24, height: 2, borderRadius: 1, background: C.gold }} />}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── DESKTOP / TABLET LAYOUT ───
  return (
    <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh", display: "flex", WebkitFontSmoothing: "antialiased", color: C.text, zoom: appZoom }}>
      <div style={{ width: sidebarW, minHeight: "100vh", padding: "24px 14px", background: "rgba(8,8,14,0.95)", borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0, alignSelf: "flex-start" }}>
        <div style={{ fontWeight: 800, fontSize: "0.95rem", letterSpacing: "-0.02em", color: C.gold, marginBottom: 24, padding: "0 8px", lineHeight: 1.2, textShadow: `0 0 8px rgba(201,152,42,0.35), 0 0 16px rgba(201,152,42,0.15)` }}>Valen Insiders Vault</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map(item => (
            <button key={item.id} onClick={() => setPage(item.id)} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10,
              border: "none", cursor: "pointer", fontFamily: font, width: "100%", textAlign: "left",
              background: page === item.id ? C.goldDim : "transparent",
              color: page === item.id ? C.gold : C.muted,
              fontWeight: page === item.id ? 700 : 500, fontSize: "0.78rem", transition: "all 0.15s",
            }}><span style={{ fontSize: "0.82rem", width: 18, textAlign: "center" }}>{item.icon}</span>{item.label}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ padding: "10px 12px", borderRadius: 10, background: C.glass, border: `1px solid ${C.border}` }}>
          <div style={{ fontWeight: 700, fontSize: "0.72rem", color: C.white, marginBottom: 2 }}>{displayName}</div>
          <div style={{ fontSize: "0.56rem", color: C.muted, marginBottom: 6, wordBreak: "break-all" }}>{userEmail}</div>
          <button onClick={handleLogout} style={{ width: "100%", padding: "5px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: "0.58rem", fontWeight: 600, cursor: "pointer", fontFamily: font }}>Sign Out</button>
        </div>
      </div>
      <div style={{ flex: 1, padding: `${contentPadV}px ${contentPadH}px`, overflowY: "auto", minWidth: 0 }}>{pageContent}</div>
    </div>
  );
}
