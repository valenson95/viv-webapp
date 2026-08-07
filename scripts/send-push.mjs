#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════════
   send-push.mjs — how Valen announces things to the app. Run LOCALLY, from his
   Mac. There is no cron and no serverless endpoint (Vercel Hobby is at its
   12/12 function cap), so a push happens exactly when he runs this.

   ── RUN ──────────────────────────────────────────────────────────────────────
     node --env-file=.env.local scripts/send-push.mjs --dry-run
     node --env-file=.env.local scripts/send-push.mjs \
       --title "New setups are up" --body "Three fresh names on the Daily Setups feed." --url "/#daily"

     Live-trade shorthand (composes the copy for you):
     node --env-file=.env.local scripts/send-push.mjs --live-trade \
       --ticker DELL --action "New entry" --detail "Pullback buy"
     → title "📡 Live trade update"
       body  "DELL — New entry · Pullback buy"
       url   "/?lt=open"

   ── INTENDED WORKFLOW ────────────────────────────────────────────────────────
   After EVERY trade sync, fire one push per meaningful change to the book —
   one notification per change, not one digest:
     · a new entry          → --live-trade --ticker X --action "New entry"       [--detail "<setup name>"]
     · an exit / stop-out   → --live-trade --ticker X --action "Closed"          [--detail "+12%" | "Stopped out"]
     · a stop moved to BE   → --live-trade --ticker X --action "Stop to breakeven"
     · a trim               → --live-trade --ticker X --action "Trimmed"         [--detail "30% off"]
   Anything that is not the live book (new Daily Setups, a Deep Dive, an
   announcement) goes through the plain --title/--body form.

   ── PRIVACY LAW (HARD — from the Live Trades drawer spec) ────────────────────
   Notification copy may carry: TICKER · ACTION · SETUP NAME · PERCENT.
   It may NEVER carry: share counts, dollar amounts, position sizes, account
   values, P&L in currency. This is enforced mechanically below (assertClean) —
   the script refuses to send rather than trusting anyone to remember.

   ── ENV (all from .env.local, gitignored) ────────────────────────────────────
     SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY   (service role bypasses RLS to read subs)
     VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY · VAPID_SUBJECT
   ══════════════════════════════════════════════════════════════════════════════ */

import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const TABLE = 'push_subscriptions';

/* ── args ──────────────────────────────────────────────────────────────────── */
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const DRY = !!args['dry-run'];

/* ── privacy guard ─────────────────────────────────────────────────────────── */
// Ticker · action · setup · % are fine. Money, size and account values are not.
const BANNED = [
  [/[$€£¥]\s?\d/, 'a currency amount'],
  [/\b\d[\d,.]*\s?(usd|myr|rm|dollars?|bucks)\b/i, 'a currency amount'],
  [/\b\d[\d,.]*\s?(shares?|sh|units?|contracts?|lots?)\b/i, 'a share/contract count'],
  [/\b(nlv|net liq(uidation)?|account value|account size|buying power|portfolio value|equity balance)\b/i, 'an account value'],
  [/\b(position size|size(d)? at|risking)\b/i, 'a position size'],
];
function assertClean(...texts) {
  const joined = texts.filter(Boolean).join(' | ');
  for (const [re, what] of BANNED) {
    if (re.test(joined)) {
      console.error(`✗ PRIVACY LAW — refusing to send: the copy contains ${what}.`);
      console.error(`  Offending text: ${joined}`);
      console.error(`  Allowed in a notification: ticker, action, setup name, percent. Nothing else.`);
      process.exit(1);
    }
  }
}

/* ── compose the payload ───────────────────────────────────────────────────── */
function buildPayload() {
  if (args['live-trade']) {
    const ticker = typeof args.ticker === 'string' ? args.ticker.trim().toUpperCase() : '';
    const action = typeof args.action === 'string' ? args.action.trim() : '';
    const detail = typeof args.detail === 'string' ? args.detail.trim() : '';
    if (!ticker || !action) {
      console.error('✗ --live-trade needs --ticker and --action (e.g. --ticker DELL --action "New entry").');
      process.exit(1);
    }
    return {
      title: '📡 Live trade update',
      body: detail ? `${ticker} — ${action} · ${detail}` : `${ticker} — ${action}`,
      // Inert deep link: today the Live Trades drawer holds its open/closed state
      // internally, so this behaves exactly like "/". It starts working the moment
      // the 3-line ?lt=open handler is wired into App.jsx — no change needed here.
      url: typeof args.url === 'string' ? args.url : '/?lt=open',
      tag: 'viv-live-trade',
    };
  }
  const title = typeof args.title === 'string' ? args.title.trim() : '';
  const body = typeof args.body === 'string' ? args.body.trim() : '';
  if (!DRY && (!title || !body)) {
    console.error('✗ Need --title and --body (or use --live-trade --ticker X --action "…").');
    console.error('  Try: node --env-file=.env.local scripts/send-push.mjs --dry-run');
    process.exit(1);
  }
  return {
    title: title || 'VIV',
    body: body || 'Something new in the Vault.',
    url: typeof args.url === 'string' ? args.url : '/',
    tag: typeof args.tag === 'string' ? args.tag : 'viv',
  };
}

/* ── main ──────────────────────────────────────────────────────────────────── */
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('✗ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — run with: node --env-file=.env.local …');
  process.exit(1);
}

const payload = buildPayload();
assertClean(payload.title, payload.body);

const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: rows, error } = await supa.from(TABLE).select('id,user_id,endpoint,sub');
if (error) {
  if (/does not exist|schema cache/i.test(error.message || '')) {
    console.error(`✗ Table public.${TABLE} does not exist yet.`);
    console.error('  Run supabase/push-subscriptions.sql once in Supabase → SQL Editor, then re-run this.');
    process.exit(1);
  }
  console.error('✗ Could not read subscriptions:', error.message);
  process.exit(1);
}

const subs = (rows || []).filter((r) => r && r.sub && r.sub.endpoint);
const devices = subs.length;
const members = new Set(subs.map((r) => r.user_id)).size;

console.log('─'.repeat(64));
console.log(`  title : ${payload.title}`);
console.log(`  body  : ${payload.body}`);
console.log(`  url   : ${payload.url}`);
console.log(`  tag   : ${payload.tag}`);
console.log(`  audience: ${devices} device${devices === 1 ? '' : 's'} · ${members} member${members === 1 ? '' : 's'}`);
console.log('─'.repeat(64));

if (DRY) {
  console.log('✓ dry run — nothing was sent.');
  process.exit(0);
}
if (!devices) {
  console.log('Nobody has notifications switched on yet. Nothing sent.');
  process.exit(0);
}
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error('✗ Missing VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in .env.local.');
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:vc-lv@live.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const body = JSON.stringify(payload);
const dead = [];
let sent = 0;
let failed = 0;

// Sequential on purpose: a handful of devices, and push services rate-limit bursts.
for (const row of subs) {
  try {
    await webpush.sendNotification(row.sub, body, { TTL: 60 * 60 * 12, urgency: 'normal' });
    sent++;
  } catch (err) {
    const code = err && err.statusCode;
    if (code === 404 || code === 410) {
      dead.push(row.endpoint); // gone for good — the browser dropped the subscription
    } else {
      failed++;
      console.warn(`  ! ${String(row.endpoint).slice(0, 48)}… → ${code || (err && err.message) || 'unknown error'}`);
    }
  }
}

if (dead.length) {
  const { error: delErr } = await supa.from(TABLE).delete().in('endpoint', dead);
  if (delErr) console.warn(`  ! Could not prune ${dead.length} dead subscription(s): ${delErr.message}`);
}

console.log(`✓ sent ${sent}/${devices}` + (dead.length ? ` · pruned ${dead.length} dead` : '') + (failed ? ` · ${failed} failed` : ''));
