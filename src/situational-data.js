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
  asof: "2026-08-05",     // the market close this read describes (matches the lens data)
  updated: "2026-08-06",  // when it was written (Valen's clock)

  // "RISK ON" | "NEUTRAL" | "RISK OFF" — rendered as the coloured chip that closes the verdict.
  // 08-05 basis: both switches STILL green and wider on the month (144 vs 125, quarter 1,445 vs
  // 1,080), r5 2.73 / r10 1.28 both rising. The session itself was a rest day (257 up-4% vs 202
  // down) with money hiding in metals. One watch-line: 20 stocks up 50%/month = the froth
  // threshold exactly (≥20 = documented red zone).
  stance: "RISK ON",

  headline: "Both breadth switches stay green — the market rested for a day and rotated into gold and silver miners while last week's leaders caught their breath. First froth reading: 20 stocks are up 50%+ in a month, right at the warning line.",

  weather: `<ul>
    <li><b>A rest day, not a sell day:</b> 257 stocks up 4%+ vs 202 down — mild, two-way tape after Tuesday's 718/114 surge.</li>
    <li><b>Both switches green and wider:</b> month 144 up-25% vs 125 down (from 112/109), quarter 1,445 vs 1,080.</li>
    <li>Buy/sell ratios still climbing: 5-day <b>2.73</b> (deep green territory), 10-day <b>1.28</b>.</li>
    <li><b>First froth flag: 20 stocks up 50% in a month</b> — exactly the level where the gauge turns red. Worth respect, not panic.</li>
    <li>T2108 at 54 — mid-range, neither stretched nor washed out.</li>
  </ul>`,

  shop: `<ul>
    <li><b>Gold and silver miners took over the whole board</b> — +7.4% and +6.6% on the day, now #1 and #2 on BOTH the weekly and monthly theme boards.</li>
    <li>Last week's growth leaders rested red (Software −0.7, AI −1.2, Quantum −1.9 on the day) but <b>kept their weekly ranks</b> — one down day after a vertical week is normal digestion.</li>
    <li>Semiconductors' weekly repair held (+7.6 on the week) while the month is still broken (−3.9) — bounce, not yet a leader.</li>
    <li>Steel quietly jumped to #3 on the month (+13.0) — the metals bid is broader than just gold.</li>
    <li>Bitcoin Miners stay the worst board: −4.8 on the day, −8.9 on the month.</li>
  </ul>`,

  flip: `<ul>
    <li>The froth gauge printing clearly above 20 stocks up-50%/month = the documented overheat signal — trims come before it, not after.</li>
    <li>The 5-day buy/sell ratio slipping back under 1 would mean the thrust failed.</li>
    <li>A 300+ down-4% day = the documented selling extreme; that word overrides everything.</li>
    <li>If the resting growth leaders keep bleeding while only metals rise, that is rotation OUT of risk — not digestion.</li>
  </ul>`,

  // Optional free-form commentary block — usually Valen's own words via the in-app editor.
  commentary: "",
};
