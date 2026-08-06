// Vercel Serverless Function — proxies Finnhub quote API with in-memory caching
// Accepts ?symbols=AAPL,NVDA,TSLA and returns { AAPL: 195.23, NVDA: 142.50, ... }
//
// ALSO: ?indices=1 serves the Hunt List INDEX-ribbon day-% payload (Yahoo chart API — the only
// free source covering equities, crypto, gold, VIX and WTI in one place). Folded in here
// 2026-08-06: the Hobby plan caps a deployment at 12 serverless functions, and a separate
// api/indices.js was function #13 — the whole deploy errored (exceeded_serverless_functions).

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

// ── indices branch (fixed symbol set — no user input reaches the upstream) ──
const IDX_MAP = {
  QQQ: "QQQ", DIA: "DIA", SPY: "SPY", IWM: "IWM",
  BTCUSD: "BTC-USD", ETHUSD: "ETH-USD",
  XAUUSD: "GC=F", // gold futures — Yahoo has no reliable spot-gold chart symbol
  VIX: "^VIX", WTI: "CL=F",
};
let idxCache = { data: null, ts: 0 };
const IDX_TTL = 2 * 60 * 1000;

async function fetchIdxPct(ysym) {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?range=1d&interval=1d`,
      { headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!r.ok) return null;
    const j = await r.json();
    const m = j?.chart?.result?.[0]?.meta;
    const p = m?.regularMarketPrice;
    const pc = m?.chartPreviousClose ?? m?.previousClose;
    if (!p || !pc) return null;
    return Math.round((p / pc - 1) * 10000) / 100;
  } catch {
    return null;
  }
}

async function serveIndices(res) {
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
  const now = Date.now();
  if (idxCache.data && now - idxCache.ts < IDX_TTL) {
    return res.status(200).json(idxCache.data);
  }
  const out = {};
  await Promise.all(
    Object.entries(IDX_MAP).map(async ([label, ysym]) => {
      const pct = await fetchIdxPct(ysym);
      if (pct !== null) out[label] = pct;
    })
  );
  if (Object.keys(out).length) idxCache = { data: out, ts: now };
  return res.status(200).json(out);
}

// In-memory cache: { SYMBOL: { price, ts } }
const cache = {};
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

async function fetchQuote(symbol) {
  const now = Date.now();
  if (cache[symbol] && now - cache[symbol].ts < CACHE_TTL) {
    return cache[symbol].price;
  }
  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`);
    if (!res.ok) return null;
    const data = await res.json();
    // data.c = current price (delayed ~15 min on free tier)
    if (data.c && data.c > 0) {
      cache[symbol] = { price: data.c, ts: now };
      return data.c;
    }
    return null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  if (req.query.indices) return serveIndices(res);

  if (!FINNHUB_KEY) {
    return res.status(500).json({ error: "FINNHUB_API_KEY not configured" });
  }

  const { symbols } = req.query;
  if (!symbols) {
    return res.status(400).json({ error: "Missing ?symbols= parameter" });
  }

  const tickers = symbols.split(",").map(s => s.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "")).filter(Boolean).slice(0, 20); // cap at 20
  const results = {};

  // Fetch all in parallel
  await Promise.all(
    tickers.map(async (sym) => {
      const price = await fetchQuote(sym);
      if (price !== null) results[sym] = price;
    })
  );

  return res.status(200).json(results);
}
