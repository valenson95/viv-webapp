import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb=createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const {data:pos}=await sb.from('positions').select('id,shares,entry_price,stop_price').eq('user_id',UID).eq('symbol','MRVL').eq('is_closed',false);
const {data:tr}=await sb.from('trades').select('id,exit_date,shares,entry_price,exit_price,pl_dollar,exit_reason,ib_exec_id,position_id').eq('user_id',UID).eq('ticker','MRVL').order('exit_date');
console.log('POSITION:',JSON.stringify(pos));
console.log('TRADE ROWS:');
for(const t of tr) console.log(`  id${t.id} | ${t.exit_date} | ${t.shares}sh ${t.entry_price}->${t.exit_price} = $${t.pl_dollar} [${t.exit_reason}] ib=${t.ib_exec_id} pid=${t.position_id}`);
// CASH-FLOW TRUTH (method-independent): buys 500@293.265 + 500@310.96 ; sells 300@324 + 200@301.80 ; hold 500@279.80
const buys=500*293.265+500*310.96, sells=300*324+200*301.80, hold=500*279.80;
console.log(`\n--- CASH-FLOW TRUTH ---`);
console.log(`buys $${buys.toFixed(0)} | sells $${sells.toFixed(0)} | hold(500@279.80) $${hold.toFixed(0)}`);
console.log(`TRUE total MRVL P&L = sells+hold-buys = $${(sells+hold-buys).toFixed(0)}`);
console.log(`IBKR realized field = +$5,727 ; IBKR avg = $310.96 (FIFO) -> these two are INCONSISTENT (different methods)`);
console.log(`FIFO-consistent: realized +$10,927 (both sells from cheap base) + unrealized -$15,580 = -$4,653 ✓`);
