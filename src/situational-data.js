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
  asof: "2026-07-31",     // the market close this read describes (matches the lens data)
  updated: "2026-08-02",  // when it was written (Valen's clock)

  // "RISK ON" | "NEUTRAL" | "RISK OFF" — rendered as the coloured chip that closes the verdict.
  // 07-31 basis: the primary quarter switch flipped red, the daily trend signal is broken, and
  // the index advanced on fewer names than declined.
  stance: "RISK OFF",

  headline: "The index rose while more stocks fell — a narrow advance, and the main breadth switch flipped red. Thursday's big surge did not follow through.",

  weather: `<ul>
    <li>S&amp;P closed <b>+0.7%</b> on Friday — but <b>216 stocks fell 4%+</b> against only <b>179</b> that rose.</li>
    <li>Thursday's 437-name surge did not follow through. One day, not a turn.</li>
    <li><b>The main switch flipped red:</b> 1,171 stocks up 25% this quarter vs 1,235 down. It was green the day before.</li>
    <li>The month is worse — 74 up vs 206 down.</li>
    <li>The 5- and 10-day buy/sell ratios are both still under 1.</li>
    <li>Fewer and fewer names are carrying the index.</li>
  </ul>`,

  shop: `<ul>
    <li><b>Cloud and Software lead AND sit near their highs</b> — CLOU −5%, WCLD −4%, XSW −11% off their 52-week highs.</li>
    <li>Software is up <b>+6.3%</b> this week and finally green on the month.</li>
    <li>Cybersecurity is turning the same way — up Friday, up on the week.</li>
    <li><b>China ranks just as high but sits 24–34% below its highs.</b> That is a bounce, not a breakout.</li>
    <li>Also strong and near highs: Global Shipping, Capital Markets, Steel, Oil &amp; Gas E&amp;P.</li>
  </ul>`,

  flip: `<ul>
    <li>The quarter switch turning green again.</li>
    <li>The 5-day ratio getting back above 1.</li>
    <li><b>Still getting weaker:</b> Semiconductors −7.9% week / −12.9% month · Solar −8.2% / −14.7% · Bitcoin Miners −10.0% / −12.4%.</li>
    <li>Bottom of the rotation table: healthcare providers, healthcare facilities, biotech.</li>
  </ul>`,

  // Optional free-form commentary block — usually Valen's own words via the in-app editor.
  commentary: "",
};
