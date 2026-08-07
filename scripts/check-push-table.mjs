// Read-only: confirm push_subscriptions exists + count device rows.
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error, count } = await sb.from("push_subscriptions").select("id,user_id,created_at", { count: "exact" });
if (error) { console.error("TABLE CHECK FAILED: " + error.message); process.exit(1); }
console.log(`push_subscriptions EXISTS — ${count} device row(s)`);
for (const r of data || []) console.log(`  user ${r.user_id.slice(0, 8)}… since ${r.created_at}`);
