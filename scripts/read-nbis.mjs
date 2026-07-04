import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb=createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const {data:pos}=await sb.from('positions').select('id,symbol,shares,entry_price,entry_date,stop_price,trailing_stop,is_closed').eq('user_id',UID).eq('symbol','NBIS');
console.log('=== NBIS position row(s) ===',JSON.stringify(pos,null,2));
const {data:tr}=await sb.from('trades').select('id,ticker,entry_date,exit_date,entry_price,exit_price,shares,pl_dollar,exit_reason,position_id').eq('user_id',UID).eq('ticker','NBIS').order('exit_date',{ascending:true});
console.log('\n=== NBIS trade rows (all) ===');
let trimSum=0, closeSum=0;
for(const t of (tr||[])){
  const tag=(t.exit_reason||'').toLowerCase();
  const isTrim=tag.includes('partial');
  console.log(`  ${t.exit_date} | ${t.shares}sh | entry ${t.entry_price} -> exit ${t.exit_price} | pl ${t.pl_dollar} | [${t.exit_reason}] | pid=${t.position_id}`);
  if(isTrim) trimSum+=+t.pl_dollar; else closeSum+=+t.pl_dollar;
}
console.log(`\nPartial-Trim realized (current open campaign): $${trimSum.toFixed(2)}`);
console.log(`Other/closed NBIS rows: $${closeSum.toFixed(2)}`);
console.log(`TOTAL all NBIS realized rows: $${(trimSum+closeSum).toFixed(2)}`);
