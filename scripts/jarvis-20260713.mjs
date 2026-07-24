// Jarvis coach refresh 2026-07-13 — after CRWD round-trip cut + OSCR BE stop-out sync.
// Merge-writes headline/attention/working into claude_insights (edge_ledger key untouched).
// Usage: node scripts/jarvis-20260713.mjs --write
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';

const { data:ci } = await sb.from('claude_insights').select('payload').eq('user_id',UID).maybeSingle();
const payload = ci?.payload || {};
payload.headline = "Chop-day discipline held: CRWD pullback cut at −0.27R (−$800 on $3k risked, 18 minutes in) and OSCR stopped at breakeven (+$43 final leg; campaign +$1.9k). Book is now 4 names with every stop at breakeven-or-better — open risk $0.00, exposure 16.3% of NLV, $1.33M cash. Standing aside costs nothing here: the remaining book free-rolls while you wait out the whipsaw.";
payload.attention = [
  "CRWD ran 464 sh (~$87k) with NO stop order on the book — the cut was manual. It worked today, but stopless positions are your named leak (NOW −$52k). Place the stop WITH the entry, even on a starter you expect to cut fast.",
  "CRWD journal row needs your actual planned stop to lock stop_price (implied ≈181.47 from $3k/464sh) — R is currently computed off stated risk, not a level.",
  "New-system cohort is n=29 at PF 0.98 (off-track flag) — too small to judge (target 50), but it means the July rules haven't proven positive expectancy yet. Keep size honest in chop."
];
payload.working = [
  "The cut itself: decisive, −0.27R, no averaging down, no hope-hold — and sitting out afterward matches the current consolidation/whipsaw read.",
  "OSCR campaign closed +$1.9k overall with the final lot risk-free at BE — trail-to-breakeven did its job.",
  "All four holdings (DDOG/NTAP/RBRK/TWLO) trail at/above cost: 100% of open book risk-free, RBRK +3.6R and TWLO +3.4R running."
];
payload.generated_at = new Date().toISOString();
payload._claude_note = "Synced 2026-07-13 from IBKR (CRWD intraday RT + OSCR BE stop-out + marks + NTAP trail 160.50).";
console.log('headline:', payload.headline.slice(0,100)+'…');
if(WRITE){
  const res = await sb.from('claude_insights').upsert({user_id:UID, payload, updated_at:new Date().toISOString()},{onConflict:'user_id'});
  if(res.error){ console.error('✗', res.error.message); process.exit(1); }
  const { data:vb } = await sb.from('claude_insights').select('payload').eq('user_id',UID).maybeSingle();
  console.log('✓ upserted · read-back generated_at =', vb?.payload?.generated_at, '· edge_ledger key intact =', !!vb?.payload?.edge_ledger);
} else console.log('(dry-run)');
