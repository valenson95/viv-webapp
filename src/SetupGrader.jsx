import React, { useState } from "react";

// ══════════════════════════════════════════════════════════════════
// SETUP GRADER — Premium Tools sub-tab. 5-star A+ breakout/continuation
// grader. Tick what's true → per-section pass counts + an overall ★ score.
// ★-maker = confluence factor: the 5th star (A+) only unlocks when they stack.
// Member-facing: no mentor/vendor brand names — VIV's own method.
// ══════════════════════════════════════════════════════════════════

const SECTIONS = [
  {
    title: "Leadership / Stock Selection",
    items: [
      { c: "Relative strength — top-tier", star: true,
        s: "The stock is beating the market. Confirm it with an IBD RS Score (90+ is strong) or its price % change vs SPY/QQQ over 1/3/6 months — and its moving averages are rising faster (steeper) than the index's. Leaders go up more, and fall less, than the market." },
      { c: "ADR% ≥ 4–5%",
        s: "Average Daily Range of at least 4–5% — the stock moves enough each day that a few good days deliver multiple R." },
      { c: "In-theme leader", star: true,
        s: "It sits in a sector or group that's currently leading the market — money is actively rotating into its theme, not out of it." },
      { c: "Liquid enough — ≥ $50M / 20 days",
        s: "At least $50M average dollar volume over the last 20 days (dollar volume = price × shares traded). You can size in and out without moving the stock." },
      { c: "Above rising 10 & 20-day MA",
        s: "Price is above both the 10- and 20-day moving averages, and both are sloping up — the trend is clearly intact." },
    ],
  },
  {
    title: "Prior Move",
    items: [
      { c: "Big prior thrust", star: true,
        s: "A strong advance of 30–100%+ in the past 1–3 months — proof there's real institutional demand behind the stock, not a quiet drift." },
      { c: "Sharp, high-volume advance",
        s: "Watch the volume signature — the rally came on expanding, above-average volume, ideally a clean 30–45° angle climb: steady and powerful, not a vertical/climactic spike." },
      { c: "Fresh, not extended", star: true,
        s: "It's a 1st or 2nd base off the lows — NOT a late-stage 4th base that's already been extended for 3–6 months." },
    ],
  },
  {
    title: "Base Quality",
    items: [
      { c: "Higher lows",
        s: "A rising base — buyers are stepping in earlier on each dip." },
      { c: "Tightening range (contraction)",
        s: "Volatility compresses toward a tight apex as the base matures." },
      { c: "Volume drying up into the apex", star: true,
        s: "Volume fades to nothing through the base — the clearest sign sellers are exhausted and supply is gone." },
      { c: "Inside bars / tight days at the pivot", star: true,
        s: "A cluster of narrow-range or inside days right before the breakout — the coil before the release." },
      { c: "Surfing the rising 10/20 (or 9/21 EMA)",
        s: "Price hugs the rising fast moving averages and never breaks down through them." },
      { c: "EMAs 9 / 21 / 50 converging", star: true,
        s: "The fast moving averages pinch together under price — a coiled spring, energy building for the move." },
      { c: "Orderly — no wild wicks / gaps against",
        s: "Calm, controlled digestion; no panic bars or gaps the wrong way." },
      { c: "Duration 2 weeks – 2 months",
        s: "Long enough to reset the prior move, not so long the base goes stale." },
    ],
  },
  {
    title: "Trigger & Stop",
    reminder: true,
    note: "Live-market checklist — run these at your entry. The grade above is decided pre-market; this is execution, so it's a reminder, not part of the star score.",
    items: [
      { c: "Range-expansion breakout on volume",
        s: "The stock breaks out of the base with a clear range expansion AND a surge of above-average volume — real demand stepping in, not a quiet drift over the line." },
      { c: "Opening-range confirmation",
        s: "Enter on the break of the opening range high (1-, 5-, or 60-minute depending on when it fires) — you let it prove itself, you don't guess ahead of the move." },
      { c: "Entry near the pivot, not extended",
        s: "You're buying right at the breakout pivot, not chasing 5–10% above it. A close entry keeps the stop tight and the reward-to-risk high." },
      { c: "Tight stop — under 1 ADR (ideally < ½)", key: true,
        s: "Your stop (low of day / base low) sits less than one ADR below entry — ideally under half. This is what makes the R:R explosive: a tight stop means tiny risk against a 10–20R runner, so one winner pays for many losers." },
      { c: "Invalidation defined before entry",
        s: "You know your exact 'I'm wrong' price BEFORE you click buy — a logical level where the setup is broken and you're out, no thinking." },
    ],
  },
];

const CHECK = (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: 13, height: 13 }}>
    <path d="M20 6L9 17l-5-5" stroke="#08080e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

let TOTAL = 0, STARMAKERS = 0;
SECTIONS.forEach(s => { if (s.reminder) return; s.items.forEach(i => { TOTAL++; if (i.star) STARMAKERS++; }); });

const GRADES = {
  5: ["A+ · Table-pounder", "Everything agrees — full size, this is the trade."],
  4: ["A · Strong", "Excellent setup with minor gaps — size up with confidence."],
  3: ["B · Tradeable", "Decent but flawed — trade smaller or wait for it to tighten."],
  2: ["C · Marginal", "Too much missing — usually a pass."],
  1: ["C · Not a setup", "Wait for a real base to form."],
  0: ["—", "Tick what's true to grade the setup."],
};

export default function SetupGraderTab({ C, font, guideEnter, guideLeave, gactive, expert }) {
  const [on, setOn] = useState(() => new Set());
  const toggle = (key) => setOn(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const reset = () => setOn(new Set());

  let passed = 0, starHit = 0;
  const secCounts = SECTIONS.map((sec, si) => {
    let sc = 0;
    sec.items.forEach((it, ii) => {
      if (on.has(si + "-" + ii)) { sc++; if (!sec.reminder) { passed++; if (it.star) starHit++; } }
    });
    return sc;
  });

  const pct = passed / TOTAL;
  let stars = Math.round(pct * 5);
  if (stars >= 5 && starHit < STARMAKERS) stars = 4; // A+ requires full confluence
  if (passed === 0) stars = 0;
  const [gLabel, gDesc] = GRADES[stars];

  return (
    <div className="toolpanel on" id="panel-grader">
      {/* intro / guide */}
      <div className={"intro guide" + gactive("grader")} data-gtitle="Setup Grader"
        onMouseEnter={guideEnter("grader", "Setup Grader", "Use this while you're scanning and screening for the best stocks in the market — not during live trading. Tick every characteristic that's true of the chart, and it grades the setup out of five stars across three areas: leadership, the prior move, and base quality. The fifth star — an A-plus — only unlocks when the highest-signal factors line up together.", undefined)}
        onMouseLeave={guideLeave("grader")}>
        <div className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg></div>
        <div>
          <h3>What is the Setup Grader?</h3>
          <p>Use it while <b>scanning and screening</b> for the best stocks — <b>not during live trading</b>. Tick every characteristic that's true and it scores the chart out of <b>5 stars</b> across three areas: <b>leadership</b>, the <b>prior move</b>, and <b>base quality</b>. A <b style={{ color: C.gold }}>★ maker</b> is a <b>confluence factor</b> — a high-signal criterion that independently raises the odds the breakout works. You can tick most boxes and still cap at 4★; the <b>fifth star (A+) only unlocks when the ★-makers stack</b> — because {STARMAKERS} unrelated signals agreeing is an edge, one alone is luck. When you're ready to enter, the <b style={{ color: C.blue }}>Trigger &amp; Stop</b> live-checklist at the bottom covers execution.</p>
        </div>
      </div>

      {/* SCORE PANEL */}
      <div style={{
        position: "sticky", top: 12, zIndex: 5, fontFamily: font, marginBottom: 20,
        background: `linear-gradient(135deg, rgba(201,152,42,0.10), rgba(255,255,255,0.02))`,
        border: `1px solid ${C.borderGold}`, borderRadius: 18, padding: "16px 20px",
        backdropFilter: "blur(24px) saturate(160%)", WebkitBackdropFilter: "blur(24px) saturate(160%)",
        display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap",
        boxShadow: "0 16px 44px rgba(0,0,0,0.5)",
      }}>
        <div>
          <div style={{ fontSize: "1.7rem", letterSpacing: 3, lineHeight: 1 }}>
            {[0, 1, 2, 3, 4].map(k => (
              <span key={k} style={{ color: k < stars ? C.goldBright : "rgba(255,255,255,0.14)", textShadow: k < stars ? "0 0 12px rgba(240,192,80,0.5)" : "none" }}>★</span>
            ))}
          </div>
          <div style={{ fontSize: "0.72rem", color: C.muted, marginTop: 6 }}>
            {passed ? `${starHit}/${STARMAKERS} ★-makers · ${Math.round(pct * 100)}% of criteria` : "Tick what's true to grade the setup"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "1.12rem", fontWeight: 800, color: C.white }}>{gLabel}</div>
          <div style={{ fontSize: "0.72rem", color: C.muted, marginTop: 3, maxWidth: 320 }}>{gDesc}</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ fontSize: "1.7rem", fontWeight: 800, fontVariantNumeric: "tabular-nums", color: C.white }}>
            {passed}<span style={{ color: C.muted, fontWeight: 600, fontSize: "1rem" }}>/{TOTAL}</span>
          </div>
          <div style={{ fontSize: "0.62rem", color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em" }}>criteria passed</div>
        </div>
        <button onClick={reset} style={{ background: "rgba(255,255,255,0.06)", color: C.muted, border: `1px solid ${C.border}`, fontFamily: font, fontSize: "0.72rem", fontWeight: 700, padding: "8px 16px", borderRadius: 99, cursor: "pointer" }}>Reset</button>
      </div>

      {/* SECTIONS */}
      {SECTIONS.map((sec, si) => {
        const full = secCounts[si] === sec.items.length;
        const rem = sec.reminder;
        const scoredNum = SECTIONS.slice(0, si).filter(s => !s.reminder).length + 1;
        return (
          <div key={si} style={{ fontFamily: font, background: rem ? "rgba(59,130,246,0.04)" : C.glass, border: `1px ${rem ? "dashed" : "solid"} ${rem ? "rgba(59,130,246,0.28)" : C.border}`, borderRadius: 16, padding: "6px 8px 10px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 14px 10px" }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, display: "grid", placeItems: "center", background: rem ? "rgba(59,130,246,0.12)" : C.goldDim, color: rem ? C.blue : C.gold, fontWeight: 800, fontSize: "0.82rem", border: `1px solid ${rem ? "rgba(59,130,246,0.3)" : C.borderGold}` }}>
                {rem ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ width: 15, height: 15 }}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" /></svg> : scoredNum}
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 800, letterSpacing: "-0.01em", color: C.white }}>{sec.title}</div>
              {rem && <span style={{ fontSize: "0.58rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.blue, background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", padding: "3px 9px", borderRadius: 99 }}>Not scored</span>}
              <div style={{
                marginLeft: "auto", fontSize: "0.74rem", fontWeight: 700, fontVariantNumeric: "tabular-nums",
                padding: "5px 13px", borderRadius: 99,
                border: `1px solid ${full ? "rgba(34,197,94,0.4)" : C.border}`,
                background: full ? "rgba(34,197,94,0.14)" : "rgba(255,255,255,0.05)",
                color: full ? C.green : C.muted,
              }}>{secCounts[si]} / {sec.items.length} {rem ? "checked" : "passed"}</div>
            </div>
            {rem && sec.note && (
              <div style={{ display: "flex", gap: 9, alignItems: "flex-start", margin: "0 14px 8px", padding: "9px 12px", background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.18)", borderRadius: 10, fontSize: "0.76rem", color: C.muted, lineHeight: 1.45 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke={C.blue} strokeWidth="2" style={{ width: 15, height: 15, flex: "0 0 auto", marginTop: 1 }}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" strokeLinecap="round" /></svg>
                <span>{sec.note}</span>
              </div>
            )}

            {sec.items.map((it, ii) => {
              const key = si + "-" + ii, isOn = on.has(key);
              return (
                <div key={ii} onClick={() => toggle(key)} style={{
                  display: "flex", alignItems: "flex-start", gap: 14, padding: "12px 14px", borderRadius: 12,
                  cursor: "pointer", userSelect: "none", transition: "background .15s",
                  background: isOn ? "rgba(201,152,42,0.06)" : "transparent",
                }}
                  onMouseEnter={e => { if (!isOn) e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isOn ? "rgba(201,152,42,0.06)" : "transparent"; }}>
                  <div style={{
                    flex: "0 0 22px", width: 22, height: 22, borderRadius: 7, marginTop: 1,
                    border: isOn ? `1.5px solid ${C.goldBright}` : "1.5px solid rgba(255,255,255,0.22)",
                    background: isOn ? `linear-gradient(135deg, ${C.goldBright}, ${C.goldMid})` : "rgba(255,255,255,0.03)",
                    display: "grid", placeItems: "center", transition: ".18s",
                  }}>{isOn && CHECK}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.94rem", fontWeight: 600, lineHeight: 1.3, color: isOn ? C.goldBright : C.text }}>{it.c}</div>
                    <div style={{ fontSize: "0.79rem", color: C.muted, marginTop: 3, lineHeight: 1.45 }}>{it.s}</div>
                  </div>
                  {it.star && (
                    <div style={{ flex: "0 0 auto", fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: C.goldMid, background: "rgba(201,152,42,0.12)", border: `1px solid ${C.borderGold}`, padding: "3px 8px", borderRadius: 99, marginTop: 2, whiteSpace: "nowrap" }}>★ maker</div>
                  )}
                  {it.key && (
                    <div style={{ flex: "0 0 auto", fontSize: "0.6rem", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: C.blue, background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", padding: "3px 8px", borderRadius: 99, marginTop: 2, whiteSpace: "nowrap" }}>R:R driver</div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* footnote */}
      <div style={{ fontFamily: font, fontSize: "0.76rem", color: C.muted, lineHeight: 1.6, padding: "4px 6px" }}>
        <b style={{ color: "rgba(255,255,255,0.75)" }}>One more thing to check (not scored):</b> the market regime — is the overall market trending up with leaders working? If it's in a downtrend, even a perfect chart usually fails, so grade the market before you grade the stock.
      </div>
    </div>
  );
}
