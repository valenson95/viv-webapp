/* ══════════════════════════════════════════════════════════════════════════
   PushSettings — the "Notifications (beta)" card for the Settings page.

   Self-contained: pass it the session and it handles everything else. It
   borrows the Settings sheet's `.card` / `.cardtitle` / `.carddesc` classes
   when mounted there (so it blends), and carries its own scoped CSS for the
   toggle so it still looks right anywhere else. All colour comes from theme
   tokens (var(--…)), so light and dark both work with no extra code.

   Every browser API call lives behind src/push.js — this file only renders.
   ══════════════════════════════════════════════════════════════════════════ */

import React, { useEffect, useState } from 'react';
import { readPushEnvironment, readPushSubscribed, turnPushOn, turnPushOff } from './push';

const PUSH_CSS = `
.vivpush{display:flex; flex-direction:column; gap:14px}
.vivpush .pushrow{display:flex; align-items:center; gap:16px; flex-wrap:wrap}
.vivpush .pushrow>div:first-child{flex:1; min-width:180px}
.vivpush .pushstate{font-size:0.75rem; font-weight:500; color:var(--muted); margin-top:3px}
.vivpush .pushstate.on{color:var(--green)}
.vivpush .pushstate.off{color:var(--faint)}
.vivpush .pushstate.warn{color:var(--orange)}
.vivpush .sw{position:relative; width:46px; height:27px; flex:0 0 auto; border-radius:999px;
  border:1px solid var(--w14); background:var(--w06); cursor:pointer; padding:0;
  transition:background .18s var(--ease), border-color .18s var(--ease), opacity .18s}
.vivpush .sw:disabled{opacity:0.45; cursor:not-allowed}
.vivpush .sw .knob{position:absolute; top:2px; left:2px; width:21px; height:21px; border-radius:999px;
  background:var(--white); opacity:0.62; transition:transform .18s var(--ease), opacity .18s var(--ease)}
.vivpush .sw.on{background:var(--green); border-color:transparent}
.vivpush .sw.on .knob{transform:translateX(19px); opacity:1; background:#fff}
.vivpush .pushnote{font-size:0.75rem; line-height:1.6; color:var(--muted);
  background:var(--w03); border:1px solid var(--hair); border-radius:12px; padding:12px 14px}
.vivpush .pushnote b{color:var(--text); font-weight:600}
.vivpush .pushnote ol{margin:8px 0 0 18px; padding:0}
.vivpush .pushnote li{margin:3px 0}
.vivpush .pushmsg{font-size:0.75rem; line-height:1.55; color:var(--muted)}
.vivpush .pushmsg.bad{color:var(--red)}
.vivpush .pushmsg.good{color:var(--green)}
.vivpush .beta{display:inline-block; margin-left:8px; padding:2px 9px; border-radius:999px;
  font-size:0.6875rem; font-weight:600; letter-spacing:0; color:var(--muted);
  background:var(--w06); border:1px solid var(--hair); vertical-align:middle}
@media (prefers-reduced-motion: reduce){.vivpush .sw,.vivpush .sw .knob{transition:none}}
`;

export default function PushSettings({ session, userId: userIdProp }) {
  const userId = userIdProp || session?.user?.id || null;

  const [env, setEnv] = useState(() => ({
    supported: false,
    blocked: false,
    permission: 'default',
    needsHomeScreen: false,
    note: '',
  }));
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgKind, setMsgKind] = useState('');

  // Read the environment AFTER mount — never during render, never at import.
  useEffect(() => {
    let alive = true;
    setEnv(readPushEnvironment());
    readPushSubscribed().then((v) => {
      if (alive) setOn(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  const say = (text, kind) => {
    setMsg(text || '');
    setMsgKind(kind || '');
  };

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    say('');
    const res = on ? await turnPushOff(userId) : await turnPushOn(userId);
    setEnv(readPushEnvironment());
    if (res.ok) {
      setOn(!on);
      say(res.message, 'good');
    } else {
      setOn(await readPushSubscribed());
      say(res.message, res.reason === 'dismissed' ? '' : 'bad');
    }
    setBusy(false);
  };

  const stateLabel = () => {
    if (env.needsHomeScreen) return { text: 'Add to Home Screen first', cls: 'warn' };
    if (!env.supported) return { text: 'Not available in this browser', cls: 'off' };
    if (env.blocked) return { text: 'Blocked in your browser settings', cls: 'warn' };
    if (on) return { text: 'On for this device', cls: 'on' };
    return { text: 'Off', cls: 'off' };
  };
  const state = stateLabel();
  const canToggle = env.supported && !busy && !!userId && (on || !env.blocked);

  return (
    <div className="card vivpush">
      <style dangerouslySetInnerHTML={{ __html: PUSH_CSS }} />

      <div className="pushrow">
        <div>
          <div className="cardtitle" style={{ fontSize: '1rem' }}>
            Notifications<span className="beta">beta</span>
          </div>
          <div className="carddesc">
            Get a ping when new setups, updates or announcements drop. You can turn this off anytime.
          </div>
          <div className={'pushstate ' + state.cls}>{state.text}</div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Turn notifications on or off"
          className={'sw' + (on ? ' on' : '')}
          disabled={!canToggle}
          onClick={toggle}
        >
          <span className="knob" />
        </button>
      </div>

      {/* iPhone / iPad: web push only reaches an app that lives on the Home Screen. */}
      {env.needsHomeScreen && (
        <div className="pushnote">
          <b>On iPhone or iPad?</b> Apple only sends notifications to apps saved on your Home Screen. Takes ten seconds:
          <ol>
            <li>Tap the Share button in Safari (the square with the arrow).</li>
            <li>Choose <b>Add to Home Screen</b>.</li>
            <li>Open VIV from that new icon, then come back here and switch this on.</li>
          </ol>
        </div>
      )}

      {env.blocked && !env.needsHomeScreen && (
        <div className="pushnote">
          <b>Your browser is blocking us.</b> Tap the lock icon in the address bar, set Notifications to
          <b> Allow</b>, then switch this on again.
        </div>
      )}

      {!env.supported && !env.needsHomeScreen && !env.blocked && env.note && (
        <div className="pushnote">{env.note}</div>
      )}

      {!userId && env.supported && <div className="pushmsg">Sign in to turn notifications on.</div>}

      {msg && <div className={'pushmsg ' + msgKind}>{msg}</div>}
    </div>
  );
}

export { PushSettings };
