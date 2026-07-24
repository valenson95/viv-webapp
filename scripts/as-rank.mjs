// TRUE historical AS percentile — cross-sectional momentum rank of a ticker on a PAST date,
// computed the way a screener would have seen it THAT day: Polygon grouped-daily snapshots
// (every US ticker's close) at D and D−21/63/126 trading days → 1M/3M/6M returns for the whole
// tradeable universe → the target's percentile in each. Universe filter mirrors the screener
// floor: close ≥ $1 AND close×volume ≥ $1.5M on date D. Splits: grouped closes are UNadjusted —
// a split inside the lookback window distorts that ticker's return (incl. the target: warned).
// Snapshots cache to trading/data/grouped-cache/ (AI-OS, gitignored) — repeat dates are free.
// Needs POLYGON_API_KEY in .env.local. Free tier: ~5 calls/min (script waits) and ~2y history.
// Usage: node scripts/as-rank.mjs TICKER YYYY-MM-DD
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const KEY = env.POLYGON_API_KEY;
if (!KEY) { console.error("POLYGON_API_KEY missing from .env.local — paste it once (same key as Vercel env)."); process.exit(1); }
const [,, TICKER, DATE] = process.argv;
if (!TICKER || !/^\d{4}-\d{2}-\d{2}$/.test(DATE || "")) { console.error("Usage: node scripts/as-rank.mjs TICKER YYYY-MM-DD"); process.exit(1); }
const T = TICKER.toUpperCase();
const CACHE = `${process.env.HOME}/Desktop/AI-OS/trading/data/grouped-cache`;
mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const dstr = (d) => d.toISOString().slice(0, 10);
function shiftCal(dateStr, days) { const d = new Date(dateStr + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return dstr(d); }

// grouped-daily for a calendar date; walks back over weekends/holidays (max 7 tries).
async function grouped(dateStr) {
  let d = dateStr;
  for (let i = 0; i < 7; i++) {
    const f = `${CACHE}/${d}.json`;
    if (existsSync(f)) { const j = JSON.parse(readFileSync(f, "utf8")); if (j.resultsCount > 0) return { date: d, rows: j.results }; d = shiftCal(d, -1); continue; }
    for (;;) {
      const r = await fetch(`https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${d}?adjusted=false&apiKey=${KEY}`);
      const j = await r.json();
      if (j.status === "ERROR" && /maximum requests/i.test(j.error || "")) { console.log(`  rate-limited — waiting 61s (${d})`); await sleep(61000); continue; }
      if (j.status === "ERROR" || j.error) { console.error(`  ${d}: ${j.error || j.message}`); return null; }
      writeFileSync(f, JSON.stringify(j));
      if (j.resultsCount > 0) return { date: d, rows: j.results };
      d = shiftCal(d, -1); // holiday/weekend → step back
      break;
    }
  }
  return null;
}

// D−n trading days ≈ D−(n×1.45) calendar days, then grouped() walks to the nearest session.
const LOOKBACKS = [["1M", 21], ["3M", 63], ["6M", 126]];
console.log(`AS rank for ${T} @ ${DATE} (universe: close ≥$1 & $-vol ≥$1.5M on D)`);
const snapD = await grouped(DATE);
if (!snapD) { console.error("No market snapshot at D — date too old for this Polygon plan? (free ≈2y, Starter 5y)"); process.exit(1); }
const mapD = new Map(snapD.rows.map(r => [r.T, r]));
const tgtD = mapD.get(T);
if (!tgtD) { console.error(`${T} not in the ${snapD.date} snapshot (symbol change/delisting?).`); process.exit(1); }
console.log(`  D = ${snapD.date} · ${T} close ${tgtD.c} · universe candidates ${snapD.rows.length}`);

const out = {};
for (const [label, tdays] of LOOKBACKS) {
  const past = await grouped(shiftCal(snapD.date, -Math.round(tdays * 1.45)));
  if (!past) { out[label] = null; continue; }
  const mapP = new Map(past.rows.map(r => [r.T, r.c]));
  const rets = [];
  let tgtRet = null;
  for (const r of snapD.rows) {
    if (r.c < 1 || r.c * r.v < 1_500_000) continue;          // screener universe floor at D
    const p = mapP.get(r.T);
    if (!p || p <= 0) continue;                              // must exist at both ends (no IPO ghosts)
    const ret = r.c / p - 1;
    if (ret > 20) continue;                                   // >2000% in ≤6mo ⇒ almost surely an unadjusted split artifact — drop
    rets.push(ret);
    if (r.T === T) tgtRet = ret;
  }
  if (tgtRet == null) { out[label] = null; continue; }
  const below = rets.filter(x => x < tgtRet).length;
  const pctile = Math.round((below / rets.length) * 1000) / 10;
  out[label] = { date: past.date, ret: +(tgtRet * 100).toFixed(1), pctile, n: rets.length };
  console.log(`  ${label}: ${out[label].ret >= 0 ? "+" : ""}${out[label].ret}% since ${past.date} → percentile ${pctile} of ${rets.length}  ${pctile >= 98 ? "✅ AS≥98" : ""}`);
}
const passes = Object.values(out).filter(x => x && x.pctile >= 98).length;
console.log(`\nVERDICT: ${passes ? `✅ top-2% leader on ${passes} lookback(s)` : "❌ not a top-2% leader on any lookback"} at ${snapD.date}.`);
console.log(`(unadjusted closes — if ${T} split inside a window, that window's return is distorted; cross-check the chart)`);
