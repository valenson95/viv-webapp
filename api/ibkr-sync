// Vercel Serverless Function — Interactive Brokers Flex Web Service sync (READ-ONLY)
// Fetches the configured Activity Flex Query, parses Open Positions + Trades, returns normalized JSON.
// IMPORTANT: this function NEVER writes to any database. All reconciliation + writes happen
// client-side behind a preview + explicit confirm, so existing data can never be touched here.

const TOKEN = process.env.IBKR_FLEX_TOKEN;
const QUERY_ID = process.env.IBKR_FLEX_QUERY_ID;
const SEND_URL = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest";

// Read a simple <Tag>value</Tag>
const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>(.*?)</${name}>`, "s"));
  return m ? m[1].trim() : null;
};

// Parse every <ElementName .../> occurrence into an array of {attr: value} objects
function parseElements(xml, elementName) {
  const out = [];
  const re = new RegExp(`<${elementName}\\b([^>]*?)/?>`, "g");
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = {};
    const attrRe = /([\w]+)\s*=\s*"([^"]*)"/g;
    let a;
    while ((a = attrRe.exec(m[1])) !== null) attrs[a[1]] = a[2];
    if (Object.keys(attrs).length) out.push(attrs);
  }
  return out;
}

// "20260502;093000" or "20260502" -> { date: "2026-05-02", time: "09:30" }
function parseDateTime(v) {
  if (!v) return { date: "", time: "" };
  const [d, t] = String(v).split(";");
  let date = "";
  if (d && d.length === 8) date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  let time = "";
  if (t && t.length >= 4) time = `${t.slice(0, 2)}:${t.slice(2, 4)}`;
  return { date, time };
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { "User-Agent": "VIV-Webapp/1.0" } });
  return await r.text();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  if (!TOKEN || !QUERY_ID) {
    return res.status(500).json({ ok: false, error: "IBKR_FLEX_TOKEN / IBKR_FLEX_QUERY_ID not configured in Vercel environment." });
  }

  try {
    // ── Step 1: request statement generation ──
    const sendXml = await fetchText(`${SEND_URL}?t=${encodeURIComponent(TOKEN)}&q=${encodeURIComponent(QUERY_ID)}&v=3`);
    const status = tag(sendXml, "Status");
    if (status !== "Success") {
      return res.status(502).json({ ok: false, error: `IBKR rejected the request: ${tag(sendXml, "ErrorMessage") || status || "unknown"} (code ${tag(sendXml, "ErrorCode") || "?"})` });
    }
    const ref = tag(sendXml, "ReferenceCode");
    const baseUrl = tag(sendXml, "Url") || "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement";
    if (!ref) return res.status(502).json({ ok: false, error: "No reference code returned by IBKR." });

    // ── Step 2: poll for the statement (generation can take a few seconds) ──
    let stmtXml = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise((r) => setTimeout(r, attempt === 0 ? 800 : 1800));
      stmtXml = await fetchText(`${baseUrl}?t=${encodeURIComponent(TOKEN)}&q=${encodeURIComponent(ref)}&v=3`);
      if (stmtXml.includes("<FlexQueryResponse")) break; // real statement arrived
      const s = tag(stmtXml, "Status");
      if (s && s !== "Warn" && s !== "Success") {
        return res.status(502).json({ ok: false, error: `IBKR statement error: ${tag(stmtXml, "ErrorMessage") || s} (code ${tag(stmtXml, "ErrorCode") || "?"})` });
      }
    }
    if (!stmtXml.includes("<FlexQueryResponse")) {
      return res.status(202).json({ ok: false, pending: true, error: "IBKR is still generating the statement. Wait ~30s and hit Sync again." });
    }

    const accountId = (stmtXml.match(/accountId="([^"]+)"/) || [])[1] || null;

    // ── Open Positions ──
    const positions = parseElements(stmtXml, "OpenPosition")
      .map((a) => {
        const dt = parseDateTime(a.openDateTime || a.holdingPeriodDateTime || "");
        return {
          conid: a.conid || "",
          symbol: a.symbol || "",
          shares: a.position || "0",
          avgCost: a.costBasisPrice || a.openPrice || "0",
          markPrice: a.markPrice || "",
          openDate: dt.date,
          openTime: dt.time,
          assetCategory: a.assetCategory || "",
        };
      })
      .filter((p) => p.symbol && Number(p.shares) !== 0);

    // ── Trades (execution level) ──
    const trades = parseElements(stmtXml, "Trade")
      .map((a) => {
        const dt = parseDateTime(a.dateTime || (a.tradeDate ? a.tradeDate + (a.tradeTime ? ";" + a.tradeTime : "") : ""));
        return {
          tradeID: a.tradeID || "",
          execID: a.ibExecID || a.tradeID || "",
          conid: a.conid || "",
          symbol: a.symbol || "",
          date: dt.date,
          time: dt.time,
          buySell: a.buySell || "",
          quantity: Math.abs(Number(a.quantity) || 0),
          signedQty: Number(a.quantity) || 0,
          price: Number(a.tradePrice) || 0,
          commission: Math.abs(Number(a.ibCommission) || 0),
          realizedPnl: Number(a.fifoPnlRealized) || 0,
          openClose: a.openCloseIndicator || "",
          assetCategory: a.assetCategory || "",
        };
      })
      .filter((t) => t.symbol && t.execID);

    return res.status(200).json({ ok: true, account: accountId, fetchedAt: new Date().toISOString(), positions, trades });
  } catch (err) {
    return res.status(500).json({ ok: false, error: `Sync failed: ${err.message || err}` });
  }
}
