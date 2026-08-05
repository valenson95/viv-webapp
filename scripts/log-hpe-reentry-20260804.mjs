// HPE re-entry (campaign #2) — 2026-08-04 15:14 UTC, reconciled from live IBKR:
//   BUY 4,000 @ avg 51.7541 (20 MidPrice fills 51.745–51.755) · resting GTC stop 50.40 (= today's low zone)
//   Risk $5,417 = 0.34% NLV (inside 0.5% gate; 3.6× his recent $1.5k standard — flagged, he sized it deliberately)
//   Interview: setup=Undercut & Rally · conviction=High (planned re-entry) · intent=swing
//   plan="3-5 days or 3-5R, first trim 50%, trail rest with MA" (his words)
// Usage: node --env-file=.env.local scripts/log-hpe-reentry-20260804.mjs [--write]
import { createClient } from '@supabase/supabase-js';

const WRITE = process.argv.includes('--write');
const sb = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const UID = '0e32b092-029a-436d-8cb5-67621e1467b0';
const now = () => new Date().toISOString();

const { data: rows } = await sb.from('positions').select('id,symbol,shares,is_closed,is_demo,entry_date').eq('user_id', UID).eq('symbol', 'HPE');
const openDupe = (rows || []).find(r => !r.is_closed && !r.is_demo);
console.log('existing HPE rows:', (rows || []).map(r => `${r.entry_date} ${r.shares}sh closed=${r.is_closed}`).join(' · ') || 'none');
if (openDupe) { console.log('✗ OPEN HPE row already exists — STOP'); process.exit(1); }

const pos = {
  user_id: UID, symbol: 'HPE', shares: 4000, trade_type: 'Long',
  entry_date: '2026-08-04', entry_price: 51.7541, current_price: 52.31,
  stop_price: 50.40, setup: 'Undercut & Rally',
  tags: ['UnR', 're-entry', 'campaign-2', 'vwap-reclaim', 'swing'],
  rationale: 'Re-entry after the morning breakeven stopout: gap faded to 50.39, undercut yesterday-high zone (50.55), then reclaimed VWAP (51.47) and the pre-market low (51.7) with the 5-min MA ribbon turning up — intraday undercut & rally on a daily still in fresh-breakout position (+4.12%, RVOL 1.22x, ATR-mult from 50MA 2.16 = not extended). Conviction HIGH — planned re-entry, the reclaim was the trigger. Intent: multi-day swing toward the 57–63.50 June zone. Plan (his words): 3–5 days or 3–5R, first trim 50%, trail the rest with MA. Risk $5,417 = 0.34% NLV — inside the 0.5% gate, 3.6x the recent $1.5k standard, sized deliberately. Chart flag: LoD dist 65% of ATR (hair over the ≤60% gate).',
  entry_gates: { lod_dist_atr: 0.65, rvol_tm: 1.22, ext_mult: 2.16, entry_model: 'UnR-vwap-reclaim', sized_same_d: true },
  entry_time: '15:14:08', ext_mult: 2.16, ext_asof: '2026-08-04',
  is_closed: false, is_demo: false, source: 'claude_ibkr',
  ib_synced_at: now(), created_at: now(), updated_at: now(),
};
const risk = ((pos.entry_price - pos.stop_price) * pos.shares).toFixed(0);
console.log(`HPE re-entry: 4000sh @ ${pos.entry_price} stop ${pos.stop_price} → risk $${risk}`);
if (WRITE) {
  const { error } = await sb.from('positions').insert(pos);
  console.log(error ? `✗ ${error.message}` : '✓ HPE campaign-2 position inserted');
} else console.log('dry-run — re-run with --write');
