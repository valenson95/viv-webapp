// Vercel Serverless Function — proxies Finnhub quote API with in-memory caching
// Accepts ?symbols=AAPL,NVDA,TSLA and returns { AAPL: 195.23, NVDA: 142.50, ... }

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

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

  if (!FINNHUB_KEY) {
    return res.status(500).json({ error: "FINNHUB_API_KEY not configured" });
  }

  const { symbols } = req.query;
  if (!symbols) {
    return res.status(400).json({ error: "Missing ?symbols= parameter" });
  }

  const tickers = symbols.split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 20); // cap at 20
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
