// HPE stop REPLACED at IBKR 2026-08-04: 938sh STP 47.50 GTC (above 47.484 cost = BE+ trail).
// HARD RULE: stop_price 46.30 stays LOCKED; the trail goes to trailing_stop only.
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const UID = '0e32b092-029a-436d-8cb5-67621e1467b0';
const { data: rows } = await sb.from('positions').select('id,symbol,shares,stop_price,trailing_stop').eq('user_id', UID).eq('symbol', 'HPE').eq('is_closed', false).eq('is_demo', false);
const r = rows?.[0];
if (!r) { console.log('✗ no open HPE row'); process.exit(1); }
console.log(`HPE row: ${r.shares}sh · locked stop ${r.stop_price} · trail ${r.trailing_stop ?? '—'}`);
if (Number(r.stop_price) !== 46.30) console.log('⚠ locked stop unexpected — NOT touching it');
const { error } = await sb.from('positions').update({ trailing_stop: 47.50, ib_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', r.id);
console.log(error ? `✗ ${error.message}` : '✓ trailing_stop → 47.50 (stop_price untouched at ' + r.stop_price + ')');
