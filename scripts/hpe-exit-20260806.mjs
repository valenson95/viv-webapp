// HPE gap-down stopout 2026-08-06 — VALEN'S rows only (email-resolved per the identity law).
// 1) id 1984005 (4000 @ 51.7541) -> closed trade @ 50.57, -0.88R (IBKR exec 00012dc0.6a746f00.01.01)
// 2) id 1983928 (938 @ 47.484, entry 08-03) = ZOMBIE from the pre-blend starter — IBKR holds 0 HPE;
//    its history lives in the blended row + earlier closed trades. Deleted, no trade insert.
// Other users' HPE rows (1984097, 1984145) are MEMBER data — never touched.
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const EXEC_ID = "00012dc0.6a746f00.01.01";
const EXIT = { price: 50.57, date: "2026-08-06", shares: 4000, commission: 24.96, pl: -4781.48 };

const { data: prof, error: pfe } = await sb.from("profiles").select("id,email").eq("email", "vc-lv@live.com").single();
if (pfe || !prof) { console.error("ABORT: cannot resolve vc-lv@live.com profile", pfe?.message); process.exit(1); }

const { data: pos, error: pe } = await sb.from("positions").select("*").eq("symbol", "HPE").eq("user_id", prof.id);
if (pe) throw pe;
const main = (pos || []).find(r => r.id === 1984005);
const zombie = (pos || []).find(r => r.id === 1983928);
if (!main) { console.error("ABORT: campaign row 1984005 not found for Valen"); process.exit(1); }
if (Math.abs((+main.entry_price) - 51.7541) > 0.01 || +main.shares !== 4000) { console.error("ABORT: row 1984005 shape mismatch", main.entry_price, main.shares); process.exit(1); }

const { data: dupe } = await sb.from("trades").select("id").eq("ib_exec_id", EXEC_ID).limit(1);
if (dupe && dupe.length) { console.log("Already synced — nothing to do."); process.exit(0); }

const risk = (51.7541 - 50.40) * 4000;
const row = {
  user_id: prof.id, ticker: "HPE", trade_type: main.trade_type || "Long",
  entry_date: main.entry_date, entry_time: main.entry_time || null,
  exit_date: EXIT.date, exit_time: "09:32", entry_price: main.entry_price, exit_price: EXIT.price,
  shares: EXIT.shares, stop_price: main.stop_price, needs_stop: false, is_deleted: false,   // 50.40 LOCKED original
  commission: EXIT.commission, pl_dollar: EXIT.pl, pl_pct: -2.29,
  r_mult: +(EXIT.pl / risk).toFixed(2),
  setup: main.setup || null, tags: main.tags || null, source: "ibkr",
  ib_exec_id: EXEC_ID, position_id: main.id,
  exit_reason: "Stopped out on the gap-down open (DDOG-led). Breakeven trail 51.75 was gapped through; filled 50.57, above the original 50.40 stop.",
};
Object.keys(row).forEach(k => row[k] === undefined && delete row[k]);

const { error: te } = await sb.from("trades").insert([row]);
if (te) { console.error("trade insert failed:", te.message); process.exit(1); }
const { error: de } = await sb.from("positions").delete().eq("id", main.id).eq("user_id", prof.id);
if (de) { console.error("position delete failed (trade WAS inserted):", de.message); process.exit(1); }
if (zombie) {
  const { error: ze } = await sb.from("positions").delete().eq("id", zombie.id).eq("user_id", prof.id);
  console.log(ze ? "zombie delete FAILED: " + ze.message : "zombie 1983928 removed (938sh pre-blend starter, IBKR holds 0)");
}
console.log("SYNCED: HPE closed -0.88R (trade inserted, exec " + EXEC_ID + "), row 1984005 removed");
