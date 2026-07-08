// Sync 2026-07-08 IBKR activity → webapp admin journal (dynamic, reconciled to the penny vs IBKR + webapp state).
// Closes: CRWD (trail/EMA9), ROKU (trailing stop, remaining lot), WYFI/DELL/DLLL (intraday round-trips).
// Trims: NTAP 1050->525, TWLO 455->325 (Partial Trim rows w/ realized; stop_price UNTOUCHED).
// HARD RULES: never overwrite an existing locked stop_price; idempotent on ib_exec_id; append-only.
// Usage: node scripts/sync-20260708.mjs [--write]
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const TODAY='2026-07-08';
const now=()=>new Date().toISOString();
const log=(...a)=>console.log(...a);
const pct=(entry,exit)=>+(((exit-entry)/entry)*100).toFixed(2);

// Positions that EXIST in webapp and are now FULLY closed today
const CLOSE_POS=[
 {id:1977307, sym:'CRWD', shares:400, entry:173.68125, exit:185.54, pl:4739.89, ext:'2.76x',
  reason:'Hit Trailing Stop — broke below EMA9', ib:'crwd-close-727597604'},
 {id:1979369, sym:'ROKU', shares:1650, entry:140.455, exit:140.521, pl:95.39, ext:'n/a',
  reason:'Hit Trailing Stop (GTC) — remaining lot, ~breakeven', ib:'roku-close-941951176'},
];
// Intraday round-trips (no open position row) — insert closed trade only
const ROUNDTRIP=[
 {sym:'WYFI', shares:900, entry:35.88, exit:36.2101, pl:287.28, setup:'Breakout',
  reason:'Cut — low-RVOL entry (did not check prior volume before entering)', ib:'wyfi-close-727597554'},
 {sym:'DELL', shares:380, entry:436.30, exit:436.68, pl:137.11, setup:'Breakout',
  reason:'Closed at breakeven — rotated exposure into DLLL (2x)', ib:'dell-close-727597563'},
 {sym:'DLLL', shares:2682, entry:25.2215, exit:23.86, pl:-3680.14, setup:'Continuation',
  reason:'Cut same-day — DELL→DLLL (2x) rotation reversed, -5.4% [CONFIRM: stop-out vs manual]', ib:'dlll-close-727597589'},
];
// Partial trims — reduce open position shares (KEEP stop_price), insert linked Partial Trim row
const TRIMS=[
 {id:1980808, sym:'NTAP', trim:525, newShares:525, entry:160.305, exit:162.54, pl:1168.89, ext:'2.83x', ib:'ntap-trim-727597594'},
 {id:1977609, sym:'TWLO', trim:130, newShares:325, entry:197.985, exit:212.08, pl:1830.76, ext:'1.65x', ib:'twlo-trim-727597581'},
];

log(`\n=== ${WRITE?'WRITE':'DRY-RUN'} — sync 2026-07-08 ===\n`);
async function dupe(ib){ const {data}=await sb.from('trades').select('id').eq('user_id',UID).eq('ib_exec_id',ib).limit(1); return data?.length>0; }

log('— CLOSES (position → is_closed):');
for(const c of CLOSE_POS){
  const p=pct(c.entry,c.exit); const ex=await dupe(c.ib);
  log(`  ${c.sym}: ${c.shares}sh ${c.entry}→${c.exit} = +$${c.pl} (${p}%) ext ${c.ext} | ${c.reason} ${ex?'(trade EXISTS skip)':''}`);
  if(WRITE){
    if(!ex) await sb.from('trades').insert({ user_id:UID, ticker:c.sym, trade_type:'Long', entry_date:null, exit_date:TODAY,
      entry_price:c.entry, exit_price:c.exit, shares:c.shares, stop_price:null, pl_dollar:c.pl, pl_pct:p, r_mult:null,
      exit_reason:c.reason, position_id:c.id, ib_exec_id:c.ib, source:'claude_ibkr',
      notes:`Claude-synced IBKR 07-08 · exit ext ${c.ext} · ${c.reason}`, is_sample:false, is_deleted:false, created_at:now() });
    await sb.from('positions').update({ is_closed:true, current_price:c.exit, ib_synced_at:now(), updated_at:now() }).eq('id',c.id);
    log('    ✓ closed');
  }
}

log('\n— INTRADAY ROUND-TRIPS (closed trade only):');
for(const c of ROUNDTRIP){
  const p=pct(c.entry,c.exit); const ex=await dupe(c.ib);
  log(`  ${c.sym}: ${c.shares}sh ${c.entry}→${c.exit} = ${c.pl>=0?'+':''}$${c.pl} (${p}%) | ${c.reason} ${ex?'(EXISTS skip)':''}`);
  if(WRITE && !ex){
    await sb.from('trades').insert({ user_id:UID, ticker:c.sym, trade_type:'Long', entry_date:TODAY, exit_date:TODAY,
      entry_price:c.entry, exit_price:c.exit, shares:c.shares, stop_price:null, pl_dollar:c.pl, pl_pct:p, r_mult:null,
      exit_reason:c.reason, setup:c.setup, ib_exec_id:c.ib, source:'claude_ibkr',
      notes:`Claude-synced IBKR 07-08 · intraday round-trip · ${c.reason}`, is_sample:false, is_deleted:false, created_at:now() });
    log('    ✓ logged');
  }
}

log('\n— TRIMS (reduce shares, stop UNTOUCHED, linked Partial Trim):');
for(const t of TRIMS){
  const p=pct(t.entry,t.exit); const ex=await dupe(t.ib);
  log(`  ${t.sym}: trim ${t.trim}sh @${t.exit} = +$${t.pl} (${p}%) ext ${t.ext} · shares→${t.newShares} (stop kept) ${ex?'(trade EXISTS skip)':''}`);
  if(WRITE){
    if(!ex) await sb.from('trades').insert({ user_id:UID, ticker:t.sym, trade_type:'Long', entry_date:null, exit_date:TODAY,
      entry_price:t.entry, exit_price:t.exit, shares:t.trim, stop_price:null, pl_dollar:t.pl, pl_pct:p, r_mult:null,
      exit_reason:'Partial Trim', position_id:t.id, ib_exec_id:t.ib, source:'claude_ibkr',
      notes:`Claude-synced IBKR 07-08 · derisk trim · exit ext ${t.ext}`, is_sample:false, is_deleted:false, created_at:now() });
    await sb.from('positions').update({ shares:t.newShares, ib_synced_at:now(), updated_at:now() }).eq('id',t.id);
    log('    ✓ trimmed + realized row');
  }
}
log(`\nDone (${WRITE?'WRITTEN':'dry-run only'}).`);
