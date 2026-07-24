import React from "react";
import { BURST_LOG } from "./burstLog-data.js";

// ─────────────────────────────────────────────────────────────
// 🔥 BURST LOG — admin-only daily record of 20%/5d (+50%/40d) movers.
// The read Valen wants per day (2026-07-24): WHAT SIZE (cap profile),
// WHERE (theme/sector mix), and IS IT IN-THEME (vs the tracker gate at
// that date). Gauge = froth thermometer (study floor). Forward returns
// stay as columns in the drill-down only. Educational, not advice.
// ─────────────────────────────────────────────────────────────

const gaugeColor = (n, C) =>
  n >= 100 ? C.red : n >= 60 ? "#e8a33d" : n < 10 ? "rgba(255,255,255,0.35)" : C.green;
const gaugeLabel = (n) =>
  n >= 100 ? "FROTH — sell into strength, don't chase" :
  n >= 60 ? "hot tape — late-cycle caution" :
  n < 10 ? "dead tape — bursts lack follow-through" : "normal";
const CAP_ORDER = ["<$500M", "$500M–2B", "$2–10B", ">$10B", "unknown"];
const fmtCap = (b) => b == null ? "—" : b >= 1 ? "$" + b.toFixed(1) + "B" : "$" + Math.round(b * 1000) + "M";

function Chip({ children, color, C }) {
  return <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 999, fontSize: "0.62rem", fontWeight: 800, letterSpacing: "0.04em", background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, color: color || "rgba(255,255,255,0.8)" }}>{children}</span>;
}

export default function BurstLog({ C, font }) {
  const [open, setOpen] = React.useState(null);
  const [cheat, setCheat] = React.useState(false);
  const D = BURST_LOG || {};
  const sessions = D.sessions || [];
  const s0 = sessions[0];
  const small = { fontSize: "0.62rem", color: C.muted };
  const th = { padding: "8px 10px", fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, textAlign: "right", whiteSpace: "nowrap" };
  const td = { padding: "9px 10px", fontSize: "0.76rem", fontVariantNumeric: "tabular-nums", textAlign: "right", whiteSpace: "nowrap" };

  if (!sessions.length) return <div style={{ fontFamily: font, color: C.muted, padding: 30 }}>Burst Log has no data yet — run <code>scripts/burst-log.mjs</code>.</div>;

  const gateBadge = (r) => r.gate == null
    ? <span title="theme not mapped for this ticker" style={{ color: C.muted }}>⚪</span>
    : r.gate === 1
      ? <span title="its theme is in the tracker top-5 gate (1W or 1M) as of this date" style={{ color: C.green }}>🟢</span>
      : <span title="its theme is OUTSIDE the tracker top-5 gate as of this date" style={{ color: C.red }}>🔴</span>;

  const summaryLine = (s) => {
    const sm = s.summary || {};
    const b = sm.capBuckets || {};
    return CAP_ORDER.filter((k) => b[k]).map((k) => `${k}: ${b[k]}`).join(" · ");
  };

  return (
    <div style={{ fontFamily: font, paddingBottom: 40 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", margin: "18px 0 4px" }}>
        <span style={{ fontSize: "1.15rem", fontWeight: 800, color: "rgba(255,255,255,0.95)" }}>🔥 Burst Log</span>
        <span style={small}>daily 20%-in-5-days (and 50%-in-40-days) movers — size · sector · theme fit</span>
        <span style={{ marginLeft: "auto", fontSize: "0.64rem", fontWeight: 700, color: C.goldBright || C.gold, fontVariantNumeric: "tabular-nums" }}>
          as of {D.asof} close · refreshed {D.updated}
        </span>
      </div>
      <div style={{ ...small, lineHeight: 1.55, maxWidth: 820, marginBottom: 14 }}>
        <b style={{ color: "rgba(255,255,255,0.8)" }}>Gauge</b> = froth thermometer (share-volume floor, count only).
        <b style={{ color: "rgba(255,255,255,0.8)" }}> Tradeable</b> = names above the ≥$20M avg dollar-volume floor.
        Per name: market cap at that session's close, its theme, and 🟢/🔴 whether that theme sat inside the
        tracker top-5 gate <i>on that date</i> (⚪ = ticker not mapped to a theme). Unadjusted prices — ⚠ rows may be splits.
      </div>

      {/* latest-session read */}
      {s0.summary && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
          <Chip C={C} color={gaugeColor(s0.gauge.up20, C)}>GAUGE {s0.gauge.up20} · {gaugeLabel(s0.gauge.up20)}</Chip>
          <Chip C={C} color={C.gold}>tradeable {s0.rows.length}</Chip>
          <Chip C={C}>median cap {fmtCap(s0.summary.medCapB)}</Chip>
          <Chip C={C}>{summaryLine(s0)}</Chip>
          <Chip C={C} color={s0.summary.themed ? (s0.summary.inTheme / Math.max(1, s0.summary.themed) >= 0.5 ? C.green : C.red) : undefined}>
            in-theme {s0.summary.inTheme}/{s0.summary.themed}{s0.summary.unmapped ? ` (+${s0.summary.unmapped} unmapped)` : ""}
          </Chip>
          <button onClick={() => setCheat(c => !c)} style={{ background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 8, color: C.muted, fontFamily: font, fontSize: "0.62rem", fontWeight: 700, padding: "3px 10px", cursor: "pointer" }}>{cheat ? "hide levels ▴" : "levels ▾"}</button>
        </div>
      )}

      {/* levels cheat card */}
      {cheat && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", marginBottom: 14, maxWidth: 780 }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <tbody>
              {[
                ["Gauge single digits", "dead tape — bursts have no follow-through; size down"],
                ["Gauge ~10–50", "normal market — trade the plan"],
                ["Gauge 60–99", "hot tape — late-cycle caution, tighten stops"],
                ["Gauge 100–200", "euphoria — historically near peaks; sell strength, no chasing (June-2026 peak printed 120)"],
                ["Small-cap dominated day", "speculative tape — his 50%-study common element; strongest burst regime"],
                ["Mega-caps appearing", "rested leaders re-igniting — usually the most tradeable flags"],
                ["In-theme % high", "bursts confirm the tracker gate — conviction up on in-theme setups"],
                ["In-theme % low", "bursts are happening OUTSIDE the gate — rotation brewing; re-read the tracker"],
              ].map(([k, v], i) => (
                <tr key={i} style={{ borderTop: i ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                  <td style={{ padding: "7px 10px 7px 0", fontSize: "0.7rem", fontWeight: 800, color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap" }}>{k}</td>
                  <td style={{ padding: "7px 0", fontSize: "0.7rem", color: C.muted, lineHeight: 1.5 }}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* daily rows */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", background: "rgba(255,255,255,0.02)" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 820 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ ...th, textAlign: "left" }}>Session</th>
                <th style={th} title="STUDY-floor count of stocks up 20%+ in 5 days — the froth gauge">Gauge ↑20%</th>
                <th style={th} title="STUDY-floor count down 20%+ in 5 days">↓20%</th>
                <th style={th} title="TRADE-floor names (≥$20M avg $ vol)">Tradeable</th>
                <th style={th} title="median market cap of the tradeable names">Median cap</th>
                <th style={th} title="tradeable names whose theme sat in the tracker top-5 gate that date">In-theme</th>
                <th style={{ ...th, textAlign: "left" }}>Theme mix (tradeable)</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const sm = s.summary || {};
                const themes = {};
                s.rows.forEach((r) => { if (r.theme) themes[r.theme] = (themes[r.theme] || 0) + 1; });
                const top = Object.entries(themes).sort((a, b) => b[1] - a[1]).slice(0, 4);
                const isOpen = open === s.date;
                const pctIn = sm.themed ? Math.round((sm.inTheme / sm.themed) * 100) : null;
                return (
                  <React.Fragment key={s.date}>
                    <tr onClick={() => setOpen(isOpen ? null : s.date)} style={{ cursor: "pointer", borderTop: "1px solid rgba(255,255,255,0.045)", background: isOpen ? "rgba(201,152,42,0.05)" : "transparent" }}>
                      <td style={{ ...td, textAlign: "left", fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{s.date} <span style={{ color: C.muted, fontSize: "0.6rem" }}>{isOpen ? "▴" : "▾"}</span></td>
                      <td style={{ ...td, fontWeight: 800, color: gaugeColor(s.gauge.up20, C) }}>{s.gauge.up20}</td>
                      <td style={{ ...td, color: s.gauge.down20 > s.gauge.up20 ? C.red : C.muted }}>{s.gauge.down20}</td>
                      <td style={{ ...td, fontWeight: 700, color: C.gold }}>{s.rows.length}</td>
                      <td style={{ ...td, color: "rgba(255,255,255,0.8)" }}>{fmtCap(sm.medCapB)}</td>
                      <td style={{ ...td, fontWeight: 700, color: pctIn == null ? C.muted : pctIn >= 50 ? C.green : C.red }}>{pctIn == null ? "—" : `${sm.inTheme}/${sm.themed} (${pctIn}%)`}</td>
                      <td style={{ ...td, textAlign: "left" }}>
                        {top.length ? top.map(([name, n]) => <span key={name} style={{ marginRight: 8, fontSize: "0.68rem", color: "rgba(255,255,255,0.75)" }}>{name} <b style={{ color: C.gold }}>{n}</b></span>) : <span style={{ color: C.muted, fontSize: "0.66rem" }}>—</span>}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={7} style={{ padding: "4px 14px 16px", background: "rgba(0,0,0,0.25)" }}>
                          {/* cap-bucket strip */}
                          <div style={{ ...small, margin: "8px 0 2px" }}>Cap profile: <b style={{ color: "rgba(255,255,255,0.8)" }}>{summaryLine(s) || "—"}</b>{sm.unmapped ? ` · ${sm.unmapped} theme-unmapped` : ""}</div>
                          <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 8 }}>
                            <thead>
                              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                {["#", "Ticker", "5d move", "Cap", "Close", "Avg $vol", "", "Theme / SIC industry", "+3d", "+5d"].map((h, i) => (
                                  <th key={h + i} style={{ ...th, textAlign: i < 2 || i === 6 || i === 7 ? "left" : "right", padding: "6px 8px" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {s.rows.map((r, i) => (
                                <tr key={r.t} style={{ borderTop: i ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                                  <td style={{ ...td, textAlign: "left", color: C.muted, padding: "6px 8px" }}>{i + 1}</td>
                                  <td style={{ ...td, textAlign: "left", fontWeight: 800, color: "rgba(255,255,255,0.92)", padding: "6px 8px" }}>{r.t}{r.flag && <span title="unadjusted data — possible split, verify" style={{ color: "#e8a33d", marginLeft: 5 }}>⚠</span>}</td>
                                  <td style={{ ...td, color: C.green, fontWeight: 700, padding: "6px 8px" }}>+{r.pct}%</td>
                                  <td style={{ ...td, color: "rgba(255,255,255,0.85)", fontWeight: 700, padding: "6px 8px" }}>{fmtCap(r.capB)}</td>
                                  <td style={{ ...td, color: "rgba(255,255,255,0.7)", padding: "6px 8px" }}>${r.c}</td>
                                  <td style={{ ...td, color: C.muted, padding: "6px 8px" }}>${r.dvM}M</td>
                                  <td style={{ ...td, textAlign: "left", padding: "6px 4px" }}>{gateBadge(r)}</td>
                                  <td style={{ ...td, textAlign: "left", color: r.theme ? "rgba(255,255,255,0.78)" : C.muted, padding: "6px 8px", fontSize: "0.68rem" }}>{r.theme || (r.sic ? <i title="SIC industry (not a DeepVue theme)">{r.sic}</i> : "—")}</td>
                                  <td style={{ ...td, padding: "6px 8px", color: r.f3 == null ? C.muted : r.f3 >= 0 ? C.green : C.red }}>{r.f3 == null ? "—" : (r.f3 >= 0 ? "+" : "") + r.f3 + "%"}</td>
                                  <td style={{ ...td, padding: "6px 8px", color: r.f5 == null ? C.muted : r.f5 >= 0 ? C.green : C.red }}>{r.f5 == null ? "—" : (r.f5 >= 0 ? "+" : "") + r.f5 + "%"}</td>
                                </tr>
                              ))}
                              {!s.rows.length && <tr><td colSpan={10} style={{ ...td, textAlign: "left", color: C.muted }}>No tradeable-floor names this session.</td></tr>}
                            </tbody>
                          </table>
                          {/* 50% club */}
                          {s.rows50.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                              <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.gold, marginBottom: 6 }}>50% in 40 days (tradeable · {s.rows50.length})</div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                {s.rows50.map((r) => (
                                  <span key={r.t} title={`+${r.pct}% / 40d · ${fmtCap(r.capB)} · ${r.theme || r.sic || "—"}`} style={{ fontSize: "0.68rem", fontWeight: 700, color: "rgba(255,255,255,0.85)", background: "rgba(255,255,255,0.05)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "3px 8px" }}>{r.t} <span style={{ color: C.green }}>+{r.pct}%</span> {r.gate === 1 ? "🟢" : r.gate === 0 ? "🔴" : ""}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* gauge audit */}
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>Gauge audit — all {s.gaugeUp.length} study-floor ↑20% names</div>
                            <div style={{ fontSize: "0.64rem", color: "rgba(255,255,255,0.55)", lineHeight: 1.9, wordBreak: "break-word" }}>{s.gaugeUp.join(" · ") || "—"}</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ ...small, marginTop: 10, lineHeight: 1.5 }}>
        Cap = shares outstanding × that session&rsquo;s close (weekly-refreshed shares; blank = not available). Theme = the webapp&rsquo;s
        DeepVue-derived map; <i>italic</i> = SIC industry fallback, ⚪ = unmapped. Study floor ≥ {(D.floors?.studyShares || 100000).toLocaleString()} sh/day ·
        Trade floor ≥ ${((D.floors?.tradeDvol || 2e7) / 1e6).toFixed(0)}M/day · close ≥ ${D.floors?.price || 5}. Educational, not advice.
      </div>
    </div>
  );
}
