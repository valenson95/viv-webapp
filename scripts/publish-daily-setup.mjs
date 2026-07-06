// Publish daily setups from a manifest — the engine behind "pull my daily ideas".
// Valen drops chart screenshots into ~/Desktop/Daily Trade Ideas/<pattern>/, Claude reads each
// chart, auto-ticks the Setup-Grader criteria, writes a manifest, then runs:
//   node --env-file=.env.local scripts/publish-daily-setup.mjs <manifest.json>
//
// Manifest: [{ ticker, chart (abs path, optional), ticked: ["si-ii"...], auto (default = ticked),
//              note, sector (sectors.js/DeepVue name), trade_date (default today MYT) }]
// Per entry: uploads the chart → replaces any same ticker+date post → inserts PUBLISHED row →
// upserts the grade (with gold-dot auto keys) into setup_grades so the grader matches the post.
// Idempotent — rerunning a manifest overwrites the same posts, never duplicates.

import { readFileSync } from "node:fs";
import { basename } from "node:path";

const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local)"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const UID = "0e32b092-029a-436d-8cb5-67621e1467b0"; // vc-lv@live.com (admin — this feed is his)

// ── Setup-Grader formula mirror (SetupGrader.jsx SECTIONS — keep in lockstep) ──
const TOTAL = 16;
const STAR_KEYS = new Set(["0-0", "0-2", "1-0", "1-2", "2-2", "2-3", "2-5"]);
const STARMAKERS = STAR_KEYS.size;
const letterFor = (s) => ({ 5: "A+", 4: "A", 3: "B", 2: "C", 1: "C", 0: "—" })[s] || "—";
function gradeFrom(ticked) {
  const passed = ticked.length;
  const starHit = ticked.filter(k => STAR_KEYS.has(k)).length;
  const pct = passed / TOTAL;
  let stars = Math.round(pct * 5);
  if (stars >= 5 && starHit < STARMAKERS) stars = 4;
  if (passed === 0) stars = 0;
  return { passed, starHit, pct, stars, letter: letterFor(stars) };
}

const manifestPath = process.argv[2];
if (!manifestPath) { console.error("Usage: node scripts/publish-daily-setup.mjs <manifest.json>"); process.exit(1); }
const entries = JSON.parse(readFileSync(manifestPath, "utf8"));
const todayMYT = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

for (const e of entries) {
  const ticker = String(e.ticker || "").toUpperCase().trim();
  if (!ticker || !Array.isArray(e.ticked)) { console.error(`SKIP bad entry: ${JSON.stringify(e).slice(0, 80)}`); continue; }
  const date = e.trade_date || todayMYT;
  const auto = e.auto || e.ticked;
  const g = gradeFrom(e.ticked);

  // 1) chart → storage
  let chartUrl = null;
  if (e.chart) {
    const name = `${ticker}-${date}-${basename(e.chart).replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const path = `daily-setups/${UID}/${name}`;
    const buf = readFileSync(e.chart);
    const up = await fetch(`${URL_}/storage/v1/object/trade-charts/${path}`, {
      method: "POST", headers: { ...H, "Content-Type": "image/png", "x-upsert": "true" }, body: buf,
    });
    if (!up.ok) { console.error(`${ticker}: chart upload failed — ${await up.text()}`); }
    else chartUrl = `${URL_}/storage/v1/object/public/trade-charts/${path}`;
  }

  // 2) replace any existing post for this ticker+date, insert published
  await fetch(`${URL_}/rest/v1/daily_setups?created_by=eq.${UID}&ticker=eq.${ticker}&trade_date=eq.${date}`, { method: "DELETE", headers: H });
  const ins = await fetch(`${URL_}/rest/v1/daily_setups`, {
    method: "POST", headers: H,
    body: JSON.stringify([{
      created_by: UID, ticker, trade_date: date, sector: e.sector || null,
      stars: g.stars, letter: g.letter, pct: g.pct, star_hit: g.starHit, starmakers: STARMAKERS,
      ticked: e.ticked, auto, note: e.note || null, chart_img: chartUrl, is_published: true,
      // Breakout | Pullback — from the Daily Trade Ideas subfolder (needs the setup_type ALTER run)
      ...(e.setup_type ? { setup_type: e.setup_type } : {}),
    }]),
  });

  // 3) mirror into the grader (gold dots included) so opening the ticker matches the post
  const gr = await fetch(`${URL_}/rest/v1/setup_grades?on_conflict=user_id,symbol`, {
    method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{
      user_id: UID, symbol: ticker, stars: g.stars, letter: g.letter, pct: g.pct,
      star_hit: g.starHit, starmakers: STARMAKERS, ticked: e.ticked, auto,
      updated_at: new Date().toISOString(),
    }]),
  });

  console.log(`${ticker} ${date}: ${g.stars}★ ${g.letter} (${g.passed}/16 · ${g.starHit}/7) — post ${ins.ok ? "PUBLISHED ✓" : "FAILED: " + await ins.text()} · grade ${gr.ok ? "synced ✓" : "FAILED"}${chartUrl ? " · chart ✓" : ""}`);
}
