// AUTO-MAINTAINED by Claude from Valen's TradingView export / screenshots — his funnel, VERBATIM.
// Source of truth = his TV watchlist "💵VIV Skool". Section NAMES and ORDER mirror TV exactly
// (his word 2026-08-05: "exactly the same format"). NEVER add/drop/reorder tickers yourself.
// A section he didn't provide stays []. INDEX rows render without theme/group badges (indices/
// commodities aren't theme-mappable) — they're included for format parity with TV.
// 2026-08-06 import (💵VIV Skool_63f70.txt): +BROS (Focus) · −GGLL · PLTR PEG→Focus ·
// NET/DINO/VSXY Focus→Strong · NTAP→Focus stays · WDC/SNDK EarnUp→PEG · big section reorders.
export const WATCHLIST = {
  asof: "2026-08-06",      // his TV export date (MYT)
  updated: "2026-08-06",
  sections: [
    { key: "index",    label: "INDEX",                        tickers: ["XAUUSD","VIX","DIA","BTCUSD","SPY","ETHUSD","IWM","QQQ","WTI"] },
    { key: "longs",    label: "LONGS (IN-POSITION)",          tickers: ["HPE","UAL","TQQQ","SOXL"] },
    { key: "focus",    label: "FOCUS LIST (IDEAS)",           tickers: ["DELL","PANW","SNOW","PLTR","OKTA","CRWD","NAVN","GOOGL","NTAP","DDOG","FTNT","BROS","AMZN","VLO","MSFT"] },
    { key: "strong",   label: "STRONG STOCKS (STALKING)",     tickers: ["DINO","VSXY","NET","CHYM","NVDA","ETON","RNG","AVGO","KARO","KMX","RHI","GRND","OII","HPQ"] },
    { key: "mediocre", label: "MEDIOCRE STOCKS (SETTING UP)", tickers: ["PTRN","LLY","STX","HUT","EVC","DLO","DAVE","ORKA","NTNX","CIFR","CBRS","CRSR"] },
    { key: "weak",     label: "WEAK STOCKS (WATCHING)",       tickers: ["SAIL","FIG","TEAM","ADBE","ZS","MDB","NOW","GTLB"] },
    { key: "peg",      label: "POST EARNINGS GAP (PEG)",      tickers: ["AXTI","GH","ANET","MANH","THC","NEO","PRCH","BLZE","WDC","SNDK"] },
    { key: "earnup",   label: "EARNINGS UPCOMING",            tickers: ["HNGE","COMP","GRPN","SEZL","OSCR","FSLY","TRVI","RVMD","XERS","NTRA","TGTX","MRVI","PSNL","AVPT","NBIS","AMD","ALAB"] },
  ],
};
