// Vercel Serverless Function — intraday/daily candle proxy for trade-review charts (READ-ONLY).
// Proxies Polygon.io aggregates so the API key stays server-side. Normalizes to Lightweight-Charts shape.
// Usage: /api/candles?symbol=NVDA&from=2026-05-04&to=2026-05-05&res=5min

const KEY = process.env.POLYGON_API_KEY;

// res → Polygon {multiplier, timespan}
const RES = {
  "1min": [1, "minute"], "5min": [5, "minute"], "15min": [15, "minute"],
  "30min": [30, "minute"], "60min": [1, "hour"], "1day": [1, "day"],
};

const cache = {}; // { key: { data, ts } }
const TTL = 10 * 60 * 1000; // 10 min — historical candles don't change

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  if (!KEY) return res.status(500).json({ ok: false, error: "POLYGON_API_KEY not set in Vercel environment." });

  const symbol = String(req.query.symbol || "").toUpperCase().trim();
  const from = String(req.query.from || "").trim();
  const to = String(req.query.to || "").trim();
  const res_ = String(req.query.res || "5min").trim();
  if (!symbol || !from || !to) return res.status(400).json({ ok: false, error: "Missing symbol/from/to." });
  const [mult, span] = RES[res_] || RES["5min"];

  const cacheKey = `${symbol}|${from}|${to}|${res_}`;
  if (cache[cacheKey] && Date.now() - cache[cacheKey].ts < TTL) {
    return res.status(200).json({ ok: true, cached: true, ...cache[cacheKey].data });
  }

  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${mult}/${span}/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${KEY}`;
    const r = await fetch(url);
    const j = await r.json();
    if (j.status === "ERROR" || j.error) return res.status(502).json({ ok: false, error: j.error || j.message || "Polygon error." });
    // Polygon bar: { t: ms epoch, o, h, l, c, v }. Lightweight Charts wants time in SECONDS.
    const candles = (j.results || []).map(b => ({ time: Math.floor(b.t / 1000), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }));
    const data = { symbol, res: res_, candles };
    cache[cacheKey] = { data, ts: Date.now() };
    return res.status(200).json({ ok: true, ...data });
  } catch (err) {
    return res.status(500).json({ ok: false, error: `Candle fetch failed: ${err.message || err}` });
  }
}
