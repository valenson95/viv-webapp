import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb=createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const iso=d=>{ if(!d)return''; if(d.includes('-'))return d.slice(0,10); const[m,da,y]=d.split('/'); return `20${y.slice(-2)}-${String(m).padStart(2,'0')}-${String(da).padStart(2,'0')}`; };
const {data:tr}=await sb.from('trades').select('ticker,entry_date,exit_date,shares,pl_dollar,exit_reason').eq('user_id',UID).eq('is_deleted',false);
// dedup
const seen=new Set(),rows=[];
for(const t of tr){const k=`${t.ticker}|${iso(t.exit_date)}|${t.shares}|${Math.round(+t.pl_dollar)}`; if(seen.has(k))continue; seen.add(k); rows.push(t);}
// campaign reconcile
const camp={};
for(const t of rows){const k=`${t.ticker}|${iso(t.entry_date)}`; (camp[k]??={ticker:t.ticker,pl:0,n:0,exit:''}); camp[k].pl+=+t.pl_dollar; camp[k].n++; if(iso(t.exit_date)>camp[k].exit)camp[k].exit=iso(t.exit_date);}
const all=Object.values(camp).sort((a,b)=>b.exit.localeCompare(a.exit));
const tot=all.reduce((s,c)=>s+c.pl,0), W=all.filter(c=>c.pl>0),L=all.filter(c=>c.pl<=0);
console.log(`ALL realized campaigns (deduped): ${all.length}  |  ${W.length}W / ${L.length}L = ${(W.length/all.length*100).toFixed(0)}% WR`);
console.log(`TOTAL realized P&L (all-time in journal): $${tot.toFixed(0)}`);
console.log(`Sum of wins: +$${W.reduce((s,c)=>s+c.pl,0).toFixed(0)}  |  Sum of losses: -$${Math.abs(L.reduce((s,c)=>s+c.pl,0)).toFixed(0)}`);
