// WATCHLIST-RS — per-STOCK Thrust/RS numbers for every non-INDEX ticker on Valen's TradingView
// watchlist (src/watchlist-data.js), using the EXACT SAME formulas as the Group RS rotation
// table's Liquid Leaders lens (scripts/group-rs.mjs) — just over the watchlist's own tickers
// instead of the curated LL universe. Benchmarked vs RSP (S&P 500 equal-weight), per Jeff Sun's
// own "benchmark" row (jeff-sun-master-system.md §14b-0).
//
// Usage:
//   node --env-file=.env.local scripts/watchlist-rs.mjs              (fetch missing, then compute)
//   node --env-file=.env.local scripts/watchlist-rs.mjs --from-cache (formula-only rerun, no fetch)
// Writes: src/watchlistRS-data.js  →  export const WATCHLIST_RS = { asof, refreshed, rows:[...] };
//
// Every number is bar-derived; a ticker whose bars can't be fetched/computed is written with
// thrust:null, rs1m:null (never guessed) and listed as a failure. DeepVue stays the source of
// truth for single-stock RS and sector grouping — this is a THRUST/RS rotation lens computed
// from daily closes, same machinery as the group table.
//
// ── CACHE TRAPS (burned us before — see scripts/group-rs.mjs) ──────────────────────────────────
// scripts/.grouprs-cache.json's `raw`/`rawLL`/`rawPF` are ARRAYS of {t,...,bars} — NOT objects.
// Never assign object keys onto them (JSON.stringify silently drops non-array-index props).
// This script adds its OWN array field `rawWL` to the same cache file for watchlist-only tickers
// (kept separate from raw/rawLL/rawPF so group-rs.mjs's own --from-cache run never sees/serves
// these extra rows in the main Group RS / Liquid Leaders tables).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { WATCHLIST } from "../src/watchlist-data.js";

const PROXY = "https://www.valensontrades.com/api/candles";
const CACHE = "scripts/.grouprs-cache.json";
const BENCH = "RSP";
const FETCH_PACE_MS = 15000; // proven repair-script pacing (backfill-ll-cache.mjs / burst-log.mjs use 13s; task spec = 15s)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shift = (ds, n) => { const d = new Date(ds + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Stamp on Valen's clock (MYT) — node build lacks tz ICU, so local date parts (script always runs
// on his Mac, whose local clock IS MYT) — identical to group-rs.mjs.
const _d = new Date(), _p = (n) => String(n).padStart(2, "0");
const today = `${_d.getFullYear()}-${_p(_d.getMonth() + 1)}-${_p(_d.getDate())}`;
const FROM = shift(today, -420); // ~420 calendar days back → comfortably >252 trading bars

// ── bars() — byte-identical shape/logic to group-rs.mjs (retry once after 61s on ANY failure).
async function barsRaw(sym, from, to, res = "1day") {
  const r = await fetch(`${PROXY}?symbol=${sym}&from=${from}&to=${to}&res=${res}`);
  const j = await r.json();
  if (!j.ok || !j.candles?.length) throw new Error(`${sym}: ${j.error || "no bars"}`);
  return j.candles.map(c => ({ d: new Date(c.time * 1000).toISOString().slice(0, 10), t: c.time, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume }));
}
async function bars(sym) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await barsRaw(sym, FROM, today); }
    catch (e) {
      if (attempt === 0) { console.log(`  ⚠︎ ${sym} failed (${e.message}) — waiting 61s and retrying once…`); await sleep(61000); }
      else throw e;
    }
  }
}

// ── SPLIT ADJUSTMENT — copied verbatim from scripts/group-rs.mjs (2026-07-31 fix). Cache stays
// RAW; adjustment is compute-time only. See group-rs.mjs for the full provenance comment.
const SPLIT_RATIOS = [2, 3, 4, 5, 6, 7, 8, 10, 15, 20].flatMap(k => [k, 1 / k]);
async function confirmSplit(ticker, date) {
  const key = process.env.POLYGON_API_KEY;
  if (!key) return null; // unknown — heuristic decides
  try {
    const r = await fetch(`https://api.polygon.io/v3/reference/splits?ticker=${ticker}&execution_date=${date}&apiKey=${key}`);
    const j = await r.json();
    if (Array.isArray(j.results) && j.results.length) {
      const sp = j.results[0];
      return sp.split_to / sp.split_from;
    }
    return false;
  } catch { return null; }
}
async function splitAdjust(b, tag) {
  if (!b || b.length < 2) return b;
  let out = null;
  for (let i = 1; i < b.length; i++) {
    const prev = (out || b)[i - 1].c, open = (out || b)[i].o;
    if (!prev || !open) continue;
    const r = prev / open;
    if (r > 0.6 && r < 1.6) continue;
    const cand = SPLIT_RATIOS.find(k => Math.abs(r / k - 1) < 0.04);
    if (!cand) continue;
    const confirmed = await confirmSplit(tag, b[i].d);
    if (confirmed === false) { console.log(`  split? ${tag} ${b[i].d} ratio ${r.toFixed(3)} — Polygon says NO split; leaving raw`); continue; }
    const div = confirmed || cand;
    console.log(`  SPLIT ADJ: ${tag} ${div >= 1 ? Math.round(div) + ":1" : "1:" + Math.round(1 / div)} on ${b[i].d}${confirmed ? " (API-confirmed)" : " (heuristic)"}`);
    out = out || b.map(x => ({ ...x }));
    for (let j = 0; j < i; j++) { out[j].o /= div; out[j].h /= div; out[j].l /= div; out[j].c /= div; out[j].v *= div; }
  }
  return out || b;
}

// ── computeRaw() — copied verbatim from scripts/group-rs.mjs. Needs module-scope `spyByDate`
// (RSP close-by-date map, set below once the benchmark is loaded). Only .rs1mOwn/.thrustOwn are
// consumed by this script; the rest of the shape is kept so the formula stays byte-identical.
let spyByDate;
function computeRaw(b) {
  const aligned = b.filter(x => spyByDate.has(x.d)).map(x => ({ ...x, rel: x.c / spyByDate.get(x.d) }));
  const n = aligned.length;
  if (n < 22) return null;
  const rel = aligned.map(x => x.rel);
  const last = n - 1;

  const prank = (arr, x) => {
    const below = arr.filter(v => v < x).length;
    return arr.length > 1 ? below / (arr.length - 1) : null;
  };
  const rs1mOwn = prank(rel.slice(last - 20, last + 1), rel[last]) * 100;

  const rs1wAt = (e) => prank(rel.slice(e - 6, e + 1), rel[e]) * 100;
  let thrustOwn = null;
  if (n >= 30) {
    const w_t = rs1wAt(last), w_t3 = rs1wAt(last - 3);
    thrustOwn = Math.round(0.6 * w_t + 0.4 * rs1mOwn + 0.1 * (w_t - w_t3));
  }
  return { rs1mOwn, thrustOwn };
}

// ── watchlist tickers: every non-INDEX section, deduped, order-preserved.
const wlTickers = [];
for (const s of WATCHLIST.sections) {
  if (s.key === "index") continue;
  for (const t of s.tickers) if (!wlTickers.includes(t)) wlTickers.push(t);
}
console.log(`WATCHLIST-RS · ${wlTickers.length} non-INDEX tickers (from ${WATCHLIST.sections.length} sections, asof ${WATCHLIST.asof})`);

// ── load cache (required — this is where RSP benchmark + LL/raw/PF overlap bars live).
if (!existsSync(CACHE)) {
  console.error(`FATAL: ${CACHE} not found — run scripts/group-rs.mjs once (without --from-cache) first to seed the benchmark cache.`);
  process.exit(1);
}
const cache = JSON.parse(readFileSync(CACHE, "utf8"));
const spy = cache.benchmarks?.[BENCH];
if (!spy) { console.error(`FATAL: benchmark ${BENCH} not in cache — run scripts/group-rs.mjs once (without --from-cache) first.`); process.exit(1); }
spyByDate = new Map(spy.map(b => [b.d, b.c]));
cache.rawWL = cache.rawWL || []; // our own array field — see header comment.

const fromCacheOnly = process.argv.includes("--from-cache");

// ── lookup helper: find already-cached bars for a ticker across every universe array (arrays,
// never object-key lookups, per the CACHE TRAPS note).
function cachedBarsFor(t) {
  const hit = (cache.rawLL || []).find(x => x.t === t) || (cache.raw || []).find(x => x.t === t) ||
              (cache.rawPF || []).find(x => x.t === t) || cache.rawWL.find(x => x.t === t);
  return hit && hit.bars ? hit.bars : null;
}

const startTime = Date.now();
const results = []; // { t, bars|null }
const failed = [];
let fetchedCount = 0;

for (let i = 0; i < wlTickers.length; i++) {
  const t = wlTickers[i];
  let b = cachedBarsFor(t);
  if (b) {
    console.log(`[${i + 1}/${wlTickers.length}] ${t}… cached (${b.length} bars) ✓`);
  } else if (fromCacheOnly) {
    console.log(`[${i + 1}/${wlTickers.length}] ${t}… NOT in cache and --from-cache set — skipping (null)`);
    failed.push(t);
    b = null;
  } else {
    if (fetchedCount > 0) await sleep(FETCH_PACE_MS);
    process.stdout.write(`[${i + 1}/${wlTickers.length}] ${t}… fetching… `);
    try {
      b = await bars(t);
      fetchedCount++;
      console.log(`${b.length} bars ✓`);
      cache.rawWL.push({ t, bars: b }); // persist for next --from-cache run
    } catch (e) {
      console.log(`FAILED (${e.message}) → row kept with nulls`);
      failed.push(t);
      b = null;
    }
  }
  results.push({ t, bars: b });
}

// ── split-adjustment pass (compute-time only, cache stays RAW) then formula compute.
const rows = [];
for (const r of results) {
  if (!r.bars) { rows.push({ t: r.t, thrust: null, rs1m: null }); continue; }
  const adj = await splitAdjust(r.bars, r.t);
  const m = computeRaw(adj);
  if (!m) { rows.push({ t: r.t, thrust: null, rs1m: null }); if (!failed.includes(r.t)) failed.push(r.t); continue; }
  rows.push({ t: r.t, thrust: m.thrustOwn, rs1m: m.rs1mOwn });
}

// persist any newly-fetched bars back to the cache
if (fetchedCount > 0) {
  writeFileSync(CACHE, JSON.stringify(cache));
  console.log(`\ncache updated · +${fetchedCount} watchlist tickers → ${CACHE}`);
}

const asof = spy[spy.length - 1].d;
const payload = { asof, refreshed: today, rows };

const banner = `// AUTO-GENERATED by scripts/watchlist-rs.mjs — DO NOT EDIT BY HAND.
// Refresh: node --env-file=.env.local scripts/watchlist-rs.mjs   (add --from-cache for formula-only reruns)
// PER-STOCK thrust/rs1m for every non-INDEX ticker on Valen's TradingView watchlist
// (src/watchlist-data.js), vs RSP (equal-weight benchmark) — the SAME formulas as the Group RS /
// Liquid Leaders table (scripts/group-rs.mjs): rs1m = PERCENTRANK.INC of the RS ratio (close÷RSP)
// in its own trailing 21 sessions ×100; thrust = RS Thrust Rate % = 0.6·RS1W + 0.4·rs1m +
// 0.1·(RS1W_t − RS1W_{t-3}), RS1W = the same PERCENTRANK on a trailing 7-session window, rounded
// half-up. Every number is bar-derived; failed fetches are kept as rows with thrust:null/rs1m:null.
// DeepVue stays the source of truth for single-stock RS and sector grouping.
`;
writeFileSync("src/watchlistRS-data.js", banner + `export const WATCHLIST_RS = ${JSON.stringify(payload, null, 2)};\nexport default WATCHLIST_RS;\n`);

const ok = rows.filter(r => r.thrust != null).length;
const elapsedMin = ((Date.now() - startTime) / 60000).toFixed(1);
console.log(`\n✓ wrote src/watchlistRS-data.js · asof ${asof} · ${rows.length} rows (${ok} with numbers, ${failed.length} failed) · ${elapsedMin} min`);
if (failed.length) console.log(`  failed tickers: ${[...new Set(failed)].join(", ")}`);
