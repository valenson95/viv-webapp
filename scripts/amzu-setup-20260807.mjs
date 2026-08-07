// Set AMZU setup per entry interview (Pullback Buy, full campaign). Valen-only.
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: prof } = await sb.from("profiles").select("id").eq("email", "vc-lv@live.com").single();
const { error, count } = await sb.from("positions").update({ setup: "Pullback Buy" }, { count: "exact" })
  .eq("user_id", prof.id).eq("symbol", "AMZU").eq("is_closed", false);
console.log(error ? "FAILED: " + error.message : "AMZU setup → Pullback Buy (" + count + " row)");
