// ─────────────────────────────────────────────────────────────
// DeepVue Theme Tracker — dated snapshots (Valen updates these in AI-OS).
// A position's in/off-theme is judged against the snapshot nearest its ENTRY date.
// in-theme (green)  = sector is TOP-5 in the 1-week OR 1-month tracker
// off-theme (red)   = not in either top-5
// Source of truth = Valen's DeepVue charts. Add a new dated block each update.
// ─────────────────────────────────────────────────────────────

export const THEME_SNAPSHOTS = {
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
// nearest snapshot on or before the given date (fallback: earliest)
export function snapshotFor(date) {
  const keys = Object.keys(THEME_SNAPSHOTS).sort();
  if (!keys.length) return null;
  const d = dnorm(date) || keys[keys.length - 1];
  let pick = keys[0];
  for (const k of keys) { if (k <= d) pick = k; else break; }
  return { date: pick, ...THEME_SNAPSHOTS[pick] };
}
export function latestSnapshot() { const keys = Object.keys(THEME_SNAPSHOTS).sort(); return keys.length ? { date: keys[keys.length - 1], ...THEME_SNAPSHOTS[keys[keys.length - 1]] } : null; }

export function top5(tf, date) { const s = snapshotFor(date); return s && s[tf] ? s[tf].slice(0, 5).map(x => x[0]) : []; }
// themes that are TOP-5 in BOTH 1W and 1M (the consistent leaders)
export function consistentTop(date) { const w = new Set(top5("week", date)); return top5("month", date).filter(t => w.has(t)); }

const rankIn = (list, sector) => { const i = (list || []).findIndex(([n]) => n === sector); return i < 0 ? null : i + 1; };
export function themeRanks(sector, date) {
  const s = snapshotFor(date); if (!s || !sector) return null;
  return { day: rankIn(s.day, sector), week: rankIn(s.week, sector), month: rankIn(s.month, sector), date: s.date };
}
// 'in' if top-5 in week OR month at that date; 'off' otherwise; null if sector unknown
export function themeFit(sector, entryDate) {
  if (!sector) return null;
  const r = themeRanks(sector, entryDate); if (!r) return null;
  return ((r.week && r.week <= 5) || (r.month && r.month <= 5)) ? "in" : "off";
}
