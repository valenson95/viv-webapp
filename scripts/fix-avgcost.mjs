import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb=createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
// IBKR true blended avg cost (rounded 2dp). ONLY entry_price is touched. stop_price NEVER touched.
const IBKR={ALAB:356.75, DOCN:182.86, MRVL:305.96, BE:256.34, LITE:879.05, NBIS:235.56};
const {data:rows}=await sb.from('positions').select('id,symbol,entry_price,stop_price,trailing_stop').eq('user_id',UID).eq('is_closed',false);
for(const r of rows){
  const t=IBKR[r.symbol]; if(t==null) continue;
  const cur=+r.entry_price, off=Math.abs(cur-t)>0.05;
  const stopFlag=(+r.stop_price===+r.trailing_stop)?'  ⚠️ stop_price==trailing_stop (ORIGINAL STOP COMPROMISED — not touching, needs your input)':'';
  console.log(`${r.symbol}: avg ${cur} -> ${t} ${off?'(FIX)':'(ok)'}${stopFlag}`);
  if(off){ await sb.from('positions').update({entry_price:t}).eq('id',r.id); console.log(`   ✓ entry_price updated to ${t} (stop_price ${r.stop_price} LEFT UNTOUCHED)`); }
}
console.log('\nDone. stop_price was NOT modified on any row.');
