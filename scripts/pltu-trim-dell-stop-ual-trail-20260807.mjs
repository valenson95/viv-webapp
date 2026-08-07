// 2026-08-07 (10:02 ET cluster): PLTU trim 320 @ 47.60 (order 883564623, +$788.42) ·
// DELL GTC stop FILLED 270 @ 427.0626 blended (order 1023112656, −$5,058.84 = loss #6) ·
// UAL stop replaced to 128.35 ≈ BE (order 845189266, 10:06 ET) → trailing_stop only.
// Valen-only, idempotent on ib_exec_id, Number() on every DB numeric (sync-mistake #18).
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prof } = await sb.from("profiles").select("id").eq("email", "vc-lv@live.com").single();
if (!prof) { console.error("ABORT: profile"); process.exit(1); }
const uid = prof.id;

// ── 1. PLTU trim ─────────────────────────────────────────────
{
  const { data: pos } = await sb.from("positions").select("id,shares,entry_price,stop_price,entry_date").eq("user_id", uid).eq("symbol", "PLTU").eq("is_closed", false);
  if (!pos || pos.length !== 1) { console.error("ABORT: PLTU open rows = " + (pos?.length ?? 0)); process.exit(1); }
  const p = pos[0], shares = Number(p.shares), entry = Number(p.entry_price), stop = Number(p.stop_price);
  const EXEC = "0001390d.6a764afc.01.01";
  const { data: dupe } = await sb.from("trades").select("id").eq("user_id", uid).eq("ib_exec_id", EXEC);
  if (dupe?.length) { console.log("PLTU trim already recorded"); }
  else {
    const pl = 788.42, riskBasis = (entry - stop) * 320;
    const r = +(pl / riskBasis).toFixed(2), pct = +(((47.60 - entry) / entry) * 100).toFixed(2);
    const { error } = await sb.from("trades").insert({
      user_id: uid, ticker: "PLTU", trade_type: "Long",
      entry_date: p.entry_date || "2026-08-07", entry_time: "09:32", exit_date: "2026-08-07", exit_time: "10:02",
      entry_price: entry, exit_price: 47.60, shares: 320,
      stop_price: stop, pl_dollar: pl, pl_pct: pct, r_mult: r,
      commission: 1.98, exit_reason: "Partial profit (de-risk — PLTR 1 ATR exhausted intraday)", setup: "1min ORB",
      source: "claude_ibkr", ib_exec_id: EXEC, position_id: p.id, needs_stop: false, is_deleted: false,
    });
    console.log(error ? "PLTU trim insert FAILED: " + error.message : `PLTU trim recorded: +$${pl} / +${r}R (320 sh @ 47.60, entry ${entry}, stop ${stop})`);
  }
  if (shares === 1600) {
    const { error } = await sb.from("positions").update({ shares: 1280 }).eq("id", p.id);
    console.log(error ? "PLTU share update FAILED: " + error.message : "PLTU position 1600 → 1280 sh");
  } else console.log("PLTU shares = " + shares + " (not 1600) — skipping share update");
}

// ── 2. DELL stopped out — close campaign ─────────────────────
{
  const { data: pos } = await sb.from("positions").select("id,shares,entry_price,stop_price,entry_date,entry_time,setup,tags").eq("user_id", uid).eq("symbol", "DELL").eq("is_closed", false);
  const EXEC = "0000f800.6a75dfa3.01.01";
  const { data: dupe } = await sb.from("trades").select("id").eq("user_id", uid).eq("ib_exec_id", EXEC);
  if (dupe?.length) { console.log("DELL exit already recorded"); }
  else if (!pos || pos.length !== 1) { console.error("ABORT DELL: open rows = " + (pos?.length ?? 0) + " and exit not yet recorded — investigate"); process.exit(1); }
  else {
    const p = pos[0], entry = Number(p.entry_price), stop = Number(p.stop_price), shares = Number(p.shares);
    if (shares !== 270) { console.error("ABORT DELL: position shares = " + shares + ", IBKR filled 270 — mismatch"); process.exit(1); }
    const exit = 427.0626, pl = -5058.84;
    const r = +(pl / ((entry - stop) * shares)).toFixed(2), pct = +(((exit - entry) / entry) * 100).toFixed(2);
    const { error } = await sb.from("trades").insert({
      user_id: uid, ticker: "DELL", trade_type: "Long",
      entry_date: p.entry_date, entry_time: p.entry_time, exit_date: "2026-08-07", exit_time: "10:02",
      entry_price: entry, exit_price: exit, shares,
      stop_price: stop, pl_dollar: pl, pl_pct: pct, r_mult: r,
      commission: 3.78, exit_reason: "Stopped out (GTC stop filled)", setup: p.setup || null, tags: p.tags || null,
      source: "claude_ibkr", ib_exec_id: EXEC, needs_stop: false, is_deleted: false,
    });
    if (error) { console.error("DELL exit insert FAILED: " + error.message); process.exit(1); }
    console.log(`DELL exit recorded: $${pl} / ${r}R (270 sh @ ${exit}, entry ${entry}, stop ${stop})`);
    const { error: de } = await sb.from("positions").delete().eq("id", p.id);
    console.log(de ? "DELL position delete FAILED: " + de.message : "DELL position row deleted");
  }
}

// ── 3. UAL stop trailed to 128.35 (≈ cost 128.255) ───────────
{
  const { data: pos } = await sb.from("positions").select("id,entry_price,stop_price,trailing_stop").eq("user_id", uid).eq("symbol", "UAL").eq("is_closed", false);
  if (!pos || pos.length !== 1) { console.error("UAL: open rows = " + (pos?.length ?? 0) + " — skipping"); }
  else if (Number(pos[0].trailing_stop) === 128.35) { console.log("UAL trailing_stop already 128.35"); }
  else {
    const { error } = await sb.from("positions").update({ trailing_stop: 128.35 }).eq("id", pos[0].id);
    console.log(error ? "UAL trail update FAILED: " + error.message : `UAL trailing_stop → 128.35 (original stop_price ${pos[0].stop_price} untouched)`);
  }
}

// ── Post-state re-read (law #18: verify, don't assume) ───────
const { data: after } = await sb.from("positions").select("symbol,shares,entry_price,stop_price,trailing_stop").eq("user_id", uid).eq("is_closed", false).order("symbol");
console.log("\nPOST-STATE positions:");
for (const r of after || []) console.log(`  ${r.symbol}: ${r.shares} sh @ ${r.entry_price} · stop ${r.stop_price} · trail ${r.trailing_stop ?? "—"}`);
