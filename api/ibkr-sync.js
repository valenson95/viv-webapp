// Vercel Serverless Function — Interactive Brokers Flex Web Service sync (READ-ONLY, PER-USER)
// Each member connects THEIR OWN IBKR account: their Flex token + query id live in their own
// (RLS-protected) user_settings row. This function authenticates the caller via their Supabase
// session JWT, reads only that user's credentials, and pulls only that user's statement.
// It NEVER writes to any database. All reconciliation + writes happen client-side behind a confirm.

import { createClient } from "@supabase/supabase-js";

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SB_ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SEND_URL = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest";

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}>(.*?)</${name}>`, "s"));
  return m ? m[1].trim() : null;
};

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
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");

  if (!SB_URL || !SB_ANON) {
    return res.status(500).json({ ok: false, error: "Server not configured: missing SUPABASE_URL / SUPABASE_ANON_KEY env vars in Vercel." });
  }

  try {
    // ── Authenticate the caller and read ONLY their IBKR credentials ──
    const auth = req.headers.authorization || "";
    if (!auth) return res.status(401).json({ ok: false, error: "Not signed in." });
    const sb = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user } = {}, error: uErr } = await sb.auth.getUser();
    if (uErr || !user) return res.status(401).json({ ok: false, error: "Your session expired — refresh the page and sign in again." });

    const { data: settings } = await sb.from("user_settings").select("setting_key,setting_value").eq("user_id", user.id).in("setting_key", ["ibkr_token", "ibkr_query_id"]);
    const m = {};
    (settings || []).forEach(s => { m[s.setting_key] = (s.setting_value == null) ? "" : String(s.setting_value).trim(); });
    const TOKEN = m.ibkr_token;
    const QUERY_ID = m.ibkr_query_id;
    if (!TOKEN || !QUERY_ID) {
      return res.status(400).json({ ok: false, error: "Connect your IBKR account in Settings first — enter your own Flex Query ID and Token." });
    }

    // ── Step 1: request statement generation ──
    const sendXml = await fetchText(`${SEND_URL}?t=${encodeURIComponent(TOKEN)}&q=${encodeURIComponent(QUERY_ID)}&v=3`);
    const status = tag(sendXml, "Status");
    if (status !== "Success") {
      return res.status(502).json({ ok: false, error: `IBKR rejected the request: ${tag(sendXml, "ErrorMessage") || status || "unknown"} (code ${tag(sendXml, "ErrorCode") || "?"})` });
    }
    const ref = tag(sendXml, "ReferenceCode");
    const baseUrl = tag(sendXml, "Url") || "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement";
    if (!ref) return res.status(502).json({ ok: false, error: "No reference code returned by IBKR." });

    // ── Step 2: poll for the statement ──
    let stmtXml = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      await new Promise((r) => setTimeout(r, attempt === 0 ? 800 : 1800));
      stmtXml = await fetchText(`${baseUrl}?t=${encodeURIComponent(TOKEN)}&q=${encodeURIComponent(ref)}&v=3`);
      if (stmtXml.includes("<FlexQueryResponse")) break;
      const s = tag(stmtXml, "Status");
      if (s && s !== "Warn" && s !== "Success") {
        return res.status(502).json({ ok: false, error: `IBKR statement error: ${tag(stmtXml, "ErrorMessage") || s} (code ${tag(stmtXml, "ErrorCode") || "?"})` });
      }
    }
    if (!stmtXml.includes("<FlexQueryResponse")) {
      return res.status(202).json({ ok: false, pending: true, error: "IBKR is still generating the statement. Wait ~30s and hit Sync again." });
    }

    const accountId = (stmtXml.match(/accountId="([^"]+)"/) || [])[1] || null;

    const positions = parseElements(stmtXml, "OpenPosition")
      .map((a) => {
        const dt = parseDateTime(a.openDateTime || a.holdingPeriodDateTime || "");
        const fx = Number(a.fxRateToBase) || 0;
        const cur = (a.currency || "USD").toUpperCase();
        const conv = (v) => { const n = Number(v) || 0; return cur !== "USD" && fx > 0 ? n * fx : n; };
        return { conid: a.conid || "", symbol: a.symbol || "", shares: a.position || "0", avgCost: String(conv(a.costBasisPrice || a.openPrice || "0")), markPrice: a.markPrice !== undefined && a.markPrice !== "" ? String(conv(a.markPrice)) : "", openDate: dt.date, openTime: dt.time, assetCategory: a.assetCategory || "", currency: cur, fxOk: cur === "USD" || fx > 0 };
      })
      .filter((p) => p.symbol && Number(p.shares) !== 0)
      .filter((p) => !p.assetCategory || p.assetCategory.toUpperCase() === "STK")
      .filter((p) => p.fxOk);

    let trades = parseElements(stmtXml, "Trade")
      .map((a) => {
        const dt = parseDateTime(a.dateTime || (a.tradeDate ? a.tradeDate + (a.tradeTime ? ";" + a.tradeTime : "") : ""));
        const fx = Number(a.fxRateToBase) || 0;
        const cur = (a.currency || "USD").toUpperCase();
        const conv = (v) => { const n = Number(v) || 0; return cur !== "USD" && fx > 0 ? n * fx : n; };
        return { tradeID: a.tradeID || "", execID: a.ibExecID || a.tradeID || "", conid: a.conid || "", symbol: a.symbol || "", date: dt.date, time: dt.time, buySell: a.buySell || "", quantity: Math.abs(Number(a.quantity) || 0), signedQty: Number(a.quantity) || 0, price: conv(a.tradePrice), commission: Math.abs(conv(a.ibCommission)), realizedPnl: conv(a.fifoPnlRealized), openClose: a.openCloseIndicator || "", assetCategory: (a.assetCategory || "").toUpperCase(), currency: cur, fxOk: cur === "USD" || fx > 0 };
      })
      .filter((t) => t.symbol && t.execID);
    const skippedNonStock = trades.filter((t) => t.assetCategory && t.assetCategory !== "STK").length;
    const skippedNoFx = trades.filter((t) => (!t.assetCategory || t.assetCategory === "STK") && !t.fxOk).length;
    trades = trades
      .filter((t) => !t.assetCategory || t.assetCategory === "STK")
      .filter((t) => t.fxOk);

    return res.status(200).json({ ok: true, account: accountId, fetchedAt: new Date().toISOString(), positions, trades, skipped: { nonStock: skippedNonStock, foreignNoFxRate: skippedNoFx, note: skippedNoFx > 0 ? "Some non-USD trades were skipped because your Flex template doesn't include fxRateToBase — add it under Trades in your Flex Query to sync them converted to USD." : undefined } });
  } catch (err) {
    return res.status(500).json({ ok: false, error: `Sync failed: ${err.message || err}` });
  }
}
