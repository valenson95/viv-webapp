// Model Book ingest — AAOI 2015 flat-top breakout (historical study, from ~/Desktop/Model Book (Study)/AAOI).
// All values below were READ off Valen's DeepVue annotations (info-line, position tool, RS grid).
// Grader ticks intentionally EMPTY — Valen fills the grade check himself. Run: node scripts/ingest-aaoi-2015.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const supa = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ADMIN_UID = "0e32b092-029a-436d-8cb5-67621e1467b0";
const DIR = "/Users/valenchua/Desktop/Model Book (Study)/AAOI";

const up = async (file, name) => {
  const path = `modelbook/aaoi-2015/${name}.png`;
  const { error } = await supa.storage.from("trade-charts").upload(path, readFileSync(`${DIR}/${file}`), { upsert: true, contentType: "image/png" });
  if (error) throw new Error(error.message);
  return supa.storage.from("trade-charts").getPublicUrl(path).data.publicUrl;
};
const before_img = await up("AAOI-chart (1).png", "before");
const after_img = await up("AAOI-chart (3).png", "after");

const { data, error } = await supa.from("model_book").insert({
  created_by: ADMIN_UID,
  ticker: "AAOI",
  pattern: "Trendline Breakout",
  theme: "Communications Equipment",           // DeepVue sector label, verbatim
  entry_date: "2015-05-20",                     // position-tool marker
  exit_date: "2015-07-18",                      // position-tool window end
  before_img, after_img,
  stars: 0, ticked: [], elite: [],              // PENDING — Valen fills the grade check
  outcome: "Huge Winner",
  run_pct: 29.9,                                // measured target hit: +29.89%
  run_up_pct: 90.4,                             // the pole: +90.42% into the base
  angle: 30.66,                                 // pole slope from the info-line
  days_held: 59,                                // May 20 → Jul 18 window
  r_mult: 13.3,                                 // position-tool Risk/Reward 13.33 (2.24% stop vs 29.89% target)
  characteristics: [
    "RS 95 (12M) at breakout",
    "RMV 23.5 — tight",
    "Breakout volume +144% vs avg",
    "Flat 15.16 pivot + descending trendline break",
    "Pole +90% in 103d @ 30.7°",
    "Cleared the falling 200-day",
  ],
  metrics: {
    source: "study", year: 2015,
    rs: { m1: 7, m3: 22, m6: 90, m9: 94, m12: 95 },
    rmv_at_pivot: 23.5, rmv_at_top: 51.08,
    breakout_vol_chg_pct: 144, breakout_day_chg_pct: 4.34,
    atr_mult_from_ma_entry: 1.04, gain_from_ma_pct_entry: 4.38,
    pole_pct: 90.42, pole_days: 103, pole_angle_deg: 30.66,
    pivot: 15.16, entry_price: 14.88, stop_price: 14.55,
    planned_stop_pct: 2.24, planned_target_pct: 29.89, planned_rr: 13.33,
  },
  thesis: "≈90% pole in ~3.5 months (30.7° — steady, not climactic), then a multi-week contraction under a flat 15.16 pivot: higher lows into a descending trendline, RMV compressed to 23.5, volume drying up, price surfing rising short MAs after reclaiming the falling 200-day, RS 95. Breakout day: +4.3% close through the pivot on +144% volume.",
  lesson: "The tight 2.24% stop against a measured ~30% target gave 13.3R geometry — the whole trade is the ENTRY structure. It paid +29.9% in ~4 weeks, stalled in the 19.3–20 target zone, then broke the short MAs (−6.6% bar) — the exit signal. Take the tight entry, respect the measured move, leave when the rails break.",
  is_published: false,
}).select("id").single();
if (error) throw new Error(error.message);
console.log("AAOI 2015 study ingested:", data.id);
