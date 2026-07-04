import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb=createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const {data:pos}=await sb.from('positions').select('id,symbol,shares,entry_price,current_price,stop_price,trailing_stop,entry_date,is_closed').eq('user_id',UID).eq('symbol','ALAB').eq('is_closed',false);
console.log('=== ALAB ROW ===',JSON.stringify(pos,null,2));
for(const p of (pos||[])){
  const e=+p.entry_price,s=+p.stop_price,c=+p.current_price;
  console.log(`computed: entry ${e} | orig stop ${s} | price ${c} | initial risk/sh ${(e-s).toFixed(2)} | R = (price-entry)/(entry-stop) = ${((c-e)/(e-s)).toFixed(2)}R`);
  console.log(`IF entry were IBKR-true 356.75: R = ${((c-356.75)/(356.75-s)).toFixed(2)}R`);
}
