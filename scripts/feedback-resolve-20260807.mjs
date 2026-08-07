// 2026-08-07: Valen's go — reply (as VIV team) + resolve the 3 open feedback posts:
// JH edit-trade bug (fixed 7efaffd) · JH multi-fill calendar (fixed 543c997) · Mandy push request (live 543c997).
// Also: PLTU trailing_stop → 45.13 breakeven (his answer; original 43.33 stays locked).
// Idempotent: skips a post if a team comment containing its marker already exists.
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prof } = await sb.from("profiles").select("id").eq("email", "vc-lv@live.com").single();
if (!prof) { console.error("ABORT: profile"); process.exit(1); }
const uid = prof.id;

// ── 1. PLTU trail → breakeven ──
{
  const { data: pos } = await sb.from("positions").select("id,entry_price,stop_price,trailing_stop").eq("user_id", uid).eq("symbol", "PLTU").eq("is_closed", false);
  if (!pos || pos.length !== 1) console.error("PLTU: open rows = " + (pos?.length ?? 0) + " — skipped");
  else if (Number(pos[0].trailing_stop) === 45.13) console.log("PLTU trailing_stop already 45.13");
  else {
    const { error } = await sb.from("positions").update({ trailing_stop: 45.13 }).eq("id", pos[0].id);
    console.log(error ? "PLTU trail FAILED: " + error.message : `PLTU trailing_stop → 45.13 breakeven (original ${pos[0].stop_price} untouched) → Risk-Free`);
  }
}

// ── 2. Feedback replies + resolve ──
const { data: posts } = await sb.from("feedback").select("id,author_name,body,status,created_at").eq("status", "open").order("created_at", { ascending: false });
console.log("\nOpen posts: " + (posts?.length ?? 0));
for (const p of posts || []) console.log(`  [${p.id.slice(0, 8)}] ${p.author_name}: ${p.body.slice(0, 90).replace(/\n/g, " ")}`);

const REPLIES = [
  {
    match: (p) => /edit trade|not responsive/i.test(p.body),
    marker: "Fixed and live",
    body: "Fixed and live. The edit window was opening behind the trade review page, so the button looked dead — it now opens on top where it belongs. Hard-refresh once (Cmd/Ctrl+Shift+R) and you're set. Thanks for the quick report — this one helped everyone.",
  },
  {
    match: (p) => /fills|calendar/i.test(p.body),
    marker: "Both done",
    body: "Both done. Multi-fill trades now show up in the performance calendar as their own trade — the second same-day campaign was being folded into the first, so it never appeared. And the fills tag is now clickable everywhere: it opens a breakdown of every execution with its own dates, prices, P/L and an Edit button per fill. Great catch, this one ran deep.",
  },
  {
    match: (p) => /notif|push|alert/i.test(p.body),
    marker: "Live in beta",
    body: "Live in beta — go to Settings → Notifications and switch it on. Your browser will ask permission once, then you'll get a ping for live trade updates and new drops. On iPhone, add the app to your Home Screen first (Share → Add to Home Screen), then enable it from there — Apple only allows notifications for installed web apps. Thanks for the request!",
  },
];

for (const p of posts || []) {
  const r = REPLIES.find((x) => x.match(p));
  if (!r) { console.log(`  no matching reply for [${p.id.slice(0, 8)}] — left open`); continue; }
  const { data: existing } = await sb.from("feedback_comments").select("id").eq("feedback_id", p.id).eq("is_admin", true).ilike("body", r.marker + "%");
  if (existing?.length) console.log(`  [${p.id.slice(0, 8)}] already replied`);
  else {
    const { error: ce } = await sb.from("feedback_comments").insert({ feedback_id: p.id, user_id: uid, author_name: "Valen", body: r.body, is_admin: true });
    if (ce) { console.error(`  [${p.id.slice(0, 8)}] comment FAILED: ` + ce.message); continue; }
    console.log(`  [${p.id.slice(0, 8)}] replied ✓`);
  }
  const { error: re } = await sb.from("feedback").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", p.id);
  console.log(re ? `  [${p.id.slice(0, 8)}] resolve FAILED: ` + re.message : `  [${p.id.slice(0, 8)}] marked RESOLVED`);
}

// Post-state
const { data: after } = await sb.from("feedback").select("id,author_name,status").order("created_at", { ascending: false }).limit(6);
console.log("\nPost-state (latest 6):");
for (const p of after || []) console.log(`  ${p.author_name}: ${p.status}`);
