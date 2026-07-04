import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb=createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
// stop_price = LOCKED original (untouched). trailing_stop = live CURRENT stop, or null if current==original (not trailed).
const TRAIL={ BE:280, MRVL:283, LITE:null };  // ALAB already 365; LITE current==orig 816.37 -> null (not trailed)
for(const [sym,t] of Object.entries(TRAIL)){
  await sb.from('positions').update({trailing_stop:t, updated_at:new Date().toISOString()}).eq('user_id',UID).eq('symbol',sym).eq('is_closed',false);
  console.log(`${sym}: trailing_stop -> ${t===null?'null (not trailed; current=original)':t} (original stop_price untouched)`);
}
