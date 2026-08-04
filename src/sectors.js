// ─────────────────────────────────────────────────────────────
// Ticker → DeepVue-style sector/theme map. DETERMINISTIC, no AI.
// The webapp recognizes a position's theme from its ticker via this table.
// Unknown tickers return null → the row shows "—" (add it here or let the
// member pick). Sector strings mirror DeepVue's GROUPING (thematic, not GICS).
// Each ticker appears ONCE in its primary theme; some are judgment calls
// (SMCI=AI, PLTR=Software, OKLO=Uranium) — correct as DeepVue annotates.
//
// ⚠️ AUTHORITY (settled 2026-08-03). DeepVue exposes TWO different lenses and they disagree:
//   1. the GICS INDUSTRY on a chart header  ("CRWD — Software")
//   2. THEME-TRACKER MEMBERSHIP in themeConstituents-data.js  (CRWD ∈ Software+Cybersecurity+Growth)
// Only lens 2 drives the in/off-theme chip, because only lens 2 is what the tracker ranks.
// Tagging off the industry header breaks names like NET: the header says Software, but DeepVue's
// Software theme list is COMPLETE at 106/106 and does not contain NET — it is Cybersecurity.
//
// RULE when a ticker sits in several themes (Valen 2026-08-03): MOST SPECIFIC WINS.
//   Cybersecurity > Software > Growth Stocks.   CRWD/NET → Cybersecurity · DDOG → Software.
// A name whose ONLY membership is a broad theme takes that one (NTAP → Growth Stocks).
// ─────────────────────────────────────────────────────────────
const G = (theme, ...tickers) => tickers.reduce((o, t) => (o[t] = theme, o), {});

const SECTORS = {
  ...G("Semiconductors","NVDA","AMD","AVGO","MU","MRVL","ARM","TSM","ASML","AMAT","KLAC","LRCX","QCOM","ON","LSCC","MCHP","ALAB","CRDO","AMKR","ACLS","MXL","GFS","INTC","COHR","LITE","AAOI","FN","MTSI","QRVO","SWKS","WOLF","NVTS","POWI","MPWR","CIEN","FORM","VECO","UCTT","ONTO","CAMT","NVMI","AEHR","INDI","SITM","RMBS","SYNA","ALGM","DIOD","HIMX","TSEM","ADI","TXN","NXPI","STM","ENTG","COHU","AOSL","SLAB","MRCY","CRUS","SOXL","SOXS"),
  ...G("AI","NBIS","SMCI","VRT","BBAI","SOUN","AI","AMBA","TQQQ","SQQQ","QQQ","HPE"),
  ...G("Software","MSFT","ORCL","NOW","NTNX","CRM","SNOW","DDOG","MDB","TEAM","TWLO","DOCN","SHOP","PLTR","HUBS","WDAY","ADBE","INTU","APP","DOCU","PATH","GTLB","ESTC","CFLT","BILL","ASAN","MNDY","PCOR","BRZE","FROG","U","RBLX","PSTG","FIVN","INOD","FIG","BASE","CVLT","NCNO","DBX","BOX","NAVN"/* Nov-2025 IPO; industry-header lens (Packaged Software) — NOT yet in any captured DeepVue theme list, verify on next constituents drop */,"SMAR","PD","APPN","AYX","WK","YEXT","BL","GWRE","MANH","TYL","SPT","ZI"),
  ...G("Cybersecurity","CRWD","PANW","ZS","S","OKTA","NET","FTNT","TENB","RBRK","CYBR","VRNS","RPD","QLYS","AKAM","GEN","CHKP"),
  ...G("Biotechnology","MRNA","BNTX","VRTX","REGN","GILD","BIIB","AMGN","PTCT","SRPT","RARE","BMRN","IONS","ARWR","ALNY","INCY","EXEL","HALO","CYTK","KRYS","MDGL","VKTX","KYMR","SEPN","SYRE","TNGX","BRKR","ADPT","TVTX","KOD","HROW","CPRX","RYTM","INSM","AXSM","IMVT","ARDX","BBIO","ACAD","NBIX","JAZZ","APLS","IOVA","RXRX","VERV","DVAX","CORT","SMMT","PCVX","RVMD"),
  ...G("Genomics","CRSP","NTLA","BEAM","EDIT","GH","TXG","PACB","NVTA","EXAS","VCYT","DNA","TWST","FLGT","NTRA"),
  ...G("Medical","ISRG","BLFS","HAE","DXCM","PODD","TMDX","GKOS","PEN","INSP","TNDM","IRTC","NARI","SILK","BSX","MDT","SYK","EW","ALGN","RMD","GEHC","IDXX","DGX","SOLV","LNTH","AXNX","PRCT"),
  ...G("HealthCare","UNH","HIMS","OSCR","CI","ELV","HCA","MOH","HUM","ALHC","AGL","DOCS","MCK","COR","CNC","THC","UHS","TDOC","PGNY"),
  ...G("Bitcoin","MSTR","COIN","IBIT","BITO","BITX","FBTC"),
  ...G("Bitcoin Miners","MARA","RIOT","CLSK","WULF","IREN","CIFR","BTDR","HUT","BITF","BTBT","HIVE","SDIG"),
  ...G("Quantum","IONQ","QUBT","RGTI","QBTS","ARQQ","QMCO"),
  ...G("Robotics","SERV","RR","TER","SYM","KSCP","IRBT","OSS"),
  ...G("Solar","FSLR","ENPH","SEDG","RUN","NXT","ARRY","SHLS","CSIQ","JKS","TAN","MAXN","FLNC","NOVA"),
  ...G("Uranium","CCJ","UEC","UUUU","DNN","NXE","LEU","OKLO","SMR","URA","URNM","URG"),
  ...G("Utilities","VST","CEG","NRG","TLN","GEV","BE","NEE","SO","DUK","PWR","D","AEP","EXC","ETR","PEG","FE","CNP","NRGV"),
  ...G("Oil & Gas","XOM","CVX","OXY","DVN","FANG","EQT","VLO","MPC","PSX","DINO","SLB","HAL","TRGP","LNG","CTRA","AR","RRC","OVV","MTDR","CHRD","EOG","COP","APA","HES"),
  ...G("Steel","NUE","STLD","X","CLF","MT","RS","CMC","TX","GGB","ZEUS"),
  ...G("Gold Miners","GOLD","NEM","AEM","KGC","AU","WPM","FNV","AGI","GFI","HMY","BTG","EGO","IAG","OR"),
  ...G("Silver Miners","PAAS","HL","CDE","AG","SSRM","EXK","MAG","SILV","FSM","GATO"),
  ...G("Aerospace","ASTS","RKLB","WWD","LUNR","RDW","KTOS","AVAV","LMT","RTX","NOC","GD","BA","HWM","HEI","TDG","LHX","CW","AXON","RCAT","PL","ACHR","JOBY","EH"),
  ...G("Airlines","DAL","UAL","AAL","LUV","ALK","JBLU","SAVE","CPA","SKYW","ALGT","RYAAY"),
  ...G("Financials","HOOD","SOFI","AFRM","UPST","NU","DAVE","CRCL","PYPL","XYZ","FUTU","IBKR","LMND","TOST","BULL","STNE","PAGS","FOUR","GPN","WEX","JPM","GS","MS","BAC","C","SCHW","KKR","APO","BX","ARES","OWL"),
  // NTAP moved out of Software 2026-08-03: DeepVue's Software theme list is COMPLETE (106/106)
  // and does not contain it; Growth Stocks is its only DeepVue theme membership.
  // Authority = themeConstituents-data.js (his tracker), NOT the GICS industry on a chart header.
  ...G("Growth Stocks","NTAP","TSLA","RIVN","LCID","CAVA","DKNG","SN","CELH","ELF","DUOL","ONON","BROS","WING","ANF","RH","CROX","DECK","SG","CART","LULU","CMG","TTD","AS","BIRK","MELI"),
  ...G("Social Media","META","RDDT","SNAP","PINS","BMBL","MTCH","RSI","GRND"),
  ...G("China Internet","BABA","PDD","JD","BIDU","NTES","LI","XPEV","NIO","TME","BILI","ZK","BEKE","MNSO","VIPS","YMM"),
  ...G("Communication","GOOGL","GOOG","NFLX","DIS","ROKU","SPOT","WBD","PARA","FUBO","TTWO","EA"),
  ...G("Telecom","T","VZ","TMUS","LUMN"),
  ...G("Home Construction","DHI","LEN","PHM","TOL","NVR","KBH","BLDR","BLD","IBP","TMHC","MHO","GRBK","TPH","MTH","CVCO"),
  ...G("Industrials","GE","ETN","EMR","HON","CAT","DE","PH","AZZ","AAON","NVT","CECO","POWL","CSWI","FIX","LII","VMI","ATKR","HUBB","AME","ROK","GNRC","IR","DOV","PNR","ITT"),
  ...G("Transports","UBER","LYFT","FDX","UPS","ODFL","CHRW","XPO","GXO","ZIM","SAIA","JBHT","KNX","ARCB","MATX"),
  ...G("Materials","LIN","APD","SHW","FCX","ALB","MP","CE","VMC","MLM","SCCO","CRML","USAR","TMC"),
  ...G("Retail","WMT","CHEF","COST","TGT","DKS","BURL","ULTA","DPZ","TJX","ROST","FIVE","BOOT","WSM","ORLY","AZO","URBN","VSXY","AMZN"/* Victoria's Secret — DeepVue chart annotation "Specialty Retail", Valen 2026-08-04 */),
  ...G("Real Estate","PLD","AMT","EQIX","DLR","O","SPG","CBRE","WELL","VICI","IRM","SBAC","EXR","AMH"),
  ...G("Banks","WFC","USB","PNC","TFC","COF","FITB","MTB","HBAN","RF","KEY","CFG","ZION","WAL","EWBC"),
  ...G("Data Center","CRWV","CORZ","GDS","SWCH"),
  // HPE moved to AI 2026-08-03 (his call): DeepVue lists it in AI + Quantum only. "Technology"
  // is NOT a tracker theme, so anything left here can never earn an in/off-theme chip.
  ...G("Technology","DELL","HPQ","ANET","WDC","STX","JBL","FLEX","CLS","APH","GLW","TEL"),
};

import { useEffect, useState } from "react";

// ── Dynamic fallback layer ───────────────────────────────────
// The curated map above is PRIMARY (mirrors Valen's DeepVue groupings).
// Unknown tickers resolve once via /api/sector (Finnhub industry → theme),
// then persist in localStorage so later renders are instant/offline.
const DYN_KEY = "viv-sector-cache-v1";
function loadDyn() {
  try { return JSON.parse(localStorage.getItem(DYN_KEY) || "{}"); } catch { return {}; }
}
let DYN = typeof localStorage !== "undefined" ? loadDyn() : {};
const MISSES = new Set();   // tickers the API couldn't resolve — don't refetch every render
let pending = null;         // single in-flight batch

// ── DeepVue-annotation override (HARD RULE: DeepVue owns grouping) ────────────
// The published Daily Setups feed carries the sector the ADMIN annotated for a
// ticker (the real DeepVue group). That published annotation is authoritative and
// must WIN over the self-categorized SECTORS table above — otherwise the Dashboard
// (SECTORS) and Daily Setups (annotation) disagree for the same ticker (member
// reports: DELL/RXT/WYFI showed "Technology · out of theme" on the Dashboard but
// software/AI on Daily Setups). App populates this from daily_setups on load via
// setSectorOverrides(); until then it's empty and behavior is unchanged.
let OVERRIDE = {};
export function setSectorOverrides(map) {
  if (!map || typeof map !== "object") return;
  let changed = false;
  for (const k of Object.keys(map)) {
    const t = String(k).toUpperCase().trim();
    const v = map[k];
    if (t && v && OVERRIDE[t] !== v) { OVERRIDE[t] = v; changed = true; }
  }
  if (changed && typeof window !== "undefined") window.dispatchEvent(new Event("viv-sectors"));
}

export function sectorFor(ticker) {
  if (!ticker) return null;
  const t = String(ticker).toUpperCase().trim();
  return OVERRIDE[t] || SECTORS[t] || DYN[t] || null;
}

// Queue unknown tickers, batch-resolve via /api/sector, persist + notify ("viv-sectors" event).
export function resolveSectors(tickers) {
  const unknown = (tickers || [])
    .map(t => String(t || "").toUpperCase().trim())
    .filter(t => t && !SECTORS[t] && !DYN[t] && !MISSES.has(t));
  if (unknown.length === 0 || pending) return; // leftovers re-queue on the next render
  const batch = [...new Set(unknown)].slice(0, 15);
  pending = fetch(`/api/sector?symbols=${batch.join(",")}`)
    .then(r => (r.ok ? r.json() : {}))
    .then(map => {
      let changed = false;
      batch.forEach(t => {
        if (map[t]) { DYN[t] = map[t]; changed = true; }
        else MISSES.add(t);
      });
      if (changed) {
        try { localStorage.setItem(DYN_KEY, JSON.stringify(DYN)); } catch {}
        window.dispatchEvent(new Event("viv-sectors"));
      }
    })
    .catch(() => { batch.forEach(t => MISSES.add(t)); })
    .finally(() => { pending = null; });
}

// Hook: resolves unknown tickers in the background + re-renders when new sectors land.
export function useSectors(tickers) {
  const [, setV] = useState(0);
  const key = (tickers || []).filter(Boolean).join(",");
  useEffect(() => {
    const h = () => setV(x => x + 1);
    window.addEventListener("viv-sectors", h);
    return () => window.removeEventListener("viv-sectors", h);
  }, []);
  useEffect(() => { if (key) resolveSectors(key.split(",")); }, [key]);
}

export default SECTORS;
