// scripts/earnings-fetch.mjs — Earnings Calendar snapshot builder (V4: est→actual lifecycle + reactions).
// Writes src/earnings-data.js (the committed base the page reads).
//
// SOURCE PRIORITY (documented, no fabrication — absent field = null):
//   (a) FINNHUB — if a FINNHUB / FINNHUB_KEY / FINNHUB_API_KEY var is present, use
//       /calendar/earnings?from=&to=&token= (epsEstimate/epsActual/revenueEstimate).
//   (b) FALLBACK (no key) — api.nasdaq.com/api/calendar/earnings?date=YYYY-MM-DD (browser UA).
//       Nasdaq has TWO schemas:
//         PAST   → { time, symbol, name, eps:"$4.31", surprise:"11.37", marketCap, epsForecast, noOfEsts }
//         FUTURE → { time:"time-pre-market"/"time-after-hours", symbol, name, marketCap, epsForecast,
//                   noOfEsts, lastYearRptDt, lastYearEPS }
//       Parsed into rows: { t, name, time, epsEst, epsActual|null, surprisePct|null, yearAgoEps|null,
//       noEsts|null, mcap, rank }. Revenue is not published here → revEst stays null.
//
// RANGE: past 7 TRADING days + today → today+14 calendar days (weekends skipped).
//
// PRICE REACTION (past-day reporters only) via the candles proxy: for at most (top 25 by mcap
// per day ∪ all liquid-leader reporters that day) — reactionDay = report day if time==="bmo" else
// the next trading day (amc/tbc). gapPct=(rOpen−prevClose)/prevClose; dayPct=(rClose−rOpen)/rOpen;
// totalPct=(rClose−prevClose)/prevClose (all ×100). Stored on the row as `rx`; not computable
// (below cap / bars missing / reaction day not yet traded) → rx:null. Per-day reactionsComputedFor.
//
// Run:  node --env-file=.env.local scripts/earnings-fetch.mjs   (works keyless too)

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GROUP_RS } from "../src/groupRS-data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "src", "earnings-data.js");

const PER_DAY_CAP = 60;
const TOP_N_FOR_REACTION = 25;         // top-by-cap reporters per past day that get a reaction pass
const CANDLE_URL = "https://www.valensontrades.com/api/candles";
const THROTTLE_MS = 1600;              // between candle fetches
const RETRY_WAIT_MS = 61000;          // one retry on rate-limit
const FINNHUB_KEY = process.env.FINNHUB_KEY || process.env.FINNHUB_API_KEY || process.env.FINNHUB || null;

const LIQUID_LEADERS = new Set((GROUP_RS?.ll || []).map((r) => r.t));

// ── date helpers ─────────────────────────────────────────────────────────────
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addISO = (s, n) => iso(addDays(new Date(s + "T12:00:00Z"), n));
const isWeekend = (s) => { const g = new Date(s + "T12:00:00Z").getUTCDay(); return g === 0 || g === 6; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 100) / 100);

function buildRange() {
  const today = new Date();
  // past 7 trading days (exclusive of today)
  const past = [];
  let d = addDays(today, -1);
  while (past.length < 7) { const s = iso(d); if (!isWeekend(s)) past.unshift(s); d = addDays(d, -1); }
  // today → +14 calendar days, weekends skipped
  const fwd = [];
  for (let i = 0; i <= 14; i++) { const s = iso(addDays(today, i)); if (!isWeekend(s)) fwd.push(s); }
  return { range: [...past, ...fwd], today: iso(today) };
}

// ── parsers ──────────────────────────────────────────────────────────────────
const parseMoney = (s) => { // "$4.31", "($0.12)", "−$0.12", "-$0.12" → number
  if (s == null || s === "" || s === "N/A") return null;
  let str = String(s).trim(); let neg = false;
  if (/^\(.*\)$/.test(str)) { neg = true; str = str.slice(1, -1); }
  if (/[-−]/.test(str)) neg = true;
  const n = Number(str.replace(/[^0-9.]/g, ""));
  if (!isFinite(n)) return null;
  return neg ? -n : n;
};
const parsePct = (s) => {
  if (s == null || s === "" || s === "N/A") return null;
  const n = Number(String(s).replace(/[^0-9.\-−]/g, "").replace("−", "-"));
  return isFinite(n) ? n : null;
};
const parseCap = (s) => { const n = parseMoney(s); return n && n !== 0 ? Math.round(n) : null; };

const nasdaqTime = (t) => (t === "time-pre-market" ? "bmo" : t === "time-after-hours" ? "amc" : null);
const finnhubTime = (h) => (h === "bmo" ? "bmo" : h === "amc" ? "amc" : null);

// ── FALLBACK: nasdaq per-day (dual schema) ──────────────────────────────────
async function fetchNasdaqDay(date) {
  const r = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*", "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!r.ok) throw new Error(`nasdaq HTTP ${r.status}`);
  const j = await r.json();
  const rows = j?.data?.rows;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      t: String(row.symbol || "").toUpperCase().trim(),
      name: (row.name || "").trim(),
      time: nasdaqTime(row.time),
      epsEst: parseMoney(row.epsForecast),
      epsActual: parseMoney(row.eps),           // present only on PAST rows
      surprisePct: parsePct(row.surprise),      // present only on PAST rows
      yearAgoEps: parseMoney(row.lastYearEPS),  // present only on FUTURE rows
      noEsts: parseMoney(row.noOfEsts),
      revEst: null,                             // nasdaq publishes no revenue estimate
      _mcap: parseCap(row.marketCap),
    }))
    .filter((x) => x.t);
}

// ── PRIMARY: finnhub whole-range ─────────────────────────────────────────────
async function fetchFinnhubRange(from, to) {
  const r = await fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${FINNHUB_KEY}`);
  if (!r.ok) throw new Error(`finnhub HTTP ${r.status}`);
  const j = await r.json();
  const rows = j?.earningsCalendar;
  const byDay = {};
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row.date) continue;
      const est = row.epsEstimate ?? null, act = row.epsActual ?? null;
      (byDay[row.date] ||= []).push({
        t: String(row.symbol || "").toUpperCase().trim(),
        name: "",
        time: finnhubTime(row.hour),
        epsEst: est,
        epsActual: act,
        surprisePct: est != null && act != null && est !== 0 ? Math.round(((act - est) / Math.abs(est)) * 1000) / 10 : null,
        yearAgoEps: null,
        noEsts: null,
        revEst: row.revenueEstimate ?? null,
        _mcap: null,
      });
    }
  }
  return byDay;
}

const finalizeDay = (rows) => {
  const sorted = [...rows].sort((a, b) => (b._mcap ?? -1) - (a._mcap ?? -1));
  const total = sorted.length;
  const kept = sorted.slice(0, PER_DAY_CAP).map(({ _mcap, ...r }, i) => ({
    ...r,
    mcap: _mcap != null && isFinite(_mcap) ? Math.round(_mcap) : null,
    rank: i + 1,
    rx: null,
  }));
  return { kept, total };
};

// ── candles (retry on ANY transient failure; long wait when the source signals a per-minute cap) ─
const RATE_RE = /rate|429|limit|exceeded|maximum|per\s*minute|too many/i;
async function fetchCandles(sym, from, to) {
  const url = `${CANDLE_URL}?symbol=${encodeURIComponent(sym)}&from=${from}&to=${to}&res=1day`;
  const MAX = 3;
  for (let attempt = 0; attempt < MAX; attempt++) {
    let rateHit = false;
    try {
      const r = await fetch(url);
      const j = await r.json().catch(() => null);
      if (r.ok && j && j.ok && Array.isArray(j.candles)) {
        return j.candles.map((c) => ({ date: new Date(c.time * 1000).toISOString().slice(0, 10), o: c.open, h: c.high, l: c.low, c: c.close }));
      }
      const msg = `${r.status} ${(j && (j.error || j.message)) || ""}`;
      rateHit = r.status === 429 || RATE_RE.test(msg);
      if (attempt < MAX - 1) {
        if (rateHit) { console.log(`      rate cap on ${sym} — waiting 61s (attempt ${attempt + 1})`); await sleep(RETRY_WAIT_MS); }
        else { await sleep(3000); }
        continue;
      }
      return null;
    } catch (e) {
      if (attempt < MAX - 1) { await sleep(3000); continue; }
      return null;
    }
  }
  return null;
}

// reaction from a daily candle series. bmo → reaction is the report day; amc/tbc → next trading day.
function reactionFromCandles(candles, reportDay, time) {
  if (!Array.isArray(candles) || candles.length < 2) return null;
  const sameDay = time === "bmo";
  const ri = sameDay ? candles.findIndex((c) => c.date >= reportDay) : candles.findIndex((c) => c.date > reportDay);
  if (ri < 1) return null; // reaction bar missing or no prior bar
  const rday = candles[ri], prev = candles[ri - 1];
  if (!rday || !prev || !prev.c || !rday.o) return null;
  return { gapPct: r2((rday.o - prev.c) / prev.c * 100), dayPct: r2((rday.c - rday.o) / rday.o * 100), totalPct: r2((rday.c - prev.c) / prev.c * 100) };
}

async function main() {
  const { range, today } = buildRange();
  const from = range[0], to = range[range.length - 1];
  const source = FINNHUB_KEY ? "finnhub" : "nasdaq";
  console.log(`[earnings] source=${source} range=${from}..${to} (today=${today})`);

  const days = {};
  const notes = [];

  if (FINNHUB_KEY) {
    let byDay = {};
    try { byDay = await fetchFinnhubRange(from, to); } catch (e) { notes.push(`Finnhub fetch failed: ${e.message}`); }
    for (const d of range) { const rows = byDay[d] || []; if (!rows.length) continue; const { kept, total } = finalizeDay(rows); days[d] = { rows: kept, totalCount: total }; }
  } else {
    for (const d of range) {
      if (isWeekend(d)) continue;
      try {
        const rows = await fetchNasdaqDay(d);
        if (!rows.length) { console.log(`  ${d}: (none)`); continue; }
        const { kept, total } = finalizeDay(rows);
        days[d] = { rows: kept, totalCount: total };
        console.log(`  ${d}: ${kept.length}${total > kept.length ? ` of ${total}` : ""}`);
      } catch (e) { console.error(`  ${d}: FAILED ${e.message}`); notes.push(`${d}: source fetch failed (${e.message})`); }
      await sleep(350);
    }
  }

  // ── REACTION PASS (past trading days only) ─────────────────────────────────
  const pastDays = Object.keys(days).filter((d) => d < today).sort();
  let totalRx = 0, totalSkip = 0;
  console.log(`[earnings] reaction pass over ${pastDays.length} past day(s) — top ${TOP_N_FOR_REACTION} by cap ∪ liquid leaders`);
  for (const d of pastDays) {
    const rows = days[d].rows;
    const set = rows.filter((r) => (r.rank && r.rank <= TOP_N_FOR_REACTION) || LIQUID_LEADERS.has(r.t));
    let computed = 0, skipped = 0;
    const cf = addISO(d, -12), ct = addISO(d, 12);
    for (const r of set) {
      const candles = await fetchCandles(r.t, cf, ct);
      const rx = candles ? reactionFromCandles(candles, d, r.time) : null;
      if (rx) { r.rx = rx; computed++; } else { skipped++; }
      await sleep(THROTTLE_MS);
    }
    days[d].reactionsComputedFor = computed;
    totalRx += computed; totalSkip += skipped;
    console.log(`  ${d}: reactions ${computed}/${set.length} (skipped ${skipped})`);
  }
  console.log(`[earnings] reactions computed=${totalRx} skipped=${totalSkip}`);

  const payload = {
    asof: to,
    refreshed: iso(new Date()),
    source,
    note: notes.length ? notes.join(" · ") : null,
    days,
  };

  const banner =
    `// AUTO-GENERATED by scripts/earnings-fetch.mjs — DO NOT EDIT BY HAND.\n` +
    `// Refresh: node --env-file=.env.local scripts/earnings-fetch.mjs\n` +
    `// V4 est→actual lifecycle. source="${source}". Rows: { t, name, time:"bmo"|"amc"|null, epsEst,\n` +
    `// epsActual|null, surprisePct|null, yearAgoEps|null, noEsts|null, revEst, mcap, rank, rx }.\n` +
    `// rx (past-day reporters only) = { gapPct, dayPct, totalPct } price reaction from daily candles;\n` +
    `// null when not computed. Revenue/actual are null when the source doesn't publish them (never\n` +
    `// fabricated). Report dates are SCHEDULED and can shift until confirmed. reactionsComputedFor =\n` +
    `// per-day count of the top-by-cap ∪ liquid-leader reporters that got a reaction.\n`;
  writeFileSync(OUT, banner + `export const EARNINGS = ${JSON.stringify(payload, null, 2)};\n`);
  const total = Object.values(days).reduce((s, d) => s + d.rows.length, 0);
  console.log(`[earnings] wrote ${OUT} — ${Object.keys(days).length} days, ${total} rows.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
