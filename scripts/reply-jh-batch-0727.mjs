// One-off: reply (as Valen) + resolve jh's three 2026-07-27 feedback items.
// Safety: each matcher must hit exactly ONE open row or that item is skipped with a loud log.
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ADMIN_EMAIL = "vc-lv@live.com";

const REPLIES = [
  {
    match: "%INSW%",
    body: "Hey JH! Checked this one properly — INSW is actually labelled correctly. It's a tanker company, and the classification standard (GICS, which DeepVue follows) puts tanker names under Energy (Oil & Gas Storage & Transportation). Container and dry-bulk shippers like MATX sit under Industrials/Marine instead — so the shipping names genuinely split across two sectors. Confusing, but correct 🤝",
  },
  {
    match: "%economic calendar%",
    body: "Love this one — first piece shipped today: the earnings radar now flags FOMC decisions and CPI prints with a ⚡ gold marker (exact time + whether a dot plot is due). Kept it inside the radar instead of adding another card so the dashboard stays clean. Rate odds (CME) are on the list next 🤝",
  },
  {
    match: "%# ranking%",
    body: "Done! The rotation tables now have a # column on the left so you can see each group's exact position in the ranking. Hard-refresh and it's there 🤝",
  },
];

const { data: admin, error: aErr } = await sb.from("profiles").select("id").eq("email", ADMIN_EMAIL).single();
if (aErr || !admin) { console.error("admin lookup failed:", aErr?.message); process.exit(1); }

for (const r of REPLIES) {
  const { data: rows, error } = await sb.from("feedback").select("id,body,status").neq("status", "resolved").ilike("body", r.match);
  if (error) { console.error(r.match, "lookup failed:", error.message); continue; }
  if (!rows || rows.length !== 1) { console.error(`SKIP ${r.match}: expected exactly 1 open row, got ${rows?.length ?? 0}`); continue; }
  const fb = rows[0];
  const { error: cErr } = await sb.from("feedback_comments").insert({ feedback_id: fb.id, user_id: admin.id, author_name: "Valen", body: r.body, is_admin: true });
  if (cErr) { console.error(fb.id, "comment failed:", cErr.message); continue; }
  const { error: rErr } = await sb.from("feedback").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", fb.id);
  console.log(`✓ replied${rErr ? " (resolve FAILED: " + rErr.message + ")" : " + resolved"}: "${fb.body.slice(0, 60)}…"`);
}
