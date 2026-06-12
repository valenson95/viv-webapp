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
  //   { user_id, cutover_date,
  //     fills:     [{ exec_id, trade_id, ticker, trade_type, entry_date, entry_time, exit_date,
  //                   exit_time, entry_price, exit_price, shares, commission, pl_pct, pl_dollar }],
  //     positions: [{ conid, symbol, shares, avg_cost, market_price, trade_type }],   // open holdings
  //     positions_snapshot: true }   // true = this is the COMPLETE open-position set → safe to auto-close
  const { user_id, cutover_date, fills, positions, positions_snapshot } = req.body || {};
  if (!user_id || (!Array.isArray(fills) && !Array.isArray(positions))) {
    return res.status(400).json({ ok: false, error: "Need user_id and fills[] and/or positions[]." });
  }
  const fillsArr = Array.isArray(fills) ? fills : [];

  const sb = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  // CUTOVER GUARD: only fills on/after the cutover date (today). Existing history untouched.
  const eligible = fillsArr.filter(f => f.exec_id && (!cutover_date || (f.exit_date || f.entry_date) >= cutover_date));

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

  // ── FILLS (closed round-trips) ─────────────────────────────────────────────────────────────
  // RULES 1+2+3 — done WITHOUT upsert, on purpose:
  //   • upsert(onConflict) can't target the PARTIAL unique index (where ib_exec_id is not null).
  //   • upsert would also re-write needs_stop/r_mult on re-sync → it would WIPE your locked stop.
  // So: INSERT only new exec_ids; for ones we've seen, refresh ONLY late-settling figures
  // (commission / P&L / exit). We NEVER touch stop_price, current_stop_price, stop_locked_at,
  // needs_stop, r_mult, setup, tags, or notes. The unique index stays as a race backstop.
  let ingested = 0, refreshed = 0;
  if (rows.length) {
    const execIds = rows.map(r => r.ib_exec_id);
    const { data: existing, error: exErr } = await sb
      .from("trades").select("ib_exec_id").eq("user_id", user_id).in("ib_exec_id", execIds);
    if (exErr) return res.status(500).json({ ok: false, error: exErr.message });
    const seen = new Set((existing || []).map(r => r.ib_exec_id));
    const toInsert = rows.filter(r => !seen.has(r.ib_exec_id));
    const toRefresh = rows.filter(r => seen.has(r.ib_exec_id));
    if (toInsert.length) {
      const { data: ins, error: insErr } = await sb.from("trades").insert(toInsert).select("id");
      // 23505 = a concurrent run inserted it first; the index did its job, so tolerate it.
      if (insErr && insErr.code !== "23505") return res.status(500).json({ ok: false, error: insErr.message });
      ingested = ins?.length ?? 0;
    }
    for (const r of toRefresh) {
      const { error: upErr } = await sb.from("trades")
        .update({ commission: r.commission, pl_dollar: r.pl_dollar, pl_pct: r.pl_pct,
                  exit_price: r.exit_price, exit_date: r.exit_date, exit_time: r.exit_time, ib_synced_at: nowIso })
        .eq("user_id", user_id).eq("ib_exec_id", r.ib_exec_id);
      if (!upErr) refreshed++;
    }
  }

  // ── OPEN POSITIONS (current holdings → live exposure / ROTE% / RTS) ─────────────────────────
  // Match by ib_conid; else LINK an existing manual row by symbol (one-time migration, no dupe).
  // Refresh ONLY shares + current_price + the IBKR link — your stop_price, setup, tags, notes,
  // entry_price are sacred and never overwritten. Auto-close (is_closed=true) any IBKR-linked
  // position no longer reported by IBKR — but ONLY on a FULL snapshot, so a transient/partial
  // update can never wrongly close your book.
  let posUpserted = 0, posClosed = 0;
  if (Array.isArray(positions) && positions.length) {
    const { data: openPos, error: opErr } = await sb.from("positions")
      .select("id, symbol, ib_conid").eq("user_id", user_id).eq("is_closed", false);
    if (opErr) return res.status(500).json({ ok: false, error: opErr.message });
    const byConid = new Map(), bySym = new Map();
    (openPos || []).forEach(p => {
      if (p.ib_conid != null) byConid.set(String(p.ib_conid), p);
      if (p.symbol) bySym.set(String(p.symbol).toUpperCase(), p);
    });
    const liveConids = new Set();
    for (const pos of positions) {
      const conid = pos.conid != null ? String(pos.conid) : null;
      const sym = String(pos.symbol || "").toUpperCase();
      if (!conid || !sym || !(Number(pos.shares) > 0)) continue;
      liveConids.add(conid);
      const existing = byConid.get(conid) || (bySym.get(sym) && bySym.get(sym).ib_conid == null ? bySym.get(sym) : null);
      const patch = { shares: pos.shares, ib_conid: conid, source: "ibkr", ib_synced_at: nowIso, is_closed: false };
      if (pos.market_price != null) patch.current_price = pos.market_price;
      if (existing) {
        const { error } = await sb.from("positions").update(patch).eq("id", existing.id);
        if (!error) posUpserted++;
      } else {
        const { error } = await sb.from("positions").insert({
          user_id, symbol: pos.symbol, shares: pos.shares,
          entry_price: pos.avg_cost ?? null, current_price: pos.market_price ?? null,
          entry_date: today, trade_type: pos.trade_type || "Long",
          ib_conid: conid, source: "ibkr", ib_synced_at: nowIso, is_closed: false, setup: "", tags: [],
        });
        if (!error) posUpserted++;
      }
    }
    if (positions_snapshot) {
      for (const p of (openPos || [])) {
        if (p.ib_conid != null && !liveConids.has(String(p.ib_conid))) {
          const { error } = await sb.from("positions").update({ is_closed: true, ib_synced_at: nowIso }).eq("id", p.id);
          if (!error) posClosed++;
        }
      }
    }
  }

  return res.status(200).json({ ok: true, ingested, refreshed, posUpserted, posClosed, fetchedAt: nowIso });
}
