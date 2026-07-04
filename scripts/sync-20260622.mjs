import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const WRITE=process.argv.includes('--write');
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb=createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const now=new Date().toISOString();
const log=(...a)=>console.log(...a);

// NEW positions today (IBKR-true). stop_price = LOCKED original (=entry-stop/LOD); trailing_stop=null (no trail yet).
const NEW=[
 {symbol:'APLD', shares:2100, entry:47.85, price:46.06, stop:45.51, setup:'VCP / PDH+trendline breakout',
  rationale:'Neocloud data-center infra (power/land/building); pre-profit, market pricing future. VCP tightening: inside bar + lowest 3-mo vol + off EMA9/10. Breakout on PDH/trendline, SL at LOD 45.51. RS 6 (weak/spec) - size small.'},
 {symbol:'CLSK', shares:5000, entry:18.205, price:18.395, stop:17.42, setup:'5-min ORB (chased)',
  rationale:'Inside-bar Thu low vol; 5-min ORB breakout (slightly extended - chased), SL at LOD 17.42. Neocloud breakout continuation. RS 9, pure BTC miner w/ NO AI contracts yet = weakest setup, spec/tiny.'},
 {symbol:'ON', shares:781, entry:128.655, price:131.5, stop:125.13, setup:'5-min ORB / range breakout',
  rationale:'SiC play, the STRONGER name vs WOLF (RS Wed/Thu). 5-min ORB range breakout, SL at LOD 125.13. RS 72, profitable = the right SiC pick. Sold off intraday - watch stop.'},
];
log(`\n=== ${WRITE?'WRITE':'DRY-RUN'} sync 2026-06-22 ===`);
for(const p of NEW){
  const {data:ex}=await sb.from('positions').select('id').eq('user_id',UID).eq('symbol',p.symbol).eq('is_closed',false);
  const row={user_id:UID,symbol:p.symbol,shares:p.shares,entry_price:p.entry,current_price:p.price,stop_price:p.stop,trailing_stop:null,entry_date:'2026-06-22',setup:p.setup,rationale:p.rationale,source:'claude_ibkr',is_closed:false,ib_synced_at:now,updated_at:now};
  log(`${p.symbol} NEW: ${p.shares}sh @${p.entry} stop ${p.stop} | "${p.rationale.slice(0,60)}..."`);
  if(WRITE){ if(ex?.length){ await sb.from('positions').update(row).eq('id',ex[0].id);} else { await sb.from('positions').insert(row);} log('  ✓'); }
}
// NBIS add -> 459 @ 268.14 blended; rationale
log(`NBIS: 209->459sh, avg ->268.14 (added 250@295.37)`);
if(WRITE){ await sb.from('positions').update({shares:459,entry_price:268.14,current_price:288.41,rationale:'ADD 250@295.37 to leader - pullback to prior ATH, 5-min breakout above all MAs, SL at PDL ~275.60. RS 98 elite leader, leadership continuation. ⚠️ add-tranche resting stop NOT yet placed (only base 209@255).',source:'claude_ibkr',ib_synced_at:now,updated_at:now}).eq('user_id',UID).eq('symbol','NBIS').eq('is_closed',false); log('  ✓'); }
// MRVL add tranche stopped -> 500 left; log the stop-out
log(`MRVL: add 200 stopped @301.80 (-834.35) -> 500 left`);
if(WRITE){
  await sb.from('positions').update({shares:500,current_price:307.39,ib_synced_at:now,updated_at:now}).eq('user_id',UID).eq('symbol','MRVL').eq('is_closed',false);
  const {data:d}=await sb.from('trades').select('id').eq('user_id',UID).eq('ib_exec_id','mrvl-addstop-20260622').limit(1);
  if(!d?.length) await sb.from('trades').insert({user_id:UID,ticker:'MRVL',trade_type:'Long',entry_date:'2026-06-18',exit_date:'2026-06-22',entry_price:310.96,exit_price:301.80,shares:200,pl_dollar:-834.35,exit_reason:'Stopped - add tranche (SL 302)',setup:'base+add',source:'claude_ibkr',ib_exec_id:'mrvl-addstop-20260622',notes:'Add lot stop hit; base 500 remains (stop 283)',is_sample:false,is_deleted:false,created_at:now});
  log('  ✓');
}
// NTAP stopped out (closed round-trip)
log(`NTAP: entered 600@163.64, STOPPED 600@~159.2 (-2670.77)`);
if(WRITE){
  const {data:d}=await sb.from('trades').select('id').eq('user_id',UID).eq('ib_exec_id','ntap-rt-20260622').limit(1);
  if(!d?.length) await sb.from('trades').insert({user_id:UID,ticker:'NTAP',trade_type:'Long',entry_date:'2026-06-22',exit_date:'2026-06-22',entry_price:163.64,exit_price:159.21,shares:600,pl_dollar:-2670.77,exit_reason:'Stopped at LOD',setup:'5-min ORB / bull-flag',rationale:'Bull-flag/EMA20-retest continuation, 5-min ORB @163.64, SL at LOD. Daily flag not yet broken (anticipatory). SIZING ERROR: wanted $5k risk but TV sizer wrong -> entered 600 (half, ~$2.5k risk).',source:'claude_ibkr',ib_exec_id:'ntap-rt-20260622',notes:'process-correct loss (honored stop)',is_sample:false,is_deleted:false,created_at:now});
  log('  ✓');
}
log(`\nDone (${WRITE?'WRITTEN':'dry-run'}).`);
