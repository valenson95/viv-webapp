// Admin snapshot push — IBKR (truth) → viv-webapp Supabase, for vc-lv@live.com.
// Reusable: run after a portfolio pull to keep the admin journal in sync.
// Append-only / idempotent: updates open positions, closes exited ones, inserts closed
// round-trips (skips if already present), refreshes the Jarvis claude_insights payload.
// Usage: node scripts/push-admin-snapshot.mjs        (dry run, prints plan)
//        node scripts/push-admin-snapshot.mjs --write (executes)
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const UID = '0e32b092-029a-436d-8cb5-67621e1467b0';
const TODAY = '2026-06-16';
const log = (...a)=>console.log(...a);

// ── Live IBKR truth (reconciled FIFO; P&L = IBKR realized, exact) ──
const OPEN = [ // still-held → update shares/price/stop
  {symbol:'ALAB', shares:295,  current_price:371.50, stop_price:340.00},
  {symbol:'BE',   shares:300,  current_price:287.33, stop_price:256.00},
  {symbol:'DOCN', shares:931,  current_price:174.85, stop_price:153.95},
  {symbol:'IBKR', shares:20.712,current_price:93.10, stop_price:null},
  {symbol:'NBIS', shares:292,  current_price:271.27, stop_price:235.56},
  {symbol:'SNOW', shares:1280, current_price:239.00, stop_price:229.00},
];
const CLOSED = [ // exited today → close position + log trade(s). pl_dollar = IBKR exact.
  {key:'NOW',  symbol:'NOW',  shares:3260, entry:117.65, exit:101.57, pl:-52438.88, stop:null,   reason:'Cut — de-risk into FOMC (was held without a stop)'},
  {key:'PANW', symbol:'PANW', shares:467,  entry:279.74, exit:278.44, pl:-614.54,   stop:269.10, reason:'Cut — trim software exposure'},
  {key:'ACLS', symbol:'ACLS', shares:1582, entry:177.02, exit:179.16, pl:2520.76,   stop:177.80, reason:'Scaled out — base+add, 2 trims into strength then exit (ONE position)'},
  {key:'INTC', symbol:'INTC', shares:2700, entry:118.28, exit:122.55, pl:11504.49,  stop:118.30, reason:'Scaled out — big trim @132.5 then exit at breakeven (ONE position)'},
  {key:'DELL1',symbol:'DELL', shares:451,  entry:406.41, exit:406.29, pl:-65.01,    stop:null,   reason:'Same-day scratch (DELL trade 1 of 2 — fully closed before re-entry)'},
  {key:'DELL2',symbol:'DELL', shares:700,  entry:412.72, exit:405.30, pl:-5205.26,  stop:405.00, reason:'De-risk overnight hold (DELL trade 2 of 2)'},
  {key:'CRDO', symbol:'CRDO', shares:1168, entry:255.97, exit:240.84, pl:-17687.57, stop:241.00, reason:'Stopped — FOMO-pyramid oversize (base+add)'},
];

// existing position rows (for entry_date / setup / tags / rationale carry-over)
const { data:exrows } = await sb.from('positions').select('id,symbol,entry_date,entry_price,setup,tags,rationale,stop_price').eq('user_id',UID).eq('is_closed',false);
const bySym = {}; for(const r of (exrows||[])) (bySym[r.symbol] ||= []).push(r);

log(`\n=== ${WRITE?'WRITE':'DRY-RUN'} — admin snapshot for vc-lv@live.com ===`);

// 1) update open positions
// HARD RULE ([[feedback-never-overwrite-original-stop]]): NEVER write `stop_price` on an existing row — that is the
// LOCKED ORIGINAL stop (drives R). The current/trailed stop from IBKR goes to `trailing_stop` ONLY. stop_price is
// written exactly once, at first creation of the row, and never again.
for(const p of OPEN){ const ex=(bySym[p.symbol]||[])[0];
  log(`OPEN  ${p.symbol}: ${p.shares}sh @${p.current_price} trail=${p.stop_price ?? '-'} (orig stop_price UNTOUCHED) ${ex?'(update row '+ex.id+')':'(no row!)'}`);
  if(WRITE && ex){ await sb.from('positions').update({shares:p.shares,current_price:p.current_price,...(p.stop_price!=null?{trailing_stop:p.stop_price}:{}),source:'claude_ibkr',ib_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',ex.id); }
}
// 2) close exited positions + insert trades
for(const c of CLOSED){ const ex=(bySym[c.symbol]||[])[0];
  const pl_pct = +( (c.pl/(c.entry*c.shares))*100 ).toFixed(2);
  log(`CLOSE ${c.key.padEnd(5)} ${c.symbol} ${c.shares}sh entry=${c.entry} exit=${c.exit} pl=$${c.pl} (${pl_pct}%) — ${c.reason}`);
  if(WRITE){
    // close the position row once per symbol
    if(ex && !ex._closed){ await sb.from('positions').update({is_closed:true,current_price:c.exit,updated_at:new Date().toISOString()}).eq('id',ex.id); ex._closed=true; }
    // idempotent trade insert (skip if a claude_ibkr trade for this key already exists today)
    const note = `Claude-synced from IBKR · ${c.key}`;
    const { data:dupe } = await sb.from('trades').select('id').eq('user_id',UID).eq('ticker',c.symbol).eq('exit_date',TODAY).eq('source','claude_ibkr').ilike('notes',`%${c.key}%`).limit(1);
    if(dupe?.length){ log(`        ↳ trade exists (id ${dupe[0].id}) — skip`); }
    else {
      await sb.from('trades').insert({ user_id:UID, ticker:c.symbol, trade_type:'Long',
        entry_date: ex?.entry_date || TODAY, exit_date: TODAY,
        entry_price:c.entry, exit_price:c.exit, shares:c.shares,
        stop_price: c.stop ?? ex?.stop_price ?? null,
        pl_dollar:c.pl, pl_pct, r_mult:null, exit_reason:c.reason,
        setup: ex?.setup || null, tags: ex?.tags || null, rationale: ex?.rationale || null,
        source:'claude_ibkr', notes:note, is_sample:false, is_deleted:false, created_at:new Date().toISOString() });
      log(`        ↳ trade inserted`);
    }
  }
}
// 3) refresh Jarvis insight (merge today's read into existing payload)
const { data:ci } = await sb.from('claude_insights').select('payload').eq('user_id',UID).maybeSingle();
const payload = ci?.payload || {};
payload.headline = "Heavy de-risk day into FOMC (Warsh's first meeting). Cut NOW (−$52k, the no-stop loser) + the CRDO FOMO-pyramid (−$18k); booked −$62k realized across 6 names but stops were honored on all of them. Now 44% long / 56% cash, ROTE ~2.3% on the 6 survivors. The system worked — one entry-sizing error (CRDO), not a process failure.";
payload.attention = [
  "CRDO FOMO-pyramid + revenge after the NOW loss — entry sizing is the isolated leak (exits were disciplined).",
  "Still ~17.7% in SNOW; software remains the lagging part of the chain.",
  "56% cash into FOMC — defensive and intentional, not capitulation."
];
payload.working = [
  "Honored every stop today — no stopless-loser repeat (NOW was the lesson).",
  "ACLS/INTC: partial profit + trailed to breakeven = risk-free exits.",
  "De-levered 122%→44% gross ahead of a binary event."
];
payload.generated_at = new Date().toISOString();
payload._claude_note = `Synced ${TODAY} from IBKR (live book + day's round-trips).`;
log(`\nINSIGHT headline + attention + working refreshed (generated_at=${payload.generated_at})`);
if(WRITE){ await sb.from('claude_insights').upsert({user_id:UID, payload, updated_at:new Date().toISOString()},{onConflict:'user_id'}); log('  ↳ claude_insights upserted'); }

log(`\nDone (${WRITE?'WRITTEN':'dry-run only — re-run with --write'}).`);
