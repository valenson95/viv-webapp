// Sync today's new/changed book into the webapp admin journal (dynamic, with Valen's theses).
// - INOD/LITE/MRVL: upsert open position (stop_price = ORIGINAL, locked once at creation).
// - DOCN: shares 931->481 (partial stop today); DO NOT touch its stop_price. Log the 450@171.50 stop as a trade.
// - PENG: intraday round-trip -> closed trade.
// HARD RULES: never overwrite an existing stop_price; idempotent on ib_exec_id. Usage: node scripts/sync-new.mjs [--write]
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const TODAY='2026-06-17';
const log=(...a)=>console.log(...a);

const NEW=[
 {symbol:'INOD', shares:1200, entry:108.665, cur:106.14, stop:103.90, setup:'Breakout',
  rationale:'Broke out from daily + weekly trendline; stop at LoD (~EMA9) 103.90. High RS, held up strong despite the market sell-off.'},
 {symbol:'LITE', shares:100, entry:879.05, cur:881.76, stop:null, setup:'Pullback Buy',
  rationale:'Pullback buy drifting toward EMA50(D) + trendline support; plan to re-add on a push/breakout. Good R:R. ⚠️ NO STOP SET YET.'},
 {symbol:'MRVL', shares:336, entry:293.14, cur:292.39, stop:278.35, setup:'Continuation',
  rationale:'Continuation toward today’s high; tight stop at LoD 278.35. Very strong name within the AI narrative.'},
];
// closed / partial trades to journal (linked where a lot stays open)
const CLOSED=[
 {symbol:'PENG', shares:4672, entry:60.40, exit:59.15, pl:-5882.15, setup:'Pullback Buy', ib:'peng-rt-20260617',
  reason:'Cut — early turn-up did not confirm; too aggressive into FOMC, low continuation expected (intraday round-trip).', link:false},
 {symbol:'DOCN', shares:450, entry:178.96, exit:171.50, pl:-3359.27, setup:'VCP', ib:'docn-1394679000',
  reason:'Stopped (partial) — 450 of 931 hit the 171.50 stop; 481 still held.', link:true, partial:true},
];

log(`\n=== ${WRITE?'WRITE':'DRY-RUN'} — sync new book ===`);
const { data:openRows } = await sb.from('positions').select('id,symbol,shares,stop_price').eq('user_id',UID).eq('is_closed',false);
const bySym={}; for(const r of (openRows||[])) (bySym[r.symbol] ||= []).push(r);

// 1) new open positions (upsert; lock stop_price once)
for(const p of NEW){ const ex=(bySym[p.symbol]||[])[0];
  log(`OPEN ${p.symbol}: ${p.shares}sh @${p.entry} stop(orig)=${p.stop ?? 'NONE ⚠️'} setup=${p.setup} ${ex?'(update '+ex.id+', stop_price '+(ex.stop_price?'KEPT '+ex.stop_price:'set '+p.stop)+')':'(INSERT new)'}`);
  if(WRITE){
    if(ex){ await sb.from('positions').update({ shares:p.shares, current_price:p.cur, setup:p.setup, rationale:p.rationale,
        ...(ex.stop_price?{}:{stop_price:p.stop}), source:'claude_ibkr', ib_synced_at:new Date().toISOString(), updated_at:new Date().toISOString() }).eq('id',ex.id); }
    else { await sb.from('positions').insert({ user_id:UID, symbol:p.symbol, shares:p.shares, entry_price:p.entry, current_price:p.cur,
        entry_date:TODAY, stop_price:p.stop, setup:p.setup, rationale:p.rationale, source:'claude_ibkr', is_closed:false,
        ib_synced_at:new Date().toISOString(), created_at:new Date().toISOString() }); }
    log('  ✓');
  }
}
// 2) DOCN shares 931 -> 481 (do NOT touch stop_price)
{ const ex=(bySym['DOCN']||[])[0];
  log(`DOCN: shares ${ex?ex.shares:'?'} -> 481 (stop_price UNTOUCHED)`);
  if(WRITE && ex){ await sb.from('positions').update({ shares:481, current_price:182.52, ib_synced_at:new Date().toISOString(), updated_at:new Date().toISOString() }).eq('id',ex.id); log('  ✓'); }
}
// 3) closed / partial trades (idempotent on ib_exec_id)
for(const c of CLOSED){ const ex=(bySym[c.symbol]||[])[0];
  const pl_pct=+((c.pl/(c.entry*c.shares))*100).toFixed(2);
  const { data:dupe } = await sb.from('trades').select('id').eq('user_id',UID).eq('ib_exec_id',c.ib).limit(1);
  log(`TRADE ${c.symbol}: ${c.shares}sh ${c.entry}->${c.exit} = ${c.pl>=0?'+':''}$${c.pl} (${pl_pct}%) ${c.partial?'[Partial Trim, link '+(ex?ex.id:'?')+']':'[round-trip]'} ${dupe?.length?'(EXISTS skip)':''}`);
  if(WRITE && !dupe?.length){
    await sb.from('trades').insert({ user_id:UID, ticker:c.symbol, trade_type:'Long', entry_date:TODAY, exit_date:TODAY,
      entry_price:c.entry, exit_price:c.exit, shares:c.shares, stop_price:null, pl_dollar:c.pl, pl_pct, r_mult:null,
      exit_reason:c.partial?'Partial Trim':c.reason, setup:c.setup, rationale:c.reason,
      ...(c.link&&ex?{position_id:ex.id}:{}), ib_exec_id:c.ib, source:'claude_ibkr',
      notes:`Claude-synced from IBKR · ${c.reason}`, is_sample:false, is_deleted:false, created_at:new Date().toISOString() });
    log('  ✓');
  }
}
log(`\nDone (${WRITE?'WRITTEN':'dry-run only'}).`);
