import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb=createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
// FIFO truth: remaining 500 MRVL = the ADD lot @ 310.96 (base sold first on trims/stop). Real stop = 283 (the 278.35 was wrong/stale).
await sb.from('positions').update({entry_price:310.96, stop_price:283, trailing_stop:283, current_price:279.80, updated_at:new Date().toISOString()}).eq('user_id',UID).eq('symbol','MRVL').eq('is_closed',false);
const {data}=await sb.from('positions').select('symbol,shares,entry_price,stop_price,trailing_stop').eq('user_id',UID).eq('symbol','MRVL').eq('is_closed',false);
console.log('MRVL fixed:',JSON.stringify(data));
console.log('real cost 310.96 (FIFO=add lot) | stop 283 | risk to stop = (310.96-283)*500 = $13,980 (NOT $5k); gapping through stop pre-mkt.');
