#!/usr/bin/env node
// VERIFICATION: independently recompute lodDistAtr / extEntryCalc / dayMFE / mfeR for a sample
// of campaigns from fresh Yahoo bars and diff against what the edge-ledger payload claims.
// Purpose: prove the quant page's numbers trace to real market data + real fills — no fabrication.
const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: "Bearer " + KEY };
const j = (r) => r.json();
const main = async () => {
  const d = await fetch(`${URL_}/rest/v1/claude_insights?select=payload&limit=1`, { headers: H }).then(j);
  const camps = d[0].payload.edge_ledger.campaigns.filter(c => c.lodDistAtr != null && c.extEntryCalc != null && c.dayMFE != null);
  // sample: first 4 distinct tickers
  const seen = new Set(); const sample = [];
  for (const c of camps) { if (!seen.has(c.ticker)) { seen.add(c.ticker); sample.push(c); } if (sample.length >= 4) break; }
  for (const c of sample) {
    const p1 = Math.floor(new Date("2025-10-01").getTime() / 1000), p2 = Math.floor(Date.now() / 1000);
    const y = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${c.ticker}?period1=${p1}&period2=${p2}&interval=1d`, { headers: { "User-Agent": "Mozilla/5.0" } }).then(j);
    const r0 = y.chart.result[0], q = r0.indicators.quote[0];
    const B = r0.timestamp.map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), h: q.high[i], l: q.low[i], c: q.close[i] })).filter(b => b.h != null);
    const i0 = B.findIndex(b => b.date >= c.entryDate);
    let i1 = B.findIndex(b => b.date > c.lastExit); i1 = i1 === -1 ? B.length : i1;
    // independent recompute (same formulas, written fresh)
    let trSum = 0; for (let k = i0 - 14; k < i0; k++) { const b = B[k], pc = B[k - 1].c; trSum += Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)); }
    const atr = trSum / 14;
    const sma50 = B.slice(i0 - 50, i0).reduce((s, b) => s + b.c, 0) / 50;
    const ext = (c.entry - sma50) / atr;
    const lod = B[i0].date === c.entryDate ? (c.entry - B[i0].l) / atr : null;
    const win = B.slice(i0, i1);
    let maxH = -1e18, iMax = 0; win.forEach((b, i) => { if (b.h > maxH) { maxH = b.h; iMax = i; } });
    const mfe = (maxH - c.entry) / (c.entry - c.stop);
    const ok = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol ? "MATCH" : "DIFF!";
    console.log(`${c.ticker} entry ${c.entryDate} @ ${c.entry} stop ${c.stop}`);
    console.log(`  lodDistAtr  payload ${c.lodDistAtr}  recomputed ${lod?.toFixed(2)}   ${ok(c.lodDistAtr, lod, 0.02)}`);
    console.log(`  extEntryCalc payload ${c.extEntryCalc}  recomputed ${ext.toFixed(1)}   ${ok(c.extEntryCalc, +ext.toFixed(1), 0.11)}`);
    console.log(`  dayMFE      payload ${c.dayMFE}  recomputed ${iMax}   ${c.dayMFE === iMax ? "MATCH" : "DIFF!"}`);
    console.log(`  mfeR        payload ${c.mfeR}  recomputed ${mfe.toFixed(2)}   ${ok(c.mfeR, +mfe.toFixed(2), 0.03)}`);
    console.log(`  bar check: entry-day bar ${B[i0].date} low ${B[i0].l?.toFixed(2)} · ATR14 ${atr.toFixed(3)} · SMA50 ${sma50.toFixed(2)}`);
    await new Promise(r => setTimeout(r, 250));
  }
};
main().catch(e => { console.error(e); process.exit(1); });
