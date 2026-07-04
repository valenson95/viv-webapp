import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb=createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
for(const sym of ['MRVL','DOCN']){
  const {data:pos}=await sb.from('positions').select('id,symbol,shares,entry_price,current_price,stop_price,trailing_stop,entry_date,is_closed,updated_at,ib_synced_at').eq('user_id',UID).eq('symbol',sym).eq('is_closed',false);
  console.log(`\n=== ${sym} POSITION ROW(S) ===`);
  console.log(JSON.stringify(pos,null,2));
  const {data:tr}=await sb.from('trades').select('id,ticker,entry_date,exit_date,entry_price,exit_price,shares,pl_dollar,exit_reason,position_id').eq('user_id',UID).eq('ticker',sym).order('exit_date',{ascending:true});
  console.log(`--- ${sym} linked trades (trims/adds/closes) ---`);
  for(const t of (tr||[])) console.log(`  ${t.exit_date||'?'} ${t.shares}sh entry ${t.entry_price} exit ${t.exit_price} pl ${t.pl_dollar} [${t.exit_reason}] pid=${t.position_id}`);
}
