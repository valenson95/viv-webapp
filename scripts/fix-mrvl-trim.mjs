import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb=createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
// Replace the corrupt 1015-share MRVL trim with the REAL IBKR fill: 300sh @ 324, FIFO realized +6561.20
const {data:bad}=await sb.from('trades').select('id,shares,exit_price,pl_dollar').eq('user_id',UID).eq('ticker','MRVL').eq('position_id',1974369).eq('exit_reason','Partial Trim');
console.log('MRVL trim row(s) found:',JSON.stringify(bad));
for(const r of (bad||[])){
  await sb.from('trades').update({shares:300, entry_price:293.27, exit_price:324, pl_dollar:6561.20, pl_pct:+(((324-293.27)/293.27*100).toFixed(2))}).eq('id',r.id);
  console.log(`  ✓ row ${r.id}: 1015sh/+2888 -> 300sh @324 / +6561.20 (IBKR FIFO)`);
}
