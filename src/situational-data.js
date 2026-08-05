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
  asof: "2026-08-04",     // the market close this read describes (matches the lens data)
  updated: "2026-08-05",  // when it was written (Valen's clock)

  // "RISK ON" | "NEUTRAL" | "RISK OFF" — rendered as the coloured chip that closes the verdict.
  // 08-04 basis: the 08-03 card said "one more strong follow-through day converts this" — it came.
  // 718 up-4% vs 114 down, the MONTH pair flipped green (112 vs 109) joining the quarter pair
  // (1,495 vs 1,055), both buy/sell ratios rising (r5 1.81 · r10 1.23). Both horizons now agree.
  stance: "RISK ON",

  headline: "The follow-through day came: 718 stocks up 4%+ against 114 down, and the month switch flipped green to join the quarter. Both breadth horizons now agree for the first time since the correction began.",

  weather: `<ul>
    <li><b>718 stocks up 4%+ vs 114 down</b> — a second, bigger buying day right after Monday's 573/74.</li>
    <li><b>The month switch flipped GREEN:</b> 112 stocks up 25% this month vs 109 down (it was 79 vs 162 two sessions ago).</li>
    <li>The quarter switch widened: <b>1,495 up vs 1,055 down</b>.</li>
    <li>Buy/sell ratios strengthening: 5-day <b>1.81</b>, 10-day <b>1.23</b>.</li>
    <li>Not frothy yet: only 19 stocks up 50% in a month (red zone starts at 20) and T2108 at 55 — mid-range, room to run.</li>
  </ul>`,

  shop: `<ul>
    <li><b>Software is the runaway weekly leader: +16.1%</b> — and its earnings gaps are HOLDING, which this market had refused to do for months.</li>
    <li>The beaten growth complex led the session — <b>Semiconductors +5.5% on the day</b>, Quantum +4.9, AI +4.2, Cybersecurity +4.1 — the worst monthly groups bounced hardest.</li>
    <li>Fresh money on the week: <b>Quantum +9.7 and Robotics +9.6 entered the weekly top-5</b>, alongside Software, Airlines (+11.0) and China Internet (+9.9).</li>
    <li>Intraday demand was real: Software +3.8 and Cybersecurity +3.6 <b>since the open</b> — buying all day, not a gap.</li>
    <li>Month board still shows the repair job: Semis −4.8, Solar −7.4, Growth −8.1 on the month — bounces becoming trends, not yet leaders.</li>
  </ul>`,

  flip: `<ul>
    <li>The 5-day buy/sell ratio slipping back under 1 would mean the thrust failed.</li>
    <li>The month pair is barely green (112 vs 109) — one heavy selling day re-reds it.</li>
    <li>A 300+ down-4% day = the documented selling extreme; that word overrides everything.</li>
    <li>Watch whether this week's big earnings gaps keep holding — leaders failing their gaps was the old market's tell.</li>
  </ul>`,

  // Optional free-form commentary block — usually Valen's own words via the in-app editor.
  commentary: "",
};
