import React from "react";
import { createPortal } from "react-dom";
import { latestSnapshot, consistentTop } from "./themes.js";
import { THEME_CONSTITUENTS } from "./themeConstituents-data.js";
import { LensCamera } from "./capture.jsx";

// ─────────────────────────────────────────────────────────────
// Theme Leaders — Top-5 · 1W and Top-5 · 1M as two side-by-side tables.
// Consistent leaders (top-5 in BOTH) highlighted green. VIV glass + gold.
// ─────────────────────────────────────────────────────────────

// Magnitude-bar colors — GREEN positive / RED negative at low alpha (VIV palette).
const CBAR_POS = "rgba(34,197,94,0.30)";
const CBAR_NEG = "rgba(239,68,68,0.30)";

// A clickable theme name — subtle gold underline on hover → opens the constituent
// popup. stopPropagation so it never triggers a parent card click / expander toggle.
// MODULE scope (never nested in a component — past bug).
function ThemeName({ name, onOpen, C, prefixNode, style }) {
  const [hov, setHov] = React.useState(false);
  return (
    <span
      onClick={(e) => { e.stopPropagation(); onOpen(name); }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title="View the stocks in this theme"
      style={{ cursor: "pointer", textDecoration: hov ? "underline" : "none", textDecorationColor: C.gold, textUnderlineOffset: 3, textDecorationThickness: "1.5px", ...style }}
    >
      {prefixNode}{name}
    </span>
  );
}

// Constituent popup — lists a theme's stocks in the source's own 1M-desc order:
// rank · ticker · magnitude bar · % (right-aligned). Portal to body, z-1320,
// blurred backdrop, backdrop-click / × close. Honest missing + partial states.
// Divs only (no <table>) so mobile never card-izes the rows. MODULE scope.
function ThemeConstituentsPopup({ theme, themePct, onClose, C, font }) {
  if (!theme) return null;
  const data = THEME_CONSTITUENTS || {};
  const asof = data.asof || "—";
  const isMissing = Array.isArray(data.missing) && data.missing.includes(theme);
  const entry = data.byTheme ? data.byTheme[theme] : null;
  const rows = entry && Array.isArray(entry.rows) ? entry.rows : [];
  const shown = rows.length;
  const total = entry && typeof entry.total === "number" ? entry.total : null;
  const partial = !!(entry && entry.partial);
  const cut = (total != null && total > shown) || partial;
  const countLine = shown
    ? (cut
        ? `top ${shown} of ${total != null ? total : shown} — list partially captured, refreshed on the next drop`
        : `${total != null ? total : shown} stocks`)
    : "";
  // Scale bar widths to the theme's own largest |%| (source-style relative bars).
  const maxAbs = Math.max(0.0001, ...rows.filter(r => r[1] != null && isFinite(r[1])).map(r => Math.abs(r[1])));
  const label = { fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: C.gold };
  const pctPos = themePct != null && themePct >= 0;

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1320, background: "rgba(4,4,8,0.6)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", overflowY: "auto", padding: "40px 16px", fontFamily: font }}>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: 460, margin: "0 auto", background: "rgba(255,255,255,0.042)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, backdropFilter: "blur(24px) saturate(150%)", WebkitBackdropFilter: "blur(24px) saturate(150%)", boxShadow: "0 24px 70px rgba(0,0,0,0.6)", overflow: "hidden" }}>
        {/* header */}
        <div style={{ padding: "16px 18px 13px", borderBottom: `1px solid ${C.border}`, background: "linear-gradient(135deg,rgba(255,255,255,0.05),transparent 60%)" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9, minWidth: 0 }}>
              <span style={{ fontSize: "1.05rem", fontWeight: 800, color: "rgba(255,255,255,0.96)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{theme}</span>
              {themePct != null && <span style={{ fontSize: "0.78rem", fontWeight: 800, color: pctPos ? C.green : C.red, fontVariantNumeric: "tabular-nums" }}>{pctPos ? "+" : ""}{themePct.toFixed(2)}%</span>}
            </div>
            <button onClick={onClose} title="Close" style={{ flex: "none", width: 26, height: 26, borderRadius: 8, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.03)", color: C.muted, fontSize: "0.9rem", cursor: "pointer", lineHeight: 1, fontFamily: font }}>×</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 7 }}>
            <span style={label}>{countLine || "Constituents"}</span>
            <span style={{ fontSize: "0.6rem", fontWeight: 700, color: C.goldBright || C.gold, fontVariantNumeric: "tabular-nums" }}>as of {asof} · 1-month view</span>
          </div>
          <div style={{ marginTop: 5, fontSize: "0.6rem", color: "rgba(255,255,255,0.42)", lineHeight: 1.5 }}>
            Ranked by 1-month move, strongest first. Educational, not advice.
          </div>
        </div>
        {/* body */}
        {(isMissing || shown === 0) ? (
          <div style={{ padding: "22px 20px", fontSize: "0.76rem", lineHeight: 1.6, color: C.muted }}>
            Constituent list not captured yet — it&rsquo;ll appear after the next data drop.
          </div>
        ) : (
          <div style={{ padding: "6px 0 8px", maxHeight: "62vh", overflowY: "auto" }}>
            {rows.map(([tk, pct], i) => {
              const has = pct != null && isFinite(pct);
              const pos = has && pct >= 0;
              const frac = has ? Math.max(0, Math.min(1, Math.abs(pct) / maxAbs)) : 0;
              return (
                <div key={tk + i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 18px", borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.045)" : "none" }}>
                  <span style={{ flex: "none", width: 22, textAlign: "right", fontSize: "0.62rem", fontWeight: 700, color: "rgba(255,255,255,0.35)", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                  <span style={{ flex: "none", width: 64, fontSize: "0.76rem", fontWeight: 800, color: "rgba(255,255,255,0.94)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tk}</span>
                  <span style={{ flex: 1, minWidth: 40, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.05)", overflow: "hidden", display: "block" }}>
                    {has && frac > 0 && <span style={{ display: "block", height: "100%", width: (frac * 100) + "%", background: pos ? CBAR_POS : CBAR_NEG, borderRadius: 4 }} />}
                  </span>
                  <span style={{ flex: "none", width: 58, textAlign: "right", fontSize: "0.72rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: !has ? C.muted : pos ? C.green : C.red }}>{!has ? "—" : (pos ? "+" : "") + pct.toFixed(2) + "%"}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>, document.body);
}
export default function ThemeStrip({ C, font, variant }) {
  const [full, setFull] = React.useState(false);
  const [popup, setPopup] = React.useState(false);
  const [activeTheme, setActiveTheme] = React.useState(null); // theme whose constituents popup is open
  const cardRef = React.useRef(null);
  const popRef = React.useRef(null);
  // Close the expanded popup on Escape (listener only while open).
  React.useEffect(() => {
    if (!popup) return;
    const onKey = (e) => { if (e.key === "Escape") setPopup(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popup]);
  const snap = latestSnapshot();
  if (!snap) return null;

  // The theme's own latest 1M % (for the constituent-popup header), looked up from
  // the latest snapshot's month list — omitted from the header if not present.
  const moMap = Object.fromEntries((snap.month || []).map(([n, p]) => [n, p]));
  const themePctOf = (name) => (name in moMap ? moMap[name] : null);
  const constituentPopup = (
    <ThemeConstituentsPopup
      theme={activeTheme}
      themePct={activeTheme ? themePctOf(activeTheme) : null}
      onClose={() => setActiveTheme(null)}
      C={C}
      font={font}
    />
  );

  // ── Pro variant: compact two-table (1W | 1M) card matching dashboard-pro mockup.
  // Same data source (themes.js snapshots); keeps the "updated <date>" note, drops
  // the full-tracker toggle / legend / guidance. Default variant is unchanged below.
  if (variant === "pro") {
    const wkRows = snap.week || [];
    const moRows = snap.month || [];
    // Since Open (intraday ex-gap) — only recent snapshots carry it; the popup grows a
    // third column when present, mini card stays 1W/1M only (Valen 2026-07-24).
    const dayRows = snap.day || [];
    const wkTop = wkRows.slice(0, 5);
    const moTop = moRows.slice(0, 5);
    // Weakest = bottom-5, worst first.
    const wkBot = wkRows.slice(-5).reverse();
    const moBot = moRows.slice(-5).reverse();
    // Shared column renderer — colors each % by sign (green ≥ 0, red < 0).
    const Col = ({ title, rows, size }) => {
      const fs = size === "lg" ? "0.9rem" : "0.74rem";
      return (
        <div>
          <h4 style={{ fontSize: size === "lg" ? "0.66rem" : "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.muted, marginBottom: 9 }}>{title}</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: size === "lg" ? 9 : 7 }}>
            {rows.map(([name, pct], i) => {
              const pos = pct >= 0;
              return (
                <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: fs }}>
                  <span style={{ color: C.muted, opacity: 0.65, fontWeight: 700, width: 15, flex: "none", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                  <ThemeName name={name} onOpen={setActiveTheme} C={C} style={{ flex: 1, color: "rgba(255,255,255,0.9)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} />
                  <span style={{ color: pos ? C.green : C.red, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{pos ? "+" : ""}{pct.toFixed(2)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    };
    const microLabel = (txt) => (
      <div style={{ fontSize: "0.55rem", fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted, opacity: 0.8 }}>{txt}</div>
    );
    const divider = <div style={{ height: 1, background: C.border, margin: "14px 0" }} />;
    return (
      <>
        <div
          ref={cardRef}
          onClick={() => setPopup(true)}
          title="Click to expand"
          style={{ fontFamily: font, position: "relative", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 16, padding: "18px 20px", overflow: "hidden", cursor: "pointer",
            backdropFilter: "blur(28px) saturate(160%)", WebkitBackdropFilter: "blur(28px) saturate(160%)" }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.05), transparent 55%)", pointerEvents: "none" }} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 11, marginBottom: 14, borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
              <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: C.muted }}>Theme Leaders</span>
              <LensCamera getEl={() => cardRef.current} name="theme-leaders" C={C} style={{ marginLeft: 6 }} />
              <span style={{ marginLeft: "auto", fontSize: "0.62rem", color: C.goldBright || C.gold, fontWeight: 700 }}>updated {snap.date}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              <Col title="1 Week" rows={wkTop} />
              <Col title="1 Month" rows={moTop} />
            </div>
            {divider}
            <div style={{ marginBottom: 11 }}>{microLabel("Weakest")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              <Col title="1 Week · Weakest" rows={wkBot} />
              <Col title="1 Month · Weakest" rows={moBot} />
            </div>
          </div>
        </div>
        {popup && (
          <div
            onClick={() => setPopup(false)}
            style={{ position: "fixed", inset: 0, zIndex: 1250, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
              background: "rgba(4,4,8,0.55)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
            <div ref={popRef} style={{ fontFamily: font, position: "relative", width: dayRows.length ? "min(94vw, 1160px)" : "min(92vw, 860px)", maxHeight: "86vh", overflowY: "auto", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 18, padding: "24px 26px", overflowX: "hidden",
              backdropFilter: "blur(28px) saturate(160%)", WebkitBackdropFilter: "blur(28px) saturate(160%)", boxShadow: "0 30px 80px rgba(0,0,0,0.6)" }}>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.05), transparent 55%)", pointerEvents: "none" }} />
              <div style={{ position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 13, marginBottom: 6, borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.82rem", fontWeight: 800, letterSpacing: "0.02em", color: "rgba(255,255,255,0.95)" }}>Theme Leaders — updated {snap.date}</span>
                  <span onClick={e => e.stopPropagation()} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 10 }}>
                    <LensCamera getEl={() => popRef.current} name="theme-leaders-full" C={C} />
                    <span style={{ fontSize: "0.6rem", color: C.muted, opacity: 0.75, fontWeight: 600 }}>click anywhere to close</span>
                  </span>
                </div>
                {dayRows.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: "0.64rem", color: C.muted, lineHeight: 1.5 }}>
                    <b style={{ color: "rgba(255,255,255,0.82)" }}>Since Open</b> = the latest session&rsquo;s move <i>excluding the opening gap</i> — what buyers actually did during the day.
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))", gap: 24, marginTop: 14 }}>
                  {dayRows.length > 0 && <Col title={`Since Open (${dayRows.length})`} rows={dayRows} size="lg" />}
                  <Col title={`1 Week (${wkRows.length})`} rows={wkRows} size="lg" />
                  <Col title={`1 Month (${moRows.length})`} rows={moRows} size="lg" />
                </div>
              </div>
            </div>
          </div>
        )}
        {constituentPopup}
      </>
    );
  }

  const both = new Set(consistentTop());
  const week = full ? (snap.week || []) : (snap.week || []).slice(0, 5);
  const month = full ? (snap.month || []) : (snap.month || []).slice(0, 5);

  const Table = ({ title, rows }) => (
    <div style={{ background: "rgba(255,255,255,0.025)", border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "9px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold }}>{title}</span>
        <span style={{ fontSize: "0.58rem", color: C.muted }}>DeepVue</span>
      </div>
      <table className="minitable" style={{ width: "100%", borderCollapse: "collapse", fontFamily: font }}>
        <tbody>
          {rows.map(([name, pct], i) => {
            const g = both.has(name), pos = pct >= 0;
            return (
              <tr key={name} style={{ borderTop: i ? "1px solid rgba(255,255,255,0.05)" : "none", background: g ? "rgba(34,197,94,0.05)" : "transparent" }}>
                <td style={{ padding: "9px 6px 9px 14px", width: 26, color: C.muted, fontSize: "0.72rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{i + 1}</td>
                <td style={{ padding: "9px 6px", fontSize: "0.82rem", fontWeight: g ? 800 : 600, color: g ? C.green : "rgba(255,255,255,0.9)" }}>
                  <ThemeName name={name} onOpen={setActiveTheme} C={C} prefixNode={g && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: C.green, marginRight: 7, boxShadow: "0 0 7px rgba(34,197,94,0.6)" }} />} />
                </td>
                <td style={{ padding: "9px 14px 9px 6px", textAlign: "right", fontSize: "0.78rem", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: pos ? C.green : C.red }}>{pos ? "+" : ""}{pct.toFixed(2)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div style={{ fontFamily: font, background: C.glass, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 20px", marginTop: 20, marginBottom: 16,
      backdropFilter: "blur(28px) saturate(160%)", WebkitBackdropFilter: "blur(28px) saturate(160%)", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.045) 0%, transparent 55%)", pointerEvents: "none" }} />
      <div style={{ position: "relative" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.64rem", fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: C.gold }}>Theme Leaders</span>
          <span style={{ height: 3, width: 3, borderRadius: "50%", background: C.muted, opacity: 0.5 }} />
          <span style={{ fontSize: "0.68rem", color: C.goldBright || C.gold, fontWeight: 700 }}>updated {snap.date}</span>
          <span style={{ marginLeft: "auto", fontSize: "0.66rem", color: C.muted, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.green }} /> leads BOTH 1W &amp; 1M
          </span>
          <button onClick={() => setFull(f => !f)} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontFamily: font, fontSize: "0.64rem", fontWeight: 700, padding: "4px 10px", cursor: "pointer" }}>
            {full ? "Top 5 only ▴" : "Full tracker ▾"}
          </button>
        </div>
        {/* two tables, same row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
          <Table title="Top 5 · 1 Week" rows={week} />
          <Table title="Top 5 · 1 Month" rows={month} />
        </div>
        {/* guidance */}
        <div style={{ marginTop: 13, fontSize: "0.7rem", color: C.muted, lineHeight: 1.5 }}>
          <b style={{ color: C.green }}>Green</b> = a top-5 leader in <b>both</b> timeframes — the strongest to trade with. Your positions below are tagged <b style={{ color: C.green }}>🟢 in-theme</b> / <b style={{ color: C.red }}>🔴 off-theme</b> against the tracker <b style={{ color: "rgba(255,255,255,0.82)" }}>as of each entry date</b>. Tap any theme name to see its stocks.
        </div>
      </div>
      {constituentPopup}
    </div>
  );
}
