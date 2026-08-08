// 2026-08-08: reply to Estrid's moomoo-integration suggestion. Research-grounded (moomoo/Futu
// OpenAPI = OpenD local gateway + personal-use-only licence; no server-side token API like IBKR
// Flex Query; SnapTrade covers moomoo US/CA only). Post stays OPEN — it's a live idea, not a bug.
// Idempotent: skips if a team comment with the marker already exists.
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prof } = await sb.from("profiles").select("id").eq("email", "vc-lv@live.com").single();
if (!prof) { console.error("ABORT: profile"); process.exit(1); }

const { data: posts } = await sb.from("feedback").select("id,author_name,body,status")
  .ilike("body", "%moomoo%").order("created_at", { ascending: false });
if (!posts?.length) { console.error("ABORT: no moomoo post found"); process.exit(1); }
const post = posts[0];
console.log(`target: [${post.id.slice(0, 8)}] ${post.author_name} · ${post.status}`);

const MARKER = "Good idea — and I looked into it properly";
const BODY = `${MARKER}. Short version: a live moomoo sync isn't possible the way our IBKR sync works, but getting your moomoo trades in IS.

Why the live sync doesn't work: IBKR gives you a token you paste into Settings, and our server fetches your trades — nothing runs on your computer. moomoo's API is built the other way round: it needs their gateway program running and logged in on your own machine, and their developer licence is personal-use only, so an app can't run it for its members.

What we'll do instead: a statement import. You export your trade history from the moomoo desktop app (Trade → Orders → History → export) and upload the file here — same journal, same stats, same calendar. It's on the build list, and it'll cover other brokers too, so nobody's stuck on manual entry.

Keeping this one open until the importer ships. Thanks for raising it — you're not the only one on moomoo.`;

const { data: existing } = await sb.from("feedback_comments").select("id")
  .eq("feedback_id", post.id).eq("is_admin", true).ilike("body", MARKER + "%");
if (existing?.length) { console.log("already replied — nothing to do"); process.exit(0); }

const { error } = await sb.from("feedback_comments").insert({
  feedback_id: post.id, user_id: prof.id, author_name: "Valen", body: BODY, is_admin: true,
});
console.log(error ? "FAILED: " + error.message : "replied to " + post.author_name + " (post left OPEN)");
