// Sync 2026-08-04 US open — reconciled from live IBKR pull (21:15 MYT):
//   1) NAVN: STOPPED OUT at the open — 1,700 sh sold avg 26.8626 (stop 27.04 gapped through;
//      900 sh slipped to 26.71–26.73). IBKR realized −$1,798.87.
//   2) HPE: ADD 3,400 @ 52.10 at 09:43 ET (profit-cushion stack on gap-up) → faded → whole
//      4,338-sh stack stopped 10:00 ET avg 51.0899 ≈ blended breakeven. IBKR realized −$96.08.
//      Campaign net (trim +720.64 − 96.08) = +$624.56.
//   3) marks refresh UAL/SOXL/TQQQ (sync-webapp-on-pull rule).
// stop_price LOCKED rule respected: originals untouched; closes reference them only.
// Usage: node --env-file=.env.local scripts/log-trades-20260804.mjs [--write]
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const WRITE = process.argv.includes('--write');
const sb = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const UID = '0e32b092-029a-436d-8cb5-67621e1467b0';
const TODAY = '2026-08-04';
const now = () => new Date().toISOString();

// ── 0 · backup ──
const { data: allPos } = await sb.from('positions').select('*').eq('user_id', UID);
const { data: recentTrades } = await sb.from('trades').select('*').eq('user_id', UID).gte('exit_date', '2026-07-28');
const bpath = `/Users/valenchua/Desktop/AI-OS/trading/backups/pre-close-log-${TODAY}.json`;
writeFileSync(bpath, JSON.stringify({ at: now(), positions: allPos, trades_recent: recentTrades }, null, 1));
console.log(`backup → ${bpath} (${allPos?.length} pos, ${recentTrades?.length} trades)`);
const open = (allPos || []).filter(r => !r.is_closed && !r.is_demo);
console.log('open rows:', open.map(r => `${r.symbol} ${r.shares}sh @ ${r.entry_price} stop ${r.stop_price}`).join(' · '));

// ── 1 · NAVN full stopout ──
const navn = open.find(r => r.symbol === 'NAVN');
if (!navn) console.log('✗ NAVN open row not found');
else {
  const sh = Number(navn.shares), E = Number(navn.entry_price), S = Number(navn.stop_price);
  const exitAvg = 26.8626, pl = -1798.87;
  const riskPlan = (E - S) * sh;
  const r = pl / riskPlan;
  console.log(`\nNAVN: ${sh}sh @ ${E} stop ${S} → SOLD avg ${exitAvg} · IBKR pl ${pl} · plan-risk $${riskPlan.toFixed(0)} → ${r.toFixed(2)}R`);
  if (sh !== 1700) console.log(`  ⚠ shares ${sh} ≠ IBKR 1700 — STOP AND RECONCILE`);
  const dupe = (recentTrades || []).find(t => t.ib_exec_id === '0001cbc9.6a71db75.01.01');
  if (dupe) console.log('  ⚠ already logged — skipping');
  if (WRITE && sh === 1700 && !dupe) {
    const { error: e1 } = await sb.from('trades').insert({
      user_id: UID, ticker: 'NAVN', trade_type: 'long', shares: sh,
      entry_date: navn.entry_date, exit_date: TODAY,
      entry_price: E, exit_price: exitAvg, stop_price: S,
      exit_time: '2026-08-04T13:30:02Z',
      pl_dollar: pl, pl_pct: +(((exitAvg - E) / E) * 100).toFixed(2), r_mult: +r.toFixed(2),
      commission: 9.78, setup: navn.setup || 'Momentum Breakout', tags: ['stopped-out', 'gap-through', 'slippage'],
      exit_reason: 'Stopped at the open — gapped down through the 27.04 stop; ~900 sh slipped to 26.71–26.73. Full exit, plan honored.',
      source: 'trade-log', ib_exec_id: '0001cbc9.6a71db75.01.01',
      is_demo: false, ib_synced_at: now(), position_id: navn.id,
    });
    console.log(e1 ? `  ✗ trade insert: ${e1.message}` : '  ✓ NAVN closed trade inserted');
    const { error: e2 } = await sb.from('positions').update({ is_closed: true, current_price: exitAvg, ib_synced_at: now(), updated_at: now() }).eq('id', navn.id);
    console.log(e2 ? `  ✗ pos close: ${e2.message}` : '  ✓ NAVN position marked closed');
  }
}

// ── 2 · HPE: add 3,400 @ 52.10 then whole 4,338 stack stopped avg 51.0899 ──
const hpe = open.find(r => r.symbol === 'HPE');
if (!hpe) console.log('✗ HPE open row not found');
else {
  const baseSh = Number(hpe.shares), baseE = Number(hpe.entry_price);
  const addSh = 3400, addPx = 52.10, totSh = baseSh + addSh;
  const blended = (baseSh * baseE + addSh * addPx) / totSh;
  const exitAvg = 51.0899, pl = -96.08;
  console.log(`\nHPE: base ${baseSh}sh @ ${baseE} + ADD ${addSh} @ ${addPx} = ${totSh}sh blended ${blended.toFixed(4)}`);
  console.log(`  stack stopped avg ${exitAvg} → IBKR pl ${pl} · campaign net (trim 720.64 ${pl}) = +$${(720.64 + pl).toFixed(2)}`);
  if (baseSh !== 938) console.log(`  ⚠ base shares ${baseSh} ≠ expected 938 — STOP AND RECONCILE`);
  const dupe = (recentTrades || []).find(t => t.ib_exec_id === '0000f7ce.6a71e64e.01.01');
  if (dupe) console.log('  ⚠ already logged — skipping');
  if (WRITE && baseSh === 938 && !dupe) {
    const { error: e1 } = await sb.from('trades').insert({
      user_id: UID, ticker: 'HPE', trade_type: 'long', shares: totSh,
      entry_date: hpe.entry_date, exit_date: TODAY,
      entry_price: +blended.toFixed(4), exit_price: exitAvg, stop_price: Number(hpe.stop_price),
      entry_time: '2026-08-04T13:43:47Z', exit_time: '2026-08-04T14:00:36Z',
      pl_dollar: pl, pl_pct: +(((exitAvg - blended) / blended) * 100).toFixed(2), r_mult: -0.06,
      commission: 44.10, setup: hpe.setup || 'Undercut & Rally', tags: ['add-at-open', 'profit-cushion-stack', 'breakeven-stop', 'campaign-close'],
      exit_reason: 'Added 3,400 @ 52.10 on the gap-up open (profit-cushion stack, anticipation of continuation); gap faded, whole 4,338-sh stack stopped ~51.09 = blended breakeven. Campaign net incl. 2R trim: +$624.56 (+0.42R on original risk). Remainder 938 earned +$3,376; the add gave back −$3,434.',
      source: 'trade-log', ib_exec_id: '0000f7ce.6a71e64e.01.01',
      is_demo: false, ib_synced_at: now(), position_id: hpe.id,
    });
    console.log(e1 ? `  ✗ trade insert: ${e1.message}` : '  ✓ HPE campaign-close trade inserted');
    const { error: e2 } = await sb.from('positions').update({ is_closed: true, current_price: exitAvg, ib_synced_at: now(), updated_at: now() }).eq('id', hpe.id);
    console.log(e2 ? `  ✗ pos close: ${e2.message}` : '  ✓ HPE position marked closed');
  }
}

// ── 3 · marks refresh (live IBKR) ──
const MARKS = { UAL: 130.825, SOXL: 133.20, TQQQ: 72.35 };
for (const [sym, px] of Object.entries(MARKS)) {
  const row = open.find(r => r.symbol === sym);
  if (!row) { console.log(`⚠ ${sym} open row missing`); continue; }
  if (WRITE) {
    const { error } = await sb.from('positions').update({ current_price: px, ib_synced_at: now(), updated_at: now() }).eq('id', row.id);
    console.log(error ? `✗ ${sym} mark: ${error.message}` : `✓ ${sym} mark → ${px}`);
  } else console.log(`${sym} mark → ${px}`);
}
console.log(`\n=== ${WRITE ? 'WRITE DONE' : 'dry-run — re-run with --write'} ===`);
