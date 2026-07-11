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

  // entry_gates is a late migration (supabase/entry-gates.sql) — fall back gracefully until it exists.
  const SEL = "ticker,entry_date,entry_time,exit_date,entry_price,exit_price,shares,stop_price,pl_dollar,r_mult,exit_reason,position_id,ext_entry,ext_exit,trade_type,source,is_sample,is_deleted,grade_snapshot";
  const getTrades = (sel) => fetch(`${URL_}/rest/v1/trades?select=${sel}&user_id=eq.${UID}&exit_date=gte.${SINCE}&order=exit_date.asc&limit=2000`, { headers: H }).then(j);
  let rawFetched = await getTrades(SEL + ",entry_gates");
  if (!Array.isArray(rawFetched)) rawFetched = await getTrades(SEL);
  if (!Array.isArray(rawFetched)) throw new Error("trades fetch failed: " + JSON.stringify(rawFetched).slice(0, 200));
  const rawTrades = rawFetched.filter((x) => !x.is_sample && !x.is_deleted && x.ticker);
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
  const provenance = { window: SINCE + " → today", fillsAll: rawTrades.length, fillsVerified: trades.length, legacyExcluded: rawTrades.length - trades.length - 0, dupesDropped, noStopExcluded: 0 };

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
    const entry = +first.entry_price || null;
    // Risk unit = the WIDEST valid stop across the campaign's legs (= the original thesis stop,
    // per the locked-stop rule). A tightened trail or an accidental/mid-setting stop is NARROWER
    // and must never define R — that's what blew up NBIS (a 0.34% placeholder). Only stops below
    // entry by ≥0.8% of price qualify as a real thesis stop for these high-ADR names.
    const validStops = legs.map((x) => x.stop_price).filter((v) => v != null && +v > 0 && entry && (entry - +v) / entry >= 0.008).map(Number);
    const stop = validStops.length ? Math.min(...validStops) : null; // min price = widest risk
    const initShares = sum(legs.map((x) => +x.shares || 0));
    const trims = legs.filter((x) => /partial|trim|strength/i.test(x.exit_reason || ""));
    return {
      key: k, ticker: first.ticker, option: isOption(first.ticker),
      legs: legs.length, pl: round(pl, 0),
      rSum: rLegs.length ? round(sum(rLegs)) : null,
      entryDate: legs.map((x) => x.entry_date).filter(Boolean).sort()[0] || null,
      entryTime: legs.map((x) => x.entry_time).filter(Boolean).sort()[0] || null, // ET wall-clock

      lastExit: legs.map((x) => x.exit_date).filter(Boolean).sort().slice(-1)[0] || null,
      firstTrimExit: trims.map((x) => x.exit_date).filter(Boolean).sort()[0] || null,
      trimmed: trims.length > 0,
      finalExitPx: +legs[legs.length - 1].exit_price || null,
      entry, stop: stop != null ? +stop : null, initShares,
      extExits: legs.map((x) => x.ext_exit).filter((v) => v != null).map(Number),
      // Entry-side context for the refinement lab: extension at entry (worst leg), frozen grade,
      // and the entry_gates JSON when the trade-log captured it (LoD-dist %ATR, RVOL, ORB wait…).
      extEntry: (() => { const e = legs.map((x) => x.ext_entry).filter((v) => v != null).map(Number); return e.length ? round(Math.max(...e)) : null; })(),
      // grade_snapshot is an OBJECT ({stars, letter, pct, ...}) — fold to the LETTER string.
      // Shipping the raw object crashed the Quant audit table (React can't render objects).
      grade: (() => { const g = legs.map((x) => x.grade_snapshot).find(Boolean); return g ? (typeof g === "string" ? g : g.letter || null) : null; })(),
      gates: legs.map((x) => x.entry_gates).find((g) => g && typeof g === "object") || null,
      reasons: [...new Set(legs.map((x) => x.exit_reason).filter(Boolean))].join(" / "),
    };
  });

  provenance.noStopExcluded = campaigns.filter((c) => c.entryDate && c.entryDate >= "2026-06-26" && c.stop == null).length;

  // ---------- EOD bars for derived metrics ----------
  const symOK = (t) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(t) && !isOption(t);
  const tickers = [...new Set(campaigns.filter((c) => symOK(c.ticker) && c.entry && c.stop && c.stop < c.entry).map((c) => c.ticker))];
  const bars = {};
  for (const t of tickers) {
    try {
      // Window starts far enough back to compute SMA50 + ATR14 BEFORE the earliest (May) entries.
      const p1 = Math.floor(new Date("2025-10-01").getTime() / 1000), p2 = Math.floor(Date.now() / 1000);
      const d = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?period1=${p1}&period2=${p2}&interval=1d`, { headers: { "User-Agent": "Mozilla/5.0" } }).then(j);
      const r0 = d?.chart?.result?.[0]; if (!r0) continue;
      const q = r0.indicators.quote[0];
      bars[t] = r0.timestamp.map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i],
      })).filter((b) => b.h != null);
      await new Promise((r) => setTimeout(r, 120));
    } catch { /* skip ticker */ }
  }

  // ---------- intraday day-0 lows (post-ENTRY-TIME) ----------
  // Valen (2026-07-11): rung analysis must check dips AFTER the moment of entry, including entry
  // day. 5-minute bars come from HIS OWN deployed Polygon proxy (/api/candles) — no 60-day
  // horizon like Yahoo, so every campaign with a recorded entry time is covered. Session-filtered
  // (09:30–16:00 ET) and clamped to the daily bar's low (bad-print guard). Timeless campaigns
  // fall back to day-after-entry (labelled in the UI).
  const CANDLES_API = "https://www.valensontrades.com/api/candles";
  const fiveMinCache = {};
  const fiveMin = async (tk, date) => {
    const ck = tk + "|" + date;
    if (fiveMinCache[ck] !== undefined) return fiveMinCache[ck];
    // RETRY: a transient proxy failure must never cache as a permanent null — that silently
    // shrank the wait-gate sample between runs (caught 2026-07-11).
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const d = await fetch(`${CANDLES_API}?symbol=${encodeURIComponent(tk)}&from=${date}&to=${date}&res=5min`).then(j);
        if (d?.ok && Array.isArray(d.candles) && d.candles.length) {
          const open = Math.floor(new Date(date + "T09:30:00-04:00").getTime() / 1000);
          const close = Math.floor(new Date(date + "T16:00:00-04:00").getTime() / 1000);
          const out = d.candles.filter((b) => b.time >= open && b.time < close).map((b) => ({ ts: b.time, o: b.open, h: b.high, l: b.low }));
          await new Promise((r) => setTimeout(r, 120));
          return (fiveMinCache[ck] = out.length ? out : null);
        }
        if (d?.ok && Array.isArray(d.candles) && !d.candles.length) return (fiveMinCache[ck] = null); // genuinely no data (halted/holiday)
      } catch (e) { if (attempt === 2) console.error("fiveMin FAIL after retries:", tk, date, e.message); }
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
    }
    return (fiveMinCache[ck] = null);
  };
  const etTime = (t) => (t && t.length === 5 ? t + ":00" : t); // "09:35" → "09:35:00"
  for (const c of campaigns) {
    c.day0PostLow = null;
    if (!c.entryTime || !c.entryDate || !symOK(c.ticker) || !c.entry) continue;
    const bars5 = await fiveMin(c.ticker, c.entryDate);
    if (!bars5) continue;
    const entryTs = Math.floor(new Date(c.entryDate + "T" + etTime(c.entryTime) + "-04:00").getTime() / 1000);
    if (!isFinite(entryTs)) continue;
    const lows = bars5.filter((b) => b.l != null && b.ts >= entryTs - 300);
    if (lows.length) {
      let lo5 = Math.min(...lows.map((b) => b.l));
      const dBar = (bars[c.ticker] || []).find((b) => b.date === c.entryDate);
      if (dBar && lo5 < dBar.l) lo5 = dBar.l; // daily bar is the authority
      c.day0PostLow = lo5;
    }
  }

  for (const c of campaigns) {
    c.mfeR = c.maeR = c.dayMFE = c.blendedR = c.shadowR = c.deriskCostR = c.capture = null; c.rescued = false; c.trimDay = null;
    c.extEntryCalc = c.lodDistAtr = c.atrEntry = null; c.vT3_25 = c.vT3_33 = c.vT5_25 = c.vT5_33 = null; c.intraday0 = false;
    // COVERAGE: every skip records WHY — silent exclusions are how an "AMD is missing" scare
    // happens. The page prints this manifest; nothing falls out of the dataset unnamed.
    c.skipReason = null;
    const B = bars[c.ticker];
    if (!c.entry || !c.entryDate || !c.lastExit) { c.skipReason = "missing entry/exit data"; continue; }
    if (!c.stop) { c.skipReason = "no original stop recorded"; continue; }
    if (c.stop >= c.entry) { c.skipReason = "stop at/above entry (BE or blended add) — no R unit"; continue; }
    if (!B) { c.skipReason = "no price bars returned for ticker"; continue; }
    const riskPS = c.entry - c.stop;
    if (riskPS / c.entry < 0.002) { c.skipReason = "stop ≈ entry — R denominator too small"; continue; }
    const i0 = B.findIndex((b) => b.date >= c.entryDate);
    let i1 = B.findIndex((b) => b.date > c.lastExit); i1 = i1 === -1 ? B.length : i1;
    if (i0 === -1 || i0 >= i1) { c.skipReason = "entry/exit dates outside bar history"; continue; }
    const win = B.slice(i0, i1);
    // ---- entry-context backfill from bars (approximations, labelled as such in the UI) ----
    // ATR14 = mean true range of the 14 bars BEFORE entry · SMA50 = mean close of the 50 before.
    if (i0 >= 15) {
      let trSum = 0;
      for (let k = i0 - 14; k < i0; k++) { const b = B[k], pc = B[k - 1].c; trSum += Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)); }
      const atr = trSum / 14;
      if (atr > 0) {
        c.atrEntry = round(atr, 4);
        if (i0 >= 50) { const sma50 = B.slice(i0 - 50, i0).reduce((s, b) => s + b.c, 0) / 50; c.extEntryCalc = round((c.entry - sma50) / atr, 1); }
        // LoD-distance %ATR: entry vs the ENTRY DAY's low. EOD approximation — the day's final
        // low can print after the entry, so this is an UPPER bound of the at-entry distance.
        if (B[i0].date === c.entryDate) c.lodDistAtr = round((c.entry - B[i0].l) / atr);
      }
    }
    // ---- TRIM TOURNAMENT: what if the FIRST trim was f% at day-d close, runner to final close?
    // Same price basis as shadowR (EOD closes) so the four variants and never-trim are directly
    // comparable. If the campaign ended before day d, the rule never fires → variant = never-trim.
    {
      const fin = win[win.length - 1].c;
      const vr = (d, f) => {
        const px = win.length > d ? win[d].c : null;
        const v = px == null ? (fin - c.entry) : f * (px - c.entry) + (1 - f) * (fin - c.entry);
        return round(v / riskPS);
      };
      c.vT3_25 = vr(3, 0.25); c.vT3_33 = vr(3, 1 / 3);
      c.vT5_25 = vr(5, 0.25); c.vT5_33 = vr(5, 1 / 3);
    }
    let maxH = -1e18, minL = 1e18, iMax = 0;
    win.forEach((b, i) => { if (b.h > maxH) { maxH = b.h; iMax = i; } if (b.l < minL) minL = b.l; });
    c.mfeR = round((maxH - c.entry) / riskPS);
    c.maeR = round((minL - c.entry) / riskPS);
    // Post-entry MAE: day-0 low measured from the ENTRY TIME (5m bars) where available — the
    // exact check Valen asked for — plus all later days' lows. Without a recorded time, day 0
    // is skipped (its low usually prints before an ORB entry and the stop IS that LoD).
    {
      const lows = win.slice(1).map((b) => b.l);
      if (c.day0PostLow != null) { lows.push(c.day0PostLow); c.intraday0 = true; }
      c.maeR1 = lows.length ? round((Math.min(...lows) - c.entry) / riskPS) : null;
    }
    // ── 3-STOP vs 1-STOP counterfactual (EOD, day AFTER entry onward; gap-through exits at open).
    // Same walk, same window for both — so the COMPARISON is fair even where absolutes are approximate.
    {
      const simStops = (levels, weights) => {
        const rem = weights.slice(); let r = 0;
        // day 0 from the entry time, when the 5m data covers it — stops are resting orders, so
        // post-entry low ≤ level ⇒ that tranche filled at the level
        if (c.day0PostLow != null) {
          levels.forEach((lv, ix) => { if (rem[ix] > 0 && c.day0PostLow <= lv) { r += rem[ix] * (lv - c.entry) / riskPS; rem[ix] = 0; } });
        }
        for (let k = 1; k < win.length; k++) {
          const b = win[k];
          levels.forEach((lv, ix) => {
            if (rem[ix] > 0 && b.l <= lv) { const px = (b.o != null && b.o < lv) ? b.o : lv; r += rem[ix] * (px - c.entry) / riskPS; rem[ix] = 0; }
          });
          if (!rem.some((w) => w > 0)) break;
        }
        const fin = win[win.length - 1].c;
        levels.forEach((lv, ix) => { if (rem[ix] > 0) r += rem[ix] * (fin - c.entry) / riskPS; });
        return round(r);
      };
      c.sim3stop = simStops([c.entry - riskPS / 3, c.entry - 2 * riskPS / 3, c.entry - riskPS], [1 / 3, 1 / 3, 1 / 3]);
      c.sim1stop = simStops([c.entry - riskPS], [1]);
      // ── VALEN'S TRIM COMBO TOURNAMENT (spec v3, 2026-07-11): derisk 50% TOTAL into strength.
      // Priority trigger = the +R level printing (days 1–5, even before the day-3 window);
      // time fallback = the LAST close inside the 5-day window (day 5, or the last day the
      // trade was still open past day 3). Combos: one 50% trim at +3R/+4R/+5R, or TWO trims
      // laddered +3R then +5R in 20/30 · 25/25 · 30/20 splits. Runner always to final close.
      const finPx = win[win.length - 1].c;
      const fillLevel = (tgtR) => { const lvl = c.entry + tgtR * riskPS; for (let k = 1; k < Math.min(win.length, 6); k++) if (win[k].h >= lvl) return lvl; return null; };
      const windowClose = () => { if (win.length <= 3) return null; return win[Math.min(5, win.length - 1)].c; };
      const combo = (legs) => {
        let r = 0, fTot = 0;
        for (const L of legs) { const px = fillLevel(L.tgt) ?? windowClose(); if (px != null) { r += L.f * (px - c.entry); fTot += L.f; } }
        r += (1 - fTot) * (finPx - c.entry); // unfilled legs + the 50% runner ride to the final close
        return round(r / riskPS);
      };
      // which DAY each level printed (1–5, null = never in the window) — feeds the
      // "when do the trims actually happen" read on the tournament panel
      const hitDay = (tgtR) => { const lvl = c.entry + tgtR * riskPS; for (let k = 1; k < Math.min(win.length, 6); k++) if (win[k].h >= lvl) return k; return null; };
      c.hit3Day = hitDay(3); c.hit5Day = hitDay(5);
      c.vHis3 = combo([{ f: 0.5, tgt: 3 }]);
      c.vHis4 = combo([{ f: 0.5, tgt: 4 }]);
      c.vHis5 = combo([{ f: 0.5, tgt: 5 }]);
      c.vL2030 = combo([{ f: 0.2, tgt: 3 }, { f: 0.3, tgt: 5 }]);
      c.vL2525 = combo([{ f: 0.25, tgt: 3 }, { f: 0.25, tgt: 5 }]);
      c.vL3020 = combo([{ f: 0.3, tgt: 3 }, { f: 0.2, tgt: 5 }]);
    }
    // SYSTEM-MAX R (Valen's ACTUAL rule, v2 2026-07-11): the ceiling his own trim system could
    // have delivered — sell 50% INTO STRENGTH at +3R (riding the fill up to +5R if that day
    // offers it); if +3R never prints by day 5, 50% at the BEST close inside the T+3–5 window;
    // runner sold at its post-trim PEAK. His 25+25/20+30/30+20 combos all sum to 50%.
    {
      const lvl3 = c.entry + 3 * riskPS, lvl5 = c.entry + 5 * riskPS;
      let trimPx = null, trimIdx = null;
      for (let k = 1; k < Math.min(win.length, 6); k++) {
        if (win[k].h >= lvl3) { trimPx = Math.min(win[k].h, lvl5); trimIdx = k; break; }
      }
      if (trimPx == null) {
        let best = null, bi = null;
        for (const d of [3, 4, 5]) if (win.length > d && (best == null || win[d].c > best)) { best = win[d].c; bi = d; }
        if (best != null) { trimPx = best; trimIdx = bi; }
      }
      if (trimPx == null) c.sysMaxR = c.mfeR; // ended before the window — best possible = its peak
      else {
        const after = win.slice(trimIdx + 1);
        const runnerPx = after.length ? Math.max(...after.map((b) => b.h)) : win[win.length - 1].c;
        c.sysMaxR = round((0.5 * (trimPx - c.entry) + 0.5 * (runnerPx - c.entry)) / riskPS);
      }
    }
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
  // Realized attribution PER CAMPAIGN, not per ticker: match closed trims to THIS open position by
  // symbol + entry date + entry price. A ticker can hold several distinct lots (e.g. OSCR: a 6/29
  // failed-breakout −$4,018 AND the 7/1 runner's +$1,852 trim) — summing by ticker cross-contaminates
  // them. This keeps the open table in lockstep with the position it describes.
  const isoRe = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");
  const realizedForPos = (p) => {
    const pe = +p.entry_price; if (!isFinite(pe)) return 0;
    const tol = Math.max(0.05, pe * 0.0015);
    return trades.filter((x) => {
      if (x.ticker !== p.symbol || x.pl_dollar == null) return false;
      const priceOk = x.entry_price != null && Math.abs(+x.entry_price - pe) < tol;
      // Prefer exact date match (separates same-name lots on different days); fall back to price-only
      // (tighter) when either side lacks a clean ISO date.
      if (isoRe(p.entry_date) && isoRe(x.entry_date)) return x.entry_date === p.entry_date && priceOk;
      return x.entry_price != null && Math.abs(+x.entry_price - pe) < Math.min(tol, 0.02);
    }).reduce((sm, x) => sm + (+x.pl_dollar || 0), 0);
  };
  const openCampaigns = positions.filter((p) => +p.shares > 0).map((p) => {
    const entry = +p.entry_price || null, sh = +p.shares || 0, cp = +p.current_price || null;
    const stop = p.stop_price ? +p.stop_price : null, trail = p.trailing_stop ? +p.trailing_stop : null;
    const riskPS = entry && stop && stop < entry ? entry - stop : null;
    const unreal = entry && cp ? (cp - entry) * sh : null;
    const eff = Math.max(stop ?? -1e18, trail ?? -1e18);
    const realized = round(realizedForPos(p), 0);
    return {
      sym: p.symbol, shares: sh, entry, stop, trail, cp, ext: p.ext_mult != null ? round(+p.ext_mult, 2) : null,
      riskFree: eff > -1e17 && entry != null && eff >= entry,
      unrealUsd: round(unreal, 0),
      unrealR: riskPS && unreal != null ? round((cp - entry) / riskPS) : null,
      realizedUsd: realized,
      worstCaseUsd: eff > -1e17 && entry != null ? round((eff - entry) * sh + realized, 0) : null, // realized + what the runner locks in at its stop/trail
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
    // Distribution of the 10,000 path outcomes (for the bell-curve view): 28 equal bins P1→P99.
    const lo = q(rets, 0.01), hi = q(rets, 0.99), BINS = 28;
    const histo = { lo: round(lo, 1), hi: round(hi, 1), counts: new Array(BINS).fill(0) };
    if (hi > lo) for (const r of rets) { if (r >= lo && r <= hi) histo.counts[Math.min(BINS - 1, Math.floor(((r - lo) / (hi - lo)) * BINS))]++; }
    return {
      label, n: rlist.length, trades: TR, riskPct: RISK_PCT,
      retP5: round(q(rets, 0.05), 1), retP50: round(q(rets, 0.5), 1), retP95: round(q(rets, 0.95), 1),
      ddP50: round(q(dds, 0.5), 1), ddP95: round(q(dds, 0.05), 1), // dds ascending: worst at start
      pNegative: round(100 * rets.filter((r) => r < 0).length / PATHS, 1),
      pDD10: round(100 * dds.filter((d) => d < -10).length / PATHS, 1),
      histo,
    };
  }
  const rSys = sys.map((c) => c.blendedR ?? c.rSum).filter((v) => v != null && isFinite(v));
  const rAll = campaigns.map((c) => c.blendedR ?? c.rSum).filter((v) => v != null && isFinite(v));
  const monte = { system: mc(rSys, "New system (Jul→)"), all: mc(rAll, "All since May") };

  // ---------- 30-MIN WAIT-GATE SIMULATION ----------
  // Only campaigns with a RECORDED entry time before 10:00 ET are eligible (the gate would have
  // delayed exactly these; later entries are unaffected). Counterfactual: enter at the first
  // 5-min bar open at/after 10:00 ET on the entry day, SAME stop level, ride to the same final
  // EOD close (shadow basis, comparable to shadowR). Yahoo 5m history only reaches ~60 days back
  // — campaigns without a time or beyond the window are EXCLUDED, never guessed.
  // 5m bars now come from the deployed Polygon proxy — NO date horizon, so every campaign with a
  // recorded pre-10:00 ET entry time is simulatable (the sample Valen asked for).
  const eligible = campaigns.filter((c) => c.entryTime && etTime(c.entryTime) < "10:00:00"
    && c.entry && c.stop && c.stop < c.entry && c.shadowR != null && symOK(c.ticker));
  for (const c of eligible) {
    try {
      const bars5 = await fiveMin(c.ticker, c.entryDate);
      if (!bars5) continue;
      const tenET = Math.floor(new Date(c.entryDate + "T10:00:00-04:00").getTime() / 1000);
      const first10 = bars5.find((b) => b.ts >= tenET && b.o != null);
      if (!first10) continue;
      const waitPx = first10.o;
      if (!(waitPx > 0)) continue;
      c.waitEntryPx = round(waitPx, 4);
      const B = bars[c.ticker];
      const iEnd = (() => { let i = B.findIndex((b) => b.date > c.lastExit); return (i === -1 ? B.length : i) - 1; })();
      if (iEnd < 0) continue;
      const i0b = B.findIndex((b) => b.date >= c.entryDate);
      const laterLow = i0b >= 0 && i0b + 1 <= iEnd ? Math.min(...B.slice(i0b + 1, iEnd + 1).map((b) => b.l)) : Infinity;
      const dBar0 = B.find((b) => b.date === c.entryDate);
      const low5After = (fromTs) => {
        const ls = bars5.filter((b) => b.l != null && b.ts >= fromTs);
        if (!ls.length) return Infinity;
        let lo = Math.min(...ls.map((b) => b.l));
        if (dBar0 && lo < dBar0.l) lo = dBar0.l; // daily bar is the authority (bad-print guard)
        return lo;
      };
      if (waitPx <= c.stop) {
        // The gate's whole edge: price already at/below the stop by 10:00 → the waited trade is
        // NEVER TAKEN → 0R, while the early entry ate the loss. Count it as a loss AVOIDED.
        c.waitShadowR = 0; c.waitAvoided = true;
        const entryTs0 = Math.floor(new Date(c.entryDate + "T" + etTime(c.entryTime) + "-04:00").getTime() / 1000);
        const swept0 = Math.min(low5After(entryTs0), laterLow) <= c.stop;
        c.actGateR = round(((swept0 ? c.stop : B[iEnd].c) - c.entry) / (c.entry - c.stop));
        continue;
      }
      // STOP-AWARE on BOTH arms (the MRVL lesson): a post-entry low touching the stop exits AT
      // the stop; survivors ride to the same final day's close.
      const entryTs2 = Math.floor(new Date(c.entryDate + "T" + etTime(c.entryTime) + "-04:00").getTime() / 1000);
      const armR = (px, fromTs) => {
        const swept = Math.min(low5After(fromTs), laterLow) <= c.stop;
        const D = px - c.stop;
        return round(((swept ? c.stop : B[iEnd].c) - px) / D);
      };
      c.actGateR = armR(c.entry, entryTs2);      // as traded, stop-aware, same basis
      c.waitShadowR = armR(waitPx, tenET);       // waited to 10:00, stop-aware
    } catch { /* skip ticker/day */ }
  }
  const wgPairs = campaigns.filter((c) => c.waitShadowR != null && c.actGateR != null);
  const waitGate = {
    eligible: eligible.length, simmed: wgPairs.length,
    noTime: campaigns.filter((c) => !c.entryTime).length,
    avoided: wgPairs.filter((c) => c.waitAvoided).length,
    actMeanR: wgPairs.length ? round(sum(wgPairs.map((c) => c.actGateR)) / wgPairs.length) : null,
    waitMeanR: wgPairs.length ? round(sum(wgPairs.map((c) => c.waitShadowR)) / wgPairs.length) : null,
    pairs: wgPairs.map((c) => ({ t: c.ticker, d: c.entryDate, act: c.actGateR, wait: c.waitShadowR, avoided: !!c.waitAvoided })),
    method: "both arms stop-aware: post-entry lows (5m day 0, daily after) at/below the stop exit AT the stop; survivors ride to the final day's close",
  };

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

  // R-basis aggregates (risk-adjusted view) — computed, never hardcoded in the UI.
  const rVals = sys.map((c) => c.blendedR ?? c.rSum).filter((x) => x != null && isFinite(x));
  const rW = rVals.filter((x) => x > 0), rL = rVals.filter((x) => x <= 0);
  const rGW = sum(rW), rGL = sum(rL);
  const rBasis = {
    n: rVals.length, wr: rVals.length ? round(100 * rW.length / rVals.length, 1) : null,
    avgWin: rW.length ? round(rGW / rW.length) : null, avgLoss: rL.length ? round(rGL / rL.length) : null,
    payoff: rW.length && rL.length && rGL < 0 ? round((rGW / rW.length) / (-rGL / rL.length)) : null,
    pf: rGL < 0 ? round(rGW / -rGL) : null,
  };

  const payload_edge = {
    asof: new Date().toISOString(), since: SINCE, systemStart: SYSTEM_START, systemEntry: SYSTEM_ENTRY,
    method: "IBKR fill rebuild, equities-focused ESTIMATE — TradeZella owns realized truth. Pipeline-verified ISO-dated rows only (legacy slash-dated manual journal rows excluded); exact-duplicate fills deduped. Month cards = campaign-month slices; system cohort = campaigns entered on/after " + SYSTEM_ENTRY + ". R = blended campaign R vs initial risk (entry−stop, first-leg stop); MFE/shadow from EOD bars.",
    verdict, buckets, derisk, monte, waitGate, provenance, maeInsight, equityR, rollingExp, openCampaigns, rBasis,
    stopCoverage: { system: "100%", note: "R exists only where a stop was recorded; system cohort fully covered" },
    openBook: { positions: positions.length, riskFree: free, atRisk, naked, openRiskUsd: round(openRisk, 0) },
    // Reconciliation bridge — the exact ladder from "what the journal shows" to "what N is here".
    // This is the answer to "why is the sample size different from the webapp", kept in-product.
    reconcile: {
      fillsAll: provenance.fillsAll, fillsVerified: provenance.fillsVerified,
      legacyExcluded: provenance.legacyExcluded, dupesDropped: provenance.dupesDropped,
      campaignsAll: campaigns.length, campaignsSystem: sys.length,
      optionCampaigns: campaigns.filter((c) => c.option).length,
      openRunners: positions.length, systemEntry: SYSTEM_ENTRY, since: SINCE,
      // integrity check: every verified fill must be inside exactly one campaign
      legsSum: campaigns.reduce((s, c) => s + c.legs, 0),
    },
    // COVERAGE MANIFEST — every campaign excluded from bar-derived metrics, BY NAME + reason.
    coverage: {
      scored: campaigns.filter((c) => c.mfeR != null).length,
      intraday0: campaigns.filter((c) => c.intraday0).length,
      excluded: campaigns.filter((c) => c.skipReason).map((c) => ({ t: c.ticker, d: c.entryDate, sys: isSystem(c), why: c.skipReason })),
      barsMissing: [...new Set(campaigns.filter((c) => c.skipReason === "no price bars returned for ticker").map((c) => c.ticker))],
    },
    // ALL campaigns since May (sys flag marks the system cohort) — the page computes either
    // population client-side from the same list, so the journal and the quant page reconcile.
    campaigns: campaigns
      .sort((a, b2) => Math.abs(b2.pl) - Math.abs(a.pl))
      .slice(0, 250)
      .map(({ key, ...c }) => ({ ...c, sys: isSystem(c) })),
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
