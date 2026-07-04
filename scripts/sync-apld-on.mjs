import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb=createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const now=new Date().toISOString();
// APLD stopped out (2100 @ ~45.52, realized -4910.46)
const {data:ap}=await sb.from('positions').select('id').eq('user_id',UID).eq('symbol','APLD').eq('is_closed',false);
const apid=ap?.[0]?.id;
await sb.from('positions').update({is_closed:true,shares:0,current_price:45.52,ib_synced_at:now,updated_at:now}).eq('user_id',UID).eq('symbol','APLD').eq('is_closed',false);
const {data:d}=await sb.from('trades').select('id').eq('user_id',UID).eq('ib_exec_id','apld-stop-20260622').limit(1);
if(!d?.length) await sb.from('trades').insert({user_id:UID,ticker:'APLD',trade_type:'Long',entry_date:'2026-06-22',exit_date:'2026-06-22',entry_price:47.854,exit_price:45.52,shares:2100,pl_dollar:-4910.46,exit_reason:'Stopped at LOD',setup:'VCP / PDH+trendline breakout',position_id:apid,source:'claude_ibkr',ib_exec_id:'apld-stop-20260622',rationale:'Neocloud VCP breakout (RS 6, spec). Broke PDH but failed continuation -> stopped at LOD 45.51. Honored stop.',notes:'spec breakout, stopped',is_sample:false,is_deleted:false,created_at:now});
console.log(`APLD closed (pid ${apid}); stop-out logged 2100@45.52 = -4910.46`);
// ON stop raised to breakeven 128.70 (current live)
await sb.from('positions').update({trailing_stop:128.70,current_price:130.17,ib_synced_at:now,updated_at:now}).eq('user_id',UID).eq('symbol','ON').eq('is_closed',false);
console.log('ON: trailing_stop -> 128.70 (raised to breakeven; now risk-free)');
