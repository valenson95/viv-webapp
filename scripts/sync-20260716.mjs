// Sync 2026-07-16 — FULL de-risk to cash: DDOG + PANW + TWLO all closed 09:32–09:41 ET (manual sells, all ABOVE their trails).
//   TWLO: 325 @ 209.1674 avg (09:32 ET) = +$3,631.18 net = +2.16R vs locked 192.82 (entry 197.985, 06-29)
//   DDOG: 190 @ 258.16      (09:41 ET) = +$1,822.90 net = +1.12R vs locked 240.00 (entry 248.555, 06-29)
//   PANW: 232 @ 350.97      (09:41 ET) = +$1,323.49 net = +0.38R vs locked 330.29 (entry 345.253, 07-14)
// Book after: FLAT (IBKR scrap only). No resting orders. Exit reason pending Valen's one-liner.
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const now=()=>new Date().toISOString();
const pct=(e,x)=>+(((x-e)/e)*100).toFixed(2);
const rMult=(e,x,s)=>+(((x-e)/(e-s))).toFixed(2);
async function dupe(ib){ const {data}=await sb.from('trades').select('id').eq('user_id',UID).eq('ib_exec_id',ib).limit(1); return data?.length>0; }
async function must(res,l){ if(res.error){ console.error(`✗ ${l}:`,res.error.message); process.exit(1);} }
console.log(`\n=== ${WRITE?'WRITE':'DRY-RUN'} — sync 2026-07-16 (full de-risk: DDOG/PANW/TWLO closed) ===\n`);
if(WRITE){
  const {data:t}=await sb.from('trades').select('*').eq('user_id',UID);
  const {data:p}=await sb.from('positions').select('*').eq('user_id',UID);
  const path=`${process.env.HOME}/Desktop/AI-OS/trading/backups/2026-07-16-pre-sync.json`;
  writeFileSync(path, JSON.stringify({trades:t,positions:p},null,1));
  console.log(`✓ backup: ${path} (${t.length} trades, ${p.length} positions)`);
}
const CLOSES=[
  { sym:'TWLO', posId:1977609, shares:325, entry:197.985, exit:209.1674, stop:192.82, pl:3631.18, comm:3.09, ed:'2026-06-29', xt:'09:32:51',
    ib:'twlo-close-20260716', notes:'Entered 06-29 @ 197.985, locked stop 192.82 (risk $1,679). Trailed 198→208.80; sold ALL 325 manually @ 209.1674 (09:32 ET, above the trail) into the full de-risk sweep. +$3,631 net = +2.16R. Campaign high ~217.85 (07-14).' },
  { sym:'DDOG', posId:1977608, shares:190, entry:248.555, exit:258.16, stop:240.00, pl:1822.90, comm:2.05, ed:'2026-06-29', xt:'09:41:03',
    ib:'ddog-close-20260716', notes:'Entered 06-29 @ 248.555, locked stop 240 (risk $1,625). Trail 249 (BE+). Sold ALL 190 manually @ 258.16 (09:41 ET, well above trail). +$1,823 net = +1.12R. Campaign high ~271 (07-15 area).' },
  { sym:'PANW', posId:1983098, shares:232, entry:345.253, exit:350.97, stop:330.29, pl:1323.49, comm:2.88, ed:'2026-07-14', xt:'09:41:43',
    ib:'panw-close-20260716', notes:'Entered 07-14 @ 345.25 (breakout, stop = 14-Jul low 330.29, risk $3,471). Trail at BE 345.50. Sold ALL 232 manually @ 350.97 (09:41 ET). +$1,323 net = +0.38R after 2 days.' },
];
for(const c of CLOSES){
  const p=pct(c.entry,c.exit), r=rMult(c.entry,c.exit,c.stop), ex=await dupe(c.ib);
  console.log(`— ${c.sym} CLOSE: ${c.shares}sh ${c.entry}→${c.exit} = +$${c.pl} (${p}%) = +${r}R vs locked ${c.stop} ${ex?'(EXISTS skip)':''}`);
  if(WRITE && !ex){
    const res=await sb.from('trades').insert({ user_id:UID, ticker:c.sym, trade_type:'Long', entry_date:c.ed, exit_date:'2026-07-16',
      exit_time:c.xt, entry_price:c.entry, exit_price:c.exit, shares:c.shares, stop_price:c.stop, stop_locked_at:now(),
      needs_stop:false, commission:c.comm, pl_dollar:c.pl, pl_pct:p, r_mult:r, setup:'Breakout',
      exit_reason:'Manual close — full de-risk to cash (his call; reason note pending)', notes:c.notes,
      ib_exec_id:c.ib, source:'claude_ibkr', position_id:c.posId, is_sample:false, is_deleted:false, created_at:now() });
    must(res,`${c.sym} insert`); console.log('   ✓ logged');
    const r2=await sb.from('positions').update({is_closed:true, shares:0, updated_at:now()}).eq('id',c.posId).eq('user_id',UID);
    must(r2,`${c.sym} position close`); console.log('   ✓ position closed');
  }
}
if(WRITE){
  const {data:pos}=await sb.from('positions').select('symbol,shares').eq('user_id',UID).or('is_closed.is.null,is_closed.eq.false');
  console.log(`\nOPEN after sync: ${(pos||[]).length ? pos.map(p=>p.symbol+' '+p.shares).join(' · ') : 'NONE — book flat'}`);
}
console.log(WRITE?'\nDONE':'\nDry-run only');
