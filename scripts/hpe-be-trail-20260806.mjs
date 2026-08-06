// HPE stop → BREAKEVEN (Valen, 2026-08-06 ~01:15 MYT, during the Wed 08-05 US session).
// Writes trailing_stop = avg cost on the OPEN HPE position (id 1984005, 4,000 sh @ 51.7541).
// stop_price (50.40, the locked original that drives R) is NOT touched — stop-field law.
// Run: node --env-file=.env.local scripts/hpe-be-trail-20260806.mjs
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
const UID = "0e32b092-029a-436d-8cb5-67621e1467b0";

const { data: pos, error: rerr } = await sb
  .from("positions").select("id,symbol,entry_price,stop_price,trailing_stop,shares,is_closed")
  .eq("user_id", UID).eq("symbol", "HPE").eq("is_closed", false);
if (rerr) throw rerr;
if (!pos || pos.length !== 1) throw new Error("expected exactly 1 open HPE row, got " + (pos ? pos.length : 0));
const p = pos[0];
console.log("before:", JSON.stringify(p));

const be = Number(p.entry_price); // 51.7541 — breakeven = avg cost
const { error: werr } = await sb
  .from("positions").update({ trailing_stop: be })
  .eq("id", p.id).eq("user_id", UID);
if (werr) throw werr;

const { data: after } = await sb
  .from("positions").select("id,symbol,entry_price,stop_price,trailing_stop")
  .eq("id", p.id);
console.log("after: ", JSON.stringify(after[0]));
console.log("✓ HPE trailing_stop =", be, "· stop_price untouched (", after[0].stop_price, ")");
