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

// ── Human-readable, ACTIONABLE messages for IBKR Flex error codes ──
// Members see these verbatim in the sync modal, so each one says exactly what to do next.
// Codes from IBKR's Flex Web Service reference (1001–1021).
function friendlyFlexError(code, rawMsg) {
  const c = String(code || "");
  const map = {
    "1012": "Your Flex token has EXPIRED. In IBKR: Performance & Reports → Flex Queries → Flex Web Service Configuration → generate a new token (set expiry up to 1 year), then paste the new token in Settings → IBKR and Save.",
    "1015": "Your Flex TOKEN is invalid. Re-copy it from IBKR (Performance & Reports → Flex Queries → Flex Web Service Configuration — it's the long number, ~15–25 digits) and paste it again in Settings → IBKR. Make sure there are no spaces.",
    "1014": "Your Flex QUERY ID is invalid. It must be the short number shown next to your query in Performance & Reports → Flex Queries (e.g. 1519726) — not your username or email. Fix it in Settings → IBKR.",
    "1013": "IBKR blocked the request due to an IP restriction on your Flex token. In Flex Web Service Configuration, remove the IP restriction (leave the IP field empty) and try again.",
    "1011": "Flex Web Service is not enabled on your IBKR account yet. In IBKR: Performance & Reports → Flex Queries → Flex Web Service Configuration → set Status to ON, then try again.",
    "1016": "The account in your Flex query doesn't match this token. Re-create the Flex Query under the SAME IBKR user that generated the token.",
    "1018": "Too many sync requests in a short time — IBKR rate-limited the token. Wait 1–2 minutes and hit Sync again.",
    "1009": "IBKR's statement servers are busy right now. Wait a minute and hit Sync again.",
    "1019": "IBKR is still generating your statement. Wait ~30 seconds and hit Sync again.",
    "1021": "IBKR couldn't retrieve the statement this time. Wait a minute and hit Sync again.",
    "1010": "This Flex query uses IBKR's legacy format. Re-create it as a new Flex Query (Performance & Reports → Flex Queries → Trades) and use the new Query ID.",
    "1020": "IBKR couldn't validate the request — this almost always means the Query ID or token isn't what IBKR expects. Check in Settings → IBKR that: (1) Flex Query ID is the short NUMBER from your Flex Queries list (e.g. 1519726) — not an email or username; (2) the token is the long number from Flex Web Service Configuration, pasted with no spaces.",
  };
  return map[c] || `IBKR rejected the request: ${rawMsg || "unknown error"} (code ${c || "?"})`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  // CORS preflight — the client calls this DIRECTLY on the canonical host to dodge the apex→www redirect
  // (a cross-origin redirect strips the Authorization header). A direct cross-origin call needs OPTIONS to 204.
  if (req.method === "OPTIONS") { return res.status(204).end(); }

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
    // ── Validate BEFORE calling IBKR — catches the classic mistakes (email/username in the Query ID
    // field, token with spaces, swapped fields) with a message that says exactly what to fix.
    if (/^\d{1,9}$/.test(TOKEN) && /^\d{13,}$/.test(QUERY_ID)) {
      return res.status(400).json({ ok: false, error: "It looks like your Query ID and token are SWAPPED — the token is the LONG number (~15–25 digits), the Query ID is the SHORT one (e.g. 1519726). Swap them in Settings → IBKR and Save." });
    }
    if (!/^\d{1,12}$/.test(QUERY_ID)) {
      return res.status(400).json({ ok: false, error: `Your Flex Query ID ("${QUERY_ID.slice(0, 40)}") isn't valid — it must be the short NUMBER shown next to your query in IBKR under Performance & Reports → Flex Queries (e.g. 1519726), not your email or username. Fix it in Settings → IBKR and Save.` });
    }
    if (!/^[A-Za-z0-9]{8,64}$/.test(TOKEN)) {
      return res.status(400).json({ ok: false, error: "Your Flex token doesn't look right — it should be one long number/code (~15–25 characters) with no spaces, copied from IBKR's Flex Web Service Configuration. Re-paste it in Settings → IBKR and Save." });
    }

    // ── Step 1: request statement generation ──
    const sendXml = await fetchText(`${SEND_URL}?t=${encodeURIComponent(TOKEN)}&q=${encodeURIComponent(QUERY_ID)}&v=3`);
    const status = tag(sendXml, "Status");
    if (status !== "Success") {
      return res.status(502).json({ ok: false, error: friendlyFlexError(tag(sendXml, "ErrorCode"), tag(sendXml, "ErrorMessage") || status) });
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
        const code = tag(stmtXml, "ErrorCode");
        // 1019 = still generating — keep polling instead of failing the sync.
        if (code === "1019") continue;
        return res.status(502).json({ ok: false, error: friendlyFlexError(code, tag(stmtXml, "ErrorMessage") || s) });
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
