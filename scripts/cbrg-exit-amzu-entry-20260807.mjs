// 2026-08-07: CBRG full exit 8,100 @ 4.3002 blended (8 fills, order 883564608, 09:48 ET —
// MANUAL 4.30 limit ahead of the 4.22 stop; IBKR realized −$2,912.47) + AMZU entry 3,000 @
// 42.9734 blended (order 883564600, 09:47 ET, stop 41.88 GTC working = order 883564603).
// IBKR-verified live pull. Valen-only (email-resolved), idempotent.
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prof, error: pfe } = await sb.from("profiles").select("id").eq("email", "vc-lv@live.com").single();
if (pfe || !prof) { console.error("ABORT: profile", pfe?.message); process.exit(1); }
const uid = prof.id;

// ── 1) Close CBRG: remove the open position row (Valen's only), insert the closed trade ──
const { data: cbrgPos } = await sb.from("positions").select("id,shares,entry_price,stop_price").eq("user_id", uid).eq("symbol", "CBRG").eq("is_closed", false);
if (cbrgPos?.length === 1) {
  await sb.from("positions").delete().eq("id", cbrgPos[0].id);
  console.log("CBRG position row removed (id " + cbrgPos[0].id + ")");
} else {
  console.log("CBRG open rows found: " + (cbrgPos?.length ?? 0) + " — no position delete (already closed?)");
}

const EXEC = "0000eb81.6a75ba5e.01.01"; // idempotency anchor (one of the 8 sell execs)
const { data: dupe } = await sb.from("trades").select("id").eq("user_id", uid).eq("ib_exec_id", EXEC);
if (dupe?.length) {
  console.log("CBRG closed trade already recorded — skipped");
} else {
  const { error } = await sb.from("trades").insert({
    user_id: uid, ticker: "CBRG", trade_type: "Long",
    entry_date: "2026-08-06", entry_time: "10:08", exit_date: "2026-08-07", exit_time: "09:48",
    entry_price: 4.6495, exit_price: 4.3002, shares: 8100,
    stop_price: 4.22, // LOCKED original — drives R
    pl_dollar: -2912.47, pl_pct: -7.51, r_mult: -0.84,
    commission: 47.84, // 5.02 buy-side + 42.82 sell-side
    exit_reason: "Manual exit ahead of stop", setup: "Pullback Buy",
    source: "claude_ibkr", ib_exec_id: EXEC, needs_stop: false, is_deleted: false,
  });
  console.log(error ? "CBRG trade FAILED: " + error.message : "CBRG closed trade recorded: −$2,912.47 / −0.84R");
}

// ── 2) AMZU entry ──
const { data: existing } = await sb.from("positions").select("id").eq("user_id", uid).eq("symbol", "AMZU").eq("is_closed", false);
if (existing?.length) {
  console.log("AMZU row already exists — skipped");
} else {
  const { error } = await sb.from("positions").insert({
    user_id: uid, symbol: "AMZU", shares: 3000,
    entry_price: 42.97, current_price: 43.31,
    entry_date: "2026-08-07", entry_time: "09:47", stop_price: 41.88,
    trade_type: "Long", source: "claude_ibkr", is_closed: false,
    setup: "", tags: ["leveraged-etf", "amazon-2x"],
  });
  console.log(error ? "AMZU FAILED: " + error.message : "SYNCED AMZU");
}
