// Sync 2026-07-15b — evening pass: AMZU + CHYM trailing stops TAGGED (full exits, near-BE green) + TWLO trail raised to 208.80.
// From live pull (2026-07-16 MYT): AMZU 4000 sold @ 37.4831 avg 15:32 ET (trail 37.48) = +$537.14 net (+0.15R vs locked 36.40).
//                                  CHYM 4500 sold @ 22.3339 avg 14:57 ET (trail 22.35) = +$481.97 net (+0.18R vs locked 21.59).
// No other new fills after 16:00Z. Book after: DDOG · PANW · TWLO (+IBKR scrap). TWLO trailing_stop 198.00 → 208.80 (order 15:55Z).
// HARD: stop_price stays the LOCKED LoD originals on the closed rows; trails were the exit mechanism, recorded in notes.
// Usage: node scripts/sync-20260715b.mjs [--write]
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

log(`\n=== ${WRITE?'WRITE':'DRY-RUN'} — sync 2026-07-15b (AMZU/CHYM trail exits · TWLO trail 208.80) ===\n`);

if(WRITE){
  const {data:allTr}=await sb.from('trades').select('*').eq('user_id',UID);
  const {data:allPos}=await sb.from('positions').select('*').eq('user_id',UID);
  const path=`${process.env.HOME}/Desktop/AI-OS/trading/backups/2026-07-15b-pre-sync.json`;
  writeFileSync(path, JSON.stringify({trades:allTr,positions:allPos},null,1));
  log(`✓ backup: ${path} (${allTr.length} trades, ${allPos.length} positions)`);
}

const CLOSES=[
  { sym:'AMZU', shares:4000, entry:37.3428, exit:37.4831, stop:36.40, pl:537.14, comm:23.88,
    et:'10:04:13', xt:'15:32:29', ib:'amzu-close-20260715',
    reason:'Trailing stop 37.48 tagged — no follow-through in choppy tape (cut at near-BE by design)',
    notes:'5-min ORB breakout (AMZN 2x lev ETF), personal idea. Entry 4000 @ 37.3428 (10:04 ET), locked stop = LoD 36.40 (risk $3,771 = 0.24% NLV). Moved stop above cost to 37.48 at 11:46 ET when tape got shaky; the trail tagged 15:32 ET for +$537.14 net (+0.15R). Intent was "must work intraday immediately" — it stalled, the risk-free trail did the cutting.' },
  { sym:'CHYM', shares:4500, entry:22.2212, exit:22.3339, stop:21.59, pl:481.97, comm:25.46,
    et:'10:19:38', xt:'14:57:13', ib:'chym-close-20260715',
    reason:'Trailing stop 22.35 tagged — no follow-through in choppy tape (cut at near-BE by design)',
    notes:'5-min ORB breakout (fish-list fintech), personal idea. Entry 4500 @ 22.2212 (10:19 ET), locked stop = LoD 21.59 (risk $2,840 = 0.18% NLV). Trailed above cost to 22.35 at 11:46 ET; tagged 14:57 ET (avg fill 22.3339, ~1c slippage across 57 fills) for +$481.97 net (+0.18R).' },
];
for(const c of CLOSES){
  const p=pct(c.entry,c.exit), r=rMult(c.entry,c.exit,c.stop), ex=await dupe(c.ib);
  log(`— ${c.sym} CLOSE: ${c.shares}sh ${c.entry}→${c.exit} = +$${c.pl} (${p}%) = +${r}R vs locked ${c.stop} ${ex?'(EXISTS skip)':''}`);
  if(WRITE && !ex){
    const {data:posRow}=await sb.from('positions').select('id').eq('user_id',UID).eq('symbol',c.sym).or('is_closed.is.null,is_closed.eq.false').limit(1);
    const posId=posRow?.[0]?.id||null;
    const res=await sb.from('trades').insert({ user_id:UID, ticker:c.sym, trade_type:'Long', entry_date:TODAY, exit_date:TODAY,
      entry_time:c.et, exit_time:c.xt, entry_price:c.entry, exit_price:c.exit, shares:c.shares,
      stop_price:c.stop, stop_locked_at:now(), needs_stop:false, commission:c.comm,
      pl_dollar:c.pl, pl_pct:p, r_mult:r, setup:'Breakout', exit_reason:c.reason, notes:c.notes,
      ib_exec_id:c.ib, source:'claude_ibkr', position_id:posId,
      entry_gates:{ entry_model:'breakout', trigger:'5min ORB', stop_basis:'LoD', intent:'risk small, must work intraday immediately' },
      is_sample:false, is_deleted:false, created_at:now() });
    must(res,`${c.sym} insert`); log(`   ✓ logged (position_id ${posId})`);
    if(posId){ const r2=await sb.from('positions').update({is_closed:true, shares:0, updated_at:now()}).eq('id',posId); must(r2,`${c.sym} position close`); log('   ✓ position row closed'); }
  }
}

// TWLO trail raise + mark refresh (current_price + trailing_stop ONLY — locked stops untouched)
const MARKS=[{id:1977608,sym:'DDOG',cp:264.46},{id:1983098,sym:'PANW',cp:354.71},{id:1977609,sym:'TWLO',cp:211.54,trail:208.80}];
for(const m of MARKS){
  log(`— ${m.sym} mark → ${m.cp}${m.trail?` · trail → ${m.trail}`:''}`);
  if(WRITE){ const body={current_price:m.cp, updated_at:now()}; if(m.trail) body.trailing_stop=m.trail;
    const res=await sb.from('positions').update(body).eq('id',m.id).eq('user_id',UID); must(res,`${m.sym} update`); }
}

if(WRITE){
  const {data:pos}=await sb.from('positions').select('symbol,shares,stop_price,trailing_stop').eq('user_id',UID).or('is_closed.is.null,is_closed.eq.false');
  log(`\nOPEN after sync: ${(pos||[]).map(p=>`${p.symbol} ${p.shares}sh stop ${p.stop_price}/trail ${p.trailing_stop}`).join(' · ')}`);
  const {data:tr}=await sb.from('trades').select('ticker,pl_dollar,r_mult').eq('user_id',UID).eq('exit_date',TODAY);
  log(`07-15 closed rows: ${(tr||[]).map(t=>`${t.ticker} $${t.pl_dollar} (${t.r_mult}R)`).join(' · ')}`);
}
log(`\n${WRITE?'DONE':'Dry-run only — re-run with --write'}`);
