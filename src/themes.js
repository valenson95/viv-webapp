// ─────────────────────────────────────────────────────────────
// DeepVue Theme Tracker — dated snapshots (Valen updates these in AI-OS).
// A position's in/off-theme is judged against the snapshot nearest its ENTRY date.
// in-theme (green)  = sector is TOP-5 in the 1-week OR 1-month tracker
// off-theme (red)   = not in either top-5
// Source of truth = Valen's DeepVue charts. Add a new dated block each update.
// ─────────────────────────────────────────────────────────────

export const THEME_SNAPSHOTS = {
  // 2026-06-26 = the 06-28 snapshot BACKDATED 2 trading days by VALEN'S MANUAL JUDGMENT
  // (2026-07-07): his 6/26 entries (CRWD/FTNT cyber, MRNA biotech) predate the first logged
  // snapshot but the leaders were the same — Cyber 1W #1, Biotech top-5. Auditable here + in
  // trading/context/deepvue-themes.md.
  "2026-06-26": {
    month: [["Genomics",26.5],["Airlines",19.3],["Biotechnology",16.84],["HealthCare",12.04],["Home Construction",11.29],["Banks",10.55],["Aerospace",10.36],["Medical",6.9],["Industrials",5.67],["Retail",5.63],["Transports",5.3],["Utilities",4.69],["Cybersecurity",4.66],["Real Estate",2.69],["Materials",0.74],["Growth Stocks",-2.75],["Social Media",-4.4],["Bitcoin",-5.76],["Software",-6.62],["Robotics",-7.15],["Semiconductors",-7.15],["Quantum",-7.6],["Gold Miners",-7.73],["China Internet",-8.19],["Silver Miners",-8.33],["Telecom",-9.27],["AI",-10.57],["Steel",-12.53],["Oil & Gas",-16.61],["Solar",-19.87],["Bitcoin Miners",-24.78]],
    week:  [["Cybersecurity",11.4],["Genomics",11.22],["Software",8.59],["Biotechnology",7.81],["HealthCare",6.82],["Social Media",6.62],["Silver Miners",6.13],["Gold Miners",5.15],["Aerospace",5.08],["Medical",4.55],["Transports",3.15],["Bitcoin",2.95],["China Internet",2.84],["Airlines",2.22],["Robotics",2.21],["Industrials",2.05],["Banks",1.67],["Materials",1.66],["Utilities",0.48],["Telecom",0.39],["Real Estate",0.38],["Retail",-0.18],["Home Construction",-0.41],["Steel",-1.99],["AI",-2.43],["Growth Stocks",-2.82],["Quantum",-3.05],["Oil & Gas",-3.14],["Solar",-3.16],["Semiconductors",-4.3],["Bitcoin Miners",-20.33]],
    day:   [],
  },
  "2026-06-28": {
    month: [["Genomics",26.5],["Airlines",19.3],["Biotechnology",16.84],["HealthCare",12.04],["Home Construction",11.29],["Banks",10.55],["Aerospace",10.36],["Medical",6.9],["Industrials",5.67],["Retail",5.63],["Transports",5.3],["Utilities",4.69],["Cybersecurity",4.66],["Real Estate",2.69],["Materials",0.74],["Growth Stocks",-2.75],["Social Media",-4.4],["Bitcoin",-5.76],["Software",-6.62],["Robotics",-7.15],["Semiconductors",-7.15],["Quantum",-7.6],["Gold Miners",-7.73],["China Internet",-8.19],["Silver Miners",-8.33],["Telecom",-9.27],["AI",-10.57],["Steel",-12.53],["Oil & Gas",-16.61],["Solar",-19.87],["Bitcoin Miners",-24.78]],
    week:  [["Cybersecurity",11.4],["Genomics",11.22],["Software",8.59],["Biotechnology",7.81],["HealthCare",6.82],["Social Media",6.62],["Silver Miners",6.13],["Gold Miners",5.15],["Aerospace",5.08],["Medical",4.55],["Transports",3.15],["Bitcoin",2.95],["China Internet",2.84],["Airlines",2.22],["Robotics",2.21],["Industrials",2.05],["Banks",1.67],["Materials",1.66],["Utilities",0.48],["Telecom",0.39],["Real Estate",0.38],["Retail",-0.18],["Home Construction",-0.41],["Steel",-1.99],["AI",-2.43],["Growth Stocks",-2.82],["Quantum",-3.05],["Oil & Gas",-3.14],["Solar",-3.16],["Semiconductors",-4.3],["Bitcoin Miners",-20.33]],
    day:   [],
  },
  "2026-07-04": {
    month: [["Genomics",26.21],["Biotechnology",19.13],["Airlines",16.49],["HealthCare",12.98],["Home Construction",10.35],["Aerospace",8.70],["Banks",8.03],["Medical",7.66],["Industrials",5.58],["Retail",5.21],["Transports",4.77],["Utilities",4.24],["Real Estate",2.74],["Cybersecurity",1.52],["Materials",0.95],["Growth Stocks",-2.89],["Semiconductors",-6.31],["Social Media",-6.74],["Robotics",-8.00],["Quantum",-8.15],["Bitcoin",-8.36],["Software",-10.66],["Gold Miners",-10.93],["China Internet",-11.79],["AI",-11.82],["Telecom",-12.68],["Silver Miners",-12.88],["Steel",-13.54],["Oil & Gas",-16.46],["Solar",-22.07],["Bitcoin Miners",-25.62]],
    week:  [["Genomics",19.16],["Cybersecurity",11.47],["Biotechnology",9.89],["HealthCare",7.58],["Software",7.16],["Airlines",6.48],["Social Media",5.85],["Home Construction",5.72],["Medical",5.62],["Aerospace",5.20],["Transports",4.82],["Industrials",3.23],["Banks",2.66],["Retail",2.66],["Materials",2.24],["Silver Miners",2.13],["Robotics",2.05],["China Internet",2.04],["Utilities",1.53],["Gold Miners",0.99],["Real Estate",0.09],["Telecom",-0.96],["Bitcoin",-1.25],["AI",-2.37],["Growth Stocks",-3.42],["Steel",-3.53],["Solar",-3.83],["Semiconductors",-4.78],["Quantum",-5.10],["Oil & Gas",-6.48],["Bitcoin Miners",-25.06]],
    day:   [["Gold Miners",4.48],["Silver Miners",3.90],["Medical",3.80],["Biotechnology",2.93],["Bitcoin",2.56],["HealthCare",2.52],["Utilities",2.21],["Materials",1.94],["Aerospace",1.78],["Steel",1.37],["Real Estate",1.13],["Home Construction",0.74],["Genomics",0.68],["Transports",0.53],["Industrials",0.30],["Software",0.25],["Retail",0.25],["Airlines",-0.09],["Cybersecurity",-0.12],["Oil & Gas",-0.13],["Social Media",-0.21],["China Internet",-0.52],["Banks",-1.10],["Robotics",-1.76],["Solar",-2.56],["AI",-2.80],["Quantum",-3.34],["Telecom",-3.73],["Growth Stocks",-4.17],["Semiconductors",-4.54],["Bitcoin Miners",-9.49]],
  },
  "2026-07-07": {
    month: [["Genomics",28.45],["Airlines",19.80],["Biotechnology",16.60],["Aerospace",11.51],["Banks",11.49],["HealthCare",11.09],["Home Construction",9.57],["Cybersecurity",7.89],["Medical",7.38],["Industrials",6.61],["Retail",5.10],["Transports",4.60],["Utilities",3.64],["Real Estate",1.79],["Materials",0.68],["Growth Stocks",-0.96],["Social Media",-2.25],["Bitcoin",-2.38],["Robotics",-5.02],["Semiconductors",-5.27],["Software",-5.40],["China Internet",-5.99],["Quantum",-6.45],["Gold Miners",-7.36],["AI",-7.69],["Telecom",-8.24],["Silver Miners",-8.90],["Steel",-10.81],["Oil & Gas",-16.55],["Solar",-18.14],["Bitcoin Miners",-20.13]],
    week:  [["Cybersecurity",14.84],["Genomics",12.93],["Software",10.00],["Social Media",9.01],["Biotechnology",7.59],["Bitcoin",6.64],["Aerospace",6.18],["HealthCare",5.91],["Gold Miners",5.56],["Silver Miners",5.47],["China Internet",5.31],["Medical",5.02],["Robotics",4.57],["Industrials",2.97],["Airlines",2.65],["Banks",2.53],["Transports",2.46],["Materials",1.60],["Telecom",1.53],["AI",0.71],["Steel",-0.05],["Real Estate",-0.49],["Utilities",-0.53],["Retail",-0.68],["Growth Stocks",-1.03],["Solar",-1.07],["Quantum",-1.85],["Home Construction",-1.95],["Semiconductors",-2.36],["Oil & Gas",-3.08],["Bitcoin Miners",-15.40]],
    // day = the "Since Open" view (momentum ex overnight gaps) of the 07-06 US session — real intraday demand rank
    day:   [["Bitcoin",3.91],["Cybersecurity",3.26],["Software",2.63],["Bitcoin Miners",2.28],["Genomics",1.97],["Solar",1.84],["Robotics",1.22],["Steel",1.10],["AI",1.01],["Banks",0.95],["Aerospace",0.69],["Social Media",0.61],["Industrials",0.47],["Growth Stocks",0.31],["Telecom",0.31],["Quantum",0.25],["Medical",0.13],["Airlines",0.12],["Materials",0.12],["China Internet",0.08],["Biotechnology",-0.20],["Oil & Gas",-0.27],["Semiconductors",-0.45],["HealthCare",-0.51],["Retail",-0.67],["Transports",-0.68],["Utilities",-0.90],["Gold Miners",-0.98],["Real Estate",-0.98],["Home Construction",-1.55],["Silver Miners",-1.82]],
  },
  "2026-07-08": {
    month: [["Genomics",17.45],["Airlines",16.11],["Biotechnology",15.63],["HealthCare",9.50],["Cybersecurity",8.48],["Banks",7.52],["Home Construction",6.95],["Aerospace",5.85],["Medical",4.77],["Retail",4.36],["Utilities",4.01],["Industrials",3.53],["Transports",3.29],["Real Estate",1.10],["Bitcoin",0.36],["Materials",-0.21],["Social Media",-4.40],["Growth Stocks",-5.23],["Software",-5.93],["China Internet",-5.97],["Semiconductors",-7.34],["Robotics",-8.71],["AI",-8.80],["Quantum",-9.04],["Telecom",-11.06],["Steel",-11.93],["Gold Miners",-12.31],["Silver Miners",-13.54],["Oil & Gas",-16.55],["Solar",-22.19],["Bitcoin Miners",-24.12]],
    week:  [["Cybersecurity",13.97],["Software",11.05],["Social Media",10.38],["China Internet",7.96],["Biotechnology",7.93],["Bitcoin",7.85],["Genomics",6.21],["HealthCare",5.89],["Medical",4.19],["Aerospace",3.26],["Banks",0.78],["Real Estate",0.67],["Transports",0.61],["Gold Miners",0.12],["Robotics",-0.05],["Utilities",-0.33],["Retail",-0.45],["Materials",-0.64],["Silver Miners",-0.73],["Telecom",-0.85],["Industrials",-0.95],["Airlines",-1.43],["Steel",-2.59],["AI",-3.27],["Oil & Gas",-3.74],["Home Construction",-4.20],["Solar",-5.29],["Quantum",-5.49],["Growth Stocks",-5.65],["Semiconductors",-8.70],["Bitcoin Miners",-18.94]],
    // day = the "Since Open" view (momentum ex overnight gaps) of the 07-07 US session — leaders rested/sold intraday (trims day)
    day:   [["Oil & Gas",1.31],["Bitcoin",1.23],["Real Estate",0.82],["Semiconductors",0.25],["Biotechnology",0.22],["Social Media",0.20],["Utilities",0.15],["China Internet",0.04],["HealthCare",0.00],["Steel",-0.34],["Transports",-0.75],["AI",-0.80],["Materials",-0.87],["Retail",-0.91],["Banks",-0.94],["Medical",-1.06],["Industrials",-1.17],["Cybersecurity",-1.38],["Quantum",-1.47],["Home Construction",-1.48],["Telecom",-1.51],["Software",-1.78],["Robotics",-1.88],["Growth Stocks",-1.98],["Genomics",-2.11],["Solar",-2.21],["Aerospace",-2.29],["Airlines",-2.31],["Gold Miners",-3.31],["Silver Miners",-3.38],["Bitcoin Miners",-4.26]],
  },
  "2026-07-09": {
    month: [["Genomics",25.32],["Biotechnology",16.56],["Airlines",13.76],["Cybersecurity",11.87],["HealthCare",7.84],["Banks",4.80],["Aerospace",4.44],["Semiconductors",4.09],["Retail",4.08],["Industrials",3.58],["Home Construction",3.24],["Bitcoin",3.19],["Medical",2.36],["Transports",2.34],["Utilities",2.28],["Growth Stocks",2.22],["Social Media",0.76],["China Internet",0.11],["AI",0.08],["Quantum",-0.20],["Materials",-0.93],["Real Estate",-1.23],["Software",-3.52],["Telecom",-4.70],["Robotics",-5.24],["Silver Miners",-6.63],["Gold Miners",-6.74],["Steel",-8.76],["Oil & Gas",-8.89],["Bitcoin Miners",-10.49],["Solar",-15.47]],
    week:  [["Cybersecurity",10.34],["China Internet",10.32],["Social Media",8.32],["Software",4.85],["Biotechnology",4.79],["Bitcoin",4.08],["HealthCare",1.65],["Aerospace",1.20],["Genomics",1.06],["Oil & Gas",0.61],["Medical",0.45],["Robotics",-0.06],["Telecom",-0.35],["Industrials",-0.43],["Transports",-0.68],["AI",-0.92],["Banks",-1.78],["Utilities",-1.82],["Steel",-1.83],["Quantum",-2.24],["Real Estate",-2.41],["Materials",-2.79],["Semiconductors",-3.04],["Retail",-3.07],["Growth Stocks",-3.57],["Airlines",-4.48],["Gold Miners",-4.51],["Solar",-4.77],["Silver Miners",-5.61],["Home Construction",-8.57],["Bitcoin Miners",-16.13]],
    // day = the "Since Open" view (momentum ex overnight gaps). Risk-off rotation intraday — Bitcoin Miners/Semis/AI led since-open while the 1W leaders (Cyber/China Internet/Social) rested.
    day:   [["Bitcoin Miners",5.80],["Semiconductors",3.07],["AI",2.07],["Telecom",2.06],["Oil & Gas",1.85],["Quantum",1.65],["Growth Stocks",1.21],["Genomics",0.79],["Steel",0.75],["Solar",0.71],["Bitcoin",0.69],["Robotics",0.45],["Social Media",0.25],["Cybersecurity",0.22],["Transports",-0.13],["Airlines",-0.19],["Industrials",-0.19],["Biotechnology",-0.30],["China Internet",-0.34],["Software",-0.44],["HealthCare",-0.66],["Retail",-0.68],["Gold Miners",-0.76],["Utilities",-0.83],["Silver Miners",-1.08],["Medical",-1.37],["Aerospace",-1.50],["Real Estate",-1.56],["Banks",-1.64],["Materials",-1.65],["Home Construction",-2.93]],
  },
};

// Normalize ANY date shape to ISO (YYYY-MM-DD) — manual positions carry M/D/YY strings,
// which compare lexically ABOVE every ISO key and silently resolved to the LATEST snapshot.
const dnorm = (d) => {
  if (!d) return "";
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/); // M/D/YY or M/D/YYYY
  if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  const t = new Date(s);
  return isNaN(t) ? "" : t.toISOString().slice(0, 10);
};
// The first dated DeepVue snapshot — theme metrics only exist from here forward.
export const THEME_COVERAGE_START = Object.keys(THEME_SNAPSHOTS).sort()[0] || null;

// nearest snapshot on or before the given date.
// HONESTY RULES (Valen 2026-07-05):
//  · date BEFORE the first snapshot → null (a later theme never judges an older trade)
//  · date PROVIDED but unreadable/missing → null (never guess with the latest theme —
//    the trade might be from before coverage; it shows as Untagged instead)
//  · NO date argument at all (current-view widgets like the Theme Strip) → latest snapshot
// Backfilling older dated snapshots into THEME_SNAPSHOTS auto-extends coverage backwards.
export function snapshotFor(date) {
  const keys = Object.keys(THEME_SNAPSHOTS).sort();
  if (!keys.length) return null;
  if (date != null && date !== "") {
    const d = dnorm(date);
    if (!d || d < keys[0]) return null;
    let pick = keys[0];
    for (const k of keys) { if (k <= d) pick = k; else break; }
    return { date: pick, ...THEME_SNAPSHOTS[pick] };
  }
  const k = keys[keys.length - 1];
  return { date: k, ...THEME_SNAPSHOTS[k] };
}
export function latestSnapshot() { const keys = Object.keys(THEME_SNAPSHOTS).sort(); return keys.length ? { date: keys[keys.length - 1], ...THEME_SNAPSHOTS[keys[keys.length - 1]] } : null; }

export function top5(tf, date) { const s = snapshotFor(date); return s && s[tf] ? s[tf].slice(0, 5).map(x => x[0]) : []; }
// themes that are TOP-5 in BOTH 1W and 1M (the consistent leaders)
export function consistentTop(date) { const w = new Set(top5("week", date)); return top5("month", date).filter(t => w.has(t)); }

const rankIn = (list, sector) => { const i = (list || []).findIndex(([n]) => n === sector); return i < 0 ? null : i + 1; };
export function themeRanks(sector, date) {
  // TRADE context — a date is required. null/missing/unreadable entry = no judgement at all
  // (snapshotFor's latest-snapshot fallback is ONLY for current-view widgets that pass no date).
  if (!sector || date == null || date === "" || !dnorm(date)) return null;
  const s = snapshotFor(date); if (!s) return null;
  return { day: rankIn(s.day, sector), week: rankIn(s.week, sector), month: rankIn(s.month, sector), date: s.date };
}
// 'in' if top-5 in week OR month at that date; 'off' otherwise; null if sector unknown
export function themeFit(sector, entryDate) {
  if (!sector) return null;
  const r = themeRanks(sector, entryDate); if (!r) return null;
  return ((r.week && r.week <= 5) || (r.month && r.month <= 5)) ? "in" : "off";
}
