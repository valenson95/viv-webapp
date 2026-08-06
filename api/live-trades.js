// ════════════════════════════════════════════════════════════════════════
// VIV Webapp · LIVE TRADES — member-facing read of Valen's real book (api/live-trades.js)
// ════════════════════════════════════════════════════════════════════════
// Powers the "Live Trades" section on the Hunt List page. Members follow the real positions:
// entries, exits, size as a share of the account, and the management plan.
//
// READ-ONLY. This function never writes to positions/trades — not once, not ever.
//
// PRIVACY CONTRACT (hard, enforced by construction below):
//   • Share counts and dollar amounts NEVER leave this function. Not in a field, not in a
//     string. Sizes are a percentage of the account; results are percentages and R-multiples.
//     Prices (entry / stop / trail / target zone) ARE emitted — they are chart levels.
//   • The payload is BUILT FIELD BY FIELD from the rows. Rows are never spread (`...row`),
//     so a new private column added to the schema tomorrow cannot leak through this endpoint.
//   • exit_reason is free text in the journal and routinely contains share counts and dollar
//     figures ("Added 3,400 @ 52.10 … +$624.56"). It is therefore CLASSIFIED into a fixed set
//     of plain words; the raw text is never emitted, even when unrecognised.
//
// ENV VARS (same names the sibling functions use — see api/ibkr-ingest.js):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ════════════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Valen's account. Hard-coded UID — never a name/email pattern lookup.
const OWNER_UID = "0e32b092-029a-436d-8cb5-67621e1467b0";

const WEEKS_BACK = 10;
const RECENT_EXITS = 15;
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes, same convention as api/prices.js and api/indices.js
let cache = { data: null, ts: 0 };

// ── date helpers ────────────────────────────────────────────────────────
// The journal holds two date shapes: ISO "2026-08-04" (synced rows) and US "6/8/26" (older
// manual rows). Everything downstream expects ISO, so normalise once, here.
function isoDate(v) {
  const s = String(v || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  return `${y}-${String(Number(m[1])).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
}
// The CURRENT US session date. The book is traded from Malaysia, twelve hours ahead, so the
// server's own calendar day is routinely wrong for this. Rule: take the New York date, and once
// the close has passed (or it is a weekend) roll forward to the next weekday — the session the
// day counts are about. Market holidays are not in the roll (no holiday calendar server-side).
function marketToday() {
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const hour = Number(now.toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }));
  const d = new Date(dateStr + "T00:00:00Z");
  if (hour >= 17) d.setUTCDate(d.getUTCDate() + 1);       // after the close → the next session
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1); // skip the weekend
  return d.toISOString().slice(0, 10);
}
// Trading days held, entry = day 0. Weekends excluded; market holidays are not (no holiday
// calendar server-side) — a holiday inside the window reads one day long, which is harmless
// for a "when does the trim window open" read.
function tradingDaysHeld(entryIso, todayIso) {
  if (!entryIso || !todayIso) return null;
  const a = new Date(entryIso + "T00:00:00Z");
  const b = new Date(todayIso + "T00:00:00Z");
  if (isNaN(a) || isNaN(b) || b < a) return 0;
  let n = 0;
  const d = new Date(a);
  while (d < b) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) n++;
  }
  return n;
}
// Monday of the week an ISO date falls in.
function weekStart(iso) {
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d)) return null;
  const w = d.getUTCDay();          // 0 Sun … 6 Sat
  const back = w === 0 ? 6 : w - 1; // Monday-anchored weeks
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const r2 = (n) => (n == null ? null : Math.round(n * 100) / 100);

// ── the privacy filter on exit_reason ───────────────────────────────────
// Raw journal text is never emitted. Everything collapses to one of these plain phrases.
function classifyReason(raw) {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "closed";
  // Trims first, and anchored — a stop-out note that merely mentions an earlier trim must not
  // be read as a trim.
  if (/^partial\b|^planned (partial|trim)|^scaled out|partial (tp|trim)|^trim\b/.test(s)) return "trimmed into strength";
  if (/^sold into strength|^exit into strength/.test(s)) return "sold into strength";
  // An exit he chose at breakeven is not a stop-out, even when the note mentions where the
  // stop sat — so the deliberate wording is matched before the word "stop" is looked for.
  if (/^(cut|closed|chopped out|exited|scratched)[^.]{0,24}(at |to )?break-?even/.test(s)) return "closed at breakeven";
  if (/trailing stop|hit trailing|trailed out|trailing sl/.test(s)) return "trailed out";
  if (/stop|stopped/.test(s)) return /break-?even/.test(s) ? "stopped at breakeven" : "stopped out";
  if (/break-?even/.test(s)) return "closed at breakeven";
  if (/below (the )?(sma|ema|ma\b|\d+\s?-?\s?day)|closed below/.test(s)) return "closed below the moving average";
  if (/rotat|changed thesis|thesis/.test(s)) return "rotated out";
  if (/earnings/.test(s)) return "closed before earnings";
  if (/risk reduction|de-risk|derisk/.test(s)) return "reduced risk";
  if (/gap-?down|gapped down/.test(s)) return "exited on a gap down";
  if (/cut|no continuation|no follow|scratch|chopped|manual close|closed|exit/.test(s)) return "cut early";
  return "closed";
}

// Trim window, from the day count. Day 3–5 is when the plan opens the first trim.
function trimWindow(daysHeld) {
  if (daysHeld == null) return null;
  if (daysHeld < 3) return "opens day 3";
  if (daysHeld <= 5) return "open now (day 3-5)";
  return "past day 5";
}

// Status from the trail against cost. 0.1% band around cost counts as breakeven — a trail is
// placed at a round number, never at the eighth decimal of a blended fill.
function statusOf(entry, trail) {
  if (!(entry > 0) || !(trail > 0)) return "At Risk";
  const band = Math.abs(entry) * 0.001;
  if (trail > entry + band) return "Profit Locked";
  if (trail >= entry - band) return "Risk-Free";
  return "At Risk";
}

async function build() {
  const sb = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
  const today = marketToday();

  // ── open positions (internal read: shares stay here, they never reach the payload) ──
  const { data: posRows, error: posErr } = await sb
    .from("positions")
    .select("symbol,entry_date,shares,entry_price,stop_price,trailing_stop,is_closed,is_demo,trade_type")
    .eq("user_id", OWNER_UID)
    .eq("is_closed", false)
    .eq("is_demo", false);
  if (posErr) throw new Error("positions: " + posErr.message);

  // ── closed trades (the review record) ──
  const { data: tradeRows, error: trErr } = await sb
    .from("trades")
    .select("ticker,entry_date,exit_date,entry_price,exit_price,pl_pct,pl_dollar,r_mult,exit_reason,is_sample,is_deleted,is_demo,trade_type")
    .eq("user_id", OWNER_UID)
    .eq("is_deleted", false)
    .eq("is_sample", false)
    .eq("is_demo", false);
  if (trErr) throw new Error("trades: " + trErr.message);

  // ── the account basis for the size percentages ──
  // Same definition the dashboard uses for compounded equity: starting capital + realized
  // profit from every closed journal trade. Internal only; the number itself never ships.
  const { data: profRows } = await sb.from("profiles").select("portfolio_size").eq("id", OWNER_UID).limit(1);
  const startCapital = num(profRows && profRows[0] && profRows[0].portfolio_size) || 0;
  const realized = (tradeRows || []).reduce((s, t) => s + (num(t.pl_dollar) || 0), 0);
  let equity = startCapital + realized;
  let equityBasis = "account";
  // Last resort only: no stored capital → size against the book itself so the shares still
  // never ship, and say so in the payload.
  const bookValue = (posRows || []).reduce((s, p) => s + (num(p.shares) || 0) * (num(p.entry_price) || 0), 0);
  if (!(equity > 0)) { equity = bookValue; equityBasis = "book"; }

  // ── open rows, built field by field ──
  const open = (posRows || [])
    .map((p) => {
      const entry = num(p.entry_price);
      const stop = num(p.stop_price);
      const trail = num(p.trailing_stop);
      const entryDate = isoDate(p.entry_date);
      const cost = (num(p.shares) || 0) * (entry || 0);
      const risk = entry != null && stop != null ? entry - stop : null;
      const days = tradingDaysHeld(entryDate, today);
      // Direction. The journal keeps it on trade_type ("Long" / "long" / "Short"). FALLBACK: if a
      // row ever lands without that field, a positive share count means a long — the only shape
      // his book takes today, and the sign is the only other signal available.
      const tt = String(p.trade_type || "").trim().toLowerCase();
      const side = tt === "short" ? "Short" : tt === "long" ? "Long" : ((num(p.shares) || 0) < 0 ? "Short" : "Long");
      return {
        tk: String(p.symbol || "").toUpperCase(),
        side,
        entryDate,
        entry: r2(entry),
        stop: r2(stop),
        trail: trail != null && trail > 0 ? r2(trail) : null,
        status: statusOf(entry, trail),
        sizePct: equity > 0 ? Math.round((cost / equity) * 1000) / 10 : null,
        daysHeld: days,
        targetLow: risk != null && risk > 0 ? r2(entry + 3 * risk) : null,
        targetHigh: risk != null && risk > 0 ? r2(entry + 5 * risk) : null,
        trimWindow: trimWindow(days),
      };
    })
    .sort((a, b) => (b.sizePct || 0) - (a.sizePct || 0));

  // ── closed rows ──
  const closedAll = (tradeRows || [])
    .map((t) => {
      const exitDate = isoDate(t.exit_date);
      if (!exitDate) return null;
      const ep = num(t.entry_price);
      const xp = num(t.exit_price);
      let plPct = num(t.pl_pct);
      if (plPct == null && ep > 0 && xp != null) {
        plPct = (t.trade_type === "Short" ? (ep - xp) / ep : (xp - ep) / ep) * 100;
      }
      return {
        tk: String(t.ticker || "").toUpperCase(),
        entryDate: isoDate(t.entry_date),
        exitDate,
        plPct: plPct == null ? null : Math.round(plPct * 100) / 100,
        rMult: r2(num(t.r_mult)),
        reason: classifyReason(t.exit_reason),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.exitDate < b.exitDate ? 1 : a.exitDate > b.exitDate ? -1 : 0));

  const closed = closedAll.slice(0, RECENT_EXITS);

  // ── weekly review — the last 10 weeks, every bar carrying its own trades ──
  const thisWeek = weekStart(today);
  const firstWeek = (() => {
    const d = new Date(thisWeek + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 7 * (WEEKS_BACK - 1));
    return d.toISOString().slice(0, 10);
  })();
  const byWeek = new Map();
  for (const t of closedAll) {
    const w = weekStart(t.exitDate);
    if (!w || w < firstWeek || w > thisWeek) continue;
    if (!byWeek.has(w)) byWeek.set(w, []);
    byWeek.get(w).push(t);
  }
  const weekly = [];
  for (let i = 0; i < WEEKS_BACK; i++) {
    const d = new Date(firstWeek + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 7 * i);
    const w = d.toISOString().slice(0, 10);
    const trades = (byWeek.get(w) || []).slice().sort((a, b) => (a.exitDate < b.exitDate ? 1 : -1));
    // Wins/losses read off the percentage result (always present); net R sums the R-multiples
    // that exist — a row synced without a locked stop has no R and is not invented.
    const wins = trades.filter((t) => (t.plPct || 0) > 0).length;
    const losses = trades.filter((t) => (t.plPct || 0) < 0).length;
    const netR = trades.reduce((s, t) => s + (t.rMult == null ? 0 : t.rMult), 0);
    weekly.push({ weekStart: w, wins, losses, netR: Math.round(netR * 100) / 100, trades });
  }

  return { asof: today, equityBasis, open, closed, weekly };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");

  if (!SB_URL || !SB_SERVICE) {
    return res.status(500).json({ error: "Server not configured (missing Supabase env vars)." });
  }

  const now = Date.now();
  if (cache.data && now - cache.ts < CACHE_TTL) return res.status(200).json(cache.data);

  try {
    const payload = await build();
    cache = { data: payload, ts: now };
    return res.status(200).json(payload);
  } catch (e) {
    if (cache.data) return res.status(200).json(cache.data); // stale beats blank
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}

// Exported for the offline verification script only (no route uses it).
export { build as buildLiveTrades };
