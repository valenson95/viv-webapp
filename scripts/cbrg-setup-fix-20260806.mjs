// CBRG setup classification from Valen's interview: Pullback Buy (was blank at sync).
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: prof } = await sb.from("profiles").select("id").eq("email", "vc-lv@live.com").single();
const { error } = await sb.from("positions").update({ setup: "Pullback Buy" })
  .eq("user_id", prof.id).eq("symbol", "CBRG").eq("is_closed", false);
console.log(error ? "FAILED: " + error.message : "CBRG setup -> Pullback Buy");
