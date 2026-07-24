// Sync 2026-07-13 (~10:55 ET pull) — CRWD intraday round-trip (small cut) + OSCR stop-out at BE + marks.
// From live get_account_trades TODAY (positions confirm both flat):
//   CRWD: pullback buy. BUY 464 sh (49 @ 187.895 + 415 @ 187.945, 10:34 ET, blended 187.94)
//         → cut manually 18 min later, SELL 464 @ 186.23 (10:52:53 ET, MidPrice).
//         Realized −$799.82 net. Valen: risking $3k, market choppy → cut small, sitting out.
//         −$799.82 / $3,000 stated risk = −0.27R. NO stop order was on the book (cut before placing /
//         manual discretionary cut) → stop_price left null pending Valen's original stop level.
//   OSCR: GTC stop 30.28 triggered 09:42:30 ET — 2250 sh (1250+1000 fills) @ 30.28, realized +$43.14.
//         Final leg of ORIGINAL-3000 campaign (pid 1979371, entry 30.255 on 07-01, orig stop 29.22,
//         750 trimmed 07-02 +$1,852). Close leg = +0.02R; campaign total ≈ +$1,895.
// Marks (live ~10:55 ET): CRWD flat · OSCR flat · DDOG 260.23 · NTAP 164.68 · RBRK 83.91 · TWLO 215.48.
// Stops live (orders): NTAP trail RAISED to 160.50 (was 160.30) · DDOG 249.00 · RBRK 74.80 · TWLO 198.00.
// HARD RULES: stop_price never written on positions; idempotent on ib_exec_id; read-back verify;
//             snapshot backup BEFORE any write.
// Usage: node scripts/sync-20260713.mjs [--write]
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const TODAY='2026-07-13';
const now=()=>new Date().toISOString();
const log=(...a)=>console.log(...a);
const pct=(entry,exit)=>+(((exit-entry)/entry)*100).toFixed(2);
async function dupe(ib){ const {data}=await sb.from('trades').select('id').eq('user_id',UID).eq('ib_exec_id',ib).limit(1); return data?.length>0; }
async function must(res,label){ if(res.error){ console.error(`✗ ${label}:`,res.error.message); process.exit(1);} }

log(`\n=== ${WRITE?'WRITE':'DRY-RUN'} — sync 2026-07-13 (CRWD round-trip · OSCR BE stop-out · marks) ===\n`);

// ── 0. Snapshot backup BEFORE any write (checklist #20) ──
if(WRITE){
  const {data:allTr,error:e1}=await sb.from('trades').select('*').eq('user_id',UID);
  const {data:allPos,error:e2}=await sb.from('positions').select('*').eq('user_id',UID);
  if(e1||e2){ console.error('✗ backup read failed', e1?.message||e2?.message); process.exit(1); }
  const path=`${process.env.HOME}/Desktop/AI-OS/trading/backups/2026-07-13-pre-sync.json`;
  writeFileSync(path, JSON.stringify({trades:allTr,positions:allPos},null,1));
  log(`✓ backup: ${path} (${allTr.length} trades, ${allPos.length} positions)`);
}

// ── 1. OSCR close (final 2250 of ORIGINAL-3000 campaign) ──
{
  const c={id:1979371, sym:'OSCR', shares:2250, entry:30.255, stop:29.22, exit:30.28, pl:43.14,
    reason:'Hit Trailing Stop (GTC 30.28, at breakeven) — final 2250 sh of ORIGINAL 3000 campaign', ib:'oscr-close-434741786'};
  const p=pct(c.entry,c.exit); const r=+((c.exit-c.entry)/(c.entry-c.stop)).toFixed(2); const ex=await dupe(c.ib);
  log(`— OSCR CLOSE: ${c.shares}sh ${c.entry}→${c.exit} = +$${c.pl} (${p}%) = +${r}R vs orig 29.22 | campaign total ≈ +$1,895 ${ex?'(EXISTS skip)':''}`);
  if(WRITE){
    if(!ex) must(await sb.from('trades').insert({ user_id:UID, ticker:c.sym, trade_type:'Long', entry_date:'2026-07-01', exit_date:TODAY,
      exit_time:'09:42:30', entry_price:c.entry, exit_price:c.exit, shares:c.shares, stop_price:c.stop, pl_dollar:c.pl, pl_pct:p, r_mult:r,
      exit_reason:c.reason, position_id:c.id, ib_exec_id:c.ib, source:'claude_ibkr',
      notes:'Claude-synced IBKR 07-13 · trailing stop (BE zone) hit 09:42:30 ET on the morning flush · fills 1250+1000 @ 30.28 · campaign: 750 trimmed 07-02 +$1,852 + this leg +$43.14 ≈ +$1,895 total on ORIGINAL 3000 · entry_time unknown (07-01 fill outside connector window; existing campaign rows also blank)', is_sample:false, is_deleted:false, created_at:now() }),'OSCR trade insert');
    must(await sb.from('positions').update({ is_closed:true, current_price:'30.28', ib_synced_at:now(), updated_at:now() }).eq('id',c.id),'OSCR close');
    log('   ✓ closed');
  }
}

// ── 2. CRWD intraday round-trip (no position row — closed trade only, like SOFI 07-10) ──
{
  const c={sym:'CRWD', shares:464, entry:187.94, exit:186.23, pl:-799.82, ib:'crwd-rt-588568432'};
  const p=pct(c.entry,c.exit); const ex=await dupe(c.ib);
  log(`— CRWD ROUND-TRIP: ${c.shares}sh ${c.entry}→${c.exit} = -$799.82 (${p}%) = −0.27R vs stated $3k risk | stop_price NULL pending Valen's level ${ex?'(EXISTS skip)':''}`);
  if(WRITE && !ex){
    const row={ user_id:UID, ticker:c.sym, trade_type:'Long', entry_date:TODAY, exit_date:TODAY,
      entry_time:'10:34:03', exit_time:'10:52:53', entry_price:c.entry, exit_price:c.exit, shares:c.shares,
      pl_dollar:c.pl, pl_pct:p, r_mult:-0.27,
      exit_reason:'Manual cut — choppy tape, small loss, standing aside',
      setup:'Pullback', ib_exec_id:c.ib, source:'claude_ibkr',
      notes:'Valen thesis: pullback buy; market choppy → cut at a small loss 18 min in and sat out. Risk budget stated $3,000 → r_mult −0.27 computed from STATED risk (−799.82/3000), not a stop level. NO stop order was on the book at IBKR (manual discretionary cut). stop_price pending: implied ≈ 181.47 (3000/464 below 187.94) — ASK Valen for the real planned stop, never backfill. Fills: BUY 49 @ 187.895 + 415 @ 187.945 (blended 187.9397, 10:34 ET) → SELL 40+107+317 @ 186.23 (10:52:53 ET). Comms $4.19 in. 2nd CRWD campaign this month (prior: +$4.7k close 07-08).',
      entry_gates:{ entry_model:'pullback' },
      is_sample:false, is_deleted:false, created_at:now() };
    let res=await sb.from('trades').insert(row);
    if(res.error && /entry_gates/.test(res.error.message)){ delete row.entry_gates; res=await sb.from('trades').insert(row); log('   (entry_gates column absent — inserted without)'); }
    must(res,'CRWD trade insert');
    log('   ✓ logged');
  }
}

// ── 3. Marks + NTAP trail raise (trailing_stop ONLY — stop_price untouched) ──
const MARKS=[
 {id:1977608, sym:'DDOG', cp:260.23},
 {id:1980808, sym:'NTAP', cp:164.68, trail:'160.50'},
 {id:1977607, sym:'RBRK', cp:83.91},
 {id:1977609, sym:'TWLO', cp:215.48},
];
log('— MARKS (current_price; NTAP trail 160.30→160.50):');
for(const m of MARKS){
  log(`   ${m.sym} → ${m.cp}${m.trail?` trail→${m.trail}`:''}`);
  if(WRITE){
    const upd={ current_price:String(m.cp), ib_synced_at:now(), updated_at:now() };
    if(m.trail) upd.trailing_stop=m.trail;
    must(await sb.from('positions').update(upd).eq('id',m.id),`${m.sym} mark`);
  }
}

if(WRITE){
  log('\n— READ-BACK VERIFY:');
  const {data:pos}=await sb.from('positions').select('symbol,shares,entry_price,current_price,stop_price,trailing_stop').eq('user_id',UID).eq('is_closed',false).order('symbol');
  for(const p of pos){
    const e=+p.entry_price,s=+p.stop_price,c=+p.current_price;
    console.log(`   ${p.symbol}: ${p.shares}sh @${e} cp=${c} trail=${p.trailing_stop} → ${s>0?((c-e)/(e-s)).toFixed(2):'—'}R ${+p.stop_price===+p.trailing_stop?'🔴 STOP==TRAIL':'✓'}`);
  }
  const {data:os}=await sb.from('positions').select('symbol,is_closed,current_price').eq('id',1979371);
  console.log(`   OSCR row: is_closed=${os?.[0]?.is_closed} cp=${os?.[0]?.current_price}`);
  const {data:ct}=await sb.from('trades').select('ticker,shares,pl_dollar,r_mult,entry_time,exit_time').eq('user_id',UID).eq('ib_exec_id','crwd-rt-588568432');
  console.log(`   CRWD trade row: ${JSON.stringify(ct)}`);
  const {data:ot}=await sb.from('trades').select('ticker,shares,pl_dollar,r_mult,position_id').eq('user_id',UID).eq('ib_exec_id','oscr-close-434741786');
  console.log(`   OSCR trade row: ${JSON.stringify(ot)}`);
}
log(`\nDone (${WRITE?'WRITTEN':'dry-run only'}).`);
