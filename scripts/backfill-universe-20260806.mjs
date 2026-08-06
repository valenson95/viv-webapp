// One-shot: backfill EVERY new ticker for the 2026-08-06 rotation expansion into
// scripts/.grouprs-cache.json — the three non-ranked ladder blocks (Style · Country · Macro)
// plus the two new tradeable theme groups (DRAM, EUV) that join the ranked groups table.
//
// Cache law: `raw` / `rawLad` are ARRAYS of {t,name,bars} — find/splice, never object-key writes.
// Anything already cached anywhere (raw / rawPF / rawLL / benchmarks) is SKIPPED — group-rs.mjs
// looks a ladder ticker up across every cached section, so we never duplicate a cache entry.
//
// Pacing: the candles proxy is rate-limited ~5/min → 15s between requests, timed INSIDE node.
// Trim: any bar dated AFTER the universe's common last session (the RSP benchmark's last date)
// is a PARTIAL current-session bar → dropped, so every row computes off the same closed window.
//
// Run: node --env-file=.env.local scripts/backfill-universe-20260806.mjs
import { readFileSync, writeFileSync } from "fs";

// Default = the live proxy. CANDLES_BASE + CANDLES_COOKIE let this run against the SAME
// serverless function on its deployment URL when the custom domain is sitting behind an edge
// challenge (2026-08-06) — same code, same key, same bars; only the hostname differs.
const PROXY = (process.env.CANDLES_BASE || "https://www.valensontrades.com") + "/api/candles";
const COOKIE = process.env.CANDLES_COOKIE || "";
const PATH = "scripts/.grouprs-cache.json";
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const shift = (ds, n) => { const d = new Date(ds + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const _d = new Date(), _p = (n) => String(n).padStart(2, "0");
const today = `${_d.getFullYear()}-${_p(_d.getMonth() + 1)}-${_p(_d.getDate())}`;
const FROM = shift(today, -420);

// [ticker, display name, destination section]
//   "raw"    → joins the RANKED groups table (must also exist in group-rs.mjs UNIVERSE)
//   "rawLad" → ladder-only bars (Style / Country / Macro blocks; never ranked)
const WANT = [
  // ── ranked theme adds
  ["DRAM", "Memory", "raw"],
  ["EUV", "Lithography/Photonics", "raw"],
  // ── COUNTRY ladder
  ["EWY", "South Korea", "rawLad"],
  ["EWJ", "Japan", "rawLad"],
  ["INDA", "India", "rawLad"],
  ["MCHI", "China", "rawLad"],
  ["EEM", "Emerging Markets", "rawLad"],
  // ── MACRO ladder
  ["GLD", "Gold", "rawLad"],
  ["UUP", "US Dollar", "rawLad"],
  // NOTE: SLV / TLT / USO / IBIT / KWEB / EWZ and every STYLE ticker (IVW IVE IJK IJJ IJT IJS)
  // are ALREADY cached in raw / rawPF / rawLL — reused in place, never re-fetched.
];

// The proxy sits behind Vercel's edge protection, which can answer an HTML "Security Checkpoint"
// (HTTP 403) instead of JSON during a challenge window. Gate on a real JSON reply before touching
// the cache, then retry each ticker a few times — a challenged request must never be recorded as
// "no data" for a ticker that simply couldn't be asked.
const REACH_TRIES = 30, REACH_WAIT = 60000, TICKER_TRIES = 3, TICKER_WAIT = 60000;

// FALLBACK (2026-08-06): the edge challenge was up for the whole backfill window, so this script
// can fall back to the SAME upstream the proxy itself wraps (api/candles.js) using the project's
// own key from .env.vercel — identical endpoint, identical params (adjusted=false, sort=asc,
// 1/day) and identical normalization, so the bars are the same bars. NOT a new data source, and
// nothing else in the pipeline changes: group-rs.mjs still reads only the cache and the proxy.
//   Run with:  node --env-file=.env.local --env-file=.env.vercel scripts/backfill-universe-20260806.mjs
const POLY_KEY = process.env.POLYGON_API_KEY || "";
async function polygonDaily(sym) {
  const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(sym)}/range/1/day/${FROM}/${today}?adjusted=false&sort=asc&limit=50000&apiKey=${POLY_KEY}`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.status === "ERROR" || j.error) throw new Error(j.error || j.message || "upstream error");
  const candles = (j.results || []).map(b => ({ time: Math.floor(b.t / 1000), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }));
  if (!candles.length) throw new Error("no bars");
  return candles;
}
async function candles(sym) {
  try {
    const r = await fetch(`${PROXY}?symbol=${sym}&from=${FROM}&to=${today}&res=1day`, COOKIE ? { headers: { cookie: COOKIE } } : undefined);
    const body = await r.text();
    let j;
    try { j = JSON.parse(body); }
    catch { throw Object.assign(new Error(`proxy returned ${r.status} ${r.headers.get("content-type") || ""} (edge challenge, not JSON)`), { challenge: true }); }
    if (!j.ok || !j.candles?.length) throw new Error(j.error || "no bars");
    return j.candles;
  } catch (e) {
    if (!e.challenge || !POLY_KEY) throw e;
    return await polygonDaily(sym);
  }
}

let reachable = false;
for (let i = 1; i <= REACH_TRIES; i++) {
  try { await candles(WANT[0][0]); reachable = true; break; }
  catch (e) {
    if (/no bars|not found/i.test(e.message)) { reachable = true; break; } // proxy answered, ticker is the problem
    console.log(`proxy not answering JSON (try ${i}/${REACH_TRIES}) — ${e.message}; waiting 60s…`);
    if (i < REACH_TRIES) await sleep(REACH_WAIT);
  }
}
if (!reachable) { console.error("ABORT: the candles proxy never answered with JSON — cache left untouched."); process.exit(1); }

const cache = JSON.parse(readFileSync(PATH, "utf8"));
if (!Array.isArray(cache.raw)) throw new Error("cache.raw is not an array — refusing to touch it");
if (!Array.isArray(cache.rawLad)) cache.rawLad = [];

// common last session across the universe = the benchmark's last cached date
const COMMON_LAST = cache.benchmarks.RSP[cache.benchmarks.RSP.length - 1].d;
console.log(`common last session = ${COMMON_LAST} (bars after this are partial → trimmed)`);

const cached = new Set([
  ...Object.keys(cache.benchmarks),
  ...cache.raw.map(r => r.t), ...(cache.rawPF || []).map(r => r.t),
  ...(cache.rawLL || []).map(r => r.t), ...cache.rawLad.map(r => r.t),
]);

const todo = WANT.filter(([t]) => !cached.has(t));
const skipped = WANT.filter(([t]) => cached.has(t)).map(([t]) => t);
if (skipped.length) console.log(`already cached → skipped: ${skipped.join(", ")}`);
console.log(`fetching ${todo.length} ticker(s), 15s apart ≈ ${Math.ceil(todo.length * 15 / 60)} min\n`);

const failed = [];
for (let i = 0; i < todo.length; i++) {
  const [t, name, dest] = todo[i];
  process.stdout.write(`[${i + 1}/${todo.length}] ${t} (${name} → ${dest})… `);
  try {
    let candlesRaw = null, lastErr = null;
    for (let a = 1; a <= TICKER_TRIES; a++) {
      try { candlesRaw = await candles(t); break; }
      catch (e) { lastErr = e; if (a < TICKER_TRIES) { process.stdout.write(`retry ${a}… `); await sleep(TICKER_WAIT); } }
    }
    if (!candlesRaw) throw lastErr;
    let bars = candlesRaw.map(c => ({ d: new Date(c.time * 1000).toISOString().slice(0, 10), t: c.time, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume }));
    const before = bars.length;
    bars = bars.filter(b => b.d <= COMMON_LAST);           // drop partial current-session bar(s)
    if (!bars.length) throw new Error("no bars at/before the common last session");
    const list = cache[dest];
    const idx = list.findIndex(x => x.t === t);
    const entry = { t, name, bars };
    if (idx >= 0) list.splice(idx, 1, entry); else list.push(entry);
    console.log(`${bars.length} bars${before > bars.length ? ` (trimmed ${before - bars.length} partial)` : ""}, ${bars[0].d} → ${bars[bars.length - 1].d} ✓`);
  } catch (e) {
    failed.push(`${t} (${e.message})`);
    console.log(`FAILED — ${e.message}`);
  }
  if (i < todo.length - 1) await sleep(15000);
}

writeFileSync(PATH, JSON.stringify(cache));
console.log(`\ncache saved · raw ${cache.raw.length} · rawPF ${(cache.rawPF || []).length} · rawLL ${(cache.rawLL || []).length} · rawLad ${cache.rawLad.length}`);
if (failed.length) console.log(`FAILED: ${failed.join(" · ")}`);
