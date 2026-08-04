// Log 2026-08-03 entries: NAVN / UAL / HPE — reconciled from live IBKR pull.
// Usage: node --env-file=.env.local scripts/log-entries-20260803.mjs           (dry run)
//        node --env-file=.env.local scripts/log-entries-20260803.mjs --write   (execute)
// Steps: 0) snapshot backup → 1) show existing open rows → 2) insert 3 new position rows
// (stop_price = locked initial from resting IBKR GTC stops), entry_gates captured.
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const WRITE = process.argv.includes('--write');
const sb = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const UID = '0e32b092-029a-436d-8cb5-67621e1467b0';
const TODAY = '2026-08-03';
const now = () => new Date().toISOString();

// ── 0 · backup snapshot (before any write) ──
const { data: allPos } = await sb.from('positions').select('*').eq('user_id', UID);
const { data: recentTrades } = await sb.from('trades').select('*').eq('user_id', UID).gte('exit_date', '2026-07-20');
const bpath = `/Users/valenchua/Desktop/AI-OS/trading/backups/pre-entry-log-${TODAY}.json`;
writeFileSync(bpath, JSON.stringify({ at: now(), positions: allPos, trades_recent: recentTrades }, null, 1));
console.log(`backup → ${bpath} (${allPos?.length} pos rows, ${recentTrades?.length} recent trades)`);

const open = (allPos || []).filter(r => !r.is_closed && !r.is_demo);
console.log('\nexisting open rows:', open.map(r => `${r.symbol} ${r.shares}sh`).join(' · ') || '(none)');

// ── new positions (IBKR truth, pulled 2026-08-03 ~22:20 MYT) ──
const NEW = [
  {
    symbol: 'UAL', shares: 500, entry_price: 128.255, current_price: 130.00,
    stop_price: 125.31, entry_time: '09:40:51',
    setup: 'Reverse Pocket Pivot', tags: ['5min-ORB', 'catalyst', 'oil-drop'],
    rationale: 'Catalyst: Trump pauses the Iran conflict (potential deal) → WTI −6% pre-market = direct margin tailwind for airlines. UAL printed a reverse pocket pivot; entered on the 5-min ORB. Stop = LoD.',
    entry_gates: { lod_dist_atr: 0.59, rvol_tm: 16.61, orb_wait: false, ext_mult: 2.38, entry_model: 'orb', sized_same_d: true },
  },
  {
    symbol: 'NAVN', shares: 1700, entry_price: 27.915, current_price: 27.68,
    stop_price: 27.06, entry_time: '09:42:45',
    setup: 'Momentum Breakout', tags: ['5min-ORB', 'ATH-breakout', 'reverse-pocket-pivot'],
    rationale: 'Momentum breakout to all-time high off the 5-min ORB. Yesterday printed reverse-pocket-pivot volume; RVOL today is weak (0.37× pacing at entry) — acknowledged in position. Recent IPO (Nov-2025), Software.',
    entry_gates: { lod_dist_atr: 0.52, rvol_tm: 0.37, orb_wait: false, ext_mult: 3.25, entry_model: 'orb', sized_same_d: true },
  },
  {
    symbol: 'HPE', shares: 1250, entry_price: 47.484, current_price: 48.15,
    stop_price: 46.30, entry_time: '09:59:14',
    setup: 'Undercut & Rally', tags: ['UnR', 'MA50-reclaim', 'vwap-reclaim'],
    rationale: 'Undercut & Rally at the daily 50-SMA: undercut, then reclaimed VWAP and the 6/20 SMA cross on the 5-min. Stop = LoD 46.30.',
    entry_gates: { lod_dist_atr: 0.43, rvol_tm: 0.48, ext_mult: 0.66, entry_model: 'other', sized_same_d: true },
  },
];

for (const p of NEW) {
  const dupe = open.find(r => r.symbol === p.symbol);
  const risk = ((p.entry_price - p.stop_price) * p.shares).toFixed(0);
  console.log(`\n${p.symbol}: ${p.shares}sh @ ${p.entry_price} stop ${p.stop_price} → risk $${risk} ${dupe ? `⚠ OPEN ROW EXISTS (id ${dupe.id}) — SKIP` : ''}`);
  if (dupe) continue;
  if (WRITE) {
    const { error } = await sb.from('positions').insert({
      user_id: UID, symbol: p.symbol, shares: p.shares, trade_type: 'Long',
      entry_date: TODAY, entry_price: p.entry_price, current_price: p.current_price,
      stop_price: p.stop_price,
      setup: p.setup, tags: p.tags, rationale: p.rationale,
      entry_gates: p.entry_gates, entry_time: p.entry_time,
      ext_mult: p.entry_gates.ext_mult, ext_asof: TODAY,
      is_closed: false, is_demo: false, source: 'claude_ibkr',
      ib_synced_at: now(), created_at: now(), updated_at: now(),
    });
    console.log(error ? `  ✗ ${error.message}` : '  ✓ inserted');
  }
}
console.log(`\n=== ${WRITE ? 'WRITE DONE' : 'dry-run only — re-run with --write'} ===`);
