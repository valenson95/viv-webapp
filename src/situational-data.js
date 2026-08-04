// SITUATIONAL AWARENESS — the standing read across the lens cards above it
// (Theme Leaders · Sector Group Rotation · Market Trend · Market Breadth · Earnings).
//
// This file is the COMMITTED default: written by Claude in the lens-refresh batch so the card
// always has something to say, even offline or if the override endpoint is unreachable.
//
// ⚠️ HARD RULE (Valen 2026-08-02): this file is rewritten on EVERY lens refresh. Breadth,
// rotation, themes, earnings and this verdict move as ONE push — never a fresh table beside a
// stale read. Every number below must be traceable to the lens data files committed alongside it.
//
// Valen can type straight over it in-app (admin ✎ on the card). That override is stored in
// Supabase via /api/situational and WINS while its `updated` stamp is >= this file's.
//
// FORMAT (Valen 2026-08-02): headline = 1–2 sentences, then a STANCE chip (RISK ON / NEUTRAL /
// RISK OFF). The three blocks are BULLET POINTS — short, plain English, punchy, one idea per
// line. Fields are HTML; everything renders through sanitizeRich() (b/i/u/colour/size/ul/li only).
//
// Voice: plain, short, punchy (skill `plain-voice`). Describe what the lenses show — never instruct.
export const SITUATIONAL = {
  asof: "2026-08-03",     // the market close this read describes (matches the lens data)
  updated: "2026-08-04",  // when it was written (Valen's clock)

  // "RISK ON" | "NEUTRAL" | "RISK OFF" — rendered as the coloured chip that closes the verdict.
  // 08-03 basis: the quarter switch flipped back GREEN and both buy/sell ratios crossed above 1
  // on a 573-vs-74 accumulation day — but the month pair is still red (79 up vs 162 down), so
  // one horizon is green, one is not. One more strong follow-through day converts this.
  stance: "NEUTRAL",

  headline: "Monday was the strongest buying day of this correction — 573 stocks up 4%+ against just 74 down — and the main breadth switch flipped back green. One horizon confirmed; the month has not.",

  weather: `<ul>
    <li>S&amp;P closed <b>+1.5%</b> and this time breadth agreed: <b>573 stocks up 4%+ vs 74 down</b>.</li>
    <li><b>The main switch flipped GREEN:</b> 1,304 stocks up 25% this quarter vs 1,160 down. It was red on Friday.</li>
    <li>The 5- and 10-day buy/sell ratios are both back above 1 (<b>1.19</b> and <b>1.12</b>).</li>
    <li>Still missing: the month pair is red — <b>79 up 25%+ vs 162 down</b>. The turn is days old, not weeks.</li>
    <li>Friday's warning (index up, more stocks down) was answered, not repeated.</li>
  </ul>`,

  shop: `<ul>
    <li><b>Software is the strongest theme in the market</b> — up <b>+10.7%</b> on the week, and the internet/software groups sit at the very top of the rotation table near their highs.</li>
    <li>China Internet leads BOTH windows (+9.3% week, +12.3% month).</li>
    <li><b>Airlines +8.5%</b> on the week — oil dropping 6% Monday poured fuel on it.</li>
    <li>The beaten growth complex is repairing on the week — Robotics +6.2, Quantum +4.6, AI +4.5, Cybersecurity +4.3 — but every one of them is still red on the month.</li>
    <li>Defensives were abandoned: staples and health-care sector strength went <b>negative</b> the same week risk themes turned up.</li>
  </ul>`,

  flip: `<ul>
    <li>The month pair (25%-in-a-month up vs down) turning green would confirm the turn.</li>
    <li>A genuine follow-through day in the next few sessions — Monday was the setup, not yet the proof.</li>
    <li><b>Still broken on the month:</b> Semiconductors −9.7% · Solar −11.0% · Growth Stocks −10.4% · Genomics −9.1%.</li>
    <li>If the 5-day ratio slips back under 1, the flip failed.</li>
  </ul>`,

  // Optional free-form commentary block — usually Valen's own words via the in-app editor.
  commentary: "",
};
