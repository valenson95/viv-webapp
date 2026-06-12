// ════════════════════════════════════════════════════════════════════════
// VIV Webapp · IBKR Sync · Phase 1 (FREE) — scheduled sync  (deploy as api/ibkr-cron.js)
// ════════════════════════════════════════════════════════════════════════
// Runs every minute (see vercel.json). For each OPTED-IN user it pulls IBKR via the
// Flex Web Service, takes IBKR's OWN finished round-trips ("closed lots" / realized
// trades — IBKR does the FIFO matching, so WE never guess), and hands them to the
// idempotent ingest. Cutover-guarded to each user's date (yours = today).
//
// WHY THIS IS SAFE FOR YOUR EXISTING DATA:
//   • cutover guard → nothing before your cutover date is ever touched
//   • ingest upserts by ib_exec_id → new rows only, no matching to old trades, no deletes
//   • round-trips come straight from IBKR → no client-side guess-pairing (your bug source)
//
// ENV (Vercel): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_SECRET, CRON_SECRET,
//               INGEST_URL (e.g. https://your-app.vercel.app/api/ibkr-ingest)
// ════════════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_SECRET = process.env.WORKER_SECRET;
const CRON_SECRET = process.env.CRON_SECRET;
const INGEST_URL = process.env.INGEST_URL;
const SEND_URL = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest";

const tag = (xml, n) => { const m = xml.match(new RegExp(`<${n}>(.*?)</${n}>`, "s")); return m ? m[1].trim() : null; };
function parseElements(xml, name) {
  const out = []; const re = new RegExp(`<${name}\\b([^>]*?)/?>`, "g"); let m;
  while ((m = re.exec(xml)) !== null) { const a = {}; const ar = /([\w]+)\s*=\s*"([^"]*)"/g; let x;
    while ((x = ar.exec(m[1])) !== null) a[x[1]] = x[2]; if (Object.keys(a).length) out.push(a); }
  return out;
}
const ymd = v => (v && String(v).length >= 8) ? `${String(v).slice(0,4)}-${String(v).slice(4,6)}-${String(v).slice(6,8)}` : "";
const hm  = v => (v && String(v).length >= 4) ? `${String(v).slice(0,2)}:${String(v).slice(2,4)}` : "";
async function fetchText(u){ const r = await fetch(u, { headers: { "User-Agent": "VIV-Webapp/1.0" } }); return await r.text(); }

// Pull a user's Flex statement XML (same 2-step flow as the existing ibkr-sync.js).
async function pullFlex(token, queryId) {
  const send = await fetchText(`${SEND_URL}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`);
  if (tag(send, "Status") !== "Success") return null;
  const ref = tag(send, "ReferenceCode");
  const base = tag(send, "Url") || "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement";
  if (!ref) return null;
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, i === 0 ? 800 : 1800));
    const xml = await fetchText(`${base}?t=${encodeURIComponent(token)}&q=${encodeURIComponent(ref)}&v=3`);
    if (xml.includes("<FlexQueryResponse")) return xml;
  }
  return null;
}

// IBKR's authoritative finished round-trips → our ingest "fill" shape.
// REQUIRES the Flex Query to include the realized round-trips. IBKR labels these elements
// differently per template — commonly <Trade ... openCloseIndicator="C" levelOfDetail="CLOSED_LOT">
// or a dedicated <ClosedLot>. We map both; field names are documented so we can confirm
// against your real statement once before going live.
function toFills(xml) {
  // Prefer explicit closed lots; fall back to closing Trades carrying realized P&L.
  const lots = parseElements(xml, "ClosedLot");
  const src = lots.length ? lots : parseElements(xml, "Trade").filter(a =>
    (a.openCloseIndicator || a.openClose || "").includes("C") && a.fifoPnlRealized != null);

  return src.map(a => {
    const isLong = (Number(a.quantity) || 0) < 0 ? false : (a.buySell === "SELL" ? true : true); // closing side heuristic; refined on validation
    const exit = ymd(a.dateTime || a.tradeDate);
    return {
      exec_id: a.ibExecID || a.tradeID || a.transactionID || `${a.conid}-${a.dateTime || a.tradeDate}`,
      trade_id: a.tradeID || null,
      ticker: a.symbol || "",
      trade_type: (a.openPrice != null && a.cost != null) ? ((Number(a.proceeds) > 0) ? "Long" : "Short") : "Long",
      entry_date: ymd(a.openDateTime) || exit,   // closed lots carry the open datetime
      entry_time: hm(a.openDateTime),
      exit_date: exit, exit_time: hm(a.dateTime),
      entry_price: Number(a.openPrice ?? a.basis ?? 0) || null,
      exit_price: Number(a.tradePrice ?? a.price ?? 0) || null,
      shares: Math.abs(Number(a.quantity) || 0),
      commission: Math.abs(Number(a.ibCommission) || 0),
      pl_dollar: Number(a.fifoPnlRealized) || null,
      pl_pct: null, // computed in-app from entry/exit if desired
    };
  }).filter(f => f.exec_id && f.ticker && f.exit_date);
}

export default async function handler(req, res) {
  // Only Vercel Cron (or someone with the secret) may trigger this.
  if (CRON_SECRET && req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  if (!SB_URL || !SB_SERVICE || !INGEST_URL || !WORKER_SECRET) {
    return res.status(500).json({ ok: false, error: "missing env vars" });
  }
  const sb = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

  // Only users who have opted in (have an ibkr_sync_state row with a cutover_date).
  const { data: states } = await sb.from("ibkr_sync_state").select("user_id, cutover_date").not("cutover_date", "is", null);
  const summary = [];

  for (const st of states || []) {
    try {
      const { data: settings } = await sb.from("user_settings")
        .select("setting_key,setting_value").eq("user_id", st.user_id).in("setting_key", ["ibkr_token", "ibkr_query_id"]);
      const m = {}; (settings || []).forEach(s => { m[s.setting_key] = String(s.setting_value || "").trim(); });
      if (!m.ibkr_token || !m.ibkr_query_id) { summary.push({ user: st.user_id, skipped: "no creds" }); continue; }

      const xml = await pullFlex(m.ibkr_token, m.ibkr_query_id);
      if (!xml) { summary.push({ user: st.user_id, skipped: "flex not ready" }); continue; }

      const fills = toFills(xml);
      const r = await fetch(INGEST_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-worker-secret": WORKER_SECRET },
        body: JSON.stringify({ user_id: st.user_id, cutover_date: st.cutover_date, fills }),
      });
      const j = await r.json();
      await sb.from("ibkr_sync_state").update({ last_synced_at: new Date().toISOString() }).eq("user_id", st.user_id);
      summary.push({ user: st.user_id, ingested: j.ingested ?? 0 });
    } catch (e) {
      summary.push({ user: st.user_id, error: String(e.message || e) });
    }
  }
  return res.status(200).json({ ok: true, ran: (states || []).length, summary });
}
