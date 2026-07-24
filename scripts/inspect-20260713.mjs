// Read-only inspection before the 2026-07-13 sync (CRWD round-trip + OSCR stop-out).
// Usage: node scripts/inspect-20260713.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';

const {data:pos,error:pe}=await sb.from('positions')
  .select('id,symbol,shares,entry_price,stop_price,stop_price_2,trailing_stop,current_price,entry_date,is_closed,rationale')
  .eq('user_id',UID).eq('is_closed',false).order('symbol');
if(pe){console.error(pe.message);process.exit(1);}
console.log('=== OPEN positions ===');
for(const p of pos) console.log(`${p.symbol} id=${p.id} ${p.shares}sh @${p.entry_price} stop=${p.stop_price} stop2=${p.stop_price_2} trail=${p.trailing_stop} cp=${p.current_price} entry=${p.entry_date} | ${String(p.rationale||'').slice(0,80)}`);

const {data:tr,error:te}=await sb.from('trades')
  .select('id,ticker,shares,entry_date,exit_date,entry_price,exit_price,pl_dollar,r_mult,exit_reason,position_id,ib_exec_id,is_deleted')
  .eq('user_id',UID).gte('exit_date','2026-07-08').order('exit_date');
if(te){console.error(te.message);process.exit(1);}
console.log('\n=== trades with exit_date >= 2026-07-08 ===');
for(const t of tr) console.log(`${t.exit_date} ${t.ticker} ${t.shares}sh ${t.entry_price}->${t.exit_price} $${t.pl_dollar} r=${t.r_mult} pid=${t.position_id} ib=${t.ib_exec_id} ${t.is_deleted?'DELETED':''} | ${String(t.exit_reason||'').slice(0,60)}`);
