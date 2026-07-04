// Full reconcile sync for 2026-06-18 session. Closes round-trips, updates open positions (KEEP original stop_price,
// write current to trailing_stop), logs BE/MRVL partial trims. Idempotent on ib_exec_id. Usage: node ... [--write]
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const log=(...a)=>console.log(...a);

const CLOSED=[
 {symbol:'SNOW', shares:1280, entry:243.33, exit:228.40, pl:-18996, ib:'snow-close-20260618', date:'2026-06-18', setup:'Pullback Buy', reason:'Stopped — FOMO-pyramid oversize (3.5×); stop honored ~229'},
 {symbol:'NVT',  shares:3000, entry:178.62, exit:175.37, pl:-9794,  ib:'nvt-close-20260618',  date:'2026-06-18', setup:'Breakout', reason:'Stopped — HELD PAST the ~177 stop to 175.37 (~2× planned)'},
 {symbol:'UMAC', shares:11650, entry:24.05, exit:23.30, pl:-8634,  ib:'umac-close-20260618', date:'2026-06-18', setup:'Pullback Buy', reason:'Stopped — FOMO-via-peer (Eric) + buy-limit into falling knife + liquidity slippage'},
 {symbol:'DELL', shares:1360, entry:411.0, exit:408.0, pl:-4092,  ib:'dell-close-20260618', date:'2026-06-18', setup:'Breakout', reason:'Stopped same day — forced non-clean entry (impatience/revenge to make money back)'},
];
const OPEN=[
 {symbol:'ALAB', shares:295,    price:419.90, trail:340},
 {symbol:'BE',   shares:200,    price:329.35, trail:256},
 {symbol:'DOCN', shares:481,    price:172.88, trail:165.50},
 {symbol:'LITE', shares:100,    price:847.98, trail:816.37},
 {symbol:'MRVL', shares:700,    price:313.57, trail:302},
 {symbol:'NBIS', shares:209,    price:285.35, trail:255},
 {symbol:'IBKR', shares:20.712, price:95.96,  trail:null},
];
const TRIMS=[
 {symbol:'BE',   shares:100, entry:256.34, exit:285.24, pl:2888.89, pct:11.28, ib:'be-trim-20260616',  date:'2026-06-16'},
 {symbol:'BE',   shares:100, entry:256.34, exit:322.00, pl:6564.82, pct:25.62, ib:'be-trim-20260618',  date:'2026-06-18'},
 {symbol:'MRVL', shares:1015,entry:302.00, exit:305.96, pl:2888.83, pct:1.31,  ib:'mrvl-trim-20260618',date:'2026-06-18'},
];

log(`\n=== ${WRITE?'WRITE':'DRY-RUN'} — full 2026-06-18 sync ===`);
const { data:rows } = await sb.from('positions').select('id,symbol,entry_date,stop_price').eq('user_id',UID).eq('is_closed',false);
const bySym={}; for(const r of (rows||[])) (bySym[r.symbol] ||= []).push(r);

// 1) closed round-trips
for(const c of CLOSED){ const ex=(bySym[c.symbol]||[])[0];
  log(`CLOSE ${c.symbol} ${c.shares}sh ${c.entry}->${c.exit} = ${c.pl} ${ex?'(close row '+ex.id+')':'(no open row — insert trade only)'}`);
  if(WRITE){
    if(ex){ await sb.from('positions').update({is_closed:true,current_price:c.exit,updated_at:new Date().toISOString()}).eq('id',ex.id); }
    const {data:d}=await sb.from('trades').select('id').eq('user_id',UID).eq('ib_exec_id',c.ib).limit(1);
    if(!d?.length) await sb.from('trades').insert({user_id:UID,ticker:c.symbol,trade_type:'Long',entry_date:c.date,exit_date:c.date,entry_price:c.entry,exit_price:c.exit,shares:c.shares,stop_price:null,pl_dollar:c.pl,pl_pct:+((c.pl/(c.entry*c.shares))*100).toFixed(2),r_mult:null,exit_reason:c.reason,setup:c.setup,source:'claude_ibkr',ib_exec_id:c.ib,notes:'Claude-synced 6/18 close',is_sample:false,is_deleted:false,created_at:new Date().toISOString()});
    log('  ✓');
  }
}
// 2) open position updates (KEEP stop_price; write trailing_stop)
for(const p of OPEN){ const ex=(bySym[p.symbol]||[])[0];
  log(`OPEN  ${p.symbol}: ${p.shares}sh @${p.price} trail=${p.trail??'-'} ${ex?'(row '+ex.id+', orig stop '+ex.stop_price+' KEPT)':'(NO ROW!)'}`);
  if(WRITE && ex){ await sb.from('positions').update({shares:p.shares,current_price:p.price,...(p.trail!=null?{trailing_stop:p.trail}:{}),source:'claude_ibkr',ib_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',ex.id); }
}
// 3) partial trims (linked)
for(const t of TRIMS){ const ex=(bySym[t.symbol]||[])[0];
  const {data:d}=await sb.from('trades').select('id').eq('user_id',UID).eq('ib_exec_id',t.ib).limit(1);
  log(`TRIM  ${t.symbol} ${t.shares}sh @${t.exit} = +$${t.pl} ${d?.length?'(exists skip)':(ex?'link '+ex.id:'no row')}`);
  if(WRITE && !d?.length && ex){ await sb.from('trades').insert({user_id:UID,ticker:t.symbol,trade_type:'Long',entry_date:ex.entry_date||t.date,exit_date:t.date,entry_price:t.entry,exit_price:t.exit,shares:t.shares,stop_price:null,pl_dollar:t.pl,pl_pct:t.pct,r_mult:null,exit_reason:'Partial Trim',position_id:ex.id,ib_exec_id:t.ib,source:'claude_ibkr',notes:'Claude-synced trim',is_sample:false,is_deleted:false,created_at:new Date().toISOString()}); log('  ✓'); }
}
log(`\nDone (${WRITE?'WRITTEN':'dry-run'}).`);
