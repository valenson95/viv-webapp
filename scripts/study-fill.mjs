// STUDY-FILL — compute every bar-derivable field of a 📚 Study entry and insert the draft
// row into My Book (model_book, metrics.study). Valen supplies only: charts, theme tick,
// grade, refusal/lesson. Bars via the deployed candles proxy (Polygon key stays in Vercel).
// AS percentile is separate (scripts/as-rank.mjs — needs POLYGON_API_KEY locally).
// Segmentation fields that need eyes (base length, pole span) stay blank on purpose.
// Usage: node scripts/study-fill.mjs TICKER YYYY-MM-DD [--write]
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.SUPABASE_URL||env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth:{persistSession:false} });
const UID='0e32b092-029a-436d-8cb5-67621e1467b0';
const WRITE = process.argv.includes('--write');
const [,, TICKER, DATE] = process.argv;
if (!TICKER || !/^\d{4}-\d{2}-\d{2}$/.test(DATE||"")) { console.error("Usage: node scripts/study-fill.mjs TICKER YYYY-MM-DD [--write]"); process.exit(1); }
const T = TICKER.toUpperCase();
const PROXY = "https://www.valensontrades.com/api/candles";

const shift = (ds, n) => { const d = new Date(ds+"T00:00:00Z"); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
async function bars(sym, from, to, res="1day") {
  const r = await fetch(`${PROXY}?symbol=${sym}&from=${from}&to=${to}&res=${res}`);
  const j = await r.json();
  if (!j.ok || !j.candles?.length) throw new Error(`${sym}: ${j.error || "no bars"}`);
  return j.candles.map(c => ({ d: new Date(c.time*1000).toISOString().slice(0,10), t:c.time, o:c.open, h:c.high, l:c.low, c:c.close, v:c.volume }));
}
// Minutes-since-midnight in New York for an epoch-seconds bar (DST-safe).
const etMins = (sec) => { const [h, m] = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour12: false, hour: "2-digit", minute: "2-digit" }).format(new Date(sec*1000)).split(":"); return +h*60 + +m; };
const sma = (a, n, i) => i+1>=n ? a.slice(i-n+1, i+1).reduce((s,x)=>s+x.c,0)/n : null;
function atr14(a, i) { // Wilder
  if (i < 15) return null;
  let atr = 0;
  for (let k = i-13; k <= i; k++) { const tr = Math.max(a[k].h-a[k].l, Math.abs(a[k].h-a[k-1].c), Math.abs(a[k].l-a[k-1].c)); atr = k===i-13 ? tr : (atr*13+tr)/14; }
  return atr;
}
const r2 = (v) => { const n=v.length, xs=v.map((_,i)=>i), my=v.reduce((s,x)=>s+x,0)/n, mx=(n-1)/2;
  let sxy=0,sxx=0,syy=0; for(let i=0;i<n;i++){sxy+=(xs[i]-mx)*(v[i]-my);sxx+=(xs[i]-mx)**2;syy+=(v[i]-my)**2;}
  return syy?(sxy*sxy)/(sxx*syy):0; };

const all = await bars(T, shift(DATE,-560), shift(DATE,40));
const spy = await bars("SPY", shift(DATE,-80), DATE);
const ti = all.findIndex(b => b.d >= DATE);
if (ti < 0 || all[ti].d !== DATE) console.log(`note: ${DATE} not a session — using ${all[ti]?.d}`);
const t = all[ti], prev = all[ti-1];
const A = atr14(all, ti-1);
const win = (n, end=ti-1) => all.slice(Math.max(0,end-n+1), end+1);
const adr20 = win(20).reduce((s,b)=>s+(b.h/b.l-1),0)/20*100;
const dolvol = win(20).reduce((s,b)=>s+b.c*b.v,0)/20/1e6;
let tight=0; for(let k=ti-1;k>0 && (all[k].h-all[k].l) < 0.6*A; k--) tight++;
let upb=0; for(let k=ti-1;k>0 && all[k].c>all[k-1].c; k--) upb++;
const orderly = !win(20).some((b,i,arr)=>i>0 && b.c/arr[i-1].c<=0.96);
const priorNR = (prev.h-prev.l)<0.6*A || prev.c<all[ti-2].c;
const re = (t.c/prev.c-1)*100, volr = t.v/prev.v, crange = (t.c-t.l)/(t.h-t.l)*100;
const gap = (t.o/prev.c-1)*100; // trigger-day gap % (open vs prior close) — pairs with his "gapped" tick + band
const rvol = t.v/(win(50).reduce((s,b)=>s+b.v,0)/50);
const hi52 = Math.max(...all.slice(Math.max(0,ti-252),ti).map(b=>b.h));
const fromHigh = (t.c/hi52-1)*100;
const s50 = sma(all,50,ti), s10p = sma(all,10,ti-1), s20p = sma(all,20,ti-1);
const ext50 = s50 && A ? (t.c-s50)/A : null;
const maSurf = s10p && s20p && prev.c>s10p && s10p>s20p && s10p>sma(all,10,ti-6) ;
const ret = (n) => ti-n>=0 ? (prev.c/all[ti-1-n].c-1)*100 : null;
const lin = r2(all.slice(Math.max(0,ti-63),ti).map(b=>Math.log(b.c)));
let bnum=1; for(let k=Math.max(1,ti-90);k<ti;k++) if(all[k].c/all[k-1].c>=1.04 && all[k].v>all[k-1].v) bnum++;
const si = spy.length-1; const spyOK = sma(spy,10,si) > sma(spy,20,si);
// ENTRY ANCHOR (Valen 2026-07-14, HARD): entry = 5-MIN OPENING-RANGE HIGH, stop = LoD — always.
// Real 5-min bars via the proxy; fallback = daily open (≈ORH floor) if intraday is unavailable.
let entry = null, entryModel = "";
for (let attempt = 0; attempt < 2 && entry == null; attempt++) {
  try {
    const intr = await bars(T, t.d, t.d, "5min");
    const rth = intr.filter(b => { const m = etMins(b.t); return m >= 570 && m < 960; }); // 09:30–16:00 ET
    if (rth.length) { entry = rth[0].h; entryModel = "5-min ORH"; }
    break; // bars came back (even if no RTH rows) — don't retry
  } catch (e) { // Polygon free tier = 5 req/min; wait out the window once rather than silently
    if (attempt === 0 && /maximum requests|exceeded/i.test(String(e.message))) { // degrading the anchor
      console.log("  (rate-limited on 5-min bars — waiting 61s and retrying…)");
      await new Promise(r => setTimeout(r, 61000));
    } else break; // genuinely unavailable for this date/plan
  }
}
if (entry == null) { entry = t.o; entryModel = "daily open (5-min bars unavailable — ≈ORH)"; }
// outcome (may be partial if <20 sessions elapsed)
const post = all.slice(ti+1, ti+22);
const lod = t.l;
if (entry < lod) { entry = t.o; entryModel = "daily open (ORH below LoD artifact)"; }
const mfe = (n) => post.length ? (Math.max(...post.slice(0,n).map(b=>b.h))/entry-1)*100 : null;
const day2 = post[0] ? (post[0].c/t.c-1)*100 : null;
let bdays=0; for(let k=0;k<post.length && (k===0?post[k].c>t.c:post[k].c>post[k-1].c);k++) bdays++;
const bpct = bdays ? (Math.max(...post.slice(0,bdays).map(b=>b.h))/prev.c-1)*100 : null;
const hiIdx = post.length ? post.reduce((m,b,i)=>b.h>post[m].h?i:m,0) : null;
const mae = hiIdx!=null ? (Math.min(...[t.l,...post.slice(0,hiIdx+1).map(b=>b.l)])/entry-1)*100 : null;
let d10=0, exitC=null;
for(let k=ti+1;k<all.length;k++){ const s10=sma(all,10,k); if(s10 && all[k].c<s10){ exitC=all[k].c; break; } d10++; }
const trailR = exitC!=null && entry>lod ? (exitC-entry)/(entry-lod) : null;
const give = (hiIdx!=null && post.length>hiIdx+1) ? (Math.min(...post.slice(hiIdx+1,hiIdx+11).map(b=>b.l))/post[hiIdx].h-1)*100 : null;
// ATR% Multiple from 50-MA at the burst PEAK (extension-tracker standing metric):
// how stretched big winners GET before the burst dies — feeds the ≥7× trim-into-strength bands.
let extPeak = null;
if (hiIdx != null) { const pk = ti+1+hiIdx, s50pk = sma(all,50,pk), Apk = atr14(all,pk);
  if (s50pk && Apk) extPeak = (all[pk].h - s50pk) / Apk; }
const f=(x,d=1)=>x==null||Number.isNaN(x)?null:+x.toFixed(d);

const m = { adr20:f(adr20), dolvol_m:f(dolvol,0), tight_days:tight, pole_pct:f(ret(63)), ext_50ma:f(ext50,2),
  from_high_pct:f(fromHigh), breakout_num:bnum+" (approx: 4% RE-days last 90)", up_days_before:upb, re_pct:f(re), gap_pct:f(gap),
  vol_ratio:f(volr,2), rvol_eod:f(rvol,2), closing_range:f(crange,0), stop_width_adr:f(((entry-lod)/entry*100)/adr20,2),
  entry_px:`${f(entry,2)} (${entryModel})`,
  ret_1m:f(ret(21)), ret_3m:f(ret(63)), ret_6m:f(ret(126)), regime: spyOK?"Y":"N", rs:"pending as-rank (needs POLYGON_API_KEY)" };
// SUGGESTED ticks only — checks belong to VALEN's eyes now (2026-07-14 split: his buckets vs auto data).
// Printed for cross-reference, NEVER written into the row.
const suggested = { tight:tight>=3, orderly, pole:(ret(63)??0)>=30, linear:lin>=0.8, young:bnum<=3, prior_nr:priorNR,
  re:re>=4&&upb<=2, up2:upb<=2, vol_exp:volr>1, closehi:crange>=70, ma_surf:!!maSurf,
  gapped:gap>=1, gap_band: gap>=1 ? (gap<2?"<2":gap<5?"2-5":gap<10?"5-10":">10") : null };
const outcome = { mfe_d1:f(mfe(1)), mfe_d3:f(mfe(3)), mfe_d5:f(mfe(5)), mfe_d20:f(mfe(20)), day2_pct:f(day2),
  burst_days:bdays||null, burst_pct:f(bpct), mae:f(mae), giveback_pct:f(give), days_above_10ma:exitC!=null?d10:`${d10}+ (still above)`,
  trail_r:f(trailR,2), ext_at_peak:f(extPeak,2), followthru: day2==null?"":(day2>0?"yes":"no") };

console.log(`\n=== ${T} @ ${t.d} (entry ${entry.toFixed(2)} = ${entryModel} · LoD stop ${t.l} · close ${t.c}) ===`);
console.log("METRICS:", JSON.stringify(m, null, 1));
console.log("SUGGESTED TICKS (data view — verify with your eyes, not written to the row):",
  Object.entries(suggested).filter(([,v])=>v).map(([k,v])=>v===true?k:`${k}=${v}`).join(", ") || "none");
console.log("DATA SAYS NO:", Object.entries(suggested).filter(([,v])=>v===false).map(([k])=>k).join(", ") || "none");
console.log("OUTCOME:", JSON.stringify(outcome, null, 1));
if (WRITE) {
  // Upsert semantics: an existing study row for this ticker+date gets its AUTO layers refreshed
  // (m + outcome + _computed) while Valen's layers (checks/ticks/grade/refusal/charts) are preserved.
  const { data: ex } = await sb.from("model_book").select("id,metrics").eq("created_by",UID).eq("ticker",T).eq("entry_date",t.d);
  const existing = (ex||[]).find(r => r.metrics?.study);
  const note = `study-fill.mjs ${new Date().toISOString().slice(0,10)} · entry = ${entryModel}, stop = LoD (Valen's standing rule) · base/pole spans = eyeball on chart`;
  if (existing) {
    const s0 = existing.metrics.study;
    const study = { ...s0, m: { ...s0.m, ...m, rs: s0.m?.rs && !/pending/.test(String(s0.m.rs)) ? s0.m.rs : m.rs }, outcome: { ...s0.outcome, ...outcome }, _computed: note };
    const { error } = await sb.from("model_book").update({ metrics: { ...existing.metrics, study } }).eq("id", existing.id);
    if (error) { console.error("✗ update:", error.message); process.exit(1); }
    console.log(`✓ refreshed auto layers on existing study row id=${existing.id} (your ticks/grade/charts untouched)`);
  } else {
    // regime_tag matches the editor's Market-condition dropdown (Uptrend/Chop/Downtrend).
    // SPY 10>20 only proves Uptrend; false could be chop OR downtrend → left blank for his eyes.
    const study = { setup:"Momentum Breakout", direction:"long", regime_tag: spyOK?"Uptrend":"",
      checks:{}, m, grade:{letter:""}, outcome, refusal:"", _computed: note };
    const { data, error } = await sb.from("model_book").insert({ created_by:UID, ticker:T, pattern:"Momentum Breakout",
      stars:0, entry_date:t.d, is_published:false, elite:[], ticked:[], characteristics:[], metrics:{ study } }).select("id");
    if (error) { console.error("✗ insert:", error.message); process.exit(1); }
    console.log(`✓ inserted study row id=${data[0].id} — open 📚 Studies in My Book to attach charts + grade`);
  }
} else console.log("(dry-run — add --write to insert into My Book studies)");
