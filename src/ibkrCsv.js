// ─── IBKR CSV import ───
// Members download statements straight from IBKR and drop them into Import CSV. IBKR ships two
// different CSV shapes, and neither matches our journal columns — this module detects + parses both
// and pairs the raw executions into closed round-trip trades (flat → flat = one campaign,
// weighted-average cost, matching how the live Flex sync builds trades).
//
//  A. Activity Statement CSV — multi-section file; we read the "Trades" section:
//     Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,...,Comm/Fee,...
//     Trades,Data,Order,Stocks,USD,AAPL,"2026-05-01, 09:35:12",100,181.5,...
//  B. Flex Query CSV — one flat table whose header uses IBKR field names:
//     "Symbol","DateTime","Buy/Sell","Quantity","TradePrice","IBCommission","AssetClass",...
//
// Pure functions, no imports — unit-testable with plain node.

// Split one CSV line respecting quotes ("" = escaped quote).
function splitCsvLine(line) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

// "1,234.56" / "-1,000" → number (IBKR quotes thousands separators)
function parseNum(v) {
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// Normalize IBKR's date/time spellings → { date: "YYYY-MM-DD", time: "HH:MM" }
// Accepts: "2026-05-01, 09:35:12" · "20260501;093512" · "2026-05-01;09:35:12" · "20260501" · "2026-05-01"
function parseIbkrDateTime(v) {
  if (!v) return { date: "", time: "" };
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})(?:[;,\s]+(\d{2}):?(\d{2})(?::?\d{2})?)?/);
  if (!m) return { date: "", time: "" };
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[4]}:${m[5]}` : "" };
}

// Is this text an IBKR export (vs our own VIV CSV / master export)?
export function looksLikeIbkrCSV(text) {
  const head = String(text).slice(0, 6000);
  // Activity Statement — sectioned rows always start with the section name
  if (/^"?(Statement|Trades|Account Information)"?,"?(Header|Data)"?,/m.test(head)) return true;
  // Flex Query — first non-empty line is a header with IBKR's field names
  const firstLine = (String(text).split(/\r?\n/).find(l => l.trim()) || "").toLowerCase();
  const ibkrFields = ["tradeprice", "ibcommission", "fifopnlrealized", "buy/sell", "clientaccountid", "assetclass", "ibexecid", "fxratetobase", "tradeid"];
  const hits = ibkrFields.filter(f => firstLine.includes(f)).length;
  return hits >= 2;
}

// ── Parse the Activity Statement's "Trades" section into raw executions ──
function parseActivityStatement(text) {
  const orders = [], fills = [];
  const skipped = { nonStock: 0, nonUsd: 0 };
  let cols = null; // header for the current Trades block (statements can repeat it per asset class)
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = splitCsvLine(line);
    if (cells[0] !== "Trades") { continue; }
    if (cells[1] === "Header") { cols = cells; continue; }
    if (cells[1] !== "Data" || !cols) continue;
    const row = {};
    cols.forEach((c, i) => { row[c] = cells[i] !== undefined ? cells[i] : ""; });
    const disc = row["DataDiscriminator"] || "";
    if (disc !== "Order" && disc !== "Trade") continue; // skip SubTotal / Total / ClosedLot rows
    const symbol = (row["Symbol"] || "").toUpperCase();
    const qty = parseNum(row["Quantity"]);
    if (!symbol || qty === 0) continue;
    const assetCat = row["Asset Category"] || "";
    if (!/^stocks/i.test(assetCat)) { skipped.nonStock++; continue; }
    const currency = (row["Currency"] || "USD").toUpperCase();
    if (currency !== "USD") { skipped.nonUsd++; continue; } // Activity CSV has no FX rate → can't convert
    const dt = parseIbkrDateTime(row["Date/Time"]);
    (disc === "Order" ? orders : fills).push({ symbol, date: dt.date, time: dt.time, qty, price: parseNum(row["T. Price"]), commission: Math.abs(parseNum(row["Comm/Fee"])) });
  }
  // Some statements list BOTH the aggregated Order row and its constituent Trade fills —
  // using both would double-count, so prefer Order rows whenever any exist.
  return { execs: orders.length ? orders : fills, skipped };
}

// ── Parse a Flex Query CSV (flat table) into raw executions ──
function parseFlexCsv(text) {
  const execs = [];
  const skipped = { nonStock: 0, nonUsd: 0 };
  const lines = String(text).split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { execs, skipped };
  const hdr = splitCsvLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z/]/g, ""));
  const idx = (...names) => { for (const n of names) { const i = hdr.indexOf(n); if (i >= 0) return i; } return -1; };
  const iSym = idx("symbol");
  const iDT = idx("datetime", "date/time");
  const iDate = idx("tradedate", "date", "reportdate");
  const iTime = idx("tradetime", "time");
  const iQty = idx("quantity", "qty");
  const iPrice = idx("tradeprice", "price", "tprice");
  const iBS = idx("buy/sell", "buysell", "side");
  const iComm = idx("ibcommission", "commission", "comm/fee", "commfee");
  const iAsset = idx("assetclass", "assetcategory", "assetcategory");
  const iCur = idx("currencyprimary", "currency");
  const iFx = idx("fxratetobase");
  if (iSym < 0 || iQty < 0 || iPrice < 0) return { execs, skipped };
  for (let li = 1; li < lines.length; li++) {
    const cells = splitCsvLine(lines[li]);
    const symbol = (cells[iSym] || "").toUpperCase();
    if (!symbol || symbol === "SYMBOL") continue; // repeated headers / footer rows
    let qty = parseNum(cells[iQty]);
    if (qty === 0) continue;
    const bs = iBS >= 0 ? (cells[iBS] || "").toUpperCase() : "";
    if (bs.startsWith("SELL") && qty > 0) qty = -qty; // some templates report unsigned qty + Buy/Sell
    const assetCls = iAsset >= 0 ? (cells[iAsset] || "").toUpperCase() : "";
    if (assetCls && assetCls !== "STK" && !/^stocks/i.test(assetCls)) { skipped.nonStock++; continue; }
    const cur = iCur >= 0 ? (cells[iCur] || "USD").toUpperCase() : "USD";
    const fx = iFx >= 0 ? parseNum(cells[iFx]) : 0;
    let price = parseNum(cells[iPrice]);
    let commission = Math.abs(iComm >= 0 ? parseNum(cells[iComm]) : 0);
    if (cur !== "USD") {
      if (fx > 0) { price *= fx; commission *= fx; }
      else { skipped.nonUsd++; continue; }
    }
    let dt = { date: "", time: "" };
    if (iDT >= 0 && cells[iDT]) dt = parseIbkrDateTime(cells[iDT]);
    if (!dt.date && iDate >= 0) dt = parseIbkrDateTime(cells[iDate] + (iTime >= 0 && cells[iTime] ? ";" + cells[iTime].replace(/:/g, "") : ""));
    execs.push({ symbol, date: dt.date, time: dt.time, qty, price, commission });
  }
  return { execs, skipped };
}

// ── Pair executions into closed campaigns (flat → flat = ONE trade, weighted-average both legs) ──
function buildTradesFromExecs(execs) {
  const bySym = {};
  execs.forEach(e => { (bySym[e.symbol] = bySym[e.symbol] || []).push(e); });
  const trades = [];
  const openLots = [];
  let id = Date.now();
  Object.keys(bySym).sort().forEach(sym => {
    const rows = bySym[sym].slice().sort((a, b) => (`${a.date} ${a.time}`).localeCompare(`${b.date} ${b.time}`));
    let lot = null; // { dir, qty, avgCost, entryDate, entryTime, comm, closedQty, closeValue }
    const emit = () => {
      const exitP = lot.closedQty > 0 ? lot.closeValue / lot.closedQty : 0;
      const gross = lot.dir > 0 ? (exitP - lot.avgCost) * lot.closedQty : (lot.avgCost - exitP) * lot.closedQty;
      const plPct = lot.avgCost > 0 ? (lot.dir > 0 ? (exitP / lot.avgCost - 1) : (1 - exitP / lot.avgCost)) * 100 : 0;
      trades.push({
        id: ++id, ticker: sym,
        entry: lot.entryDate, entryTime: lot.entryTime,
        exit: lot.exitDate, exitTime: lot.exitTime,
        entryP: Number(lot.avgCost.toFixed(4)), exitP: Number(exitP.toFixed(4)),
        shares: lot.closedQty, stop: 0,
        setup: "VCP", tags: ["IBKR import"],
        plPct: Number(plPct.toFixed(4)), plDollar: Number(gross.toFixed(2)), rMult: 0,
        reason: "", commission: Number(lot.comm.toFixed(2)),
        notes: "", chartUrl: "", chartImage: "",
        tradeType: lot.dir > 0 ? "Long" : "Short",
        _imported: true,
      });
    };
    for (const e of rows) {
      let q = e.qty;
      while (q !== 0) {
        if (!lot) {
          lot = { dir: Math.sign(q), qty: Math.abs(q), avgCost: e.price, entryDate: e.date, entryTime: e.time, comm: e.commission, closedQty: 0, closeValue: 0, exitDate: "", exitTime: "" };
          q = 0;
        } else if (Math.sign(q) === lot.dir) {
          // add in the lot's direction → new weighted-average cost
          const add = Math.abs(q);
          lot.avgCost = (lot.avgCost * lot.qty + e.price * add) / (lot.qty + add);
          lot.qty += add; lot.comm += e.commission;
          q = 0;
        } else {
          // closing fill — may close part, all, or FLIP through zero into a new opposite lot
          const closeNow = Math.min(Math.abs(q), lot.qty);
          lot.qty -= closeNow;
          lot.closedQty += closeNow;
          lot.closeValue += e.price * closeNow;
          lot.comm += e.commission * (closeNow / Math.abs(e.qty)); // pro-rate commission on a flip fill
          lot.exitDate = e.date; lot.exitTime = e.time;
          q += lot.dir * closeNow; // consume the closed portion (opposite signs cancel)
          if (lot.qty === 0) { emit(); lot = null; } // flat → campaign complete; leftover q reopens opposite
        }
      }
    }
    if (lot && lot.qty > 0) openLots.push({ symbol: sym, qty: lot.dir * lot.qty, avgCost: Number(lot.avgCost.toFixed(4)), entryDate: lot.entryDate });
  });
  return { trades, openLots };
}

// Main entry: text → { trades, openLots, skipped } (or null if it isn't an IBKR file)
export function parseIbkrCSV(text) {
  if (!looksLikeIbkrCSV(text)) return null;
  const isActivity = /^"?(Statement|Trades|Account Information)"?,"?(Header|Data)"?,/m.test(String(text).slice(0, 6000));
  const { execs, skipped } = isActivity ? parseActivityStatement(text) : parseFlexCsv(text);
  const { trades, openLots } = buildTradesFromExecs(execs);
  return { trades, openLots, skipped, execCount: execs.length };
}
