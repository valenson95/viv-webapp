// Sync 2026-07-14 entries (logged 07-15) — 3 new breakout-family entries, all stops = 14-Jul LOW, ~$3k risk each.
// From live get_account_trades/positions/orders (2026-07-15 pull), reconciled FIFO to net:
//   PANW: Breakout. BUY 232 sh @ 345.25 (09:38 ET) — OPEN. Initial stop 330.29 (14-Jul low), risk $3,471.
//         SL moved to BREAKEVEN 345.50 intraday (gap-risk, choppy tape). Live cp 355.86 → +0.71R.
//   BB:   Undercut & Rally. BUY 6500 @ 11.105 (09:45 ET) → BE-stop 11.145 hit 13:21 ET. +$193.20 net (+0.08R).
//         Initial stop 10.62 (14-Jul low), risk $3,152. BE stop saved it — stock then fell to 10.62 LoD.
//   DELL: Breakout. BUY 200 @ 456.32 (10:58 ET) → BE-stop 456.23 hit 12:16 ET. -$23.30 net (~0R).
//         Initial stop 441.51 (14-Jul low), risk $2,962.
//   → BB & DELL round-tripped SAME DAY (BE stops tagged in the chop); only PANW carries. Net of 3: +$170.
// Marks (live 07-15): DDOG 271 · NTAP 175.50 · RBRK 88 · TWLO 217.85 (trails already at BE from prior syncs).
// HARD: stop_price = LOCKED initial (14-Jul low), NEVER the BE; BE → trailing_stop. Idempotent on ib_exec_id.
// Usage: node scripts/sync-20260714.mjs [--write]
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const TODAY='2026-07-14';
const now=()=>new Date().toISOString();
const log=(...a)=>console.log(...a);
const pct=(e,x)=>+(((x-e)/e)*100).toFixed(2);
const rMult=(e,x,s)=>+(((x-e)/(e-s))).toFixed(2);
async function dupe(ib){ const {data}=await sb.from('trades').select('id').eq('user_id',UID).eq('ib_exec_id',ib).limit(1); return data?.length>0; }
async function must(res,label){ if(res.error){ console.error(`✗ ${label}:`,res.error.message); process.exit(1);} }

log(`\n=== ${WRITE?'WRITE':'DRY-RUN'} — sync 2026-07-14 (PANW open · BB & DELL BE round-trips) ===\n`);

// ── 0. Snapshot backup BEFORE any write ──
if(WRITE){
  const {data:allTr,error:e1}=await sb.from('trades').select('*').eq('user_id',UID);
  const {data:allPos,error:e2}=await sb.from('positions').select('*').eq('user_id',UID);
  if(e1||e2){ console.error('✗ backup read failed', e1?.message||e2?.message); process.exit(1); }
  const path=`${process.env.HOME}/Desktop/AI-OS/trading/backups/2026-07-14-pre-sync.json`;
  writeFileSync(path, JSON.stringify({trades:allTr,positions:allPos},null,1));
  log(`✓ backup: ${path} (${allTr.length} trades, ${allPos.length} positions)`);
}

// ── 1. BB closed round-trip (Undercut & Rally) ──
{
  const c={sym:'BB', shares:6500, entry:11.105, exit:11.145, stop:10.62, pl:193.20, comm:67.80,
    ib:'bb-rt-755381715', et:'09:45:52', xt:'13:21:28'};
  const p=pct(c.entry,c.exit), r=rMult(c.entry,c.exit,c.stop), ex=await dupe(c.ib);
  log(`— BB  CLOSE: ${c.shares}sh ${c.entry}→${c.exit} = +$${c.pl} (${p}%) = +${r}R vs stop ${c.stop} | risk $3,152 ${ex?'(EXISTS skip)':''}`);
  if(WRITE && !ex){
    const row={ user_id:UID, ticker:c.sym, trade_type:'Long', entry_date:TODAY, exit_date:TODAY,
      entry_time:c.et, exit_time:c.xt, entry_price:c.entry, exit_price:c.exit, shares:c.shares,
      stop_price:c.stop, stop_locked_at:now(), needs_stop:false, commission:c.comm,
      pl_dollar:c.pl, pl_pct:p, r_mult:r, setup:'Undercut & Rally',
      exit_reason:'Hit stop at breakeven (11.145) — choppy tape; stock then fell to the 14-Jul low 10.62 (BE stop worked)',
      ib_exec_id:c.ib, source:'claude_ibkr',
      notes:'Undercut & rally. Entry 6500 sh @ 11.105 (09:45 ET). Initial stop = 14-Jul candle low 10.62 → risk $3,152 (~$3k). Moved to breakeven 11.145 intraday (gap-risk, choppy tape) → tagged 13:21 ET for +$193.20 net. The BE move saved it: BB then dropped to 10.62 LoD. Sized to ~$3k risk (0.20% NLV).',
      entry_gates:{ entry_model:'other' }, is_sample:false, is_deleted:false, created_at:now() };
    let res=await sb.from('trades').insert(row);
    if(res.error && /entry_gates/.test(res.error.message)){ delete row.entry_gates; res=await sb.from('trades').insert(row); }
    must(res,'BB insert'); log('   ✓ logged');
  }
}

// ── 2. DELL closed round-trip (Breakout) ──
{
  const c={sym:'DELL', shares:200, entry:456.32, exit:456.23, stop:441.51, pl:-23.30, comm:3.92,
    ib:'dell-rt-755381723', et:'10:58:02', xt:'12:16:40'};
  const p=pct(c.entry,c.exit), r=rMult(c.entry,c.exit,c.stop), ex=await dupe(c.ib);
  log(`— DELL CLOSE: ${c.shares}sh ${c.entry}→${c.exit} = -$${Math.abs(c.pl)} (${p}%) = ${r}R vs stop ${c.stop} | risk $2,962 ${ex?'(EXISTS skip)':''}`);
  if(WRITE && !ex){
    const row={ user_id:UID, ticker:c.sym, trade_type:'Long', entry_date:TODAY, exit_date:TODAY,
      entry_time:c.et, exit_time:c.xt, entry_price:c.entry, exit_price:c.exit, shares:c.shares,
      stop_price:c.stop, stop_locked_at:now(), needs_stop:false, commission:c.comm,
      pl_dollar:c.pl, pl_pct:p, r_mult:r, setup:'Breakout',
      exit_reason:'Hit stop at breakeven (456.23) — choppy tape',
      ib_exec_id:c.ib, source:'claude_ibkr',
      notes:'Breakout. Entry 200 sh @ 456.32 (10:58 ET). Initial stop = 14-Jul candle low 441.51 → risk $2,962 (~$3k). Moved to breakeven intraday (gap-risk) → tagged 12:16 ET for -$23.30 (~0R, essentially flat). Sized to ~$3k risk (0.18% NLV).',
      entry_gates:{ entry_model:'breakout' }, is_sample:false, is_deleted:false, created_at:now() };
    let res=await sb.from('trades').insert(row);
    if(res.error && /entry_gates/.test(res.error.message)){ delete row.entry_gates; res=await sb.from('trades').insert(row); }
    must(res,'DELL insert'); log('   ✓ logged');
  }
}

// ── 3. PANW new OPEN position (Breakout) — locked stop 330.29, BE trail 345.50 ──
{
  const c={sym:'PANW', shares:232, entry:345.25, stop:330.29, trail:345.50, cp:355.86, conid:110619459,
    et:'09:38:23', comm:1.16};
  const r=rMult(c.entry,c.cp,c.stop);
  const {data:exist}=await sb.from('positions').select('id').eq('user_id',UID).eq('symbol','PANW').eq('is_closed',false).limit(1);
  log(`— PANW OPEN: ${c.shares}sh @${c.entry} stop=${c.stop}(LOCKED) trail=${c.trail}(BE) cp=${c.cp} → +${r}R | risk $3,471 ${exist?.length?'(EXISTS skip)':''}`);
  if(WRITE && !exist?.length){
    must(await sb.from('positions').insert({ user_id:UID, symbol:c.sym, entry_date:TODAY, entry_time:c.et,
      shares:c.shares, entry_price:c.entry, current_price:String(c.cp), stop_price:c.stop, trailing_stop:String(c.trail),
      setup:'Breakout', trade_type:'Long', source:'claude_ibkr', ib_conid:c.conid, commission:c.comm, is_closed:false,
      entry_gates:{ entry_model:'breakout' }, ib_synced_at:now(), created_at:now(), updated_at:now(),
      notes:'Breakout. 232 sh @ 345.25 (09:38 ET). Initial stop = 14-Jul candle low 330.29 (LOCKED, drives R) → risk $3,471 (0.22% NLV). SL moved to breakeven 345.50 intraday (gap-risk, choppy tape) = trailing_stop. Only survivor of the 3 breakout-family entries (BB/DELL BE-stopped same day).' }),'PANW position insert');
    log('   ✓ opened');
  }
}

// ── 4. Marks refresh on existing opens (current_price only; trails already at BE from prior syncs) ──
const MARKS=[
 {id:1977608, sym:'DDOG', cp:271},
 {id:1980808, sym:'NTAP', cp:175.50},
 {id:1977607, sym:'RBRK', cp:88},
 {id:1977609, sym:'TWLO', cp:217.85},
];
log('— MARKS (current_price refresh):');
for(const m of MARKS){
  log(`   ${m.sym} → ${m.cp}`);
  if(WRITE) must(await sb.from('positions').update({ current_price:String(m.cp), ib_synced_at:now(), updated_at:now() }).eq('id',m.id),`${m.sym} mark`);
}

// ── 5. READ-BACK VERIFY ──
if(WRITE){
  log('\n— READ-BACK VERIFY (open book):');
  const {data:pos}=await sb.from('positions').select('symbol,shares,entry_price,current_price,stop_price,trailing_stop').eq('user_id',UID).eq('is_closed',false).order('symbol');
  for(const p of pos){ const e=+p.entry_price,s=+p.stop_price,cp=+p.current_price;
    console.log(`   ${p.symbol}: ${p.shares}sh @${e} cp=${cp} stop=${s} trail=${p.trailing_stop} → ${s>0?((cp-e)/(e-s)).toFixed(2):'—'}R`); }
  const {data:ct}=await sb.from('trades').select('ticker,shares,entry_price,exit_price,stop_price,pl_dollar,r_mult,setup,entry_time,exit_time').eq('user_id',UID).eq('entry_date',TODAY).order('ticker');
  console.log('   NEW 07-14 trades:'); for(const t of ct) console.log(`     ${t.ticker} ${t.shares}sh ${t.entry_price}→${t.exit_price} stop=${t.stop_price} $${t.pl_dollar} ${t.r_mult}R ${t.setup}`);
}
log(`\nDone (${WRITE?'WRITTEN':'dry-run only'}).`);
