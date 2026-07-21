// Vercel Serverless Function — GROUPED daily bars proxy (READ-ONLY).
// One Polygon grouped-daily call returns EVERY US ticker's completed daily bar for a date —
// this is what makes the rotation refresh near-instant (1 call/market day vs 160 per-ticker
// calls through the per-minute rate limit). Key stays server-side, same as api/candles.js.
// Usage: /api/grouped?date=2026-07-20&symbols=KIE,PBJ,FCG   (symbols optional — filters payload)

const KEY = process.env.POLYGON_API_KEY;

const cache = {}; // { date|symbolsHash: { data, ts } }
const TTL = 60 * 60 * 1000; // 1h — completed daily bars never change

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  if (!KEY) return res.status(500).json({ ok: false, error: "POLYGON_API_KEY not set in Vercel environment." });

  const date = String(req.query.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ ok: false, error: "date=YYYY-MM-DD required" });
  const symbols = String(req.query.symbols || "").toUpperCase().trim();
  const want = symbols ? new Set(symbols.split(",").map((s) => s.trim()).filter(Boolean)) : null;

  const ckey = date + "|" + symbols;
  const hit = cache[ckey];
  if (hit && Date.now() - hit.ts < TTL) return res.status(200).json(hit.data);

  try {
    const r = await fetch(`https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=false&apiKey=${KEY}`);
    const j = await r.json();
    if (!j.results && j.status !== "OK") return res.status(502).json({ ok: false, error: j.error || j.message || j.status || "upstream error" });
    const rows = (j.results || [])
      .filter((x) => !want || want.has(x.T))
      .map((x) => ({ T: x.T, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v, t: Math.floor(x.t / 1000) }));
    const data = { ok: true, date, count: rows.length, results: rows };
    cache[ckey] = { data, ts: Date.now() };
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
}
