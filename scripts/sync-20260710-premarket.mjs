// Sync 2026-07-10 (pre-market) — IBKR 07-09 activity + 07-10 pre-market marks → webapp admin journal.
// Activity since last sync (07-08 15:53 UTC), from live get_account_trades DAYS_7:
//   DDOG: SELL 190 @ 256.09 (LIMIT, 07-09 13:32 UTC) realized +$1,429.61 → 50% trim, 380→190 sh.
//   FTNT: SELL 60@153.225 + 239@153.28 + 100@152.94 + 1@152.76 (STOP GTC, 07-09 13:30 UTC)
//         = 400 sh @ wavg 153.1855, realized +$984.84 → FULL CLOSE (trailing stop 153.00 hit).
// Pre-market marks (07-10 ~09:10 ET, IBKR snapshots): DDOG 273.00 · MRNA 77.50 · NTAP 171.58
//   · OSCR 31.36 · RBRK 89.80 · TWLO 226.00 → positions.current_price (UI derives live R from these
//   vs LOCKED stop_price). Avg costs verified == IBKR average_price on all 6 (no entry_price change).
// HARD RULES: stop_price NEVER written; trim/close rows carry position_id + ib_exec_id (idempotent);
//   read-back verify every write; IBKR ticker (broker-paid interest shares) excluded per ignore rule.
// Usage: node --env-file=.env.local scripts/sync-20260710-premarket.mjs [--write]
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const ACT_DATE='2026-07-09';
const now=()=>new Date().toISOString();
const log=(...a)=>console.log(...a);
const pct=(entry,exit)=>+(((exit-entry)/entry)*100).toFixed(2);

// FULL CLOSE — FTNT stopped out 07-09 (trailing stop GTC)
const CLOSE_POS=[
 {id:1977308, sym:'FTNT', shares:400, entry:150.715, stop:144.4, exit:153.1855, pl:984.84,
  reason:'Hit Trailing Stop (GTC 153.00) — remaining 400 sh stopped at the 07-09 open',
  ib:'ftnt-close-699498882'},
];
// PARTIAL TRIM — DDOG 50% derisk (stop_price UNTOUCHED)
const TRIMS=[
 {id:1977608, sym:'DDOG', trim:190, newShares:190, entry:248.555, exit:256.09, pl:1429.61,
  ib:'ddog-trim-1470075055'},
];
// Pre-market marks 07-10 → current_price on the remaining open book
const MARKS=[
 {id:1977608, sym:'DDOG', cp:273.00},
 {id:1977305, sym:'MRNA', cp:77.50},
 {id:1980808, sym:'NTAP', cp:171.58},
 {id:1979371, sym:'OSCR', cp:31.36},
 {id:1977607, sym:'RBRK', cp:89.80},
 {id:1977609, sym:'TWLO', cp:226.00},
];

log(`\n=== ${WRITE?'WRITE':'DRY-RUN'} — sync 2026-07-10 pre-market ===\n`);
async function dupe(ib){ const {data}=await sb.from('trades').select('id').eq('user_id',UID).eq('ib_exec_id',ib).limit(1); return data?.length>0; }
async function must(res,label){ if(res.error){ console.error(`✗ ${label}:`,res.error.message); process.exit(1);} }

log('— CLOSE (position → is_closed):');
for(const c of CLOSE_POS){
  const p=pct(c.entry,c.exit);
  const r=+((c.exit-c.entry)/(c.entry-c.stop)).toFixed(2);
  const ex=await dupe(c.ib);
  log(`  ${c.sym}: ${c.shares}sh ${c.entry}→${c.exit} = +$${c.pl} (${p}%) = ${r}R (orig stop ${c.stop}) | ${c.reason} ${ex?'(trade EXISTS skip)':''}`);
  if(WRITE){
    if(!ex) must(await sb.from('trades').insert({ user_id:UID, ticker:c.sym, trade_type:'Long', entry_date:'2026-06-26', exit_date:ACT_DATE,
      entry_price:c.entry, exit_price:c.exit, shares:c.shares, stop_price:c.stop, pl_dollar:c.pl, pl_pct:p, r_mult:r,
      exit_reason:c.reason, position_id:c.id, ib_exec_id:c.ib, source:'claude_ibkr',
      notes:`Claude-synced IBKR 07-09 · trailing stop hit · wavg of 4 fills 153.225/153.28/152.94/152.76`, is_sample:false, is_deleted:false, created_at:now() }),'FTNT trade insert');
    must(await sb.from('positions').update({ is_closed:true, current_price:c.exit, ib_synced_at:now(), updated_at:now() }).eq('id',c.id),'FTNT close');
    log('    ✓ closed');
  }
}

log('\n— TRIM (reduce shares, stop UNTOUCHED, linked Partial Trim):');
for(const t of TRIMS){
  const p=pct(t.entry,t.exit); const ex=await dupe(t.ib);
  log(`  ${t.sym}: trim ${t.trim}sh @${t.exit} = +$${t.pl} (${p}%) · shares→${t.newShares} (50% of orig 380, stop kept) ${ex?'(trade EXISTS skip)':''}`);
  if(WRITE){
    if(!ex) must(await sb.from('trades').insert({ user_id:UID, ticker:t.sym, trade_type:'Long', entry_date:null, exit_date:ACT_DATE,
      entry_price:t.entry, exit_price:t.exit, shares:t.trim, stop_price:null, pl_dollar:t.pl, pl_pct:p, r_mult:null,
      exit_reason:'Partial Trim', position_id:t.id, ib_exec_id:t.ib, source:'claude_ibkr',
      notes:`Claude-synced IBKR 07-09 · 50% derisk trim (190 of 380) via limit 256.09`, is_sample:false, is_deleted:false, created_at:now() }),'DDOG trim insert');
    must(await sb.from('positions').update({ shares:String(t.newShares), ib_synced_at:now(), updated_at:now() }).eq('id',t.id),'DDOG shares');
    log('    ✓ trimmed + realized row');
  }
}

log('\n— PRE-MARKET MARKS (current_price only — UI derives R vs locked stop):');
for(const m of MARKS){
  log(`  ${m.sym} → ${m.cp}`);
  if(WRITE) must(await sb.from('positions').update({ current_price:String(m.cp), ib_synced_at:now(), updated_at:now() }).eq('id',m.id),`${m.sym} mark`);
}

if(WRITE){
  log('\n— READ-BACK VERIFY:');
  const {data:pos}=await sb.from('positions').select('id,symbol,shares,entry_price,current_price,stop_price,trailing_stop,is_closed').eq('user_id',UID).eq('is_closed',false).order('symbol');
  for(const p of pos){
    const e=+p.entry_price,s=+p.stop_price,c=+p.current_price;
    const r=s>0?((c-e)/(e-s)).toFixed(2):'—';
    console.log(`  ${p.symbol}: ${p.shares}sh @${e} cp=${c} stop=${p.stop_price} trail=${p.trailing_stop} → ${r}R ${+p.stop_price===+p.trailing_stop?'🔴 STOP==TRAIL':'✓'}`);
  }
  const {data:ftnt}=await sb.from('positions').select('symbol,is_closed,current_price').eq('id',1977308);
  console.log(`  FTNT row: is_closed=${ftnt?.[0]?.is_closed} cp=${ftnt?.[0]?.current_price}`);
}
log(`\nDone (${WRITE?'WRITTEN':'dry-run only'}).`);
