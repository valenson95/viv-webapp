// Add today's (6/17) NBIS trim that was missed, so trim% = 50% and realized is complete.
// Current lot = 417 sh bought 6/12 @235.56. Trims: 125@268.61 (6/16, already logged) + 83@271.61 (6/17, THIS).
// 208/417 = 50% trimmed. Idempotent on ib_exec_id. Usage: node scripts/fix-nbis-trim2.mjs [--write]
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const TRIM={ ticker:'NBIS', shares:83, entry_price:235.56, exit_price:271.61, exit_date:'2026-06-17', pl_dollar:2990.03, pl_pct:13.00, ib_exec_id:'nbis-951936440', reason:'Partial Trim' };
const log=(...a)=>console.log(...a);
log(`\n=== ${WRITE?'WRITE':'DRY-RUN'} — add NBIS 6/17 trim (83sh) ===`);
const { data:pos } = await sb.from('positions').select('id,entry_date,shares').eq('user_id',UID).eq('symbol','NBIS').eq('is_closed',false);
if(!pos?.length){ log('!! no open NBIS row'); process.exit(1); }
const P=pos[0];
const { data:dupe } = await sb.from('trades').select('id').eq('user_id',UID).eq('ticker','NBIS').eq('ib_exec_id',TRIM.ib_exec_id).limit(1);
log(`NBIS row id=${P.id} shares=${P.shares}; insert 83sh @271.61 = +$2990.03 [Partial Trim, position_id=${P.id}] ${dupe?.length?'(EXISTS — skip)':''}`);
if(WRITE && !dupe?.length){
  const ins=await sb.from('trades').insert({ user_id:UID, ticker:'NBIS', trade_type:'Long', entry_date:P.entry_date||TRIM.exit_date, exit_date:TRIM.exit_date, entry_price:TRIM.entry_price, exit_price:TRIM.exit_price, shares:TRIM.shares, stop_price:null, pl_dollar:TRIM.pl_dollar, pl_pct:TRIM.pl_pct, r_mult:null, exit_reason:TRIM.reason, position_id:P.id, ib_exec_id:TRIM.ib_exec_id, source:'claude_ibkr', notes:'Claude-synced partial trim from IBKR · NBIS order 951936440', is_sample:false, is_deleted:false, created_at:new Date().toISOString() });
  log(ins.error?`  insert ERROR: ${ins.error.message}`:'  trade inserted ✓ → trim now 208/417 = 50%, realized +$7,118.69');
}
log(`\nDone (${WRITE?'WRITTEN':'dry-run'}).`);
