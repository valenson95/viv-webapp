// Vercel Serverless Function — Earnings Calendar freshness proxy (READ-ONLY).
// Mirrors the committed src/earnings-data.js shape so the page can refresh in production.
// Range: past 7 trading days (est→actual) + today→+14 calendar. Returns { asof, refreshed, source, note, days }.
// Rows carry epsEst/epsActual/surprisePct/yearAgoEps (dual nasdaq schema); rx stays null (client keeps snapshot rx).
//
// SOURCE PRIORITY (same doctrine as scripts/earnings-fetch.mjs):
//   (a) FINNHUB — if process.env.FINNHUB_API_KEY (or FINNHUB_KEY) is set, use
//       /calendar/earnings?from=&to=&token=  (gives epsEstimate + revenueEstimate).
//   (b) FALLBACK — api.nasdaq.com/api/calendar/earnings?date=YYYY-MM-DD (needs a browser UA;
//       revenue not published → revEst stays null, never fabricated).
// Cache: ~1h (earnings dates move slowly intraday). A day with no data is simply absent.

const FINNHUB_KEY = process.env.FINNHUB_API_KEY || process.env.FINNHUB_KEY || null;
const PER_DAY_CAP = 60;

let cache = null; // { data, ts }
const TTL = 60 * 60 * 1000; // 1 hour

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const isWeekend = (s) => { const g = new Date(s + "T12:00:00Z").getUTCDay(); return g === 0 || g === 6; };
// "$4.31", "($0.12)", "−$0.12" → number
const parseMoney = (s) => {
  if (s == null || s === "" || s === "N/A") return null;
  let str = String(s).trim(); let neg = false;
  if (/^\(.*\)$/.test(str)) { neg = true; str = str.slice(1, -1); }
  if (/[-−]/.test(str)) neg = true;
  const n = Number(str.replace(/[^0-9.]/g, ""));
  if (!isFinite(n)) return null;
  return neg ? -n : n;
};
const parsePct = (s) => { if (s == null || s === "" || s === "N/A") return null; const n = Number(String(s).replace(/[^0-9.\-−]/g, "").replace("−", "-")); return isFinite(n) ? n : null; };
const parseCap = (s) => { const n = parseMoney(s); return n && n !== 0 ? Math.round(n) : null; };
const nasdaqTime = (t) => (t === "time-pre-market" ? "bmo" : t === "time-after-hours" ? "amc" : null);
const finnhubTime = (h) => (h === "bmo" ? "bmo" : h === "amc" ? "amc" : null);

// Past 7 TRADING days + today → today+14 calendar days (weekends skipped) — mirrors the snapshot.
function buildRange() {
  const today = new Date();
  const past = [];
  let d = addDays(today, -1);
  while (past.length < 7) { const s = iso(d); if (!isWeekend(s)) past.unshift(s); d = addDays(d, -1); }
  const fwd = [];
  for (let i = 0; i <= 14; i++) { const s = iso(addDays(today, i)); if (!isWeekend(s)) fwd.push(s); }
  return [...past, ...fwd];
}

const finalizeDay = (rows) => {
  const sorted = [...rows].sort((a, b) => (b._mcap ?? -1) - (a._mcap ?? -1));
  const total = sorted.length;
  // Keep `mcap` + a 1-based cap-sorted `rank`. `rx` is null here — reactions live in the committed
  // snapshot (candles aren't computed server-side); the client keeps snapshot rx on live refresh.
  const kept = sorted.slice(0, PER_DAY_CAP).map(({ _mcap, ...r }, i) => ({
    ...r,
    mcap: _mcap != null && isFinite(_mcap) ? Math.round(_mcap) : null,
    rank: i + 1,
    rx: null,
  }));
  return { kept, total };
};

async function fetchNasdaqDay(date) {
  const r = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
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
      epsActual: parseMoney(row.eps),          // PAST rows only
      surprisePct: parsePct(row.surprise),     // PAST rows only
      yearAgoEps: parseMoney(row.lastYearEPS), // FUTURE rows only
      noEsts: parseMoney(row.noOfEsts),
      revEst: null,
      _mcap: parseCap(row.marketCap),
    }))
    .filter((x) => x.t);
}

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

async function build() {
  const range = buildRange();
  const from = range[0], to = range[range.length - 1];
  const source = FINNHUB_KEY ? "finnhub" : "nasdaq";
  const days = {};
  const notes = [];

  if (FINNHUB_KEY) {
    let byDay = {};
    try { byDay = await fetchFinnhubRange(from, to); }
    catch (e) { notes.push(`Finnhub fetch failed: ${e.message}`); }
    for (const d of range) {
      const rows = byDay[d] || [];
      if (!rows.length) continue;
      const { kept, total } = finalizeDay(rows);
      days[d] = { rows: kept, totalCount: total };
    }
  } else {
    for (const d of range) {
      if (isWeekend(d)) continue;
      try {
        const rows = await fetchNasdaqDay(d);
        if (!rows.length) continue;
        const { kept, total } = finalizeDay(rows);
        days[d] = { rows: kept, totalCount: total };
      } catch (e) {
        notes.push(`${d}: ${e.message}`);
      }
    }
  }

  return { asof: to, refreshed: iso(new Date()), source, note: notes.length ? notes.join(" · ") : null, days };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");

  try {
    if (cache && Date.now() - cache.ts < TTL) {
      return res.status(200).json({ ok: true, cached: true, ...cache.data });
    }
    const data = await build();
    cache = { data, ts: Date.now() };
    return res.status(200).json({ ok: true, ...data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: `Earnings fetch failed: ${err.message || err}` });
  }
}
