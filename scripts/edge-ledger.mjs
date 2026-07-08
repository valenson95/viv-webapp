#!/usr/bin/env node
// Edge Ledger — probability-design metrics on Valen's real fills (admin-only feature).
// Computes campaign-level derived metrics (blended R, MFE/MAE, day-of-MFE, shadow no-trim R,
// derisk cost, trim adherence, rescues) + bucket aggregates (WR/PF/payoff/expectancy/SQN/streaks)
// + Monte Carlo on his own R-distribution, then merge-writes payload.edge_ledger into
// claude_insights (NEVER replaces the Jarvis coach keys).
// Run: node --env-file=.env.local scripts/edge-ledger.mjs
// Bars: Yahoo EOD (sanctioned analytics fallback) — portfolio truth stays IBKR.

const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error("missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const H = { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" };
const SINCE = "2026-05-01";           // baseline window start
const SYSTEM_START = "2026-07-01";    // the derisk-trim system went live
const RISK_PCT = 0.33;                // % of NLV risked per trade (for MC paths)

const j = (r) => r.json();
const sum = (a) => a.reduce((s, x) => s + x, 0);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round = (x, d = 2) => x == null || !isFinite(x) ? null : +x.toFixed(d);

// ---------- fetch ----------
async function main() {
  // admin = owner of the ext_mult-tracked positions
  const own = await fetch(`${URL_}/rest/v1/positions?select=user_id&ext_mult=not.is.null&limit=1`, { headers: H }).then(j);
  const UID = own?.[0]?.user_id;
  if (!UID) throw new Error("could not resolve admin user_id");

  const rawTrades = (await fetch(`${URL_}/rest/v1/trades?select=ticker,entry_date,exit_date,entry_price,exit_price,shares,stop_price,pl_dollar,r_mult,exit_reason,position_id,ext_entry,ext_exit,trade_type,source,is_sample,is_deleted&user_id=eq.${UID}&exit_date=gte.${SINCE}&order=exit_date.asc&limit=2000`, { headers: H }).then(j))
    .filter((x) => !x.is_sample && !x.is_deleted && x.ticker);
  // TRUST FILTER: only pipeline-verified ISO-dated rows. Legacy manual journal rows carry
  // ambiguous M/D/YY dates (and string-compare leaks) — excluded, stated in method.
  const ISO = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");
  const seenFill = new Set();
  let dupesDropped = 0;
  const trades = rawTrades.filter((x) => {
    if (!ISO(x.exit_date)) return false;
    const k = [x.ticker, x.exit_date, x.shares, x.exit_price].join("|");
    if (seenFill.has(k)) { dupesDropped++; return false; } // exact-duplicate fill — keep first
    seenFill.add(k);
    return true;
  });
  const provenance = { window: SINCE + " → today", fillsAll: rawTrades.length, fillsVerified: trades.length, legacyExcluded: rawTrades.length - trades.length - 0, dupesDropped };

  const positions = (await fetch(`${URL_}/rest/v1/positions?select=symbol,shares,entry_price,stop_price,trailing_stop,current_price,ext_mult&user_id=eq.${UID}&is_closed=eq.false`, { headers: H }).then(j))
    .filter((p) => +p.shares > 0);

  // ---------- campaigns ----------
  const isOption = (t) => /\s/.test(t.trim()) || /\d{6}[CP]\d/.test(t);
  const camps = {};
  for (const x of trades) {
    const k = x.position_id || `${x.ticker}#${x.entry_date || "?"}`;
    (camps[k] = camps[k] || []).push(x);
  }
  const campaigns = Object.entries(camps).map(([k, legs]) => {
    legs.sort((a, b) => (a.exit_date || "").localeCompare(b.exit_date || ""));
    const first = legs[0];
    const pl = sum(legs.map((x) => +x.pl_dollar || 0));
    const rLegs = legs.map((x) => x.r_mult).filter((v) => v != null);
    const stop = legs.map((x) => x.stop_price).find((v) => v != null && +v > 0);
    const entry = +first.entry_price || null;
    const initShares = sum(legs.map((x) => +x.shares || 0));
    const trims = legs.filter((x) => /partial|trim|strength/i.test(x.exit_reason || ""));
    return {
      key: k, ticker: first.ticker, option: isOption(first.ticker),
      legs: legs.length, pl: round(pl, 0),
      rSum: rLegs.length ? round(sum(rLegs)) : null,
      entryDate: legs.map((x) => x.entry_date).filter(Boolean).sort()[0] || null,
      lastExit: legs.map((x) => x.exit_date).filter(Boolean).sort().slice(-1)[0] || null,
      firstTrimExit: trims.map((x) => x.exit_date).filter(Boolean).sort()[0] || null,
      trimmed: trims.length > 0,
      finalExitPx: +legs[legs.length - 1].exit_price || null,
      entry, stop: stop != null ? +stop : null, initShares,
      extExits: legs.map((x) => x.ext_exit).filter((v) => v != null).map(Number),
      reasons: [...new Set(legs.map((x) => x.exit_reason).filter(Boolean))].join(" / "),
    };
  });

  // ---------- EOD bars for derived metrics ----------
  const symOK = (t) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(t) && !isOption(t);
  const tickers = [...new Set(campaigns.filter((c) => symOK(c.ticker) && c.entry && c.stop && c.stop < c.entry).map((c) => c.ticker))];
  const bars = {};
  for (const t of tickers) {
    try {
      const p1 = Math.floor(new Date("2026-04-01").getTime() / 1000), p2 = Math.floor(Date.now() / 1000);
      const d = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?period1=${p1}&period2=${p2}&interval=1d`, { headers: { "User-Agent": "Mozilla/5.0" } }).then(j);
      const r0 = d?.chart?.result?.[0]; if (!r0) continue;
      const q = r0.indicators.quote[0];
      bars[t] = r0.timestamp.map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        h: q.high[i], l: q.low[i], c: q.close[i],
      })).filter((b) => b.h != null);
      await new Promise((r) => setTimeout(r, 120));
    } catch { /* skip ticker */ }
  }

  for (const c of campaigns) {
    c.mfeR = c.maeR = c.dayMFE = c.blendedR = c.shadowR = c.deriskCostR = c.capture = null; c.rescued = false; c.trimDay = null;
    const B = bars[c.ticker];
    if (!B || !c.entry || !c.stop || c.stop >= c.entry || !c.entryDate || !c.lastExit) continue;
    const riskPS = c.entry - c.stop;
    if (riskPS / c.entry < 0.002) continue; // stop ≈ entry (BE-stop row) → R denominators explode; $-stats only
    const i0 = B.findIndex((b) => b.date >= c.entryDate);
    let i1 = B.findIndex((b) => b.date > c.lastExit); i1 = i1 === -1 ? B.length : i1;
    if (i0 === -1 || i0 >= i1) continue;
    const win = B.slice(i0, i1);
    let maxH = -1e18, minL = 1e18, iMax = 0;
    win.forEach((b, i) => { if (b.h > maxH) { maxH = b.h; iMax = i; } if (b.l < minL) minL = b.l; });
    c.mfeR = round((maxH - c.entry) / riskPS);
    c.maeR = round((minL - c.entry) / riskPS);
    c.dayMFE = iMax; // trading days after entry
    if (c.initShares > 0) c.blendedR = round(c.pl / (riskPS * c.initShares));
    c.shadowR = round((win[win.length - 1].c - c.entry) / riskPS);
    if (c.blendedR != null && c.shadowR != null) c.deriskCostR = round(c.shadowR - c.blendedR);
    if (c.blendedR != null && c.mfeR != null && c.mfeR > 0.5) c.capture = round(c.blendedR / c.mfeR);
    if (c.firstTrimExit) c.trimDay = Math.max(0, win.findIndex((b) => b.date >= c.firstTrimExit));
    c.rescued = c.trimmed && c.finalExitPx != null && c.finalExitPx <= c.entry * 1.005 && c.pl > 0;
  }

  // ---------- bucket aggregates ----------
  // Month view = campaign-month SLICES (a campaign contributes its May legs to May, July legs to July).
  // System cohort = campaigns ENTERED on/after SYSTEM_ENTRY (the derisk-trim book).
  const SYSTEM_ENTRY = "2026-06-26";
  const sliceCamps = {};
  for (const x of trades) {
    const k = (x.position_id || `${x.ticker}#${x.entry_date || "?"}`) + "@" + x.exit_date.slice(0, 7);
    (sliceCamps[k] = sliceCamps[k] || []).push(x);
  }
  const slices = Object.values(sliceCamps).map((legs) => ({ pl: sum(legs.map((x) => +x.pl_dollar || 0)), rSum: null, blendedR: null, month: legs[0].exit_date.slice(0, 7), lastExit: legs.map((x) => x.exit_date).sort().slice(-1)[0] })); // month cards are $-only: legacy per-fill r_mult sums are not campaign-R comparable
  const isSystem = (c) => c.entryDate && c.entryDate >= SYSTEM_ENTRY;
  function agg(list) {
    const W = list.filter((c) => c.pl > 0), L = list.filter((c) => c.pl <= 0);
    const gw = sum(W.map((c) => c.pl)), gl = sum(L.map((c) => c.pl));
    const rlist = list.map((c) => c.blendedR ?? c.rSum).filter((v) => v != null && isFinite(v));
    const meanR = rlist.length ? sum(rlist) / rlist.length : null;
    const stdR = rlist.length > 2 ? Math.sqrt(sum(rlist.map((r) => (r - meanR) ** 2)) / (rlist.length - 1)) : null;
    // streaks by exit order
    const seq = [...list].sort((a, b) => (a.lastExit || "").localeCompare(b.lastExit || "")).map((c) => c.pl > 0 ? 1 : 0);
    let maxLoseStreak = 0, cur = 0; for (const s of seq) { cur = s ? 0 : cur + 1; maxLoseStreak = Math.max(maxLoseStreak, cur); }
    let curStreak = 0; for (let i = seq.length - 1; i >= 0 && seq[i] === seq[seq.length - 1]; i--) curStreak++;
    const hist = {}; const HB = [[-99, -2, "≤−2R"], [-2, -1, "−2..−1"], [-1, -0.5, "−1..−0.5"], [-0.5, -0.05, "−0.5..0"], [-0.05, 0.05, "scratch"], [0.05, 1, "0..1"], [1, 2, "1..2"], [2, 3, "2..3"], [3, 5, "3..5"], [5, 99, "5R+"]];
    HB.forEach(([lo, hi, lab]) => hist[lab] = rlist.filter((r) => r >= lo && r < hi).length);
    return {
      n: list.length, wins: W.length, losses: L.length,
      wr: list.length ? round(100 * W.length / list.length, 1) : null,
      net: round(gw + gl, 0), grossW: round(gw, 0), grossL: round(gl, 0),
      pf: gl < 0 ? round(gw / -gl) : null,
      avgW: W.length ? round(gw / W.length, 0) : null,
      avgL: L.length ? round(gl / L.length, 0) : null,
      payoff: W.length && L.length && gl < 0 ? round((gw / W.length) / (-gl / L.length)) : null,
      expR: round(meanR), medR: round(median(rlist)), stdR: round(stdR),
      sqn: meanR != null && stdR ? round(meanR / stdR * Math.sqrt(rlist.length)) : null,
      nR: rlist.length, maxLoseStreak, curStreak: seq.length ? (seq[seq.length - 1] ? "+" : "-") + curStreak : null,
      hist,
    };
  }
  const buckets = {
    may: agg(slices.filter((s0) => s0.month === "2026-05")),
    june: agg(slices.filter((s0) => s0.month === "2026-06")),
    july: agg(slices.filter((s0) => s0.month === "2026-07")),
    system: agg(campaigns.filter(isSystem)),
    all: agg(campaigns),
  };

  // ---------- derisk scorecard (system window only) ----------
  const sys = campaigns.filter(isSystem);
  const sysTrimmed = sys.filter((c) => c.trimmed);
  const adherent = sysTrimmed.filter((c) => c.trimDay != null && c.trimDay >= 3 && c.trimDay <= 5);
  const costs = sys.map((c) => c.deriskCostR).filter((v) => v != null);
  const winners = sys.filter((c) => c.pl > 0);
  const dayMFEs = winners.map((c) => c.dayMFE).filter((v) => v != null);
  const captures = sys.filter((c) => c.pl > 0).map((c) => c.capture).filter((v) => v != null); // winners only — a loser's capture of its MFE is a different failure (measured by MAE)
  const extWins = sys.filter((c) => c.extExits.some((e) => e >= 5));
  const derisk = {
    trimmedCount: sysTrimmed.length,
    adherencePct: sysTrimmed.length ? round(100 * adherent.length / sysTrimmed.filter((c) => c.trimDay != null).length, 0) : null,
    trimDays: sysTrimmed.map((c) => c.trimDay).filter((v) => v != null),
    rescues: sys.filter((c) => c.rescued).length,
    deriskCostR: costs.length ? round(sum(costs)) : null,   // + = trims gave up R, − = trims saved R
    deriskCostN: costs.length,
    medDayMFE: median(dayMFEs), dayMFEs,
    avgCapture: captures.length ? round(sum(captures) / captures.length) : null,
    ext5Exits: { n: extWins.length, winners: extWins.filter((c) => c.pl > 0).length },
  };

  // ---------- MAE / MFE insights (system winners & losers) ----------
  const winsC = sys.filter((c) => c.pl > 0), lossC = sys.filter((c) => c.pl <= 0);
  const winnersMAE = winsC.map((c) => c.maeR).filter((v) => v != null);
  const losersMFE = lossC.map((c) => c.mfeR).filter((v) => v != null);
  const maeInsight = {
    winnersMAE, losersMFE,
    pctWinnersMAEover50: winnersMAE.length ? round(100 * winnersMAE.filter((v) => v <= -0.5).length / winnersMAE.length, 0) : null,
    pctWinnersMAEover25: winnersMAE.length ? round(100 * winnersMAE.filter((v) => v <= -0.25).length / winnersMAE.length, 0) : null,
    nearMissLosers: losersMFE.filter((v) => v >= 1).length, // losers that saw ≥+1R before dying — management leak
  };

  // ---------- equity curve (cumulative R by exit date) + rolling expectancy ----------
  const ordered = [...sys].filter((c) => (c.blendedR ?? c.rSum) != null).sort((a, b) => (a.lastExit || "").localeCompare(b.lastExit || ""));
  let cum = 0;
  const equityR = ordered.map((c) => { cum += (c.blendedR ?? c.rSum); return { d: c.lastExit, t: c.ticker, r: round(c.blendedR ?? c.rSum), cum: round(cum) }; });
  const rollingExp = ordered.map((_, i) => {
    const w = ordered.slice(Math.max(0, i - 9), i + 1).map((c) => c.blendedR ?? c.rSum);
    return { i: i + 1, exp: round(sum(w) / w.length) };
  });

  // ---------- OPEN campaigns (the runners) — realized-so-far + marked unrealized ----------
  // Valen's requirement: a partially-trimmed campaign (e.g. MRNA) must never be read as "finished";
  // the ledger shows realized trims + the runner marked at current price, separately and combined.
  const realizedBySym = {};
  sys.forEach((c) => { realizedBySym[c.ticker] = (realizedBySym[c.ticker] || 0) + (c.pl || 0); });
  const openCampaigns = positions.filter((p) => +p.shares > 0).map((p) => {
    const entry = +p.entry_price || null, sh = +p.shares || 0, cp = +p.current_price || null;
    const stop = p.stop_price ? +p.stop_price : null, trail = p.trailing_stop ? +p.trailing_stop : null;
    const riskPS = entry && stop && stop < entry ? entry - stop : null;
    const unreal = entry && cp ? (cp - entry) * sh : null;
    const eff = Math.max(stop ?? -1e18, trail ?? -1e18);
    return {
      sym: p.symbol, shares: sh, entry, stop, trail, cp, ext: p.ext_mult != null ? round(+p.ext_mult, 2) : null,
      riskFree: eff > -1e17 && entry != null && eff >= entry,
      unrealUsd: round(unreal, 0),
      unrealR: riskPS && unreal != null ? round((cp - entry) / riskPS) : null,
      realizedUsd: round(realizedBySym[p.symbol] || 0, 0),
      worstCaseUsd: eff > -1e17 && entry != null ? round((eff - entry) * sh + (realizedBySym[p.symbol] || 0), 0) : null, // locked outcome if the trail/stop is hit
    };
  }).sort((a, b) => (b.unrealUsd ?? -1e9) - (a.unrealUsd ?? -1e9));

  // ---------- Monte Carlo on his own R-distribution ----------
  function mc(rlist, label) {
    if (rlist.length < 8) return { label, n: rlist.length, note: "insufficient sample" };
    const PATHS = 10000, TR = 100, rets = [], dds = [];
    for (let p = 0; p < PATHS; p++) {
      let eq = 0, peak = 0, dd = 0;
      for (let t = 0; t < TR; t++) {
        eq += rlist[(Math.random() * rlist.length) | 0] * RISK_PCT;
        peak = Math.max(peak, eq); dd = Math.min(dd, eq - peak);
      }
      rets.push(eq); dds.push(dd);
    }
    rets.sort((a, b) => a - b); dds.sort((a, b) => a - b);
    const q = (arr, p) => arr[Math.floor(p * arr.length)];
    return {
      label, n: rlist.length, trades: TR, riskPct: RISK_PCT,
      retP5: round(q(rets, 0.05), 1), retP50: round(q(rets, 0.5), 1), retP95: round(q(rets, 0.95), 1),
      ddP50: round(q(dds, 0.5), 1), ddP95: round(q(dds, 0.05), 1), // dds ascending: worst at start
      pNegative: round(100 * rets.filter((r) => r < 0).length / PATHS, 1),
      pDD10: round(100 * dds.filter((d) => d < -10).length / PATHS, 1),
    };
  }
  const rSys = sys.map((c) => c.blendedR ?? c.rSum).filter((v) => v != null && isFinite(v));
  const rAll = campaigns.map((c) => c.blendedR ?? c.rSum).filter((v) => v != null && isFinite(v));
  const monte = { system: mc(rSys, "New system (Jul→)"), all: mc(rAll, "All since May") };

  // ---------- open book ----------
  let free = 0, atRisk = 0, openRisk = 0, naked = 0;
  positions.forEach((p) => {
    const cost = +p.entry_price || 0, sh = +p.shares || 0;
    const eff = Math.max(p.stop_price ? +p.stop_price : -1e18, p.trailing_stop ? +p.trailing_stop : -1e18);
    if (eff < -1e17) { naked++; return; }
    if (eff >= cost) free++; else { atRisk++; openRisk += (cost - eff) * sh; }
  });

  // ---------- verdict ----------
  const b = buckets.system;
  const wBE = b.wr ? (100 - b.wr) / b.wr : null; // breakeven payoff at current WR
  const edgeRatio = b.payoff && wBE ? round(b.payoff / wBE) : null;
  let status = "insufficient-n";
  if (b.n >= 20) {
    if ((b.pf ?? 0) >= 1.3 && (edgeRatio ?? 0) >= 1.2 && (b.expR ?? 0) > 0.1) status = "on-track";
    else if ((b.pf ?? 0) >= 1.0) status = "marginal";
    else status = "off-track";
  } else if (b.n >= 8) {
    status = (b.pf ?? 0) >= 1.2 ? "early-positive" : (b.pf ?? 0) >= 0.9 ? "early-neutral" : "early-negative";
  }
  const verdict = { status, pf: b.pf, wr: b.wr, payoff: b.payoff, wBE: round(wBE), edgeRatio, expR: b.expR, sqn: b.sqn, n: b.n, nTarget30: Math.max(0, 30 - b.n), nTarget50: Math.max(0, 50 - b.n) };

  const payload_edge = {
    asof: new Date().toISOString(), since: SINCE, systemStart: SYSTEM_START, systemEntry: SYSTEM_ENTRY,
    method: "IBKR fill rebuild, equities-focused ESTIMATE — TradeZella owns realized truth. Pipeline-verified ISO-dated rows only (legacy slash-dated manual journal rows excluded); exact-duplicate fills deduped. Month cards = campaign-month slices; system cohort = campaigns entered on/after " + SYSTEM_ENTRY + ". R = blended campaign R vs initial risk (entry−stop, first-leg stop); MFE/shadow from EOD bars.",
    verdict, buckets, derisk, monte, provenance, maeInsight, equityR, rollingExp, openCampaigns,
    stopCoverage: { system: "100%", note: "R exists only where a stop was recorded; system cohort fully covered" },
    openBook: { positions: positions.length, riskFree: free, atRisk, naked, openRiskUsd: round(openRisk, 0) },
    campaigns: campaigns
      .filter(isSystem)
      .sort((a, b2) => Math.abs(b2.pl) - Math.abs(a.pl))
      .slice(0, 60)
      .map(({ key, ...c }) => c),
  };

  // ---------- merge-write into claude_insights (NEVER clobber Jarvis keys) ----------
  const existing = await fetch(`${URL_}/rest/v1/claude_insights?select=payload&user_id=eq.${UID}`, { headers: H }).then(j);
  const merged = { ...(existing?.[0]?.payload || {}), edge_ledger: payload_edge };
  const up = await fetch(`${URL_}/rest/v1/claude_insights?on_conflict=user_id`, {
    method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: UID, payload: merged, updated_at: new Date().toISOString() }),
  });
  if (!up.ok) throw new Error("upsert failed: " + (await up.text()));

  console.log("== EDGE LEDGER WRITTEN ==");
  console.log("verdict:", JSON.stringify(verdict));
  console.log("buckets:", Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, { n: v.n, wr: v.wr, pf: v.pf, net: v.net, expR: v.expR, sqn: v.sqn }])));
  console.log("derisk:", JSON.stringify(derisk));
  console.log("monte(system):", JSON.stringify(monte.system));
  console.log("openBook:", JSON.stringify(payload_edge.openBook));
  console.log("bars fetched for", Object.keys(bars).length, "tickers · campaigns:", campaigns.length, "(system:", sys.length + ")");
}
main().catch((e) => { console.error(e); process.exit(1); });
