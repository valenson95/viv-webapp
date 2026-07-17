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

// ── Setup-Grader formula mirror (SetupGrader.jsx v2 SECTIONS — keep in LOCKSTEP) ──
// v2 checklist (CHECKLIST_VERSION 2): buckets 0 Prior move / 1 Base quality / 2 Trigger day.
// 14 SCORED keys + 2 BONUS keys (1-5 inside, 1-6 ma_conv) that STORE + display but never score.
// Leadership is a non-scored context strip (not in the manifest) and Trigger & Stop ("3-x") stays
// a live-execution reminder — both are excluded from the scored denominator (14 = Study-Book-aligned).
// V2_SENTINEL is appended to the stored `ticked` so the webapp reads these posts as v2 (never
// re-scores them against v1). Mirrors SetupGrader.js{stampV2, versionOf, scoreTicked}.
const V2_SENTINEL = "__v2";
const SCORED = ["0-0","0-1","0-2","1-0","1-1","1-2","1-3","1-4","1-7","2-0","2-1","2-2","2-3","2-4"];
const BONUS = ["1-5","1-6"];
const ALLOWED = new Set([...SCORED, ...BONUS]); // tickable + storable (bonus kept for display)
const SCORED_SET = new Set(SCORED);
const TOTAL = SCORED.length; // 14
const STAR_KEYS = new Set(["0-0", "0-1", "1-0", "1-3", "1-4", "2-0", "2-2"]); // 7 structure-core ★-makers
const STARMAKERS = STAR_KEYS.size;
const letterFor = (s) => ({ 5: "A+", 4: "A", 3: "B", 2: "C", 1: "C", 0: "—" })[s] || "—";
const stampV2 = (ticked) => [...ticked.filter(k => /^\d+-\d+$/.test(k)), V2_SENTINEL];
function gradeFrom(rawTicked) {
  const kept = [...new Set(rawTicked)].filter(k => ALLOWED.has(k));       // scored + bonus (stored)
  const dropped = [...new Set(rawTicked)].filter(k => !ALLOWED.has(k));   // stray / reminder / unknown
  const scored = kept.filter(k => SCORED_SET.has(k));                     // scored only (grades)
  const passed = scored.length;
  const starHit = scored.filter(k => STAR_KEYS.has(k)).length;
  const pct = passed / TOTAL;
  let stars = Math.round(pct * 5);
  if (stars >= 5 && starHit < STARMAKERS) stars = 4;
  if (passed === 0) stars = 0;
  return { ticked: kept, dropped, passed, starHit, pct, stars, letter: letterFor(stars) };
}

const manifestPath = process.argv[2];
if (!manifestPath) { console.error("Usage: node scripts/publish-daily-setup.mjs <manifest.json>"); process.exit(1); }
const entries = JSON.parse(readFileSync(manifestPath, "utf8"));
const todayMYT = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

for (const e of entries) {
  const ticker = String(e.ticker || "").toUpperCase().trim();
  if (!ticker || !Array.isArray(e.ticked)) { console.error(`SKIP bad entry: ${JSON.stringify(e).slice(0, 80)}`); continue; }
  const date = e.trade_date || todayMYT;
  const g = gradeFrom(e.ticked); // g.ticked = whitelisted (scored+bonus) + deduped — use IT below
  const storedTicked = stampV2(g.ticked); // append the v2 marker so the webapp reads it as v2
  const auto = [...new Set(e.auto || e.ticked)].filter(k => ALLOWED.has(k));
  if (g.dropped.length) console.warn(`${ticker}: dropped non-scored/unknown keys from manifest: ${g.dropped.join(", ")}`);

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
      ticked: storedTicked, auto, note: e.note || null, chart_img: chartUrl, is_published: true,
      // Breakout | Pullback — from the Daily Trade Ideas subfolder (needs the setup_type ALTER run)
      ...(e.setup_type ? { setup_type: e.setup_type } : {}),
    }]),
  });

  // 3) mirror into the grader (gold dots included) so opening the ticker matches the post
  const gr = await fetch(`${URL_}/rest/v1/setup_grades?on_conflict=user_id,symbol`, {
    method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{
      user_id: UID, symbol: ticker, stars: g.stars, letter: g.letter, pct: g.pct,
      star_hit: g.starHit, starmakers: STARMAKERS, ticked: storedTicked, auto,
      updated_at: new Date().toISOString(),
    }]),
  });

  console.log(`${ticker} ${date}: ${g.stars}★ ${g.letter} (${g.passed}/${TOTAL} · ${g.starHit}/${STARMAKERS}) — post ${ins.ok ? "PUBLISHED ✓" : "FAILED: " + await ins.text()} · grade ${gr.ok ? "synced ✓" : "FAILED"}${chartUrl ? " · chart ✓" : ""}`);
}
