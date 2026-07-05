// Backfill metrics._auto (the gold-dot "VIV filled this" markers) onto script-inserted
// model_book rows: the CELH sample, the 14 chart-library imports, and AAOI 2015.
// Idempotent — safe to re-run.
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const sb = createClient(env.VITE_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const FIELDS = ["ticker", "pattern", "theme", "entry_date", "exit_date", "run_pct", "run_up_pct", "angle", "days_held", "r_mult", "outcome"];

const { data: rows, error } = await sb.from("model_book").select("*");
if (error) throw error;

let n = 0;
for (const r of rows) {
  const m = r.metrics || {};
  const isImport = !!m.library_id;
  const isAAOI = r.ticker === "AAOI";
  const isCELH = r.ticker === "CELH";
  if (!isImport && !isAAOI && !isCELH) continue; // human-created rows: never stamp

  const auto = new Set(FIELDS.filter(k => r[k] != null && r[k] !== ""));
  if (isAAOI || isCELH) { // AI-composed prose + characteristics on these two
    if ((r.characteristics || []).length) auto.add("characteristics");
    if (r.thesis) auto.add("thesis");
    if (r.lesson) auto.add("lesson");
  }
  if (isCELH) { // the demo sample: ticks + elite were AI-filled too
    (r.ticked || []).forEach(k => auto.add("tick:" + k));
    (r.elite || []).forEach(k => auto.add("elite:" + k));
  }
  const { error: uErr } = await sb.from("model_book")
    .update({ metrics: { ...m, _auto: [...auto].sort() } }).eq("id", r.id);
  if (uErr) { console.error(r.ticker, uErr.message); continue; }
  n++;
  console.log(`${r.ticker.padEnd(6)} → ${auto.size} auto-marked fields`);
}
console.log(`\nDone — ${n} rows stamped.`);
