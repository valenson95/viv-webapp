// SITUATIONAL AWARENESS — the standing read across the three lens cards above it
// (Theme Leaders · Sector Group Rotation · Market Breadth).
//
// This file is the COMMITTED default: written by Claude in the lens-refresh batch
// (`node scripts/situational.mjs <read.json>`) so the card always has something to say,
// even offline or if the override endpoint is unreachable.
//
// Valen can type straight over it in-app (admin ✎ on the card). That override is stored in
// Supabase via /api/situational and WINS while its `updated` stamp is >= this file's — so a
// newer Claude read supersedes an older typed note, and a newer typed note supersedes the file.
//
// Voice: plain, short, punchy (skill `plain-voice`). Describe what the three lenses show —
// never instruct. Every number here must be traceable to the lens data files.
export const SITUATIONAL = {
  asof: "2026-07-30",     // the market close this read describes (matches the lens data)
  updated: "2026-08-02",  // when it was written (Valen's clock)

  headline: "One huge up day inside a month that is still broken. Treat it as a bounce until it repeats.",

  weather:
    "424 stocks rose 4% or more — a genuine thrust day, the kind that usually shows up near a turn. " +
    "But the month underneath has not healed: 266 stocks are down 25% over the past month against only 81 up, " +
    "and the 5- and 10-day up/down ratios are both still under 1. One day does not turn a market. " +
    "Until the monthly pair flips green, breakouts are less likely to work than to fail.",

  shop:
    "If you are buying, shop the groups that are strong AND already near their highs — not the ones bouncing off the floor. " +
    "Shipping, Health Devices, Natural Resources and Cloud all rank at the top and sit within about 6% of their 52-week highs. " +
    "China Internet, China Consumer, E-Sports and Fintech rank just as high but sit 17–35% below theirs: that is a bounce, not a breakout. " +
    "The theme table agrees on where the money went this week — Medical +6.7%, China Internet +6.1%, Airlines +5.3%, Software +4.8%, Steel +4.7%.",

  flip:
    "Two things would change this read: the 25%-in-a-month pair turning green (more up than down), and the 5-day ratio getting back above 1. " +
    "The weak end is just as clear — Semiconductors −8.2%, Bitcoin Miners −7.5% and Solar −7.2% were the worst themes of the week, " +
    "and Transportation, Trucking, Health-Care Providers and Cybersecurity sit at the bottom of the rotation table.",

  // Optional free-form commentary block — usually Valen's own words via the in-app editor;
  // leave "" here unless he asks Claude to draft it. Fields may carry limited inline HTML
  // (b/i/u/span colour+size) — everything renders through sanitizeRich().
  commentary: "",
};
