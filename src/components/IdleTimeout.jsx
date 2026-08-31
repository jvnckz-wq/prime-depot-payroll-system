'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Btn, Modal } from './ui.jsx';
import { F_BODY, T } from '../theme';

// Auto sign-out after a period of inactivity. Payroll is sensitive data, so a
// machine left unattended must not stay signed in. There is deliberately NO
// "stay signed in" grace: the moment the idle limit is reached the server
// session is destroyed, and a notice explains what happened. Nothing can be
// clicked to resume without signing in again — so there is no window an
// onlooker could use to keep the session alive.
const IDLE_MS = 15 * 60 * 1000; // idle allowed before automatic sign-out
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];

export function IdleTimeout({ enabled, onExit }) {
  // `expired` shows the notice; once true the session is already gone.
  const [expired, setExpired] = useState(false);
  const timer = useRef(null);
  const lastArm = useRef(0);
  const expiredRef = useRef(false);
  useEffect(() => { expiredRef.current = expired; }, [expired]);
  // Latest onExit through a ref, so the shell re-rendering never re-arms the clock.
  const onExitRef = useRef(onExit);
  useEffect(() => { onExitRef.current = onExit; }, [onExit]);

  useEffect(() => {
    if (!enabled) return undefined;

    const onIdle = async () => {
      setExpired(true);
      // End the real session on the server right away — the notice is only an
      // explanation, not a gate.
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch { /* sign out locally regardless */ }
    };

    const arm = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(onIdle, IDLE_MS);
    };

    const onActivity = () => {
      if (expiredRef.current) return; // already signed out — ignore
      const now = Date.now();
      if (now - lastArm.current < 1000) return; // re-arm at most once a second
      lastArm.current = now;
      arm();
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    arm();

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      clearTimeout(timer.current);
    };
    // onExit is read through a ref, so only `enabled` needs to re-arm this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const backToSignIn = () => {
    setExpired(false);
    if (onExitRef.current) onExitRef.current();
  };

  if (!enabled || !expired) return null;
  return (
    <Modal open onClose={backToSignIn} title="Signed out for security" width={400}>
      <div className="text-sm" style={{ fontFamily: F_BODY, color: T.ink, lineHeight: 1.6 }}>
        You were inactive for a while, so you have been signed out automatically to keep
        this account and its payroll data secure. Please sign in again to continue.
      </div>
      <div className="mt-4">
        <Btn full onClick={backToSignIn}>Back to sign in</Btn>
      </div>
    </Modal>
  );
}
