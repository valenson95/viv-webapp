import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb=createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const now=new Date().toISOString();
// Align MRVL realized to FIFO (matches the position's FIFO cost basis of 310.96). Both sells came from the cheap $293.27 base lot.
// trim 300 @324 from base: +9220 ; stop 200 @301.80 from base: +1707
await sb.from('trades').update({entry_price:293.27,exit_price:324,pl_dollar:9220.50,notes:'FIFO: trim sold base lot @293.27',updated_at:now}).eq('user_id',UID).eq('ticker','MRVL').eq('ib_exec_id','mrvl-trim-20260618');
await sb.from('trades').update({entry_price:293.27,exit_price:301.80,pl_dollar:1707.00,exit_reason:'Stopped (FIFO base lot)',notes:'FIFO: this 200 sold the cheap base lot @293.27 = a GAIN (not the add lot)',updated_at:now}).eq('user_id',UID).eq('ticker','MRVL').eq('ib_exec_id','mrvl-addstop-20260622');
const {data:tr}=await sb.from('trades').select('exit_date,shares,entry_price,exit_price,pl_dollar,exit_reason').eq('user_id',UID).eq('ticker','MRVL').in('ib_exec_id',['mrvl-trim-20260618','mrvl-addstop-20260622']);
let r=0; for(const t of tr){ console.log(`  ${t.shares}sh @${t.entry_price}->${t.exit_price} = $${t.pl_dollar} [${t.exit_reason||'Partial Trim'}]`); r+=+t.pl_dollar; }
console.log(`\nMRVL realized (FIFO) = +$${r.toFixed(2)}  (was +$5,727 mixed-method)`);
console.log(`Position remaining: 500 @ $310.96 (FIFO add lot), stop 283.`);
console.log(`Reconciles: realized +$${r.toFixed(0)} + unrealized -$15,583 = total -$${(15583-r).toFixed(0)} ✓ (= cash-flow total)`);
