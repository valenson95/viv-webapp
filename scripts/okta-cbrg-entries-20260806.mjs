// 2026-08-06 entries: OKTA 854 @ 143.88 (stop 140.00 GTC) + CBRG 8,100 @ 4.6495 blended (stop 4.22 GTC).
// Both IBKR-verified (orders 1023112672 / 1023112665). Valen-only, idempotent per symbol.
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prof, error: pfe } = await sb.from("profiles").select("id").eq("email", "vc-lv@live.com").single();
if (pfe || !prof) { console.error("ABORT: profile", pfe?.message); process.exit(1); }

const rows = [
  { symbol: "OKTA", shares: 854, entry_price: 143.88, stop_price: 140.00, entry_time: "10:19",
    setup: "Pullback Buy", tags: ["pullback"] },
  { symbol: "CBRG", shares: 8100, entry_price: 4.6495, stop_price: 4.22, entry_time: "10:08",
    setup: "", tags: ["leveraged-etf", "cerebras-2x"] },
];
for (const r of rows) {
  const { data: existing } = await sb.from("positions").select("id").eq("user_id", prof.id).eq("symbol", r.symbol).eq("is_closed", false);
  if (existing && existing.length) { console.log(r.symbol, "row already exists — skipped"); continue; }
  const { error } = await sb.from("positions").insert({
    user_id: prof.id, symbol: r.symbol, shares: r.shares,
    entry_price: r.entry_price, current_price: r.entry_price,
    entry_date: "2026-08-06", entry_time: r.entry_time, stop_price: r.stop_price,
    trade_type: "Long", source: "claude_ibkr", is_closed: false, setup: r.setup, tags: r.tags,
  });
  console.log(error ? r.symbol + " FAILED: " + error.message : "SYNCED " + r.symbol);
}
