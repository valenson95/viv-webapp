// Sync 2026-07-10 (second pull, ~10:00 ET) — MRNA full close + SOFI intraday round-trip + live marks.
// From live get_account_trades TODAY (all fills verified, position now 0 on both):
//   MRNA: SELL 100@71.39 + 14@71.4185 + 100@71.4185 (STOP GTC ~71.40) = 214 sh wavg 71.405
//         realized +$1,871.11 → FINAL LEG of the ORIGINAL-1050 campaign (836 sh trimmed before
//         for +$12,629; campaign total ≈ +$14,500). R on locked orig stop 59.5 = +2.77R.
//   SOFI: intraday round-trip. BUY 8800 @ 19.725 (09:36:56 ET) → 3-stop unwind:
//         2933 @ 19.485 (−D/3) · 2933 @ 19.26 (−2D/3) · 2934 cut manually @ 19.06 (full stop 19.03 = LoD).
//         D = 0.695 (LoD 19.03 confirmed on 5-min bars) → 1R = $6,116 → realized −$4,112.14 = −0.67R
//         = the designed 3-stop worst case. NO adverse slippage: stop fills at trigger, final third
//         ABOVE the full stop (saved $88); comms $93.26. Valen thesis (2026-07-10): entered per rule
//         on 2x run-rate; hindsight — below SMA200 + off-theme; expected ~$3.7k loss (sizing anchor
//         D≈0.625 vs stops anchored at LoD D=0.695 — mismatch explains the gap, not slippage).
// Marks (live ~09:56 ET): DDOG 264.22 · NTAP 175.05 · OSCR 31.23 · RBRK 88.26 · TWLO 222.38.
// HARD RULES: stop_price never written on positions; idempotent on ib_exec_id; read-back verify.
// Usage: node --env-file=.env.local scripts/sync-20260710b.mjs [--write]
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const TODAY='2026-07-10';
const now=()=>new Date().toISOString();
const log=(...a)=>console.log(...a);
const pct=(entry,exit)=>+(((exit-entry)/entry)*100).toFixed(2);
async function dupe(ib){ const {data}=await sb.from('trades').select('id').eq('user_id',UID).eq('ib_exec_id',ib).limit(1); return data?.length>0; }
async function must(res,label){ if(res.error){ console.error(`✗ ${label}:`,res.error.message); process.exit(1);} }

log(`\n=== ${WRITE?'WRITE':'DRY-RUN'} — sync 2026-07-10b (MRNA close · SOFI round-trip · marks) ===\n`);

// ── MRNA full close (final leg of ORIGINAL-1050 campaign) ──
{
  const c={id:1977305, sym:'MRNA', shares:214, entry:62.655, stop:59.5, exit:71.405, pl:1871.11,
    reason:'Hit Trailing Stop (GTC ~71.40) — final 214 sh of ORIGINAL 1050 campaign', ib:'mrna-close-434741749'};
  const p=pct(c.entry,c.exit); const r=+((c.exit-c.entry)/(c.entry-c.stop)).toFixed(2); const ex=await dupe(c.ib);
  log(`— MRNA CLOSE: ${c.shares}sh ${c.entry}→${c.exit} = +$${c.pl} (${p}%) = +${r}R | ${c.reason} ${ex?'(EXISTS skip)':''}`);
  if(WRITE){
    if(!ex) must(await sb.from('trades').insert({ user_id:UID, ticker:c.sym, trade_type:'Long', entry_date:'2026-06-26', exit_date:TODAY,
      entry_price:c.entry, exit_price:c.exit, shares:c.shares, stop_price:c.stop, pl_dollar:c.pl, pl_pct:p, r_mult:r,
      exit_reason:c.reason, position_id:c.id, ib_exec_id:c.ib, source:'claude_ibkr',
      notes:'Claude-synced IBKR 07-10 · trailing stop 71.50 hit (fills 71.39/71.4185) · campaign total realized ≈ +$14,500 (836 sh prior trims +$12,629 + this leg +$1,871)', is_sample:false, is_deleted:false, created_at:now() }),'MRNA trade insert');
    must(await sb.from('positions').update({ is_closed:true, current_price:c.exit, ib_synced_at:now(), updated_at:now() }).eq('id',c.id),'MRNA close');
    log('   ✓ closed');
  }
}

// ── SOFI intraday round-trip (no position row existed — closed trade only) ──
{
  const c={sym:'SOFI', shares:8800, entry:19.725, stop:19.03, exit:19.26831, pl:-4112.14, ib:'sofi-rt-1301222323'};
  const p=pct(c.entry,c.exit); const ex=await dupe(c.ib);
  log(`— SOFI ROUND-TRIP: ${c.shares}sh ${c.entry}→${c.exit.toFixed(4)} = -$4112.14 (${p}%) = -0.67R (D=0.695, 1R=$6,116) ${ex?'(EXISTS skip)':''}`);
  if(WRITE && !ex){
    must(await sb.from('trades').insert({ user_id:UID, ticker:c.sym, trade_type:'Long', entry_date:TODAY, exit_date:TODAY,
      entry_price:c.entry, exit_price:+c.exit.toFixed(4), shares:c.shares, stop_price:c.stop, pl_dollar:c.pl, pl_pct:p, r_mult:-0.67,
      exit_reason:'3-stop stop-out — full structure (thirds at 19.485 / 19.26 / manual 19.06 above the 19.03 full stop)',
      setup:'Breakout', ib_exec_id:c.ib, source:'claude_ibkr',
      notes:'Valen thesis: entered per rule on 2x run-rate. Hindsight: below SMA200 + off-theme — not a great trade. Execution clean: NO adverse slippage (stop fills at trigger; final third cut 19.06 > 19.03 full stop, saved $88; comms $93). Expected ~$3.7k vs actual $4.1k = sizing-anchor mismatch (sized off D≈0.625 / ~19.10 anchor; stops anchored at LoD 19.03, D=0.695 → 1R $6,116 not $5,500). Entry-gate audit: RVOL 2x ✓ but LoD-dist 0.695 = 76% ATR(0.92) FAILS the ≤60% gate; entry 09:37 (pre-10:00) without the ≥3x override; chase 0.245 over 5-min ORH 19.48 ≈ 0.27 ATR > 0.1 cap.',
      is_sample:false, is_deleted:false, created_at:now() }),'SOFI trade insert');
    log('   ✓ logged');
  }
}

// ── Live marks on the remaining open book ──
const MARKS=[
 {id:1977608, sym:'DDOG', cp:264.22},
 {id:1980808, sym:'NTAP', cp:175.05},
 {id:1979371, sym:'OSCR', cp:31.23},
 {id:1977607, sym:'RBRK', cp:88.26},
 {id:1977609, sym:'TWLO', cp:222.38},
];
log('— MARKS (current_price only):');
for(const m of MARKS){
  log(`   ${m.sym} → ${m.cp}`);
  if(WRITE) must(await sb.from('positions').update({ current_price:String(m.cp), ib_synced_at:now(), updated_at:now() }).eq('id',m.id),`${m.sym} mark`);
}

if(WRITE){
  log('\n— READ-BACK VERIFY:');
  const {data:pos}=await sb.from('positions').select('symbol,shares,entry_price,current_price,stop_price,trailing_stop').eq('user_id',UID).eq('is_closed',false).order('symbol');
  for(const p of pos){
    const e=+p.entry_price,s=+p.stop_price,c=+p.current_price;
    console.log(`   ${p.symbol}: ${p.shares}sh @${e} cp=${c} → ${s>0?((c-e)/(e-s)).toFixed(2):'—'}R ${+p.stop_price===+p.trailing_stop?'🔴 STOP==TRAIL':'✓'}`);
  }
  const {data:mr}=await sb.from('positions').select('symbol,is_closed,current_price').eq('id',1977305);
  console.log(`   MRNA row: is_closed=${mr?.[0]?.is_closed} cp=${mr?.[0]?.current_price}`);
  const {data:sf}=await sb.from('trades').select('ticker,shares,pl_dollar,r_mult').eq('user_id',UID).eq('ib_exec_id','sofi-rt-1301222323');
  console.log(`   SOFI trade row: ${JSON.stringify(sf)}`);
}
log(`\nDone (${WRITE?'WRITTEN':'dry-run only'}).`);
