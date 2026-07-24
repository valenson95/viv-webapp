// ─────────────────────────────────────────────────────────────
// BURST LOG — daily record of 20%-in-5-days (and 50%-in-40-days) movers.
// Two floors, two jobs:
//   STUDY floor  (avg SHARE vol 20d ≥ 100k · close ≥ $5)  → counts only = the froth gauge
//     (calibrated to the corpus doctrine: ~100–200 up-20% names = euphoric tape).
//   TRADE floor  (avg $ vol 20d ≥ $20M · close ≥ $5)      → full rows = Valen's tradeable world.
// Bars: /api/grouped (whole-market UNADJUSTED daily). Cache: scripts/.burstlog-cache.json
// (gitignored) — after the first backfill each run fetches only missing sessions.
// Honest-data notes: unadjusted closes → a reverse split can print a fake "burst"; rows with
// 5d move ≥ +150% carry flag:"verify". RS ranks are NEVER computed here (DeepVue owns RS).
// Usage:  node scripts/burst-log.mjs            (append missing sessions; first run backfills)
//         node scripts/burst-log.mjs --sessions 25   (how many computed sessions to keep/backfill)
// ─────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import SECTORS from "../src/sectors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = path.join(__dirname, ".burstlog-cache.json");
const TYPES_FILE = path.join(__dirname, ".tickertypes-cache.json");
const OUT_FILE = path.join(__dirname, "..", "src", "burstLog-data.js");

// ── security-type filter: Common Stock + ADR only (mirrors the DeepVue "Include Type"
// chips; kills leveraged single-stock ETFs like SMCX/NBIG that pollute the burst lists).
// Pages through /api/tickertypes (key stays server-side); cache refreshes monthly.
async function loadStockSet() {
  try {
    const j = JSON.parse(fs.readFileSync(TYPES_FILE, "utf8"));
    if (Date.now() - j.ts < 30 * 86400e3) return new Set(j.tickers);
  } catch {}
  const tickers = [];
  for (const type of ["CS", "ADRC"]) {
    let cursor = "", pages = 0;
    while (pages < 15) {
      const r = await fetch(`https://www.valensontrades.com/api/tickertypes?type=${type}${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`);
      const j = await r.json().catch(() => ({}));
      if (!j.ok) {
        if (String(j.error || "").toLowerCase().includes("maximum requests")) { await sleep(61000); continue; }
        console.warn(`⚠ type ${type}: ${j.error || "proxy error"} — filter may be partial`); break;
      }
      tickers.push(...j.tickers); pages++;
      if (!j.next_cursor) break;
      cursor = j.next_cursor;
      await sleep(13000);
    }
  }
  if (tickers.length < 3000) { console.warn(`⚠ only ${tickers.length} CS/ADRC tickers fetched — filter SKIPPED as unsafe`); return null; }
  fs.writeFileSync(TYPES_FILE, JSON.stringify({ ts: Date.now(), tickers }));
  console.log(`  security-type filter: ${tickers.length} CS/ADRC tickers cached`);
  return new Set(tickers);
}

const ARG_SESSIONS = (() => {
  const i = process.argv.indexOf("--sessions");
  return i > -1 ? Math.max(5, parseInt(process.argv[i + 1], 10) || 25) : 25;
})();
const WINDOW = 41;                 // c40 anchor + today
const AVG_WIN = 20;                // avg-vol window
const NEED = ARG_SESSIONS + WINDOW;
const STUDY_SHARE_FLOOR = 100000;  // avg shares/day (his floor)
const TRADE_DVOL_FLOOR = 20e6;     // avg $/day (Valen's floor)
const PRICE_FLOOR = 5;
const PACE_MS = 13000;             // /api/grouped → Polygon free tier 5/min
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── cache: { "YYYY-MM-DD": null | [[T,c,v],...] }  (null = confirmed non-session)
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")); } catch {}

const fmt = (d) => d.toISOString().slice(0, 10);
let liveFetches = 0;

async function getDay(dateStr) {
  if (dateStr in cache) return cache[dateStr];
  if (liveFetches > 0) await sleep(PACE_MS);
  liveFetches++;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`https://www.valensontrades.com/api/grouped?date=${dateStr}`);
      const j = await r.json();
      if (j.ok && Array.isArray(j.results)) {
        const rows = j.results
          .filter((x) => /^[A-Z]{1,5}$/.test(x.T) && x.c >= 3 && x.v >= 20000)
          .map((x) => [x.T, x.c, x.v]);
        cache[dateStr] = rows.length ? rows : null; // empty market day = holiday
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
        process.stdout.write(`  ${dateStr}: ${rows.length ? rows.length + " rows" : "no session"}\n`);
        return cache[dateStr];
      }
      const msg = String(j.error || "").toLowerCase();
      if (msg.includes("not entitled") || msg.includes("end of day") || msg.includes("upcoming")) {
        // free-tier embargo on the newest session — treat as unavailable, DON'T cache
        process.stdout.write(`  ${dateStr}: embargoed (free-tier) — skipping\n`);
        return undefined;
      }
      process.stdout.write(`  ${dateStr}: upstream "${j.error || "?"}" — retry\n`);
      await sleep(61000);
    } catch (e) {
      process.stdout.write(`  ${dateStr}: ${e.message} — retry\n`);
      await sleep(61000);
    }
  }
  return undefined;
}

function themeOf(t) { return SECTORS[t] || null; }

async function main() {
  console.log(`BURST-LOG · target ${ARG_SESSIONS} computed sessions (window ${NEED} trading days)`);
  const stockSet = await loadStockSet();
  // Collect NEED trading sessions walking back from yesterday (UTC — the newest completed
  // session self-resolves via embargo/holiday skips; never trust the local clock for US dates).
  const sessions = []; // ascending later; collect descending first
  const d = new Date();
  d.setUTCDate(d.getUTCDate()); // start today UTC; embargo/holiday logic filters
  let guard = 0;
  while (sessions.length < NEED && guard < NEED * 3 + 30) {
    guard++;
    const dow = d.getUTCDay();
    const ds = fmt(d);
    d.setUTCDate(d.getUTCDate() - 1);
    if (dow === 0 || dow === 6) { cache[ds] = cache[ds] ?? null; continue; }
    const rows = await getDay(ds);
    if (rows === undefined) continue;          // embargoed/unreachable → older date next
    if (rows === null) continue;               // holiday
    sessions.push(ds);
  }
  sessions.reverse(); // ascending
  if (sessions.length < WINDOW + 1) { console.error("not enough sessions"); process.exit(1); }

  // ticker → Float64 series aligned to sessions (close, vol)
  const idxOf = Object.fromEntries(sessions.map((s, i) => [s, i]));
  const series = new Map(); // t -> {c: [], v: []}
  for (const s of sessions) {
    const i = idxOf[s];
    for (const [t, c, v] of cache[s]) {
      let e = series.get(t);
      if (!e) { e = { c: new Array(sessions.length).fill(null), v: new Array(sessions.length).fill(null) }; series.set(t, e); }
      e.c[i] = c; e.v[i] = v;
    }
  }

  const firstComputed = Math.max(WINDOW, sessions.length - ARG_SESSIONS);
  const out = [];
  for (let i = firstComputed; i < sessions.length; i++) {
    const date = sessions[i];
    const gauge = { up20: 0, down20: 0, up50: 0 };
    const gaugeUp = [];
    const rows = [], rows50 = [];
    for (const [t, e] of series) {
      if (stockSet && !stockSet.has(t)) continue; // common stock + ADR only
      const c = e.c[i];
      if (c == null || c < PRICE_FLOOR) continue;
      const c5 = e.c[i - 5], c40 = e.c[i - 40];
      // avg vols over the last 20 sessions (need ≥15 present days)
      let sv = 0, sd = 0, n = 0;
      for (let k = i - AVG_WIN + 1; k <= i; k++) {
        const vk = e.v[k], ck = e.c[k];
        if (vk != null && ck != null) { sv += vk; sd += vk * ck; n++; }
      }
      if (n < 15) continue;
      const avgShares = sv / n, avgDvol = sd / n;
      const study = avgShares >= STUDY_SHARE_FLOOR;
      const trade = avgDvol >= TRADE_DVOL_FLOOR;
      if (c5 != null) {
        const r5 = c / c5;
        if (r5 >= 1.2 && study) { gauge.up20++; gaugeUp.push(t); }
        if (r5 <= 0.8 && study) gauge.down20++;
        if (r5 >= 1.2 && trade) {
          const pct = (r5 - 1) * 100;
          rows.push({ t, pct: +pct.toFixed(1), c: +c.toFixed(2), dvM: +(avgDvol / 1e6).toFixed(1), theme: themeOf(t), ...(pct >= 150 ? { flag: "verify" } : {}) });
        }
      }
      if (c40 != null && c / c40 >= 1.5) {
        if (study) gauge.up50++;
        if (trade) rows50.push({ t, pct: +((c / c40 - 1) * 100).toFixed(1), c: +c.toFixed(2), dvM: +(avgDvol / 1e6).toFixed(1), theme: themeOf(t) });
      }
    }
    rows.sort((a, b) => b.pct - a.pct);
    rows50.sort((a, b) => b.pct - a.pct);
    out.push({ date, gauge, gaugeUp, rows, rows50 });
  }

  // new/repeat badges (appearances in prior 20 computed sessions) + forward returns
  const seenAt = new Map(); // t -> [sessionIdx...]
  out.forEach((s, si) => {
    for (const r of s.rows) {
      const prior = (seenAt.get(r.t) || []).filter((x) => si - x <= 20 && x < si);
      r.rep = prior.length;                      // 0 = 🆕 first appearance in the log window
      const arr = seenAt.get(r.t) || []; arr.push(si); seenAt.set(r.t, arr);
    }
  });
  out.forEach((s) => {
    const i = idxOf[s.date];
    for (const r of s.rows) {
      const e = series.get(r.t);
      const f3 = e?.c[i + 3], f5 = e?.c[i + 5];
      if (f3 != null) r.f3 = +(((f3 / r.c) - 1) * 100).toFixed(1);
      if (f5 != null) r.f5 = +(((f5 / r.c) - 1) * 100).toFixed(1);
    }
  });

  // aggregates (SampleTagged) over rows old enough to have f3
  const aged = out.flatMap((s) => s.rows.filter((r) => r.f3 != null && !r.flag));
  const med = (a) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return +(b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2).toFixed(2); };
  const stats = {
    n: aged.length,
    medF3All: med(aged.map((r) => r.f3)),
    medF5All: med(aged.filter((r) => r.f5 != null).map((r) => r.f5)),
    newN: aged.filter((r) => r.rep === 0).length,
    medF3New: med(aged.filter((r) => r.rep === 0).map((r) => r.f3)),
    repN: aged.filter((r) => r.rep > 0).length,
    medF3Rep: med(aged.filter((r) => r.rep > 0).map((r) => r.f3)),
  };

  out.reverse(); // newest first for the page
  const now = new Date();
  const updated = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")} MYT`;
  const payload = { asof: out[0]?.date || null, updated, floors: { studyShares: STUDY_SHARE_FLOOR, tradeDvol: TRADE_DVOL_FLOOR, price: PRICE_FLOOR }, stats, sessions: out };
  fs.writeFileSync(OUT_FILE,
    "// AUTO-GENERATED by scripts/burst-log.mjs — do not hand-edit.\n" +
    "// Daily 20%/5d + 50%/40d movers, dual floors (study gauge / tradeable rows). Admin-only page.\n" +
    "export const BURST_LOG = " + JSON.stringify(payload) + ";\n");
  console.log(`✓ wrote src/burstLog-data.js · asof ${payload.asof} · ${out.length} sessions · gauge latest up20=${out[0]?.gauge.up20} · tradeable latest=${out[0]?.rows.length} · aged n=${stats.n}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
