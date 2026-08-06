// DELL entry 2026-08-06: BUY 270 @ 445.78 (13:49:57Z), IBKR stop STP 427.23 GTC verified (order 1023112656).
// Valen-only (email-resolved), idempotent on existing open DELL row for him.
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prof, error: pfe } = await sb.from("profiles").select("id").eq("email", "vc-lv@live.com").single();
if (pfe || !prof) { console.error("ABORT: profile", pfe?.message); process.exit(1); }

const { data: existing } = await sb.from("positions").select("id,shares").eq("user_id", prof.id).eq("symbol", "DELL").eq("is_closed", false);
if (existing && existing.length) { console.log("DELL row already exists for Valen:", existing); process.exit(0); }

const { error } = await sb.from("positions").insert({
  user_id: prof.id, symbol: "DELL", shares: 270,
  entry_price: 445.78, current_price: 445.78,
  entry_date: "2026-08-06", entry_time: "09:49",
  stop_price: 427.23,                    // original — LOCKED (IBKR STP GTC verified)
  trade_type: "Long", source: "claude_ibkr", is_closed: false,
  setup: "Undercut & Rally", tags: ["pullback", "vwap-reclaim"],
});
if (error) { console.error("insert failed:", error.message); process.exit(1); }
console.log("SYNCED: DELL 270 @ 445.78, stop 427.23 (original, locked)");
