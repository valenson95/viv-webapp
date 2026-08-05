// Vercel Serverless Function — day % change for the Hunt List INDEX ribbon.
// Fixed symbol set (no user input reaches the upstream): the TradingView INDEX section.
// Source: Yahoo Finance chart API (no key) — the only free source that covers equities,
// crypto, gold, VIX and WTI in one place. Returns { QQQ: 3.4, BTCUSD: 0.31, ... } (pct).
// In-memory cache 2 min, same convention as api/prices.js.

const MAP = {
  QQQ: "QQQ",
  DIA: "DIA",
  SPY: "SPY",
  IWM: "IWM",
  BTCUSD: "BTC-USD",
  ETHUSD: "ETH-USD",
  XAUUSD: "GC=F", // gold futures — Yahoo has no reliable spot-gold chart symbol
  VIX: "^VIX",
  WTI: "CL=F",
};

let cache = { data: null, ts: 0 };
const CACHE_TTL = 2 * 60 * 1000;

async function fetchPct(ysym) {
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");

  const now = Date.now();
  if (cache.data && now - cache.ts < CACHE_TTL) {
    return res.status(200).json(cache.data);
  }

  const out = {};
  await Promise.all(
    Object.entries(MAP).map(async ([label, ysym]) => {
      const pct = await fetchPct(ysym);
      if (pct !== null) out[label] = pct;
    })
  );

  if (Object.keys(out).length) cache = { data: out, ts: now };
  return res.status(200).json(out);
}
