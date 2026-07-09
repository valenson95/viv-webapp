// size-3stop.mjs — Jeff-Sun 3-stop position sizer (the "auto-quantity" engine).
// Pure calculator: given an entry, the LoD/hard stop, and a risk budget (% of NLV OR a fixed $),
// it auto-computes total shares, the three staggered stop levels + ⅓/⅓/⅓ share splits, the
// worst-case loss (−0.67R), capital deployed, and (optional) the R:R to a target.
//
// Standalone (numbers only — no account, no orders):
//   node scripts/size-3stop.mjs --entry 9.10 --stop 8.60 --risk-pct 0.5 --nlv 100000
//   node scripts/size-3stop.mjs --ticker AMPL --entry 9.10 --stop 8.60 --risk 500 --atr 0.55 --target 11.50
//   node scripts/size-3stop.mjs --side short --entry 50 --stop 52 --risk 500
//
// The `arm-trade` skill calls this after pulling live NLV from the IBKR connector, then
// (optionally) adds the ticker to a watchlist + drafts the entry INSTRUCTION (review-then-submit).
// This mirrors the trade-log pre-entry gate math — single source of truth. Educational, not advice.

const args = process.argv.slice(2);
const flag = (k, d = null) => { const i = args.indexOf(`--${k}`); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const has = (k) => args.includes(`--${k}`);
const num = (v) => (v == null ? null : Number(v));

const ticker = (flag("ticker") || "").toUpperCase();
const side = (flag("side", "long")).toLowerCase();          // long | short
const entry = num(flag("entry"));
const stop = num(flag("stop"));                              // = Stop 3 = LoD (long) / HoD (short); the LOCKED stop
const riskPct = num(flag("risk-pct"));                       // % of NLV
const nlv = num(flag("nlv"));                                // net liquidation value
const riskAbs = num(flag("risk"));                           // fixed $ risk (overrides risk-pct)
const atr = num(flag("atr"));                                // optional — enables LoD-distance gate check
const target = num(flag("target"));                          // optional — enables R:R
const tick = num(flag("tick")) || (entry != null && entry < 1 ? 0.001 : 0.01);

function die(msg) { console.error(`\n  ✗ ${msg}\n`); process.exit(1); }
if (entry == null || isNaN(entry)) die("Missing --entry <price>");
if (stop == null || isNaN(stop)) die("Missing --stop <price>  (the LoD / hard stop = Stop 3, the locked stop)");
if (side !== "long" && side !== "short") die("--side must be long or short");

// Risk budget $
let riskD = null, riskSrc = "";
if (riskAbs != null && !isNaN(riskAbs)) { riskD = riskAbs; riskSrc = `fixed $${riskAbs.toLocaleString()}`; }
else if (riskPct != null && nlv != null && !isNaN(riskPct) && !isNaN(nlv)) { riskD = nlv * riskPct / 100; riskSrc = `${riskPct}% of NLV $${nlv.toLocaleString()}`; }
else die("Provide a risk budget: --risk <$>  OR  --risk-pct <%> --nlv <$>");
if (riskD <= 0) die("Risk budget must be > 0");

// Direction math. D = full stop distance (always positive). Sign flips stop placement for shorts.
const dir = side === "long" ? 1 : -1;
const D = (entry - stop) * dir;                              // long: entry−stop ; short: stop−entry
if (D <= 0) die(side === "long" ? "For a long, --stop must be BELOW --entry" : "For a short, --stop must be ABOVE --entry");

const roundTick = (p) => Math.round(p / tick) * tick;
const dp = tick < 0.01 ? 3 : 2;
const px = (p) => "$" + roundTick(p).toFixed(dp);

// Total shares (whole lots, rounded DOWN so risk never exceeds budget)
const totalShares = Math.floor(riskD / D);
if (totalShares < 3) die(`Risk budget $${riskD.toFixed(0)} ÷ stop distance $${D.toFixed(dp)} = ${totalShares} sh — too few to split in 3. Widen risk or tighten the stop.`);

// 3 staggered stops at ⅓ / ⅔ / full of D ; ⅓ size each (remainder to the last third)
const n1 = Math.floor(totalShares / 3), n2 = Math.floor(totalShares / 3), n3 = totalShares - n1 - n2;
const s1 = roundTick(entry - dir * D / 3);
const s2 = roundTick(entry - dir * 2 * D / 3);
const s3 = roundTick(stop);

// Worst case: all three fill. Loss per share at each = its distance from entry.
const lossAt = (p, n) => Math.abs(entry - p) * n;
const worstD = lossAt(s1, n1) + lossAt(s2, n2) + lossAt(s3, n3);
const worstR = worstD / riskD;

const capital = totalShares * entry;
const capPctNlv = nlv ? (capital / nlv) * 100 : null;

// Optional gate reads
const lodDist = atr ? D / atr : null;                       // (entry−stop)/ATR — want ≤ 0.60
const rr = target != null ? Math.abs(target - entry) / D : null;

// ── output ───────────────────────────────────────────────────────────────────
const L = [];
L.push("");
L.push(`  ┌─ 3-STOP SIZER ${ticker ? "· " + ticker + " " : ""}· ${side.toUpperCase()} ${"─".repeat(Math.max(0, 34 - ticker.length))}`);
L.push(`  │  Entry ${px(entry)}   Stop(LoD) ${px(stop)}   D ${px(Math.abs(D)).replace("$", "$")}   Risk ${riskSrc} = $${riskD.toFixed(0)}`);
if (lodDist != null) L.push(`  │  LoD-distance ${(lodDist * 100).toFixed(0)}% of ATR ${lodDist > 0.6 ? "⚠ OVER 60% — Jeff says pass at time" : "✓ ≤60%"}   (ATR ${px(atr)})`);
L.push(`  ├─ SIZE`);
L.push(`  │    Total shares      ${totalShares.toLocaleString()}   (risk$ ÷ D, floored)`);
L.push(`  │    Capital deployed  $${Math.round(capital).toLocaleString()}${capPctNlv != null ? `   (${capPctNlv.toFixed(1)}% of NLV)` : ""}`);
L.push(`  ├─ THE 3 STOPS  (place as 3 STP sells in IBKR — connector can't set stops)`);
L.push(`  │    Stop 1  ${px(s1)}   ${n1.toLocaleString()} sh   (−${(1/3*100).toFixed(0)}% of D · −0.33R slice)`);
L.push(`  │    Stop 2  ${px(s2)}   ${n2.toLocaleString()} sh   (−${(2/3*100).toFixed(0)}% of D · −0.67R slice)`);
L.push(`  │    Stop 3  ${px(s3)}   ${n3.toLocaleString()} sh   (LoD · locked · −1.00R slice)`);
L.push(`  ├─ WORST CASE (all 3 hit)   −$${worstD.toFixed(0)}  =  −${worstR.toFixed(2)}R   ${worstR <= 0.7 ? "✓" : "⚠"}`);
if (rr != null) L.push(`  │  Target ${px(target)}  →  ${rr.toFixed(1)}R  to target  (reward ÷ D)`);
L.push(`  └─ NEVER move Stop 3 up — it's the locked LoD that defines R. Trails go to trailing_stop.`);
L.push("");

console.log(L.join("\n"));

// Machine-readable tail (the skill parses this line)
console.log("JSON " + JSON.stringify({
  ticker, side, entry, stop, D: +Math.abs(D).toFixed(dp), riskD: +riskD.toFixed(2), totalShares,
  stops: [{ px: +s1.toFixed(dp), sh: n1 }, { px: +s2.toFixed(dp), sh: n2 }, { px: +s3.toFixed(dp), sh: n3 }],
  worstD: +worstD.toFixed(2), worstR: +worstR.toFixed(3), capital: +capital.toFixed(2),
  capPctNlv: capPctNlv != null ? +capPctNlv.toFixed(2) : null, lodDist: lodDist != null ? +lodDist.toFixed(3) : null, rr: rr != null ? +rr.toFixed(2) : null,
}));
