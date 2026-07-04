import React, { useState } from "react";
import { latestSnapshot, top5, consistentTop } from "./themes.js";

// ─────────────────────────────────────────────────────────────
// Theme Tracker — the DeepVue leaderboard, VIV-branded.
// Shows the ranked sectors (1W / 1M / Today) with the top-5 highlighted,
// and calls out the CONSISTENT leaders (top-5 in BOTH 1W and 1M).
// Data = Valen's DeepVue input in src/themes.js (updated in AI-OS).
// ─────────────────────────────────────────────────────────────

const TFS = [{ k: "week", lbl: "1W" }, { k: "month", lbl: "1M" }, { k: "day", lbl: "Today" }];

export default function ThemeTracker({ C, font }) {
  const [tf, setTf] = useState("month");
  const snap = latestSnapshot();
  if (!snap) return null;
  const list = snap[tf] || [];
  const maxAbs = Math.max(1, ...list.map(([, v]) => Math.abs(v)));
  const t5w = new Set(top5("week")), t5m = new Set(top5("month")), t5 = new Set(top5(tf));
  const consistent = consistentTop();

  const tbtn = (k, lbl) => (
    <button key={k} onClick={() => setTf(k)} style={{ background: tf === k ? C.gold : "transparent", color: tf === k ? "#1a1206" : C.muted, border: "none", borderRadius: 6, padding: "5px 12px", fontFamily: font, fontSize: "0.74rem", fontWeight: 700, cursor: "pointer" }}>{lbl}</button>
  );

  return (
    <div style={{ fontFamily: font }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold }}>DeepVue snapshot · {snap.date}</div>
        <div style={{ marginLeft: "auto", display: "flex", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 8, padding: 2 }}>{TFS.map(x => tbtn(x.k, x.lbl))}</div>
      </div>

      {/* consistent leaders callout */}
      <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.22)", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
        <div style={{ fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>🟢 Consistent leaders — top-5 in BOTH 1W &amp; 1M (trade with these)</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {consistent.length ? consistent.map(t => <span key={t} style={{ padding: "5px 12px", borderRadius: 980, fontSize: "0.74rem", fontWeight: 800, background: "var(--greenDim)", border: "1px solid rgba(34,197,94,0.3)", color: C.green }}>{t}</span>)
            : <span style={{ color: C.muted, fontSize: "0.78rem" }}>No overlap between 1W and 1M top-5 this snapshot.</span>}
        </div>
        <div style={{ display: "flex", gap: 24, marginTop: 12, flexWrap: "wrap", fontSize: "0.72rem" }}>
          <div><span style={{ color: C.muted }}>1W top-5: </span><b style={{ color: "#fff" }}>{top5("week").join(" · ")}</b></div>
          <div><span style={{ color: C.muted }}>1M top-5: </span><b style={{ color: "#fff" }}>{top5("month").join(" · ")}</b></div>
        </div>
      </div>

      {/* ranked bar list (DeepVue style) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {list.map(([name, v]) => {
          const pos = v >= 0, inTop = t5.has(name), w = (Math.abs(v) / maxAbs) * 50;
          return (
            <div key={name} style={{ display: "grid", gridTemplateColumns: "148px 1fr 64px", alignItems: "center", gap: 8, padding: "3px 0" }}>
              <div style={{ fontSize: "0.76rem", fontWeight: inTop ? 800 : 600, color: inTop ? C.goldBright : "rgba(255,255,255,0.82)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {inTop && <span style={{ color: C.green, marginRight: 4 }}>●</span>}{name}
              </div>
              <div style={{ position: "relative", height: 16, background: "rgba(255,255,255,0.035)", borderRadius: 4 }}>
                <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.12)" }} />
                <div style={{ position: "absolute", top: 2, bottom: 2, borderRadius: 3, background: pos ? (inTop ? C.green : "rgba(59,130,246,0.75)") : "rgba(236,72,153,0.7)", ...(pos ? { left: "50%", width: w + "%" } : { right: "50%", width: w + "%" }) }} />
              </div>
              <div style={{ textAlign: "right", fontSize: "0.74rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: pos ? C.green : C.red }}>{pos ? "+" : ""}{v.toFixed(2)}%</div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 12, fontSize: "0.7rem", color: C.muted, lineHeight: 1.5 }}>
        Your positions &amp; trades are tagged <b style={{ color: C.green }}>🟢 in-theme</b> / <b style={{ color: C.red }}>🔴 off-theme</b> against this tracker <b>as of each trade's entry date</b>. Hover any theme tag for the ranking. Updated from your DeepVue charts in AI-OS.
      </div>
    </div>
  );
}
