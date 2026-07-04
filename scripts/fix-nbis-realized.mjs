// Fix: NBIS realized profit not showing on Open Positions.
// Cause: the webapp computes "Realized" by matching `trades` rows to the open lot
// (Stage 1 = position_id link; Stage 2 = ticker + exit_date>=entry_date / "Partial Trim" override).
// The admin sync only logs FULLY-CLOSED names, so NBIS's partial trim was never written to `trades`.
// This script: (1) corrects NBIS open shares 292->209, (2) inserts yesterday's trim as a linked
// "Partial Trim" trade row so the Realized column shows +$4,128.66. Idempotent on ib_exec_id.
// Usage: node scripts/fix-nbis-realized.mjs         (dry run)
//        node scripts/fix-nbis-realized.mjs --write (execute)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const UID = '0e32b092-029a-436d-8cb5-67621e1467b0';

// ── yesterday's NBIS trim (IBKR truth, order 1394679018) ──
const TRIM = {
  ticker:'NBIS', shares:125, entry_price:235.56, exit_price:268.61,
  exit_date:'2026-06-16', pl_dollar:4128.66, pl_pct:14.02,
  ib_exec_id:'nbis-1394679018', reason:'Partial Trim',
};
const NBIS_NOW = { shares:209, current_price:278.87, stop_price:240.00 };

const log=(...a)=>console.log(...a);
log(`\n=== ${WRITE?'WRITE':'DRY-RUN'} — fix NBIS realized for vc-lv@live.com ===`);

// locate the open NBIS position row
const { data:pos, error:perr } = await sb.from('positions')
  .select('id,symbol,entry_date,shares,stop_price,current_price')
  .eq('user_id',UID).eq('symbol','NBIS').eq('is_closed',false);
if(perr){ log('positions query error:', perr.message); process.exit(1); }
if(!pos?.length){ log('!! no open NBIS position row found — abort'); process.exit(1); }
if(pos.length>1){ log('!! multiple open NBIS lots — ambiguous, aborting:', pos.map(p=>p.id)); process.exit(1); }
const P = pos[0];
log(`open NBIS row: id=${P.id} entry_date=${P.entry_date} shares(was)=${P.shares} stop(was)=${P.stop_price}`);

// idempotency: is this trim already journaled?
const { data:dupe } = await sb.from('trades').select('id,ib_exec_id,pl_dollar')
  .eq('user_id',UID).eq('ticker','NBIS').eq('ib_exec_id',TRIM.ib_exec_id).limit(1);
const exists = !!dupe?.length;

log(`\nPLAN:`);
log(` 1) UPDATE positions id=${P.id}: shares ${P.shares} -> ${NBIS_NOW.shares}, current_price -> ${NBIS_NOW.current_price}, stop_price -> ${NBIS_NOW.stop_price}`);
log(` 2) ${exists?`SKIP trade insert (already exists id ${dupe[0].id})`:`INSERT trade: NBIS ${TRIM.shares}sh @${TRIM.exit_price} (entry ${TRIM.entry_price}) = ${TRIM.pl_dollar>=0?'+':''}$${TRIM.pl_dollar} [${TRIM.reason}, position_id=${P.id}]`}`);

if(WRITE){
  const u = await sb.from('positions').update({
    shares:NBIS_NOW.shares, current_price:NBIS_NOW.current_price, stop_price:NBIS_NOW.stop_price,
    source:'claude_ibkr', ib_synced_at:new Date().toISOString(), updated_at:new Date().toISOString()
  }).eq('id',P.id);
  log(u.error?`  position update ERROR: ${u.error.message}`:'  position updated ✓');

  if(!exists){
    const ins = await sb.from('trades').insert({
      user_id:UID, ticker:'NBIS', trade_type:'Long',
      entry_date:P.entry_date || TRIM.exit_date, exit_date:TRIM.exit_date,
      entry_price:TRIM.entry_price, exit_price:TRIM.exit_price, shares:TRIM.shares,
      stop_price:null, pl_dollar:TRIM.pl_dollar, pl_pct:TRIM.pl_pct, r_mult:null,
      exit_reason:TRIM.reason, position_id:P.id, ib_exec_id:TRIM.ib_exec_id,
      source:'claude_ibkr', notes:'Claude-synced partial trim from IBKR · NBIS order 1394679018',
      is_sample:false, is_deleted:false, created_at:new Date().toISOString()
    });
    log(ins.error?`  trade insert ERROR: ${ins.error.message}`:'  trade inserted ✓');
  }
}
log(`\nDone (${WRITE?'WRITTEN':'dry-run only — re-run with --write'}).`);
