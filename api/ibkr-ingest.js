// ════════════════════════════════════════════════════════════════════════
// VIV Webapp · IBKR Sync · Step 2 — INGEST endpoint  (goes in viv-webapp: api/ibkr-ingest.js)
// ════════════════════════════════════════════════════════════════════════
// The ONLY thing that writes synced fills into Supabase. Called by the worker (Step 4).
//
// THREE RULES THAT KILL THE OLD BUGS:
//   1. IDEMPOTENT — upsert keyed on (user_id, ib_exec_id). Run it 1000×, never a duplicate.
//   2. APPEND-ONLY — it NEVER deletes a row. (No more "deleted trade came back" / data loss.)
//   3. STOP-SAFE — a new IBKR trade comes in with NO stop → needs_stop=true, r_mult=null.
//      The stop (your initial risk) is set later, ONCE, and locked (you trail, so we must
//      never overwrite it). R is computed only when a locked stop exists.
//
// AUTH: server-to-server. The worker sends a shared secret (WORKER_SECRET). We write with the
// Supabase SERVICE ROLE key and set user_id explicitly. No browser ever calls this.
//
// ENV VARS (set in Vercel — never in code/repo):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_SECRET
// ════════════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_SECRET = process.env.WORKER_SECRET;

// R-multiple from the LOCKED INITIAL stop (never the trailed one).
function computeR({ trade_type, entry_price, exit_price, stop_price }) {
  if (stop_price == null || !entry_price || !exit_price) return null;
  const riskPerShare = trade_type === "Long" ? entry_price - stop_price : stop_price - entry_price;
  if (!(riskPerShare > 0)) return null; // bad/again-the-wrong-side stop → don't fabricate an R
  const profitPerShare = trade_type === "Long" ? exit_price - entry_price : entry_price - exit_price;
  return +(profitPerShare / riskPerShare).toFixed(2);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  if (!SB_URL || !SB_SERVICE || !WORKER_SECRET) {
    return res.status(500).json({ ok: false, error: "Server not configured (missing env vars)." });
  }
  // ── Authenticate the worker (server-to-server) ──
  if ((req.headers["x-worker-secret"] || "") !== WORKER_SECRET) {
    return res.status(401).json({ ok: false, error: "Bad worker secret." });
  }

  // Body contract (the worker normalises IBKR into this shape):
  //   { user_id, cutover_date, fills: [{ exec_id, trade_id, ticker, trade_type, entry_date,
  //     entry_time, exit_date, exit_time, entry_price, exit_price, shares, commission,
  //     pl_pct, pl_dollar }] }
  const { user_id, cutover_date, fills } = req.body || {};
  if (!user_id || !Array.isArray(fills)) {
    return res.status(400).json({ ok: false, error: "Need user_id and fills[]." });
  }

  const sb = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
  const nowIso = new Date().toISOString();

  // CUTOVER GUARD: only fills on/after the cutover date (today). Existing history untouched.
  const eligible = fills.filter(f => f.exec_id && (!cutover_date || (f.exit_date || f.entry_date) >= cutover_date));

  const rows = eligible.map(f => ({
    user_id,
    ticker: f.ticker,
    entry_date: f.entry_date, entry_time: f.entry_time || "",
    exit_date: f.exit_date,   exit_time: f.exit_time || "",
    entry_price: f.entry_price, exit_price: f.exit_price,
    shares: f.shares, commission: f.commission ?? 0,
    pl_pct: f.pl_pct ?? null, pl_dollar: f.pl_dollar ?? null,
    trade_type: f.trade_type || "Long",
    source: "ibkr",
    ib_exec_id: f.exec_id, ib_trade_id: f.trade_id || null, ib_synced_at: nowIso,
    is_deleted: false,
    // Stop is UNKNOWN at ingest (you often run mental stops). Flag it; R stays blank.
    needs_stop: true,
    r_mult: null,
  }));

  if (!rows.length) return res.status(200).json({ ok: true, ingested: 0, note: "nothing new on/after cutover" });

  // RULES 1+2+3 — done WITHOUT upsert, on purpose:
  //   • upsert(onConflict) can't target the PARTIAL unique index (where ib_exec_id is not null)
  //     → PostgREST throws "no unique or exclusion constraint matching the ON CONFLICT".
  //   • upsert would also re-write needs_stop/r_mult on every re-sync → it would WIPE the stop
  //     you locked in. We must never do that.
  // So: find which exec_ids already exist, INSERT only the new ones, and for ones we've seen
  // before refresh ONLY the figures IBKR can settle late (commission / realised P&L / exit).
  // We NEVER touch stop_price, current_stop_price, stop_locked_at, needs_stop, r_mult, setup,
  // tags, or notes once a row exists. The unique index stays as a race-condition backstop.
  const execIds = rows.map(r => r.ib_exec_id);
  const { data: existing, error: exErr } = await sb
    .from("trades").select("ib_exec_id").eq("user_id", user_id).in("ib_exec_id", execIds);
  if (exErr) return res.status(500).json({ ok: false, error: exErr.message });
  const seen = new Set((existing || []).map(r => r.ib_exec_id));

  const toInsert = rows.filter(r => !seen.has(r.ib_exec_id));
  const toRefresh = rows.filter(r => seen.has(r.ib_exec_id));

  let ingested = 0;
  if (toInsert.length) {
    const { data: ins, error: insErr } = await sb.from("trades").insert(toInsert).select("id");
    // 23505 = a concurrent run inserted it first; the index did its job, so tolerate it.
    if (insErr && insErr.code !== "23505") return res.status(500).json({ ok: false, error: insErr.message });
    ingested = ins?.length ?? 0;
  }

  let refreshed = 0;
  for (const r of toRefresh) {
    const { error: upErr } = await sb.from("trades")
      .update({ commission: r.commission, pl_dollar: r.pl_dollar, pl_pct: r.pl_pct,
                exit_price: r.exit_price, exit_date: r.exit_date, exit_time: r.exit_time, ib_synced_at: nowIso })
      .eq("user_id", user_id).eq("ib_exec_id", r.ib_exec_id);
    if (!upErr) refreshed++;
  }

  return res.status(200).json({ ok: true, ingested, refreshed, fetchedAt: nowIso });
}
