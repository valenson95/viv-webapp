// GROUP-RS — build the admin-only "Group RS" rotation table from ETF daily closes vs SPY.
// Every number here is HONESTLY COMPUTED from bars; a value that can't be computed is written
// null with an `err`/blank reason (never guessed). DeepVue remains the source of truth for
// single-stock RS and sector grouping — this is a GROUP-level rotation lens computed from ETFs.
//
// Usage: node --env-file=.env.local scripts/group-rs.mjs
// Writes: src/groupRS-data.js  →  export const GROUP_RS = { asof, rows:[...] };
//
// Data source: the deployed candles proxy (Polygon key stays in Vercel), exactly like
// scripts/study-fill.mjs — GET https://www.valensontrades.com/api/candles?symbol=X&from=..&to=..&res=1day
// → { ok, candles:[{time,open,high,low,close,volume}] }.
//
// THROTTLE: 1.6s between requests; on ANY failure wait 61s and retry ONCE (per-minute rate limit).
import { writeFileSync } from 'fs';

const PROXY = "https://www.valensontrades.com/api/candles";

// ── UNIVERSE (ticker → group label). Transcribed from Valen's reference rotation table.
// Keep as a plain const so it's trivial to extend. SPY is the benchmark (fetched, not a row).
const UNIVERSE = [
  ["KWEB", "Chinese Tech & E-commerce"],
  ["CHIQ", "China Consumer"],
  ["IYT", "Transportation"],
  ["KBE", "Large-cap Banking"],
  ["KRE", "Regional Banks"],
  ["XHE", "Health Devices"],
  ["IHI", "Med-Tech & Surgical Equipment"],
  ["XTN", "Trucking"],
  ["XRT", "Retail"],
  ["PBJ", "Food & Beverage"],
  ["KCE", "Capital Markets & Financial Services"],
  ["KURE", "China Health"],
  ["IBUY", "Global E-commerce"],
  ["MOO", "Global Agricultural Producers"],
  ["IPAY", "Digital Payments & Fintech"],
  ["MAGS", "Magnificent 7"],
  ["PHO", "Water Purification & Infrastructure"],
  ["WOOD", "Timber & Lumber"],
  ["SCHH", "U.S. REITs"],
  ["ETHA", "Ether Spot"],
  ["WCLD", "Cloud Tech"],
  ["AMLP", "Energy MLPs"],
  ["USO", "Crude Oil"],
  ["XOP", "Oil & Gas E&P"],
  ["FXI", "China Large-Caps"],
  ["IAI", "Broker-Dealers"],
  ["BUG", "Pure Cybersecurity Software"],
  ["CLOU", "Cloud Infrastructure & SaaS"],
  ["SVIX", "Short VIX Futures (Volatility)"],
  ["SOCL", "Social Media"],
  ["EWZ", "Brazilian Equities"],
  ["GXC", "China ETF"],
  ["IBIT", "Bitcoin Spot"],
  ["XSW", "Software (Equal)"],
  ["GENZ", "Global Gaming & Casinos"],
  ["DXYZ", "Pre-IPO & Private Unicorn Equity"],
  ["PBE", "Dynamic Biotech"],
  ["IGV", "US Tech/Software"],
  ["XPH", "Pharmaceuticals (Equal)"],
  ["FDN", "US Internet Giants"],
  ["PPH", "Large-Cap Pharmaceutical"],
  ["BOAT", "Global Shipping"],
  ["GUNR", "Upstream Natural Resources"],
  ["GNR", "Natural Resources"],
  ["XBI", "Biotech (Equal)"],
  ["IBB", "Biotech (Cap)"],
  ["IHF", "Health-Care Providers"],
  ["ARKG", "Genomics"],
  ["SOLZ", "Solana Spot"],
  // ── revealed in the 2026-07-18 "Weekend Series" groups post (universe grows as posts reveal it):
  ["FCG", "Natural Gas E&P"],
  ["KIE", "Insurance"],
  ["CIBR", "Cybersecurity Software & Infrastructure"],
  ["XHS", "Healthcare Facilities & Services"],
  ["ILF", "Latin America 40"],
  ["SLX", "Steel"],
  ["OIH", "Large-Cap Oil Services"],
  ["XES", "Oil & Gas Equip & Services"],
  ["ESPO", "E-Sports"],
];
// Plan & Focus map — the source's SECOND artifact (jeff-sun-master-system.md §14b): four FIXED
// blocks (Index → Segment → EW Sector → SPDR Sector), RSP pinned as the labeled benchmark row.
// The EW↔CW per-sector spread (RSP_ vs XL_) is the broad-vs-narrow leadership read.
const PF_UNIVERSE = [
  ["SPY", "S&P 500", "Index"], ["QQQ", "Nasdaq-100", "Index"], ["QQQE", "Nasdaq-100 Equal Weight", "Index"],
  ["IWM", "Russell 2000", "Index"], ["DIA", "Dow 30", "Index"], ["SPMO", "S&P 500 Momentum", "Index"], ["TLT", "20+ Year Treasury Bonds", "Index"],
  ["IJS", "Small-Cap 600 Value", "Segment"], ["IJR", "Small-Cap 600", "Segment"], ["IJT", "Small-Cap 600 Growth", "Segment"],
  ["IJJ", "MidCap 400 Value", "Segment"], ["IJH", "MidCap 400", "Segment"], ["IJK", "MidCap 400 Growth", "Segment"],
  ["IVE", "Large-Cap 500 Value", "Segment"], ["IVV", "S&P 500", "Segment"], ["IVW", "Large-Cap 500 Growth", "Segment"],
  ["RSPF", "Equal Weight Financials", "EW Sector"], ["RSPG", "Equal Weight Energy", "EW Sector"], ["RSPS", "Equal Weight Staples", "EW Sector"],
  ["RSPR", "Equal Weight Real Estate", "EW Sector"], ["RSPH", "Equal Weight Health Care", "EW Sector"], ["RSPC", "Equal Weight Communication", "EW Sector"],
  ["RSPM", "Equal Weight Material", "EW Sector"], ["RSPD", "Equal Weight Discretionary", "EW Sector"], ["RSPN", "Equal Weight Industrial", "EW Sector"],
  ["RSPU", "Equal Weight Utilities", "EW Sector"], ["RSPT", "Equal Weight Technology", "EW Sector"],
  ["XLE", "Energy", "SPDR Sector"], ["XLRE", "Real Estate", "SPDR Sector"], ["XLF", "Financials", "SPDR Sector"],
  ["XLP", "Consumer Staples", "SPDR Sector"], ["XLV", "Health Care", "SPDR Sector"], ["XLC", "Communication Services", "SPDR Sector"],
  ["XLB", "Materials", "SPDR Sector"], ["XLU", "Utilities", "SPDR Sector"], ["XLI", "Industrials", "SPDR Sector"],
  ["XLY", "Consumer Discretionary", "SPDR Sector"], ["XLK", "Technology", "SPDR Sector"],
];

// ── LIQUID LEADERS universe — a per-STOCK momentum lens over the SAME machinery as the
// Industry Groups table (rs1m / thrust vs RSP, absolute % stats). Two curated liquid-leader
// universes merged on ticker. Provenance is tagged NEUTRALLY member-facing: "JS" → "Curated"
// chip, "DV" → "Screen" chip (no source names anywhere in the payload/UI). These are COMPANIES,
// not funds — no holdings popup. `long`/`short` = the liquid leveraged/inverse ETFs that track
// the name (lowercase); shown as a reminder cell, gated elsewhere.
//   LL_JS = the "Curated" list (industry + long/short lev-ETFs printed alongside each name).
//   LL_DV = the "Screen" list (tickers only; industry blank unless the name is ALSO in LL_JS).
// Industry strings are OCR-derived display-only labels (DeepVue stays the grouping source of truth).
const LL_JS = [
  // [ticker, industry, longETFs[], shortETFs[]]
  ["ADBE", "Software & IT Services", ["adbg"], []],
  ["AAPL", "Computers, Phones & Household Electronics", ["aapu"], ["aapd"]],
  ["MSFT", "Software & IT Services", ["msfu"], ["msfd"]],
  ["BABA", "Software & IT Services", ["babx"], []],
  ["AMZN", "Diversified Retail", ["amzu"], ["amzd"]],
  ["UNH", "Healthcare Providers & Services", ["unhg"], []],
  ["BMNR", "Fintech & Infrastructure", ["bmnu"], ["bmnz"]],
  ["META", "Software & IT Services", ["fbl", "metu"], ["metd"]],
  ["PLTR", "Software & IT Services", ["pltu", "ptir"], ["pltd", "pltz"]],
  ["NVDA", "Semiconductors & Semi Equipment", ["nvdx", "nvdu", "nvdl"], ["nvd", "nvdq"]],
  ["MSTR", "Software & IT Services", ["mstu", "mstx"], ["mstz", "smst"]],
  ["NOW", "Software & IT Services", ["nowl"], []],
  ["RDDT", "Software & IT Services", ["rdtl"], []],
  ["COIN", "Fintech & Infrastructure", ["conl"], []],
  ["LITE", "Communications & Networking", ["litx"], []],
  ["AVGO", "Semiconductors & Semi Equipment", ["avgx"], ["avs"]],
  ["TEM", "Biotechnology & Medical Research", ["temt"], []],
  ["SOUN", "Software & IT Services", ["soux"], []],
  ["DELL", "Computers, Phones & Household Electronics", ["dlll"], []],
  ["HOOD", "Fintech & Infrastructure", ["robn"], ["hooz"]],
  ["GOOGL", "Software & IT Services", ["ggll"], ["ggls"]],
  ["ORCL", "Software & IT Services", ["orcx"], []],
  ["QCOM", "Semiconductors & Semi Equipment", ["qcml"], []],
  ["LUNR", "Aerospace & Defense", ["lunl"], []],
  ["CRWV", "Software & IT Services", ["cwvx", "crwg"], ["cord"]],
  ["ARM", "Semiconductors & Semi Equipment", ["armg"], []],
  ["NBIS", "Professional & Commercial Services", ["nbil", "nbig", "nebx"], ["nbiz"]],
  ["BE", "Machinery, Equipment & Components", ["bex"], []],
  ["QUBT", "Software & IT Services", ["qubx"], []],
  ["SMR", "Electrical Utilities & IPPs", ["smu"], []],
  ["ASTS", "Telecommunications Services", ["astx"], []],
  ["RKLB", "Aerospace & Defense", ["rklx"], ["rklz"]],
  ["RGTI", "Semiconductors & Semi Equipment", ["rgtx"], ["rgtz"]],
  ["MRVL", "Semiconductors & Semi Equipment", ["mvll"], []],
  ["CRCL", "Fintech & Infrastructure", [], ["crcd"]], // long side UNCERTAIN OCR → left blank
  ["AXTI", "Semiconductors & Semi Equipment", ["axtx"], []],
  ["WDC", "Computers, Phones & Household Electronics", ["wdcx"], []],
  ["SOFI", "Banking Services", ["sofx"], []],
  ["MU", "Semiconductors & Semi Equipment", ["muu", "mull"], ["mud", "muz"]],
  ["AAOI", "Electronic Equipment & Parts", ["aaox"], []],
  ["TSLA", "Automobiles & Auto Parts", ["tsll", "tslr"], ["tslq", "tsls", "tslz"]],
  ["HIMS", "Healthcare Providers & Services", ["himz"], []],
  ["CBRS", "Integrated Hardware & Software", ["cbrg"], []],
  ["APLD", "Fintech & Infrastructure", ["aplx"], []],
  ["IREN", "Fintech & Infrastructure", ["ire", "irex"], []],
  ["NFLX", "Software & IT Services", ["nfxl", "nflu"], ["nfxs"]],
  ["APP", "Software & IT Services", ["appx"], []],
  ["BBAI", "Software & IT Services", ["baig"], []],
  ["TSM", "Semiconductors & Semi Equipment", ["tsmx"], []],
  ["UPST", "Banking Services", ["upsx"], []],
  ["INTC", "Semiconductors & Semi Equipment", ["intw"], []],
  ["RIOT", "Internet Services & Infrastructure", ["riox"], []],
  ["OKLO", "Electrical Utilities & IPPs", ["okll"], ["okls"]],
  ["QBTS", "Software & IT Services", ["qbtx"], ["qbtz"]],
  ["IONQ", "Computers, Phones & Household Electronics", ["ionx"], ["ionz"]],
  ["CRDO", "Semiconductors & Semi Equipment", ["crdu"], []],
  ["ALAB", "Semiconductors & Semi Equipment", ["labx"], []],
  ["MARA", "Fintech & Infrastructure", ["mral"], []],
  ["ONDS", "Communications & Networking", ["ondl", "ondg"], []],
  ["SMCI", "Computers, Phones & Household Electronics", ["smcx", "smcl"], ["smcz"]],
  ["GLW", "Electronic Equipment & Parts", ["glwg"], []],
  ["SNDK", "Computers, Phones & Household Electronics", ["snxx", "sndu"], []],
  ["AMD", "Semiconductors & Semi Equipment", ["amdl", "damd"], []], // short side UNCERTAIN OCR → omitted
  ["POET", "Semiconductors & Semi Equipment", ["poel"], []],
];
// LL_DV — the "Screen" (DeepVue Liquid Leaders) list. DOCUMENTED BUT CURRENTLY INACTIVE.
// FINAL SCOPE CALL (Valen, 2026-07-19): the Liquid Leaders tab uses ONLY the ~62 curated names
// that ship with leveraged/inverse ETF mappings (LL_JS). This screen universe is kept verbatim so
// re-adding it is trivial — to flip back, restore the merge block at the bottom of this note AND
// bring back the src field + Curated/Screen source chips in src/GroupRS.jsx.
const LL_DV = [
  "ABVX", "ACHC", "ACMR", "ALAB", "AMAT", "AMD", "APGE", "ARM", "ASX", "BRKR", "BROS", "BSP",
  "BTSG", "CAKE", "CBRS", "CHYM", "CNC", "CRNX", "CROX", "CRWD", "CSCO", "CSQR", "CVLT", "CVS",
  "DAVE", "DDOG", "DELL", "DFTX", "DINO", "DNTH", "DOCN", "DPC", "DVA", "ETSY", "FBIN", "FDXF",
  "FFIV", "FIG", "FLEX", "FROG", "FTNT", "GEN", "GH", "GTLB", "GWRE", "HNGE", "HONA", "HPE",
  "HUM", "ICLR", "ILMN", "INIO", "INTC", "KMX", "KRYS", "KYMR", "LGND", "LQDA", "LTH", "MANE",
  "MBGL", "MOH", "MPC", "MRVL", "MSM", "MTRN", "MU", "MXL", "NAVN", "NBIX", "NET", "NTAP",
  "NTNX", "NTRA", "OKTA", "ORKA", "OSCR", "OUST", "PANW", "PBF", "PENG", "PTGX", "PYPL", "QLYS",
  "QNT", "RAL", "RBRK", "RH", "SDOT", "SEDG", "SEZL", "SHAZ", "SIMO", "SKHY", "SN", "SNDK",
  "SNOW", "SPCX", "STM", "STRL", "STX", "SYNA", "SYRE", "TEAM", "TECH", "TENB", "TGTX", "TKR",
  "TWLO", "TWST", "TXG", "UMC", "UNH", "URI", "VEEE", "VKTX", "VLO", "VMI", "VOYA", "VRNS",
  "VSH", "VSXY", "WST", "WYFI", "XENE",
];
void LL_DV; // referenced so the documented (inactive) screen list isn't flagged as unused.
// ACTIVE universe = curated (LL_JS) only — a single liquid-leader universe, no source distinction.
const LL_UNIVERSE = LL_JS.map(([t, industry, long, short]) => ({ t, industry, long, short }));
// ── To re-add the merged "Screen" universe later, replace the LL_UNIVERSE line above with:
//   const LL_JS_MAP = new Map(LL_JS.map(([t, industry, long, short]) => [t, { industry, long, short }]));
//   const LL_DV_SET = new Set(LL_DV);
//   const LL_TICKERS = [...new Set([...LL_JS.map(r => r[0]), ...LL_DV])];
//   const LL_UNIVERSE = LL_TICKERS.map(t => { const js = LL_JS_MAP.get(t); const inDV = LL_DV_SET.has(t);
//     const src = js && inDV ? "JS+DV" : js ? "JS" : "DV";
//     return { t, industry: js?.industry || "", src, long: js?.long || [], short: js?.short || [] }; });

// Benchmark = RSP (S&P 500 EQUAL WEIGHT) — revealed by the source table's own "benchmark" row
// (2026-07-18 post): RS is measured vs the AVERAGE stock, which kills mega-cap distortion; SPY
// prints there as an ordinary row. See jeff-sun-master-system.md §14b-0.
const BENCH = "RSP";

// ── DECODE thresholds (pre-registered constants — same numbers the UI documents).
const TH = {
  BUY_THRUST: 90, BUY_RS: 90,          // buy zone: leading AND accelerating
  FRESH_THRUST: 75, FRESH_GAP: 25,     // fresh: thrust way above the month
  REST_RS: 70, REST_GAP: 25,           // resting: strong month, cooling week
  ARTIFACT_RS: 60,                     // artifact: high percentile but negative real month
  TRAP_THRUST: 75, TRAP_OFF52: -15,    // trap: big thrust but ≥15% below 52wk high
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const shift = (ds, n) => { const d = new Date(ds + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Stamp dates on VALEN'S clock (MYT) — members read the app from Malaysia; a UTC stamp goes
// stale-looking at midnight MYT while the US session is still running (Valen 2026-07-21).
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
const FROM = shift(today, -420); // ~420 calendar days back → comfortably >252 trading bars

// bars() — identical shape to study-fill.mjs; returns [{d,t,o,h,l,c,v}] oldest→newest.
async function barsRaw(sym, from, to, res = "1day") {
  const r = await fetch(`${PROXY}?symbol=${sym}&from=${from}&to=${to}&res=${res}`);
  const j = await r.json();
  if (!j.ok || !j.candles?.length) throw new Error(`${sym}: ${j.error || "no bars"}`);
  return j.candles.map(c => ({ d: new Date(c.time * 1000).toISOString().slice(0, 10), t: c.time, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume }));
}
// Throttled fetch with one 61s-wait retry on ANY failure (per-minute rate limit).
async function bars(sym) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await barsRaw(sym, FROM, today); }
    catch (e) {
      if (attempt === 0) { console.log(`  ⚠︎ ${sym} failed (${e.message}) — waiting 61s and retrying once…`); await sleep(61000); }
      else throw e;
    }
  }
}

// ── percentile rank across the universe, 0–100: 100 × (count strictly below) / (N−1), rounded.
// Only ranks the entries that HAVE a value (nulls excluded from the population).
function percentiles(values) {
  const idx = values.map((v, i) => [i, v]).filter(([, v]) => v != null && isFinite(v));
  const N = idx.length;
  const out = values.map(() => null);
  if (N < 2) { idx.forEach(([i]) => out[i] = 50); return out; } // degenerate: single valid → neutral
  for (const [i, v] of idx) {
    const below = idx.filter(([, w]) => w < v).length;
    out[i] = Math.round(100 * below / (N - 1));
  }
  return out;
}
const snap5 = (v) => v == null ? null : Math.round(v / 5) * 5;
const norm01 = (arr) => { // normalize a numeric series to 0..1 (min→0, max→1); flat series → all 0.5
  const xs = arr.filter(x => x != null && isFinite(x));
  if (!xs.length) return arr.map(() => null);
  const lo = Math.min(...xs), hi = Math.max(...xs), sp = hi - lo;
  return arr.map(x => x == null || !isFinite(x) ? null : (sp === 0 ? 0.5 : (x - lo) / sp));
};
const f = (x, d = 2) => x == null || Number.isNaN(x) || !isFinite(x) ? null : +x.toFixed(d);

// ── 1) fetch benchmarks (RSP + SPY — both cached so variant tests can run offline) then every
// ETF, throttled. `--from-cache` skips ALL fetching and reuses scripts/.grouprs-cache.json.
import { existsSync, readFileSync } from "fs";
const CACHE = "scripts/.grouprs-cache.json";
const useCache = process.argv.includes("--from-cache") && existsSync(CACHE);
let spy, spyAlt, raw, rawPF, rawLL;
if (useCache) {
  const c = JSON.parse(readFileSync(CACHE, "utf8"));
  spy = c.benchmarks[BENCH]; spyAlt = c.benchmarks[BENCH === "RSP" ? "SPY" : "RSP"]; raw = c.raw; rawPF = c.rawPF;
  // Re-cut the Liquid Leaders universe from the CURRENT LL_UNIVERSE using cached bars — so trimming
  // the universe (e.g. dropping the screen list) takes effect on --from-cache without re-fetching.
  const cacheLLbars = new Map((c.rawLL || []).map(r => [r.t, r.bars]));
  rawLL = LL_UNIVERSE.map(u => {
    const b = cacheLLbars.has(u.t) ? cacheLLbars.get(u.t) : null;
    return b ? { ...u, bars: b } : { ...u, bars: null, err: "no data" };
  });
  console.log(`GROUP-RS · FROM CACHE (${c.fetched}) · ${raw.length} ETFs · ${rawLL.length} liquid leaders · bench ${BENCH}`);
  if (!rawPF) { console.error("cache predates the Plan & Focus universe — run once WITHOUT --from-cache."); process.exit(1); }
  if (!c.rawLL) console.warn("  ⚠︎ cache predates the Liquid Leaders universe — Liquid Leaders tab will be EMPTY. Run once WITHOUT --from-cache to populate it.");
} else {
  console.log(`GROUP-RS · window ${FROM} → ${today} · ${UNIVERSE.length} ETFs + RSP + SPY`);
  const benchmarks = {};
  for (const B of ["RSP", "SPY"]) {
    try { benchmarks[B] = await bars(B); console.log(`  ${B}: ${benchmarks[B].length} bars`); }
    catch (e) { console.error(`benchmark ${B} unavailable (${e.message})`); }
    await sleep(1600);
  }
  spy = benchmarks[BENCH]; spyAlt = benchmarks[BENCH === "RSP" ? "SPY" : "RSP"];
  if (!spy) { console.error(`FATAL: benchmark ${BENCH} unavailable — cannot compute relative strength.`); process.exit(1); }
  raw = []; // { t, name, bars|null, err }
  for (let i = 0; i < UNIVERSE.length; i++) {
    const [t, name] = UNIVERSE[i];
    process.stdout.write(`[${i + 1}/${UNIVERSE.length}] ${t} (${name})… `);
    try {
      const b = await bars(t);
      raw.push({ t, name, bars: b });
      console.log(`${b.length} bars ✓`);
    } catch (e) {
      raw.push({ t, name, bars: null, err: "no data" });
      console.log(`FAILED (${e.message}) → row kept with nulls`);
    }
    if (i < UNIVERSE.length - 1) await sleep(1600);
  }
  rawPF = []; // Plan & Focus tickers (SPY reuses the benchmark fetch)
  for (let i = 0; i < PF_UNIVERSE.length; i++) {
    const [t, name, block] = PF_UNIVERSE[i];
    if (t === "SPY" && benchmarks.SPY) { rawPF.push({ t, name, block, bars: benchmarks.SPY }); continue; }
    process.stdout.write(`[PF ${i + 1}/${PF_UNIVERSE.length}] ${t} (${name})… `);
    await sleep(1600);
    try {
      const b = await bars(t);
      rawPF.push({ t, name, block, bars: b });
      console.log(`${b.length} bars ✓`);
    } catch (e) {
      rawPF.push({ t, name, block, bars: null, err: "no data" });
      console.log(`FAILED (${e.message}) → row kept with nulls`);
    }
  }
  rawLL = []; // Liquid Leaders universe (per-STOCK bars vs the same RSP benchmark)
  for (let i = 0; i < LL_UNIVERSE.length; i++) {
    const u = LL_UNIVERSE[i];
    process.stdout.write(`[LL ${i + 1}/${LL_UNIVERSE.length}] ${u.t}… `);
    await sleep(1600);
    try {
      const b = await bars(u.t);
      rawLL.push({ ...u, bars: b });
      console.log(`${b.length} bars ✓`);
    } catch (e) {
      rawLL.push({ ...u, bars: null, err: "no data" });
      console.log(`FAILED (${e.message}) → row kept with nulls`);
    }
  }
  writeFileSync(CACHE, JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), benchmarks, raw, rawPF, rawLL }));
  console.log(`raw bars cached → ${CACHE}`);
}
const spyByDate = new Map(spy.map(b => [b.d, b.c]));

// ── 2) per-ETF raw metrics (r21, w5, and the absolute price stats). Relative series rel[i] =
// close_ETF[i] / close_SPY[i] aligned by DATE (only dates present in both).
function computeRaw(b) {
  // align: keep ETF bars whose date also has a SPY close; rel = etf.c / spy.c
  const aligned = b.filter(x => spyByDate.has(x.d)).map(x => ({ ...x, rel: x.c / spyByDate.get(x.d) }));
  const n = aligned.length;
  if (n < 22) return null; // need ≥21-back lookback for the monthly windows
  const rel = aligned.map(x => x.rel);
  const close = aligned.map(x => x.c);
  const last = n - 1;

  // r21 = 1-month RELATIVE return vs benchmark (kept for reference/tooltips)
  const r21 = rel[last] / rel[last - 21] - 1;

  // ── THE SOURCE'S OWN EXCEL MACHINERY (jeff-sun-master-system.md §7 + §14b-0) ──
  // His sheet formula is  =PERCENTRANK(own trailing range, today)  — a TIME-SERIES percentrank
  // of the RS ratio within its OWN recent history, NOT a rank across the universe. A 21-value
  // window yields values in exact 5% steps (k/20) — exactly what his printed 1-Mth RS column
  // shows. PERCENTRANK.INC semantics: (# of values strictly below x) / (n - 1), self included.
  const prank = (arr, x) => {
    const below = arr.filter(v => v < x).length;
    return arr.length > 1 ? below / (arr.length - 1) : null;
  };
  // rs1m = PERCENTRANK of today's RS ratio within its own last 21 daily RS ratios ×100.
  const rs1mOwn = prank(rel.slice(last - 20, last + 1), rel[last]) * 100;

  // ── RS THRUST RATE % — his EXACT published formula ──────────────────────────────────────────
  // PROVENANCE: Jeff Sun's FAQ post "What is RS Thrust Rate %?" (x.com/jfsrev/status/2064559372655866303,
  // text pasted by Valen 2026-07-19): "a calibrated blend of 1-week and 1-month RS, currently leaning
  // toward a 60/40 weighting in favor of recency … a small 0.1 adjustment factor based on the change
  // in 1-week RS versus its reading three trading days ago (so my readings have 110% to −10%)."
  //   thrust = 0.6·RS1W_today + 0.4·RS1M + 0.1·(RS1W_today − RS1W_{t−3}),  rounded half-up.
  // RS1M = the proven monthly column above (PERCENTRANK.INC of the RS ratio in its own trailing 21).
  // RS1W = the SAME machinery on a 1-WEEK window: PERCENTRANK.INC of today's RS ratio within its own
  //        trailing 7 sessions ×100. Reverse-engineered (scripts/thrust-*.mjs) and VERIFIED 85/85
  //        cell-exact vs his printed 2026-07-17 table (48 industry groups + 37 Plan&Focus rows; the
  //        two rs1m OCR typos RSPD/RSPT were caught BY this formula). Range −10…110 matches his words.
  const rs1wAt = (e) => prank(rel.slice(e - 6, e + 1), rel[e]) * 100; // 1-week RS percentile as-of index e
  let thrustOwn = null;
  if (n >= 30) { // need RS1W at last-3 (7 bars back from last-3) plus the 21-window RS1M
    const w_t = rs1wAt(last), w_t3 = rs1wAt(last - 3);
    thrustOwn = Math.round(0.6 * w_t + 0.4 * rs1mOwn + 0.1 * (w_t - w_t3));
  }
  // legacy w5 metric (weighted 1-week rel-return level) — kept ONLY for the w5 tooltip; no longer thrust.
  const W = [5, 4, 3, 2, 1];
  const wweek = (i) => { let s = 0; for (let k = 0; k < 5; k++) s += W[k] * (rel[i - k] / rel[i - k - 1] - 1); return s / 15; };
  const w5 = wweek(last);

  // absolute price stats (NOT relative)
  const lastBar = aligned[last];
  const pctIntraday = (lastBar.c - lastBar.o) / lastBar.o * 100;     // ex-gap move of the latest session
  const pct1d = (close[last] / close[last - 1] - 1) * 100;
  const pct1m = (close[last] / close[last - 21] - 1) * 100;          // absolute 1-month, NOT relative
  const hi252 = Math.max(...b.slice(Math.max(0, b.length - 252)).map(x => x.h));
  const off52 = (close[last] / hi252 - 1) * 100;                     // negative or 0

  const spark = norm01(close.slice(-21));                            // last 21 closes, 0..1
  const rsSpark = norm01(rel.slice(-21));                            // last 21 rel values, 0..1
  return { r21, w5, rs1mOwn, thrustOwn, pctIntraday, pct1d, pct1m, off52, spark, rsSpark };
}

const metrics = raw.map(r => ({ ...r, m: r.bars ? computeRaw(r.bars) : null }));

// ── 3) rs1m/thrust now come from each ticker's OWN trailing-window percentrank (computed above,
// the source's own Excel machinery) — no cross-universe ranking step anymore.
const rs1mPct = metrics.map(x => x.m?.rs1mOwn ?? null);
const thrustPct = metrics.map(x => x.m?.thrustOwn ?? null);

// ── 4) decode chips (pre-registered thresholds). PRIMARY = first match; WARNINGS can coexist.
function decode(thrust, rs1m, pct1m, off52) {
  let state = null;
  if (thrust != null && rs1m != null) {
    if (thrust >= TH.BUY_THRUST && rs1m >= TH.BUY_RS) state = "buy";
    else if (thrust >= TH.FRESH_THRUST && (thrust - rs1m) >= TH.FRESH_GAP) state = "fresh";
    else if (rs1m >= TH.REST_RS && (rs1m - thrust) >= TH.REST_GAP) state = "resting";
  }
  const warns = [];
  if (rs1m != null && rs1m >= TH.ARTIFACT_RS && pct1m != null && pct1m < 0) warns.push("artifact");
  if (thrust != null && thrust >= TH.TRAP_THRUST && off52 != null && off52 <= TH.TRAP_OFF52) warns.push("trap");
  return { state, warns };
}

// ── 5) assemble rows.
const rows = metrics.map((x, i) => {
  if (!x.m) return { t: x.t, name: x.name, thrust: null, thrust_snap: null, rs1m: null, rs1m_snap: null,
    r21: null, w5: null, pctIntraday: null, pct1d: null, pct1m: null, off52: null,
    spark: [], rsSpark: [], state: null, warns: [], err: x.err || "no data" };
  const thrust = thrustPct[i], rs1m = rs1mPct[i];
  const { state, warns } = decode(thrust, rs1m, x.m.pct1m, x.m.off52);
  return {
    t: x.t, name: x.name,
    thrust, thrust_snap: snap5(thrust), rs1m, rs1m_snap: snap5(rs1m),
    r21: f(x.m.r21, 4), w5: f(x.m.w5, 5),
    pctIntraday: f(x.m.pctIntraday, 2), pct1d: f(x.m.pct1d, 2), pct1m: f(x.m.pct1m, 2), off52: f(x.m.off52, 2),
    spark: x.m.spark.map(v => f(v, 4)), rsSpark: x.m.rsSpark.map(v => f(v, 4)),
    state, warns,
  };
});

// ── 5b) Plan & Focus rows — same verified formulas, four fixed blocks, RSP pinned as the
// labeled benchmark row (its metric cells render blank, exactly like the source table).
const metricsPF = rawPF.map(r => ({ ...r, m: r.bars ? computeRaw(r.bars) : null }));
const pfRows = metricsPF.map((x) => {
  if (!x.m) return { t: x.t, name: x.name, block: x.block, thrust: null, rs1m: null, pctIntraday: null,
    pct1d: null, pct1m: null, off52: null, spark: [], rsSpark: [], state: null, warns: [], err: x.err || "no data" };
  const thrust = x.m.thrustOwn, rs1m = x.m.rs1mOwn;
  const { state, warns } = decode(thrust, rs1m, x.m.pct1m, x.m.off52);
  return {
    t: x.t, name: x.name, block: x.block,
    thrust, thrust_snap: snap5(thrust), rs1m, rs1m_snap: snap5(rs1m),
    pctIntraday: f(x.m.pctIntraday, 2), pct1d: f(x.m.pct1d, 2), pct1m: f(x.m.pct1m, 2), off52: f(x.m.off52, 2),
    spark: x.m.spark.map(v => f(v, 4)), rsSpark: x.m.rsSpark.map(v => f(v, 4)),
    state, warns,
  };
});
const pf = [{ t: "RSP", name: "S&P 500 Equal Weight", block: "Index", benchmark: true }, ...pfRows];

// ── 5c) Liquid Leaders rows — SAME verified formulas as the groups table (computeRaw reused
// byte-identical), per-STOCK, NO benchmark row (RSP isn't a liquid leader). Carries industry
// (display-only label) and the long/short lev-ETF lists through to the payload. Single curated
// universe now (no src provenance — see the LL_DV note above to re-add the merged screen list).
const metricsLL = rawLL.map(r => ({ ...r, m: r.bars ? computeRaw(r.bars) : null }));
const llRows = metricsLL.map((x) => {
  const base = { t: x.t, industry: x.industry, long: x.long || [], short: x.short || [] };
  if (!x.m) return { ...base, thrust: null, thrust_snap: null, rs1m: null, rs1m_snap: null,
    pctIntraday: null, pct1d: null, pct1m: null, off52: null, spark: [], rsSpark: [], state: null, warns: [],
    err: x.err || (x.bars ? "insufficient history" : "no data") };
  const thrust = x.m.thrustOwn, rs1m = x.m.rs1mOwn;
  const { state, warns } = decode(thrust, rs1m, x.m.pct1m, x.m.off52);
  return {
    ...base,
    thrust, thrust_snap: snap5(thrust), rs1m, rs1m_snap: snap5(rs1m),
    pctIntraday: f(x.m.pctIntraday, 2), pct1d: f(x.m.pct1d, 2), pct1m: f(x.m.pct1m, 2), off52: f(x.m.off52, 2),
    spark: x.m.spark.map(v => f(v, 4)), rsSpark: x.m.rsSpark.map(v => f(v, 4)),
    state, warns,
  };
});

// asof = the latest date common to SPY and the ETFs we could fetch (honest "as of close").
// If that date is TODAY and the US session is still open, the last bar is a PARTIAL day —
// stamp it "(intraday HH:MM ET)" so members never mistake a mid-session read for the close.
let asof = spy[spy.length - 1].d;
{
  const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const mins = et.getHours() * 60 + et.getMinutes();
  const wkday = et.getDay() >= 1 && et.getDay() <= 5;
  const etISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  if (asof === etISO && wkday && mins >= 570 && mins < 960)
    asof += ` (intraday ${String(et.getHours()).padStart(2, "0")}:${String(et.getMinutes()).padStart(2, "0")} ET)`;
}
const payload = { asof, refreshed: today, rows, pf, ll: llRows };

const banner = `// AUTO-GENERATED by scripts/group-rs.mjs — DO NOT EDIT BY HAND.
// Refresh: node --env-file=.env.local scripts/group-rs.mjs
// Group RS = group-level rotation lens computed from ETF daily closes vs RSP (equal-weight
// benchmark, per the source's own "benchmark" row). rs1m = PERCENTRANK.INC of the RS ratio in its
// own trailing 21 sessions ×100. thrust = RS Thrust Rate % = 0.6·RS1W + 0.4·rs1m + 0.1·(RS1W_t −
// RS1W_{t−3}) where RS1W = the same PERCENTRANK on a trailing 7-session window (his exact published
// formula, FAQ post 2064559372655866303; VERIFIED 85/85 cell-exact, range −10…110). Every number is
// bar-derived; failed fetches are kept as rows with nulls + err. DeepVue stays the source of
// truth for single-stock RS and sector grouping.
// payload.ll = the Liquid Leaders per-STOCK table (same rs1m/thrust machinery vs RSP, no benchmark
// row) over a SINGLE curated universe of ~62 leaders that ship with lev/inverse ETF mappings;
// long/short = the liquid leveraged/inverse ETFs tracking each name.
`;
writeFileSync("src/groupRS-data.js", banner + `export const GROUP_RS = ${JSON.stringify(payload, null, 2)};\n`);

const ok = rows.filter(r => r.thrust != null).length;
const failed = rows.filter(r => r.err).map(r => r.t);
console.log(`\n✓ wrote src/groupRS-data.js · asof ${asof} · ${rows.length} rows (${ok} with numbers, ${failed.length} failed)`);
if (failed.length) console.log(`  failed tickers: ${failed.join(", ")}`);
const llOk = llRows.filter(r => r.thrust != null).length;
const llFailed = llRows.filter(r => r.err).map(r => r.t);
console.log(`  liquid leaders (curated only) · ${llRows.length} rows (${llOk} with numbers, ${llFailed.length} failed)`);
if (llFailed.length) console.log(`  LL failed/blank tickers: ${llFailed.join(", ")}`);
