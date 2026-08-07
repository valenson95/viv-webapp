// 2026-08-07: DELL campaign #2 stop → breakeven 426.57 (his word; original 416.45 stays locked).
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: prof } = await sb.from("profiles").select("id").eq("email", "vc-lv@live.com").single();
if (!prof) { console.error("ABORT: profile"); process.exit(1); }
const { data: pos } = await sb.from("positions").select("id,entry_price,stop_price,trailing_stop").eq("user_id", prof.id).eq("symbol", "DELL").eq("is_closed", false);
if (!pos || pos.length !== 1) { console.error("ABORT: DELL open rows = " + (pos?.length ?? 0)); process.exit(1); }
if (Number(pos[0].trailing_stop) === 426.57) { console.log("DELL trailing_stop already 426.57"); process.exit(0); }
const { error } = await sb.from("positions").update({ trailing_stop: 426.57 }).eq("id", pos[0].id);
console.log(error ? "FAILED: " + error.message : `DELL trailing_stop → 426.57 breakeven (original ${pos[0].stop_price} untouched) → Risk-Free`);
