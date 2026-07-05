// Vercel Serverless Function — sector/theme fallback for tickers not in the curated sectors.js map.
// Accepts ?symbols=RXRX,QSI and returns { RXRX: "Biotechnology", QSI: "Medical" }.
// Uses Finnhub /stock/profile2 finnhubIndustry, mapped to the webapp's DeepVue-style theme names.
// The curated client map stays PRIMARY (it mirrors Valen's DeepVue groupings); this only fills gaps.

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

// Finnhub industry → VIV theme name (aligned with src/sectors.js theme labels)
const INDUSTRY_TO_THEME = {
  "Semiconductors": "Semiconductors",
  "Technology": "Technology",
  "Computers": "Technology",
  "Electronic Equipment & Instruments": "Technology",
  "Electrical Equipment": "Industrials",
  "Software": "Software",
  "IT Services": "Software",
  "Internet Content & Information": "Communication",
  "Media": "Communication",
  "Entertainment": "Communication",
  "Communications": "Telecom",
  "Telecommunication": "Telecom",
  "Biotechnology": "Biotechnology",
  "Pharmaceuticals": "Biotechnology",
  "Life Sciences Tools & Services": "Genomics",
  "Health Care Equipment & Supplies": "Medical",
  "Health Care Providers & Services": "HealthCare",
  "Health Care Technology": "HealthCare",
  "Banking": "Banks",
  "Banks": "Banks",
  "Capital Markets": "Financials",
  "Financial Services": "Financials",
  "Consumer Finance": "Financials",
  "Insurance": "Financials",
  "Diversified Financial Services": "Financials",
  "Aerospace & Defense": "Aerospace",
  "Airlines": "Airlines",
  "Auto Components": "Growth Stocks",
  "Automobiles": "Growth Stocks",
  "Hotels Restaurants & Leisure": "Growth Stocks",
  "Textiles Apparel & Luxury Goods": "Growth Stocks",
  "Leisure Products": "Growth Stocks",
  "Beverages": "Retail",
  "Food Products": "Retail",
  "Food & Staples Retailing": "Retail",
  "Retail": "Retail",
  "Distributors": "Retail",
  "Specialty Retail": "Retail",
  "Multiline Retail": "Retail",
  "Machinery": "Industrials",
  "Industrial Conglomerates": "Industrials",
  "Building": "Home Construction",
  "Construction & Engineering": "Industrials",
  "Building Products": "Home Construction",
  "Household Durables": "Home Construction",
  "Commercial Services & Supplies": "Industrials",
  "Professional Services": "Software",
  "Road & Rail": "Transports",
  "Logistics & Transportation": "Transports",
  "Marine": "Transports",
  "Transportation Infrastructure": "Transports",
  "Air Freight & Logistics": "Transports",
  "Metals & Mining": "Materials",
  "Chemicals": "Materials",
  "Paper & Forest": "Materials",
  "Packaging": "Materials",
  "Oil & Gas": "Oil & Gas",
  "Energy Equipment & Services": "Oil & Gas",
  "Electric Utilities": "Utilities",
  "Utilities": "Utilities",
  "Independent Power and Renewable Electricity Producers": "Utilities",
  "Gas Utilities": "Utilities",
  "Water Utilities": "Utilities",
  "Real Estate Management & Development": "Real Estate",
  "Equity Real Estate Investment Trusts (REITs)": "Real Estate",
  "Real Estate": "Real Estate",
  "Solar": "Solar",
  "Semiconductor Equipment & Materials": "Semiconductors",
  "Trading Companies & Distributors": "Industrials",
  "Diversified Consumer Services": "Growth Stocks",
  "Personal Products": "Growth Stocks",
  "Household Products": "Retail",
  "Tobacco": "Retail",
  "Consumer products": "Growth Stocks",
  "Construction Materials": "Materials",
};

const cache = {}; // { SYM: { theme, ts } }
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h — sector membership barely changes

async function fetchTheme(symbol) {
  const now = Date.now();
  if (cache[symbol] && now - cache[symbol].ts < CACHE_TTL) return cache[symbol].theme;
  try {
    const res = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_KEY}`);
    if (!res.ok) return null;
    const data = await res.json();
    const ind = (data.finnhubIndustry || "").trim();
    if (!ind) return null;
    // mapped theme if we have one; otherwise pass the raw industry through (better than "—")
    const theme = INDUSTRY_TO_THEME[ind] || ind;
    cache[symbol] = { theme, ts: now };
    return theme;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  if (!FINNHUB_KEY) return res.status(500).json({ error: "FINNHUB_API_KEY not configured" });

  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: "Missing ?symbols= parameter" });

  const tickers = symbols.split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 15);
  const results = {};
  await Promise.all(tickers.map(async (sym) => {
    const theme = await fetchTheme(sym);
    if (theme) results[sym] = theme;
  }));
  // cache at the edge too — sectors are stable
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
  return res.status(200).json(results);
}
