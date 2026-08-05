// ─────────────────────────────────────────────────────────────
// THEME → GROUP-ETF map.  DeepVue theme name (as used in sectors.js) → the rotation-table
// group ticker in groupRS-data.js, so a watchlist name can be read against the strength of
// the GROUP it belongs to (thrust / rs1m), not just its own theme rank.
//
// ⚠️ RULES
//  1. CONSERVATIVE. A wrong mapping is worse than no mapping — a wrong group badge would make
//     a name look like it sits in a leading basket when it doesn't. Unmapped returns null and
//     the card renders "—". Only map when the ETF's actual basket IS the theme's basket.
//  2. Targets must be group rows that exist in groupRS-data.js (GROUP_RS.rows[].t), OR one of
//     the six added in the 2026-08-05 universe batch that may not have been computed yet
//     (TAN · GDX · JETS · ITB · ARTY · URA). Callers must handle a missing row gracefully.
//  3. DeepVue still owns grouping. This file maps theme→ETF only; it never re-categorises a stock.
//
// GAPS — themes deliberately left unmapped, and why. These are NOT oversights; each one needs
// either a new ETF in the group universe (scripts/group-rs.mjs) or Valen's call:
//   Semiconductors  no semis group row exists (SOXX lives only in the per-stock `ll` table)
//   Quantum         no quantum ETF (QTUM) in the universe
//   Utilities       no broad utilities ETF; NLR is nuclear-only, too narrow for VST/NEE/SO/DUK
//   Silver Miners   no SIL in the universe
//   Materials       no broad materials ETF; COPX is copper-only, GNR/GUNR are energy-heavy
//   Growth Stocks   a mixed consumer/growth basket with no ETF equivalent
//   Data Center     no data-centre ETF in the universe (CRWV/CORZ/GDS)
//   Technology      hardware bucket (DELL/ANET/STX/APH); no XLK-style row, and sectors.js
//                   already notes "Technology" is not a DeepVue tracker theme
// ─────────────────────────────────────────────────────────────
export const THEME_GROUPS = {
  // ── exact matches ─────────────────────────────────────────
  "AI":                "ARTY",   // Artificial Intelligence (added 2026-08-05 batch)
  "Genomics":          "ARKG",   // Genomics
  "Robotics":          "ROBO",   // Robotics & Automation
  "Solar":             "TAN",    // Solar (added 2026-08-05 batch)
  "Uranium":           "URA",    // Uranium Miners (added 2026-08-05 batch)
  "Gold Miners":       "GDX",    // Gold Miners (added 2026-08-05 batch)
  "Airlines":          "JETS",   // Airlines (added 2026-08-05 batch)
  "Home Construction": "ITB",    // Home Construction (added 2026-08-05 batch)
  "Steel":             "SLX",    // Steel
  "Aerospace":         "XAR",    // Aerospace & Defense (equal-weight; SHLD is defence-tech only)
  "Bitcoin":           "IBIT",   // Bitcoin Spot
  "Bitcoin Miners":    "WGMI",   // Bitcoin Miners
  "Social Media":      "SOCL",   // Social Media
  "China Internet":    "KWEB",   // Chinese Tech & E-commerce
  "Telecom":           "IYZ",    // US Telecommunications
  "Retail":            "XRT",    // Retail
  "Real Estate":       "SCHH",   // U.S. REITs
  "Transports":        "IYT",    // Transportation (XTN is trucking-only)

  // ── close matches (the ETF's basket is the theme's basket) ─
  "Software":          "IGV",    // US Tech/Software — the canonical software group (XSW/WCLD/CLOU are slices)
  "Cybersecurity":     "CIBR",   // Cybersecurity Software & Infrastructure (broader than BUG)
  "Biotechnology":     "XBI",    // Biotech, equal-weight — the trader's biotech gauge (IBB is cap-weighted)
  "Medical":           "IHI",    // Med-Tech & Surgical Equipment — matches ISRG/DXCM/PODD/BSX/MDT/SYK
  "HealthCare":        "IHF",    // Health-Care Providers — matches UNH/ELV/CI/HCA/MCK/CNC/THC
  "Banks":             "KBE",    // Large-cap Banking (KRE is regionals-only; this theme holds both)
  "Industrials":       "PAVE",   // US Infrastructure — matches ETN/EMR/PWR/HUBB/VMI/ATKR/NVT/AZZ
  "Oil & Gas":         "XOP",    // Oil & Gas E&P — the broadest oil-equity group in the universe

  // ── judgment calls (flagged for Valen's review) ───────────
  // Financials here is fintech + brokers + alt-managers (HOOD/COIN/IBKR/SCHW/GS/KKR/BX), which is
  // KCE's basket. It is NOT the banks basket — Banks has its own theme above.
  "Financials":        "KCE",    // Capital Markets & Financial Services
  // Communication is the internet/media bucket (GOOGL/NFLX/SPOT/ROKU). FDN is the closest group;
  // it does not carry DIS/WBD/PARA/EA, so treat the badge as a read on internet strength.
  "Communication":     "FDN",    // US Internet Giants
};

// Theme name → group ETF ticker, or null when the theme has no defensible group.
// Case/whitespace tolerant; unknown or empty theme → null (the card renders "—").
export function groupForTheme(themeName) {
  if (!themeName) return null;
  const key = String(themeName).trim();
  if (THEME_GROUPS[key]) return THEME_GROUPS[key];
  const lower = key.toLowerCase();
  for (const k of Object.keys(THEME_GROUPS)) {
    if (k.toLowerCase() === lower) return THEME_GROUPS[k];
  }
  return null;
}

export default THEME_GROUPS;
