// BACKFILL-MCAP — point-in-time market cap onto existing study rows (Valen 2026-07-17).
// cap = SEC shares outstanding (newest filing ≤ trigger, no lookahead) × trigger close.
// Concept fallback chain: dei/EntityCommonStockSharesOutstanding → us-gaap/CommonStockSharesOutstanding
// → us-gaap/CommonStockSharesIssued (multi-class filers like PLTR 404 on the dei concept).
// Same-end rows are deduped on (end,val) then summed (per-class facts sum; filing repeats collapse).
// Proxy paced at 7s/study for the per-minute rate limit. Merge-writes ONLY m.mcap_t/m.mcap_asof.
// Usage: node --env-file=.env.local scripts/backfill-mcap.mjs [--force]
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const UID = '0e32b092-029a-436d-8cb5-67621e1467b0';
const PROXY = 'https://www.valensontrades.com/api/candles';
const UA = { headers: { 'User-Agent': 'VIV Research valen@valensontrades.com' } };
const FORCE = process.argv.includes('--force');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const tkMap = await (await fetch('https://www.sec.gov/files/company_tickers.json', UA)).json();
const cikOf = (sym) => { const h = Object.values(tkMap).find(v => v.ticker === sym); return h ? String(h.cik_str).padStart(10, '0') : null; };

const conceptCache = {};
async function sharesRows(sym) {
  if (conceptCache[sym] !== undefined) return conceptCache[sym];
  const cik = cikOf(sym);
  if (!cik) return (conceptCache[sym] = null);
  for (const [taxo, tag] of [['dei', 'EntityCommonStockSharesOutstanding'], ['us-gaap', 'CommonStockSharesOutstanding'], ['us-gaap', 'CommonStockSharesIssued']]) {
    try {
      const r = await fetch(`https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/${taxo}/${tag}.json`, UA);
      if (!r.ok) continue;
      const j = await r.json();
      const rows = j.units?.shares;
      if (rows?.length) return (conceptCache[sym] = { rows, src: `${taxo}/${tag}` });
    } catch { /* next concept */ }
  }
  return (conceptCache[sym] = null);
}

function sharesAt(rowsObj, dateISO) {
  const elig = rowsObj.rows.filter(r => (r.filed || r.end) <= dateISO);
  if (!elig.length) return null;
  const latestEnd = elig.reduce((a, b) => (b.end > a.end ? b : a)).end;
  const seen = new Set(); let sum = 0;
  for (const r of elig.filter(r => r.end === latestEnd)) {
    const k = r.end + '|' + r.val;
    if (!seen.has(k)) { seen.add(k); sum += r.val; }
  }
  return { shares: sum, asof: latestEnd };
}

async function closeAt(sym, dateISO) {
  const from = new Date(+new Date(dateISO) - 12 * 86400000).toISOString().slice(0, 10);
  const r = await fetch(`${PROXY}?symbol=${sym}&from=${from}&to=${dateISO}&res=1day`);
  const j = await r.json();
  if (!j.ok || !j.candles?.length) throw new Error(j.error || 'no bars');
  const exact = j.candles.find(b => new Date(b.time * 1000).toISOString().slice(0, 10) === dateISO);
  return (exact || j.candles[j.candles.length - 1]).close;
}

const { data } = await sb.from('model_book').select('id,ticker,entry_date,metrics').eq('created_by', UID);
const studies = (data || []).filter(r => r.metrics?.study && (FORCE || !r.metrics.study.m?.mcap_t));
console.log(`${studies.length} study rows to fill${FORCE ? ' (force)' : ''}`);

for (const row of studies) {
  const sym = row.ticker, d = row.entry_date;
  try {
    const rowsObj = await sharesRows(sym);
    if (!rowsObj) { console.log(`✗ ${sym} ${d}: no SEC shares concept — left blank (not measured)`); continue; }
    const sh = sharesAt(rowsObj, d);
    if (!sh) { console.log(`✗ ${sym} ${d}: no filing ≤ trigger — left blank`); continue; }
    const px = await closeAt(sym, d);
    const cap = Math.round(sh.shares * px);
    const m = { ...(row.metrics.study.m || {}), mcap_t: cap, mcap_asof: `${sh.asof} (SEC ${rowsObj.src} ${(sh.shares / 1e6).toFixed(1)}M sh × ${px.toFixed(2)} trigger close)` };
    const metrics = { ...row.metrics, study: { ...row.metrics.study, m } };
    const { error } = await sb.from('model_book').update({ metrics }).eq('id', row.id);
    if (error) throw new Error(error.message);
    console.log(`✓ ${sym} ${d}: ${(cap >= 1e9 ? '$' + (cap / 1e9).toFixed(1) + 'B' : '$' + Math.round(cap / 1e6) + 'M')} (${sh.asof}, ${rowsObj.src})`);
  } catch (e) { console.log(`✗ ${sym} ${d}: ${e.message} — left blank`); }
  await sleep(7000); // candles-proxy per-minute rate limit
}
console.log('done');
