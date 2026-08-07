// 2026-08-07 entry: PLTU 1,600 @ 45.125 limit (3 fills 09:32:39 ET, order 1202332845),
// stop 43.33 GTC working (order 1202332848, = LoD). Setup "1min ORB" (his word), quick-trade intent.
// IBKR-verified via live pull. Valen-only, idempotent per symbol.
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: prof, error: pfe } = await sb.from("profiles").select("id").eq("email", "vc-lv@live.com").single();
if (pfe || !prof) { console.error("ABORT: profile", pfe?.message); process.exit(1); }

const { data: existing } = await sb.from("positions").select("id").eq("user_id", prof.id).eq("symbol", "PLTU").eq("is_closed", false);
if (existing && existing.length) { console.log("PLTU row already exists — skipped"); process.exit(0); }

const { error } = await sb.from("positions").insert({
  user_id: prof.id, symbol: "PLTU", shares: 1600,
  entry_price: 45.13, current_price: 45.47,
  entry_date: "2026-08-07", entry_time: "09:32", stop_price: 43.33,
  trade_type: "Long", source: "claude_ibkr", is_closed: false,
  setup: "1min ORB", tags: ["leveraged-etf", "palantir-2x", "orb"],
});
console.log(error ? "PLTU FAILED: " + error.message : "SYNCED PLTU");
