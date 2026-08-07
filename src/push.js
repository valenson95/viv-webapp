/* ══════════════════════════════════════════════════════════════════════════
   WEB PUSH — client logic (v1, 2026-08-07)

   Member request (mandy.yang128): "push notifications so working members can
   keep track of what's going on." This module is the whole client half.

   ── Why it is built this way ────────────────────────────────────────────────
   · NO new file under api/. Vercel Hobby is at its 12/12 serverless-function
     cap, so there is no server endpoint in this feature at all. The browser
     talks straight to Supabase (RLS-guarded) to store its subscription, and
     Valen sends announcements from his Mac with scripts/send-push.mjs.
   · The VAPID PUBLIC key below is public by design — it ships in every push
     subscription the browser creates. The PRIVATE key lives only in
     .env.local (gitignored) and is never referenced by client code.
   · EVERY browser API touch is inside a function. Nothing at module scope
     reads navigator/window/Notification, so importing this file can never
     crash a non-browser context.

   ── Storage ────────────────────────────────────────────────────────────────
   supabase/push-subscriptions.sql → public.push_subscriptions
   One row per browser/device, keyed by the push `endpoint`. Members can only
   write their own rows; only the service_role key (send-push.mjs) reads them.
   ══════════════════════════════════════════════════════════════════════════ */

import { supabase } from './supabaseClient';

/** VAPID public key — public by design (it is embedded in every subscription). */
export const VAPID_PUBLIC_KEY =
  'BKu5n1csyotcKJbSD8yMmFlvMhA1akcNiqFT2iaOj5Uy0PZLGcAoAPVZC89dP7DJni7_wNbPLd2kh_UEe4mUtas';

const SW_PATH = '/sw.js';
const TABLE = 'push_subscriptions';

/* ── helpers ─────────────────────────────────────────────────────────────── */

// The browser wants the key as raw bytes, not the URL-safe base64 string.
function keyToBytes(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function hasWindow() {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

/** True on iPhone/iPad (incl. iPadOS pretending to be a Mac with a touch screen). */
export function isApplePhone() {
  if (!hasWindow()) return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && typeof document !== 'undefined' && navigator.maxTouchPoints > 1;
}

/** True when the app is running from the Home Screen / installed, not a browser tab. */
export function isInstalledApp() {
  if (!hasWindow()) return false;
  if (navigator.standalone === true) return true; // iOS Safari's own flag
  try {
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

/**
 * Everything the UI needs to decide what to render — one call, no exceptions.
 * Returns { supported, blocked, permission, needsHomeScreen, note }.
 *   supported       — the browser can do web push here and now
 *   needsHomeScreen — iPhone/iPad in a normal Safari tab: push only works once
 *                     the site is added to the Home Screen (iOS 16.4+)
 *   blocked         — the member said "Don't allow"; only they can undo it
 */
export function readPushEnvironment() {
  if (!hasWindow()) {
    return { supported: false, blocked: false, permission: 'default', needsHomeScreen: false, note: '' };
  }
  const permission =
    typeof Notification !== 'undefined' && Notification.permission ? Notification.permission : 'default';
  const apiPresent =
    'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';

  if (isApplePhone() && !isInstalledApp()) {
    return {
      supported: false,
      blocked: false,
      permission,
      needsHomeScreen: true,
      note: 'On iPhone and iPad, notifications only work once the app is on your Home Screen.',
    };
  }
  if (!apiPresent) {
    return {
      supported: false,
      blocked: false,
      permission,
      needsHomeScreen: false,
      note: 'This browser cannot do notifications. Try Chrome, Edge, or Safari on a Mac.',
    };
  }
  if (!window.isSecureContext) {
    return {
      supported: false,
      blocked: false,
      permission,
      needsHomeScreen: false,
      note: 'Notifications need a secure (https) connection.',
    };
  }
  return {
    supported: true,
    blocked: permission === 'denied',
    permission,
    needsHomeScreen: false,
    note: '',
  };
}

/** Register the service worker and wait until it is actually ready. */
export async function readyPushWorker() {
  if (!hasWindow() || !('serviceWorker' in navigator)) return null;
  try {
    await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** Is THIS browser currently subscribed? Cheap, no permission prompt. */
export async function readPushSubscribed() {
  const env = readPushEnvironment();
  if (!env.supported) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

async function storeSubscription(sub, userId) {
  const row = {
    user_id: userId,
    endpoint: sub.endpoint,
    sub: JSON.parse(JSON.stringify(sub)), // PushSubscription → plain JSON
  };
  // supabase-js v2 sends Prefer: return=minimal unless .select() is chained, so
  // this needs INSERT + UPDATE rights only — the table has no SELECT policy.
  return supabase.from(TABLE).upsert(row, { onConflict: 'endpoint' });
}

/* ── the two actions the UI calls ─────────────────────────────────────────── */

/**
 * Turn notifications ON for this browser.
 * @returns {Promise<{ok:boolean, reason?:string, message:string}>}
 *   reason: 'unsupported' | 'ios-homescreen' | 'denied' | 'dismissed' |
 *           'no-session' | 'sw-failed' | 'subscribe-failed' | 'save-failed'
 */
export async function turnPushOn(userId) {
  const env = readPushEnvironment();
  if (env.needsHomeScreen) {
    return { ok: false, reason: 'ios-homescreen', message: env.note };
  }
  if (!env.supported) {
    return { ok: false, reason: 'unsupported', message: env.note || 'Notifications are not available here.' };
  }
  if (!userId) {
    return { ok: false, reason: 'no-session', message: 'Sign in first, then turn notifications on.' };
  }

  // Permission. 'denied' can only be undone by the member in browser settings.
  let permission = Notification.permission;
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = 'denied';
    }
  }
  if (permission === 'denied') {
    return {
      ok: false,
      reason: 'denied',
      message: 'Notifications are blocked for this site. Allow them in your browser settings, then try again.',
    };
  }
  if (permission !== 'granted') {
    return { ok: false, reason: 'dismissed', message: 'No problem — you can turn this on any time.' };
  }

  const reg = await readyPushWorker();
  if (!reg) {
    return { ok: false, reason: 'sw-failed', message: "Couldn't start the notification service. Reload and try again." };
  }

  let sub;
  try {
    sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY),
      });
    }
  } catch {
    return { ok: false, reason: 'subscribe-failed', message: "Couldn't set up notifications on this device." };
  }

  let { error } = await storeSubscription(sub, userId);

  // Shared browser: this endpoint may already be filed under a DIFFERENT member,
  // and RLS refuses to let one member overwrite another's row. Drop the stale
  // subscription, mint a fresh endpoint, and save that instead.
  if (error) {
    try {
      await sub.unsubscribe();
      const fresh = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY),
      });
      ({ error } = await storeSubscription(fresh, userId));
    } catch {
      /* fall through to the error below */
    }
  }
  if (error) {
    return { ok: false, reason: 'save-failed', message: "Couldn't save your preference. Check your connection and try again." };
  }

  return { ok: true, message: "You're in. We'll ping you when something new drops." };
}

/** Turn notifications OFF for this browser (and remove its row). */
export async function turnPushOff(userId) {
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      if (userId) {
        await supabase.from(TABLE).delete().eq('endpoint', endpoint).eq('user_id', userId);
      }
    }
    return { ok: true, message: 'Notifications are off.' };
  } catch {
    return { ok: false, reason: 'unsubscribe-failed', message: "Couldn't turn them off. Reload and try again." };
  }
}
