// SITUATIONAL AWARENESS — the standing read across the lens cards above it
// (Theme Leaders · Sector Group Rotation · Market Breadth · Earnings).
//
// This file is the COMMITTED default: written by Claude in the lens-refresh batch so the card
// always has something to say, even offline or if the override endpoint is unreachable.
//
// ⚠️ HARD RULE (Valen 2026-08-02): this file is rewritten on EVERY lens refresh. Breadth,
// rotation, themes, earnings and this verdict move as ONE push — never a fresh table beside a
// stale read. Every number below must be traceable to the lens data files committed alongside it.
//
// Valen can type straight over it in-app (admin ✎ on the card). That override is stored in
// Supabase via /api/situational and WINS while its `updated` stamp is >= this file's — so a
// newer Claude read supersedes an older typed note, and a newer typed note supersedes the file.
//
// Voice: plain, short, punchy (skill `plain-voice`). Describe what the lenses show — never instruct.
export const SITUATIONAL = {
  asof: "2026-07-31",     // the market close this read describes (matches the lens data)
  updated: "2026-08-02",  // when it was written (Valen's clock)

  headline: "The index rose while more stocks fell. Friday was a narrow advance — and the quarter breadth switch just flipped red.",

  weather:
    "The S&P closed up 0.7% on Friday, but 216 stocks fell 4% or more against only 179 that rose. " +
    "Thursday's 437-name surge did not follow through — that was one day, not a turn. " +
    "The quarter pair, the primary switch, has flipped: 1,171 stocks up 25% against 1,235 down, after being green the day before. " +
    "The month underneath is worse, at 74 up against 206 down, and the 5- and 10-day up/down ratios are still under 1. " +
    "Fewer and fewer names are carrying the index. Breakouts are less likely to work here.",

  shop:
    "Two groups sit at the top of the rotation table, and only one of them is near its highs. " +
    "Cloud and Software are the honest ones — Cloud Infrastructure, Cloud Tech and equal-weight Software all rank top and trade within 4–11% of their 52-week highs, " +
    "and the theme table backs it: Software +6.3% on the week and finally positive on the month. Cybersecurity is turning the same way, up on Friday and on the week. " +
    "China ranks just as high but sits 24–34% below its highs — that is a bounce, not a breakout. " +
    "Also strong and near highs: Global Shipping, Capital Markets, Steel and Oil & Gas E&P.",

  flip:
    "Two things would change this read: the quarter pair turning green again, and the 5-day ratio getting back above 1. " +
    "The weak end is unchanged and getting weaker — Semiconductors −7.9% on the week and −12.9% on the month, Solar −8.2% and −14.7%, Bitcoin Miners −10.0% and −12.4% (−6.9% on Friday alone). " +
    "The whole AI complex is still being sold. At the bottom of the rotation table: healthcare providers, healthcare facilities and biotech.",

  // Optional free-form commentary block — usually Valen's own words via the in-app editor;
  // leave "" here unless he asks Claude to draft it. Fields may carry limited inline HTML
  // (b/i/u/span colour+size) — everything renders through sanitizeRich().
  commentary: "",
};
