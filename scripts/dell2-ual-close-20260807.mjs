// 2026-08-07 later session: DELL campaign #2 (planned reclaim 20 min after the stop-out) +
// UAL closed by its own breakeven trail.
//   DELL: BUY 274 @ 426.57 (10:22 ET, order 883564642) · stop 416.45 = LoD (GTC 883564647) ·
//         trim 82 @ 441.6363 blended 11:53 ET (order 883564654, IBKR realized +$1,233.27 = +1.49R) ·
//         192 sh remain. Setup "Pullback Buy" (his word), quick-trade intent, calm-planned.
//   UAL:  trail 128.35 FILLED 10:07 ET — 500 @ 128.3046 blended (order 845189266,
//         IBKR realized +$20.88 ≈ +0.01R scratch). Original stop 125.31 stays locked.
// Valen-only, idempotent on ib_exec_id, Number() guards (law #18), post-state re-read.
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prof } = await sb.from("profiles").select("id").eq("email", "vc-lv@live.com").single();
if (!prof) { console.error("ABORT: profile"); process.exit(1); }
const uid = prof.id;

// ── 1. DELL campaign #2 position (192 sh after the trim) ─────
let dellPosId = null;
{
  const { data: existing } = await sb.from("positions").select("id,shares").eq("user_id", uid).eq("symbol", "DELL").eq("is_closed", false);
  if (existing?.length) { dellPosId = existing[0].id; console.log("DELL position already exists (" + existing[0].shares + " sh) — insert skipped"); }
  else {
    const { data: ins, error } = await sb.from("positions").insert({
      user_id: uid, symbol: "DELL", shares: 192,
      entry_price: 426.57, current_price: 441.6,
      entry_date: "2026-08-07", entry_time: "10:22", stop_price: 416.45,
      trade_type: "Long", source: "claude_ibkr", is_closed: false,
      setup: "Pullback Buy", tags: ["reclaim", "quick-trade", "re-entry"],
    }).select("id").single();
    if (error) { console.error("DELL insert FAILED: " + error.message); process.exit(1); }
    dellPosId = ins.id;
    console.log("DELL #2 position: 192 sh @ 426.57 · stop 416.45 (LoD) · Pullback Buy");
  }
}

// ── 2. DELL trim trade (+$1,233.27 / +1.49R on 82 sh) ────────
{
  const EXEC = "0000f800.6a75f903.01.01";
  const { data: dupe } = await sb.from("trades").select("id").eq("user_id", uid).eq("ib_exec_id", EXEC);
  if (dupe?.length) console.log("DELL trim already recorded");
  else {
    const { error } = await sb.from("trades").insert({
      user_id: uid, ticker: "DELL", trade_type: "Long",
      entry_date: "2026-08-07", entry_time: "10:22", exit_date: "2026-08-07", exit_time: "11:53",
      entry_price: 426.57, exit_price: 441.6363, shares: 82,
      stop_price: 416.45, pl_dollar: 1233.27, pl_pct: 3.53, r_mult: 1.49,
      commission: 1.76, exit_reason: "Partial profit (trim)", setup: "Pullback Buy",
      source: "claude_ibkr", ib_exec_id: EXEC, position_id: dellPosId, needs_stop: false, is_deleted: false,
    });
    console.log(error ? "DELL trim FAILED: " + error.message : "DELL trim recorded: +$1,233.27 / +1.49R (82 sh @ 441.6363)");
  }
}

// ── 3. UAL closed by its breakeven trail ─────────────────────
{
  const EXEC = "000249de.6a75d7fe.01.01";
  const { data: dupe } = await sb.from("trades").select("id").eq("user_id", uid).eq("ib_exec_id", EXEC);
  if (dupe?.length) console.log("UAL exit already recorded");
  else {
    const { data: pos } = await sb.from("positions").select("id,shares,entry_price,stop_price,entry_date,entry_time,setup,tags").eq("user_id", uid).eq("symbol", "UAL").eq("is_closed", false);
    if (!pos || pos.length !== 1) { console.error("ABORT UAL: open rows = " + (pos?.length ?? 0)); process.exit(1); }
    const p = pos[0], entry = Number(p.entry_price), stop = Number(p.stop_price), shares = Number(p.shares);
    if (shares !== 500) { console.error("ABORT UAL: shares = " + shares + ", IBKR filled 500"); process.exit(1); }
    const exit = 128.3046, pl = 20.88;
    const r = +(pl / ((entry - stop) * shares)).toFixed(2), pct = +(((exit - entry) / entry) * 100).toFixed(2);
    const { error } = await sb.from("trades").insert({
      user_id: uid, ticker: "UAL", trade_type: "Long",
      entry_date: p.entry_date, entry_time: p.entry_time, exit_date: "2026-08-07", exit_time: "10:07",
      entry_price: entry, exit_price: exit, shares,
      stop_price: stop, pl_dollar: pl, pl_pct: pct, r_mult: r,
      commission: 3.92, exit_reason: "Trailing stop hit at breakeven", setup: p.setup || null, tags: p.tags || null,
      source: "claude_ibkr", ib_exec_id: EXEC, needs_stop: false, is_deleted: false,
    });
    if (error) { console.error("UAL exit FAILED: " + error.message); process.exit(1); }
    console.log(`UAL exit recorded: +$${pl} / +${r}R (500 sh @ ${exit}, breakeven trail)`);
    const { error: de } = await sb.from("positions").delete().eq("id", p.id);
    console.log(de ? "UAL position delete FAILED: " + de.message : "UAL position row deleted");
  }
}

// ── Post-state ───────────────────────────────────────────────
const { data: after } = await sb.from("positions").select("symbol,shares,entry_price,stop_price,trailing_stop").eq("user_id", uid).eq("is_closed", false).order("symbol");
console.log("\nPOST-STATE positions:");
for (const r of after || []) console.log(`  ${r.symbol}: ${r.shares} sh @ ${r.entry_price} · stop ${r.stop_price} · trail ${r.trailing_stop ?? "—"}`);
