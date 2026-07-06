// Seed the AGL example into the Daily Setups feed + mark the grade's auto (gold-dot) ticks.
// Run AFTER supabase/daily-setups.sql:  node --env-file=.env.local scripts/seed-agl-daily.mjs
// Idempotent — deletes any prior AGL row for this date before inserting.

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local)"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const UID = "0e32b092-029a-436d-8cb5-67621e1467b0"; // vc-lv@live.com
const DATE = "2026-07-06";
const CHART = `${URL}/storage/v1/object/public/trade-charts/daily-setups/${UID}/AGL-2026-07-06.png`;
const TICKED = ["0-0","0-2","0-4","1-0","1-1","1-2","2-0","2-1","2-2","2-3","2-4","2-7"];

// 1) gold-dot the grade (auto column exists after daily-setups.sql)
let r = await fetch(`${URL}/rest/v1/setup_grades?user_id=eq.${UID}&symbol=eq.AGL`, {
  method: "PATCH", headers: H, body: JSON.stringify({ auto: TICKED }),
});
console.log("setup_grades.auto:", r.status, r.ok ? "OK" : await r.text());

// 2) publish the daily setup
await fetch(`${URL}/rest/v1/daily_setups?created_by=eq.${UID}&ticker=eq.AGL&trade_date=eq.${DATE}`, { method: "DELETE", headers: H });
r = await fetch(`${URL}/rest/v1/daily_setups`, {
  method: "POST", headers: { ...H, Prefer: "return=representation" },
  body: JSON.stringify([{
    created_by: UID, ticker: "AGL", trade_date: DATE, sector: "HealthCare",
    stars: 4, letter: "A", pct: 0.75, star_hit: 6, starmakers: 7,
    ticked: TICKED, auto: TICKED,
    note: "Healthcare leader (DeepVue RS 96) coiling under the 120 pivot after the +48%-in-12-days thrust — higher lows, volume dried up −56% vs average. Watching for the range-expansion break on volume; the 127 shakeout wick is the flaw to respect.",
    chart_img: CHART, is_published: true,
  }]),
});
console.log("daily_setups insert:", r.status, r.ok ? "PUBLISHED ✓" : await r.text());
