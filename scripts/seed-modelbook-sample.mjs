// Seed one SAMPLE Model Book entry (DRAFT — not visible to members until Published).
// Uploads the CELH before/after teaching charts + inserts the row with objective metrics.
// Run AFTER supabase/modelbook.sql has been executed:  node scripts/seed-modelbook-sample.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const URL_ = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const supa = createClient(URL_, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ADMIN_UID = "0e32b092-029a-436d-8cb5-67621e1467b0"; // vc-lv@live.com

const IMGDIR = "/Users/valenchua/Desktop/AI-OS/viv/content/chart-library/images";

async function upload(name) {
  const path = `modelbook/seed/${name}`;
  const { error } = await supa.storage.from("trade-charts").upload(path, readFileSync(`${IMGDIR}/${name}`), { upsert: true, contentType: "image/png" });
  if (error) throw new Error(`upload ${name}: ${error.message}`);
  return supa.storage.from("trade-charts").getPublicUrl(path).data.publicUrl;
}

const before_img = await upload("celh-before.png");
const after_img = await upload("celh-after.png");

const { data, error } = await supa.from("model_book").insert({
  created_by: ADMIN_UID,
  ticker: "CELH",
  pattern: "Trendline Breakout",
  theme: "Growth Stocks",
  before_img, after_img,
  stars: 5, // objective: full checklist below is ticked
  ticked: ["0-0","0-1","0-2","0-3","0-4","1-0","1-1","1-2","2-0","2-1","2-2","2-3","2-4","2-5","2-6","2-7"],
  elite: ["the-leader", "tennis-ball", "regime"],
  characteristics: ["Tight 3-week base", "Volume dry-up into pivot", "Riding rising 10/20MA", "High-RS consumer leader"],
  run_pct: 45, run_up_pct: 60, angle: 40, days_held: 30, r_mult: 9,
  thesis: "SAMPLE ENTRY — the category leader in a fresh consumer-growth theme, tightening for weeks above rising moving averages while volume dried up. Breakout on a clear range-expansion day with a tight stop under the pivot.",
  lesson: "SAMPLE ENTRY — six elite factors stacked at once. When THE leader of a fresh theme goes quiet and tight, the breakout tends to travel. Replace this entry with your own once you've tested the flow.",
  is_published: false,
}).select("id").single();

if (error) throw new Error(error.message);
console.log("Seeded model_book sample:", data.id);
console.log("before:", before_img, "\nafter:", after_img);
