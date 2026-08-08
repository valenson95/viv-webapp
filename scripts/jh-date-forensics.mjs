// Read-only forensics: JH's exit-date complaint ("always 1-day later than accurate").
// Look at his recent IBKR-synced trades: exit_date vs exit_time patterns, and whether
// entry/exit times look like US-market hours (09:30-16:00 ET) or something shifted.
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: profs } = await sb.from("profiles").select("id,email,display_name").or("display_name.ilike.%jh%,email.ilike.%jh%");
console.log("candidates:", (profs || []).map(p => `${p.display_name || "?"} <${p.email}> ${p.id.slice(0, 8)}`));
const jh = (profs || [])[0];
if (!jh) { console.error("no JH profile"); process.exit(1); }

const { data: rows } = await sb.from("trades")
  .select("ticker,entry_date,entry_time,exit_date,exit_time,source,ib_exec_id,ib_synced_at,exit_price")
  .eq("user_id", jh.id).eq("is_deleted", false).not("exit_date", "is", null)
  .order("exit_date", { ascending: false }).limit(15);
console.log(`\n${jh.email} — latest 15 closed trades:`);
for (const r of rows || []) {
  console.log(`  ${r.ticker.padEnd(6)} entry ${r.entry_date} ${String(r.entry_time || "--:--").padEnd(5)} → exit ${r.exit_date} ${String(r.exit_time || "--:--").padEnd(5)} [${r.source}]${r.ib_exec_id ? " exec" : ""}`);
}

// Day-of-week profile of exit_dates: US-session trades never exit on Sat/Sun (US date),
// but a +1 shift pushes Friday exits onto Saturday — the smoking gun if present.
const dow = {};
const { data: all } = await sb.from("trades").select("exit_date").eq("user_id", jh.id).eq("is_deleted", false).not("exit_date", "is", null).eq("source", "ibkr");
for (const r of all || []) {
  const d = new Date(r.exit_date + "T00:00:00Z");
  if (!isNaN(d)) { const k = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]; dow[k] = (dow[k] || 0) + 1; }
}
console.log("\nIBKR-sourced exit_date day-of-week counts:", dow);
