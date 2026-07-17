// GATEKEEPER: journal-health audit. Run on EVERY sync + on demand.
// Flags the exact bug classes we hit. IBKR is the source of truth; this catches drift.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb=createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
// Paste live IBKR truth here each pull: symbol -> {shares, avg, realized90d}
const IBKR={DDOG:{shares:190,avg:248.555},NTAP:{shares:525,avg:160.305},RBRK:{shares:642,avg:74.745},TWLO:{shares:325,avg:197.985}}; // 2026-07-13 ~10:55 ET pull (OSCR stopped BE +0.02R · CRWD intraday RT −$799.82 · IBKR ticker = broker-paid interest, ignored)
const {data:pos}=await sb.from('positions').select('*').eq('user_id',UID).eq('is_closed',false);
const {data:tr}=await sb.from('trades').select('ticker,exit_date,shares,pl_dollar,exit_reason,position_id').eq('user_id',UID).eq('is_deleted',false).eq('is_sample',false); // LIVE rows only (quarantined dupes excluded)
let red=0;
for(const p of pos){
  const ib=IBKR[p.symbol]; const f=[];
  if(+p.stop_price===+p.trailing_stop) f.push('🔴 ORIGINAL STOP == TRAIL (overwritten)');
  if(ib){ if(Math.abs(+p.shares-ib.shares)>0.01) f.push(`🔴 shares ${p.shares}!=IBKR ${ib.shares}`);
          if(Math.abs(+p.entry_price-ib.avg)>0.05) f.push(`🔴 avg ${(+p.entry_price).toFixed(2)}!=IBKR ${ib.avg}`); }
  else f.push('🟡 no IBKR ref pasted');
  const trims=tr.filter(t=>t.ticker===p.symbol && (t.exit_reason||'').toLowerCase().includes('partial') && t.position_id===p.id);
  const trimSh=trims.reduce((a,t)=>a+ +t.shares,0), trimPl=trims.reduce((a,t)=>a+ +t.pl_dollar,0);
  // dup detection: same ticker+exit_date+shares appearing >1
  const orphan=tr.filter(t=>t.ticker===p.symbol && (t.exit_reason||'').toLowerCase().includes('partial') && t.position_id==null);
  if(orphan.length) f.push(`🟡 ${orphan.length} orphan trim row(s) (pid=null)`);
  const trimPct = trimSh/(trimSh+ +p.shares)*100;
  console.log(`${p.symbol}: ${p.shares}sh @${(+p.entry_price).toFixed(2)} | orig-stop ${p.stop_price} trail ${p.trailing_stop} | trims ${trims.length} (${trimSh}sh=${trimPct.toFixed(0)}%, realized $${trimPl.toFixed(2)}) ${f.length?'<< '+f.join(' | '):'✅ ok'}`);
  if(f.some(x=>x.startsWith('🔴'))) red++;
}
// duplicate trade rows (old-date-format dupes)
const seen={}; let dups=0;
for(const t of tr){ const k=`${t.ticker}|${t.shares}|${(+t.pl_dollar).toFixed(0)}`; seen[k]=(seen[k]||0)+1; }
for(const k in seen) if(seen[k]>1){ dups++; }
console.log(`\nDuplicate-row signatures (ticker|shares|~pl repeated): ${dups}  ${dups?'🟡 dedup needed':'✅'}`);
console.log(red?`\n❌ ${red} position(s) with RED flags — DO NOT trust until reconciled.`:`\n✅ All positions reconcile to IBKR.`);
