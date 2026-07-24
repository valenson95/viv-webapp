// Vercel Serverless Function — ticker REFERENCE proxy (READ-ONLY).
// Returns one page of Polygon's reference tickers for a security type (CS, ADRC, ...)
// so local scripts can build a common-stock filter without holding the key.
// One upstream call per invocation; the CALLER paces pages (free tier = 5 req/min).
// Usage: /api/tickertypes?type=CS[&cursor=...]  →  { ok, tickers:[...], next_cursor }

const KEY = process.env.POLYGON_API_KEY;

const cache = {}; // { type|cursor: { data, ts } }
const TTL = 24 * 60 * 60 * 1000; // reference data moves slowly

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  if (!KEY) return res.status(500).json({ ok: false, error: "POLYGON_API_KEY not set" });

  const type = String(req.query.type || "CS").toUpperCase().replace(/[^A-Z]/g, "");
  const cursor = String(req.query.cursor || "");
  const ckey = type + "|" + cursor;
  const hit = cache[ckey];
  if (hit && Date.now() - hit.ts < TTL) return res.status(200).json(hit.data);

  try {
    const url = cursor
      ? `https://api.polygon.io/v3/reference/tickers?cursor=${encodeURIComponent(cursor)}&apiKey=${KEY}`
      : `https://api.polygon.io/v3/reference/tickers?market=stocks&type=${type}&active=true&limit=1000&apiKey=${KEY}`;
    const r = await fetch(url);
    const j = await r.json();
    if (!Array.isArray(j.results)) return res.status(502).json({ ok: false, error: j.error || j.message || j.status || "upstream error" });
    let next = null;
    if (j.next_url) { try { next = new URL(j.next_url).searchParams.get("cursor"); } catch {} }
    const data = { ok: true, type, tickers: j.results.map((x) => x.ticker), next_cursor: next };
    cache[ckey] = { data, ts: Date.now() };
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=86400");
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
