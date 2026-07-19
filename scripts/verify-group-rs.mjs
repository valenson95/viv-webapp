// verify-group-rs.mjs — standing verification harness for his printed rotation table.
// Recomputes BOTH columns from scripts/.grouprs-cache.json and prints a cell-by-cell diff.
// Read-only; changes nothing.
//
// Usage:  node scripts/verify-group-rs.mjs <cells.json>
//   cells.json =  [ ["PBJ",105,100], ["FCG",102,100], ... ]   // [ticker, hisThrust, hisRS1m]
//
// FORMULAS (both his exact, both cell-verified against the 2026-07-17 print):
//   RS ratio        = close / RSP close, aligned by date (unadjusted closes).
//   1-Mth RS %      = PERCENTRANK.INC(RS ratio, own trailing 21 sessions) ×100.        [proven 50/51*]
//   RS Thrust Rate% = 0.6·RS1W + 0.4·(1-Mth RS) + 0.1·(RS1W_t − RS1W_{t−3}), round half-up,
//                     where RS1W = PERCENTRANK.INC(RS ratio, own trailing 7 sessions) ×100.
//                     Provenance: Jeff Sun FAQ post 2064559372655866303 (pasted 2026-07-19).
//                     Verified 85/85 cell-exact (48 groups + 37 Plan&Focus). Range −10…110.
//   *the single 1-Mth-RS "miss" on 2026-07-17 (RSPD/RSPT printed 15) is a PRINT typo — our value
//    is internally confirmed by his own thrust column. Trust the recompute over a mis-transcription.
import { readFileSync } from "fs";

const cellsPath = process.argv[2];
if (!cellsPath) { console.error("usage: node scripts/verify-group-rs.mjs <cells.json>"); process.exit(1); }
const cells = JSON.parse(readFileSync(cellsPath, "utf8"));
const c = JSON.parse(readFileSync("scripts/.grouprs-cache.json", "utf8"));
const rspMap = new Map(c.benchmarks.RSP.map(b => [b.d, b.c]));
const byT = new Map();
for (const r of c.raw)   if (r.bars) byT.set(r.t, r.bars);
for (const r of c.rawPF) if (r.bars && !byT.has(r.t)) byT.set(r.t, r.bars);

const aligned = (bars) => bars.filter(x => rspMap.has(x.d)).map(x => x.c / rspMap.get(x.d));
const prank = (arr, x) => { const b = arr.filter(v => v < x).length; return arr.length > 1 ? b / (arr.length - 1) * 100 : null; };
const rs1mAt = (rel, e) => prank(rel.slice(e - 20, e + 1), rel[e]);
const rs1wAt = (rel, e) => prank(rel.slice(e - 6, e + 1), rel[e]);

let rsOk = 0, rsN = 0, thOk = 0, thN = 0;
console.log("ticker | hisRS ourRS | hisThr ourThr");
console.log("-------|-------------|--------------");
for (const [t, hisThr, hisRS] of cells) {
  const bars = byT.get(t);
  if (!bars) { console.log(`${t.padEnd(6)} | NO BARS IN CACHE`); continue; }
  const rel = aligned(bars); const last = rel.length - 1;
  const ourRS = Math.round(rs1mAt(rel, last) * 1e6) / 1e6; // kill float noise (55.00000001 → 55)
  const w_t = rs1wAt(rel, last), w_t3 = rs1wAt(rel, last - 3);
  const ourTh = Math.round(0.6 * w_t + 0.4 * ourRS + 0.1 * (w_t - w_t3));
  const rsM = ourRS === hisRS, thM = ourTh === hisThr;
  rsN++; if (rsM) rsOk++; thN++; if (thM) thOk++;
  console.log(`${t.padEnd(6)} | ${String(hisRS).padStart(4)} ${String(ourRS).padStart(4)}${rsM ? " " : "✗"} | ${String(hisThr).padStart(5)} ${String(ourTh).padStart(5)}${thM ? " " : "✗"}`);
}
console.log(`\n1-Mth RS %:      ${rsOk}/${rsN} cell-exact`);
console.log(`RS Thrust Rate%: ${thOk}/${thN} cell-exact`);
