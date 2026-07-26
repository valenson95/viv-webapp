// One-off: post Valen's reply to jh's "breadth command center on mobile" feedback + mark resolved.
// Safety: must match exactly ONE open feedback row before writing anything.
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ADMIN_EMAIL = "vc-lv@live.com";

const REPLY =
  "Hey JH! Good catch — it wasn't actually broken, the market lenses were only showing in Pro view " +
  "and your phone was defaulting to the Guided view. Fixed it properly: Rotation, Breadth and the " +
  "Earnings radar now show on every dashboard including mobile. Hard-refresh and they'll be there. " +
  "Keep the reports coming 🤝";

const { data: admin, error: aErr } = await sb.from("profiles").select("id,display_name").eq("email", ADMIN_EMAIL).single();
if (aErr || !admin) { console.error("admin lookup failed:", aErr?.message); process.exit(1); }

const { data: rows, error: fErr } = await sb.from("feedback").select("id,user_id,body,status,created_at")
  .neq("status", "resolved").ilike("body", "%breadth%");
if (fErr) { console.error("feedback lookup failed:", fErr.message); process.exit(1); }
console.log("candidates:", JSON.stringify(rows, null, 1));
if (!rows || rows.length !== 1) { console.error(`expected exactly 1 open breadth feedback, got ${rows?.length ?? 0} — NOT writing.`); process.exit(1); }

const fb = rows[0];
const { error: cErr } = await sb.from("feedback_comments").insert({
  feedback_id: fb.id, user_id: admin.id, author_name: "Valen", body: REPLY, is_admin: true,
});
if (cErr) { console.error("comment insert failed:", cErr.message); process.exit(1); }
console.log("✓ reply posted on feedback", fb.id);

const { error: rErr } = await sb.from("feedback").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", fb.id);
if (rErr) { console.error("resolve failed:", rErr.message); process.exit(1); }
console.log("✓ marked resolved");
