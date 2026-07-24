// Sync 2026-07-15 — shaky-tape day: 3 closes (HIMS BE rt · NTAP BE · RBRK SMA10-break) + 2 new breakouts (AMZU · CHYM).
// From live get_account_trades/positions/orders (2026-07-15 pull), FIFO-reconciled, nets match get_account_positions exactly:
//   HIMS: Breakout. BUY 5000 @ 36.6434 (09:36 ET) → cut BE 36.6546 (11:26 ET), +$1.48 net (~0R). Stop = 15-Jul LoD 35.67 (his words: "stoploss is LoD"), risk $4,867.
//   NTAP: entered 07-06 @ 160.305 (locked stop 155.21) → BE cut 525 @ 160.4643 (11:14 ET), +$79.16 = +0.03R. Market shaky.
//   RBRK: entered 06-29 @ 74.745 (locked stop 72.18) → closed 642 @ 80.9623 (11:27 ET) on SMA10 break, +$3,987.07 = +2.42R.
//   AMZU: Breakout (AMZN 2x lev ETF). BUY 4000 @ 37.3428 blended (10:04 ET). Original stop = 15-Jul LoD 36.40 (risk $3,771), trailed to 37.48 (above cost, risk-free) at 11:46 ET when tape got shaky.
//   CHYM: Breakout. BUY 4500 @ 22.2212 blended (10:19 ET). Original stop = 15-Jul LoD 21.59 (risk $2,840), trailed to 22.35 (risk-free) same minute.
// HARD: stop_price = LOCKED original (LoD), trails → trailing_stop ONLY. Idempotent on ib_exec_id. entry_price = IBKR blended average_price (mistake #8).
// Usage: node scripts/sync-20260715.mjs [--write]
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const TODAY='2026-07-15';
const now=()=>new Date().toISOString();
const log=(...a)=>console.log(...a);
const pct=(e,x)=>+(((x-e)/e)*100).toFixed(2);
const rMult=(e,x,s)=>+(((x-e)/(e-s))).toFixed(2);
async function dupe(ib){ const {data}=await sb.from('trades').select('id').eq('user_id',UID).eq('ib_exec_id',ib).limit(1); return data?.length>0; }
async function must(res,label){ if(res.error){ console.error(`✗ ${label}:`,res.error.message); process.exit(1);} }

log(`\n=== ${WRITE?'WRITE':'DRY-RUN'} — sync 2026-07-15 (HIMS/NTAP BE + RBRK SMA10 closes · AMZU/CHYM opens) ===\n`);

// ── 0. Snapshot backup BEFORE any write ──
if(WRITE){
  const {data:allTr,error:e1}=await sb.from('trades').select('*').eq('user_id',UID);
  const {data:allPos,error:e2}=await sb.from('positions').select('*').eq('user_id',UID);
  if(e1||e2){ console.error('✗ backup read failed', e1?.message||e2?.message); process.exit(1); }
  const path=`${process.env.HOME}/Desktop/AI-OS/trading/backups/2026-07-15-pre-sync.json`;
  writeFileSync(path, JSON.stringify({trades:allTr,positions:allPos},null,1));
  log(`✓ backup: ${path} (${allTr.length} trades, ${allPos.length} positions)`);
}

// ── 1. Closed round-trips / closes ──
const CLOSES=[
  { sym:'HIMS', shares:5000, entry:36.6434, exit:36.6546, stop:35.67, pl:1.48, comm:54.78,
    entryDate:TODAY, et:'09:36:39', xt:'11:26:15', ib:'hims-rt-20260715', setup:'Breakout', posId:null,
    reason:'Cut at breakeven — market shaky (same-day round-trip; stop was 15-Jul LoD 35.67, never threatened)',
    notes:'Breakout entry 5000 sh @ 36.6434 blended (09:36 ET). Stop = LoD 35.67 → risk $4,867 (0.31% NLV). Tape turned shaky (SPY faded from open, 41% up-from-open breadth) → cut whole position at BE 36.6546 (11:26 ET), +$1.48 net. Same shaky-tape sweep as the NTAP BE cut and RBRK SMA10 exit one minute later.' },
  { sym:'NTAP', shares:525, entry:160.305, exit:160.4643, stop:155.21, pl:79.16, comm:4.46,
    entryDate:'2026-07-06', et:null, xt:'11:14:18', ib:'ntap-close-20260715', setup:'Breakout', posId:1980808,
    reason:'Cut at breakeven — market shaky (trail was already at BE 160.50)',
    notes:'Entered 07-06 @ 160.305, locked stop 155.21 (risk $2,675). Trailed to BE 160.50 in a prior session; today cut the whole 525 sh @ 160.4643 (11:14 ET) into the shaky tape, +$79.16 net = +0.03R. Campaign was +9.5% at the 07-14 high (175.50) — gave the open profit back before the cut.' },
  { sym:'RBRK', shares:642, entry:74.745, exit:80.9623, stop:72.18, pl:3987.07, comm:4.41,
    entryDate:'2026-06-29', et:null, xt:'11:27:03', ib:'rbrk-close-20260715', setup:'Breakout', posId:1977607,
    reason:'Closed below SMA10 — trend-following exit per system',
    notes:'Entered 06-29 @ 74.745, locked stop 72.18 (risk $1,647). Rode 16 days; closed all 642 sh @ 80.9623 (11:27 ET) as price broke below the 10-day SMA, +$3,987.07 net = +2.42R vs the locked original. High of campaign ~88 (07-14) → exited ~8.0% off the high.' },
];
for(const c of CLOSES){
  const p=pct(c.entry,c.exit), r=rMult(c.entry,c.exit,c.stop), ex=await dupe(c.ib);
  log(`— ${c.sym} CLOSE: ${c.shares}sh ${c.entry}→${c.exit} = ${c.pl>=0?'+':''}$${c.pl} (${p}%) = ${r>=0?'+':''}${r}R vs stop ${c.stop} ${ex?'(EXISTS skip)':''}`);
  if(WRITE && !ex){
    const row={ user_id:UID, ticker:c.sym, trade_type:'Long', entry_date:c.entryDate, exit_date:TODAY,
      entry_time:c.et, exit_time:c.xt, entry_price:c.entry, exit_price:c.exit, shares:c.shares,
      stop_price:c.stop, stop_locked_at:now(), needs_stop:false, commission:c.comm,
      pl_dollar:c.pl, pl_pct:p, r_mult:r, setup:c.setup, exit_reason:c.reason, notes:c.notes,
      ib_exec_id:c.ib, source:'claude_ibkr', position_id:c.posId,
      is_sample:false, is_deleted:false, created_at:now() };
    if(!row.entry_time) delete row.entry_time;
    const res=await sb.from('trades').insert(row); must(res,`${c.sym} insert`); log('   ✓ logged');
    if(c.posId){ const r2=await sb.from('positions').update({is_closed:true, shares:0, updated_at:now()}).eq('id',c.posId).eq('user_id',UID); must(r2,`${c.sym} position close`); log('   ✓ position row closed'); }
  }
}

// ── 2. New open positions (stop_price = LOCKED LoD original; trail separate) ──
const OPENS=[
  { sym:'AMZU', conid:583996487, shares:4000, entry:37.3428, stop:36.40, trail:37.48, cp:37.80, et:'10:04:13',
    thesis:'Breakout — AMZN daily setup taken via the 2x lev ETF (AMZU) per the lev-ETF playbook. Stop = 15-Jul LoD 36.40 (risk $3,771 = 0.24% NLV). Trailed to 37.48 (above cost → risk-free) at 11:46 ET when the tape got shaky.' },
  { sym:'CHYM', conid:790904952, shares:4500, entry:22.2212, stop:21.59, trail:22.35, cp:22.605, et:'10:19:38',
    thesis:'Breakout — CHYM from the fish-now list (fintech, in-theme adjacent). Stop = 15-Jul LoD 21.59 (risk $2,840 = 0.18% NLV). Trailed to 22.35 (risk-free) at 11:46 ET, same shaky-tape sweep.' },
];
for(const o of OPENS){
  const {data:exist}=await sb.from('positions').select('id,stop_price').eq('user_id',UID).eq('symbol',o.sym).or('is_closed.is.null,is_closed.eq.false').limit(1);
  log(`— ${o.sym} OPEN: ${o.shares}sh @ ${o.entry} · stop ${o.stop} (LoD) · trail ${o.trail} · cp ${o.cp} ${exist?.length?'(row EXISTS — refresh only)':''}`);
  if(WRITE){
    if(exist?.length){
      const res=await sb.from('positions').update({shares:o.shares, entry_price:o.entry, current_price:o.cp, trailing_stop:o.trail, updated_at:now()}).eq('id',exist[0].id); must(res,`${o.sym} refresh`); log('   ✓ refreshed (stop_price untouched)');
    } else {
      const res=await sb.from('positions').insert({ user_id:UID, symbol:o.sym, shares:o.shares, entry_price:o.entry,
        current_price:o.cp, stop_price:o.stop, trailing_stop:o.trail, entry_date:TODAY, entry_time:o.et,
        setup:'Breakout', trade_type:'Long', source:'claude_ibkr', ib_conid:o.conid, notes:o.thesis, tags:[], created_at:now() });
      must(res,`${o.sym} insert`); log('   ✓ position inserted');
    }
  }
}

// ── 3. Mark refresh on carried positions (current_price ONLY — never stops) ──
const MARKS=[{id:1977608,sym:'DDOG',cp:264.885},{id:1983098,sym:'PANW',cp:356.93},{id:1977609,sym:'TWLO',cp:213.89}];
for(const m of MARKS){
  log(`— ${m.sym} mark → ${m.cp}`);
  if(WRITE){ const res=await sb.from('positions').update({current_price:m.cp, updated_at:now()}).eq('id',m.id).eq('user_id',UID); must(res,`${m.sym} mark`); }
}

// ── 4. Verify ──
if(WRITE){
  const {data:pos}=await sb.from('positions').select('symbol,shares,entry_price,stop_price,trailing_stop').eq('user_id',UID).or('is_closed.is.null,is_closed.eq.false');
  log(`\nOPEN after sync: ${(pos||[]).map(p=>`${p.symbol} ${p.shares}sh stop ${p.stop_price}/trail ${p.trailing_stop}`).join(' · ')}`);
  const {data:tr}=await sb.from('trades').select('ticker,pl_dollar,r_mult').eq('user_id',UID).eq('exit_date',TODAY);
  log(`TODAY closed rows: ${(tr||[]).map(t=>`${t.ticker} $${t.pl_dollar} (${t.r_mult}R)`).join(' · ')}`);
}
log(`\n${WRITE?'DONE':'Dry-run only — re-run with --write'}`);
