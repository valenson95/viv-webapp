import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb=createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
// ALAB: original stop $340 CONFIRMED by Valen (keep). Current live stop raised to $365 -> trailing_stop.
await sb.from('positions').update({stop_price:340, trailing_stop:365, updated_at:new Date().toISOString()}).eq('user_id',UID).eq('symbol','ALAB').eq('is_closed',false);
const {data}=await sb.from('positions').select('symbol,entry_price,stop_price,trailing_stop').eq('user_id',UID).eq('symbol','ALAB').eq('is_closed',false);
console.log('ALAB now:',JSON.stringify(data));
console.log('orig stop 340 (locked, confirmed) | trail 365 (current live) | R uses 340.');
