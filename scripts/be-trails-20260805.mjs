// SOXL + TQQQ stops moved to breakeven at IBKR (Valen, 2026-08-05 ~12:27 MYT — verified live orders:
// SOXL 223 STP 115.45 GTC · TQQQ 433 STP 67.40 GTC). stop_price stays LOCKED (102.15 / 64.00);
// BE trail goes to trailing_stop per the hard rule. Marks refreshed same pull.
// Usage: node --env-file=.env.local scripts/be-trails-20260805.mjs [--write]
import { createClient } from '@supabase/supabase-js';
const WRITE = process.argv.includes('--write');
const sb = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const UID = '0e32b092-029a-436d-8cb5-67621e1467b0';
const now = () => new Date().toISOString();
const TRAILS = { SOXL: { trail: 115.45, mark: 138.63 }, TQQQ: { trail: 67.40, mark: 74.82 } };
const MARKS = { HPE: 52.92, UAL: 132.62 };
const { data: rows } = await sb.from('positions').select('id,symbol,shares,entry_price,stop_price,trailing_stop,is_closed,is_demo').eq('user_id', UID);
const open = (rows || []).filter(r => !r.is_closed && !r.is_demo);
for (const [sym, t] of Object.entries(TRAILS)) {
  const r = open.find(x => x.symbol === sym);
  if (!r) { console.log(`✗ ${sym} open row missing`); continue; }
  console.log(`${sym}: stop_price ${r.stop_price} (LOCKED, untouched) · trailing_stop ${r.trailing_stop || '—'} → ${t.trail} · mark → ${t.mark}`);
  if (WRITE) {
    const { error } = await sb.from('positions').update({ trailing_stop: t.trail, current_price: t.mark, ib_synced_at: now(), updated_at: now() }).eq('id', r.id);
    console.log(error ? `  ✗ ${error.message}` : `  ✓ written`);
  }
}
for (const [sym, px] of Object.entries(MARKS)) {
  const r = open.find(x => x.symbol === sym);
  if (r && WRITE) {
    const { error } = await sb.from('positions').update({ current_price: px, ib_synced_at: now(), updated_at: now() }).eq('id', r.id);
    console.log(error ? `✗ ${sym}: ${error.message}` : `✓ ${sym} mark → ${px}`);
  } else if (r) console.log(`${sym} mark → ${px}`);
}
console.log(WRITE ? '=== WRITE DONE ===' : '=== dry-run — add --write ===');
