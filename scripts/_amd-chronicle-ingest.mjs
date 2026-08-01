// AMD Chronicle ingest (2026-07-31, Valen-authorized build while he's out).
// Input: EPISODES (filled from the chart-reader agent) + anatomy JSON (scratchpad).
// Creates model_book study rows under project "AMD Chronicle" with is_published:FALSE (drafts —
// member-invisible via RLS; his click-to-publish button is the only launch switch).
// Charts upload to trade-charts/modelbook/amd-chronicle/. Idempotent on (ticker, entry_date).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SRC = "/Users/valenchua/Desktop/Model Book (Study)/AMD/";
const SCRATCH = process.env.SCRATCH;
const EPISODES = JSON.parse(readFileSync(`${SCRATCH}/amd-episodes.json`, "utf8"));
const ANATOMY = JSON.parse(readFileSync(`${SCRATCH}/amd-anatomy.json`, "utf8"));

const { data: prof } = await sb.from("profiles").select("id,email").eq("email", "vc-lv@live.com") // ADMIN account — NEVER ilike %valen% (valensonforex@gmail.com is a different account);
const uid = prof?.[0]?.id;
if (!uid) throw new Error("admin uid not found");
console.log("owner:", prof[0].email);

async function up(file, dest) {
  const buf = readFileSync(SRC + file);
  const { error } = await sb.storage.from("trade-charts").upload(dest, buf, { contentType: "image/png", upsert: true });
  if (error) throw error;
  return sb.storage.from("trade-charts").getPublicUrl(dest).data.publicUrl;
}

for (const ep of EPISODES) {
  const a = ANATOMY[ep.anatomy_key] || {};
  const slug = ep.trigger_date;
  const imgs = {};
  for (const [slot, file] of Object.entries(ep.files)) {
    if (file) imgs[slot] = await up(file, `modelbook/amd-chronicle/${slug}-${slot}.png`);
  }
  const study = {
    setup: ep.setup, direction: ep.direction || "long", project: "AMD Chronicle",
    era: ep.era, annotation: ep.annotation, his_annotations: ep.his_annotations,
    m: a, outcome_img: imgs.after2 || null, checks: {},
  };
  const row = {
    ticker: "AMD", entry_date: ep.trigger_date, pattern: ep.setup,
    thesis: ep.thesis, lesson: ep.lesson || null,
    before_img: imgs.before || null, after_img: imgs.after || null,
    is_published: false, created_by: uid, metrics: { study },
  };
  const { data: exist } = await sb.from("model_book").select("id").eq("ticker", "AMD").eq("entry_date", ep.trigger_date).eq("created_by", uid);
  const stRow = exist?.find(Boolean);
  if (stRow) {
    const { error } = await sb.from("model_book").update(row).eq("id", stRow.id);
    if (error) throw error; console.log("updated", slug);
  } else {
    const { error } = await sb.from("model_book").insert(row);
    if (error) throw error; console.log("inserted", slug);
  }
}
console.log("done — all rows DRAFT (is_published=false)");
