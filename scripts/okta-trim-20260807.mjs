// 2026-08-07: OKTA partial profit — SELL 170 @ 149.03 (09:51 ET, order 883564611,
// IBKR realized +$873.09). Campaign continues with 684 sh; original stop 140.00 stays LOCKED
// (working IBKR stop was cancelled during management — he is re-placing; flagged in chat).
// Valen-only, idempotent on ib_exec_id.
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prof } = await sb.from("profiles").select("id").eq("email", "vc-lv@live.com").single();
if (!prof) { console.error("ABORT: profile"); process.exit(1); }
const uid = prof.id;

const { data: pos } = await sb.from("positions").select("id,shares,entry_price,stop_price").eq("user_id", uid).eq("symbol", "OKTA").eq("is_closed", false);
if (!pos || pos.length !== 1) { console.error("ABORT: OKTA open rows = " + (pos?.length ?? 0)); process.exit(1); }
if (pos[0].shares !== 854) { console.log("OKTA shares already " + pos[0].shares + " — trim likely synced, skipping share update"); }

const EXEC = "0001390d.6a763b02.01.01";
const { data: dupe } = await sb.from("trades").select("id").eq("user_id", uid).eq("ib_exec_id", EXEC);
if (dupe?.length) { console.log("OKTA trim already recorded — done"); process.exit(0); }

// r_mult on the trimmed portion: risk basis = (143.885 − 140.00) × 170 = $660.45 → +873.09/660.45 = +1.32R
const { error: te } = await sb.from("trades").insert({
  user_id: uid, ticker: "OKTA", trade_type: "Long",
  entry_date: "2026-08-06", entry_time: "10:19", exit_date: "2026-08-07", exit_time: "09:51",
  entry_price: 143.885, exit_price: 149.03, shares: 170,
  stop_price: 140.00, pl_dollar: 873.09, pl_pct: 3.58, r_mult: 1.32,
  commission: 1.56, exit_reason: "Partial profit (trim)", setup: "Pullback Buy",
  source: "claude_ibkr", ib_exec_id: EXEC, position_id: pos[0].id, needs_stop: false, is_deleted: false,
});
console.log(te ? "trim insert FAILED: " + te.message : "OKTA trim recorded: +$873.09 / +1.32R (170 sh)");

if (pos[0].shares === 854) {
  const { error: pe } = await sb.from("positions").update({ shares: 684 }).eq("id", pos[0].id);
  console.log(pe ? "share update FAILED: " + pe.message : "OKTA position 854 → 684 sh");
}
