// Jarvis coach payload FIX 2026-07-14 — the 07-13 refresh wrote `attention` as plain strings,
// but the Coach card renders objects {lens,title,detail} → three empty red boxes (Valen's
// screenshot). Also `scope` (header line) + focus_on/avoid were still 07-10 content.
// This rewrites all four keys in the correct shapes. Merge-write; edge_ledger key untouched.
// LOCAL-ONLY script — contains account figures; repo is public, never commit.
// Usage: node scripts/jarvis-20260714.mjs --write
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const WRITE = process.argv.includes('--write');
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';

const { data:ci } = await sb.from('claude_insights').select('payload').eq('user_id',UID).maybeSingle();
const payload = ci?.payload || {};

payload.scope = "Live IBKR pull 2026-07-13 ~10:55 ET · CRWD intraday RT cut −0.27R · OSCR stopped at BE (campaign +$1.9k) · 4 positions remain, all risk-free, reconciled to the cent";

payload.attention = [
  { lens: "Process", title: "CRWD ran 464 sh (~$87k) with NO stop on the book",
    detail: "The cut was manual and it worked (−0.27R, 18 min) — but stopless positions are the named leak (NOW −$52k was the same shape). Place the stop WITH the entry, even on a starter you expect to cut fast." },
  { lens: "Journal", title: "CRWD row needs your planned stop to lock R",
    detail: "No stop order ever existed, so r_mult (−0.27) is computed from the STATED $3k risk, not a level (implied ≈181.47). Give the real planned stop and it gets locked into stop_price." },
  { lens: "Sample size", title: "New-system cohort: PF 0.98 on 29 trades — caution, not verdict",
    detail: "Off-track flag at n=29 vs the 50-trade target. Too small to condemn, not yet proven either. Keep size honest in chop — the edge lives in the gates, the tape's job is to tempt you out of them." },
];

payload.focus_on = [
  "All four holdings (DDOG/NTAP/RBRK/TWLO) trail at/above cost — RBRK +3.6R, TWLO +3.4R running. 100% of the open book is risk-free; let the trails do the work.",
  "OSCR campaign closed +$1.9k with the final 2,250 stopped at breakeven — trail-to-BE did its job end to end (750 trimmed into strength 07-02, remainder free-rolled).",
  "Standing aside in chop is a position: open risk $0.00, exposure 16.3% of NLV, $1.33M cash ready the moment the range resolves.",
];
payload.avoid = [
  "Stopless starters — today's CRWD cut was discipline covering for process. The order ticket isn't done until the stop is on the book.",
  "Boredom re-entries into the whipsaw: the current read is consolidation — wait for the range to resolve instead of paying the chop tax twice in a week.",
  "Reading PF 0.98 (n=29) as a system verdict — it's a small-sample caution. Judge at n≥50 with the gates enforced.",
];

payload.generated_at = new Date().toISOString();
payload._claude_note = "07-14 fix: attention → {lens,title,detail} objects (renderer contract), scope/focus_on/avoid refreshed to the 07-13 book state.";

console.log('scope:', payload.scope.slice(0,90)+'…');
console.log('attention[0]:', JSON.stringify(payload.attention[0]).slice(0,110)+'…');
if(WRITE){
  const res = await sb.from('claude_insights').upsert({ user_id:UID, payload, updated_at:new Date().toISOString() }, { onConflict:'user_id' });
  if(res.error){ console.error('✗', res.error.message); process.exit(1); }
  const { data:vb } = await sb.from('claude_insights').select('payload').eq('user_id',UID).maybeSingle();
  const p = vb?.payload || {};
  console.log('✓ upserted · attention shape ok =', Array.isArray(p.attention) && typeof p.attention[0] === 'object' && !!p.attention[0].lens,
    '· focus_on', (p.focus_on||[]).length, '· avoid', (p.avoid||[]).length, '· edge_ledger intact =', !!p.edge_ledger);
} else console.log('(dry-run)');
