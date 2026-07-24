// JH BAND dedup remediation (2026-07-19) — Calendar showed −$211 on Jul-16 while the trade
// details showed −$106. Root cause (verified read-only): the SAME BAND Jul-16 round-trip exists
// as TWO live rows — a manual copy (id 3159, pl −105.08, entry "7/16/26") and the IBKR broker
// fill (id 3204, pl −105.57, exec-id 0001f951.6a58b6f5.01.01) — both is_deleted=false. Same
// ticker/side, entry 71.5059, exit 69.56, 54sh → groupPositionFills merges them into one −210.65
// campaign, and the calendar day-bucket + list both sum both fills. The app's integrity checker
// already flags this (check #4, "One manual trade matches several IBKR fills") but JH never actioned it.
// FIX: soft-delete the MANUAL duplicate (3159), keep the IBKR broker-truth (3204, has exec-id +
// commission-accurate P&L). Recoverable (is_deleted=true). After this, calendar/list/details all read −105.57.
// MEMBER DATA — run --write ONLY after Valen/JH confirm which row to keep. Backs up first.
// Usage: node scripts/fix-jh-band.mjs [--write]
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const JH='baad6c4a-41e6-47f8-8827-4b8cc6ac8e08';
const RETIRE=[3159];  // manual duplicate of the Jul-16 BAND round-trip
const KEEP=[3204];    // IBKR broker-truth fill (exec-id, −105.57 incl commission)
const ids=[...RETIRE,...KEEP];
const {data:rows,error}=await sb.from('trades').select('id,ticker,shares,entry_price,exit_price,entry_date,exit_date,pl_dollar,pl_pct,source,ib_exec_id,is_deleted').eq('user_id',JH).in('id',ids).order('id');
if(error){console.error(error.message);process.exit(1);}
const path=`${process.env.HOME}/Desktop/AI-OS/trading/backups/2026-07-19-jh-band-before.json`;
if(WRITE) writeFileSync(path, JSON.stringify(rows,null,1));
for(const r of rows) console.log(`${RETIRE.includes(r.id)?'RETIRE ':'KEEP   '} id=${r.id} ${r.ticker} ${r.shares}sh exit=${r.exit_date} @${r.exit_price} pl=$${r.pl_dollar} src=${r.source} deleted=${r.is_deleted} ib=${r.ib_exec_id||'—'}`);
if(WRITE){
  const a=await sb.from('trades').update({is_deleted:true}).eq('user_id',JH).in('id',RETIRE).select('id');
  if(a.error){console.error('✗',a.error.message);process.exit(1);}
  console.log(`✓ retired ${a.data.length} manual dup · backup: ${path}`);
  const {data:vb}=await sb.from('trades').select('id,pl_dollar,is_deleted').eq('user_id',JH).in('id',ids).order('id');
  console.log('read-back:',JSON.stringify(vb));
} else console.log('\n(dry-run — no writes; run with --write after JH/Valen confirm which row to keep)');
