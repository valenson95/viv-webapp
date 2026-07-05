// Apply AI chart-grading results (scratchpad modelbook-autograde.json) onto model_book rows.
// Merges ticks/elite (union with existing), stamps metrics._auto (gold dots), stores evidence,
// recomputes the objective stars with the exact webapp formula. Idempotent.
// Usage: node scripts/apply-autograde.mjs <path-to-json>
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.VITE_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Mirror of ModelBook.jsx starsFromTicked — 16 scored items, ★-makers: 0-0,0-2,1-0,1-2,2-2,2-3,2-5
const ALL_KEYS = ["0-0","0-1","0-2","0-3","0-4","1-0","1-1","1-2","2-0","2-1","2-2","2-3","2-4","2-5","2-6","2-7"];
const STARMAKERS = new Set(["0-0","0-2","1-0","1-2","2-2","2-3","2-5"]);
function starsFromTicked(ticked) {
  const t = (ticked || []).filter(k => ALL_KEYS.includes(k));
  const passed = t.length, starHit = t.filter(k => STARMAKERS.has(k)).length;
  let stars = Math.round((passed / ALL_KEYS.length) * 5);
  if (stars >= 5 && starHit < STARMAKERS.size) stars = 4;
  if (passed === 0) stars = 0;
  return stars;
}
function outcomeFrom(r, p) {
  if (r != null) return r >= 5 ? "Huge Winner" : r >= 2 ? "Winner" : r > -0.5 ? "Subpar" : "Loser";
  if (p != null) return p >= 30 ? "Huge Winner" : p >= 10 ? "Winner" : p >= 0 ? "Subpar" : "Loser";
  return null;
}

const results = JSON.parse(readFileSync(process.argv[2], "utf8")).entries || [];
const { data: rows, error } = await sb.from("model_book").select("*");
if (error) throw error;

let n = 0;
for (const e of results) {
  if (e.error) { console.log(`SKIP ${e.ticker}: ${e.error}`); continue; }
  const row = rows.find(r =>
    (e.library_id != null && r.metrics?.library_id != null && String(r.metrics.library_id) === String(e.library_id)) ||
    (e.library_id == null && r.ticker === e.ticker && !r.metrics?.library_id)
  );
  if (!row) { console.log(`NO MATCH ${e.ticker} (library_id ${e.library_id})`); continue; }

  const ticked = [...new Set([...(row.ticked || []), ...(e.ticked || [])])];
  const elite = [...new Set([...(row.elite || []), ...(e.elite || [])])];
  const auto = new Set(row.metrics?._auto || []);
  (e.ticked || []).forEach(k => { if (!(row.ticked || []).includes(k)) auto.add("tick:" + k); });
  (e.elite || []).forEach(k => { if (!(row.elite || []).includes(k)) auto.add("elite:" + k); });

  const body = {
    ticked, elite, stars: starsFromTicked(ticked),
    metrics: {
      ...(row.metrics || {}), _auto: [...auto].sort(),
      grade_evidence: { ...(row.metrics?.grade_evidence || {}), ...(e.evidence || {}) },
      needs_eye: e.needs_eye || row.metrics?.needs_eye || [],
      ...(e.annotations ? { chart_annotations: { ...(row.metrics?.chart_annotations || {}), ...e.annotations } } : {}),
    },
  };
  if (!row.outcome) {
    const o = outcomeFrom(row.r_mult, row.run_pct);
    if (o) { body.outcome = o; body.metrics._auto = [...new Set([...body.metrics._auto, "outcome"])].sort(); }
  }
  const { error: uErr } = await sb.from("model_book").update(body).eq("id", row.id);
  if (uErr) { console.error(row.ticker, uErr.message); continue; }
  n++;
  console.log(`${row.ticker.padEnd(6)} ticks ${(row.ticked || []).length}→${ticked.length} · stars→${body.stars}★ · needs_eye: ${(e.needs_eye || []).join(", ") || "—"}`);
}
console.log(`\nApplied ${n}/${results.length} gradings.`);
