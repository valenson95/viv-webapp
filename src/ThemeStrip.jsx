import React from "react";
import { latestSnapshot, consistentTop } from "./themes.js";

// ─────────────────────────────────────────────────────────────
// Theme Leaders — Top-5 · 1W and Top-5 · 1M as two side-by-side tables.
// Consistent leaders (top-5 in BOTH) highlighted green. VIV glass + gold.
// ─────────────────────────────────────────────────────────────
export default function ThemeStrip({ C, font, variant }) {
  const [full, setFull] = React.useState(false);
  const snap = latestSnapshot();
  if (!snap) return null;

  // ── Pro variant: compact two-table (1W | 1M) card matching dashboard-pro mockup.
  // Same data source (themes.js snapshots); keeps the "updated <date>" note, drops
  // the full-tracker toggle / legend / guidance. Default variant is unchanged below.
  if (variant === "pro") {
    const wk = (snap.week || []).slice(0, 5);
    const mo = (snap.month || []).slice(0, 5);
    const Col = ({ title, rows }) => (
      <div>
        <h4 style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: C.muted, marginBottom: 9 }}>{title}</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {rows.map(([name, pct], i) => {
            const pos = pct >= 0;
            return (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.74rem" }}>
                <span style={{ color: C.muted, opacity: 0.65, fontWeight: 700, width: 13, flex: "none", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                <span style={{ flex: 1, color: "rgba(255,255,255,0.9)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                <span style={{ color: pos ? C.green : C.red, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{pos ? "+" : ""}{pct.toFixed(2)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    );
    return (
      <div style={{ fontFamily: font, position: "relative", background: C.glass, border: `1px solid ${C.border}`, borderRadius: 16, padding: "18px 20px", overflow: "hidden",
        backdropFilter: "blur(28px) saturate(160%)", WebkitBackdropFilter: "blur(28px) saturate(160%)" }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.05), transparent 55%)", pointerEvents: "none" }} />
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 11, marginBottom: 14, borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.13em", textTransform: "uppercase", color: C.muted }}>Theme Leaders</span>
            <span style={{ marginLeft: "auto", fontSize: "0.62rem", color: C.goldBright || C.gold, fontWeight: 700 }}>updated {snap.date}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
            <Col title="1 Week" rows={wk} />
            <Col title="1 Month" rows={mo} />
          </div>
        </div>
      </div>
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
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: font }}>
        <tbody>
          {rows.map(([name, pct], i) => {
            const g = both.has(name), pos = pct >= 0;
            return (
              <tr key={name} style={{ borderTop: i ? "1px solid rgba(255,255,255,0.05)" : "none", background: g ? "rgba(34,197,94,0.05)" : "transparent" }}>
                <td style={{ padding: "9px 6px 9px 14px", width: 26, color: C.muted, fontSize: "0.72rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{i + 1}</td>
                <td style={{ padding: "9px 6px", fontSize: "0.82rem", fontWeight: g ? 800 : 600, color: g ? C.green : "rgba(255,255,255,0.9)" }}>
                  {g && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: C.green, marginRight: 7, boxShadow: "0 0 7px rgba(34,197,94,0.6)" }} />}{name}
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
          <b style={{ color: C.green }}>Green</b> = a top-5 leader in <b>both</b> timeframes — the strongest to trade with. Your positions below are tagged <b style={{ color: C.green }}>🟢 in-theme</b> / <b style={{ color: C.red }}>🔴 off-theme</b> against the tracker <b style={{ color: "rgba(255,255,255,0.82)" }}>as of each entry date</b>.
        </div>
      </div>
    </div>
  );
}
