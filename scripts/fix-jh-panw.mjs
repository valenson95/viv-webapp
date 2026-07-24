// JH PANW remediation (2026-07-14) — restore broker-true per-fill rows, retire the hand-patched ones.
// Situation (verified read-only): the nightly cron imported the TRUE Jul-8 fills (9sh @316.75 pl 94.32
// + 1sh & 1sh @330.60 pl 60.82/61.20, correct tradeDate, exec-ids) but they were soft-deleted as
// "duplicates" of JH's two hand-made rows (id 2407: Jul-9 date, and id 1690: 2sh where the real fill
// was 9sh — P&L hand-tuned to match totals). This flips truth live and retires the approximations.
// Net P&L change: 217.13 -> 216.34 (−$0.79, the commission JH's hand rows omitted).
// MEMBER DATA — run --write ONLY after Valen/JH confirm. Backs up the rows first.
// Usage: node scripts/fix-jh-panw.mjs [--write]
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const JH='baad6c4a-41e6-47f8-8827-4b8cc6ac8e08';
const RESTORE=[2766,2767,2409];   // ibkr per-fill truth rows (currently is_deleted=true)
const RETIRE=[2407,1690];         // JH's hand-patched manual rows (currently live)
const ids=[...RESTORE,...RETIRE,2408];
const {data:rows,error}=await sb.from('trades').select('*').eq('user_id',JH).in('id',ids);
if(error){console.error(error.message);process.exit(1);}
const path=`${process.env.HOME}/Desktop/AI-OS/trading/backups/2026-07-14-jh-panw-before.json`;
if(WRITE) writeFileSync(path, JSON.stringify(rows,null,1));
for(const r of rows) console.log(`${RESTORE.includes(r.id)?'RESTORE':RETIRE.includes(r.id)?'RETIRE ':'(leave) '} id=${r.id} ${r.ticker} ${r.shares}sh exit=${r.exit_date} @${r.exit_price} pl=$${r.pl_dollar} deleted=${r.is_deleted} ib=${r.ib_exec_id||'—'}`);
if(WRITE){
  const a=await sb.from('trades').update({is_deleted:false}).eq('user_id',JH).in('id',RESTORE).select('id');
  const b=await sb.from('trades').update({is_deleted:true}).eq('user_id',JH).in('id',RETIRE).select('id');
  if(a.error||b.error){console.error('✗',a.error?.message||b.error?.message);process.exit(1);}
  console.log(`✓ restored ${a.data.length}, retired ${b.data.length} · backup: ${path}`);
  const {data:vb}=await sb.from('trades').select('id,shares,exit_date,pl_dollar,is_deleted').eq('user_id',JH).in('id',ids).order('id');
  console.log('read-back:',JSON.stringify(vb));
} else console.log('\n(dry-run — no writes; run with --write after JH/Valen confirm)');
