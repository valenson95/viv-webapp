// Sync 2026-08-03 session part 2 — reconciled from live IBKR pull (2026-08-04 ~11:45 MYT):
//   1) HPE: 25% trim SOLD 312 @ 49.80 (≈2R intraday, his plan) → position 1250→938 + trades row
//   2) insert SOXL 223sh + TQQQ 433sh (FTD-anticipation lev-ETF plays, stops = LoD from resting GTC)
//   3) refresh current_price on all open rows (sync-webapp-on-pull rule)
// Usage: node --env-file=.env.local scripts/log-trades-20260803b.mjs [--write]
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const WRITE = process.argv.includes('--write');
const sb = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const UID = '0e32b092-029a-436d-8cb5-67621e1467b0';
const TODAY = '2026-08-03';
const now = () => new Date().toISOString();

// ── 0 · backup ──
const { data: allPos } = await sb.from('positions').select('*').eq('user_id', UID);
const { data: recentTrades } = await sb.from('trades').select('*').eq('user_id', UID).gte('exit_date', '2026-07-25');
const bpath = `/Users/valenchua/Desktop/AI-OS/trading/backups/pre-trim-log-${TODAY}b.json`;
writeFileSync(bpath, JSON.stringify({ at: now(), positions: allPos, trades_recent: recentTrades }, null, 1));
console.log(`backup → ${bpath} (${allPos?.length} pos, ${recentTrades?.length} trades)`);
const open = (allPos || []).filter(r => !r.is_closed && !r.is_demo);
console.log('open rows:', open.map(r => `${r.symbol} ${r.shares}sh`).join(' · '));

// ── 1 · HPE trim: reduce position + insert closed-leg trade ──
const hpe = open.find(r => r.symbol === 'HPE');
if (!hpe) { console.log('✗ HPE open row not found — STOP'); process.exit(1); }
if (Number(hpe.shares) !== 1250) console.log(`⚠ HPE shares ${hpe.shares} ≠ expected 1250`);
console.log(`\nHPE trim: 1250 → 938 sh · SELL 312 @ 49.80 · realized +$720.64 (IBKR) · 1.96R`);
const dupeTrim = (recentTrades || []).find(t => t.ib_exec_id === '00012dc0.6a70d984.01.01');
if (dupeTrim) console.log('  ⚠ trim trade already logged — skipping trade insert');
if (WRITE) {
  const { error: e1 } = await sb.from('positions').update({
    shares: 938, current_price: 51.49, ib_synced_at: now(), updated_at: now(),
  }).eq('id', hpe.id);
  console.log(e1 ? `  ✗ pos update: ${e1.message}` : '  ✓ HPE position → 938 sh');
  if (!dupeTrim) {
    const { error: e2 } = await sb.from('trades').insert({
      user_id: UID, ticker: 'HPE', trade_type: 'long', shares: 312,
      entry_date: TODAY, exit_date: TODAY,
      entry_price: 47.484, exit_price: 49.80, stop_price: 46.30,
      entry_time: '2026-08-03T13:59:14Z', exit_time: '2026-08-03T17:46:31Z',
      pl_dollar: 720.64, pl_pct: 4.88, r_mult: 1.96, commission: 3.50,
      setup: 'Undercut & Rally', tags: ['UnR', 'planned-trim', '2R'],
      exit_reason: 'Planned trim — 25% off at 2R intraday (derisk plan)',
      source: 'trade-log', ib_exec_id: '00012dc0.6a70d984.01.01', ib_trade_id: '845189284',
      is_demo: false, ib_synced_at: now(), position_id: hpe.id,
    });
    console.log(e2 ? `  ✗ trade insert: ${e2.message}` : '  ✓ HPE trim trade row inserted');
  }
}

// ── 2 · new lev-ETF positions (IBKR avg incl comm; stops = resting GTC = LoD) ──
const NEW = [
  {
    symbol: 'SOXL', shares: 223, entry_price: 115.4583, current_price: 116.91,
    stop_price: 102.15, entry_time: '12:19:19',
    setup: 'FTD Anticipation', tags: ['lev-ETF', '3x-semis', 'FTD-anticipation', 'higher-RR'],
    rationale: 'Anticipation of a follow-through day: mega caps showing a promising uptrend and continuation, most likely carrying the Nasdaq and semis with it. 3× semis vehicle; deliberately a higher risk-reward play. Stop = LoD 102.15. NOTE: risk ~$2,968 ≈ 2× the $1.5k standard — accepted as the higher-RR sizing.',
    entry_gates: { entry_model: 'anticipation', sized_same_d: true },
  },
  {
    symbol: 'TQQQ', shares: 433, entry_price: 67.4042, current_price: 68.59,
    stop_price: 64.00, entry_time: '12:15:39',
    setup: 'FTD Anticipation', tags: ['lev-ETF', '3x-nasdaq', 'FTD-anticipation', 'DTL-break'],
    rationale: 'Anticipation of a follow-through day: mega-cap uptrend/continuation to carry the Nasdaq. Daily closed +5.17% back above the downtrend line, below the 50-MA (ATR-mult −1.38 = room to it). Higher risk-reward play. Stop = LoD 63.99→64.00.',
    entry_gates: { lod_dist_atr: 0.76, rvol_tm: 0.87, ext_mult: -1.38, entry_model: 'anticipation', sized_same_d: true },
  },
];
for (const p of NEW) {
  const dupe = open.find(r => r.symbol === p.symbol);
  const risk = ((p.entry_price - p.stop_price) * p.shares).toFixed(0);
  console.log(`\n${p.symbol}: ${p.shares}sh @ ${p.entry_price} stop ${p.stop_price} → risk $${risk}${dupe ? ` ⚠ OPEN ROW EXISTS — SKIP` : ''}`);
  if (dupe) continue;
  if (WRITE) {
    const { error } = await sb.from('positions').insert({
      user_id: UID, symbol: p.symbol, shares: p.shares, trade_type: 'Long',
      entry_date: TODAY, entry_price: p.entry_price, current_price: p.current_price,
      stop_price: p.stop_price, setup: p.setup, tags: p.tags, rationale: p.rationale,
      entry_gates: p.entry_gates, entry_time: p.entry_time,
      ext_mult: p.entry_gates.ext_mult ?? null, ext_asof: TODAY,
      is_closed: false, is_demo: false, source: 'claude_ibkr',
      ib_synced_at: now(), created_at: now(), updated_at: now(),
    });
    console.log(error ? `  ✗ ${error.message}` : '  ✓ inserted');
  }
}

// ── 3 · refresh current_price on the rest (live IBKR marks) ──
const MARKS = { NAVN: 27.70, UAL: 128.49 };
for (const [sym, px] of Object.entries(MARKS)) {
  const row = open.find(r => r.symbol === sym);
  if (row && WRITE) {
    const { error } = await sb.from('positions').update({ current_price: px, ib_synced_at: now(), updated_at: now() }).eq('id', row.id);
    console.log(error ? `✗ ${sym} mark: ${error.message}` : `✓ ${sym} mark → ${px}`);
  }
}
console.log(`\n=== ${WRITE ? 'WRITE DONE' : 'dry-run — re-run with --write'} ===`);
