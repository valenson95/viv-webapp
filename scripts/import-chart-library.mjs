// Import Valen's breakout STUDY REFERENCES (chart-library "Best Breakout Setups") into the Model Book.
// - Uploads each before/after pair to storage, inserts as DRAFTS (Valen reviews/grades/publishes).
// - Grader ticks left EMPTY on purpose: ticking each chart is the study exercise (objective stars).
// - Idempotent: skips entries whose library id was already imported (tracked in metrics.library_id).
// Run: node scripts/import-chart-library.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const supa = createClient(env.SUPABASE_URL || env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ADMIN_UID = "0e32b092-029a-436d-8cb5-67621e1467b0";
const LIB = "/Users/valenchua/Desktop/AI-OS/viv/content/chart-library";

// charts-data.js assigns window.CHART_DB — evaluate with a window shim
const src = readFileSync(`${LIB}/charts-data.js`, "utf8");
const window = {};
eval(src);
const DB = window.CHART_DB || [];

const patternFor = (e) => {
  const t = (e.tags || []).join(" ").toLowerCase();
  if (t.includes("vcp")) return "VCP";
  if (t.includes("ep") || t.includes("gap")) return "Episodic Pivot";
  if (t.includes("pullback") || t.includes("retest")) return "Pullback Buy";
  return "Trendline Breakout";
};
const pctFrom = (e) => {
  const m = String(e.result || "").match(/\+?(\d{2,4})\s*%|(\d{2,4})pct/);
  return m ? +(m[1] || m[2]) : null;
};
const cleanTag = (t) => ({ "volume-dryup": "Volume dry-up", "holds-MA": "Holds rising MAs", "high-RS": "High RS",
  "inside-bar": "Inside bar", "flag": "Flag base", "monster": "Monster move", "stairs": "Stair-step bases",
  "MA50": "Holds MA50", "respect-SL": "Respect the stop", "management": "Trade management",
}[t] || t.replace(/-/g, " "));

const { data: existing } = await supa.from("model_book").select("metrics");
const done = new Set((existing || []).map(r => r.metrics && r.metrics.library_id).filter(Boolean));

let added = 0, skipped = 0;
for (const e of DB) {
  if (e.category !== "Best Breakout Setups") continue;
  if (!e.before || !e.after) { skipped++; continue; }
  if (done.has(e.id)) { skipped++; continue; }
  const bPath = `${LIB}/${e.before}`, aPath = `${LIB}/${e.after}`;
  if (!existsSync(bPath) || !existsSync(aPath)) { console.log(`missing images for ${e.id}, skipped`); skipped++; continue; }

  const up = async (local, name) => {
    const path = `modelbook/library/${e.id}-${name}.png`;
    const { error } = await supa.storage.from("trade-charts").upload(path, readFileSync(local), { upsert: true, contentType: "image/png" });
    if (error) throw new Error(`${e.id} ${name}: ${error.message}`);
    return supa.storage.from("trade-charts").getPublicUrl(path).data.publicUrl;
  };
  const before_img = await up(bPath, "before");
  const after_img = await up(aPath, "after");

  const { error } = await supa.from("model_book").insert({
    created_by: ADMIN_UID,
    ticker: e.ticker, pattern: patternFor(e), theme: e.sector || null,
    before_img, after_img,
    stars: 0, ticked: [], elite: [],                       // ungraded — grading each chart IS the study exercise
    outcome: "Huge Winner",                                 // study references are all big winners by selection
    run_pct: pctFrom(e),
    characteristics: (e.tags || []).filter(t => !["my-trade", "2026", "identify"].includes(t)).slice(0, 6).map(cleanTag),
    thesis: e.notes || null,
    lesson: e.result || null,
    metrics: { library_id: e.id, imported_from: "chart-library", import_date: "2026-07-05" },
    is_published: false,
  });
  if (error) throw new Error(`${e.id}: ${error.message}`);
  console.log(`✓ ${e.ticker} (${e.id}) → ${patternFor(e)}`);
  added++;
}
console.log(`\nDone: ${added} imported, ${skipped} skipped (winners-only/no-pair/already-imported).`);
