#!/usr/bin/env node
// Jeff-management SIMULATION on Valen's real trades — INTRADAY (5-min) engine.
// Fixes the daily-bar flaw: with 5-min bars we locate the ACTUAL intraday entry moment, then only
// count stops AFTER it (no false stop-outs on winners from a low that printed before entry).
// Bars: Yahoo 5m (interval=5m,range=60d — covers the cohort) for the path + Yahoo daily for the 10-MA.
// Rules simulated per trade:
//   entry = first 5m bar on entry_date trading through E (else first bar / gap-open)
//   3 tranches (⅓ each) with staggered stops at −⅓R / −⅔R / −1R (checked on 5m lows AFTER entry)
//   +2R shave (calendar day 0–2) and +3R shave (any day) on 5m highs
//   T+3: at day-3 close sell one third; move all remaining stops to breakeven
//   day 4+: on first DAILY close < 10-MA → exit remainder at next session's opening-range low (ORL)
//   breakeven stop floors the post-T+3 remainder at 0R
// NOT modelled: re-add / inverse-pyramid, 8–10× sell-into-strength, EOD loser-close (discretionary).
// Run: node --env-file=.env.local scripts/jeff-sim.mjs
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };
const j = (r) => r.json();
const sum = (a) => a.reduce((s, x) => s + x, 0);
const round = (x, d = 2) => x == null || !isFinite(x) ? null : +x.toFixed(d);
const UA = { "User-Agent": "Mozilla/5.0" };

const own = await fetch(`${URL_}/rest/v1/positions?select=user_id&ext_mult=not.is.null&limit=1`, { headers: H }).then(j);
const UID = own?.[0]?.user_id;
const ins = await fetch(`${URL_}/rest/v1/claude_insights?select=payload&user_id=eq.${UID}`, { headers: H }).then(j);
const camps = (ins?.[0]?.payload?.edge_ledger?.campaigns || []).filter(c => c.entry && c.stop && c.stop < c.entry && c.entryDate);

async function daily(t) {
  try {
    const p1 = Math.floor(new Date("2026-03-01").getTime() / 1000), p2 = Math.floor(new Date("2026-07-31").getTime() / 1000);
    const d = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?period1=${p1}&period2=${p2}&interval=1d`, { headers: UA }).then(j);
    const r = d?.chart?.result?.[0]; if (!r) return null; const q = r.indicators.quote[0];
    const B = r.timestamp.map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), c: q.close[i] })).filter(b => b.c != null);
    const sma = {}; B.forEach((b, i) => { if (i >= 9) sma[b.date] = sum(B.slice(i - 9, i + 1).map(x => x.c)) / 10; });
    return sma;
  } catch { return null; }
}
async function intra(t) {
  try {
    const d = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=5m&range=60d`, { headers: UA }).then(j);
    const r = d?.chart?.result?.[0]; if (!r) return null; const q = r.indicators.quote[0];
    return r.timestamp.map((ts, i) => {
      const dt = new Date(ts * 1000);
      return { date: dt.toISOString().slice(0, 10), o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] };
    }).filter(b => b.c != null);
  } catch { return null; }
}

function simulate(E, S, sma, IB, entryDate) {
  const D = E - S, Rof = (px) => (px - E) / D;
  // group intraday bars by date, from entryDate onward
  const days = [];
  for (const b of IB) { if (b.date < entryDate) continue; const last = days[days.length - 1]; if (!last || last.date !== b.date) days.push({ date: b.date, bars: [b] }); else last.bars.push(b); }
  if (!days.length) return null;
  // locate entry bar on day 0
  let d0 = days[0].bars, start = d0.findIndex(b => b.l <= E && b.h >= E); if (start < 0) start = 0; d0 = d0.slice(start);
  days[0].bars = d0;
  let units = 3, be = false, took2 = false, took3 = false, exits = [], pendORL = false;
  let stops = [E - D / 3, E - 2 * D / 3, E - D];
  for (let di = 0; di < days.length && units > 0; di++) {
    const day = days[di];
    if (pendORL) { const orl = day.bars[0].l; while (units > 0) { exits.push(be ? Math.max(0, Rof(orl)) : Rof(orl)); units--; } break; }
    for (const b of day.bars) {
      if (units <= 0) break;
      for (let k = stops.length - 1; k >= 0 && units > 0; k--) if (b.l <= stops[k]) { exits.push(be ? 0 : Rof(stops[k])); units--; stops.splice(k, 1); }
      if (di <= 2 && !took2 && b.h >= E + 2 * D && units > 0) { exits.push(2); units--; stops.pop(); took2 = true; }
      if (!took3 && b.h >= E + 3 * D && units > 0) { exits.push(3); units--; stops.pop(); took3 = true; }
    }
    if (di === 3 && units > 0) { exits.push(Rof(day.bars[day.bars.length - 1].c)); units--; stops.pop(); be = true; stops = stops.map(() => E); }
    if (di >= 4 && units > 0) { const dc = day.bars[day.bars.length - 1].c, sm = sma[day.date]; if (sm != null && dc < sm) pendORL = true; }
  }
  while (units > 0) { const lc = days[days.length - 1].bars.slice(-1)[0].c; exits.push(be ? Math.max(0, Rof(lc)) : Rof(lc)); units--; }
  return round(sum(exits) / 3, 2);
}

const rows = [];
for (const c of camps) {
  const [sma, IB] = await Promise.all([daily(c.ticker), intra(c.ticker)]);
  await new Promise(r => setTimeout(r, 150));
  if (!sma || !IB) { rows.push({ t: c.ticker, actual: round(c.blendedR ?? c.rSum, 2), sim: null, mfe: c.mfeR }); continue; }
  const sim = simulate(c.entry, c.stop, sma, IB, c.entryDate);
  rows.push({ t: c.ticker, actual: round(c.blendedR ?? c.rSum, 2), sim, mfe: c.mfeR });
}
const V = rows.filter(r => r.sim != null && r.actual != null);
const aW = V.filter(r => r.actual > 0), aL = V.filter(r => r.actual <= 0), sW = V.filter(r => r.sim > 0), sL = V.filter(r => r.sim <= 0);
const avg = (a, f) => a.length ? round(sum(a.map(f)) / a.length, 2) : null;
const pf = (W, L, f) => { const gl = sum(L.map(f)); return gl < 0 ? round(sum(W.map(f)) / -gl) : null; };
console.log("ticker  actual   sim    Δ     MFE");
for (const r of [...V].sort((a, b) => a.actual - b.actual)) console.log(`${r.t.padEnd(6)} ${String(r.actual).padStart(6)} ${String(r.sim).padStart(6)} ${String(round(r.sim - r.actual, 2)).padStart(6)}  ${String(r.mfe).padStart(5)}`);
console.log(`\nn=${V.length}`);
console.log(`WR         actual ${round(aW.length / V.length * 100, 1)}%  sim ${round(sW.length / V.length * 100, 1)}%`);
console.log(`Avg win    actual ${avg(aW, r => r.actual)}R  sim ${avg(sW, r => r.sim)}R`);
console.log(`Avg loss   actual ${avg(aL, r => r.actual)}R  sim ${avg(sL, r => r.sim)}R`);
console.log(`Expectancy actual ${round(sum(V.map(r => r.actual)) / V.length, 3)}R  sim ${round(sum(V.map(r => r.sim)) / V.length, 3)}R`);
console.log(`PF (R)     actual ${pf(aW, aL, r => r.actual)}  sim ${pf(sW, sL, r => r.sim)}`);
console.log(`Total R    actual ${round(sum(V.map(r => r.actual)), 2)}  sim ${round(sum(V.map(r => r.sim)), 2)}`);
console.log(`SANITY: MRNA & CRWD should stay big winners; AXSM a loss →`, V.filter(r => ["MRNA", "CRWD", "AXSM"].includes(r.t)).map(r => `${r.t} ${r.sim}`).join(", "));
