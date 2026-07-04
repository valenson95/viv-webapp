// Restore Valen's LOCKED ORIGINAL stops (drives R) + set current trailed stop separately.
// HARD RULE: stop_price = ORIGINAL (locked, never overwritten again). trailing_stop = current.
// Originals provided by Valen 2026-06-17: NBIS 223.50, BE 244.60.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const FIX=[ {symbol:'NBIS', orig:223.50, trail:240.00}, {symbol:'BE', orig:244.60, trail:256.00} ];
const log=(...a)=>console.log(...a);
log(`\n=== ${WRITE?'WRITE':'DRY-RUN'} — restore locked original stops ===`);
for(const f of FIX){
  const { data } = await sb.from('positions').select('id,entry_price,stop_price,trailing_stop').eq('user_id',UID).eq('symbol',f.symbol).eq('is_closed',false);
  if(!data?.length){ log(`!! no open ${f.symbol} row`); continue; }
  const r=data[0]; const ep=parseFloat(r.entry_price);
  const Rmult = ((/*will display once price applied*/0)); // info only
  log(`${f.symbol}: stop_price ${r.stop_price} -> ${f.orig} (ORIGINAL, locked) | trailing_stop ${r.trailing_stop} -> ${f.trail} | entry ${ep} | initRisk%=${(((ep-f.orig)/ep)*100).toFixed(2)}%`);
  if(WRITE){
    const u=await sb.from('positions').update({ stop_price:f.orig, trailing_stop:f.trail, updated_at:new Date().toISOString() }).eq('id',r.id);
    log(u.error?`  ERROR: ${u.error.message}`:'  updated ✓');
  }
}
log(`\nDone (${WRITE?'WRITTEN':'dry-run'}).`);
