/* ══════════════════════════════════════════════════════════════════════════
   PushNudge — the "default everyone to notifications" answer (Valen 2026-08-08).

   A browser cannot be force-subscribed: push permission is a per-device grant
   the member must tap themselves. This is the closest legal thing — every
   signed-in member who has NOT enabled notifications sees a one-time bottom
   banner; one tap runs the same turnPushOn flow as the Settings card.

   Behaviour rules:
   • Never shown when already subscribed, permission denied, or push unsupported
     (iPhone Safari tab gets the Home-Screen wording instead of a dead button).
   • "Not now" snoozes it for 14 days per device (localStorage), an enable hides
     it forever (subscription check wins on every mount).
   • Appears 5s after load so it never competes with first paint; z-index 400
     (toast layer) — under every overlay/modal in the ladder.
   ══════════════════════════════════════════════════════════════════════════ */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { readPushEnvironment, readPushSubscribed, turnPushOn } from './push';

const SNOOZE_KEY = 'viv-push-nudge';
const SNOOZE_DAYS = 14;

const NUDGE_CSS = `
.vivnudge{position:fixed; left:50%; bottom:22px; transform:translateX(-50%); z-index:400;
  display:flex; align-items:center; gap:14px; max-width:min(92vw,560px);
  padding:13px 16px 13px 18px; border-radius:16px;
  background:color-mix(in srgb, var(--bg) 82%, #c9982a 18%);
  border:1px solid var(--borderGold); box-shadow:0 12px 38px rgba(0,0,0,0.45);
  backdrop-filter:blur(14px); -webkit-backdrop-filter:blur(14px);
  animation:vivnudgeIn .35s var(--ease)}
@keyframes vivnudgeIn{from{opacity:0; transform:translate(-50%,14px)}to{opacity:1; transform:translate(-50%,0)}}
@media (prefers-reduced-motion: reduce){.vivnudge{animation:none}}
.vivnudge .nbell{font-size:1.1rem; flex:0 0 auto}
.vivnudge .ntext{flex:1; min-width:0; font-size:0.78rem; line-height:1.5; color:var(--text); font-weight:500}
.vivnudge .ntext b{font-weight:700; color:var(--white)}
.vivnudge .nbtn{flex:0 0 auto; font-family:inherit; font-size:0.75rem; font-weight:700; cursor:pointer;
  border-radius:10px; padding:8px 14px; white-space:nowrap;
  background:var(--goldBright); color:#1a1206; border:none}
.vivnudge .nbtn:disabled{opacity:0.55; cursor:wait}
.vivnudge .nskip{flex:0 0 auto; font-family:inherit; font-size:0.75rem; font-weight:600; cursor:pointer;
  background:transparent; border:none; color:var(--muted); padding:8px 4px; white-space:nowrap}
@media (max-width:600px){.vivnudge{bottom:76px; flex-wrap:wrap; gap:10px}
  .vivnudge .ntext{flex-basis:100%}}
`;

export default function PushNudge({ session }) {
  const [show, setShow] = useState(false);
  const [env] = useState(() => readPushEnvironment());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!session?.user?.id) return;
    if (!env.supported && !env.needsHomeScreen) return;   // browser can't do push at all
    if (env.blocked) return;                              // they said no — respect it
    try {
      const raw = localStorage.getItem(SNOOZE_KEY);
      if (raw) {
        const t = Number(JSON.parse(raw)?.dismissedAt);
        if (Number.isFinite(t) && Date.now() - t < SNOOZE_DAYS * 864e5) return;
      }
    } catch { }
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const subbed = env.supported ? await readPushSubscribed() : false;
        if (alive && !subbed) setShow(true);
      } catch { if (alive && env.needsHomeScreen) setShow(true); }
    }, 5000);
    return () => { alive = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  if (!show) return null;

  const dismiss = () => {
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify({ dismissedAt: Date.now() })); } catch { }
    setShow(false);
  };
  const enable = async () => {
    setBusy(true); setMsg('');
    try {
      await turnPushOn(session.user.id);
      setShow(false);
    } catch (e) {
      setMsg('Could not enable — you can turn it on anytime in Settings → Notifications.');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="vivnudge" role="status">
      <style>{NUDGE_CSS}</style>
      <span className="nbell">🔔</span>
      <span className="ntext">
        {env.needsHomeScreen
          ? <><b>Get trade alerts on this iPhone.</b> Add the app to your Home Screen (Share → Add to Home Screen), open it from there, then turn on notifications in Settings.</>
          : msg
            ? msg
            : <><b>Never miss a live trade update.</b> Get a ping when something drops — trade moves, new setups, announcements. You can switch it off anytime.</>}
      </span>
      {!env.needsHomeScreen && <button type="button" className="nbtn" onClick={enable} disabled={busy}>{busy ? 'Enabling…' : 'Turn on'}</button>}
      <button type="button" className="nskip" onClick={dismiss}>Not now</button>
    </div>,
    document.body
  );
}
