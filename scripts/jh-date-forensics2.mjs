import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const uid = "baad6c4a".length === 8 ? null : null;
const { data: prof } = await sb.from("profiles").select("id,email").eq("email", "ong.jh000@gmail.com").single();
const { data: rows } = await sb.from("trades")
  .select("ticker,entry_date,entry_time,exit_date,exit_time,source,ib_exec_id")
  .eq("user_id", prof.id).eq("is_deleted", false).not("exit_date", "is", null)
  .order("id", { ascending: false }).limit(20);
console.log(`${prof.email} — latest 20 closed trades:`);
for (const r of rows || []) console.log(`  ${String(r.ticker).padEnd(6)} entry ${String(r.entry_date).padEnd(10)} ${String(r.entry_time || "--:--").padEnd(8)} → exit ${String(r.exit_date).padEnd(10)} ${String(r.exit_time || "--:--").padEnd(8)} [${r.source}]${r.ib_exec_id ? " exec" : ""}`);
const dow = {};
const { data: all } = await sb.from("trades").select("exit_date,source").eq("user_id", prof.id).eq("is_deleted", false).not("exit_date", "is", null);
for (const r of all || []) {
  const s = String(r.exit_date); let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) d = new Date(s + "T00:00:00Z");
  else { const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (m) d = new Date(Date.UTC(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[1] - 1, +m[2])); }
  if (d && !isNaN(d)) { const k = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getUTCDay()] + ":" + r.source; dow[k] = (dow[k] || 0) + 1; }
}
console.log("\nexit_date day-of-week × source:", dow);
