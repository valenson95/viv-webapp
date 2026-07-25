// One-off cache seeder: adds newly-listed Liquid Leaders tickers to scripts/.grouprs-cache.json
// so `group-rs.mjs --fast` can compute them WITHOUT a full 170-ticker refetch (20-40 min).
// Copies bars from raw/rawPF/benchmarks when the ticker is already cached in another universe;
// otherwise fetches ~420d of daily bars from the candles proxy (same shape as group-rs bars()).
// Usage: node scripts/backfill-ll-cache.mjs SOXX IWM IBIT …
import { readFileSync, writeFileSync } from "node:fs";

const CACHE = "scripts/.grouprs-cache.json";
const PROXY = "https://www.valensontrades.com/api/candles";
const NEW = process.argv.slice(2).map((s) => s.toUpperCase());
if (!NEW.length) { console.error("usage: node scripts/backfill-ll-cache.mjs TICKER [TICKER…]"); process.exit(1); }

const c = JSON.parse(readFileSync(CACHE, "utf8"));
c.rawLL = c.rawLL || [];
const have = new Set(c.rawLL.map((r) => r.t));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (d) => d.toISOString().slice(0, 10);
const today = iso(new Date());
const from = (() => { const d = new Date(); d.setDate(d.getDate() - 420); return iso(d); })();
const donor = (t) =>
  c.benchmarks?.[t] ||
  (c.raw || []).find((r) => r.t === t)?.bars ||
  (c.rawPF || []).find((r) => r.t === t)?.bars || null;

let fetched = 0;
for (const t of NEW) {
  if (have.has(t)) { console.log(`${t}: already in LL cache — skip`); continue; }
  let bars = donor(t);
  if (bars) {
    console.log(`${t}: copied from existing cache (${bars.length} bars, thru ${bars[bars.length - 1]?.d})`);
  } else {
    if (fetched > 0) await sleep(13000); // shared 5/min key — pace between real fetches
    const r = await fetch(`${PROXY}?symbol=${t}&from=${from}&to=${today}&res=1day`);
    const j = await r.json();
    if (!j.ok || !j.candles?.length) { console.log(`${t}: FAILED (${j.error || "no bars"}) — row will show nulls`); continue; }
    bars = j.candles.map((x) => ({ d: iso(new Date(x.time * 1000)), t: x.time, o: x.open, h: x.high, l: x.low, c: x.close, v: x.volume }));
    fetched++;
    console.log(`${t}: fetched ${bars.length} bars (thru ${bars[bars.length - 1]?.d})`);
  }
  c.rawLL.push({ t, bars });
}
writeFileSync(CACHE, JSON.stringify(c));
console.log(`cache updated: ${c.rawLL.length} LL tickers`);
