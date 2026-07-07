// Push computed extension multiples into trades.ext_entry / ext_exit.
// Usage: node --env-file=.env.local scripts/backfill-extension.mjs <results.json>
// results.json = [{ id, ext_exit, ext_entry }] (extra fields ignored). Idempotent PATCH per row.
// Requires supabase/extension-metric.sql to have been run once (columns must exist).
import { readFileSync } from "node:fs";

const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local)"); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" };

const rows = JSON.parse(readFileSync(process.argv[2], "utf8"));
let ok = 0, fail = 0;
for (const r of rows) {
  if (!r.id) continue;
  const body = {};
  if (r.ext_exit != null) body.ext_exit = r.ext_exit;
  if (r.ext_entry != null) body.ext_entry = r.ext_entry;
  if (!Object.keys(body).length) continue;
  const res = await fetch(`${URL_}/rest/v1/trades?id=eq.${r.id}`, { method: "PATCH", headers: H, body: JSON.stringify(body) });
  if (res.ok) ok++;
  else { fail++; console.error(`${r.ticker || r.id}: ${res.status} ${await res.text()}`); if (fail === 1) console.error("→ If this is a missing-column error, run supabase/extension-metric.sql in the Supabase dashboard first."); if (fail > 3) process.exit(1); }
}
console.log(`ext backfill: ${ok} rows updated, ${fail} failed`);
