// One-shot: backfill BROS daily bars into scripts/.grouprs-cache.json so the new
// ["BROS","Dutch Bros (watchlist stock)"] UNIVERSE row computes (Hunt List coverage audit 2026-08-06).
// Cache law: `raw` is an ARRAY of {t,name,bars} — find/splice, never object-key writes.
// Run: node --env-file=.env.local scripts/backfill-soxx-20260806.mjs
import { readFileSync, writeFileSync } from "fs";

const PROXY = "https://www.valensontrades.com/api/candles";
const shift = (ds, n) => { const d = new Date(ds + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const _d = new Date(), _p = (n) => String(n).padStart(2, "0");
const today = `${_d.getFullYear()}-${_p(_d.getMonth() + 1)}-${_p(_d.getDate())}`;
const FROM = shift(today, -420);

const r = await fetch(`${PROXY}?symbol=BROS&from=${FROM}&to=${today}&res=1day`);
const j = await r.json();
if (!j.ok || !j.candles?.length) throw new Error(`BROS fetch failed: ${j.error || "no bars"}`);
const bars = j.candles.map(c => ({ d: new Date(c.time * 1000).toISOString().slice(0, 10), t: c.time, o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume }));
console.log(`BROS: ${bars.length} bars, ${bars[0].d} → ${bars[bars.length - 1].d}`);

const path = "scripts/.grouprs-cache.json";
const cache = JSON.parse(readFileSync(path, "utf8"));
if (!Array.isArray(cache.raw)) throw new Error("cache.raw is not an array — refusing to touch it");
const i = cache.raw.findIndex(x => x.t === "BROS");
const entry = { t: "BROS", name: "Dutch Bros (watchlist stock)", bars };
if (i >= 0) cache.raw.splice(i, 1, entry); else cache.raw.push(entry);
writeFileSync(path, JSON.stringify(cache));
console.log(`cache saved · ${cache.raw.length} entries`);
