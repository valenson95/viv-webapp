// Fix: okta-trim script's numeric guard failed (shares stored as string "854") — reduce to 684
// to match IBKR after the 170-sh trim. Guarded to only act on the exact stale value.
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: prof } = await sb.from("profiles").select("id").eq("email", "vc-lv@live.com").single();
const { data: pos } = await sb.from("positions").select("id,shares").eq("user_id", prof.id).eq("symbol", "OKTA").eq("is_closed", false).single();
if (Number(pos.shares) === 684) { console.log("already 684 — nothing to do"); process.exit(0); }
if (Number(pos.shares) !== 854) { console.error("ABORT: unexpected shares " + pos.shares); process.exit(1); }
const { error } = await sb.from("positions").update({ shares: 684 }).eq("id", pos.id);
console.log(error ? "FAILED: " + error.message : "OKTA position 854 → 684 sh ✓");
