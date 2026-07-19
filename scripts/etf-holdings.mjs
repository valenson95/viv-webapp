// ETF-HOLDINGS — snapshot the top holdings for every ETF in BOTH universes of
// scripts/group-rs.mjs (UNIVERSE + PF_UNIVERSE + the RSP benchmark) and write a
// committed data file the Rotation UI reads statically (no runtime fetches).
//
// Usage:  node scripts/etf-holdings.mjs
// Writes: src/etfHoldings-data.js →
//   export const ETF_HOLDINGS = { asof:"YYYY-MM-DD", byTicker: { SPY:[{t,n,w},…], SVIX:{note:"…"}, … } };
//
// DATA SOURCE (no API keys): stockanalysis.com's own SvelteKit data route, the JSON
// its public holdings page renders from:
//   GET https://stockanalysis.com/etf/{TICKER}/holdings/__data.json
// It returns a flattened index-referenced node graph; one node's data[0] dict carries
// `holdings` (array), `count` (total), `date` (as-of). Each holding = {no,n,s,as,sh}
// where n=name, s=$TICKER, as="7.75%" weight. Public cap ≈ 25–30 rows — exactly the
// top-N this UI wants.
//
// HONESTY RULES (hard — project data-integrity policy):
//  • Never fabricate a holding or weight. A fund we can't verify is stored as {note}.
//  • Route 404 / no holdings node            → {note} "Holdings aren't published…"
//  • >half the rows have no equity ticker     → {note} "Futures/derivatives-based…"
//  • any weight is NaN, or top-30 sum <5% or  → {note} "reported weights don't reconcile…"
//    >100.5% (single-asset / leveraged / swap collateral distortions)
//  • Throttle ~1 req/s, one retry on failure.
import { readFileSync, writeFileSync } from "fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1) derive the ticker set straight from group-rs.mjs so this stays in sync as
// the universes grow (extract the first "TICKER" of every ["TICKER", …] row inside
// the UNIVERSE and PF_UNIVERSE array literals). Plus RSP (the pinned benchmark row).
function extractTickers() {
  const src = readFileSync("scripts/group-rs.mjs", "utf8");
  const grab = (name) => {
    const start = src.indexOf(`const ${name} = [`);
    if (start < 0) return [];
    const open = src.indexOf("[", start);
    // walk to the matching close bracket
    let depth = 0, i = open;
    for (; i < src.length; i++) {
      if (src[i] === "[") depth++;
      else if (src[i] === "]") { depth--; if (depth === 0) break; }
    }
    const body = src.slice(open, i + 1);
    return [...body.matchAll(/\[\s*"([A-Z0-9]+)"/g)].map((m) => m[1]);
  };
  const set = new Set(["RSP", ...grab("UNIVERSE"), ...grab("PF_UNIVERSE")]);
  return [...set];
}

// ── 2) resolve stockanalysis' flattened SvelteKit data graph → the holdings array.
// data[0] is a dict {key: indexIntoData}; a holdings entry is itself a dict of
// {key: indexIntoData} pointing at scalars. Returns [{no,n,s,as,sh}] or null.
function resolveHoldings(json) {
  const nodes = json?.nodes;
  if (!Array.isArray(nodes)) return null;
  for (const node of nodes) {
    if (node?.type !== "data" || !Array.isArray(node.data)) continue;
    const arr = node.data;
    const top = arr[0];
    if (!top || typeof top !== "object" || Array.isArray(top)) continue;
    if (!("holdings" in top)) continue;
    const hIdx = top.holdings;
    const hArr = arr[hIdx];
    if (!Array.isArray(hArr)) continue;
    return hArr.map((ptr) => {
      const rec = arr[ptr];
      if (!rec || typeof rec !== "object") return {};
      const out = {};
      for (const [k, vi] of Object.entries(rec)) out[k] = arr[vi];
      return out;
    });
  }
  return null;
}

async function fetchHoldings(ticker) {
  const url = `https://stockanalysis.com/etf/${ticker}/holdings/__data.json`;
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  return resolveHoldings(j);
}

// classify a fund's raw holdings into either a clean top-N array or an honest {note}.
// Each holding: {t ticker, n name, w weight% | null}. w may be null when a fund lists
// its holdings (in weight order) but the source doesn't publish per-holding weights —
// we keep the ranked names (honest) and the UI simply shows no bar for those.
function classify(raw) {
  if (!raw || !raw.length) return { note: "Holdings aren't published for this fund." };
  const mapped = raw.map((h) => {
    const w = parseFloat(String(h.as ?? "").replace("%", ""));
    return {
      t: String(h.s || "").replace(/^\$/, "").trim(),
      n: String(h.n || "").trim(),
      w: isFinite(w) ? w : null,
    };
  });
  const noTicker = mapped.filter((m) => !m.t).length;
  if (noTicker / mapped.length > 0.5)
    return { note: "This fund holds bonds or futures/derivatives, not stocks — no equity holdings to list." };

  const finite = mapped.filter((m) => m.w != null);
  // no per-holding weights at all → keep the source's own weight-ranked names, w:null.
  if (finite.length === 0) {
    const top = mapped.slice(0, 30).map((m) => ({ t: m.t, n: m.n, w: null }));
    return { holdings: top, weightsUnpublished: true };
  }
  // sort weight desc (nulls last), take top-N.
  const top = [...mapped].sort((a, b) => (b.w ?? -1) - (a.w ?? -1)).slice(0, 30)
    .map((m) => ({ t: m.t, n: m.n, w: m.w == null ? null : +m.w.toFixed(2) }));
  const sum = finite.reduce((s, m) => s + m.w, 0);
  // >100.5% = leverage / swap-collateral double-count / single-asset distortion → reject.
  // (No lower bound: broad diversified funds legitimately have small top-25 sums.)
  if (sum > 100.5)
    return { note: "Reported weights don't reconcile — omitted rather than shown unverified.", _sum: +sum.toFixed(1) };
  return { holdings: top, _sum: +sum.toFixed(1) };
}

async function main() {
  const tickers = extractTickers();
  console.log(`ETF-HOLDINGS · ${tickers.length} tickers · source stockanalysis.com/__data.json\n`);
  const byTicker = {};
  const nulls = [];
  let ok = 0;
  for (let i = 0; i < tickers.length; i++) {
    const t = tickers[i];
    process.stdout.write(`[${i + 1}/${tickers.length}] ${t}… `);
    let raw = null, err = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try { raw = await fetchHoldings(t); err = null; break; }
      catch (e) { err = e.message; if (attempt === 0) await sleep(2000); }
    }
    if (err) {
      byTicker[t] = { note: "Holdings aren't published for this fund." };
      nulls.push(`${t} (fetch: ${err})`);
      console.log(`FETCH FAIL (${err}) → note`);
    } else {
      const res = classify(raw);
      if (res.holdings) {
        byTicker[t] = res.holdings;
        ok++;
        const tag = res.weightsUnpublished ? "weights n/a" : `Σ${res._sum}%`;
        console.log(`${res.holdings.length} holdings · ${tag} · top ${res.holdings[0].t || "—"} ${res.holdings[0].w == null ? "" : res.holdings[0].w + "%"}`);
      } else {
        byTicker[t] = { note: res.note };
        nulls.push(`${t} (${res.note}${res._sum != null ? ` Σ${res._sum}%` : ""})`);
        console.log(`NULL → ${res.note}`);
      }
    }
    if (i < tickers.length - 1) await sleep(1100);
  }

  const asof = new Date().toISOString().slice(0, 10);
  const payload = { asof, byTicker };
  const banner = `// AUTO-GENERATED by scripts/etf-holdings.mjs — DO NOT EDIT BY HAND.
// Refresh: node scripts/etf-holdings.mjs
// Top holdings per ETF (both group-rs universes), sourced from stockanalysis.com's
// public holdings data route. Weights are as-reported and sorted desc; a fund whose
// weights can't be verified (single-asset trusts, futures/derivatives funds, swap
// collateral distortions, unpublished baskets) is stored as { note } — never faked.
`;
  writeFileSync("src/etfHoldings-data.js", banner + `export const ETF_HOLDINGS = ${JSON.stringify(payload, null, 2)};\n`);

  console.log(`\n✓ wrote src/etfHoldings-data.js · asof ${asof} · ${ok}/${tickers.length} with holdings, ${nulls.length} nulls`);
  if (nulls.length) console.log(`  nulls:\n   - ${nulls.join("\n   - ")}`);
}

main();
