// OKTA stop → breakeven (his call 2026-08-07 after the +1.32R trim). LAW: stop_price (140.00
// original) NEVER overwritten — trailing_stop carries the trail; trail >= cost = Risk-Free pill.
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: prof } = await sb.from("profiles").select("id").eq("email", "vc-lv@live.com").single();
const { data: pos } = await sb.from("positions").select("id,shares,entry_price,stop_price,trailing_stop").eq("user_id", prof.id).eq("symbol", "OKTA").eq("is_closed", false);
if (!pos || pos.length !== 1) { console.error("ABORT: OKTA rows " + (pos?.length ?? 0)); process.exit(1); }
const { error } = await sb.from("positions").update({ trailing_stop: 143.89 }).eq("id", pos[0].id);
console.log(error ? "FAILED: " + error.message : `OKTA trailing_stop → 143.89 (BE; original stop_price ${pos[0].stop_price} untouched; ${pos[0].shares} sh)`);
