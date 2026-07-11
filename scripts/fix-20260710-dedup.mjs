// FIX 2026-07-10: quarantine the 07-09 22:02 self-import dump (334 raw fill rows, source='ibkr')
// that duplicated the curated journal + injected options (banned from the journal per Valen's rule).
// Fully reversible: backup at AI-OS/trading/backups/2026-07-10-pre-quarantine-trades.json;
// undo = update is_deleted=false on the same filter.
// Also: inserts the 2 REAL equity trades the import surfaced that were never synced (ARM 06-23,
// TQQQ 07-01), and links orphan Partial-Trim rows (pid=null) to their open campaigns.
// Usage: node --env-file=.env.local scripts/fix-20260710-dedup.mjs [--write]
import { createClient } from '@supabase/supabase-js';
const WRITE=process.argv.includes('--write');
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const now=()=>new Date().toISOString();
console.log(`\n=== ${WRITE?'WRITE':'DRY-RUN'} — dedup fix 2026-07-10 ===`);

// 1) the dump
const {data:dump}=await sb.from('trades').select('id,ticker,exit_date,shares,pl_dollar')
  .eq('user_id',UID).eq('source','ibkr').gte('created_at','2026-07-09').eq('is_deleted',false);
const dpl=dump.reduce((s,t)=>s+ +t.pl_dollar,0);
console.log(`1) QUARANTINE: ${dump.length} rows from the 07-09 import (P&L impact removed: $${dpl.toFixed(2)})`);
if(WRITE){
  const {error}=await sb.from('trades').update({is_deleted:true})
    .eq('user_id',UID).eq('source','ibkr').gte('created_at','2026-07-09').eq('is_deleted',false);
  if(error){console.error(error);process.exit(1);}
  console.log('   ✓ quarantined (is_deleted=true — recoverable)');
}

// 2) the two REAL equity trades the import surfaced (options excluded per rule — they live in TradeZella/trading/positions)
const REAL=[
 {ticker:'ARM', d:'2026-06-23', shares:222, ep:387.79, xp:384.60, pl:-710.82, ib:'arm-rt-20260623',
  reason:'Intraday round-trip (recovered in 07-10 dedup audit — was never synced)'},
 {ticker:'TQQQ', d:'2026-07-01', shares:2793, ep:79.36, xp:78.92, pl:-1250.92, ib:'tqqq-rt-20260701',
  reason:'Intraday round-trip (recovered in 07-10 dedup audit — was never synced)'},
];
console.log('2) INSERT real missing equity trades:');
for(const r of REAL){
  const {data:ex}=await sb.from('trades').select('id').eq('user_id',UID).eq('ib_exec_id',r.ib).limit(1);
  const p=+(((r.xp-r.ep)/r.ep)*100).toFixed(2);
  console.log(`   ${r.ticker} ${r.d}: ${r.shares}sh ${r.ep}→${r.xp} = $${r.pl} (${p}%) ${ex?.length?'(EXISTS skip)':''}`);
  if(WRITE&&!ex?.length){
    const {error}=await sb.from('trades').insert({user_id:UID,ticker:r.ticker,trade_type:'Long',entry_date:r.d,exit_date:r.d,
      entry_price:r.ep,exit_price:r.xp,shares:r.shares,stop_price:null,pl_dollar:r.pl,pl_pct:p,r_mult:null,
      exit_reason:r.reason,ib_exec_id:r.ib,source:'claude_ibkr',
      notes:'Recovered from quarantined 07-09 import (fills verified). Thesis/stop unknown — Valen to fill.',
      is_sample:false,is_deleted:false,created_at:now()});
    if(error){console.error(error);process.exit(1);}
    console.log('     ✓ inserted');
  }
}

// 3) orphan Partial-Trim rows → link to their open campaign (only within campaign window)
console.log('3) ORPHAN TRIM LINKS:');
const CAMPS=[{sym:'TWLO',pid:1977609,from:'2026-06-29'},{sym:'RBRK',pid:1977607,from:'2026-06-29'}];
for(const c of CAMPS){
  const {data:orph}=await sb.from('trades').select('id,exit_date,shares,pl_dollar,exit_reason')
    .eq('user_id',UID).eq('ticker',c.sym).is('position_id',null).eq('is_deleted',false)
    .ilike('exit_reason','%partial%').gte('exit_date',c.from);
  for(const o of orph||[]){
    console.log(`   ${c.sym} id=${o.id} ${o.exit_date} ${o.shares}sh $${o.pl_dollar} → pid ${c.pid}`);
    if(WRITE){ const {error}=await sb.from('trades').update({position_id:c.pid}).eq('id',o.id); if(error){console.error(error);process.exit(1);} }
  }
  if(!orph?.length) console.log(`   ${c.sym}: no in-window orphans`);
}

// 4) read-back: corrected journal state + per-ticker answers
if(WRITE){
  const {data:live}=await sb.from('trades').select('ticker,exit_date,shares,pl_dollar,source,position_id')
    .eq('user_id',UID).eq('is_deleted',false).eq('is_sample',false);
  const net=live.reduce((s,t)=>s+ +t.pl_dollar,0);
  const wins=live.filter(t=>+t.pl_dollar>0).length;
  const opts=live.filter(t=>/\d{6}[CP]\d{8}/.test(t.ticker));
  console.log(`\n4) READ-BACK: ${live.length} live rows · net $${net.toFixed(2)} · row-level WR ${(wins/live.length*100).toFixed(1)}% · OPTIONS rows remaining: ${opts.length}`);
  for(const tk of ['DLLL','HROW','PTCT','WYFI','DELL','NTAP','MRNA','SOFI','AXSM','ACLS','AMD']){
    const rows=live.filter(t=>t.ticker===tk);
    const s=rows.reduce((a,t)=>a+ +t.pl_dollar,0);
    console.log(`   ${tk}: ${rows.length} row(s) · net $${s.toFixed(2)}`);
  }
}
console.log(`\nDone (${WRITE?'WRITTEN':'dry-run'}).`);
