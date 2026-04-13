import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";

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

const DEMO_RISK = { sym: "NVDA", mode: "$", sharePrice: "142.50", stopPrice: "133.80", portfolio: "500000", riskAmt: "5000" };
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
function ResultRow({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
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

// ─── Exposure Grid (Minervini-style visual) ───
function ExposureGrid({ sizer, portfolioSize, numStocks }) {
  const sw = useScreenWidth();
  const isMobile = sw < 768;
  if (!sizer) return null;
  const ps = +portfolioSize || 0;
  if (ps <= 0) return null;

  const { pilot, quarter, half, full } = sizer;
  const n = numStocks;

  // Phase compositions — ADDITIVE like Minervini's model
  // Phase 1: Start with pilots + quarters (cautious)
  // Phase 2: Keep phase 1 + ADD halves (building)
  // Phase 3: Keep phase 2 + ADD fulls (concentrated)
  const nP = Math.max(1, Math.round(n * 0.3));
  const nQ = Math.max(1, n - nP);
  const nH = Math.max(1, Math.ceil(n * 0.5));
  const nF = Math.max(1, Math.ceil(n * 0.5));

  const tierAmts = { Pilot: pilot, Quarter: quarter, Half: half, Full: full };
  const tierMeta = {
    Pilot:   { color: C.purple, bg: C.purpleDim, border: "rgba(167,139,250,0.40)", cells: 0 },
    Quarter: { color: C.blue,   bg: C.blueDim,   border: "rgba(59,130,246,0.40)",  cells: 1 },
    Half:    { color: C.gold,   bg: C.goldDim,    border: "rgba(201,152,42,0.40)",  cells: 2 },
    Full:    { color: C.green,  bg: C.greenDim,   border: "rgba(34,197,94,0.40)",   cells: 4 },
  };

  const phases = [
    { title: "Cautious", groups: [{ tier: "Pilot", count: nP }, { tier: "Quarter", count: nQ }] },
    { title: "Building", groups: [{ tier: "Pilot", count: nP }, { tier: "Quarter", count: nQ }, { tier: "Half", count: nH }] },
    { title: "Concentrated", groups: [{ tier: "Pilot", count: nP }, { tier: "Quarter", count: nQ }, { tier: "Half", count: nH }, { tier: "Full", count: nF }] },
  ];
  phases.forEach(ph => {
    ph.deployed = ph.groups.reduce((s, g) => s + g.count * tierAmts[g.tier], 0);
    ph.pct = ((ph.deployed / ps) * 100).toFixed(1);
    ph.posCount = ph.groups.reduce((s, g) => s + g.count, 0);
  });

  // ─── 2×2 Block renderer ───
  // Each position = 2×2 grid of cells. Filled cells = tier level.
  // Pilot = small square inside cell 0. Quarter = 1 cell. Half = 2 cells. Full = 4 cells.
  const cellSz = isMobile ? 24 : 32;
  const cellGap = 2;

  const renderBlock = (tier, key) => {
    const meta = tierMeta[tier];
    const filled = meta.cells;
    return (
      <div key={key} style={{ display: "grid", gridTemplateColumns: `${cellSz}px ${cellSz}px`, gap: cellGap }}>
        {[0, 1, 2, 3].map(i => {
          const active = i < filled;
          const isPilot = tier === "Pilot" && i === 0;
          return (
            <div key={i} style={{
              width: cellSz, height: cellSz, borderRadius: Math.max(3, cellSz * 0.14),
              background: active ? meta.bg : "transparent",
              border: active ? `2px solid ${meta.border}` : `1.5px dashed rgba(255,255,255,0.06)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.25s ease",
            }}>
              {isPilot && <div style={{
                width: cellSz * 0.50, height: cellSz * 0.50, borderRadius: Math.max(2, cellSz * 0.10),
                background: meta.bg, border: `2px solid ${meta.border}`,
              }} />}
            </div>
          );
        })}
      </div>
    );
  };

  // Phase colors
  const phColors = [C.purple, C.gold, C.green];
  const phBgs = [C.purpleDim, C.goldDim, C.greenDim];
  const phBorders = ["rgba(167,139,250,0.18)", C.borderGold, "rgba(34,197,94,0.18)"];

  return (
    <div style={{ marginTop: 24, borderTop: `1px solid ${C.border}`, paddingTop: 20 }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: "0.60rem", letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold, marginBottom: 4 }}>Exposure Framework</div>
        <div style={{ fontWeight: 800, fontSize: "1.05rem", letterSpacing: "-0.03em", color: C.white, marginBottom: 4 }}>More Exposure. More Concentration.</div>
        <div style={{ fontWeight: 300, fontSize: "0.72rem", color: C.muted, lineHeight: 1.5 }}>Start small. Add size as you win. 4 cells = 1 full position.</div>
      </div>

      {/* 3 Phases with arrows */}
      <div style={{
        display: "flex", flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "flex-start", justifyContent: "center", gap: 0,
      }}>
        {phases.map((ph, pi) => {
          const items = [];

          {/* Arrow between phases */}
          if (pi > 0) {
            items.push(
              <div key={`arrow-${pi}`} style={{
                display: "flex", flexDirection: isMobile ? "row" : "column",
                alignItems: "center", justifyContent: "center", alignSelf: "center",
                padding: isMobile ? "10px 0" : "0 8px", gap: 3,
              }}>
                <div style={{
                  fontWeight: 900, fontSize: isMobile ? "1.1rem" : "1.5rem", color: C.gold, lineHeight: 1,
                  transform: isMobile ? "rotate(90deg)" : "none",
                }}>{"\u2192"}</div>
                <div style={{ fontSize: "0.54rem", fontWeight: 800, color: C.muted, whiteSpace: "nowrap" }}>
                  {phases[pi - 1].posCount} to {ph.posCount}
                </div>
              </div>
            );
          }

          {/* Phase column */}
          items.push(
            <div key={`phase-${pi}`} style={{
              flex: 1, padding: isMobile ? "18px 16px" : "20px 16px", borderRadius: 16,
              background: "rgba(255,255,255,0.015)", border: `1px solid ${C.border}`,
              display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0,
            }}>
              {/* % invested header */}
              <div style={{ fontWeight: 800, fontSize: "1.4rem", letterSpacing: "-0.04em", color: C.white, marginBottom: 2 }}>{ph.pct}%</div>
              <div style={{ fontWeight: 700, fontSize: "0.54rem", letterSpacing: "0.12em", textTransform: "uppercase", color: phColors[pi], marginBottom: 4 }}>{ph.title}</div>
              <div style={{ fontSize: "0.56rem", fontWeight: 500, color: C.muted, marginBottom: 14 }}>{fmt$(ph.deployed)} deployed</div>

              {/* Position blocks grid */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 16 }}>
                {ph.groups.flatMap((g, gi) =>
                  Array(g.count).fill(null).map((_, i) => renderBlock(g.tier, `${pi}-${gi}-${i}`))
                )}
              </div>

              {/* Tier breakdown text — "N × X.XX%" like Minervini */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                {ph.groups.map(g => (
                  <div key={g.tier} style={{ fontSize: "0.68rem", fontWeight: 600, color: C.text }}>
                    <span style={{ color: tierMeta[g.tier].color, fontWeight: 800 }}>{g.count}</span>
                    <span style={{ color: C.muted }}> {"\u00D7"} </span>
                    <span>{((tierAmts[g.tier] / ps) * 100).toFixed(2)}%</span>
                  </div>
                ))}
              </div>

              {/* Total badge */}
              <div style={{ marginTop: 10, padding: "5px 14px", borderRadius: 8, background: phBgs[pi], border: `1px solid ${phBorders[pi]}` }}>
                <span style={{ fontSize: "0.60rem", fontWeight: 700, color: phColors[pi] }}>{ph.posCount} positions</span>
              </div>
            </div>
          );

          return items;
        })}
      </div>

      {/* Legend — shows what each tier looks like */}
      <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
        {[["Pilot", "= \u00BD cell"], ["Quarter", "= 1 cell"], ["Half", "= 2 cells"], ["Full", "= 4 cells"]].map(([tier, desc]) => {
          const meta = tierMeta[tier];
          const filled = meta.cells;
          const sm = 10;
          return (
            <div key={tier} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ display: "grid", gridTemplateColumns: `${sm}px ${sm}px`, gap: 1 }}>
                {[0, 1, 2, 3].map(i => {
                  const active = i < filled;
                  const isPilot = tier === "Pilot" && i === 0;
                  return (
                    <div key={i} style={{
                      width: sm, height: sm, borderRadius: 2,
                      background: active ? meta.bg : "transparent",
                      border: active ? `1.5px solid ${meta.border}` : `1px dashed rgba(255,255,255,0.05)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {isPilot && <div style={{ width: 5, height: 5, borderRadius: 1, background: meta.bg, border: `1.5px solid ${meta.border}` }} />}
                    </div>
                  );
                })}
              </div>
              <span style={{ fontSize: "0.54rem", fontWeight: 700, color: meta.color }}>{tier}</span>
              <span style={{ fontSize: "0.50rem", fontWeight: 500, color: C.muted }}>{desc} ({fmt$(tierAmts[tier])})</span>
            </div>
          );
        })}
      </div>

      {/* Guidance */}
      <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 10, background: C.goldDim, border: `1px solid ${C.borderGold}` }}>
        <div style={{ fontSize: "0.70rem", fontWeight: 600, color: C.goldBright, lineHeight: 1.7 }}>
          Start cautious — pilots and quarters only. As your positions work, add halves. When you're winning consistently, concentrate with full-size positions. Each block is a 2{"\u00D7"}2 grid: 4 filled cells = 1 full position. Never skip phases — earn the right to size up.
        </div>
      </div>
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
  const [mode, setMode] = useState("$");
  const [sharePrice, setSharePrice] = useState(demo ? DEMO_RISK.sharePrice : "");
  const [stopPrice, setStopPrice] = useState(demo ? DEMO_RISK.stopPrice : "");
  const [portfolio, setPortfolio] = useState(demo ? DEMO_RISK.portfolio : "");
  const [riskAmt, setRiskAmt] = useState(demo ? DEMO_RISK.riskAmt : "");
  useEffect(() => { if (demo) { setSym(DEMO_RISK.sym); setSharePrice(DEMO_RISK.sharePrice); setStopPrice(DEMO_RISK.stopPrice); setPortfolio(DEMO_RISK.portfolio); setRiskAmt(DEMO_RISK.riskAmt); } else { setSym(""); setSharePrice(""); setStopPrice(""); setPortfolio(""); setRiskAmt(""); } }, [demo]);
  const r = useMemo(() => { const sp=+sharePrice,st=+stopPrice,p=+portfolio,ra=+riskAmt; if(!sp||!st||!p||!ra||sp<=0||st<=0||st>=sp)return null; const rps=sp-st,stopDist=(rps/sp)*100,dollarRisk=mode==="$"?ra:(ra/100)*p,shares=Math.floor(dollarRisk/rps); if(shares<=0)return null; return{rps,stopDist,shares,posVal:shares*sp,posWt:(shares*sp/p)*100,dollarRisk:shares*rps}; }, [sharePrice,stopPrice,portfolio,riskAmt,mode]);
  return (
    <div style={{ display:"flex",gap:28,padding:"24px 28px 32px",flexWrap:"wrap" }}>
      <div style={{ flex:"1 1 300px",display:"flex",flexDirection:"column",gap:16 }}>
        <TextInput label="Symbol" value={sym} onChange={setSym} placeholder="AAPL" />
        <div><label style={{fontWeight:700,fontSize:"0.60rem",letterSpacing:"0.12em",textTransform:"uppercase",color:C.muted,marginBottom:6,display:"block"}}>Type</label>
          <div style={{display:"flex",borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`}}>
            {["$","%"].map(m=>(<button key={m} onClick={()=>setMode(m)} style={{padding:"10px 20px",background:mode===m?C.goldDim:"rgba(255,255,255,0.03)",border:"none",color:mode===m?C.gold:C.muted,fontWeight:700,fontSize:"0.78rem",cursor:"pointer",fontFamily:font}}>{m}</button>))}
          </div></div>
        <div style={{display:"flex",gap:12}}><CalcInput label="Share Price" value={sharePrice} onChange={setSharePrice} /><CalcInput label="Stop Price" value={stopPrice} onChange={setStopPrice} /></div>
        <CalcInput label="Portfolio Size" value={portfolio} onChange={setPortfolio} />
        <CalcInput label="Amount to Risk" value={riskAmt} onChange={setRiskAmt} suffix={mode} />
      </div>
      <div style={{ flex:"1 1 300px",display:"flex",flexDirection:"column" }}>
        {!r?(<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",minHeight:200,color:C.muted,fontSize:"0.82rem",textAlign:"center",lineHeight:1.6}}>Fill in all fields to<br/>see your results.</div>):(<>
          <ResultRow label="Risk Per Share" value={`$${r.rps.toFixed(2)}`} />
          <ResultRow label="Stop Distance" value={`${r.stopDist.toFixed(2)}%`} color={r.stopDist>10?C.red:r.stopDist>7?C.gold:C.white} />
          <ResultRow label="Position Size" value={`${r.shares.toLocaleString()} shares`} />
          <ResultRow label="Position Value" value={`$${r.posVal.toLocaleString(undefined,{minimumFractionDigits:2})}`} />
          <ResultRow label="Position Weight" value={`${r.posWt.toFixed(2)}%`} color={r.posWt>50?C.red:r.posWt>25?C.gold:C.white} />
          <ResultRow label="Dollar at Risk" value={`$${r.dollarRisk.toFixed(2)}`} color={C.red} />
          {r.stopDist>10&&<Alert type="red">Stop exceeds 10%. Consider a tighter entry.</Alert>}
          {r.posWt>25&&<Alert type={r.posWt>50?"red":"gold"}>Position weight at {r.posWt.toFixed(1)}%.</Alert>}
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
    if(!ag||!al||!wr||ag<=0||al<=0||wr<=0||wr>100)return null;
    const wrd=wr/100,lrd=1-wrd,glRatio=ag/al,ev=wrd*ag-lrd*al;
    const compound10=(Math.pow(1+ev/100,10)-1)*100;
    const recStop=ag/2,beWinRate=(al/(ag+al))*100;
    // Trades to hit desired return: each trade impacts portfolio by ev% × posSize% / 100
    const impactPerTrade = ps > 0 ? (ev * ps / 100) : 0;
    const tradesToTarget = (impactPerTrade > 0 && dr > 0) ? Math.ceil(Math.log(1 + dr/100) / Math.log(1 + impactPerTrade/100)) : null;
    const dollarTarget = pf > 0 && dr > 0 ? pf * dr / 100 : 0;
    return{glRatio,ev,compound10,recStop,beWinRate,tradesToTarget,impactPerTrade,dollarTarget};
  },[avgGain,avgLoss,winRate,posSize,desRet,port]);
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
          <ResultRow label="Gain/Loss Ratio" value={r.glRatio.toFixed(2)} color={r.glRatio>=2?C.green:r.glRatio>=1?C.gold:C.red} />
          <ResultRow label="Expected Value / Trade" value={`${r.ev>=0?"+":""}${r.ev.toFixed(2)}%`} color={r.ev>=0?C.green:C.red} />
          <ResultRow label="Portfolio Impact / Trade" value={`${r.impactPerTrade>=0?"+":""}${r.impactPerTrade.toFixed(3)}%`} color={r.impactPerTrade>=0?C.green:C.red} />
          <ResultRow label="10-Trade Compound" value={`${r.compound10>=0?"+":""}${r.compound10.toFixed(2)}%`} color={r.compound10>=0?C.green:C.red} />
          {r.tradesToTarget !== null && r.ev > 0 ? (
            <ResultRow label={`Trades to +${+desRet}% (${r.dollarTarget>0?`$${r.dollarTarget.toLocaleString(undefined,{maximumFractionDigits:0})}`:""})` } value={`${r.tradesToTarget} trades`} color={C.goldBright} />
          ) : r.ev <= 0 && +desRet > 0 ? (
            <ResultRow label={`Trades to +${+desRet}%`} value="Never" color={C.red} />
          ) : null}
          <ResultRow label="Recommended Max Stop" value={`${r.recStop.toFixed(1)}%`} />
          <ResultRow label="Breakeven Win Rate" value={`${r.beWinRate.toFixed(1)}%`} />
          <div style={{marginTop:14,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <Badge positive={r.ev>=0}>{r.ev>=0?"Positive Expectancy":"Negative Expectancy"}</Badge>
            <span style={{fontSize:"0.62rem",color:C.muted,fontWeight:500}}>Min. {Math.max(30, Math.ceil(4/((+winRate/100)*(1-(+winRate/100)))))} trades for statistical confidence</span>
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
  const r=useMemo(()=>{const bp=+buyPrice,sh=+shares,st=+stopPrice,cp=+curPrice;if(!bp||!sh||!st||!cp||bp<=0||st>=bp)return null;const initRisk=(bp-st)/bp*100,plPct=(cp-bp)/bp*100,rMult=plPct/initRisk,plDollar=(cp-bp)*sh;const sugStop=rMult>=2?bp:st;let action=rMult<1?`Hold stop at $${st.toFixed(2)}`:rMult<2?"Approaching 2R. Monitor.":rMult<3?`Move stop to breakeven ($${bp.toFixed(2)})`:"Protect capital. Stop at breakeven minimum.";return{initRisk,plPct,rMult,plDollar,action,profitIfStopped:(sugStop-bp)*sh}},[buyPrice,shares,stopPrice,curPrice]);
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
          <ResultRow label="Current P/L" value={`${r.plPct>=0?"+":""}${r.plPct.toFixed(2)}%  ·  ${r.plDollar>=0?"+":""}$${r.plDollar.toLocaleString(undefined,{minimumFractionDigits:2})}`} color={r.plPct>=0?C.green:C.red} />
          <ResultRow label="R-Multiple" value={`${r.rMult.toFixed(2)}R`} color={r.rMult>=3?C.green:r.rMult>=1?C.goldBright:r.rMult>=0?C.white:C.red} />
          <ResultRow label="Initial Risk" value={`${r.initRisk.toFixed(2)}%`} />
          <ResultRow label="Profit if Stopped" value={`$${r.profitIfStopped.toLocaleString(undefined,{minimumFractionDigits:2})}`} color={r.profitIfStopped>=0?C.green:C.red} />
          <div style={{marginTop:16,padding:"14px 16px",borderRadius:12,background:r.rMult>=3?C.greenDim:r.rMult>=2?C.goldDim:"rgba(255,255,255,0.02)",border:`1px solid ${r.rMult>=3?"rgba(34,197,94,0.18)":r.rMult>=2?C.borderGold:C.border}`}}>
            <div style={{fontSize:"0.58rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.12em",color:C.muted,marginBottom:6}}>Suggested Action</div>
            <div style={{fontSize:"0.82rem",fontWeight:600,color:r.rMult>=3?C.green:r.rMult>=2?C.goldBright:C.text,lineHeight:1.5}}>{r.action}</div>
          </div>
        </>)}
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
  const[tab,setTab]=useState(0);const tabs=["Risk","Expectancy","Risk Finance"];
  return (<div>
    <Eyebrow>Premium Tools</Eyebrow>
    <h1 style={{fontWeight:800,fontSize:"clamp(1.5rem, 4vw, 2rem)",letterSpacing:"-0.04em",color:C.white,margin:"0 0 4px"}}>Risk Management</h1>
    <p style={{fontWeight:300,fontSize:"0.84rem",color:C.muted,margin:"0 0 24px",lineHeight:1.6}}>Define your risk before you enter. Calculate your edge. Protect your capital.</p>
    <GlassCard><div style={{display:"flex",borderBottom:`1px solid ${C.border}`}}>
      {tabs.map((t,i)=>(<button key={t} onClick={()=>setTab(i)} style={{flex:1,padding:"14px 0",textAlign:"center",fontWeight:tab===i?700:500,fontSize:"0.80rem",color:tab===i?C.white:C.muted,cursor:"pointer",background:"transparent",border:"none",fontFamily:font,borderBottom:tab===i?`2px solid ${C.gold}`:"2px solid transparent"}}>{t}</button>))}
    </div>
      {tab===0&&<RiskTab demo={demo}/>}{tab===1&&<ExpectancyTab demo={demo}/>}{tab===2&&<RiskFinanceTab demo={demo}/>}
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
    // Validate minimum: need ticker + at least entry or exit price
    if (!row.ticker) return results; // skip malformed
    // Convert numerics
    const entryP = parseFloat(row.entryP) || 0;
    const exitP = parseFloat(row.exitP) || 0;
    const shares = parseInt(row.shares) || 0;
    const stop = parseFloat(row.stop) || 0;
    const plPct = row.plPct !== undefined ? parseFloat(row.plPct) : (entryP > 0 ? ((exitP - entryP) / entryP) * 100 : 0);
    const plDollar = row.plDollar !== undefined ? parseFloat(row.plDollar) : (exitP - entryP) * shares;
    const initRisk = entryP > 0 && stop > 0 ? (entryP - stop) / entryP : 0;
    const rMult = row.rMult !== undefined ? parseFloat(row.rMult) : (initRisk > 0 ? (plPct / 100) / initRisk : 0);
    results.push({
      id: Date.now() + i,
      ticker: row.ticker.toUpperCase(),
      entry: row.entry || "",
      exit: row.exit || "",
      entryP, exitP, shares, stop,
      setup: row.setup || "VCP",
      tags: row.tags ? row.tags.split(/[;,]/).map(t => t.trim()).filter(Boolean) : [],
      plPct, plDollar, rMult,
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

  const allTrades = useMemo(() => [...SAMPLE_TRADES, ...journaledTrades], [journaledTrades]);

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
                    <td style={{ padding: "11px 8px" }}>
                      <button onClick={() => startEdit(t)} style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${C.border}`,background:"transparent",color:C.muted,fontSize:"0.54rem",cursor:"pointer",fontFamily:font}}>Edit</button>
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
const mkPos = (sym, entry, shares, ep, cp, stop, setup, tags = []) => ({ id: _posId++, sym, entry, shares: String(shares), ep: String(ep), cp: String(cp), stop: String(stop), setup, tags });
const INIT_POSITIONS = [
  mkPos("MSGS","4/1/26",612,328.25,302.90,302.90,"VCP",["Breakout"]),
  mkPos("DNTH","4/8/26",2100,87.58,81.75,81.75,"Pivot",["Momentum"]),
  mkPos("PSMT","4/7/26",322,154.81,143.10,143.10,"VCP",[]),
  mkPos("CWEN","4/1/26",1250,39.93,38.50,38.50,"VCP",["Sector Leader"]),
  mkPos("KYMR","4/8/26",574,87.00,81.91,81.91,"Pivot",[]),
  mkPos("DLX","4/8/26",1737,28.77,26.95,26.95,"Low-Risk Entry",["High Volume"]),
];

const GLOSSARY = [
  ["DTS $","Down To Stop","Current Price − Stop Price. Distance to stop per share."],
  ["DTS %","Down To Stop %","DTS as a percentage of current price."],
  ["RTS $","Risk To Stop","Shares × DTS. Total dollars lost if stopped out. Goal: $0."],
  ["SBE","Shares to Break Even","Shares to sell at current price to recover entire cost. Remaining shares = free."],
  ["SBE %","SBE Percentage","SBE ÷ total shares. Over 100% = underwater, can't break even."],
  ["R-Mult","R-Multiple","Return ÷ initial risk. 2R = made 2× what you risked."],
  ["Tier","Position Tier","Auto-assigned from position value vs sizer. 12% buffer for slippage."],
];

function DashboardPage({ onJournalTrade, setupTypes, tags: allTags, exitReasons }) {
  const [portfolioSize, setPortfolioSize] = useState("1550000");
  const [fullSizePct, setFullSizePct] = useState(25);
  const [numStocks, setNumStocks] = useState(5);

  const sizer = useMemo(() => {
    const ps = +portfolioSize;
    if (!ps || ps <= 0) return null;
    const fullSizeAmt = ps * (fullSizePct / 100);
    const perStock = fullSizeAmt / numStocks;
    return { fullSizeAmt, full: perStock, half: perStock / 2, quarter: perStock / 4, pilot: perStock / 8 };
  }, [portfolioSize, fullSizePct, numStocks]);

  const [positions, setPositions] = useState(INIT_POSITIONS);
  const [sellId, setSellId] = useState(null);
  const [sellQty, setSellQty] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [sellReason, setSellReason] = useState("Sold Into Strength");
  const [sellTags, setSellTags] = useState([]);
  const [sellAddJournal, setSellAddJournal] = useState(true);
  const [sellNotes, setSellNotes] = useState("");
  const [displayMode, setDisplayMode] = useState("$"); // "$" or "%"

  const updateField = useCallback((id, field, val) => { setPositions(prev => prev.map(p => p.id === id ? { ...p, [field]: val } : p)); }, []);
  const addPosition = useCallback(() => {
    setPositions(prev => [...prev, { id: _posId++, sym: "", entry: new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }), shares: "", ep: "", cp: "", stop: "", setup: setupTypes[0] || "VCP", tags: [] }]);
  }, [setupTypes]);
  const removeRow = useCallback((id) => { setPositions(prev => prev.filter(p => p.id !== id)); }, []);

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

  // Enriched
  const enriched = useMemo(() => positions.map(p => {
    const epN = parseFloat(p.ep)||0, cpN = parseFloat(p.cp)||0, stopN = parseFloat(p.stop)||0, sharesN = parseInt(p.shares)||0;
    const posValue = epN * sharesN;
    const tier = autoTier(posValue, sizer);
    const dtsD = cpN - stopN, dtsPct = cpN > 0 ? (dtsD / cpN) * 100 : 0;
    const rtsD = sharesN * dtsD;
    const sbe = cpN > 0 ? Math.ceil((epN * sharesN) / cpN) : 0;
    const sbePct = sharesN > 0 ? (sbe / sharesN) * 100 : 0;
    const plPct = epN > 0 ? ((cpN - epN) / epN) * 100 : 0;
    const plD = (cpN - epN) * sharesN;
    const initRisk = epN > 0 ? (epN - stopN) / epN : 0;
    const rMult = initRisk > 0 ? (plPct / 100) / initRisk : 0;
    // Risk Status: what's your actual exposure?
    const riskStatus = !epN || !stopN ? "—"
      : stopN >= epN ? "Free"       // stop above entry = guaranteed profit, can't lose
      : plPct > 5 ? "Profit"        // in profit but stop not yet at breakeven
      : plPct >= -2 ? "Even"         // near breakeven, neutral zone
      : "At Risk";                   // underwater, losing position
    return { ...p, epN, cpN, stopN, sharesN, posValue, tier, dtsD, dtsPct, rtsD, sbe, sbePct, plPct, plD, rMult, riskStatus };
  }), [positions, sizer]);

  const totals = useMemo(() => {
    const active = enriched.filter(p => p.sym && p.cpN > 0);
    const totalValue = active.reduce((s,p) => s + p.cpN * p.sharesN, 0);
    // Weighted avg DTS% = sum(dtsD * shares) / sum(cpN * shares) * 100
    const totalDtsD = active.reduce((s,p) => s + p.dtsD * p.sharesN, 0);
    const avgDtsPct = totalValue > 0 ? (totalDtsD / totalValue) * 100 : 0;
    return {
      totalPL: enriched.reduce((s,p) => s + p.plD, 0),
      totalRTS: enriched.reduce((s,p) => s + p.rtsD, 0),
      totalDtsD,
      avgDtsPct,
      totalValue,
      count: enriched.filter(p => p.sym).length,
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
        <ExposureGrid sizer={sizer} portfolioSize={portfolioSize} numStocks={numStocks} />
      </GlassCard>

      {/* Open Positions */}
      <GlassCard style={{ marginBottom: 14 }}>
        <div style={{ padding:"20px 24px 8px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10 }}>
          <div>
            <div style={{ fontWeight:700,fontSize:"0.78rem",color:C.white }}>Open Positions</div>
            <div style={{ fontWeight:400,fontSize:"0.64rem",color:C.muted,marginTop:2 }}>Edit any white cell. Gold = current price. Grey = auto-calculated.</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div style={{display:"flex",borderRadius:8,overflow:"hidden",border:`1px solid ${C.border}`}}>
              {["$","%"].map(m=>(<button key={m} onClick={()=>setDisplayMode(m)} style={{padding:"6px 14px",background:displayMode===m?C.goldDim:"rgba(255,255,255,0.03)",border:"none",color:displayMode===m?C.gold:C.muted,fontWeight:700,fontSize:"0.70rem",cursor:"pointer",fontFamily:font}}>{m}</button>))}
            </div>
            <GoldBtn onClick={addPosition} small>+ Add Position</GoldBtn>
          </div>
        </div>
        <div style={{ overflowX:"auto",padding:"0 0 4px" }}>
          <table style={{ width:"100%",borderCollapse:"collapse",fontSize:"0.71rem" }}>
            <thead><tr style={{ borderBottom:`1px solid ${C.border}` }}>
              {th("Status","left")}{th("Tier","left")}{th("Symbol","left")}{th("Shares")}{th("Avg. Cost")}{th("Stop")}{th("Current")}{th("Setup","left")}{th("Tags","left")}{th("DTS")}{th("RTS")}{th("SBE")}{th("SBE %")}{th("P/L")}{th("R")}{th("","center")}
            </tr></thead>
            <tbody>
              {enriched.map((p, idx) => {
                const ts = TIER_STYLES[p.tier] || TIER_STYLES.Pilot;
                const isSelling = sellId === p.id;
                const RISK_BADGE = { Free:{bg:C.greenDim,color:C.green,border:"rgba(34,197,94,0.25)"}, Profit:{bg:C.blueDim,color:C.blue,border:"rgba(59,130,246,0.25)"}, Even:{bg:C.goldDim,color:C.gold,border:C.borderGold}, "At Risk":{bg:C.redDim,color:C.red,border:"rgba(239,68,68,0.25)"}, "—":{bg:"transparent",color:C.muted,border:C.border} };
                const rb = RISK_BADGE[p.riskStatus] || RISK_BADGE["—"];
                const isDollar = displayMode === "$";
                const dtsDisplay = !p.cpN ? "—" : isDollar ? `$${Math.abs(p.dtsD).toFixed(2)}` : `${Math.abs(p.dtsPct).toFixed(2)}%`;
                const rtsDisplay = !p.cpN ? "—" : isDollar ? `$${Math.abs(p.rtsD).toLocaleString(undefined,{maximumFractionDigits:0})}` : `${(p.sharesN>0?(p.rtsD/(p.cpN*p.sharesN)*100):0).toFixed(2)}%`;
                const plDisplay = !p.epN ? "—" : isDollar ? `${p.plD>=0?"+":"-"}${fmt$(Math.abs(p.plD))}` : `${p.plPct>=0?"+":""}${p.plPct.toFixed(2)}%`;
                return (
                  <tr key={p.id} style={{ borderBottom:"1px solid rgba(255,255,255,0.04)",background:isSelling?"rgba(239,68,68,0.04)":idx%2?"rgba(255,255,255,0.01)":"transparent" }}>
                    {/* Risk Status */}
                    <td style={{padding:"8px 4px"}}><span style={{padding:"3px 8px",borderRadius:980,fontSize:"0.50rem",fontWeight:700,background:rb.bg,color:rb.color,border:`1px solid ${rb.border}`,whiteSpace:"nowrap"}}>{p.riskStatus}</span></td>
                    <td style={{padding:"8px 6px"}}><span style={{padding:"3px 8px",borderRadius:980,fontSize:"0.54rem",fontWeight:700,background:ts.bg,color:ts.color,border:`1px solid ${ts.border}`}}>{p.tier}</span></td>
                    <td style={{padding:"6px 4px"}}><TickerInput value={p.sym} onChange={v=>updateField(p.id,"sym",v)} /></td>
                    <td style={{padding:"6px 4px",textAlign:"right"}}><CellInput value={p.shares} onChange={v=>updateField(p.id,"shares",v)} width={62} /></td>
                    <td style={{padding:"6px 4px",textAlign:"right"}}><CellInput value={p.ep} onChange={v=>updateField(p.id,"ep",v)} /></td>
                    <td style={{padding:"6px 4px",textAlign:"right"}}><CellInput value={p.stop} onChange={v=>updateField(p.id,"stop",v)} /></td>
                    <td style={{padding:"6px 4px",textAlign:"right"}}><CellInput value={p.cp} onChange={v=>updateField(p.id,"cp",v)} gold width={82} /></td>
                    <td style={{padding:"6px 4px"}}><MiniSelect value={p.setup} onChange={v=>updateField(p.id,"setup",v)} options={setupTypes} width={85} /></td>
                    <td style={{padding:"6px 4px"}}><TagSelector selected={p.tags||[]} allTags={allTags} onChange={v=>updateField(p.id,"tags",v)} small /></td>
                    {/* DTS — respects $ / % toggle */}
                    <td style={{padding:"8px 6px",textAlign:"right",fontWeight:600,color:p.dtsD<=0?C.green:C.text,fontSize:"0.70rem"}}>{dtsDisplay}</td>
                    {/* RTS — respects $ / % toggle. >0 = risk, <=0 = free */}
                    <td style={{padding:"8px 6px",textAlign:"right",fontWeight:700,color:p.rtsD<=0?C.green:C.red,fontSize:"0.70rem"}}>{rtsDisplay}</td>
                    <td style={{padding:"8px 6px",textAlign:"right",color:C.text,fontSize:"0.70rem"}}>{p.cpN?p.sbe.toLocaleString():"—"}</td>
                    <td style={{padding:"8px 6px",textAlign:"right",fontWeight:600,color:p.sbePct>100?C.red:p.sbePct>90?C.gold:C.green,fontSize:"0.70rem"}}>{p.cpN?`${p.sbePct.toFixed(1)}%`:"—"}</td>
                    {/* P/L — respects $ / % toggle */}
                    <td style={{padding:"8px 6px",textAlign:"right",fontWeight:700,color:p.plPct>=0?C.green:C.red,fontSize:"0.70rem"}}>{plDisplay}</td>
                    <td style={{padding:"8px 6px",textAlign:"right",fontWeight:700,fontSize:"0.70rem",color:p.rMult>=2?C.green:p.rMult>=1?C.goldBright:p.rMult>=0?C.white:C.red}}>{p.epN&&p.stopN?`${p.rMult.toFixed(2)}R`:"—"}</td>
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
                    <td colSpan={16} style={{ padding:"14px 16px" }}>
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

              {/* Totals — 16 cols: Status,Tier,Symbol,Shares,AvgCost,Stop,Current,Setup,Tags,DTS,RTS,SBE,SBE%,P/L,R,Actions */}
              <tr style={{ borderTop:`2px solid ${C.border}`,background:"rgba(255,255,255,0.02)" }}>
                <td colSpan={3} style={{padding:"12px 6px",fontWeight:800,fontSize:"0.64rem",color:C.white,letterSpacing:"0.06em",textTransform:"uppercase"}}>Totals</td>
                <td style={{padding:"12px 6px",textAlign:"right",fontWeight:700,color:C.text,fontSize:"0.70rem"}}>{enriched.reduce((s,p)=>s+p.sharesN,0).toLocaleString()}</td>
                <td colSpan={5} />
                <td style={{padding:"12px 6px",textAlign:"right",fontWeight:800,fontSize:"0.72rem",color:totals.totalDtsD<=0?C.green:C.text}}>{displayMode==="$"?`$${Math.abs(totals.totalDtsD).toLocaleString(undefined,{maximumFractionDigits:0})}`:`${Math.abs(totals.avgDtsPct).toFixed(2)}%`}</td>
                <td style={{padding:"12px 6px",textAlign:"right",fontWeight:800,fontSize:"0.72rem",color:totals.totalRTS<=0?C.green:C.red}}>{displayMode==="$"?`$${Math.abs(totals.totalRTS).toLocaleString(undefined,{maximumFractionDigits:0})}`:`${totals.totalValue>0?((totals.totalRTS/totals.totalValue)*100).toFixed(2):"0.00"}%`}</td>
                <td colSpan={2} />
                <td style={{padding:"12px 6px",textAlign:"right",fontWeight:800,fontSize:"0.72rem",color:totals.totalPL>=0?C.green:C.red}}>{totals.totalPL>=0?"+":"-"}{fmt$(Math.abs(totals.totalPL))}</td>
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
function SettingsPage({ setupTypes, setSetupTypes, tags, setTags, exitReasons, setExitReasons }) {
  const [newSetup, setNewSetup] = useState("");
  const [newTag, setNewTag] = useState("");
  const [newReason, setNewReason] = useState("");

  const addItem = (list, setter, val, clear) => {
    const v = val.trim();
    if (v && !list.includes(v)) { setter([...list, v]); clear(""); }
  };
  const removeItem = (list, setter, val) => { setter(list.filter(x => x !== val)); };

  const ListManager = ({ title, description, items, onAdd, onRemove, newVal, setNewVal, placeholder }) => (
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

      {/* Profile */}
      <GlassCard style={{ padding: "24px 28px", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: "0.84rem", color: C.white, marginBottom: 16 }}>Profile</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <TextInput label="Display Name" value="Valen" onChange={() => {}} placeholder="Your name" upper={false} style={{ flex: "1 1 200px" }} />
          <TextInput label="Email" value="vc-lv@live.com" onChange={() => {}} placeholder="email@example.com" upper={false} style={{ flex: "1 1 280px" }} />
        </div>
      </GlassCard>

      {/* Setup Types */}
      <ListManager
        title="Setup Types" description="Entry strategies used in your open positions and trade journal. These appear as dropdown options everywhere."
        items={setupTypes} onAdd={() => addItem(setupTypes, setSetupTypes, newSetup, setNewSetup)} onRemove={v => removeItem(setupTypes, setSetupTypes, v)}
        newVal={newSetup} setNewVal={setNewSetup} placeholder="e.g. Flag Breakout"
      />

      {/* Tags */}
      <ListManager
        title="Tags" description="Custom labels you can attach to any trade. Use for filtering your journal by theme, catalyst, or strategy nuance."
        items={tags} onAdd={() => addItem(tags, setTags, newTag, setNewTag)} onRemove={v => removeItem(tags, setTags, v)}
        newVal={newTag} setNewVal={setNewTag} placeholder="e.g. Pre-Earnings"
      />

      {/* Exit Reasons */}
      <ListManager
        title="Exit Reasons" description="Reasons for closing a position. Shown when you sell shares from the dashboard."
        items={exitReasons} onAdd={() => addItem(exitReasons, setExitReasons, newReason, setNewReason)} onRemove={v => removeItem(exitReasons, setExitReasons, v)}
        newVal={newReason} setNewVal={setNewReason} placeholder="e.g. Gap Down"
      />
    </div>
  );
}

// ═══════════════════════════════════════
// ─── LOGIN PAGE ───
// ═══════════════════════════════════════
const ACCESS_CODE = "VIV2026"; // Change this to whatever you want to share with Skool members

function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !email.includes("@")) { setError("Enter a valid email address."); return; }
    if (code.trim().toUpperCase() !== ACCESS_CODE) { setError("Invalid access code. Check your Skool community for the code."); return; }
    setLoading(true);
    setTimeout(() => { onLogin(email.trim()); }, 600);
  };

  return (
    <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", WebkitFontSmoothing: "antialiased", color: C.text }}>
      <div style={{ width: "100%", maxWidth: 420, padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontWeight: 800, fontSize: "1.5rem", letterSpacing: "-0.03em", color: C.white, marginBottom: 8 }}>
            Valen <span style={{ color: C.gold }}>Insiders</span> Vault
          </div>
          <div style={{ fontWeight: 400, fontSize: "0.82rem", color: C.muted, lineHeight: 1.6 }}>
            Members-only trading dashboard.
          </div>
        </div>
        <GlassCard style={{ padding: "32px 28px" }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontWeight: 700, fontSize: "0.60rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 8, display: "block" }}>Email Address</label>
              <input type="email" placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "13px 16px", color: C.white, fontSize: "0.88rem", fontWeight: 500, fontFamily: font, outline: "none" }}
                onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontWeight: 700, fontSize: "0.60rem", letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 8, display: "block" }}>Access Code</label>
              <input type="text" placeholder="Enter your member code" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "13px 16px", color: C.white, fontSize: "0.88rem", fontWeight: 500, fontFamily: font, outline: "none", textTransform: "uppercase", letterSpacing: "0.08em" }}
                onFocus={e => e.target.style.borderColor = C.gold} onBlur={e => e.target.style.borderColor = C.border} />
            </div>
            {error && <div style={{ padding: "10px 14px", borderRadius: 10, background: C.redDim, border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5", fontSize: "0.74rem", fontWeight: 500, marginBottom: 16 }}>{error}</div>}
            <button type="submit" disabled={loading} style={{
              width: "100%", padding: "14px", borderRadius: 980, border: "none", cursor: loading ? "wait" : "pointer",
              background: `linear-gradient(135deg, #a06800, ${C.goldBright}, #a06800)`, color: "#000",
              fontWeight: 800, fontSize: "0.88rem", fontFamily: font, letterSpacing: "-0.01em",
              opacity: loading ? 0.7 : 1, transition: "opacity 0.2s",
            }}>{loading ? "Signing in..." : "Sign In"}</button>
          </form>
        </GlassCard>
        <div style={{ textAlign: "center", marginTop: 20, fontSize: "0.68rem", color: C.muted, lineHeight: 1.6 }}>
          Don't have an access code?<br />
          <a href="https://www.skool.com/valens-insiders-vault" target="_blank" rel="noopener noreferrer" style={{ color: C.gold, fontWeight: 600, textDecoration: "none" }}>Join the Skool community</a> to get access.
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

export default function App() {
  const screenW = useScreenWidth();
  const isMobile = screenW < 768;
  const isTablet = screenW >= 768 && screenW < 1024;

  const [user, setUser] = useState(() => {
    try { const saved = localStorage.getItem("viv_user"); return saved ? JSON.parse(saved) : null; } catch { return null; }
  });
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Single source of truth — managed in App, passed everywhere
  const [setupTypes, setSetupTypes] = useState(DEFAULT_SETUP_TYPES);
  const [tags, setTags] = useState(DEFAULT_TAGS);
  const [exitReasons, setExitReasons] = useState(DEFAULT_EXIT_REASONS);
  const [journaledTrades, setJournaledTrades] = useState([]);

  const handleJournalTrade = useCallback((trade) => { setJournaledTrades(prev => [...prev, trade]); }, []);

  const handleLogin = (email) => {
    const userData = { email, loginAt: new Date().toISOString() };
    localStorage.setItem("viv_user", JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem("viv_user");
    setUser(null);
  };

  if (!user) return <LoginPage onLogin={handleLogin} />;

  const displayName = user.email.split("@")[0];
  const sidebarW = isTablet ? 200 : 220;
  const contentPadH = isMobile ? 16 : isTablet ? 24 : 36;
  const contentPadV = isMobile ? 16 : 28;

  const pageContent = (
    <>
      {page === "dashboard" && <DashboardPage onJournalTrade={handleJournalTrade} setupTypes={setupTypes} tags={tags} exitReasons={exitReasons} />}
      {page === "tools" && <PremiumToolsPage demo={false} />}
      {page === "journal" && <TradeJournalPage journaledTrades={journaledTrades} setJournaledTrades={setJournaledTrades} setupTypes={setupTypes} tags={tags} exitReasons={exitReasons} />}
      {page === "settings" && <SettingsPage setupTypes={setupTypes} setSetupTypes={setSetupTypes} tags={tags} setTags={setTags} exitReasons={exitReasons} setExitReasons={setExitReasons} />}
    </>
  );

  // ─── MOBILE LAYOUT ───
  if (isMobile) {
    return (
      <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh", WebkitFontSmoothing: "antialiased", color: C.text, display: "flex", flexDirection: "column" }}>
        {/* Top bar */}
        <div style={{ padding: "12px 16px", background: "rgba(8,8,14,0.95)", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ fontWeight: 800, fontSize: "0.82rem", letterSpacing: "-0.01em", color: C.white }}>
            Valen <span style={{ color: C.gold }}>Insiders</span> Vault
          </div>
          <button onClick={handleLogout} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: "0.58rem", fontWeight: 600, cursor: "pointer", fontFamily: font }}>Sign Out</button>
        </div>
        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: `${contentPadV}px ${contentPadH}px`, paddingBottom: 80 }}>
          {pageContent}
        </div>
        {/* Bottom nav */}
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
    <div style={{ fontFamily: font, background: C.bg, minHeight: "100vh", display: "flex", WebkitFontSmoothing: "antialiased", color: C.text }}>
      {/* Sidebar */}
      <div style={{ width: sidebarW, minHeight: "100vh", padding: "24px 14px", background: "rgba(8,8,14,0.95)", borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, alignSelf: "flex-start" }}>
        <div style={{ fontWeight: 800, fontSize: "0.84rem", letterSpacing: "-0.01em", color: C.white, marginBottom: 24, padding: "0 8px" }}>
          Valen <span style={{ color: C.gold }}>Insiders</span> Vault
        </div>
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
          <div style={{ fontSize: "0.56rem", color: C.muted, marginBottom: 6, wordBreak: "break-all" }}>{user.email}</div>
          <button onClick={handleLogout} style={{ width: "100%", padding: "5px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.muted, fontSize: "0.58rem", fontWeight: 600, cursor: "pointer", fontFamily: font }}>Sign Out</button>
        </div>
      </div>
      {/* Main content — fluid, fills available space */}
      <div style={{ flex: 1, padding: `${contentPadV}px ${contentPadH}px`, overflowY: "auto", minWidth: 0 }}>
        {pageContent}
      </div>
    </div>
  );
}
