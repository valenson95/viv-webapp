import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb=createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const iso=d=>{ if(!d) return ''; if(d.includes('-')) return d.slice(0,10); const[m,da,y]=d.split('/'); return `20${y.slice(-2)}-${String(m).padStart(2,'0')}-${String(da).padStart(2,'0')}`; };
// open tickers (campaigns still running) - exclude from closed-trade winrate
const {data:open}=await sb.from('positions').select('symbol').eq('user_id',UID).eq('is_closed',false);
const openSet=new Set((open||[]).map(o=>o.symbol));
const {data:tr}=await sb.from('trades').select('ticker,entry_date,exit_date,shares,pl_dollar,exit_reason').eq('user_id',UID).eq('is_deleted',false);
// dedup by signature
const seen=new Set(), rows=[];
for(const t of tr){ const k=`${t.ticker}|${iso(t.exit_date)}|${t.shares}|${Math.round(+t.pl_dollar)}`; if(seen.has(k))continue; seen.add(k); rows.push(t); }
// group into campaigns by ticker+entry_date
const camp={};
for(const t of rows){ const k=`${t.ticker}|${iso(t.entry_date)}`; (camp[k]??={ticker:t.ticker,entry:iso(t.entry_date),pl:0,exit:'',n:0}); camp[k].pl+=+t.pl_dollar; camp[k].n++; if(iso(t.exit_date)>camp[k].exit)camp[k].exit=iso(t.exit_date); }
// closed campaigns only (ticker not currently open)
let camps=Object.values(camp).filter(c=>!openSet.has(c.ticker)).sort((a,b)=>b.exit.localeCompare(a.exit));
const last20=camps.slice(0,20);
console.log('=== LAST 20 CLOSED CAMPAIGNS (most recent first) ===');
for(const c of last20) console.log(`${c.exit}  ${c.ticker.padEnd(6)} ${c.pl>=0?'W':'L'}  $${c.pl.toFixed(0).padStart(8)}  (${c.n} fills)`);
const W=last20.filter(c=>c.pl>0), L=last20.filter(c=>c.pl<=0);
const sum=a=>a.reduce((s,c)=>s+c.pl,0);
const avg=a=>a.length?sum(a)/a.length:0;
const wr=W.length/last20.length*100;
const aw=avg(W), al=Math.abs(avg(L));
console.log('\n=== STATS (last 20 closed campaigns) ===');
console.log(`Win rate:        ${W.length}W / ${L.length}L = ${wr.toFixed(0)}%`);
console.log(`Net P&L:         $${sum(last20).toFixed(0)}`);
console.log(`Avg win:         $${aw.toFixed(0)}   |  Avg loss: -$${al.toFixed(0)}`);
console.log(`Payoff ratio:    ${al?(aw/al).toFixed(2):'-'} : 1  (avg win / avg loss)`);
console.log(`Expectancy/trade: $${((wr/100)*aw-(1-wr/100)*al).toFixed(0)}`);
console.log(`Biggest win:     $${Math.max(...last20.map(c=>c.pl)).toFixed(0)}  |  Biggest loss: $${Math.min(...last20.map(c=>c.pl)).toFixed(0)}`);
// streak (most recent run)
let streak=0,dir=last20[0].pl>0; for(const c of last20){ if((c.pl>0)===dir)streak++; else break; }
console.log(`Current streak:  ${streak} ${dir?'wins':'losses'} in a row (most recent)`);
