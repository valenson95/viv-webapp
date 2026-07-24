// Vercel Serverless Function — single-ticker REFERENCE details proxy (READ-ONLY).
// Exposes shares outstanding (→ market cap = shares × close) + SIC industry for the
// Burst Log's cap/sector layer. Key stays server-side. One upstream call per invocation.
// Usage: /api/tickerinfo?symbol=UTZ → { ok, symbol, shares, sic, name }

const KEY = process.env.POLYGON_API_KEY;

const cache = {}; // symbol → { data, ts }
const TTL = 7 * 24 * 60 * 60 * 1000; // shares outstanding move slowly

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  if (!KEY) return res.status(500).json({ ok: false, error: "POLYGON_API_KEY not set" });

  const symbol = String(req.query.symbol || "").toUpperCase().replace(/[^A-Z.]/g, "");
  if (!symbol) return res.status(400).json({ ok: false, error: "symbol required" });

  const hit = cache[symbol];
  if (hit && Date.now() - hit.ts < TTL) return res.status(200).json(hit.data);

  try {
    const r = await fetch(`https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${KEY}`);
    const j = await r.json();
    if (!j.results) return res.status(502).json({ ok: false, error: j.error || j.message || j.status || "upstream error" });
    const x = j.results;
    const data = {
      ok: true, symbol,
      shares: x.weighted_shares_outstanding || x.share_class_shares_outstanding || null,
      sic: x.sic_description || null,
      name: x.name || null,
    };
    cache[symbol] = { data, ts: Date.now() };
    res.setHeader("Cache-Control", "s-maxage=604800, stale-while-revalidate=604800");
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
