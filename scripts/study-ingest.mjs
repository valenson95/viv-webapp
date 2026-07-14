// STUDY-INGEST — Valen's chart-handoff workflow (2026-07-14):
//   1. In the webapp he creates the study (ticker + date + his eyeball ticks), or not — either way works.
//   2. He saves chart screenshots to  AI-OS/trading/research/chart-study/inbox/
//      named like:  AA 2021-03-01 HTF.png   ·   AA_2021-03-01_LTF.png   (any separators;
//      HTF/weekly/W → HTF slot, LTF/daily/D → LTF slot; a single unlabeled file → LTF).
//   3. This script: groups files by ticker+date → finds the study row (creates it via
//      study-fill.mjs --write if missing, so metrics/outcome auto-fill too) → uploads the
//      images to the trade-charts bucket → attaches (HTF=before_img, LTF=after_img) →
//      moves processed files to inbox/done/.
// Usage: node scripts/study-ingest.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, mkdirSync, renameSync } from 'fs';
import { execSync } from 'child_process';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const INBOX = `${process.env.HOME}/Desktop/AI-OS/trading/research/chart-study/inbox`;
const DONE = `${INBOX}/done`;
mkdirSync(DONE, { recursive: true });

const files = readdirSync(INBOX).filter(f => /\.(png|jpe?g|webp)$/i.test(f));
if (!files.length) { console.log(`inbox empty — drop charts into ${INBOX}\n  name them like: AA 2021-03-01 HTF.png / AA 2021-03-01 LTF.png`); process.exit(0); }

const groups = {};
for (const f of files) {
  const m = f.match(/^([A-Za-z.]+)[ _-]+(\d{4}-\d{2}-\d{2})(?:[ _-]+([A-Za-z]+))?\.(png|jpe?g|webp)$/);
  if (!m) { console.log(`✗ skip "${f}" — name it TICKER YYYY-MM-DD HTF|LTF.png`); continue; }
  const [, tk, date, tfRaw] = m;
  const tf = /^(htf|w|weekly|m|monthly)$/i.test(tfRaw || "") ? "HTF" : "LTF";
  const key = `${tk.toUpperCase()}|${date}`;
  (groups[key] = groups[key] || {}).ticker = tk.toUpperCase();
  groups[key].date = date;
  (groups[key].files = groups[key].files || []).push({ f, tf });
}

for (const g of Object.values(groups)) {
  console.log(`\n— ${g.ticker} ${g.date} (${g.files.map(x=>x.tf).join("+")})`);
  const find = async () => {
    const { data } = await sb.from('model_book').select('id,metrics,before_img,after_img')
      .eq('created_by', UID).eq('ticker', g.ticker).eq('entry_date', g.date);
    return (data || []).find(r => r.metrics?.study) || null;
  };
  let row = await find();
  if (!row) {
    console.log(`  no study row yet → running study-fill (auto metrics + outcome)…`);
    try { execSync(`node scripts/study-fill.mjs ${g.ticker} ${g.date} --write`, { stdio: 'inherit' }); } catch { console.log('  ✗ study-fill failed — attach skipped'); continue; }
    row = await find();
    if (!row) { console.log('  ✗ row still missing (date mismatch? study-fill may have snapped to another session — rename the file to that date)'); continue; }
  }
  const patch = {};
  for (const { f, tf } of g.files) {
    const path = `modelbook/${UID}/study/${g.ticker}-${g.date}-${tf}.png`;
    const buf = readFileSync(`${INBOX}/${f}`);
    const { error: upErr } = await sb.storage.from('trade-charts').upload(path, buf, { upsert: true, contentType: 'image/png' });
    if (upErr) { console.log(`  ✗ upload ${f}: ${upErr.message}`); continue; }
    const { data: url } = sb.storage.from('trade-charts').getPublicUrl(path);
    patch[tf === "HTF" ? "before_img" : "after_img"] = url.publicUrl;
    console.log(`  ✓ ${tf} ← ${f}`);
  }
  if (Object.keys(patch).length) {
    const { error } = await sb.from('model_book').update(patch).eq('id', row.id);
    if (error) { console.log(`  ✗ attach: ${error.message}`); continue; }
    for (const { f } of g.files) renameSync(`${INBOX}/${f}`, `${DONE}/${f}`);
    console.log(`  ✓ attached to study row · files → inbox/done/`);
  }
}
console.log(`\nDone. Open My Book → 📚 Studies to tick your buckets + grade.`);
