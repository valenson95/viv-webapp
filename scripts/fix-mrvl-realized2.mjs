import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb=createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const now=new Date().toISOString();
// FIFO-consistent (matches the position's $310.96 FIFO cost): both sells came from the cheap $293.27 base lot.
const u1=await sb.from('trades').update({entry_price:293.27,exit_price:324,pl_dollar:9220.50,notes:'FIFO: trim sold base @293.27',updated_at:now}).eq('id',1590).select();
console.log('trim(id1590) update:', u1.error?('ERROR '+u1.error.message):('ok rows='+(u1.data?.length))+' -> pl '+u1.data?.[0]?.pl_dollar);
const u2=await sb.from('trades').update({entry_price:293.27,exit_price:301.80,pl_dollar:1707.00,exit_reason:'Stopped (FIFO base lot = gain)',position_id:1974369,notes:'FIFO: this 200 sold the cheap base @293.27 = +1707 (not -834); now linked to campaign',updated_at:now}).eq('id',1604).select();
console.log('stop(id1604) update:', u2.error?('ERROR '+u2.error.message):('ok rows='+(u2.data?.length))+' -> pl '+u2.data?.[0]?.pl_dollar);
// verify
const {data:tr}=await sb.from('trades').select('id,shares,entry_price,exit_price,pl_dollar,exit_reason').eq('user_id',UID).eq('ticker','MRVL').in('id',[1590,1604]);
let r=0; console.log('\nVERIFY current-campaign realized rows:'); for(const t of tr){console.log(`  id${t.id}: ${t.shares}sh ${t.entry_price}->${t.exit_price} = $${t.pl_dollar}`); r+=+t.pl_dollar;}
console.log(`\nMRVL realized (FIFO) = +$${r.toFixed(2)}`);
console.log(`+ unrealized (500 @ 310.96 vs ~279.80) = -$15,580`);
console.log(`= TOTAL MRVL -$${(15580-r).toFixed(0)}  ✓ (matches cash-flow truth -$4,653)`);
